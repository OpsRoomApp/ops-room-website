"""
OPS ROOM Admin API -- Discord Administration Backend

Full Discord Operations Console backend.
Uses the existing GitHub OAuth JWT session authentication.
Reads from / writes to the OPS CONTROL bot SQLite database.

Architecture: Admin panel -> SQLite (writes pending actions) -> Bot polls & dispatches to Discord.
The admin API never touches the Discord token.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from auth import verify_session
import allowlist

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/discord", tags=["discord"])


def _resolve_db_path() -> str | None:
    for key in ("OPS_CONTROL_DB", "OPS_CONTROL_DB_PATH", "DATABASE_PATH"):
        value = os.getenv(key)
        if value and value.strip():
            return value.strip()
    return None


_DB_NOT_CONFIGURED = (
    "OPS CONTROL database is not configured. Set OPS_CONTROL_DB."
)


def _get_db() -> sqlite3.Connection:
    db_path = _resolve_db_path()
    if not db_path:
        raise HTTPException(status_code=503, detail=_DB_NOT_CONFIGURED)
    db = Path(db_path)
    if not db.is_file():
        raise HTTPException(status_code=503, detail=f"Database not found: {db_path}")
    try:
        conn = sqlite3.connect(str(db), timeout=10)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    conn.row_factory = sqlite3.Row
    # Shared database with the bot container: WAL + busy timeout avoid
    # "database is locked" errors under concurrent access.
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


# Canonical pending_actions columns the bot owns. The admin API must never
# diverge from this schema. Validated before queue writes.
_CANONICAL_PENDING_COLUMNS = {
    "id", "action_type", "payload_json", "status", "created_at",
    "scheduled_at", "processing_started_at", "processed_at",
    "attempts", "error", "result_json",
}


def _validate_pending_schema(conn: sqlite3.Connection) -> None:
    """Return a clear error if the shared DB is incompatible with the queue.

    The bot owns schema migration; if a legacy `payload`-only table exists
    the bot will rebuild it on next start. Until then we refuse to write.
    """
    try:
        rows = conn.execute("PRAGMA table_info(pending_actions)").fetchall()
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=503,
            detail="OPS CONTROL database unavailable: could not inspect pending_actions",
        ) from exc
    cols = {r["name"] for r in rows}
    if not cols:
        raise HTTPException(
            status_code=503,
            detail="pending_actions table missing. Restart the OPS CONTROL bot to create it.",
        )
    missing = _CANONICAL_PENDING_COLUMNS - cols
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "pending_actions schema is outdated; the OPS CONTROL bot will migrate it "
                f"on next start. Missing columns: {sorted(missing)}"
            ),
        )


@contextmanager
def _db_session() -> Iterator[sqlite3.Connection]:
    conn = _get_db()
    try:
        yield conn
        conn.commit()
    except sqlite3.Error as exc:
        _log.error("DB query failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database query failed") from exc
    finally:
        conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ===================================================================
# GET /api/discord/status  (expanded)
# ===================================================================


@router.get("/status")
async def discord_status(_session: dict = Depends(verify_session)):
    with _db_session() as conn:
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        log_count = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
        bug_count = conn.execute("SELECT COUNT(*) FROM bugs").fetchone()[0]
        ticket_open = conn.execute(
            "SELECT COUNT(*) FROM tickets WHERE status = 'open'"
        ).fetchone()[0]
        ticket_closed = conn.execute(
            "SELECT COUNT(*) FROM tickets WHERE status = 'closed'"
        ).fetchone()[0]
        notam_count = conn.execute(
            "SELECT COUNT(*) FROM notams WHERE is_active = 1"
        ).fetchone()[0]
        flight_count = conn.execute("SELECT COUNT(*) FROM flight_logs").fetchone()[0]
        announcement_count = conn.execute(
            "SELECT COUNT(*) FROM discord_announcements"
        ).fetchone()[0]
        simbrief_count = conn.execute(
            "SELECT COUNT(*) FROM simbrief_accounts"
        ).fetchone()[0]
        beta_count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE beta_status = 1"
        ).fetchone()[0]

    return {
        "status": "online",
        "users": user_count,
        "beta_testers": beta_count,
        "log_entries": log_count,
        "bugs_reported": bug_count,
        "open_tickets": ticket_open,
        "closed_tickets": ticket_closed,
        "active_notams": notam_count,
        "flights_logged": flight_count,
        "announcements_sent": announcement_count,
        "simbrief_linked": simbrief_count,
        "timestamp": _now_iso(),
    }


# ===================================================================
# GET /api/discord/analytics  (expanded)
# ===================================================================


@router.get("/analytics")
async def discord_analytics(_session: dict = Depends(verify_session)):
    with _db_session() as conn:
        cmd_counts = conn.execute(
            "SELECT event_type, COUNT(*) as cnt FROM logs "
            "GROUP BY event_type ORDER BY cnt DESC LIMIT 30"
        ).fetchall()

        total = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]

        # Active users in last 7 days
        active = conn.execute(
            "SELECT username, COUNT(*) as cnt FROM logs "
            "WHERE created_at > datetime('now', '-7 days') "
            "GROUP BY username ORDER BY cnt DESC LIMIT 20"
        ).fetchall()

        # Command usage over last 30 days by day
        cmd_timeline = conn.execute(
            "SELECT DATE(created_at) as day, event_type, COUNT(*) as cnt "
            "FROM logs WHERE event_type = 'command' "
            "AND created_at > datetime('now', '-30 days') "
            "GROUP BY day ORDER BY day DESC LIMIT 30"
        ).fetchall()

    return {
        "total_events": total,
        "command_usage": [
            {"command": row["event_type"], "count": row["cnt"]}
            for row in cmd_counts
        ],
        "active_users": [
            {"username": row["username"], "actions": row["cnt"]}
            for row in active
        ],
        "command_timeline": [
            {"day": row["day"], "command": row["event_type"], "count": row["cnt"]}
            for row in cmd_timeline
        ],
    }


# ===================================================================
# GET /api/discord/tickets  (expanded with status, assigned_to, priority)
# ===================================================================


@router.get("/tickets")
async def discord_tickets(
    _session: dict = Depends(verify_session),
    status: str = Query("all", pattern=r"^(open|closed|all)$"),
):
    with _db_session() as conn:
        if status == "all":
            tix_rows = conn.execute(
                "SELECT id, user_id, username, category, priority, subject, "
                "description, status, assigned_to, channel_id, "
                "thread_id, created_at, updated_at "
                "FROM tickets ORDER BY created_at DESC LIMIT 100"
            ).fetchall()
        else:
            tix_rows = conn.execute(
                "SELECT id, user_id, username, category, priority, subject, "
                "description, status, assigned_to, channel_id, "
                "thread_id, created_at, updated_at "
                "FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT 100",
                (status,),
            ).fetchall()

        bug_rows = conn.execute(
            "SELECT id, reporter_id AS user_id, reporter_name AS username, "
            "title AS subject, version, module, description, status, "
            "assigned_to, channel_id, created_at "
            "FROM bugs WHERE status = ? ORDER BY created_at DESC LIMIT 50",
            (status if status != "all" else "open",),
        ).fetchall()

    return {
        "tickets": [
            {
                "id": t["id"],
                "user_id": t["user_id"],
                "username": t["username"],
                "category": t["category"],
                "priority": t["priority"] or "Normal",
                "subject": t["subject"],
                "description": (t["description"] or "")[:500],
                "status": t["status"],
                "assigned_to": t["assigned_to"],
                "channel_id": t["channel_id"],
                "created_at": t["created_at"],
                "updated_at": t["updated_at"],
            }
            for t in tix_rows
        ],
        "bugs": [
            {
                "id": b["id"],
                "user_id": b["user_id"],
                "username": b["username"],
                "subject": b["subject"],
                "version": b["version"],
                "module": b["module"],
                "description": (b["description"] or "")[:300],
                "status": b["status"],
                "assigned_to": b["assigned_to"],
                "channel_id": b["channel_id"],
                "created_at": b["created_at"],
            }
            for b in bug_rows
        ],
    }


# ===================================================================
# POST /api/discord/tickets/{id}/assign
# ===================================================================


@router.post("/tickets/{ticket_id}/assign")
async def assign_ticket(
    ticket_id: int,
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    assigned_to = int(body.get("assigned_to", 0))

    with _db_session() as conn:
        conn.execute(
            "UPDATE tickets SET assigned_to = ?, updated_at = ? WHERE id = ?",
            (assigned_to, _now_iso(), ticket_id),
        )

    return {"ok": True, "ticket_id": ticket_id, "assigned_to": assigned_to}


# ===================================================================
# POST /api/discord/tickets/{id}/close
# ===================================================================


@router.post("/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: int,
    _session: dict = Depends(verify_session),
):
    """Close a support ticket. Does not affect the bugs table."""
    with _db_session() as conn:
        conn.execute(
            "UPDATE tickets SET status = 'closed', updated_at = ? WHERE id = ?",
            (_now_iso(), ticket_id),
        )

    return {"ok": True, "ticket_id": ticket_id, "status": "closed"}


# ===================================================================
# POST /api/discord/bugs/{bug_id}/close
# ===================================================================


@router.post("/bugs/{bug_id}/close")
async def close_bug(
    bug_id: int,
    _session: dict = Depends(verify_session),
):
    """Close a bug report."""
    with _db_session() as conn:
        conn.execute(
            "UPDATE bugs SET status = 'closed', updated_at = ? WHERE id = ?",
            (_now_iso(), bug_id),
        )

    return {"ok": True, "bug_id": bug_id, "status": "closed"}


# ===================================================================
# POST /api/discord/tickets/{id}/reopen
# ===================================================================


@router.post("/tickets/{ticket_id}/reopen")
async def reopen_ticket(
    ticket_id: int,
    _session: dict = Depends(verify_session),
):
    with _db_session() as conn:
        conn.execute(
            "UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?",
            (_now_iso(), ticket_id),
        )

    return {"ok": True, "ticket_id": ticket_id, "status": "open"}


# ===================================================================
# GET /api/discord/announcements  (list previous)
# ===================================================================


@router.get("/announcements")
async def list_announcements(_session: dict = Depends(verify_session)):
    """List announcements plus their live dispatch-queue status."""
    with _db_session() as conn:
        rows = conn.execute(
            "SELECT id, title, content, channel_id, scheduled_at, announced_at, status "
            "FROM discord_announcements ORDER BY id DESC LIMIT 50"
        ).fetchall()
        pending = conn.execute(
            "SELECT id, action_type, payload_json, status, scheduled_at "
            "FROM pending_actions "
            "WHERE action_type IN ('announcement','scheduled_announcement','announce_dispatch') "
            "ORDER BY id DESC LIMIT 100"
        ).fetchall()

    pending_by_announcement: dict = {}
    for p in pending:
        try:
            payload = json.loads(p["payload_json"] or "{}")
        except (json.JSONDecodeError, TypeError):
            payload = {}
        ann_id = payload.get("announcement_id")
        if ann_id is not None:
            pending_by_announcement[int(ann_id)] = {
                "queue_id": p["id"],
                "action_type": p["action_type"],
                "status": p["status"],
                "scheduled_at": p["scheduled_at"],
                "attempts": payload.get("attempts", 0),
            }

    result = []
    for r in rows:
        item = {
            "id": r["id"],
            "title": r["title"],
            "content": (r["content"] or "")[:200],
            "channel_id": r["channel_id"],
            "scheduled_at": r["scheduled_at"],
            "announced_at": r["announced_at"],
            "status": r["status"],
        }
        queue = pending_by_announcement.get(r["id"])
        if queue:
            # The live dispatch status (pending/scheduled/processing/completed/failed)
            item["queue_status"] = queue["status"]
            item["queue_id"] = queue["queue_id"]
            item["queue_action_type"] = queue["action_type"]
        else:
            item["queue_status"] = None
        result.append(item)
    return result


# ===================================================================
# GET /api/discord/pending-actions  (monitor the dispatch queue)
# ===================================================================


@router.get("/pending-actions")
async def list_pending_actions(
    _session: dict = Depends(verify_session),
    status: str = Query("", max_length=20),
    limit: int = Query(50, ge=1, le=200),
):
    """Monitor the pending_actions queue (statuses + recent actions)."""
    with _db_session() as conn:
        counts = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM pending_actions GROUP BY status"
        ).fetchall()
        if status:
            rows = conn.execute(
                "SELECT id, action_type, status, created_at, scheduled_at, "
                "processing_started_at, processed_at, attempts, error, result_json "
                "FROM pending_actions WHERE status = ? ORDER BY id DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, action_type, status, created_at, scheduled_at, "
                "processing_started_at, processed_at, attempts, error, result_json "
                "FROM pending_actions ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()

    counts_map = {"pending": 0, "scheduled": 0, "processing": 0, "completed": 0, "failed": 0}
    for c in counts:
        counts_map[c["status"]] = c["cnt"]

    return {
        "counts": counts_map,
        "actions": [
            {
                "id": r["id"],
                "action_type": r["action_type"],
                "status": r["status"],
                "created_at": r["created_at"],
                "scheduled_at": r["scheduled_at"],
                "processing_started_at": r["processing_started_at"],
                "processed_at": r["processed_at"],
                "attempts": r["attempts"],
                "error": r["error"],
                "result_json": r["result_json"],
            }
            for r in rows
        ],
    }


# ===================================================================
# POST /api/discord/announcement  (create announcement)
# ===================================================================


@router.post("/announcement")
async def create_announcement(
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    title = str(body.get("title", "")).strip()
    content = str(body.get("content", "")).strip()
    channel_id = int(body.get("channel_id", 0))
    scheduled_at = body.get("scheduled_at") or None
    embed_color = body.get("embed_color") or None
    image_url = body.get("image_url") or None

    if not title or not content or not channel_id:
        raise HTTPException(status_code=400, detail="title, content, and channel_id are required")

    with _db_session() as conn:
        _validate_pending_schema(conn)

        # Status: 'scheduled' when a future time is set, else 'pending'.
        row_status = "scheduled" if scheduled_at else "pending"
        conn.execute(
            """
            INSERT INTO discord_announcements
                (title, content, channel_id, scheduled_at, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (title, content, channel_id, scheduled_at, row_status),
        )
        announcement_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # ALWAYS enqueue a pending action for the bot to dispatch.
        # Canonical columns only: payload_json, status, created_at, scheduled_at.
        action_type = "scheduled_announcement" if scheduled_at else "announcement"
        payload = {
            "announcement_id": announcement_id,
            "title": title,
            "content": content,
            "channel_id": channel_id,
            "scheduled_at": scheduled_at,
        }
        if embed_color:
            payload["embed_color"] = embed_color
        if image_url:
            payload["image_url"] = image_url

        conn.execute(
            """
            INSERT INTO pending_actions
                (action_type, payload_json, status, created_at, scheduled_at)
            VALUES (?, ?, 'pending', ?, ?)
            """,
            (action_type, json.dumps(payload), _now_iso(), scheduled_at),
        )

    return {
        "id": announcement_id,
        "status": row_status,
        "message": "Announcement scheduled" if scheduled_at else "Announcement queued for dispatch",
    }


# ===================================================================
# GET /api/discord/users  (search)
# ===================================================================


@router.get("/users")
async def list_users(
    _session: dict = Depends(verify_session),
    search: str = Query("", max_length=100),
    limit: int = Query(50, ge=1, le=200),
):
    with _db_session() as conn:
        if search:
            rows = conn.execute(
                "SELECT id, username, display_name, simulator, network, "
                "opsroom_version, beta_status, first_joined, last_seen, is_active "
                "FROM users WHERE username LIKE ? OR display_name LIKE ? "
                "ORDER BY last_seen DESC LIMIT ?",
                (f"%{search}%", f"%{search}%", limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, username, display_name, simulator, network, "
                "opsroom_version, beta_status, first_joined, last_seen, is_active "
                "FROM users ORDER BY last_seen DESC LIMIT ?",
                (limit,),
            ).fetchall()

    return [
        {
            "discord_id": r["id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "simulator": r["simulator"],
            "network": r["network"],
            "opsroom_version": r["opsroom_version"],
            "beta_status": bool(r["beta_status"]),
            "first_joined": r["first_joined"],
            "last_seen": r["last_seen"],
            "is_active": bool(r["is_active"]),
        }
        for r in rows
    ]


# ===================================================================
# GET /api/discord/users/{discord_id}  (profile detail)
# ===================================================================


@router.get("/users/{discord_id}")
async def get_user(discord_id: int, _session: dict = Depends(verify_session)):
    with _db_session() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (discord_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        # Get recent tickets by this user
        tickets = conn.execute(
            "SELECT id, subject, category, status, created_at "
            "FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
            (discord_id,),
        ).fetchall()

        bugs = conn.execute(
            "SELECT id, title, module, version, status, created_at "
            "FROM bugs WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 10",
            (discord_id,),
        ).fetchall()

        simbrief = conn.execute(
            "SELECT simbrief_user, static_id, created_at "
            "FROM simbrief_accounts WHERE discord_id = ?",
            (discord_id,),
        ).fetchone()

        flight_count = conn.execute(
            "SELECT COUNT(*) FROM flight_logs WHERE user_id = ?", (discord_id,)
        ).fetchone()[0]

    return {
        "discord_id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "simulator": row["simulator"],
        "network": row["network"],
        "opsroom_version": row["opsroom_version"],
        "beta_status": bool(row["beta_status"]),
        "first_joined": row["first_joined"],
        "last_seen": row["last_seen"],
        "is_active": bool(row["is_active"]),
        "flights_logged": flight_count,
        "simbrief": {
            "username": simbrief["simbrief_user"] if simbrief else None,
            "static_id": simbrief["static_id"] if simbrief else None,
        } if simbrief else None,
        "recent_tickets": [
            {
                "id": t["id"],
                "subject": t["subject"],
                "category": t["category"],
                "status": t["status"],
                "created_at": t["created_at"],
            }
            for t in tickets
        ],
        "recent_bugs": [
            {
                "id": b["id"],
                "title": b["title"],
                "module": b["module"],
                "version": b["version"],
                "status": b["status"],
                "created_at": b["created_at"],
            }
            for b in bugs
        ],
    }


# ===================================================================
# GET /api/discord/beta-testers  (search)
# ===================================================================


@router.get("/beta-testers")
async def list_beta_testers(
    _session: dict = Depends(verify_session),
    search: str = Query("", max_length=100),
    beta_only: bool = Query(False),
):
    with _db_session() as conn:
        if beta_only:
            rows = conn.execute(
                "SELECT id, username, display_name, beta_status, simulator, "
                "network, opsroom_version, first_joined, last_seen "
                "FROM users WHERE beta_status = 1 "
                "ORDER BY last_seen DESC LIMIT 100"
            ).fetchall()
        elif search:
            rows = conn.execute(
                "SELECT id, username, display_name, beta_status, simulator, "
                "network, opsroom_version, first_joined, last_seen "
                "FROM users WHERE username LIKE ? OR display_name LIKE ? "
                "ORDER BY last_seen DESC LIMIT 50",
                (f"%{search}%", f"%{search}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, username, display_name, beta_status, simulator, "
                "network, opsroom_version, first_joined, last_seen "
                "FROM users ORDER BY last_seen DESC LIMIT 50"
            ).fetchall()

    return [
        {
            "discord_id": r["id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "beta_status": bool(r["beta_status"]),
            "simulator": r["simulator"],
            "network": r["network"],
            "opsroom_version": r["opsroom_version"],
            "first_joined": r["first_joined"],
            "last_seen": r["last_seen"],
        }
        for r in rows
    ]


# ===================================================================
# POST /api/discord/beta-testers/{discord_id}  (add/remove tester)
# ===================================================================


@router.post("/beta-testers/{discord_id}")
async def update_beta_tester(
    discord_id: int,
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    action = str(body.get("action", "")).strip().lower()
    admin_user = str(_session.get("sub", "unknown"))

    if action not in ("add_verified", "remove_verified", "add_beta", "remove_beta"):
        raise HTTPException(
            status_code=400,
            detail="action must be add_verified, remove_verified, add_beta, or remove_beta",
        )

    # add_verified/remove_verified toggle beta_status; add_beta/remove_beta handle public beta separately
    is_add = action.startswith("add")

    with _db_session() as conn:
        existing = conn.execute(
            "SELECT id, username, beta_status FROM users WHERE id = ?", (discord_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"User {discord_id} not found")

        # determine new beta_status based on action
        current_beta = existing["beta_status"] or 0
        if action == "add_verified":
            new_beta = 1
        elif action == "remove_verified":
            new_beta = 0
        elif action == "add_beta":
            new_beta = current_beta  # keep verified status unchanged, just queue public beta role
        else:  # remove_beta
            new_beta = current_beta

        if action in ("add_verified", "remove_verified"):
            conn.execute(
                "UPDATE users SET beta_status = ?, last_seen = ? WHERE id = ?",
                (new_beta, _now_iso(), discord_id),
            )

        # Queue a pending action for the bot to assign/remove Discord roles.
        # Canonical columns only (payload_json); legacy 'payload' is rebuilt
        # by the bot's migration.
        _validate_pending_schema(conn)
        conn.execute(
            """
            INSERT INTO pending_actions (action_type, payload_json, status, created_at)
            VALUES (?, ?, 'pending', ?)
            """,
            (
                action,
                json.dumps({
                    "discord_id": discord_id,
                    "username": existing["username"],
                    "action": action,
                    "initiated_by": admin_user,
                }),
                _now_iso(),
            ),
        )

    return {
        "ok": True,
        "discord_id": discord_id,
        "username": existing["username"],
        "beta_status": bool(new_beta),
        "action": action,
    }


# ===================================================================
# GET /api/discord/audit-logs  (filtered)
# ===================================================================


@router.get("/audit-logs")
async def audit_logs(
    _session: dict = Depends(verify_session),
    event_type: str = Query("", max_length=50),
    user_id: int = Query(0),
    start_date: str = Query("", max_length=25),
    end_date: str = Query("", max_length=25),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    with _db_session() as conn:
        conditions = []
        params: list = []

        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if user_id:
            conditions.append("user_id = ?")
            params.append(user_id)
        if start_date:
            conditions.append("created_at >= ?")
            params.append(start_date)
        if end_date:
            conditions.append("created_at <= ?")
            params.append(end_date)

        where = " AND ".join(conditions) if conditions else "1=1"

        total = conn.execute(
            f"SELECT COUNT(*) FROM logs WHERE {where}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"SELECT * FROM logs WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": [
            {
                "id": r["id"],
                "event_type": r["event_type"],
                "user_id": r["user_id"],
                "username": r["username"],
                "guild_id": r["guild_id"],
                "channel_id": r["channel_id"],
                "detail": r["detail"],
                "created_at": r["created_at"],
            }
            for r in rows
        ],
    }


# ===================================================================
# GET /api/discord/audit-logs/types  (distinct event types)
# ===================================================================


@router.get("/audit-logs/types")
async def audit_log_types(_session: dict = Depends(verify_session)):
    with _db_session() as conn:
        rows = conn.execute(
            "SELECT DISTINCT event_type, COUNT(*) as cnt FROM logs GROUP BY event_type ORDER BY cnt DESC"
        ).fetchall()

    return [{"event_type": r["event_type"], "count": r["cnt"]} for r in rows]


# ===================================================================
# GET /api/discord/analytics/tickets  (C2 -- volume + response-time analytics)
# ===================================================================


@router.get("/analytics/tickets")
async def ticket_analytics(_session: dict = Depends(verify_session)):
    """Ticket volume + response-time analytics computed from the tickets table.

    Averages are computed in Python from ISO timestamps so the admin API
    does not depend on SQLite's datetime() quirks with timezone offsets.
    """
    from datetime import datetime

    def _parse_iso(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    with _db_session() as conn:
        rows = conn.execute(
            "SELECT id, priority, status, created_at, assigned_to, closed_at "
            "FROM tickets ORDER BY created_at"
        ).fetchall()

    volume_by_day: dict[str, int] = {}
    volume_by_priority: dict[str, int] = {}
    claim_seconds: list[float] = []
    close_seconds: list[float] = []
    closed_with_reason = 0

    for r in rows:
        created = _parse_iso(r["created_at"])
        if created:
            day = created.date().isoformat()
            volume_by_day[day] = volume_by_day.get(day, 0) + 1
        priority = r["priority"] or "Normal"
        volume_by_priority[priority] = volume_by_priority.get(priority, 0) + 1

        closed_at = _parse_iso(r["closed_at"])
        if created and closed_at:
            close_seconds.append((closed_at - created).total_seconds())
        if r["status"] == "closed":
            closed_with_reason += 1

    # Time-to-claim: approximated as created -> first assignment update.
    # The bot updates updated_at on assign; use assigned_to presence as a
    # proxy for claimed tickets and their created->updated delta.
    with _db_session() as conn:
        claim_rows = conn.execute(
            "SELECT created_at, updated_at FROM tickets WHERE assigned_to IS NOT NULL"
        ).fetchall()
    for r in claim_rows:
        created = _parse_iso(r["created_at"])
        updated = _parse_iso(r["updated_at"])
        if created and updated:
            claim_seconds.append((updated - created).total_seconds())

    def _avg(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 1) if values else None

    # Last 14 days of volume, oldest first.
    days = sorted(volume_by_day.keys())[-14:]
    volume_series = [{"day": d, "count": volume_by_day.get(d, 0)} for d in days]

    return {
        "total": len(rows),
        "volume_by_day": volume_series,
        "volume_by_priority": volume_by_priority,
        "avg_time_to_claim_minutes": round(_avg(claim_seconds) / 60, 1) if claim_seconds else None,
        "avg_time_to_close_minutes": round(_avg(close_seconds) / 60, 1) if close_seconds else None,
        "closed_with_reason": closed_with_reason,
    }


# ===================================================================
# GET /api/discord/moderation-cases  (C2 -- per-user + global feed)
# ===================================================================


@router.get("/moderation-cases")
async def moderation_cases(
    _session: dict = Depends(verify_session),
    user_id: int = Query(0),
    action_type: str = Query("", max_length=30),
    limit: int = Query(100, ge=1, le=300),
):
    with _db_session() as conn:
        conditions: list[str] = []
        params: list = []
        if user_id:
            conditions.append("user_id = ?")
            params.append(user_id)
        if action_type:
            conditions.append("action_type = ?")
            params.append(action_type)
        where = " AND ".join(conditions) if conditions else "1=1"
        rows = conn.execute(
            f"SELECT * FROM moderation_cases WHERE {where} ORDER BY created_at DESC LIMIT ?",
            params + [limit],
        ).fetchall()
    return {
        "cases": [dict(r) for r in rows],
        "total": len(rows),
    }


# ===================================================================
# GET/PUT /api/discord/automod-config  (C2 -- automod rules CRUD)
# ===================================================================


@router.get("/automod-config")
async def get_automod_config(_session: dict = Depends(verify_session)):
    with _db_session() as conn:
        rows = conn.execute(
            "SELECT rule_key, enabled, action, threshold, config_json, updated_at "
            "FROM automod_config ORDER BY rule_key"
        ).fetchall()
    return {"rules": [dict(r) for r in rows]}


@router.put("/automod-config/{rule_key}")
async def update_automod_config(
    rule_key: str,
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    enabled = int(bool(body.get("enabled", True)))
    action = str(body.get("action", "warn")).strip()
    threshold = body.get("threshold")
    config_json = body.get("config_json")
    if action not in ("warn", "timeout", "delete", "log"):
        raise HTTPException(status_code=400, detail="action must be warn, timeout, delete, or log")

    with _db_session() as conn:
        conn.execute(
            """
            INSERT INTO automod_config (rule_key, enabled, action, threshold, config_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(rule_key) DO UPDATE SET
                enabled=excluded.enabled, action=excluded.action,
                threshold=excluded.threshold, config_json=excluded.config_json,
                updated_at=excluded.updated_at
            """,
            (rule_key, enabled, action, threshold, config_json, _now_iso()),
        )
    return {"ok": True, "rule_key": rule_key}


# ===================================================================
# GET /api/discord/appeals  +  POST /api/discord/appeals/{id}/review
# (C2 -- appeal review queue; approve reverses the action via pending_actions)
# ===================================================================


@router.get("/appeals")
async def list_appeals(
    _session: dict = Depends(verify_session),
    status: str = Query("", max_length=20),
):
    with _db_session() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM appeals WHERE status = ? ORDER BY created_at DESC LIMIT 200",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM appeals ORDER BY created_at DESC LIMIT 200"
            ).fetchall()
    return {"appeals": [dict(r) for r in rows], "total": len(rows)}


@router.post("/appeals/{appeal_id}/review")
async def review_appeal(
    appeal_id: int,
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Approve or deny an appeal.

    Approval must have a real-world effect: a `moderation_reverse` pending
    action is enqueued for the bot dispatcher, which performs the unban or
    removes the timeout. Denial just updates the appeal row.
    """
    body = await request.json()
    decision = str(body.get("decision", "")).strip().lower()
    resolution = str(body.get("resolution", "")).strip()
    if decision not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'denied'")

    with _db_session() as conn:
        row = conn.execute("SELECT * FROM appeals WHERE id = ?", (appeal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Appeal not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Appeal already reviewed")

        conn.execute(
            "UPDATE appeals SET status=?, reviewed_by=?, reviewed_at=?, resolution=? WHERE id=?",
            (decision, int(_session.get("discord_id") or _session.get("sub", "unknown")), _now_iso(), resolution, appeal_id),
        )

        if decision == "approved" and row["user_id"]:
            # Enqueue a moderation_reverse action for the bot dispatcher.
            _validate_pending_schema(conn)
            reverse_action = str(row["action_type"] or "ban").lower()
            conn.execute(
                """
                INSERT INTO pending_actions (action_type, payload_json, status, created_at)
                VALUES ('moderation_reverse', ?, 'pending', ?)
                """,
                (
                    json.dumps({
                        "discord_id": row["user_id"],
                        "reverse_action": reverse_action,
                        "appeal_id": appeal_id,
                        "resolution": resolution,
                    }),
                    _now_iso(),
                ),
            )

    return {"ok": True, "appeal_id": appeal_id, "decision": decision}


# ===================================================================
# Staff allowlist management (C2.7 -- source of truth is staff_allowlist table)
# ===================================================================


@router.get("/staff-allowlist")
async def get_staff_allowlist(
    _session: dict = Depends(verify_session),
    provider: str = Query("", max_length=20),
):
    return {"entries": allowlist.list_allowlist(provider)}


@router.post("/staff-allowlist")
async def add_staff_allowlist(
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    provider = str(body.get("provider", "")).strip().lower()
    identifier = str(body.get("identifier", "")).strip()
    display = str(body.get("display", "")).strip() or None
    if provider not in ("github", "discord"):
        raise HTTPException(status_code=400, detail="provider must be 'github' or 'discord'")
    if not identifier:
        raise HTTPException(status_code=400, detail="identifier is required")
    try:
        result = allowlist.add_entry(provider, identifier, display, added_by=int(_session.get("discord_id") or 0) or None)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return result


@router.delete("/staff-allowlist")
async def remove_staff_allowlist(
    request: Request,
    _session: dict = Depends(verify_session),
):
    body = await request.json()
    provider = str(body.get("provider", "")).strip().lower()
    identifier = str(body.get("identifier", "")).strip()
    if provider not in ("github", "discord") or not identifier:
        raise HTTPException(status_code=400, detail="provider and identifier are required")
    removed = allowlist.remove_entry(provider, identifier)
    return {"ok": removed}
