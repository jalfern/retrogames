# MISSILE BATTLE (`/missile-battle`)

Missile Command done honestly: every warhead that ever falls is **named in a
script**, every intercept is pure intercept math, and the attract demo is the
autopilot's own proven run replayed tick-for-tick through the same `step()`
the player drives. Not the original Missile Command clone that shipped in the
initial commit (`/missilecommand`, still there, untouched) — this is the
harnessable rebuild #73 asked for: *"vector-field simulation + deterministic
attack waves."*

## File boundaries

| file | job |
|---|---|
| `waves.js` | the attack scripts: `{t, kind, x0, ti, spd, split}` entries. Three barrages: FIRST SALVO, SATURATION (two bombers + the first weaver), GRAND BARRAGE (weavers that shed MIRVs; two `jinks: 2` veterans). No random exists in this file. |
| `sim.js` | pure `step(state, input)`. Batteries with coverage arcs, interceptors that fly to a point, a blast that expands and **chains**, MIRV siblings that converge on their parent's city with a speed spread so their arrivals stagger into each other's chain blast. Cities rebuild between waves (classic), which is what makes every wave a closed, re-solvable puzzle. |
| `planner.js` | the autopilot: least-ground-ETA first — but a warhead with an unspent split is answered by its SPLIT-ETA (mothers die before they multiply, #2379), intercept scanned tick-by-tick against the *exact* enemy motion law (the weaver's sine and its committed jink), batteries picked least-loaded so every tube keeps its slack. |
| `index.jsx` | shell + renderer at 1:1 pixel-per-sim-unit, the `__mbTest` hook, DebugKit with a PROGNOSIS that re-solves **the live mutated board** (not just wave tops). |

## The rules that are load-bearing

- **A blast is born breathing.** A blast created at `r=0` was filtered out
  before its first growth tick — chain kills had *never fired anywhere*,
  including the "proven" runs, until the harness pin proved it. The proof a
  chain exists is a `kill` event with `chain:true` **8px outside the main
  blast's reach**, not a vibes check.
- **Ids live in the game state (`g.nextId`), not in a module global.** A
  module-global `eid` made two games hash differently and made two states
  that should be identical differ — determinism is per-game.
- **NaN slips past `>` comparisons.** `vy > maxVY` is false when `vy` is
  NaN, and `JSON.stringify` prints NaN/Infinity as `null` — a bomber without
  a `spd` poisoned its whole drop line and the logs lied. The spawn guard is
  `!(vy <= maxVY) || !Number.isFinite(vy)`.
- **Firing at the present tense is a legitimate miss.** The blast cannot
  chase a receder; intercept math (and the browser driver) must aim at
  `dist/ivSpeed × vy` ahead. The harness that aims at the *current* enemy
  position fails the game honestly.
- **A spec field is not a fact until the sim compiles it.** The wave scripts
  declare bomber altitudes and the audit read them lovingly — while
  `spawnEnemy` hardcoded `y:-4` for every kind and bombers cruised invisible
  above the aim band, unkillable by anyone (#2306). The audit's numbers were
  true of the script and false of the world. What a spec promises must be
  pinned against the spawned state (`missilecheck` BOMBER HUNT: `e.y` must
  equal the script's `y`, and the cruising altitude must sit inside the aim
  band).

## Two-player alternating batteries (#2473 — the arcade's second console)

Original: **Missile Command** (Atari arcade, 1980) — 2P splits the map and
takes turns under the sky. Five features, all honoured:

1. **Sectors**: the map is a border — P1 the cyan west (cities 0–2 + the west
   battery), P2 the amber east (cities 3–5 + the east battery). The middle
   battery is the shared reserve either defender mans; each player's own two
   tubes are always theirs.
2. **Alternating waves** (`g.seat = wave % 2 + 1`): each barrage is one
   player's defense turn. The named scripts in `waves.js` are never
   re-authored — `retarget()` folds every entry onto the defender's sector
   (`SECTOR_TI`: city k → slot k%3 of your three, west/east batteries map to
   yours, reserve stays central) and flips the spawn column (`W − x0`) so a
   seat's wave is the same script mirrored into its own sky. Deterministic,
   replay-stable, still zero-random.
3. **Per-player ledgers**: kills credit the defender of the wave; the
   wave-clear bonus splits per seat (own tubes, own cities; the reserve's
   leftover rides to whoever defended, since only they could spend it).
4. **Fallen sector + rescue**: a side whose three cities all die during a
   wave is OUT — its tubes are manned by the survivor from then on (the
   arcade's carry-the-flag end). The war ends when BOTH sectors go dark;
   reach the end of GRAND BARRAGE and the sole holder (or the higher ledger
   if both held) tops the board.
5. **CPU seat first** (AGENTS.md multiplayer rule): the menu cycles
   SOLO → YOU + CPU SEAT → 2 HUMAN with **M** (attract only). The autopilot
   drives seat 2 through the same `decide()` that proofs the attract demo,
   and it stands down at the sector line because the ownership law lives in
   the sim, not the shell. On the autopilot's waves the human console is
   DARK — no launch, no refusal, the arcade's dead second panel. 2 HUMAN
   shares ONE aim control — arrows + Space on a desktop keyboard, taps on
   the phone — alternating by turn, and there the sim's `denySeat` voice is
   what a crossing hand hears. There is deliberately no second touchpad.

**Byte-safety**: every law short-circuits on `!g.twoP`; the seat/ledger rides
`stateHash` only when duo is on (the `amoExt` pattern — the frozen solo hashes
cannot move). The duo economy: `CFG.duoAmmo` adds 6 per tube because a sector
defender mans two tubes against the whole named barrage; the slack rule
lowers `ammoWave` and the duo budget follows, and every duo wave still holds
both sectors at 13/tube (`missilecheck` ALTERNATING section).

## Harness

- `npm run missilecheck` (static CI gate): script audit (targets coverable,
  speeds bounded, splits have answer time), frozen `Math.random`, engine pins
  (exact intercept, chain, spans, rebuild, banner), the proven run
  (0 cities lost), **the slack rule** — every wave re-solved with ONE FEWER
  interceptor in EVERY battery — determinism, and twelve mutants that must die
  (`--mutate`).
- `npm run missileplay` (browser, `smoke` job): real keys only. Arrows are
  HELD (a `press()` fits inside one frame gap — the keepplay lesson), the
  driver leads its shots, sections run on quiet reloaded stages so a scripted
  barrage never races a probe, and pixels are sampled at the exact canvas
  coordinate the sim reports.

## Honest gaps

- The autopilot never shoots bombers on purpose (it shoots their drops); the
  opportunistic branch is gated on ammo surplus and rarely fires. — **CLOSED
  by #2306** (two root causes: `decide()` opened with `if (!live.length)
  return {}`, so the bomber branch was unreachable whenever a bomber flew
  alone, and the branch itself gated on a fixed `ammo >= 7` surplus that
  almost never held. Now the doctrine is *deny the delivery*: when nothing
  needs answering this tick, hunt the loaded bomber whose next drop is soonest
  — legal only while total tube ammo exceeds the open-threat reserve (warheads
  not dying in a blast and not reserved by a shot in the air), so a held-back
  tube can never be spent on a fancy kill. A pre-drop kill cancels every drop
  it still carries: the proven run fires 49 interceptors (was 60), bags all
  four bombers, and every scripted drop is denied before delivery. Gates in
  `missilecheck` BOMBER HUNT: quiet-sky kill at 3 rounds/tube (below the old
  gate), held-tube refusal, whole-game denial count, two named manual
  mutants.)
- Smart-bomb weave is a fixed sine, not an evasion of interceptors. —
  **CLOSED by #2375** (the *jink*: a short-fused blast arriving within 30px
  of the bomb provokes a committed lateral escape away from the detonation
  point, one per bomb plus a cooldown. The first interceptor is a feint that
  learns where it runs; the next round is aimed there. `CFG.dodge`,
  `dodgeOn` mutant switch; JINK section in `missilecheck`. It still reads a
  blast-in-flight, not a *launch* — a battery firing the instant the bomb
  appears outruns nothing; the reaction is to the missile, as the original's
  felt).
- The yellow bomb dodged but stayed singular; every jink read identical; every
  kill popped the same orange. — **CLOSED by #2379** (the full menagerie:
  GRAND BARRAGE smart bombs **shed 2-3 MIRVs near the deck** at their scripted
  altitude through the same `spawnChild` law as ICBM splitters — mothers
  converge on the parent's city. **Escalation**: SATURATION carries the first
  (baseline) weaver; from wave 3 `CFG.dodgeEsc` commits further and faster
  (v1.35 × 18 vs 1.1 × 14 — a longer, hotter streak), and two scripted
  veterans (`jinks: 2`) hold a second escape. When the last escape ends the
  bomb flashes **`spent`**: pale trail, red X — the dodge will not come this
  time. Blasts carry a material `src` (`iv`/`chain`/`city`/`base`/`dud`) and
  the renderer gives each its own hue. The planner answers the doctrine with
  doctrine: **mothers die before their split** (threat ETA = sooner of
  ground/split), and a bomb mid-jink is led to where its streak ENDS. Gates:
  MENAGERIE section in `missilecheck` (shed law, no-early-shed, tell +
  veteran budget, escalation drift 18.9 vs 9.8, material tags) and 3 new
  mutants; the slack rule (9/battery) still wins every wave.)
- ~~No two-player; the arcade's alternating batteries is one `input` object
  away, but nobody asked yet. Needs a design stage per Jon's rule (CPU
  default first), not a drive-by.~~ **CLOSED by #2473** (the full alternating
  law is in §Two-player above: sector ownership in the sim, mirrored-column
  retarget of the named scripts, per-seat ledgers, seatOut + survivor rescue,
  CPU seat by default, **M** menu cycle, one shared aim control — no second
  pad, per Jon's rule. Solo hashes frozen; slack holds every duo wave at
  13/tube.) What stays open: the arcade ran 2P as long as both players
  stood, so turn parity was never fixed — with three named barrages seat 1
  defends waves 1 and 3 while seat 2 gets the single middle wave. A six-wave
  alternating set (two scripts per barrage, parity even) would square it;
  unscripted work, not a law gap.
