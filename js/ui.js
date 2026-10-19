/* Small DOM helpers shared by every tab. */
window.UI = (() => {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // h('div', {class:'x', onclick: fn, dataset:{id:1}}, child, child...)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function toast(msg, kind = '') {
    const host = document.getElementById('toast-host');
    const el = h('div', { class: 'toast ' + kind }, msg);
    host.append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2500);
  }

  // Plain text -> safe HTML with line breaks and clickable URLs.
  function textToHTML(s) {
    if (!s) return '';
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }

  // Turn flat field keys ("Born", "Born/Date", "Born/Place") into an ordered tree.
  // Returns [{ key, name, hasValue, children: [...] }]. Parents missing from `fields` are created without a value.
  function fieldTree(fields) {
    const roots = [], byKey = new Map();
    const ensure = key => {
      if (byKey.has(key)) return byKey.get(key);
      const i = key.lastIndexOf('/');
      const node = { key, name: i >= 0 ? key.slice(i + 1) : key, hasValue: false, children: [] };
      byKey.set(key, node);
      if (i >= 0) ensure(key.slice(0, i)).children.push(node); else roots.push(node);
      return node;
    };
    Object.keys(fields || {}).forEach(k => { ensure(k).hasValue = true; });
    return roots;
  }

  function select(options, value, attrs = {}) {
    const sel = h('select', attrs);
    for (const [v, label] of options) sel.append(h('option', { value: v, selected: v === value }, label));
    return sel;
  }

  // Dropdown of sources with a "+ New source…" entry. onChange(sourceId|null) fires after any change.
  function sourceSelect({ value = null, onChange, attrs = {}, noneLabel = '— no source —' } = {}) {
    const opts = [['', noneLabel], ...Store.sources().map(s => [s.id, Store.sourceLabel(s.id)]), ['__new', '+ New source…']];
    const sel = select(opts, value || '', attrs);
    sel.addEventListener('change', () => {
      if (sel.value === '__new') {
        const s = promptNewSource();
        sel.value = s ? s.id : (value || '');
        if (!s) return;
      }
      value = sel.value || null;
      onChange && onChange(value);
    });
    return sel;
  }
  function promptNewSource() {
    const title = prompt('Title of the source (book, document, website, witness…):');
    if (!title || !title.trim()) return null;
    const author = prompt('Author (optional):') || '';
    const year = prompt('Year (optional):') || '';
    return Store.addSource({ title: title.trim(), author: author.trim(), year: year.trim() });
  }
  function citeHTML(sourceId, page) {
    if (!sourceId) return '';
    const s = Store.source(sourceId);
    if (!s) return '';
    return `<span class="cite" title="${esc([s.author, s.title, s.year, s.where].filter(Boolean).join(' · '))}">📖 ${esc(s.title)}${page ? ', ' + esc(page) : ''}</span>`;
  }

  // Describe a link from the point of view of marker `me`.
  function tieHTML(link, meId) {
    const type = Store.linkType(link.typeId);
    const isFrom = link.fromId === meId;
    const other = Store.marker(isFrom ? link.toId : link.fromId);
    if (!other) return '';
    const tname = type ? type.name : 'Link';
    const color = type ? type.color : '#999';
    let arrow = '';
    if (type && type.directed) arrow = isFrom ? '→ ' : '← ';
    const myRole = type ? (isFrom ? type.fromLabel : type.toLabel) : '';
    const otherRole = type ? (isFrom ? type.toLabel : type.fromLabel) : '';
    let dates = '';
    if (link.start || link.end) dates = ` <span class="muted">(${esc(Dates.formatInput(link.start))}${link.end ? ' – ' + esc(Dates.formatInput(link.end)) : (link.start ? ' →' : '')})</span>`;
    const label = link.label ? ` <span class="muted">· ${esc(link.label)}</span>` : '';
    const cite = link.sourceId ? ` ${citeHTML(link.sourceId, link.page)}` : '';
    const note = (link.note ? `<div class="muted" style="font-size:11px">${textToHTML(link.note)}</div>` : '') + (cite ? `<div style="font-size:11px">${cite}</div>` : '');
    return `<li class="tie-row"><span class="swatch sm" style="background:${esc(color)};vertical-align:middle"></span> `
      + `<strong>${esc(tname)}</strong> ${arrow}<a class="mlink" data-action="goto-marker" data-id="${esc(other.id)}">${esc(other.name)}</a>`
      + (otherRole ? ` <span class="muted">(${esc(otherRole)})</span>` : '')
      + (myRole && !otherRole ? ` <span class="muted">(you: ${esc(myRole)})</span>` : '')
      + dates + label + note + '</li>';
  }

  // Full information block for a marker (used in map popups and the info panels).
  function markerInfoHTML(m, t, opts = {}) {
    const cat = Store.category(m.categoryId);
    const color = Store.displayColor(m), icon = Store.displayIcon(m);
    const kindName = { pin: 'Pin', area: 'Area', path: 'Path' }[m.kind] || m.kind;
    const profile = m.photoId && Store.photo(m.photoId) && Photos.url(m.photoId)
      ? `<img class="info-photo" src="${esc(Photos.thumb(m.photoId))}" alt="${esc(Store.photo(m.photoId).title)}" title="${esc(Store.photo(m.photoId).title)}" data-action="view-photo" data-photo="${esc(m.photoId)}">` : '';
    let out = `<div class="info">${profile}<div class="info-head"><span class="swatch" style="background:${esc(color)}">${esc(icon)}</span>`
      + `<div><div class="info-name">${esc(m.name)}</div><div class="info-cat">${esc(cat ? cat.name : 'Uncategorised')} · ${kindName}</div></div></div>`;
    if (m.summary) out += `<div class="info-summary">${esc(m.summary)}</div>`;

    const rows = []; // [label, html, depth]
    // if a field (or field group) carries the same label as the time span (e.g. "Born"), it usually holds more detail: show it once
    const hasField = label => label && Object.entries(m.fields || {}).some(([k, v]) => v && (k.toLowerCase() === label.toLowerCase() || k.toLowerCase().startsWith(label.toLowerCase() + '/')));
    if (m.start && !hasField(m.startLabel)) rows.push([m.startLabel || 'Appears', Dates.formatInput(m.start)]);
    if (m.end && !hasField(m.endLabel)) rows.push([m.endLabel || 'Disappears', Dates.formatInput(m.end)]);
    const pos = Store.positionAt(m, t);
    if (pos && Store.hasLocation(pos)) {
      let where = pos.label || (pos.coords ? `${pos.coords.length} points` : `${(+pos.lat).toFixed(3)}, ${(+pos.lng).toFixed(3)}`);
      if (pos.date) where += ` <span class="muted">(since ${esc(Dates.formatInput(pos.date))})</span>`;
      rows.push([t == null ? 'Latest location' : 'Location', where]);
    } else if (m.moves.length && t != null) {
      rows.push(['Location', '<span class="muted">not on the map at this time</span>']);
    }
    const walk = (node, depth) => {
      const v = (m.fields || {})[node.key];
      const filled = v !== '' && v != null;
      const kidsFilled = node.children.some(function any(c) { const cv = (m.fields || {})[c.key]; return (cv !== '' && cv != null) || c.children.some(any); });
      if (!filled && !kidsFilled) return;
      const fs = (m.fieldSources || {})[node.key];
      rows.push([node.name, (filled ? textToHTML(v) : '') + (fs && fs.sourceId ? ' ' + citeHTML(fs.sourceId, fs.page) : ''), depth]);
      node.children.forEach(c => walk(c, depth + 1));
    };
    fieldTree(m.fields).forEach(n => walk(n, 0));
    if (rows.length) out += '<dl>' + rows.map(([k, v, depth]) => `<dt${depth ? ` style="padding-left:${depth * 12}px"` : ''}>${depth ? '↳ ' : ''}${esc(k)}</dt><dd>${v}</dd>`).join('') + '</dl>';
    if (m.tags && m.tags.length) out += '<div>' + m.tags.map(tg => `<span class="tag">${esc(tg)}</span>`).join('') + '</div>';
    if (m.description) out += `<h4>Notes</h4><div class="desc">${textToHTML(m.description)}</div>`;
    const gallery = (m.photoIds || []).map(pid => Store.photo(pid)).filter(p => p && Photos.thumb(p.id));
    if (gallery.length) out += `<h4>Photos (${gallery.length})</h4><div class="info-gallery">` + gallery.map(p => `<img src="${esc(Photos.thumb(p.id))}" alt="${esc(p.title)}" title="${esc(p.title)}" data-action="view-photo" data-photo="${esc(p.id)}">`).join('') + '</div>';

    if (m.moves.length > 1 || (m.moves.length === 1 && m.moves[0].date)) {
      out += `<h4>Movements (${m.moves.length})</h4><ul>` + Store.sortedMoves(m).map(mv => {
        const when = mv.date ? Dates.formatInput(mv.date) : 'start';
        const where = mv.label || (mv.coords ? `${mv.coords.length} points` : (mv.lat != null ? `${(+mv.lat).toFixed(2)}, ${(+mv.lng).toFixed(2)}` : 'no location'));
        return `<li><span class="muted">${esc(when)}:</span> ${esc(where)}${mv.note ? ` <span class="muted">– ${esc(mv.note)}</span>` : ''}${mv.sourceId ? ' ' + citeHTML(mv.sourceId, mv.page) : ''}</li>`;
      }).join('') + '</ul>';
    }

    const links = Store.linksOf(m.id);
    if (links.length) out += `<h4>Ties (${links.length})</h4><ul>` + links.map(l => tieHTML(l, m.id)).join('') + '</ul>';

    const cites = (m.citations || []).filter(c => c.sourceId && Store.source(c.sourceId));
    const catSrc = cat && cat.sourceId && Store.source(cat.sourceId) ? cat.sourceId : null;
    if (cites.length || catSrc || m.sources) {
      out += '<h4>Sources</h4>';
      if (cites.length || catSrc) {
        out += '<ul>' + cites.map(c => `<li>${citeHTML(c.sourceId, c.page)}${c.note ? ` <span class="muted">– ${esc(c.note)}</span>` : ''}</li>`).join('');
        if (catSrc && !cites.some(c => c.sourceId === catSrc)) out += `<li>${citeHTML(catSrc, '')} <span class="muted">(default for ${esc(cat.name)})</span></li>`;
        out += '</ul>';
      }
      if (m.sources) out += `<div class="desc muted">${textToHTML(m.sources)}</div>`;
    }

    if (!opts.noActions) {
      out += `<div class="info-actions"><button data-action="edit" data-id="${esc(m.id)}">✏️ Edit</button>`
        + `<button data-action="locate" data-id="${esc(m.id)}">🗺️ Map</button>`
        + `<button data-action="network" data-id="${esc(m.id)}">🕸️ Network</button>`
        + `<button data-action="ties" data-id="${esc(m.id)}">🔗 Ties</button></div>`;
    }
    return out + '</div>';
  }

  // Combobox for choosing a marker. Returns an element with getValue()/setValue().
  function markerSelect({ value = null, onChange, placeholder = 'Search markers…', exclude = [] } = {}) {
    const wrap = h('div', { class: 'mselect' });
    const input = h('input', { type: 'text', placeholder, autocomplete: 'off' });
    const clear = h('button', { class: 'clear', type: 'button', title: 'Clear' }, '✕');
    const list = h('div', { class: 'mselect-list hidden' });
    wrap.append(input, clear, list);
    let selected = value;
    const setLabel = () => { const m = selected && Store.marker(selected); input.value = m ? m.name : ''; };
    setLabel();
    function render() {
      const q = input.value.trim().toLowerCase();
      const items = Store.markers().filter(m => !exclude.includes(m.id) && (!q || m.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
      list.innerHTML = '';
      for (const m of items) {
        list.append(h('div', {
          class: 'mselect-item',
          onmousedown: e => { e.preventDefault(); selected = m.id; setLabel(); list.classList.add('hidden'); input.blur(); onChange && onChange(m.id); }
        }, h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)), m.name,
          h('span', { class: 'muted' }, Store.category(m.categoryId)?.name || '')));
      }
      if (!items.length) list.append(h('div', { class: 'mselect-empty' }, 'No matches'));
      list.classList.remove('hidden');
    }
    input.addEventListener('focus', () => { input.select(); render(); });
    input.addEventListener('input', render);
    input.addEventListener('blur', () => { setTimeout(() => list.classList.add('hidden'), 120); setLabel(); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') input.blur(); if (e.key === 'Enter') { const first = list.querySelector('.mselect-item'); if (first) first.dispatchEvent(new MouseEvent('mousedown')); } });
    clear.addEventListener('click', () => { selected = null; setLabel(); onChange && onChange(null); });
    wrap.getValue = () => selected;
    wrap.setValue = id => { selected = id; setLabel(); };
    return wrap;
  }

  // Centred dialog over everything. Returns { close, box }. Closes on ✕, Escape or a click on the backdrop.
  function modal({ title, body, width, onClose }) {
    const overlay = h('div', { class: 'modal-overlay' });
    const close = () => { if (!overlay.isConnected) return; overlay.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const box = h('div', { class: 'modal', style: width ? { width } : null },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', title: 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body));
    overlay.append(box);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    return { close, box };
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { esc, h, toast, textToHTML, select, sourceSelect, promptNewSource, citeHTML, fieldTree, markerInfoHTML, tieHTML, markerSelect, modal, download };
})();
