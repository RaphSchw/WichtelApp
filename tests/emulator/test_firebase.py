"""Tests gegen den Firebase-Emulator (laufen in GitHub Actions über `firebase emulators:exec`).
Prüfen die Zugriffsregeln und den echten Speicherweg der App."""
import os
import pytest
import requests

pytestmark = pytest.mark.skipif(not os.environ.get("EMULATOR"), reason="nur mit Firebase-Emulator (EMULATOR=1)")

AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
FS = "http://127.0.0.1:8080/v1/projects/demo-wichteln/databases/(default)/documents"


def new_user():
    r = requests.post(f"{AUTH}/accounts:signUp?key=demo-key", json={"returnSecureToken": True}, timeout=10)
    r.raise_for_status()
    d = r.json()
    return d["localId"], {"Authorization": f"Bearer {d['idToken']}"}


def group_doc(gid):
    return {"fields": {"id": {"stringValue": gid}, "people": {"arrayValue": {"values": [{"stringValue": "Anna"}]}}}}


def test_eigene_runde_lesen_und_schreiben():
    uid, h = new_user()
    url = f"{FS}/users/{uid}/groups/g1"
    assert requests.patch(url, json=group_doc("g1"), headers=h, timeout=10).status_code == 200
    assert requests.get(url, headers=h, timeout=10).status_code == 200


def test_fremde_runde_gesperrt():
    uid_a, h_a = new_user()
    _, h_b = new_user()
    url = f"{FS}/users/{uid_a}/groups/g1"
    requests.patch(url, json=group_doc("g1"), headers=h_a, timeout=10).raise_for_status()
    assert requests.get(url, headers=h_b, timeout=10).status_code == 403, "andere Person darf nicht lesen"
    assert requests.patch(url, json=group_doc("g1"), headers=h_b, timeout=10).status_code == 403, "andere Person darf nicht schreiben"
    assert requests.delete(url, headers=h_b, timeout=10).status_code == 403, "andere Person darf nicht löschen"
    assert requests.get(url, timeout=10).status_code == 403, "ohne Anmeldung kein Zugriff"


def test_ungueltige_runde_abgelehnt():
    uid, h = new_user()
    bad = {"fields": {"id": {"stringValue": "andere-id"}, "people": {"arrayValue": {"values": []}}}}
    assert requests.patch(f"{FS}/users/{uid}/groups/g2", json=bad, headers=h, timeout=10).status_code == 403


def test_app_speichert_in_firestore(page, base_url):
    page.goto(f"{base_url}orga/?emulator")
    page.click("#login", timeout=30000)
    page.wait_for_selector("#newg", timeout=30000)
    page.click("#newg")
    page.fill("#g-name", "Emulator-Runde")
    page.fill("#g-org", "Lisa")
    page.fill("#name", "Anna, Ben, Clara")
    page.click("#addf button")
    page.click("#go")
    page.wait_for_selector("#distBox")
    page.wait_for_timeout(1500)
    page.reload()
    page.wait_for_selector(".gcard", timeout=30000)
    assert "Emulator-Runde" in page.inner_text(".grid")
    assert "Auslosung Nr. 1" in page.inner_text(".grid")
