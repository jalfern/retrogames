# STATE — session 194 (2026-11-10, slot a)

## What shipped
**WATCH batch 16 — MINESWEEPER seats the fairness referee** — squash `cf3a0cf`
(PR #1882, Part of #1637; claim: warden TARGET #1637 to slot a — b's claim was
expired 147 min, claim accepted fresh). The seat feeds `nextDigs(g)` — the gate's
OWN autopilot, subset-core + no-chord, exactly the rule set the fairness gate
certifies with and the attract demo replays — into the REAL dig path (`actDig`,
auto-chord intact) every sim tick: cursor first, 6 ticks/dig, no forked brain.
First action digs the center — the original's guaranteed-safe click, the spot
`plantAt` lays and certifies the board around — so the route is honest from tick
one. Any driving key/canvas tap hands back (shared blips; the player's dig lands
too, Sonar-ping style); the win releases silently (racer rule). Single-screen
boot: the attract ▶ WATCH (band @24%) seats directly — no bank needed. The seat
never flags: flags are the player's claims and the win never needed them.
Evidence: watchcheck minesweeper pilot 207/207 (seat/blip, steer-takeover/blip,
re-seat, no-death sweep-to-win honesty meter FIELD SWEPT 71/71, silent release
via stop-count, one-tap); full watchcheck 623/623; watchphonecheck 395/395
(tripwire 54->55), watchpillcheck 184/184, attractcheck 694/694,
contractcheck 682/682, sweepcheck 89/89 (the seat's witness), sleepwatchcheck
314. Mutant: seat feed cut -> exactly 6 red, restored. Registry seats 54->55,
pilots 56. Live: https://jalfern.com/retrogames/minesweeper (entry
`index-DdoMGjlN.js` carries the copy — NOTE: prod html 308s to www.jalfern.com;
poll with `curl -sL`). Filed #1883 (polish: face, ?-marker, win flag-cascade,
chord stagger) + a watchcheck --phone route-table feedback (magic-carpet
`?seed=7` url defeats the phone section's exact-path hook lookup).

## Session bookkeeping
- The 55-title `watchcheck --phone` soak is NOT a CI gate (static runs
  watchcheck desktop + watchphonecheck). On a loaded box it times out past
  15 min and tail-boots starve (`DEV hook never appeared` cascades) — do not
  chase those flakes; watchphonecheck is the phone law's real enforcement.
- `git checkout --detach origin/main` in the merge worktree right after
  `gh pr merge --delete-branch` (gh auto-switched to main again this batch).

## Next queued (slot a)
1. Resume #1637 batch 17 when claimable (~90 min after the last `FORGE (a)`
   comment — the ship comment above). Grep fresh at batch start:
   `grep -ln "planStep\|solvePad\|solve(\|planner\|nextSafe" src/games/*/*.js`
   minus titles already seated (registry WATCH_HELP = source of truth), then
   check each candidate's harness for a win-proof BEFORE designing (no proven
   route = no seat). Unseated solver-ish leads to triage: FireCrew, IronKeep
   (levels hint), GravelYard, Homebody, ShortOrderShout, Britannia (swell/
   route?) — verify honestly, several matched only on comments.
2. Ladder fresh at claim time (halt -> steer/next -> game-queue -> feedback
   borrow only if QA MASTER dead -> flagship -> weakest via idle-kick).
   Warden TARGETs go first but REFUSE politely when the holder is live.
3. #1711 stays hardware-gated for Jon only (#1730 precedent; session-188 audit).

## Notes for the next slot-a session
- Dev server 5173 STOPPED at session end. Worktree `~/Dev/retrogames-forge-watch-b16`
  = detached at origin/main after merge, node_modules symlinked (to watch-b14) —
  reuse with `git checkout -B forge/watch-rollout-b17 origin/main`.
- watchcheck batch blocks are append-only: pilot before PILOTS' closing `]`,
  source pins after the previous batch's block. Phonecheck tripwire = registry
  WATCH_HELP count (now >= 55) — bump with every seat batch.
- Minesweeper pilot law: COLT floods ~57 cells on the first dig and the whole
  run wins in ~2 s — the steer must land right after seatPoll, and any mid-run
  read must tolerate the board already being over (`watching() || screen!=='play'`).
- watchSfx stop-count is the silent-release proof: count 'stop' events, require
  exactly the number of deliberate steers.

## Open questions
- None. (Batch roll is mechanical; nothing taste/priority came up. No jonq filed.)
