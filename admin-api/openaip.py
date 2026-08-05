"""
OPS ROOM Website API -- OpenAIP airspace proxy (map enrichment).

Securely proxies airspace polygon requests to the OpenAIP API using a
server-side API key. The desktop app talks to https://opsroom.live/api/v1/
openaip/... and never sees the OpenAIP key -- the key lives ONLY in this
server's environment, exactly like the FAA NMS (nms.py) and OpenSky
(opensky.py) integrations.

Endpoints (all under /api/v1/openaip/):
  GET /api/v1/openaip/airspaces -- airspace polygons for a bbox (passthrough)
  GET /api/v1/openaip/status    -- integration diagnostics (no secrets)

Auth for the proxy itself: OPTIONAL. When OPENAIP_PROXY_TOKEN is set, requests
must present it in the x-opsroom-proxy-token header (the desktop sends it
automatically when configured). When unset the endpoint is public HTTPS,
matching the OpenSky realworld-search proxy.

Upstream: OpenAIP v3 /api/v3/airspaces?bbox=..., falling back to the legacy v2
/api/airspaces?lat=..&lon=..&radius=.. on failure. Responses pass through
unchanged (GeoJSON FeatureCollection or legacy JSON) so the desktop parser is
identical for proxy and direct sources. Responses are cached in-memory (1h) so
repeated map refreshes never hammer the provider or burn rate-limit quota.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import math
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import JSONResponse

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/openaip", tags=["openaip"])

# ── Environment / credentials ────────────────────────────────────────────
OPENAIP_API_KEY = os.environ.get("OPENAIP_API_KEY", "").strip()
OPENAIP_PROXY_TOKEN = os.environ.get("OPENAIP_PROXY_TOKEN", "").strip()

if not OPENAIP_API_KEY:
    _log.warning(
        "OpenAIP API key not configured — set OPENAIP_API_KEY. "
        "The airspace proxy returns 502 until it is provided."
    )

API_V3_BASE = "https://api.openaip.net/api/v3"
API_V2_BASE = "https://api.openaip.net/api"

MAX_BBOX_SPAN_LON = 40.0
MAX_BBOX_SPAN_LAT = 24.0
MAX_LIMIT = 1200
UPSTREAM_TIMEOUT = 10.0

# In-memory cache: {cache_key: {"timestamp": float, "data": dict}}
_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL: float = 3600.0  # seconds (matches the desktop client's own TTL)


def _require_token(x_opsroom_proxy_token: str | None) -> None:
    """Optionally gate the proxy behind a shared token (not the OpenAIP key)."""
    if not OPENAIP_PROXY_TOKEN:
        return
    supplied = str(x_opsroom_proxy_token or "")
    if not supplied or not hmac.compare_digest(supplied, OPENAIP_PROXY_TOKEN):
        raise HTTPException(status_code=401, detail="invalid or missing OpenAIP proxy token")


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        a = [float(x.strip()) for x in str(bbox).split(",")]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
    if len(a) != 4:
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
    min_lon, min_lat, max_lon, max_lat = a
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        raise HTTPException(status_code=400, detail="longitude out of range")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(status_code=400, detail="latitude out of range")
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(status_code=400, detail="bbox min must be < max")
    if (max_lon - min_lon) > MAX_BBOX_SPAN_LON or (max_lat - min_lat) > MAX_BBOX_SPAN_LAT:
        raise HTTPException(status_code=400, detail="bbox span too large")
    return min_lon, min_lat, max_lon, max_lat


def _cache_key(bbox: str, limit: int) -> str:
    return f"{bbox}|{limit}"


def _cached(key: str) -> Any | None:
    hit = _CACHE.get(key)
    if hit and time.time() - hit["timestamp"] < _CACHE_TTL:
        return hit["data"]
    return None


def _store(key: str, data: Any) -> Any:
    if len(_CACHE) > 400:
        cutoff = time.time() - _CACHE_TTL
        for stale in [k for k, v in _CACHE.items() if v["timestamp"] < cutoff]:
            _CACHE.pop(stale, None)
    _CACHE[key] = {"timestamp": time.time(), "data": data}
    return data


def _upstream_error(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail})


async def _upstream_get(client: httpx.AsyncClient, url: str, params: dict[str, Any], label: str) -> dict[str, Any]:
    """Upstream GET with one 429 retry (honoring Retry-After when present).

    The response is always closed (finally) so pooled connections are never
    leaked on the retry or error paths.
    """
    headers = {"x-openaip-api-key": OPENAIP_API_KEY, "Accept": "application/json",
               "User-Agent": "opsroom-admin-api/0.1"}
    for attempt in (1, 2):
        try:
            resp = await client.get(url, params=params, headers=headers, timeout=UPSTREAM_TIMEOUT)
        except httpx.TimeoutException:
            raise RuntimeError(f"{label} upstream timeout")
        except httpx.RequestError:
            raise RuntimeError(f"{label} upstream network error")
        try:
            if resp.status_code == 429 and attempt == 1:
                delay = 1.0
                retry_after = resp.headers.get("Retry-After")
                try:
                    delay = min(10.0, max(0.5, float(retry_after)))
                except (TypeError, ValueError):
                    pass
                await asyncio.sleep(delay)
                continue
            if resp.status_code in (401, 403):
                raise RuntimeError(f"{label} upstream auth failed (HTTP {resp.status_code})")
            if resp.status_code >= 400:
                raise RuntimeError(f"{label} upstream HTTP {resp.status_code}")
            try:
                return resp.json()
            except ValueError:
                raise RuntimeError(f"{label} upstream returned non-JSON")
        finally:
            await resp.aclose()
    raise RuntimeError(f"{label} upstream rate limited after retry")


@router.get("/status")
async def openaip_status(
    x_opsroom_proxy_token: str | None = Header(default=None, alias="x-opsroom-proxy-token"),
) -> dict:
    """Integration diagnostics. Never exposes keys or tokens."""
    _require_token(x_opsroom_proxy_token)
    return {
        "ok": True,
        "configured": bool(OPENAIP_API_KEY),
        "proxy_token_enforced": bool(OPENAIP_PROXY_TOKEN),
        "cache_keys": len(_CACHE),
        "role": "airspace polygon enrichment proxy",
        "attribution": "Airspace data © OpenAIP (CC BY-NC)",
    }


@router.get("/airspaces")
async def airspaces(
    bbox: str = Query(...),
    limit: int = Query(900),
    x_opsroom_proxy_token: str | None = Header(default=None, alias="x-opsroom-proxy-token"),
) -> JSONResponse:
    """Proxy an OpenAIP airspace query for the desktop map viewport."""
    _require_token(x_opsroom_proxy_token)
    if not OPENAIP_API_KEY:
        return _upstream_error(502, "server OpenAIP key is not configured")
    min_lon, min_lat, max_lon, max_lat = _parse_bbox(bbox)
    limit = max(1, min(int(limit or 900), MAX_LIMIT))

    key = _cache_key(bbox, limit)
    cached = _cached(key)
    if cached is not None:
        return JSONResponse(cached)

    params_v3 = {"bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}", "limit": limit}
    async with httpx.AsyncClient() as client:
        try:
            payload = await _upstream_get(client, f"{API_V3_BASE}/airspaces", params_v3, "openaip v3")
        except Exception:
            # Legacy v2 fallback (center + radius).
            center_lon = (min_lon + max_lon) / 2.0
            center_lat = (min_lat + max_lat) / 2.0
            radius_km = max(1.0, math.hypot(max_lon - min_lon, max_lat - min_lat) * 111.0 / 2.0)
            try:
                payload = await _upstream_get(
                    client,
                    f"{API_V2_BASE}/airspaces",
                    {"lat": round(center_lat, 5), "lon": round(center_lon, 5),
                     "radius": round(radius_km, 1), "format": "json"},
                    "openaip v2")
            except Exception as exc:
                return _upstream_error(502, str(exc))

    if not isinstance(payload, dict):
        payload = {"type": "FeatureCollection", "features": []}
    return JSONResponse(_store(key, payload))
