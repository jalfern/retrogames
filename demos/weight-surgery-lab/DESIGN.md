# WEIGHT SURGERY — design notes (#1493, slot b, session 109)

Jon's question: can our forge Qwen do what MIT's Astra did (Takehi et al.,
Nov 2 2026, Exp 8) — raise Qwen3.5-0.8B's math score by *reading and editing
weights*, no gradients, practice on GSM8K/MATH **train** only, ≤50 forward-pass
batches, one scored held-out run?

The five spec points (issue = spec):
1. No gradients/training/fine-tuning/random-edit search — read, hypothesize, edit.
2. Practice ≤50 batches on GSM8K/MATH train, every batch logged (ran / ruled out).
3. Score ONCE on held-out MATH-500 + GSM8K test, identical sampling + token cap
   before and after; report token-cap hit rate. Cheap comparison row: sampling fix
   alone (model card `presence_penalty`, README L704–708 & the loop warning at L856).
4. Don't open MIT's edit until ours is scored; reproducing theirs afterwards is a
   fair extra row.
5. Weights stay out of git; commit the edit script + results JSON + demo page.

## Method (hypothesis-first, mirrors Astra's finding)
The paper traces the loop to a direction written by the MLPs of layers 15 & 19
(both `full_attention` layers here; hidden=1024 — 64 down_proj columns × 1024 ×
2 layers = their 131,072 weights = 0.016%).

1. **Read:** run GSM8K/MATH train batches; expect most completions to loop into
   the cap (card says it happens; measure it).
2. **Locate:** capture MLP residual contributions C(x) at layers 15/19 during
   looping vs terminating completions; contrast-mean direction
   d = normalize(mean C_loop − mean C_end).
3. **Edit:** zero d's write path in the top-K (≈64) down_proj columns of layers
   15/19: w_j ← w_j − d·(d·w_j)·α, with K, α chosen on *practice* loop-rate
   only. This is a principled direction ablation (representation ringer), not a
   random search.
4. **Practice loop** within the ≤50-batch budget; keep the variant with the
   lowest practice loop-rate *before* ever touching held-out problems.
5. **Score once:** MATH-500 + GSM8K test, base vs edited, same config; plus
   sampling-only row (presence_penalty 2.0 / non-thinking). MIT model pulled only
   after this run is written.

## Compute reality (laptop, #737 box: Chrome/Metal broken)
Weights: pinned rev `2fc06364` via proxy (1.75GB bf16), runtime mlx-lm 0.32.2
(native `qwen3_5` support incl. GatedDeltaNet layers). The paper's 32k cap is
out of reach for hundreds of loops on CPU-fallback GPU box — cap fixed at
1024 (documented deviation; before/after identical, cap-hit % reported; the
loop signature saturates at much lower caps anyway). n per set sized by measured
tok/s after the smoke batch.

## Deliverable
`public/demos/weightsurgery.html` — before/after table, edit heatmap (which
columns in which layers), one looping-vs-finished problem side by side, full
batch log. Honest negative result is a fine demo.

## Data
- GSM8K: openai/grade-school-math train/test jsonl (GitHub) ✔
- MATH train: EleutherAI/hendrycks_math 7,500 train problems ✔
- MATH-500: HuggingFaceH4/MATH-500 test.jsonl ✔
