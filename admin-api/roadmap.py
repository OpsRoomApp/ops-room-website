"""
OPS ROOM Admin API - Roadmap (v0.26)

Admin-managed development roadmap, served publicly for the Discord bot
(/roadmap command) and published to a Discord channel on demand.

Endpoints
---------
Public (no auth):
    GET /api/public/roadmap
        -> {"ok": true, "current_sprint": "...", "revision": 5,
            "items": [{"id", "title", "status", "sprint", "sort_order"}, ...]}

Admin (OAuth session required):
    GET    /api/v1/roadmap                  list items + meta
    POST   /api/v1/roadmap/items            create item
    PUT    /api/v1/roadmap/items/{id}       update item
    DELETE /api/v1/roadmap/items/{id}       delete item
    PUT    /api/v1/roadmap/meta             set current_sprint
    POST   /api/v1/roadmap/publish          enqueue a roadmap_update
                                            pending_action for the bot

The roadmap is public by design (it is a roadmap). Publishing to Discord
only enqueues a pending_action into the shared OPS CONTROL database; the bot
dispatches it with its own identity to DISCORD_ROADMAP_CHANNEL_ID. When the
OPS CONTROL DB is not configured the publish endpoint reports that clearly
instead of failing the whole request.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import verify_session
from config import LOG_FILE, ROADMAP_DB

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/roadmap", tags=["roadmap"])
public_router = APIRouter(prefix="/api/public/roadmap", tags=["roadmap-public"])

VALID_STATUSES = ("planned", "in_progress", "completed")

_db_lock = threading.Lock()
_initialized = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(ROADMAP_DB)), timeout=15, check_same_thread=False)
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
    Path(ROADMAP_DB).parent.mkdir(parents=True, exist_ok=True)
    with _db_lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS roadmap_items (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    title       TEXT NOT NULL,
                    status      TEXT NOT NULL DEFAULT 'planned',
                    sprint      TEXT NOT NULL DEFAULT '',
                    sort_order  INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_rm_status ON roadmap_items(status);
                CREATE TABLE IF NOT EXISTS roadmap_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
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


def _get_meta(conn: sqlite3.Connection, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM roadmap_meta WHERE key = ?", (key,)).fetchone()
    return str(row["value"]) if row else default


def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO roadmap_meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def _bump_revision(conn: sqlite3.Connection) -> int:
    rev = int(_get_meta(conn, "revision", "0")) + 1
    _set_meta(conn, "revision", str(rev))
    return rev


def _item_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "sprint": row["sprint"],
        "sort_order": row["sort_order"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _snapshot(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT * FROM roadmap_items ORDER BY sort_order ASC, id ASC"
    ).fetchall()
    items = [_item_to_dict(r) for r in rows]
    current_sprint = _get_meta(conn, "current_sprint")
    revision = int(_get_meta(conn, "revision", "0"))
    return {
        "current_sprint": current_sprint,
        "revision": revision,
        "items": items,
        "grouped": {
            "planned": [i for i in items if i["status"] == "planned"],
            "in_progress": [i for i in items if i["status"] == "in_progress"],
            "completed": [i for i in items if i["status"] == "completed"],
        },
    }


# ---------------------------------------------------------------------------
# Public (no auth): used by the Discord bot /roadmap command.
# ---------------------------------------------------------------------------


@public_router.get("")
def public_roadmap() -> dict[str, Any]:
    init_db()
    with _db_lock:
        conn = _connect()
        try:
            data = _snapshot(conn)
        finally:
            conn.close()
    return {"ok": True, **data}


# ---------------------------------------------------------------------------
# Admin (OAuth session required)
# ---------------------------------------------------------------------------


def _fetch_item(conn: sqlite3.Connection, item_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM roadmap_items WHERE id = ?", (item_id,)
    ).fetchone()


@router.get("")
async def roadmap_list(_session: dict = Depends(verify_session)) -> dict[str, Any]:
    init_db()
    with _db_lock:
        conn = _connect()
        try:
            data = _snapshot(conn)
        finally:
            conn.close()
    return {"ok": True, **data}


@router.post("/items")
async def roadmap_create(
    request: Request,
    _session: dict = Depends(verify_session),
) -> dict[str, Any]:
    init_db()
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    title = str(body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    status = str(body.get("status") or "planned").strip().lower()
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    sprint = str(body.get("sprint") or "").strip()[:80]
    try:
        sort_order = int(body.get("sort_order", 0))
    except (TypeError, ValueError):
        sort_order = 0
    now = _now_iso()

    with _db_lock:
        conn = _connect()
        try:
            cur = conn.execute(
                "INSERT INTO roadmap_items (title, status, sprint, sort_order, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (title, status, sprint, sort_order, now, now),
            )
            revision = _bump_revision(conn)
            conn.commit()
            row = _fetch_item(conn, cur.lastrowid)
        finally:
            conn.close()

    _audit_log({
        "action": "ROADMAP_CREATE",
        "user": username,
        "item": _item_to_dict(row) if row else None,
        "revision": revision,
    })
    return {"ok": True, "item": _item_to_dict(row) if row else None, "revision": revision}


@router.put("/items/{item_id}")
async def roadmap_update(
    item_id: int,
    request: Request,
    _session: dict = Depends(verify_session),
) -> dict[str, Any]:
    init_db()
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    updates: dict[str, Any] = {}
    if "title" in body:
        title = str(body.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        updates["title"] = title
    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        updates["status"] = status
    if "sprint" in body:
        updates["sprint"] = str(body.get("sprint") or "").strip()[:80]
    if "sort_order" in body:
        try:
            updates["sort_order"] = int(body.get("sort_order"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid sort_order")
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    with _db_lock:
        conn = _connect()
        try:
            if not _fetch_item(conn, item_id):
                raise HTTPException(status_code=404, detail="Roadmap item not found")
            updates["updated_at"] = _now_iso()
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE roadmap_items SET {set_clause} WHERE id = ?",
                (*updates.values(), item_id),
            )
            revision = _bump_revision(conn)
            conn.commit()
            row = _fetch_item(conn, item_id)
        finally:
            conn.close()

    _audit_log({
        "action": "ROADMAP_UPDATE",
        "user": username,
        "item_id": item_id,
        "updates": list(updates),
        "revision": revision,
    })
    return {"ok": True, "item": _item_to_dict(row) if row else None, "revision": revision}


@router.delete("/items/{item_id}")
async def roadmap_delete(
    item_id: int,
    _session: dict = Depends(verify_session),
) -> dict[str, Any]:
    init_db()
    username = str(_session.get("sub") or "unknown")
    with _db_lock:
        conn = _connect()
        try:
            if not _fetch_item(conn, item_id):
                raise HTTPException(status_code=404, detail="Roadmap item not found")
            conn.execute("DELETE FROM roadmap_items WHERE id = ?", (item_id,))
            revision = _bump_revision(conn)
            conn.commit()
        finally:
            conn.close()

    _audit_log({"action": "ROADMAP_DELETE", "user": username, "item_id": item_id, "revision": revision})
    return {"ok": True, "revision": revision}


@router.put("/meta")
async def roadmap_meta_update(
    request: Request,
    _session: dict = Depends(verify_session),
) -> dict[str, Any]:
    init_db()
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    updates: dict[str, Any] = {}
    if "current_sprint" in body:
        updates["current_sprint"] = str(body.get("current_sprint") or "").strip()[:80]

    with _db_lock:
        conn = _connect()
        try:
            for key, value in updates.items():
                _set_meta(conn, key, value)
            revision = _bump_revision(conn)
            conn.commit()
            data = _snapshot(conn)
        finally:
            conn.close()

    _audit_log({"action": "ROADMAP_META", "user": username, "updates": list(updates), "revision": revision})
    return {"ok": True, "revision": revision, **{k: v for k, v in data.items() if k != "items"}}


@router.post("/publish")
async def roadmap_publish(
    request: Request,
    _session: dict = Depends(verify_session),
) -> dict[str, Any]:
    """Publish the current roadmap to the Discord roadmap channel.

    Enqueues a `roadmap_update` pending_action carrying the full snapshot;
    the OPS CONTROL bot posts it with its own identity. The bot resolves the
    channel from DISCORD_ROADMAP_CHANNEL_ID (payload channel_id is optional).
    """
    init_db()
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json() if await request.body() else {}
    except Exception:
        body = {}

    with _db_lock:
        conn = _connect()
        try:
            data = _snapshot(conn)
            revision = data["revision"]
        finally:
            conn.close()

    payload = {
        "sprint": data["current_sprint"],
        "revision": revision,
        "planned": [i["title"] for i in data["grouped"]["planned"]],
        "in_progress": [i["title"] for i in data["grouped"]["in_progress"]],
        "completed": [i["title"] for i in data["grouped"]["completed"]],
    }
    channel_id = body.get("channel_id")
    if channel_id:
        try:
            payload["channel_id"] = int(channel_id)
        except (TypeError, ValueError):
            pass

    try:
        from discord import enqueue_pending_action

        queue_id = enqueue_pending_action("roadmap_update", payload)
        _audit_log({
            "action": "ROADMAP_PUBLISH",
            "user": username,
            "revision": revision,
            "queue_id": queue_id,
            "items": len(data["items"]),
        })
        return {
            "ok": True,
            "queued": True,
            "queue_id": queue_id,
            "revision": revision,
            "message": "Roadmap queued for Discord",
        }
    except HTTPException as exc:
        # The roadmap itself is valid; only the Discord queue is unavailable.
        # Keep the request a success so the panel can show the roadmap state
        # with a clear "Discord unavailable" note instead of a failed save.
        return {
            "ok": True,
            "queued": False,
            "revision": revision,
            "message": f"Discord publish unavailable: {exc.detail}",
        }
