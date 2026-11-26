# STATE — forge board snapshot (slot a, 2026-11-26 — SPACE INVADERS flow SHIPPED: #3540 closed)

## This session — TARGET refused, never-dry walked, shipped
- TARGET #3532 (PONG cabinet serve) REFUSED at claim — slot b held it fresh
  (11 min). Normal ladder: steer 0 · `next` #1712 waiting-jon (skipped) ·
  game-queue empty · QA-borrow BLOCKED (QA MASTER live, pid 5618) · flagship
  rung measured spent (flagshipStage null — all six flagship gaps owned) →
  never-dry final rung: `idle-kick` = `KICK SPACE INVADERS 0 weak`.
- Rule-8 verification before taking it: weakestStage score 4 (four unowned
  README gaps, zero open QA naming it; PONG excluded as b-held). Oldest gap
  was real: the WATCH pilot's ~3.3 s inter-kill pauses, reproduced in traces.
  Filed + claimed **#3540**.
- **SHIPPED (#3540 → PR #3542 → `a1a34b2`): the pilot aims while travelling.**
  Two static rules froze it (seed-1924 197 t stall, seed-2001 500 t ping-pong):
  **time-aware lane crossing** — pathOpen now compares the bullet's hull-deep
  kill clock `(232+8−y)/2.5` against our band exit `(|lx−pc|+8)/3+2`; cross
  behind the shot and it lands after we pass — and **HOLD, don't flee** — an
  unreachable aim used to sprint to the wall OPPOSITE the shots (that fallback
  LANDED seed 2001 with two invaders dying nowhere); a free column now holds,
  since every bullet clears the band within ~30 t.
  Honest detour: first clock cut timed to the hull TOP and broke seed 2001
  clean; the kill window is hull-DEEP — fix + note in the batch README.
- Honest measure: worst inter-kill stall **197 → 128** t, slowest clear
  **1506 → 1443**, 20/20 WITNESS clean, 0 deaths, bricks 5902/6560.
  Pins tightened 1600/220 → **1500/150**, deeper than every measured
  deletion (crossing 189 + seed 1770 lands, HOLD 1651 + seed 1308 lands,
  re-aim 193, fold 686).
- Proof: invaderscheck **76/0** (+2 static lines) · `--mutant` **15/15 die**
  (2 new: crossing, HOLD — deletions measured first, numbers quoted honestly) ·
  watchcheck (invaders, real Chrome) **322/322** · invadersdrive 8/8 zero page
  errors · feedbackcheck 291/291 · eslint + lint:mario/fps/ai + build green ·
  prod deployment sha verified at `a1a34b2` (status success, /invaders 200).
- Filed **#3547** (`QA — SPACE INVADERS: polish pass (#3542 follow-on)`):
  the "No 100-point bonus life" README gap contradicts `BONUS_LIFE_POINTS=100`
  actually shipped — needs re-adjudication (a wrong gap line mis-steers the
  never-dry picker), endgame soak of the new crossing >20 seeds, tilt/coin
  disclaimer check. + DO-NOT-FIX notes (march step granularity = decided
  DISCLAIMER; one UFO type = faithful).

## BOARD facts at close
- game-queue = 0 · building = 0 (b closed #3532; its PONG serve PR #3541
  merged before my merge, and slot b's STATE close-out #3546 too) ·
  building-qa = #3533 · feedback open: #3547 (mine), #3545 (lane:qa), #3536,
  #3244 / #2971 (waiting-jon).
- Rule-4 satisfied: game code merged this session (#3542).

## PLAYABLE on main right now
- SPACE INVADERS with the flowing seat pilot — watch it walk its shots
  instead of freezing between kills: https://jalfern.com/retrogames/invaders
- PONG cabinet serve (strike deflection, no scatter), DEFENDER wall veto.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27; PINBALL gate).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (measured mechanic fix, no taste calls).

## Slot state at handoff
- Slot-a dev server (:5173) stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-invaders-flow is DONE with (PR merged;
  mergeclean detached it at origin/main, branch deleted remote+local — safe
  to `git worktree remove` next session).
- Main checkout detached at origin/main; STATE.md ships via this docs PR
  (never push main) and parks with `statepark.mjs park a`.

## Next claims (for whoever is free)
1. Ladder still thin: steer 0, next = #1712 (waiting-jon), queue empty →
   never-dry again. DEFENDER two-player (#3533's stage, idle-kick's older
   answer) remains the big unowned flagship-adjacent pick; #3547's
   bonus-life gap re-adjudication will sharpen the picker either way.
2. QA borrow when QA MASTER is free: #3536 (PONG polish) is the oldest
   unheld feedback — b left a scope-update comment on it (strike-angle sound
   feedback + paddle-hold legibility on phones); #3524's era is over
   (ADVENTURE #3524 shipped).
