# BEEZEE — file boundaries, the rules that matter, and what it cost

`/beezee` — first-person honeybee flier. Issue #81 (benzenwen): Magic Carpet
meets Bug's Life.

## The split (the heistcheck rule)

- `sim.js` — **pure Node.** Physics, wind, UV radii, webs/wasps/bird/gecko,
  day clock, scoring, and `autopilot` (the attract-mode brain). No three, no
  DOM. `scripts/beecheck.mjs` runs it headless and *proves the gardens are
  flyable* before a browser is opened — the autopilot suffers exactly the
  player's wind and turn limits, so "the bot banks a load" is the reachability
  proof.
- `index.jsx` — the shell: renderer, camera, runtime art (every texture is a
  canvas), input, HUD, DEV hook (`__beeTest.probe/aim`, both read-only).
  It decides nothing.

## Load-bearing rules

- **UV is a landing-ring radius, not a filter.** Deep-cup flowers present a
  `hide * 0.25` daylight radius and `hide * uvBonus` under UV. The harness
  hovers the *gap between the two radii* — daylit collects nothing, UV drinks.
  UV is hold-to-see (V / the pad's UV button); the sky repaint happens on the
  flip (`lastUv` in the loop) — a material swap wired to nothing shipped once.
- **Wind is added to position, not just velocity** (`CFG.windGain`): a 3 m/s
  meadow drifts the hover, which is the game. The sign is mutation-pinned.
- **A stung bee drops its load** (`hurt`): the cost of carelessness is the
  trip, not a life. Wasps retreat 5 s after a sting; the gecko only snaps at
  bees *loitering slow* by its rock — a fast hive approach is the counterplay.
- **The autopilot holds ONE flower until dry.** "Nearest nectar each tick"
  made it mill between two blooms and starve with a full meadow around it.
- The `else` after `if (!target && mustBank)` bound to the wrong `if` and
  silently overwrote the flee target with a flower choice — four stings later,
  the trace showed the bot hovering *while being stabbed*. Braces, not vibes.

## Harnesses

- `npm run beecheck` — Node, ~0.1 s: winnability per garden (bank ≥3, no
  death, wasps on leash), wind sign, UV gap hover, determinism,
  `--mutate` = wind sign / carry / UV flattened, each MUST go red.
  Two of the three first-run "survivals" were **bugs in the harness itself**
  (the probe chased its own recomputed offset shut; a print re-called the
  probe after restoring CFG) — another surviving-mutant-that-was-a-test-lie.
- `npm run beeplay` — Chrome, real keys only. Start → steer → UV → drink 4 →
  **bank at the hive** (t≈86) → HUD dots/score compared to the sim → gecko
  toll → ledger → tap-to-restart, zero page errors. The first version banked
  nothing at 20/21: three `evaluate` round-trips per tick put the driver
  below the sim's tempo; one `snap()` per tick fixed it. A driver that thinks
  slower than the world steers nothing.
- Not yet in CI: `beeplay` stays manual/advisory (Chrome); `beecheck` +
  `lint:bee` gate `static`.

## Controls

Arrows yaw/pitch, hold Space/Z to thrust (bees do not idle), Shift sprint
(the only thing that outruns a wasp), hold V for UV. Tap anywhere to start.
