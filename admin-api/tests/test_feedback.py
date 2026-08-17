"""Standalone smoke test for admin-api/feedback.py.

Run:  python tests/test_feedback.py
Storage goes to a temp dir; the auth module is stubbed. The Discord forward
is best-effort, so ingest must succeed even with no OPS CONTROL DB.
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile
import types
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="opsroom-feedback-test-"))
os.environ["FEEDBACK_DB"] = str(_TMP / "feedback.sqlite3")
os.environ["FEEDBACK_RATE_LIMIT_PER_MIN"] = "100"
os.environ["OPS_CONTROL_DB"] = str(_TMP / "missing-ops-control.sqlite3")


def _fake_session():
    return {"sub": "smoke-tester"}


_fake_auth = types.ModuleType("auth")
_fake_auth.verify_session = _fake_session
sys.modules["auth"] = _fake_auth

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

feedback = importlib.import_module("feedback")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

app = FastAPI()
app.include_router(feedback.router)
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


print("=== feedback router smoke test ===")

# 1. valid ingest (kind defaults to feedback)
r = client.post("/api/v1/feedback", json={
    "title": "Aircraft follow on the live map",
    "description": "It would be nice if clicking an aircraft made the map follow it instead of having to keep re-clicking.",
    "contact": "jane@example.com",
})
body = r.json()
check("ingest ok", r.status_code == 200 and body.get("ok") is True and body.get("id", "").startswith("FDB-"), str(body))

# 2. feature_request kind accepted
r = client.post("/api/v1/feedback", json={
    "kind": "feature_request",
    "title": "Dark scrollbars",
    "description": "Custom dark scrollbars so the white browser rail does not break the dark theme.",
})
body = r.json()
check("feature_request ingest", r.status_code == 200 and body.get("ok") is True, str(body))

# 3. missing title rejected
r = client.post("/api/v1/feedback", json={"title": "", "description": "this is a long enough description for the test"})
check("missing title rejected", r.status_code == 200 and r.json().get("ok") is False, str(r.json()))

# 4. short description rejected
r = client.post("/api/v1/feedback", json={"title": "X", "description": "short"})
check("short description rejected", r.status_code == 200 and r.json().get("ok") is False, str(r.json()))

# 5. admin list
r = client.get("/api/v1/feedback")
body = r.json()
check("admin list ok", r.status_code == 200 and body.get("ok") is True and body.get("total", 0) >= 2, str(body)[:200])

# 6. admin stats
r = client.get("/api/v1/feedback/stats")
body = r.json()
check("admin stats ok", body.get("ok") is True and body.get("counts", {}).get("total", 0) >= 2 and body.get("kinds", {}).get("feature_request", 0) >= 1, str(body)[:200])

# 7. kind filter
r = client.get("/api/v1/feedback?kind=feature_request")
body = r.json()
check("kind filter", body.get("total", 0) >= 1 and all(i["kind"] == "feature_request" for i in body.get("items", [])), str(body)[:200])

# 8. admin detail
fid = r.json()["items"][0]["id"]
r = client.get(f"/api/v1/feedback/{fid}")
body = r.json()
check("admin detail ok", body.get("ok") is True and body.get("item", {}).get("id") == fid, str(body)[:200])

# 9. admin update status + notes
r = client.put(f"/api/v1/feedback/{fid}", json={"status": "accepted", "notes": "planned for v0.26"})
body = r.json()
check("update ok", body.get("ok") is True and body.get("item", {}).get("status") == "accepted" and body.get("item", {}).get("notes") == "planned for v0.26", str(body)[:200])

# 10. invalid status rejected
r = client.put(f"/api/v1/feedback/{fid}", json={"status": "bogus"})
check("invalid status rejected", r.status_code == 400, str(r.status_code))

print(f"\n{_passed} passed, {_failed} failed")
sys.exit(1 if _failed else 0)
