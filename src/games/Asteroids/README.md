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

Measured 40 seeds × 120 s: all 40 finish the watch, 35 zero-death, waves 2–4,
worst seed still banks 6560.

## Flying saucers (#2001)
The 1979 machine's signature threat. Alarms arrive every 8–14 s while rocks
are on the field (first after ~18 s), entering from a random edge and wrapping.
The **large saucer** (r 22, speed 2.0) drifts with erratic course changes and
**sprays** — its shots carry ±0.55 rad of error. The **small saucer**
(r 12, speed 2.7) flies the arcade's sine weave and fires nearly dead-on
(±0.15 rad). Saucer bullets fly at 4 (outrunnable), kill the ship on hit,
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

## Sound ladder (#2001)
Runtime-synthesized, all through `audioController`: the arcade's two-tone
heartbeat whose tempo climbs as the field thins (`beat = max(22, 14 +
rocks × 14)` ticks), the two-tone hover warble while any saucer is on
screen, an arrival sweep, the alien's shot tick, and a stepped kill
explosion. The shot is now a descending saw sweep, not a bare tick.

## Verify
```
npm run asteroidscheck            # determinism + 1979 law + wiring + driver sweep + seat rules
npm run asteroidscheck -- --mutant  # 13 mutants (6 b16 + 7 b26 driver), all must die
ASTEROID_SWEEP=fast npm run asteroidscheck  # 12-seed × 60 s sweep (what the mutant children run)
npm run watchcheck -- --only asteroids      # live seat: seat/blips/takeover/re-seat
npm run lint:asteroids
```

## Honest gaps
- No hyperspace teleport (the arcade's desperate panic button).
- No rock-vs-rock interaction (the machine had neither).
- Small saucers ease their aim over time in the original; ours are locked at
  ±0.15 rad — the learning curve is not modelled.
- The hunter never hyperspaces or kites deliberately; tight waves can cost it
  lives before the field thins — the arcade ace kept a panic reserve.
- `snapshot/restore` stay omitted (#391): the seeded stream rides `gs.rngState`
  and mid-rollout JSON round-trips would fork dice the live world never rolled.
