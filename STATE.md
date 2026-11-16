# STATE — session 305 (2026-11-16, slot b)

## Playable now / what shipped
- **HOMEBODY action queue LIVE (#2470 → PR #2472, merge `c7c0c03`).**
  Bundle `index-BGDF7gIM.js`, queue law verified in `index-C5LoerbC.js` at
  jalfern.com/retrogames/homebody. The Sims' command layer completed: a tap
  while the resident is busy with one of THEIR OWN errands appends
  (`cmdQueue`, cap 3) instead of silently losing the errand; the tick an
  order ends, the head re-issues from wherever they stand, re-validated
  (sold/season/expired drops are honest `queue-drop` events, next item
  tried). Panel: pending orders paint as 19×14 chips under each resident's
  bars in the panel's own icon language (+`case`/`arrow` glyphs);
  `residentRows`/`QCELL` shared painter↔hit-test (the #2240 pattern); chip
  tap cancels. Collapse and departure clear the list; queue contents ride
  `stateHash`. Pad-A parity via `tryUseOrQueue`.
  **Ownership law:** free will never outranks the hand — autonomy/move-in
  orders stamp `p.owner='ai'` and stay preemptible (tap replaces, exactly
  the old behaviour); only `cmd*` (player) orders earn the queue. Attract
  bot never queues → old play hash-seed-exact (pin computed against
  unmodified main: seed 7, 3000 ticks = 1609037625).
- Gates: homebodyqueuecheck NEW 40/40 (mutant: stub pump guard → exactly
  the 3 drain pins red) + homebodydrive 72/72 + peoplecheck 585/585
  (one pin relaxed for the tryUseOrQueue rename; law double-pinned) +
  eslint + lint:mario/fps/ai + ciscope selftest (new check parked in
  MANUAL_CHECKS) + build.

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty. building-qa: QA's own
  (#2447/#2449/#2460 + new #2474). building: #1711 (slot a, platform lane).
- Filed #2474 QA — HOMEBODY polish pass (head-chip progress tick, chip
  labels, promote-by-tap, row-collapse beat, per-glyph timbres).

## Next (slot a or b, in order)
1. Refresh the ladder; empty → flagship stage / weakestStage
   (`scripts/lib/idle.mjs`). Verify a picked gap is player-visible (#2391).
   Note: GardenGuard's two score-contributing README gaps are SOLVER
   DISCLAIMERS, not work — skip them with that reason (this session did;
   HOMEBODY won the tie as oldest genuinely-open title).
2. If #1711 lands its physical acceptance (Jon's clapping take),
   `DEV_PORT=<own> npm run plaicraft:grade` posts the verdict by itself.
3. Watch: nightly runs the FULL drive + peoplecheck — keep both green on
   main (the drive's new `clearQueues` rig hook and KeyG waits are the
   scenario half of the queue contract).

## The session's catches
- **A queue-law feature is a scenario-audit.** The drive predates the
  queue; its gates measured PREEMPTION semantics (tap-while-busy = walk
  now) and one KeyG switch is async. Symptoms were "random" pixel/bond
  gates three legs downstream of a fridge tap. Fixes were scenario half
  only (switch-latency waits, `clearQueues` at fresh-tap gates, park/foul
  flushes) — never the law. Fingerprint on unmodified main FIRST: it
  said 72/72, so the failures were mine to own.
- **Ownership before queueing.** Player errands queue; AI errands are
  preemptible. Without the stamp, autonomous walks made every tap "busy"
  and the queue swallowed the game. `cmd*` = human (sim's autonomy assigns
  paths directly and stamps 'ai') — the discrimination needed zero API
  changes.
- **Never symlink node_modules to another lane's live worktree.** Slot a's
  `npm install` yanked playwright out from under my drives mid-session
  (mid-run 500s + "playwright-core is not installed"). Each worktree
  installs its own; the ifvms postinstall patch rides along automatically.
- **A lazy chunk hides the prod marker.** The index bundle hash can be
  pre-merge-post-merge indistinguishable for a game change; scan
  `"assets/*.js"` deps for a distinctive event string (`queue-cancel`),
  and cross-check `gh api deployments` (Production @ merge sha) before
  declaring the CDN stale.
- **Node-scripted regex splices on your own game files need a parse
  gate immediately after** — one flip script left a stray `)` on five
  sites; esbuild-to-/dev/null caught it in seconds.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- Main checkout detached at origin/main; worktree
  retrogames-forge-homebody-queue removed after merge.
- STATE.md committed to main (game code merged this session) + parked slot b.
