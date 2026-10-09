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

PROMPT="You are THE FORGE. Open scripts/FORGE.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 3 hours."

/opt/homebrew/bin/opencode run "$PROMPT" >> "$LOG" 2>&1
STATUS=$?

{
    echo "=== forge $STAMP exit=$STATUS ==="
    git -C "$REPO" log --oneline -1 origin/main 2>/dev/null
    gh issue list --repo jalfern/retrogames --label game-queue --json number,title --jq '.[] | "queued #\(.number) \(.title)"' 2>/dev/null
} >> "$LOG"

# prune to the newest 50 runs
ls -t "$LOG_DIR"/2*.log 2>/dev/null | tail -n +51 | xargs rm -f 2>/dev/null
exit $STATUS
