#!/bin/zsh
# THE PULSE-O-METER — samples what the fleet is physically doing and pushes
# a small telemetry.json to the `telemetry` branch (Contents API, no checkout,
# no tokens spent on a model). The /forge board draws sparklines from it via
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

# The Mac mini answers over the ssh tunnel (launchd com.jalfern.tunnel);
# remote returns two plain numbers (cpu%, omlx-server rss MB) so no JSON
# survives more than one shell boundary. Unreachable => zeros, board shows flat.
MC=0
MR=0
read -r MC MR <<< "$(ssh -o ConnectTimeout=2 -o BatchMode=yes sfm5mini \
'p=$(pgrep -f omlx-server | head -1); c=$(ps -A -o %cpu= | awk "{s+=\$1} END {printf \"%.0f\", s}"); r=0; [ -n "$p" ] && r=$(ps -p $p -o rss= | awk "{print int(\$1/1024)}"); echo $c $r' \
2>/dev/null)"
MC=${MC:-0}
MR=${MR:-0}

S="{\"t\":\"$(date +%H:%M:%S)\",\"load\":$LOAD,\"free\":${FREE:-0},\
\"tasks\":{$(task 'opencode run.*THE FORGE' forge),$(task 'opencode run.*QA MASTER' qa),\
$(task 'opencode run.*WARDEN' warden),$(task 'omlx-server' omlx),\"mini\":{\"cpu\":$MC,\"rss\":$MR}},\
\"commit\":$(printf '%s' "$COMMIT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"act\":{\"forge\":$(act "$(readlink /tmp/forge/last.log)" ),\"qa\":$(act "$(readlink /tmp/forge/last-qa.log)")}}"

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
import json, subprocess, sys, base64
sample = json.loads(sys.argv[1])
try:
    lines = open('/tmp/forge/telemetry.jsonl').read().splitlines()[-288:]
except FileNotFoundError:
    lines = [sys.argv[1]]
data = base64.b64encode('\n'.join(lines).encode()).decode()
# the branch must exist before Contents API can commit to it
subprocess.run(['gh', 'api', '-X', 'POST', 'repos/jalfern/retrogames/git/refs',
                '-f', 'ref=refs/heads/telemetry',
                '-f', 'sha=' + subprocess.run(
                    ['gh', 'api', 'repos/jalfern/retrogames/git/ref/heads/main',
                     '--jq', '.object.sha'], capture_output=True, text=True).stdout.strip()],
               capture_output=True)  # 422 if it exists already: fine
args = ['gh', 'api', '-X', 'PUT', f'repos/jalfern/retrogames/contents/telemetry.json',
        '--input', '-']
body = {'message': 'pulse', 'content': data, 'branch': 'telemetry'}
try:
    sha = subprocess.run(['gh', 'api', 'repos/jalfern/retrogames/contents/telemetry.json?ref=telemetry',
                          '--jq', '.sha'], capture_output=True, text=True).stdout.strip()
    if sha and not sha.startswith('gh:'):
        body['sha'] = sha
except Exception:
    pass
r = subprocess.run(args, input=json.dumps(body), text=True, capture_output=True)
if r.returncode != 0:
    print('telemetry push failed:', r.stderr[:200])
PY
