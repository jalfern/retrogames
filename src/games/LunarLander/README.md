# LUNAR LANDER (Atari, 1979) — engine notes

The vector-cabinet classic: rotate the gold lander with the stick, fire the main
engine along the ship's own axis, and set it down on a jagged moon at walking
pace. Land a pad slowly, straight and flat for its value × the terrain
multiplier plus a fuel bonus; touch anything harder and the legs fold. After a
landing, relight and catch the lunar orbiter crossing the top of the sky to
refuel; every new terrain steps the multiplier. Five landings docked = mission
complete.

## Files

- `rng.js` — one seeded generator (mulberry32); the sim path never calls `Math.random`.
- `terrain.js` — seeded jagged heightmap (grid step 8u over a 1024u world, y in
  [50,300]) with five dead-flat pads at the classic pay table 100·50·20·50·100;
  the widest pad pays least. `terrainY` interpolates; `padAt` resolves pad spans.
- `sim.js` — the whole game as `step(state, input)` (60 Hz). Gravity 15.6 u/s²,
  axis thrust 34 u/s², burn 10/s from a 240-unit tank. Three feet contact-test
  against the heightmap (−0.01 epsilon so a foot *resting* on a pad is not a new
  touchdown). Landing gates: `vy ≤ 28` downward, `|vx| ≤ 14`, `|rot| ≤ 15°`, and
  the ground under the feet flat (all on one pad, or ≤ 2.2u across the span);
  anything else crashes with a named cause (`slope/impact/drift/tilt/climb`).
  Soft pad landings bank `val×mult + fuel×mult`; flat natural ground banks
  `10×mult`. Docking = proximity to the orbiter at the orbit line (±20×±30u):
  +200×mult, refuel, ×mult step (cap ×10), new seeded terrain. Empty tank on the
  pad = stranded after 2s (writes the lander off). 4 landers; five docked
  missions wins. `CFG` holds every load-bearing constant for the harness.
- `planner.js` — the autopilot / attract pilot. Descent: energy law — never sink
  faster than full throttle can kill over the distance left (`vAllow =
  sqrt(2·(T−G)·(d−14))·0.85`), terminal hover-sink pulse under 26u. Launch:
  times the orbiter's next mid-map crossing (the orbiter sweeps every longitude,
  so waiting on the pad is free fuel) and is sticky once lit. Ascent/hold:
  bang-bang — burn while the ballistic apex is short of the line, coast above it,
  tap below it; hold duty lands near G/T. `decide` is exported so the harness can
  audit the pilot's honesty directly.
- `art.js` — vector style drawn in code: seeded starfield, glow-stroked terrain
  polyline, amber pad bars with value tags, the gold lander with cyan cabin and
  two-frame flame, the silver orbiter with a docking probe.
- `index.jsx` — cabinet shell: attract replays the autopilot's proven run;
  four-corner HUD (FUEL / ALT / VERT / HORIZ L/R), lander icons, multiplier and
  mission counter; zoom (`X`/`L` or the ZOOM button) doubles scale and follows;
  explosion/dust particles + shake; `?` pauses; DEV hook `__landerTest` and the
  DebugKit (PROGNOSIS re-rolls the pilot and reports whether the campaign is
  still winnable deathless).

## Controls

Arrows / pad rotate (left/right) and throttle (UP / SPACE / A button, hold).
X/L/ZOOM toggles zoom. `?` pauses. Tap the screen starts and restarts.

## Verify

```bash
npm run lint:lander            # eslint gate for this game + shared code
npm run landercheck            # 44 Node checks: determinism, terrain flatness,
                               # gravity/fuel/crash/dock rules, the pad ledger,
                               # 4-seed deathless campaign wins, the slack rule
npm run landercheck -- --mutate  # + 4 mutants (gravity off, softVert gate off,
                               # refuel off, frozen multiplier) — all must die
npm run landerplay             # advisory browser drive (needs npm run dev):
                               # start/thrust/rotate/zoom/crash/restart, HUD mirrors sim
```

The slack rule bites hard here: with **110 units cut from every tank** (240→130)
the same pilot script still wins the whole campaign **deathless**; at **115** it
loses outright — the fuel economy, the energy law and the timed launch are all
load-bearing.

## Fidelity notes and honest gaps

- Rotation is a direct stick rate (the original was a joystick rate too); there
  is no rotational inertia.
- The original's "large mission" module-separation/refuel is simplified to
  arcade-narrow: one craft, dock = proximity grapple (±20×±30u), refuel and go.
  Docking has no velocity-match requirement.
- The original campaign ran endless with the multiplier wandering by a die roll;
  ours steps ×1→×10 one per dock and ends the demoable proof at five docked
  missions (`TARGET_CYCLES`) — a terminal state is what a proof needs. The game
  is otherwise endless-shaped: raise `TARGET_CYCLES` in `CFG`-adjacent const and
  it keeps going.
- Foot contact is three point-feet, not articulated legs; a tilted ship clips a
  pad (`climb`) exactly like the cabinet's "your leg poked through the pad".
- Zoom is a crisp 1×/2× rather than the cabinet's analog scope.
- Multiplayer: none — the original was single-player.
