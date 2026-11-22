import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, draw, messageFor, linkFor, newGroup, recipient, waLink, fmtDate } from '../../site/src/core.js';

const group = (people, ex = {}, opts = {}) => ({ ...newGroup('Familie 2026', 'Lisa'), people, ex, ...opts });

test('pack/unpack: Umlaute und Emoji bleiben erhalten', () => {
  const v = ['Jürgen', 'Ömer', 'Straße 🎄', 25, '2026-12-24'];
  assert.deepEqual(unpack(pack(v)), v);
});

test('pack: nur Zeichen, die sicher im #-Teil eines Links stehen', () => {
  assert.match(pack({ m: { 'Ä': 'ß', a: 'b' } }), /^[a-z2-7]+$/);
});

test('unpack: kaputte Eingaben ergeben null statt einem Fehler', () => {
  for (const bad of ['', 'abc', 'ÄÖÜ', '!!!', 'aaaaaaaaaaaaaaaa']) assert.equal(unpack(bad), null);
});

test('draw: gültige Zuordnung – jede Person schenkt und wird beschenkt, niemand sich selbst', () => {
  const P = ['Anna', 'Ben', 'Clara', 'David', 'Gisela', 'Markus'];
  for (let i = 0; i < 300; i++) {
    const m = draw(group(P));
    assert.deepEqual(Object.keys(m).sort(), [...P].sort());
    assert.deepEqual(Object.values(m).sort(), [...P].sort());
    for (const p of P) assert.notEqual(m[p], p);
  }
});

test('draw: Ausnahmen und Tauschpaar-Regel werden eingehalten', () => {
  const P = ['Anna', 'Ben', 'Clara', 'David', 'Gisela'];
  const ex = { Anna: ['Ben'], Ben: ['Anna'], Clara: ['David'] };
  for (let i = 0; i < 300; i++) {
    const m = draw(group(P, ex, { noswap: true }));
    assert.notEqual(m.Anna, 'Ben'); assert.notEqual(m.Ben, 'Anna'); assert.notEqual(m.Clara, 'David');
    for (const p of P) assert.notEqual(m[m[p]], p, `Tauschpaar ${p} ↔ ${m[p]}`);
  }
});

test('draw: unmögliche Regeln ergeben null', () => {
  const P = ['Anna', 'Ben', 'Clara'];
  assert.equal(draw(group(P, { Anna: ['Ben', 'Clara'] })), null);
  assert.equal(draw(group(['Anna', 'Ben'])), null, 'weniger als drei Personen');
});

test('draw: drei Personen mit Tauschpaar-Verbot ergeben einen Kreis', () => {
  const m = draw(group(['A', 'B', 'C'], {}, { noswap: true }));
  assert.equal(m[m[m.A]], 'A');
});

test('Nachricht: nennt Organisatorin, Nr., Budget, Datum und enthält einen gültigen Link', () => {
  const g = group(['Anna', 'Ben', 'Clara']);
  Object.assign(g, { budget: '25', date: '2026-12-24', round: 2, drawnAt: '2026-11-22', res: pack({ Anna: 'Ben', Ben: 'Clara', Clara: 'Anna' }) });
  const base = 'https://example.github.io/wichteln/';
  const msg = messageFor(g, 'Anna', base);
  assert.match(msg, /^Hallo Anna!/);
  assert.match(msg, /Lisa hat die Wichtel-Auslosung für „Familie 2026“ gemacht \(Auslosung Nr\. 2 vom 22\.11\.2026\)/);
  assert.match(msg, /Budget: 25 €\. Bescherung: 24\.12\.2026\./);
  const link = linkFor(g, 'Anna', base);
  assert.ok(msg.endsWith(link));
  assert.ok(link.startsWith(base + '#w-'));
  assert.deepEqual(unpack(link.split('#w-')[1]), ['Familie 2026', 'Anna', 'Ben', '25', '2026-12-24', 2, '2026-11-22', 'Lisa']);
  assert.equal(recipient(g, 'Clara'), 'Anna');
  assert.ok(waLink(g, 'Anna', base).startsWith('https://wa.me/?text=Hallo%20Anna!'));
});

test('Nachricht ohne Organisatorin und ohne Datum bleibt lesbar', () => {
  const g = { ...group(['A', 'B', 'C']), org: '', res: pack({ A: 'B', B: 'C', C: 'A' }) };
  const msg = messageFor(g, 'A', 'https://x.test/');
  assert.match(msg, /Die Wichtel-Auslosung für „Familie 2026“ ist fertig \(Auslosung Nr\. 1\)\./);
  assert.equal(fmtDate(''), '');
});
