# STATE — forge board snapshot (slot b, 2026-11-24 — TIDAL RUSH rung 1 shipped)

## This session — one ship
- **#3104 rung 1 — TIDAL RUSH (SUNNY BAY jet-ski slalom)** SHIPPED: PR
  #3125 merged 11:14Z → main `7e93098`; prod bundle `index-BqBlKU8r`
  carries the route: `https://jalfern.com/retrogames/tidal-rush` (private
  until Jon promotes). Wave Race 64 spirit, own IP (KAI vs MAKO & TUNDRA):
  red-right/yellow-left slalom, sprint charged by clean passes, throttle
  choke on misses, 360 tricks off kickers, analog stick + lean, 3 laps.
  **Water = ONE table**: `src/games/TidalRush/water.js` Gerstner waves drive
  the CPU hull AND generate the vertex shader (`waterGLSL()`); tidalcheck
  parses both — drawn sea ≡ ridden sea, provably.
- Harness: `tidalcheck` 24 pins (`tidal` scope + ci.yml static step),
  red-side mutant caught (21/24 red); contractcheck 15/15 incl snapshot/
  restore; browser drive 10/10 zero page errors; lint:mario + build green.
  #3104 stays OPEN for rung 2 (storm bay, lap-varying swell) — back on
  `game-queue`. Polish pass filed: **#3135** (`feedback`).
- Rule 4: COUNTER RESET — game code merged.

## PLAYABLE on main right now
- **`/retrogames/tidal-rush`** — stick or dpad pad, B = BOOST, ? pause.
- `/retrogames/stomptown` (#3112), `/retrogames/pinball` (#3116), ssx
  (FULL pad default), marble-madness (STICK/TILT), pacman (DPAD/STICK),
  mario, forge board, TIDY BOT papercraft (#3085), STARRY NIGHT demo
  (#3082), TOP SOLDIERS (#3067), DOUBLE DRAGON, R-TYPE, RACCOON HEIST,
  spy-hunter, iron keep, galaga, missile, pucks, mines, zork, ultima,
  king's quest, Joust, Q*bert.

## Board watch (facts, not questions)
- Process finds this session (all worked around, worth a harness lane):
  1. The automatic `pull_request` CI trigger did NOT fire for #3125's branch
     for ~20 min; manual `gh workflow run ci.yml --ref forge/tidal-rush`
     twice. Later a real PR run did appear (static pass). Unexplained CI
     queue gap — if it recurs, it's an issue of its own.
  2. Branch cut before #3121 → required-check waits hung on unreported
     checks (the #3120 trap this very sha class falls into); rebase onto
     post-#3121 main resolved.
  3. Self-lesson: a prod-string grep said SHIP while the PR was OPEN
     (preview-shaped alias). Premature shipped-claims posted to #3104 +
     shift report were corrected on the issue. Verify = merged commit.
- Slot a earlier today: STOMPTOWN shipped (#3112), pad rollout slice (#3122),
  merge-fix #3121. No `steer`, no `next`, no `halt`, no open `lane:manual`.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Oldest `game-queue`: **#3105 flight school** (Pilotwings-style, own IP);
  #3104 rung 2 (storm bay) sits in the queue too — honest gaps in the game
  README (far-outside skip loophole, height-only buoy bob, single trick
  move, stepped engine tone). A committed `tidalplay` browser lane-run
  (QA's) + a screenshot strip for #3104 are cheap additions.

## Slot / board state at handoff
- Slot b: #3125 merged with full cleanup (remote branch gone, lane detached
  at origin/main `7e93098`); #3104 `game-queue` (multi-stage, open); polish
  #3135 filed; shift report pushed (corrected). Dev server :5178 stopped
  via devstop. Worktree `~/Dev/retrogames-forge-tidal-rush` clean.
- main-ok green at exit.
