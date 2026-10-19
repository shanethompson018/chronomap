# ChronoMap

A map that moves through time. Put people, places, events, documents, borders and routes on a map,
give each one dates and positions, tie them together, and scrub a time slider to watch them appear,
move and disappear. Built for learning from historical texts; works just as well as a case board.

## Running it

Open the Start menu and type **Chrono Map**. The shortcut opens the app in its own Chrome window.
(You can also just double-click `index.html`; no install, no build.)

The shortcut lives at `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Chrono Map.lnk` and points
Chrome at `index.html` in app mode, with the icon from `assets\chronomap.ico`. If you move this folder,
recreate it by running this in PowerShell from the new folder:

```powershell
$p = (Get-Location).Path; $ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Chrono Map.lnk")
$s.TargetPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$s.Arguments = '--app="file:///' + ($p -replace '\\','/' -replace ' ','%20') + '/index.html"'
$s.WorkingDirectory = $p; $s.IconLocation = "$p\assets\chronomap.ico,0"; $s.Save()
```

Your data is saved by the browser that opens the app, so always open it the same way (the shortcut, or
the same browser) to see the same data. Export a JSON backup from the Data tab to move it elsewhere.

* It needs an internet connection (the map tiles and the two libraries, Leaflet and D3, load from the
  web). Your data never leaves your computer. Base maps come from Esri and OpenTopoMap; OpenStreetMap's
  own tile server is not used because it blocks pages opened from a local file.
* Everything is saved automatically in the browser you use. Use **Data → Export JSON** to keep a backup,
  move to another computer, or share a dataset. **Import JSON** brings it back.
* It opens with a sample dataset (the American founding era). Replace it any time with
  **Data → Clear everything** or **Load sample data**.

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
* **Show all times** ignores the slider and shows every marker at its latest position.
* **Ties** draws dashed lines between tied markers that are both on the map right now.
* Click a marker for its info bubble (scrolls). The **Edit** button opens the editor; the other buttons
  jump to the Network or Ties view with that marker.
* **+ Pin / + Area / + Path** on the left: click (or click several points) on the map to create a marker
  at the current slider date. Areas are for borders and regions; paths for routes and journeys.
* The left list shows every marker; greyed ones are not on the map at this moment. Clicking one jumps
  the slider to when it first appears.
* Categories on the left filter what's on the map.

### Ties
"Everyone joined by one kind of tie." Pick a link type (e.g. *Signed by*) and optionally a hub marker
(e.g. *Declaration of Independence*) to see just that group. Directed link types are drawn as a
hierarchy (family tree, org chart); undirected ones are scattered randomly. Drag nodes around, scroll
to zoom, click a node to read about it.

### Network
Pick one marker and a number of degrees of separation. 1 shows its direct ties; 2 adds the ties of those
markers; and so on. Untick link types or categories you don't want to see. **Saved views** remember a
whole set-up (centre, degrees, filters) under a name.

### Data
Edit categories and link types in place, browse the full marker table, and back up or restore.

## The building blocks

**Marker** – anything: a person, a battle, a treaty, a company, a suspect, a phone. Has a kind
(pin, area or path), a category, free-form **fields**, notes, tags and sources.

**Time span** – *Appears* and *Disappears* dates with labels (Born / Died, Founded / Dissolved,
First seen / Arrested…). Leave blank for "always".

**Positions over time** – a list of "from this date, the marker is here". A pin moves when the slider
passes each date. For areas and paths each row is a whole new shape, so a border can change and a route
can grow. The first row can have no date (the starting position).

**Category** – open-ended. Each has a colour, an emoji icon, a default kind, and a list of field names
that get added automatically to new markers (Person: Born, Died, Occupation…). Add as many as you like
in the Data tab or straight from the editor.

**Fields and sub-fields** – a field can hold sub-fields to any depth: *Born* can have *Date* and *Place*,
each with its own value and its own source. In the editor press the ＋ beside a field to add a sub-field
under it. In a category's field list, write the path with a slash: `Born/Date, Born/Place`. The info
bubble shows sub-fields indented under their parent.

**Link type** – also open-ended: *Parent of*, *Spouse of*, *Member of*, *Signed by*, *Phoned*,
*Seen with*, *Owes money to*… A type is **directed** (one-way, drawn as an arrow) or mutual.
For directed types, "Top of hierarchy" says which end is drawn above the other in the Ties view:
for *Parent of* the From side (the parent) is on top; for *Member of* the To side (the organization) is on top.

**Tie (link)** – joins two markers with a type, optional dates (ties only draw on the map while active),
a label, a note (the evidence) and a source with page.

**Source** – a book, document, website or witness, kept in a list on the Data tab (title, author, year,
where to find it, notes on reliability). Sources attach in four places:

* a **category** has a *default source* that covers every marker in it (e.g. everything in the
  "Herodotus people" category comes from Herodotus);
* a **marker** can carry any number of *citations*, each with a page or location and a note;
* each **field or sub-field** on a marker (Born/Date, Born/Place, Occupation, your own fields…) can cite
  its own source and page: press the 📖 button beside it in the editor;
* each **position over time** can cite a source and page, so two texts that put someone in different
  places on the same date can both be recorded;
* each **tie** can cite a source and page.

The info bubble lists all of them. The **source dropdown** at the top of the map's left panel shows only
the markers that draw on one source, which is the quickest way to compare what different texts claim.

**Photos** – a library of pictures (portraits, maps, documents, scene photographs) on the Data tab. Each
photo has a title, caption, credit, date, notes and its own list of sources. A marker can have one
*profile picture*, which also replaces its dot on the map and in the graphs, plus a gallery of further
photos shown in the info bubble; click any picture for a large view with its caption and sources.
Images are shrunk to 1600 px on the long side and stored in the browser's own database, so they do not
count against the small limit of the main data store. Tick "include photos" when exporting to carry
them in the backup file.

## Dates

Written as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. Add ` BC` for before Christ (`44 BC`, `500 BC`).
Precision is kept: a marker that "disappears" in `1776` stays until 31 December 1776.

## Tips

* To make a hierarchy for an event (the Declaration and its signers), create the event as a marker and
  give it a directed link type pointing from the event to each person. Open the Ties tab with that type
  and the event as hub.
* Conflicting sources? Record each claim as its own position or citation with its source and page. The
  Movements list in the info bubble shows the whole itinerary with the source beside each step, and the
  source filter on the map shows one text's version at a time.
* Detective use: suspects and witnesses are pins with "First seen" / "Last seen"; sightings are
  positions over time; calls, meetings and transactions are dated ties; the crime scene is an event;
  the Network tab with 2–3 degrees shows who connects to whom.
* Export before big changes. There is no undo.

## Files

```
index.html        page layout
css/style.css     styling
js/dates.js       flexible date parsing (BC dates, year/month precision)
js/store.js       data model, saving, import/export
js/sample.js      the sample dataset
js/map.js         Map tab
js/editor.js      marker editor drawer
js/graph.js       graph drawing (used by Ties and Network)
js/ties.js        Ties tab
js/network.js     Network tab
js/data.js        Data tab
js/photos.js      photo library (images in IndexedDB), picker, lightbox
js/app.js         tabs, e-ink mode, start-up, service worker registration
manifest.webmanifest  installable-app description (name, icons)
sw.js             service worker: offline cache of the app files
assets/           icons
```
