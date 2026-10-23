const KEY = 'rapport-encombrants-v1';

const DEFAULTS = {
  users: [],
  currentUser: null,
  operations: [],
  conclusions: ['CT des bacs et du Tri', 'Dépôts sauvages'],
  controls: [], // { id, date:'YYYY-MM-DD', time:'HH:MM', address, num, operation, conclusion, user }
  email: '',
  theme: 'auto', // auto | light | dark
};

let state = load();

function load() {
  try {
    const { addresses, ...saved } = JSON.parse(localStorage.getItem(KEY) || '{}'); // `addresses` : ancienne clé abandonnée
    return { ...structuredClone(DEFAULTS), ...saved };
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
}

export function addTo(list, value) {
  value = value.trim();
  if (!value || state[list].includes(value)) return;
  set({ [list]: [...state[list], value] });
}

export function removeFrom(list, value) {
  set({ [list]: state[list].filter(v => v !== value) });
  if (list === 'users' && state.currentUser === value) set({ currentUser: null });
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addControl(c) {
  set({ controls: [...state.controls, { id: Date.now(), date: todayISO(), user: state.currentUser, ...c }] });
}

export function removeControl(id) {
  set({ controls: state.controls.filter(c => c.id !== id) });
}

export function controlsOf(date, user) {
  return state.controls
    .filter(c => c.date === date && c.user === user)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function clearControls(date, user) {
  set({ controls: state.controls.filter(c => !(c.date === date && c.user === user)) });
}

export function datesOf(user) {
  return [...new Set(state.controls.filter(c => c.user === user).map(c => c.date))].sort().reverse();
}
