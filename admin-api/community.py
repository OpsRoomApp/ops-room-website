"""OPS ROOM Admin API -- Community integration.

End-user Discord connect (no admin allowlist) + flight-event ingestion from
the OPS ROOM desktop app + public leaderboard / live-feed reads for the
website.

Architecture (mirrors the existing admin-panel pattern):

    Desktop app --Bearer app_token--> /api/community/event      (events -> SQLite)
    Desktop app --Bearer app_token--> /api/community/live       (in-flight feed)
    Admin panel/bot            --> shared SQLite pending_actions -> bot -> Discord
    Website                     --> /api/community/leaderboard + /live

Privacy: only flight data is accepted. The app authenticates with the per-user
app_token issued by the end-user OAuth connect flow (or the /link-app pairing
code); the server resolves the Discord identity and visibility server-side.
Nothing personal beyond the Discord ID + username is collected.
"""

from __future__ import annotations

import json
import logging
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from config import (
    COMMUNITY_EVENT_TOKEN,
    DISCORD_APP_CONNECT_REDIRECT_URI,
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/community", tags=["community"])


# ---------------------------------------------------------------------------
# Shared DB access (same SQLite as the OPS CONTROL bot)
# ---------------------------------------------------------------------------

def _resolve_db_path() -> str | None:
    import os
    for key in ("OPS_CONTROL_DB", "OPS_CONTROL_DB_PATH", "DATABASE_PATH"):
        value = os.getenv(key)
        if value and value.strip():
            return value.strip()
    return None


def _get_db() -> sqlite3.Connection:
    db_path = _resolve_db_path()
    if not db_path:
        raise HTTPException(status_code=503, detail="Community database not configured (OPS_CONTROL_DB)")
    path = Path(db_path)
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f"Database not found: {db_path}")
    try:
        conn = sqlite3.connect(str(path), timeout=10)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
    except sqlite3.Error:
        pass
    return conn


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = _get_db()
    try:
        yield conn
        conn.commit()
    except sqlite3.Error as exc:
        _log.error("community DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Community database query failed") from exc
    finally:
        conn.close()


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Idempotent CREATE for the community tables (bot owns canonical schema)."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS community_flights (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id       INTEGER NOT NULL,
            flight_id        TEXT,
            event_type       TEXT NOT NULL,
            callsign         TEXT,
            aircraft         TEXT,
            registration     TEXT,
            origin           TEXT,
            origin_name      TEXT,
            destination      TEXT,
            destination_name TEXT,
            landing_rate     REAL,
            touchdown_g      REAL,
            touchdown_speed  REAL,
            duration_min     REAL,
            score            REAL,
            visibility       TEXT NOT NULL DEFAULT 'public',
            created_at       TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS community_live (
            discord_id   INTEGER PRIMARY KEY,
            callsign     TEXT,
            aircraft     TEXT,
            registration TEXT,
            origin       TEXT,
            destination  TEXT,
            phase        TEXT,
            latitude     REAL,
            longitude    REAL,
            altitude_ft  REAL,
            ground_speed REAL,
            heading      REAL,
            route        TEXT,
            visibility   TEXT NOT NULL DEFAULT 'public',
            last_seen    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_links (
            discord_id  INTEGER PRIMARY KEY,
            app_token   TEXT NOT NULL,
            username    TEXT,
            visibility  TEXT NOT NULL DEFAULT 'public',
            created_at  TEXT NOT NULL,
            updated_at  TEXT
        );
        """
    )
    # #103: idempotent migration for the heading column on pre-existing live
    # tables (the CREATE above only affects new installs).
    try:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(community_live)").fetchall()}
        if "heading" not in cols:
            conn.execute("ALTER TABLE community_live ADD COLUMN heading REAL")
            conn.commit()
        # #111: route column (JSON-encoded [lat, lon] pairs from the SimBrief
        # navlog) for the website's dotted route line.
        if "route" not in cols:
            conn.execute("ALTER TABLE community_live ADD COLUMN route TEXT")
            conn.commit()
    except Exception:
        pass
    conn.commit()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_junk_position(latitude, longitude) -> bool:
    """#117: reject test/junk positions before they reach the public map.

    Valid live rows must be finite lat/lon inside the normal ranges, and must
    not sit inside a ~0.1 degree box around (0,0) -- dev/test rows (e.g.
    parked at lat 0.0004 / lon 0.0139) otherwise pollute the map with
    headings stuck at 0/360 (everything pointing North).
    """
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return True
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        return True
    if abs(lat) < 0.1 and abs(lon) < 0.1:
        return True
    return False


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _resolve_identity(request: Request) -> tuple[int, str, str]:
    """Resolve the authenticated (discord_id, visibility, username).

    Normal end users authenticate with the per-user ``app_token`` issued by the
    OAuth connect flow (or the /link-app pairing code). The server looks the
    token up in ``app_links`` and returns the authoritative discord_id,
    visibility and username -- the desktop app never sends those in the body,
    so they cannot be spoofed.

    ``COMMUNITY_EVENT_TOKEN`` is an optional ops/testing bypass: when the
    bearer header matches it, this returns ``(0, "shared", "")`` and the caller
    must supply discord_id + visibility in the request body instead.
    """
    auth = request.headers.get("authorization", "")
    presented = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not presented:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    if COMMUNITY_EVENT_TOKEN and secrets.compare_digest(presented, COMMUNITY_EVENT_TOKEN):
        return 0, "shared", ""

    with _db() as conn:
        _ensure_tables(conn)
        row = conn.execute(
            "SELECT discord_id, visibility, username FROM app_links WHERE app_token = ?",
            (presented,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    visibility = str(row["visibility"] or "discord")
    if visibility not in ("discord", "public", "hidden"):
        visibility = "discord"
    return int(row["discord_id"]), visibility, str(row["username"] or "")


# ---------------------------------------------------------------------------
# End-user Discord connect (no admin allowlist)
# ---------------------------------------------------------------------------

_CONNECT_STATE: dict[str, str] = {}


@router.get("/connect")
async def community_connect(request: Request):
    """Start the end-user Discord connect flow (from the desktop app)."""
    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")
    state = secrets.token_urlsafe(24)
    _CONNECT_STATE[state] = _now_iso()
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_APP_CONNECT_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify",
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"https://discord.com/api/oauth2/authorize?{qs}")


@router.get("/connect/callback")
async def community_connect_callback(request: Request, code: str = "", state: str = ""):
    """Discord redirects here; exchange code and hand the Discord ID back."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorisation code")
    if state not in _CONNECT_STATE:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    _CONNECT_STATE.pop(state, None)
    if not DISCORD_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")

    # Exchange code for token.
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": DISCORD_APP_CONNECT_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
            token_data = resp.json()
    except Exception as exc:
        _log.error("community connect token exchange failed: %s", exc)
        raise HTTPException(status_code=502, detail="Discord authentication unavailable")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Discord authentication failed")

    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            user_data = user_resp.json()
    except Exception as exc:
        _log.error("community connect user fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Discord API unavailable")

    discord_id = str(user_data.get("id") or "")
    username = str(user_data.get("username") or "")
    if not discord_id:
        raise HTTPException(status_code=401, detail="Discord identity missing")

    # Store the app link with a fresh per-user token the desktop app will hold.
    # Preserve any existing visibility choice on re-connect (do not overwrite).
    app_token = secrets.token_urlsafe(24)
    with _db() as conn:
        _ensure_tables(conn)
        conn.execute(
            """
            INSERT INTO app_links (discord_id, app_token, username, visibility, created_at, updated_at)
            VALUES (?, ?, ?, 'public', ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                app_token = excluded.app_token,
                username = excluded.username,
                updated_at = excluded.updated_at
            """,
            (discord_id, app_token, username, _now_iso(), _now_iso()),
        )

    # Hand the identity + token back to the desktop app via a loopback redirect.
    from urllib.parse import urlencode
    qs = urlencode({"discord_id": discord_id, "username": username, "app_token": app_token})
    return RedirectResponse(f"http://127.0.0.1:8080/api/community/connected?{qs}")


# ---------------------------------------------------------------------------
# Event ingestion (desktop app -> bot)
# ---------------------------------------------------------------------------

@router.post("/event")
async def community_event(request: Request):
    """Ingest a takeoff/landing event from the desktop app."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = str(body.get("event_type") or "").lower()
    if event_type not in ("takeoff", "landing", "descent"):
        raise HTTPException(status_code=400, detail="event_type must be takeoff, landing or descent")

    discord_id, visibility, username = _resolve_identity(request)
    if visibility == "shared":  # ops bypass: identity comes from the body
        raw_id = str(body.get("discord_id") or "")
        if not raw_id or not raw_id.isdigit():
            raise HTTPException(status_code=400, detail="discord_id is required")
        discord_id = int(raw_id)
        visibility = str(body.get("visibility") or "discord")
        if visibility not in ("discord", "public", "hidden"):
            visibility = "discord"
        username = str(body.get("username") or "")

    # A "hidden" user opted out of all sharing -- publish nothing.
    if visibility == "hidden":
        return {"ok": True, "event": event_type, "skipped": "hidden"}

    payload = {
        "discord_id": discord_id,
        "username": username,
        "flight_id": str(body.get("flight_id") or ""),
        "event_type": event_type,
        "callsign": str(body.get("callsign") or ""),
        "aircraft": str(body.get("aircraft") or ""),
        "registration": str(body.get("registration") or ""),
        "origin": str(body.get("origin") or "").upper(),
        "origin_name": str(body.get("origin_name") or ""),
        "destination": str(body.get("destination") or "").upper(),
        "destination_name": str(body.get("destination_name") or ""),
        "landing_rate_fpm": body.get("landing_rate_fpm"),
        "touchdown_g": body.get("touchdown_g"),
        "touchdown_speed_kts": body.get("touchdown_speed_kts"),
        "duration_min": body.get("duration_min"),
        "score": body.get("score"),
        "distance_nm": body.get("distance_nm"),
        "visibility": visibility,
    }

    # Enqueue a pending_action for the bot dispatcher. The bot is the sole
    # writer of community_flights (its de-dup is keyed on that table), so we
    # must NOT insert there ourselves -- doing so would make the bot's
    # _already_posted() check see the row and skip the actual Discord post.
    with _db() as conn:
        _ensure_tables(conn)
        conn.execute(
            """
            INSERT INTO pending_actions (action_type, payload_json, status, created_at)
            VALUES ('flight_event', ?, 'pending', ?)
            """,
            (json.dumps(payload), _now_iso()),
        )

    return {"ok": True, "event": event_type, "discord_id": discord_id}


@router.post("/live")
async def community_live(request: Request):
    """Ingest a live in-flight position (public map feed)."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    discord_id, visibility, _ = _resolve_identity(request)
    if visibility == "shared":  # ops bypass
        raw_id = str(body.get("discord_id") or "")
        if not raw_id or not raw_id.isdigit():
            raise HTTPException(status_code=400, detail="discord_id is required")
        discord_id = int(raw_id)
        visibility = str(body.get("visibility") or "discord")
    if visibility != "public":
        raise HTTPException(status_code=403, detail="Live feed requires public visibility")

    # #117: junk/test rows (near 0,0 or out of range) never reach the map.
    if _is_junk_position(body.get("latitude"), body.get("longitude")):
        return {"ok": True, "skipped": "invalid_position"}

    with _db() as conn:
        _ensure_tables(conn)
        conn.execute(
            """
            INSERT INTO community_live
                (discord_id, callsign, aircraft, registration, origin, destination,
                 phase, latitude, longitude, altitude_ft, ground_speed, heading, route, visibility, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                callsign = excluded.callsign,
                aircraft = excluded.aircraft,
                registration = excluded.registration,
                origin = excluded.origin,
                destination = excluded.destination,
                phase = excluded.phase,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                altitude_ft = excluded.altitude_ft,
                ground_speed = excluded.ground_speed,
                heading = excluded.heading,
                route = excluded.route,
                visibility = excluded.visibility,
                last_seen = excluded.last_seen
            """,
            (
                discord_id,
                str(body.get("callsign") or ""),
                str(body.get("aircraft") or ""),
                str(body.get("registration") or ""),
                str(body.get("origin") or "").upper(),
                str(body.get("destination") or "").upper(),
                str(body.get("phase") or ""),
                body.get("latitude"),
                body.get("longitude"),
                body.get("altitude_ft"),
                body.get("ground_speed_kts"),
                body.get("heading"),
                json.dumps(body.get("route") or []),
                visibility,
                _now_iso(),
            ),
        )

    return {"ok": True}


@router.post("/settings")
async def community_settings_sync(request: Request):
    """Sync the desktop app's sharing settings to the server (#100).

    The app is the source of truth for what the user picked in Host Setup
    (visibility / share_flights). Previously the app stored its choice locally
    while the server kept its own default ('discord'), so "public" in the app
    never reached the website map (403 on /live). This endpoint lets the app
    update its OWN app_links row so the two stores cannot drift.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    discord_id, visibility, _ = _resolve_identity(request)

    new_visibility = str(body.get("visibility") or "").strip().lower()
    if new_visibility and new_visibility not in ("discord", "public", "hidden"):
        raise HTTPException(status_code=400, detail="visibility must be discord, public or hidden")

    with _db() as conn:
        _ensure_tables(conn)
        if new_visibility:
            conn.execute(
                "UPDATE app_links SET visibility = ?, updated_at = ? WHERE app_token = ?",
                (new_visibility, _now_iso(), request.headers.get("authorization", "")[7:].strip()),
            )
    return {"ok": True, "discord_id": discord_id, "visibility": new_visibility or visibility}


# ---------------------------------------------------------------------------
# Public reads (website)
# ---------------------------------------------------------------------------

@router.get("/live")
async def community_live_feed():
    """Public list of currently-airborne community flights (public visibility)."""
    with _db() as conn:
        _ensure_tables(conn)
        rows = conn.execute(
            """
            SELECT * FROM community_live
            WHERE visibility = 'public'
              AND julianday(last_seen) > julianday('now', '-2 minutes')
            ORDER BY last_seen DESC
            """
        ).fetchall()
    return {
        "flights": [
            {
                "discord_id": r["discord_id"],
                "callsign": r["callsign"],
                "aircraft": r["aircraft"],
                "registration": r["registration"],
                "origin": r["origin"],
                "destination": r["destination"],
                "phase": r["phase"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "altitude_ft": r["altitude_ft"],
                "ground_speed_kts": r["ground_speed"],
                "heading": r["heading"],
                # #111: expose the SimBrief navlog route (JSON [lat, lon] pairs)
                # so the map can draw the dotted route line.
                "route": json.loads(r["route"]) if r["route"] else [],
                "last_seen": r["last_seen"],
            }
            for r in rows
        ]
    }


@router.get("/leaderboard")
async def community_leaderboard(period: str = "alltime"):
    """Public leaderboard from flight_logs (public-visibility flights)."""
    period = period.strip().lower()
    since = ""
    if period in ("week", "7d"):
        since = "AND submitted_at >= datetime('now', '-7 days')"
    elif period in ("month", "30d"):
        since = "AND submitted_at >= datetime('now', '-30 days')"

    with _db() as conn:
        rows = conn.execute(
            f"""
            SELECT username,
                   COUNT(*)                       AS flights,
                   COALESCE(SUM(duration_min), 0) / 60.0 AS hours,
                   AVG(landing_rate)              AS avg_rate,
                   MAX(landing_rate)              AS best_rate,
                   MIN(landing_rate)              AS worst_rate
            FROM flight_logs
            WHERE landing_rate IS NOT NULL AND visibility = 'public' {since}
            GROUP BY user_id
            -- #119: rank by time flown first (flights as tiebreaker).
            ORDER BY hours DESC, flights DESC
            LIMIT 50
            """
        ).fetchall()
    return {
        "period": period,
        "leaderboard": [
            {
                "username": r["username"],
                "flights": r["flights"],
                "hours": round(r["hours"] or 0.0, 1),
                "avg_landing_rate_fpm": round(r["avg_rate"], 1) if r["avg_rate"] is not None else None,
                "best_landing_rate_fpm": round(r["best_rate"], 1) if r["best_rate"] is not None else None,
                "worst_landing_rate_fpm": round(r["worst_rate"], 1) if r["worst_rate"] is not None else None,
            }
            for r in rows
        ],
    }
