# STATE — session 224 (2026-11-11, slot a)

## What shipped
**LODE RUNNER-LITE: THE LIP CLING** merged as `6b2db65` (PR #2006, Closes
#2004 — NEVER-DRY pick: weakestStage score 4 = 4 QA feedback naming LRL + 1
unowned README gap; flagship stage null). Nobody stands on air: a body
climbing out of a pit whose hole is still open ends the climb CLINGING to the
lip — hands on the edge, legs painted into the pit (climb frames sunk
CH*0.45, gated on stand-mode) until one side-step onto supported floor.
`onLip` derives at every arrival (arrive, guard escape, respawn clears), so
`stateHash`/replay/solver receipts are byte-identical; walkers and fallers
over the same mouth still drop in; trap ladder untouched. lodecheck 134/134
+ 162/162 mutants (proven red by hand-breaking the escape flag, restored);
lodeplay 36/36 live: cling flag true with hole open below at the shaft exit,
bright runner pixels INTO the pit cell below the lip line, side-step clears.
Lint gates + build green. Live proof: entry `index-DwavVhs8.js` → chunk
`index-DV7Z0u3t.js` carries `onLip`.
**Earlier this shift the lane also landed ASTEROIDS b26** (`4fdf0b1`, #2000)
— see the takeover log; that first instance shipped it while I stood down.

## Takeover log (read first — #1782 class RECURRED on slot a)
TARGET #1997 was REFUSED (slot b held it since 11:43; they shipped #1999 at
12:13). Step-1b looked like a #1637 corpse (claim lapsed, branch pushed, no
`opencode run` matching the 11:07 session) — **it was NOT dead**: warden
kicked slot a twice (11:07 AND 11:58); the first instance was mid-mutant-sweep
in the same worktree. My checks ran into its live planting (anchors "missing",
one mutant "survived" — cross-planting, both sides' runs polluted), and my
rebase of forge/watch-b26 moved the ref under it (content disjoint, it
re-based over harmlessly). Its merge loop survived as a CHILD OF THE OPENCODE
DAEMON (ppid = `opencode.exe serve`), not of any session — pgrep on `opencode
run` misses daemon-adopted shells. I yielded, posted evidence on #1782, and
the loop merged #2000 at 12:45. **Rules of thumb for a "corpse":** before
reaping — `git ls-remote` the branch (is it advancing?), check daemon-adopted
shells (`pgrep -P <serve-pid>`), and treat anchor-missing/survivor noise as
possible interference, not broken code.

## The session's catches
- **Stale CLOSED bullets re-kick lanes (#961, again).** weakestStage pointed
  at LRL's "Three strata are real (#1952)" gap — #1952 has been shipped for
  days; the bullet just lacked its `CLOSED by #1952` marker. Marker added in
  this PR; the real gap taken was the air-standing one.
- **sed restores are shotguns.** Turning a mutant off by string-replace hit a
  second `gd.onLip = false` at the respawn site. Reading the COMMITTED diff
  (not just re-running green) caught it. Restore by targeted edit, verify by
  `git show HEAD:<file>`.
- **Probe shape:** `probe()` returns the whole object — `offLip.lip` vs
  `offLip.player.lip` failed a check whose detail line printed the *right*
  value. Detail JSON and assertion read different depths.
- Device-level `AudioContext encountered an error from the audio device`
  filtered in lodeplay now (same precedent papersplay/britanniadrive carry).

## Ladder trail
TARGET #1997 REFUSED (b held) → #1637 false-corpse (double-kick, yielded to
live instance; b26 shipped) → halt none, steer none → `next` #1711 stays
Jon-side (eighth confirm) → game-queue empty → QA MASTER live (borrow
refused) → flagshipStage null → NEVER-DRY weakestStage #2004 → shipped
#2006. No jonq filed (all decisions pattern-following).

## Next
- Batch 27 (#1637): DonkeyKong first (registry-oldest unseated; NO sim.js —
  whole-tick lift + driver + seat in one session, budget ~3 h). b25/b26
  template + b26 laws (hold candidates, honest ttc, lead + angular window).
  #1637 still carries `building` — claim fresh (the lock expired at 12:39).
- QA owns #1949 (LRL polish, + my cling addendum), #2001 (asteroids), and
  the fat feedback list. Ports: slot a 5173, slot b 5178, QA 5176.
- `--mutate` only in an exclusive window; before trusting ANY check output on
  a lane you think is dead, run the corpse checks above.

## Open questions
- none (see waiting-jon issues; #1711 hardware still waits on Jon).
