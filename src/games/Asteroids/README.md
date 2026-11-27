# ASTEROIDS — engine notes

Atari 1979. Wire-frame vectors on a wrapping screen: fly the wedge, shoot the
rocks, don't touch them.

## Rules that are load-bearing
- **Arcade scoring 20 / 50 / 100** for large / medium / small rocks
  (`scoreForSize` in `sim.js`). One fully-destroyed large rock scores the
  known arcade total **520** (20 + 2×50 + 4×100) — asteroidscheck pins it.
  Fidelity note: the b15 handoff map sketched "10/50/20" — that is not the
  machine's table; the arcade numbers ship (#237 law, recorded on #1473).
- 3 lives, bonus life every 10,000 points (`livesForScore`).
- Rocks split large→medium→small (size/2 chain, splits stop at size ≤ 15).
- Ship vs rock (restored — the Feb port's ship could not die): collision
  takes a life; the ship returns dark after ~1 s with ~2 s of blinking
  invulnerability. 0 lives = GAME OVER (`done: true`), any key/click/tap
  restarts (`startRun`).
- Wave clear refills the field: wave 1 opens with the port baseline 6 rocks,
  +1 per wave, capped at 11.
- Momentum physics: thrust along the nose, friction 0.99, wrap everywhere.

## Seeding (#1473 batch 16)
One mulberry32 stream per run, regenerated at every human start honoring
`?seed=N`: every rock silhouette, velocity and position, particle sprays and
shot-noise jitter draw from it — zero `Math.random` outside the two seed
generations in `index.jsx`. Since b26 the stream rides INSIDE the world
(`gs.rngState`, same mulberry32 steps), so the WATCH driver can clone the
world and fork the dice deterministically from `(seed, tick, rngState)` —
candidates are judged under identical future weather. Report
`{tick, score, done, seed, lives, wave}`; QA contract `exposeGame` id
`asteroids`, buttons `left/right/up/a`, state carries `stateHash(gs)`.

## The whole-tick lift + WATCH driver (#1637 batch 26)
`makeRun(seed)` is the entire world; `tickAsteroids(gs, input)` is what
`update()` used to be (drift, wrap, splits, respawn dark + grace, wave regen,
terminal) — `index.jsx` keeps only shell: canvas, sound from the event bag,
chrome. `watchStep(gs)` (Y / the pill) scores the greedy play plus twelve
candidates (rotate L/R/hold × thrust/hold × fire/hold) by replaying the game's
OWN physics on a cloned world, 70 ticks ahead, under greedy continuation:

- **each candidate is HELD 10 ticks** before greedy takes over — one rotation
  tick barely bends the future, and when every candidate ties the ship never
  turns (1-tick rollouts left it firing into empty space beside the last rock);
- **dodge is honest**: flee only rocks whose quadratic time-to-collision
  reaches the hull inside 45 ticks — creeping pebbles never arrive, and
  fleeing them is what made the first driver orbit the last rock forever;
- **shots lead the target**: solve |Δ + v·t| = BULLET_SPEED·t (the game's own
  linear arithmetic) and the fire window opens at the rock's angular half-size
  — a distant pebble must be CLOSED before a hit is geometrically possible;
- **value** = ticks survived ≫ rocks smashed ≫ lead-aim shaping (gap shut +
  alignment + loaded shot) — shaping keeps a gradient toward the kill until a
  horizon is long enough to SEE it.

Measured 40 seeds × 120 s: all 40 finish the watch, 38 zero-death, waves 2–4,
worst seed still banks 8300 (974,430 fleet total).

### Panic reserve (#2001 part 4)
The arcade ace kept hyperspace for the desperate moment, never as transport —
so the driver does too. `watchStep` considers the jump ONLY when every steering
candidate comes back dead inside the horizon (value below the survival floor),
and the jump must outlive them all to be taken. It rides the run's seeded
stream (cloneWorld carries `hyperReadyAt`/`hyperUntil`), so the sweep judges the
exact teleport the seat makes. Effect: zero-death 24 → **38/40** (fast 9 →
12/12), measured 13 jumps fast / 128 full — scarce, and spent only cornered.
Deliberate kiting shipped after it (#3706 below).

## #3706 — the kiting dance

The machine pays **200 large / 1000 small** for the saucers — the board's
biggest money — but the WATCH pilot never saw it: `rollout()` paid rocks
(`ev.smashed` × 120) and added nothing for `ev.saucerKilled`, and the eye fled
a hull at ttc < 75 even though its gun is honestly tracked as bullets (±60
ticks). Every rollout that killed a saucer valued the same as one that
outran it — a bounty docked. Two dice-free moves open the dance:

- **the ledger pays** — `rollout()` credits `SAUCER_SCORE[size] × 1.2` onto
  the rocks' scale (a small rock = 100 arcade = 120 units, so small UFO
  +1200, big +240 — the machine's own 10×/2× ratios). The horizon×10000
  survival floor swamps any bounty, so no candidate is ever *bought* into a
  death; the bounty ranks among survivors, which is exactly where the dance
  lives. A dead saucer also erases its future fire, so survival already leans
  toward the pilot that banks it; this makes the bank explicit.
- **the margin is the rock law** — a hull is a flee-threat only inside
  `HULL_DANCE_TTC = 45`, the same "does it actually reach the hull" horizon
  the rocks already use. Past the margin, greedy no longer turns its back:
  the nd bounty discount (−120 px past 160) already ranks the hull first, so
  the pilot keeps the crosshair on it and fires on the lead window — sidestep
  the weave, answer the gun, bank the 1000. Rocks and bullets keep the
  verbatim flee law; the panic reserve still catches a point-blank hull.

Measured, ten seeds × 2400 ticks seated: **14 saucer kills, zero deaths**
(the docked law banked 5 on the same seeds). Gated in asteroidscheck §kiting
(14 gates: margin reuse, ledger + threat source pins, three banked-bounty
seeds, the fleet bank ≥10 with zero suicide, the cornered hull still buys the
jump, the rock flee never fires) plus two mutants — bounty docked again, old
75 margin restored — both die.

## Flying saucers (#2001)
The 1979 machine's signature threat. Alarms arrive every 8–14 s while rocks
are on the field (first after ~18 s), entering from a random edge and wrapping.
The **large saucer** (r 22, speed 2.0) drifts with erratic course changes and
**sprays** — its shots carry ±0.55 rad of error. The **small saucer**
(r 12, speed 2.7) flies the arcade's sine weave and fires nearly dead-on
(±0.15 rad) — once it has learned (#3553 below: rookies spray, veterans pin).
Saucer bullets fly at 4 (outrunnable), kill the ship on hit,
hull contact kills — and the respawn grace covers all three death paths.

Scoring is the machine's table: **200 large / 1000 small** for the saucers,
and a saucer's own bullet smashing a rock pays the **bonus** instead of the
base table — large UFO 50/100/200, small UFO 200/1000/5000
(small/medium/large rock) — the reckless alien gunner is bonus fire, and its
bullets split rocks on the same chain. Attract mode shows saucers but never
fires (`!gs.attract` gates the gun). Wave clear is rocks-only — an alarm
never gates the refill; a saucer that outlives its set piece leaves after 15 s.
All arrival/path/shot dice ride the run's seeded stream (`?seed=N` replays
every alarm); the stateHash covers saucers, and the WATCH driver treats hulls
and hostile fire as threats and discounts a saucer's range by 120 px when
choosing what to hunt — the 1000-point kill is worth closing on.

## #3553 — the small saucer learning curve

On the machine the small saucer's aim was not a constant: it started loose and
tightened the longer that saucer survived, so leaving one alive was the
mistake. `SAUCER_AIM` (`sim.js`) now models it: the small UFO's shot error is
full width **1.1 rad** (the large UFO's spray, ±0.55) at spawn and eases
**monotonically** to the shipped ±0.15 floor over `learn = 600` ticks (10 s of
its 15 s life); after the horizon it stays at the floor, i.e. exactly the
pre-#3553 shooter. The age rides the saucer's own `life` countdown, so:

- **no new field and no extra dice** — the shot line still makes its single
  `rnd()` call per shot; the draw is just scaled by the eased width, and the
  dice stream stays aligned with every pre-#3553 seed at spawn/arrival;
- the large UFO never eases (`saucerAimWidth` short-circuits it);
- mature small-saucer shots are the verbatim ±0.15 law — the old pin, moved
  one notch later in a saucer's life, never weakened.

Gated in `asteroidscheck`: eight gates — rookie spray observed >±0.15 across
six shots on the pinned seed, bounded by ±0.55; mature (age ≥ learn) lands
within ±0.15 across four shots (the old dead-on law, now the *floor*);
brand-new width = start; monotone tighten across the whole ease; floor reached
exactly at `learn`; floor holds to `life → 0`; large UFO constant at both life
ends. Plus two mutants: **learning deleted** (locked to the floor — kills the
rookie gate) and **ease never reaches the floor** (halved rate — kills the
mature pin).

#3553's never-dry note: the pick was ASTEROIDS (weakestStage score 4, oldest
of the score-4 tie at registry #3); line 0 of the honest-gaps list ("no
rock-vs-rock") is an adjudication — the machine had none — so the oldest real
gap was this one. The WATCH driver keeps its shipped floors (re-measured at
this head in the full sweep).

## Sound ladder (#2001)
Runtime-synthesized, all through `audioController`: the arcade's two-tone
heartbeat whose tempo climbs as the field thins (`beat = max(22, 14 +
rocks × 14)` ticks), the two-tone hover warble while any saucer is on
screen, an arrival sweep, the alien's shot tick, and a stepped kill
explosion. The shot is now a descending saw sweep, not a bare tick.

## Look polish (#2001)
The vector bar of docs/ART.md. Rocks JAG like the cabinet etched them: the
vertex radius die swings ±0.25 / ±0.2 / ±0.15 of nominal for the large / medium
/ small tiers — coarser the bigger the rock — on the same dice count, so seed
fields keep their stream position. Every kill stamps a **flash** (rock 1.5× its
size, saucer 1.8× its radius, ship 2× SHIP_SIZE) that the shell paints as an
expanding fading ring, decayed on sim ticks. The ship is the arcade's **notched
wedge** — nose, twin aft fins, a thruster notch cut into the back — exported as
`SHIP_HULL` so the drawing and the asteroidscheck pin share one table. The
death → dark (RESPAWN_DELAY) → blink-grace (INVULN_TICKS) chain is pinned
tick-exact in both the sim and the drawn ship's visibility gate (#2001
backlog item "sprite↔state after death-respawn", sim + wiring half; a pixel
probe would need the live seat).

## Verify
```
npm run asteroidscheck            # determinism + 1979 law + wiring + driver sweep + seat/saucer/hyper/look/panic/learning/kiting rules (136 gates)
npm run asteroidscheck -- --mutant  # 31 mutants (6 b16 + 7 b26 driver + 6 saucer/heartbeat + 3 hyperspace + 3 look polish + 2 panic reserve + 2 learning curve + 2 kiting dance), all must die
ASTEROID_SWEEP=fast npm run asteroidscheck  # 12-seed × 60 s sweep (what the mutant children run)
npm run watchcheck -- --only asteroids      # live seat: seat/blips/takeover/re-seat
npm run lint:asteroids
```

## Honest gaps
- **DISCLAIMER**: No rock-vs-rock interaction (the machine had neither).
- **CLOSED by #3553:** Small saucers ease their aim over time in the original;
  ours were locked at ±0.15 rad. The learning curve is now modelled — see
  "#3553 — the small saucer learning curve" below.
- **CLOSED by #3706:** Deliberate kiting (drawing the saucer, beating its fire
  back) is not modelled; the panic reserve (#2001 pt4) stopped the tight-wave
  bleed, but the driver flees honestly rather than playing for the
  docked-bounty dance. See "#3706 — the kiting dance" below: the pilot now
  banks the 200/1000 money instead of outrunning it.
- `snapshot/restore` stay omitted (#391): the seeded stream rides `gs.rngState`
  and mid-rollout JSON round-trips would fork dice the live world never rolled.
