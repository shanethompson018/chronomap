# Chrono Map – Agenda

Things to work on next. This is a working list, separate from the app itself; add to it freely and
cross items off as they land. We go through it one item at a time.

## Still open (kept current; everything else below is built or decided)

- **Section 11:** the Boox "crash" when switching apps. Five fixes are built; the cause is not confirmed.
  Waiting for the Boox's problems log (Library, Problems log).
- **12.4 / design step C:** the lifetime rule. Built 25 Nov 2026 as 22.2 (see section 22), as a check
  and a limit; it gives no window to a fact that has no date and no tie.
- **Section 17:** an automatic journey ("Starts at" / "Ends at"). 17.1 built 25 Nov 2026; not checked on
  the Boox. 17.2 (pins moving along the line) and 17.3 (a straight line when no route is drawn) are for
  later. With no place on the fact, travellers stay at the start until the arrival date.
- **Section 18:** markers stacked on one spot share one numbered pin; clicking it lists them. Built
  25 Nov 2026; not checked on the Boox.
- **Section 19:** routes with stops on the way, and a short route that is part of a longer one. He said
  to build it ("19: stops first", 25 Nov 2026). All three steps built 25 Nov 2026: 19.1 (places along a
  journey), 19.2 (who makes which part: "joins at" / "leaves at") and 19.3 ("Part of" a longer journey).
  Not checked on the Boox. A place passed is recorded in the wording only until 17.3 draws a line
  through the places.
- **Section 20:** markers inside a marker (an army, a country, a company), with exclusions. His answers
  are recorded (25 Nov 2026); steps 20.1 and 20.2 proposed; waiting for his go-ahead to build.
- **Section 21:** editing a time gap after it is saved. Built 25 Nov 2026 (an Edit button on every time
  gap); not checked on the Boox.
- **Section 22:** less typing and automatic checks. 22.1 to 22.3 (Until before From, the lifetime rule,
  a child not before its parent) built 25 Nov 2026; not checked on the Boox. 22.4 ("during" in the tie
  dialog), 22.5 (a chain that loses its anchor goes blank) and 22.6 (reading by verse) are proposed, not
  decided.
- **Section 23:** the editor's date boxes, the editor and the time bar, and no made-up middle date. 23.1
  to 23.7 built 25 Nov 2026 (23.4 is the "Where and when" list; 23.5 to 23.7 are his corrections to it
  and to the wording of ranged dates); not checked on the Boox.
- **Section 16:** the wrong-account fix is live but only the user can confirm it with his real accounts
  (PC: Library, Sync, Switch account, pick the account the Boox shows).
- **14.4 / design step E:** the bar layout in the Timeline tab. Superseded 27 Nov 2026 by the Gantt tab
  (section 25).
- **Section 24:** conflicts that explain themselves. Proposed 27 Nov 2026 from his three conflicts;
  waiting for his go-ahead to build. 24.6 is the old 22.5, now recommended.
- **Section 25:** the Gantt tab. Built 27 Nov 2026; not checked on the Boox, and not seen with his own
  data. Three choices were made without asking (see the section); his to change.
- **A stay of a whole number of years can read one year short** (found 27 Nov 2026, not fixed): "Where
  and when" said "about 29 years" for 1 Jan 1700 to 1 Jan 1730. `stayLength` in `js/ui.js` divides days
  by 365.2425 and rounds down. The Gantt tab shows the same words.
- **Deleted facts came back (found 27 Nov 2026, not looked into):** the eight "Lived at" facts he removed
  on 25 Nov are in his export of 27 Nov again with the same ids, and Lot's cleared Born date is typed
  again. Sync is suspected (the other device's older copy of those markers winning); not proven.
- **Section 3, areas:** labels inside areas, areas following a person, importing real border data.
- Offered and not taken up: an emoji chooser for category icons; general clustering of nearby map pins.
- Declined 23 Nov 2026, do not offer again: a "+ Role" button on a fact in the marker editor. Roles are
  added in Library, Fact types (✏️ on the fact type, then + Add role).
- Markers placed on a route sit stacked at its middle; they do not move along the line (17.2, later).
  The stacking itself is section 18.
- None of the work since section 8 has been checked on the Boox itself.

## 1. Approximation

Going through these in order:

- [x] **1a. Approximate times.** Built 19 Oct 2026. Dates and relation gaps that are not exact: "about 40 years",
      "between 30 and 50 years", "at least 40 years", "before Noah died". How to write them, how they
      carry through date relations, how the conflict check treats overlapping ranges, how they show on
      the slider and in the bubble.
      Decisions so far (build later):
      - An "approximation" tick box beside a date opens three boxes: earliest, most likely, latest.
        Any of them may be left empty (a one-sided limit leaves earliest or latest empty).
      - Most likely is optional; when empty the app uses the midpoint of earliest and latest. The most
        likely value places the marker on the slider; earliest and latest feed the conflict check.
      - The same tick box on a relation's gap (earliest / most likely / latest gap). A computed date's
        range is the anchor's range combined with the gap's range, end to end, so ranges widen along a
        chain of rough steps and stay the same width through exact steps. "Before" relations flip which
        ends combine. The conflict check compares ranges: a value inside the other's range agrees.
      - A marker shows on the map through its whole range (earliest to latest). When two of its
        ranges overlap it appears in both places at once.
      - An exact-dated location fact trims any overlapping location range on the map at that moment
        (the range is not edited, just not drawn then); the bubble still lists both. For anything other
        than location the app shows both facts side by side and leaves the judgement to the grade.
      - How "possibly here" looks compared with "known here" (fade, hollow pin, symbol) is NOT decided
        here: tabled to item 2, Grading of information, because the look must also carry the grade.
- [x] **1b. Approximate areas and locations.** Built 19 Oct 2026 (inside-area pins with ring and hover; core/extent outlines with firm/rough edges). Country boundaries that are only roughly known; where a
      person was at a time when the text gives a region rather than a place ("in the land of Nod").
      Decisions so far (build later):
      - A position can be "inside an area" (pointing at an existing area marker) instead of a point.
      - The person stays a pin, placed at the area's representative point (its centre, or a label spot
        the area can define). Several people in one area fan out in a small ring rather than stacking.
      - Hovering or clicking the pin highlights the area in the person's colour with a translucent
        hatched fill. The area marker itself keeps its solid outline and faint flat fill, so a border
        never looks like someone's whereabouts. No permanent overlay.
      - The pin follows the area's shape as it changes over time; the bubble says "Somewhere in X".
      - Pin styling for "somewhere in" (e.g. a dashed ring) is a precision signal: candidate noted,
        final look decided in item 2 together with the grade and time-precision looks.
      - Rough boundaries: a combination of "certain core + largest possible extent" (two outlines,
        like earliest and latest for a date) and "edge by edge" (each side of an outline marked firm
        or rough: solid where a coast, river or treaty line fixes it, dashed with a soft band where it
        is a guess). Mockup: docs/mockups/border-approximation-options.svg. Both are optional per
        area; a plain single outline stays the default. Watch that it does not muddy the map; adjust
        later if it does.
      - If any of this does not work well in practice, adjust later.
- [x] **1c. Approximate ties.** Tie dates are fact dates, so 1a covers them; confidence follows in item 2. Ties that are likely but not certain, or whose dates are rough.
      Decisions so far (build later):
      - Tie dates get the 1a tick box (earliest / most likely / latest), nothing new needed.
      - The tie itself carries its own confidence ("probably her brother"), separate from the grade
        of the source that reports it: a strong source can report a doubtful fact and a weak source a
        confident one. Two dials, both recorded, both shown.
      - The two must be told apart visually on the map (tie lines), in the Ties and Network graphs
        (edges) and in the bubble. Candidate: line style for confidence (solid / dashed / dotted),
        line weight or colour depth for source grade. Final looks decided in item 2.
      - The same two dials apply to dates, positions and fields, not only ties.
      - A tie's confidence is the user's own judgement and is NEVER derived from the source's grade
        or from how flatly the source states it. A weak source can carry a confident tie when outside
        circumstantial evidence supports it; a strong source can carry a doubtful one. The app never
        sets or changes a confidence grade by itself.
      - A free-text "reason" box sits beside the confidence grade to record why it was graded that way
        (ambiguity in the wording, cross-references, circumstantial evidence). Shown in the bubble.
      - The source's reliability stays separate and informational; it never overrides the fact grade.
- [x] Date relations (fixed gaps, pinned vs computed, conflicts, undeterminable) – built 19 Oct 2026.

## 2. Grading of information: Reliability and Confidence

- [x] A grade on every piece of input (dates, positions, areas, ties, fields, sources) saying how far it
      can be trusted. Two dials, judged independently (modelled on the Admiralty Code's source/information split).
      **Built 19 Oct 2026**: Reliability on sources (Library table, tag beside citations in the bubble);
      Confidence + reason on facts (editor card), fields (📖 row, `fieldGrades`) and time gaps (dialog and
      Library table); badges on pins, area centres, tie-line midpoints, graph edges and every bubble line;
      black-and-white badges in e-ink mode. Confidence is stored on the fact and copied onto the derived
      location and tie, never computed from the source.
      Decisions:
      - **Reliability** is the grade of a *source* (set once on the source, inherited by everything
        that cites it). Levels: Highly Reliable, Reliable, Questionable, Unreliable.
      - **Confidence** is the user's own grade on a *fact* (a tie, date, position, area, field).
        Levels: High Confidence, Reasonable Confidence, Low Confidence, No Confidence.
        "No Confidence" means "recorded because a source says it, but I do not believe it".
      - Ungraded is simply blank: no grade entered, no special level for "cannot be judged".
      - Confidence is never derived from reliability or from the source's wording (see 1c); a reason
        box sits beside every confidence grade.
      Looks (decided; mockups in docs/mockups/confidence-precision-looks.svg and time-fade-levels-75-50.svg):
      - On the map at a glance: Confidence and precision. Reliability only in the bubble, beside the citation.
      - Confidence = a small corner badge on the pin: none when ungraded, ✓✓ dark green High,
        ✓ green Reasonable, ? amber Low, ✗ red No Confidence. Always drawn at full strength.
        The same badge sits at the midpoint of tie lines on the map and of edges in the Ties and
        Network graphs.
      - Time precision = fading of the pin (and of a tie line) while the slider is inside a date range:
        50% at the earliest and latest dates, 75% at the most-likely date, blended in between.
        When no most-likely date was entered, a flat 60% across the whole range.
        A position range peaks in the middle (50 → 75 → 50, then gone). An Appears range climbs
        (50 → 75 → 100 and stays solid); a Disappears range runs the reverse. Exact dates are 100%.
        Graph edges have no time axis, so only the badge applies there.
      - Place precision = a dashed ring in the pin's colour around the white rim when the position is
        "somewhere in" an area; hover/click still highlights the area (1b).
      - Each signal uses a different part of the pin, so every combination stays readable, and colour
        and icon remain free for the category and the profile picture.
      - The "credible source but only an approximation" conundrum resolves itself: a full-strength
        badge on a faded pin, with the source's Reliability in the bubble.
      Carried in from 1a:
      - Each grade should look different on the map and in the bubble (transparency, symbol, outline…).
      - The same look must also show "possibly here" (inside a range) versus "known here" (exact date).
        The two ideas overlap but may need to stay distinct; not yet worked out.
      - The conundrum to mull over: a highly credible source that gives only an approximation. The
        grade is high but the precision is low; how should that show?

## 3. Markers

- [x] **Areas.** What areas and borders should be able to do beyond the current draw-a-shape: changing
      shape over time more easily, labels inside the area, relations between an area and the people and
      events inside it, areas following a person (a kingdom's extent at a ruler's death), importing real
      border data. Overlaps with 1b (rough borders: core/extent outlines, firm/rough edges, decided there).
      **Built 19 Oct 2026**: explicit edit modes (Move pin, Edit border / route / extent with draggable
      corners, ＋ handles to add, select + Delete corner, Simplify, Undo, Done / Cancel; rough-edge marks
      survive edits), "Change border here" in an area's bubble (copies the border in force into a new fact
      dated at the slider), and the picture overlay (js/overlay.js: image from the library, 2–3 control
      points saved on the image as `georef`, see-through canvas layer, fill and trace tools on the
      picture's pixels, results opened in the edit mode). Not built, still open: labels inside areas, areas
      following a person, importing real border data.
      Decisions:
      - Borders over time already keep one dated shape per period and the slider shows the one in
        force; the earlier shape stays untouched when a later one is added. Keep this.
      - New editing flow: at the slider's date press "Change border here"; the app copies the shape in
        force into a new dated shape and you drag only the corners that moved. Corner dragging,
        adding and deleting corners, and a simplify button are part of this.
      - Draft a border from a picture: (1) upload the source's map into the photo library and
        georeference it by matching two or three known points to the real map, shown as a
        see-through overlay; (2) a fill tool (click inside a tinted territory → outline of that
        region) and a trace tool (click a drawn border line → follow it), both run in the browser on
        the picture's pixels; the draft is simplified and then corrected by dragging corners. No AI
        guessing of coordinates.
      - Rule: nothing on the map moves by accident. Pins and shapes are never draggable by default
        (true today). Editing is always: select the marker, press "Edit border" / "Change border
        here" / "Move pin", make the change, then Done or Cancel; nothing is saved until Done.

## 4. Fields and ties

- [x] **Combining fields and ties → "a marker is a list of facts".** Built 19 Oct 2026 (js/facts.js, editor
      rewritten, Library tab with fact types, existing data converted automatically). Decided:
      - Every statement about a marker is one *fact* with up to five parts: what happened (its
        type), when (exact date or 1a range), where (a point, an area, a place marker, a shape, or
        unknown), who else was involved (other markers, each with a role), and the evidence (source,
        page, Confidence grade, reason box).
      - Appears/Disappears, positions, fields and ties stop being entered separately: the app derives
        them from facts. Example: one "Born" fact (date, place, Father, Mother, source) gives the
        Appears date and label, the first position, the bubble lines Born / Father / Mother, and the
        two Parent-of ties. Add the birthplace later and the pin appears.
      - Fact types are user-definable like categories and link types. Each type declares its parts
        (date, place, roles) and what it implies: starts the marker, ends it, sets a position, makes a
        tie of type X to the marker in role Y. Starter set: Born, Died, Lived at / Moved to, Married,
        Fought at, Took place, Signed, Written, Adopted, Founded, Border changed (a shape as the
        "where"), Ruled by, Destroyed, plus a free "Note" fact.
      - Categories list their default fact types; any fact type can be added to any marker; any fact
        can carry extra text lines; labels stay editable per marker ("Created" instead of "Born").
      - Covers events (battle: Took place, Commanded by) and areas (kingdom: Founded, Border changed,
        Ruled by) with the same model. Item 5 (places attached to facts) is inside this.
      - Existing data converts automatically: Appears → Born fact, each position → Lived-at fact,
        each tie → a fact of the matching type, fields → text lines on the relevant fact.
      - Expect adjustments once in use; a rehaul is acceptable if needed.

## 6. Review the wording of everything

- [x] Go over every name the app uses and decide whether each is the clearest word for a reader coming
      from historical texts. Decided and applied 19 Oct 2026 with the facts build:
      - Date relation → **Time gap** (plain; may revisit after feedback from others).
      - Pinned date → **Anchor** (🔒). Computed date → **Reckoned** (⛓), e.g. "reckoned from Adam's birth, time gap 130 y".
      - Chain without an anchor → **Not yet anchored**; the user's own decision → **Undeterminable**.
      - Kind: Pin / Area / Path → **Shape: Point / Area / Route**.
      - Link / Link type → **Tie / Tie type** everywhere.
      - Position / Positions over time → **Location / Locations over time**.
      - Appears / Disappears → **Begins / Ends** (only shown when no fact supplies a better label).
      - New words: **Fact**, **Fact type**, **Role**.
      - Photos / Photo library / Profile picture → **Images / Image library / Portrait**.
      - Data tab → **Library**. Hub marker / focus marker → **Centre** in both graph views.
      - Pick on map → **Place on map**; Draw on map stays.
      - Keep: Marker, Category, Field (and sub-field), Overruled, Conflict, Source, Citation,
        Reliability, Confidence, Map / Ties / Network, Summary, Notes, Tags, Show all times, Labels.

## 5. Points, areas and routes attached to fields and ties

- [x] Folded into item 4: the "where" of a fact (point, area, place marker, shape or route) lives on
      the fact itself, so a place is never entered twice and the map shows where each fact happened.

## 7. Second round (20 Oct 2026)

Raised after the first days of real data entry. Discussed before building; decisions recorded here as
they are made.

- [x] **7.1 Cleaning up the bubble. Built 20 Oct 2026.**
      - [x] 7.1a Built 20 Oct. **Agreed 20 Oct, build later.** Every section heading in the bubble (Facts, Fields, Ties,
            Mentioned in, Images, Notes) is a toggle with its count ("Facts (12) ▾" / "▸"); the whole
            heading row is the touch target; open/closed is remembered per section on each device;
            a section with more than eight lines starts closed the first time. Same headings in the
            Ties, Network and Family side panels.
      - [x] 7.1b Built 20 Oct. **Agreed 20 Oct, build later.** "Descriptors" = the hint paragraphs under the EDITOR's
            section headings (Facts, Fields, Images, Sources, Time gaps). They leave the page; hovering
            the heading word shows the hint in a small box; a ⓘ after the heading shows it on tap for
            the Boox (tap again hides). Editor only: Library and side-panel hints stay as they are.
            One-line labels inside the sections stay. ("Bubble" in this round means the editor drawer.)
      - [x] 7.1c Built 20 Oct. **Agreed 20 Oct, build later.** Editor presentation:
            - Each fact shows as one summary line ("1 Jan 1901 BC · Born · Father: Abraham") with a ▸
              that opens the full card; any number of cards may be open at once; a new fact opens.
            - A thin separator between dated and undated facts; mirrored lines under their own heading.
            - Section headings larger with a rule under them; Basics in two columns on the PC.
            - Save also at the top of the drawer; Delete in a clearer red.
            - Portrait larger at the top beside the name, like the map bubble.
- [x] **7.2 Save keeps the editor open. Built 20 Oct 2026. Agreed 20 Oct, build later.** Save writes the marker, shows the
      toast and keeps the drawer open on the same marker with the saved state (mirrored lines and
      derived dates refreshed in place). Cancel becomes Close (asks first when there are unsaved
      changes). Delete still closes. A new marker stays open after its first save as an existing
      marker. An open map pop-up for that marker is refreshed, not closed.
- [x] **7.3 Library sub-tabs. Built 20 Oct 2026. Agreed 20 Oct, build later.** A strip of pills under the main tabs: Sync ·
      Time gaps · Sources · Images · Categories · Fact types · Tie types · Markers · Backup. Plain
      labels, no counts. One section shows at a time; the last sub-tab opened is remembered per
      device; the ⚠ conflicts badge and other links into the Library open the right sub-tab; the
      strip wraps to two lines on a narrow screen; the Images storage total moves into its sub-tab.
- [x] **7.4 Tie types Built 20 Oct 2026.: what "directed" means. Explained 20 Oct; small build folded into 7.3.** Ticked = the
      two ends are different kinds of thing (parent/child, killer/killed, document/signatory): drawn
      as an arrow, → / ← in the bubble, From/To labels, stacked by "Top of hierarchy" in the Ties tab.
      Unticked = mutual (Spouse of, Sibling of, Allied with): no arrow, scattered layout. Test: swap
      the two markers and ask whether the sentence still means the same. To build: a hover hint on
      the tick box in the Tie types table and a short README paragraph under Tie type.
- [x] **7.5 Family tree: unlimited generations. Built 20 Oct 2026. Agreed 20 Oct, build later.** Up and Down become typed
      number boxes (0 upwards) with − / + buttons for the Boox, each with an "All" tick that greys the
      box; default is All in both directions; settings remembered per device; the people count stays
      in the side panel. Size guard shared with 7.6: above 300 people the tab shows "This tree has N
      people. Draw it?" with a Draw button instead of drawing at once (limit adjustable later).
- [x] **7.6 Ties tab opens with nothing selected. Built 20 Oct 2026. Agreed 20 Oct, build later.** No tie type chosen on
      entry ("Pick a tie type, or a centre marker…"); "All tie types" stays in the list but is never
      the start; the choice survives tab switches within a session, not a restart; the 🔗 Ties bubble
      button still opens that marker's group with all types. Size guard (300 markers) with a Draw
      button in Ties, Network and Family. Build order for section 7: 1, 2, 3 (+4), 5, 6.

- [x] **7.7 Family tree: spouses on either side (raised 21 Oct 2026). Built 21 Oct 2026.** With several partners the marriage bars
      stack under one box and the lines cross. Proposal: first partner on the person's left, second on the
      right, each couple's children hanging from the line between them; a third partner goes beyond the
      second, joined by a dotted line (the same person's next marriage), the fourth beyond the third, and
      so on; their children hang from a short bar under that partner. Partner order: marriage date, else
      first child's birth, else the order typed. Line styles: solid = Married fact, dashed = only share a
      child, dotted = chain to a further partner. Applies to every person in the tree, not only the root.
      Decided 21 Oct: alternate sides (third on the left beyond the first, fourth on the right beyond the second).

- [x] **7.8 Ties and Network: several ties between the same two markers overlap (raised 21 Oct 2026). Built 21 Oct 2026.** Proposal:
      ties between the same pair fan out as gentle curves (one up, one down, the next wider), each with
      its own colour, arrowhead, label and badge on the bend; a single tie stays straight. Shared
      drawing code, so both tabs get it. Decided 21 Oct: fan up to 5 ties; above 5 the pair is drawn as
      one thick bundled line with the count on it ("8 ties"); clicking the bundle opens it into the fan
      (click again to close). Expected volume unknown: the user will add many sources after the Bible.

- [x] **7.9 Telling apart people with the same name (raised 31 Oct 2026). Built 31 Oct 2026.** Proposal: when names collide, a
      display-only tag after the name — "Enoch (son of Cain)" from the Born fact's father (else mother,
      else birth year, else category) — with an optional "Tell apart as" box in Basics to override it.
      Shown in pickers, the Map tab's marker list, the Library's Markers table, participant lines in the
      editor and bubble, bubble links, and the Family tree box's second line when it has no dates; in
      the Ties and Network hover text. Nothing is renamed. Decided 31 Oct: duplicates only for now.
- [x] **7.10 Other names: nicknames, name changes, spellings, titles (raised 31 Oct 2026). Built 31 Oct 2026.** Proposal: a
      seeded fact type "Also named" (details Name and Kind: nickname / later name / earlier name / other
      spelling / title) with the usual date, source, page, note and grade; bubble header lists them
      ("Abraham, earlier Abram"); pickers search every name and show "Abraham (also Abram)"; the 7.9
      tag applies to other names too; the main name is untouched. Decided 31 Oct: names follow the
      slider. The name in force at the slider's date is shown first and the others after it: before
      2067 BC "Abram, later Abraham"; after it "Abraham, earlier Abram". Map labels and pins use the
      name in force; the Family tree, which has no slider, uses the latest name.

## 8. Boox tablet usability (raised 9 Nov 2026, built 9 Nov 2026)

Raised by the user: input on the Boox is difficult because letters and boxes are small; some tabs do
not fit the page or zoom in and out. Measured on 9 Nov with E-ink mode on, at a tablet-sized screen
(1240 x 930 across, 930 x 1240 upright):

* E-ink mode sets a 16 px base, but 55 to 90 % of the text on most screens is fixed at 9 to 13 px and
  ignores it (Library tables 75 to 90 %, editor 55 %, Family 71 %, Map 40 %).
* Most boxes and buttons in the Library and editor are under 40 px tall (Markers 89 of 107, Tie types
  85 of 102, editor 25 of 58). A finger needs about 44 to 48.
* Upright, the Ties and Network pages are 1308 px wide on a 930 px screen: the hidden details panel
  sticks out to the right, so the whole page can be dragged sideways. Across, nothing sticks out.
* Upright, the editor drawer is a fixed 460 px and the sidebar 240 px, leaving 230 px of map.
* Library tables squeeze every column into the screen (Categories: nine columns, several under 70 px).

Answers from the user, 9 Nov 2026: holds the Boox upright (narrow sides top and bottom); taps with a
finger and types on the on-screen keyboard; uses the installed app; nothing may zoom in and out except
the map; the Family tree does not fit and looks small; every screen is hard for input; a new marker or
an edited marker should be its own view, not a panel at the side of another tab; a tied marker's name in
the information panel should lead to that marker's information panel.

What exists today for that last point: tied names are already links in every information panel, but in
E-ink mode they are plain black text with no underline and a small tap area, and on the Map tab a tied
marker with no place opens the editor instead of showing its information.

Revised proposals in build order, each its own commit. The user said "Build it" on 9 Nov 2026; assumptions kept: the full-screen editor applies on the PC too, and the drawings use drag plus buttons instead of pinch.

- [x] **8.1 The page stays put. Built 9 Nov 2026.** The app itself never zooms or slides: pinch and double-tap zoom are
      off everywhere except the map; the Ties and Network overflow is fixed so every tab is exactly
      the width of the screen.
- [x] **8.2 One size setting for the whole app. Built 9 Nov 2026.** A Size control beside the E-ink button (Normal, Large,
      Larger, Largest), remembered per device, scaling every letter, box and button together,
      including the text that is fixed today; anything tappable is at least finger-sized in E-ink mode.
- [x] **8.3 The marker editor is its own view. Built 9 Nov 2026.** New marker and Edit open a full-screen page with its
      own Save and Close, fields in one column on an upright tablet, and the box being typed in kept
      above the keyboard. Place on map / Move pin / Draw switch to the map and come straight back.
      Proposed for both the Boox and the PC, so there is one behaviour to learn.
- [x] **8.4 Drawings open at reading size. Built 9 Nov 2026.** Family, Ties and Network open with boxes at a readable size
      centred on the chosen person, instead of shrinking everything to fit. Drag with a finger to move
      around; +, − and Fit buttons replace pinching.
- [x] **8.5 Tied names lead to that marker. Built 9 Nov 2026.** Tied names are underlined and finger-sized; tapping one
      shows that marker's information panel in every tab, including markers with no place on the Map
      tab, with a Back button to the marker you came from.
- [x] **8.6 Library on an upright tablet. Built 9 Nov 2026.** Rows become cards with labelled full-width boxes instead of a
      nine-column table.
- [x] **8.7 More room. Built 9 Nov 2026.** On an upright tablet the left sidebar folds away behind a button.

Built notes: the Size control is A− / A+ (90% to 200%) rather than four named sizes; the fold button (☰)
and the full-screen editor apply on every device; Library → Backup reports the screen's size and pixel
ratio. Not yet checked on the Boox itself: only at a tablet-sized window on the PC.

- [x] **8.8 On the PC the editor is a side drawer again (raised 13 Nov 2026). Built 13 Nov 2026.** The user
      asked for new markers to "pop up on the side like it originally did" on the PC. The full-screen
      editor of 8.3 now applies only on a tablet: a narrow screen for the chosen size, a touch screen,
      or E-ink mode. On a wide screen with a mouse and E-ink mode off it is the right-hand drawer, the
      tab stays visible beside it, and it does not step aside for map steps.

## 9. Timeline tab (raised 13 Nov 2026, built 13 Nov 2026)

- [x] **9.1 A Timeline tab.** Asked for: "When you select a marker you see all the facts in a timeline you
      can scroll. Also you can add more than one marker to the timeline." Built as a vertical list on a
      spine, one row per date, with the time between dates written on the spine; several markers either
      in one list or side by side in columns; mirrored facts included (switchable); undated facts last;
      🕒 Timeline button in a marker's information; choice of markers and layout kept per device.
      Choices made without asking, open to change: equal spacing between rows rather than spacing to
      scale (the Bible's spans would leave most of the page empty); no jump-to-year box yet.

## 10. Map: pins inside an area merge when zoomed out (raised 18 Nov 2026, built 18 Nov 2026)

- [x] **10.1** Reported: "if multiple markers are inside a marker zooming out keeps the same spacing. They
      should eventually become one pin." Cause: pins placed inside an area were fanned at a fixed 18
      pixels whatever the zoom, so zoomed out they covered far more ground than the area. Built: the
      ring spacing follows the area's size on screen (18 px down to 9 px), and below that the pins
      share one counted pin whose bubble lists them and offers to zoom in. Applies to pins whose
      "where" is at / inside an area marker. Pins at separate typed coordinates that happen to be close
      together are not merged; say if that is wanted too.
- [x] **10.2** Reported 23 Nov 2026 with a picture of fourteen pins hanging over the edge of their
      area: "When the markers start spilling out of the area make them into one pin with the number of
      people in it." Cause: each fanned pin was drawn twice as far from the centre as the layout had
      planned (the offset was applied twice), and the room was measured from the area's bounding box,
      not its outline. Built 23 Nov 2026: the offset is applied once (a fanned pin's bubble now points
      at the pin as well), and the room is the distance from the pins' centre to the nearest edge of
      the outline as drawn, less half a pin. The pins merge as soon as the outermost one would cross
      the outline. Full spacing looks as it did. Names under the pins may still reach past the edge.

## 11. Boox: the app "crashes" when switching to the textbook and back (raised 19 Nov 2026, built 19 Nov 2026)

Not reproduced (it only happens on the Boox). Found by reading the code that runs when the app is hidden
and shown again:

* Nothing about the session survives a restart: the tab, the map's place and zoom, the slider date, the
  tree's root person and, above all, an unsaved marker being edited. If Android or the Boox stops the
  app in the background, coming back looks like a crash and loses the typing.
* On every return after more than a minute the app runs a full sync. That sync rewrites the whole data
  to storage several times, re-reads every stored picture, and redraws every tab, even when nothing
  changed. In the Library it also rebuilds the table being typed in.
* When the hour-long Google sign-in has run out, that automatic sync asks Google for a new one, which
  opens a Google window without a tap. If pop-ups were allowed for the site, a window appears over the
  app on returning to it.
* The picture store's connection can be closed by Android while the app is hidden; the app does not
  reopen it, so pictures and sync fail until a restart.
* The app keeps no record of errors or of how the last session ended, so the cause cannot be confirmed.

Proposals, each its own commit:

- [x] **11.1 Pick up where you left off. Built 19 Nov 2026.** Remember the tab, map view, slider date and the chosen marker
      of each tab; keep an unsaved marker edit as you type and offer it back after a restart.
- [x] **11.2 A quiet return. Built 19 Nov 2026.** No sync on return unless something is waiting or five minutes have passed;
      a sync that changes nothing touches nothing on screen; settings saved once per sync; pictures
      re-read only when pictures changed; never rebuild a box being typed in.
- [x] **11.3 No Google window without a tap. Built 19 Nov 2026.** An automatic sync never opens the sign-in; the Sync button
      shows "Sign in" and one tap renews it.
- [x] **11.4 Picture store reconnects Built 19 Nov 2026.** after the app has been in the background.
- [x] **11.5 A problems log Built 19 Nov 2026.** in Library → Backup: errors, and whether the last session was closed, stopped
      in the background or reloaded, so the real cause can be read off the tablet.

Built notes (19 Nov): the session comes back only within twelve hours, so the Ties tab still opens empty
on a fresh day (decision 7.6). The cause is still not confirmed: the problems log on the Boox will say
whether the app is being stopped in the background, crashing on screen, or neither. The user asked
whether the Boox can report by itself: its log goes to the Drive folder at each sync and can be loaded
in Library → Problems log on the PC.

## 12. Time gaps: dates known only as "after this" and "before that" (raised 19 Nov 2026, built 19 Nov 2026 as 14.1 to 14.3; 12.4 still open)

Raised by the user: Abram and Sarai's marriage has no date; it must fall after both were born and before
either died. A time gap "after Abram born" should not run on to the present, and a second gap "before
Abram died" should close the range, with the two shown as one.

What the app does today (checked on a throwaway Abram, 2166 to 1991 BC):

* A time gap always means "this date EQUALS that date plus a gap". A gap of nothing "after Abram born"
  places the marriage on the day he was born (2166 BC), not "some time after".
* A second gap "before Abram died" does not close a range. The app now has two answers for the marriage,
  2166 BC and 1991 BC, and raises three conflicts, because the two gaps together also say that Abram's
  birth and death are the same date.

Proposal:

- [x] **12.1 A second kind of time gap: a limit. Built 19 Nov 2026 in the form of 14.1 to 14.3.** The dialog offers "exactly / about N after or before"
      (today's gap, which places the date) or "some time after" / "some time before" (a limit, which only
      bounds it). A limit may carry an amount: "at least 13 years after Abram born".
- [x] **12.2 Limits combine into one range. Built 19 Nov 2026 in the form of 14.1 to 14.3.** A date can have any number of limits. The earliest it can be
      is the latest of its "after" limits; the latest it can be is the earliest of its "before" limits.
      The fact shows one line, "between 2156 BC and 2029 BC", with the limits listed behind it. One side
      only reads "after 2156 BC" or "before 2029 BC". No single date is invented. On the map the marker
      shows across the range at the reduced strength already used for approximate dates; the Timeline
      places it at the middle of the range, marked as a range.
- [x] **12.3 Limits and gaps together. Built 19 Nov 2026 in the form of 14.1 to 14.3.** A real gap still places the date; limits then narrow its range.
      A date placed outside its limits, or limits that cross (earliest later than latest), is a conflict.
      Limits never join two other dates together, so they cannot make a birth equal a death.
- [ ] **12.4 (optional) Limits the app can supply.** For a Married fact: within both spouses' lifetimes.
      For a Had child fact: within the parent's lifetime. Shown as reckoned, switchable per fact type,
      overridden by anything typed. To decide: wanted or not.

Questions for the user: range only, or also a most-likely date in the middle; whether 12.4 is wanted;
whether a date bounded on one side only should show on the map at all.

## 13. A journey several people make together: Terah, Abram, Sarai and Lot from Ur to Haran, Genesis 11:31 (raised 19 Nov 2026, 13.1 built 19 Nov 2026; 13.2 still open)

Tried on throwaway markers, 19 Nov:

* **One "Located at" fact per person** (at Ur, then at Haran) works when the move has a date: the pin
  moves when the slider passes it. With no date on either, the person shows at BOTH places at once.
  Four people means the same fact, date and citation typed four times.
* **One Event marker that moves** (Located at Ur, then Located at Haran) with a "Present at" fact on each
  person also works today: all four pins follow the event from Ur to Haran, and the event lists who was
  present. The date and citation live once on the event, but each person still needs their own fact
  and date, the event is an extra pin, and people stay "at the journey" until their next location.
* A fact that names other people (a role) shows on their markers but never moves them.
* The verse gives no date. It falls after Abram married Sarai (11:29) and before Terah died in Haran
  (11:32) and Abram left Haran aged 75 (12:4), so it needs the limits of section 12.

Proposal:

- [x] **13.1 A shared fact that places everyone in it. Built 19 Nov 2026.** A role in a fact type gets a new tick, "they go
      there too". A fact type such as "Moved to" on Terah, with place Haran and the role "Took with him"
      naming Abram, Sarai and Lot, is then entered once: one date or range, one citation, four pins move,
      and each person's information shows the line as coming from Terah's fact. Depends on section 12
      for the undated case.
- [ ] **13.2 (optional) Where from, and where they meant to go.** "From" (Ur) and "Bound for" (Canaan) as
      detail boxes on the fact; a line on the map from Ur to Haran while the fact is selected.

Questions for the user: one shared fact on Terah, or the journey as its own Event marker; whether the
map should draw the journey as a line; build order (12 before 13).

## 14. Dating logic modelled on Primavera P6 (suggested by the user 19 Nov 2026, built 19 Nov 2026 except 14.4)

The user suggested entering the logic the way Primavera P6 does. Assessment: it fits, and it replaces the
"limits" idea of section 12 with a model the user already knows. How P6's parts map onto the app:

| Primavera P6 | Chrono Map |
|---|---|
| Activity with a start and a finish | A fact with a date and an end date (a life, a reign, a stay, a journey) |
| Milestone | A fact with one date (Born, Died, Married) |
| Relationship FS / SS / FF / SF with lag | A time gap between any two dates: "no earlier than that date plus N" |
| Constraint (Start On or After, Finish On or Before, Mandatory) | A typed earliest / latest date on a fact; an anchor (lock) is Mandatory |
| Forward pass, Early dates | The earliest a date can be, from everything that must come before it |
| Backward pass, Late dates | The latest a date can be, from everything that must come after it |
| Total float | The width of the range the date can fall in |
| Driving relationship | Which limit actually sets the earliest (or latest) date |
| Negative float, loop report | A conflict |
| Resources assigned to an activity | People named on a shared fact or event (section 13) |

Differences to keep: P6 schedules everything at its early date, history must show the whole window
(Early to Late) and invent no date; an "exactly" gap stays (Seth born = Adam born + 130 years is a tie
with zero float); lags may themselves be ranges; dates may be year-only and BC; no calendars, no WBS.

Worked through:
* Abram and Sarai's marriage: Early = the later of the two births, Late = the earlier of the two deaths
  (and the birth of Isaac once that tie is added). Shown as one line with that window; the driving tie on
  each side is named.
* Ur to Haran: one activity (a shared fact or an Event marker) with Terah, Abram, Sarai and Lot assigned;
  predecessor "Abram married Sarai", successors "Terah died" and "Abram left Haran aged 75".

- [x] **14.1 Logic ties. Built 19 Nov 2026.** The time gap dialog offers: exactly N, at least N, at most N, or some time,
      after or before another date. Any date to any date, which covers FS, SS, FF and SF.
- [x] **14.2 Forward and backward pass. Built 19 Nov 2026.** Every date gets an earliest and a latest; a date with no typed
      value shows as that window. Conflicts are windows that close (negative float) and loops.
- [x] **14.3 Logic list on each fact. Built 19 Nov 2026.** Predecessors and successors with tie, lag, and which one drives.
- [ ] **14.4 (optional) Bar layout in the Timeline tab.** Lives and stays as bars to scale, windows hatched,
      like a P6 Gantt chart.
- [x] **14.5 Assigned people** = section 13.1. Built 19 Nov 2026.

Questions for the user: P6's terms (FS, Early, Late, Total float) on screen, or plain words; whether the
bar layout is wanted; whether the app should add lifetime ties by itself (12.4).

The detailed design for sections 12 to 14 is in DESIGN-dating-logic.md (drawn up 19 Nov 2026 at the
user's request, awaiting approval and six decisions listed at its end). The arithmetic of its examples
was checked with a prototype of the forward and backward pass.

Revision 2 of the design (19 Nov 2026), from the user's review: no "kinds" of tie. A date keeps its
three parts (Earliest, the date, Latest) and any part can be tied to another date on the same or a
different marker; "after" and "before" only give the direction of the gap. Several ties are entered in
one dialog with the source typed once. Approximations stay. Checked with the prototype: same windows as
revision 1.

Built 19 Nov 2026 (sections 12 and 14.1 to 14.3, design steps A and B): ties on a date's Earliest and
Latest ends, the forward and backward pass, windows shown as "between…", window conflicts, the tie
dialog with several rows and one source, the editor lines naming the governing tie, and one-tap
conversion of zero-gap workarounds in Library → Time gaps. Decisions taken as recommended without a
separate answer: window only, no date in the middle; shared source with an optional verse per row.
Existing time gaps are untouched and give the same dates (checked). Not built, still open: the lifetime
rule (12.4 / design decision 2), people assigned to a fact (13.1 / 14.5), the bar layout (14.4).
A one-sided window places the fact at its one end for ordering and on the map, as a one-sided typed
approximation already did.

Correction, 19 Nov 2026: an earlier note here said the shared journey fact was declined. That was a
misunderstanding. The user had taken the question to mean entering the journey's data for him, and
declined that ("I will be doing that myself"). Once the feature was explained he asked for it: "Please
include that in the build, and I will enter the data myself." So 13.1 / 14.5 is built (see below), and
the journey's markers, fact type, fact and ties remain the user's to enter.

Built 19 Nov 2026 (13.1 / 14.5): in Library → Fact types, each role has a tick "they go there too". A
fact of that type with a place then puts everyone named in the role at that place over the fact's
dates, on the map and in their Location line; their information shows the line as coming from the
other marker's fact, "which also places this marker". No fact type was added: the user creates his own.

## 15. Lower token use (raised and set up 19 Nov 2026)

The user asked how to use fewer tokens without losing quality, and what to make of sub-agents. Decided
and set up:

- [x] **15.1 One session per agenda item.** `CLAUDE.md` (loaded by every session) holds the owner's rules,
      the code rules, testing, release and a map of the files; `docs/code-notes.md` holds how each file
      works inside. A new session starts from those and this agenda, not from a long conversation.
- [x] **15.2 The test copy never shows an old file.** `tools/dev_server.py` serves this PC's test copy
      with caching off, and the app skips its offline cache on localhost (`?sw=1` turns it on to test the
      cache itself). The live app and the Boox are unchanged.
- [x] **15.3 Model by task.** The top model for design-heavy work; a cheaper one, chosen by the user in
      the model menu, for small fixes. Claude says at the start when a cheaper model would do.
- [x] **15.4 Sub-agents only for testing and review.** Not for building. A browser test run with bulky
      output, or an independent review of a large change before release.

## 16. The PC kept syncing with the wrong Google account (reported and fixed 23 Nov 2026)

- [x] **16.1** Reported: "The PC app keeps syncing to the wrong email." Cause: the app asked Google which
      account was signed in only the first time ever. After Switch account it still remembered the old
      address, showed it in Library, Sync, and handed it back to Google at the next hourly renewal, which
      signed the device into the old account again. Fixed: the account is read from Google after every
      new sign-in, Switch account forgets the old address first, and a renewal that comes back as a
      different account says so on screen and in the problems log. Checked with a stand-in for Google
      on the test copy; not checked against the real accounts, which only the user can do.

## 17. An automatic journey: "Starts at" and "Ends at" (raised 23 Nov 2026, 17.1 built 25 Nov 2026; 17.2 and 17.3 open)

The user's words: "Is there a way you can automate this with a moved to route/marker automatically moving
markers to another location without me having to input the ties. Let's discuss how it would work."

**What he has entered himself** (Genesis 11:31; do not enter or change any of it): a route marker "Journey
from Ur to Haran" with one fact of his own fact type "Journey" (from / until, role "Travelers" ticked "they
go there too") naming Terah, Abram, Sarai and Lot; his own fact type "Moved to" (role "Took with", ticked);
"Located at" facts labelled "Lived" at Ur and at Haran. A list of eight corrections to his entries was given
to him on 23 Nov (the Journey has no dates or limits; a "1 day before Terah died" gap on Lived at Ur; and
others). Those are his to make. He agreed that "Located at" labelled "Lived", given a role ticked "they go
there too", makes more sense than a separate "Moved to".

**What the app does today** (tried on throwaway markers, 23 Nov):

* Travellers named on the route marker's own fact are placed on the route between its From and Until
  dates, and the line is drawn only then.
* They sit at one point (the centre of the route's shape, `Store.resolveMove` centroid), stacked exactly on
  top of each other. They do not move along the line and do not spread apart.
* After the Until date they vanish from the map unless a fact of their own places them. So the arrival
  needs a second fact (Lived at Haran, with the party in its role) and a tie: its date *on* the Journey's
  Until. Leaving Ur needs no tie. An undated "Lived at Ur" is fine once the arrival has a date or window.

**Proposal put to the user** (answered 25 Nov 2026, see "Decided" below):

- [x] **17.1 "Starts at" and "Ends at" on a journey fact. Built 25 Nov 2026.** Two new boxes, each choosing a marker (Ur,
      Haran). From them the app works out, with no extra fact and no tie:
      before From, each traveller stays where their own facts put them; From to Until, on the route;
      after Until, at the "Ends at" marker until their own next location or their death. A window on the
      journey's dates carries through to the arrival. A traveller's own fact always wins from its date on
      (someone who leaves the party). With no Until, arrival is at the From date. Each traveller's
      information shows the stay as coming from the journey's fact; he adds a "Lived at Haran" fact of
      his own only when he wants a note or source there.
- [ ] **17.2 (his choice, can come later) Pins move along the line** in step with the time slider between
      From and Until, and spread apart so every traveller shows.
- [ ] **17.3 "Starts at" with no drawn route:** a straight line between the two markers (the older 13.2).

**Decided by the user, 25 Nov 2026** ("Yes build it with your recommendations"):

* Build 17.1 now.
* The setting is a tick on the fact type (Library, Fact types): "a journey: has a start place and an end
  place". "Starts at" and "Ends at" appear only on facts of such a type.
* It works on a person's own fact as well as on a route marker. Who travels: everyone in a role ticked
  "they go there too", plus the marker the fact is on when that marker is a pin (not when it is the route
  or an area).
* 17.2 and 17.3 later, each as its own item.

Rules settled while planning (told to him before building):

* The start place is used only for a traveller whom nothing else places before the journey's From.
* A traveller's own dated location after From and up to the arrival means they left the party: their stay
  on the route stops at that date and the journey gives them no arrival.
* A journey with no date and no limits places nobody at its start or end (the fact card says so).
* The two boxes are stored as `startAt` and `endAt` on the fact, so a list of stops (section 19) can be
  added between them later.

**As built, 25 Nov 2026.** Tested on the test copy with throwaway markers at the PC size and the tablet
size (E-ink on); not checked on the Boox itself. What he does with his own Genesis 11:31 entries: in
Library, Fact types, ✏️ on "Journey", tick "a journey: has a start place and an end place"; on the route
marker's Journey fact choose Ur and Haran in the two new boxes and give the fact a date or limits. The
"Lived at Haran" fact with its tie on the Journey's Until can stay (his own fact wins) or be removed.
An undated location of his own (Lived at Ur, Lived at Haran with no date) still shows from the beginning,
as before.

Declined on 23 Nov and not to be offered again: a "+ Role" button on the fact in the marker editor.

## 18. Markers stacked on one spot share a numbered pin (asked 25 Nov 2026, built 25 Nov 2026)

The user's words: "Where point markers stack on each other on the map please make them numbered, and when
you click the number pin you see all the markers similar to when zooming out."

- [x] **18.1 Built 25 Nov 2026.** Pins that land on the same spot of the screen (travellers on a route,
      people at the same town marker) are drawn as one pin showing how many there are. Clicking it lists
      them, as the counted pin inside an area does (section 10); a name in the list opens that marker's
      information.

As built: "the same spot" means pin centres within 8 screen pixels, so two places very close together
also share a pin when zoomed far out and part again when zoomed in (the bubble then offers "Zoom in to
spread them out"). When the others are located at one of the markers (a town), the pin takes the town's
colour and, with labels on, reads "Haran +2"; otherwise "3 markers". Pins inside an area keep the fan
and counted pin of section 10. Tested on the test copy at the PC size and the tablet size with E-ink on;
not checked on the Boox itself.

## 19. Routes with stops, and a short route inside a longer one (raised 25 Nov 2026, built 25 Nov 2026)

The user's words: "Routes that stop at multiple locations before reaching their final destination. We need
a way to mark those down. Also we need to consider possibly one source notes a marker moving a small route
because it only considers that small timeline, however if another source considers a longer time line with
a longer route we need a way for that small route to be included into the longer route."

First thoughts (not put to him yet, nothing decided):

* **Stops:** a list of stops on the journey fact between "Starts at" and "Ends at", each a marker with its
  own arrived and left dates (or limits), read like activities in sequence in P6. Travellers sit at a stop
  between its two dates and on the route between stops.
* **A short route inside a longer one:** each source's journey stays its own fact with its own source. The
  short one is marked as a leg of the long one, so the travellers are placed once and the long journey
  takes the leg's dates as limits.

**His answers, 25 Nov 2026** (decided; not yet told to build):

* Each stop has its own arrived and left dates (or limits), like activities in sequence in P6.
* Not every traveller makes every leg: "Some can join, leave, or stop."
* A stop is sometimes a marker and sometimes just a point on the line. And: "sometimes a point on a line
  does not mean a stop it may just mean the point is along that path." So a place on the journey is
  either a stop (with dates) or a place it passes (no dates, no stay).
* A short journey as a leg of a longer one: "Yes that is fine but what if I log the long journey first,
  and then later stumble upon the short journey how would I enter that?" Answer given to him: the short
  journey is entered as its own fact with its own source and a "Part of" box naming the long journey.
  The link is made from the short one, so the order of entry does not matter and the long one is not
  re-entered.

Steps (put to him 25 Nov; he said to build them the same day: "19: stops first"):

- [x] **19.1 Places along a journey. Built 25 Nov 2026.** A list on the journey fact between "Starts at"
      and "Ends at". Each row is a marker or a point picked on the map, and is either a stop (arrived and
      left dates, each with limits and ties like any other date) or a place passed. Travellers are at a
      stop between its two dates and on the route between stops.
- [x] **19.2 Who makes which part. Built 25 Nov 2026.** Each traveller can have "joins at" and "leaves
      at" (the start, a stop, or the end). Someone who leaves at a stop stays there until their own next
      location.
- [x] **19.3 "Part of" a longer journey. Built 25 Nov 2026.** The short journey's dates become limits on
      the long one (and on the matching stops when its ends are stops of the long one). Travellers are
      placed once. Dates that disagree are reported as a conflict, as closed windows are now; the app
      does not pick a side.

Still to ask: nothing blocking. The conflict rule in 19.3 was put to him as a recommendation.

**19.1 as built, 25 Nov 2026.** In the marker editor, a fact whose type is ticked "a journey" now reads
Starts at, then **Places along the way**, then Ends at. A place is added by choosing a marker or with
"📍 or a point on the map" (a point can be given a name); ↑ ↓ change the order, ✕ removes it. Each place
is "a stop" (Arrived and Left boxes, each with earliest / latest and the ⛓ tie buttons) or "a place
passed" (no dates). Rules settled while building:

* The order is the order of the list, not of the dates. Like activities in sequence in P6, the app holds
  that each date is not before the one before it: From, each stop's Arrived and Left in turn, Until. So a
  stop with no date shows the window its neighbours leave it ("between … and …"), a journey with no dates
  of its own takes them from its stops, and a date out of order is listed under ⚠ Conflicts as "The order
  of the journey: …". These limits are the app's own: they cannot be overruled, only the date or the order
  corrected.
* Travellers are at a stop from Arrived to Left and on the route between stops. A stop with no Arrived
  date and no window places nobody. A stop with no Left date lasts until the next dated place.
* With no route drawn on the fact, they stay at each place until they reach the next (as 17.1 does
  between the start and the end).
* A traveller's own dated place during the journey still means they left the party: nothing of the
  journey is given to them after that date.
* A place passed changes nothing on the map. It is in the fact's wording ("by way of …") and under that
  place's "Mentioned in". It will matter when 17.3 draws a line through the places.
* A stop's dates can be tied from any other date: in the tie dialog they are listed under the journey's
  marker as "… · stop at Haran (arrived)" and "(left)".
* Journeys with no places along the way are placed exactly as before.
* In the conflicts list, when several dates along one chain are squeezed by the same disagreement, only
  the date where the two sides really meet is listed now (before, every date between them was).

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on); not checked
on the Boox itself. For his Genesis 12 reading: Haran, Shechem, Bethel and Egypt are entered as stops on
one journey, or as separate journeys, as the text is read; that choice is his.

**19.2 as built, 25 Nov 2026.** On a journey fact that has at least one stop, each name in a role ticked
"they go there too" has two boxes under it: **joins at** (the start, or a stop) and **leaves at** (a stop,
or the end). Left alone, the traveller makes the whole journey, as before. Rules settled while building:

* Joining at a stop: the journey does not place them before the party arrives there. If nothing else
  places them before that day, they are shown at that stop beforehand (the same rule as the start place).
  From the stop's Arrived date they are with the party.
* Leaving at a stop: they are at the stop from its Arrived date and stay there, with no end, until their
  own next location. The journey gives them nothing after it and does not bring them to its end place.
* A traveller's own dated place still means they left the party, but for someone who joins at a stop only
  a place dated after they joined counts (an earlier one is simply where they were before).
* If "joins at" comes after "leaves at" the journey places them nowhere, and the editor says so.
* The boxes name stops only: a place passed has no dates to join or leave by. Removing a stop, or turning
  it into a place passed, clears the boxes that named it.
* The marker the fact is on (a person with their own journey fact) always makes the whole journey.
* The fact's wording and the traveller's own information say "(joins at …, leaves at …)".

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on); not checked
on the Boox itself.

**19.3 as built, 25 Nov 2026.** A journey fact has a box under "Ends at": **Part of a longer journey**,
listing the other journeys entered (marker, fact, from and to). It is set on the short journey, so the
order of entry does not matter; the long journey's fact names the journeys entered as part of it. Rules
settled while building:

* Places are matched by marker, in order. The short journey's start is looked for among the long one's
  start and stops; its stops among the long one's later stops; its end among the long one's later stops
  and its end. A point picked on the map matches nothing.
* A matched place is the same moment in both: the short journey sets out when the long one sets out, or
  when it **leaves** the matching stop; it arrives when the long one **arrives** at the matching stop, or
  at its end; a matching stop has the same Arrived and Left. So a date known in one fills the window of
  the other. The editor says in words which of these apply.
* An end with no match must only fall inside the long journey: not before its From, not after its Until.
* Dates that cannot both be true are listed under ⚠ Conflicts as "Part of a longer journey: … and … are
  the same moment". Neither date is changed and there is no Overrule button: he corrects a date or
  clears the box. (This was put to him as a recommendation on 25 Nov and is built that way.)
* A traveller named on both journeys is placed by the long one only (its legs and stops). A traveller
  named only on the short one is still placed by the short one. The short journey's own route line is
  still drawn over its dates.
* A journey cannot be chosen as the longer journey of one of its own parts. Deleting the long journey's
  fact or marker clears the box.
* Parts of parts work: a traveller is placed by the nearest longer journey that names them.

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on); not checked
on the Boox itself.

## 20. Markers inside a marker: an army and its people (raised 25 Nov 2026, under discussion)

The user's words: "Say a marker is an army that includes multiple markers of people. If the army marker
moves, it moves everyone with it. But we also need a way to exclude people within the marker moving, for
example say some are wounded we need to be able to exclude them from the move. It does not only have to be
for moving it can be anything that affects the army affects the people within, examples such as death
(they all died in a battle except the exclusions), and any other fact type."

First thoughts (not put to him yet, nothing decided):

* Membership is a fact with from and until ("Member of" exists already). While a member, a person is
  wherever the group is, unless a fact of their own says otherwise.
* A fact on the group can apply to its members: a tick on the fact type ("applies to its members") and an
  "Except" box on the fact naming who is left out. "Died in battle" on the army then ends every member but
  the exceptions, with one date and one source.

**His answers, 25 Nov 2026** (decided; not yet told to build):

* Only ticked fact types reach the members: "I like a tick as applies to it's members."
* An "Except" box on the fact naming who is left out: "Yes that seems good."
* A group can hold groups. "This does not have to only be an army. That was an example. It could be a
  corporation, ethnicity, country, etc."
* On the map: "One numbered pin for the army, and then when you click it it lists out who is there. What
  do you think about that?" Answer given to him: yes, and it is what section 18 already draws for
  markers located at another marker ("Army +5"). The number counts the markers he has entered, not the
  size of the army. A member who is somewhere else at that date (left behind, an exception, an own
  location) is drawn at their own place and listed in the bubble as "elsewhere". A group that is an
  area (a country) keeps the fan and counted pin of section 10.

* Leaving and rejoining (his follow-up, 25 Nov): "someone leaves the army. Their name should go away
  from the army marker at that time right, or I think it should keep the marker but have dates of
  membership, or a part of. And sometimes someone will leave then join again at a later date we need to
  take that into account." Settled: membership has dates. One membership fact is one spell (from, until);
  a second fact for the same person and group is a second spell, so leaving and rejoining is two facts.
  The pin's count and list show who is a member **at the slider's date**: a name drops off at its Until
  and comes back at the next From. The person's own marker is never removed. "Elsewhere" is only for
  someone who is still a member at that date but is away (left behind, an exception). The group's
  information lists every member with the dates of each spell.

Proposed steps (put to him 25 Nov, awaiting his go-ahead):

- [ ] **20.1 Members follow the group.** Membership is a fact with from and until, entered from either
      side (on the person: member of the army; on the army: its members). While a member, a marker is
      wherever the group is unless a fact of its own says otherwise. Groups inside groups follow in the
      same way.
- [ ] **20.2 Facts that apply to the members.** A tick on the fact type, "applies to its members", and an
      "Except" box on the fact. Only those who are members at the fact's date are reached. Each member's
      information shows the line as coming from the group's fact. A "Died" on the army then ends every
      member but the exceptions.

The "3 things" in his message of 25 Nov was a typo: there were two.

## 21. Editing a time gap (asked 25 Nov 2026, built 25 Nov 2026)

The user's words: "I need to be able to edit time gaps".

**What the app does today.** Once a time gap (a tie between two dates) is saved, only its note, its
confidence and the reason can be changed, and only in Library, Time gaps. It can be overruled, restored
or deleted. Its length (years, months, days), "after" or "before", "give or take", which other date it
points to, which part of the date it sets (earliest, the date, latest), its source and its verse cannot be
changed: he has to delete it and enter it again. The pencil button in Library, Time gaps opens the marker,
not the time gap.

Step (put to him 25 Nov; he said "Build it" the same day, with two changes, below):

- [x] **21.1 An Edit button on every time gap. Built 25 Nov 2026.** In the marker editor's Time gaps list and in Library,
      Time gaps. It opens the same dialog used to add a tie, filled in with that time gap: Earliest / The
      date / Latest, on / after / before, the length, give or take (at least, at most), the other marker
      and which of its dates, the source, the verse, the note, the confidence and its reason. Save changes
      that one time gap in place and the dates are worked out again. It stays overruled if it was.

**His answer, 25 Nov 2026:** "Do not do 1. I need to be able to change the date incase I make an error. I
don't want to have to redo the whole time gap. Do not do 3. I should be able to edit it how I see fit.
Build it". So, of the four recommendations put to him:

* (1, refused) The date the time gap belongs to **can** be changed in the dialog: a marker and one of its
  dates, at the top.
* (2, kept) In Library, Time gaps the "✏️ Edit" button edits the time gap, and a separate "Marker" button
  opens the marker.
* (3, refused) "+ Add another tie" **is** offered while editing. The first row is the time gap being
  edited; a row he adds is saved as a new tie on the same date.
* (4, kept) The limits the app keeps by itself (the order of a journey's stops, "Part of") are not time
  gaps and are not editable.

**As built, 25 Nov 2026.** "✏️ Edit" is on each row of the marker editor's Time gaps list and of Library,
Time gaps. The dialog opens filled in; Save changes alters that one time gap in place (it stays overruled
if it was) and the dates are worked out again. Settled while building:

* When the time gap is moved off a date it had reckoned, that date is emptied again (it was only ever
  worked out from the time gap).
* A date he has typed at a newly chosen end becomes an anchor, as it does when a tie is first made, so the
  reckoning never overwrites a typed date; if the two then disagree it is listed under Conflicts.
* The row being edited has no remove button in the dialog: a time gap is deleted from its list, as before.

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on); not checked
on the Boox itself.

## 22. Less typing, automatic checks, easier reading (raised 25 Nov 2026; 22.1 to 22.3 built 25 Nov 2026; 22.4 to 22.6 under discussion)

The user's words, after entering the time gaps for Genesis 11:31 (Terah, Abram, Sarai, Lot): "Please double
check the logic, and let me know if there is anything missing, or redundancy. Is there a better way of
inputting this information, or can we change the app to make it better? In order reduce redundancy of
inputting information. To improve its look, or the way it is read. All while maintaining mobility (able to
change functionality around) of inputting information in the app."

**What the review of his export found** (told to him 25 Nov; the corrections are his to make):

* The Journey runs backwards: From 9 Feb 1921 BC, Until 10 Feb 2126 BC. Cause: the tie "Terah, Lived at
  Haran (from) = Terah, Born" sits on the Haran fact (meant for Ur), and the Journey's Until is tied to that
  date. The app reported nothing, because a from / until pair is only checked where a limit tie touches it.
* The Journey's From comes from a typed anchor, "Lived at Ur until 9 Feb 1921 BC" on Terah (one day before
  his death). The verse gives no date, only an order.
* "Haran (the man), Died = Terah, Born" with no length says he died the day Terah was born; his note shows
  he meant "while Terah was alive".
* Lot's Born is typed 2108 BC and anchored, 52 years before his father Haran can have been born.
* Sarai's "Lived at Ur: not before Married" limits the residence by the marriage, the wrong way round.
* Missing: Journey Until not after Terah's death; Journey From not before Haran's death or Lot's birth.
* Redundant since 17.1: the eight "Lived at" facts and their eight date ties; the journey fact with Starts
  at Ur and Ends at Haran places all four. Eight lifetime limits and four empty Born / Died facts exist
  only to hold those limits. 9 facts and 14 ties cite Genesis 11:31; one fact and about four limits say the
  same.

**Proposed changes to the app** (put to him 25 Nov, awaiting his choice; each would be its own item):

- [x] **22.1 Until before From is always reported. Built 25 Nov 2026.** under Conflicts, on every fact, tie or no tie.
- [x] **22.2 The lifetime rule. Built 25 Nov 2026** (the open 12.4 / design step C): a person's facts stay between their Born
      and Died by themselves. A limit the app keeps, like the order of a journey; it changes no typed date.
- [x] **22.3 The family rule. Built 25 Nov 2026:** a child is not born before its parent (from the Parent of ties).
- [ ] **22.4 "During" in the tie dialog:** one row, "during Terah's life" or "while living at Ur", saved as
      the two limits it means.
- [ ] **22.5 A chain that loses its anchor goes blank** instead of its reckoned dates quietly turning into
      typed dates (today the remaining dates anchor each other at the old values).
- [ ] **22.6 Reading by verse:** everything entered from one verse on one screen, facts and time gaps
      together.

His wish to keep freedom of entry is met by making 22.1 to 22.3 limits and reports only: they never change
what he typed, and entering a person's own facts stays possible beside a journey.

**His second export, 25 Nov 2026** ("Check if I made the right corrections then build"). Done right: the
eight "Lived at" facts and their ties are gone, no typed anchor is left, the Journey has "Until not after
Terah died" and "From not before Haran died / Lot born", Lot's Born is cleared and tied to his father's,
Haran's death is "not after Terah died" and "not after the Journey's From". Left over, told to him:

* A tie the wrong way round: "Journey (from): not after Haran, Died". With its mirror it pins the Journey's
  start to the day Haran died. To delete.
* "Journey (until): not after Terah, Died" is entered twice. One to delete.
* Haran (the man) still has a Died date, 10 Feb 2126 BC (give or take 100 years): the old reckoned date,
  written back by the bug below. It pulls Terah's, Haran's and Lot's windows. To clear, with its two small
  boxes.
* The Journey's Until still has earliest 2226 BC and latest 2026 BC in its small boxes. To clear.

**22.1 to 22.3 as built, 25 Nov 2026** (he said "build"; one commit, because the three share one piece of
working out; each rule has its own switch instead):

* **Until before From** is reported for every fact that has something typed at both ends, tie or no tie.
* **Lifetime rule.** A marker's lifetime runs from its Begins fact (Born, Founded, the From of Took place)
  to its Ends fact (Died, Destroyed). Its own facts fall inside it. Whoever takes part in a fact was alive
  for some of it (began before it ended, ended after it began); a birth is let off the second half, since
  a father may die before his child is born. "Also named" is let off entirely, and any fact type can be,
  with a new tick in Library, Fact types: "may fall outside the lifetime of its marker".
* **Family rule.** A child's Begins is not before its parent's Begins, from every "Parent of" tie.
* They are checks and limits, never dates. A date that breaks one is listed under Conflicts ("Within a
  lifetime: …", "Parent and child: …") with no Overrule button. A date that already has a tie is narrowed
  by them and says so ("not after … Died (the lifetime rule)"). **A fact with no date and no tie gets no
  window from them**, so undated facts sort and draw on the map exactly as before. This is narrower than
  the "shown as reckoned" of design decision 2, chosen so that nothing he has entered changes its look.
* **A second pass over the most likely dates.** His dates carry wide ranges (the Flood give or take 100
  years), and inside ranges that wide a child typed 50 years before its father still "fits". So the same
  limits are worked out again with each known date at its most likely value; what fails only there is
  listed as a softer entry, "The most likely dates are out of order". This is what catches a case like
  Lot's 2108 BC. It applies to his own limit ties as well as to the three rules.
* Switches: Library, Time gaps, two ticks (lifetime rule; child not before parent). They are a setting of
  the device, not synced.
* **Bug fixed with it:** when a time gap was edited, turned into a limit or deleted while its marker was
  open in the editor, the old reckoned date stayed in the editor and Save wrote it back as a typed date.
  The editor now takes the store's value for any date a time gap had been working out.
* What the rules do not replace: "the Journey's Until is not after Terah died" and "its From is not
  before Lot was born" are his readings of the text and stay his ties. For a traveller the rule only says
  the journey overlaps their life.

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on); not checked
on the Boox itself. Not tried on his real data: any entry it lists there is for him to judge.

## 23. Reading and entering dates (asked 25 Nov 2026, built 25 Nov 2026)

The user's words, with three screenshots of the Journey fact in the PC editor: "This is too scrunched up.
It needs to change so it can be clearer to read and entered. Also the editor blocks me from scrolling the
timeline bar all the way make the editor stop above it. Also stop showing the mid point in the
approximation it muddies things up just show the earliest and latest dates. Also how do I know how long
they lived at Ur, and Haran if I am not looking at the map?"

- [x] **23.1 Room for the date boxes. Built 25 Nov 2026.** From and Until each take a full line when the
      editor is narrow (they stay side by side on the tablet, where there is room). "earliest" and
      "latest" have a line each with a wide box and their ⛓ button. The tick that opens them is labelled
      "range". The cause of the squeeze was that every button beside a box took as much width as the box.
      The place row's buttons now wrap instead of running off the edge.
- [x] **23.2 The PC editor ends above the time bar. Built 25 Nov 2026.** Only while the Map tab is
      showing; on the other tabs it runs to the bottom as before. The tablet's full-screen editor is
      unchanged.
- [x] **23.3 No made-up middle date. Built 25 Nov 2026.** Where a date is known only as a window, the app
      says "between X and Y", "after X" or "before Y" and never "c. middle (X – Y)". Changed: the lines
      "from other markers" in the editor (his screenshot), a marker's Span and Location lines, tie dates,
      Library, Markers, and the family tree (which now shows no year for such a date). When From and
      Until share one window it is said once. **Kept:** a most-likely date he typed, or one a time gap
      worked out, still shows with its range ("c. 2126 BC (2226 BC – 2026 BC)"). The map still uses the
      middle of a window to decide which place applies and how strongly to draw it; only the words changed.
- [x] **23.4 "Where and when" in a marker's information. Built 25 Nov 2026 ("Yes, build it").** His question
      "how do I know how long they lived at Ur, and Haran if I am not looking at the map?" has no good
      answer today: the information panel gives the location at the slider's date only, and the Journey
      line says "from Ur to Haran" with its window. Proposed: a short list under Location, in order, of
      every place the marker is and from when to when, whether it comes from its own fact or from a
      journey ("Ur: until between … and …", "On the way: …", "Haran: from … until died …"), with the
      length of each stay where both ends are known. The words needed are already worked out for 23.3
      (`when` / `whenEnd` on each derived location).

**23.4 as built.** A point marker's information has a list "Where and when", between its details and its
facts: one line per place, in order. Each line gives the place (a link when it is a marker, "on the way"
for a route), from, until, the length of the stay, which fact puts the marker there, and "here at the
slider's date" on the line that applies. Rules:

* A place lasts until its own Until, else until the next dated place, else until the marker ends ("until
  died (…)"): the same rule the map draws by.
* An undated place reads "from the beginning"; its length is counted from the marker's Begins when that
  is a known date.
* The length is given only when both ends are known dates (typed, or worked out by a time gap), with
  "about" when either has a range. Where an end is only a window the line shows the window and no length:
  nothing is made up.
* Areas and routes have no list (their own places are outlines). A marker with one undated place and
  nothing else has none either.

23.1 to 23.3 are three commits; 23.4 is a fourth. Tested on the test copy with throwaway markers at the PC size and the
tablet size (E-ink on); not checked on the Boox itself, and not looked at on his own PC window.

**His reply, 25 Nov 2026**, with two screenshots of Terah: "It is still showing the mid point. There
isn't a way to see Where and when outside the map tab. It should show in the editor. There is something
wrong with the time gap logic … It is showing lived in Haran until 02/10/1821 BC when he is already dead
in 02/10/1921 BC. Where is the disconnect?"

- [x] **23.5 A date with a range reads "between X and Y". Built 25 Nov 2026.** This reverses the "Kept"
      note of 23.3: he does not want the most-likely date shown between the earliest and the latest, typed
      or worked out. Everywhere a ranged date is read (Span, fact lines, lines from other markers, Location,
      tie dates, Where and when, Library, Markers, the Timeline tab's headings) it now reads "between 10 Feb
      2226 BC and 10 Feb 2026 BC". The family tree leaves a ranged date out (its box cannot hold a range).
      Kept on purpose: the date box in the editor still holds the most-likely date (it is what he typed or
      what the time gap gives, and other dates are worked out from it), and the conflicts panel still names
      it where he chooses which value to use.
- [x] **23.6 "Where and when" in the marker editor. Built 25 Nov 2026.** A section of that name between
      Facts and Fields, for point markers, so the list can be read on any tab. It shows what is saved: an
      edit appears there after Save.
- [x] **23.7 The place of an ending is said as what it is. Built 25 Nov 2026.** Terah's "Died" fact has a
      place (Haran). The list showed it as a stay: "Haran, from [his death] until died". It now reads
      "Haran · died here · [date]".

**The "disconnect", as told to him.** There is no error in the time gaps. Terah's death is worked out as
10 Feb 1921 BC, and like every date reckoned from the Flood it carries the Flood's range of 100 years
either way, so its latest is 10 Feb 1821 BC. The line he saw was his Died fact's place, with the same
death date printed two ways: once with its range ("from c. 1921 BC (2021 BC to 1821 BC)") and once
without ("until died (1921 BC)"). 1821 BC was the latest his death can be, not a date after it. With 23.5
and 23.7 both readings are gone. If he wants narrower dates everywhere, the range to change is the one on
The Flood's "Took place" fact; that is his to decide.

23.5 is one commit, 23.6 and 23.7 another. Tested on the test copy with throwaway markers at the PC size
and the tablet size (E-ink on); not checked on the Boox itself.

## 24. Conflicts that explain themselves (asked 27 Nov 2026, proposed, not built)

The user's words, with his export: "There are 3 conflicts. Attached is the json. I can't understand what
the conflicts mean. Please describe where the conflicts exist. Also how can we make the app clearer for
understanding where the conflicts exist so I don't have to go to you everytime."

**What his three conflicts were** (worked out from the export by a script that only reads it; the export
was not loaded into the app). One cause, on Terah: the time gap "Lived at Haran (from) = Terah · Born"
(meant for Ur), and "Lived at Ur" with its Until typed and anchored at 9 Feb 1921 BC. The Journey from Ur
to Haran copies both through time gaps of zero, so it sets out in 1921 BC and arrives between 2226 BC and
2026 BC. The panel listed: the Journey's Until before its From ("These cannot all be true"), and Abram's
and Lot's "Lived at Haran" before their births ("The most likely dates are out of order", twice).

**What made them unreadable** (the evidence for the changes below):

* The panel names the date where the clash shows, not the entry that causes it. All three opened the
  Journey, Abram or Lot; the fault was in Terah. "Correct one of the two in the marker" pointed at two
  boxes that hold no typed date.
* "Would have to be not before 9 Feb 1921 BC and not after 10 Feb 2026 BC (its own date)" does not say
  which two things disagree. One is the From, the other the Until's own latest; neither is named.
* It does not say where a date comes from. Both were reckoned through two steps from another marker.
* Three entries, one cause, and nothing says so.
* "The most likely dates" are dates he no longer sees anywhere else (since 23.5 a ranged date reads
  "between X and Y").
* Outside the panel only the one date box carries a mark; the marker lists show nothing.
* Correcting it by editing is close to impossible: when a chain loses its anchor, the dates left behind
  keep the old value as if typed and fill each other in again (the open 22.5). The only sure way was to
  remove the eight facts.

**Proposed** (each its own item; he still enters and corrects every date himself):

- [ ] **24.1 One sentence that names both sides.** Each entry is headed by the marker and fact, then says
      what clashes with both dates: "The Journey arrives before it sets out. From: 9 Feb 1921 BC. Until:
      between 10 Feb 2226 BC and 10 Feb 2026 BC." / "Abram · Lived Haran begins before Abram is born.
      Lived Haran, from: 10 Feb 2126 BC. Abram · Born: not before 10 Feb 2056 BC."
- [ ] **24.2 Where each date comes from.** Under each of the two dates, the steps back to what he
      entered, one line a step, with the tie's words and verse: "From ← equals Terah · Lived at Ur (until)
      ← typed there, anchored". Every line has an Open button that opens that marker with that fact open
      and the date box marked.
- [ ] **24.3 One cause, said once.** Entries whose steps end in the same entered date or pass through the
      same tie are grouped: "3 conflicts, 1 cause", the shared entry first, marked "start here".
- [ ] **24.4 A "What to do" line** for each kind, naming the marker to open (the cause, not the place the
      clash shows) and the two or three ways out (correct the date, edit or overrule the tie, untick the
      rule for that fact type).
- [ ] **24.5 Marks outside the panel.** A warning mark on the marker's name in Library → Markers and in
      the map's left list; on the fact line; and under the date box the same sentence as the panel, with
      "Show" opening the panel at that entry. A date that only carries someone else's clash says "wrong
      because of Terah · Lived at Haran" instead of looking like the cause.
- [ ] **24.6 A chain that loses its anchor goes blank** (the old 22.5). Without it the corrections above
      cannot be made by editing. Recommended with this section.
- [ ] **24.7 The second pass in his words.** "The most likely dates are out of order" becomes "Out of
      order going by the dates in the date boxes (the ranges still overlap)", and the entry shows the
      ranges as well as those dates.

Code: `showConflicts()`, `shutEntries()`, `autoText()`, `governText()`, `slotState()` in `js/relations.js`
(the steps of 24.2 are already there: follow `eBy` / `lBy` from date to date until an end that is the
date's own, then `Store.derivedInfo` for a reckoned date); the captions in `dateField` in `js/editor.js`;
`badgesHTML`.

**Found on the way: his corrections of 25 Nov came back.** His export of 25 Nov 17:05 had none of the
eight "Lived at" facts or their time gaps. The export of 27 Nov has all eight, with the same ids, and
Lot's Born typed and anchored again; the two ties he deleted at 17:16 and 17:17 stayed deleted. Removing a
fact drops its time gaps with no deletion record (`cleanReferences` in `js/store.js` filters them), and a
marker syncs whole, newest copy winning, while the solver stamps a marker as changed whenever it rewrites
a reckoned date. So another device's older copy can win. This is a reading of the code, not a proven
cause. Told to him 27 Nov; to be looked into on its own.

**The way out told to him:** on the PC remove the eight facts, empty the Journey's From and Until, then
empty Lot's Born (typed 2108 BC, 52 years before his father can be born; the other three hide it today).
On a copy inside the script: 3 conflicts, then 1, then 0. Not tried in the app.

## 25. The Gantt tab (asked 27 Nov 2026, built 27 Nov 2026)

The user's words: "Please make a new tab for a gantt chart where I can select a marker, or markers, and it
displays 'where and when', facts, and ties." This replaces 14.4 / design step E.

**The plan, as told to him before building:**

* A tab "Gantt" between Timeline and Library. Markers are chosen in the left panel as on the Timeline tab
  (add, move up and down, take off, clear all); the choice is kept on the device.
* One block per marker over a shared time axis: its lifetime (Begins to Ends) as the heading bar, then
  **Where and when** (one bar per place, the same rows as the list of that name), **Facts** (a bar for a
  fact with From and Until, a diamond for a single date), facts from other markers, and **Ties** (one bar
  per tie to another marker, from when it begins to when it ends). Each group has a tick in the left panel.
* **A date with a range or a window is never given a middle.** A bar is hatched from the earliest it can
  begin to the latest it can end, and solid where it is certain (from the latest it can begin to the
  earliest it can end). A single date with a range is a hatched bar and no diamond. In P6 terms: early
  start to late finish hatched, late start to early finish solid.
* **Time gaps and limits are relationship lines**, as in P6: an arrow from the date a tie starts from to
  the date it sets. A time gap is a solid line with its length ("+70 y"); a limit is a dashed line ("not
  before", "not after"). Drawn when both dates are on the chart.
* Beside every bar the dates in words ("between … and …"), so nothing has to be read off the axis. Tapping
  a row writes it out in full above the chart, with every time gap and limit on its dates.
* **Nothing zooms.** The span shown has its own buttons: Whole span, earlier, later, wider, closer.
* Works at the PC size and on the tablet upright with E-ink on (hatching and solid read without colour).

**Chosen without asking, easy to change:** hatched and solid as above; a fact that is also a place shows
under both Where and when and Facts; a fact or tie with no date is listed with no bar.

- [x] **25.1 The Gantt tab. Built 27 Nov 2026.** As planned, with these details:

* The left panel has the marker chooser, the chosen markers (move up, move down, take off, clear all) and
  five ticks: Where and when, Facts, Facts from other markers, Ties, Time gaps and limits. A marker's
  information has a new button, 📊 Gantt, beside 🕒 Timeline.
* Every row has two lines of words (what it is, and its dates as they read everywhere else) and its bar.
  Tapping a row writes it out above the chart with each time gap and limit on its dates, and two buttons:
  Information and Edit marker. Until a row is tapped that strip is the key to the marks.
* A fact whose Until is before its From is drawn as a red dashed bar (black dashes on E-ink), so a
  backwards fact is seen on the chart.
* A window with one end only ("after X") runs to the edge of the chart on its open side.
* A "not after" limit joins the latest of its two dates; a "not before" limit and a time gap join the
  earliest. That is how the late and the early dates are worked out.
* A fact that another chosen marker holds is not repeated under "facts from other markers".
* The year lines choose a round step (1, 2, 5, 10 … years) that leaves about seven on the axis. Adding a
  marker goes back to the whole span so the new one is in sight.
* The rows of "Where and when" are now worked out once (`UI.whereRows`) and used by both the list and
  the chart, so the two cannot disagree.

Not in it: the map slider's date as a line down the chart (the "data date" of P6); dragging the chart
sideways with a finger (the Earlier and Later buttons do it); printing. Each is a small addition if he
wants it.

Tested on the test copy with throwaway markers at the PC size and the tablet size (E-ink on), including
the largest letter size and dates BC; not checked on the Boox itself, and not seen with his own data.
