/* Photo library. Image bytes are kept in IndexedDB (room for hundreds of photos); titles, captions and
 * sources live in the main Store as Photo records. Also provides the picker, the photo editor and the lightbox. */
window.Photos = (() => {
  const { h, esc } = UI;
  const DB = 'chronomap-photos', STORE = 'images', MAX_SIDE = 1600, THUMB = 200;
  let db = null, ready = false;
  const cache = new Map(); // id -> { url, thumbUrl }

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  function remember(id, blob, thumb) {
    forget(id);
    cache.set(id, { url: URL.createObjectURL(blob), thumbUrl: URL.createObjectURL(thumb || blob) });
  }
  function forget(id) {
    const c = cache.get(id);
    if (c) { URL.revokeObjectURL(c.url); URL.revokeObjectURL(c.thumbUrl); cache.delete(id); }
  }

  async function init() {
    try { db = await openDB(); } catch (e) { console.warn('Photo storage unavailable', e); return; }
    await prune();
    ready = true;
    Store.subscribe(evt => { if (evt.type === 'all') prune().then(() => Store.notify({ type: 'photos' })); });
    Store.notify({ type: 'photos' });
  }
  // Load every stored image; drop any that no longer has a Photo record.
  async function prune() {
    if (!db) return;
    const all = await tx('readonly', s => s.getAll());
    const known = new Set(Store.photos().map(p => p.id));
    for (const rec of all || []) {
      if (!known.has(rec.id)) { await tx('readwrite', s => s.delete(rec.id)); forget(rec.id); continue; }
      if (!cache.has(rec.id)) remember(rec.id, rec.blob, rec.thumb);
    }
  }

  // ---------- image processing ----------
  function loadImage(blob) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(blob);
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Not a readable image')); };
      i.src = u;
    });
  }
  const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));
  async function process(file) {
    const img = await loadImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(W, H));
    const w = Math.round(W * scale), hgt = Math.round(H * scale);
    let blob;
    if (scale === 1 && /png|gif|webp/.test(file.type) && file.size < 600 * 1024) blob = file; // small graphics: keep as-is
    else {
      const c = document.createElement('canvas'); c.width = w; c.height = hgt;
      c.getContext('2d').drawImage(img, 0, 0, w, hgt);
      blob = await toBlob(c, 'image/jpeg', 0.86);
    }
    const side = Math.min(W, H);
    const tc = document.createElement('canvas'); tc.width = THUMB; tc.height = THUMB;
    tc.getContext('2d').drawImage(img, (W - side) / 2, (H - side) / 2, side, side, 0, 0, THUMB, THUMB);
    const thumb = await toBlob(tc, 'image/jpeg', 0.82);
    return { blob, thumb, w, h: hgt };
  }

  // ---------- public API ----------
  async function add(file, meta = {}) {
    if (!db) throw new Error('Photo storage is not available in this browser');
    const { blob, thumb, w, h: hgt } = await process(file);
    const id = Store.uid();
    await tx('readwrite', s => s.put({ id, blob, thumb }));
    remember(id, blob, thumb);
    return Store.addPhoto(Object.assign({ id, title: (file.name || 'Photo').replace(/\.[^.]+$/, ''), w, h: hgt, bytes: blob.size, type: blob.type }, meta));
  }
  async function remove(id) {
    Store.deletePhoto(id);
    forget(id);
    if (db) await tx('readwrite', s => s.delete(id));
  }
  // Store image bytes for a photo record that already exists (used when sync downloads a photo).
  async function putBlob(id, blob) {
    if (!db) throw new Error('Photo storage is not available');
    const { blob: b, thumb } = await process(blob);
    await tx('readwrite', s => s.put({ id, blob: b, thumb }));
    remember(id, b, thumb);
  }
  async function getBlob(id) {
    if (!db) return null;
    const rec = await tx('readonly', s => s.get(id));
    return rec ? rec.blob : null;
  }
  const hasBlob = id => cache.has(id);
  const url = id => (id && cache.get(id)) ? cache.get(id).url : null;
  const thumb = id => (id && cache.get(id)) ? cache.get(id).thumbUrl : null;
  function totalBytes() { return Store.photos().reduce((s, p) => s + (p.bytes || 0), 0); }

  const blobToDataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  async function exportAll() {
    if (!db) return [];
    const all = await tx('readonly', s => s.getAll());
    const known = new Set(Store.photos().map(p => p.id));
    const out = [];
    for (const rec of all || []) if (known.has(rec.id)) out.push({ id: rec.id, data: await blobToDataURL(rec.blob), thumb: rec.thumb ? await blobToDataURL(rec.thumb) : null });
    return out;
  }
  async function importAll(list) {
    if (!db || !Array.isArray(list)) return 0;
    let n = 0;
    for (const it of list) {
      if (!it || !it.id || !it.data) continue;
      try {
        const blob = await (await fetch(it.data)).blob();
        const tb = it.thumb ? await (await fetch(it.thumb)).blob() : blob;
        await tx('readwrite', s => s.put({ id: it.id, blob, thumb: tb }));
        remember(it.id, blob, tb); n++;
      } catch (e) { console.warn('Could not import photo', it.id, e); }
    }
    await prune();
    Store.notify({ type: 'photos' });
    return n;
  }

  // ---------- UI pieces ----------
  function thumbEl(p, size = 72) {
    const t = thumb(p.id);
    return t ? h('img', { class: 'photo-thumb', src: t, alt: p.title, style: { width: size + 'px', height: size + 'px' }, title: p.title })
             : h('div', { class: 'photo-thumb missing', style: { width: size + 'px', height: size + 'px' }, title: 'Image not available in this browser (import the backup with photos)' }, '🖼️');
  }
  function photoCitesHTML(p) {
    const cs = (p.citations || []).filter(c => c.sourceId && Store.source(c.sourceId));
    if (!cs.length) return '';
    return '<ul>' + cs.map(c => `<li>${UI.citeHTML(c.sourceId, c.page)}${c.note ? ` <span class="muted">– ${esc(c.note)}</span>` : ''}</li>`).join('') + '</ul>';
  }

  // Choose photos from the library or upload new ones. Resolves with an array of ids (empty if cancelled).
  function pick({ multi = false, exclude = [] } = {}) {
    return new Promise(resolve => {
      const chosen = new Set();
      const grid = h('div', { class: 'photo-grid' });
      const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
      const status = h('span', { class: 'muted' });
      const done = ids => { resolve(ids); m.close(); }; // resolve first: closing the dialog also fires onClose, which resolves [] (cancel)
      const okBtn = h('button', { class: 'primary', disabled: true, onclick: () => done([...chosen]) }, multi ? 'Add selected' : 'Use this photo');
      function refresh() {
        grid.innerHTML = '';
        const list = Store.photos().filter(p => !exclude.includes(p.id));
        if (!list.length) grid.append(h('div', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'The library is empty. Upload a photo to start.'));
        for (const p of list) {
          const tile = h('div', { class: 'photo-tile' + (chosen.has(p.id) ? ' selected' : ''), onclick: () => {
            if (!multi) { done([p.id]); return; }
            if (chosen.has(p.id)) chosen.delete(p.id); else chosen.add(p.id);
            okBtn.disabled = !chosen.size; refresh();
          } }, thumbEl(p, 96), h('div', { class: 'photo-title' }, p.title || 'Untitled'));
          grid.append(tile);
        }
      }
      fileInput.addEventListener('change', async () => {
        const files = [...fileInput.files]; fileInput.value = '';
        status.textContent = `Adding ${files.length} photo(s)…`;
        const added = [];
        for (const f of files) { try { added.push((await add(f)).id); } catch (e) { UI.toast(`${f.name}: ${e.message}`, 'error'); } }
        status.textContent = '';
        if (!multi && added.length) { done([added[0]]); return; }
        added.forEach(id => chosen.add(id)); okBtn.disabled = !chosen.size; refresh();
      });
      const body = h('div', {},
        h('div', { class: 'row', style: { marginBottom: '8px' } },
          h('button', { onclick: () => fileInput.click() }, '⬆ Upload new photo…'), status, h('span', { class: 'spacer' }),
          multi ? okBtn : null, h('button', { onclick: () => done([]) }, 'Cancel'), fileInput),
        grid);
      const m = UI.modal({ title: multi ? 'Add photos' : 'Choose a photo', body, width: '720px', onClose: () => resolve([]) });
      refresh();
    });
  }

  // Edit a photo's title, caption, credit, sources. Changes save as you type.
  function edit(id) {
    const p = Store.photo(id); if (!p) return;
    const set = patch => Store.updatePhoto(id, patch);
    const inp = (key, attrs = {}) => { const el = h('input', Object.assign({ type: 'text', value: p[key] || '' }, attrs)); el.addEventListener('change', () => set({ [key]: el.value })); return el; };
    const field = (label, el) => h('label', { class: 'field' }, label, el);
    const cites = h('div');
    function renderCites() {
      cites.innerHTML = '';
      const cur = Store.photo(id);
      cur.citations.forEach((c, i) => {
        cites.append(h('div', { class: 'card' },
          h('div', { class: 'ed-row' },
            UI.sourceSelect({ value: c.sourceId, onChange: v => { const list = Store.photo(id).citations.slice(); list[i] = Object.assign({}, list[i], { sourceId: v }); set({ citations: list }); renderCites(); } }),
            (() => { const e = h('input', { type: 'text', value: c.page, placeholder: 'page / plate / URL', style: { flex: '0 0 36%' } }); e.addEventListener('change', () => { const list = Store.photo(id).citations.slice(); list[i] = Object.assign({}, list[i], { page: e.value }); set({ citations: list }); }); return e; })(),
            h('button', { class: 'small narrow', title: 'Remove', onclick: () => { const list = Store.photo(id).citations.slice(); list.splice(i, 1); set({ citations: list }); renderCites(); } }, '✕')),
          h('div', { class: 'ed-row' }, (() => { const e = h('input', { type: 'text', value: c.note, placeholder: 'what this source says about the picture (who, when, where it was published…)' }); e.addEventListener('change', () => { const list = Store.photo(id).citations.slice(); list[i] = Object.assign({}, list[i], { note: e.value }); set({ citations: list }); }); return e; })())));
      });
      cites.append(h('button', { class: 'small', onclick: () => { set({ citations: [...Store.photo(id).citations, { sourceId: null, page: '', note: '' }] }); renderCites(); } }, '+ Add source'));
    }
    renderCites();
    const users = Store.photoUsers(id);
    const big = url(id) ? h('img', { class: 'photo-preview', src: url(id), alt: p.title, onclick: () => view(id) }) : thumbEl(p, 160);
    const body = h('div', { class: 'photo-edit' },
      h('div', { class: 'photo-edit-left' }, big,
        h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, `${p.w} × ${p.h} · ${Math.round((p.bytes || 0) / 1024)} KB`),
        users.length ? h('div', { style: { marginTop: '8px', fontSize: '12px' } }, 'Used by: ', users.map((u, i) => [i ? ', ' : '', h('a', { class: 'mlink', style: { color: 'var(--accent)', cursor: 'pointer' }, onclick: () => { m.close(); Editor.open(u.id); } }, u.name)])) : h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12px' } }, 'Not used by any marker yet.'),
        h('button', { class: 'danger small', style: { marginTop: '12px' }, onclick: async () => { if (!confirm(`Delete "${p.title}" from the library?${users.length ? ` It is used by ${users.length} marker(s).` : ''}`)) return; await remove(id); m.close(); } }, 'Delete photo')),
      h('div', { class: 'photo-edit-right' },
        field('Title', inp('title')),
        field('Caption', (() => { const e = h('textarea', { rows: 3 }, p.caption || ''); e.addEventListener('change', () => set({ caption: e.value })); return e; })()),
        h('div', { class: 'ed-row' }, field('Credit / artist', inp('credit', { placeholder: 'painter, photographer, archive' })), field('Date of the image', inp('date', { placeholder: 'e.g. 1796' }))),
        h('div', { class: 'field' }, 'Sources', cites),
        field('Notes', (() => { const e = h('textarea', { rows: 2, placeholder: 'authenticity, provenance, doubts…' }, p.notes || ''); e.addEventListener('change', () => set({ notes: e.value })); return e; })())));
    const m = UI.modal({ title: 'Photo details', body, width: '820px' });
  }

  // Large view with caption and sources.
  function view(id) {
    const p = Store.photo(id); if (!p) return;
    const body = h('div', { class: 'lightbox' },
      url(id) ? h('img', { src: url(id), alt: p.title }) : thumbEl(p, 200),
      h('div', { class: 'lightbox-text' },
        h('div', { class: 'info-name' }, p.title || 'Untitled'),
        p.caption ? h('div', { html: UI.textToHTML(p.caption) }) : null,
        (p.credit || p.date) ? h('div', { class: 'muted' }, [p.credit, p.date].filter(Boolean).join(' · ')) : null,
        h('div', { html: photoCitesHTML(p) }),
        p.notes ? h('div', { class: 'muted', style: { fontSize: '12px' }, html: UI.textToHTML(p.notes) }) : null,
        h('div', { style: { marginTop: '10px' } }, h('button', { class: 'small', onclick: () => { m.close(); edit(id); } }, '✏️ Edit details'))));
    const m = UI.modal({ title: 'Photo', body, width: '900px' });
  }

  return { init, add, remove, putBlob, getBlob, hasBlob, url, thumb, totalBytes, exportAll, importAll, pick, edit, view, thumbEl, isReady: () => ready };
})();
