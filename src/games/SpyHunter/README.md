# SPY HUNTER

The arcade's 2D driving title: `/spy-hunter`. Two hand-scripted stages of the
1984 highway at 256x224, all art and audio synthesized at runtime.

## The contract that keeps it honest

`sim.js` is pure `step(state, input)` — zero `Math.random`, zero DOM — and
`script.js` is the traffic as **data**: every enemy is `{t, type, x}` fired
off the stage clock. That is what lets `scripts/huntercheck.mjs` project the
road as data before anyone drives it: oil may never seal all three lanes
(spinning has no answer when there is nowhere to land), nothing spawns
off-road, every scripted car reaches the driving row, every stage carries
its missile crate AND the boat that makes missiles matter.

## Why the autopilot simulates instead of scoring

The first planner priced threats with hand-drawn rings around each hazard
(danger inside 17 px, deterrence inside 26). It lost twice, the same way:

- **The equilibrium trap.** Two lanes straddling an oncoming column each
  scored "deterrent + move cost" — a tie the loop broke by alternation, so
  the car twitched 2.2 px per tick and got run over standing still.
- **The hidden interaction.** A bomb falls straight through the *transit*
  of a lane change, and an oil spin drifts the car ~50 px into whichever
  lane the spin points at. No per-object ring can see either one.

The planner now clones the real `step()` and rolls it ~1.3 s per candidate
lane. The model IS the game, so nothing the game can kill you with is
invisible to the driver. Decision cost is ~2 s for a whole campaign — paid
once, on a timer off the first paint, and reused by the attract demo.

## Where the harness found REAL bugs

- The boat object had no `type` field. Missile kills booked `kind:
  undefined`, so the campaign happily *made* boat kills while every
  consumer "reported" none. The gun-can-reach-the-river probe found it
  because it asserted the kill, not the explosion.
- Two of six mutants survived their first probes, both probe bugs, both the
  same lesson: **a probe that reads the event instead of the behavior**
  survives exactly the bug it is supposed to catch. `spin=0` still pushed
  the 'spin' event (the probe now requires the spin DURATION — control
  actually stolen); a never-cooling gun still fires one sputtering shot
  through a re-lock (recovery is now a sustained burst).

## Rules the arcade promised (each pinned in huntercheck)

- The road cannon can NEVER touch the boat; missiles can, and it comes back.
  Missiles home on the nearest vehicle — a laker 2 px closer steals the
  salvo (correct behavior; it once masqueraded as a broken missile until
  the probe cleared the road).
- Oil grabs once per slick, spins for `CFG.spin` ticks, steering is dead
  throughout, then you recover. Respawn glass makes you briefly immune —
  including to oil (a harness that flooded immunity graded an invincible
  car and called the road dead).
- The gun overheats at `heatMax`, locks cold, and recovers through
  cooling — not through the trigger.
- Grass kills slowly (`offMax` ticks), the wall kills now, Sweepers push
  instead of killing, and a car that runs you over is never credited as
  your kill — the ledger check recomputes `score` from booked events.
- Bonus crossing pays 0 or exactly 2000, once.

## Slack rule

The proven campaign (win, zero deaths, 21 kills) re-wins with one fewer
missile per crate, two fewer, ZERO missiles, one fewer life, and
lives-2+tax-1 together. It fires 6 missiles and catches 2 crates in the
proof — so the slack claim is not vacuous.

## Files

| file | role |
|------|------|
| `sim.js` | pure machine: geometry, entities, weapons, stage flow, events |
| `script.js` | the two stages as data (`{t, type, x}` + lane centers) |
| `planner.js` | the autopilot (simulative rollout; the attract demo, the harness oracle) |
| `index.jsx` | renderer, audio riff, attract replay, DEV hook, DebugKit |

`huntercheck` (Node) is in the `static` CI gate with `--mutate`;
`hunterplay` (real keys, pixels) runs in `smoke`.
