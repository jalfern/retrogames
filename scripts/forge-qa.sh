#!/bin/zsh
# The QA MASTER driver — one session = one feedback item, lane parallel to
# the forge. Invoked by launchd (com.jalfern.forge-qa) or by hand.
# Logs: /tmp/forge/qa-<timestamp>.log, newest symlinked at /tmp/forge/last-qa.log

set -u
REPO="$HOME/Dev/retrogames"
LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/qa-$STAMP.log"
ln -sf "$LOG" "$LOG_DIR/last-qa.log"

if pgrep -f "opencode run.*QA MASTER" >/dev/null; then
    echo "$(date): a QA session is already running, skipping" >> "$LOG"
    exit 0
fi

cd "$REPO" || exit 1

# The QA brain runs on the Mac mini (omlxmini) so it never fights the game
# builder for the studio GPU. If the tunnel/mini is down, fall back local.
MODEL="omlxmini/Qwen3.8-27B-oQ4e-mtp"
if ! curl -s -m 3 http://127.0.0.1:18000/v1/models >/dev/null 2>&1; then
    echo "$(date): mini unreachable, running QA on the local GPU instead" >> "$LOG"
    MODEL="omlx/Qwen3.8-Flash-Next-oQ5e-mtp"
fi

PROMPT="You are THE QA MASTER. Open scripts/FORGE-QA.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 60 minutes."

# launchd KILLS backgrounded children when the job's script exits (macOS
# process tracking) — an 08:00-2026-10-10 corpse proved it: every session so
# far was started by the warden (a live parent), never by launchd itself.
# So: launchd must run opencode IN THE FOREGROUND (--foreground); the warden
# calls this script plain and gets the old non-blocking behaviour.
if [[ "${1:-}" == "--foreground" ]]; then
    echo "$(date): FOREGROUND session pid=$$ log=$LOG" >> "$LOG"
    /opt/homebrew/bin/opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1
    STATUS=$?
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

nohup /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
echo "$(date): kicked QA session pid=$BG log=$LOG" >> "$LOG"

ls -t "$LOG_DIR"/qa-2*.log 2>/dev/null | tail -n +26 | xargs rm -f 2>/dev/null
exit 0
