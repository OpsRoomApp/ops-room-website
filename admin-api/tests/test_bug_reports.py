"""
Standalone smoke test for the bug reports router (v0.25.x).

Run from the admin-api directory:
    python tests/test_bug_reports.py

Covers the exact desktop-client contract: ingest (good/bad secret, with and
without a diagnostics ZIP), duplicate handling, and the admin list / stats /
detail / download / update endpoints. Uses a temp SQLite DB + storage dir and
stubs the OAuth session dependency, so it never touches a real database.
"""

from __future__ import annotations

import base64
import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="br-smoke-")
os.environ["BUG_REPORTS_DB"] = str(Path(_tmp) / "bug_reports.sqlite3")
os.environ["BUG_REPORTS_STORAGE_DIR"] = _tmp
os.environ["BUG_REPORT_SECRET"] = "smoke-secret"
os.environ["ADMIN_LOG_FILE"] = str(Path(_tmp) / "admin.log")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Stub the auth module so this smoke test does not require PyJWT/httpx OAuth
# plumbing. The router captures auth.verify_session as its dependency, so
# overriding the same function object below lets the admin routes run.
import types  # noqa: E402


def _fake_session():
    """Stand-in for the OAuth session dependency used by admin routes."""
    return {"sub": "smoke-tester"}


_fake_auth = types.ModuleType("auth")
_fake_auth.verify_session = _fake_session
sys.modules["auth"] = _fake_auth

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import bug_reports  # noqa: E402


def _make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("bug_report.json", '{"ok": true}')
        zf.writestr("privacy_notice.txt", "smoke")
    return buf.getvalue()


def main() -> int:
    app = FastAPI()
    app.include_router(bug_reports.router)
    app.dependency_overrides[_fake_session] = _fake_session
    client = TestClient(app)

    report = {
        "reportId": "OPS-20260814-120000-ABCD1234",
        "timestampUtc": "2026-08-14T12:00:00Z",
        "version": "0.25.79",
        "build": "public-release",
        "codename": "Release Migration",
        "module": "Ground Control",
        "simulator": "MSFS 2024",
        "aircraft": "A20N",
        "airport": "EDDF",
        "route": "EDDF-EGLL",
        "addons": "GSX Pro, Fenix",
        "userDescription": "Boarding stayed at 0/230",
        "expectedResult": "Boarding should trigger",
        "stepsToReproduce": "Load the aircraft, then check GSX.",
        "errorSummary": "None",
        "contact": "pilot@example.com",
        "integrationSummary": "gsx:detected",
        "reportText": "OPS ROOM BUG REPORT\n===================\nReport ID: OPS-20260814-120000-ABCD1234\nUSER DESCRIPTION\nBoarding stayed at 0/230",
    }
    zipped = _make_zip()
    payload = {
        "secret": "smoke-secret",
        "report": report,
        "diagnosticsZip": {
            "filename": "OPS_ROOM_Diagnostics_0.25.79_OPS-20260814-120000-ABCD1234_Ground_Control.zip",
            "mimeType": "application/zip",
            "base64": base64.b64encode(zipped).decode("ascii"),
        },
    }

    checks: list[tuple[str, bool]] = []

    def check(name: str, cond: bool) -> None:
        checks.append((name, cond))
        print(("PASS  " if cond else "FAIL  ") + name)

    # --- Ingest (desktop contract) ---
    r = client.post("/api/v1/bug-reports", json={**payload, "secret": "wrong"})
    check("bad secret rejected", r.status_code == 200 and r.json().get("ok") is False)

    r = client.post("/api/v1/bug-reports", json=payload)
    body = r.json()
    check("ingest accepted", r.status_code == 200 and body.get("ok") is True)
    check("ingest returns reportId", body.get("reportId") == report["reportId"])
    check(
        "ingest returns diagnosticsFileUrl",
        body.get("diagnosticsFileUrl") == f"/api/v1/bug-reports/{report['reportId']}/download",
    )
    check("ingest returns empty sheetRow", body.get("sheetRow") == "")

    r = client.post("/api/v1/bug-reports", json=payload)
    check("duplicate ingest rejected", r.status_code == 200 and r.json().get("ok") is False)

    nozip_payload = {
        "secret": "smoke-secret",
        "report": {**report, "reportId": "OPS-20260814-120000-EF567890"},
        "diagnosticsZip": None,
    }
    r = client.post("/api/v1/bug-reports", json=nozip_payload)
    check("ingest without zip accepted", r.status_code == 200 and r.json().get("ok") is True)

    r = client.post("/api/v1/bug-reports", json={**payload, "diagnosticsZip": {"base64": "not-zip-data"}})
    check("non-zip attachment rejected", r.status_code == 200 and r.json().get("ok") is False)

    # --- Admin ---
    r = client.get("/api/v1/bug-reports")
    body = r.json()
    check(
        "admin list",
        r.status_code == 200 and body.get("total") == 2 and len(body.get("items", [])) == 2,
    )

    r = client.get("/api/v1/bug-reports?status=new")
    body = r.json()
    check("admin list filtered", r.status_code == 200 and body.get("total") == 2)

    r = client.get("/api/v1/bug-reports/stats")
    body = r.json()
    check(
        "admin stats",
        r.status_code == 200 and body["counts"]["total"] == 2 and body["counts"]["new"] == 2,
    )

    r = client.get(f"/api/v1/bug-reports/{report['reportId']}")
    body = r.json()
    check(
        "admin detail",
        r.status_code == 200 and body["item"]["report"]["module"] == "Ground Control",
    )

    r = client.get(f"/api/v1/bug-reports/{report['reportId']}/download")
    check(
        "zip download",
        r.status_code == 200
        and r.headers.get("content-type") == "application/zip"
        and r.content == zipped,
    )

    r = client.put(f"/api/v1/bug-reports/{report['reportId']}", json={"status": "open", "notes": "Checking"})
    body = r.json()
    check(
        "admin update",
        r.status_code == 200 and body["item"]["status"] == "open" and body["item"]["notes"] == "Checking",
    )

    r = client.put(f"/api/v1/bug-reports/{report['reportId']}", json={"status": "bogus"})
    check("invalid status rejected", r.status_code == 400)

    r = client.get("/api/v1/bug-reports/OPS-20260814-120000-NOPE0000")
    check("missing report 404", r.status_code == 404)

    r = client.get("/api/v1/bug-reports/stats")
    body = r.json()
    check(
        "stats reflect update",
        r.status_code == 200 and body["counts"]["open"] == 1 and body["counts"]["new"] == 1,
    )

    failed = [name for name, ok in checks if not ok]
    print()
    print(f"{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
