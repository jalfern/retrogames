# STATE — forge board snapshot (slot a, 2026-11-22 2nd wave — shipped + freeze cleared)

## This session shipped
- **R-TYPE volley pre-dodge is LIVE** (#2951 → PR #2955 → main `b779123`,
  prod-verified: served `RType-ZZwRkIbo.js` carries `volley:1}` + both brain
  reads). Re-validation here (rtypecheck 234/234 incl. the on-screen marked-fan
  leg; mutants 231/231, `pre-dodge-deaf`/`cross-blind` red-by-design; no file
  overlap with main since base) + merge by the slot-a sibling run at 18:59.
  #2951 closed, `shipped` label fixed (it was left `building`).
- **Main-fix #2965 filed & closed as duplicate**: nightly `45045144722` re-red
  on watchcheck's FLOORBOSS watch pin — #2954's tap bank (`tapPad`/`step`/
  `recordLiveTick`, ~206 chars) outran the pin's 200-char window. Honesty rule
  verified intact on main (`ap(gs)` pad is `recordTick`'s FIRST arg, only call
  site); pin still REDs against the real lie (`recordTick(livePad(), …)`).
  Sibling #2962 (`d10493a`, same fix) merged first → #2965 closed, branch gone.

## Playable on main right now
- `/retrogames/r-type` — volley pre-dodge LIVE (this session, prod-checked).
- `/retrogames/floor-boss` — career takes #2958 (`ff6f58f`, sibling lane) + S2
  tap recording (`d7ff731`).

## Main / nightly state (verify before merging anything)
- `main-ok` passes: latest completed nightly = CANCELLED (not failure).
- In flight at close: nightly `45057066348` on `d10493a` (does NOT contain
  volley/career-takes), dispatch CI `45062646884` + nightly `45062897047`
  dispatched BY THIS LANE on HEAD `9127f4e` — the tip-true evidence. If the
  HEAD nightly goes red, that's a real regression on b779123/ff6f58f, not the
  stale-SHA kind.

## Board at close
- `game-queue` empty. `building` = #1712 only (big-build, store-blocked; the
  two open lines are HUMAN takes — see #2953, check outbox before code).
- `feedback` = #2952 (R-TYPE dodge-wink + wingman cover-fire) — QA lane.
- Ladder for the next lane: run `scripts/idle-kick.mjs` fresh — two games' gap
  lists changed today (R-TYPE gap 0 and FloorBoss gap 0 both shipped).

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (due 11-23,
  default keep private).
- #2953 — friend-takes invite flow vs Jon collects; default widen adapters.
- #2908, #2930 (QA lane) — DD seat laws (due 11-24).

## Ops anomaly (reported on #1258)
Two slot-a runners were active ~18:40–19:00: the sibling rebased+merged my
#2955 and wrote a slot-a STATE close-out (16c8211) while this session waited on
#2965's static. Work is consistent and no double-merge happened, but the
double-kick wasted one PR (#2965 vs #2962) and one full watchcheck pass.

## Harness notes (new this session)
- **200-char source windows rot when games grow.** Both of today's reds were
  calibration (frogger floor #2957, FB window #2962/#2965), not laws. Prefer
  anchoring pins on unique call-site tokens over distance windows; if a check
  reds after an unrelated merge, count the gap before assuming regression.
- **pull_request CI still misses lane PRs** (#2955, #2965): only Vercel shows.
  Workaround: `gh workflow run ci.yml --ref <branch>`, gate on the head-SHA
  check-runs API for `static`.
- **`npm audit fix` #2960 changed the lockfile on main** — the STATE
  "cp -cR node_modules" trick now requires lockfile equality against CURRENT
  main, not yesterday's. A stale clone passes boot but can differ under test.
- **nohup'd vite servers die silently after ~10–20 min** (twice today, no
  error in vite's log; suspect macOS reaper/jetsam). Drive suites while the
  server is fresh; a wall of `DEV hook present` FAILs = dead/reloading server,
  restart + rerun, not game bugs.

## Slots / ops
- Slot a dev server 5173 stopped with `scripts/devstop.sh`; no lane ports
  touched. Volley + watchcheck worktrees removed; main checkout detached at
  `9127f4e`; STATE.md committed this session (#2955 merged ✓).

## Next lane starting here
- If the HEAD nightly `45062897047` is green: ladder → #1712 store check →
  idle-kick for the next POLISH issue. If red: red-main rules, fix before all.
