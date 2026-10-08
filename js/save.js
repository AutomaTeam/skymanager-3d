/* ============================================================
   save.js — Sauvegardes centralisees (B05)
   Une cle localStorage = un objet JSON { ...donnees, _v: version }.
   - load()  : lit, repare (JSON invalide, mauvais type), fusionne avec
               les valeurs par defaut, migre si la version a change.
   - write() : ecrit sans jamais lever (Safari prive, quota plein).
   - resetAll() : efface toutes les cles `skymanager.*` sauf celles gardees.
   Module pur : seul `localStorage` est utilise, via un acces protege.
   ============================================================ */

export const PREFIX = 'skymanager.';

function store() { try { return globalThis.localStorage || null; } catch (e) { return null; } }

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* key : nom complet ('skymanager.pet'). defaults : objet de depart (copie, jamais modifie).
   version : numero attendu ; migrate(old, fromVersion) -> objet, appele si _v differe. */
export function load(key, defaults = {}, version = 1, migrate = null) {
  const out = Object.assign({}, defaults);
  const st = store();
  if (!st) return out;
  let d = null;
  try { d = JSON.parse(st.getItem(key) || 'null'); } catch (e) { d = null; }
  if (!isObj(d)) return out;
  const from = typeof d._v === 'number' ? d._v : 0;
  if (from !== version && typeof migrate === 'function') {
    try { const m = migrate(d, from); if (isObj(m)) d = m; } catch (e) { /* on garde d tel quel */ }
  }
  delete d._v;
  return Object.assign(out, d);
}

export function write(key, data, version = 1) {
  const st = store();
  if (!st) return false;
  try { st.setItem(key, JSON.stringify(Object.assign({}, data, { _v: version }))); return true; } catch (e) { return false; }
}

export function keys() {
  const st = store();
  const out = [];
  if (!st) return out;
  try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } } catch (e) { /* ignore */ }
  return out;
}

/* keep : liste de noms courts ('comfort') ou complets ('skymanager.comfort'). */
export function resetAll({ keep = [] } = {}) {
  const st = store();
  if (!st) return 0;
  const kept = new Set(keep.map(k => (k.startsWith(PREFIX) ? k : PREFIX + k)));
  let n = 0;
  for (const k of keys()) if (!kept.has(k)) { try { st.removeItem(k); n++; } catch (e) { /* ignore */ } }
  return n;
}

/* Export / import de toutes les cles (sauvegarde dans un fichier, tache I07). */
export function exportAll() {
  const st = store();
  const out = {};
  if (!st) return out;
  for (const k of keys()) { try { out[k] = st.getItem(k); } catch (e) { /* ignore */ } }
  return out;
}
export function importAll(obj) {
  const st = store();
  if (!st || !isObj(obj)) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith(PREFIX) || typeof v !== 'string' || v.length > 2e6) continue;
    try { JSON.parse(v); st.setItem(k, v); n++; } catch (e) { /* cle ignoree */ }
  }
  return n;
}
