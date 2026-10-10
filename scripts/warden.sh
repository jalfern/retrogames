#!/bin/zsh
# THE WARDEN driver — supervises the forge every 30 min via launchd
# (com.jalfern.warden). Never builds; triages, kicks a dead builder,
# writes the pulse line the /forge board displays.

set -u
REPO="$HOME/Dev/retrogames"
LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/warden-$STAMP.log"

# never two wardens; never while the forge is mid-claim of its own steps
if pgrep -f "opencode run --agent warden" >/dev/null; then
    echo "$(date): warden already running, skipping" >> "$LOG"
    exit 0
fi

cd "$REPO" || exit 1

PROMPT="You are THE WARDEN. Execute your agent prompt's tick procedure exactly, all five steps, then exit."

/opt/homebrew/bin/opencode run --agent warden --auto "$PROMPT" >> "$LOG" 2>&1

# prune old warden logs (keep 20)
ls -t "$LOG_DIR"/warden-2*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null
