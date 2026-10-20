// ISBN lookup: fills a source's title, author, year and publisher from the number on the back of a book.
// Open Library first (free, no key), then Google Books as the fallback. Needs an internet connection
// at the moment of the lookup only; nothing is stored anywhere but in the source itself.
window.Isbn = (() => {
  function clean(s) { return String(s || '').toUpperCase().replace(/[^0-9X]/g, ''); }

  function valid(s) {
    const n = clean(s);
    if (n.length === 10) {
      let sum = 0;
      for (let i = 0; i < 10; i++) { const d = n[i] === 'X' ? 10 : +n[i]; if (isNaN(d)) return false; sum += d * (10 - i); }
      return sum % 11 === 0;
    }
    if (n.length === 13) {
      if (!/^\d{13}$/.test(n)) return false;
      let sum = 0;
      for (let i = 0; i < 13; i++) sum += +n[i] * (i % 2 ? 3 : 1);
      return sum % 10 === 0;
    }
    return false;
  }

  function year(s) { const m = String(s || '').match(/\b(\d{4})\b/); return m ? m[1] : ''; }
  function joinNames(list) { return (list || []).map(a => typeof a === 'string' ? a : (a && a.name) || '').filter(Boolean).join(', '); }

  async function getJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function openLibrary(n) {
    const data = await getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${n}&format=json&jscmd=data`);
    const b = data && data[`ISBN:${n}`];
    if (!b || !b.title) return null;
    return {
      title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
      author: joinNames(b.authors),
      year: year(b.publish_date),
      where: joinNames(b.publishers),
      pages: b.number_of_pages || '',
      from: 'Open Library',
    };
  }

  async function googleBooks(n) {
    const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${n}&maxResults=1`);
    const v = data && data.items && data.items[0] && data.items[0].volumeInfo;
    if (!v || !v.title) return null;
    return {
      title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
      author: joinNames(v.authors),
      year: year(v.publishedDate),
      where: v.publisher || '',
      pages: v.pageCount || '',
      from: 'Google Books',
    };
  }

  // Resolves to { title, author, year, where, pages, isbn, from } or null when neither service knows the book.
  // Throws when there is no connection at all.
  async function lookup(s) {
    const n = clean(s);
    if (!valid(n)) throw new Error('That is not a valid ISBN (10 or 13 digits; the last may be X).');
    if (!navigator.onLine) throw new Error('No internet connection. Looking up an ISBN needs one.');
    let hit = null;
    const failed = [];
    for (const [name, svc] of [['Open Library', openLibrary], ['Google Books', googleBooks]]) {
      try { hit = await svc(n); } catch (e) { failed.push(name); }
      if (hit) break;
    }
    if (hit) return Object.assign(hit, { isbn: n });
    if (failed.length === 2) throw new Error('Could not reach the book services. Check the connection and try again.');
    if (failed.length) throw new Error(`Not found on ${failed[0] === 'Open Library' ? 'Google Books' : 'Open Library'}, and ${failed[0]} did not answer. Try again later or type the details by hand.`);
    return null;
  }

  return { clean, valid, lookup };
})();
