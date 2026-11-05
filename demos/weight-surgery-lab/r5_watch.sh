#!/bin/bash
# #1585 watch loop: relaunch r5_openbook_edit.sh until R5_1585_DONE.
# Why: oMLX answers POST .../load slower than r2_common.load_done's 30s read
# timeout when it must swap a resident model (observed 09:06Z: "known: True",
# load succeeded server-side, client timed out). The runner is fully
# marker-guarded/resumable (#1562 laws), so a restart after a client-side
# timeout re-reads loaded-state and continues — no double logs, no re-applies.
cd "$(dirname "$0")" || exit 1
for i in $(seq 1 40); do
  bash r5_openbook_edit.sh && break
  [ -f results/r2/R5_1585_DONE ] && break
  echo "[1585-watch] retry $i after non-zero exit $(date -u +%FT%TZ)"
  sleep 20
done
[ -f results/r2/R5_1585_DONE ] && echo "WS5_WATCH_DONE"
