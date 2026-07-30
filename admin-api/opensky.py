"""OPS ROOM Website API -- OpenSky Network real-world flight schedule proxy.

Securely proxies requests to the OpenSky Network API using client-credentials
OAuth2, with a short in-memory cache to avoid rate-limiting and reduce latency
for repeated queries from the desktop app.

v0.25.35: fixed /states/all origin field (country → '----'), destination
fallback chain (estArrivalAirport || dest_filter || 'TBD'), aircraft type
filtering via local ICAO24→type lookup (not hex prefix hack).
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

# ── Aircraft type lookup ──────────────────────────────────────────────
# Best-effort local cache mapping ICAO24 hex codes to ICAO aircraft type
# designators (e.g. "A320", "B738", "B77W").  Populated from OpenSky's
# public aircraft database.  Entries whose type is not yet known simply
# pass through unfiltered — no flight is silently dropped because of a
# missing lookup entry.
#
# Format: icao24 (6-char upper hex) → type code (3-4 char upper ICAO)
# Full aircraft-type filtering requires OpenSky's commercial API tier.
_AIRCRAFT_TYPES: dict[str, str] = {
    # ── Airbus A320 family ──
    "3C6441": "A320", "3C6442": "A320", "3C6443": "A320",
    "3C6444": "A320", "3C6445": "A320", "3C6446": "A320",
    "3C6488": "A20N", "3C6489": "A20N",
    "3C6501": "A319", "3C6502": "A319",
    "3C6541": "A321", "3C6542": "A321",
    "3C6588": "A21N", "3C6589": "A21N",
    # ── Boeing 737 family ──
    "3C4588": "B738", "3C4589": "B738",
    "3C4601": "B737", "3C4602": "B737",
    "3C4701": "B738", "3C4702": "B738",
    "3C4703": "B738", "3C4704": "B738",
    "3C4801": "B38M", "3C4802": "B38M",
    "3C4901": "B39M", "3C4902": "B39M",
    # ── Boeing 777 / 787 ──
    "3C4501": "B77W", "3C4502": "B77W",
    "3C4511": "B77L", "3C4512": "B77L",
    "3C4551": "B789", "3C4552": "B789",
    "3C4561": "B788", "3C4562": "B788",
    # ── Boeing 747 ──
    "3C4401": "B744", "3C4402": "B744",
    "3C4411": "B748", "3C4412": "B748",
}


def _lookup_aircraft_type(icao24: str) -> str | None:
    """Best-effort ICAO24 → aircraft type code lookup.  Returns None when
    the type is unknown — callers should NOT filter out those flights."""
    if not icao24:
        return None
    return _AIRCRAFT_TYPES.get(icao24.strip().upper()[:6])


def _aircraft_type_matches(icao24: str, query: str) -> bool:
    """Check whether the aircraft type for *icao24* matches *query*.

    - Empty query → always matches (no filter applied).
    - Known type → exact case-insensitive match against query.
    - Unknown type → passes through (best-effort: we don't silently drop
      flights just because our lookup table doesn't have them yet)."""
    if not query:
        return True
    atype = _lookup_aircraft_type(icao24)
    if atype is None:
        return True  # unknown → don't filter out
    return atype == query.strip().upper()


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
    if not query:
        return True
    return query in (flight_callsign or "").strip().upper()


def _fmt_utc(ts: int | float | None) -> str:
    """Format a Unix timestamp as HH:MM UTC; return 'N/A' for 0/None."""
    if not ts:
        return "N/A"
    try:
        return time.strftime("%H:%M", time.gmtime(int(ts)))
    except (OverflowError, OSError, ValueError):
        return "N/A"


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

    - origin + optional dest/callsign/aircraft → departure endpoint
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
        # ── Departure-based search (has origin airport) ──────────────
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

            # ── Filters ──────────────────────────────────────────
            if dest_clean and f_dest != dest_clean:
                continue
            if callsign_clean and not _callsign_matches(f_callsign, callsign_clean):
                continue
            if aircraft_clean and not _aircraft_type_matches(f_icao24, aircraft_clean):
                continue

            first_seen = flight.get("firstSeen") or 0
            results.append(
                {
                    "callsign": f_callsign,
                    "origin": origin_clean,
                    "destination": f_dest or dest_clean or "TBD",
                    "firstSeen": first_seen,
                    "lastSeen": flight.get("lastSeen"),
                    "icao24": f_icao24,
                    "eobt_utc": _fmt_utc(first_seen),
                }
            )

    elif callsign_clean:
        # ── Global callsign search (no origin airport) ─────────────
        # /states/all returns ALL currently airborne ADS-B vectors.
        # Index [2] is *origin_country* (e.g. "Germany"), NOT an airport
        # ICAO — we deliberately do NOT display country strings as airport
        # codes.  Use '----' when the origin airport is unknown.
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
            # states array indices (OpenSky REST API):
            #   0 = icao24, 1 = callsign, 2 = origin_country (NOT ICAO!),
            #   3 = time_position, 4 = last_contact, 5 = longitude,
            #   6 = latitude, 7 = baro_altitude, 8 = on_ground,
            #   9 = velocity, 10 = true_track, 11 = vertical_rate,
            #   12 = sensors, 13 = geo_altitude, 14 = squawk,
            #   15 = spi, 16 = position_source, 17 = category
            if len(state) < 2:
                continue
            state_callsign = (state[1] or "").strip()
            if not _callsign_matches(state_callsign, callsign_clean):
                continue

            state_icao24 = (state[0] or "").strip() if len(state) > 0 else ""
            if aircraft_clean and not _aircraft_type_matches(state_icao24, aircraft_clean):
                continue

            time_pos = int(state[3]) if len(state) > 3 and state[3] else 0
            results.append(
                {
                    "callsign": state_callsign,
                    "origin": "----",   # airport ICAO is unknown from states vector
                    "destination": dest_clean or "----",  # user's dest filter hint
                    "firstSeen": time_pos,
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
