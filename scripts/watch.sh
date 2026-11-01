#!/bin/zsh
# FORGE WATCH — one tmux window showing what every lane is doing right now.
#
#   scripts/watch.sh          # open it (or re-attach if it is already running)
#   scripts/watch.sh --kill   # close it
#   scripts/watch.sh --live   # also show the model's tokens as they generate
#                             # (a live pane right of BUILDER·A, BUILDER·B,
#                             # QA·MINI and QA·STUDIO — one tap per stream, see
#                             # scripts/tap.mjs and the com.jalfern.tap-*.plist
#                             # jobs. Switching layouts: --kill first.)
#
# Works from anywhere you can SSH into the Studio (phone over Tailscale too):
# the tmux session lives here, so every device attaches to the same panes.
# From the MacBook Pro, one line:
#   ssh -t jon@100.67.32.98 'zsh -lc ~/Dev/retrogames/scripts/watch.sh'
# Detach with Ctrl-b then d; everything keeps running.
#
# Panes: left column, one per machine, top to bottom, refreshed every 5 s:
#   BUILDER·A (Studio, model on :8000) — the log the slot-a builder process
#             actually has open. Not /tmp/forge/last.log: a launchd fire that
#             skips (a session is already running) repoints last.log at a stub.
#             When no game is waiting, QA spills into this slot (node builder)
#             and this pane shows that session instead.
#   BUILDER·B (Studio, #1258) — the second builder slot, same model feed.
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
# The panes keep their config — pattern halves included — in scripts baked
# into /tmp/forge/watch/, never in the pane command line (#1259).
#
# #1259 — a lane pane must NEVER vanish. On Oct 30 the BUILDER pane's redraw
# loop ended and the pane closed for good; nobody noticed until the LIVE pane
# took over the row. So every pane runs a script baked in $WDIR with
# remain-on-exit set, and a detached supervisor ($WDIR/supervise.zsh, started
# here) checks every 5 s: any dead pane is logged to $WDIR/pane.log — with
# tmux's exit status when it reports one — and respawned from its baked
# script, same pane id, same slot, same config. A pane whose loop ends comes
# back within one refresh and says why. Loop bodies are hardened against the
# two known killers besides an external kill: a pane squeezed to a few rows
# (`tput lines` no longer feeds arithmetic unchecked) and garbage from oMLX's
# activity feed (lines must match `G <int> <int>` / `P <int> <int> <int>`
# before anything parses them). Proven by `npm run watchcheck`.
# FORGE_WATCH_SESSION builds into another session name, so the check never
# disturbs the real dashboard.

SESSION=${FORGE_WATCH_SESSION:-forge}
WDIR=/tmp/forge/watch/$SESSION  # per session: a test sandbox never clobbers the real dashboard

if [[ "${1:-}" == "--kill" ]]; then
    tmux kill-session -t "$SESSION" 2>/dev/null
    exit 0
fi

LIVE=0
[[ "${1:-}" == "--live" ]] && LIVE=1

mkdir -p "$WDIR"

# The supervisor: one loop OUTSIDE tmux (a pane cannot resurrect itself).
# Reads panes.tsv (`pane_id <TAB> name <TAB> script`) and respawns any dead
# pane by re-running its baked script. Every event lands in pane.log.
cat > "$WDIR/supervise.zsh" <<'SUPER'
#!/bin/zsh
S=${SESSION:-forge}
W=${WDIR:-/tmp/forge/watch}
spec=$W/panes.tsv
log=$W/pane.log
warned=""
while tmux has-session -t "$S" 2>/dev/null; do
    while IFS='|' read -r dead id; do
        [[ "$dead" == 1 ]] || continue
        line=$(awk -F '\t' -v id="$id" '$1==id {print $2"\t"$3}' "$spec" 2>/dev/null)
        if [[ -z "$line" ]]; then
            # A pane this supervisor never recorded (a session built before
            # #1259): nothing to respawn from. Say it once per pane, no spam.
            [[ "$warned" == *"|$id"* ]] || { warned+="|$id"
                print -r -- "$(date '+%F %T') pane $id died (not in panes.tsv — rebuild: watch.sh --kill, then reopen)" >> "$log"
            }
            continue
        fi
        name=${line%%$'\t'*}; script=${line#*$'\t'}
        rc=$(tmux display -p -t "$id" '#{pane_dead_status}' 2>/dev/null)
        rs=$(tmux display -p -t "$id" '#{pane_dead_reason}' 2>/dev/null)
        print -r -- "$(date '+%F %T') pane $name ($id) ended ${rs:+reason=$rs }rc=${rc:-unknown} — respawning" >> "$log"
        tmux respawn-pane -k -t "$id" "zsh '$script'" 2>>"$log"
    done < <(tmux list-panes -t "$S:0" -F '#{pane_dead}|#{pane_id}' 2>/dev/null)
    sleep 5
done
SUPER

supervise_is_live() { pgrep -f "$WDIR/supervise.zsh" >/dev/null; }
start_supervisor() { supervise_is_live || { SESSION="$SESSION" WDIR="$WDIR" nohup zsh "$WDIR/supervise.zsh" >/dev/null 2>&1 &! } }

if tmux has-session -t "$SESSION" 2>/dev/null; then
    # already open: adopt it — remain-on-exit + supervisor even if it was
    # built before #1259 (a pane that dies in it then at least gets logged).
    tmux set-option -t "$SESSION" remain-on-exit on 2>/dev/null
    start_supervisor
    (( LIVE )) && ! tmux list-panes -t "$SESSION" -F '#{pane_title}' | grep -q '^LIVE' \
        && { echo "watch is already open without the live pane: scripts/watch.sh --kill, then --live"; sleep 2; }
    exec tmux attach -t "$SESSION"
fi

# bake <key> <name> <body-file> [ENV=VALUE...] — write the pane's script:
# config lines + the shared body + an EXIT trap logging a clean loop end
# (the supervisor catches what cannot log itself — a kill). Config, including
# the pattern halves, lives only on disk here, never in a pane command line.
bake() {
    local key=$1 name=$2 body=$3; shift 3
    {
        print -r -- '#!/bin/zsh'
        print -r -- "trap 'print -r -- \"\$(date +%F\\ %T) pane $name exited rc=\$?\" >> $WDIR/pane.log' EXIT"
        local k v; for kv in "$@"; do k=${kv%%=*}; v=${kv#*=}; printf "%s='%s'\n" "$k" "$v"; done
        cat "$body"
    } > "$WDIR/$key.zsh"
}

# pane <key> <name> <body-file> <split-args...> — bake, then create the pane
# running just `zsh <script>` (the one allowed command text: no patterns).
# #1356: capture the new pane's id. tmux inserts a split pane right AFTER its
# target, so every index after any split shifts by one — a later `-t
# "$SESSION:0.N"` can name a different row than the one it was written for
# (that is how LIVE·STUDIO landed beside QA·MBP: live-builder's split pushed
# 0.4 from QA·STUDIO down to QA·MBP). Anything that targets a lane must use
# the id captured when that lane was created, never an index.
typeset -A PANEID
pane() {
    local key=$1 name=$2 body=$3; shift 3
    bake "$key" "$name" "$body" "${ENVK[@]}"
    local id; id=$(tmux split-window "$@" -P -F '#{pane_id}' "zsh '$WDIR/$key.zsh'")
    PANEID[$key]=$id
    print -r -- "$id	$name	$WDIR/$key.zsh" >> "$WDIR/panes.tsv"
}

# The lane pane body. Per pane from the baked config: L (label), PORT (that
# machine's oMLX, via its tunnel), PROV (its provider in opencode.json, for
# the API key) and P1/P2 (the session pattern in halves). Header line, live
# from oMLX's own dashboard feed (/admin/api/activity, API key as Bearer):
#   QA·MBP  up  gen 11.4 t/s  ctx 31k  ▃▅▇▆▄▅▆      (generating)
#   QA·MBP  up  prefill 62% @ 150 t/s               (reading the prompt)
#   QA·MBP  DOWN                                    (no answer: asleep/off)
# The sparkline is gen t/s sampled every 5 s (last 2 minutes). "ctx" is the
# prompt size: watch it grow and the t/s fall. An oMLX without that feed
# still shows up/DOWN. #1259 hardening: activity lines must be
# `G <int> <int>` / `P <int> <int> <int>` or they are dropped before any
# parsing, and `tput lines` is clamped, so neither garbage from oMLX nor a
# pane squeezed to a few rows can stop the redraw.
lane_pane() {
    cat <<'PANE'
G=$'\e[32m' R=$'\e[1;31m' Y=$'\e[33m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' N=$'\e[0m'
bars=(▁ ▂ ▃ ▄ ▅ ▆ ▇ █); hist=(); integer i v max
key=$(jq -r ".provider.$PROV.options.apiKey // empty" ~/.config/opencode/opencode.json 2>/dev/null)
while true; do
    rows=("${(@f)$(curl -s -m 2 -H "Authorization: Bearer $key" "http://127.0.0.1:$PORT/admin/api/activity" \
        | jq -r '.active_models.models[]? | (.generating[]? | "G \(.tokens_per_second|floor) \(.prompt_tokens // 0)"),
                 (.prefilling[]? | "P \(.processed // 0) \(.total // 0) \(.speed // 0 | floor)")' 2>/dev/null \
        | grep -E '^(G [0-9]+ [0-9]+|P [0-9]+ [0-9]+ [0-9]+)$')}")
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
        ln=$(tput lines 2>/dev/null); [[ $ln == <-> ]] || ln=4; (( ln < 4 )) && ln=4
        tail -n $(( ln - 3 )) "$log" | cut -c1-$(tput cols)
    fi
    sleep 5
done
PANE
}

# WARDEN also owns the layout of the left column. Every 5 s it checks which
# machines have a live session; when that changes it resizes the column:
# an idle machine shrinks to 3 rows, the warden itself to 4, and the busy
# machines share the rest equally. A column with the wrong pane count means
# one vanished (#1259): log it — the supervisor will have them back anyway.
warden_pane() {
    cat <<'PANE'
live() { pgrep -f "$1$2" >/dev/null && echo 1 || echo 0; }
last=""
while true; do
    clear
    w=$(ls -t /tmp/forge/warden-2*.log 2>/dev/null | head -1)
    echo "WARDEN ${w##*/}"
    ln=$(tput lines 2>/dev/null); [[ $ln == <-> ]] || ln=6; (( ln < 6 )) && ln=6
    [[ -n "$w" ]] && tail -n $(( ln - 2 )) "$w" | cut -c1-$(tput cols)
    state="$(live "$A1" "$Z1")$(live "$A2" "$Z2")$(live "$A3" "$Z3")$(live "$A4" "$Z4")$(live "$A5" "$Z5")"
    if [[ "$state" != "$last" ]]; then
        last=$state
        # left-column panes, top to bottom: builder-a, builder-b, mini, mbp, studio, warden
        cols=("${(@f)$(tmux list-panes -F '#{pane_left} #{pane_top} #{pane_id} #{pane_height}' | awk '$1==0' | sort -n -k2)}")
        n=5
        if (( ${#cols} != n + 1 )); then
            print -r -- "$(date '+%F %T') warden: ${#cols} panes at x=0, expected $(( n + 1 )) — a lane pane vanished" >> "${PWLOG:-/tmp/forge/watch/pane.log}"
        else
            ids=(); total=$n
            for c in "${cols[@]}"; do set -- ${=c}; ids+=($3); total=$(( total + $4 )); done
            busy=0; for i in {1..$n}; do busy=$(( busy + ${state[$i]} )); done
            free=$(( total - n - 4 - 3 * (n - busy) ))
            (( free < 0 )) && free=0
            for i in {1..$n}; do
                if (( ${state[$i]} )); then h=$(( busy > 0 ? free / busy : 3 )); (( h < 3 )) && h=3
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
mkdir -p /tmp/forge
f=/tmp/forge/stream-$LANE.log
code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$TAPPORT/v1/models")
if [[ "$code" == 000 ]]; then t="${R}tap DOWN${N}${D} (sessions go direct)"
else t="tap :$TAPPORT"; fi
print -r -- "${B}$L live${N}  ${D}$t${N}"
touch "$f"; exec tail -n 400 -F "$f"
PANE
}

# Left column, top to bottom: BUILDER·A, BUILDER·B, QA·MINI, QA·MBP,
# QA·STUDIO, WARDEN (sizes are set by the warden pane, above). A's pattern
# matches slot a (or a pre-#1258 session) OR a QA item spilled into the
# builder's slot; B is the second Studio builder (#1258).
LANE_BODY=$WDIR/body-lane.zsh;     lane_pane   > "$LANE_BODY"
WARDEN_BODY=$WDIR/body-warden.zsh; warden_pane > "$WARDEN_BODY"
LIVE_BODY=$WDIR/body-live.zsh;     live_pane   > "$LIVE_BODY"
: > "$WDIR/panes.tsv"

# First pane: new-session can't use `pane`, so bake it and record it by hand.
bake builder-a 'BUILDER·A' "$LANE_BODY" L='BUILDER·A' PORT=8000 PROV=omlx \
    P1='opencode run.*(THE FORGE( on slot a)?|QA MASTER on node builder)' P2='\.'
FIRST=$(tmux new-session -d -s "$SESSION" -P -F '#{pane_id}' "zsh '$WDIR/builder-a.zsh'")
PANEID[builder-a]=$FIRST
print -r -- "$FIRST	BUILDER·A	$WDIR/builder-a.zsh" >> "$WDIR/panes.tsv"
# #1259: dead panes stay in place (with their ids) so the supervisor can
# respawn them. Set before any pane can die.
tmux set-option -t "$SESSION" remain-on-exit on

ENVK=(L='BUILDER·B' PORT=8000 PROV=omlx P1='opencode run.*THE FORGE on slot b' P2='\.')
pane builder-b 'BUILDER·B' "$LANE_BODY" -v -l 70% -t "${PANEID[builder-a]}"
ENVK=(L='QA·MINI' PORT=18000 PROV=omlxmini P1='opencode run.*omlx' P2='mini')
pane qa-mini 'QA·MINI' "$LANE_BODY" -v -l 75% -t "${PANEID[builder-b]}"
ENVK=(L='QA·MBP' PORT=18001 PROV=omlxmbp P1='opencode run.*omlx' P2='mbp')
pane qa-mbp 'QA·MBP' "$LANE_BODY" -v -l 66% -t "${PANEID[qa-mini]}"
ENVK=(L='QA·STUDIO' PORT=8000 PROV=omlx P1='opencode run.*QA MASTER on node ' P2='studio\.')
pane qa-studio 'QA·STUDIO' "$LANE_BODY" -v -l 50% -t "${PANEID[qa-mbp]}"
ENVK=(A1='opencode run.*(THE FORGE( on slot a)?|QA MASTER on node builder)' Z1='\.'
      A2='opencode run.*THE FORGE on slot b' Z2='\.'
      A3='opencode run.*omlx' Z3='mini'
      A4='opencode run.*omlx' Z4='mbp'
      A5='opencode run.*QA MASTER on node ' Z5='studio\.' PWLOG=$WDIR/pane.log)
pane warden 'WARDEN' "$WARDEN_BODY" -v -l 4 -t "${PANEID[qa-studio]}"

# RETRO: a full-height pane on the right, 60% wide. `env -u TMUX` lets tmux
# nest; -A attaches to "retro" if it exists, otherwise creates it in the repo.
# No patterns inside, so nothing to leak; baked so the supervisor can rebuild
# the pane (never the chat itself — nested session, separate lifecycle).
bake retro RETRO /dev/null
print -r -- "exec env -u TMUX tmux new-session -A -s retro -c \$HOME/Dev/retrogames" >> "$WDIR/retro.zsh"
RETRO_PANE=$(tmux split-window -h -f -l $(( LIVE ? 40 : 60 ))% -P -F '#{pane_id}' -t "$SESSION" "zsh '$WDIR/retro.zsh'")
print -r -- "$RETRO_PANE	RETRO	$WDIR/retro.zsh" >> "$WDIR/panes.tsv"

# LIVE: right half of a lane's row. Each pane shares its lane's row, so the
# warden's resizing of that lane moves it too (the warden only lays out the
# x=0 column). One tap per stream: builder-a :8010, studio :8011 (#1268),
# builder-b :8012 and mini :8013 (#1356). Every target is the PANEID captured
# at creation — an index would name the wrong row once any earlier pane has
# been split (the #1356 bug: live-studio at 0.4 fell onto QA·MBP's row).
if (( LIVE )); then
    ENVK=(L='BUILDER' LANE=builder TAPPORT=8010)
    pane live-builder 'LIVE-BUILDER' "$LIVE_BODY" -h -l 50% -t "${PANEID[builder-a]}"
    ENVK=(L='BUILDER·B' LANE=builderb TAPPORT=8012)
    pane live-builderb 'LIVE-BUILDER·B' "$LIVE_BODY" -h -l 50% -t "${PANEID[builder-b]}"
    ENVK=(L='QA·MINI' LANE=mini TAPPORT=8013)
    pane live-mini 'LIVE-QA·MINI' "$LIVE_BODY" -h -l 50% -t "${PANEID[qa-mini]}"
    ENVK=(L='QA·STUDIO' LANE=studio TAPPORT=8011)
    pane live-studio 'LIVE-STUDIO' "$LIVE_BODY" -h -l 50% -t "${PANEID[qa-studio]}"
fi

# Mouse: on server-wide (-g), so the nested RETRO session gets it too. With it
# off there, the wheel over RETRO dropped the outer pane into copy-mode: the
# chat froze, scrolled junk, and typing seemed dead until `q`. And scrolling a
# lane pane enters copy-mode with -e, so scrolling back to the bottom exits it
# and the pane is live again (q or Esc also exits).
tmux set-option -g mouse on
tmux bind-key -n WheelUpPane if-shell -F '#{||:#{pane_in_mode},#{mouse_any_flag}}' \
    'send-keys -M' 'copy-mode -e'
tmux bind-key -T copy-mode Escape send-keys -X cancel
start_supervisor
exec tmux attach -t "$SESSION"
