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
| `search.js` | **the thinking bot (#3394)** — attract style v3. Route knowledge stays scripted (its `drive()` mirrors the planner's steering/pump/balance), but at every trick decision it rolls candidate press-schedules through the *real* `sim.step` and commits the best: PROVEN AIR means a gap pop only commits when the rollout actually clears the trench and a rail pop only when it latches. Rollouts run on a full clone (`cloneSim`) so the live board is never touched; planning is pure, so attract stays deterministic. |
| `music.js` | **the bed (#3167)** — the original A-minor groove + the landing-pitch law, as pure data. The cabinet schedules it from its sim ticks, so pause stops it and the replay runs silent. |
| `art.js` | three.js scene — park mesh from `park.js`, sky + sun glare, rails, floating gold letters, the skater rig (`buildSkater`/`poseSkater`), particle sparks. |
| `index.jsx` | cabinet — loop, input, HUD, sounds, cameras (chase · fisheye action · replay), run-replay recorder (`packIn` log) and the `exposeGame` contract + `__grindTest` drive hooks. |

Run: `npm run grindcheck` (Node, no browser — includes the input-log replay
determinism proof, the #3246 gem/secret/roof physics legs, the #3233 manual
identity legs, the #3381 saved/shared-run laws (codec round-trip through the
sim, total-junk decode, `beatsLine`, `validBank`), the #3394 thinking-bot
laws (clone purity, search determinism, proven air, searched-line wins five
seeds) and 22 mutants: letters, gap, replay, bed, gems, shade, grab, stall,
tell, variety, nearmiss, bestline, bankline, codec, beats, store, sharewire,
sfxduck, clone, need, sched, searchwire). Deep-drive the cabinet with
`DEV_PORT=5178 node scripts/lib/gcdrive.mjs` (also proves the REPLAY screen,
the skip and the action-cam cut-in, the #3374 near-miss replay + badge, the
attract best-line loop, and #3381: the store landing, a reload that still
re-rides the record marked ALL-TIME, a tie leaving history alone, the strict
beat earning the badge, `S` flashing the copy verdict, `?line=` riding a guest
line, a junk code booting clean, and #3394: attract riding the thinking bot
(`?style=3`, planning + committing live, scoring, never tumbling).

## Controls

| key / pad | action |
|---|---|
| ← → | steer |
| ↓ | crouch / pump (speed down slopes) |
| A (`Space`) | ollie · **hold in the air** = grab (MONGOL, MEND, STALEFISH…) · **press on landing** = manual · **↓+A at a coping lip** = STALL (#3289) |
| B (`Shift`) | kickflip on the ground · flat spin in the air · **hold on a rail** = rail grab (FEEBLE/CROOKED, #3289) |
| `?` | how-to-play overlay |

Touch pad (phones): **A = OLLIE** (Space), **B = PUMP** (Shift) — verb labels from the registry `pad:` block (`src/config/games.js`), not letters.

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

Tail #3374 — the near-miss and the memory. `replayWorthy(ticks, lettersGot)`
(sim.js's pure law, which also owns REPLAY_MIN/MAX now): a run earns its
replay if it skated ≥ REPLAY_MIN ticks **or** banked ≥1 letter — a letters-in,
dead-at-1 s near-miss still watches its line, badged `NEAR MISS — LETTERS
COUNT`. And the plaza remembers its own: when a full-window line becomes the
session best (`betterLine`: score → letters → newer), its seed + pad log are
banked and attract re-rides it behind the title — re-simmed from the banked
seed, wrapping at the log's own end (how the run ended is not in the pads,
so the wrap keys off log length, not the sim). No history yet? The bot line
keeps attract as it always was. Contract gains `best`, `bestLog`,
`attractLine`, `replay.near`. Memory is per page-load, not per machine:
saving and sharing runs is still an open gap.

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

- **CLOSED by #3386** — ~~Saved/shared runs: nothing persists.~~ The record now
  outlives the page. When a bankable beat (`inputLog.length >= REPLAY_MIN`, the
  same gate as the attract bank) also **strictly** beats the stored line
  (`beatsLine`: more score, or equal score with more letters — recency alone
  never fakes a record) it is written to `localStorage['grindcity.best.v1']`
  as `{v:1, seed, score, letters, won, log}` and the over card says
  `NEW ALL-TIME LINE`. On the next load that seed and pad log drive attract
  before any key arrives and the chip reads `ALL-TIME BEST LINE`. Every read is
  validated (`validBank`) and wrapped, so private mode, quota or hand-edited
  junk falls back to a cold plaza rather than parading a fake record; a
  strict-beat write that the browser refuses leaves the session memory intact.
  Sharing rides the same bank: `S` (or the chip on the replay / over screens)
  copies `?line=<code>`, one URL-safe char per 6-bit pad word with a canonical
  base36 `seed.score.ticks.body` header (`SHARE_MAX_TICKS` 7500 keeps it inside
  a sane URL). A `?line=` load re-rides that exact line behind `SHARED LINE ·
  {pts} PTS` until the first key or tap hands the plaza back; garbage codes
  decode to null and boot quietly. Sharing is replay-only — no upload, no
  leaderboard, no network: the link *is* the line.
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
- **CLOSED by #3394** — ~~The bot's line is fixed.~~ The attract gained a
  fourth style that *searches*: `search.js` rolls candidate press-schedules
  through the real sim at the kicker, the far coping, the rail and every
  landing, and commits only what the rollout proves (PROVEN AIR). The searched
  line wins every tested seed with zero bails and banks deeper than the
  witness — a Flip off the lip and a searched Manual180 the script never
  throws, score 20702 vs 18910. The witness line (planner v0) is untouched:
  `grindcheck` still grades exactly that bot, and style v3 is the fourth
  attract loop (`?style=n` shifts the rotation origin for drivers).
- `snapshot`/`restore` are intentionally absent from the contract — the sim
  state holds functions (`park.height/normals`), so JSON can't copy it (#391);
  drivers use `reset(seed)` + long `tick()` batches instead, like IronKeep.
