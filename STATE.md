# STATE — 2026-10-25 forge session 14 (SHIPPED: shared multiplayer LOBBY #1039/#1045)

## Shipped this session
- **LOBBY (#1039, PR #1045, merged 2669cb2)** — one join flow for every
  multiplayer game. `src/utils/lobby.js` (pure: canonical `?net=host`/
  `?net=join&room=CODE`/`?relay=` parsing, join-href builder, host-only
  waiting-only `start(payload)`, guest kickoff via `go`, #546 reconnect
  ladder, generic host/human/cpu/model slot model over slotSources) +
  `src/components/Lobby.jsx` (shared waiting room: big code, scannable QR,
  live seat tiles, identical host/guest wording, per-game accent).
  SSX, Blob Battle and Gauntlet rewired; Gauntlet's bespoke ws manager is
  gone (room.js + lobby ladder underneath, lockstep pad/hash + hero payload
  kept). New `npm run lobbycheck`: 56 checks over synthetic frames AND the
  real relay for all three game shapes; `--mutate` red. Jon's #1037 answer
  ("don't keep stopping — queued #1039–#1044") was executed: #1039 claimed
  oldest-first.
- **jonqcheck fix (same PR)** — flagship-stage expectations assumed an open
  gap existed; with every flagship gap owned `qaIdleStage`/`flagshipStage`
  correctly return null and the live-README assertions crashed (main was
  silently broken for any core-touching PR — #1036 was game-scoped, that's
  why it slipped). Now derived: null when all owned.

## Playable now
- Host: /retrogames/ssx?net=host (cap 4), /retrogames/blob-battle?net=host,
  /retrogames/gauntlet?net=host (cap 2 + code-entry box). Friend joins at
  the QR or ?net=join&room=CODE. Prod bundle verified: index-cE8MDi3U.js +
  assets/lobby-Brhzthz9.js on jalfern.com.

## Queue (Jon queued these this morning, #1039 done)
- #1040 PLATFORM nightly bot playthroughs for every game
- #1041 MAGIC CARPET — rebuild much closer to the 1994 original (note:
  src/games/MagicCarpet exists — this is a fidelity rework, read issue body)
- #1042 DEMO neon city in the rain · #1043 DEMO volcano at night (demos lane:
  self-contained under public/demos/, no registry — Jon 2026-10-19)
- #1044 EMBERWOOD act two: third dungeon, new weapon, boss (biggest game item;
  next forge session's likely claim — oldest after #1040 which is platform)
- #1052 QA — LOBBY: polish pass (filed this session; QA lane's job)

## Board / harness status
- main = 2669cb2. `static` green (the jonqcheck fix repaired it for core
  PRs); nightly success; Vercel prod healthy.
- Open: #737 waiting-jon (platform) · #1038 building-qa (demos) · #1040-#1044
  game-queue · #838 epic unlabeled (not claimable) · #549 parked · #1052
  feedback (QA).
- Rule 4 healthy: session shipped game code (src/games/** rewired).
- No STALL WATCH: session 14 shipped.

## Housekeeping owed
- Remote `forge/*` orphans (campfire-670, comet-hd-fallback,
  emberwood-grace/sprites/wyrm-tail, iphone-controller,
  ssx-cpu-riders-620/ssx-salis-arm) — still awaiting Jon/warden confirm to
  delete. `forge/lobby` deleted by the merge.
- Worktree ~/Dev/retrogames-forge-lobby kept (detached @ origin/main),
  node_modules is a SYMLINK to the main checkout — delete worktree when
  done with it (`git worktree remove --force`).
- No drive-id renames — replays valid.

## Open questions
- None open. (#1037 answered by Jon 2026-10-25 and closed; this session
  executed it.)
