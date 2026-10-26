# STATE — session 24 (2026-10-25)

## Shipped this session
- **CORAL REEF GPU (#1050 → PR #1092, squashed to main as 5b989cd)**: resumed the
  pushed corpse (`forge/coral-reef-gpu`, unrebased draft, never run) and got it to 36/36.
  - **Beer–Lambert sign bug**: `col *= exp(SIGMA*fogd)` AMPLIFIED red with distance
    (blown-out pink wash on first boot). Fixed to `exp(-SIGMA*fogd)` and reordered the
    lighting: absorb surface light FIRST, then add teal in-scatter (fog color is light —
    re-absorbing it made everything gray-cyan), god rays last.
  - **Fish billboard projection divided by aspect with no FOV factor** — whole school
    rendered as tiny dots squashed toward screen center. Correct clip:
    `x = tan_h·1.55/(z·aspect)`, `y = tan_v·1.55`.
  - **Vacuous speed gate**: non-blocking fence wait at frame start always read 0ms
    (compositor submits late here) → adaptive ladder never fired → 63ms full-res.
    Ladder now falls back to rAF EMA when fence is dead; reefcheck gates max(busy,
    avg-rAF) with honest budgets (hw 30/45ms, sw 90/260).
  - Reef richness: camera cruise lowered (drifts THROUGH coral tops), cells 32u→16u
    (8×8 per period), 4 slots/cell, structure radii clamped to owner cells so the
    2×2 window keeps SDF validity; schools placed in the drift path at ~cruise speed.
  - `reefcheck` 36 gates: near/far-sand absorption replaced the vertical column gates
    (camera faces the horizon — top/bottom bands measured sand, not depth).
    **Proven-fail mutant**: caust()→0 reddens the new hi-contrast web-strand gate
    (463px clean vs 167 mutant); old brightness gate passed the mutant (shafts lit
    the floor) — a gate that survives a mutant isn't a gate.
  - Headless Chrome died mid-run twice → fresh profile per run + one retry per
    measure context.
  - Prod verified (marker in deployed reef.html); #1050 shipped+closed.

## Playable now
- jalfern.com/retrogames/demos/reef.html — raymarched reef: light shafts, caustic
  web on gold sand, boids school, teal distance; drag to look, tap for ambience.

## Branches / harness
- `forge/coral-reef-gpu` deleted by squash; worktree `~/Dev/retrogames-forge-coral-reef-gpu`
  removable (its node_modules was real — reefcheck ran there).
- QA filed: **#1093** CORAL REEF polish pass (coral surface relief, ray wash mid-frame,
  horizon dark strip, fish silhouette variety, audio variety).

## Next candidates (unclaimed)
1. Queue is empty (`game-queue` clean, nothing `building`) → flagship polish stage
   (#841) next: SSX, Emberwood, COMET DRIFT HD, Myst — pick via
   `scripts/lib/idle.mjs` flagshipStage; QA holds #1090/#1082/#1063/#1093 — skip those.
2. Old unmerged forge branches exist (campfire-670, comet-hd-fallback, emberwood-*,
   ssx-*) — none labeled `building`; they are stale, not corpses.

## Open questions
- none filed this session.

## Watch-outs learned
- Additive color-order in scattering shaders: absorption applies to TRANSMITTED
  surface light only; in-scatter (fog) is added after, never multiplied by transmittance.
- A DEV-hook perf number that never moves (busy=0) is a broken sensor, not a fast GPU.
  Prove a metric responds before trusting a gate on it.
- Pixel gates must sample at feature scale: caustic web wavelength (~1u) vs a ±5px
  neighbor window at reef distances → gate measured nothing; widen windows to the
  projected feature size (±9px here).
- Camera-drift + slow-moving actors: put schools/actors in the camera's path or they
  only ever appear behind you.
