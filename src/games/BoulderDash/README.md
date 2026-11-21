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

## Multi-head amoeba (#2444 — Boulder Dash's forking blob)
- **fork** (`'fork'`): the head advances on the same persisted-corner rule as the
  two-phase gait, THEN plants one perpendicular sibling head at the *same* cell
  (right offer first, then left). One origin therefore grows several fingers at
  once, each keeping its own heading and cornering independently — so the blob
  reaches around a pillar and encloses space, the signature BD amoeba look the
  README had flagged as missing. `amoFork` events mark each split.
- **Containment is a law, not a hope**: a wave adds at most ONE new head per
  growth pass (`forked` ledger) and never past `CFG.amoForkMax` live fronts, so it
  climbs to the finger budget and holds there; combined with `CFG.amoGens` expiry
  and the rule that growth claims only EMPTY/DIAMOND, the wave fills, hits its
  boundaries, then dissolves — it provably cannot flood the cavern (dashcheck's
  MULTI-HEAD section runs the wrap in a synthetic room and the containment + win
  on FORK BASIN, and the `amoFork` mutant turns the fork pin red).
- **FORK BASIN (cave 7)**: a dirt-ringed pocket holding a stone pillar, seeded
  with a single fork origin on its west wall and bait gems on its floor. The
  capped blob wraps the pillar (several fronts, several headings), dissolves its
  bait, then expires — the harvest seam at row 18 and the exit sit outside the
  ring and are never reachable by slime (pinned every tick of the planner run).
- The five pre-#2428 caves and GOO GALLERY stay byte-identical: `amoExt` only
  folds direction/variant when a level opts into variants, and no older cave
  uses `'fork'`.

## The butterfly drift (#2453 — the roaming critter weaves)
The originals had TWO flying critters: the boring, burning firefly (#2364's
door law) and the butterfly, which flitted through open ground changing course
on its own. Momentum-only turning happens exclusively against obstacles, so our
fly shuttled its corridor while the cavern proper stayed calm — the README's
oldest actionable gap. `sim.js` now has the second kind:
- **`meta.butterflies: [{x, y, dir}]`** maps to the same fly automaton with
  `drift:1, digs:0, ignites:0` — it FLAPS, it does NOT bore dust, it does NOT
  ignite. Contact is still fatal (cause `fly`, "COOKED").
- **The flap law**: hold heading (momentum intact); roll a deterministic hash of
  (fly id, tick, cell) ONLY when the way straight ahead is open ground
  (EMPTY/FIRE — never mid-bore); on a hit, turn right first, then left, and
  only onto cells that aren't blocked. In a 1-cell lined corridor every
  candidate is wall — **drift cannot perturb a predictable patrol by law**
  (dashcheck pins 600 ticks of zero flaps in a capped tube). Zero RNG, like
  every other cell of this CA.
- **`CFG.flyDrift`** mutes the flaps (mutant); **`flyExt`** folds the flap
  counter into `stateHash` ONLY when a level declares a butterfly — caves 1–7
  replay byte-identical, and dashcheck refuses drift state on any older cave.
- **GOSSAMER HOLLOW (cave 8)**: a steel-ringed gallery across the cavern roof
  with two pillars — the butterfly genuinely sweeps it (dashcheck pins ≥40
  flaps and ≥40 distinct cells in a synthetic chamber; dashplay counted 100
  live flaps on the real cave) — and a steel-lined tube at col 27 to the dig
  lanes below.
  Once the player opens the lane, the butterfly comes down and roams it: the
  harvest seam at row 18 provably stays cool (nothing in this cave ever burns —
  butterflies light nothing and the automaton only ever touches open ground),
  while a digger dawdling the lane gets eaten (pinned by replay).

## The transport butterfly (#2463 — the originals' gem-carrying stage)
`CFG.flyCarry` (levels opt in by declaring `dropCells` — `carryExt`, the
amoExt/flyExt pattern: caves without ferries hash and replay byte-identical):
- **The grab**: a free (unloaded, non-boring) butterfly flies ONTO a diamond
  and takes it instead of bouncing — the firefly burns, the butterfly hauls.
- **The release**: at a level-declared drop cell the cargo lets go — a real,
  collectable gem. The pad's steel floor is the law that keeps it a gem (no
  fall, no greed-convert). A pad still holding a gem REFUSES the next fly
  (diamonds block flies) — deliveries serialise, nothing is cloned, and a fly
  will not drop onto a digger squatting the pad (collection is never a coin
  flip).
- **The burden is mortal**: delivering perishes the bearer (`carryDone`) — the
  originals' "carries until it dies", our one honest simplification being that
  the burden itself is what kills (our flies are otherwise unkillable).
- **The dive is one-way**: `meta.mine` lists the loaded-only column down to the
  pad. An unburdened butterfly REFUSES mine cells (the weaver never dives), a
  loaded fly never climbs back out — so a loaded fly in the shaft is a delivery
  in progress, and containment of the harvest is a rule, not a hope. The
  planner's BFS treats the mine as void and escorts instead: with the quota
  short and no diggable gem left, `planStep` routes to the pad's face cell and
  waits — the escort branch is opt-in via carryExt.
- **SILK GULCH (cave 9)**: quota 6 = seam 3 + pocket gem 1 + TWO ferried
  (loaded butterflies `carry:1` at level). With `flyCarry` silenced the ferried
  supply stops existing — dashcheck strands the planner below quota and the
  gate goes red: the transport is the quota, not decoration.

## Verify
```bash
npm run dashcheck             # 235 checks: every cave winnable, replay
                              # determinism, rule pins (crush, gem-dirt, fire),
                              # FLY RELEASE (#2364: escape, containment, chicken;
                              # #2374: dust-mark seam pin),
                              # SLIME & BOLTS (#2411: wave growth/dissolve/decay/
                              # engulf, shove slide/crush/lift-refusal, vault
                              # end-to-end + pocket containment),
                              # AMOEBA FAMILY (#2428: corner-persist gait,
                              # down-first dropper, vise lockstep + no-crossing,
                              # GOO GALLERY containment + lids, frozen-floor
                              # replay hashes for caves 1-5),
                              # MULTI-HEAD (#2444: fork birth, >=2 heads/>=2
                              # headings, wrap-around-a-wall, hard head cap,
                              # dissolve, FORK BASIN containment + win),
                              # BUTTERFLY DRIFT (#2453: corridor-invariance by
                              # law, open-ground weave, GOSSAMER HOLLOW descent,
                              # sealed-lane law, cool harvest, flap-state hash,
                              # opt-in-only flyExt on caves 1-7),
                              # BUTTERFLY FERRY (#2463: pad laws — land/rest/
                              # serialise/perish, one-way dive, loaded-only
                              # mine, ferry-only strand with flyCarry muted,
                              # SILK GULCH live win, cargo-hash determinism +
                              # opt-in exclusivity, truthful marks)
npm run dashcheck -- --mutate # 250: +15 — every CFG switch silenced goes red
npm run dashplay              # 49 real-key checks: attract→play→win→restart on
                              # FLY PIT + SLIME VAULT + GOO GALLERY + FORK BASIN
                              # + GOSSAMER HOLLOW, waves expiring on their own
                              # clocks, butterfly flapping live, zero page errors
DEV_PORT=<p> npm run watchcheck -- --only boulder-dash  # 182: seat pilot + pins
```
`dashplay` paces the vault shoves at WORLD ticks: a 55 ms key loop can shove a
bolt past its pit between two gravity evaluations, which made the vault a
coin-flip under CPU load; waiting for `tick` to advance (world seconds, never
blind sleeps) makes it deterministic.

## Wall momentum (#2468 — the wall that falls and keeps sliding)

A push wall now remembers the way it was shoved. On flat ground nothing
changes — #2411's one-cell-per-shove law still rules. But a wall shoved
over a lip falls, and the fall converts the memory into live momentum:
from the cell it lands in it slides one cell per tick until steel, slime,
another wall or the world edge stops it, and then the momentum dies for
good. The slide keeps the shove's give/crush laws (empty and fire douse
and slide; boulder and gem are crushed — the gem is lost, not collected)
and flattens the player if they stand in the lane (FLATTENED, same cause
as a falling bolt). No drift mid-fall — gravity owns the descent; the
slide resumes only on ground.

- **Opt-in, byte-safe:** only caves declaring `momentum: true` (currently
  SLIDERS LEDGE) carry the state; momentum rides `stateHash` only in
  those caves (`momExt`, the amoExt/carryExt pattern) — every older cave
  replays byte-identical, and dashcheck's exclusivity pins refuse the
  flag anywhere else.
- **SLIDERS LEDGE (cave 10)** makes the combo load-bearing: the only
  road from the harvest to the exit gallery runs tube → shaft → corridor,
  and the vault bolt lands in the corridor's mouth. Without momentum the
  wall parks itself there forever (it cannot be shoved down), the cave is
  unwinable, and the `wallMomentum` mutant proves it red. With momentum
  the player follows the sound of the sliding wall down the corridor to
  a dead end where it spent itself against a decoy gem.

## Honest gaps
- **BLOCKED** (original-read: the corner-priority and player-reactive wave laws
  are exactly what BD II source or long play footage would settle; neither is
  in the repo and FORGE.md's network boundary forbids guessing — slot-a lane
  ruling 2026-11-16: "the SPLIT law stays un-specced until originals are read;
  inverting the drift is invention, not the game"). Unblocks by: BD II amoeba
  disassembly or verified frame study landing in-repo. The amoeba family is our
  reading of BD II/the originals — honest
  simplifications: the corner priority is fixed (right, then left) for both the
  two-phase gait and the #2444 fork; the dropper's lateral resume keeps its
  original heading; the fork's perpendicular sibling pick is fixed (right first);
  and no wave behaviour depends on the player or on distant events (the originals'
  amoebas are equally dumb). The multi-head *shape* is here (#2444) — rarer still
  are waves whose heads reverse or spawn on player action; those are not.
- **BLOCKED** (faithful-to-era non-feature: the originals' era has no pull law
  to read, so inventing one is design, not restoration — and Jon's games are
  restorations). Unblocks by: a source/footage read showing a pull mechanic in
  the era, or Jon asking for one. No pull mechanics (faithful to the era, but a
  simplification). (The
  fall-and-keep-sliding half of the push-wall family landed in #2468 —
  see Wall momentum above; SLIDERS LEDGE proves it live.)
- **DISCLAIMER** — The butterfly (#2453) flits, and since #2463 it also *carries* (SILK GULCH).
  Honest simplifications of the transport: the burden perishes at the drop
  (the originals' carriers could also be shot down mid-air — nothing shoots
  here), one gem per bearer, and the load is chosen by the level (a born-loaded
  transport), not picked from a vault the wings alone could seal (in this CA the
  digger can always dig where the fly can fly — so the ferry's exclusivity is
  supply arithmetic + the loaded-only mine law, proven by the strand test).

## First-timer pass (#2875 — shell/renderer only, sim untouched)
Playing cave 1 reading only the screen, four things hid the game from a
newcomer. All four live in `index.jsx`; watchphonecheck now pins the geometry
(`bd:` rules) so none can drift back:
- **HUD vs chrome**: the strip spanned the viewport, so the fixed ARCADE
  button sat on the level name and PAUSE+mute covered the score. The row is
  inset `5.5rem` / `8.25rem` past the corner clusters — clear at any aspect.
- **WATCH pill**: docked bottom-left it sat over the spawn chamber for the
  whole run. It now hides while a human drives (seats via the attract pill,
  the PAUSE row, or Y) and appears only *while watching*, at the fleet
  3.5rem-under-PAUSE dock, as the ◼ TAKE switch.
- **Open exit**: meeting the quota only greened the tiny HUD word; the door
  stayed a dark square with one green pixel and got dug past. The door now
  flashes on the CA's own beat (8-tick) under a one-cell green halo — and
  since attract paints the same block, the demo teaches the door too.
- **Time bar**: it shrank unlabeled. It now reads `TIME` with a live seconds
  countdown beside the bar (`meta.timeTicks / caHz`, synced with the HUD).
