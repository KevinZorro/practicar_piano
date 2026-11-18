from notacaida.api.openapi import SCHEMA_PATH, build_schema, render


def test_committed_openapi_is_up_to_date() -> None:
    assert SCHEMA_PATH.read_text(encoding="utf-8") == render(), (
        "docs/api/openapi.json is stale: run `uv run python -m notacaida.api.openapi`"
    )


def test_contract_exposes_the_job_endpoints() -> None:
    paths = build_schema()["paths"]
    assert set(paths) == {
        "/api/v1/jobs",
        "/api/v1/jobs/{job_id}",
        "/api/v1/jobs/{job_id}/events",
        "/api/v1/jobs/{job_id}/result",
    }
    assert set(paths["/api/v1/jobs/{job_id}"]) == {"get", "delete"}
