# STATE — session 234 (2026-11-11, slot b)

## What shipped
**PAPERS, PLEASE-MIN: THE WALL THAT LIVES** — merged as `e991fc5` (PR #2048,
Closes #1908, warden TARGET; claim was clean). The fifth-portrait playtest
(#1908) caught the ORIGINAL working against the wall: FIRST×LAST was 10×8=80
combos, decoys were undeduped stream draws — 27 within-week repeats across
seeds, two same-bulletin doubles, and wall names walking the window on later
days (55.6% near-miss entanglement). The fix is variety as construction:
- Pool doubled (FIRST 16 × LAST 12 = 192 combos; the two combos that ARE a
  regular's name removed — the arc is the only way the neighborhood decorates
  the wall). Decoy names come from a per-week PLAN: slot (n,k) prints pool
  index `seed*97 + n*71 + k*37 mod 190`, offsets verified collision-free for
  |Δday|≤6, |Δslot|≤2 → twenty distinct names a week for every seed. Ids stay
  stream draws, so `genDay` standalone still replays `genWeek` (pin green).
- The week plan pre-seeds every day's `used`-set: no entrant/planted/regular
  name ever equals a wall row's FULL name; the old rewrite guard became an
  assertion. Token-level near-misses stay ON PURPOSE (they train NAME *AND*
  NUMBER); planted-vs-other-day coincidences ~1.8/wk are drift-capped.
- Readability: the fit law caps rows at 9px (worst y=356 vs SCALE.y=358 — 2 px
  slack, now also pinned against shrinkage), so the lever shipped was CONTRAST:
  dedicated `wallRed #ff6f5e` on the wanted rows (stamp `#d84343`, strikes
  `#ff8080` stay distinct).
Proof: paperscheck 18186 green, **43/43 mutants die** (new m43 frozen day-term,
m44 unseeded plan); papersplay 90/90 — seed 0's whole week of 26 bulletin rows
matches Node's plan row-for-row ACROSS processes, sheet ink 328 px (3-row day)
/ 612 px (5-row day), zero live repeats, zero wall-names-line. Prod verified:
`index-BbVaMeRK.js` carries `ff6f5e` + `*97+r*71+s*37` on
https://jalfern.com/retrogames/papers-please. #1908 shipped+closed, live URL
posted; residue (size-ceiling honesty) rides the README honest-gaps — 8b not
filed, this WAS the polish pass.

## The session's catches
- **Prod marker scans have three traps before the first honest answer.**
  jalfern.com answers `Redirecting...` without `-L`; lazy-chunk refs appear BOTH
  as `./x.js` and `assets/x.js` (normalize both); minification kills comments
  and spaces — `seed * 97` ships as `seed*97…` (grep `\*\s*97`) and section
  names never survive. Use string literals (hex colors) as markers.
- **Pure-hex pixel gates lie about text**: 9px glyphs are ~98% antialiased
  (exact-#ff6f5e counted 8 px). Count the hue family (`rr>170, g/b 80..150`)
  inside a rect that only the sheet paints.
- **Cross-process row-for-row proof works**: browser `probe().wanted` (rows +
  planted flags + ids) == Node `genWeek(seed)` rows, name AND number — the
  strongest cheap gate this title has for generator changes; reuse it.
- A fresh worktree has no `node_modules` — `vite: command not found` until
  `npm install` (4 s here, ifvms patch auto-applies).

## Ladder trail
TARGET #1908 claimed first, clean (no halt/steer/next anywhere, game-queue
empty, no `building` corpses, jonq games: none open, no QA MASTER conflict —
#1908 was the warden's, not a borrow). No jonq filed (recorded balance is not
a question).

## Open questions
- none (see waiting-jon issues).

## Next
- **#1637 b31: full-shelf driver audit** (brief in #1637's wrap comment, via
  session 233): seat every remaining title that owns a winning script, or
  declare the rollout done. Batch numbers 19–21 never appear in watchcheck —
  check the trail before renumbering.
- **`viperpitcheck` is red-on-main and wired into NO CI job** (counter-throw
  gate drifted with #1761/#1785) — QA lane's call, flagged twice on #1637.
- PPM drain law still stands (session 230): do not re-pick PPM at weakestStage
  while its feedback pile + #2020 sit unowned. (This session's PPM work was a
  warden TARGET, not a pick — the law's pile is now 10→9ish; #1908 closed.)
- #2045 (lane-liveness crossings) and #2036 (resume-gate nightly budget)
  remain open harness improvements, unowned.
- Dev servers: slot b 5178 STOPPED at exit; slot a 5173; QA studio 5176 (not
  mine — untouched). `~/Dev/retrogames-forge-ppm-bulletin` left detached at
  `e991fc5` (its branch died with the squash) — remove or reuse deliberately.
