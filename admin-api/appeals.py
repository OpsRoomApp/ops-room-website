"""
OPS ROOM Admin API - Public Appeals (v0.25.55 / C4)

Public, unauthenticated endpoint for banned/timed-out users to submit
an appeal. Rate-limited by IP. Appeals are stored in the shared SQLite DB
and surfaced in the admin panel for staff review.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from clientip import client_ip

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/appeals", tags=["appeals"])

# Rate limiter: 3 appeals per IP per hour
_rate: dict[str, list[float]] = defaultdict(list)
_RATE_MAX = 3
_RATE_WINDOW = 3600

# DB path: same SQLite as the bot via shared Docker volume
DB_PATH = Path(os.getenv("OPS_CONTROL_DB", "/opt/ops-control-bot/data/ops-control.db"))


def _check_rate(ip: str) -> bool:
    now = time.time()
    window = now - _RATE_WINDOW
    _rate[ip] = [t for t in _rate[ip] if t > window]
    if len(_rate[ip]) >= _RATE_MAX:
        return False
    _rate[ip].append(now)
    return True


@router.post("/submit")
async def submit_appeal(request: Request):
    """Public appeal form submission. No auth required."""
    ip = client_ip(request)

    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="Too many appeals. Please try again later.")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    user_id = data.get("user_id")
    username = data.get("username", "").strip()
    action_type = data.get("action_type", "").strip()
    statement = data.get("statement", "").strip()

    if not statement or len(statement) < 10:
        raise HTTPException(status_code=400, detail="Please provide a statement (min 10 characters).")
    if not username and not user_id:
        raise HTTPException(status_code=400, detail="Please provide your Discord username or user ID.")

    now = datetime.now(timezone.utc).isoformat()

    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH))
            conn.execute(
                "INSERT INTO appeals (user_id, username, action_type, statement, status, created_at) "
                "VALUES (?, ?, ?, ?, 'pending', ?)",
                (int(user_id) if user_id else None, username, action_type, statement, now),
            )
            conn.commit()
            conn.close()
            _log.info("Appeal submitted by %s (IP: %s)", username or user_id, ip[:20])
        except Exception:
            _log.exception("Failed to write appeal to DB")
            raise HTTPException(status_code=500, detail="Failed to submit appeal. Please try again later.")
    else:
        # DB not mounted -- fall back to file-based storage
        fallback = Path("/opt/opsroom-appeals")
        fallback.mkdir(parents=True, exist_ok=True)
        appeal_file = fallback / f"{int(time.time())}-{ip.replace('.','_')[:16]}.json"
        import json
        appeal_file.write_text(json.dumps({
            "user_id": user_id,
            "username": username,
            "action_type": action_type,
            "statement": statement,
            "created_at": now,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        _log.info("Appeal saved to fallback file: %s", appeal_file.name)

    return JSONResponse({"ok": True, "message": "Your appeal has been submitted. Staff will review it shortly."})
