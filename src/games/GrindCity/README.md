# GRIND CITY — notes

One sun-baked concrete park, one board, one timer. Skate a clean line through
S-K-A-T-E, gap the trench, grinds and manuals included, before 2:00 drops.
Original IP (no licensed names, trademarks or levels); the genre is Tony Hawk,
the park and every trick name are ours.

## Layout of the code

| file | role |
|---|---|
| `park.js` | **the surface** — one analytic height field `parkHeight(x,z)` + normals, plus `RAILS`, `LETTERS`, `GAP`, `spawn()`. The renderer builds its meshes from the same math the physics rides, so the board can never sink into or float over visible geometry. |
| `sim.js` | **pure rules** — `step(state, input)` advances one fixed tick; no DOM, no three.js, no randomness (a seeded run replays identically). Ground-following riding, ollie/grab/kickflip, manuals, rail auto-latch, combo scoring, bails, the S-K-A-T-E goals, run clock. |
| `planner.js` | **the bot** — rule-based autopilot that follows waypoint bearings, times ollies off ramps and rails, and collects the letters. It drives attract mode *and* proves the park is winnable (`grindcheck` refuses to merge if the bot can't score a win). |
| `music.js` | **the bed (#3167)** — the original A-minor groove + the landing-pitch law, as pure data. The cabinet schedules it from its sim ticks, so pause stops it and the replay runs silent. |
| `art.js` | three.js scene — park mesh from `park.js`, sky + sun glare, rails, floating gold letters, the skater rig (`buildSkater`/`poseSkater`), particle sparks. |
| `index.jsx` | cabinet — loop, input, HUD, sounds, cameras (chase · fisheye action · replay), run-replay recorder (`packIn` log) and the `exposeGame` contract + `__grindTest` drive hooks. |

Run: `npm run grindcheck` (Node, no browser — includes the input-log replay
determinism proof and 3 mutants: letters, gap, replay). Deep-drive the cabinet
with `DEV_PORT=5178 node scripts/lib/gcdrive.mjs` (also proves the REPLAY
screen, the skip and the action-cam cut-in).

## Controls

| key / pad | action |
|---|---|
| ← → | steer |
| ↓ | crouch / pump (speed down slopes) |
| A (`Space`) | ollie · **hold in the air** = grab (MONGOL, MEND, STALEFISH…) · **press on landing** = manual |
| B (`Shift`) | kickflip on the ground · flat spin in the air |
| `?` | how-to-play overlay |

Rails auto-latch when airborne nearby (nose or tail, travel-aware). Grinds
break off the end with a pop. Combo multiplier = distinct tricks + 1 (cap ×10);
bailing forfeits the unbanked chain — the same rule as the real games.

## The park (all in `park.js`)

Deck → **drop-in ramp** → flat run-up → **trench (the gap)** → **halfpipe**
(both walls rideable, coping air over the pipe) → **boardslide rail** over the
pool edge → final flat, with S‑K‑A‑T‑E floating along the line. Speed only
comes from heights, so the route is laid out downhill from the deck; letter K
sits on a plate just above the pipe crossing.

## Scoring

Trick values in `sim.js` (`TRICKS`) scaled by hit count, then the chain
multiplier; grinding and manuals tick per tick. Landing a chain banks it about
0.6 s later (the blue flash). Letters are +500 each. **Win = all 5 letters +
the gap clean before the clock dies.** Target for the harness: ≥6000.

## Cameras and the run replay (#3225)

Three cam modes, hard cuts between them (smoothing lives *inside* a mode;
crossing is a snap + white flash + FOV punch — the Tony Hawk transition
grammar):

- **chase** — the everyday cam (FOV 72).
- **action** — low, close, side-offset, FOV 96 while grinding, on a manual, or
  airborne with a grab: the wide-angle + short-distance fisheye stretch.
- **replay** — after a run ends, the last 10 s of the line plays back on its
  own cam (closer, wider, slight side lead), half-speed while airborne.

The replay is *re-simulated*, not recorded pixels: the cabinet logs one packed
input word per played tick (`packIn`), and playback re-steps `step()` from the
same seed — `sim.js` is deterministic (`rng` derives from state), so the replay
is byte-identical to the live run. `grindcheck` proves it (hash-per-tick) and
kills a mutant that lies in the log. Attract runs get no replay; Space/tap
skips to the results; `state()` exposes `cam` + `replay: {i,n,pct}`.

## Audio bed and landing weight (#3167)

`music.js` holds one original 16-step A-minor loop (bass · pentatonic riff ·
offbeat hats) and the land-thud law. The cabinet ticks the scheduler inside
`simTick`, so the groove follows the *sim* clock: pause stops it, the replay
path (which never calls `simTick`) stays silent, attract plays it at 60%
volume. Every landing adds a sine thud whose pitch falls and gain rises with
touchdown speed — bigger airs land heavier. `grindcheck` proves the laws
(well-formed voices, monotonic thud, cabinet wiring; mutant `bed`), `gcdrive`
proves it live (`bed` in `__grindTest.state()` runs in attract and stands
still through the replay).

## Honest gaps

- **Replay is auto-only.** Last-10 s window, one cam, no speed toggle, free cam
  or saved/shared runs; no replay of the letters-only near-misses shorter than
  2 s, and none behind the attract title.
- **One park, one line.** The park is replayable freely, but there are no
  optional second routes, secret areas or score-mode objects beyond the letters.
- **Trick variety is board-rot based.** Spins/flip combos read from the real
  angular velocity, but there are no grabs on grinds, no lip tricks, no stalls;
  manual chains count but look identical across trick types.
- **The bot's line is fixed.** `planner.js` is scripted waypoints, not a search;
  it proves the park is winnable, not that the trick system is deep.
- `snapshot`/`restore` are intentionally absent from the contract — the sim
  state holds functions (`park.height/normals`), so JSON can't copy it (#391);
  drivers use `reset(seed)` + long `tick()` batches instead, like IronKeep.
