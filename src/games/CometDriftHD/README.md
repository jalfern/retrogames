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
  banking cue (#502 item 4): `wallTopSideAt(i, side)` raises the OUTSIDE
  strata by `bankAt(i) * BANK_RISE` through Sandbank's sweepers (flat on
  straights, flat on Gulch) — pinned by cometdrifthdcheck.
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
  rebuilding on the classic renderer mid-session. `?gl=webgl-node` pins three's
  WebGPU renderer onto its WebGL backend (`forceWebGL`, #478 item 9) so the
  self-heal is testable headlessly via `WEBGL_lose_context`. Gotcha the retest
  found: a StrictMode remount inherits a force-lost GL context (three's
  `WebGLBackend.dispose()` calls `loseContext()` and a canvas hands out its
  context once), and a dead context makes `readPixels` throw — so the boot path
  retries once on a fresh canvas when the inherited context reports lost, and
  the refuge additionally fires on the canonical `webglcontextlost` event.
  Canvas-substitutes are
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
- #718 floor law: the sand floor was a fixed −1.5 plane (a Gulch fit; its
  road bottoms at −1.49). Since #518's elevation, Sandbank dips to −3.1 and
  Corkscomb to −4.8 — ~25% of those laps drove UNDER the sand. The floor
  now hangs at `courseFloorY()` = min(−1.5, `asphaltMinY()` − `FLOOR_MARGIN`
  0.6) — the selected course's lowest cambered asphalt edge — and the mesa
  ring sinks with it (base = floor + 0.1u). `cometdrifthdcheck` gates all
  three courses (road, kart, chase eye ≥0.5u above the floor) and
  `--mutate-floor` pins it back to −1.5 and must redden them.

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
- #478 item 4 gold streaks: `makeStreakPool` (scene.js) draws the gold tier
  and rival afterburners as CAMERA-ALIGNED additive quads, not tripled points.
  Each live streak billboards onto the camera plane every tick: long axis =
  velocity projected into that plane (screen-right fallback when velocity
  points at/away from the lens), width fixed, head bright / tail dimmed 0.35.
  `streakLen(len, speed)` clamps the dash at 0.05 px/tick so a warp never
  draws a 100 m line. Pools: 96 quads (48 lite), cleared on every restart
  path; `fx()` reports `streaks` alive count to the harness.
- #478 item 6 dusk sky: `applySkyDither(data, w, h)` (scene.js) breaks the
  8-bit dusk bands that stripe OLED/phones — a deterministic ±1.5-level hash
  noise over the 64×256 sky gradient (same noise every boot; alpha untouched).
  Stars: `makeStarDefs()` puts 56 unit directions in the UPPER band only
  (y ≥ 0.55 — the dusk rim and sun stay clean), and `twinkle(phase, tick)`
  (0.4..1, spread per-star phases) modulates additive point colours every
  tick (`twinkleStars` in spawnTick). `__cometHDTest.stars()` reports the
  field; `cometdrifthdcheck --mutate-stars` kills the twinkle law to prove
  the gates watch it.

- #478 item 7 wall variety: one strata texture tiled end-to-end so the same
  8-band pattern pasted past at speed. `wallTint(i, side)` (scene.js) gives each
  lap section its own rock tint — four stone families (bleached sand, warm rust,
  umber, pale dust) cycling 16 steps/lap with smoothstep blends, the right wall
  two steps out of phase. Tints ship as vertex colours on the wall ribbons
  (`buildRibbon` accepts a `colorAt` sampler) and the strata material reads them
  via `vertexColors` — the map is shared, only the tint rides the loop.
  `cometdrifthdcheck` gates ≥4 distinct tints + ≥0.1 luma swing per wall on
  every course, ring-to-ring smoothness, out-of-phase sides, and a closed
  start/finish seam; `--mutate-wall` collapses the cycle and MUST go red.
- #478 item 8 phone HUD: the old fit `min(h/240, w/420)` bottomed at 0.72 and a
  390x844 portrait phone was width-bound at 0.93 — POS read ~7px. `hudScale(w, h)`
  (scene.js) adds a height-driven portrait lift (×min(1.3, h/560) when h > 1.4w)
  and raises the floor to 0.85; landscape/desktop/lite are provably untouched.
  `hudTop(sat)` parks the instrument row at 46px + the same `--sat` safe-area
  inset the #437 ARCADE/PAUSE chrome rides, so notched devices keep a gap.
  Gates: scale law at phone/landscape/desktop/lite sizes + monotonicity, chrome
  clearance at four insets, and browser asserts at 390x844 (u ≥ 1.1, panels
  below the DOM chrome rects, no panel overlaps); `--mutate-hud` folds the
  portrait lift to 1 and MUST go red.

## Trackside scenery (#639)

The circuits were bare, so speed didn't read. `scenery.js` dresses them like
real race tracks, pulled from the shared model shelf (#637) by id with primitive
fallbacks so the game never waits on — or dies from — the network.

- `tracksidePlan()` is deterministic data (Node/browser/harness agree): a
  distance-based pass (density constant per arc length, not per index) placing
  grandstands straddling the start/finish, pit buildings + billboards down the
  front straight, tire walls on the outer side of each course's tightest corners
  (gate relative to that course's own max curvature, so the fast-flow GULCH
  dresses its apexes too), striped barriers along the fast sections, marshal
  posts + flags at the corner posts, cones at chicane mouths, and pines/oaks/
  rocks on the plateaus. Every prop stands on the plateau height (rides the
  course elevation profile) and is oriented `along`/`across` the road.
- Placement law: nothing inside the sim's 216px wall clamp (the racing line is
  physically unreachable), and every prop clears EVERY track point by its own
  footprint (the #542 fold-back rule) — so no prop ever hedges a passing leg or
  the camera. Only `barrier`/`tire_wall` are marked solid (and they sit outside
  the wall, so nothing bites); the count is capped for phones.
- `primitiveProp(id)` paints recognisable desert-gulch stand-ins tagged `ph`;
  `attachShelfProps()` swaps them for the real CC0 GLBs when they land (clones
  share geometry via `keepGeo`, never disposed). `index.jsx` rebuilds the props
  group with the circuit on every course swap; a `propsRev` token guards the
  async attach against a swap mid-load.

## Verify

```
npm run cometdrifthdcheck             # Node geometry audit + rules + win,
                                    # browser boot/pixels/drift/end-table cycle
npm run cometdrifthdscenerycheck    # #639 dress audit: build/rules/win on every
                                    # course (line clear, corridor, solids, cap)
npm run cometdrifthdscenerycheck -- --mutate  # parks a barrier on the line, RED
npm run cometdrifthdcheck -- --mutate     # kills particle spawning, demands RED
npm run cometdrifthdcheck -- --mutate-spin  # freezes the wheel-blur law, demands RED
npm run cometdrifthdcheck -- --mutate-heal # disarms device-loss self-heal, demands RED
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
