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

## Option 3 — autopilot

A rule-based controller (`autopilot()` in the engine) that clears 1-1 **perfectly at normal
speed** — jumps pits/pipes, hops/burns Goombas. Deterministic: it wins 1-1 with all lives,
every time. That determinism is why it can be a regression gate: `npm run autopilotcheck`.

## Option 4 — neuroevolution

A genuine **neuroevolution** GA running live in the browser.

**Controller:** recurrent 21→10→5 tanh MLP (`evolveDrive`/`evoSense`/`forwardNN`). The 10
hidden units feed their previous activations back (`evoH`), giving jump-timing memory.
Sensors: wide ground/pit lookahead (cols +2/+4/+6/+8), wall height, enemy approach +
on-ground-stompability, coin/powerup proximity, progress to flag.

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

**Honest baseline** (cold start, `localStorage` cleared, seeded population, this machine):

| run | fitness after 60 gens | bestCol |
|-----|----------------------|---------|
| 1 | 1981 | 147 |
| 2 | 2202 | 141 |
| 3 | 2422 | 145 |
| 4 | 2819 | 145 |

Reliable depth is **~col 140 of 212**; the flagpole is col 174, so **the GA does not yet
finish 1-1** — a hard late pipe corridor (pipes at 118/129/140 + the brick cluster at
130–132 + the 8-step staircase from 160) caps it for a net this size. This is the main open
item. Suspected causes: `evoSense` has **no overhead/ceiling lookahead** (only ground +2..+8
and walls at +1/+2/+4), and `evolveDrive` both gates jumping on `onGround` *and* subtracts
`-0.3` per jump when no pit/wall/enemy is sensed — a gradient that discourages the
staircase hop.

> Earlier notes here claimed `evoTrain(60)` reaches ~5500. That was a **warm** run — the
> persisted-genome-in-`localStorage` path, which compounds across reloads. A cold CI-style
> run tops out near 2400. `npm run evocheck` measures the cold number and asserts ≥1500.

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
evoProbe(weights?) evoBest() evoReset() evoState() teleport(col)
setPower('small'|'big'|'fire') throwFire() powerUp()
startFlag() clearLevel() gotoLevel(i) enterBonus() enterUnder() warpUp()
isDetour() musicState() musicPeak()
```

- `evolve()` starts the live GA.
- `evoTrain(gens)` fast-forwards `gens` generations headlessly → best-fitness-per-gen history.
- `evoProbe(weights?)` runs **ONE** episode with a given (or random) genome →
  `{ maxCol, epSteps, state, jumps, trace }`. This is the key tool for debugging the
  controller — see `npm run evoprobe`.
- `evoBest()` returns current best-ever weights; `evoReset()` clears persisted evolution.
- `evoState()` → `{ mode, gen, bestFit, bestCol, col, epIndex, showcase, pop, NI, NH, NO, WLEN }`.

## Harness

| Command | Asserts |
|---------|---------|
| `npm run verify` | the whole suite below, with a summary; non-zero exit on any failure |
| `npm run verify -- --full` | same, with the full 60-generation evolution check |
| `npm run mariocheck` | title/menu/touch: lone Shift must not start, `?` + OPTIONS open the menu, keys 1–4 work, BACK/ESC work, gamepad hidden on menus |
| `npm run autopilotcheck` | option 3 clears 1-1 with no deaths |
| `npm run evocheck` | option 4 learns (cold-start fitness ≥1500 after 60 gens) + the evolve HUD actually renders |
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

- **Evolve never finishes 1-1** (~col 140 vs flagpole 174). See *Option 4* above.
- **No piranha plants** — the 8 pipes in 1-1 are inert. Biggest missing SMB mechanic, and
  the reason the late corridor is uninteresting for the GA.
- **No 1-up mushroom** (`coins % 100 === 0` silently adds a life; no 1-up block exists).
- **No moving or half-solid platforms.**
- `LEVELS = [LEVEL_1]` only. 1-2 and the bonus room are pipe-reached detours that warp back,
  so "WORLD 1-1 CLEAR" leads nowhere — 1-3 (athletic) and 1-4 (castle) would close World 1.
