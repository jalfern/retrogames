# STATE — 2026-10-23 forge session 7 (link pads #893 shipped + hotfixed)

## Shipped this session
- **#893 → main (PR #916 squash 993df13)** — iPhone as controller, v1
  (AirConsole-style): `src/utils/padlink.js` (pure protocol: room on the
  existing relay cap-4, seat policy — a phone is never seat 0, ~120/s full
  pad state from touch, WebRTC data channel unordered/maxRetransmits 0
  signaled INSIDE the forwarded `pad` type — no relay redeploy — relay
  fallback ~50/s, stamp/echo RTT ping, 1s staleness release, pads applied
  through the onePad slot writers; seat 1 = console-pad keyboard route like
  gamepad #1). Host pill `LinkPads.jsx` (+ `linkPeers.js` WebRTC factories),
  phone page `/retrogames/pad` (`pages/PadLink.jsx`, #885/#735 look).
  Gauntlet + SSX pilots needed ZERO game changes (slot-2 A-claim / slot-1
  analog). `padlinkcheck` 13/13 + mutant (seat→slot swap → 3 red).
- **HOTFIX #917 (fix/linkpads-transport, pending)** — #916 merged while
  fixes were still UNCOMMITTED in the worktree: main's LinkPads lacked
  `makeTransport` → `room: makeTransport required` page-error on EVERY game
  route, and SDP overflowed the relay's 512B budget killing room sockets.
  #917 adds the WebSocket transport + packSig/makeSigInbox fragmenting
  (≤380B frags) + `padlinkdrive.mjs` (real Chrome, local relay: 7/7 — join
  by code, touch-pad drives ArrowLeft/keyup on the game, 1-2ms direct ping,
  disconnect releases). **Prod between #916 deploy and #917 deploy is
  broken** — watch Vercel, verify after merge.

## Next goal
- Close/prod-verify #893 after #917 merges (comment live URL, shipped label).
- Oldest `game-queue` then: #900 Momentum Runner courses / #899 People sim /
  #901 model library / #902-903 demos.
- QA holds #863 BLOB + #911 SSX polish. Never touch heldGames.

## Board / harness status
- main = 993df13 (broken LinkPads) until #917 lands; `static` was green on
  #916 despite the runtime error — lint gates don't catch a thrown runtime
  dependency; `verify`/`smoke` would have (advisory only).
- `jonq`: nothing AWAITING in lane:games; no new question filed.
- Relay Cloudflare redeploy still pending (#825 note) — NOT needed for link
  pads v1 (signaling rides forwarded `pad`), only for 4-seat SSX rooms.

## Open questions
- none open.

## New harness lessons (this session)
- **A merge loop started with a dirty worktree ships the dirty parts as
  vapor.** #916 merged the review-fix-less tree because fixes landed AFTER
  `gh pr create` while the poll ran in the background. Rule for the fix-loop:
  `git status --porcelain` must be EMPTY before starting the rule-5 poll;
  new commits during polling are fine (the check re-runs), uncommitted ones
  are not.
- **The relay's 512B budget applies to signaling too.** SDP is ~1.5KB: any
  WebRTC-over-relay signaling MUST fragment (padlink packSig) or the relay
  closes the socket (1009) — which looks like a flaky join, not a bug.
- `padlinkdrive` needs `npm run dev` + `node relay/server.mjs <port>` (it
  starts its own relay); headless Chrome pairs WebRTC on localhost (loopback
  host candidates), so drive-mode ping reads 1-2ms WI-FI-direct.
- React StrictMode double-mount double-joins rooms (ghost seats); drive
  assertions must be per-seat contracts, not roster-empty.

## Housekeeping owed
- Prune worktrees: `retrogames-forge-iphone-controller` after #917 merges +
  detach; previous session's list unchanged (ssx-courses, ssx-analogue-stick,
  emberwood-*, qa-863*).
- STATE committed to main ONLY if this session's final PR merges — #917 is
  the session's ship (game-side plumbing); if it lands, commit this file.
