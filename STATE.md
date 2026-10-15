# STATE — 2026-10-14 (forge session, GAUNTLET shipped)

## Shipped this session
**GAUNTLET** (#237) — PR #273, squash-merged at `3a7a262`, live at
https://jalfern.com/retrogames/gauntlet. First-person raycaster dungeon
crawl: 4 pillar-hall mazes, 4 heroes, drain/food economy, slam doors, keys,
generators (grunt/ghost/demon/sorcerer/lobber), screen-clear potion, Death on
the treasure timer, side map + narrator strip, hero select, attract replays the
autopilot's deathless full-quest run (seed 2). All art/audio synthesized.
Fidelity call: issue said "top-down"; the cabinet is first-person and
AGENTS.md's ruling wins — recorded in the PR + game README.

Gates: `lint:gauntlet` + `gauntletcheck` (48 checks) + `--mutate` (5/5 die)
wired into CI `static`. Advisory `scripts/gauntletplay.mjs` 11/11 in a real
browser (start→play→die→restart, zero page errors). QA polish filed as **#275**.
Also shipped post-merge by the other machine: Dig Dug polish #274 (`a4ab034`).

## GOAL — next session
**QA — GAUNTLET polish pass, issue #275.** Claim with a comment
(`FORGE-QA: claimed …`), work top-to-bottom, small PRs (one item ≈ one PR),
each gated by `npm run lint:gauntlet && npm run gauntletcheck` (add checks for
new rules; keep all 48 green + 5 mutants dead). Priority:
1. #275 items 1–2 (14px sprites w/ wobble, two-tone brick walls) — ART.md bar.
2. Items 6–8: CPU partner default ON + opens slam doors; human 2P (WASD+F,
   desktop); minimap shows seen monsters + stairs pulse.
3. Items 3–5: generator pulse/telegraph, HP-low vignette, narrator per-line
   buzzes, stairs fanfare.
Don't touch mechanics the harness proves; if polish tempts a rule change,
it goes to Jon first.

If #275 is already claimed: claim the oldest open `game-queue` issue —
#239 SmashTV, #241 Out Run, #245 Lunar Lander, #246 Tempest.

## Board
- Open QA: #275 (Gauntlet), #270 (SimCity), #269/#220-adjacent (Kart),
  #268 (attract one-message — mostly done via #267), #265 (Marble polish),
  #263/#258 (Bubble Bobble), #227 (arcade fill-crisp, in flight by other lane).
- Queue: #239, #241, #245, #246.
- Other lanes active on the mini: qa/arcade-fill-crisp, qa/sentinel,
  fix/mobile-stick-inverted, flame-centre (SimCity). Check `gh pr list`
  before starting anything in those areas.

## Housekeeping done
Pruned worktrees `retrogames-forge-digdug` + `retrogames-forge-marble-madness`
(both merged); deleted stale `forge/digdug` local+remote. Forge worktree
`retrogames-forge-gauntlet` remains at detached `origin/main` — reuse or
remove before the next forge lane.

## How Gauntlet is built (pointer, not a tutorial)
`src/games/Gauntlet/`: `levels.js` (char-grid mazes, keys always outside locks),
`sim.js` (pure `step`, seeded LCG, `blocked()` asked by every walker),
`planner.js` (objectives food→keys→stairs; engage close/aligned only —
never chase across the maze), `art.js`, `index.jsx` (DDA cast + z-buffered
billboards). README has the fidelity notes + honest gaps.

## Three questions for Jon
1. **L4 economy:** endless-world generators are capped at 5 alive so the
   autopilot can prove a win — arcade L4 is a meat-grinder. Keep the cap
   (provable win) or raise it and accept a pilot that "wins" by attrition?
2. **Partner default:** issue body implied ON; we shipped OFF (CPU hero takes
   food). #275 proposes default ON for phones — confirm?
3. **Attract demo:** ours is the deathless showcase loop; Marble's showed
   the hero taking hits for drama. Which house style do you want?
