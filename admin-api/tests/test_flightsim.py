"""Tests for the flightsim.to social-proof badge endpoint."""

import importlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_client(monkeypatch, **env):
    for key in ("FLIGHTSIM_API_KEY", "FLIGHTSIM_ADDON_ID", "FLIGHTSIM_ADDON_URL",
                "FLIGHTSIM_MANUAL_RATING", "FLIGHTSIM_MANUAL_RATING_COUNT",
                "FLIGHTSIM_MANUAL_DOWNLOADS"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, str(value))
    module = importlib.import_module("flightsim")
    importlib.reload(module)
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app)


def test_no_config_falls_back(monkeypatch):
    client = _make_client(monkeypatch)
    resp = client.get("/api/v1/flightsim/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["configured"] is False
    assert data["addonUrl"] == "https://flightsim.to"


def test_manual_stats(monkeypatch):
    client = _make_client(
        monkeypatch,
        FLIGHTSIM_MANUAL_RATING=4.8,
        FLIGHTSIM_MANUAL_RATING_COUNT=42,
        FLIGHTSIM_MANUAL_DOWNLOADS=5400,
        FLIGHTSIM_ADDON_ID=111241,
        FLIGHTSIM_ADDON_URL="https://flightsim.to/addon/111241/ops-room-operations-command-centre-public-beta",
    )
    resp = client.get("/api/v1/flightsim/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["configured"] is True
    assert data["source"] == "manual"
    assert data["stats"]["rating"] == 4.8
    assert data["stats"]["ratingCount"] == 42
    assert data["stats"]["downloads"] == 5400
    assert data["addon"]["url"].startswith("https://flightsim.to/addon/111241")


def test_manual_rating_accepts_commas(monkeypatch):
    client = _make_client(
        monkeypatch,
        FLIGHTSIM_MANUAL_DOWNLOADS="5,400",
    )
    resp = client.get("/api/v1/flightsim/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["stats"]["downloads"] == 5400
