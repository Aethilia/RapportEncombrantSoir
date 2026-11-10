// Saisie vocale (option) : reconnaissance de la parole du téléphone + découpage de la phrase dictée
// en champs du contrôle (date, heure, adresse, n°, opération, conclusion).

const Rec = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const supported = !!Rec;

// Écoute le micro. `onText(texte)` reçoit le texte reconnu au fil de l'eau ; renvoie une fonction d'arrêt.
export function listen({ onText, onEnd, onError }) {
  const r = new Rec();
  r.lang = 'fr-FR';
  r.continuous = true;
  r.interimResults = true;
  let done = '';
  r.onresult = e => {
    let live = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) done += (done ? ' ' : '') + t.trim();
      else live += t;
    }
    onText((done + ' ' + live).trim(), done);
  };
  r.onerror = e => onError?.(e.error);
  r.onend = () => onEnd?.();
  r.start();
  return () => { try { r.stop(); } catch { /* déjà arrêté */ } };
}

/* ---------- Mot de fin ---------- */
// « … fin », « fin du contrôle », « terminé », « clôturer », « enregistrer » en DERNIER mot : clôture le contrôle.
const END_RE = /[\s,;.!?]*\b(fin(\s+d[ue]\s+(controle|saisie))?|termine[e]?|c'?est\s+termine|cloture[rz]?|cloture|enregistre[rz]?|valide[rz]?)[\s,;.!?]*$/;

// Renvoie le texte sans le mot de fin s'il est présent à la fin, sinon null.
export function endCommand(text) {
  const plain = norm(text);
  const m = plain.match(END_RE);
  if (!m) return null;
  // `norm` garde la longueur sauf pour les apostrophes retirées : on coupe sur le nombre de mots.
  const words = text.trim().split(/\s+/);
  const drop = m[0].split(/\s+/).filter(w => /[a-z]/.test(w)).length;
  return words.slice(0, Math.max(0, words.length - drop)).join(' ').replace(/[\s,;.!?]+$/, '');
}

/* ---------- Découpage de la phrase ---------- */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/°/g, 'o');

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en', 'un', 'une', 'sur', 'pour', 'par', 'avec', 'sans', 'dans']);
const STREET = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'chemin', 'route', 'allee', 'impasse', 'quai', 'promenade', 'square', 'montee', 'traverse',
  'corniche', 'esplanade', 'passage', 'cours', 'descente', 'rond-point', 'parvis', 'square', 'carrefour', 'cite', 'residence', 'lotissement', 'parc']);
const LEAD = new Set(['a', 'au', 'aux', 'et', 'puis', 'devant', 'vers', 'sur', 'en', 'adresse', 'alors', 'euh', 'donc', 'ensuite', 'le', 'la', 'les']);
const TRAIL = new Set(['et', 'puis', 'euh', 'donc', 'alors', 'ensuite', 'avec', 'a', 'au']);

const UNITS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const TENS = { vingt: 20, trente: 30, quarante: 40, cinquante: 50 };

function tokenize(text) {
  const out = [];
  for (const part of text.split(/([,;.!?]|\s+)/)) {
    if (!part || /^\s+$/.test(part)) continue;
    if (/^[,;.!?]$/.test(part)) { out.push({ raw: '', n: '|', sep: true }); continue; }
    for (const p of part.split(/(?<=['’])/)) out.push({ raw: p, n: norm(p) });
  }
  return out;
}

// « vingt-deux », « dix sept », « quarante et un » → un seul jeton chiffré.
function wordsToDigits(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const parts = toks[i].n.split('-');
    const isNum = w => w in UNITS || w in TENS || w === 'et';
    if (!parts.every(isNum) || parts[0] === 'et') { out.push(toks[i]); continue; }
    // « un » / « une » seuls sont des articles, sauf devant « heure ».
    if (parts.length === 1 && (parts[0] === 'un' || parts[0] === 'une') && !/^heure/.test(toks[i + 1]?.n ?? '')) { out.push(toks[i]); continue; }
    let words = [...parts], j = i;
    while (j + 1 < toks.length && toks[j + 1].n.split('-').every(isNum)) { j++; words.push(...toks[j].n.split('-')); }
    let val = 0, k = 0;
    if (words[k] in TENS) { val = TENS[words[k++]]; if (words[k] === 'et') k++; if (words[k] in UNITS && UNITS[words[k]] < 10) val += UNITS[words[k++]]; }
    else if (words[k] === 'dix' && ['sept', 'huit', 'neuf'].includes(words[k + 1])) { val = 10 + UNITS[words[k + 1]]; k += 2; }
    else if (words[k] in UNITS) val = UNITS[words[k++]];
    // On ne garde que les mots réellement utilisés ; le reste repart dans le flux.
    const used = words.slice(0, k);
    let consumed = 0, c = 0;
    while (c < used.length) { c += toks[i + consumed].n.split('-').length; consumed++; }
    out.push({ raw: String(val), n: String(val) });
    i += consumed - 1;
  }
  return out;
}

const stemEq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 5) === b.slice(0, 5));
const sig = s => norm(s).split(/[\s\-,;.!?]+/).filter(w => w && !STOP.has(w));

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Meilleur élément d'une liste présent dans les jetons libres : { item, score, pos } ou null.
function bestMatch(items, toks, used) {
  let best = null;
  for (const item of items) {
    const words = sig(item);
    if (!words.length) continue;
    const pos = [];
    for (const w of words) {
      const i = toks.findIndex((t, k) => !used[k] && !t.sep && !pos.includes(k) && stemEq(t.n, w));
      if (i >= 0) pos.push(i);
    }
    const score = pos.length / words.length;
    if (score >= 0.6 && (!best || score > best.score || (score === best.score && words.length > best.len))) best = { item, score, pos, len: words.length };
  }
  return best;
}

/**
 * Découpe une phrase dictée. `lists` : { operations, conclusions }, `today` : 'YYYY-MM-DD'.
 * Renvoie uniquement les champs reconnus : { date, time, num, address, operation, conclusion }.
 */
export function parse(text, { operations = [], conclusions = [], today }) {
  const toks = wordsToDigits(tokenize(text));
  const used = toks.map(t => t.sep);
  const take = (...ks) => ks.forEach(k => { used[k] = true; });
  const n = k => toks[k]?.n ?? '';
  const isInt = k => /^\d{1,2}$/.test(n(k));
  const r = {};

  // Date : hier / avant-hier / aujourd'hui.
  for (let k = 0; k < toks.length; k++) {
    if (n(k) === 'avant' && n(k + 1) === 'hier') { r.date = addDays(today, -2); take(k, k + 1); break; }
    if (n(k) === 'avant-hier') { r.date = addDays(today, -2); take(k); break; }
    if (n(k) === 'hier') { r.date = addDays(today, -1); take(k); break; }
    if (n(k) === 'aujourdhui' || (n(k) === 'aujourd' && n(k + 1) === 'hui')) { r.date = today; take(k); if (n(k + 1) === 'hui') take(k + 1); break; }
  }

  // Heure : 22h15, 22:15, 22 h 15, 22 heures 15, minuit, midi, « et quart », « et demie ».
  for (let k = 0; k < toks.length && !r.time; k++) {
    if (used[k]) continue;
    let h = null, m = 0, end = k;
    const one = n(k).match(/^(\d{1,2})[h:](\d{1,2})?$/);
    if (one) { h = +one[1]; m = +(one[2] ?? 0); }
    else if (isInt(k) && /^(h|heures?)$/.test(n(k + 1))) { h = +n(k); end = k + 1; if (isInt(k + 2)) { m = +n(k + 2); end = k + 2; } }
    else if (n(k) === 'minuit' || n(k) === 'midi') { h = n(k) === 'midi' ? 12 : 0; if (isInt(k + 1)) { m = +n(k + 1); end = k + 1; } }
    if (h === null) continue;
    if (n(end + 1) === 'et' && n(end + 2) === 'quart') { m = 15; end += 2; }
    else if (n(end + 1) === 'et' && /^demie?$/.test(n(end + 2))) { m = 30; end += 2; }
    else if (n(end + 1) === 'moins' && n(end + 2) === 'le' && n(end + 3) === 'quart') { h = (h + 23) % 24; m = 45; end += 3; }
    if (h > 23 || m > 59) continue;
    r.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    for (let i = k; i <= end; i++) take(i);
    if (['a', 'vers', 'heure'].includes(n(k - 1)) && !used[k - 1]) take(k - 1);
  }

  // Opération / conclusion annoncées : « opération … », « conclusion … ».
  const MARK = { operation: /^(operation|operations|constat)$/, conclusion: /^(conclusion|conclusions)$/ };
  const marks = [];
  toks.forEach((t, k) => { for (const f in MARK) if (!used[k] && MARK[f].test(t.n)) marks.push({ f, k }); });
  for (const [i, { f, k }] of marks.entries()) {
    const stop = marks[i + 1]?.k ?? toks.length;
    const seg = [];
    for (let j = k + 1; j < stop && !toks[j].sep && !used[j]; j++) seg.push(j);
    take(k);
    if (!seg.length) continue;
    const list = f === 'operation' ? operations : conclusions;
    const sub = seg.map(j => toks[j]);
    const m = bestMatch(list, sub, sub.map(() => false));
    r[f] = m ? m.item : seg.map(j => toks[j].raw).join(' ').replace(/^\w/, c => c.toUpperCase());
    take(...seg);
  }

  // Numéro : « numéro 12 », « n° 12 bis », « au 12 », ou « 12 avenue … ».
  for (let k = 0; k < toks.length && !r.num; k++) {
    if (used[k]) continue;
    let at = -1;
    if (/^(numero|no|n)$/.test(n(k)) && /^\d+$/.test(n(k + 1)) && !used[k + 1]) { at = k + 1; take(k); }
    else if (/^\d+$/.test(n(k)) && (STREET.has(n(k + 1)) || /^(bis|ter)$/.test(n(k + 1)) && STREET.has(n(k + 2)))) at = k;
    else if (n(k) === 'au' && /^\d+$/.test(n(k + 1)) && !used[k + 1]) { at = k + 1; take(k); }
    if (at < 0) continue;
    r.num = n(at);
    take(at);
    if (/^(bis|ter)$/.test(n(at + 1))) { r.num += ' ' + n(at + 1); take(at + 1); }
  }

  // Éléments des listes cités sans être annoncés : le plus sûr d'abord.
  const pick = { operation: operations, conclusion: conclusions };
  for (let round = 0; round < 2; round++) {
    let best = null, field = null;
    for (const f in pick) {
      if (r[f]) continue;
      const m = bestMatch(pick[f], toks, used);
      if (m && (!best || m.score > best.score)) { best = m; field = f; }
    }
    if (!best) break;
    r[field] = best.item;
    take(...best.pos);
  }

  // Adresse : le morceau restant qui contient « rue », « avenue »… (sinon le plus long).
  const runs = [];
  let cur = [];
  toks.forEach((t, k) => { if (used[k]) { if (cur.length) runs.push(cur); cur = []; } else cur.push(k); });
  if (cur.length) runs.push(cur);
  let run = runs.find(rn => rn.some(k => STREET.has(n(k))));
  if (run) run = run.slice(run.findIndex(k => STREET.has(n(k))));
  else run = runs.sort((a, b) => b.length - a.length)[0];
  if (run) {
    while (run.length && LEAD.has(n(run[0]))) run = run.slice(1);
    while (run.length && TRAIL.has(n(run[run.length - 1]))) run = run.slice(0, -1);
    const addr = run.map(k => toks[k].raw).join(' ').replace(/(['’]) /g, '$1').trim();
    if (addr) r.address = addr.charAt(0).toUpperCase() + addr.slice(1);
  }
  return r;
}
