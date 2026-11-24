# STATE — forge board snapshot (slot b, 2026-11-24 — PADTYPES shipped)

## This session — one ship
- **#3108 PADTYPES — five switchable controller overlays** shipped: PR #3117,
  main `dfcf88c`, issue closed `shipped`.
  `src/components/padTypes.js` = pure decision layer (default DERIVES from the
  game's existing method/layout — untouched games byte-identical; `supports`,
  pause-menu switch, `retrogames:padtype:<path>` persistence, `?padtype=` QA
  override, screen-rotated tilt math). All five types feed the SAME one pad.
  FULL pad = Sony cluster (d-pad+stick left inboard, △□○✕ diamond by `pad:`
  indexes, R shoulders, centre clear, 0.8 pitch). TILT = ENABLE tap (iOS
  permission) + RE-CENTER + rotation re-capture.
  Pilots per issue: SSX `full` (+stick), MARBLE MADNESS stick+tilt,
  PAC-MAN dpad+stick. SSX found two live collisions, both fixed (game-side
  #894 z-60 stick + trick chips now yield to the full pad).
  Harness: `padtypecheck` in CORE.checks (CI; 56 pins; mutant-proven — muting
  the configure re-fire turns it red) + `padtypeplay` lane-run (browser, 20
  checks, zero page errors on 5 games). Fix found by it: saved choice never
  applied on fresh load (configure re-fires now).
- Rule 4: COUNTER RESET — game code merged (SSX/index.jsx + registry).
- Rollout filed: **#3118** (QA feedback: supports per game, PadLink drawing
  reuse, tilt on #3107, z-60 overlay audit before granting `full`).

## PLAYABLE on main right now (tip after #3117 + STATE PR)
- `/retrogames/ssx` — FULL pad default; pause → CONTROLLER → STICK/FULL,
  remembered per game. `/retrogames/marble-madness` — STICK/TILT.
  `/retrogames/pacman` — DPAD/STICK. Every other game: byte-identical pad.
- `/retrogames/mario`, forge board, TIDY BOT papercraft (#3085), STARRY NIGHT
  demo (#3082), CONTRA→TOP SOLDIERS (#3067), DOUBLE DRAGON, R-TYPE, RACCOON
  HEIST, spy-hunter, iron keep, galaga, missile, pucks, mines, zork, ultima,
  king's quest, Joust, Q*bert.

## Board watch (facts, not questions)
- Slot a: INSIDE #3094 (STOMPTOWN, `building`) — alive, last checkpoint
  08:17Z (`8c9c26f`), stompdrive 15/15.
- QA lanes: #3096/#3102 building-qa as of this morning; #3118 filed `feedback`
  (rollout — includes game-side z-60 overlay audit before more `full` grants).
- #3108 closed; `game-queue` now holds #3103–#3107 (NEW GAME ladders — pinball
  oldest). No `steer`/`next`. No `halt`. No `lane:manual` open.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Oldest `game-queue`: **#3103 pinball** (shared table engine + cabinet ladder).
  A real game build; rule-4 buffer healthy.
- Slot b note: padtypeplay needs `npm run dev -- --port <DEV_PORT>` first;
  screenshots land in `qa-art/` (gitignored).

## Slot / board state at handoff
- Slot b: #3108 shipped+closed; #3118 filed; no claims held; no open PR of
  mine after the STATE pair; lane worktree `~/Dev/retrogames-forge-pad-v2`
  detached at origin/main; dev server on :5178 stopped via devstop.
- Main tip at handoff: `dfcf88c` + STATE.md docs PR.
