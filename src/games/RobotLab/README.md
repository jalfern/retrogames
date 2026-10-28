# ROBOT LAB — Plaicraft robot-sim kit (issue #1141, stage 1)

Route `/robot-lab` · visibility: private · built by forge, 2026-10-28.

## What this is
The shared robot sim kit three future games (#1142, #1143, #1144) run on, plus
its QA surface. The sim is pure Node (`src/utils/robot/*` — no DOM, no three);
`index.jsx` only maps body poses to meshes and funnels input.

- `physics.js` — cannon-es world (fixed dt, no RNG → reset(seed)+pads is
  hash-identical in Node and Chrome), FNV pose hash, and `Rail`: an idealized
  prismatic slide with a STAND-CLEAR sweep refusal (closing onto cargo stops).
- `arm.js` — 4-DOF arm (yaw/shoulder/elbow/wrist-pitch), L1=L2=0.30, LG=0.055,
  shoulder on a 0.40 post at y=1.30. Planar IK = damped least squares
  `Δθ = Jᵀ(JJᵀ+λI)⁻¹b`, 8 fixed iterations + a weak gamma→0 bias.
  **Links are kinematic**; carried objects weld kinematically (see gotchas).
- `props.js` — bench, compound drawer (real cavity, mass 1.4 kg), hinged
  cabinet with a weak close-spring + open detent, crate 0.5 kg, can 0.35 kg,
  per-pair contact materials (steel/plastic/wood).
- `episode.js` — Plaicraft episodes: `retrogames-rec/v1` + optional `episode`
  block (task, success, score, methodsUsed, poses @ 6-tick stride). Old v1
  files validate unchanged. `exportEpisodes()` → JSON-lines. localStorage
  store (`retrogames-episodes`, cap 50).
- `index.js` — sim factory, task/goal logic, pointer-tap macros, autopilot
  (drives ONLY pads; shared by attract demo and the harness).

## Win condition
Two tasks, all six subgoals: drawerOpen · crateIn · drawerClosed ·
doorOpen · canIn · doorClosed (score 50/100/50/50/100/50 = 400).
The drawer **refuses to close** when the crate sits on the rail track
(stand-clear). The gripper refuses to hold when it closes on air.

## Inputs (all three recorded, methodsUsed in the episode)
- stick/analog or arrows/dpad: x lateral, y depth; **hold B/Shift** → y lifts.
- A/Space: grab / release / latch handles.
- Tap (raycast → `sim.tap(id, point)`): prop = pick; drawer/door = open;
  point-while-holding = carry and drop there.

## Verify commands
- `node scripts/robokitcheck.mjs` (alias `npm run robokitcheck`) — **NOT YET
  WRITTEN** (stage 1 shipped WIP; see honest gaps).
- Node sim smoke: `node --input-type=module -e "import { createRobotSim, createAutopilot } from './src/utils/robot/index.js'; ..."`

## Gotchas learned (each cost a debug cycle)
- **Kinematic anchor + solver constraint = fling.** LockConstraint between the
  kinematic hand and a free crate launched it at 3 m/s; between the hand and a
  rail/hinge-driven prop it oscillated the prop (dz sign 28 m runaway). Carried
  bodies are welded kinematically (position/velocity sync each tick) and drawer/
  door latches drive the prop kinematically (`driveTo`/`driveAngle`).
- **Rail clamp feedback:** writing `(clamped − overshoot)/dt` as velocity fires
  the body back the next tick. When clamped, zero the axis velocity instead.
- **Angle convention:** the door angle() is NEGATIVE swung out; driveAngle
  follows angle() — a sign flip here swings the door through the cabinet.
- IK without the `Jᵀ` factor (applying `A⁻¹b` straight to joints) converges
  nowhere — silent, not noisy.

## Honest gaps (next sessions / QA)
1. **Autopilot win is not reliable yet** — full task order reaches ~4/6
   subgoals per seed; the drawer re-latch + door-open phases need phase-budget
   and approach tuning (seeds 1/2/3/7 traces in issue #1141 comments). The
   win proof gate cannot be written honestly until autopilot wins every seed.
2. `robokitcheck.mjs` — gates planned: determinism (seed+pads = hash),
   IK↔FK round-trip ≤2 cm, stand-clear refusal, empty-grip refusal, episode
   validate + replay hash-equal + JSONL export, boot/win browser gates.
   Also join `contractcheck` (`contractGames.mjs`) once the win gate exists.
3. SimReady asset hookup (stage 2, waits #1140); license checks per asset.
4. Fully dynamic (torque-driven) arm; wrist camera; force-closure grasp model.
5. Modem-level juice: drawer rumble, latch clicks, carry sway audio.
