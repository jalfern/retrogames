# ROBOT LAB — Plaicraft robot-sim kit (issue #1141, stages 1–3)

Route `/robot-lab` · visibility: private · built by forge, 2026-10-28/29.

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

## Stage 2 — SimReady hookup (#1140 shipped; issue #1141)
`assets.js` is the manifest: every physical entity (gripper, crate, can,
drawer, door, bench) carries its SimReady record — supplier, https link (LINK
only, nothing mirrored — CI never downloads; USD→GLB conversion is the
documented manual step outside the network rule), SPDX-ish license, and the
physics the USD layer holds (mass/friction/collider) + provenance.
- **License law** = #1140's `licenseGate()`: per-supplier packs resolve to
  `review` — no mesh enters the shelf until its asset page is checked;
  `never` fails `robokitcheck`; declared gates are recomputed from law.
- **Physics travels with the asset**: transcribed masses/frictions drive the
  live cannon world (drawer 1.6 kg, door 0.9 kg, carton 0.42 kg @ μ 0.5, tin
  0.39 kg @ μ 0.3, bench wood μ 0.32; gripper 2F-85 1.0 kg recorded — links
  are kinematic, force-closure comes with the torque arm). Bodies carry
  `simready` id stamps; gate 9 proves the world wears the manifest.
- **Provenance HUD**: ASSEMBLY strip shows supplier + gate badge + mass per
  part; players see where the physics came from.
- **Episodes pin their physics**: `episode.assets = simready-manifest/1` —
  exported datasets declare which transcribed record they were played with.

## Stage 3 — torque, wrist camera, force-closure (issue #1141)
- **Torque-driven joints**: the servo commands τ = Kp·θ_err + Kd·ω_err +
  gravity feedforward, clamped at per-joint τ_max (`JOINT_SPECS`, desk-arm
  class figures with provenance); θ̈ = (τ − τ_gravity)/I integrates each joint.
  Links stay kinematic bodies (stage-1 solver lessons stand); payload masses
  load the distal joints for real, effort % + SAT flags ride in
  `state().torque/.sat` and the HUD strip.
- **Wrist camera**: live PIP viewport (renderer scissor pass) mounted on the
  hand looking along the finger axis, C toggles, crosshair + label overlay.
- **Force closure**: holding is `n·μ_eff·F_clamp` from the 2F-85 `grip`
  record (40 N setting, rubber μ 0.7, μ_eff = min(pad, asset surface)) vs
  `m·(g+|a|)` smoothed + gross weld deviation > 20 mm. Slam cargo into the
  drawer lip and it slips; a pick the pads can't statically hold is REFUSED
  at the grab (recorded `refused:<slot>` event). SLIP events count in
  `state().slips` and the HUD.
- Manifest rev `simready-manifest/2` (grip block added); episodes pin it.

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
- `npm run robokitcheck` — sixteen gates, all green: determinism (seed+pads =
  identical hashes across processes), analytic servo round-trip (worst |Δ|
  ≤ 50 mm; the near-column dead zone is documented, not hidden), empty-grip
  refusal, stand-clear mechanism (Rail blockFn freezes a slide into an
  occupant), episode validate (good passes / corrupt fails), autopilot wins
  all 6 goals on seeds 1..12, plus stage-2: manifest schema/link-only,
  license-gate recompute (no `never` verdict ships), live physics carries the
  transcribed masses/frictions, episodes pin the manifest revision.
  Stage 3 gates: actuator spec (rated carry inside shoulder τ_max), live
  force-closure (budget = manifest math, weld wears it, under-force pick
  refused), visibility (torque/slip state + WRIST-CAM/torque HUD tripwires).
  Mutant-proven three times: hardcoded crate mass reddens gate 9; silent
  CC0→SCEA relicense reddens gate 8; shoulder τ_max 12→6 reddens gates
  11/12/6 (the carry can't be held).
- `CONTRACT_ONLY=robot-lab npm run contractcheck` — 18/18 including live
  capture replaying hash-equal (the loop honors `contractHoldsLoop()` and
  `reset()` enters play synchronously, so banked ticks belong to the header
  seed).

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
- **IK without the `Jᵀ` factor (applying `A⁻¹b` straight to joints) converges
  nowhere** — silent, not noisy. Replaced by an analytic 2R elbow-up servo with
  per-tick slew limits; the limit-cycle came from the solver flipping branch
  across the wrist singularity.
- **cannon sleeps bodies on contact:** forces and velocity writes are ignored
  on a sleeping body — a held door or latched rail body must be woken
  (`sleepState = 0`) every tick the actuator pushes.
- **Contract live capture demands tick-0 honesty:** a keypress that starts a
  run re-seeds with `Date.now()` for humans — fine, but the contract `reset`
  must land the sim in play mode at the requested seed, and the rAF loop must
  stand down while `contractHoldsLoop()`. Otherwise banked hashes are from a
  different world than the header seed claims (diverged @30).

- **`<PauseOverlay visible={paused}>` never hides.** The component has no
  `visible` prop — it renders fullscreen `z-50` whenever it MOUNTS, and its
  capture-phase paging handler swallows Arrow keys. Stage 1 shipped that prop
  form, so live play wore the help screen; stage 2 caught it with a real
  headless drive (screenshot, not state probes — `paused` was false the whole
  time). Mount `{paused && <PauseOverlay … />}` like every other game.

- **Torque cache is per-tick — snapshot must carry it.** `state().torque`
  reads the actuator effort cache written inside `actuate()` from the
  PRE-integration θ/ω; joint/spin writes alone can't rebuild it (a recompute
  from the restored θ/ω reproduces the NEXT tick's command, not the stored
  one — equal only at steady state, which is why a constant-pad probe misses
  it). Shipped broken in #1237 (contractcheck on main: 17/18, `phi1 47% vs
  71%` for identical joints). Fixed by carrying `tn`/`sat` in `snapshot()`
  and writing them back in `restore()`. robokitcheck gate 15 proves the
  round-trip mid-motion in pure Node, mutant-proven (drop the write → red).

## QA polish pass (issue #1227, stage-2 asks)
- **Run counter**: `episodeStats()` in the kit counts saved/won episodes;
  HUD header shows `EPISODES n SAVED · n WON` (refreshed on every save).
- **Timeout is a loss**: at `WIN_TICKS` the run ends on TASK TIMEOUT and the
  episode saves with `success:false` — Plaicraft datasets carry failures too,
  and the SAVED/WON split becomes meaningful.
- **Gripper tick**: the torque strip shows `GRIPPER OPEN / CLOSED · EMPTY /
  CLOSED · HOLDING <slot>` with an LED, reading `state().gap`/`held`.
- **Slip juice**: a new SLIP edge (state.slips delta) fires a noise-burst thud
  + low sine and a decaying camera shake (play phase only).
- Harness: gates 14 (stats + HUD tripwires) and 15 (restore round-trip).

## Honest gaps (next sessions / QA)
1. SimReady mesh pulls: USD→GLB conversion + exact USD-side friction/mass
   transcription is the manual step (outside CI); until pulled, records are
   published-spec estimates and the game renders its own meshes.
2. Links are torque-serviced in joint space (θ̈ = τ/I); the cannon bodies
   stay kinematic (anchor+constraint fling, see gotchas). Base reaction and
   joint flexing would need a full rigid-body chain — a later stage.
3. Modem-level juice: drawer rumble, latch clicks, carry sway audio.

