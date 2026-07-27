"""OPS ROOM Admin API -- Pricing tier management endpoints.

All endpoints require a valid admin session. Pricing data is stored in
a simple JSON file alongside the releases catalog.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from auth import verify_session
from config import RELEASES_DIR

PRICING_PATH = RELEASES_DIR / "pricing.json"

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


def _read() -> list[dict[str, Any]]:
    try:
        if PRICING_PATH.is_file():
            return json.loads(PRICING_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _write(entries: list[dict[str, Any]]) -> None:
    PRICING_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = PRICING_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, PRICING_PATH)


@router.get("")
async def list_tiers(_session: dict = Depends(verify_session)):
    return {"tiers": _read()}


@router.post("/new")
async def create_tier(body: dict[str, Any], _session: dict = Depends(verify_session)):
    tiers = _read()
    new_id = str(len(tiers) + 1)
    entry = {
        "id": new_id,
        "name": str(body.get("name", "")).strip(),
        "price": str(body.get("price", "")).strip(),
        "type": str(body.get("type", "one-time")).strip(),
        "features": body.get("features") or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not entry["name"] or not entry["price"]:
        raise HTTPException(status_code=400, detail="Name and price are required")
    tiers.append(entry)
    _write(tiers)
    return {"ok": True, "tier": entry}


@router.put("/{tier_id}")
async def update_tier(tier_id: str, body: dict[str, Any], _session: dict = Depends(verify_session)):
    tiers = _read()
    for t in tiers:
        if t.get("id") == tier_id:
            t["name"] = str(body.get("name", t["name"])).strip()
            t["price"] = str(body.get("price", t["price"])).strip()
            t["type"] = str(body.get("type", t.get("type", "one-time"))).strip()
            t["features"] = body.get("features", t.get("features", []))
            t["updated_at"] = datetime.now(timezone.utc).isoformat()
            _write(tiers)
            return {"ok": True, "tier": t}
    raise HTTPException(status_code=404, detail="Tier not found")


@router.delete("/{tier_id}")
async def delete_tier(tier_id: str, _session: dict = Depends(verify_session)):
    tiers = _read()
    new_tiers = [t for t in tiers if t.get("id") != tier_id]
    if len(new_tiers) == len(tiers):
        raise HTTPException(status_code=404, detail="Tier not found")
    _write(new_tiers)
    return {"ok": True}
