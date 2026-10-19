# Chrono Map – Agenda

Things to work on next. This is a working list, separate from the app itself; add to it freely and
cross items off as they land. We go through it one item at a time.

## 1. Approximation

Going through these in order:

- [ ] **1a. Approximate times.** Dates and relation gaps that are not exact: "about 40 years",
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
      - Open: how a range shows on the map (under discussion: show the marker through the whole range,
        two copies if two ranges overlap; exact-dated facts versus approximate ones at the same moment).
- [ ] **1b. Approximate areas and locations.** Country boundaries that are only roughly known; where a
      person was at a time when the text gives a region rather than a place ("in the land of Nod").
- [ ] **1c. Approximate ties.** Ties that are likely but not certain, or whose dates are rough.
- [x] Date relations (fixed gaps, pinned vs computed, conflicts, undeterminable) – built 19 Oct 2026.

## 2. Grading of information (name to be decided)

- [ ] A grade on every piece of input (dates, positions, areas, ties, fields, sources) saying how far it
      can be trusted. Name still open: credibility, reliability, certainty, veracity, probability,
      validity. Levels to be decided. To be discussed alongside the approximation items, since
      "approximate" and "uncertain" overlap.

## 3. Markers

- [ ] **Areas.** What areas and borders should be able to do beyond the current draw-a-shape: changing
      shape over time more easily, labels inside the area, relations between an area and the people and
      events inside it, areas following a person (a kingdom's extent at a ruler's death), importing real
      border data. Overlaps with 1b.

## 4. Fields and ties

- [ ] **Combining fields and ties.** A field that names another marker ("Father: Adam") could be a tie,
      and a tie could appear as a field in the info bubble. One model so the same fact is not entered
      twice; how category field lists and link types relate.

## 5. Points, areas and routes attached to fields and ties

- [ ] Today a position, area or route is a stand-alone thing on a marker. Idea: attach them to the field
      or tie that states the fact ("lived at Haran" carries the point; "ruled Judah" carries the area;
      "fled to Egypt" carries the route), so a place is not entered twice and the map shows where a fact
      happened. To be discussed when we reach it; overlaps with 3 (Areas) and 4.
