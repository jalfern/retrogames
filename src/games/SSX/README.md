# SSX — engine notes

EA Sports BIG's 2000 snowboard racer, rebuilt whole in code. Three seeded
mountains, a CPU field of five, and a trick economy where clean landings fill
the boost meter and a full meter at takeoff throws OVER.

## Shape

- `course.js` — the mountains: downhill centerlines integrated segment-by-segment
  (`DS = 4 m`), with kicker wedges, halfpipe walls, rails, and obstacles parked
  on fractions of the run. `terrainY(s, x)` / `slopePos` are the single surface
  every rider and the renderer share — the painted slope IS the ridden slope.
- `sim.js` — the whole game as `step(state, input)` at 60 Hz. Gravity off the
  drop, carve/powder drag, centrifugal push in curves, crouch-release ollies,
  auto-launch off lips and pipe walls, trick ledger (180-spins to 1080 with
  OVER, grabs, flips; chains to x4; a half-finished flip is a bail), boost
  economy (drain 26/s, ceiling 38 m/s, crash dumps half), rails with trickle
  points and pinned line, wall crash, three heats with standings points, and
  Showoff against the house bank. Zero `Math.random`, seeded state only.
- `planner.js` — the autopilot. It IS the CPU field (five seats, pace caps
  0.76–0.88 of the player top, skill decides grabs/flips/rails), drives the
  attract demo, and is the witness `ssxcheck` grades. Constants mirror `CFG`;
  the harness pins they agree.
- `art.js` — vertex-coloured snow ribbon, neon rails and city pylons, rigs
  that crouch/grab/spin/flip/tumble, spray sprites. `index.jsx` is paint,
  sound, HUD and input only.
- Carved tracks: `sim.js` records `r.carves` samples (`{s, x, t}`) whenever the
  player carves hard on the snow (|steer| > 0.45 at v > 8), fading after
  `CARVE_FADE = 300` ticks (~5 s). `index.jsx` lays those as two dark groove
  quads on the slope, plus speed streaks past the camera edges over ~90 km/h
  and spray whose density scales with speed. Carve state lives in the sim so
  `ssxcheck` can pin it deterministically.

## Rules that are load-bearing (each pinned by ssxcheck)

1. Gravity feeds the hill; carving and powder take it back; the valley wall bails.
2. A trick banks only on a clean landing — spin is safe at any angle, a flip
   must finish near a multiple of 360° or it's a crash.
3. Consecutive clean tricks multiply to x4; any bail resets to x1.
4. OVER: meter ≥100 at takeoff doubles the whole pay and renames the trick.
5. Boost spends meter for speed; a crash dumps half the meter and the chain.
6. Race: three heats, standings 10/7/5/3/2/1; the mountain crowns the leader.
7. Showoff: 90 s, house target 8000.
8. Carved tracks: hard carving on the snow etches grooves that fade in ~5 s;
   straight riding and airborne boards leave nothing.

## Verify

```bash
npm run lint:ssx && npm run ssxcheck     # 62 checks, blocks merges (CI `static`)
```

The check proves the autopilot wins RACE (30/30 standings, zero bails) and
SHOWOFF (≥8000), and re-proves both at the slack economy (`boostGain×0.75`,
chain cap x3) — the win is not a knife-edge. Determinism: identical scripts →
identical hashes; `Math.random` is banned in course/sim/planner and the check
greps for it. Mutant proof (done once, by hand): neuter the bail rule in
`sim.js` and "a half-done flip is a bail" goes red; neuter the carve push and
the five "carved tracks" checks go red.

Live drive: `npm run dev`, open `/retrogames/ssx`, press any key.

## Honest gaps (filed as the polish pass)

- CPU riders never crash (the field is pace-limited rather than error-prone).
- Keyboard-only flips/grabs on desktop; phones get steer + A-jump + B-boost
  (spins still work via the d-pad mid-air). No analogue stick yet.
- No audio soundtrack beyond the synth pulse. Snow tracks are now geometry:
  fading carve grooves under the board (#310), on top of the speed-scaled spray.
- No browser-drive harness script yet (`ssxplay`) — the merge gate is Node.
