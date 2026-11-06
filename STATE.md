# STATE — session 145 (2026-11-05, slot b)

## What shipped
**WATCH key (#1624)** — PR #1634 squash-merged (`1aa601f`); pilots MYST,
Emberwood, SSX live on prod. One key (**Y**, pad pill ▶ WATCH fires the same
`KeyY`) lets a game play itself on its own proven driver; any input takes over
mid-play. Registry line from shared `WATCH_HELP` (`src/utils/watch.js`).
- SSX: `planner.decide(g, rider0)` — the cold witness line — swaps into the
  human seat in `doSim`; takeover covers keys, stick push and canvas drag.
- Emberwood: attractBot drives the live run; kit policy
  `watchSnapshot/watchRestore` (bot.js) — guide borrows the demo kit, hands
  items/embers/hearts back whole at takeover; world progress stays (real play).
- MYST: new pure `watchResume(st)` (state.js) — first solveScript prefix whose
  canonical state (19 KEYS whitelist) equals yours, replay the suffix: provably
  the same route from where you stand. Off proven line → "no guide yet".
- Harness: `scripts/watchcheck.mjs` (npm `watchcheck`) 13/13 real Chrome incl.
  the no-guide clause (`goto('selGate')` never starts the watcher); mystcheck
  +4 (978/0, mutant `slice(i+1)` died twice), ssxcheck +2 (348/348),
  emberwoodcheck +3 (232/0, kit round-trip).
- Rule 4 CLEARED: #1634 is game code (`src/games/**` + registry).

## Other lanes this window
Slot a shipped #1633 (#1570 knock-recovery tail) and #1635 (PLAICRAFT #1625,
their STATE = session 144 on main). #1570 now `shipped` — the warden's target
for this slot is moot (slot a held the claim; ladder moved to #1624). Filed
follow-ups: **#1637** WATCH rollout (~45 solver games), **#1638** QA polish.

## Playable now
Press Y on jalfern.com/retrogames/myst · /emberwood · /ssx — the games play
themselves, tap anything to take over. Plus PLAICRAFT Gauntlet (slot a).

## Next (priority order)
1. #1637 WATCH rollout batch 1 (chrome is shared; pick games whose solver is
   already live-drivable: IronKeep, Blob Battle, Galaga agents…).
2. #1623 Emberwood stage 2 (held `building-qa` — QA lane's, don't touch).
3. #1638 is QA-lane work (feedback label), not a builder item.

## Gates as of this session
eslint clean (all touched files); lint:mario/fps/ai OK; build OK;
static SUCCESS on #1634; prod bundle carries the WATCH help line (verified
`assets/index-B8bJByNM.js` on jalfern.com). chromeguardcheck pre-existing red
(pgrep dead — machine-level, see below).

## Notes for the next slot
- **`--single-process` Chrome (this box's boot mode, #1622) dies when a heavy
  WebGL page closes** — the whole browser goes, not just the page. Multi-page
  browser scripts must launch ONE BROWSER PER GAME (watchcheck does; it also
  retries openGame once for first-visit Vite reloads). Expect the same failure
  in other multi-page scripts until they adopt it.
- Worktrees share the symlinked `node_modules/.vite` cache → first-visit
  re-optimization reloads can race hook-waits. Retry-once is the pattern.
- **Y (`KeyY`) is now the reserved WATCH key** — don't bind it in new games.
- Main checkout: detached at origin/main, STATE.md committed by this session.
  Worktree `~/Dev/retrogames-forge-watch-key` left on dead local branch
  `forge/watch-key` (remote deleted) — reuse or `git worktree remove`.
- Port 5178 dev server STOPPED at end of session (was mine, this worktree).
- Rescue env `. /tmp/forge/env.sh` still mandatory; transient
  "api.github.com connection" blips hit mid-merge-poll — retry the loop.
- macOS cp: two separate `cp` calls, never `cp A B C`.

## Open questions
- None filed this session (#1631 from slot b's earlier window sits open but
  unlabeled — the jonq guard flagged it; only Jon can label or close it).
