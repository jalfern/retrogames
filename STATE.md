# STATE.md — The Forge (rewritten at close of session 357, slot b — 2026-11-19;
# committed: the forge game MERGED this session (086554e), so per FORGE step 9 the
# report rides main, not just the park.)

## PLAYABLE
- **/retrogames/contra — S3 live (merged `086554e`, PR #2788):** the weapon wall — capsule wheel
  (S/M/F/L, three altitudes), MG stream (cool 3), piercing undulating FIRE, piercing LASER, 4
  tree-line snipers (flashing scope-glint telegraph, 3.2 px/t), 3 vest grenadiers (arcing lobs,
  ground blast). `contracheck` 69/69, `--mutant` 56/56 (4 named harms incl. 2 new: silent-MG,
  non-piercing-beam), seeds 1..12 win with the new roster, contractcheck 15/15.
- /retrogames/floor-boss, /retrogames/contra S1+S2 — unchanged.

## BOARD
- **#2779 CONTRA — released to `next`, S4 remains** (co-op: CPU ally seat default per Jon's
  multiplayer rule + 2-player keyboard option; sim takes one hero today). S1/S2/S3 all merged.
- **#1711 PLAICRAFT S1 — re-verified wait-state twice, released to `next`.** Store unchanged
  (16 takes, newest human = Nov-16 seed12), grade dry → nothing new; #2652 AWAITING (deadline
  2026-11-20T01:36Z, default = keep waiting). Lines: 1 hold · 2 hold · 3 open (human clap take
  only; machine half green nightly, run 44567204499) · 4 hold. No lane-side work exists.
- **#2789 filed (feedback): arms-depot salvage** — slot a's parallel S3 read (10-hit depot slab,
  hatch, capsule-volley payout, 5x5 glyphs, 6 voices) from `origin/forge/contra-weapon-wall`
  @ `29fa62b`+, unshipped. Rebase onto main; port what survives. This is S4-follow territory,
  NOT an S3 re-ship.
- **COLLISION #2779 (2nd in 24h, reversed):** slot a built S3 blind while b held the resumed
  claim — `forge-claim.sh` resume posts no comment, so liveness never saw b. Full evidence +
  salvage path on the issue (b's 22:5xZ note). If you resume a claim, comment one line.

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main` + the #1045 ladder. `next` = #2779 (S4,
   the last Contra stage) and #1711 (wait-state: skip unless #2652 answered/defaulted —
   check `node scripts/jonq.mjs list games` first).
2. `game-queue` holds #2787 (FloorBoss turn-hold **plan-time** reservation — session 356-b
   measured that a runtime defer moves 4 rng-order goldens; budget a full session, design note
   on the issue).
3. Slot a was live on `forge/contra-weapon-wall` at session end (vite on 5173, pushing at
   ~23:0xZ). Expect a duplicate-S3 PR risk despite the warning — a red flag to check before
   merging anything Contra; the salvage path is #2789.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2652 (AWAITING, lane:platform, deadline 2026-11-20T01:36Z) — Jon's clap take or waive the
  phone shape; default = keep waiting. Gates only line 3 of #1711.
- #2751 (AWAITING, lane:qa, deadline 2026-11-21T03:40Z) — QA focus.
- Nothing filed from slot b this session (ship decisions were mechanical, not taste).

## HARNESS NOTES FOR THE NEXT LANE
- **Lane-aim law (Contra, new):** enemies aim `p.lane` (hero's last grounded feet-y); snipers
  fire only at grounded targets. Without it, aimed rounds track mid-air bodies and the 12-seed
  win proof dies — the hop must ALWAYS answer an aimed round. Don't "fix" aim back onto p.y.
- **Resume claims must speak:** `forge-claim.sh` prints "already yours" silently. Post
  `FORGE (<slot>): resumed claim — <what>` on the issue or the other lane can't see you
  (this cost two collisions on #2779 in 24h).
- **Mutant/harness counting trap:** when proving kills, count only pushed test subjects —
  seed-5's roster is pre-dead in those probes; counting `soldiers.filter(dead)` survived a
  no-pierce mutant once (fixed in a follow-up commit on main).
- **Beware stage-order contamination in the browser leg:** a live-fire test that destroys the
  core leaves screen=clear; force `window.__game.reset(seed)` before death-path legs.
- `stateHash` now covers weapon/bullet kinds, pierce counts, capsule kind, snipers, lane, vest
  hp. Determinism leg is self-consistency (no pinned goldens) — extend it when you extend gs.
