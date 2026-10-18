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

cd "$REPO" || exit 1

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
