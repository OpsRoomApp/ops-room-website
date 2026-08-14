"""
OPS ROOM Admin API - Website Support Form (v0.25.x)

Public, unauthenticated endpoint for the opsroom.live /support contact form.
Messages are stored in a SQLite DB and surfaced in the admin panel for review
(the same review flow as Bug Reports, without diagnostics ZIPs).

Endpoints
---------
Public ingest (called by the website support form):
    POST /api/v1/support
        body: {"name": "...", "email": "...", "subject": "...", "message": "..."}
        -> 200 {"ok": true, "id": "..."}

Admin (OAuth session required, same as the rest of the panel):
    GET /api/v1/support                    list (filters + pagination)
    GET /api/v1/support/stats              counts by status
    GET /api/v1/support/{id}               full detail
    PUT /api/v1/support/{id}               update status / notes

Security
--------
- No secret: the form is public by design. Per-IP rate limiting
  (SUPPORT_RATE_LIMIT_PER_MIN, default 5/min) is the primary spam defense.
- IDs are random UUIDs (not sequential integers) so they cannot be enumerated.
- The message body is capped and trimmed; no HTML is stored or rendered.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from auth import verify_session
from clientip import client_ip
from config import LOG_FILE, SUPPORT_DB, SUPPORT_RATE_LIMIT_PER_MIN

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/support", tags=["support"])

MAX_FIELD_CHARS = {
    "name": 120,
    "email": 200,
    "subject": 200,
    "message": 10_000,
}
VALID_STATUSES = ("new", "open", "closed")

_db_lock = threading.Lock()
_rate: dict[str, list[float]] = defaultdict(list)
_initialized = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(SUPPORT_DB)), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db() -> None:
    """Idempotent schema creation. Called lazily on first request and from
    main.py startup so a misconfigured store fails fast at boot."""
    global _initialized
    if _initialized:
        return
    Path(SUPPORT_DB).parent.mkdir(parents=True, exist_ok=True)
    with _db_lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS support_messages (
                    id          TEXT PRIMARY KEY,
                    received_at TEXT NOT NULL,
                    name        TEXT NOT NULL DEFAULT '',
                    email       TEXT NOT NULL DEFAULT '',
                    subject     TEXT NOT NULL DEFAULT '',
                    message     TEXT NOT NULL DEFAULT '',
                    status      TEXT NOT NULL DEFAULT 'new',
                    notes       TEXT NOT NULL DEFAULT '',
                    source_ip   TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_sup_received ON support_messages(received_at DESC);
                CREATE INDEX IF NOT EXISTS idx_sup_status ON support_messages(status);
                """
            )
            conn.commit()
        finally:
            conn.close()
        _initialized = True


def _audit_log(entry: dict[str, Any]) -> None:
    entry.setdefault("time", _now_iso())
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _rate_limited(ip: str) -> bool:
    """Sliding-window per-IP limiter; True when the request should be rejected."""
    now = time.time()
    window = now - 60
    attempts = [t for t in _rate[ip] if t > window]
    _rate[ip] = attempts
    if len(attempts) >= SUPPORT_RATE_LIMIT_PER_MIN:
        return True
    _rate[ip].append(now)
    return False


def _row_to_item(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def _fetch_row(msg_id: str) -> sqlite3.Row | None:
    with _db_lock:
        conn = _connect()
        try:
            return conn.execute("SELECT * FROM support_messages WHERE id = ?", (msg_id,)).fetchone()
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Public ingest (website support form)
# ---------------------------------------------------------------------------


@router.post("")
async def ingest_message(request: Request):
    """Receive a support message from the opsroom.live /support form."""
    init_db()
    ip = client_ip(request)
    if _rate_limited(ip):
        _log.warning("Support form rate limited for %s", ip[:40])
        return JSONResponse(
            {"ok": False, "error": "Too many messages from this address. Try again later."},
            status_code=200,
        )

    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Invalid JSON payload."}, status_code=200)
    if not isinstance(data, dict):
        return JSONResponse({"ok": False, "error": "Invalid payload."}, status_code=200)

    def clean(key: str) -> str:
        value = str(data.get(key) or "").strip()
        return value[: MAX_FIELD_CHARS[key]]

    name = clean("name")
    email = clean("email")
    subject = clean("subject")
    message = clean("message")

    if not name:
        return JSONResponse({"ok": False, "error": "Please provide your name."}, status_code=200)
    if "@" not in email or "." not in email:
        return JSONResponse({"ok": False, "error": "Please provide a valid email address."}, status_code=200)
    if len(message) < 10:
        return JSONResponse({"ok": False, "error": "Please describe your issue (at least 10 characters)."}, status_code=200)

    msg_id = "SUP-" + uuid.uuid4().hex[:12].upper()
    now = _now_iso()

    with _db_lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO support_messages (id, received_at, name, email, subject, message, status, source_ip) "
                "VALUES (?, ?, ?, ?, ?, ?, 'new', ?)",
                (msg_id, now, name, email, subject, message, ip[:120]),
            )
            conn.commit()
        finally:
            conn.close()

    _log.info("Support message stored: %s (subject=%s)", msg_id, subject or "-")
    return JSONResponse({"ok": True, "id": msg_id})


# ---------------------------------------------------------------------------
# Admin (OAuth session required)
# ---------------------------------------------------------------------------


@router.get("")
async def list_messages(
    request: Request,
    status: str = "",
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    _session: dict = Depends(verify_session),
):
    """List support messages (all fields) with optional filters + pagination."""
    init_db()
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    where: list[str] = []
    params: list[Any] = []
    if status:
        where.append("status = ?")
        params.append(status)
    if q:
        where.append("(id LIKE ? OR name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)")
        params += [f"%{q}%"] * 5
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    with _db_lock:
        conn = _connect()
        try:
            total = conn.execute(f"SELECT COUNT(*) FROM support_messages{clause}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM support_messages{clause} ORDER BY received_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        finally:
            conn.close()

    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_row_to_item(r) for r in rows],
    }


@router.get("/stats")
async def message_stats(_session: dict = Depends(verify_session)):
    """Counts by status for the admin panel header."""
    init_db()
    with _db_lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM support_messages GROUP BY status"
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM support_messages").fetchone()[0]
        finally:
            conn.close()
    counts = {s: 0 for s in VALID_STATUSES}
    for r in rows:
        counts[r["status"]] = r["n"]
    counts["total"] = total
    return {"ok": True, "counts": counts}


@router.get("/{message_id}")
async def message_detail(message_id: str, _session: dict = Depends(verify_session)):
    """Full support message detail."""
    row = _fetch_row(message_id)
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"ok": True, "item": _row_to_item(row)}


@router.put("/{message_id}")
async def update_message(
    message_id: str,
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Update status and/or notes on a support message."""
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    updates: dict[str, Any] = {}
    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        updates["status"] = status
    if "notes" in body:
        updates["notes"] = str(body.get("notes") or "")[:4000]
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    with _db_lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT id FROM support_messages WHERE id = ?", (message_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Message not found")
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE support_messages SET {set_clause} WHERE id = ?",
                (*updates.values(), message_id),
            )
            conn.commit()
            updated = conn.execute(
                "SELECT * FROM support_messages WHERE id = ?", (message_id,)
            ).fetchone()
        finally:
            conn.close()

    _audit_log({
        "action": "SUPPORT_UPDATE",
        "user": username,
        "message_id": message_id,
        "updates": list(updates),
    })
    return {"ok": True, "item": _row_to_item(updated)}
