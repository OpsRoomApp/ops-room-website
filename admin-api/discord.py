"""
OPS ROOM Admin API -- Discord Administration Backend

Endpoints for the Discord admin dashboard.
Uses the existing GitHub OAuth JWT session authentication.
All endpoints require a valid admin session.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from auth import verify_session

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/discord", tags=["discord"])

# Database path -- use the same SQLite DB as the bot
_DB_PATH = Path(
    os.getenv(
        "OPS_CONTROL_DB_PATH",
        str(Path(__file__).resolve().parents[3] / "ops-control-bot" / "data" / "ops-control.db"),
    )
)


def _get_db() -> sqlite3.Connection:
    """Open a connection to the bot database."""
    if not _DB_PATH.exists():
        raise HTTPException(status_code=503, detail="Bot database not found")
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# GET /api/discord/status
# ---------------------------------------------------------------------------


@router.get("/status")
async def discord_status(_session: dict = Depends(verify_session)):
    """Return Discord server and bot health status."""
    conn = _get_db()
    try:
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        log_count = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
        bug_count = conn.execute("SELECT COUNT(*) FROM bugs").fetchone()[0]
        ticket_count = conn.execute(
            "SELECT COUNT(*) FROM tickets WHERE status = 'open'"
        ).fetchone()[0]
        notam_count = conn.execute(
            "SELECT COUNT(*) FROM notams WHERE is_active = 1"
        ).fetchone()[0]
        flight_count = conn.execute("SELECT COUNT(*) FROM flight_logs").fetchone()[0]
    finally:
        conn.close()

    return {
        "status": "online",
        "users": user_count,
        "log_entries": log_count,
        "bugs_reported": bug_count,
        "open_tickets": ticket_count,
        "active_notams": notam_count,
        "flights_logged": flight_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /api/discord/analytics
# ---------------------------------------------------------------------------


@router.get("/analytics")
async def discord_analytics(_session: dict = Depends(verify_session)):
    """Return command usage and error analytics."""
    conn = _get_db()
    try:
        cmd_counts = conn.execute(
            "SELECT event_type, COUNT(*) as cnt FROM logs GROUP BY event_type ORDER BY cnt DESC"
        ).fetchall()

        api_failures = conn.execute(
            "SELECT detail, created_at FROM logs WHERE event_type = 'api_failure' ORDER BY created_at DESC LIMIT 20"
        ).fetchall()

        total = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    finally:
        conn.close()

    return {
        "total_events": total,
        "command_usage": [
            {"command": row["event_type"], "count": row["cnt"]} for row in cmd_counts
        ],
        "recent_api_failures": [
            {"detail": row["detail"], "time": row["created_at"]} for row in api_failures
        ],
    }


# ---------------------------------------------------------------------------
# GET /api/discord/tickets
# ---------------------------------------------------------------------------


@router.get("/tickets")
async def discord_tickets(
    _session: dict = Depends(verify_session),
    status: str = "open",
):
    """Return support tickets and bug reports."""
    conn = _get_db()
    try:
        tickets = conn.execute(
            "SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT 50",
            (status,),
        ).fetchall()

        bugs = conn.execute(
            "SELECT * FROM bugs WHERE status = ? ORDER BY created_at DESC LIMIT 50",
            (status,),
        ).fetchall()
    finally:
        conn.close()

    return {
        "tickets": [
            {
                "id": t["id"],
                "user": t["username"],
                "category": t["category"],
                "description": (t["description"] or "")[:500],
                "created_at": t["created_at"],
                "thread_id": t["thread_id"],
            }
            for t in tickets
        ],
        "bugs": [
            {
                "id": b["id"],
                "reporter": b["reporter_name"],
                "version": b["version"],
                "module": b["module"],
                "description": (b["description"] or "")[:300],
                "created_at": b["created_at"],
            }
            for b in bugs
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/discord/announcement
# ---------------------------------------------------------------------------


@router.post("/announcement")
async def create_announcement(
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Create a scheduled announcement entry."""
    body = await request.json()

    title = str(body.get("title", "")).strip()
    content = str(body.get("content", "")).strip()
    channel_id = int(body.get("channel_id", 0))
    scheduled_at = body.get("scheduled_at")

    if not title or not content or not channel_id:
        raise HTTPException(
            status_code=400, detail="title, content, and channel_id are required"
        )

    conn = _get_db()
    try:
        conn.execute(
            """
            INSERT INTO discord_announcements (title, content, channel_id, scheduled_at, status)
            VALUES (?, ?, ?, ?, 'pending')
            """,
            (title, content, channel_id, scheduled_at),
        )
        conn.commit()
        announcement_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    finally:
        conn.close()

    return {"id": announcement_id, "status": "pending", "message": "Announcement scheduled"}


# ---------------------------------------------------------------------------
# POST /api/discord/broadcast
# ---------------------------------------------------------------------------


@router.post("/announcements")
@router.post("/broadcast")  # Legacy alias
async def broadcast_announcement(
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Broadcast an announcement immediately."""
    body = await request.json()

    title = str(body.get("title", "")).strip()
    content = str(body.get("content", "")).strip()
    channel_id = int(body.get("channel_id", 0))

    if not title or not content or not channel_id:
        raise HTTPException(
            status_code=400, detail="title, content, and channel_id are required"
        )

    conn = _get_db()
    try:
        conn.execute(
            """
            INSERT INTO discord_announcements (title, content, channel_id, announced_at, status)
            VALUES (?, ?, ?, ?, 'sent')
            """,
            (title, content, channel_id, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        announcement_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    finally:
        conn.close()

    return {
        "id": announcement_id,
        "status": "sent",
        "message": "Announcement recorded. The bot will dispatch it to the target channel.",
    }
