# COMET DRIFT GP — engine notes (#419)

Original arcade kart racer. One course: SUNSET GULCH, dusk canyon, 4 laps,
7 karts (player + 6 CPU). No items — the drift ladder is the whole game
economy. All art/audio synthesized at runtime; no assets.

## Layout

- `track.js` — the course as data: closed Catmull-Rom centerline (18 control
  points, SEG 26), per-point tangent/arc-length/curvature, `nearest/hint`,
  `surfaceAt` (road/kerb/sand/cliff), 4 checkpoint gates, scenery by index.
  World = 2048² px texture space, y down, index 0 = start/finish.
- `sim.js` — the pure machine (`makeGame(seed)`, `step`, `decide`,
  `stateHash`). Determinism: mulberry32 riding INSIDE `g.rngState` (JSON-safe
  snapshots); `Math.random` is never called. Launch jitter, the seeded rival
  mistakes (wide-exit 72% / spin-out otherwise, skill-weighted) all read the
  seeded rng. The drift: hold + steer above v 4.5 charges 50/105/165 ticks;
  releasing pays `TIERS[t].dur` of over-cap boost; the player's Comet engine
  multiplies duration ×1.3. Rivals and the player share `drive()`; `brain()`
  is shared by rivals (their skill) and the autopilot (`decide`, skill 1.0).
  `decide()` never makes mistakes — it is the certified line the harness and
  the attract demo replay.
- `art.js` — `PALETTE` (named dusk-canyon roles), `LIVERY` (per driver),
  `buildGround` (concentric Path2D strokes, widest first: cliffTop → cliff →
  kerb dashes → edge → road → gold centre line + checker start band),
  `buildSky` (mesa silhouette band + sunset streaks), `buildSprites`
  (3 steer poses × 2 rev frames per livery), `minimapPath` (HUD outline +
  live dot projection). Node-safe on import; `document` only inside builders.
- `index.jsx` — the shell: fixed-timestep loop (`contractHoldsLoop` gates the
  sim, the contract owns the clock while held), Mode 7 raster (256×224,
  horizon 84, warm dusk haze), sprite projection, renderer-only fx (drift
  sparks tinted by charge tier, spin dust, vanishing-point speed lines —
  tick-jittered, never Math.random), chase camera, HUD (lap/clock, place
  badge, minimap with livery dots, speed bar, charge pips, best lap),
  attract = autopilot race, countdown, end table, localStorage best/top-3,
  DEV hooks (`__cometTest`, `__cometLog`, DebugKit F1) and the game contract
  (`exposeGame`, id `comet-drift`, snapshot/restore included).

## Feel tuning (measured, not vibes)

- `top 8.6` px/tick ≈ 168 km/h; kerb 7.2, sand 3.4; steer 0.052 with grip
  `min(1, v/2.2)`; drift yaw ×1.6 with a 0.35π lateral slide.
- Course min radius 288 px → flat-out everywhere on the ideal line; corners
  are won on the drift ladder, not on braking.
- Rival skills 0.785–0.86 (top-speed multipliers) + defence shuffle
  (inside-line pull when a chaser is within 460 px) + seeded mistakes. The
  autopilot (skill 1.0 + Comet turbo) wins from P7 on every seed tested —
  the field is beatable, not a procession: check `cometcheck`.

## Verify

```
npm run cometcheck            # Node: track audit, bot wins, determinism
npm run cometcheck -- --mutate # mutates the checkpoint gate, demands RED
CONTRACT_ONLY=comet-drift npm run contractcheck   # window.__game (needs npm run dev)
```

## Honest gaps (filed to QA as the polish pass)

- No second course, cups, items, or real music (placeholder engine buzz
  only) — all out of scope per #419.
- CPU karts never chain multi-tier drifts deliberately; they hold one bend
  and bank whatever tier they reach.
- Sand and cliff are surfaces + clamp; no dynamic deformation.
