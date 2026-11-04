#!/bin/bash
# #1562 step-2/3 runner — Qwen finds its own edit, scored against OUR p50c row.
# Jon authorized step 2 despite the step1_gate STOP (#1562): judging is vs our own
# p50cw row (#1547), same box/settings — hence WS_R2_JON_GO=1 below.
# Every row: think35 cap 32768, pp1.5 over the WHOLE generation (ctx 32768),
# PAR-32, text sidecars for MIT-grader regrade. Detach with r2_detach.py; all
# steps resumable.
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
export WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_JON_GO=1
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
export R2_NPZ="$PWD/results/r2/r2_directions_1562.npz"
echo "[1562] start $(date -u +%FT%TZ)"

# Search runs once; if the directions npz is already present (a prior attempt
# completed P1-P5 and logged them), do NOT re-spend the 5-pass budget.
if [ ! -f results/r2/r2_directions_1562.npz ]; then
  $V r2_directions_1562.py || { echo "[1562] STOP: directions refused/failed"; exit 1; }
else
  echo "[1562] directions npz present — reusing 5 passes already logged (not re-spending)"
fi
LAYERS=$($V -c "import numpy as np;print(','.join(map(str,np.load('results/r2/r2_directions_1562.npz')['chosen_layers'])))")
echo "[1562] edit layers (held-out sep winners): $LAYERS"
$V r2_edit.py 1.0 128 edited_own "$LAYERS" || { echo "[1562] STOP: own edit failed"; exit 1; }
$V r2_convert.py edited_own "$HOME/models/weightlab/qwen35-own" || exit 1
$V r2_register.py qwen35-own --load || { echo "[1562] STOP: qwen35-own register/load"; exit 1; }

# headline row first: Qwen's own edit on both sets
WS_R2_SETS=math,gsm $V r2_score.py own:qwen35-own || exit 1
# required baseline: MIT p50c GSM8K at these settings (math exists = p50cw row)
WS_R2_SETS=gsm $V r2_score.py p50cw:qwen35-p50c-mlx || exit 1
$V r2_mit_grade.py own:math own:gsm p50cw:gsm || echo "[1562] mit regrade incomplete (non-fatal)"
# optional (issue: 'if time allows'): base at these settings — runs last, kill freely
WS_R2_SETS=math,gsm $V r2_score.py basew:qwen35-base || exit 1

touch results/r2/R2_1562_DONE
echo "[1562] done $(date -u +%FT%TZ) — next: page rebuild + ws3check + merge lane"
