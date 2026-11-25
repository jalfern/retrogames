# SKYWARD — flight school on Gullwing Isle (#3105, rungs 1–2)

MODERN. Pilotwings-in-spirit, own IP: three craft, four school events, free
flight over an island built from the forge's own ocean/SHORE/mountain/storm
demo tech. One Gerstner swell table drives the water shader AND the sim's wave
skim (`world.waterGLSL()` emits the same constants the CPU reads). Rung 2 made
the thunderstorm a course (THUNDERPASS) and set the thermals drifting.

## Layout
- `world.js` — pure island: seeded fbm terrain with an explicit coastal shelf
  + carved course flats + a low supply corridor (the belt's route), the shared
  Gerstner field, thermals (drifting with the sea-breeze via `thermalPos(c,t)`
  — the ONE answer for sim lift, autopilot target and painted cumulus), the
  storm cell — which LIVES (#3267): `stormPos(t)` sweeps it on a slow seeded
  ellipse (E/W ±64 m ~140 s, N/S ±34 m ~190 s) and gusts, core downdraft,
  rain, clouds and the bolt anchor all read it — and the fixed THUNDERPASS
  gate line (`passStart`, `passRings`) the weather moves over.
- `sim.js` — 60 Hz pure sim (zero DOM, zero Math.random): plane / glider /
  belt physics, RING RUN / SPOT LANDING / TARGET DROP / THUNDERPASS scoring,
  graduation. The storm fights the PLANE too (rung 2): gusts, ~2 m/s core
  downdraft, buffet. Exports `checkout`/`recycleCraft` so the harness and the
  F1 panel skip the approach flight.
- `planner.js` — the autopilot: proportional ring-seeking for the plane,
  spiral-release soaring for the glider, two-band hover + brake-drop for the
  belt, storm-aware seeking for THUNDERPASS (aims above the gate while the
  core downdraft pulls; graduates all five seeds). Attract flies it;
  `skywardcheck` graduates on it.
- `renderer.js` — three.js: gradient sky + sun glitter, Gerstner vertex-shader
  sea with fresnel/crest/shoreline foam, vertex-coloured terrain (sand→grass→
  rock→snow), billboard cumuli + a rain-shaft storm cell with lightning,
  procedural craft meshes, ring gates, cargo crates, chase-cam with FOV kick.
- `index.jsx` — the cabinet: fixed-step loop, attract, pause, DOM HUD,
  VirtualControls (stick-first, supports dpad), `?` overlay, contract hooks.

## Controls
Stick/arrows bank + pitch (up = climb) on all three craft; SPACE = context
(start event at a marker / belt thrust); B = drop crate / recycle craft at
the school apron. The violet beacon east of the bay starts THUNDERPASS in
the plane. Full rule text lives in the PauseOverlay (`?`).

## Verify
```
npm run dev -- --port <DEV_PORT> --strictPort   # then:
npm run skywardcheck         # Node: geometry, rules, graduation × seeds, determinism
npm run skywardcheck -- --mutate   # proves the harness can fail
node scripts/skywardplay.mjs       # headless Chrome: boot → play → events → zero page errors
```
## Honest gaps
- **MOVED by #3267:** the storm cell no longer stands still — `stormPos(t)`
  drifts the whole cell (weather AND paint) while the gates stay fixed, so a
  memorised THUNDERPASS line is a stale line. What remains of the old bullet:
  no online (issue: not yet), no second landing strip, engine audio is
  per-action rather than a continuous loop.
- The cell drifts on a fixed seeded ellipse, not a steered weather sim (no
  cell-to-cell travel, no squall line); a long run learns the sweep the way
  rungs 1's lines were learned.
- Lightning is scenery — no strike hazard anywhere (by design, the school
  forgives; the downdraft is the punishment).
- Thermals are analytic columns, not sim'd convection.
- A straight-and-level keyboard line dunks at the core — that's the course,
  but a first THUNDERPASS attempt crashes more than the ring run does.

## Juice (#3138)
- **Blob shadow** — one soft ellipse pressed onto the exact surface under the
  hull (terrain or the live Gerstner swell, edge-sampled so it rides slopes),
  widening and fading with altitude. No shadow maps; renderer-only.
- **Ring near-miss** — crossing the active ring's plane 2–6 m wide of the hoop
  fires a juice-only `near` event (`_zPrev` crossing detector; never scored,
  never hashed, sequence law applies); the cabinet answers with an airy whip.
- **Thermal shimmer** — the sim exposes `g.lift` (glider only, zeroed for the
  other craft, kept out of `stateOf`); the cabinet sings a two-note shimmer
  whose tempo and pitch ride the lift, teaching the elevator audio-only.
