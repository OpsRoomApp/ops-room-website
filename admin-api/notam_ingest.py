"""
OPS ROOM Admin API -- FAA NMS NOTAM ingestion jobs.

Two scheduled jobs refresh the local NOTAM store (notam_db.py) from the FAA
NMS-API, on exactly the cadence the FAA onboarding grant allows:

  * Daily bulk pull  -- GET /nmsapi/v1/notams/il  (AIXM, one call per 24h).
    Per the NMS spec the initial-load file contains the complete set of
    ACTIVE NOTAMs across ALL classification types (DOMESTIC + INTERNATIONAL +
    FDC), so one pull covers everything -- there is no per-classification
    quota ambiguity. The job also marks rows absent from the snapshot as
    cancelled (keeping history for the PIREP footnote).
  * 3-minute incremental -- GET /nmsapi/v1/notams?lastUpdatedDate={cursor}
    (GeoJSON). Returns inline features for small deltas and a content path
    for large ones -- both are handled. Cancellations arrive here with a
    structured cancelationDate and are stored as is_cancelled='Y'.

The OAuth2 token flow is reused from nms.py so credentials stay in exactly
one place. The desktop app and Discord bot never call the FAA host; they
read this database via notams.py.

v0.25.63: NOTAM ingest-to-DB pipeline (Phase 1).
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
import time
import zlib
from datetime import datetime, timedelta, timezone
from typing import Any
from xml.etree import ElementTree

import httpx

import nms
import notam_db

_log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────

_ENABLED = os.getenv("NMS_INGEST_ENABLED", "1").strip().lower() in ("1", "true", "yes", "on")
# Optional single classification for the incremental pull (leave empty for all).
_INCREMENTAL_CLASSIFICATION = os.getenv("NOTAM_CLASSIFICATION", "").strip().upper()
_INC_INTERVAL_SECONDS = float(os.getenv("NMS_INCREMENTAL_INTERVAL", "180"))
_BULK_INTERVAL_HOURS = float(os.getenv("NMS_BULK_INTERVAL_HOURS", "24"))
# The API caps the lastUpdatedDate lookback at 24h -- beyond that a gap cannot
# be recovered incrementally and an early bulk pull is required instead.
_MAX_CURSOR_AGE_HOURS = 23.0

# A bulk pull already happened within this window -- enough to treat the store
# as fully resynced, so the incremental path must NOT fire a second bulk pull
# (the FAA grant allows ONE initial-load pull per 24h).
_BULK_FRESH_WINDOW_HOURS = 23.0

# Second line of quota defense: track the last bulk ATTEMPT (success OR
# failure) so a failed scheduled bulk cannot be followed by the incremental
# resync firing a second /notams/il in the same tick, and so the loop itself
# retries a failing bulk with a backoff instead of hammering the shared
# federal key every tick.
_BULK_ATTEMPT_GUARD_SECONDS = 30 * 60.0  # incremental-resync cooldown
_BULK_RETRY_BACKOFF_SECONDS = 15 * 60.0  # loop retry backoff on failure
_last_bulk_attempt_at = 0.0

# Cancellation markers: the FAA feed does not always populate the structured
# cancelationDate (the staging feed shows "NOTAM CANCELLED" in the text), so
# the text is consulted as a fallback -- never the sole signal.
_CANCELLED_RE = re.compile(r"\bCANCELL?ED\b", re.IGNORECASE)

_UPSTREAM_TIMEOUT = 90.0
_CURSOR_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _now() -> str:
    return datetime.now(timezone.utc).strftime(_CURSOR_FORMAT)


def _parse_dt(value: Any) -> str:
    """Normalise an FAA timestamp into the canonical ``%Y-%m-%dT%H:%M:%SZ`` form.

    Accepts ISO-8601 (with/without fractional seconds / Z) and the AIXM
    compact form used by the initial-load file (``YYYYMMDDHHMM``)."""
    if not value:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    # AIXM compact form: 202508210234
    if re.fullmatch(r"\d{12}", text):
        try:
            return datetime.strptime(text, "%Y%m%d%H%M").replace(tzinfo=timezone.utc).strftime(_CURSOR_FORMAT)
        except ValueError:
            return text
    normalized = text.replace("Z", "").replace("z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(normalized, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).strftime(_CURSOR_FORMAT)
        except ValueError:
            continue
    return text[:23]  # keep as-is when unrecognised


# ── AIXM initial-load parsing ──────────────────────────────────────────────


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text_cancelled(text: Any) -> bool:
    """True when the NOTAM text itself declares a cancellation (e.g. the
    staging feed's ``NOTAM CANCELLED`` suffix). Fallback signal only -- the
    structured ``cancelationDate`` field remains authoritative."""
    return bool(text) and bool(_CANCELLED_RE.search(str(text)))


def _children(elem: ElementTree.Element, local_name: str) -> list[ElementTree.Element]:
    return [child for child in elem if _local(child.tag) == local_name]


def _child(elem: ElementTree.Element, local_name: str) -> ElementTree.Element | None:
    for child in elem:
        if _local(child.tag) == local_name:
            return child
    return None


def _text(elem: ElementTree.Element | None, local_name: str = "") -> str:
    if elem is None:
        return ""
    if local_name:
        target = _child(elem, local_name)
        if target is None:
            # Some fields live one level deeper (e.g. NOTAMTranslation).
            for child in elem.iter():
                if _local(child.tag) == local_name:
                    target = child
                    break
        elem = target
    if elem is None:
        return ""
    return " ".join((elem.text or "").split()).strip()


def _msg_id(elem: ElementTree.Element) -> str:
    """Extract the 16-digit NMS id from an AIXMBasicMessage gml:id.

    ElementTree does not expand namespace prefixes on attribute names, so the
    attribute arrives as literal ``gml:id`` -- match by local name instead.
    """
    for key, value in elem.attrib.items():
        if key.rsplit("}", 1)[-1] == "id":
            match = re.search(r"\d{16}", value)
            if match:
                return match.group(0)
    return ""


def _parse_aixm_message(msg: ElementTree.Element, bulk_batch: str) -> dict[str, Any] | None:
    """Convert one AIXMBasicMessage (an initial-load event) into a DB row.

    Structure: hasMember -> event:Event -> timeSlice -> EventTimeSlice ->
    textNOTAM/NOTAM {number, year, type, issued, location, effectiveStart,
    effectiveEnd, text} + translation/simpleText + fnse extension
    {classification, accountId, airportname, lastUpdated, icaoLocation}."""
    nms_id = _msg_id(msg)
    event_ts = None
    for elem in msg.iter():
        if _local(elem.tag) == "EventTimeSlice":
            event_ts = elem
            break
    if event_ts is None:
        return None

    notam_el = _child(event_ts, "textNOTAM")
    if notam_el is not None:
        notam_el = _child(notam_el, "NOTAM")
    if notam_el is None:
        return None

    number = _text(notam_el, "number")
    year = _text(notam_el, "year")
    notam_type = _text(notam_el, "type")
    location = _text(notam_el, "location").upper()
    text = _text(notam_el, "text")
    effective_start = _parse_dt(_text(notam_el, "effectiveStart"))
    effective_end_raw = _text(notam_el, "effectiveEnd")
    effective_end = _parse_dt(effective_end_raw)
    if not effective_end and effective_end_raw.upper() == "PERM":
        effective_end = "PERM"

    # LOCAL_FORMAT translation is the closest thing to an ICAO message in the
    # AIXM load (e.g. "!STL 08/430 8WC RWY 20 RWY END ID LGT U/S ...").
    icao_message = ""
    for translation in _children(notam_el, "translation"):
        inner = _child(translation, "NOTAMTranslation")
        if inner is not None:
            simple = _text(inner, "simpleText")
            if simple:
                icao_message = simple
                break

    classification = ""
    icao_location = ""
    last_updated = ""
    for ext in event_ts.iter():
        if _local(ext.tag) == "EventExtension":
            classification = _text(ext, "classification").upper()
            icao_location = _text(ext, "icaoLocation").upper()
            last_updated = _parse_dt(_text(ext, "lastUpdated"))
            break

    if not icao_location:
        icao_location = location
    if not nms_id:
        nms_id = f"IL-{icao_location}-{number}{year}"

    ident = f"{number}/{year[-2:]}" if (number and year and "/" not in number) else (number or icao_message)

    return {
        "nms_id": nms_id,
        "identifier": ident,
        "icao_location": icao_location,
        "location": location,
        "number": number,
        "series": "",
        "year": year,
        "classification": classification,
        "qcode": "",  # AIXM initial load carries no structured q-code line.
        "notam_type": notam_type,
        "text": text,
        "icao_message": icao_message,
        "effective_start": effective_start,
        "effective_end": effective_end,
        "cancelation_date": "",
        "is_cancelled": "Y" if _text_cancelled(text) else "N",
        "last_updated": last_updated or _parse_dt(_text(notam_el, "issued")),
        "bulk_batch": bulk_batch,
    }


class _StreamingDecompressor(io.RawIOBase):
    """File-like that incrementally decompresses a gzip/zlib blob.

    ElementTree.iterparse reads from this stream chunk by chunk, so the
    initial-load payload (the complete worldwide ACTIVE set -- hundreds of MB
    when decompressed) is NEVER materialized in memory as one giant string.
    On the 2GB production VPS the old ``decompress-then-decode`` path spiked
    uvicorn past 780MB RSS and the kernel OOM-killed it mid-pull; streaming
    keeps peak memory at ~compressed size + a small window.
    """

    def __init__(self, data: bytes, wbits: int):
        self._decompressor = zlib.decompressobj(wbits)
        self._data = data
        self._offset = 0
        self._pending = b""
        self._eof = False

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        want = size if size and size > 0 else 65536
        while len(self._pending) < want and not self._eof:
            raw = self._data[self._offset : self._offset + 32768]
            self._offset += 32768
            if not raw:
                try:
                    self._pending += self._decompressor.flush()
                except zlib.error:
                    pass
                self._eof = True
                break
            try:
                self._pending += self._decompressor.decompress(raw)
            except zlib.error:
                # Malformed or truncated stream -- stop feeding; the parse
                # loop raises zlib.error to trigger the raw-zlib retry.
                self._eof = True
                break
        out = self._pending[:want]
        self._pending = self._pending[want:]
        return out


def _parse_aixm_blob(text: str, bulk_batch: str) -> list[dict[str, Any]]:
    """Convenience wrapper for tests: parse a full XML string into rows."""
    return list(_iter_aixm_rows(io.StringIO(text), bulk_batch))


def _iter_aixm_rows(stream, bulk_batch: str):
    """Generator over AIXMBasicMessage rows read from an open file-like
    stream (StringIO for tests, _StreamingDecompressor for the bulk pull).

    Letting the caller consume rows one at a time (and batch the upserts)
    keeps peak memory bounded on small VPS hosts -- the initial load is the
    complete worldwide ACTIVE set and can reach tens of thousands of NOTAMs.
    """
    try:
        root: ElementTree.Element | None = None
        context = ElementTree.iterparse(stream, events=("start", "end"))
        for event, elem in context:
            if event == "start":
                if root is None:
                    root = elem
                continue
            if _local(elem.tag) != "AIXMBasicMessage":
                continue
            try:
                row = _parse_aixm_message(elem, bulk_batch)
                if row:
                    yield row
            except Exception as exc:  # one bad message must not kill the load
                _log.warning("AIXM message skipped: %s", exc)
            if root is not None:
                root.clear()
    except zlib.error:
        raise  # format retry handled by the caller
    except Exception as exc:
        _log.warning("AIXM parse error (partial load kept): %s", exc)


# ── GeoJSON incremental parsing ────────────────────────────────────────────


def _feature_to_row(feature: dict[str, Any]) -> dict[str, Any]:
    """Convert one incremental GeoJSON feature into a DB row.

    Field mapping matches the desktop app's nms_client normalizer so rows
    served from the DB keep the same shape the briefing UI already consumes.
    ``cancelationDate`` (structured) drives is_cancelled -- never text parsing.
    """
    properties = feature.get("properties") if isinstance(feature, dict) else {}
    core = properties.get("coreNOTAMData") if isinstance(properties, dict) else {}
    notam = core.get("notam") if isinstance(core, dict) else {}
    if not isinstance(notam, dict):
        notam = {}

    def s(value: Any, default: str = "") -> str:
        if value is None:
            return default
        if isinstance(value, (dict, list)):
            return default
        return str(value).strip()

    number = s(notam.get("number"))
    series = s(notam.get("series"))
    ident = number or (f"{series}{number}" if series and number else "") or s(notam.get("id")).upper()
    location = s(notam.get("icaoLocation") or notam.get("location")).upper()
    text = s(notam.get("text"))
    icao_message = ""
    for translation in core.get("notamTranslation") or []:
        if isinstance(translation, dict) and s(translation.get("type")).upper() == "ICAO":
            icao_message = s(translation.get("icao_message"))
            break

    lat = lon = None
    coords: list[float] | None = None
    geometry = feature.get("geometry") if isinstance(feature, dict) else None
    if isinstance(geometry, dict):
        gtype = geometry.get("type")
        if gtype == "Point":
            raw = geometry.get("coordinates")
            if isinstance(raw, list) and len(raw) >= 2:
                lon, lat = float(raw[0]), float(raw[1])
                coords = [lat, lon]
        elif gtype == "GeometryCollection":
            for sub in geometry.get("geometries") or []:
                if isinstance(sub, dict) and sub.get("type") == "Point":
                    raw = sub.get("coordinates")
                    if isinstance(raw, list) and len(raw) >= 2:
                        lon, lat = float(raw[0]), float(raw[1])
                        coords = [lat, lon]
                        break

    return {
        "nms_id": s(notam.get("id")),
        "identifier": ident,
        "icao_location": location,
        "location": s(notam.get("location")).upper(),
        "number": number,
        "series": series,
        "year": s(notam.get("year")),
        "classification": s(notam.get("classification")),
        "qcode": s(notam.get("selectionCode") or notam.get("qcode")),
        "notam_type": s(notam.get("type") or notam.get("status")),
        "text": text,
        "icao_message": icao_message,
        "effective_start": _parse_dt(notam.get("effectiveStart")),
        "effective_end": "PERM" if s(notam.get("effectiveEnd")).upper() == "PERM" else _parse_dt(notam.get("effectiveEnd")),
        "cancelation_date": _parse_dt(notam.get("cancelationDate")),
        "is_cancelled": "Y" if s(notam.get("cancelationDate")) or _text_cancelled(text) else "N",
        "lower_limit": s(notam.get("lowerLimit")),
        "upper_limit": s(notam.get("upperLimit")),
        "coordinates": json.dumps(coords) if coords else "",
        "lat": lat,
        "lon": lon,
        "radius_nm": _num(notam.get("radius")),
        "geometry_json": json.dumps(geometry) if geometry else "",
        "last_updated": _parse_dt(notam.get("lastUpdated")),
    }


def _num(value: Any) -> float | None:
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def _extract_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Locate the GeoJSON feature array inside the incremental response body,
    which may be shaped as data.geojson (list or {features: [...]}) or
    data.features. Never raises: an unknown or empty shape (e.g. the FAA
    "no changes" reply) yields an empty list so a tick can never crash on a
    response it does not recognise."""
    if not isinstance(payload, dict):
        payload = {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(data, dict):
        data = {}
    geojson = data.get("geojson")
    if geojson is None:
        geojson = data.get("features")
    if isinstance(geojson, dict):
        geojson = geojson.get("features") or geojson.get("items") or []
    if not isinstance(geojson, list):
        _log.warning("NMS incremental response had no feature list (keys: %s)", sorted(str(k) for k in payload.keys()))
        return []
    return [item for item in geojson if isinstance(item, dict)]


# ── Job implementations ────────────────────────────────────────────────────


async def _content_payload(client: httpx.AsyncClient, body: dict[str, Any], token: str, raw: bool = False) -> bytes | None:
    """If the response carries a content path (large result sets), fetch it
    and return the body. ``raw=True`` returns the compressed bytes unchanged
    (for streaming decompression); otherwise the blob is decompressed here
    (gzip, then raw zlib). Returns None for the inline path."""
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    content_url = str(data.get("url") or "").strip()
    if not content_url:
        return None
    base = nms._upstream_base()
    if content_url.startswith("/"):
        content_url = f"{base}{content_url}"
    try:
        resp = await client.get(content_url, headers={"Authorization": f"Bearer {token}"}, timeout=_UPSTREAM_TIMEOUT, follow_redirects=True)
    except Exception as exc:
        _log.warning("NMS content fetch failed: %s", exc)
        return None
    if resp.status_code != 200:
        _log.warning("NMS content fetch returned HTTP %s", resp.status_code)
        return None
    raw = resp.content or b""
    if raw:
        return raw
    try:
        return zlib.decompress(raw, zlib.MAX_WBITS | 32)  # gzip
    except zlib.error:
        try:
            return zlib.decompress(raw)
        except zlib.error:
            return raw


async def run_bulk_pull() -> bool:
    """Daily initial-load pull (AIXM, all classifications) into the store.

    Returns True on success. The 24h schedule lives in _ingest_loop, keyed on
    notam_sync_state.last_bulk_pull_at, so a restart never triggers an early
    re-pull. The attempt timestamp is recorded BEFORE the HTTP call so a
    failure still counts towards the quota-attempt guard."""
    global _last_bulk_attempt_at
    _last_bulk_attempt_at = time.time()
    if not _ENABLED or not nms.NMS_CLIENT_KEY or not nms.NMS_CLIENT_SECRET:
        return False
    batch = f"bulk-{int(datetime.now(timezone.utc).timestamp())}"
    try:
        async with httpx.AsyncClient(follow_redirects=False) as client:
            token = await nms._get_upstream_token(client)
            if not token:
                notam_db.record_sync_error("Bulk pull: could not obtain NMS bearer token")
                return False
            resp = await nms._nms_get(client, "/notams/il", {"allowRedirect": "false"}, token, response_format="AIXM")
            if resp.status_code != 200:
                notam_db.record_sync_error(f"Bulk pull: initial-load returned HTTP {resp.status_code}")
                return False
            body = resp.json()
            blob = await _content_payload(client, body, token)
            if blob is None:
                notam_db.record_sync_error("Bulk pull: no content URL returned for initial load")
                return False
        # Stream the initial-load blob: iterparse reads decompressed chunks
        # directly from the compressed bytes, so the full decoded AIXM string
        # is never held in memory (it OOM-killed uvicorn on the 2GB VPS).
        # Batched upserts additionally bound the row list.
        # Try gzip first, then raw zlib. A format mismatch fails on the first
        # chunk -- either as zlib.error or (because the reader returns an empty
        # stream and iterparse bails) as zero parsed rows -- so retry the other
        # wbits in both cases.
        ingested = 0
        last_failure: Exception | None = None
        for wbits in (zlib.MAX_WBITS | 32, zlib.MAX_WBITS):  # gzip, then raw zlib
            pending: list[dict[str, Any]] = []
            ingested = 0
            try:
                for row in _iter_aixm_rows(_StreamingDecompressor(blob, wbits), batch):
                    pending.append(row)
                    if len(pending) >= 2000:
                        notam_db.upsert_notams(pending, bulk_batch=batch)
                        ingested += len(pending)
                        pending = []
                if pending:
                    notam_db.upsert_notams(pending, bulk_batch=batch)
                    ingested += len(pending)
            except zlib.error as exc:
                last_failure = exc
                continue
            if ingested > 0:
                last_failure = None
                break
            last_failure = ValueError("initial-load parsed zero NOTAMs (format mismatch or empty payload)")
        if last_failure is not None:
            notam_db.record_sync_error(f"Bulk pull: initial-load failed: {last_failure}")
            return False
        cancelled = notam_db.mark_missing_cancelled(batch)
        notam_db.sync_state_set(
            last_bulk_pull_at=notam_db.now_utc(),
            last_bulk_batch=batch,
            last_sync_error="",
            last_sync_error_at=None,
        )
        _log.info(
            "NMS bulk pull complete: %d NOTAMs ingested (%d no longer active) batch=%s",
            ingested,
            cancelled,
            batch,
        )
        return True
    except Exception as exc:
        _log.exception("NMS bulk pull failed")
        notam_db.record_sync_error(f"Bulk pull failed: {type(exc).__name__}: {exc}")
        return False


async def run_incremental_pull() -> bool:
    """3-minute incremental pull (GeoJSON, lastUpdatedDate cursor)."""
    if not _ENABLED or not nms.NMS_CLIENT_KEY or not nms.NMS_CLIENT_SECRET:
        return False
    state = notam_db.sync_state_get()
    cursor = str(state.get("last_incremental_cursor") or "").strip()
    need_bulk = False
    if not cursor:
        need_bulk = True
    else:
        try:
            cursor_dt = datetime.strptime(cursor, _CURSOR_FORMAT).replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - cursor_dt > timedelta(hours=_MAX_CURSOR_AGE_HOURS):
                need_bulk = True
        except ValueError:
            need_bulk = True
    if need_bulk:
        # QUOTA GUARD: a fresh bulk pull (the loop fires one on schedule) means
        # the store is already fully resynced -- resume incremental from that
        # timestamp instead of burning a second 24h bulk pull (FAA allows ONE
        # initial-load pull per 24h). This also covers first boot, where the
        # loop's scheduled bulk and this resync would otherwise fire twice
        # within seconds.
        last_bulk = str(state.get("last_bulk_pull_at") or "").strip()
        if last_bulk:
            try:
                last_bulk_dt = datetime.strptime(last_bulk, _CURSOR_FORMAT).replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - last_bulk_dt <= timedelta(hours=_BULK_FRESH_WINDOW_HOURS):
                    cursor = last_bulk
                    need_bulk = False
            except ValueError:
                pass
    if need_bulk and (time.time() - _last_bulk_attempt_at) < _BULK_ATTEMPT_GUARD_SECONDS:
        # A bulk pull was attempted in the last 30 minutes (the loop's
        # scheduled pull this tick, a previous tick, or this very path). Do
        # NOT fire a second initial-load request -- defer the resync and let
        # the next tick retry, so a failed scheduled bulk can never be doubled
        # up by the incremental path in the same tick.
        _log.warning("NMS bulk attempt still recent; deferring incremental resync to next tick")
        return True
    if need_bulk:
        # A gap that large (or a missing cursor) genuinely cannot be recovered
        # incrementally -- resync with a bulk pull, then resume incremental.
        _log.warning("NMS incremental cursor missing or stale; running bulk resync")
        ok = await run_bulk_pull()
        if not ok:
            notam_db.record_sync_error("Incremental: required bulk resync failed")
            return False
        state = notam_db.sync_state_get()
        cursor = str(state.get("last_bulk_pull_at") or "") or None
        if not cursor:
            cursor = (datetime.now(timezone.utc) - timedelta(minutes=5)).strftime(_CURSOR_FORMAT)

    params: dict[str, Any] = {"lastUpdatedDate": cursor, "allowRedirect": "false"}
    if _INCREMENTAL_CLASSIFICATION:
        params["classification"] = _INCREMENTAL_CLASSIFICATION
    try:
        async with httpx.AsyncClient(follow_redirects=False) as client:
            token = await nms._get_upstream_token(client)
            if not token:
                notam_db.record_sync_error("Incremental: could not obtain NMS bearer token")
                return False
            resp = await nms._nms_get(client, "/notams", params, token, response_format="GEOJSON")
            if resp.status_code != 200:
                notam_db.record_sync_error(f"Incremental: /notams returned HTTP {resp.status_code}")
                return False
            body = resp.json()
            blob = await _content_payload(client, body, token)
        if blob is not None:
            payload = json.loads(blob.decode("utf-8", errors="replace"))
        else:
            payload = body
        features = _extract_features(payload)
        rows = [_feature_to_row(f) for f in features]
        if rows:
            notam_db.upsert_notams(rows, bulk_batch=state.get("last_bulk_batch") or "")
        # Advance the cursor to the newest lastUpdated seen (not "now" -- an
        # empty batch must not move it, or we would miss changes).
        newest = ""
        for row in rows:
            updated = str(row.get("last_updated") or "")
            if updated > newest:
                newest = updated
        if not newest:
            newest = cursor
        notam_db.sync_state_set(
            last_incremental_cursor=newest,
            last_incremental_pull_at=notam_db.now_utc(),
            last_sync_error="",
            last_sync_error_at=None,
        )
        _log.info("NMS incremental pull complete: %d changes (cursor %s)", len(rows), newest)
        return True
    except Exception as exc:
        _log.exception("NMS incremental pull failed")
        notam_db.record_sync_error(f"Incremental failed: {type(exc).__name__}: {exc}")
        return False


# ── Background loop ────────────────────────────────────────────────────────


async def _ingest_loop() -> None:
    """Ticking loop -- fires each job only when its schedule is due, so a
    restart cannot cause an early re-pull. Graceful degradation: any failure
    is recorded in notam_sync_state and retried on the next tick."""
    _log.info(
        "NMS ingest loop started (enabled=%s bulk=%sh incremental=%ss)",
        _ENABLED,
        _BULK_INTERVAL_HOURS,
        int(_INC_INTERVAL_SECONDS),
    )
    while True:
        try:
            state = notam_db.sync_state_get()
            now_dt = datetime.now(timezone.utc)
            last_bulk = state.get("last_bulk_pull_at")
            bulk_due = True
            if last_bulk:
                try:
                    last_dt = datetime.strptime(str(last_bulk), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    bulk_due = (now_dt - last_dt) >= timedelta(hours=_BULK_INTERVAL_HOURS)
                except ValueError:
                    bulk_due = True
            if bulk_due and nms.NMS_CLIENT_KEY and nms.NMS_CLIENT_SECRET:
                if (time.time() - _last_bulk_attempt_at) >= _BULK_RETRY_BACKOFF_SECONDS:
                    await run_bulk_pull()
                else:
                    _log.debug("NMS bulk retry backoff active; next attempt in %.0fs", _BULK_RETRY_BACKOFF_SECONDS - (time.time() - _last_bulk_attempt_at))

            state = notam_db.sync_state_get()
            last_inc = state.get("last_incremental_pull_at")
            inc_due = True
            if last_inc:
                try:
                    last_dt = datetime.strptime(str(last_inc), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    inc_due = (now_dt - last_dt) >= timedelta(seconds=_INC_INTERVAL_SECONDS)
                except ValueError:
                    inc_due = True
            if inc_due and nms.NMS_CLIENT_KEY and nms.NMS_CLIENT_SECRET:
                await run_incremental_pull()
        except Exception as exc:
            _log.warning("NMS ingest tick failed: %s", exc)
        await asyncio.sleep(min(30.0, max(10.0, _INC_INTERVAL_SECONDS / 3.0)))


def start_ingest_task() -> None:
    """Start the background ingest loop (called from main.py startup), matching
    the transcripts.start_cleanup_task pattern."""
    try:
        notam_db.init_schema()
    except Exception as exc:
        _log.warning("NOTAM DB schema init failed: %s", exc)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_ingest_loop())
        _log.info("NMS NOTAM ingest task started")
    except RuntimeError:
        _log.warning("No running event loop -- NMS ingest task deferred")
