# SUPER MARIO KART — design note (issue #187)

Original: Super Mario Kart, SNES, 1992. The five signature features this build
is judged against:

1. **Mode 7 course plane** — the ground is one textured plane scaled and
   rotated under the kart per scanline (checker asphalt, kerbs, grass, dash
   panels), with a parallax sky of clouds and mountains at the horizon. That
   rotation is the look of the game.
2. **Kart handling** — accelerate/brake, speed-scaled steering, a held-drift
   that carves tighter but slides wide, bumps off the barrier, grass that
   sucks the speed out, dash panels that throw you forward.
3. **Item boxes** — floating `?` boxes on the racing line give one item,
   weighted by your standing (last place gets the good stuff, fixed tables —
   no dice). Green Shell fires forward, Banana drops behind, Mushroom is a
   speed burst. Shells and bananas make a rival SPIN.
4. **MARIO CIRCUIT** — a hand-carved closed circuit: long start straight
   with dash panels, a hairpin, an S-section, an up-and-back top straight,
   5 laps, checkpointed (cutting across the infield cannot fake a lap).
5. **Rank race** — four CPU karts on a scripted racing line; the HUD says
   1st–5th live; winning means crossing the line in first after lap 5.

Architecture: `track.js` is the course as data (centerline + features, no
canvas), `sim.js` is a pure `step(state, input)` with zero `Math.random`
(item tables by rank are the dice), `planner.js` is the autopilot that
scripts the attract demo, `index.jsx` renders it: a 256x224 framebuffer,
Mode 7 sampled scanline-by-scanline from a prebuilt ground texture.
The harness (`scripts/kartcheck.mjs`) audits the geometry (no self-crossing
road, drivable curvature, features on the asphalt) and drives the whole
5-lap race in Node with the planner, tick-for-tick, twice, hash-for-hash.
