# STATE — forge board snapshot (slot b, 2026-11-24 — TIDAL RUSH rung 2 SHIPPED)

## This session — one ship
- **#3104 rung 2 — STORM BAY** SHIPPED: PR #3141 merged ~12:38Z → main
  `ac763e6`; prod bundle `index-DaIRAhnL.js` carries STORM BAY:
  `https://jalfern.com/retrogames/tidal-rush` (private until Jon promotes).
  Per-lap seeded swell re-rolls (+12 % main swell/lap, wandering dirs,
  overhang-guarded), whole-bay lightning + thunder, wind-slanted rain, menu
  bay picker (◀ ▶ / tap, live preview), BARREL ROLL trick (+200).
- **Harness upgrades while shipping**: sea→shader moved to per-slot uniforms
  written from `gs.seaCur` every frame (SwiftShader-safe unrolled) — parity
  now provable for EVERY swell, pinned 51-pt tidalcheck. Skip loophole closed
  (judging = gate line OR course progress, in order). Buoys ride full
  Gerstner flow. Tap-to-start fixed on phones (root pointer).
- Gates: tidalcheck 51/51 + TWO mutants caught (`--mutate=judge`,
  `--mutate=swell`); contractcheck 15/15 (snapshot/restore through storms);
  browser drive 15/15 zero page errors; lint:mario/fps/ai + build green.
- #3104 stays OPEN for rung 3 (honest gaps: rain physics, wave-front swell
  transition, more tricks, continuous engine voice, SSX-lobby rooms) — back
  on `game-queue`. Polish notes for QA folded into existing **#3135**.
- Rule 4: COUNTER RESET — game code merged.

## PLAYABLE on main right now
- **`/retrogames/tidal-rush`** — pick SUNNY or STORM BAY at the menu; stick
  or dpad pad, B = BOOST, ? pause.
- `/retrogames/stomptown` (#3112), pinball (#3116), ssx (FULL pad default),
  marble-madness (STICK/TILT), pacman (DPAD/STICK), mario, forge board,
  TIDY BOT papercraft (#3085), STARRY NIGHT demo (#3082), TOP SOLDIERS
  (#3067), DOUBLE DRAGON, R-TYPE, RACCOON HEIST, spy-hunter, iron keep,
  galaga, missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert.
- Slot a landed SKYWARD flight school rung 1 today (PR #3134, #3105).

## Board watch (facts, not questions)
- CI auto-trigger fired normally for #3141 (yesterday's ~20-min gap did not
  recur this session).
- This Mac is in a heavy SwiftShader era: EVERY lite-mode browser measurement
  lands 9–16 fps right now (control: stomptown 10.5). Drive gates should be
  relative, not absolute, while this lasts — worth a harness lane if nightly
  thresholds start biting (verify/heistplay are advisory; `static` unaffected).
- The rung-1 far-outside skip loophole and height-only buoy bob are now FIXED
  (were README honest gaps); older shift notes describing them are stale.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Oldest `game-queue`: **#3105 flight school** (rung 1 already shipped by
  slot a via #3134 — check what its last FORGE comment says before resuming),
  then #3104 rung 3 (storm polish ladder above), #3106 skate park, #3107
  marble roller fancier.

## Slot / board state at handoff
- Slot b: #3141 merged with full cleanup (remote branch gone, worktree
  `~/Dev/retrogames-forge-tidal-storm` detached at origin/main `ac763e6`;
  untracked `shots/` = the #3104 frame strip, already uploaded to the issue).
  Dev server :5178 stopped via devstop. main-ok green at exit.
- STATE.md for this shift ships via PR (main-push forbidden); this file is
  the parked report meanwhile (`statepark park b`).
