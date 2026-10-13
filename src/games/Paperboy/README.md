# PAPERBOY — the route is a proof, not a level file

The NES-style paper round: a projected band-strip road (256×224, all art and
audio at runtime), 77 doors across three routes, carts that sweep crossings,
dogs that lunge from the kerb, and a solver whose proven ride IS the attract
demo, tick for tick.

The game lives or dies on one contract: **the planner and the sim share one
geometry, and the sim is the law.** `planner.js` is a grid DP over
(tick, x-slot) that reuses `sweepBlock`/`cartAt`/the dog lunge from `sim.js`
verbatim; `papercheck` replays every solved route through `step()` and refuses
to believe a DP the sim doesn't honour.

## The rules that are load-bearing (each has a mutant that dies for it)

- **The door window is THE consumable.** A paper only lands if it crosses the
  door's `s` within `±16` AND you are leaned that way (`x ≤ −6` / `≥ +6`).
  Miss = a wasted paper and a dead streak. The slack rule re-proves every
  route with the windows **2px tighter per side, at full throttle AND at a
  crawl, with zero spare papers** — every one of those solves wins.
- **A cart closes the road behind its nose** (`carAhead` px of swept span).
  A cart (3 px/t) outruns the handlebars (2.4), so "beat it across" is only
  true AHEAD of the nose; the DP's blocked set encodes exactly that, and
  `carSweep=false` has a mutant that dies on it. (First version of this rule
  silently dropped the CFG guard in a rewrite — the probe caught a stale
  event, not the rule. That is in `papercheck` as a lesson.)
- **The dog lunge lands INSIDE its `s`-band** and crosses from its own kerb
  past centre: the doomed lane is between the dog's body and the middle, and
  the safe answer is the kerb it came from. `dogR=30` exists so the crossing
  overlaps the band — an early lunge is a decoration.
- **The DP must disagree when physics lies.** A `steer` mutant (0.3 px/t,
  grid inconsistent) must NOT produce a verified win — the replay witness,
  not the DP, gets the final word.

## Files

- `sim.js` — the pure tick machine. s-forward + lateral x, bang-bang
  steering, carts on absolute tick phases, dogs keyed to your `s`, one
  `step(state, input)`, zero `Math.random` (papercheck throws on it).
- `levels.js` — three scripted routes: houses (one char per slot, L/R),
  crates, dogs (`s0` keyed), crossings `{s, P, ph, from}` (cart grid
  `ph + k·P`, enters at |x|=84, sweeps in 56 ticks, 79+ tick gaps). Palettes
  for day/dusk/night.
- `planner.js` — `solveStage` (grid DP + lean-constrained throw ticks +
  candidate backtracking) and `solveGame` (three chained stages, absolute
  cart phase threading, one continuous witnessed run to the win).
- `index.jsx` — projection: `proj(x, dy)` (quads far→near, sprites scaled by
  the same `k`). paperplay samples THIS function to prove the drawn boy sits
  where the physics put him.
- `scripts/papercheck.mjs` — route audit (a window a crate/crossing would
  steal is a build failure), engine pins, the proven run, the slack ladder,
  determinism, six mutants. `scripts/paperplay.mjs` — Chrome, real keys only:
  timed throws, lean gate, crash ledger, death, restart, pixels vs physics —
  and the look of 1989, graded in pixels (#186): the road and grass columns
  must stay flat (more than two luminance edges is the old two-tone banding,
  and it fails), and the boy's sprite mask must be taller than it is wide
  (the profile "bike is sideways" fails).

## Knobs worth knowing

`CFG`: `wwin` (16), `steer` (2.4), `PEDAL` [1.2, 2.0, 2.8], `dogR` (30),
`carAhead` (26), `carSpd` (3), `stun` (45), `iframes` (120). Grid `G`=0.8
is 3 slots per steer tick; DP slots and sim positions coincide exactly at
2.4 px/t so DP x-positions ARE sim positions.

`paperplay` once raced the crash section by seeding `s` inside the crate's
band — the harness can't cheat, but it can be sloppy: seed OUTSIDE the band
and let the clock carry the boy in, like a player would.
