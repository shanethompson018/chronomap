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
  `applyWindows` writes or removes `calcMin / calcMax / calcEndMin / calcEndMax` on facts. **Neither calls
  `touch` (26.1), and nothing the solver writes may ever stamp a marker**: a device that is behind would stamp
  its old copy "now" and win the sync over a real correction. That is how removed facts came back in Nov 2026. `slotTyped(ref)` is
  what the user typed for a slot.
- `setSetting` skips an unchanged value; `setSettings(obj)` changes several in one commit.
- Sync pieces: `exportSyncDoc`, `replaceSyncDoc`; merge is per record, newest wins, with tombstones.
- Facts have tombstones too (26.2), coll `facts`, though `facts` is not a collection: a fact and a stop live
  inside their marker. `updateMarker` and `importJSON` call `recordFacts(gone, now)`; `updateMarker` also
  tombstones each time gap `cleanReferences` dropped. A record `{ coll: 'facts', id, at, back: true }` cancels an
  earlier removal (the fact is there again after an import). `S.deleted` may hold several records for one id;
  the newest counts. Anything that removes a fact outside `updateMarker` must call `recordFacts` itself.
- `importJSON` keeps the stamps that are in the file, so with sync on a newer copy in Drive wins again at the
  next sync (agenda 26.5, open).
- Places along a journey: `fact.stops` (absent when empty), each `{ id, kind: 'stop'|'pass', at: { kind:
  'marker', markerId } | { kind: 'point', lat, lng }, label }`; a stop also has the six date boxes of a fact and
  the four `calc…` ends, **under the same names**, so every function that works on a fact's dates works on a
  stop. A stop's dates are slots named by the stop's own id: `fact:<stopId>` (arrived) and `fact:<stopId>:end`
  (left). `slotFact(o, slot)` returns the fact or the stop; `slotStop` returns `{ f, s }` for a stop slot.
  `normStop` drops a row with no place and strips the dates of a place passed. `cleanReferences` keeps stop
  slots (`factIds` includes stop ids) and drops a row whose marker is gone; `applyWindows` writes the `calc…`
  ends of stops too. `slotLabel` says "… · stop at Haran (arrived)"; `slotShort` says "arriving at Haran",
  "the journey's From". `stopsOf(f)` = the rows with dates; `stopName(s)`.
- Grading: `source.reliability` (high | reliable | questionable | unreliable); `confidence` + `reason` on facts,
  field grades and relations (high | reasonable | low | none). `UI.gradeBadgeHTML` draws the badge.

## js/facts.js

- A fact: `{ typeId, date, dateEnd, dateMin, dateMax, dateEndMin, dateEndMax, where, participants: [{roleId,
  markerId}], details, note, sourceId, page, confidence }` plus the calculated `calc…` ends. On a journey a
  participant may also carry `joinAt` / `leaveAt` (a stop's id; absent = the start / the end): `normFact` keeps
  them and `cleanReferences` deletes one that no longer names a stop of that fact.
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
  (map layers are keyed `markerId|moveId` and split on it).
- Stops (19.1): when a journey has stops with an arrival to go by (`j.stops`; `when(stop)` gives the date or the
  middle of its window), each traveller's copy of the route move (id = the fact id) is **removed** and replaced
  by legs `<factId>~leg0…` (`journeyLeg`), with a move `<factId>~at~<stopId>` (`journeyStop`) between them; the
  route marker's own move stays whole so the line is drawn throughout. A leg runs from the last Left (first:
  From) to the next Arrived (last: Until). No route on the fact: no legs, and the stop moves carry no `dateEnd`,
  so each lasts until the next dated move. A stop with no Left has no `dateEnd` and no leg after it. "Left the
  party" drops every journey move from that day on and cuts the one in progress. A journey with no stops takes
  the old code path untouched. `derive` runs before the solver has written a new stop's window, so the stop is
  placed on the second pass (the commit `applyWindows` makes).
- Who makes which part (19.2): `j.span(T)` gives `{ jp, lp }`, the positions among **all** the fact's stops
  (`j.pos`, dated or not) of the stop T joins at (-1 = the start) and leaves at (Infinity = the end). The leg
  into stop p is T's when `jp < p <= lp`; the stay at p when `jp <= p <= lp`, with no `dateEnd` at `p === lp`;
  the last leg and `~end` only when `lp` is Infinity. The `~start` of a joiner is the join stop's place, judged
  against the day the party arrives there. "Left the party" counts only own places dated after T's own first
  day (`since`). `jp > lp`: the route copy is removed and nothing is placed. The owner pin has no entry in
  `j.part` and makes the whole journey. Mirrors carry `joinAt` / `leaveAt`; `UI.partText(stops, p)` words them.
- "Part of" (19.3): `fact.partOf = { markerId, factId }` on the short journey (absent when not set; `normFact`,
  `cleanReferences` and `deleteMarker` keep it honest). **Every** journey-type fact is now passed to
  `deriveJourneys` (a long journey may have no start, end or stops). There `j.up` is the longer journey (a loop
  A → B → A is dropped), and a traveller whom an ancestor also names (`a.everyone`) is taken out of
  `j.travellers` and loses their copy of the short journey's move, **before** the snapshot, so it is not read as
  "left the party". `deriveJourneys` returns `covered` (`<factId>|<markerId>`) for the mirrors (`mi.covered`,
  `mi.partOf`). `Facts.partLinks(fS, tS, fL, tL)` matches places by marker in order and returns which slots
  are the same moment (`same`) or only inside (`dir`); it stores nothing.
- Words for a date (23.3): `said1(w)` / `said2(w)` give one end as text (the date, or its window). `derive` puts
  them beside every date that may be only a window's middle: `m.startKnown` / `m.startWhen` / `m.endKnown` /
  `m.endWhen`; `dateKnown` / `when` / `whenEnd` on each move (journey legs, stops and arrivals included, through
  `span(a, b)` and `j.arr.said`); `startKnown` / `startWhen` / `endKnown` / `endWhen` on each tie. Anything that
  prints `m.start`, `mv.date` or `link.start` must check the flag first. `whenLabel` says a window once when
  From and Until share it.
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
  nodes where two limits meet head-on (and, when there are any, only on nodes neither of whose ends was reached
  by working backwards: `meet`).
- Limits the app keeps by itself (`seqRels`, ids `seq|<markerId>|<slot>|<next slot>`): a journey with stops is a
  chain From ≤ Arrived ≤ Left ≤ … ≤ Until. They are added inside `windows()` on every run, their dates count as
  `tied` (so windows are written for them), `windowOf().auto` says an end is set by one, `governText` and the
  conflicts panel word them ("the order of the journey") and offer no Overrule. `isAuto(id)` is the test.
  A journey that is part of another, or has a part, gets its From ≤ Until link here even with no stops.
- `partRels` (19.3) turns `Facts.partLinks` into limits: "the same moment" is two limits, one each way (ids
  `part|same|<m1>|<slot1>|<m2>|<slot2>`), "inside" is one (`part|in|…`); always slot2 is not before slot1.
  Dates that disagree therefore close a window and show as an ordinary window conflict. `isPart(id)`.
- `windowOf(ref)` → `{ E, L, eBy, lBy, conflict, minTies, maxTies }`; `governText(by)`; `limitText`.
- The tie dialog: `Relations.pick(thisRef, { part, onDone })`, rows of `{ part, where: 'on'|'after'|'before',
  y, m, d, markerId, slotKey, verse, approx, lo, hi }` with one shared source, a "Reads as" line per row and a
  result preview. `convert(relId, part)` turns a zero gap into a limit (Library → Time gaps).
- Automatic checks (22.1 to 22.3). `ownRels` now also covers every from/until fact with something typed at both
  ends (22.1). `lifeRels(given)` builds `life|<m1>|<slot1>|<m2>|<slot2>` and `kin|…` limits (slot2 not before
  slot1) on every run: a marker's span is its earliest dated `begins` fact and latest dated `ends` fact; own
  facts inside it (not `t.outside`, which defaults to true only for `ft_named`); participants overlap it (the
  "not after their Ends" half is skipped for `begins` facts); `kin` from `Store.links()` named "Parent of".
  The Until of a from/until fact is used only when it has something typed or a real tie; otherwise the From.
  These are **not** in `tied`, so no `calc…` window is written for a date no real tie touches, and
  `windowOf` blanks an end governed by one unless the slot is in `tiedKeys` (`quiet`). Settings `autoLife`,
  `autoKin` (`!== false` = on), ticked in Library → Time gaps, which then calls `Relations.solve()` and
  `Store.notify`.
- Second pass: `windows(rels, true)` makes `baseOf` take a known date at its most likely value. Nodes closed
  there and not in the first pass become `{ window: true, soft: true }` entries (`shutEntries(shut, soft)`);
  the panel heads them "The most likely dates are out of order".
- Editing a tie (21.1): `Relations.pick(null, { edit: relId })` opens the same dialog filled in. `rowOf(r)` is the
  reverse of `rowRelation`. The first row is the saved tie (`Store.updateRelation`, id and status kept); rows
  added are new ties. `thisRef` can be changed in the `.tie-this` box. `preview` leaves the edited tie out as it
  stands (`skipId`). In store.js `updateRelation` runs `anchorEnds` when the patch names `from` / `to`, and
  `applySolved` empties a reckoned date whose tie no longer touches it.
- Explaining a conflict (24). `winInfo` is the first pass's nodes and `softInfo` the second's; `infoOf(c)`
  picks one. `relEnds(id)` gives the two dates of any limit, reading the app's own from their ids.
  `traceEnd(W, ref, side)` follows `eBy` / `lBy` from date to date until an end that is the date's own;
  `reckonedFrom(ref)` then follows `derived.fromKey` towards the anchor. `conflictText(c, x)` is the one
  sentence, `conflictNote(ref)` the same for a date box or badge (`{ key, text }`), `markerConflicts(id)`
  the count for the lists. `linkCauses()` runs at the end of `solve()` and sets `c.cause = { key, ref }`
  when a far end of the conflict is reckoned through a date that is in another conflict.
  `showConflicts(focusKey)` draws root conflicts first, each followed by those that name it as cause.
- A group with no anchor (24.6): the fallback "any typed date anchors the group" leaves out every date
  that has a `derived` entry, and `Store.applySolved` clears any date that was derived and no longer is
  (unless pinned). So nothing reckoned survives as a typed date. `Relations.undetermined()` holds those
  dates; the editor captions them.
- The lifetime rule (design step C) is 22.2 above. The bar layout (step E) became the Gantt tab, `js/gantt.js`.

## js/editor.js

- Sections fold (`chronomap.editorSections`); facts show as summary lines until opened. Save keeps the editor
  open (a snapshot decides "unsaved"); the `calc…` fields are left out of that snapshot and kept on save.
- `dateField`: Earliest / the date / Latest, a ⛓ button beside each, "(tied)" placeholders, lines naming the
  governing tie and the window's width. Layout (23.1): the main row is `.row.date-main`, the two ends are
  `.approx-rows` > `.row.approx-row` (label `.approx-label`, box, ⛓); `.row > *` is `flex: 1`, so every button
  wrapper beside a box needs the `.narrow` rule for its row or it takes as much width as the box (that was
  the squeeze). The From / Until pair sits in `.ed-row.date-row`, which wraps below about 600px.
- `Dates.formatRange` words a ranged date as "between min and max" (23.5); `formatRangeFull` keeps the old
  "c. date (min – max)" for the conflicts panel only. Print `startWhen` / `when` / `whenEnd`, not the bare date.
- "Where and when" (23.4, 23.6, 23.7): `UI.whereItems(m, t, { plain })` gives the lines; `whereListHTML` wraps
  them for `markerInfoHTML`, and the editor's `renderWhere23` shows them (plain names, from the saved marker)
  as a section. A move from an `ends` fact (`mv.ends`) is worded "died here", not as a stay. Pins only. It walks
  `Store.sortedMoves(m)` and words each with `mv.when` / `mv.whenEnd`; a move with no `dateEnd` ends at the next
  dated move, else at `m.end`. `stayLength` is given only when both ends are known (`dateKnown`, `dateEndKnown`,
  `m.startKnown`, `m.endKnown`).
- The PC drawer ends above the map's time bar (23.2): `App.fitDrawer()` sets `--ed-bottom` to the bar's height
  while the Map tab shows (0 otherwise); called from `fitLayout`, `showTab`, the editor's `syncView` and a
  ResizeObserver on `.timebar` (which does not fire in the hidden test pane).
- On the tablet the editor is a full-screen view: `Editor.park()` hides it with the work kept while the map is
  needed, `unpark()` and the `#editor-pill` bring it back. Under `body.ed-side` (PC) `park()` does nothing.
- Draft autosave: `chronomap.draft`, `persistDraft`, `Editor.resume()`.
- `renderJourney(i)`: the "Starts at" / "Ends at" boxes and, between them, the places along the way, shown only
  when the fact's type has `journey`. Clearing a box deletes the key from the draft fact. A stop's two dates are
  ordinary `dateField`s bound to `facts.<i>.stops.<k>.date…` with slot `fact:<stopId>`; `approx.obj` tells
  `dateField` which object holds the boxes (a fact passes `approx.i`). Save, `syncDraftFromStore` and the
  date check all walk `f.stops` as well. `UI.journeyText(j, html)` (`j` = the fact or its mirror) words it
  ("from Ur, by way of Carchemish, stopping at Haran (dates), to Shechem") for the fact line, the mirror line
  and the information panel. A marker row has two ✕: the chooser's own (clears the box, ignored) and the row's.
- `syncDraftFromStore`: a slot that a time gap was reckoning when the draft last looked (`was`) takes the
  store's date and range even if it is no longer reckoned; before 22, Save wrote the old reckoned date back
  as a typed one. Still-reckoned slots now take the range as well as the date.
- `renderPartOf(i)`: the "Part of a longer journey" box (value `markerId|factId`), offered from saved facts
  only; a journey whose own chain of `partOf` leads back to this fact is left out. Under it, one line per
  `Facts.partLinks` result, and on the long journey the list of its parts.
- `renderRole`: on a journey fact with stops, a role with `goes` shows a `.journey-part` row under each name
  ("joins at" / "leaves at", options numbered as in the places list).

- `Editor.open(id, slot)`: with a slot (`fact:<id>` or `…:end`, a stop's id works too) the fact is opened
  and its date box gets the class `flagged` (`flagSlot`, cleared when another marker is opened). The
  conflict caption under a date box is `Relations.conflictNote(ref).text`; "Show" calls
  `Relations.showConflicts(note.key)`.

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

## js/ui.js: where and when

- `UI.whereRows(m)` is the list as data (one entry per place: its move, where the stay begins and ends,
  which rule ended it, its length); `UI.whereItems` words it and `js/gantt.js` draws it. Change the rule
  in `whereRows` only.

## js/timeline.js

- Chosen markers and layout in `chronomap.timeline` `{ ids, layout: 'list'|'lanes', mirrors, gaps }`. Rows are
  grouped by day; a date known only as a window gets its own row labelled with the window and is left out of
  the "… later" gap text.

## js/gantt.js

- Chosen markers, ticks and span in `chronomap.gantt` `{ ids, where, facts, mingle, mirrors, ties, gaps, t0, t1 }`
  (`t0` / `t1` are day numbers; null = the whole span, worked out from every date on the chart plus 4%).
- All HTML, no SVG. `.gt-axis` and every `.gt-row` are grids with the same two columns (`--gt-label`, then
  the track), so anything in the track is placed by `left` / `width` in per cent of the span. `.gt-over` is
  laid over the track column for the year lines and the relationship lines; those lines are placed in per
  cent across and in pixels down (each row's `offsetTop`), so they are drawn again when the rows' total
  height changes (a `ResizeObserver` on `.gt-rows`).
- `rowsOf(m)` builds the rows: `{ kind: 'm'|'g'|'w'|'f'|'x'|'t', key, label, sub | subHTML, s, e, span,
  slotS, slotE }` (heading, group title, place, own fact, fact from another marker, tie). `s` and `e` are
  `{ E, L }` day numbers: the earliest and latest a date can be, equal when it is certain, ±Infinity for a
  window with one end. Own facts take them from `Facts.when` (`lo` / `hi`); places, lifetimes and ties only
  carry min / max and the words, so `open()` reads "after …" / "before …" to know which end is open.
- `marks(r)`: hatched `.gt-box.maybe` from `s.E` to `e.L`, solid `.gt-box.sure` from `s.L` to `e.E` when
  that has length, `.gt-dot` for one certain date, `.gt-box.bad` when `e.L < s.E`. Never a middle date.
- `drawLinks` goes through every active relation. Own-fact rows and rows from other markers (`kind: 'x'`,
  which take their dates from the holding marker's fact through `Facts.when`) register `slotS` / `slotE`
  (`Store.refKey`s); a date can be on several rows, and the two nearest are joined. Both dates on the
  chart: the elbow line. One only: a stub (16px line, arrowhead, `.gt-lag.stub` label), grouped by row,
  side and direction. `part: 'max'` uses the two `L`s, everything else the two `E`s.
- `onWheel` (on `#gt-body`, not passive): Ctrl = scale about the pointer, Shift / sideways / over
  `.gt-axis` = shift; anything else is left to scroll the rows. It sets `view` and `pref.t0` / `t1` at
  once, draws after 16 ms (a timer, since `requestAnimationFrame` does not run in a hidden pane) and
  saves after 400 ms.
- The marker bar colour is the CSS variable `--c` set on the row; `body.eink` forces it to black.
- A new tab needs: the button and panel in `index.html`, the script there and in `sw.js` `SHELL`, and in
  `js/app.js` a branch in `showTab`, in `showMarker`, in `onGlobalClick` (its `data-action`) and its
  `init()`. The tab itself is restored by the session code with no change.

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
- `mergeDocs`: after the newest copy of each marker is chosen, facts and stops with a `facts` tombstone are
  taken out of it (unless the newest record for that id is marked `back`). The copy keeps its stamp.
- `sharedKey` sorts object keys but not lists: two devices holding the same records in a different order each
  write the Drive file at every sync. Harmless; an import can cause it.
- To test sync without Google: mock `window.fetch` for `googleapis.com` with one file held in a variable, put
  the fake token in place, reload (the token is only read at start; keep `driveSync` off across the reload so
  nothing goes to Google), then call `Sync.run` with `driveSync` on. Two devices are two saved copies of
  `chronomap.v1`, swapped with `Store.load()` and `Store.notify({ type: 'all' })`.

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
