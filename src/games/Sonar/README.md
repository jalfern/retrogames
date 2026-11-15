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
npm run sonarcheck            # 198 checks: gen, wavefront honesty, determinism,
                              # eel timelines, distance-cue ring/heat (#2365),
                              # vent-win crossings (20/20 seeds)
DEV_PORT=<p> npm run watchcheck -- --only sonar   # 182: seat pilot + source pins
```

## Honest gaps
- **CLOSED by #2365:** eels telegraph only via contacts; no distance cue on a
  ping's first lit ring — contacts now carry the ring that lit them and
  heat/pitch maps nearness (#2365).
- The vent swirl is drawn as soon as its cell is known — a Pearl jam can hide it
  in plain light.
