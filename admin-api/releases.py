"""OPS ROOM Admin API -- Release management with full lifecycle.

Lifecycle:  DRAFT -> TESTING -> PUBLISHED -> ARCHIVED

Releases are tracked in releases.json (the catalog). Each entry has:
  - version, filename, sha256, size_mb, channel, codename, notes
  - state: draft | testing | published | archived
  - uploaded_by, uploaded_at, published_by, published_at

The live manifest (update.json) is written from the PUBLISHED entry.
A separate testing manifest (update-testing.json) is written from TESTING.
DRAFT entries are invisible to users.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import time as _time
from collections import defaultdict

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from auth import verify_session
from config import (
    LOG_FILE,
    MANIFEST_BACKUP_DIR,
    MANIFEST_PATH,
    MAX_UPLOAD_MB,
    RATE_LIMIT_UPLOAD_PER_MIN,
    RELEASES_CATALOG_PATH,
    RELEASES_DIR,
    STAGED_PATH,
    TESTING_MANIFEST_PATH,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/releases", tags=["releases"])

FILENAME_RE = re.compile(r"^OPS_ROOM_v\d+_\d+_\d+_Public_Windows_x64\.zip$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")

# Publish lock to prevent racing two publishes simultaneously.
_publish_lock = threading.Lock()

# Simple in-memory rate limiter for upload/publish endpoints.
_upload_attempts: dict[str, list[float]] = defaultdict(list)


def _rate_limit_upload(ip: str, max_per_min: int = RATE_LIMIT_UPLOAD_PER_MIN) -> bool:
    """Return True if the request is within rate limit for upload/publish endpoints."""
    now = _time.time()
    window = now - 60
    attempts = [t for t in _upload_attempts[ip] if t > window]
    _upload_attempts[ip] = attempts
    if len(attempts) >= max_per_min:
        return False
    _upload_attempts[ip].append(now)
    return True

# ---------------------------------------------------------------------------
# Helpers -- filesystem
# ---------------------------------------------------------------------------


def _read_catalog() -> list[dict[str, Any]]:
    try:
        if RELEASES_CATALOG_PATH.is_file():
            return json.loads(RELEASES_CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _write_catalog(entries: list[dict[str, Any]]) -> None:
    RELEASES_CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = RELEASES_CATALOG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, RELEASES_CATALOG_PATH)


def _read_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    try:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_manifest(data: dict[str, Any], path: Path = MANIFEST_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _build_manifest_from_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Construct a full update.json manifest from a release catalog entry."""
    version = entry["version"]
    filename = entry["filename"]
    sha256 = entry["sha256"]
    return {
        "latest_version": version,
        "version": version,
        "codename": entry.get("codename", ""),
        "channel": entry.get("channel", "stable"),
        "minimum_supported_version": "0.22.0",
        "mandatory": entry.get("mandatory", False),
        "download_url": f"https://opsroom.live/downloads/{filename}",
        "url": f"https://opsroom.live/downloads/{filename}",
        "fallback_download_url": f"https://github.com/OpsRoomApp/ops-room-releases/releases/download/v{version}/{filename}",
        "sha256": sha256,
        "message": f"OPS ROOM v{version} is available.",
        "notes": entry.get("notes") or f"Release v{version}",
        "release_notes_url": "https://opsroom.live/changelog",
    }


def _backup_manifest(reason: str = "") -> Path:
    """Copy the current manifest to a timestamped backup before mutation."""
    MANIFEST_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = MANIFEST_BACKUP_DIR / f"update-{ts}.json"
    try:
        if MANIFEST_PATH.is_file():
            shutil.copy2(MANIFEST_PATH, dest)
    except Exception:
        pass
    try:
        backups = sorted(MANIFEST_BACKUP_DIR.glob("update-*.json"), key=lambda p: p.name, reverse=True)
        for old in backups[20:]:
            old.unlink(missing_ok=True)
    except Exception:
        pass
    return dest


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# Helpers -- audit
# ---------------------------------------------------------------------------


def _audit_log(entry: dict[str, Any]) -> None:
    """Write a structured audit entry to the admin log file (append-only)."""
    entry.setdefault("time", datetime.now(timezone.utc).isoformat())
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass
    _log.info("Admin action: %s by %s -- v%s", entry.get("action", "?"), entry.get("user", "?"), entry.get("version", "?"))


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_staged(staged: dict[str, Any]) -> list[str]:
    """Run pre-publish validation. Returns a list of error messages (empty = ok)."""
    errors: list[str] = []

    if not staged:
        errors.append("No staged release found. Upload a ZIP first.")
        return errors

    filename = str(staged.get("filename") or "")
    if not filename or not FILENAME_RE.match(filename):
        errors.append("Staged filename is invalid or missing.")

    version = str(staged.get("version") or "")
    if not VERSION_RE.match(version):
        errors.append(f"Version '{version}' does not match X.Y.Z format.")

    sha256 = str(staged.get("sha256") or "")
    if len(sha256) != 64:
        errors.append("SHA256 is missing or invalid.")

    zip_path = RELEASES_DIR / filename
    if not zip_path.is_file():
        errors.append(f"ZIP file '{filename}' not found on disk.")

    size_mb = staged.get("size_mb", 0)
    if not isinstance(size_mb, (int, float)) or size_mb <= 0 or size_mb > MAX_UPLOAD_MB:
        errors.append(f"Staged size {size_mb} MB is out of range (0-{MAX_UPLOAD_MB}).")

    try:
        if zip_path.is_file():
            actual = _sha256_file(zip_path)
            if actual.lower() != sha256.lower():
                errors.append(f"SHA256 mismatch: staged {sha256[:16]}... vs disk {actual[:16]}...")
    except Exception as exc:
        errors.append(f"Could not verify SHA256: {exc}")

    channel = str(staged.get("channel") or "")
    if channel not in ("stable", "beta"):
        errors.append(f"Channel '{channel}' is not recognised.")

    return errors


# ---------------------------------------------------------------------------
# Staged state helpers (DRAFT workflow)
# ---------------------------------------------------------------------------


def _read_staged() -> dict[str, Any]:
    try:
        if STAGED_PATH.is_file():
            return json.loads(STAGED_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_staged(data: dict[str, Any]) -> None:
    STAGED_PATH.parent.mkdir(parents=True, exist_ok=True)
    STAGED_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _clear_staged() -> None:
    try:
        STAGED_PATH.unlink(missing_ok=True)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
async def list_releases(_session: dict = Depends(verify_session)):
    """Return the current manifest, catalog, staged release, and diagnostics."""
    manifest = _read_manifest()
    testing_manifest = _read_manifest(TESTING_MANIFEST_PATH)
    staged = _read_staged()
    catalog = _read_catalog()

    zips: list[dict[str, Any]] = []
    total_bytes = 0
    try:
        for entry in sorted(RELEASES_DIR.iterdir(), key=lambda p: p.name, reverse=True):
            if not entry.is_file() or not entry.name.endswith(".zip"):
                continue
            stat = entry.stat()
            total_bytes += stat.st_size
            zips.append({
                "filename": entry.name,
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 1),
                "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
    except FileNotFoundError:
        pass

    latest = None
    try:
        if RELEASES_DIR.joinpath("latest").is_symlink():
            latest = os.readlink(str(RELEASES_DIR / "latest"))
    except Exception:
        pass

    last_actions: list[dict[str, Any]] = []
    try:
        if LOG_FILE.is_file():
            lines = LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
            for line in reversed(lines[-30:]):
                try:
                    last_actions.append(json.loads(line))
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "manifest": manifest,
        "testing_manifest": testing_manifest,
        "staged": staged if staged else None,
        "catalog": catalog,
        "latest_symlink": latest,
        "zips": zips,
        "storage_total_mb": round(total_bytes / (1024 * 1024), 1),
        "storage_total_gb": round(total_bytes / (1024 * 1024 * 1024), 2),
        "last_actions": last_actions[:10],
    }


@router.post("/upload")
async def upload_release(
    file: UploadFile = File(...),
    channel: str = Form("stable"),
    mandatory: bool = Form(False),
    notes: str = Form(""),
    codename: str = Form(""),
    _session: dict = Depends(verify_session),
):
    """Upload a release ZIP as DRAFT. Does NOT publish.

    The release is saved on disk and recorded as state=draft in the catalog.
    """
    username = str(_session.get("sub") or "unknown")

    # Rate limit
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    ip = ip.split(",")[0].strip()
    if not _rate_limit_upload(f"upload:{ip}"):
        raise HTTPException(status_code=429, detail="Too many uploads. Please wait a minute.")

    if not file.filename or not FILENAME_RE.match(file.filename):
        raise HTTPException(status_code=400, detail="Invalid filename. Expected pattern: OPS_ROOM_vX_XX_XX_Public_Windows_x64.zip")

    filename = file.filename
    dest = RELEASES_DIR / filename

    digest = hashlib.sha256()
    bytes_written = 0
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024

    tmp = dest.with_suffix(".upload")
    try:
        with tmp.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    tmp.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_MB} MB limit")
                digest.update(chunk)
                f.write(chunk)

        if bytes_written == 0:
            tmp.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        os.replace(tmp, dest)
    except HTTPException:
        raise
    except Exception:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

    sha256 = digest.hexdigest()
    file_size_mb = round(bytes_written / (1024 * 1024), 1)
    version = filename.replace("OPS_ROOM_v", "").split("_Public")[0].replace("_", ".")

    now = datetime.now(timezone.utc).isoformat()

    # Add to catalog as DRAFT.
    catalog = _read_catalog()
    # Remove any existing entry for this version
    catalog = [e for e in catalog if e.get("version") != version]
    entry = {
        "filename": filename,
        "version": version,
        "sha256": sha256,
        "size_mb": file_size_mb,
        "channel": channel,
        "mandatory": mandatory,
        "notes": notes.strip(),
        "codename": codename.strip(),
        "state": "draft",
        "uploaded_by": username,
        "uploaded_at": now,
    }
    catalog.append(entry)
    _write_catalog(catalog)

    _audit_log({
        "action": "UPLOAD_RELEASE",
        "user": username,
        "version": version,
        "filename": filename,
        "sha256": sha256[:16] + "...",
        "size_mb": file_size_mb,
        "result": "draft",
    })

    return {
        "ok": True,
        "status": "draft",
        "filename": filename,
        "version": version,
        "sha256": sha256,
        "size_mb": file_size_mb,
        "channel": channel,
        "message": "Release saved as draft. Use the Publish action to make it live.",
    }


@router.post("/state/{version}")
async def set_release_state(
    version: str,
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Transition a release between states: draft -> testing -> published -> archived."""
    username = str(_session.get("sub") or "unknown")
    body = await request.json()
    new_state = str(body.get("state") or "").strip().lower()

    if new_state not in ("draft", "testing", "published", "archived"):
        raise HTTPException(status_code=400, detail=f"Invalid state: {new_state}")

    if not VERSION_RE.match(version):
        raise HTTPException(status_code=400, detail=f"Invalid version format: {version}")

    catalog = _read_catalog()
    entry = next((e for e in catalog if e.get("version") == version), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Version {version} not found in catalog")

    old_state = entry.get("state", "draft")

    # Validate state transitions
    valid_transitions = {
        "draft": ("testing", "archived"),
        "testing": ("draft", "published", "archived"),
        "published": ("testing", "archived"),
        "archived": ("draft", "testing"),
    }
    if new_state not in valid_transitions.get(old_state, ()):
        raise HTTPException(status_code=400, detail=f"Cannot transition from '{old_state}' to '{new_state}'")

    # Publishing: validate first
    if new_state == "published":
        zip_path = RELEASES_DIR / entry["filename"]
        if not zip_path.is_file():
            raise HTTPException(status_code=400, detail="ZIP file not found on disk")

        actual_sha = _sha256_file(zip_path)
        if actual_sha.lower() != entry["sha256"].lower():
            raise HTTPException(status_code=400, detail="SHA256 mismatch -- file may be corrupted")

        with _publish_lock:
            backup = _backup_manifest("pre-publish")
            manifest = _build_manifest_from_entry(entry)
            _write_manifest(manifest)

            # Update latest symlink
            latest_link = RELEASES_DIR / "latest"
            try:
                latest_link.unlink(missing_ok=True)
            except Exception:
                pass
            try:
                os.symlink(entry["filename"], str(latest_link))
            except OSError:
                _log.warning("Could not create latest symlink")

        _audit_log({
            "action": "PUBLISH_RELEASE",
            "user": username,
            "version": version,
            "filename": entry["filename"],
            "result": "success",
            "backup": str(backup),
        })

    elif new_state == "testing":
        # Write testing manifest
        manifest = _build_manifest_from_entry(entry)
        _write_manifest(manifest, TESTING_MANIFEST_PATH)
        _audit_log({"action": "SET_TESTING", "user": username, "version": version, "result": "success"})

    # Update entry state and timestamp; auto-archive previous published entries
    for e in catalog:
        if e.get("version") == version:
            e["state"] = new_state
            if new_state == "published":
                e["published_by"] = username
                e["published_at"] = datetime.now(timezone.utc).isoformat()
            elif new_state == "archived":
                e["archived_at"] = datetime.now(timezone.utc).isoformat()
        elif new_state == "published" and e.get("state") == "published":
            e["state"] = "archived"
            e["archived_at"] = datetime.now(timezone.utc).isoformat()

    _write_catalog(catalog)

    _audit_log({
        "action": f"STATE_{old_state.upper()}_TO_{new_state.upper()}",
        "user": username,
        "version": version,
        "result": "success",
    })

    return {"ok": True, "version": version, "old_state": old_state, "new_state": new_state}


@router.post("/publish")
async def publish_release(request: Request, _session: dict = Depends(verify_session)):
    """Validate the DRAFT/STAGED release and publish it to production."""
    username = str(_session.get("sub") or "unknown")

    # Rate limit
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    ip = ip.split(",")[0].strip()
    if not _rate_limit_upload(f"publish:{ip}"):
        raise HTTPException(status_code=429, detail="Too many publish attempts. Please wait a minute.")

    # Check catalog for a draft entry
    catalog = _read_catalog()
    draft_entries = [e for e in catalog if e.get("state") == "draft"]
    if not draft_entries:
        raise HTTPException(status_code=400, detail="No draft releases. Upload a ZIP first.")

    # Use the most recent draft
    entry = sorted(draft_entries, key=lambda e: e.get("uploaded_at", ""), reverse=True)[0]
    version = entry["version"]
    filename = entry["filename"]

    # Validate
    zip_path = RELEASES_DIR / filename
    if not zip_path.is_file():
        raise HTTPException(status_code=400, detail=f"ZIP file '{filename}' not found on disk.")

    actual_sha = _sha256_file(zip_path)
    if actual_sha.lower() != entry["sha256"].lower():
        raise HTTPException(status_code=400, detail="SHA256 mismatch -- file may be corrupted or replaced.")

    if entry.get("channel") not in ("stable", "beta"):
        raise HTTPException(status_code=400, detail=f"Invalid channel: {entry.get('channel')}")

    with _publish_lock:
        backup = _backup_manifest("pre-publish")
        manifest = _build_manifest_from_entry(entry)
        _write_manifest(manifest)

        latest_link = RELEASES_DIR / "latest"
        try:
            latest_link.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            os.symlink(filename, str(latest_link))
        except OSError:
            pass

    # Update catalog: mark new entry as published, archive all other published entries
    for e in catalog:
        if e.get("version") == version:
            e["state"] = "published"
            e["published_by"] = username
            e["published_at"] = datetime.now(timezone.utc).isoformat()
        elif e.get("state") == "published":
            e["state"] = "archived"
            e["archived_at"] = datetime.now(timezone.utc).isoformat()

    # Clean up testing manifest if no testing entries remain
    testing_remaining = [e for e in catalog if e.get("state") == "testing"]
    if not testing_remaining:
        try:
            TESTING_MANIFEST_PATH.unlink(missing_ok=True)
        except Exception:
            pass

    _write_catalog(catalog)

    _audit_log({
        "action": "PUBLISH_RELEASE",
        "user": username,
        "version": version,
        "filename": filename,
        "result": "success",
        "backup": str(backup),
    })

    return {
        "ok": True,
        "status": "published",
        "version": version,
        "filename": filename,
        "manifest_backup": str(backup),
        "manifest": manifest,
    }


@router.post("/rollback/{version}")
async def rollback(
    version: str,
    _session: dict = Depends(verify_session),
):
    """Roll back the manifest to a previous release ZIP on disk."""
    username = str(_session.get("sub") or "unknown")

    if not VERSION_RE.match(version):
        raise HTTPException(status_code=400, detail=f"Invalid version format: {version}")

    target = RELEASES_DIR / f"OPS_ROOM_v{version.replace('.', '_')}_Public_Windows_x64.zip"
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"No ZIP found for version {version}")

    sha256 = _sha256_file(target)

    with _publish_lock:
        backup = _backup_manifest("pre-rollback")
        manifest = _read_manifest()
        manifest.update({
            "latest_version": version,
            "version": version,
            "download_url": f"https://opsroom.live/downloads/{target.name}",
            "url": f"https://opsroom.live/downloads/{target.name}",
            "sha256": sha256,
            "message": f"OPS ROOM v{version} (rolled back).",
            "notes": manifest.get("notes", "") + f"\n[Rolled back to v{version} by {username} from backup {backup.name}]",
        })
        _write_manifest(manifest)

        latest_link = RELEASES_DIR / "latest"
        try:
            latest_link.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            os.symlink(target.name, str(latest_link))
        except OSError:
            pass

    _audit_log({
        "action": "ROLLBACK_RELEASE",
        "user": username,
        "version": version,
        "filename": target.name,
        "sha256": sha256[:16] + "...",
        "result": "success",
        "backup": str(backup),
    })

    return {"ok": True, "status": "rolled_back", "version": version, "sha256": sha256, "backup": str(backup)}


@router.delete("/{version}")
async def delete_release(
    version: str,
    _session: dict = Depends(verify_session),
):
    """Archive a release (does NOT delete the ZIP file)."""
    username = str(_session.get("sub") or "unknown")

    if not VERSION_RE.match(version):
        raise HTTPException(status_code=400, detail=f"Invalid version format: {version}")

    catalog = _read_catalog()
    entry = next((e for e in catalog if e.get("version") == version), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Version {version} not found in catalog")

    for e in catalog:
        if e.get("version") == version:
            e["state"] = "archived"
            e["archived_at"] = datetime.now(timezone.utc).isoformat()
            break
    _write_catalog(catalog)

    _audit_log({"action": "ARCHIVE_RELEASE", "user": username, "version": version, "result": "success"})

    return {"ok": True, "status": "archived", "version": version}
