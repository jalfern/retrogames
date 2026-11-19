# STATE — session 347 slot a close-out

## Shipped this session
- **HOMEBODY — ROOMS WITH A PERSONALITY (#2736) — PR #2740 merged `46cd4fc`**
  (rule-5 loop on `static`; verified via `git log origin/main` + content grep).
  A standing wing reads its OWN floorboards: a Bookshelf makes it a STUDY (three
  finished in-room reads → insight: reader +0.15 fun, house +1 content, `studied`
  plucks), a TV/radio a PLAYROOM (Pip's fun-pick pulls to the in-room toy over
  nearer house things; three finished in-room plays → delight: +0.2 fun, rel.kid
  +0.5, house +1, `kid-laugh`). `archetypeOf` names rooms (bedroom > study >
  playroom, view-only); paid-only ledger rows ride the pause sheet; open-book /
  giggle-star badges sit at the doors. No rng timing; tallies join `stateHash`
  INSIDE the wings loop — bare lots gain no mixes, the no-tap pin 3998885235
  re-passed untouched (that frozen run buys nothing), 5/5 WINNABLE seeds hold.
  Proof: peoplecheck **1078/0** (+36 §PERSONALITY); mutants die named
  (`onWingFloor`→`s.wings[0]` → exactly the house-shelf gate red 1077/1;
  pull→0 → gravitate+delight five red); homebodyqueuecheck 99/99;
  contractcheck 14/14; eslint + lint:mario/fps/ai + build green.
  `homebodydrive` advisory: 118/1, then shifted co-presence/meal fails under
  load avg ~5 (3 lanes + CI on the box) — pure-sim twins green; rule-3
  one-rerun-and-record, not chased.

## Board
- Warden target #2734 REFUSED at claim (slot b live-held 20 min; it shipped as
  #2737 mid-session). Ladder: #1711 skipped WAIT-state (phone take still absent —
  `plaicraft:grade --dry-run` answers "nothing new"; jonq #2652 AWAITING,
  deadline Nov 20 01:36Z, default keeps waiting); steer/game-queue empty; the
  only feedback (#2732) was taken and shipped by QA (`bot.face`, #2741) —
  builders never borrow with QA MASTER live → flagship stage spent → never-dry:
  weakestStage score 1 = HOMEBODY's lone unowned gap (only unheld title with
  score > 0). Filed #2736 with the why-weakest line, claimed, shipped.
- Filed QA polish pass **#2743** (named rooms short of the original — QA's next).

## Next queue
- Re-derive at main (`node scripts/idle-kick.mjs`) — do NOT trust this line.
  At close it answers `KICK HOMEBODY -1 weak`: score comes from feedback #2743
  naming HOMEBODY, which the QA lane takes as its own while QA MASTER is live;
  a builder with QA live skips it and goes flagship/never-dry. #1711 stays WAIT
  until a phone take lands (check the store first). FLOOR BOSS "telegraph the
  knee" (STATE 346 suggestion, unowned) is a good games-lane candidate if the
  ladder reaches feedback with QA busy — file it as POLISH first, #841-style.

## Catches learned
- **peoplecheck errands must run to completion.** `p.use` is only armed when the
  WALK is assigned/advancing... tick to the `satisfied` event, not `while (p.use)`
  — sampling before the law fires produced deltas `[0,0,0]` and four red gates
  whose detail line named the fix instantly (rule 8: read your result).
- **The attract bot never furnishes wings** — its scan meets house floor before
  wing planks (r/c order). Wing-law changes are player-visible only; demo bytes
  unchanged; the no-tap seed pin survives because the frozen run buys nothing.
- Live-drive co-presence/meal legs flake at load ~5 (failures MOVE between runs);
  pure-sim twins green = contention per rule 3 — record, don't chase.
- (Re-confirmed 346 law) remote is the source of truth; `curl -L` jalfern
  assets; verify prod by CONTENT markers, not chunk hashes.

## Housekeeping
- QA polish pass #2743 filed (feedback). No jonq filed this session (nothing
  taste-shaped that isn't already open); open questions link: #2652 (AWAITING,
  platform lane).
- STATE committed via PR only because a GAME merged (#2740) — rule step 9.
- Dev server 5173 killed at close; worktree `~/Dev/retrogames-forge-homebody-personality`
  detached at origin/main after merge — removable.
