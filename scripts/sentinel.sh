#!/bin/zsh
# THE SENTINEL — no-model watchdog for the lanes. launchd runs it every 3 min
# (com.jalfern.sentinel), straight from origin/main, like the warden.
#
# Why it exists: when oMLX restarts, or drops and reloads a model mid-request,
# an opencode agent waits forever on the dead request and nothing recovers
# until Jon kills PIDs by hand (3 times: Oct 11 x2, Oct 12 21:46). This is the
# automatic version. It only counts, matches and kills — it never calls a
# model, so it cannot hang on one.
#
# Kill signals (issue #180, with Jon's 2026-10-13 corrections, exactly):
#   dead-request   — the agent's log has not grown for 5 min AND oMLX shows no
#                    active generation (server + its children near-idle over
#                    a >= 5-min window) AND the agent has no running child
#                    process (a tool call always runs as a child; an agent
#                    waiting on the model has none). All three, or no kill.
#                    Applies to builder AND qa.
#   server-restart — omlx-server started AFTER the agent: its request died
#                    with the old server. Kept as the extra cheap case; only
#                    when the agent has no child (a restart while it is inside
#                    a tool call has no in-flight request to kill).
#   log-silent-25m — builder log not grown for 25 min AND no running child.
#                    The 25-min floor is per the issue ("do not go lower").
#                    The no-child guard is the same one dead-request got:
#                    opencode logs no tool output, so a 40-min heistmutate is
#                    silent for 40 min while perfectly healthy.
#   stuck-tick     — a warden tick process is running but the newest warden
#                    log is older than 15 min.
#
# After any kill: one 1-token request to the STUDIO model (to load it — the
# QA lane's mini model is never touched), and one line per kill on FORGE
# PULSE: `sentinel: killed <lane> (<reason>)`.
#
# Rules for editing (same spirit as warden.sh):
#   - Never let a command read stdin (launchd pipes this into `zsh -s`);
#     main runs with stdin from /dev/null.
#   - Plain counting, matching, killing. At most one gh api call (the pulse).
#   - The helpers (cpusec / etime_sec / decide_dead / decide_silent /
#     omlx_idle / agent_tick / omlx_tick) are pure and unit-tested by
#     scripts/sentinelcheck.sh — keep them pure. agent_tick and omlx_tick are
#     the window accumulators: they turn a per-tick sample into a silence /
#     idle window that persists across ticks (see their comments).
#   - Test: SENTINEL_DRY=1 zsh scripts/sentinel.sh (reads everything, acts on
#     nothing). Never `launchctl load` from a PR.

DEAD_REQ_SECS=300         # 5 min: dead-request silence floor (Jon's correction)
BUILDER_SILENT_SECS=1500  # 25 min: builder-silence floor (issue: do not go lower)
IDLE_WINDOW_SECS=300      # the oMLX "not generating" window must be this long
IDLE_PCT=10               # server+children under 10% CPU over the window = idle
WARDEN_STUCK_SECS=900     # 15 min: a warden tick older than this is stuck

# macOS `ps -o time=` shapes: MM:SS.cc (minutes unbounded), H:MM:SS, S — and
# DD-HH:MM:SS defensively. -> integer seconds
cpusec() {
    local t=$1 d h m s rest
    t=${t%%[[:space:]]*}
    if [[ "$t" == *-* ]]; then
        d=${t%%-*}; rest=${t#*-}
        h=${rest%%:*}; rest=${rest#*:}
        m=${rest%%:*}; s=${rest#*:}
        echo $(( d * 86400 + h * 3600 + m * 60 + ${s%%.*} ))
    elif [[ "$t" == *:*:* ]]; then
        h=${t%%:*}; rest=${t#*:}
        m=${rest%%:*}; s=${rest#*:}
        echo $(( h * 3600 + m * 60 + ${s%%.*} ))
    elif [[ "$t" == *:* ]]; then
        m=${t%%:*}; s=${t#*:}
        echo $(( m * 60 + ${s%%.*} ))
    else
        echo "${t%%.*}"
    fi
}

# BSD etime shapes: [DD-]HH:MM:SS, H:MM:SS, MM:SS. -> integer seconds
etime_sec() {
    local t=$1 d h m s rest
    t=${t%%[[:space:]]*}
    if [[ "$t" == *-* ]]; then
        d=${t%%-*}; rest=${t#*-}
        h=${rest%%:*}; rest=${rest#*:}
        m=${rest%%:*}; s=${rest#*:}
        echo $(( d * 86400 + h * 3600 + m * 60 + s ))
    elif [[ "$t" == *:*:* ]]; then
        h=${t%%:*}; rest=${t#*:}
        m=${rest%%:*}; s=${rest#*:}
        echo $(( h * 3600 + m * 60 + s ))
    else
        m=${t%%:*}; s=${t#*:}
        echo $(( m * 60 + s ))
    fi
}

# $1=silent_secs $2=omlx_idle $3=has_child $4=restarted
# -> kill:server-restart | kill:dead-request | hold
decide_dead() {
    local ss=$1 idle=$2 child=$3 restart=$4
    if (( restart && ! child )); then
        echo kill:server-restart
        return
    fi
    if (( ss >= DEAD_REQ_SECS && idle && ! child )); then
        echo kill:dead-request
        return
    fi
    echo hold
}

# $1=silent_secs $2=has_child   (builder only)
# -> kill:log-silent-25m | hold
decide_silent() {
    local ss=$1 child=$2
    if (( ss >= BUILDER_SILENT_SECS && ! child )); then
        echo kill:log-silent-25m
        return
    fi
    echo hold
}

# $1=cpu_seconds_burned $2=wall_seconds -> 1 if oMLX is "not generating":
# the window is at least IDLE_WINDOW_SECS long AND the server+children burned
# under IDLE_PCT% of it (delta/wall < IDLE_PCT/100, in integer math).
omlx_idle() {
    local delta=$1 wall=$2
    if (( wall >= IDLE_WINDOW_SECS && delta * 100 < wall * IDLE_PCT )); then
        echo 1
    else
        echo 0
    fi
}

# agent_tick <mode> <prev_wm> <now> -> "<new_wm> <silence>"
# The watermark is the time the agent's log LAST GREW. It only moves when the
# log grows, so the silence (now - watermark) ACCUMULATES across 3-min ticks
# past the 300 s / 1500 s floors. The old code re-stamped the watermark to NOW
# every tick, capping the measured silence at one tick — so dead-request and
# log-silent-25m could never fire. Modes: 0=grew, 1=unchanged, 2=unknown (new
# file / truncated / no agent: re-baseline, silence -1 => never kill on it).
agent_tick() {
    local mode=$1 wm=$2 now=$3
    if (( mode == 0 )); then echo "$now 0"
    elif (( mode == 1 )); then echo "$wm $(( now - wm ))"
    else echo "$now -1"
    fi
}

# omlx_tick <wm_in> <wmc_in> <prev_time> <prev_cpu> <now> <cpu>
#   -> "<idle> <new_wm> <new_wm_cpu> <new_prev_time> <new_prev_cpu>"
# The watermark (wm) is the time oMLX LAST GENERATED — persisted across ticks as
# omlx_w_at. The previous-tick sample (prev_time/prev_cpu, omlx_p_at/_cpu) is a
# separate, one-step sample used only to detect "generating right now." They
# diverge while the server idles, which is exactly what lets the idle window
# accumulate: a tick that burns >= IDLE_PCT of its wall means the server is
# generating, so the watermark jumps to now and the idle clock restarts; while
# it idles the watermark stays put, so (now - watermark) grows across ticks
# until it crosses IDLE_WINDOW_SECS and omlx_idle confirms the burn stayed under
# IDLE_PCT. prev_time=0 means "no sample yet" (first tick / fresh state file):
# baseline, not idle.
omlx_tick() {
    local wm=$1 wmc=$2 pt=$3 pc=$4 now=$5 cpu=$6
    local gen=0 pwall wall idle
    if (( pt == 0 )); then
        wm=$now; wmc=$cpu
    else
        pwall=$(( now - pt ))
        if (( pwall > 0 && (cpu - pc) * 100 >= pwall * IDLE_PCT )); then
            wm=$now; wmc=$cpu; gen=1
        fi
    fi
    wall=$(( now - wm ))
    idle=0
    (( gen )) || idle=$(omlx_idle $(( cpu - wmc )) $wall)
    echo "$idle $wm $wmc $now $cpu"
}

main() {
    set -u
    local REPO="$HOME/Dev/retrogames"
    local GH="jalfern/retrogames"
    local LOG_DIR="/tmp/forge"
    mkdir -p "$LOG_DIR"
    local LOG="$LOG_DIR/sentinel-$(date +%Y%m%d-%H%M%S).log"
    log() { echo "$(date +%H:%M:%S) $*" >> "$LOG"; }
    local DRY=${SENTINEL_DRY:-0}
    # act: run a command that CHANGES something (kill, comment, curl).
    # In a dry run it is only logged.
    act() { if [[ "$DRY" == 1 ]]; then log "DRY would run: $*"; else "$@"; fi; }

    # Never two sentinels. A lock older than 10 min is a dead tick: take it over.
    local LOCK="$LOG_DIR/sentinel.lock"
    if ! mkdir "$LOCK" 2>/dev/null; then
        if [[ -n $(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null) ]]; then
            log "stale lock (>10 min), taking it over"
        else
            log "another sentinel tick is running, skipping"
            return 0
        fi
    fi
    # Double quotes: $LOCK must expand NOW (it is local to main and gone by
    # the time the EXIT trap runs; the warden gets away with single quotes
    # only because its variables are global).
    trap "rmdir '$LOCK' 2>/dev/null" EXIT

    local NOW=$(date +%s)
    local STATE="$LOG_DIR/sentinel-state"
    local -A S=()
    if [[ -r $STATE ]]; then
        local k v
        while IFS='=' read -r k v; do
            [[ -n $k ]] && S[$k]=$v
        done < "$STATE"
    fi

    local B_PID Q_PID O_PID
    B_PID=$(pgrep -f "opencode run.*THE FORGE" | head -1)
    Q_PID=$(pgrep -f "opencode run.*QA MASTER" | head -1)
    O_PID=$(pgrep -x omlx-server | head -1)

    has_child() { [[ -n $(pgrep -P "$1" 2>/dev/null | head -1) ]]; }

    # agent_mode <pid> <logpath> <prev_log> <prev_size> -> 0 grew / 1 unchanged /
    # 2 unknown. The watermark (last-grew time) is derived from this in main via
    # the pure agent_tick; it is stored as <key>_wm so the silence accumulates
    # across ticks instead of being re-stamped to NOW every tick.
    agent_mode() {
        local pid=$1 logpath=$2 plog=$3 psize=$4 size
        [[ -z $pid || -z $logpath ]] && { echo 2; return; }
        size=$(stat -f %z "$logpath" 2>/dev/null) || { echo 2; return; }
        [[ -z $plog || -z $psize ]] && { echo 2; return; }
        [[ "$plog" != "$logpath" ]] && { echo 2; return; }
        if (( size > psize )); then echo 0
        elif (( size < psize )); then echo 2     # truncated: no baseline
        else echo 1
        fi
    }

    # ---- observe the agents --------------------------------------------------
    # Newest log wins; the warden's proven ls -t pattern (a no-match glob makes
    # zsh abort the command and ls never runs — no null_glob needed).
    local B_LOG Q_LOG B_SIL Q_SIL B_WM Q_WM B_CH=0 Q_CH=0
    B_LOG=$(ls -t "$LOG_DIR"/2*.log 2>/dev/null | head -1)
    Q_LOG=$(ls -t "$LOG_DIR"/qa-2*.log 2>/dev/null | head -1)
    local bm qm
    bm=$(agent_mode "$B_PID" "$B_LOG" "${S[builder_log]:-}" "${S[builder_size]:-}")
    qm=$(agent_mode "$Q_PID" "$Q_LOG" "${S[qa_log]:-}" "${S[qa_size]:-}")
    read -r B_WM B_SIL <<< "$(agent_tick "$bm" "${S[builder_wm]:-0}" "$NOW")"
    read -r Q_WM Q_SIL <<< "$(agent_tick "$qm" "${S[qa_wm]:-0}" "$NOW")"
    [[ -n $B_PID ]] && has_child "$B_PID" && B_CH=1
    [[ -n $Q_PID ]] && has_child "$Q_PID" && Q_CH=1

    # ---- observe oMLX ----------------------------------------------------------
    # Cumulative CPU of the server + its children; the previous tick's sample
    # is kept in state, so a 5-min window is measurable from a 3-min tick.
    omlx_cpu_total() {
        local pid=$1 total=0 c t
        [[ -z $pid ]] && { echo 0; return; }
        for c in $pid ${(f)$(pgrep -P "$pid" 2>/dev/null)}; do
            t=$(ps -o time= -p "$c" 2>/dev/null | tr -d ' ')
            [[ -n $t ]] && total=$(( total + $(cpusec "$t") ))
        done
        echo $total
    }
    local O_CPU=$(omlx_cpu_total "$O_PID")
    local O_IDLE=0 O_WM=0 O_WMC=0 O_PT=0 O_PC=0 O_RESTART_B=0 O_RESTART_Q=0
    # prev_time=0 => no sample yet (first tick or a state file from before the
    # watermark): omlx_tick baselines instead of declaring idle.
    local prev_time=${S[omlx_p_at]:-0} prev_cpu=${S[omlx_p_cpu]:-0}
    local wm_in=${S[omlx_w_at]:-0} wmc_in=${S[omlx_w_cpu]:-0}
    read -r O_IDLE O_WM O_WMC O_PT O_PC <<< "$(omlx_tick "$wm_in" "$wmc_in" "$prev_time" "$prev_cpu" "$NOW" "$O_CPU")"
    # A server that started AFTER the agent: the agent's request died with the
    # old server. (Start = now - etime, so the server is newer when its
    # elapsed time is smaller.)
    if [[ -n $O_PID ]]; then
        local ostart=$(ps -o etime= -p "$O_PID" 2>/dev/null)
        local astart
        if [[ -n $B_PID ]]; then
            astart=$(ps -o etime= -p "$B_PID" 2>/dev/null)
            (( $(etime_sec "$ostart") < $(etime_sec "$astart") )) && O_RESTART_B=1
        fi
        if [[ -n $Q_PID ]]; then
            astart=$(ps -o etime= -p "$Q_PID" 2>/dev/null)
            (( $(etime_sec "$ostart") < $(etime_sec "$astart") )) && O_RESTART_Q=1
        fi
    fi

    # ---- decide ----------------------------------------------------------------
    local KILLS=() d
    if [[ -n $B_PID ]]; then
        d=$(decide_dead "$B_SIL" "$O_IDLE" "$B_CH" "$O_RESTART_B")
        [[ $d == hold ]] && d=$(decide_silent "$B_SIL" "$B_CH")
        if [[ $d == kill:* ]]; then
            KILLS+=("builder ${d#kill:}")
            act kill "$B_PID"
            log "killed builder pid=$B_PID reason=${d#kill:}"
        fi
    fi
    if [[ -n $Q_PID ]]; then
        d=$(decide_dead "$Q_SIL" "$O_IDLE" "$Q_CH" "$O_RESTART_Q")
        if [[ $d == kill:* ]]; then
            KILLS+=("qa ${d#kill:}")
            act kill "$Q_PID"
            log "killed qa pid=$Q_PID reason=${d#kill:}"
        fi
    fi

    # ---- signal 3: a stuck warden tick ------------------------------------------
    warden_pids() {
        local p args
        for p in ${(f)$(pgrep -f "warden\.sh" 2>/dev/null)}; do
            args=$(ps -o args= -p "$p" 2>/dev/null)
            case "$args" in
                *zsh\ -s\ --\ warden.sh) echo "$p" ;;           # launchd form
                *zsh\ */scripts/warden.sh) echo "$p" ;;         # manual form
                *zsh\ scripts/warden.sh) echo "$p" ;;
            esac
        done
    }
    local wout="" wpids=()
    wout=$(warden_pids)
    [[ -n $wout ]] && wpids=( ${(f)wout} )
    local W_LOG=$(ls -t "$LOG_DIR"/warden-2*.log 2>/dev/null | head -1)
    if (( ${#wpids[@]} > 0 )) && [[ -n $W_LOG ]]; then
        local wm=$(stat -f %m "$W_LOG" 2>/dev/null)
        if [[ -n $wm ]] && (( NOW - wm > WARDEN_STUCK_SECS )); then
            KILLS+=("warden stuck-tick")
            local p
            for p in "${wpids[@]}"; do
                act kill "$p"
                log "killed warden tick pid=$p (newest log $(( (NOW - wm) / 60 )) min old)"
            done
        fi
    fi

    # ---- after any kill: load the studio model, one line on FORGE PULSE --------
    if (( ${#KILLS[@]} > 0 )); then
        local STUDIO=$(jq -r '.model // empty' "$REPO/opencode.json" 2>/dev/null)
        STUDIO=${STUDIO:-omlx/Qwen3.8-Flash-Next-oQ5e-mtp}
        # Studio model only — never the QA lane's mini model.
        act curl -s -m 120 -X POST http://127.0.0.1:18000/v1/chat/completions \
            -H 'Content-Type: application/json' \
            -d "{\"model\":\"$STUDIO\",\"messages\":[{\"role\":\"user\",\"content\":\"1\"}],\"max_tokens\":1}" >/dev/null
        local PULSE_N=$(gh api "repos/$GH/issues?state=open&per_page=100" \
            --jq '[.[] | select(.pull_request | not) | select(.title == "FORGE PULSE")][0].number // empty' 2>/dev/null)
        if [[ -n $PULSE_N ]]; then
            local lines=() k
            for k in "${KILLS[@]}"; do
                lines+=("sentinel: killed ${k%% *} (${k#* })")
            done
            local body="${(j:$'\n')lines}"
            act gh api "repos/$GH/issues/$PULSE_N/comments" -f body="$body" --silent
            log "pulse: $body"
        else
            log "no FORGE PULSE issue found; kill lines logged here only"
        fi
    fi

    # ---- save state for the next tick --------------------------------------------
    # _wm keys are the persistent watermarks (last-grew / last-generation time);
    # they are what let the silence and idle windows accumulate past one tick.
    {
        echo "builder_log=$B_LOG"
        echo "builder_size=$(stat -f %z "$B_LOG" 2>/dev/null || echo 0)"
        echo "builder_wm=$B_WM"
        echo "qa_log=$Q_LOG"
        echo "qa_size=$(stat -f %z "$Q_LOG" 2>/dev/null || echo 0)"
        echo "qa_wm=$Q_WM"
        echo "omlx_pid=$O_PID"
        echo "omlx_w_at=$O_WM"
        echo "omlx_w_cpu=$O_WMC"
        echo "omlx_p_at=$O_PT"
        echo "omlx_p_cpu=$O_PC"
    } > "$STATE"

    # Keep the newest 20 sentinel logs.
    ls -t "$LOG_DIR"/sentinel-2*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null

    local ktxt=${(j:,:)KILLS[@]}
    [[ -z $ktxt ]] && ktxt=none
    log "tick: b=${B_PID:-no}(sil=$B_SIL ch=$B_CH) q=${Q_PID:-no}(sil=$Q_SIL ch=$Q_CH) omlx=${O_PID:-no}(cpu=$O_CPU idle=$O_IDLE) kills=$ktxt"
    return 0
}

if [[ ${SENTINEL_CHECK:-0} != 1 ]]; then
    main "$@" </dev/null
fi
