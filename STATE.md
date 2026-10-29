# STATE — session 47 (2026-10-28/29)

## Shipped this session
**ROBOT LAB stage 2 — SimReady hookup** (#1141, PR #1224, squash 0122761).
The kit now wears its assets' data: `src/utils/robot/assets.js` is a manifest
of 6 SimReady records (Robotiq 2F-85 gripper, corrugated carton, 300 ml tin,
LG crisper drawer, appliance door, warehouse bench) — supplier, https link
(link-only, nothing mirrored, CI never downloads), license, transcribed
physics + provenance + mesh-pull status. Transcribed **masses and frictions
drive the live cannon world** (drawer 1.6 kg, door 0.9 kg, carton 0.42 kg @
μ0.5 — new cardboard/tin surfaces, bench wood μ0.32, steel pairs keep
stage-1 measured values pending per-asset USD transcription); autopilot still
wins all 6 goals on seeds 1..12. License law = #1140's `licenseGate()`
(per-supplier → review; `never` fails the gate; declared gates recomputed).
Provenance HUD (ASSEMBLY strip) + `episode.assets = simready-manifest/1` pin
so exported datasets declare their physics. **Caught and fixed a prod bug from
stage 1**: `<PauseOverlay visible={paused}>` — the component has no `visible`
prop and renders fullscreen z-50 on mount, so live play had worn the help
screen (state probes stayed green throughout; a screenshot caught it). Trap
documented in docs/GAME-SHELL.md.

## Hard-won facts
- **A component can ignore its `visible` prop.** PauseOverlay mounts-fullscreen
  unless the CALLER gates it: `{paused && <PauseOverlay …/>}` is the convention.
  Screenshots catch what state hashes can't — drive visually at least once.
- BSD sed (macOS) has no `0,/re/` address range — use `perl -0pe 's/…/,/'`
  (no /g) for first-occurrence swaps when mutating data rows for mutants.
- jalfern.com/retrogames **proxy cache lags Vercel deployments by 10–30 min**;
  `gh api …/deployments` + statuses is the deploy truth, the served bundle
  hash is the edge truth — don't call a merge unverified from the domain alone.
- Another lane's dev server held :5173 — always take `npm run dev`'s chosen
  port from its log (was 5178 here) and pass `CONTRACT_URL`.

## Harness
`npm run robokitcheck` now 10 gates (was 6): + manifest schema/link-only,
license-gate recompute + library registration, live-physics-carries-the-
manifest, episode asset pin (corrupt rejected, legacy allowed). Mutant-proven:
reintroduced hardcoded crate mass reddens gate 9; silent CC0→SCEA gripper
relicense reddens gate 8; both restored green. contractcheck robot-lab 18/18
(live capture replays hash-equal on the new masses). Scoped lints + build green.

## Next goal
`game-queue`: **#1201 forge runway** (lane:platform) — only queue item.
#1141 stays **building** for stage 3 (torque-driven arm, wrist camera,
force-closure grasp, real USD→GLB mesh pulls; scope in its PR/issue comments)
— no pushed branch, so step 1b won't resume it automatically; a builder
session must pick it deliberately (it's game code and outranks #1201 for
rule 4 health if chosen). QA lane owns #1227 (ROBOT LAB polish, filed this
session) + its backlog.

## Environment notes
- `~/Dev/retrogames-forge-robot-kit` worktree: branch deleted on merge; detach
  it (`git checkout --detach origin/main`) before reuse; node_modules is real
  and current (cannon-es present).
- `qa-1138` worktree still holds local `main` (multi-session carry-over);
  QA lane should detach it for real.
- Dev server from this session: stopped? No — killed by machine? Left running
  on :5178 — kill before next use (`lsof -nP -iTCP:5178`).

## Open questions for Jon
(none filed — no taste/priority calls came up)

## Carry-over
- Rule 4: game code merged this session — streak reset, healthy.
- Prod check was still on the proxy lag at session end (deployments API says
  production SUCCESS at e85dbb3 ⊇ 0122761); the queue/flags say re-verify
  `simready-manifest` in the served bundle next time.
- Per FORGE step 9 STATE.md committed via a STATE PR only if game merged —
  it did this session (#1224), so this file ships behind its own PR.
