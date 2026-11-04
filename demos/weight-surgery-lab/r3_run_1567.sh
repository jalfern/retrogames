#!/bin/bash
# #1567 WEIGHT SURGERY step 3 runner — candidates in the issue's payoff order.
#   1. basew control: base @ whole-generation penalty window (ctx 32768), both sets.
#      Closes the "does the window lift base too?" question #1562 disclosed as not-run.
#   2. direction scaling: alpha sweep {2,4,8} on the own edit (layers [15,7], k 128).
#      Math-only rows, disclosed: MATH is where the direction moved base (3->6);
#      GSM sat at base level (8 vs 8), so GSM rows would only spend GPU on a null.
#      "3 edits + 1 held-out row each" — no cherry-picking, every edit gets its row.
# Multi-layer (candidate 3) is decided by r3_seprank.py BEFORE committing scoring
# passes to a 4-layer edit — that decision lands with this issue's next stage.
# All rows: think35 cap 32768, pp1.5 ctx 32768, PAR-32, sidecars for MIT regrade.
# Detach: ./.venv/bin/python r2_detach.py r3_run_1567.sh /tmp/forge/ws-r3-1567.log
# Every stage marker-guarded and resumable (#1562 dedupe laws: resumed stages must
# not re-log passes or re-apply edits).
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
export WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_JON_GO=1
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
export R2_NPZ="$PWD/results/r2/r2_directions_1562.npz"
echo "[1567] start $(date -u +%FT%TZ)"

# --- candidate 1: basew control -------------------------------------------------
if [ ! -f results/r2/R3_BASEW_DONE ]; then
  WS_R2_SETS=math,gsm $V r2_score.py basew:qwen35-base || exit 1
  touch results/r2/R3_BASEW_DONE
else
  echo "[1567] basew already done"
fi

# --- candidate 2: alpha scaling -------------------------------------------------
for A in 2 4 8; do
  if [ -f results/r2/R3_ALPHA${A}_DONE ]; then
    echo "[1567] alpha=${A} already done"
    continue
  fi
  MD="$HOME/models/weightlab/qwen35-own-a${A}"
  # edit applies only if the report is missing (resume must not re-log the apply)
  if [ ! -f edited_own_a${A}/edit_report.json ]; then
    $V r2_edit.py $A 128 edited_own_a${A} 15,7 || exit 1
  else
    echo "[1567] alpha=${A} edit already applied"
  fi
  if [ -f "$MD/config.json" ] && ls "$MD"/*.safetensors >/dev/null 2>&1; then
    echo "[1567] qwen35-own-a${A} already converted"
  else
    $V r2_convert.py edited_own_a${A} "$MD" || exit 1
  fi
  $V r2_register.py qwen35-own-a${A} --load || { echo "[1567] STOP: register a${A}"; exit 1; }
  WS_R2_SETS=math $V r2_score.py own${A}:qwen35-own-a${A} || exit 1
  touch results/r2/R3_ALPHA${A}_DONE
done

# MIT grader over EVERY sidecar — no args (argv form rebuilds mit_grader.json from
# scratch and silently drops prior rows' regrades — #1562 law)
$V r2_mit_grade.py || echo "[1567] mit regrade incomplete (non-fatal)"
touch results/r2/R3_1567_DONE
echo "[1567] done $(date -u +%FT%TZ) — next: page rebuild + ws3check + merge lane"
