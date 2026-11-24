# TIDAL RUSH — jetski slalom on the forge ocean (#3104 rung 1)

Wave Race 64 (Nintendo 64, 1996) in spirit, our own IP: riders KAI vs MAKO
and TUNDRA, one bay — SUNNY BAY. The issue's core demand: *the water is the
game*. One analytic Gerstner table is the single surface of truth:

- `water.js` — WAVES (4 waves, deep-water dispersion ω=√(gk)). The CPU reads
  `heightAt` / `surfaceVy` / `surfaceNormal`; `waterGLSL()` emits the same
  constants and loop order into the vertex shader. tidalcheck parses both and
  refuses drift. The sea you float is literally the sea you draw.
- `sim.js` — pure, seeded, 60 Hz, zero Math.random (mulberry32 rides as an
  integer on `gs.rngS`, snapshot/restore byte-exact). Hull matched to surface
  vy; falling faces at speed launch (kickers); A spins a 360 in the air for
  +250 and a fat boost. Buoy gates alternate RED (pass right) / YELLOW (pass
  left) judged by heading at the buoy; misses choke the throttle 1.5 s and
  dump 0.25 boost; clean passes charge sprint. Skip detection is corridor-
  scoped — only the NEXT pending gate, within 18 m of its line — the first
  build judged a buoy 88 m across the bay and missed itself 15 times a lap.
  3 laps; standings on unwrapped course progress.
- `art.js` — MODERN bar within a phone budget (the SHORE demo's weak spot):
  one 96×96 sea mesh, fresnel + sun glitter + crest foam, gradient sky with a
  low sun and headland silhouettes, procedural ski + leaning rider, one
  pooled additive Points buffer for spray/carves/wake/boost, NO shadow maps,
  pixel ratio ≤2.
- `index.jsx` — the shell: fixed-timestep loop (one driver), attract driven
  by the SAME autopilot the harness wins with (`autoPad`), pause card,
  VirtualControls (method `stick`, analog; B = BOOST), DOM HUD, contract hooks.

Play: up/stick = throttle, steer = lean, SPACE/A in the air = spin, SHIFT/B =
sprint. Any key or tap starts; `?` pauses.

## Verify

```
npm run tidalcheck          # 24 gates: boot, rules, win, determinism, CPU↔GLSL parity
npm run tidalcheck -- --mutate   # plants the red-side mutant in sim.js — must go red
npm run dev -- --port 5178 --strictPort   # then:
CONTRACT_ONLY=tidal-rush npm run contractcheck
```

CI: `tidal` scope (scripts/checks.mjs) runs tidalcheck in the browser-free
static job; every pushed commit is commented on #3104.

## Honest gaps (rung 1 — the storm ladder follows on #3104)

- One course. The storm bay (swell re-rolled per lap, visibility) is rung 2.
- Miss-policing: a craft that skirts the corridor far outside the gate line
  can complete a lap without judging that gate (autoPad/rivals never do; the
  corridor covers all sane lines).
- Buoys bob in height only (no lateral drift with the Gerstner flow).
- No online rooms (the SSX lobby reuse is on the issue's "not yet" list).
- The trick is one move (flat 360); flips/handstands would ride the same
  airborne spin budget.
- Engine audio is stepped sawtooth, not a continuous loop voice.
