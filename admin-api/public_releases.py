"""OPS ROOM Admin API -- Public, read-only release history.

Served to the public website changelog (opsroom.live/changelog) and the
Discord bot's /latest + /changelog commands. No authentication: the endpoint
is proxied by nginx on opsroom.live and must never expose draft/testing
entries or anything else internal.

Lifecycle visibility: DRAFT and TESTING entries stay invisible; PUBLISHED and
ARCHIVED entries are served newest-first.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from releases import _read_catalog

router = APIRouter(prefix="/api/public", tags=["public"])

VISIBLE_STATES = ("published", "archived")


@router.get("/releases")
async def public_releases(limit: int = 50) -> dict[str, Any]:
    """Return the newest published/archived releases for public consumption."""
    catalog = _read_catalog()
    visible = [
        e for e in catalog
        if e.get("state") in VISIBLE_STATES and e.get("version")
    ]
    visible.sort(
        key=lambda e: str(e.get("published_at") or e.get("uploaded_at") or ""),
        reverse=True,
    )
    entries = []
    for entry in visible[: max(1, min(limit, 200))]:
        entries.append(
            {
                "version": str(entry["version"]),
                "codename": str(entry.get("codename") or ""),
                "channel": str(entry.get("channel") or "stable"),
                "state": str(entry.get("state") or ""),
                "published_at": str(entry.get("published_at") or ""),
                "notes": str(entry.get("notes") or ""),
                "filename": str(entry.get("filename") or ""),
                "installer_filename": str(entry.get("installer_filename") or ""),
            }
        )
    return {"releases": entries}
