# SKYWARD — flight school on Gullwing Isle (#3105 rung 1)

MODERN. Pilotwings-in-spirit, own IP: three craft, three school events, free
flight over an island built from the forge's own ocean/SHORE/mountain/storm
demo tech. One Gerstner swell table drives the water shader AND the sim's wave
skim (`world.waterGLSL()` emits the same constants the CPU reads).

## Layout
- `world.js` — pure island: seeded fbm terrain with an explicit coastal shelf
  + carved course flats + a low supply corridor (the belt's route), the shared
  Gerstner field, thermals, the storm cell. Seed in, deterministic out.
- `sim.js` — 60 Hz pure sim (zero DOM, zero Math.random): plane / glider /
  belt physics, RING RUN / SPOT LANDING / TARGET DROP scoring, graduation.
  Exports `checkout`/`recycleCraft` so the harness and the F1 panel skip the
  approach flight.
- `planner.js` — the autopilot: proportional ring-seeking for the plane,
  spiral-release soaring for the glider, two-band hover + brake-drop for the
  belt. Attract flies it; `skywardcheck` graduates on it.
- `renderer.js` — three.js: gradient sky + sun glitter, Gerstner vertex-shader
  sea with fresnel/crest/shoreline foam, vertex-coloured terrain (sand→grass→
  rock→snow), billboard cumuli + a rain-shaft storm cell with lightning,
  procedural craft meshes, ring gates, cargo crates, chase-cam with FOV kick.
- `index.jsx` — the cabinet: fixed-step loop, attract, pause, DOM HUD,
  VirtualControls (stick-first, supports dpad), `?` overlay, contract hooks.

## Controls
Stick/arrows bank + pitch (up = climb) on all three craft; SPACE = context
(start event at a marker / belt thrust); B = drop crate / recycle craft at
the school apron. Full rule text lives in the PauseOverlay (`?`).

## Verify
```
npm run dev -- --port <DEV_PORT> --strictPort   # then:
npm run skywardcheck         # Node: geometry, rules, graduation × seeds, determinism
npm run skywardcheck -- --mutate   # proves the harness can fail
node scripts/skywardplay.mjs       # headless Chrome: boot → play → events → zero page errors
```
## Honest gaps (rung 1)
- One island; the storm is weather, not a course (the issue's second,
  lap-varying-swell island is a later rung).
- Thermals are analytic columns, not sim'd convvection; cumuli sit above them
  but do not move.
- No online (issue: not yet), no second landing strip, engine audio is
  per-action rather than a continuous loop.
