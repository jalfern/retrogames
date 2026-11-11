# STATE — session 228 (2026-11-11, slot b)

## What shipped
**SMASH TV: THE ANNOUNCER joins the pan board** merged as `a9d6881` (PR #2027,
Closes #2024). The #2007 residue is gone: `BIG_ROOMS` covers rooms 0–8, so the
whole show — finale included — boards 24 cells across. The removed camX pin was
replaced by a stronger law: **THE HOST LAW** — the boss paces the middle of the
*live camera window* (sim computes the same cast-midpoint the renderer pans to;
bounds `[cam+48, cam+208]`, snap-and-flip containment so he holds it even when
the shot slides faster than his 0.7 pace), and opens deterministically
centre-stage at cell (gw/2, 2). He is TV; the camera never loses him.
Wide boards then exposed a planner bug the narrow finale never hit: a
chase-runner wedged into chrome exactly ON the 42px flee threshold, so seat 1
fled-when-close/walked-back-when-not and fired past the pinned camera for 56k
ticks (seed 1 deathless but frozen). **The PIN-SHOT LAW**: the planner tracks
per-seat stillness of its threat; a chaser unmoved 30 ticks is scenery — no
fleeing, walk the lane onto it, let the shot land (planner.js `pinned()`).
Gates: smashcheck 575 PASS + full mutant sweep (18/18, incl. new host-law and
finale-off-board mutants; two pre-#2024 anchors retired — the "ANNOUNCER
widened too" mutant is now the truth, its slot guards the new law). Pilot 9/9
seeds, seeds 1/5/7 deathless, slack wins, co-op 9/9. smashplay 28/28 (+4
room-9 pixel gates: finale wide, centre-stage open, crown renders, host framed
56..208 across clamp-to-clamp slides). watchcheck smash-tv 269/269. Lint
gates + build green. README VARISIZE rewritten; honest-gap bullet CLOSED.
Filed `QA — SMASH TV: finale-room polish pass` (#2028, feedback).

## The session's catches
- **A freeze isn't a stall.** Seed 1's 56k-tick freeze never tripped the stall
  detector — the hero was *oscillating* at the flee boundary, moving every
  tick. Sample state periodically during suspected freezes; `stall` counters
  only catch pinned-down, not limit cycles.
- **LOS is the wrong reachability test.** "Flee chasers that can reach you"
  implemented as line-of-sight still flees a chaser wedged in chrome. Motion,
  not sight, is the discriminator — and the pre-existing #508 comment already
  said it; the code just didn't.
- **Mutant anchors are code-adjacent documentation.** Widening the whole show
  silently invalidated two levels mutants (anchor lines gone → "anchor missing"
  FAILs, not caught/survived). When you evolve a law, sweep `--mutate` lists
  for its anchors in the same PR and retire/reverse them.
- **Ghost slot-collision handled per namespace law**: #1637/b28 lived on as
  another live session's (checkpoint 17:06Z while I claimed); picked #2024
  instead, used :5179 (5178 held), never touched their ports/processes.
  My claim line collided once with an API-flake "yielding to ''" — answered
  with a correction checkpoint, kept building.

## Ladder trail
TARGET #2021 refused at claim (live slot-a holder). `next` #1711 skipped
(Jon's 13:50Z audit: S1 needs no more confirm passes until the binding is
posted). #1637 avoided (occupied by live b-named session). QA-borrow refused
(QA MASTER pid live). flagshipStage null (all flagship gaps closed).
NEVER-DRY → SMASH TV, weakestStage 7 (3 open QA feedback #2011/#1978/#1950 +
4 unowned README gaps) → oldest unowned gap #0 → issue #2024 filed, claimed,
shipped. No jonq filed (all pattern-following).

## Open questions
- none from this lane (see waiting-jon issues; #1711 hardware, #2016 lane:qa).

## Next
- SmashTV remaining honest gaps (README): 8 weapons→4 (no homing/flamer),
  stylized bonus civilians, softened one-hit death; plus QA #2028's finale
  feel items (fan readability on 24 cols, off-camera add spawns — a
  screen-edge cue is probably genuinely needed; a candidate stage of its own).
- Other open SmashTV QA feedback: #2011 (pan readability six rooms), #1978,
  #1950 — QA lane's board, not builder lanes' (#1637 doctrine).
- b29 candidates for #1637 (watch rollout): see session 227's list — take
  only titles with a PROVEN driver; honor the b28 watch-chrome laws.
- Dev servers: slot b :5179 stopped at exit (:5178 held by the other lane —
  check before assuming it's yours). `--mutate` only in an exclusive window
  >=20 min; restore from git, never sed.
