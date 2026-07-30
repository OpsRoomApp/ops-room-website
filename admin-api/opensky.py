"""OPS ROOM Website API -- OpenSky Network real-world flight schedule proxy.

Securely proxies requests to the OpenSky Network API using client-credentials
OAuth2, with a short in-memory cache to avoid rate-limiting and reduce latency
for repeated queries from the desktop app.
"""

from __future__ import annotations

import os
import time
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["opensky"])

OPENSKY_CLIENT_ID = os.environ.get(
    "OPENSKY_CLIENT_ID", "badgujarnishant@gmail.com-api-client"
)
OPENSKY_CLIENT_SECRET = os.environ.get(
    "OPENSKY_CLIENT_SECRET", "HQbVw1jnP40p5kDC0Z3lDL6KkUJZLIZt"
)

# In-memory cache: {cache_key: {"timestamp": float, "data": dict}}
_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL: float = 60.0  # seconds


async def _get_opensky_token(client: httpx.AsyncClient) -> str | None:
    """Fetch a short-lived OAuth2 access token from OpenSky."""
    token_url = (
        "https://auth.opensky-network.org/auth/realms/master/"
        "protocol/openid-connect/token"
    )
    payload = {
        "grant_type": "client_credentials",
        "client_id": OPENSKY_CLIENT_ID,
        "client_secret": OPENSKY_CLIENT_SECRET,
    }
    try:
        resp = await client.post(token_url, data=payload, timeout=8.0)
        if resp.status_code == 200:
            return resp.json().get("access_token")
    except Exception:
        _log.exception("OpenSky token fetch failed")
    return None


@router.get("/realworld-search")
async def realworld_search(
    request: Request,
    origin: str = Query("", max_length=4),
    dest: str = Query("", max_length=4),
    callsign: str = Query("", max_length=20),
) -> JSONResponse:
    """Search real-world scheduled/recent flights by origin, destination
    and/or callsign, proxied through the OpenSky Network API."""
    origin_clean = origin.strip().upper()
    dest_clean = dest.strip().upper()
    callsign_clean = callsign.strip().upper()

    cache_key = f"{origin_clean}|{dest_clean}|{callsign_clean}"
    now = time.time()

    # Serve from cache when fresh
    if cache_key in _CACHE and (now - _CACHE[cache_key]["timestamp"]) < _CACHE_TTL:
        return JSONResponse(content=_CACHE[cache_key]["data"])

    results: list[dict[str, Any]] = []

    if origin_clean:
        end_time = int(now)
        begin_time = end_time - 7200  # past 2 hours
        url = (
            f"https://opensky-network.org/api/flights/departure"
            f"?airport={origin_clean}&begin={begin_time}&end={end_time}"
        )

        async with httpx.AsyncClient(timeout=10.0) as client:
            token = await _get_opensky_token(client)
            headers = {"Authorization": f"Bearer {token}"} if token else {}

            try:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                flights = resp.json()
            except Exception as exc:
                _log.exception("OpenSky departure query failed for %s", origin_clean)
                return JSONResponse(
                    content={"status": "error", "message": str(exc)},
                    status_code=502,
                )

        for flight in flights:
            f_callsign = (flight.get("callsign") or "").strip()
            f_dest = (flight.get("estArrivalAirport") or "").strip()

            if dest_clean and f_dest != dest_clean:
                continue
            if callsign_clean and callsign_clean not in f_callsign:
                continue

            first_seen = flight.get("firstSeen") or 0
            results.append(
                {
                    "callsign": f_callsign,
                    "origin": origin_clean,
                    "destination": f_dest,
                    "firstSeen": first_seen,
                    "lastSeen": flight.get("lastSeen"),
                    "icao24": flight.get("icao24"),
                    "eobt_utc": (
                        time.strftime("%H:%M", time.gmtime(first_seen))
                        if first_seen
                        else "N/A"
                    ),
                }
            )

    output: dict[str, Any] = {
        "status": "success",
        "count": len(results),
        "flights": results,
    }
    _CACHE[cache_key] = {"timestamp": now, "data": output}
    return JSONResponse(content=output)
