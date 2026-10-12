# ARENA ARCHERY — engine notes

Route `/arena-archery`. The arcade's TowerFall-like: one stick per archer
(move + aim), hold to draw, release to loose a ballistic arrow — and every
arrow that misses **sticks and becomes terrain** until someone walks over
and pulls it back out. First to 3 wins; 1 = solo vs the autopilot bot,
2 = local duel (WASD+F, second touch pad).

## The files

| file | contract |
|------|----------|
| `sim.js` | the whole duel: pure `step(state, in1, in2)` at 30 Hz. Zero `Math.random`, zero clocks. **The input stamp is P1-then-P2, every tick, forever** — two keyboards, one resolution order (the lode lesson). Exports also `botInput` (the autopilot), `recordMatch`/`replay` (witness ↔ hash), `stateHash`, `cloneGame` (DebugKit PROGNOSIS). |
| `levels.js` | two box arenas (walls + roof + floor are the grid border, nothing leaks). Every ledge chain is ≤ the jump contract: apex = jump²/2g = 2 cells exactly — the harness pins it. Spawns are constructor-checked to stand in air on stone. |
| `index.jsx` | shell only: 30 Hz fixed step, 250 ms catch-up cap, attract = `recordMatch`'s proven stream fed back through the real `step()`, `__archeryTest` DEV hook + DebugKit. |

## The two muscles (and their algebra)

**Ballistics.** A released arrow carries `(vx, vy)`; `vy += 0.14` per tick
with the *same* semi-implicit Euler the predictor runs. A 45° lob's height
at distance x is `h(x) = x − x²/r` with `r = v²/g` — the bot aims by that
closed form (plus a flat-shot variant `drop = x²·g/2v²`), and
`predictHit` forward-simulates the actual trajectory (muzzle offset,
substeps, terrain AND stuck arrows) before a shot is legal. The harness
pins flat range to `v·t`, the 45° apex to the integrator's own math, ±1
cell. A keyboard stick only gives {0°, ±45°} — straight-up is a jump, and
up-with-no-sideways aims the 45° toward the facing; a solver may also
name the aim explicitly in its input (`inp.aim`), which is legitimately
part of the recorded stream.

**Stuck = terrain.** An arrow that hits stone sticks — in the AIR cell
beside what it hit (a floor hit sticks one above the floor so a walking
archer shares the cell and can PULL it; a wall keeps its arrows until the
TTL recycles them — you cannot pull a shaft out of the middle of a wall).
While stuck it KNOCKS OUT any flying arrow that crosses its cell: the
newcomer replaces it and the spent rival is counted `lost` on the ledger.
Stepping on a stuck arrow with room in the quiver pulls it back —
*leave it as cover or take the ammo is the game's one decision*.

## Invariants the harness owns (`npm run archerycheck [-- --mutate]`)

- **The arrow ledger, every tick**: `quivers + flying + stuck + hit + lost
  == starting total + resupplies`. Respawn resupplies +2 arrows (an
  empty-quiver corner was otherwise un-winnable forever) — `supplied`
  grows the ledger's right side and `quiverMax` caps it so the slack rule
  still bites.
- The autopilot WINS both arenas (~22–53 s), by the exact win condition,
  never on the clock's charity, with `sticks/pulls/knockouts` receipts
  proving the terrain economy actually ran in the match.
- **Slack rule**: autopilot still wins with `quiver − 1` AND the foe
  gifted the first point.
- Determinism three ways: recorded stream re-replay; re-solve from
  scratch; drop-a-moving-command MUST diverge. Plus a tick where both
  players acted exists (the stamp order was exercised).
- Six mutants must die (`--mutate`, wired into the CI static job):
  no-stick, no-knockout, no-pull, no-arrow-gravity, no-player-gravity,
  clock-too-short.

## Lessons this title paid for (all in the code comments)

- **LOS lies for arcs.** The straight-line sight check passed while the
  45° bulged into the underside of a ledge; the bot stuck shots into its
  own cover for a whole stage. `predictHit` replaced it — forward-sim the
  real trajectory or your "clear shot" is fiction.
- **A release tick is not skippable.** Jump-and-release share one tick:
  the loose must move to the top of the tick with the bot's release
  contract aware of it, or the arrow is eaten AND the command stream
  silently loses a fire the live board never played (that was the browser
  replay drift).
- **A knockout probe needs a mid-air crossing.** Arrows landing in an
  occupied cell replace the rival either way (one arrow per cell is the
  invariant), so a "mutant" that only removes the mid-air check is
  behaviourally identical when both arrows rest in the same cell. The
  mutant is caught by a solved arc crossing a mid-air stuck arrow.
- **Don't build the terrain test on terrain.** Scratch range: arena with
  everything above the floor cleared — pinned-cell assertions on a busy
  board are arguments with geometry instead of physics.

## Honest gaps

- The 2P duel has no harness yet beyond the pad dispatch existing
  (`secondPad` is `VirtualControls`' contract, exercised by IceClimber);
  `archeryplay` drives P1 only.
- The bot never climbs ledge chains deliberately; it fights on the floor
  and hops at walls.
- `stuckTTL` (40 s) is tuned for 3-win matches; a stalemate to the clock
  is proven not to happen (the match receipts), but a very defensive duel
  could get boring near the wall — the wander keeps it honest, not fast.
