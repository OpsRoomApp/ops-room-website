"""Standalone smoke test for admin-api/roadmap.py.

Run:  python tests/test_roadmap.py
Storage goes to a temp dir; the auth module is stubbed (PyJWT not installed
in dev). The publish endpoint is tested against a missing OPS CONTROL DB so
it must degrade to "queued: false" instead of crashing.
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="opsroom-roadmap-test-"))
os.environ["ROADMAP_DB"] = str(_TMP / "roadmap.sqlite3")
os.environ["OPS_CONTROL_DB"] = str(_TMP / "missing-ops-control.sqlite3")


def _fake_session():
    return {"sub": "smoke-tester"}


_fake_auth = types.ModuleType("auth")
_fake_auth.verify_session = _fake_session
sys.modules["auth"] = _fake_auth

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

roadmap = importlib.import_module("roadmap")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

app = FastAPI()
app.include_router(roadmap.router)
app.include_router(roadmap.public_router)
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


print("=== roadmap router smoke test ===")

# 1. public endpoint returns empty roadmap
r = client.get("/api/public/roadmap")
body = r.json()
check("public empty roadmap", r.status_code == 200 and body.get("ok") is True and body.get("items") == [], str(body)[:200])

# 2. create item
r = client.post("/api/v1/roadmap/items", json={"title": "Live Map aircraft follow", "status": "planned"})
body = r.json()
item = body.get("item") or {}
check("create item", body.get("ok") is True and item.get("title") == "Live Map aircraft follow" and item.get("status") == "planned", str(body)[:200])

# 3. invalid status rejected
r = client.post("/api/v1/roadmap/items", json={"title": "X", "status": "bogus"})
check("invalid status rejected", r.status_code == 400, str(r.status_code))

# 4. missing title rejected
r = client.post("/api/v1/roadmap/items", json={"title": "", "status": "planned"})
check("missing title rejected", r.status_code == 400, str(r.status_code))

# 5. update item status
item_id = item["id"]
r = client.put(f"/api/v1/roadmap/items/{item_id}", json={"status": "in_progress", "sprint": "v0.26"})
body = r.json()
check("update item", body.get("ok") is True and body.get("item", {}).get("status") == "in_progress" and body.get("item", {}).get("sprint") == "v0.26", str(body)[:200])

# 6. meta update
r = client.put("/api/v1/roadmap/meta", json={"current_sprint": "v0.26 Development"})
body = r.json()
check("meta update", body.get("ok") is True and body.get("current_sprint") == "v0.26 Development", str(body)[:200])

# 7. public endpoint reflects changes + revision
r = client.get("/api/public/roadmap")
body = r.json()
check("public reflects changes", r.status_code == 200 and body.get("current_sprint") == "v0.26 Development" and body.get("revision", 0) >= 1 and len(body.get("items", [])) == 1, str(body)[:250])

# 8. publish degrades cleanly without OPS CONTROL DB
r = client.post("/api/v1/roadmap/publish", json={})
body = r.json()
check("publish degrades", r.status_code == 200 and body.get("ok") is True and body.get("queued") is False and body.get("revision", 0) >= 1, str(body)[:250])

# 9. delete item
r = client.delete(f"/api/v1/roadmap/items/{item_id}")
body = r.json()
check("delete item", body.get("ok") is True, str(body)[:200])

# 10. public endpoint empty again
r = client.get("/api/public/roadmap")
body = r.json()
check("public empty after delete", body.get("items") == [], str(body)[:200])

print(f"\n{_passed} passed, {_failed} failed")
sys.exit(1 if _failed else 0)
