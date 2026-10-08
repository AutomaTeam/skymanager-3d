/* ============================================================
   cockpit.js — Poste de pilotage 3D (phase 20)

   Avant : la vue cockpit n'etait qu'une camera dans le nez, coque
   masquee, sans aucun decor. Maintenant : un vrai poste de pilotage
   parente a l'appareil (repere avion : -Z avant, +X droite, +Y haut) :

   - tableau de bord avec 3 ecrans vivants (PFD, moteurs, navigation)
     dessines sur canvas, plus un affichage secondaire ;
   - glareshield, montants de pare-brise, plafonnier avec panneau ;
   - piedestal central : manettes des gaz, aerofreins, volets, frein de
     parc, levier de train ; tout suit l'etat reel de l'avion ;
   - deux sieges, deux volants (celui du joueur suit tangage et roulis) ;
   - voyants MASTER WARNING / CAUTION qui clignotent avec les alertes.

   Le module exporte aussi drawPFD(), reutilise par le mini-PFD du HUD
   dans les vues exterieures.
   ============================================================ */
import * as THREE from 'three';
import { KTS, FT, FPM } from './flightPhysics.js?v=1791469458';
import { LIGHT_GAIN } from './environment.js?v=1791469458';

/* Position des yeux du pilote (siege gauche), repere avion. */
export const COCKPIT_EYE = new THREE.Vector3(-0.42, 1.22, -14.2);

const FONT = (px, w = 'bold') => `${w} ${Math.round(px)}px Consolas, Menlo, "Courier New", monospace`;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------- */
/* Alertes affichees sur l'ecran moteurs et les voyants master.
   Retourne [{ text, sev }] avec sev 'red' (critique) ou 'amber'. */
export function collectWarnings(ac, extra) {
  const out = [];
  const ft = ac.pos.y * FT;
  const fuelPct = ac.fuel / ac.fuelCap;
  if (extra) out.push({ text: extra, sev: 'red' });
  if (ac.stall > 0.02 && !ac.onGround) out.push({ text: 'STALL', sev: 'red' });
  if (ac.overspeed) out.push({ text: 'OVERSPEED', sev: 'red' });
  if (!ac.gearDown && ft < 500 && ac.vsi < 0) out.push({ text: 'GEAR NOT DOWN', sev: 'red' });
  if (ac.fuel <= 0) out.push({ text: 'FUEL EMPTY', sev: 'red' });
  else if (fuelPct < 0.12) out.push({ text: 'FUEL LOW', sev: 'red' });
  else if (fuelPct < 0.25) out.push({ text: 'FUEL CHECK', sev: 'amber' });
  if (ac.parkBrake && ac.ctl.throttle > 0.35) out.push({ text: 'PARK BRK ON', sev: 'amber' });
  if (ac.faults && ac.faults.thrust < 1) out.push({ text: 'ENG THRUST LOSS', sev: 'amber' });
  return out;
}

/* ---------------------------------------------------------- */
/* PFD : horizon artificiel, bandes de vitesse et d'altitude, cap.
   Dessine dans le rectangle W x H du contexte fourni. */
export function drawPFD(ctx, W, H, ac, t) {
  const f = W / 320;
  const kt = ac.ias * KTS;
  const ft = ac.pos.y * FT;
  const vs = ac.vsi * FPM;
  const pitch = ac.pitchDeg;
  const bank = ac.bankDeg;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const ax = W * 0.19, aw = W * 0.62, ay = H * 0.04, ah = H * 0.80;
  const cx = ax + aw / 2, cy = ay + ah / 2;
  const ppd = ah / 34;

  /* ---- Horizon ---- */
  ctx.save();
  ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank * DEG);
  const hy = clamp(pitch, -60, 60) * ppd;
  let g = ctx.createLinearGradient(0, hy - ah, 0, hy);
  g.addColorStop(0, '#1a5cb0'); g.addColorStop(1, '#6db3f2');
  ctx.fillStyle = g; ctx.fillRect(-W, hy - W * 2, W * 2, W * 2);
  g = ctx.createLinearGradient(0, hy, 0, hy + ah);
  g.addColorStop(0, '#8b6b3d'); g.addColorStop(1, '#46331c');
  ctx.fillStyle = g; ctx.fillRect(-W, hy, W * 2, W * 2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * f;
  ctx.beginPath(); ctx.moveTo(-W, hy); ctx.lineTo(W, hy); ctx.stroke();

  /* echelle de tangage */
  ctx.fillStyle = '#fff'; ctx.font = FONT(11 * f); ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.6 * f;
  for (let p = -30; p <= 30; p += 5) {
    if (p === 0) continue;
    const y = hy - p * ppd;
    const half = p % 10 === 0 ? aw * 0.15 : aw * 0.07;
    ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
    if (p % 10 === 0) {
      ctx.textAlign = 'right'; ctx.fillText(String(Math.abs(p)), -half - 4 * f, y);
      ctx.textAlign = 'left'; ctx.fillText(String(Math.abs(p)), half + 4 * f, y);
    }
  }
  ctx.restore();

  /* echelle de roulis : suit l'horizon, repere jaune fixe en haut */
  ctx.save();
  ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank * DEG);
  const R = ah * 0.44;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * f;
  [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach(a => {
    const s = Math.sin(a * DEG), c = Math.cos(a * DEG);
    const len = (a % 30 === 0) ? 10 * f : 6 * f;
    ctx.beginPath(); ctx.moveTo(s * R, -c * R); ctx.lineTo(s * (R + len), -c * (R + len)); ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = '#facc15';
  ctx.beginPath(); ctx.moveTo(cx, cy - R + 2 * f); ctx.lineTo(cx - 6 * f, cy - R - 9 * f); ctx.lineTo(cx + 6 * f, cy - R - 9 * f);
  ctx.closePath(); ctx.fill();

  /* symbole avion */
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3.5 * f; ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(cx - aw * 0.30, cy); ctx.lineTo(cx - aw * 0.10, cy); ctx.lineTo(cx - aw * 0.10, cy + ah * 0.035);
  ctx.moveTo(cx + aw * 0.30, cy); ctx.lineTo(cx + aw * 0.10, cy); ctx.lineTo(cx + aw * 0.10, cy + ah * 0.035);
  ctx.stroke();
  ctx.fillStyle = '#facc15'; ctx.fillRect(cx - 2.5 * f, cy - 2.5 * f, 5 * f, 5 * f);

  /* infos de configuration en haut de l'horizon */
  ctx.font = FONT(10 * f); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#4ade80';
  ctx.fillText(`FLAPS ${ac.flaps.name}`, ax + 4 * f, ay + 3 * f);
  ctx.textAlign = 'right';
  ctx.fillStyle = ac.gearDown ? '#4ade80' : '#e5e7eb';
  ctx.fillText(ac.gearDown ? 'GEAR ▼' : 'GEAR ▲', ax + aw - 4 * f, ay + 3 * f);

  /* hauteur radio-sonde */
  const ra = Math.max(0, (ac.pos.y - 3.6) * FT);
  if (!ac.onGround && ra < 2500) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = FONT(15 * f);
    ctx.fillStyle = ra < 400 ? '#facc15' : '#4ade80';
    ctx.fillText(String(Math.round(ra / (ra < 100 ? 1 : 10) * (ra < 100 ? 1 : 10))), cx, ay + ah - 8 * f);
  }

  /* alertes centrales */
  const blink = Math.sin(t * 9) > 0;
  if (ac.stall > 0.02 && !ac.onGround) banner('STALL', '#ef4444', blink);
  else if (ac.overspeed) banner('OVERSPEED', '#ef4444', blink);
  function banner(txt, col, on) {
    if (!on) return;
    ctx.font = FONT(24 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.fillText(txt, cx, cy - ah * 0.24);
  }

  /* ---- Bande de vitesse ---- */
  const tw = W * 0.17;
  {
    const x0 = W * 0.01;
    const ppk = ah / 62;
    ctx.save();
    ctx.fillStyle = 'rgba(18,22,28,0.92)'; ctx.fillRect(x0, ay, tw, ah);
    ctx.beginPath(); ctx.rect(x0, ay, tw, ah); ctx.clip();
    /* zone rouge sous la vitesse de decrochage */
    const vsY = cy - (ac.stallSpeed() * KTS - kt) * ppk;
    ctx.fillStyle = 'rgba(220,38,38,0.75)';
    if (vsY < ay + ah) ctx.fillRect(x0 + tw - 7 * f, Math.max(ay, vsY), 7 * f, ay + ah - Math.max(ay, vsY));
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#e5e7eb'; ctx.lineWidth = 1.5 * f;
    ctx.font = FONT(12 * f); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.max(0, Math.floor((kt - 34) / 10) * 10); v <= kt + 34; v += 10) {
      const y = cy - (v - kt) * ppk;
      const major = v % 20 === 0;
      ctx.beginPath(); ctx.moveTo(x0 + tw - 8 * f, y); ctx.lineTo(x0 + tw - (major ? 20 : 14) * f, y); ctx.stroke();
      if (major) ctx.fillText(String(v), x0 + tw - 24 * f, y);
    }
    /* repere Vref (magenta) */
    const vrY = cy - (ac.vRef() * KTS - kt) * ppk;
    ctx.fillStyle = '#e879f9';
    ctx.beginPath(); ctx.moveTo(x0 + tw - 8 * f, vrY); ctx.lineTo(x0 + tw - 1 * f, vrY - 5 * f); ctx.lineTo(x0 + tw - 1 * f, vrY + 5 * f); ctx.fill();
    ctx.restore();
    /* fenetre de valeur */
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 * f;
    ctx.fillRect(x0, cy - 12 * f, tw - 3 * f, 24 * f); ctx.strokeRect(x0, cy - 12 * f, tw - 3 * f, 24 * f);
    ctx.fillStyle = (ac.stall > 0.02 || ac.overspeed) ? '#ef4444' : '#f8fafc';
    ctx.font = FONT(17 * f); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(kt)), x0 + tw - 8 * f, cy + 1);
    ctx.font = FONT(9 * f); ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('KT', x0 + 2 * f, ay + ah + 3 * f);
    if (ac.mach > 0.3) { ctx.fillStyle = '#4ade80'; ctx.fillText(`M.${String(Math.round(ac.mach * 100)).padStart(2, '0')}`, x0 + 22 * f, ay + ah + 3 * f); }
  }

  /* ---- Bande d'altitude ---- */
  {
    const x0 = W - W * 0.01 - tw;
    const ppf = ah / 620;
    ctx.save();
    ctx.fillStyle = 'rgba(18,22,28,0.92)'; ctx.fillRect(x0, ay, tw, ah);
    ctx.beginPath(); ctx.rect(x0, ay, tw, ah); ctx.clip();
    /* sol : bande brune sous 0 ft */
    const gY = cy + ft * ppf;
    if (gY < ay + ah) { ctx.fillStyle = 'rgba(139,107,61,0.85)'; ctx.fillRect(x0, gY, tw, ay + ah - gY); }
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#e5e7eb'; ctx.lineWidth = 1.5 * f;
    ctx.font = FONT(11 * f); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let a = Math.floor((ft - 320) / 20) * 20; a <= ft + 320; a += 20) {
      if (a < 0) continue;
      const y = cy - (a - ft) * ppf;
      const major = a % 100 === 0;
      ctx.beginPath(); ctx.moveTo(x0 + 2 * f, y); ctx.lineTo(x0 + (major ? 14 : 8) * f, y); ctx.stroke();
      if (major) ctx.fillText(String(a), x0 + 17 * f, y);
    }
    ctx.restore();
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 * f;
    ctx.fillRect(x0 + 3 * f, cy - 12 * f, tw - 3 * f, 24 * f); ctx.strokeRect(x0 + 3 * f, cy - 12 * f, tw - 3 * f, 24 * f);
    ctx.fillStyle = '#f8fafc'; ctx.font = FONT(17 * f); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(ft / 10) * 10), x0 + tw - 5 * f, cy + 1);
    /* vario */
    ctx.font = FONT(10 * f); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = Math.abs(vs) > 2000 ? '#facc15' : '#4ade80';
    const vsr = Math.round(vs / 50) * 50;
    ctx.fillText(`V/S ${vsr > 0 ? '+' : ''}${vsr}`, x0 + tw, ay + ah + 3 * f);
  }

  /* ---- Bande de cap ---- */
  {
    const y0 = H * 0.90, hh = H * 0.10;
    const hdg = ac.heading;
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(ax, y0, aw, hh);
    ctx.save();
    ctx.beginPath(); ctx.rect(ax, y0, aw, hh); ctx.clip();
    const ppdg = aw / 66;
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#e5e7eb'; ctx.lineWidth = 1.4 * f;
    ctx.font = FONT(10 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = Math.floor((hdg - 34) / 5) * 5; d <= hdg + 34; d += 5) {
      const x = cx + (d - hdg) * ppdg;
      const dd = ((d % 360) + 360) % 360;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + (dd % 10 === 0 ? 7 : 4) * f); ctx.stroke();
      if (dd % 10 === 0) {
        const lbl = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10).padStart(2, '0');
        ctx.fillText(lbl, x, y0 + 8 * f);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.moveTo(cx, y0 + 1); ctx.lineTo(cx - 5 * f, y0 - 5 * f); ctx.lineTo(cx + 5 * f, y0 - 5 * f); ctx.fill();
    ctx.font = FONT(9 * f); ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('HDG', ax + 2 * f, ay + ah + 3 * f);
    ctx.fillStyle = '#4ade80'; ctx.font = FONT(11 * f);
    ctx.fillText(String(Math.round(hdg) % 360).padStart(3, '0') + '°', ax + 26 * f, ay + ah + 2 * f);
  }
}

/* ---------------------------------------------------------- */
/* Ecran moteurs / configuration / alertes */
function arcGauge(ctx, cx, cy, r, val, label, f) {
  const a0 = 135 * DEG, sweep = 270 * DEG;
  ctx.lineWidth = 9 * f; ctx.lineCap = 'butt';
  ctx.strokeStyle = '#1f2937';
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + sweep); ctx.stroke();
  const n = clamp(val / 100, 0, 1.05);
  ctx.strokeStyle = val > 98 ? '#ef4444' : val > 92 ? '#f59e0b' : '#22d3ee';
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + sweep * Math.min(1, n)); ctx.stroke();
  ctx.fillStyle = '#f8fafc'; ctx.font = FONT(20 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(val.toFixed(0), cx, cy + 2 * f);
  ctx.fillStyle = '#94a3b8'; ctx.font = FONT(10 * f);
  ctx.fillText(label, cx, cy + r + 15 * f);
}

export function drawEngine(ctx, W, H, ac, t, warnings) {
  const f = W / 320;
  ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0e7490'; ctx.fillRect(0, 0, W, 20 * f);
  ctx.fillStyle = '#e0f2fe'; ctx.font = FONT(12 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ENGINE / SYSTEMS', W / 2, 11 * f);

  arcGauge(ctx, W * 0.27, H * 0.24, W * 0.145, ac.n1, 'N1  ENG 1', f);
  arcGauge(ctx, W * 0.73, H * 0.24, W * 0.145, ac.n1 * (ac.faults && ac.faults.thrust < 1 ? ac.faults.thrust : 1), 'N1  ENG 2', f);

  /* carburant */
  const fp = clamp(ac.fuel / ac.fuelCap, 0, 1);
  ctx.textAlign = 'left'; ctx.font = FONT(11 * f); ctx.fillStyle = '#94a3b8'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('FUEL', W * 0.06, H * 0.505);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(W * 0.20, H * 0.465, W * 0.74, 12 * f);
  ctx.fillStyle = fp < 0.12 ? '#ef4444' : fp < 0.25 ? '#f59e0b' : '#4ade80';
  ctx.fillRect(W * 0.20, H * 0.465, W * 0.74 * fp, 12 * f);
  ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(ac.fuel)} KG`, W * 0.94, H * 0.505 + 15 * f);

  /* volets */
  ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.fillText('FLAPS', W * 0.06, H * 0.64);
  for (let i = 0; i <= 4; i++) {
    ctx.fillStyle = i <= ac.flapIndex ? '#4ade80' : '#1f2937';
    ctx.fillRect(W * 0.26 + i * W * 0.13, H * 0.60, W * 0.11, 12 * f);
  }
  ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'right'; ctx.fillText(ac.flaps.name, W * 0.94, H * 0.64);

  /* trains, aerofreins, inverseurs, frein de parc */
  const chip = (x, y, txt, on, col = '#4ade80') => {
    ctx.fillStyle = on ? col : '#1f2937';
    ctx.fillRect(x, y, W * 0.27, 18 * f);
    ctx.fillStyle = on ? '#02120a' : '#64748b'; ctx.font = FONT(10 * f);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + W * 0.135, y + 10 * f);
  };
  chip(W * 0.05, H * 0.70, ac.gearDown ? 'GEAR DOWN' : 'GEAR UP', ac.gearDown);
  chip(W * 0.365, H * 0.70, ac.spoilers ? 'SPOILERS' : 'SPOILERS OFF', ac.spoilers, '#f59e0b');
  chip(W * 0.68, H * 0.70, ac.reverse ? 'REVERSE' : 'REV OFF', ac.reverse, '#f59e0b');
  chip(W * 0.05, H * 0.775, ac.parkBrake ? 'PARK BRK' : 'PARK OFF', ac.parkBrake, '#ef4444');
  chip(W * 0.365, H * 0.775, ac.onGround ? 'ON GROUND' : 'AIRBORNE', true, '#38bdf8');
  chip(W * 0.68, H * 0.775, `G ${ac.gLoad.toFixed(1)}`, ac.gLoad > 2.2, '#f59e0b');

  /* messages */
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = FONT(11 * f);
  if (!warnings.length) {
    ctx.fillStyle = '#22c55e'; ctx.fillText('NO WARNING', W * 0.06, H * 0.91);
  } else {
    warnings.slice(0, 2).forEach((w, i) => {
      const flash = w.sev === 'red' ? Math.sin(t * 8) > -0.2 : true;
      ctx.fillStyle = flash ? (w.sev === 'red' ? '#ef4444' : '#f59e0b') : '#4b1d1d';
      ctx.fillText(`● ${w.text}`, W * 0.06, H * 0.87 + i * 16 * f);
    });
  }
}

/* ---------------------------------------------------------- */
/* Ecran de navigation : rose des caps, vitesse sol, vent */
export function drawNav(ctx, W, H, ac, t, wind) {
  const f = W / 320;
  const hdg = ac.heading;
  ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0e7490'; ctx.fillRect(0, 0, W, 20 * f);
  ctx.fillStyle = '#e0f2fe'; ctx.font = FONT(12 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('NAV', W / 2, 11 * f);

  const cx = W / 2, cy = H * 0.52, R = W * 0.33;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-hdg * DEG);
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5 * f;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.font = FONT(11 * f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    ctx.save(); ctx.rotate(d * DEG);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1.3 * f;
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, -R + (d % 30 === 0 ? 9 : 5) * f); ctx.stroke();
    if (d % 30 === 0) {
      const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
      ctx.fillStyle = d % 90 === 0 ? '#facc15' : '#e5e7eb';
      ctx.fillText(lbl, 0, -R + 20 * f);
    }
    ctx.restore();
  }
  ctx.restore();
  /* triangle avion */
  ctx.fillStyle = '#facc15';
  ctx.beginPath(); ctx.moveTo(cx, cy - 12 * f); ctx.lineTo(cx - 8 * f, cy + 9 * f); ctx.lineTo(cx, cy + 4 * f); ctx.lineTo(cx + 8 * f, cy + 9 * f); ctx.closePath(); ctx.fill();
  /* repere de cap */
  ctx.fillStyle = '#4ade80';
  ctx.beginPath(); ctx.moveTo(cx, cy - R - 2 * f); ctx.lineTo(cx - 5 * f, cy - R - 10 * f); ctx.lineTo(cx + 5 * f, cy - R - 10 * f); ctx.fill();

  /* donnees */
  const gs = Math.hypot(ac.vel.x, ac.vel.z) * KTS;
  ctx.font = FONT(11 * f); ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.fillText('GS', W * 0.04, H * 0.13);
  ctx.fillStyle = '#4ade80'; ctx.fillText(String(Math.round(gs)), W * 0.04 + 22 * f, H * 0.13);
  ctx.fillStyle = '#94a3b8'; ctx.fillText('TAS', W * 0.04, H * 0.13 + 14 * f);
  ctx.fillStyle = '#4ade80'; ctx.fillText(String(Math.round(ac.tas * KTS)), W * 0.04 + 28 * f, H * 0.13 + 14 * f);
  ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.fillText('HDG', W * 0.90, H * 0.13);
  ctx.fillStyle = '#4ade80'; ctx.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), W * 0.97, H * 0.13);
  if (wind) {
    const sp = Math.hypot(wind.x, wind.z) * KTS;
    const from = (Math.atan2(wind.x, -wind.z) / DEG + 180 + 360) % 360;
    ctx.fillStyle = '#94a3b8'; ctx.fillText('WIND', W * 0.90, H * 0.13 + 14 * f);
    ctx.fillStyle = '#e5e7eb'; ctx.fillText(`${String(Math.round(from)).padStart(3, '0')}/${Math.round(sp)}`, W * 0.97, H * 0.13 + 14 * f);
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8'; ctx.font = FONT(10 * f);
  ctx.fillText(ac.onGround ? 'AU SOL' : `${Math.round(ac.pos.y * FT)} FT`, W / 2, H * 0.965);
}

/* ---------------------------------------------------------- */
/* Petits utilitaires de construction */
function mat(color, rough = 0.7, metal = 0.15, lift = 0.12) {
  return new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal,
    emissive: color, emissiveIntensity: lift, envMapIntensity: 0.5
  });
}
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);

function makeScreen(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return { canvas, ctx: canvas.getContext('2d'), tex, mat: m };
}

/* Texture statique du panneau plafonnier : rangees de boutons voyants. */
function makeOverheadTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2028'; g.fillRect(0, 0, 512, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const labels = ['ADIRS', 'FUEL', 'HYD', 'ELEC', 'APU', 'AIR', 'ANTI ICE', 'EVAC', 'LIGHTS', 'FIRE'];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 10; k++) {
      const x = 14 + k * 49, y = 14 + r * 60;
      g.fillStyle = '#10141a'; g.fillRect(x, y, 42, 46);
      g.strokeStyle = '#2f3846'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, 41, 45);
      const on = rnd() > 0.35;
      g.fillStyle = on ? (rnd() > 0.7 ? '#38bdf8' : '#22c55e') : '#334155';
      g.fillRect(x + 8, y + 22, 26, 16);
      g.fillStyle = '#94a3b8'; g.font = 'bold 8px monospace'; g.textAlign = 'center';
      g.fillText(labels[(k + r * 3) % labels.length], x + 21, y + 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Texture du tableau de bord : plaque grise avec reperes des ecrans. */
function makePanelTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#2a313c'); grd.addColorStop(1, '#171b22');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 128); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------- */
export function buildCockpit() {
  const group = new THREE.Group();
  group.name = 'cockpit';
  group.visible = false;

  const M = {
    shell: mat(0x323b48, 0.85, 0.1, 0.25),
    dark: mat(0x1d232c, 0.8, 0.2, 0.3),
    trim: mat(0x4a5565, 0.55, 0.45, 0.18),
    floor: mat(0x20242b, 0.95, 0.0, 0.3),
    fabric: mat(0x2c3b56, 0.95, 0.0, 0.2),
    leather: mat(0x141820, 0.7, 0.1, 0.2),
    metal: mat(0xb3bcc8, 0.3, 0.9, 0.1),
    knob: mat(0x090b0e, 0.5, 0.3, 0.1),
    red: mat(0xdc2626, 0.5, 0.1, 0.4),
    warnRed: new THREE.MeshBasicMaterial({ color: 0x3a0a0a, toneMapped: false }),
    warnAmber: new THREE.MeshBasicMaterial({ color: 0x3a2a05, toneMapped: false }),
    gearGreen: new THREE.MeshBasicMaterial({ color: 0x0d3b1a, toneMapped: false }),
    gearRed: new THREE.MeshBasicMaterial({ color: 0x3a0a0a, toneMapped: false }),
    parkLight: new THREE.MeshBasicMaterial({ color: 0x3a0a0a, toneMapped: false })
  };
  const panelTex = makePanelTexture();
  const panelFace = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.75, metalness: 0.15, emissive: 0x161b22, envMapIntensity: 0.4 });

  const EX = COCKPIT_EYE.x;          // axe du siege gauche
  const SEAT_X = [EX, -EX];

  /* ---- Coque : sol, parois, cloison arriere, pavillon ---- */
  group.add(box(2.6, 0.1, 4.0, M.floor, 0, 0.02, -14.0));
  group.add(box(0.12, 0.98, 3.4, M.shell, -1.24, 0.5, -14.0));            // sous les vitres lat.
  group.add(box(0.12, 0.98, 3.4, M.shell, 1.24, 0.5, -14.0));
  group.add(box(0.12, 2.05, 0.9, M.shell, -1.24, 1.0, -12.75));           // montant arriere
  group.add(box(0.12, 2.05, 0.9, M.shell, 1.24, 1.0, -12.75));
  group.add(box(2.6, 2.1, 0.12, M.shell, 0, 1.03, -12.3));                // cloison arriere
  group.add(box(0.9, 1.5, 0.05, M.trim, 0, 0.9, -12.22));                 // porte de cabine
  group.add(box(0.12, 0.12, 3.4, M.dark, -1.24, 2.0, -14.0));             // traverses de toit
  group.add(box(0.12, 0.12, 3.4, M.dark, 1.24, 2.0, -14.0));
  group.add(box(2.6, 0.1, 3.3, M.shell, 0, 2.05, -13.75));                // pavillon

  /* ---- Tableau de bord (incline vers le pilote) ---- */
  const panel = new THREE.Group();
  panel.position.set(0, 0.68, -15.0);
  panel.rotation.x = -0.5;
  group.add(panel);
  panel.add(mesh(new THREE.BoxGeometry(2.5, 0.78, 0.12), panelFace, 0, 0, 0));

  const screenDefs = [
    { key: 'pfd', x: -0.42, draw: drawPFD },
    { key: 'eng', x: 0.0, draw: drawEngine },
    { key: 'nav', x: 0.42, draw: drawNav }
  ];
  const screens = {};
  screenDefs.forEach(d => {
    const s = makeScreen(256);
    s.draw = d.draw;
    screens[d.key] = s;
    panel.add(box(0.41, 0.41, 0.03, M.dark, d.x, 0.05, 0.065));           // cadre
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.385, 0.385), s.mat);
    plane.position.set(d.x, 0.05, 0.083);
    panel.add(plane);
  });
  /* ecran secondaire (PFD copilote) : reutilise la meme texture que le PFD */
  {
    const bez = box(0.41, 0.41, 0.03, M.dark, 0.84, 0.05, 0.065);
    panel.add(bez);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.385, 0.385), screens.pfd.mat);
    plane.position.set(0.84, 0.05, 0.083);
    panel.add(plane);
  }
  /* cote gauche : instrument de secours (petit horizon repris du PFD) */
  {
    const bez = box(0.24, 0.24, 0.03, M.dark, -0.98, 0.10, 0.065);
    panel.add(bez);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.21), screens.pfd.mat);
    plane.position.set(-0.98, 0.10, 0.083);
    panel.add(plane);
  }
  /* boutons du bas de tableau de bord */
  for (let i = 0; i < 14; i++) {
    const b = box(0.05, 0.03, 0.03, i % 3 === 0 ? M.trim : M.knob, -0.75 + i * 0.115, -0.27, 0.08);
    panel.add(b);
  }

  /* ---- Glareshield, montants de pare-brise ---- */
  const glare = box(2.5, 0.05, 0.20, M.dark, 0, 1.06, -15.10);
  glare.rotation.x = 0.25;
  group.add(glare);
    group.add(box(0.05, 0.98, 0.06, M.dark, 0.0, 1.55, -15.35));            // montant central
  group.add(box(0.09, 1.0, 0.12, M.dark, -1.2, 1.5, -14.75));             // montants lateraux
  group.add(box(0.09, 1.0, 0.12, M.dark, 1.2, 1.5, -14.75));
  group.add(box(2.5, 0.13, 0.20, M.dark, 0, 2.03, -14.98));               // bandeau haut du pare-brise

  /* voyants MASTER WARN / CAUTION */
  const warnRed = mesh(new THREE.BoxGeometry(0.07, 0.02, 0.05), M.warnRed, -0.92, 1.10, -15.06);
  const warnAmber = mesh(new THREE.BoxGeometry(0.07, 0.02, 0.05), M.warnAmber, -0.82, 1.10, -15.06);
  warnRed.rotation.x = warnAmber.rotation.x = 0.25;
  group.add(warnRed, warnAmber);

  /* ---- Plafonnier ---- */
  const ovTex = makeOverheadTexture();
  const ov = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshStandardMaterial({ map: ovTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: ovTex, emissiveIntensity: 0.55 }));
  ov.position.set(0, 1.99, -14.35);
  ov.rotation.x = Math.PI / 2 - 0.32;
  group.add(ov);

  /* ---- Piedestal central ---- */
  const ped = box(0.36, 0.52, 1.5, M.shell, 0, 0.3, -14.1);
  group.add(ped);
  group.add(box(0.38, 0.03, 1.5, M.trim, 0, 0.565, -14.1));

  /* manettes des gaz (deux leviers) */
  const throttles = [];
  [-0.055, 0.055].forEach(x => {
    const piv = new THREE.Group();
    piv.position.set(x, 0.58, -14.72);
    const lever = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 8), M.metal, 0, 0.14, 0);
    const knob = box(0.05, 0.075, 0.06, M.knob, 0, 0.30, 0);
    piv.add(lever, knob);
    group.add(piv);
    throttles.push(piv);
  });
  /* rainure des manettes */
  group.add(box(0.2, 0.004, 0.36, M.dark, 0, 0.583, -14.58));

  /* aerofreins */
  const spdPiv = new THREE.Group();
  spdPiv.position.set(-0.13, 0.58, -14.55);
  spdPiv.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), M.metal, 0, 0.1, 0));
  spdPiv.add(box(0.03, 0.035, 0.035, M.red, 0, 0.21, 0));
  group.add(spdPiv);

  /* volets */
  const flapPiv = new THREE.Group();
  flapPiv.position.set(0.13, 0.58, -14.5);
  flapPiv.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), M.metal, 0, 0.1, 0));
  flapPiv.add(box(0.06, 0.03, 0.03, M.knob, 0, 0.21, 0));
  group.add(flapPiv);

  /* frein de parc + voyant */
  const parkKnob = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12), M.red, 0.0, 0.6, -14.28);
  group.add(parkKnob);
  const parkLamp = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.03), M.parkLight, 0.0, 0.575, -14.2);
  group.add(parkLamp);

  /* levier de train sous l'ecran moteurs */
  const gearHousing = box(0.12, 0.10, 0.05, M.dark, 0.0, -0.20, 0.07);
  panel.add(gearHousing);
  const gearLever = new THREE.Group();
  gearLever.position.set(0, -0.20, 0.10);
  gearLever.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), M.metal, 0, 0, 0.04).rotateX(Math.PI / 2));
  const gearWheel = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), M.knob, 0, 0, 0.09);
  gearWheel.rotation.x = Math.PI / 2;
  gearLever.add(gearWheel);
  panel.add(gearLever);
  const gearLamps = [-0.045, 0, 0.045].map(x => {
    const l = mesh(new THREE.BoxGeometry(0.025, 0.02, 0.01), M.gearGreen, x - 0.16, -0.20, 0.085);
    panel.add(l);
    return l;
  });

  /* ---- Sieges ---- */
  SEAT_X.forEach(sx => {
    group.add(box(0.5, 0.12, 0.52, M.fabric, sx, 0.5, -13.95));
    group.add(box(0.5, 0.78, 0.13, M.fabric, sx, 0.95, -13.68));
    group.add(box(0.3, 0.22, 0.10, M.leather, sx, 1.44, -13.66));
    group.add(box(0.05, 0.05, 0.36, M.trim, sx + (sx < 0 ? -0.27 : 0.27), 0.72, -13.95));
    group.add(box(0.06, 0.48, 0.06, M.trim, sx, 0.25, -13.95));
  });

  /* ---- Volants ---- */
  const wheels = [];
  SEAT_X.forEach((sx, i) => {
    const yoke = new THREE.Group();
    yoke.position.set(sx, 0.40, -14.9);
    yoke.rotation.x = -0.5;
    group.add(yoke);
    const shaft = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.45, 10), M.metal, 0, 0, 0.22);
    shaft.rotation.x = Math.PI / 2;
    yoke.add(shaft);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0, 0.46);
    yoke.add(wheel);
    wheel.add(mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 28), M.knob));
    wheel.add(box(0.32, 0.02, 0.02, M.knob, 0, 0, 0));
    wheel.add(box(0.02, 0.16, 0.02, M.knob, 0, -0.08, 0));
    const hub = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), M.trim);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheel.add(box(0.05, 0.06, 0.04, M.knob, -0.165, 0.0, 0));
    wheel.add(box(0.05, 0.06, 0.04, M.knob, 0.165, 0.0, 0));
    wheels.push({ yoke, wheel, base: yoke.position.z });
  });

  /* ---- Eclairage d'ambiance de la cabine de pilotage ---- */
  const light = new THREE.PointLight(0xdfe9ff, 2.4 * LIGHT_GAIN, 5.5, 1.6);
  light.position.set(0, 1.7, -14.2);
  group.add(light);

  /* ---------------------------------------------------------- */
  let acc = 1;
  const lastWarn = { text: '' };

  function update(ac, dt, t, extraWarn) {
    /* --- Ecrans : redessines ~14 fois par seconde --- */
    acc += dt;
    if (acc > 0.07) {
      acc = 0;
      const warnings = collectWarnings(ac, extraWarn);
      lastWarn.list = warnings;
      screens.pfd.draw(screens.pfd.ctx, 256, 256, ac, t);
      screens.eng.draw(screens.eng.ctx, 256, 256, ac, t, warnings);
      screens.nav.draw(screens.nav.ctx, 256, 256, ac, t, ac.wind);
      screens.pfd.tex.needsUpdate = true;
      screens.eng.tex.needsUpdate = true;
      screens.nav.tex.needsUpdate = true;
    }

    /* --- Voyants MASTER --- */
    const list = lastWarn.list || [];
    const hasRed = list.some(w => w.sev === 'red');
    const hasAmber = list.some(w => w.sev === 'amber');
    const blink = Math.sin(t * 8) > 0;
    warnRed.material.color.setHex(hasRed && blink ? 0xff2a2a : 0x3a0a0a);
    warnAmber.material.color.setHex(hasAmber && blink ? 0xffb020 : 0x3a2a05);

    /* --- Manettes : de ralenti (tirees vers le pilote) a TOGA --- */
    const thr = clamp(ac.ctl.throttle, 0, 1);
    const ang = ac.reverse ? 1.2 : THREE.MathUtils.lerp(0.75, -0.3, thr);
    throttles.forEach(p => { p.rotation.x = THREE.MathUtils.lerp(p.rotation.x, ang, Math.min(1, dt * 14)); });
    spdPiv.rotation.x = THREE.MathUtils.lerp(spdPiv.rotation.x, ac.spoilers ? 0.7 : -0.15, Math.min(1, dt * 10));
    flapPiv.rotation.x = THREE.MathUtils.lerp(flapPiv.rotation.x, 0.55 - (ac.flapIndex / 4) * 1.1, Math.min(1, dt * 10));

    /* --- Frein de parc --- */
    parkKnob.position.y = ac.parkBrake ? 0.585 : 0.605;
    parkLamp.material.color.setHex(ac.parkBrake ? 0xff3030 : 0x3a0a0a);

    /* --- Levier de train et voyants (vert = sorti, rouge = en transit) --- */
    gearLever.position.y = -0.20 + (ac.gearDown ? -0.028 : 0.028);
    gearLamps.forEach(l => l.material.color.setHex(ac.gearDown ? 0x22ff66 : 0x0d3b1a));

    /* --- Volants : le gauche suit le pilote, le droit l'imite --- */
    const rollAng = -ac.ctl.roll * 1.15 * (ROLL_SIGN);
    wheels.forEach(w => {
      w.wheel.rotation.z = THREE.MathUtils.lerp(w.wheel.rotation.z, rollAng, Math.min(1, dt * 12));
      /* tirer = le volant vient vers le pilote (+z local du support) */
      const pull = ac.ctl.pitch * 0.055;
      w.yoke.position.z = w.base + pull;
    });
  }

  return { group, update, light, screens };
}

/* Sens du volant selon le signe de ctl.roll. +1 : ctl.roll > 0 = roulis
   a droite (aile droite basse) ; le volant tourne alors dans le sens
   horaire vu du pilote. Ajuste apres test dans le simulateur. */
const ROLL_SIGN = 1;
