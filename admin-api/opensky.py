"""OPS ROOM Website API -- OpenSky Network real-world flight schedule proxy.

Securely proxies requests to the OpenSky Network API using client-credentials
OAuth2, with a short in-memory cache to avoid rate-limiting and reduce latency
for repeated queries from the desktop app.

v0.25.34: added aircraft filter, global callsign search (no origin), destination
resolution chain, case-insensitive partial callsign matching.
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


def _callsign_matches(flight_callsign: str, query: str) -> bool:
    """Case-insensitive partial substring match after trimming whitespace."""
    return query in (flight_callsign or "").strip().upper()


def _aircraft_matches(flight_icao24: str, query: str) -> bool:
    """Check if the query matches the beginning of an ICAO24 hex (best-effort
    aircraft-type hint — the OpenSky REST departure endpoint doesn't return
    an aircraft_type field, so we expose icao24 and let callers interpret it).
    """
    if not query:
        return True
    return (flight_icao24 or "").strip().upper().startswith(query)


@router.get("/realworld-search")
async def realworld_search(
    request: Request,
    origin: str = Query("", max_length=4),
    dest: str = Query("", max_length=4),
    callsign: str = Query("", max_length=20),
    aircraft: str = Query("", max_length=10),
) -> JSONResponse:
    """Search real-world scheduled/recent flights by origin, destination,
    callsign and/or aircraft type, proxied through the OpenSky Network API.

    - origin + optional dest/callsign/aircraft filters → departure endpoint
    - callsign WITHOUT origin → global search via states/all endpoint
    """
    origin_clean = origin.strip().upper()
    dest_clean = dest.strip().upper()
    callsign_clean = callsign.strip().upper()
    aircraft_clean = aircraft.strip().upper()

    cache_key = f"{origin_clean}|{dest_clean}|{callsign_clean}|{aircraft_clean}"
    now = time.time()

    # Serve from cache when fresh
    if cache_key in _CACHE and (now - _CACHE[cache_key]["timestamp"]) < _CACHE_TTL:
        return JSONResponse(content=_CACHE[cache_key]["data"])

    results: list[dict[str, Any]] = []

    if origin_clean:
        # ── Departure-based search (has origin) ──────────────────────
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
            f_icao24 = (flight.get("icao24") or "").strip()

            if dest_clean and f_dest != dest_clean:
                continue
            if callsign_clean and not _callsign_matches(f_callsign, callsign_clean):
                continue
            if aircraft_clean and not _aircraft_matches(f_icao24, aircraft_clean):
                continue

            first_seen = flight.get("firstSeen") or 0
            results.append(
                {
                    "callsign": f_callsign,
                    "origin": origin_clean,
                    "destination": f_dest,
                    "firstSeen": first_seen,
                    "lastSeen": flight.get("lastSeen"),
                    "icao24": f_icao24,
                    "eobt_utc": (
                        time.strftime("%H:%M", time.gmtime(first_seen))
                        if first_seen
                        else "N/A"
                    ),
                }
            )

    elif callsign_clean:
        # ── Global callsign search (no origin) ─────────────────────
        # Use /states/all to search all currently airborne aircraft
        async with httpx.AsyncClient(timeout=10.0) as client:
            token = await _get_opensky_token(client)
            headers = {"Authorization": f"Bearer {token}"} if token else {}

            try:
                resp = await client.get(
                    "https://opensky-network.org/api/states/all",
                    headers=headers,
                )
                resp.raise_for_status()
                states_data = resp.json()
            except Exception as exc:
                _log.exception("OpenSky states/all query failed")
                return JSONResponse(
                    content={"status": "error", "message": str(exc)},
                    status_code=502,
                )

        states = states_data.get("states") or []
        for state in states:
            # states array: [icao24, callsign, origin_country, time_position,
            #   last_contact, longitude, latitude, baro_altitude, on_ground,
            #   velocity, true_track, vertical_rate, sensors, geo_altitude,
            #   squawk, spi, position_source, category]
            state_callsign = (state[1] or "").strip() if len(state) > 1 else ""
            state_icao24 = (state[0] or "").strip() if len(state) > 0 else ""
            state_origin_country = (state[2] or "").strip() if len(state) > 2 else ""

            if not _callsign_matches(state_callsign, callsign_clean):
                continue
            if aircraft_clean and not _aircraft_matches(state_icao24, aircraft_clean):
                continue

            results.append(
                {
                    "callsign": state_callsign,
                    "origin": state_origin_country or "???",
                    "destination": "",
                    "firstSeen": int(state[3]) if len(state) > 3 and state[3] else 0,
                    "lastSeen": int(state[4]) if len(state) > 4 and state[4] else 0,
                    "icao24": state_icao24,
                    "eobt_utc": "LIVE",
                }
            )

    output: dict[str, Any] = {
        "status": "success",
        "count": len(results),
        "flights": results,
    }
    _CACHE[cache_key] = {"timestamp": now, "data": output}
    return JSONResponse(content=output)
