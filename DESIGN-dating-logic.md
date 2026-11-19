# Dating logic, modelled on Primavera P6

Design for approval. Nothing here is built. Agenda sections 12, 13 and 14 lead to this document.

Revision 2, 19 Nov 2026. The first draft gave every tie a "kind" (exactly, about, at least, at most,
some time). The user pointed out that this is unnecessary: a date already has an approximation with two
ends, and it is enough to be able to tie either end, or the date itself, to another date. This revision
is built on that. The calculation and its results are unchanged.

The dates in the examples belong to a throwaway Abram born in 2166 BC. They are there to show the
arithmetic, not to suggest a chronology.

## 1. The problem

A time gap today always means "this date equals that date plus a gap". That is right for "Adam was 130
when Seth was born". It is wrong for "they married some time after they were born", because:

* a gap of nothing "after Abram born" puts the marriage on the day he was born;
* a second gap "before Abram died" gives the marriage two competing answers and raises conflicts, one of
  them claiming that Abram's birth and death are the same date.

## 2. The idea

A date has three parts, as it does today:

| Part | Meaning | Box in the editor today |
|---|---|---|
| Earliest | it cannot be before this | Earliest |
| The date | the most likely, or the known, date | the date box |
| Latest | it cannot be after this | Latest |

Today only the date itself can be tied to another date. The change is one sentence:

**Any of the three parts can be typed, or tied to another date, on the same marker or a different one.**

A tie is always the same thing: *this part = that date, plus or minus a gap*. A blank gap means the two
are the same.

| What you want to say | How you say it |
|---|---|
| Seth was born 130 years after Adam | the date ← Adam · Born, 130 years after |
| They married some time after Abram was born | Earliest ← Abram · Born |
| They married before Sarai died | Latest ← Sarai · Died |
| Sarai was at least 13 | Earliest ← Sarai · Born, 13 years after |
| It happened about 40 years later, 35 to 45 | the date ← 40 after; Earliest ← 35 after; Latest ← 45 after |
| Two things happened on the same date | the date ← the other date, blank gap |

"After" and "before" only say which way the gap runs. There are no kinds to choose.

**More than one tie on the same end.** The marriage must come after two births and before two deaths.
An end may carry any number of ties. For Earliest the latest of them governs; for Latest the earliest
of them governs. The one that governs is marked.

**Typed and tied together.** A typed Earliest or Latest counts as one more limit beside the ties. The
tighter one governs.

**Tying to a date that is itself approximate.** You do not choose an end on the other side. Your
Earliest follows the other date's earliest, and your Latest follows its latest.

## 3. In P6 terms

| Primavera P6 | Chrono Map |
|---|---|
| Activity (start, finish) | A fact with a date and an "until" date: a life, a stay, a journey |
| Milestone | A fact with one date |
| Relationship with lag | A tie on Earliest or Latest, with its gap |
| FS, SS, FF, SF | Which two dates are tied (from or until, on each side) |
| Start On or After, Finish On or Before | A typed Earliest or Latest |
| Mandatory Start | An anchor (the lock) |
| Forward pass → Early date | Earliest |
| Backward pass → Late date | Latest |
| Total float | The width of the window between them |
| Driving relationship | The tie that governs each end |
| Negative float, loop | A conflict |
| Resources on an activity | People assigned to a shared fact (section 7) |

Left out on purpose: calendars, WBS, baselines, resource levelling.

One deliberate difference. P6 schedules every activity at its early date. History may not: a marriage
that could fall anywhere in a 65-year window has no date, only a window. Chrono Map shows the window
and invents nothing.

## 4. The calculation

1. A typed, anchored date has an Earliest and Latest equal to itself.
2. **Forward pass.** A tie on Earliest pushes it up to the other date's earliest plus the gap.
3. **Backward pass.** The same tie also works the other way: if the marriage is not before Sarai's
   birth, then Sarai's birth is not after the marriage. You enter a tie once; both ends learn from it.
4. The passes repeat until nothing moves.

What is shown for a date:

| Situation | Shown as |
|---|---|
| Typed, or reached from an anchor through ties on the date | the date, as today |
| Bounded on both ends, no date | "between 2156 BC and 2091 BC" |
| Bounded on one end only | "after 2166 BC" or "before 2029 BC" |
| No anchor anywhere in its chain | "not yet anchored", as today |

The window goes into the Earliest and Latest boxes that already exist, shown as reckoned (as tied dates
are shown now). So the map and the Timeline need no change to understand it: the map shows the marker
across the window at the reduced strength already used for approximate dates.

**Conflicts.** A conflict is a window that has closed: the earliest is later than the latest. P6 calls
it negative float. The Conflicts panel names the governing tie at each end, so the choice is which of
the two to correct. Ties on the ends never weld two other dates together, which removes the false
"born = died" conflict.

## 5. The two cases, worked

Typed: Abram born 2166 BC (anchor). Ties on dates: Abram lived 175 years; Sarai is 10 years younger;
Sarai lived 127 years; Abram left Haran aged 75.

**The marriage**

| Ties on the marriage | Window | Earliest governed by | Latest governed by |
|---|---|---|---|
| Earliest ← Abram born | after 2166 BC | Abram born | nothing |
| + Earliest ← Sarai born; Latest ← Abram died; Latest ← Sarai died | 2156 BC to 2029 BC | Sarai born | Sarai died |
| + the journey below | 2156 BC to 2091 BC | Sarai born | leaving Ur |
| + Earliest ← Sarai born, 13 years after | 2143 BC to 2091 BC | Sarai born + 13 | leaving Ur |
| a typed marriage date of 2200 BC | conflict | Sarai born, 2156 BC, is after the typed 2200 BC | |

The first row is what you saw: one tie leaves the far end open. The second row answers your question:
ties on the other end close it. All four are entered in one dialog and show as one line on the fact.

**Ur to Haran, Genesis 11:31**

One fact with a from date (left Ur) and an until date (reached Haran).

| Tie | Entered as |
|---|---|
| They left Ur already married | from date: Earliest ← Abram · Married |
| They reached Haran before Abram left it | until date: Latest ← Abram · left Haran |
| They arrived after they set out | built in |

Result: left Ur between 2156 BC and 2091 BC; reached Haran between 2156 BC and 2091 BC. The marriage's
Latest drops to 2091 BC without anything more being entered, because the first tie works backwards too.

## 6. Screens

**The tie dialog: several ties at once, one source**

```
Ties for   Abram · Married Sarai

  Part        Gap (blank = same)          Other marker    Which date
  [Earliest]  [   ] y [  ] m [  ] d  [after ]  [Abram ]   [Born  2166 BC]   ✕
  [Earliest]  [   ] y [  ] m [  ] d  [after ]  [Sarai ]   [Born  2156 BC]   ✕
  [Latest  ]  [   ] y [  ] m [  ] d  [after ]  [Abram ]   [Died  1991 BC]   ✕
  [Latest  ]  [   ] y [  ] m [  ] d  [after ]  [Sarai ]   [Died  2029 BC]   ✕
  + Add another tie

  For all of these:
  Source [ Genesis        ]   Verse [        ]   Confidence [        ]
  Note   [                                                          ]
  Result: between 2156 BC and 2029 BC                 [ Save 4 ties ]  [ Cancel ]
```

* The source, note and confidence are typed once and saved on every tie in the dialog.
* Each row can take its own verse when it differs; left blank, it uses the shared one.
* The other marker defaults to the fact's own marker, as now.
* The result line updates as rows are added, before anything is saved.
* The dialog opens from the chain button beside the date, the Earliest box or the Latest box. It starts
  with one row for the part you opened it from.

**In the editor**, the fact shows its three boxes with what feeds each:

```
Married Sarai
  Earliest  2156 BC  ⛓  Sarai · Born   (also: Abram · Born 2166 BC)
  Date      (none)
  Latest    2091 BC  ⛓  Terah · Moved to Haran, worked backwards   (also: Sarai · Died 2029 BC, Abram · Died 1991 BC)
  window 65 years                                                       [ Ties… ]
```

The information panel and the Timeline show one line: "Married · between 2156 BC and 2091 BC".

**Library → Time gaps** gains a Part column, and a filter for gaps of nothing on a date, so earlier
workarounds can be found and moved to Earliest or Latest with one tap each.

## 7. People assigned to a fact (the journey)

P6 assigns resources to an activity. Here, a role in a fact type gets one new tick: **they go there
too**. A fact type such as "Moved to", entered once on Terah with the place Haran and the role "Took
with him" naming Abram, Sarai and Lot, then:

* moves all four pins from Ur to Haran across the fact's dates;
* carries one set of ties, one source and one verse;
* appears on each of the other three as a line that says it comes from Terah's fact.

The same tick works on an Event marker, for a journey or a battle that deserves a marker of its own.
Two optional detail boxes, "From" and "Bound for", record Ur and Canaan.

## 8. What happens to existing data

* Every existing time gap is a tie on the date and gives the same result as today.
* An existing approximate gap (smallest and largest) keeps working. It is the same as a tie on each end.
* Nothing moves until a tie is put on an Earliest or Latest.
* Syncing is unaffected: a tie is the same record with one more field, the part. Both devices need the
  new version before ties on ends are entered.

## 9. Build order, one commit each

| Step | What | Depends on |
|---|---|---|
| A | The calculation: ties on Earliest and Latest, forward and backward pass, windows, conflicts | |
| B | The tie dialog with several rows and one source; the three boxes showing what feeds them | A |
| C | Lifetime rule (decision 2) | A |
| D | People assigned to a fact: "they go there too" | |
| E | Bar layout in the Timeline tab (decision 4) | A |

A and B together answer the marriage question. D with A answers the journey.

## 10. Decisions needed

| # | Decision | My recommendation |
|---|---|---|
| 1 | A date with only a window: show the window, or also a date in the middle | The window only |
| 2 | Lifetime rule: the app ties every fact on a person to that person's Born and Died by itself, and a Married or Had child fact to the other person's too | On, switchable per fact type, shown as reckoned |
| 3 | The journey: one shared fact with people assigned, as in section 7 | Yes |
| 4 | Bar layout in the Timeline tab, like a P6 Gantt chart | Later, after A to D |
| 5 | A date bounded on one end only: off the map, or shown from its earliest date | Off the map |
| 6 | Verse in the tie dialog: one for all rows, or one per row | Shared, with an optional verse on each row |

Decision 2 is the one with a cost either way. On: four fewer ties to type per marriage, and a child
born after a mother's death is caught at once. Off: every limit on the page is one you entered
yourself. The rule adds no markers and no ties between people; it only bounds dates.
