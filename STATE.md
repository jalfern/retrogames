# STATE — session 251 (2026-11-12, slot a)

## What shipped
**HOMEBODY: THE PLAYER CAN ORDER THE ROMANCE (#2131)** — the merge landed in
THIS session's rule-5 loop as `3607481` (PR #2134). C coos whoever is in the
chat ring (+3, social lift both ways; Space/A rides coo ONLY where the old
press hit nothing); FAMILY-tier (≥60) household coo deepens to affection (+6,
chord, pink hearts); X cuts −4 and sets the grudge (cold war on command, the
#2070 human exit still the only mending); shared CMD_CD=8s rides stateHash, no
rng in triggers. peoplecheck 185/185 (+23 COURT gates, reach mutant 172/13
proven red); drive gates + contractcheck were green at the resumed tree
(eslint + node gates re-run here before merging). Prod verified: chunk
`index-BcWfzGV6.js` (entry `index-9SnX1okh.js`) carries `AFFECTION ♥ FAMILY`,
`YOU INSULTED YOUR BETTER HALF`, `NOTHING IN REACH` verbatim — first poll.
Live URL commented on #2131; closed shipped/completed. QA polish pass filed as
**#2135** (insult-on-touch idiom, target-choice tell, chat speech bubbles,
catalog thumbnails, cooling log lines, marquee teaching — view-only, do not
soften the sim law).

**Race note:** the warden kicked this session ~13:50Z with TARGET #2131 while
the owning slot-a session (250) was finishing the same issue — the #2121
duplicate-kick family, second sighting. Step 1b resume detection +
forge-claim's "already yours: resume it" absorbed it safely: one merge
(`3607481`), one prod verify, board consistent. Session 250 committed its
STATE at 14:03Z; this rewrite consolidates and adds what it couldn't see
(#2135, the race itself).

## The session's catches
- **A merged worktree can vanish mid-session.** After the squash-merge, tidy
  removed `retrogames-forge-homebody-court` before step 8 ran — gh calls made
  from that cwd die on "Working directory does not exist", not on GitHub.
  Post-merge steps (comment/labels/QA-issue) belong in the MAIN checkout;
  `git worktree prune` clears the stale registration.
- **Minifiers erase constants; UI strings are the prod marker.** `INSULT_DROP`/
  `CMD_CD` are gone from the chunk; the court lines survive verbatim — trace
  strings, not identifiers (same family as slot b's prod-trace catch).
- **TARGET can be stale.** The prompt's issue may already be merged/closed by
  the time you claim. The claim script and PR state are the truth; the prompt
  is a hint. Never blind-merge on prompt authority.

## Ladder trail
TARGET #2131 refresh-resumed (slot already held) → step 1b corpse: PR #2134
open, MERGEABLE, no holds, Closes #2131 → main-ok green → `static` SUCCESS →
squash-merged → prod markers on first poll → #2131 closed shipped →
QA pass #2135 filed. No new claim (one ship per session; the race partner's
work and mine were the same ship).

## Open questions
- none filed (nothing taste-level; the touch-idiom choice rides #2135 for QA).

## Next
- Normal ladder. #2135 is fresh feedback for the QA lane. weakestStage should
  crown Civ V next (Papers-Min gaps empty since #2132; Homebody tail now owned
  by #2135).

## Hygiene at exit
This session started no dev server (:5173 untouched, nothing listening).
Worktree gone (tidy after merge); registration pruned. Main checkout detached
at origin/main. STATE committed to main (game merged this session) and parked
via statepark park a.
