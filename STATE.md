# STATE — forge session 2026-10-19 (SHORE: perf + coherent swash + AA)

## Shipped today
- **#521 SHORE demo** — PR #537 `a7bb05d`: WebGPU golden-hour beach (travel-time
  phase warp, Green's-law shoaling, Gerstner steepening, 128-lane CPU swash sim,
  MSAA-free v1). `docs/shots/shore/`.
- **SHORE perf: one-lane shore()** — PR #539 `2e0ab1f`: `shore()` copied the
  whole lanes array (2 KB) per call ×4/fragment → <1 fps at full window. Now
  takes the one lane `vec3f`; shorecheck gates frame time at full window
  (1600x1000, `--max-ms 20`, `__shoreTest.perf()`): 16.67 ms avg (vsync cap).
  Mutant (by-value) 72.9 ms → RED.
- **#538-partial SHORE: foam-edge AA** — PR #557 `e488dda`. Root cause of the
  sawtooth was in the SIM: `laneAmp[i]=0.72+0.56*hash1(i)` + `lane*2.399`
  phase = independent per-lane noise = 1.1 m sawtooth on the foam line
  (measured mean|Δxw| 2.96 m/lane, 97 reversals). Now smooth alongshore
  sinusoids + ~6.6 m block phase jitter → 0.40 m/lane, 7 reversals; new
  shorecheck gate "waterline coherent alongshore" (mutant RED). Plus AA stack:
  low-pass+Catmull-Rom `laneAt` (sand/water; probe keeps nearest so gates stay
  exact), model evaluated at unshifted base coords, distance-to-waterline alpha
  ramp (~2 px world, no dFdx), 4× MSAA resolve, gradient noise (quintic),
  bed-ripple damp within 2 m of the still line. shorecheck 20/20.
  Residual ~8 px mesh-period scallop documented in #557/#538: survives
  noise-off/foam-off/depth-off/MSAA → grazing fresnel/facet banding; honest
  fix = adaptive alongshore grid (geometry), left to the QA lane.

## In flight (other lanes)
- **COMET DRIFT #542** (3× grown world + camera) sits on
  `forge/comet-drift-hd-542` — STATE notes for it were on main earlier; the
  PR is not filed yet (other CPU). Its lessons are folded below.
- **#538 QA — SHORE polish** (curl, surf sound, wet-front patchiness, dunes,
  distant swell, tod slider, + fresnel-scallop follow-up): QA lane's — this
  builder lane does not take QA tasks (Jon, 2026-10-19).

## Playable now
`https://jalfern.com/retrogames/demos/shore.html` (smooth: perf fix + AA
live), plus the arcade (`/retrogames/`). jalfern.com 308s to www — `curl -L`.

## Next queued
- `gh issue list --label game-queue` is EMPTY (rule 2: don't invent work).
  Oldest game-queue #531 (Online 2P relay) was merged/closed out; awaiting
  Jon's next title.

## Lessons worth keeping
- **Independent per-lane noise is a sawtooth generator.** Any array-sampled
  field (1.1 m lanes) must be coherent at ≥ a few samples; amplitude/phase
  "texture" belongs in the shader noise, not in lane-indexed hashes.
- **Identical output across edits = stale cache**, even `file://` with a fresh
  profile: bust the URL (`?v=`) or you'll debug a render you already fixed.
- **A pixel metric that can't distinguish mutant from fix is not a gate** —
  shipped without it (rule 6), kept the lanes() one that can.
- WGSL copies array-typed params by value; hot calls take the indexed vec3f.
- WGSL resolve of MSAA goes through the render pass `resolveTarget`; a
  copyTextureToTexture out of a sampleCount>4 texture renders black.
- `smoothstep` over depth can't AA a geometric silhouette; only raster MSAA or
  a denser mesh touches mesh-vs-mesh intersections.
- Value noise with cubic fade only C1: its lattice creases read as 0.45 m
  teeth at grazing angles — quintic/gradient noise for edges.
- (comet) A lap crossing IS a half-lap jump: unwrap into an odometer.
- (comet) Grow a world and re-derive all absolute-coords scenery from live
  bbox; audits prove it, not the eyeball.
- (carried) Cross-lane phase tilt ≪ π; foam needs trough `H/(d0+min(η,0))`;
  storage `vec3f`=16 B stride; pair GPU readback with same-frame CPU snapshot.

## Three questions for Jon
1. game-queue is empty — next title for the forge lane? (#531 relay is closed;
   is the 2P relay still the direction, just un-issued?)
2. Shore fresnel scallop: OK to hand the adaptive-z-grid fix to the QA lane,
   or want forge to take it once the queue refills?
3. Demos-only surface is now law (AGENTS.md) — should OCEAN/shore get a card
   refresh on the demos page next, or leave demos frozen while games scale?

## Housekeeping
- Main checkout: detached at `origin/main`; no local `main` anywhere (rule 5).
- This lane's worktrees (`forge-shore-perf`, `forge-shore-foam-aa`) removed
  post-merge; comet worktree belongs to the other lane.
- Dev server not started. Nothing dirty.
