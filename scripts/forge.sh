#!/bin/zsh
# The FORGE driver — one session = one game. Invoked by launchd
# (com.jalfern.forge) or by hand: scripts/forge.sh
# Logs land in /tmp/forge/<timestamp>.log, newest symlinked at /tmp/forge/last.log

set -u
REPO="$HOME/Dev/retrogames"
LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/$STAMP.log"
ln -sf "$LOG" "$LOG_DIR/last.log"

# one forge session at a time
if pgrep -f "opencode run.*THE FORGE" >/dev/null; then
    echo "$(date): a forge session is already running, skipping" >> "$LOG"
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
# #1266: lane-scoped. This slot's profiles live under /tmp/forge/p<port>/ (the
# checks namespace by DEV_PORT), so a slot-a restart no longer kills slot b's
# LIVE browsers; the second sweep only ever hits legacy unsuffixed dirs, which
# nothing creates anymore. Never matches a normal Chrome.
pkill -u "$(id -u)" -f "user-data-dir=/tmp/forge/p5173/" 2>/dev/null || true
pkill -u "$(id -u)" -f "user-data-dir=/tmp/forge/[^/]*-profile" 2>/dev/null || true

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

PROMPT="You are THE FORGE. Open scripts/FORGE.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 3 hours."

# steer (#605): jalfern's `steer` label outranks `next` at the cycle boundary
# (warden step 4 already ranks it; this names it so the session claims it
# without re-deriving the order).
if [[ -f "$REPO/scripts/jonq.mjs" ]]; then
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
if [[ "${1:-}" == "--foreground" ]]; then
    echo "$(date): FOREGROUND session pid=$$ log=$LOG" >> "$LOG"
    /opt/homebrew/bin/opencode run "${MODEL_ARGS[@]}" --auto "$PROMPT" >> "$LOG" 2>&1
    STATUS=$?
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

nohup /opt/homebrew/bin/opencode run "${MODEL_ARGS[@]}" --auto "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
STATUS=0
echo "$(date): kicked forge session pid=$BG log=$LOG" >> "$LOG"

{
    echo "=== forge $STAMP exit=$STATUS ==="
    git -C "$REPO" log --oneline -1 origin/main 2>/dev/null
    gh issue list --repo jalfern/retrogames --label game-queue --json number,title --jq '.[] | "queued #\(.number) \(.title)"' 2>/dev/null
} >> "$LOG"

# prune to the newest 50 runs
ls -t "$LOG_DIR"/2*.log 2>/dev/null | tail -n +51 | xargs rm -f 2>/dev/null
exit $STATUS
