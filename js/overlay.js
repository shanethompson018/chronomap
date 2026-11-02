/* Picture overlay: a picture from the image library (an old map, a scanned atlas page) laid over the map,
   georeferenced with 2-3 control points, plus two tools that draft outlines from the picture's own pixels:
   fill (click inside a tinted region → its outline) and trace (click a drawn line → follow it).
   Nothing is guessed: every outline comes from the pixels under your click, and it always opens in the edit
   mode so you correct it by hand before it reaches the editor. */
window.Overlay = (() => {
  const h = UI.h;
  let photoId = null, img = null, pixels = null, affine = null, layer = null, marks = null;
  let opacity = 0.6, points = [], panel = null, tolerance = 35, hidden = false;

  const map = () => MapView.leaflet();
  const isActive = () => !!(layer && img && !hidden);
  const uiPhoto = () => Store.photo(photoId);

  // ---------- affine maths: x = a·u + c·v + e, y = b·u + d·v + f (canvas setTransform order) ----------
  function apply(A, u, v) { return [A[0] * u + A[2] * v + A[4], A[1] * u + A[3] * v + A[5]]; }
  function invert(A) {
    const [a, b, c, d, e, f] = A, det = a * d - b * c;
    if (Math.abs(det) < 1e-12) return null;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
  }
  function solve3(M, r) {
    const A = M.map((row, i) => [...row, r[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      [A[i], A[p]] = [A[p], A[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let k = 0; k < 3; k++) { if (k === i) continue; const f = A[k][i] / A[i][i]; for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j]; }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  }
  // Fit picture pixels → world pixels (Leaflet's projection at zoom 0). Two points give scale, rotation and
  // shift (a similarity); three or more give a least-squares affine fit (stretch and skew as well).
  function fit(cps) {
    const P = cps.map(c => ({ u: c.u, v: c.v, p: map().project([c.lat, c.lng], 0) }));
    if (P.length < 2) return null;
    if (P.length === 2) {
      const [A, B] = P, du = B.u - A.u, dv = B.v - A.v, dx = B.p.x - A.p.x, dy = B.p.y - A.p.y;
      const den = du * du + dv * dv; if (den < 1e-9) return null;
      const a = (du * dx + dv * dy) / den, b = (du * dy - dv * dx) / den;
      return [a, b, -b, a, A.p.x - a * A.u + b * A.v, A.p.y - b * A.u - a * A.v];
    }
    let suu = 0, suv = 0, svv = 0, su = 0, sv = 0, sux = 0, svx = 0, sx = 0, suy = 0, svy = 0, sy = 0;
    for (const q of P) { suu += q.u * q.u; suv += q.u * q.v; svv += q.v * q.v; su += q.u; sv += q.v; sux += q.u * q.p.x; svx += q.v * q.p.x; sx += q.p.x; suy += q.u * q.p.y; svy += q.v * q.p.y; sy += q.p.y; }
    const M = [[suu, suv, su], [suv, svv, sv], [su, sv, P.length]];
    const X = solve3(M, [sux, svx, sx]), Y = solve3(M, [suy, svy, sy]);
    return X && Y ? [X[0], Y[0], X[1], Y[1], X[2], Y[2]] : null;
  }
  function residualPx() {
    if (!affine || points.length < 3) return null;
    const m = map(); let worst = 0;
    for (const c of points) { const p = m.latLngToContainerPoint(toLatLng(c.u, c.v)), q = m.latLngToContainerPoint([c.lat, c.lng]); worst = Math.max(worst, p.distanceTo(q)); }
    return worst;
  }
  // With no control points the picture is simply shown in the middle of the view, 60% of its width.
  // First placement: centred in the part of the map the panel does not cover, so the picture is in plain view.
  function defaultAffine() {
    const m = map(), size = m.getSize(), z = m.getZoom();
    const box = panel && panel.box && panel.box.isConnected ? panel.box.getBoundingClientRect() : null;
    const cont = m.getContainer().getBoundingClientRect();
    const freeW = box ? Math.max(size.x * 0.4, box.left - cont.left - 12) : size.x;
    const w = Math.min(freeW * 0.85, size.x * 0.6), s = Math.min(w / img.width, (size.y * 0.8) / img.height);
    const p0 = m.project(m.containerPointToLatLng([(freeW - img.width * s) / 2, (size.y - img.height * s) / 2]), 0);
    const k = s / m.getZoomScale(z, 0);
    return [k, 0, 0, k, p0.x, p0.y];
  }
  function refit() { affine = fit(points) || affine || defaultAffine(); if (layer) layer._draw(); drawMarks(); }
  function toLatLng(u, v) { const [x, y] = apply(affine, u, v); return map().unproject([x, y], 0); }
  function toImage(latlng) { const inv = invert(affine); if (!inv) return null; const p = map().project(latlng, 0); return apply(inv, p.x, p.y); }

  // ---------- the canvas layer ----------
  const Raster = L.Layer.extend({
    onAdd(m) {
      this._c = L.DomUtil.create('canvas', 'overlay-raster leaflet-zoom-hide');
      m.getPanes().overlayPane.appendChild(this._c);
      m.on('moveend zoomend resize viewreset', this._draw, this);
      this._draw();
    },
    onRemove(m) { L.DomUtil.remove(this._c); m.off('moveend zoomend resize viewreset', this._draw, this); },
    _draw() {
      const m = this._map; if (!m) return;
      const size = m.getSize(), c = this._c;
      c.width = size.x; c.height = size.y;
      L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
      if (!img || !affine || hidden) return;
      // unrounded container points (Leaflet's latLngToContainerPoint rounds to whole pixels, which would
      // collapse a sub-pixel step); the step is the whole picture width and height for the same reason
      const cp = (u, v) => m.layerPointToContainerPoint(m.project(toLatLng(u, v)).subtract(m.getPixelOrigin()));
      const o = cp(0, 0), x1 = cp(img.width, 0), y1 = cp(0, img.height);
      const ctx = c.getContext('2d');
      ctx.globalAlpha = opacity;
      ctx.setTransform((x1.x - o.x) / img.width, (x1.y - o.y) / img.width, (y1.x - o.x) / img.height, (y1.y - o.y) / img.height, o.x, o.y);
      ctx.drawImage(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  });
  function drawMarks() {
    if (marks) { map().removeLayer(marks); marks = null; }
    if (!points.length || hidden) return;
    marks = L.layerGroup().addTo(map());
    points.forEach((c, i) => {
      marks.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'vertex-num', html: `<span>${i + 1}</span>`, iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }));
      if (points.length >= 2) { const ll = toLatLng(c.u, c.v); marks.addLayer(L.polyline([[c.lat, c.lng], ll], { color: '#ffb84f', weight: 2, dashArray: '3 3', interactive: false })); }
    });
  }

  // ---------- choosing and loading the picture ----------
  async function load(id) {
    const p = Store.photo(id); if (!p) return;
    const blob = await Photos.getBlob(id);
    if (!blob) { UI.toast('That image has not been downloaded to this device yet (sync first)', 'error'); return; }
    img = await (window.createImageBitmap ? createImageBitmap(blob) : new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }));
    pixels = null; photoId = id; hidden = false;
    points = Array.isArray(p.georef) ? p.georef.map(c => ({ u: +c.u, v: +c.v, lat: +c.lat, lng: +c.lng })) : [];
    affine = null;
    if (!layer) layer = new Raster().addTo(map());
    refit();
    if (points.length >= 2) { const b = L.latLngBounds(points.map(c => [c.lat, c.lng])); if (!map().getBounds().intersects(b)) MapView.goToBounds(b.pad(0.5)); }
    renderPanel();
  }
  function remove() {
    if (layer) { map().removeLayer(layer); layer = null; }
    if (marks) { map().removeLayer(marks); marks = null; }
    img = null; pixels = null; photoId = null; affine = null; points = [];
    renderPanel();
  }
  function savePoints() { if (photoId) Store.updatePhoto(photoId, { georef: points.map(c => ({ u: +c.u.toFixed(1), v: +c.v.toFixed(1), lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) })) }); }

  // A control point is one spot clicked twice: first on the picture, then where it really is on the map.
  function addControlPoint() {
    if (!img) return;
    App.showTab('map');
    MapView.pickPoint(ll1 => {
      const uv = toImage(ll1);
      if (!uv || uv[0] < 0 || uv[1] < 0 || uv[0] > img.width || uv[1] > img.height) { UI.toast('That click was outside the picture', 'error'); return; }
      const keep = opacity; opacity = Math.min(opacity, 0.25); layer._draw();
      MapView.pickPoint(ll2 => {
        opacity = keep;
        points.push({ u: uv[0], v: uv[1], lat: ll2.lat, lng: ll2.lng });
        refit(); savePoints(); renderPanel();
        UI.toast(points.length < 2 ? 'One more control point and the picture will snap into place' : `${points.length} control points: picture fitted`);
      }, 'Now click the same spot on the real map underneath', () => { opacity = keep; layer._draw(); });
    }, 'Click a spot you can recognise on the picture (a city, a cape, a river mouth)');
  }

  // ---------- raster tools ----------
  async function getPixels() {
    if (pixels) return pixels;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    pixels = ctx.getImageData(0, 0, c.width, c.height);
    return pixels;
  }
  // Flood: every pixel reachable from (x, y) whose colour is within the tolerance of the clicked colour.
  function flood(px, x, y, tol) {
    const W = px.width, H = px.height, d = px.data;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const thr = (tol / 100) * 255, thr2 = thr * thr;
    const i0 = (y * W + x) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
    const mask = new Uint8Array(W * H);
    const stack = new Int32Array(W * H); let sp = 0, count = 0;
    stack[sp++] = y * W + x; mask[y * W + x] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, sx = x, sy = y;
    while (sp) {
      const i = stack[--sp], cx = i % W, cy = (i - cx) / W; count++;
      if (cy < sy || (cy === sy && cx < sx)) { sy = cy; sx = cx; }
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      const nb = [i - 1, i + 1, i - W, i + W];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || j >= W * H || mask[j]) continue;
        if ((k === 0 && cx === 0) || (k === 1 && cx === W - 1)) continue;
        const q = j * 4, dr = d[q] - r0, dg = d[q + 1] - g0, db = d[q + 2] - b0;
        if (dr * dr + dg * dg + db * db <= thr2) { mask[j] = 1; stack[sp++] = j; }
      }
    }
    return { mask, count, start: [sx, sy], bbox: [minX, minY, maxX, maxY] };
  }
  // Outer boundary of a mask (Moore neighbourhood tracing, clockwise, from the topmost-leftmost pixel).
  function boundary(mask, W, H, start, count) {
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
    const out = []; let [x, y] = start, d = 0, iter = 0; const maxIter = 4 * count + 8;
    for (;;) {
      out.push([x + 0.5, y + 0.5]);
      let found = -1;
      for (let k = 0; k < 8; k++) { const nd = (d + 5 + k) % 8; if (inside(x + dirs[nd][0], y + dirs[nd][1])) { found = nd; break; } }
      if (found < 0) break;
      x += dirs[found][0]; y += dirs[found][1]; d = found;
      if ((x === start[0] && y === start[1]) || ++iter > maxIter) break;
    }
    return out;
  }
  // Ramer-Douglas-Peucker in pixel space.
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], L2 = (bx - ax) ** 2 + (by - ay) ** 2;
      let best = -1, bestD = eps;
      for (let i = a + 1; i < b; i++) {
        let dist;
        if (L2 < 1e-9) dist = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        else { const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * (bx - ax) + (pts[i][1] - ay) * (by - ay)) / L2)); dist = Math.hypot(pts[i][0] - (ax + t * (bx - ax)), pts[i][1] - (ay + t * (by - ay))); }
        if (dist > bestD) { bestD = dist; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  // Zhang-Suen thinning: a blob of line pixels becomes a one-pixel-wide skeleton.
  function thin(mask, W, H) {
    const del = []; let changed = true;
    while (changed) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        del.length = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x; if (!mask[i]) continue;
          const p2 = mask[i - W], p3 = mask[i - W + 1], p4 = mask[i + 1], p5 = mask[i + W + 1], p6 = mask[i + W], p7 = mask[i + W - 1], p8 = mask[i - 1], p9 = mask[i - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
          const s = [p2, p3, p4, p5, p6, p7, p8, p9, p2]; let A = 0;
          for (let k = 0; k < 8; k++) if (!s[k] && s[k + 1]) A++;
          if (A !== 1) continue;
          if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(i);
        }
        if (del.length) { changed = true; for (const i of del) mask[i] = 0; }
      }
    }
  }
  // Walk a skeleton from the pixel nearest the click, both ways, preferring to keep going straight at forks.
  function walk(mask, W, H, sx, sy) {
    let start = null, bestD = 400;
    for (let y = Math.max(0, sy - 20); y < Math.min(H, sy + 21); y++) for (let x = Math.max(0, sx - 20); x < Math.min(W, sx + 21); x++) {
      if (!mask[y * W + x]) continue; const d2 = (x - sx) ** 2 + (y - sy) ** 2; if (d2 < bestD) { bestD = d2; start = [x, y]; }
    }
    if (!start) return null;
    const visited = new Uint8Array(W * H);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    function run() {
      const path = []; let [x, y] = start, px = null, py = null;
      for (;;) {
        visited[y * W + x] = 1; path.push([x + 0.5, y + 0.5]);
        let best = null, bestScore = -Infinity;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx] || visited[ny * W + nx]) continue;
          const score = px == null ? -(dx * dx + dy * dy) : dx * (x - px) + dy * (y - py);
          if (score > bestScore) { bestScore = score; best = [nx, ny]; }
        }
        if (!best || path.length > 500000) break;
        px = x; py = y; x = best[0]; y = best[1];
      }
      return path;
    }
    const a = run();
    visited[start[1] * W + start[0]] = 0;
    const b = run();
    const path = b.slice(1).reverse().concat(a);
    const closed = path.length > 20 && Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) <= 3;
    return { path, closed };
  }

  function toCoords(pxPts) { return pxPts.map(p => { const l = toLatLng(p[0], p[1]); return [+l.lat.toFixed(5), +l.lng.toFixed(5)]; }); }

  // Fill: click inside a tinted region of the picture → its outline, opened in the edit mode.
  function fill(cb) {
    if (!isActive()) { UI.toast('Choose a picture overlay first (Overlay button in the Map sidebar)', 'error'); return; }
    App.showTab('map');
    MapView.pickPoint(async ll => {
      const uv = toImage(ll); if (!uv) return;
      const px = await getPixels();
      const res = flood(px, Math.round(uv[0]), Math.round(uv[1]), tolerance);
      if (!res) { UI.toast('Click inside the picture', 'error'); return; }
      if (res.count > 0.5 * px.width * px.height) { UI.toast('That selects most of the picture: lower the tolerance, or click inside a tinted region', 'error'); return; }
      if (res.count < 30) { UI.toast('Only a few pixels match there: raise the tolerance a little', 'error'); return; }
      const contour = rdp(boundary(res.mask, px.width, px.height, res.start, res.count), 1.2);
      if (contour.length < 3) { UI.toast('No region found there', 'error'); return; }
      MapView.editShape('area', toCoords(contour), cb, { text: `Filled from the picture (${contour.length} corners): drag what is off, delete strays, Simplify, then Done` });
    }, 'Click inside the region on the picture');
  }
  // Trace: click a drawn line on the picture → follow it as far as its colour continues.
  function trace(cb) {
    if (!isActive()) { UI.toast('Choose a picture overlay first (Overlay button in the Map sidebar)', 'error'); return; }
    App.showTab('map');
    MapView.pickPoint(async ll => {
      const uv = toImage(ll); if (!uv) return;
      const px = await getPixels();
      const res = flood(px, Math.round(uv[0]), Math.round(uv[1]), tolerance);
      if (!res) { UI.toast('Click on the picture', 'error'); return; }
      if (res.count > 0.3 * px.width * px.height) { UI.toast('That selects most of the picture: lower the tolerance, or click exactly on the line', 'error'); return; }
      if (res.count < 10) { UI.toast('Only a few pixels match there: raise the tolerance a little, or click exactly on the line', 'error'); return; }
      // thin the selected pixels inside their bounding box (with a one-pixel margin), then walk the skeleton
      const [x0, y0, x1, y1] = res.bbox, W = x1 - x0 + 3, H = y1 - y0 + 3;
      const sub = new Uint8Array(W * H);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (res.mask[y * px.width + x]) sub[(y - y0 + 1) * W + (x - x0 + 1)] = 1;
      thin(sub, W, H);
      const w = walk(sub, W, H, Math.round(uv[0]) - x0 + 1, Math.round(uv[1]) - y0 + 1);
      if (!w || w.path.length < 2) { UI.toast('Could not follow a line there', 'error'); return; }
      const pts = rdp(w.path.map(p => [p[0] + x0 - 1, p[1] + y0 - 1]), 1.5);
      const kind = w.closed ? 'area' : 'path';
      if (w.closed) pts.pop();
      MapView.editShape(kind, toCoords(pts), (coords, rough) => cb(coords, rough, kind), { text: `Traced from the picture (${pts.length} corners${w.closed ? ', closed' : ''}): drag what is off, delete strays, Simplify, then Done` });
    }, 'Click on the line you want to follow');
  }
  function defaultCategory(kind) { return Store.categories().find(c => (c.defaultKind || 'pin') === kind)?.id || Store.categories()[0]?.id || null; }
  function newMarkerFrom(coords, rough, kind) {
    const t = MapView.time();
    Editor.openNew({ name: kind === 'area' ? 'New area' : 'New route', kind, categoryId: defaultCategory(kind),
      facts: [{ typeId: kind === 'area' ? 'ft_border' : 'ft_located', date: t != null ? Dates.iso(t) : '', where: { kind: kind === 'area' ? 'area' : 'route', coords, rough: kind === 'area' ? rough : [] } }] });
  }

  // ---------- the panel ----------
  function open() {
    if (panel) { panel.close(); return; }
    const body = h('div', { class: 'overlay-panel' });
    panel = UI.modal({ title: 'Picture overlay', body, width: '380px', side: true, onClose: () => { panel = null; } });
    panel.body = body;
    // the title folds the panel down to its bar, so the map underneath can be seen on a small screen
    const head = panel.box.querySelector('.modal-head h2'); head.title = 'Fold the panel away / open it again';
    head.addEventListener('click', () => panel.box.classList.toggle('collapsed'));
    renderPanel();
  }
  function renderPanel() {
    if (!panel || !panel.body) return;
    const body = panel.body; body.innerHTML = '';
    const p = uiPhoto();
    const choose = async () => { const [pid] = await Photos.pick(); if (pid) { try { await load(pid); } catch (e) { UI.toast('Could not load that image: ' + e.message, 'error'); } } };
    body.append(h('p', { class: 'hint' }, 'Lay a picture of a map over the real map, line it up with two or three known spots, then draft borders straight from the picture. Nothing is guessed: outlines come from the pixels you click, and you correct them by hand.'));
    body.append(h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } },
      p ? Photos.thumbEl(p, 48) : null,
      h('span', { style: { flex: '1' } }, p ? (p.title || 'Untitled image') : h('span', { class: 'muted' }, 'No picture chosen')),
      h('button', { class: 'small', onclick: choose }, p ? 'Change…' : 'Choose picture…'),
      p ? h('button', { class: 'small', title: 'Take the picture off the map', onclick: remove }, '✕') : null));
    if (!p) { body.append(h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Upload the source\'s map into the image library first (Library tab → Images), or choose it here and upload on the spot.')); return; }
    const op = h('input', { type: 'range', min: 10, max: 100, value: Math.round(opacity * 100), style: { flex: '1' } });
    op.addEventListener('input', () => { opacity = +op.value / 100; if (layer) layer._draw(); });
    const hideBtn = h('button', { class: 'small', onclick: () => { hidden = !hidden; if (layer) layer._draw(); drawMarks(); renderPanel(); } }, hidden ? 'Show' : 'Hide');
    body.append(h('div', { class: 'row', style: { alignItems: 'center', gap: '8px', marginTop: '8px' } }, h('span', { class: 'muted', style: { fontSize: '12px' } }, 'See-through'), op, hideBtn));
    // control points
    body.append(h('h4', { style: { margin: '12px 0 4px' } }, `Control points (${points.length})`));
    const res = residualPx();
    body.append(h('p', { class: 'muted', style: { fontSize: '12px' } },
      points.length === 0 ? 'The picture is only placed in view. Add two control points to fit it (scale, rotation, position); a third also fits stretch and skew.'
      : points.length === 1 ? 'One more control point and the picture snaps into place.'
      : points.length === 2 ? 'Fitted by scale, rotation and position. A third point also corrects stretch and skew.'
      : `Affine fit from ${points.length} points; worst mismatch ${res == null ? '?' : res.toFixed(0)} px at this zoom. Dashed lines on the map join each picture spot to its map spot.`));
    const list = h('div');
    points.forEach((c, i) => list.append(h('div', { class: 'row', style: { fontSize: '12px', alignItems: 'center' } },
      h('span', { class: 'vertex-num', style: { position: 'static' } }, h('span', {}, String(i + 1))),
      h('span', { class: 'muted', style: { flex: '1' } }, `picture ${c.u.toFixed(0)}, ${c.v.toFixed(0)} → map ${(+c.lat).toFixed(3)}, ${(+c.lng).toFixed(3)}`),
      h('button', { class: 'small', title: 'Remove this control point', onclick: () => { points.splice(i, 1); refit(); savePoints(); renderPanel(); } }, '✕'))));
    body.append(list);
    body.append(h('div', { class: 'row', style: { marginTop: '6px' } },
      h('button', { class: 'small', onclick: addControlPoint }, '+ Add control point'),
      points.length ? h('button', { class: 'small', onclick: () => { if (confirm('Remove all control points?')) { points = []; affine = null; refit(); savePoints(); renderPanel(); } } }, 'Clear') : null));
    // tools
    body.append(h('h4', { style: { margin: '14px 0 4px' } }, 'Draft outlines from the picture'));
    const tol = h('input', { type: 'range', min: 5, max: 90, value: tolerance, style: { flex: '1' } });
    const tolLbl = h('span', { class: 'muted', style: { fontSize: '12px', minWidth: '28px' } }, String(tolerance));
    tol.addEventListener('input', () => { tolerance = +tol.value; tolLbl.textContent = String(tolerance); });
    body.append(h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } }, h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Colour tolerance'), tol, tolLbl));
    body.append(h('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap' } },
      h('button', { class: 'small', title: 'Click inside a tinted region of the picture; its outline becomes a new area marker', onclick: () => fill((coords, rough) => newMarkerFrom(coords, rough, 'area')) }, '⬚ Fill region → new area'),
      h('button', { class: 'small', title: 'Click a drawn line on the picture; the app follows it as far as its colour continues', onclick: () => trace((coords, rough, kind) => newMarkerFrom(coords, rough, kind)) }, '〰 Trace line → new route / area')));
    body.append(h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'To fill or trace into an existing marker, open it and use the same buttons beside its fact\'s "where". Low tolerance keeps to one tint; raise it if the fill stops short, lower it if it floods the whole page.'));
  }

  return { open, isActive, fill, trace, load, remove, toLatLng, toImage, photoId: () => photoId };
})();
