# EXCITEBIKE (`/excitebike`)

The 1984 motocross, rebuilt toward the NES original: side view, a carved
heightmap course, one throttle, one jump, and the two rules that made the
game — **lean your bike in the air or eat dirt**, and **pump the button in
the mud or sink**. Everything (terrain, bikes, HUD dials, engine notes) is
synthesized at runtime; the attract demo is the autopilot's own proven run
replayed tick-for-tick through the same `step()` the harness audits.

## Design (issue #176)

Core loop: hold gas through a 2-lap course of ramps, whoops, mud, water and
boost arrows against a countdown the lap line extends. Speed is bought with
heat — redline too long and the engine bogs until it cools. Every big jump
asks the same question: nose attitude at landing. Lean back too far you
backflip; too far forward you agency-plant; both put you on the ground
counting seconds while the field rides over you — unless you mash A, which
is also how you crawl out of a stalled water hole. The one harness we
demand: `excitecheck` in Node — terrain audited as data (every up-step
clearable at wide-open throttle, every launch landable, features only on
real ground), the autopilot (which rolls the REAL sim per candidate, the
Spy Hunter lesson) clearing both tracks in first, and the **slack rule**:
the campaign re-wins with less clock at every lap line, with thicker mud and
faster heat.

## File boundaries

- `levels.js` — the course **as data**: heightmap control points, feature
  bands (mud/water/whoops/boost/up-step), and the five rivals' pace lines
  (piecewise speed-vs-distance) plus rider skill tiers. The skill tiers make
  the CRASH LEAGUE: lagged stabilisation + the player's landing law in a
  skill-scaled window (sim.js `rivalTick`), receipts pinned by
  `excitecheck`. `groundY/slopeAt/featureAt` are the only readers. Node-safe.
- `sim.js` — pure `step(state, input)`, zero `Math.random`. Heightmap
  ground, ballistic air with pitch/lean, heat, mud pump, water stall,
  boost, crash/recover, laps, clock, rivals, ledger. Node-safe.
- `planner.js` — the autopilot. Decisions every few ticks; each candidate
  (gas/brake × jump now/later × lean) is **rolled through the real sim**
  before it is allowed to drive. The attract demo is its output.
- `index.jsx` — the shell. Renderer draws the heightmap column-by-column,
  the HUD (speed dial with needle, heat gauge, position, course bar) and
  the bikes rotated by pitch. DEV hook `__bikeTest` for `exciteplay`.

## Controls (faithful to the NES mapping)

- `↑` gas on the ground, **lean back in the air** · `↓` brake, **lean nose
  down in the air** · `SPACE` jump (hold = longer), and **pump it** in mud,
  water and after a crash · `G` gear High/Low at the title · `?` pause.
- Touch pad: up/down arrows are the throttle and brake (and lean), the A
  button is jump/pump. Tap anywhere to start.

## Honest gaps

- Rivals are riding bodies since #2384 — they fly real parabolas, wipe out at
  the big-jump lip and remount, with skill tiers pinned by `excitecheck`
  CRASH LEAGUE receipts. But their throttle is still a pace line: they choose
  no lines, brake into nothing, and there is no bike-vs-bike contact — you can
  ride straight through a wreck. A full physics league stays open.
- The NES splash screen (EDIT TRACK / 6 tracks) is not here: two carved
  tracks, 2 laps each, which is where the fidelity muscle (controls,
  feel, terrain) actually lives.
