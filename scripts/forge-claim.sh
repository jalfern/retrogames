#!/bin/bash
# forge-claim.sh <issue> <slot> "<plan>" — the ONLY way a builder session claims an issue.
#
# #1258: two builder slots plus QA lanes that can reach into the game queue
# mean a hand-written `FORGE: claimed` is no longer enough — the old way never
# checked against the OTHER builder slot or against QA-held items (#878 was
# enforced by reading the issue list at session start, which goes stale at
# exactly the moment a second stream exists). This mirrors qa-claim.sh: read
# the issue LIVE at claim time, one liveness namespace for every lane
# (`FORGE (<slot>):` and `QA (<node>):` claimed/checkpoint), newest claim wins
# a collision, the loser yields and picks another item.
#
# exit 0 = the item is yours (claimed now, or already yours: resume it)
# exit 1 = another lane holds a live claim, or one landed with yours: pick another item
# FORGE_CLAIM_DRY=1 reads everything and changes nothing.
set -euo pipefail
n=${1:-}; slot=${2:-}; plan=${3:-}
repo=jalfern/retrogames
[ -n "$n" ] && [ -n "$slot" ] || { echo "usage: forge-claim.sh <issue> <slot a|b> \"<plan>\""; exit 2; }

# newest live claim on the issue, either namespace, as "<lane-id> <minutes since
# the newest liveness comment>" — same liveness rule as qa-claim.sh (#1234):
# claimed|checkpoint only; bookkeeping notes must not extend the lockout.
holder() {
  ${GH:-gh} api --paginate "repos/$repo/issues/$n/comments?per_page=100" | jq -rs '
    (add // []) as $all
    | ([$all[] | select(.body | test("^(QA|FORGE) \\([a-z0-9-]+\\): (claimed|checkpoint)"))] | last) as $q
    | ([$all[] | select(.body | test("^(QA|FORGE) \\([a-z0-9-]+\\): claimed"))] | last) as $c
    | if $c == null then empty else
        "\($c.body | capture("^(QA|FORGE) \\((?<n>[a-z0-9-]+)\\)").n) \(((now - ($q.created_at | fromdateiso8601)) / 60) | floor)"
      end'
}

who=""; age=0
read -r who age <<<"$(holder)" || true
if [ -n "$who" ] && [ "$who" != "$slot" ] && [ "$age" -lt 90 ]; then
  echo "REFUSED: #$n is held by $who (newest claim/comment ${age} min ago). Pick another item."
  exit 1
fi
if [ "$who" = "$slot" ] && [ "$age" -lt 90 ]; then
  echo "#$n is already yours: resume it."
  exit 0
fi

note=""
[ -n "$who" ] && note=" (last claim was $who's; no claim/checkpoint for ${age} min)"
body="FORGE ($slot): claimed $(date -u +%Y-%m-%dT%H:%MZ)$note — plan: $plan"
if [ -n "${FORGE_CLAIM_DRY:-}" ]; then echo "DRY: would label building and post: $body"; exit 0; fi
${GH:-gh} api -X POST "repos/$repo/issues/$n/labels" -f 'labels[]=building' >/dev/null
# leave every queue/override/QA label behind — the item is being BUILT now
# (idempotent on GitHub; failures here are noise, the claim itself is the lock)
for l in game-queue next steer feedback building-qa; do
  ${GH:-gh} api -X DELETE "repos/$repo/issues/$n/labels/$l" --silent >/dev/null 2>&1 || true
done
${GH:-gh} api "repos/$repo/issues/$n/comments" -f body="$body" >/dev/null

# a claim that landed with ours: the newest one wins, the other yields
sleep 5
read -r who _ <<<"$(holder)" || true
if [ "$who" != "$slot" ]; then
  ${GH:-gh} api "repos/$repo/issues/$n/comments" -f body="FORGE ($slot): yielding to $who" >/dev/null
  echo "YIELDED: $who claimed #$n at the same time. Pick another item."
  exit 1
fi
echo "CLAIMED #$n for slot $slot."
