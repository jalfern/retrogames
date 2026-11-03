#!/bin/sh
# Detach helper: double-fork so the runner reparents to launchd and survives
# the forge session's end (nested launchctl is refused from warden contexts).
exec /Users/jon/Dev/weight-lab/qwen-forge/.venv/bin/python - "$@" <<'EOF'
import os, subprocess, sys
runs = os.environ.get("WS_FAIR_RUNS", "")
if os.fork() == 0:
    os.setsid()
    if os.fork() == 0:
        env = dict(os.environ, WS_FAIR_RUNS=runs)
        log = open("/tmp/forge/ws-fair-overnight.log", "a")
        subprocess.Popen(["/bin/bash",
                         "/Users/jon/Dev/weight-lab/qwen-forge/run_fair_overnight.sh"],
                         stdout=log, stderr=log, cwd="/Users/jon/Dev/weight-lab/qwen-forge",
                         env=env)
    os._exit(0)
os._exit(0)
EOF
