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

PROMPT="You are THE QA MASTER. Open scripts/FORGE-QA.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 60 minutes."

nohup /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
echo "$(date): kicked QA session pid=$BG log=$LOG" >> "$LOG"

ls -t "$LOG_DIR"/qa-2*.log 2>/dev/null | tail -n +26 | xargs rm -f 2>/dev/null
exit 0
