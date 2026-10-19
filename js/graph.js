/* Graph renderer (SVG + d3) shared by the Ties and Network tabs.
 * nodes: [{ id, label, color, icon, center }]
 * links: [{ id, source, target, color, directed, topSide, label, title }]
 * layout: 'force' | 'tree' | 'random'
 */
window.Graph = (() => {
  const posCache = new Map(); // cacheKey -> Map(nodeId -> {x,y})
  let sim = null;
  const R = 20;

  function render(container, opts) {
    const { nodes, links, layout = 'force', onNodeClick, selectedId, showLinkLabels = true, cacheKey = 'default', emptyText, fresh = false } = opts;
    if (sim) { sim.stop(); sim = null; }
    const eink = document.body.classList.contains('eink');
    d3.select(container).selectAll('svg').interrupt(); // stop any zoom transition on the old drawing
    container.innerHTML = '';
    const w = container.clientWidth || 900, hgt = container.clientHeight || 600;
    if (!nodes.length) { container.append(UI.h('div', { class: 'graph-empty' }, emptyText || 'Nothing to show')); return; }

    if (fresh) posCache.delete(cacheKey);
    const cache = posCache.get(cacheKey) || new Map();
    posCache.set(cacheKey, cache);

    const N = nodes.map(n => Object.assign({}, n, cache.get(n.id) || {}));
    const idSet = new Set(N.map(n => n.id));
    const Ls = links.filter(l => idSet.has(l.source) && idSet.has(l.target)).map(l => Object.assign({}, l));
    const byId = new Map(N.map(n => [n.id, n]));

    if (layout === 'tree') layered(N, Ls, w, hgt);
    else N.forEach(n => { if (n.x == null || layout === 'random' && fresh) { n.x = 80 + Math.random() * (w - 160); n.y = 80 + Math.random() * (hgt - 160); } });

    const svg = d3.select(container).append('svg');
    const defs = svg.append('defs');
    const colorId = c => 'arrow-' + String(c).replace(/[^a-z0-9]/gi, '');
    [...new Set(Ls.map(l => l.color))].forEach(c => {
      defs.append('marker').attr('id', colorId(c)).attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', c);
    });
    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.05, 6]).extent([[0, 0], [w, hgt]]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);

    const linkSel = g.append('g').selectAll('g').data(Ls).join('g').attr('class', 'link');
    linkSel.append('line').attr('stroke', d => d.color).attr('stroke-width', 2).attr('stroke-opacity', 0.85)
      .attr('marker-end', d => d.directed ? `url(#${colorId(d.color)})` : null);
    linkSel.append('title').text(d => d.title || d.label || '');
    const linkText = showLinkLabels ? linkSel.append('text').attr('class', 'link-label').text(d => d.label || '') : null;
    // confidence badge at the midpoint of graded edges
    const COLORS = { high: '#1e7e46', reasonable: '#3fae5e', low: '#e0a21b', none: '#d9403a' };
    const GLYPH = { high: '\u2713\u2713', reasonable: '\u2713', low: '?', none: '\u2717' };
    const graded = linkSel.filter(d => !!d.confidence);
    graded.append('circle').attr('class', 'edge-badge').attr('r', 8).attr('fill', d => COLORS[d.confidence] || '#888').attr('stroke', '#fff').attr('stroke-width', 1.5);
    graded.append('text').attr('class', 'edge-badge-text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', d => d.confidence === 'high' ? 7 : 10).attr('font-weight', 700).attr('fill', '#fff').text(d => GLYPH[d.confidence] || '');

    const nodeSel = g.append('g').selectAll('g').data(N).join('g')
      .attr('class', d => 'node' + (d.center ? ' center' : '')).style('cursor', 'pointer');
    nodeSel.append('circle').attr('r', R).attr('fill', d => d.color)
      .attr('stroke', d => d.id === selectedId ? '#fff' : 'rgba(0,0,0,.45)').attr('stroke-width', d => d.id === selectedId ? 4 : 1.5);
    // profile pictures: clip the image to the circle, keep the coloured ring visible around it
    const clipId = d => ('clip-' + cacheKey + '-' + d.id).replace(/[^a-z0-9_-]/gi, '_');
    const withImg = nodeSel.filter(d => !!d.image);
    withImg.append('clipPath').attr('id', clipId).append('circle').attr('r', R - 2);
    withImg.append('image').attr('href', d => d.image).attr('x', -(R - 2)).attr('y', -(R - 2)).attr('width', 2 * (R - 2)).attr('height', 2 * (R - 2))
      .attr('preserveAspectRatio', 'xMidYMid slice').attr('clip-path', d => `url(#${clipId(d)})`).style('pointer-events', 'none');
    nodeSel.filter(d => !d.image).append('text').attr('class', 'node-icon').attr('text-anchor', 'middle').attr('dy', '0.35em').text(d => d.icon || '');
    nodeSel.append('text').attr('class', 'node-label').attr('text-anchor', 'middle').attr('dy', R + 15).text(d => d.label);
    nodeSel.append('title').text(d => d.label);
    nodeSel.on('click', (e, d) => { e.stopPropagation(); onNodeClick && onNodeClick(d.id); });

    const S = d => (typeof d.source === 'object' ? d.source : byId.get(d.source));
    const T = d => (typeof d.target === 'object' ? d.target : byId.get(d.target));
    function tick() {
      linkSel.select('line').each(function (d) {
        const s = S(d), tn = T(d);
        const dx = tn.x - s.x, dy = tn.y - s.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        d3.select(this).attr('x1', s.x + ux * R).attr('y1', s.y + uy * R).attr('x2', tn.x - ux * (R + 2)).attr('y2', tn.y - uy * (R + 2));
      });
      if (linkText) linkText.attr('x', d => (S(d).x + T(d).x) / 2).attr('y', d => (S(d).y + T(d).y) / 2 - 12);
      linkSel.select('circle.edge-badge').attr('cx', d => (S(d).x + T(d).x) / 2).attr('cy', d => (S(d).y + T(d).y) / 2);
      linkSel.select('text.edge-badge-text').attr('x', d => (S(d).x + T(d).x) / 2).attr('y', d => (S(d).y + T(d).y) / 2);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
      N.forEach(n => cache.set(n.id, { x: n.x, y: n.y }));
    }

    function fit() {
      if (!svg.node().isConnected) return;
      const xs = N.map(n => n.x), ys = N.map(n => n.y);
      if (xs.some(v => !isFinite(v)) || ys.some(v => !isFinite(v))) return;
      const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
      const scale = Math.min(2, 0.95 / Math.max((maxX - minX) / w, (maxY - minY) / hgt));
      const tx = w / 2 - scale * (minX + maxX) / 2, ty = hgt / 2 - scale * (minY + maxY) / 2;
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      if (eink) svg.call(zoom.transform, t); else svg.transition().duration(300).call(zoom.transform, t);
    }

    if (layout === 'force') {
      const warm = N.every(n => n.x != null && cache.has(n.id));
      const makeSim = () => d3.forceSimulation(N)
        .force('link', d3.forceLink(Ls).id(d => d.id).distance(160))
        .force('charge', d3.forceManyBody().strength(-700))
        .force('center', d3.forceCenter(w / 2, hgt / 2))
        .force('collide', d3.forceCollide(R + 30));
      if (eink) {
        // e-ink: settle the layout silently, then draw once
        const s = makeSim().stop();
        for (let i = 0; i < (warm ? 80 : 300); i++) s.tick();
        tick(); fit();
      } else {
        sim = makeSim().on('tick', tick).on('end', fit);
        if (warm) sim.alpha(0.25);
      }
    } else { tick(); fit(); }

    nodeSel.call(d3.drag()
      .on('start', (e, d) => { if (sim) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; if (!sim) { d.x = e.x; d.y = e.y; tick(); } })
      .on('end', (e, d) => { if (sim) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    return { fit };
  }

  // Simple layered ("hierarchy") layout: parents above children, barycentre ordering.
  function layered(N, Ls, w, h) {
    const ids = N.map(n => n.id);
    const depth = new Map(ids.map(id => [id, 0]));
    const dir = Ls.filter(l => l.directed).map(l => (l.topSide === 'to' ? { p: l.target, c: l.source } : { p: l.source, c: l.target }));
    for (let i = 0; i < ids.length; i++) {
      let changed = false;
      for (const { p, c } of dir) {
        const nd = depth.get(p) + 1;
        if (nd > depth.get(c) && nd < ids.length) { depth.set(c, nd); changed = true; }
      }
      if (!changed) break;
    }
    const parentsOf = new Map();
    dir.forEach(({ p, c }) => { if (!parentsOf.has(c)) parentsOf.set(c, []); parentsOf.get(c).push(p); });
    const rows = new Map();
    N.forEach(n => { const d = depth.get(n.id); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(n); });
    const depths = [...rows.keys()].sort((a, b) => a - b);
    const order = new Map();
    depths.forEach(d => rows.get(d).sort((a, b) => a.label.localeCompare(b.label)).forEach((n, i) => order.set(n.id, i)));
    const bary = n => {
      const ps = (parentsOf.get(n.id) || []).filter(p => depth.get(p) < depth.get(n.id));
      if (!ps.length) return order.get(n.id);
      return ps.reduce((s, p) => s + order.get(p), 0) / ps.length;
    };
    for (let sweep = 0; sweep < 3; sweep++) depths.forEach(d => {
      const row = rows.get(d);
      row.sort((a, b) => bary(a) - bary(b) || order.get(a.id) - order.get(b.id));
      row.forEach((n, i) => order.set(n.id, i));
    });
    const widest = Math.max(...depths.map(d => rows.get(d).length));
    const W = Math.max(w, widest * 130);
    depths.forEach(d => { const row = rows.get(d); row.forEach((n, i) => { n.x = (i + 1) * W / (row.length + 1); n.y = 90 + d * 140; }); });
  }

  function clearCache(key) { if (key) posCache.delete(key); else posCache.clear(); }

  return { render, clearCache };
})();
