# STATE — session 222 (2026-11-11, slot b)

## What shipped
**THE CAST OF SIX** merged as `74d9b76` (PR #1999, Closes #1997 — NEVER-DRY
pick, weakestStage score 9 = 8 QA feedbacks naming PPM + 1 unowned README
gap; TARGET #1637 REFUSED at claim — slot a holds it, 29 min). The neighborhood
grew from four to six: SONYA MALAK (F38, freckles mark, scarf+earring — two
decor families) and TADEK HRUBY (M62, grey hair — his honest photo carries the
same grey so the aged-photo trap can never point at a regular — glasses, gap
tooth, forehead-bandage mark), authored end to end per the #1979 template.
Every regular now has PERSONAL SPEECH (`lines {greet, again}`): first walk-up
of a week greets, the return answers, the arc turn keeps the canonical Jorji
pair. `say` purity widened from the arc day to EVERY day of every seed.
THE ROTATING WINDOW (the session's design keystone): widening `mod 4`→`mod 6`
naively makes each seat walk ONCE per 6-day span — recurrence dies, and the
arc (firstVisit+4) convicts a face that isn't at the counter. Fix: each week
meets `cast[s..s+3]` (mod 6) on days 2-5, seats s, s+1 RETURN days 6, 7;
arc = cast[s] turning day 6. Two recurrences/week and the day-6 arc stand;
seed 0's week is byte-identical to the old walk (every fixture replays); seed
4 puts Sonya on the wanted wall. marks freckles/patch paint in ink #8f4a3e at
disjoint rows (freckles 58-67 below the scar window; patch 26-29 above the
wrinkle window and clear of the glasses rim). paperscheck **13936/13936 + all
32 mutants die** (new m33 frozen rotation — only sweep-wide seatsWalked sees
the new faces vanish; m34 muted greets; m29 re-anchored to the grown callback
line; new witnesses: speech-shape per appearance, 12 distinct authored lines,
window law/week, seatsWalked no-dead-seats, arc-seat coverage, bubble-fit
scan over every line). papersplay **73/73**: seed 0 Grubak greets (bubble
5647px, strangers 0px), seed 4's live week real-keys: Sonya approves day 2
(scarf hat 980px, gold 9px), Tadek day 3, day-6 sheet carries SONYA's number
(real deny scores), day 7 Tadek says "YOU LET ME THROUGH."; castPix counts
all six marks (freckles 12px, patch 24px). Live:
jalfern.com/retrogames/papers-please (content proof: entry `index-Bwhl0gsR.js`
→ chunk `index-Dgvy8XLC.js` carries `SONYA MALAK`).

## The session's catches
- **Naive cast-widening kills recurrence.** Days 2-7 are six slots; a 6-seat
  cast with one regular/day visits each face exactly once — the in-week return
  and the arc's stage both collapse. Check any "grow the cast" plan against the
  recurrence arithmetic FIRST (seats vs slots), the fix was a window, not more
  regulars/day (that would move the queue-size law the shift clock rides on).
- **Gaps can self-close mid-sweep.** #1996 (filed last session for the crowd)
  does NOT own the fifth-and-sixth-regulars gap (ownsGap needs the gap's
  opening words) — verified before claiming, so the NEVRDRY pick was honest.
- Grey-haired regular + aged-photo trap: safe because photo===face at birth
  (hairC GREY rides into his photo); the trap only ever greys a ROLLED face
  whose live hair is dark. Commented in gen.js.

## Ladder trail
- halt none; steer none. TARGET #1637 REFUSED at claim (slot a, newest 29 min
  — it is slot a's b26 build; do not fight it). #1711 stays released (Jon-side
  R2 hardware). game-queue empty; QA MASTER live (pid on studio) → feedback
  borrow refused; flagship stage spent (SSX/Emberwood/COMET DRIFT HD/Myst
  gap-free) → NEVER-DRY weakestStage PPM 9 → filed #1997, claimed, shipped.
  No jonq filed (all decisions pattern-following).

## Open questions
- none (see waiting-jon issues; #1711 hardware waits on Jon).

## Next
- Slot b: fresh ladder at session start. If #1637 is still held by slot a's
  b26 watch, NEVER-DRY again — PPM README now carries two fresh honest gaps
  (multi-line dialogue threads; two-regulars-a-day needs a queue-law
  amendment) and QA owns #1996 (crowd polish: country flavor, breadth, bodies,
  one-off speech — do NOT duplicate it from a builder lane).
- Slot a: b26 exhaustive driver issue #1637 in progress (check its BUILD FLOOR
  comments before touching those titles).
- Dev servers: slot a 5173, slot b 5178. `--mutate` only in an exclusive
  window, ≥20 min; after a killed run grep every mutant fingerprint before
  trusting the tree (re-verified clean this session: 34/34).
