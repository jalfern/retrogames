# STATE — session 191 (2026-11-10, slot a)

## What shipped
**COMET DRIFT HD: per-course start structures completed** — squash `185316c`
(PR #1869, closes #1867). Never-dry stage (#1571): `weakestStage` scored
COMET DRIFT GP 5 (3 unowned README gaps + 2 feedback naming it; BombDefuse
held by QA's #1831, #1637 held by slot b). HD answered every landmark but
Sandbank's gantry with the Gulch arch. Now `buildArch` dispatches all four:
`buildDune` sculpts the SAME `art.js` `duneCrest` law into a 26u ridge with a
road notch cleared by the live wall law; `buildWindmill` = GP's sprite in the
round (lattice tower, 20 X-braces, named `windmillWheel` with 8 sails, tail
vane, pad) beyond the wall line, wheel turning off `g.tick` (presentation-only,
sim/stateHash untouched). Evidence: cometdrifthdcheck 460 pass with 29 new pins
(vertex-for-vertex equality vs art.js recomputed, notch clearance 0 intruders,
all-four-distinct 1/6/13/50 parts, determinism); `--mutate-dune` dies 8,
`--mutate-windmill` dies 12; cometcheck GREEN; lint:hd/mario/fps/ai + build
green; browser drive zero page errors, windmill + dune seen in screenshots.
Prod: chunk `index-C0xHIZ_H.js` carries `windmillWheel`.
Live: https://jalfern.com/retrogames/comet-drift-hd

## Session bookkeeping
- TARGET #1637 REFUSED at claim (b held it live, 16 min) — normal ladder: no
  halt/steer/game-queue, #1711 re-verified hardware-gated (b's checkpoint:
  code-complete, gated on Jon), QA MASTER live (no feedback borrow), flagship
  spent → weakest rung → filed + claimed #1867.
- **Rode #1865 (first commit `bd066cd`):** HD audit called `bandContext()`
  without the id #1498 added — passing `T.id` + honest-null gate un-crashed
  the suite (frozen at :587 since Nov 3). #1865 STAYS OPEN for QA: the
  unmasked run revealed more than a crash — the recomputation mirror still
  pins the PRE-#1498 law (`max(170, min(w, R·0.8))`) while #1513 rewrote
  `wallLatAt` to the evolute cap `max(48, Rloc−48)`; live hairpin walls read
  **49px vs ROAD_R 96px** (cliff foot crosses the kerb through Corkscomb's
  triple-apex signature; sim agrees, no pass-through, but render-correction
  needs a QA/studio call). Documented fully on #1865. The 4 remaining
  cometdrifthdcheck FAILs are exactly these.
- Housekeeping that rode along: `gantrymutat` was missing from the mutant
  exit-code line (--mutate-gantry reported survival/failure inverted). Fixed.
- No jonq filed (nothing taste/priority that isn't already on #1865).

## Next queued (slot a)
1. Fresh `weakestStage` — GP README now has 2 counted gaps ("strata are
   texture bands… accepted", banking-cue-shipped); if CometDrift still wins,
   gap 0 is the ACCEPTED strata limitation — honest move is README redress
   (mark shipped/accepted items CLOSED), but a docs-only change is not a
   stage: better to look at CometDrift's real debts (README: power-up
   "items" — the #419 list's other child — is the biggest unowned gameplay
   debt on the title; needs an issue of its own) or let the wheel pick the
   next title. Re-check `#1764` MagicCarpet caution and #1637 liveness first.
2. #1637 WATCH batch: b claimed batch 14 (SONAR + BOULDER DASH) — take the
   roll only if it's free AND b's slot isn't resuming it.

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-comethd-landmarks` = detached at
  `185316c` (post-merge), node_modules symlinked; reuse:
  `git checkout -B forge/<newslug> origin/main`.
- Dev server 5173 stopped at session end.
- `lint:hd` (package.json) covers CometDriftHD + HD scripts — cheap gate, use
  it for HD work. The 4 stale-law FAILs will follow any hdcheck run until QA
  redresses #1865 — check the gate NAMES, not just the summary.
- Landmark pattern for future per-course ports: branch on `T.landmark` inside
  `buildArch`, name moving parts for the loop, compute placements from
  `wallOffSideAt(0, side)` (never hard-code offsets), add one mutant per
  new dispatch line.
- Vercel deploy lands ~4 min after merge; prod grep must follow redirects
  (`curl -sL`) and search the ROUTE chunk (entry only carries registry copy).

## Open questions
- None. (#1865's law-floor question is QA's board; nothing new for Jon.)
