"""OPS ROOM Admin API -- RainViewer precipitation proxy (server-cached).

The desktop app's Live Map draws precipitation tiles from our own endpoint
instead of calling RainViewer directly. This module provides:

  - a background poller that fetches ``weather-maps.json`` roughly every
    10 minutes and keeps the newest "past" radar frame (host + opaque path)
    in memory.  A failed poll keeps the last known good frame -- the app
    keeps rendering the previous frame instead of breaking or going blank;
  - a tile route that serves one 256px precipitation tile per request.
    The first request for a tile fetches it from RainViewer and saves it to
    disk under a folder keyed by the *frame path* (hashed to a safe folder
    name -- never reconstructed from a timestamp, RainViewer now uses opaque
    hash paths).  Repeat requests are served straight from disk with no
    outbound call;
  - a cleanup job that removes frame folders older than ~3 hours so disk
    usage stays bounded.

Tile URL format (RainViewer v2): ``{host}{path}/256/{z}/{x}/{y}/2/1_1.png``
where ``2/1_1`` is the colour scheme / smoothing variant.

v0.25.80: RainViewer precipitation layer.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
import shutil
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from clientip import client_ip

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/rainviewer", tags=["rainviewer"])

# ---- Configuration ---------------------------------------------------------
_WEATHER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json"
_POLL_INTERVAL_SECONDS = 600          # ~10 min; the source data changes no faster
_CLEANUP_INTERVAL_SECONDS = 600
_FRAME_RETENTION_SECONDS = 3 * 3600   # cached frame folders survive ~3 h
_TILE_SIZE = 256
_TILE_SUFFIX = "2/1_1.png"            # colour scheme / smoothing variant
_MAX_ZOOM = 19
_CACHE_DIR = Path(os.getenv("RAINVIEWER_CACHE_DIR", "/opt/opsroom-rainviewer"))

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
# 1x1 transparent PNG served when a tile fetch fails, so the weather layer
# degrades to "nothing visible here" instead of broken-image errors.
_TRANSPARENT_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)

# Public per-IP rate limit (generous -- tiles are small and the nginx
# proxy_cache absorbs repeat traffic, but the upstream fetch path must not
# be open to an unbounded bot flood).
_rate: dict[str, list[float]] = defaultdict(list)
_RATE_MAX = 300
_RATE_WINDOW = 60.0


def _check_rate(ip: str) -> bool:
    now = time.time()
    window = now - _RATE_WINDOW
    _rate[ip] = [t for t in _rate[ip] if t > window]
    if len(_rate[ip]) >= _RATE_MAX:
        return False
    _rate[ip].append(now)
    return True


# ---- In-memory frame state -------------------------------------------------
# The single source of truth for "which frame are we serving".  Updated only
# by the poller; read by the tile + status endpoints under _FRAME_LOCK.
_FRAME: dict[str, Any] = {
    "host": "",
    "path": "",
    "frame_key": "",
    "time": None,
    "generated": None,
    "updated_utc": None,
    "poll_error": "",
}
_FRAME_LOCK = threading.Lock()


def _frame_key(path: str) -> str:
    """Derive a safe, deterministic cache-folder name from the frame path.

    The key is derived from the exact ``path`` string the API returned
    (never reconstructed from a timestamp).  Prefer the path's own final
    component when it is filesystem-safe, otherwise fall back to a SHA-256
    of the full path.
    """
    raw = str(path or "").strip().rstrip("/")
    base = raw.rsplit("/", 1)[-1] if raw else ""
    if base and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", base):
        return base
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def current_frame() -> dict[str, Any]:
    with _FRAME_LOCK:
        return dict(_FRAME)


def adopt_frame(host: str, path: str, frame_time: Any, generated: Any) -> dict[str, Any]:
    """Adopt a frame (used by the poller and by tests)."""
    with _FRAME_LOCK:
        _FRAME["host"] = host
        _FRAME["path"] = path
        _FRAME["frame_key"] = _frame_key(path)
        _FRAME["time"] = frame_time
        _FRAME["generated"] = generated
        _FRAME["updated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        _FRAME["poll_error"] = ""
        return dict(_FRAME)


async def _poll_frame() -> dict[str, Any]:
    """Fetch weather-maps.json and adopt the newest past radar frame."""
    import httpx

    headers = {"User-Agent": "OPSROOM-RainViewer-Proxy/1.0"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0), headers=headers) as client:
        response = await client.get(_WEATHER_MAPS_URL)
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, dict):
        raise ValueError("weather-maps.json is not an object")
    host = str(data.get("host") or "").strip()
    radar = data.get("radar") if isinstance(data.get("radar"), dict) else {}
    past = radar.get("past") if isinstance(radar.get("past"), list) else []
    frames = [f for f in past if isinstance(f, dict) and str(f.get("path") or "").strip()]
    if not frames:
        raise ValueError("weather-maps.json has no past radar frames")
    frame = frames[-1]
    path = str(frame.get("path") or "").strip()
    if not host or not path:
        raise ValueError("weather-maps.json is missing host/path")
    return adopt_frame(host, path, frame.get("time"), data.get("generated"))


async def _poller_loop() -> None:
    """Background poller: adopt the newest frame, keep last-good on failure."""
    while True:
        try:
            frame = await _poll_frame()
            _log.info(
                "RainViewer frame adopted: key=%s path=%s generated=%s",
                frame["frame_key"], frame["path"], frame["generated"],
            )
        except Exception as exc:
            with _FRAME_LOCK:
                _FRAME["poll_error"] = f"{type(exc).__name__}: {exc}"
            _log.warning("RainViewer poll failed (keeping last known frame): %s", exc)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


# ---- Tile serving ----------------------------------------------------------
async def _fetch_upstream_tile(frame: dict[str, Any], z: int, x: int, y: int) -> bytes:
    """Fetch one tile from the RainViewer tile cache for the current frame."""
    import httpx

    url = f"{frame['host']}{frame['path']}/{_TILE_SIZE}/{z}/{x}/{y}/{_TILE_SUFFIX}"
    headers = {"User-Agent": "OPSROOM-RainViewer-Proxy/1.0"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(12.0), headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


@router.get("/tiles/{frame_key}/{z}/{x}/{y}.png")
async def precipitation_tile(frame_key: str, z: int, x: int, y: int, request: Request):
    """Serve one precipitation tile, caching it on disk keyed by frame path."""
    if not _check_rate(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many tile requests")
    try:
        z = int(z)
        x = int(x)
        y = int(y)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Bad tile coordinates")
    if not (0 <= z <= _MAX_ZOOM) or not (0 <= x < (1 << z)) or not (0 <= y < (1 << z)):
        raise HTTPException(status_code=400, detail="Tile coordinates out of range")

    frame = current_frame()
    if not frame.get("frame_key"):
        return JSONResponse(status_code=503, content={"ok": False, "error": "RainViewer frame not available yet"})

    # The cache folder is keyed by the REQUESTED frame key. Tiles for a
    # previous (still-in-retention) frame keep serving from disk; a key that
    # is neither the current frame nor cached is 404. Only the current frame
    # ever triggers an upstream fetch.
    tile_path = _CACHE_DIR / frame_key / str(z) / str(x) / f"{y}.png"
    if tile_path.is_file():
        # Cache hit -- no outbound call to RainViewer.
        return FileResponse(tile_path, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})

    if frame_key != frame["frame_key"]:
        # A stale client key with no cached tiles: that frame is gone.
        raise HTTPException(status_code=404, detail="Frame not found or expired")

    try:
        payload = await _fetch_upstream_tile(frame, z, x, y)
        if len(payload) < 8 or payload[:8] != _PNG_MAGIC:
            raise ValueError("upstream tile is not a PNG")
    except Exception as exc:
        _log.warning("RainViewer tile fetch failed key=%s z=%s x=%s y=%s: %s", frame["frame_key"], z, x, y, exc)
        # Graceful degradation: serve a transparent tile (never cached) so
        # the rest of the layer keeps rendering.
        return Response(content=_TRANSPARENT_PNG, media_type="image/png", headers={"Cache-Control": "no-store"})

    tile_path.parent.mkdir(parents=True, exist_ok=True)
    part = tile_path.with_name(tile_path.name + ".part")
    try:
        part.write_bytes(payload)
        os.replace(part, tile_path)
    except OSError as exc:
        _log.warning("RainViewer tile cache write failed key=%s z=%s x=%s y=%s: %s", frame["frame_key"], z, x, y, exc)
    return Response(content=payload, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


@router.get("/status")
def rainviewer_status() -> dict[str, Any]:
    """Lightweight frame status for the map's frame-refresh polling.

    The client polls this and swaps its tile URL when ``frame_key`` changes.
    """
    frame = current_frame()
    return {
        "ok": bool(frame.get("frame_key")),
        "frame_key": frame.get("frame_key"),
        "path": frame.get("path"),
        "host": frame.get("host"),
        "time": frame.get("time"),
        "generated": frame.get("generated"),
        "updated_utc": frame.get("updated_utc"),
        "poll_error": frame.get("poll_error") or "",
        "tile_url_template": "/api/v1/rainviewer/tiles/{frame_key}/{z}/{x}/{y}.png",
        "retention_seconds": _FRAME_RETENTION_SECONDS,
        "poll_interval_seconds": _POLL_INTERVAL_SECONDS,
    }


# ---- Cache cleanup ---------------------------------------------------------
def _cleanup_once() -> int:
    """Delete cached frame folders older than the retention window."""
    if not _CACHE_DIR.is_dir():
        return 0
    cutoff = time.time() - _FRAME_RETENTION_SECONDS
    removed = 0
    for folder in list(_CACHE_DIR.iterdir()):
        if not folder.is_dir():
            continue
        try:
            mtime = folder.stat().st_mtime
        except OSError:
            continue
        if mtime < cutoff:
            shutil.rmtree(folder, ignore_errors=True)
            removed += 1
    # Prune empty subfolders left behind by partial removals.
    for root, _dirs, _files in os.walk(_CACHE_DIR, topdown=False):
        for name in os.listdir(root):
            candidate = Path(root) / name
            try:
                if candidate.is_dir() and not any(candidate.iterdir()):
                    candidate.rmdir()
            except OSError:
                pass
    if removed:
        _log.info("RainViewer cache cleanup removed %d expired frame folder(s)", removed)
    return removed


async def _cleanup_loop() -> None:
    while True:
        try:
            _cleanup_once()
        except Exception as exc:
            _log.warning("RainViewer cache cleanup failed: %s", exc)
        await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)


def start_tasks() -> None:
    """Start the poller + cleanup loops (called from main.py startup)."""
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_poller_loop())
        loop.create_task(_cleanup_loop())
        _log.info("RainViewer poller + cache cleanup tasks started (cache=%s)", _CACHE_DIR)
    except RuntimeError:
        _log.warning("No running event loop -- RainViewer tasks deferred")
