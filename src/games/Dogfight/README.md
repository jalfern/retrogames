# WWI DOGFIGHT (`/dogfight`)

A fixed-wing scout over the line. The issue's muscles: **a flight model and
instruments on the three.js stack** — altitude is ammunition, speed is the
coin, and the sky keeps books.

## The split (the house rule)

- `sim.js` — the whole world as `step(state, input)` at 30 Hz. Zero
  `Math.random`, zero `Date.now`. Plain Node imports it unchanged
  (`npm run dogfightcheck`).
- `levels.js` — two carved patrols as spawn contracts: every bandit starts
  ABOVE the scout, so the opening zoom climb is not flavour, it is the first
  transaction of the energy budget the sim keeps.
- `index.jsx` — cockpit only: chase cam mounted to the SIM's own attitude,
  instrument DOM written straight from sim state, attract demo = the
  autopilot's proven witness fed back through the real `step()`.

## The energy ledger

`v' = thrust·throttle − (d0 + dK·v²) − g·sin γ` — and velocity is forward ×
v, so **pitching up spends airspeed**. The harness pins this three ways:
trim converges to the closed terminal form √((T−d0)/dK) ≈ 79.6 m/s (155 kt,
a real scout), a pull from 90 m/s must buy metres AND pay for them, and a
glide's total energy `h + v²/2g` may never rise, not for one tick.

Below `stall` (33 m/s) the wing stops flying: elevator authority fades with
speed, the nose drops by itself, the ASI tape is in the red and the STALL
light blinks. The deck is the only enemy that never misses.

## The guns

Synchronized Vickers, belts of 200/240, ~7.5 rounds/s. Tracers leave at
400 m/s + a share of the airframe and **drop under gravity** — a 250 m shot
falls 1.7 m, a 420 m shot nearly 5. Bandits lead you because the autopilot
leads them: two lead passes on the bullet's own flight time, then the
trigger only moves when `predictHit` — a forward-simulation of the exact
bullet integrator against the foe's future position — prints a receipt.
The ledger `belt + flying + hit + missed == total` is asserted per plane,
per tick, in both harnesses. (This ledger was written because a bandit spec
without a belt field fed the guns `undefined` — `NaN > 0` is false, so the
patrol looked *peaceful*, not broken. A fake-dangerous sky is exactly as bad
as a frozen one.)

## Bandits with doctrine

P-D pursuit (pitch and bank both INTEGRATE their command; a pure-P aim
limit-cycles across the gun gate forever and the merge is gun-free theatre).
Circus doctrine: the closest bandit is the lead and guns at 300 m; wingmen
self-defend at 140. Three simultaneous guns is an execution, and no honest
autopilot wins — or loses — an execution. The autopilot dodges bullets it
can SEE (they are state): a hard break across the tracers' line, the other
way from where the deflection already aims.

## Harnesses

- `npm run dogfightcheck` — Node, ~0.5 s. Construction, trim/stall/zoom/
  glide ledgers, bullet-integrator parity against an independent
  integration, per-tick round ledger, the real pilot winning both patrols
  **by the gun alone**, determinism three ways, **slack** (−20 rounds AND
  −40 m must still win), and `--mutate` for seven mutants that must die.
- `npm run dogfightplay` — Chrome, real key events only. Instruments
  (ASI/altimeter/belt DOM) read the probe to the unit; a projected bandit
  is confirmed in painted pixels; a real pull drains m/s into metres; the
  live stream replays hash-identical in the tab; death → R is clean.
  `DOG_LITE=1 --throttle 16` reproduces the CI runner (lite pipeline,
  640x426, 16x slow CPU).

## Honest gaps

- The attract autopilot fires ~5 rounds a patrol because the receipt gate
  is honest; a human sprays. `missed ≤ 3` is a harness promise about the
  PILOT, not the player.
- The Circus can be won at hp 1. It is meant to be close; if it becomes
  a coin flip for Jon, the honest knob is the lead's gun range (300), not
  the player's hull.
- 2D instrument knobs are DOM, not gauges; no gun-jam sim; no observer/
  tail-gunner third party; one wing colour per side.
