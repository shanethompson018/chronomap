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
        sel.value = value || '';
        promptNewSource(s => {
          sel.insertBefore(h('option', { value: s.id }, Store.sourceLabel(s.id)), sel.lastElementChild);
          sel.value = s.id; value = s.id;
          onChange && onChange(value);
        });
        return;
      }
      value = sel.value || null;
      onChange && onChange(value);
    });
    return sel;
  }
  // New-source dialog. For a book, type the ISBN and press Look up: title, author, year and publisher are
  // filled in (and stay editable). onDone(source) fires after Save.
  function promptNewSource(onDone) {
    const inp = (ph, attrs = {}) => h('input', Object.assign({ type: 'text', placeholder: ph }, attrs));
    const isbn = inp('ISBN, e.g. 978-0-19-528881-0', { inputmode: 'numeric', autocomplete: 'off' });
    const title = inp('Title of the source (book, document, website, witness…)');
    const author = inp('Author (optional)');
    const year = inp('Year (optional)', { style: { maxWidth: '110px' } });
    const where = inp('Publisher, URL, library or archive (optional)');
    const status = h('span', { class: 'muted', style: { fontSize: '12px' } });
    const lookupBtn = h('button', { class: 'small', type: 'button', title: 'Fill the details from the ISBN (needs an internet connection)' }, '🔍 Look up');
    const rowOf = (label, el) => h('label', { class: 'field-row' }, h('span', { class: 'field-label' }, label), el);
    async function lookup() {
      if (!isbn.value.trim()) { isbn.focus(); return; }
      lookupBtn.disabled = true; status.textContent = 'Looking up…';
      try {
        const hit = await Isbn.lookup(isbn.value);
        if (!hit) { status.textContent = 'No book found with that ISBN. Type the details by hand.'; return; }
        title.value = hit.title; author.value = hit.author; year.value = hit.year; where.value = hit.where; isbn.value = hit.isbn;
        status.textContent = `Filled from ${hit.from}. Check it, then Save.`;
      } catch (e) { status.textContent = e.message; }
      finally { lookupBtn.disabled = false; }
    }
    lookupBtn.addEventListener('click', lookup);
    isbn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    const save = () => {
      if (!title.value.trim()) { title.focus(); toast('A source needs a title', 'error'); return; }
      const s = Store.addSource({ title: title.value.trim(), author: author.value.trim(), year: year.value.trim(), where: where.value.trim(), isbn: Isbn.clean(isbn.value) });
      m.close(); onDone && onDone(s);
    };
    const body = h('div', { class: 'source-dialog' },
      rowOf('ISBN', h('div', { class: 'row' }, isbn, lookupBtn)),
      h('p', { class: 'hint' }, 'For a book, type the number from the back cover (10 or 13 digits) and press Look up: the title, author, year and publisher are filled in from Open Library or Google Books. Anything else (a Bible passage, a website, a witness) is typed by hand.'),
      rowOf('Title', title), rowOf('Author', author), rowOf('Year', year), rowOf('Where', where),
      h('div', { class: 'row', style: { marginTop: '10px' } }, status, h('span', { class: 'spacer' }), h('button', { class: 'primary', type: 'button', onclick: save }, 'Save')));
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target !== isbn && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
    const m = modal({ title: 'New source', body, width: '520px' });
    setTimeout(() => isbn.focus(), 0);
  }
  // Grading: Reliability belongs to a source, Confidence is the user's own grade on a fact.
  const RELIABILITY_LABELS = { high: 'Highly Reliable', reliable: 'Reliable', questionable: 'Questionable', unreliable: 'Unreliable' };
  const CONFIDENCE_LABELS = { high: 'High Confidence', reasonable: 'Reasonable Confidence', low: 'Low Confidence', none: 'No Confidence' };
  const CONFIDENCE_GLYPH = { high: '✓✓', reasonable: '✓', low: '?', none: '✗' };
  function reliabilitySelect(value, onChange) {
    const sel = select([['', '— ungraded —'], ...Object.entries(RELIABILITY_LABELS)], value || '', { title: 'Reliability of this source' });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  function confidenceSelect(value, onChange, attrs = {}) {
    const sel = select([['', '— ungraded —'], ...Object.entries(CONFIDENCE_LABELS).map(([k, v]) => [k, `${CONFIDENCE_GLYPH[k]} ${v}`])], value || '', Object.assign({ title: 'Your confidence in this fact (never derived from the source)' }, attrs));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  // Small badge: ✓✓ / ✓ / ? / ✗ in its colour; nothing when ungraded.
  function gradeBadgeHTML(conf, reason) {
    if (!conf || !CONFIDENCE_GLYPH[conf]) return '';
    return `<span class="grade-badge grade-${esc(conf)}" title="${esc(CONFIDENCE_LABELS[conf])}${reason ? ': ' + esc(reason) : ''}">${CONFIDENCE_GLYPH[conf]}</span>`;
  }
  function reliabilityHTML(rel) {
    if (!rel || !RELIABILITY_LABELS[rel]) return '';
    return `<span class="rel-grade rel-${esc(rel)}" title="Source reliability">${esc(RELIABILITY_LABELS[rel])}</span>`;
  }
  function citeHTML(sourceId, page) {
    if (!sourceId) return '';
    const s = Store.source(sourceId);
    if (!s) return '';
    return `<span class="cite" title="${esc([s.author, s.title, s.year, s.where].filter(Boolean).join(' · '))}${s.reliability ? ' · ' + esc(RELIABILITY_LABELS[s.reliability]) : ''}">📖 ${esc(s.title)}${page ? ', ' + esc(page) : ''}</span>${reliabilityHTML(s.reliability)}`;
  }

  // Describe a link from the point of view of marker `me`.
  function tieHTML(link, meId) {
    const type = Store.linkType(link.typeId);
    const isFrom = link.fromId === meId;
    const other = Store.marker(isFrom ? link.toId : link.fromId);
    if (!other) return '';
    const otherWord = isFrom ? link.toRole : link.fromRole; // derived sibling ties carry brother/sister words
    const tname = otherWord ? otherWord.charAt(0).toUpperCase() + otherWord.slice(1) : (type ? type.name : 'Link');
    const color = type ? type.color : '#999';
    let arrow = '';
    if (type && type.directed) arrow = isFrom ? '→ ' : '← ';
    const myRole = otherWord ? '' : (type ? (isFrom ? type.fromLabel : type.toLabel) : '');
    const otherRole = otherWord ? '' : (type ? (isFrom ? type.toLabel : type.fromLabel) : '');
    let dates = '';
    if (link.start || link.end) dates = ` <span class="muted">(${esc(Dates.formatInput(link.start))}${link.end ? ' – ' + esc(Dates.formatInput(link.end)) : (link.start ? ' →' : '')})</span>`;
    const label = link.label ? ` <span class="muted">· ${esc(link.label)}</span>` : '';
    const cite = link.sourceId ? ` ${citeHTML(link.sourceId, link.page)}` : '';
    const note = (link.note ? `<div class="muted" style="font-size:11px">${textToHTML(link.note)}${link.derived ? ' · follows from the Parent of ties' : ''}</div>` : '') + (cite ? `<div style="font-size:11px">${cite}</div>` : '');
    return `<li class="tie-row"><span class="swatch sm" style="background:${esc(color)};vertical-align:middle"></span> `
      + `<strong>${esc(tname)}</strong> ${arrow}<a class="mlink" data-action="goto-marker" data-id="${esc(other.id)}">${esc(Store.displayName(other))}</a>`
      + (otherRole ? ` <span class="muted">(${esc(otherRole)})</span>` : '')
      + (myRole && !otherRole ? ` <span class="muted">(you: ${esc(myRole)})</span>` : '')
      + dates + label + note + '</li>';
  }

  // Full information block for a marker (used in map popups and the info panels).
  // Full information block for a marker (used in map bubbles and the info panels).
  function markerInfoHTML(m, t, opts = {}) {
    const cat = Store.category(m.categoryId);
    const color = Store.displayColor(m), icon = Store.displayIcon(m);
    const kindName = { pin: 'Point', area: 'Area', path: 'Route' }[m.kind] || m.kind;
    const badge = slot => (window.Relations ? Relations.badgesHTML({ kind: 'marker', id: m.id, slot }) : '');
    const profile = m.photoId && Store.photo(m.photoId) && Photos.url(m.photoId)
      ? `<img class="info-photo" src="${esc(Photos.thumb(m.photoId))}" alt="${esc(Store.photo(m.photoId).title)}" title="${esc(Store.photo(m.photoId).title)}" data-action="view-photo" data-photo="${esc(m.photoId)}">` : '';
    let out = `<div class="info">${profile}<div class="info-head"><span class="swatch" style="background:${esc(color)}">${esc(icon)}</span>`
      + `<div><div class="info-name">${esc(Store.nameLine(m, t))}${Store.tagOf(m) ? ` <span class="info-tag">(${esc(Store.tagOf(m))})</span>` : ''}</div><div class="info-cat">${esc(cat ? cat.name : 'Uncategorised')} · ${kindName}</div></div></div>`;
    if (m.summary) out += `<div class="info-summary">${esc(m.summary)}</div>`;

    const rows = []; // [label, html, depth]
    const span = [];
    if (m.start) span.push(`${esc(m.startLabel || 'Begins')} ${esc(Dates.formatRange(m.start, m.startMin, m.startMax))}`);
    if (m.end) span.push(`${esc(m.endLabel || 'Ends')} ${esc(Dates.formatRange(m.end, m.endMin, m.endMax))}`);
    if (span.length) rows.push(['Span', span.join(' · '), 0]);
    const pos = Store.positionAt(m, t);
    if (pos && Store.hasLocation(pos)) {
      let where = pos.label || (pos.atMarkerId ? (Store.marker(pos.atMarkerId) || {}).name : '') || (pos.coords ? `${pos.coords.length} points` : `${(+pos.lat).toFixed(3)}, ${(+pos.lng).toFixed(3)}`);
      if (pos.atMarkerId) where = 'at / in ' + where;
      if (pos.date) where += ` <span class="muted">(since ${esc(Dates.formatInput(pos.date))})</span>`;
      rows.push([t == null ? 'Latest location' : 'Location', where, 0]);
    } else if (m.moves.length && t != null) {
      rows.push(['Location', '<span class="muted">not on the map at this time</span>', 0]);
    }
    const walk = (node, depth) => {
      const v = (m.fields || {})[node.key];
      const filled = v !== '' && v != null;
      const kidsFilled = node.children.some(function any(c) { const cv = (m.fields || {})[c.key]; return (cv !== '' && cv != null) || c.children.some(any); });
      if (!filled && !kidsFilled) return;
      const fs = (m.fieldSources || {})[node.key], fg = (m.fieldGrades || {})[node.key];
      rows.push([node.name, (filled ? textToHTML(v) : '') + (fg && fg.confidence ? ' ' + gradeBadgeHTML(fg.confidence, fg.reason) : '') + (fs && fs.sourceId ? ' ' + citeHTML(fs.sourceId, fs.page) : ''), depth]);
      node.children.forEach(c => walk(c, depth + 1));
    };
    fieldTree(m.fields).forEach(n => walk(n, 0));
    if (rows.length) out += '<dl>' + rows.map(([k, v, depth]) => `<dt${depth ? ` style="padding-left:${depth * 12}px"` : ''}>${depth ? '↳ ' : ''}${esc(k)}</dt><dd>${v}</dd>`).join('') + '</dl>';
    if (m.tags && m.tags.length) out += '<div>' + m.tags.map(tg => `<span class="tag">${esc(tg)}</span>`).join('') + '</div>';

    // facts, in date order (undated last); mirrored facts from other markers (Son: Isaac, Husband: Abraham) sort in with them
    const own = (m.facts || []).map((f, i) => ({ f, i, d: f.date ? Dates.toDays(f.date) : null }));
    const mirrored = (m.mirrors || []).map((mi, i) => ({ mi, i: own.length + i, d: mi.date ? Dates.toDays(mi.date) : null }));
    const facts = [...own, ...mirrored].sort((a, b) => (a.d == null && b.d == null) ? a.i - b.i : a.d == null ? 1 : b.d == null ? -1 : a.d - b.d);
    if (facts.length) out += `<h4>Facts (${facts.length})</h4><ul class="fact-list">` + facts.map(x => x.f ? factLineHTML(m, x.f, badge) : mirrorLineHTML(x.mi)).join('') + '</ul>';
    const mirroredFacts = new Set((m.mirrors || []).map(mi => mi.factId));
    const mentions = Store.mentionsOf(m.id).filter(x => !mirroredFacts.has(x.fact.id));
    if (mentions.length) {
      out += `<h4>Mentioned in (${mentions.length})</h4><ul class="fact-list">` + mentions.map(x => {
        const how = x.roles.length ? `as ${esc(x.roles.join(', '))}` : 'as the place';
        return `<li><a class="mlink" data-action="goto-marker" data-id="${esc(x.marker.id)}">${esc(x.marker.name)}</a> · ${esc(Store.factTitle(x.fact))}${x.fact.date ? ` <span class="muted">${esc(Dates.formatInput(x.fact.date))}</span>` : ''} <span class="muted">(${how})</span></li>`;
      }).join('') + '</ul>';
    }
    if (m.description) out += `<h4>Notes</h4><div class="desc">${textToHTML(m.description)}</div>`;
    const gallery = (m.photoIds || []).map(pid => Store.photo(pid)).filter(p => p && Photos.thumb(p.id));
    if (gallery.length) out += `<h4>Images (${gallery.length})</h4><div class="info-gallery">` + gallery.map(p => `<img src="${esc(Photos.thumb(p.id))}" alt="${esc(p.title)}" title="${esc(p.title)}" data-action="view-photo" data-photo="${esc(p.id)}">`).join('') + '</div>';

    const rels = window.Relations ? Store.relationsFor(m.id) : [];
    if (rels.length) out += `<h4>Time gaps (${rels.length})</h4><ul>` + rels.map(r =>
      `<li${r.status === 'overruled' ? ' class="muted"' : ''}>⛓ ${esc(Relations.describeRelation(r))}${r.status === 'overruled' ? ' <em>(overruled)</em>' : ''}${gradeBadgeHTML(r.confidence, r.reason)}${r.sourceId ? ' ' + citeHTML(r.sourceId, r.page) : ''}${r.note ? ` <span class="muted">– ${esc(r.note)}</span>` : ''}</li>`).join('') + '</ul>';

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
        + (m.kind === 'area' && t != null ? `<button data-action="change-border" data-id="${esc(m.id)}" title="Copy the border in force at the slider's date into a new dated border and drag only the corners that moved">✥ Change border here</button>` : '')
        + `<button data-action="locate" data-id="${esc(m.id)}">🗺️ Map</button>`
        + `<button data-action="network" data-id="${esc(m.id)}">🕸️ Network</button>`
        + `<button data-action="ties" data-id="${esc(m.id)}">🔗 Ties</button>`
        + (Store.linksOf(m.id).some(l => /^(parent|spouse) of$/i.test(((Store.linkType(l.typeId) || {}).name || '').trim())) ? `<button data-action="family" data-id="${esc(m.id)}">🌳 Family</button>` : '')
        + '</div>';
    }
    return out + '</div>';
  }
  // One fact as a bubble line: "4004 BC · Born · Eden · Father: Adam, Mother: Eve – note 📖 source"
  function factLineHTML(m, f, badge) {
    const t = Store.factType(f.typeId);
    const bits = [];
    let when = '';
    const w = Facts.when(f);
    if (w.date) when = esc(Dates.formatRange(w.date, w.min, w.max)) + (t && t.hasEnd && w.dateEnd ? ' – ' + esc(Dates.formatRange(w.dateEnd, w.endMin, w.endMax)) : '');
    else if (f.dateMin || f.dateMax) when = esc(f.dateMin ? 'after ' + Dates.formatInput(f.dateMin) : 'before ' + Dates.formatInput(f.dateMax));
    else if ((m.undetermined || []).includes('fact:' + f.id)) when = '<span class="muted">undeterminable</span>';
    const b = badge ? badge('fact:' + f.id) + (t && t.hasEnd && f.dateEnd ? badge('fact:' + f.id + ':end') : '') : '';
    const title = `<strong>${esc(f.label || (t ? t.name : 'Fact'))}</strong>`;
    let where = '';
    if (f.where && f.where.kind === 'marker') { const o = Store.marker(f.where.markerId); if (o) where = `at <a class="mlink" data-action="goto-marker" data-id="${esc(o.id)}">${esc(Store.displayName(o))}</a>`; }
    else if (f.placeLabel) where = esc(f.placeLabel);
    else if (f.where && f.where.kind === 'point') where = `${(+f.where.lat).toFixed(2)}, ${(+f.where.lng).toFixed(2)}`;
    else if (f.where && f.where.coords) where = `${f.where.coords.length}-point ${f.where.kind}`;
    const who = (f.participants || []).map(p => { const o = Store.marker(p.markerId); const r = t && t.roles.find(x => x.id === p.roleId); return o ? `${esc(r ? r.name : 'with')}: <a class="mlink" data-action="goto-marker" data-id="${esc(o.id)}">${esc(Store.displayName(o))}</a>` : ''; }).filter(Boolean).join(', ');
    const details = Object.entries(f.details || {}).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
    if (when) bits.push(when + b); else if (b) bits.push(b);
    bits.push(title);
    if (where) bits.push(where);
    if (who) bits.push(who);
    if (details) bits.push(`<span class="muted">${details}</span>`);
    let line = bits.join(' · ');
    if (f.confidence) line += ' ' + gradeBadgeHTML(f.confidence, f.reason);
    if (f.note) line += ` <span class="muted">– ${esc(f.note)}</span>`;
    if (f.sourceId) line += ' ' + citeHTML(f.sourceId, f.page);
    if (f.confidence && f.reason) line += `<div class="grade-reason">${esc(CONFIDENCE_LABELS[f.confidence])}: ${textToHTML(f.reason)}</div>`;
    return `<li>${line}</li>`;
  }

  // One mirrored fact: "1 Jan 1901 BC · Born · Son: Isaac · Beersheba · from Isaac's Born fact".
  function mirrorLineHTML(mi) {
    const o = Store.marker(mi.markerId); if (!o) return '';
    const bits = [];
    if (mi.date) bits.push(esc(Dates.formatRange(mi.date, mi.dateMin, mi.dateMax)) + (mi.dateEnd ? ' – ' + esc(Dates.formatRange(mi.dateEnd, mi.dateEndMin, mi.dateEndMax)) : ''));
    bits.push(`<strong>${esc(mi.factTitle)}</strong>`);
    bits.push(`<strong>${esc(mi.word)}</strong>: <a class="mlink" data-action="goto-marker" data-id="${esc(o.id)}">${esc(Store.displayName(o))}</a>`);
    if (mi.place) bits.push(esc(mi.place));
    const details = Object.entries(mi.details || {}).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
    if (details) bits.push(`<span class="muted">${details}</span>`);
    let line = bits.join(' · ');
    if (mi.confidence) line += ' ' + gradeBadgeHTML(mi.confidence, mi.reason);
    if (mi.note) line += ` <span class="muted">– ${esc(mi.note)}</span>`;
    if (mi.sourceId) line += ' ' + citeHTML(mi.sourceId, mi.page);
    line += ` <span class="muted mirror-from">from ${esc(o.name)}'s ${esc(mi.factTitle)} fact</span>`;
    return `<li class="mirror" title="Shown here from ${esc(o.name)}'s marker; edit it there">${line}</li>`;
  }

  // Combobox for choosing a marker. Returns an element with getValue()/setValue().
  function markerSelect({ value = null, onChange, placeholder = 'Search markers…', exclude = [] } = {}) {
    const wrap = h('div', { class: 'mselect' });
    const input = h('input', { type: 'text', placeholder, autocomplete: 'off' });
    const clear = h('button', { class: 'clear', type: 'button', title: 'Clear' }, '✕');
    const list = h('div', { class: 'mselect-list hidden' });
    wrap.append(input, clear, list);
    let selected = value;
    const setLabel = () => { const m = selected && Store.marker(selected); input.value = m ? Store.displayName(m) : ''; };
    setLabel();
    function render() {
      const q = input.value.trim().toLowerCase();
      const items = Store.markers().filter(m => !exclude.includes(m.id) && (!q || Store.matchesName(m, q)))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
      list.innerHTML = '';
      for (const m of items) {
        list.append(h('div', {
          class: 'mselect-item',
          onmousedown: e => { e.preventDefault(); selected = m.id; setLabel(); list.classList.add('hidden'); input.blur(); onChange && onChange(m.id); }
        }, h('span', { class: 'swatch sm', style: { background: Store.displayColor(m) } }, Store.displayIcon(m)), Store.displayName(m),
          Store.otherNamesShown(m).length ? h('span', { class: 'muted' }, ' also ' + Store.otherNamesShown(m).join(', ')) : null,
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
  function modal({ title, body, width, onClose, side }) {
    const overlay = h('div', { class: 'modal-overlay' + (side ? ' side-modal' : '') }); // side: no backdrop, the map stays usable
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

  // Size guard for the graph views: instead of drawing a huge graph at once, say how big it is and offer a button.
  const GRAPH_LIMIT = 300;
  function sizeGuard({ count, noun = 'markers', onDraw }) {
    return h('div', { class: 'graph-empty ask' },
      h('div', {}, h('div', { style: { fontSize: '15px', marginBottom: '10px' } }, `This would draw ${count.toLocaleString()} ${noun}.`),
        h('div', { class: 'muted', style: { marginBottom: '14px' } }, 'A graph this size can be slow on a tablet. Narrow the choice, or draw it anyway.'),
        h('button', { class: 'primary', onclick: onDraw }, 'Draw it')));
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { esc, h, toast, textToHTML, select, sourceSelect, promptNewSource, citeHTML, fieldTree, markerInfoHTML, factLineHTML, mirrorLineHTML, tieHTML, markerSelect, modal, download, sizeGuard, GRAPH_LIMIT,
    reliabilitySelect, confidenceSelect, gradeBadgeHTML, reliabilityHTML, RELIABILITY_LABELS, CONFIDENCE_LABELS, CONFIDENCE_GLYPH };
})();
