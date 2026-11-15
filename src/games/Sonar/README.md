# SONAR ABYSS — engine notes

An original: pitch-black sea caves you explore with sound. The whole title is
built around ONE law, enforced in code: **the painter may draw knowledge, never
truth** (`paint()` only ever sees `known()`/`eelContacts()` — a live eel
position is literally unreachable from the draw path).

## Layout
- `sim.js` — the game: seeded cave gen, ping wavefronts (BFS that does not
  cross ROCK, lights cells as the wave arrives), fade memory, fixed-route
  ping-pong eels, pearls, vent descents, lives. Plain Node-importable.
- `index.jsx` — the shell: deferred-reveal renderer, fixed-timestep loop
  (`SIM_MS = 50`, sim runs 20/s), input, HUD, DEV hooks.
- `attract.js` — cycling attract copy.

## The planner (`planStep` / `planRun` in sim.js)
The gate's witness, the attract demo's script, AND the WATCH driver. A BFS over
(cell, move#) states where the eel timeline is EXACTLY `step()`'s ping-pong
transition — a legality window is only honest if it agrees with the sim. It
reads truth (it is a prover, not a player) but emits only arrows and pings on
the player's own cadence (`CFG.moveEvery`, `CFG.pingCd`), so the cave its
route lights is lit honestly.

## Distance cue (#2365)
A contact blip records `ring` — the wavefront delay (ping bucket) at which sound
physically touched the eel. That is knowledge, captured inside `light()` at the
same BFS arrival that lights the cell, so heat/pitch can read nearness without
the draw path ever touching a live eel cell. `contactHeat(ring)` (sim.js) is
the pure, strictly monotonic map 1 → 0.12 over `CFG.cueRange` rings; frozen by
mutant switch `CFG.cue`. The painter lerps the mark cold violet-blue → hot red
with it (thicker, haloed, fast-pulsing when hot), and `handleEvents` rings an
echo per contact — nearer returns read lower and stack two ticks.

## WATCH (#1637 batch 14)
Y seats `planStep` into the real `playerMove`/`ping` on the sim's own cadence
(`watchingRef` gates the play branch of `doSim`). Reactive per tick — honest
mid-cave. Any driving key or tap hands back (shared blips); the end of the run
releases the seat silently. DEV probes: `__sonarTest.watching()`,
`watchSfx()`, `hint()` (planner's next call).

## Verify
```bash
npm run sonarcheck            # 210 checks: gen, wavefront honesty, determinism,
                              # eel timelines, distance-cue ring/heat (#2365),
                              # vent signal fresh/ghost/dark boundaries (#2367),
                              # vent-win crossings (20/20 seeds)
DEV_PORT=<p> npm run watchcheck -- --only sonar   # 182: seat pilot + source pins
DEV_PORT=<p> npm run sonarplay                    # real keys + pixels (#2365/#2367)
```

## The vent signal (#2367)
`ventSignal(g)` (sim.js) grades the vent cell through `known()`: 0 never heard,
1 remembered (dim ghost on canvas), 2 a front landed within `CFG.swirlFresh`
ticks — only then does the swirl ripple. The vent is fixed geometry, so
remembering it is ordinary knowledge; freshness is what keeps it *teaching*
("sound just confirmed this"). `sonarcheck` pins all three transitions to
computed wavefront ticks (ripple@arrival, ghost@arrival+swirlFresh+1, dark at
the fade edge) plus a re-hearing revival, and a `ventRipple:false` mutant dies
by name. Each live ping also strokes a faint expanding ring (with three trailing
echoes) from its source — the ring→distance mapping the #2365 heat cue leans on,
now visible; it draws from `gs.pings`, cells still light solely by BFS arrival.

## Honest gaps
- **CLOSED by #2365:** eels telegraph only via contacts; no distance cue on a
  ping's first lit ring — contacts now carry the ring that lit them and
  heat/pitch maps nearness (#2365).
- **CLOSED by #2367:** the vent swirl was drawn as soon as its cell was known —
  it now ripples only on a fresh front and ghosts otherwise; the ping ring
  teaches the distance mapping in pixels.

## Remaining polish candidates (#2367 follow-ups)
- Colourblind SHAPE cue on the heat mark (double stroke/chevron when hot) so
  near/far reads without hue.
- Haptics (`navigator.vibrate`) on hot contact / hit, gated behind feedback
  state so harness runs stay silent.
- Attract beat that pings an eel on a NEAR ring so the hot mark sells itself
  in five seconds (docs/ART.md bar 6).
