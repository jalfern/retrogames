# STATE — forge board snapshot (slot a, 2026-11-22 late night — shipped)

## This session shipped
- **FLOOR BOSS watch-stamp truth** (#2987 POLISH, never-dry stage → PR **#2993**
  → main `033031e`, prod-verified: deployment `success` at the merge sha, live
  attract boot-proved). The take is named `model` only when the autopilot pad
  DROVE a sim tick (`watchSteered` lands in `doSim`, not at Y keydown) — a
  glance that never touched the wheel keeps its
  take human; every steered tick still poisons the career take across clock-ins
  (#2058 conservatism intact, fresh floors clear). New disclosure: a steered
  take that reached the bank gets an amber `BRAIN STEERED — TAKE OUT OF TRAIN`
  plate under the cleared-sheet beat (`sheetSteered = watchSteered &&
  isRecording()` captured at finish; declined floors stay silent — #2964 chip
  law). README: the mis-marked "Sheet truth #2964" bullet now reads `CLOSED by
  #2974` (that mis-mark was half of the `KICK FLOOR BOSS 0 weak` kick score).
  - Verdicts: floorbosscheck all green +7 pins, mutants `stamp`/`peek` die by
    name · floorbossplay new tail leg green (brand, bank-silence pixels, seam,
    run-birth clear) · lint×3 + build + contractcheck 14/14 green.
  - FloorBoss honest gaps now ZERO; idle-kick answers `NONE` (FireCrew is QA-
    held since #2985; every remaining weak score is held or human-data).
  - #2987 closed shipped. The rule-5 loop hit the #2975 trap again
    (`'main' already used by worktree` — `retrogames-qa-mini-cap` squats on
    `main` locally): merge VERIFIED via PR state + origin/main, exit ignored.

## TOP OF QUEUE — red main incoming (#2992)
- **`floorbossplay` knee/corner/lane refusal family fails 24 checks on main tip
  (filed #2992, full baseline proof).** Reproduced identically on untouched
  `origin/main` — NOT from #2993 (its own new legs all pass; node checks green).
  Window: last nightly-green sha `9127f4e` predates #2970/#2974/#2977/#2981;
  prime suspect #2966/#2970 tap-drain rewrite (moves refuse/charge verdicts a
  tick), runner-up #2974. Next nightly at tip likely RED → AGENTS.md 5a: the
  first lane to see it fixes it before anything else; quarantine only after 2 h
  without a fix. Bisect hint: floorbossplay on `d5eac2f^` vs `d5eac2f`, ~5 min
  each (slot a's local runs: `/tmp/forge/fbplay-main-baseline.log`).

## PLAYABLE on main right now
- `/retrogames/floor-boss` — press Y, take the wheel back before a tick: the
  take stays yours. Let it drive and the sheet now says `BRAIN STEERED — TAKE
  OUT OF TRAIN` when the take actually went to the bank (#2987, prod sha
  `033031e`). Plus `/retrogames/r-type`, `/retrogames/contra` as before.

## Board at close
- `game-queue`/`steer`/`next` empty. `feedback`: #2978, #2971, #2985 — QA-held.
  `building`: #1712 (human-data gated). #2992 (bug, lane:games) is the
  next builder's first job after the nightly verdict.

## Open questions for Jon (links only, #605)
- None open.

## Harness notes (carry-overs)
- **Tail-leg law (#2987):** browser legs reaching the over-screen must wait past
  its 600 ms key guard and must not hand mid-career state to later rigs — a
  mid-sequence stamp leg flaked the knee/lane fx ledgers; a self-contained tail
  leg (fresh `?seed=`, own eyes) cannot. Over-screen clock-in is drivable: sleep
  1200 ms after `waitMode('over')`, then Enter → `advanceShift` (probe-proven).
- mutateguard held the line: mutant runs refuse a dirty tree — commit, then run.
- #2910 got a data point + fix suggestion (a feedback-only score flip aimed the
  kick at a human-data gap mid-planning; the builder shipped the warden's
  actual pick #2987 instead).

## Slots / ops
- Slot a port 5173 stopped via `scripts/devstop.sh` (by port) ✓.
- Worktree `retrogames-forge-floorboss-watchstamp` merged; re-detached at
  origin/main and removed. `retrogames-qa-mini-cap` still squats on `main`
  (QA-owned — left alone, but it keeps making the rule-5 exit code lie, #2975).
- Main checkout: detached at `033031e`; STATE committed to main (game merged,
  rule 9) and parked via `statepark.mjs park a`.

## Next lane starting here
1. Nightly verdict → if RED on floorbossplay: fix #2992 (rule 5a) — tap-drain
   suspect first; harness-only calibration allowed without asking Jon.
2. Else run idle-kick: expect `NONE` (shelf gap-free, QA holds the feedback).
