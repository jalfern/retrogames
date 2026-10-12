# LODE RUNNER-LITE

The arcade's dig-the-floor stealth-runner: three hand-carved vaults of
concrete, brick and rope. Gold opens the gate; the floor is your only
weapon — a dug brick becomes a TRAP that holds its rider for one breath
(`CFG.trapHold`), then a HOLE forever.

## The honesty contract

`sim.js` and `levels.js` import into **plain Node** with zero DOM, zero
canvas and zero `Math.random`. That is what lets:

- `npm run lodecheck` prove every vault winnable by the REAL autopilot
  (guards hunting live on the pathfinder) before a browser exists, and
- the attract demo BE the solver's proven witness, replayed tick-for-tick
  through the same `applyAction` + `step` the player drives.

## Files

| file | owns |
|---|---|
| `sim.js` | the physics of everything: one `applyAction` generator drives player, guards and the solver's search; `step` runs traps, guard pace, airborne, capture; `planStep`/`planRun` the greedy-BFS autopilot; `replay` the recorded-input twin. |
| `levels.js` | the three vaults, carved from row-builders (a width bug is impossible). Construction contracts 1-4 (no support under a rope except hang-gold, ladder-topped rope lines, everything stands on something, nothing entombed) are enforced by lodecheck, not by eye. |
| `index.jsx` | paint + input only. Terrain layer dirty-flags from sim EVENTS (never guessed); the gold/guards/runner ride the dynamic layer. Ghost = a second `makeGame` fed your previous run's `{tick,act}` stream. |

## The four muscles (issue #77)

- **Destructible floors** — `BRICK → TRAP → EMPTY` is one-way; a guard
  sunk over a shaft is `alive=false` for the rest of the vault
  (pinned: `lodecheck` guard-burial scenario + `trapCollapse` mutant).
- **Pathfinding** — guards BFS the *player's own* field every
  `CFG.guardPace` ticks but can never jump, catch a rope or dig, so the
  escape language (ropes, gaps, holes) is exact. The witness must never
  share a cell with a live guard — asserted per tick.
- **Ghost replay** — your lost run stamps `{tick, act}` into `g.cmds`;
  `R` on the end screen rebuilds the vault with a ghost sim alongside
  (`lodeplay` proves ghost tick == live tick).
- **Determinism** — pure `(level, input-script)`: the harness re-replays
  every witness through `replay()` AND re-solves from scratch and both
  must land on the same `stateHash`; a dropped interior command must NOT
  (`lodecheck` receipts; `__lodeTest.replayCheck()` does it live in the
  page).

## Load-bearing rules (mutants must die: `npm run lodecheck -- --mutate`)

`dig` (vault 2's only door is a hole you dig) · `jump` (vault 1 unwinnable
without the leap) · `guardChase` (the `pursued` receipt) · `trapCollapse`
(burial) · `ropeCatch` (the rising-body catch) · `quota` (a 0-gold walk-in
must not clear).

## The solver's two honesty contracts

1. GOLD is a door-to-stop-at, never a corridor — so a search branch can be
   stale about collected gold only at the moment it replans anyway.
2. the solver never digs through a real grid: `digEdge` computes the
   pocket's landing cell from the same gravity rules, and every edge
   simulation leaves the shared mini-grid exactly as it found it (a
   simulated death used to poison the rest of the search — "a looser
   search finding LESS is state poisoning, always").

## Harnesses

| | |
|---|---|
| `npm run lodecheck` | 92 Node checks: construction contracts, per-vault solve + receipts + never-share-a-cell + slack (half the clock AND lives-1), determinism both ways, trap-economy scenarios. CI runs it with `--mutate` (6 mutants). |
| `npm run lodeplay` | Chrome, real key events only: attract moves by itself, one held arrow runs east, dig→trap→hole graded in PIXELS across the blink cycle, climb-to-hang on the real ladder, guards move untouched, you can die three ways, R replays you as a ghost, in-page replay hash-matches mid-run. |

## Honest gaps

- Guards share the same trap economy you do — mostly a feature; a guard
  can also dig himself in never (they never dig).
- Vault 2's `proves` cannot pin `drop` from the witness (the jump arc
  drifts sideways off its own trap); it is pinned by the scenario instead.
- The guard pins in the burial scenario pin the CELL only — the chase
  itself is graded by the `pursued` receipts, not by that scenario.
- No keyboard-less vault skipping on phones: pads withdraw on menus, and
  vault select is 1/2/3. (The vault chain carries score+lives, so a
  phone player who dies on vault 2 restarts at 1 — the honest classic.)
