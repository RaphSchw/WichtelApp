// Spielleitung: Runden verwalten, auslosen, verschicken.
// Gespeichert wird über einen Speicher-Adapter: Firebase (echt) oder Test-Speicher (nur ?test auf localhost).
import { esc, fmtDate, snowSvg, pack, unpack, draw, recipient, messageFor, waLink, hashPin, MAXTRY, exOf, newGroup, clearDraw, today } from './core.js';

const $ = id => document.getElementById(id);
const app = $('app');
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const params = new URLSearchParams(location.search);
// Basis-Adresse der Gastseite: eine Ebene über /orga/
const BASE = new URL('../', location.origin + location.pathname).href;

let store = null, USER = null, unsub = null, syncState = 'loading', syncCode = '', firstSnap = false;
let groups = new Map(), view = 'list', modes = {}, openEx = null, lastOrg = '';
const pendingDel = new Set();

/* Speichern: pro Runde ein Dokument, eine Schreiboperation zur Zeit */
const timers = {}, writing = {}, again = {};
const dirty = id => !!timers[id] || !!writing[id];
function touch(g) {
  g.updated = Date.now();
  clearTimeout(timers[g.id]);
  timers[g.id] = setTimeout(() => { delete timers[g.id]; flush(g.id); }, 500);
}
async function flush(id) {
  if (!USER) return;
  if (writing[id]) { again[id] = true; return; }
  writing[id] = true;
  const g = groups.get(id);
  try { if (g) await store.saveGroup(USER.uid, g); setSync('ok'); }
  catch (e) { console.error(e); setSync('err', e && e.code); }
  writing[id] = false;
  if (again[id]) { again[id] = false; flush(id); }
}
async function saveSettings() { if (!USER) return; try { await store.saveSettings(USER.uid, { lastOrg }); } catch (e) { console.error(e); } }

function setSync(s, code = '') {
  if (s === 'ok') syncCode = ''; else if (s === 'err') syncCode = code || syncCode || 'timeout';
  syncState = s; const el = $('sync'); if (el) el.outerHTML = syncHtml(el.dataset.slim === '1');
}
// Verständliche Ursache pro Firestore-Fehlercode
function syncError(code) {
  return ({
    'permission-denied': 'Keine Berechtigung für die Datenbank – sind die Firestore-Regeln veröffentlicht?',
    'not-found': 'Die Firestore-Datenbank gibt es noch nicht – bitte in Firebase anlegen.',
    'failed-precondition': 'Die Firestore-Datenbank ist noch nicht eingerichtet – bitte in Firebase anlegen.',
    'unauthenticated': 'Anmeldung abgelaufen – bitte ab- und wieder anmelden.',
    'resource-exhausted': 'Das kostenlose Tageskontingent der Datenbank ist aufgebraucht – morgen geht es weiter.',
    'unavailable': 'Datenbank nicht erreichbar – Internetverbindung oder Werbeblocker (z. B. Brave Shields) prüfen.',
    'timeout': 'Keine Antwort von der Datenbank – Werbeblocker (z. B. Brave Shields) für diese Seite ausschalten oder Internet prüfen.',
  })[code] || 'Speichern gerade nicht möglich';
}
function syncHtml(slim) {
  const m = { loading: ['', 'Verbinde …'], ok: ['ok', 'Gespeichert – auf all deinen Geräten'], err: ['off', `${syncError(syncCode)} (Fehlercode: ${syncCode})`] }[syncState];
  return `<span class="sync ${m[0]}" id="sync" data-slim="${slim ? 1 : 0}"${slim && syncState !== 'err' ? ' hidden' : ''}><i></i>${m[1]}</span>`;
}

/* Dialog & Toast */
const dlg = $('dlg'), sheet = $('sheet'); let lastFocus = null, onSubmit = null;
function openDlg(html, submit) { lastFocus = document.activeElement; onSubmit = submit || null; sheet.innerHTML = html; dlg.classList.add('on'); const b = sheet.querySelector('input,textarea,button'); b && b.focus(); }
function closeDlg() { dlg.classList.remove('on'); sheet.innerHTML = ''; onSubmit = null; lastFocus && lastFocus.focus && lastFocus.focus(); }
dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) closeDlg(); const a = e.target.closest('[data-do]'); if (a && dlgActions[a.dataset.do]) dlgActions[a.dataset.do](a); });
sheet.addEventListener('submit', e => { e.preventDefault(); onSubmit && onSubmit(e.target); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) closeDlg(); });
const dlgActions = {};
let toastT = null, pendingUndo = null;
function showToast(text, undo) {
  if (pendingUndo) { const u = pendingUndo; pendingUndo = null; clearTimeout(toastT); u.commit(); }
  pendingUndo = undo || null;
  const t = $('toast'); t.hidden = false; t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button id="undo">Rückgängig</button>' : ''}`;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; if (undo && pendingUndo === undo) { pendingUndo = null; undo.commit(); } }, undo ? 6000 : 3000);
  if (undo) $('undo').onclick = () => { clearTimeout(toastT); t.hidden = true; pendingUndo = null; undo.revert(); };
}

/* Kopfband */
function headerHtml(title, sub, extra, slim, who) {
  let lights = ''; const cols = ['#f0b429','#4fd18b','#6ec3ff','#fff4c2','#ff9ad0'];
  for (let i = 0; i < 40; i++) { const x = i * 2.5 + 1.25; lights += `<line x1="${i*2.5}%" y1="4" x2="${x}%" y2="16" stroke="#3a1a10" stroke-width="1.5"/><line x1="${x}%" y1="16" x2="${(i+1)*2.5}%" y2="4" stroke="#3a1a10" stroke-width="1.5"/><ellipse class="bulb" cx="${x}%" cy="22" rx="5" ry="7" fill="${cols[i % 5]}" style="animation-delay:${(i % 5) * .45}s"/>`; }
  const tree = pairs => pairs.map(([x, h]) => `<path d="M${x} ${58-h}l${Math.round(h*.45)} ${h}h-${Math.round(h*.9)}z" fill="#1d6b45"/><path d="M${x} ${58-h}l${Math.round(h*.2)} ${Math.round(h*.45)}h-${Math.round(h*.4)}z" fill="#fff" opacity=".85"/><rect x="${x-3}" y="58" width="6" height="6" fill="#6b3b1f"/>`).join('');
  return `<header class="band red${slim ? ' slim' : ''}">${snowSvg(60)}<svg class="lights" aria-hidden="true">${lights}</svg>
    <svg class="fir l" viewBox="0 0 140 70" aria-hidden="true">${tree([[30,34],[75,24],[112,30]])}</svg><svg class="fir r" viewBox="0 0 140 70" aria-hidden="true">${tree([[28,28],[68,38],[110,24]])}</svg>
    <svg class="trees" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70V52q150-22 300 0t300 0 300 0 300 0V70z" fill="#fdf9f6"/></svg>
    <div class="hin"><div>${extra || ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}${syncHtml(slim)}${who && USER ? `<div class="who">Angemeldet als ${esc(USER.name)} <button id="logout">Abmelden</button></div>` : ''}</div>
    <svg class="gift" viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="110" rx="44" ry="6" fill="rgba(0,0,0,.25)"/><rect x="18" y="50" width="84" height="58" rx="6" fill="#1d6b45"/><rect x="18" y="50" width="84" height="12" fill="rgba(0,0,0,.12)"/><rect x="12" y="38" width="96" height="18" rx="5" fill="#2a8a5b"/><rect x="12" y="38" width="96" height="4" rx="2" fill="rgba(255,255,255,.3)"/><rect x="52" y="38" width="16" height="70" fill="#f2c14e"/><path d="M60 38c-10-22-34-20-30-6 3 9 18 8 30 6zM60 38c10-22 34-20 30-6-3 9-18 8-30 6z" fill="#f2c14e"/><circle cx="60" cy="37" r="6" fill="#e0a92e"/></svg></div></header>`;
}

/* ---------- Übersicht ---------- */
function statusOf(g) {
  if (!g.res) return `<span class="badge draft">Entwurf</span>`;
  const s = g.sent.filter(p => g.people.includes(p)).length;
  return `<span class="badge">Auslosung Nr. ${g.round || 1} · ${s} von ${g.people.length} verschickt</span>`;
}
function gcard(g) {
  return `<article class="gcard"><h3>${esc(g.name || 'Unbenannte Runde')}</h3>${statusOf(g)}
    <div class="facts"><span><b>${g.people.length}</b> Personen</span>${g.date ? `<span>am <b>${esc(fmtDate(g.date))}</b></span>` : ''}${g.budget ? `<span>Budget <b>${esc(g.budget)} €</b></span>` : ''}</div>
    <div class="acts"><button class="pri" data-open="${g.id}">Öffnen</button><button class="ghost ib" data-dup="${g.id}">Duplizieren</button><button class="ghost ib" data-arch="${g.id}">${g.archived ? 'Zurückholen' : 'Archivieren'}</button><button class="ghost ib" data-delg="${g.id}" aria-label="Löschen">Löschen</button></div></article>`;
}
function renderList() {
  view = 'list'; document.body.className = '';
  const all = [...groups.values()].filter(g => !pendingDel.has(g.id)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const act = all.filter(g => !g.archived), arc = all.filter(g => g.archived);
  app.innerHTML = headerHtml('Meine Wichtel-Runden', 'Alle deine Runden an einem Ort – Familie, Büro, Freundeskreis.', '', false, true) + `<main>
    <section class="box"><div class="top"><h2>Runden</h2><button class="pri" id="newg">+ Neue Runde</button></div>
      ${!firstSnap && syncState === 'loading' ? '<p class="hint">Deine Runden werden geladen …</p>' : ''}
      ${act.length ? `<div class="grid">${act.map(gcard).join('')}</div>` : `<div class="empty">Noch keine Runde. Leg mit „Neue Runde“ los – zum Beispiel für die Familie oder das Büro.</div>`}
      ${arc.length ? `<details class="more"><summary>Archiv (${arc.length})</summary><div class="grid" style="margin-top:12px">${arc.map(gcard).join('')}</div></details>` : ''}

    </section></main>`;
}

/* ---------- Eine Runde ---------- */
const sentCount = g => g.sent.filter(p => g.people.includes(p)).length;
function stepOf(g) { if (g.res) return sentCount(g) >= g.people.length ? 4 : 3; return g.people.length >= 3 ? 2 : 1; }
function stepsHtml(g) {
  const s = stepOf(g), names = ['Namen eintragen', 'Auslosen', 'Verschicken'];
  return `<ol class="steps" aria-label="Fortschritt">${names.map((n, i) => { const k = i + 1, st = k < s ? 'done' : k === s ? 'cur' : ''; return `<li class="${st}"${k === s ? ' aria-current="step"' : ''}><i aria-hidden="true">${k < s ? '✓' : k}</i><span>${n}</span></li>`; }).join('')}</ol>`;
}
function renderSteps(g) { const el = $('steps'); if (el) el.innerHTML = stepsHtml(g); }
function renderGroup(id) {
  const g = groups.get(id); if (!g) return renderList();
  view = id; document.body.className = '';
  app.innerHTML = headerHtml(esc(g.name || 'Unbenannte Runde'), '', `<button class="link" id="back" style="color:#fff">← Alle Runden</button>`, true)
    + `<main class="narrow"><div id="steps"></div><div id="gbody" class="gbody"></div></main>`;
  renderGroupBody(g);
}
function renderGroupBody(g) {
  renderSteps(g);
  const B = $('gbody'); if (!B) return;
  if (!g.res) {
    B.innerHTML = `<section class="box" aria-labelledby="h-setup"><h2 id="h-setup">Wer macht mit?</h2>
      <div class="row"><label class="f">Name der Runde<input type="text" id="g-name" value="${esc(g.name)}" placeholder="z. B. Familie 2026"></label>
        <label class="f">Organisiert von<input type="text" id="g-org" value="${esc(g.org)}" placeholder="Dein Name" autocomplete="given-name"></label></div>
      <div class="row"><label class="f">Budget (€)<input type="number" id="g-budget" min="0" step="1" inputmode="numeric" placeholder="25" value="${esc(g.budget)}"></label>
        <label class="f">Bescherung am<input type="date" id="g-date" value="${esc(g.date)}"></label></div>
      <h3>Teilnehmende</h3>
      <form class="add" id="addf"><input type="text" id="name" placeholder="Name eingeben" autocomplete="off" aria-label="Name"><button class="pri" type="submit">Hinzufügen</button></form>
      <p class="hint">Mehrere Namen auf einmal mit Komma trennen. Dich selbst auch eintragen, wenn du mitmachst.</p>
      <ul class="ppl" id="ppl"></ul>
      <details class="more"><summary>Weitere Optionen</summary><div class="opts" style="margin-top:8px">
        <label><input type="checkbox" id="g-mutual" ${g.mutual ? 'checked' : ''}> „Darf nicht ziehen“ gilt in beide Richtungen (praktisch für Paare)</label>
        <label><input type="checkbox" id="g-noswap" ${g.noswap ? 'checked' : ''}> Keine Tauschpaare (A beschenkt B und B beschenkt A)</label></div></details>
      <div id="drawArea" class="drawzone"></div></section>`;
    renderPeople(g); renderDrawBtn(g);
  } else {
    B.innerHTML = `<section class="box" id="distBox" aria-labelledby="h-dist"></section>${lockedHtml(g)}`;
    renderDist(g);
  }
}
function renderPeople(g) {
  const P = g.people, el = $('ppl'); if (!el) return;
  el.innerHTML = P.map(p => {
    const ex = exOf(g, p), open = openEx === p, others = P.filter(o => o !== p);
    return `<li><div class="ph"><strong>${esc(p)}</strong>
      <button class="ib ghost" data-ex="${esc(p)}" aria-expanded="${open}">Darf nicht ziehen …</button>
      <button class="ib rm" data-del="${esc(p)}" aria-label="${esc(p)} entfernen" title="Entfernen">✕</button></div>
      ${ex.length && !open ? `<p class="exs">Zieht nicht: ${ex.map(esc).join(', ')}</p>` : ''}
      ${open ? `<fieldset class="chips"><legend>${esc(p)} darf nicht ziehen:</legend>${others.map(o => `<label class="chip"><input type="checkbox" data-a="${esc(p)}" data-b="${esc(o)}" ${ex.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('') || '<span class="hint">Noch keine anderen Namen.</span>'}</fieldset>
        <p class="hint">${g.mutual ? 'Gilt in beide Richtungen.' : 'Gilt nur in diese Richtung.'} <button class="link" data-ex="${esc(p)}">Fertig</button></p>` : ''}</li>`;
  }).join('');
}
function renderDrawBtn(g) {
  const A = $('drawArea'); if (!A) return;
  const n = g.people.length;
  if (n < 3) { A.innerHTML = `<p class="hint">Noch ${3 - n} ${3 - n > 1 ? 'Personen' : 'Person'} – ab drei Personen kann gelost werden.</p>`; return; }
  if (!(g.org || '').trim()) { A.innerHTML = `<button class="pri big" disabled>Jetzt auslosen</button><p class="hint">Trag oben bei „Organisiert von“ deinen Namen ein. Er steht in jeder Nachricht, damit alle wissen, von wem der Link kommt.</p>`; return; }
  A.innerHTML = `<button class="pri big" id="go">Jetzt auslosen</button><p class="hint">${n} Personen sind dabei. Nach dem Auslosen ist die Runde gesperrt, damit das Ergebnis gültig bleibt.</p><p class="msg err" id="drawerr" hidden></p>`;
}
function exPairs(g) {
  const out = [], seen = new Set();
  for (const a of g.people) for (const b of exOf(g, a)) {
    if (seen.has(a + '\u0000' + b)) continue;
    if (exOf(g, b).includes(a)) { seen.add(b + '\u0000' + a); out.push(`${esc(a)} ↔ ${esc(b)}`); }
    else out.push(`${esc(a)} zieht nicht ${esc(b)}`);
  }
  return out;
}
function lockedHtml(g) {
  const pairs = exPairs(g);
  return `<section class="box" aria-labelledby="h-lock"><div class="top"><h2 id="h-lock">Die Runde</h2><button class="ghost" id="edit">Ändern</button></div>
    <div class="facts">${g.org ? `<span>Organisiert von <b>${esc(g.org)}</b></span>` : ''}${g.budget ? `<span>Budget <b>${esc(g.budget)} €</b></span>` : ''}${g.date ? `<span>Bescherung <b>${esc(fmtDate(g.date))}</b></span>` : ''}</div>
    <p class="names">${g.people.map(p => `<span>${esc(p)}</span>`).join('')}</p>
    ${pairs.length ? `<p class="hint">Darf nicht ziehen: ${pairs.join(' · ')}</p>` : ''}
    <p class="hint">🔒 Gesperrt, weil schon ausgelost wurde. „Ändern“ löscht die Auslosung.</p></section>`;
}
function renderDist(g) {
  const B = $('distBox'); if (!B) return;
  const P = g.people, n = P.length, mode = modes[g.id] || 'links', s = sentCount(g), round = g.round || 1;
  let body;
  if (mode === 'links') {
    body = `<p class="hint">Tipp auf „Per WhatsApp senden“: WhatsApp öffnet sich mit der fertigen Nachricht – du wählst nur noch die Person aus. <b>${s} von ${n} verschickt.</b></p>
      <ul class="dist">${P.map(p => { const d = g.sent.includes(p); return `<li class="${d ? 'done' : ''}"><strong>${esc(p)}</strong>
        <label class="sent"><input type="checkbox" data-sent="${esc(p)}" ${d ? 'checked' : ''}> verschickt</label>
        <span class="acts"><a class="wa" href="${esc(waLink(g, p, BASE))}" target="_blank" rel="noopener" data-wa="${esc(p)}">Per WhatsApp senden</a>
        <button class="cp ghost" data-msg="${esc(p)}">Kopieren</button></span></li>`; }).join('')}</ul>
      <p class="hint">„Kopieren“ ist für E-Mail, SMS oder andere Apps – den Haken bei „verschickt“ setzt du dann selbst.</p>
      <p class="hint">Die App zeigt dir nicht, wer wen hat. Öffne die Links aber nicht selbst – jeder Link zeigt das Los der jeweiligen Person.</p>`;
  } else {
    body = `<p class="hint">Gerät herumreichen: Jede Person tippt auf ihren Umschlag und legt beim ersten Öffnen eine 4-stellige PIN fest. Nur mit dieser PIN lässt er sich später noch einmal öffnen. <b>${g.opened.length} von ${n} geöffnet.</b></p>
      <div class="env">${P.map(p => { const o = g.opened.includes(p), l = (g.tries[p] || 0) >= MAXTRY; return `<button class="card${o ? ' open' : ''}" data-env="${esc(p)}"><small>${l ? 'gesperrt' : o ? 'geöffnet · mit PIN' : 'Umschlag für'}</small><span>${esc(p)}</span></button>`; }).join('')}</div>`;
  }
  B.innerHTML = `<h2 id="h-dist">Verschicken</h2>
    <p class="msg ok">Auslosung Nr. ${round}${g.drawnAt ? ` vom ${esc(fmtDate(g.drawnAt))}` : ''} ist fertig.</p>
    ${round > 1 && mode === 'links' && s < n ? `<p class="msg warn">Neu ausgelost: Schick allen den neuen Link. Alte Links zeigen noch eine frühere Auslosung – die aktuelle erkennt man an der Nr. ${round}.</p>` : ''}
    <div class="seg" role="group" aria-label="Art der Verteilung"><button data-mode="links" aria-pressed="${mode === 'links'}">Per Nachricht</button><button data-mode="phone" aria-pressed="${mode === 'phone'}">Gerät herumreichen</button></div>
    ${body}<div><button class="ghost" id="redo">Neu auslosen</button></div>`;
}
function rerender() { if (view === 'list') renderList(); else { const g = groups.get(view); g ? renderGroupBody(g) : renderList(); } }
function doDraw(g) {
  const m = draw(g);
  if (!m) return false;
  clearDraw(g); g.res = pack(m); g.round = (g.round || 0) + 1; g.drawnAt = today(); touch(g);
  return true;
}

/* Umschlag (Gerät herumreichen) */
function revealDlg(g, p) {
  const r = recipient(g, p);
  openDlg(`<p class="hint" id="dlgt">${esc(g.name || 'Wichteln')} · Auslosung Nr. ${g.round || 1}</p><p style="margin:0;font-size:18px">${esc(p)}, du beschenkst</p><div class="big pop">${esc(r)}</div>
    <div class="meta">${g.budget ? `<span>Budget <b>${esc(g.budget)} €</b></span>` : ''}${g.date ? `<span>Bescherung <b>${esc(fmtDate(g.date))}</b></span>` : ''}</div>
    <p class="hint">Merk es dir gut – und verrate nichts!</p><button class="pri" data-close>Verstecken &amp; weitergeben</button>`);
}
function pinDlg(g, p) {
  if ((g.tries[p] || 0) >= MAXTRY) return openDlg(`<h2 id="dlgt">Umschlag gesperrt</h2><p class="hint">Zu viele falsche PINs. Wenn das ein Versehen war, muss neu ausgelost werden.</p><button class="pri" data-close>OK</button>`);
  const set = !g.pins[p];
  openDlg(`<form><h2 id="dlgt">${set ? `Bist du ${esc(p)}?` : `Hallo ${esc(p)}!`}</h2>
    <p class="hint">${set ? 'Nur öffnen, wenn niemand sonst auf den Bildschirm schaut. Lege eine geheime 4-stellige PIN fest – damit kannst nur du deinen Umschlag später wieder öffnen.' : 'Gib deine PIN ein, um dein Los noch einmal zu sehen.'}</p>
    <input type="password" class="pin" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="PIN" placeholder="••••">
    <p class="msg err" hidden></p><button class="pri" type="submit">${set ? 'PIN festlegen &amp; öffnen' : 'Öffnen'}</button><button class="ghost" type="button" data-close>Abbrechen</button></form>`,
  async f => {
    const pin = f.querySelector('#pin').value, er = f.querySelector('.msg.err');
    if (!/^\d{4}$/.test(pin)) { er.hidden = false; er.textContent = 'Bitte genau 4 Ziffern eingeben.'; return; }
    const h = await hashPin(g, p, pin);
    if (set) { g.pins[p] = h; if (!g.opened.includes(p)) g.opened.push(p); touch(g); renderDist(g); return revealDlg(g, p); }
    if (g.pins[p] === h) { g.tries[p] = 0; touch(g); return revealDlg(g, p); }
    g.tries[p] = (g.tries[p] || 0) + 1; touch(g); renderDist(g);
    const left = MAXTRY - g.tries[p];
    if (left <= 0) return pinDlg(g, p);
    er.hidden = false; er.textContent = `Falsche PIN. Noch ${left} Versuch${left > 1 ? 'e' : ''}.`; f.querySelector('#pin').value = ''; f.querySelector('#pin').focus();
  });
}
async function copyText(btn, txt, title) {
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(txt); btn.textContent = 'Kopiert ✓'; setTimeout(() => { btn.textContent = old; }, 1600); }
  catch(e) { openDlg(`<h2 id="dlgt">${esc(title)}</h2><textarea readonly>${esc(txt)}</textarea><p class="hint">Text markieren und kopieren.</p><button class="pri" data-close>Fertig</button>`); sheet.querySelector('textarea').select(); }
}
function markSent(g, p) { if (!g.sent.includes(p)) { g.sent.push(p); touch(g); } }

/* Ereignisse */
app.addEventListener('click', async e => {
  const wa = e.target.closest('a[data-wa]');
  if (wa) { const g = groups.get(view); if (g) { markSent(g, wa.dataset.wa); setTimeout(() => { if (view === g.id) { renderDist(g); renderSteps(g); } }, 400); } return; }
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, g = groups.get(view);
  if (t.id === 'logout') { store.signOut(); return; }
  if (t.id === 'newg') { const n = newGroup('', lastOrg); groups.set(n.id, n); touch(n); renderGroup(n.id); $('g-name').focus(); return; }
  if (d.open) { openEx = null; renderGroup(d.open); scrollTo(0, 0); return; }
  if (t.id === 'back') { renderList(); scrollTo(0, 0); return; }
  if (d.dup) { const s = groups.get(d.dup), n = newGroup((s.name || 'Runde') + ' (Kopie)', lastOrg); Object.assign(n, {org: s.org || n.org, budget: s.budget, date: s.date, people: s.people.slice(), ex: JSON.parse(JSON.stringify(s.ex)), mutual: s.mutual, noswap: s.noswap}); groups.set(n.id, n); touch(n); renderList(); showToast('Runde dupliziert – ohne Auslosung.'); return; }
  if (d.arch) { const s = groups.get(d.arch); s.archived = !s.archived; touch(s); renderList(); return; }
  if (d.delg) {
    const id = d.delg, s = groups.get(id);
    pendingDel.add(id); renderList();
    showToast(`„${s.name || 'Unbenannte Runde'}“ gelöscht.`, {
      revert: () => { pendingDel.delete(id); if (view === 'list') renderList(); },
      commit: async () => { groups.delete(id); try { await store.deleteGroup(USER.uid, id); } catch(err) { setSync('err', err && err.code); } pendingDel.delete(id); }
    });
    return;
  }
  if (!g) return;
  if (d.del && !g.res) {
    const p = d.del, before = {people: g.people.slice(), ex: JSON.parse(JSON.stringify(g.ex))};
    g.people = g.people.filter(x => x !== p); delete g.ex[p]; for (const k in g.ex) g.ex[k] = g.ex[k].filter(x => x !== p);
    if (openEx === p) openEx = null;
    touch(g); renderPeople(g); renderDrawBtn(g); renderSteps(g);
    showToast(`${p} entfernt.`, {revert: () => { if (g.res) return; g.people = before.people; g.ex = before.ex; touch(g); if (view === g.id) { renderPeople(g); renderDrawBtn(g); renderSteps(g); } }, commit: () => {}});
    return;
  }
  if (d.ex && !g.res) { openEx = openEx === d.ex ? null : d.ex; renderPeople(g); const b = document.querySelector(`.ph [data-ex="${CSS.escape(d.ex)}"]`); b && b.focus(); return; }
  if (t.id === 'go') {
    if (!doDraw(g)) { const er = $('drawerr'); er.hidden = false; er.textContent = 'Mit diesen Regeln ist keine gültige Auslosung möglich. Entferne ein paar „Darf nicht ziehen“-Haken oder schalte unter „Weitere Optionen“ die Tauschpaare frei.'; return; }
    openEx = null; renderGroupBody(g); $('steps').scrollIntoView({block: 'start'}); return;
  }
  if (d.mode) { modes[g.id] = d.mode; renderDist(g); return; }
  if (d.env) return pinDlg(g, d.env);
  if (d.msg) { await copyText(t, messageFor(g, d.msg, BASE), `Nachricht für ${d.msg}`); return; }
  if (t.id === 'redo') {
    const next = (g.round || 1) + 1;
    dlgActions.redo = () => {
      closeDlg();
      const keep = {res: g.res, opened: g.opened, pins: g.pins, tries: g.tries, sent: g.sent, round: g.round, drawnAt: g.drawnAt};
      if (!doDraw(g)) { Object.assign(g, keep); return openDlg(`<h2 id="dlgt">Nicht möglich</h2><p class="hint">Mit diesen Regeln klappt keine neue Auslosung. Die bisherige bleibt gültig.</p><button class="pri" data-close>OK</button>`); }
      renderGroupBody(g); showToast(`Neu ausgelost – jetzt gilt Nr. ${g.round}.`);
    };
    openDlg(`<h2 id="dlgt">Neu auslosen?</h2><p class="hint">Danach gilt Auslosung Nr. ${next}. Alle müssen den neuen Link bekommen – alte Links zeigen weiter das alte Ergebnis.</p><button class="pri" data-do="redo">Ja, neu auslosen</button><button class="ghost" data-close>Abbrechen</button>`);
    return;
  }
  if (t.id === 'edit') {
    dlgActions.edit = () => { clearDraw(g); touch(g); closeDlg(); renderGroupBody(g); };
    openDlg(`<h2 id="dlgt">Runde ändern?</h2><p class="hint">Dafür wird Auslosung Nr. ${g.round || 1} gelöscht. Danach losst du neu aus und schickst allen den neuen Link – alte Links zeigen sonst ein veraltetes Ergebnis.</p><button class="pri" data-do="edit">Auslosung löschen &amp; ändern</button><button class="ghost" data-close>Abbrechen</button>`);
  }
});
app.addEventListener('submit', e => {
  if (e.target.id !== 'addf') return;
  e.preventDefault(); const g = groups.get(view), i = $('name'); if (!g || g.res || !i.value.trim()) return;
  const names = i.value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  for (const n of names) if (!g.people.some(p => p.toLowerCase() === n.toLowerCase())) g.people.push(n);
  touch(g); i.value = ''; renderPeople(g); renderDrawBtn(g); renderSteps(g); i.focus();
});
app.addEventListener('input', e => {
  const t = e.target, g = groups.get(view);
  if (!g || g.res) return;
  if (t.id === 'g-name') { g.name = t.value; const h = document.querySelector('header h1'); if (h) h.textContent = t.value || 'Unbenannte Runde'; touch(g); }
  if (t.id === 'g-org') { g.org = t.value; lastOrg = t.value.trim() || lastOrg; touch(g); renderDrawBtn(g); clearTimeout(timers._s); timers._s = setTimeout(() => { delete timers._s; saveSettings(); }, 600); }
  if (t.id === 'g-budget') { g.budget = t.value; touch(g); }
  if (t.id === 'g-date') { g.date = t.value; touch(g); }
});
app.addEventListener('change', e => {
  const t = e.target, g = groups.get(view); if (!g) return;
  if (t.dataset.sent) { const p = t.dataset.sent; g.sent = g.sent.filter(x => x !== p); if (t.checked) g.sent.push(p); touch(g); renderDist(g); renderSteps(g); return; }
  if (g.res) return;
  if (t.id === 'g-mutual') { g.mutual = t.checked; touch(g); }
  if (t.id === 'g-noswap') { g.noswap = t.checked; touch(g); }
  if (t.dataset.a) {
    const a = t.dataset.a, b = t.dataset.b, on = t.checked;
    const set = (x, y) => { const l = exOf(g, x).filter(z => z !== y); if (on) l.push(y); g.ex[x] = l; };
    set(a, b); if (g.mutual) set(b, a);
    touch(g); renderPeople(g);
    const q = document.querySelector(`input[data-a="${CSS.escape(a)}"][data-b="${CSS.escape(b)}"]`); q && q.focus();
  }
});


/* Synchronisierung */
function applySnapshot(docs, meta) {
  const remote = new Map(docs.map(d => [d.id, d.data]));
  let changed = false;
  if (!meta.fromCache && !firstSnap) {
    firstSnap = true;
    for (const id of [...groups.keys()]) if (!remote.has(id) && !dirty(id)) { groups.delete(id); changed = true; }
  }
  for (const [id, r] of remote) {
    if (!r || dirty(id) || pendingDel.has(id)) continue;
    const l = groups.get(id);
    if (!l || (r.updated || 0) > (l.updated || 0)) { groups.set(id, JSON.parse(JSON.stringify(r))); changed = true; }
  }
  for (const id of meta.removed || []) if (!dirty(id) && groups.delete(id)) changed = true;
  if (!meta.fromCache) setSync('ok');
  if (changed || view === 'list') { const a = document.activeElement; if (!(a && /INPUT|TEXTAREA/.test(a.tagName) && app.contains(a))) rerender(); }
}

// Verständliche Meldung pro Firebase-Fehlercode; der Code steht dabei, damit man ihn nachschlagen kann.
function loginError(code) {
  const m = {
    'auth/popup-blocked': 'Das Anmeldefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben und noch einmal tippen.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen. Tipp noch einmal auf den Knopf.',
    'auth/cancelled-popup-request': 'Anmeldung abgebrochen. Tipp noch einmal auf den Knopf.',
    'auth/network-request-failed': 'Keine Verbindung. Bitte Internetverbindung prüfen und noch einmal versuchen.',
    'auth/configuration-not-found': 'Die Anmeldung ist im Firebase-Projekt noch nicht eingerichtet (Authentication → „Jetzt starten“, dann Google aktivieren).',
    'auth/operation-not-allowed': 'Die Google-Anmeldung ist im Firebase-Projekt noch nicht aktiviert (Authentication → Anmeldemethode → Google).',
    'auth/unauthorized-domain': `Diese Adresse (${location.hostname}) ist im Firebase-Projekt nicht freigegeben (Authentication → Einstellungen → Autorisierte Domains).`,
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Der Firebase-Schlüssel ist ungültig oder für diese Adresse gesperrt.',
    'auth/requests-from-referer-<empty>-are-blocked.': 'Der Firebase-Schlüssel ist für diese Adresse gesperrt.',
  }[code];
  return (m || 'Anmeldung hat nicht geklappt. Bitte versuch es noch einmal.') + (code ? ` (Fehlercode: ${code})` : '');
}

function renderLogin(error) {
  document.body.className = '';
  app.innerHTML = headerHtml('Wichtel-Generator', 'Für die Spielleitung: Runden anlegen, auslosen und die Links verschicken.') + `<main>
    <section class="box login"><h2>Anmelden</h2>
      <p>Melde dich an, damit deine Wichtel-Runden sicher gespeichert sind – auf all deinen Geräten.</p>
      <button class="pri" id="login">${store.kind === 'firebase' ? 'Mit Google anmelden' : 'Test-Anmeldung'}</button>
      ${error ? `<p class="msg err">${esc(error)}</p>` : ''}
      <p class="hint">Deine Gäste brauchen kein Konto – sie bekommen einfach ihren persönlichen Link.</p></section></main>`;
  const s = $('sync'); if (s) s.hidden = true;
  $('login').addEventListener('click', async () => {
    try { await store.signIn(); }
    catch (e) {
      console.error(e);
      renderLogin(loginError(e && e.code || ''));
    }
  });
}

function onUser(u) {
  if (unsub) { unsub(); unsub = null; }
  USER = u; groups = new Map(); firstSnap = false; view = 'list';
  if (!u) return renderLogin();
  syncState = 'loading'; renderList();
  store.loadSettings(u.uid).then(s => { if (s && s.lastOrg) lastOrg = s.lastOrg; }).catch(() => {});
  const timer = setTimeout(() => { if (!firstSnap) setSync('err', 'timeout'); }, 10000);
  unsub = store.subscribeGroups(u.uid, (docs, meta) => { if (!meta.fromCache) clearTimeout(timer); applySnapshot(docs, meta); },
    err => { console.error(err); clearTimeout(timer); setSync('err', err && err.code); });
}

async function start() {
  try {
    if (local && params.has('test')) store = (await import('./store-memory.js')).createMemoryStore();
    else store = await (await import('./store-firebase.js')).createFirebaseStore({ emulator: local && params.has('emulator') });
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="stage"><h1 style="color:var(--red)">Keine Verbindung</h1><p class="sub" style="color:var(--ink)">Die App konnte nicht geladen werden. Bitte prüfe deine Internetverbindung und lade die Seite neu.</p></div>`;
    return;
  }
  store.onAuth(onUser);
}
start();
