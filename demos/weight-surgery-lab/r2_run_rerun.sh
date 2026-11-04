#!/bin/bash
# #1547 option C step-3 runner: p50c MATH-only re-run with the presence window
# fixed (WS_R2_PP_CTX=32768 covers the whole generation, vLLM parity), PAR-32,
# full text+reasoning sidecars for MIT-grader regrading. Detached via
# r2_detach.py; resumable (scores_p50cw_math.jsonl skips done ids).
# Est: 100 rows x ~32K tok at PAR-32 ~ 2 waves x ~31 min (session 118 rates).
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
echo "[rerun1547] start $(date -u)"
WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_SETS=math \
  $V r2_score.py p50cw:qwen35-p50c-mlx || { echo "[rerun1547] scorer died"; exit 1; }
echo "[rerun1547] rows done $(date -u)"
$V r2_mit_grade.py p50cw:math
echo "[rerun1547] mit regrade done $(date -u)"
