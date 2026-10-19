/* Time gaps: "Seth's birth = Adam's birth + 130 years".
 *
 * Every dated thing is a slot (a fact's date, or its end date). A time gap (relation) says slot B = slot A +
 * offset, where the offset may be approximate (a smallest and a largest gap around the most-likely one). The
 * solver walks each connected group of slots from its anchors and reckons the rest, carrying ranges along:
 * a reckoned date's earliest/latest come from the anchor's range combined with the gap's range. A group with
 * no anchor is "not yet anchored". When two routes give dates whose ranges cannot both be true, that is a
 * conflict, listed in the conflicts panel where the user picks a value or marks the slot undeterminable.
 */
window.Relations = (() => {
  const { h, esc } = UI;
  let conflicts = [];            // [{ key, ref, chosen, candidates: [{ value, min, max, pin, path, last }] }]
  let undetermined = new Set();  // slot keys in groups with no anchor
  let solving = false;

  const key = ref => Store.refKey(ref);
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  const neg = o => ({ years: -o.years, months: -o.months, days: -o.days });
  const likelyOf = r => ({ years: r.years, months: r.months, days: r.days });
  const minOf = r => r.min || likelyOf(r);
  const maxOf = r => r.max || likelyOf(r);
  const dayOf = s => (s ? Dates.toDays(s) : null);

  // Carry a {date,min,max} value across one time gap. sign +1 follows the gap (from → to), -1 goes against it.
  function step(val, r, sign) {
    const lk = sign > 0 ? likelyOf(r) : neg(likelyOf(r));
    const lo = sign > 0 ? minOf(r) : neg(maxOf(r));
    const hi = sign > 0 ? maxOf(r) : neg(minOf(r));
    const date = Dates.addOffset(val.date, lk);
    if (date == null) return null;
    const min = Dates.addOffset(val.min || val.date, lo) || date, max = Dates.addOffset(val.max || val.date, hi) || date;
    return { date, min: Dates.minDate(min, max), max: Dates.maxDate(min, max) };
  }
  // Two values agree when their ranges overlap (a point is a range of one date). Precision is respected.
  function agree(a, b) {
    const aMin = dayOf(a.min || a.date), aMax = dayOf(a.max || a.date), bMin = dayOf(b.min || b.date), bMax = dayOf(b.max || b.date);
    if (aMin == null || bMin == null) return Dates.sameDate(a.date, b.date);
    if (aMax < bMin) return Dates.sameDate(a.max || a.date, b.min || b.date);
    if (bMax < aMin) return Dates.sameDate(b.max || b.date, a.min || a.date);
    return true;
  }

  // ---------- solver ----------
  function solve() {
    if (solving) return;
    solving = true;
    try {
      const rels = Store.relations().filter(r => r.status === 'active' && Store.refExists(r.from) && Store.refExists(r.to));
      const adj = new Map(), nodes = new Set();
      for (const r of rels) {
        const a = key(r.from), b = key(r.to);
        nodes.add(a); nodes.add(b);
        push(adj, a, { to: b, rel: r, sign: +1 });
        push(adj, b, { to: a, rel: r, sign: -1 });
      }
      const seen = new Set(), results = new Map(), newConflicts = [], undet = new Set();
      for (const start of [...nodes].sort()) {
        if (seen.has(start)) continue;
        const comp = [], stack = [start]; seen.add(start);
        while (stack.length) { const n = stack.pop(); comp.push(n); for (const e of adj.get(n) || []) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); } }
        comp.sort();
        const info = new Map(comp.map(k => { const ref = Store.parseRefKey(k); const range = Store.slotRange(ref) || { date: '', min: '', max: '' }; return [k, { ref, range, valid: !!range.date && Dates.isValid(range.date), pinned: Store.isPinned(ref), undet: Store.isUndetermined(ref) }]; }));
        let pins = comp.filter(k => { const i = info.get(k); return i.pinned && i.valid && !i.undet; });
        if (!pins.length) pins = comp.filter(k => { const i = info.get(k); return i.valid && !i.undet; }); // nothing anchored yet: any typed date anchors the group
        if (!pins.length) { comp.forEach(k => undet.add(k)); continue; }

        const cands = new Map();
        for (const p of pins) {
          const dist = new Map([[p, { value: info.get(p).range, path: [], last: null, from: null }]]);
          const q = [p];
          while (q.length) {
            const n = q.shift(), cur = dist.get(n);
            for (const e of adj.get(n) || []) {
              if (dist.has(e.to)) continue;
              const v = step(cur.value, e.rel, e.sign);
              if (!v) continue;
              dist.set(e.to, { value: v, path: cur.path.concat(e.rel.id), last: e.rel.id, from: n });
              q.push(e.to);
            }
          }
          for (const [k, d] of dist) push(cands, k, Object.assign({ pin: p }, d));
        }
        for (const k of comp) {
          const inf = info.get(k), list = cands.get(k) || [];
          if (inf.undet) { undet.add(k); continue; }
          if (!list.length) { undet.add(k); continue; }
          list.sort((a, b) => a.path.length - b.path.length || (a.pin < b.pin ? -1 : a.pin > b.pin ? 1 : 0));
          const own = list.find(c => c.pin === k);
          const chosen = own || list[0];
          const distinct = [];
          for (const c of list) if (!distinct.some(d => agree(d.value, c.value))) distinct.push(c);
          if (distinct.length > 1) newConflicts.push({ key: k, ref: inf.ref, chosen: chosen.value.date, candidates: distinct.map(c => Object.assign({}, c, { value: c.value.date, min: c.value.min, max: c.value.max })) });
          results.set(k, { ref: inf.ref, value: chosen.value.date, min: chosen.value.min, max: chosen.value.max, derived: chosen.path.length ? { relationId: chosen.last, fromKey: chosen.from, pinKey: chosen.pin, hops: chosen.path.length } : null });
        }
      }
      conflicts = newConflicts; undetermined = undet;
      Store.applySolved(results, undet);
      document.dispatchEvent(new CustomEvent('chrono-conflicts', { detail: { count: conflicts.length } }));
    } finally { solving = false; }
  }

  // ---------- describing things ----------
  function offsetText(r, sign) {
    const lk = sign > 0 ? likelyOf(r) : neg(likelyOf(r));
    let s = Dates.formatOffset(lk);
    if (r.min || r.max) {
      const lo = sign > 0 ? minOf(r) : neg(maxOf(r)), hi = sign > 0 ? maxOf(r) : neg(minOf(r));
      s += ` (${Dates.formatOffset(lo, false)} – ${Dates.formatOffset(hi, false)})`;
    }
    return s;
  }
  function describeDerived(ref) {
    const info = Store.derivedInfo(ref);
    if (!info) return '';
    const r = Store.relation(info.relationId);
    if (!r) return 'reckoned';
    const other = Store.parseRefKey(info.fromKey);
    const sign = Store.sameRef(r.to, ref) ? +1 : -1;
    let text = `${Store.slotLabel(other)} ${offsetText(r, sign)}`;
    if (info.hops > 1) text += ` (via ${info.hops} steps from ${Store.slotLabel(Store.parseRefKey(info.pinKey))})`;
    return text;
  }
  // "Seth · Born = Adam · Born + 130 y"
  function describeRelation(r, fromViewOf) {
    const flip = fromViewOf && Store.sameRef(r.from, fromViewOf);
    const left = flip ? r.from : r.to, right = flip ? r.to : r.from, sign = flip ? -1 : +1;
    return `${Store.slotLabel(left)} = ${Store.slotLabel(right)} ${offsetText(r, sign)}`;
  }
  const slotState = ref => ({
    value: Store.slotValue(ref), range: Store.slotRange(ref), pinned: Store.isPinned(ref), undetermined: Store.isUndetermined(ref),
    derived: Store.derivedInfo(ref), conflict: conflicts.find(c => Store.sameRef(c.ref, ref)) || null,
    related: Store.relationsOfRef(ref).length > 0,
  });
  // Small HTML badge set for a slot: ⛓ reckoned, 🔒 anchor, ⚠ conflict, ? undeterminable.
  function badgesHTML(ref) {
    const s = slotState(ref);
    let out = '';
    if (s.undetermined) out += ' <span class="rel-badge undet" title="Marked undeterminable">?</span>';
    if (s.conflict) out += ' <span class="rel-badge conflict" title="Conflicting dates: see the ⚠ Conflicts panel">⚠</span>';
    if (s.derived && !s.pinned) out += ` <span class="rel-badge chain" title="Reckoned from ${esc(describeDerived(ref))}">⛓</span>`;
    else if (s.pinned && s.related) out += ' <span class="rel-badge pin" title="Anchor: the related dates are reckoned from this one">🔒</span>';
    return out;
  }

  // ---------- time-gap picker ----------
  // Open a dialog to relate `thisRef` to another date. onDone() runs after the time gap is saved.
  function pick(thisRef, { onDone } = {}) {
    const thisLabel = Store.slotLabel(thisRef);
    const num = (v, w) => h('input', { type: 'number', value: v, style: { width: w + 'px' } });
    const yrs = num(0, 80), mos = num(0, 70), dys = num(0, 70);
    const dir = UI.select([['after', 'after'], ['before', 'before']], 'after');
    const approx = h('input', { type: 'checkbox' });
    const minY = num('', 70), minM = num('', 60), minD = num('', 60), maxY = num('', 70), maxM = num('', 60), maxD = num('', 60);
    const approxRow = h('div', { class: 'rel-approx hidden' },
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('span', { class: 'muted', style: { flex: 'none', width: '70px' } }, 'at least'), minY, h('span', {}, 'y'), minM, h('span', {}, 'm'), minD, h('span', {}, 'd')),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', marginTop: '4px' } }, h('span', { class: 'muted', style: { flex: 'none', width: '70px' } }, 'at most'), maxY, h('span', {}, 'y'), maxM, h('span', {}, 'm'), maxD, h('span', {}, 'd')),
      h('p', { class: 'hint' }, 'Leave "at least" or "at most" blank for a one-sided limit; the most-likely gap above is what places the date.'));
    approx.addEventListener('change', () => approxRow.classList.toggle('hidden', !approx.checked));
    const ownerId = thisRef.id;
    const markerSel = UI.markerSelect({ placeholder: 'Other marker…', onChange: fillSlots });
    const slotSel = h('select');
    const srcSel = UI.sourceSelect({ onChange: v => { src = v; } });
    let src = null;
    const page = h('input', { type: 'text', placeholder: 'page / verse' });
    const note = h('input', { type: 'text', placeholder: 'e.g. "When Adam had lived 130 years, he fathered Seth"' });
    let conf = ''; const reason = h('input', { type: 'text', placeholder: 'why this grade' });
    const confSel = UI.confidenceSelect('', v => { conf = v; });
    function fillSlots(mid) {
      slotSel.innerHTML = '';
      if (!mid) { slotSel.append(h('option', { value: '' }, '— pick a marker first —')); return; }
      const slots = Store.slotsOfMarker(mid).filter(s => !Store.sameRef(s.ref, thisRef));
      slots.forEach(s => slotSel.append(h('option', { value: Store.refKey(s.ref) }, `${s.label}${Store.slotValue(s.ref) ? ' (' + Dates.formatInput(Store.slotValue(s.ref)) + ')' : ''}`)));
      if (!slots.length) slotSel.append(h('option', { value: '' }, 'That marker has no dates'));
    }
    fillSlots(null);
    if (ownerId) { markerSel.setValue(ownerId); fillSlots(ownerId); }
    const val = el => (el.value === '' ? null : +el.value || 0);
    const save = () => {
      const otherKey = slotSel.value;
      if (!otherKey) { UI.toast('Pick the other date', 'error'); return; }
      const other = Store.parseRefKey(otherKey);
      const Y = +yrs.value || 0, M = +mos.value || 0, D = +dys.value || 0;
      if (!Y && !M && !D && !confirm('Save a time gap with no gap (the two dates are the same)?')) return;
      const sign = dir.value === 'before' ? -1 : 1;
      let min = null, max = null;
      if (approx.checked) {
        const lo = [val(minY), val(minM), val(minD)], hi = [val(maxY), val(maxM), val(maxD)];
        if (lo.some(v => v != null)) min = { years: sign * (lo[0] || 0), months: sign * (lo[1] || 0), days: sign * (lo[2] || 0) };
        if (hi.some(v => v != null)) max = { years: sign * (hi[0] || 0), months: sign * (hi[1] || 0), days: sign * (hi[2] || 0) };
        if (sign < 0) { const t = min; min = max; max = t; } // "before": the larger gap is the earlier date
      }
      // thisRef = other + offset  →  relation from=other, to=this
      Store.addRelation({ from: other, to: thisRef, years: sign * Y, months: sign * M, days: sign * D, min, max, sourceId: src, page: page.value, note: note.value, confidence: conf, reason: reason.value });
      m.close();
      onDone && onDone();
      UI.toast('Time gap saved');
    };
    const body = h('div', { class: 'rel-form' },
      h('p', {}, h('strong', {}, thisLabel), ' is'),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, yrs, h('span', {}, 'years'), mos, h('span', {}, 'months'), dys, h('span', {}, 'days'), dir),
      h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '6px 0' } }, approx, ' approximate gap (set the smallest and largest it could be)'),
      approxRow,
      h('label', { class: 'field' }, 'the date of marker', markerSel),
      h('label', { class: 'field' }, 'which date', slotSel),
      h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Source', srcSel), h('label', { class: 'field' }, 'Page / verse', page)),
      h('label', { class: 'field' }, 'Note (the wording you are relying on)', note),
      h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Confidence (your grade)', confSel), h('label', { class: 'field' }, 'Reason', reason)),
      h('p', { class: 'hint' }, 'The other date becomes the anchor if it is already known; this date is then reckoned from it and moves with it. Anchor a date (🔒) to make it the fixed end instead.'),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save time gap'), h('button', { onclick: () => m.close() }, 'Cancel')));
    const m = UI.modal({ title: 'Time gap', body, width: '640px' });
    setTimeout(() => yrs.focus(), 50);
  }

  // ---------- conflicts panel ----------
  function pathText(c) {
    const steps = c.path.map(id => { const r = Store.relation(id); return r ? describeRelation(r) : '?'; });
    return `from ${Store.slotLabel(Store.parseRefKey(c.pin))}${steps.length ? ': ' + steps.join(' → ') : ''}`;
  }
  function showConflicts() {
    const body = h('div');
    const render = () => {
      body.innerHTML = '';
      if (!conflicts.length) { body.append(h('p', { class: 'muted' }, 'No conflicts. Every related date agrees.')); return; }
      body.append(h('p', { class: 'hint' }, 'Each entry is one date that two chains of time gaps place differently (their ranges cannot both be true). Choose the value to keep (the time gap that produced the other value is kept but marked overruled, so the disagreement stays on record), or mark the date undeterminable.'));
      for (const c of conflicts) {
        const card = h('div', { class: 'card' }, h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, Store.slotLabel(c.ref), ' ', h('span', { class: 'muted' }, `(currently ${Dates.formatInput(c.chosen)})`)));
        for (const cand of c.candidates) {
          card.append(h('div', { class: 'rel-cand' },
            h('div', { class: 'grow' }, h('strong', {}, Dates.formatRange(cand.value, cand.min, cand.max)), ' ', h('span', { class: 'muted', style: { fontSize: '12px' } }, pathText(cand))),
            h('button', { class: 'small', onclick: () => { useValue(c, cand); render(); } }, 'Use this')));
        }
        card.append(h('div', { style: { marginTop: '6px' } }, h('button', { class: 'small', onclick: () => { Store.setUndetermined(c.ref, true); render(); } }, 'Mark undeterminable'),
          ' ', h('button', { class: 'small', onclick: () => { Editor.open(c.ref.id); } }, 'Open marker')));
        body.append(card);
      }
    };
    document.addEventListener('chrono-conflicts', render);
    const m = UI.modal({ title: `Date conflicts (${conflicts.length})`, body, width: '760px', onClose: () => document.removeEventListener('chrono-conflicts', render) });
    render();
  }
  // Keep one candidate: anchor the slot at that value and overrule the last time gap on every other route.
  function useValue(conflict, cand) {
    for (const other of conflict.candidates) {
      if (other === cand || !other.last) continue;
      if (!agree({ date: other.value, min: other.min, max: other.max }, { date: cand.value, min: cand.min, max: cand.max })) Store.updateRelation(other.last, { status: 'overruled' });
    }
    Store.pinValue(conflict.ref, cand.value);
  }

  // ---------- wiring ----------
  function init() {
    Store.subscribe(evt => { if (evt.type !== 'relations' && evt.type !== 'photos' && evt.type !== 'photo') solve(); });
    solve();
  }

  return { init, solve, pick, showConflicts, slotState, badgesHTML, describeDerived, describeRelation, agree, conflicts: () => conflicts, undetermined: () => undetermined };
})();
