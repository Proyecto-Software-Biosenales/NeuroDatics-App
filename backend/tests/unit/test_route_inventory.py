"""Pin mounted HTTP operations, including multiline route decorators."""

import json
from pathlib import Path

from fastapi.routing import APIRoute

from neurodatics.main import app


def test_mounted_http_route_inventory():
    actual = sorted(
        f"{method} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    )
    snapshot = Path(__file__).parents[1] / "fixtures" / "route_inventory.json"
    assert actual == json.loads(snapshot.read_text(encoding="utf-8"))
