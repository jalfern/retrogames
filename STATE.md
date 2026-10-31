# STATE — session 67 (2026-10-31, slot a)

## Shipped this session
**SHORT ORDER SHOUT is ONLINE** — stage 2 (#1291) merged as `2b2197a` (PR
#1375): `?net=host` opens a room (shared Lobby #1039, QR included), guests
join `?net=join&room=CODE`, each browser drives the seat its relay slot owns
(mobile players get their own cook — VirtualControls feeds `ownSeat`, not
always seat 1), open seats are CPU, host keeps a WASD+F/G partner seat (P).
Live: https://jalfern.com/retrogames/short-order-shout (private until Jon
promotes, #379 — the lobby IS proven, promote whenever).

## The online core (src/games/ShortOrderShout/net.js, pure)
- Sampling law #531 kept: pads sampled ONCE, D=10 ticks ahead, batched every
  2nd tick as 6-bit masks (~30 Hz/member); whole-sim hash every 60 ticks must
  agree with EVERY peer.
- Desync heals without reload: mismatch → `res:req` → host snapshot
  (`snapshotGame/restoreGame` added to engine — additive, rng continuation via
  closure peek, tick hashes unchanged), chunked ≤380B; dead friend (3 s stall)
  → host re-kicks fresh seed.
- Wire: FORWARD_TYPES only, ≤512B, ~93 msg/s worst case at 4 members.
- `npm run soslinkcheck` (31 assertions, no browser/network): full 150 s shift
  over the wire ends score-identical to the LOCAL reference run (2851=2851,
  quota win, final hash equal); injection detect+heal proven; mutant (neuter
  check()) red x3.

## Harness lessons (worth keeping)
- The in-memory relay in a Node harness must be fed a VIRTUAL clock — the real
  relay guards a 240 msg/REAL-second window, and a synchronous loop blows
  through it at tick ~240 and everything after silently refuses (#1290 sibling
  lesson: a refused message is invisible unless you count refusals).
- A CPU "human" over a wire must be a RECORDED local pad stream, not a live
  emitter behind the D-delay: live emitters mis-time their own landing checks
  and crawl (0 served); recorded thumbs replay the determinism law exactly —
  online result equals local reference run by construction.
- `assemble()` strict-equality bug (`m === undefined` vs null-initialised)
  silently zeroed every remote pad — caught at tick 60 by the boundary hash.
- Never `git add -A` blindly: a debug script (`scripts/_dbg2.mjs`) rode the
  checkpoint commit to main; removal PR follows immediately.

## Claim notes (#1258)
Warden assigned #1290; claim REFUSED (slot b holds it, comment 10 min old) —
normal ladder → #1291 claimed and shipped. Slot b's mini-queue corpse untouched.

## Next goal
Game queue is now empty of unclaimed games (#1291 was the last; #1299/#1354
are platform-lane). Expect the flagship polish stage (#841) next session —
derive the pick with `scripts/lib/idle.mjs`, not memory.

## Harness
soslinkcheck added (npm alias); soscheck still 36/0; contractcheck unchanged.

## Environment notes
Slot a worked in ~/Dev/retrogames-forge-sos-lobby (node_modules symlink), port
5173; dev server left running at session end — reclaim or kill it next session.

## Open questions for Jon
- none from this session (games lane). #1286 AWAITING on qa lane; #737 older.

## Carry-over
- #1362 TALK ME DOWN contractcheck red at main (QA lane first).
- #1365 RALLY polish; #1361 FIRE CREW polish; #1305 TALK ME DOWN polish;
  #1287 GAUNTLET voice polish; #1266/#1275 QA follow-ups; #1141 stage 4.
- SOS voice/PTT filed on the SOS QA polish issue (this session).
