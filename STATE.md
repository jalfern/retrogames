# STATE — 2026-10-15 (forge session, LUNAR LANDER shipped)

## Shipped this session
**LUNAR LANDER** (#245) — PR #286, squash-merged at `623023b`, live at
https://jalfern.com/retrogames/lunar-lander (prod bundle `index-slGqbDxX.js`
verified to carry the route). Atari 1979 per the approved queue item: stick
rotation + **axis thrust** against 1/6-g with a finite tank; five dead-flat pads
at the classic **100·50·20·50·100** (widest pays least); the four-corner
**ALT/VERT/HORIZ/FUEL** readouts; crash gates with five named causes
(slope/impact/drift/tilt/climb); soft pad landings bank `val×mult + fuel×mult`;
relight after landing and **dock the orbiter** crossing the sky to refuel, step
the multiplier (×1→×10) and load a new terrain; five docked missions wins, four
landers is all you get. Zoom (X/L/button), attract replays the autopilot's own
deathless campaign. All art/audio synthesized.

Gates: `lint:lander` + `landercheck` (44 checks) wired into CI `static`.
Autopilot wins **all 5 missions deathless on 4 seeds**; slack re-wins with
**110 units cut from every tank**, **loses at 115** (win is load-bearing).
`-- --mutate` kills **4 mutants** (gravity, softVert gate, refuel, frozen
multiplier). Advisory `landerplay` (real Chrome): 12/12, zero page errors.
Polish pass filed as **#287**.

## GOAL — next session
Claim the oldest `game-queue` issue — **#246 Tempest** — unless Jon labels
**#276** (`next`). #276 (top-down GAUNTLET + FOUR HALLS rename) has now been
carried in STATE for three sessions without ever being claimable — see question
1. QA polish items (#287 OutRun→now Lander, #283, #280 …) are valid work if a
QA lane isn't live.

## Board
- Queue: **#276 Gauntlet top-down + FOUR HALLS rename**, **#246 Tempest**.
  (#245 Lunar Lander → shipped.)
- Open QA feedback: **#287** (LunarLander), #283 (OutRun), #280 (SmashTV),
  #275 (Gauntlet), #270 (SimCity), #269/#220 (Kart), #265 (Marble),
  #263/#258 (Bubble Bobble).
- `gh pr list` before touching arcade/QA areas.

## Housekeeping done
Worktrees `forge-lunar-lander` + `forge-arkanoid` removed (branches gone from
origin, games merged). `forge-smashtv` was already gone. **`forge-bobubble`
left in place**: `git worktree remove` refused — it contains modified/untracked
files from a dead session; Jon may want to look before it's force-removed.
Still listed but not pruned this session: `retrogames-kart`, `-noder`,
`-papers`, `-qa-227`, `-qa-258`, `-qa-arcade-fill-crisp`, `-qa-crisp`,
plus a locked `.wt-stickfix` under a sessions mount. Main checkout parked
detached at `origin/main`.

## How LUNAR LANDER is built (pointer, not a tutorial)
`src/games/LunarLander/`: `terrain.js` (seeded heightmap + flat 100·50·20·50·100
pads, `padAt`/`terrainY`), `sim.js` (pure `step`: axis thrust, three-foot
contact w/ epsilon, crash gates, dock-band proximity → refuel+mult, stranded
rule; `CFG` = harness knobs), `planner.js` (energy-law descent, **timed launch**
vs the orbiter sweep, bang-bang orbit hold at ~G/T duty; exports `decide` for
honesty checks), `art.js` (vector style: glow terrain, amber pads, gold lander,
silver orbiter, seeded stars), `index.jsx` (camera+zoom, corner HUD, particles,
attract/radio-less, DebugKit PROGNOSIS). README has fidelity notes + gaps
(proximity dock, TARGET_CYCLES=5 for a provable terminal state).

## Three questions for Jon
1. **#276, third time asking**: STATE has carried "top-down GAUNTLET + FOUR
   HALLS rename" for three sessions but it never carries the `next` label, so
   the rule-2 claim order keeps picking the oldest queue item instead. Label it
   `next` (I build it first) or say the word and I'll treat carried-forward
   intent as `next` — but pick one, the ambiguity is what made #237.
2. **Attract demo style** (open two sessions): house rule so far is deathless
   showcase, drama only on the death screen. Confirm? (#287 item 8 depends on
   it — it asks for a miniature replay of the last crash on the OVER screen.)
3. **Lunar Lander is generous where the cabinet was not**: 240-unit tanks leave
   ~110 units of slack even on the proof run, and docking is a proximity
   grapple, not a velocity match. Fidelity would be tighter tanks + a dock that
   demands matching the orbiter's speed. Tighten in the #287 polish pass, or is
   phone-playable forgiveness the house preference?
