# STATE — forge board snapshot (slot b, 2026-11-27 — pacmandrive #3755 SHIPPED `76158df`)

## This session (slot b)
- Found main RED (#601): nightly 46034576636 failed `nightlybotcheck` + `dvhcheck`.
  #3772 merged the fix ahead of me (`da3457a`) — both gates verified green at that
  tip locally. The freeze-lift refresh on main was STARVED ~80 min behind a
  duplicate PR’s branch run in the `nightly` concurrency group: cancelled
  46048400905, closed duplicate #3774 (content ⊆ #3772), refresh resumed and is
  IN PROGRESS at da3457a (~green 21:00Z → freeze lifts honestly).
- TARGET #3766 REFUSED at claim (held by a — she shipped PINBALL `9d35638`).
  Normal ladder: halt none; steer none; `next` #1712 waiting-jon; game-queue
  empty; feedback all held (#3761 building-qa, #3244/#2971 waiting-jon); QA-borrow
  blocked (live QA MASTER mini+studio); flagshipStage null; weakestStage =
  PAC-MAN 0 weak, and its only gap is the harness job #3755 — claimed directly
  (the board’s free-lane job, never-dry-safe: it was never filed as a POLISH claim).
- **SHIPPED #3755** (PR #3781, squash `76158df`): `npm run pacmandrive` — real
  headless Chrome drives the human loop with real keys: attract → key-start →
  dots (+70) → tunnel circuit (col 6 up, wrap at row 14, col 21 down, row 20
  east, col 26 down) → energizer (23,26) frightens (live power + scared seen) →
  powered chase → death → respawn → game-over → key-restart, zero page errors;
  drawn wedge pixel-checked vs logical head at two checkpoints (off ≤0.03 cells).
  17/17; two named mutants die (frighten-off reddens §pellet; pac-yellow→green
  reddens BOTH wedge legs, yellows=0). `__pacTest.probe` gains `dir`+`attract`
  (DEV, additive). README honest gap struck with evidence; idle-kick no longer
  names PAC-MAN (now `KICK FROGGER 0 weak`). pacmancheck 154/154, lints + build green.
- Housekeeping: closed slot b’s stale STATE PR #3770 (its STATE was superseded by
  e6312f8, which already folded the park — merging would have reverted main’s STATE).

## Harness facts paid this session (kept so lanes stop re-paying)
- **Poll+steer latency ≈ one cell** at ghost speed: press turns EARLY and let the
  arcade pre-turn law land them (a held direction turns at the first legal cell).
  Pressing at the target reads late — pac coasts past the row-14 tunnel mouth.
- **`until()`-style poll helpers must return NULL on timeout.** A truthy final
  sample reads as a passed leg — three phantom greens before this bit.
- A +50 score delta is NOT the energizer unless position agrees (5 dots also
  spell +50); demand the witness cell. Likewise: OR-chained fallback bounds are
  not load-bearing — prove-fail mutants must break the GAME rule line (frighten).
- The `nightly` concurrency group serialises EVERYTHING: never leave a nightly
  dispatched on a lane branch while a freeze-lift refresh is queued on main —
  it starves the refresh and re-locks the factory (this cost ~80 min today).
- `main-ok` passes on a `cancelled` latest nightly (no-verdict ≠ red); prefer
  merging while the honest refresh is merely queued, and never let a refresh
  occupy the group twice (dispatch once after merge, not before).

## BOARD facts at close
- main tip `76158df` (push CI green). Nightly refresh @ da3457a IN PROGRESS —
  green ≈21:00Z lifts the #601 freeze for everyone (no new red cause known:
  both failing gates verified green locally at da3457a+mine).
- building: none. building-qa: #3778 (QA live), #3744 fireflies demo.
  game-queue: empty. halt: 0. #3755 shipped+closed; #3774 closed (duplicate).
- Rule 4 satisfied: game code merged this window (`76158df` touches src/games/**).

## PLAYABLE on main right now
- PINBALL — rescue sweep shows the kickback save: https://jalfern.com/retrogames/pinball
- DONKEY KONG popups (#3767) + walk-past 50 (#3759), ORRERY guidance (#3780),
  MC hot-seat P2 (#3765) + bonus city (#3753), Centipede kill-pop (#3736).
- Dev-only: `npm run dev` + `npm run pacmandrive` drives PAC-MAN end to end.

## Open questions (links only — #605)
- #3516 (Arkanoid art rung — AWAITING, default *done*, deadline 11-28). Nothing
  ANSWERED/DEFAULTED to execute; asked nothing new.

## Next claims (for whoever is free)
1. NEVER-DRY next true gameplay rung: **DK fireballs/electric-floor + timer-zero
   capture** (slot a’s audit; README honest gaps, no QA issue owns them —
   verify ownership with `weakestStage` at claim time; DK was building-qa-held
   by #3761, check it is clear first).
2. Frogger’s remaining bullet is the driver-horizon note (not buildable — leave).
3. QA: #3778 in flight; #3744 fireflies demo queued.

## Slot state at handoff
- :5178 stopped via `scripts/devstop.sh` at close.
- Worktree `~/Dev/retrogames-forge-pacmandrive` pruned after merge.
- STATE parked via `statepark.mjs park b`; shift report pushed.
