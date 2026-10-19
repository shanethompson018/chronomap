/* Date relations: "Seth's birth = Adam's birth + 130 years".
 *
 * Every dated thing is a slot (a fact's date, or its end date). A time gap (relation)
 * says slot B = slot A + offset. The solver walks each connected group of slots from its pinned dates and fills
 * in the rest; a group with no pinned date is "undetermined". When two routes give different dates for one slot,
 * that is a conflict, listed in the conflicts panel where the user picks a value or marks the slot undeterminable.
 */
window.Relations = (() => {
  const { h, esc } = UI;
  let conflicts = [];            // [{ key, ref, chosen, candidates: [{ value, pin, path, last }] }]
  let undetermined = new Set();  // slot keys in groups with no anchor
  let solving = false;

  const key = ref => Store.refKey(ref);
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  const offsetOf = (r, sign) => ({ years: sign * r.years, months: sign * r.months, days: sign * r.days });

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
        const info = new Map(comp.map(k => { const ref = Store.parseRefKey(k); const value = Store.slotValue(ref); return [k, { ref, value, valid: !!value && Dates.isValid(value), pinned: Store.isPinned(ref), undet: Store.isUndetermined(ref) }]; }));
        let pins = comp.filter(k => { const i = info.get(k); return i.pinned && i.valid && !i.undet; });
        if (!pins.length) pins = comp.filter(k => { const i = info.get(k); return i.valid && !i.undet; }); // nothing pinned yet: any typed date anchors the group
        if (!pins.length) { comp.forEach(k => undet.add(k)); continue; }

        const cands = new Map();
        for (const p of pins) {
          const dist = new Map([[p, { value: info.get(p).value, path: [], last: null, from: null }]]);
          const q = [p];
          while (q.length) {
            const n = q.shift(), cur = dist.get(n);
            for (const e of adj.get(n) || []) {
              if (dist.has(e.to)) continue;
              const v = Dates.addOffset(cur.value, offsetOf(e.rel, e.sign));
              if (v == null) continue;
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
          for (const c of list) if (!distinct.some(d => Dates.sameDate(d.value, c.value))) distinct.push(c);
          if (distinct.length > 1) newConflicts.push({ key: k, ref: inf.ref, chosen: chosen.value, candidates: distinct });
          results.set(k, { ref: inf.ref, value: chosen.value, derived: chosen.path.length ? { relationId: chosen.last, fromKey: chosen.from, pinKey: chosen.pin, hops: chosen.path.length } : null });
        }
      }
      conflicts = newConflicts; undetermined = undet;
      Store.applySolved(results, undet);
      document.dispatchEvent(new CustomEvent('chrono-conflicts', { detail: { count: conflicts.length } }));
    } finally { solving = false; }
  }

  // ---------- describing things ----------
  function describeDerived(ref) {
    const info = Store.derivedInfo(ref);
    if (!info) return '';
    const r = Store.relation(info.relationId);
    if (!r) return 'computed';
    const other = Store.parseRefKey(info.fromKey);
    const sign = Store.sameRef(r.to, ref) ? +1 : -1;
    let text = `${Store.slotLabel(other)} ${Dates.formatOffset(offsetOf(r, sign))}`;
    if (info.hops > 1) text += ` (via ${info.hops} steps from ${Store.slotLabel(Store.parseRefKey(info.pinKey))})`;
    return text;
  }
  // "Seth · Born = Adam · Born + 130 y"
  function describeRelation(r, fromViewOf) {
    const flip = fromViewOf && Store.sameRef(r.from, fromViewOf);
    const left = flip ? r.from : r.to, right = flip ? r.to : r.from, sign = flip ? -1 : +1;
    return `${Store.slotLabel(left)} = ${Store.slotLabel(right)} ${Dates.formatOffset(offsetOf(r, sign))}`;
  }
  const slotState = ref => ({
    value: Store.slotValue(ref), pinned: Store.isPinned(ref), undetermined: Store.isUndetermined(ref),
    derived: Store.derivedInfo(ref), conflict: conflicts.find(c => Store.sameRef(c.ref, ref)) || null,
    related: Store.relationsOfRef(ref).length > 0,
  });
  // Small HTML badge set for a slot: ⛓ derived, 🔒 pinned, ⚠ conflict, ? undetermined.
  function badgesHTML(ref) {
    const s = slotState(ref);
    let out = '';
    if (s.undetermined) out += ' <span class="rel-badge undet" title="Marked undeterminable">?</span>';
    if (s.conflict) out += ' <span class="rel-badge conflict" title="Conflicting dates: see the ⚠ Conflicts panel">⚠</span>';
    if (s.derived && !s.pinned) out += ` <span class="rel-badge chain" title="Computed: ${esc(describeDerived(ref))}">⛓</span>`;
    else if (s.pinned && s.related) out += ' <span class="rel-badge pin" title="Pinned date: other dates are computed from this one">🔒</span>';
    return out;
  }

  // ---------- relation picker ----------
  // Open a dialog to relate `thisRef` to another date. onDone() runs after the relation is saved.
  function pick(thisRef, { onDone } = {}) {
    const thisLabel = Store.slotLabel(thisRef);
    const yrs = h('input', { type: 'number', value: 0, style: { width: '80px' } });
    const mos = h('input', { type: 'number', value: 0, style: { width: '70px' } });
    const dys = h('input', { type: 'number', value: 0, style: { width: '70px' } });
    const dir = UI.select([['after', 'after'], ['before', 'before']], 'after');
    const ownerId = thisRef.id;
    const markerSel = UI.markerSelect({ placeholder: 'Other marker…', onChange: fillSlots });
    const slotSel = h('select');
    const srcSel = UI.sourceSelect({ onChange: v => { src = v; } });
    let src = null;
    const page = h('input', { type: 'text', placeholder: 'page / verse' });
    const note = h('input', { type: 'text', placeholder: 'e.g. "When Adam had lived 130 years, he fathered Seth"' });
    function fillSlots(mid) {
      slotSel.innerHTML = '';
      if (!mid) { slotSel.append(h('option', { value: '' }, '— pick a marker first —')); return; }
      const slots = Store.slotsOfMarker(mid).filter(s => !Store.sameRef(s.ref, thisRef));
      slots.forEach(s => slotSel.append(h('option', { value: Store.refKey(s.ref) }, `${s.label}${Store.slotValue(s.ref) ? ' (' + Dates.formatInput(Store.slotValue(s.ref)) + ')' : ''}`)));
      if (!slots.length) slotSel.append(h('option', { value: '' }, 'That marker has no dates'));
    }
    fillSlots(null);
    if (ownerId) { markerSel.setValue(ownerId); fillSlots(ownerId); }
    const save = () => {
      const otherKey = slotSel.value;
      if (!otherKey) { UI.toast('Pick the other date', 'error'); return; }
      const other = Store.parseRefKey(otherKey);
      const Y = +yrs.value || 0, M = +mos.value || 0, D = +dys.value || 0;
      if (!Y && !M && !D) { UI.toast('Enter an offset (years, months or days). Use 0 of everything only if the two dates are the same.', 'error'); if (!confirm('Save a relation with no offset (the two dates are the same)?')) return; }
      const sign = dir.value === 'before' ? -1 : 1;
      // thisRef = other + offset  →  relation from=other, to=this
      Store.addRelation({ from: other, to: thisRef, years: sign * Y, months: sign * M, days: sign * D, sourceId: src, page: page.value, note: note.value });
      m.close();
      onDone && onDone();
      UI.toast('Relation saved');
    };
    const body = h('div', { class: 'rel-form' },
      h('p', {}, h('strong', {}, thisLabel), ' is'),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, yrs, h('span', {}, 'years'), mos, h('span', {}, 'months'), dys, h('span', {}, 'days'), dir),
      h('label', { class: 'field' }, 'the date of marker', markerSel),
      h('label', { class: 'field' }, 'which date', slotSel),
      h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Source', srcSel), h('label', { class: 'field' }, 'Page / verse', page)),
      h('label', { class: 'field' }, 'Note (the wording you are relying on)', note),
      h('p', { class: 'hint' }, 'The other date becomes the anchor if it is already known; this date is then computed from it and moves with it. Pin a date (🔒) to make it the fixed end instead.'),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save relation'), h('button', { onclick: () => m.close() }, 'Cancel')));
    const m = UI.modal({ title: 'Date relation', body, width: '620px' });
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
      body.append(h('p', { class: 'hint' }, 'Each entry is one date that two chains of relations place differently. Choose the value to keep (the relation that produced the other value is kept but marked overruled, so the disagreement stays on record), or mark the date undeterminable.'));
      for (const c of conflicts) {
        const card = h('div', { class: 'card' }, h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, Store.slotLabel(c.ref), ' ', h('span', { class: 'muted' }, `(currently ${Dates.formatInput(c.chosen)})`)));
        for (const cand of c.candidates) {
          card.append(h('div', { class: 'rel-cand' },
            h('div', { class: 'grow' }, h('strong', {}, Dates.formatInput(cand.value)), ' ', h('span', { class: 'muted', style: { fontSize: '12px' } }, pathText(cand))),
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
  // Keep one candidate: pin the slot at that value and overrule the last relation on every other route.
  function useValue(conflict, cand) {
    for (const other of conflict.candidates) {
      if (other === cand || !other.last) continue;
      if (!Dates.sameDate(other.value, cand.value)) Store.updateRelation(other.last, { status: 'overruled' });
    }
    Store.pinValue(conflict.ref, cand.value);
  }

  // ---------- wiring ----------
  function init() {
    Store.subscribe(evt => { if (evt.type !== 'relations' && evt.type !== 'photos' && evt.type !== 'photo') solve(); });
    solve();
  }

  return { init, solve, pick, showConflicts, slotState, badgesHTML, describeDerived, describeRelation, conflicts: () => conflicts, undetermined: () => undetermined };
})();
