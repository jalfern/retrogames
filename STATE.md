# STATE — 2026-10-23 forge session (#856 SSX ONLINE shipped)

## Shipped this session
- **#856 → main (squash, static SUCCESS)** — **#845: SSX ONLINE**, friends race a
  tournament over the internet, built on a reusable multiplayer-room layer.
  - `?net=host` opens a 4-letter room (up to 4 racers); friends `?net=join&room=CODE`;
    CPU riders fill the rest of the six-rider field; host starts everyone on one seed.
  - No lockstep (riders don't collide, per the issue): each box races its own sim and
    sees the others as **live ghosts** (quantised ~150 B pose snapshots; `net.js`
    encode/decode, `applyGhost` onto a stand-in rider id so `poseRider` just draws them).
  - **Standings + friends' podium** across 3 heats: every racer reports per-heat finish
    times; the relay forwards to ALL members; each box runs the same pure reducer
    `computeStandings` → identical podium, no authority/lockstep. Points = `PLACE_PTS`.
  - Waiting room (code + seat roster), live FRIENDS HUD panel, final podium overlay.
- **Reusable relay (the issue's ask):** `relay/core.js` generalised 2P→4P via an
  explicit `?cap=` + a `roster` presence broadcast on join/leave; `server.mjs`+`worker.js`
  mirror it. `src/utils/room.js` = transport-agnostic room client (host/join, roster
  deltas, seat→rider-id map, pub/sub, CPU fill) any future multiplayer title reuses.
- **#845 closed** (auto by `Closes #845`); **#858 filed** (feedback): QA polish pass.
- Shift report pushed.

## Lessons
- **Room code ≠ any 4 letters** — `SNOW` failed: the alphabet excludes I/O/0/1, so `O`
  closes the socket 1002 "bad code". Pick codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- **React StrictMode double-mount** makes a guest land in a non-deterministic seat (got
  slot 2, not 1). Ghost/seed/standings still worked; assertion had to be `slot>=1`. Real
  reconnect stability is a QA item (#858), not a blocker.
- **No-lockstep ⇒ rank humans by exchange, not sim**: remote sims can't be reproduced
  bit-for-bit, so the friends' podium is computed from broadcast FINISH TIMES with a pure
  reducer run identically on every box. CPUs stay a visual pace field (their sim may drift
  across boxes — harmless, they aren't scored online).
- **Additive gating keeps regressions at zero**: online is fully behind `net.active`;
  `ssxcheck` still 213/213 and `netcheck` 39/39 untouched.
- The relay's `gone` fires whenever ANY member leaves (room persists) — a multi-player
  client must NOT trip a fatal phase on it; ghost lifecycle rides `roster` deltas instead.

## Next goal
- Oldest `game-queue` now **#840**: head-to-head falling-block battler (online 2P via
  the now-reusable room layer — the room work here makes that cheaper). CPU opponent
  default; two-player a desktop option. Then #841 (builder-never-idles polish).

## Board / harness status
- main green at #856 (+ #857 QA merged after us); no freeze. Rule 4 satisfied.
- jonq lane:games: nothing AWAITING; no question filed this session (design was the
  issue's, not a taste call). #843/#825 are lane:qa (AWAITING), not ours.
- **Deploy dependency (Jon):** real internet play needs the 4-seat+roster relay worker
  redeployed on Cloudflare (`worker.js` is code-complete). Until then online pairs
  against the local test relay (`relay/server.mjs`, identical protocol). Matches #825.
- QA lane owns: #858 (new SSX ONLINE polish), #854 Garden Guard, #851 Selenitic, #831
  STORM, #833 audio, #832 OCEAN, #752 EMBERWOOD, #680/#702 SHORE.

## Open questions
- none this session (lane:games). See #843/#825 (lane:qa, AWAITING).

## Housekeeping owed
- This lane's worktree `~/Dev/retrogames-forge-ssxonline-845` is now detached at
  origin/main with a node_modules symlink — safe to prune.
- `roomcheck`/`ssxdrill` aliases added (package.json); browser `ssxdrill` advisory.
