# STATE — 2026-10-21 forge am #1

## Shipped this session
- **#668 SHORE: make it fast → prod** (PR #678, squash `35c1916`,
  live at jalfern.com/retrogames/demos/shore.html — DPR_CAP literals
  verified in the served file).
  - DPR capped at 2 (was uncapped; dpr-3 phones rendered 2.25x pixels for
    no visible gain) — the headline phone win, arithmetic-certain.
  - Offscreen render targets: canvas backbuffer pinned at CSS×dpr, never
    resizes; internal scale selectable via `?rs=0.55..1` (fullscreen blit
    upscale when rs<1; default rs=1 resolves straight to canvas).
  - Harness hooks: `perf()` reports rs/nsub, `grid().ns` live, `?nsub=` lock.
  - New `scripts/shoreperf.mjs` (`npm run shoreperf`): frame-time measurement
    desktop/qhd/phone profiles vs the real GPU adapter, leak-proof kill
    (process-group + profile pkill).

## Backed out (measured, with evidence — see PR #678 body)
- **nsub governor**: dt=1/120 is the CFL edge of the 0.4m grid — swash depths
  inflated to 4m+ and shorecheck trace gates broke deterministically.
- **Adaptive-resolution governor (1→0.9)**: starved probe readback under GPU
  contention (trace gates red while the locked build was 26/26); no measurable
  fps win. Blit plumbing stays so rs<1 is lockable without canvas resize.
- **Per-pixel shader trims** (waterAt dedup, forward-diff normals, gated
  churn/vnoise): fewer ops on paper, correlated with slower frames under
  contention; reverted. Retry recipe in follow-up issue.

## The lesson of the session
- The box runs local LLM inference (omlx-server) + other lanes' Chrome
  harnesses on the SAME Metal GPU. Absolute fps numbers there are fiction;
  leaked headless Chromes from failed boots made it worse. Interleaved A/B is
  the only honest local measurement; shorecheck/CI are the real gates.
  shoreperf now kills its whole process group — keep that pattern.

## Next goal
- Game-queue at session end: #669-#674 (SSX surfaces + 4 demos) + #668 was the
  only `next`. Oldest game-queue = **#669 GAME — SSX: real snow and rock
  surfaces** (lane:games) — unless a steer lands. Jonq #635 (AWAITING) default
  says builder keeps taking queue items whatever the lane.

## Gotchas learned this session
- `pgrep -f "user-data-dir=/tmp/forge"` before AND after any Chrome harness
  session; leaked headless instances hold the GPU and invert every measurement
  (a 0.55x render "running" at 82ms vs 21ms full-res was contention, not
  physics).
- A shorecheck failure that reproduces with your file but not with
  origin/main's, at the same moment, IS your regression even on a noisy box —
  the locked-copy bisect (disable one feature via sed, re-run) localizes it.
- #676 (QA) merged mid-session: shore.html grew box-smoothers + struct cov.
  Always `git fetch` + rebase before claiming; the base moved.

## Board / harness status
- main: `35c1916` (this lane's merge) + others; nightly ok at merge.
- Rule 4 satisfied (demo shipped). Rule 7: no new jonq needed (nothing this
  session needed taste/priority).
- Worktrees: forge-shore-fast-668 removed; main checkout detached at
  origin/main.

## Open questions
- #633 (lane:games) SSX rider 5 duplicate body — awaiting Jon.
- #635 (lane:platform) builder takes demos/platform queue items? — AWAITING
  (default in effect: keep taking them).

## Open threads
- #680 QA — SHORE perf follow-ups (quiet-box shoreperf numbers, shader-trim
  retry, nightly shoreperf job) — filed this session, lane:feedback.
- #675 QA COMET DRIFT HD scenery polish, #665 QA SSX mountain-feel,
  #657 QA shelf polish — still open (QA lane's).
