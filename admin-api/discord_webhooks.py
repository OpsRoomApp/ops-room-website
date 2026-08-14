"""OPS ROOM Admin API -- Discord release notifications via webhooks.

Fired from publish_release the moment a release goes live. Uses Discord
incoming webhooks so the post is instant and needs no bot permissions or
polling. Both channels are optional: an empty webhook URL disables that post.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import DISCORD_DOWNLOADS_WEBHOOK_URL, DISCORD_RELEASE_WEBHOOK_URL

_log = logging.getLogger(__name__)

ACCENT = 0x2563EB
NOTES_BUDGET = 1000


def format_notes_for_discord(markdown: str, limit: int = NOTES_BUDGET) -> str:
    """Convert release-note markdown into a Discord-friendly embed body.

    Contract shared with the admin panel preview (ReleaseNotesEditor.jsx) and
    the Discord bot (ops-control-bot cogs/releases.py):
      - "# / ## / ###" headings become bold lines
      - "- " bullets stay bullets (Discord renders them natively)
      - blank lines collapse; everything else is kept as plain text
      - the result is truncated to ``limit`` chars with an ellipsis
    """
    lines: list[str] = []
    for raw in (markdown or "").splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("### "):
            lines.append(f"**{stripped[4:].strip()}**")
        elif stripped.startswith("## "):
            lines.append(f"**{stripped[3:].strip()}**")
        elif stripped.startswith("# "):
            lines.append(f"**{stripped[2:].strip()}**")
        elif stripped.startswith("> "):
            lines.append(stripped[2:].strip())
        else:
            lines.append(stripped)
    text = "\n".join(lines)
    if len(text) > limit:
        text = text[:limit].rstrip() + "\u2026"
    return text


async def _post_webhook(url: str, payload: dict[str, Any]) -> None:
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
        _log.info("Discord webhook delivered (%s)", url.rstrip("/").split("/")[-1][:20])
    except Exception:
        _log.exception("Discord webhook POST failed")


async def notify_release(entry: dict[str, Any], manifest: dict[str, Any]) -> None:
    """Post the release announcement and the downloads links.

    Fire-and-forget from publish_release: callers schedule this as a task so
    publishing latency is unaffected. Never raises.
    """
    version = str(entry.get("version") or manifest.get("version") or "?")
    codename = str(entry.get("codename") or manifest.get("codename") or "").strip()
    channel = str(entry.get("channel") or manifest.get("channel") or "stable")
    notes = format_notes_for_discord(str(entry.get("notes") or ""))

    title = f"OPS ROOM v{version} Released"
    if codename and codename.lower() not in ("", "n/a"):
        title += f" - {codename}"

    await _post_webhook(
        DISCORD_RELEASE_WEBHOOK_URL,
        {
            "username": "OPS ROOM",
            "embeds": [
                {
                    "title": title,
                    "description": notes or "A new OPS ROOM release is available.",
                    "color": ACCENT,
                    "url": "https://opsroom.live/downloads",
                    "fields": [
                        {"name": "Version", "value": version, "inline": True},
                        {"name": "Channel", "value": channel, "inline": True},
                        {
                            "name": "Download",
                            "value": "[opsroom.live/downloads](https://opsroom.live/downloads)",
                            "inline": True,
                        },
                        {
                            "name": "GitHub Release",
                            "value": (
                                f"[View on GitHub](https://github.com/OpsRoomApp/"
                                f"ops-room-releases/releases/tag/{version})"
                            ),
                            "inline": True,
                        },
                    ],
                }
            ],
        },
    )

    download_url = str(manifest.get("download_url") or "")
    installer_url = str(manifest.get("installer_url") or "")
    fields: list[dict[str, Any]] = []
    if installer_url:
        fields.append(
            {
                "name": "Installer",
                "value": f"[OPS_ROOM_Setup_{version}.exe]({installer_url})",
                "inline": False,
            }
        )
    if download_url:
        fields.append(
            {
                "name": "ZIP archive",
                "value": f"[Download ZIP]({download_url})",
                "inline": False,
            }
        )
    fields.append(
        {
            "name": "Downloads page",
            "value": "[opsroom.live/downloads](https://opsroom.live/downloads)",
            "inline": False,
        }
    )

    await _post_webhook(
        DISCORD_DOWNLOADS_WEBHOOK_URL,
        {
            "username": "OPS ROOM",
            "embeds": [
                {
                    "title": f"OPS ROOM v{version} - Downloads",
                    "color": ACCENT,
                    "url": "https://opsroom.live/downloads",
                    "fields": fields,
                }
            ],
        },
    )
