# STATE — forge board snapshot (slot b, 2026-11-28 — fatal-fall rule shipped; never-dry rung consumed)

## This session (slot b)
- **SHIPPED: LEMMINGS-LITE fatal falls (#3849 → PR #3850, main `047c13b`)** —
  never-dry stage. `CFG.maxFall` 7 → 3 (the original kills past ~3 tiles): falls
  off the spire kill, FLOATER earns its charges. THE SPIRE's east stair ended
  ~6 tiles above the floor (the old lax value hid an unsolvable-by-new-rule
  drop) — carved to ground, re-solved: win 4/4, climb load-bearing, slack holds
  at climb 5; MASSIF/DOOR/LEDGE proven unaffected at 3 (pre-claim measurement).
  Fall pins made **absolute** (4 tiles must die; short falls land ≤3 — the old
  pin read `CFG.maxFall+1`, green even at 7, drift-proofing hole #1) + drift
  mutation `maxFall=7` in `--mutate`. lemcheck 157/157, mutate 179/179,
  hand-drift proof red→green, lemplay 41/41 on :5178, gates+build green.
  Live: https://jalfern.com/retrogames/lemmings (chunk `Lemmings-CgSqWSPI.js`).
- Ladder run honest first: halt/steer 0; `next` #1712 waiting-jon; game-queue/
  building empty; feedback #3244/#2971 waiting-jon; QA MASTER live → no borrow;
  flagship ladder verified spent (all six flagship READMEs gap-free via
  idle.mjs, not memory). Warden kick named LEMMINGS-LITE — honest score was 6,
  not the kick's 0 (the 0 is the #3825-style phantom again; the title really
  was weakest anyway).
- Deviation from oldest-gap (BUILDER) per #3844 precedent, recorded on #3849:
  BUILDER needs placed-cell geometry + solver re-work; slot-a said size it
  before claiming. It stays the oldest gap for whoever has a full slot.

## BOARD facts at close
- main tip `047c13b`. Rule-4 streak: reset (game code merged).
- building: none. building-qa: **#3851 QA — MOMENTUM RUNNER** (QA lane is
  inside that game — never touch). game-queue: empty. halt/steer: 0.
- feedback open: #3851 (held by QA), #3244, #2971 (both waiting-jon).
- QA MASTER live (pid at open: 26880).
- #3841 (lemplay timing flake, advisory) still open, platform lane's.

## PLAYABLE on main right now
- LEMMINGS-LITE — falls past 3 tiles KILL, five skills, ponds drown, floaters
  parachute: https://jalfern.com/retrogames/lemmings
- OH NO! death cry on every corpse; DK fire oil; MINESWEEPER marquee;
  BUBBLE BOBBLE attract hint; POLARITY/MISSILE BATTLE clean chrome.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title? — AWAITING, deadline 11-29;
  default = hold shelf, ship only what Jon or QA files).
- #3516 (Arkanoid art rung — AWAITING, defaults done tonight ~12:35Z).

## Next claims (for whoever is free)
1. LEMMINGS-LITE attract-parachute — cheapest unowned gap now (attract shows
   4 skills, the game offers 5). Then size BUILDER against the solver before
   claiming (placed-cell geometry, re-solve all levels); blocker-wake needs a
   re-solve too (levels are designed for permanent blocks).
2. Lemmings' 5 unowned gaps left: BUILDER, blocker-wake, float-while-dig,
   attract-parachute, static-water. If both builder slots keep hitting
   Lemmings, spread by taking the next-weakest title instead (#1571 ties go to
   registry order, but never-dry already consumed two kicks on this title).
3. #3516 default fires tonight; #3791 tomorrow. Let sweeps take them; do not
   re-file.

## Slot state at handoff
- :5178 stopped via `scripts/devstop.sh`; no other lane's port touched.
- Worktree `retrogames-forge-lemmings-fall3` pruned by mergeclean (it was
  clean); main checkout detached at `origin/main` = `047c13b`.
- STATE commits to main (step-9 allowance — forge game merged this session);
  parked slot-scoped via `statepark.mjs park b` right after writing.
- Harness fact worth keeping: Lemmings is lazy-loaded — prod bundle polling
  must grep `Lemmings-<hash>.js` (from the index's import map), NOT the index
  chunk; `maxFall` appears nowhere in index-*.js.
