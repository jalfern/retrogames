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

## HTTP endpoints (#737/#886)
- `GET /status` → `{ok, rooms, feedback, jonKey}` — the button self-hide probe
  (`feedback:true` only once GH secrets are deployed). `jonKey` is a
  presence-only boolean: one curl proves whether the `JON_KEY` secret is
  deployed without leaking it.
- `POST /feedback` → files a GitHub issue via the server-side token; the
  payload gate is `validateFeedback` in `core.js`. A quarantined report's body
  says WHY (key rejected → check the JON_KEY secret; no key → device never
  opened the one-time link), and a failed screenshot upload names its HTTP
  status **and GitHub's own reason** (the error body, #1295: a bare 403 hid a
  token scope gap for three nights) — no more silent quarantine ("what
  happened to my test?").
  Screenshots attach through the persistent `feedback-assets` release (#1222):
  uploads.github.com issue-assets is dead for server-side uploads (raw → 400
  "Multipart form data required", multipart → 422 "Bad Size" at any size),
  while release assets still take raw binary and a published release's
  download URL renders in issue markdown. The token therefore needs repo
  write (classic `repo` / fine-grained Contents:write) — with less it files
  the report and leaves the honest upload-failed line.
- CORS (#886): both endpoints (plus `OPTIONS` preflight) send
  `Access-Control-Allow-Origin` for the arcade origins only
  (`jalfern.com`, `www.jalfern.com`, the workers.dev host, localhost:*).
  Unknown origins get no ACAO — the browser blocks them, which is the point:
  the allowlist is this endpoint's front door. Jon's reports skip the
  needs-approval quarantine when the body carries his private `key`
  (`src/utils/feedback.js` stores it from a one-time `?jonkey=…` link).

## Session store (#1711, PLAICRAFT S1)
- `GET /status` also answers `sessions:true|false` — the R2 capability flag;
  clients hide every upload affordance until it is true (and until the bucket
  binds, `POST /sessions` / `GET /sessions` answer an honest 503).
- `POST /sessions` — one consent envelope `{recording, player, consent}`;
  `validateSessionEnvelope` (core.js) refuses anything without `motion:true`
  and any voice section without `voice:true`. The bucket is never public.
- **READ LOCKDOWN (#1711 S8, Jon 2026-11-11):** `GET /sessions` and
  `GET /sessions/<key>` answer ONLY to callers presenting the `JON_KEY`
  secret in the `x-session-key` header (constant-time compare in core.js,
  fail-closed: no JON_KEY deployed = nobody reads, `err:'read lock not
  configured'`; wrong key = 401 `err:'unauthorized'`). Uploads are unchanged
  — phones never need the key. `/status jonKey:true` = the lockdown is armed.
  Every admin read tool sends it from the environment:
  `JON_KEY=<secret> npm run sessions`, `JON_KEY=… npm run plaicraft:evidence`,
  `JON_KEY=… npm run plaicraft:clap -- --key=<sessionKey>`.
- **RELABEL WRITE (#2093 item 1):** `PATCH /sessions/<key>` rides the SAME
  door as the reads (store edits are exactly as private as store reads).
  It performs the store's ONE permitted write-after-upload — repairing seat
  provenance `model`→`human` (auto-record only captures human starts, so the
  three 2026-11-11 iPhone takes that store seat 0 as `model` are honest human
  evidence). The operation is FIXED (`applySessionRelabel`, core.js): body is
  exactly `{seat}`; the reverse is refused (provenance cannot be laundered);
  the stale `modelId` drops; every byte outside the seat stays byte-identical.
  The tool: `JON_KEY=<secret> npm run sessions -- relabel <key> [<key>…]
  [--seat N]` — the #2093 one-off:
  `JON_KEY=<secret> npm run sessions -- relabel gauntlet/2026-11-11-seed15-8fdbfeef08.json gauntlet/2026-11-11-seed59-182a1f4459.json gauntlet/2026-11-11-seed59-5a9737e569.json`
- **Jon's clap session:** play GAUNTLET on the phone with both consent
  switches ON, and three times during the run CLAP sharply and tap RIGHT at
  the same instant (clap + tap together, ~1 s apart, the way the harness
  does it); finish the run so it uploads (the pill confirms). Find its key
  with `JON_KEY=… npm run sessions`, then grade it on the studio:
  `JON_KEY=<secret> npm run plaicraft:clap -- --store=https://retrogames.jalfern.workers.dev --key=<key>`
  — same ±50 ms verdict as the synth test, on your real mic bytes.
- **This file is what phones talk to** — so `npm run relaycheck` RUNS it in
  Node (`scripts/lib/relaysim.mjs`: `cloudflare:workers` shim + faithful
  in-memory R2) and grades the routes: door, CORS, key regex, metadata
  round-trip, caps, honest 503s — and the read lockdown (`--mutate` strips
  the consent door → 5 gates red; `--mutate-readlock` strips the read doors
  → the 4 no-key read refusals + the no-key relabel write refusals red;
  one-line SOURCE mutants, deployed file only).
  `plaicraft:evidence --self-test` and `plaicraft:clap` run their pipelines
  on the same sim.

## Client
`src/utils/lockstep.js` (pure) + the Gauntlet pilot
(`src/games/Gauntlet/index.jsx`): `?net=host`, `?net=join&room=CODE`,
`?relay=ws(s)://…` override for testing against the Node twin. See
`src/games/Gauntlet/README.md`.
