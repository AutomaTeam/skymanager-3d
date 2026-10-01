/* ============================================================
   textures.js — Bibliotheque de textures procedurales
   ------------------------------------------------------------
   Toutes les textures du jeu sont generees au demarrage sur des
   canvas 2D : aucun fichier image a charger, donc aucun aller-
   retour reseau et un poids de page inchange. Le rendu gagne en
   richesse (grain, joints, rivets, usure) sans cout de telechar-
   gement.

   Chaque generateur renvoie un objet { map, normalMap?, ... } de
   CanvasTexture deja configurees (wrapping, repetition, espace
   colorimetrique). Les resultats sont memorises : deux appels au
   meme generateur renvoient les memes instances, ce qui permet de
   partager une texture entre plusieurs materiaux sans dupliquer
   la memoire GPU.

   Contraintes de performance (iPad/iPhone Safari) : les textures
   restent en 256 ou 512 px, et les cartes de normales ne sont
   generees que la ou elles apportent vraiment quelque chose
   (revetements, metal, pneus).
   ============================================================ */

import * as THREE from 'three';

/* ---------------------------------------------------------- */
/* Outils de base                                             */
/* ---------------------------------------------------------- */

/* PRNG deterministe : les textures sont identiques d'un
   chargement a l'autre, ce qui evite les surprises visuelles et
   rend les captures comparables. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* Bruit de valeur lisse et raccordable (la derniere ligne et la
   derniere colonne de la grille recopient la premiere, donc la
   texture se repete sans couture visible). */
function valueNoise(w, h, cells, rnd) {
  const gw = cells + 1;
  const grid = new Float32Array(gw * gw);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) grid[y * gw + x] = rnd();
  }
  for (let i = 0; i < cells; i++) {
    grid[i * gw + cells] = grid[i * gw];
    grid[cells * gw + i] = grid[i];
  }
  grid[cells * gw + cells] = grid[0];

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cells, y0 = Math.floor(fy), ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells, x0 = Math.floor(fx), tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const i00 = grid[y0 * gw + x0], i10 = grid[y0 * gw + x0 + 1];
      const i01 = grid[(y0 + 1) * gw + x0], i11 = grid[(y0 + 1) * gw + x0 + 1];
      const a = i00 + (i10 - i00) * sx;
      const b = i01 + (i11 - i01) * sx;
      out[y * w + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/* Somme de plusieurs octaves de bruit : c'est ce qui donne aux
   surfaces leur aspect "naturel" plutot que celui d'un damier. */
function fbm(w, h, octaves, baseCells, rnd) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(w, h, cells, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* Remplit un canvas pixel par pixel. `fn` renvoie [r,g,b] ou
   [r,g,b,a] dans 0..255. */
function paint(w, h, fn) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rgb = fn(x, y, x / w, y / h);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      d[i + 3] = rgb.length > 3 ? rgb[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, ctx: g };
}

/* Carte de normales derivee d'une carte de hauteur (luminance).
   C'est ce qui fait "accrocher" la lumiere sur le grain du
   bitume, les joints de dalle ou les rivets. */
function normalFromHeight(srcCanvas, strength = 2.2) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  const { canvas, ctx } = paint(w, h, (x, y) => {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    let nx = -dx, ny = -dy, nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });
  return canvas;
}

/* ---------------------------------------------------------- */
/* Configuration globale                                     */
/* ---------------------------------------------------------- */

let MAX_ANISO = 4;
export function configureTextures(renderer) {
  if (renderer && renderer.capabilities) {
    MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 4);
  }
}

function tex(canvas, { repeat = [1, 1], srgb = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (aniso) t.anisotropy = MAX_ANISO;
  t.needsUpdate = true;
  return t;
}

/* Memoisation : un generateur n'est execute qu'une fois. */
const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function disposeTextures() {
  for (const v of cache.values()) {
    for (const k in v) if (v[k] && v[k].isTexture) v[k].dispose();
  }
  cache.clear();
}

/* ---------------------------------------------------------- */
/* 1. Sol naturel                                            */
/* ------------------------------------------------------------
   Prairie : trois echelles de bruit (grandes taches, touffes,
   grain fin) plus des bandes de fauche tres peu contrastees, qui
   donnent l'echelle au sol quand on roule. */
export const grass = () => once('grass', () => {
  const S = 512;
  const rnd = mulberry32(1337);
  const big = fbm(S, S, 3, 3, rnd);
  const mid = fbm(S, S, 4, 12, rnd);
  const fine = fbm(S, S, 3, 48, rnd);

  const { canvas, ctx } = paint(S, S, (x, y) => {
    const b = big[y * S + x], m = mid[y * S + x], f = fine[y * S + x];
    /* Teinte : vert olive qui vire au jaune sur les zones seches. */
    /* Vert frais « colore doux » (plan graphisme) : plus clair et plus saturé qu'avant. */
    const dry = Math.max(0, b - 0.62) * 1.0;
    const shade = 0.66 + b * 0.28 + m * 0.20 + f * 0.14;
    const r = (66 + dry * 50) * shade;
    const g = (114 + dry * 22) * shade;
    const bl = (46 + dry * 6) * shade;
    return [r, g, bl];
  });

  /* Bandes de fauche : deux passages croises, tres subtils. */
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * (S / 8), S, S / 16);
  ctx.globalAlpha = 1;

  /* Touffes : petits traits verticaux pour casser la regularite. */
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.strokeStyle = `rgba(${40 + rnd() * 60 | 0},${80 + rnd() * 70 | 0},${30 + rnd() * 40 | 0},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
    ctx.stroke();
  }

  return {
    map: tex(canvas, { repeat: [180, 180] }),
    normalMap: tex(normalFromHeight(canvas, 1.1), { repeat: [180, 180], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 2. Piste : bitume + gomme de pneus                        */
/* ------------------------------------------------------------
   La piste est un plan 45 x 3000 m : la texture se repete 1 fois
   en travers et 40 fois en long. On dessine donc un motif large
   en travers (traces de roues) et fin en long (grain). */
export const runway = () => once('runway', () => {
  const W = 256, H = 512;
  const rnd = mulberry32(4242);
  const grain = fbm(W, H, 4, 16, rnd);
  const patch = fbm(W, H, 3, 4, rnd);

  const { canvas, ctx } = paint(W, H, (x, y) => {
    const g = grain[y * W + x], p = patch[y * W + x];
    /* Bitume gris-bleu, plus clair sur les reprises de revetement. */
    const base = 40 + p * 16 + g * 26;
    return [base * 0.98, base, base * 1.06];
  });

  /* Granulats : milliers de petits eclats clairs et sombres. */
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W, y = rnd() * H;
    const v = rnd();
    ctx.fillStyle = v > 0.5
      ? `rgba(190,196,205,${0.05 + rnd() * 0.16})`
      : `rgba(12,14,18,${0.06 + rnd() * 0.20})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(x, y, s, s);
  }

  /* Traces de gomme : deux bandes longitudinales usees par les
     trains principaux, plus marquees au point de toucher. */
  const band = (cx, halfW, alpha) => {
    const grd = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    grd.addColorStop(0, `rgba(10,10,12,0)`);
    grd.addColorStop(0.5, `rgba(10,10,12,${alpha})`);
    grd.addColorStop(1, `rgba(10,10,12,0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(cx - halfW, 0, halfW * 2, H);
  };
  band(W * 0.30, W * 0.10, 0.30);
  band(W * 0.70, W * 0.10, 0.30);

  /* Fissures : polylignes fines et anguleuses. */
  ctx.strokeStyle = 'rgba(8,9,12,0.55)';
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = 0.6 + rnd() * 1.1;
    let x = rnd() * W, y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (rnd() - 0.5) * 26;
      y += (rnd() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* Joints de dalle transversaux, tous les 1/4 de la tuile. */
  ctx.strokeStyle = 'rgba(20,22,26,0.5)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const y = i * (H / 4) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  return {
    map: tex(canvas, { repeat: [1, 40] }),
    normalMap: tex(normalFromHeight(canvas, 2.6), { repeat: [1, 40], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 3. Aire de trafic : dalles de beton                       */
/* ---------------------------------------------------------- */
export const apron = () => once('apron', () => {
  const S = 512;
  const rnd = mulberry32(909);
  const grain = fbm(S, S, 4, 20, rnd);
  const stain = fbm(S, S, 3, 5, rnd);

  const { canvas, ctx } = paint(S, S, (x, y) => {
    const g = grain[y * S + x], s = stain[y * S + x];
    const base = 104 + g * 24 + s * 16;      // beton clair (etait 52 : trop sombre)
    return [base * 1.0, base * 1.0, base * 1.02];
  });

  for (let i = 0; i < 6000; i++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = rnd() > 0.5
      ? `rgba(210,214,220,${0.04 + rnd() * 0.12})`
      : `rgba(16,18,22,${0.05 + rnd() * 0.16})`;
    ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }

  /* Dalles de 4 x 4 m : joints creux + chanfrein clair. */
  const cell = S / 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * cell;
    ctx.strokeStyle = 'rgba(14,16,20,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,196,204,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p + 2, 0); ctx.lineTo(p + 2, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p + 2); ctx.lineTo(S, p + 2); ctx.stroke();
  }

  /* Taches d'hydrocarbures : ellipses sombres et floues. */
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 26;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(8,9,11,${0.18 + rnd() * 0.22})`);
    grd.addColorStop(1, 'rgba(8,9,11,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 6.283); ctx.fill();
  }

  return {
    map: tex(canvas, { repeat: [10, 6] }),
    normalMap: tex(normalFromHeight(canvas, 2.0), { repeat: [10, 6], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 4. Beton generique (socles, murets, tour)                 */
/* ---------------------------------------------------------- */
export const concrete = () => once('concrete', () => {
  const S = 256;
  const rnd = mulberry32(77);
  const n = fbm(S, S, 4, 10, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 150 + v * 46;
    return [base, base * 0.995, base * 0.97];
  });
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 40},${rnd() > 0.5 ? 255 : 40},${rnd() > 0.5 ? 255 : 40},${0.03 + rnd() * 0.07})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  /* Traces de banches : lignes horizontales legeres. */
  ctx.strokeStyle = 'rgba(120,124,130,0.22)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke();
  }
  return {
    map: tex(canvas, { repeat: [3, 3] }),
    normalMap: tex(normalFromHeight(canvas, 1.4), { repeat: [3, 3], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 5. Metal brosse a panneaux (nacelles, mats, equipements)  */
/* ---------------------------------------------------------- */
export const metal = () => once('metal', () => {
  const S = 256;
  const rnd = mulberry32(2024);
  const n = fbm(S, S, 3, 8, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 138 + v * 34;
    return [base, base * 1.01, base * 1.04];
  });

  /* Brosse : fines rayures horizontales. */
  for (let i = 0; i < 3000; i++) {
    const y = rnd() * S;
    ctx.strokeStyle = `rgba(${rnd() > 0.5 ? 235 : 90},${rnd() > 0.5 ? 238 : 94},${rnd() > 0.5 ? 245 : 100},${0.03 + rnd() * 0.09})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(rnd() * S, y);
    ctx.lineTo(rnd() * S, y + (rnd() - 0.5) * 1.5);
    ctx.stroke();
  }

  /* Panneaux + rivets : c'est ce qui donne l'echelle industrielle. */
  ctx.strokeStyle = 'rgba(70,76,84,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke();
  }
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(i * S / 3, 0); ctx.lineTo(i * S / 3, S); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const y = i * S / 4 + 5;
    for (let x = 6; x < S; x += 11) {
      ctx.fillStyle = 'rgba(96,102,110,0.6)';
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(230,234,240,0.35)';
      ctx.beginPath(); ctx.arc(x - 0.4, y - 0.4, 0.6, 0, 6.283); ctx.fill();
    }
  }
  return {
    map: tex(canvas, { repeat: [2, 2] }),
    normalMap: tex(normalFromHeight(canvas, 2.4), { repeat: [2, 2], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 6. Peau d'avion : panneaux, rivets, coulures              */
/* ------------------------------------------------------------
   Le fuselage est une capsule : u fait le tour, v va le long.
   Les lignes a v constant deviennent donc des cerclages, celles a
   u constant des lignes longitudinales. */
export const skin = () => once('skin', () => {
  const W = 512, H = 512;
  const rnd = mulberry32(555);
  const n = fbm(W, H, 3, 6, rnd);
  const { canvas, ctx } = paint(W, H, (x, y) => {
    const v = n[y * W + x];
    const base = 232 + v * 18;
    return [base, base * 1.005, base * 1.01];
  });

  /* Cerclages : joints entre troncons de fuselage. */
  ctx.strokeStyle = 'rgba(150,158,168,0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 1; i < 8; i++) {
    const y = i * H / 8;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + 1.6); ctx.lineTo(W, y + 1.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,158,168,0.55)';
    ctx.lineWidth = 1.6;
  }

  /* Lignes longitudinales. */
  ctx.strokeStyle = 'rgba(158,166,176,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const x = i * W / 12;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  /* Rivets le long des cerclages. */
  for (let i = 1; i < 8; i++) {
    const y = i * H / 8;
    for (let x = 4; x < W; x += 7) {
      ctx.fillStyle = 'rgba(168,176,186,0.55)';
      ctx.beginPath(); ctx.arc(x, y - 3, 0.9, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(x - 0.3, y - 3.3, 0.5, 0, 6.283); ctx.fill();
    }
  }

  /* Trainees d'ecoulement sous les joints : usure realiste. */
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H;
    const len = 8 + rnd() * 46;
    const grd = ctx.createLinearGradient(0, y, 0, y + len);
    grd.addColorStop(0, `rgba(120,126,134,${0.05 + rnd() * 0.10})`);
    grd.addColorStop(1, 'rgba(120,126,134,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, 1 + rnd() * 2.5, len);
  }

  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 1.6), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 7. Bandeau de hublots                                     */
/* ------------------------------------------------------------
   Texture a transparence : les hublots sont opaques et sombres,
   le reste est transparent, ce qui laisse voir la peau dessous.
   Posee sur un cylindre ouvert autour du fuselage. */
export const windows = () => once('windows', () => {
  const W = 1024, H = 64;
  const { canvas, ctx } = paint(W, H, () => [0, 0, 0, 0]);

  const count = 26;
  const pitch = W / count;
  for (let i = 0; i < count; i++) {
    const cx = i * pitch + pitch / 2;
    const cy = H / 2;
    const rx = pitch * 0.26, ry = H * 0.30;

    /* Cadre metallique. */
    ctx.fillStyle = 'rgba(196,202,210,0.95)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 2.2, ry + 2.2, 0, 0, 6.283); ctx.fill();

    /* Vitre : degrade bleu-nuit, reflet en haut a gauche. */
    const grd = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    grd.addColorStop(0, '#1b3a55');
    grd.addColorStop(0.45, '#0d1f30');
    grd.addColorStop(1, '#050c14');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283); ctx.fill();

    ctx.fillStyle = 'rgba(180,215,245,0.30)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.30, cy - ry * 0.34, rx * 0.42, ry * 0.30, -0.5, 0, 6.283);
    ctx.fill();
  }
  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 8. Livree : bande d'accent degradee                       */
/* ---------------------------------------------------------- */
export const livery = () => once('livery', () => {
  const W = 256, H = 128;
  const { canvas, ctx } = paint(W, H, (x, y) => {
    const t = y / H;
    /* Bleu profond vers cyan, avec un liseré clair en bas. */
    const r = 12 + t * 10;
    const g = 96 + t * 60;
    const b = 176 + t * 40;
    return [r, g, b];
  });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, H - 6, W, 3);
  ctx.fillStyle = 'rgba(6,20,40,0.5)';
  ctx.fillRect(0, 0, W, 3);
  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 9. Nacelle : metal chauffe et suie                        */
/* ---------------------------------------------------------- */
export const turbine = () => once('turbine', () => {
  const W = 256, H = 256;
  const rnd = mulberry32(31337);
  const n = fbm(W, H, 4, 8, rnd);
  const { canvas, ctx } = paint(W, H, (x, y, u, v) => {
    const g = n[y * W + x];
    /* v = 0 a l'entree d'air, v = 1 a la sortie : la tuyere
       bleuit puis jaunit sous l'effet de la chaleur. */
    const heat = Math.max(0, v - 0.55) / 0.45;
    const base = 150 + g * 40;
    const r = base + heat * 46;
    const gg = base + heat * 16;
    const b = base * 1.03 - heat * 34;
    return [r, gg, b];
  });

  /* Suie : depot sombre cote tuyere. */
  for (let i = 0; i < 700; i++) {
    const y = H * 0.55 + rnd() * H * 0.45;
    ctx.fillStyle = `rgba(24,22,20,${0.03 + rnd() * 0.12})`;
    ctx.fillRect(rnd() * W, y, 1 + rnd() * 4, 1 + rnd() * 3);
  }

  /* Panneaux et rivets. */
  ctx.strokeStyle = 'rgba(80,86,94,0.5)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * H / 4); ctx.lineTo(W, i * H / 4); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const y = i * H / 4 + 4;
    for (let x = 5; x < W; x += 9) {
      ctx.fillStyle = 'rgba(104,110,118,0.55)';
      ctx.beginPath(); ctx.arc(x, y, 1, 0, 6.283); ctx.fill();
    }
  }
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 2.0), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 10. Disque de soufflante                                  */
/* ---------------------------------------------------------- */
export const fanDisc = () => once('fanDisc', () => {
  const S = 256;
  const rnd = mulberry32(8080);
  const { canvas, ctx } = paint(S, S, () => [58, 62, 68]);
  const c = S / 2;

  /* 22 aubes rayonnantes, chacune avec son ombre portee. */
  const blades = 22;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * 6.283;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const grd = ctx.createLinearGradient(0, -c, 0, c);
    grd.addColorStop(0, '#8f98a3');
    grd.addColorStop(0.5, '#5d666f');
    grd.addColorStop(1, '#3d444c');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, -c * 0.22);
    ctx.lineTo(c * 0.16, -c * 0.95);
    ctx.lineTo(c * 0.30, -c * 0.95);
    ctx.lineTo(c * 0.10, -c * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,26,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /* Cone central + boulonnerie. */
  const grd = ctx.createRadialGradient(c, c, 0, c, c, c * 0.24);
  grd.addColorStop(0, '#c8ced6');
  grd.addColorStop(1, '#6b737c');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(c, c, c * 0.24, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(30,34,40,0.7)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * c * 0.17, c + Math.sin(a) * c * 0.17, 2.2, 0, 6.283);
    ctx.fill();
  }
  /* Spirale de securite peinte sur le cone. */
  ctx.strokeStyle = 'rgba(240,244,250,0.75)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let t = 0; t < 6.283 * 2.2; t += 0.1) {
    const r = c * 0.05 + t * 2.4;
    if (r > c * 0.22) break;
    const x = c + Math.cos(t) * r, y = c + Math.sin(t) * r;
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 11. Pneu : gomme + sculpture                              */
/* ---------------------------------------------------------- */
export const tire = () => once('tire', () => {
  const W = 128, H = 128;
  const rnd = mulberry32(606);
  const n = fbm(W, H, 3, 10, rnd);
  const { canvas, ctx } = paint(W, H, (x, y) => {
    const v = n[y * W + x];
    const base = 22 + v * 16;
    return [base, base, base * 1.05];
  });
  /* Sculpture : stries obliques. */
  ctx.strokeStyle = 'rgba(6,6,8,0.85)';
  ctx.lineWidth = 3;
  for (let i = -H; i < W + H; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H * 0.5, H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,124,130,0.18)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i + 2, 0);
    ctx.lineTo(i + 2 + H * 0.5, H);
    ctx.stroke();
  }
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 2.6), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 12. Facade de terminal : panneaux et joints               */
/* ---------------------------------------------------------- */
export const facade = () => once('facade', () => {
  const W = 512, H = 256;
  const rnd = mulberry32(1212);
  const n = fbm(W, H, 3, 8, rnd);
  const { canvas, ctx } = paint(W, H, (x, y) => {
    const v = n[y * W + x];
    const base = 176 + v * 26;
    return [base * 0.98, base, base * 1.03];
  });

  /* Trames de panneaux : 8 x 4. */
  const cw = W / 8, ch = H / 4;
  for (let i = 0; i <= 8; i++) {
    ctx.strokeStyle = 'rgba(120,128,138,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(i * cw + 2, 0); ctx.lineTo(i * cw + 2, H); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    ctx.strokeStyle = 'rgba(120,128,138,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, i * ch); ctx.lineTo(W, i * ch); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, i * ch + 2); ctx.lineTo(W, i * ch + 2); ctx.stroke();
  }

  /* Salissure en pied de facade. */
  const grd = ctx.createLinearGradient(0, H * 0.72, 0, H);
  grd.addColorStop(0, 'rgba(90,94,100,0)');
  grd.addColorStop(1, 'rgba(90,94,100,0.35)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);

  return {
    map: tex(canvas, { repeat: [4, 1] }),
    normalMap: tex(normalFromHeight(canvas, 1.8), { repeat: [4, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 13. Vitrage : grille de vitres reflechissantes            */
/* ---------------------------------------------------------- */
export const glassGrid = () => once('glassGrid', () => {
  const W = 512, H = 256;
  const rnd = mulberry32(4747);
  const { canvas, ctx } = paint(W, H, () => [18, 34, 50]);

  const cols = 16, rows = 4;
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * ch;
      /* Chaque vitre a son propre reflet : ciel en haut, sol en bas. */
      const grd = ctx.createLinearGradient(x, y, x + cw, y + ch);
      const t = rnd();
      grd.addColorStop(0, `rgba(${90 + t * 70 | 0},${140 + t * 60 | 0},${190 + t * 50 | 0},0.95)`);
      grd.addColorStop(0.45, `rgba(${30 + t * 30 | 0},${58 + t * 30 | 0},${88 + t * 30 | 0},0.95)`);
      grd.addColorStop(1, `rgba(${12 + t * 16 | 0},${24 + t * 18 | 0},${38 + t * 20 | 0},0.95)`);
      ctx.fillStyle = grd;
      ctx.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    }
  }
  /* Meneaux. */
  ctx.strokeStyle = 'rgba(150,158,168,0.9)';
  ctx.lineWidth = 3;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); ctx.stroke();
  }
  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 14. Toiture : gravillon bitumineux                        */
/* ---------------------------------------------------------- */
export const roof = () => once('roof', () => {
  const S = 256;
  const rnd = mulberry32(1919);
  const n = fbm(S, S, 3, 14, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 74 + v * 30;
    return [base, base * 0.98, base * 0.95];
  });
  for (let i = 0; i < 5000; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.6
      ? `rgba(190,192,196,${0.10 + rnd() * 0.25})`
      : `rgba(24,24,26,${0.10 + rnd() * 0.30})`;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 0.8 + rnd() * 1.8, 0, 6.283);
    ctx.fill();
  }
  return {
    map: tex(canvas, { repeat: [8, 8] }),
    normalMap: tex(normalFromHeight(canvas, 2.2), { repeat: [8, 8], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 15. Moquette de cabine                                    */
/* ---------------------------------------------------------- */
export const carpet = () => once('carpet', () => {
  const S = 128;
  const rnd = mulberry32(3030);
  const n = fbm(S, S, 3, 16, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    /* Texture neutre et claire : la couleur finale vient de la teinte du
       materiau. Une base sombre multipliee par une teinte sombre donnait
       du noir (tapis du hall, sol de cabine). */
    const base = 150 + v * 50;
    return [base * 0.94, base * 0.97, base * 1.04];
  });
  /* Bouclettes : points clairs regulierement espaces. */
  for (let y = 0; y < S; y += 3) {
    for (let x = 0; x < S; x += 3) {
      const v = rnd();
      ctx.fillStyle = `rgba(${200 + v * 55 | 0},${205 + v * 50 | 0},${215 + v * 40 | 0},0.35)`;
      ctx.fillRect(x + (y % 6 ? 1 : 0), y, 1.6, 1.6);
    }
  }
  return {
    map: tex(canvas, { repeat: [4, 24] }),
    normalMap: tex(normalFromHeight(canvas, 1.2), { repeat: [4, 24], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 16. Tissu de siege                                         */
/* ---------------------------------------------------------- */
export const fabric = () => once('fabric', () => {
  const S = 128;
  const rnd = mulberry32(5150);
  const n = fbm(S, S, 3, 20, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 135 + v * 40;
    return [base * 0.92, base * 0.96, base * 1.04];
  });
  /* Armure tissee : trame alternee. */
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      const on = ((x / 2 + y / 2) % 2) === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  return {
    map: tex(canvas, { repeat: [2, 2] }),
    normalMap: tex(normalFromHeight(canvas, 1.0), { repeat: [2, 2], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 17. Sol de terminal : terrazzo                            */
/* ---------------------------------------------------------- */
export const terrazzo = () => once('terrazzo', () => {
  const S = 256;
  const rnd = mulberry32(6161);
  const n = fbm(S, S, 3, 12, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 168 + v * 30;
    return [base, base * 0.99, base * 0.96];
  });
  /* Eclats de marbre : polygones clairs et sombres. */
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 4;
    const v = rnd();
    ctx.fillStyle = v > 0.75
      ? `rgba(60,64,72,${0.35 + rnd() * 0.3})`
      : v > 0.4
        ? `rgba(226,230,236,${0.35 + rnd() * 0.35})`
        : `rgba(150,158,170,${0.3 + rnd() * 0.3})`;
    ctx.beginPath();
    const sides = 5 + (rnd() * 3 | 0);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * 6.283 + rnd() * 0.4;
      const rr = r * (0.6 + rnd() * 0.7);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  /* Joints de dalles. */
  ctx.strokeStyle = 'rgba(120,126,134,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  return {
    map: tex(canvas, { repeat: [6, 6] }),
    normalMap: tex(normalFromHeight(canvas, 1.0), { repeat: [6, 6], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 18. Grillage : maille percee (alpha)                      */
/* ---------------------------------------------------------- */
export const chainlink = () => once('chainlink', () => {
  const S = 64;
  const { canvas, ctx } = paint(S, S, () => [0, 0, 0, 0]);
  ctx.strokeStyle = 'rgba(150,158,168,0.95)';
  ctx.lineWidth = 2.2;
  for (let i = -S; i < S * 2; i += 8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + S, 0); ctx.lineTo(i, S); ctx.stroke();
  }
  return { map: tex(canvas, { repeat: [40, 1] }) };
});

/* ---------------------------------------------------------- */
/* 19. Feuillage : canopee vue de loin                       */
/* ---------------------------------------------------------- */
export const foliage = () => once('foliage', () => {
  const S = 128;
  const rnd = mulberry32(7272);
  const n = fbm(S, S, 4, 6, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 34 + v * 40;
    return [base * 0.62, base * 1.15, base * 0.55];
  });
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = `rgba(${20 + rnd() * 60 | 0},${60 + rnd() * 80 | 0},${20 + rnd() * 40 | 0},0.55)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rnd() * 3, 0.8 + rnd() * 2, rnd() * 3, 0, 6.283);
    ctx.fill();
  }
  return {
    map: tex(canvas, { repeat: [2, 2] }),
    normalMap: tex(normalFromHeight(canvas, 1.6), { repeat: [2, 2], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 20. Roche : reliefs lointains                             */
/* ---------------------------------------------------------- */
export const rock = () => once('rock', () => {
  const S = 128;
  const rnd = mulberry32(8383);
  const n = fbm(S, S, 4, 5, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 62 + v * 52;
    return [base * 1.02, base, base * 0.88];
  });
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? 200 : 30},${rnd() > 0.5 ? 200 : 30},${rnd() > 0.5 ? 200 : 30},${0.03 + rnd() * 0.08})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  return {
    map: tex(canvas, { repeat: [3, 3] }),
    normalMap: tex(normalFromHeight(canvas, 2.4), { repeat: [3, 3], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 21. Nuage : amas de bouffees douces                       */
/* ------------------------------------------------------------
   Bien plus riche que l'ancien disque unique : plusieurs
   bouffees de tailles et densites differentes, avec un coeur
   dense et des bords qui s'effacent. */
export const cloud = () => once('cloud', () => {
  const S = 256;
  const rnd = mulberry32(9494);
  const { canvas, ctx } = paint(S, S, () => [0, 0, 0, 0]);

  /* Coeur : grosses bouffees centrales. */
  for (let i = 0; i < 14; i++) {
    const a = rnd() * 6.283;
    const d = rnd() * S * 0.20;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.55;
    const r = S * (0.14 + rnd() * 0.16);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.55, 'rgba(250,252,255,0.55)');
    grd.addColorStop(1, 'rgba(240,246,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  /* Bords : bouffees plus petites et plus diffuses. */
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283;
    const d = S * (0.22 + rnd() * 0.24);
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.5;
    const r = S * (0.06 + rnd() * 0.12);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  /* Base legerement ombree : donne du volume au nuage. */
  const shade = ctx.createLinearGradient(0, S * 0.5, 0, S);
  shade.addColorStop(0, 'rgba(150,168,196,0)');
  shade.addColorStop(1, 'rgba(150,168,196,0.30)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';

  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 22. Bandes de danger (equipements au sol)                 */
/* ---------------------------------------------------------- */
export const hazard = () => once('hazard', () => {
  const W = 128, H = 128;
  const { canvas, ctx } = paint(W, H, () => [250, 204, 21]);
  ctx.fillStyle = '#111318';
  for (let i = -H; i < W + H; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 16 + H, H);
    ctx.lineTo(i + H, H);
    ctx.closePath();
    ctx.fill();
  }
  /* Usure : rayures et eclats. */
  const rnd = mulberry32(1010);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? 90 : 200},${rnd() > 0.5 ? 90 : 200},${rnd() > 0.5 ? 90 : 200},${0.05 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 4, 1 + rnd() * 2);
  }
  return { map: tex(canvas, { repeat: [1, 1] }) };
});

/* ---------------------------------------------------------- */
/* 23. Metal peint usage (camions, chariots, GPU)            */
/* ---------------------------------------------------------- */
export const paintedMetal = () => once('paintedMetal', () => {
  const S = 128;
  const rnd = mulberry32(1111);
  const n = fbm(S, S, 3, 8, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 210 + v * 40;
    return [base, base, base];
  });
  /* Rayures d'usage et eclats de peinture. */
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${60 + rnd() * 60 | 0},${58 + rnd() * 60 | 0},${56 + rnd() * 60 | 0},${0.05 + rnd() * 0.22})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 5, 1 + rnd() * 1.5);
  }
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 1.2), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 25. Peau : pores et micro-relief des visages et des mains */
/* ------------------------------------------------------------ */
export const skinPores = () => once('skinPores', () => {
  const S = 128;
  const rnd = mulberry32(4242);
  const pores = fbm(S, S, 3, 24, rnd);
  const blotch = fbm(S, S, 2, 4, rnd);
  const { canvas } = paint(S, S, (x, y) => {
    const p = pores[y * S + x];
    const b = blotch[y * S + x];
    /* Base claire : la teinte reelle vient de la couleur du materiau,
       la texture n'apporte que la variation. */
    const v = 226 + (p - 0.5) * 26 + (b - 0.5) * 14;
    return [v, v * 0.985, v * 0.965];
  });
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 0.8), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 26. Cheveux : mèches fines pour les coiffures             */
/* ---------------------------------------------------------- */
export const hair = () => once('hair', () => {
  const S = 128;
  const rnd = mulberry32(909);
  const n = fbm(S, S, 2, 10, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = 150 + n[y * S + x] * 90;
    return [v, v, v];
  });
  /* Meches : traits obliques clairs, comme des reflets sur la masse. */
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, len = 6 + rnd() * 22;
    ctx.strokeStyle = `rgba(${200 + rnd() * 55 | 0},${195 + rnd() * 55 | 0},${190 + rnd() * 55 | 0},${0.05 + rnd() * 0.16})`;
    ctx.lineWidth = 0.6 + rnd() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 5, y + len);
    ctx.stroke();
  }
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 1.0), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 27. Cuir de siege : grain, perforations, coutures          */
/* ------------------------------------------------------------ */
/* Utilise pour les sieges de cabine et les assises du salon
   VIP. Les perforations sont creusees dans la carte de hauteur,
   donc la carte de normales les fait vraiment accrocher la
   lumiere plutot que de les simuler par une tache sombre. */
export const leather = () => once('leather', () => {
  const S = 256;
  const rnd = mulberry32(7373);
  const grain = fbm(S, S, 4, 40, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const g = grain[y * S + x];
    const v = 150 + (g - 0.5) * 70;
    return [v, v * 0.97, v * 0.93];
  });
  /* Perforations : grille serree de petits trous sombres. */
  for (let y = 6; y < S - 6; y += 7) {
    for (let x = 6; x < S - 6; x += 7) {
      const ox = (y % 14 ? 3 : 0);
      ctx.fillStyle = 'rgba(28,24,22,0.55)';
      ctx.beginPath();
      ctx.arc(x + ox, y, 1.5, 0, 6.283);
      ctx.fill();
    }
  }
  /* Coutures : deux lignes de points en pointille. */
  ctx.strokeStyle = 'rgba(240,236,228,0.35)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 4]);
  for (const yy of [S * 0.25, S * 0.75]) {
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(S, yy); ctx.stroke();
  }
  ctx.setLineDash([]);
  return {
    map: tex(canvas, { repeat: [2, 2] }),
    normalMap: tex(normalFromHeight(canvas, 1.6), { repeat: [2, 2], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 28. Inox brosse : galley, chariots, mobilier technique     */
/* ------------------------------------------------------------ */
export const brushed = () => once('brushed', () => {
  const S = 256;
  const rnd = mulberry32(8181);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    /* Stries horizontales : le bruit est etire sur X, quasi nul sur Y. */
    const v = 168 + (rnd() - 0.5) * 26;
    return [v, v * 1.005, v * 1.02];
  });
  for (let i = 0; i < 900; i++) {
    const y = rnd() * S;
    const a = 0.03 + rnd() * 0.09;
    ctx.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(40,44,50,${a})`;
    ctx.lineWidth = 0.5 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (rnd() - 0.5) * 1.5);
    ctx.stroke();
  }
  return {
    map: tex(canvas, { repeat: [2, 2] }),
    normalMap: tex(normalFromHeight(canvas, 0.7), { repeat: [2, 2], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 29. Faience sanitaire : toilettes et carrelage mural       */
/* ------------------------------------------------------------ */
export const tile = () => once('tile', () => {
  const S = 256;
  const rnd = mulberry32(9292);
  const n = fbm(S, S, 3, 10, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 214 + v * 22;
    return [base, base * 0.995, base * 0.985];
  });
  /* Joints : grille de carreaux de 64 px. */
  ctx.strokeStyle = 'rgba(150,156,164,0.75)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * S;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  /* Mouchetures d'email. */
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }
  return {
    map: tex(canvas, { repeat: [3, 3] }),
    normalMap: tex(normalFromHeight(canvas, 1.4), { repeat: [3, 3], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 30. Bagage : toile de nylon tissee des valises             */
/* ------------------------------------------------------------ */
export const luggage = () => once('luggage', () => {
  const S = 128;
  const rnd = mulberry32(3131);
  const n = fbm(S, S, 3, 18, rnd);
  const { canvas, ctx } = paint(S, S, (x, y) => {
    const v = n[y * S + x];
    const base = 96 + v * 40;
    return [base * 1.05, base * 0.98, base * 0.9];
  });
  /* Armure serree : trame fine, plus dense que le tissu de siege. */
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      const on = ((x / 2 + y / 2) % 2) === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  /* Renforts : deux bandes verticales plus claires. */
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(S * 0.22, 0, S * 0.06, S);
  ctx.fillRect(S * 0.72, 0, S * 0.06, S);
  return {
    map: tex(canvas, { repeat: [1, 1] }),
    normalMap: tex(normalFromHeight(canvas, 1.1), { repeat: [1, 1], srgb: false })
  };
});

/* ---------------------------------------------------------- */
/* 24. Ciel etoile : disque doux pour les points             */
/* ---------------------------------------------------------- */
export const starSprite = () => once('starSprite', () => {
  const S = 32;
  const { canvas, ctx } = paint(S, S, () => [0, 0, 0, 0]);
  const grd = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  return { map: tex(canvas, { repeat: [1, 1] }) };
});
