"""OPS ROOM Admin API -- Download analytics with privacy-preserving IP hashing.

IPs are salted + hashed (SHA256) before storage. Raw IPs are never stored.
Rows older than ANALYTICS_RETENTION_DAYS are pruned on access.

The salt is loaded from ANALYTICS_SALT env var (never committed to the repo).
If no salt is configured, analytics are silently skipped rather than storing
insecurely hashed data.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from auth import verify_session
from config import ANALYTICS_DB_PATH, ANALYTICS_RETENTION_DAYS, ANALYTICS_SALT

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_DEFAULT_SALT = "change-me"


def _hash_ip(ip: str) -> str | None:
    """Hash an IP address with the configured salt.

    Returns None if the salt is still the default (analytics disabled).
    """
    salt = ANALYTICS_SALT
    if salt == _DEFAULT_SALT or not salt:
        return None
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


def _record_download(ip: str, version: str, user_agent: str = "") -> None:
    """Append a download event to the analytics JSONL file."""
    ip_hash = _hash_ip(ip)
    if ip_hash is None:
        return  # analytics disabled (no salt configured)

    entry = {
        "t": datetime.now(timezone.utc).isoformat(),
        "h": ip_hash,
        "v": version,
        "ua": user_agent[:256],
    }
    try:
        ANALYTICS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with ANALYTICS_DB_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        _log.exception("Analytics error")


def _prune_old_entries() -> None:
    """Remove entries older than ANALYTICS_RETENTION_DAYS."""
    try:
        if not ANALYTICS_DB_PATH.is_file():
            return
        cutoff = datetime.now(timezone.utc) - timedelta(days=ANALYTICS_RETENTION_DAYS)
        lines = ANALYTICS_DB_PATH.read_text(encoding="utf-8").splitlines()
        kept = []
        pruned = 0
        for line in lines:
            try:
                entry = json.loads(line)
                ts = entry.get("t", "")
                if ts and datetime.fromisoformat(ts) < cutoff:
                    pruned += 1
                    continue
                kept.append(line)
            except Exception:
                kept.append(line)
        if pruned > 0:
            ANALYTICS_DB_PATH.write_text("\n".join(kept) + "\n", encoding="utf-8")
            _log.info("Pruned %d analytics entries older than %d days", pruned, ANALYTICS_RETENTION_DAYS)
    except Exception:
        _log.exception("Analytics error")


def _get_download_counts() -> list[dict[str, Any]]:
    """Return per-version download counts."""
    _prune_old_entries()
    counts: dict[str, int] = {}
    try:
        if ANALYTICS_DB_PATH.is_file():
            for line in ANALYTICS_DB_PATH.read_text(encoding="utf-8").splitlines():
                try:
                    entry = json.loads(line)
                    v = entry.get("v", "unknown")
                    counts[v] = counts.get(v, 0) + 1
                except Exception:
                    pass
    except Exception:
        _log.exception("Analytics error")
    return sorted(
        [{"version": k, "downloads": v} for k, v in counts.items()],
        key=lambda x: x["downloads"],
        reverse=True,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/counts")
async def download_counts(_session: dict = Depends(verify_session)):
    """Return per-version download counts (admin only)."""
    counts = _get_download_counts()
    total = sum(c["downloads"] for c in counts)
    return {"total_downloads": total, "by_version": counts}


@router.post("/record")
async def record_download(request: Request):
    """Public endpoint: record a download event.

    Called by the website download page when a user clicks Download.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        _log.exception("Analytics error")

    version = str(body.get("version") or "unknown")
    user_agent = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    # Take the first IP if there's a chain
    ip = ip.split(",")[0].strip()

    _record_download(ip, version, user_agent)
    return {"ok": True}
