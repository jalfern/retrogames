#!/bin/bash
# #3013 — the merge path, in one command: AGENTS.md rule 5 verbatim
# (main-ok → wait on the required check `static` → squash-merge), plus the
# recovery that rule-5's inline form could not do. `gh pr merge --squash
# --delete-branch` merges server-side but dies on its local bookkeeping when a
# stale worktree squats on `main`, and then never deletes the remote branch
# (#2975 first bite, #3012 second). This wrapper:
#   preflight  names main-squatters and safely removes the clean ones
#   merge      the law's chain, unchanged semantics (static-only wait)
#   post-merge trusts PR *state* from GitHub, not gh's exit code, and completes
#            every cleanup step gh skipped; exits 0 only when the PR is MERGED,
#            exits non-zero (touching nothing) when nothing merged.
set -u
REPO=${REPO:-jalfern/retrogames}
export REPO
cd "$(git rev-parse --show-toplevel)"
branch=$(git branch --show-current)
if [[ -z "$branch" ]]; then
    echo "forge-merge: detached HEAD — run this from the PR branch's worktree" >&2
    exit 1
fi
if [[ "$branch" == main ]]; then
    # #3070: a half-finished merge can leave a lane parked on local `main`;
    # merging from there would chase the wrong PR. Re-detach first (post-merge
    # cleanup now prevents this state itself).
    echo "forge-merge: lane is on \`main\`, not a PR branch — run: git checkout --detach origin/main" >&2
    exit 1
fi
node scripts/lib/mergeclean.mjs reap   # advisory; a dirty squat is named, not destroyed
scripts/main-ok.sh || exit 1
# #3120 — an unknown state is NOT the end of the wait. `gh pr checks` exits
# non-zero while CI has not registered runs for the pushed head yet ("no checks
# reported on the branch"), and the old `while s=$(...)` read that as loop-over:
# the next statement merged seconds after a push, unverified. Unknown/empty now
# polls on; only `static` SUCCESS merges. A live check (PENDING/…) restarts the
# clock; if nothing ever reports inside MERGE_WAIT_TIMEOUT the merge is refused
# — silence never merges. (Knobs exist for mergecheck's sandbox; defaults are
# the old 20 s poll and a generous never-reported window.)
POLL=${MERGE_POLL:-20}
WAIT=${MERGE_WAIT_TIMEOUT:-900}
deadline=$(( $(date +%s) + WAIT ))
while :; do
    s=$(gh pr checks --json name,state --jq 'map(select(.name=="static"))[0].state' 2>/dev/null) || s=""
    case "$s" in
        SUCCESS) break ;;
        FAILURE|ERROR|TIMED_OUT|CANCELLED)
            echo "forge-merge: required check \`static\` is $s — not merging" >&2
            exit 1 ;;
        PENDING|IN_PROGRESS|QUEUED|WAITING|BLOCKED|REQUESTED)
            deadline=$(( $(date +%s) + WAIT )) ;;   # alive: the never-reported clock restarts
    esac
    if (( $(date +%s) >= deadline )); then
        echo "forge-merge: \`static\` never reported a state (last seen: ${s:-none}) — refusing to merge unverified (#3120)" >&2
        exit 1
    fi
    sleep "$POLL"
done
gh pr merge --squash --delete-branch
node scripts/lib/mergeclean.mjs post "$branch"
