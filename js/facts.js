/* Facts: "a marker is a list of facts".
 *
 * A fact is one statement about a marker: what happened (its fact type), when (date, optional end date),
 * where (a point, an area or route outline, or "at/inside another marker"), who else was involved
 * (participants, each in a role), details, a note and a source.
 *
 * Fact types are user-editable records. Each says which parts a fact has and what it implies:
 *   begins   – the fact's date is when the marker begins (Born, Founded, Took place)
 *   ends     – the fact's (end) date is when the marker ends (Died, Destroyed)
 *   roles    – each role maps a participant to a tie: { id, name, tieTypeId, direction }
 *              direction 'other-to-this': participant → this marker (Father: Adam → Seth)
 *                        'this-to-other': this marker → participant (Child: Adam → Seth)
 *   placeFrom – a role whose participant's location is used as this fact's "where" (Present at → the event)
 *
 * Begins/Ends dates, locations over time and ties are DERIVED from facts (Facts.derive), so the map, the
 * graphs and the time-gap solver keep working on marker.start/end/moves and Store.links().
 */
window.Facts = (() => {
  // ---------- seeded fact types ----------
  const TIE_DEFAULTS = {
    'Parent of': { directed: true, fromLabel: 'parent', toLabel: 'child', topSide: 'from', color: '#e67e22' },
    'Spouse of': { directed: false, color: '#e84393' },
    'Founded by': { directed: true, fromLabel: 'founded', toLabel: 'founder', topSide: 'to', color: '#27ae60' },
    'Ruled by': { directed: true, fromLabel: 'territory', toLabel: 'ruler', topSide: 'to', color: '#c0392b' },
    'Signed by': { directed: true, fromLabel: 'document', toLabel: 'signatory', topSide: 'from', color: '#1abc9c' },
    'Written by': { directed: true, fromLabel: 'document', toLabel: 'author', topSide: 'from', color: '#16a085' },
    'Present at': { directed: true, fromLabel: 'participant', toLabel: 'event', topSide: 'to', color: '#9b59b6' },
    'Member of': { directed: true, fromLabel: 'member', toLabel: 'organization', topSide: 'to', color: '#27ae60' },
  };
  function seeds(tie) {
    const T = (id, name, extra) => Object.assign({ id, name, hasDate: true, hasEnd: false, place: 'any', roles: [], begins: false, ends: false, details: [], placeFrom: null }, extra);
    return [
      T('ft_born', 'Born', { roles: [{ id: 'father', name: 'Father', tieTypeId: tie('Parent of'), direction: 'other-to-this' }, { id: 'mother', name: 'Mother', tieTypeId: tie('Parent of'), direction: 'other-to-this' }], begins: true }),
      T('ft_died', 'Died', { ends: true, details: ['Cause'] }),
      T('ft_located', 'Located at', { hasEnd: true }),
      T('ft_married', 'Married', { roles: [{ id: 'spouse', name: 'Spouse', tieTypeId: tie('Spouse of'), direction: 'this-to-other' }] }),
      T('ft_begins', 'Begins', { begins: true }),
      T('ft_ends', 'Ends', { ends: true }),
      T('ft_took_place', 'Took place', { hasEnd: true, begins: true, ends: true, details: ['Outcome'] }),
      T('ft_founded', 'Founded', { begins: true, roles: [{ id: 'founder', name: 'Founder', tieTypeId: tie('Founded by'), direction: 'this-to-other' }] }),
      T('ft_destroyed', 'Destroyed', { ends: true }),
      T('ft_border', 'Border changed', { place: 'area' }),
      T('ft_ruled_by', 'Ruled by', { hasEnd: true, place: 'none', roles: [{ id: 'ruler', name: 'Ruler', tieTypeId: tie('Ruled by'), direction: 'this-to-other' }] }),
      T('ft_written', 'Written', { begins: true, roles: [{ id: 'author', name: 'Author', tieTypeId: tie('Written by'), direction: 'this-to-other' }] }),
      T('ft_adopted', 'Adopted', { begins: true }),
      T('ft_signed', 'Signed', { roles: [{ id: 'document', name: 'Document', tieTypeId: tie('Signed by'), direction: 'other-to-this' }] }),
      T('ft_present', 'Present at', { place: 'none', roles: [{ id: 'event', name: 'Event', tieTypeId: tie('Present at'), direction: 'this-to-other' }], placeFrom: 'event' }),
      T('ft_member', 'Member of', { hasEnd: true, place: 'none', roles: [{ id: 'org', name: 'Organization', tieTypeId: tie('Member of'), direction: 'this-to-other' }] }),
      T('ft_note', 'Note', { hasDate: false, place: 'none' }),
    ];
  }
  // Which seeded types a category offers first, by the category's name (a fallback when it lists none).
  const DEFAULTS_BY_CATEGORY = {
    person: ['ft_born', 'ft_died', 'ft_located', 'ft_married', 'ft_present', 'ft_member', 'ft_signed', 'ft_note'],
    event: ['ft_took_place', 'ft_located', 'ft_note'],
    document: ['ft_written', 'ft_adopted', 'ft_located', 'ft_note'],
    organization: ['ft_founded', 'ft_destroyed', 'ft_located', 'ft_ruled_by', 'ft_note'],
    territory: ['ft_founded', 'ft_border', 'ft_ruled_by', 'ft_destroyed', 'ft_note'],
    place: ['ft_founded', 'ft_located', 'ft_destroyed', 'ft_note'],
    route: ['ft_located', 'ft_begins', 'ft_ends', 'ft_note'],
  };

  // Make sure the seeded fact types (and the tie types they rely on) exist in a data set. Mutates d.
  function ensureSeeds(d, uid) {
    const dead = new Set((d.deleted || []).filter(t => t.coll === 'factTypes' || t.coll === 'linkTypes').map(t => t.coll + ':' + t.id));
    const tie = name => {
      let t = d.linkTypes.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!t) {
        const id = 'lt_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (dead.has('linkTypes:' + id)) return id;
        t = Object.assign({ id, name, color: '#999999', directed: false, fromLabel: '', toLabel: '', topSide: 'from', updatedAt: 0 }, TIE_DEFAULTS[name] || {});
        d.linkTypes.push(t);
      }
      return t.id;
    };
    for (const s of seeds(tie)) {
      if (d.factTypes.some(f => f.id === s.id) || dead.has('factTypes:' + s.id)) continue;
      d.factTypes.push(Object.assign({ updatedAt: 0 }, s));
    }
  }

  // ---------- conversion from the version-2 layout (Begins/Ends, positions, ties) ----------
  function migrateV2(d) {
    const byName = n => d.factTypes.find(f => f.name.toLowerCase() === String(n || '').toLowerCase());
    const typeForLabel = (label, fallback) => (byName(label) || {}).id || fallback;
    // A tie becomes a fact on its "from" marker. Reuse a seeded fact type when one has exactly that single role
    // (Member of → ft_member, Spouse of → ft_married, Present at → ft_present); otherwise make a type named after the tie.
    const tieFactType = lt => {
      const seeded = d.factTypes.find(f => f.roles.length === 1 && f.roles[0].tieTypeId === lt.id && f.roles[0].direction === 'this-to-other');
      if (seeded) return { typeId: seeded.id, roleId: seeded.roles[0].id };
      const id = 'ft_tie_' + lt.id;
      let ft = d.factTypes.find(f => f.id === id);
      if (!ft) {
        ft = { id, name: lt.name, hasDate: true, hasEnd: true, place: 'none', begins: false, ends: false, details: [], placeFrom: null, updatedAt: 0,
          roles: [{ id: 'other', name: lt.toLabel || (lt.directed ? 'other' : 'with'), tieTypeId: lt.id, direction: 'this-to-other' }] };
        d.factTypes.push(ft);
      }
      return { typeId: ft.id, roleId: 'other' };
    };
    const mapSlot = m => s => {
      if (s === 'start') return 'fact:' + m.id + ':begin';
      if (s === 'end') return 'fact:' + m.id + ':end';
      if (s.startsWith('move:')) return 'fact:' + s.slice(5);
      return s;
    };
    for (const m of d.markers) {
      if (m.facts) continue; // already converted
      m.facts = [];
      if (m.start || m.startLabel) m.facts.push({ id: m.id + ':begin', typeId: typeForLabel(m.startLabel, 'ft_begins'), label: m.startLabel || '', date: m.start || '', dateEnd: '', where: null, placeLabel: '', participants: [], details: {}, note: '', sourceId: null, page: '' });
      if (m.end || m.endLabel) m.facts.push({ id: m.id + ':end', typeId: typeForLabel(m.endLabel, 'ft_ends'), label: m.endLabel || '', date: m.end || '', dateEnd: '', where: null, placeLabel: '', participants: [], details: {}, note: '', sourceId: null, page: '' });
      for (const mv of m.moves || []) {
        const where = mv.coords && mv.coords.length ? { kind: m.kind === 'area' ? 'area' : 'route', coords: mv.coords } : (mv.lat != null && mv.lng != null ? { kind: 'point', lat: mv.lat, lng: mv.lng } : null);
        m.facts.push({ id: mv.id, typeId: m.kind === 'area' ? 'ft_border' : 'ft_located', label: '', date: mv.date || '', dateEnd: '', where, placeLabel: mv.label || '', participants: [], details: {}, note: mv.note || '', sourceId: mv.sourceId || null, page: mv.page || '' });
      }
      const f = mapSlot(m);
      m.pinned = (m.pinned || []).map(f); m.undetermined = (m.undetermined || []).map(f);
      const nd = {}; for (const [k, v] of Object.entries(m.derived || {})) nd[f(k)] = v; m.derived = nd;
    }
    // ties become facts on the "from" marker
    for (const l of d.links || []) {
      const from = d.markers.find(m => m.id === l.fromId), lt = d.linkTypes.find(t => t.id === l.typeId);
      if (!from || !lt || !d.markers.some(m => m.id === l.toId)) continue;
      if (from.facts.some(f => f.id === l.id)) continue;
      const { typeId, roleId } = tieFactType(lt);
      from.facts.push({ id: l.id, typeId, label: l.label || '', date: l.start || '', dateEnd: l.end || '', where: null, placeLabel: '', participants: [{ roleId, markerId: l.toId }], details: {}, note: l.note || '', sourceId: l.sourceId || null, page: l.page || '' });
      (l.pinned || []).forEach(s => from.pinned.push(s === 'start' ? 'fact:' + l.id : 'fact:' + l.id + ':end'));
      (l.undetermined || []).forEach(s => from.undetermined.push(s === 'start' ? 'fact:' + l.id : 'fact:' + l.id + ':end'));
    }
    // time gaps that pointed at old slots
    const remap = ref => {
      if (!ref) return ref;
      if (ref.kind === 'link') {
        const l = (d.links || []).find(x => x.id === ref.id); if (!l) return null;
        return { kind: 'marker', id: l.fromId, slot: ref.slot === 'start' ? 'fact:' + l.id : 'fact:' + l.id + ':end' };
      }
      const m = d.markers.find(x => x.id === ref.id); if (!m) return null;
      return { kind: 'marker', id: ref.id, slot: mapSlot(m)(ref.slot) };
    };
    d.relations = (d.relations || []).map(r => Object.assign({}, r, { from: remap(r.from), to: remap(r.to) })).filter(r => r.from && r.to);
    d.links = [];
    d.version = 3;
  }

  // ---------- derivation ----------
  const typeOf = (d, f) => d.factTypes.find(t => t.id === f.typeId) || null;
  const factLabel = (d, f) => f.label || (typeOf(d, f) || {}).name || 'Fact';
  const dayOf = s => (s ? Dates.toDays(s) : null);
  // Effective dates of a fact: the most-likely date (typed, or the midpoint of earliest/latest) plus its range.
  function when(f) {
    const date = f.date || Dates.midpoint(f.dateMin, f.dateMax) || '';
    const dateEnd = f.dateEnd || Dates.midpoint(f.dateEndMin, f.dateEndMax) || '';
    return { date, min: f.dateMin || date, max: f.dateMax || date, dateEnd, endMin: f.dateEndMin || dateEnd, endMax: f.dateEndMax || dateEnd,
      approx: !!(f.dateMin && f.dateMax && f.dateMin !== f.dateMax), approxEnd: !!(f.dateEndMin && f.dateEndMax && f.dateEndMin !== f.dateEndMax) };
  }

  // Fill marker.start/startLabel/end/endLabel/moves and d.links from every marker's facts.
  function derive(d) {
    const links = [];
    for (const m of d.markers) {
      const facts = m.facts || [];
      const W = new Map(facts.map(f => [f.id, when(f)]));
      const dated = facts.filter(f => W.get(f.id).date && dayOf(W.get(f.id).date) != null);
      const begins = dated.filter(f => (typeOf(d, f) || {}).begins).sort((a, b) => dayOf(W.get(a.id).date) - dayOf(W.get(b.id).date));
      const endVal = f => { const t = typeOf(d, f), w = W.get(f.id); return t && t.hasEnd ? (w.dateEnd || w.date) : w.date; };
      const endRange = f => { const t = typeOf(d, f), w = W.get(f.id); return t && t.hasEnd && w.dateEnd ? { min: w.endMin, max: w.endMax } : { min: w.min, max: w.max }; };
      const endsList = facts.filter(f => { const t = typeOf(d, f); if (!t || !t.ends) return false; const v = endVal(f); return v && dayOf(v) != null; });
      endsList.sort((a, b) => dayOf(endVal(b)) - dayOf(endVal(a)));
      const b = begins[0] || facts.find(f => (typeOf(d, f) || {}).begins) || null;
      const e = endsList[0] || facts.find(f => (typeOf(d, f) || {}).ends) || null;
      m.start = b ? (W.get(b.id).date || '') : '';
      m.startMin = b ? (W.get(b.id).min || '') : ''; m.startMax = b ? (W.get(b.id).max || '') : '';
      m.startLabel = b ? factLabel(d, b) : '';
      m.end = e ? (endVal(e) || '') : '';
      m.endMin = e ? (endRange(e).min || '') : ''; m.endMax = e ? (endRange(e).max || '') : '';
      m.endLabel = e ? factLabel(d, e) : '';
      m.moves = [];
      for (const f of facts) {
        const t = typeOf(d, f);
        let where = f.where;
        if (!where && t && t.placeFrom) { const p = (f.participants || []).find(x => x.roleId === t.placeFrom); if (p) where = { kind: 'marker', markerId: p.markerId }; }
        if (!where) continue;
        const w = W.get(f.id);
        const mv = { id: f.id, date: w.date, dateMin: w.min, dateMax: w.max, dateEnd: t && t.hasEnd ? w.dateEnd : '', dateEndMin: t && t.hasEnd ? w.endMin : '', dateEndMax: t && t.hasEnd ? w.endMax : '',
          lat: null, lng: null, coords: null, atMarkerId: null, label: f.placeLabel || '', note: f.note || '', sourceId: f.sourceId || null, page: f.page || '', factLabel: factLabel(d, f) };
        if (where.kind === 'point') { mv.lat = where.lat; mv.lng = where.lng; }
        else if (where.kind === 'area' || where.kind === 'route') { mv.coords = where.coords; mv.extent = where.extent || null; mv.rough = where.rough || []; mv.extentRough = where.extentRough || []; }
        else if (where.kind === 'marker') { mv.atMarkerId = where.markerId; if (!mv.label) { const o = d.markers.find(x => x.id === where.markerId); mv.label = o ? o.name : ''; } }
        else continue;
        m.moves.push(mv);
      }
      m.moves.sort((a, b) => (dayOf(a.date) ?? -Infinity) - (dayOf(b.date) ?? -Infinity));
      for (const f of facts) {
        const t = typeOf(d, f); if (!t) continue;
        for (const p of f.participants || []) {
          const role = t.roles.find(r => r.id === p.roleId); if (!role || !role.tieTypeId || !p.markerId) continue;
          if (!d.markers.some(x => x.id === p.markerId) || !d.linkTypes.some(x => x.id === role.tieTypeId)) continue;
          const toOther = role.direction !== 'other-to-this';
          const w = W.get(f.id);
          links.push({ id: `${f.id}|${role.id}|${p.markerId}`, typeId: role.tieTypeId, fromId: toOther ? m.id : p.markerId, toId: toOther ? p.markerId : m.id,
            label: f.label || '', start: w.date || '', startMin: w.min || '', startMax: w.max || '', end: t.hasEnd ? (w.dateEnd || '') : '', endMin: t.hasEnd ? (w.endMin || '') : '', endMax: t.hasEnd ? (w.endMax || '') : '',
            note: f.note || '', sourceId: f.sourceId || null, page: f.page || '', factId: f.id, ownerId: m.id, roleName: role.name });
        }
      }
    }
    d.links = links;
  }

  function defaultTypeIdsFor(category) {
    if (!category) return [];
    if (category.factTypeIds && category.factTypeIds.length) return category.factTypeIds;
    const key = Object.keys(DEFAULTS_BY_CATEGORY).find(k => category.name.toLowerCase().includes(k));
    return key ? DEFAULTS_BY_CATEGORY[key] : [];
  }

  return { ensureSeeds, migrateV2, derive, when, factLabel, defaultTypeIdsFor, TIE_DEFAULTS };
})();
