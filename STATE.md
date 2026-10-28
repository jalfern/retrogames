# STATE — session 37 (2026-10-28)

## Shipped this session
**STICK WALK** (#1150, PR #1177, squash `167d713`) — resumed a dead session's
corpse (gait core was pushed; renderer+harness were uncommitted in-flight).
Live: https://jalfern.com/retrogames/demos/stickwalk.html (demos law: index only,
never games.js).

- `public/demos/stickwalk.html` — studio renderer: perspective grid clipped at the
  camera near plane, depth-shaded white bones + amber joint dots (cyan feet), planted
  contact shadows, orbit/drag camera, attract autopilot circles, telemetry
  (speed/gait/Froude/slip), synthesized heel/toe footsteps, phone pad, credits card.
- `scripts/stickwalkcheck.mjs` + `npm run stickwalkcheck` — 47 gates
  (boots/rules/pixels/smooth/attract/phone/law), 47/47 twice local, proven-fail
  mutant: contact-ride turns slip gates red (170–330 mm) at every speed.

## Main-red fix (#601 freeze, lifted this session)
Nightly failed `missileplay` (cityHit gates). Root cause: DEV `quiet` stage emptied
the queue but the sim's auto wave-clear still fired on empty sky, wiping planted
warheads on slow CI frames (reproduced at 20x/64x CPU throttle). Mine (`hold` flag,
PR #1173) and QA's sentinel-queue fix (#1176, merged first) solved it independently;
#1173 closed redundant. Nightly rerun green → freeze lifted.

## Hard-won renderer facts (the corpse's silent-NaN trio)
- `sim.pos` is `[x, z]` — grid/floor code indexing `center[2]` gets `undefined`;
  the grid and body shadow shipped invisibly for a whole draft.
- Lines spanning the camera must be clipped at the near plane, not dropped when an
  endpoint projects null (every ±9 m line then vanishes).
- Joint dots/bone widths must derive from metres×focal/z; fixed constants produced
  68 px bones (a blob person). Gate thresholds recalibrated with the art.

## Next goal
No queued claim left verified this session. #1150 closed; check the forge board
(https://jalfern.com/retrogames/forge) — TEN-DEEP next stage, #1179 is QA's (not a
builder lane task per 2026-10-19 decision).

## Environment notes
- Box heavily loaded; `--no-speed` local mode for stickwalkcheck (CI runs full).
- :5173 belongs to a stale dungeon-renderer lane worktree; this session used :5176.

## Open questions for Jon
(none filed this session)

## Carry-over
- #1179 QA — STICK WALK polish pass (head silhouette, arm depth sort, grid fade…).
- TEN-DEEP stages 1–3 shipped (#1137/#1153/#1159) — next stage: check board.
