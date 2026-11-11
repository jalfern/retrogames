# STATE — session 231 (2026-11-11, slot b)

## What shipped
**PLAICRAFT S1 S8 — THE READ LOCKDOWN** merged as `MERGEHASH` (PR #2040,
Part of #1711 — warden TARGET; slot a held #2032 62 min ago at claim, REFUSED
as law says, ladder: no halt/steer, `next` #1711 UNBLOCKED at 19:14Z when Jon
posted the binding — "lock down reads… tell me its name… ping me when it's
merged and I'll deploy"). `GET /sessions` + `GET /sessions/<key>` now answer
ONLY with header `x-session-key` == worker `JON_KEY` (no new secret; constant-
time `sessionReadOk` in core.js; fail-closed: no secret = 'read lock not
configured', wrong = 'unauthorized'). Uploads untouched. CORS allows the
header. relaysim deploys JON_KEY by default (readKey:null = fail-closed sim).
Tools send it from env: `JON_KEY=… npm run sessions` / `plaicraft:evidence` /
`plaicraft:clap -- --key=<take>`. NEW: clap **analyze mode** — downloads one
real phone take, decodes opus in-browser, same ±50 ms clapVerdict
(direction/seat-agnostic pairing; `--file=` + `CLAP_DUMP` prove it offline:
real-bytes take 6/6 worst 31.9 ms, +500 ms-shifted take RED at −492.7 ms).
Gates: relaycheck 48/48, `--mutate-readlock` strips the door lines → exactly
the 4 refusals RED, old `--mutate` 5 consent gates RED; recordcheck 105/105;
evidence self-test 23/23; clap 15/15; lint gates + eslint + build green.
Live worker pre-merge: `jonKey:true` already (secret persists across deploys);
deploy-relay.yml fires on main → bucket + lockdown go live with the merge.

## The session's catches
- **The leak never reached prod.** The deployed worker predates the sessions
  routes — GET /sessions answered 400 `use /room/CODE`. The lockdown lands the
  routes WITH the door instead of opening them. (Told Jon on #1711.)
- **A mutant must assert the secure side.** First readlock gates were written
  `MUTATE ? status===200 : status===401` — the stripped-door run then graded
  green ("expected red, got green"). Gates assert 401 unconditionally; the
  mutant *lands 200* and dies. Same lesson as S5's consent door, re-learned.
- **outbox scenario C fails on MAIN, identically** ("third run starts" +
  "third take queued", reproducible 2× on the branch, identical on 322aa43
  detached-main + own vite) — pre-existing advisory red, not mine; flagged on
  #1711 for QA. Do not chase inside this lane.
- Dead b29 session leaked vite on slot-b's own port 5178 (claim script proves
  no live b claim ≥90 min) — cleaned before booting, per session-230 precedent.

## Ladder trail
TARGET #2032 REFUSED (a alive, 62 min) → halt none, steer none → `next` #1711:
Jon's binding posts at 19:14/19:24Z satisfy the audit's "no confirm passes
until the binding" wall → claimed, shipped S8. game-queue: #1637 open with
stale OPEN PR #2034 (b29 driver dead; its next batch awaits a claimer — check
its last FORGE comment before claiming). No jonq filed (all pattern-following).

## Open questions
- none (see waiting-jon issues; #2016 is lane:qa).

## Next
- **Jon deploys** (or deploy-relay.yml auto-deploys the merge). After deploy,
  /status must show `sessions:true, jonKey:true` and un-keyed GET /sessions
  must answer 401 — then his phone sessions can upload + his clap take can be
  graded (`JON_KEY=… npm run plaicraft:clap -- --key=…`, how-to in relay/README.md).
- #1637 WATCH rollout: PR #2034 (b29) is open & unclaimed — resume or close
  it deliberately; check the issue's last FORGE comment for what batch it owes.
- outbox scenario C red-by-inheritance on main — QA lane's (repro in #1711
  comment / this file).
- Dev servers: slot b 5178 (this session's, stopped at exit), QA 5176,
  slot a 5173. `--mutate` only in an exclusive window ≥20 min.
- STATE.md left UNCOMMITTED: no game-code (`src/games/**`) shipped this session
  (platform stage — rule 9 gate not met); parked at /tmp/forge/STATE.b.parked.md.
