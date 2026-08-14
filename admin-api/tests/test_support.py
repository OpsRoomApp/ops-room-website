"""Standalone smoke test for admin-api/support.py (website support form).

Run:  python tests/test_support.py
No external deps beyond the project's own requirements: the auth module is
stubbed (PyJWT is only needed in production), and storage goes to a temp dir.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

# --- temp storage for the test run ---------------------------------------
_TMP = Path(tempfile.mkdtemp(prefix="opsroom-support-test-"))
os.environ["SUPPORT_DB"] = str(_TMP / "support.sqlite3")
os.environ["SUPPORT_RATE_LIMIT_PER_MIN"] = "100"  # don't trip the limiter mid-test

# --- stub auth (PyJWT not installed in dev) -------------------------------
import types  # noqa: E402


def _fake_session():
    """Stand-in for the OAuth session dependency used by admin routes."""
    return {"sub": "smoke-tester"}


_fake_auth = types.ModuleType("auth")
_fake_auth.verify_session = _fake_session
sys.modules["auth"] = _fake_auth

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import importlib
support = importlib.import_module("support")

from fastapi.testclient import TestClient  # noqa: E402
from fastapi import FastAPI  # noqa: E402

app = FastAPI()
app.include_router(support.router)
client = TestClient(app)

_passed = 0
_failed = 0


def check(name: str, cond: bool, detail: str = ""):
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed += 1
        print(f"  FAIL  {name}  {detail}")


print("=== support router smoke test ===")

# 1. valid ingest
r = client.post("/api/v1/support", json={
    "name": "Jane Pilot",
    "email": "jane@example.com",
    "subject": "Installer issue",
    "message": "The installer fails at the telemetry step with error 0x3. I tried twice.",
})
body = r.json()
check("ingest ok", r.status_code == 200 and body.get("ok") is True and body.get("id", "").startswith("SUP-"), str(body))

# 2. field validation: short message
r = client.post("/api/v1/support", json={"name": "X", "email": "a@b.com", "subject": "S", "message": "short"})
check("short message rejected", r.status_code == 200 and r.json().get("ok") is False, str(r.json()))

# 3. field validation: bad email
r = client.post("/api/v1/support", json={"name": "X", "email": "not-an-email", "subject": "S", "message": "this is a long enough message for the test"})
check("bad email rejected", r.status_code == 200 and r.json().get("ok") is False, str(r.json()))

# 4. missing name
r = client.post("/api/v1/support", json={"name": "", "email": "a@b.com", "subject": "S", "message": "this is a long enough message for the test"})
check("missing name rejected", r.status_code == 200 and r.json().get("ok") is False, str(r.json()))

# 5. admin list
r = client.get("/api/v1/support")
body = r.json()
check("admin list ok", r.status_code == 200 and body.get("ok") is True and body.get("total", 0) >= 1, str(body)[:200])

# 6. admin stats
r = client.get("/api/v1/support/stats")
body = r.json()
check("admin stats ok", body.get("ok") is True and body.get("counts", {}).get("total", 0) >= 1, str(body)[:200])

# 7. admin detail
msg_id = body_ids = None
r = client.get("/api/v1/support")
msg_id = r.json()["items"][0]["id"]
r = client.get(f"/api/v1/support/{msg_id}")
body = r.json()
check("admin detail ok", body.get("ok") is True and body.get("item", {}).get("email") == "jane@example.com", str(body)[:200])

# 8. admin update status + notes
r = client.put(f"/api/v1/support/{msg_id}", json={"status": "open", "notes": "contacted by email"})
body = r.json()
check("update ok", body.get("ok") is True and body.get("item", {}).get("status") == "open" and body.get("item", {}).get("notes") == "contacted by email", str(body)[:200])

# 9. invalid status rejected
r = client.put(f"/api/v1/support/{msg_id}", json={"status": "bogus"})
check("invalid status rejected", r.status_code == 400, str(r.status_code))

# 10. 404 on unknown id
r = client.get("/api/v1/support/SUP-NOPE")
check("unknown id 404", r.status_code == 404, str(r.status_code))

# 11. list filter by status
r = client.get("/api/v1/support", params={"status": "open"})
body = r.json()
check("status filter", body.get("ok") is True and body.get("total", 0) >= 1, str(body)[:200])

# 12. rate limit (isolated IP via header)
os.environ["SUPPORT_RATE_LIMIT_PER_MIN"] = "2"
support.SUPPORT_RATE_LIMIT_PER_MIN = 2
support._rate.clear()
r1 = client.post("/api/v1/support", headers={"CF-Connecting-IP": "203.0.113.77"}, json={"name": "A", "email": "a@b.com", "subject": "S", "message": "this is a long enough message for the test"})
r2 = client.post("/api/v1/support", headers={"CF-Connecting-IP": "203.0.113.77"}, json={"name": "A", "email": "a@b.com", "subject": "S", "message": "this is a long enough message for the test"})
r3 = client.post("/api/v1/support", headers={"CF-Connecting-IP": "203.0.113.77"}, json={"name": "A", "email": "a@b.com", "subject": "S", "message": "this is a long enough message for the test"})
check("rate limit blocks 3rd", r3.status_code == 200 and r3.json().get("ok") is False, str(r3.json()))
os.environ["SUPPORT_RATE_LIMIT_PER_MIN"] = "100"
support.SUPPORT_RATE_LIMIT_PER_MIN = 100

print(f"\nSUMMARY: {_passed}/{_passed + _failed} passed")
sys.exit(1 if _failed else 0)
