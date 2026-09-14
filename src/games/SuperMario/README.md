# Super Mario Bros — engine notes

Deep notes for `src/games/SuperMario/index.jsx` (the live build) and the four ways
to play it. This used to live in `AGENTS.md`, where it had grown to a third of that
file; `AGENTS.md` now just points here.

For the verification tooling, see **Harness** below, and `AGENTS.md` → *Self-verifying*.

## Options menu & versions

The title screen has a tappable **OPTIONS ▸** button (top-right) *and* accepts `?` at the
title (in-game `?` still pauses). Both open the **OPTIONS menu**, rendered as **DOM buttons**
over the canvas (touch-friendly; also keys 1–4 / arrows+Enter / Esc). A lone modifier (e.g.
Shift on the way to `?`) is ignored on the attract/end screens so it can't accidentally start
the game.

The engine mirrors its screen into React via `syncUi()` (called each `draw`) → `ui.screen`
(`attract|menu|end|none`); DOM overlays read it, and imperative actions go through
`apiRef.current` (`{ openMenu(), choose(i), back() }`). The virtual gamepad (`VirtualControls`)
is hidden unless `ui.screen === 'none'` (actual play).

| # | Option | How it works |
|---|--------|--------------|
| 1 | Play latest | the current engine, `mode === 'play'` |
| 2 | Play original one-shot | pristine `v1-one-shot` engine vendored as `src/games/SuperMarioClassic/` (route `/mario-classic`, `hidden: true`, reached only via the menu). Its `?` returns to the menu (`/mario?menu=1`). |
| 3 | Watch CPU autoplay | `mode === 'autopilot'` |
| 4 | Watch CPU learn | `mode === 'evolve'` |

## Piranha plants

Pipe-dwelling hazards in `1-1` (pipes 46, 101, 129) and `1-2` (35, 128). Deliberately **not**
on the warp pipe (57) or the underground pipe (140) — both must stay enterable — nor on the
exit pipe in 1-2.

**Motion** (`plantTick`): no gravity, no walking — it rides its pipe. A `RISE 22 / OUT 72 /
SINK 22 / GONE 64` frame cycle (~3.2s), staggered per plant by a `delay` from the level def so
they don't breathe in sync. `out` is 0..1.

**The hitbox is exactly the emerged part** — `h = round(PLANT_H * out)`, `y = pipeTop - h`. So a
fully retracted plant has `h = 0` and cannot touch anything, which is what makes standing on a
pipe lip safe *right up until* the head breaks the surface. Drawing uses the same truth: the
12×26 sprite is drawn at its animated `y` and clipped at `pipeTop`, so it rises head-first out
of the pipe. Don't special-case either one; they are the same number.

**Rules:** never stompable (any contact hurts), killed by fireballs, immune to shells. Spawn
position is derived by scanning the grid for the pipe top (`pipeTopRow`) rather than hard-coding
a height, so moving a pipe can't desync a plant.

**Autopilot:** it must *not* stall. Standing still in 1-1 is fatal — a goomba spawned at col 41
bounces off pipe 38 and walks straight into a parked Mario. The commit distance is **solved
from the jump arc** rather than tuned: `v0 = JUMP_VEL + |vx|·0.18` against `GRAVITY_HOLD` while
rising, solving how many frames the climb to the plant's head takes and taking off that many
frames early. A fixed 46px cleared as small Mario and jammed big Mario face-first into the pipe
wall — a 4-tile pipe needs ~12 frames of climb, a 2-tile pipe ~8. Measured clearance through a
**fully extended** plant: 49px at pipe 101.

Fireballs bounce about one tile (`vy = -3.6`, `g = 0.4`) and die on the pipe wall, so a plant
riding a 4-tile pipe is **not** burnable from the ground — the jump is the only answer there.
(Fire Mario does burn them, but only by throwing from above the lip mid-jump.)

## Option 3 — autopilot

A rule-based controller (`autopilot()` in the engine) that clears 1-1 **perfectly at normal
speed** — jumps pits/pipes, clears piranha plants, hops Goombas, and is Fire Mario from col 16
onward. Deterministic: it wins 1-1 with all lives, every time. That determinism is why it can be
a regression gate: `npm run autopilotcheck`.

Two rules are load-bearing and were both wrong once:

- **`?` blocks are bumped from directly underneath.** The rule used to aim at `frontCol + 1`,
  which lifts off a tile early; measured, the head crossed the block's row at x=244 while the
  block's column starts at x=256. Twelve pixels short, every single run, so the autopilot was
  *never* Fire Mario and the entire fire branch — every fireball it throws — was dead code that
  had literally never executed. It now jumps when the block is inside Mario's own span.
- **Goomba hops near a plant pipe are a 4-frame tap**, not a full hop. A full hop travels
  ~110px, which lands Mario past the last usable take-off for the next pipe; the pipe then gets
  eaten mid-climb. Taking the hop *earlier* instead (dx<58) was worse — he landed on the goomba
  and died at col 45.

> **Known bug (pre-existing, found while adding plants):** the autopilot is *never* Fire Mario.
> Its `?`-block rule jumps on `frontCol + 1`, so it leaves the ground a tile early and sails
> over the fire flower at col 16. It still clears 1-1 by hopping everything, which is why this
> went unnoticed — but the "burns Goombas" fire path in the code has never actually executed.
> Fixing the jump offset would make the showcase strictly stronger and trivialise the plants.

## Option 4 — neuroevolution

A genuine **neuroevolution** GA running live in the browser.

**Controller:** recurrent **24→10→5** tanh MLP (`evolveDrive`/`evoSense`/`forwardNN`). The 10
hidden units feed their previous activations back (`evoH`), giving jump-timing memory.
Sensors: wide ground/pit lookahead (cols +2/+4/+6/+8), wall height, enemy approach +
on-ground-stompability, coin/powerup proximity, progress to flag, and three piranha signals —
presence (21), how far out of its pipe (22), and a **band-pass LEAP window** (23) that peaks at
~2.75 tiles.

> The band-pass one matters. A monotone "plant is somewhere within 10 tiles" sensor is close to
> useless for jump *timing*: hand-built controllers using it jump 10 tiles early and bounce into
> the pipe. Encoding "leap now" as a peak is what makes the behaviour buildable and evolvable.

**Fitness:** distance + coins·10 + stomp/powerup bonuses + end-game milestones (cols
145/160/170) + a big flag-win bonus (6000). *No death penalty — that created a zero-gradient
trap.*

**GA:** `POP=24`, 3 elites, tournament + crossover, **annealed** gaussian mutation, immigrant
injection on stagnation. The fresh population is **seeded** with a hand-designed
"jump-on-obstacle" genome so gen-1 already reaches ~col 123.

**Presentation:** `POP` genomes play 1-1 in **turbo** (12 headless steps/frame — a fast,
silent montage); each new record is then **replayed once at normal speed with sound** as a
showcase. Best genome persists to `localStorage['mario-evo-v2']` so it keeps improving across
reloads. HUD shows `GEN · BEST`, a distance progress bar with a red best-ever marker, and a
`»»` turbo / `▶ SHOWCASE` tag.

**Honest baseline** (cold start, `localStorage` cleared, seeded population, this machine,
60 generations):

| | fitness | bestCol | champion replay reaches |
|---|---|---|---|
| before plants | 1981 / 2202 / 2422 / 2819 | 141–147 | col ~140 |
| **with plants** | 1696 / 2102 / 2513 / 2558 / 2872 / 2912 / 3160 / 4566 | 103–134 | col 94–122 |

So plants cost the GA roughly **25 columns**. It has never finished 1-1: the flagpole is col
174. Two known contributors, both measurable:

1. **The seed commits its jump too early.** `seedGenome` weights the wall sensor at +4 tiles
   (`in[11]`), which is right for pits and wrong for a plant pipe — the agent is already
   *descending* as it crosses the pipe and clips the plant's head. The autopilot proves the
   jump wants to happen at ~2.75 tiles instead.
2. **No overhead/ceiling lookahead**, and `evolveDrive` gates jumping on `onGround` *and*
   subtracts `-0.3` per jump when nothing dangerous is sensed — a gradient that discourages
   the staircase hop (relaxed for plants via `inp[22]`/`inp[23]`).

> Earlier notes here claimed `evoTrain(60)` reaches ~5500. That was a **warm** run — the
> persisted-genome-in-`localStorage` path, which compounds across reloads. A cold CI-style
> run tops out nearer 2500. `npm run evocheck` measures the cold number, asserts ≥900 plus a 1.5x gain over its own gen-1, and
> **replays** the champion to report the column it truly reaches — it no longer infers a win
> from `fitness >= 6000`, because that inference once reported a flagpole clear that a replay
> could not reproduce.

### Gotchas

- `forwardNN` index bases must stay `bi=NI*NH, bh=bi+NH*NH, bo=bh+NH, ob=bo+NH*NO`. An
  off-by-`NH` makes the output bias read out of bounds → `NaN` → the agent can never jump and
  every episode dies identically at the first Goomba.
- The evolve HUD is a **separate render path** from `drawHUD()` (which is skipped entirely in
  evolve mode). The canvas backing store is HiDPI-scaled (~1520×1425 for a 256×240 logical
  view), so anything sampling it must scale the HUD band height too — see `evocheck.mjs`.

## DEV test hooks

`index.jsx` exposes `window.__marioTest` — **only under `import.meta.env.DEV`**, so every
check below must target the dev server, never a production build:

```
start() getState() openMenu() choose(i) autoplay() evolve() evoTrain(gens)
evoProbe(weights?) evoBest() evoReset() evoState() teleport(col[, standRow])
setPower('small'|'big'|'fire') throwFire() powerUp()
startFlag() clearLevel() gotoLevel(i) enterBonus() enterUnder() warpUp()
isDetour() plants() enemies() powerups() musicState() musicPeak()
```

- `getState()` also returns `x`, `y`, `h` (added for the plant clearance checks — `col` alone
  can't prove where Mario actually is).
- `teleport(col)` only sets x, so Mario keeps his height and drops. Pass `standRow` — the solid
  row to stand ON — to place him precisely, e.g. `teleport(47, 9)` puts him on the lip of the
  4-tile pipe at col 46. Using `teleport(46)` alone embeds him in the pipe at ground level, and
  a check that does that will silently prove nothing.
- `plants()` / `enemies()` / `powerups()` snapshot the field for assertions.

- `evolve()` starts the live GA.
- `evoTrain(gens)` fast-forwards `gens` generations headlessly → best-fitness-per-gen history.
- `evoProbe(weights?)` runs **ONE** episode with a given (or random) genome →
  `{ maxCol, epSteps, state, jumps, trace }`. This is the key tool for debugging the
  controller — see `npm run evoprobe`.
- `evoBest()` returns current best-ever weights; `evoReset()` clears persisted evolution.
- `evoState()` → `{ mode, gen, bestFit, bestCol, col, epIndex, showcase, pop, NI, NH, NO, WLEN }`.

## Worlds 1-3 and 1-4

The progression is `LEVELS = [LEVEL_1, LEVEL_3, LEVEL_4]` — clear 1-4 and the game ends
(`advanceLevel` falls through to `state = 'win'`). 1-2 and the bonus room are deliberately
*not* in `LEVELS`: they are pipe detours that warp back, exactly how the original reaches them.

**1-3 (athhetic)** inverts the usual contract — the ground is the exception, not the rule.
Every long gap is crossed on floating platforms at alternating heights, so the coin trail
*doubles as the route hint*: it shows the next landing before you commit to the jump. The
platform chains and the pit list must agree exactly, which is what `levelcheck` verifies.

**1-4 (castle)** adds two hazards the rest of the game does not have:

- **Lava** — pits whose floor is drawn molten. There is deliberately no second collision
  path: the kill is the same fall-death the 1-1 pits use, and the lava is what makes the
  edge legible in a dark room instead of a guess.
- **Firebars** — a pivot with `len` flame balls on a rotating arm. Pure rotating geometry
  that ignores the tilemap, so placement is the entire design problem. The usable band is
  narrow because the level has a brick ceiling at row 2 (bottom y=48) and a floor at row 13
  (top y=208): with `radius = len*14 + 6`, a pivot must satisfy
  `48 + radius < y < 208 - radius`. That leaves rows 6–9 for a len-3 bar and only rows 7–8
  for a len-4 — a len-4 bar at row 9 reaches the floor.

Two rules keep a firebar honest. The **hit test and the draw loop walk the same ball
positions** (`i * 14` along the arm) — colliding one set of positions while drawing another
is the classic way to ship a firebar that kills you off-screen. And fire **kills outright**
(`die()`, not `hurt()`): no power-up saves you from the fire, same as lava.

## Harness

| Command | Asserts |
|---------|---------|
| `npm run verify` | the whole suite below, with a summary; non-zero exit on any failure |
| `npm run verify -- --full` | same, with the full 60-generation evolution check |
| `npm run mariocheck` | title/menu/touch: lone Shift must not start, `?` + OPTIONS open the menu, keys 1–4 work, BACK/ESC work, gamepad hidden on menus |
| `npm run autopilotcheck` | option 3 clears 1-1 twice — as it plays (must reach Fire Mario) and with fire taken away (must jump the plants) |
| `npm run plantcheck` | plant cycle, hitbox==emerged-part coupling, hurts-only-when-out, safe-when-retracted, not stompable |
| `npm run levelcheck` | geometry audit of every world: no pit wider than a jump, a landing chain that reaches the flagpole, firebar clearance, lava over real holes |
| `npm run evocheck` | option 4 learns (cold-start fitness ≥900 after 60 gens, and ≥1.5x its own gen-1) + the evolve HUD actually renders |
| `npm run evoprobe` | per-genome diagnostics: named hand-built controllers, random floor, and the evolved champion (`--preset`, `--random N`, `--best`, `--trace`) |
| `npm run audcheck` | chiptune engine steps + produces an `AnalyserNode` signal |
| `npm run shot -- ...` | screenshot capture (see `AGENTS.md`) |

All of them need `npm run dev` running in another terminal, and fail fast with that
instruction if it isn't.

**`scripts/.shots/` is for captured images only.** It was previously gitignored wholesale,
which silently swallowed ten one-off driver scripts written during iterations 11–13; those
have been promoted into tracked `scripts/` and the ignore now covers `*.png`/`*.jpg` only, so
a script dropped there shows up as untracked instead of vanishing. Harness code goes in
`scripts/` and gets an npm alias.

To reproduce the captures the deleted drivers made:

```bash
npm run shot -- --no-start --out scripts/.shots/attract.png   # --no-start keeps the title screen up
npm run shot -- --no-start --eval "window.__marioTest.openMenu()" --out scripts/.shots/menu.png
npm run shot -- --eval "window.__marioTest.evolve();window.__marioTest.evoTrain(3)" --prewait 1500 --out scripts/.shots/evolve.png
```

### Capture-timing gotcha

In `shot.mjs` the `--eval` runs *first*, then `--prewait`, then `--settle`, then the
screenshot. A transient effect (a spark burst, a power-up twinkle) spawned directly in
`--eval` has already expired by capture time. Fire it *just before* the shot with a timer:

```bash
--eval "...; setTimeout(()=>window.__marioTest.powerUp(), 2350)" --prewait 2350 --settle 150
```

### Teleport-onto-enemy artifact

`teleport(col)` can drop Mario on a Goomba (→ "OUCH!"). Pick a clear column (e.g. 8, 58) for
clean beauty shots.

### Minified live-verify

Function names don't survive the prod build. Verify a deploy by grepping the served bundle for
a unique *string literal* you added (e.g. a color `#e0a000` for the gold warp pipe), not a
symbol name.

## Known gaps / next steps

- **Evolve never finishes 1-1** (champion replay col 94–122 vs flagpole 174). Plants moved it
  backwards ~25 columns; the seed's +4-tile wall jump is the first thing to attack, and
  `npm run evoprobe -- --preset plant-jumper --trace` is the tool for it.
- **Autopilot grazes one plant in the no-fire pass** (col 46, feet ~12px below the head, costs
  power not a life). Root cause is a level-level conflict, not a formula bug: the goomba at
  col 41 forces a hop that lands ~15px past the last usable take-off for the col-46 pipe. Every
  lever tried either trades it for a worse failure or re-times the whole level. `autopilotcheck`
  reports it as a flagged `GRAZE` rather than gating it, and hard-gates a clean clearance
  elsewhere (col 101, 55px) so the arc solver cannot rot silently.
- **Small Mario cannot clear the col-46 plant pipe.** The no-fire pass is therefore pinned to
  Big. The commit distance solves the arc from the feet, which are size-independent — but the
  *approach* is not: the goomba hop and the `?`-block bumps arrive at a different phase, and as
  small Mario he takes the jump ~15px late and dies. Real bug, unfixed, deliberately not hidden
  by testing only the size that passes.
- **The autopilot only knows 1-1.** Its rules are tuned to that level's geometry, so when it
  clears 1-1 it walks into an athletic pit in 1-3 and dies. `autopilotcheck` therefore stops at
  the flag — which is the actual win condition for "did it clear 1-1" — rather than pretending
  the whole game is in scope.
- **No 1-up mushroom** (`coins % 100 === 0` silently adds a life; no 1-up block exists).
- **No moving or half-solid platforms.**
- **No Bowser, no axe, no bridge** in 1-4. It ends on a flagpole like every other level;
  the castle finale of the original is the last big piece of 1-4 still missing.
- `LEVELS = [LEVEL_1, LEVEL_3, LEVEL_4]`. 1-2 and the bonus room stay pipe detours that
  warp back, which is also how the original reaches them.
  so "WORLD 1-1 CLEAR" leads nowhere — 1-3 (athletic) and 1-4 (castle) would close World 1.
