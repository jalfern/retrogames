# PONG — engine notes

The 1972 machine (Atari Pong, "Table Tennis"): two paddles, one square ball,
big faint numerals, dashed net. First version. Ours is the same table.

## Rules that are load-bearing
- Ball speeds up 1.05× per paddle return (`dx *= -1.05` in `sim.js`);
  wall bounces flip `dy` only (position keeps its penetration — the Feb-port
  arithmetic, and the seat's predictor replays the SAME rule or it would lie).
  #3532: the flip is **direction-guarded** (`dy` must point INTO the wall) —
  the cabinet's flip was the contact event. Without the guard, deterministic
  edge kicks parked the ball inside the ceiling band (measured: y≈−6.6, an
  endless shuttle); with it, penetration stays and escape is guaranteed one
  step later (penetration ≤ |dy|).
- Serve is from the center each point: direction coin-flip + vertical angle,
  both drawn from the run's seeded stream (`sim.js serveBall`) — those are the
  game's ONLY two dice. #3532 restored the cabinet: paddles **hold** wherever
  the player left them across points (no scatter), match start centers them,
  and deflection is **strike-position law**: `dy += SPIN_K · offset/half`
  (edge hits steepen, center hits flatten, ±2 clamp — the envelope the random
  spin die used to roll). An anti-loop floor `|dy| ≥ DY_MIN` after returns
  ends the converging flat rallies that deadlocked the capped EASY table —
  from state, no dice.
- **Play-to-quit terminal (#1473 batch 16).** The 1972 machine had no enforced
  score cap (players agreed a target); this port ships none, so the honest
  terminal is a quit press: `q`/Escape during play ends the match
  (`state.over = true`), the final score stays on the table under a blinking
  MATCH OVER card that reports the TRUE result — solo: YOU WIN / YOU LOSE /
  MATCH TIED; 2P: PLAYER ONE WINS / PLAYER TWO WINS / MATCH TIED — and any
  key/click/tap starts a fresh match. The report carries `done: over` —
  never a fake winner.
- `startRun()` regenerates the seed honoring `?seed=N` and **zeroes both
  scores** (pre-port, a dead "Reset score? Maybe" comment let the score
  persist across "runs"; pongcheck calls this out by name).

## Seeding (#1473, re-baselined by #3532)
One mulberry32 stream per run (`seedRng`), regenerated at every human start;
the two serve dice are the ONLY draws — deflection is pure state (strike
offset), so pongcheck counts `rand()` calls in `sim.js` and pins it at two.
Report:
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
  forward replay of the game's own step arithmetic (same guarded wall-flip
  rule), so the answer is exact — pongcheck replays `stepBall` itself and
  compares tick-for-tick, clean flights and penetration-band starts alike.
  `null` when the ball heads away — the opponent's return steepens by where
  it strikes the ball, and the tracker commits to that offset only at
  contact, so it cannot be known early.
- `watchStep(gs)` — THE DRIVER: approaching ball → aim the exact predicted
  crossing, then meet it OFF-center (#3532): the paddle target sits
  `AIM_RATIO·half` above or below the crossing so the return steers toward
  the wall farthest from the machine — the shot a PONG player aims, and it
  restored HARD from 26/40 (dead-center flat gifts) to 38/40. Departing ball
  → table-center (minimax under the unknowable strike offset), at HUMAN
  paddle speed (PAD_SPEED), so the proof transfers to the seat.
  Reactive every tick (Rogue law): seats anywhere mid-rally, steer takes
  over, re-seat re-plans from live state, quit releases with the match.
- **The sweep's honest floor (pongcheck §driver, re-pinned by #3532):**
  40 seeds vs the machine, driver wins **40** (15 points conceded total,
  deterministic). The old 39/40 pin named seed 25 (`197988`) as a forced
  loss — that loss was the port's post-point paddle scatter, and it fell
  off when the scatter did. §deflection pins the new law itself (center=
  flat, edges steepen ±SPIN_K clamp, |dy| floor, scoring never moves a
  paddle, the direction-guarded flip), and §driver proves the seat actually
  aims (majority of returns strike off-center).

## Verify
```
npm run pongcheck            # attract rule-6 + seedpin law + deflection law + driver sweep + #3502 tiers (81 checks)
npm run pongcheck -- --mutant  # 20 seedpin/driver/tier/cabinet-law mutants (incl. walls-pulled,
                               #   sign-flip, seat-poses, dead-select, dead-ceiling, dead-2P, plus
                               #   re-planted scatter, flat/steer-blind deflection, ceiling-park,
                               #   unguarded predictor, no-aim seat), all must die
npm run pongcheck -- --mutate  # 5 attract mutants, all must die
npm run pongdrive            # real Chrome, real keys: selector cycles, tap-dial, pick starts, W/S 2P legs, touch quit (#3529) (26 checks)
npm run pongdrive -- --mutant  # 3 chip mutants (never-rendered, attract-flip, dead-key), all must die
npm run watchcheck -- --only pong   # browser pilot: seats, returns balls, steers back
npm run lint:pong
```
DEV probes: `__pongTest` — `watching / probe (tick,hits,scores,paddles) / watchSfx / start`.

## The cabinet switches (#3502)

The 1972 coin door had an AUTO/HUMAN selector for the machine paddle and a
RANGE switch labeled Easy/Difficult. Attract now carries that as a real pick:
LEFT/RIGHT or a tap on the pick label cycles `EASY · NORMAL · HARD · 2P`
(both reach the same dial); any other key or a tap starts with the pick
standing, and `?diff=N` pins it (1–4). `NORMAL` is the shipped physics —
pongcheck traces a 3000-tick match at seed 90210 bit-identical against a
diff-less replay, so the tier default touches nothing. #3502's original
promise referenced the pre-#3502 table; **#3532 re-baselined that trace at
the cabinet-serve head** (NORMAL itself changed shape — scatter gone, strike
deflection in), which is exactly what the trace now points at.

- `EASY` — the Easy RANGE: tracker 2.2 px/tick, ±16 dead zone, and a 5.5
  ceiling on horizontal speed. Measured at the #3532 head: the driver sweeps
  **40/40** conceding **0** points, and the ceiling engages every sweep run
  (max |dx| lands on it exactly).
- `HARD` — the Difficult table: tracker 4.5 px/tick, ±5 dead zone. Measured
  at the #3532 head: driver **38/40**, seeds 14 and 24 fall (both pinned,
  honest — the old 13/29 pair was drawn by the scatter dice and is gone).
- `2P` — AUTO off: no CPU at all, W/S drive the right paddle at PAD_SPEED
  (desktop keyboard option per the multiplayer ruling; the pad stays single
  seat, CPU remains the default). The ball rules under 2P are NORMAL.

Fidelity notes: the cabinet's DIFFICULT range raised the ball's *ceiling*;
this port already accelerates uncapped on NORMAL, so HARD sharpens the
tracker instead and no tier lowers the ceiling below EASY's. The two switches
collapse into one selector (four picks) because the port ships one knob.

## Touch quit (#3529)

Quit is the terminal (#1473) but the phone could not reach it — q/Escape
were the only path. A QUIT chip rides the #2324 thirdAction rail (beside
the pad, its own pointer) and renders ONLY while a match is alive: attract,
the over card, and the pause card are chip-free. Its tap fires the same
`Escape` the keyboard fires — honest MATCH OVER card, any tap restarts at
fresh zeroes. Zero physics: `sim.js`, the seedpins and the bit-trace are
untouched; the chip is chrome, not a rule. A fat-finger costs one re-tap,
because the terminal it reaches is honest, not fatal.

## Honest gaps
- No selectable max-score knob (the machine's RANGE switch) — quit is the
  terminal by design; a selectable cap would be a feature, not a restoration.
- **CLOSED by #3529:** touch quit shipped — a QUIT chip on the thirdAction
  rail (play-only, `Escape` code) reaches the honest terminal from a thumb;
  pongdrive leg 6 drives start → chip → card → restart in real Chrome.
- Sound is the Feb-port sketch: single tones per hit/score; no crowd, no
  spin pitch variation.
