# ChronoMap

A map that moves through time. Put people, places, events, documents, borders and routes on a map,
give each one dates and positions, tie them together, and scrub a time slider to watch them appear,
move and disappear. Built for learning from historical texts; works just as well as a case board.

## Running it

The app is published at **https://shanethompson018.github.io/chronomap/** from the `main` branch of
github.com/shanethompson018/chronomap (GitHub Pages). On the PC, open the Start menu and type
**Chrono Map**: the shortcut opens that address in its own Chrome window. On a tablet or phone, open the
address in Chrome and choose *Add to Home screen*.

Opening `index.html` straight from this folder still works for development, but that copy has its own
separate data store and cannot sign in to Google (the client ID is tied to the published address and to
`http://localhost:8765`, which `py -m http.server 8765` serves for testing).

The Start Menu shortcut lives at `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Chrono Map.lnk`.
To recreate it, run this in PowerShell from this folder:

```powershell
$p = (Get-Location).Path; $ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Chrono Map.lnk")
$s.TargetPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$s.Arguments = '--app=https://shanethompson018.github.io/chronomap/'
$s.WorkingDirectory = $p; $s.IconLocation = "$p\assets\chronomap.ico,0"; $s.Save()
```

Publishing a change: commit and `git push origin main`; GitHub Pages redeploys within a minute and
open copies of the app show a "Reload" notice.

* It needs an internet connection (the map tiles and the two libraries, Leaflet and D3, load from the
  web). Your data never leaves your computer. Base maps come from Esri and OpenTopoMap; OpenStreetMap's
  own tile server is not used because it blocks pages opened from a local file.
* Everything is saved automatically in the browser you use. Use **Data → Export JSON** to keep a backup,
  move to another computer, or share a dataset. **Import JSON** brings it back.
* It opens with a sample dataset (the American founding era). Replace it any time with
  **Data → Clear everything** or **Load sample data**.

## Same data on every device: Google Drive sync

Press **☁ Sync** at the top right (or Data → Google Drive sync → Sign in with Google). The app asks Google
for one narrow permission, "see and manage files this app creates", and keeps a **Chrono Map** folder
in your Drive with `chronomap-data.json` and a `photos` folder. From then on:

* changes sync a few seconds after you make them, when the app opens, when it comes back to the
  foreground, and whenever you press the button;
* each marker, tie, category, source and photo is merged separately: the newest version wins, so edits
  to different things on two devices both survive, and a deletion on one device is not undone by the other;
* a device that still shows the untouched sample data takes whatever is in Drive on its first sync;
* Google's sign-in lasts about an hour at a time. When it lapses the button says "Sign in"; one click
  (and sometimes a short Google popup that closes itself) renews it. Allow popups for the site if the
  browser blocks that window.

Signing out (Data tab) only stops syncing on that device; nothing is deleted. Removing the Chrono Map
folder from Drive removes the shared copy; each device keeps its own.

The Google side lives in a Google Cloud project owned by the same account; its client ID is in
`js/config.js` and is tied to the site address, so a copy of the app elsewhere needs its own.

## On a tablet or e-reader (Boox Note Air and similar)

* **E-ink mode**: the ◐ E-ink button at the top right switches to a white, high-contrast theme with no
  animations, larger buttons and the Light gray base map. It turns itself on when the app detects a Boox
  or other e-paper device, and the choice is remembered. On the Boox, set the screen refresh mode to
  "Speed" or "X" for map panning.
* **Installing as an app**: when Chrono Map is served from a web address (not opened as a file), Chrome
  offers *Add to Home screen* (Android) or an install icon in the address bar (PC). The installed app
  opens full screen, starts offline, and caches its own files; only map tiles need internet. When a new
  version is published, a "Reload" notice appears.
* On narrow screens the details panel in the Ties and Network tabs slides over the graph and has a ✕.

## The four tabs

### Map
* **Time slider** at the bottom. Drag it, press ▶ to play, step by day/week/month/year/decade, or type a
  date in the box (`1776-07-04`, `1776`, `44 BC`) and press Enter.
* **Show all times** ignores the slider and shows every marker at its latest location.
* **Ties** draws dashed lines between tied markers that are both on the map right now.
* Click a marker for its bubble (scrolls). The **Edit** button opens the editor; the other buttons
  jump to the Network or Ties view with that marker.
* **+ Point / + Area / + Route** on the left: click (or click several points) on the map to create a marker
  with a first "Located at" fact at the current slider date. Areas are for borders and regions; routes for
  journeys.
* The left list shows every marker; greyed ones are not on the map at this moment. Clicking one jumps
  the slider to when it first appears. Categories and the source dropdown filter what's on the map.

### Ties
"Everyone joined by one kind of tie." Pick a tie type (e.g. *Signed by*) and optionally a centre marker
(e.g. *Declaration of Independence*) to see just that group. Directed tie types are drawn as a
hierarchy (family tree, org chart); undirected ones are scattered randomly. Drag nodes around, scroll
to zoom, click a node to read about it.

### Network
Pick a centre marker and a number of degrees of separation. 1 shows its direct ties; 2 adds the ties of
those markers; and so on. Untick tie types or categories you don't want to see. **Saved views** remember
a whole set-up (centre, degrees, filters) under a name.

### Library
Sync, time gaps, sources, images, categories, fact types, tie types, the full marker table, and backup.

## The building blocks: a marker is a list of facts

**Marker** – anything: a person, a battle, a treaty, a company, a suspect, a kingdom. It has a name, a
**shape** (point, area or route), a category, a portrait, undated **fields**, images, citations, and a
list of **facts**.

**Fact** – one statement about the marker, with up to five parts:
* *what happened* – its **fact type** (Born, Died, Located at, Married, Took place, Signed, Founded,
  Border changed, Ruled by, Member of, Note…);
* *when* – a date, and for some types an end date (from / until);
* *where* – a point, an area outline, a route, or "at / inside another marker" (a town, a region, a
  battle), plus a place name;
* *who else* – participants, each in a **role** the fact type defines (Father, Mother, Spouse,
  Signatory, Ruler…);
* *the evidence* – a note (the wording you relied on), a source and page, and detail fields.

Everything else is derived from the facts, so nothing is entered twice:
* **Begins / Ends** – from facts whose type begins or ends the marker (Born / Died, Founded /
  Destroyed, Took place). The fact's label is what the bubble shows ("Created" instead of "Born" for
  Adam: just type it in the label box).
* **Locations over time** – from every fact with a "where". A fact placed "at another marker" follows
  that marker (a person "in Egypt" sits inside Egypt's border as it was at that date).
* **Ties** – from participants. A Born fact with Father: Adam makes the tie Adam —Parent of→ Seth,
  which the map, the Ties view and the Network view draw.

**Fact type** – editable on the Library tab: whether the fact has a date and an end date, what kind of
place it can carry, its roles (each role names a tie type and a direction), whether it begins or ends the
marker, and its detail fields. Add your own ("Reigned", "Baptised", "Exiled"). Each category lists the
fact types it offers first.

**Category** – open-ended. Each has a colour, an emoji icon, a default shape, a default source, a list
of undated field names, and its usual fact types.

**Fields and sub-fields** – undated details (occupation, tribe, nationality). A field can hold sub-fields
to any depth (*Born/Place*), each with its own value and source; in a category's field list write the
path with a slash: `Born/Date, Born/Place`.

**Tie type** – open-ended: *Parent of*, *Spouse of*, *Member of*, *Signed by*… A type is **directed**
(one-way, drawn as an arrow) or mutual. For directed types, "Top of hierarchy" says which end is drawn
above the other in the Ties view.

**Source** – a book, document, website or witness, kept in a list on the Library tab. Sources attach to
categories (default source), to markers (citations), to each fact, each field and each time gap.
For a book, type its **ISBN** (the 10- or 13-digit number on the back cover) and press *Look up*:
the title, author, year and publisher are filled in from Open Library, or from Google Books when
Open Library has no record. This needs an internet connection at that moment only; the result is
editable, and anything already typed in the Sources table is kept. Bible passages, websites and
manuscripts have no ISBN and are typed by hand as before.

**Images** – a library of pictures on the Library tab, each with its own sources. A marker can have one
**portrait** (also used on its map pin and graph node) and a gallery of further images.

## Approximate dates, gaps and places

* **A date that is only roughly known.** Tick *approximate* beside any fact date (or end date) and
  three boxes appear: the main box becomes the **most likely** date, with **earliest** and **latest**
  beside it. Any of them may be blank: leave the most likely blank and the midpoint is used; leave
  earliest or latest blank for a one-sided limit ("after 1000 BC"). The bubble shows
  "c. 1736 (1730 – 1744)".
* **A gap that is only roughly known.** In the time-gap dialog, tick *approximate gap* and give the
  smallest and largest the gap could be. A reckoned date then carries a range: the anchor's range
  combined with the gap's range, end to end, so ranges widen along a chain of rough steps and stay the
  same width through exact ones. Two values only conflict when their ranges cannot both be true.
* **On the map.** A marker whose Begins date is a range fades in: 50% at the earliest date, 75% at the
  most likely, solid from the latest. A location known only to a range fades in the same way and, if it
  has no "until", fades out again as the next location fades in, so during the overlap the marker is
  shown in **both places**, each at its own strength. A Disappears range fades out in reverse. When no
  most-likely date was given, a flat 60% is used across the range. An exact-dated location trims any
  overlapping range: at that moment only the exact one shows.
* **Somewhere in an area.** A fact's "where" can be *at / inside another marker*. The pin then sits at
  that marker's centre (following its border as it changes), gets a dashed ring, fans out beside other
  pins in the same area, and hovering it lights the area up in the pin's colour.
* **Rough borders.** An area outline can carry a second, lighter dashed outline: the **largest possible
  extent** ("Draw extent"). Each edge of either outline can be marked **firm** (solid: a coast, a
  river, a treaty line) or **rough** (dashed over a soft band). Press "Firm / rough edges…" and the
  corners are numbered on the map while you tick.

## Editing shapes: nothing moves by accident

Pins and outlines are never draggable on their own. Editing always starts from a button, happens in a
clearly marked mode, and reaches the marker only when you press **Done** and then **Save**; **Cancel**
(or Esc) throws the change away.

* **Move pin** (beside a point fact's coordinates): the pin becomes a draggable handle; drag it or click
  the map, then Done.
* **Edit border / Edit route / Edit extent** (beside an outline): every corner becomes a handle you can
  drag; a small **＋** on each edge adds a corner there; click a corner to select it and press
  *Delete corner* (or right-click it). **Simplify** drops corners that barely bend the outline at the
  current zoom (zoom out to merge more), **Undo** steps back. Firm and rough edges keep their marks
  through all of this: a split edge passes its mark to both halves, merged edges are rough if either was.
* **Change border here** (in an area's bubble): borders over time are one dated outline per period, and
  the slider shows the one in force. Move the slider to the date of the change, press the button, and
  the border in force is copied into a new fact dated at the slider; you then drag only the corners that
  moved. The earlier border stays exactly as it was.
* **Redraw** starts the outline again from nothing (click the corners); the old outline is replaced
  when you finish.

## Drafting borders from a picture

An old map, a scanned atlas page or a photograph of a wall map can be laid over the real map and traced.
Press **Picture overlay…** in the Map sidebar.

1. **Choose the picture** from the image library (or upload it on the spot). It appears see-through in
   the middle of the view.
2. **Line it up** with control points: press *Add control point*, click a spot you can recognise on
   the picture (a city, a cape, a river mouth), then click the same spot on the real map underneath.
   Two points fit the picture's scale, rotation and position; a third also corrects stretch and skew,
   and the panel reports the worst mismatch in pixels. The points are saved with the image, so the
   picture is ready next time (and on your other devices).
3. **Draft an outline.** *Fill region*: click inside a tinted territory on the picture and its outline
   is traced from the pixels (every pixel of a similar colour that touches the one you clicked).
   *Trace line*: click a drawn border line and the app follows it as far as its colour continues; a line
   that closes on itself becomes an area, otherwise a route. The *colour tolerance* slider decides how
   similar a colour must be: lower it if the fill floods the page, raise it if it stops short. The
   result always opens in the edit mode above, simplified, for you to correct corner by corner before
   it reaches the editor. Nothing is guessed: no coordinates are invented, only pixels you clicked on
   are followed.
   The same two buttons appear beside an existing fact's "where" in the editor while an overlay is on,
   so a picture can supply the border of a marker you already have.

## Time gaps (dates that depend on other dates)

Many texts give gaps instead of dates: "When Adam had lived 130 years, he fathered Seth." A **time
gap** records exactly that: *Seth · Born = Adam · Born + 130 y*, with the source and the wording.

* In the editor, press **⛓** beside any fact's date, or use the *Time gaps* section.
* A date is either an **anchor** (🔒, you typed it and it is fixed) or **reckoned** (⛓, worked out
  from an anchor through the time gaps; shown in italics with "reckoned from Adam · Born + 130 y").
  Change an anchor and every reckoned date in the chain moves with it. Time gaps work in both
  directions, so anchoring the other end instead makes the maths run the other way.
* When you create a time gap, whichever end already has a typed date becomes the anchor. To type a
  date into a reckoned slot, anchor it first.
* A chain with no anchor is **not yet anchored**: its markers exist and show in the Ties and Network
  views but not on the time slider.
* **Conflicts.** If two chains place one date differently, or an anchor disagrees with a time gap,
  a ⚠ badge appears in the top bar. The conflicts panel shows each disagreement with both values and the
  route that produced each. Choose *Use this* (the losing time gap is kept but marked *overruled*, so the
  disagreement stays on record) or *Mark undeterminable* (the date shows as "?" and the marker leaves
  the slider until you decide). Two year-precision dates in the same year are not a conflict.
* Time gaps sync between devices like everything else, and every device recomputes the same results.

## Grading: Reliability and Confidence

Two separate grades, judged independently, so that a weak source with one solid detail, or a strong
source read with doubt, can both be recorded honestly. Anything ungraded is simply blank.

* **Reliability** belongs to a **source** and says how far that text or person can be trusted in
  general: *Highly Reliable*, *Reliable*, *Questionable* or *Unreliable*. Set it in the Library's
  Sources table. It shows as a small tag beside every citation in the bubble and nowhere on the map.
* **Confidence** is **your own grade** on a single fact, field or time gap: *High*, *Reasonable*,
  *Low* or *No Confidence* ("recorded because a source says it, but I do not believe it"). It is never
  taken from the source or its wording. A **reason** box sits beside every grade for the why:
  an ambiguity, a cross-reference, circumstantial evidence. In the editor the grade sits under each
  fact's source row and in a field's 📖 row; the time-gap dialog and the Library's Time gaps table
  have their own.
* **On the map and in the graphs.** A graded fact shows a small corner **badge** on its pin
  (✓✓ dark green High, ✓ green Reasonable, ? amber Low, ✗ red No Confidence), at the centre of an area,
  and at the midpoint of a tie line; the Ties and Network graphs put the same badge on the edge. The
  badge is always drawn at full strength, so a faded pin with a ✓✓ badge reads as "a trusted date that
  is only roughly known". Hover a badge for the grade and the reason. In e-ink mode the badges are
  black and white.
* **In the bubble.** Every fact line, field and time gap carries its badge; the reason follows on the
  next line.

## Dates

Written as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. Add ` BC` for before Christ (`44 BC`, `500 BC`).
Precision is kept: a marker that "disappears" in `1776` stays until 31 December 1776.

## Tips

* To make a hierarchy for an event (the Declaration and its signers), give each signer a "Signed" fact
  naming the document, or give the document "Signed by" facts naming the signers. Open the Ties tab with
  the *Signed by* tie type and the document as centre.
* Conflicting sources? Record each claim as its own fact with its source and page. The Facts list in
  the bubble shows the whole itinerary with the source beside each step, and the source filter on the map
  shows one text's version at a time.
* Detective use: suspects and witnesses are point markers with "First seen" / "Last seen" fact types;
  sightings are "Located at" facts; calls, meetings and transactions are facts with roles; the crime scene
  is an event; the Network tab with 2–3 degrees shows who connects to whom.
* Export before big changes. There is no undo.

## Files

```
index.html        page layout
css/style.css     styling
js/dates.js       flexible date parsing (BC dates, year/month precision)
js/isbn.js        ISBN lookup (Open Library, then Google Books)
js/facts.js       fact types, derivation of spans/locations/ties, conversion of old data
js/store.js       data model, saving, import/export
js/sample.js      the sample dataset
js/map.js         Map tab (markers, time slider, pick/draw and edit modes)
js/overlay.js     picture overlay: georeferencing, fill and trace tools
js/editor.js      marker editor drawer
js/graph.js       graph drawing (used by Ties and Network)
js/ties.js        Ties tab
js/network.js     Network tab
js/data.js        Library tab
js/photos.js      photo library (images in IndexedDB), picker, lightbox
js/sync.js        Google Drive sync (sign-in, Drive folder, per-record merge, photos)
js/config.js      deployment settings (Google client ID)
js/app.js         tabs, e-ink mode, start-up, service worker registration
manifest.webmanifest  installable-app description (name, icons)
sw.js             service worker: offline cache of the app files
assets/           icons
```
