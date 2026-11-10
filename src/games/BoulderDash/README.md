# BOULDER DASH — engine notes

The 1984 Origin Systems classic: dig, gather the gem quota, reach the exit —
while everything you loosen obeys gravity. The cave is a cellular automaton and
the CA IS the game: `sim.js` runs it at `CFG.caHz` (classic pace), the shell
just paints and listens.

## Layout
- `sim.js` — cell types, the CA (fall/roll boulders and gems, fire spread from
  the firefly, crush rules, gem-to-dirt when the paydirt goes), quota + exit,
  timer, `stateHash`. Zero RNG — caves are hand-carved grids (`levels.js`).
- `index.jsx` — the shell: painter, fixed-timestep loop (`CA_MS = 1000/caHz`),
  input (tap steps instantly, hold auto-steps every `MOVE_STEP`), HUD, DEV hooks.
- `attract.js` — cycling attract copy.

## The planner (`planStep` / `planRun` in sim.js)
BFS over diggable cells to the nearest gem (gems are doors, never corridors —
tunneling through a vein drops it), then to the exit; one arrow every
`CFG.moveEvery` ticks. dashcheck refuses to call a cave shipped unless this
planner brings the quota home and reaches the door.

## WATCH (#1637 batch 14)
Y seats `planStep` into the real `playerMove` on the CA's own cadence
(`watchingRef` gates the play branch of `doSim`). Reactive per tick — honest
mid-cave. Any driving key or tap hands back (shared blips); the exit door or a
crush releases the seat silently. DEV probes: `__dashTest.watching()`,
`watchSfx()`, `hint()` (planner's next arrow).

## Verify
```bash
npm run dashcheck             # 47 checks: every cave winnable, replay
                              # determinism, rule pins (crush, gem-dirt, fire)
DEV_PORT=<p> npm run watchcheck -- --only boulder-dash  # 182: seat pilot + pins
```

## Honest gaps
- No amoeboid/push walls from later BD variants — four classic-style caves only.
- The firefly wanders its steel cell; it never escapes it as the original's
  firefly sometimes could through open corridors.
