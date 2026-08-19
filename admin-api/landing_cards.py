"""Public Landing Report card store (#2).

The desktop app POSTs a self-contained landing-card (payload + HTML) here after
a flight; opsroom.live/f/<id> renders it. Only the card's own flight data is
stored (callsign, route, landing metrics) — flight-data only, consistent with
the community-feature privacy stance.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
import time
from contextlib import contextmanager
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException

from community import _db as _community_db  # reuse the shared SQLite connection/commit

_LOGGER = logging.getLogger("opsroom.landing_cards")
router = APIRouter(prefix="/api/landing-cards", tags=["landing-cards"])

_MAX_HTML = 300_000  # self-contained card HTML is ~5-10 KB; cap generously
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS landing_cards (
            id         TEXT PRIMARY KEY,
            payload    TEXT NOT NULL,
            html       TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    # Reuse the shared community connection factory (same SQLite store).
    with _community_db() as conn:
        _ensure_tables(conn)
        yield conn


@router.post("")
def landing_card_upsert(payload: dict) -> dict:
    card_id = str((payload.get("id") or "")).strip()
    if not _ID_RE.match(card_id):
        raise HTTPException(status_code=400, detail="Invalid card id")
    html = str(payload.get("html") or "")
    if not html or len(html) > _MAX_HTML:
        raise HTTPException(status_code=400, detail="Card html is required and must be under the size limit")
    card_payload = payload.get("payload")
    if not isinstance(card_payload, dict):
        card_payload = {}
    data = json.dumps(card_payload, ensure_ascii=False)
    with _db() as conn:
        conn.execute(
            "INSERT INTO landing_cards (id, payload, html, created_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, html=excluded.html, created_at=excluded.created_at",
            (card_id, data, html, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        )
    return {"ok": True, "id": card_id, "url": f"https://opsroom.live/f/{card_id}"}


@router.get("/{card_id}")
def landing_card_get(card_id: str) -> dict:
    if not _ID_RE.match(card_id):
        raise HTTPException(status_code=404, detail="Card not found")
    with _db() as conn:
        row = conn.execute("SELECT payload, html, created_at FROM landing_cards WHERE id=?", (card_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    try:
        card_payload = json.loads(row["payload"]) if row["payload"] else {}
    except (TypeError, ValueError):
        card_payload = {}
    return {"ok": True, "id": card_id, "payload": card_payload, "html": row["html"], "created_at": row["created_at"]}
