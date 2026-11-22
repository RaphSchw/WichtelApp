"""Spielleitung mit Test-Speicher (?test): kompletter Ablauf wie in der UX-Prüfung."""
import re, urllib.parse
import pytest


@pytest.fixture
def orga(page, base_url):
    page.goto(f"{base_url}orga/?test")
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    page.reload()
    page.click("#login")
    page.wait_for_selector("#newg")
    return page


def setup_group(pg, new=True):
    if new:
        pg.click("#newg")
    pg.fill("#g-name", "Familie 2026")
    pg.fill("#g-budget", "25")
    pg.fill("#g-date", "2026-12-24")
    pg.fill("#name", "Anna, Ben, Clara, David, Gisela, Markus")
    pg.click("#addf button")


def test_anmeldung_noetig(page, base_url):
    page.goto(f"{base_url}orga/?test")
    page.evaluate("sessionStorage.clear()")
    page.reload()
    page.wait_for_selector("#login")
    assert page.locator("#newg").count() == 0


def test_schritte_und_organisator_pflicht(orga):
    orga.click("#newg")
    assert "Namen eintragen" in orga.locator(".steps li.cur").inner_text()
    setup_group(orga, new=False)
    assert orga.locator("#drawArea button[disabled]").count() == 1, "Auslosen ohne Organisator-Namen gesperrt"
    orga.fill("#g-org", "Lisa")
    assert orga.locator("#go").count() == 1
    assert "Auslosen" in orga.locator(".steps li.cur").inner_text()
    order = orga.evaluate("[...document.querySelectorAll('#gbody section > *')].map(e => e.id || e.tagName).join(',')")
    assert order.endswith("ppl,DETAILS,drawArea"), order


def test_darf_nicht_ziehen_und_entfernen_rueckgaengig(orga):
    setup_group(orga)
    orga.click('.ph [data-ex="Anna"]')
    orga.check('input[data-a="Anna"][data-b="Ben"]')
    orga.click('.hint [data-ex="Anna"]')
    assert "Zieht nicht: Ben" in orga.inner_text("#ppl")
    assert "Zieht nicht: Anna" in orga.inner_text("#ppl"), "gilt in beide Richtungen"
    orga.click('[data-del="Markus"]')
    assert orga.locator("#ppl li").count() == 5
    orga.click("#undo")
    assert orga.locator("#ppl li").count() == 6


def test_auslosen_sperren_verschicken_neu_auslosen(orga, context):
    setup_group(orga)
    orga.fill("#g-org", "Lisa")
    orga.click("#go")
    orga.wait_for_selector("#distBox")
    assert orga.locator("#g-name, [data-del], #addf").count() == 0, "Runde nach dem Auslosen gesperrt"
    assert "Auslosung Nr. 1" in orga.inner_text("#distBox")
    assert "Verschicken" in orga.locator(".steps li.cur").inner_text()

    href = orga.get_attribute('a[data-wa="Anna"]', "href")
    msg = urllib.parse.unquote(href.split("text=")[1])
    assert href.startswith("https://wa.me/?text=")
    assert "Lisa hat die Wichtel-Auslosung für „Familie 2026“ gemacht (Auslosung Nr. 1" in msg
    link = re.search(r"https?://\S+", msg).group(0)
    assert "/orga/" not in link and "?test" not in link, "Gast-Link zeigt auf die Gastseite"

    orga.click('[data-msg="Ben"]')
    assert not orga.is_checked('[data-sent="Ben"]'), "Kopieren setzt verschickt nicht"
    with context.expect_page() as popup:
        orga.click('a[data-wa="Anna"]')
    popup.value.close()
    orga.wait_for_timeout(600)
    assert orga.is_checked('[data-sent="Anna"]'), "WhatsApp-Tipp setzt verschickt"

    orga.click("#redo")
    assert "Nr. 2" in orga.inner_text("#sheet")
    orga.click('[data-do="redo"]')
    orga.wait_for_timeout(300)
    t = orga.inner_text("#distBox")
    assert "Auslosung Nr. 2" in t and "Neu ausgelost" in t and "0 von 6" in t

    orga.click("#edit")
    orga.click('[data-do="edit"]')
    assert orga.locator("#g-name").count() == 1, "Ändern entsperrt"


def test_gast_link_funktioniert(orga, context, base_url):
    setup_group(orga)
    orga.fill("#g-org", "Lisa")
    orga.click("#go")
    href = orga.get_attribute('a[data-wa="Clara"]', "href")
    link = re.search(r"https?://\S+", urllib.parse.unquote(href.split("text=")[1])).group(0)
    assert link.startswith(base_url + "#w-")
    guest = context.new_page()
    guest.goto(link)
    guest.click("#openEnv")
    guest.wait_for_timeout(1500)
    assert "Hallo Clara!" == guest.inner_text("h1")
    assert "Du beschenkst" in guest.inner_text("#after")


def test_geraet_herumreichen_mit_pin(orga):
    setup_group(orga)
    orga.fill("#g-org", "Lisa")
    orga.click("#go")
    orga.click('[data-mode="phone"]')
    orga.click('[data-env="Clara"]')
    orga.fill("#pin", "1234")
    orga.click("#sheet button[type=submit]")
    orga.wait_for_timeout(300)
    assert "Clara, du beschenkst" in orga.inner_text("#sheet")
    orga.click("#sheet [data-close]")
    orga.click('[data-env="Clara"]')
    for _ in range(5):
        orga.fill("#pin", "0000")
        orga.click("#sheet button[type=submit]")
        orga.wait_for_timeout(100)
    assert "gesperrt" in orga.inner_text("#sheet")


def test_daten_bleiben_nach_neuladen(orga):
    setup_group(orga)
    orga.fill("#g-org", "Lisa")
    orga.click("#go")
    orga.wait_for_timeout(800)
    orga.reload()
    orga.wait_for_selector(".gcard")
    assert "Auslosung Nr. 1" in orga.inner_text(".grid")
    orga.click("#newg")
    assert orga.input_value("#g-org") == "Lisa", "Organisator wird für neue Runden übernommen"


def test_keine_querscrollleiste_auf_kleinen_handys(orga):
    orga.set_viewport_size({"width": 360, "height": 780})
    setup_group(orga)
    orga.fill("#g-org", "Lisa")
    orga.click("#go")
    assert orga.evaluate("document.documentElement.scrollWidth") <= 360
