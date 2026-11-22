# STATE — forge board snapshot (slot a, 2026-11-22 — shipped)

## This session shipped
- **FloorBoss career takes** (#2958 → PR #2959 → main `ff6f58f`, prod-verified).
  The slot TARGET. Built by slot b (`fec418c..88ff511`); its claim lapsed and
  slot a resumed per 1b: full verification on port 5173 at `88ff511` —
  floorbosscheck full (synth career take seed 4242, tamper refusal), named
  mutants `--mutate-whistle`/`--mutate-career` RED-BY-DESIGN, datasetcheck
  66/66, plaicraftcheck, floorbossplay 96/96, lint ×3, build. Merged when the
  #601 freeze lifted (main-ok green, required `static` SUCCESS).
- **R-TYPE volley pre-dodge** (#2951 → PR #2955 → main `b779123`,
  prod-verified) — the parked merge-ready corpse from slot a's previous
  session (post-rebase proof rtypecheck 242/242, mutants 240/240,
  pre-dodge-deaf + cross-blind killed).
- **Killed a harmful duplicate**: closed PR #2963 — it tightened the watchcheck
  FLOORBOSS feed window to `{0,240}` while main carries `{0,300}` (#2962) and
  the career-take engine grew the block to 294 chars. Merging it would have
  re-reddened the nightly.

## PLAYABLE on main right now (prod-verified)
- `/retrogames/floor-boss` — cleared whistle keeps a consented take open;
  clocking into the next shift banks on ONE seeded stream (#2958).
- `/retrogames/r-type` — brains read the inbound salvo lane (#2955); duel
  steel (#2950).
- `/retrogames/double-dragon` — carrier rotations + duel steel (unchanged).

## Board at close
- `game-queue` empty; `feedback` = #2952 held by QA (`building-qa`).
- `building` = #1712 only (lane:research, big-build) — its remaining
  acceptance lines are human data (friend takes, see #2953), not code.
- Nightly `45058210042` dispatched on main `b779123` at 19:00Z — should go
  green (both heads fully verified locally); next lane: glance before merging.

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (due 11-23,
  default keep private).
- #2953 — invite flow vs Jon collects friend takes; default widen adapters
  (Contra next).
- #2908, #2930 (QA lane) — DD idle-seat / CPU-handback laws (due 11-24).

## Next lane starting here
- Ladder (halt/steer/next/queue/feedback) is empty or QA-held; run
  `scripts/idle-kick.mjs`: R-TYPE gap 0 and FloorBoss gap 0 both landed this
  week, so it re-derives the weakest — FloorBoss's next "Recording honest
  gaps (#1712)" bullet is the likely kick. File POLISH, claim, ship one
  gameplay fix.
- If #1712 is re-kicked: check `plaicraft:outbox`/admin for new human takes
  BEFORE writing code — career takes (#2958) make back-to-back multi-shift
  runs recordable, which serves the store's need-2-players holdout.

## Harness notes (new / carried)
- watchcheck FLOORBOSS feed window is `{0,300}` on main; the career engine's
  block measures 294 — ONE more line between the pad pick and `recordTick`
  re-reddens the nightly (the README states the law to the next editor).
- Prod verification via shipped sourcemaps is the reliable path: chunk JS
  mangles identifiers, and local-vs-prod entry hashes can differ across build
  envs. Markers proved live: `closeTake` (FloorBoss `BWgQ2akX`),
  `fanSlip` + 'SPAWN VOLLEY' (RType `CKmK6b2L`).
- `cp -cR src/node_modules dest/` with an EXISTING empty dest copies INSIDE it
  (nested `node_modules/node_modules`) — `rm -rf` the empty dir first
  (refines the APFS-clone note).
- `gh pr merge --delete-branch` dies on local bookkeeping when another
  worktree holds `main` — detach the holder (`git -C <holder> checkout
  --detach`). `retrogames-fix-deps` was the culprit; detached now.
- rec/v1 pointer channel stays 0..1 canvas-normalized; consent gate before
  seed-birth; stateHash excludes tool/cursor/sel (all unchanged, #2954 laws).

## Slots / ops
- Slot a port 5173: stale vite from the career-take resume session STOPPED
  with `scripts/devstop.sh` at close; other lanes' ports untouched.
- Worktrees cleaned: `forge-feed-window` removed; career-take + rtype-volley
  re-detached, local branches deleted (remotes gone with the merges).
- Main checkout: detached; STATE.md committed this session (game merged) and
  parked via `statepark.mjs park a`.
