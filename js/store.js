/* Single source of truth for all data. Saved to localStorage on every change.
 *
 * Marker:   { id, name, kind:'pin'|'area'|'path', categoryId, color, icon, summary, description,
 *             fields:{k:v}, start, startLabel, end, endLabel, moves:[Move], sources, tags:[] }
 * Move:     { id, date, lat, lng, coords:[[lat,lng]...], label, note }   (pin uses lat/lng, area/path use coords)
 * Category: { id, name, color, icon, fields:[names], defaultKind }
 * LinkType: { id, name, color, directed, fromLabel, toLabel, topSide:'from'|'to' }
 * Link:     { id, typeId, fromId, toId, label, start, end, note, sourceId, page }
 * Source:   { id, title, author, year, where, notes }      (a book, document, website, witness…)
 * Citation: { sourceId, page, note }                        (markers carry a list of these; categories carry a default sourceId)
 * A marker's fieldSources maps a field name to { sourceId, page } for that one field's value.
 * Photo:    { id, title, caption, credit, date, notes, citations:[Citation], w, h, bytes, type }
 *           (the image bytes live in IndexedDB, see photos.js; markers reference photos by photoId / photoIds)
 */
window.Store = (() => {
  const KEY = 'chronomap.v1';
  let S = null;
  const subs = new Set();

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = o => JSON.parse(JSON.stringify(o));

  // Collections that sync between devices. Every record in them carries updatedAt; deletions leave a
  // tombstone in `deleted` so a removal on one device is not undone by a merge from another.
  const SYNC_COLLS = ['categories', 'linkTypes', 'markers', 'links', 'sources', 'photos'];
  const TOMBSTONE_DAYS = 180;

  function blank() {
    return { version: 2, categories: [], linkTypes: [], markers: [], links: [], sources: [], photos: [], deleted: [],
      settings: { basemap: 'streets', showTies: true, showLabels: true, networkViews: [], sampleUntouched: false, driveSync: false } };
  }
  // Mark a record as changed now; any data change also means the sample data is no longer pristine.
  function touch(rec) { if (rec) rec.updatedAt = Date.now(); if (S) S.settings.sampleUntouched = false; return rec; }
  function tombstone(coll, id) { S.deleted.push({ coll, id, at: Date.now() }); S.settings.sampleUntouched = false; }
  function normMove(mv) { return Object.assign({ id: uid(), date: '', lat: null, lng: null, coords: null, label: '', note: '', sourceId: null, page: '' }, mv || {}); }
  function normCitation(c) { return Object.assign({ sourceId: null, page: '', note: '' }, c || {}); }
  function normMarker(m) {
    const out = Object.assign({ id: uid(), name: 'Untitled', kind: 'pin', categoryId: null, color: '', icon: '', summary: '', description: '',
      fields: {}, fieldSources: {}, start: '', startLabel: '', end: '', endLabel: '', moves: [], sources: '', citations: [], tags: [], photoId: null, photoIds: [] }, m || {});
    out.moves = (out.moves || []).map(normMove);
    out.citations = (out.citations || []).map(normCitation);
    out.photoIds = (out.photoIds || []).filter(Boolean);
    out.fields = out.fields || {};
    out.fieldSources = out.fieldSources || {};
    for (const k of Object.keys(out.fieldSources)) if (!(k in out.fields) || !out.fieldSources[k] || !out.fieldSources[k].sourceId) delete out.fieldSources[k];
    out.tags = out.tags || [];
    return out;
  }
  function normCategory(c) { const o = Object.assign({ id: uid(), name: 'Category', color: '#4f8cff', icon: '📍', fields: [], defaultKind: 'pin', sourceId: null }, c || {}); o.fields = o.fields || []; return o; }
  function normLinkType(t) { return Object.assign({ id: uid(), name: 'Link', color: '#999999', directed: false, fromLabel: '', toLabel: '', topSide: 'from' }, t || {}); }
  function normLink(l) { return Object.assign({ id: uid(), typeId: null, fromId: null, toId: null, label: '', start: '', end: '', note: '', sourceId: null, page: '' }, l || {}); }
  function normSource(s) { return Object.assign({ id: uid(), title: 'Untitled source', author: '', year: '', where: '', notes: '' }, s || {}); }
  function normPhoto(p) {
    const o = Object.assign({ id: uid(), title: '', caption: '', credit: '', date: '', notes: '', citations: [], w: 0, h: 0, bytes: 0, type: '' }, p || {});
    o.citations = (o.citations || []).map(normCitation);
    return o;
  }

  function normalize(obj) {
    const d = Object.assign(blank(), obj || {});
    d.categories = (d.categories || []).map(normCategory);
    d.linkTypes = (d.linkTypes || []).map(normLinkType);
    d.markers = (d.markers || []).map(normMarker);
    d.links = (d.links || []).map(normLink);
    d.sources = (d.sources || []).map(normSource);
    d.photos = (d.photos || []).map(normPhoto);
    delete d.photoData; // image bytes from an export file are handled by Photos.importAll, never kept here
    const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
    d.deleted = (d.deleted || []).filter(t => t && t.coll && t.id && t.at > cutoff);
    d.settings = Object.assign(blank().settings, d.settings || {});
    d.markers.forEach(sortMovesInPlace);
    cleanReferences(d);
    return d;
  }
  // Drop links to missing markers and references to missing categories, sources, link types and photos.
  function cleanReferences(d) {
    const has = (coll, id) => !id || d[coll].some(r => r.id === id);
    d.links = d.links.filter(l => has('markers', l.fromId) && has('markers', l.toId) && l.fromId && l.toId && has('linkTypes', l.typeId));
    d.categories.forEach(c => { if (!has('sources', c.sourceId)) c.sourceId = null; });
    d.markers.forEach(m => {
      if (!has('categories', m.categoryId)) m.categoryId = null;
      if (!has('photos', m.photoId)) m.photoId = null;
      m.photoIds = (m.photoIds || []).filter(pid => has('photos', pid));
      m.citations = (m.citations || []).filter(c => !c.sourceId || has('sources', c.sourceId));
      (m.moves || []).forEach(mv => { if (!has('sources', mv.sourceId)) mv.sourceId = null; });
      for (const k of Object.keys(m.fieldSources || {})) if (!has('sources', m.fieldSources[k].sourceId)) delete m.fieldSources[k];
    });
    d.links.forEach(l => { if (!has('sources', l.sourceId)) l.sourceId = null; });
    d.photos.forEach(p => { p.citations = (p.citations || []).filter(c => !c.sourceId || has('sources', c.sourceId)); });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { S = normalize(JSON.parse(raw)); return; }
    } catch (e) { console.warn('Could not read saved data', e); }
    S = normalize(SampleData.create());
    S.settings.sampleUntouched = true;
    save();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { UI.toast('Could not save: ' + e.message, 'error'); }
  }
  function commit(evt) {
    save();
    subs.forEach(fn => { try { fn(evt || { type: 'all' }); } catch (e) { console.error(e); } });
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  // Tell views to redraw without changing data (e.g. photos finished loading).
  function notify(evt) { subs.forEach(fn => { try { fn(evt || { type: 'all' }); } catch (e) { console.error(e); } }); }

  // ---------- time helpers ----------
  function moveDays(mv) { return mv.date ? Dates.toDays(mv.date) : -Infinity; }
  function sortMovesInPlace(m) {
    m.moves.sort((a, b) => {
      const da = moveDays(a), db = moveDays(b);
      return (da == null ? Infinity : da) - (db == null ? Infinity : db);
    });
  }
  function sortedMoves(m) { return m.moves.slice().sort((a, b) => (moveDays(a) ?? Infinity) - (moveDays(b) ?? Infinity)); }
  function hasLocation(mv) { return !!mv && ((mv.coords && mv.coords.length > 0) || (mv.lat != null && mv.lng != null && mv.lat !== '' && mv.lng !== '')); }

  // The move that applies at day t (null t = "ignore time": latest move).
  function positionAt(m, t) {
    const list = sortedMoves(m).filter(mv => moveDays(mv) != null);
    if (!list.length) return null;
    if (t == null) return list[list.length - 1];
    let cur = null;
    for (const mv of list) { if (moveDays(mv) <= t) cur = mv; else break; }
    return cur;
  }
  function visibleAt(m, t) {
    if (t == null) return true;
    const s = m.start ? Dates.toDays(m.start) : null;
    if (s != null && t < s) return false;
    const e = m.end ? Dates.toDays(m.end, true) : null;
    if (e != null && t > e) return false;
    return true;
  }
  function linkActiveAt(l, t) {
    if (t == null) return true;
    const s = l.start ? Dates.toDays(l.start) : null;
    if (s != null && t < s) return false;
    const e = l.end ? Dates.toDays(l.end, true) : null;
    if (e != null && t > e) return false;
    return true;
  }
  function firstDay(m) {
    const ds = [];
    if (m.start) ds.push(Dates.toDays(m.start));
    m.moves.forEach(mv => { if (mv.date) ds.push(Dates.toDays(mv.date)); });
    const valid = ds.filter(d => d != null);
    return valid.length ? Math.min(...valid) : null;
  }
  function timeRange() {
    let min = Infinity, max = -Infinity;
    const add = (s, end) => { if (!s) return; const d = Dates.toDays(s, end); if (d == null) return; if (d < min) min = d; if (d > max) max = d; };
    S.markers.forEach(m => { add(m.start); add(m.end, true); m.moves.forEach(mv => add(mv.date)); });
    S.links.forEach(l => { add(l.start); add(l.end, true); });
    if (!isFinite(min)) { max = Dates.today(); min = max - 365 * 100; }
    if (min === max) { min -= 365; max += 365; }
    const pad = Math.max(30, Math.round((max - min) * 0.03));
    return { min: min - pad, max: max + pad };
  }

  // ---------- queries ----------
  const markers = () => S.markers;
  const categories = () => S.categories;
  const linkTypes = () => S.linkTypes;
  const links = () => S.links;
  const sources = () => S.sources;
  const photos = () => S.photos;
  const photo = id => S.photos.find(p => p.id === id) || null;
  const settings = () => S.settings;
  const marker = id => S.markers.find(m => m.id === id) || null;
  const category = id => S.categories.find(c => c.id === id) || null;
  const linkType = id => S.linkTypes.find(t => t.id === id) || null;
  const link = id => S.links.find(l => l.id === id) || null;
  const source = id => S.sources.find(s => s.id === id) || null;
  const linksOf = id => S.links.filter(l => l.fromId === id || l.toId === id);
  // Short label for a source: "Title (Year)".
  function sourceLabel(id) { const s = source(id); return s ? s.title + (s.year ? ` (${s.year})` : '') : ''; }
  // Every source a marker draws on: its own citations, its positions, its ties, and the category default.
  function markerSourceIds(m) {
    const ids = new Set();
    (m.citations || []).forEach(c => { if (c.sourceId) ids.add(c.sourceId); });
    Object.values(m.fieldSources || {}).forEach(fs => { if (fs && fs.sourceId) ids.add(fs.sourceId); });
    (m.moves || []).forEach(mv => { if (mv.sourceId) ids.add(mv.sourceId); });
    [m.photoId, ...(m.photoIds || [])].forEach(pid => { const p = pid && photo(pid); if (p) p.citations.forEach(c => { if (c.sourceId) ids.add(c.sourceId); }); });
    linksOf(m.id).forEach(l => { if (l.sourceId) ids.add(l.sourceId); });
    const cat = category(m.categoryId);
    if (cat && cat.sourceId) ids.add(cat.sourceId);
    return ids;
  }
  function sourceUseCount(id) {
    let n = 0;
    S.categories.forEach(c => { if (c.sourceId === id) n++; });
    S.markers.forEach(m => {
      if (m.citations.some(c => c.sourceId === id)) n++;
      m.moves.forEach(mv => { if (mv.sourceId === id) n++; });
      Object.values(m.fieldSources || {}).forEach(fs => { if (fs && fs.sourceId === id) n++; });
    });
    S.links.forEach(l => { if (l.sourceId === id) n++; });
    S.photos.forEach(p => { if (p.citations.some(c => c.sourceId === id)) n++; });
    return n;
  }
  // Markers that use a photo (as profile picture or in their gallery).
  const photoUsers = id => S.markers.filter(m => m.photoId === id || (m.photoIds || []).includes(id));
  const displayColor = m => m.color || category(m.categoryId)?.color || '#888888';
  const displayIcon = m => m.icon || category(m.categoryId)?.icon || '';

  // ---------- mutations ----------
  function addMarker(data) { const m = touch(normMarker(data)); sortMovesInPlace(m); S.markers.push(m); commit({ type: 'marker', id: m.id }); return m; }
  function updateMarker(id, patch) {
    const m = marker(id); if (!m) return null;
    Object.assign(m, clone(patch), { id });
    m.moves = (m.moves || []).map(normMove); sortMovesInPlace(m);
    m.citations = (m.citations || []).map(normCitation);
    m.fieldSources = m.fieldSources || {};
    for (const k of Object.keys(m.fieldSources)) if (!(k in m.fields) || !m.fieldSources[k] || !m.fieldSources[k].sourceId) delete m.fieldSources[k];
    touch(m);
    commit({ type: 'marker', id }); return m;
  }
  function deleteMarker(id) {
    if (marker(id)) tombstone('markers', id);
    S.markers = S.markers.filter(m => m.id !== id);
    S.links.filter(l => l.fromId === id || l.toId === id).forEach(l => tombstone('links', l.id));
    S.links = S.links.filter(l => l.fromId !== id && l.toId !== id);
    commit({ type: 'marker', id, deleted: true });
  }
  function addLink(data) { const l = touch(normLink(data)); S.links.push(l); commit({ type: 'link', id: l.id }); return l; }
  function updateLink(id, patch) { const l = link(id); if (!l) return null; Object.assign(l, clone(patch), { id }); touch(l); commit({ type: 'link', id }); return l; }
  function deleteLink(id) { if (link(id)) tombstone('links', id); S.links = S.links.filter(l => l.id !== id); commit({ type: 'link', id, deleted: true }); }
  function addCategory(data) { const c = touch(normCategory(data)); S.categories.push(c); commit({ type: 'category', id: c.id }); return c; }
  function updateCategory(id, patch) { const c = category(id); if (!c) return null; Object.assign(c, clone(patch), { id }); touch(c); commit({ type: 'category', id }); return c; }
  function deleteCategory(id) {
    if (category(id)) tombstone('categories', id);
    S.categories = S.categories.filter(c => c.id !== id);
    S.markers.forEach(m => { if (m.categoryId === id) { m.categoryId = null; touch(m); } });
    commit({ type: 'category', id, deleted: true });
  }
  function addLinkType(data) { const t = touch(normLinkType(data)); S.linkTypes.push(t); commit({ type: 'linkType', id: t.id }); return t; }
  function updateLinkType(id, patch) { const t = linkType(id); if (!t) return null; Object.assign(t, clone(patch), { id }); touch(t); commit({ type: 'linkType', id }); return t; }
  function deleteLinkType(id) {
    if (linkType(id)) tombstone('linkTypes', id);
    S.linkTypes = S.linkTypes.filter(t => t.id !== id);
    S.links.filter(l => l.typeId === id).forEach(l => tombstone('links', l.id));
    S.links = S.links.filter(l => l.typeId !== id);
    commit({ type: 'linkType', id, deleted: true });
  }
  function addSource(data) { const s = touch(normSource(data)); S.sources.push(s); commit({ type: 'source', id: s.id }); return s; }
  function updateSource(id, patch) { const s = source(id); if (!s) return null; Object.assign(s, clone(patch), { id }); touch(s); commit({ type: 'source', id }); return s; }
  function deleteSource(id) {
    if (source(id)) tombstone('sources', id);
    S.sources = S.sources.filter(s => s.id !== id);
    S.categories.forEach(c => { if (c.sourceId === id) { c.sourceId = null; touch(c); } });
    S.markers.forEach(m => {
      let changed = false;
      if (m.citations.some(c => c.sourceId === id)) { m.citations = m.citations.filter(c => c.sourceId !== id); changed = true; }
      m.moves.forEach(mv => { if (mv.sourceId === id) { mv.sourceId = null; changed = true; } });
      for (const k of Object.keys(m.fieldSources || {})) if (m.fieldSources[k] && m.fieldSources[k].sourceId === id) { delete m.fieldSources[k]; changed = true; }
      if (changed) touch(m);
    });
    S.links.forEach(l => { if (l.sourceId === id) { l.sourceId = null; touch(l); } });
    S.photos.forEach(p => { if (p.citations.some(c => c.sourceId === id)) { p.citations = p.citations.filter(c => c.sourceId !== id); touch(p); } });
    commit({ type: 'source', id, deleted: true });
  }
  function addPhoto(data) { const p = touch(normPhoto(data)); S.photos.push(p); commit({ type: 'photo', id: p.id }); return p; }
  function updatePhoto(id, patch) { const p = photo(id); if (!p) return null; Object.assign(p, clone(patch), { id }); p.citations = (p.citations || []).map(normCitation); touch(p); commit({ type: 'photo', id }); return p; }
  function deletePhoto(id) {
    if (photo(id)) tombstone('photos', id);
    S.photos = S.photos.filter(p => p.id !== id);
    S.markers.forEach(m => {
      const had = m.photoId === id || (m.photoIds || []).includes(id);
      if (m.photoId === id) m.photoId = null;
      m.photoIds = (m.photoIds || []).filter(x => x !== id);
      if (had) touch(m);
    });
    commit({ type: 'photo', id, deleted: true });
  }
  function setSetting(k, v) { S.settings[k] = v; save(); }

  // ---------- backup ----------
  function exportJSON() { return JSON.stringify(S, null, 2); }
  function importJSON(text, mode = 'merge') {
    const obj = normalize(JSON.parse(text));
    if (mode === 'replace') {
      const keep = S.settings;
      SYNC_COLLS.forEach(coll => S[coll].forEach(r => { if (!obj[coll].some(x => x.id === r.id)) obj.deleted.push({ coll, id: r.id, at: Date.now() }); }));
      obj.deleted = obj.deleted.concat(S.deleted);
      obj.settings = keep;
      S = obj;
    }
    else {
      const upsert = (list, items) => items.forEach(it => { const i = list.findIndex(x => x.id === it.id); if (i >= 0) list[i] = it; else list.push(it); });
      upsert(S.categories, obj.categories); upsert(S.linkTypes, obj.linkTypes);
      upsert(S.markers, obj.markers); upsert(S.links, obj.links); upsert(S.sources, obj.sources); upsert(S.photos, obj.photos);
      S.deleted = S.deleted.concat(obj.deleted || []);
    }
    // imported records count as changed now, so they win over older copies on other devices
    SYNC_COLLS.forEach(coll => S[coll].forEach(r => { if (!r.updatedAt) r.updatedAt = Date.now(); }));
    S.settings.sampleUntouched = false;
    S = normalize(S);
    commit({ type: 'all' });
    return { markers: obj.markers.length, links: obj.links.length };
  }
  function resetToSample() {
    const keep = S.settings;
    // everything currently present is being removed: leave tombstones so a sync does not bring it back
    SYNC_COLLS.forEach(coll => S[coll].forEach(r => S.deleted.push({ coll, id: r.id, at: Date.now() })));
    const dead = S.deleted;
    S = normalize(SampleData.create()); S.deleted = dead; S.settings = keep; S.settings.sampleUntouched = true;
    commit({ type: 'all' });
  }
  function clearAll() {
    const keep = S.settings;
    SYNC_COLLS.forEach(coll => S[coll].forEach(r => S.deleted.push({ coll, id: r.id, at: Date.now() })));
    const dead = S.deleted;
    S = blank(); S.deleted = dead; S.settings = keep; S.settings.sampleUntouched = false;
    commit({ type: 'all' });
  }

  // ---------- sync support ----------
  // The part of the data that is shared between devices (settings stay on each device).
  function exportSyncDoc() {
    const doc = { version: S.version || 2, deleted: clone(S.deleted) };
    SYNC_COLLS.forEach(coll => { doc[coll] = clone(S[coll]); });
    return doc;
  }
  // Replace the shared collections with a merged document, keeping this device's settings.
  let applyingSync = false;
  function replaceSyncDoc(doc) {
    const keep = S.settings;
    const next = normalize(Object.assign({}, doc, { settings: keep }));
    next.settings = keep;
    S = next;
    applyingSync = true;
    try { commit({ type: 'all', sync: true }); } finally { applyingSync = false; }
  }
  const isApplyingSync = () => applyingSync;
  const syncCollections = () => SYNC_COLLS.slice();

  return {
    load, subscribe, notify, uid,
    markers, categories, linkTypes, links, sources, photos, settings, marker, category, linkType, link, source, photo, linksOf, displayColor, displayIcon,
    sourceLabel, markerSourceIds, sourceUseCount, photoUsers, addPhoto, updatePhoto, deletePhoto,
    sortedMoves, hasLocation, positionAt, visibleAt, linkActiveAt, firstDay, timeRange,
    addMarker, updateMarker, deleteMarker, addLink, updateLink, deleteLink,
    addCategory, updateCategory, deleteCategory, addLinkType, updateLinkType, deleteLinkType,
    addSource, updateSource, deleteSource, setSetting,
    exportJSON, importJSON, resetToSample, clearAll,
    exportSyncDoc, replaceSyncDoc, isApplyingSync, syncCollections,
  };
})();
