# STATE — forge session 2026-10-19/20 (ONLINE 2P infra)

## Shipped this session
- **#531 ONLINE 2P: room codes + Cloudflare relay + lockstep (Gauntlet pilot)**
  — PRs #541 (main build, squash `2dc48d9`), #543 (deploy fix, `f400eca`),
  #545 (sqlite migration, `88b43b1`). Issue closed shipped.
  - `relay/`: CF Worker `retrogames` — one hibernating DO per 4-char code
    (`Room`) + singleton `Registry` (≤120 rooms, 1h stale leases), classic
    `ctx.storage` rate window (≤1 write/s/room), 512B msgs, 90s idle alarms.
    Pure logic `relay/core.js` shared with Node twin `relay/server.mjs`.
    LIVE: https://retrogames.jalfern.workers.dev (2-client internet pair test
    green; rooms 1→0 after close).
  - `src/utils/lockstep.js` (pure): seed broadcast, D=4 input delay, tick
    gated on both pads, `stateHash` vs peer every 30 ticks on BOTH edges of
    the exchange, mismatch = freeze + DESYNC UI.
  - Gauntlet pilot: `?net=host` / `?net=join&room=CODE` / `?relay=ws://…`.
    Canonical seats (hero=host both boxes); guest camera/torch/minimap/panel
    follow `gs.partner`. Solo play byte-identical without the params.
  - Prod: jalfern.com serves the pilot chunk (index-D1CRNwxa.js contains the
    relay URL; lazy chunk — index shell hash unchanged).
  - Harness: `npm run netcheck` 32/32 offline (core caps, ws lifecycle vs
    the twin, 10-min-sim determinism, corrupted sim CAUGHT); `npm run
    netdrill` 10/10 two headless Chromes + real keys (pair/seed/play/
    desync/friend-left/zero-errors). Mutant (hash compare off) → red.
  - QA polish filed: **#546** (reconnect, ping UI, guest keypad, per-IP
    connect limit, restart-no-reload, net sfx, real-pair look check).

## Playable now
`https://jalfern.com/retrogames/gauntlet?net=host` vs `?net=join&room=CODE`
(desktop keyboard both ends; phones can host/join but P2 pad is desktop-only
per Jon's multiplayer rule).

## Next queued
- Oldest game-queue: none left (#531 was the last). #546 is `feedback` — the
  QA lane's job; forge may borrow it only if no QA session is live.

## Lessons worth keeping
- **Pads must be FINAL.** Sample each tick once, D ahead; never
  resample-and-resend — the peer may already have run the tick on the old
  value (netcheck caught this in its own first draft).
- Edges belong to the OLDEST unsampled tick only (one press, one swing).
- React 19 StrictMode remounts: room codes must live in a ref (regen =
  orphaned guest); 'gone' is advisory — a reconnecting peer sends 'peer'
  again, so recover waiting≠gone and don't close the socket on 'gone'.
- workerd close callbacks: the closing socket can still appear in
  `getWebSockets()` and `deserializeAttachment()` may throw — filter by
  identity, guard sends. (This leaked registry leases.)
- Cloudflare free plan: DOs REQUIRE `new_sqlite_classes` in migrations
  (API 10097); `DurableObject` must be imported from `'cloudflare:workers'`
  (10021). `this.sql` still undefined in `wrangler dev` on this wrangler —
  code paths use classic `ctx.storage`, which works dev + cloud.
- `npx wrangler dev` is the token-free local validator for workerd
  startup/lifecycle — use it before burning a main deploy (took 3 CI deploys
  to learn this; local repro of #10021 was exact).
- `git checkout --` on an UNCOMMITTED file restores the old version — commit
  working increments before experimenting (lost the first classic-storage
  rewrite to it).
- Vercel content-hash: lazy route chunks change filename, index shell may
  not — poll the game chunk for a marker, not index.html.
- Never `git add -A` right after `wrangler dev` (swept `.wrangler/` into
  #543; now gitignored).

## Three questions for Jon
1. Free-plan relay runs WITHOUT a paid tier so far — keep the 120-room cap,
   or want a usage counter/alert before friends find it?
2. `?net=` pilot is Gauntlet-only and private by URL param — promote a
   visible 2P entry point in the Gauntlet select screen (P key for online)?
3. Queue is empty after #531. Line up: next game title, #546 QA polish, or
   extending online-2P to a second game (Bubble Bobble would reuse all the
   plumbing — its sim is already deterministic per slotcheck)?

## Housekeeping
- Main checkout: detached at this STATE commit's parent; `main` free for the
  next lane's rule-5 merge.
- Lane worktrees forge-online-2p / forge-relay-fix / forge-relay-sqlite all
  removed post-merge. Dev server stopped except stray `wrangler dev` may need
  `pkill -f wrangler` if port 8799 nags.
- `ws` added as devDependency (lockfile committed with #541).
