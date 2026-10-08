/* ============================================================
   arcadeMap.js — Carte du monde (mini-carte, grande carte, themes)
   (decoupe de arcade.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { sfx } from './sfx.js?v=1791469216';
import { LAYOUT } from './layout.js?v=1791469216';
import { drawIcon } from './icons.js?v=1791469216';
import { PARK, buildPark } from './rideCourse.js?v=1791469216';
import { MAP_WIN, placeList, MAP_FULL, roundRectPath, seeded, drawPlane, clamp, TREASURE_RADAR, $, BIG_CANVAS, MAP_THEMES, COIN } from './arcadeData.js?v=1791469216';

export const mapMethods = {
  _mapToPx(x, z, w, h) {
    const M = MAP_WIN;
    return [(x - M.x0) / (M.x1 - M.x0) * w, (z - M.z0) / (M.z1 - M.z0) * h];
  },
  /* Nom du lieu ou se trouve un point monde. */
  placeAt(x, z) {
    for (const p of placeList()) {
      const r = p.rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return p;
    }
    return { name: 'Aeroport', ico: '🌍' };
  },
  /* Fond fixe (decor), dessine une seule fois par taille et par theme. */
  _mapBase(w, h, win = MAP_WIN, big = w > 700) {
    const key = `${w}x${h}:${this.data.mapTheme}:${win === MAP_FULL ? 'f' : 'c'}`;
    this._bases = this._bases || {};
    if (this._bases[key]) return this._bases[key];
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const x = base.getContext('2d');
    const T = this.theme, M = win, L = LAYOUT, k = w / 480;
    const area = (M.x1 - M.x0) * (M.z1 - M.z0) / ((MAP_WIN.x1 - MAP_WIN.x0) * (MAP_WIN.z1 - MAP_WIN.z0));
    const X = (wx) => (wx - M.x0) / (M.x1 - M.x0) * w;
    const Z = (wz) => (wz - M.z0) / (M.z1 - M.z0) * h;
    const rect = (x0, z0, x1, z1, fill, stroke, lw = 1.6) => {
      const a = X(x0), b = Z(z0), cw = X(x1) - a, ch = Z(z1) - b;
      x.fillStyle = fill;
      roundRectPath(x, a, b, cw, ch, 3 * k); x.fill();
      if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw * k; x.stroke(); }
    };
    const emoji = (e, wx, wz, size) => {
      x.font = `${size * k}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#000';
      if (!drawIcon(x, e, X(wx), Z(wz), size * k * 1.05)) x.fillText(e, X(wx), Z(wz));
      if (big) this._iconSrc.push({ wx, wz });
    };
    /* Etiquettes et icones : seulement enregistrees ici ; dessinees a chaque image
       a taille constante (voir _drawMapLabels), pour rester lisibles au zoom. */
    if (big) { this._pillSrc = []; this._iconSrc = []; }
    const pill = (txt, wx, wz) => { if (big) this._pillSrc.push({ txt, wx, wz }); };

    /* Herbe + taches + arbres (fixes : meme graine a chaque fois). */
    x.fillStyle = T.grass; x.fillRect(0, 0, w, h);
    const rnd = seeded('map-decor');
    x.fillStyle = T.grass2;
    for (let i = 0; i < Math.round(70 * Math.min(area, 1.3)); i++) {
      x.beginPath();
      x.ellipse(rnd() * w, rnd() * h, (10 + rnd() * 22) * k, (6 + rnd() * 12) * k, rnd() * 3, 0, Math.PI * 2);
      x.fill();
    }

    const rw = L.runway;
    /* Piste. */
    const rz0 = Math.max(rw.zEnd, M.z0 - 20), rz1 = Math.min(rw.zStart, M.z1 + 20);
    rect(rw.x - rw.width / 2, rz0, rw.x + rw.width / 2, rz1, T.runway, T.edge, 1.2);
    x.strokeStyle = T.mark; x.lineWidth = 2.2 * k; x.setLineDash([9 * k, 8 * k]);
    x.beginPath(); x.moveTo(X(rw.x), Z(rz0)); x.lineTo(X(rw.x), Z(rz1)); x.stroke(); x.setLineDash([]);
    /* Seuils : barres d'attache et numeros de piste (36 au sud, 18 au nord). */
    for (const [zt, num] of [[rw.zStart, '36'], [rw.zEnd, '18']]) {
      const dir = zt > 0 ? -1 : 1;
      x.fillStyle = T.mark;
      for (let i = -3; i <= 3; i++) x.fillRect(X(rw.x + i * 5) - 1.2 * k, Z(zt + dir * 8), 2.4 * k, Math.abs(Z(zt + dir * 28) - Z(zt + dir * 8)));
      if (big) {
        x.save(); x.translate(X(rw.x), Z(zt + dir * 60)); x.rotate(dir < 0 ? Math.PI : 0);
        x.font = `900 ${14 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 0, 0);
        x.restore();
      }
    }
    /* Bretelles + taxiway. */
    for (const lz of L.linkZ) if (lz > M.z0 - 30 && lz < M.z1 + 30) rect(rw.x + rw.width / 2, lz - 12, L.taxiway.x, lz + 12, T.taxi);
    const tz0 = Math.max(L.taxiway.z0, M.z0 - 20), tz1 = Math.min(L.taxiway.z1, M.z1 + 20);
    rect(L.taxiway.x - L.taxiway.width / 2, tz0, L.taxiway.x + L.taxiway.width / 2, tz1, T.taxi);
    x.strokeStyle = T.taxiLine; x.lineWidth = 1.6 * k; x.setLineDash([6 * k, 5 * k]);
    x.beginPath(); x.moveTo(X(L.taxiway.x), Z(tz0)); x.lineTo(X(L.taxiway.x), Z(tz1)); x.stroke(); x.setLineDash([]);
    /* Aviation legere + PAPI (visibles surtout en vue complete). */
    rect(L.gaApron.x0, L.gaApron.z0, L.gaApron.x1, L.gaApron.z1, T.apron, T.taxiLine, 1.2);
    x.fillStyle = '#fde047'; x.beginPath(); x.arc(X(L.papi.x), Z(L.papi.z), 3 * k, 0, Math.PI * 2); x.fill();
    /* Aire de stationnement. */
    rect(L.apron.x0, L.apron.z0, L.apron.x1, L.apron.z1, T.apron, T.taxiLine, 1.2);
    /* Skatepark (phase 40) : dalle teintee, rampes colorees, rails jaunes. */
    {
      const pk = PARK.area, course = this._parkCourse || (this._parkCourse = buildPark());
      rect(pk.x0, pk.z0, pk.x1, pk.z1, 'rgba(56,189,248,0.28)', '#38bdf8', 1.4);
      for (const p of course.prims) rect(p.box.x0, p.box.z0, p.box.x1, p.box.z1, '#' + (p.color || 0x38bdf8).toString(16).padStart(6, '0'), 'rgba(15,23,42,0.45)', 0.8);
      x.strokeStyle = '#fde047'; x.lineWidth = 2 * k; x.lineCap = 'round';
      for (const r of course.rails) { x.beginPath(); x.moveTo(X(r.x0), Z(r.z0)); x.lineTo(X(r.x1), Z(r.z1)); x.stroke(); }
      x.lineCap = 'butt';
    }
    /* Routes. */
    rect(L.road.x0, L.road.z - L.road.w / 2, L.road.x1, L.road.z + L.road.w / 2, T.road);
    rect(L.entrance.x - 7, L.entrance.z0, L.entrance.x + 7, L.entrance.z1, T.road);
    rect(L.serviceRoad.x - 3, L.serviceRoad.z0, L.serviceRoad.x + 3, L.serviceRoad.z1, T.road);
    x.strokeStyle = T.mark; x.lineWidth = 1.2 * k; x.setLineDash([5 * k, 6 * k]);
    x.beginPath(); x.moveTo(X(L.road.x0), Z(L.road.z)); x.lineTo(X(L.road.x1), Z(L.road.z)); x.stroke(); x.setLineDash([]);
    /* Parking : places en rang. */
    const P = L.parking;
    rect(P.x0, P.z0, P.x1, P.z1, T.park, T.edge, 1);
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1 * k;
    for (let px = P.x0 + 12; px < P.x1; px += 12) { x.beginPath(); x.moveTo(X(px), Z(P.z0 + 4)); x.lineTo(X(px), Z(P.z1 - 4)); x.stroke(); }
    /* Fret, carburant, pompiers, heliport, aviation legere. */
    const c = L.cargo;
    rect(c.x0, c.z0, c.x1, c.z1, T.cargo, T.cargoLine);
    const fr = L.fireStation;
    rect(L.fireApron.x0, L.fireApron.z0, L.fireApron.x1, L.fireApron.z1, T.apron);
    rect(fr.x0, fr.z0, fr.x1, fr.z1, '#dc2626', '#fecaca');
    for (const tk of L.fuelFarm.tanks) {
      x.fillStyle = '#e5e7eb'; x.strokeStyle = '#64748b'; x.lineWidth = 1.4 * k;
      x.beginPath(); x.arc(X(tk.x), Z(tk.z), L.fuelFarm.r / (M.x1 - M.x0) * w, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    rect(L.fuelFarm.shed.x0, L.fuelFarm.shed.z0, L.fuelFarm.shed.x1, L.fuelFarm.shed.z1, '#94a3b8');
    const hp = L.helipad;
    x.fillStyle = T.apron; x.strokeStyle = '#fde047'; x.lineWidth = 2 * k;
    x.beginPath(); x.arc(X(hp.x), Z(hp.z), hp.r / (M.x1 - M.x0) * w * 1.15, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#fde047'; x.font = `900 ${15 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('H', X(hp.x), Z(hp.z) + k);
    /* Hangars. */
    for (const hg of L.hangars) {
      rect(hg.x0, hg.z0, hg.x1, hg.z1, T.hangar, T.hangarLine);
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1 * k;
      for (let zz = hg.z0 + 12; zz < hg.z1; zz += 12) { x.beginPath(); x.moveTo(X(hg.x0), Z(zz)); x.lineTo(X(hg.x1), Z(zz)); x.stroke(); }
    }
    /* Avion gare + passerelle + terminal. */
    drawPlane(x, X(L.standS2.x), Z(L.standS2.z), Math.PI, 15 * k, '#e2e8f0', 'rgba(15,23,42,0.5)', k);
    rect(357.5, 1168, 362.5, 1198, '#94a3b8');
    const t = L.terminal;
    rect(t.x0, t.z0, t.x1, t.z1, T.term, T.termLine, 2.4);
    x.fillStyle = 'rgba(56,189,248,0.55)';
    x.fillRect(X(t.x0) + 3 * k, Z(t.z0) - 1 * k, X(t.x1) - X(t.x0) - 6 * k, 3.4 * k);
    /* Tour + bureau. */
    const o = L.office;
    rect(o.x0, o.z0, o.x1, o.z1, '#a78bfa');
    x.fillStyle = '#7c3aed'; x.strokeStyle = '#ede9fe'; x.lineWidth = 2 * k;
    x.beginPath(); x.arc(X(L.tower.x), Z(L.tower.z), L.tower.r / (M.x1 - M.x0) * w * 1.5, 0, Math.PI * 2); x.fill(); x.stroke();

    /* Arbres, uniquement sur l'herbe. */
    const solid = [
      [rw.x - 30, M.z0, rw.x + 30, M.z1], [L.taxiway.x - 18, M.z0, L.taxiway.x + 18, M.z1],
      [L.apron.x0 - 5, L.apron.z0 - 5, L.apron.x1 + 5, L.apron.z1 + 5], [L.road.x0 - 5, L.road.z - 12, L.road.x1 + 5, L.road.z + 12],
      [P.x0 - 6, P.z0 - 6, P.x1 + 6, P.z1 + 6], [t.x0 - 6, t.z0 - 6, t.x1 + 6, t.z1 + 6],
      [c.x0 - 6, c.z0 - 6, c.x1 + 6, c.z1 + 6], [L.fireApron.x0 - 6, L.fireApron.z0 - 6, fr.x1 + 6, fr.z1 + 6],
      [L.fuelFarm.shed.x0 - 12, L.fuelFarm.tanks[0].z - 14, L.fuelFarm.shed.x1 + 12, L.fuelFarm.shed.z1 + 10], [L.gaApron.x0 - 6, L.gaApron.z0 - 6, L.gaApron.x1 + 6, L.gaApron.z1 + 6], [hp.x - 22, hp.z - 22, hp.x + 22, hp.z + 22], [L.entrance.x - 14, L.entrance.z0 - 10, L.entrance.x + 14, L.entrance.z1 + 10],
      [L.serviceRoad.x - 8, L.serviceRoad.z0, L.serviceRoad.x + 8, L.serviceRoad.z1],
      [L.tower.x - 22, L.tower.z - 22, L.tower.x + 22, L.tower.z + 22],
      [PARK.area.x0, PARK.area.z0, PARK.area.x1, PARK.area.z1],
      ...L.hangars.map(hg => [hg.x0 - 8, hg.z0 - 8, hg.x1 + 8, hg.z1 + 8])
    ];
    const trng = seeded('map-trees');
    let placed = 0;
    const maxTrees = Math.round(46 * Math.min(area, 2.5));
    for (let i = 0; i < 700 * Math.min(area, 3) && placed < maxTrees; i++) {
      const wx = M.x0 + trng() * (M.x1 - M.x0), wz = M.z0 + trng() * (M.z1 - M.z0);
      if (solid.some(s => wx > s[0] && wx < s[2] && wz > s[1] && wz < s[3])) continue;
      placed++;
      x.fillStyle = T.treeShade;
      x.beginPath(); x.arc(X(wx) + 1.5 * k, Z(wz) + 2 * k, 6.5 * k, 0, Math.PI * 2); x.fill();
      x.fillStyle = T.tree;
      x.beginPath(); x.arc(X(wx), Z(wz), 6 * k, 0, Math.PI * 2); x.fill();
    }

    /* Icones des lieux + etiquettes (grande carte seulement). */
    emoji('🏢', (t.x0 + t.x1) / 2 + 60, (t.z0 + t.z1) / 2, 22);
    emoji('🛹', (PARK.area.x0 + PARK.area.x1) / 2, (PARK.area.z0 + PARK.area.z1) / 2, 20);
    emoji('🗼', L.tower.x, L.tower.z, 20);
    emoji('🔧', 540, 900, 18); emoji('🔧', 540, 1010, 18); emoji('🔧', 540, 1120, 18);
    emoji('🅿️', (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, 20);
    emoji('📦', (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 18);
    emoji('🚒', (fr.x0 + fr.x1) / 2, (fr.z0 + fr.z1) / 2, 17);
    emoji('⛽', L.fuelFarm.tanks[1].x, L.fuelFarm.tanks[0].z, 15);
    pill('TERMINAL', (t.x0 + t.x1) / 2, t.z1 + 14);
    pill('SKATEPARK', (PARK.area.x0 + PARK.area.x1) / 2, PARK.area.z1 + 11);
    pill('TOUR', L.tower.x, L.tower.z - 26);
    pill('HANGARS', 541, 850);
    pill('PARKING', (P.x0 + P.x1) / 2, P.z1 + 12);
    pill('AIRE DES AVIONS', 330, 892);
    pill('PISTE', rw.x, 1330);
    pill('FRET', (c.x0 + c.x1) / 2, c.z0 - 10);
    pill('CARBURANT', L.fuelFarm.tanks[1].x, L.fuelFarm.tanks[0].z - 18);
    pill('POMPIERS', (fr.x0 + fr.x1) / 2, fr.z0 - 12);
    pill('HELIPORT', hp.x + 30, hp.z - 24);
    pill('AVIATION LEGERE', L.gaApron.x1 + 34, (L.gaApron.z0 + L.gaApron.z1) / 2);
    pill('SEUIL 36', rw.x + 56, rw.zStart - 40);
    pill('SEUIL 18', rw.x + 56, rw.zEnd + 40);
    pill('PAPI', L.papi.x + 26, L.papi.z);

    /* Cadre + rose des vents. */
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 3 * k; x.strokeRect(0, 0, w, h);
    const cx = 27 * k, cz = 30 * k;
    x.fillStyle = 'rgba(15,23,42,0.7)';
    x.beginPath(); x.arc(cx, cz, 17 * k, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f87171';
    x.beginPath(); x.moveTo(cx, cz - 12 * k); x.lineTo(cx + 5 * k, cz + 2 * k); x.lineTo(cx - 5 * k, cz + 2 * k); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.font = `900 ${10 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('N', cx, cz + 9 * k);
    return (this._bases[key] = base);
  },
  /* Dessine une carte complete (mini ou grande) dans `cv`. */
  _drawMap(cv, target) {
    const g = this.g;
    const w = cv.width, h = cv.height, k = w / 480, x = cv.getContext('2d');
    const T = performance.now() / 1000;
    const big = cv.id === 'mapBigCv';
    const M0 = big ? this._bigWin() : MAP_WIN;
    const V = big ? this._viewRect() : M0;
    const base = this._mapBase(big ? w * 2 : w, big ? h * 2 : h, M0, big);
    const fx = (V.x0 - M0.x0) / (M0.x1 - M0.x0), fz = (V.z0 - M0.z0) / (M0.z1 - M0.z0);
    x.drawImage(base, fx * base.width, fz * base.height,
      (V.x1 - V.x0) / (M0.x1 - M0.x0) * base.width, (V.z1 - V.z0) / (M0.z1 - M0.z0) * base.height, 0, 0, w, h);
    const P = (wx, wz) => [(wx - V.x0) / (V.x1 - V.x0) * w, (wz - V.z0) / (V.z1 - V.z0) * h];
    if (big) this._drawMapLabels(x, P, w, h, k);
    const clampPx = (p, m = 10 * k) => [clamp(p[0], m, w - m), clamp(p[1], m, h - m)];
    const pp = g.player;
    const [px, pz] = clampPx(P(pp.pos.x, pp.pos.z));
    const mPerPx = (V.x1 - V.x0) / w;

    /* Radar des pieces cachees : un anneau qui grandit autour de toi. */
    const R = TREASURE_RADAR;
    const rr = R / mPerPx;
    const pulse = (T * 0.7) % 1;
    x.strokeStyle = `rgba(253,224,71,${0.5 * (1 - pulse)})`; x.lineWidth = 2.2 * k;
    x.beginPath(); x.arc(px, pz, rr * pulse, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(253,224,71,0.22)'; x.lineWidth = 1.2 * k; x.setLineDash([4 * k, 5 * k]);
    x.beginPath(); x.arc(px, pz, rr, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);

    /* Pas du joueur : petites empreintes qui s'effacent. */
    const tr = this._trail || [];
    for (let i = 0; i < tr.length; i++) {
      const [tx, tz] = P(tr[i].x, tr[i].z);
      x.fillStyle = `rgba(255,255,255,${0.12 + 0.4 * (i / tr.length)})`;
      x.beginPath(); x.arc(tx, tz, (2 + 1.6 * (i / tr.length)) * k, 0, Math.PI * 2); x.fill();
    }

    /* Chemin en pointilles vers l'objectif. */
    if (target) {
      const [tx, tz] = clampPx(P(target.x, target.z), 14 * k);
      x.save();
      x.strokeStyle = '#fde047'; x.lineWidth = 3 * k; x.lineCap = 'round';
      x.setLineDash([2 * k, 8 * k]); x.lineDashOffset = -T * 20 * k;
      /* Vrai itineraire (graphe de navigation), recalcule 2 fois par seconde. */
      const now = performance.now();
      if (!this._routeAt || now - this._routeAt > 500 || this._routeKey !== target.x + ',' + target.z) {
        this._routeAt = now; this._routeKey = target.x + ',' + target.z;
        try { this._route = g.nav && g.state === 'HUB' ? g.nav.waypoints(pp.pos, target) : null; } catch (e) { this._route = null; }
      }
      x.beginPath(); x.moveTo(px, pz);
      if (this._route && this._route.length) for (const q of this._route) { const [qx, qz] = P(q.x, q.z); x.lineTo(qx, qz); }
      else x.lineTo(tx, tz);
      x.stroke();
      x.restore();
    }

    /* Vie de l'aeroport. */
    const life = g.r3d.life;
    if (life) {
      for (const d of life.dots) {
        const [dx, dz] = P(d.x, d.z);
        if (dx < 0 || dz < 0 || dx > w || dz > h) continue;
        if (big) {
          drawIcon(x, d.k === 'a' ? '✈️' : d.k === 'h' ? '🚁' : '🚚', dx, dz, (d.k === 'a' ? 22 : 16) * k);
        } else {
          x.fillStyle = d.k === 'a' ? '#ffffff' : d.k === 'h' ? '#f87171' : '#fde047';
          x.strokeStyle = '#0f172a'; x.lineWidth = 1.2 * k;
          x.beginPath(); x.arc(dx, dz, (d.k === 'a' ? 5.5 : 3.4) * k, 0, Math.PI * 2); x.fill(); x.stroke();
        }
      }
    }

    /* Avion du joueur, oriente comme il l'est vraiment. */
    const ac = g.ac;
    if (g.state !== 'PILOT') {
      const f = ac.forward();
      const [ax, az] = clampPx(P(ac.pos.x, ac.pos.z));
      drawPlane(x, ax, az, Math.atan2(f.x, f.z), 15 * k, '#ffffff', '#0f172a', k);
    }

    /* Pieces cachees a portee de radar. */
    const tz0 = this.data.treasure;
    if (tz0) {
      tz0.spots.forEach((s, i) => {
        if (tz0.got[i]) return;
        if (Math.hypot(s[0] - pp.pos.x, s[1] - pp.pos.z) > R) return;
        const [sx, sz] = P(s[0], s[1]);
        const k2 = 1 + Math.sin(T * 5 + i) * 0.25;
        x.fillStyle = '#fde047'; x.strokeStyle = '#78350f'; x.lineWidth = 1.6 * k;
        x.beginPath();
        for (let j = 0; j < 8; j++) {
          const rad = (j % 2 ? 2.6 : 8) * k * k2, ang = j * Math.PI / 4;
          x.lineTo(sx + Math.cos(ang) * rad, sz + Math.sin(ang) * rad);
        }
        x.closePath(); x.fill(); x.stroke();
      });
    }

    /* Cible de l'objectif : grosse etoile qui pulse + onde. */
    if (target) {
      const [tx, tz] = clampPx(P(target.x, target.z), 16 * k);
      const kk = 1 + Math.sin(T * 6) * 0.22;
      const wave = (T * 0.9) % 1;
      x.strokeStyle = `rgba(253,224,71,${0.7 * (1 - wave)})`; x.lineWidth = 3 * k;
      x.beginPath(); x.arc(tx, tz, (10 + 22 * wave) * k, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#fde047'; x.strokeStyle = '#78350f'; x.lineWidth = 2.6 * k;
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = (i % 2 ? 6.5 : 15) * k * kk, ang = -Math.PI / 2 + i * Math.PI / 5;
        x.lineTo(tx + Math.cos(ang) * rad, tz + Math.sin(ang) * rad);
      }
      x.closePath(); x.fill(); x.stroke();
    }

    /* Toi : halo qui respire + fleche de direction. */
    const halo = 0.5 + 0.5 * Math.sin(T * 4);
    x.fillStyle = `rgba(239,68,68,${0.16 + 0.16 * halo})`;
    x.beginPath(); x.arc(px, pz, (13 + 5 * halo) * k, 0, Math.PI * 2); x.fill();
    const hd = pp.heading;
    x.fillStyle = '#ef4444'; x.strokeStyle = '#fff'; x.lineWidth = 2.6 * k; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(px + Math.sin(hd) * 14 * k, pz + Math.cos(hd) * 14 * k);
    x.lineTo(px + Math.sin(hd + 2.5) * 10 * k, pz + Math.cos(hd + 2.5) * 10 * k);
    x.lineTo(px + Math.sin(hd - 2.5) * 10 * k, pz + Math.cos(hd - 2.5) * 10 * k);
    x.closePath(); x.fill(); x.stroke();

    /* Bandeau : lieu actuel a gauche, chasse aux pieces a droite. */
    const bh = (big ? 34 : 30) * k;
    x.fillStyle = 'rgba(15,23,42,0.82)'; x.fillRect(0, h - bh, w, bh);
    const place = this.placeAt(pp.pos.x, pp.pos.z);
    x.font = `800 ${(big ? 15 : 14) * k}px -apple-system,"Segoe UI","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = '#fff';
    const isz = (big ? 18 : 16) * k;
    if (drawIcon(x, place.ico, 10 * k + isz / 2, h - bh / 2, isz)) x.fillText(place.name, 10 * k + isz + 6 * k, h - bh / 2);
    else x.fillText(`${place.ico} ${place.name}`, 10 * k, h - bh / 2);
    const th = this.treasureHeat();
    x.textAlign = 'right'; x.fillStyle = '#fde68a';
    if (th) {
      const label = `${th.found}/${th.total}`;
      x.fillText(label, w - 10 * k, h - bh / 2);
      const tw = x.measureText(label).width;
      if (!drawIcon(x, th.ico, w - 10 * k - tw - isz / 2 - 4 * k, h - bh / 2, isz)) x.fillText(th.ico, w - 10 * k - tw - 4 * k, h - bh / 2);
    }
    if (!big) drawIcon(x, '🔍', w - 18 * k, 20 * k, 18 * k);
  },
  /* Etiquettes de la grande carte : taille constante, anti-collision (essais de decalages). */
  _drawMapLabels(x, P, w, h, k) {
    const pills = this._pillSrc || [];
    const taken = [];
    for (const ic of this._iconSrc || []) {
      const [px, pz] = P(ic.wx, ic.wz);
      taken.push([px - 12 * k, pz - 12 * k, px + 12 * k, pz + 12 * k]);
    }
    x.save();
    x.font = `800 ${11 * k}px -apple-system,"Segoe UI",sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const th = 17 * k, gap = 3 * k;
    for (const p of pills) {
      const [cx0, cz0] = P(p.wx, p.wz);
      if (cx0 < -40 * k || cx0 > w + 40 * k || cz0 < -20 * k || cz0 > h + 20 * k) continue;
      const tw = x.measureText(p.txt).width + 12 * k;
      const tries = [[0, 0], [0, -th - gap], [0, th + gap], [tw / 2 + gap, 0], [-tw / 2 - gap, 0], [0, -2 * (th + gap)], [0, 2 * (th + gap)], [tw + gap, 0], [-tw - gap, 0]];
      for (const [dx, dz] of tries) {
        const cx = clamp(cx0 + dx, tw / 2 + 4 * k, w - tw / 2 - 4 * k), cz = clamp(cz0 + dz, th / 2 + 4 * k, h - 34 * k - th / 2);
        const r = [cx - tw / 2, cz - th / 2, cx + tw / 2, cz + th / 2];
        if (taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) continue;
        taken.push(r);
        x.fillStyle = 'rgba(15,23,42,0.74)';
        roundRectPath(x, r[0], r[1], tw, th, th / 2); x.fill();
        x.fillStyle = '#fff'; x.fillText(p.txt, cx, cz + k * 0.5);
        break;
      }
    }
    x.restore();
  },
  /* ---- Zoom / deplacement de la grande carte ---- */
  _bigWin() { return this._bigMode === 'full' ? MAP_FULL : MAP_WIN; },
  _viewRect() {
    const M = this._bigWin();
    const v = this._view || (this._view = { cx: (M.x0 + M.x1) / 2, cz: (M.z0 + M.z1) / 2, zoom: 1 });
    const vw = (M.x1 - M.x0) / v.zoom, vh = (M.z1 - M.z0) / v.zoom;
    v.cx = clamp(v.cx, M.x0 + vw / 2, M.x1 - vw / 2);
    v.cz = clamp(v.cz, M.z0 + vh / 2, M.z1 - vh / 2);
    return { x0: v.cx - vw / 2, x1: v.cx + vw / 2, z0: v.cz - vh / 2, z1: v.cz + vh / 2 };
  },
  /* Zoom par le facteur f, le point (px, py) (fractions du canevas) restant sous le doigt. */
  zoomMap(f, px = 0.5, py = 0.5) {
    const V = this._viewRect(), v = this._view, M = this._bigWin();
    const wx = V.x0 + (V.x1 - V.x0) * px, wz = V.z0 + (V.z1 - V.z0) * py;
    v.zoom = clamp(v.zoom * f, 1, 5);
    const vw = (M.x1 - M.x0) / v.zoom, vh = (M.z1 - M.z0) / v.zoom;
    v.cx = wx - (px - 0.5) * vw; v.cz = wz - (py - 0.5) * vh;
  },
  panMap(dx, dy) {
    const V = this._viewRect(), v = this._view;
    v.cx -= dx * (V.x1 - V.x0); v.cz -= dy * (V.z1 - V.z0);
  },
  resetMapView() { this._view = null; },
  /* Bascule « complexe » <-> « aeroport entier » : le canevas change de proportions. */
  setMapMode(mode) {
    this._bigMode = mode === 'full' ? 'full' : 'complex';
    const cv = $('mapBigCv');
    if (cv) {
      const [cw, ch] = BIG_CANVAS[this._bigMode];
      cv.width = cw; cv.height = ch;
      cv.classList.toggle('tall', this._bigMode === 'full');
    }
    const btn = $('mapModeBtn');
    if (btn) btn.textContent = this._bigMode === 'full' ? 'Complexe' : 'Tout l\'aeroport';
    this.resetMapView();
  },
  _bindMapGestures(cv) {
    if (this._gesturesBound) return;
    this._gesturesBound = true;
    cv.style.touchAction = 'none';
    const pts = new Map();
    let pinch = 0;
    const frac = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = frac(e); this.zoomMap(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const [px, py] = frac(e); this.zoomMap(2, px, py); });
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = cv.getBoundingClientRect();
      if (pts.size === 1) this.panMap((e.clientX - prev[0]) / r.width, (e.clientY - prev[1]) / r.height);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoomMap(d / pinch, ((a[0] + b[0]) / 2 - r.left) / r.width, ((a[1] + b[1]) / 2 - r.top) / r.height);
        pinch = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    for (const [id, f] of [['mapModeBtn', () => this.setMapMode(this._bigMode === 'full' ? 'complex' : 'full')], ['mapZoomIn', () => this.zoomMap(1.5)], ['mapZoomOut', () => this.zoomMap(1 / 1.5)], ['mapZoomReset', () => this.resetMapView()]]) {
      const btn = $(id); if (btn) btn.addEventListener('click', f);
    }
  },
  _renderMap(target) {
    const cv = $('miniMap');
    if (!cv) return;
    const g = this.g;
    const show = g.state === 'HUB';
    cv.classList.toggle('hidden', !show);
    if (!show) return;
    /* Empreintes : un point toutes les 0,8 s de marche. */
    const now = performance.now();
    if (!this._trailAt || now - this._trailAt > 800) {
      this._trailAt = now;
      this._trail = this._trail || [];
      const p = g.player.pos, last = this._trail[this._trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 2) this._trail.push({ x: p.x, z: p.z });
      if (this._trail.length > 14) this._trail.shift();
    }
    this._drawMap(cv, target);
  },
  /* Grande carte (overlay) : redessinee en boucle tant qu'elle est ouverte. */
  openBigMap() {
    const box = $('mapBig');
    if (!box) return;
    this._bigOpen = true;
    this.setMapMode(this._bigMode || 'complex');
    this._bindMapGestures($('mapBigCv'));
    box.classList.remove('hidden');
    $('mapBigName').textContent = this.data.name;
    const loop = () => {
      if (!this._bigOpen) return;
      this._drawMap($('mapBigCv'), this.currentGoal().target);
      requestAnimationFrame(loop);
    };
    loop();
  },
  closeBigMap() {
    this._bigOpen = false;
    const box = $('mapBig');
    if (box) box.classList.add('hidden');
  },
  setTheme(id) {
    if (!MAP_THEMES[id] || !this.data.themes.includes(id)) return false;
    this.data.mapTheme = id;
    this.save();
    return true;
  },
  buyTheme(id) {
    const th = MAP_THEMES[id];
    if (!th || this.data.themes.includes(id) || this.coins < th.cost) return false;
    const t = this.g.tycoon;
    t.cash -= th.cost * COIN;
    t.save();
    this.data.themes.push(id);
    this.data.mapTheme = id;
    sfx.levelUp(); this.confetti(50);
    this.save();
    return true;
  },
};
