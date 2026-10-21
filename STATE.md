# STATE.md — 2026-10-21 (forge session close)

## Shipped this session
- **MOUNTAINS #671** — raymarched dawn range demo, live at
  `https://www.jalfern.com/retrogames/demos/mountains.html` (PR #709 squash-merged,
  Vercel SUCCESS, issue closed + `shipped`).
  - WebGL2 heightfield raymarch: 1024² bake (R16F single-fetch when
    `EXT_color_buffer_float` allows, hi/lo RGBA8 pair fallback), domain-warped ridged
    fBm, clustered near range + farther second range, carved lake basin.
  - Low sun **into frame** (az −0.55); all warmth driven by `uSunCol` — sky horizon
    glow, fog tint, rock alpenglow, lake glitter. Shadow-march near, smoothstep far.
  - Sphere-traced steps (`clamp(hd*1.4,…)` — overshoot caused stair-stepped skylines);
    distance-driven mip LOD (dt-driven LOD sampled mip-4 at distance = blocks).
  - HDR + threshold bloom + ACES; wind + dawn birds on click; drag-to-look + idle drift.
- `npm run mountainscheck` — 18 pixel-sensed gates, **mutation-proven**: cool-sun
  mutant zeroes alpenglow (11k → 0 px) and horizon glow (28k → 532 px). Alpenglow
  gate needs warmth across ≥8 of 15 frame sections (a sun-bloom halo alone can't pass).

## Next goal (claim fresh)
**#674 DEMO — Credits card on every demo** (oldest `game-queue`; Jon #635-A: whatever
lane). Then #672 Thunderstorm (also `stalled` — check why before claiming).

## Perf reality of this box (don't relearn)
- Headless Chrome rAF pacing here swings 33–66 ms **at blank page**; load-avg 11 during
  this session. mountainscheck perf gate (best-of-3 windows, ≤45 ms) measured 30 ms
  idle and 47–94 ms under load on identical code. It is advisory-grade: green idle,
  flakes red under contention — treat red-perf as rerun-once, per repo rule 3.
- Calibration trick that cracked it: `about:blank` rAF interval is the floor; compare
  demo ms against it before blaming the shader.

## Harness lessons this session
- GLSL: `max()` is 2-arg only (3-arg compile fail); dynamic `textureLod` pair cost
  ~25 ms/frame vs single texture at 0.18MP — R16F single-fetch + `EXT_color_buffer_float`
  works on ANGLE/Metal incl. `generateMipmap`.
- Gates must survive their own mutation story: fog-tinted pixels passed the alpenglow
  gate at zero sun-diffuse — fixed by linking sky glow color to `uSunCol` and requiring
  warmth breadth; then a cool-sun mutant fails both warmth gates cleanly.
- games.js demos-law gate: match `path:'…mountains` / `label:'Mountains'`, **not** the
  bare word "mountains" (SSX/IceBoulder prose false-positives).
- `label deployed` doesn't exist; board convention is `shipped`.

## Open questions / blockers on the board
- #687 nightly red — `needs-approval`; `scripts/main-ok.sh` will refuse merges while
  it stays red. First thing next session: check if main's nightly recovered (or the
  approval landed); a red main freezes all lanes (#601).
- #698 waiting-jon: who owns the demos driver (unanswered).
- #696/#694 platform: host proxy serves `/demos/` index stale (two issues, one dup).
- #691 waiting-jon: harness-fix exception for #687.

## Environment notes
- Worktree `~/Dev/retrogames-forge-mountains` on branch `docs/state-mountains`
  (this STATE.md PR). Main checkout must stay detached at `origin/main` (Jon rule).
- `node_modules` symlinked into the worktree for playwright-core access.
- Latest main: `1227a95` (#709). nightly: last check green pre-merge; re-verify.
