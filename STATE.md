# STATE — session 347 slot a close-out

(Latest-close note: this rewrites slot b's 348 close, whose facts are folded in
below — PICK RUSH PERFECT SHIFT `0875750` (#2742/#2745) and FLOOR BOSS
knee-from-nose `e4ea224` (#2738/#2747) are shipped and prod-side.)

## Shipped this session
- **HOMEBODY — ROOMS WITH A PERSONALITY (#2736) — PR #2740 merged `46cd4fc`, prod-verified.**
  A standing wing reads its OWN floorboards: a Bookshelf makes it a STUDY (three
  finished in-room reads → insight: reader +0.15 fun, house +1 content, `studied`
  plucks), a TV/radio a PLAYROOM (Pip's fun-pick pulls to the in-room toy over
  nearer house things; three finished in-room plays → delight: +0.2 fun, rel.kid
  +0.5, house +1, `kid-laugh`). `archetypeOf` names rooms (bedroom > study >
  playroom, view-only); paid-only ledger rows ride the pause sheet; open-book /
  giggle-star badges sit at the doors. No rng timing; tallies join `stateHash`
  INSIDE the wings loop — bare lots gain no mixes, no-tap pin 3998885235
  re-passed untouched, 5/5 WINNABLE seeds hold. Proof: peoplecheck **1078/0**
  (+36 §PERSONALITY); mutants die named (`onWingFloor`→`s.wings[0]` → exactly
  the house-shelf gate red; pull→0 → gravitate+delight five red); queuecheck
  99/99; contractcheck 14/14; eslint + lint gates + build green. Prod: live
  chunk `index-BZ2wAyxk.js` carries both banners + ledger shapes —
  https://jalfern.com/retrogames/homebody is the shipped sim.
- **Docs trail:** `docs/HARNESS.md` content-verify recipe #2746 — WRONG in its
  first form, corrected by #2748 (see catches).

## Board
- Warden target #2734 REFUSED at claim (slot b live-held; shipped as #2737).
  Ladder: #1711 skipped WAIT-state (phone take absent — `plaicraft:grade
  --dry-run` "nothing new"; jonq #2652 AWAITING, deadline Nov 20 01:36Z,
  default keeps waiting); steer/game-queue empty; #2732 taken by QA (#2741
  `bot.face`); flagship stage spent → never-dry: weakestStage score 1 =
  HOMEBODY's lone unowned gap. Filed #2736, claimed, shipped.
- Filed QA polish pass **#2743** (named rooms short of the original — QA's next).

## Next queue
- Re-derive at main (`node scripts/idle-kick.mjs`) — do NOT trust this line.
  At close: `KICK PICK RUSH -1 weak` (score from feedback naming PICK RUSH —
  #2739 slot b's polish pass — with zero unowned README gaps; QA owns both
  open feedbacks (#2739, #2743) while QA MASTER is live, so builders go
  flagship/never-dry). #1711 stays WAIT until a take lands (check the store).
  FLOOR BOSS "telegraph the knee" (STATE 346 note, unowned) remains the
  honest games-lane candidate if the ladder reaches feedback with QA busy —
  file POLISH first (#841).

## Catches learned
- **Route chunks share the ENTRY's name.** Every game compiles to
  `assets/index-<hash>.js`; games are NOT in the entry (HTML → entry → grep is a
  broken detector — it faked 20 min of "stale prod" while #2740 was live all
  along). Recipe (codified HARNESS.md #2748): collect every chunk the live entry
  references, identify the game's chunk by a marker stable since a known ship,
  re-grep THAT for new markers; count with `grep -o | wc -l` (minified = one
  line, `grep -c` caps at 1); a deployment `success` for the merge SHA outranks
  any HTML edge-cache age (`x-vercel-cache: HIT` can sit minutes past a deploy).
  Filed the wrong lesson (#2746), found ground truth, corrected same session
  (#2748) — re-test notes against reality before codifying them.
- **peoplecheck errands run to completion:** tick to the `satisfied` event, not
  `while (p.use)`; deltas `[0,0,0]` named the sampling bug instantly (rule 8).
- **The attract bot never furnishes wings** (scan meets house floor before wing
  planks) — wing-law changes stay player-visible; demo bytes unchanged.
- Live-drive co-presence/meal legs flake at load ~5 (failures MOVE between
  runs); pure-sim twins green = contention per rule 3.
- A parallel lane can remove your forge worktree while closing their session —
  nothing local ever mattered once pushed; keep checkpoints pushed every step.
- (Re-confirmed) remote is the source of truth; `curl -L`; content markers.

## Housekeeping
- #2736 closed (shipped). Merged this session: #2740, #2744 (STATE v1 —
  superseded by this v3), #2746, #2748. Filed: #2736, #2743.
- No jonq filed this session; open questions link: #2652 (AWAITING, platform).
- Dev server 5173 killed at close; slot-a worktree pruned by slot b's close —
  all branches were merged/deleted as intended.
