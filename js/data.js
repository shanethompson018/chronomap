/* Library tab: sync, time gaps, sources, images, categories, fact types, tie types, the marker table, and backup / restore. */
window.DataTab = (() => {
  const { h } = UI;
  let host, search = '';
  // Sub-tabs: one section shows at a time; the last one opened is remembered on this device.
  const SUBS = [['sync', 'Sync', () => syncSection()], ['gaps', 'Time gaps', () => relationsSection()], ['sources', 'Sources', () => sourcesSection()],
    ['images', 'Images', () => photosSection()], ['categories', 'Categories', () => categoriesSection()], ['facttypes', 'Fact types', () => factTypesSection()],
    ['tietypes', 'Tie types', () => linkTypesSection()], ['markers', 'Markers', () => markersSection()], ['backup', 'Backup', () => backupSection()]];
  const SUB_KEY = 'chronomap.librarySub';
  let sub = (() => { try { return localStorage.getItem(SUB_KEY) || 'sync'; } catch (e) { return 'sync'; } })();
  function setSub(key) { if (!SUBS.some(s => s[0] === key)) return; sub = key; try { localStorage.setItem(SUB_KEY, key); } catch (e) { /* ignore */ } render(); }

  function init() {
    host = document.getElementById('data-page');
    Store.subscribe(evt => { if (App.currentTab() === 'data' && !(evt.type === 'photos' && document.activeElement && host.contains(document.activeElement))) render(); });
    document.addEventListener('chrono-sync', e => { if (App.currentTab() === 'data' && e.detail && e.detail.state !== 'syncing' && !(document.activeElement && host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) render(); });
  }
  function show(which) { if (which) setSub(which); else render(); }

  const KIND_OPTS = [['pin', 'Pin'], ['area', 'Area'], ['path', 'Path']];

  function render() {
    const scroll = host.scrollTop;
    host.innerHTML = '';
    const cur = SUBS.find(s => s[0] === sub) || SUBS[0];
    host.append(h('div', { class: 'subtabs' }, ...SUBS.map(([key, label]) => h('button', { class: 'subtab' + (key === cur[0] ? ' active' : ''), onclick: () => setSub(key) }, label))));
    host.append(cur[2]());
    host.scrollTop = scroll;
  }

  function cell(value, onChange, extra = {}) {
    const inp = h('input', Object.assign({ type: 'text', value: value ?? '' }, extra));
    inp.addEventListener('change', () => onChange(inp.value));
    return h('td', {}, inp);
  }
  function cellInput(value, onChange, placeholder) { const inp = h('input', { type: 'text', value: value ?? '', placeholder, style: { marginTop: '3px' } }); inp.addEventListener('change', () => onChange(inp.value)); return inp; }
  function colorCell(value, onChange) {
    const inp = h('input', { type: 'color', value: value || '#888888' });
    inp.addEventListener('change', () => onChange(inp.value));
    return h('td', { class: 'narrow' }, inp);
  }

  function syncSection() {
    const s = Store.settings();
    const st = Sync.status();
    const statusLine = h('div', { id: 'sync-status-line' });
    const paint = () => {
      if (!statusLine.isConnected && paint.armed) { document.removeEventListener('chrono-sync', paint); return; }
      paint.armed = true;
      const cur = Sync.status();
      statusLine.innerHTML = '';
      statusLine.append(h('strong', {}, { off: 'Not signed in', signin: 'Signed out (sign in to sync)', syncing: cur.text, ok: 'Signed in · ' + cur.text, error: 'Sync failed', offline: 'Offline' }[cur.state] || cur.text));
      if (cur.state === 'error' && Sync.lastError()) statusLine.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, Sync.lastError().message));
      const ss = Store.settings();
      if (ss.driveUser) statusLine.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Google account: ', h('strong', {}, ss.driveUser), ' (every device must show the same account)'));
      if (ss.driveLastSync) statusLine.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Last successful sync: ' + new Date(ss.driveLastSync).toLocaleString()));
      const rp = ss.driveLastReport;
      if (rp && rp.after) {
        const c = x => `${x.markers} marker${x.markers === 1 ? '' : 's'}, ${x.sources} source${x.sources === 1 ? '' : 's'}, ${x.photos} image${x.photos === 1 ? '' : 's'}`;
        statusLine.append(h('div', { class: 'muted', style: { fontSize: '12px' } },
          `Drive file had ${c(rp.remote)}` + (rp.remoteModified ? ` (last written ${new Date(rp.remoteModified).toLocaleString()})` : '') + `; this device had ${c(rp.before)}; now both have ${c(rp.after)}`
          + (rp.uploaded ? ' · this device wrote the file' : ' · nothing to write') + (rp.copies > 1 ? ` · merged ${rp.copies} copies of the file` : '') + (rp.extraFolders ? ` · ${rp.extraFolders} extra "Chrono Map" folder(s) in Drive are ignored` : '')));
      }
    };
    paint();
    document.addEventListener('chrono-sync', paint);
    const folder = Sync.folderUrl();
    const configured = Sync.configured();
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Google Drive sync'),
      h('p', { class: 'hint' }, configured
        ? 'Keeps the same markers, ties, sources and photos on every device you sign in on. The app asks Google only for permission to manage the files it creates itself, and stores them in a "Chrono Map" folder in your Drive. Changes sync a few seconds after you make them, when the app opens, and when you press Sync.'
        : 'Sync is not configured: js/config.js has no Google client ID.'),
      statusLine,
      h('div', { class: 'backup-row', style: { marginTop: '10px' } },
        Sync.enabled() && Sync.hasToken()
          ? h('button', { class: 'primary', onclick: () => Sync.run({ interactive: true, reason: 'button' }) }, '⟳ Sync now')
          : h('button', { class: 'primary', disabled: !configured, onclick: () => Sync.signIn().then(() => render()).catch(e => UI.toast('Sign-in: ' + e.message, 'error')) }, Sync.enabled() ? '🔑 Sign in again' : '🔑 Sign in with Google'),
        Sync.enabled() ? h('button', { onclick: () => { if (confirm('Stop syncing on this device? Your data stays here and in Drive; nothing is deleted.')) { Sync.signOut(); render(); } } }, 'Sign out') : null,
        folder ? h('a', { href: folder, target: '_blank', rel: 'noopener', style: { color: 'var(--accent)' } }, 'Open the Drive folder ↗') : null,
        h('span', { class: 'spacer' }),
        s.sampleUntouched ? h('span', { class: 'muted', style: { fontSize: '12px' } }, 'This device still shows the untouched sample; the first sync will replace it with what is in Drive.') : null));
  }

  function relationsSection() {
    const rels = Store.relations();
    const conflicts = Relations.conflicts();
    const undetCount = Relations.undetermined().size;
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Time gap'), h('th', {}, 'Source'), h('th', {}, 'Confidence'), h('th', {}, 'Note'), h('th', {}, 'Status'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const r of rels) {
      const over = r.status === 'overruled';
      tb.append(h('tr', { class: over ? 'muted' : '' },
        h('td', {}, Relations.describeRelation(r)),
        h('td', {}, r.sourceId && Store.source(r.sourceId) ? `${Store.source(r.sourceId).title}${r.page ? ', ' + r.page : ''}` : ''),
        h('td', { class: 'narrow' }, UI.confidenceSelect(r.confidence, v => Store.updateRelation(r.id, { confidence: v })), r.confidence ? cellInput(r.reason, v => Store.updateRelation(r.id, { reason: v }), 'why') : null),
        cell(r.note, v => Store.updateRelation(r.id, { note: v })),
        h('td', { class: 'narrow' }, over ? 'overruled' : 'active'),
        h('td', { class: 'narrow' },
          h('button', { class: 'small', onclick: () => Store.updateRelation(r.id, { status: over ? 'active' : 'overruled' }) }, over ? 'Restore' : 'Overrule'), ' ',
          h('button', { class: 'small', onclick: () => { const ref = r.to.kind === 'marker' ? r.to : r.from; Editor.open(ref.kind === 'marker' ? ref.id : (Store.link(ref.id) || {}).fromId); } }, '✏️'), ' ',
          h('button', { class: 'small danger', onclick: () => { if (confirm('Delete this time gap?')) Store.deleteRelation(r.id); } }, '✕'))));
    }
    if (!rels.length) tb.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'No time gaps yet. Open a marker and press ⛓ beside one of its dates.')));
    return h('div', { class: 'data-section' },
      h('h2', {}, `Time gaps (${rels.length})`, h('span', { class: 'spacer' }),
        conflicts.length ? h('button', { class: 'small conflict-btn', onclick: () => Relations.showConflicts() }, `⚠ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`) : h('span', { class: 'muted', style: { fontSize: '12px' } }, 'no conflicts'),
        undetCount ? h('span', { class: 'muted', style: { fontSize: '12px', marginLeft: '10px' } }, `${undetCount} date${undetCount > 1 ? 's' : ''} not yet anchored`) : null),
      h('p', { class: 'hint' }, 'Fixed gaps between dates ("Seth\'s birth = Adam\'s birth + 130 y"). Pinned dates are the anchors; everything else is computed and moves with them. A relation that is overruled stays on record but is left out of the maths.'),
      table);
  }

  // ISBN box with a Look up button: fills the empty boxes of the source from the book services.
  function isbnCell(s) {
    const inp = h('input', { type: 'text', value: s.isbn || '', placeholder: '978…', inputmode: 'numeric', style: { width: '120px' } });
    inp.addEventListener('change', () => Store.updateSource(s.id, { isbn: Isbn.clean(inp.value) }));
    const btn = h('button', { class: 'small', title: 'Fill in title, author, year and publisher from the ISBN (needs an internet connection)' }, '🔍');
    btn.addEventListener('click', async () => {
      if (!inp.value.trim()) { inp.focus(); return; }
      btn.disabled = true; btn.textContent = '…';
      try {
        const hit = await Isbn.lookup(inp.value);
        if (!hit) { UI.toast('No book found with that ISBN', 'error'); return; }
        const cur = Store.source(s.id); const patch = { isbn: hit.isbn }; const filled = [];
        for (const k of ['title', 'author', 'year', 'where']) {
          if (hit[k] && (!cur[k] || cur[k] === 'Untitled source')) { patch[k] = hit[k]; filled.push(k === 'where' ? 'publisher' : k); }
        }
        Store.updateSource(s.id, patch);
        UI.toast(filled.length ? `Filled ${filled.join(', ')} from ${hit.from}` : `Found "${hit.title}" on ${hit.from}; every box was already filled, so nothing changed`);
      } catch (e) { UI.toast(e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = '🔍'; }
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
    return h('td', { class: 'narrow' }, h('div', { class: 'row', style: { gap: '4px' } }, inp, btn));
  }

  function sourcesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'ISBN'), h('th', {}, 'Title'), h('th', {}, 'Author'), h('th', {}, 'Year'), h('th', {}, 'Reliability'), h('th', {}, 'Where (publisher, URL, library, archive…)'), h('th', {}, 'Notes'), h('th', {}, 'Used'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const s of Store.sources()) {
      const used = Store.sourceUseCount(s.id);
      tb.append(h('tr', {},
        isbnCell(s),
        cell(s.title, v => Store.updateSource(s.id, { title: v })),
        cell(s.author, v => Store.updateSource(s.id, { author: v })),
        cell(s.year, v => Store.updateSource(s.id, { year: v }), { style: { width: '70px' } }),
        h('td', { class: 'narrow' }, UI.reliabilitySelect(s.reliability, v => Store.updateSource(s.id, { reliability: v }))),
        cell(s.where, v => Store.updateSource(s.id, { where: v }), { placeholder: 'https://… or shelf / archive reference' }),
        cell(s.notes, v => Store.updateSource(s.id, { notes: v }), { placeholder: 'reliability, edition, bias…' }),
        h('td', { class: 'narrow muted', title: 'Categories, markers, positions and ties that cite this source' }, used),
        h('td', { class: 'narrow' }, h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete source "${s.title}"? It is cited in ${used} place(s); those citations will be removed.`)) Store.deleteSource(s.id); } }, '✕'))));
    }
    if (!Store.sources().length) tb.append(h('tr', {}, h('td', { colspan: 9, class: 'muted' }, 'No sources yet. Add the texts you are working from, then attach them to categories, markers, positions and ties.')));
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Sources', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => UI.promptNewSource() }, '+ Add source')),
      h('p', { class: 'hint' }, 'The texts, documents and people your information comes from, each with a Reliability grade (how far the source can be trusted in general). For a book, type its ISBN and press 🔍 to fill in the title, author, year and publisher (needs an internet connection; empty boxes are filled, anything already typed is kept). Every fact, field and time gap can cite a source with a page, and carries its own Confidence grade, which is your judgement and is never taken from the source. The map can be filtered to a single source.'),
      table);
  }

  function photosSection() {
    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    const status = h('span', { class: 'muted' });
    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files]; fileInput.value = '';
      let n = 0;
      for (const f of files) { status.textContent = `Adding ${++n} of ${files.length}…`; try { await Photos.add(f); } catch (e) { UI.toast(`${f.name}: ${e.message}`, 'error'); } }
      status.textContent = ''; UI.toast(`Added ${n} photo(s)`);
    });
    const grid = h('div', { class: 'photo-grid' });
    const list = Store.photos();
    if (!list.length) grid.append(h('div', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'No images yet. Add portraits, maps, documents, scene photographs, then pick one as a portrait or add it to a marker.'));
    for (const p of list) {
      const users = Store.photoUsers(p.id).length;
      grid.append(h('div', { class: 'photo-tile', title: `${p.title}${users ? ` · used by ${users} marker(s)` : ''}`, onclick: () => Photos.edit(p.id) },
        Photos.thumbEl(p, 96), h('div', { class: 'photo-title' }, p.title || 'Untitled'),
        h('div', { class: 'muted', style: { fontSize: '10px' } }, `${(p.citations || []).filter(c => c.sourceId).length} source(s)${users ? ` · ${users} marker(s)` : ''}`)));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, `Images (${list.length})`, h('span', { class: 'muted', style: { fontWeight: 400, fontSize: '12px' } }, `${(Photos.totalBytes() / (1024 * 1024)).toFixed(1)} MB`), status, h('span', { class: 'spacer' }),
        h('button', { class: 'small', onclick: () => fileInput.click() }, '⬆ Add images'), fileInput),
      h('p', { class: 'hint' }, Photos.isReady()
        ? 'Click a photo to edit its title, caption, credit and sources, or to delete it. Large images are shrunk to 1600 px on the long side. Photos are stored in this browser; use "Export JSON" with photos included to back them up.'
        : 'Photo storage is still loading, or is not available in this browser.'),
      grid);
  }

  function categoriesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Icon'), h('th', {}, 'Name'), h('th', {}, 'Colour'), h('th', {}, 'Default kind'), h('th', {}, 'Fields (comma separated)'), h('th', {}, 'Default source'), h('th', {}, 'Usual facts'), h('th', {}, 'Markers'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const c of Store.categories()) {
      const count = Store.markers().filter(m => m.categoryId === c.id).length;
      const kindSel = UI.select(KIND_OPTS, c.defaultKind || 'pin');
      kindSel.addEventListener('change', () => Store.updateCategory(c.id, { defaultKind: kindSel.value }));
      const srcSel = UI.sourceSelect({ value: c.sourceId, onChange: v => Store.updateCategory(c.id, { sourceId: v }) });
      tb.append(h('tr', {},
        cell(c.icon, v => Store.updateCategory(c.id, { icon: v }), { style: { width: '50px' }, maxlength: 4 }),
        cell(c.name, v => Store.updateCategory(c.id, { name: v })),
        colorCell(c.color, v => Store.updateCategory(c.id, { color: v })),
        h('td', { class: 'narrow' }, kindSel),
        cell(c.fields.join(', '), v => Store.updateCategory(c.id, { fields: v.split(',').map(s => s.trim()).filter(Boolean) })),
        h('td', { class: 'narrow' }, srcSel),
        h('td', { class: 'narrow' }, h('button', { class: 'small', title: 'Which fact types this category offers first', onclick: () => pickFactTypes(c) }, `${Facts.defaultTypeIdsFor(c).length} facts…`)),
        h('td', { class: 'narrow muted' }, count),
        h('td', { class: 'narrow' }, h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete category "${c.name}"? Its ${count} marker(s) become uncategorised.`)) Store.deleteCategory(c.id); } }, '✕'))));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Categories', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => { const name = prompt('Category name:'); if (name && name.trim()) Store.addCategory({ name: name.trim(), color: randomColor() }); } }, '+ Add category')),
      h('p', { class: 'hint' }, 'Categories colour the markers and suggest fields. Fields listed here are added automatically to new markers of this category; write "Born/Date, Born/Place" to get sub-fields under a field. The default source applies to every marker of the category unless the marker cites its own.'),
      table);
  }

  function linkTypesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Colour'), h('th', {}, 'Directed'), h('th', {}, '"From" role'), h('th', {}, '"To" role'), h('th', {}, 'Top of hierarchy'), h('th', {}, 'Ties'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const t of Store.linkTypes()) {
      const count = Store.links().filter(l => l.typeId === t.id).length;
      const dir = h('input', { type: 'checkbox', checked: t.directed, title: 'Directed: the two ends are different kinds of thing (parent and child, killer and killed, document and signatory). Drawn as an arrow, shown with → / ← in the bubble, named by the From and To labels, and stacked by "Top of hierarchy" in the Ties tab. Unticked = mutual (Spouse of, Allied with): no arrow, no hierarchy. Test: swap the two markers; if the sentence still means the same, leave it unticked.' });
      dir.addEventListener('change', () => Store.updateLinkType(t.id, { directed: dir.checked }));
      const top = UI.select([['from', '"From" side'], ['to', '"To" side']], t.topSide || 'from', { disabled: !t.directed });
      top.addEventListener('change', () => Store.updateLinkType(t.id, { topSide: top.value }));
      tb.append(h('tr', {},
        cell(t.name, v => Store.updateLinkType(t.id, { name: v })),
        colorCell(t.color, v => Store.updateLinkType(t.id, { color: v })),
        h('td', { class: 'narrow' }, dir),
        cell(t.fromLabel, v => Store.updateLinkType(t.id, { fromLabel: v }), { placeholder: 'e.g. parent' }),
        cell(t.toLabel, v => Store.updateLinkType(t.id, { toLabel: v }), { placeholder: 'e.g. child' }),
        h('td', { class: 'narrow' }, top),
        h('td', { class: 'narrow muted' }, count),
        h('td', { class: 'narrow' }, h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete tie type "${t.name}"? Roles that use it stop making ties (${count} tie(s) now).`)) Store.deleteLinkType(t.id); } }, '✕'))));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Tie types', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => { const name = prompt('Tie type name (e.g. "Parent of", "Works for", "Phoned"):'); if (name && name.trim()) Store.addLinkType({ name: name.trim(), color: randomColor(), directed: confirm('Is this link directed (one-way, like "Parent of")?\nOK = directed, Cancel = mutual (like "Spouse of").') }); } }, '+ Add tie type')),
      h('p', { class: 'hint' }, 'Directed ties draw as arrows and can be laid out as a hierarchy. "Top of hierarchy" says which end sits above the other: for "Parent of" the From side (parent) is on top; for "Member of" the To side (the organisation) is on top.'),
      table);
  }

  // ---------- fact types ----------
  function factTypesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Date'), h('th', {}, 'Place'), h('th', {}, 'Roles → ties'), h('th', {}, 'Implies'), h('th', {}, 'Details'), h('th', {}, 'Used'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    const used = new Map();
    Store.markers().forEach(m => m.facts.forEach(f => used.set(f.typeId, (used.get(f.typeId) || 0) + 1)));
    for (const t of Store.factTypes().slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const roles = t.roles.map(r => { const lt = Store.linkType(r.tieTypeId); return `${r.name} → ${lt ? lt.name : '(no tie)'}` + (r.mirror === false ? ' (not shown on theirs)' : ` (theirs: ${r.mirrorWord || Facts.defaultMirrorWord(t, r)})`); }).join(', ');
      const implies = [t.begins ? 'begins' : null, t.ends ? 'ends' : null, t.placeFrom ? 'place from ' + ((t.roles.find(r => r.id === t.placeFrom) || {}).name || '?') : null].filter(Boolean).join(', ');
      tb.append(h('tr', {},
        h('td', {}, t.name),
        h('td', { class: 'narrow' }, t.hasDate === false ? 'none' : (t.hasEnd ? 'from / until' : 'single')),
        h('td', { class: 'narrow' }, t.place),
        h('td', {}, roles || h('span', { class: 'muted' }, '—')),
        h('td', {}, implies || h('span', { class: 'muted' }, '—')),
        h('td', {}, (t.details || []).join(', ')),
        h('td', { class: 'narrow muted' }, used.get(t.id) || 0),
        h('td', { class: 'narrow' },
          h('button', { class: 'small', onclick: () => editFactType(t.id) }, '✏️'), ' ',
          h('button', { class: 'small danger', title: 'Delete (facts of this type become plain Notes)', onclick: () => { if (confirm(`Delete fact type "${t.name}"? ${used.get(t.id) || 0} fact(s) of this type become plain Notes.`)) Store.deleteFactType(t.id); } }, '✕'))));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Fact types', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => editFactType(null) }, '+ Add fact type')),
      h('p', { class: 'hint' }, 'What kinds of facts a marker can have, and what each kind means: whether it has a date (or a from/until span), what sort of place it can carry, which roles it names (each role makes a tie of the chosen type), and whether it begins or ends the marker. Each role also says how the fact reads on the other marker ("theirs: Killed" makes Cain show "Died · Killed: Abel"), and whether it is shown there at all.'),
      table);
  }

  // Modal editor for one fact type. cb(type|null) runs when it closes.
  function editFactType(id, cb) {
    const existing = id ? Store.factType(id) : null;
    const t = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', hasDate: true, hasEnd: false, place: 'any', roles: [], begins: false, ends: false, details: [], placeFrom: null };
    const name = h('input', { type: 'text', value: t.name, placeholder: 'e.g. Reigned, Baptised, Exiled' });
    const hasDate = h('input', { type: 'checkbox', checked: t.hasDate !== false });
    const hasEnd = h('input', { type: 'checkbox', checked: !!t.hasEnd });
    const place = UI.select([['any', 'any (point, outline, or another marker)'], ['point', 'a point or another marker'], ['area', 'an area outline or another marker'], ['route', 'a route or another marker'], ['none', 'no place']], t.place);
    const begins = h('input', { type: 'checkbox', checked: !!t.begins });
    const ends = h('input', { type: 'checkbox', checked: !!t.ends });
    const details = h('input', { type: 'text', value: (t.details || []).join(', '), placeholder: 'e.g. Cause, Outcome, Age' });
    const rolesHost = h('div');
    const placeFrom = h('select');
    function renderRoles() {
      rolesHost.innerHTML = '';
      t.roles.forEach((r, i) => {
        const nm = h('input', { type: 'text', value: r.name, placeholder: 'role, e.g. Father' }); nm.addEventListener('input', () => { r.name = nm.value; renderPlaceFrom(); });
        const tie = UI.select([['', '— no tie —'], ...Store.linkTypes().map(x => [x.id, x.name]), ['__new', '+ New tie type…']], r.tieTypeId || '');
        tie.addEventListener('change', () => {
          if (tie.value === '__new') { const n = prompt('Tie type name (e.g. "Parent of"):'); if (n && n.trim()) { const lt = Store.addLinkType({ name: n.trim(), color: randomColor(), directed: confirm('Is this tie directed (one-way, like "Parent of")?\nOK = directed, Cancel = mutual (like "Spouse of").') }); r.tieTypeId = lt.id; } renderRoles(); return; }
          r.tieTypeId = tie.value || null;
        });
        const dir = UI.select([['other-to-this', 'the other marker → this marker (Father: Adam → Seth)'], ['this-to-other', 'this marker → the other marker (Child: Adam → Seth)']], r.direction || 'this-to-other');
        dir.addEventListener('change', () => { r.direction = dir.value; });
        const word = h('input', { type: 'text', value: r.mirrorWord || '', placeholder: Facts.defaultMirrorWord(Object.assign({ id: existing ? existing.id : '' }, t, { name: name.value.trim() || t.name || 'Fact' }), r),
          title: 'The word used on the other marker, e.g. "Killed" so that Cain reads "Died · Killed: Abel". Three forms separated by slashes are chosen by the sex of the marker the fact is on: "Son/Daughter/Child".' });
        word.addEventListener('input', () => { r.mirrorWord = word.value; });
        const show = h('input', { type: 'checkbox', checked: r.mirror !== false });
        show.addEventListener('change', () => { r.mirror = show.checked; });
        rolesHost.append(h('div', { class: 'card' },
          h('div', { class: 'ed-row' }, nm, tie, h('button', { class: 'small narrow', title: 'Remove role', onclick: () => { t.roles.splice(i, 1); renderRoles(); renderPlaceFrom(); } }, '✕')),
          h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'Tie direction', dir)),
          h('div', { class: 'ed-row' }, h('label', { class: 'field' }, 'On their marker as', word), h('label', { style: { alignSelf: 'end', whiteSpace: 'nowrap' } }, show, ' show on their marker'))));
      });
      rolesHost.append(h('button', { class: 'small', onclick: () => { t.roles.push({ id: Store.uid(), name: '', tieTypeId: null, direction: 'this-to-other' }); renderRoles(); renderPlaceFrom(); } }, '+ Add role'));
    }
    function renderPlaceFrom() {
      placeFrom.innerHTML = '';
      placeFrom.append(h('option', { value: '' }, '— the fact has its own place —'));
      t.roles.forEach(r => placeFrom.append(h('option', { value: r.id, selected: r.id === t.placeFrom }, `the ${r.name || 'role'}'s location`)));
    }
    renderRoles(); renderPlaceFrom();
    const save = () => {
      if (!name.value.trim()) { UI.toast('Give the fact type a name', 'error'); return; }
      const data = { name: name.value.trim(), hasDate: hasDate.checked, hasEnd: hasEnd.checked, place: place.value, begins: begins.checked, ends: ends.checked,
        details: details.value.split(',').map(s => s.trim()).filter(Boolean), roles: t.roles.filter(r => r.name.trim()), placeFrom: placeFrom.value || null };
      const saved = existing ? Store.updateFactType(existing.id, data) : Store.addFactType(data);
      m.close(); cb && cb(saved);
    };
    const body = h('div', {},
      h('label', { class: 'field' }, 'Name', name),
      h('div', { class: 'ed-row' },
        h('label', {}, hasDate, ' has a date'), h('label', {}, hasEnd, ' has an end date (from / until)'),
        h('label', {}, begins, ' begins the marker'), h('label', {}, ends, ' ends the marker')),
      h('label', { class: 'field' }, 'Place', place),
      h('label', { class: 'field' }, 'Or take the place from a role', placeFrom),
      h('div', { class: 'field' }, 'Roles (who else is involved; each makes a tie)', rolesHost),
      h('label', { class: 'field' }, 'Detail fields (comma separated)', details),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'primary', onclick: save }, existing ? 'Save' : 'Create'), h('button', { onclick: () => { m.close(); cb && cb(null); } }, 'Cancel')));
    const m = UI.modal({ title: existing ? 'Fact type: ' + existing.name : 'New fact type', body, width: '720px' });
    setTimeout(() => name.focus(), 50);
  }

  // Choose which fact types a category offers first.
  function pickFactTypes(c) {
    const current = new Set(Facts.defaultTypeIdsFor(c));
    const boxes = Store.factTypes().slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => { const cb = h('input', { type: 'checkbox', checked: current.has(t.id) }); return { t, cb, el: h('label', { style: { display: 'block', padding: '3px 0' } }, cb, ' ', t.name) }; });
    const body = h('div', {}, h('p', { class: 'hint' }, `Facts offered first when editing a ${c.name}. All other fact types stay available under "All fact types".`),
      ...boxes.map(b => b.el),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'primary', onclick: () => { Store.updateCategory(c.id, { factTypeIds: boxes.filter(b => b.cb.checked).map(b => b.t.id) }); m.close(); } }, 'Save'), h('button', { onclick: () => m.close() }, 'Cancel')));
    const m = UI.modal({ title: `Usual facts for ${c.name}`, body, width: '480px' });
  }

  function markersSection() {
    const q = search.toLowerCase();
    const all = Store.markers().filter(m => !q || Store.matchesName(m, q) || (Store.category(m.categoryId)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = all.slice(0, 500);
    const searchBox = h('input', { type: 'search', placeholder: 'Filter…', value: search, style: { width: '220px' } });
    searchBox.addEventListener('input', () => { search = searchBox.value; const pos = searchBox.selectionStart; render(); const nb = host.querySelector('input[type=search]'); nb.focus(); nb.setSelectionRange(pos, pos); });
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Name'), h('th', {}, 'Category'), h('th', {}, 'Shape'), h('th', {}, 'Begins'), h('th', {}, 'Ends'), h('th', {}, 'Facts'), h('th', {}, 'Ties'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const m of shown) {
      tb.append(h('tr', {},
        h('td', { class: 'narrow' }, h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m))),
        h('td', {}, h('a', { class: 'mlink', style: { color: 'var(--accent)', cursor: 'pointer' }, onclick: () => Editor.open(m.id) }, Store.displayName(m)),
          Store.otherNamesShown(m).length ? h('div', { class: 'muted', style: { fontSize: '11px' } }, 'also ' + Store.otherNamesShown(m).join(', ')) : null),
        h('td', {}, Store.category(m.categoryId)?.name || h('span', { class: 'muted' }, '—')),
        h('td', {}, { pin: 'Point', area: 'Area', path: 'Route' }[m.kind] || m.kind),
        h('td', {}, m.start ? `${Dates.formatInput(m.start)}${m.startLabel ? ' (' + m.startLabel + ')' : ''}` : ''),
        h('td', {}, m.end ? `${Dates.formatInput(m.end)}${m.endLabel ? ' (' + m.endLabel + ')' : ''}` : ''),
        h('td', { class: 'narrow muted' }, m.facts.length),
        h('td', { class: 'narrow muted' }, Store.linksOf(m.id).length),
        h('td', { class: 'narrow' },
          h('button', { class: 'small', onclick: () => Editor.open(m.id), title: 'Edit' }, '✏️'), ' ',
          h('button', { class: 'small', onclick: () => { App.showTab('map'); MapView.locate(m.id); }, title: 'Show on map' }, '🗺️'), ' ',
          h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete "${m.name}" and its ties?`)) Store.deleteMarker(m.id); }, title: 'Delete' }, '✕'))));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, `Markers (${all.length})`, h('span', { class: 'spacer' }), searchBox, h('button', { class: 'small primary', onclick: () => App.newMarker() }, '+ New marker')),
      table,
      all.length > shown.length ? h('p', { class: 'hint' }, `Showing the first ${shown.length}. Use the filter to find others.`) : null);
  }

  function backupSection() {
    const version = h('p', { class: 'muted', style: { fontSize: '12px' } }, `Chrono Map version ${window.ChronoVersion || 'unknown'} · every device should show the same version after a reload`);
    const mode = UI.select([['merge', 'Merge into current data (update matching ids)'], ['replace', 'Replace everything']], 'merge');
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (mode.value === 'replace' && !confirm('Replace ALL current data with the file? This cannot be undone.')) return;
          const parsed = JSON.parse(reader.result);
          const r = Store.importJSON(reader.result, mode.value);
          const n = await Photos.importAll(parsed.photoData);
          UI.toast(`Imported ${r.markers} markers, ${r.links} ties and ${n} photo(s)`);
        } catch (e) { UI.toast('Import failed: ' + e.message, 'error'); }
        file.value = '';
      };
      reader.readAsText(f);
    });
    const withPhotos = h('input', { type: 'checkbox', checked: true });
    const exportBtn = h('button', { class: 'primary', onclick: async () => {
      exportBtn.disabled = true;
      try {
        const data = JSON.parse(Store.exportJSON());
        if (withPhotos.checked) data.photoData = await Photos.exportAll();
        UI.download(`chronomap-${Dates.iso(Dates.today())}.json`, JSON.stringify(data, null, 1));
      } catch (e) { UI.toast('Export failed: ' + e.message, 'error'); }
      exportBtn.disabled = false;
    } }, '⬇ Export JSON');
    const size = (localStorage.getItem('chronomap.v1') || '').length;
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Backup & restore'),
      version,
      h('p', { class: 'hint' }, `Everything is saved automatically in this browser (${(size / 1024).toFixed(0)} KB of data plus ${(Photos.totalBytes() / (1024 * 1024)).toFixed(1)} MB of photos). Export a JSON file regularly to keep a copy, move between computers, or share a dataset.`),
      h('div', { class: 'backup-row' },
        exportBtn, h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, withPhotos, ' include photos'),
        h('button', { onclick: () => file.click() }, '⬆ Import JSON'), mode, file,
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => { if (confirm('Load the sample dataset? This replaces your current data (export first if you want to keep it).')) Store.resetToSample(); } }, 'Load sample data'),
        h('button', { class: 'danger', onclick: () => { if (confirm('Delete ALL markers, ties, categories and link types?') && confirm('Really delete everything? Export first if unsure.')) Store.clearAll(); } }, 'Clear everything')));
  }

  function randomColor() { const hues = [0, 30, 60, 120, 180, 210, 260, 300]; return hslToHex(hues[Math.floor(Math.random() * hues.length)], 65, 55); }
  function hslToHex(hh, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(255 * x).toString(16).padStart(2, '0')).join('');
  }

  return { init, show, editFactType, pickFactTypes, setSub };
})();
