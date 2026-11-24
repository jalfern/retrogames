#!/bin/bash
# #601 step 4: red main = merge freeze. Lanes call this before `gh pr merge`.
# Blocking signal: the latest completed Nightly run on main (the deterministic
# full suite with mutants). Browser nightlies (heist/play) are advisory — the
# law says flaky smoke must never wedge a merge — so they warn, they don't stop.
# Exit 0 = main clean (or never ran); exit 1 = main red, do not merge.

set -u
REPO=${REPO:-jalfern/retrogames}
latest() { gh run list --repo "$REPO" --workflow "$1" --branch main --status completed --limit 1 --json conclusion,url 2>/dev/null --jq '.[0] // empty'; }

nightly=$(latest nightly.yml)
if [[ -n "$nightly" ]]; then
    concl=$(echo "$nightly" | jq -r '.conclusion')
    url=$(echo "$nightly" | jq -r '.url')
    if [[ "$concl" == "failure" || "$concl" == "timed_out" ]]; then
        echo "MAIN RED: nightly is $concl — $url"
        echo "Fix main first (or wait for a green nightly); do not stack merges."
        exit 1
    fi
    echo "main ok: nightly $concl"
else
    echo "main ok: nightly has not run yet"
fi

heist=$(latest heist-nightly.yml)
if [[ -n "$heist" && "$(echo "$heist" | jq -r '.conclusion')" == "failure" ]]; then
    echo "WARN: heist nightly is red (advisory, not blocking): $(echo "$heist" | jq -r '.url')"
fi

# #3013 preflight: the law keeps `main` checked out nowhere. A stale worktree
# squatting on main makes gh's post-merge cleanup fatal and costs the remote
# branch delete. Advisory here (the merge itself can still land);
# scripts/forge-merge.sh reaps the clean ones automatically.
squats=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{p=substr($0,10)} /^branch refs\/heads\/main$/{print p}')
if [[ -n "$squats" ]]; then
    echo "WARN: \`main\` is checked out in stale worktree(s) — this kills gh's post-merge cleanup (#3013):"
    echo "$squats" | while IFS= read -r p; do
        [[ -z "$p" ]] && continue
        if [[ -n "$(git -C "$p" status --porcelain 2>/dev/null)" ]]; then
            echo "  $p (DIRTY — reap by hand once its lane commits/stashes)"
        else
            echo "  $p (clean — git worktree remove '$p')"
        fi
    done
fi
exit 0
