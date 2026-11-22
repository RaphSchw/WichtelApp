import { esc, fmtDate, unpack, snowSvg } from './core.js';

const app = document.getElementById('app');

export function notice() {
  document.body.className = 'red';
  app.innerHTML = `<div class="stage" style="position:relative">${snowSvg(50)}<h1 style="position:relative">Frohe Weihnachten!</h1>
    <p class="sub" style="position:relative">Um dein Wichtel-Los zu sehen, öffne bitte den persönlichen Link aus deiner Nachricht.</p></div>`;
}

export function guestView(token) {
  document.body.className = 'red';
  const o = unpack(token);
  if (!Array.isArray(o) || !o[1] || !o[2]) {
    app.innerHTML = `<div class="stage" style="position:relative">${snowSvg(50)}<h1 style="position:relative">Hoppla!</h1>
      <p class="sub" style="position:relative">Dieser Wichtel-Link ist unvollständig. Bitte öffne den Link noch einmal direkt aus deiner Nachricht.</p></div>`;
    return;
  }
  const [t, g, r, b, d, n, da, org] = o;
  app.innerHTML = `<div class="stage" style="position:relative">${snowSvg(60)}
    <div style="position:relative;display:flex;flex-direction:column;gap:10px;align-items:center">
      <h1>Hallo ${esc(g)}!</h1>
      <p class="sub">${org ? `${esc(org)} hat${t ? ` für „${esc(t)}“` : ''} ausgelost – hier ist dein Los.` : `Dein Wichtel-Los${t ? ` für „${esc(t)}“` : ''} ist da.`}</p>
    </div>
    <div class="envl" id="envl" style="position:relative">
      <div class="e-back"></div>
      <div class="e-letter"><small>Du beschenkst</small><b>${esc(r)}</b></div>
      <div class="e-front"></div><div class="e-flap"></div><span class="e-seal">★</span>
    </div>
    <div id="after" style="position:relative;display:flex;flex-direction:column;gap:14px;align-items:center;width:100%">
      <button class="pri" id="openEnv">Umschlag öffnen</button>
      <p class="note">Schau am besten allein auf den Bildschirm.</p>
    </div>
  </div>`;
  document.getElementById('openEnv').addEventListener('click', () => {
    document.getElementById('envl').classList.add('open');
    const meta = [b ? `<span>Budget <b>${esc(b)} €</b></span>` : '', d ? `<span>Bescherung <b>${esc(fmtDate(d))}</b></span>` : ''].join('');
    document.getElementById('after').innerHTML = `<div class="reveal pop" style="animation-delay:.9s;animation-fill-mode:backwards">
      <p style="margin:0;font-size:18px">Du beschenkst <b>${esc(r)}</b>.</p>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      <p class="hint">Psst – nicht verraten! Über diesen Link kannst du dein Los jederzeit wieder ansehen.</p>
      ${n ? `<p class="hint">Auslosung Nr. ${esc(n)}${da ? ` vom ${esc(fmtDate(da))}` : ''}</p>` : ''}</div>`;
  });
}

function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('w-')) guestView(h.slice(2)); else notice();
}
window.addEventListener('hashchange', route);
route();
