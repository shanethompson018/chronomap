# Chrono Map: guide for Claude

A history and Bible learning app. Plain HTML and JavaScript, no build step. Live at
https://shanethompson018.github.io/chronomap/ (GitHub Pages, branch `main`, public repository).

| To know | Read |
|---|---|
| What the app does, in the owner's words | `README.md` |
| What is decided, built, and still open | `AGENDA.md` (search for the section number; do not read it whole) |
| The dating logic (Primavera P6 style) | `DESIGN-dating-logic.md` |
| How a file works inside, and its traps | `docs/code-notes.md` (read the section for the file you are changing) |

## The owner's rules

1. **Never enter his data.** No markers, facts, ties, fact types or sources of his, and no Bible sample data.
   He enters everything himself from the Bible; the app is his learning tool. Test records go on the localhost
   copy only, are named `T-…`, and are deleted before the work is called done.
2. **Plan first.** Say what you will do before doing it. For new work: discuss, record the decision in
   `AGENDA.md`, then build when he says so. Do not build what he has not asked for.
3. **One commit per agenda item**, so any item can be reverted on its own.
4. **He is not a developer.** Plain words, no jargon, menu paths written out (Library → Fact types). When offering
   a feature, say plainly that it is a change to the app and that he still enters all the data. An offer was once
   declined because it read as "I will enter your data".
5. He knows Primavera P6 and thinks about dates in its terms (early and late dates, relationships with lag).
6. **His devices.** A Boox Note Air 4C tablet (Android, E-ink, held upright, finger and on-screen keyboard,
   installed app; nothing may zoom except the map) and a PC, where the app is a Chrome app window on the live
   site. Neither can be tested from here: say "not checked on the Boox" when that is so.
7. At the end of a long session, export the transcript into `transcripts/` (kept out of git).

## Keeping sessions small (decided 19 Nov 2026)

- **One session per agenda item.** Before it ends, bring `AGENDA.md`, `README.md` and `docs/code-notes.md` up to
  date, so the next session needs nothing from this one. If a session grows long, suggest starting a new one.
- **Model by task.** Design-heavy work (dating logic, sync, map layout) deserves the top model. For a small fix
  or a wording change, say at the start that a cheaper model would do; he switches it in the app's model menu.
- **Sub-agents: not for building.** The files must agree with each other and a sub-agent starts knowing nothing.
  Use one for (a) the browser test run of a finished change, when its output would be bulky: give it the Testing
  section below and the exact things to check, and take back a short verdict; (b) an independent review of a
  large change before release: give it the diff, not your conclusion. Check a report against the code before
  repeating it.
- **Read little.** Find with Grep, then read only those lines. The big files are `js/map.js`, `js/store.js`,
  `js/editor.js`, `css/style.css` and `AGENDA.md`.
- **No screenshots** unless the look itself is the question. Measure with JavaScript instead.
- Batch edits: one Python patch script (exact-match replacements, each asserted to occur once) written with the
  Write tool into the scratchpad and run once. Do not put long Python in a Bash heredoc (quoting fails), and do
  not print non-ASCII from Python on this PC (cp1252).

## Rules of the code

- Classic scripts with globals, loaded in the order listed in `index.html`. No npm, no bundler, no `import`
  (this PC has no Node; Python is `py -3`). A new script goes into `index.html` **and** the `SHELL` list in `sw.js`.
- Every font size is `calc(Npx * var(--fs))` (the A− / A+ size setting), except SVG drawing text and map pins.
- Layout classes on `body`, set in `js/app.js` `fitLayout`: `compact` (narrow), `ed-side` (PC: editor is a
  right-hand drawer; otherwise it is a full-screen view), `eink`.
- Data lives in localStorage `chronomap.v1`, images in IndexedDB. Ties between markers, locations, begins/ends
  and mirrored facts are **derived** by `Facts.derive` on every change and are never stored or synced.
- Basemaps are Esri and OpenTopoMap only. Never add the OpenStreetMap tile server (it blocks the app).
- Words used on screen: Marker, Fact, Fact type, Tie, Tie type, Time gap, Limit, Location, Begins / Ends,
  Anchor / Reckoned, Library, Images. Keep to them.

## Testing

- Start the test copy with `preview_start {name: "chronomap"}` (http://localhost:8765, run by
  `py -3 tools/dev_server.py` from `.claude/launch.json`). **It keeps no cache**: after editing a file, reload and
  the new file is on screen. (`?sw=1` on the address turns the offline cache on, to test the cache itself.)
- Drive it with `javascript_tool`; clicks by coordinate are unreliable in this pane. The pane is often hidden:
  screenshots may time out, and map fly animations and focus events do not run.
- Two sizes. Tablet: `resize_window` 930 × 1240, `Store.setSetting('eink', true)`, reload. PC: preset desktop,
  E-ink off. The E-ink button reloads the page, so never press it in the middle of a script.
- Test records: `Store.addMarker`, `Store.addSource`, `Store.addRelations`; a date is referred to as
  `{kind: 'marker', id, slot: 'fact:<factId>'}` (`:end` for the until date). `MapView.setTime(Dates.toDays('1735-01-01'))`
  takes the day number of a date string. Delete every `T-` record afterwards and check the marker count is back.
- Never test on the live site, and never with his real data. Google's sign-in window opens only from his own
  click; to test sync offline, mock `window.fetch` for googleapis and put a fake token in
  `localStorage['chronomap.gtoken']`.
- Finish with `read_console_messages` (errors only).

## Release

1. `py -3 tools/stamp_release.py` before every commit that touches app files (it stamps `js/version.js` and
   `sw.js`; without it devices serve a mix of old and new files). Not needed for documents only.
2. Commit: one item, message in plain words, ending with the `Co-Authored-By` line.
3. `git push -q origin main`.
4. Wait until `https://shanethompson018.github.io/chronomap/js/version.js` shows the new stamp (PowerShell
   `Invoke-WebRequest`, usually 20 to 60 seconds; a passing error page from GitHub means try again).
5. Tell him the version stamp. He sees the same one in Library → Backup.

## Where things are

| File | What it holds |
|---|---|
| `index.html` | Every tab's fixed layout, the top bar, the script list |
| `css/style.css` | All styling; E-ink theme under `body.eink` |
| `js/app.js` | Tabs, size setting, layout classes, session restore, marker-to-marker trail, offline-cache registration |
| `js/store.js` | All data and every change to it; settings; names; the pieces sync exchanges |
| `js/facts.js` | The fact model; `derive` (ties, locations, begins/ends, siblings, mirrors, "they go there too"); `when` and the wording of a date or its window |
| `js/dates.js` | Reading, storing, formatting and adding to dates (text such as `4004 BC`, `1776-07-04`) |
| `js/relations.js` | Time gaps and limits: the solver, windows, conflicts, the tie dialog |
| `js/editor.js` | The marker editor: facts, date boxes, drafts, parking while the map is used |
| `js/map.js` | Map tab: time slider, pins, areas, pins inside an area, picking and drawing, the left list |
| `js/overlay.js` | A picture laid over the map, and outlines traced from it |
| `js/ui.js` | Shared helpers: `h`, modal, marker information panel, fact lines, coordinate reading, zoom tools |
| `js/graph.js` | The drawing shared by Ties and Network |
| `js/ties.js`, `js/network.js`, `js/family.js`, `js/timeline.js`, `js/gantt.js` | Those five tabs |
| `js/data.js` | Library tab: Sync, Time gaps, Sources, Images, Categories, Fact types, Tie types, Markers, Backup, Problems log |
| `js/sync.js` | Google Drive sync |
| `js/photos.js` | The image library (IndexedDB), chooser, lightbox |
| `js/log.js` | The problems log each device keeps (loaded first) |
| `js/isbn.js`, `js/sample.js`, `js/config.js`, `js/version.js` | Book lookup, the sample data, the Google client ID, the release stamp |
| `sw.js` | Offline cache for the live app |
| `tools/` | `stamp_release.py` (release stamp), `dev_server.py` (test copy) |
