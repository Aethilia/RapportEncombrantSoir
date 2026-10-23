import * as store from './store.js';
import { buildFile, downloadFile, frDate } from './export.js';
import * as sync from './sync.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowHM = () => new Date().toTimeString().slice(0, 5);

const PATHS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  check: '<path d="M5 12l5 5 9-9"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5a4 4 0 0 0 8 0h5"/>',
};
const ic = (n, size = 20) => `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;

let tab = 'home';
let syncStatus = ''; // '' | ok | offline | error
let histAll = false;
let wizard = null; // { step, time, address, num, operation, conclusion }

/* ---------- Thème ---------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Automatique', light: 'Clair', dark: 'Sombre' };

function applyTheme() {
  const t = store.get().theme;
  document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#004f94');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function cycleTheme() {
  const t = THEMES[(THEMES.indexOf(store.get().theme) + 1) % THEMES.length];
  store.set({ theme: t });
  applyTheme();
  toast(`Thème : ${THEME_LABEL[t]}`);
  render();
}

/* ---------- Utilitaires d'affichage ---------- */
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', innerHTML: `${ic('check', 18)}<span>${esc(msg)}</span>` });
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = d => cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
const isoToDate = iso => new Date(iso + 'T12:00:00');

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
}

function themeBtn() {
  const t = store.get().theme;
  return `<button class="icon-btn" data-act="theme" aria-label="Thème : ${THEME_LABEL[t]}">${ic(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'auto', 20)}</button>`;
}

function controlCard(c, withDelete = true, author = false) {
  return `<div class="card ctrl"><div class="time">${esc(c.time.replace(':', 'h'))}</div>
    <div class="body"><div class="addr">${ic('pin', 16)}<span>${esc(c.address)}${c.num ? ' · n°' + esc(c.num) : ''}</span></div>
      <div><span class="tag">${esc(c.operation)}</span><span class="tag">${esc(c.conclusion)}</span>${author ? `<span class="tag who">${esc(c.user ?? '')}</span>` : ''}</div></div>
    ${withDelete ? `<button class="del" data-delc="${c.id}" aria-label="Supprimer">${ic('trash', 20)}</button>` : ''}</div>`;
}

function manager(list, label, placeholder) {
  const items = store.get()[list];
  return `<div class="section-title"><span>${label}</span></div>
    <div class="card panel">
      <div class="addrow"><input id="in-${list}" placeholder="${placeholder}" enterkeyhint="done" autocomplete="off">
        <button class="btn" data-add="${list}" aria-label="Ajouter">${ic('plus', 24)}</button></div>
      <div class="chips">${items.map(v => `<div class="chip-row"><span>${esc(v)}</span>
        <button class="del" data-del="${list}" data-v="${esc(v)}" aria-label="Supprimer">${ic('trash', 19)}</button></div>`).join('') || '<p class="hint">Aucun élément</p>'}</div>
    </div>`;
}

/* ---------- Écrans ---------- */
function tabs() {
  const t = (id, icon, label) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${ic(icon, 22)}<span>${label}</span></button>`;
  return `<nav class="tabs">${t('home', 'home', 'Accueil')}${t('history', 'history', 'Historique')}${t('lists', 'list', 'Listes')}${t('users', 'users', 'Utilisateurs')}</nav>`;
}

function hero(inner = '', compact = false) {
  const s = store.get();
  return `<div class="hero ${compact ? 'compact' : ''}"><div class="hero-top">
    <img class="logo" src="icons/logo.png" alt="Métropole Nice Côte d’Azur">
    <div class="hero-actions">${themeBtn()}${s.currentUser ? `<button class="avatar" data-act="switch" aria-label="Changer d’utilisateur">${esc(initials(s.currentUser))}</button>` : ''}</div></div>${inner}</div>`;
}

function renderHome() {
  const s = store.get();
  const list = store.controlsOf(store.todayISO(), s.currentUser);
  const last = list.length ? list[list.length - 1].time.replace(':', 'h') : '—';
  app.innerHTML = hero(`<div class="greet"><small>${greeting()}</small><h1>${esc(s.currentUser)}</h1><div class="date">${longDate(new Date())}</div></div>`) +
    `<main class="pull">
      <div class="stats"><div class="card stat"><b>${list.length}</b><span>contrôle${list.length > 1 ? 's' : ''} aujourd’hui</span></div>
        <div class="card stat"><b>${last}</b><span>dernier contrôle</span></div></div>
      <div class="section-title"><span>Contrôles du jour</span></div>
      <div class="list">${list.map(c => controlCard(c)).join('') || `<div class="card empty">${ic('inbox', 34)}<div>Aucun contrôle pour le moment</div></div>`}</div>
      <button class="btn end" data-act="finish" ${list.length ? '' : 'disabled'}>${ic('download', 20)}Fin &amp; générer l’Excel</button>
    </main>
    <button class="btn fab" data-act="start">${ic('plus', 22)}Commencer</button>` + tabs();
}

function renderHistory() {
  const s = store.get();
  const today = store.todayISO();
  const dates = histAll ? store.datesOfAll() : store.datesOf(s.currentUser);
  const body = dates.map(date => {
    const list = histAll ? store.controlsOfAll(date) : store.controlsOf(date, s.currentUser);
    const d = isoToDate(date);
    const label = date === today ? 'Aujourd’hui' : longDate(d);
    return `<details class="card day"><summary>
        <div class="day-badge"><b>${d.getDate()}</b><small>${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></div>
        <div><div class="day-title">${esc(label)}</div><div class="day-sub">${list.length} contrôle${list.length > 1 ? 's' : ''}</div></div>${ic('chev', 20).replace('class="ic"', 'class="ic chev"')}</summary>
      <div class="day-body">${list.map(c => controlCard(c, false, histAll)).join('')}
        ${histAll ? '' : `<div class="day-actions"><button class="btn small ghost" data-act="resend" data-date="${date}">${ic('download', 17)}Télécharger l’Excel</button>
        <button class="btn small alt" data-act="delday" data-date="${date}">${ic('trash', 17)}Supprimer</button></div>`}</div></details>`;
  }).join('');
  const seg = `<div class="seg"><button data-act="hist-me" class="${histAll ? '' : 'on'}">Mes contrôles</button><button data-act="hist-all" class="${histAll ? 'on' : ''}">Toute l’équipe</button></div>`;
  app.innerHTML = hero('<h1 class="title">Historique</h1>', true) +
    `<main class="top">${sync.enabled && s.team ? seg : ''}${body || `<div class="card empty">${ic('history', 34)}<div>Aucun contrôle enregistré</div></div>`}</main>` + tabs();
}

function renderLists() {
  app.innerHTML = hero('<h1 class="title">Listes préétablies</h1>', true) +
    `<main class="top">${manager('operations', 'Opérations (constats)', 'Nouvelle opération')}${manager('conclusions', 'Conclusions (observation / action)', 'Nouvelle conclusion')}</main>` + tabs();
}

const STATUS_LABEL = { ok: 'Synchronisé', offline: 'Hors-ligne (synchronisation à la reconnexion)', error: 'Erreur de synchronisation', '': 'Connexion…' };

function teamBlock() {
  const { team } = store.get();
  if (!sync.enabled) return '';
  return `<div class="section-title"><span>Équipe</span></div>
    <div class="card panel"><div class="row-status"><span class="dot ${syncStatus || 'wait'}"></span><b>${esc(team)}</b></div>
    <div class="day-sub">${STATUS_LABEL[syncStatus]}</div>
    <button class="btn small alt" data-act="leave">${ic('back', 17)}Quitter l’équipe</button></div>`;
}

function renderTeamJoin() {
  app.innerHTML = hero(`<h1 class="title">Rejoindre l’équipe</h1><div class="date" style="opacity:.85;margin-top:4px;position:relative;z-index:1">Tous les téléphones qui saisissent le même code partagent utilisateurs, listes et contrôles.</div>`, true) +
    `<main class="top"><div class="card panel"><label for="in-team">Code d’équipe</label>
      <input id="in-team" placeholder="ex. encombrants-nice-2026" autocapitalize="none" autocorrect="off" autocomplete="off">
      <button class="btn" data-act="join">${ic('cloud', 20)}Rejoindre</button>
      <p class="hint">Choisissez un code long et difficile à deviner : il protège l’accès aux données.</p></div></main>`;
}

function renderUsers() {
  app.innerHTML = hero('<h1 class="title">Utilisateurs</h1>', true) +
    `<main class="top">${manager('users', 'Utilisateurs', 'Nom Prénom')}
      ${teamBlock()}</main>` + tabs();
}

function renderUserPicker() {
  const { users } = store.get();
  app.innerHTML = hero(`<h1 class="title">Contrôle Encombrants Soir</h1><div class="date" style="opacity:.85;margin-top:4px;position:relative;z-index:1">Qui utilise l’appli ?</div>`, true) +
    `<main class="top">${users.map(u => `<div class="card user-card"><button class="go" data-user="${esc(u)}"><span class="avatar">${esc(initials(u))}</span>${esc(u)}</button>
      <button class="del" data-del="users" data-v="${esc(u)}" aria-label="Supprimer">${ic('trash', 20)}</button></div>`).join('')}
      <div class="section-title"><span>Ajouter un utilisateur</span></div>
      <div class="card panel"><div class="addrow"><input id="in-users" placeholder="Nom Prénom" enterkeyhint="done" autocomplete="off">
      <button class="btn" data-add="users" aria-label="Ajouter">${ic('plus', 24)}</button></div></div></main>`;
}

const STEPS = ['Heure', 'Adresse', 'Opération', 'Conclusion'];

function renderWizard() {
  const w = wizard, s = store.get();
  const bar = `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="step-label"><h1>${STEPS[w.step]}</h1><span>Étape ${w.step + 1} sur 4</span></div>`;
  const pick = (list, key) => `<div class="pick">${list.map(v => `<button data-pick="${key}" data-v="${esc(v)}" class="${w[key] === v ? 'on' : ''}">${esc(v)}${w[key] === v ? ic('check', 20) : ''}</button>`).join('')}</div>`;
  let body, ok;
  if (w.step === 0) {
    body = `<div class="card panel"><label for="w-time">Heure du contrôle</label><input id="w-time" type="time" value="${esc(w.time)}"></div>`;
    ok = !!w.time;
  } else if (w.step === 1) {
    body = `<div class="card panel"><label for="w-addr">Adresse (voie)</label><input id="w-addr" placeholder="Ex. Av. Jean Médecin" value="${esc(w.address)}" autocomplete="off">
      <label for="w-num">N° (optionnel)</label><input id="w-num" inputmode="numeric" value="${esc(w.num)}" autocomplete="off"></div>`;
    ok = !!w.address;
  } else if (w.step === 2) {
    body = `<div class="card panel"><label>Opération (constat)</label>${s.operations.length ? pick(s.operations, 'operation') : '<p class="hint">Aucune opération en liste (onglet Listes).</p>'}
      <label for="w-op">Ou saisir manuellement</label><input id="w-op" value="${s.operations.includes(w.operation) ? '' : esc(w.operation)}" placeholder="Autre opération" autocomplete="off"></div>`;
    ok = !!w.operation;
  } else {
    body = `<div class="card panel"><label>Conclusion (observation / action)</label>${s.conclusions.length ? pick(s.conclusions, 'conclusion') : '<p class="hint">Aucune conclusion en liste (onglet Listes).</p>'}
      <label for="w-cc">Ou saisir manuellement</label><input id="w-cc" value="${s.conclusions.includes(w.conclusion) ? '' : esc(w.conclusion)}" placeholder="Autre conclusion" autocomplete="off"></div>`;
    ok = !!w.conclusion;
  }
  app.innerHTML = hero(bar, true) + `<main class="top">${body}</main>
    <div class="nav2"><button class="btn alt" data-act="back">${ic('back', 20)}${w.step ? 'Retour' : 'Annuler'}</button>
    <button class="btn" data-act="next" ${ok ? '' : 'disabled'}>${w.step === 3 ? ic('check', 20) + 'Enregistrer' : 'Suivant' + ic('chev', 20)}</button></div>`;
}

function render() {
  applyTheme();
  const s = store.get();
  if (sync.enabled && !s.team) return renderTeamJoin();
  if (!s.currentUser) return renderUserPicker();
  if (wizard) return renderWizard();
  ({ history: renderHistory, lists: renderLists, users: renderUsers }[tab] ?? renderHome)();
}

/* ---------- Assistant : lecture des champs ---------- */
function syncWizardInputs() {
  if (!wizard) return;
  const v = id => document.getElementById(id)?.value.trim();
  if (wizard.step === 0 && v('w-time') !== undefined) wizard.time = v('w-time');
  if (wizard.step === 1) {
    wizard.address = v('w-addr') ?? wizard.address;
    wizard.num = v('w-num') ?? wizard.num;
  }
  if (wizard.step === 2 && v('w-op')) wizard.operation = v('w-op');
  if (wizard.step === 3 && v('w-cc')) wizard.conclusion = v('w-cc');
}

/* ---------- Fin : génération du fichier Excel ---------- */
async function generateReport(date = store.todayISO()) {
  const { currentUser } = store.get();
  const controls = store.controlsOf(date, currentUser);
  if (!controls.length) return toast(`Aucun contrôle le ${frDate(date)}`);
  try {
    await downloadFile(await buildFile({ date, user: currentUser, controls }));
    toast('Fichier Excel généré');
  } catch (e) {
    console.error(e);
    toast('Erreur lors de la génération');
  }
}

/* ---------- Événements ---------- */
app.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; window.scrollTo(0, 0); return render(); }
  if (d.user) { store.set({ currentUser: d.user }); tab = 'home'; return render(); }
  if (d.add) {
    const input = document.getElementById('in-' + d.add);
    store.addTo(d.add, input.value);
    return render();
  }
  if (d.del) {
    if (confirm(`Supprimer « ${d.v} » ?`)) { store.removeFrom(d.del, d.v); render(); }
    return;
  }
  if (d.delc) {
    if (confirm('Supprimer ce contrôle ?')) { store.removeControl(d.delc); render(); }
    return;
  }
  if (d.pick) { syncWizardInputs(); wizard[d.pick] = d.v; return render(); }
  switch (d.act) {
    case 'theme': return cycleTheme();
    case 'hist-me': histAll = false; return render();
    case 'hist-all': histAll = true; return render();
    case 'join': {
      const code = sync.normalizeTeam(document.getElementById('in-team').value);
      if (code.length < 6) return toast('Code trop court (6 caractères minimum)');
      store.set({ team: code });
      startSync();
      return render();
    }
    case 'leave':
      if (confirm('Quitter l’équipe ? Les données déjà reçues restent sur ce téléphone.')) { store.set({ team: '' }); location.reload(); }
      return;
    case 'switch': store.set({ currentUser: null }); tab = 'home'; return render();
    case 'start': wizard = { step: 0, time: nowHM(), address: '', num: '', operation: '', conclusion: '' }; return render();
    case 'back': syncWizardInputs(); if (wizard.step) wizard.step--; else wizard = null; return render();
    case 'next':
      syncWizardInputs();
      if (wizard.step < 3) { wizard.step++; return render(); }
      // Les saisies manuelles restent dans le contrôle : elles ne sont pas ajoutées aux listes.
      store.addControl({ time: wizard.time, address: wizard.address, num: wizard.num, operation: wizard.operation, conclusion: wizard.conclusion });
      wizard = null;
      toast('Contrôle enregistré');
      return render();
    case 'finish': return generateReport();
    case 'resend': return generateReport(d.date);
    case 'delday':
      if (confirm(`Supprimer tous les contrôles du ${frDate(d.date)} ?`)) {
        store.clearControls(d.date, store.get().currentUser);
        render();
      }
      return;
  }
});

app.addEventListener('input', () => {
  if (!wizard) return;
  syncWizardInputs();
  const next = app.querySelector('[data-act="next"]');
  const ok = [wizard.time, wizard.address, wizard.operation, wizard.conclusion][wizard.step];
  if (next) next.disabled = !ok;
});

app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('input[id^="in-"]');
  if (!input) return;
  const btn = app.querySelector(input.id === 'in-team' ? '[data-act="join"]' : `[data-add="${input.id.slice(3)}"]`);
  btn?.click();
});

let renderTimer;
function renderRemote() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    // Ne pas casser une saisie en cours ni l'assistant.
    if (wizard || app.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    render();
  }, 150);
}

function startSync() {
  const { team } = store.get();
  if (!sync.enabled || !team) return;
  sync.start(team, { onChange: renderRemote, onStatus: st => { syncStatus = st; if (tab === 'users') renderRemote(); } });
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Nouvelle version installée : on recharge pour l'afficher (sauf pendant un contrôle en cours).
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !wizard) location.reload(); });
}
startSync();
render();
