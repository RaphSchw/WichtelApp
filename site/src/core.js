// Gemeinsame Logik für Gastseite und Spielleitung. Keine DOM-Zugriffe außer in snowSvg (liefert nur einen String).

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const fmtDate = d => { if (!d) return ''; const [y, m, t] = d.split('-'); return `${t}.${m}.${y}`; };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const today = () => new Date().toLocaleDateString('sv');
export const MAXTRY = 5;

/* Kodierung: XOR + base32 (nur a–z und 2–7, damit der Link sauber im #-Teil steht).
   Das ist Verschleierung gegen neugierige Blicke, keine Verschlüsselung. */
const K = 'wichteln-schneeflocke', A32 = 'abcdefghijklmnopqrstuvwxyz234567';
const xor = b => b.map((v, i) => v ^ K.charCodeAt(i % K.length));
function b32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += A32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += A32[(val << (5 - bits)) & 31];
  return out;
}
function unb32(str) {
  let bits = 0, val = 0; const out = [];
  for (const c of str) { const i = A32.indexOf(c); if (i < 0) throw new Error('bad char'); val = ((val << 5) | i) & 0xffff; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export const pack = obj => b32(xor(new TextEncoder().encode(JSON.stringify(obj))));
export const unpack = s => { try { return JSON.parse(new TextDecoder().decode(xor(unb32(s)))); } catch (e) { return null; } };

/* Runden-Logik */
export const exOf = (g, n) => (g.ex && g.ex[n]) || [];
const blocked = (g, a, b) => a === b || exOf(g, a).includes(b);
function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Lost aus. Ergebnis: {Schenkende: Beschenkte} oder null, wenn die Regeln keine Lösung zulassen. */
export function draw(g, rnd = Math.random) {
  const P = g.people; if (P.length < 3) return null;
  const order = P.slice().sort((a, b) => P.filter(r => !blocked(g, a, r)).length - P.filter(r => !blocked(g, b, r)).length);
  for (let attempt = 0; attempt < 30; attempt++) {
    const map = {}, used = new Set(); let steps = 0;
    const go = i => {
      if (++steps > 20000) return false;
      if (i === order.length) return true;
      const a = order[i];
      for (const r of shuffle(P, rnd)) {
        if (used.has(r) || blocked(g, a, r) || (g.noswap && map[r] === a)) continue;
        map[a] = r; used.add(r);
        if (go(i + 1)) return true;
        delete map[a]; used.delete(r);
      }
      return false;
    };
    if (go(0)) return map;
  }
  return null;
}

export const recipient = (g, p) => { const m = g.res && unpack(g.res); return m ? m[p] : null; };
export const guestPayload = (g, p) => [g.name, p, recipient(g, p), g.budget, g.date, g.round || 1, g.drawnAt || '', g.org || ''];
export const linkFor = (g, p, base) => `${base.replace(/#.*$/, '')}#w-${pack(guestPayload(g, p))}`;
export function messageFor(g, p, base) {
  const who = (g.org || '').trim(), t = g.name ? ` für „${g.name}“` : '';
  let m = `Hallo ${p}! 🎁\n\n${who ? `${who} hat die Wichtel-Auslosung${t} gemacht` : `Die Wichtel-Auslosung${t} ist fertig`} (Auslosung Nr. ${g.round || 1}${g.drawnAt ? ` vom ${fmtDate(g.drawnAt)}` : ''}).`;
  if (g.budget) m += ` Budget: ${g.budget} €.`;
  if (g.date) m += ` Bescherung: ${fmtDate(g.date)}.`;
  return m + `\n\nÜber diesen Link siehst du, wen du beschenkst. Er ist nur für dich, zeigt nur einen Namen und braucht keine Anmeldung:\n${linkFor(g, p, base)}`;
}
export const waLink = (g, p, base) => 'https://wa.me/?text=' + encodeURIComponent(messageFor(g, p, base));

export async function hashPin(g, p, pin) {
  const t = 'wichtel|' + g.id + '|' + p + '|' + pin;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function newGroup(name, org = '') {
  return {id: uid(), name: name || '', org, round: 0, drawnAt: '', budget: '', date: '', people: [], ex: {}, mutual: true, noswap: true,
    res: null, opened: [], pins: {}, tries: {}, sent: [], archived: false, created: Date.now(), updated: Date.now()};
}
export function clearDraw(g) { g.res = null; g.opened = []; g.pins = {}; g.tries = {}; g.sent = []; }

export function snowSvg(n) {
  let f = '';
  for (let i = 0; i < n; i++) {
    const x = (i * 37.3) % 100, r = 1.5 + (i % 3) * 1.2, dur = 7 + (i % 7) * 1.6, del = -((i * 1.37) % dur), y = (i * 53.1) % 100;
    f += `<circle class="flake" cx="${x}%" cy="${y}%" r="${r}" fill="#fff" opacity="${.35 + (i % 4) * .15}" style="animation-duration:${dur}s;animation-delay:${del}s"/>`;
  }
  return `<svg class="snow" aria-hidden="true">${f}</svg>`;
}
