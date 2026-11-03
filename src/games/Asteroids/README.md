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
One mulberry32 stream per run (`seedRng`), regenerated at every human start
honoring `?seed=N`: every rock silhouette, velocity and position, particle
sprays and shot-noise jitter draw from it — zero `Math.random` outside the
two seed generations. Report `{tick, score, done, seed, lives, wave}`; QA
contract `exposeGame` id `asteroids`, buttons `left/right/up/a`.

## Verify
```
npm run asteroidscheck            # determinism + 1979 scoring law + wiring (24)
npm run asteroidscheck -- --mutant  # 6 mutants, all must die
npm run lint:asteroids
```

## Honest gaps
- No flying saucers (the arcade's big/small UFOs and their 20/50/100 +
  200/1000/5000 bullet bonuses) — owed.
- No hyperspace teleport (the arcade's desperate panic button).
- No rock-vs-bullet or rock-vs-rock interaction (the machine had neither).
- Sound is the Feb sketch: noise bursts + saw shot; no thumping heartbeat
  tempo ladder, no arcade saucer warble.
