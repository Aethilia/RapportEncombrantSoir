const KEY = 'rapport-encombrants-v1';

// Types de contrôle : `label` s'affiche dans l'appli, `title` dans le titre de l'Excel, `file` dans son nom.
export const TYPES = {
  enc: { label: 'Encombrants', title: 'ENCOMBRANTS', file: 'Encombrants' },
  om: { label: 'Ordures Ménagères', title: 'ORDURES MÉNAGÈRES', file: 'Ordures_Menageres' },
};

const DEFAULTS = {
  users: [],
  currentUser: null,
  type: '', // type de contrôle en cours ('' = à choisir) — local à chaque téléphone
  lists: {
    enc: { operations: [], conclusions: ['CT des bacs et du Tri', 'Dépôts sauvages'] },
    om: { operations: [], conclusions: [] },
  },
  controls: [], // { id, type, date:'YYYY-MM-DD', time:'HH:MM', address, num, operation, conclusion, user }
  theme: 'auto', // auto | light | dark
  team: '', // code d'équipe (synchronisation)
};

// Clés partagées entre téléphones (le reste — currentUser, type, theme, team — reste local).
const SHARED = ['users', 'lists'];

// Complète une structure de listes (ou convertit l'ancienne forme à plat, qui concernait les encombrants).
export function normalizeLists(l = {}) {
  const out = {};
  for (const t of Object.keys(TYPES)) {
    out[t] = { operations: [...(l[t]?.operations ?? [])], conclusions: [...(l[t]?.conclusions ?? [])] };
  }
  return out;
}
export const hooks = {}; // branchés par sync.js

let state = load();

function load() {
  try {
    // `addresses`, `email` : anciennes clés abandonnées ; `operations`/`conclusions` : ancienne forme (encombrants).
    const { addresses, email, operations, conclusions, ...saved } = JSON.parse(localStorage.getItem(KEY) || '{}');
    const base = structuredClone(DEFAULTS);
    if (!saved.lists) {
      saved.lists = normalizeLists({ enc: { operations: operations ?? [], conclusions: conclusions ?? base.lists.enc.conclusions } });
    } else {
      saved.lists = normalizeLists(saved.lists);
    }
    return { ...base, ...saved };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

export const get = () => state;

export function set(patch) {
  state = { ...state, ...patch };
  save();
  if (SHARED.some(k => k in patch)) hooks.settings?.();
}

// Données reçues du serveur : on les applique sans les renvoyer.
export function applyRemote(patch) {
  state = { ...state, ...patch };
  save();
}

export const listOf = key => state.lists[state.type]?.[key] ?? [];

function setList(key, items) {
  const t = state.type;
  if (!TYPES[t]) return;
  set({ lists: { ...state.lists, [t]: { ...state.lists[t], [key]: items } } });
}

// `list` : 'users' (global) ou 'operations' / 'conclusions' (propres au type en cours).
export function addTo(list, value) {
  value = value.trim();
  if (!value) return;
  if (list === 'users') {
    if (!state.users.includes(value)) set({ users: [...state.users, value] });
    return;
  }
  if (!listOf(list).includes(value)) setList(list, [...listOf(list), value]);
}

export function removeFrom(list, value) {
  if (list === 'users') {
    set({ users: state.users.filter(v => v !== value) });
    if (state.currentUser === value) set({ currentUser: null, type: '' });
    return;
  }
  setList(list, listOf(list).filter(v => v !== value));
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const typeOf = c => c.type || 'enc'; // anciens contrôles sans type : encombrants

export function addControl(c) {
  const control = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: state.type, date: todayISO(), user: state.currentUser, ...c };
  set({ controls: [...state.controls, control] });
  hooks.controlAdd?.(control);
}

export function removeControl(id) {
  set({ controls: state.controls.filter(c => String(c.id) !== String(id)) });
  hooks.controlsDel?.([id]);
}

const byTime = (a, b) => a.time.localeCompare(b.time);

export function controlsOf(date, user, type = state.type) {
  return state.controls.filter(c => c.date === date && c.user === user && typeOf(c) === type).sort(byTime);
}

export function clearControls(date, user, type = state.type) {
  const gone = controlsOf(date, user, type);
  set({ controls: state.controls.filter(c => !gone.includes(c)) });
  hooks.controlsDel?.(gone.map(c => c.id));
}

export const controlsOfAll = (date, type = state.type) =>
  state.controls.filter(c => c.date === date && typeOf(c) === type).sort(byTime);

const datesDesc = list => [...new Set(list.map(c => c.date))].sort().reverse();

export const datesOfAll = (type = state.type) => datesDesc(state.controls.filter(c => typeOf(c) === type));

export const datesOf = (user, type = state.type) => datesDesc(state.controls.filter(c => c.user === user && typeOf(c) === type));
