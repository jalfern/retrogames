# PONG — engine notes

The 1972 machine (Atari Pong, "Table Tennis"): two paddles, one square ball,
big faint numerals, dashed net. First version. Ours is the same table.

## Rules that are load-bearing
- Ball speeds up 1.05× per paddle return (`dx *= -1.05` in `index.jsx`);
  wall bounces flip `dy` only.
- Serve is from the center each point: direction coin-flip + vertical angle,
  both drawn from the run's seeded stream (`sim.js serveBall`), plus paddle
  start scatter (`paddleStart`) and anti-loop paddle-hit spin (`paddleSpin`).
- **Play-to-quit terminal (#1473 batch 16).** The 1972 machine had no enforced
  score cap (players agreed a target); this port ships none, so the honest
  terminal is a quit press: `q`/Escape during play ends the match
  (`over = true`), the final score stays on the table under a blinking
  MATCH OVER card, and any key/click/tap starts a fresh match. The report
  carries `done: over` — never a fake winner.
- `startRun()` regenerates the seed honoring `?seed=N` and **zeroes both
  scores** (pre-port, a dead "Reset score? Maybe" comment let the score
  persist across "runs"; pongcheck calls this out by name).

## Seeding (#1473)
One mulberry32 stream per run (`seedRng`), regenerated at every human start;
every die in the game (serve dir/angle, paddle starts, hit spin) draws from
it — zero `Math.random` outside the two seed generations. Report:
`{tick, score(player), done, seed, opp}`; QA contract `exposeGame` id `pong`,
buttons `up/down`.

## Verify
```
npm run pongcheck            # attract rule-6 + seedpin law (29 checks)
npm run pongcheck -- --mutant   # 5 attract + 5 seedpin mutants, all must die
npm run lint:pong
```

## Honest gaps
- AI opponent is a simple tracker; the original's right paddle was human
  (2-player) or a much later silicon. No difficulty tiers.
- No selectable max-score knob (the machine's RANGE switch) — quit is the
  terminal by design; a selectable cap would be a feature, not a restoration.
- Touch: pad arrows only; no on-screen quit (desktop `q`/Escape).
- Sound is the Feb-port sketch: single tones per hit/score; no crowd, no
  spin pitch variation.
