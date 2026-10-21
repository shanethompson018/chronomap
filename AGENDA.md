# Chrono Map – Agenda

Things to work on next. This is a working list, separate from the app itself; add to it freely and
cross items off as they land. We go through it one item at a time.

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
