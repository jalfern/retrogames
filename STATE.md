# STATE — forge board snapshot (slot b, 2026-11-27 — MC fairness read SHIPPED `c5b0a6a`)

## This session (slot b) — TARGET #3698 taken and shipped
- Warden TARGET #3698 (MC smart-bomb fairness read) claimed at first try
  (`forge-claim.sh 3698 b` → CLAIMED). Ladder untouched; game-queue empty.
- Shipped PR #3739 → `c5b0a6a`: (1) azure 2-px trail on the center battery
  while smartWave — the 28-vs-15 fairness clue on the board; (2) `gs.resist`
  cyan shimmer marks every outer-immunity pass (kills and self-ground-bursts
  never shimmer); (3) scripted attract ad: real smart bomb, 540-tick grid
  offset 270, never dice, never on the ferry's grid + `SMART BOMBS EVADE
  BLASTS` line. Item 4 answered on the issue with measured wave-7 economy.
- Gates: missilecmdcheck 149/0 (new section: shimmer marks/never-strobes/
  never-on-kill/decays + dice-spy 0 rolls + ad determinism); both new mutants
  proven red manually; mcsmartdrive 14 checks — attract-ad, azure-cadence
  scan, outer-plain negative control, shimmer render-proof via DEV stamp hook.
- Prod verified: bundle `index-B2TRuLYJ.js`→`index-B1pUovhp.js` carries the
  ad line; issue commented + closed, labels shipped.

## Harness facts paid this session (kept so lanes stop re-paying)
- **A 28 px/t ABM (5-6 tick life) or a 10-tick shimmer ring can sit INSIDE one
  catch-up batch at the ~4 fps floor and never reach the canvas.** Pixel gates
  for short-lived paint must re-fire/re-stamp on a cadence (in-page rAF loops,
  not 30 ms IPC polls) and threshold at the noise floor (0). Observed spread
  on identical seeds: 0 → 512 azure px across loaded/quiet runs.
- Synthetic `KeyboardEvent` Digit keys drive the batteries from page context —
  and ARE takeover keys: one Digit2 seats-release the watch. Re-seat or
  restructure around it.
- **Never edit any tracked file while `.mutant-running` exists** — the guard
  aborts the walk (it did: README mid-walk → walk exited at mutant 8/30, tree
  self-restored, nothing staged, per #2049 design). Re-run or hand-prove
  instead. A foreground timeout kills the pipe but NOT the walk child.
- Serial-run lesson (slot a #3716) confirmed again: MC live checks flap together
  under concurrent Chrome; blind-kill/watch-hold flake with load, not code.

## BOARD facts at close
- main GREEN at `c5b0a6a` (static). building: none seen. building-qa: #3707?,
  #3689 shipped this morning by QA (8ad170a was that merge). game-queue empty.
  `next`: #1712 (PLAICRAFT S2, waiting-jon). halt: 0.
- Rule 4 satisfied: game code merged (#3739).
- Open jonq (not mine): #3335 (QA, due today 14:14Z), #3516 (Arkanoid, Nov 28).
  Asked nothing new this slot.

## PLAYABLE on main right now
- MISSILE COMMAND — wave-7 threat now teaches itself: FAST label + azure fast
  trail + cyan immunity shimmer + attract smart-bomb sighting:
  https://jalfern.com/retrogames/missilecommand
- ASTEROIDS kiting dance (#3717), MC knot doctrine (#3716), FROGGER duel-seat
  (#3721), SONAR hash grain (#3718), ROGUE cart laws (#3710/#3715).

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. game-queue empty; fresh QA feedback exists (#3730 ASTEROIDS polish, #3725/
   #3724 PITFALL art, #3615 DK rivets) — QA lane's priority; builders the
   reverse per ladder when free.
2. #3670 (`~~` phantom filter) remains the cleanest small harness job.
3. mcsmartdrive thresholds now sit at the noise floor; if CI advisory flakes on
   the trail/shimmer px gates again, note load per slot-a's serial lesson.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-smart-fair PRUNED (#3739 merged, clean);
  STATE carried to main by docs branch; also parked via `statepark.mjs park b`.
