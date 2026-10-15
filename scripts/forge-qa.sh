#!/bin/zsh
# The QA MASTER driver — one session = one feedback item, lane parallel to
# the forge. One QA lane per MACHINE: the session always runs here on the
# Studio, and the machine named is where its model runs (through its tunnel).
#
#   forge-qa.sh [--foreground] [mini|mbp]      (default: mini)
#
#   mini — Mac mini, omlxmini via the :18000 tunnel  (launchd: com.jalfern.forge-qa)
#   mbp  — MacBook Pro, omlxmbp via the :18001 tunnel (launchd: com.jalfern.forge-qa-mbp,
#          started only by the warden, never on a timer)
#
# A lane's identity is its --model provider ("omlxmini/" or "omlxmbp/"), so
# "is this lane busy?" is a pgrep on that, and two lanes never block each
# other. The prompt names the node so the session tags its claims with it
# (FORGE-QA.md step 3) and only ever resumes its own.
#
# Logs: mini /tmp/forge/qa-<stamp>.log (newest: last-qa.log)
#       mbp  /tmp/forge/qa-mbp-<stamp>.log (newest: last-qa-mbp.log)

set -u
FG=0; NODE=mini
for a in "$@"; do
    case "$a" in
        --foreground) FG=1 ;;
        mini|mbp)     NODE=$a ;;
    esac
done

case "$NODE" in
    mini) MODEL="omlxmini/Qwen3.8-27B-oQ8e-mtp"; PORT=18000; TAG=""; EXTRA="" ;;
    mbp)  MODEL="omlxmbp/Qwen3.8-27B-oQ8e-mtp";  PORT=18001; TAG="mbp-"
          # The MBP is slow and the dev-server port (5173) is shared by every
          # lane, so it never drives a browser.
          EXTRA=" Node checks only: never run browser suites (*play scripts, npm run verify, shot.mjs); they share one dev-server port with the other lanes." ;;
esac

REPO="$HOME/Dev/retrogames"
LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/qa-$TAG$STAMP.log"
ln -sf "$LOG" "$LOG_DIR/last-qa${TAG:+-${TAG%-}}.log"

if pgrep -f "opencode run.*--model omlx$NODE/" >/dev/null; then
    echo "$(date): a QA session on $NODE is already running, skipping" >> "$LOG"
    exit 0
fi

cd "$REPO" || exit 1

# The QA brain never runs on the Studio's model: a second stream on the
# builder's model halves both. If this lane's machine is down, SKIP; the
# warden retries later.
if ! curl -s -m 3 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    echo "$(date): $NODE unreachable on :$PORT, skipping QA this run (no studio fallback)" >> "$LOG"
    exit 0
fi

PROMPT="You are THE QA MASTER on node $NODE. Open scripts/FORGE-QA.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 60 minutes.$EXTRA"

# launchd KILLS backgrounded children when the job's script exits (macOS
# process tracking) — an 08:00-2026-10-10 corpse proved it: every session so
# far was started by the warden (a live parent), never by launchd itself.
# So: launchd must run opencode IN THE FOREGROUND (--foreground); the warden
# calls this script plain and gets the old non-blocking behaviour.
if (( FG )); then
    echo "$(date): FOREGROUND $NODE session pid=$$ log=$LOG" >> "$LOG"
    /opt/homebrew/bin/opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1
    STATUS=$?
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

nohup /opt/homebrew/bin/opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
echo "$(date): kicked $NODE QA session pid=$BG log=$LOG" >> "$LOG"

ls -t "$LOG_DIR"/qa-${TAG}2*.log 2>/dev/null | tail -n +26 | xargs rm -f 2>/dev/null
exit 0
