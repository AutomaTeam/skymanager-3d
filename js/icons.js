/* ============================================================
   icons.js — Icones vectorielles du jeu (phase 32)

   Les emojis changent d'une machine a l'autre (certains illisibles sous
   Windows). Ce module fournit un jeu d'icones plates a la palette du jeu,
   dessinees en chemins SVG sur une grille de 24 x 24 :

   - iconify(root)   : remplace, dans le DOM et pour toujours (observateur),
                       chaque emoji connu d'un texte par l'icone SVG ;
   - drawIcon(ctx, ch, cx, cy, size) : meme icone sur un canvas (cartes) ;
                       renvoie false si l'emoji n'a pas d'icone (l'appelant
                       retombe sur fillText).

   Les emojis sans icone (visages, drapeaux...) restent des emojis.
   ============================================================ */

const C = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const R = (x, y, w, h, r = 1.5) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const STAR = 'M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.1l-6 3.5 1.3-6.7-5-4.7 6.8-.8z';
const SPARK = 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z';
const PLANE = 'M21.5 15.5v-2L13.5 8.7V3.8a1.5 1.5 0 0 0-3 0v4.9l-8 4.8v2l8-2.4v4.3l-2 1.5v1.6l3.5-1 3.5 1v-1.6l-2-1.5v-4.3z';

/* [chemin, remplissage, contour?] */
const ICONS = {
  coin:    [[C(12, 12, 10), '#f59e0b'], [C(12, 12, 7.4), '#fbbf24'], [R(10.8, 7.5, 2.4, 9, 1), '#b45309']],
  star:    [[STAR, '#facc15', '#b45309']],
  /* Etoile filante du ciel (a collectionner) : halo et etincelles, pour ne pas la confondre avec la note ⭐. */
  goldstar:[[C(12, 12, 11), '#fef3c7'], [STAR, '#f59e0b', '#92400e'], ['M20 2.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7zM3.5 17l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L1.5 19l1.4-.6z', '#fde047', '#d97706']],
  spark:   [[SPARK, '#fde047', '#d97706']],
  plane:   [[PLANE, '#f1f5f9', '#475569']],
  wrench:  [['M21.5 7.2a5.6 5.6 0 0 1-7.4 5.3l-7.6 7.6a2.3 2.3 0 0 1-3.2-3.2l7.6-7.6A5.6 5.6 0 0 1 16.2 2l-3.4 3.4.8 3.2 3.2.8z', '#94a3b8', '#475569']],
  bag:     [[R(2, 6, 20, 15, 3), '#b45309'], [R(7.5, 6, 2, 15, 0.5), '#92400e'], [R(14.5, 6, 2, 15, 0.5), '#92400e'], ['M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6', 'none', '#78350f']],
  box:     [['M12 2l9 4.6v10.8L12 22l-9-4.6V6.6z', '#d4a373', '#92400e'], ['M12 2l9 4.6-9 4.6-9-4.6z', '#ecc99b'], ['M12 11.2V22', 'none', '#92400e']],
  building:[[R(4, 2, 16, 20, 2), '#64748b'], [R(7, 5, 3, 3, 0.5), '#fde68a'], [R(14, 5, 3, 3, 0.5), '#fde68a'], [R(7, 10, 3, 3, 0.5), '#fde68a'], [R(14, 10, 3, 3, 0.5), '#fde68a'], [R(10, 16, 4, 6, 0.5), '#334155']],
  tower:   [['M10 10h4l1.2 12H8.8z', '#94a3b8', '#475569'], ['M5.5 3.5h13l1.8 6H3.7z', '#7c3aed', '#4c1d95'], ['M7 5.5h10l.7 2.5H6.3z', '#bae6fd']],
  cup:     [['M6.5 6h11l-1.6 15.5H8.1z', '#ef4444', '#991b1b'], ['M6.8 9h10.4l-.3 3H7.1z', '#fff'], ['M12 6V2.5l3-1', 'none', '#475569']],
  fire:    [['M12 2c.8 4.5 6.5 6.2 6.5 12.2a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5 3.3-7 .3 2 1.2 2.7 2 3.3C10.3 7.6 10.8 4.7 12 2z', '#f97316'], ['M12 11c.5 2.5 3 3.5 3 6a3 3 0 0 1-6 0c0-1.7 1.5-2.5 3-6z', '#fde047']],
  gift:    [[R(3, 10, 18, 11, 1.5), '#ec4899'], [R(2, 7, 20, 4, 1.5), '#f472b6'], [R(10.5, 7, 3, 14, 0.5), '#fde047'], ['M12 7C9 7 7.5 3.5 10 3c1.4-.2 2 1.8 2 4zM12 7c3 0 4.5-3.5 2-4-1.4-.2-2 1.8-2 4z', '#fde047', '#d97706']],
  party:   [['M3 21l5-14 9 9z', '#f59e0b', '#b45309'], ['M13 3v3M19 5l-2 2M21 11h-3', 'none', '#ec4899'], [C(18.5, 4, 1.2), '#22d3ee'], [C(5.5, 5, 1.2), '#a3e635']],
  check:   [[C(12, 12, 10), '#22c55e'], ['M7 12.5l3.2 3.2L17 8.8', 'none', '#fff']],
  bolt:    [['M13.5 2L4.5 13.5h6L9.5 22l9-11.5h-6z', '#facc15', '#b45309']],
  bagshop: [['M5 8h14l1 13H4z', '#fb923c', '#9a3412'], ['M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8', 'none', '#9a3412']],
  money:   [['M8 3h8l-1.5 3h-5z', '#92400e'], ['M9 6c-5 3-6 8-6 11 0 3 2 5 9 5s9-2 9-5c0-3-1-8-6-11z', '#fbbf24', '#b45309'], ['M12 11v7M14 12.5c-.5-1-3.5-1-3.8.2-.3 1.5 3.8 1.3 3.6 3-.2 1.4-3.2 1.4-3.8.2', 'none', '#92400e']],
  target:  [[C(12, 12, 10), '#ef4444'], [C(12, 12, 7), '#fff'], [C(12, 12, 4.2), '#ef4444'], [C(12, 12, 1.6), '#fff']],
  map:     [['M2 5l6-2 8 2 6-2v16l-6 2-8-2-6 2z', '#a7f3d0', '#047857'], ['M8 3v16M16 5v16', 'none', '#047857']],
  horn:    [['M3 9h4l9-5v16l-9-5H3z', '#f43f5e', '#9f1239'], ['M19 9a4 4 0 0 1 0 6', 'none', '#f43f5e']],
  candy:   [[C(12, 12, 5.5), '#ec4899', '#9d174d'], ['M6.5 8.5L2 6l1.5 5zM17.5 15.5L22 18l-1.5-5z', '#f9a8d4', '#9d174d']],
  camera:  [[R(2, 7, 20, 14, 3), '#475569'], ['M8 7l1.5-3h5L16 7z', '#334155'], [C(12, 14, 4.4), '#bae6fd', '#0f172a'], [C(12, 14, 2), '#38bdf8']],
  trophy:  [['M7 3h10v6a5 5 0 0 1-10 0z', '#fbbf24', '#b45309'], ['M7 5H3c0 4 2 6 4 6M17 5h4c0 4-2 6-4 6', 'none', '#b45309'], [R(10.5, 14, 3, 4), '#d97706'], [R(7, 18, 10, 3, 1), '#b45309']],
  door:    [[R(5, 2, 14, 20, 1.5), '#a16207', '#713f12'], [C(15.5, 12.5, 1.1), '#fde047']],
  people:  [[C(8, 8, 3.2), '#60a5fa'], [C(17, 9, 2.8), '#a78bfa'], ['M2 20c0-4 2.5-6.5 6-6.5s6 2.5 6 6.5z', '#60a5fa'], ['M13.5 20c0-3 1.5-5 3.5-5s5 2 5 5z', '#a78bfa']],
  house:   [['M3 11l9-8 9 8z', '#ef4444', '#991b1b'], [R(5.5, 11, 13, 10, 1), '#fde68a', '#b45309'], [R(10, 14, 4, 7, 0.5), '#92400e']],
  globe:   [[C(12, 12, 10), '#38bdf8', '#0369a1'], ['M6 7c3 0 4 2 3 4s-3 1-3 4 2 3 2 5M14 3c0 3 2 4 4 4s3 3 1 5-4 1-5 3', '#4ade80', '#15803d']],
  firetruck:[[R(1.5, 9, 14, 8, 1.5), '#ef4444', '#991b1b'], [R(15.5, 11, 7, 6, 1.5), '#dc2626', '#991b1b'], ['M3 6h10', 'none', '#94a3b8'], [C(7, 18, 2.4), '#1e293b'], [C(18, 18, 2.4), '#1e293b']],
  heli:    [[C(11, 14, 6), '#ef4444', '#991b1b'], ['M16 14l6-2v4z', '#ef4444', '#991b1b'], ['M3 5h16M11 5v3', 'none', '#475569'], [C(9, 13, 2.4), '#bae6fd']],
  hourglass:[['M5 2h14M5 22h14', 'none', '#475569'], ['M6 2c0 6 4 7 6 10-2 3-6 4-6 10h12c0-6-4-7-6-10 2-3 6-4 6-10z', '#fde68a', '#b45309']],
  coffee:  [['M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', '#fff', '#78350f'], ['M17 10h2a2.5 2.5 0 0 1 0 5h-2', 'none', '#78350f'], ['M4 8h13v3H4z', '#92400e'], ['M8 2c-1 1.5 1 2 0 4M12 2c-1 1.5 1 2 0 4', 'none', '#94a3b8']],
  stop:    [[C(12, 12, 10), '#ef4444'], [R(5, 10.2, 14, 3.6, 1), '#fff']],
  phone:   [[R(6.5, 2, 11, 20, 2.5), '#334155'], [R(8, 4.5, 8, 13, 0.8), '#7dd3fc'], [C(12, 20, 0.9), '#94a3b8']],
  gamepad: [['M6 8h12a4 4 0 0 1 4 4.5l-.5 3A3 3 0 0 1 16 16.5L15 15H9l-1 1.5A3 3 0 0 1 2.5 15.5l-.5-3A4 4 0 0 1 6 8z', '#6366f1', '#3730a3'], ['M7.5 10.5v3M6 12h3', 'none', '#fff'], [C(16, 11.5, 1), '#fde047'], [C(18, 13.5, 1), '#f87171']],
  sun:     [[C(12, 12, 5), '#fbbf24', '#d97706'], ['M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', 'none', '#f59e0b']],
  moon:    [['M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z', '#fde68a', '#d97706']],
  bulb:    [['M12 2a6.5 6.5 0 0 0-3.5 12c.7.6 1 1.3 1 2h5c0-.7.3-1.4 1-2A6.5 6.5 0 0 0 12 2z', '#fde047', '#d97706'], [R(9.5, 17.5, 5, 2, 1), '#94a3b8'], [R(10.5, 20, 3, 2, 1), '#64748b']],
  compass: [[C(12, 12, 10), '#f1f5f9', '#475569'], ['M16.5 7.5L13.5 13.5 7.5 16.5 10.5 10.5z', '#ef4444', '#991b1b']],
  truck:   [[R(1.5, 7, 13, 10, 1.5), '#f59e0b', '#b45309'], [R(14.5, 10, 8, 7, 1.5), '#fbbf24', '#b45309'], [C(6, 18, 2.4), '#1e293b'], [C(18, 18, 2.4), '#1e293b']],
  fuel:    [[R(4, 3, 10, 18, 1.5), '#22c55e', '#166534'], [R(6, 5.5, 6, 5, 0.8), '#dcfce7'], ['M14 8h2.5a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0V8l-3-3', 'none', '#166534']],
  gem:     [['M6 3h12l4 6-10 13L2 9z', '#38bdf8', '#0369a1'], ['M2 9h20M9 3l-2 6 5 13 5-13-2-6', 'none', '#e0f2fe']],
  lock:    [[R(4.5, 10.5, 15, 11, 2), '#fbbf24', '#b45309'], ['M8 10.5V7.5a4 4 0 0 1 8 0v3', 'none', '#64748b'], [C(12, 16, 1.5), '#92400e']],
  ticket:  [['M2 7h20v3.2a2 2 0 0 0 0 3.6V17H2v-3.2a2 2 0 0 0 0-3.6z', '#f87171', '#991b1b'], ['M15 7v10', 'none', '#fff']],
  passport:[[R(5, 2.5, 14, 19, 1.5), '#1d4ed8', '#1e3a8a'], [C(12, 10.5, 3.6), 'none', '#fde047'], ['M9 17h6', 'none', '#fde047']],
  music:   [['M9 18V5l11-2v13', 'none', '#7c3aed'], [C(6.5, 18, 3), '#7c3aed'], [C(17.5, 16, 3), '#7c3aed']],
  volume:  [['M3 9h4l5-4v14l-5-4H3z', '#64748b', '#334155'], ['M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11', 'none', '#64748b']],
  mute:    [['M3 9h4l5-4v14l-5-4H3z', '#64748b', '#334155'], ['M16 9l5 6M21 9l-5 6', 'none', '#ef4444']],
  balloon: [['M12 2a7 8.5 0 0 0-7 8.5c0 4 3.5 7 7 8.5 3.5-1.5 7-4.5 7-8.5A7 8.5 0 0 0 12 2z', '#ef4444', '#991b1b'], ['M12 19l-2 3h4z', '#78350f']],
  chat:    [['M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', '#60a5fa', '#1d4ed8'], ['M7 9h10M7 12.5h6', 'none', '#fff']],
  medal:   [['M7 2h4l2 6H9zM13 2h4l-3 6h-2z', '#ef4444'], [C(12, 15, 6.5), '#fbbf24', '#b45309'], [C(12, 15, 3.5), '#fde047']],
  crown:   [['M3 18L2 7l5 4 5-7 5 7 5-4-1 11z', '#fbbf24', '#b45309'], [R(3, 18, 18, 3, 1), '#f59e0b', '#b45309']],
  search:  [[C(10, 10, 6.5), '#e0f2fe', '#475569'], ['M15 15l6 6', 'none', '#475569']],
  foot:    [['M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 8c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z', '#94a3b8']],
  dotred:  [[C(12, 12, 9), '#ef4444', '#991b1b']],
  dotyel:  [[C(12, 12, 9), '#facc15', '#b45309']],
  smile:   [[C(12, 12, 10), '#fde047', '#d97706'], [C(8.5, 10, 1.3), '#78350f'], [C(15.5, 10, 1.3), '#78350f'], ['M7.5 14.5a5 5 0 0 0 9 0', 'none', '#78350f']],
  parking: [[R(3, 3, 18, 18, 3.5), '#2563eb', '#1e3a8a'], ['M9.5 17V7h4a3 3 0 0 1 0 6h-4', 'none', '#fff']],
  taxi:    [['M4 12l2-5h12l2 5v6H4z', '#fbbf24', '#b45309'], [R(9, 4, 6, 3, 1), '#fde047', '#b45309'], [C(7.5, 18, 2), '#1e293b'], [C(16.5, 18, 2), '#1e293b']],
  road:    [['M8 2h8l4 20H4z', '#64748b', '#334155'], ['M12 4v3M12 10v4M12 17v4', 'none', '#fde047']],
  tractor: [[R(8, 7, 9, 7, 1.5), '#22c55e', '#166534'], [R(3, 11, 6, 3, 1), '#16a34a'], [C(7, 17, 3.4), '#1e293b'], [C(17.5, 18, 2.2), '#1e293b']],
  pencil:  [['M4 20l1-5L16 4l4 4L9 19z', '#fbbf24', '#b45309'], ['M14 6l4 4', 'none', '#b45309']],
  chart:   [[R(3, 12, 4.5, 9, 1), '#38bdf8'], [R(9.7, 6, 4.5, 15, 1), '#22c55e'], [R(16.5, 3, 4.5, 18, 1), '#f59e0b']],
  flag:    [['M5 22V3', 'none', '#475569'], ['M5 4h14l-3 4 3 4H5z', '#ef4444', '#991b1b']],
  gear:    [[C(12, 12, 7.5), '#94a3b8', '#475569'], ['M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', 'none', '#64748b'], [C(12, 12, 3), '#e2e8f0']]
};

/* emoji -> nom d'icone */
const MAP = {};
const add = (name, list) => list.split(' ').forEach(e => { MAP[e] = name; });
add('coin', '🪙'); add('star', '⭐ ★'); add('goldstar', '🌠 🌟'); add('spark', '✨'); add('plane', '✈ 🛫 🛬'); add('wrench', '🔧 🛠');
add('gear', '⚙'); add('bag', '🧳 🛄'); add('box', '📦'); add('building', '🏢 🏗'); add('tower', '🗼');
add('cup', '🥤'); add('fire', '🔥'); add('gift', '🎁'); add('party', '🎉'); add('check', '✅ ✔'); add('bolt', '⚡');
add('bagshop', '🛍 🛒'); add('money', '💰'); add('target', '🎯'); add('map', '🗺'); add('horn', '📢 📯');
add('candy', '🍬'); add('camera', '📸'); add('trophy', '🏆'); add('door', '🚪'); add('people', '👥');
add('house', '🏠'); add('globe', '🌍'); add('firetruck', '🚒'); add('heli', '🚁'); add('hourglass', '⏳');
add('coffee', '☕'); add('stop', '⛔'); add('phone', '📲'); add('gamepad', '🎮'); add('sun', '☀'); add('moon', '🌙');
add('bulb', '💡'); add('compass', '🧭'); add('truck', '🚚'); add('fuel', '⛽'); add('gem', '💎'); add('lock', '🔒');
add('ticket', '🎫'); add('passport', '🛂'); add('music', '🎵 🎶'); add('volume', '🔊'); add('mute', '🔇');
add('balloon', '🎈'); add('chat', '💬'); add('medal', '🏅'); add('crown', '👑'); add('search', '🔍'); add('foot', '👣');
add('dotred', '🔴'); add('dotyel', '🟡'); add('smile', '🙂 😊'); add('parking', '🅿'); add('taxi', '🚕');
add('road', '🛣'); add('tractor', '🚜'); add('pencil', '✏'); add('chart', '📊'); add('flag', '🚩');

const VS = /️/g;
const key = (ch) => MAP[ch.replace(VS, '')] || null;

/* Emojis reconnus : un caractere (ou paire de substitution) + selecteur facultatif. */
const EMOJI_RE = new RegExp(
  Object.keys(MAP).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + '(?:\\uFE0F)?', 'g');

const svgCache = {};
function svgOf(name) {
  if (svgCache[name]) return svgCache[name];
  const body = ICONS[name].map(([d, fill, stroke]) =>
    `<path d="${d}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`).join('');
  return (svgCache[name] = `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);
}

const pathCache = {};
export function drawIcon(ctx, ch, cx, cy, size) {
  const name = key(ch);
  if (!name) return false;
  const parts = pathCache[name] || (pathCache[name] = ICONS[name].map(([d, fill, stroke]) => ({ p: new Path2D(d), fill, stroke })));
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const { p, fill, stroke } of parts) {
    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(p); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(p); }
  }
  ctx.restore();
  return true;
}

export function hasIcon(ch) { return !!key(ch); }

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'TITLE', 'CANVAS', 'SVG']);

function convert(node) {
  const text = node.nodeValue;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  EMOJI_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = EMOJI_RE.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'ic';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', key(m[0]));
    span.innerHTML = svgOf(key(m[0]));
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(frag, node);
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (root.parentNode && !SKIP.has(root.parentNode.nodeName.toUpperCase())) convert(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName.toUpperCase())) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => SKIP.has(n.parentNode.nodeName.toUpperCase()) || n.parentNode.closest && n.parentNode.closest('svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (tw.nextNode()) nodes.push(tw.currentNode);
  nodes.forEach(convert);
}

export function iconify(root = document.body) {
  walk(root);
  const pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    const list = [...pending]; pending.clear();
    for (const n of list) if (n.isConnected) walk(n);
  };
  new MutationObserver((muts) => {
    for (const mu of muts) {
      if (mu.type === 'characterData') pending.add(mu.target);
      else mu.addedNodes.forEach(n => pending.add(n));
    }
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
