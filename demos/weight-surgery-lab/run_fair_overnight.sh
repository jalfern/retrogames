#!/bin/bash
# Overnight fair-scoring runner (#1506). Survives the forge session via launchd.
# Idempotent: step10 skips problems already in fair_*.jsonl.
cd "$HOME/Dev/weight-lab/qwen-forge" || exit 1
LOG=/tmp/forge/ws-fair-overnight.log
RUNS="$WS_FAIR_RUNS"   # e.g. "base:q35-f16.gguf:e0.0 edit:<edited>.gguf sampfix:q35-f16.gguf:pp=1.5"
echo "$(date -u +%FT%TZ) runner start runs=$RUNS" >> "$LOG"
# shellcheck disable=SC2086
.venv/bin/python step10_fair_score.py $RUNS >> "$LOG" 2>&1
rc=$?
echo "$(date -u +%FT%TZ) runner exit rc=$rc" >> "$LOG"
[ $rc -eq 0 ] && touch results/FAIR_SCORING_DONE
