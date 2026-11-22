# Wichtel-Generator 🎁

Auslosung für Wichtel-Runden: Die Spielleitung trägt die Namen ein, lost aus und schickt jeder Person einen persönlichen Link – per WhatsApp oder als kopierte Nachricht. Wer den Link öffnet, sieht nur, wen er oder sie beschenkt. Gäste brauchen kein Konto.

- **Gastseite** (`/`): zeigt nur das eigene Los. Die Daten stecken im Link selbst, die Seite greift nie auf die Datenbank zu.
- **Spielleitung** (`/orga/`): Anmeldung mit Google, mehrere Runden, Auslosung mit Ausnahmen („darf nicht ziehen“), Versand per WhatsApp oder „Gerät herumreichen“ mit PIN. Gespeichert in Firebase Firestore.

## Aufbau

```
site/                 # wird auf GitHub Pages veröffentlicht
  index.html          # Gastseite
  orga/index.html     # Spielleitung
  src/core.js         # Auslosung, Links, Nachrichten (ohne DOM, unit-getestet)
  src/guest.js        # Gastseite
  src/orga.js         # Oberfläche der Spielleitung
  src/store-firebase.js  # Speicher: Firestore + Google-Anmeldung
  src/store-memory.js    # Test-Speicher (nur localhost mit ?test)
  src/config.js       # Firebase-Web-Konfiguration
firestore.rules       # Zugriffsregeln: jede Person nur ihre eigenen Daten
tests/unit/           # Node-Tests für core.js
tests/e2e/            # Browser-Tests (Playwright) mit Test-Speicher
tests/emulator/       # Regeln + echter Speicherweg gegen den Firebase-Emulator
```

## Einrichtung

### 1. Firebase

1. In der [Firebase-Konsole](https://console.firebase.google.com) unter **Build → Authentication → Sign-in method** den Anbieter **Google** aktivieren.
2. Unter **Authentication → Settings → Authorized domains** die Pages-Adresse hinzufügen, z. B. `<github-name>.github.io`.
3. Unter **Build → Firestore Database** eine Datenbank anlegen und unter **Rules** den Inhalt von [`firestore.rules`](firestore.rules) einfügen und veröffentlichen
   (oder mit der Firebase-CLI: `firebase deploy --only firestore:rules --project <projekt-id>`).
4. Unter **Projekteinstellungen → Deine Apps** eine Web-App anlegen. `apiKey` und `appId` **nicht** in den Code schreiben, sondern im GitHub-Repo unter **Settings → Secrets and variables → Actions** als Secrets `FIREBASE_API_KEY` und `FIREBASE_APP_ID` anlegen. Der Veröffentlichungs-Schritt setzt sie in `site/src/config.js` ein.
5. In der [Google-Cloud-Konsole → APIs & Dienste → Anmeldedaten](https://console.cloud.google.com/apis/credentials?project=wichtelapp-30310) den Browser-Schlüssel beschränken:
   - **Anwendungseinschränkungen → Websites:** `https://raphschw.github.io/*` und `https://wichtelapp-30310.firebaseapp.com/*`
   - **API-Einschränkungen:** Identity Toolkit API, Token Service API, Cloud Firestore API

> Der Schlüssel steht im veröffentlichten Browser-Code zwangsläufig drin – so funktioniert jede Firebase-Web-App. Er identifiziert nur das Projekt; geschützt sind die Daten durch die Regeln und die Domain-Beschränkung.

### 2. GitHub Pages

Unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen. Jeder Push auf `main` startet die Tests; nur wenn alle grün sind, wird `site/` veröffentlicht.

## Lokal entwickeln

```bash
npm run serve            # http://localhost:8000/  (Gastseite)  und  /orga/?test  (Spielleitung mit Test-Speicher)
npm run test:unit
pip install pytest playwright requests && python -m playwright install chromium
python -m pytest tests   # Emulator-Tests werden ohne Emulator übersprungen
```

Mit Emulator (benötigt Java und `npm i -g firebase-tools`):

```bash
firebase emulators:exec --project demo-wichteln --only auth,firestore "EMULATOR=1 python -m pytest tests"
```

`/orga/?emulator` auf localhost verbindet die App mit dem Emulator und meldet sich dort anonym an.

## Datenschutz

- Die App zeigt der Spielleitung nicht, wer wen hat. Das Ergebnis wird verschleiert gespeichert – das schützt vor neugierigen Blicken, ist aber keine Verschlüsselung.
- Jeder persönliche Link zeigt das Los genau einer Person. Wer einen fremden Link öffnet, sieht dieses eine Los.
- Nach „Neu auslosen“ zeigen alte Links weiterhin das alte Ergebnis. Deshalb trägt jede Auslosung eine Nummer, die in Nachricht und Gastseite steht.
