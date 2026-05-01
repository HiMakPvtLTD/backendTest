"""
Hi-MAK Backend API Tests — iteration_11
Covers:
- Auth: login/me + rate limiting (5/15min)
- Public blogs: list, by-slug, draft filtering
- Public projects: flat array (not paginated)
- Admin stats, submissions (paginated + search)
- Admin blogs CRUD with status field + pagination + q + status filter
- Admin projects CRUD with structured scope/techPartners/impact + industry filter
- Uploads: multipart auth, public GET, non-image rejection
- Contact + RFQ persistence + structured logging
"""
import os
import time
import io
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@himak.local"
ADMIN_PASSWORD = "Admin@2026"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(client):
    r = client.post(f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ──────────────── Auth ────────────────
class TestAuth:
    def test_login_success(self, client):
        r = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("token"), str) and len(data["token"]) > 10
        assert data["admin"]["email"] == ADMIN_EMAIL

    def test_me_with_token(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        email = r.json().get("admin", {}).get("email")
        assert email == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ──────────────── Rate-limit ────────────────
class TestRateLimit:
    def test_login_rate_limit_triggers_429_with_retry_after(self, client):
        """6th bad-password attempt within 15min must return 429 with retryAfter."""
        # Use a unique email so this test is independent of the known-good admin account
        bad_email = f"ratelimit+{int(time.time())}@test.local"
        status_codes = []
        body = None
        for i in range(6):
            r = client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": bad_email, "password": "wrong"})
            status_codes.append(r.status_code)
            if r.status_code == 429:
                body = r.json()
                break
        assert 429 in status_codes, f"Expected 429 within 6 attempts, got {status_codes}"
        assert body is not None
        assert body.get("error") == "too_many_attempts"
        assert "retryAfter" in body
        assert isinstance(body["retryAfter"], int) and body["retryAfter"] > 0


# ──────────────── Public blogs (flat + draft filtered) ────────────────
class TestPublicBlogs:
    def test_list_blogs_is_flat_array(self, client):
        r = client.get(f"{BASE_URL}/api/blogs")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), "Public /api/blogs must be a flat array"
        assert len(data) >= 1
        # Every returned blog must be published
        for b in data:
            assert b.get("status", "published") == "published"
            assert isinstance(b.get("tags", []), list)

    def test_get_blog_by_slug(self, client):
        slug = client.get(f"{BASE_URL}/api/blogs").json()[0]["slug"]
        r = client.get(f"{BASE_URL}/api/blogs/{slug}")
        assert r.status_code == 200
        blog = r.json()
        assert blog["slug"] == slug
        for k in ["sections", "keyTakeaways", "faqs"]:
            assert isinstance(blog[k], list)

    def test_draft_blog_is_hidden_from_public(self, client, auth_headers):
        """Create draft via admin → public list/slug must NOT return it; publish → it appears."""
        ts = int(time.time())
        slug = f"test-draft-{ts}"
        payload = {
            "slug": slug, "title": "TEST_Draft", "excerpt": "e",
            "author": "T", "date": "2026-01-15", "category": "Testing",
            "readMinutes": 2, "heroImg": "", "tags": ["TEST"],
            "status": "draft",
            "sections": [], "keyTakeaways": [], "faqs": [],
        }
        c = requests.post(f"{BASE_URL}/api/admin/blogs",
                          headers=auth_headers, json=payload)
        assert c.status_code in (200, 201), c.text
        blog_id = c.json()["id"]
        try:
            # Must be hidden in public list
            public_slugs = [b["slug"] for b in client.get(f"{BASE_URL}/api/blogs").json()]
            assert slug not in public_slugs, "Draft leaked to public list"
            # Must 404 on public slug fetch
            assert client.get(f"{BASE_URL}/api/blogs/{slug}").status_code == 404

            # Flip to published
            upd = dict(payload); upd["status"] = "published"
            u = requests.put(f"{BASE_URL}/api/admin/blogs/{blog_id}",
                             headers=auth_headers, json=upd)
            assert u.status_code in (200, 204), u.text

            public_slugs2 = [b["slug"] for b in client.get(f"{BASE_URL}/api/blogs").json()]
            assert slug in public_slugs2, "Published blog not visible publicly"
            assert client.get(f"{BASE_URL}/api/blogs/{slug}").status_code == 200
        finally:
            requests.delete(f"{BASE_URL}/api/admin/blogs/{blog_id}", headers=auth_headers)


# ──────────────── Public projects (flat array) ────────────────
class TestPublicProjects:
    def test_list_is_flat_array(self, client):
        r = client.get(f"{BASE_URL}/api/projects")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), "Public /api/projects must be flat array, not paginated"
        assert len(data) == 18, f"Expected 18 seeded projects, got {len(data)}"

    def test_get_by_slug_rich_fields(self, client):
        slug = client.get(f"{BASE_URL}/api/projects").json()[0]["slug"]
        r = client.get(f"{BASE_URL}/api/projects/{slug}")
        assert r.status_code == 200
        p = r.json()
        for k in ["tags", "scope", "differentiators", "outcomes", "techPartners", "impact"]:
            assert isinstance(p[k], list)


# ──────────────── Admin paginated endpoints ────────────────
class TestAdminPagination:
    def test_admin_blogs_paginated_shape(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/admin/blogs?page=1&pageSize=5", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ["items", "total", "page", "pageSize"]:
            assert k in data, f"paginated wrapper missing {k}"
        assert isinstance(data["items"], list)
        assert data["page"] == 1 and data["pageSize"] == 5
        assert len(data["items"]) <= 5

    def test_admin_blogs_q_filter(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/admin/blogs?q=PCS", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["items"], list)
        # q should narrow (not guaranteed >0 hits, but must return same wrapper shape)
        assert "total" in data

    def test_admin_blogs_status_filter(self, client, auth_headers):
        for s in ("draft", "published"):
            r = client.get(f"{BASE_URL}/api/admin/blogs?status={s}", headers=auth_headers)
            assert r.status_code == 200
            for b in r.json()["items"]:
                assert b.get("status") == s

    def test_admin_projects_industry_filter(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/admin/projects?industry=Pharmaceuticals",
                       headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data
        for p in data["items"]:
            assert p["industry"] == "Pharmaceuticals"

    def test_admin_submissions_paginated_and_search(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/admin/submissions?page=1&pageSize=10",
                       headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ["items", "total", "page", "pageSize"]:
            assert k in data
        # q search (may return 0 or more)
        r2 = client.get(f"{BASE_URL}/api/admin/submissions?q=TEST_",
                        headers=auth_headers)
        assert r2.status_code == 200
        assert isinstance(r2.json()["items"], list)


# ──────────────── Uploads ────────────────
class TestUploads:
    def test_uploads_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/uploads",
                          files={"file": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")})
        assert r.status_code == 401

    def test_upload_image_and_public_fetch(self, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        png = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
        files = {"file": ("test.png", png, "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/uploads", headers=headers, files=files)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        for k in ["url", "filename", "size", "mime"]:
            assert k in body
        assert body["mime"] == "image/png"
        # Public GET
        url = body["url"]
        fetch = requests.get(f"{BASE_URL}{url}")
        assert fetch.status_code == 200, f"uploaded image not retrievable: {fetch.status_code}"
        assert fetch.headers.get("content-type", "").startswith("image/")

    def test_upload_rejects_non_image(self, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/admin/uploads", headers=headers, files=files)
        assert r.status_code == 415, f"expected 415, got {r.status_code}: {r.text}"


# ──────────────── Admin blogs CRUD ────────────────
class TestAdminBlogsCRUD:
    def test_full_blog_crud_with_status(self, client, auth_headers):
        ts = int(time.time())
        payload = {
            "slug": f"test-crud-{ts}", "title": "TEST_Blog", "excerpt": "e",
            "author": "T", "date": "2026-01-15", "category": "Testing",
            "readMinutes": 3, "heroImg": "", "tags": ["TEST"],
            "sections": [{"heading": "Intro", "body": "x"}],
            "keyTakeaways": ["k1"], "faqs": [{"q": "q?", "a": "a"}],
            # status not set → backend defaults to draft
        }
        c = requests.post(f"{BASE_URL}/api/admin/blogs",
                          headers=auth_headers, json=payload)
        assert c.status_code in (200, 201), c.text
        blog_id = c.json()["id"]
        try:
            # GET via admin → must include status
            g = requests.get(f"{BASE_URL}/api/admin/blogs/{blog_id}", headers=auth_headers)
            assert g.status_code == 200
            assert "status" in g.json()
            assert g.json()["status"] == "draft"

            # Publish and verify public visibility
            upd = dict(payload); upd["title"] = "TEST_Blog Updated"; upd["status"] = "published"
            u = requests.put(f"{BASE_URL}/api/admin/blogs/{blog_id}",
                             headers=auth_headers, json=upd)
            assert u.status_code in (200, 204), u.text
            pub = client.get(f"{BASE_URL}/api/blogs/{payload['slug']}")
            assert pub.status_code == 200
            assert pub.json()["title"] == "TEST_Blog Updated"
        finally:
            d = requests.delete(f"{BASE_URL}/api/admin/blogs/{blog_id}",
                                headers=auth_headers)
            assert d.status_code in (200, 204)


# ──────────────── Admin projects CRUD (structured fields) ────────────────
class TestAdminProjectsCRUD:
    def test_full_project_crud_structured(self, client, auth_headers):
        ts = int(time.time())
        payload = {
            "slug": f"test-proj-{ts}", "title": "TEST_Project",
            "subtitle": "sub", "industry": "Testing", "solution": "Automation",
            "platform": "S7-1500", "metric": "99%", "description": "desc",
            "image": "/img/p.jpg", "heroImg": "/img/p-hero.jpg",
            "tags": ["TEST", "qa"],
            "challenge": "c", "solutionDetail": "sd",
            "scope": [{"category": "Instrumentation", "items": ["PT", "FT"]}],
            "differentiators": ["diff1", "diff2"],
            "outcomes": ["out1"],
            "techPartners": [{"category": "PLC", "brands": ["Siemens", "Rockwell"]}],
            "impact": [{"value": "99%", "label": "Uptime"}],
        }
        c = requests.post(f"{BASE_URL}/api/admin/projects",
                          headers=auth_headers, json=payload)
        assert c.status_code in (200, 201), c.text
        pid = c.json()["id"]
        try:
            g = client.get(f"{BASE_URL}/api/projects/{payload['slug']}")
            assert g.status_code == 200
            body = g.json()
            assert body["title"] == "TEST_Project"
            # Structured fields come back decoded
            assert body["scope"][0]["category"] == "Instrumentation"
            assert "PT" in body["scope"][0]["items"]
            assert body["techPartners"][0]["brands"] == ["Siemens", "Rockwell"]
            assert body["impact"][0]["value"] == "99%"
            assert body["differentiators"] == ["diff1", "diff2"]

            upd = dict(payload); upd["title"] = "TEST_Project Updated"
            u = requests.put(f"{BASE_URL}/api/admin/projects/{pid}",
                             headers=auth_headers, json=upd)
            assert u.status_code in (200, 204)
            assert client.get(f"{BASE_URL}/api/projects/{payload['slug']}").json()["title"] == "TEST_Project Updated"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/projects/{pid}", headers=auth_headers)
            assert client.get(f"{BASE_URL}/api/projects/{payload['slug']}").status_code == 404
        # Baseline preserved
        assert len(client.get(f"{BASE_URL}/api/projects").json()) == 18


# ──────────────── Contact + RFQ ────────────────
class TestContactAndRfq:
    def test_contact_post_persists(self, client, auth_headers):
        payload = {
            "name": "TEST_Contact", "email": f"test+{int(time.time())}@example.com",
            "phone": "+91 0000000000", "company": "TestCo",
            "message": "Backend test msg",
        }
        r = client.post(f"{BASE_URL}/api/contact", json=payload)
        assert r.status_code == 201, r.text
        # Verify persisted by searching admin submissions for the email
        time.sleep(0.3)
        sr = client.get(f"{BASE_URL}/api/admin/submissions",
                        params={"q": payload["email"]}, headers=auth_headers)
        assert sr.status_code == 200
        emails = [s["email"] for s in sr.json()["items"]]
        assert payload["email"] in emails

    def test_rfq_post(self, client):
        payload = {
            "name": "TEST_Rfq", "email": f"rfq+{int(time.time())}@example.com",
            "phone": "+91 0000000000", "company": "TestCo",
            "industry": "Chemicals", "solution": "PLC",
            "message": "Need a quote",
        }
        r = client.post(f"{BASE_URL}/api/rfq", json=payload)
        assert r.status_code == 201, r.text
