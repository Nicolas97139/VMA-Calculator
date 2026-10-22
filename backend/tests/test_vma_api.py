"""Backend tests for VMA calculator API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vma-threshold-calc.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Health / root ---
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("message") == "VMA Calculator API"


# --- /api/calculate ---
class TestCalculate:
    def test_calculate_vma_15(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/calculate?vma_value=15")
        assert r.status_code == 200
        data = r.json()
        assert data["vma_value"] == 15
        assert isinstance(data["zones"], list)
        assert len(data["zones"]) == 8
        # Validate the first zone shape
        z0 = data["zones"][0]
        for k in ("name", "percentage_min", "percentage_max", "description",
                  "speed_min", "speed_max", "pace_min", "pace_max"):
            assert k in z0
        # VMA zone (95-100%) should contain ~15 km/h at vma=15
        vma_zone = next(z for z in data["zones"] if z["name"] == "VMA")
        assert vma_zone["percentage_min"] == 95
        assert vma_zone["percentage_max"] == 100
        assert abs(vma_zone["speed_max"] - 15.0) < 0.1

    def test_calculate_invalid_zero(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/calculate?vma_value=0")
        assert r.status_code == 400

    def test_calculate_invalid_high(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/calculate?vma_value=35")
        assert r.status_code == 400


# --- /api/history ---
class TestHistory:
    created_id = None

    def test_save_history(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/history", json={"vma_value": 15.5, "notes": "TEST_run"})
        assert r.status_code == 200
        data = r.json()
        assert data["vma_value"] == 15.5
        assert "id" in data
        TestHistory.created_id = data["id"]

    def test_get_history(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/history")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if TestHistory.created_id:
            ids = [i["id"] for i in items]
            assert TestHistory.created_id in ids

    def test_delete_history(self, api_client):
        if not TestHistory.created_id:
            pytest.skip("no id to delete")
        r = api_client.delete(f"{BASE_URL}/api/history/{TestHistory.created_id}")
        assert r.status_code == 200
        # verify absence
        r2 = api_client.get(f"{BASE_URL}/api/history")
        assert TestHistory.created_id not in [i["id"] for i in r2.json()]

    def test_delete_nonexistent(self, api_client):
        r = api_client.delete(f"{BASE_URL}/api/history/nonexistent-id-xyz")
        assert r.status_code == 404
