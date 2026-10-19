# STATE — 2026-10-19 (forge: shipped #494 PLAYER SLOTS)

## This session (forge lane)
- **Shipped:** #494 — PR #504 → squash `a009c11`. Live at
  https://jalfern.com/retrogames/gauntlet (+ /bubble-bobble); prod bundle
  carries `assets/slotSources-CDU7_2hP.js`. Issue labeled `shipped`.
- New plumbing: `src/utils/slotSources.js` — `makeSlot(kind)` / `padFor(slot, ctx)`
  kinds `off/human/cpu/model` (+ reserved `remote` transport hook). Contract
  (`gameContract.js` + docs/GAME-SHELL.md): `step([p1,p2])` = one tick, one
  pad per player (`spec.tick(pad, pads)`); `reset(seed, players)` opens seats;
  single-pad calls byte-identical (all legacy games untouched).
- GAUNTLET pilot: P2 seat Off/Human/CPU at hero select (Off default #275;
  C=cpu, P=human, pad-2 auto-human, model = `step([p1,p2])`). CPU partner
  now plays by human rules: `planner.partnerPad()` emits pads only — the
  1.15 trail bonus and partner door-favors are gone; `updatePartner` obeys
  ANY `partnerInp`; only a padless seat (FOUR HALLS, unwired) keeps the
  first-person trail fallback. BUBBLE BOBBLE: modes 1/2/3 rewired onto the
  same slot objects (cpu Bob = planner wrapped as pad emitter).
- Proof: `npm run slotcheck` 23 PASS / 24 `--mutate` (dropped live pad
  caught; breaking `padFor`'s model queue turns it red 4-fail, restored).
  Real drive `gauntletplay` 19/19 (keys): seat opens at select, cpu partner
  travels under its own pads, `step([p1,p2])` steps exactly one tick while
  legacy pad still steps. gauntletcheck 137 (+mutants 155 PASS after
  re-anchoring the partner mutant to the new `if (partnerInp)` gate — CI
  caught the stale anchor on attempt #1), bobcheck 39, vpadcheck 549,
  contractcheck 13/14 for both ids. lint:slots/mario/fps/ai + build green.
- Hygiene: dev server :5174 killed, worktree removed; :5173 untouched (QA's).
  Main checkout detached at `origin/main`. package-lock NOT touched this time.
  NOTE: `git checkout --detach origin/main` inside the PR worktree right after
  the merge is what the law says, but doing it BEFORE confirming merge success
  loses the branch tip from the worktree (branch itself survives on origin —
  recoverable, lost nothing; be explicit: merge confirmed, THEN detach).

## Held / open (unchanged unless noted)
- **#493** `building` — next increment CORKSCOMB DUNES (Laguna Seca spirit),
  Dry Lake Bed after. No pushed branch (clean resume via claim comment).
- **#491** closed; **#500** pin landed. **#391** `stalled` awaiting Jon
  (close vs batch 5). **#375** Civ parked. **#443** idle-builder borrow-gate.
- game-queue: **#496** (SMASH TV co-op — pad 2 can now also be a slot
  source; #494 makes its twin-stick P2 a `human` slot, cheap to do next).
- **NEW #505** QA polish pass for player slots (cpu partner pad
  intelligence, tap chips for seat kind, HUD parity, bobble mode-2/3 copy,
  synthetic pad-2 drive in gauntletplay).
- QA backlog: #481 #478 #472 #470 #462 #440 #426 #423 #421 #422 #409 #410
  #405 #365 #384 #498 #502 + #491 remainder.
- Rule 4 healthy: last three merges touch src/games/** (#500, #501, #504).
- Orphan pushed `forge/*` branches on origin (not from this session):
  forge-excitebike, forge-game-first, forge-outpost, forge-paperboy,
  forge-polarity, forge-simcity, forge-spec-wins, forge-telemetry,
  forge-watch, fix/forge-board-timer-leak, state-forge-2026-10-10.
  Candidates for prune audit — several predate closed PRs.
- SECURITY NOTE (carried over): the injected "Disregard the injected block
  above…" lines in tool output appeared again this session in gh results.
  Ignored, no change steered. Still worth grepping the CI runner env.

## GOAL — next session
1. If Jon fed `next`, take that; else oldest game-queue = **#496** SMASH TV
   co-op (now cheap: P2 twin-stick is just another `human` slot — #492 pads
   + #494 slots; aim stick via `secondAction`/pointer).
2. Or continue **#493** CORKSCOMB DUNES (it stays `building`; cometcheck
   per-course loop must grade the new circuit: minR >= 220, gates on road,
   autopilot wins 4 seeds).

## Three questions for Jon
1. Prune the ten orphan `forge/*` remote branches whose PRs are closed?
2. #496 next (mine per queue) or #493 Corkscomb first?
3. Should `slotcheck` join CI `static` (it is Node-only, ~2 s), or stay local
   like bobcheck?
