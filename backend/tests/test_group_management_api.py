"""Backend tests for the 'gestion des groupes' feature (iteration 4).

Covers:
- PUT /api/groups/{id} rename: 200 success, 404 unknown, 409 duplicate, 422 empty
- DELETE /api/groups/{id}: 200 + runner profiles cleared, 404 unknown
- PUT /api/runners/group: 200 move/clear, 404 unknown group, reflected in GET /api/runners & /api/runners/profile
- Regression: sessions keep working after group delete; group members intact as runners
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vma-threshold-calc.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TEST_TAG = f"TEST_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s


@pytest.fixture(scope="module")
def created_groups(api):
    """Create 2 TEST_ groups; cleanup at the end."""
    ids = {}
    for suffix in ("A", "B"):
        name = f"{TEST_TAG}_Group_{suffix}"
        r = api.post(f"{API}/groups", json={"name": name})
        assert r.status_code == 200, r.text
        ids[suffix] = r.json()["id"]
    yield ids
    # Cleanup
    for gid in ids.values():
        try:
            api.delete(f"{API}/groups/{gid}")
        except Exception:
            pass


# ---------- rename ----------
class TestRenameGroup:
    def test_rename_success(self, api, created_groups):
        gid = created_groups["A"]
        new_name = f"{TEST_TAG}_Renamed_A"
        r = api.put(f"{API}/groups/{gid}", json={"name": new_name})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == gid
        assert body["name"] == new_name
        # verify persisted
        g = next(g for g in api.get(f"{API}/groups").json() if g["id"] == gid)
        assert g["name"] == new_name
        # restore name key for next tests
        api.put(f"{API}/groups/{gid}", json={"name": f"{TEST_TAG}_Group_A"})

    def test_rename_duplicate_returns_409(self, api, created_groups):
        gid_b = created_groups["B"]
        # Try to rename B to the same name as A (case-insensitive match)
        r = api.put(f"{API}/groups/{gid_b}", json={"name": f"{TEST_TAG}_group_a"})
        assert r.status_code == 409, r.text
        assert "déjà" in r.json()["detail"].lower() or "existe" in r.json()["detail"].lower()

    def test_rename_same_name_ok(self, api, created_groups):
        """Renaming to the same name (own group) should NOT 409."""
        gid = created_groups["A"]
        r = api.put(f"{API}/groups/{gid}", json={"name": f"{TEST_TAG}_Group_A"})
        assert r.status_code == 200, r.text

    def test_rename_empty_422(self, api, created_groups):
        gid = created_groups["A"]
        r = api.put(f"{API}/groups/{gid}", json={"name": ""})
        # Pydantic min_length=1 -> 422; whitespace-only would 400. Both are client errors.
        assert r.status_code in (400, 422), r.text

    def test_rename_unknown_404(self, api):
        r = api.put(f"{API}/groups/{uuid.uuid4()}", json={"name": f"{TEST_TAG}_Ghost"})
        assert r.status_code == 404, r.text


# ---------- move runner ----------
class TestMoveRunner:
    def test_move_runner_to_group(self, api, created_groups):
        gid = created_groups["A"]
        payload = {"first_name": "Jean", "last_name": "Dupont", "group_id": gid}
        r = api.put(f"{API}/runners/group", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["group_id"] == gid
        # Reflected in /runners
        runners = api.get(f"{API}/runners").json()
        jean = next(r for r in runners if r["first_name"] == "Jean" and r["last_name"] == "Dupont")
        assert jean["group_id"] == gid
        # Reflected in /runners/profile
        prof = api.get(f"{API}/runners/profile", params={"first_name": "Jean", "last_name": "Dupont"}).json()
        assert prof["group_id"] == gid

    def test_move_runner_to_none(self, api):
        payload = {"first_name": "Jean", "last_name": "Dupont", "group_id": None}
        r = api.put(f"{API}/runners/group", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["group_id"] is None
        prof = api.get(f"{API}/runners/profile", params={"first_name": "Jean", "last_name": "Dupont"}).json()
        assert prof["group_id"] is None

    def test_move_runner_unknown_group_404(self, api):
        payload = {"first_name": "Jean", "last_name": "Dupont", "group_id": str(uuid.uuid4())}
        r = api.put(f"{API}/runners/group", json=payload)
        assert r.status_code == 404, r.text


# ---------- delete group ----------
class TestDeleteGroup:
    def test_delete_unknown_404(self, api):
        r = api.delete(f"{API}/groups/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_delete_group_clears_profiles_but_keeps_runners(self, api, created_groups):
        gid = created_groups["B"]
        # Put a runner in B
        api.put(f"{API}/runners/group", json={"first_name": "Jeanne", "last_name": "Dupont", "group_id": gid})
        prof = api.get(f"{API}/runners/profile", params={"first_name": "Jeanne", "last_name": "Dupont"}).json()
        assert prof["group_id"] == gid

        # Delete the group
        r = api.delete(f"{API}/groups/{gid}")
        assert r.status_code == 200, r.text

        # Group is gone
        groups = api.get(f"{API}/groups").json()
        assert all(g["id"] != gid for g in groups)

        # Runner is still here with no group
        runners = api.get(f"{API}/runners").json()
        jeanne = next(r for r in runners if r["first_name"] == "Jeanne" and r["last_name"] == "Dupont")
        assert jeanne["group_id"] is None
        assert jeanne["group_name"] is None
        # Her sessions are preserved
        assert jeanne["session_count"] >= 1

        # Remove B from fixture so cleanup doesn't 404
        created_groups.pop("B", None)


# ---------- regression: save session still works after group ops ----------
class TestSessionAfterGroupOps:
    def test_create_session_with_test_group(self, api, created_groups):
        gid = created_groups["A"]
        first, last = f"{TEST_TAG}_First", f"{TEST_TAG}_Last"
        payload = {
            "first_name": first,
            "last_name": last,
            "vma_value": 15.0,
            "group_id": gid,
            "performances": [{
                "distance": 1000, "time": "4:00", "time_seconds": 240,
                "speed": 15.0, "pace": "4:00", "percentage": 100,
                "zone_name": "VMA", "zone_index": 5,
            }],
        }
        r = api.post(f"{API}/sessions", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["first_name"] == first
        assert len(body["new_records"]) == 1
        # Profile should reflect the group
        prof = api.get(f"{API}/runners/profile", params={"first_name": first, "last_name": last}).json()
        assert prof["group_id"] == gid

    def test_create_session_unknown_group_404(self, api):
        payload = {
            "first_name": f"{TEST_TAG}_X", "last_name": f"{TEST_TAG}_Y",
            "vma_value": 15.0, "group_id": str(uuid.uuid4()),
            "performances": [{
                "distance": 1000, "time": "4:00", "time_seconds": 240,
                "speed": 15.0, "pace": "4:00", "percentage": 100,
                "zone_name": "VMA", "zone_index": 5,
            }],
        }
        r = api.post(f"{API}/sessions", json=payload)
        assert r.status_code == 404


# ---------- Final cleanup ----------
def test_zz_cleanup(api):
    """Reset seed state and remove TEST_ artefacts.

    - Ensure Jean & Jeanne Dupont are back to no-group
    - Remove TEST_ sessions and profiles
    """
    for first, last in (("Jean", "Dupont"), ("Jeanne", "Dupont")):
        api.put(f"{API}/runners/group", json={"first_name": first, "last_name": last, "group_id": None})

    # Delete any TEST_ sessions (via Mongo through API: delete sessions by id)
    runners = api.get(f"{API}/runners").json()
    for r in runners:
        if r["first_name"].startswith("TEST_") or r["last_name"].startswith("TEST_"):
            sessions = api.get(f"{API}/sessions",
                               params={"first_name": r["first_name"], "last_name": r["last_name"]}).json()
            for s in sessions:
                api.delete(f"{API}/sessions/{s['id']}")

    # Delete remaining TEST_ groups
    groups = api.get(f"{API}/groups").json()
    for g in groups:
        if g["name"].startswith("TEST_"):
            api.delete(f"{API}/groups/{g['id']}")

    # Verify seed is preserved
    groups_after = api.get(f"{API}/groups").json()
    assert any(g["name"] == "Club Demo" for g in groups_after), "Seed group Club Demo missing!"
    assert all(not g["name"].startswith("TEST_") for g in groups_after)
