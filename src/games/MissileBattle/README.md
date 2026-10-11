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
| `waves.js` | the attack scripts: `{t, kind, x0, ti, spd, split}` entries. Three barrages: FIRST SALVO, SATURATION (two bombers), GRAND BARRAGE (weavers). No random exists in this file. |
| `sim.js` | pure `step(state, input)`. Batteries with coverage arcs, interceptors that fly to a point, a blast that expands and **chains**, MIRV siblings that converge on their parent's city with a speed spread so their arrivals stagger into each other's chain blast. Cities rebuild between waves (classic), which is what makes every wave a closed, re-solvable puzzle. |
| `planner.js` | the autopilot: least-ground-ETA first, intercept scanned tick-by-tick against the *exact* enemy motion law (including the weaver's sine), batteries picked least-loaded so every tube keeps its slack. |
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

## Harness

- `npm run missilecheck` (static CI gate): script audit (targets coverable,
  speeds bounded, splits have answer time), frozen `Math.random`, engine pins
  (exact intercept, chain, spans, rebuild, banner), the proven run
  (0 cities lost), **the slack rule** — every wave re-solved with ONE FEWER
  interceptor in EVERY battery — determinism, and six mutants that must die
  (`--mutate`).
- `npm run missileplay` (browser, `smoke` job): real keys only. Arrows are
  HELD (a `press()` fits inside one frame gap — the keepplay lesson), the
  driver leads its shots, sections run on quiet reloaded stages so a scripted
  barrage never races a probe, and pixels are sampled at the exact canvas
  coordinate the sim reports.

## Honest gaps

- The autopilot never shoots bombers on purpose (it shoots their drops); the
  opportunistic branch is gated on ammo surplus and rarely fires.
- Smart-bomb weave is a fixed sine, not an evasion of interceptors.
- No two-player; the arcade's alternating batteries is one `input` object
  away, but nobody asked yet.
