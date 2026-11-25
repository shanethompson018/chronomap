# Code notes

How each part works inside, and the traps found while building it. Written at build time: where a note and
the code disagree, the code is right, and the note should be corrected. Read only the section you need.

## Whole app

- Built October 2026. Scripts are classic globals because the app was first opened as a file (`file://`), where
  ES modules do not load, and the PC has no Node.
- Hosting: GitHub Pages. Sync: the owner's Google Drive (Supabase was considered and rejected). The Drive
  API client ID is in `js/config.js` and is public by design; its allowed origins are the Pages site and
  `http://localhost:8765`.
- Libraries from cdnjs: Leaflet 1.9.4, D3 7.9.0.
- `UI.modal`: `onClose` fires on a programmatic close too. A dialog that resolves a promise must resolve it
  **before** calling `close()` (the picture chooser once returned nothing because of this).
- Never give a modal the class `side` (the sidebar's rule swallows it). The side panel class is `side-modal`.
- Library tables turn into cards under `body.compact` through `td[data-label]`.

## js/store.js

- Collections: markers, relations, sources, photos, categories, fact types, tie types, settings, tombstones
  (`deleted`). Data version 3; `Facts.migrateV2` converts older data.
- A marker is `{ id, name, kind: 'pin'|'area'|'path', categoryId, sex, tellApart, facts: [...] , ... }`. `moves`,
  `start`, `end`, `mirrors` and the links are filled by `Facts.derive`, not stored.
- Names: a seeded fact type "Also named" (`ft_named`; details Name and Kind from `Store.NAME_KINDS`).
  `Store.nameAt(m, t)`, `displayName(m, t)`, `allNames`, `matchesName`, `tagOf`. A tag (son of…, b. year,
  category) shows only when two markers share a name; `marker.tellApart` overrides it. The name index is rebuilt
  lazily after each commit.
- Relations (time gaps and limits): `normRelation` gives `part` 'date' | 'min' | 'max' (default 'date').
  `addRelation` anchors ends automatically for date ties only. `addRelations(list)` is one commit.
  `applySolved` writes reckoned dates and clears one whose tie is no longer an active date tie.
  `applyWindows` writes or removes `calcMin / calcMax / calcEndMin / calcEndMax` on facts. `slotTyped(ref)` is
  what the user typed for a slot.
- `setSetting` skips an unchanged value; `setSettings(obj)` changes several in one commit.
- Sync pieces: `exportSyncDoc`, `replaceSyncDoc`; merge is per record, newest wins, with tombstones.
- Grading: `source.reliability` (high | reliable | questionable | unreliable); `confidence` + `reason` on facts,
  field grades and relations (high | reasonable | low | none). `UI.gradeBadgeHTML` draws the badge.

## js/facts.js

- A fact: `{ typeId, date, dateEnd, dateMin, dateMax, dateEndMin, dateEndMax, where, participants: [{roleId,
  markerId}], details, note, sourceId, page, confidence }` plus the calculated `calc…` ends.
- `derive(d)` runs on every commit: Begins/Ends, moves (locations), links, then `deriveSiblings` (Sibling of /
  Half-sibling of from shared Parent of ties; one parent in common = half, the owner's rule) and
  `deriveMirrors` (a fact shown on the other marker: Son / Daughter / Father / Husband… by the owner's sex;
  every role mirrors unless `role.mirror === false`; word = `role.mirrorWord` or `defaultMirrorWord`).
- A dated "Had child" mirror gives the child its Born date when the child has no dated Begins.
- "They go there too" (`role.goes`): the fact's move is copied onto every marker named in that role
  (`mv.sharedFrom`); the mirror carries `placed`.
- Journeys (`factType.journey`, `fact.startAt` / `fact.endAt`, marker ids; both absent when not set):
  `deriveJourneys` runs after the "they go there too" places are in and adds to each traveller's moves an
  undated `<factId>~start` and a dated `<factId>~end` (`journeyOf`, `journeyStart` / `journeyEnd`, `sharedFrom`
  when the fact is on another marker). Travellers = roles with `goes`, plus the owner when `owner.kind === 'pin'`.
  Arrivals are judged against a snapshot of the moves taken before any start or end is added; starts are judged
  after the arrivals are in, so a second journey does not add a start where the first one's arrival already
  places the traveller. A traveller's own dated move after From and up to the arrival = left the party: no
  arrival, and their copy of the route move gets that date as its `dateEnd`. Move ids must not contain `|`
  (map layers are keyed `markerId|moveId` and split on it). Section 19 (stops) is meant to add a list
  between `startAt` and `endAt`.
- `when(f)` merges typed ends with calculated ends and returns `{ date, min, max, lo, hi, known, knownEnd, … }`.
  With no date, `date` is the middle of the window (or its one end) for ordering only. `whenText` / `whenLabel`
  word a date or its window ("between X and Y", "after X", "before X").
- `sexOf(m)` falls back to a Sex / Gender field.

## js/relations.js

- Stage 1: date ties (`part` 'date'), the original time-gap solver, unchanged. Approximate gaps carry min and
  max offsets; `likelyOf` uses the midpoint when the most-likely length is blank.
- Stage 2: `solveWindows()`, a forward and backward pass over limit ties ('min' = not before, 'max' = not
  after). Every tie is used both ways. A fact with an until date has an implicit limit of its own (until is not
  before from, ids `own|…`). Windows are written only for dates a real tie touches.
- Conflicts: `Relations.conflicts()`; a closed window is `{ window: true, rels, slots }`, reported once on the
  nodes where two limits meet head-on.
- `windowOf(ref)` → `{ E, L, eBy, lBy, conflict, minTies, maxTies }`; `governText(by)`; `limitText`.
- The tie dialog: `Relations.pick(thisRef, { part, onDone })`, rows of `{ part, where: 'on'|'after'|'before',
  y, m, d, markerId, slotKey, verse, approx, lo, hi }` with one shared source, a "Reads as" line per row and a
  result preview. `convert(relId, part)` turns a zero gap into a limit (Library → Time gaps).
- Not built: the lifetime rule (design step C) and the Timeline bar layout (step E).

## js/editor.js

- Sections fold (`chronomap.editorSections`); facts show as summary lines until opened. Save keeps the editor
  open (a snapshot decides "unsaved"); the `calc…` fields are left out of that snapshot and kept on save.
- `dateField`: Earliest / the date / Latest, a ⛓ button beside each, "(tied)" placeholders, lines naming the
  governing tie and the window's width.
- On the tablet the editor is a full-screen view: `Editor.park()` hides it with the work kept while the map is
  needed, `unpark()` and the `#editor-pill` bring it back. Under `body.ed-side` (PC) `park()` does nothing.
- Draft autosave: `chronomap.draft`, `persistDraft`, `Editor.resume()`.
- `renderJourney(i)`: the "Starts at" / "Ends at" boxes, shown only when the fact's type has `journey`. Clearing
  a box deletes the key from the draft fact. `UI.journeyText(startAt, endAt, html)` words it ("from Ur to
  Haran") for the fact line, the mirror line and the information panel.

## js/map.js

- Layers are keyed `markerId|moveId` with a `primary` map. Presence and location weights fade approximate dates
  (50 / 75 / 100; 60 flat; two copies while windows overlap).
- Pins inside an area (`geo.inside`): `insideLayout()` spaces the rings from the room the outline gives:
  `clearance()` = pixels from the pins' centre to the nearest edge of the outline (the extent when there is
  one), less `PIN_R` 17, shared between the rings (`FAN_STEP` 36 down to `FAN_MIN` 18). Below that
  `upsertGroup()` draws one counted pin (`group|areaId`); `expandGroup()` zooms in by `lay.grow`. When the
  centre is outside the outline (a crescent) the bounding box is used instead. The fan offset is applied once,
  through `iconAnchor` in `pinIcon`; do not add a transform as well (that doubled it until 23 Nov 2026).
  The zoom-in animation does not run in the hidden test pane, so check `grow` by arithmetic. `refresh()` runs on `zoomend` while any such area is on screen, or more than one loose pin.
- Pins on one spot: `stackPins()` groups the loose pins (not `geo.inside`) whose centres are within `STACK_PX`
  8 pixels at the current zoom; `upsertStack()` draws one numbered pin (`stack|markerId|moveId` of its first
  member, or of the host: the member the others are located at). A stack is a group record like the area's
  (`isGroup`, plus `stack: true`), so `primary`, ties, the left list, `locate` and `expandGroup` treat both
  alike. `same` = every member at the identical point: zooming cannot part them, so the bubble has no zoom
  button and `expandGroup` opens the marker's information instead. `spread` is the pixel distance used to
  work out how far to zoom. Clustering over a wider radius is not built.
- Explicit edit modes: `editShape`, `movePoint` (`pick.type` 'edit' / 'move'). An area's `where` carries
  `extent`, `rough`, `extentRough`, drawn by `buildArea`.
- `banner` / `hideBanner` park and unpark the editor. The banner has a box for typing coordinates
  (`UI.parseLatLng`). `goTo` falls back to `setView` when the target is the current centre (Leaflet's `flyTo`
  gives NaN there).
- Leaflet's `latLngToContainerPoint` rounds to whole pixels: use `project()` and `getPixelOrigin` for
  sub-pixel work.
- `getState` / `setState` serve session restore. Labels use `Store.nameAt(m, sliderTime)`.

## js/overlay.js

- A canvas layer fitted by an affine transform from 2 or 3 control points (`photo.georef`). Tools: flood fill +
  boundary for an outline, thinning + skeleton walk for a traced line. Nothing is guessed from outside the
  pixels clicked.
- The panel docks right and folds when its title is tapped; a new picture is placed in the free area beside
  it. A red status stays on screen when a picture fails to load. Off map and Delete buttons.

## js/graph.js, js/ties.js, js/network.js

- `fanOut()` groups links between the same pair and bends them apart (`FAN_MAX` 5; a bundle link "n ties"
  opens on click). Links are `<path>`.
- `UI.sizeGuard` / `GRAPH_LIMIT` 300 stop a huge graph being drawn by accident. Ties opens with nothing chosen.
- `viewCache` keeps the view across redraws; `home()` is reading size centred on the chosen marker.
  `UI.zoomTools` + `UI.zoomFilter` (buttons, no pinch).

## js/family.js

- Hourglass chart from Parent of and Spouse of ties. A unit is a person and their partners, with a child group
  per partner; pedigree above; brothers and sisters as leaf units in the root's row.
- Every unit needs `left: []` and `right: []` (a missing pair once broke the tree for anyone with siblings).
  Partners alternate left and right, ordered by marriage date, then first child's birth.
- Generations shown are typed, with All (`chronomap.family`).

## js/timeline.js

- Chosen markers and layout in `chronomap.timeline` `{ ids, layout: 'list'|'lanes', mirrors, gaps }`. Rows are
  grouped by day; a date known only as a window gets its own row labelled with the window and is left out of
  the "… later" gap text.

## js/sync.js

- Google Identity Services token model, scope `drive.file`. Folder "Chrono Map": `chronomap-data.json`,
  `photos/`, and `chronomap-log-<deviceId>.json` per device.
- `run()` lists every data file the app can see, merges all, keeps the oldest, trashes extras.
- `getToken(mode)`: `false` | 'renew' | 'choose'. **An automatic sync never opens Google's window**; it sets
  the status to sign-in and waits for his tap.
- 'renew' passes `login_hint: settings.driveUser`, so `driveUser` must always be the account really in use:
  `whoAmI()` runs after every new token (`freshToken`), and `signIn()` clears `driveUser` first. (Until 23 Nov
  2026 it was asked once only, and every renewal went back to the first account ever used.)
- Returning from the background syncs only after 5 minutes away, with a 4 second delay. `sharedKey()` skips
  replace and upload when nothing changed. A watchdog (`runStarted`, `runNo`) frees a stuck run.
- When sync "works" but two devices differ, compare the "Google account:" line in Library → Sync first: two
  devices signed in to different Google accounts each sync happily to their own Drive.

## js/photos.js

- Bytes in IndexedDB (`chronomap-photos`), records in the Store. `tx()` reopens the database once if the
  connection was dropped; `available` says whether storage works. `prune()` is incremental. Deleting a picture
  removes its overlay.

## js/log.js

- `Log.add(kind, msg)`; keeps the newest 250 lines in `chronomap.log`; `chronomap.alive` classifies how the
  previous session ended. Shown in Library → Problems log; "Load the logs of my other devices" reads the Boox's
  log on the PC after a sync.
- Open question (AGENDA section 11): the Boox "crash" when switching apps is not confirmed. Its log is needed
  to tell a background stop from a crash on screen.

## js/app.js

- Size: `App.size()`, `chronomap.size`. Sidebar fold: `chronomap.side`. Session restore: `chronomap.session`
  (12 hours) through each tab's `getState` / `setState`.
- `gotoMarker` / `backHTML`: the trail when a tied name is tapped in a marker's information.
- Offline cache: skipped on localhost (see `tools/dev_server.py`); on the live site a new release reloads the
  page by itself unless something is being edited, and never on the very first install.

## js/isbn.js

- Open Library first, then Google Books (the keyless Google quota can run out: HTTP 429).
