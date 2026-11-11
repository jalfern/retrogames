# STATE — session 233 (2026-11-11, slot a)

## What shipped
**VIPER PIT takes the WATCH seat — b30 of the #1637 rollout.** Merged as
`e8f9566` (PR #2051, "Part of #1637"; warden TARGET, claimed clean at 22:0xZ).
Y flips seat 1 to the fighter's OWN corner brain (`gs.fighters[0].def.cpu =
BY_ID[p1Char].cpu` — cpuDecide/cpuPad in the shared fighting core, the same
driver the attract bout runs; no new brain). Any driving key or a touch hands
the corner back mid-round; the seat rides the ladder (rung climbs re-seat);
title screen and KING OF THE PIT release it; net/local never seat. Title card
teaches Y offline; phones seat from the top-right in-run pill (attract pill
honestly skipped FireCrew-style — picker in the boot path, SKIP_ATTRACT names
it). Registry line: "seat 1 fights the pit at its fighter's own ladder tier
(1P mode)". https://jalfern.com/retrogames/viper-pit — prod entry
`index-BLZsH_r5.js` carries the literal (verified on live).
**Honesty bar** (viperpitcheck new b30 section): own tier vs LIVE rung 1, 5
fighters × 12 seeds — 60/60 bouts decide, 60/60 drag the foe off full health
untouched, every fighter takes >= 8 of 12 rounds (nyx:12 cinder:23 vess:19
riv:22 krax:18). No ladder climb claimed — NYX mirrors rung 1 on itself;
deeper rungs beat own-tier seats (measured insane-tier ~0/12 clears).
**Candidate audit:** b29's b30 list minus viper-pit has NO proven driver
(pacmancheck/centipedechek have no scripted win; pitfall no harness;
SuperMarioClassic no planner) — those four stay honest with no button.
Mutants bit: tier-flip removed → 3 pins red; seat refused → 5 live pilot
gates red. Live watchcheck pilot 301/301 (advance p2 hp 100→47 untouched).
watchphonecheck 486/486, watchpillcheck 226/226, lint gates green, build green,
viperpitcheck Part B green zero page errors.

## The session's catches
- **`git checkout <file>` after a mutation discards ALL uncommitted work on
  that file, not just the mutant.** Mid-session I had an uncommitted
  attract-comment fix; the mutant restore ate it. Re-apply after restore, or
  checkpoint-commit before mutating.
- **`--phone` is manual-only** (nothing in ci.yml/warden/watch.sh passes it):
  picker titles' phone gates (pill visible at boot) sit red by design —
  iron-ring fails identically on untouched main. Don't chase them; watchphonecheck
  (static parse) is the wired phone contract.
- **`gh issue comment` has no `--json` flag** (unlike pr create). Quiet-fail
  habit: redirect + echo.
- Two copies of the tier-flip line (seat + ladder re-seat) mean source pins
  need distinct regex anchors (the re-seat pin pins the `watchingRef && gs`
  prefix) or a mutant slips past one of them.

## Ladder trail
TARGET #1637 claimed clean (no halt/steer/next; game-queue empty otherwise;
no building corpses; jonq games: none open). No QA borrow (feedback items
exist but QA MASTER live — never double-claim). flagshipStage not needed: the
queue had the target. 8b not filed: seat on an existing title, and the
rollout issue itself stays open carrying the remainder (b31 audit brief posted
in #1637's wrap comment).

## Open questions
- none (see waiting-jon issues).

## Next
- **#1637 b31: full-shelf driver audit** (brief in #1637 wrap comment):
  which remaining registry titles own a winning script in their own check —
  seat them, or declare the rollout done with the "no guide yet" remainder.
  Batch numbers 19–21 never appear in watchcheck — check the issue trail
  before renumbering.
- **`viperpitcheck` is red-on-main and wired into NO CI job**: Part A's #1732
  gate "qcb gate: the CPU throws the counter at close range" fails
  deterministically on untouched `0b9d6ee`+ (likely drifted with #1761/#1785
  shared-core changes). Flagged twice on #1637; QA lane's call.
- PPM drain law still stands (session 230): do not re-pick PPM at weakestStage
  while its feedback pile + #2020 sit unowned.
- #2045 (lane-liveness crossings) and #2036 (resume-gate nightly budget) remain
  open harness improvements, unowned.
- Dev servers: slot a 5173 stopped at exit; slot b 5178; QA studio 5176.
  `~/Dev/retrogames-forge-watch-rollout-b30` left detached at `e8f9566`
  (its branch died with the squash) — remove or reuse, don't rebuild on it blind.
