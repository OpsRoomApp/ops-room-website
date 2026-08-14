"""Standalone smoke test for admin-api/analytics_umami.py (Umami bridge).

Run:  python tests/test_analytics_umami.py
No external deps beyond the project's own requirements: the auth module is
stubbed (PyJWT is only needed in production), and no Umami instance is
required for the unconfigured paths.
"""

from __future__ import annotations

import os
import sys
import types
from pathlib import Path

# --- unconfigured by default ---------------------------------------------
os.environ["UMAMI_API_URL"] = "http://umami:3000"
os.environ["UMAMI_USERNAME"] = ""
os.environ["UMAMI_PASSWORD"] = ""
os.environ["UMAMI_WEBSITE_ID"] = ""

# --- stub auth (PyJWT not installed in dev) -------------------------------
def _fake_session():
    """Stand-in for the OAuth session dependency used by admin routes."""
    return {"sub": "smoke-tester"}


_fake_auth = types.ModuleType("auth")
_fake_auth.verify_session = _fake_session
sys.modules["auth"] = _fake_auth

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import importlib  # noqa: E402

analytics_umami = importlib.import_module("analytics_umami")

from fastapi.testclient import TestClient  # noqa: E402
from fastapi import FastAPI  # noqa: E402

app = FastAPI()
app.include_router(analytics_umami.router)
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


print("=== analytics_umami router smoke test ===")

# 1. status, unconfigured
r = client.get("/api/analytics/web/status")
body = r.json()
check("status unconfigured", r.status_code == 200 and body.get("ok") is False and body.get("configured") is False, str(body))

# 2. overview, unconfigured
r = client.get("/api/analytics/web/overview")
body = r.json()
check("overview unconfigured", r.status_code == 200 and body.get("ok") is False and body.get("configured") is False, str(body))

# 3. every metric endpoint degrades gracefully, unconfigured
for path in ["/top-pages", "/referrers", "/browsers", "/devices", "/countries"]:
    r = client.get(f"/api/analytics/web{path}")
    body = r.json()
    check(f"{path} unconfigured", r.status_code == 200 and body.get("ok") is False and body.get("configured") is False, str(body))

# 4. configured but unreachable -> 502 with ok:false (admin shows setup hint)
#    (config constants are read at import time, so patch the module globals
#    the handlers resolve at call time)
analytics_umami.UMAMI_USERNAME = "admin"
analytics_umami.UMAMI_PASSWORD = "secret"
r = client.get("/api/analytics/web/status")
body = r.json()
check("status configured-but-down", r.status_code == 200 and body.get("ok") is False and body.get("configured") is True, str(body))

r = client.get("/api/analytics/web/overview")
check("overview configured-but-down 502", r.status_code == 502 and r.json().get("ok") is False, f"{r.status_code} {r.text[:200]}")

# 5. period validation: bogus period falls back to 7d window, still 502 (not 422)
r = client.get("/api/analytics/web/overview?period=bogus")
check("bogus period tolerated", r.status_code == 502, f"{r.status_code} {r.text[:120]}")

print(f"\nSUMMARY: {_passed}/{_passed + _failed} passed")
sys.exit(1 if _failed else 0)
