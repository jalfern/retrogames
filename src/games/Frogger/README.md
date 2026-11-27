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
npm run froggercheck             # 103 checks: attract rule 6 + seed replay +
                               #   death distinctness + the 40-seed driver sweep +
                               #   the #3676 duel & tell block +
                               #   the #3703 duel-seat identity pins (three) +
                               #   the 1981 tune block & carry-off splat pin
npm run froggercheck -- --mutate # 20 mutants, all must die
npm run watchcheck -- --only frogger   # seat/handoff pilot (dev server)
npm run feedbackcheck            # pin law + rollout floor (48)
```
Driver sweep floors (seeded 40 × 120 s, watching): 40/40 seeds replay
byte-equal, every seed banks ≥1 level, 36/40 zero-death, ≥20 homes per seed,
≥1800 homes across the sweep.

## Honest gaps
- ~~No 2-player alternating turns; no arcade bonus timer per row-entry sound~~
  **CLOSED by #3676**: `2` at attract/game-over opens the duel — P1 plays until
  out, P2 takes the SAME board (filled homes persist) with 3 frogs and a full
  clock; both scores show at all times; higher wins, equal is a draw
  (Wikipedia §Gameplay). Surviving a hop onto a row never reached this life
  pauses the whole field for `ROW_FREEZE` ticks — frog spins, clock stops with
  it, rising bleep (§Gameplay's per-row tell) — and home pays the arcade's
  time bonus, ten points per unused ½ second (§Scoring). The pause is a
  human-seat law: under the watch seat the physics stay exact tick-for-tick so
  the certified drivers (#2869 gapsweep, #1776 watchcheck pin) never desync.
- ~~No lady frog; no bonus life; six-digit score~~ **CLOSED by #3692**: a
  seeded die sometimes places a pink lady frog on a log (§Gameplay); standing
  on her log picks her up and delivering her home pays 200 (§Scoring) — she
  survives her carrier's death and waits on the log, and leaves the river once
  delivered. A single bonus frog at 20,000 (§Scoring, once per seat), and the
  score rolls over past 99,990 keeping five digits. Her dice roll after the
  fly's, so every seed's traffic is byte-identical to pre-#3692 (pinned).
- ~~Original logs-turtles carry frogs off-screen only via riding; a frog riding
  off the edge dies as "off" — faithful, but the arcade shows a distinct
  off-screen splat~~ **CLOSED by #3703**: the off-cause splat draws on the
  shore line, clamped to the bank by `bankEdgeX` in `sim.js` (pinned by the
  harness) instead of off-canvas, so a carry-off stays readable at both banks.
- ~~Audio: original 1981 arcade-style stings synthesized via
  audioController — an ascending opening verse at the run start (`tunes.js`), a
  fast one-up climb on the bonus frog, and a descending game-over sting, each
  once per run (a shell-local guard keeps the over-frame replays from
  re-firing). Original note tables in `tunes.js`, pinned by the harness —
  never a copied cabinet tune.~~ **CLOSED by #3714** (1a35fa6): the bullet
  described the fix, not a gap — the cabinet-style tunes shipped with the
  #3703/#3714 pass and froggercheck pins the note tables.
- The driver is survival-greedy, not perfect: the 40-seed sweep (120 s per
  seed, `npm run froggercheck -- --mutate`'s sweep) and a dedicated per-seed
  driver-horizon re-measure on 2026-11-27 (40/40 seeds clean, zero deaths
  across 120 s, clears 40/40, min homes 55, 2852 total homes) leave the
  honest gap closed — the earlier "4 of 40 seeds shed one life" note was
  measured against the older driver build. The driver plans 7 s ahead (420
  ticks) plus a 15 s drift carry-out projection; a pattern beyond that reads
  as horizon, not as danger.
