# STATE — session 19 (2026-10-25)

## Shipped this session
- **VOLCANO demo** (#1043 → PR #1069, squashed to main as 1aefa73): WebGL2 night
  eruption — raymarched strato-cone lit only by its own lava (animated channels
  flowing to a white-hot crater pool, blackbody gradient, crust flicker, 8-sample
  LOS vent-lighting onto slopes), wind-sheared ash plume with below-lighting +
  altitude decay + internal lightning flashes, deterministic ballistic ember
  fountain (JS closed-form), hash-star sky + galactic band + horizon ember glow,
  vent-projected heat shimmer post, HDR→bloom→ACES. Synthesized rumble/roar/
  blasts. Live: jalfern.com/retrogames/demos/volcano.html
- `volcanocheck` (npm alias) 28/28 green: pixels + JS mirrors (ballistic embers,
  lava heat field confined to cone, plume density profile, pulse surge) + real
  drag/tap input gates + shimmer load-bearing via frozen-frame readPixels
  differential (mean |Δ| 3.6 lum). Proven-fail: hard-forcing shimmer off in
  FS_HAZE → gate red (Δ=0), all else green; restored by hand-sed.
- `creditscheck` extended to 9 demos (90/90).

## Playable now
- VOLCANO on the demos shelf and live — drag to look, tap for sound, credits card.

## Branches / harness
- forge/volcano branch deleted by squash; worktree `~/Dev/retrogames-forge-volcano`
  removable (`git worktree remove` — main checkout is detached at origin/main).
- Harness lessons (baked into volcanocheck.mjs comments):
  - A frozen scene must freeze *everything* — the camera lerp kept easing between
    "frozen" reads and let the mutant survive; setFreeze now also halts it, and
    only then was the shimmer differential honest.
  - Edge-energy is translation-invariant: a coherent shimmer shift barely changes
    it — the load-bearing probe must be a per-pixel diff of two consecutive
    frozen frames around a haze toggle (`diffHaze(want)` hook pattern).
  - The differential caught a real bug: screen-space projection of the vent used
    view-z where clip-w (−view-z) was needed — masks projected to sy≈46. State
    hook exposing the projection (`craterSS`) pinned it in one probe.
- New demos adopting screen-space effects should reuse the diffHaze deferred
  readPixels pattern (in-frame only; preserveDrawingBuffer stays off).

## Next candidates (unclaimed)
1. **#1070** — VOLCANO polish (lane:qa — QA lane picks; builders stay on games).
2. Game-queue: **#1050** DEMO CORAL REEF GPU rebuild; **#1047/#1048/#1049** BLACK
   HOLE stages (tap-probe / plunge / spin). Oldest next — #1050 coral reef GPU.

## Open questions
- none filed this session.

## Watch-outs learned
- Sign conventions between hand-rolled JS projection and the GL view matrix must
  be verified once with a state hook printing the projected point, not eyeballed
  from a "looks centered" screenshot (sy=46 vs sy=0.574).
- `smoothstep(e0>e1)` (reversed edges) is undefined in GLSL — it appeared to work
  but paired with the bad projection made mask debugging mislead; prefer
  `1.0 - smoothstep(lo, hi, d)` with lo<hi.
- vnoise vs fbm: swapping two fbm calls (crust/flicker) to single-octave vnoise
  bought the plume march + shimmer their frame budget back at no visible cost.
