"""Serve the student frontend, a static export of the web app, from the API's own origin.

One origin means the browser needs no CORS, no second port and no proxy: the pages call
``/api/...`` on the address they were loaded from, which is also what the Host/Origin guard
checks. Directory URLs (``/proyectos/``) resolve to their ``index.html`` and unknown paths
answer with the export's ``404.html``.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

# The web app asks for the project collection without its trailing slash. The server edition's
# Next.js rewrite adds it (next.config.mjs); here the catch-all site would answer 404 before
# FastAPI's own slash redirect could run, so the same rewrite is done in front of the router.
API_PATH_ALIASES = {"/api/projects": "/api/projects/"}


# Next.js prefetches a page's data as `<page>/__next.<page>.__PAGE__.txt`, but a Windows export
# writes that file as `<page>/__next.<page>/__PAGE__.txt`. Without the mapping every link on
# screen answers 404 and navigation falls back to a full page load.
_SEGMENT_DATA = re.compile(r"^(?P<folder>(?:.*/)?)__next\.(?P<page>[^/.]+)\.__PAGE__\.txt$")


class _ExportedSite(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        # Starlette hands over an OS-style relative path, backslashes on Windows.
        if response.status_code == 404 and (match := _SEGMENT_DATA.match(path.replace("\\", "/"))):
            nested = f"{match['folder']}__next.{match['page']}/__PAGE__.txt"
            found = await super().get_response(nested, scope)
            # 304 counts: the browser revalidates what it cached from an earlier visit.
            if found.status_code != 404:
                return found
        return response


class _PathAliases:
    def __init__(self, app: ASGIApp, aliases: dict[str, str]):
        self.app = app
        self.aliases = aliases

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        target = self.aliases.get(scope["path"]) if scope["type"] == "http" else None
        if target is not None:
            scope = {**scope, "path": target, "raw_path": target.encode("ascii")}
        await self.app(scope, receive, send)


def mount_frontend(app: FastAPI, directory: str | os.PathLike[str]) -> bool:
    """Mount the export at ``/``; False when the folder holds no exported site."""
    root = Path(directory)
    if not (root / "index.html").is_file():
        return False
    app.add_middleware(_PathAliases, aliases=API_PATH_ALIASES)
    app.mount("/", _ExportedSite(directory=root, html=True), name="frontend")
    return True
