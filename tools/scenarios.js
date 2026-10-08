/* Scenarios navigateur rejouables (C03).
   Usage : ?scenario=firstFlight (ou all) dans l'URL, ou dans la console :
     const S = await import('./tools/scenarios.js'); await S.run('allRides'); await S.runAll();
   Chaque scenario pilote __game image par image (rendu neutralise, rAF remplace) et renvoie
   { name, ok, steps:[...], errors:[...] }. Les erreurs viennent de __game.errors. */

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function ctx() {
  const g = window.__game;
  const realRaf = window.requestAnimationFrame;
  const realRender = g.r3d.render;
  window.requestAnimationFrame = () => 0;
  g.r3d.render = () => {};
  const frames = (n, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) { g.lastFrame = performance.now() - dt * 1000; g.loop(); }
  };
  const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const restore = () => { window.requestAnimationFrame = realRaf; g.r3d.render = realRender; requestAnimationFrame(() => g.loop()); };
  return { g, frames, key, restore, steps: [] };
}

const SCENARIOS = {
  /* Depart express, decollage auto, quelques secondes de vol. */
  async firstFlight({ g, frames, steps }) {
    g.flyNow(); steps.push('flyNow'); frames(30);
    steps.push('state=' + g.state);
    if (g.state === 'HUB' || g.state === 'CABIN') { g.boardAircraft(); frames(30); steps.push('board -> ' + g.state); }
    clearTimeout(g.fun._launchTimer); g.launchNow();     // le compte a rebours reel est en temps reel : on court-circuite
    for (let i = 0; i < 40; i++) frames(30);
    steps.push('launched=' + g.assist.launched + ' onGround=' + g.ac.onGround + ' alt=' + Math.round(g.ac.pos.y));
    return g.state === 'PILOT' && g.assist.launched && !g.ac.onGround;
  },
  /* Les 8 etapes du tutoriel passees par le bouton Passer. */
  async tutorial({ g, frames, steps }) {
    if (g.state === 'BOOT') g.start();
    g.arcade.restartTutorial(); frames(3);
    const sk = document.getElementById('objSkip');
    for (let i = 0; i < 12 && g.arcade.step; i++) { steps.push(g.arcade.step.id); frames(2); sk.click(); frames(2); }
    return g.arcade.data.tutorialDone === true;
  },
  /* Chaque avion de la flotte : on le selectionne, on le prepare au vol, on le fait voler un peu. */
  async allPlanes({ g, frames, steps }) {
    const { PLANE_IDS } = await import('../js/fleet.js');
    if (g.state === 'BOOT') g.start();
    for (const id of PLANE_IDS) {
      g.hangar.data.selected = id; g.setFlightPlane(id);
      g.startArcadeFlight(); frames(60);
      clearTimeout(g.fun._launchTimer); g.launchNow();
      frames(120);
      steps.push(id + ':' + g.state);
    }
    return true;
  },
  /* Chaque monture : monter, rouler 3 s, descendre. */
  async allRides({ g, frames, key, steps }) {
    if (g.state === 'BOOT') g.start();
    if (g.state !== 'HUB') g.goToHub();
    const { RIDE_IDS } = await import('../js/ridePhysics.js');
    for (const id of RIDE_IDS) {
      g.rides.mount(id); frames(5);
      key('ArrowUp'); frames(60); key('ArrowUp', false);
      steps.push(id + ':' + (g.rides.active ? 'actif' : 'inactif'));
      g.rides.dismount(true); frames(5);
    }
    return true;
  },
  /* Chaque vehicule : s'asseoir, rouler, descendre. */
  async allVehicles({ g, frames, key, steps }) {
    if (g.state === 'BOOT') g.start();
    if (g.state !== 'HUB') g.goToHub();
    for (const v of g.vehicles) {
      v.enter(); frames(5);
      if (!v.active) { steps.push(v.cfg.name + ':indisponible (pas de vehicule en place)'); continue; }
      key('ArrowUp'); frames(60); key('ArrowUp', false);
      steps.push(v.cfg.name + ':' + (v.active ? 'actif' : 'inactif'));
      v.exit(); frames(5);
    }
    return true;
  },
  /* Cabine : entrer, marcher, servir, sortir (A05). */
  async cabin({ g, frames, key, steps }) {
    if (g.state === 'BOOT') g.start();
    if (g.state !== 'HUB') g.goToHub();
    g.enterCabin(); frames(10);
    steps.push('state=' + g.state);
    for (let i = 0; i < 6; i++) {
      key('ArrowUp'); frames(45); key('ArrowUp', false);
      const b = document.getElementById('btnServe');
      if (b && !b.classList.contains('hidden')) { b.click(); steps.push('servi'); }
      key('ArrowDown'); frames(30); key('ArrowDown', false);
    }
    g.exitCabinByDoor(); frames(10);
    steps.push('retour=' + g.state);
    return g.state === 'HUB';
  },
  /* Panneaux : chacun s'ouvre, se ferme par Echap, et le monde n'est jamais gele (A06). */
  async panels({ g, frames, key, steps }) {
    if (g.state === 'BOOT') g.start();
    if (g.state !== 'HUB') g.goToHub();
    const opens = {
      pause: () => g.openPause(), album: () => g.openAlbum(), carte: () => g.openMapBig(), tour: () => g.openTycoonPanel(),
      hangar: () => g.hangar.open(), deco: () => g.deco.open(), monture: () => g.rides.openPicker(),
      tableauBord: () => g.hub.open(), look: () => g.look.open()
    };
    let ok = true;
    for (const [n, f] of Object.entries(opens)) {
      try { f(); } catch (e) { g._noteError('panneau ' + n, e); ok = false; }
      frames(5);
      for (let i = 0; i < 4; i++) { key('Escape'); key('Escape', false); frames(2); }
      const frozen = !!g._worldPaused;
      steps.push(n + (frozen ? ':GELE' : ':ok'));
      if (frozen) { ok = false; g._worldPaused = false; }
    }
    return ok;
  },
  /* Le chien : adoption, balle, caresse. */
  async petFetch({ g, frames, steps }) {
    if (g.state === 'BOOT') g.start();
    if (g.state !== 'HUB') g.goToHub();
    if (!g.pet.adopted) g.pet._adopt();
    frames(10);
    g.pet.throwBall(); frames(150);
    steps.push('fetch=' + (g.pet.fetch ? g.pet.fetch.phase : 'fini'));
    g.pet.pet && g.pet.pet(); frames(10);
    return true;
  },
  /* Nuit + pluie + orage, en vol et au sol. */
  async nightRain({ g, frames, steps }) {
    if (g.state === 'BOOT') g.start();
    g.env.setHour(23);
    for (let i = 0; i < 6; i++) { g.env.forceWeather(); frames(60); steps.push('meteo ' + g.env.weatherLabel()); }
    g.env.setHour(6); frames(30);
    return true;
  }
};

export async function run(name) {
  const c = ctx();
  const g = c.g;
  g.errors = {};
  let ok = false;
  try { ok = !!(await SCENARIOS[name](c)); } catch (e) { g._noteError('scenario ' + name, e); }
  const errors = g.errorList();
  c.restore();
  return { name, ok: ok && errors.length === 0, steps: c.steps, errors };
}

export async function runAll() {
  const out = [];
  for (const n of Object.keys(SCENARIOS)) out.push(await run(n));
  return out;
}

const q = new URLSearchParams(window.location.search).get('scenario');
if (q) {
  setTimeout(async () => {
    window.__scenarioReport = q === 'all' ? await runAll() : [await run(q)];
    console.log('SCENARIO', JSON.stringify(window.__scenarioReport));
  }, 500);
}
export const names = Object.keys(SCENARIOS);
