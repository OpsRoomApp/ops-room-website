"""Standalone smoke test for admin-api/community.py flight-phase sanity.

Run:  python tests/test_community.py
No external deps beyond the project's own requirements: the config module is
stubbed (env tokens only exist in production), and only the pure
``_sanitized_phase`` helper is exercised.
"""

from __future__ import annotations

import importlib.util
import sys
import types
from collections import deque
from pathlib import Path

# --- stub config (secrets only exist in production) ------------------------
_fake_config = types.ModuleType("config")
for _k in (
    "COMMUNITY_EVENT_TOKEN",
    "DISCORD_APP_CONNECT_REDIRECT_URI",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
):
    setattr(_fake_config, _k, "")
sys.modules["config"] = _fake_config

# --- import the real module ------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_spec = importlib.util.spec_from_file_location(
    "community", Path(__file__).resolve().parent.parent / "community.py"
)
community = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(community)

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


# --- fake clock so samples arrive chronologically like the 15 s live tick ---
_FAKE = [1_000_000.0]
_orig_time = community.time.time
community.time.time = lambda: _FAKE[0]


def tick_15s():
    _FAKE[0] += 15.0


def _reset():
    community._ALT_HISTORY.clear()
    _FAKE[0] += 10_000.0


print("=== community._sanitized_phase smoke test ===")

# 1. The reported bug: level at FL370, app pushes DESCENT (latch) -> CRUISE
_reset()
for alt in (37000, 37020, 36980, 37000, 37010, 36990, 37000):
    community._sanitized_phase(1001, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1001, "DESCENT", 37014)
check("level FL370 + DESCENT latch corrects to CRUISE", got == "CRUISE", f"got {got!r}")

# 2. Genuine descent from FL370 stays DESCENT
_reset()
for alt in (37000, 36740, 36480, 36220, 35960, 35700, 35440):
    community._sanitized_phase(1002, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1002, "DESCENT", 35200)
check("real descent keeps DESCENT", got == "DESCENT", f"got {got!r}")

# 3. Slow step-down (~-300 fpm) stays DESCENT
_reset()
for alt in (37000, 36925, 36850, 36775, 36700, 36625, 36550):
    community._sanitized_phase(1003, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1003, "DESCENT", 36500)
check("slow genuine descent keeps DESCENT", got == "DESCENT", f"got {got!r}")

# 4. APPROACH below 12000 untouched (label is plausible there)
got = community._sanitized_phase(1004, "APPROACH", 2500)
check("APPROACH below 12000 untouched", got == "APPROACH", f"got {got!r}")

# 5. Non-descent labels always untouched
got = community._sanitized_phase(1005, "CRUISE", 37000)
check("CRUISE untouched", got == "CRUISE", f"got {got!r}")

# 6. Missing altitude -> untouched
got = community._sanitized_phase(1006, "DESCENT", None)
check("missing altitude untouched", got == "DESCENT", f"got {got!r}")

# 7. Not enough history -> untouched
_reset()
got = community._sanitized_phase(1007, "DESCENT", 37000)
check("insufficient history untouched", got == "DESCENT", f"got {got!r}")

# 8. History span under 60 s -> untouched
_reset()
for alt in (37000, 37000, 37000):
    community._sanitized_phase(1008, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1008, "DESCENT", 37000)
check("sub-minute history untouched", got == "DESCENT", f"got {got!r}")

# 9. Same latch class: level FL350 + APPROACH -> CRUISE
_reset()
for alt in (35000, 35010, 34990, 35005, 35000, 35000, 35000):
    community._sanitized_phase(1009, "APPROACH", alt)
    tick_15s()
got = community._sanitized_phase(1009, "APPROACH", 35000)
check("level FL350 + APPROACH latch corrects to CRUISE", got == "CRUISE", f"got {got!r}")

# 10. Level below 12000 keeps DESCENT (label plausible near the ground)
_reset()
for alt in (11000, 11000, 11000, 11000, 11000, 11000, 11000):
    community._sanitized_phase(1010, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1010, "DESCENT", 11000)
check("level below 12000 keeps DESCENT", got == "DESCENT", f"got {got!r}")

# 11. A real descent at a healthy rate flips back to DESCENT quickly
_reset()
for alt in (37000, 37000, 37000, 37000, 36800, 36600, 36400):
    community._sanitized_phase(1011, "DESCENT", alt)
    tick_15s()
got = community._sanitized_phase(1011, "DESCENT", 36200)
check("real descent returns to DESCENT after ~1 min", got == "DESCENT", f"got {got!r}")

community.time.time = _orig_time

print()
print(f"{_passed} passed, {_failed} failed")
sys.exit(1 if _failed else 0)
