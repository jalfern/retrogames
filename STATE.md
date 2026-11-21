# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: src/games/BombDefuse/model.js shipped in PR
# #2849 -> c40af50. Rule 4 counter: three game-code PRs in a
# row — #2840, #2843, #2849. Loop is turning.)

## PLAYABLE
- /retrogames/r-type — S1–S4 incl. S3 arcade bite (slot b, #2843).
- /retrogames/contra — S1–S4 + seat ceremony (#2840/#2837).
- /retrogames/double-dragon — S1–S4 co-op. Rest of shelf unchanged.
- Nothing player-visible shipped this session (data-pipeline stage, see below).

## WHAT THIS SESSION DID (slot a)
- Warden target #1712 (PLAICRAFT S2): resume-path claim (own fresh checkpoint);
  live store audit unchanged — 18 takes, NO friends' takes yet, so the two data
  acceptance lines stay blocked by design.
- Shipped **PR #2849 (squash c40af50)**: `BombDefuse/model.js` — 35 seat
  features/tick (Gauntlet/FloorBoss doctrine; effort-split game, so both seats
  read the shared panel + seatAsk debts + prev-pad autoregression) wired as the
  `bomb-defuse` dataset adapter (replay-verified; both live qabot takes tick-verify).
  Plus the **trainable gate**: no-adapter takes now stay `flagged` (the builder's
  comment always said so; the code never enforced it — a named human on an
  unadapted game could reach train with feat:null rows and flip `covers 2+ games`).
  Consent gates flagged, adapter gates train/heldout/players/coverage; consented
  human audio still lands (separate gate, pinned). Also fixed floor-boss
  `mem.pa` banking (prev-pad features rode zero forever).
- Evidence: datasetcheck 48/48; **5 mutants RED by design** (split-ignore,
  hash-skip, fold-disable, adapter-bypass, leak-reopen — M5's signature is
  "no-adapter rows ride ANY split": seed-heldout also proves the gate).
  Live rebuild deterministic twice `5dcb62ac` (was `696c85888e42`). Card
  **line-neutral**: games=[gauntlet], holdout need-2-players.
- Vercel prod green at c40af50; scripts/pipeline-only for the app bundle.

## BOARD
- #1712 OPEN, released to `next` (wait-state): the next real events are
  friends' takes landing via /retrogames/join — they close both data lines
  immediately **in an adapted game** (gauntlet, floor-boss, bomb-defuse) and
  `npm run plaicraft:dataset` re-covers with zero new code.
- game-queue empty; no steer; no halt; no `building`.
- Open jonq (link only): **#2844** (S2 fold ruling; default keep fold),
  **#2846** (flagship public promotion — Jon's call, default keep-private).
- QA lane's: #2833 (`building-qa`), fresh feedback #2841, #2842.
- Unowned harness bug: **#2839** (claim-status.mjs ignores
  `FORGE (<slot>):` comments → liveness reads dead). Any lane can fix; small.

## HARNESS NOTES FOR THE NEXT LANE
- **Next adapters (each ~model.js + register + fixtures):** talk-me-down,
  short-order-shout, garden-guard, pick-rush, rally-co-driver — the recorder
  titles still feat:null. Recipe (done twice, ~1 session each is overkill):
  engine must be Node-clean + integer hash → `model.js` with FEAT_NAMES/
  N_FEAT/N_ACT + featurize(gs, who, mem) (bank `mem.pa` after the label!) →
  ADAPTERS entry with checkpoint-compare → fixtures (clean/tamper/prev-pad) +
  one mutant (adapter-bypass). BombDefuse/model.js is the compact exemplar.
- `forge-claim.sh` resume path ("already yours") exits 0 WITHOUT re-applying
  the `building` label — after a resume, add it yourself so the board truth
  matches the lock (done manually this session).
- trainable doctrine: `human` = consent level (audio, identity); `trainable` =
  human AND adapted (splits, players, lines). Any new attribution policy must
  stay line-neutral unless Jon rules otherwise (#2844 governs the fold).
- Lines flip ONLY by native named humans; folded rows (`lg:1`) can never
  satisfy gamesCovered/heldoutClean.
- Store probe: `node scripts/sessions.mjs` = fastest truth about takes.
- mutateguard refuses mutant runs on a dirty tree (good — commit before
  `--mutant`, it caught me once this session).

## WORKTREES
- Main checkout: detached origin/main (c40af50) with this STATE commit.
- `~/Dev/retrogames-forge-plaicraft-s2` — merged; re-detached at origin/main;
  reap freely (remote branch gone). Slot a dev server (5173) never started —
  pipeline stage, no browser needed; port left free.

## Open questions
- #2844 (PLAICRAFT S2 fold ruling; default: keep fold).
- #2846 (flagship public promotion; default: keep private).
