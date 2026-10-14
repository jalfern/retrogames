# STATE — forge session 2026-10-14 (Q*BERT)

## Shipped this session
- **#210 Q*BERT MERGED** (PR #219, squash; PR CI green: static + smoke + Vercel).
  **Prod verified live**: https://www.jalfern.com/retrogames/qbert — canvas 256x224
  mounted on the production bundle (9151 lit attract px), real-key hops flip cubes
  green, zero page errors, no DEV hooks used against prod.
  `/qbert`: Gottlieb 1982. 28-cube iso pyramid rows 1-6+4,3, diagonal-only hops;
  round 1 all-green (apex counts, 27 to go), round 2+ the 5-colour cycle. Coily
  drops at flip 9, hops at you, contact kills; discs ride you to the apex and a
  snake within two edges follows them off (+500). Red balls ricochet the edges,
  Ugg/Wrongway run rows (round 2+), Sam & Slick wipe green back (round 3+).
  Chain scoring 25/50/100 (single/roundtrip/heli), round clear +1000, the
  "@!#?@!" balloon on every death. Phone play via a NEW VirtualControls `diag`
  prop (2x2 corner pad dispatching arrow pairs — shared, backwards-compatible).
- Node gate `npm run qbertcheck` in the static CI: **71/71** — geometry literals
  + symmetry + reachability, fall/blocked-apex edges, flip machines (no
  double-count), chase spawns-at-9/strictly-closes, lure radius pins, ball /
  runner / slick kills, cycle clears only at all-match, chain script 25/25/25/25/100,
  tour clears on flip 27, pilot graded by the harness's OWN BFS referee: round-1
  win + **lives-1 slack** on 8 seeds, ledger event-by-event, hash-for-hash.
  Fail-proven: corrupt one adjacency line -> **24 red**, restore -> green.
- `npm run qbertdive` (advisory verify tier): 15/15 real arrow-pair keys in
  Chrome — attract alive, hop flips the read-back cube, lit sprite at the sim's
  coords (probe+read in ONE evaluate), snake death + balloon, falls burn the
  remaining lives, Enter restart clean, disc boards and delivers.
- QA issue **#220** filed (cube seams, tunnel art, pose/sprite juice, chain
  timing window, 1UP, disc-drop row list, qbertdive promotion rule).

## Lessons paid for this session
- **The apex up-hop is a verb, not a move.** Up-diagonals at the apex are the
  disc attempt (blocked when no disc is near); the only way off the top is
  down-diagonal. The dive driver learned this by failing, and the sim was right.
  Same family as "an unmoving frame is not a broken actuator."
- Invulnerability windows silently eat scripted deaths — harness place hooks
  must zero `invuln` (and wait for `dying === 0`) before arming a scripted kill.
- First harness draft used the wrong diagonal *names* at the pyramid edge (ul
  from col 0 is a fall by design); a failing check is a conversation about the
  board, not just the code.

## Queue state
- game-queue: **#none** — #210 was the last item. Queue is EMPTY. Next session
  reports "nothing to forge" unless Jon files more (the /forge board accepts
  requests). QA lane has #220 (Q*BERT polish) and #216 (Joust polish).

## Harness commands (new this session)
- `npm run qbertcheck` (static gate), `npm run qbertdive` (manual verify;
  `QBERT_URL=` override), `npm run lint:qbert`.
- Worktree `~/Dev/retrogames-qbert` — merged; remove with
  `git worktree remove` + `git branch -D forge-qbert` (remote branch already gone).

## Three questions for Jon
1. The queue is now empty (#208 Tetris, #209 Joust, #210 Q*BERT all shipped).
   Should the next forge round be your picks from the /forge board, or want me
   to keep queueing era-classics (Frogger? Mr. Do!? Pengo?) under the same
   harness discipline?
2. `VirtualControls` now has a `diag` prop — iso isometric titles are a
   recurring shape. Good as a shared primitive, or should the diagonal pad move
   into its own component before more titles use it?
3. Carried over from 2026-10-13 (unanswered): promote the real-key smokes
   (tetrisplay/joustdive/qbertdive) into the merge-blocking tier after ~5 green
   manual verify runs, or keep them advisory and rerun-on-red?
