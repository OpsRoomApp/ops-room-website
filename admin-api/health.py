"""OPS ROOM Admin API — Health and diagnostics endpoints."""

from __future__ import annotations

import hashlib
import json
import os
import time
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from auth import verify_session
from config import RELEASES_DIR, MANIFEST_PATH

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])


def _check(name: str, ok: bool, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "status": "PASS" if ok else "FAIL",
        "ok": ok,
        "detail": detail or {},
    }


@router.get("")
async def health_check(_session: dict = Depends(verify_session)):
    """Run all health checks and return structured PASS/FAIL results."""
    checks: list[dict[str, Any]] = []

    # 1. Website availability
    start = time.monotonic()
    ms = 0
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://opsroom.live/health", timeout=10)
            ms = round((time.monotonic() - start) * 1000)
            checks.append(_check("website", resp.status_code == 200, {"status": resp.status_code, "response_ms": ms}))
    except Exception as exc:
        ms = round((time.monotonic() - start) * 1000)
        checks.append(_check("website", False, {"error": str(exc), "response_ms": ms}))

    # 2. /api/update.json
    start = time.monotonic()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://opsroom.live/api/update.json", timeout=10)
            ms = round((time.monotonic() - start) * 1000)
            is_json = "application/json" in resp.headers.get("content-type", "")
            checks.append(_check("update_manifest", resp.status_code == 200 and is_json, {
                "status": resp.status_code, "response_ms": ms, "is_json": is_json,
            }))
    except Exception as exc:
        ms = round((time.monotonic() - start) * 1000)
        checks.append(_check("update_manifest", False, {"error": str(exc), "response_ms": ms}))

    # 3. /downloads/latest
    start = time.monotonic()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.head("https://opsroom.live/downloads/latest", timeout=10, follow_redirects=True)
            ms = round((time.monotonic() - start) * 1000)
            checks.append(_check("download_latest", resp.status_code == 200, {
                "status": resp.status_code, "response_ms": ms,
                "content_type": resp.headers.get("content-type", ""),
                "content_length": resp.headers.get("content-length", ""),
            }))
    except Exception as exc:
        ms = round((time.monotonic() - start) * 1000)
        checks.append(_check("download_latest", False, {"error": str(exc), "response_ms": ms}))

    # 4. SHA256 consistency: compare manifest SHA256 against the latest ZIP on disk
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

    # 5. Release directory accessible
    dir_ok = RELEASES_DIR.is_dir()
    checks.append(_check("releases_directory", dir_ok, {"path": str(RELEASES_DIR)}))

    # 6. Admin API self-check
    checks.append(_check("admin_api", True, {"service": "opsroom-admin-api", "version": "0.25.13"}))

    passed = sum(1 for c in checks if c["ok"])
    failed = len(checks) - passed
    healthy = failed == 0

    return {
        "healthy": healthy,
        "passed": passed,
        "failed": failed,
        "total": len(checks),
        "checks": checks,
    }
