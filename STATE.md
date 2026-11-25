# STATE — forge board snapshot (slot b, 2026-11-24 — SKYWARD'S STORM MOVES)

## This session — one ship, landed
- Ladder at claim: no halt, no building corpse, no steer; `next` = waiting-jon
  #1712 (skip); `game-queue` empty; every open feedback held by QA
  (`building-qa`) or waiting-jon, QA MASTER live → no borrow. Live
  `idle-kick` = `KICK SKYWARD 0 weak` (score 4). Warden's prompt snapshot said
  PINBALL — QA claimed #3237 mid-handoff, `heldDirs` law moved the pick.
  NEVER-DRY #3267 filed (why-weakest line in body), claimed, shipped.
- **#3267 DONE: SKYWARD living storm cell** (`bc9fd42`, PR #3271).
  - `stormPos(t)` in world.js — the ONE answer (thermalPos law lifted to the
    storm): seeded ellipse E/W ±64 m ~140 s × N/S ±34 m ~190 s + breeze.
    `stormAt()` (gusts/core downdraft/rising ring, all three craft), cloud
    deck + rain (one THREE.Group offset per frame) and the bolt anchor all
    follow it. Gates stay FIXED — school forgives, weather moves.
  - Amplitude bounded by invariant, not taste: centre always offshore, never
    within 200 m of a drop target / 300 m of pad·school·launch·rings, pass
    start never deeper than s 0.35 — pinned by an hour-long clock sweep.
  - skywardcheck **52/52** (+6 sweep pins; +3 mutants, ALL 13/13 CAUGHT:
    frozen drift / clouds-lie / inland wander). Core-sink pin re-anchored on
    stormPos, window widened 1 s → 3 s (old read was inside the gust bob).
  - skywardplay PASSED live :5178 (+3 legs: 38 m drift in 18 s sim, bounded,
    start line shallow). contractcheck 857/857. eslint + 3 gates + build green.
  - Prod verified: `Skyward-DcPtK4mK.js` carries `stormPos`; entry
    `index-DkET9RoW.js`. Play: `/retrogames/skyward`. #3267 closed shipped
    (PR `Closes` auto-closed it — label flip done by hand).
- **QA tail filed: #3272** — storm audio channel (rumble follows stormS),
  keyboard-line fairness now drift-phase dependent, sky-dim vector still
  points at the old home anchor, free-flight storm cue.

## Harness lessons (worth one line each)
- **A 1 s noise read is not a physics pin**: net downdraft ~1.3 m/s under ±1 m
  gust bob — the pre-drift anchor passed by luck of noise phase. Widen windows
  until the measured effect dominates the jitter.
- Never-dry picks go stale within minutes: re-run `idle-kick` live at claim
  time, and read labels mid-session too (#3237 flipped to `building` between
  two of my own calls).

## PLAYABLE on main right now
- `/retrogames/skyward` **living storm** (#3271) + rings/spot/drop/thunderpass,
  `/retrogames/pinball` art kits (#3262) + kickback + ball-to-ball (QA inside),
  `/retrogames/grind-city` gem sparkle (#3270), `/retrogames/tidal-rush` online
  rooms + spectate (#3265) + podium/rematch, mario-kart (tilt), ice-climber,
  marble-rush (tilt, trick hop), comet-drift pair (tilt), ssx (tilt),
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 still waiting-jon (not a work item).
- QA holds: #3237 PINBALL (claimed mid-my-session), #3233 GRIND CITY,
  #3244 TIDAL RUSH. New feedback: #3272 SKYWARD tail. #2971 contra waiting-jon.
- Next builder claim: run `idle-kick` live — don't trust this file; SKYWARD
  still scores (honest gaps remain: steered weather sim, engine loop, strip).
- Nightly: main-ok green at session start and at merge; today's merges incl.
  #3265 #3270 #3271.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh. Worktree
  `~/Dev/retrogames-forge-skyward-storm` detached clean at origin/main
  (`bc9fd42`) by mergeclean; remove it when next convenient.
- Game merged this session ⇒ STATE.md ships via its own docs/state PR;
  also parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 45 min of 3 h.
