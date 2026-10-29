# STATE — session 49 (2026-10-29)

## Shipped this session
**ROBOT LAB stage 3 — the arm gets real physics** (#1141, PR #1237, squash
43bb50e). Rule-4 streak broken: game code shipped.
- Torque-driven joints: τ = Kp·θerr + Kd·ω + gravity-FF clamped at per-joint
  τmax (`JOINT_SPECS`, desk-arm class, provenance in code); θ̈=(τ−τg)/I.
  Effort % + SAT flags in state + HUD bars.
- Force-closure grasp: budget = n·μ_eff·F_clamp from the 2F-85 `grip` record
  (40 N, rubber μ0.7, μ_eff=min(pad,surface)); under-force picks REFUSED at
  the grab; sustained crash/gross-grind = SLIP (events + HUD counter).
  Manifest → simready-manifest/2; episodes pin it.
- Wrist camera: scissor PIP from the gripper axis, C toggles, crosshair.
- Harness: robokitcheck 13 gates (added: actuator spec, live force-closure
  law + refusal, HUD/state tripwires), mutant-proven (shoulder τmax 12→6
  reddens 4 gates); wired into ci.yml static (new `robot` scope) +
  checks.mjs CORE/SCOPES — stages 1–2 had shipped the alias UNWIRED.
- Headless drive green: attract→play→pause→resume, zero page errors, PIP +
  torque strip visually verified.

## Hard-won facts
- Discrete torque servo needs ωn·dt ≪ 1: at ωn·dt≈4 the torque-clamped
  gamma joint became a max-ω relay that period-2 flip-flopped the whole arm
  (hand body ±3 m while FK stayed sane; the flung pose ate the crate).
  Gains ζ=1 at ωn·dt≈0.3 fixed it.
- Gravity FF without gravity in the plant = pure P = permanent droop
  (200 mm at reach). Plant integrates (τ_motor − τ_g)/I; FF cancels;
  payload compensated 90% → visible honest sag.
- Weld carry velocity must be feedforward: error-velocity + position snap
  double-applies the step, a ~30 N fake grind that tripped the slip law.
- Gripper closed gap (45 mm) was under the crate (65 mm): cannon ejected the
  prop at grab = instant fake crash. Closed gap 66 mm clears it (2F-85
  stroke is 85 mm).
- A PR touching `.github/workflows/` skipped its `pull_request` CI run
  entirely (no check-runs at all on the SHA, twice; siblings were fine).
  Manual `gh workflow run ci.yml --ref <branch>` supplied a passing `static`
  check on the SHA and the rule-5 merge gate accepted it. Suspected
  root cause worth 10 min: ci.yml `on:` has no `types:` but scope job's
  `git diff origin/main...HEAD` deep-clone? Not proven — if it recurs,
  file a harness issue.

## Next goal
`game-queue` is EMPTY after this session's claim. #1141 stays `building`
with stage 4 scope in its thread: real USD→GLB mesh pulls (needs the
network-rule answer — HuggingFace is outside the GitHub/npm rule; likely a
Jon question via jonq next session), full rigid-body chain + base reaction,
juice. QA lane owns #1227 (robot-lab polish, updated with stage-3 asks),
#1233 shipped (#1238), #1234 shipped (#1235).

## Harness
robokitcheck registered everywhere at last: package.json (was already),
ci.yml static `robot` scope, checks.mjs CORE+SCOPES; ciscope selftest ok.
forgecheck 45 ✓, lints (forge/mario/fps/ai) ✓, build ✓.

## Environment notes
- Main checkout: detached at origin/main (43bb50e), STATE committed via its
  own docs PR (docs-only → fast static).
- Worktrees: `~/Dev/retrogames-forge-robot-kit` now detached at origin/main,
  branch merged+deleted — reuse or prune. `retrogames-forge-forge-runway`
  still has real node_modules if needed.
- Dev servers killed ✓.

## Open questions for Jon
- #1229 — questions-digest mail wrapper location (default: stdout producer).

## Carry-over
- #1141 stage 4 (above) — next builder session claims it deliberately
  (same claim-comment pattern; label already `building`).
- Prod: Vercel deploying 43bb50e; live check was green pre-merge on
  preview 43bb50e; re-verify `simready-manifest/2` in the served bundle.
