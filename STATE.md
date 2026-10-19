# STATE — forge session 2026-10-19 (COMET DRIFT elevation)

## Shipped this session
- **#518 COMET DRIFT: elevation — courses go up and down (HD first)** — PR #533, squash `4e1da16`.
  - `track.js`: per-course closed height profiles (`ELEV` anchors → uniformize →
    periodic Catmull-Rom → `p.h`/`p.grade`), h=0 at start/finish, auto-capped
    at 9.5%. Relief: Gulch 56px, Sandbank 125px, Corkscomb 186px (the drop).
  - `sim.js`: slope only — `v -= 0.42·grade·cos(heading−track)`. No jumps.
  - HD: all five ribbons ride the height (road/kerb/gutter/wall/plateau); arch,
    scenery, karts (+pitch, YXZ), shadows, particles, chase cam + collision all
    follow; floor plane dropped to -1.5u under the dips.
  - 2D: Mode 7 stays flat; smoothed ±6px horizon bob from grade+height.
  - Gates: relief/datum/seam/cap audits + downhill-beats-uphill speed proof per
    course; `--mutate` kills BOTH the lap gate and `slopeK` (RED 2/2).
    `cometdrifthdcheck` re-pinned: road matches height float32-exact; hanging/
    foot/rim checks now PER-INDEX (global min/max comparisons are meaningless on
    a hilly lap — that trap ate a whole probe round). cometplay retuned the
    drift-zigzag band (-45/-30, swap 6) for the new downhill slide speeds.
- #530 (camber/kerbs polish) updated with elevation-specific residuals + `feedback` label.

## Playable now
`jalfern.com/retrogames/comet-drift-hd` — Corkscomb drops 160px down the
hillside, karts pitch over crests, walls ride the terrain (PR body has crest +
dip shots). 2D twin at `/comet-drift` bobs its horizon on the same data.

## Next queued
- Oldest game-queue: **#521 DEMO 2 — Shore (lane:demos)**.
- #530 is the QA lane's polish pass (feedback), incl. real camber now that y exists.

## Lessons worth keeping
- Spline anchors at uneven lap fractions overshoot the grade (30%!) — resample
  onto a uniform knot grid first, then auto-scale the profile to a grade cap.
- Scaling heights mid-loop mixes scaled/un-scaled neighbours (grade 3.06). Two
  passes: scale, then grade.
- `Float32BufferAttribute` geometry ⇒ exact-float geometry gates need 1e-6
  tolerance, not 1e-9.
- Elevation breaks GLOBAL min/max geometry claims ("road flat", "walls 1.5–3.6u").
  Re-pin gates as per-index relations (wall-over-road, rim-over-road at each i).
- Elevation changes real physics: cometplay's key-timed drift slalom now slid
  into walls at downhill speeds — re-verify harness seeds against the changed
  physics in Node before touching browser waits.
- In `cometcheck`, `const sim = await loadSim()` sits AFTER the per-course
  header checks — new checks earlier in the loop need their own loadSim().
- `shot.mjs --eval` runs once then waits real-time; `__game.step()` while the
  contract holds the loop freezes the chase cam (tick World+cam are in the same
  rAF branch) — captures driven that way show the kart left behind. For camera-
  honest screenshots, let the attract autopilot run real-time.
- Prod-poll for a game change: match the lazy `sim-*.js` chunk (where sim code
  lives), not `index-*.js`.
- `gh pr create --body-file` uploads local PNG paths — crest/dip shots rode the
  PR body with zero extra steps.

## Three questions for Jon
1. #518 shipped HD-first; the 2D twin only bobs its horizon. Is a fake-3D
   elevation (Mode 7 scale/shear by grade) wanted for the retro twin, or is the
   horizon bob the permanent 2D answer and #530's camber HD-only?
2. Corkscomb's 186px drop auto-scaled the other courses down (cap 9.5%). Want a
   per-course relief budget (Sandbank flatter by design, Corkscomb steeper) or
   keep one uniform cap?
3. Slope currently bypasses the drift ladder entirely (no y-dependent grip).
   Should crests/dips interact with drift (less grip mid-air-ish over a crest?
   more bite downhill) or is "speed only" the right arcade law?

## Housekeeping
- Main checkout: detached at `4e1da16`; STATE.md committed here.
- Worktree `~/Dev/retrogames-forge-comet-elevation` removed post-merge.
- Dev server stopped. Nothing else dirty.
