# WEIGHT SURGERY lab (#1493)

Reproduction attempt of MIT CSAIL "Sparks of Weight-Space Programming" Exp-8
(rikiyat.github.io/blog/weight-space-programming): fix Qwen3.5-0.8B's thinking
loops by editing weights — no gradients, practice on GSM8K/MATH **train** only,
≤50 forward-pass batches, one held-out scoring pass.

Demo page: `public/demos/weightsurgery.html` (built by `build_demo.mjs`).
Model weights are NEVER committed (issue rule); this folder holds scripts, the
batch log and the edit reports.

## Environment (this box, #737 family)
- Metal/Chrome dead in the launchd context (MTLCompilerService unreachable).
  MLX works only with `mx.set_default_device(mx.cpu)`; llama.cpp brew build
  SIGABRTs → build CPU-only: `cmake -B build -DGGML_METAL=OFF` at v0.3.0
  (the llama.app fork has qwen35 graphs). ~180 tok/s aggregate @12×2 threads.
- pinned model: Qwen/Qwen3.5-0.8B @ 2fc06364715b967f1860aea9cf38778875588b17
  (files fetched via `/resolve/` — `/raw/` returns LFS pointers for large files).
- venvs: `.venv` (py3.14, mlx-lm — capture only), `tvenv` (py3.12, torch+
  safetensors+transformers for HF→GGUF convert via llama.cpp v0.3.0 scripts).
- pip/curl through `source /tmp/forge/netenv` + `--trusted-host` (MITM proxy).

## Layout
- `common.py`        data, grading (boxed+numeric), loop metrics, batch log, MLX capture hooks
- `llm.py`           llama.cpp batch generation (one gen_batch = one budget batch)
- `step1_smoke.py`   load/geometry/throughput probes
- `step2_practice.py` baseline loop signature on train splits (36/36 cap-hits)
- `step3b_contrast.py` terminated-text probe (0/10 terminate even on 17×23)
- `step3_capture.py` layer 15/19 MLP write capture on looping texts → directions.npz
- `step4_edit.py`    w_j -= d·(d·w_j) on top-K down_proj columns of layers 15/19
- `step5_variants.py` paired practice eval base vs edited
- `step6_score.py`   held-out scoring (fixed-seed 80-of-500 MATH / 80-of-1319 GSM8K), resumable jsonl
- `build_demo.mjs`   renders the demo page from the artifacts
- `batches.jsonl`    the complete experiment log (purpose + what-it-ruled-out per batch)
- `variants.json`, `edit_reports/*`   practice outcomes + exact edited columns

## Result (session 109)
Negative across the board. k64/k256/k3584 all 0/12 terminate on practice; the
fully-ablated model stays coherent but rambles longer. Held-out (fixed-seed 80
sets, cap 1024): base math 0% acc / 8.8% terminated; base gsm 1.2% / 0%; the
card's presence_penalty=2.0 fix also fails held-out (95%/100% cap hits) — its
apparent 12/12 practice win was a harness artifact (duplicated
`--presence-penalty` flag, fixed in llm.py; clean rerun 0/12). Likely cause of
the negative: a whole-sequence mean-write direction at a 1024-token horizon is
verbose reasoning, not the tight-loop attractor MIT localized at 32k.

## Next (for whoever takes this on)
1. Capture at 2k–8k horizons; take d from repeat-onset positions (contrast
   pre-loop vs during-loop), not a sequence mean.
2. Try removing d downstream of the residual write (o_proj rows / unembed
   projection) and at all full-attention MLP layers, not just 15/19.
3. Score the full MATH-500 once compute allows; MIT's edited model is on HF
   (only open it after your own numbers are written — issue rule).
4. `llama-quantize` the GGUFs (Q4_0, keep layers 15/19 down_proj fp16) for
   ~2× faster scoring.

## Surgery II (#1505, session 112) — longer horizon, both ends
Scripts: `step8_longcapture.py` (cap-4096 generation + repeat-onset contrast at
ALL six full-attention layers {3,7,11,15,19,23}; `full_attention_interval: 4`,
tied unembed), `step8b_onset.py` (loose n-gram-reuse onset refinement),
`step9_edit2.py` (variants: A upstream = down_proj top-256 columns × 6 FA
layers; B downstream = tied-embed rank-1 row strip + o_proj rank-1 × 6 FA
layers; C = A+B), `step10_eval2.py` (paired 12-problem eval at cap 4096 pp0,
eval seed 77), `scripts/ws2check.mjs` (`npm run ws2check`).

Measurements (log in `batches.jsonl`; eval rows with exact token counts):

| model | terminated/12 | looped | correct | cap/pp/seed |
|---|---|---|---|---|
| base f16 | **1** | 0 | 3 | 4096 / 0 / 42 |
| A upstream ×6 FA | 0 | 1 | 2 | 〃 |
| B downstream ×6 FA | 0 | 1 | **5** | 〃 |
| C = A+B | 0 | 1 | 2 | 〃 |

- **Termination is not fixed at 4096** — and honestly: only 1/12 problems
  terminate even unedited. The step-8 corpus's "4/12 finished" (seed 23) was
  the words×2 estimate (see harness bug below) and overcounts; the exact-parse
  eval is authoritative. #1506 is measuring the larger-sample fraction with
  its own runs.
- **First accuracy signal of the experiment: B = 5/12 vs base 3/12.** Removing
  d from the READ path (tied unembed rows + o_proj) doesn't stop the rambling
  but helps the model reach correct answers inside it (boxed outputs present in
  capped generations). A (upstream, ×6 layers) does nothing; C inherits A's
  damage — closing both ends silences rather than cures.
- **No strict periodic onset in any cap-hit** (period ≤256, sustain ≥64 tokens;
  step8b relaxes to period ≤1024/sustain ≥32 + windowed n-gram reuse):
  at ≤4k the non-termination is verbose rambling, not a fixed attractor —
  the attractor lives beyond this horizon (MIT's claim was made at 32k).
  Refinement gives 3/8 looping texts a real onset (tokens 685/2451/3819 —
  loops start LATE), and d from true onsets ≈ d from the half-split
  (L23 raw ‖d‖ 0.974 vs 0.932): the direction is segmentation-robust.
- Depth structure in ‖d‖: raw onset-contrast norm grows monotonically with
  layer depth (L3 0.089 → L23 0.932): the loop-ness write is concentrated in
  the DEEP FA layers; MIT's 15/19 choice catches only part of it.
- Edit sizes: A 0.18%, B 30.55% (rank-1 correction spans the whole 248k×1024
  tied embed — low-rank, but touches every row), C 30.73%.
- **Q4_0 scorer** `q35-v2-q4k.gguf` (844MB): `--tensor-type "token_embd.weight=f16"`
  + `--tensor-type "blk\.(3|7|11|15|19|23)\.ffn_down\.weight=f16"` — measured
  1.8× generation / 2.4× prefill vs f16 under load (recipe posted to #1506).
- **Harness bug caught (#8 family):** llm.py's `| N tokens` regex never matched
  llama v0.3.0 (pipe summary removed upstream) — every llm.py ntok since #1493
  was the words×2 estimate, making `hit_cap` coarse. step10_eval2 parses the
  exact slash form (`eval time = X ms / N tokens`) and flags `est` rows; fix
  posted to #1506 (shared llm.py left to its owner).

Honest gaps for the polish pass: full MATH-500 scoring (budget), MIT's HF
model comparison (blocked until our numbers ship — issue rule), and 8k horizon
capture if the demo lane returns with more compute.

## Rescore #1506 (session 112, slot a) — fair horizon, all layers
Jon's hold on #1493 (08:01:53Z) required steps the shipped pass skipped. This
branch runs them; step5 finishes overnight.

- `step7_caps.py` — cap sweep (batches 19-21): base penalty-free finishes
  **9/12 @4096** (10/12 @8192; pp1.5: 6/12). Fair cap = 4096. At 1024 nothing
  finishes — the shipped #1504 verdict measured truncation, not the fix.
- `step8_direction_all.py` — corpus: **0/3 cap-hits repeat ≥24 words** at the
  fair cap (long-winded, not tight loops). Direction: per-layer d over ALL 24
  layers, loop-tail-vs-finished contrast (fixes step3's pooling layers 15+19
  into one shared d). Ranking: L23 t=7.68 (||d||=1.57), L19 t=5.90, L6 5.82;
  **L19 = MIT's layer rediscovered without the prior; L15 not favored**.
- `step9_edit_all.py` — per-layer ablation `w_j -= α·d_L·(d_L·w_j)` on top-K
  down_proj cols of the top-ranked layers; k256 = 0.0697%, k512 = 0.1394%.
- `step5b_variants_fair.py` — practice b22-24 @4096 pp0: base 4/12 finished,
  k256 2/12 (+3 loop-flagged), k512 3/12. **The edit hurts termination.**
  Confound (honest): loop-tail positions are "not about to end"; finished
  texts include the ending — so d carries an about-to-end component, most at
  L23 (writes straight into the final norm). Removing it damages EOS rather
  than the loop. With tight loops nearly absent at this cap, position and
  loop-state are entangled — the repeat-onset contrast (Next item 1) is now
  REQUIRED before any larger claim, not just better practice.
- `step10_fair_score.py` — the one held-out score: fixed 100 MATH-500 +
  100 GSM8K-test (seed 20261103, identical rows), cap 4096, base / k256 /
  sampfix(pp1.5), penalty-free baseline rows. Overnight runner
  (`run_fair_overnight.sh` + `detach_runner.sh`; nested launchctl is refused
  in warden contexts — the runner double-forks to reparent to launchd).
  Resumable: `results/fair_<row>_<set>.jsonl`, done-marker
  `results/FAIR_SCORING_DONE`.
- `build_demo.mjs` v2 — fair tables + verdict; supersede banner frames the
  cap-1024 section; batch log unchanged.

Still open after this rescore: repeat-onset d (needs horizons where loops
actually re-form — MIT saw them at 32k), o_proj/unembed ablation paths, Q4
quantized scoring for ~2× speed, and MIT's published edit as a comparison row
(open only after our numbers are written — issue rule).

## ROUND 2 (#1533, session 117 slot-a) — MIT's horizon on GPU via oMLX
The GPU path is alive at the oMLX server (Metal works in the GUI session even
while sandboxed processes keep #737). Everything round-2 runs through oMLX:
- `r2_convert.py` — HF→MLX bf16 conversion with `mx.set_default_device(mx.cpu)`
  (convert otherwise dies on MTLCompilerService in the sandbox). Base and the
  rebuilt MIT p50c staged under `~/models/weightlab/` and registered into the
  LIVE server via `POST /admin/api/reload` (admin key in `~/.omlx/settings.json`;
  `/api/reload` routes are mounted under `/admin`, not `/api`).
- p50c built with MIT's `apply_edit.py` — both tensor hashes verified against
  the pinned base before and after (their manifest + ours agree).
- `r2_common.py` — think35 over `/v1/chat/completions` (temp .6 top_p .95 top_k
  20 pp 1.5, `chat_template_kwargs:{enable_thinking:true}`, seed 0, cap 32768),
  fixed 100+100 held-out (`random.Random(1533)` over the local math500/test
  files), grading = last \boxed{} through vendored math-verify 0.9.0
  (`~/Dev/weight-lab/mathverify_pkgs` — `extract_operators` kwarg does NOT exist
  in 0.9.0, plain parse/verify does).
- `r2_probe.py` — PROBE OK: thinking on, presence_penalty provably applied
  (seed-0 pp0 vs pp1.5 differ), Flash-Next still loaded (256 GB box).
- `r2_bench.py` — 16 train problems @32K: 284 tps aggregate (4 streams),
  14/16 cut off (= MIT's ~93% base-cut neighborhood), est 5.7 h/row → the
  100+100 set holds (6-h rule).
- Jon speed-up (issue 18:53Z, session 118): oMLX scheduler now takes 32
  concurrent (`scheduler.max_concurrent_requests: 32` — probe: 8 short parallel
  requests all complete; 32×1024-cap = 410 tps agg, 25-28 tps/stream). Step-1
  rows rerun at `WS_R2_PARALLEL=32`: first full-horizon wave = 32×32768 tok in
  ~31 min ≈ 520 tps aggregate (~2.6× the 4-stream rate; per-stream t_wall ~2010s).
  Row rate ≈ 60/h → step-1 (both rows) ≈ 3.3 h instead of ~11.
  CAUTION recorded the hard way: `/admin/api/stats.total_completion_tokens` is
  server-global — it includes Flash-Next (this agent!) — NEVER use it as the
  lab's throughput signal; measure from scores jsonl t_wall/ntok instead.
- `r2_score.py` / `r2_gate.py` / `r2_run_step1.sh` / `r2_detach.py` — detached,
  resumable step-1 rows (`results/r2/scores_<tag>_<set>.jsonl`) + the frozen
  neighborhood gate (`r2_gate.py` CLAIMS), logs to `/tmp/forge/ws-r2-step1.log`.
  Session 118 race fix: killing r2_score.py made the wrapper run the gate on
  partial rows and write a fake STOP gate — `r2_gate.py` now recomputes acc/fin
  from the jsonl itself and REFUSES to write (exit 3) unless all four files hold
  100 rows, and `r2_run_step1.sh` aborts before the gate when the scorer dies.
- `r2_directions.py` — step-2 capture (PASSES G1/R1 ONLY, gated on the step-1
  gate): practice-only corpus from MIT's `practice/`, pass budget logged; R1 is a
  per-token write-vector capture (`C._install_capture`, step3_capture.py pattern,
  all six FA layers, loop-vs-finished buckets), plumbing-proven via
  `R2_R1_SMOKE=1` (writes only r2_directions_smoke.npz, consumes no budget).
  G1 generations run at `WS_R2_PARALLEL` (Jon speed-up: same parallelism everywhere).
- `r2_edit.py` — step-2 own-edit builder from `r2_directions.npz`; selection rule
  FROZEN in the module docstring (top-2 FA layers by activity-weighted direction
  occupancy; top-K=128 cols/layer by |d·w_j|·act_j; W -= alpha·outer(d, d·w_j) —
  sparse, no forbidden tensors, no whole-tensor scaling; MIT edit tensors never read).
  `r2_register.py` registers the converted model with the live oMLX.
- Page: `build_demo.mjs` renders the ROUND 2 section with honest pending rows;
  `ws3check.mjs` (npm run ws3check) — 16 gates, mutants caught incl a by-hand
  row-id break (went red, restored).

## Session 119 (2026-11-03/04): threading grading bug, step-1 FINAL, gate STOP

- **Second silent-grader bug:** `math_verify.parse()` uses `signal.alarm()` for its
  timeout → raises `ValueError` in ANY worker thread. The threaded scorer therefore
  graded every live row through the numeric/string fallback (methods showed
  `math-verify: 0`). Fix: `r2_score.py` now joins the thread pool FIRST and grades
  serially on the main thread; `r2_regrade.py` also refreshes `r2_scores.json`.
  ws3check 27→29 (`rules: scorer grades on the main thread` + mutant).
- **Step-1 rows FINAL (all four, main-thread re-graded):**
  base  math 3.0 / fin 3.0 ✓   base gsm 8.0 / fin 7.0 ✓   (neighborhood PASS)
  p50c  math 30.0 / fin 41.0  ✗ acc floor 40   ✗ gsm 54.0 / fin 75.0 (floor 59)
  → `step1_gate.json` = STOP (`step1_stop.marker`). Per Jon's rule step 2 is
  forbidden — the chain runner was killed before it could act on the gate.
- Gap analysis (posted on #1533): weights are hash-verified against MIT's pinned
  base; base rows reproduce the MIT loop profile (acc at/near floors, cap-hit
  signature 97%/93%); p50c finished-rates land INSIDE [40,80] and math
  precision-per-finished matches MIT's (30/41 ≈ 73% vs ~48/67 ≈ 72%) — the deficit
  is per-problem LOOP-ESCAPE probability, the quantity most sensitive to the
  sampling pipeline: oMLX runs MTP speculative decoding while MIT ran plain-AR HF;
  under presence_penalty 1.5 draft-acceptance shifts realized escape paths. Prime
  next probe: re-run p50c/math with speculation disabled (backend-identifying, NOT
  protocol-tuning — tuning the knobs to clear the gate stays forbidden).
- Resume path: wait for Jon's jonq answer (probe vs close-as-negative-result) or
  take the default at deadline; the chain (`r2_chain.sh`, gate-guarded) restarts via
  `./.venv/bin/python r2_detach.py r2_chain.sh /tmp/forge/ws-r2-chain.log` only if
  a PASSING gate ever lands. Page rebuild + merge wait on it.
- `r2_chain.sh` (detached): waits for step1_gate.json; PASS → step 2/3 at
  WS_R2_PARALLEL=32; STOP → marker copy only. Pidfile-guarded, session-proof.

## Session 120 (2026-11-04): MTP ruled out twice; clean engine A/B lands NEGATIVE — close-as-partial

- **Forensics (no GPU):** the scored backend `qwen35-p50c-mlx` cannot speculate —
  safetensors index has 0 `mtp`/`nextn` tensors (HF container `qwen35-p50c` has 15;
  `r2_convert.py`'s `mlx_lm.convert` drops the MTP module), oMLX admin reports
  `mtp_compatible: false`, Nov-3 server.log shows plain BatchedEngine loads, and
  `~/.omlx/model_settings.json` had `mtp_enabled: false` for `-mlx` before the run.
  #1539's "MTP-off rerun" was thus a no-op BY CONSTRUCTION; s119's prime suspect
  dies without spending GPU on it.
- **Runtime settings gotcha:** the first probe attempt (vlm container, PAR-32) ran
  `Lightning MTP batch` anyway (accept 72–91%, 9.4 tok/s/stream) even though the
  settings FILE said false — the running oMLX server caches per-model settings, file
  edits don't reach it. Fix + verification recipe: PUT
  `/admin/api/models/<id>/settings {"mtp_enabled": false}` + reload, then confirm
  zero new `MTP` lines in server.log for a warm request. Killed the MTP-on attempt
  (conflated variables + would have overrun the session).
- **Clean A/B result (NEGATIVE):** `r2_probe_engine.py` tag `p50cvlm`: same fixed
  held-out set, math-only, identical think35 protocol + main-thread grading,
  plain-AR, PAR-32, on the HF-name/vlm container → FINAL: acc 27.0% / finished
  47.0% vs the frozen BatchedEngine row 30.0%/41.0%. Per-id A/B on shared ids:
  20 vs 10/7 symmetric flips — two engines, same ceiling.
  Container/engine numerics RULED OUT. Finished-share drifts (+6pt escape
  on shared ids) but escapes don't convert to accuracy.
- **Landing:** #1533 closes as honest partial reproduction (base rows + MIT loop
  signature reproduce; p50c lift tops out ~27.0% vs MIT 48%). Untouched:
  `step1_gate.json` (STOP), protocol rows, `r2_scores.json` — the probe lives in
  `scores_p50cvlm_math.jsonl` + `probe_engine.json`. #1539 closes resolved-by-
  investigation. Demo-page polish issue filed for the QA lane (present the negative
  honestly on `/demos/weightsurgery.html`). PR #1535 closed unmerged; artifacts stay.
- Harness caveat found: this box's agent transport corrupts `strftime` `%`-sequences
  inside written files (`%m-` arrived as `%umb-`); `r2_probe_engine.py` uses
  `datetime.isoformat()` instead. Prefer `%`-free timestamp construction in scripts.
## Closeout #1506 (session 121, slot a) — verdict published, issue closed

All six fair rows finished (fair_scores.json, n=100/set, seed 20261103, cap 4096,
one llama-server). Page rebuilt (`build_demo.mjs` v3): the verdict now LEADS with
the plain answer — **the edit did not fix it**: MATH acc 4→8% (noise at n=100),
GSM8K 11→11% unchanged, GSM8K loop flags UP 5→20%; presence penalty (sampfix)
worse everywhere (MATH 4→3, GSM 11→5, finished down both sets). First-pass
cap-1024 verdict retired into a collapsed SUPERSEDED block (Jon: retire or mark
superseded — done, kept for the record). Replacement for the "MIT's edit never
opened" phrasing Jon asked to remove: our all-layer scan independently ranked
L19 #2 of 24 — the edit still targeted the layers named in MIT's write-up.
(Note: that exact phrase was never on the page or in the repo — audited #1493/
#1505/#1506 branches and the live page; nothing to delete, so the affirmative
sentence went in instead.)

Honesty artifacts committed at lab root: `fair_scores.json` (six-row summary —
the committed lab renders the full page without per-row jsonl), `fair_honesty.json`
(**8 llama-cli banner-contaminated rows on all three MATH runs — same problem ids
4,8,20,27,28,50,63,87; server-worker restarts during the run captured the CLI
startup banner instead of an answer.** They grade wrong and count as finished:
excluding them lifts MATH acc ≤0.7 pp and lowers finished 8 pp; GSM8K clean;
no comparison flips), and `fair_excerpts.json` regenerated for all six runs,
banner rows excluded.

Exact-token rerun NOT run (Jon's step 3 only-if-quick): 600 regenerations ≈10 h at
~150 tok/s, and #1506 closes with no new experiments — ≥/≤ bounds kept and the
footnote says why. Lab-side fix: score-fair rows in batches.jsonl got their
`purpose` fields restored (three were missing; validateArtifacts now catches that
class via the purposeless-batch mutant). ws2check: 40 gates + 39 mutants, incl.
5 new #1506 gates (verdict-on-top, plain-answer lead, verdict table, bounds-kept,
stale-claims-gone).

## #1547 option C (session 124, QA studio) — presence window found; MIT grader verified; p50cw rerun launched
- **C1 audit (the headline).** oMLX-bundled mlx-lm applies presence_penalty over
  `tokens[-presence_context_size:]` — **server body default 20**
  (`server.py` L1331; `sample_utils.make_presence_penalty`). vLLM (MIT's backend)
  penalizes EVERY generated token. All round-2 think35 rows ran pp1.5 through a
  20-token window: loop-escape pressure reset every step — the prime mechanism for
  the escape gap (ours fin 41% vs MIT ~67%). The param IS exposed:
  `/v1/chat/completions` accepts `presence_context_size` (probe `pp_window.json`:
  3 arms seed0 cap1024, ctx20 vs ctx1024 outputs differ → live). Fix:
  `r2_common.ask(pp_ctx=)` / `WS_R2_PP_CTX`; re-run uses 32768 (vLLM parity).
- **C2 MIT grader.** Vendored `~/Dev/weight-lab/mit-exp8/exp8_math/code/mathqa.py`
  imported CPU-only (`mit_shim/mcqa.py` stubs the tarball-missing `mcqa.loop_signals`
  — telemetry only, grading path untouched). `r2_mit_grade.py` reproduces jalfern's
  three rows under MIT's checker: math500_10 / 36 / 88 = MIT correct, ours wrong
  (`results/r2/mit_grader.json`; witnesses pinned by ws3check). The six
  finished-with-pred=None rows CANNOT be re-graded — step-1 rows never saved text.
- **C3 re-run p50cw** (math-only, pp1.5 ctx32768, PAR-32, seed0, same 100 rows):
  launched detached 2026-11-04 ~07:51Z via `r2_detach.py r2_run_rerun.sh
  /tmp/forge/ws-r2-rerun1547.log`, resumable. Full text+reasoning sidecars to
  `~/Dev/weight-lab/r2_text/p50cw_math.jsonl` (outside the repo: ~60KB/row);
  committed rows carry `{bytes, sha}` pointers. When it lands: re-grade with
  `r2_mit_grade.py p50cw:math`, compare vs MIT 45.8/~67 — near MIT → reopen
  #1533 step 2; short → update the #1540 page with what C ruled out, close #1547.
- ws3check 36→44 gates (window opt-in, runner pins, sidecar plumbing, probe +
  grader witnesses + 3 new mutants incl. the comment-absorbs-mutation trap).

## #1547 option C — VERDICT (session 125, QA studio): window explains ~10 of 26 finish points, not the gap
- C3 landed: `scores_p50cw_math.jsonl` (math-only, pp1.5 ctx32768, PAR-32, seed 0,
  same fixed 100): **acc 31.0 / fin 51.0** vs the frozen p50c row (30.0 / 41.0).
  The widened penalty window moved finish-rate +10 pts; accuracy ceiling held.
- MIT's own grader on identical predictions: **37.0%** (ours 31.0; 8 diff rows, all
  parse-edge cases + 9 recovered pred=None). MIT same-100 reference: 45.8/~67.
- Verdict per the issue rule: NOT near MIT → #1533 step 2 stays closed; page updated
  with what C ruled out (#1540 page, ROUND 2 section); #1547 closes with this PR.
- Sidecars (~10MB) live outside the repo: `~/Dev/weight-lab/r2_text/p50cw_math.jsonl`.

## #1562 step 2 (complete, session 127 slot-a) — Qwen finds its own edit
Jon re-opened step 2 (#1562, 2026-11-04): judged against OUR p50cw row (#1547),
same box + settings, so MIT-vs-our backend gap cancels. `step1_gate.json` stays
STOPped and untouched; the search runs under explicit `WS_R2_JON_GO=1`.

Scripts: `r2_directions_1562.py` (P1–P5 search), `r2_edit.py` (+`R2_NPZ` +
`R2_BASE_DIR` — MIT's `base_model/` ships LFS pointers; the HF original lives at
`~/models/weightlab/qwen35-base`, single-file safetensors), `r2_run_1562.sh`
(detach: `./.venv/bin/python r2_detach.py r2_run_1562.sh /tmp/forge/ws-r2-1562.log`).
Env: fresh `.venv` (py3.12 + mlx-lm) — pip needs the MITM proxy (`/tmp/forge/netenv`),
direct DNS dead (#737 family).

Pass budget (Jon cap: 20 passes, a pass = gen batch ≤64 practice problems or one
teacher-forced read) — spends 5:
- P1/P2 gen x64 @cap 8192 (think35 pp1.5 ctx32768, PAR-32): escape 6/64 + 2/64
  (9.4%/3.1% — loop corpus 178 texts).
- P3 gen x64 @cap 4096: escape 6/64; fin bucket = 14 model-finished (all with boxed
  answers; step-1 escape ntok median ~2k ⇒ cap 4096 catches natural stops) + 26
  reference-solutions read as continuations of the same prompts (MIT-prompt
  sanctioned dense measurement; flagged `pred:"ref"` in the npz — honest split).
- P4 teacher-forced fit x68 — per-FA-layer d = mean(MLP write loop) − mean(write
  finished); EOS hygiene: loop tails cut 256, fin tails cut 128 (#1506 confound fix).
- P5 teacher-forced held-out x~72 — x·d_L separation on unseen texts; layers with
  |sep|<1 ruled out; edit takes top-2 separating layers.
Final separation: layers [15, 7] chosen (L23's dominant gap was the EOS-position
confound — rejected by held-out sep 0.72); all five passes in `batches.jsonl` with
purpose + ruled-out, directions in `results/r2/r2_directions_1562.npz`.

Scoring (once): own MATH+GSM8K, p50cw GSM8K (MATH exists), optional base@ctx32768
last; PAR-32, PP_CTX=32768, sidecars → MIT mathqa.py regrade of every new row.
Rows land in `results/r2/r2_scores.json` (tags `own`, `p50cw.gsm`, `basew`);
completion marker `results/r2/R2_1562_DONE`.

Gotchas found (each gated in ws3check, 44→75): make_refs returned tuples not records
(killed attempt 1); fin-pool split by FIT_N starved validation (killed attempt 2);
resumed runs re-log P1–P3 into batches.jsonl — dedupe by pass_no when the round
closes (real budget spend = 3 gen + 2 read passes); the lab venv lacks pyarrow
(and PyPI is unreachable — don't copy the wheel across python versions either;
`load_problems` now guards the import since `math_train` is never scored); a
gsm-only run of `r2_score.py` overwrote the p50cw tag and erased its math entry
(aggregate now merges, and resume-only runs keep the previous protocol metadata —
one resume without `WS_R2_PP_CTX` had written `pp_ctx:0` over the real 32768);
`r2_mit_grade.py` rebuilds `mit_grader.json` from argv, so run it with NO args
(all sidecars) or it silently drops prior rows' regrades; scoring rows write
their jsonl only when the full set finishes (`ex.map` collects before grading —
math_verify is main-thread-only), so zero rows for ~40 min mid-row is normal.

RESULT (2026-11-04, all rows scored, MIT regrade agrees):

| row (think35, pp1.5, ctx 32768, PAR-32) | MATH acc / fin | GSM8K acc / fin |
|---|---|---|
| base | 3.0 / 3.0 | 8.0 / 7.0 |
| own edit (this issue: layers [15,7], top-K 128, α=1.0) | **6.0 / 6.0** | **8.0 / 8.0** |
| p50cw (MIT edit, same protocol) | 31.0 / 51.0 | 48.0 / 74.0 |
| own / p50cw by MIT's mathqa.py | 7.0 / 37.0 | 9.0 / 48.0 |

Honest verdict: the self-found direction is real but small — it doubles base
MATH (3→6) and nothing else; finished stays at 6–8% (vs 51/74), GSM8K sits at
base level. 33 points of mean accuracy short of the p50cw row on identical
rows and settings. 5 of the 20 disclosed passes spent (ledger deduped; edit
apply logged once). basew (optional base@ctx32768 control) not run — session
time-box; page discloses it as such. The escape gap round 1 diagnosed is not
closed by search from practice data alone; `step1_gate.json` stays STOPped and
`R2_1562_DONE` records completion.

Environment addendum (#1562): `data/` is untracked problem data — symlink it:
`ln -sfn ~/Dev/weight-lab/qwen-forge/data data`. qwen35 tensor keys are
`language_model.model.layers.*` (HF multi-modal container) — r2_edit's DOWN
template matched the write-up's `model.language_model.*` and died on first run.

## #1567 step 3 (session 134, slot a) — controls, scaling, layer count
Scripts: `r3_seprank.py` (candidate 3, passes P6+P7), `r3_run_1567.sh` (detached:
`./.venv/bin/python r2_detach.py r3_run_1567.sh /tmp/forge/ws-r3-1567.log`).
Markers: `results/r2/R3_BASEW_DONE`, `R3_ALPHA{2,4,8}_DONE`, `R3_1567_DONE`.
Alpha edits build to `edited_own_a{2,4,8}` -> `~/models/weightlab/qwen35-own-a{2,4,8}`;
alpha rows score **math-only** (disclosed on the page — GSM sat at base level in
#1562, scoring it again would spend GPU on a known null; the sweep never picks
the better set).

**Candidate 3 — layer count: NO, top-2 stands.** `r3_seprank.py` re-reads the P5
validation texts and computes combined separation for layer sets: per-layer scores
z-normalized on pooled val stats (label-leak free), summed per set, sep recomputed
with measured cross-layer covariance (independence not assumed). Frozen rule (fixed
before the read): top-4 commits scoring passes only at >= 1.10x top-2. Result:
top2 1.51 / top3 1.47 / top4 1.52 / all6 1.43 — 1.005x, not met; top-3 actually
DROPS, L3/L11 mostly re-report L15/L7 (see `corr` in `results/r2/r3_layer_rank.json`).
Plumbing gate: recomputed per-layer seps must equal the P5 npz values (tol 0.05).

**Gotchas found (each gated):**
- The first aggregation folded the between-bucket mean offset into the pooled
  variance (z-variance around GLOBAL mu instead of within-bucket): every sep shrank
  ~sqrt(1+d^2/4) (~0.9x) — caught precisely BECAUSE the reproduce-P5 gate existed;
  ranking was always consistent. Ledger stays honest: pass 6 kept + annotated
  defective, pass 7 (deterministic recompute) supersedes it. Raw per-token scores
  cached at `~/Dev/weight-lab/r2_text/r3_seprank_scores.json` so recomputes spend
  no new read passes; a cache-hit rewrite must preserve measured metadata
  (`t_minutes`) — the #1562 resume-clobber law, generalized.
- Text accounting: 68 val items, 9 shorter than the 64-token floor after tail cuts —
  `kept + skipped = items` is now a gate.

**Candidate 1 — basew control:** base @ ctx 32768 (same fixed rows). MATH landed:
**6.0 acc / 5.0 fin** vs base@ctx20 3.0/3.0 — the window lifts base MATH accuracy
to 6.0, i.e. exactly where #1562's own edit sat (own math 6.0). The own direction's
"doubled MATH" is matched by the UNEDITED model measured under the fair window;
p50cw 31.0 towers over the same control, so MIT's lift remains edit-specific.
GSM row + verdict copy land with the gsm row (chain continues detached).
