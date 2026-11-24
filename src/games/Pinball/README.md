# PINBALL — CABINET ONE (issue #3103 rung 1; #3169 rung 2: ramp · lock · multiball)

The shared table engine plus the first cabinet of the ladder Jon asked for
("definitely pinball… start simple, work up"). Rung 2 added the right ramp,
firelane, lock tower and MULTIBALL. Deeper rungs (true orbit loop, magnet,
DMD) are separate issues, filed one per shipped rung.

## Design

- **Original referenced:** Williams *Black Knight* (1978) — early solid-state
  era — for the cabinet; Williams *Firepower* (1980) for rung 2's
  firelane/lock/multiball idiom. Our own name, art and rules; nothing copied.
- **MODERN bar** (issue): a lit, reflective cabinet — midnight-indigo field,
  neon-roped rubbers, glowing 7-seg score, bloom/particles/shake juice.

## Engine layout

- `sim.js` — **pure** (zero DOM, zero `Math.random`): physics constants, the
  table as DATA (`TABLE`: walls, arc, bumpers, slings, targets, spinner,
  kicker, flippers, plunger, rules), the fixed-timestep step, state/hash.
  60 Hz shell ticks run `SUB=4` substeps (240 Hz) of circle-vs-segment /
  circle-vs-capsule collision. Flippers are animated *inside* the substep loop
  (a 2700°/s sweep must never jump past the ball) and kick via ω×r surface
  velocity plus a lever-scaled impulse — flip TIMING decides aim.
- **Tables are data on that engine.** `stepGame` knows only element primitives;
  scoring goes through `table.rules`. A new cabinet must add data, never physics
  (the engine contract of #3103).
- `art.js` — palette, seven-segment glyphs, deterministic playfield texture
  (seeded LCG sparkle + chevrons), attract copy.
- `index.jsx` — shell only: loop, scaling, attract, pause, pad, contract hooks.

## Rules (CABINET ONE)

Pop bumper 100 · slingshot 25 · drop target 50 · bank clear +250 and MULT
x2…x5 · spinner 10/turn · outlane kicker 100 · drain pays
BONUS = targets-hit-this-ball × 50 × MULT, then the bank relights.
Three nudges inside ~0.9 s = TILT (flippers dead till the drain).
3 balls. Plunger: hold (Space/↓/A) and release; power sets arrival speed —
any committed release clears the lane (a real spring plunger feeds the ball);
idle lane auto-plunges after 4 s. A launched ball crossing the lane mouth gets
a guide curl left toward the arc apex (lane-rain loop guard).

Rung 2 (#3169), the Firepower idiom:

- **RIGHT RAMP** — the launch lane carries two RAMP rollovers, scored on
  UPWARD crossings only: 25 × MULT each, three hits = +500 × MULT and the
  tower lamp set lights.
- **FIRELANE** — a descending lane down the dome's right flank (x 298..322).
  Enter only from the top: a one-way gate at y=190 bounces rising balls back
  down the lane; the inner guide (x=298) is solid from the playfield, so the
  lane is reached only by rounding the dome (the plunger's medium-power sweet
  spot feeds it — an aim skill, pinned by the scripted human-line check).
  Three LANE rollovers going down score 25 × MULT each; the full sweep pays
  +100 × MULT.
- **LOCK TOWER** — the lane mouth captures the ball (500 × MULT; the ball is
  NOT lost: the lane feeds a fresh ball). Lock 3 → MULTIBALL (+1000).
- **MULTIBALL** — the tower kicks three balls onto the open playfield (never
  back into the firelane). All playfield scoring DOUBLES while the pack is
  down; the first drain inside 5 s auto-RELUAUNCHES (ball save, once); a lock
  during the pack banks an EXTRA BALL (paid when the pack returns to one
  ball); pack drains cost balls-on-playfield only — the last ball home is the
  only one that costs a game ball. Locks reset when the pack ends.
- Engine note: gate/rollover/capture/multi-ball are generic engine PRIMITIVES;
  CABINET ONE only instantiates them from `TABLE` data (`oneWay` walls,
  `rampRollovers`, `laneRollovers`, `lock`, `mbKick`, `saveTicks`).

## Verify

```bash
npm run pinballcheck          # 41 literal physics/rules/determinism checks, plain Node
CONTRACT_ONLY=pinball npm run contractcheck   # game-contract driving
npm run dev -- --port 5176 --strictPort      # then /retrogames/pinball
```

## Honest gaps

- No true orbit loop, no magnet and no DMD — that is rung 3+.
- No ball-ball collision (classic EM machines ignored it too; packs read via
  the lamp set instead).
- Table-select screen ("row of cabinets") waits for a second cabinet.
- No table editor (#3103: not yet). No in-lane kick on the right side.
- Single table means the `?style` / skin machinery is unused here.
- The attract demo is a title card with a rolling ball, not a driven run.
