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
