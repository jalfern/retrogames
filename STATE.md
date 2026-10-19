# STATE — forge session 2026-10-19 (COMET DRIFT references)

## Shipped this session
- **#513 COMET DRIFT: courses follow their reference layouts** — PR #529, squash `ec38b62`.
  - `npm run cometrefs` (`scripts/extract-comet-references.mjs`): reproducible trace of
    Daytona + Laguna Seca from Wikimedia maps → road mask → thinning → loop walk →
    32-pt centerlines in `reference.js` (header declares provenance).
  - **Provenance gate** in `cometcheck`: ≥98% of generated pts on the committed road
    mask, alignment search over rotation/mirror, coverage + circuit-size floors.
    Mutation-tested: one nudged pt → RED.
  - Shape gate: avg deviation ≤3% (actual 1.69% / 2.37%) + worst-feature caps (12% / 18%).
  - Asphalt 140 → 80 → 64px; controls re-tuned; `cometplay` 24/24 in real Chrome.
  - Fixed pre-existing red: CometDriftHD cliff face had sunk inside the 216px sim
    clamp when ROAD_R narrowed (main was failing `cometdrifthdcheck`); HD walls now
    floor at 220px. `cometdrifthdcheck` 44/0.
- #530 filed: CometDrift polish pass (camber/vertical, kerbs-to-plan, 3rd circuit,
  `?ref=1` overlay).

## Playable now
`jalfern.com/retrogames/comet-drift` — Sandbank reads Daytona's peanut + infield notch,
Corkscomb reads Laguna's S + horseshoe (minimap proves it at a glance). HD: 44/0 checks.

## Next queued
- **Oldest game-queue: #518 COMET DRIFT: elevation — courses go up and down (HD first).**
  #530 (#polish camber) overlaps it — consider folding or ordering #518 first.
- #521 DEMO 2 — Shore (lane:demos) is the other queue item.

## Lessons worth keeping
- Extraction pipeline quirks (all fixed in-script, deterministic): walker needs
  straight-ahead-first DFS + backtracking; a 3× downsample kills hairpin spurs but
  dilate-after-thin re-fattens junctions; SVG rasterize needs a white matte (transparency
  reads as dark road).
- `CometDriftHD/scene.js` reads widths from `CometDrift/track.js` — **any ROAD_R/WALL_R
  change must re-run `cometdrifthdcheck`**, and the HD gate's 220px floor is the keeper.
- `cometcheck --mutate` still dies at the checkpoint gate, not the shape gate — fine, it's
  load-bearing.

## Three questions for Jon
1. #518 (elevation) vs #530 (camber/kerbs polish) — merge them into one "make the
   Gulch have real terrain" issue, or keep elevation HD-only and polish flat-mode 2D first?
2. Corkscomb without camber reads as a plain S. Is faked camber (shading + grip bonus,
   no true vertical) enough for the fidelity bar, or does it need real y?
3. #493 is tagged `shipped` but still open with a QA follow-up (#502). Close the chain
   (#493/#502/#511 are all "Sandbank/Corkscomb polish round N") or keep feeding rounds?

## Housekeeping
- Main checkout: detached at `ec38b62`, this STATE.md is committed (game merged ✓).
- Worktree `~/Dev/retrogames-forge-comet-reference` removed post-merge.
- Dev server stopped. Nothing else dirty.
