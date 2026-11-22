"""Gemeinsame Test-Fixtures: lokaler Webserver für site/ und ein Chromium-Browser."""
import functools, http.server, os, socketserver, threading
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent / "site"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="session")
def base_url():
    handler = functools.partial(_Quiet, directory=str(SITE))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        if os.environ.get("CHROME_PATH"):
            kw["executable_path"] = os.environ["CHROME_PATH"]
        b = p.chromium.launch(**kw)
        yield b
        b.close()


@pytest.fixture
def context(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    yield ctx
    ctx.close()


@pytest.fixture
def page(context):
    pg = context.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    yield pg
    assert not pg.errors, f"JavaScript-Fehler: {pg.errors}"
