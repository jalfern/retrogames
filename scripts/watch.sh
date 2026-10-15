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
# Panes: left column, one per machine, top to bottom, refreshed every 5 s:
#   BUILDER  (Studio, model on :8000)  — the log the builder process actually
#             has open. Not /tmp/forge/last.log: a launchd fire that skips (a
#             session is already running) repoints last.log at a stub.
#   QA·MINI  (model via the :18000 tunnel) — the session using omlxmini/...
#   QA·MBP   (model via the :18001 tunnel) — the session using omlxmbp/...
#   WARDEN   — the newest warden tick log.
# Each lane header says whether that machine's model server answers (up/DOWN),
# so a sleeping MacBook shows as DOWN instead of a session that looks busy.
# Every session runs on the Studio; the machine named is where its model runs.
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

# lane_pane LABEL PORT: show the last lines of the log that the process
# matching "$P1$P2" (set per pane, see above) has open, under a header saying
# whether the model server on 127.0.0.1:PORT answers at all (any HTTP code,
# even 401, means up).
lane_pane() {
    cat <<PANE
while true; do
    clear
    code=\$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://127.0.0.1:$2/v1/models)
    [[ "\$code" == 000 ]] && host=DOWN || host=up
    pid=\$(pgrep -f "\$P1\$P2" | head -1)
    if [[ -z "\$pid" ]]; then
        echo "$1 [model \$host]: idle (no process)"
    else
        log=\$(lsof -p "\$pid" 2>/dev/null | awk '/\/tmp\/forge\/.*\.log/ {print \$NF; exit}')
        echo "$1 [model \$host]: pid \$pid, up \$(ps -o etime= -p \$pid | tr -d ' '), \${log:-no log}"
        echo "----"
        [[ -n "\$log" ]] && tail -n \$(( \$(tput lines) - 3 )) "\$log" | cut -c1-\$(tput cols)
    fi
    sleep 5
done
PANE
}

WARDEN_PANE='while true; do
    clear
    w=$(ls -t /tmp/forge/warden-2*.log 2>/dev/null | head -1)
    echo "WARDEN: ${w:-no log yet}"; echo "----"
    [[ -n "$w" ]] && tail -n $(( $(tput lines) - 3 )) "$w"
    sleep 5
done'

# Left column: WARDEN gets a fixed 6 lines at the bottom (it rarely says
# more); the three machine panes split the rest equally.
tmux new-session -d -s "$SESSION" -e P1='opencode run.*THE' -e P2=' FORGE' zsh -c "$(lane_pane BUILDER 8000)"
tmux split-window -v -l 6 -t "$SESSION:0.0" zsh -c "$WARDEN_PANE"
tmux split-window -v -l 66% -t "$SESSION:0.0" -e P1='opencode run.*omlx' -e P2='mini' zsh -c "$(lane_pane QA·MINI 18000)"
tmux split-window -v -l 50% -t "$SESSION:0.1" -e P1='opencode run.*omlx' -e P2='mbp' zsh -c "$(lane_pane QA·MBP 18001)"
# RETRO: a full-height pane on the right, 60% wide. `env -u TMUX` lets tmux
# nest; -A attaches to "retro" if it exists, otherwise creates it in the repo.
tmux split-window -h -f -l 60% -t "$SESSION" \
    "env -u TMUX tmux new-session -A -s retro -c $HOME/Dev/retrogames"
tmux set-option -t "$SESSION" mouse on
exec tmux attach -t "$SESSION"
