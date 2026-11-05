#!/bin/bash
# #1580 open-book control — MIT's WRITTEN diagnosis as system context, UNEDITED base.
# Trust boundary: the ONLY MIT artifact this chain may read is
#   ~/Dev/weight-lab/mit-exp8/exp8_math/runs/p50c/final_answer.md
# Their edit tensors (edit/), turn logs (turns/) and frozen_weights_manifest.json are
# OFF LIMITS — the experiment asks whether CONTENT transfers; applying their tensors
# would answer a different question with a contaminated protocol.
# Protocol: think35 pp1.5 ctx32768 PAR-32, same fixed held-out 100+100, seed 0,
# sidecars on (MIT regrade covers it). Tag `openbook` — never a weight-edit row.
# Detach: ./.venv/bin/python r2_detach.py r4_openbook.sh /tmp/forge/ws-r4-1580.log
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
export WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_JON_GO=1
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
export R2_NPZ="$PWD/results/r2/r2_directions_1562.npz"
DIAG="$HOME/Dev/weight-lab/mit-exp8/exp8_math/runs/p50c/final_answer.md"
echo "[1580] start $(date -u +%FT%TZ)"
[ -f "$DIAG" ] || { echo "[1580] STOP: written diagnosis not found"; exit 1; }
if [ -f results/r2/R4_OPENBOOK_DONE ]; then
  echo "[1580] open-book row already done"
else
  WS_SYSTEM_FILE="$DIAG" WS_R2_SETS=math,gsm $V r2_score.py openbook:qwen35-base || exit 1
  touch results/r2/R4_OPENBOOK_DONE
fi
# no-arg regrade (#1562 law); sidecars-without-rows are skipped (#1567 stage-F fix)
$V r2_mit_grade.py || echo "[1580] mit regrade incomplete (non-fatal)"
touch results/r2/R4_1580_DONE
echo "[1580] done $(date -u +%FT%TZ) — next: harvest + openbook page row + ship lane"
