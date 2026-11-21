#!/bin/zsh
# devstop — stop YOUR dev server, by port. The only safe way for a lane to do it.
#
#   scripts/devstop.sh [port]     (default: $DEV_PORT)
#
# Never `pkill -f "npm run dev"` (or any pattern): every lane's `opencode run`
# carries its prompt in argv, and the prompt contains "npm run dev -- --port",
# so a pattern kill also ends the lane clients themselves — 2026-11-20 22:46 a
# slot-a close-out killed both builder clients at once (exit=130).
# This kills only the process LISTENING on the port, then its npm parent.
PORT=${1:-${DEV_PORT:-}}
[[ -z "$PORT" ]] && { echo "devstop: no port (pass one or set DEV_PORT)"; exit 2; }
PIDS=($(lsof -nP -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null))
(( ${#PIDS} )) || { echo "devstop: nothing listening on :$PORT"; exit 0; }
for p in $PIDS; do
    pp=$(ps -o ppid= -p $p | tr -d ' ')
    kill -TERM $p 2>/dev/null
    # the `npm run dev` wrapper that started vite, if it is one (never opencode)
    [[ -n "$pp" ]] && ps -o command= -p $pp | grep -q '^npm run dev' && kill -TERM $pp 2>/dev/null
done
sleep 1
lsof -nP -t -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && { echo "devstop: :$PORT still listening"; exit 1; }
echo "devstop: :$PORT stopped"
