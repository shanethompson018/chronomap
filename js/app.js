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

  function showTab(name) {
    if (current === name) { if (name === 'map') MapView.show(); return; }
    current = name;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'map') MapView.show();
    else if (name === 'ties') Ties.show();
    else if (name === 'network') Network.show();
    else if (name === 'data') DataTab.show();
  }
  const currentTab = () => current;

  function newMarker() {
    Editor.openNew({ name: 'New marker', kind: 'pin', categoryId: Store.categories()[0]?.id || null, facts: [] });
  }

  function onGlobalClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id, action = el.dataset.action;
    if (action === 'edit') Editor.open(id);
    else if (action === 'locate') { showTab('map'); MapView.locate(id); }
    else if (action === 'network') { showTab('network'); Network.setCenter(id); }
    else if (action === 'ties') { showTab('ties'); Ties.setHub(id); }
    else if (action === 'view-photo') { e.preventDefault(); Photos.view(el.dataset.photo); }
    else if (action === 'change-border') { showTab('map'); Editor.changeBorderHere(id); }
    else if (action === 'goto-marker') {
      if (current === 'map') MapView.locate(id);
      else if (current === 'ties') Ties.select(id);
      else if (current === 'network') Network.select(id);
      else Editor.open(id);
    }
  }

  function init() {
    try {
      Store.load();
      applyEink(detectEink());
      Relations.init();
      MapView.init();
      Editor.init();
      Ties.init();
      Network.init();
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
    registerServiceWorker();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (MapView.isPicking()) MapView.cancelPick(); }
    });
  }

  // Installable app: the service worker caches the app files so it opens offline and from the home screen.
  // Browsers only allow this over https or localhost, so it is skipped when opened as a file.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const t = UI.h('div', { class: 'toast' }, 'A new version of Chrono Map is ready. ', UI.h('button', { class: 'small', onclick: () => location.reload() }, 'Reload'));
            document.getElementById('toast-host').append(t);
          }
        });
      });
    }).catch(e => console.warn('Service worker not registered', e));
  }

  return { init, showTab, currentTab, newMarker, isEink };
})();

document.addEventListener('DOMContentLoaded', App.init);
