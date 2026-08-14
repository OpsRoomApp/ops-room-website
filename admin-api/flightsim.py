"""
OPS ROOM Admin API - flightsim.to stats proxy (v0.25.x)

Serves the addon's flightsim.to rating / download count to the public website
homepage (social-proof badge).

Two data sources, in priority order:

1. Live API  - flightsim.to's developer API (needs FLIGHTSIM_API_KEY +
   FLIGHTSIM_ADDON_ID). The upstream API 404s without a valid key.
2. Manual    - static numbers supplied in the environment
   (FLIGHTSIM_MANUAL_RATING / _RATING_COUNT / _DOWNLOADS). Use this until a
   developer key is available; the badge shows real numbers either way.

When neither source is configured the endpoint returns
``{"ok": false, "configured": false}`` and the website badge falls back to a
plain "Available on flightsim.to" link (never a broken widget).

Endpoint
--------
Public, read-only:
    GET /api/v1/flightsim/stats
        -> 200 {"ok": true, "configured": true, "addon": {...},
                "stats": {"rating": 4.8, "ratingCount": 120, "downloads": 5400},
                "source": "manual" | "api", "cached": false}
        or  {"ok": false, "configured": false}  (nothing configured)

Config
------
- FLIGHTSIM_API_KEY   developer key from flightsim.to (optional; live API).
- FLIGHTSIM_ADDON_ID  numeric addon id, e.g. 111241 (used with the key).
- FLIGHTSIM_ADDON_URL canonical addon page for the badge link (defaults to
  ``https://flightsim.to/addon/{addon_id}`` when an id is set, otherwise must
  be provided).
- FLIGHTSIM_STATS_URL optional override for the upstream stats endpoint.
  Default: https://api.flightsim.to/v1/modules/{addon_id}
- FLIGHTSIM_MANUAL_RATING        static rating, e.g. 4.8 (optional).
- FLIGHTSIM_MANUAL_RATING_COUNT  static review count, e.g. 42 (optional).
- FLIGHTSIM_MANUAL_DOWNLOADS     static download count, e.g. 5400 (optional).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/flightsim", tags=["flightsim"])

_API_KEY = os.getenv("FLIGHTSIM_API_KEY", "").strip()
_ADDON_ID = os.getenv("FLIGHTSIM_ADDON_ID", "").strip()
_ADDON_URL = os.getenv("FLIGHTSIM_ADDON_URL", "").strip()
_STATS_URL_TMPL = os.getenv("FLIGHTSIM_STATS_URL", "https://api.flightsim.to/v1/modules/{addon_id}")


def _num_env(name: str) -> float | None:
    raw = os.getenv(name, "").strip().replace(",", "")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        _log.warning("invalid numeric env %s=%r", name, raw)
        return None


_MANUAL_RATING = _num_env("FLIGHTSIM_MANUAL_RATING")
_MANUAL_RATING_COUNT = _num_env("FLIGHTSIM_MANUAL_RATING_COUNT")
_MANUAL_DOWNLOADS = _num_env("FLIGHTSIM_MANUAL_DOWNLOADS")


def _manual_stats() -> dict[str, Any] | None:
    """Static stats from the environment; None when nothing is set."""
    if _MANUAL_RATING is None and _MANUAL_DOWNLOADS is None:
        return None
    return {
        "addon": {"name": "OPS ROOM", "url": _addon_url()},
        "stats": {
            "rating": round(_MANUAL_RATING, 2) if _MANUAL_RATING is not None else None,
            "ratingCount": int(_MANUAL_RATING_COUNT) if _MANUAL_RATING_COUNT is not None else None,
            "downloads": int(_MANUAL_DOWNLOADS) if _MANUAL_DOWNLOADS is not None else None,
        },
        "source": "manual",
    }

_CACHE_TTL_SECONDS = 6 * 3600  # refresh every 6h
_cache: dict[str, Any] = {"at": 0.0, "payload": None}


def _addon_url() -> str:
    if _ADDON_URL:
        return _ADDON_URL
    if _ADDON_ID:
        return f"https://flightsim.to/addon/{_ADDON_ID}"
    return "https://flightsim.to"


def _fetch_stats() -> dict[str, Any] | None:
    """Fetch rating/downloads from the flightsim.to API. Tolerant parse:
    never raises -- any shape mismatch just returns None and the badge
    falls back to the static link."""
    if not _API_KEY or not _ADDON_ID:
        return None
    url = _STATS_URL_TMPL.format(addon_id=_ADDON_ID)
    try:
        resp = httpx.get(
            url,
            headers={"Api-Key": _API_KEY, "Accept": "application/json"},
            timeout=15.0,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            _log.warning("flightsim.to stats fetch HTTP %s", resp.status_code)
            return None
        data = resp.json()
    except Exception as exc:
        _log.warning("flightsim.to stats fetch failed: %s", exc)
        return None

    # flightsim.to response shape is not stable across versions; probe
    # several likely locations so a schema change degrades, not breaks.
    addon = {}
    if isinstance(data, dict):
        addon = data.get("addon") or data.get("module") or data
    elif isinstance(data, list) and data:
        addon = data[0] if isinstance(data[0], dict) else {}

    def _num(*keys: str) -> float | None:
        for key in keys:
            node: Any = addon
            for part in key.split("."):
                if isinstance(node, dict) and part in node:
                    node = node[part]
                else:
                    node = None
                    break
            if isinstance(node, (int, float)):
                return float(node)
        return None

    rating = _num("stats.rating", "rating", "avg_rating")
    rating_count = _num("stats.ratingCount", "stats.rating_count", "ratingCount", "rating_count", "reviews")
    downloads = _num("stats.downloads", "downloadCount", "downloads", "total_downloads")

    if rating is None and downloads is None:
        return None
    return {
        "addon": {
            "name": addon.get("name") or "OPS ROOM",
            "url": _addon_url(),
        },
        "stats": {
            "rating": round(rating, 2) if rating is not None else None,
            "ratingCount": int(rating_count) if rating_count is not None else None,
            "downloads": int(downloads) if downloads is not None else None,
        },
        "source": "api",
    }


@router.get("/stats")
async def stats():
    """Public flightsim.to social-proof badge data (6h server cache)."""
    now = time.time()
    if _cache["payload"] is not None and now - _cache["at"] < _CACHE_TTL_SECONDS:
        payload = dict(_cache["payload"])
        payload["cached"] = True
        return JSONResponse(payload)

    # Priority: live API when a key + id are configured, else manual stats.
    if _API_KEY and _ADDON_ID:
        fetched = _fetch_stats()
    else:
        fetched = _manual_stats()

    if fetched is None:
        if not (_API_KEY or _MANUAL_RATING is not None or _MANUAL_DOWNLOADS is not None):
            return JSONResponse({"ok": False, "configured": False, "addonUrl": _addon_url()})
        # Keep serving the last good cached payload if we have one.
        if _cache["payload"] is not None:
            payload = dict(_cache["payload"])
            payload["cached"] = True
            return JSONResponse(payload)
        return JSONResponse(
            {"ok": False, "configured": True, "addonUrl": _addon_url(),
             "error": "flightsim.to stats unavailable"},
        )

    # Success payloads always carry the ok/configured contract the badge
    # relies on (previously missing on the success path).
    fetched["ok"] = True
    fetched["configured"] = True
    _cache["at"] = now
    _cache["payload"] = dict(fetched)
    fetched["cached"] = False
    return JSONResponse(fetched)
