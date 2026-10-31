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
#   0. SLEEP — gap since my last tick ≫ 10 min? The Studio was down (asleep);
#              record the window (#1354) and echo it on the pulse line.
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

    # ---- 0. SLEEP WATCH (#1354) -----------------------------------------
    # The warden cannot tick while the Mac sleeps, so the gap between its own
    # ticks is the cheapest honest outage witness. sleepwatch.mjs turns a gap
    # ≥ 30 min into a named window — pmset supplies the real Sleep→Wake bounds
    # and the reason ("Software Sleep"), dark-wakes inside are counted as
    # naps, not uptime — keeps a 48 h ledger at /tmp/forge/asleep.json, and
    # echoes the newest window on every pulse line for 24 h after it ends.
    # The board banner (floor.js) and the questions digest (jonq digest) read
    # the same ledger. Backfill runs ONCE (no ledger yet) so the incident that
    # motivated #1354 goes on the record honestly, from pmset history.
    # Keeping the Mac awake stays Jon's call — this only reports.
    ASLEEP=""
    SW="$LOG_DIR/sleepwatch.mjs"
    git -C "$REPO" show origin/main:scripts/sleepwatch.mjs > "$SW" 2>/dev/null \
        || cp "$REPO/scripts/sleepwatch.mjs" "$SW" 2>/dev/null || true
    # -s, not -f: a failed `git show` still leaves a ZERO-byte file behind,
    # and node running an empty module silently no-ops the whole step.
    if [[ -s "$SW" ]]; then
        NOWN=$(date +%s)
        SWDRY=""; [[ "$DRY" == 1 ]] && SWDRY="--dry"
        [[ ! -f "$LOG_DIR/asleep.json" ]] && log "sleep backfill: $(node "$SW" backfill --out "$LOG_DIR/asleep.json" $SWDRY 2>>"$LOG" | tail -1)"
        LASTT=""
        [[ -f "$LOG_DIR/warden.lasttick" ]] && LASTT=$(head -1 "$LOG_DIR/warden.lasttick" 2>/dev/null)
        SREC=$(node "$SW" tick --last "$LASTT" --now "$NOWN" --out "$LOG_DIR/asleep.json" $SWDRY 2>>"$LOG" | tail -1)
        [[ "$DRY" != 1 ]] && print -r -- "$NOWN" > "$LOG_DIR/warden.lasttick"
        ASLEEP=$(node "$SW" pulse --out "$LOG_DIR/asleep.json" 2>/dev/null | tail -1)
        [[ "$SREC" == recorded=[1-9]* ]] && log "sleepwatch: $SREC -> $ASLEEP"
    fi

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

    # #891: find the pulse by title SEARCH (open AND closed), never by paging
    # the flat open list — that missed it past 100 issues or once it was
    # closed, and the warden made a 2nd copy (8 dups). pulse.mjs keeps exactly
    # ONE open pulse: reopens the newest if only closed ones exist, closes
    # stray open dups, and creates only when none exist at all. Its decision
    # (planPulse, scripts/lib/pulse.mjs) is pinned by pulsecheck. A failed
    # lookup aborts (a non-numeric answer) rather than risk another duplicate.
    PMDS=""; [[ "$DRY" == 1 ]] && PMDS="--dry"
    PULSE=$(node "$REPO/scripts/pulse.mjs" $PMDS 2>>"$LOG" | tail -1)
    if [[ "$DRY" == 1 && "$PULSE" == "0" ]]; then
        log "DRY: no FORGE PULSE issue, would create one"
        return 0
    fi
    [[ "$PULSE" =~ ^[0-9]+$ ]] || { log "pulse lookup failed (got: ${PULSE:-empty}) — aborting, no duplicate"; return 1; }

    pulse_line() {   # $1 = alive word, $2 = actions
        # #1258: `builders=N/2` — how many builder slots are running right now
        # (a and b are pgrep'd the way the slots themselves are locked).
        # #1354: `asleep=HH:MM-HH:MM asleepm=N [naps=N]` rides for 24 h after
        # a Studio-sleep window, so a dead board and a sleeping Mac tell
        # different stories. No window (or none recent) = field omitted.
        local nb=0 suf=""
        pgrep -f "opencode run.*THE FORGE( on slot a)?\\." >/dev/null && nb=$((nb + 1))
        pgrep -f "opencode run.*THE FORGE on slot b\\." >/dev/null && nb=$((nb + 1))
        [[ -n "$ASLEEP" ]] && suf=" $ASLEEP"
        echo "$(date +%H:%M) alive=$1 queue=$QUEUE building=$BUILDING shipped=$SHIPPED main=$MAIN qa=$QA_OPEN mini=$MINI gate=$GATE halted=$HALTED questions=$QWAIT builders=$nb/2$suf actions=$2"
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
    # #1354: a freshly-recorded outage is an action — the follow-up pulse
    # repeats it, and one `slept:1` in the log names the hours that went dark.
    [[ "${SREC:-}" == recorded=[1-9]* ]] && ACTIONS+=("slept:1")

    # ---- 2b. HYGIENE (#891): a `shipped` issue is done — close it ----------
    # FORGE.md adds `shipped` at merge but leaves the issue open (#616 sat
    # there for days). This is the backstop: whatever ships, the next tick
    # closes it. Targeted query, so it is immune to open-list paging.
    SHIPPED_OPEN=$(gh api "repos/$GH/issues?state=open&labels=shipped&per_page=100" \
        --jq '[.[] | select(.pull_request | not) | .number]' 2>/dev/null)
    SHIPPED_OPEN=${SHIPPED_OPEN:-[]}
    SHIPPED_N=0
    for n in $(print -r -- "$SHIPPED_OPEN" | jq -r '.[]'); do
        [[ -z "$n" || "$n" == "null" ]] && continue
        comment "$n" "WARDEN: this one shipped — closing it (the merged PR is the record)."
        act gh api -X PATCH "repos/$GH/issues/$n" -f state=closed -f state_reason=completed --silent
        SHIPPED_N=$((SHIPPED_N + 1))
    done
    (( SHIPPED_N > 0 )) && ACTIONS+=("closed-shipped:$SHIPPED_N")

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

    # ---- 4. BUILDER SLOTS (#1258: two builders on the Studio) ------------
    # Slot identity = "THE FORGE on slot a|b." in the session prompt (the QA
    # node trick). Slot a's pattern also matches pre-#1258 prompts, so a
    # session in flight across the deploy still owns its slot. Claim order
    # comes from scripts/lanes.mjs (pure core, pinned by lanecheck): games
    # first, then feedback — the whole queue, every lane. Work that waits for
    # a lane that is NOT idle (a half-built game `building`) outranks; a game
    # `stalled` waits for Jon. jalfern's `steer` (#605) ranks after a corpse
    # but before `next`. A question (waiting-jon/question) is never a work item.
    SLOTB_JOB=com.jalfern.forge-b
    VERDICT=""
    [[ -f "$LOG_DIR/studio-lanes.verdict" ]] && VERDICT=$(head -1 "$LOG_DIR/studio-lanes.verdict" 2>/dev/null)
    # Self-bootstrap the slot-b job from main: merging this code IS the install
    # step (no manual launchctl dance for the trial). A `revert` verdict from
    # the 48 h trial ends the slot until Jon removes the verdict file.
    if [[ "$HALTED" != yes && "$DRY" != 1 && "$VERDICT" != revert* ]] \
       && ! launchctl print "gui/$(id -u)/$SLOTB_JOB" >/dev/null 2>&1; then
        # Read the plist from origin/main, NOT from $REPO/scripts/: this whole
        # script runs via `git show origin/main:... | zsh -s`, and the main
        # checkout's working tree lags behind origin/main until someone checks
        # it out — an on-disk `-f` check would silently never fire, and the
        # slot would never install (caught at write time by the dry tick).
        if git -C "$REPO" show "origin/main:scripts/$SLOTB_JOB.plist" \
               > "$HOME/Library/LaunchAgents/$SLOTB_JOB.plist" 2>/dev/null; then
            if launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$SLOTB_JOB.plist" >> "$LOG" 2>&1; then
                log "installed $SLOTB_JOB (#1258 slot b)"
                ACTIONS+=("slotb-installed")
            else
                log "$SLOTB_JOB bootstrap failed"
                rm -f "$HOME/Library/LaunchAgents/$SLOTB_JOB.plist"
            fi
        else
            log "no $SLOTB_JOB.plist on origin/main (pre-#1258 main?)"
        fi
    fi
    B_LOADED=0
    [[ "$VERDICT" != revert* ]] && launchctl print "gui/$(id -u)/$SLOTB_JOB" >/dev/null 2>&1 && B_LOADED=1

    # A QA item running in the builder's slot (node builder) holds slot a; it
    # finishes first, the game builds on the next tick after it ends.
    if pgrep -f "opencode run.*QA MASTER on node builder\\." >/dev/null; then BSLOT_QA=1; else BSLOT_QA=0; fi
    A_IDLE=1; B_IDLE=0
    pgrep -f "opencode run.*THE FORGE( on slot a)?\\." >/dev/null && A_IDLE=0
    (( BSLOT_QA )) && A_IDLE=0
    if (( B_LOADED )); then
        B_IDLE=1
        pgrep -f "opencode run.*THE FORGE on slot b\\." >/dev/null && B_IDLE=0
    fi

    A_TARGET=""; B_TARGET=""; QA_STUDIO_QUEUE=0; QA_MINI_QUEUE=0; QA_MINI_FLAGSHIP=0; TARGET=""
    # #1290: is the studio QA lane able to take a queue item this tick? Idle
    # (no session), model answers on :8000, job installed. The planner gives
    # mini the queue only after builders AND studio have taken theirs — unless
    # studio can't run, in which case its share goes to mini.
    STUDIO_UP=0
    if ! pgrep -f "opencode run.*QA MASTER on node studio\\." >/dev/null 2>&1 \
       && curl -s -m 3 "http://127.0.0.1:8000/v1/models" >/dev/null 2>&1 \
       && launchctl print "gui/$(id -u)/com.jalfern.forge-qa-studio" >/dev/null 2>&1; then
        STUDIO_UP=1
    fi
    if [[ "$HALTED" != yes ]]; then
        PLAN=$(print -r -- "$ISSUES" | node "$REPO/scripts/lanes.mjs" \
              --free-a "$A_IDLE" --free-b "$B_IDLE" --b-loaded "$B_LOADED" --studio-up "$STUDIO_UP" 2>>"$LOG" | tail -9)
        if [[ -n "$PLAN" ]]; then
            eval "$PLAN"   # int/- values only; lanes.mjs guarantees
            [[ "${A_TARGET:-}" == "-" ]] && A_TARGET=""
            [[ "${B_TARGET:-}" == "-" ]] && B_TARGET=""
        else
            # planner missing/broken: keep the factory moving on the pre-#1258
            # inline ladder, slot a only (the fallback cannot name two targets).
            A_TARGET=$(print -r -- "$ISSUES" | jq -r --arg owner "$OWNER" '
                [.[] | select(any(.labels[]; .name == "stalled") | not)] as $ok
                | ([$ok[] | select(any(.labels[]; .name == "building"))]
                   + [$ok[] | select(any(.labels[]; .name == "steer")
                                      and .user.login == $owner
                                      and ((any(.labels[]; .name == "waiting-jon")
                                          or any(.labels[]; .name == "question")) | not))]
                   + [$ok[] | select(any(.labels[]; .name == "next"))]
                   + ([$ok[] | select(any(.labels[]; .name == "game-queue"))] | sort_by(.created_at)))
                | .[0].number // empty')
            log "lanes.mjs failed — legacy single-slot ladder: ${A_TARGET:-none}"
        fi
        TARGET=${A_TARGET:-}
        log "lane plan: ladder=${LADDER:-?} a=${A_TARGET:-none} b=${B_TARGET:-none} qb=$B_LOADED qsq=$QA_STUDIO_QUEUE qmq=$QA_MINI_QUEUE qmf=$QA_MINI_FLAGSHIP sup=$STUDIO_UP"
    fi

    kick_slot() {   # $1 = slot a|b, $2 = issue number, $3 = launchd job
        local s=$1 n=$2 job=$3
        [[ -z "$n" ]] && return 0
        # Three kicks with no FORGE: comment in between = the slot keeps dying
        # before it reports anything. Stop kicking; that is Jon's call. Any
        # non-WARDEN comment restarts the count (per-slot since #1258: two
        # slots, two counters — one slow slot must not stall the other's game).
        local KICKS
        KICKS=$(gh api "repos/$GH/issues/$n/comments?per_page=100" --jq '
            [.[] | .body] | (map(startswith("WARDEN") | not) | rindex(true)) as $last
            | .[(($last // -1) + 1):] | map(select(startswith("WARDEN: builder '"$s"' idle"))) | length' 2>/dev/null)
        KICKS=${KICKS:-0}
        if (( KICKS >= 3 )); then
            add_label "$n" stalled
            comment "$n" "WARDEN: kicked 3 times with no FORGE progress in between. Labeled stalled; Jon, please take a look."
            ACTIONS+=("stalled:$s"); log "#$n -> stalled (slot $s)"
        else
            [[ "$DRY" != 1 ]] && print -r -- "$n" > "$LOG_DIR/target-$s"
            act launchctl kickstart "gui/$(id -u)/$job" >> "$LOG" 2>&1
            comment "$n" "WARDEN: builder $s idle, kicked a session"
            ACTIONS+=("kicked:$s"); log "kicked builder $s for #$n"
            ALIVE=kicked
        fi
    }
    kick_slot a "${A_TARGET:-}" com.jalfern.forge
    kick_slot b "${B_TARGET:-}" "$SLOTB_JOB"

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
    #   mini    — any feedback item (that includes a checkpoint to resume), or
    #             the queue (#1290) when feedback is empty and items remain after
    #             builders and studio take theirs (QA_MINI_QUEUE from lanes.mjs),
    #             or a flagship gap (#1372) once feedback and queue are both dry
    #             for mini and studio did not take the gap (block below step 5)
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
    # #1258: the builder-slot QA spill is superseded while slot b is loaded —
    # a free second builder is worth more than a QA item, and the whole-queue
    # rule reaches feedback through slot b anyway. Reverting the trial restores
    # the spill (B_LOADED stays 0, nothing else to do).
    [[ "$ALIVE" == no && -z "$TARGET" && "$B_LOADED" == 0 ]] && LANES+=("builder 8000 UNCLAIMED 2 com.jalfern.forge-qa-builder")
    [[ "$HALTED" == yes ]] && LANES=()   # #605: halt freezes every lane, not just the builder
    # #1372: STUDIO_FLAGSHIPPED marks studio taking the flagship gap THIS tick —
    # the gap then does not survive to mini. Studio down, busy, or queue/feedback-
    # bound does NOT consume it (that is exactly when mini must step up).
    STUDIO_KICKED=0; MINI_KICKED=0; STUDIO_FLAGSHIPPED=0
    for spec in "${LANES[@]}"; do
        lane=(${=spec}); node=${lane[1]} port=${lane[2]} var=${lane[3]} need=${lane[4]} job=${lane[5]}
        have=${(P)var}
        curl -s -m 3 "http://127.0.0.1:$port/v1/models" >/dev/null 2>&1 || continue
        pgrep -f "opencode run.*QA MASTER on node $node\\." >/dev/null && continue
        # studio also earns a session for the QUEUE (#1258 whole queue): no
        # free feedback but more queued games than free builder slots — the
        # QA session takes the oldest one (FORGE-QA.md 2f), and qa-claim.sh's
        # unified namespace keeps it off any builder's game (#878).
        # #1290: mini earns the same right one step behind studio — the planner
        # already reserved studio's share, so both QA lanes can be in the queue
        # at once without aiming at the same item.
        (( have >= need )) || { [[ ( "$node" == studio && "$QA_STUDIO_QUEUE" == 1 ) || ( "$node" == mini && "$QA_MINI_QUEUE" == 1 ) ]] || continue; }
        launchctl print "gui/$(id -u)/$job" >/dev/null 2>&1 || continue
        act launchctl kickstart "gui/$(id -u)/$job" >> "$LOG" 2>&1
        [[ "$node" == studio ]] && STUDIO_KICKED=1
        [[ "$node" == mini ]] && MINI_KICKED=1
        ACTIONS+=("qa-kicked:$node"); log "kicked QA on $node ($have waiting)"
    done

    # #878 — a free Studio must not idle while a flagship gap is unowned. The
    # builder's flagship path (step 4b idle-kick) only runs when the builder is
    # FREE; with the builder busy on a queued title and no claimable feedback,
    # Studio idled for hours on Oct 23 while SSX's gaps sat unclaimed. So ask
    # idle-kick.mjs in `qa` mode (unowned flagship gap the QA lane may take,
    # skipping every game another lane is inside) and send Studio there. Only
    # when the builder is busy (4b owns the flagship otherwise) and not halted;
    # the builder and Studio can never be pointed at the same game (#878: one
    # lane per game, enforced in qaIdleStage).
    if [[ "$HALTED" != yes && "$ALIVE" == yes && "$QA_STUDIO_QUEUE" != 1 ]] && (( ! STUDIO_KICKED )); then
        pgrep -f "opencode run.*QA MASTER on node studio\\." >/dev/null \
            || ! curl -s -m 3 "http://127.0.0.1:8000/v1/models" >/dev/null 2>&1 \
            || ! launchctl print "gui/$(id -u)/com.jalfern.forge-qa-studio" >/dev/null 2>&1 \
            || { STAGE=$(node "$REPO/scripts/idle-kick.mjs" qa 2>>"$LOG" | tail -1)
                 if [[ "$STAGE" == KICK* ]]; then
                     act launchctl kickstart "gui/$(id -u)/com.jalfern.forge-qa-studio" >> "$LOG" 2>&1
                     comment "$PULSE" "WARDEN: feedback empty, ${STAGE#KICK } unowned — kicked Studio QA to the flagship gap (#878)"
                     ACTIONS+=("qa-flagship:studio"); log "kicked Studio QA to flagship ${STAGE#KICK }"
                     STUDIO_FLAGSHIPPED=1
                 fi; }
    fi

    # #1372 — the #878 flagship fallback reaches mini too: the planner says feedback
    # AND the queue leave mini nothing (QA_MINI_FLAGSHIP — the queue still outranks
    # the flagship stage, e-prime), and the gap survived studio's share: only a
    # studio that just took the flagship itself (STUDIO_FLAGSHIPPED) consumes it;
    # studio down, busy or queue/feedback-bound is exactly when mini steps up. The
    # builder-busy gate mirrors #878 (a free builder is 4b's flagship call), and
    # idle-kick.mjs qa mode is reused whole: one lane per game is enforced inside
    # it, a same-tick STAGE answer stays valid, and claim time owns collisions.
    if [[ "$HALTED" != yes && "$ALIVE" == yes && "$QA_MINI_FLAGSHIP" == 1 ]] \
        && (( ! MINI_KICKED )) && (( ! STUDIO_FLAGSHIPPED )); then
        pgrep -f "opencode run.*QA MASTER on node mini\\." >/dev/null \
            || ! curl -s -m 3 "http://127.0.0.1:18000/v1/models" >/dev/null 2>&1 \
            || ! launchctl print "gui/$(id -u)/com.jalfern.forge-qa" >/dev/null 2>&1 \
            || { [[ -n "${STAGE:-}" ]] || STAGE=$(node "$REPO/scripts/idle-kick.mjs" qa 2>>"$LOG" | tail -1)
                 if [[ "$STAGE" == KICK* ]]; then
                     act launchctl kickstart "gui/$(id -u)/com.jalfern.forge-qa" >> "$LOG" 2>&1
                     comment "$PULSE" "WARDEN: feedback and queue dry for mini, ${STAGE#KICK } unowned — kicked mini QA to the flagship gap (#1372)"
                     ACTIONS+=("qa-flagship:mini"); log "kicked mini QA to flagship ${STAGE#KICK }"
                 fi; }
    fi

    # ---- 5b. STUDIO LANES TRIAL (#1258) ---------------------------------
    # Clock + 48 h verdict. `tick` records the trial start the first time the
    # new fleet code runs on main, and at 48 h posts items/day before-vs-after
    # on #1258, writing keep/revert to /tmp/forge/studio-lanes.verdict — step 4
    # reads that verdict and stops kicking slot b on `revert`.
    if [[ "$HALTED" != yes && "$DRY" != 1 ]]; then
        TRI=$(node "$REPO/scripts/studiotrial.mjs" tick 2>>"$LOG" | tail -1)
        log "studiotrial: $TRI"
        [[ "$TRI" == reported* ]] && ACTIONS+=("trial:$(print -r -- "$TRI" | awk '{print $2}')")
    fi

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
