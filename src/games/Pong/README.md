# PONG — engine notes

The 1972 machine (Atari Pong, "Table Tennis"): two paddles, one square ball,
big faint numerals, dashed net. First version. Ours is the same table.

## Rules that are load-bearing
- Ball speeds up 1.05× per paddle return (`dx *= -1.05` in `sim.js`);
  wall bounces flip `dy` only (position keeps its penetration — the Feb-port
  arithmetic, and the seat's predictor replays the SAME rule or it would lie).
- Serve is from the center each point: direction coin-flip + vertical angle,
  both drawn from the run's seeded stream (`sim.js serveBall`), plus paddle
  start scatter (`paddleStart`) and anti-loop paddle-hit spin (`paddleSpin`).
- **Play-to-quit terminal (#1473 batch 16).** The 1972 machine had no enforced
  score cap (players agreed a target); this port ships none, so the honest
  terminal is a quit press: `q`/Escape during play ends the match
  (`state.over = true`), the final score stays on the table under a blinking
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

## The sim lift + the WATCH driver (#1637 batch 24)
`tickPong(gs, input)` holds the WHOLE per-tick rule set (ball step, both
paddles, clamps, collisions with seeded spin, scoring) — index.jsx keeps
keys/attract/render/sound only. The harness therefore drives the shipped
physics, not a paraphrase.

- `stepBall` / `cpuStep` — the machine's paddle is the dead-zone tracker
  (±10px, AI_SPEED) the Feb port shipped; lifted so the sweep faces the same
  opponent the player does.
- `predictLand(ball, height)` — where the ball crosses the left paddle plane:
  forward replay of the game's own step arithmetic (same wall-flip rule), so
  the answer is exact. `null` when the ball heads away — the opponent's return
  spin is drawn at contact and cannot be known early.
- `watchStep(gs)` — THE DRIVER: approaching ball → aim the exact predicted
  crossing; departing ball → table-center (minimax under the unknowable spin),
  at HUMAN paddle speed (PAD_SPEED), so the proof transfers to the seat.
  Reactive every tick (Rogue law): seats anywhere mid-rally, steer takes over,
  re-seat re-plans from live state, quit releases with the match.
- **The sweep's honest floor (pongcheck §driver):** 40 seeds vs the machine,
  driver wins **39** (36 points conceded total, deterministic). Seed 25
  (`197988`) is a DOCUMENTED forced loss: the post-point paddle scatter plus
  a steep serve outruns 6 px/tick there — measured against center-hold,
  ball-track and through-opponent policies, none wins that seed, so the game
  physics (not the driver) loses it. The floor is pinned at exactly 39 with
  seed 25 named: if a change wins it, the check goes red and the documentation
  must catch up (that is the point of pinning a floor, not a ceiling).

## Verify
```
npm run pongcheck            # attract rule-6 + seedpin law + driver sweep (43 checks)
npm run pongcheck -- --mutant  # 9 seedpin/driver mutants (incl. walls-pulled,
                               #   sign-flip, seat-poses), all must die
npm run pongcheck -- --mutate  # 5 attract mutants, all must die
npm run watchcheck -- --only pong   # browser pilot: seats, returns balls, steers back
npm run lint:pong
```
DEV probes: `__pongTest` — `watching / probe (tick,hits,scores,paddles) / watchSfx / start`.

## Honest gaps
- AI opponent is a simple tracker; the original's right paddle was human
  (2-player) or a much later silicon. No difficulty tiers (the driver plays
  one speed — the human speed — by design of the proof).
- Seed 25 is unbeatable against the machine because of the ported paddle
  scatter after every point (see the driver section). Removing the scatter
  would be more faithful to the cabinet but re-litigates the #1473 seedpin —
  deliberately not touched here.
- No selectable max-score knob (the machine's RANGE switch) — quit is the
  terminal by design; a selectable cap would be a feature, not a restoration.
- Touch: pad arrows only; no on-screen quit (desktop `q`/Escape).
- Sound is the Feb-port sketch: single tones per hit/score; no crowd, no
  spin pitch variation.
