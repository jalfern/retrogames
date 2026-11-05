# STATE — session 135 (2026-11-05, slot a)

## What shipped
**WEIGHT SURGERY step 3 partial — MERGED** `cb1d8e2` via PR #1576 (`Part of #1567`,
issue stays open until its last stage). Resumed #1567 after the warden double-kick
collision (see below); Jon's 23:31Z/00:25Z correction was already coded — this
session RAN it and landed the rows.
- **Candidate 1 basew COMPLETE:** base@window ctx32768 = MATH 6.0/5.0,
  GSM 10.0/8.0 — window lifts accuracy (3→6 / 8→10), finished stuck ~5–8%.
  Escape is not a protocol artifact; p50cw 31.0 remains edit-specific.
- **Candidate 2 sweep COMPLETE on practice** (fresh 64-math, SEED-1562 idx 96–159,
  disjoint asserted, cap 8192, passes P8–P11): base 0.0/0.0 · α2 3.1/6.2 ·
  **α4 6.2/6.2 ← frozen accuracy-first pick** · α8 1.6/4.7 (over-scaling
  degrades). Held-out scored once, winner only — ws3check makes a loser-alpha
  held-out row RED.
- Candidate 3 (layers): top-2 stands (from session 134, merged in the same PR).
- ws3check 90→104 (held-out-once evidence laws, freshness, pick recomputation,
  mutants incl. re-injected v1 held-out sweep). 11/20 Astra passes spent.

## Open on #1567 — the last stage (HANDOFF, precise)
α4's held-out 100+100 row scores **detached right now** (restarted 03:22Z after
merge bookkeeping deleted its in-flight file — stale-tip checkout dropped the fd;
seed 0, deterministic redo). Log `/tmp/forge/ws-r3b-1567.log`; worktree
`/Users/jon/Dev/retrogames-forge-ws-step3` (detached cb1d8e2). ETA math ~04:00Z,
gsm ~04:40Z, then mit regrade → `R3_1567_DONE`. Next slot-a session: resume #1567,
new worktree off main, copy `results/r2/scores_own4_*`, own4 entry in
`r2_scores.json`, `mit_grader.json`, batches rows from that path; rebuild page
(α4 held-out vs p50cw 31.0 + MIT regrade), ws3check, ship, CLOSE #1567.
Then Jon's condition is live: if α4 held-out is still far short of p50cw, an
**open-book** row is authorized (MIT's *written* diagnosis
`~/Dev/weight-lab/mit-exp8/exp8_math/runs/p50c/final_answer.md` only — never
tensors/turn logs; label the row open-book on the page).

## Warden collision (for postmortem — both slot-a sessions agree)
Warden kicked a second slot-a at 00:30:39Z while session 134's 00:20Z checkpoint
was inside the 90-min liveness window → two `FORGE (a)` drivers; session 134 (after
decoding) stood down per one-driver law, having SIGTERM'd my scheduler bash (its
scorer survived; I handled the orphan honestly — gsm-only merge repaired, math
re-aggregated from logged rows, exact match). Suggestion (posted on #1567): a
same-slot checkpoint within liveness = activity; don't kick into a claimed issue.

## Board (end of session)
- #1567 open (building) with precise stage-E handoff above; nothing else in the
  ladder (game-queue/next/steer/feedback/building-qa all clear per 03:15Z check).
- Open questions: #1557 (Jon's own milestone question to the studio) + #1544
  (stale) — unchanged, Jon's desk. No jonq filed (nothing taste-level to ask).
- main tip ≥ cb1d8e2; main-ok true; slot-a port 5173 dev server never started
  (research lane — sim-tier only, Chrome dead anyway #737).
- Two more merges this cycle by other lanes: #1574 (slot b, never-run-dry rule).

## ENV (carry-forward)
- `. /tmp/forge/env.sh`; push via proxy shim; `gh api` for comments (gh pr list
  unsupported). curl localhost needs `--noproxy '*'`.
- pgrep/pkill intermittently die with `sysmond service not found` — use
  `ps aux | grep` for process work on this box tonight.
- **After a squash-merge, fetch BEFORE detaching a worktree onto origin/main** —
  a stale ref detaches onto the pre-merge tip and silently deletes the just-
  merged files still held open by detached chain processes (this bit stage E once;
  rows were recoverable by deterministic redo only).
- Fresh worktrees: symlink node_modules; lab `.venv` lives in retrogames-forge-ws-
  step3 already; `data` symlink per README #1562 addendum.
- zsh aborts whole `ls` when one glob misses — check paths separately.

## Open questions
- (none filed — #1557, #1544 are Jon's own; linked here for continuity only)
