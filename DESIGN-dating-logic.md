# Dating logic, modelled on Primavera P6

Design for approval. Nothing here is built. Agenda sections 12, 13 and 14 lead to this document.

The dates in the examples belong to a throwaway Abram born in 2166 BC. They are there to show the
arithmetic, not to suggest a chronology.

## 1. The problem

A time gap today always means "this date equals that date plus a gap". That is right for "Adam was 130
when Seth was born". It is wrong for "they married some time after they were born", because:

* a gap of nothing "after Abram born" puts the marriage on the day he was born;
* a second gap "before Abram died" gives the marriage two competing answers and raises conflicts, one of
  them claiming that Abram's birth and death are the same date.

What is needed is what P6 calls logic: ties that only say what must come before what, and a calculation
that turns all the ties on a date into the earliest and latest it can be.

## 2. The model in P6 terms

| Primavera P6 | Chrono Map | Exists today |
|---|---|---|
| Activity (start, finish) | A fact with a date and an "until" date: a life, a stay, a reign, a journey | yes |
| Milestone | A fact with one date: Born, Died, Married | yes |
| Relationship with lag | A tie between two dates | only the "exactly" kind |
| FS, SS, FF, SF | Chosen by which two dates are tied (from or until, on each side) | yes |
| Constraint: Start On or After, Finish On or Before | A fixed "not before" or "not after" date typed on a fact | partly (earliest / latest boxes) |
| Mandatory Start | An anchor (the lock) | yes |
| Forward pass → Early date | The earliest the date can be | no |
| Backward pass → Late date | The latest the date can be | no |
| Total float | The width of the window between them | no |
| Driving relationship | The tie that sets the earliest, and the tie that sets the latest | no |
| Negative float, loop | A conflict | yes, reworked |
| Resources on an activity | People assigned to a shared fact (section 7) | no |

Left out on purpose: calendars, WBS, baselines, resource levelling, percent complete.

One deliberate difference from P6. P6 schedules every activity at its early date. History may not: a
marriage that could fall anywhere in a 65-year window has no date, only a window. Chrono Map shows the
window and invents nothing.

## 3. Ties

A tie joins one date to another. It has a kind:

| Kind | Meaning | Example | P6 equivalent |
|---|---|---|---|
| exactly | this = that + N | Seth born = Adam born + 130 years | relationship with lag and zero float |
| about | this = that + N, give or take | "about 40 years after" with smallest and largest | lag given as a range |
| at least | this is no earlier than that + N | married at least 13 years after Sarai was born | FS or SS with lag N |
| at most | this is no later than that + N | arrived at most 2 years after leaving | maximum lag |
| some time after | this is no earlier than that | married after Abram was born | lag 0 |
| some time before | this is no later than that | married before Sarai died | the same tie seen from the other end |

"Exactly" and "about" are today's time gaps and keep working unchanged. The other four are new.

A date may carry any number of ties. Every tie keeps its own source, verse, note and confidence, as time
gaps do now.

A fact with an "until" date gets one tie for free: its until date is never earlier than its from date.

## 4. The calculation

Every date gets a window: the earliest it can be and the latest it can be.

1. A typed, anchored date has a window of that one date.
2. **Forward pass.** Each tie pushes the earliest of the later date up: earliest(this) is at least
   earliest(that) + N. With several ties, the one that pushes furthest wins. That tie is the driving one.
3. **Backward pass.** Each tie pulls the latest of the earlier date down in the same way.
4. The passes repeat until nothing moves.

What is shown for a date:

| Situation | Shown as |
|---|---|
| Typed, or reached from an anchor through "exactly" ties | the date, as today |
| Reached through "about" ties | the date with its range, as today |
| Bounded on both sides, no date | "between 2156 BC and 2091 BC" |
| Bounded on one side only | "after 2166 BC" or "before 2029 BC" |
| No anchor anywhere in its chain | "not yet anchored", as today |

A window is written into the same earliest and latest fields that approximate dates already use, so the
rest of the app needs no change to understand it: the map shows the marker across the window at the
reduced strength used for approximate dates, and the Timeline places it at the middle of the window and
labels it as a window. A date bounded on one side only stays off the map, as undated facts do now.

**Conflicts.** A conflict is a window that has closed: the earliest is later than the latest. P6 calls
it negative float. The Conflicts panel names the two driving ties, so the choice is which of the two to
correct. A tie that leads back to its own start with no room left is reported the same way.

Limits never weld two other dates together. That removes the false "born = died" conflict.

## 5. The two cases, worked

Typed: Abram born 2166 BC (anchor). Exact ties: Abram lived 175 years; Sarai is 10 years younger; Sarai
lived 127 years; Abram left Haran aged 75.

**The marriage**

| Ties on the marriage | Window | Earliest set by | Latest set by |
|---|---|---|---|
| after Abram born | after 2166 BC | Abram born | nothing |
| + after Sarai born, before Abram died, before Sarai died | 2156 BC to 2029 BC | Sarai born | Sarai died |
| + the journey below (they left Ur already married) | 2156 BC to 2091 BC | Sarai born | leaving Ur |
| + "Sarai at least 13 years old" | 2143 BC to 2091 BC | Sarai at least 13 | leaving Ur |
| a typed marriage date of 2200 BC | conflict | earliest 2156 BC (Sarai born) is after the typed 2200 BC | |

The first row is your observation: one tie leaves the window open on the far side. The second row is the
answer to your question: a second tie does close it, once ties are limits. All four ties show as one
line on the fact.

**Ur to Haran, Genesis 11:31**

One fact with a from date (left Ur) and an until date (reached Haran).

| Tie | Kind |
|---|---|
| left Ur, after the marriage | some time after |
| reached Haran, after leaving Ur | built in |
| reached Haran, before Abram left Haran | some time before |

Result: left Ur between 2156 BC and 2091 BC; reached Haran between 2156 BC and 2091 BC. Every later tie
you find narrows both at once.

## 6. Screens

**The tie dialog** (today's Time gap dialog, with the kind added)

```
Abram · Married Sarai   is
  ( ) exactly    ( ) about    ( ) at least    ( ) at most    (•) some time
  [    ] years [    ] months [    ] days          (hidden for "some time")
  (•) after   ( ) before
  the date of marker  [ Sarai            ]
  which date          [ Born (2156 BC)   ]
  Source [          ]  Verse [        ]  Note [                         ]
  Confidence [      ]  Reason [                                         ]
```

**The logic list on a fact** (in the editor, replacing the scattered gap lines)

```
Married Sarai        between 2156 BC and 2091 BC        window 65 years
  Must come after
    Abram · Born           some time after      2166 BC
    Sarai · Born           some time after      2156 BC     ◀ sets the earliest
  Must come before
    Abram · Died           some time before     1991 BC
    Sarai · Died           some time before     2029 BC
    Terah · Moved to Haran (from)   some time before   2091 BC   ◀ sets the latest
  + Add a tie      + Not before a fixed date      + Not after a fixed date
```

The information panel and the Timeline show the one consolidated line, "Married · between 2156 BC and
2091 BC", with the driving ties in the hover text.

**Library → Time gaps** gains the kind as a column, and a filter for gaps of nothing, so earlier
workarounds can be found and switched to "some time after" with one tap each.

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

* Every existing time gap is an "exactly" or "about" tie and gives the same dates as today.
* Nothing moves until a new kind of tie is added.
* Gaps of nothing that were entered as a workaround stay as they are until you change them.
* Syncing is unaffected: a tie is the same record with one more field. Both devices need the new
  version before new kinds of tie are entered.

## 9. Build order, one commit each

| Step | What | Depends on |
|---|---|---|
| A | The calculation: kinds of tie, forward and backward pass, windows, conflicts | |
| B | The tie dialog and the logic list on each fact; consolidated line everywhere | A |
| C | Fixed "not before" and "not after" dates on a fact | A |
| D | Lifetime rule (decision 3) | A |
| E | People assigned to a fact: "they go there too" | |
| F | Bar layout in the Timeline tab (decision 5) | A |

A and B together answer the marriage question. E with A answers the journey.

## 10. Decisions needed

| # | Decision | My recommendation |
|---|---|---|
| 1 | Words on screen: P6's (FS, Early, Late, Total float) or plain ones | Plain words, with the P6 code shown small beside them |
| 2 | A date with only a window: show the window, or also a date in the middle | The window only |
| 3 | Lifetime rule: the app ties every fact on a person to that person's Born and Died by itself, and a Married or Had child fact to the other person's too | On, switchable per fact type, shown as reckoned, overridden by anything typed |
| 4 | The journey: one shared fact with people assigned, as in section 7 | Yes |
| 5 | Bar layout in the Timeline tab, like a P6 Gantt chart | Later, after A to E |
| 6 | A date bounded on one side only: off the map, or shown from its earliest date | Off the map |

Decision 3 is the one with a cost either way. On: four fewer ties to type per marriage, and a child
born after a mother's death is caught at once. Off: every limit on the page is one you entered
yourself. The rule adds no markers and no ties between people; it only bounds dates.
