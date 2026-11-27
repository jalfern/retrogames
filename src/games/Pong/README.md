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

## The cabinet's voice (#3536)

`voice.js` widens the Feb-port's one-tone-per-event sketch inside the
machine's world — square/triangle/sawtooth pulses only, no crowd, no shimmer:
**rally ping** pitch rides the strike law (post-return |dy| — steep return =
higher ping, faster ball = brighter), colored per tier (EASY triangle/soft/
flat, NORMAL square, HARD brighter-louder-shorter); **serve** — the first
return of a point answers twice (drop + hit, echo a fifth above). The serve
flag (`ev.serve` from `gs.servePending` in sim.js) is observation, not
physics: the same-seed trace with/without the flag is identical, and dice
remain only at `serveBall`. **Wall** is one uniform dry 170 Hz tick — always
below the quietest rally ping; **score** is a low saw thud + noise body.
The serve also arms a net-dash ring around the ball (~0.6 s) so the #3532
paddle-hold reads as intent: the table waits with you, then serves.

## Block numerals (#3536)

`numerals.js` draws the machine's video type: 7-segment score digits (gapped
bars — no two segments touch) live on the table and inside the MATCH OVER
card, which is now a solid panel with the table's own net-dash border and
the final score in the same block face. **Honest wrap (#3576):** a score past
99 cycles 00–99 — never lies by clamping the digits to 99; the alternative
(clamp-and-flash) was rejected as dishonest. Every path past 99 — FREE at
large N, a wrap-prone dial — renders the true modulo rather than a cap.
pongcheck §numerals pins the wrap shape (123 ≡ 23, distinct from 99) and a
mutant that clamps back to 99 must die. The attract title is a 5×7 block
P·O·N·G word-mark, fitted by `titleFit` (at iPhone-SE landscape the table is
~242px wide — the mark shrinks rather than clipping).

## Chip ergonomics (#3536)

The pad bar (and with it the QUIT chip and WATCH pill) renders only while a
match is alive — attract and the over card stay chip-free. At 667×375
pongdrive pins: chip clear of the stick reach, pill clear of the numerals
band (pill top aligns exactly with the numeral floor), chip and pill as two
distinct corners, everything inside the viewport.

## Verify
```
npm run pongcheck            # attract rule-6 + seedpin + deflection + driver sweep + tiers + serve/voice/numerals
                             #   + range-knob law + #3584 centre-open zone pins + #3576 polish pins
npm run pongcheck -- --mutant  # mutants — seedpin/driver/tier/cabinet law, the #3536 lines,
                               #   the #3565 range trio (cap silent / cap at N+1 / FREE misread as cap)
                               #   + the #3576 honest wrap, all must die
npm run pongcheck -- --mutate  # 5 attract mutants, all must die
npm run pongdrive            # real Chrome: selector/tap-dial/2P/touch-quit legs + audio-spy (serve clack opens,
                             #   rally pitches vary, walls under every ping, low thud, no mid-rally clack)
                             #   + 667×375 chip-ergonomics legs + RANGE dial thumb/pin/honest-cap legs
                             #   + #3584 centre-tap-open + dial-column legs + #3576 detent/chip/flash-beat legs
npm run pongdrive -- --mutant  # mutants: 3 chip + serve-refire + flat-pitch + the #3576 cap-beat/detent wirings,
                               #   all must die
npm run watchcheck -- --only pong   # browser pilot: seats, returns balls, steers back (318)
npm run lint:pong
```
DEV probes: `__pongTest` — `watching / probe (tick,hits,scores,paddles,range) / watchSfx / start / sfx / servePending / serveFlash / setDiff / setRange`.

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
tracker instead and no tier lowers the ceiling below EASY's. The two original
coin-door functions (AUTO/HUMAN paddle, Easy/Difficult range) collapse into one
GAME selector, and the word RANGE is reused by the score-target dial below — the
1972 table's RANGE switch was speed, not the cap, so the score dial is a named
homage, not a claim that the machine capped scores (it didn't — see "The RANGE
knob").

## The RANGE knob (#3565)

The never-dry ladder pointed at the README's oldest gap, "selectable max-score
knob". Handshake with history, stated plainly: **the 1972 table had no score
cap** — the b16 ruling stands, and FREE is the default pick so every existing
pin, seed and bit-trace replays untouched. What ships is a cabinet-native
**feature** stacked on top of that honest terminal: a second attract dial,
`RANGE`, cycling `FREE · 1 · 3 · 5 · 7 · 9` (the classic Pong-family score-dial
ladder). ↑/↓ turn it, a thumb on the label rides the same dial, and `?range=N`
pins it for QA. The thumb zones are columns under their labels (GAME 4–46%,
RANGE 54–96%) — **#3584**: when they were halves meeting at x=50%, the centre
tap died on the RANGE button's stopPropagation and the field could no longer be
tapped awake on a phone; the switch bank may never cover the field centre
(#430 any-tap-to-start law).

A chosen number binds **in the sim**, where it must: `sim.js` grew a
`capHit(gs, score)` guard in the scoring branch. When a player reaches the
target the match ends there (`gs.over`, `ev.winner` names who got there), and —
faithful to the cabinet — the winning ball is **never re-served**: no point
after the target, no die burned on a dead ball. `tickPong` still rolls exactly
two dice (the serve); the target is scoring-only state, zero physics change.
FREE (null, and every pre-#3565 game state) fails `capHit` and rolls uncapped
forever. On the over card a capped match shows `FIRST TO N` — the contract it
played — and the cap point rings an **ascending** two-note sting, distinct from
the falling saw of a quit.

pongcheck §range proves the target binds *exactly* in the shipped physics: at
range 3 the driver wins **all 40 seeds**, every match ending at exactly 3–<3,
conceding a pinned **5** points, and never leaving the ball on the table at the
win (the no-dead-serve law); range 1 closes on the first point across 20 seeds;
range 5, 7 and 9 each close across their seeds (concede counts pinned: 5 / 31 /
44); FREE is verified uncapped at 4000 ticks; three range mutants (cap never
fires, cap fires at N+1, FREE misread as a cap) plus the honest-wrap mutant
all die.

### The dial's polish (#3576)

The RANGE knob earned its voice. Every turn of the dial answers with a ~5 ms
**detent pip** (`detentVoice`: 210 Hz / square / vol 0.028 — quieter than the
wall tick, out of the serve/rally/wall/thud vocabulary), new DEV sfx kind,
airly one line. The **target chip** renders during play — a small `FIRST TO`
label and the block-face digit under the numeral band, `#ffd23f`, drawn only
while `range !== null` (FREE shows nothing: a contract that does not exist is
not a chip). The **cap beat** is the one chrome moment the match gets: on the
winning point the card is NOT drawn immediately — the conceded edge blinks a
net-dash line (`#ffd23f`, the net motif, no new dice) for one beat (36 ticks,
~0.6 s) while the table holds the dead ball, then the card lands and
`state.over && flashTicks <= 0` gates it. The win sting still fires at the
terminal point. pongdrive leg 9 proves the beat in the shipped cabinet —
play screen alive, conceded edge flashed, chip pixels on the table through
the beat — plus the detent shape, and pongcheck §range pins the r7/r9 sweeps.

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
- **CLOSED by #3565:** the selectable max-score knob shipped as a FEATURE, not a
  restoration — the 1972 table's own RANGE switch was the Easy/Difficult *speed*
  control (that one is the #3502 tiers). A second attract dial (`RANGE`) offers the
  classic ladder 1·3·5·7·9 plus FREE; FREE stays the factory default so the b16
  play-to-quit ruling is the untouched ship-state. See "The RANGE knob".
- **CLOSED by #3529:** touch quit shipped — a QUIT chip on the thirdAction
  rail (play-only, `Escape` code) reaches the honest terminal from a thumb;
  pongdrive leg 6 drives start → chip → card → restart in real Chrome.
- **CLOSED by #3536:** sound is no longer the Feb-port sketch — serve/rally/
  wall/thud are four distinct voices, rally pitch rides the strike law, and
  the tiers color it (see "The cabinet's voice"). Still no crowd and no music
  over the table: the machine never had either — that restraint is the spec.
- **DISCLAIMER**: 2P is the desktop keyboard option (W/S); the phone keeps the CPU
  seat per the multiplayer ruling — not a gap, a ruling.
