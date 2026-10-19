/* Marker editor: a right-hand drawer. Edits a draft copy of the marker; links are saved immediately. */
window.Editor = (() => {
  const { h, esc } = UI;
  let drawer, draft = null, id = null, isNew = false;
  let linkForm = null; // { editId, typeId, dir, otherId, start, end, note, label }

  function init() {
    drawer = document.getElementById('drawer');
    drawer.addEventListener('input', onInput);
    drawer.addEventListener('change', onInput);
    Store.subscribe(evt => {
      if (!draft) return;
      if (evt.type === 'all') {
        if (evt.sync) { // a background sync merged data: keep editing unless this marker vanished
          if (!isNew && !Store.marker(id)) { UI.toast('This marker was deleted on another device', 'error'); draft = null; id = null; drawer.classList.add('hidden'); }
          else renderLinks();
          return;
        }
        draft = null; id = null; isNew = false; drawer.classList.add('hidden'); return;
      }
      if (evt.type === 'link' || evt.type === 'linkType') renderLinks();
      if (evt.type === 'source' || evt.type === 'photo' || evt.type === 'photos') render(); // new sources/photos must show up in the pickers
      if (evt.type === 'relation' || evt.type === 'relations') syncDraftFromStore(true);
      if (evt.type === 'marker' && evt.id === id && evt.deleted) { draft = null; id = null; drawer.classList.add('hidden'); }
    });
  }

  // Any error while building the form would otherwise leave the drawer silently closed.
  function safeRender() {
    try { render(); }
    catch (e) { console.error(e); UI.toast('Could not open the editor: ' + e.message, 'error'); throw e; }
  }
  function open(markerId) {
    const m = Store.marker(markerId); if (!m) return;
    discardNew();
    id = markerId; isNew = false;
    draft = JSON.parse(JSON.stringify(m));
    draft.citations = draft.citations || [];
    draft.moves = draft.moves || [];
    draft.fields = draft.fields || {};
    draft.fieldSources = draft.fieldSources || {};
    draft.pinned = draft.pinned || []; draft.undetermined = draft.undetermined || []; draft.derived = draft.derived || {};
    linkForm = null;
    safeRender();
    drawer.classList.remove('hidden');
    drawer.querySelector('[data-bind="name"]')?.focus();
  }
  // A new marker lives only in the draft until it is saved (so cancelling leaves nothing behind).
  function openNew(data = {}) {
    discardNew();
    draft = Object.assign({ id: Store.uid(), name: 'New marker', kind: 'pin', categoryId: null, color: '', icon: '', summary: '', description: '',
      fields: {}, fieldSources: {}, start: '', startLabel: '', end: '', endLabel: '', moves: [], sources: '', citations: [], tags: [], photoId: null, photoIds: [], pinned: [], undetermined: [], derived: {} }, JSON.parse(JSON.stringify(data)));
    draft.moves = draft.moves.map(mv => Object.assign({ id: Store.uid(), date: '', lat: null, lng: null, coords: null, label: '', note: '', sourceId: null, page: '' }, mv));
    draft.citations = draft.citations || [];
    id = draft.id; isNew = true; linkForm = null;
    applyCategoryFields();
    safeRender();
    drawer.classList.remove('hidden');
    const name = drawer.querySelector('[data-bind="name"]');
    if (name) { name.focus(); name.select(); }
  }
  function discardNew() {
    if (draft && isNew) Store.deleteMarker(id); // removes any ties already made to the unsaved marker
  }
  function isOpen() { return !!draft; }
  function cancel() {
    discardNew();
    draft = null; id = null; isNew = false;
    drawer.classList.add('hidden'); drawer.innerHTML = '';
  }
  function save() {
    const bad = [];
    if (!draft.name.trim()) bad.push('Name is required');
    if (!Dates.isValid(draft.start)) bad.push(`"${draft.start}" is not a date I understand`);
    if (!Dates.isValid(draft.end)) bad.push(`"${draft.end}" is not a date I understand`);
    draft.moves.forEach((mv, i) => { if (!Dates.isValid(mv.date)) bad.push(`Position ${i + 1}: "${mv.date}" is not a date I understand`); });
    if (bad.length) { UI.toast(bad[0], 'error'); return; }
    draft.name = draft.name.trim();
    draft.tags = (Array.isArray(draft.tags) ? draft.tags : String(draft.tags).split(',')).map(s => String(s).trim()).filter(Boolean);
    const wasNew = isNew, data = draft;
    draft = null; id = null; isNew = false;
    if (wasNew) Store.addMarker(data); else Store.updateMarker(data.id, data);
    drawer.classList.add('hidden'); drawer.innerHTML = '';
    UI.toast('Saved');
  }
  function remove() {
    if (isNew) { cancel(); return; }
    if (!confirm(`Delete "${draft.name}" and all of its ties?`)) return;
    const d = id; draft = null; id = null; isNew = false;
    drawer.classList.add('hidden'); drawer.innerHTML = '';
    Store.deleteMarker(d);
  }

  // ---------- two-way binding ----------
  function onInput(e) {
    const el = e.target;
    if (!draft || !el.isConnected) return; // an element-level handler may already have re-rendered
    if (el.dataset.field != null) { draft.fields[el.dataset.field] = el.value; return; }
    if (el.dataset.lf != null) { linkForm[el.dataset.lf] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.lf === 'typeId' && e.type === 'change') renderLinks(); return; }
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

  // Pull pins, undetermined marks and computed dates from the saved marker into the draft (relations are
  // saved immediately and the solver may have recomputed dates while the editor is open).
  function syncDraftFromStore(rerender) {
    const s = !isNew && draft ? Store.marker(id) : null;
    if (!s) return;
    draft.pinned = JSON.parse(JSON.stringify(s.pinned || []));
    draft.undetermined = JSON.parse(JSON.stringify(s.undetermined || []));
    draft.derived = JSON.parse(JSON.stringify(s.derived || {}));
    const computed = slot => (draft.derived[slot] && !draft.pinned.includes(slot)) || draft.undetermined.includes(slot);
    if (computed('start')) draft.start = s.start;
    if (computed('end')) draft.end = s.end;
    draft.moves.forEach(mv => { const sm = s.moves.find(x => x.id === mv.id); if (sm && computed('move:' + mv.id)) mv.date = sm.date; });
    if (rerender) render();
  }

  // A date box with its relation controls: ⛓ relate, 🔒 pin/unpin, and a caption when the date is computed.
  function dateField(label, bind, slot, value, placeholder) {
    const ref = { kind: 'marker', id, slot };
    const st = !isNew && Store.marker(id) ? Relations.slotState(ref) : null;
    const derived = !!(st && st.derived && !st.pinned);
    const undet = !!(st && st.undetermined);
    const input = h('input', { type: 'text', 'data-bind': bind, value: undet ? '' : (value ?? ''), placeholder: undet ? 'undeterminable' : placeholder,
      readonly: derived || undet, class: derived ? 'derived-input' : '', title: derived ? 'Computed from a relation. Pin it (🔒) to type a date here.' : '' });
    const chain = h('button', { type: 'button', class: 'small icon', disabled: isNew, title: isNew ? 'Save the marker first, then relate its dates' : 'Relate this date to another date (e.g. "130 years after Adam was born")',
      onclick: () => Relations.pick(ref, { onDone: () => syncDraftFromStore(true) }) }, '⛓');
    const pin = st && (st.related || st.pinned) ? h('button', { type: 'button', class: 'small icon' + (st.pinned ? ' src-on' : ''),
      title: st.pinned ? 'Pinned: other dates are computed from this one. Click to unpin.' : 'Pin this date so the related dates are computed from it',
      onclick: () => { Store.setPinned(ref, !st.pinned); syncDraftFromStore(true); } }, '🔒') : null;
    const restore = undet ? h('button', { type: 'button', class: 'small', title: 'Stop treating this date as undeterminable', onclick: () => { Store.setUndetermined(ref, false); syncDraftFromStore(true); } }, 'Restore') : null;
    let caption = null;
    if (derived) caption = h('div', { class: 'rel-caption' }, '⛓ ' + Relations.describeDerived(ref));
    if (st && st.conflict) caption = h('div', { class: 'rel-caption conflict' }, '⚠ Two chains disagree about this date. ', h('a', { class: 'mlink', style: { color: 'inherit', cursor: 'pointer' }, onclick: () => Relations.showConflicts() }, 'Review'));
    if (undet) caption = h('div', { class: 'rel-caption' }, 'Marked undeterminable: not placed on the timeline.');
    return h('label', { class: 'field' }, label,
      h('div', { class: 'row', style: { gap: '4px' } }, input, h('div', { class: 'narrow' }, chain), pin ? h('div', { class: 'narrow' }, pin) : null, restore ? h('div', { class: 'narrow' }, restore) : null),
      caption);
  }

  // ---------- rendering ----------
  const section = (title, ...kids) => h('div', { class: 'ed-section' }, h('h3', {}, title), ...kids);
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

    const body = h('div', { class: 'drawer-body' },
      section('Basics',
        field('Name', txt('name', m.name)),
        row(field('Kind', UI.select([['pin', '📍 Pin'], ['area', '⬠ Area / border'], ['path', '➡️ Path / route']], m.kind, { 'data-bind': 'kind' })),
            field('Category', catSel)),
        row(field('Colour', row(h('div', { class: 'narrow' }, colorInput), colorReset)),
            field('Icon (emoji)', txt('icon', m.icon, { placeholder: cat ? cat.icon : '📍', maxlength: 4 }))),
        h('div', { class: 'field' }, 'Profile picture', renderProfilePhoto()),
      ),
      section('Photos',
        h('p', { class: 'hint' }, 'Extra pictures shown in the info bubble. Every photo lives in the library (Data tab) and can carry its own sources.'),
        renderGallery()),
      section('Time span',
        h('p', { class: 'hint' }, 'When the marker exists. Leave blank for "always". Dates: 1776-07-04, 1776-07, 1776, 44 BC.'),
        row(dateField('Appears', 'start', 'start', m.start, 'YYYY-MM-DD'), field('Label', txt('startLabel', m.startLabel, { placeholder: 'e.g. Born' }))),
        row(dateField('Disappears', 'end', 'end', m.end, 'YYYY-MM-DD'), field('Label', txt('endLabel', m.endLabel, { placeholder: 'e.g. Died' }))),
      ),
      section('Positions over time', h('p', { class: 'hint' }, m.kind === 'pin'
        ? 'Each row says where the marker is from that date onward. A row with no date is the starting position.'
        : 'Each row is the shape of the marker from that date onward (redraw it to show a border changing).'),
        h('div', { id: 'ed-moves' }, renderMoves()),
        h('button', { type: 'button', class: 'small', onclick: () => { draft.moves.push({ id: Store.uid(), date: draft.moves.length ? '' : '', lat: null, lng: null, coords: null, label: '', note: '' }); render(); } }, '+ Add position')),
      section('Details',
        field('Summary (one line)', txt('summary', m.summary)),
        field('Notes', h('textarea', { 'data-bind': 'description', rows: 5 }, m.description)),
        h('div', { class: 'field' }, 'Fields', h('div', { id: 'ed-fields' }, renderFields())),
        h('button', { type: 'button', class: 'small', onclick: () => { const k = prompt('Field name:'); if (k && k.trim() && !(k.trim() in draft.fields)) { draft.fields[k.trim()] = ''; render(); } } }, '+ Add field'),
        field('Tags (comma separated)', txt('tags', Array.isArray(m.tags) ? m.tags.join(', ') : m.tags)),
      ),
      section('Sources',
        h('p', { class: 'hint' }, cat && cat.sourceId && Store.source(cat.sourceId)
          ? `Default source for ${cat.name}: ${Store.sourceLabel(cat.sourceId)}. Add citations below when this marker draws on something else, or on a specific page.`
          : 'Where this information comes from. Add sources on the Data tab or with "+ New source…".'),
        h('div', { id: 'ed-cites' }, renderCitations()),
        h('button', { type: 'button', class: 'small', onclick: () => { draft.citations.push({ sourceId: null, page: '', note: '' }); render(); } }, '+ Add citation'),
        field('Source notes (free text)', h('textarea', { 'data-bind': 'sources', rows: 2, placeholder: 'Anything about the evidence that does not fit a citation' }, m.sources)),
      ),
      section('Date relations', h('div', { id: 'ed-relations' }, renderRelations())),
      section('Ties / links', h('div', { id: 'ed-links' })),
    );
    drawer.append(
      h('div', { class: 'drawer-head' }, h('h2', {}, isNew ? 'New marker' : 'Edit marker'), h('button', { class: 'icon-btn', title: 'Close without saving', onclick: cancel }, '✕')),
      body,
      h('div', { class: 'drawer-foot' },
        h('button', { class: 'primary', onclick: save }, 'Save'),
        h('button', { onclick: cancel }, 'Cancel'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'danger', onclick: remove }, 'Delete')),
    );
    renderLinks();
    body.scrollTop = scroll;
  }

  function renderProfilePhoto() {
    const p = draft.photoId && Store.photo(draft.photoId);
    const pickBtn = h('button', { type: 'button', class: 'small', onclick: async () => { const ids = await Photos.pick(); if (ids.length && draft) { draft.photoId = ids[0]; render(); } } }, p ? 'Change…' : '🖼️ Choose or upload…');
    return h('div', { class: 'ed-photo' },
      p ? h('div', { style: { cursor: 'zoom-in' }, onclick: () => Photos.view(p.id) }, Photos.thumbEl(p, 64)) : h('div', { class: 'photo-thumb missing', style: { width: '64px', height: '64px' } }, '👤'),
      h('div', {}, h('div', { class: 'row', style: { gap: '6px' } }, pickBtn,
        p ? h('button', { type: 'button', class: 'small', onclick: () => Photos.edit(p.id) }, 'Details') : null,
        p ? h('button', { type: 'button', class: 'small', onclick: () => { draft.photoId = null; render(); } }, 'Remove') : null),
        p ? h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' } }, p.title) : h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' } }, 'Shown on the map pin, in the graphs and in the info bubble.')));
  }
  function renderGallery() {
    draft.photoIds = draft.photoIds || [];
    const items = draft.photoIds.map(pid => Store.photo(pid)).filter(Boolean).map(p => h('div', { class: 'g-item' },
      h('div', { style: { cursor: 'zoom-in' }, onclick: () => Photos.view(p.id), title: p.title }, Photos.thumbEl(p, 64)),
      h('button', { type: 'button', class: 'small', title: 'Remove from this marker', onclick: () => { draft.photoIds = draft.photoIds.filter(x => x !== p.id); render(); } }, '✕')));
    return h('div', {}, h('div', { class: 'ed-gallery' }, items),
      h('button', { type: 'button', class: 'small', style: { marginTop: '6px' }, onclick: async () => { const ids = await Photos.pick({ multi: true, exclude: draft.photoIds }); if (ids.length && draft) { draft.photoIds.push(...ids); render(); } } }, '+ Add photos'));
  }

  function renderMoves() {
    const m = draft;
    if (!m.moves.length) return h('p', { class: 'muted' }, 'No position yet – this marker will not show on the map.');
    return m.moves.map((mv, i) => {
      const bad = !Dates.isValid(mv.date);
      const where = m.kind === 'pin'
        ? row(h('input', { type: 'text', 'data-bind': `moves.${i}.lat`, value: mv.lat ?? '', placeholder: 'lat' }),
              h('input', { type: 'text', 'data-bind': `moves.${i}.lng`, value: mv.lng ?? '', placeholder: 'lng' }))
        : h('span', { class: 'muted' }, mv.coords && mv.coords.length ? `${mv.coords.length} points` : 'not drawn yet');
      const setBtn = h('button', { type: 'button', class: 'small', onclick: () => setOnMap(i) }, m.kind === 'pin' ? '📍 Pick on map' : '✏️ Draw on map');
      const goBtn = h('button', { type: 'button', class: 'small', title: 'Move the map to this position', disabled: !Store.hasLocation(mv),
        onclick: () => { App.showTab('map'); MapView.showPosition(draft.moves[i], draft.kind); } }, '🎯 Go to');
      const copyBtn = h('button', { type: 'button', class: 'small', title: 'Use the date currently shown on the map time slider', onclick: () => { const tt = MapView.time(); if (tt != null) { draft.moves[i].date = Dates.iso(tt); render(); } } }, '⏱');
      return h('div', { class: 'card' + (bad ? ' invalid' : '') },
        row(dateField('', `moves.${i}.date`, 'move:' + mv.id, mv.date, 'from date (blank = start)'), h('div', { class: 'narrow' }, copyBtn),
            h('input', { type: 'text', 'data-bind': `moves.${i}.label`, value: mv.label, placeholder: 'place name' })),
        row(where, h('div', { class: 'narrow' }, goBtn), h('div', { class: 'narrow' }, setBtn),
            h('button', { type: 'button', class: 'small narrow', title: 'Remove this position', onclick: () => { draft.moves.splice(i, 1); render(); } }, '✕')),
        row(h('input', { type: 'text', 'data-bind': `moves.${i}.note`, value: mv.note, placeholder: 'note (why / what happened)' })),
        row(UI.sourceSelect({ value: mv.sourceId, onChange: v => { draft.moves[i].sourceId = v; render(); }, noneLabel: '— source —' }),
            h('input', { type: 'text', 'data-bind': `moves.${i}.page`, value: mv.page, placeholder: 'page / location', style: { flex: '0 0 40%' } })),
      );
    });
  }
  function renderRelations() {
    if (isNew) return h('p', { class: 'hint' }, 'Save the marker first, then you can relate its dates to other markers ("130 years after Adam was born").');
    const rels = Store.relationsFor(id);
    const out = [h('p', { class: 'hint' }, 'A relation ties one of this marker\'s dates to another date by a fixed gap. Pinned dates (🔒) are the anchors; the rest are computed and move with them.')];
    if (!rels.length) out.push(h('p', { class: 'muted' }, 'No date relations yet.'));
    for (const r of rels) {
      const over = r.status === 'overruled';
      out.push(h('div', { class: 'tie-item' + (over ? ' overruled' : '') },
        h('span', { class: 'rel-badge chain' }, '⛓'),
        h('div', { class: 'grow' }, h('div', {}, Relations.describeRelation(r)),
          h('div', { class: 'sub' }, [over ? 'overruled' : null, r.note, r.sourceId && Store.source(r.sourceId) ? `📖 ${Store.source(r.sourceId).title}${r.page ? ', ' + r.page : ''}` : null].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'small', title: over ? 'Use this relation again' : 'Keep the record but leave it out of the maths', onclick: () => Store.updateRelation(r.id, { status: over ? 'active' : 'overruled' }) }, over ? 'Restore' : 'Overrule'),
        h('button', { type: 'button', class: 'small', title: 'Delete relation', onclick: () => { if (confirm('Delete this relation?')) Store.deleteRelation(r.id); } }, '✕')));
    }
    const slots = Store.slotsOfMarker(id);
    const sel = UI.select(slots.map(s => [Store.refKey(s.ref), s.label]), slots.length ? Store.refKey(slots[0].ref) : '');
    out.push(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'muted', style: { flex: 'none' } }, 'Relate'), sel,
      h('button', { type: 'button', class: 'small', style: { flex: 'none' }, onclick: () => { if (!sel.value) return; Relations.pick(Store.parseRefKey(sel.value), { onDone: () => syncDraftFromStore(true) }); } }, '⛓ to another date…')));
    return out;
  }
  function renderCitations() {
    if (!draft.citations.length) return h('p', { class: 'muted', style: { margin: '2px 0' } }, 'No citations yet.');
    return draft.citations.map((c, i) => h('div', { class: 'card' },
      row(UI.sourceSelect({ value: c.sourceId, onChange: v => { draft.citations[i].sourceId = v; render(); } }),
          h('input', { type: 'text', 'data-bind': `citations.${i}.page`, value: c.page, placeholder: 'page / chapter / location', style: { flex: '0 0 36%' } }),
          h('button', { type: 'button', class: 'small narrow', title: 'Remove citation', onclick: () => { draft.citations.splice(i, 1); render(); } }, '✕')),
      row(h('input', { type: 'text', 'data-bind': `citations.${i}.note`, value: c.note, placeholder: 'what this source says / how reliable it is' }))));
  }
  function setOnMap(i) {
    App.showTab('map');
    const mv = draft.moves[i];
    if (draft.kind === 'pin') {
      MapView.pickPoint(ll => { if (!draft) return; draft.moves[i].lat = +ll.lat.toFixed(5); draft.moves[i].lng = +ll.lng.toFixed(5); render(); }, `Click on the map to place "${draft.name}"`);
    } else {
      MapView.drawShape(draft.kind, mv.coords || [], coords => { if (!draft) return; draft.moves[i].coords = coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]); render(); });
    }
  }
  // Fields form a tree: a key like "Born/Place" is the sub-field "Place" under "Born".
  function renderFields() {
    const keys = Object.keys(draft.fields);
    if (!keys.length) return h('p', { class: 'muted', style: { margin: '2px 0' } }, 'No fields. Fields come from the category, or add your own.');
    draft.fieldSources = draft.fieldSources || {};
    const tree = UI.fieldTree(draft.fields);
    const out = [];
    const walk = (node, depth) => {
      const k = node.key;
      const fs = draft.fieldSources[k] || { sourceId: null, page: '' };
      const srcRow = h('div', { class: 'kv-src' + (fs.sourceId ? ' on' : ''), style: { marginLeft: `calc(34% + ${depth * 14}px)` } },
        UI.sourceSelect({ value: fs.sourceId, noneLabel: '— source for this field —', onChange: v => {
          if (v) draft.fieldSources[k] = { sourceId: v, page: (draft.fieldSources[k] || {}).page || '' };
          else delete draft.fieldSources[k];
          render();
        } }),
        fs.sourceId ? h('input', { type: 'text', value: fs.page, placeholder: 'page / location', style: { flex: '0 0 36%' },
          oninput: e => { draft.fieldSources[k].page = e.target.value; } }) : null);
      out.push(h('div', { class: 'kv-block', style: { marginLeft: depth * 14 + 'px' } },
        h('div', { class: 'kv-row' },
          h('input', { type: 'text', class: 'k', value: (depth ? '↳ ' : '') + node.name, disabled: true, title: k }),
          h('input', { type: 'text', class: 'v', 'data-field': k, value: draft.fields[k] ?? '', placeholder: node.children.length ? '(optional summary)' : '' }),
          h('button', { type: 'button', class: 'small' + (fs.sourceId ? ' src-on' : ''), title: fs.sourceId ? 'Source attached: ' + Store.sourceLabel(fs.sourceId) : 'Attach a source to this field', onclick: () => { srcRow.classList.toggle('open'); } }, '📖'),
          h('button', { type: 'button', class: 'small', title: `Add a sub-field under "${node.name}" (e.g. Date, Place)`, onclick: () => {
            const name = prompt(`Name of the sub-field under "${node.name}":`);
            if (!name || !name.trim()) return;
            const sub = k + '/' + name.trim().replace(/\//g, '-');
            if (!(sub in draft.fields)) draft.fields[sub] = '';
            render();
          } }, '＋'),
          h('button', { type: 'button', class: 'small', title: node.children.length ? 'Remove this field and its sub-fields' : 'Remove field', onclick: () => {
            if (node.children.length && !confirm(`Remove "${node.name}" and its ${node.children.length} sub-field(s)?`)) return;
            for (const kk of Object.keys(draft.fields)) if (kk === k || kk.startsWith(k + '/')) { delete draft.fields[kk]; delete draft.fieldSources[kk]; }
            render();
          } }, '✕')),
        srcRow));
      node.children.forEach(c => walk(c, depth + 1));
    };
    tree.forEach(n => walk(n, 0));
    return out;
  }

  // ---------- links ----------
  function renderLinks() {
    const host = drawer.querySelector('#ed-links'); if (!host || !draft) return;
    host.innerHTML = '';
    const links = Store.linksOf(id);
    if (!links.length) host.append(h('p', { class: 'muted' }, 'No ties yet.'));
    for (const l of links) {
      const type = Store.linkType(l.typeId);
      const isFrom = l.fromId === id;
      const other = Store.marker(isFrom ? l.toId : l.fromId);
      const arrow = type && type.directed ? (isFrom ? '→' : '←') : '—';
      const dates = (l.start || l.end) ? `${Dates.formatInput(l.start)}${l.end ? ' – ' + Dates.formatInput(l.end) : ''}` : '';
      const src = l.sourceId && Store.source(l.sourceId) ? `📖 ${Store.source(l.sourceId).title}${l.page ? ', ' + l.page : ''}` : '';
      const badges = h('span', { html: Relations.badgesHTML({ kind: 'link', id: l.id, slot: 'start' }) + Relations.badgesHTML({ kind: 'link', id: l.id, slot: 'end' }) });
      host.append(h('div', { class: 'tie-item' },
        h('span', { class: 'swatch sm', style: { background: type ? type.color : '#999' } }),
        h('div', { class: 'grow' }, h('div', {}, h('strong', {}, type ? type.name : 'Link'), ` ${arrow} `, other ? other.name : '?', ' ', badges),
          h('div', { class: 'sub' }, [dates, l.label, l.note, src].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'small', title: 'Edit', onclick: () => { linkForm = { editId: l.id, typeId: l.typeId, dir: isFrom ? 'from' : 'to', otherId: other ? other.id : null, start: l.start, end: l.end, note: l.note, label: l.label, sourceId: l.sourceId, page: l.page }; renderLinks(); } }, '✏️'),
        h('button', { type: 'button', class: 'small', title: 'Remove tie', onclick: () => { if (confirm('Remove this tie?')) Store.deleteLink(l.id); } }, '✕')));
    }
    host.append(renderLinkForm());
  }
  function renderLinkForm() {
    const types = Store.linkTypes();
    if (!linkForm) linkForm = { editId: null, typeId: types[0]?.id || '', dir: 'from', otherId: null, start: '', end: '', note: '', label: '', sourceId: null, page: '' };
    const f = linkForm;
    const type = Store.linkType(f.typeId);
    const typeSel = UI.select([...types.map(t => [t.id, t.name]), ['__new', '+ New link type…']], f.typeId, { 'data-lf': 'typeId' });
    typeSel.addEventListener('change', e => {
      if (e.target.value === '__new') {
        const name = prompt('Name of the new link type (e.g. "Parent of", "Employed by"):');
        if (name && name.trim()) { const directed = confirm('Is this link directed (one-way, like "Parent of")?\nOK = directed, Cancel = mutual (like "Spouse of").'); const t = Store.addLinkType({ name: name.trim(), directed, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }); f.typeId = t.id; }
        else f.typeId = types[0]?.id || '';
        renderLinks();
      }
    });
    const me = draft.name || 'this marker';
    const dirSel = UI.select([
      ['from', `${me} → other${type && type.fromLabel ? ` (${me} is the ${type.fromLabel})` : ''}`],
      ['to', `other → ${me}${type && type.toLabel ? ` (${me} is the ${type.toLabel})` : ''}`],
    ], f.dir, { 'data-lf': 'dir' });
    const other = UI.markerSelect({ value: f.otherId, exclude: [id], onChange: v => { f.otherId = v; }, placeholder: 'Other marker…' });
    const submit = () => {
      if (!f.typeId || f.typeId === '__new') { UI.toast('Pick a link type', 'error'); return; }
      if (!f.otherId) { UI.toast('Pick the other marker', 'error'); return; }
      if (!Dates.isValid(f.start) || !Dates.isValid(f.end)) { UI.toast('Link dates must be like 1776-07-04', 'error'); return; }
      const data = { typeId: f.typeId, fromId: f.dir === 'from' ? id : f.otherId, toId: f.dir === 'from' ? f.otherId : id, start: f.start, end: f.end, note: f.note, label: f.label, sourceId: f.sourceId || null, page: f.page || '' };
      if (f.editId) Store.updateLink(f.editId, data); else Store.addLink(data);
      linkForm = null; renderLinks();
    };
    return h('div', { class: 'card', style: { marginTop: '8px' } },
      h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, f.editId ? 'Edit tie' : 'Add a tie'),
      row(field('Type', typeSel)),
      type && type.directed ? row(field('Direction', dirSel)) : null,
      row(field('Other marker', other)),
      row(field('From', h('input', { type: 'text', 'data-lf': 'start', value: f.start, placeholder: 'date (optional)' })), field('Until', h('input', { type: 'text', 'data-lf': 'end', value: f.end, placeholder: 'date (optional)' }))),
      row(field('Label', h('input', { type: 'text', 'data-lf': 'label', value: f.label, placeholder: 'e.g. "as President"' }))),
      row(field('Note', h('input', { type: 'text', 'data-lf': 'note', value: f.note, placeholder: 'why / evidence' }))),
      row(field('Source', UI.sourceSelect({ value: f.sourceId, onChange: v => { f.sourceId = v; renderLinks(); } })),
          field('Page / location', h('input', { type: 'text', 'data-lf': 'page', value: f.page, placeholder: 'optional' }))),
      row(h('button', { type: 'button', class: 'primary small', onclick: submit }, f.editId ? 'Update tie' : '+ Add tie'),
          f.editId ? h('button', { type: 'button', class: 'small', onclick: () => { linkForm = null; renderLinks(); } }, 'Cancel') : null));
  }

  return { init, open, openNew, cancel, isOpen };
})();
