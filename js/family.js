/* Family tab: a family tree drawn from Parent of and Spouse of ties.
 *
 * Hourglass chart around one root person: ancestors above as a pedigree (father and mother over each
 * person), the root's brothers and sisters beside it, descendants below with each partner next to the
 * person and that partner's children hanging from the line between them. A partner is a spouse (Spouse of
 * tie) or the other parent of a child (drawn with a dashed line when there is no marriage fact).
 * Nothing here is stored: the tree is rebuilt from the ties on every change.
 */
window.Family = (() => {
  const $ = id => document.getElementById(id);
  const W = 150, H = 64, GX = 18, ROW = 124, BUS = 20; // box size, gap between boxes, row pitch, bus height above a row
  let rootId = null, up = 3, down = 3, showSibs = true, selectedId = null, rootSel, svg, g, zoom;

  function init() {
    rootSel = UI.markerSelect({ onChange: v => { rootId = v; selectedId = v; draw(true); }, placeholder: 'e.g. Noah' });
    $('fam-root').append(rootSel);
    $('fam-up').addEventListener('change', e => { up = +e.target.value; draw(true); });
    $('fam-down').addEventListener('change', e => { down = +e.target.value; draw(true); });
    $('fam-sibs').addEventListener('change', e => { showSibs = e.target.checked; draw(true); });
    $('fam-fit').onclick = () => fit();
    $('fam-info-close').onclick = () => { selectedId = null; draw(); };
    Store.subscribe(() => { if (App.currentTab() === 'family') draw(); });
  }
  function show() { draw(true); }
  function setRoot(id) { rootId = id; selectedId = id; rootSel.setValue(id); draw(true); }
  function select(id) { selectedId = id; draw(); }

  // ---------- family relations from the ties ----------
  function typeIds(name) { return new Set(Store.linkTypes().filter(t => t.name.trim().toLowerCase() === name).map(t => t.id)); }
  function rel() {
    const P = typeIds('parent of'), S = typeIds('spouse of');
    const parents = new Map(), children = new Map(), spouses = new Map();
    const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); if (!map.get(k).includes(v)) map.get(k).push(v); };
    for (const l of Store.links()) {
      if (l.fromId === l.toId || !Store.marker(l.fromId) || !Store.marker(l.toId)) continue;
      if (P.has(l.typeId)) { push(parents, l.toId, l.fromId); push(children, l.fromId, l.toId); }
      else if (S.has(l.typeId)) { push(spouses, l.fromId, l.toId); push(spouses, l.toId, l.fromId); }
    }
    const get = (map, k) => map.get(k) || [];
    // partners: spouses first, then anyone else who shares a child
    const partners = id => {
      const out = get(spouses, id).slice();
      for (const c of get(children, id)) for (const p of get(parents, c)) if (p !== id && !out.includes(p)) out.push(p);
      return out;
    };
    return { parents: id => get(parents, id), children: id => get(children, id), spouses: id => get(spouses, id), partners };
  }
  const born = id => { const m = Store.marker(id); const d = m && m.start ? Dates.toDays(m.start) : null; return d == null ? Infinity : d; };
  const byBirth = ids => ids.slice().sort((a, b) => born(a) - born(b) || Store.marker(a).name.localeCompare(Store.marker(b).name));
  // father on the left: the male parent, else the first
  function orderParents(ids) {
    const list = ids.slice(0, 2);
    if (list.length === 2 && Facts.sexOf(Store.marker(list[1])) === 'male' && Facts.sexOf(Store.marker(list[0])) !== 'male') list.reverse();
    return list;
  }

  // ---------- layout ----------
  // Descendant unit: a person, their partners beside them, and each partner's children underneath.
  function unit(R, id, depth, visited) {
    const u = { id, persons: [id], groups: [], width: W };
    if (depth >= down || visited.has(id)) return u;
    const seen = new Set(visited).add(id);
    const kids = R.children(id);
    const parts = R.partners(id).filter(p => p !== id);
    u.persons = [id, ...parts];
    const groupsBy = new Map(parts.map(p => [p, []]));
    const solo = [];
    for (const c of byBirth(kids)) {
      const other = R.parents(c).find(p => p !== id && groupsBy.has(p));
      (other ? groupsBy.get(other) : solo).push(c);
    }
    const mk = (partner, list) => list.length ? { partner, married: partner ? R.spouses(id).includes(partner) : false, children: list.map(c => unit(R, c, depth + 1, seen)) } : null;
    u.groups = [mk(null, solo), ...parts.map(p => mk(p, groupsBy.get(p)))].filter(Boolean);
    for (const gp of u.groups) gp.width = gp.children.reduce((s, c) => s + c.width, 0) + GX * (gp.children.length - 1);
    const personsW = u.persons.length * W + GX * (u.persons.length - 1);
    const childrenW = u.groups.reduce((s, gp) => s + gp.width, 0) + GX * Math.max(0, u.groups.length - 1);
    u.width = Math.max(personsW, childrenW);
    return u;
  }
  // Pedigree node: the parents above one person, recursively.
  function ped(R, id, depth, visited) {
    const n = { id, parents: [], width: W };
    if (depth >= up || visited.has(id)) return n;
    const seen = new Set(visited).add(id);
    n.parents = orderParents(R.parents(id)).map(p => ped(R, p, depth + 1, seen));
    if (n.parents.length) n.width = n.parents.reduce((s, p) => s + p.width, 0) + GX * (n.parents.length - 1);
    return n;
  }

  function build() {
    const R = rel();
    const root = Store.marker(rootId);
    if (!root) return null;
    const boxes = [], lines = [];
    const place = (id, cx, y, extra = {}) => boxes.push(Object.assign({ id, x: cx - W / 2, y, cx, cy: y + H / 2 }, extra));
    // a bus: from a point (dropX, fromY) down to a bar above the children, then down into each child's box
    const bus = (dropX, fromY, childY, childCxs, dashed) => {
      if (!childCxs.length) return;
      const barY = childY - BUS;
      lines.push({ d: `M${dropX},${fromY}V${barY}`, dashed });
      const lo = Math.min(dropX, ...childCxs), hi = Math.max(dropX, ...childCxs);
      if (hi > lo) lines.push({ d: `M${lo},${barY}H${hi}`, dashed });
      for (const cx of childCxs) lines.push({ d: `M${cx},${barY}V${childY}`, dashed });
    };
    const placeUnit = (u, x, y, extra) => {
      const personsW = u.persons.length * W + GX * (u.persons.length - 1);
      let px = x + (u.width - personsW) / 2 + W / 2;
      const cxOf = new Map();
      u.persons.forEach((p, i) => { cxOf.set(p, px); place(p, px, y, i === 0 ? extra : { partner: true }); px += W + GX; });
      const childrenW = u.groups.reduce((s, gp) => s + gp.width, 0) + GX * Math.max(0, u.groups.length - 1);
      let gx = x + (u.width - childrenW) / 2;
      let k = 0;
      for (const gp of u.groups) {
        const me = cxOf.get(u.id);
        let dropX = me, fromY = y + H;
        if (gp.partner) {
          const pc = cxOf.get(gp.partner);
          const barY = y + H + 6 + 6 * k++;
          lines.push({ d: `M${me},${y + H}V${barY}H${pc}V${y + H}`, dashed: !gp.married, marriage: true });
          dropX = (me + pc) / 2; fromY = barY;
        }
        const cxs = [];
        let cx = gx;
        for (const c of gp.children) { cxs.push(placeUnit(c, cx, y + ROW)); cx += c.width + GX; }
        bus(dropX, fromY, y + ROW, cxs, !gp.partner && false);
        gx += gp.width + GX;
      }
      return cxOf.get(u.id);
    };
    // the pedigree above a person whose box is centred at cx, row y (parents go at y - ROW)
    const placePed = (n, x, y, childCx) => {
      if (!n.parents.length) return;
      const py = y - ROW;
      let sx = x;
      const cxs = [];
      for (const p of n.parents) { const c = sx + p.width / 2; cxs.push(c); place(p.id, c, py, { ancestor: true }); placePed(p, sx, py, c); sx += p.width + GX; }
      let dropX = cxs[0], fromY = py + H;
      if (cxs.length === 2) {
        const barY = py + H + 6;
        lines.push({ d: `M${cxs[0]},${py + H}V${barY}H${cxs[1]}V${py + H}`, dashed: !R.spouses(n.parents[0].id).includes(n.parents[1].id), marriage: true });
        dropX = (cxs[0] + cxs[1]) / 2; fromY = barY;
      }
      return { dropX, fromY };
    };

    // root row: the root's unit with brothers and sisters (leaf boxes) in birth order
    const visited = new Set();
    const rootUnit = unit(R, rootId, 0, visited);
    const sibIds = showSibs ? [...new Set(R.parents(rootId).flatMap(p => R.children(p)))].filter(s => s !== rootId) : [];
    const row = byBirth([rootId, ...sibIds]).map(id => id === rootId ? rootUnit : { id, persons: [id], groups: [], width: W });
    const rowW = row.reduce((s, u) => s + u.width, 0) + GX * (row.length - 1);
    const pedRoot = ped(R, rootId, 0, new Set());
    const aboveW = pedRoot.parents.length ? pedRoot.width : 0;
    const totalW = Math.max(rowW, aboveW);
    let x = (totalW - rowW) / 2;
    const rowCxs = [];
    for (const u of row) { rowCxs.push(placeUnit(u, x, 0, u.id === rootId ? { root: true } : { sibling: true })); x += u.width + GX; }
    if (pedRoot.parents.length) {
      const top = placePed(pedRoot, (totalW - aboveW) / 2, 0, rowCxs[row.findIndex(u => u.id === rootId)]);
      bus(top.dropX, top.fromY, 0, rowCxs, false);
    }
    return { boxes, lines, count: new Set(boxes.map(b => b.id)).size };
  }

  // ---------- drawing ----------
  const yr = s => s ? Dates.formatInput(s) : '';
  function draw(refit = false) {
    const host = $('fam-tree');
    const eink = App.isEink();
    const tree = rootId ? build() : null;
    if (!svg) {
      svg = d3.select(host).append('svg');
      g = svg.append('g');
      zoom = d3.zoom().scaleExtent([0.15, 3]).on('zoom', e => g.attr('transform', e.transform));
      svg.call(zoom).on('dblclick.zoom', null);
      svg.on('click', () => { if (selectedId) { selectedId = null; draw(); } });
    }
    g.selectAll('*').remove();
    const empty = $('fam-empty');
    if (!tree) {
      empty.textContent = Store.markers().length ? 'Pick a person on the left, or press 🌳 Family in a person\'s bubble.' : 'No markers yet.';
      empty.classList.remove('hidden'); $('fam-stats').textContent = ''; renderInfo(); return;
    }
    empty.classList.add('hidden');
    $('fam-stats').textContent = `${tree.count} people`;
    g.selectAll('path.ft-line').data(tree.lines).join('path')
      .attr('class', d => 'ft-line' + (d.marriage ? ' marriage' : '') + (d.dashed ? ' dashed' : ''))
      .attr('d', d => d.d);
    const node = g.selectAll('g.ft-node').data(tree.boxes).join('g')
      .attr('class', d => 'ft-node' + (d.root ? ' root' : '') + (d.id === selectedId ? ' selected' : ''))
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (e, d) => { e.stopPropagation(); selectedId = d.id; draw(); })
      .on('dblclick', (e, d) => { e.stopPropagation(); setRoot(d.id); });
    node.append('rect').attr('class', 'ft-box').attr('width', W).attr('height', H).attr('rx', 8)
      .attr('stroke', d => eink ? '#000' : Store.displayColor(Store.marker(d.id)));
    node.each(function (d) {
      const m = Store.marker(d.id), sel = d3.select(this);
      const t = m.photoId ? Photos.thumb(m.photoId) : null;
      if (t && !eink) {
        const cid = 'ftclip-' + d.id;
        sel.append('clipPath').attr('id', cid).append('circle').attr('cx', 26).attr('cy', H / 2).attr('r', 20);
        sel.append('image').attr('href', t).attr('x', 6).attr('y', H / 2 - 20).attr('width', 40).attr('height', 40).attr('preserveAspectRatio', 'xMidYMid slice').attr('clip-path', `url(#${cid})`);
      } else {
        sel.append('circle').attr('class', 'ft-ico').attr('cx', 26).attr('cy', H / 2).attr('r', 18).attr('fill', eink ? '#fff' : Store.displayColor(m));
        sel.append('text').attr('class', 'ft-ico-text').attr('x', 26).attr('y', H / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').text(Store.displayIcon(m));
      }
      const sx = Facts.sexOf(m) === 'male' ? '♂' : Facts.sexOf(m) === 'female' ? '♀' : '';
      sel.append('text').attr('class', 'ft-name').attr('x', 52).attr('y', 25).text(trim(m.name, 15));
      sel.append('text').attr('class', 'ft-dates').attr('x', 52).attr('y', 44).text(trim([yr(m.start), yr(m.end)].filter(Boolean).join(' – '), 18));
      if (sx) sel.append('text').attr('class', 'ft-sex').attr('x', W - 8).attr('y', 14).attr('text-anchor', 'end').text(sx);
      sel.append('title').text(`${m.name}${m.summary ? '\n' + m.summary : ''}\nClick for details · double-click to make this the root`);
    });
    if (refit) fit();
    renderInfo();
  }
  const trim = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
  function fit() {
    if (!svg || !g.node() || !g.node().getBBox) return;
    const b = g.node().getBBox(), host = $('fam-tree');
    const w = host.clientWidth, h = host.clientHeight;
    if (!b.width || !b.height || !w || !h) return;
    const k = Math.min(2, 0.92 * Math.min(w / b.width, h / b.height));
    const t = d3.zoomIdentity.translate(w / 2 - k * (b.x + b.width / 2), h / 2 - k * (b.y + b.height / 2)).scale(k);
    if (App.isEink()) svg.call(zoom.transform, t); else svg.transition().duration(250).call(zoom.transform, t);
  }
  function renderInfo() {
    const info = $('fam-info');
    const m = selectedId && Store.marker(selectedId);
    info.innerHTML = m ? `<div class="pad">${UI.markerInfoHTML(m, null)}</div>` : '<div class="muted pad">Click a person to see their details; double-click to make them the root.</div>';
    if (m && m.id !== rootId) info.append(UI.h('button', { class: 'primary', style: { margin: '0 12px 12px' }, onclick: () => setRoot(m.id) }, '🌳 Make this the root'));
    info.classList.toggle('open', !!m);
  }

  return { init, show, setRoot, select };
})();
