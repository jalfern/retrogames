# STATE — session 236 (2026-11-11, slot a)

## What shipped
**WATCH b31 — SUPER MARIO SEATS ITS CERTIFIED AUTOPILOT, AND THE ROLLOUT CLOSES** —
merged as `a5466c8` (PR #2060, Closes #1637, warden TARGET; claim was a resume of
this slot's live 21:53Z claim). The b31 full-shelf audit (#1637's brief) asked the
10 unseated registry titles "owns a winning script?": only `/mario` said yes —
the engine's own option-3 `autopilot()`, which `autopilotcheck` certifies (flagpole,
all lives, zero deaths, every pass). The other nine stay honest with no button
(mario-classic/centipede/pitfall/ironkeep/pacman/zork2/zork3/britannia — no proven
in-game driver; raccoon-heist's `heistwin.mjs` proves wins but the driver is
EXTERNAL — Node+Playwright, frozen contract — seating would clone an unproven
second brain). With b31, every title on the shelf plays itself on its own proven
route or truthfully offers no guide; an **audit-ledger pin** in watchcheck freezes
that remainder (the nine may never carry a WATCH line).
The seat (FireCrew/ViperPit house pattern): Y flips `mode` play↔autopilot — no
second brain, reactive per tick. b24 law: Y at the title starts AND seats from
tick 0. The seat lives on **1-1, the certified sector**; elsewhere Y declines with
the shared no-guide chip (~1.5 s, ROBOTLAB law). The flagpole completes the
watcher: `touchFlag` calls `release(false)` — clean keys — so 1-3 starts in your
hands. Proof: live pilot `watchcheck --only=mario` 13/13; autopilotcheck 11/11 on
the seat build; watchphonecheck 493/493 (7 gates auto-armed by the registry line);
watchpillcheck 229/229; lint:mario/fps/ai + build green; one mutant (neuter
takeover) died on 6 live gates. Prod: `index-BAgSI-RN.js` carries the registry
literal "clears 1-1 perfectly". #1637 shipped+closed with live URL; polish pass
filed as #2062 (seat-sector extension if autopilot survives 1-3/1-4, phone chip
width, nightly flagpole-release gate, README known-gaps, the mariocheck stale gate).

## The session's catches
- **`git stash` is REPO-WIDE across worktrees.** Working tree clean, `git stash`
  saved nothing — then `git stash pop` landed ANOTHER lane's stash (a
  weightsurgery QA corpse) into my worktree with 10 conflicts. Recovery:
  `git reset --hard HEAD` (failed-apply keeps the stash entry — verified intact).
  Never stash in this repo; checkpoint reality with commits only.
- **`pollAdvance` sleeps its WHOLE window before polling.** A 15 s window + a
  ~12-col/s autopilot drove the resume segment past the flagpole, and the
  flagpole law then released the seat mid-check. Fast provers need short windows
  (4 s here) — size the window to the prover's speed, not the harness default.
- **A mode flip is not a handback.** The first flagpole release set `mode='play'`
  but left the autopilot's held right/run in `keys` — 1-3 started with a stuck
  run button and Mario walk-ran into a firebar 3× at col 20 with zero player
  input (trace col 141→3, state gameover). `release()` must clean keys; pinned.
- **Registry lines auto-arm watchphonecheck** (registry-driven roster): adding the
  WATCH_HELP line pulled 7 phone gates onto mario on the spot — ship pills/hint to
  the letter of the law (bottom '24%', z-[70], --sat/--sar, !paused-scoped) and
  static chrome stays free.

## Ladder trail
TARGET #1637 claimed first per warden assignment — `forge-claim.sh 1637 a`
answered "already yours: resume it" (this slot's 21:53Z claim was still inside
the 90-min liveness). The resume path skips LABELING, so `building` was applied
via api to match the claim's board truth. No halt/steer/next anywhere; no jonq
filed; no QA MASTER conflict (#1637 was the warden's, and my slot's).

## Open questions
- none (see waiting-jon issues).

## Next
- **QA backlog this session left the lane** (#2062 + standing): `viperpitcheck`
  red-on-main, no CI wiring (flagged thrice now); `mariocheck`
  "gamepad present while playing" red-on-main, no CI wiring (#290 keyboard-hides
  outlived the check — retire it or drive it touch-only). QA lane's call.
- #2062 asks whether the autopilot survives 1-3/1-4 — if measured yes, extend
  autopilotcheck and widen the seat gate to the whole game.
- PPM drain law still stands (session 230). #2045 (lane-liveness crossings) and
  #2036 (resume-gate nightly budget) remain open harness improvements, unowned.
  Slot b's open items ride its STATE.
- Housekeeping: dev server slot a 5173 STOPPED at exit; `~/Dev/retrogames-forge-watch-rollout-b31`
  removed (branch died with the squash).
