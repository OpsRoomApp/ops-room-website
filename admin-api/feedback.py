"""
OPS ROOM Admin API - Feedback / Feature Requests (v0.26)

Public, unauthenticated ingest for feedback and feature requests (from the
desktop app report modal and any website form). Messages are stored in a
SQLite DB, surfaced in the admin panel for review, and forwarded to the
OPS CONTROL bot as a `feedback_new` pending action so a forum thread opens
in the feedback forum with the bot's identity.

Endpoints
---------
Public ingest:
    POST /api/v1/feedback
        body: {"kind": "feedback"|"feature_request", "title": "...",
               "description": "...", "contact": "..."}
        -> 200 {"ok": true, "id": "FDB-..."}

Admin (OAuth session required, same as the rest of the panel):
    GET  /api/v1/feedback                    list (filters + pagination)
    GET  /api/v1/feedback/stats              counts by status
    GET  /api/v1/feedback/{id}               full detail
    PUT  /api/v1/feedback/{id}               update status / notes

Security
--------
- No secret: the endpoint is public by design. Per-IP rate limiting
  (FEEDBACK_RATE_LIMIT_PER_MIN, default 10/min) is the primary spam defense.
- IDs are random UUIDs so they cannot be enumerated.
- Forwarding to Discord is best-effort: when the OPS CONTROL DB is not
  configured (or the pending_actions schema is outdated) the item is still
  stored and visible in the admin panel; only the forum thread is skipped.
"""

from __future__ import annotations

import json
import logging
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
from config import FEEDBACK_DB, FEEDBACK_RATE_LIMIT_PER_MIN, LOG_FILE

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])

VALID_KINDS = ("feedback", "feature_request", "bug")
VALID_STATUSES = ("new", "open", "accepted", "planned", "closed")

MAX_FIELD_CHARS = {
    "title": 160,
    "description": 8000,
    "contact": 200,
}

_db_lock = threading.Lock()
_rate: dict[str, list[float]] = defaultdict(list)
_initialized = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(FEEDBACK_DB)), timeout=15, check_same_thread=False)
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
    Path(FEEDBACK_DB).parent.mkdir(parents=True, exist_ok=True)
    with _db_lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id          TEXT PRIMARY KEY,
                    received_at TEXT NOT NULL,
                    kind        TEXT NOT NULL DEFAULT 'feedback',
                    title       TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    contact     TEXT NOT NULL DEFAULT '',
                    source      TEXT NOT NULL DEFAULT 'app',
                    status      TEXT NOT NULL DEFAULT 'new',
                    notes       TEXT NOT NULL DEFAULT '',
                    source_ip   TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_fb_received ON feedback(received_at DESC);
                CREATE INDEX IF NOT EXISTS idx_fb_status ON feedback(status);
                CREATE INDEX IF NOT EXISTS idx_fb_kind ON feedback(kind);
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
    if len(attempts) >= FEEDBACK_RATE_LIMIT_PER_MIN:
        return True
    _rate[ip].append(now)
    return False


def _row_to_item(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def _fetch_row(feedback_id: str) -> sqlite3.Row | None:
    with _db_lock:
        conn = _connect()
        try:
            return conn.execute("SELECT * FROM feedback WHERE id = ?", (feedback_id,)).fetchone()
        finally:
            conn.close()


def _forward_to_discord(item: dict[str, Any]) -> bool:
    """Best-effort enqueue of a feedback_new pending action for the bot.

    The bot opens a forum thread in the feedback forum. Failure is logged but
    never blocks ingest; the item stays visible in the admin panel either way.
    """
    payload = {
        "feedback_id": item["id"],
        "kind": item["kind"],
        "title": item["title"],
        "description": item["description"],
        "contact": item["contact"],
    }
    try:
        from discord import enqueue_pending_action

        enqueue_pending_action("feedback_new", payload)
        return True
    except HTTPException as exc:
        _log.warning("Feedback %s: Discord forward skipped (%s)", item["id"], exc.detail)
        return False
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning("Feedback %s: Discord forward failed (%s)", item["id"], exc)
        return False


# ---------------------------------------------------------------------------
# Public ingest
# ---------------------------------------------------------------------------


@router.post("")
async def ingest_feedback(request: Request):
    """Receive feedback / feature request from the app or website."""
    init_db()
    ip = client_ip(request)
    if _rate_limited(ip):
        _log.warning("Feedback form rate limited for %s", ip[:40])
        return JSONResponse(
            {"ok": False, "error": "Too many submissions from this address. Try again later."},
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

    kind = str(data.get("kind") or "feedback").strip().lower()
    if kind not in VALID_KINDS:
        kind = "feedback"
    title = clean("title")
    description = clean("description")
    contact = clean("contact")

    if not title:
        return JSONResponse({"ok": False, "error": "Please provide a short title."}, status_code=200)
    if len(description) < 10:
        return JSONResponse(
            {"ok": False, "error": "Please describe your feedback (at least 10 characters)."},
            status_code=200,
        )

    source = str(data.get("source") or "app").strip().lower()[:20]
    feedback_id = "FDB-" + uuid.uuid4().hex[:12].upper()
    now = _now_iso()

    with _db_lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO feedback (id, received_at, kind, title, description, contact, source, status, source_ip) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)",
                (feedback_id, now, kind, title, description, contact, source, ip[:120]),
            )
            conn.commit()
        finally:
            conn.close()

    item = {"id": feedback_id, "kind": kind, "title": title, "description": description, "contact": contact}
    forwarded = _forward_to_discord(item)
    _log.info("Feedback stored: %s (kind=%s, title=%s)", feedback_id, kind, title[:60])
    return JSONResponse({"ok": True, "id": feedback_id, "forwarded": forwarded})


# ---------------------------------------------------------------------------
# Admin (OAuth session required)
# ---------------------------------------------------------------------------


@router.get("")
async def list_feedback(
    request: Request,
    status: str = "",
    kind: str = "",
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    _session: dict = Depends(verify_session),
):
    """List feedback items (all fields) with optional filters + pagination."""
    init_db()
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    where: list[str] = []
    params: list[Any] = []
    if status:
        where.append("status = ?")
        params.append(status)
    if kind:
        where.append("kind = ?")
        params.append(kind)
    if q:
        where.append("(id LIKE ? OR title LIKE ? OR description LIKE ? OR contact LIKE ?)")
        params += [f"%{q}%"] * 4
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    with _db_lock:
        conn = _connect()
        try:
            total = conn.execute(f"SELECT COUNT(*) FROM feedback{clause}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM feedback{clause} ORDER BY received_at DESC LIMIT ? OFFSET ?",
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
async def feedback_stats(_session: dict = Depends(verify_session)):
    """Counts by status and kind for the admin panel header."""
    init_db()
    with _db_lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM feedback GROUP BY status"
            ).fetchall()
            kind_rows = conn.execute(
                "SELECT kind, COUNT(*) AS n FROM feedback GROUP BY kind"
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]
        finally:
            conn.close()
    counts = {s: 0 for s in VALID_STATUSES}
    for r in rows:
        counts[r["status"]] = r["n"]
    counts["total"] = total
    kinds = {k: 0 for k in VALID_KINDS}
    for r in kind_rows:
        kinds[r["kind"]] = r["n"]
    return {"ok": True, "counts": counts, "kinds": kinds}


@router.get("/{feedback_id}")
async def feedback_detail(feedback_id: str, _session: dict = Depends(verify_session)):
    """Full feedback item detail."""
    row = _fetch_row(feedback_id)
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"ok": True, "item": _row_to_item(row)}


@router.put("/{feedback_id}")
async def update_feedback(
    feedback_id: str,
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Update status and/or notes on a feedback item."""
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
                "SELECT id FROM feedback WHERE id = ?", (feedback_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Feedback not found")
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE feedback SET {set_clause} WHERE id = ?",
                (*updates.values(), feedback_id),
            )
            conn.commit()
            updated = conn.execute(
                "SELECT * FROM feedback WHERE id = ?", (feedback_id,)
            ).fetchone()
        finally:
            conn.close()

    _audit_log({
        "action": "FEEDBACK_UPDATE",
        "user": username,
        "feedback_id": feedback_id,
        "updates": list(updates),
    })
    return {"ok": True, "item": _row_to_item(updated)}
