"""OPS ROOM Admin API -- Audit log endpoint.

Exposes the append-only audit log stored by the releases module.
Read-only. Requires authenticated admin session.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query
from auth import verify_session
from config import RELEASES_CATALOG_PATH

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["audit"])

_AUDIT_LOG_PATH = Path(RELEASES_CATALOG_PATH).parent / "audit.jsonl"


def _read_audit_log(limit: int = 100) -> list[dict[str, Any]]:
    """Read the most recent audit log entries."""
    entries: list[dict[str, Any]] = []
    try:
        if _AUDIT_LOG_PATH.is_file():
            for line in _AUDIT_LOG_PATH.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    except Exception:
        _log.exception("Failed to read audit log")

    # Sort by timestamp descending, take most recent
    entries.sort(key=lambda e: e.get("t", ""), reverse=True)
    return entries[:limit]


@router.get("")
async def audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    _session: dict = Depends(verify_session),
):
    """Return the most recent audit log entries (admin only)."""
    entries = _read_audit_log(limit)
    return {"entries": entries, "total": len(entries)}
