#!/bin/zsh
# FORGE WATCH — one tmux window showing what every lane is doing right now.
#
#   scripts/watch.sh          # open it (or re-attach if it is already running)
#   scripts/watch.sh --kill   # close it
#
# Works from anywhere you can SSH into the Studio (phone over Tailscale too):
# the tmux session lives here, so every device attaches to the same panes.
# Detach with Ctrl-b then d; it keeps running.
#
# Panes, top to bottom:
#   BUILDER — the log the running builder process actually has open. Not
#             /tmp/forge/last.log: a launchd fire that skips (a session is
#             already running) repoints last.log at a one-line stub.
#   QA      — same, for the QA MASTER process.
#   WARDEN  — the newest warden tick log.
# Each pane redraws every 5 s, so it follows new sessions on its own.

SESSION=forge

if [[ "${1:-}" == "--kill" ]]; then
    tmux kill-session -t "$SESSION" 2>/dev/null
    exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach -t "$SESSION"
fi

# lane_pane LABEL PATTERN: show the last lines of the log that the process
# matching PATTERN has open; say so plainly when the lane is idle.
lane_pane() {
    cat <<PANE
while true; do
    clear
    pid=\$(pgrep -f '$2' | head -1)
    if [[ -z "\$pid" ]]; then
        echo "$1: idle (no process)"
    else
        log=\$(lsof -p "\$pid" 2>/dev/null | awk '/\/tmp\/forge\/.*\.log/ {print \$NF; exit}')
        echo "$1: pid \$pid, up \$(ps -o etime= -p \$pid | tr -d ' '), log \${log:-none}"
        echo "----"
        [[ -n "\$log" ]] && tail -n 25 "\$log"
    fi
    sleep 5
done
PANE
}

WARDEN_PANE='while true; do
    clear
    w=$(ls -t /tmp/forge/warden-2*.log 2>/dev/null | head -1)
    echo "WARDEN: ${w:-no log yet}"; echo "----"
    [[ -n "$w" ]] && tail -n 15 "$w"
    sleep 5
done'

tmux new-session -d -s "$SESSION" zsh -c "$(lane_pane BUILDER 'opencode run.*THE FORGE')"
tmux split-window -v -t "$SESSION" zsh -c "$(lane_pane QA 'opencode run.*QA MASTER')"
tmux split-window -v -t "$SESSION" zsh -c "$WARDEN_PANE"
tmux select-layout -t "$SESSION" even-vertical
exec tmux attach -t "$SESSION"
