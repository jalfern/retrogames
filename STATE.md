# STATE — session 45 (2026-10-28/29)

## Shipped this session
**PHYSICS WALK** (#1204, PR #1217, squash 918864f) — the dynamics rung under
STICK WALK, live at `/retrogames/demos/physicswalk.html`. 12-mass XPBD
rigid-body biped: gravity, stiff bone constraints, momentum-conserving
virtual-work joint torques, penalty ground contact (true per-point normal →
Coulomb friction that lets the foot roll heel-to-toe). Balance is an honest
inverted-pendulum PD + hip-lift reflex + margin/trailing step triggers.
Tap = impulse: 0.4–0.7 m/s taps stumble-and-recover carrying him 1–2 m,
≥1.5 m/s topples to a dead ragdoll. Lab-instrument look (CoM plumb, support
bracket, GRF arrows, lean gauge, dust puffs, synth thuds/alarm).
`npm run physicswalkcheck` — 28 gates: ragdoll honesty, zero bone stretch,
7 s unattended balance, stance slip <0.35 m/s, stance GRF ≈ weight / flight ≈ 0,
push ladder recover-vs-fall, cross-process determinism, boots/phone/law.
Mutant-proven (kp→5 reddens 4 gates; kG→1000 reddens ragdoll+GRF).

## Hard-won facts (physics)
- **A joint torque MUST close its couple at the joint point** (`F(J) = −F₀−F₁`).
  Without it virtual-work torques pump linear momentum: the figure launched
  itself to 8 m/s head-height with zero input.
- **Angle-space PD across ±π is a wrap minefield** (hip and knee rest near π):
  the controller works in smooth coordinate error signals (endpoint positions /
  lean), never raw atan2 joint angles.
- **Analytic sign-assignment for a biped fails; search it.** Gains + per-term
  ± sign multipliers found by randomized search (60k+ candidates in Node);
  score = survive N s + distance − stance slip. Two physics rewrites forced
  re-searches; the sweep is the calibration tool.
- **Velocity-level friction cannot stop stance creep** (constraint drag moves
  positions). Penalty contact with friction bounded by the *real* spring normal
  force (kG=120k, cG=1400, cf=140, μ=0.68 at dt=1/480) is the stable combo;
  position-clamp glue kills the heel-to-toe roll and makes him fall backward.
- kG·dt²/m < 1 is non-negotiable: kG=400k at 1/480 exploded the solver.

## Harness
physicswalkcheck 28/28 + mutant. creditscheck: added `physicswalk` to its
DEMOS list — note: deepglass/stickwalk/reef were never added by their sessions
(5 pre-existing red lines incl. a reef index mismatch; left for QA/next chore).

## Next goal
`game-queue`: #1201 forge runway, #1140 shared 3D model index (unclogs RobotLab
stage 2, #1141 building). #1218 is QA's PHYSICS WALK polish pass (headline:
continuous stride cycle — the search found stagger-recover, not steady walking).
RobotLab stage 2 (#1141) still building-waiting on #1140.

## Environment notes
- Worktree `~/Dev/retrogames-forge-physics-walk` — reuse after
  `fetch + detach origin/main` (branch deleted on merge).
- `qa-1138` worktree STILL holds local `main` (bit again — gh's post-merge
  switch died on it; manual detach done). Ask the QA lane to detach it for real.
- Node 26 runs `node -e` as TS and swallows errors — write throwaway probes as
  real .mjs files.
- Left no dev servers running (killed the 5187 vite).

## Open questions for Jon
(none filed — no taste/priority calls came up)

## Carry-over
- Rule 4 satisfied: game/demo code shipped (public/demos/**). Streak reset.
- QA lane owns #1179/#1168/#1135/#1190/#1195/#1202 + now #1218; builder stays
  out (Jon 2026-10-19).
