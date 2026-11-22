"""Gastseite: nur das eigene Los, keine Verwaltung."""
import json, subprocess
from pathlib import Path

CORE = Path(__file__).resolve().parents[2] / "site" / "src" / "core.js"


def make_token(payload):
    js = f"import('{CORE.as_uri()}').then(m => console.log(m.pack({json.dumps(payload)})))"
    return subprocess.check_output(["node", "--input-type=module", "-e", js], text=True).strip()


def test_ohne_link_nur_hinweis(page, base_url):
    page.goto(base_url)
    page.wait_for_selector("h1")
    assert page.inner_text("h1") == "Frohe Weihnachten!"
    assert page.locator("input, #login, #newg").count() == 0, "Gäste dürfen keine Verwaltung sehen"


def test_persoenlicher_link_zeigt_nur_das_eigene_los(page, base_url):
    token = make_token(["Familie 2026", "Anna", "Gisela", "25", "2026-12-24", 2, "2026-11-22", "Lisa"])
    page.goto(f"{base_url}#w-{token}")
    page.wait_for_selector("#openEnv")
    assert page.inner_text("h1") == "Hallo Anna!"
    assert "Lisa hat für „Familie 2026“ ausgelost" in page.inner_text(".sub")
    assert not page.locator(".e-letter b").is_visible(), "Name darf vor dem Öffnen nicht sichtbar sein"
    page.click("#openEnv")
    page.wait_for_timeout(1500)
    text = page.inner_text("#after")
    assert "Du beschenkst Gisela" in text
    assert "25 €" in text and "24.12.2026" in text
    assert "Auslosung Nr. 2 vom 22.11.2026" in text


def test_kaputter_link(page, base_url):
    page.goto(f"{base_url}#w-abc")
    page.wait_for_selector("h1")
    assert page.inner_text("h1") == "Hoppla!"
