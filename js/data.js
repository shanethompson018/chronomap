/* Data tab: categories, link types, the full marker table, and backup / restore. */
window.DataTab = (() => {
  const { h } = UI;
  let host, search = '';

  function init() {
    host = document.getElementById('data-page');
    Store.subscribe(evt => { if (App.currentTab() === 'data' && !(evt.type === 'photos' && document.activeElement && host.contains(document.activeElement))) render(); });
  }
  function show() { render(); }

  const KIND_OPTS = [['pin', 'Pin'], ['area', 'Area'], ['path', 'Path']];

  function render() {
    const scroll = host.scrollTop;
    host.innerHTML = '';
    host.append(sourcesSection(), photosSection(), categoriesSection(), linkTypesSection(), markersSection(), backupSection());
    host.scrollTop = scroll;
  }

  function cell(value, onChange, extra = {}) {
    const inp = h('input', Object.assign({ type: 'text', value: value ?? '' }, extra));
    inp.addEventListener('change', () => onChange(inp.value));
    return h('td', {}, inp);
  }
  function colorCell(value, onChange) {
    const inp = h('input', { type: 'color', value: value || '#888888' });
    inp.addEventListener('change', () => onChange(inp.value));
    return h('td', { class: 'narrow' }, inp);
  }

  function sourcesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Author'), h('th', {}, 'Year'), h('th', {}, 'Where (URL, library, archive…)'), h('th', {}, 'Notes'), h('th', {}, 'Used'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const s of Store.sources()) {
      const used = Store.sourceUseCount(s.id);
      tb.append(h('tr', {},
        cell(s.title, v => Store.updateSource(s.id, { title: v })),
        cell(s.author, v => Store.updateSource(s.id, { author: v })),
        cell(s.year, v => Store.updateSource(s.id, { year: v }), { style: { width: '70px' } }),
        cell(s.where, v => Store.updateSource(s.id, { where: v }), { placeholder: 'https://… or shelf / archive reference' }),
        cell(s.notes, v => Store.updateSource(s.id, { notes: v }), { placeholder: 'reliability, edition, bias…' }),
        h('td', { class: 'narrow muted', title: 'Categories, markers, positions and ties that cite this source' }, used),
        h('td', { class: 'narrow' }, h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete source "${s.title}"? It is cited in ${used} place(s); those citations will be removed.`)) Store.deleteSource(s.id); } }, '✕'))));
    }
    if (!Store.sources().length) tb.append(h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'No sources yet. Add the texts you are working from, then attach them to categories, markers, positions and ties.')));
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Sources', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => UI.promptNewSource() }, '+ Add source')),
      h('p', { class: 'hint' }, 'The texts, documents and people your information comes from. Each category can have a default source; every marker, position and tie can cite a source with a page or location. The map can be filtered to a single source to compare what different texts say.'),
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
    if (!list.length) grid.append(h('div', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'No photos yet. Add portraits, maps, documents, scene photographs… then pick them as a marker\'s profile picture or gallery.'));
    for (const p of list) {
      const users = Store.photoUsers(p.id).length;
      grid.append(h('div', { class: 'photo-tile', title: `${p.title}${users ? ` · used by ${users} marker(s)` : ''}`, onclick: () => Photos.edit(p.id) },
        Photos.thumbEl(p, 96), h('div', { class: 'photo-title' }, p.title || 'Untitled'),
        h('div', { class: 'muted', style: { fontSize: '10px' } }, `${(p.citations || []).filter(c => c.sourceId).length} source(s)${users ? ` · ${users} marker(s)` : ''}`)));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, `Photos (${list.length})`, h('span', { class: 'muted', style: { fontWeight: 400, fontSize: '12px' } }, `${(Photos.totalBytes() / (1024 * 1024)).toFixed(1)} MB`), status, h('span', { class: 'spacer' }),
        h('button', { class: 'small', onclick: () => fileInput.click() }, '⬆ Add photos'), fileInput),
      h('p', { class: 'hint' }, Photos.isReady()
        ? 'Click a photo to edit its title, caption, credit and sources, or to delete it. Large images are shrunk to 1600 px on the long side. Photos are stored in this browser; use "Export JSON" with photos included to back them up.'
        : 'Photo storage is still loading, or is not available in this browser.'),
      grid);
  }

  function categoriesSection() {
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Icon'), h('th', {}, 'Name'), h('th', {}, 'Colour'), h('th', {}, 'Default kind'), h('th', {}, 'Fields (comma separated)'), h('th', {}, 'Default source'), h('th', {}, 'Markers'), h('th', {}))));
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
      const dir = h('input', { type: 'checkbox', checked: t.directed });
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
        h('td', { class: 'narrow' }, h('button', { class: 'small danger', onclick: () => { if (confirm(`Delete link type "${t.name}" and its ${count} tie(s)?`)) Store.deleteLinkType(t.id); } }, '✕'))));
    }
    return h('div', { class: 'data-section' },
      h('h2', {}, 'Link types', h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: () => { const name = prompt('Link type name (e.g. "Parent of", "Works for", "Phoned"):'); if (name && name.trim()) Store.addLinkType({ name: name.trim(), color: randomColor(), directed: confirm('Is this link directed (one-way, like "Parent of")?\nOK = directed, Cancel = mutual (like "Spouse of").') }); } }, '+ Add link type')),
      h('p', { class: 'hint' }, 'Directed ties draw as arrows and can be laid out as a hierarchy. "Top of hierarchy" says which end sits above the other: for "Parent of" the From side (parent) is on top; for "Member of" the To side (the organisation) is on top.'),
      table);
  }

  function markersSection() {
    const q = search.toLowerCase();
    const all = Store.markers().filter(m => !q || m.name.toLowerCase().includes(q) || (Store.category(m.categoryId)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = all.slice(0, 500);
    const searchBox = h('input', { type: 'search', placeholder: 'Filter…', value: search, style: { width: '220px' } });
    searchBox.addEventListener('input', () => { search = searchBox.value; const pos = searchBox.selectionStart; render(); const nb = host.querySelector('input[type=search]'); nb.focus(); nb.setSelectionRange(pos, pos); });
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Name'), h('th', {}, 'Category'), h('th', {}, 'Kind'), h('th', {}, 'Appears'), h('th', {}, 'Disappears'), h('th', {}, 'Positions'), h('th', {}, 'Ties'), h('th', {}))));
    const tb = h('tbody'); table.append(tb);
    for (const m of shown) {
      tb.append(h('tr', {},
        h('td', { class: 'narrow' }, h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m))),
        h('td', {}, h('a', { class: 'mlink', style: { color: 'var(--accent)', cursor: 'pointer' }, onclick: () => Editor.open(m.id) }, m.name)),
        h('td', {}, Store.category(m.categoryId)?.name || h('span', { class: 'muted' }, '—')),
        h('td', {}, m.kind),
        h('td', {}, m.start ? `${Dates.formatInput(m.start)}${m.startLabel ? ' (' + m.startLabel + ')' : ''}` : ''),
        h('td', {}, m.end ? `${Dates.formatInput(m.end)}${m.endLabel ? ' (' + m.endLabel + ')' : ''}` : ''),
        h('td', { class: 'narrow muted' }, m.moves.length),
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

  return { init, show };
})();
