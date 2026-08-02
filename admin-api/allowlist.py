"""
OPS ROOM Admin API -- Staff allowlist (source of truth)

The `staff_allowlist` table inside the OPS CONTROL bot SQLite database
(shared via the /ops-control-data volume) is the source of truth for who
may log in to the admin panel.

Seeding / fallback rules:
  * On first boot (table empty) the table is seeded from the
    APPROVED_GITHUB_USERS / APPROVED_DISCORD_USERS env vars so existing
    deployments are not locked out after the migration.
  * When the database is not mounted (local dev), auth falls back to the
    env vars -- the table is simply not consulted.

Admin panel CRUD (see discord.py router) writes to the table so staff can
be added/removed live without a redeploy.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from config import APPROVED_DISCORD_USERS, APPROVED_USERS

_log = logging.getLogger(__name__)

_DB_CANDIDATES = ("OPS_CONTROL_DB", "OPS_CONTROL_DB_PATH", "DATABASE_PATH")


def _resolve_db_path() -> str | None:
    for key in _DB_CANDIDATES:
        value = os.getenv(key)
        if value and value.strip():
            return value.strip()
    return None


def _connect() -> sqlite3.Connection | None:
    path = _resolve_db_path()
    if not path:
        return None
    db = Path(path)
    if not db.is_file():
        return None
    try:
        conn = sqlite3.connect(str(db), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        return conn
    except sqlite3.Error as exc:
        _log.warning("staff allowlist DB unavailable: %s", exc)
        return None


def _table_exists(conn: sqlite3.Connection) -> bool:
    try:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='staff_allowlist'"
        ).fetchone()
        return row is not None
    except sqlite3.Error:
        return False


def _has_old_schema(conn: sqlite3.Connection) -> bool:
    """True when the v0.25.55 (user_id, provider) shape is present.

    That shape cannot hold more than one GitHub username (PRIMARY KEY on
    user_id+provider), so it is rebuilt to the flexible (provider,
    identifier) shape. The table is brand-new and unused in production,
    so a rebuild loses no real data.
    """
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(staff_allowlist)")]
    except sqlite3.Error:
        return False
    return "user_id" in cols and "identifier" not in cols


def _ensure_table(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn):
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS staff_allowlist (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                provider    TEXT    NOT NULL,
                identifier  TEXT    NOT NULL,
                display     TEXT,
                added_by    INTEGER,
                added_at    TEXT    NOT NULL,
                UNIQUE(provider, identifier)
            )
            """
        )
        conn.commit()
        return
    if _has_old_schema(conn):
        conn.execute("DROP TABLE staff_allowlist")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS staff_allowlist (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                provider    TEXT    NOT NULL,
                identifier  TEXT    NOT NULL,
                display     TEXT,
                added_by    INTEGER,
                added_at    TEXT    NOT NULL,
                UNIQUE(provider, identifier)
            )
            """
        )
        conn.commit()
        _log.info("staff_allowlist rebuilt to flexible schema")


def seed_from_env(conn: sqlite3.Connection | None = None) -> int:
    """Seed the table from env vars when it is empty. Returns rows inserted."""
    conn = conn or _connect()
    if conn is None:
        return 0
    try:
        _ensure_table(conn)
        row = conn.execute("SELECT COUNT(*) AS c FROM staff_allowlist").fetchone()
        if row and row["c"] > 0:
            return 0
        now = datetime.now(timezone.utc).isoformat()
        inserted = 0
        for username in APPROVED_USERS:
            conn.execute(
                "INSERT OR IGNORE INTO staff_allowlist(provider, identifier, display, added_at) VALUES('github', ?, ?, ?)",
                (username.lower(), username, now),
            )
            inserted += 1
        for uid in APPROVED_DISCORD_USERS:
            conn.execute(
                "INSERT OR IGNORE INTO staff_allowlist(provider, identifier, display, added_at) VALUES('discord', ?, NULL, ?)",
                (uid, now),
            )
            inserted += 1
        conn.commit()
        if inserted:
            _log.info("Seeded staff allowlist from env (%d entries)", inserted)
        return inserted
    except sqlite3.Error as exc:
        _log.warning("staff allowlist seed failed: %s", exc)
        return 0


def is_allowed(provider: str, identifier: str) -> bool:
    """Return True if provider/identifier may access the admin panel.

    provider: 'github' (identifier = username, case-insensitive) or
              'discord' (identifier = user ID string, exact match).
    Falls back to the env allowlists when the DB is unavailable.
    """
    provider = (provider or "").lower().strip()
    identifier = (identifier or "").strip()
    if not provider or not identifier:
        return False

    conn = _connect()
    if conn is not None:
        try:
            _ensure_table(conn)
            if provider == "github":
                needle = identifier.lower()
                row = conn.execute(
                    "SELECT 1 FROM staff_allowlist WHERE provider='github' AND LOWER(identifier)=? LIMIT 1",
                    (needle,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT 1 FROM staff_allowlist WHERE provider='discord' AND identifier=? LIMIT 1",
                    (identifier,),
                ).fetchone()
            if row is not None:
                return True
            # Table exists but the user isn't in it -- the table is the
            # source of truth, so do NOT fall through to env (that would
            # make removals through the panel silently ineffective).
            return False
        except sqlite3.Error:
            _log.warning("staff allowlist query failed -- falling back to env")
            conn.close()

    # DB unavailable (local dev / not mounted): env vars are the fallback.
    if provider == "github":
        return identifier.lower() in APPROVED_USERS
    return identifier in APPROVED_DISCORD_USERS


def list_allowlist(provider: str = "") -> list[dict[str, Any]]:
    conn = _connect()
    if conn is None:
        return []
    try:
        _ensure_table(conn)
        if provider:
            rows = conn.execute(
                "SELECT id, provider, identifier, display, added_by, added_at "
                "FROM staff_allowlist WHERE provider=? ORDER BY provider, identifier",
                (provider.lower(),),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, provider, identifier, display, added_by, added_at "
                "FROM staff_allowlist ORDER BY provider, identifier"
            ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        _log.warning("allowlist list failed: %s", exc)
        return []
    finally:
        conn.close()


def add_entry(provider: str, identifier: str, display: str | None = None, added_by: int | None = None) -> dict[str, Any]:
    conn = _connect()
    if conn is None:
        raise RuntimeError("OPS CONTROL database is not available for allowlist writes")
    try:
        _ensure_table(conn)
        provider = (provider or "").lower().strip()
        identifier = (identifier or "").strip()
        if provider not in ("github", "discord") or not identifier:
            raise ValueError("provider must be 'github' or 'discord' and identifier is required")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO staff_allowlist(provider, identifier, display, added_by, added_at) VALUES(?,?,?,?,?)",
            (provider, identifier if provider == "discord" else identifier.lower(), display, added_by, now),
        )
        conn.commit()
        _log.info("Allowlist +%s:%s", provider, identifier)
        return {"ok": True, "provider": provider, "identifier": identifier}
    finally:
        conn.close()


def remove_entry(provider: str, identifier: str) -> bool:
    conn = _connect()
    if conn is None:
        return False
    try:
        _ensure_table(conn)
        cur = conn.execute(
            "DELETE FROM staff_allowlist WHERE provider=? AND identifier=?",
            (provider.lower(), identifier if provider == "discord" else identifier.lower()),
        )
        conn.commit()
        return cur.rowcount > 0
    except sqlite3.Error:
        return False
    finally:
        conn.close()
