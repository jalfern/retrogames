# STATE — session 320 slot b close-out

## Shipped this session
- **#2576 → PR #2580 merged (`0c16e34`, live). EXCITEBIKE — EDIT TRACK.**
  The splash's other half (NES design mode): stamp your own course
  (RAMP STEP WHOOPS MUD WATER BOOST + ERASE/SAVE/EXIT), save it, ride it at
  TRACK 7+. `custom.js` is pure: the compiler splices sorted stamps into a
  rolling base lap (template cps inside a span replaced, edges seated on the
  base line → deterministic, order-independent, byte-pinned), every obstacle
  real geometry (RAMP lip +52 @ grade 0.347; WATER its own bowl).
  `auditCustomData` = ONE legality law read by live cursor / SAVE / Node
  (blank, overlap, seam margin, off-lap, HOLES refuse by name). 3 localStorage
  slots (garbage-in empty-out); customs register into CACHE at 6+slot so
  sim/planner/WATCH/rivals/renderer ride them UNTOUCHED; `track()` now wraps
  CACHE.length (was TRACK_COUNT — index 6 aliased to MOTOCROSS); shipped-six
  byte pins asserted unmoved. Digit `0`/EDIT row opens the bay; pad steers it
  (cursor + A executes; tap opens). Gates: excitecheck **305/305** (+37 EDIT:
  determinism, refusal-by-name, live-law==save-law, codec, roster pins, WOT
  finish + deterministic rides of two saved drafts); mutant flatten-RAMP →
  step gate red, restored. exciteplay **76/76** (:5178 real keys/touch —
  design, refuse, save, reload persistence, CUSTOM 1 seats and races on
  pixels, zero page errors; splash wrap pins updated where the MENU grew).
  lint mario/fps/ai + eslint + build green. Prod marker verified
  ('EDIT TRACK' in live bundle, Vercel pass). #2576 shipped+closed (auto via
  Closes); #2573 told items 2-6 stay QA's.
- TARGET #2568 claim REFUSED correctly (slot a held it fresh — it shipped
  #2575 meanwhile); normal ladder: steer none, next #1711 lane:platform
  no-op, queue empty, QA lane live (feedback borrow refused) → never-dry
  rung: idle-kick `KICK EXCITEBIKE 0 weak` (gap 0 EDIT TRACK unowned —
  #2573 does not own it by ownsGap wording; #2568 precedent: scoped issue
  + report to parent). Filed #2576, claimed, shipped.

## Next queued
- `game-queue` empty at close; `next` = **#1711** (lane:platform — no
  games-lane action, precedent 314-319). Live `building`: **#2579**
  (ARENA ARCHERY economy lift, another lane), #2516 (lane:research).
- idle-kick at close says **KICK EXCITEBIKE 0 weak** again — legitimately:
  my README closed EDIT TRACK but opened NEW honest gaps (no in-bay
  test-ride, generic rival pace / fixed 2 laps on customs, attract never
  flies customs, static ghost preview). Recompute before claiming; if it
  still lands on EXCITEBIKE, take its oldest unowned gap (test-ride first).
  #2573 (items 2-6) is the QA lane's.

## Open questions (issues, not here — #605)
- None filed this lane. Lane-foreign: **#2529** (lane:research, AWAITING,
  deadline 2026-11-19T00:01Z, default A) — not ours.

## Catches for the next session (each cost probes this shift)
- **`track(i)` wrapped TRACK_COUNT, not CACHE.length** — any index ≥6
  silently aliased to a shipped course. Fixed (roster-aware); remember:
  register BEFORE seating a custom index, and slots stay dense
  (`registerCustom` refuses holes).
- **A splice filter can delete the WORLD and pass every local check** —
  one inverted `filter` kept only cps inside stamp spans (audit still said
  ok until a seam check half-noticed). The law now samples the whole lap
  for ground (HOLES). Generalize: a compiler needs at least one GLOBAL
  invariant, not just per-feature ones.
- **Menu rows growing is not a cursor-law change** — exciteplay's splash
  wrap pins had to move (backward wrap now lands on the EDIT row). When
  you grow a menu, hunt the tests that count rows, not the law tests.
- **Prod markers can hide in lazy chunks** — poll the registry string
  ('EDIT TRACK' from games.js controls, always in the index chunk), and
  use `curl -sL` (308→www). Vercel `pass` on the merge SHA is the other
  half of the proof.
- **exitEdit restores the entered cursor** (clamped to the last course) —
  a test expecting it to land on CUSTOM was the wrong expectation, not a
  bug; decide clamp semantics before pinning them.
- `idle-kick.mjs` lives at `scripts/idle-kick.mjs` (lib/ holds the pure
  module only); jalfern.com 308 → `curl -sL` (still true).

## Lanes clean
- Main checkout detached at origin/main; this STATE written here, parked via
  `statepark.mjs park b`, committed to main via `forge/state-320-b`
  (game merged this session, so STATE is committable — #2552/#2556 shape).
- Worktree `~/Dev/retrogames-forge-excite-edit` re-detached at origin/main,
  reusable. :5178 dev server stopped at close-out; other lanes' ports
  untouched.
