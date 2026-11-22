# STATE — forge board snapshot (slot b close, 2026-11-22)

## Shipped this session
- **#2935 DOUBLE DRAGON weight-true knockback → PR #2939 → main `bc0aa49`, LIVE.**
  Blows move bodies by weight: authored ladder (whip ~2.5 px < jab ~5 < stick
  ~6 < kick ~7 < flying knee ~9 peak slide), divided by mass (Abobo 1.7 — giants
  barely rock). Down skids on sharp asphalt friction (0.62); dying men travel;
  the struggle shoves the grabber off the seat; the stomp foot PINs (0 impulse).
  Shove runs away from the striker (spin kicks the crowd outward); x-only — the
  depth axis stays the whole dodge answer; `blocked()` holds; `kb` rides
  stateHash (zero rng, pressed streams replay hash-for-hash).
  **Found + fixed a softlock on the way:** unbounded knockback parked a thug
  past Billy's camera-edge reach and winnable seeds 4/8/12 could never end
  wave 2 — the fix is field bounds `camX±16` (the thrower-retreat margins; the
  screen is a wall). Floors re-measured: S1 12/12, full run 12/12, co-op 6/6.
  ddragoncheck 230 → **242 laws**, mutants **208/208** named-red (new:
  `knock-flat`, `bounds-off`). README gap closed + law section added.
  Prod verified by chunk grep: jalfern.com `index-DHnSEBoo.js` carries
  `downFriction`.

## The merge chain on main today (all verified live)
- `57f8b7d` R-TYPE duelist (#2934 → #2936, slot a) — armed Defender-style pursuit.
- `bc0aa49` DD weight-true knockback (#2935 → #2939, slot b) — this session.
- `36225c6` R-TYPE sting interceptor (#2937 → #2940, slot a) — carriers answer back.

## Board at close (idle.mjs, run live)
- `flagshipStage` = **null**, `weakestStage` = **null** — every gap on the
  shelf is owned or the title is held. QA holds both fighting flagships:
  #2889 (DD guardian-read) and #2938 (R-TYPE duelist pass). No steer/next/
  game-queue items open.
- When QA releases them, the next weakest rungs are the still-unowned README
  gaps: **R-TYPE** phase-2 volley dodge, wing-shell initiative, dark-seat
  free life, drone mid-flight catch; then **DOUBLE DRAGON** goon whip/stick
  rotations and the duel walk-to-retrieve re-arm. (Both skip while #2889/
  #2938 keep their `building-qa`.)

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (default keep
  private, due 11-23).
- #2908, #2930 (QA lane) — DD idle-seat / CPU-handback laws.
- None new from this lane. The dry-shelf jonq ask (#2795 answered 11-20,
  7-day cap) unlocks ~11-27 if the board is still empty by then.

## Harness notes (cheap fixes, next touch)
- **Browser pixel legs flake on a loaded box**: identical code red-passed
  `#2897 KO-settle` (run 1: bar 5px, rerun: 26px) and one more leg varied
  across three runs today — five lanes share software Chrome. Advisory; a
  rerun-green is enough, don't chase.
- `scripts/heistclock.mjs --pad` still latently broken (puppeteer
  `page.setViewport` on a Playwright page → use `setViewportSize`). One-line
  fix at the next harness visit (carry-over note).
- dd browser rigs measure **peak** displacement (`maxx`), not final — thugs
  walk back after a stagger and eat the slide (law-neutral measurement law).
- Steel-beat budget: knockdown slide + spawn offset must stay ≤ stomp reach
  (21 px) or the classic stomp-the-downed-man cadence breaks — this is what
  tuned `downFriction`/impulses (and why the stomp shoves nobody).

## Slots / ops
- Slot b port **5178** stopped with `scripts/devstop.sh` at close; other
  lanes' ports untouched all session.
- Worktree `~/Dev/retrogames-forge-dd-knockback` pruned after merge (its
  node_modules was a symlink — no disk kept).
- Main checkout: detached `origin/main` @ `36225c6`, STATE.md committed on top
  (game merged this session → allowed) and pushed.

## Next lane starting here
- Normal ladder first; expect it empty (QA holds the two passes). If the
  flagship/never-dry rungs answer null like they did at this close, the board
  is honestly dry — wait for QA to release #2889/#2938 (or pick their shipped
  follow-ups) rather than re-owning gaps; jonq dry-shelf question opens ~11-27.
