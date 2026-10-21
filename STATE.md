# STATE — 2026-10-21 forge pm #1

## Shipped this session
- **#669 SSX: real snow and rock surfaces → prod** (PR #682, squash
  `f2f10f2`, live at jalfern.com/retrogames/ssx — prod chunk
  index-Q18zGN6c.js contains the new palette). README engine-notes
  follow-up PR #686 (`7401af9`).
  - Snow: wind cords (vertex + tiling detail texture), crust cracks, grit,
    lit/shaded lumps, sparkle pinpoints on flat lit snow (additive overlay
    sharing terrain buffers, global twinkle pulse). Carved tracks kept (#310).
  - Rock: natural-slope reveal (featureLift excluded — the #638 lesson),
    ridge crag banding, bedding planes + fracture blocks, snow-on-ledge
    relax, masked to beyond piste |x|>=1.5.
  - New gate `npm run ssxterraincheck` (30 checks, wired into CI static);
    mutant proof: re-including featureLift in slopeAt goes red on
    "kicker flank" + piste continuity.
  - QA polish pass filed: **#685** (feedback).

## The lesson of the session
- The renderer treats vertex colours as LINEAR (SRGB output): every authored
  palette lifts ~a stop. Day rock authored dark (82→42) or cliffs read as
  grey plastic — screenshots caught what numbers couldn't.
- Structural gates beat tuned gates: masking rock to |x|>=1.5 made the
  no-speckle continuity gate pass by construction instead of by tuning.
- Third probe on the same "flat wall" symptom: MEASURE surfaceInfo on the
  visible columns instead of guessing — revealed the palette wash instantly.
- Commit before running mutants; `git checkout --` reverts to the last
  commit and eats uncommitted tuning (it nearly ate this session's).

## Next goal
- Game-queue at session end: #670-#674 (5 demos: campfire, sunrise range,
  thunderstorm, credits card…). Oldest = **#670 DEMO — Campfire at night**
  (lane:demos) unless a steer lands. jonq #635 AWAITING default in effect:
  builder keeps taking the oldest queue item whatever the lane.

## Gotchas learned this session
- jalfern.com/retrogames/ 308-redirects to www.jalfern.com — poll the
  canonical host; the arcade index is a 780KB loader, game code lives in
  lazy chunks enumerated by `__vite__mapDeps` — grep every chunk for the
  marker, not the index.
- ssxmountaincheck/ssxterraincheck run buildTerrain in Node: canvas-texture
  builders need a `document` guard (HAS_DOM) or the gates crash.
- DEV hooks `__ssxTest.seek(m)` / `.heat(n)` (added for the shot hunt) —
  reusable by QA; countdown is 3s+ so browser probes must wait ~5.5s
  before checking speed/carves.

## Board / harness status
- main: `7401af9`; nightly green at merge (main-ok passed twice).
- Rule 4 satisfied (game code shipped). Rule 7: no new jonq (nothing needed
  taste/priority; polish wishes went to #685 instead).
- Worktrees: forge/ssx-snow-rock-669 removed; main checkout detached at
  origin/main; no leaked /tmp/forge Chromes (checked before and after).

## Open questions
- #633 (lane:games) SSX rider 5 duplicate body — awaiting Jon.
- #635 (lane:platform) builder takes demos/platform queue items? — AWAITING
  (default in effect: keep taking them).
- #634 (lane:platform) red heist-nightly blocking? — AWAITING (default:
  advisory per rule 3).

## Open threads
- #685 QA SSX surfaces polish pass — filed this session (lane:feedback).
- #680 QA SHORE perf follow-ups, #675 QA COMET DRIFT HD scenery,
  #665 QA SSX mountain-feel, #657 QA shelf polish — QA lane's.
