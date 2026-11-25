# GRIND CITY — notes

One sun-baked concrete park, one board, one timer. Skate a clean line through
S-K-A-T-E, gap the trench, grinds and manuals included, before 2:00 drops.
Original IP (no licensed names, trademarks or levels); the genre is Tony Hawk,
the park and every trick name are ours.

## Layout of the code

| file | role |
|---|---|
| `park.js` | **the surface** — one analytic height field `parkHeight(x,z)` + normals, plus `RAILS`, `LETTERS`, `GAP`, `spawn()`. The renderer builds its meshes from the same math the physics rides, so the board can never sink into or float over visible geometry. |
| `sim.js` | **pure rules** — `step(state, input)` advances one fixed tick; no DOM, no three.js, no randomness (a seeded run replays identically). Ground-following riding, ollie/grab/kickflip, manuals, rail auto-latch, rail grabs, coping stalls, combo scoring, bails, the S-K-A-T-E goals, run clock. |
| `planner.js` | **the bot** — rule-based autopilot that follows waypoint bearings, times ollies off ramps and rails, and collects the letters. It drives attract mode *and* proves the park is winnable (`grindcheck` refuses to merge if the bot can't score a win). |
| `music.js` | **the bed (#3167)** — the original A-minor groove + the landing-pitch law, as pure data. The cabinet schedules it from its sim ticks, so pause stops it and the replay runs silent. |
| `art.js` | three.js scene — park mesh from `park.js`, sky + sun glare, rails, floating gold letters, the skater rig (`buildSkater`/`poseSkater`), particle sparks. |
| `index.jsx` | cabinet — loop, input, HUD, sounds, cameras (chase · fisheye action · replay), run-replay recorder (`packIn` log) and the `exposeGame` contract + `__grindTest` drive hooks. |

Run: `npm run grindcheck` (Node, no browser — includes the input-log replay
determinism proof, the #3246 gem/secret/roof physics legs, the #3233 manual
identity legs, and 9 mutants: letters, gap, replay, bed, gems, shade, grab,
stall, tell). Deep-drive the cabinet with
`DEV_PORT=5178 node scripts/lib/gcdrive.mjs` (also proves the REPLAY screen,
the skip and the action-cam cut-in).

## Controls

| key / pad | action |
|---|---|
| ← → | steer |
| ↓ | crouch / pump (speed down slopes) |
| A (`Space`) | ollie · **hold in the air** = grab (MONGOL, MEND, STALEFISH…) · **press on landing** = manual · **↓+A at a coping lip** = STALL (#3289) |
| B (`Shift`) | kickflip on the ground · flat spin in the air · **hold on a rail** = rail grab (FEEBLE/CROOKED, #3289) |
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

## The second line, gems and the secret spot (#3246)

The park keeps secrets off the win line:

- **Roof deck (the second line)** — carry the trench landing into the south
  quarterpipe at speed (~8 m/s honest gate; `grindcheck` proves a pumped
  10.5 m/s line crests and a 6 m/s shuffle stalls) and ride a 2.5 m deck
  along the wall crest. The wall fades into the deck with complementary
  curves, so the crest holds a constant height — physics and mesh share
  `parkHeight`, no hump. A coping rail runs the edge; the east end is a
  long ramp back to the plaza.
- **Gems** — 14 score-mode objects, **+100 each**: four along the roof (the
  second line's payday), six packed in the secret bowl, four at the far
  corners. Collecting all 14 pays a one-time **GEM RUN +1500**. The win law
  never needs one (`grindcheck` pins that the autopilot's win line takes
  zero).
- **Secret spot** — a hidden bowl east of the plaza at `SECRET`; entering it
  the first time says `OFF THE MAP!` and pays **+250**, once.

`stateOf` carries `gems/gemTotal/gemsAll/secret`; the HUD shows a green
`◆ GEMS n/14` line and the results screen reports the gem run. DebugKit
(F1) adds `roof` and `secret` teleports for QA.

## Scoring

Trick values in `sim.js` (`TRICKS`) scaled by hit count, then the chain
multiplier; grinding and manuals tick per tick. Landing a chain banks it about
0.6 s later (the blue flash). Letters are +500 each. **Win = all 5 letters +
the gap clean before the clock dies.** Target for the harness: ≥6000.

## The lip vocabulary (#3289): rail grabs and coping stalls

Grabs existed in the air; this is the vocabulary on the rails and lips — built
on the existing rail maths, no new physics surfaces:

- **Rail grabs** — hold B while latched: the rider reaches down and holds the
  board mid-slide. Named by travel: **FEEBLE** forward, **CROOKED** fakie (the
  genre's coping names, like the existing Boardslide/50-50). While held the
  grind trickle **doubles** (+12 vs +6 per 0.15 s) and the balance meter's
  drift is damped ×0.55 — grabbing is the honest reward for risk management.
  A **0.30 s hold** is required before release commits the trick (+70, unique
  in the chain so it grows the multiplier); mashing never pays, and a wash-out
  bail while holding commits nothing.
- **Coping stalls** — hold ↓ (crouch) and press A at a coping lip: the board
  locks tail-in on the rail line (`kind: 'coping'` rails, ≤0.9 m lateral,
  ≤0.75 m vertical — coping sits ~0.7 m above the decks, so the reach covers
  the pool lips, the deck edge and the roof). Speed goes to zero; the STALL
  trickles +8/0.15 s and balances on a **tighter meter** than a grind
  (|bal| > 1.15 slips out — and the lean is visible on the rig). A press pops
  back with a small hop, chain alive: held ≥0.30 s it commits
  `STALL +40 +80×seconds`; 4 s auto-pops. Away from a lip ↓+A is just an
  ollie — no dead combo.
- **Honesty** — `packIn` is still the same six bits, so the #3225 replay wire
  is untouched. The autopilot never presses B mid-grind and never ↓, so the
  attract line and the graded win line are provably unchanged
  (`grindcheck`'s honesty counter). `stateOf` grows additively
  (`railGrab/stall/stallT/stallBal`); `__grindTest.teleport` (DEV) lets the
  live drive reach a lip without burning ten seconds of skating.

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

## The concrete reads like concrete (#3233 tail)

Fine detail lives in the *texture*, not the vertex colors: the mesh grid is
0.8 m, so per-vertex noise bakes into flat blocks (the old "fine grain" was
the bug, not the cure). `makeConcreteTexture` bakes at 512 px / 4 m tiling
(128 texels/m, aniso 16): exposed-aggregate speckle, soft mottling, faint
polish/scuff arcs, hairline cracks and thin expansion joints; the same canvas
drives the bump map so the grit catches the raking sun. Vertex colors keep
only the broad strokes — depth cool-down, sun-warm decks, curvature AO
(`shadeAt`) and grind wear near rails — and stay deterministic. Visual only:
no sim, hash or pin changes.

**Phone-width HUD (#3233 tail).** The goal/trick banner (the widest string the
sim prints, `OFF THE MAP! SECRET SPOT +2500`) used to sit centred at `top-12`
and run straight through the top-left S-K-A-T-E checklist — and overflow both
edges on a 320px screen. On phones it now drops below the checklist (`top-40`),
insets from both edges and wraps (`inset-x-2 text-center whitespace-normal`);
the ROOF GRIND callout lowers to `top-[46%]` at `text-2xl`, and the combo/mult
lines lift past the tall score number. The `sm:` (≥640px) look is byte-unchanged.
`gcdrive` pins it: 8 legs assert zero banner×checklist overlap, zero horizontal
overflow and a score/clear-combo gap at 390px and 320px. Layout only — no sim,
hash or pin change.

## Honest gaps

- **Replay is auto-only.** Last-10 s window, one cam, a 1×/2×/0.5× speed
  toggle (F) but no free cam or saved/shared runs; no replay of the
  letters-only near-misses shorter than 2 s, and none behind the attract title.
- **CLOSED by #3246** — ~~One park, one line.~~ The park has a second line
  now: the roof deck over the south wall, 14 gems, and a secret bowl; see
  "The second line, gems and the secret spot" above.
- **CLOSED by #3289** — ~~no grabs on grinds, no lip tricks, no stalls.~~ The
  rail/lip vocabulary shipped: FEEBLE/CROOKED rail grabs and coping stalls; see
  "The lip vocabulary" above. **Closed by #3233:** a manual now announces itself
  — a HUD chip shows the live type (`MANUAL` → `MANUAL 180` when the steer
  commits) and the value it is accumulating; `stateOf` carries `manualName`/
  `manualPts` (the exact commit formula, so the chip can't over-promise) and
  the 180 upgrade has its own audio sweep.
- **The bot's line is fixed.** `planner.js` is scripted waypoints, not a search;
  it proves the park is winnable, not that the trick system is deep.
- `snapshot`/`restore` are intentionally absent from the contract — the sim
  state holds functions (`park.height/normals`), so JSON can't copy it (#391);
  drivers use `reset(seed)` + long `tick()` batches instead, like IronKeep.
