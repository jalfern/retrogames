#!/bin/zsh
# FORGE WATCH — one tmux window showing what every lane is doing right now.
#
#   scripts/watch.sh          # open it (or re-attach if it is already running)
#   scripts/watch.sh --kill   # close it
#   scripts/watch.sh --live   # also show the model's tokens as they generate
#                             # (a live pane right of BUILDER·A, BUILDER·B,
#                             # QA·MINI, QA·MINI·2 and QA·STUDIO — one tap per
#                             # stream, see scripts/tap.mjs and the
#                             # com.jalfern.tap-*.plist jobs. Switching
#                             # layouts: --kill first.)
#
# Works from anywhere you can SSH into the Studio (phone over Tailscale too):
# the tmux session lives here, so every device attaches to the same panes.
# From the MacBook Pro, one line:
#   ssh -t jon@100.67.32.98 'zsh -lc ~/Dev/retrogames/scripts/watch.sh'
# Detach with Ctrl-b then d; everything keeps running.
#
# Panes: left column, top to bottom, refreshed every 5 s (#2286 — Jon's
# layout, and the warden pane now holds it against lane start/stop):
#   BUILDER·A (Studio, model on :8000) — the log the slot-a builder process
#             actually has open. Not /tmp/forge/last.log: a launchd fire that
#             skips (a session is already running) repoints last.log at a stub.
#             When no game is waiting, QA spills into this slot (node builder)
#             and this pane shows that session instead.
#   BUILDER·B (Studio, #1258) — the second builder slot, same model feed.
#   QA·MINI  (model via the :18000 tunnel) — the session naming node mini.
#             The \. matters: mini2 is its own pane (#2280).
#   QA·MINI·2 (#2280, model via the :18000 tunnel too) — the mini's second
#             QA slot; naming node mini2., tap :8014, dev :5179.
#   QA·STUDIO (Studio, model on :8000) — the second stream on the Studio
#   WARDEN   — the newest warden tick log, a 6-row strip at the bottom.
# The five lane rows share the column EVENLY — busy or idle, idle lanes no
# longer shrink to 3 rows (#2286) — and the warden re-asserts the even split
# whenever anything nudges it, so the layout survives lanes starting/stopping.
# Each lane row is split half work pane, half LIVE output pane (--live).
# QA·MBP is retired (Jon 2026-11-14): no pane; its launchd jobs sit in
# ~/Library/LaunchAgents/disabled/.
# Each lane header says whether that machine's model server answers (up/DOWN),
# so a sleeping machine shows as DOWN instead of a session that looks busy.
# Every session runs on the Studio; the machine named is where its model runs.
# Right: QWEN — Jon's own tmux session "qwen" (his chat with Qwen), attached
#   inside this pane at 1/3 width, or created in the repo if it does not exist
#   yet (renamed from "retro", #2286). It is a separate session, so `--kill`
#   and detaching never end that chat. Typing goes straight to it; its own
#   tmux keys need Ctrl-b twice (Ctrl-b Ctrl-b d).
# Click a pane (mouse is on) or Ctrl-b + arrow to move between panes.
#
# #2286 labels: every pane carries a title (BUILDER·A, BUILDER·A · output, …,
# WARDEN, QWEN) drawn in its top border (`pane-border-status top` +
# `pane-border-format`), `allow-set-title off` so nothing running inside can
# overwrite it. Titles are set by this script (and survive pane respawn —
# they live on the pane, not in the script). A busy lane's log can also never
# scroll the header away: log lines are trimmed to the pane width in CELLS by
# scripts/watch-fit.mjs (cut -c counts characters; emoji are 2 cells, wrapped
# lines pushed the header off short panes — Jon's 96x14 repro).
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
# activity feed (lines must match `G <int> <int>` / `P <int> <int> <int>`)
# before anything parses them. Proven by `npm run watchrespawncheck` (#2278;
# #1259's respawn e2e rides in it too).
# FORGE_WATCH_SESSION builds into another session name, so the check never
# disturbs the real dashboard.
#
# #2278 — the respawn recipe must survive its own freshness. macOS 27 runs
# /usr/libexec/tmp_cleaner (launchd, daily 00:00) over /tmp, deleting files
# with -atime +3 -mtime +3 -ctime +3. The baked scripts and panes.tsv are
# written once and never re-read (zsh keeps the loop in memory; the supervisor
# awk's panes.tsv only when a pane dies), so a watch session older than 3 days
# lost everything the respawn needs while the supervisor ran on in memory. The
# supervisor now sweeps `touch` over its whole WDIR every cycle: touch moves
# atime+mtime and — like any inode change — ctime, so no file ever matches all
# three while the session lives; when it dies, touching stops and /tmp cleans
# the leftovers as usual.

SESSION=${FORGE_WATCH_SESSION:-forge}
WDIR=/tmp/forge/watch/$SESSION  # per session: a test sandbox never clobbers the real dashboard

# #2286: this server runs ASCII-mode (started with no locale), so multibyte
# output takes one cell per byte and half-width panes drown in wrapped rows.
# The server's mode cannot change while it lives (Jon's chat session is inside
# it), so pane CONTENT is kept ASCII (watch-fit.mjs + ASCII headers). But a
# server cold-started by this script — after a reboot, or when nothing else
# holds one — inherits this environment and comes up UTF-8, the mode the
# panes' nicer titles were written for.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

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
# Baked by a function, and baked on EVERY watch.sh run (build and adopt): if
# tmp_cleaner ever took supervise.zsh itself (#2278), re-opening watch.sh
# restores it and the guard resumes.
bake_supervisor() {
cat > "$WDIR/supervise.zsh" <<'SUPER'
#!/bin/zsh
S=${SESSION:-forge}
W=${WDIR:-/tmp/forge/watch}
spec=$W/panes.tsv
log=$W/pane.log
warned=""
setopt NULL_GLOB
while tmux has-session -t "$S" 2>/dev/null; do
    # #2278 keep-fresh: tmp_cleaner (macOS daily 00:00) deletes /tmp files with
    # -atime +3 -mtime +3 -ctime +3. These files are written once and never
    # re-read, so a >3-day-old session would lose the respawn recipe mid-run.
    # touch sets atime+mtime, and any inode change moves ctime too — one sweep
    # per cycle keeps every file (and the dir) unmatched for the session's life.
    touch "$W" "$0" "$spec" "$log" "$W"/*.zsh "$W"/*.mjs 2>/dev/null
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
}
bake_supervisor

# bake_fit — copy scripts/watch-fit.mjs into the WDIR (like the supervisor:
# re-done on EVERY run, build and adopt, so a tmp_cleaner wipe self-heals and
# an old sandbox never runs a stale filter). Panes fall back to plain `cut`
# if the copy is missing and node is not there. NB: capture the script dir at
# top level — inside a function zsh's $0 is the function name, not watch.sh.
WATCH_SCRIPT_DIR="${0:a:h}"
bake_fit() {
    local src="$WATCH_SCRIPT_DIR/watch-fit.mjs"
    [[ -f "$src" ]] && cp "$src" "$WDIR/fit.mjs" 2>/dev/null
}
bake_fit

# The label law (#2286): titles live in each pane's top border; nothing inside
# a pane may overwrite them (allow-set-title is a SERVER option, -s).
apply_border_law() {
    tmux set-option -s allow-set-title off 2>/dev/null
    tmux set-window-option -t "$SESSION:0" pane-border-status top 2>/dev/null
    tmux set-window-option -t "$SESSION:0" pane-border-format ' #[bold]#{pane_title}#[default] ' 2>/dev/null
}
# set_title <pane-id> <label>
set_title() { tmux select-pane -t "$1" -T "$2" 2>/dev/null; }

supervise_is_live() { pgrep -f "$WDIR/supervise.zsh" >/dev/null; }
start_supervisor() { supervise_is_live || { SESSION="$SESSION" WDIR="$WDIR" nohup zsh "$WDIR/supervise.zsh" >/dev/null 2>&1 &! } }

if tmux has-session -t "$SESSION" 2>/dev/null; then
    # already open: adopt it — remain-on-exit + supervisor even if it was
    # built before #1259 (a pane that dies in it then at least gets logged).
    tmux set-option -t "$SESSION" remain-on-exit on 2>/dev/null
    # #2286: adopt an older-built session into the label law too, so borders
    # appear without forcing a rebuild (titles already on the panes survive).
    apply_border_law
    start_supervisor
    (( LIVE )) && ! tmux list-panes -t "$SESSION" -F '#{pane_title}' | grep -q 'output' \
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
# the API key), FIT (the width filter, see watch-fit.mjs) and P1/P2 (the
# session pattern in halves). Header line, live from oMLX's own dashboard feed
# (/admin/api/activity, API key as Bearer):
#   QA·MINI  up  gen 11.4 t/s  ctx 31k  ▃▅▇▆▄▅▆      (generating)
#   QA·MINI  up  prefill 62% @ 150 t/s               (reading the prompt)
#   QA·MINI  DOWN                                    (no answer: asleep/off)
# The sparkline is gen t/s sampled every 5 s (last 2 minutes). "ctx" is the
# prompt size: watch it grow and the t/s fall. An oMLX without that feed
# still shows up/DOWN. #1259 hardening: activity lines must be
# `G <int> <int>` / `P <int> <int> <int>` or they are dropped before any
# parsing, and `tput lines` is clamped, so neither garbage from oMLX nor a
# pane squeezed to a few rows can stop the redraw.
# KL is the ASCII label for IN-PANE text: on this ASCII-mode server '·' would
# print as two mojibake bytes and eat two cells. Border titles keep the nicer
# L ('·' sanitises to '_' there, never reaching the pty as bytes).
lane_pane() {
    cat <<'PANE'
G=$'\e[32m' R=$'\e[1;31m' Y=$'\e[33m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' N=$'\e[0m'
bars=('.' ':' '-' '=' '+' '*' '%' '#'); hist=(); integer i v max
key=$(jq -r ".provider.$PROV.options.apiKey // empty" ~/.config/opencode/opencode.json 2>/dev/null)
while true; do
    rows=("${(@f)$(curl -s -m 2 -H "Authorization: Bearer $key" "http://127.0.0.1:$PORT/admin/api/activity" \
        | jq -r '.active_models.models[]? | (.generating[]? | "G \(.tokens_per_second|floor) \(.prompt_tokens // 0)"),
                 (.prefilling[]? | "P \(.processed // 0) \(.total // 0) \(.speed // 0 | floor)")' 2>/dev/null \
        | grep -E '^(G [0-9]+ [0-9]+|P [0-9]+ [0-9]+ [0-9]+)$')}")
    code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$PORT/v1/models")
    # #2286: the header must occupy EXACTLY one row at any pane size — one
    # wrapped row is one log line the pane loses, and overflow is what buried
    # the header in Jon's 96x14 repro. Build the state from richest to leanest
    # variant and take the first that fits plus the spark; the spark takes
    # whatever width is left.
    # tmux — NOT tput — is the truth about pane size here: tput reads the
    # pane's pty, which tmux only resizes while a client is attached, so an
    # unattached session (or a client that detached from this window) would
    # make tput report the 80x24 default and the pane would overflow itself,
    # scrolling its header away (#2286, measured: tput said 24 in a 3-row pane).
    sz=$(tmux display-message -p -p '#{pane_width} #{pane_height}' 2>/dev/null)
    cols=${sz% *}; ln=${sz#* }
    [[ $cols == <-> ]] || cols=80; (( cols < 20 )) && cols=20
    [[ $ln == <-> ]] || ln=15; (( ln < 1 )) && ln=1
    spark=""; max=1
    for v in $hist; do (( v > max )) && max=$v; done
    for v in $hist; do (( i = v * 7 / max + 1 )); spark+=${bars[$i]}; done
    hdrplain="$KL"
    if [[ "$code" == 000 ]]; then
        hist=(); sc=$R; sp="DOWN"
    else
        sc=$G; sp="up"; g=""; p=""
        for r in $rows; do [[ $r == G* && -z $g ]] && g=$r; [[ $r == P* && -z $p ]] && p=$r; done
        n=${#${(M)rows:#[GP]*}}; more=""; (( n > 1 )) && more=" +$(( n - 1 ))"
        if [[ -n $g ]]; then
            sc=$Y
            set -- ${=g}; hist+=($2); (( ${#hist} > 24 )) && hist=(${hist[2,-1]})
            cands=("gen $2 t/s ctx $(( $3 / 1000 ))k$more" "gen $2 t/s$more" "gen $2 t/s" "gen")
            for c in $cands; do (( ${#KL} + ${#c} + 2 <= cols )) && { sp=$c; break; }
            done
        elif [[ -n $p ]]; then
            sc=$C
            set -- ${=p}; pct=0; (( $3 > 0 )) && (( pct = 100 * $2 / $3 ))
            cands=("prefill ${pct}% @ $4 t/s$more" "prefill ${pct}%$more" "prefill" )
            for c in $cands; do (( ${#KL} + ${#c} + 2 <= cols )) && { sp=$c; break; }
            done
            sp=${sp:-up}
        else sc=$D; sp="idle"; fi
    fi
    hdrplain="$KL $sp"
    spare=$(( cols - ${#hdrplain} - 2 )); (( spare < 0 )) && spare=0
    (( ${#spark} > spare )) && spark=${spark:1:$spare}
    pid=$(pgrep -f "$P1$P2" | head -1)
    clear
    print -r -- "${B}$KL${N}  ${sc}${sp}${N}  ${C}${spark}${N}"
    if [[ "$ln" -lt 2 ]]; then sleep 5; continue; fi
    if [[ -z "$pid" ]]; then
        print -r -- "${D}no session${N}"
    else
        log=$(lsof -p "$pid" 2>/dev/null | awk '/\/tmp\/forge\/.*\.log/ {print $NF; exit}')
        print -r -- "${D}pid $pid - up $(ps -o etime= -p $pid | tr -d ' ') - ${log:-no log}${N}" | cut -c1-$cols
        tailn=$(( ln - 3 )); (( tailn < 0 )) && tailn=0
        [[ -n ${DBGPROBE:-} ]] && print -r -- "$(date +%T) ln=$ln tailn=$tailn cols=$cols" >> "$DBGPROBE"
        if (( tailn > 0 )); then
            if [[ -f "$FIT" ]] && command -v node >/dev/null 2>&1; then
                tail -n $tailn "$log" 2>/dev/null | node "$FIT" --width "$cols"
            else
                tail -n $tailn "$log" 2>/dev/null | cut -c1-$cols
            fi
        fi
    fi
    sleep 5
done
PANE
}

# WARDEN also holds the layout of the left column (#2286): the five lane rows
# share it EVENLY — busy or idle — and the warden strip is a fixed 6 rows at
# the bottom. Any nudge (a dragged border, a stale resize from an older build)
# is re-evened within one cycle, so the layout stays while lanes start/stop.
# A column with the wrong pane count means one vanished (#1259): log it — the
# supervisor will have them back anyway.
warden_pane() {
    cat <<'PANE'
n=${NLANES:-5}; wrow=6
while true; do
    clear
    w=$(ls -t /tmp/forge/warden-2*.log 2>/dev/null | head -1)
    echo "WARDEN ${w##*/}"
    sz=$(tmux display-message -p -p '#{pane_width} #{pane_height}' 2>/dev/null)
    ln=${sz#* }; cols0=${sz% *}
    [[ $ln == <-> ]] || ln=6; (( ln < 6 )) && ln=6
    [[ $cols0 == <-> ]] || cols0=80
    if [[ -n "$w" ]]; then
        if [[ -f "$FIT" ]] && command -v node >/dev/null 2>&1; then
            tail -n $(( ln - 2 )) "$w" | node "$FIT" --width "$cols0"
        else
            tail -n $(( ln - 2 )) "$w" | cut -c1-$cols0
        fi
    fi
    # left-column panes, top to bottom: builder-a, builder-b, mini, mini2, studio, warden
    cols=("${(@f)$(tmux list-panes -F '#{pane_left} #{pane_top} #{pane_id} #{pane_height}' | awk '$1==0' | sort -n -k2)}")
    if (( ${#cols} != n + 1 )); then
        print -r -- "$(date '+%F %T') warden: ${#cols} panes at x=0, expected $(( n + 1 )) — a lane pane vanished" >> "${PWLOG:-/tmp/forge/watch/pane.log}"
    else
        ids=(); hs=(); sum=0
        for c in "${cols[@]}"; do set -- ${=c}; ids+=($3); hs+=($4); done
        for i in {1..$n}; do sum=$(( sum + hs[i] )); done
        avg=$(( sum / n )); rem=$(( sum % n ))
        for i in {1..$n}; do
            t=$(( avg + (i <= rem ? 1 : 0) ))
            (( hs[i] != t )) && tmux resize-pane -t "${ids[i]}" -y $t
        done
        (( hs[n + 1] != wrow )) && tmux resize-pane -t "${ids[n + 1]}" -y $wrow
    fi
    sleep 5
done
PANE
}

# LIVE pane (--live): the tap's copy of what the model is generating right
# now — reasoning dimmed, output in plain text, tool calls in cyan. The
# session log (BUILDER pane) only gets a step once it finishes; this shows it
# while it is still being written. Empty = no session is routed through the tap.
# #2286: the stream runs through watch-fit.mjs so long generated lines trim to
# the half-width pane instead of wrapping into unreadable ribbons. The filter
# finds its own pane width via the stdout tty — nothing to bake per pane.
live_pane() {
    cat <<'PANE'
D=$'\e[2m' B=$'\e[1m' R=$'\e[1;31m' N=$'\e[0m'
mkdir -p /tmp/forge
f=/tmp/forge/stream-$LANE.log
code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$TAPPORT/v1/models")
if [[ "$code" == 000 ]]; then t="${R}tap DOWN${N}${D} (sessions go direct)"
else t="tap :$TAPPORT"; fi
print -r -- "${B}$KL live${N}  ${D}$t${N}"
touch "$f"
if [[ -f "$FIT" ]] && command -v node >/dev/null 2>&1; then
    # tail feeds the filter through a process substitution: node is *the*
    # tracked job; node dying (a respawn kill) SIGPIPEs tail, tail dying gives
    # node EOF — either way the pane ends and the supervisor respawns it.
    node "$FIT" --stream --tty "$(tty)" < <(tail -n 400 -F "$f") & np=$!
    wait $np
    exit 0
else
    exec tail -n 400 -F "$f"
fi
PANE
}

# Left column, top to bottom: BUILDER·A, BUILDER·B, QA·MINI, QA·MINI·2,
# QA·STUDIO,
# WARDEN (even rows, held by the warden pane, above; MBP retired #2286). A's
# pattern matches slot a (or a pre-#1258 session) OR a QA item spilled into
# the builder's slot; B is the second Studio builder (#1258). The MINI pattern
# is the #2286 fix: since #1422 the mini lane runs as omlxtapmini/..., so
# matching "omlx.*mini" was stale — match the launcher text instead, the same
# style as QA·STUDIO (it was patched live; this makes rebuilds keep it).
FITPATH=$WDIR/fit.mjs
LANE_BODY=$WDIR/body-lane.zsh;     lane_pane   > "$LANE_BODY"
WARDEN_BODY=$WDIR/body-warden.zsh; warden_pane > "$WARDEN_BODY"
LIVE_BODY=$WDIR/body-live.zsh;     live_pane   > "$LIVE_BODY"
: > "$WDIR/panes.tsv"
# QA·MINI·2 only while its launchd job is loaded (Jon parked mini2 2026-11-23:
# one Inkling lane per mini). The warden evens NLANES rows, so the count follows.
MINI2=0; launchctl print "gui/$(id -u)/com.jalfern.forge-qa-mini2" >/dev/null 2>&1 && MINI2=1
NLANES=$(( 4 + MINI2 ))

# First pane: new-session can't use `pane`, so bake it and record it by hand.
bake builder-a 'BUILDER·A' "$LANE_BODY" L='BUILDER·A' KL='BUILDER-A' PORT=8000 PROV=omlx FIT=$FITPATH \
    P1='opencode run.*(THE FORGE( on slot a)?|QA MASTER on node builder)' P2='\.'
FIRST=$(tmux new-session -d -s "$SESSION" -x 120 -y 40 -P -F '#{pane_id}' "zsh '$WDIR/builder-a.zsh'")
PANEID[builder-a]=$FIRST
print -r -- "$FIRST	BUILDER·A	$WDIR/builder-a.zsh" >> "$WDIR/panes.tsv"
# #1259: dead panes stay in place (with their ids) so the supervisor can
# respawn them. Set before any pane can die.
tmux set-option -t "$SESSION" remain-on-exit on
apply_border_law
set_title "$FIRST" 'BUILDER·A'

ENVK=(L='BUILDER·B' KL='BUILDER-B' PORT=8000 PROV=omlx FIT=$FITPATH P1='opencode run.*THE FORGE on slot b' P2='\.')
pane builder-b 'BUILDER·B' "$LANE_BODY" -v -l 80% -t "${PANEID[builder-a]}"
ENVK=(L='QA·MINI' KL='QA-MINI' PORT=18000 PROV=omlxmini FIT=$FITPATH P1='opencode run.*QA MASTER on node ' P2='mini\.')
pane qa-mini 'QA·MINI' "$LANE_BODY" -v -l 75% -t "${PANEID[builder-b]}"
if (( MINI2 )); then
    ENVK=(L='QA·MINI·2' KL='QA-MINI-2' PORT=18000 PROV=omlxmini FIT=$FITPATH P1='opencode run.*QA MASTER on node ' P2='mini2\.')
    pane qa-mini2 'QA·MINI·2' "$LANE_BODY" -v -l 66% -t "${PANEID[qa-mini]}"
    STUDIO_ABOVE=qa-mini2
else
    STUDIO_ABOVE=qa-mini
fi
ENVK=(L='QA·STUDIO' KL='QA-STUDIO' PORT=8000 PROV=omlx FIT=$FITPATH P1='opencode run.*QA MASTER on node ' P2='studio\.')
pane qa-studio 'QA·STUDIO' "$LANE_BODY" -v -l 50% -t "${PANEID[$STUDIO_ABOVE]}"
ENVK=(PWLOG=$WDIR/pane.log FIT=$FITPATH NLANES=$NLANES)
pane warden 'WARDEN' "$WARDEN_BODY" -v -l 6 -t "${PANEID[qa-studio]}"
set_title "${PANEID[builder-b]}" 'BUILDER·B'
set_title "${PANEID[qa-mini]}" 'QA·MINI'
(( MINI2 )) && set_title "${PANEID[qa-mini2]}" 'QA·MINI·2'
set_title "${PANEID[qa-studio]}" 'QA·STUDIO'
set_title "${PANEID[warden]}" 'WARDEN'

# QWEN: a full-height pane on the right, 1/3 wide (#2286: was RETRO at 60%).
# `env -u TMUX` lets tmux nest; -A attaches to "qwen" if it exists, otherwise
# creates it in the repo. No patterns inside, so nothing to leak; baked so the
# supervisor can rebuild the pane (never the chat itself — nested session,
# separate lifecycle).
bake qwen QWEN /dev/null
print -r -- "exec env -u TMUX tmux new-session -A -s qwen -c \$HOME/Dev/retrogames" >> "$WDIR/qwen.zsh"
QWEN_PANE=$(tmux split-window -h -f -l 33% -P -F '#{pane_id}' -t "$SESSION" "zsh '$WDIR/qwen.zsh'")
print -r -- "$QWEN_PANE	QWEN	$WDIR/qwen.zsh" >> "$WDIR/panes.tsv"
set_title "$QWEN_PANE" 'QWEN'

# LIVE: right half of a lane's row. Each pane shares its lane's row, so the
# warden's resizing of that lane moves it too (the warden only lays out the
# x=0 column). One tap per stream: builder-a :8010, studio :8011 (#1268),
# builder-b :8012 and mini :8013 (#1356). Every target is the PANEID captured
# at creation — an index would name the wrong row once any earlier pane has
# been split (the #1356 bug: live-studio at 0.4 fell onto QA·MBP's row).
if (( LIVE )); then
    ENVK=(L='BUILDER' KL='BUILDER' LANE=builder TAPPORT=8010 FIT=$FITPATH)
    pane live-builder 'BUILDER·A · output' "$LIVE_BODY" -h -l 50% -t "${PANEID[builder-a]}"
    ENVK=(L='BUILDER·B' KL='BUILDER-B' LANE=builderb TAPPORT=8012 FIT=$FITPATH)
    pane live-builderb 'BUILDER·B · output' "$LIVE_BODY" -h -l 50% -t "${PANEID[builder-b]}"
    ENVK=(L='QA·MINI' KL='QA-MINI' LANE=mini TAPPORT=8013 FIT=$FITPATH)
    pane live-mini 'QA·MINI · output' "$LIVE_BODY" -h -l 50% -t "${PANEID[qa-mini]}"
    if (( MINI2 )); then
        ENVK=(L='QA·MINI·2' KL='QA-MINI-2' LANE=mini2 TAPPORT=8014 FIT=$FITPATH)
        pane live-mini2 'QA·MINI·2 · output' "$LIVE_BODY" -h -l 50% -t "${PANEID[qa-mini2]}"
    fi
    ENVK=(L='QA·STUDIO' KL='QA-STUDIO' LANE=studio TAPPORT=8011 FIT=$FITPATH)
    pane live-studio 'QA·STUDIO · output' "$LIVE_BODY" -h -l 50% -t "${PANEID[qa-studio]}"
    set_title "${PANEID[live-builder]}" 'BUILDER·A · output'
    set_title "${PANEID[live-builderb]}" 'BUILDER·B · output'
    set_title "${PANEID[live-mini]}" 'QA·MINI · output'
    (( MINI2 )) && set_title "${PANEID[live-mini2]}" 'QA·MINI·2 · output'
    set_title "${PANEID[live-studio]}" 'QA·STUDIO · output'
fi

# Mouse: on server-wide (-g), so the nested QWEN session gets it too. With it
# off there, the wheel over QWEN dropped the outer pane into copy-mode: the
# chat froze, scrolled junk, and typing seemed dead until `q`. And scrolling a
# lane pane enters copy-mode with -e, so scrolling back to the bottom exits it
# and the pane is live again (q or Esc also exits).
tmux set-option -g mouse on
tmux bind-key -n WheelUpPane if-shell -F '#{||:#{pane_in_mode},#{mouse_any_flag}}' \
    'send-keys -M' 'copy-mode -e'
tmux bind-key -T copy-mode Escape send-keys -X cancel
start_supervisor
exec tmux attach -t "$SESSION"
