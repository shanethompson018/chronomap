/* Gantt tab: the chosen markers as bars over one time axis, the way Primavera P6 draws activities.
 *
 * Each marker is a block: its lifetime as the heading bar, then a row for every place it is ("Where and when"),
 * every dated fact (its own, and those other markers hold about it) and every tie to another marker.
 * A date is drawn as the earliest and the latest it can be, never as a middle: a bar is hatched from the earliest
 * it can begin to the latest it can end, and solid where it is certain (latest begin to earliest end). A single
 * date that is certain is a diamond; one with a range is a hatched bar. Time gaps and limits are relationship
 * lines between the two dates they join (solid = time gap, dashed = limit), drawn when both are on the chart.
 * Nothing zooms: the span shown is changed with the buttons above the chart.
 * Nothing here is stored except the choice of markers, ticks and span, which is kept on this device.
 */
window.Gantt = (() => {
  const $ = id => document.getElementById(id);
  const h = UI.h;
  const KEY = 'chronomap.gantt';
  const pref = Object.assign({ ids: [], where: true, facts: true, mirrors: true, ties: true, gaps: true, t0: null, t1: null }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
  if (!Array.isArray(pref.ids)) pref.ids = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
  const TICKS = ['where', 'facts', 'mirrors', 'ties', 'gaps'];
  let picker, selectedId = null, pickedKey = null, rows = [], view = null;

  function init() {
    // pref.ids is handed to the picker as its exclude list, so it is only ever changed in place
    picker = UI.markerSelect({ placeholder: 'Add a marker…', exclude: pref.ids, onChange: v => { if (v) add(v); picker.setValue(null); } });
    $('gt-add').append(picker);
    TICKS.forEach(k => { const el = $('gt-' + k); el.checked = pref[k] !== false; el.addEventListener('change', () => { pref[k] = el.checked; save(); draw(); }); });
    $('gt-clear').onclick = () => { pref.ids.length = 0; selectedId = null; pickedKey = null; save(); draw(); };
    $('gt-info-close').onclick = () => { selectedId = null; drawInfo(); };
    $('gt-fit').onclick = () => setView(null);
    $('gt-earlier').onclick = () => shift(-0.25);
    $('gt-later').onclick = () => shift(0.25);
    $('gt-wider').onclick = () => scale(1.6);
    $('gt-closer').onclick = () => scale(1 / 1.6);
    $('gt-body').addEventListener('wheel', onWheel, { passive: false });
    Store.subscribe(() => { if (App.currentTab() === 'gantt') draw(); });
  }
  function show() { draw(); }
  function add(id) {
    if (!Store.marker(id)) return;
    if (!pref.ids.includes(id)) { pref.ids.push(id); pref.t0 = pref.t1 = null; save(); } // a new marker: back to the whole span, so it is in sight
    draw();
  }
  function remove(id) { const i = pref.ids.indexOf(id); if (i >= 0) pref.ids.splice(i, 1); save(); draw(); }
  function move(id, by) {
    const i = pref.ids.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= pref.ids.length) return;
    pref.ids.splice(j, 0, pref.ids.splice(i, 1)[0]);
    save(); draw();
  }
  function select(id) { selectedId = id; drawInfo(); }

  // ---------- the span shown (its own buttons: nothing on this tab zooms) ----------
  function setView(v) { pref.t0 = v ? Math.round(v[0]) : null; pref.t1 = v ? Math.round(v[1]) : null; save(); draw(); }
  function shift(by) { if (!view) return; const w = view[1] - view[0]; setView([view[0] + w * by, view[1] + w * by]); }
  function scale(k) { if (!view) return; const mid = (view[0] + view[1]) / 2, half = Math.min(Math.max((view[1] - view[0]) * k / 2, 15), 3652425); setView([mid - half, mid + half]); }

  // The mouse wheel (25.2). Turned on the strip of dates, or with Shift held anywhere on the chart, it moves to
  // earlier and later dates; with Ctrl held it shows a wider or a closer span, keeping the date under the pointer
  // where it is. A plain turn over the rows still scrolls them. One notch is a tenth of the span, or about a sixth
  // wider or closer. The chart is drawn again shortly after, not on every event, and the span is saved when it rests.
  let wheelDraw = 0, wheelSave = 0;
  function onWheel(e) {
    const across = Math.abs(e.deltaX) > Math.abs(e.deltaY); // Shift + wheel arrives as a sideways turn in Chrome
    if (!view || !(e.ctrlKey || e.shiftKey || across || e.target.closest('.gt-axis'))) return;
    e.preventDefault();
    const d = (across ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1), w = view[1] - view[0];
    if (e.ctrlKey) {
      const tr = $('gt-body').querySelector('.gt-axis .gt-track'), box = tr && tr.getBoundingClientRect();
      const f = box && box.width ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0.5;
      const nw = Math.min(Math.max(w * Math.exp(d * 0.0015), 30), 7304850), at = view[0] + w * f;
      view = [at - nw * f, at + nw * (1 - f)];
    } else view = [view[0] + w * d / 1000, view[1] + w * d / 1000];
    pref.t0 = Math.round(view[0]); pref.t1 = Math.round(view[1]);
    if (!wheelDraw) wheelDraw = setTimeout(() => { wheelDraw = 0; draw(); }, 16);
    clearTimeout(wheelSave); wheelSave = setTimeout(save, 400);
  }

  // ---------- the rows ----------
  const D = s => (s ? Dates.toDays(s) : null);
  const low = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  // One date as the chart sees it: the earliest (E) and the latest (L) day it can be; the same day when certain.
  function pt(date, min, max) {
    let a = D(min || date), b = D(max || date);
    if (a == null) a = b; if (b == null) b = a;
    return a == null ? null : { E: Math.min(a, b), L: Math.max(a, b) };
  }
  // A fact's date straight from Facts.when: a window with one end only stays open at the other.
  const slot = (known, date, min, max, lo, hi) => (known ? pt(date, min, max) : (lo || hi) ? { E: lo ? D(lo) : -Infinity, L: hi ? D(hi) : Infinity } : null);
  // Places, lifetimes and ties carry a window as words only ("after X", "before Y"): open the end that has none.
  function open(p, known, said) {
    if (p && known === false && p.E === p.L) { if (/^after /.test(said || '')) p.L = Infinity; else if (/^before /.test(said || '')) p.E = -Infinity; }
    return p;
  }
  const said = (date, min, max, known, when) => (!date ? '' : known === false && when ? when : Dates.formatRange(date, min, max));
  const firstDay = r => { const v = [r.s && r.s.E, r.s && r.s.L, r.e && r.e.E, r.e && r.e.L].filter(x => x != null && isFinite(x)); return v.length ? Math.min(...v) : Infinity; };

  function rowsOf(m) {
    const out = [], col = Store.displayColor(m), on = new Set(pref.ids);
    const push = r => { out.push(Object.assign({ m, col, s: null, e: null, span: false, sub: '' }, r)); };
    // the heading row: the lifetime, Begins to Ends
    push({ kind: 'm', key: 'm|' + m.id, label: Store.displayName(m), span: true,
      sub: [m.start ? `${m.startLabel || 'Begins'} ${said(m.start, m.startMin, m.startMax, m.startKnown, m.startWhen)}` : '', m.end ? `${m.endLabel || 'Ends'} ${said(m.end, m.endMin, m.endMax, m.endKnown, m.endWhen)}` : ''].filter(Boolean).join(' · '),
      s: open(pt(m.start, m.startMin, m.startMax), m.startKnown, m.startWhen), e: open(pt(m.end, m.endMin, m.endMax), m.endKnown, m.endWhen) });

    if (pref.where) {
      const ws = UI.whereRows(m);
      if (ws.length) push({ kind: 'g', key: 'g|w|' + m.id, label: 'Where and when' });
      ws.forEach((r, i) => {
        const mv = r.mv, at = mv.atMarkerId && Store.marker(mv.atMarkerId);
        const place = at ? Store.displayName(at) : mv.coords && mv.coords.length ? 'On the way' + (mv.label ? ` (${mv.label})` : '') : (mv.label || `${(+mv.lat).toFixed(2)}, ${(+mv.lng).toFixed(2)}`);
        if (r.ends) push({ kind: 'w', key: `w|${m.id}|${i}`, label: place, sub: `${low(mv.factLabel || 'ended')} here${mv.when ? ' · ' + mv.when : ''}`, s: open(pt(mv.date, mv.dateMin, mv.dateMax), mv.dateKnown, mv.when) });
        else push({ kind: 'w', key: `w|${m.id}|${i}`, label: place, span: true,
          sub: [r.fromStart ? 'from the beginning' : 'from ' + r.startSaid, r.end ? 'until ' + r.endSaid : '', r.len].filter(Boolean).join(' · '),
          s: open(pt(r.start, r.startMin, r.startMax), r.startKnown, r.startSaid), e: open(pt(r.end, r.endMin, r.endMax), r.endKnown, r.endSaid) });
      });
    }

    const fs = [];
    if (pref.facts) for (const f of m.facts || []) {
      const t = Store.factType(f.typeId); if (!t || t.hasDate === false) continue;
      const w = Facts.when(f), ref = { kind: 'marker', id: m.id, slot: 'fact:' + f.id };
      fs.push({ kind: 'f', key: `f|${m.id}|${f.id}`, label: Store.factTitle(f), subHTML: UI.factWhenHTML(m, f), span: !!t.hasEnd,
        s: slot(w.known, w.date, w.min, w.max, w.lo, w.hi), e: t.hasEnd ? slot(w.knownEnd, w.dateEnd, w.endMin, w.endMax, w.loEnd, w.hiEnd) : null,
        slotS: Store.refKey(ref), slotE: t.hasEnd ? Store.refKey(ref) + ':end' : null });
    }
    // facts other markers hold about this one; a marker that is on the chart itself shows its own
    if (pref.mirrors) (m.mirrors || []).forEach((mi, i) => {
      const o = Store.marker(mi.markerId); if (!o || on.has(o.id)) return;
      fs.push({ kind: 'x', key: `x|${m.id}|${i}`, label: `${mi.factTitle} · ${mi.word}: ${Store.displayName(o)}`, sub: mi.when || '', span: !!mi.dateEnd,
        s: mi.date ? open(pt(mi.date, mi.dateMin, mi.dateMax), mi.known, mi.when) : null, e: mi.dateEnd ? pt(mi.dateEnd, mi.dateEndMin, mi.dateEndMax) : null });
    });
    fs.forEach((r, i) => { r.order = i; });
    fs.sort((a, b) => (firstDay(a) - firstDay(b)) || (a.order - b.order));
    if (fs.length) push({ kind: 'g', key: 'g|f|' + m.id, label: 'Facts' });
    fs.forEach(push);

    if (pref.ties) {
      const ls = Store.linksOf(m.id).filter(l => Store.marker(l.fromId === m.id ? l.toId : l.fromId));
      if (ls.length) push({ kind: 'g', key: 'g|t|' + m.id, label: 'Ties' });
      ls.forEach(l => {
        const isFrom = l.fromId === m.id, other = Store.marker(isFrom ? l.toId : l.fromId), type = Store.linkType(l.typeId);
        // worded as in a marker's information: "Parent of ← Terah (parent)"; derived sibling ties carry brother / sister words
        const word = isFrom ? l.toRole : l.fromRole, role = word || !type ? '' : (isFrom ? type.toLabel : type.fromLabel);
        const name = (word ? word.charAt(0).toUpperCase() + word.slice(1) : type ? type.name : 'Tie') + (type && type.directed ? (isFrom ? ' → ' : ' ← ') : ' ') + Store.displayName(other) + (role ? ` (${role})` : '');
        push({ kind: 't', key: `t|${m.id}|${l.id}`, label: name, span: true,
          sub: l.start || l.end ? `${l.startWhen || Dates.formatInput(l.start)}${l.end ? ' – ' + (l.endWhen || Dates.formatInput(l.end)) : ' →'}` : '',
          s: open(pt(l.start, l.startMin, l.startMax), l.startKnown, l.startWhen), e: open(pt(l.end, l.endMin, l.endMax), l.endKnown, l.endWhen) });
      });
    }
    return out;
  }

  // ---------- drawing ----------
  let T0 = 0, T1 = 1, drawnH = 0, watch = null;
  const pct = d => (d === -Infinity ? -3 : d === Infinity ? 103 : Math.max(-3, Math.min(103, (d - T0) / (T1 - T0) * 100)));
  const box = (cls, a, b) => { const x = pct(a); return h('div', { class: 'gt-box ' + cls, style: { left: x + '%', width: Math.max(0, pct(b) - x) + '%' } }); };
  const dot = d => (d < T0 || d > T1 ? null : h('div', { class: 'gt-dot', style: { left: pct(d) + '%' } }));
  // The marks of one row. Hatched: all the time it can cover. Solid: the time it surely covers.
  function marks(r) {
    const s = r.s, e = r.e;
    if (!s && !e) return [];
    if (!(r.span && s && e)) { const p = s || e; return [p.E === p.L ? dot(p.E) : box('maybe', p.E, p.L)]; }
    if (e.L < s.E) return [box('bad', e.L, s.E)]; // it ends before it begins: drawn as what it is
    if (s.E === s.L && e.E === e.L) return [s.E === e.E ? dot(s.E) : box('sure', s.E, e.E)];
    const out = [box('maybe', s.E, e.L)];
    if (e.E > s.L) out.push(box('sure', s.L, e.E));
    return out;
  }
  // year lines: the widest round step that leaves about seven on the axis
  function ticks() {
    const years = (T1 - T0) / 365.2425, step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => years / s <= 7) || 10000;
    const out = [], y0 = Dates.civilFromDays(Math.floor(T0)).y, y1 = Dates.civilFromDays(Math.ceil(T1)).y;
    for (let y = y0; y <= y1 + 1; y++) {
      if ((y <= 0 ? 1 - y : y) % step) continue;
      const d = Dates.daysFromCivil(y, 1, 1);
      if (d >= T0 && d <= T1) out.push({ x: pct(d), label: Dates.yearLabel(y) });
    }
    return out;
  }
  const lenText = r => { const o = { years: +r.years || 0, months: +r.months || 0, days: +r.days || 0 }; return o.years || o.months || o.days ? Dates.formatOffset(o) : ''; };

  function drawChosen() {
    const boxEl = $('gt-chosen'); boxEl.innerHTML = '';
    if (!pref.ids.length) boxEl.append(h('div', { class: 'muted', style: { fontSize: 'calc(12px * var(--fs))' } }, 'None yet.'));
    pref.ids.forEach((id, i) => {
      const m = Store.marker(id);
      boxEl.append(h('div', { class: 'tl-row' },
        h('div', { class: 'tl-row-name', title: 'Show this marker\'s information', onclick: () => select(id) },
          h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)), h('span', { class: 'name' }, Store.displayName(m))),
        pref.ids.length > 1 ? h('button', { class: 'small', title: 'Move up', disabled: i === 0, onclick: () => move(id, -1) }, '↑') : null,
        pref.ids.length > 1 ? h('button', { class: 'small', title: 'Move down', disabled: i === pref.ids.length - 1, onclick: () => move(id, 1) }, '↓') : null,
        h('button', { class: 'small', title: 'Take this marker off the chart', onclick: () => remove(id) }, '✕')));
    });
    $('gt-clear').classList.toggle('hidden', pref.ids.length < 2);
  }

  function draw() {
    for (let i = pref.ids.length - 1; i >= 0; i--) if (!Store.marker(pref.ids[i])) pref.ids.splice(i, 1); // deleted markers drop off
    const host = $('gt-body'), keep = host.scrollTop;
    drawChosen();
    host.innerHTML = '';
    const ms = pref.ids.map(id => Store.marker(id));
    rows = ms.flatMap(rowsOf);
    const tools = ['gt-fit', 'gt-earlier', 'gt-later', 'gt-wider', 'gt-closer'];
    // the whole span: every day on the chart, with a little room at each side
    const days = rows.flatMap(r => [r.s && r.s.E, r.s && r.s.L, r.e && r.e.E, r.e && r.e.L]).filter(x => x != null && isFinite(x));
    let fit = null;
    if (days.length) { const a = Math.min(...days), b = Math.max(...days), pad = Math.max((b - a) * 0.04, b === a ? 365 : 20); fit = [a - pad, b + pad]; }
    view = pref.t0 != null && pref.t1 != null && pref.t1 > pref.t0 ? [pref.t0, pref.t1] : fit;
    tools.forEach(id => { $(id).disabled = !view; });
    $('gt-span').textContent = view ? `${Dates.format(view[0])} to ${Dates.format(view[1])}` : '';
    const bars = rows.filter(r => r.kind !== 'g' && r.kind !== 'm');
    $('gt-stats').textContent = ms.length ? `${bars.length} row${bars.length === 1 ? '' : 's'}` + (bars.filter(r => !r.s && !r.e).length ? ` · ${bars.filter(r => !r.s && !r.e).length} without a date` : '') : '';
    if (!ms.length) {
      host.append(h('div', { class: 'tl-empty' }, Store.markers().length ? 'Add a marker in the left panel (☰ brings the panel back if it is folded away), or press 📊 Gantt in a marker\'s information.' : 'No markers yet.'));
      drawDetail(); drawInfo(); return;
    }
    if (!view) { host.append(h('div', { class: 'tl-empty' }, 'Nothing on the chart has a date yet.')); drawDetail(); drawInfo(); return; }
    [T0, T1] = view;

    const tk = ticks();
    host.append(h('div', { class: 'gt-axis' }, h('div', { class: 'gt-label' }), h('div', { class: 'gt-track' }, ...tk.map(t => h('div', { class: 'gt-tick', style: { left: t.x + '%' } }, t.label)))));
    const wrap = h('div', { class: 'gt-rows' });
    const els = rows.map(r => {
      const name = r.kind === 'm' ? h('div', { class: 'gt-name' }, h('span', { class: 'swatch sm', style: { background: r.col } }, Store.displayIcon(r.m)), h('span', {}, r.label)) : h('div', { class: 'gt-name' }, r.label);
      const sub = r.kind === 'g' ? null : h('div', { class: 'gt-sub muted', html: r.subHTML != null ? r.subHTML : UI.esc(r.sub) });
      if (sub && !sub.textContent) sub.textContent = r.kind === 'm' ? '' : 'no date';
      const el = h('div', { class: `gt-row k-${r.kind}` + (r.key === pickedKey ? ' picked' : ''), 'data-key': r.key, onclick: r.kind === 'g' ? null : () => { pickedKey = r.key; wrap.querySelectorAll('.gt-row.picked').forEach(x => x.classList.remove('picked')); el.classList.add('picked'); drawDetail(); } },
        h('div', { class: 'gt-label', title: r.kind === 'g' ? null : `${r.label}${sub && sub.textContent ? ' · ' + sub.textContent : ''}` }, name, sub),
        h('div', { class: 'gt-track' }, ...(r.kind === 'g' ? [] : marks(r))));
      el.style.setProperty('--c', r.col);
      wrap.append(el);
      return el;
    });
    const over = h('div', { class: 'gt-over' }, ...tk.map(t => h('div', { class: 'gt-grid', style: { left: t.x + '%' } })));
    wrap.append(over);
    host.append(wrap);
    if (pref.gaps) drawLinks(over, els);
    // the lines are placed by the rows' heights: when those change (the A− / A+ size, a turned screen) draw again
    drawnH = wrap.offsetHeight;
    if (window.ResizeObserver) { if (!watch) watch = new ResizeObserver(() => { const w = $('gt-body').querySelector('.gt-rows'); if (w && w.offsetHeight !== drawnH && App.currentTab() === 'gantt') draw(); }); watch.disconnect(); watch.observe(wrap); }
    host.scrollTop = keep;
    drawDetail(); drawInfo();
  }

  // Time gaps and limits as relationship lines: from the date a tie starts from, down or up to the row of the date
  // it sets, then along to that date, ending in an arrowhead. Where the dates have ranges, a "not after" limit joins
  // the latest of the two and every other tie the earliest: the way the late and the early dates are worked out.
  function drawLinks(over, els) {
    const at = new Map();
    rows.forEach((r, i) => {
      if (r.slotS && r.s) at.set(r.slotS, { i, E: r.s.E, L: r.s.L });
      if (r.slotE && r.e) at.set(r.slotE, { i, E: r.e.E, L: r.e.L });
    });
    const seen = new Set();
    for (const id of pref.ids) for (const r of Store.relationsFor(id)) {
      if (seen.has(r.id) || r.status !== 'active') continue;
      seen.add(r.id);
      const a = at.get(Store.refKey(r.from)), b = at.get(Store.refKey(r.to)), side = r.part === 'max' ? 'L' : 'E';
      if (!a || !b || a.i === b.i || !isFinite(a[side]) || !isFinite(b[side])) continue;
      const limit = r.part === 'min' || r.part === 'max', cls = limit ? ' lim' : ' gap';
      const xa = pct(a[side]), xb = pct(b[side]), mid = el => el.offsetTop + el.offsetHeight / 2, ya = mid(els[a.i]), yb = mid(els[b.i]);
      over.append(h('div', { class: 'gt-ln v' + cls, style: { left: xa + '%', top: Math.min(ya, yb) + 'px', height: Math.abs(yb - ya) + 'px' } }));
      if (xa !== xb) over.append(h('div', { class: 'gt-ln hz' + cls, style: { left: Math.min(xa, xb) + '%', width: Math.abs(xb - xa) + '%', top: yb + 'px' } }));
      over.append(h('div', { class: 'gt-head ' + (xb > xa ? 'r' : xb < xa ? 'l' : yb > ya ? 'd' : 'u'), style: { left: xb + '%', top: yb + 'px' } }));
      const text = limit ? (r.part === 'min' ? 'not before' : 'not after') + (lenText(r) ? ' ' + lenText(r) : '') : (lenText(r) || '=');
      over.append(h('div', { class: 'gt-lag', style: { left: xa + '%', top: (ya + yb) / 2 + 'px' } }, text));
    }
  }

  // The row that was tapped, written out in full above the chart; until then, what the marks mean.
  function drawDetail() {
    const el = $('gt-detail'); el.innerHTML = '';
    const r = rows.find(x => x.key === pickedKey);
    if (!r) {
      const key = (cls, text) => h('span', {}, h('span', { class: 'gt-key' }, h('span', { class: cls })), text);
      el.append(h('div', { class: 'gt-legend' },
        key('gt-box maybe', 'can be (earliest to latest)'), key('gt-box sure', 'certain'), key('gt-dot', 'one date'),
        key('gt-ln hz gap', 'time gap'), key('gt-ln hz lim', 'limit'), h('span', {}, 'Tap a row to read it in full.'),
        h('span', { class: 'gt-wheel' }, 'Mouse wheel on the strip of dates, or Shift + wheel: earlier and later. Ctrl + wheel: wider and closer.')));
      return;
    }
    const sub = r.subHTML != null ? r.subHTML : UI.esc(r.sub);
    el.append(h('div', {}, h('strong', {}, r.kind === 'm' ? r.label : `${Store.displayName(r.m)} · ${r.label}`), h('span', { html: sub ? ' · ' + sub : (r.kind === 'm' ? '' : ' · no date') }),
      ' ', h('button', { class: 'small', onclick: () => select(r.m.id) }, 'Information'), ' ', h('button', { class: 'small', onclick: () => Editor.open(r.m.id) }, 'Edit marker')));
    const rels = [r.slotS, r.slotE].filter(Boolean).flatMap(k => Store.relationsOfRef(Store.parseRefKey(k))).filter((x, i, all) => x.status === 'active' && all.indexOf(x) === i && Store.refExists(x.from) && Store.refExists(x.to));
    if (rels.length) el.append(h('ul', {}, ...rels.map(x => h('li', {}, '⛓ ' + Relations.describeRelation(x) + (x.page ? ` (${x.page})` : '')))));
  }

  function drawInfo() {
    const info = $('gt-info');
    const m = selectedId && Store.marker(selectedId);
    info.innerHTML = m ? `<div class="pad">${UI.markerInfoHTML(m, null)}</div>` : '';
    if (m && !pref.ids.includes(m.id)) info.append(h('button', { class: 'primary', style: { margin: '0 12px 12px' }, onclick: () => add(m.id) }, '📊 Add to the chart'));
    info.classList.toggle('open', !!m);
  }

  return { init, show, add, remove, select };
})();
