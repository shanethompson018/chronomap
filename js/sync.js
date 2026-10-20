/* Google Drive sync.
 *
 * The app signs in with Google (token model of Google Identity Services, scope drive.file: the app only
 * ever sees files it created) and keeps a folder in the user's Drive:
 *   Chrono Map/chronomap-data.json   the shared data (markers, ties, categories, sources, photo records, tombstones)
 *   Chrono Map/photos/<photoId>.jpg  the image bytes
 * A sync downloads the data file, merges it record by record with the local data (newest updatedAt wins,
 * tombstones remove deleted records), writes the result back if anything changed, then uploads photos that
 * are only here and downloads photos that are only there.
 */
window.Sync = (() => {
  const TOKEN_KEY = 'chronomap.gtoken';
  const DATA_NAME = 'chronomap-data.json';
  const API = 'https://www.googleapis.com/drive/v3/';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
  let tokenClient = null, token = null, expiresAt = 0;
  let running = false, dirty = false, timer = null;
  let status = { state: 'off', text: 'Sync off' }, lastError = null;

  const cfg = () => window.ChronoConfig || {};
  const enabled = () => !!Store.settings().driveSync;
  const configured = () => !!(cfg().googleClientId && !/YOUR_CLIENT_ID/.test(cfg().googleClientId));

  // ---------- status ----------
  function setStatus(state, text) {
    status = { state, text };
    document.dispatchEvent(new CustomEvent('chrono-sync', { detail: status }));
  }
  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }
  function idleStatus() {
    if (!configured()) return setStatus('off', 'Sync not configured');
    if (!enabled()) return setStatus('off', 'Sign in to sync');
    if (!navigator.onLine) return setStatus('offline', 'Offline');
    if (!hasToken()) return setStatus('signin', 'Sign in to sync');
    setStatus('ok', 'Synced ' + timeAgo(Store.settings().driveLastSync));
  }

  // ---------- sign-in ----------
  function loadToken() {
    try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY)); if (t && t.expiresAt > Date.now() + 60000) { token = t.token; expiresAt = t.expiresAt; } } catch (e) { /* ignore */ }
  }
  function saveToken() { try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt })); } catch (e) { /* ignore */ } }
  function dropToken() { token = null; expiresAt = 0; try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  const hasToken = () => !!token && expiresAt > Date.now() + 60000;
  const gisReady = () => !!(window.google && google.accounts && google.accounts.oauth2);

  function waitForGis(ms = 6000) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() { if (gisReady()) return resolve(true); if (Date.now() - t0 > ms) return resolve(false); setTimeout(poll, 150); })();
    });
  }
  // Get an access token. Google may open a small popup the first time, or when the hour-long token has expired.
  async function getToken(interactive) {
    if (hasToken()) return token;
    if (!navigator.onLine) throw new Error('offline');
    if (!(await waitForGis())) throw new Error('Google sign-in could not load (blocked or offline)');
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({ client_id: cfg().googleClientId, scope: cfg().googleScopes, callback: () => {}, error_callback: () => {} });
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('sign-in timed out (was the Google window blocked?)')), 120000);
      tokenClient.callback = resp => {
        clearTimeout(timeout);
        if (!resp || resp.error) { reject(new Error((resp && (resp.error_description || resp.error)) || 'sign-in failed')); return; }
        token = resp.access_token; expiresAt = Date.now() + (Math.max(60, resp.expires_in || 3600) - 60) * 1000; saveToken();
        resolve(token);
      };
      tokenClient.error_callback = err => { clearTimeout(timeout); reject(new Error(err && err.type === 'popup_failed_to_open' ? 'the Google sign-in window was blocked; allow popups for this site and click Sync again' : (err && err.type === 'popup_closed' ? 'sign-in cancelled' : 'sign-in failed'))); };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }
  async function signIn() {
    await getToken(true);
    Store.setSetting('driveSync', true);
    return run({ interactive: true, reason: 'sign-in' });
  }
  function signOut() {
    if (token && gisReady()) { try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) { /* ignore */ } }
    dropToken();
    Store.setSetting('driveSync', false);
    idleStatus();
  }

  // ---------- Drive helpers ----------
  async function api(path, opts = {}) {
    const t = await getToken(!!opts.interactive);
    const headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
    const res = await fetch(path.startsWith('http') ? path : API + path, Object.assign({}, opts, { headers }));
    if (res.status === 401) { dropToken(); throw new Error('Google signed the app out; sign in again'); }
    if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(`Drive error ${res.status}${txt ? ': ' + txt.slice(0, 160) : ''}`); }
    return res;
  }
  const q = s => encodeURIComponent(s);
  async function findOne(query, fields = 'id,name,modifiedTime') {
    const r = await api(`files?q=${q(query)}&spaces=drive&fields=files(${fields})&pageSize=5`);
    const j = await r.json();
    return (j.files && j.files[0]) || null;
  }
  async function listAll(query, fields = 'id,name,size') {
    let out = [], pageToken = '';
    do {
      const r = await api(`files?q=${q(query)}&spaces=drive&fields=nextPageToken,files(${fields})&pageSize=1000${pageToken ? '&pageToken=' + pageToken : ''}`);
      const j = await r.json();
      out = out.concat(j.files || []); pageToken = j.nextPageToken || '';
    } while (pageToken);
    return out;
  }
  async function stillThere(id) {
    if (!id) return false;
    try { const j = await (await api(`files/${id}?fields=id,trashed`)).json(); return !j.trashed; } catch (e) { return false; }
  }
  async function createFolder(name, parentId) {
    const body = Object.assign({ name, mimeType: 'application/vnd.google-apps.folder' }, parentId ? { parents: [parentId] } : {});
    const r = await api('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await r.json()).id;
  }
  const oldestFirst = files => files.slice().sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
  // The app's folder: always the OLDEST folder of that name, so two devices that both created one on
  // their first sync end up sharing the same folder instead of each keeping its own.
  async function ensureFolders() {
    const s = Store.settings();
    const folders = oldestFirst(await listAll(`name='${cfg().driveFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id,name,createdTime'));
    let folderId = folders.length ? folders[0].id : await createFolder(cfg().driveFolderName);
    if (folderId !== s.driveFolderId) { Store.setSetting('drivePhotosFolderId', null); Store.setSetting('driveDataFileId', null); }
    const photos = oldestFirst(await listAll(`name='photos' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${folderId}' in parents`, 'id,name,createdTime'));
    const photosId = photos.length ? photos[0].id : await createFolder('photos', folderId);
    Store.setSetting('driveFolderId', folderId); Store.setSetting('drivePhotosFolderId', photosId);
    return { folderId, photosId, extraFolders: folders.length - 1 };
  }
  // Who is signed in (asked once per token; shown in the Library so two devices can be compared).
  async function whoAmI() {
    try {
      const j = await (await api('about?fields=user(emailAddress,displayName)')).json();
      const email = (j.user && j.user.emailAddress) || '';
      if (email && email !== Store.settings().driveUser) Store.setSetting('driveUser', email);
    } catch (e) { /* not essential */ }
  }
  function relatedBody(metadata, blob) {
    const boundary = 'chrono' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob, `\r\n--${boundary}--`]);
    return { body, type: `multipart/related; boundary=${boundary}` };
  }
  async function uploadNew(metadata, blob) {
    const { body, type } = relatedBody(metadata, blob);
    const r = await api(UPLOAD + 'files?uploadType=multipart&fields=id,modifiedTime', { method: 'POST', headers: { 'Content-Type': type }, body });
    return r.json();
  }
  async function uploadUpdate(fileId, blob) {
    const r = await api(UPLOAD + `files/${fileId}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    return r.json();
  }
  const download = fileId => api(`files/${fileId}?alt=media`);

  // ---------- merge ----------
  // Newest version of each record wins; a tombstone newer than the record removes it.
  function mergeDocs(local, remote) {
    const colls = Store.syncCollections();
    const out = { version: Math.max(local.version || 0, remote.version || 0) };
    const tomb = new Map();
    [...(local.deleted || []), ...(remote.deleted || [])].forEach(t => {
      if (!t || !t.coll || !t.id) return;
      const k = t.coll + ':' + t.id;
      if (!tomb.has(k) || tomb.get(k).at < t.at) tomb.set(k, t);
    });
    for (const coll of colls) {
      const byId = new Map();
      (local[coll] || []).forEach(r => byId.set(r.id, r));
      (remote[coll] || []).forEach(r => { const l = byId.get(r.id); if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId.set(r.id, r); });
      out[coll] = [...byId.values()].filter(r => { const t = tomb.get(coll + ':' + r.id); return !(t && t.at > (r.updatedAt || 0)); });
    }
    out.deleted = [...tomb.values()];
    return out;
  }
  const docText = doc => JSON.stringify(doc);

  // ---------- the sync itself ----------
  async function run({ interactive = false, reason = '' } = {}) {
    if (!configured()) { idleStatus(); return false; }
    if (!enabled() && !interactive) return false;
    if (running) { dirty = true; return false; }
    running = true; lastError = null;
    setStatus('syncing', 'Syncing…');
    try {
      if (!navigator.onLine) throw new Error('offline');
      await getToken(interactive);
      if (!Store.settings().driveUser) await whoAmI();
      const { folderId, photosId, extraFolders } = await ensureFolders();

      // 1. the data file. Every copy the app can see (two devices may each have created one on their first
      //    sync) is merged in; the oldest copy is kept as the shared file and the others are moved to the bin.
      const copies = oldestFirst(await listAll(`name='${DATA_NAME}' and trashed=false`, 'id,name,createdTime,modifiedTime,parents'));
      let dataId = copies.length ? copies[0].id : null;
      let remote = null, remoteText = null;
      const parse = txt => { try { return Store.normalizeDoc(JSON.parse(txt)); } catch (e) { return null; } }; // brings an older layout up to date before merging
      if (dataId) { remoteText = await (await download(dataId)).text(); remote = parse(remoteText); }
      for (const extra of copies.slice(1)) {
        const doc = parse(await (await download(extra.id)).text());
        if (doc) remote = remote ? mergeDocs(remote, doc) : doc;
      }
      const local = Store.exportSyncDoc();
      let merged;
      if (remote && Store.settings().sampleUntouched) merged = remote;           // fresh device: take what is in Drive, do not mix in the sample
      else if (remote) merged = mergeDocs(local, remote);
      else merged = local;
      Store.replaceSyncDoc(merged);
      Store.setSetting('sampleUntouched', false);
      const finalDoc = Store.exportSyncDoc();
      const text = docText(finalDoc);
      let uploaded = false;
      if (!dataId) {
        const j = await uploadNew({ name: DATA_NAME, parents: [folderId], mimeType: 'application/json' }, new Blob([text], { type: 'application/json' }));
        dataId = j.id; uploaded = true;
      } else if (text !== remoteText) {
        await uploadUpdate(dataId, new Blob([text], { type: 'application/json' })); uploaded = true;
      }
      Store.setSetting('driveDataFileId', dataId);
      for (const extra of copies.slice(1)) { // only once the merged result is safely in the shared file
        try { await api(`files/${extra.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (e) { /* next time */ }
      }
      const count = doc => ({ markers: (doc && doc.markers ? doc.markers : []).length, sources: (doc && doc.sources ? doc.sources : []).length, photos: (doc && doc.photos ? doc.photos : []).length });
      Store.setSetting('driveLastReport', { at: Date.now(), reason, remote: count(remote), before: count(local), after: count(finalDoc), uploaded,
        remoteModified: copies.length ? copies[0].modifiedTime : null, copies: copies.length, extraFolders });

      // 2. photos
      await syncPhotos(photosId);

      Store.setSetting('driveLastSync', Date.now());
      Store.setSetting('driveSync', true);
      idleStatus();
      return true;
    } catch (e) {
      lastError = e;
      console.warn('Sync failed', e);
      if (e.message === 'offline') setStatus('offline', 'Offline');
      else if (!hasToken()) setStatus('signin', 'Sign in to sync');
      else setStatus('error', 'Sync failed');
      if (interactive && e.message !== 'offline') UI.toast('Sync: ' + e.message, 'error');
      return false;
    } finally {
      running = false;
      if (dirty) { dirty = false; schedule(3000); }
    }
  }
  async function syncPhotos(photosId) {
    if (!Photos.isReady()) return;
    const remoteFiles = await listAll(`'${photosId}' in parents and trashed=false`, 'id,name,size');
    const remoteByPid = new Map(remoteFiles.map(f => [f.name.replace(/\.[^.]+$/, ''), f]));
    const photos = Store.photos();
    let changed = false;
    for (const p of photos) {
      const rf = remoteByPid.get(p.id);
      if (!rf && Photos.hasBlob(p.id)) {
        const blob = await Photos.getBlob(p.id);
        if (blob) { setStatus('syncing', `Uploading photo: ${p.title || p.id}`); await uploadNew({ name: p.id + extFor(blob.type), parents: [photosId] }, blob); }
      } else if (rf && !Photos.hasBlob(p.id)) {
        setStatus('syncing', `Downloading photo: ${p.title || p.id}`);
        const blob = await (await download(rf.id)).blob();
        await Photos.putBlob(p.id, blob); changed = true;
      }
    }
    const ids = new Set(photos.map(p => p.id));
    for (const [pid, f] of remoteByPid) if (!ids.has(pid)) await api(`files/${f.id}`, { method: 'DELETE' });
    if (changed) Store.notify({ type: 'photos' });
  }
  const extFor = type => (type === 'image/png' ? '.png' : type === 'image/gif' ? '.gif' : type === 'image/webp' ? '.webp' : '.jpg');

  // ---------- triggers ----------
  function schedule(ms) {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run({ reason: 'change' }); }, ms);
    if (!running) setStatus('syncing', 'Change waiting to sync…');
  }
  // Pending changes go up at once when the app is hidden or closed: on a tablet the app may be stopped
  // before the timer fires, and the change would otherwise wait until the next time it is opened.
  function flush() {
    if (!timer || !enabled()) return;
    clearTimeout(timer); timer = null;
    run({ reason: 'hidden' });
  }
  function init() {
    loadToken();
    idleStatus();
    Store.subscribe(evt => {
      if (Store.isApplyingSync()) return;
      if (['marker', 'link', 'category', 'linkType', 'source', 'photo', 'relation', 'relations', 'all'].includes(evt.type)) schedule(5000);
    });
    window.addEventListener('online', () => { if (enabled()) run({ reason: 'online' }); else idleStatus(); });
    window.addEventListener('offline', idleStatus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else if (document.visibilityState === 'visible' && enabled() && Date.now() - (Store.settings().driveLastSync || 0) > 60000) run({ reason: 'visible' });
    });
    window.addEventListener('pagehide', flush);
    setInterval(() => { if (status.state === 'ok') idleStatus(); }, 60000);
    if (enabled()) setTimeout(() => run({ reason: 'startup' }), 1500);
  }
  function folderUrl() { const id = Store.settings().driveFolderId; return id ? `https://drive.google.com/drive/folders/${id}` : null; }

  return { init, run, signIn, signOut, schedule, flush, mergeDocs, folderUrl, status: () => status, lastError: () => lastError, enabled, configured, hasToken, timeAgo };
})();
