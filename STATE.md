# STATE — session 43 (2026-10-28/29)

## Shipped this session
**ROBOT LAB stage 1** (#1141, PR #1214, squash 0e09701) — live at
https://jalfern.com/retrogames/robot-lab (private; Jon promotes when he wants).
The Plaicraft robot-sim kit: cannon-es (MIT, deterministic fixed dt — Rapier
rejected: wasm/MIME + SIMD determinism), drivable 4-DOF arm (analytic 2R
elbow-up servo, slew-limited, kinematic-weld gripper that refuses air), rail
drawer with STAND-CLEAR refusal, spring-hinged cabinet with open detent, seeded
crate/can. Plaicraft `episode` block rides the unchanged `retrogames-rec/v1`
format (task/success/methodsUsed + pose track), JSONL export, localStorage
ring — spec documented in docs/GAME-SHELL.md. **Autopilot wins all 6 goals on
40/40 seeds** (max 3512 < 4200 ticks). `npm run robokitcheck` = 6 gates,
mutant-proven. contractcheck robot-lab 18/18 incl. live capture hash-equal
replay. Per the steer note, `game-queue` went back on PHYSICS WALK (#1204).

## Hard-won facts
- **cannon ignores force/velocity writes on sleeping bodies** — an actuated
  prop (held door, latched rail) must set `sleepState = 0` every tick it is
  driven, or it silently stops mid-motion.
- **A conditional constraint gate must be evaluated every tick the driven
  axis could move** — checking stand-clear only "while opening toward target"
  let the drawer close onto the crate; refusal must also HOLD (snap to current
  param + zero axial velocity + shed axial force).
- **Contract live capture demands tick-0 honesty**: the rAF loop must stand
  down while `contractHoldsLoop()`, and contract `reset()` must enter play
  synchronously at the header seed — the human-path `Date.now()` re-seed on
  first keypress otherwise poisons banked hashes (symptom: replay diverges at
  exactly the first checkpoint, t=30).
- **poseHashes must not include cannon's global `body.id`** — the counter is
  per-process; two sims in one node process hash differently for identical
  worlds. Key by kitName.
- **world.step(dt, 0, 0) does not integrate** (zero substeps). Use (dt, 1, …).
- **IK branch flips at the wrist singularity**: DLS limit-cycled ±0.19 rad
  per tick; analytic 2R elbow-up + slew limits fixed it and cut ~900 ticks.

## Harness
`npm run robokitcheck`: determinism (cross-process identical hashes), servo
round-trip ≤50 mm (near-column dead zone documented, not hidden), empty-grip
refusal, stand-clear mechanism, episode validate (good/corrupt), autopilot
wins ×12 seeds. Mutant (stub stand-clear check) turns gate red — proven.
robot-lab joins `contractGames.mjs` GAMES + LIVE. `scripts/robot-trace.mjs`
is the multi-seed autopilot debugging tool.

## Next goal
`game-queue` holds: **#1204 PHYSICS WALK demo** (demos lane owns it — re-queued
per Jon's steer), #1201 forge runway, #1140 shared 3D model index (unblocks
RobotLab stage 2 SimReady hookup), #1132 film strips. #1141 stays OPEN for
stage 2 (SimReady assets + licenses; waits #1140). Next builder session:
follow FORGE step-2 on the queue; if #1140 is ready, RobotLab stage 2 is the
natural continuation.

## Environment notes
- Lane port used: 5174 (5173 held by another lane's dev server; contractcheck
  takes `DEV_PORT=`). Dev server stopped after shipping.
- `qa-1138` worktree still holds local `main`: `gh pr merge` MERGED but errored
  on branch switch and skipped remote delete — same fix as session 41:
  `git push origin --delete <branch>` (done this session). Consider asking the
  QA lane to detach its worktree.
- Worktree `~/Dev/retrogames-forge-robot-kit` on `forge-state-43`; reuse after
  this PR merges (`fetch + detach origin/main`).

## Open questions for Jon
(none filed this session)

## Carry-over
- Rule 4: game code shipped (#1141 stage 1) — streak healthy.
- QA lane owns #1179/#1168/#1135/#1190/#1195; builder lanes stay out (Jon 2026-10-19 decision).
