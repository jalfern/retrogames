#!/bin/bash
# gh-shim — curl-backed stand-in for the gh CLI while this sandbox's macOS
# keychain is unreachable (Go's darwin verifier fails with OSStatus -26276).
# Covers the subcommands the forge scripts + shipping steps actually call.
# Canonical source: this tracked file. /tmp/forge/bin/gh is a copy of it;
# refresh the live copy after merging changes here (npm run shimcheck proves
# the guards offline — see scripts/shimcheck.mjs, #1676).
#
# #1676 hardening:
#  hole 1  PR-number resolution refuses a detached HEAD and asserts the
#          resolved PR's head.ref matches the branch — never a newest-open
#          fallthrough (observed: merged another lane's PR from a detached
#          worktree).
#  hole 3  `pr merge` takes a per-PR lock (/tmp/forge/merge-<n>.lock, 10-min
#          freshness) so a zombie merge loop that outlived its tool timeout
#          cannot race a second loop into the same merge.
#  vocab   `pr checks` reports gh's vocabulary (state=SUCCESS/FAILURE/…) —
#          raw API status made rule-5's `[ "$s" = SUCCESS ]` spin blind on a
#          green check (state=completed, conclusion=success), 2026-11-06.
#  run     `run list` without --workflow uses /actions/runs?branch=… (the
#          empty-workflow path 404'd, making red advisories untriageable).
#  flags   short flags -R/-l/-q/-t/-b/-c (#1842). Unknown flags are skipped
#          WITHOUT their value, so a dropped `-l halt` once turned
#          scripts/forge's halts() into "every open issue": `forge status`
#          read HALTED forever, `forge stop` never opened a halt, and
#          `forge start` would have closed every open issue.
set -u
PROXY="${GH_SHIM_PROXY-http://127.0.0.1:18229}"
API="${GH_SHIM_API-https://api.github.com}"
TOKEN="${GH_SHIM_TOKEN-$(sed -n 's/.*oauth_token: //p' "$HOME/.config/gh/hosts.yml" 2>/dev/null | head -1)}"
REPO_DEFAULT=jalfern/retrogames
LOCKDIR="${GH_SHIM_LOCKDIR-/tmp/forge}"
JQ=''
mkdir -p "$LOCKDIR" 2>/dev/null || true

# loopback API (shimcheck's stub server) must not be tunnelled through the proxy
case "$API" in
  *://127.0.0.1*|*://localhost*) PROXY='' ;;
esac

fail() { echo "gh: $1 (HTTP ${2:-})" >&2; exit 1; }

# api_call METHOD PATH [JSON_BODY] -> body on stdout; exit 1 on >=400
api_call() {
  m="$1"; p="$2"; body="${3:-}"
  tmp=$(mktemp); hdrs=$(mktemp)
  set -- -sS -m 60 -X "$m" -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28"
  if [ -n "$PROXY" ]; then set -- "$@" -x "$PROXY"; fi
  if [ -n "$body" ]; then set -- "$@" -H "Content-Type: application/json" --data "$body"; fi
  code=$(curl "$@" -o "$tmp" -D "$hdrs" -w '%{http_code}' "$API/$p") \
    || { rm -f "$tmp" "$hdrs"; echo "gh: proxy/curl failed for $p" >&2; exit 1; }
  out=$(cat "$tmp"); rm -f "$tmp" "$hdrs"
  case "$code" in 2*|3*) : ;; *) fail "$(printf '%s' "$out" | jq -r '.message // "request failed"' 2>/dev/null)" "$code" ;; esac
  printf '%s' "$out"
}

paginate() {
  m="$1"; p="$2"; url="$API/$p"; out='[]'
  while [ -n "$url" ]; do
    tmp=$(mktemp); hdrs=$(mktemp)
    args=(-sS -m 60 -X "$m" -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -o "$tmp" -D "$hdrs" -w '%{http_code}' "$url")
    if [ -n "$PROXY" ]; then args=(-x "$PROXY" "${args[@]}"); fi
    code=$(curl "${args[@]}") || { rm -f "$tmp" "$hdrs"; echo "gh: paginate failed" >&2; exit 1; }
    case "$code" in 2*) : ;; *) rm -f "$tmp" "$hdrs"; fail "request failed" "$code" ;; esac
    out=$(jq -s '.[0] + (.[1] // [])' <(printf '%s' "$out") "$tmp")
    url=$(tr ',' '\n' < "$hdrs" | grep 'rel="next"' | sed -E 's/.*<([^>]*)>.*/\1/' | head -1)
    rm -f "$tmp" "$hdrs"
  done
  printf '%s' "$out"
}

emit() { # emit JSON [jq] — like real gh, --jq is jq-r (raw strings) + trimmed
  if [ -n "$JQ" ]; then printf '%s' "$(printf '%s' "$1" | jq -r "$JQ")"; else printf '%s\n' "$1"; fi
}

pick() { # pick JSON FIELDS -> slim object
  sel=$(printf '%s' "$2" | tr ',' '\n' | awk '{printf "\"%s\": (.%s // null),", $1, $1}' | sed 's/,$//; s/^/{/; s/$/}/')
  printf '%s' "$1" | jq "$sel"
}

# resolve_pr NUM REPO ACTION — resolve an open PR for the current branch when
# NUM is empty. #1676 hole 1: refuse detached HEAD; treat an empty head-filter
# as "no PR"; never take .[0] of an unfiltered list.
resolve_pr() {
  num="$1"; repo="$2"; what="$3"
  if [ -n "$num" ]; then printf '%s' "$num"; return; fi
  br=$(git branch --show-current 2>/dev/null)
  if [ -z "$br" ]; then
    echo "gh: $what — detached HEAD, cannot resolve a PR from a branch; pass the PR number explicitly (#1676)" >&2
    exit 1
  fi
  res=$(api_call GET "repos/$repo/pulls?state=open&head=${repo%%/*}:${br}")
  num=$(printf '%s' "$res" | jq -r 'if type=="array" then (.[0].number // empty) else empty end' 2>/dev/null)
  if [ -z "$num" ]; then
    echo "gh: $what — no open PR for branch $br (#1676)" >&2
    exit 1
  fi
  printf '%s' "$num"
}

# check-state vocabulary: GitHub check-runs carry status+conclusion; real gh
# surfaces state=SUCCESS/FAILURE/… — rule-5 loops compare against that.
map_state() { # map_state CHECK_RUN_JSON
  printf '%s' "$1" | jq -r '. as $r
    | if $r.status == "completed" then (($r.conclusion // "unknown") | ascii_upcase)
      else ($r.status | ascii_upcase) end'
}

# accumulate -f k=v / -F k=v into JSON_ARGS (labels[] -> array append)
JSON_ARGS='{}'
add_field() { # add_field KEY VALUE RAW(0|1)
  if [ "$3" = 1 ]; then
    JSON_ARGS=$(printf '%s' "$JSON_ARGS" | jq --arg k "$1" --arg v "$2" '
      ($v | if .=="true" then true elif .=="false" then false
            elif test("^-?[0-9]+(\\.[0-9]+)?$") then tonumber else . end) as $vv
      | if ($k|endswith("[]")) then .[($k|sub("\\[\\]$";""))] += [$vv] else .[$k] = $vv end')
  else
    JSON_ARGS=$(printf '%s' "$JSON_ARGS" | jq --arg k "$1" --arg v "$2" \
      'if ($k|endswith("[]")) then .[($k|sub("\\[\\]$";""))] += [$v] else .[$k] = $v end')
  fi
}

cmd="${1:-}"; shift || true
case "$cmd" in
api)
  path=''; method=''; input=''; silent=0; pag=0
  while [ $# -gt 0 ]; do
    c="$1"
    if [ "$c" = "-X" ] || [ "$c" = "--method" ]; then method="$2"; shift 2
    elif [ "$c" = "--jq" ]; then JQ="$2"; shift 2
    elif [ "$c" = "--input" ]; then input="$2"; shift 2
    elif [ "$c" = "-f" ] || [ "$c" = "--field" ]; then add_field "${2%%=*}" "${2#*=}" 0; shift 2
    elif [ "$c" = "-F" ] || [ "$c" = "--raw-field" ]; then add_field "${2%%=*}" "${2#*=}" 1; shift 2
    elif [ "$c" = "--silent" ] || [ "$c" = "-q" ]; then silent=1; shift
    elif [ "$c" = "--paginate" ]; then pag=1; shift
    elif [ "$c" = "--hostname" ]; then shift 2
    elif [ "${c#-}" != "$c" ]; then shift
    else path="$c"; shift; fi
  done
  if [ -z "$method" ]; then
    if [ "$JSON_ARGS" != '{}' ] || [ -n "$input" ]; then method=POST; else method=GET; fi
  fi
  body=''
  if [ -n "$input" ]; then
    if [ "$input" = "-" ]; then body=$(cat); else body=$(cat "$input"); fi
  elif [ "$method" != GET ] && [ "$method" != DELETE ] && [ "$JSON_ARGS" != '{}' ]; then
    body="$JSON_ARGS"
  fi
  if [ "$pag" = 1 ] && [ "$method" = GET ]; then out=$(paginate GET "$path"); else out=$(api_call "$method" "$path" "$body"); fi
  if [ "$silent" = 1 ]; then exit 0; fi
  emit "$out"
  ;;
issue)
  sub="${1:-}"; shift || true
  repo="$REPO_DEFAULT"; N=''; BODY=''; BODYF=''; TITLE=''; JSONF=''; REASON=''
  STATE=''; ADDL=''; ADDL2=''; RML=''; COMMENT=''; LIMIT=100
  while [ $# -gt 0 ]; do
    c="$1"
    if [ "$c" = "--repo" ] || [ "$c" = "-R" ]; then repo="$2"; shift 2
    elif [ "$c" = "--jq" ] || [ "$c" = "-q" ]; then JQ="$2"; shift 2
    elif [ "$c" = "--state" ] || [ "$c" = "-s" ]; then STATE="$2"; shift 2
    elif [ "$c" = "--label" ] || [ "$c" = "-l" ]; then ADDL="$ADDL${ADDL:+,}$2"; shift 2
    elif [ "$c" = "--json" ]; then JSONF="$2"; shift 2
    elif [ "$c" = "--body" ] || [ "$c" = "-b" ]; then BODY="$2"; shift 2
    elif [ "$c" = "--body-file" ] || [ "$c" = "-F" ]; then BODYF="$2"; shift 2
    elif [ "$c" = "--title" ] || [ "$c" = "-t" ]; then TITLE="$2"; shift 2
    elif [ "$c" = "--comment" ] || [ "$c" = "-c" ]; then COMMENT="$2"; shift 2
    elif [ "$c" = "--limit" ] || [ "$c" = "-L" ]; then LIMIT="$2"; shift 2
    elif [ "$c" = "--reason" ] || [ "$c" = "-r" ]; then REASON="$2"; shift 2
    elif [ "$c" = "--add-label" ]; then ADDL2="$ADDL2${ADDL2:+ }$2"; shift 2
    elif [ "$c" = "--remove-label" ]; then RML="$RML${RML:+ }$2"; shift 2
    elif [ "${c#-}" != "$c" ]; then shift
    else if [ -z "$N" ]; then N="$c"; fi; shift; fi
  done
  if [ -n "$BODYF" ]; then BODY=$(cat "$BODYF"); fi
  case "$sub" in
  list)
    st="${STATE:-open}"; qs="state=$st&per_page=$LIMIT"
    if [ -n "$ADDL" ]; then qs="$qs&labels=$ADDL"; fi
    out=$(api_call GET "repos/$repo/issues?$qs" | jq '[.[] | select(has("pull_request") | not)]')
    if [ -n "$JSONF" ]; then
      : > "$LOCKDIR/.rows.$$"
      while IFS= read -r r; do printf '%s\n' "$(pick "$r" "$JSONF")" >> "$LOCKDIR/.rows.$$"; done < <(printf '%s' "$out" | jq -c '.[]')
      out=$(jq -s . "$LOCKDIR/.rows.$$"); rm -f "$LOCKDIR/.rows.$$"
    fi
    emit "$out"
    ;;
  view)
    out=$(api_call GET "repos/$repo/issues/$N")
    if [ -n "$JSONF" ]; then
      case "$JSONF" in
        *comments*) cs=$(api_call GET "repos/$repo/issues/$N/comments?per_page=100"); out=$(printf '%s' "$out" | jq --argjson c "$cs" '.comments = $c');;
      esac
      out=$(pick "$out" "$JSONF")
    fi
    emit "$out"
    ;;
  comment)
    api_call POST "repos/$repo/issues/$N/comments" "$(jq -n --arg b "$BODY" '{body:$b}')" >/dev/null
    echo "https://github.com/$repo/issues/$N#issuecomment"
    ;;
  edit)
    if [ -n "$TITLE" ]; then api_call PATCH "repos/$repo/issues/$N" "$(jq -n --arg t "$TITLE" '{title:$t}')" >/dev/null; fi
    if [ -n "$ADDL2" ]; then
      ljson=$(printf '%s\n' $ADDL2 | jq -R . | jq -s '{labels:.}')
      api_call POST "repos/$repo/issues/$N/labels" "$ljson" >/dev/null
    fi
    for l in $RML; do api_call DELETE "repos/$repo/issues/$N/labels/$l" >/dev/null 2>&1 || true; done
    ;;
  close)
    if [ -n "$COMMENT" ]; then api_call POST "repos/$repo/issues/$N/comments" "$(jq -n --arg b "$COMMENT" '{body:$b}')" >/dev/null; fi
    api_call PATCH "repos/$repo/issues/$N" "$(jq -n --arg r "${REASON:-completed}" '{state:"closed",state_reason:$r}')" >/dev/null
    ;;
  create)
    out=$(api_call POST "repos/$repo/issues" "$(jq -n --arg t "$TITLE" --arg b "$BODY" '{title:$t,body:$b}')")
    nnn=$(printf '%s' "$out" | jq -r .number)
    if [ -n "$ADDL" ]; then
      ljson=$(printf '%s\n' "$ADDL" | tr ',' '\n' | jq -R . | jq -s '{labels:.}')
      api_call POST "repos/$repo/issues/$nnn/labels" "$ljson" >/dev/null
    fi
    echo "https://github.com/$repo/issues/$nnn"
    ;;
  *) echo "gh-shim: unsupported issue subcommand '$sub'" >&2; exit 2;;
  esac
  ;;
pr)
  sub="${1:-}"; shift || true
  repo="$REPO_DEFAULT"; NUM=''; BODY=''; BODYF=''; TITLE=''; BASE=main; DRAFT=false; DEL=0; JSONF=''
  while [ $# -gt 0 ]; do
    c="$1"
    if [ "$c" = "--repo" ] || [ "$c" = "-R" ]; then repo="$2"; shift 2
    elif [ "$c" = "--jq" ] || [ "$c" = "-q" ]; then JQ="$2"; shift 2
    elif [ "$c" = "--base" ] || [ "$c" = "-B" ]; then BASE="$2"; shift 2
    elif [ "$c" = "--title" ] || [ "$c" = "-t" ]; then TITLE="$2"; shift 2
    elif [ "$c" = "--body" ] || [ "$c" = "-b" ]; then BODY="$2"; shift 2
    elif [ "$c" = "--body-file" ] || [ "$c" = "-F" ]; then BODYF="$2"; shift 2
    elif [ "$c" = "--delete-branch" ]; then DEL=1; shift
    elif [ "$c" = "--draft" ]; then DRAFT=true; shift
    elif [ "${c#-}" != "$c" ]; then shift
    else case "$c" in *[!0-9]*) shift ;; *) NUM="$c"; shift;; esac; fi
  done
  if [ -n "$BODYF" ]; then BODY=$(cat "$BODYF"); fi
  if [ "$sub" = create ]; then
    head=$(git branch --show-current)
    out=$(api_call POST "repos/$repo/pulls" "$(jq -n --arg t "$TITLE" --arg b "$BODY" --arg h "$head" --arg ba "$BASE" --argjson d "$DRAFT" '{title:$t,body:$b,head:$h,base:$ba,draft:$d}')")
    echo "https://github.com/$repo/pull/$(printf '%s' "$out" | jq -r .number)"
    exit 0
  fi
  NUM=$(resolve_pr "$NUM" "$repo" "pr $sub")
  # resolve_pr's exit only reaches this subshell — enforce it here too (#1676)
  [ -n "$NUM" ] || exit 1
  case "$sub" in
  checks)
    sha=$(api_call GET "repos/$repo/pulls/$NUM" | jq -r .head.sha)
    out=$(api_call GET "repos/$repo/commits/$sha/check-runs?per_page=100" \
      | jq '[.check_runs[] | {name: .name,
          state: (if .status == "completed" then ((.conclusion // "unknown") | ascii_upcase) else (.status | ascii_upcase) end),
          conclusion: (.conclusion // null), link: (.html_url // null)}]')
    if [ -n "$JSONF" ]; then out=$(printf '%s' "$out" | jq "[.[] | $(pick '{}' "$JSONF")]"); fi
    emit "$out"
    ;;
  merge)
    pr=$(api_call GET "repos/$repo/pulls/$NUM")
    # #1676 hole 1: never merge a PR that is not this branch's PR.
    ref=$(printf '%s' "$pr" | jq -r .head.ref)
    br=$(git branch --show-current 2>/dev/null)
    if [ -n "$br" ] && [ "$ref" != "$br" ]; then
      fail "refusing to merge #$NUM: it is on $ref, not the current branch $br"
    fi
    # #1676 hole 3: one merge loop per PR — mkdir is atomic; the lock is fresh
    # for 10 min (a loop older than that is a zombie; steal it).
    lock="$LOCKDIR/merge-$NUM.lock"
    mkdir -p "$LOCKDIR" 2>/dev/null || true
    if ! mkdir "$lock" 2>/dev/null; then
      if find "$lock" -maxdepth 0 -mmin +10 | grep -q .; then
        echo "gh: reclaiming stale merge lock for #$NUM" >&2
      else
        fail "another merge loop holds #$NUM (lock: $lock, pid $(cat "$lock/pid" 2>/dev/null))"
      fi
    fi
    trap 'rm -rf "$lock" 2>/dev/null || true' EXIT
    printf '%s\n' "$$" > "$lock/pid"
    sha=$(printf '%s' "$pr" | jq -r .head.sha)
    api_call PUT "repos/$repo/pulls/$NUM/merge" "$(jq -n --arg s "$sha" '{sha:$s,merge_method:"squash"}')" >/dev/null
    echo "✓ Squash merged $repo#$NUM"
    rm -rf "$lock"
    trap - EXIT
    if [ "$DEL" = 1 ]; then
      headrepo=$(printf '%s' "$pr" | jq -r '.head.repo.full_name')
      ref=$(printf '%s' "$pr" | jq -r .head.ref)
      api_call DELETE "repos/$headrepo/git/refs/heads/$ref" >/dev/null && echo "✓ Deleted branch $ref"
      git fetch --prune origin >/dev/null 2>&1 || true
      if [ "$(git branch --show-current)" = "$ref" ]; then git checkout --detach origin/main >/dev/null 2>&1; fi
    fi
    ;;
  comment)
    api_call POST "repos/$repo/issues/$NUM/comments" "$(jq -n --arg b "$BODY" '{body:$b}')" >/dev/null
    echo "https://github.com/$repo/issues/$NUM#issuecomment"
    ;;
  view)
    out=$(api_call GET "repos/$repo/pulls/$NUM")
    if [ -n "$JSONF" ]; then out=$(pick "$out" "$JSONF"); fi
    emit "$out"
    ;;
  ready)
    api_call PATCH "repos/$repo/pulls/$NUM" "$(jq -n '{draft:false}')" >/dev/null; echo "ready: $repo#$NUM"
    ;;
  *) echo "gh-shim: unsupported pr subcommand '$sub'" >&2; exit 2;;
  esac
  ;;
run)
  sub="${1:-}"; shift || true
  repo="$REPO_DEFAULT"; wf=''; br=''; st=''; lim=1
  while [ $# -gt 0 ]; do
    c="$1"
    if [ "$c" = "--repo" ]; then repo="$2"; shift 2
    elif [ "$c" = "--jq" ]; then JQ="$2"; shift 2
    elif [ "$c" = "--workflow" ]; then wf="$2"; shift 2
    elif [ "$c" = "--branch" ]; then br="$2"; shift 2
    elif [ "$c" = "--status" ]; then st="$2"; shift 2
    elif [ "$c" = "--limit" ]; then lim="$2"; shift 2
    elif [ "${c#-}" != "$c" ]; then shift
    else shift; fi
  done
  if [ -n "$wf" ]; then
    out=$(api_call GET "repos/$repo/actions/workflows/$wf/runs?branch=$br&status=$st&per_page=$lim")
  else
    # #1676: the empty-workflow path 404'd — red advisories were untriageable
    out=$(api_call GET "repos/$repo/actions/runs?branch=$br&status=$st&per_page=$lim")
  fi
  out=$(printf '%s' "$out" | jq --argjson l "$lim" '[.workflow_runs[:$l][] | {name: .name, status: .status, conclusion: .conclusion, url: .html_url}]')
  emit "$out"
  ;;
workflow)
  sub="${1:-}"; file="${2:-}"; shift 2 || true
  repo="$REPO_DEFAULT"; ref=''
  while [ $# -gt 0 ]; do
    c="$1"
    if [ "$c" = "--repo" ]; then repo="$2"; shift 2
    elif [ "$c" = "--ref" ]; then ref="$2"; shift 2
    elif [ "${c#-}" != "$c" ]; then shift
    else shift; fi
  done
  api_call POST "repos/$repo/actions/workflows/$file/dispatches" "$(jq -n --arg r "$ref" '{ref:$r}')" >/dev/null
  echo "✓ Workflow $file dispatched on $ref"
  ;;
auth)
  case "${1:-}" in
  token) echo "$TOKEN";;
  status) echo "github.com"; echo "  ✓ Logged in to github.com as jalfern (shim: token from hosts.yml; keychain unavailable in sandbox)";;
  *) echo "gh-shim: auth ${1:-} limited" >&2;;
  esac
  ;;
*) echo "gh-shim: unsupported command '$cmd'" >&2; exit 2;;
esac
