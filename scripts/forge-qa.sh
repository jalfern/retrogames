#!/bin/zsh
# The QA MASTER driver — one session = one feedback item, lane parallel to
# the forge. Every session runs here on the Studio; the node named is where
# its model runs.
#
#   forge-qa.sh [--foreground] [mini|mbp|studio|builder]      (default: mini)
#
#   mini    — Mac mini, omlxmini via the :18000 tunnel  (launchd: com.jalfern.forge-qa)
#   mbp     — MacBook Pro, omlxmbp via the :18001 tunnel (launchd: com.jalfern.forge-qa-mbp).
#             PARKED 2026-10-19: the warden no longer kicks it. Re-enable in warden.sh step 5.
#   studio  — the Studio's own model on :8000, a second stream beside the builder
#             (launchd: com.jalfern.forge-qa-studio, kicked by the warden)
#   builder — the Studio's model again, in the BUILDER's slot: the warden kicks it
#             only when no game is queued or building. A game that arrives waits
#             for this one item to finish, then builds (forge.sh and warden step 4
#             both skip while it runs). (launchd: com.jalfern.forge-qa-builder)
#
# A lane's identity is its node name in the prompt ("QA MASTER on node <node>."),
# so "is this lane busy?" is a pgrep on that, and lanes never block each other.
# (The model string no longer works for that: studio and builder share one.)
# Each lane gets its own dev-server port (DEV_PORT, read by every browser
# script) so two sessions never screenshot each other's server. 5173 stays
# the forge lane's.
#
# Logs: /tmp/forge/qa-<tag><stamp>.log (newest: last-qa.log, last-qa-<node>.log)

set -u
FG=0; NODE=mini
for a in "$@"; do
    case "$a" in
        --foreground) FG=1 ;;
        mini|mbp|studio|builder) NODE=$a ;;
    esac
done

REPO="$HOME/Dev/retrogames"
STUDIO_MODEL=$(jq -r '.model' "$REPO/opencode.json" 2>/dev/null)
EXTRA=""
case "$NODE" in
    mini)    MODEL="omlxmini/Qwen3.8-27B-oQ8e-mtp"; PORT=18000; TAG="";         DEV=5174 ;;
    mbp)     MODEL="omlxmbp/Qwen3.8-27B-oQ4e-mtp";  PORT=18001; TAG="mbp-";     DEV=5175
             # The MBP is slow, so it never drives a browser.
             EXTRA=" Node checks only: never run browser suites (*play scripts, npm run verify, shot.mjs). So pick only an item you can finish and verify with Node checks in one session; skip items that need screenshots or a browser, or touch many games, and leave those to the other nodes." ;;
    studio)  MODEL="$STUDIO_MODEL"; PORT=8000; TAG="studio-";  DEV=5176 ;;
    builder) MODEL="$STUDIO_MODEL"; PORT=8000; TAG="builder-"; DEV=5177
             EXTRA=" You are in the builder's slot because no game is queued: do this one item, then exit." ;;
esac
export DEV_PORT=$DEV
EXTRA="$EXTRA Your dev server port is $DEV: start yours with \`npm run dev -- --port $DEV --strictPort\` (DEV_PORT=$DEV is set; the browser scripts read it, and shot.mjs takes --url). Never use or stop the server on 5173 or any other lane's port."

LOG_DIR="/tmp/forge"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/qa-$TAG$STAMP.log"
ln -sf "$LOG" "$LOG_DIR/last-qa${TAG:+-${TAG%-}}.log"

if pgrep -f "opencode run.*QA MASTER on node $NODE\\." >/dev/null; then
    echo "$(date): a QA session on $NODE is already running, skipping" >> "$LOG"
    exit 0
fi

cd "$REPO" || exit 1

# #907 backstop: a killed session can orphan headless Chrome under launchd.
# Sweep only Forge's own profiles (/tmp/forge/), never a normal Chrome.
pkill -u "$(id -u)" -f "user-data-dir=/tmp/forge/" 2>/dev/null || true

# halt (#605): Jon froze the lanes — no QA node starts a new session either.
# (A session already running finishes its current step, reports, and exits;
# the warden refuses to kick while the label is open.)
if [[ -f "$REPO/scripts/jonq.mjs" ]] && [[ "$(node "$REPO/scripts/jonq.mjs" halt 2>/dev/null)" == yes ]]; then
    echo "$(date): halt label open — $NODE QA stays asleep until Jon lifts it" >> "$LOG"
    exit 0
fi

# If this lane's model server is down, SKIP; the warden retries later.
# (studio and builder deliberately share the builder's model: a second
# stream batches with the first, and a session spends much of its time in
# builds, browsers and CI rather than inference. Jon, 2026-10-19.)
if ! curl -s -m 3 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    echo "$(date): $NODE unreachable on :$PORT, skipping QA this run " >> "$LOG"
    exit 0
fi

PROMPT="You are THE QA MASTER on node $NODE. Open scripts/FORGE-QA.md and execute its session procedure exactly, end to end, without asking questions. AGENTS.md is the law. Time-box yourself to 60 minutes.$EXTRA"

# #601 red-main freeze: this lane refuses to ship fixes on top of a red trunk.
if [[ -x "$REPO/scripts/main-ok.sh" ]] && ! "$REPO/scripts/main-ok.sh" >/dev/null 2>&1; then
    echo "$(date): MAIN RED — nightly failed; $NODE QA session starts in fix-main mode" >> "$LOG"
    PROMPT="$PROMPT WARNING (#601 merge freeze): scripts/main-ok.sh says main is red. Fix main first (read the failing nightly run), do not merge anything until main is green."
fi

# launchd KILLS backgrounded children when the job's script exits (macOS
# process tracking) — an 08:00-2026-10-10 corpse proved it: every session so
# far was started by the warden (a live parent), never by launchd itself.
# So: launchd must run opencode IN THE FOREGROUND (--foreground); the warden
# calls this script plain and gets the old non-blocking behaviour.
#
# HARD CAP. "Time-box yourself to 60 minutes" is only a sentence: the model
# has no clock, and on 2026-10-14 an MBP session ran 2 h without pushing. So a
# plain watchdog stops the session at QA_CAP_MIN (default 75) minutes, and it
# SAVES FIRST, because the model cannot be trusted to have pushed: it finds
# this node's claimed item (its newest claim comment is "QA (<node>): claimed"),
# commits everything in that item's worktree, pushes the qa/ branch, posts
# "QA (<node>): checkpoint", and only then kills. The next session resumes the
# branch (FORGE-QA.md step 2), so a cap costs minutes, not the hour.
CAP_MIN=${QA_CAP_MIN:-75}
SLUG=jalfern/retrogames
save_checkpoint() {
    # WHICH worktree: the one this session's own log says it worked in. The
    # log records every file it read or edited by absolute path, and agents
    # name worktrees by slug (retrogames-qa-digdug), not by issue number, so
    # the path is the only reliable link (on 2026-10-15 a path-by-number lookup
    # found nothing, saved nothing, and the MBP redid #227 from scratch twice).
    local wt br n
    wt=$(grep -o "$HOME/Dev/retrogames-qa-[^/ \"']*" "$LOG" 2>/dev/null | tail -1)
    if [[ -z "$wt" || ! -d "$wt" ]]; then echo "$(date): no worktree in this session's log; nothing to save" >> "$LOG"; return; fi
    br=$(git -C "$wt" branch --show-current)
    [[ "$br" == qa/* ]] || { echo "$(date): $wt is on '$br', not a qa/ branch; not saving" >> "$LOG"; return; }
    git -C "$wt" add -A >/dev/null 2>&1
    git -C "$wt" commit -qm "QA ($NODE): WIP checkpoint at the ${CAP_MIN}-minute hard cap" >/dev/null 2>&1
    git -C "$wt" push -q -u origin HEAD >/dev/null 2>&1 || { echo "$(date): push of $br failed" >> "$LOG"; return; }
    echo "$(date): saved $wt to $br" >> "$LOG"
    # the checkpoint comment goes on this node's claimed item, when there is one
    for n in $(gh api "repos/$SLUG/issues?state=open&labels=building-qa&per_page=50" --jq '.[].number' 2>/dev/null); do
        gh api "repos/$SLUG/issues/$n/comments?per_page=100" \
            --jq '[.[] | select(.body | startswith("QA (")) | select(.body | contains("): claimed"))] | last | .body // ""' \
            2>/dev/null | grep -q "^QA ($NODE): claimed" || continue
        gh api "repos/$SLUG/issues/$n/comments" --silent -f body="QA ($NODE): checkpoint. The ${CAP_MIN}-minute hard cap stopped the session; its worktree is pushed to $br (unverified WIP). The next session resumes from it."
        break
    done
}
if (( FG )); then
    echo "$(date): FOREGROUND $NODE session pid=$$ log=$LOG cap=${CAP_MIN}m" >> "$LOG"
    /opt/homebrew/bin/opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1 &
    OC=$!
    ( sleep $(( CAP_MIN * 60 )); kill -0 $OC 2>/dev/null || exit 0
      echo "$(date): HARD CAP ${CAP_MIN}m: saving, then stopping the session" >> "$LOG"
      save_checkpoint; kill $OC ) &
    WD=$!
    wait $OC; STATUS=$?
    kill $WD 2>/dev/null
    echo "$(date): session exit=$STATUS" >> "$LOG"
    exit $STATUS
fi

nohup /opt/homebrew/bin/opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1 &
BG=$!
echo "$(date): kicked $NODE QA session pid=$BG log=$LOG" >> "$LOG"

ls -t "$LOG_DIR"/qa-${TAG}2*.log 2>/dev/null | tail -n +26 | xargs rm -f 2>/dev/null
exit 0
