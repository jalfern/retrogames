#!/bin/bash
# r2 chain runner (#1533): bridge step-1 -> step-2/3 across session boundaries.
# Waits for step1_gate.json (the live step-1 runner writes it when both rows land),
# then: PASS -> full step 2/3 pipeline at Jon's WS_R2_PARALLEL concurrency;
# STOP -> drop results/r2/step1_stop.marker and exit (the gap-analysis lane takes
# over — per Jon's rule a failed neighborhood forbids step 2, nothing runs here).
# Detach with r2_detach.py so it survives the forge session, like step-1 does.
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
GATE=results/r2/step1_gate.json
PIDF=results/r2/chain.pid
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
    echo "[chain] already running (pid $(cat "$PIDF")) — not doubling up"; exit 0
fi
echo $$ > "$PIDF"
echo "[chain] waiting for $GATE $(date -u +%FT%TZ)"
while [ ! -f "$GATE" ]; do sleep 30; done
sleep 3   # let the writer finish the rename-free write
if $V -c "import json,sys; sys.exit(0 if json.load(open('$GATE')).get('pass') else 1)"; then
    echo "[chain] gate PASS $(date -u +%FT%TZ) — launching step 2/3 at WS_R2_PARALLEL=32"
    WS_R2_PARALLEL=32 ./r2_run_step2.sh
    echo "[chain] step23 exit=$? $(date -u +%FT%TZ)"
else
    echo "[chain] gate STOP $(date -u +%FT%TZ) — step 2 forbidden; gap analysis owed on #1533"
    cp "$GATE" results/r2/step1_stop.marker
fi
rm -f "$PIDF"
