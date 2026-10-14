#!/bin/zsh
# FORGE WATCH — one tmux window showing what every lane is doing right now.
#
#   scripts/watch.sh          # open it (or re-attach if it is already running)
#   scripts/watch.sh --kill   # close it
#
# Works from anywhere you can SSH into the Studio (phone over Tailscale too):
# the tmux session lives here, so every device attaches to the same panes.
# From the MacBook Pro, one line:
#   ssh -t jon@100.67.32.98 'zsh -lc ~/Dev/retrogames/scripts/watch.sh'
# Detach with Ctrl-b then d; everything keeps running.
#
# Panes: left column, top to bottom, refreshed every 5 s:
#   BUILDER — the log the running builder process actually has open. Not
#             /tmp/forge/last.log: a launchd fire that skips (a session is
#             already running) repoints last.log at a one-line stub.
#   QA      — same, for the QA MASTER process.
#   WARDEN  — the newest warden tick log.
# Right: RETRO — Jon's own tmux session "retro" (his chat with Qwen), attached
#   inside this pane, or created in the repo if it does not exist yet. It is a
#   separate session, so `--kill` and detaching never end that chat. Typing
#   goes straight to it; its own tmux keys need Ctrl-b twice (Ctrl-b Ctrl-b d).
# Click a pane (mouse is on) or Ctrl-b + arrow to move between panes.
#
# NEVER put a lane's process pattern (e.g. "opencode run.*THE FORGE") into a
# pane's command text. `pgrep -f` matches full command lines, so the pane
# itself would match: the warden and forge.sh / forge-qa.sh would then think
# the lane is busy and never start it (that bug shipped once, 2026-10-12).
# The panes pass the pattern in two halves through the environment instead.

SESSION=forge

if [[ "${1:-}" == "--kill" ]]; then
    tmux kill-session -t "$SESSION" 2>/dev/null
    exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach -t "$SESSION"
fi

# lane_pane LABEL: show the last lines of the log that the process matching
# "$P1$P2" (set per pane, see above) has open; say so plainly when idle.
lane_pane() {
    cat <<PANE
while true; do
    clear
    pid=\$(pgrep -f "\$P1\$P2" | head -1)
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

tmux new-session -d -s "$SESSION" -e P1='opencode run.*THE' -e P2=' FORGE' zsh -c "$(lane_pane BUILDER)"
tmux split-window -v -t "$SESSION" -e P1='opencode run.*QA' -e P2=' MASTER' zsh -c "$(lane_pane QA)"
tmux split-window -v -t "$SESSION" zsh -c "$WARDEN_PANE"
tmux select-layout -t "$SESSION" even-vertical
# RETRO: a full-height pane on the right, 60% wide. `env -u TMUX` lets tmux
# nest; -A attaches to "retro" if it exists, otherwise creates it in the repo.
tmux split-window -h -f -l 60% -t "$SESSION" \
    "env -u TMUX tmux new-session -A -s retro -c $HOME/Dev/retrogames"
tmux set-option -t "$SESSION" mouse on
exec tmux attach -t "$SESSION"
