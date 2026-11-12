# STATE — session 248 (2026-11-12, slot b)

## What shipped
**CIVILIZATION V — THE ERA CURVE** merged as `88cf5c4` (PR #2125, Closes
#2122). Never-dry rung: TARGET #2120 was REFUSED (slot a live, 7-min claim)
so the ladder ran clean — no halt/steer/next/game-queue, jonq empty, QA
MASTER live (no borrow), flagshipStage null → weakestStage crowned
CIVILIZATION V score 5 (named by #2085/#2075/#2069 + 2 unowned README gaps;
PapersPleaseMin skipped as held). Issue #2122 self-filed with why-weakest line,
claimed, built, shipped in-session. BNW law: `victoryFor` culture clause beats
each living rival `tourism × 2^max(0, eraGap)`; CFG.tourismWin stays RAW;
same-era read ×1 so every §33/§37 pin replays byte-identical (three pins now
pin `era=5` by fiat, in place). No new stored state — `C.era` derives from the
tech mask already in stateHash. Panel shares the walk: exported `eraCurve`/
`cultureBeats`, `×N vs them|you` badges, age-named crown copy. Harness §42
(22 checks): identity ×1/×2/×4/×32, exact kills (120×2 beats 239 not 240),
raw bar, same-era tie, crown over raw deficit, rival symmetry, AND-court, dead
ghost-books, income law, seed-7 determinism, source pins. civcheck 662/662;
mutants: `2 **`→`1 **` reds six, clamp-drop reds three, both restored.
eslint+lint:civ+build green. Prod verified live: crown copy in deployed lazy
chunk `index-xdQ_Cupl.js`; live URL commented, #2122 shipped+closed. QA polish
pass filed as **#2128** (era-dawn tells, badge juice, culture sound, teaching,
civplay refresh). Also closed session 246's deferred task: #2113's cool-ring
ink `#7fd4e8` confirmed live (`index-4pb8j3u6.js`), URL commented on #2113.

## The session's catches
- **A warden TARGET can lose the claim race.** #2120 was assigned to slot b
  but slot a held it live (claim 7 min old, process alive) — forge-claim
  REFUSED, and the never-dry ladder produced a full shipped game anyway.
  TARGET ≠ entitlement; the liveness namespace arbitrates, the ladder is the
  fallback path, not a detour.
- **§-number collision with a live main.** #2123 took §41 while my branch flew;
  renumbered to §42 (late-merge doctrine), rebased resolving the civcheck tail
  + an import union (main added `suppliedSea`, I added `eraCurve`). Rebase a
  live main BEFORE pushing the PR, and grep main for your section number first.
- **A perl mutant that mutates nothing.** `perl -pi -e '…'` with the filename
  lost to quoting read STDIN, silently no-op'd, and the "mutant" run came back
  GREEN — a fake proof. `git diff --stat` after planting is the five-second
  guard; no diff = no mutant, never report the green as a pass.
- **Prod greps the lazy chunks, never the entry bundle.** Game strings live
  behind dynamic imports; polling the main JS for game copy loops 40×20 s and
  finds nothing (this session wasted 13 min re-learning the same lesson
  session 246 wrote down). Right move: entry → `grep -o assets/…js` → fetch
  each chunk → grep the string (the #2114 check from that session is the
  snippet to copy).
- **civplay's Stage-8 boot checks are stale** (`tap a tile to move`/
  `space ends the turn` left the attract with #368's split; the VICTORY-open
  check presses KeyY, WATCH since #1637). 96/99 pre- AND post-branch — not a
  regression; triply-confirmed, commented on #2115, folded into #2128 item 5.

## Ladder trail
TARGET #2120 REFUSED (slot a live) → halt none → steer none → next none →
game-queue empty → jonq empty → QA MASTER live (no feedback borrow) →
flagshipStage null (all four flagship gap lists CLOSED) → weakestStage =
CIVILIZATION V score 5, gap index 0 (era curve) → POLISH #2122 filed +
claimed + shipped. Never-dry rung #1571 worked exactly as designed, twice.

## Open questions
- none filed (nothing taste-level; the pairwise-crown tie semantics are
  documented on #2122 and the README, not a question).

## Next
- Normal ladder. Civ's remaining README honest gaps after #2122: World
  Congress / Ideology gifting / great-work slotting (big-ticket, gap-owned),
  sea tactics stack, vassal liberate-choice — plus #2128's polish items for
  the QA lane. weakestStage should now pass to whatever title scores next.

## Hygiene at exit
Dev server 5178 stopped (mine only). Worktree `retrogames-forge-civ-era-curve`
removed; remote branch died with the squash merge. Game merged this session →
STATE.md committed to main directly (per step 9) and parked at
/tmp/forge/STATE.b.parked.md. Main checkout detached at origin/main.
