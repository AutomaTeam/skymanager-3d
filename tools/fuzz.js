/* Fuzz test navigateur (A07).
   Usage : ouvrir le jeu avec  ?fuzz=1&secs=25  (charge ce module apres le demarrage)
   ou, dans la console : (await import('./tools/fuzz.js')).runFuzz({ secs: 25 }).
   Envoie des touches et des clics au hasard pendant N secondes, rendu neutralise,
   puis renvoie { actions, frames, errors:[...] } a partir de __game.errors. */

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyG', 'KeyH', 'ShiftLeft', 'Enter', 'Escape', 'KeyP', 'KeyM'];
const SKIP = /pauseMode|pauseResetProgress|reinit|reset|effacer|supprimer|recommenc|nouvelle partie|plein ecran|quitter|fullscreen/i;

const visible = (el) => {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && st.pointerEvents !== 'none';
};
const pick = (a) => a[(Math.random() * a.length) | 0];

export async function runFuzz({ secs = 25, log = false } = {}) {
  const g = window.__game;
  if (!g) throw new Error('__game absent');
  const origRender = g.r3d.render;
  g.r3d.render = () => {};                       // rendu logiciel trop lent
  g.errors = {};
  const stats = { actions: 0, clicks: 0, keys: 0 };
  const held = new Set();
  const press = (code, down) => {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  };
  const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) {
    const r = Math.random();
    try {
      if (r < 0.55) {
        const c = pick(KEYS);
        if (held.has(c)) { press(c, false); held.delete(c); } else { press(c, true); held.add(c); }
        stats.keys++;
      } else {
        const btns = [...document.querySelectorAll('button, [role=button], .btn')]
          .filter(b => visible(b) && !b.disabled && !SKIP.test((b.id || '') + ' ' + (b.textContent || '')));
        if (btns.length) { const b = pick(btns); if (log) console.log('clic', b.id || b.textContent.trim().slice(0, 20)); b.click(); stats.clicks++; }
      }
    } catch (e) { g._noteError('fuzz', e); }
    stats.actions++;
    if (Math.random() < 0.1) for (const c of [...held]) { press(c, false); held.delete(c); }
    await new Promise(res => setTimeout(res, 30 + Math.random() * 120));
  }
  for (const c of held) press(c, false);
  g.r3d.render = origRender;
  return { ...stats, errors: g.errorList() };
}

if (/[?&]fuzz(=|&|$)/.test(window.location.search)) {
  const secs = +(new URLSearchParams(window.location.search).get('secs') || 25);
  setTimeout(async () => {
    const btn = document.getElementById('btnFlyNow');
    if (btn) btn.click();
    window.__fuzzReport = await runFuzz({ secs });
    console.log('FUZZ', JSON.stringify(window.__fuzzReport));
}, 500);
}
