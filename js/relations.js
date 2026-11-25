/* Time gaps and limits.
 *
 * A date has three parts: the earliest it can be, the date itself, the latest it can be. A tie sets one part
 * from another date, plus or minus a length of time:
 *   part 'date'  "Seth's birth = Adam's birth + 130 years"       (places the date; solved first, as before)
 *   part 'min'   "the marriage is not before Sarai's birth"       (limits the earliest end)
 *   part 'max'   "the marriage is not after Sarai's death"        (limits the latest end)
 * The limits are worked out the way Primavera P6 works out early and late dates: a forward pass pushes each
 * earliest end up, a backward pass pulls each latest end down, and every tie is used both ways. A date with
 * limits and no date shows as its window; a window that has closed (earliest after latest) is a conflict.
 *
 * Ties on a date (the original time gaps):
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
  const isLimit = r => r.part === 'min' || r.part === 'max'; // a tie on an end; anything else is a tie on the date
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  const neg = o => ({ years: -o.years, months: -o.months, days: -o.days });
  // The most-likely gap. A gap saved with a range but no most-likely value (an older dialog allowed that)
  // counts as the middle of its range, so the reckoned date never sits outside the range.
  const toDays = o => (+o.years || 0) * 365.25 + (+o.months || 0) * 30.4375 + (+o.days || 0);
  function fromDays(n) {
    const sign = n < 0 ? -1 : 1; n = Math.abs(n);
    let Y = Math.floor(n / 365.25); const rest = n - Y * 365.25; let M = Math.floor(rest / 30.4375); let D = Math.round(rest - M * 30.4375);
    if (D >= 30) { D = 0; M += 1; } if (M >= 12) { M = 0; Y += 1; }
    return { years: sign * Y, months: sign * M, days: sign * D };
  }
  const likelyOf = r => {
    if (!r.years && !r.months && !r.days && (r.min || r.max)) return fromDays(r.min && r.max ? (toDays(r.min) + toDays(r.max)) / 2 : toDays(r.min || r.max));
    return { years: r.years, months: r.months, days: r.days };
  };
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
      const rels = Store.relations().filter(r => r.status === 'active' && !isLimit(r) && Store.refExists(r.from) && Store.refExists(r.to));
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
      undetermined = undet;
      Store.applySolved(results, undet);
      // the dates are settled: now the windows that the ties on the ends allow
      const win = solveWindows();
      Store.applyWindows(win.out);
      conflicts = newConflicts.concat(win.conflicts);
      document.dispatchEvent(new CustomEvent('chrono-conflicts', { detail: { count: conflicts.length } }));
    } finally { solving = false; }
  }

  // ---------- windows: ties on the earliest and latest ends ----------
  const D = (s, end) => (s ? Dates.toDays(s, !!end) : null);
  const offOf = r => ({ years: r.years, months: r.months, days: r.days });
  const limitRels = () => Store.relations().filter(r => r.status === 'active' && isLimit(r) && Store.refExists(r.from) && Store.refExists(r.to));
  // What a slot starts from: a known date is its own earliest and latest (with its range, if it has one); a slot
  // with no date starts from whatever was typed in its earliest / latest boxes, or open.
  // `likely`: the second pass, which takes a known date at its most likely value and leaves its range out.
  function baseOf(k, likely) {
    const ref = Store.parseRefKey(k);
    if (Store.isUndetermined(ref)) return { min: '', max: '' };
    const t = Store.slotTyped(ref) || { date: '', min: '', max: '' };
    return t.date ? (likely ? { min: t.date, max: t.date } : { min: t.min || t.date, max: t.max || t.date }) : { min: t.min, max: t.max };
  }
  // Forward and backward pass over the limit ties. Returns slot key -> { E, L, eBy, lBy } where eBy / lBy name
  // the tie that set that end ({ rel, back }: back = the tie was used from its far end), or null when the end is
  // the slot's own.
  // A fact with a from and an until date carries one limit of its own: the until date is not before the from date.
  function ownRels(rels) {
    const seen = new Set(), out = [];
    const add = (mid, base) => { out.push({ id: 'own|' + mid + '|' + base, from: { kind: 'marker', id: mid, slot: base }, to: { kind: 'marker', id: mid, slot: base + ':end' }, part: 'min', years: 0, months: 0, days: 0 }); };
    for (const r of rels) for (const ref of [r.from, r.to]) {
      const base = ref.slot.replace(/:end$/, ''), k = ref.id + '|' + base;
      if (seen.has(k)) continue;
      seen.add(k);
      const m = Store.marker(ref.id), f = m && (m.facts || []).find(x => 'fact:' + x.id === base), t = f && Store.factType(f.typeId);
      if (t && t.hasEnd) add(ref.id, base);
    }
    // …and so does every fact with something typed for both its From and its Until, tie or no tie, so an Until
    // that falls before its From is always reported (22.1)
    const any = (f, e) => !!(e ? f.dateEnd || f.dateEndMin || f.dateEndMax : f.date || f.dateMin || f.dateMax);
    for (const m of Store.markers()) for (const f of m.facts || []) {
      const t = Store.factType(f.typeId), k = m.id + '|fact:' + f.id;
      if (seen.has(k) || !t || !t.hasEnd || t.hasDate === false || !any(f, false) || !any(f, true)) continue;
      seen.add(k); add(m.id, 'fact:' + f.id);
    }
    return out;
  }
  // Limits that follow from a lifetime (22.2) and from parent and child (22.3). Nothing is stored and no typed
  // date is changed: these only take part in the working out, so a date that breaks one shows as a conflict and
  // a date that already has ties is narrowed by them. A fact with no date and no tie gets no window from them.
  //  * A marker's lifetime runs from its Begins fact (the earliest dated one) to its Ends fact (the latest).
  //  * Its own facts fall inside that (unless the fact type is ticked "may fall outside the lifetime").
  //  * Whoever takes part in a fact was alive for some of it: they began before it ended and ended after it
  //    began (not asked of a birth: a father may die before his child is born).
  //  * A child's Begins is not before its parent's Begins (every "Parent of" tie).
  // Ids: 'life|<m1>|<slot1>|<m2>|<slot2>' and 'kin|…': slot2 is not before slot1. Switches: settings autoLife, autoKin.
  function lifeRels(given) {
    const out = [], seen = new Set(), set = Store.settings();
    if (set.autoLife === false && set.autoKin === false) return out;
    const ref = (id, slot) => ({ kind: 'marker', id, slot });
    const add = (kind, m1, s1, m2, s2) => {
      if (m1 === m2 && s1 === s2) return;
      const id = [kind, m1, s1, m2, s2].join('|'); if (seen.has(id)) return;
      seen.add(id); out.push({ id, from: ref(m1, s1), to: ref(m2, s2), part: 'min', years: 0, months: 0, days: 0 });
    };
    const touched = new Set(given.flatMap(r => [key(r.from), key(r.to)]));
    const span = new Map(); // marker id -> { b, e }: its Begins and Ends, each { f, d, slot }
    for (const m of Store.markers()) {
      let b = null, e = null;
      for (const f of m.facts || []) {
        const t = Store.factType(f.typeId); if (!t || t.hasDate === false) continue;
        const w = Facts.when(f);
        if (t.begins) { const d = D(w.date); if (!b || (d != null && (b.d == null || d < b.d))) b = { f, d, slot: 'fact:' + f.id }; }
        if (t.ends) { const d = D(t.hasEnd ? (w.dateEnd || w.date) : w.date); if (!e || (d != null && (e.d == null || d > e.d))) e = { f, d, slot: 'fact:' + f.id + (t.hasEnd ? ':end' : '') }; }
      }
      span.set(m.id, { b, e });
    }
    if (set.autoLife !== false) for (const m of Store.markers()) {
      const own = span.get(m.id);
      if (own.b && own.e && own.b.f !== own.e.f) add('life', m.id, own.b.slot, m.id, own.e.slot); // it does not end before it begins
      for (const f of m.facts || []) {
        const t = Store.factType(f.typeId); if (!t || t.hasDate === false) continue;
        if (t.outside != null ? t.outside : t.id === 'ft_named') continue; // this kind of fact may fall outside the lifetime
        const first = 'fact:' + f.id;
        const hasUntil = t.hasEnd && (!!(f.dateEnd || f.dateEndMin || f.dateEndMax) || touched.has(key(ref(m.id, first + ':end'))));
        const last = hasUntil ? first + ':end' : first;
        if (own.b && own.b.f !== f) add('life', m.id, own.b.slot, m.id, first);
        if (own.e && own.e.f !== f) add('life', m.id, last, m.id, own.e.slot);
        for (const p of f.participants || []) {
          const o = p.markerId !== m.id && span.get(p.markerId); if (!o) continue;
          if (o.b) add('life', p.markerId, o.b.slot, m.id, last);
          if (o.e && !t.begins) add('life', m.id, first, p.markerId, o.e.slot);
        }
      }
    }
    if (set.autoKin !== false) for (const l of Store.links()) {
      const lt = Store.linkType(l.typeId); if (!lt || lt.name.trim().toLowerCase() !== 'parent of') continue;
      const pa = span.get(l.fromId), ch = span.get(l.toId);
      if (pa && ch && pa.b && ch.b) add('kin', l.fromId, pa.b.slot, l.toId, ch.b.slot);
    }
    return out;
  }
  // A journey with stops is a chain in order: it sets out (From), arrives at and leaves each stop in turn, and
  // arrives (Until). Each of those dates is not before the one before it, the way activities in sequence are in
  // P6. These limits are the journey's own, like a fact's from / until pair, but they always count, so a stop
  // with no date shows the window its neighbours leave it. Ids are 'seq|<markerId>|<slot>|<next slot>'.
  function seqRels() {
    const out = [];
    // a journey that is part of a longer one, or has a part, keeps its own From / Until in order as well
    const linked = new Set();
    for (const m of Store.markers()) for (const f of m.facts || []) if (f.partOf) { linked.add(f.id); linked.add(f.partOf.factId); }
    for (const m of Store.markers()) for (const f of m.facts || []) {
      const t = Store.factType(f.typeId), stops = Store.stopsOf(f);
      if (!t || !t.journey || t.hasDate === false || !(stops.length || (linked.has(f.id) && t.hasEnd))) continue;
      const chain = ['fact:' + f.id];
      for (const s of stops) chain.push('fact:' + s.id, 'fact:' + s.id + ':end');
      if (t.hasEnd) chain.push('fact:' + f.id + ':end');
      for (let i = 1; i < chain.length; i++) out.push({ id: 'seq|' + m.id + '|' + chain[i - 1] + '|' + chain[i], from: { kind: 'marker', id: m.id, slot: chain[i - 1] }, to: { kind: 'marker', id: m.id, slot: chain[i] }, part: 'min', years: 0, months: 0, days: 0 });
    }
    return out;
  }
  // A short journey marked "Part of" a longer one (fact.partOf) shares dates with it: Facts.partLinks says which
  // of its dates are the same moment as a date of the longer journey, and which must only fall inside it. "The
  // same moment" is two limits, one each way, so dates that disagree close a window and show as a conflict; the
  // app does not pick a side. Ids are 'part|same|<m1>|<slot1>|<m2>|<slot2>' or 'part|in|…': slot2 is not before slot1.
  function partRels() {
    const out = [];
    const ref = (id, slot) => ({ kind: 'marker', id, slot });
    const add = (kind, m1, s1, m2, s2) => out.push({ id: ['part', kind, m1, s1, m2, s2].join('|'), from: ref(m1, s1), to: ref(m2, s2), part: 'min', years: 0, months: 0, days: 0 });
    for (const m of Store.markers()) for (const f of m.facts || []) {
      if (!f.partOf) continue;
      const lm = Store.marker(f.partOf.markerId), lf = lm && (lm.facts || []).find(x => x.id === f.partOf.factId);
      if (!lf) continue;
      for (const x of Facts.partLinks(f, Store.factType(f.typeId), lf, Store.factType(lf.typeId))) {
        if (x.same) { add('same', m.id, x.a, lm.id, x.b); add('same', lm.id, x.b, m.id, x.a); }
        else if (x.dir === 'after') add('in', lm.id, x.b, m.id, x.a);
        else add('in', m.id, x.a, lm.id, x.b);
      }
    }
    return out;
  }
  const isAuto = id => /^(seq|part|life|kin)\|/.test(String(id)); // a limit the app keeps by itself (not a tie the user made, so it cannot be overruled)
  const isLife = id => /^(life|kin)\|/.test(String(id));
  const isOwn = id => /^own\|/.test(String(id));
  // the words in front of one of the app's own limits in the conflicts panel
  const autoLead = id => (isPart(id) ? 'Part of a longer journey: ' : /^kin\|/.test(String(id)) ? 'Parent and child: ' : isLife(id) ? 'Within a lifetime: ' : 'The order of the journey: ');
  const isPart = id => /^part\|/.test(String(id));
  // "arriving at Haran is not before the journey's From"; for a part of a longer journey the two dates are named in full
  function autoText(id) {
    const p = String(id).split('|');
    if (p[0] === 'life' || p[0] === 'kin') return `${Store.slotLabel({ kind: 'marker', id: p[3], slot: p[4] })} is not before ${Store.slotLabel({ kind: 'marker', id: p[1], slot: p[2] })}`;
    if (p[0] === 'part') {
      const A = Store.slotLabel({ kind: 'marker', id: p[2], slot: p[3] }), B = Store.slotLabel({ kind: 'marker', id: p[4], slot: p[5] });
      return p[1] === 'same' ? `${B} and ${A} are the same moment` : `${B} is not before ${A}`;
    }
    const [, mid, a, b] = p;
    return `${Store.slotShort({ kind: 'marker', id: mid, slot: b })} is not before ${Store.slotShort({ kind: 'marker', id: mid, slot: a })}`;
  }
  function windows(given, likely) {
    const auto = seqRels().concat(partRels());
    const rels = given.concat(ownRels(given), auto, lifeRels(given));
    const W = new Map();
    const node = k => { if (!W.has(k)) { const b = baseOf(k, likely); W.set(k, { E: b.min || '', L: b.max || '', eBy: null, lBy: null }); } return W.get(k); };
    const raise = (n, cand, by) => { if (cand && (!n.E || D(cand) > D(n.E))) { n.E = cand; n.eBy = by; return true; } return false; };
    const lower = (n, cand, by) => { if (cand && (!n.L || D(cand, 1) < D(n.L, 1))) { n.L = cand; n.lBy = by; return true; } return false; };
    const cap = 12 + rels.length * 4;
    let looping = false;
    for (let pass = 0; rels.length; pass++) {
      let moved = false;
      for (const r of rels) {
        const a = node(key(r.from)), b = node(key(r.to)), o = offOf(r);
        if (r.part === 'min') { // b is not before a + o, so a is not after b - o
          if (raise(b, a.E && Dates.addOffset(a.E, o), { rel: r.id, back: false })) moved = true;
          if (lower(a, b.L && Dates.addOffset(b.L, neg(o)), { rel: r.id, back: true })) moved = true;
        } else {                // b is not after a + o, so a is not before b - o
          if (lower(b, a.L && Dates.addOffset(a.L, o), { rel: r.id, back: false })) moved = true;
          if (raise(a, b.E && Dates.addOffset(b.E, neg(o)), { rel: r.id, back: true })) moved = true;
        }
      }
      if (!moved) break;
      if (pass > cap) { looping = true; break; } // limits that chase each other round a loop and never settle
    }
    return { W, looping, auto };
  }
  let winInfo = new Map();
  const closed = n => !!(n.E && n.L && D(n.E) > D(n.L, 1) && !Dates.sameDate(n.E, n.L));
  function solveWindows() {
    const rels = limitRels();
    const { W, looping, auto } = windows(rels);
    winInfo = W;
    const tied = new Set(rels.concat(auto).flatMap(r => [key(r.from), key(r.to)])); // dates that a tie really touches, and the dates of a journey with stops
    tiedKeys = tied;
    const out = new Map(), shut = [];
    for (const [k, n] of W) {
      if (closed(n)) { n.conflict = true; shut.push([k, n]); continue; }
      // a date that is only in the picture through its own from / until pair shows nothing new
      if (tied.has(k)) out.set(k, { min: n.eBy ? n.E : '', max: n.lBy ? n.L : '' });
    }
    const list = shutEntries(shut, false);
    if (looping && !list.length) list.push({ key: 'win:loop', window: true, loop: true, rels: rels.map(r => r.id), slots: [] });
    // Second pass: the same limits over the most likely dates alone. Dates that fit only because their ranges are
    // wide (a child typed 50 years before its father, each give or take 100) are reported too, as a softer entry.
    if (!looping) {
      const N = windows(rels, true);
      if (!N.looping) list.push(...shutEntries([...N.W].filter(([k, n]) => closed(n) && !(W.get(k) && W.get(k).conflict)), true));
    }
    return { out, conflicts: list };
  }
  // One broken limit closes the window of every date along its path. The dates where a tie arrives head-on are
  // the ones to show; the others (reached by working backwards) only repeat them. And of those, a date neither of
  // whose ends was reached by working backwards is where the limits really meet (along a journey's chain of stops
  // every date between the two that disagree would otherwise be listed). `soft`: found on the second pass.
  function shutEntries(shut, soft) {
    const headOn = shut.filter(([, n]) => (n.eBy && !n.eBy.back) || (n.lBy && !n.lBy.back));
    const meet = headOn.filter(([, n]) => !(n.eBy && n.eBy.back) && !(n.lBy && n.lBy.back));
    const bad = new Map();
    for (const [k, n] of (meet.length ? meet : headOn.length ? headOn : shut)) { // one entry per pair of governing ties
      const ids = [n.eBy && n.eBy.rel, n.lBy && n.lBy.rel].filter(Boolean).sort();
      const ck = ids.join('+') || k;
      if (!bad.has(ck)) bad.set(ck, { key: (soft ? 'soft:' : 'win:') + ck, window: true, soft: !!soft, rels: ids, slots: [] });
      bad.get(ck).slots.push({ ref: Store.parseRefKey(k), E: n.E, L: n.L, eOwn: !n.eBy, lOwn: !n.lBy });
    }
    return [...bad.values()];
  }
  let tiedKeys = new Set(); // the dates whose windows are shown: a tie touches them, or they belong to a journey's chain
  // Everything known about the window of one date, for the editor and the badges.
  function windowOf(ref) {
    const k = key(ref), n0 = winInfo.get(k);
    // a date that no tie touches says nothing about the lifetime limits that happen to bound it
    const quiet = by => !!by && isLife(by.rel) && !tiedKeys.has(k);
    const n = n0 ? { E: quiet(n0.eBy) ? '' : n0.E, L: quiet(n0.lBy) ? '' : n0.L, eBy: quiet(n0.eBy) ? null : n0.eBy, lBy: quiet(n0.lBy) ? null : n0.lBy, conflict: n0.conflict } : null;
    const ties = Store.relationsOfRef(ref).filter(r => r.status === 'active' && isLimit(r));
    return { E: n ? n.E : '', L: n ? n.L : '', eBy: n ? n.eBy : null, lBy: n ? n.lBy : null, conflict: !!(n && n.conflict),
      auto: !!(n && ((n.eBy && isAuto(n.eBy.rel)) || (n.lBy && isAuto(n.lBy.rel)))), // an end is set by the order of a journey's stops
      minTies: ties.filter(r => (r.part === 'min') === Store.sameRef(r.to, ref)), maxTies: ties.filter(r => (r.part === 'max') === Store.sameRef(r.to, ref)) };
  }
  const lenWords = o => [[o.years, 'year'], [o.months, 'month'], [o.days, 'day']].filter(([n]) => n).map(([n, w]) => `${Math.abs(n)} ${w}${Math.abs(n) === 1 ? '' : 's'}`).join(' ');
  const isNeg = o => (o.years || o.months || o.days) < 0;
  // "not before 13 years after Sarai · Born"
  function limitText(part, o, otherLabel) {
    const len = lenWords(o);
    return `not ${part === 'min' ? 'before' : 'after'} ${len ? `${len} ${isNeg(o) ? 'before' : 'after'} ` : ''}${otherLabel}`;
  }
  // The tie that governs an end, said from that date's side.
  function governText(by) {
    if (by && String(by.rel).startsWith('own|')) return by.back ? 'its own until date' : 'its own from date';
    if (by && isLife(by.rel)) { // the lifetime rule, or parent and child
      const p = String(by.rel).split('|');
      return `not ${by.back ? 'after' : 'before'} ${Store.slotLabel({ kind: 'marker', id: by.back ? p[3] : p[1], slot: by.back ? p[4] : p[2] })} (${p[0] === 'kin' ? 'a child is not born before its parent' : 'the lifetime rule'})`;
    }
    if (by && isPart(by.rel)) { // a date shared with the journey this one is part of (or with a part of this one)
      const p = String(by.rel).split('|');
      return `not ${by.back ? 'after' : 'before'} ${Store.slotLabel({ kind: 'marker', id: by.back ? p[4] : p[2], slot: by.back ? p[5] : p[3] })} (${p[1] === 'same' ? 'the same moment in the journey it is part of' : 'part of a longer journey'})`;
    }
    if (by && isAuto(by.rel)) { // the order of a journey's stops
      const [, mid, a, b] = String(by.rel).split('|');
      return `not ${by.back ? 'after' : 'before'} ${Store.slotShort({ kind: 'marker', id: mid, slot: by.back ? b : a })} (the order of the journey)`;
    }
    const r = by && Store.relation(by.rel);
    if (!r) return '';
    return by.back ? `${describeRelation(r)} (worked backwards)` : limitText(r.part, offOf(r), Store.slotLabel(r.from));
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
    if (isLimit(r)) return `${Store.slotLabel(r.to)}: ${limitText(r.part, offOf(r), Store.slotLabel(r.from))}`;
    const flip = fromViewOf && Store.sameRef(r.from, fromViewOf);
    const left = flip ? r.from : r.to, right = flip ? r.to : r.from, sign = flip ? -1 : +1;
    return `${Store.slotLabel(left)} = ${Store.slotLabel(right)} ${offsetText(r, sign)}`;
  }
  const slotState = ref => ({
    value: Store.slotValue(ref), range: Store.slotRange(ref), pinned: Store.isPinned(ref), undetermined: Store.isUndetermined(ref),
    derived: Store.derivedInfo(ref), conflict: conflicts.find(c => (c.window ? c.slots.some(x => Store.sameRef(x.ref, ref)) : Store.sameRef(c.ref, ref))) || null,
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
    const w = windowOf(ref);
    if (!s.conflict && (w.eBy || w.lBy)) out += ` <span class="rel-badge chain" title="${esc([w.eBy ? 'Earliest: ' + governText(w.eBy) : '', w.lBy ? 'Latest: ' + governText(w.lBy) : ''].filter(Boolean).join(' · '))}">⛓</span>`;
    return out;
  }

  // ---------- tie dialog ----------
  // One dialog adds any number of ties to one date. Each row ties a part of the date (its earliest end, the date
  // itself, or its latest end) to another date: on it, or a length of time after or before it. The source, note
  // and confidence are typed once and saved on every row; a row may carry its own verse.
  const whole = v => Math.max(0, Math.trunc(+v) || 0);
  function rowOffset(row) { // the row's length of time as a signed offset from the other date
    if (row.where === 'on') return { years: 0, months: 0, days: 0 };
    const sgn = row.where === 'before' ? -1 : 1;
    return { years: sgn * whole(row.y), months: sgn * whole(row.m), days: sgn * whole(row.d) };
  }
  function readsAs(row) {
    const other = row.slotKey ? Store.slotLabel(Store.parseRefKey(row.slotKey)) : 'the other date';
    const o = rowOffset(row), len = lenWords(o);
    if (row.part !== 'date') return limitText(row.part, o, other);
    if (!len) return `the same date as ${other}`;
    const give = row.approx ? ` (give or take: ${[lenWords({ years: whole(row.lo[0]), months: whole(row.lo[1]), days: whole(row.lo[2]) }) || '…', lenWords({ years: whole(row.hi[0]), months: whole(row.hi[1]), days: whole(row.hi[2]) }) || '…'].join(' to ')})` : '';
    return `${len} ${row.where} ${other}${give}`;
  }
  function rowRelation(thisRef, row, shared) {
    const o = rowOffset(row);
    const rel = { from: Store.parseRefKey(row.slotKey), to: thisRef, part: row.part, years: o.years, months: o.months, days: o.days, min: null, max: null,
      sourceId: shared.sourceId || null, page: (row.verse || '').trim() || shared.page || '', note: shared.note || '', confidence: shared.confidence || '', reason: shared.reason || '' };
    if (row.part === 'date' && row.approx && row.where !== 'on') { // a give-or-take length: smallest and largest it could be
      const sgn = row.where === 'before' ? -1 : 1;
      const has = t => t.some(v => v !== '' && v != null);
      const days = t => whole(t[0]) * 365.25 + whole(t[1]) * 30.4375 + whole(t[2]);
      if (!o.years && !o.months && !o.days && (has(row.lo) || has(row.hi))) { // most likely length left blank: the middle of the range
        const mid = fromDays(has(row.lo) && has(row.hi) ? (days(row.lo) + days(row.hi)) / 2 : days(has(row.lo) ? row.lo : row.hi));
        rel.years = sgn * mid.years; rel.months = sgn * mid.months; rel.days = sgn * mid.days;
      }
      const off = t => ({ years: sgn * whole(t[0]), months: sgn * whole(t[1]), days: sgn * whole(t[2]) });
      let min = has(row.lo) ? off(row.lo) : null, max = has(row.hi) ? off(row.hi) : null;
      if (sgn < 0) { const t = min; min = max; max = t; } // "before": the larger length is the earlier date
      rel.min = min; rel.max = max;
    }
    return rel;
  }
  // The dialog row a saved tie came from, to edit it: the reverse of rowRelation.
  function rowOf(r) {
    const abs = o => [Math.abs(o.years) || '', Math.abs(o.months) || '', Math.abs(o.days) || ''];
    const sgnOf = o => { const n = o ? toDays(o) : 0; return n < 0 ? -1 : n > 0 ? 1 : 0; };
    const o = offOf(r), range = !isLimit(r) && !!(r.min || r.max);
    const sgn = sgnOf(o) || sgnOf(r.max) || sgnOf(r.min);
    const a = abs(o);
    const row = { part: r.part, where: sgn < 0 ? 'before' : (sgn > 0 || range) ? 'after' : 'on', y: a[0], m: a[1], d: a[2], markerId: r.from.id, slotKey: key(r.from), verse: '', approx: range, lo: ['', '', ''], hi: ['', '', ''] };
    if (range) { const lo = sgn < 0 ? r.max : r.min, hi = sgn < 0 ? r.min : r.max; if (lo) row.lo = abs(lo); if (hi) row.hi = abs(hi); } // "before": the larger length is the earlier date
    return row;
  }
  // What the rows would give, worked out before anything is saved. `skipId`: the tie being edited, left out as it stands.
  function preview(thisRef, rows, skipId) {
    const ready = rows.filter(r => r.slotKey);
    const bits = [];
    const dateRow = ready.find(r => r.part === 'date');
    if (dateRow) {
      const v = Store.slotValue(Store.parseRefKey(dateRow.slotKey));
      const d = v ? Dates.addOffset(v, offOf(rowRelation(thisRef, dateRow, {}))) : null;
      bits.push(d ? Dates.formatInput(d) : 'a date, once the other date is known');
    }
    const extra = ready.filter(r => r.part !== 'date').map((r, i) => Object.assign(rowRelation(thisRef, r, {}), { id: 'new' + i }));
    if (extra.length || !dateRow) {
      const n = windows(limitRels().filter(r => r.id !== skipId).concat(extra)).W.get(key(thisRef));
      if (n && closed(n)) bits.push(`no room: not before ${Dates.formatInput(n.E)} yet not after ${Dates.formatInput(n.L)}`);
      else if (n && !dateRow) bits.push(Facts.whenText(false, '', '', '', n.E, n.L) || 'no limit yet (the other date is not known)');
      else if (n && (n.E || n.L)) bits.push('within ' + Facts.whenText(false, '', '', '', n.E, n.L));
      else if (!dateRow) bits.push('nothing yet');
    }
    return bits.join(' · ');
  }
  // Open the dialog for one date. `part` is the part the first row starts on ('date', 'min' or 'max').
  // `edit` (a time gap's id) opens it filled in with that time gap instead: the first row is the saved tie, the
  // date it belongs to can be changed at the top, and rows added with "+ Add another tie" are saved as new ties.
  function pick(thisRef, { onDone, part = 'date', edit = null } = {}) {
    const editing = edit ? Store.relation(edit) : null;
    if (edit && !(editing && editing.from && editing.to)) { UI.toast('That time gap is no longer there', 'error'); return; }
    if (editing) thisRef = editing.to;
    const newRow = p => ({ part: p, where: p === 'date' ? 'after' : 'on', y: '', m: '', d: '', markerId: thisRef.id, slotKey: '', verse: '', approx: false, lo: ['', '', ''], hi: ['', '', ''] });
    const rows = [editing ? rowOf(editing) : newRow(part)];
    const shared = editing ? { sourceId: editing.sourceId || null, page: editing.page || '', note: editing.note || '', confidence: editing.confidence || '', reason: editing.reason || '' }
      : { sourceId: null, page: '', note: '', confidence: '', reason: '' };
    const list = h('div', { class: 'tie-rows' }), result = h('div', { class: 'tie-result' });
    const saveBtn = h('button', { class: 'primary', onclick: () => save() }, 'Save tie');
    // editing: which date the time gap belongs to (a marker and one of its dates), in case the wrong one was chosen
    const thisBox = h('div', { class: 'tie-this' });
    function drawThis() {
      thisBox.innerHTML = '';
      if (!editing) return;
      const slots = Store.slotsOfMarker(thisRef.id);
      const slotSel = h('select', { title: 'Which of that marker\'s dates this time gap sets' }, ...slots.map(x => h('option', { value: Store.refKey(x.ref) }, `${x.label}${Store.slotValue(x.ref) ? ' · ' + Dates.formatInput(Store.slotValue(x.ref)) : ''}`)));
      slotSel.value = Store.refKey(thisRef);
      slotSel.addEventListener('change', () => { thisRef = Store.parseRefKey(slotSel.value); draw(); });
      const markerSel = UI.markerSelect({ value: thisRef.id, placeholder: 'Which marker…', onChange: v => {
        if (!v) return;
        const first = Store.slotsOfMarker(v)[0];
        if (!first) { UI.toast('That marker has no dated fact to attach a time gap to', 'error'); drawThis(); return; }
        thisRef = first.ref; drawThis(); draw();
      } });
      thisBox.append(h('div', { class: 'side-title' }, 'The date this time gap belongs to'),
        h('div', { class: 'ed-row' }, h('div', { class: 'field' }, 'Marker', markerSel), h('label', { class: 'field' }, 'Which of its dates', slotSel)));
    }
    const slotsFor = row => (row.markerId ? Store.slotsOfMarker(row.markerId).filter(x => !Store.sameRef(x.ref, thisRef)) : []);
    // the words beside each row and the result line follow the typing, without rebuilding the boxes being typed in
    function refresh() {
      rows.forEach((row, i) => { const el = list.querySelector(`[data-reads="${i}"]`); if (el) el.textContent = 'Reads as: ' + readsAs(row); });
      result.textContent = 'Result: ' + preview(thisRef, rows, editing ? editing.id : null);
      saveBtn.textContent = editing ? (rows.length > 1 ? `Save changes and ${rows.length - 1} new tie${rows.length > 2 ? 's' : ''}` : 'Save changes') : rows.length > 1 ? `Save ${rows.length} ties` : 'Save tie';
    }
    const num = (get, set, label) => { const el = h('input', { type: 'number', min: 0, inputmode: 'numeric', class: 'tie-num', value: get(), 'aria-label': label, title: label }); el.addEventListener('input', () => { set(el.value); refresh(); }); return el; };
    const lenBoxes = (get, set) => h('span', { class: 'tie-len' },
      num(() => get(0), v => set(0, v), 'years'), h('span', { class: 'muted' }, 'y'), num(() => get(1), v => set(1, v), 'months'), h('span', { class: 'muted' }, 'm'), num(() => get(2), v => set(2, v), 'days'), h('span', { class: 'muted' }, 'd'));
    function draw() {
      list.innerHTML = '';
      rows.forEach((row, i) => {
        const partSel = UI.select([['min', 'Earliest'], ['date', 'The date'], ['max', 'Latest']], row.part, { class: 'tie-part', title: 'Which part of this date the tie sets: the earliest it can be, the date itself, or the latest it can be' });
        partSel.addEventListener('change', () => { row.part = partSel.value; if (row.part !== 'date') row.approx = false; draw(); });
        const whereSel = UI.select([['on', 'on'], ['after', 'after'], ['before', 'before']], row.where, { class: 'tie-where', title: 'On the other date itself, or a length of time after or before it' });
        whereSel.addEventListener('change', () => { row.where = whereSel.value; draw(); });
        const opts = slotsFor(row);
        if (!opts.some(x => Store.refKey(x.ref) === row.slotKey)) row.slotKey = opts.length ? Store.refKey(opts[0].ref) : '';
        const markerSel = UI.markerSelect({ value: row.markerId, placeholder: 'Other marker…', onChange: v => { row.markerId = v; row.slotKey = ''; draw(); } });
        const slotSel = h('select', { class: 'tie-slot', title: 'Which of that marker\'s dates' },
          ...(opts.length ? opts.map(x => h('option', { value: Store.refKey(x.ref) }, `${x.label}${Store.slotValue(x.ref) ? ' · ' + Dates.formatInput(Store.slotValue(x.ref)) : ''}`))
            : [h('option', { value: '' }, row.markerId ? 'That marker has no other dates' : 'pick a marker first')]));
        slotSel.value = row.slotKey;
        slotSel.addEventListener('change', () => { row.slotKey = slotSel.value; refresh(); });
        const len = row.where === 'on' ? null : lenBoxes(k => row['ymd'[k]], (k, v) => { row['ymd'[k]] = v; });
        const verse = h('input', { type: 'text', class: 'tie-verse', value: row.verse, placeholder: 'verse, if different', title: 'This row\'s own page or verse. Left blank, the one below is used.' });
        verse.addEventListener('input', () => { row.verse = verse.value; });
        const del = rows.length > 1 && !(editing && i === 0) ? h('button', { type: 'button', class: 'small icon', title: 'Remove this row', onclick: () => { rows.splice(i, 1); draw(); } }, '✕') : null; // the time gap being edited is deleted from its list, not here
        let give = null, giveRow = null;
        if (row.part === 'date' && row.where !== 'on') {
          const tick = h('input', { type: 'checkbox', checked: row.approx });
          tick.addEventListener('change', () => { row.approx = tick.checked; draw(); });
          give = h('label', { class: 'tie-give', title: 'The length is not exact: give the smallest and largest it could be' }, tick, ' give or take');
          if (row.approx) giveRow = h('div', { class: 'tie-give-row' },
            h('span', { class: 'muted' }, 'at least'), lenBoxes(k => row.lo[k], (k, v) => { row.lo[k] = v; }),
            h('span', { class: 'muted' }, 'at most'), lenBoxes(k => row.hi[k], (k, v) => { row.hi[k] = v; }),
            h('span', { class: 'muted' }, '(the length above is the most likely; blank = the middle)'));
        }
        list.append(h('div', { class: 'card tie-row' },
          h('div', { class: 'tie-row-top' }, partSel, whereSel, len, give, markerSel, slotSel, verse, del),
          giveRow,
          h('div', { class: 'tie-reads muted', 'data-reads': i })));
      });
      refresh();
    }
    function save() {
      if (rows.some(r => !r.slotKey)) { UI.toast('Pick the other date on every row, or remove the row', 'error'); return; }
      if (editing) { // the first row is the saved time gap, changed in place (it keeps its id and stays overruled if it was)
        Store.updateRelation(editing.id, rowRelation(thisRef, rows[0], shared));
        const more = rows.length > 1 ? Store.addRelations(rows.slice(1).map(r => rowRelation(thisRef, r, shared))) : [];
        m.close();
        onDone && onDone();
        UI.toast(more.length ? `Time gap changed, ${more.length} new tie${more.length > 1 ? 's' : ''} saved` : 'Time gap changed');
        return;
      }
      const saved = Store.addRelations(rows.map(r => rowRelation(thisRef, r, shared)));
      m.close();
      onDone && onDone();
      UI.toast(saved.length === 1 ? 'Tie saved' : `${saved.length} ties saved`);
    }
    const page = h('input', { type: 'text', placeholder: 'page / verse', value: shared.page });
    page.addEventListener('input', () => { shared.page = page.value; });
    const note = h('input', { type: 'text', placeholder: 'e.g. "When Adam had lived 130 years, he fathered Seth"', value: shared.note });
    note.addEventListener('input', () => { shared.note = note.value; });
    const reason = h('input', { type: 'text', placeholder: 'why this grade', value: shared.reason });
    reason.addEventListener('input', () => { shared.reason = reason.value; });
    const body = h('div', { class: 'rel-form' },
      thisBox,
      h('p', { class: 'hint' }, editing ? 'Change whatever is wrong and press Save changes: the date this time gap belongs to (above), the part it sets, on / after / before, the length, the other date, the source and the note. The first row is the time gap you are editing; a row you add is saved as a new tie.'
        : 'Each row ties one part of this date to another date. Earliest means "not before", Latest means "not after", and The date places it exactly. Choose "on" for the other date itself, or "after" / "before" to give a length of time.'),
      list,
      h('div', { class: 'row', style: { margin: '2px 0 12px' } }, h('button', { type: 'button', class: 'small', style: { flex: 'none' }, onclick: () => { rows.push(newRow(rows[rows.length - 1].part)); draw(); } }, '+ Add another tie'), h('span', { class: 'spacer' })),
      h('div', { class: 'side-title' }, 'For all of these'),
      h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Source', UI.sourceSelect({ value: shared.sourceId, onChange: v => { shared.sourceId = v; } })), h('label', { class: 'field' }, 'Page / verse', page)),
      h('label', { class: 'field' }, 'Note (the wording you are relying on)', note),
      h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Confidence (your grade)', UI.confidenceSelect(shared.confidence, v => { shared.confidence = v; })), h('label', { class: 'field' }, 'Reason', reason)),
      result,
      h('div', { class: 'row' }, saveBtn, h('button', { onclick: () => m.close() }, 'Cancel')));
    const m = UI.modal({ title: editing ? 'Edit time gap' : `Ties for ${Store.slotLabel(thisRef)}`, body, width: '820px' });
    drawThis();
    draw();
  }
  // Turn a tie on a date into a limit on an end (for a gap of nothing that was meant as "some time after").
  function convert(relId, part) { Store.updateRelation(relId, { part, min: null, max: null }); }

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
      body.append(h('p', { class: 'hint' }, 'Each entry is either one date that two chains of time gaps place differently (their ranges cannot both be true), or a set of limits that leaves a date no room (its earliest is after its latest). Choose the value to keep (the time gap that produced the other value is kept but marked overruled, so the disagreement stays on record), or mark the date undeterminable.'));
      for (const c of conflicts) {
        if (c.window) { // limits that cannot all be true: name the dates and the ties, and let a tie be set aside
          const card = h('div', { class: 'card' }, h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, c.loop ? 'These limits chase each other round and never settle' : c.soft ? 'The most likely dates are out of order' : 'These cannot all be true'));
          for (const x of c.slots) card.append(h('div', { class: 'rel-cand' },
            h('div', { class: 'grow' }, h('strong', {}, Store.slotLabel(x.ref)), ' ', h('span', { class: 'muted' }, `${c.soft ? 'going by the most likely dates, ' : ''}would have to be not before ${Dates.formatInput(x.E)}${x.eOwn ? ' (its own date)' : ''} and not after ${Dates.formatInput(x.L)}${x.lOwn ? ' (its own date)' : ''}`)),
            h('button', { class: 'small', onclick: () => Editor.open(x.ref.id) }, 'Open marker')));
          for (const rid of c.rels) {
            if (isOwn(rid)) { card.append(h('div', { class: 'rel-cand' }, h('div', { class: 'grow' }, h('span', { class: 'rel-badge chain' }, '⛓ '), 'Its own dates: the Until is not before the From'))); continue; }
            if (isAuto(rid)) { card.append(h('div', { class: 'rel-cand' }, h('div', { class: 'grow' }, h('span', { class: 'rel-badge chain' }, '⛓ '), autoLead(rid) + autoText(rid)))); continue; }
            const r = Store.relation(rid); if (!r) continue;
            card.append(h('div', { class: 'rel-cand' }, h('div', { class: 'grow' }, h('span', { class: 'rel-badge chain' }, '⛓ '), describeRelation(r), r.sourceId && Store.source(r.sourceId) ? h('span', { class: 'muted' }, ` · ${Store.source(r.sourceId).title}${r.page ? ', ' + r.page : ''}`) : null),
              h('button', { class: 'small', title: 'Keep the record but leave it out of the reckoning', onclick: () => { Store.updateRelation(rid, { status: 'overruled' }); render(); } }, 'Overrule this tie'))); }
          card.append(h('p', { class: 'hint' }, c.soft ? 'Each of these dates has a range, and inside the ranges they can still agree. Going by the most likely dates they cannot all be true. Usually one of them was typed where it should have been worked out, or is left over from an earlier time gap. Correct it in its marker.'
            : !c.rels.length ? 'One of these dates was typed outside its own earliest or latest box.'
            : c.rels.every(isOwn) ? 'This fact\'s Until is before its From. Correct one of the two in the marker.'
            : c.rels.some(isLife) && c.rels.every(r => isAuto(r) || isOwn(r)) ? 'These follow from rules the app keeps by itself: a marker\'s facts fall between its Begins and its Ends, whoever takes part in a fact was alive for it, and a child is not born before its parent. Correct the date that is wrong. If the rule does not fit a kind of fact, tick "may fall outside the lifetime" on its fact type (Library → Fact types); the rules themselves are switched in Library → Time gaps.'
            : c.rels.some(isPart) ? 'One of these journeys is marked "Part of" the other, so these dates are the same moment, or one must fall inside the other. The two do not agree. Correct a date in its marker, or clear the "Part of" box on the shorter journey. The app does not choose between them.'
            : c.rels.every(isAuto) ? 'A journey\'s dates run in order: From, then each stop\'s Arrived and Left, then Until. One of these dates is out of that order. Correct it in the marker, or put the places in the order they were reached.'
            : 'Either a date here is wrong, or one of these ties is. Correct the date in its marker, or overrule the tie that does not hold.'));
          body.append(card);
          continue;
        }
        const card = h('div', { class: 'card' }, h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, Store.slotLabel(c.ref), ' ', h('span', { class: 'muted' }, `(currently ${Dates.formatInput(c.chosen)})`)));
        for (const cand of c.candidates) {
          card.append(h('div', { class: 'rel-cand' },
            h('div', { class: 'grow' }, h('strong', {}, Dates.formatRangeFull(cand.value, cand.min, cand.max)), ' ', h('span', { class: 'muted', style: { fontSize: 'calc(12px * var(--fs))' } }, pathText(cand))),
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

  return { init, solve, pick, convert, showConflicts, slotState, windowOf, governText, badgesHTML, describeDerived, describeRelation, agree, conflicts: () => conflicts, undetermined: () => undetermined };
})();
