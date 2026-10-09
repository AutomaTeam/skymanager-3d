/* Accents francais dans le texte affiche (plan « jeu cool », C3).
   Le jeu a ete ecrit presque entierement sans accents (« Repare l'avion », « tresors »).
   Cet outil ne touche QU'AU TEXTE AFFICHE :
     - JS  : chaines et gabarits (acorn), sauf cles d'objet, imports, selecteurs, cles de stockage,
             chaines qui ressemblent a des identifiants ; dans les gabarits HTML, seulement le texte
             hors balises et les attributs aria-label / title / alt / placeholder ;
     - HTML : texte hors balises (pas dans <script> ni <style>) et ces memes attributs.
   Remplacement mot a mot par le dictionnaire tools/accents.dict.json (mot sans accent -> mot accentue),
   en gardant la casse (Mot, MOT). Le mot « a » devient « à » seulement devant certains mots.
   Usage :
     node tools/accents.mjs --words      # vocabulaire affiche (mots sans accent, par frequence)
     node tools/accents.mjs --dry        # ce qui changerait (nombre par fichier)
     node tools/accents.mjs --apply      # ecrit les fichiers
   Necessite acorn (installe avec eslint : npm install three@0.169.0 eslint@9 globals --no-save). */

import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || '--dry';
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'accents.dict.json'), 'utf8'));
delete DICT._comment;

/* Fonctions dont l'argument chaine n'est jamais du texte affiche. */
const SKIP_CALLEE = new Set(['getElementById', 'querySelector', 'querySelectorAll', 'add', 'remove', 'toggle', 'contains',
  'addEventListener', 'removeEventListener', 'getItem', 'setItem', 'removeItem', 'setAttribute', 'getAttribute', 'closest',
  'matches', 'createElement', 'dispatchEvent', 'setProperty', 'getPropertyValue', 'replace', 'split', 'join', 'startsWith',
  'endsWith', 'includes', 'indexOf', 'event', 'load', 'write', 'has', 'get', 'set', 'delete', 'emit', 'on', 'off', 'play']);

const WORD = /[A-Za-zÀ-ÿ]+/g;
/* « a » -> « à » devant ces mots (preposition), sauf apres un sujet (il a, on a, qui a, y a...). */
const A_NEXT = new Set(['la', 'l', 'le', 'les', 'quoi', 'niveau', 'mon', 'ma', 'mes', 'helice', 'hélice', 'reaction', 'réaction', 'moteur', 'bagages', 'destination', 'environ', 'pleine', 'grande', 'nouveau', 'nouvelle', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'toi', 'moi', 'lui', 'eux',
  'pied', 'bord', 'cote', 'côté', 'gauche', 'droite', 'bientot', 'bientôt', 'demain', 'chaque', 'tout', 'toute', 'tous', 'travers',
  'nouveau', 'vos', 'votre', 'nos', 'notre', 'cet', 'cette', 'ce', 'ces', 'peu', 'quel', 'quelle', 'fond', 'faire', 'jouer',
  'voler', 'reparer', 'réparer', 'decoller', 'décoller', 'atterrir', 'gagner', 'trouver', 'voir', 'manger', 'boire', 'cause',
  'part', 'partir', 'plat', 'temps', 'vitesse', 'fond', 'midi', 'minuit', 'nouveau', 'personne', 'terre', 'bientot', 'peine',
  'leur', 'leurs', 'distance', 'droite', 'haute', 'voix', 'moins', 'plus', 'cheval', 'velo', 'vélo', 'roulettes', 'domicile',
  'l\'aide', 'mi', 'mettre', 'aider', 'piloter', 'acheter', 'recruter', 'servir', 'lancer', 'attraper', 'chercher', 'rattraper',
  'ramasser', 'deposer', 'déposer', 'livrer', 'conduire', 'eteindre', 'éteindre', 'dire', 'prendre', 'battre', 'suivre', 'grimper']);
/* « a » + infinitif = « à » (à voler, à fabriquer), sauf ces mots qui finissent comme un infinitif. */
const NOT_INF = new Set(['notre', 'votre', 'autre', 'entre', 'contre', 'quatre', 'heure', 'livre', 'lettre', 'centre', 'titre', 'metre',
  'ordre', 'arbre', 'chambre', 'nombre', 'premier', 'dernier', 'cher', 'hier', 'super', 'mer', 'air', 'soir', 'noir', 'hiver', 'fer',
  'tir', 'desir', 'plaisir', 'loisir', 'avenir', 'souvenir', 'sourire', 'poster', 'laser', 'cuir', 'clair', 'bar', 'car', 'pour',
  'sur', 'leur', 'propre', 'libre', 'rare', 'pire']);
const RE_INF = new Set(['faire', 'dire', 'prendre', 'mettre', 'battre', 'suivre', 'boire', 'conduire', 'eteindre', 'lire', 'ecrire', 'rire',
  'vivre', 'attendre', 'descendre', 'entendre', 'rendre', 'perdre', 'vendre', 'peindre', 'construire', 'croire', 'repondre', 'apprendre']);
const isInf = (w) => (/^[a-z]{3,}(er|ir)$/.test(w) && !NOT_INF.has(w)) || RE_INF.has(w);
const A_SUBJ = new Set(['il', 'elle', 'on', 'qui', 'y', 'ça', 'ca', 'cela', 'tout', 'chacun', 'personne', 'quelqu', 'n', 'ne', 'qu']);

const isWordy = (s) => /[A-Za-z]{2}/.test(s) && !/gl_|void\s+main|uniform\s|varying\s|vec[234]|#include|precision\s/.test(s);
const identLike = (s) => /^[\w.\-/:#?=&%+]*$/.test(s) && !/^[A-Z][a-z]/.test(s);

/* Mots ambigus (« repare » : Répare l'avion / Avion réparé) : [verbe, participe] selon le contexte. */
const AUX = new Set(['est', 'a', 'as', 'ai', 'avons', 'avez', 'ont', 'sont', 'ete', 'été', 'bien', 'deja', 'déjà', 'tout', 'toute',
  'tous', 'tres', 'très', 'trop', 'plus', 'mal', 'etre', 'être', 'es', 'suis', 'etait', 'était', 'sera', 'seras', 'pas', 'jamais']);
const SUBJ = new Set(['tu', 'je', 'il', 'elle', 'on', 'qui', 'ne', 'n', 'te', 'se', 'me', 'nous', 'vous', 'ils', 'elles', 's', 'm', 't', 'j',
  'du', 'le', 'au', 'un', 'ce']);      // apres un article, c'est un nom : « le reste », « un livre »
function pickForm(t, words, i, [verb, part]) {
  const m = words[i];
  const prevM = words[i - 1];
  const gap = prevM ? t.slice(prevM.index + prevM[0].length, m.index) : null;
  const prev = prevM && /^[\s']*$/.test(gap) ? prevM[0].toLowerCase() : null;
  if (prev && SUBJ.has(prev)) return verb;
  if (prev && AUX.has(prev)) return part;
  /* « valide ou refuse », « lave et répare » : meme forme que le mot d'avant le « ou » / « et ». */
  if ((prev === 'ou' || prev === 'et') && i > 1) {
    const d = DICT[words[i - 2][0].toLowerCase()];
    if (Array.isArray(d)) return pickForm(t, words, i - 2, d) === d[0] ? verb : part;
    if (/^(valide|lave|vole|joue|monte|pose|tourne|saute)$/i.test(words[i - 2][0])) return verb;
  }
  const before = t.slice(0, m.index).replace(/\\n/g, ' ').trimEnd();       // « \n » ecrit dans la source
  const after = t.slice(m.index + m[0].length);
  if (before === '' && /^\s*$/.test(after)) return part;              // un mot seul : « Trouvés », « Terminé »
  if (before === '' || /[.!?:…»«"(\-—–>]$/.test(before) || /\p{Extended_Pictographic}️?$/u.test(before)) return verb;
  if (/^\s*($|[!.,:;)(—–…]|\\n)/.test(after)) return part;
  return verb;
}

const EXPR = '\u0001';

/* Corrections a la main, appliquees apres le dictionnaire (phrase fautive -> phrase juste). */
const EXCEPT = [
  ['moteurs à notre avion', 'moteurs a notre avion'],
  ['étoiles a un atterrissage', 'étoiles à un atterrissage'],
  ['valide ou refusé', 'valide ou refuse'],
  ['Valide ou refusé', 'Valide ou refuse'],
  ['déposes au pied', 'déposés au pied'],
  ['débris ramasses', 'débris ramassés'],
  ['est la !', 'est là !'],
  ['rempli ton réservoir', 'remplis ton réservoir'],
  ['Touche-a-tout', 'Touche-à-tout'],
  ['Haut perche', 'Haut perché'],
  ['Bien joue', 'Bien joué'],
  ['à faire la !', 'à faire là !'],
  ['Aviation Expérience', 'Aviation Experience'],
  ['sais ou on', 'sais où on'],
  ['ou aller', 'où aller'],
  ['Vol a voile', 'Vol à voile'],
  ['lourd accepte', 'lourd accepté'],
  ['est monte', 'est monté'],
  ['Rattrape !', 'Rattrapé !'],
  ['\u0001 a destination', '\u0001 à destination'],
  ['<b>Décollé</b>', '<b>Décolle</b>']
];

function caseLike(src, rep) {
  if (src === src.toUpperCase() && src.length > 1) return rep.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

/* Remplace les mots du texte libre ; `vocab` (facultatif) collecte les mots vus. */
function fixText(t, vocab) {
  let out = '', last = 0;
  const words = [...t.matchAll(WORD)];
  for (let i = 0; i < words.length; i++) {
    const m = words[i], w = m[0], lw = w.toLowerCase();
    let rep = null;
    if (lw === 'a') {
      const prev = i > 0 && t.slice(words[i - 1].index + words[i - 1][0].length, m.index).trim() === '' ? words[i - 1][0].toLowerCase() : null;
      const between = i > 0 ? t.slice(words[i - 1].index + words[i - 1][0].length, m.index) : '';
      const nextM = words[i + 1];
      const gap = nextM ? t.slice(m.index + 1, nextM.index) : '';
      const next = nextM && /^\s+$/.test(gap) ? nextM[0].toLowerCase() : null;
      const prevApos = /'\s*$/.test(between);
      /* Sujet juste avant : un nom (Coco a, Biscuit a) ou une expression (${nom} a). */
      const prevName = (prev && /^(coco|biscuit)$/.test(prev)) || /\u0001\s*$/.test(t.slice(0, m.index));
      const afterA = t.slice(m.index + 1);
      if (i > 0 && words[i - 1][0].toLowerCase() === 'jusqu' && prevApos) rep = 'à';          // jusqu'à
      else if (next && (A_NEXT.has(next) || isInf(next) || /^\d/.test(afterA.trim())) && !(prev && A_SUBJ.has(prev)) && !prevApos && !prevName) rep = 'à';
      else if (!next && /^\s+(\d|\u0001)/.test(afterA) && !(prev && A_SUBJ.has(prev)) && !prevApos && !prevName) rep = 'à';
    } else if (Object.prototype.hasOwnProperty.call(DICT, lw)) {
      const d = DICT[lw];
      rep = Array.isArray(d) ? pickForm(t, words, i, d) : d;
    }
    else if (vocab && /^[a-z]+$/i.test(w) && w.length > 1) vocab.set(lw, (vocab.get(lw) || 0) + 1);
    if (rep) { out += t.slice(last, m.index) + caseLike(w, rep); last = m.index + w.length; }
  }
  out += t.slice(last);
  for (const [bad, good] of EXCEPT) out = out.split(bad).join(good);
  return out;
}

/* Texte qui peut contenir du HTML : on ne touche qu'au texte hors balises et aux attributs lisibles.
   `state.inTag` est garde d'un morceau de gabarit au suivant. */
const READ_ATTR = /\b(aria-label|title|alt|placeholder)\s*=\s*(["'])(.*?)\2/g;
function fixMarkup(s, state, vocab) {
  let out = '', i = 0;
  while (i < s.length) {
    if (state.inTag) {
      const j = s.indexOf('>', i);
      const chunk = j < 0 ? s.slice(i) : s.slice(i, j + 1);
      out += chunk.replace(READ_ATTR, (all, n, q, v) => `${n}=${q}${fixText(v, vocab)}${q}`);
      if (j < 0) return out;
      state.inTag = false; i = j + 1;
    } else {
      const j = s.indexOf('<', i);
      const looksTag = j >= 0 && /[a-zA-Z/!]/.test(s[j + 1] || '');
      if (j < 0) { out += fixText(s.slice(i), vocab); return out; }
      out += fixText(s.slice(i, j), vocab);
      if (looksTag) { state.inTag = true; out += '<'; i = j + 1; } else { out += '<'; i = j + 1; }
    }
  }
  return out;
}

function parentInfo(anc) {
  const p = anc[anc.length - 2], pp = anc[anc.length - 3];
  return { p, pp };
}

function skipLiteral(node, anc) {
  const { p } = parentInfo(anc);
  if (!p) return false;
  if (p.type === 'ImportDeclaration' || p.type === 'ExportNamedDeclaration' || p.type === 'ExportAllDeclaration' || p.type === 'ImportExpression') return true;
  if (p.type === 'Property' && p.key === node) return true;
  if (p.type === 'MemberExpression' && p.property === node) return true;
  if (p.type === 'CallExpression' && p.arguments[0] === node) {
    const c = p.callee;
    const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : '';
    if (SKIP_CALLEE.has(name)) return true;
  }
  if (p.type === 'BinaryExpression' && ['===', '!==', '==', '!=', 'in'].includes(p.operator)) return true;
  if (p.type === 'SwitchCase') return true;
  return false;
}

/* Parcours manuel de l'AST avec la pile des ancetres. */
function walk(node, anc, visit) {
  if (!node || typeof node.type !== 'string') return;
  anc.push(node);
  visit(node, anc);
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && walk(x, anc, visit));
    else if (v && typeof v.type === 'string') walk(v, anc, visit);
  }
  anc.pop();
}

function processJs(src, vocab) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  walk(ast, [], (node, anc) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const v = node.value;
      if (!isWordy(v) || identLike(v) || skipLiteral(node, anc)) return;
      if (/^(#|\.|\/|https?:)|rgba?\(|\bpx\b|\d+(px|rem|vh|vw|deg)\b/.test(v) && !/\s[a-zA-Z]{3,}\s/.test(v)) return;
      const raw = src.slice(node.start + 1, node.end - 1);
      const fixed = /</.test(raw) ? fixMarkup(raw, { inTag: false }, vocab) : fixText(raw, vocab);
      if (fixed !== raw) edits.push([node.start + 1, node.end - 1, fixed]);
    } else if (node.type === 'TemplateLiteral') {
      const { p } = parentInfo(anc);
      if (p && p.type === 'TaggedTemplateExpression') return;
      if (p && p.type === 'CallExpression' && p.arguments[0] === node) {
        const c = p.callee;
        const name = c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : c.type === 'Identifier' ? c.name : '';
        if (SKIP_CALLEE.has(name)) return;
      }
      /* Un ${...} avant ou apres le morceau compte comme du texte (EXPR) : « Trouve ${n} étoiles »
         n'est pas un mot en fin de phrase. */
      const state = { inTag: false };
      node.quasis.forEach((q, qi) => {
        const raw = src.slice(q.start, q.end);
        /* « deco${id} » : morceau d'identifiant colle a une expression, jamais du texte. */
        if (!isWordy(raw) || (node.expressions.length && identLike(raw) && !/\s/.test(raw))) { fixMarkup(raw, state, null); return; }
        const pre = qi > 0 ? EXPR : '', post = qi < node.quasis.length - 1 ? EXPR : '';
        let fixed = fixMarkup(pre + raw + post, state, vocab);
        fixed = fixed.slice(pre.length, fixed.length - post.length);
        if (fixed !== raw) edits.push([q.start, q.end, fixed]);
      });
    }
  });
  edits.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, t] of edits) out = out.slice(0, s) + t + out.slice(e);
  return { out, n: edits.length };
}

function processHtml(src, vocab) {
  /* On coupe autour de <script>...</script> et <style>...</style>, laisses intacts. */
  const parts = src.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->)/);
  let n = 0;
  const out = parts.map(pt => {
    if (/^<(script|style|!--)/.test(pt)) return pt;
    const f = fixMarkup(pt, { inTag: false }, vocab);
    if (f !== pt) n++;
    return f;
  }).join('');
  return { out, n };
}

const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).map(f => path.join('js', f));
files.push('index.html');
const vocab = new Map();
let total = 0;
for (const f of files) {
  const full = path.join(ROOT, f);
  const src = fs.readFileSync(full, 'utf8');
  const { out, n } = f.endsWith('.html') ? processHtml(src, mode === '--words' ? vocab : null) : processJs(src, mode === '--words' ? vocab : null);
  if (out !== src) {
    total++;
    if (mode === '--dry') {
      const a = src.split('\n'), b = out.split('\n');
      const changed = a.filter((l, i) => l !== b[i]).length;
      console.log(`${f}: ${changed} ligne(s)`);
    }
    if (mode === '--apply') fs.writeFileSync(full, out);
  }
  if (mode === '--diff' && out !== src) {
    const a = src.split('\n'), b = out.split('\n');
    a.forEach((l, i) => { if (l !== b[i]) console.log(`${f}:${i + 1}\n  - ${l.trim().slice(0, 160)}\n  + ${b[i].trim().slice(0, 160)}`); });
  }
}
if (mode === '--words') {
  const list = [...vocab.entries()].sort((a, b) => b[1] - a[1]);
  console.log(list.map(([w, c]) => `${w} ${c}`).join('\n'));
} else console.log(`${total} fichier(s) ${mode === '--apply' ? 'modifies' : 'a modifier'}`);
