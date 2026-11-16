# BOULDER DASH — engine notes

The 1984 Origin Systems classic: dig, gather the gem quota, reach the exit —
while everything you loosen obeys gravity. The cave is a cellular automaton and
the CA IS the game: `sim.js` runs it at `CFG.caHz` (classic pace), the shell
just paints and listens.

## Layout
- `sim.js` — cell types, the CA (fall/roll boulders and gems, fire spread from
  the firefly, crush rules, gem-to-dirt when the paydirt goes, the amoeba wave
  and push walls — #2411), quota + exit, timer, `stateHash`. Zero RNG — caves
  are hand-carved grids (`levels.js`).
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

## Firefly polish (#2374, renderer only — the sim is untouched)
- **Dust tint**: `meta.dust` lists the seam cells; the painter gives them a dry
  gold sparkle so the bored-open door reads before it ignites. dashcheck pins
  the marks stay exactly the two ignitable seam cells.
- **Comet trail**: the shell keeps the fly's last 10 cells (`trail`, decays per
  CA tick) and paints them as fading amber — the shuttle lane is telegraphed.
- **Corridor chirp**: the fly's first corridor entry per level plays a distant
  two-tone warning (`alarmed`). Attract runs the same loop, so the demo teaches
  the escape unprompted. Mobile at 640x426 `?lite=1`: pad mounted, stick push
  or canvas tap each step one cell (verified 8/8, zero page errors).

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

## Slime & bolts (#2411 — the later-variant elements)
- **Amoeba** (Boulder Dash II, Origin 1985): `AMO_HEAD/AMO_BODY` cells driven by
  a generation clock (`amoGen`, `amoPass`). Every `CFG.amoEvery` ticks one growth
  pass: heads (the newest generation) extend along `meta.amoebaDir`; a head whose
  way ahead is shut branches perpendicular, so the blob flows around corners.
  Growth claims only EMPTY and DIAMOND — a touched diamond dissolves; uncarved
  DIRT, steel, boulders and fire are walls. Bodies expire after `CFG.amoGens`
  generations, so the wave *advances* rather than fills. Growing onto the digger
  engulfs them; stepping into slime is fatal either way.
- **Push walls** (`PUSHWALL`): solid to gravity and rolling, one arrow-shove
  slides them one cell horizontally (BD law: nothing is lifted — vertical shoves
  fail). The shove crushes a boulder or gem in its path — crushed loot is lost,
  not collected. A pushed wall obeys gravity: SLIME VAULT's doors are bolts over
  pits; shove them off the ledge and they drop out of the corridor. A resting
  bolt never crushes; a falling bolt crushes like a boulder (`deathCause`).
- **SLIME VAULT (cave 5)**: a full-height steel divide — the only way east is a
  two-bolt tube. Push + gravity opens bolt one; push + crush + gravity opens the
  choke. Below the tube, a dirt-ringed slime pocket eats its bait vein. The
  harvest sits west of the divide, and the wave can only claim EMPTY/DIAMOND —
  dirt walls are absolute — so dashcheck proves across the planner win-run that
  slime never leaves its pocket and both bolts are genuinely worked
  (`push`≥4, `crush`===1, pushwall `fell`≥2).

## The amoeba family (#2428 — Boulder Dash II's three gaits)
`sim.js` gives every slime cell a wave id (`amoWave`), a heading (`amoHead`,
index into `AMO_D4`) and a variant (`amoVar`), so one automaton runs several
creatures per cave. Levels declare variants: `meta.amoebaVariant` for the grid-
seeded primary wave, `meta.amoebas: [{cells, dir, variant}]` for extra waves
(omit `dir` and wave 1 mirrors the primary 180°).
- **classic** (`'classic'`, the #2411 law, byte-identical): extend along the
  heading; shut in, leak both perpendiculars (up then down), children inherit
  the parent's heading.
- **two-phase** (`'twophase'`): drive while the way is open; shut in, CORNER —
  right turn first, then left — and the new heading persists into the children.
  The wave turns as one creature, square corner after square corner, instead
  of leaking both ways. `amoTurn` events mark corners.
- **drop** (`'drop'`): DOWN is always the first offer; when the floor arrives
  it resumes its lateral heading. Poured into a shaft it stacks from the
  bottom up. `amoDrop` events mark pours.
Two waves claiming the same growth pass fire `mirror` — the vise receipt.
Knobs `CFG.amoTurn` / `CFG.amoDrop` silence the cornering/pour laws so
`--mutate` can prove them load-bearing; a silenced variant falls back to the
classic law rather than freezing.
- **GOO GALLERY (cave 6)**: three sealed pockets — a two-phase chamber with
  bait gems in its drive lane (ON the pocket floor: loose gems over air fall
  and greed-turn to dirt before the wave ever arrives — construction rule 1,
  paid for again in #2411 and re-pinned here), a one-column shaft for the
  dropper, and a two-row corridor holding mirrored classic waves seeded at
  both ends. Containment is the same law as the vault: growth claims only
  EMPTY/DIAMOND, uncarved DIRT is absolute — dashcheck sweeps every tick of
  the planner win-run and the harvest at row 18 provably stays out of reach.
- **The frozen floor**: variant state rides `stateHash` only when a level
  actually has variant waves (`amoExt`); the five older caves replay to their
  recorded hashes (`e2536bb0 / afc3579 / fb495932 / 580a2db5 / fd18f2fb`) —
  dashcheck's FROZEN FLOOR section refuses any drift.

## Verify
```bash
npm run dashcheck             # 134 checks: every cave winnable, replay
                              # determinism, rule pins (crush, gem-dirt, fire),
                              # FLY RELEASE (#2364: escape, containment, chicken;
                              # #2374: dust-mark seam pin),
                              # SLIME & BOLTS (#2411: wave growth/dissolve/decay/
                              # engulf, shove slide/crush/lift-refusal, vault
                              # end-to-end + pocket containment),
                              # AMOEBA FAMILY (#2428: corner-persist gait,
                              # down-first dropper, vise lockstep + no-crossing,
                              # GOO GALLERY containment + lids, frozen-floor
                              # replay hashes for caves 1-5)
npm run dashcheck -- --mutate # 146: +12 — every CFG switch silenced goes red
npm run dashplay              # 36 real-key checks: attract→play→win→restart on
                              # FLY PIT + SLIME VAULT + GOO GALLERY, waves
                              # expiring on their own clocks, zero page errors
DEV_PORT=<p> npm run watchcheck -- --only boulder-dash  # 182: seat pilot + pins
```
`dashplay` paces the vault shoves at WORLD ticks: a 55 ms key loop can shove a
bolt past its pit between two gravity evaluations, which made the vault a
coin-flip under CPU load; waiting for `tick` to advance (world seconds, never
blind sleeps) makes it deterministic.

## Honest gaps
- The two-phase and drop variants are our reading of BD II's amoeba family —
  one honest simplification each: the corner priority is fixed (right, then
  left) and the dropper's lateral resume keeps its original heading; no wave
  behaviour depends on the player or on distant events (the originals' amoebas
  are equally dumb, but the rarer multi-head wave shapes are not here).
- A push wall slides on flat ground only — there is no "wall falls and keeps
  sliding" combo, and no pull mechanics (faithful to the era, but a simplification).
- The corridor patrol is a fixed shuttle (the fly turns only against steel, so
  it never weaves into the cavern proper the way an original butterfly could).
