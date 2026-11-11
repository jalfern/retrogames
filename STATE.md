# STATE — session 226 (2026-11-11, slot b)

## What shipped
**WATCH b27: DONKEY KONG seats the proven climb** merged as `7d17133` (PR #2015,
`Part of #1637`; issue returned to `game-queue`, open for b28, shipped+proof
commented). TARGET #1637 answered the claim with "already yours: resume it" —
the previous slot-b session had claimed at 15:25 but died mid-merge-wait ~15:37
(warden idle-flag at 15:43). This session resumed the corpse per step 1b and
re-verified at the remote tip `0e33587` before merging: kongcheck 51/51,
watchcheck --only donkeykong 271/271 live on :5178, `static` green in CI;
smoke/prsmokes red only on CI DNS flake (runner failed apt/DNS installing
chromium — advisory, per rules 3/5). Prod proof: live entry
`index-IWSf_iji.js` carries the registry WATCH line "the route zigzags the
girders, arcs the barrels, and never touches one" (b27-specific literal,
cache-busted; jalfern.com needs `curl -L`). Playable at
jalfern.com/retrogames/donkeykong — Y seats, any driving key takes over.

## The session's catches
- **Bookkeeping comments do not extend the liveness lock.** forge-claim.sh's
  holder regex counts only `FORGE/QA (<id>): claimed|checkpoint` lines; the dead
  session's 15:27/15:36 "resumed/verified" prose left the lock aging from 15:25.
  When you resume a corpse, post a real `FORGE (<slot>): checkpoint` first — the
  90-min lockout measures from those lines only.
- **Resume = re-verify at the tip, not trust the corpse report.** The dead
  session's green claims were made before its last push moved the tip; 15 min of
  re-verification on exactly the tip being merged is what made the merge safe.
- **CI DNS flakes wear a suite-failure costume.** `Temporary failure resolving
  'archive.ubuntu.com'` in the smoke log = the runner never got chromium. Read
  the log before touching anything; static (the required check) was green.
- **Vercel ships before the hash poll catches up.** The entry hash was identical
  across two polls, yet the marker string was already live — content proof beats
  hash polling (STATE 225's lesson held on its first use).

## Ladder trail
TARGET #1637 → claim = "already yours" (own slot's dead claim, 23 min old) →
resumed worktree `~/Dev/retrogames-forge-watch-rollout-b27` (clean, remote tip
0e33587) → checkpoint posted → kongcheck+watchcheck re-run green → rule-5 merge
(no holds on #2015, main-ok exit 0, nightly `cancelled` ≠ red per #601 script) →
prod proof + #1637 building→game-queue. Demo polish backlog #2018 already filed
(slot a). No jonq filed (all pattern-following).

## Open questions
- none from this lane (#2016 waiting-jon lane:qa — DEFENDER smart-bomb, not slot b's).

## Next
- #1637 sits in `game-queue` again: b28 (next unseated solver-bearing title —
  derive honestly from the registry + WATCH_HELP at claim time) is a fair claim
  for either slot; slot a was live at this session's start, so the claim script's
  liveness namespace arbitrates, not etiquette.
- Dev servers: slot a 5173 (live), slot b 5178 (this session's server stopped at
  exit), QA 5176. `--mutate` only in an exclusive window ≥20 min.
- If a session dies mid-merge-wait again, the successor's resume path is proven:
  claim → checkpoint → re-verify at tip → rule-5 → prod marker proof.
