"""
OPS ROOM Admin API - Bug Reports (v0.25.x)

Replaces the legacy Google Apps Script destination for the desktop app's
in-app "Report Bug" flow. The desktop app POSTs the exact same JSON contract
it used before (secret + report + optional base64 diagnostics ZIP), so no
desktop UI change is required to cut over.

Endpoints
---------
Public ingest (called by the desktop app):
    POST /api/v1/bug-reports
        body: {"secret": "...", "report": {...}, "diagnosticsZip": {...} | null}
        -> 200 {"ok": true, "reportId": "...", "diagnosticsFileUrl": "...", "sheetRow": ""}

Admin (OAuth session required, same as the rest of the panel):
    GET /api/v1/bug-reports                     list (filters + pagination)
    GET /api/v1/bug-reports/stats               counts by status
    GET /api/v1/bug-reports/{report_id}         full detail
    GET /api/v1/bug-reports/{report_id}/download   diagnostics ZIP
    PUT /api/v1/bug-reports/{report_id}         update status / notes

Storage
-------
- SQLite database (BUG_REPORTS_DB) for report metadata + full JSON payloads.
- Diagnostics ZIPs on disk under BUG_REPORTS_STORAGE_DIR/{report_id}.zip.

Security
--------
- The shared ingest secret (BUG_REPORT_SECRET) is a spam gate, not a real
  credential - it ships inside the desktop binary. Rate limiting per client IP
  (BUG_REPORTS_RATE_LIMIT_PER_MIN, default 10/min) is the primary defense.
- Report IDs are client-generated, non-sequential tokens (OPS-...). They are
  NOT sequential integers, so they cannot be enumerated like the old
  transcript ticket IDs (docs/11 security audit, finding H4).
- Expected client failures (bad secret, invalid payload, rate limited) are
  returned as HTTP 200 with ok:false so the desktop app can surface the error
  message directly instead of a raw HTTP status.
"""

from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from auth import verify_session
from clientip import client_ip
from config import (
    BUG_REPORT_SECRET,
    BUG_REPORTS_DB,
    BUG_REPORTS_RATE_LIMIT_PER_MIN,
    BUG_REPORTS_STORAGE_DIR,
    LOG_FILE,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/bug-reports", tags=["bug-reports"])

MAX_ZIP_BYTES = 8 * 1024 * 1024       # desktop app caps diagnostics at 8 MB
MAX_BODY_BYTES = 16 * 1024 * 1024     # base64 zip ~10.7 MB + JSON overhead
MAX_REPORT_TEXT_CHARS = 200_000
VALID_STATUSES = ("new", "open", "closed")
REPORT_ID_RE = re.compile(r"^OPS-[A-Za-z0-9_-]{4,64}$")

_db_lock = threading.Lock()
_rate: dict[str, list[float]] = defaultdict(list)
_initialized = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _storage_dir() -> Path:
    path = Path(BUG_REPORTS_STORAGE_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(BUG_REPORTS_DB)), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db() -> None:
    """Idempotent schema creation. Called lazily on first request and from
    main.py startup so a misconfigured store fails fast at boot."""
    global _initialized
    if _initialized:
        return
    Path(BUG_REPORTS_DB).parent.mkdir(parents=True, exist_ok=True)
    with _db_lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS bug_reports (
                    report_id          TEXT PRIMARY KEY,
                    received_at        TEXT NOT NULL,
                    timestamp_utc      TEXT,
                    version            TEXT,
                    build              TEXT,
                    codename           TEXT,
                    module             TEXT,
                    simulator          TEXT,
                    aircraft           TEXT,
                    airport            TEXT,
                    route              TEXT,
                    addons             TEXT,
                    user_description   TEXT,
                    expected_result    TEXT,
                    steps_to_reproduce TEXT,
                    error_summary      TEXT,
                    contact            TEXT,
                    integration_summary TEXT,
                    diagnostics_included INTEGER NOT NULL DEFAULT 0,
                    report_json        TEXT NOT NULL,
                    report_text        TEXT,
                    zip_filename       TEXT,
                    zip_size_bytes     INTEGER,
                    status             TEXT NOT NULL DEFAULT 'new',
                    notes              TEXT NOT NULL DEFAULT '',
                    source_ip          TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_br_received ON bug_reports(received_at DESC);
                CREATE INDEX IF NOT EXISTS idx_br_status ON bug_reports(status);
                CREATE INDEX IF NOT EXISTS idx_br_module ON bug_reports(module);
                CREATE INDEX IF NOT EXISTS idx_br_version ON bug_reports(version);
                """
            )
            conn.commit()
        finally:
            conn.close()
        _initialized = True


def _audit_log(entry: dict[str, Any]) -> None:
    """Append a structured line to the shared admin log (same file as releases)."""
    entry.setdefault("time", _now_iso())
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _rate_limited(ip: str) -> bool:
    """Sliding-window per-IP limiter; True when the request should be rejected."""
    now = time.time()
    window = now - 60
    attempts = [t for t in _rate[ip] if t > window]
    _rate[ip] = attempts
    if len(attempts) >= BUG_REPORTS_RATE_LIMIT_PER_MIN:
        return True
    _rate[ip].append(now)
    return False


def _row_to_item(row: sqlite3.Row, include_payload: bool = False) -> dict[str, Any]:
    item = dict(row)
    item["diagnosticsIncluded"] = bool(item.pop("diagnostics_included", 0))
    if include_payload:
        try:
            item["report"] = json.loads(item.get("report_json") or "{}")
        except Exception:
            item["report"] = {}
    item.pop("report_json", None)
    return item


def _fetch_row(report_id: str) -> sqlite3.Row | None:
    with _db_lock:
        conn = _connect()
        try:
            return conn.execute("SELECT * FROM bug_reports WHERE report_id = ?", (report_id,)).fetchone()
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Public ingest (desktop app)
# ---------------------------------------------------------------------------


@router.post("")
async def ingest_report(request: Request):
    """Receive a bug report from the desktop app and store it.

    Response contract is identical to the legacy Google Apps Script endpoint:
        {"ok": true, "reportId": "...", "diagnosticsFileUrl": "...", "sheetRow": ""}
    """
    init_db()
    ip = client_ip(request)
    if _rate_limited(ip):
        _log.warning("Bug report ingest rate limited for %s", ip[:40])
        return JSONResponse(
            {"ok": False, "error": "Too many reports from this address. Try again later."},
            status_code=200,
        )

    # FastAPI has already read the body; Content-Length is a cheap first-pass cap.
    try:
        content_length = int(request.headers.get("content-length") or "0")
        if content_length > MAX_BODY_BYTES:
            return JSONResponse({"ok": False, "error": "Report payload is too large."}, status_code=200)
    except ValueError:
        pass

    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Invalid JSON payload."}, status_code=200)

    provided = str(data.get("secret") or "")
    if not BUG_REPORT_SECRET or not hmac.compare_digest(provided, BUG_REPORT_SECRET):
        _log.warning("Bug report ingest rejected: bad secret from %s", ip[:40])
        return JSONResponse({"ok": False, "error": "Invalid report submission secret."}, status_code=200)

    report = data.get("report")
    if not isinstance(report, dict):
        return JSONResponse({"ok": False, "error": "Missing report payload."}, status_code=200)

    report_id = str(report.get("reportId") or "")
    if not REPORT_ID_RE.match(report_id):
        report_id = "OPS-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8].upper()

    # Diagnostics ZIP: base64 inside JSON, exactly as the desktop app sends it.
    zip_data = data.get("diagnosticsZip")
    zip_filename = ""
    zip_size = 0
    if isinstance(zip_data, dict) and zip_data.get("base64"):
        try:
            raw = base64.b64decode(str(zip_data["base64"]), validate=False)
        except Exception:
            return JSONResponse({"ok": False, "error": "Diagnostics ZIP is not valid base64."}, status_code=200)
        if len(raw) > MAX_ZIP_BYTES:
            return JSONResponse({"ok": False, "error": "Diagnostics ZIP exceeds the 8 MB limit."}, status_code=200)
        if not raw.startswith(b"PK\x03\x04"):
            return JSONResponse({"ok": False, "error": "Diagnostics attachment is not a ZIP file."}, status_code=200)
        safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", report_id)
        zip_filename = f"{safe}.zip"
        zip_size = len(raw)
        try:
            _storage_dir().joinpath(zip_filename).write_bytes(raw)
        except OSError:
            _log.exception("Could not store diagnostics ZIP for %s", report_id)
            return JSONResponse({"ok": False, "error": "Could not store diagnostics ZIP."}, status_code=500)

    now = _now_iso()
    row = {
        "report_id": report_id,
        "received_at": now,
        "timestamp_utc": str(report.get("timestampUtc") or "")[:32],
        "version": str(report.get("version") or "")[:32],
        "build": str(report.get("build") or "")[:64],
        "codename": str(report.get("codename") or "")[:64],
        "module": str(report.get("module") or "Unknown")[:80],
        "simulator": str(report.get("simulator") or "")[:80],
        "aircraft": str(report.get("aircraft") or "")[:120],
        "airport": str(report.get("airport") or "")[:20],
        "route": str(report.get("route") or "")[:160],
        "addons": str(report.get("addons") or "")[:240],
        "user_description": str(report.get("userDescription") or "")[:4000],
        "expected_result": str(report.get("expectedResult") or "")[:2000],
        "steps_to_reproduce": str(report.get("stepsToReproduce") or "")[:3000],
        "error_summary": str(report.get("errorSummary") or "")[:500],
        "contact": str(report.get("contact") or "")[:160],
        "integration_summary": str(report.get("integrationSummary") or "")[:1000],
        "diagnostics_included": 1 if zip_filename else 0,
        "report_json": json.dumps(report, ensure_ascii=False),
        "report_text": str(report.get("reportText") or "")[:MAX_REPORT_TEXT_CHARS],
        "zip_filename": zip_filename,
        "zip_size_bytes": zip_size,
        "source_ip": ip[:120],
    }

    with _db_lock:
        conn = _connect()
        try:
            existing = conn.execute(
                "SELECT report_id FROM bug_reports WHERE report_id = ?", (report_id,)
            ).fetchone()
            if existing:
                return JSONResponse({"ok": False, "error": "Report already received."}, status_code=200)
            cols = ", ".join(row.keys())
            placeholders = ", ".join("?" for _ in row)
            conn.execute(
                f"INSERT INTO bug_reports ({cols}) VALUES ({placeholders})", tuple(row.values())
            )
            conn.commit()
        finally:
            conn.close()

    _log.info(
        "Bug report stored: %s (module=%s, version=%s, zip=%s)",
        report_id,
        row["module"],
        row["version"],
        zip_filename or "-",
    )
    return JSONResponse({
        "ok": True,
        "reportId": report_id,
        "diagnosticsFileUrl": f"/api/v1/bug-reports/{report_id}/download",
        "sheetRow": "",
    })


# ---------------------------------------------------------------------------
# Admin (OAuth session required)
# ---------------------------------------------------------------------------


@router.get("")
async def list_reports(
    request: Request,
    status: str = "",
    module: str = "",
    version: str = "",
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    _session: dict = Depends(verify_session),
):
    """List reports (summary fields only) with optional filters + pagination."""
    init_db()
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    where: list[str] = []
    params: list[Any] = []
    if status:
        where.append("status = ?")
        params.append(status)
    if module:
        where.append("module LIKE ?")
        params.append(f"%{module}%")
    if version:
        where.append("version LIKE ?")
        params.append(f"%{version}%")
    if q:
        where.append("(report_id LIKE ? OR user_description LIKE ? OR contact LIKE ? OR module LIKE ?)")
        params += [f"%{q}%"] * 4
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    with _db_lock:
        conn = _connect()
        try:
            total = conn.execute(f"SELECT COUNT(*) FROM bug_reports{clause}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM bug_reports{clause} ORDER BY received_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        finally:
            conn.close()

    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_row_to_item(r) for r in rows],
    }


@router.get("/stats")
async def report_stats(_session: dict = Depends(verify_session)):
    """Counts by status for the admin panel header."""
    init_db()
    with _db_lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status"
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM bug_reports").fetchone()[0]
        finally:
            conn.close()
    counts = {s: 0 for s in VALID_STATUSES}
    for r in rows:
        counts[r["status"]] = r["n"]
    counts["total"] = total
    return {"ok": True, "counts": counts}


@router.get("/{report_id}")
async def report_detail(report_id: str, _session: dict = Depends(verify_session)):
    """Full report detail including the raw report payload."""
    row = _fetch_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"ok": True, "item": _row_to_item(row, include_payload=True)}


@router.get("/{report_id}/download")
async def report_download(report_id: str, _session: dict = Depends(verify_session)):
    """Download the stored diagnostics ZIP for a report."""
    row = _fetch_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    filename = row["zip_filename"] or ""
    if not filename:
        raise HTTPException(status_code=404, detail="No diagnostics ZIP for this report")
    path = _storage_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Diagnostics ZIP is missing on disk")
    return FileResponse(path, media_type="application/zip", filename=filename)


@router.put("/{report_id}")
async def update_report(
    report_id: str,
    request: Request,
    _session: dict = Depends(verify_session),
):
    """Update status and/or notes on a report."""
    username = str(_session.get("sub") or "unknown")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    updates: dict[str, Any] = {}
    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        updates["status"] = status
    if "notes" in body:
        updates["notes"] = str(body.get("notes") or "")[:4000]
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    with _db_lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT report_id FROM bug_reports WHERE report_id = ?", (report_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Report not found")
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE bug_reports SET {set_clause} WHERE report_id = ?",
                (*updates.values(), report_id),
            )
            conn.commit()
            updated = conn.execute(
                "SELECT * FROM bug_reports WHERE report_id = ?", (report_id,)
            ).fetchone()
        finally:
            conn.close()

    _audit_log({
        "action": "BUG_REPORT_UPDATE",
        "user": username,
        "report_id": report_id,
        "updates": list(updates),
    })
    return {"ok": True, "item": _row_to_item(updated)}
