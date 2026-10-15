# STATE — 2026-10-15 late-2 (forge session, GAUNTLET top-down + FOUR HALLS shipped)

## Shipped this session
**GAUNTLET top-down + FOUR HALLS rename** (#276) — PR #300, squash-merged at
`2d8c305`, live: https://jalfern.com/retrogames/gauntlet and
https://jalfern.com/retrogames/four-halls (prod bundle `index-OsEGMSCO.js`
verified to carry both routes). One PR, both issue items:
- Rename: first-person #237 build → **FOUR HALLS** (`/four-halls`), with the
  issue's HUD fixes — KEYS/LVL no longer overlap, level name centered on the
  narrator strip, panel GOLD line back inside the panel, opaque hero-select
  (no HUD ghosting), drain slowed to arcade ~1 hp/s.
- Shared engine: `src/games/Gauntlet/{sim,levels,planner,art,sound}.js` stay
  camera-agnostic; FourHalls imports them. `step()` gains `topDown` mode:
  arrows are an 8-way stick (facing follows the stick), blocked diagonals
  slide on the free axis; `inp.aim` is the documented pilot lane.
- **GAUNTLET** at `/gauntlet`: scrolling overhead camera clamped to the maze,
  8-way stick, sword-arc sweep rendered honestly, swarms from generators,
  slam/locked doors, food/keys/potion economy, Death on the timer, narrator
  lines, four heroes, CPU partner toggle (C), attract = the autopilot's own
  proven deathless run.

Gates: `lint:gauntlet` + `gauntletcheck` (86 checks; new *overhead* section:
stick facing, corner-slide, aim lane, arrows down the facing stopped by stone,
slam overhead) in CI `static`. Pilot wins seeds 0-3 in BOTH cameras, deathless
available on both; slack re-wins both. `--mutate` kills **6 mutants** (added:
"overhead pilot cannot aim"). Advisory `gauntletplay` 11/11 zero page errors.
Polish pass filed as **#302**.

## GOAL — next session
Claim the oldest `game-queue` issue: **#292 MYST** (then #293 Bard's Tale).
Both are DOS era — MYST (1993) fits the js-dos spine (see AGENTS gotchas:
injected loader, preserveDrawingBuffer, window-level keys, wasm MIME, ESC/
click-to-advance quirks like the KQ box). If MYST proves un-runnable in js-dos
in this box, STOP with a diagnosis comment, don't silently swap titles.
QA polish items (#302, #298, #287, #283 …) are valid work if no queue item is
workable.

## Board
- Queue: #292 MYST, #293 Bard's Tale, #294 SSX, #295 Civ V, #296 PoP.
  SSX/Civ V are console/PC-scale, not arcade cabinets — scope question pending
  with Jon (below). PoP (arcade 1989) IS a cabinet title.
- Open QA feedback: #302 (Gauntlet/FourHalls), #298 (Tempest), #287
  (LunarLander), #283 (OutRun), #280 (SmashTV), #275 (Gauntlet), #270
  (SimCity), #269/#220 (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- QA lane live on `retrogames-qa-258` (branch qa/bobblubba) — dev port 5173
  is theirs; forge dev servers fall through to 5174+ (this session used 5177,
  killed on exit). `*play` scripts take URL via env (`GAUNTLET_URL=…`).

## Housekeeping done
Worktree `retrogames-forge-gauntlet` pruned (branch gone, merged). Main
checkout parked detached at `origin/main`; STATE.md committed per rule-9.
Carry-over: `forge-bobubble` still refuses removal (dead-session dirt) —
Jon may want to look before force-remove.

## How the two-camera engine works (pointer, not a tutorial)
`src/games/Gauntlet/`: `sim.js` (`step` with `gs.topDown`; `moveHero` is the
sliding 8-way path, FP keeps its own corner-probe branch; `CFG.drainEvery=60`
= 1 hp/s), `planner.js` (`decide` emits turn-deltas FP / absolute `aim`+
fwd overhead — same doctrine), `levels.js` (24×24 pillar mazes, key-before-lock
geometry), `art.js` (pixel-string sprites shared by both cameras), `sound.js`
(narrator buzzes). FourHalls = raycaster shell only. READMEs carry the honest
gaps (no shop/resurrection/potion variants, partner no door logic, uniform
wall blocks).

## Three questions for Jon
1. **Queue shapes** (repeat, unanswered): #294 SSX and #295 Civ V are not
   arcade-cabinet titles and dwarf the forge's one-game-per-session loop.
   Want them descoped/backlog-labeled before the forge reaches them?
2. **Pilot aim lane**: the overhead autopilot aims absolutely (`inp.aim`)
   while a player's facing is stick-snapped. OK as harness affordance
   (documented in README + gauntletcheck "overhead" section), or should the
   pilot be restricted to the 8 stick directions like a real player?
3. Attract house rule still open (deathless showcase + drama only on death
   screens) — #302/#298 both assume it; a one-line ruling would unblock both.
