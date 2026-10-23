Closes #829

**Was broken:** EMBERWOOD pinned its WebGL buffer to the logical 480x288
(`setPixelRatio(1)`, `antialias: false`) and the canvas CSS upscaled it with
`image-rendering: pixelated` — so on a phone or desktop every lighting
gradient, bloom halo, vignette and diorama edge came up blocky (#829: "too
pixelated — we know it can do better").

**The fix** (`src/games/Emberwood/render.js`, `index.jsx`):
- Full quality now renders at the canvas's CSS size x `devicePixelRatio`
  (dpr capped at 2, long side capped at 1280px for GPU sanity) — CI software
  boxes keep `?lite=1` pinned at the logical 480x288, unchanged.
- The scene pass runs with MSAA (`samples: 4` on WebGL2) so wall/sprite/portal
  edges stop staircasing.
- Canvas CSS drops `image-rendering: pixelated` off the lite path — at 1:1
  device pixels there is nothing to nearest-neighbour.
- Sprite/tile textures stay `NearestFilter`: the pixel-art identity is kept
  ("keep the gameplay as is"); only the raster density and edge AA change.
- Blur/bloom/vignette radii live in uv-space (`res` uniform stays logical), so
  the look is identical — just sampled at 2.9x more pixels (1280x768 vs
  480x288 at dpr2). A `resize()` re-derives buffer + RTs + camera aspect on
  window resize, with the aspect matched to the CSS box (no stretch).

**Harness that can fail** (`scripts/emberwoodcheck.mjs`, +3 gates, 99-node +
Chrome leg unchanged otherwise; now 128 total):
- full quality buffer >= 720 wide and > 2.2x the logical area — **red pre-fix**
  (buffer was exactly 480x288);
- buffer aspect matches the canvas CSS box (< 0.02) — camera keeps the same
  world window at any resolution;
- MSAA samples >= 1 when WebGL2 — **red pre-fix** (samples 0);
- `?lite=1` pinned at 480x288 (CI guard).

Mutation check: with only `src/games/Emberwood` reverted to main (gates kept),
the run goes red — `full quality renders at device resolution (buffer=0x0…)`,
`buffer aspect …` and the lite-pin gate all FAIL (the gates read a sentinel
buffer when the `renderInfo` hook is absent, so an old build cannot skip them
green); restoring the fix returns 128/0.

One harness-hygiene fix rode along: the #737 feedback SDK's relay `/status`
poll is CORS-rejected off jalfern.com by design; it started landing in the
zero-page-error gate as the session lengthened. The collector now ignores only
messages matching the relay URL (text or resource location) — every other
console/page error still fails the gate.

Proof: `emberwoodcheck` 128 pass / 0 fail (node 99, chrome leg +4 gates);
`lint:mario` / `lint:fps` / `lint:ai` / `build` all green.
No sim/solver files touched — determinism and gameplay provably unchanged
(node-leg 99 gates identical to main).
