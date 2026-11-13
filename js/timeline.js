/* Timeline tab: the facts of one or more markers in date order, as a list you scroll.
 *
 * Markers are added from the left panel (or with 🕒 Timeline in a marker's information). Facts that fall on the
 * same date share a row; between rows the time that passed is written on the spine ("130 years later").
 * Two layouts: one list (every marker's facts in a single column, each card naming its marker) and side by
 * side (a column per marker, so lives can be compared). Facts with no date come last.
 * Nothing here is stored except the choice of markers and layout, which is kept on this device.
 */
window.Timeline = (() => {
  const $ = id => document.getElementById(id);
  const h = UI.h;
  const KEY = 'chronomap.timeline';
  const pref = Object.assign({ ids: [], layout: 'list', mirrors: true, gaps: true }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
  if (!Array.isArray(pref.ids)) pref.ids = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
  let selectedId = null, picker, jumpTo = null;

  function init() {
    // pref.ids is handed to the picker as its exclude list, so it is only ever changed in place
    picker = UI.markerSelect({ placeholder: 'Add a marker…', exclude: pref.ids, onChange: v => { if (v) add(v); picker.setValue(null); } });
    $('tl-add').append(picker);
    $('tl-layout').value = pref.layout;
    $('tl-layout').addEventListener('change', e => { pref.layout = e.target.value; save(); draw(); });
    $('tl-mirrors').checked = pref.mirrors;
    $('tl-mirrors').addEventListener('change', e => { pref.mirrors = e.target.checked; save(); draw(); });
    $('tl-gaps').checked = pref.gaps;
    $('tl-gaps').addEventListener('change', e => { pref.gaps = e.target.checked; save(); draw(); });
    $('tl-clear').onclick = () => { pref.ids.length = 0; selectedId = null; save(); draw(); };
    $('tl-top').onclick = () => { $('tl-body').scrollTop = 0; };
    $('tl-info-close').onclick = () => { selectedId = null; drawInfo(); };
    Store.subscribe(() => { if (App.currentTab() === 'timeline') draw(); });
  }
  function show() { draw(); }
  function add(id) {
    if (!Store.marker(id)) return;
    if (!pref.ids.includes(id)) { pref.ids.push(id); save(); }
    jumpTo = id; draw();
  }
  function remove(id) {
    const i = pref.ids.indexOf(id);
    if (i >= 0) pref.ids.splice(i, 1);
    save(); draw();
  }
  function move(id, by) {
    const i = pref.ids.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= pref.ids.length) return;
    pref.ids.splice(j, 0, pref.ids.splice(i, 1)[0]);
    save(); draw();
  }
  function select(id) { selectedId = id; drawInfo(); }

  // ---------- the entries ----------
  function entries() {
    const on = new Set(pref.ids), out = [];
    pref.ids.forEach((id, lane) => {
      const m = Store.marker(id);
      (m.facts || []).forEach((f, i) => {
        const w = Facts.when(f);
        const date = w.date || f.dateMin || f.dateMax || '';
        out.push({ m, lane, f, date, d: date ? Dates.toDays(date) : null, order: i });
      });
      if (pref.mirrors) (m.mirrors || []).forEach((mi, i) => {
        // in one list, a fact whose own marker is also on the timeline is already there once
        if (pref.layout !== 'lanes' && on.has(mi.markerId)) return;
        if (!Store.marker(mi.markerId)) return;
        const date = mi.date || Dates.midpoint(mi.dateMin, mi.dateMax) || mi.dateMin || mi.dateMax || '';
        out.push({ m, lane, mi, date, d: date ? Dates.toDays(date) : null, order: 100000 + i });
      });
    });
    out.sort((a, b) => (a.d == null && b.d == null) ? (a.lane - b.lane || a.order - b.order) : a.d == null ? 1 : b.d == null ? -1 : (a.d - b.d || a.lane - b.lane || a.order - b.order));
    return out;
  }
  // rows: entries on the same day share one; everything without a date is the last row
  function groups(es) {
    const out = [];
    for (const e of es) {
      const last = out[out.length - 1];
      if (last && last.d === e.d) last.entries.push(e);
      else out.push({ d: e.d, date: e.date, entries: [e] });
    }
    return out;
  }
  // "130 years", "2 years 3 months", "12 days": the time from one date to the next, no finer than the dates themselves
  function gapText(a, b) {
    const pa = Dates.parse(a), pb = Dates.parse(b);
    if (!pa || !pb) return '';
    const n = (v, word) => (v ? `${v} ${word}${v === 1 ? '' : 's'}` : '');
    let y = pb.y - pa.y, mo = pb.m - pa.m, dd = pb.d - pa.d;
    const year = pa.precision === 'year' || pb.precision === 'year';
    const month = pa.precision === 'month' || pb.precision === 'month';
    if (year) return n(Math.max(0, y), 'year');
    if (month) { if (mo < 0) { y--; mo += 12; } return [n(y, 'year'), n(mo, 'month')].filter(Boolean).join(' '); }
    if (dd < 0) { mo--; const py = pb.m === 1 ? pb.y - 1 : pb.y, pm = pb.m === 1 ? 12 : pb.m - 1; dd += Dates.daysFromCivil(pb.y, pb.m, 1) - Dates.daysFromCivil(py, pm, 1); }
    if (mo < 0) { y--; mo += 12; }
    return [n(y, 'year'), n(mo, 'month'), n(dd, 'day')].filter(Boolean).slice(0, 2).join(' ');
  }

  // ---------- drawing ----------
  const chip = m => h('button', { class: 'tl-chip', title: 'Show this marker\'s information', onclick: e => { e.stopPropagation(); select(m.id); } },
    h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)), Store.displayName(m));

  function card(e, withMarker, rowLabel) {
    const c = h('div', { class: 'tl-card' + (e.mi ? ' mirror' : ''), style: { borderLeftColor: Store.displayColor(e.m) }, 'data-mid': e.m.id });
    if (withMarker) c.append(chip(e.m));
    // the full wording of the date when it says more than the row's label (a range, an end date, "after …")
    const when = e.f ? UI.factWhenHTML(e.m, e.f) : UI.mirrorWhenHTML(e.mi);
    if (when && when !== UI.esc(rowLabel)) c.append(h('div', { class: 'tl-when muted', html: when }));
    c.append(h('div', { class: 'tl-text', html: e.f ? UI.factLineHTML(e.m, e.f, null, { bare: true, noDate: true }) : UI.mirrorLineHTML(e.mi, { bare: true, noDate: true }) }));
    return c;
  }

  function drawChosen() {
    const box = $('tl-chosen'); box.innerHTML = '';
    if (!pref.ids.length) { box.append(h('div', { class: 'muted', style: { fontSize: 'calc(12px * var(--fs))' } }, 'None yet.')); }
    pref.ids.forEach((id, i) => {
      const m = Store.marker(id);
      box.append(h('div', { class: 'tl-row' },
        h('div', { class: 'tl-row-name', title: 'Jump to this marker\'s first fact', onclick: () => { jumpTo = id; selectedId = id; draw(); } },
          h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)), h('span', { class: 'name' }, Store.displayName(m))),
        pref.ids.length > 1 ? h('button', { class: 'small', title: 'Move up (earlier column)', disabled: i === 0, onclick: () => move(id, -1) }, '↑') : null,
        pref.ids.length > 1 ? h('button', { class: 'small', title: 'Move down (later column)', disabled: i === pref.ids.length - 1, onclick: () => move(id, 1) }, '↓') : null,
        h('button', { class: 'small', title: 'Take this marker off the timeline', onclick: () => remove(id) }, '✕')));
    });
    $('tl-clear').classList.toggle('hidden', pref.ids.length < 2);
    $('tl-layout').disabled = pref.ids.length < 2;
  }

  function draw() {
    for (let i = pref.ids.length - 1; i >= 0; i--) if (!Store.marker(pref.ids[i])) pref.ids.splice(i, 1); // deleted markers drop off
    const host = $('tl-body'), keep = host.scrollTop;
    drawChosen();
    host.innerHTML = '';
    const ms = pref.ids.map(id => Store.marker(id));
    if (!ms.length) {
      host.append(h('div', { class: 'tl-empty' }, Store.markers().length ? 'Add a marker in the left panel (☰ brings the panel back if it is folded away), or press 🕒 Timeline in a marker\'s information.' : 'No markers yet.'));
      $('tl-stats').textContent = ''; drawInfo(); return;
    }
    const es = entries(), gs = groups(es);
    const dated = es.filter(e => e.d != null);
    $('tl-stats').textContent = `${es.length} fact${es.length === 1 ? '' : 's'}` + (dated.length ? ` · ${Dates.formatInput(dated[0].date)} to ${Dates.formatInput(dated[dated.length - 1].date)}` : '') + (es.length - dated.length ? ` · ${es.length - dated.length} without a date` : '');
    if (!es.length) { host.append(h('div', { class: 'tl-empty' }, ms.length === 1 ? `${ms[0].name} has no facts yet.` : 'These markers have no facts yet.')); drawInfo(); return; }

    const lanes = pref.layout === 'lanes' && ms.length > 1;
    const grid = h('div', { class: 'tl-grid' + (lanes ? ' lanes' : ''), style: { gridTemplateColumns: lanes ? `max-content repeat(${ms.length}, minmax(calc(210px * var(--fs)), 1fr))` : 'max-content minmax(0, 1fr)' } });
    if (lanes) { grid.append(h('div', { class: 'tl-head tl-corner' }, 'Date')); ms.forEach(m => grid.append(h('div', { class: 'tl-head' }, chip(m)))); }
    gs.forEach((g, gi) => {
      const prev = gs[gi - 1];
      if (pref.gaps && prev && g.d != null && prev.d != null) {
        const txt = gapText(prev.date, g.date);
        if (txt) grid.append(h('div', { class: 'tl-date gap' }), h('div', { class: 'tl-gap', style: { gridColumn: '2 / -1' } }, `↓ ${txt} later`));
      }
      const label = g.d == null ? 'No date' : Dates.formatInput(g.date);
      grid.append(h('div', { class: 'tl-date' + (g.d == null ? ' none' : '') }, label));
      if (lanes) ms.forEach(m => { const cell = h('div', { class: 'tl-cell' }); g.entries.filter(e => e.m === m).forEach(e => cell.append(card(e, false, label))); grid.append(cell); });
      else { const cell = h('div', { class: 'tl-cell' }); g.entries.forEach(e => cell.append(card(e, ms.length > 1, label))); grid.append(cell); }
    });
    host.append(grid);
    const target = jumpTo && host.querySelector(`.tl-card[data-mid="${CSS.escape(jumpTo)}"]`);
    if (target) { host.scrollTop = Math.max(0, target.offsetTop - host.clientHeight / 3); } else host.scrollTop = keep;
    jumpTo = null;
    drawInfo();
  }

  function drawInfo() {
    const info = $('tl-info');
    const m = selectedId && Store.marker(selectedId);
    info.innerHTML = m ? `<div class="pad">${UI.markerInfoHTML(m, null)}</div>` : '';
    if (m && !pref.ids.includes(m.id)) info.append(h('button', { class: 'primary', style: { margin: '0 12px 12px' }, onclick: () => add(m.id) }, '🕒 Add to the timeline'));
    info.classList.toggle('open', !!m);
  }

  return { init, show, add, remove, select };
})();
