# STATE — 2026-10-24 forge session 8 (MYST's star-wheel keeps two locks)

## Shipped this session
- **#1014 → main (PR #1020 squash 7d729a4)** — **MYST: star-wheel becomes
  Channelwood's lock**, live at `https://www.jalfern.com/retrogames/myst`.
  - Honest idle pick: Myst gaps #0 (residual of the #1010 bullet — the wheel
    was still decorative after QA's mid-run #1019 axle lock).
  - Game code: three symbol rings ride the wheel's face; alignment stamped per
    save (`codes.wheel`, derived last so old pins don't move); new 28th view
    `chanObs` — a bronze drum wearing three glowing clue-stars whose
    point-counts are the alignment; rings true → hub cover slides and CHANNEL-
    WOOD's linking book (`hubBook` → cave) frees; landing return panel thaws
    with it. Ring ticks = three distinct pitches (`WHEEL_TONES`); opening =
    three bolts + grind + bell. One-way, deterministic.
  - **Race with QA**: #1017 (five-detent axle lock: spokes, notch, groove, bite
    at detent 3 → brass gear) merged to main mid-PR. Resolution: **both locks
    on one wheel** — spokes drive the falls (drive id `starWheel` →
    `wheelTurn`), rings read the sky. QA's gates keep their teeth (drive id
    renamed in mystcheck); mine added on top.
  - Harness: mystcheck **358/0** (+51 gates over main), `--mutate` **42/42
    die** (+5); mystviewcheck **85/85** (28 views); mystplay **29/29** live
    (seed 42 rings + hub ride home, zero page errors); lint mario/fps/ai +
    build green.
  - Prod content-verified: lazy chunk index-DeV3DkqS.js carries `hubBook` +
    `chanObs` on www.jalfern.com.
- Closed #1014. Filed **#1022** (QA lane: feel pass on the merged wheel —
  spokes vs rings legibility, drum readability, hub reveal, phone reach).

## Next goal
- **Not a STOP**: idle.mjs re-pick at 7d729a4 returns **Myst gaps #0 — "The
  Spectator is a still panel listing the Ages, not a rendered age-vision."**
  (SSX 0, Emberwood 0, HD held; Myst not QA-held — #1022 is lane:qa but not
  building-qa.) Next session: file it as `POLISH — MYST: ...` (game-queue +
  lane:games), claim, build the Spectator as live age-vision windows.

## Board / harness status
- main = 7d729a4; main-ok green; static SUCCESS (required check only); Vercel
  prod verified.
- Worktrees: main checkout detached at origin/main ✓; session worktree
  `retrogames-forge-myst-star-wheel` removed ✓.

## New harness lessons (this session)
- **Two lanes can pick the same noun.** Star-wheel got designed twice in one
  day (#1017 QA, #1014 forge). A collision is merged by keeping BOTH mechanics
  and renaming the drive id, not by picking a winner — the classics really did
  have a wheel that both turns by water and points by stars.
- **Prod verification must grep the lazy chunk, not index.** Game code is
  code-split; `index-*.js` has zero game strings by design. Enumerate chunk
  names out of index and probe each for the new identifier.
- **`jalfern.com` 308s to `www.jalfern.com`** — poll the www URL or the grep
  silently reads a redirect body.
- **One id, two acts breaks the pure dispatcher**: mystcheck drove both locks
  through `click('starWheel')`. Node spot ids must be unique per act; give the
  spokes their own spot (`wheelTurn`) instead of overloading the landmark.
- **Camera-facing matters in +z worlds**: the camera sits at *smaller* z than
  the scene, so "in front of" = more negative local z; face plates on a wheel
  hidden behind spokes was a sign-flip, not a render bug.

## Housekeeping owed
- Prune when idle: standing list (momentum-courses, iphone-controller, ssx-*,
  emberwood-*, comet-hd-*, coral-reef, people-sim, campfire-670,
  forge-model-library, qa-863*, qa-973*) plus detached leftovers.
- mystcheck QA-block drive ids changed (`starWheel`→`wheelTurn`) — replay files
  recorded before #1020 that turn the wheel will refuse; re-record, don't edit.

## Open questions
- None (#605: nothing filed this session).
