#!/bin/bash
# qa-claim.sh <issue> <node> "<plan>" — the ONLY way a QA session claims an item.
#
# Why a script: a session reads an issue once, at its start. On 2026-10-15 the
# MacBook read #270, spent 15 minutes thinking, then claimed it 16 minutes
# after the mini had — both lanes ended up on one branch. This checks the
# issue LIVE, at the moment of claiming, so a stale read cannot collide.
#
# exit 0 = the item is yours (claimed now, or already yours: resume it)
# exit 1 = another node holds a live claim, or one landed with yours: pick another item
# QA_CLAIM_DRY=1 reads everything and changes nothing.
set -euo pipefail
n=${1:-}; node=${2:-}; plan=${3:-}
repo=jalfern/retrogames
[ -n "$n" ] && [ -n "$node" ] || { echo "usage: qa-claim.sh <issue> <node> \"<plan>\""; exit 2; }

# newest live claim on the issue as "<node> <minutes since the newest LIVENESS comment>"
# (#1234) liveness = claimed/checkpoint only: bookkeeping notes ("claim dead",
# "yielding") must not extend the 90-min lockout on the very item they free.
holder() {
  ${GH:-gh} api --paginate "repos/$repo/issues/$n/comments?per_page=100" | jq -rs '
    (add // []) as $all
    | ([$all[] | select(.body | test("^QA \\([a-z0-9-]+\\): (claimed|checkpoint)"))] | last) as $q
    | ([$all[] | select(.body | test("^QA \\([a-z0-9-]+\\): claimed"))] | last) as $c
    | if $c == null then empty else
        "\($c.body | capture("^QA \\((?<n>[a-z0-9-]+)\\)").n) \(((now - ($q.created_at | fromdateiso8601)) / 60) | floor)"
      end'
}

who=""; age=0
read -r who age <<<"$(holder)" || true
if [ -n "$who" ] && [ "$who" != "$node" ] && [ "$age" -lt 90 ]; then
  echo "REFUSED: #$n is held by $who (newest QA comment ${age} min ago). Pick another item."
  exit 1
fi
if [ "$who" = "$node" ] && [ "$age" -lt 90 ]; then
  echo "#$n is already yours: resume it."
  exit 0
fi

note=""
[ -n "$who" ] && note=" (last claim was $who's; no claim/checkpoint for ${age} min)"
body="QA ($node): claimed $(date -u +%Y-%m-%dT%H:%MZ)$note — plan: $plan"
if [ -n "${QA_CLAIM_DRY:-}" ]; then echo "DRY: would label building-qa and post: $body"; exit 0; fi
${GH:-gh} api -X POST "repos/$repo/issues/$n/labels" -f 'labels[]=building-qa' >/dev/null
${GH:-gh} api "repos/$repo/issues/$n/comments" -f body="$body" >/dev/null

# a claim that landed with ours: the newest one wins, the other yields
sleep 5
read -r who _ <<<"$(holder)" || true
if [ "$who" != "$node" ]; then
  ${GH:-gh} api "repos/$repo/issues/$n/comments" -f body="QA ($node): yielding to $who" >/dev/null
  echo "YIELDED: $who claimed #$n at the same time. Pick another item."
  exit 1
fi
echo "CLAIMED #$n for $node."
