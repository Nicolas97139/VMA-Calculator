"""Backend tests for runner sessions endpoints (/api/sessions)."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


SAMPLE_PERF = {
    "distance": 1000,
    "time": "4:00",
    "time_seconds": 240,
    "speed": 15.0,
    "pace": "4:00",
    "percentage": 100,
    "zone_name": "VMA",
    "zone_index": 5,
}


# --- Create session ---
class TestCreateSession:
    created_id = None

    def test_create_valid_session(self, api_client):
        payload = {
            "first_name": "TEST_John",
            "last_name": "TEST_Runner",
            "vma_value": 15,
            "performances": [SAMPLE_PERF, {**SAMPLE_PERF, "distance": 400, "time": "1:30",
                                           "time_seconds": 90, "speed": 16.0, "pace": "3:45",
                                           "percentage": 107, "zone_index": 7, "zone_name": "Vitesse"}],
        }
        r = api_client.post(f"{BASE_URL}/api/sessions", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["first_name"] == "TEST_John"
        assert data["last_name"] == "TEST_Runner"
        assert data["vma_value"] == 15
        assert len(data["performances"]) == 2
        assert "id" in data and "created_at" in data
        TestCreateSession.created_id = data["id"]

    def test_create_empty_firstname_422(self, api_client):
        payload = {"first_name": "", "last_name": "Doe", "vma_value": 15,
                   "performances": [SAMPLE_PERF]}
        r = api_client.post(f"{BASE_URL}/api/sessions", json=payload)
        assert r.status_code == 422

    def test_create_empty_lastname_422(self, api_client):
        payload = {"first_name": "John", "last_name": "", "vma_value": 15,
                   "performances": [SAMPLE_PERF]}
        r = api_client.post(f"{BASE_URL}/api/sessions", json=payload)
        assert r.status_code == 422

    def test_create_no_performances_422(self, api_client):
        payload = {"first_name": "John", "last_name": "Doe", "vma_value": 15,
                   "performances": []}
        r = api_client.post(f"{BASE_URL}/api/sessions", json=payload)
        assert r.status_code == 422


# --- Get sessions ---
class TestGetSessions:
    def test_get_demo_runner_sessions(self, api_client):
        """Seeded 'Demo Coureur' should have 4 sessions, newest first."""
        r = api_client.get(f"{BASE_URL}/api/sessions",
                           params={"first_name": "Demo", "last_name": "Coureur"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4
        # Newest first
        timestamps = [s["created_at"] for s in data]
        assert timestamps == sorted(timestamps, reverse=True)
        # Each should have performances
        for s in data:
            assert "performances" in s and len(s["performances"]) >= 1
            assert "_id" not in s  # MongoDB _id excluded

    def test_get_case_insensitive(self, api_client):
        r_lower = api_client.get(f"{BASE_URL}/api/sessions",
                                 params={"first_name": "demo", "last_name": "coureur"})
        r_upper = api_client.get(f"{BASE_URL}/api/sessions",
                                 params={"first_name": "DEMO", "last_name": "COUREUR"})
        assert r_lower.status_code == 200
        assert r_upper.status_code == 200
        assert len(r_lower.json()) == len(r_upper.json()) >= 4

    def test_get_unknown_runner_returns_empty(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/sessions",
                           params={"first_name": "NoSuchRunner_TEST",
                                   "last_name": "DoesNotExist_TEST"})
        assert r.status_code == 200
        assert r.json() == []


# --- Delete session ---
class TestDeleteSession:
    def test_delete_test_session(self, api_client):
        session_id = TestCreateSession.created_id
        if not session_id:
            pytest.skip("No created session id")
        r = api_client.delete(f"{BASE_URL}/api/sessions/{session_id}")
        assert r.status_code == 200
        # Verify it's gone
        r2 = api_client.get(f"{BASE_URL}/api/sessions",
                            params={"first_name": "TEST_John", "last_name": "TEST_Runner"})
        ids = [s["id"] for s in r2.json()]
        assert session_id not in ids

    def test_delete_nonexistent_404(self, api_client):
        r = api_client.delete(f"{BASE_URL}/api/sessions/does-not-exist-xyz")
        assert r.status_code == 404


# --- Demo chart data integrity (for frontend 1000m progression) ---
class TestDemoProgression:
    def test_demo_1000m_progression(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/sessions",
                           params={"first_name": "Demo", "last_name": "Coureur"})
        sessions = r.json()
        # Sort oldest first
        sessions_sorted = sorted(sessions, key=lambda s: s["created_at"])
        km1000_speeds = []
        for s in sessions_sorted:
            runs = [p for p in s["performances"] if p["distance"] == 1000]
            if runs:
                km1000_speeds.append(max(r["speed"] for r in runs))
        assert len(km1000_speeds) >= 4
        # First around 13.3, last around 14.8 => progression > 1.0 km/h
        assert km1000_speeds[-1] - km1000_speeds[0] >= 1.0
