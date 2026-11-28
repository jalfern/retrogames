# STATE — forge board snapshot (slot a, 2026-11-28 — ponds everywhere shipped; Lemmings water gap closed)

## This session (slot a) — the never-dry rung, taken and shipped
- Normal ladder dry, verified honest: halt/steer 0; `next` #1712 waiting-jon →
  skipped; game-queue empty; feedback QA-held (#3860) or waiting-jon
  (#3244/#2971); QA MASTER live → no borrow; flagship ladder spent.
  `idle-kick` → `KICK LEMMINGS-LITE 0 weak` — same target the slot note carried.
- Filed POLISH #3859, shipped PR #3861 → squash `1c9488f`: **ponds everywhere**.
  THE DOOR & THE LEDGE voids got shores of open water at the walking row (the
  punishing east walk now ends in the drown — splash/sink/tone — not a silent
  splat below the map); THE SPIRE got its second body (a bay east of the exit
  plinth); THE MASSIF got west-foot water taxing the pace-ground, and ships a
  second BLOCKER because the solver *spends* one at the new rim (slack rule).
  Rule change in `candidates()`: WATER at foot level reads as floor-gone → the
  solver/attract/autopilot can block a pond rim (stock original play); blocker
  footing must be `solid`, CLIMB stays AIR-only. Flowing water declared out of
  scope by fidelity (Lemmings 2 mechanic) — restated as a `**DISCLAIMER**`
  bullet in PR #3862 (`fe88741`) so parseGaps declines it (I'd seeded a
  phantom +1; #3074 class, fixed same session).
- Proof: lemcheck 191/191 (+13 pins) + `--mutate` 213/213; hand drifts ×3
  red→restore — revert the edge rule → **10 FAIL incl. THE LEDGE unwinnable**
  (its rim IS water now: the rule is load-bearing on shipped levels, not just
  synthetic pins); drain DOOR shore → its 5 pins red; drain bay → its 1 pin
  red. Chrome: lemplay 41/41 + water drive 10/10 on :5173 (SPIRE's two bodies
  paint #2f7fb8, idle crowd drowns west pond in play, `?seed=2` DOOR shore
  paints and bounces drown 0→2), zero page/console errors. Gates+build green.
- Prod verified by behaviour, not hash: bay pixel #2f7fb8 live at
  https://jalfern.com/retrogames/lemmings (zero pre-fix).

## BOARD facts at close
- main tip `fe88741` (my docs follow-up; game squash `1c9488f`). Slot b
  shipped FROGGER ease mid-session (`1c05b24`, #3854). Rule-4 streak: reset.
- building: none. building-qa: **#3860 QA — DEFENDER** (QA lane inside — never
  touch). game-queue: empty. halt/steer: 0. #3841 (lemplay flake) open,
  platform lane's.
- jonq: #3791 AWAITING (deadline 11-29), #3516 AWAITING (default `done` at
  its sweep ~11-28 12:35Z). Let the sweeps take them; do not re-file.

## PLAYABLE on main right now
- LEMMINGS-LITE with water everywhere: https://jalfern.com/retrogames/lemmings
  (ponds on all four boards; falls past 3 tiles kill; the drown's splash+sink
  answers the east voids; blocker at the pond rim is now the solver's play).
- FROGGER eases at level six; OH NO! cry; MINESWEEPER marquee; THE BARD'S
  TALE; PINBALL; SMASH-TV; KOI demo.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title — AWAITING, deadline 11-29),
  #3516 (Arkanoid texture rung — AWAITING, defaults done at its sweep).

## Next claims (for whoever is free)
1. Lemmings' 3 real unowned gaps (verified by parseGaps, post-disclaimer):
   **BUILDER** is oldest and the honest next claim but needs a full multi-session
   run — placed-cell planks + solver search-space + re-solve/redesign of all
   four levels (sized on #3853: 1–2 days; first legitimate WIP-branch title:
   push a draft PR early, keep `building`, checkpoint per commit).
   **blocker-wake** is the medium alternate (levels assume permanent blocks →
   lands with a re-solve). **float-while-dig** needs a dig-model rethink (the
   horizontal tunneler contradicts it — a design question, not a stage).
2. idle-kick will likely keep naming LEMMINGS-LITE (3 gaps = weakest shelf).
   Four kicks in a row on one title is legal but consider spread: the next
   weakest have ~0 gaps; BUILDER's size is the real constraint, not the pick.
3. #3516/#3791: let the sweeps take their defaults.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh`; no other lane's port touched.
- Worktree `retrogames-forge-lemmings-ponds` pruned (clean; node_modules
  symlink unlinked first). Main checkout detached at `origin/main` = `fe88741`.
- STATE committed to main (step-9 allowance: the forge game merged).
- Harness facts worth keeping: (a) the over screen only yields to a key after
  ~900 ms and `startPlay` resets to level 0 — drive a specific level with
  `?seed=N`, not by cycling attract. (b) `parseGaps` declines `**DISCLAIMER**`
  /`CLOSED by #` bullets — restate any fidelity ruling that way or it seeds a
  phantom kick (I shipped the bug and fixed it in the same session, #3862).
