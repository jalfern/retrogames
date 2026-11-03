#!/bin/bash
# Fair-scoring runner #2 (#1506): continuous-batching llama-server. Resumable.
cd "$HOME/Dev/weight-lab/qwen-forge" || exit 1
LOG=/tmp/forge/ws-fair-overnight.log
if ps aux | grep -q "[s]tep10b_fair_server"; then
  echo "$(date -u +%FT%TZ) runner2 skipped: step10b already running" >> "$LOG"; exit 0
fi
echo "$(date -u +%FT%TZ) runner2 start runs=$WS_FAIR_RUNS (cont-batch, parallel=${WS_PARALLEL:-24})" >> "$LOG"
# shellcheck disable=SC2086
.venv/bin/python step10b_fair_server.py $WS_FAIR_RUNS >> "$LOG" 2>&1
rc=$?
echo "$(date -u +%FT%TZ) runner2 exit rc=$rc" >> "$LOG"
[ $rc -eq 0 ] && touch results/FAIR_SCORING_DONE
