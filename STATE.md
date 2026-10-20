# STATE — forge session 2026-10-19 (SHORE perf)

## Shipped this session
- **SHORE perf: one-lane shore() — PR #539, squash `2e0ab1f`** — live on prod.
  - `shore()` took `array<vec3f, NLANES>` (2 KB) **by value**; WGSL copied it
    per call, 4 calls per water fragment → <1 fps at full window.
  - Now `shore(x, z, t, lane: vec3f)`; every call site indexes once
    (`lanesIn.v[laneIdx(z)]`): water vertex, all four normal-gradient calls
    (each with its own z, so lane choice still follows the sample), probe
    compute. Sand already read its lane directly.
  - shorecheck #19: full-window frame budget — viewport 1600x1000 (the canvas
    cap, worst case the demo renders), warm pipelines, 60 steady frames, fail
    above `--max-ms` (default 20). Backed by new `__shoreTest.perf()` /
    `resetPerf()` (raw rAF deltas, 120-frame ring).
  - Studio proof: fixed avg=16.67 ms = the vsync cap (shader no longer the
    bottleneck); by-value mutant avg=72.9 ms → speed check RED, 18/19.
  - Full suite 19/19 green on the Studio.

## Earlier today (PR #537, squash `a7bb05d`)
- #521 SHORE demo: WebGPU golden-hour beach — travel-time phase warp (no FFT),
  Green's-law shoaling, Gerstner face-push, trough-aware depth-limited breaking,
  128-lane CPU swash sim (skewed oscillator + drying memory) uploaded per
  frame; wet sand, bubble rings, clear shallows, glitter, free-fly camera.
  Screenshots: docs/shots/shore/.

## Playable now
`https://jalfern.com/retrogames/demos/shore.html` (via `/retrogames/demos/`).
jalfern.com 308s to www — poll prod with `curl -L`.

## Next queued
- Oldest game-queue: **#531 Online 2P: room codes + Cloudflare relay, lockstep**
  (multi-stage infra, pilot Gauntlet).
- #538 `QA — SHORE: polish pass` (feedback): foam-edge AA, surf sound,
  wet-front patchiness, dunes, distant swell, tod slider — QA lane.

## Lessons worth keeping
- WGSL copies array-typed params **by value**; a per-fragment hot call must
  take the indexed element (`vec3f`), never the lanes buffer.
- Frame-budget gates: measure steady state (resize + warm-up + 60 frames). On
  the Studio's Metal the floor is the 16.67 ms vsync cap, so a 20 ms budget
  separates copy-bound (73 ms) from fine cleanly.
- Run `npm install` **in the worktree cwd**: a chained
  `git worktree add && npm install` run from the main checkout installs into
  the main checkout and leaves the worktree bare.
- `gh pr merge --delete-branch` leaves the worktree on local `main` — detach or
  remove the worktree afterwards, or `main` isn't free for the next rule-5 merge.
- (carried) This Chrome's WGSL lacks `dFdx` → finite-difference normals; a
  rejected shader module kills the renderer black (mean lum 2) = "dead
  renderer", not "bad art".
- (carried) Camera basis: right = (−fz, 0, fx); sign errors flip the image.
- (carried) Foam by still-water depth saturates the whole sea; include the
  trough: `H/(d0+min(η,0))`.
- (carried) Cross-lane phase tilt ≪ π or lane-mean oscillation cancels.
- (carried) Skewed oscillator must straddle 0 (`2·swave−1`) or it never drains.
- (carried) Storage `vec3f` = 16 B stride; CPU-packing 3 floats misaligns lanes.
- (carried) Pair GPU readback with a same-frame CPU snapshot (`probeNow()`);
  count-comparing gates must tolerate grid sampling (2–5 cells, not "many").
- (carried) Shared WGSL chunks: parameterize bind-group numbers.
- (carried) Glitter needs the sun roughly opposite the view dir.

## Three questions for Jon
1. (open since #521) Demos have no registry entry — link SHORE/OCEAN from the
   arcade menu/footer, or is `/retrogames/demos/` the only surface?
2. (open, #538) Foam-edge sawtooth: cheap analytic distance-to-waterline AA, or
   a dedicated 512² swash heightfield texture?
3. Queue head is infra (#531): start the 2P relay pilot, or forge a fresh title?

## Housekeeping
- Main checkout: detached at `origin/main`; no local `main` checked out
  anywhere (rule-5 merge stays unblocked).
- Worktree `~/Dev/retrogames-forge-shore-perf` removed post-merge.
- Dev server not started. Nothing dirty.
