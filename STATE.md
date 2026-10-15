# STATE — 2026-10-15 (forge session, OUT RUN shipped)

## Shipped this session
**OUT RUN** (#241) — PR #282, squash-merged at `042e198`, live at
https://jalfern.com/retrogames/out-run (prod bundle verified: carries the
OUT RUN route). The 1986 Sega highway per Jon's approved spec:
segment-projected pseudo-3D road (curves slide, **real hills hide the road over
the crest** — not Mode 7), red convertible + wind-in-hair couple seen from
behind. **Checkpoint clock is the only killer**; **LOW/HIGH gears** (LOW caps
speed + bites, HIGH ~305 km/h); speed-scaled **centrifugal force**; traffic
bogs you and a **roadside object flips the car** (couple tumbles, seconds lost);
**fork at every checkpoint** (LEFT easier / RIGHT harder) over a **merge-back
lattice = 15 stages / 5 goals**; per-stage scenery (coast→desert→alpine→
countryside→capital); radio pick of **three ORIGINAL synth tunes** before the
start. Attract demo replays the autopilot's proven run. All art/audio synthesized.

Gates: `lint:outrun` + `outruncheck` (34 checks) wired into CI `static`.
Autopilot wins **all 5 stages DEATHLESS**; slack re-wins with **3s off every
checkpoint**, **dies at 4** (win is load-bearing). `-- --mutate` kills **4
mutants** (gear ceiling, centrifugal, flip crash, the time budget itself).
QA polish filed as **#283**.

## GOAL — next session
Claim the oldest `game-queue` issue — **#245 Lunar Lander** — unless Jon labels
**#276** (`next`). #276 (top-down GAUNTLET + FOUR HALLS rename) is Jon's own
standing directive (STATE carried it forward two sessions) but still carries no
`next` label — see question 1. A quick SMASH TV polish (**#280**) or the new
OUT RUN polish (**#283**) is also valid work if a QA lane isn't live.

## Board
- Queue: **#276 Gauntlet top-down + FOUR HALLS rename**, **#245 Lunar Lander**,
  **#246 Tempest**. (#241 Out Run → shipped.)
- Open QA feedback: **#283** (OutRun), **#280** (SmashTV), #275 (Gauntlet),
  #270 (SimCity), #269/#220 (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- `gh pr list` before touching arcade/QA areas.

## Housekeeping done
Worktree `retrogames-forge-outrun` (branch merged+deleted) — remove it when idle
(`git worktree remove`); symlinked node_modules there is disposable. Stale
worktrees worth pruning when idle (verify merged first): forge-arkanoid,
forge-bobubble, forge-gauntlet, forge-smashtv, qa-mkart, qa-qbert. Main checkout
parked detached at `origin/main`.

## How OUT RUN is built (pointer, not a tutorial)
`src/games/OutRun/`: `road.js` (segment projector `scale=CAM_DEPTH/z` + the
15-stage merge-back lattice + seeded props/cars + 5 `SCENES`), `sim.js` (pure
`step`, gears/centrifugal/clock/traffic/flip/fork; `CFG` switches the harness
mutates), `planner.js` (lane-commit + curve-counter + LEFT-fork autopilot),
`art.js` (synth sprites + parallax backdrops), `index.jsx` (projection renderer
with `p2.y>=p1.y` crest occlusion + painter props, attract/radio/HUD/DebugKit).
Radio tracks `cruise/sunset/breeze` live in `src/utils/AudioController.js`.
README has fidelity notes + honest gaps.

## Three questions for Jon
1. **#276 again**: it has now been the carried-forward intent for two sessions
   but never the claimed oldest-queue issue. Want me to build it next (label it
   `next`), or keep taking the oldest `game-queue` (#245 Lunar Lander) first?
2. **Attract demo style** (open since last session): Smash TV showed hits,
   Gauntlet/OUT RUN showcase deathless. Confirm the house rule — deathless
   showcase, with drama allowed on the death screen only?
3. **OUT RUN is very forgiving on HARD routes?** The autopilot only takes the
   LEFT branch (col 0) and wins deathless with slack. Want a RIGHT-branch autopilot
   win in the harness too (proves the harder columns are fair), or is proving
   the easiest route enough?
