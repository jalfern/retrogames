#!/bin/zsh
# #3013 — the merge path, in one command: AGENTS.md rule 5 verbatim
# (main-ok → wait on the required check `static` → squash-merge), plus the
# recovery that rule-5's inline form could not do. `gh pr merge --squash
# --delete-branch` merges server-side but dies on its local bookkeeping when a
# stale worktree squats on `main`, and then never deletes the remote branch
# (#2975 first bite, #3012 second). This wrapper:
#   preflight  names main-squatters and safely removes the clean ones
#   merge      the law's chain, unchanged semantics (static-only wait; #3269:
#              when the rollup stays silent the verdict is read from the
#              check-runs API at the head SHA instead)
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
# #3269 — how many polls of total silence (no `static` entry at all) before the
# check-runs fallback starts asking about the head SHA directly.
FALLBACK_AFTER=${MERGE_API_FALLBACK_AFTER:-2}
deadline=$(( $(date +%s) + WAIT ))
misses=0
api=""
while :; do
    # A missing `static` entry must read as NO ENTRY: `[][0].state` on an empty
    # rollup makes jq print the string "null", which is indistinguishable from a
    # state by `-z` alone (and a dropped pull_request event looks exactly like
    # that). `// ""` plus the normalize covers both jq and gojq.
    s=$(gh pr checks --json name,state --jq '(map(select(.name=="static"))[0].state) // ""' 2>/dev/null) || s=""
    [[ "$s" == "null" ]] && s=""
    case "$s" in
        SUCCESS) break ;;
        FAILURE|ERROR|TIMED_OUT|CANCELLED)
            echo "forge-merge: required check \`static\` is $s — not merging" >&2
            exit 1 ;;
        PENDING|IN_PROGRESS|QUEUED|WAITING|BLOCKED|REQUESTED)
            deadline=$(( $(date +%s) + WAIT )) ;;   # alive: the never-reported clock restarts
    esac
    # #3269 — GitHub can drop the `pull_request` event for a lane ref: slot b
    # lost ~30 min on 2026-11-25 because three PRs on two refs produced no run
    # object at all while `gh pr checks` answered nothing, yet a
    # `workflow_dispatch` at the SAME head SHA ran and passed `static`. Dispatch
    # check-runs never appear in `gh pr checks`/statusCheckRollup, so #3120's
    # law read that silence as "never reported" and froze — correctly refusing
    # to merge blind, but blind in both directions. After FALLBACK_AFTER silent
    # polls, ask the API for the check-runs at the PR's CURRENT head sha (never
    # a cached one). Only an explicit conclusion moves the merge; silence at
    # both levels still refuses, and the log names where the verdict came from.
    if [[ -z "$s" ]]; then
        misses=$(( misses + 1 ))
    else
        misses=0
    fi
    if (( misses >= FALLBACK_AFTER )); then
        head=$(gh pr view --json headRefOid --jq '.headRefOid' 2>/dev/null) || head=""
        api=""
        if [[ -n "$head" ]]; then
            api=$(gh api "repos/$REPO/commits/$head/check-runs" \
                --jq '[.check_runs[] | select(.name=="static")] | last | if . == null then "" else ((.conclusion // .status) | ascii_downcase) end' 2>/dev/null) || api=""
            [[ "$api" == "null" ]] && api=""
        fi
        case "$api" in
            success)
                echo "forge-merge: \`static\` SUCCESS via check-runs API at ${head:0:7} (#3269 fallback — the pull_request event never reached \`gh pr checks\`)"
                break ;;
            failure|timed_out|cancelled|action_required|startup_error|startup_failure|stale|neutral)
                echo "forge-merge: required check \`static\` is $api via check-runs API at ${head:0:7} (#3269 fallback) — not merging" >&2
                exit 1 ;;
            in_progress|queued|waiting|requested|pending)
                deadline=$(( $(date +%s) + WAIT )) ;;   # the API says CI is alive: restart the clock
        esac
    fi
    if (( $(date +%s) >= deadline )); then
        echo "forge-merge: \`static\` never reported a state (last seen: ${s:-none}${api:+, api: $api}) — refusing to merge unverified (#3120)" >&2
        exit 1
    fi
    sleep "$POLL"
done
gh pr merge --squash --delete-branch
node scripts/lib/mergeclean.mjs post "$branch"
