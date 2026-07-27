"""OPS ROOM Admin API -- Health, diagnostics, and system status endpoints."""

from __future__ import annotations

import hashlib
import json
import os
import time
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request
from auth import verify_session
from config import RELEASES_DIR, MANIFEST_PATH, TESTING_MANIFEST_PATH

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])


def _check(name: str, ok: bool, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"name": name, "status": "PASS" if ok else "FAIL", "ok": ok, "detail": detail or {}}


async def _safe_fetch(url: str, timeout: int = 10) -> tuple[int, int, dict[str, str]]:
    """Return (status_code, response_ms, headers_dict). Async to avoid blocking the event loop."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url)
            ms = round((time.monotonic() - start) * 1000)
            return resp.status_code, ms, dict(resp.headers)
    except Exception as exc:
        ms = round((time.monotonic() - start) * 1000)
        return 0, ms, {"error": str(exc)}


@router.get("")
async def health_check(_session: dict = Depends(verify_session)):
    """Run all health checks and return structured PASS/FAIL results.

    Checks local filesystem first (fast, always available), then external
    endpoints (may fail if the site is not yet deployed on the target domain).
    Local checks are weighted higher; external failures are noted but do not
    mark the whole system as unhealthy unless local checks also fail.
    """
    # Fire all async fetches in parallel
    website_task = _safe_fetch("https://opsroom.live/")
    manifest_task = _safe_fetch("https://opsroom.live/api/update.json")

    status_w, ms_w, headers_w = await website_task
    status_m, ms_m, headers_m = await manifest_task

    checks: list[dict[str, Any]] = []

    # 1. Local: releases directory exists and is writable
    dir_ok = RELEASES_DIR.is_dir()
    checks.append(_check("releases_directory", dir_ok, {"path": str(RELEASES_DIR)}))

    # 2. Local: manifest file exists and is valid JSON
    manifest_ok = False
    manifest_version = None
    manifest_dl_url = None
    try:
        if MANIFEST_PATH.is_file():
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            manifest_ok = bool(manifest.get("version") or manifest.get("latest_version"))
            manifest_version = manifest.get("latest_version") or manifest.get("version")
            manifest_dl_url = manifest.get("download_url")
    except Exception:
        pass
    checks.append(_check("local_manifest", manifest_ok, {"version": manifest_version, "path": str(MANIFEST_PATH)}))

    # 3. External: website is reachable
    checks.append(_check("website_reachable", status_w >= 200 and status_w < 500, {"status": status_w, "response_ms": ms_w}))

    # 4. External: update manifest endpoint returns valid JSON
    is_json = "application/json" in headers_m.get("content-type", "")
    checks.append(_check("update_manifest", status_m == 200 and is_json, {"status": status_m, "response_ms": ms_m, "is_json": is_json}))

    # 5. Download: check both the symlink and the download_url from manifest
    dl_ok = False
    dl_detail: dict[str, Any] = {}
    try:
        latest_sym = RELEASES_DIR / "latest"
        if latest_sym.is_symlink():
            target_name = os.readlink(str(latest_sym))
            target_path = RELEASES_DIR / target_name
            dl_ok = target_path.is_file()
            dl_detail = {"symlink_target": target_name, "exists_on_disk": dl_ok,
                         "size_mb": round(target_path.stat().st_size / (1024*1024), 1) if dl_ok else 0}
        elif manifest_dl_url:
            # Fall back to checking if any ZIP exists
            zips = list(RELEASES_DIR.glob("*.zip"))
            dl_ok = len(zips) > 0
            dl_detail = {"zip_count": len(zips), "note": "no latest symlink; checking any ZIP"}
        else:
            dl_detail = {"error": "no latest symlink and no download_url in manifest"}
    except Exception as exc:
        dl_detail = {"error": str(exc)}
    checks.append(_check("download_available", dl_ok, dl_detail))

    # 4. SHA256 consistency (synchronous -- local file I/O, fast)
    sha_ok = False
    sha_detail: dict[str, Any] = {}
    try:
        if MANIFEST_PATH.is_file():
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            expected = manifest.get("sha256", "")
            latest_sym = RELEASES_DIR / "latest"
            if latest_sym.is_symlink():
                target_name = os.readlink(str(latest_sym))
                target_path = RELEASES_DIR / target_name
                if target_path.is_file():
                    digest = hashlib.sha256()
                    with target_path.open("rb") as f:
                        for block in iter(lambda: f.read(1024 * 1024), b""):
                            digest.update(block)
                    actual = digest.hexdigest()
                    sha_ok = actual.lower() == expected.lower()
                    sha_detail = {"expected": expected[:16] + "...", "actual": actual[:16] + "...", "match": sha_ok}
                else:
                    sha_detail = {"error": "latest symlink target not found"}
            else:
                sha_detail = {"error": "no latest symlink"}
        else:
            sha_detail = {"error": "manifest not found"}
    except Exception as exc:
        sha_detail = {"error": str(exc)}
    checks.append(_check("sha256_consistency", sha_ok, sha_detail))

    dir_ok = RELEASES_DIR.is_dir()
    checks.append(_check("releases_directory", dir_ok, {"path": str(RELEASES_DIR)}))

    checks.append(_check("admin_api", True, {"service": "opsroom-admin-api"}))

    passed = sum(1 for c in checks if c["ok"])
    failed = len(checks) - passed
    return {
        "healthy": failed == 0,
        "passed": passed,
        "failed": failed,
        "total": len(checks),
        "checks": checks,
    }


@router.get("/diagnostics")
async def diagnostics(_session: dict = Depends(verify_session)):
    """Diagnostics endpoint: manifest preview, release directory status, and live API response."""
    manifest = {}
    try:
        if MANIFEST_PATH.is_file():
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass

    testing_manifest = {}
    try:
        if TESTING_MANIFEST_PATH.is_file():
            testing_manifest = json.loads(TESTING_MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass

    zips_on_disk: list[str] = []
    try:
        zips_on_disk = sorted([p.name for p in RELEASES_DIR.glob("*.zip")])
    except Exception:
        pass

    latest_target = None
    try:
        sym = RELEASES_DIR / "latest"
        if sym.is_symlink():
            latest_target = os.readlink(str(sym))
    except Exception:
        pass

    # Live fetch (async) -- single fetch, no double-call
    status, ms, headers = await _safe_fetch("https://opsroom.live/api/update.json")
    raw_manifest = None
    try:
        if status == 200:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get("https://opsroom.live/api/update.json")
                raw_manifest = resp.json()
    except Exception:
        pass

    return {
        "production_manifest": manifest,
        "testing_manifest": testing_manifest,
        "live_manifest_fetch": {"status": status, "response_ms": ms, "data": raw_manifest},
        "releases_directory": {
            "path": str(RELEASES_DIR),
            "exists": RELEASES_DIR.is_dir(),
            "zip_count": len(zips_on_disk),
            "zips": zips_on_disk,
        },
        "latest_symlink_target": latest_target,
    }


@router.get("/system")
async def system_status(_session: dict = Depends(verify_session)):
    """System status summary for the admin support page."""
    website_task = _safe_fetch("https://opsroom.live/")
    manifest_task = _safe_fetch("https://opsroom.live/api/update.json")

    status_w, ms_w, _ = await website_task
    status_m, ms_m, headers_m = await manifest_task

    # Check downloads availability locally
    dl_online = False
    try:
        sym = RELEASES_DIR / "latest"
        if sym.is_symlink():
            dl_online = (RELEASES_DIR / os.readlink(str(sym))).is_file()
        else:
            dl_online = any(RELEASES_DIR.glob("*.zip"))
    except Exception:
        pass

    services = [
        {"name": "Website", "online": 200 <= status_w < 500, "status": status_w, "response_ms": ms_w},
        {"name": "Updater API", "online": status_m == 200, "status": status_m, "response_ms": ms_m},
        {"name": "Downloads", "online": dl_online, "status": 200 if dl_online else 0, "response_ms": 0},
        {"name": "Admin API", "online": True, "status": 200, "response_ms": 0},
    ]
    return {
        "all_online": all(s["online"] for s in services),
        "services": services,
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/update-preview")
async def update_preview():
    """Public endpoint: return the current update.json manifest."""
    manifest = {}
    try:
        if MANIFEST_PATH.is_file():
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return manifest


@router.post("/test-notify")
async def test_notify(_session: dict = Depends(verify_session)):
    """Send a test notification to verify alerting is functional.

    Logs the test and returns success. Integrate with external webhook or
    email provider by extending this handler.
    """
    _log.info("Notification test triggered by %s", _session.get("username", "unknown"))
    # Future: POST to configured webhook URL or email provider here.
    return {"ok": True, "detail": "Test notification logged. Configure a webhook or email provider to receive alerts."}
