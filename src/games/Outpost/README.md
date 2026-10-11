# OUTPOST — three depths of dwarf-style colony sim

Route `/outpost`. You are the **foreman**: you never touch a dwarf. You
designate jobs (DIG / FARM / RALLY) and the colony runs itself — idle
colonists claim work off a priority queue and A-star to it.

## File boundaries (the honest seams)

| file | owns | never touches |
|---|---|---|
| `cave.js` | seeded generation (mulberry32), rooms, the SEALED beacon room, bush/ore placement | sim state, input, the DOM |
| `sim.js` | `step(gs, input)`: job queue, claims, A*, dwarves, hunger, ledger, descent | dice (`Math.random` is banned below cave.js), rendering |
| `planner.js` | the greedy autopilot: `decide(gs)` -> one designation; `plan(seed)` -> the proven run | the canvas, the player's keyboard (it uses only the input vocabulary) |
| `index.jsx` | canvas ASCII, input, attract replay, DEV hook | any sim logic — it only calls `step` |

## Load-bearing rules (each one earned)

- **The beacon room is sealed BY CONSTRUCTION**, and layouts whose beacon is
  already walkable are *retired by the generator*. A "win" with `dug==0` is
  a stroll, not a dig — and `outpostcheck` fails it per-depth on every seed.
- **A dig job targets rock; nobody stands on stone.** The digger paths to
  the nearest ADJACENT open cell (`digX/digY` is the swing, `tX/tY` the
  stance). Re-planning around the job cell is the bug `outpostplay` pins.
- **A death returns its claim.** `die()` sets `job.claim = null` — the job
  re-enters the queue and someone else finishes it. The mutation harness
  puts the leak back every run and the live integrity scan must see it.
- **A resolved job leaves the queue** (`release`). The first version leaked
  claims on every resolve; the run still WON — which is why the probe is
  the live per-tick scan, not the win.
- **The food ledger balances to the unit every tick**:
  `depot + carried + eaten + rotten == start + harvested`. Ore mirrors it
  (`mined == ore + carried`).
- **Rally resolves from STATE**: `gs.rally && every living dwarf ON the
  stairs` — the only state that descends. Starvation pulls dwarves off the
  stairs and back; the chain can't fake it.
- **Hunger is a clock, and the clock kills**: 8 ticks/unit, 100 to peak,
  40 ticks at peak with an empty depot and a dwarf dies.

## The run the harness proves

`plan(seed)` is the autopilot: farms first (2+depth plots), then the
tunnel — the rock front with the lowest 0-1-BFS-through-stone distance to
the beacon — then rally. Its proven run IS the attract demo, tick for
tick, and the SLACK RULE re-runs every seed with `dwarfCut: 1, foodCut: 1`
(one fewer dwarf, one fewer ration): still wins, every seed, or the build
fails.

## Verify

```bash
npm run outpostcheck              # ~20 s, Node only
npm run outpostcheck -- --mutate  # +7 mutants, each MUST die
npm run dev                       # another terminal
npm run outpostplay               # Chrome, real keys, pixels vs state
```

## Known, honest gaps

- Bush density is generous: the autopilot never faces a famine, so
  starvation is only visible via losses, the DebugKit, or the harness.
- Dwarves share tiles (no body blocking) — corridors fill up visually.
- Ore is score only; no crafting spine (the issue named job queue + A* as
  the muscles; a tech tree is its own issue).
- The autopilot's tunnel is shortest-first, not prettiest-first; you will
  see it drill straight through a seam instead of around a room.
