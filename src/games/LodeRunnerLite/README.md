# LODE RUNNER-LITE

The arcade's dig-the-floor stealth-runner, in the **1983 rules**: three
hand-carved vaults of concrete, brick and rope. There is no jump — you run,
climb, hang on ropes and fall. Your weapon is the floor: dig a brick
diagonally and a **hole** opens, which lasts about five seconds before the
brick grows back and whatever is inside it when it closes **dies**. Guards
hunt you on the same physics, fall into your holes, sit it out and climb back
out, and lift the gold you must win back. Take every gold and the **hidden
ladder** appears at the top of the screen: climb off to clear the vault. There
is no clock.

## The honesty contract

`sim.js` and `levels.js` import into **plain Node** with zero DOM, zero
canvas and zero `Math.random`. That is what lets:

- `npm run lodecheck` prove every vault winnable by the REAL no-jump, no-dig
  autopilot (guards hunting live on the pathfinder) before a browser exists,
  and
- the attract demo BE the solver's proven witness, replayed tick-for-tick
  through the same `applyAction` + `step` the player drives.

## Files

| file | owns |
|---|---|
| `sim.js` | the physics of everything: one `applyAction` generator drives player, guards and the solver's search; `step` runs hole refills, the guard trap/steal clocks, guard pace, falls and capture; `planStep`/`planRun` the greedy-BFS autopilot; `replay` the recorded-input twin. |
| `levels.js` | the three vaults, carved from row-builders (a width bug is impossible). The exit is the hidden ladder in column 2, concealed until every gold is in hand. Construction contracts (no support under a rope, ladder-topped rope lines, everything stands on something, nothing entombed, the exit ladder reaches the floor) are enforced by lodecheck. |
| `index.jsx` | paint + input only. Terrain dirty-flags from sim EVENTS (never guessed); the gold/guards/runner ride the dynamic layer. Ghost = a second `makeGame` fed your previous run's `{tick,act}` stream. |

## The classic rules (issue #155), each load-bearing

- **No jump** — the vocabulary has no `JUMP`; a flat-ground Up does not rise.
- **Diagonal dig** — `Down` digs the brick one cell below-LEFT/RIGHT, the way
  you face; the brick straight down is never dug.
- **Refilling holes** — a hole holds ~5 s (`CFG.refill`) then refills; a guard
  in it is buried and re-enters at the top, the runner in it loses a life.
- **Guards fall and climb** — a guard that drops in a hole is pinned for
  `CFG.guardTrap` ticks, then climbs back to the floor; a shaft deep enough
  that it cannot before the refill buries it.
- **Guard gold** — a guard pockets the gold it walks over and drops it a
  moment later; the runner must win it back before the exit opens.
- **The ladder appears** — the exit ladder is concealed until every gold is
  in the runner's hands, then it reveals and climbing off the top clears the
  vault. **No clock.**

## Load-bearing rules (mutants must die: `npm run lodecheck -- --mutate`)

`dig` (the diagonal dig) · `guardChase` (the `pursued` receipt) · `ropeCatch`
(a falling body missing the line) · `guardHole` (a guard that never falls in)
· `goldSteal` (a guard that cannot lift gold).

## The solver's honesty contract

The solver speaks only as a player does — one legal action every
`CFG.moveEvery` ticks — and walks the SAME state graph `applyAction` defines,
**minus dig**: digging is the player's defensive tool (a hole for a guard to
fall in), never a route the runner takes. Letting go of a rope, stepping off a
ladder or dropping into a hole settles through the real `airTick`, so the
search models exactly where the fall lands. If a vault needs a dig or a jump
to clear, it is unclassic and lodecheck's winnability gate fails it.

## Harnesses

| | |
|---|---|
| `npm run lodecheck` | 80 Node checks (90 with `--mutate`): construction contracts, per-vault solve + determinism both ways + one-fewer-life slack, every classic rule pinned by a scenario, and five mutants that MUST die. CI runs it with `--mutate` in the static gate. |
| `npm run lodeplay` | Chrome, real key events only: the attract demo moves by itself, a held arrow runs the runner, dig→hole→refill graded in pixels, climb-to-hang on the real ladder, guards hunt untouched, R replays your lost run as a ghost, in-page replay hash-matches mid-run. |

## Honest gaps

- The trap is a single-cell pit in these vaults; deep shafts (the multi-cell
  burial) are proven by scenario, not by a carved shaft, because a 5 s fuse on
  a 19-row board rarely leaves room for one.
- A guard climbing out of a shallow pit lands in a floor-level cell with no
  support below (a "hole" is one dug brick); it stands there until it BFSes
  back to the path. A cosmetic oddity, not a sim bug.
- Vault 3's witness spends one life (a guard closes the crossing); the
  one-fewer-life slack check proves the route is still robust.
- No keyboard-less vault skipping on phones: pads withdraw on menus, and
  vault select is 1/2/3. The vault chain carries score+lives, so a phone
  player who dies on vault 2 restarts at 1 — the honest classic.
