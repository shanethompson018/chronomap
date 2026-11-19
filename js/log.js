/* Problems log: a short record this device keeps of how the app has been running, so that a fault on a tablet
 * can be read afterwards instead of guessed at.
 *
 * It records when the app started (and how the session before it ended), when it was hidden and shown again,
 * every error, and the result of every sync. It holds no markers, facts or sources. The newest 250 lines are
 * kept in this browser; a sync also puts a copy in the Drive folder so the log of one device can be read on
 * another (Library → Problems log).
 *
 * Loaded before every other script so that an error in any of them is caught. It depends on nothing.
 */
window.Log = (() => {
  const KEY = 'chronomap.log', ALIVE = 'chronomap.alive', DEVICE = 'chronomap.device', MAX = 250;
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: the log is not worth failing over */ } };
  let entries = read(KEY, []);
  if (!Array.isArray(entries)) entries = [];
  let saveTimer = null;
  const flush = () => { clearTimeout(saveTimer); saveTimer = null; write(KEY, entries); };

  function add(kind, msg) {
    const text = String(msg == null ? '' : msg).replace(/\s+/g, ' ').slice(0, 400);
    const last = entries[entries.length - 1];
    if (last && last.k === kind && last.m === text && Date.now() - last.t < 120000) last.n = (last.n || 1) + 1; // repeats collapse into one line
    else entries.push({ t: Date.now(), k: kind, m: text });
    if (entries.length > MAX) entries.splice(0, entries.length - MAX);
    if (kind === 'error' || kind === 'start' || kind === 'hidden' || kind === 'reload') flush(); else if (!saveTimer) saveTimer = setTimeout(flush, 1500);
  }

  // ---------- this device ----------
  function device() {
    let d = read(DEVICE, null);
    if (!d || !d.id) {
      const ua = navigator.userAgent || '';
      const model = (ua.match(/;\s*([^;()]+?)\s+Build\//) || [])[1];
      const kind = /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows PC' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /iPhone|iPad/i.test(ua) ? 'iPhone or iPad' : /Linux/i.test(ua) ? 'Linux' : 'Device';
      d = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: `${model && model !== 'K' ? model + ' (' + kind + ')' : kind}${screen.width ? ` ${screen.width}×${screen.height}` : ''}` };
      write(DEVICE, d);
    }
    return d;
  }
  function renameDevice(name) { const d = device(); d.name = String(name || '').trim().slice(0, 60) || d.name; write(DEVICE, d); return d; }

  // ---------- how the session before this one ended ----------
  const clock = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const span = ms => (ms < 90000 ? Math.round(ms / 1000) + ' s' : ms < 5400000 ? Math.round(ms / 60000) + ' min' : (ms / 3600000).toFixed(1) + ' h');
  const prev = read(ALIVE, null);
  let lastEnd = 'This is the first session the log has seen.';
  if (prev && prev.started) {
    if (prev.closed) lastEnd = `closed in the ordinary way at ${clock(prev.seen)} (the window was closed, or the page was reloaded)`;
    else if (prev.state === 'hidden') lastEnd = `was put in the background at ${clock(prev.hiddenAt || prev.seen)} and never came back: the device stopped it there, or it was swiped away`;
    else lastEnd = `STOPPED WHILE ON SCREEN at about ${clock(prev.seen)} after ${span(prev.seen - prev.started)}: a crash, a forced stop, or the power`;
  }
  const alive = { started: Date.now(), seen: Date.now(), state: document.visibilityState === 'hidden' ? 'hidden' : 'visible', closed: false };
  const beat = () => { alive.seen = Date.now(); write(ALIVE, alive); };
  beat();
  setInterval(() => { if (document.visibilityState === 'visible') beat(); }, 20000);

  const memory = () => { try { const m = performance.memory; return m ? `, script memory ${Math.round(m.usedJSHeapSize / 1048576)} MB` : ''; } catch (e) { return ''; } };
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now(); alive.state = 'hidden'; alive.hiddenAt = hiddenAt; beat();
      add('hidden', 'went to the background' + memory());
    } else {
      alive.state = 'visible'; beat();
      add('visible', 'back on screen' + (hiddenAt ? ' after ' + span(Date.now() - hiddenAt) : ''));
    }
  });
  window.addEventListener('pagehide', e => { if (!e.persisted) { alive.closed = true; beat(); } flush(); });
  window.addEventListener('pageshow', e => { if (e.persisted) { alive.closed = false; beat(); add('visible', 'restored from the browser\'s page cache'); } });
  document.addEventListener('freeze', () => { add('hidden', 'frozen by the browser'); flush(); });
  document.addEventListener('resume', () => add('visible', 'unfrozen by the browser'));

  // ---------- errors ----------
  const where = (file, line, col) => (file ? ` @ ${String(file).split('/').pop().split('?')[0]}:${line || 0}:${col || 0}` : '');
  window.addEventListener('error', e => {
    if (e.target && e.target !== window) { const t = e.target; if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') add('error', `could not load ${t.src || t.href}`); return; }
    add('error', (e.message || 'error') + where(e.filename, e.lineno, e.colno));
  }, true);
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    add('error', 'unhandled: ' + (r && (r.message || r.name) ? `${r.name || 'Error'}: ${r.message || ''}` : String(r)) + (r && r.stack ? ' | ' + String(r.stack).split('\n').slice(1, 3).map(s => s.trim()).join(' | ') : ''));
  });
  const say = v => (v instanceof Error ? `${v.name}: ${v.message}` + (v.stack ? ' | ' + String(v.stack).split('\n').slice(1, 3).map(s => s.trim()).join(' | ') : '') : typeof v === 'object' ? (() => { try { return JSON.stringify(v).slice(0, 200); } catch (e) { return String(v); } })() : String(v));
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => { try { add(level, args.map(say).join(' ')); } catch (e) { /* never let the log break the app */ } orig(...args); };
  }

  // ---------- the first line of the session, written once the page has loaded ----------
  window.addEventListener('DOMContentLoaded', () => {
    let nav = ''; try { nav = (performance.getEntriesByType('navigation')[0] || {}).type || ''; } catch (e) { /* ignore */ }
    const how = nav === 'reload' ? 'reloaded' : nav === 'back_forward' ? 'reopened from history' : 'opened';
    let data = 0; try { data = (localStorage.getItem('chronomap.v1') || '').length; } catch (e) { /* ignore */ }
    add('start', `${how} · version ${window.ChronoVersion || '?'} · ${device().name} · window ${window.innerWidth}×${window.innerHeight}`
      + (navigator.deviceMemory ? ` · device memory ${navigator.deviceMemory} GB` : '') + ` · data ${Math.round(data / 1024)} KB`
      + (document.wasDiscarded ? ' · THE BROWSER HAD DISCARDED THIS PAGE TO FREE MEMORY' : '') + ` · before this: ${lastEnd}`);
    try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => add('info', `storage used ${Math.round((e.usage || 0) / 1048576)} MB of ${Math.round((e.quota || 0) / 1048576)} MB`)).catch(() => {}); } catch (e) { /* ignore */ }
  });

  // ---------- reading it ----------
  const stamp = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const line = e => `${stamp(e.t)}  ${String(e.k).toUpperCase().padEnd(7)} ${e.m}${e.n > 1 ? `  (×${e.n})` : ''}`;
  const textOf = doc => [`Chrono Map problems log · ${doc.device ? doc.device.name : 'unknown device'} · version ${doc.version || '?'} · written ${stamp(doc.at || Date.now())}`,
    ...(doc.entries || []).slice().reverse().map(line)].join('\n');
  const exportDoc = () => ({ device: device(), version: window.ChronoVersion || '', at: Date.now(), entries: entries.slice() });
  // the time of the newest line that is worth sending to Drive (a sync's own line does not count, or every sync would upload)
  const changedAt = () => { for (let i = entries.length - 1; i >= 0; i--) if (entries[i].k !== 'sync') return entries[i].t; return 0; };

  return { add, flush, device, renameDevice, entries: () => entries.slice(), lastEnd: () => lastEnd, text: () => textOf(exportDoc()), textOf, exportDoc, changedAt,
    clear: () => { entries = []; flush(); } };
})();
