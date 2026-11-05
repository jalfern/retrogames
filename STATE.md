# STATE — session 136 (2026-11-05, slot a)

## What shipped
**WEIGHT SURGERY step 3 — COMPLETE; #1567 CLOSED (shipped)** via PR #1581 squash-merged
`46692ad`, static green, prod content-verified (`r3-verdict` renders live at
https://www.jalfern.com/retrogames/demos/weightsurgery.html).
- **Winner held-out row (scored ONCE, practice-chosen α=4):** MATH 12.0 acc / 10.0 fin
  (MIT-checker 13.0) · GSM8K 15.0 acc / 15.0 fin (MIT-checker 15.0). The lone math diff
  is math500_36, the known #1539 parse-edge.
- Verdict: ×4 scaling doubles MATH vs α=1 (6.0→12.0), +7 GSM8K, **edit-specific** vs the
  basew control (6.0/10.0 same window); +6.5 mean pts over α=1 but **26.0 short of p50cw
  (mean 39.5)** and finished 10.0 vs 51.0 — scaling helps, never breaks the loop.
- Astra: 12/20 declared passes spent; batches.jsonl ledger complete, held-out logged once.
- ws3check 104→119 (§11 harvest gates: rows-vs-aggregate recompute, loser-never,
  ledger-once, regrade coverage, honest-revert + provenance mutants, fixture works pre-
  AND post-landing; §12 open-book trust boundary). r2_mit_grade fixed: no-arg sweep
  crashed on practice sidecars while `||` still touched R3_1567_DONE — own4 coverage now
  re-verified downstream (§11 IS the downstream check).
- Harness bugs caught writing the gates, each now mutant-gated: sum-of-rows→NaN
  (silent-green forever), writeFileSync read+append self-doubling, fixture coupled to
  pre-landing lab state.

## Open on the board (handoff, precise)
- **#1580 open-book control — CLAIMED by slot a, chain RUNNING detached**:
  `r4_openbook.sh` runs from worktree `/Users/jon/Dev/retrogames-forge-ws-step4`
  (detached 46692ad; `.venv`+`data` symlinks live — `.venv` points into ws-step3, do NOT
  retire ws-step3 until #1580 ships). Log `/tmp/forge/ws-r4-1580.log`; math sidecar
  `~/Dev/weight-lab/r2_text/openbook_math.jsonl` growing since 05:44Z. ETA math ~07:15Z,
  gsm ~07:55Z, then regrade → `R4_1580_DONE`. Next slot-a session: new worktree off main,
  harvest `scores_openbook_*`, r2_scores openbook entry, mit_grader rows, batches row,
  markers; page gets an OPEN-BOOK-labelled row + verdict (openbook vs base 3.0/8.0 vs
  p50cw 31.0/48.0 — content-vs-weights); ws3check §12 already guards markers-implies-
  rows and the trust boundary. NEVER read MIT edit tensors/turn logs — final_answer.md only.
- Ladder otherwise: game-queue #1570 (next: robot kit 4a), #838 (MYST); feedback/building
  clear; building-qa #1572 held by QA lane (live at session start).
- Jon's desk: #1557, #1544 unchanged. No jonq filed (nothing taste-level).

## ENV (carry-forward)
- `. /tmp/forge/env.sh`; push `-c http.proxy=http://127.0.0.1:18080`; gh api for comments;
  external curl needs the proxy env (000 without); oMLX at :8000 (API key via api_key()).
- `nohup` on this box: "can't detach from console" — use `r2_detach.py <script.sh> <log>`
  with a .sh wrapper (it execs the arg as a program: pass a shell script, not a .py).
- After squash-merge: fetch BEFORE detaching worktrees onto origin/main (still true, still
  bites). pgrep unreliable -> `ps aux | grep`. zsh aborts ls on missing glob.
- Chrome dead (#737): sim-tier Node is the gate. slot-a port 5173 never started (research
  lane). Fresh worktrees: symlink node_modules; lab venv/data per README #1562 addendum.

## Open questions
- (none filed — #1557/#1544 are Jon's own; linked for continuity only)
