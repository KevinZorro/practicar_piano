"""OpenAPI export: ``uv run python -m pianola.api.openapi`` rewrites docs/api/openapi.json.

The frontend generates its types from that file and a test fails when it is stale.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from pianola.api.app import create_app
from pianola.api.container import Container

SCHEMA_PATH = Path(__file__).resolve().parents[4] / "docs" / "api" / "openapi.json"


def build_schema() -> dict[str, Any]:
    # Routes only touch the container when called, so the schema needs no real adapters.
    return create_app(cast(Container, None)).openapi()


def render() -> str:
    return json.dumps(build_schema(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.write_text(render(), encoding="utf-8")


if __name__ == "__main__":
    main()
