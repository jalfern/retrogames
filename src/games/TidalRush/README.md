# TIDAL RUSH — jetski slalom on the forge ocean (#3104, rungs 1–2)

Wave Race 64 (Nintendo 64, 1996) in spirit, our own IP: riders KAI vs MAKO
and TUNDRA, one venue in two weathers — SUNNY BAY and STORM BAY. The issue's
core demand: *the water is the game*. One analytic Gerstner table is the single
surface of truth:

- `water.js` — the sea is a VALUE, not a constant. `WAVES` (4 waves, deep-
  water dispersion ω=√(gk)) still defines the sunny bay; `stormSea(seed, lap)`
  re-rolls a seeded swell per lap (WR64's storm signature, main swell +12 %
  per lap, dirs wander ±26°, overhang-guarded); `lerpSea` blends one into the
  next over ~1 s. `seaGLSL()` emits four fully-unrolled Gerstner slots fed by
  uniforms, and `seaUniforms(sea)` maps ANY live table into them — the CPU
  rides the exact numbers the GPU draws, every frame, every swell
  (unrolled because array constructors are not GLSL ES 1.00 — SwiftShader,
  #3134 lesson).
- `sim.js` — pure, seeded, 60 Hz, zero Math.random (mulberry32 rides as an
  integer on `gs.rngS`, snapshot/restore byte-exact; the sea table is plain
  JSON too). Hull matched to surface vy; falling faces at speed launch
  (kickers); A spins a 360 (+250), **full-lock steer airborne rolls a BARREL
  (+200)** — one trick per air. Buoy gates alternate RED (pass right) /
  YELLOW (pass left) judged by heading at the buoy. Miss-policing is
  progress-based (rung 2): past the gate line unjudged — geometrically *or*
  by course arc, at ANY lateral distance — is a miss; the rung-1 18 m corridor
  loophole is closed, and gates only judge in order (no shortcut pre-judging).
  3 laps; standings on unwrapped course progress. **STORM BAY** re-rolls
  `gs.seaTarget` on every lap crossing (`SWELL SHIFT`), drives a seeded
  lightning schedule (`gs.flash`), and relaxes the launch threshold to match
  the bigger seas.
- `art.js` — MODERN bar within a phone budget (the SHORE demo's weak spot):
  one 96×96 sea mesh, fresnel + sun glitter + crest foam, gradient sky with a
  low sun and headland silhouettes, procedural ski + leaning rider, pooled
  additive Points for spray/carves/wake (+ a small rain pool), NO shadow maps,
  pixel ratio ≤2. Storm mode: bruised sky colors, thicker fog, wind-slanted
  rain, whole-bay lightning flash (uniform-driven, no extra passes).
- `index.jsx` — the shell: fixed-timestep loop (one driver), attract driven
  by the SAME autopilot the harness wins with (`autoPad`), **bay picker**
  (◀ ▶ keys or tap the chips; the attract preview re-rolls live), tap-to-
  start on the root pointer (phones), pause card, VirtualControls (method
  `stick`, analog; B = BOOST), DOM HUD, contract hooks. Buoys bob with the
  full Gerstner motion (height + horizontal flow), staying glued to the drawn
  surface.

Play: up/stick = throttle, steer = lean, SPACE/A in the air = spin, full-lock
steer in the air = barrel, SHIFT/B = sprint. Any key or tap starts; `?`
pauses; ◀ ▶ on the menu picks SUNNY or STORM BAY.

## Verify

```
npm run tidalcheck                     # 51 gates: boot, rules, win (both bays), determinism,
                                       #   sea-bridge parity, lightning, barrel, swell re-roll
node scripts/tidalcheck.mjs --mutate=judge   # red-side judgement muted — must go red
node scripts/tidalcheck.mjs --mutate=swell   # per-lap re-roll pinned — must go red
npm run dev -- --port 5178 --strictPort   # then:
CONTRACT_ONLY=tidal-rush npm run contractcheck
```

CI: `tidal` scope (scripts/checks.mjs) runs tidalcheck in the browser-free
static job; every pushed commit is commented on #3104.

## Honest gaps (rung 2)

- No online rooms (the SSX lobby reuse is on the issue's "not yet" list).
- Rain is visual — it doesn't push the hull or slow visibility of gates.
- Two tricks (flat 360, barrel); flips/handstands would ride the same
  airborne spin budget.
- Storm is weather, not waves-at-depth: swells re-roll per lap but the
  transition is a blend, not a wave-by-wave front crossing the bay.
- Wake is pooled spray dots, not a stitched ribbon (the WR64 original's trail
  is a solid white ribbon).
- No caustic shimmer near the beach — crests carry subsurface glow only.
- Rider has no animation variety beyond the two postures (crouch + lean/jolt)
  with head-lag and arms tracking the bar; no separate jump/land poses.
- Loop audio ships but has no swell sting at the start line and no whoosh-in
  on a landed trick (air launches and the barrel carry one).
- Bay is bare of in-bounds scenery — headlands ring the rim, but there are no
  moored boats, no buoy bell, no birds.
