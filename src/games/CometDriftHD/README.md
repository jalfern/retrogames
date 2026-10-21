# COMET DRIFT HD — engine notes (#465)

The arcade's original kart racer with a MODERN renderer (docs/ART.md, the
first MODERN title): the SAME game as COMET DRIFT GP — `CometDrift/sim.js`
and `CometDrift/track.js` are reused UNCHANGED — re-drawn in real 3D on
three.js `WebGPURenderer` (WebGL2 fallback for phones). 4 laps, 7 karts,
dusk canyon, drift ladder. Art and audio synthesized at runtime; no assets.

## Layout

- `scene.js` — the Gulch as geometry, Node-safe (no DOM): `buildRibbon`
  extrudes the Catmull centerline into road / kerb / gutter / cliff-wall /
  plateau rings (`trackGeometryStats` is the harness audit surface);
  `buildKart` (13-part exposed-wheel buggy, steerable front axles),
  `makePool` (fixed-size additive GPU point system: spawn/step/clear,
  retire at ttl+1 ticks), `buildArch` (sandstone span, legs planted in the
  sand gutter outside the sim's wall limit — the karts can never touch it),
  `buildSceneryItem` / `buildMesas`. World mapping: X=x/60, Z=y/60 (the
  sim's y-down plane), three-yaw = -sim-heading.
- `index.jsx` — the shell: `WebGPURenderer` boot with `forceWebGL:false` +
  `await init()`; `?gl=webgl2` pins the classic `WebGLRenderer` substitute
  (pixel-readback path — a WebGPU canvas answers BLACK to 2D
  `drawImage`/`getImageData` regardless of `preserveDrawingBuffer`).
  A render-failure/black-frame heartbeat self-heals a dead WebGL backend by
  rebuilding on the classic renderer mid-session. Canvas-substitutes are
  inserted BEFORE the React-owned canvas, never in place of it (React
  re-attaches its ref on StrictMode remount and would resurrect a disposed
  context — see the commit history for the failure this prevents).
  Canvas-baked textures: asphalt (grain + wheel grooves + tar cracks),
  striped kerbs, sand, strata cliff bands, dusk sky gradient, sun glow,
  soft particle dot. Lighting: low warm directional sun + ember hemisphere +
  ACES tone mapping, exp2 fog, far mesa ring. Chase camera keeps the retro
  twin's lag law (0.055 while drifting, else 0.12) and punches FOV
  7+5.5·tier on boost. Glass HUD (POS / speed + 3-chevron ladder / LAP /
  minimap) rides a 2D overlay canvas, dropped below the app's #437 corner
  chrome. Attract = the autopilot's proven win; end table restarts on the
  first tap after a 400 ms guard.

## Feel tuning

- Top speed 8.6 px/tick ≈ 164 km/h at 1/60th scale; camera 2.55u back,
  1.26u up, look-ahead 4.2u, fov 62°. Cliff walls ~3.5–5u.
- Particles are renderer-side pools (never sim RNG): sparks colored by
  charge tier (blue #48b8ff / violet #b878ff / gold #ffd23c) at the rear
  wheels + half-rate for the rival pack; dust off sand/spins; tier-tinted
  exhaust cones under boost. Deterministic jitter = tick-hash noise.
- #478 item 3 kart feel: accent-colored spokes (3 bars/face) ride every wheel
  pivot on both backends; a lagging ghost set fades in as `spinBlurAt(v)`
  climbs (0 below 2.5, 1 by 7 px/tick) so wheels streak at speed and sit
  crisp at the grid. `buildDriver` (helmet/visor/torso/reaching arms) mounts
  on the kart ROOT so it survives the GLB swap. `buildNoseArt` gives four
  rotating motifs per driver index — seven entries read as seven. Landing
  squash: `landingSquash(prevGrade, grade, v)` compresses (scale.y down, xz
  out, capped 0.18) when the slope drops away at speed, springs at 0.78/tick
  — load hits crests, not just sand.

## Verify

```
npm run cometdrifthdcheck             # Node geometry audit + rules + win,
                                    # browser boot/pixels/drift/end-table cycle
npm run cometdrifthdcheck -- --mutate     # kills particle spawning, demands RED
npm run cometdrifthdcheck -- --mutate-spin  # freezes the wheel-blur law, demands RED
npm run lint:hd                     # eslint gate for the game + harness
CONTRACT_ONLY=comet-drift-hd npm run contractcheck   # window.__game (needs npm run dev)
node scripts/shot.mjs --url http://localhost:5173/retrogames/comet-drift-hd \
  --eval "window.__cometHDTest.setPlan(true);window.__cometHDTest.game().count=1" \
  --prewait 9000 --w 840 --h 420 --out race.png   # autopilot race frame
```

Harness pixel checks auto-append `?gl=webgl2` (the game defaults to WebGPU;
the compositor screenshot path covers WebGPU).

## Honest gaps (filed to QA as the polish pass)

- WebGPU is the default but the ONLY proof of WebGPU pixels is compositor
  screenshots; three's WebGL-node-backend lost its device on the dev box
  (that's why the self-heal exists) — phones on the auto-fallback are
  untested here.
- The autopilot's ideal line rarely holds a drift charge long enough for a
  tier in a real race (same as the retro twin — the ladder is proven on the
  treadmill, and human corners still pay); rivals chain drifts only by
  accident.
- No bloom/post-processing chain yet (TSL postprocessing skipped for
  stability): speed lines/vignette are 2D-overlay, not GPU.
- No dynamic sand deformation, no kart reflections, blob shadows are discs.
- Sound is the retro twin's synthesized law re-cut on sawtooth; no music.
