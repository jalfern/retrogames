# STATE — 2026-10-21 forge pm #2

## Shipped this session
- **#670 DEMO: CAMPFIRE → prod** (PR #692, squash `fea79f8`, live at
  jalfern.com/retrogames/demos/campfire.html — served page contains the
  `__campfireTest` hook). Single self-contained WebGL2 file, ~800 lines:
  - Raymarched flame: domain-warped ridged-fBm density, lobed tongues that
    breathe and tear at the tips, blackbody emission, Beer-Lambert
    transmittance; flicker + surges driven from JS so the harness senses it.
  - Cast light: flickering warm point on noise-bumped dirt, soft SDF shadows,
    12-stone ring + log tipi, coal-bed glow, sheen spec. Embers (instanced
    additive, swirl + wind + twinkle), wispy smoke, stars + treeline, HDR
    (RGBA16F) + bloom + ACES + grain, synthesized rumble/crackle (click-unlock).
  - Harness `npm run campfirecheck` (local alias, like shorecheck — Chrome over
    CDP): 18 gates static/boots/flame/core/flicker/cast-light/dark-far/sky/
    stars/embers/camera/budget/zero-errors. Mutant proof: zeroing emission →
    4 gates red.
- **MAIN FIXED: #601 freeze broken** (PR #693 `e7548e6`): nightly red was a
  surviving Gauntlet #505 mutant — pace gate (2.0) too loose to distinguish
  prediction (worst gap 0.18) from mutant (1.05); tightened to 0.5, nightly
  re-run green, freeze lifted, then #692 merged.
- Polished pass filed: **#695** (QA CAMPFIRE). Platform bug filed: **#696**
  (host proxy serves stale /demos/ index — SHORE/OCEAN cards also invisible;
  demo files themselves proxy fine).

## The lesson of the session
- A gate that can't distinguish 0.18 from 1.05 is decoration — thresholds
  picked for an old failure mode (3.4 yo-yo) go blind once the fix lands.
  Measure both sides when setting a bound.
- `smoothstep(e0>e1)`-style inverted ramps and 3-arg `vec4(…)` constructors
  silently kill a shader under ANGLE; always confirm a debug probe actually
  compiled before believing its answer (two black dbg frames were the probe,
  not the fire).
- Pixel-only gates found a real harness bug this session: JS counters passed by
  value into a scan helper always read 0.

## Next goal
- Oldest game-queue: **#671 DEMO — Mountain range at sunrise** (lane:demos)
  unless a steer lands. jonq #635 AWAITING default in effect (builder takes
  oldest whatever the lane).

## Gotchas learned this session
- main-ok.sh reads the Nightly **conclusion** — advisory `full-smoke` inside
  nightly.yml can keep a freeze up after full-static is already green.
- Another live lane (QA MASTER pid) mutates Gauntlet files in the main
  checkout *while running gauntletcheck mutants from there* — rolling
  one-file dirt is their mutant plant, not a corpse; don't restore it, don't
  touch it; scope commits to STATE.md only.
- Demos: demos/index.html cards need `id` + `base + '<file>.html'` wiring;
  prod index freshness is blocked by #696 (host cache ~2.7 d).

## Board / harness status
- main: `fea79f8` (CAMPFIRE). Nightly green at merge (dispatched after #693).
- Rule 4 satisfied (game code merged). Rule 7: no new jonq (no taste calls;
  #696 is plumbing, filed as feedback).
- Worktrees: forge/campfire-670 (this lane, to be removed),
  forge/gauntlet-pace-505 (merged, remove). Main checkout detached at
  origin/main, Gauntlet files dirty = live QA session's mutant plant (see
  gotcha), NOT to be restored by this lane.

## Open questions
- #633 SSX rider 5 duplicate body — awaiting Jon.
- #635 builder takes demos/platform queue items? — AWAITING (default in effect).
- #634 red heist-nightly blocking? — AWAITING (default: advisory).

## Open threads
- #695 QA CAMPFIRE polish, #685 QA SSX surfaces, #696 demos-index platform —
  QA/platform lanes'.
- Stale `origin/forge/ssx-cpu-riders-620` branch (shipped long ago) — prune?
