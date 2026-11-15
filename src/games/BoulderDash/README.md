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

## The firefly's door (#2364)
`CFG.flyTravel`: the fly HOLDS its heading and turns in the fixed cycle
(down, right, up, left) only when steel, boulder, diamond or the world edge
blocks it — so it patrols every reachable cell instead of orbiting one pocket.
FLY PIT ships with a door for that: a two-cell dust seam in the pit's east
wall and a steel-lined flight corridor (rows 7/9 steel, dead end col 29)
across the cavern roof. The fly's first eastbound pass bores the seam (~tick
6) and shuttles pit<->corridor forever. Two laws keep it fair: fire never
crosses steel, so the chain stays inside pit+seam; the fly turns only against
steel, so its patrol never leaves the corridor dust-free — the harvest at
row 18 provably cannot burn (dashcheck's containment invariant). The corridor
cells the fly passes stay lit ~5 ticks (it ignites what it touches — even
air), and the gap in the tube floor at col 22 lets the player climb up and
play chicken: enter between the trail cooling and the next pass, or die.

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
npm run dashcheck             # 54 checks: every cave winnable, replay
                              # determinism, rule pins (crush, gem-dirt, fire),
                              # FLY RELEASE (#2364: escape, containment, chicken)
npm run dashcheck -- --mutate # 61: +7 — every CFG switch silenced goes red
DEV_PORT=<p> npm run watchcheck -- --only boulder-dash  # 182: seat pilot + pins
```

## Honest gaps
- No amoeboid/push walls from later BD variants — four classic-style caves only.
- The corridor patrol is a fixed shuttle (the fly turns only against steel, so
  it never weaves into the cavern proper the way an original butterfly could).
