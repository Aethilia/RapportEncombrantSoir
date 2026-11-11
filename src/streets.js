// Orthographe officielle des rues de Nice : Base Adresse Nationale (service de géocodage de l'IGN, gratuit, sans clé).
// Sans réseau ou sans résultat fiable, l'adresse reste telle quelle : on n'invente jamais une rue.

const API = 'https://data.geopf.fr/geocodage/search';
const CITY = '06088'; // code INSEE de Nice
const cache = new Map();

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const TYPES = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'chemin', 'route', 'allee', 'impasse', 'quai', 'promenade', 'square', 'montee',
  'traverse', 'corniche', 'esplanade', 'passage', 'cours', 'descente', 'parvis', 'carrefour', 'cite', 'residence', 'lotissement', 'parc', 'rond', 'point', 'avenue']);
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en', 'saint', 'sainte', 'st', 'ste']);
const keyWords = s => norm(s).split(/[\s\-,/.]+/).filter(w => w.length > 1 && !TYPES.has(w) && !SMALL.has(w));

/** Rues de Nice proches du texte : [{ name, score }] (meilleure d'abord). Vide si hors-ligne ou en erreur. */
export async function search(q, { limit = 5, autocomplete = false } = {}) {
  q = q.trim();
  if (q.length < 3 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
  const key = `${autocomplete ? 1 : 0}|${limit}|${norm(q)}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${API}?${new URLSearchParams({ q, citycode: CITY, type: 'street', limit: String(limit), autocomplete: autocomplete ? '1' : '0' })}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set(), out = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const name = p.name || p.street || p.label;
      if (!name || seen.has(name) || (p.citycode && p.citycode !== CITY)) continue;
      seen.add(name);
      out.push({ name, score: Number(p.score) || 0 });
    }
    cache.set(key, out);
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Une rue proposée doit partager au moins un mot (hors « rue », « de »…) avec ce qui a été dit.
function related(said, name) {
  const a = keyWords(said), b = keyWords(name);
  if (!a.length) return true;
  return a.some(x => b.some(y => x === y || (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4))));
}

/** Suggestions pendant la frappe : seulement les rues qui ressemblent à ce qui est tapé. */
export async function suggest(q) {
  return (await search(q, { autocomplete: true, limit: 6 })).filter(r => related(q, r.name)).slice(0, 5).map(r => r.name);
}

/** Corrige un nom de rue : { value, sure, options }. */
export async function correctStreet(text) {
  const res = (await search(text, { limit: 4 })).filter(r => related(text, r.name));
  if (!res.length) return { value: cap(text), sure: false, options: [] };
  const [best, second] = res;
  const sure = best.score >= 0.75 && (!second || best.score - second.score >= 0.05);
  return { value: best.score >= 0.6 ? best.name : cap(text), sure, options: res.map(r => r.name), score: best.score };
}

/* ---------- Angles ---------- */
const ANGLE_RE = /^\s*(?:a\s+l\s*)?(?:angle|coin)s?\b/;
export const isAngle = text => ANGLE_RE.test(norm(text));

// « Angle rue de France et de la rue Meyerbeer » → ['rue de France', 'rue Meyerbeer'] ; null si on ne sait pas couper.
export function splitAngle(text) {
  let t = text.trim().replace(/^(?:à\s+|a\s+)?(?:l['’]\s*|l\s+)?(?:angles?|coin)\s+/i, '')
    .replace(/^(?:de\s+|du\s+|des\s+|d['’]\s*)?(?:la\s+|l['’]\s*|le\s+|les\s+)?/i, '');
  const clean = s => s.trim().replace(/^(?:de\s+|du\s+|des\s+|d['’]\s*)?(?:la\s+|l['’]\s*|le\s+|les\s+)?/i, '').replace(/[\s,;.]+$/, '').trim();
  const sep = t.match(/\s*\/\s*|\s+(?:et|avec|x)\s+/i);
  if (sep) {
    const a = clean(t.slice(0, sep.index)), b = clean(t.slice(sep.index + sep[0].length));
    return a && b ? [a, b] : null;
  }
  // Pas de « et » : on coupe devant le second « rue », « avenue »…
  const words = t.split(/\s+/);
  const at = words.findIndex((w, i) => i > 0 && TYPES.has(norm(w)));
  return at > 0 ? [clean(words.slice(0, at).join(' ')), clean(words.slice(at).join(' '))] : null;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Corrige l'adresse dictée (voie simple ou angle) : { value, sure, options }.
 * `options` : rues proposées quand on n'est pas sûr (voie simple uniquement).
 */
export async function correctAddress(text) {
  text = (text ?? '').trim();
  if (!text) return { value: text, sure: true, options: [] };
  if (!isAngle(text)) return correctStreet(text);

  let parts = splitAngle(text);
  if (!parts) {
    // « Angle Gambetta Alsace-Lorraine » : on essaie chaque coupure et on garde la plus crédible.
    const words = text.replace(/^(?:à\s+|a\s+)?(?:l['’]\s*|l\s+)?(?:angles?|coin)\s+(?:de\s+|du\s+|d['’]\s*)?(?:la\s+|l['’]\s*|le\s+)?/i, '').split(/\s+/);
    if (words.length < 2 || words.length > 6) return { value: cap(text), sure: false, options: [] };
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const [a, b] = await Promise.all([correctStreet(words.slice(0, i).join(' ')), correctStreet(words.slice(i).join(' '))]);
      const s = Math.min(a.score ?? 0, b.score ?? 0);
      if (a.options.length && b.options.length && (!best || s > best.s)) best = { s, a, b };
    }
    if (!best || best.s < 0.6) return { value: cap(text), sure: false, options: [] };
    return { value: `Angle ${best.a.value} / ${best.b.value}`, sure: best.a.sure && best.b.sure, options: [] };
  }
  const [a, b] = await Promise.all(parts.map(correctStreet));
  return { value: `Angle ${cap(a.value)} / ${cap(b.value)}`, sure: a.sure && b.sure, options: [] };
}
