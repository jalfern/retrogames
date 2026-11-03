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

