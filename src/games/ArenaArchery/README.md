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
| `levels.js` | three box arenas (walls + roof + floor are the grid border, nothing leaks). Ledge chains are one-row steps sized to the MEASURED apex — the integrator's hop rises 51 px, so a step presents ≤ 2 rows with headroom, and `archerycheck`'s CLIMBS receipts prove every chain with the real `moveBody` (a comment that says "reachable" is not proof). Spawns are constructor-checked to stand in air on stone. |
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

**Deliberate climbing (#2307).** The autopilot owns the vertical game. Each
re-plan window (every 12 ticks) `reachableStep` scans the slab ahead of the
bot — near-edge, standing span, approach direction — and for each candidate
`hopGrants` replays the *exact* plan (run-up at full speed, take-off 2–5
cells out, land 1–2 cells past the near edge) through the real `moveBody`
before the bot commits. No geometry wish-lists: if the replayed hop doesn't
settle on the slab, the cell is not a step. Commitment lives on the player
(`climbTo/climbDir/climbAim/climbOff`); a failed landing bans that cell
(`climbNo`) plus a 20-tick cooldown, so the bot tries the next rung instead
of bouncing forever. While committed the climb owns the feet (distance and
shot blocks wait one hop); it releases the moment the quiver thins to 2 —
climbing is tempo, the ground economy is survival, and the slack rule keeps
the author honest about which is which. From a perch the floor habits are
banned (`hopelessHigh`): only a solved arc — including the rain shot
(up-aimed 45°, downward arc onto a foe below) — may burn an arrow upward.

## Invariants the harness owns (`npm run archerycheck [-- --mutate]`)

- **The arrow ledger, every tick**: `quivers + flying + stuck + hit + lost
  == starting total + resupplies`. Respawn resupplies +2 arrows (an
  empty-quiver corner was otherwise un-winnable forever) — `supplied`
  grows the ledger's right side and `quiverMax` caps it so the slack rule
  still bites.
- The autopilot WINS all three arenas (~22–53 s), by the exact win condition,
  never on the clock's charity, with `sticks/pulls/knockouts` receipts
  proving the terrain economy actually ran in the match.
- **CLIMBS (#2307)**: per-arena ascent receipts — grounded-row → grounded-row
  landings (a mid-air brush-past can't fake them). ≥ 2 climbs and ≥ 4 rows
  gained per arena, upper tiers touched (KNOCKBACK's inner balconies row ≤ 3
  reached), and the skill-0 bot climbs NOTHING — the doctrine is skill > 0,
  and a loser stealing the high ground would invert the demo.
- **Slack rule**: autopilot still wins with `quiver − 1` AND the foe
  gifted the first point.
- Determinism three ways: recorded stream re-replay; re-solve from
  scratch; drop-a-moving-command MUST diverge. Plus a tick where both
  players acted exists (the stamp order was exercised).
- Eight mutants must die (`--mutate`, wired into the CI static job):
  no-stick, no-knockout, no-pull, no-arrow-gravity, no-player-gravity,
  clock-too-short, lob-bot (now patched with `climbSeek: false` too — the
  climbing brain re-opens the firing lanes the lobs froze, so the mutant
  must regress the doctrine as it ships), no-climb-seek.

## Lessons this title paid for (all in the code comments)

- **LOS lies for arcs.** The straight-line sight check passed while the
  45° bulged into the underside of a ledge; the bot stuck shots into its
  own cover for a whole stage. `predictHit` replaced it — forward-sim the
  real trajectory or your "clear shot" is fiction. Climbing learned the
  same lesson one layer down: `hopGrants` replays the hop through the real
  `moveBody` before committing, because the closed-form apex lies the same
  way (jump²/2g says 48 px; the integrator actually rises 51, and the old
  two-row slabs presented 58 — every "reachable" note in the old arenas
  was fiction even though the contract math checked out).
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
- `stuckTTL` (40 s) is tuned for 3-win matches; a stalemate to the clock
  is proven not to happen (the match receipts), but a very defensive duel
  could get boring near the wall — the wander keeps it honest, not fast.

## WATCH (#1637 batch 5)

Y seats the proven autopilot at seat 1 — `botInput(gs, 0, 1)`, the exact
skill-1 brain `archerycheck` wins all three arenas with (and whose stream
`recordMatch` feeds the attract witness). Any seat-1 key, a canvas tap, or Y
releases; seat-2 codes never unseat it — the duel partner keeps their seat
(the Smash TV rule). Watching 1p is the harness match verbatim (bot vs bot
with the human's seat driven by the proven brain). Known gap: bot-vs-bot can
stalemate ~15-20 s after the first kill until the stuck-arrow TTL reopens the
duel — filed as #1685; the `watchcheck` pilot's choreography (`resumeWait:
30000`) waits through it honestly rather than faking the window.
