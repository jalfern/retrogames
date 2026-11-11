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
| `art.js` | **all the pixel art, generated at runtime** — no image assets, no `Math.random`. Every sprite is a fixed pixel map (runner: stand/run/climb/hang/fall, a mirrored facing, a spectral ghost copy; the guard is the same body in the original's orange kit) and every tile is a few rects: mortar brick vs cool concrete, grey rope, grey ladder, the pit, 3-stage crumble and rebuild for dig/refill, and the original's blinking gold nugget. The palette is the Apple II original's — aqua runner, orange guards, grey rope and ladder, dark navy vault (issue #168); lodeplay grades each of those choices in pixels, so a revert to the old white/olive/green/yellow read fails. 680×418 internal resolution, `image-rendering: pixelated`. |
| `index.jsx` | paint + input only. Terrain dirty-flags from sim EVENTS (never guessed); gold/guards/runner/ghost ride the dynamic layer. Run frames are driven by **paint-time motion tracking** (a body is "running" for a couple hundred ms after its last cell change) — a cosmetic, never sim state. Ghost = a second `makeGame` fed your previous run's `{tick,act}` stream. |

## The classic rules (issue #155), each load-bearing

- **No jump** — the vocabulary has no `JUMP`; a flat-ground Up does not rise.
- **Diagonal dig** — `Down` digs the brick one cell below-LEFT/RIGHT, the way
  you face; the brick straight down is never dug **from the surface**. From
  inside a live pit, though, `Down` digs the brick under foot — **the shaft
  deepens** (#1942), down to the deepest stratum.
- **Holes catch walkers** — the ground is three brick layers thick, and a step
  sideways onto a cell whose support was dug away is a **fall**, not a block:
  run over your hole and you drop in, and so does a chasing guard (the guard
  pathfinder routes across pit mouths).
- **Pit climb-out** — `Up` from inside a live pit clambers you one cell toward
  the lip; the runner's escape, so the fuse stays a threat and not a sure
  death.
- **Refilling holes** — a hole holds ~5 s (`CFG.refill`) then refills; a guard
  in it is buried and re-enters at the top, the runner in it loses a life.
- **Guards fall and climb** — a guard that drops in a hole is pinned for
  `CFG.guardTrap` ticks, then climbs back to the floor; a shaft deep enough
  that it cannot before the refill buries it — **the multi-cell burial, carved
  live**: three strata, up to three climbs (3×60 t) against one fuse (75 t).
- **Buried guards pay** — a refill that catches a guard credits **500 points**
  (`CFG.guardPay`): gold 500, buried guard 500, vault 1000 — the original's
  score. And the original's trap ladder is alive (`CFG.chainLadder`): one
  closing brick that catches TWO guards pays double, three pays more than
  double (500, 1000, 3000, the machine's own ladder), and every stratum the
  grave sits below the surface adds another 500 (`CFG.deepPay`). That pay is
  the reason to dig deep: the shaft is where the money and the risk both live
  (#1952, ladder and depth pay by #1959).
- **Guard gold** — a guard pockets the gold it walks over and drops it a
  moment later; the runner must win it back before the exit opens.
- **The ladder appears** — the exit ladder is concealed until every gold is
  in the runner's hands, then it reveals and climbing off the top clears the
  vault. **No clock.**

## Load-bearing rules (mutants must die: `npm run lodecheck -- --mutate`)

`dig` (the diagonal dig) · `holeFall` (walkers skid across open pits) ·
`digDeep` (the pit bottom turns to iron — at the second stratum AND at the
third) · `pitClimb` (the pit is a grave for everyone) · `guardChase` (the
`pursued` receipt) · `ropeCatch` (a falling body missing the line) ·
`guardHole` (a guard that never falls in) · `goldSteal` (a guard that cannot
lift gold) · `guardPay` (a buried guard is worth nothing) · `chainLadder`
flat (chain burials pay nothing extra) · `deepPay=0` (the stratum bonus is
dead) · the **strata law** (the bottom rock row turned to concrete must be
illegal).

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
| `npm run lodecheck` | 115 Node checks (141 with `--mutate`): construction contracts including the **strata law** (three diggable brick layers over an open walk row, per vault), per-vault solve + determinism both ways + one-fewer-life slack, every classic rule pinned by a scenario, the carved three-cell shaft (drop in, deepen twice, climb out), its live paid deep grave (1000 — guardPay plus one stratum) and the two-guard **chain pay** in one closing brick (the original's double), thirteen mutant runs that MUST die. CI runs the plain audit in the static gate
(`--mutate` is the local deep pass). |
| `npm run lodeplay` | Chrome, real key events only: the attract demo moves by itself, a held arrow runs the runner, dig→hole→refill graded in pixels, the paint graded in pixels too (warm mortar brick distinct from cool concrete in hue AND density; runner and guard distinct sprites; the original palette itself — navy background, aqua runner, orange guard, grey ladder and rope), climb-to-hang on the real ladder, guards hunt untouched, R replays your lost run as a ghost, in-page replay hash-matches mid-run. |

## Honest gaps

- **The pay scales now (#1959).** A depth-2 grave pays 1000, depth-3 pays
  1500, and one closing brick catching two guards pays the original's double
  (trap ladder 500/1000/3000...). What still separates this vault from the
  machine: the shipped vaults carry ONE guard each, so the chain rung is a
  proven sim law (lodecheck pins it with a hand-placed second guard) but a
  live chain needs a multi-guard vault — queued work, not yet dug. Row 18
  remains the bedrock: no fourth stratum.
- **Three strata are real (#1952).** The ground is three diggable brick
  layers, shafts carve three cells down, and the solver routes over the
  thicker rock; the strata now also *look* and *sound* different — deeper
  rows paint darker and coarser, and the dig thud drops pitch per stratum.
- A guard climbing out of a shallow pit lands in a floor-level cell with no
  support below (a "hole" is one dug brick); it stands there until it BFSes
  back to the path. A cosmetic oddity, not a sim bug.
- Vault 3's witness spends one life (a guard closes the crossing); the
  one-fewer-life slack check proves the route is still robust.
- No keyboard-less vault skipping on phones: pads withdraw on menus, and
  vault select is 1/2/3. The vault chain carries score+lives, so a phone
  player who dies on vault 2 restarts at 1 — the honest classic.

## WATCH (#1637 batch 5)

Y seats `planStep(gs)` at the same `CFG.moveEvery` phase the held-key stack
drives, and hands the runner back on any driving key, a canvas tap, or Y
again (`utils/watch` chrome: blips + shared toast + pill). The solver's
no-dig contract makes the watcher safe by construction — it can never trash
the vault. `planStep` re-plans from live state every move, so takeover and
re-seat resume from exactly where the runner stands. `vaultCleared` keeps
the guide seated across the carry (`startPlay(..., {keepWatch:true})` —
every vault is proven from its fresh start); `gameOver` and the player's own
start hand back. `watchcheck`'s `lode-runner` pilot grades runner
movement/gold/level while the stick is idle (tick alone cannot grade it —
vault ticks restart on a carry).
