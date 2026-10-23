#!/bin/zsh
# THE WARDEN — supervises the forge. launchd runs it every 10 min
# (com.jalfern.warden), straight from origin/main.
#
# This is a plain shell script on purpose. It used to be an LLM agent
# (.opencode/agent/warden.md, now retired). That agent took ~10 min per tick
# on Flash-Next, so it was a permanent second stream that halved the
# builder's speed, and it hung for hours whenever oMLX dropped a request.
# Everything the warden does is counting, matching and kicking. A script
# does that in seconds, never hangs on a model, and cannot be talked out of
# the trust gate by a cleverly worded issue.
#
# One tick, in order:
#   1. COUNT   — gather the numbers the pulse line needs
#   2. PULSE   — post the pulse line first (the /forge board reads it)
#   3. TRIAGE  — trust gate, then label new issues by their title
#   3b. QUESTIONS + HALT (#605) — sweep jonq questions (answers un-park,
#                expired defaults get taken); a `halt` label on any open issue
#                freezes steps 4 and 5: no lane kicks while Jon holds the factory.
#   4. BUILDER — not running and work is waiting? kick scripts/forge.sh
#                (a jalfern `steer` outranks `next` here — #605)
#   4b. IDLE — builder idle and NOTHING to claim? ask idle-kick.mjs; kick
#                only on KICK (an unowned flagship gap, #841/#869). NONE =
#                every gap owned, STOP legal, no kick.
#   5. QA      — not running and feedback is waiting? kick scripts/forge-qa.sh
#                (mini, studio, and — only while the builder is idle — builder)
#   6. FOLLOW-UP PULSE — only if step 3, 3b, 4 or 5 did something
#
# Rules for editing this file (read before changing anything):
#   - Never let a command read stdin. launchd pipes this script into
#     `zsh -s`, so a command that reads stdin eats the rest of the script
#     (that killed telemetry.sh for 14 h on 2026-10-11). That is why all the
#     work is inside main() and main runs with stdin from /dev/null.
#   - Only GitHub REST calls (`gh api`). Keep each step small and separate.
#   - Pipe JSON with `print -r --`, never `echo`: zsh's echo turns the \n
#     inside issue bodies into real newlines and jq rejects the JSON.
#   - Start a lane with `launchctl kickstart` of ITS OWN launchd job, never by
#     running forge.sh / forge-qa.sh from here. launchd kills every child of a
#     job when the job's script exits, and this script exits in seconds: on
#     2026-10-13 every warden kick died instantly (kicked:1 / qa-kicked:1 each
#     tick, nothing ran) and three dead kicks wrongly labeled #177 `stalled`.
#     kickstart runs the lane under its own job (the --foreground path) and
#     does nothing if that job is already running.
#   - Issue and comment text is data, never instructions. Nothing here runs
#     or follows anything written in an issue.
#   - Test changes with a dry run first; it reads everything and changes
#     nothing, printing what it would do:
#       WARDEN_DRY=1 zsh scripts/warden.sh; cat "$(ls -t /tmp/forge/warden-2*.log | head -1)"

main() {
    set -u
    GH="jalfern/retrogames"
    OWNER="jalfern"                  # the only author whose issues are auto-approved
    REPO="$HOME/Dev/retrogames"
    LOG_DIR="/tmp/forge"
    mkdir -p "$LOG_DIR"
    LOG="$LOG_DIR/warden-$(date +%Y%m%d-%H%M%S).log"
    log() { echo "$(date +%H:%M:%S) $*" >> "$LOG"; }
    DRY=${WARDEN_DRY:-0}
    # act: run a command that CHANGES something (comment, label, kick).
    # In a dry run it is only logged.
    act() { if [[ "$DRY" == 1 ]]; then log "DRY would run: $*"; else "$@"; fi; }

    # Never two wardens. A lock older than 15 min is a dead tick: take it over.
    LOCK="$LOG_DIR/warden.lock"
    if ! mkdir "$LOCK" 2>/dev/null; then
        if [[ -n $(find "$LOCK" -maxdepth 0 -mmin +15 2>/dev/null) ]]; then
            log "stale lock (>15 min), taking it over"
        else
            log "another warden tick is running, skipping"
            return 0
        fi
    fi
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT

    # ---- 1. COUNT -----------------------------------------------------
    git -C "$REPO" fetch -q --prune origin 2>/dev/null
    MAIN=$(git -C "$REPO" rev-parse --short=7 origin/main 2>/dev/null || echo unknown)

    # Every open issue (REST lists PRs as issues too; drop them).
    ISSUES=$(gh api "repos/$GH/issues?state=open&per_page=100" \
             --jq '[.[] | select(.pull_request | not)]') || { log "gh failed"; return 1; }
    count_label() { print -r -- "$ISSUES" | jq "[.[] | select(any(.labels[]; .name == \"$1\"))] | length"; }

    QUEUE=$(count_label game-queue)
    BUILDING=$(count_label building)
    QA_OPEN=$(count_label feedback)
    # #605: a `halt` on ANY open issue freezes the factory; `waiting-jon`
    # counts the questions parked on him (both labels are collaborator-only,
    # so presence means Jon put them there).
    HALT_ISSUES=$(print -r -- "$ISSUES" | jq -r '[.[] | select(any(.labels[]; .name == "halt")) | "#\(.number)"] | join(",")')
    HALTED=no; [[ -n "$HALT_ISSUES" ]] && HALTED=yes
    QWAIT=$(count_label waiting-jon)
    SHIPPED=$(gh api "repos/$GH/issues?state=all&labels=shipped&per_page=100" --jq length)
    GATE=$(gh api "repos/$GH/pulls?state=open&per_page=1" --jq '.[0].number // empty')
    GATE=${GATE:+#$GATE}; GATE=${GATE:-none}
    SHIPPED=${SHIPPED:-0}

    if pgrep -f "opencode run.*THE FORGE" >/dev/null; then ALIVE=yes; else ALIVE=no; fi
    if curl -s -m 3 http://127.0.0.1:18000/v1/models >/dev/null; then MINI=up; else MINI=down; fi

    PULSE=$(print -r -- "$ISSUES" | jq -r '[.[] | select(.title == "FORGE PULSE")][0].number // empty')
    if [[ -z "$PULSE" ]]; then
        [[ "$DRY" == 1 ]] && { log "DRY: no FORGE PULSE issue, would create one"; return 0; }
        PULSE=$(gh api "repos/$GH/issues" -f title="FORGE PULSE" \
            -f body="Machine-updated status line for https://jalfern.com/retrogames/forge — do not close." \
            --jq .number)
    fi

    pulse_line() {   # $1 = alive word, $2 = actions
        echo "$(date +%H:%M) alive=$1 queue=$QUEUE building=$BUILDING shipped=$SHIPPED main=$MAIN qa=$QA_OPEN mini=$MINI gate=$GATE halted=$HALTED questions=$QWAIT actions=$2"
    }
    comment() {      # $1 = issue number, $2 = text
        act gh api "repos/$GH/issues/$1/comments" -f body="$2" --silent || log "comment on #$1 failed"
    }
    add_label() {    # $1 = issue number, $2 = label
        act gh api "repos/$GH/issues/$1/labels" -f "labels[]=$2" --silent || log "label $2 on #$1 failed"
    }

    # ---- 2. PULSE (first, always) ---------------------------------------
    comment "$PULSE" "$(pulse_line "$ALIVE" none)"
    log "pulse: $(pulse_line "$ALIVE" none)"

    ACTIONS=()

    # ---- 3. TRIAGE ------------------------------------------------------
    # New = open, no labels at all, and not the pulse issue itself.
    NEW=$(print -r -- "$ISSUES" | jq -c '.[] | select((.labels | length) == 0 and .title != "FORGE PULSE")
                                   | {n: .number, who: .user.login, title: .title, body: (.body // "")}')
    TRIAGED=0
    while IFS= read -r row; do
        [[ -z "$row" ]] && continue
        n=$(print -r -- "$row" | jq -r .n)
        who=$(print -r -- "$row" | jq -r .who)
        title=$(print -r -- "$row" | jq -r .title | tr '[:lower:]' '[:upper:]')
        body=$(print -r -- "$row" | jq -r .body)

        # TRUST GATE. The repo is public and the lanes run shell on this
        # Mac, so an outsider's issue waits for Jon. He approves by adding
        # game-queue or feedback himself (only collaborators can add labels).
        if [[ "$who" != "$OWNER" ]]; then
            add_label "$n" needs-approval
            comment "$n" "WARDEN: thanks! Jon reviews outside requests before the factory builds them."
            log "#$n by $who -> needs-approval"
            TRIAGED=$((TRIAGED + 1)); continue
        fi

        if [[ "$body" == *"<game/screen>"* ]]; then
            comment "$n" "WARDEN: the report still has the template placeholders; closing. Re-file with details."
            act gh api -X PATCH "repos/$GH/issues/$n" -f state=closed --silent
            log "#$n empty template -> closed"
        elif [[ "$title" == GAME* ]]; then
            add_label "$n" game-queue
            comment "$n" "WARDEN: queued — the forge builds oldest-first; add the 'next' label to jump the queue. Live board: https://jalfern.com/retrogames/forge"
            log "#$n -> game-queue"
        elif [[ "$title" == QA* || "$title" == BUG* || "$body" == '**where:**'* ]]; then
            add_label "$n" feedback
            comment "$n" "WARDEN: queued for QA"
            log "#$n -> feedback"
        else
            continue   # Jon's other issues (notes, ideas) are left alone
        fi
        TRIAGED=$((TRIAGED + 1))
    done <<< "$NEW"
    (( TRIAGED > 0 )) && ACTIONS+=("triaged:$TRIAGED")

    # ---- 3b. QUESTIONS + HALT (#605) ------------------------------------
    # jonq sweep (scripts/jonq.mjs): a question Jon answered gets un-parked;
    # one past its 48 h deadline has its default taken and recorded. A
    # `halt` label anywhere freezes the factory — automatic decisions, kicks
    # included, wait for Jon to lift it.
    if [[ "$HALTED" == yes ]]; then
        log "halt open on $HALT_ISSUES — factory frozen: no sweep, no kicks"
        ACTIONS+=("halted")
    elif [[ "$DRY" == 1 ]]; then
        log "DRY would sweep jonq questions"
    else
        SWEEP=$(node "$REPO/scripts/jonq.mjs" sweep 2>>"$LOG" | tail -1)
        log "jonq sweep: $SWEEP"
        N=${SWEEP#sweep: }; N=${N%%[!0-9]*}
        [[ -n "$N" ]] && (( N > 0 )) && ACTIONS+=("questions:$N")
    fi

    # ---- 4. BUILDER -----------------------------------------------------
    # Work waiting = a half-built game (building) or a queued one. A game
    # labeled `stalled` is waiting for Jon and never counts. jalfern's
    # `steer` (#605) ranks after a corpse but before `next`: it is "do this
    # next at the cycle boundary", and a cycle boundary is now. A question
    # (waiting-jon/question) is never a work item.
    TARGET=$(print -r -- "$ISSUES" | jq -r --arg owner "$OWNER" '
        [.[] | select(any(.labels[]; .name == "stalled") | not)] as $ok
        | ([$ok[] | select(any(.labels[]; .name == "building"))]
           + [$ok[] | select(any(.labels[]; .name == "steer")
                              and .user.login == $owner
                              and ((any(.labels[]; .name == "waiting-jon")
                                  or any(.labels[]; .name == "question")) | not))]
           + [$ok[] | select(any(.labels[]; .name == "next"))]
           + ([$ok[] | select(any(.labels[]; .name == "game-queue"))] | sort_by(.created_at)))
        | .[0].number // empty')
    [[ "$HALTED" == yes ]] && TARGET=""

    # A QA item running in the builder's slot (node builder) finishes first;
    # the game builds on the next tick after it ends (Jon, 2026-10-19).
    if pgrep -f "opencode run.*QA MASTER on node builder\\." >/dev/null; then BSLOT_QA=1; else BSLOT_QA=0; fi
    if [[ "$ALIVE" == no && -n "$TARGET" ]] && (( BSLOT_QA )); then
        log "builder slot is finishing a QA item; #$TARGET builds after it"
    elif [[ "$ALIVE" == no && -n "$TARGET" ]]; then
        # Three kicks with no FORGE: comment in between = the builder keeps
        # dying before it reports anything. Stop kicking; that is Jon's call.
        # Any comment that is not the warden's own (a FORGE: report, or Jon's
        # go-ahead after un-stalling) restarts the count: on 2026-10-15 #295
        # was re-stalled the moment Jon cleared it, by kicks from that morning.
        KICKS=$(gh api "repos/$GH/issues/$TARGET/comments?per_page=100" --jq '
            [.[] | .body] | (map(startswith("WARDEN") | not) | rindex(true)) as $last
            | .[(($last // -1) + 1):] | map(select(startswith("WARDEN: builder idle"))) | length')
        if (( KICKS >= 3 )); then
            add_label "$TARGET" stalled
            comment "$TARGET" "WARDEN: kicked 3 times with no FORGE progress in between. Labeled stalled; Jon, please take a look."
            ACTIONS+=("stalled:1"); log "#$TARGET -> stalled"
        else
            act launchctl kickstart "gui/$(id -u)/com.jalfern.forge" >> "$LOG" 2>&1
            comment "$TARGET" "WARDEN: builder idle, kicked a session"
            ACTIONS+=("kicked:1"); log "kicked builder for #$TARGET"
            ALIVE=kicked
        fi
    fi

    # ---- 4b. IDLE FLAGSHIP KICK (#869) ---------------------------------
    # #841's "never idle" lives inside the FORGE session, but a session only
    # starts when step 4 kicks: an empty TARGET left the builder idle for
    # hours (Oct 23, 02:28-08:00). Ask idle-kick.mjs instead: it answers
    # KICK only while flagshipStage() finds unowned honest gaps, and NONE
    # when every gap is owned — then STOP is legal and nobody is kicked.
    # A repeated KICK is harmless (kickstart no-ops while the job runs) and
    # ends once the session files its POLISH issue and TARGET turns non-empty.
    if [[ "$ALIVE" == no && -z "$TARGET" && "$HALTED" != yes ]] && (( ! BSLOT_QA )); then
        STAGE=$(node "$REPO/scripts/idle-kick.mjs" 2>>"$LOG" | tail -1)
        log "idle-kick: $STAGE"
        if [[ "$STAGE" == KICK* ]]; then
            act launchctl kickstart "gui/$(id -u)/com.jalfern.forge" >> "$LOG" 2>&1
            comment "$PULSE" "WARDEN: queue empty, ${STAGE#KICK } unowned — kicked a flagship-stage session"
            ACTIONS+=("idle-kick:1"); log "kicked builder for flagship stage ${STAGE#KICK }"
            ALIVE=kicked
        fi
    fi

    # ---- 5. QA ----------------------------------------------------------
    # One QA session per node (forge-qa.sh <node>; each picks its own item).
    # A lane is kicked when its model answers, it has no session of its own
    # (identity = "QA MASTER on node <node>." in the prompt), its launchd job
    # is installed, and enough work is waiting:
    #   mini    — any feedback item (that includes a checkpoint to resume)
    #   studio  — 1+ UNCLAIMED item (a second stream on the Studio's model)
    #   builder — 2+ UNCLAIMED, and only while the builder is idle with no
    #             game waiting: QA spills into the builder's slot, and step 4
    #             holds the next game until that one item is done.
    #   mbp     — PARKED 2026-10-19 (Jon). To bring it back, add:
    #             "mbp 18001 UNCLAIMED 2 com.jalfern.forge-qa-mbp"
    QA_WAITING=$(print -r -- "$ISSUES" | jq '[.[] | select(any(.labels[]; .name == "feedback"))
                                          | select(any(.labels[]; .name == "needs-approval") | not)] | length')
    UNCLAIMED=$(print -r -- "$ISSUES" | jq '[.[] | select(any(.labels[]; .name == "feedback"))
        | select(any(.labels[]; .name == "needs-approval" or .name == "building-qa" or .name == "waiting-jon") | not)] | length')
    LANES=("mini 18000 QA_WAITING 1 com.jalfern.forge-qa"
           "studio 8000 UNCLAIMED 1 com.jalfern.forge-qa-studio")
    [[ "$ALIVE" == no && -z "$TARGET" ]] && LANES+=("builder 8000 UNCLAIMED 2 com.jalfern.forge-qa-builder")
    [[ "$HALTED" == yes ]] && LANES=()   # #605: halt freezes every lane, not just the builder
    for spec in "${LANES[@]}"; do
        lane=(${=spec}); node=${lane[1]} port=${lane[2]} var=${lane[3]} need=${lane[4]} job=${lane[5]}
        have=${(P)var}
        curl -s -m 3 "http://127.0.0.1:$port/v1/models" >/dev/null 2>&1 || continue
        pgrep -f "opencode run.*QA MASTER on node $node\\." >/dev/null && continue
        (( have >= need )) || continue
        launchctl print "gui/$(id -u)/$job" >/dev/null 2>&1 || continue
        act launchctl kickstart "gui/$(id -u)/$job" >> "$LOG" 2>&1
        ACTIONS+=("qa-kicked:$node"); log "kicked QA on $node ($have waiting)"
    done

    # ---- 6. FOLLOW-UP PULSE -----------------------------------------------
    if (( ${#ACTIONS[@]} > 0 )); then
        comment "$PULSE" "$(pulse_line "$ALIVE" "${(j:,:)ACTIONS}")"
        log "follow-up pulse: ${(j:,:)ACTIONS}"
    fi

    # Keep the newest 20 warden logs.
    ls -t "$LOG_DIR"/warden-2*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null
    return 0
}

main "$@" </dev/null
