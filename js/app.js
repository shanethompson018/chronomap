/* App shell: tabs, global click handling, start-up. */
window.App = (() => {
  let current = 'map';
  let eink = false;

  // E-ink mode: explicit setting wins; otherwise guess from the device (Boox/Onyx tablets, or a slow-refresh screen).
  function detectEink() {
    const s = Store.settings().eink;
    if (s === true || s === false) return s;
    if (/boox|onyx|noteair|note air|eink|e-ink/i.test(navigator.userAgent)) return true;
    try { if (window.matchMedia('(update: slow)').matches) return true; } catch (e) { /* ignore */ }
    return false;
  }
  function applyEink(on) {
    eink = !!on;
    document.body.classList.toggle('eink', eink);
    const btn = document.getElementById('btn-eink');
    if (btn) { btn.classList.toggle('primary', eink); btn.title = (eink ? 'E-ink mode is on. ' : '') + 'E-ink mode: light high-contrast theme, no animations, larger controls (for Boox and other e-paper screens)'; }
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = eink ? '#ffffff' : '#15181e';
  }
  function toggleEink() {
    const on = !eink;
    const s = Store.settings();
    if (on && s.basemap !== 'light' && s.basemap !== 'none') { Store.setSetting('basemapBeforeEink', s.basemap); Store.setSetting('basemap', 'light'); }
    if (!on && s.basemapBeforeEink) { Store.setSetting('basemap', s.basemapBeforeEink); Store.setSetting('basemapBeforeEink', null); }
    Store.setSetting('eink', on);
    location.reload(); // the map's animation settings are fixed when it is created
  }
  const isEink = () => eink;

  // Size setting: one factor for every letter, box and button, remembered on this device (not synced, since a
  // tablet and a PC want different sizes). body.compact marks a screen that is narrow for the chosen size.
  const SIZES = [0.9, 1, 1.15, 1.3, 1.5, 1.75, 2], SIZE_KEY = 'chronomap.size';
  let size = 1;
  function readSize() { try { const v = +localStorage.getItem(SIZE_KEY); return SIZES.includes(v) ? v : 1; } catch (e) { return 1; } }
  function fitLayout() {
    const compact = window.innerWidth / size < 1000;
    document.body.classList.toggle('compact', compact);
    // the marker editor: a side drawer on a PC (wide, mouse, E-ink mode off), a full-screen view on a tablet
    let coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    document.body.classList.toggle('ed-side', !compact && !eink && !coarse);
    const top = document.querySelector('.topbar');
    if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
  }
  function applySize(v, announce) {
    size = v;
    document.documentElement.style.setProperty('--fs', String(v));
    const down = document.getElementById('btn-size-down'), up = document.getElementById('btn-size-up');
    if (down) { down.disabled = v <= SIZES[0]; up.disabled = v >= SIZES[SIZES.length - 1]; down.title = up.title = `Size of letters, boxes and buttons: ${Math.round(v * 100)}% (kept on this device)`; }
    fitLayout();
    if (announce) {
      try { localStorage.setItem(SIZE_KEY, String(v)); } catch (e) { /* ignore */ }
      UI.toast(`Size ${Math.round(v * 100)}%`);
      document.dispatchEvent(new CustomEvent('chrono-size'));
    }
  }
  function stepSize(d) { const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + d)); if (SIZES[i] !== size) applySize(SIZES[i], true); }
  const getSize = () => size;

  // The left panel of the Map, Ties, Network and Family tabs folds away to give the map or drawing the whole
  // width; the choice is remembered on this device.
  const SIDE_KEY = 'chronomap.side';
  function applySide(closed, save) {
    document.body.classList.toggle('side-closed', closed);
    const b = document.getElementById('btn-side');
    if (b) { b.classList.toggle('primary', closed); b.title = closed ? 'The left panel is folded away. Tap to bring it back.' : 'Fold the left panel away to give the map or drawing the whole width'; }
    if (save) { try { localStorage.setItem(SIDE_KEY, closed ? '0' : '1'); } catch (e) { /* ignore */ } }
    if (window.MapView && MapView.leaflet()) MapView.leaflet().invalidateSize();
  }
  const sideClosed = () => document.body.classList.contains('side-closed');

  function showTab(name) {
    document.body.dataset.tab = name;
    if (current === name) { if (name === 'map') MapView.show(); return; }
    current = name;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'map') MapView.show();
    else if (name === 'ties') Ties.show();
    else if (name === 'network') Network.show();
    else if (name === 'family') Family.show();
    else if (name === 'timeline') Timeline.show();
    else if (name === 'data') DataTab.show();
  }
  const currentTab = () => current;

  function newMarker() {
    Editor.openNew({ name: 'New marker', kind: 'pin', categoryId: Store.categories()[0]?.id || null, facts: [] });
  }

  // ---------- from one marker's information to a tied marker's, and back ----------
  let trail = []; // steps taken through tied names: [{ from, to }]
  function showMarker(id) {
    if (current === 'map') MapView.locate(id);      // its bubble; a marker with nothing on the map gets a dialog
    else if (current === 'ties') Ties.select(id);
    else if (current === 'network') Network.select(id);
    else if (current === 'family') Family.select(id);
    else if (current === 'timeline') Timeline.select(id);
    else UI.markerCard(id);
  }
  function gotoMarker(id, fromId) {
    if (!Store.marker(id)) return;
    if (fromId && fromId !== id) {
      if (trail.length && trail[trail.length - 1].to !== fromId) trail = []; // a fresh walk starts here
      trail.push({ from: fromId, to: id });
      if (trail.length > 50) trail.shift();
    }
    UI.closeMarkerCard();
    showMarker(id);
  }
  // the Back button shown at the top of a marker's information when it was reached through a tied name
  function backHTML(id) {
    const top = trail[trail.length - 1];
    const m = top && top.to === id ? Store.marker(top.from) : null;
    return m ? `<button class="small back-btn" data-action="back-marker" title="Back to the marker you came from">← Back to ${UI.esc(Store.displayName(m))}</button>` : '';
  }
  function goBack() { const top = trail.pop(); if (!top) return; UI.closeMarkerCard(); showMarker(top.from); }

  function onGlobalClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id, action = el.dataset.action;
    if (action !== 'goto-marker' && action !== 'back-marker' && action !== 'view-photo') UI.closeMarkerCard(); // the dialog steps aside for Edit, Map, Network…
    if (action === 'back-marker') { goBack(); return; }
    if (action === 'edit') Editor.open(id);
    else if (action === 'locate') { showTab('map'); MapView.locate(id); }
    else if (action === 'network') { showTab('network'); Network.setCenter(id); }
    else if (action === 'ties') { showTab('ties'); Ties.setHub(id); }
    else if (action === 'family') { showTab('family'); Family.setRoot(id); }
    else if (action === 'timeline') { showTab('timeline'); Timeline.add(id); }
    else if (action === 'view-photo') { e.preventDefault(); Photos.view(el.dataset.photo); }
    else if (action === 'change-border') { showTab('map'); Editor.changeBorderHere(id); }
    else if (action === 'goto-marker') {
      const from = el.closest('.info[data-mid]');
      gotoMarker(id, from ? from.dataset.mid : null);
    }
  }

  function init() {
    try {
      Store.load();
      applyEink(detectEink());
      applySize(readSize(), false);
      Relations.init();
      MapView.init();
      Editor.init();
      Ties.init();
      Network.init();
      Family.init();
      Timeline.init();
      DataTab.init();
      Photos.init().catch(err => console.warn('Photos failed to load', err));
      Sync.init();
    } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('afterbegin', `<div style="padding:20px;color:#f66">Start-up error: ${UI.esc(e.message)}. If this page was opened without an internet connection, the map and graph libraries could not load.</div>`);
      return;
    }
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
    document.getElementById('btn-new-marker').addEventListener('click', newMarker);
    document.getElementById('btn-eink').addEventListener('click', toggleEink);
    document.getElementById('btn-side').addEventListener('click', () => applySide(!sideClosed(), true));
    document.body.dataset.tab = current;
    let side = null; try { side = localStorage.getItem(SIDE_KEY); } catch (e) { /* ignore */ }
    applySide(side === '0', false);
    document.getElementById('btn-size-down').addEventListener('click', () => stepSize(-1));
    document.getElementById('btn-size-up').addEventListener('click', () => stepSize(1));
    window.addEventListener('resize', fitLayout);
    fitLayout();
    // Conflict badge: visible only while some related dates disagree
    const cBtn = document.getElementById('btn-conflicts');
    const paintConflicts = () => { const n = Relations.conflicts().length; cBtn.textContent = `⚠ ${n} conflict${n === 1 ? '' : 's'}`; cBtn.classList.toggle('hidden', n === 0); };
    document.addEventListener('chrono-conflicts', paintConflicts);
    cBtn.addEventListener('click', () => Relations.showConflicts());
    paintConflicts();
    // Sync button: shows the state, click signs in (first time) or syncs now
    const syncBtn = document.getElementById('btn-sync');
    const paintSync = () => {
      const s = Sync.status();
      syncBtn.textContent = { off: '☁ Sync', signin: '☁ Sign in', syncing: '⟳ Syncing…', ok: '☁ ' + s.text.replace('Synced ', ''), error: '⚠ Sync', offline: '☁ Offline' }[s.state] || '☁ Sync';
      syncBtn.title = s.text + (Sync.lastError() ? '\n' + Sync.lastError().message : '') + '\nClick to sync now.';
      syncBtn.className = 'sync-btn sync-' + s.state;
      syncBtn.disabled = s.state === 'syncing';
    };
    document.addEventListener('chrono-sync', paintSync);
    paintSync();
    syncBtn.addEventListener('click', () => { if (!Sync.configured()) { UI.toast('Sync is not configured in js/config.js', 'error'); return; } if (Sync.enabled() && Sync.hasToken()) Sync.run({ interactive: true, reason: 'button' }); else Sync.signIn().catch(e => UI.toast('Sign-in: ' + e.message, 'error')); });
    document.addEventListener('click', onGlobalClick);
    // Library tables turn into cards on a narrow screen (css: body.compact table.grid); for that every cell
    // carries the heading of its column, filled in whenever a table is drawn.
    const labelTables = () => document.querySelectorAll('table.grid').forEach(tb => {
      const heads = [...tb.querySelectorAll('thead th')].map(th => th.textContent.trim());
      tb.querySelectorAll('tr').forEach(tr => { if (tr.closest('thead')) return; [...tr.children].forEach((td, i) => { if (td.dataset.label == null) td.dataset.label = heads[i] || ''; }); });
    });
    let labelTimer = null;
    new MutationObserver(() => { clearTimeout(labelTimer); labelTimer = setTimeout(labelTables, 0); }).observe(document.body, { childList: true, subtree: true });
    labelTables();
    registerServiceWorker();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (MapView.isPicking()) MapView.cancelPick(); }
    });
  }

  // Installable app: the service worker caches the app files so it opens offline and from the home screen.
  // Browsers only allow this over https or localhost, so it is skipped when opened as a file.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    // A new release installs as a new worker. If nothing is being edited the page reloads itself so every file
    // is from the same release; otherwise a toast offers Reload.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      const busy = (window.Editor && Editor.isOpen()) || (window.MapView && MapView.isPicking());
      if (!busy) { reloading = true; location.reload(); }
      else { const t = UI.h('div', { class: 'toast' }, 'A new version of Chrono Map is ready. ', UI.h('button', { class: 'small', onclick: () => location.reload() }, 'Reload')); document.getElementById('toast-host').append(t); }
    });
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {}); // check for a new release on every open
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller && !reloading) {
            const busy = (window.Editor && Editor.isOpen()) || (window.MapView && MapView.isPicking());
            if (busy) { const t = UI.h('div', { class: 'toast' }, 'A new version of Chrono Map is ready. ', UI.h('button', { class: 'small', onclick: () => location.reload() }, 'Reload')); document.getElementById('toast-host').append(t); }
          }
        });
      });
    }).catch(e => console.warn('Service worker not registered', e));
  }

  return { init, showTab, currentTab, newMarker, isEink, backHTML, gotoMarker, size: getSize, isCompact: () => document.body.classList.contains('compact') };
})();

document.addEventListener('DOMContentLoaded', App.init);
