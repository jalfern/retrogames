#!/bin/bash
# #1585 WEIGHT SURGERY step 5 runner — the open-book WEIGHT EDIT.
# Open-book means the RECIPE came from MIT's written diagnosis (runs/p50c/
# final_answer.md, the sole MIT file read: layers 15+19, 64 down_proj columns
# per layer, counteract the measured repetition direction) — the columns, the
# direction vector, the edits and every score are OURS. Trust boundary as in
# #1580 §12: never edit/ turns/ frozen_weights_manifest.json final_report.md.
# Protocol (Jon's laws, unchanged):
#   A/B. edits (alpha {2,4,8}, own top-64 cols by |d_L.w_j|, L15+L19) and
#        HF->MLX conversions were DONE by the #1585 stage-A/B session; this
#        runner VERIFIES the artifacts (marker-implies-artifact law reversed:
#        no stage proceeds without the artifacts on disk) and never re-applies.
#   C. alpha sweep on PRACTICE only (fresh math[160:224] @cap8192, passes
#      13/14/15 of the disclosed 20). Held-out NEVER sees the sweep (Jon rule).
#   D. ws5_pick.py frozen rule -> one winner.
#   E. the winner alone earns the ONE held-out 100+100 row (tag `ob`,
#      think35 pp1.5 ctx32768 PAR-32, sidecars).
#   F. MIT regrade over every sidecar, NO args (#1562 law).
# Detach: nohup bash r5_openbook_edit.sh > /tmp/forge/ws5-chain.log 2>&1 &
# Every stage marker-guarded and resumable (#1562 dedupe laws).
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
export WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_JON_GO=1
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
FORGE="$HOME/Dev/weight-lab/qwen-forge"
echo "[1585] start $(date -u +%FT%TZ)"

# --- A/B verify: open-book edits + MLX conversions exist (built 08:35-09:05Z) -
for A in 2 4 8; do
  [ -f "$FORGE/edited_ob_a${A}/edit_report.json" ] || { echo "[1585] STOP: edited_ob_a${A} missing edit_report"; exit 1; }
  MD="$HOME/models/weightlab/qwen35-ob-a${A}"
  ls "$MD"/*.safetensors >/dev/null 2>&1 || { echo "[1585] STOP: $MD not converted"; exit 1; }
done
echo "[1585] stage A/B artifacts verified (no re-apply)"

# --- C. alpha sweep on PRACTICE only (passes 13/14/15) ------------------------
for A in 2 4 8; do
  case $A in 2) PASS=13;; 4) PASS=14;; 8) PASS=15;; esac
  if [ -f results/r2/R5_PRACTICE_A${A}_DONE ]; then
    echo "[1585] practice alpha=${A} already done"
    continue
  fi
  $V r2_register.py qwen35-ob-a${A} --load || { echo "[1585] STOP: register a${A}"; exit 1; }
  WS_R5_PASS=$PASS $V ws5_practice.py ob${A}:qwen35-ob-a${A} || exit 1
  touch results/r2/R5_PRACTICE_A${A}_DONE
done
touch results/r2/R5_PRACTICE_DONE
echo "WS5_PRACTICE_DONE"

# --- D. frozen-rule pick (practice-only decision) ------------------------------
if [ ! -f results/r2/r5_alpha_pick.json ]; then
  $V ws5_pick.py || exit 1
fi
WINNER=$($V ws5_pick.py 2>/dev/null | tail -1)
[ -n "$WINNER" ] || { echo "[1585] STOP: no winner tag from ws5_pick"; exit 1; }
echo "[1585] practice winner: ${WINNER}"
touch results/r2/R5_PICK_DONE
echo "WS5_PICK_DONE ${WINNER}"

# --- E. the ONE held-out row — winner only, full protocol ----------------------
if [ ! -f results/r2/R5_OBHELD_DONE ]; then
  W_ALPHA=${WINNER#ob}
  $V r2_register.py qwen35-ob-a${W_ALPHA} --load || { echo "[1585] STOP: register winner"; exit 1; }
  WS_R2_SETS=math,gsm $V r2_score.py ob:qwen35-ob-a${W_ALPHA} || exit 1
  touch results/r2/R5_OBHELD_DONE
else
  echo "[1585] winner held-out row already done"
fi
echo "WS5_HELDOUT_DONE"

# --- F. MIT regrade over EVERY sidecar — no args (#1562 law) -------------------
$V r2_mit_grade.py || echo "[1585] mit regrade incomplete (non-fatal)"
touch results/r2/R5_1585_DONE
echo "WS5_DONE — next: harvest rows+aggregate into the lab, page third rung, ws3check §14, PR"
