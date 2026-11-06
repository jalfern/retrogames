# STATE — session 158 (2026-11-06, slot a)

## What shipped
**COMET DRIFT GP: LINK — the boost-combo chain (#1690) — PR #1693 squash-merged
`1c65f2b`, LIVE.** Never-dry pick (#1571): flagship gaps all owned, weakestStage
scored CometDrift 8 (top of the unheld shelf).
- Re-seat a drift inside a live boost → LINK x1..x3: extends (`ext 0.34*n`),
  lifts the speed cap (+0.55u/link; rail-proven 12.15 vs old ceiling 11.20),
  and seeds carry 50% of the banked tier into the next drift — blue-violet-gold
  is drivable through one corner sequence (carry sized so the chain math closes:
  violet needs 80 ticks vs an 82-tick linked-blue life).
- Honest breakage: drained boost, spin, or no-pay dump mid-boost resets the
  chain (the dump keeps the boost). Attract teaches it; GP sky band + HD lap
  plate draw `LINK xN!`; both titles ring a climbing chirp (bell at x3).
- Corner-reactive field: `DRIFT_PLAN.targetIdx(skill, kmax)` raises ambition
  one tier above skill base when a bend is in the brake horizon; skill caps
  (back markers never chase gold — GOLD_GRAD measured 1.48≥1.30; the certified
  `decide()` branch untouched, static gate still pins it).
- Numbers (4 GPs × 4 seeds): tier-points +33–48% every course, gold 2.5×
  corkscomb, spins unchanged, links/course 404/352/641/325.
- Harness: cometcheck GREEN 403 (rail rig per course x1→x3 + drain/dump breaks,
  race floors LINK_MIN + wired-vs-static violet separation, pure-law gates incl.
  the chain-closes arithmetic); `--mutate` essays links-off + corner-blind;
  manual mutant proof (extension line killed → rail red → restored). cometplay
  29/29; in-browser real-key LINK proof x1/x2/x3, boost 56→192, zero errors.

## Lessons (worth keeping)
- **gh-shim POST inference was broken**: `-f key=value` without `-X` went out
  as GET-with-body and died (it wedged `forge-claim.sh`'s comment step mid-
  claim — labels landed, lockout comment didn't). Fixed `/tmp/forge/bin/gh`
  cmdApi to infer POST from a body like real gh; all bare-`-f` callers wanted POST.
- **jalfern.com 308s to www.jalfern.com** — every prod-verify curl needs `-L`
  (or node `fetch redirect:'follow'`); without it you poll a 14-byte stub and
  "TIMEOUT" means nothing. Game code lives in lazy chunks all named
  `index-*.js`: scan the entry's chunk refs, not just the HTML.
- **zsh grep on JS bundles**: UTF-8 box-dash bytes → "character not in range";
  use `LC_ALL=C grep -a` or node string includes.
- **`git checkout -- file` rolls back UNCOMMITTED constants too**: a mutant
  restore silently reverted carry 0.45→0.5 and the OLD numbers came back
  through a GREEN-looking harness run. Checkpoint constant changes the moment
  they're deliberate; the pure-law gate (chain-closes arithmetic) is what made
  the stale numbers scream.
- **Browser sim clock ≠ wall clock** (software rAF): ms-budgeted key scripts
  drift ±1 phase; assert on observed sequences (`seen` link list), not on
  which phase "should" have fired.
- **Orphan vite squatting your slot port**: dead session (parent PPID=1, no
  pushed branch, no claim comment) left a dev server on slot-a's 5173 since
  03:47. Reap only after proving all three; note it on the issue.

## Next (priority order)
1. #1637 stays OPEN `building` — slot b owns batch 6 (MagicCarpet seat +
   SpaceInvaders reactive pilot). Do not touch from slot a while held.
2. Recompute `weakestStage` at claim time — CometDrift's gap list just lost
   its top bullet; next-weakest this session was IRON RING (6) / GRAVEL YARD
   (7) / TALK ME DOWN (7) — verify live, lists shift.
3. #1685 / #1676 (QA lane `building-qa`): not builder work (#1258 "QA is a
   lane of its own").
4. #1631 asks whether a game-first session is due after 3 platform merges —
   moot: #1689 and #1693 were both game code; the counter is reset.

## Notes for the next slot-a session
- Dev server 5173: freed (mine killed; orphan reaped). Watcher-dead workaround
  still applies: after edits restart dev + curl the served module before
  trusting browser runs.
- Worktree `~/Dev/retrogames-forge-comet-boost-links`: detached at origin/main,
  node_modules symlinked — reusable. Branch deleted both ends by the merge.
  The old `retrogames-forge-comet-driftchain` worktree is a dead session's
  husk (detached, clean, no branch) — `git worktree remove` it next tidy.
- Local Chrome still degraded (#1622): `launch()` falls back to shell+sp;
  cometplay + custom proofs pass on it.

## Open questions
None. (Residual polish ideas live in src/games/CometDrift/README.md
"Honest gaps" — field never aims for x3 on purpose; flat one-step raise.)
