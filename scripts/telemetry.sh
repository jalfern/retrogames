#!/bin/zsh
# THE PULSE-O-METER — samples what the fleet is physically doing and pushes
# telemetry.json + board.json to the separate jalfern/forge-telemetry repo
# (Contents API, no checkout, no tokens spent on a model). NOT a branch of
# retrogames: Vercel builds every push to every retrogames branch, and two
# commits per 5-min run meant ~576 full app builds a day, which burned the
# build quota and tripped GitHub's secondary rate limit (2026-10-11). The /forge board draws sparklines from it via
# raw.githubusercontent (CDN — does not count against the API rate limit).
# launchd: com.jalfern.telemetry, every 5 minutes.

set -u
LOCAL="/tmp/forge/telemetry.jsonl"
mkdir -p /tmp/forge

t() { pgrep -f "$1" | head -1; }
task() {
    local pid
    pid=$(t "$1")
    if [[ -n "$pid" ]]; then
        # %cpu is of one core (can exceed 100); rss in MB
        ps -p "$pid" -o %cpu=,rss= | awk -v n="$2" '{printf "\"%s\":{\"cpu\":%.0f,\"rss\":%.0f}", n, $1, $2/1024}'
    else
        printf '"%s":null' "$2"
    fi
}
act() {
    # one python block: strips ANSI (BSD sed has no \x1b), keeps the last 3
    # meaningful lines, emits valid JSON. No shell quoting in the path.
    python3 - "$1" <<'PYA'
import json, re, sys
try:
    raw = open(sys.argv[1], errors='ignore').read()[-8000:]
except OSError:
    print('""'); raise SystemExit
lines = [l[:80] for l in raw.splitlines()
         if re.match(r'^(\u2192|\u2699|\$|\s{2}(FAIL|PASS))', re.sub(r'\x1b\[[0-9;]*m', '', l))]
print(json.dumps('\n'.join(lines[-3:])))
PYA
}

# the builder's own working tree = its live progress: branch + last commit
B=$(git -C /Users/jon/Dev/retrogames branch --show-current 2>/dev/null)
C=$(git -C /Users/jon/Dev/retrogames log -1 --format=%s 2>/dev/null)
COMMIT=""
[[ -n "$B" && "$B" != main ]] && COMMIT="${B}: ${C:0:70}"

LOAD=$(sysctl -n vm.loadavg | awk '{print $2}')
FREE=$(memory_pressure -Q 2>/dev/null | grep -o '[0-9]*%' | head -1 | tr -d '%')

# The two QA boxes answer over ssh (mini: launchd com.jalfern.tunnel -> sfm5mini;
# MBP: com.jalfern.tunnel-mbp -> tailscale peer, asleep-laptop => zeros, the board
# shows flat). The remote returns two plain numbers (cpu%, omlx-server rss MB) —
# no JSON survives more than one shell boundary. NO `read` anywhere: this script is
# piped to zsh -s by launchd, and read would eat the rest of the script as stdin
# (that silent death cost the board 14 h of vitals, 2026-10-11). And ssh is nailed
# shut: ssh inherits the script's stdin, so the remote shell swallows every command
# that comes after it unless its stdin is closed.
remote_vitals() {   # $1 = ssh target -> "cpu rss", zeros when unreachable
    local out c r
    out=$(ssh -n -o ConnectTimeout=2 -o BatchMode=yes "$1" \
'p=$(pgrep -f omlx-server | head -1); c=$(ps -A -o %cpu= | awk "{s+=\$1} END {printf \"%.0f\", s}"); r=0; [ -n "$p" ] && r=$(ps -p $p -o rss= | awk "{print int(\$1/1024)}"); echo $c $r' \
2>/dev/null </dev/null)
    c=${out%% *}; r=${out##* }
    case "$c" in (''|*[!0-9]*) c=0;; esac
    case "$r" in (''|*[!0-9]*) r=0;; esac
    echo "$c $r"
}
set -- $(remote_vitals sfm5mini);            MC=$1; MR=$2
set -- $(remote_vitals jon@100.116.224.56); BC=$1; BR=$2

# Three panes, same names as the home terminal: Builder / QA·Mini / QA·MBP.
# The studio's own oMLX server and the warden are plumbing, not lanes — they
# used to be series here and only confused the board.
S="{\"t\":\"$(date +%H:%M:%S)\",\"ts\":$(date +%s),\"load\":$LOAD,\"free\":${FREE:-0},\
\"tasks\":{$(task 'opencode run.*THE FORGE' builder),\
\"mini\":{\"cpu\":$MC,\"rss\":$MR},\"mbp\":{\"cpu\":$BC,\"rss\":$BR}},\
\"commit\":$(printf '%s' "$COMMIT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"act\":{\"builder\":$(act "$(readlink /tmp/forge/last.log)"),\"qa\":$(act "$(readlink /tmp/forge/last-qa.log)"),\"mbp\":$(act "$(readlink /tmp/forge/last-qa-mbp.log)")}}"

python3 - "$LOCAL" "$S" <<'PYS'
import os, sys
path, sample = sys.argv[1], sys.argv[2]
try:
    lines = open(path).read().splitlines()
except FileNotFoundError:
    lines = []
if sample.startswith('{'):
    lines.append(sample)
lines = lines[-288:]   # 24 h at 5 min
with open(path + '.tmp', 'w') as f:
    f.write('\n'.join(lines) + '\n')
os.replace(path + '.tmp', path)   # atomic: readers never see a torn line
PYS

python3 - "$S" <<'PY'
import json, re, subprocess, sys, base64
sample = json.loads(sys.argv[1])
try:
    lines = open('/tmp/forge/telemetry.jsonl').read().splitlines()[-288:]
except FileNotFoundError:
    lines = [sys.argv[1]]
data = base64.b64encode('\n'.join(lines).encode()).decode()
OUT = 'repos/jalfern/forge-telemetry'
args = ['gh', 'api', '-X', 'PUT', f'{OUT}/contents/telemetry.json',
        '--input', '-']
body = {'message': 'pulse', 'content': data, 'branch': 'main'}
sha = subprocess.run(['gh', 'api', f'{OUT}/contents/telemetry.json?ref=main',
                      '--jq', '.sha'], capture_output=True, text=True)
# gh prints the 404 JSON BODY to stdout on a miss, so 'gh:' never prefixes
# one — trust nothing but a bare hex sha, or the PUT is rejected silently.
if sha.returncode == 0 and re.fullmatch(r'[0-9a-f]{40}', sha.stdout.strip()):
    body['sha'] = sha.stdout.strip()
r = subprocess.run(args, input=json.dumps(body), text=True, capture_output=True)
if r.returncode != 0:
    print('telemetry push failed:', r.stderr[:200])
PY

# runway (#1201) — "N days of queued work left" per lane, attached to
# board.json below. Materialise script + lib from origin/main into /tmp first
# (the stdin `node -` pattern cannot work here: a stdin module resolves
# relative imports against the launchd CWD, and './lib/runway.mjs' would
# resolve against /). A failed run leaves the previous runway.json in place,
# so the board keeps the last known runway instead of a hole.
git -C /Users/jon/Dev/retrogames fetch -q origin main 2>/dev/null || true
mkdir -p /tmp/forge/lib
git -C /Users/jon/Dev/retrogames show origin/main:scripts/lib/runway.mjs > /tmp/forge/lib/runway.mjs \
    && git -C /Users/jon/Dev/retrogames show origin/main:scripts/runway.mjs > /tmp/forge/runway-run.mjs \
    && node /tmp/forge/runway-run.mjs --out /tmp/forge/runway.json >/dev/null \
    || echo 'runway failed'

# board.json — the board's ONE file. The browser used to hit api.github.com
# directly (~6 fetches per reload) and shared-IP rate limits took the board
# OFFLINE while the machine underneath was healthy. Everything the board
# renders now rides the same CDN pipe as telemetry.json; the browser makes
# ONE anonymous raw fetch, which that limit cannot starve the same way.
python3 - <<'PYB'
import json, re, subprocess, base64

def gh(path):
    r = subprocess.run(['gh', 'api', path, '--jq', '.'], capture_output=True, text=True)
    if r.returncode != 0:
        print('board fetch failed:', path, r.stderr[:150])
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None

R = 'repos/jalfern/retrogames'          # where the issues and PRs live (read)
OUT = 'repos/jalfern/forge-telemetry'  # where board.json is written
try:
    lines = open('/tmp/forge/telemetry.jsonl').read().splitlines()[-48:]
    samples = [json.loads(l) for l in lines if l.startswith('{')]
except Exception:
    samples = []

def issue(i):
    return {'number': i['number'], 'title': i['title'], 'state': i['state'],
            'body': (i.get('body') or '').split('\n')[0][:300],
            'labels': [{'name': l['name']} for l in i.get('labels', [])],
            'html_url': i['html_url'],
            'reactions': {'total_count': i.get('reactions', {}).get('total_count', 0)}}

open_issues = gh(f'{R}/issues?state=open&per_page=100') or []
shipped = gh(f'{R}/issues?state=all&labels=shipped&per_page=100') or []
by = {}
for i in open_issues + shipped:
    if not i.get('pull_request'):
        by[i['number']] = issue(i)

prs = [{'number': p['number'], 'title': p['title'], 'html_url': p['html_url'],
        'created_at': p.get('created_at')}
       for p in (gh(f'{R}/pulls?state=open&per_page=10') or [])]

def comments(n, per):
    # The per-issue comments endpoint IGNORES sort/direction and is always
    # oldest-first, so `?per_page=6&sort=created&direction=desc` returned the
    # thread's first six comments forever (the WARDEN card stuck on Oct 10).
    # Read the LAST page, plus the one before if it is short; newest first.
    if not n:
        return []
    total = (gh(f'{R}/issues/{n}') or {}).get('comments', 0)
    page = max(1, -(-total // 100))
    cs = gh(f'{R}/issues/{n}/comments?per_page=100&page={page}') or []
    if len(cs) < per and page > 1:
        cs = (gh(f'{R}/issues/{n}/comments?per_page=100&page={page - 1}') or []) + cs
    cs = cs[-per:][::-1]
    return [{'id': c['id'], 'body': c['body'].split('\n')[0][:200],
             'created_at': c['created_at'], 'updated_at': c['updated_at']} for c in (cs or [])]

pulse_num = next((i['number'] for i in open_issues if i['title'] == 'FORGE PULSE'), None)
build_num = next((i['number'] for i in open_issues
                  if any(l['name'] == 'building' for l in i.get('labels', []))), None)

board = {'generated': subprocess.run(['date', '-u', '+%Y-%m-%dT%H:%M:%SZ'],
                                     capture_output=True, text=True).stdout.strip(),
         'samples': samples, 'issues': list(by.values()), 'prs': prs,
         'pulses': comments(pulse_num, 6), 'feed': comments(build_num, 8)}

# #1201 — the runway line ("Builder: ~2.5 days queued · QA: ~0.5 day").
# Missing/stale file just means the board hides the strip (or dims it via the
# generated timestamp inside).
try:
    with open('/tmp/forge/runway.json') as f:
        board['runway'] = json.load(f)
except Exception:
    pass

data = base64.b64encode(json.dumps(board).encode()).decode()
body = {'message': 'board', 'content': data, 'branch': 'main'}
sha = subprocess.run(['gh', 'api', f'{OUT}/contents/board.json?ref=main',
                      '--jq', '.sha'], capture_output=True, text=True)
# gh prints the 404 JSON BODY to stdout, so 'gh:' never prefixes a miss —
# the first create silently poisoned body['sha'] and the PUT was rejected
# while the script exited 0. Trust nothing but a bare hex sha.
if sha.returncode == 0 and re.fullmatch(r'[0-9a-f]{40}', sha.stdout.strip()):
    body['sha'] = sha.stdout.strip()
r = subprocess.run(['gh', 'api', '-X', 'PUT', f'{OUT}/contents/board.json', '--input', '-'],
                   input=json.dumps(body), text=True, capture_output=True)
if r.returncode != 0:
    print('board push failed:', r.stderr[:300])
PYB

# daily log (#516) — log.json rides the same CDN pipe as board.json. Run the
# generator from origin/main over stdin (same pattern as this whole script:
# launchd pipes telemetry.sh itself from origin/main, so a merge lands the
# next tick without touching any working tree). DAILYLOG_PUSH selects the
# push path; the module's pure core is pinned by npm run dailylogcheck.
git -C /Users/jon/Dev/retrogames fetch -q origin main 2>/dev/null || true
git -C /Users/jon/Dev/retrogames show origin/main:scripts/dailylog.mjs \
    | DAILYLOG_PUSH=1 node --input-type=module - || echo 'dailylog failed'

# shift report (#614) — report.json on the same pipe, self-gated to one run
# per 4 h (this script ticks every 5 min). SHIFTREPORT_PUSH selects the push
# path; the pure core is pinned by npm run shiftreportcheck.
if [[ ! -f /tmp/forge/last-shiftreport ]] || (( $(date +%s) - $(stat -f %m /tmp/forge/last-shiftreport) >= 14400 )); then
    git -C /Users/jon/Dev/retrogames show origin/main:scripts/shiftreport.mjs \
        | SHIFTREPORT_PUSH=1 node --input-type=module - && touch /tmp/forge/last-shiftreport \
        || echo 'shiftreport failed'
fi
