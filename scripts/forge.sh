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

# Hard 3.5 h limit (issue #180): gtimeout if coreutils is installed, else a
# pure-shell watchdog that dies with the session and kills it at the deadline.
# The sentinel must never kill a builder mid-tool (a 40-min heistmutate is
# healthy), so a HUNG tool call gets no sentinel save — this cap is its
# backstop.
LIMIT=12600   # 3.5 h

# wait_limit <pid>: poll until the session dies or LIMIT; kill at the deadline.
wait_limit() {
    local pid=$1 secs=0
    while (( secs < LIMIT )) && kill -0 "$pid" 2>/dev/null; do
        sleep 30
        secs=$((secs + 30))
    done
    if kill -0 "$pid" 2>/dev/null; then
        echo "$(date): 3.5 h limit reached, killing pid $pid" >> "$LOG"
        kill "$pid" 2>/dev/null
    fi
}

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
    if command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$LIMIT" /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1
        STATUS=$?
    else
        /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1 &
        BG=$!
        wait_limit "$BG"
        wait "$BG" 2>/dev/null
        STATUS=$?
    fi
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

if command -v gtimeout >/dev/null 2>&1; then
    nohup gtimeout "$LIMIT" /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1 &
    BG=$!
    CAP="gtimeout ${LIMIT}s"
else
    nohup /opt/homebrew/bin/opencode run --auto "$PROMPT" >> "$LOG" 2>&1 &
    BG=$!
    # The watchdog reparents when this script exits and polls until the
    # session dies (or the deadline). It is a zsh subshell, so the session
    # locks (pgrep on the opencode argv) never see it.
    ( wait_limit "$BG" ) &
    CAP="watchdog ${LIMIT}s"
fi
STATUS=0
echo "$(date): kicked forge session pid=$BG ($CAP) log=$LOG" >> "$LOG"

{
    echo "=== forge $STAMP exit=$STATUS ==="
    git -C "$REPO" log --oneline -1 origin/main 2>/dev/null
    gh issue list --repo jalfern/retrogames --label game-queue --json number,title --jq '.[] | "queued #\(.number) \(.title)"' 2>/dev/null
} >> "$LOG"

# prune to the newest 50 runs
ls -t "$LOG_DIR"/2*.log 2>/dev/null | tail -n +51 | xargs rm -f 2>/dev/null
exit $STATUS
