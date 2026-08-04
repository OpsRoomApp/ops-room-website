"""
OPS ROOM Website API -- FAA NMS-API (NOTAM) proxy.

Securely proxies requests to the FAA NOTAM Management System API using
client-credentials OAuth2, with a short in-memory cache so repeated queries
from the desktop app and the Discord bot never hammer the FAA host or burn
rate-limit quota. Credentials live ONLY in this server's environment -- the
desktop app and bot talk to opsroom.live and never see the KEY/SECRET.

Endpoints (all under /api/v1/nms/):
  GET /api/v1/nms/status              -- integration diagnostics (no secrets)
  GET /api/v1/nms/notams              -- filtered NOTAM query (GeoJSON)
  GET /api/v1/nms/checklist           -- NOTAM checklist by location
  GET /api/v1/nms/notams/{nms_id}     -- single NOTAM by 16-digit nmsId
  GET /api/v1/nms/search?text=        -- freeText exact-text search
  GET /api/v1/nms/initial-load        -- compressed initial-load snapshot

Auth for the proxy itself: a shared bearer token (NMS_API_TOKEN, falling back
to ADMIN_API_TOKEN) so the endpoint is not an open relay that lets anyone
burn the FAA quota.

Upstream environments (NMS_ENVIRONMENT: fit | staging | production):
  FIT       https://api-fit.cgifederal-aim.com
  Staging   https://api-staging.cgifederal-aim.com
  Prod      https://api-nms.aim.faa.gov

v0.25.60: NMS-API proxy integration.
"""

from __future__ import annotations

import os
import time
import logging
import zlib
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/nms", tags=["nms"])

# ── Environment / credentials ────────────────────────────────────────────
NMS_ENVIRONMENTS = {
    "fit": "https://api-fit.cgifederal-aim.com",
    "staging": "https://api-staging.cgifederal-aim.com",
    "production": "https://api-nms.aim.faa.gov",
}

NMS_CLIENT_KEY = os.environ.get("NMS_CLIENT_KEY", "").strip()
NMS_CLIENT_SECRET = os.environ.get("NMS_CLIENT_SECRET", "").strip()
NMS_ENVIRONMENT = os.environ.get("NMS_ENVIRONMENT", "staging").strip().lower()
NMS_BASE_URL = os.environ.get("NMS_BASE_URL", "").strip()
NMS_API_TOKEN = os.environ.get("NMS_API_TOKEN", "").strip() or os.environ.get("ADMIN_API_TOKEN", "").strip()

if not NMS_BASE_URL:
    NMS_BASE_URL = NMS_ENVIRONMENTS.get(NMS_ENVIRONMENT, NMS_ENVIRONMENTS["staging"])

if not NMS_CLIENT_KEY or not NMS_CLIENT_SECRET:
    _log.warning(
        "NMS credentials not configured -- set NMS_CLIENT_KEY and "
        "NMS_CLIENT_SECRET. NOTAM proxy endpoints will return 502 until "
        "credentials are provided."
    )
if not NMS_API_TOKEN:
    _log.warning(
        "NMS_API_TOKEN not configured -- the NMS proxy will reject all "
        "requests with 401 to avoid acting as an open relay."
    )

# ── Token cache: {fetched_at, expires_in, access_token} ──────────────────
_TOKEN: dict[str, Any] = {}

# ── Response cache: {key: {"at": float, "data": Any}} ────────────────────
_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL: float = 60.0  # seconds -- matches the desktop app's polling cadence

_UPSTREAM_TIMEOUT = 30.0  # NMS spec: requests time out at 30s (HTTP 408)


def _env_label() -> str:
    if os.environ.get("NMS_BASE_URL", "").strip():
        return f"override ({NMS_BASE_URL})"
    return NMS_ENVIRONMENT


def _upstream_base() -> str:
    return NMS_BASE_URL.rstrip("/")


def _require_token(authorization: str | None) -> None:
    """Gate the proxy behind the shared bearer token (not the FAA token)."""
    if not NMS_API_TOKEN:
        raise HTTPException(status_code=401, detail="NMS proxy is not configured with a shared token")
    supplied = str(authorization or "")
    if not supplied.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if supplied[7:].strip() != NMS_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid shared token")


async def _get_upstream_token(client: httpx.AsyncClient) -> str | None:
    """Fetch (or reuse) a short-lived OAuth2 bearer token from the FAA host.

    Token expiry is ~30 minutes (expires_in ~1799s). We refresh when less
    than 5 minutes remain, and always before the cached expiry passes.
    """
    now = time.time()
    cached = _TOKEN.get("access_token")
    if cached:
        expires_at = float(_TOKEN.get("expires_at") or 0)
        if expires_at - now > 300:
            return cached

    token_url = f"{_upstream_base()}/v1/auth/token"
    try:
        resp = await client.post(
            token_url,
            data={"grant_type": "client_credentials"},
            auth=(NMS_CLIENT_KEY, NMS_CLIENT_SECRET),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15.0,
        )
        if resp.status_code != 200:
            _log.warning("NMS token fetch failed: HTTP %s", resp.status_code)
            return None
        body = resp.json()
        token = body.get("access_token")
        if not token:
            _log.warning("NMS token response contained no access_token")
            return None
        try:
            expires_in = int(body.get("expires_in") or 1799)
        except (TypeError, ValueError):
            expires_in = 1799
        _TOKEN["access_token"] = token
        _TOKEN["expires_at"] = now + max(60, expires_in)
        _TOKEN["fetched_at"] = now
        return token
    except Exception:
        _log.exception("NMS token fetch raised")
        return None


def _cache_key(path: str, params: dict[str, Any]) -> str:
    ordered = ",".join(f"{k}={params[k]}" for k in sorted(params) if params[k] not in (None, ""))
    return f"{path}?{ordered}"


def _cached(key: str) -> Any | None:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry.get("at", 0) <= _CACHE_TTL:
        return entry.get("data")
    _CACHE.pop(key, None)
    return None


def _store(key: str, data: Any) -> Any:
    if len(_CACHE) > 256:
        _CACHE.clear()
    _CACHE[key] = {"at": time.time(), "data": data}
    return data


def _upstream_error(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"ok": False, "code": "NMS_UPSTREAM", "detail": detail, "environment": _env_label()},
    )


async def _nms_get(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, Any],
    token: str,
    response_format: str = "GEOJSON",
) -> httpx.Response:
    headers = {
        "Authorization": f"Bearer {token}",
        "nmsResponseFormat": response_format,
        "Accept": "application/json",
    }
    return await client.get(
        f"{_upstream_base()}/nmsapi/v1{path}",
        params={k: v for k, v in params.items() if v not in (None, "")},
        headers=headers,
        timeout=_UPSTREAM_TIMEOUT,
    )


async def _proxy_query(path: str, params: dict[str, Any]) -> JSONResponse:
    """Shared implementation for /notams and /checklist style pass-throughs."""
    key = _cache_key(path, params)
    cached = _cached(key)
    if cached is not None:
        # Preserve the stored payload but correct the flags: this IS a cache
        # hit, and the environment label must be current.
        return JSONResponse(status_code=200, content={**cached, "ok": True, "cached": True, "environment": _env_label()})

    async with httpx.AsyncClient(follow_redirects=False) as client:
        token = await _get_upstream_token(client)
        if not token:
            return _upstream_error(502, "Could not obtain an NMS bearer token (check NMS_CLIENT_KEY/SECRET).")
        try:
            resp = await _nms_get(client, path, params, token)
        except httpx.TimeoutException:
            return _upstream_error(504, "The NMS-API request timed out (upstream 30s limit).")
        except Exception as exc:
            _log.exception("NMS upstream request raised")
            return _upstream_error(502, f"NMS upstream request failed: {type(exc).__name__}")

    if resp.status_code == 401:
        _TOKEN.pop("access_token", None)  # force a token refresh on the next call
        return _upstream_error(502, "The NMS-API rejected the bearer token.")
    if resp.status_code == 408:
        return _upstream_error(504, "The NMS-API request timed out (HTTP 408).")
    if resp.status_code != 200:
        return _upstream_error(502, f"NMS-API returned HTTP {resp.status_code}.")

    try:
        body = resp.json()
    except Exception:
        return _upstream_error(502, "NMS-API returned a non-JSON response.")

    if not isinstance(body, dict):
        body = {"data": body}
    payload = {"ok": True, "cached": False, "environment": _env_label(), **body}
    _store(key, payload)
    return JSONResponse(status_code=200, content=payload)


@router.get("/status")
async def nms_status(authorization: str | None = Header(default=None)) -> dict:
    """Integration diagnostics -- never exposes credentials."""
    _require_token(authorization)
    now = time.time()
    token_age = None
    if _TOKEN.get("fetched_at"):
        token_age = max(0, int(now - float(_TOKEN["fetched_at"])))
    expires_at = _TOKEN.get("expires_at")
    return {
        "ok": True,
        "configured": bool(NMS_CLIENT_KEY and NMS_CLIENT_SECRET),
        "environment": _env_label(),
        "base_url": _upstream_base(),
        "token": {
            "cached": bool(_TOKEN.get("access_token")),
            "age_seconds": token_age,
            "expires_in_seconds": max(0, int(expires_at - now)) if expires_at else None,
        },
        "cache": {"entries": len(_CACHE), "ttl_seconds": _CACHE_TTL},
    }


@router.get("/notams")
async def nms_notams(
    request: Request,
    authorization: str | None = Header(default=None),
    location: str = "",
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    radius: float | None = Query(default=None),
    nmsId: str = "",
    notamNumber: str = "",
    classification: str = "",
    feature: str = "",
    freeText: str = "",
    accountability: str = "",
    lastUpdatedDate: str = "",
    effectiveStartDate: str = "",
    effectiveEndDate: str = "",
    allowRedirect: bool = False,
) -> JSONResponse:
    """Filtered NOTAM query. Mirrors the NMS-API /v1/notams surface."""
    _require_token(authorization)
    params = {
        "location": (location or "").strip().upper(),
        "latitude": latitude,
        "longitude": longitude,
        "radius": radius,
        "nmsId": (nmsId or "").strip(),
        "notamNumber": (notamNumber or "").strip(),
        "classification": (classification or "").strip().upper(),
        "feature": (feature or "").strip().upper(),
        "freeText": (freeText or "").strip(),
        "accountability": (accountability or "").strip().upper(),
        "lastUpdatedDate": (lastUpdatedDate or "").strip(),
        "effectiveStartDate": (effectiveStartDate or "").strip(),
        "effectiveEndDate": (effectiveEndDate or "").strip(),
        "allowRedirect": "true" if allowRedirect else None,
    }
    if not any(params.values()):
        raise HTTPException(status_code=400, detail="At least one NMS filter parameter is required (e.g. location, latitude/longitude/radius, nmsId).")
    return await _proxy_query("/notams", params)


@router.get("/checklist")
async def nms_checklist(
    authorization: str | None = Header(default=None),
    location: str = "",
    classification: str = "",
    accountability: str = "",
) -> JSONResponse:
    """NOTAM checklist for a location (index-only entries)."""
    _require_token(authorization)
    params = {
        "location": (location or "").strip().upper(),
        "classification": (classification or "").strip().upper(),
        "accountability": (accountability or "").strip().upper(),
    }
    if not any(params.values()):
        raise HTTPException(status_code=400, detail="A location is required for the NOTAM checklist.")
    return await _proxy_query("/notams/checklist", params)


@router.get("/notams/{nms_id}")
async def nms_notam_detail(nms_id: str, authorization: str | None = Header(default=None)) -> JSONResponse:
    """Fetch a single NOTAM by its 16-digit nmsId (active or inactive)."""
    _require_token(authorization)
    nms_id = str(nms_id or "").strip()
    if not nms_id or not nms_id.isdigit() or len(nms_id) != 16:
        raise HTTPException(status_code=400, detail="nmsId must be a 16-digit identifier.")
    return await _proxy_query("/notams", {"nmsId": nms_id})


@router.get("/search")
async def nms_search(text: str = "", authorization: str | None = Header(default=None)) -> JSONResponse:
    """Free-text NOTAM search (exact text, 1-80 chars per the NMS spec)."""
    _require_token(authorization)
    text = str(text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="A search text is required (1-80 characters).")
    if len(text) > 80:
        raise HTTPException(status_code=400, detail="Search text must be 80 characters or fewer.")
    return await _proxy_query("/notams", {"freeText": text})


@router.get("/initial-load")
async def nms_initial_load(authorization: str | None = Header(default=None)) -> JSONResponse:
    """Fetch the compressed initial-load snapshot server-side and re-serve it.

    The NMS-API returns a signed content URL that expires in 5 minutes. We
    fetch and decompress it here so the signed URL never leaks to clients,
    then return the AIXM payload (SOAP-wrapped) plus a NOTAM count estimate.
    """
    _require_token(authorization)
    cache_key = "/initial-load"
    cached = _cached(cache_key)
    if cached is not None:
        return JSONResponse(status_code=200, content={**cached, "ok": True, "cached": True, "environment": _env_label()})

    async with httpx.AsyncClient(follow_redirects=False) as client:
        token = await _get_upstream_token(client)
        if not token:
            return _upstream_error(502, "Could not obtain an NMS bearer token (check NMS_CLIENT_KEY/SECRET).")
        # allowRedirect=false returns the relative content path in the body.
        try:
            resp = await _nms_get(client, "/notams/il", {"allowRedirect": "false"}, token, response_format="AIXM")
        except Exception as exc:
            _log.exception("NMS initial-load request raised")
            return _upstream_error(502, f"NMS initial-load request failed: {type(exc).__name__}")

        if resp.status_code != 200:
            return _upstream_error(502, f"NMS-API initial-load returned HTTP {resp.status_code}.")
        try:
            body = resp.json()
        except Exception:
            return _upstream_error(502, "NMS-API returned a non-JSON initial-load response.")

        content_url = ((body.get("data") or {}).get("url") or "").strip()
        if not content_url:
            return _upstream_error(502, "NMS-API returned no content URL for the initial load.")

        # Resolve the relative content path against the upstream host.
        if content_url.startswith("/"):
            content_url = f"{_upstream_base()}{content_url}"
        try:
            blob_resp = await client.get(
                content_url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60.0,
                follow_redirects=True,
            )
        except Exception as exc:
            _log.exception("NMS initial-load content fetch raised")
            return _upstream_error(502, f"NMS initial-load content fetch failed: {type(exc).__name__}")

        if blob_resp.status_code != 200:
            return _upstream_error(502, f"NMS initial-load content returned HTTP {blob_resp.status_code}.")

        raw = blob_resp.content or b""
        try:
            decompressed = zlib.decompress(raw, zlib.MAX_WBITS | 32)  # gzip
        except zlib.error:
            try:
                decompressed = zlib.decompress(raw)
            except zlib.error:
                decompressed = raw  # already uncompressed

        try:
            text = decompressed.decode("utf-8", errors="replace")
        except Exception:
            text = ""

        # Best-effort NOTAM count from the AIXM/SOAP blob.
        import re

        notam_count = len(re.findall(r"<xnotam:|<NOTAM", text)) or None

        payload = {
            "ok": True,
            "cached": False,
            "environment": _env_label(),
            "content_type": blob_resp.headers.get("content-type", "application/octet-stream"),
            "bytes": len(raw),
            "decompressed_bytes": len(decompressed),
            "notam_count": notam_count,
            "note": "Initial-load snapshots are AIXM wrapped in a SOAP envelope and are large. Prefer the filtered /notams endpoint for interactive use.",
            "aixm": text[:2_000_000],
        }
        _store(cache_key, payload)
        return JSONResponse(status_code=200, content=payload)


@router.get("/locationseries")
async def nms_location_series(authorization: str | None = Header(default=None), lastUpdatedDate: str = "") -> JSONResponse:
    """Location-Series data (ICAO ↔ domestic location mappings)."""
    _require_token(authorization)
    params = {"lastUpdatedDate": (lastUpdatedDate or "").strip()}
    return await _proxy_query("/locationseries", params)


@router.get("/ping")
async def nms_ping() -> PlainTextResponse:
    """Unauthenticated liveness probe (no upstream call)."""
    return PlainTextResponse("NMS proxy OK")
