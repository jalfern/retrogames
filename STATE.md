# STATE — forge board snapshot (slot a, 2026-11-24 — MARBLE RUSH shipped, #3107 stage 1)

## This session — one ship
- **#3107 stage 1 — MARBLE RUSH** SHIPPED: PR #3161 merged `dd55a07`;
  prod deploy of dd55a07 `success`, live bundle carries the game:
  `https://jalfern.com/retrogames/marble-rush` (private until Jon
  promotes). Original 3D marble roller (MODERN bar; MARBLE MADNESS
  untouched): chrome marble with real weight/momentum on an analytic
  manifold — one friction budget shared between holding curves and
  steering, banking tilts the budget, the shelf is the gate. Five seeded
  sky shelves (FIRST ROLL / SWITCHBACK / BUMPER ALLEY / SWING BRIDGE /
  SKY SHOT), medals + persistent bests, seeded swing-bridge phases keep
  seed→run honest. Stage = DATA: renderer extrudes from the SAME surface
  function the sim rides (drawn ≡ ridden, rollercheck-pinned like
  tidalcheck's sea).
- Harness: `rollercheck` 29 Node pins (+6 Chrome-drive pins behind
  `--browser`, lane-run) — pointOf parity drawn vs ridden, gap/mover/
  budget laws, tick-end floor resolution, autopilot golds all 5 shelves
  ×10 seeds zero falls, seed-differs + snapshot round-trip hashes;
  mutants edge+budget both die. CI scope `marbleRush` (Node-only).
  First CI round went red twice and both were registry-law, not physics:
  duplicate `marble:` key in checks.mjs silently deleted Marble Madness'
  scope (JS keeps the last key) → renamed `marbleRush`; vpadcheck needs
  `pad.buttons: []` declared even for no-B games. `ciscope --selftest`
  catches the first, `vpadcheck` 735/735 the second — run both before
  pushing a new game.
- Rule 4: COUNTER RESET — game code merged.

## PLAYABLE on main right now
- **`/retrogames/marble-rush`** — stick pad (arrows/dpad work, A/GO
  starts), ? pause; fall restarts the shelf, clock resets.
- **`/retrogames/short-order-shout`** (#3143, slot b, PR #3164).
- `/retrogames/skyward` (incl. THUNDERPASS), `/retrogames/tidal-rush`
  (#3104 rung 1), `/retrogames/stomptown` (#3112), `/retrogames/pinball`
  (#3116), ssx (FULL pad default), marble-madness (STICK/TILT), pacman,
  mario, forge board, TIDY BOT papercraft (#3085), STARRY NIGHT (#3082),
  TOP SOLDIERS (#3067), DOUBLE DRAGON, R-TYPE, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert.

## Board watch (facts, not questions)
- **Pinball seed pin still red**: `contractcheck pinball` fails
  (`state.seed is an integer (recordStart)`, seed=undefined, 827/828) —
  pre-existing from #3116, reproduced on clean main this shift; facts on
  #3103. Expect the next full nightly to fail it unless #3103's owner
  lands first (rule 5a whoever-sees-red-first).
- #3107 stays OPEN + `game-queue`: issue asked for ten shelves, five
  shipped. Feel polish (checkpoints, trick verbs, surface-tone audio,
  fall cam/tumble) filed as **#3165** (label `feedback`) for the QA lane.
- No `steer`, no `halt`, no open `lane:manual` this shift.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Oldest `game-queue` candidates: **#3107 stage 2** (shelves 6–10 + the
  stage-2 verbs listed on the issue) and #3104 rung 2 (tidal storm bay —
  an un-PR'd `forge/tidal-storm` branch was seen; step-1b check first).
  Flagship-polish ladder: SSX README honest gaps (never picked).

## Slot / board state at handoff
- Slot a: #3161 merged with full cleanup (remote branch gone, lane
  detached); STATE.md ships via its own PR; #3165 filed; #3107 back in
  game-queue; shift report pushed; dev :5173 stopped via devstop.
- Worktree `~/Dev/retrogames-forge-marble-rush` clean at handoff (the
  five `shots/mr-*.png` frame strips are intentionally untracked).
- main-ok green at exit.
