# COMET DRIFT GP — engine notes (#419, polished #435)

Original arcade kart racer. One course: SUNSET GULCH, dusk canyon, 4 laps,
7 buggies (player + 6 CPU). No items — the drift ladder is the whole game
economy. All art/audio synthesized at runtime; no assets.

## Layout

- `track.js` — the course as data: closed Catmull-Rom centerline (18 control
  points, SEG 26), per-point tangent/arc-length/curvature, `nearest/hint`,
  `surfaceAt` (road/sand/cliff), 4 checkpoint gates, scenery by index.
  World = 2048² px texture space, y down, index 0 = start/finish.
- `sim.js` — the pure machine (`makeGame(seed)`, `step`, `decide`,
  `stateHash`). Determinism: mulberry32 riding INSIDE `g.rngState` (JSON-safe
  snapshots); `Math.random` is never called. Launch jitter, the seeded rival
  mistakes (wide-exit 72% / spin-out otherwise, skill-weighted) and the
  slipstream (a kart 55–190 px dead ahead, |lat|<46, adds 0.02/tick) all read
  as pure position math. The drift: hold + steer above v 4.5 charges
  50/105/165 ticks; releasing pays `TIERS[t].dur` of over-cap boost; the
  player's Comet engine multiplies duration ×1.45. Rivals and the player share
  `drive()`; `brain()` is shared by rivals (their skill) and the autopilot
  (`decide`, skill 1.0). `decide()` never makes mistakes — it is the certified
  line the harness and the attract demo replay.
- `art.js` — `PALETTE` (named dusk-canyon roles: strata, apron, worn asphalt,
  mesas), `LIVERY` (per driver), `buildGround` (concentric strata strokes
  widest-first foot-to-rim, sand apron, worn wheel grooves via offset paths,
  deterministic patches + sealed cross-cracks, crumbled sandstone edge rings —
  NO painted kerb, NO centre dash: the canyon look is pinned by cometcheck),
  `MESA_FAR`/`MESA_NEAR` + `longestFlatRun` (pure flat-topped mesa profiles),
  `buildSky` (two parallax mesa bands + setting sun + ember glint),
  `buildSprites` (exposed-wheel buggies: 3 steer poses × 2 rev frames),
  `minimapPath` (HUD outline + live dot projection). Node-safe on import;
  `document` only inside builders.
- `index.jsx` — the shell: fixed-timestep loop (`contractHoldsLoop` gates the
  sim, the contract owns the clock while held), adaptive-source Mode 7 raster
  (the canvas re-solves to the viewport aspect: height-anchored
  176×≤384 landscape, width-anchored 256×≤448 portrait — the race fills the
  phone instead of sitting in it), low chase camera (CAM_H 46, horizon 0.4H)
  with a per-tier boost FOV punch and drift camera-lag, carved HUD cluster
  mounted in the SKY band (POS badge, speed bar + chevron drift ladder,
  centre LAP plate, minimap — the road view is never covered), sandstone
  start arch (no gantry), renderer-only fx (tier sparks, apron dust on every
  held drift/offroad run, edge speed-streaks, tiered tunnel vignette), HUD
  typography scales with `hs = min(H/176, W/256)` so portrait never explodes,
  attract = autopilot race, countdown, end table, localStorage best/top-3,
  DEV hooks (`__cometTest` incl. `view()`, `__cometLog`, DebugKit F1) and the
  game contract (`exposeGame`, id `comet-drift`, snapshot/restore included).

## Feel tuning (measured, not vibes)

- `top 8.6` px/tick ≈ 168 km/h; kerb 7.2 (kerb removed — keep the constant
  for the sand/road ladder), sand 3.4; steer 0.052 with grip `min(1, v/2.2)`;
  drift yaw ×1.6 with a 0.35π lateral slide.
- Course min radius 288 px → flat-out everywhere on the ideal line; corners
  are won on the drift ladder, not on braking.
- Rival skills 0.785–0.86 (top-speed multipliers) + defence shuffle
  (inside-line pull when a chaser is within 460 px) + slipstream + seeded
  mistakes — the pack stays close enough to see and use. The autopilot
  (skill 1.0 + Comet turbo) wins from P7 on every seed tested — the field is
  beatable, not a procession: check `cometcheck`.
- Speed presentation: edge streaks above 7.6 (denser + tinted on boost), FOV
  punch `0.05+0.035·tier` lerped at 0.08, camera kick 4+3·tier px, engine
  tone steps up per tier.

## Verify

```
npm run cometcheck            # Node: track audit, bot wins, determinism,
                              #       canyon look-pins, tier-payoff ladder
npm run cometcheck -- --mutate # mutates the checkpoint gate, demands RED
npm run lint:comet            # eslint gate for the game + harness
CONTRACT_ONLY=comet-drift npm run contractcheck   # window.__game (needs npm run dev)
node scripts/shot.mjs --url http://localhost:5173/retrogames/comet-drift \
  --eval "window.__cometTest.setPlan(true)" --prewait 8000 --w 840 --h 390 --out f.png
                              # autopilot race frame (--w/--h choose aspect)
```

## Honest gaps (filed to QA as the next polish pass)

- Controls per se are #431 (steering curve); this pass kept the sim's numbers.
- No second course, cups, items, or real music (placeholder engine buzz
  only) — all out of scope per #419.
- CPU karts never chain multi-tier drifts deliberately; they hold one bend
  and bank whatever tier they reach.
- Sand and cliff are surfaces + clamp; no dynamic deformation.
- The strata are texture bands, not true vertical geometry (Mode 7 limitation
  accepted — the Road Rash trick was always fake).
