# STATE — session 137 (2026-11-05, slot a)

## What shipped
**#1580 OPEN-BOOK CONTROL — COMPLETE; CLOSED (shipped)** via PR #1584 squash-merged
`0b6ebb0`, static green, Vercel green, prod content-verified (ROUND 4 renders live at
https://www.jalfern.com/retrogames/demos/weightsurgery.html).
- Held-out, scored ONCE (base + MIT's written diagnosis `final_answer.md` verbatim as
  system context, UNEDITED weights, think35 pp1.5 ctx 32768 seed 0 PAR-32):
  **MATH 2.0 acc / 3.0 fin** (MIT-checker 3.0, 1 parse-edge diff) · **GSM8K 4.0 / 4.0**
  (MIT-checker 4.0, 0 diffs).
- Vs same-window base (basew 6.0/10.0): **−5.0 pts mean — inside the ±10pp noise band,
  direction negative**; mean_tokens 31,876/31,504 = runs to the cap anyway — the
  diagnosis doesn't even shorten the thinking. Vs p50cw 31.0/48.0: 36.5 pts short;
  finished 3.5% vs 62.5%.
- **Verdict: reading the diagnosis does nothing measurable — MIT's escape is not
  knowledge their text conveys; it lives in the weights, not the words.** The
  content-vs-weights question the #1567 handoff left open is settled at this horizon.
- Trust boundary held end-to-end: `final_answer.md` only; never tensors/turn-logs/
  manifest; `WS_SYSTEM_FILE` scoped to the one command. Model claim `qwen35-base`
  (gated). Astra budget unchanged 12/20 (pure scoring row, ledger-once).
- ws3check 119→**135**: §13 harvest gates (rows-vs-aggregate via shared helper,
  ledger-once, regrade coverage, DONE-marker chain, contaminated-model-claim mutant) +
  page provenance/honest-revert mutants. Crash found writing it: verdict crashed on
  `null.toFixed` when the same-window control was dropped — verdict now *needs its
  control* (mutant-gated).

## Open on the board (handoff, precise)
- **`r4_openbook.sh` chain DONE** (07:54Z) in ws-step4; all artifacts harvested and
  merged. The ws-step3→ws-step4→ws-openbook `.venv`/`data` symlink chain is no longer
  load-bearing for #1580 — those worktrees may now be retired (lab README #1562
  addendum re-creates venv per worktree if a step 5 ever runs).
- Ladder: game-queue **#838 (MYST**, multi-stage, item 1 merged as #1582 by slot b),
  building **#1570** held by slot b (draft PR **#1583** WIP: robokit 4a items 1+2
  code-complete 17/18 green, per slot-b report parked 07:52Z), building-qa #1572 (QA
  lane). Next slot-a candidate off the ladder: #838 (oldest game-queue).
- Jon's desk: #1557, #1544 unchanged. No jonq filed (nothing taste-level).

## ENV (carry-forward)
- `. /tmp/forge/env.sh`; push `-c http.proxy=http://127.0.0.1:18080`; gh api for
  comments; external curl needs the proxy env; oMLX at :8000 (key via api_key()).
- GitHub rate: the gh-shim 404s `/rate_limit` but issue/pr endpoints work fine.
- `nohup` broken on this box: use `r2_detach.py <script.sh> <log>` (execs arg — pass
  a .sh wrapper). pgrep unreliable -> `ps aux | grep`. zsh aborts ls on missing glob.
- After squash-merge: fetch BEFORE detaching worktrees onto origin/main. gh deletes the
  remote branch even when the worktree holds the local one — `git checkout --detach
  origin/main` in the worktree first, then `git branch -D` is clean.
- Chrome dead (#737): sim-tier Node is the gate. slot-a port 5173 unused this session
  (lab lane). Fresh worktrees: symlink node_modules; lab venv/data per README addendum.

## Open questions
- (none filed — #1557/#1544 are Jon's own; linked for continuity only)
