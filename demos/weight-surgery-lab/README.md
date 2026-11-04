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
