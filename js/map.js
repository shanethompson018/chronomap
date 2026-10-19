/* Map tab: Leaflet map, time slider, marker layers, popups, pick/draw modes, sidebar list. */
window.MapView = (() => {
  const $ = id => document.getElementById(id);
  let map, baseLayers = {}, currentBase = null, tieLayer;
  const layers = new Map();          // markerId -> { kind, layer, sig }
  let t = 0, range = { min: 0, max: 1 }, ignoreTime = false, playTimer = null;
  let hiddenCats = new Set(), search = '', sourceFilter = '';
  let pick = null;                   // { type:'point'|'shape', kind, cb, points, layer, verts }
  let showLabels = true, showTies = true;

  // ---------- init ----------
  function init() {
    const eink = App.isEink();
    // e-paper screens ghost badly on animation, so e-ink mode draws every move in one step
    map = L.map('map', { worldCopyJump: true, zoomControl: true, zoomAnimation: !eink, fadeAnimation: !eink, markerZoomAnimation: !eink, inertia: !eink }).setView([38, -40], 3);
    const esri = (path, maxZoom = 16) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`, { attribution: 'Tiles &copy; Esri', maxZoom });
    // Note: tile.openstreetmap.org is deliberately not offered. Its usage policy blocks requests from pages opened
    // as local files (no Referer header), which is how the Start Menu shortcut opens the app.
    baseLayers = {
      streets: esri('World_Street_Map', 19),
      light: esri('Canvas/World_Light_Gray_Base'),
      dark: esri('Canvas/World_Dark_Gray_Base'),
      natgeo: esri('NatGeo_World_Map', 16),
      terrain: esri('World_Physical_Map', 8),
      satellite: esri('World_Imagery', 18),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap', maxZoom: 17 }),
      none: null,
    };
    tieLayer = L.layerGroup().addTo(map);
    map.on('click', onMapClick);
    map.on('dblclick', () => { if (pick && pick.type === 'shape') finishShape(); });

    const s = Store.settings();
    showLabels = s.showLabels !== false; showTies = !!s.showTies;
    $('t-labels').checked = showLabels; $('t-ties').checked = showTies;
    $('t-basemap').value = baseLayers.hasOwnProperty(s.basemap) ? s.basemap : 'streets';
    setBasemap($('t-basemap').value);

    // time controls
    $('t-slider').addEventListener('input', e => setTime(+e.target.value, false));
    $('t-start').onclick = () => setTime(range.min);
    $('t-end').onclick = () => setTime(range.max);
    $('t-back').onclick = () => step(-1);
    $('t-fwd').onclick = () => step(1);
    $('t-play').onclick = togglePlay;
    $('t-date').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const d = Dates.toDays(e.target.value);
      if (d == null) { UI.toast('Could not read that date. Try 1776-07-04, 1776, or 500 BC', 'error'); return; }
      if (d < range.min || d > range.max) { range.min = Math.min(range.min, d - 365); range.max = Math.max(range.max, d + 365); applyRange(); }
      setTime(d); e.target.blur();
    });
    $('t-ignore').addEventListener('change', e => { ignoreTime = e.target.checked; $('t-slider').disabled = ignoreTime; refresh(); updateTimeLabel(); });
    $('t-ties').addEventListener('change', e => { showTies = e.target.checked; Store.setSetting('showTies', showTies); refresh(); });
    $('t-labels').addEventListener('change', e => { showLabels = e.target.checked; Store.setSetting('showLabels', showLabels); refresh(); });
    $('t-basemap').addEventListener('change', e => { setBasemap(e.target.value); Store.setSetting('basemap', e.target.value); });

    // sidebar
    $('m-search').addEventListener('input', e => { search = e.target.value.trim().toLowerCase(); refresh(); });
    $('m-source').addEventListener('change', e => { sourceFilter = e.target.value; refresh(); });
    $('m-cats-all').onclick = () => { hiddenCats = new Set(); renderCats(); refresh(); };
    $('m-cats-none').onclick = () => { hiddenCats = new Set([...Store.categories().map(c => c.id), '__none']); renderCats(); refresh(); };
    $('m-add-pin').onclick = () => addPin();
    $('m-add-area').onclick = () => addShape('area');
    $('m-add-path').onclick = () => addShape('path');

    Store.subscribe(onStore);
    resetRange(true);
    renderCats();
    refresh();
    fitAll();
  }

  // Zoom to everything currently on the map (or to every marker that has a location, if nothing is shown now).
  function fitAll() {
    let b = L.latLngBounds([]);
    for (const rec of layers.values()) b = rec.kind === 'pin' ? b.extend(rec.layer.getLatLng()) : b.extend(rec.layer.getBounds());
    if (!b.isValid()) {
      for (const m of Store.markers()) for (const mv of m.moves) {
        if (mv.coords && mv.coords.length) mv.coords.forEach(c => b.extend([+c[0], +c[1]]));
        else if (mv.lat != null && mv.lng != null) b.extend([+mv.lat, +mv.lng]);
      }
    }
    if (b.isValid()) map.fitBounds(b.pad(0.2), { maxZoom: 8 });
  }

  // Move the view: animated normally, instant in e-ink mode.
  function goTo(latlng, zoom) {
    if (App.isEink()) map.setView(latlng, zoom, { animate: false }); else map.flyTo(latlng, zoom, { duration: 0.6 });
  }
  function goToBounds(bounds) {
    if (App.isEink()) map.fitBounds(bounds, { padding: [40, 40], animate: false }); else map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
  }

  function setBasemap(key) {
    if (currentBase) { map.removeLayer(currentBase); currentBase = null; }
    const l = baseLayers[key];
    if (l) { l.addTo(map); l.bringToBack(); currentBase = l; }
  }

  function onStore(evt) {
    if (evt.type === 'photos' || evt.type === 'photo') { refresh(); return; } // pins pick up new profile pictures
    resetRange(false);
    renderCats();
    refresh();
    if (evt.type === 'marker' && evt.id) {
      const rec = layers.get(evt.id);
      if (rec && rec.layer.isPopupOpen && rec.layer.isPopupOpen()) rec.layer.getPopup().setContent(popupContent(evt.id));
    }
  }

  function show() { setTimeout(() => map.invalidateSize(), 0); }

  // ---------- time ----------
  function resetRange(jumpToStart) {
    range = Store.timeRange();
    applyRange();
    if (jumpToStart || t < range.min || t > range.max) {
      // start where the first marker appears, rather than at the padded edge of the range
      const firsts = Store.markers().map(Store.firstDay).filter(d => d != null);
      const first = firsts.length ? Math.min(...firsts) : Dates.today();
      t = Math.min(Math.max(first, range.min), range.max);
    }
    $('t-slider').value = t;
    updateTimeLabel();
  }
  function applyRange() {
    $('t-slider').min = range.min; $('t-slider').max = range.max;
    $('t-min').textContent = Dates.format(range.min, 'year');
    $('t-max').textContent = Dates.format(range.max, 'year');
  }
  function setTime(days, syncSlider = true) {
    t = Math.round(Math.min(Math.max(days, range.min), range.max));
    if (syncSlider) $('t-slider').value = t;
    updateTimeLabel();
    refresh();
  }
  function updateTimeLabel() {
    $('t-display').textContent = ignoreTime ? 'All times' : Dates.format(t);
    if (document.activeElement !== $('t-date')) $('t-date').value = Dates.iso(t);
  }
  function stepDays(dir) {
    const v = $('t-step').value;
    if (v === 'month') return Dates.addMonths(t, dir);
    if (v === 'year') return Dates.addMonths(t, 12 * dir);
    if (v === 'decade') return Dates.addMonths(t, 120 * dir);
    return t + dir * (+v);
  }
  function step(dir) { setTime(stepDays(dir)); }
  function togglePlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('t-play').classList.remove('on'); $('t-play').textContent = '▶'; return; }
    if (t >= range.max) t = range.min;
    if (ignoreTime) { $('t-ignore').checked = false; ignoreTime = false; $('t-slider').disabled = false; }
    playTimer = setInterval(() => { const n = stepDays(1); if (n >= range.max) { setTime(range.max); togglePlay(); } else setTime(n); }, App.isEink() ? 600 : 120);
    $('t-play').classList.add('on'); $('t-play').textContent = '⏸';
  }
  const time = () => (ignoreTime ? null : t);

  // ---------- filtering ----------
  function passesFilter(m) {
    if (hiddenCats.has(m.categoryId || '__none')) return false;
    if (sourceFilter && !Store.markerSourceIds(m).has(sourceFilter)) return false;
    if (search) {
      const hay = (m.name + ' ' + (m.summary || '') + ' ' + (m.tags || []).join(' ') + ' ' + Object.values(m.fields || {}).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }
  function renderCats() {
    const srcSel = $('m-source');
    srcSel.innerHTML = '';
    srcSel.append(UI.h('option', { value: '' }, 'Any source'));
    Store.sources().forEach(s => srcSel.append(UI.h('option', { value: s.id, selected: s.id === sourceFilter }, '📖 ' + Store.sourceLabel(s.id))));
    if (sourceFilter && !Store.source(sourceFilter)) sourceFilter = '';
    srcSel.value = sourceFilter;
    const host = $('m-cats'); host.innerHTML = '';
    const items = Store.categories().map(c => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }));
    if (Store.markers().some(m => !m.categoryId)) items.push({ id: '__none', name: 'Uncategorised', color: '#888', icon: '' });
    for (const c of items) {
      const cb = UI.h('input', { type: 'checkbox', checked: !hiddenCats.has(c.id) });
      cb.addEventListener('change', () => { if (cb.checked) hiddenCats.delete(c.id); else hiddenCats.add(c.id); refresh(); });
      host.append(UI.h('label', {}, cb, UI.h('span', { class: 'swatch sm', style: { background: c.color } }, c.icon), c.name));
    }
  }

  // ---------- rendering ----------
  function refresh() {
    if (!map) return;
    const tt = time();
    const keep = new Set();
    for (const m of Store.markers()) {
      if (!passesFilter(m) || !Store.visibleAt(m, tt)) continue;
      const mv = Store.positionAt(m, tt);
      if (!Store.hasLocation(mv)) continue;
      if (m.kind !== 'pin' && !(mv.coords && mv.coords.length)) continue;
      if (m.kind === 'pin' && (mv.lat == null || mv.lng == null)) continue;
      upsert(m, mv); keep.add(m.id);
    }
    for (const [id, rec] of layers) if (!keep.has(id)) { map.removeLayer(rec.layer); layers.delete(id); }
    drawTies(keep, tt);
    renderList(keep, tt);
  }

  function pinIcon(m, color, icon) {
    const label = showLabels ? `<div class="pin-label">${UI.esc(m.name)}</div>` : '';
    const photo = Photos.thumb(m.photoId);
    const dot = photo
      ? `<div class="pin-dot pin-photo" style="border-color:${UI.esc(color)};background-image:url('${photo}')"></div>`
      : `<div class="pin-dot" style="background:${UI.esc(color)}">${UI.esc(icon)}</div>`;
    return L.divIcon({ className: 'pin-icon', html: dot + label, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });
  }
  function popupContent(id) {
    const m = Store.marker(id);
    return m ? UI.markerInfoHTML(m, time()) : '';
  }
  function bindPopup(layer, id) {
    layer.bindPopup(() => popupContent(id), { maxWidth: 360, minWidth: 260, maxHeight: 340, className: 'cm-popup' });
  }

  function upsert(m, mv) {
    const color = Store.displayColor(m), icon = Store.displayIcon(m);
    let rec = layers.get(m.id);
    if (rec && rec.kind !== m.kind) { map.removeLayer(rec.layer); layers.delete(m.id); rec = null; }
    if (m.kind === 'pin') {
      const ll = [+mv.lat, +mv.lng];
      const sig = `${color}|${icon}|${m.name}|${showLabels}|${Photos.thumb(m.photoId) || ''}`;
      if (!rec) {
        const layer = L.marker(ll, { icon: pinIcon(m, color, icon), riseOnHover: true });
        bindPopup(layer, m.id); layer.addTo(map);
        rec = { kind: 'pin', layer, sig }; layers.set(m.id, rec);
      } else {
        rec.layer.setLatLng(ll);
        if (rec.sig !== sig) { rec.layer.setIcon(pinIcon(m, color, icon)); rec.sig = sig; }
      }
    } else {
      const coords = mv.coords.map(c => [+c[0], +c[1]]);
      if (!rec) {
        const layer = m.kind === 'area'
          ? L.polygon(coords, { color, weight: 2, fillOpacity: 0.18 })
          : L.polyline(coords, { color, weight: 4, opacity: 0.85 });
        layer.bindTooltip(m.name, { sticky: true });
        bindPopup(layer, m.id); layer.addTo(map);
        rec = { kind: m.kind, layer }; layers.set(m.id, rec);
      } else {
        rec.layer.setLatLngs(coords);
        rec.layer.setStyle({ color });
        if (rec.layer.getTooltip() && rec.layer.getTooltip().getContent() !== m.name) rec.layer.setTooltipContent(m.name);
      }
    }
  }

  function centerOf(rec) {
    if (!rec) return null;
    if (rec.kind === 'pin') return rec.layer.getLatLng();
    const b = rec.layer.getBounds();
    return b.isValid() ? b.getCenter() : null;
  }
  function drawTies(keep, tt) {
    tieLayer.clearLayers();
    if (!showTies) return;
    for (const l of Store.links()) {
      if (!keep.has(l.fromId) || !keep.has(l.toId) || !Store.linkActiveAt(l, tt)) continue;
      const a = centerOf(layers.get(l.fromId)), b = centerOf(layers.get(l.toId));
      if (!a || !b) continue;
      const type = Store.linkType(l.typeId);
      const line = L.polyline([a, b], { color: type ? type.color : '#999', weight: 2, opacity: 0.7, dashArray: '6 6', interactive: true });
      const fromName = Store.marker(l.fromId)?.name, toName = Store.marker(l.toId)?.name;
      line.bindTooltip(`${UI.esc(fromName)} — ${UI.esc(type ? type.name : 'link')} ${type && type.directed ? '→' : '—'} ${UI.esc(toName)}${l.label ? ' · ' + UI.esc(l.label) : ''}`, { sticky: true });
      tieLayer.addLayer(line);
    }
  }

  function renderList(keep, tt) {
    const host = $('m-list'); host.innerHTML = '';
    const ms = Store.markers().filter(passesFilter).sort((a, b) => a.name.localeCompare(b.name));
    $('m-count').textContent = `${keep.size} on map / ${ms.length}`;
    for (const m of ms) {
      const on = keep.has(m.id);
      let status = '';
      if (on) { const mv = Store.positionAt(m, tt); status = mv && mv.label ? mv.label : 'on map'; }
      else if (!m.moves.length || !m.moves.some(Store.hasLocation)) status = 'no location';
      else status = 'not at this time';
      const row = UI.h('div', { class: 'marker-row' + (on ? '' : ' off'), title: on ? 'Show on map' : 'Jump to when this marker first appears' },
        UI.h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)),
        UI.h('span', { class: 'name' }, m.name), UI.h('span', { class: 'status' }, status));
      row.addEventListener('click', () => locate(m.id));
      host.append(row);
    }
  }

  // Pan to a marker; if it is not on the map at the current time, jump the slider to its first appearance.
  function locate(id) {
    const m = Store.marker(id); if (!m) return;
    let rec = layers.get(id);
    if (!rec) {
      const hidden = hiddenCats.has(m.categoryId || '__none');
      if (hidden) { hiddenCats.delete(m.categoryId || '__none'); renderCats(); }
      if (search) { search = ''; $('m-search').value = ''; }
      if (sourceFilter) { sourceFilter = ''; $('m-source').value = ''; }
      const fd = Store.firstDay(m);
      if (!ignoreTime && fd != null && !(Store.visibleAt(m, t) && Store.hasLocation(Store.positionAt(m, t)))) {
        if (fd < range.min || fd > range.max) { range.min = Math.min(range.min, fd); range.max = Math.max(range.max, fd); applyRange(); }
        setTime(fd);
      } else refresh();
      rec = layers.get(id);
      if (!rec) { UI.toast(`"${m.name}" has no location to show.`); Editor.open(id); return; }
    }
    const c = centerOf(rec);
    if (rec.kind === 'pin') goTo(c, Math.max(map.getZoom(), 6));
    else goToBounds(rec.layer.getBounds());
    setTimeout(() => rec.layer.openPopup(c), App.isEink() ? 0 : 650);
  }

  // Pan to one position (a move) and flash a highlight there, whatever the slider says.
  let highlight = null;
  function showPosition(mv, kind) {
    if (!Store.hasLocation(mv)) { UI.toast('This position has no location yet'); return; }
    if (highlight) { map.removeLayer(highlight); highlight = null; }
    if (kind === 'pin' || !(mv.coords && mv.coords.length)) {
      const ll = L.latLng(+mv.lat, +mv.lng);
      goTo(ll, Math.max(map.getZoom(), 7));
      highlight = L.circleMarker(ll, { radius: 22, color: App.isEink() ? '#000' : '#ffb84f', weight: 3, fillOpacity: 0.15, className: 'pulse' }).addTo(map);
    } else {
      const coords = mv.coords.map(c => [+c[0], +c[1]]);
      const hc = App.isEink() ? '#000' : '#ffb84f';
      const shape = kind === 'area' ? L.polygon(coords, { color: hc, weight: 3, dashArray: '6 4', fillOpacity: 0.1 }) : L.polyline(coords, { color: hc, weight: 6, opacity: 0.6 });
      goToBounds(shape.getBounds());
      highlight = shape.addTo(map);
    }
    const h = highlight;
    setTimeout(() => { if (highlight === h) { map.removeLayer(h); highlight = null; } }, 2500);
  }

  // ---------- pick / draw modes ----------
  function banner(text, buttons) {
    const b = $('map-banner'); b.innerHTML = ''; b.classList.remove('hidden');
    b.append(UI.h('span', {}, text));
    for (const { label, fn } of buttons) b.append(UI.h('button', { onclick: fn }, label));
  }
  function hideBanner() { $('map-banner').classList.add('hidden'); }

  function pickPoint(cb, text) {
    cancelPick();
    pick = { type: 'point', cb };
    $('map').classList.add('picking');
    banner(text || 'Click on the map to place the point', [{ label: 'Cancel', fn: cancelPick }]);
  }
  function drawShape(kind, initial, cb) {
    cancelPick();
    pick = { type: 'shape', kind, cb, points: (initial || []).map(p => [+p[0], +p[1]]) };
    pick.layer = (kind === 'area' ? L.polygon : L.polyline)(pick.points, { color: '#ffb84f', weight: 3, dashArray: '6 4', fillOpacity: 0.15 }).addTo(map);
    pick.verts = L.layerGroup().addTo(map);
    redrawTemp();
    map.doubleClickZoom.disable();
    $('map').classList.add('picking');
    banner(`Click to add points of the ${kind === 'area' ? 'area' : 'path'}. Double-click or press Finish when done.`,
      [{ label: 'Undo point', fn: () => { pick.points.pop(); redrawTemp(); } }, { label: 'Clear', fn: () => { pick.points = []; redrawTemp(); } },
       { label: 'Finish', fn: finishShape }, { label: 'Cancel', fn: cancelPick }]);
  }
  function redrawTemp() {
    if (!pick || pick.type !== 'shape') return;
    pick.layer.setLatLngs(pick.points);
    pick.verts.clearLayers();
    pick.points.forEach(p => pick.verts.addLayer(L.circleMarker(p, { radius: 4, color: '#ffb84f', fillOpacity: 1 })));
  }
  function finishShape() {
    if (!pick || pick.type !== 'shape') return;
    const pts = pick.points.slice();
    // a double-click also fires two clicks at the same spot: drop the duplicate
    while (pts.length >= 2 && Math.abs(pts[pts.length - 1][0] - pts[pts.length - 2][0]) < 1e-6 && Math.abs(pts[pts.length - 1][1] - pts[pts.length - 2][1]) < 1e-6) pts.pop();
    const need = pick.kind === 'area' ? 3 : 2;
    if (pts.length < need) { UI.toast(`Add at least ${need} points`, 'error'); return; }
    const cb = pick.cb; cancelPick(); cb(pts);
  }
  function cancelPick() {
    if (!pick) return;
    if (pick.layer) map.removeLayer(pick.layer);
    if (pick.verts) map.removeLayer(pick.verts);
    pick = null;
    map.doubleClickZoom.enable();
    $('map').classList.remove('picking');
    hideBanner();
  }
  function onMapClick(e) {
    if (!pick) return;
    if (pick.type === 'point') { const cb = pick.cb; cancelPick(); cb(e.latlng); }
    else { pick.points.push([e.latlng.lat, e.latlng.lng]); redrawTemp(); }
  }

  function defaultMoveDate() { return ignoreTime ? '' : Dates.iso(t); }
  function defaultCategory(kind) { return Store.categories().find(c => (c.defaultKind || 'pin') === kind)?.id || Store.categories()[0]?.id || null; }
  function addPin() {
    App.showTab('map');
    pickPoint(ll => {
      Editor.openNew({ name: 'New marker', kind: 'pin', categoryId: defaultCategory('pin'), moves: [{ date: defaultMoveDate(), lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }] });
    }, 'Click on the map where the new pin should be');
  }
  function addShape(kind) {
    App.showTab('map');
    drawShape(kind, [], coords => {
      Editor.openNew({ name: kind === 'area' ? 'New area' : 'New path', kind, categoryId: defaultCategory(kind), moves: [{ date: defaultMoveDate(), coords: coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]) }] });
    });
  }

  return { init, show, refresh, locate, showPosition, setTime, time, pickPoint, drawShape, cancelPick, fitAll, isPicking: () => !!pick };
})();
