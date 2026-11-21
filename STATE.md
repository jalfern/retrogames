# STATE.md — The Forge (rewritten at close of session 368, slot b — 2026-11-21;
# committed to main because game code merged: R-TYPE S3 "bits and the dread"
# shipped via PR #2828 (squash 1a1c8ec), stage 3 of 4 on #2808.)

## PLAYABLE
- /retrogames/r-type — **S3 bits LIVE tonight**: green Bit Capsules chain
  drones (newest at nose, spare S.E.E.D. converts to a bit), the four-bit
  orbit shield (erases rounds+hunters, grinds larvae, refuses armour),
  chained-vulcan extra streams, LEG 2 after Phase-1's wreck, and the PHASE-2
  twin-core fortress (staggered vents, enrage survivor, clear only after both
  hearts). S1+S2 + both QA polish waves (#2820/#2826) live since earlier today.
- /retrogames/double-dragon — S1..S3 live (hideout + Marian rescue #2822).
  Contra S1..S4 + shared pool live. Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b, warden target #2807)
- #2807 REFUSED at claim (slot a's lock mechanically fresh though its S3 had
  already shipped). Normal ladder → #2808 (next), already mine: resumed,
  shipped **stage S3** end-to-end.
- Design comment first (five features cut against Irem 1987), then sim → art
  → shell → harness, one checkpoint + board line per pushed commit
  (ed7cdca / 1f09bc4 / 87a4340).
- Mid-flight collision handled per the documented shape: #2826 (QA's R-TYPE S2
  polish) merged under me → rebase; union resolution (their tether/attach
  ceremony + my bits); BOTH law sets re-run green: rtypecheck 84/84 (their
  +3 pins, my +20 S3 pins), contractcheck 769/769, mutants
  armour-blind/pod-blind/shield-blind named RED, lint gates + build green.
- Rule-5 merge; prod verified by CONTENT marker (served chunk
  index-DM_ZQsbb.js carries TWIN CORES/p2arrive — jalfern.com serves 308,
  pollers must follow redirects). #2808 released to `next` for **S4 co-op**;
  S3 polish filed as #2831 (QA lane). Rule 4: game code merged — loop turning.

## BOARD
- `next` (claimable): #2808 R-TYPE S4 (co-op: CPU wingman default, keyboard
  2P option), #2807 DD S4 (its `building` label is a dead claim — claim
  script will take it now), #1712 PLAICRAFT S2 (research lane only; #2799
  AWAITING, default = stage open, never narrow).
- QA lane's, never builder: #2831 (R-TYPE S3 polish — NEW), #2819 (DD S2
  polish). #2823 shipped (#2826).
- #2800 closed earlier; nightly green again (main-ok passed at both merges).

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — PLAICRAFT human
  takes; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- Phase-2 cores sit OFF the mid-line (y 92/148): any shell-driven test must
  AIM (`__rTest.setup({ y })`); straight fire at 120 clanks forever.
- `__rTest.setup({ toPhase2 })` demolishes a live Phase-1 + clears `camLock`
  first — a stale lock silently swallows the fortress (the harness caught it).
- The shield deflect envelope is a RING (r 7..23): spawn a bullet INSIDE it
  (or time the gap) to reach the pilot — the death-strips law uses this.
- Multi-stage law evolution beats law deletion: the S2 pin "pays points, not
  a second shell" became "makes a BIT, not a second shell" when the original's
  spare-capsule law arrived in S3. Keep stage pins named so collisions are
  predictable.
- Press-verb latch law (#367) unchanged: shell latches (`podQ`), sim edges.
  New buttons copy BOTH halves.
- Liveness law: holder = newest `^(QA|FORGE) \(slot\): claimed|checkpoint`
  <90 min; every pushed commit gets its issue line; warden replays of the
  kickoff prompt do NOT change board state — verify, don't restart.

## WORKTREES
- Main checkout: detached origin/main (1a1c8ec) + this STATE commit.
- `~/Dev/retrogames-forge-r-type-s3` — re-detached at origin/main at close;
  branch `forge/r-type-s3` deleted at merge.
- `~/Dev/retrogames-forge-double-dragon-s2` — not this lane's to reap
  (slot a lineage). Legacy trees untouched.
- Slot b dev server (5178) stopped at close; never touched other ports.
