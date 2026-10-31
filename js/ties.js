/* Ties tab: every marker joined by one kind of tie (or all), optionally narrowed to a centre marker's group. */
window.Ties = (() => {
  const $ = id => document.getElementById(id);
  // typeId: NONE = nothing chosen yet (the tab opens this way, so the whole graph is never drawn by accident);
  // '' = all tie types. The choice lives for the session, not across a restart.
  const NONE = '__none';
  let typeId = NONE, hubId = null, layout = 'auto', selectedId = null, hubSel, fresh = false, guardOk = '';

  function init() {
    hubSel = UI.markerSelect({ onChange: v => { hubId = v; selectedId = v; fresh = true; draw(); }, placeholder: 'e.g. Declaration of Independence' });
    $('ties-hub').append(hubSel);
    $('ties-type').addEventListener('change', e => { typeId = e.target.value; fresh = true; draw(); });
    $('ties-layout').addEventListener('change', e => { layout = e.target.value; fresh = true; draw(); });
    $('ties-labels').addEventListener('change', draw);
    $('ties-shuffle').onclick = () => { fresh = true; draw(); };
    $('ties-info-close').onclick = () => { selectedId = null; draw(); };
    Store.subscribe(() => { if (App.currentTab() === 'ties') { fillTypes(); draw(); } });
    fillTypes();
  }
  function fillTypes() {
    const sel = $('ties-type');
    const cur = typeId;
    sel.innerHTML = '';
    sel.append(UI.h('option', { value: NONE }, '— pick a tie type —'));
    sel.append(UI.h('option', { value: '' }, 'All tie types'));
    Store.linkTypes().forEach(t => sel.append(UI.h('option', { value: t.id, selected: t.id === cur }, t.name + (t.directed ? ' (hierarchy)' : ''))));
    if (cur && cur !== NONE && !Store.linkType(cur)) typeId = NONE;
    sel.value = typeId;
  }
  function show() { fillTypes(); draw(); }
  function setHub(id) { hubId = id; selectedId = id; hubSel.setValue(id); fresh = true; draw(); }
  function select(id) { selectedId = id; draw(); }

  function compute() {
    if (typeId === NONE && !hubId) return { nodes: [], links: [], layout: 'random' }; // nothing chosen yet
    const all = !typeId || typeId === NONE; // a centre marker with no type shows that marker's whole group
    let links = Store.links().filter(l => (all || l.typeId === typeId) && Store.marker(l.fromId) && Store.marker(l.toId));
    let ids;
    if (hubId && Store.marker(hubId)) {
      const adj = new Map();
      const push = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
      links.forEach(l => { push(l.fromId, l.toId); push(l.toId, l.fromId); });
      ids = new Set([hubId]);
      const q = [hubId];
      while (q.length) { const x = q.shift(); for (const y of adj.get(x) || []) if (!ids.has(y)) { ids.add(y); q.push(y); } }
      links = links.filter(l => ids.has(l.fromId) && ids.has(l.toId));
    } else {
      ids = new Set(); links.forEach(l => { ids.add(l.fromId); ids.add(l.toId); });
    }
    const nodes = [...ids].map(id => { const m = Store.marker(id); return { id, label: m.name, title: Store.displayName(m), color: Store.displayColor(m), icon: Store.displayIcon(m), image: Photos.thumb(m.photoId), center: id === hubId }; });
    const glinks = links.map(l => { const t = Store.linkType(l.typeId); return { id: l.id, source: l.fromId, target: l.toId, color: t ? t.color : '#999', directed: !!(t && t.directed), topSide: t ? t.topSide : 'from', label: l.label || (!all ? '' : (t ? t.name : '')), title: `${Store.marker(l.fromId).name}${l.fromRole ? ' (' + l.fromRole + ')' : ''} — ${t ? t.name : 'link'} — ${Store.marker(l.toId).name}${l.toRole ? ' (' + l.toRole + ')' : ''}${l.confidence ? '\n' + UI.CONFIDENCE_LABELS[l.confidence] + (l.reason ? ': ' + l.reason : '') : ''}${l.note ? '\n' + l.note : ''}`, confidence: l.confidence || '' }; });
    let lay = layout;
    if (lay === 'auto') lay = glinks.some(l => l.directed) ? 'tree' : 'random';
    return { nodes, links: glinks, layout: lay };
  }

  function draw() {
    const { nodes, links, layout: lay } = compute();
    const key = typeId + ':' + (hubId || '');
    const tooBig = nodes.length > UI.GRAPH_LIMIT && guardOk !== key;
    $('ties-stats').textContent = nodes.length ? `${nodes.length} markers · ${links.length} ties · ${lay} layout${tooBig ? ' · not drawn yet' : ''}` : '';
    Graph.render($('ties-graph'), {
      nodes, links, layout: lay, selectedId, fresh, cacheKey: 'ties:' + key,
      showLinkLabels: $('ties-labels').checked,
      guard: tooBig ? UI.sizeGuard({ count: nodes.length, noun: 'markers', onDraw: () => { guardOk = key; fresh = true; draw(); } }) : null,
      emptyText: hubId ? 'That marker has no ties of this type.' : (Store.links().length ? 'Pick a tie type, or a centre marker, to draw the ties.' : 'No ties yet. Ties come from facts that name other markers (Father, Spouse, Member of…).'),
      onNodeClick: id => { selectedId = id; draw(); },
    });
    fresh = false;
    const info = $('ties-info');
    const m = selectedId && Store.marker(selectedId);
    info.innerHTML = m ? `<div class="pad">${UI.markerInfoHTML(m, null)}</div>` : '<div class="muted pad">Click a marker to see its details.</div>';
    info.classList.toggle('open', !!m); // on narrow screens the panel slides over the graph only when something is selected
  }

  return { init, show, setHub, select };
})();
