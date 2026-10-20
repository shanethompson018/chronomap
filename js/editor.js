/* Marker editor: a right-hand drawer. Edits a draft copy of the marker (name, shape, facts, fields, images,
 * citations) and saves it in one go. Time gaps are saved immediately because they join two markers. */
window.Editor = (() => {
  const { h, esc } = UI;
  let drawer, draft = null, id = null, isNew = false;
  let openFacts = new Set(); // fact ids whose full card is open (the rest show as one summary line)
  let savedSnapshot = '';    // the draft as last opened or saved, to know whether closing would lose anything
  const snapshot = () => JSON.stringify(draft);
  const isDirty = () => !!draft && snapshot() !== savedSnapshot;
  const SECTIONS_KEY = 'chronomap.editorSections';
  function sectionState() { try { return JSON.parse(localStorage.getItem(SECTIONS_KEY)) || {}; } catch (e) { return {}; } }
  function setSectionOpen(key, open) { const st = sectionState(); st[key] = open; try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }

  function init() {
    drawer = document.getElementById('drawer');
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
    return { id: Store.uid(), name: 'New marker', kind: 'pin', categoryId: null, color: '', icon: '', summary: '', description: '', sex: '',
      fields: {}, fieldSources: {}, fieldGrades: {}, facts: [], sources: '', citations: [], tags: [], photoId: null, photoIds: [], pinned: [], undetermined: [], derived: {} };
  }
  function tidy(d) {
    d.facts = d.facts || []; d.citations = d.citations || []; d.fields = d.fields || {}; d.fieldSources = d.fieldSources || {}; d.fieldGrades = d.fieldGrades || {};
    d.pinned = d.pinned || []; d.undetermined = d.undetermined || []; d.derived = d.derived || {}; d.photoIds = d.photoIds || [];
    d.facts.forEach(f => { f.participants = f.participants || []; f.details = f.details || {}; });
    return d;
  }
  function open(markerId) {
    const m = Store.marker(markerId); if (!m) return;
    discardNew();
    id = markerId; isNew = false;
    draft = tidy(JSON.parse(JSON.stringify(m)));
    openFacts = new Set();
    savedSnapshot = snapshot();
    safeRender();
    drawer.classList.remove('hidden');
    drawer.querySelector('[data-bind="name"]')?.focus();
  }
  // A new marker lives only in the draft until it is saved (so cancelling leaves nothing behind).
  function openNew(data = {}) {
    discardNew();
    draft = tidy(Object.assign(blankMarker(), JSON.parse(JSON.stringify(data))));
    draft.facts.forEach(f => { f.id = f.id || Store.uid(); });
    openFacts = new Set(draft.facts.map(f => f.id));
    id = draft.id; isNew = true;
    applyCategoryFields();
    savedSnapshot = snapshot();
    safeRender();
    drawer.classList.remove('hidden');
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
      if ((f.dateMin && !f.dateMax) || (!f.dateMin && f.dateMax)) { /* one-sided limit: allowed */ }
    });
    if (bad.length) { UI.toast(bad[0], 'error'); return; }
    draft.name = draft.name.trim();
    draft.tags = (Array.isArray(draft.tags) ? draft.tags : String(draft.tags).split(',')).map(s => String(s).trim()).filter(Boolean);
    const wasNew = isNew, data = draft;
    draft = null; isNew = false; // the store event must not be taken for an outside change
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
    if (!draft || !el.isConnected) return; // an element-level handler may already have re-rendered
    if (el.dataset.field != null) { draft.fields[el.dataset.field] = el.value; return; }
    const path = el.dataset.bind; if (!path) return;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    const parts = path.split('.');
    let obj = draft;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    const key = parts[parts.length - 1];
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
    draft.pinned = JSON.parse(JSON.stringify(s.pinned || []));
    draft.undetermined = JSON.parse(JSON.stringify(s.undetermined || []));
    draft.derived = JSON.parse(JSON.stringify(s.derived || {}));
    const reckoned = slot => (draft.derived[slot] && !draft.pinned.includes(slot)) || draft.undetermined.includes(slot);
    draft.facts.forEach(f => {
      const sf = s.facts.find(x => x.id === f.id); if (!sf) return;
      if (reckoned('fact:' + f.id)) f.date = sf.date;
      if (reckoned('fact:' + f.id + ':end')) f.dateEnd = sf.dateEnd;
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
    const open = hasRange || approxOpen.has(slot);
    const input = h('input', { type: 'text', 'data-bind': bind, value: undet ? '' : (value ?? ''), placeholder: undet ? 'undeterminable' : (open ? 'most likely (optional)' : placeholder),
      readonly: reckoned || undet, class: reckoned ? 'derived-input' : '', title: reckoned ? 'Reckoned from a time gap. Anchor it (🔒) to type a date here.' : '' });
    let approxRow = null, approxTick = null;
    if (approx && !undet) {
      approxTick = h('input', { type: 'checkbox', checked: open, title: 'Approximate: give the earliest and latest it could be', disabled: reckoned, onchange: e => { if (e.target.checked) approxOpen.add(slot); else { approxOpen.delete(slot); const f = draft.facts[approx.i]; if (approx.end) { f.dateEndMin = ''; f.dateEndMax = ''; } else { f.dateMin = ''; f.dateMax = ''; } } render(); } });
      if (open) approxRow = h('div', { class: 'row approx-row', style: { gap: '4px' } },
        h('span', { class: 'muted', style: { flex: 'none', fontSize: '11px' } }, 'earliest'),
        h('input', { type: 'text', 'data-bind': approx.minBind, value: approx.min || '', placeholder: 'YYYY', readonly: reckoned, class: reckoned ? 'derived-input' : '' }),
        h('span', { class: 'muted', style: { flex: 'none', fontSize: '11px' } }, 'latest'),
        h('input', { type: 'text', 'data-bind': approx.maxBind, value: approx.max || '', placeholder: 'YYYY', readonly: reckoned, class: reckoned ? 'derived-input' : '' }));
    }
    const chain = h('button', { type: 'button', class: 'small icon', disabled: !inStore, title: !inStore ? 'Save the marker first, then you can add a time gap to this date' : 'Time gap: relate this date to another date (e.g. "130 years after Adam was born")',
      onclick: () => Relations.pick(ref, { onDone: () => syncDraftFromStore(true) }) }, '⛓');
    const pin = st && (st.related || st.pinned) ? h('button', { type: 'button', class: 'small icon' + (st.pinned ? ' src-on' : ''),
      title: st.pinned ? 'Anchor: other dates are reckoned from this one. Click to release it.' : 'Make this date the anchor, so the related dates are reckoned from it',
      onclick: () => { Store.setPinned(ref, !st.pinned); syncDraftFromStore(true); } }, '🔒') : null;
    const restore = undet ? h('button', { type: 'button', class: 'small', title: 'Stop treating this date as undeterminable', onclick: () => { Store.setUndetermined(ref, false); syncDraftFromStore(true); } }, 'Restore') : null;
    let caption = null;
    if (reckoned) caption = h('div', { class: 'rel-caption' }, '⛓ reckoned from ' + Relations.describeDerived(ref) + (st.range && st.range.min !== st.range.max ? ` → ${Dates.formatRange(st.range.date, st.range.min, st.range.max)}` : ''));
    if (st && st.conflict) caption = h('div', { class: 'rel-caption conflict' }, '⚠ Two chains disagree about this date. ', h('a', { class: 'mlink', style: { color: 'inherit', cursor: 'pointer' }, onclick: () => Relations.showConflicts() }, 'Review'));
    if (undet) caption = h('div', { class: 'rel-caption' }, 'Marked undeterminable: not placed on the timeline.');
    return h('label', { class: 'field' }, label,
      h('div', { class: 'row', style: { gap: '4px' } }, input, approxTick ? h('div', { class: 'narrow', title: 'approximate' }, approxTick) : null, h('div', { class: 'narrow' }, chain), pin ? h('div', { class: 'narrow' }, pin) : null, restore ? h('div', { class: 'narrow' }, restore) : null),
      approxRow, caption);
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
    if (w.date) bits.push(Dates.formatRange(w.date, w.min, w.max) + (t && t.hasEnd && w.dateEnd ? ' – ' + Dates.formatRange(w.dateEnd, w.endMin, w.endMax) : ''));
    else if (f.dateMin || f.dateMax) bits.push(f.dateMin ? 'after ' + Dates.formatInput(f.dateMin) : 'before ' + Dates.formatInput(f.dateMax));
    const who = (f.participants || []).map(p => { const o = Store.marker(p.markerId); const r = t && t.roles.find(x => x.id === p.roleId); return o ? `${r ? r.name : 'with'}: ${o.name}` : ''; }).filter(Boolean).join(', ');
    let place = f.placeLabel || '';
    if (!place && f.where && f.where.kind === 'marker') place = (Store.marker(f.where.markerId) || {}).name || '';
    else if (!place && f.where && f.where.kind === 'point') place = `${(+f.where.lat).toFixed(2)}, ${(+f.where.lng).toFixed(2)}`;
    else if (!place && f.where && f.where.coords) place = `${f.where.coords.length}-point ${f.where.kind}`;
    const line = h('div', { class: 'fact-line', title: 'Open this fact', onclick: () => { openFacts.add(f.id); render(); } },
      h('span', { class: 'ed-arrow' }, '▸'),
      bits.length ? h('span', { class: 'muted' }, bits.join(' ') + ' · ') : null,
      h('strong', {}, f.label || (t ? t.name : 'Fact')),
      who ? ' · ' + who : '', place ? ' · ' + place : '',
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
            h('span', {}, when, h('strong', {}, mi.factTitle), ' · ', h('strong', {}, mi.word + ': '), o.name, mi.place ? ' · ' + mi.place : '', h('span', { class: 'muted' }, ` · from ${o.name}'s ${mi.factTitle} fact`)),
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
    // roles
    for (const role of t.roles) card.append(renderRole(i, role));
    // details
    const detailKeys = [...new Set([...(t.details || []), ...Object.keys(f.details || {})])];
    if (detailKeys.length || true) {
      const rows = detailKeys.map(k => h('div', { class: 'kv-row' },
        h('input', { type: 'text', class: 'k', value: k, disabled: true }),
        (() => { const e = h('input', { type: 'text', class: 'v', value: f.details[k] || '', placeholder: k }); e.addEventListener('input', () => { draft.facts[i].details[k] = e.value; }); return e; })(),
        h('button', { type: 'button', class: 'small', title: 'Remove detail', onclick: () => { delete draft.facts[i].details[k]; render(); } }, '✕')));
      card.append(h('div', { class: 'fact-details' }, ...rows,
        h('button', { type: 'button', class: 'small', onclick: () => { const k = prompt('Detail name (e.g. Cause, Outcome, Age):'); if (k && k.trim()) { draft.facts[i].details[k.trim()] = draft.facts[i].details[k.trim()] || ''; render(); } } }, '+ Detail')));
    }
    // note + source
    card.append(row(h('input', { type: 'text', 'data-bind': `facts.${i}.note`, value: f.note, placeholder: 'note: the wording, what happened, why' })));
    card.append(row(UI.sourceSelect({ value: f.sourceId, onChange: v => { draft.facts[i].sourceId = v; render(); }, noneLabel: '— source —' }),
      h('input', { type: 'text', 'data-bind': `facts.${i}.page`, value: f.page, placeholder: 'page / verse', style: { flex: '0 0 40%' } })));
    card.append(row(h('div', { class: 'narrow', style: { minWidth: '190px' } }, UI.confidenceSelect(f.confidence, v => { draft.facts[i].confidence = v; render(); })),
      f.confidence ? h('input', { type: 'text', 'data-bind': `facts.${i}.reason`, value: f.reason, placeholder: 'why this grade: ambiguity, cross-references, circumstantial evidence…' }) : h('span', { class: 'muted', style: { fontSize: '11px', alignSelf: 'center' } }, 'confidence: your own grade, never taken from the source')));
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
      parts.push(h('input', { type: 'text', 'data-bind': `facts.${i}.where.lat`, value: w.lat ?? '', placeholder: 'lat' }), h('input', { type: 'text', 'data-bind': `facts.${i}.where.lng`, value: w.lng ?? '', placeholder: 'lng' }),
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', onclick: () => { App.showTab('map'); MapView.pickPoint(ll => { if (!draft) return; draft.facts[i].where = { kind: 'point', lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }; render(); }, `Click on the map to place "${Store.factTitle(f)}"`); } }, '📍 Place on map')),
        w.lat != null && w.lat !== '' ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Drag the pin to a new place; nothing changes until you press Done', onclick: () => { App.showTab('map'); MapView.movePoint({ lat: w.lat, lng: w.lng }, ll => { if (!draft) return; draft.facts[i].where = { kind: 'point', lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }; render(); UI.toast('Pin moved in the editor. Press Save to keep it.'); }, `Drag "${Store.factTitle(f)}" to its new place (or click the map), then press Done`); } }, '✥ Move pin')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', disabled: w.lat == null, title: 'Move the map to this place', onclick: () => { App.showTab('map'); MapView.showPosition({ lat: w.lat, lng: w.lng }, 'pin'); } }, '🎯')));
    } else if (w && (w.kind === 'area' || w.kind === 'route')) {
      const has = !!(w.coords && w.coords.length);
      const fromPicture = (coords, rough) => { if (!draft) return; draft.facts[i].where = Object.assign({}, draft.facts[i].where, { kind: w.kind, coords, rough: w.kind === 'area' ? rough : [] }); render(); UI.toast('Outline drafted from the picture. Press Save to keep it.'); };
      parts.push(h('span', { class: 'muted' }, has ? `${w.coords.length} corners` : 'not drawn yet'),
        has ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Drag, add or delete corners and simplify; nothing changes until you press Done', onclick: () => startEdit(i, 'coords') }, w.kind === 'area' ? '✥ Edit border' : '✥ Edit route')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: has ? 'Throw the outline away and click a new one' : 'Click the corners on the map', onclick: () => { App.showTab('map'); MapView.drawShape(w.kind === 'area' ? 'area' : 'path', [], coords => { if (!draft) return; const cur = draft.facts[i].where || {}; draft.facts[i].where = Object.assign({}, cur, { kind: w.kind, coords: coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), rough: [] }); render(); }); } }, has ? '↺ Redraw' : '✏️ Draw on map')),
        window.Overlay && Overlay.isActive() ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Click inside a tinted region of the overlaid picture; its outline becomes this shape', onclick: () => Overlay.fill(fromPicture) }, '⬚ Fill from picture')) : null,
        window.Overlay && Overlay.isActive() ? h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', title: 'Click a drawn line on the overlaid picture; the app follows it', onclick: () => Overlay.trace(fromPicture) }, '〰 Trace from picture')) : null,
        h('div', { class: 'narrow' }, h('button', { type: 'button', class: 'small', disabled: !(w.coords && w.coords.length), title: 'Move the map to this shape', onclick: () => { App.showTab('map'); MapView.showPosition({ coords: w.coords }, w.kind === 'area' ? 'area' : 'path'); } }, '🎯')));
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
      h('span', { class: 'muted', style: { fontSize: '12px', flex: 'none' } }, sum.length ? sum.join(' · ') : 'all edges firm, no extent'),
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
    App.showTab('map');
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
    const m = UI.modal({ title: which === 'extent' ? 'Edges of the extent outline' : 'Edges of the border', body, width: '420px', side: true, onClose: () => MapView.hideVertexNumbers() });
  }
  function renderRole(i, role) {
    const f = draft.facts[i];
    const mine = f.participants.map((p, idx) => ({ p, idx })).filter(x => x.p.roleId === role.id);
    const items = mine.map(({ p, idx }) => row(
      UI.markerSelect({ value: p.markerId, exclude: [id], placeholder: `${role.name}…`, onChange: v => { if (v) draft.facts[i].participants[idx].markerId = v; } }),
      h('button', { type: 'button', class: 'small narrow', title: 'Remove', onclick: () => { draft.facts[i].participants.splice(idx, 1); render(); } }, '✕')));
    const adder = UI.markerSelect({ exclude: [id, ...mine.map(x => x.p.markerId)], placeholder: mine.length ? `+ another ${role.name.toLowerCase()}…` : `${role.name}…`, onChange: v => { if (v) { draft.facts[i].participants.push({ roleId: role.id, markerId: v }); render(); } } });
    const tie = Store.linkType(role.tieTypeId);
    return h('div', { class: 'fact-role' }, h('div', { class: 'muted', style: { fontSize: '12px' } }, role.name, tie ? h('span', { class: 'muted' }, ` · tie: ${tie.name}`) : h('span', { class: 'muted' }, ' · no tie type set')), ...items, row(adder));
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
        h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' } }, p ? p.title : 'Shown on the map pin, in the graphs and in the bubble.')));
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
    if (isNew) return h('p', { class: 'hint' }, 'Save the marker first, then you can relate its dates to other markers ("130 years after Adam was born").');
    const rels = Store.relationsFor(id);
    const out = [h('p', { class: 'hint' }, 'A time gap ties one of this marker\'s dates to another date by a fixed gap. Anchors (🔒) are the fixed dates; the rest are reckoned from them.')];
    if (!rels.length) out.push(h('p', { class: 'muted' }, 'No time gaps yet.'));
    for (const r of rels) {
      const over = r.status === 'overruled';
      out.push(h('div', { class: 'tie-item' + (over ? ' overruled' : '') },
        h('span', { class: 'rel-badge chain' }, '⛓'),
        h('div', { class: 'grow' }, h('div', {}, Relations.describeRelation(r)),
          h('div', { class: 'sub' }, [over ? 'overruled' : null, r.note, r.sourceId && Store.source(r.sourceId) ? `📖 ${Store.source(r.sourceId).title}${r.page ? ', ' + r.page : ''}` : null].filter(Boolean).join(' · '))),
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

  return { init, open, openNew, cancel, isOpen, changeBorderHere };
})();
