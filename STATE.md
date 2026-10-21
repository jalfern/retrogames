# STATE — 2026-10-20 forge pm #3

## Shipped this session
- **#616 SHORE rewrite → prod** (PR #652, squash `409e822`,
  live at jalfern.com/retrogames/demos/shore). CPU swash lanes replaced by a
  GPU 2D SWE sim (141x351 @ 0.4m, 4 substeps) with eikonal travel-time
  refraction (Snell tilt 0.07→0.73 measured), cnoidal asymmetry, persistent
  advected foam (ping-pong + Worley lace, ~2.5 s half-life, proven to linger
  on dry sand), two-stream water colour, dual-lobe wet/dry sand PBR, caustics,
  meniscus, ocean-ported golden-hour sky.
- `scripts/shorecheck.mjs` rewritten: senses the water **through the GPU probe
  only** (no CPU lanes exist anymore). 25/25 green; sponge-zero mutant proven
  red (3 gates) and restored. Perf gate is headless-aware (SwiftShader ~70 ms
  at 1600x1000; old demo was ~88 ms on the same box).
- QA polish filed: **#654** (foam polka-dot, flat deep tone, camera framing,
  missing rip seeds). Labels `feedback` + `lane:qa` — QA lane picks it up, not
  builders (Jon 2026-10-19).

## Next goal
Oldest game-queue: **#637 FORGE — Shared 3D model shelf** (infra-ish; it's
labelled FORGE, take it or skip to #638 SSX mountain feel per the FORGE.md
tie-break). Queue: #637, #638, #639. Claim with `building` +
`lane:<x>`, worktree off origin/main, ship end-to-end.

## Gotchas learned this session (add to whichever doc fits if repeated)
- `jalfern.com` 308-redirects to `www.` — production content polls must use
  `curl -sL`; without `-L` the poll silently never matches.
- Issue labels: there is **no `done`** label — shipped work gets `shipped`
  (see #620). `building` removed on merge.
- shore.html tuning that mattered: inlet sponge band 18 m / strength 0.7;
  bore clamp at spd>celer2; film friction 0.012+0.45·exp(-h/0.09) — zeroing
  the sponge lets the box seiche swamp everything (that's the mutant).
- shorecheck trace needs ≥180 samples @ skip 12 before the cycle test is
  stable; shorter traces flake the set-catch gate.

## Board / harness status
- main: `409e822`, nightly green before merge (`main-ok.sh` ok).
- Rule 4: satisfied — #646 (Momentum Runner), #651 (QA), #652 (demo) are all
  game-code PRs in the last three merges.
- Rule 7: no open `waiting-jon` questions from this lane; none needed.
- Worktrees: `~/Dev/retrogames-forge-shore-616` removed. Main checkout
  detached at origin/main.

## Open threads
- **#654** QA polish for shore (lane:qa).
- #637/#638/#639 as above. Previous sessions' open questions, if any, are on
  the board with `waiting-jon`, not here.
