/* Marker editor. On a PC (wide screen, mouse, E-ink mode off: body.ed-side, set by app.js) it is a drawer at the
 * right-hand side and the tab stays visible beside it. On a tablet it is its own full-screen view, and while the
 * map is needed (placing a point, drawing, looking at a position) the view is parked: hidden with the work kept,
 * and it comes back by itself when the map step ends, or from the "Back to editing" button.
 * Marker editor, as it was first described: a right-hand drawer. Edits a draft copy of the marker (name, shape, facts, fields, images,
 * citations) and saves it in one go. Time gaps are saved immediately because they join two markers. */
window.Editor = (() => {
  const { h, esc } = UI;
  let drawer, draft = null, id = null, isNew = false;
  let openFacts = new Set(); // fact ids whose full card is open (the rest show as one summary line)
  let savedSnapshot = '';    // the draft as last opened or saved, to know whether closing would lose anything
  const CALC = ['calcMin', 'calcMax', 'calcEndMin', 'calcEndMax']; // windows worked out from ties: the solver's, not the editor's
  const snapshot = () => JSON.stringify(draft, (k, v) => (CALC.includes(k) ? undefined : v));
  const isDirty = () => !!draft && snapshot() !== savedSnapshot;
  // An unsaved edit is kept in this browser as it is typed, so that it survives the app being stopped in the
  // background. It is removed as soon as the marker is saved or the editor is closed.
  const DRAFT_KEY = 'chronomap.draft';
  let pendingDraft = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } })(); // read once, at start-up
  let draftTimer = null;
  function persistDraft() {
    clearTimeout(draftTimer); draftTimer = null;
    if (pendingDraft) return; // start-up has not yet decided what to do with the one found
    try {
      if (draft && isDirty()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), id, isNew, draft, openFacts: [...openFacts] }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* ignore */ }
  }
  const persistSoon = () => { if (!draftTimer) draftTimer = setTimeout(persistDraft, 800); };
  // Start-up: put back the edit that was open when the app last stopped.
  function resume() {
    const sv = pendingDraft; pendingDraft = null;
    if (!sv || !sv.draft || draft) { persistDraft(); return false; }
    if (!sv.isNew && !Store.marker(sv.id)) { persistDraft(); return false; } // the marker has since been deleted
    id = sv.id; isNew = !!sv.isNew; openFacts = new Set(sv.openFacts || []);
    if (isNew) savedSnapshot = '';
    else { draft = tidy(JSON.parse(JSON.stringify(Store.marker(id)))); savedSnapshot = snapshot(); }
    draft = tidy(sv.draft);
    parked = false;
    safeRender();
    drawer.classList.remove('hidden');
    syncView();
    UI.toast(`Your unsaved changes to "${draft.name || 'the marker'}" were kept. Press Save to keep them, or Close to drop them.`);
    Log.add('info', 'put back an unsaved marker edit from the session that stopped');
    return true;
  }
  const SECTIONS_KEY = 'chronomap.editorSections';
  function sectionState() { try { return JSON.parse(localStorage.getItem(SECTIONS_KEY)) || {}; } catch (e) { return {}; } }
  function setSectionOpen(key, open) { const st = sectionState(); st[key] = open; try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }

  // ---------- the view: shown, parked, or closed ----------
  let parked = false, unparkTimer = null, pill = null;
  const full = () => !document.body.classList.contains('ed-side'); // full-screen view (tablet) or side drawer (PC)
  const touch = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  function syncView() {
    const open = !!draft && !drawer.classList.contains('hidden');
    if (!open) parked = false;
    drawer.classList.toggle('parked', open && parked);
    document.body.classList.toggle('editing', open && !parked && full());
    const showPill = open && parked && !MapView.isPicking(); // while picking, the yellow bar is the way back
    pill.classList.toggle('hidden', !showPill);
    if (showPill) pill.textContent = `✏️ Back to editing ${draft.name || 'the marker'}`;
    persistSoon(); // opened, parked or closed: the kept copy follows
  }
  // Hide the editor with the work kept, to use or look at the map or another tab.
  function park() { if (!draft || !full()) return; clearTimeout(unparkTimer); parked = true; syncView(); } // a side drawer never needs to step aside
  // Bring it back; "soon" waits a moment so that one map step handing over to the next does not flash the editor.
  function unpark(soon) {
    if (!draft || !parked) return;
    clearTimeout(unparkTimer);
    const go = () => { if (MapView.isPicking()) return; parked = false; syncView(); };
    if (soon) unparkTimer = setTimeout(go, 80); else go();
  }
  function peekMap() { App.showTab('map'); park(); }

  function init() {
    drawer = document.getElementById('drawer');
    pill = document.getElementById('editor-pill');
    pill.addEventListener('click', () => { if (MapView.isPicking()) MapView.cancelPick(); unpark(); });
    new MutationObserver(syncView).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistDraft(); });
    window.addEventListener('pagehide', persistDraft);
    window.addEventListener('resize', () => { if (parked && !full()) unpark(); else syncView(); }); // the window grew into a PC layout
    // on a touch screen the box being typed in stays in view above the on-screen keyboard
    const keepInView = el => { if (el && drawer.contains(el) && el.matches('input, textarea, select') && touch()) el.scrollIntoView({ block: 'center' }); };
    drawer.addEventListener('focusin', e => { const el = e.target; setTimeout(() => { if (document.activeElement === el) keepInView(el); }, 350); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => keepInView(document.activeElement));
    drawer.addEventListener('input', onInput);
    drawer.addEventListener('change', onInput);
    Store.subscribe(evt => {
      if (!draft) return;
      if (evt.type === 'all') {
        if (evt.sync) { // a background sync merged data: keep editing unless this marker vanished
          if (!isNew && !Store.marker(id)) { UI.toast('This marker was deleted on another device', 'error'); draft = null; id = null; drawer.classList.add('hidden'); }
          return;
        }
        draft = null; id = null; isNew = false; drawer.classList.add('hidden'); return;
      }
      if (evt.type === 'source' || evt.type === 'photo' || evt.type === 'photos' || evt.type === 'factType' || evt.type === 'linkType') render();
      if (evt.type === 'relation' || evt.type === 'relations') syncDraftFromStore(true);
      if (evt.type === 'marker' && evt.id === id && evt.deleted) { draft = null; id = null; drawer.classList.add('hidden'); }
    });
  }

  // Any error while building the form would otherwise leave the drawer silently closed.
  function safeRender() {
    try { render(); }
    catch (e) { console.error(e); UI.toast('Could not open the editor: ' + e.message, 'error'); throw e; }
  }
  function blankMarker() {
    return { id: Store.uid(), name: 'New marker', kind: 'pin', categoryId: null, color: '', icon: '', summary: '', description: '', sex: '', tellApart: '',
      fields: {}, fieldSources: {}, fieldGrades: {}, facts: [], sources: '', citations: [], tags: [], photoId: null, photoIds: [], pinned: [], undetermined: [], derived: {} };
  }
  function tidy(d) {
    d.facts = d.facts || []; d.citations = d.citations || []; d.fields = d.fields || {}; d.fieldSources = d.fieldSources || {}; d.fieldGrades = d.fieldGrades || {};
    d.pinned = d.pinned || []; d.undetermined = d.undetermined || []; d.derived = d.derived || {}; d.photoIds = d.photoIds || [];
    d.facts.forEach(f => { f.participants = f.participants || []; f.details = f.details || {}; });
    return d;
  }
  // Opening a marker while another has unsaved changes asks first (the editor may be parked out of sight).
  function mayReplace() {
    if (!draft || !isDirty()) return true;
    return confirm(`"${draft.name || 'The marker being edited'}" has unsaved changes. Discard them?`);
  }
  function open(markerId) {
    const m = Store.marker(markerId); if (!m) return;
    if (draft && !isNew && id === markerId) { unpark(); return; } // already being edited: just show it
    if (!mayReplace()) { unpark(); return; }
    clearTimeout(unparkTimer); parked = false;
    discardNew();
    id = markerId; isNew = false;
    draft = tidy(JSON.parse(JSON.stringify(m)));
    openFacts = new Set();
    savedSnapshot = snapshot();
    safeRender();
    drawer.classList.remove('hidden');
    syncView();
    if (!touch()) drawer.querySelector('[data-bind="name"]')?.focus(); // on a tablet this would pop the keyboard up at once
  }
  // A new marker lives only in the draft until it is saved (so cancelling leaves nothing behind).
  function openNew(data = {}) {
    if (!mayReplace()) { unpark(); return; }
    clearTimeout(unparkTimer); parked = false;
    discardNew();
    draft = tidy(Object.assign(blankMarker(), JSON.parse(JSON.stringify(data))));
    draft.facts.forEach(f => { f.id = f.id || Store.uid(); });
    openFacts = new Set(draft.facts.map(f => f.id));
    id = draft.id; isNew = true;
    applyCategoryFields();
    savedSnapshot = snapshot();
    safeRender();
    drawer.classList.remove('hidden');
    syncView();
    const name = drawer.querySelector('[data-bind="name"]');
    if (name) { name.focus(); name.select(); }
  }
  function discardNew() { if (draft && isNew) Store.deleteMarker(id); }
  function isOpen() { return !!draft; }
  function cancel(force = false) {
    if (!force && isDirty() && !confirm(isNew ? 'Close without saving this new marker?' : 'Close without saving your changes?')) return;
    discardNew();
    draft = null; id = null; isNew = false;
    drawer.classList.add('hidden'); drawer.innerHTML = '';
  }
  function save() {
    const bad = [];
    if (!draft.name.trim()) bad.push('Name is required');
    draft.facts.forEach(f => {
      const t = Store.factType(f.typeId), title = f.label || (t ? t.name : 'fact');
      for (const k of ['date', 'dateMin', 'dateMax', 'dateEnd', 'dateEndMin', 'dateEndMax']) if (!Dates.isValid(f[k])) bad.push(`${title}: "${f[k]}" is not a date I understand`);
      for (const s of Store.stopsOf(f)) for (const k of ['date', 'dateMin', 'dateMax', 'dateEnd', 'dateEndMin', 'dateEndMax']) if (!Dates.isValid(s[k])) bad.push(`${title}, stop at ${Store.stopName(s)}: "${s[k]}" is not a date I understand`);
      if ((f.dateMin && !f.dateMax) || (!f.dateMin && f.dateMax)) { /* one-sided limit: allowed */ }
    });
    if (bad.length) { UI.toast(bad[0], 'error'); return; }
    draft.name = draft.name.trim();
    draft.tags = (Array.isArray(draft.tags) ? draft.tags : String(draft.tags).split(',')).map(s => String(s).trim()).filter(Boolean);
    const wasNew = isNew, data = draft;
    draft = null; isNew = false; // the store event must not be taken for an outside change
    const cur = wasNew ? null : Store.marker(data.id);
    data.facts.forEach(f => {
      const sf = cur && cur.facts.find(x => x.id === f.id); CALC.forEach(k => { if (sf && sf[k]) f[k] = sf[k]; else delete f[k]; });
      (f.stops || []).forEach(s => { const ss = sf && (sf.stops || []).find(x => x.id === s.id); CALC.forEach(k => { if (ss && ss[k]) s[k] = ss[k]; else delete s[k]; }); });
    });
    const saved = wasNew ? Store.addMarker(data) : Store.updateMarker(data.id, data);
    UI.toast('Saved');
    // stay open on the saved marker: derived dates, mirrored lines and time gaps refresh in place
    const scroll = drawer.querySelector('.drawer-body')?.scrollTop || 0;
    id = saved.id; draft = tidy(JSON.parse(JSON.stringify(saved)));
    savedSnapshot = snapshot();
    safeRender();
    const body = drawer.querySelector('.drawer-body'); if (body) body.scrollTop = scroll;
  }
  function remove() {
    if (isNew) { cancel(); return; }
    if (!confirm(`Delete "${draft.name}" and all of its facts?`)) return;
    const d = id; draft = null; id = null; isNew = false; savedSnapshot = '';
    drawer.classList.add('hidden'); drawer.innerHTML = '';
    Store.deleteMarker(d);
  }

  // ---------- two-way binding for simple text boxes ----------
  function onInput(e) {
    const el = e.target;
    persistSoon();
    if (!draft || !el.isConnected) return; // an element-level handler may already have re-rendered
    if (el.dataset.field != null) { draft.fields[el.dataset.field] = el.value; return; }
    const path = el.dataset.bind; if (!path) return;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    const parts = path.split('.');
    let obj = draft;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    const key = parts[parts.length - 1];
    if ((key === 'lat' || key === 'lng') && val !== '' && isNaN(+val)) {
      const p = UI.parseLatLng(val); // a whole position pasted into one box ("31.7683, 35.2137" or degrees) fills both
      if (p) { obj.lat = p.lat; obj.lng = p.lng; if (e.type === 'change') render(); return; }
    }
    if (key === 'lat' || key === 'lng') val = val === '' ? null : (isNaN(+val) ? obj[key] : +val);
    obj[key] = val;
    if (path === 'categoryId' && e.type === 'change') { applyCategoryFields(); render(); }
    if (path === 'kind' && e.type === 'change') render();
  }
  function applyCategoryFields() {
    const cat = Store.category(draft.categoryId);
    if (!cat) return;
    for (const f of cat.fields) if (!(f in draft.fields)) draft.fields[f] = '';
  }

  // Pull anchors, undeterminable marks and reckoned dates from the saved marker into the draft (time gaps are
  // saved immediately and the solver may have recomputed dates while the editor is open).
  function syncDraftFromStore(rerender) {
    const s = !isNew && draft ? Store.marker(id) : null;
    if (!s) return;
    // A date that a time gap was working out when the draft last looked, and no longer does (the time gap was
    // edited, turned into a limit or deleted): its box could not be typed in, so what the draft holds is the old
    // reckoned date. It takes the store's value too, or Save would write the old date back as if it were typed.
    const old = { derived: draft.derived || {}, pinned: draft.pinned || [] };
    const was = slot => !!old.derived[slot] && !old.pinned.includes(slot);
    draft.pinned = JSON.parse(JSON.stringify(s.pinned || []));
    draft.undetermined = JSON.parse(JSON.stringify(s.undetermined || []));
    draft.derived = JSON.parse(JSON.stringify(s.derived || {}));
    const reckoned = slot => (draft.derived[slot] && !draft.pinned.includes(slot)) || draft.undetermined.includes(slot);
    const take = (x, sx) => { // x: a draft fact or stop, sx: the same one in the store
      if (reckoned('fact:' + x.id) || was('fact:' + x.id)) { x.date = sx.date; x.dateMin = sx.dateMin; x.dateMax = sx.dateMax; }
      if (reckoned('fact:' + x.id + ':end') || was('fact:' + x.id + ':end')) { x.dateEnd = sx.dateEnd; x.dateEndMin = sx.dateEndMin; x.dateEndMax = sx.dateEndMax; }
      CALC.forEach(k => { if (sx[k]) x[k] = sx[k]; else delete x[k]; });
    };
    draft.facts.forEach(f => {
      const sf = s.facts.find(x => x.id === f.id); if (!sf) return;
      take(f, sf);
      (f.stops || []).forEach(st => { const ss = (sf.stops || []).find(x => x.id === st.id); if (ss) take(st, ss); }); // the stops of a journey have dates of their own
    });
    if (rerender) render();
  }

  // A date box with its time-gap controls: ⛓ relate, 🔒 anchor, a caption when the date is reckoned, and an
  // "approximate" tick box that opens earliest / latest boxes (the main box is then the most-likely date).
  const approxOpen = new Set(); // slots whose earliest/latest boxes are shown
  function dateField(label, bind, slot, value, placeholder, approx) {
    const ref = { kind: 'marker', id, slot };
    const inStore = !isNew && Store.refExists(ref);
    const st = inStore ? Relations.slotState(ref) : null;
    const reckoned = !!(st && st.derived && !st.pinned);
    const undet = !!(st && st.undetermined);
    const hasRange = approx && !!(approx.min || approx.max);
    // limits on the ends of this date: what its ties work out, and which tie governs each end
    const win = inStore && approx ? Relations.windowOf(ref) : null;
    const hasWin = !!(win && (win.minTies.length || win.maxTies.length || win.auto)); // ties on an end, or the order of a journey's stops
    const open = hasRange || approxOpen.has(slot) || hasWin;
    const endChain = part => h('button', { type: 'button', class: 'small icon', disabled: !inStore,
      title: !inStore ? 'Save the marker first, then this end can be tied to another date' : (part === 'min' ? 'Tie the earliest end to another date: "not before…"' : 'Tie the latest end to another date: "not after…"'),
      onclick: () => Relations.pick(ref, { part, onDone: () => syncDraftFromStore(true) }) }, '⛓');
    const tiedHint = (v, by) => (by && v ? `${Dates.formatInput(v)} (tied)` : 'YYYY');
    const input = h('input', { type: 'text', 'data-bind': bind, value: undet ? '' : (value ?? ''), placeholder: undet ? 'undeterminable' : (open ? 'most likely (optional)' : placeholder),
      readonly: reckoned || undet, class: reckoned ? 'derived-input' : '', title: reckoned ? 'Reckoned from a time gap. Anchor it (🔒) to type a date here.' : '' });
    let approxRow = null, approxTick = null;
    if (approx && !undet) {
      approxTick = h('input', { type: 'checkbox', checked: open, title: hasWin ? 'The earliest and latest boxes stay open while an end is tied to another date' : 'Approximate: give the earliest and latest it could be', disabled: reckoned || hasWin, onchange: e => { if (e.target.checked) approxOpen.add(slot); else { approxOpen.delete(slot); const f = approx.obj || draft.facts[approx.i]; if (approx.end) { f.dateEndMin = ''; f.dateEndMax = ''; } else { f.dateMin = ''; f.dateMax = ''; } } render(); } });
      if (open) approxRow = h('div', { class: 'row approx-row', style: { gap: '4px' } },
        h('span', { class: 'muted', style: { flex: 'none', fontSize: 'calc(11px * var(--fs))' } }, 'earliest'),
        h('input', { type: 'text', 'data-bind': approx.minBind, value: approx.min || '', placeholder: tiedHint(win && win.E, win && win.eBy), readonly: reckoned, class: reckoned ? 'derived-input' : '', title: 'The earliest it can be. Type a date, or tie this end to another date with ⛓.' }),
        h('div', { class: 'narrow' }, endChain('min')),
        h('span', { class: 'muted', style: { flex: 'none', fontSize: 'calc(11px * var(--fs))' } }, 'latest'),
        h('input', { type: 'text', 'data-bind': approx.maxBind, value: approx.max || '', placeholder: tiedHint(win && win.L, win && win.lBy), readonly: reckoned, class: reckoned ? 'derived-input' : '', title: 'The latest it can be. Type a date, or tie this end to another date with ⛓.' }),
        h('div', { class: 'narrow' }, endChain('max')));
    }
    const chain = h('button', { type: 'button', class: 'small icon', disabled: !inStore, title: !inStore ? 'Save the marker first, then you can tie this date to another date' : 'Ties: place this date from another date ("130 years after Adam was born"), or limit it ("not before…", "not after…")',
      onclick: () => Relations.pick(ref, { onDone: () => syncDraftFromStore(true) }) }, '⛓');
    const pin = st && (st.related || st.pinned) ? h('button', { type: 'button', class: 'small icon' + (st.pinned ? ' src-on' : ''),
      title: st.pinned ? 'Anchor: other dates are reckoned from this one. Click to release it.' : 'Make this date the anchor, so the related dates are reckoned from it',
      onclick: () => { Store.setPinned(ref, !st.pinned); syncDraftFromStore(true); } }, '🔒') : null;
    const restore = undet ? h('button', { type: 'button', class: 'small', title: 'Stop treating this date as undeterminable', onclick: () => { Store.setUndetermined(ref, false); syncDraftFromStore(true); } }, 'Restore') : null;
    let caption = null;
    if (reckoned) caption = h('div', { class: 'rel-caption' }, '⛓ reckoned from ' + Relations.describeDerived(ref) + (st.range && st.range.min !== st.range.max ? ` → ${Dates.formatRange(st.range.date, st.range.min, st.range.max)}` : ''));
    // what the ties on the ends work out: one line per end, naming the tie that governs it
    let winCaption = null;
    if (hasWin && !undet) {
      const more = n => (n > 1 ? ` (and ${n - 1} more)` : '');
      const lines = [];
      if (win.E && win.eBy) lines.push(`⛓ earliest ${Dates.formatInput(win.E)}: ${Relations.governText(win.eBy)}${more(win.minTies.length)}`);
      else if (win.minTies.length) lines.push(`⛓ earliest: ${win.minTies.length} tie${win.minTies.length > 1 ? 's' : ''}, waiting for the other date${win.minTies.length > 1 ? 's' : ''}`);
      if (win.L && win.lBy) lines.push(`⛓ latest ${Dates.formatInput(win.L)}: ${Relations.governText(win.lBy)}${more(win.maxTies.length)}`);
      else if (win.maxTies.length) lines.push(`⛓ latest: ${win.maxTies.length} tie${win.maxTies.length > 1 ? 's' : ''}, waiting for the other date${win.maxTies.length > 1 ? 's' : ''}`);
      const a = Dates.parse(win.E), b = Dates.parse(win.L);
      if (a && b && !win.conflict && b.y - a.y > 0) lines.push(`window ${b.y - a.y} year${b.y - a.y === 1 ? '' : 's'}`);
      winCaption = h('div', { class: 'rel-caption' }, ...lines.map(t => h('div', {}, t)));
    }
    if (st && st.conflict && st.conflict.window) caption = h('div', { class: 'rel-caption conflict' }, st.conflict.soft ? '⚠ The most likely dates around this one are out of order. ' : '⚠ The limits on this date leave it no room. ', h('a', { class: 'mlink', style: { color: 'inherit', cursor: 'pointer' }, onclick: () => Relations.showConflicts() }, 'Review'));
    else if (st && st.conflict) caption = h('div', { class: 'rel-caption conflict' }, '⚠ Two chains disagree about this date. ', h('a', { class: 'mlink', style: { color: 'inherit', cursor: 'pointer' }, onclick: () => Relations.showConflicts() }, 'Review'));
    if (undet) caption = h('div', { class: 'rel-caption' }, 'Marked undeterminable: not placed on the timeline.');
    return h('label', { class: 'field' }, label,
      h('div', { class: 'row', style: { gap: '4px' } }, input, approxTick ? h('div', { class: 'narrow', title: 'approximate' }, approxTick) : null, h('div', { class: 'narrow' }, chain), pin ? h('div', { class: 'narrow' }, pin) : null, restore ? h('div', { class: 'narrow' }, restore) : null),
      approxRow, winCaption, caption);
  }

  // ---------- rendering ----------
  // A section: heading row that opens/closes it (remembered per device; long sections start closed), a count,
  // and a ⓘ whose hint shows on hover or on tap.
  function section(title, opts, ...kids) {
    const { key = title.toLowerCase(), hint = '', count = null } = opts || {};
    const st = sectionState();
    const open = key in st ? !!st[key] : !(count != null && count > 8);
    const head = h('h3', { class: 'ed-head', title: open ? 'Close this section' : 'Open this section' },
      h('span', { class: 'ed-arrow' }, open ? '▾' : '▸'), h('span', { class: 'ed-title' }, title),
      count != null ? h('span', { class: 'ed-count' }, `(${count})`) : null);
    if (hint) {
      const pop = h('div', { class: 'hint-pop' }, hint);
      const info = h('button', { type: 'button', class: 'ed-info', title: hint, onclick: e => { e.stopPropagation(); pop.classList.toggle('open'); } }, 'ⓘ');
      head.append(h('span', { class: 'ed-info-wrap' }, info, pop));
    }
    head.addEventListener('click', () => { setSectionOpen(key, !open); render(); });
    const body = h('div', { class: 'ed-body' + (open ? '' : ' hidden') }, ...kids);
    return h('div', { class: 'ed-section' + (open ? '' : ' closed') }, head, body);
  }
  const field = (label, input) => h('label', { class: 'field' }, label, input);
  const row = (...kids) => h('div', { class: 'ed-row' }, ...kids);
  const txt = (bind, value, extra = {}) => h('input', Object.assign({ type: 'text', 'data-bind': bind, value: value ?? '' }, extra));

  function render() {
    const m = draft;
    const scroll = drawer.querySelector('.drawer-body')?.scrollTop || 0;
    drawer.innerHTML = '';
    const cat = Store.category(m.categoryId);

    const catSel = UI.select([['', '— none —'], ...Store.categories().map(c => [c.id, `${c.icon} ${c.name}`]), ['__new', '+ New category…']], m.categoryId || '', { 'data-bind': 'categoryId' });
    catSel.addEventListener('change', e => {
      if (e.target.value === '__new') {
        const name = prompt('Name of the new category:');
        if (name && name.trim()) { const c = Store.addCategory({ name: name.trim(), color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }); draft.categoryId = c.id; }
        else draft.categoryId = m.categoryId;
        applyCategoryFields(); render();
      }
    });
    const colorInput = h('input', { type: 'color', value: m.color || Store.displayColor(m), 'data-bind': 'color', title: 'Override colour' });
    const colorReset = h('button', { type: 'button', class: 'small', title: 'Use the category colour', onclick: () => { draft.color = ''; render(); } }, m.color ? 'Use category colour' : 'Category colour ✓');

    const saved = Store.marker(draft.id);
    const mirrorCount = saved && saved.mirrors ? saved.mirrors.length : 0;
    const filledFields = Object.values(m.fields || {}).filter(v => v !== '' && v != null).length;
    const body = h('div', { class: 'drawer-body' },
      section('Basics', { key: 'basics' },
        h('div', { class: 'ed-top' },
          renderPortrait(),
          h('div', { class: 'ed-top-fields' },
            field('Name', txt('name', m.name)),
            row(field('Shape', UI.select([['pin', '📍 Point'], ['area', '⬠ Area'], ['path', '➡️ Route']], m.kind, { 'data-bind': 'kind' })),
                field('Category', catSel)))),
        row(field('Colour', row(h('div', { class: 'narrow' }, colorInput), colorReset)),
            field('Icon (emoji)', txt('icon', m.icon, { placeholder: cat ? cat.icon : '📍', maxlength: 4 }))),
        row(field('Summary (one line)', txt('summary', m.summary)),
            field('Sex (for brother/sister wording)', UI.select([['', '— not said —'], ['male', 'Male'], ['female', 'Female']], m.sex || '', { 'data-bind': 'sex', title: 'Used only to word derived sibling ties as brother or sister' }))),
        field('Tell apart as (used only when another marker shares the name)', txt('tellApart', m.tellApart, { placeholder: (!isNew && Store.marker(m.id) && Store.tagOf(Object.assign({}, Store.marker(m.id), { tellApart: '' }))) || 'e.g. son of Cain — filled in from the father, birth year or category when blank' })),
      ),
      section('Facts', { key: 'facts', count: m.facts.length + mirrorCount, hint: 'Everything that happened: when, where, with whom, and the source. Begins/Ends, locations and ties all follow from the facts. Click a line to open or close its card.' },
        h('div', { id: 'ed-facts' }, renderFacts()),
        renderAddFact()),
      section('Fields', { key: 'fields', count: filledFields, hint: 'Undated details (occupation, tribe, nationality…). Press ＋ beside a field for sub-fields, 📖 for its source.' },
        h('div', { id: 'ed-fields' }, renderFields()),
        h('button', { type: 'button', class: 'small', onclick: () => { const k = prompt('Field name:'); if (k && k.trim() && !(k.trim() in draft.fields)) { draft.fields[k.trim()] = ''; render(); } } }, '+ Add field'),
        field('Tags (comma separated)', txt('tags', Array.isArray(m.tags) ? m.tags.join(', ') : m.tags)),
        field('Notes', h('textarea', { 'data-bind': 'description', rows: 4 }, m.description)),
      ),
      section('Images', { key: 'images', count: m.photoIds.length, hint: 'Extra pictures shown in the bubble. Every image lives in the library and can carry its own sources.' },
        renderGallery()),
      section('Sources', { key: 'sources', count: m.citations.length, hint: cat && cat.sourceId && Store.source(cat.sourceId)
          ? `Default source for ${cat.name}: ${Store.sourceLabel(cat.sourceId)}. Add citations below when this marker draws on something else; each fact can also cite its own source.`
          : 'Citations for the marker as a whole. Each fact can also cite its own source and page.' },
        h('div', { id: 'ed-cites' }, renderCitations()),
        h('button', { type: 'button', class: 'small', onclick: () => { draft.citations.push({ sourceId: null, page: '', note: '' }); render(); } }, '+ Add citation'),
        field('Source notes (free text)', h('textarea', { 'data-bind': 'sources', rows: 2, placeholder: 'Anything about the evidence that does not fit a citation' }, m.sources)),
      ),
      section('Time gaps', { key: 'gaps', count: isNew ? 0 : Store.relationsFor(id).length, hint: 'A time gap ties one of this marker\'s dates to another date by a fixed gap. Anchors (🔒) are the fixed dates; the rest are reckoned from them.' },
        h('div', { id: 'ed-relations' }, renderRelations())),
    );
    drawer.append(
      h('div', { class: 'drawer-head' }, h('h2', {}, isNew ? 'New marker' : 'Edit marker'), h('span', { class: 'spacer' }),
        h('button', { class: 'small ed-min', title: 'Hide the editor to look at the map or another tab. Your work is kept, and a button brings you back.', onclick: () => park() }, '▁ Minimise'),
        h('button', { class: 'primary small', onclick: save }, 'Save'),
        h('button', { class: 'icon-btn', title: 'Close', onclick: () => cancel() }, '✕')),
      body,
      h('div', { class: 'drawer-foot' },
        h('button', { class: 'primary', onclick: save }, 'Save'),
        h('button', { onclick: () => cancel(), title: 'Close the editor (asks first if there are unsaved changes)' }, 'Close'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'danger', onclick: remove }, 'Delete')),
    );
    body.scrollTop = scroll;
    persistSoon();
  }

  // ---------- facts ----------
  function factTypeOptions() {
    const all = Store.factTypes();
    const defaults = Facts.defaultTypeIdsFor(Store.category(draft.categoryId)).filter(idv => all.some(t => t.id === idv));
    const rest = all.filter(t => !defaults.includes(t.id)).sort((a, b) => a.name.localeCompare(b.name));
    return { defaults: defaults.map(idv => all.find(t => t.id === idv)), rest };
  }
  function typeSelect(current, onChange) {
    const { defaults, rest } = factTypeOptions();
    const sel = h('select');
    const add = (group, list) => { const og = h('optgroup', { label: group }); list.forEach(t => og.append(h('option', { value: t.id, selected: t.id === current }, t.name))); if (list.length) sel.append(og); };
    if (defaults.length) { add('Usual for this category', defaults); add('All fact types', rest); }
    else rest.forEach(t => sel.append(h('option', { value: t.id, selected: t.id === current }, t.name)));
    sel.append(h('option', { value: '__new' }, '+ New fact type…'));
    sel.addEventListener('change', () => {
      if (sel.value === '__new') { DataTab.editFactType(null, t => { if (t) onChange(t.id); else render(); }); return; }
      onChange(sel.value);
    });
    return sel;
  }
  function sortedFactIndexes() {
    return draft.facts.map((f, i) => ({ f, i })).sort((a, b) => {
      const da = a.f.date ? Dates.toDays(a.f.date) : null, db = b.f.date ? Dates.toDays(b.f.date) : null;
      if (da == null && db == null) return a.i - b.i;
      if (da == null) return 1; if (db == null) return -1;
      return da - db || a.i - b.i;
    }).map(x => x.i);
  }
  function renderFacts() {
    if (!draft.facts.length) return [h('p', { class: 'muted' }, 'No facts yet. Add one below: Born, Died, Located at, Took place…'), ...renderMirrors()];
    const out = [];
    let sawUndated = false;
    for (const i of sortedFactIndexes()) {
      const f = draft.facts[i];
      if (!sawUndated && !f.date && out.length) { sawUndated = true; out.push(h('div', { class: 'ed-sep' }, 'undated')); }
      else if (!f.date) sawUndated = true;
      out.push(openFacts.has(f.id) ? renderFact(i) : renderFactLine(i));
    }
    return [...out, ...renderMirrors()];
  }
  // One line per closed fact: "1 Jan 1901 BC · Born · Father: Abraham · Beersheba"; click to open the card.
  function renderFactLine(i) {
    const f = draft.facts[i];
    const t = Store.factType(f.typeId);
    const bits = [];
    const w = Facts.when(f);
    const whenLabel = Facts.whenLabel(w, !!(t && t.hasEnd)); // the date, or its window when no date is known
    if (whenLabel) bits.push(whenLabel);
    const who = (f.participants || []).map(p => { const o = Store.marker(p.markerId); const r = t && t.roles.find(x => x.id === p.roleId); const part = t && t.journey ? UI.partText(f.stops, p) : ''; return o ? `${r ? r.name : 'with'}: ${Store.displayName(o)}${part ? ` (${part})` : ''}` : ''; }).filter(Boolean).join(', ');
    let place = f.placeLabel || '';
    if (!place && f.where && f.where.kind === 'marker') place = (Store.marker(f.where.markerId) || {}).name || '';
    else if (!place && f.where && f.where.kind === 'point') place = `${(+f.where.lat).toFixed(2)}, ${(+f.where.lng).toFixed(2)}`;
    else if (!place && f.where && f.where.coords) place = `${f.where.coords.length}-point ${f.where.kind}`;
    const trip = t && t.journey ? UI.journeyText(f) : '';
    const line = h('div', { class: 'fact-line', title: 'Open this fact', onclick: () => { openFacts.add(f.id); render(); } },
      h('span', { class: 'ed-arrow' }, '▸'),
      bits.length ? h('span', { class: 'muted' }, bits.join(' ') + ' · ') : null,
      h('strong', {}, f.label || (t ? t.name : 'Fact')),
      who ? ' · ' + who : '', place ? ' · ' + place : '', trip ? ' · ' + trip : '',
      f.confidence ? h('span', { html: ' ' + UI.gradeBadgeHTML(f.confidence, f.reason) }) : null);
    return line;
  }
  // Facts typed on other markers that name this one (Son: Isaac from Isaac's Born fact). Read-only here.
  function renderMirrors() {
    const saved = Store.marker(draft.id);
    const list = saved && saved.mirrors ? saved.mirrors : [];
    if (!list.length) return [];
    return [h('p', { class: 'hint', style: { marginTop: '10px' } }, 'From other markers (edit them there):'),
      ...list.map(mi => {
        const o = Store.marker(mi.markerId); if (!o) return null;
        const when = mi.date ? Dates.formatRange(mi.date, mi.dateMin, mi.dateMax) + ' · ' : '';
        return h('div', { class: 'card fact-card mirror-card' },
          h('div', { class: 'row' },
            h('span', {}, when, h('strong', {}, mi.factTitle), ' · ', h('strong', {}, mi.word + ': '), o.name, mi.place ? ' · ' + mi.place : '', UI.journeyText(mi) ? ' · ' + UI.journeyText(mi) : '', UI.partText(mi.stops, mi) ? ' · ' + UI.partText(mi.stops, mi) : '', h('span', { class: 'muted' }, ` · from ${o.name}'s ${mi.factTitle} fact${mi.placed ? ', which also places this marker' : mi.covered ? '; the longer journey it is part of places this marker' : ''}`)),
            h('button', { type: 'button', class: 'small narrow', title: `Open ${o.name} to edit that fact`, onclick: () => open(o.id) }, '✏️ ' + o.name)));
      }).filter(Boolean)];
  }
  function renderFact(i) {
    const f = draft.facts[i];
    const t = Store.factType(f.typeId) || { name: 'Fact', hasDate: true, hasEnd: false, place: 'any', roles: [], details: [] };
    const card = h('div', { class: 'card fact-card' });
    // title row
    card.append(row(
      h('button', { type: 'button', class: 'small narrow ed-close-fact', title: 'Close this fact (keeps it)', onclick: () => { openFacts.delete(f.id); render(); } }, '▾'),
      typeSelect(f.typeId, v => { draft.facts[i].typeId = v; render(); }),
      h('input', { type: 'text', 'data-bind': `facts.${i}.label`, value: f.label, placeholder: `label (default: ${t.name})`, title: 'Optional wording shown instead of the type name, e.g. "Created" for Adam' }),
      h('button', { type: 'button', class: 'small narrow', title: 'Remove this fact', onclick: () => { if (confirm(`Remove the fact "${Store.factTitle(f)}"?`)) { draft.facts.splice(i, 1); render(); } } }, '✕')));
    // dates
    if (t.hasDate !== false) {
      const dates = [dateField(t.hasEnd ? 'From' : 'When', `facts.${i}.date`, 'fact:' + f.id, f.date, 'YYYY-MM-DD, 1776, 44 BC', { i, end: false, min: f.dateMin, max: f.dateMax, minBind: `facts.${i}.dateMin`, maxBind: `facts.${i}.dateMax` })];
      if (t.hasEnd) dates.push(dateField('Until', `facts.${i}.dateEnd`, 'fact:' + f.id + ':end', f.dateEnd, 'optional', { i, end: true, min: f.dateEndMin, max: f.dateEndMax, minBind: `facts.${i}.dateEndMin`, maxBind: `facts.${i}.dateEndMax` }));
      const copyBtn = h('button', { type: 'button', class: 'small', title: 'Use the date shown on the map time slider', onclick: () => { const tt = MapView.time(); if (tt != null) { draft.facts[i].date = Dates.iso(tt); render(); } } }, '⏱');
      card.append(row(...dates, h('div', { class: 'narrow', style: { alignSelf: 'flex-end', paddingBottom: '2px' } }, copyBtn)));
    }
    // where
    if (t.place !== 'none') card.append(renderWhere(i, t));
    if (t.journey) card.append(renderJourney(i));
    // roles
    for (const role of t.roles) card.append(renderRole(i, role));
    // details
    const detailKeys = [...new Set([...(t.details || []), ...Object.keys(f.details || {})])];
    if (detailKeys.length || true) {
      const rows = detailKeys.map(k => h('div', { class: 'kv-row' },
        h('input', { type: 'text', class: 'k', value: k, disabled: true }),
        (() => {
          if (t.id === 'ft_named' && k === 'Kind') { const e = UI.select(Store.NAME_KINDS.map(x => [x, x]), f.details[k] || 'nickname', { class: 'v' }); e.addEventListener('change', () => { draft.facts[i].details[k] = e.value; }); return e; }
          const e = h('input', { type: 'text', class: 'v', value: f.details[k] || '', placeholder: t.id === 'ft_named' && k === 'Name' ? 'the other name, e.g. Abraham' : k }); e.addEventListener('input', () => { draft.facts[i].details[k] = e.value; }); return e; })(),
        h('button', { type: 'button', class: 'small', title: 'Remove detail', onclick: () => { delete draft.facts[i].details[k]; render(); } }, '✕')));
      card.append(h('div', { class: 'fact-details' }, ...rows,
        h('button', { type: 'button', class: 'small', onclick: () => { const k = prompt('Detail name (e.g. Cause, Outcome, Age):'); if (k && k.trim()) { draft.facts[i].details[k.trim()] = draft.facts[i].details[k.trim()] || ''; render(); } } }, '+ Detail')));
    }
    // note + source
    card.append(row(h('input', { type: 'text', 'data-bind': `facts.${i}.note`, value: f.note, placeholder: 'note: the wording, what happened, why' })));
    card.append(row(UI.sourceSelect({ value: f.sourceId, onChange: v => { draft.facts[i].sourceId = v; render(); }, noneLabel: '— source —' }),
      h('input', { type: 'text', 'data-bind': `facts.${i}.page`, value: f.page, placeholder: 'page / verse', style: { flex: '0 0 40%' } })));
    card.append(row(h('div', { class: 'narrow', style: { minWidth: '190px' } }, UI.confidenceSelect(f.confidence, v => { draft.facts[i].confidence = v; render(); })),
      f.confidence ? h('input', { type: 'text', 'data-bind': `facts.${i}.reason`, value: f.reason, placeholder: 'why this grade: ambiguity, cross-references, circumstantial evidence…' }) : h('span', { class: 'muted', style: { fontSize: 'calc(11px * var(--fs))', alignSelf: 'center' } }, 'confidence: your own grade, never taken from the source')));
    return card;
  }
  function renderWhere(i, t) {
    const f = draft.facts[i];
    const w = f.where;
    const allowed = t.place === 'any' ? ['point', 'area', 'route', 'marker'] : t.place === 'point' ? ['point', 'marker'] : t.place === 'area' ? ['area', 'marker'] : ['route', 'marker'];
    const names = { point: 'a point', area: 'an area outline', route: 'a route', marker: 'at / inside another marker' };
    const kindSel = UI.select([['', 'no place'], ...allowed.map(k => [k, names[k]])], w ? w.kind : '');
    kindSel.addEventListener('change', () => {
      const k = kindSel.value;
      draft.facts[i].where = !k ? null : k === 'point' ? { kind: 'point', lat: null, lng: null } : k === 'marker' ? { kind: 'marker', markerId: null } : { kind: k, coords: [] };
      render();
    });
    const parts = [h('div', { class: 'narrow', style: { minWidth: '150px' } }, kindSel)];
    if (w && w.kind === 'point') {
      parts.push(h('input', { type: 'text', 'data-bind': `facts.${i}.where.lat`, value: w.lat ?? '', placeholder: 'lat', title: 'Latitude in decimal degrees (south is negative). A whole position pasted here, such as 31.7683, 35.2137 or 31\u00b046\u2032N 35\u00b013\u2032E, fills both boxes.' }), h('input', { type: 'text', 'data-bind': `facts.${i}.where.lng`, value: w.lng ?? '', placeholder: 'lng', title: 'Longitude in decimal degrees (west is negative). A whole position pasted here fills both boxes.' }),
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', onclick: () => { App.showTab('map'); MapView.pickPoint(ll => { if (!draft) return; draft.facts[i].where = { kind: 'point', lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }; render(); }, `Click on the map to place "${Store.factTitle(f)}"`); } }, '📍 Place on map')),
        w.lat != null && w.lat !== '' ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Drag the pin to a new place; nothing changes until you press Done', onclick: () => { App.showTab('map'); MapView.movePoint({ lat: w.lat, lng: w.lng }, ll => { if (!draft) return; draft.facts[i].where = { kind: 'point', lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }; render(); UI.toast('Pin moved in the editor. Press Save to keep it.'); }, `Drag "${Store.factTitle(f)}" to its new place (or click the map), then press Done`); } }, '✥ Move pin')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', disabled: w.lat == null, title: 'Move the map to this place', onclick: () => { peekMap(); MapView.showPosition({ lat: w.lat, lng: w.lng }, 'pin'); } }, '🎯')));
    } else if (w && (w.kind === 'area' || w.kind === 'route')) {
      const has = !!(w.coords && w.coords.length);
      const fromPicture = (coords, rough) => { if (!draft) return; draft.facts[i].where = Object.assign({}, draft.facts[i].where, { kind: w.kind, coords, rough: w.kind === 'area' ? rough : [] }); render(); UI.toast('Outline drafted from the picture. Press Save to keep it.'); };
      parts.push(h('span', { class: 'muted' }, has ? `${w.coords.length} corners` : 'not drawn yet'),
        has ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Drag, add or delete corners and simplify; nothing changes until you press Done', onclick: () => startEdit(i, 'coords') }, w.kind === 'area' ? '✥ Edit border' : '✥ Edit route')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: has ? 'Throw the outline away and click a new one' : 'Click the corners on the map', onclick: () => { App.showTab('map'); MapView.drawShape(w.kind === 'area' ? 'area' : 'path', [], coords => { if (!draft) return; const cur = draft.facts[i].where || {}; draft.facts[i].where = Object.assign({}, cur, { kind: w.kind, coords: coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), rough: [] }); render(); }); } }, has ? '↺ Redraw' : '✏️ Draw on map')),
        window.Overlay && Overlay.isActive() ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Click inside a tinted region of the overlaid picture; its outline becomes this shape', onclick: () => Overlay.fill(fromPicture) }, '⬚ Fill from picture')) : null,
        window.Overlay && Overlay.isActive() ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Click a drawn line on the overlaid picture; the app follows it', onclick: () => Overlay.trace(fromPicture) }, '〰 Trace from picture')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', disabled: !(w.coords && w.coords.length), title: 'Move the map to this shape', onclick: () => { peekMap(); MapView.showPosition({ coords: w.coords }, w.kind === 'area' ? 'area' : 'path'); } }, '🎯')));
    } else if (w && w.kind === 'marker') {
      parts.push(UI.markerSelect({ value: w.markerId, exclude: [id], placeholder: 'which marker (an area, a town, an event)…', onChange: v => { draft.facts[i].where = { kind: 'marker', markerId: v }; } }));
    }
    const line = row(...parts);
    const label = h('input', { type: 'text', 'data-bind': `facts.${i}.placeLabel`, value: f.placeLabel, placeholder: 'place name (e.g. Philadelphia)' });
    const roughRow = w && w.kind === 'area' && w.coords && w.coords.length >= 3 ? renderRoughBorder(i) : null;
    return h('div', { class: 'fact-where' }, line, w ? row(label) : null, roughRow);
  }
  // Rough borders: a "largest possible extent" outline and firm/rough marking of each edge.
  function renderRoughBorder(i) {
    const w = draft.facts[i].where;
    const rough = w.rough || [], hasExt = !!(w.extent && w.extent.length >= 3);
    const sum = [];
    if (rough.length) sum.push(`${rough.length} rough edge${rough.length > 1 ? 's' : ''}`);
    if (hasExt) sum.push(`extent: ${w.extent.length} points${w.extentRough && w.extentRough.length ? ` (${w.extentRough.length} rough)` : ''}`);
    return h('div', { class: 'row', style: { gap: '6px', marginTop: '4px', flexWrap: 'wrap' } },
      h('span', { class: 'muted', style: { fontSize: 'calc(12px * var(--fs))', flex: 'none' } }, sum.length ? sum.join(' · ') : 'all edges firm, no extent'),
      h('button', { type: 'button', class: 'small', title: 'Mark which edges of the outline are only guessed', onclick: () => roughEdgesDialog(i, 'coords') }, 'Firm / rough edges…'),
      hasExt ? h('button', { type: 'button', class: 'small', title: 'Drag, add or delete the extent\'s corners; nothing changes until you press Done', onclick: () => startEdit(i, 'extent') }, '✥ Edit extent') : null,
      h('button', { type: 'button', class: 'small', title: hasExt ? 'Throw the extent away and click a new one' : 'Draw a second outline: the furthest the territory might reach', onclick: () => {
        App.showTab('map');
        MapView.drawShape('area', hasExt ? [] : w.coords, coords => { if (!draft) return; draft.facts[i].where.extent = coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]); draft.facts[i].where.extentRough = []; render(); });
      } }, hasExt ? '↺ Redraw extent' : '⬠ Draw extent'),
      hasExt ? h('button', { type: 'button', class: 'small', onclick: () => roughEdgesDialog(i, 'extent') }, 'Extent edges…') : null,
      hasExt ? h('button', { type: 'button', class: 'small', title: 'Remove the extent outline', onclick: () => { delete draft.facts[i].where.extent; delete draft.facts[i].where.extentRough; render(); } }, '✕ extent') : null);
  }
  // Explicit edit mode for an outline: the corners become draggable on the map; Done writes the result into
  // the draft (and Save keeps it), Cancel changes nothing.
  function startEdit(i, which) {
    const w = draft.facts[i].where;
    const coords = which === 'extent' ? w.extent : w.coords, key = which === 'extent' ? 'extentRough' : 'rough';
    App.showTab('map');
    MapView.editShape(w.kind === 'area' ? 'area' : 'path', coords, (pts, rough) => {
      if (!draft) return;
      const ww = draft.facts[i].where;
      if (which === 'extent') ww.extent = pts; else ww.coords = pts;
      ww[key] = rough;
      render(); UI.toast('Outline updated in the editor. Press Save to keep it.');
    }, { rough: w[key] || [] });
  }
  // "Change border here": copy the border in force at the slider's date into a new dated fact and open it for
  // editing, so only the corners that moved need dragging. The earlier border stays as it was.
  function changeBorderHere(markerId) {
    const m = Store.marker(markerId); if (!m) return;
    const tt = MapView.time();
    if (tt == null) { UI.toast('Untick "Show all times" and move the slider to the date of the new border first', 'error'); return; }
    const mv = Store.positionAt(m, tt);
    if (!mv || !(mv.coords && mv.coords.length)) { UI.toast('No border is in force at this date', 'error'); return; }
    open(markerId);
    let i = draft.facts.findIndex(f => f.id === mv.id);
    const src = i >= 0 ? draft.facts[i] : null;
    if (!src || Dates.toDays(src.date) !== tt) {
      const where = JSON.parse(JSON.stringify(src && src.where ? src.where : { kind: 'area', coords: mv.coords, extent: mv.extent || undefined, rough: mv.rough || [], extentRough: mv.extentRough || [] }));
      draft.facts.push({ id: Store.uid(), typeId: src ? src.typeId : 'ft_border', label: '', date: Dates.iso(tt), dateEnd: '', where, placeLabel: src ? src.placeLabel : '', participants: [], details: {}, note: '', sourceId: null, page: '', confidence: '', reason: '' });
      i = draft.facts.length - 1;
      render();
      UI.toast(`New border dated ${Dates.format(tt)}: drag the corners that moved, press Done, then Save`);
    }
    startEdit(i, 'coords');
  }
  function roughEdgesDialog(i, which) {
    const w = draft.facts[i].where;
    const coords = which === 'extent' ? w.extent : w.coords;
    const key = which === 'extent' ? 'extentRough' : 'rough';
    const set = new Set(w[key] || []);
    peekMap();
    MapView.showVertexNumbers(coords);
    MapView.showPosition({ coords }, 'area');
    const boxes = coords.map((c, k) => {
      const cb = h('input', { type: 'checkbox', checked: set.has(k) });
      cb.addEventListener('change', () => { if (cb.checked) set.add(k); else set.delete(k); });
      return h('label', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center', padding: '3px 10px 3px 0' } }, cb, `${k + 1} → ${((k + 1) % coords.length) + 1}`);
    });
    const body = h('div', {},
      h('p', { class: 'hint' }, 'The outline\'s corners are numbered on the map. Tick the edges that are only guessed (they draw dashed with a soft band); leave firm edges unticked (coast, river, treaty line).'),
      h('div', {}, ...boxes),
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'small', onclick: () => { boxes.forEach(b => { b.querySelector('input').checked = true; }); coords.forEach((_, k) => set.add(k)); } }, 'All rough'),
        h('button', { class: 'small', onclick: () => { boxes.forEach(b => { b.querySelector('input').checked = false; }); set.clear(); } }, 'All firm'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary', onclick: () => { if (!draft) return; draft.facts[i].where[key] = [...set].sort((a, b) => a - b); m.close(); render(); } }, 'Done'),
        h('button', { onclick: () => m.close() }, 'Cancel')));
    const m = UI.modal({ title: which === 'extent' ? 'Edges of the extent outline' : 'Edges of the border', body, width: '420px', side: true, onClose: () => { MapView.hideVertexNumbers(); unpark(); } });
  }
  // "Starts at" / "Ends at" on a fact whose type is ticked "a journey" (Library, Fact types). Whoever travels
  // (this marker when it is a pin, and everyone in a role ticked "they go there too") is at the start place
  // before the fact's dates and at the end place after them: Facts.deriveJourneys works that out.
  // Between the two boxes: the places along the way, in the order travelled (f.stops). Each row is a marker or a
  // point picked on the map, and is either a stop (Arrived and Left dates, with limits and ties like any date) or
  // a place passed (no dates). Travellers are at a stop between its two dates and on the route between stops.
  function renderJourney(i) {
    const f = draft.facts[i], w = Facts.when(f);
    const box = (label, key, ph) => h('div', { class: 'field' }, label,
      UI.markerSelect({ value: f[key] || null, exclude: [id], placeholder: ph, onChange: v => { if (v) draft.facts[i][key] = v; else delete draft.facts[i][key]; } }));
    const stops = f.stops || [];
    const setStops = list => { if (list.length) draft.facts[i].stops = list; else delete draft.facts[i].stops; render(); };
    const blankStop = at => ({ id: Store.uid(), kind: 'stop', at, label: '', date: '', dateMin: '', dateMax: '', dateEnd: '', dateEndMin: '', dateEndMax: '' });
    const shift = (k, by) => { const list = stops.slice(); const [x] = list.splice(k, 1); list.splice(k + by, 0, x); setStops(list); };
    const point = ll => ({ kind: 'point', lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) });
    const rows = stops.map((s, k) => {
      const here = s.at.kind === 'marker'
        ? UI.markerSelect({ value: s.at.markerId, exclude: [id], placeholder: 'which place…', onChange: v => { if (v) { draft.facts[i].stops[k].at = { kind: 'marker', markerId: v }; render(); } } })
        : h('input', { type: 'text', 'data-bind': `facts.${i}.stops.${k}.label`, value: s.label || '', placeholder: `name of this point (${(+s.at.lat).toFixed(2)}, ${(+s.at.lng).toFixed(2)})`, title: 'A point picked on the map. Give it a name if it has one.' });
      const kindSel = UI.select([['stop', 'a stop'], ['pass', 'a place passed']], s.kind, { title: 'A stop has Arrived and Left dates and the travellers stay there. A place passed is only on the way: no dates, no stay.' });
      kindSel.addEventListener('change', () => { draft.facts[i].stops[k].kind = kindSel.value; render(); });
      const btn = (label, title, fn, off) => h('button', { type: 'button', class: 'small narrow', title, disabled: !!off, onclick: fn }, label);
      const head = row(h('span', { class: 'narrow muted journey-n' }, `${k + 1}.`), here, h('div', { class: 'narrow' }, kindSel),
        s.at.kind === 'point' ? btn('✥', 'Move this point: drag it or click the map, then press Done', () => { App.showTab('map'); MapView.movePoint({ lat: s.at.lat, lng: s.at.lng }, ll => { if (!draft) return; draft.facts[i].stops[k].at = point(ll); render(); UI.toast('Point moved in the editor. Press Save to keep it.'); }, 'Drag the point to its new place (or click the map), then press Done'); }) : null,
        s.at.kind === 'point' ? btn('🎯', 'Move the map to this point', () => { peekMap(); MapView.showPosition({ lat: s.at.lat, lng: s.at.lng }, 'pin'); }) : null,
        btn('↑', 'Earlier on the way', () => shift(k, -1), k === 0), btn('↓', 'Later on the way', () => shift(k, 1), k === stops.length - 1),
        btn('✕', 'Remove this place from the journey', () => { const list = stops.slice(); list.splice(k, 1); setStops(list); }));
      const dates = s.kind !== 'stop' ? null : row(
        dateField('Arrived', `facts.${i}.stops.${k}.date`, 'fact:' + s.id, s.date, 'YYYY-MM-DD, 1776, 44 BC', { obj: s, end: false, min: s.dateMin, max: s.dateMax, minBind: `facts.${i}.stops.${k}.dateMin`, maxBind: `facts.${i}.stops.${k}.dateMax` }),
        dateField('Left', `facts.${i}.stops.${k}.dateEnd`, 'fact:' + s.id + ':end', s.dateEnd, 'optional', { obj: s, end: true, min: s.dateEndMin, max: s.dateEndMax, minBind: `facts.${i}.stops.${k}.dateEndMin`, maxBind: `facts.${i}.stops.${k}.dateEndMax` }));
      return h('div', { class: 'journey-stop' }, head, dates);
    });
    const adder = UI.markerSelect({ exclude: [id], placeholder: stops.length ? '+ another place: a marker…' : '+ a place on the way: a marker…', onChange: v => { if (v) setStops(stops.concat([blankStop({ kind: 'marker', markerId: v })])); } });
    const addPoint = h('button', { type: 'button', class: 'small', title: 'A place that has no marker: click it on the map', onclick: () => { App.showTab('map'); MapView.pickPoint(ll => { if (!draft) return; const fx = draft.facts[i]; fx.stops = (fx.stops || []).concat([blankStop(point(ll))]); render(); }, 'Click on the map where the journey stops or passes'); } }, '📍 or a point on the map');
    return h('div', { class: 'fact-where fact-journey' },
      box('Starts at', 'startAt', 'where they set out from…'),
      h('div', { class: 'journey-places' },
        h('div', { class: 'journey-title' }, 'Places along the way', stops.length ? ', in the order they were reached' : ' (optional)'),
        ...rows, row(adder, h('div', { class: 'narrow' }, addPoint))),
      box('Ends at', 'endAt', 'where they arrive…'),
      renderPartOf(i),
      h('div', { class: 'muted', style: { fontSize: 'calc(11px * var(--fs))' } }, w.date || w.dateEnd || stops.length
        ? 'Whoever travels is at the start place before the journey, at each stop between its Arrived and Left dates, on the route between them, and stays at the end place afterwards, with no fact or tie of their own. A place passed has no dates and is recorded in the wording only. A dated place of their own during the journey means they left the party.'
        : 'Give the journey a date or limits first: until then nobody is placed at its start or its end.'));
  }
  // "Part of": this journey is a stretch of a longer one entered as another fact (f.partOf = { markerId, factId }).
  // It is chosen here, on the short one, so the order of entry does not matter. Facts.partLinks says which dates
  // the two then share; relations.js keeps them as limits and reports dates that disagree as a conflict.
  function renderPartOf(i) {
    const f = draft.facts[i], t = Store.factType(f.typeId);
    const factOf = p => { const m2 = p && Store.marker(p.markerId); return m2 ? (m2.facts || []).find(x => x.id === p.factId) || null : null; };
    const leadsHere = p => { for (let x = p, n = 0; x && n < 50; n++) { if (x.factId === f.id) return true; const f2 = factOf(x); x = f2 && f2.partOf; } return false; }; // a part of this one cannot be its longer journey
    const opts = [], parts = [];
    for (const m2 of Store.markers()) for (const f2 of m2.facts || []) {
      const t2 = Store.factType(f2.typeId); if (!t2 || !t2.journey || f2.id === f.id) continue;
      const name = `${m2.name} · ${f2.label || t2.name}`, trip = UI.journeyText({ startAt: f2.startAt, endAt: f2.endAt });
      if (f2.partOf && f2.partOf.factId === f.id) parts.push(name + (trip ? ` (${trip})` : ''));
      if (!(f2.partOf && leadsHere(f2.partOf))) opts.push([m2.id + '|' + f2.id, name + (trip ? ` (${trip})` : '')]);
    }
    const cur = f.partOf && factOf(f.partOf) ? f.partOf.markerId + '|' + f.partOf.factId : '';
    const sel = UI.select([['', opts.length ? '— not part of a longer journey —' : '— there is no other journey to choose —'], ...opts], cur, { title: 'When this journey is a stretch of a longer journey that is entered as its own fact (from another source), choose the longer journey here. Their dates then limit each other, and travellers named on both are placed once, by the longer journey.' });
    sel.addEventListener('change', () => { const [markerId, factId] = sel.value.split('|'); if (factId) draft.facts[i].partOf = { markerId, factId }; else delete draft.facts[i].partOf; render(); });
    const lines = [];
    const lf = cur ? factOf(f.partOf) : null;
    if (lf) {
      const nm = s => Store.stopName(s);
      for (const x of Facts.partLinks(f, t, lf, Store.factType(lf.typeId))) {
        if (x.what === 'from') lines.push(!x.same ? 'It sets out no earlier than the longer journey sets out.' : x.at === 'start' ? 'It sets out when the longer journey sets out (the same start place).' : `It sets out when the longer journey leaves ${nm(x.lStop)}.`);
        else if (x.what === 'stop') lines.push(`Its stop at ${nm(x.sStop)} is the longer journey's stop there.`);
        else if (x.what === 'until') lines.push(!x.same ? 'It arrives no later than the longer journey arrives.' : x.at === 'end' ? 'It arrives when the longer journey arrives (the same end place).' : `It arrives when the longer journey arrives at ${nm(x.lStop)}.`);
      }
      lines.push('Where the two give different dates, that is listed under ⚠ Conflicts; the app does not choose between them. Travellers named on both are placed once, by the longer journey.');
    }
    return h('div', { class: 'journey-partof' },
      h('div', { class: 'field' }, 'Part of a longer journey', sel),
      lines.length ? h('div', { class: 'rel-caption' }, ...lines.map(x => h('div', {}, x))) : null,
      parts.length ? h('div', { class: 'muted', style: { fontSize: 'calc(11px * var(--fs))', marginBottom: '6px' } }, 'Entered as part of this journey: ' + parts.join('; ') + '.') : null);
  }
  function renderRole(i, role) {
    const f = draft.facts[i];
    const mine = f.participants.map((p, idx) => ({ p, idx })).filter(x => x.p.roleId === role.id);
    // On a journey with stops, each traveller can make only part of it: "joins at" (the start or a stop) and
    // "leaves at" (a stop or the end). Stored on the participant as the stop's id; absent = the start / the end.
    const t = Store.factType(f.typeId), all = f.stops || [], stops = t && t.journey && role.goes ? Store.stopsOf(f) : [];
    const partRow = (p, idx) => {
      if (!stops.length) return null;
      const opts = stops.map(s => [s.id, `${all.indexOf(s) + 1}. ${Store.stopName(s)}`]);
      const cur = key => (stops.some(s => s.id === p[key]) ? p[key] : '');
      const sel = (key, first, title) => { const e = UI.select(key === 'joinAt' ? [['', first], ...opts] : [...opts, ['', first]], cur(key), { title }); e.addEventListener('change', () => { const q = draft.facts[i].participants[idx]; if (e.value) q[key] = e.value; else delete q[key]; render(); }); return e; };
      const wrong = cur('joinAt') && cur('leaveAt') && stops.findIndex(s => s.id === p.joinAt) > stops.findIndex(s => s.id === p.leaveAt);
      return h('div', { class: 'journey-part' },
        row(h('label', { class: 'field' }, 'joins at', sel('joinAt', 'the start', 'Where this traveller joins the party. Before the party arrives there, the journey does not place them.')),
          h('label', { class: 'field' }, 'leaves at', sel('leaveAt', 'the end', 'Where this traveller leaves the party. They stay there until their own next location.'))),
        wrong ? h('div', { class: 'rel-caption conflict' }, '⚠ They join after they leave, so the journey places them nowhere.') : null);
    };
    const items = mine.flatMap(({ p, idx }) => [row(
      UI.markerSelect({ value: p.markerId, exclude: [id], placeholder: `${role.name}…`, onChange: v => { if (v) draft.facts[i].participants[idx].markerId = v; } }),
      h('button', { type: 'button', class: 'small narrow', title: 'Remove', onclick: () => { draft.facts[i].participants.splice(idx, 1); render(); } }, '✕')), partRow(p, idx)]);
    const adder = UI.markerSelect({ exclude: [id, ...mine.map(x => x.p.markerId)], placeholder: mine.length ? `+ another ${role.name.toLowerCase()}…` : `${role.name}…`, onChange: v => { if (v) { draft.facts[i].participants.push({ roleId: role.id, markerId: v }); render(); } } });
    const tie = Store.linkType(role.tieTypeId);
    return h('div', { class: 'fact-role' }, h('div', { class: 'muted', style: { fontSize: 'calc(12px * var(--fs))' } }, role.name, tie ? h('span', { class: 'muted' }, ` · tie: ${tie.name}`) : h('span', { class: 'muted' }, ' · no tie type set'),
      role.goes ? h('span', { class: 'muted', title: 'Set in Library → Fact types. Everyone named here is placed where this fact is, over its dates.' }, ' · they go there too') : null), ...items, row(adder));
  }
  function renderAddFact() {
    const sel = typeSelect(null, v => { addFact(v); });
    sel.value = '';
    sel.insertBefore(h('option', { value: '', selected: true }, '— choose what happened —'), sel.firstChild);
    return h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'muted', style: { flex: 'none' } }, '+ Add fact:'), sel);
  }
  function addFact(typeId) {
    const t = Store.factType(typeId); if (!t) return;
    const f = { id: Store.uid(), typeId, label: '', date: '', dateEnd: '', where: null, placeLabel: '', participants: [], details: {}, note: '', sourceId: null, page: '' };
    const tt = MapView.time();
    if (t.hasDate !== false && tt != null && t.id !== 'ft_born' && t.id !== 'ft_died') f.date = '';
    if (typeId === 'ft_named') f.details = { Name: '', Kind: 'nickname' };
    draft.facts.push(f);
    draft.facts.slice(-1).forEach(f => openFacts.add(f.id)); render();
    const cards = drawer.querySelectorAll('.fact-card');
    const last = cards[sortedFactIndexes().indexOf(draft.facts.length - 1)];
    if (last) { last.scrollIntoView({ block: 'center' }); const first = last.querySelector('input[type=text]:not([readonly])'); if (first) first.focus(); }
  }

  // ---------- portrait & images ----------
  function renderPortrait() {
    const p = draft.photoId && Store.photo(draft.photoId);
    const pickBtn = h('button', { type: 'button', class: 'small', onclick: async () => { const ids = await Photos.pick(); if (ids.length && draft) { draft.photoId = ids[0]; render(); } } }, p ? 'Change…' : '🖼️ Choose or upload…');
    return h('div', { class: 'ed-photo' },
      p ? h('div', { style: { cursor: 'zoom-in' }, onclick: () => Photos.view(p.id) }, Photos.thumbEl(p, 64)) : h('div', { class: 'photo-thumb missing', style: { width: '64px', height: '64px' } }, '👤'),
      h('div', {}, h('div', { class: 'row', style: { gap: '6px' } }, pickBtn,
        p ? h('button', { type: 'button', class: 'small', onclick: () => Photos.edit(p.id) }, 'Details') : null,
        p ? h('button', { type: 'button', class: 'small', onclick: () => { draft.photoId = null; render(); } }, 'Remove') : null),
        h('div', { class: 'muted', style: { fontSize: 'calc(11px * var(--fs))', marginTop: '4px' } }, p ? p.title : 'Shown on the map pin, in the graphs and in the bubble.')));
  }
  function renderGallery() {
    const items = draft.photoIds.map(pid => Store.photo(pid)).filter(Boolean).map(p => h('div', { class: 'g-item' },
      h('div', { style: { cursor: 'zoom-in' }, onclick: () => Photos.view(p.id), title: p.title }, Photos.thumbEl(p, 64)),
      h('button', { type: 'button', class: 'small', title: 'Remove from this marker', onclick: () => { draft.photoIds = draft.photoIds.filter(x => x !== p.id); render(); } }, '✕')));
    return h('div', {}, h('div', { class: 'ed-gallery' }, items),
      h('button', { type: 'button', class: 'small', style: { marginTop: '6px' }, onclick: async () => { const ids = await Photos.pick({ multi: true, exclude: draft.photoIds }); if (ids.length && draft) { draft.photoIds.push(...ids); render(); } } }, '+ Add images'));
  }

  // ---------- fields (a tree: "Born/Place" is the sub-field Place under Born) ----------
  function renderFields() {
    const keys = Object.keys(draft.fields);
    if (!keys.length) return h('p', { class: 'muted', style: { margin: '2px 0' } }, 'No fields. Fields come from the category, or add your own.');
    const tree = UI.fieldTree(draft.fields);
    const out = [];
    const walk = (node, depth) => {
      const k = node.key;
      const fs = draft.fieldSources[k] || { sourceId: null, page: '' };
      const graded = !!(draft.fieldGrades[k] && draft.fieldGrades[k].confidence);
      const srcRow = h('div', { class: 'kv-src' + (fs.sourceId || graded ? ' on' : ''), style: { marginLeft: `calc(34% + ${depth * 14}px)`, flexWrap: 'wrap' } },
        UI.sourceSelect({ value: fs.sourceId, noneLabel: '— source for this field —', onChange: v => {
          if (v) draft.fieldSources[k] = { sourceId: v, page: (draft.fieldSources[k] || {}).page || '' };
          else delete draft.fieldSources[k];
          render();
        } }),
        fs.sourceId ? h('input', { type: 'text', value: fs.page, placeholder: 'page / location', style: { flex: '0 0 30%' }, oninput: e => { draft.fieldSources[k].page = e.target.value; } }) : null,
        h('div', { class: 'narrow' }, UI.confidenceSelect((draft.fieldGrades[k] || {}).confidence, v => { if (v) draft.fieldGrades[k] = { confidence: v, reason: (draft.fieldGrades[k] || {}).reason || '' }; else delete draft.fieldGrades[k]; render(); })),
        (draft.fieldGrades[k] || {}).confidence ? h('input', { type: 'text', value: draft.fieldGrades[k].reason || '', placeholder: 'why this grade', style: { flex: '1 1 160px' }, oninput: e => { draft.fieldGrades[k].reason = e.target.value; } }) : null);
      out.push(h('div', { class: 'kv-block', style: { marginLeft: depth * 14 + 'px' } },
        h('div', { class: 'kv-row' },
          h('input', { type: 'text', class: 'k', value: (depth ? '↳ ' : '') + node.name, disabled: true, title: k }),
          h('input', { type: 'text', class: 'v', 'data-field': k, value: draft.fields[k] ?? '', placeholder: node.children.length ? '(optional summary)' : '' }),
          h('button', { type: 'button', class: 'small' + (fs.sourceId || graded ? ' src-on' : ''), title: fs.sourceId ? 'Source attached: ' + Store.sourceLabel(fs.sourceId) : 'Attach a source or a confidence grade to this field', onclick: () => { srcRow.classList.toggle('open'); } }, '📖'),
          h('button', { type: 'button', class: 'small', title: `Add a sub-field under "${node.name}"`, onclick: () => {
            const name = prompt(`Name of the sub-field under "${node.name}":`);
            if (!name || !name.trim()) return;
            const sub = k + '/' + name.trim().replace(/\//g, '-');
            if (!(sub in draft.fields)) draft.fields[sub] = '';
            render();
          } }, '＋'),
          h('button', { type: 'button', class: 'small', title: node.children.length ? 'Remove this field and its sub-fields' : 'Remove field', onclick: () => {
            if (node.children.length && !confirm(`Remove "${node.name}" and its ${node.children.length} sub-field(s)?`)) return;
            for (const kk of Object.keys(draft.fields)) if (kk === k || kk.startsWith(k + '/')) { delete draft.fields[kk]; delete draft.fieldSources[kk]; delete draft.fieldGrades[kk]; }
            render();
          } }, '✕')),
        srcRow));
      node.children.forEach(c => walk(c, depth + 1));
    };
    tree.forEach(n => walk(n, 0));
    return out;
  }

  // ---------- citations ----------
  function renderCitations() {
    if (!draft.citations.length) return h('p', { class: 'muted', style: { margin: '2px 0' } }, 'No citations yet.');
    return draft.citations.map((c, i) => h('div', { class: 'card' },
      row(UI.sourceSelect({ value: c.sourceId, onChange: v => { draft.citations[i].sourceId = v; render(); } }),
          h('input', { type: 'text', 'data-bind': `citations.${i}.page`, value: c.page, placeholder: 'page / chapter / location', style: { flex: '0 0 36%' } }),
          h('button', { type: 'button', class: 'small narrow', title: 'Remove citation', onclick: () => { draft.citations.splice(i, 1); render(); } }, '✕')),
      row(h('input', { type: 'text', 'data-bind': `citations.${i}.note`, value: c.note, placeholder: 'what this source says / how reliable it is' }))));
  }

  // ---------- time gaps ----------
  function renderRelations() {
    if (isNew) return h('p', { class: 'hint' }, 'Save the marker first, then you can tie its dates to other dates ("130 years after Adam was born", "not before Sarai was born").');
    const rels = Store.relationsFor(id);
    const out = [];
    if (!rels.length) out.push(h('p', { class: 'muted' }, 'No time gaps yet.'));
    for (const r of rels) {
      const over = r.status === 'overruled';
      out.push(h('div', { class: 'tie-item' + (over ? ' overruled' : '') },
        h('span', { class: 'rel-badge chain' }, '⛓'),
        h('div', { class: 'grow' }, h('div', {}, Relations.describeRelation(r)),
          h('div', { class: 'sub' }, [over ? 'overruled' : null, r.note, r.sourceId && Store.source(r.sourceId) ? `📖 ${Store.source(r.sourceId).title}${r.page ? ', ' + r.page : ''}` : null].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'small', title: 'Edit this time gap: its length, after or before, the dates it joins, its source and note', onclick: () => Relations.pick(r.to, { edit: r.id, onDone: () => syncDraftFromStore(true) }) }, '✏️ Edit'),
        h('button', { type: 'button', class: 'small', title: over ? 'Use this time gap again' : 'Keep the record but leave it out of the maths', onclick: () => Store.updateRelation(r.id, { status: over ? 'active' : 'overruled' }) }, over ? 'Restore' : 'Overrule'),
        h('button', { type: 'button', class: 'small', title: 'Delete time gap', onclick: () => { if (confirm('Delete this time gap?')) Store.deleteRelation(r.id); } }, '✕')));
    }
    const slots = Store.slotsOfMarker(id);
    if (slots.length) {
      const sel = UI.select(slots.map(s => [Store.refKey(s.ref), s.label]), Store.refKey(slots[0].ref));
      out.push(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'muted', style: { flex: 'none' } }, 'Relate'), sel,
        h('button', { type: 'button', class: 'small', style: { flex: 'none' }, onclick: () => { if (!sel.value) return; Relations.pick(Store.parseRefKey(sel.value), { onDone: () => syncDraftFromStore(true) }); } }, '⛓ to another date…')));
    } else out.push(h('p', { class: 'muted' }, 'Add a dated fact and save, then a time gap can be attached to it.'));
    return out;
  }

  return { init, open, openNew, cancel, isOpen, changeBorderHere, park, unpark, resume };
})();
