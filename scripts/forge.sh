#!/bin/zsh
# The FORGE driver — one session = one game. Invoked by launchd
# (com.jalfern.forge / com.jalfern.forge-b) or by hand:
#   scripts/forge.sh [a|b] [--foreground]
# Logs land in /tmp/forge/<timestamp>.log (slot a, newest symlinked at
# last.log) and /tmp/forge/forge-b<timestamp>.log (slot b, newest at
# last-forge-b.log).
#
# #1258 — the Studio runs TWO builder slots on its model. A slot's identity
# lives in its prompt ("THE FORGE on slot a|b."), the same trick QA nodes use:
# locks, watch panes and `forge status` pgrep that, so slots never block each
# other. Slot a's lock also matches pre-#1258 prompts ("THE FORGE.") so a
# session in flight across the deploy still owns its slot.

set -u
SLOT=a
FG=0
for a in "$@"; do
    case "$a" in
        --foreground) FG=1 ;;
        a|b) SLOT=$a ;;
    esac
done

REPO="$HOME/Dev/retrogames"
LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
if [[ "$SLOT" == a ]]; then
    LOG="$LOG_DIR/$STAMP.log"
    ln -sf "$LOG" "$LOG_DIR/last.log"
    SLOT_PAT="THE FORGE( on slot a)?\\."
else
    LOG="$LOG_DIR/forge-b$STAMP.log"
    ln -sf "$LOG" "$LOG_DIR/last-forge-b.log"
    SLOT_PAT="THE FORGE on slot b\\."
    # slot b shares the model server with slot a; no model, no session.
    if ! curl -s -m 3 "http://127.0.0.1:8000/v1/models" >/dev/null 2>&1; then
        echo "$(date): studio model unreachable on :8000, slot b skipping" >> "$LOG"
        exit 0
    fi
fi

# one session per slot (the other slot may run beside it — #1258)
if pgrep -f "opencode run.*$SLOT_PAT" >/dev/null; then
    echo "$(date): a slot-$SLOT forge session is already running, skipping" >> "$LOG"
    exit 0
fi

# QA spilled into the builder's slot (forge-qa.sh builder): let that one item
# finish; the warden starts this build on its next tick after it ends.
if pgrep -f "opencode run.*QA MASTER on node builder\\." >/dev/null; then
    echo "$(date): the builder slot is finishing a QA item; the warden builds after it" >> "$LOG"
    exit 0
fi

cd "$REPO" || exit 1

# #907 backstop: a killed session can orphan headless Chrome under launchd.
# Sweep only Forge's own profiles (/tmp/forge/), never a normal Chrome.
# #1258: profiles are shared per-check-script across lanes, so sweeping while
# another builder slot is live would kill ITS browser — sweep only when every
# builder slot is idle (an orphan from the dead slot b then waits for slot a's
# next restart; honest small gap, noted in docs/HARNESS.md).
if [[ "$SLOT" == a ]] && ! pgrep -f "opencode run.*THE FORGE" >/dev/null; then
    pkill -u "$(id -u)" -f "user-data-dir=/tmp/forge/" 2>/dev/null || true
fi

# halt (#605): a `halt` label on any open issue is Jon freezing the factory.
# The warden already refuses to kick; this catches launchd's own timer and any
# hand-start, so a frozen factory cannot start a new session by any door.
if [[ -f "$REPO/scripts/jonq.mjs" ]] && [[ "$(node "$REPO/scripts/jonq.mjs" halt 2>/dev/null)" == yes ]]; then
    echo "$(date): halt label open — the forge stays asleep until Jon lifts it" >> "$LOG"
    exit 0
fi

# TAP (scripts/tap.mjs, launchd com.jalfern.tap-builder): when the tap answers
# AND an `omlxtap` provider exists in ~/.config/opencode/opencode.json, route
# this session through it so `watch.sh --live` shows tokens as they generate.
# Fail-open: no tap, or no provider -> the session talks to oMLX directly, as
# before. (The model string still contains no lane pattern: see watch.sh.)
MODEL_ARGS=()
# (Any HTTP answer counts, even a 401 from oMLX's key check; 000 = tap down,
# 502 = tap up but oMLX behind it down.)
TAP_CODE=$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://127.0.0.1:8010/v1/models)
if [[ "$TAP_CODE" != 000 && "$TAP_CODE" != 502 ]] \
   && jq -e '.provider.omlxtap' "$HOME/.config/opencode/opencode.json" >/dev/null 2>&1; then
    M=$(jq -r '.model' "$REPO/opencode.json")
    MODEL_ARGS=(--model "omlxtap/${M#*/}")
fi
echo "$(date): model route: ${MODEL_ARGS[*]:-direct (no tap)}" >> "$LOG"

PROMPT="You are THE FORGE on slot $SLOT. Open scripts/FORGE.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 3 hours."
# #1258: the slot names its port and its claim script — the playbook's ladder
# stays the same, only claim mechanics and the dev server differ per slot.
if [[ "$SLOT" == a ]]; then DEV_PORT_B=5173; else DEV_PORT_B=5178; fi
export DEV_PORT=$DEV_PORT_B
PROMPT="$PROMPT Slot notes (#1258): claim with scripts/forge-claim.sh <n> $SLOT \"<plan>\"; your dev server port is $DEV_PORT_B — start yours with \`npm run dev -- --port $DEV_PORT_B --strictPort\` (DEV_PORT is exported; browser scripts read it). Never use or stop another lane's port."

# target (#1258): the warden writes its assignment to /tmp/forge/target-<slot>
# right before kickstart; fresh (<20 min) means it belongs to THIS fire. A
# session takes it FIRST but still via forge-claim.sh — a stale assignment
# (another lane claimed it since) is refused there and the ladder takes over.
TARGET=""
tf="$LOG_DIR/target-$SLOT"
if [[ -n "$(find "$tf" -maxdepth 0 -mmin -20 2>/dev/null)" ]]; then
    TARGET=$(head -1 "$tf" 2>/dev/null | tr -dc '0-9')
    rm -f "$tf"   # consumed — the next needed kick rewrites it
fi
if [[ -n "$TARGET" ]]; then
    echo "$(date): warden target #$TARGET for slot $SLOT" >> "$LOG"
    PROMPT="$PROMPT TARGET (#1258): the warden assigned issue #$TARGET to your slot — at the claim step take it first with scripts/forge-claim.sh $TARGET $SLOT; if that is REFUSED, run the normal ladder."
fi

# steer (#605): jalfern's `steer` label outranks `next` at the cycle boundary
# (warden step 4 already ranks it; this names it so the session claims it
# without re-deriving the order).
if [[ -z "$TARGET" ]] && [[ -f "$REPO/scripts/jonq.mjs" ]]; then
    STEER=$(node "$REPO/scripts/jonq.mjs" steer 2>/dev/null)
    if [[ -n "$STEER" ]]; then
        echo "$(date): steer $STEER — taking it ahead of the queue this session" >> "$LOG"
        PROMPT="$PROMPT STEER (#605): issue $STEER carries jalfern's steer label — at the claim step take it ahead of the normal queue order."
    fi
fi

# #601 red-main freeze: if the latest nightly on main failed, this lane opens
# by fixing main instead of shipping on top of a red trunk.
if [[ -x "$REPO/scripts/main-ok.sh" ]] && ! "$REPO/scripts/main-ok.sh" >/dev/null 2>&1; then
    echo "$(date): MAIN RED — nightly failed; session starts in fix-main mode" >> "$LOG"
    PROMPT="$PROMPT WARNING (#601 merge freeze): scripts/main-ok.sh says main is red. Fix main first (read the failing nightly run), do not merge anything until main is green."
fi

# --auto: headless runs cannot answer permission prompts (an auto-reject
# silently killed session #2 mid-build). opencode.json carries the guard
# rails (no force-push, no push to main, no ~/.ssh) around the autonomy.
# Background the session so callers (launchd, the warden) never block on a
# 3-hour build; the session's own lock dedupes the next fire.
# launchd KILLS backgrounded children when the job's script exits (macOS
# process tracking) — an 08:00-2026-10-10 corpse proved it: every session so
# far was started by the warden (a live parent), never by launchd itself.
# So: launchd must run opencode IN THE FOREGROUND (--foreground); the warden
# calls this script plain and gets the old non-blocking behaviour.
if (( FG )); then
    echo "$(date): FOREGROUND session pid=$$ log=$LOG slot=$SLOT" >> "$LOG"
    /opt/homebrew/bin/opencode run "${MODEL_ARGS[@]}" --auto "$PROMPT" >> "$LOG" 2>&1
    STATUS=$?
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

nohup /opt/homebrew/bin/opencode run "${MODEL_ARGS[@]}" --auto "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
STATUS=0
echo "$(date): kicked forge session pid=$BG log=$LOG slot=$SLOT" >> "$LOG"

{
    echo "=== forge $STAMP exit=$STATUS ==="
    git -C "$REPO" log --oneline -1 origin/main 2>/dev/null
    gh issue list --repo jalfern/retrogames --label game-queue --json number,title --jq '.[] | "queued #\(.number) \(.title)"' 2>/dev/null
} >> "$LOG"

# prune to the newest 50 runs (both slots)
ls -t "$LOG_DIR"/2*.log 2>/dev/null | tail -n +51 | xargs rm -f 2>/dev/null
ls -t "$LOG_DIR"/forge-b2*.log 2>/dev/null | tail -n +51 | xargs rm -f 2>/dev/null
exit $STATUS
