# STATE — session 232 (2026-11-11, slot b)

## What shipped
**WATCH b29: MISSILE COMMAND takes its proven gunner** — PR #2034 (Part of #1637),
merged as `b2474d8`. First self-driving this title ever had:
- **Whole-tick lift (b27 shape):** `makeRun(seed)` + `tickMc(gs, cmd)` in sim.js —
  no wall clock, no Math.random inside; `?seed=N` replays the ENTIRE raid. The old
  `setTimeout(3000)` wave break is `WAVE_BREAK_TICKS=180` on the sim clock — the
  README's #1525 honest gap, closed.
- **gunnerStep doctrine: intercept HIGH.** Structure anchors 530/550 vs blast max
  radius 40 ⇒ centered y ≤ `SAFE_Y=485` can never touch a friendly. Urgent-first
  (lowest warhead), tick-exact meet-point using the engine's own discrete stepping,
  one promised shot per warhead (coverUntil), retry when a cover lapses, nearest
  silo by |dx| (the click law). Proof: `missilecmdcheck` 33 gates + 9 mutants all
  die — every seed in the sweep clears waves 1–5 with **6 cities AND 3 silos**,
  79.8 shots vs 80 warheads; live 293/293 desktop + 300/300 phone; honest wall in
  the README (wave 11: 32 warheads vs 30 shells; deepest observed 12).
- **First #1748 consumer:** RotateHint's card lands dead-center on this 4:3
  letterbox — exactly where the statutory attract pill sits (static round 1 caught
  my first wrong answer, a top-right pill). Answer: centered copy+pill wait behind
  the hint attribute; watchcheck's phone section clears the rotate card first.
- Registry line: "the sweep-proven gunner meets every warhead high and never lets
  the fire touch the ground". Merge needed a #601 wait: the failing nightly was two
  pre-existing resume-gate flakes (#2036); re-proof 43091554878 lifted it.

## The session's catches
- **`gh run watch` exit 1 ≠ nightly red.** The watcher broke while the run was
  still in progress; the freeze was alive but the re-proof was too. Poll
  `gh run view --json status,conclusion` in a loop instead.
- **`rerun --failed` on an old-sha nightly spawns a pending zombie** (43072838133,
  head a6ad2c3) that can re-freeze main when it completes red. Cancel stale runs;
  re-proof current tip with a fresh dispatch instead.
- **`| head` murders the dev server slowly** — vite kept serving after head exited,
  an orphan on :5178 for the next caller. Never pipe the server log; kill port at
  exit (done).
- **The park outranks HEAD** — session 230 (slot a) parked instructions mid-session
  (its Next: file recurring resume-gate flakes as harness budget, not game change →
  #2036 filed with both run excerpts).

## Ladder trail
TARGET #1711 claimed for b → refused to make it the tenth confirm pass (the
13:50Z Claude-for-Jon audit outranks the ritual; relay/ unchanged, #1730 still
Hold) → released `next` with a one-liner → #1637 already slot-b's (b28 live) →
resumed as b29 → shipped → #1637 back to `game-queue` for b30. #2036 filed
(feedback + lane:qa). No jonq filed (all pattern-following).

## Open questions
- none from this lane (see waiting-jon issues; #1711 hardware, #2016 lane:qa).

## Next
- #1637 b30 candidates (b27 list, unseated): pacman, centipede, pitfall,
  viper-pit, mario-classic — seat only titles with a PROVEN winning driver
  (check the family harness for a scripted win first); honor the b28/b29 chrome
  laws: pill at statutory bottom-24% attract band, one raw <p> per attract,
  rotate-first titles hide centered attract chrome behind `data-rotate-hint`
  (#1748) and watchcheck's phone section clears the card.
- Nightly: watch whether #2036's resume gates keep biting — if the re-proof
  goes red on them again, they need the tick-budget fix (QA lane), before
  every lane pays a freeze per night.
- Dev servers: slot b :5178 stopped at exit, orphan killed.
