# STATE — session 216 (2026-11-10, slot a)

## What shipped
**SMASH TV: VARISIZE ARENA + CAMERA** merged as `52d76d6` (PR #1977,
Closes #1973 — NEVER-DRY pick, weakestStage score 4). Rooms 5 and 8 of
every stage (`BIG_ROOMS = new Set([4,7])`, levels.js) now board 24 cols =
384px against the 192px screen; the generator mirrors its wall pattern
across the wide board and `exitsOf(gw)` puts the far door at x≈368. Every
boundary rule in sim.js (blockedPx, bullets, civilians, boss pace+adds,
checkExit) reads `boardW(gs)`, never the screen. index.jsx gained a snap
camera (`camX` clamps `[0, boardW−192]`, board-space walls/lights/combo);
renderer-only — stateHash untouched, determinism pins hold. Standard rooms
stay byte-identical (camX pinned 0, exit x=228 unchanged).
smashcheck **PASS 547**, mutants **15/15 die** (4 new: board-shrink,
far-door-forget, BIG_ROOMS-empty, mirror-dead). smashplay **24/24** incl.
pixel camera proof: studio floor where the screen-edge wall stood, far
chrome on the clamp, flush pins in standard rooms.
Also: planner seat-1 lane-alignment doctrine (#508 extended to the wide
board — killed seed-5's 56k-tick deadlock) and boss-room firebomb at ≥1
add out (was ≥3 non-boss). Live: jalfern.com/retrogames/smash-tv.

## Honest pilot floor (pin + README move together)
Solo **8/9** — seed 3 is a documented FORCED LOSS (fan attrition at
ANNOUNCER; smashcheck pins `wins.length===8 && !wins.includes(3)` AND
`deathless.includes(6)`). Seed 6 deathless matinee. Co-op **9/9**. Boss
jink kept ORIGINAL doctrine — volley-commit, round-relative, crosser-aware
and bottom-pocket variants all A/B-measured; each rescued one seed by
losing others. Any layout change = re-measure + pin/README update together.

## The session's catches
- **Prod-verify fingerprints must be NEW numbers.** `?24:16` and friends
  matched KOOPA heights from Mario first; the honest markers were the big-
  board-only coords 356/368/384 (each exactly once) + Vercel success on
  the merge sha. DEV probes (`boardW`, `camX`) never ship — don't grep
  prod for them.
- **Autopilot deadlocks are lane problems, not courage problems.** Seed 5
  dueled a pinned walkcam for 56k ticks; the fix was doctrine (align to
  the firing lane before committing), not faster dodging.
- Boss jink A/B sweep: 4 doctrines, all measured over 9 seeds × solo +
  co-op; kept the original because "rescue one, lose one" is a wash.

## Ladder trail
- TARGET #1637 claim REFUSED (slot b held it minutes earlier — never touch
  another slot's lock) → #1972 also slot b (papers portrait, later shipped
  as session 215) → #1711 skipped (5th confirm already posted by b) → QA
  MASTER live (pid 88023) → no feedback borrow; flagship stage spent (all
  flagship READMEs 0 gaps) → idle-kick answered weakestStage SMASH TV
  score 4 (registry-oldest of tie), gap #1 = varisize board/camera.
  Filed + claimed #1973 (a). No jonq (mechanical picks).

## Session bookkeeping
- #1973 CLOSED shipped; QA polish pass filed as **#1978** (pan jitter at
  pin threshold, wide-room civilians/target layout, HUD combo placement,
  wide-door shutter sfx, zoom-out feel comparison vs cabinet).
- :5173 vite KILLED at session end; worktree `~/Dev/retrogames-forge-
  smashtv-cam` (detached at 52d76d6, node_modules symlinked) reusable or
  `git worktree remove` anytime. Old `~/Dev/retrogames-forge-watch-b24`
  also still removable.

## Next queued (slot a)
1. Fresh ladder: halt/steer/next/queue games-first; SMASH TV polish goes
   through QA (#1978) — builder stays off polish unless asked (#1019 rule,
   Jon 2026-10-19).
2. SMASH TV remaining README gaps (seat-2 aim assist, stage-1 bonus
   timer tuning) are gap #2/#3 — idle-kick will re-rank; don't trust this
   list.
3. If a varisize follow-up lands: BIG_ROOMS is the single knob; a
   taller-room axis (GH_BIG) reuses the whole camX pattern vertically.

## Notes for the next slot-a session
- Big-room doctrine lives in ONE place: `roomGw(idx)` (levels.js). A new
  room size = GW_BIG/BIG_ROOMS + re-run smashcheck geometry (it derives
  widths from probe `gw`, don't hardcode 256 in new gates).
- smashplay camera gates force room 4 via `__smashTest.stepWith` walks
  with `spawnT=1e9` — copy that idiom, don't fight the autopilot for keys.
- Camera is renderer state: never let draw code write anything the sim
  reads (stateHash would drift and determinism pins fail at the source).

## Open questions
- None. (No taste/priority call needed from Jon.)
