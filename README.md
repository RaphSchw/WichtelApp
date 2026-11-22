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
4. Unter **Projekteinstellungen → Deine Apps** eine Web-App anlegen und die Werte von `firebaseConfig` in [`site/src/config.js`](site/src/config.js) eintragen. Diese Werte sind öffentlich; geschützt werden die Daten durch die Regeln.

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
