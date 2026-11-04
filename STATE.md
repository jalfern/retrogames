# STATE — session 127 (2026-11-04, slot a)

## What shipped
**WEIGHT SURGERY step 2 (#1562) — MERGED** `2ee8b35` via PR #1565. Qwen found its
own weight edit under Astra rules and it is scored honestly against OUR p50cw row.

- Search spent **5 of the 20 disclosed passes** (3 gen ×64 @8192/4096 on MIT practice
  problems + 2 teacher-forced reads), no gradients, no MIT edit tensors ever read,
  norm/embed/lm_head untouched; every pass in `batches.jsonl` with purpose+ruled-out.
- Direction: `mlp.down_proj` layers **[15, 7]**, top-K 128, α=1.0
  (L23 rejected — held-out sep showed its dominant gap was the EOS confound);
  262,144 values ≈0.035% of the model → `~/models/weightlab/qwen35-own`.
- Rows (think35, pp1.5 whole-gen ctx 32768, PAR-32, fixed 100 MATH-500 + 100 GSM8K
  seed 1533, MIT `mathqa.py` regrade of every new row):

  | row | MATH acc/fin | GSM8K acc/fin | MIT MATH/GSM |
  |---|---|---|---|
  | base | 3.0 / 3.0 | 8.0 / 7.0 | — |
  | own | **6.0 / 6.0** | **8.0 / 8.0** | 7.0 / 9.0 |
  | p50cw | 31.0 / 51.0 | 48.0 / 74.0 | 37.0 / 48.0 |

- Verdict (on the page): own direction doubles base MATH but does not break the loop
  — finished 6/8% vs 51/74; ~33 pts mean short. Round-1 escape gap not closed.
- `/demos/weightsurgery.html` ships the round-2 table, MIT column, pass ledger,
  and the not-run disclosure for basew (time-box). Prod verified 200 + verdict copy.
- ws3check **75 gates** (was 44 at session start; +4 closeout gates, mutant proofs).
- **Spun off #1567** (lane:research): basew control, α-scaling sweep {2,4,8},
  top-4-layer own edit, bigger natural-fin corpus — with expected payoff order.

## Same cycle, other lanes
- Slot b shipped ADVENTURE de-wedge `4ab5f89` (#1559) before this session merged;
  Jon's #1557 (next milestone?) still wants a title proposal, #1544 stale-open.

## Harness fixes earned this session (all committed)
- `r2_score.py`: aggregate **merges** tag entries (gsm-only run erased p50cw.math);
  resume-only runs keep previous protocol metadata (a resume without WS_R2_PP_CTX
  wrote pp_ctx:0); zero-generation rows no longer log as passes; sidecar writes
  dedupe on resume; `nullcontext` replaces None in the `with` (resume crash).
- `r2_mit_grade.py` must run with NO args (all sidecars) — argv subsets silently
  drop prior rows from `mit_grader.json`.
- `common.py`: pyarrow import guarded (lab venv 3.12 has no PyPI reach; math_train
  is never scored). Do NOT copy the pyarrow tree across venv py-versions (3.14≠3.12).
- Runner `r2_run_1562.sh`: convert guard, basew commented out with reason.

## Board (end of session)
- Ladder dry; only #1141 carries `building` (Jon, stalled). #1562 closed.
- research: #1567 fresh. #1566 (digest parse bug), #1557/#1544, #838 MYST open.
- main tip `2ee8b35`; main-ok true; static/smoke/scope green on the merge.
- Worktree `retrogames-forge-ws-qwen-edit` remains on `forge/ws-qwen-edit`
  (branch delete refused remote-vs-worktree; remote gone, local ref gone).

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh+proxy; push via `-c http.proxy=http://127.0.0.1:18080`.
- **Draft→ready via shim**: REST PATCH draft=false is ignored; use
  `gh api graphql --input -` with `markPullRequestReadyForReview` and the PR
  node_id (heredoc-jq the JSON — inline `-f` params get dropped by the shim).
- www.jalfern.com needs `-Lsx http://127.0.0.1:18080` (plain curl → 000; -k → 308).
- Lab venv `demos/weight-surgery-lab/.venv` (py3.12+mlx-lm): run scripts from the
  lab dir; `data/` = symlink to `~/Dev/weight-lab/qwen-forge/data`; oMLX key at
  `~/.omlx/settings.json` → `auth.api_key`; NO_PROXY=127.0.0.1,localhost.
- oMLX shared box: other lanes' traffic fills server.log — grep `model=qwen35-own`.
  A scored row writes nothing until its full 100-problem set finishes (main-thread
  grading): zero rows for ~40 min mid-row = normal, watch server.log not the file.
- pgrep broken → `ps -ax -o pid,etime,command`.

## Open questions
- (none filed — no jonq needed; #1567 carries the next-step candidates for review)
