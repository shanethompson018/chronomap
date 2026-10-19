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
  // Ties (links) are no longer stored: they are derived from facts on every change (see facts.js).
  const SYNC_COLLS = ['categories', 'linkTypes', 'factTypes', 'markers', 'sources', 'photos', 'relations'];
  const TOMBSTONE_DAYS = 180;
  const VERSION = 3;

  function blank() {
    return { version: VERSION, categories: [], linkTypes: [], factTypes: [], markers: [], links: [], sources: [], photos: [], relations: [], deleted: [],
      settings: { basemap: 'streets', showTies: true, showLabels: true, networkViews: [], sampleUntouched: false, driveSync: false } };
  }
  // Mark a record as changed now; any data change also means the sample data is no longer pristine.
  function touch(rec) { if (rec) rec.updatedAt = Date.now(); if (S) S.settings.sampleUntouched = false; return rec; }
  function tombstone(coll, id) { S.deleted.push({ coll, id, at: Date.now() }); S.settings.sampleUntouched = false; }
  function normMove(mv) { return Object.assign({ id: uid(), date: '', lat: null, lng: null, coords: null, label: '', note: '', sourceId: null, page: '' }, mv || {}); }
  function normCitation(c) { return Object.assign({ sourceId: null, page: '', note: '' }, c || {}); }
  function normMarker(m) {
    const out = Object.assign({ id: uid(), name: 'Untitled', kind: 'pin', categoryId: null, color: '', icon: '', summary: '', description: '',
      fields: {}, fieldSources: {}, fieldGrades: {}, start: '', startLabel: '', end: '', endLabel: '', moves: [], sources: '', citations: [], tags: [], photoId: null, photoIds: [],
      pinned: [], undetermined: [], derived: {}, facts: undefined }, m || {});
    out.fieldGrades = out.fieldGrades || {};
    for (const k of Object.keys(out.fieldGrades)) if (!out.fieldGrades[k] || !CONFIDENCE.includes(out.fieldGrades[k].confidence)) delete out.fieldGrades[k];
    out.moves = (out.moves || []).map(normMove);
    if (Array.isArray(out.facts)) out.facts = out.facts.map(normFact); // undefined = not yet converted from version 2
    out.pinned = (out.pinned || []).filter(Boolean); out.undetermined = (out.undetermined || []).filter(Boolean); out.derived = out.derived || {};
    out.citations = (out.citations || []).map(normCitation);
    out.photoIds = (out.photoIds || []).filter(Boolean);
    out.fields = out.fields || {};
    out.fieldSources = out.fieldSources || {};
    for (const k of Object.keys(out.fieldSources)) if (!(k in out.fields) || !out.fieldSources[k] || !out.fieldSources[k].sourceId) delete out.fieldSources[k];
    for (const k of Object.keys(out.fieldGrades)) if (!(k in out.fields)) delete out.fieldGrades[k];
    out.tags = out.tags || [];
    return out;
  }
  function normCategory(c) { const o = Object.assign({ id: uid(), name: 'Category', color: '#4f8cff', icon: '📍', fields: [], defaultKind: 'pin', sourceId: null, factTypeIds: [] }, c || {}); o.fields = o.fields || []; o.factTypeIds = o.factTypeIds || []; return o; }
  function normLinkType(t) { return Object.assign({ id: uid(), name: 'Link', color: '#999999', directed: false, fromLabel: '', toLabel: '', topSide: 'from' }, t || {}); }
  function normRole(r) { return Object.assign({ id: uid(), name: 'Other', tieTypeId: null, direction: 'this-to-other' }, r || {}); }
  function normFactType(t) {
    const o = Object.assign({ id: uid(), name: 'Fact', hasDate: true, hasEnd: false, place: 'any', roles: [], begins: false, ends: false, details: [], placeFrom: null }, t || {});
    o.roles = (o.roles || []).map(normRole); o.details = o.details || [];
    if (!['any', 'point', 'area', 'route', 'none'].includes(o.place)) o.place = 'any';
    return o;
  }
  function normWhere(w) {
    if (!w || !w.kind) return null;
    if (w.kind === 'point') return (w.lat == null || w.lng == null || w.lat === '' || w.lng === '') ? null : { kind: 'point', lat: +w.lat, lng: +w.lng };
    if (w.kind === 'area' || w.kind === 'route') {
      if (!(w.coords && w.coords.length)) return null;
      const o = { kind: w.kind, coords: w.coords };
      if (w.kind === 'area') {
        if (w.extent && w.extent.length >= 3) o.extent = w.extent;              // largest possible outline
        const rough = (w.rough || []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < w.coords.length);
        if (rough.length) o.rough = rough;                                      // indexes of edges that are only guessed
        if (w.extentRough && w.extent) { const er = w.extentRough.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < w.extent.length); if (er.length) o.extentRough = er; }
      }
      return o;
    }
    if (w.kind === 'marker') return w.markerId ? { kind: 'marker', markerId: w.markerId } : null;
    return null;
  }
  function normFact(f) {
    const o = Object.assign({ id: uid(), typeId: 'ft_note', label: '', date: '', dateMin: '', dateMax: '', dateEnd: '', dateEndMin: '', dateEndMax: '', where: null, placeLabel: '', participants: [], details: {}, note: '', sourceId: null, page: '', confidence: '', reason: '' }, f || {});
    o.where = normWhere(o.where);
    if (!CONFIDENCE.includes(o.confidence)) o.confidence = '';
    // a range needs both ends; a lone bound is kept as typed but does not count as a range
    ['date', 'dateEnd'].forEach(k => { if (o[k + 'Min'] && o[k + 'Max'] && Dates.toDays(o[k + 'Min']) != null && Dates.toDays(o[k + 'Max']) != null && Dates.toDays(o[k + 'Min']) > Dates.toDays(o[k + 'Max'])) { const t = o[k + 'Min']; o[k + 'Min'] = o[k + 'Max']; o[k + 'Max'] = t; } });
    o.participants = (o.participants || []).filter(p => p && p.roleId && p.markerId).map(p => ({ roleId: p.roleId, markerId: p.markerId }));
    o.details = o.details || {};
    return o;
  }
  function normLink(l) {
    const o = Object.assign({ id: uid(), typeId: null, fromId: null, toId: null, label: '', start: '', end: '', note: '', sourceId: null, page: '', pinned: [], undetermined: [], derived: {} }, l || {});
    o.pinned = (o.pinned || []).filter(Boolean); o.undetermined = (o.undetermined || []).filter(Boolean); o.derived = o.derived || {};
    return o;
  }
  // A date slot: { kind:'marker'|'link', id, slot:'start'|'end'|'move:<moveId>' }
  function normRef(r) { return r && r.kind && r.id && r.slot ? { kind: r.kind, id: r.id, slot: r.slot } : null; }
  // Relation: to = from + (years, months, days). status 'overruled' keeps the record but leaves it out of the maths.
  function normOffset(x) { return x && (x.years || x.months || x.days) ? { years: Math.trunc(+x.years || 0), months: Math.trunc(+x.months || 0), days: Math.trunc(+x.days || 0) } : null; }
  function normRelation(r) {
    const o = Object.assign({ id: uid(), from: null, to: null, years: 0, months: 0, days: 0, min: null, max: null, note: '', sourceId: null, page: '', status: 'active', confidence: '', reason: '' }, r || {});
    if (!CONFIDENCE.includes(o.confidence)) o.confidence = '';
    o.from = normRef(o.from); o.to = normRef(o.to);
    o.years = Math.trunc(+o.years || 0); o.months = Math.trunc(+o.months || 0); o.days = Math.trunc(+o.days || 0);
    o.min = normOffset(o.min); o.max = normOffset(o.max); // approximate gap: smallest and largest it could be
    if (o.status !== 'overruled') o.status = 'active';
    return o;
  }
  const RELIABILITY = ['high', 'reliable', 'questionable', 'unreliable'];
  const CONFIDENCE = ['high', 'reasonable', 'low', 'none'];
  function normSource(s) { const o = Object.assign({ id: uid(), title: 'Untitled source', author: '', year: '', where: '', notes: '', reliability: '' }, s || {}); if (!RELIABILITY.includes(o.reliability)) o.reliability = ''; return o; }
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
    d.factTypes = (d.factTypes || []).map(normFactType);
    d.sources = (d.sources || []).map(normSource);
    d.photos = (d.photos || []).map(normPhoto);
    d.relations = (d.relations || []).map(normRelation);
    delete d.photoData; // image bytes from an export file are handled by Photos.importAll, never kept here
    const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
    d.deleted = (d.deleted || []).filter(t => t && t.coll && t.id && t.at > cutoff);
    d.settings = Object.assign(blank().settings, d.settings || {});
    d.markers.forEach(sortMovesInPlace);
    Facts.ensureSeeds(d, uid);
    if (d.markers.some(m => !Array.isArray(m.facts))) Facts.migrateV2(d);
    d.markers.forEach(m => { m.facts = (m.facts || []).map(normFact); });
    d.version = VERSION;
    cleanReferences(d);
    Facts.derive(d);
    return d;
  }
  // Drop references to missing markers, categories, sources, tie types, fact types and photos.
  function cleanReferences(d) {
    const has = (coll, id) => !id || d[coll].some(r => r.id === id);
    d.categories.forEach(c => { if (!has('sources', c.sourceId)) c.sourceId = null; c.factTypeIds = (c.factTypeIds || []).filter(id => has('factTypes', id)); });
    d.factTypes.forEach(t => t.roles.forEach(r => { if (!has('linkTypes', r.tieTypeId)) r.tieTypeId = null; }));
    d.markers.forEach(m => {
      if (!has('categories', m.categoryId)) m.categoryId = null;
      if (!has('photos', m.photoId)) m.photoId = null;
      m.photoIds = (m.photoIds || []).filter(pid => has('photos', pid));
      m.citations = (m.citations || []).filter(c => !c.sourceId || has('sources', c.sourceId));
      for (const k of Object.keys(m.fieldSources || {})) if (!has('sources', m.fieldSources[k].sourceId)) delete m.fieldSources[k];
      (m.facts || []).forEach(f => {
        if (!has('factTypes', f.typeId)) f.typeId = 'ft_note';
        if (!has('sources', f.sourceId)) f.sourceId = null;
        f.participants = f.participants.filter(p => has('markers', p.markerId) && p.markerId !== m.id);
        if (f.where && f.where.kind === 'marker' && (!has('markers', f.where.markerId) || f.where.markerId === m.id)) f.where = null;
      });
      const factIds = new Set((m.facts || []).map(f => f.id));
      const slotOk = s => { if (!s.startsWith('fact:')) return false; const id = s.slice(5).replace(/:end$/, ''); return factIds.has(id); };
      m.pinned = (m.pinned || []).filter(slotOk); m.undetermined = (m.undetermined || []).filter(slotOk);
      for (const k of Object.keys(m.derived || {})) if (!slotOk(k)) delete m.derived[k];
    });
    d.photos.forEach(p => { p.citations = (p.citations || []).filter(c => !c.sourceId || has('sources', c.sourceId)); });
    const refOk = ref => {
      if (!ref || ref.kind !== 'marker' || !ref.slot.startsWith('fact:')) return false;
      const m = d.markers.find(x => x.id === ref.id); if (!m) return false;
      const id = ref.slot.slice(5).replace(/:end$/, '');
      return m.facts.some(f => f.id === id);
    };
    d.relations = d.relations.filter(r => refOk(r.from) && refOk(r.to) && !(r.from.id === r.to.id && r.from.slot === r.to.slot));
    d.relations.forEach(r => { if (!has('sources', r.sourceId)) r.sourceId = null; });
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
    Facts.derive(S); // Begins/Ends, locations and ties follow from facts
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
  function hasLocation(mv) { return !!mv && (!!mv.atMarkerId || (mv.coords && mv.coords.length > 0) || (mv.lat != null && mv.lng != null && mv.lat !== '' && mv.lng !== '')); }
  // Geometry of a location at day t: { lat, lng } or { coords }. A location "at/inside another marker"
  // follows that marker's own location at the time (an area's centre, a pin's point).
  function resolveMove(mv, t, depth = 0) {
    if (!mv) return null;
    if (mv.atMarkerId) {
      if (depth > 4) return null;
      const o = marker(mv.atMarkerId); if (!o || !visibleAt(o, t)) return null;
      const omv = positionAt(o, t); if (!omv) return null;
      const g = resolveMove(omv, t, depth + 1); if (!g) return null;
      if (g.coords) { const c = centroid(g.coords); return c ? { lat: c[0], lng: c[1], inside: o.kind === 'area' ? o.id : null, coords: null } : null; }
      return { lat: g.lat, lng: g.lng, inside: null };
    }
    if (mv.coords && mv.coords.length) return { coords: mv.coords, extent: mv.extent || null, rough: mv.rough || [], extentRough: mv.extentRough || [] };
    if (mv.lat != null && mv.lng != null && mv.lat !== '' && mv.lng !== '') return { lat: +mv.lat, lng: +mv.lng };
    return null;
  }
  function centroid(coords) {
    if (!coords || !coords.length) return null;
    let a = 0, cx = 0, cy = 0;
    const n = coords.length;
    if (n < 3) { const s = coords.reduce((acc, c) => [acc[0] + +c[0], acc[1] + +c[1]], [0, 0]); return [s[0] / n, s[1] / n]; }
    for (let i = 0; i < n; i++) {
      const [x1, y1] = [+coords[i][1], +coords[i][0]], [x2, y2] = [+coords[(i + 1) % n][1], +coords[(i + 1) % n][0]];
      const cross = x1 * y2 - x2 * y1; a += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
    }
    if (Math.abs(a) < 1e-9) { const s = coords.reduce((acc, c) => [acc[0] + +c[0], acc[1] + +c[1]], [0, 0]); return [s[0] / n, s[1] / n]; }
    a *= 0.5; return [cy / (6 * a), cx / (6 * a)];
  }

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
  const relations = () => S.relations;
  const relation = id => S.relations.find(r => r.id === id) || null;
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
    (m.facts || []).forEach(f => { if (f.sourceId) ids.add(f.sourceId); });
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
      m.facts.forEach(f => { if (f.sourceId === id) n++; });
      Object.values(m.fieldSources || {}).forEach(fs => { if (fs && fs.sourceId === id) n++; });
    });
    S.relations.forEach(r => { if (r.sourceId === id) n++; });
    S.photos.forEach(p => { if (p.citations.some(c => c.sourceId === id)) n++; });
    return n;
  }
  // Markers that use a photo (as profile picture or in their gallery).
  const photoUsers = id => S.markers.filter(m => m.photoId === id || (m.photoIds || []).includes(id));

  // ---------- date slots (for relations) ----------
  const refKey = ref => `${ref.kind}:${ref.id}:${ref.slot}`;
  function parseRefKey(k) { const i = k.indexOf(':'), j = k.indexOf(':', i + 1); return { kind: k.slice(0, i), id: k.slice(i + 1, j), slot: k.slice(j + 1) }; }
  const sameRef = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id && a.slot === b.slot;
  // Slots are a marker's fact dates: 'fact:<factId>' (the date) and 'fact:<factId>:end' (the end date).
  function slotOwner(ref) { return !ref || ref.kind !== 'marker' ? null : marker(ref.id); }
  function slotParts(slot) { const isEnd = slot.endsWith(':end'); return { factId: slot.slice(5).replace(/:end$/, ''), isEnd }; }
  function slotFact(o, slot) { if (!o || !slot.startsWith('fact:')) return null; const { factId } = slotParts(slot); return (o.facts || []).find(f => f.id === factId) || null; }
  function refExists(ref) { const o = slotOwner(ref); return !!(o && slotFact(o, ref.slot)); }
  // The slot's most-likely date (typed, or the midpoint of its range when only earliest/latest were given).
  function slotValue(ref) {
    const o = slotOwner(ref); const f = slotFact(o, ref.slot); if (!f) return '';
    const e = slotParts(ref.slot).isEnd;
    return (e ? f.dateEnd : f.date) || Dates.midpoint(e ? f.dateEndMin : f.dateMin, e ? f.dateEndMax : f.dateMax) || '';
  }
  // { date, min, max } for a slot; min/max fall back to the date itself.
  function slotRange(ref) {
    const o = slotOwner(ref); const f = slotFact(o, ref.slot); if (!f) return null;
    const e = slotParts(ref.slot).isEnd;
    const date = slotValue(ref);
    const min = (e ? f.dateEndMin : f.dateMin) || date, max = (e ? f.dateEndMax : f.dateMax) || date;
    return { date, min, max };
  }
  function setSlotRaw(o, slot, v, min, max) {
    const f = slotFact(o, slot); if (!f) return;
    const e = slotParts(slot).isEnd;
    if (e) { f.dateEnd = v; if (min !== undefined) { f.dateEndMin = min; f.dateEndMax = max; } }
    else { f.date = v; if (min !== undefined) { f.dateMin = min; f.dateMax = max; } }
  }
  const factRef = (markerId, factId, isEnd) => ({ kind: 'marker', id: markerId, slot: 'fact:' + factId + (isEnd ? ':end' : '') });
  const isPinned = ref => { const o = slotOwner(ref); return !!o && (o.pinned || []).includes(ref.slot); };
  const isUndetermined = ref => { const o = slotOwner(ref); return !!o && (o.undetermined || []).includes(ref.slot); };
  const derivedInfo = ref => { const o = slotOwner(ref); return (o && o.derived && o.derived[ref.slot]) || null; };
  function setPinned(ref, on) {
    const o = slotOwner(ref); if (!o) return;
    const set = new Set(o.pinned || []); if (on) set.add(ref.slot); else set.delete(ref.slot);
    o.pinned = [...set]; touch(o); commit({ type: ref.kind, id: o.id });
  }
  function setUndetermined(ref, on) {
    const o = slotOwner(ref); if (!o) return;
    const set = new Set(o.undetermined || []); if (on) { set.add(ref.slot); setSlotRaw(o, ref.slot, ''); o.pinned = (o.pinned || []).filter(s => s !== ref.slot); } else set.delete(ref.slot);
    o.undetermined = [...set]; touch(o); if (o.moves) sortMovesInPlace(o); commit({ type: ref.kind, id: o.id });
  }
  // Set a slot's date and pin it in one go (used when the user picks a value in the conflicts panel).
  function pinValue(ref, value) {
    const o = slotOwner(ref); if (!o) return;
    setSlotRaw(o, ref.slot, value);
    o.pinned = [...new Set([...(o.pinned || []), ref.slot])];
    o.undetermined = (o.undetermined || []).filter(s => s !== ref.slot);
    if (o.moves) sortMovesInPlace(o);
    touch(o); commit({ type: ref.kind, id: o.id });
  }
  // Short description of a fact: "Born", "Located at Paris", "Member of Congress".
  function factTitle(f) {
    const t = factType(f.typeId);
    let s = f.label || (t ? t.name : 'Fact');
    const who = (f.participants || []).map(p => marker(p.markerId)).filter(Boolean).map(x => x.name);
    if (f.where && f.where.kind === 'marker') { const o = marker(f.where.markerId); if (o) s += ' ' + o.name; }
    else if (f.placeLabel) s += ' ' + f.placeLabel;
    else if (who.length && !(t && t.roles.length > 1)) s += ' ' + who.join(', ');
    return s;
  }
  // Human label for a slot: "Adam · Born", "Washington · Located at Cambridge (until)".
  function slotLabel(ref) {
    const o = slotOwner(ref); if (!o) return '(missing)';
    const f = slotFact(o, ref.slot); if (!f) return `${o.name} · (missing)`;
    return `${o.name} · ${factTitle(f)}${slotParts(ref.slot).isEnd ? ' (until)' : ''}`;
  }
  // Every date slot of a marker: each dated fact, and the end date of facts that have one.
  function slotsOfMarker(markerId) {
    const m = marker(markerId); if (!m) return [];
    const out = [];
    for (const f of m.facts) {
      const t = factType(f.typeId);
      if (t && t.hasDate === false) continue;
      out.push({ ref: factRef(m.id, f.id, false), label: factTitle(f) + (t && t.hasEnd ? ' (from)' : '') });
      if (t && t.hasEnd) out.push({ ref: factRef(m.id, f.id, true), label: factTitle(f) + ' (until)' });
    }
    return out;
  }
  function relationsFor(markerId) { return S.relations.filter(r => (r.from && r.from.id === markerId) || (r.to && r.to.id === markerId)); }
  // Facts on other markers in which this marker takes part (as a participant or as the "where").
  function mentionsOf(markerId) {
    const out = [];
    for (const m of S.markers) {
      if (m.id === markerId) continue;
      for (const f of m.facts) {
        const roles = (f.participants || []).filter(p => p.markerId === markerId).map(p => { const t = factType(f.typeId); const r = t && t.roles.find(x => x.id === p.roleId); return r ? r.name : 'participant'; });
        const asPlace = f.where && f.where.kind === 'marker' && f.where.markerId === markerId;
        if (roles.length || asPlace) out.push({ marker: m, fact: f, roles, asPlace });
      }
    }
    return out;
  }
  const factTypes = () => S.factTypes;
  const factType = id => S.factTypes.find(t => t.id === id) || null;
  function addFactType(data) { const t = touch(normFactType(data)); S.factTypes.push(t); commit({ type: 'factType', id: t.id }); return t; }
  function updateFactType(id, patch) { const t = factType(id); if (!t) return null; Object.assign(t, normFactType(Object.assign({}, t, clone(patch), { id }))); touch(t); commit({ type: 'factType', id }); return t; }
  function deleteFactType(id) {
    if (factType(id)) tombstone('factTypes', id);
    S.factTypes = S.factTypes.filter(t => t.id !== id);
    S.markers.forEach(m => m.facts.forEach(f => { if (f.typeId === id) { f.label = f.label || ''; f.typeId = 'ft_note'; touch(m); } }));
    commit({ type: 'factType', id, deleted: true });
  }
  const relationsOfRef = ref => S.relations.filter(r => sameRef(r.from, ref) || sameRef(r.to, ref));
  const displayColor = m => m.color || category(m.categoryId)?.color || '#888888';
  const displayIcon = m => m.icon || category(m.categoryId)?.icon || '';

  // ---------- mutations ----------
  function addMarker(data) { const m = touch(normMarker(data)); sortMovesInPlace(m); S.markers.push(m); commit({ type: 'marker', id: m.id }); return m; }
  function updateMarker(id, patch) {
    const m = marker(id); if (!m) return null;
    Object.assign(m, clone(patch), { id });
    m.moves = (m.moves || []).map(normMove); sortMovesInPlace(m);
    m.facts = (m.facts || []).map(normFact);
    m.citations = (m.citations || []).map(normCitation);
    m.fieldSources = m.fieldSources || {};
    for (const k of Object.keys(m.fieldSources)) if (!(k in m.fields) || !m.fieldSources[k] || !m.fieldSources[k].sourceId) delete m.fieldSources[k];
    cleanReferences(S);
    touch(m);
    commit({ type: 'marker', id }); return m;
  }
  // Remove relations that touch a marker or a tie (their tombstones keep the removal in sync).
  function dropRelationsOf(kind, id) {
    const hits = r => (r.from && r.from.kind === kind && r.from.id === id) || (r.to && r.to.kind === kind && r.to.id === id);
    S.relations.filter(hits).forEach(r => tombstone('relations', r.id));
    S.relations = S.relations.filter(r => !hits(r));
  }
  function deleteMarker(id) {
    if (marker(id)) tombstone('markers', id);
    S.markers = S.markers.filter(m => m.id !== id);
    // other markers' facts that mentioned it lose that participant / place
    S.markers.forEach(m => m.facts.forEach(f => {
      const before = f.participants.length;
      f.participants = f.participants.filter(p => p.markerId !== id);
      if (f.where && f.where.kind === 'marker' && f.where.markerId === id) { f.where = null; touch(m); }
      if (f.participants.length !== before) touch(m);
    }));
    dropRelationsOf('marker', id);
    commit({ type: 'marker', id, deleted: true });
  }
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
    S.factTypes.forEach(t => t.roles.forEach(r => { if (r.tieTypeId === id) { r.tieTypeId = null; touch(t); } }));
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
      m.facts.forEach(f => { if (f.sourceId === id) { f.sourceId = null; changed = true; } });
      for (const k of Object.keys(m.fieldSources || {})) if (m.fieldSources[k] && m.fieldSources[k].sourceId === id) { delete m.fieldSources[k]; changed = true; }
      if (changed) touch(m);
    });
    S.relations.forEach(r => { if (r.sourceId === id) { r.sourceId = null; touch(r); } });
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
  function addRelation(data) {
    const r = touch(normRelation(data));
    if (!r.from || !r.to) return null;
    S.relations.push(r);
    // anchor rule: an end that already has a typed date becomes pinned, so the other end is computed from it.
    // A date that is itself computed from another relation is left alone, so chains stay anchored at one place.
    [r.from, r.to].forEach(ref => {
      const o = slotOwner(ref);
      if (o && slotValue(ref) && !(o.pinned || []).includes(ref.slot) && !isUndetermined(ref) && !derivedInfo(ref)) { o.pinned = [...(o.pinned || []), ref.slot]; touch(o); }
    });
    commit({ type: 'relation', id: r.id }); return r;
  }
  function updateRelation(id, patch) { const r = relation(id); if (!r) return null; Object.assign(r, normRelation(Object.assign({}, r, clone(patch), { id }))); touch(r); commit({ type: 'relation', id }); return r; }
  function deleteRelation(id) { if (relation(id)) tombstone('relations', id); S.relations = S.relations.filter(r => r.id !== id); commit({ type: 'relation', id, deleted: true }); }

  // Write the solver's results: derived dates and the "where this came from" notes. Only slots whose
  // value actually changed are marked as edited, so a recomputation that changes nothing causes no sync traffic.
  function applySolved(results, undeterminedKeys) {
    let changed = false;
    const owners = S.markers.map(m => ({ kind: 'marker', o: m }));
    for (const { kind, o } of owners) {
      const nd = {};
      for (const [k, res] of results) {
        if (res.ref.kind !== kind || res.ref.id !== o.id) continue;
        if (res.derived) nd[res.ref.slot] = res.derived;
        if ((o.undetermined || []).includes(res.ref.slot)) continue;
        if (!res.derived) continue; // anchors keep what the user typed
        const cur = slotRange(res.ref);
        const min = res.min && res.min !== res.value ? res.min : '', max = res.max && res.max !== res.value ? res.max : '';
        if (!cur || res.value !== cur.date || min !== ((slotParts(res.ref.slot).isEnd ? slotFact(o, res.ref.slot).dateEndMin : slotFact(o, res.ref.slot).dateMin) || '') || max !== ((slotParts(res.ref.slot).isEnd ? slotFact(o, res.ref.slot).dateEndMax : slotFact(o, res.ref.slot).dateMax) || '')) {
          setSlotRaw(o, res.ref.slot, res.value, min, max); touch(o); changed = true;
        }
      }
      if (JSON.stringify(nd) !== JSON.stringify(o.derived || {})) { o.derived = nd; changed = true; }
      if (o.moves && changed) sortMovesInPlace(o);
    }
    if (changed) commit({ type: 'relations' });
    return changed;
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
      upsert(S.markers, obj.markers); upsert(S.links, obj.links); upsert(S.sources, obj.sources); upsert(S.photos, obj.photos); upsert(S.relations, obj.relations);
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
    // the fresh sample records must be newer than the tombstones just written for the old ones
    const now = Date.now() + 1;
    SYNC_COLLS.forEach(coll => S[coll].forEach(r => { r.updatedAt = now; }));
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
  // Normalise a document from elsewhere (an older sync file) without touching the live state.
  const normalizeDoc = obj => { const keep = S; const d = normalize(obj); S = keep; return d; };
  const syncCollections = () => SYNC_COLLS.slice();

  return {
    load, subscribe, notify, uid,
    markers, categories, linkTypes, factTypes, links, sources, photos, relations, settings, marker, category, linkType, factType, link, source, photo, relation, linksOf, displayColor, displayIcon,
    sourceLabel, markerSourceIds, sourceUseCount, photoUsers, addPhoto, updatePhoto, deletePhoto,
    refKey, parseRefKey, sameRef, factRef, slotOwner, refExists, slotValue, slotRange, isPinned, isUndetermined, derivedInfo, setPinned, setUndetermined, pinValue,
    slotLabel, slotsOfMarker, factTitle, mentionsOf, relationsFor, relationsOfRef, addRelation, updateRelation, deleteRelation, applySolved,
    addFactType, updateFactType, deleteFactType,
    sortedMoves, hasLocation, positionAt, visibleAt, linkActiveAt, firstDay, timeRange,
    addMarker, updateMarker, deleteMarker, resolveMove,
    addCategory, updateCategory, deleteCategory, addLinkType, updateLinkType, deleteLinkType,
    addSource, updateSource, deleteSource, setSetting,
    exportJSON, importJSON, resetToSample, clearAll,
    exportSyncDoc, replaceSyncDoc, isApplyingSync, syncCollections, normalizeDoc, RELIABILITY, CONFIDENCE,
  };
})();
