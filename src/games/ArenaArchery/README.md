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
part of the recorded stream. **No zero-vector loose (#2558):** a jump press
zeroes the aim X (up-alone is the jump) and a direction-free release zeroes
the aim Y — together they once handed `looseArrow` (0,0), spawning a shaft
at the body with no velocity: a dud that stuck at the shooter's feet and
pulled itself back. TowerFall always fires, so a no-direction release now
looses toward the facing. The bots never produce (0,0) (their streams are
byte-identical — receipts prove it), so this law is pinned in the browser:
`archeryplay` DUEL fires a draw at zero aim and grades the shaft leaves
TOWARD THE FACING (x < shooter − 8), never at it.

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

**Heat (#2377).** `g.lastHit` rides the tick stamp; when `heatTicks` (450 =
15 s) pass without a HIT the arena goes HOT: every stuck arrow's age drains
at `1 + heatRot` (4) per tick where cool stone adds 2 — wall armour halves
its ~20 s life to ~10 s, so parking behind your own barricades stops being
a winning schedule. First blood cools the flag synchronously inside
`scoreHit` (the dry spell restarts from the blood; a re-heat is exactly
`heatTicks` later). Measured tempo: the proven autopilot's first hit lands
by tick 246 and its longest dry spell is 275 — honest matches never heat,
and the arena receipts replay byte-identical with the rule in place.

**Heat juice (#2385).** The heat rule now announces itself before it bites.
(1) **Telegraph** — `heatWarnStep(dry)` (sim, pure) rings two rising notes
at dry-spell ticks 390 and 420 (`heatWarnLead` 60 = a 2 s head start on the
rumble); a hit re-arms the shell latch, and once HOT the rumble owns the
voice. The window is pinned with hard numbers (≥ 45 ticks before the gate)
and the longest REAL autopilot dry spell is pinned under it — no honest duel
may ring the bell, so the attract witness never fakes the rule. (2) **Shape
cue** — hot cover gains a crackle dither (dark 1×2 ticks, count ∝ remaining
life, positions hashed off the cell) and the ember pulse accelerates with
`burn`, so dying cover is legible without relying on the orange hue.
(3) **Dryout pop** — the unused `dryout` event now pays visually: an ash
puff at the cell plus the shaft arcing to its owner's quiver bar (the sim
already returns the arrow — the paint says so), with a soft poof-and-blip.
(4) **Attract showcase — judged, not cheated**: attract replays
`recordMatch`'s witness stream through the real `step()`; scripting a heat
beat would diverge the hashes that ARE the demo's honesty (and honest
matches never heat, see above). The marquee line "15 s WITHOUT BLOOD · THE
COVER BURNS OUT" is the showcase; the telegraph only rings in real stalemate
danger. Probe `fx: { ash, homes, warnNotes, dryFx, warnStep }` receipts.

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
- **HEAT (#2377)**: the gate fires at exactly tick `heatTicks`; the drain law
  pins the dryout tick off the arrow's *observed* age at stick (an arrow keeps
  its flight age when it sticks — the closed form lies twice before it tells
  the truth: flight age AND the second `age++` in `step()`); cool cover lives
  595 ticks, hot 297 (half, pinned by formula both ways); first blood cools
  the same tick; re-heat is exactly `heatTicks` after blood; the ledger stays
  exact through hot dryouts; and every arena's first hit lands ≥90 ticks
  before the gate — pressure is for stalemates only.
- **TELEGRAPH (#2385)**: the warn law fires exactly two rising notes at
  `heatTicks − heatWarnLead` and its midpoint, is silent outside and once hot,
  the first note lands ≥ 45 ticks before the rumble (hard constant), and the
  longest dry spell of a real autopilot duel stays under the window.
- **DUEL — seat two (#2558, `archeryplay`)**: the two-human duel is driven with
  real WASD+F keystrokes in the browser — `2` seats it and the bot vacates
  seat 2 (an idle duel sips no ammo); KeyA walks and KeyW jumps P2 with the
  cyan sprite painted at the logical position; KeyF charges and looses with
  exact seat-2 quiver accounting; a direction-free release fires toward the
  facing (the no-dud law above — the mutant that removes the facing fallback
  is caught HERE, born at the shooter's own x, since no bot stream ever
  exercises it); both humans loose the same tick with P1's shaft numbered
  first (arrows carry `born`; the stamp order in pixels); P2 pulls stuck
  shafts walking over them (receipts move for seat 2, not seat 1); P2 scores
  3 through the honest respawn+invulnerability cycles and the result screen
  credits `PLAYER 2 TAKES THE ARENA`; the dual-driven stream replays
  hash-identical. Phone law: no second on-screen touchpad exists (the pad
  that shipped — painting dead even in 1p — was retired per AGENTS.md; the
  duel is the desktop-keyboard option).
- Eight + three mutants must die (`--mutate`, wired into the CI static job):
  no-stick, no-knockout, no-pull, no-arrow-gravity, no-player-gravity,
  clock-too-short, lob-bot (now patched with `climbSeek: false` too — the
  climbing brain re-opens the firing lanes the lobs froze, so the mutant
  must regress the doctrine as it ships), no-climb-seek, no-heat, heat-rot
  off (caught on a cool/hot lifetime ratio the patched constant cannot sign
  for itself), heat-warn too late (the lead is judged against the hard ≥45
  tick promise, not the patched `heatWarnLead`).

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

- ~~The 2P duel has no harness yet beyond the pad dispatch existing
  (`secondPad` is `VirtualControls`' contract, exercised by IceClimber);
  `archeryplay` drives P1 only.~~
  **CLOSED by #2558** (the DUEL section drives seat 2 with real keys end to
  end — walk/jump/draw/hit/pull/win — and the on-screen second pad was
  retired per AGENTS.md's multiplayer law: duel = keyboard, phone = one pad
  vs the autopilot).
- ~~`stuckTTL` (40 s) is tuned for 3-win matches; a stalemate to the clock
  is proven not to happen (the match receipts), but a very defensive duel
  could get boring near the wall — the wander keeps it honest, not fast.~~
  **CLOSED by #2377** (the heat rule; see Heat above).

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
