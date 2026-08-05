"""
OPS ROOM Admin API -- FAA NMS NOTAM store (SQLite).

Holds a server-side copy of the FAA NMS-API NOTAM set, refreshed on the
server's own schedule (1 bulk pull per 24h + 1 incremental pull per 3 min --
see notam_ingest.py), so every per-airport / geo request from the desktop
app, the Discord bot and the Live Map is served from SQL with ZERO FAA quota
cost. The desktop app and bot never call the FAA host directly.

Separation of concerns: this database is deliberately separate from the OPS
CONTROL bot DB -- NOTAMs are externally sourced, large, and refreshed on
their own cadence, so they do not belong mixed into ticket/moderation data.

Connection conventions match allowlist.py / appeals.py: timeout=10,
PRAGMA busy_timeout=5000, WAL journaling.

Cancellation model: ``is_cancelled`` is set at ingest time from the
structured ``cancelationDate`` field (exact, not text parsing). Serving
queries additionally gate on the effective window so a stale row can never
be shown as active.

v0.25.63: NOTAM ingest-to-DB pipeline (Phase 1).
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

_log = logging.getLogger(__name__)

DB_PATH = Path(os.getenv("NOTAMS_DB_PATH", "/opt/opsroom-notams/notams.db"))

# Canonical timestamp format for stored values -- uniform "%Y-%m-%dT%H:%M:%SZ"
# strings compare correctly with plain lexicographic ordering in SQL.
_TS_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

_lock = threading.RLock()


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime(_TS_FORMAT)


def _connect() -> sqlite3.Connection:
    db = DB_PATH
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS notams (
    nms_id          TEXT PRIMARY KEY,
    identifier      TEXT,
    icao_location   TEXT NOT NULL,
    location        TEXT,
    number          TEXT,
    series          TEXT,
    year            TEXT,
    classification  TEXT,
    qcode           TEXT,
    notam_type      TEXT,
    text            TEXT,
    icao_message    TEXT,
    effective_start TEXT,
    effective_end   TEXT,
    cancelation_date TEXT,
    is_cancelled    TEXT NOT NULL DEFAULT 'N',
    lower_limit     TEXT,
    upper_limit     TEXT,
    coordinates     TEXT,
    lat             REAL,
    lon             REAL,
    radius_nm       REAL,
    geometry_json   TEXT,
    last_updated    TEXT,
    bulk_batch      TEXT,
    fetched_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notams_icao ON notams(icao_location);
CREATE INDEX IF NOT EXISTS idx_notams_last_updated ON notams(last_updated);
CREATE INDEX IF NOT EXISTS idx_notams_ll ON notams(lat, lon);

CREATE TABLE IF NOT EXISTS notam_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_incremental_cursor TEXT,
    last_incremental_pull_at TEXT,
    last_bulk_pull_at TEXT,
    last_bulk_batch TEXT,
    last_sync_error TEXT,
    last_sync_error_at TEXT
);
"""


def init_schema() -> None:
    try:
        with _connect() as conn:
            conn.executescript(SCHEMA)
            _migrate(conn)
    except sqlite3.Error as exc:
        _log.error("NOTAM DB schema init failed: %s", exc)
        raise


def _migrate(conn: sqlite3.Connection) -> None:
    """Additive migrations for databases created before a column existed."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(notams)")}
    if columns and "qcode" not in columns:
        conn.execute("ALTER TABLE notams ADD COLUMN qcode TEXT")


def upsert_notams(rows: Iterable[dict[str, Any]], bulk_batch: str = "") -> int:
    """Upsert NOTAM rows keyed by nms_id. Returns the number of rows written."""
    items = list(rows)
    if not items:
        return 0
    fetched = now_utc()
    sql = (
        "INSERT OR REPLACE INTO notams ("
        "nms_id, identifier, icao_location, location, number, series, year, "
        "classification, qcode, notam_type, text, icao_message, effective_start, "
        "effective_end, cancelation_date, is_cancelled, lower_limit, "
        "upper_limit, coordinates, lat, lon, radius_nm, geometry_json, "
        "last_updated, bulk_batch, fetched_at"
        ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    )
    with _lock:
        with _connect() as conn:
            for row in items:
                conn.execute(
                    sql,
                    (
                        str(row.get("nms_id") or ""),
                        str(row.get("identifier") or ""),
                        str(row.get("icao_location") or row.get("location") or "").upper(),
                        str(row.get("location") or ""),
                        str(row.get("number") or ""),
                        str(row.get("series") or ""),
                        str(row.get("year") or ""),
                        str(row.get("classification") or ""),
                        str(row.get("qcode") or ""),
                        str(row.get("notam_type") or ""),
                        str(row.get("text") or ""),
                        str(row.get("icao_message") or ""),
                        str(row.get("effective_start") or ""),
                        str(row.get("effective_end") or ""),
                        str(row.get("cancelation_date") or ""),
                        # is_cancelled from the parsed row (structured
                        # cancelationDate OR cancellation marker in the text --
                        # e.g. "NOTAM CANCELLED" -- since the FAA feed does not
                        # always populate cancelationDate), with the structured
                        # field still treated as authoritative.
                        "Y" if str(row.get("is_cancelled") or "").upper() == "Y" or row.get("cancelation_date") else "N",
                        str(row.get("lower_limit") or ""),
                        str(row.get("upper_limit") or ""),
                        str(row.get("coordinates") or ""),
                        row.get("lat"),
                        row.get("lon"),
                        row.get("radius_nm"),
                        row.get("geometry_json"),
                        str(row.get("last_updated") or ""),
                        str(bulk_batch or ""),
                        fetched,
                    ),
                )
    return len(items)


def mark_missing_cancelled(bulk_batch: str) -> int:
    """After a successful bulk load, cancel every row not present in the new
    snapshot. The initial-load file is the set of ACTIVE NOTAMs across all
    classifications, so anything absent is expired or cancelled -- we keep the
    row for history (PIREP footnote) but stop serving it as active."""
    with _lock:
        with _connect() as conn:
            cur = conn.execute(
                "UPDATE notams SET is_cancelled='Y' "
                "WHERE is_cancelled='N' AND bulk_batch IS NOT NULL AND bulk_batch != ?",
                (bulk_batch,),
            )
            return cur.rowcount


# ── Sync state ────────────────────────────────────────────────────────────


def sync_state_get() -> dict[str, Any]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM notam_sync_state WHERE id = 1").fetchone()
    return dict(row) if row else {}


def sync_state_set(**values: Any) -> None:
    current = sync_state_get()
    merged = {**current, **{k: v for k, v in values.items() if v is not None}}
    merged["id"] = 1
    with _connect() as conn:
        conn.execute("DELETE FROM notam_sync_state WHERE id = 1")
        keys = sorted(merged)
        sql = f"INSERT INTO notam_sync_state ({','.join(keys)}) VALUES ({','.join('?' * len(keys))})"
        conn.execute(sql, tuple(merged[k] for k in keys))


def record_sync_error(error: str) -> None:
    sync_state_set(last_sync_error=str(error)[:4000], last_sync_error_at=now_utc())


def clear_sync_error() -> None:
    sync_state_set(last_sync_error="", last_sync_error_at=None)


def sync_summary() -> dict[str, Any]:
    state = sync_state_get()
    with _connect() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM notams").fetchone()["n"]
        active = conn.execute("SELECT COUNT(*) AS n FROM notams WHERE is_cancelled='N'").fetchone()["n"]
        recent = conn.execute(
            "SELECT COUNT(*) AS n FROM notams WHERE last_updated >= ?",
            (now_utc(),),
        ).fetchone()["n"]
    return {
        "configured": True,
        "rows": int(total or 0),
        "active": int(active or 0),
        "last_incremental_cursor": state.get("last_incremental_cursor"),
        "last_incremental_pull_at": state.get("last_incremental_pull_at"),
        "last_bulk_pull_at": state.get("last_bulk_pull_at"),
        "last_sync_error": state.get("last_sync_error") or "",
        "last_sync_error_at": state.get("last_sync_error_at"),
    }


def count_rows() -> int:
    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM notams").fetchone()
    return int(row["n"]) if row else 0


# ── Serving queries (public endpoints) ─────────────────────────────────────


def get_active_by_icao(icao: str, now: str | None = None) -> list[sqlite3.Row]:
    """Active NOTAMs for an airport -- cancelled flag AND effective window
    both gate, so a stale row can never be served as active."""
    now = now or now_utc()
    sql = (
        "SELECT * FROM notams WHERE icao_location = ? AND is_cancelled = 'N' "
        "AND (effective_start IS NULL OR effective_start = '' OR effective_start <= ?) "
        "AND (effective_end IS NULL OR effective_end = '' OR effective_end = 'PERM' OR effective_end >= ?) "
        "ORDER BY effective_start DESC"
    )
    with _connect() as conn:
        return list(conn.execute(sql, (str(icao).upper(), now, now)))


def get_near(lat: float, lon: float, radius_nm: float, now: str | None = None, limit: int = 500) -> list[sqlite3.Row]:
    """Active NOTAMs with coordinates within a bounding box of the point.
    Bounding-box filtering is fine at this scale; a proper R-Tree index is a
    future optimization, not a launch requirement."""
    now = now or now_utc()
    # 1 degree of latitude == 60 NM; longitude shrinks by cos(lat).
    import math

    dlat = radius_nm / 60.0
    dlon = radius_nm / (60.0 * max(0.2, math.cos(math.radians(lat))))
    sql = (
        "SELECT * FROM notams WHERE is_cancelled = 'N' "
        "AND lat IS NOT NULL AND lon IS NOT NULL "
        "AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? "
        "AND (effective_start IS NULL OR effective_start = '' OR effective_start <= ?) "
        "AND (effective_end IS NULL OR effective_end = '' OR effective_end = 'PERM' OR effective_end >= ?) "
        "ORDER BY (ABS(lat - ?) + ABS(lon - ?)) LIMIT ?"
    )
    with _connect() as conn:
        return list(
            conn.execute(
                sql,
                (lat - dlat, lat + dlat, lon - dlon, lon + dlon, now, now, lat, lon, int(limit)),
            )
        )
