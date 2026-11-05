#!/bin/bash
# #1567 WEIGHT SURGERY step 3 runner — v2, per Jon's correction (23:31Z + 00:25Z).
#   v1 chained alpha rows onto the HELD-OUT 100 MATH — that is tuning on the
#   test set. v2 protocol (Jon's rule "choose on practice, score held-out once"):
#   A. finish the basew control (base @ whole-generation window ctx32768,
#      math row landed 6.0/5.0; resume + complete GSM8K).
#   B. base practice control: fresh 64 math @cap8192 (pass 8) — the reference
#      the alpha lift is measured against on the SAME problems.
#   C. alpha sweep {2,4,8}: edits (identical [15,7] k128 recipe), score on the
#      SAME fresh practice batch (passes 9/10/11). Held-out NEVER sees the sweep.
#   D. r3_pick.py applies the frozen rule (max practice accuracy; ties ->
#      finished-rate, then smaller alpha) -> one winner.
#   E. the winner alone earns the held-out 100+100 row (full think35, cap 32768).
#   F. MIT regrade over every sidecar, no args (#1562 law).
# Candidate 3 (layers) was decided by r3_seprank.py (pass 7): top-2 stands —
# its "held-out separation" is a held-out split of PRACTICE texts, per Jon.
# All rows: think35 pp1.5 ctx32768 PAR-32, sidecars; practices at cap 8192
# (#1562 direction-search settings — escape at <=8k is what the direction targets).
# Detach: ./.venv/bin/python r2_detach.py r3_run_1567.sh /tmp/forge/ws-r3-1567.log
# Every stage marker-guarded and resumable (#1562 dedupe laws: resumed stages
# neither re-log passes nor re-apply edits).
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
export WS_R2_PARALLEL=32 WS_R2_PP_CTX=32768 WS_R2_SAVETEXT=1 WS_R2_JON_GO=1
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
export R2_NPZ="$PWD/results/r2/r2_directions_1562.npz"
echo "[1567] start $(date -u +%FT%TZ)"

# --- A. basew control — resume the GSM8K half (math landed 6.0/5.0) ----------
if [ ! -f results/r2/R3_BASEW_DONE ]; then
  WS_R2_SETS=gsm $V r2_score.py basew:qwen35-base || exit 1
  touch results/r2/R3_BASEW_DONE
else
  echo "[1567] basew already done"
fi

# --- B. base practice control (pass 8) --------------------------------------------
if [ ! -f results/r2/R3_PBASE_DONE ]; then
  WS_R3_PASS=8 $V r3_practice.py base:qwen35-base || exit 1
  touch results/r2/R3_PBASE_DONE
else
  echo "[1567] base practice already done"
fi

# --- C. alpha sweep on PRACTICE only (passes 9/10/11) --------------------------
for A in 2 4 8; do
  case $A in 2) PASS=9;; 4) PASS=10;; 8) PASS=11;; esac
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
  WS_R3_PASS=$PASS $V r3_practice.py own${A}:qwen35-own-a${A} || exit 1
  touch results/r2/R3_ALPHA${A}_DONE
done

# --- D. frozen-rule pick (practice-only decision) --------------------------------
if [ ! -f results/r2/r3_alpha_pick.json ]; then
  $V r3_pick.py || exit 1
fi
WINNER=$(././.venv/bin/python r3_pick.py 2>/dev/null | tail -1)
[ -n "$WINNER" ] || { echo "[1567] STOP: no winner tag from r3_pick"; exit 1; }
echo "[1567] practice winner: ${WINNER}"

# --- E. the ONE held-out row — winner only, full protocol ----------------------
# winner tag is own{A}; the model directory is qwen35-own-a{A}
if [ ! -f results/r2/R3_OWNHELD_DONE ]; then
  W_ALPHA=${WINNER#own}
  WS_R2_SETS=math,gsm $V r2_score.py ${WINNER}:qwen35-own-a${W_ALPHA} || exit 1
  touch results/r2/R3_OWNHELD_DONE
else
  echo "[1567] winner held-out row already done"
fi

# --- F. MIT regrade over EVERY sidecar — no args (argv form rebuilds
# mit_grader.json from scratch and silently drops prior rows' regrades — #1562 law)
$V r2_mit_grade.py || echo "[1567] mit regrade incomplete (non-fatal)"
touch results/r2/R3_1567_DONE
echo "[1567] done $(date -u +%FT%TZ) — next: page rebuild + ws3check + merge lane"
