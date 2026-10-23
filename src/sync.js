import { firebaseConfig } from './firebase-config.js';
import * as store from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
export const enabled = !!firebaseConfig.apiKey;

export const normalizeTeam = code => code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

// Démarre la synchronisation de l'équipe : réglages (utilisateurs, listes, e-mail) + contrôles.
// `onChange` est appelé quand des données distantes arrivent ; `onStatus('ok'|'offline'|'error')` suit l'état.
export async function start(team, { onChange, onStatus }) {
  if (!enabled || !team) return;
  try {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, setDoc, deleteDoc, onSnapshot, getDocFromServer, writeBatch } = fs;
    const db = initializeFirestore(initializeApp(firebaseConfig), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    const settingsRef = doc(db, 'teams', team, 'settings', 'main');
    const controlsRef = collection(db, 'teams', team, 'controls');
    const log = e => { console.error(e); onStatus?.('error'); };

    const sharedSettings = () => {
      const { users, lists } = store.get();
      return { users, lists };
    };

    // Première connexion d'une équipe vide : on y envoie les données déjà présentes sur ce téléphone.
    try {
      const first = await getDocFromServer(settingsRef);
      if (!first.exists()) {
        await setDoc(settingsRef, sharedSettings());
        const batch = writeBatch(db);
        for (const c of store.get().controls) batch.set(doc(controlsRef, String(c.id)), c);
        await batch.commit();
      }
    } catch { onStatus?.('offline'); }

    store.hooks.settings = () => setDoc(settingsRef, sharedSettings(), { merge: true }).catch(log);
    store.hooks.controlAdd = c => setDoc(doc(controlsRef, String(c.id)), c).catch(log);
    store.hooks.controlsDel = ids => {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(controlsRef, String(id))));
      batch.commit().catch(log);
    };

    onSnapshot(settingsRef, { includeMetadataChanges: true }, snap => {
      onStatus?.(snap.metadata.fromCache ? 'offline' : 'ok');
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      // Ancien format (avant les types) : `operations`/`conclusions` à plat = encombrants.
      const legacy = d.lists ? null : { enc: { operations: d.operations ?? [], conclusions: d.conclusions ?? [] }, om: store.get().lists.om };
      store.applyRemote({ users: d.users ?? [], lists: store.normalizeLists(d.lists ?? legacy) });
      if (legacy) store.hooks.settings?.(); // on publie le nouveau format
      onChange?.();
    }, log);

    onSnapshot(controlsRef, { includeMetadataChanges: true }, snap => {
      // Un cache vide n'est pas une vérité : on n'écrase les contrôles locaux que si le serveur a répondu.
      if (snap.metadata.fromCache && snap.empty) return;
      store.applyRemote({ controls: snap.docs.map(d => d.data()) });
      onChange?.();
    }, log);
  } catch (e) {
    console.error(e);
    onStatus?.('error');
  }
}
