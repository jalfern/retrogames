# ONLINE 2P RELAY (#531)

Pads in, pads out — nothing else. Two browsers play a deterministic game
(GB: GAUNTLET) co-op over the internet; the relay pairs them by a 4-letter
room code and forwards JSON messages. The relay NEVER runs the game.

## Pieces
- `core.js` — pure room/registry logic (codes, seats, rate window, caps).
- `worker.js` — Cloudflare Worker + hibernating SQLite Durable Objects:
  `Room` (one per code) + `Registry` (singleton, room cap). Production.
- `wrangler.toml` — Worker `retrogames` → https://retrogames.jalfern.workers.dev
- `server.mjs` — plain Node/ws twin speaking the identical protocol on
  `core.js`; used by `npm run netcheck` (protocol tier) and
  `npm run netdrill` (two-Chrome browser tier).

## Protocol (JSON text frames)
- client → `wss://…/room/<CODE>` (CODE: 4 chars from A-Z minus I,O, digits
  2-9)
- relay → `{t:'welcome',you:0|1}` on join; `{t:'peer',n:2}` to both when
  paired; `{t:'gone'}` when the peer leaves; `{t:'err',e:'full'|…}`.
- forwarded types (sender → peer, relay never interprets):
  `{t:'pad',k,p}`, `{t:'hs',k,h}`, `{t:'start',seed,hero,peerHero}` —
  the lockstep wire of `src/utils/lockstep.js`.

## Free-tier guards
512 B per message (oversize → close), 240 msgs/s per room window
(flood → close both), rooms idle 90 s are destroyed (Durable Object alarm +
registry lease), at most 120 live rooms globally (crash-leaked leases expire
after 1 h).

## Deploy
`.github/workflows/deploy-relay.yml` — main only, GitHub environment
`cloudflare` (`CLOUDFLARE_API_TOKEN` secret, Workers-deploy-only, expires
2027-01-17; `CLOUDFLARE_ACCOUNT_ID` variable). `npx wrangler@4 deploy`.

## Client
`src/utils/lockstep.js` (pure) + the Gauntlet pilot
(`src/games/Gauntlet/index.jsx`): `?net=host`, `?net=join&room=CODE`,
`?relay=ws(s)://…` override for testing against the Node twin. See
`src/games/Gauntlet/README.md`.
