#!/bin/zsh
# FORGE WATCH — one tmux window showing what every lane is doing right now.
#
#   scripts/watch.sh          # open it (or re-attach if it is already running)
#   scripts/watch.sh --kill   # close it
#   scripts/watch.sh --live   # also show BUILDER's tokens as they generate
#                             # (a pane right of BUILDER; needs the tap — see
#                             # scripts/tap.mjs. Switching layouts: --kill first.)
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
#             session is already running) repoints last.log at a stub. When
#             no game is waiting, QA spills into this slot (node builder) and
#             this pane shows that session instead.
#   QA·MINI  (model via the :18000 tunnel) — the session using omlxmini/...
#   QA·MBP   (model via the :18001 tunnel) — the session using omlxmbp/...
#             (parked 2026-10-19; the pane stays and shows idle/DOWN)
#   QA·STUDIO (Studio, model on :8000) — the second stream on the Studio
#   WARDEN   — the newest warden tick log; it also resizes this column so
#             idle machines shrink to 3 rows and busy ones get the space.
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

LIVE=0
[[ "${1:-}" == "--live" ]] && LIVE=1

if tmux has-session -t "$SESSION" 2>/dev/null; then
    (( LIVE )) && ! tmux list-panes -t "$SESSION" -F '#{pane_title}' | grep -q '^LIVE' \
        && { echo "watch is already open without the live pane: scripts/watch.sh --kill, then --live"; sleep 2; }
    exec tmux attach -t "$SESSION"
fi

# The lane pane. Per pane, from the environment: L (label), PORT (that
# machine's oMLX, via its tunnel), PROV (its provider in opencode.json, for
# the API key) and P1/P2 (the session pattern in halves). Header line, live
# from oMLX's own dashboard feed (/admin/api/activity, API key as Bearer):
#   QA·MBP  up  gen 11.4 t/s  ctx 31k  ▃▅▇▆▄▅▆      (generating)
#   QA·MBP  up  prefill 62% @ 150 t/s               (reading the prompt)
#   QA·MBP  DOWN                                    (no answer: asleep/off)
# The sparkline is gen t/s sampled every 5 s (last 2 minutes). "ctx" is the
# prompt size: watch it grow and the t/s fall. An oMLX without that feed
# still shows up/DOWN.
lane_pane() {
    cat <<'PANE'
G=$'\e[32m' R=$'\e[1;31m' Y=$'\e[33m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' N=$'\e[0m'
bars=(▁ ▂ ▃ ▄ ▅ ▆ ▇ █); hist=(); integer i v max
key=$(jq -r ".provider.$PROV.options.apiKey // empty" ~/.config/opencode/opencode.json 2>/dev/null)
while true; do
    rows=("${(@f)$(curl -s -m 2 -H "Authorization: Bearer $key" "http://127.0.0.1:$PORT/admin/api/activity" \
        | jq -r '.active_models.models[]? | (.generating[]? | "G \(.tokens_per_second|floor) \(.prompt_tokens // 0)"),
                 (.prefilling[]? | "P \(.processed // 0) \(.total // 0) \(.speed // 0 | floor)")' 2>/dev/null)}")
    code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$PORT/v1/models")
    if [[ "$code" == 000 ]]; then state="${R}DOWN${N}"; hist=()
    else
        state="${G}up${N}"; g=""; p=""
        for r in $rows; do [[ $r == G* && -z $g ]] && g=$r; [[ $r == P* && -z $p ]] && p=$r; done
        n=${#${(M)rows:#[GP]*}}; more=""; (( n > 1 )) && more="  ${D}(+$(( n - 1 )) more)${N}"
        if [[ -n $g ]]; then
            set -- ${=g}; hist+=($2); (( ${#hist} > 24 )) && hist=(${hist[2,-1]})
            state+="  ${Y}gen $2 t/s${N}  ${D}ctx $(( $3 / 1000 ))k${N}$more"
        elif [[ -n $p ]]; then
            set -- ${=p}; pct=0; (( $3 > 0 )) && (( pct = 100 * $2 / $3 ))
            state+="  ${C}prefill ${pct}% @ $4 t/s${N}$more"
        else state+="  ${D}idle${N}"; fi
    fi
    spark=""; max=1
    for v in $hist; do (( v > max )) && max=$v; done
    for v in $hist; do (( i = v * 7 / max + 1 )); spark+=${bars[$i]}; done
    pid=$(pgrep -f "$P1$P2" | head -1)
    clear
    print -r -- "${B}$L${N}  $state  ${C}${spark}${N}"
    if [[ -z "$pid" ]]; then
        print -r -- "${D}no session${N}"
    else
        log=$(lsof -p "$pid" 2>/dev/null | awk '/\/tmp\/forge\/.*\.log/ {print $NF; exit}')
        print -r -- "${D}pid $pid · up $(ps -o etime= -p $pid | tr -d ' ') · ${log:-no log}${N}"
        [[ -n "$log" ]] && tail -n $(( $(tput lines) - 3 )) "$log" | cut -c1-$(tput cols)
    fi
    sleep 5
done
PANE
}

# WARDEN also owns the layout of the left column. Every 5 s it checks which
# machines have a live session; when that changes it resizes the column:
# an idle machine shrinks to 3 rows, the warden itself to 4, and the busy
# machines share the rest equally. (Lane patterns arrive in halves through
# the environment, the same as the lane panes, so this pane never matches.)
warden_pane() {
    cat <<'PANE'
live() { pgrep -f "$1$2" >/dev/null && echo 1 || echo 0; }
last=""
while true; do
    clear
    w=$(ls -t /tmp/forge/warden-2*.log 2>/dev/null | head -1)
    echo "WARDEN ${w##*/}"
    [[ -n "$w" ]] && tail -n $(( $(tput lines) - 2 )) "$w" | cut -c1-$(tput cols)
    state="$(live "$A1" "$Z1")$(live "$A2" "$Z2")$(live "$A3" "$Z3")$(live "$A4" "$Z4")"
    if [[ "$state" != "$last" ]]; then
        last=$state
        # left-column panes, top to bottom: builder, mini, mbp, studio, warden
        cols=("${(@f)$(tmux list-panes -F '#{pane_left} #{pane_top} #{pane_id} #{pane_height}' | awk '$1==0' | sort -n -k2)}")
        n=4
        if (( ${#cols} == n + 1 )); then
            ids=(); total=$n
            for c in "${cols[@]}"; do set -- ${=c}; ids+=($3); total=$(( total + $4 )); done
            busy=0; for i in {1..$n}; do busy=$(( busy + ${state[$i]} )); done
            free=$(( total - n - 4 - 3 * (n - busy) ))
            for i in {1..$n}; do
                if (( ${state[$i]} )); then h=$(( free / busy ))
                elif (( busy == 0 && i == 1 )); then h=$(( free + 3 ))
                else h=3; fi
                tmux resize-pane -t "${ids[$i]}" -y $h
            done
        fi
    fi
    sleep 5
done
PANE
}

# LIVE pane (--live): the tap's copy of what the model is generating right
# now — reasoning dimmed, output in plain text, tool calls in cyan. The
# session log (BUILDER pane) only gets a step once it finishes; this shows it
# while it is still being written. Empty = no session is routed through the tap.
live_pane() {
    cat <<'PANE'
D=$'\e[2m' B=$'\e[1m' R=$'\e[1;31m' N=$'\e[0m'
printf '\e]2;LIVE\e\\'
f=/tmp/forge/stream-$LANE.log
code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$TAPPORT/v1/models")
if [[ "$code" == 000 ]]; then t="${R}tap DOWN${N}${D} (sessions go direct)"
else t="tap :$TAPPORT"; fi
print -r -- "${B}$L live${N}  ${D}$t${N}"
touch "$f"; exec tail -n 400 -F "$f"
PANE
}

# Left column, top to bottom: BUILDER, QA·MINI, QA·MBP, QA·STUDIO, WARDEN
# (sizes are set by the warden pane, above). BUILDER's pattern matches the
# forge OR a QA item spilled into the builder's slot (node builder).
LANE="$(lane_pane)"
BA='opencode run.*(THE' BZ=' FORGE|QA MASTER on node builder\.)'
SA='opencode run.*QA MASTER on node ' SZ='studio\.'
tmux new-session -d -s "$SESSION" -e L=BUILDER -e PORT=8000 -e PROV=omlx \
    -e P1="$BA" -e P2="$BZ" zsh -c "$LANE"
tmux split-window -v -l 4 -t "$SESSION:0.0" \
    -e A1="$BA" -e Z1="$BZ" -e A2='opencode run.*omlx' -e Z2='mini' \
    -e A3='opencode run.*omlx' -e Z3='mbp' -e A4="$SA" -e Z4="$SZ" zsh -c "$(warden_pane)"
tmux split-window -v -l 75% -t "$SESSION:0.0" -e L=QA·MINI -e PORT=18000 -e PROV=omlxmini \
    -e P1='opencode run.*omlx' -e P2='mini' zsh -c "$LANE"
tmux split-window -v -l 66% -t "$SESSION:0.1" -e L=QA·MBP -e PORT=18001 -e PROV=omlxmbp \
    -e P1='opencode run.*omlx' -e P2='mbp' zsh -c "$LANE"
tmux split-window -v -l 50% -t "$SESSION:0.2" -e L=QA·STUDIO -e PORT=8000 -e PROV=omlx \
    -e P1="$SA" -e P2="$SZ" zsh -c "$LANE"
# RETRO: a full-height pane on the right, 60% wide. `env -u TMUX` lets tmux
# nest; -A attaches to "retro" if it exists, otherwise creates it in the repo.
BUILDER_PANE=$(tmux display -p -t "$SESSION:0.0" '#{pane_id}')
tmux split-window -h -f -l $(( LIVE ? 40 : 60 ))% -t "$SESSION" \
    "env -u TMUX tmux new-session -A -s retro -c $HOME/Dev/retrogames"
# LIVE: right half of the BUILDER row. It shares that row, so the warden's
# resizing of BUILDER moves it too (the warden only lays out the x=0 column).
(( LIVE )) && tmux split-window -h -l 50% -t "$BUILDER_PANE" \
    -e L=BUILDER -e LANE=builder -e TAPPORT=8010 zsh -c "$(live_pane)"
# Mouse: on server-wide (-g), so the nested RETRO session gets it too. With it
# off there, the wheel over RETRO dropped the outer pane into copy-mode: the
# chat froze, scrolled junk, and typing seemed dead until `q`. And scrolling a
# lane pane enters copy-mode with -e, so scrolling back to the bottom exits it
# and the pane is live again (q or Esc also exits).
tmux set-option -g mouse on
tmux bind-key -n WheelUpPane if-shell -F '#{||:#{pane_in_mode},#{mouse_any_flag}}' \
    'send-keys -M' 'copy-mode -e'
tmux bind-key -T copy-mode Escape send-keys -X cancel
exec tmux attach -t "$SESSION"
