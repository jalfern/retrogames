# STATE — forge session 2026-10-19/20 (COMET DRIFT #542: grown world + camera)

## Shipped this session
- **#542 COMET DRIFT: courses too tight, camera lost in overhead scenery** —
  PR #___ (branch `forge/comet-drift-hd-542`). Issue #542.
  - World grown ×3: TX/TY 2560→8192; all three layouts + ELEV profiles grown
    about bbox center (`WORLD_SC=3`, `grown()` in track.js); hairpin apexes
    pulled back via TIGHTEN table (`scripts/comet-tighten.mjs`) so signature
            corners stay brakeable: min corner radius now ≥95px (was ~60).
    Lap lengths ≈3× the old (gulch ~24s, sandbank ~37s, corkscomb ~49s at
    autopilot pace). Ground bake decoupled: TEX=2560 canvas, `TEX_S=0.3125`
    for Mode 7 sampling — phones still afford the bake.
  - Sim taught to live at scale (sim.js): look-ahead converted to distance
    (px), brake window opens AT the kart, drift-bend + mistake thresholds
    scaled ×1/3, curvature-capped inner wall clamp + banked slide + wall-press
    repel (no evolute pin at hairpins), and a new **unwrapped lap odometer**:
    nearest-point hops across the lap seam no longer fake checkpoints/laps
    (they cancel in the odometer; teleports re-anchor it).
  - HD (#scene.js/index.jsx): horizon furniture (floor/dome/sun/14 mesas) now
    derives from the LIVE course bounds (`worldAnchor()`) and rebuilds per
    course — the old ring sat at the 2560px world's center and karts drove
    UNDER the mesas at 3× scale. Chase cam closer/lower (back 4.55u, eye
    2.45u, look 11u) with a crest-clearing lift law; rim tops down to
    1.4–2.6u. Scenery must clear EVERY track point (260px) — apex items used
    to loom over the opposite leg of hairpins.
  - Harness: cometcheck gates ≥95px min radius + ≥2.2× lap length, scaled
    sweeper band + budgets (GREEN); cometdrifthdcheck gained
    `cameraCorridorAudit()` per course (GREEN 50/0 incl. browser). Both
    mutant suites proven RED.

## Playable now
`https://jalfern.com/retrogames/comet-drift` and `/comet-drift-hd` — after
merge: 3× longer Gulch/Sandbank/Corkscomb, brakeable hairpins, tighter chase
cam that clears the crests and stays under the horizon.

## Next queued
- After #542 merges: game queue has no open forge issues left — check
  `gh issue list --label game-queue` before inventing work (rule 2).

## Lessons worth keeping
- **A lap crossing IS a half-lap jump.** Symmetric "sane delta" guards kill
  real crossings; unwrap per-tick motion to (-len/2, len/2] into an odometer
  instead, and re-anchor when odometer and position diverge (snap/restore).
- **Sample-count hint windows rot when spacing changes.** makeNearest's fixed
  ±160 samples became ±3× the px reach with grown spacing and hopped across
  the seam. Keep hint windows in PX units (track.js W = 1180px / arcPx).
- **Grow a world and the horizon rots with it.** Anything placed at absolute
  coords (mesas, dome, floor, sun) must derive from the live track bbox; the
  audit (`cameraCorridorAudit`) is what proved it, not the eyeball.
- **Lateral-offset scenery placement fails on self-folding courses** — check
  distance to ALL track points, hairpins bring the opposite leg within arm's
  reach of the apex.
- **Back-to-back headless Chromes wedge the GPU process**: the second boot's
  WebGPU init falls into the legacy refuge. Settle ~2s between browsers in
  multi-lane checks (advisory gate, not a product bug — default boot proven
  webgpu standalone).
- Real-time gates on world physics must wait-until (`waitForFunction`), never
  a fixed `waitForTimeout` (software-rendered lanes tick slower than wall clock).

## Three questions for Jon
1. Lap times are ~2.2–2.7× the old (corners looser than ×3 since apexes were
   pulled to ~105px). Long enough, or push the grown layouts wider still?
2. The 2D Mode 7 bake stays at 2560² (0.31 u/px) — at 8192px courses the
   asphalt grain is softer up close. Worth a per-course bake size, or leave it?
3. Production WebGPU default boot flaked to legacy only when two headless
   Chromes ran back-to-back — accept the 2s settle in hdcheck, or want the
   b2 lane to retry once before reporting the gate red?

## Housekeeping
- This lane's worktree: `~/Dev/retrogames-forge-comet-drift-hd-542`
  (branch `forge/comet-drift-hd-542`) — remove after merge.
- Main checkout must sit detached at origin/main (Jon's rule): `git fetch &&
  git checkout --detach origin/main` in `~/Dev/retrogames`.
- Dev server for the browser lanes was on :5173 from the worktree — stop when
  done (`pkill -f "vite.*5173"` if it nags).
