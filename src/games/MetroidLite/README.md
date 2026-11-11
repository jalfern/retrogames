# METROID-LITE (the cave with three upgrades)

One hand-carved cave, three upgrades, and the way back is the way forward:
the POWER BEAM melts cracked blocks, BOMBS drop through green bulkheads, and
the SPACE JUMP clears the two-jump shafts to the relic. Original engine —
the registry entry names the shape; every tile, sprite, star and sound is
synthesized at runtime (no assets).

## Engine

- `sim.js` is the whole game as pure functions — physics, bullets, bomb fuse,
  crawlers, the beacon save-slot, `stateHash`. Zero `Math.random`, zero
  `Date.now`: `makeGame()` is byte-deterministic, so the same inputs at the
  same tick produce the same cave (`metroidcheck` relies on this to replay
  the proven script and re-derive parallax star pixels).
- `planRun(opts)` is the flow machine: it explores the cave with the ability
  gates paid in order (beam → bomb → sjump → relic) and records the WIN as a
  tick-indexed input SCRIPT — the attract demo self-drives exactly that
  script, tick for tick, behind three layers of parallax.
- `attract.js` holds the cycling attract copy (`<AttractMessage>` + the
  attractcheck audit).

## WATCH (#1637 batch 23) — Y replays the proven route, fresh roads only

The route here is a SCRIPT, not a reactive planner, so the seat is a
script-INDEX junction (the Paperboy law): `doSim` applies `script[gs.tick]`
while seated. That is only honest while the live road matches the witness —
the cave is deterministic, so a NEVER-STEERED road is the witness road, and
seating re-anchors it to the witness's tick 0 (`startPlay()` re-makes the
identical world; an unused road has no history to lose). The first real
steer closes the seat for the run (`droveRef`): mid-cave, Y answers the
shared NO_GUIDE toast — never a fake route. Any takeover key hands back from
exactly where the script stood; the relic win releases the seat.

Witness: metroidcheck replays `planRun`'s script through the real sim and
stamps the zero-hit win ("the recorded script no longer wins" goes red if the
route desyncs). The watchcheck pilot seats on an idled fresh road, advances
untouched, takes over, declines mid-route (silently — no blip for a guide
that never started), re-seats on a new road, and releases.

## Verify

```bash
npm run metroidcheck      # 49 checks: sim purity, the script's zero-hit win,
                          # parallax factor law, gadget rules, beacon saves
npm run metroidplay       # browser drive: real keys, predicted star pixels
npm run watchcheck -- --only metroid   # the WATCH pilot + batch-23 source pins
npm run lint:metroid
```
