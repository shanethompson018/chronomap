/* Network tab: one marker and everything within N degrees of it, with link-type and category filters. */
window.Network = (() => {
  const $ = id => document.getElementById(id);
  let centerId = null, degrees = 1, layout = 'force', selectedId = null, centerSel, fresh = false;
  let hiddenTypes = new Set(), hiddenCats = new Set();

  function init() {
    centerSel = UI.markerSelect({ onChange: v => { centerId = v; selectedId = v; fresh = true; draw(); }, placeholder: 'Pick a marker…' });
    $('net-center').append(centerSel);
    $('net-degrees').addEventListener('input', e => { degrees = +e.target.value; $('net-deg-val').textContent = degrees; draw(); });
    $('net-layout').addEventListener('change', e => { layout = e.target.value; fresh = true; draw(); });
    $('net-labels').addEventListener('change', draw);
    $('net-types-all').onclick = () => { hiddenTypes = new Set(); renderFilters(); draw(); };
    $('net-types-none').onclick = () => { hiddenTypes = new Set(Store.linkTypes().map(t => t.id)); renderFilters(); draw(); };
    $('net-cats-all').onclick = () => { hiddenCats = new Set(); renderFilters(); draw(); };
    $('net-cats-none').onclick = () => { hiddenCats = new Set([...Store.categories().map(c => c.id), '__none']); renderFilters(); draw(); };
    $('net-views').addEventListener('change', e => loadView(e.target.value));
    $('net-view-save').onclick = saveView;
    $('net-view-delete').onclick = deleteView;
    $('net-info-close').onclick = () => { selectedId = null; draw(); };
    Store.subscribe(() => { if (App.currentTab() === 'network') { renderFilters(); draw(); } });
    renderFilters(); renderViews();
  }
  function show() { renderFilters(); draw(); }
  function setCenter(id) { centerId = id; selectedId = id; centerSel.setValue(id); fresh = true; draw(); }
  function select(id) { selectedId = id; draw(); }

  function renderFilters() {
    const th = $('net-types'); th.innerHTML = '';
    for (const t of Store.linkTypes()) {
      const cb = UI.h('input', { type: 'checkbox', checked: !hiddenTypes.has(t.id) });
      cb.addEventListener('change', () => { if (cb.checked) hiddenTypes.delete(t.id); else hiddenTypes.add(t.id); draw(); });
      th.append(UI.h('label', {}, cb, UI.h('span', { class: 'swatch sm', style: { background: t.color } }), t.name));
    }
    const ch = $('net-cats'); ch.innerHTML = '';
    const cats = Store.categories().map(c => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }));
    cats.push({ id: '__none', name: 'Uncategorised', color: '#888', icon: '' });
    for (const c of cats) {
      const cb = UI.h('input', { type: 'checkbox', checked: !hiddenCats.has(c.id) });
      cb.addEventListener('change', () => { if (cb.checked) hiddenCats.delete(c.id); else hiddenCats.add(c.id); draw(); });
      ch.append(UI.h('label', {}, cb, UI.h('span', { class: 'swatch sm', style: { background: c.color } }, c.icon), c.name));
    }
  }

  function compute() {
    const center = Store.marker(centerId);
    if (!center) return { nodes: [], links: [] };
    const okMarker = m => m && (m.id === centerId || !hiddenCats.has(m.categoryId || '__none'));
    const links = Store.links().filter(l => !hiddenTypes.has(l.typeId) && okMarker(Store.marker(l.fromId)) && okMarker(Store.marker(l.toId)));
    const adj = new Map();
    const push = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    links.forEach(l => { push(l.fromId, l.toId); push(l.toId, l.fromId); });
    const dist = new Map([[centerId, 0]]);
    const q = [centerId];
    while (q.length) {
      const x = q.shift(); const d = dist.get(x);
      if (d >= degrees) continue;
      for (const y of adj.get(x) || []) if (!dist.has(y)) { dist.set(y, d + 1); q.push(y); }
    }
    const nodes = [...dist.keys()].map(id => { const m = Store.marker(id); return { id, label: m.name, color: Store.displayColor(m), icon: Store.displayIcon(m), image: Photos.thumb(m.photoId), center: id === centerId, degree: dist.get(id) }; });
    const glinks = links.filter(l => dist.has(l.fromId) && dist.has(l.toId)).map(l => {
      const t = Store.linkType(l.typeId);
      return { id: l.id, source: l.fromId, target: l.toId, color: t ? t.color : '#999', directed: !!(t && t.directed), topSide: t ? t.topSide : 'from',
        label: (t ? t.name : '') + (l.label ? ' · ' + l.label : ''), title: `${Store.marker(l.fromId).name} — ${t ? t.name : 'link'} — ${Store.marker(l.toId).name}${l.confidence ? '\n' + UI.CONFIDENCE_LABELS[l.confidence] + (l.reason ? ': ' + l.reason : '') : ''}${l.note ? '\n' + l.note : ''}`, confidence: l.confidence || '' };
    });
    return { nodes, links: glinks };
  }

  function draw() {
    const { nodes, links } = compute();
    $('net-stats').textContent = centerId ? `${nodes.length} markers · ${links.length} ties within ${degrees} degree${degrees > 1 ? 's' : ''}` : '';
    Graph.render($('net-graph'), {
      nodes, links, layout, selectedId, fresh, cacheKey: 'net:' + (centerId || ''),
      showLinkLabels: $('net-labels').checked,
      emptyText: centerId ? 'No ties match the current filters.' : 'Pick a marker on the left to see its network.',
      onNodeClick: id => { selectedId = id; draw(); },
    });
    fresh = false;
    const info = $('net-info');
    const m = selectedId && Store.marker(selectedId);
    info.classList.toggle('open', !!m);
    if (!m) { info.innerHTML = '<div class="muted pad">Pick a marker to start from.</div>'; return; }
    info.innerHTML = `<div class="pad">${UI.markerInfoHTML(m, null)}</div>`;
    if (m.id !== centerId) {
      const btn = UI.h('button', { class: 'primary', style: { margin: '0 12px 12px' }, onclick: () => setCenter(m.id) }, '🎯 Make this the centre');
      info.append(btn);
    }
  }

  // ---------- saved views ----------
  function views() { return Store.settings().networkViews || []; }
  function renderViews() {
    const sel = $('net-views'); const cur = sel.value; sel.innerHTML = '';
    sel.append(UI.h('option', { value: '' }, '— pick a view —'));
    views().forEach(v => sel.append(UI.h('option', { value: v.name, selected: v.name === cur }, v.name)));
  }
  function saveView() {
    const name = prompt('Name for this view:', $('net-views').value || '');
    if (!name || !name.trim()) return;
    const v = { name: name.trim(), centerId, degrees, layout, hiddenTypes: [...hiddenTypes], hiddenCats: [...hiddenCats], labels: $('net-labels').checked };
    const list = views().filter(x => x.name !== v.name); list.push(v);
    Store.setSetting('networkViews', list); renderViews(); $('net-views').value = v.name; UI.toast('View saved');
  }
  function deleteView() {
    const name = $('net-views').value; if (!name) return;
    if (!confirm(`Delete the view "${name}"?`)) return;
    Store.setSetting('networkViews', views().filter(x => x.name !== name)); renderViews();
  }
  function loadView(name) {
    const v = views().find(x => x.name === name); if (!v) return;
    centerId = v.centerId; selectedId = v.centerId; centerSel.setValue(v.centerId);
    degrees = v.degrees; $('net-degrees').value = degrees; $('net-deg-val').textContent = degrees;
    layout = v.layout; $('net-layout').value = layout;
    hiddenTypes = new Set(v.hiddenTypes); hiddenCats = new Set(v.hiddenCats);
    $('net-labels').checked = v.labels !== false;
    renderFilters(); fresh = true; draw();
  }

  return { init, show, setCenter, select };
})();
