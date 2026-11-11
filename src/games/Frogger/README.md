# FROGGER (1981, Konami)

Five homes, four river lanes, five roads and a rest lane: hop, ride, dive
turtles, beat the clock. Fly house = +200, level clear = +1000, lanes speed up
12% per level (cap 1.8×).

## Engine notes
- **b25 (#1637): the whole rule set lives in `sim.js`** — `makeRun`,
  `buildWorld`, `hop`, `tickFrogger`. `index.jsx` is the shell (draw, sound,
  pause, chrome, seat); the browser and the Node harness drive one identical
  tick, so what froggercheck proves is what ships.
- `sim.js` holds the world-spawn dice: each floating lane's dive-phase offset
  (`t`) and which home hosts the fly. Both draw from the injected `rand`
  (`seedRng(seed)` upstream), so a seeded world reproduces its traffic exactly
  — at every level, not just the first. The b25 watchcheck source pin
  (`no dice outside the seeded stream`) keeps a stray `Math.random` out.
- **Seed (#1473 batch 15):** lane offsets, the bonus house and the attract
  pilot's wobble hops all ride ONE seeded stream; `startGame()` regenerates
  the seed at every human start and `?seed=N` replays the exact traffic.
  Production report: `{tick,score,done,seed,lives,level}`. DebugKit (F1) shows
  the seed/house row and can hop or force a game over through the real death
  path.
- The attract demo plays by the same rules as the player (`demoStep` drives the
  real `hop`), and the splat freezes under GAME OVER.
- **WATCH driver — `watchStep(gs)` (b25):** while seated, each tick scores the
  nine candidate hops by replaying the game's OWN forward arithmetic (analytic
  lane spans with drift + speedMult, dive phase, crush, off-board, clock) under
  a greedy continuation. No `rand` — fully deterministic, so the sweep and the
  seat steer one identical policy. Reactive per tick (Rogue law): seats
  anywhere, takes the wheel back on any input, re-seats from live state;
  watch never lingers (released silently at game over). Two rules the sweep
  earned: a home landing scores `1e6 + horizon` (dt-0 earliness — otherwise the
  frog procrastinates past every door), and on river row 1 with every open
  house behind, the frog shuffles back down onto the opposite-drift lane.

## Verify
```
npm run froggercheck             # 30 checks: attract rule 6 + seed replay +
                               #   death distinctness + the 40-seed driver sweep
npm run froggercheck -- --mutate # 13 mutants, all must die
npm run watchcheck -- --only frogger   # seat/handoff pilot (dev server)
npm run feedbackcheck            # pin law + rollout floor (48)
```
Driver sweep floors (seeded 40 × 120 s, watching): 40/40 seeds replay
byte-equal, every seed banks ≥1 level, 36/40 zero-death, ≥20 homes per seed,
≥1800 homes across the sweep.

## Honest gaps
- No 2-player alternating turns; no arcade bonus timer per row-entry sound.
- Original logs-turtles carry frogs off-screen only via riding; a frog riding
  off the edge dies as "off" — faithful, but the arcade shows a distinct
  off-screen splat.
- The driver is survival-greedy, not perfect: on 4 of 40 seeds it sheds one
  life to a dive-phase shuffle on the turtle lane (it still banks levels there).
  It plans 7 s ahead (420 ticks) plus a 15 s drift carry-out projection; a
  pattern beyond that reads as horizon, not as danger.
