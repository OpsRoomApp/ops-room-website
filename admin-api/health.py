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
    """Run all health checks and return structured PASS/FAIL results."""
    # Fire all async fetches in parallel
    website_task = _safe_fetch("https://opsroom.live/health")
    manifest_task = _safe_fetch("https://opsroom.live/api/update.json")
    download_task = _safe_fetch("https://opsroom.live/downloads/latest")

    status_w, ms_w, headers_w = await website_task
    status_m, ms_m, headers_m = await manifest_task
    status_d, ms_d, headers_d = await download_task

    checks: list[dict[str, Any]] = []
    checks.append(_check("website", status_w == 200, {"status": status_w, "response_ms": ms_w}))

    is_json = "application/json" in headers_m.get("content-type", "")
    checks.append(_check("update_manifest", status_m == 200 and is_json, {"status": status_m, "response_ms": ms_m, "is_json": is_json}))

    checks.append(_check("download_latest", status_d == 200, {
        "status": status_d, "response_ms": ms_d,
        "content_type": headers_d.get("content-type", ""),
        "content_length": headers_d.get("content-length", ""),
    }))

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

    # Live fetch (async)
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
    website_task = _safe_fetch("https://opsroom.live/health")
    manifest_task = _safe_fetch("https://opsroom.live/api/update.json")
    download_task = _safe_fetch("https://opsroom.live/downloads/latest")

    status_w, ms_w, _ = await website_task
    status_m, ms_m, headers_m = await manifest_task
    status_d, ms_d, _ = await download_task

    services = [
        {"name": "Website", "online": status_w == 200, "status": status_w, "response_ms": ms_w},
        {"name": "Updater API", "online": status_m == 200, "status": status_m, "response_ms": ms_m},
        {"name": "Downloads", "online": status_d == 200, "status": status_d, "response_ms": ms_d},
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
