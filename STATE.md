# STATE — session 322 slot b close-out

## Shipped this session
- **#2587 → PR #2591 merged (`c52a3c6`, live). EXCITEBIKE — TEST RIDE.**
  The bay's missing esc-to-the-bay: a TEST tool (between BOOST and ERASE, so
  the strip's backward wrap still lands on EXIT) compiles the CURRENT draft
  through SAVE's exact compiler + `auditCustomData` (illegal draft refuses by
  name, bay never leaves), then seats `makeGame(TRANSIENT, { laps: 1 })` — one
  unsaved lap of your own terrain, rivals included, badge painted. `Esc` or the
  lap line returns to the bay with stamps/cursor/tool intact; over screen +
  leaderboard stay the league's. `TRANSIENT` (-1) is a levels.js alias resolved
  by `track()` BEFORE the CACHE wrap — every course-reader (sim/planner/
  renderer/rivals) rides it honestly while the splash roster never grows a
  phantom row (gates pin `customs`/`rows` and the shipped-six fingerprints).
  Gates: excitecheck **317/317** (+12 TEST: refusal-before-seating, SAVE
  byte-identity, one-lap WOT finish, determinism, roster-leak, alias-wrap
  restored on clear); `--mutate` **381/381**, all die; flatten-transient
  mutant reddens the identity gates (by hand, restored). exciteplay **84/84**
  (:5178 real keys — TEST seats `track=-1 laps=1`, Esc returns draft-intact,
  warp-to-line finishes to the bay, rows stay 8, empty draft refuses by name;
  zero page errors). eslint + lint mario/fps/ai + build green. Prod verified:
  live Excitebike chunk `index-D-fZySeH.js` carries the ride markers.
  QA #2573 told: gap 1 fully closed; new candidates 7 (no on-screen Esc for
  phones mid-test) and 8 (splash-seated customs keep the save-and-race gate).
- TARGET **#2579 claim SUCCEEDED** (slot a's newest claimed/checkpoint marker
  was 93 min stale — their later comments were bookkeeping, which the lockout
  law ignores by design) — but stage 2 (single-row hangs) is design-gated on
  jonq **#2585** (AWAITING, default B, deadline 2026-11-19T10:55Z). Per #605
  the lane never waits on a ruling and must not pre-empt it: checkpointed #2579
  (`building`, slot b) and took the #1571 never-dry pick instead.

## Next queued
- **#2579 is slot b's held issue** — resume = `forge-claim.sh 2579 b` (answers
  "already yours" while fresh) then check **#2585**: ANSWERED A → build stage 2
  (law/gates/doctrine shaped at `a002199` — recover via
  `git fetch origin pull/2583/head`; tempo-constant widening is all that's
  left); ANSWERED B **or defaulted B after the deadline** → record the ruling
  on #2579, keep stage 1 (`a3efd02`) as the shipped law, label shipped + close.
  Do not build single-row hangs while #2585 is AWAITING.
- `game-queue` empty at close; `next` = **#1711** (lane:platform — games-lane
  no-op, precedent 314–319); QA lane live (feedback borrow refused; #2561
  building-qa held). Idle-kick at close = **`KICK SONAR ABYSS -1 weak`** —
  NEW index `-1`: inspect what `weakestStage` scored (likely feedback-driven,
  not a README gap index) before filing; do NOT blindly file "gap 0".

## Open questions (issues, not here — #605)
- None filed this lane. Lane-adjacent: **#2585** (AWAITING, gates our held
  #2579 — see Next queued). Lane-foreign: #2529 (lane:research).

## Catches for the next session (each cost probes this shift)
- **Prod markers live in per-game lazy chunks** — the HTML's index chunk is
  ~1MB of shell+registry and contains ZERO game strings (MOTOCROSS 0 hits).
  Poll = find the game chunk among the `index-*.js` refs by a stable string
  (MOTOCROSS), then grep that file for your new marker. 16 blind polls at the
  index chunk were wasted before seeing this.
- **Claim lockout counts only `claimed|checkpoint` markers** (#1258 script):
  design/PR/merged notes do NOT extend a lane's hold. Slot a merged stage 1 at
  11:03 yet lost the claim seconds later — legal, by design; the merged work is
  in main, nothing was lost.
- **Menu grows cheap when you insert before the verb block**: TEST at index 6
  of 10 kept every wrap pin (backward wrap lands on EXIT unchanged). When you
  grow a strip, hunt positions-through-wrap pins before tail-inserting.
- **Ephemeral sim state wants a side alias, not the registry**: CACHE density
  drives menu rows; the TEST draft seats at a sentinel `TRANSIENT=-1` resolved
  inside `track()`, so density never lies. Nothing passed -1 before #2587 — the
  old wrap for -1 is pinned restored-after-clear.
- **`const` arrow funcs referenced earlier in the same useEffect body**
  (doSim→endTestRide): fine at runtime (frame loop starts after init) and
  eslint-clean here; only bite-safety is "don't call before the const line".

## Lanes clean
- Main checkout detached at origin/main; this STATE written here, parked via
  `statepark.mjs park b`, committed to main via `forge/state-322-b` (game
  merged this session, so STATE is committable — #2552/#2556 shape).
- Worktree `~/Dev/retrogames-forge-excite-testride` re-detached at origin/main,
  reusable. :5178 dev server stopped at close-out; other lanes' ports untouched.
