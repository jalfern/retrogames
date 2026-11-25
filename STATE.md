# STATE — forge board snapshot (slot b, 2026-11-25 — SKYWARD GETS AN ENGINE)

## This session — one ship, landed
- Warden TARGET **#3289 GRIND CITY lip vocabulary** REFUSED at claim (slot a
  held it live — claimed 09:26Z, checkpointed 27 min prior; newest-wins
  liveness). Slot a shipped it mid-my-session (#3293/#3298) — the refusal
  worked exactly as designed. Normal ladder: no steer, `next` #1712
  waiting-jon, `game-queue` empty, QA MASTER live (studio+mini) → no feedback
  borrow → flagship stage spent → **NEVER-DRY `KICK SKYWARD 0 weak`**.
- Gap 0 (moved-by-#3267 bullet) remnant = online (big-build, not one stage) /
  second landing strip / per-action engine audio. Took the honest single-stage
  slice: filed + claimed my own POLISH **#3295**, shipped it.
- **ENGINE BED #3295 DONE** (`a9f524f`, PR #3299): the motor is now a
  sustained channel, sibling of the #3272 rain bed. Pure laws in `sim.js`:
  `engineBed(craft,speed,vy,thrusting,stormS)` — plane hums with airspeed +
  climb load (louder AND brighter; deep stall drops to a near-cutout floor and
  re-spools — the engine teaches the stall), belt answers its fan (thrusting
  bites 36 Hz up), **glider motorless = silence** (the rule the bed teaches).
  Deep rain ducks the engine ×(1−0.5·depth); cues ride pre-duck `raw` so the
  core can't fake an engine death. `engineCue` keeps #3272 hysteresis (spool
  ≥0.012 armed <0.006; cut only into true zero). Cabinet rides existing
  `startLoopVoice` saw + deterministic 13 Hz blade flutter — **AudioController
  grew not one line**. Hash/stateOf byte-identical (pinned) — replay-honest.
- Proof: skywardcheck **87/87** (+14 pins) + mutants **26/26** (4 new);
  skywardplay PASSED ×2 on :5178 with +3 live engine legs (real recycle
  events); contractcheck 857/857; eslint + 3 scoped gates + build green.
  Prod verified: `Skyward-C42FwlOD.js` contains `spool`. #3295 shipped+closed.
- **QA tail filed: #3300** — two-osc detune + pitch wobble (engine reads as a
  motor, not a buzzer), HUD load-tell, glider wind-rush bed, crash/cut
  sequencing, phone HUD widths, glider-silence discoverability.

## Harness lessons (worth one line each)
- **Fixed-instant senses on a mechanic that MOVES are seed luck**: the
  storm-cell leg sampled stormS at one moment and failed with the drifted cell
  (0.25) — poll a window and pass on any sample. When a stage ships motion,
  grep the play suite for fixed instants of that motion (same family as
  #3291's card-coord ripple).
- `skywardplay` hardcoded :5173 — now `DEV_PORT`-aware (slot b never saw it
  until its own suite needed the port). Any play script still hardcoding 5173
  is the same latent trap.
- A catch-block that pushes to `fails` without echoing hid the real error for
  two probes; skywardplay now prints `FAIL exception: …`.
- Hand-verify cue-sequence pins before trusting counts: with prev(0)=0, a
  rising first element IS the boarding spool — one pin asserted `spool` where
  the law correctly returned `cut`.

## PLAYABLE on main right now
- `/retrogames/skyward` ENGINE BED (#3299) + living storm + sky-follow;
  `/retrogames/grind-city` rail grabs + coping stalls (#3293) + curvature
  shading + roof callouts; `/retrogames/pinball` TABLE SMITH (#3291) +
  tilt-to-nudge (#3296), tidal-rush grabs (#3285) + rooms, mario-kart (tilt),
  ice-climber, marble-rush (tilt, trick hop), comet-drift pair (tilt), ssx
  (tilt), marble-madness, pacman, mario, minesweeper/garden-guard/homebody,
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, galaga, missile, pucks, mines, zork, ultima,
  king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 waiting-jon (not a work item).
- **Next builder claim: run `idle-kick` LIVE** — expect `KICK SKYWARD 0 weak`
  again (gap 0 keeps the online/strip remnant). The honest slice is the
  **second landing strip**; online is big-build multi-stage (shape: the tidal
  rooms ladder #3227→#3265) — never attempt it inside one stage. Do not redo
  #3300 items (QA wording-owned once claimed).
- QA holds: #3237 PINBALL tail (item 4 shipped via #3296), #3290 smith tail,
  #3281 tidal tricks tail, #3244 tidal rooms, #3233 grind-city tail, #3300
  skyward tail (all feedback/lane:qa). #2971 contra waiting-jon.
- Nightly: main-ok green at session start, at claim, and at merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 to be stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-skyward-engine` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 55 min of 3 h.
