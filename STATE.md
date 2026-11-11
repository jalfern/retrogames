# STATE — session 213 (2026-11-10, slot a)

## What shipped
**WATCH BATCH 23 — "THE LAST TWO ROADS"** merged as `12bf874` (PR #1962,
Part of #1637). Two titles seat their own proven route on Y:
- ROGUE — `watchStep(state)` lifted from roguecheck §6 INTO sim.js (stairs ->
  DESCEND, adjacent foe -> bump-attack, else BFS first step, no route -> honest
  release). Reactive every turn: seats anywhere, re-seats from live state. Node
  re-witness through the game driver: dlvl2 20/20, min food 1344. Turn-based
  seat = own 140 ms interval (no frame clock; entropy per typed move). First
  `__rogueTest` DEV hook (watching/probe/watchSfx/hash).
- METROID-LITE — script-INDEX junction (Paperboy law): replays `planRun`'s
  zero-hit win at `script[gs.tick]`, FRESH never-steered roads only; the seat
  RE-ANCHORS an unused road to the witness's tick 0 (deterministic makeGame —
  re-anchor is THE catch, see below). Steer -> droveRef closes the seat for the
  run, mid-route Y answers NO_GUIDE silently; relic win releases silently.
Chrome: WATCH_HELP x2, shared pill/toast/blips, Rogue named in SKIP_ATTRACT
(no attract), Metroid mounts attract ▶ WATCH. watchcheck pilots 234/234 +
235/235 (rogue pilot dug to dlvl 3 untouched; metroid full drive RELIC
RECOVERED 0 deaths energy 4/4 2150 pts) + 12 batch-23 source pins; 2 mutants
red as designed (droveRef drop -> 3 red; seat-mount gut -> seat/blip/advance
red). roguecheck 76/76, metroidcheck 49/49, watchphonecheck 443/443,
attractcheck 694, 3 lint gates + build green. Prod verified by CONTENT:
`index-U22epagg.js` carries both new registry markers.
Live: /retrogames/rogue, /retrogames/metroid.

## The session's catches
1. **A tick-indexed script seat must land at the witness's tick 0.** Seating at
   live tick N replaying script[N] is pose-desynced (script's own motion started
   tick ~2; walking right looked fine — shafts would not). House fix: seat on a
   fresh un-steered road calls `startPlay()` first (identical world, no history
   to lose), then replays from index 0. AttractWatchButton's +180 ms Y is then
   inside the idle prefix and honest.
2. **Seat decisions compute LIVE at the keypress, never from the per-frame pill
   mirror.** A rAF hitch can leave canSeatRef stale for ~2 frames (a mid-run
   re-seat slipped through once in-browser). Mirror gates the pill only.
3. **`gh api commits/<sha>/check-runs` 404'd right after the force-push rebase**
   (loop starved on empty). `gh pr checks` rollup DID show static=pass — fall
   back to the rollup when the api path 404s, don't spin the rule-5 loop blind.

## Ladder trail
- halt none; steer none; next #1711 hardware-stalled on Jon (verified 11-10 by
  slot b, skip); game-queue empty; QA MASTER live → feedback borrow refused;
  flagshipStage null → warden TARGET #1637 claim returned "already yours: resume
  it" (my slot's own lineage) → batch 23. No jonq (mechanical pick; no taste
  call came up).

## Session bookkeeping
- #1637 stays OPEN + `building` (multi-stage; batch 23 shipped, the issue's
  last comment carries the live URLs + post-b23 driver audit).
- :5173 vite left RUNNING from `~/Dev/retrogames-forge-watch-b23` (detached
  origin/main) — next slot-a session reuse or kill before strictPort.

## Next queued (slot a)
1. Fresh ladder: halt/steer/next/queue games-first; #1711 = 3 sessions of the
   same hardware stall (slot b's 212 says plainly: check comments for Jon's
   bucket, then checkpoint-and-release, no deep re-verify). Feedback only if
   no QA MASTER live; else flagship/never-dry.
2. **#1637 batch 24 = driver-building, not seat-finding.** Bare registry audit
   (post-b23): Pong/Asteroids/DonkeyKong/Centipede/Pitfall/Frogger have no
   proven in-game driver; FireCrew autopilot is 8/10 (below the 8/8 bar);
   DOS/IF titles sit behind js-dos. If the ladder still points at #1637, the
   honest move is to pick ONE title and ship its driver IN the game first
   (Rogue's BFS→sim lift is the template), then seat it next batch — or
   declare the rollout closed-to-new-titles and move the lane to flagship
   polish. The audit line is now in the b23 shipped comment.
3. QA-held items stay theirs (#1915/#1900/#1888/#1871 TMD, #1907 SI/DF, #1877
   FB, #1923 rail, #1925 carpet, #1950 SmashTV, #1943/#1908/#1891 papers;
   #1959 LODE chain-burials shipped as #1964 by slot b — my earlier note
   predates it).

## Notes for the next slot-a session
- :5173 vite runs from `~/Dev/retrogames-forge-watch-b23` (detached origin/main
  after merge, node_modules symlinked) — reuse or kill before strictPort.
- New-seat checklist unchanged (WATCH_HELP, top-anchored !paused pill, attract
  button or SKIP_ATTRACT name, shared blips logged, DEV probes, pilot + pins,
  mutant proof). Rogue joins SKIP_ATTRACT; metroid's pill mirrors canSeat.
- MetroidLite now HAS a README (was missing — AGENTS.md engine-notes law kept
  retroactively); Rogue README's check-count drift fixed to 76 — re-count after
  any roguecheck edit.

## Open questions
- None. (No taste/priority call needed from Jon.)
