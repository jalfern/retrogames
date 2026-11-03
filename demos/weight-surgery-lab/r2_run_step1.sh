#!/bin/bash
# r2 step-1 runner (#1533): base + MIT p50c rows on the fixed held-out set,
# then the mechanical neighborhood gate. Detached via r2_detach.py so it
# survives the forge session; resumable (scores_*.jsonl skips done ids).
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
echo "[step1] start $(date -u +%FT%TZ)"
$V r2_score.py base:qwen35-base p50c:qwen35-p50c-mlx
echo "[step1] rows done $(date -u +%FT%TZ)"
$V r2_gate.py
echo "[step1] gate written $(date -u +%FT%TZ)"
