// Photos des contrôles : compression, stockage local (IndexedDB) et récupération à la demande.
// Une photo = { id, dataUrl (JPEG), w, h }. Les contrôles ne gardent que les identifiants.
export const hooks = {}; // branchés par sync.js : photoPut(photo), photoDel(ids), photoGet(id)

const DB = 'rapport-photos';
const STORE = 'photos';

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const putLocal = photo => tx('readwrite', s => s.put(photo));
export const getLocal = id => tx('readonly', s => s.get(id));
export const delLocal = ids => tx('readwrite', s => ids.forEach(id => s.delete(id)));

// Local d'abord, puis le serveur (photo prise sur un autre appareil) ; null si introuvable.
export async function getPhoto(id) {
  try {
    const local = await getLocal(id);
    if (local) return local;
    const remote = await hooks.photoGet?.(id);
    if (remote) { await putLocal(remote).catch(() => {}); return remote; }
  } catch (e) { console.error(e); }
  return null;
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Réduit l'image (côté max 1280 px, JPEG) pour rester léger : ~100-250 Ko par photo.
export async function compress(file, max = 1280) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * r), h = Math.round(bmp.height * r);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let q = 0.72, dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length > 700_000 && q > 0.4) dataUrl = canvas.toDataURL('image/jpeg', (q -= 0.08)); // limite d'un document Firestore : 1 Mo
  return { id: newId(), dataUrl, w, h };
}
