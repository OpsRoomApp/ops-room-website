"""OPS ROOM Admin API -- License key management endpoints.

All endpoints require a valid admin session. Licenses are stored in
a simple JSON file alongside the releases catalog.
"""

from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from auth import verify_session
from config import RELEASES_DIR

LICENSES_PATH = RELEASES_DIR / "licenses.json"

router = APIRouter(prefix="/api/licenses", tags=["licenses"])


def _read() -> list[dict[str, Any]]:
    try:
        if LICENSES_PATH.is_file():
            return json.loads(LICENSES_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _write(entries: list[dict[str, Any]]) -> None:
    LICENSES_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = LICENSES_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, LICENSES_PATH)


def _generate_key() -> str:
    """Generate a license key: OPS-XXXX-XXXX-XXXX format."""
    segments = []
    for _ in range(3):
        segments.append(secrets.token_hex(4).upper())
    return "OPS-" + "-".join(segments)


@router.get("")
async def list_licenses(_session: dict = Depends(verify_session)):
    return {"licenses": _read()}


@router.post("/generate")
async def generate_licenses(body: dict[str, Any], _session: dict = Depends(verify_session)):
    count = max(1, min(int(body.get("count", 1)), 100))
    tier = str(body.get("tier", "")).strip() or "standard"
    email = str(body.get("email", "")).strip()
    notes = str(body.get("notes", "")).strip()

    licenses = _read()
    now = datetime.now(timezone.utc).isoformat()

    generated = []
    for _ in range(count):
        key = _generate_key()
        entry = {
            "key": key,
            "tier": tier,
            "status": "active",
            "email": email,
            "notes": notes,
            "issued_at": now,
            "expires_at": None,
            "activated_at": None,
            "activations": 0,
            "max_activations": 3,
        }
        generated.append(entry)

    licenses.extend(generated)
    _write(licenses)
    return {"ok": True, "generated": len(generated), "licenses": generated}


@router.post("/{key}/revoke")
async def revoke_license(key: str, _session: dict = Depends(verify_session)):
    licenses = _read()
    for l in licenses:
        if l.get("key") == key:
            l["status"] = "revoked"
            l["revoked_at"] = datetime.now(timezone.utc).isoformat()
            _write(licenses)
            return {"ok": True, "license": l}
    raise HTTPException(status_code=404, detail="License not found")


@router.post("/{key}/extend")
async def extend_license(key: str, body: dict[str, Any], _session: dict = Depends(verify_session)):
    months = int(body.get("months", 12))
    if months < 1 or months > 120:
        raise HTTPException(status_code=400, detail="Months must be between 1 and 120")

    licenses = _read()
    for l in licenses:
        if l.get("key") == key:
            # Extend or set expiry
            from datetime import timedelta
            try:
                current = datetime.fromisoformat(l.get("expires_at", "").replace("Z", "+00:00"))
            except (ValueError, TypeError):
                current = datetime.now(timezone.utc)
            l["expires_at"] = (current + timedelta(days=months * 30)).isoformat()
            if l.get("status") == "expired":
                l["status"] = "active"
            l["extended_at"] = datetime.now(timezone.utc).isoformat()
            _write(licenses)
            return {"ok": True, "license": l}
    raise HTTPException(status_code=404, detail="License not found")
