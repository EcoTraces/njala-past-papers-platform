from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_jobs_requires_internal_secret() -> None:
    payload = {
        "jobId": "11111111-1111-1111-1111-111111111111",
        "paperId": "22222222-2222-2222-2222-222222222222",
        "fileUrl": "https://example.com/file.pdf",
    }
    response = client.post("/jobs", json=payload)
    assert response.status_code == 401
