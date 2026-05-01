"""Tests for Hi-MAK RFQ API (Phase 8)"""
import os
import pytest
import requests
import re
from typing import Set

BASE_URL: str = os.environ.get('REACT_APP_BACKEND_URL', 'https://industrial-tech-20.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def client() -> requests.Session:
    s: requests.Session = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Health check
class TestHealth:
    def test_root(self, client: requests.Session) -> None:
        r: requests.Response = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("message") == "Hi-MAK API Running"


# RFQ submission/listing
class TestRFQ:
    def test_submit_rfq_success(self, client: requests.Session) -> None:
        payload: dict = {
            "name": "TEST_John Doe",
            "company": "TEST_Acme Industries",
            "email": "TEST_john@acme.com",
            "phone": "9999999999",
            "inquiry_type": "automation",
            "project_scope": "Turnkey automation",
            "message": "Need a quote",
        }
        r: requests.Response = client.post(f"{BASE_URL}/api/rfq", json=payload)
        assert r.status_code == 200, r.text
        data: dict = r.json()
        for key in ["id", "name", "company", "email", "inquiry_type", "submitted_at", "status"]:
            assert key in data, f"Missing key: {key}"
        assert isinstance(data["id"], str)
        assert len(data["id"]) == 8
        assert re.fullmatch(r"[0-9A-F]{8}", data["id"]), f"Bad id format: {data['id']}"
        assert data["name"] == payload["name"]
        assert data["company"] == payload["company"]
        assert data["email"] == payload["email"]
        assert data["inquiry_type"] == payload["inquiry_type"]
        assert data["status"] == "new"
        assert "T" in data["submitted_at"]

    def test_submit_rfq_minimal_fields(self, client: requests.Session) -> None:
        """phone, project_scope, message are optional."""
        payload: dict = {
            "name": "TEST_Minimal",
            "company": "TEST_Min Co",
            "email": "min@test.com",
            "inquiry_type": "digital",
        }
        r: requests.Response = client.post(f"{BASE_URL}/api/rfq", json=payload)
        assert r.status_code == 200, r.text
        data: dict = r.json()
        assert data["id"]
        assert data["status"] == "new"

    def test_submit_rfq_missing_required_returns_422(self, client: requests.Session) -> None:
        r: requests.Response = client.post(f"{BASE_URL}/api/rfq", json={"company": "TEST_Only"})
        assert r.status_code == 422

    def test_rfq_unique_ids(self, client: requests.Session) -> None:
        ids: Set[str] = set()
        for i in range(3):
            r: requests.Response = client.post(f"{BASE_URL}/api/rfq", json={
                "name": f"TEST_Unique{i}",
                "company": "TEST_UniqueCo",
                "email": f"u{i}@t.com",
                "inquiry_type": "electrical",
            })
            assert r.status_code == 200
            ids.add(r.json()["id"])
        assert len(ids) == 3, "RFQ ids should be unique"

    def test_get_rfq_list_and_persistence(self, client: requests.Session) -> None:
        payload: dict = {
            "name": "TEST_Persist",
            "company": "TEST_PersistCo",
            "email": "persist@test.com",
            "inquiry_type": "instrumentation",
            "message": "persistence check",
        }
        r: requests.Response = client.post(f"{BASE_URL}/api/rfq", json=payload)
        assert r.status_code == 200
        new_id: str = r.json()["id"]

        r2: requests.Response = client.get(f"{BASE_URL}/api/rfq")
        assert r2.status_code == 200
        submissions: list = r2.json()
        assert isinstance(submissions, list)
        assert len(submissions) > 0
        match: list = [s for s in submissions if s.get("id") == new_id]
        assert len(match) == 1, f"Created RFQ id {new_id} not found in GET list"
        assert match[0]["company"] == payload["company"]
        for s in submissions:
            assert "_id" not in s


# Pre-existing status endpoint still works
class TestStatus:
    def test_status_create_and_get(self, client: requests.Session) -> None:
        r: requests.Response = client.post(f"{BASE_URL}/api/status", json={"client_name": "TEST_StatusClient"})
        assert r.status_code == 200
        data: dict = r.json()
        assert data["client_name"] == "TEST_StatusClient"
        assert "id" in data
        r2: requests.Response = client.get(f"{BASE_URL}/api/status")
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)
