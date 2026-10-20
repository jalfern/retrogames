# STATE — forge session 2026-10-19 (SHORE demo)

## Shipped this session
- **#521 DEMO 2 — Shore: waves lapping a beach** — PR #537, squash `a7bb05d`.
  - `public/demos/shore.html`: self-contained WebGPU golden-hour beach. No FFT:
    travel-time phase warp (`φ = ωt − 2ω/√(g·slope)·√(xs−x)`) for wavelength
    compression + slowing; Green's-law shoaling (d^−0.28, capped); Gerstner
    face-push steepening; trough-aware depth-limited breaking (H/d_trough).
  - 128-lane CPU swash sim: skewed oscillators (rise-fraction 0.42 → fast
    uprush/slow backwash), per-lane phase noise, wet-limit drying memory
    (0.55 m/s), uploaded to GPU each frame; sheet thickness = overshoot × slope.
  - Wet-sand darkening + bubble rings, clear shallows (depth alpha/absorption
    over the bed), golden-hour sky, sun-glitter path, free-fly camera.
  - Demos-page card added (`public/demos/index.html`).
  - `npm run shorecheck` (18 checks, 18/18): swash oscillation, uprush-faster-
    than-backwash (4.4 vs 2.7 m/s), wet-lag, GPU/CPU paired cross-check, foam,
    golden-hour pixels, camera reacts. Mutant (pinned waterline) → 5 RED.
  - Screenshots + 9-frame wave strip: `docs/shots/shore/` (reviewed & fixed 5
    look bugs before shipping, per the issue).

## Playable now
`https://jalfern.com/retrogames/demos/shore.html` (via `/retrogames/demos/`).
Note: jalfern.com 308s to www — poll prod with `curl -L`.

## Next queued
- Oldest game-queue: **#531 Online 2P: room codes + Cloudflare relay, lockstep**
  (multi-stage infra, pilot Gauntlet).
- #538 `QA — SHORE: polish pass` (feedback): break curl, foam-edge AA, surf
  sound, wet-front patchiness, dunes, distant swell, tod slider — QA lane.

## Lessons worth keeping
- This Chrome's WGSL lacks `dFdx` ("unresolved call target") → finite-difference
  normals; a rejected shader module kills the renderer black (mean lum=2) —
  the pixel stats say "dead renderer", not "bad art".
- Camera basis: right = (−fz, 0, fx)... sign errors flip the whole image
  (sky landed at the bottom; every region gate failed at once).
- Foam by still-water depth (`H/d0`) sits above threshold across the whole sea —
  include the trough: `H/(d0+min(η,0))`.
- Cross-lane phase tilt must stay well under π over the domain or lane-mean
  oscillation cancels (the harness averages lanes).
- Skewed oscillator must straddle 0 (`2·swave−1`) — a 0..1 swash never drains
  below the still line.
- Lane `vec3f` in a storage buffer = 16-byte stride; CPU packing of 3 floats
  silently misaligns every lane.
- Pair GPU readback with a same-frame CPU snapshot (`probeNow()` resolver);
  lanes drift ~1.7 m/s, so unsynced probes can't cross-check (and gates that
  compare counts must tolerate grid sampling: 2–5 cells, not "many").
- Shared WGSL chunks must not bake bind-group numbers (compute needs other
  group-0 resources); parameterize them.
- Glitter needs sun roughly opposite the view dir; sun-behind-camera = flat glass.
- Fresh worktrees need `npm install` (node_modules isn't shared; takes 3 s).

## Three questions for Jon
1. Demos have no registry entry — is the `/retrogames/demos/` page the only
   surface, or should SHORE (and OCEAN) be linked from the arcade footer/menu?
2. Foam-edge sawtooth (filed in #538): cheap analytic distance-to-waterline AA,
   or would you rather a dedicated high-res shallow-water texture (512² swash
   heightfield) — closer to "state of the art" the issue asked for?
3. The queue head is now infra (#531). Queue a fresh game title for the next
   forge lane, or start the 2P relay pilot?

## Housekeeping
- Main checkout: detached at the STATE commit this file is part of; `main`
  otherwise free for the rule-5 merge.
- Worktree `~/Dev/retrogames-forge-shore` removed post-merge.
- Dev server not started. Nothing dirty.
