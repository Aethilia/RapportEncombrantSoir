import * as store from './store.js';
import { buildFile, sendFile, frDate } from './export.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowHM = () => new Date().toTimeString().slice(0, 5);

let tab = 'home';
let wizard = null; // { step, time, address, num, operation, conclusion }

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

function header(sub) {
  const s = store.get();
  return `<header><small>NICE CÔTE D’AZUR</small><h1>Contrôle Pizzorno</h1>
    <div class="row between"><span class="chip">${esc(sub ?? '👤 ' + (s.currentUser ?? ''))}</span>
    ${sub === undefined ? '<button class="chip" data-act="switch">Changer</button>' : ''}</div></header>`;
}

function tabs() {
  const t = (id, label) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`;
  return `<nav class="tabs">${t('home', '🏠 Accueil')}${t('lists', '📋 Listes')}${t('users', '👥 Utilisateurs')}</nav>`;
}

function manager(list, label, placeholder) {
  const items = store.get()[list];
  return `<h2>${label}</h2>
    <div class="addrow"><input id="in-${list}" placeholder="${placeholder}" enterkeyhint="done">
      <button class="btn" data-add="${list}" aria-label="Ajouter">+</button></div>
    <div class="list">${items.map(v => `<div class="item"><span>${esc(v)}</span>
      <button class="x" data-del="${list}" data-v="${esc(v)}" aria-label="Supprimer">✕</button></div>`).join('') || '<p class="empty">Aucun élément</p>'}</div>`;
}

function render() {
  const s = store.get();
  if (!s.currentUser) return renderUserPicker();
  if (wizard) return renderWizard();
  let body;
  if (tab === 'lists') {
    body = manager('operations', 'Opérations (Constats)', 'Nouvelle opération') +
      manager('conclusions', 'Conclusions (Observation / Action)', 'Nouvelle conclusion') +
      manager('addresses', 'Adresses (Voies)', 'Nouvelle adresse');
  } else if (tab === 'users') {
    body = manager('users', 'Utilisateurs', 'Nom Prénom');
  } else {
    const list = store.controlsOf(store.todayISO(), s.currentUser);
    body = `<button class="btn big" data-act="start">▶ COMMENCER</button>
      <h2>Contrôles du jour : ${list.length}</h2>
      <div class="list">${list.map(c => `<div class="item"><div><b>${esc(c.time.replace(':', 'h'))}</b> ${esc(c.address)}${c.num ? ' n°' + esc(c.num) : ''}
        <div class="sub">${esc(c.operation)} → ${esc(c.conclusion)}</div></div>
        <button class="x" data-delc="${c.id}" aria-label="Supprimer">✕</button></div>`).join('') || '<p class="empty">Aucun contrôle pour le moment</p>'}</div>
      <button class="btn dark" data-act="finish" ${list.length ? '' : 'disabled'}>■ FIN &amp; ENVOYER</button>`;
  }
  app.innerHTML = header() + `<main>${body}</main>` + tabs();
}

function renderUserPicker() {
  const { users } = store.get();
  app.innerHTML = `<header><small>NICE CÔTE D’AZUR</small><h1>Qui utilise l’appli ?</h1></header>
    <main><div class="list">${users.map(u => `<div class="item"><button class="btn" style="flex:1" data-user="${esc(u)}">${esc(u)}</button>
      <button class="x" data-del="users" data-v="${esc(u)}" aria-label="Supprimer">✕</button></div>`).join('')}</div>
      <h2>Ajouter un utilisateur</h2>
      <div class="addrow"><input id="in-users" placeholder="Nom Prénom" enterkeyhint="done"><button class="btn" data-add="users">+</button></div></main>`;
}

const STEPS = ['Heure', 'Adresse', 'Opération', 'Conclusion'];

function renderWizard() {
  const w = wizard, s = store.get();
  const progress = `<div class="progress">${STEPS.map((_, i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const pick = (list, key) => `<div class="pick">${list.map(v => `<button data-pick="${key}" data-v="${esc(v)}" class="${w[key] === v ? 'on' : ''}">${esc(v)}</button>`).join('')}</div>`;
  let body, ok;
  if (w.step === 0) {
    body = `<label for="w-time">Heure du contrôle</label><input id="w-time" type="time" value="${esc(w.time)}">`;
    ok = !!w.time;
  } else if (w.step === 1) {
    body = `<label>Adresse (voie)</label>${pick(s.addresses, 'address')}
      <label for="w-addr">Ou saisir une adresse</label><input id="w-addr" placeholder="Ex. Av. Jean Médecin" value="${s.addresses.includes(w.address) ? '' : esc(w.address)}">
      <label for="w-num">N° (optionnel)</label><input id="w-num" inputmode="numeric" value="${esc(w.num)}">`;
    ok = !!w.address;
  } else if (w.step === 2) {
    body = `<label>Opération (constat)</label>${s.operations.length ? pick(s.operations, 'operation') : '<p class="empty">Ajoutez des opérations dans l’onglet Listes.</p>'}
      <label for="w-op">Ou saisir</label><input id="w-op" value="${s.operations.includes(w.operation) ? '' : esc(w.operation)}" placeholder="Autre opération">`;
    ok = !!w.operation;
  } else {
    body = `<label>Conclusion (observation / action)</label>${s.conclusions.length ? pick(s.conclusions, 'conclusion') : '<p class="empty">Ajoutez des conclusions dans l’onglet Listes.</p>'}
      <label for="w-cc">Ou saisir</label><input id="w-cc" value="${s.conclusions.includes(w.conclusion) ? '' : esc(w.conclusion)}" placeholder="Autre conclusion">`;
    ok = !!w.conclusion;
  }
  app.innerHTML = `<header><div class="row between"><h1>Nouveau contrôle</h1><span class="chip">${w.step + 1}/4 · ${STEPS[w.step]}</span></div>${progress}</header>
    <main>${body}<div class="row"><button class="btn alt" data-act="back">${w.step ? '◀ Retour' : 'Annuler'}</button>
    <button class="btn" data-act="next" ${ok ? '' : 'disabled'}>${w.step === 3 ? '✔ Enregistrer' : 'Suivant ▶'}</button></div></main>`;
}

function syncWizardInputs() {
  if (!wizard) return;
  const v = id => document.getElementById(id)?.value.trim();
  if (wizard.step === 0 && v('w-time') !== undefined) wizard.time = v('w-time');
  if (wizard.step === 1) {
    if (v('w-addr')) wizard.address = v('w-addr');
    wizard.num = v('w-num') ?? wizard.num;
  }
  if (wizard.step === 2 && v('w-op')) wizard.operation = v('w-op');
  if (wizard.step === 3 && v('w-cc')) wizard.conclusion = v('w-cc');
}

function finish() {
  const s = store.get();
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog"><h2>Fin des contrôles</h2>
    <div><label for="f-date">Date</label><input id="f-date" type="date" value="${store.todayISO()}"></div>
    <div><label for="f-mail">Envoyer à (e-mail)</label><input id="f-mail" type="email" inputmode="email" value="${esc(s.email)}" placeholder="adresse@exemple.fr"></div>
    <button class="btn" value="go">✉ Générer et envoyer</button><button class="btn alt" value="cancel">Annuler</button></form>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    const date = dlg.querySelector('#f-date').value || store.todayISO();
    const email = dlg.querySelector('#f-mail').value.trim();
    const go = dlg.returnValue === 'go';
    dlg.remove();
    if (!go) return;
    if (!email) return toast('Saisissez une adresse e-mail');
    store.set({ email });
    try {
      const controls = store.controlsOf(date, s.currentUser);
      if (!controls.length) return toast(`Aucun contrôle le ${frDate(date)}`);
      const file = await buildFile({ date, user: s.currentUser, controls });
      const res = await sendFile(file, { email, date, user: s.currentUser });
      if (res !== 'cancelled') toast(res === 'shared' ? 'Rapport partagé' : 'Excel téléchargé, joignez-le au mail');
    } catch (e) {
      console.error(e);
      toast('Erreur lors de la génération');
    }
  });
}

app.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; return render(); }
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
    if (confirm('Supprimer ce contrôle ?')) { store.removeControl(Number(d.delc)); render(); }
    return;
  }
  if (d.pick) { syncWizardInputs(); wizard[d.pick] = d.v; return render(); }
  switch (d.act) {
    case 'switch': store.set({ currentUser: null }); return render();
    case 'start': wizard = { step: 0, time: nowHM(), address: '', num: '', operation: '', conclusion: '' }; return render();
    case 'back': syncWizardInputs(); if (wizard.step) wizard.step--; else wizard = null; return render();
    case 'next':
      syncWizardInputs();
      if (wizard.step < 3) { wizard.step++; return render(); }
      store.addTo('addresses', wizard.address);
      store.addTo('operations', wizard.operation);
      store.addTo('conclusions', wizard.conclusion);
      store.addControl({ time: wizard.time, address: wizard.address, num: wizard.num, operation: wizard.operation, conclusion: wizard.conclusion });
      wizard = null;
      toast('Contrôle enregistré');
      return render();
    case 'finish': return finish();
  }
});

app.addEventListener('input', e => {
  if (!wizard) return;
  syncWizardInputs();
  const next = app.querySelector('[data-act="next"]');
  const ok = [wizard.time, wizard.address, wizard.operation, wizard.conclusion][wizard.step];
  if (next) next.disabled = !ok;
});

app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('input[id^="in-"]');
  if (input) app.querySelector(`[data-add="${input.id.slice(3)}"]`).click();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
