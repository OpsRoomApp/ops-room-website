"""
OPS ROOM Admin API -- NOTAM serving endpoints (database-backed).

Serves the server-side NOTAM store (notam_db.py) to the desktop app, Discord
bot and Live Map. Public, read-only aviation safety data -- no authentication
on the read endpoints, matching the spirit of the public transcript viewer,
but with per-IP rate limiting mirroring the public appeal form (appeals.py).

  GET /api/v1/notams/{icao}                        -- active NOTAMs for an airport
  GET /api/v1/notams/{icao}/near?radius_nm=&lat=&lon=
                                                   -- airport + geo-radius NOTAMs
  GET /api/v1/notams/near?latitude=&longitude=&radius_nm=
                                                   -- active NOTAMs near a point
  GET /api/v1/notams/sync/status                   -- ingest health (admin JWT)

Rows mirror the desktop app's briefing row shape so the app's client can pass
them through with no re-mapping. Active means is_cancelled='N' AND the
effective window covers now -- both gates always applied.

v0.25.63: NOTAM ingest-to-DB pipeline (Phase 1).
"""

from __future__ import annotations

import logging
import math
import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

import notam_db
from auth import verify_session
from clientip import client_ip

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/notams", tags=["notams"])

# Public per-IP rate limit (mirrors appeals.py; generous for read-only data).
_rate: dict[str, list[float]] = defaultdict(list)
_RATE_MAX = 60
_RATE_WINDOW = 60.0

_ICAO_RE = None


def _check_rate(ip: str) -> bool:
    now = time.time()
    window = now - _RATE_WINDOW
    _rate[ip] = [t for t in _rate[ip] if t > window]
    if len(_rate[ip]) >= _RATE_MAX:
        return False
    _rate[ip].append(now)
    return True


def _category(selection_code: str | None, text: str | None) -> str:
    """Compact copy of the desktop app's qcode categorisation so rows served
    from the DB carry the same category labels the briefing UI shows."""
    qcode = str(selection_code or "").upper()
    upper = str(text or "").upper()
    if qcode.startswith("QOB") or any(word in upper for word in ("CRANE", "OBST", "WIND TURBINE")):
        return "Obstacles"
    if qcode.startswith("QMR"):
        return "Runways"
    if qcode.startswith("QPI"):
        return "Approach procedures"
    if qcode.startswith(("QIC", "QCA")):
        return "Airport surface"
    if qcode.startswith(("QNV", "QNA")):
        return "Navigation aids"
    if qcode.startswith(("QRT", "QTT", "QW")) or any(word in upper for word in ("DANGER AREA", "RESTRICTED AREA", "AIRSPACE")):
        return "Airspace"
    return "General"


def _row_to_notam(row) -> dict[str, Any]:
    """Map a DB row into the desktop app's briefing row shape."""
    lat = row["lat"]
    lon = row["lon"]
    coordinates = None
    if lat is not None and lon is not None:
        try:
            coordinates = [float(lat), float(lon)]
        except (TypeError, ValueError):
            coordinates = None
    selection = str(row["number"] or "")
    text = str(row["text"] or "")
    ident = str(row["identifier"] or "") or (str(row["number"] or "") + (f"/{str(row['year'] or '')[-2:]}" if row["year"] else "")) or "NOTAM"
    permanent = str(row["effective_end"] or "").upper() == "PERM"
    return {
        "id": ident,
        "nms_id": str(row["nms_id"] or ""),
        "scope_key": "enroute",
        "scope": f"En route / FIR · {str(row['icao_location'] or '')}",
        "location": str(row["icao_location"] or row["location"] or "").upper(),
        "location_name": "",
        "category": _category(row["qcode"] if "qcode" in row.keys() else "", text),
        "status": str(row["notam_type"] or ""),
        "qcode": str(row["qcode"] if "qcode" in row.keys() else ""),
        "classification": str(row["classification"] or ""),
        "effective_utc": row["effective_start"] or None,
        "expires_utc": None if permanent else (row["effective_end"] or None),
        "permanent": permanent,
        "text": (text[:12000]) or (str(row["icao_message"] or "")[:12000]) or "No NOTAM text was returned.",
        "raw": str(row["icao_message"] or "")[:16000] or text[:16000],
        "coordinates": coordinates,
        "lower_limit": row["lower_limit"] or "",
        "upper_limit": row["upper_limit"] or "",
        "radius": str(row["radius_nm"] or ""),
        "is_cancelled": str(row["is_cancelled"] or "N"),
        "source": "FAA NMS",
    }


def _valid_icao(icao: str) -> bool:
    return len(icao) == 4 and icao.isalpha()


# Route order matters: /sync/status and /near are declared before /{icao}.


@router.get("/sync/status")
async def notam_sync_status(_session: dict = Depends(verify_session)) -> JSONResponse:
    """Ingest health for the admin panel: last bulk/incremental pull, row
    count, and the last sync error if one is set. Admin-authenticated."""
    try:
        summary = notam_db.sync_summary()
    except Exception as exc:
        _log.warning("NOTAM sync status unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="NOTAM database unavailable")
    return JSONResponse(status_code=200, content={"ok": True, **summary})


@router.get("/near")
async def notam_near(
    request: Request,
    latitude: float = Query(default=None),
    longitude: float = Query(default=None),
    radius_nm: float = Query(default=25),
) -> JSONResponse:
    """Active NOTAMs with coordinates within a radius of a point -- used by
    the Live Map layer, the RAAS cross-reference and geo lookups."""
    ip = client_ip(request)
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    if latitude is None or longitude is None:
        raise HTTPException(status_code=400, detail="latitude and longitude are required")
    radius_nm = max(1.0, min(float(radius_nm or 25), 200.0))
    try:
        rows = notam_db.get_near(float(latitude), float(longitude), radius_nm)
    except Exception as exc:
        _log.warning("NOTAM near query failed: %s", exc)
        raise HTTPException(status_code=503, detail="NOTAM database unavailable")
    notams = [_row_to_notam(r) for r in rows]
    return JSONResponse(status_code=200, content={"ok": True, "source": "FAA NMS DB", "count": len(notams), "notams": notams})


@router.get("/{icao}/near")
async def notam_icao_near(
    icao: str,
    request: Request,
    radius_nm: float = Query(default=25),
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
) -> JSONResponse:
    """Active NOTAMs for an airport, optionally widened to a geo-radius around
    the provided coordinates (the airport reference point)."""
    icao = str(icao or "").strip().upper()
    if not _valid_icao(icao):
        raise HTTPException(status_code=400, detail="Invalid ICAO code (4 letters required)")
    ip = client_ip(request)
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    seen: dict[str, Any] = {}
    try:
        for row in notam_db.get_active_by_icao(icao):
            seen[row["nms_id"]] = row
        if latitude is not None and longitude is not None:
            for row in notam_db.get_near(float(latitude), float(longitude), max(1.0, min(float(radius_nm), 200.0))):
                seen.setdefault(row["nms_id"], row)
    except Exception as exc:
        _log.warning("NOTAM icao/near query failed: %s", exc)
        raise HTTPException(status_code=503, detail="NOTAM database unavailable")
    notams = [_row_to_notam(r) for r in seen.values()]
    notams.sort(key=lambda item: (item.get("effective_utc") or ""), reverse=True)
    return JSONResponse(status_code=200, content={"ok": True, "icao": icao, "source": "FAA NMS DB", "count": len(notams), "notams": notams})


@router.get("/{icao}")
async def notam_by_icao(icao: str, request: Request) -> JSONResponse:
    """Active NOTAMs for an airport, served entirely from SQL."""
    icao = str(icao or "").strip().upper()
    if not _valid_icao(icao):
        raise HTTPException(status_code=400, detail="Invalid ICAO code (4 letters required)")
    ip = client_ip(request)
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    try:
        rows = notam_db.get_active_by_icao(icao)
    except Exception as exc:
        _log.warning("NOTAM icao query failed: %s", exc)
        raise HTTPException(status_code=503, detail="NOTAM database unavailable")
    notams = [_row_to_notam(r) for r in rows]
    return JSONResponse(status_code=200, content={"ok": True, "icao": icao, "source": "FAA NMS DB", "count": len(notams), "notams": notams})
