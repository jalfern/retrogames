#!/bin/bash
# Watchdog for runner #2: relaunch step10b until FAIR_SCORING_DONE.
cd "$HOME/Dev/weight-lab/qwen-forge" || exit 0
while :; do
  [ -f results/FAIR_SCORING_DONE ] && exit 0
  if ! ps aux | grep -q "[s]tep10b_fair_server.py"; then
    echo "$(date -u +%FT%TZ) watchdog2: relaunching runner2" >> /tmp/forge/ws-fair-overnight.log
    WS_FAIR_RUNS="base:q35-f16.gguf sampfix:q35-f16.gguf:pp=1.5 k256:q35-fair-k256.gguf" \
    WS_PORT=8090 WS_PARALLEL=12 /bin/bash run_fair_server.sh
  fi
  sleep 300
done
