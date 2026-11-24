# PINBALL — CABINET ONE (issue #3103, rung 1)

The shared table engine plus the first cabinet of the ladder Jon asked for
("definitely pinball… start simple, work up"). Rung 2+ (ramps, locks,
multiball, deeper tables) are separate issues, filed one per shipped rung.

## Design

- **Original referenced:** Williams *Black Knight* (1978) — early solid-state
  era. Our own name, art and rules; nothing copied.
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

## Verify

```bash
npm run pinballcheck          # 41 literal physics/rules/determinism checks, plain Node
CONTRACT_ONLY=pinball npm run contractcheck   # game-contract driving
npm run dev -- --port 5176 --strictPort      # then /retrogames/pinball
```

## Honest gaps (rung-1 by design)

- No ramps, orbits, lock, multiball, magnet or DMD — that is rung 2+.
- Table-select screen ("row of cabinets") waits for a second cabinet.
- No table editor (#3103: not yet). No in-lane kick on the right side.
- Single table means the `?style` / skin machinery is unused here.
- The attract demo is a title card with a rolling ball, not a driven run.
