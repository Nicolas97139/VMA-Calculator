"""Backend tests for groups, runner profile, leaderboard, and new_records on POST /api/sessions"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vma-threshold-calc.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # Cleanup TEST_ data
    try:
        runners = s.get(f"{API}/runners").json()
        for r in runners:
            if r["first_name"].startswith("TEST_") or r["last_name"].startswith("TEST_"):
                sessions = s.get(f"{API}/sessions", params={"first_name": r["first_name"], "last_name": r["last_name"]}).json()
                for sess in sessions:
                    s.delete(f"{API}/sessions/{sess['id']}")
    except Exception:
        pass


# --- Groups endpoints ---

def test_list_groups_basic(session):
    r = session.get(f"{API}/groups")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for g in data:
        assert {"id", "name", "member_count"} <= set(g.keys())
    names = [g["name"].casefold() for g in data]
    assert names == sorted(names)


def test_create_group_empty_name_422(session):
    r = session.post(f"{API}/groups", json={"name": ""})
    assert r.status_code == 422


def test_create_group_and_idempotent_case_insensitive(session):
    name = f"TEST_Group_{int(time.time())}"
    r1 = session.post(f"{API}/groups", json={"name": name})
    assert r1.status_code == 200
    gid = r1.json()["id"]
    assert r1.json()["name"] == name
    assert r1.json()["member_count"] == 0

    # Same name different case -> returns same group
    r2 = session.post(f"{API}/groups", json={"name": name.upper()})
    assert r2.status_code == 200
    assert r2.json()["id"] == gid


def test_leaderboard_unknown_group_404(session):
    r = session.get(f"{API}/groups/unknown-id-xyz/leaderboard")
    assert r.status_code == 404


def test_leaderboard_club_demo(session):
    groups = session.get(f"{API}/groups").json()
    club = next((g for g in groups if g["name"] == "Club Demo"), None)
    assert club, "Club Demo seed group missing"
    r = session.get(f"{API}/groups/{club['id']}/leaderboard")
    assert r.status_code == 200
    boards = r.json()
    assert isinstance(boards, list) and len(boards) > 0
    # 1000m should include both Demo Coureur and Marie Leroy, sorted fastest first
    board_1000 = next((b for b in boards if b["distance"] == 1000), None)
    assert board_1000, "1000m leaderboard missing"
    times = [e["time_seconds"] for e in board_1000["entries"]]
    assert times == sorted(times)
    names = [f"{e['first_name']} {e['last_name']}" for e in board_1000["entries"]]
    assert "Demo Coureur" in names
    # Demo Coureur best 4:00 (240s) must beat Marie Leroy 4:20 (260s)
    demo_entry = next(e for e in board_1000["entries"] if e["first_name"] == "Demo")
    assert demo_entry["time_seconds"] == 240


# --- Runner profile ---

def test_runner_profile_case_insensitive(session):
    r = session.get(f"{API}/runners/profile", params={"first_name": "demo", "last_name": "COUREUR"})
    assert r.status_code == 200
    data = r.json()
    assert data["group_name"] == "Club Demo"
    assert data["group_id"]


def test_runner_profile_unknown_returns_null_group(session):
    r = session.get(f"{API}/runners/profile", params={"first_name": "TEST_No", "last_name": "TEST_Body"})
    assert r.status_code == 200
    assert r.json()["group_id"] is None
    assert r.json()["group_name"] is None


# --- Runners filtering ---

def test_runners_filter_by_group(session):
    groups = session.get(f"{API}/groups").json()
    club = next(g for g in groups if g["name"] == "Club Demo")
    r = session.get(f"{API}/runners", params={"group_id": club["id"]})
    assert r.status_code == 200
    runners = r.json()
    assert len(runners) >= 2
    for runner in runners:
        assert runner["group_id"] == club["id"]
        assert runner["group_name"] == "Club Demo"


def test_runners_no_filter_includes_ungrouped(session):
    r = session.get(f"{API}/runners")
    assert r.status_code == 200
    names = [f"{x['first_name']} {x['last_name']}" for x in r.json()]
    # seeded ungrouped runners
    assert "Jean Dupont" in names or "Jeanne Dupont" in names


# --- Sessions: group_id + new_records ---

def test_create_session_unknown_group_404(session):
    payload = {
        "first_name": "TEST_Runner", "last_name": "TEST_One",
        "vma_value": 15.0,
        "group_id": "unknown-group-id-xyz",
        "performances": [{"distance": 1000, "time": "4:30", "time_seconds": 270, "speed": 13.3, "pace": "4:30", "percentage": 88, "zone_name": "Seuil", "zone_index": 3}],
    }
    r = session.post(f"{API}/sessions", json=payload)
    assert r.status_code == 404


def test_new_records_first_then_faster_then_slower(session):
    first_name = f"TEST_Rec_{int(time.time())}"
    last_name = "Runner"

    # First session at 1000m 5:00 -> first time, previous_time_seconds=None
    s1 = session.post(f"{API}/sessions", json={
        "first_name": first_name, "last_name": last_name, "vma_value": 15,
        "performances": [{"distance": 1000, "time": "5:00", "time_seconds": 300, "speed": 12, "pace": "5:00", "percentage": 80, "zone_name": "Z", "zone_index": 3}],
    })
    assert s1.status_code == 200
    recs = s1.json()["new_records"]
    assert len(recs) == 1
    assert recs[0]["distance"] == 1000
    assert recs[0]["previous_time_seconds"] is None
    assert recs[0]["improvement_seconds"] is None

    # Second session at 1000m 4:30 (faster) -> record with improvement 30s
    s2 = session.post(f"{API}/sessions", json={
        "first_name": first_name, "last_name": last_name, "vma_value": 15,
        "performances": [{"distance": 1000, "time": "4:30", "time_seconds": 270, "speed": 13.3, "pace": "4:30", "percentage": 88, "zone_name": "Z", "zone_index": 3}],
    })
    assert s2.status_code == 200
    recs2 = s2.json()["new_records"]
    assert len(recs2) == 1
    assert recs2[0]["previous_time_seconds"] == 300
    assert recs2[0]["improvement_seconds"] == 30

    # Third session at 1000m 5:30 (slower) -> no record
    s3 = session.post(f"{API}/sessions", json={
        "first_name": first_name, "last_name": last_name, "vma_value": 15,
        "performances": [{"distance": 1000, "time": "5:30", "time_seconds": 330, "speed": 10.9, "pace": "5:30", "percentage": 73, "zone_name": "Z", "zone_index": 2}],
    })
    assert s3.status_code == 200
    assert s3.json()["new_records"] == []

    # Cleanup
    for s_id in [s1.json()["id"], s2.json()["id"], s3.json()["id"]]:
        session.delete(f"{API}/sessions/{s_id}")


def test_session_upserts_group_on_profile(session):
    # Create a new group
    group_name = f"TEST_Grp_{int(time.time())}"
    g = session.post(f"{API}/groups", json={"name": group_name}).json()

    first_name = f"TEST_Grouped_{int(time.time())}"
    last_name = "Runner"
    r = session.post(f"{API}/sessions", json={
        "first_name": first_name, "last_name": last_name, "vma_value": 15,
        "group_id": g["id"],
        "performances": [{"distance": 400, "time": "1:40", "time_seconds": 100, "speed": 14.4, "pace": "4:10", "percentage": 95, "zone_name": "Z", "zone_index": 5}],
    })
    assert r.status_code == 200

    # Profile should return the group
    prof = session.get(f"{API}/runners/profile", params={"first_name": first_name, "last_name": last_name}).json()
    assert prof["group_id"] == g["id"]
    assert prof["group_name"] == group_name

    # Cleanup
    session.delete(f"{API}/sessions/{r.json()['id']}")
