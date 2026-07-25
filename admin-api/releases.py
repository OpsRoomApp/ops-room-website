"""OPS ROOM Admin API — Release management with staged lifecycle.

Lifecycle:  UPLOAD → STAGED → PUBLISH → ACTIVE

- Upload saves the ZIP and records metadata in staged.json.  It does NOT
  touch update.json or the latest symlink.
- Publish reads staged.json, runs pre-flight validation, backs up the
  current manifest, then atomically writes update.json and the symlink.
- Rollback also backs up the manifest before modifying it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from auth import verify_session
from config import (
    LOG_FILE,
    MANIFEST_BACKUP_DIR,
    MANIFEST_PATH,
    MAX_UPLOAD_MB,
    RELEASES_DIR,
    STAGED_PATH,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/releases", tags=["releases"])

FILENAME_RE = re.compile(r"^OPS_ROOM_v\d+_\d+_\d+_Public_Windows_x64\.zip$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")

# ---------------------------------------------------------------------------
# Helpers — filesystem
# ---------------------------------------------------------------------------


def _read_manifest() -> dict[str, Any]:
    try:
        if MANIFEST_PATH.is_file():
            return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_manifest(data: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, MANIFEST_PATH)


def _backup_manifest(reason: str = "") -> Path:
    """Copy the current manifest to a timestamped backup before mutation.

    Keeps a maximum of 20 backups; older ones are rotated out.
    """
    MANIFEST_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = MANIFEST_BACKUP_DIR / f"update-{ts}.json"
    try:
        if MANIFEST_PATH.is_file():
            shutil.copy2(MANIFEST_PATH, dest)
    except Exception:
        pass
    # Rotate: keep only the most recent 20 backups
    try:
        backups = sorted(MANIFEST_BACKUP_DIR.glob("update-*.json"), key=lambda p: p.name, reverse=True)
        for old in backups[20:]:
            old.unlink(missing_ok=True)
    except Exception:
        pass
    return dest


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


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

# ---------------------------------------------------------------------------
# Helpers — audit
# ---------------------------------------------------------------------------


def _audit_log(entry: dict[str, Any]) -> None:
    """Write a structured audit entry to the admin log file."""
    entry.setdefault("time", datetime.now(timezone.utc).isoformat())
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass
    _log.info("Admin action: %s by %s — v%s", entry.get("action", "?"), entry.get("user", "?"), entry.get("version", "?"))


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_staged(staged: dict[str, Any]) -> list[str]:
    """Run pre-publish validation.  Returns a list of error messages (empty = ok)."""
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

    # Verify SHA256 against the file on disk
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
# Routes
# ---------------------------------------------------------------------------


@router.get("")
async def list_releases(_session: dict = Depends(verify_session)):
    """Return the current manifest, staged release, ZIP list, and last action info."""
    manifest = _read_manifest()
    staged = _read_staged()

    zips: list[dict[str, Any]] = []
    try:
        for entry in sorted(RELEASES_DIR.iterdir(), key=lambda p: p.name, reverse=True):
            if not entry.is_file() or not entry.name.endswith(".zip"):
                continue
            stat = entry.stat()
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

    # Compute storage usage
    total_bytes = sum(z["size_bytes"] for z in zips)

    # Read last few log entries for last-publish / last-error
    last_actions: list[dict[str, Any]] = []
    try:
        if LOG_FILE.is_file():
            lines = LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
            for line in reversed(lines[-20:]):
                try:
                    last_actions.append(json.loads(line))
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "manifest": manifest,
        "staged": staged if staged else None,
        "latest_symlink": latest,
        "zips": zips,
        "storage_total_mb": round(total_bytes / (1024 * 1024), 1),
        "storage_total_gb": round(total_bytes / (1024 * 1024 * 1024), 2),
        "last_actions": last_actions[:5],
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
    """Upload a release ZIP and stage it.  Does NOT publish.

    The release sits in staged.json until an explicit publish action.
    """
    username = str(_session.get("sub") or "unknown")

    if not file.filename or not FILENAME_RE.match(file.filename):
        raise HTTPException(status_code=400, detail="Invalid filename. Expected pattern: OPS_ROOM_vX_XX_XX_Public_Windows_x64.zip")

    filename = file.filename
    dest = RELEASES_DIR / filename

    # Read in chunks, computing SHA256.
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

    # Write staged metadata — does NOT touch update.json or symlink.
    staged = {
        "filename": filename,
        "version": version,
        "sha256": sha256,
        "size_mb": file_size_mb,
        "channel": channel,
        "mandatory": mandatory,
        "notes": notes.strip(),
        "codename": codename.strip(),
        "uploaded_by": username,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_staged(staged)

    _audit_log({
        "action": "UPLOAD_RELEASE",
        "user": username,
        "version": version,
        "filename": filename,
        "sha256": sha256[:16] + "...",
        "size_mb": file_size_mb,
        "result": "staged",
    })

    return {
        "ok": True,
        "status": "staged",
        "filename": filename,
        "version": version,
        "sha256": sha256,
        "size_mb": file_size_mb,
        "channel": channel,
        "message": "Release staged. Use the Publish action to make it live.",
    }


@router.post("/publish")
async def publish_release(_session: dict = Depends(verify_session)):
    """Validate the staged release and publish it to production.

    Publishing:
      1. Reads staged.json
      2. Runs pre-flight validation (ZIP exists, SHA256 matches, schema ok)
      3. Backs up the current update.json
      4. Atomically writes the new manifest
      5. Updates the latest symlink
      6. Clears the staged state
    """
    username = str(_session.get("sub") or "unknown")
    staged = _read_staged()

    if not staged:
        raise HTTPException(status_code=400, detail="No staged release. Upload a ZIP first.")

    # Validate
    errors = _validate_staged(staged)
    if errors:
        _audit_log({
            "action": "PUBLISH_RELEASE",
            "user": username,
            "version": staged.get("version"),
            "filename": staged.get("filename"),
            "result": "failed",
            "error": "; ".join(errors),
        })
        raise HTTPException(status_code=400, detail=f"Validation failed: {'; '.join(errors)}")

    version = staged["version"]
    filename = staged["filename"]
    sha256 = staged["sha256"]

    # Backup current manifest
    backup = _backup_manifest("pre-publish")
    _log.info("Manifest backed up to %s before publish", backup)

    # Write manifest
    previous = _read_manifest()
    manifest = {
        **previous,
        "latest_version": version,
        "version": version,
        "codename": staged.get("codename") or previous.get("codename", ""),
        "channel": staged.get("channel", "stable"),
        "mandatory": staged.get("mandatory", False),
        "download_url": f"https://opsroom.live/downloads/{filename}",
        "url": f"https://opsroom.live/downloads/{filename}",
        "fallback_download_url": f"https://github.com/OpsRoomApp/ops-room-releases/releases/download/v{version}/{filename}",
        "sha256": sha256,
        "message": f"OPS ROOM v{version} is available.",
        "notes": staged.get("notes") or f"Release v{version}",
        "release_notes_url": "https://opsroom.live/changelog",
    }
    _write_manifest(manifest)

    # Update latest symlink
    latest_link = RELEASES_DIR / "latest"
    try:
        latest_link.unlink(missing_ok=True)
    except Exception:
        pass
    try:
        os.symlink(filename, str(latest_link))
    except OSError:
        _log.warning("Could not create latest symlink (filesystem may not support it)")

    _clear_staged()

    _audit_log({
        "action": "PUBLISH_RELEASE",
        "user": username,
        "version": version,
        "filename": filename,
        "sha256": sha256[:16] + "...",
        "channel": staged.get("channel"),
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


@router.put("/manifest")
async def update_manifest(
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Update individual manifest fields (notes, channel, mandatory, codename, message).

    Backs up the manifest before writing.
    """
    username = str(_session.get("sub") or "unknown")
    body = await request.json()

    manifest = _read_manifest()
    changed: list[str] = []

    for field in ("channel", "mandatory", "message", "notes", "release_notes_url", "codename"):
        if field in body:
            manifest[field] = body[field]
            changed.append(field)

    if not changed:
        raise HTTPException(status_code=400, detail="No recognised fields to update")

    backup = _backup_manifest("pre-edit")
    _write_manifest(manifest)

    _audit_log({
        "action": "UPDATE_MANIFEST",
        "user": username,
        "version": manifest.get("latest_version", manifest.get("version", "")),
        "changed": changed,
        "result": "success",
        "backup": str(backup),
    })

    return {"ok": True, "changed": changed, "manifest": manifest}


@router.post("/rollback/{version}")
async def rollback(
    version: str,
    _session: dict = Depends(verify_session),
):
    """Roll back the manifest to a previous release ZIP on disk.

    Backs up the current manifest first.  ZIP files are never deleted.
    """
    username = str(_session.get("sub") or "unknown")

    if not VERSION_RE.match(version):
        raise HTTPException(status_code=400, detail=f"Invalid version format: {version}")

    target = RELEASES_DIR / f"OPS_ROOM_v{version.replace('.', '_')}_Public_Windows_x64.zip"
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"No ZIP found for version {version}")

    sha256 = _sha256_file(target)
    manifest = _read_manifest()

    backup = _backup_manifest("pre-rollback")

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
