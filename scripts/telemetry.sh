#!/bin/zsh
# THE PULSE-O-METER — samples what the fleet is physically doing and pushes
# a small telemetry.json to the `telemetry` branch (Contents API, no checkout,
# no tokens spent on a model). The /forge board draws sparklines from it via
# raw.githubusercontent (CDN — does not count against the API rate limit).
# launchd: com.jalfern.telemetry, every 5 minutes.

set -u
REPO="jalfern/retrogames"
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
    local f pid line
    f="$1"
    [[ -f "$f" ]] || { printf '""'; return; }
    line=$(tail -c 4000 "$f" | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^(→|⚙|\$) ' | tail -1)
    printf '%s' "${line:0:90}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

LOAD=$(sysctl -n vm.loadavg | awk '{print $2}')
FREE=$(memory_pressure -Q 2>/dev/null | grep -o '[0-9]*%' | head -1 | tr -d '%')

S="{\"t\":\"$(date +%H:%M:%S)\",\"load\":$LOAD,\"free\":${FREE:-0},\
\"tasks\":{$(task 'opencode run.*THE FORGE' forge),$(task 'opencode run.*QA MASTER' qa),\
$(task 'opencode run.*WARDEN' warden),$(task 'omlx-server' omlx)},\
\"act\":{\"forge\":$(act "$(readlink /tmp/forge/last.log)" ),\"qa\":$(act "$(readlink /tmp/forge/last-qa.log)")}}"

echo "$S" >> "$LOCAL"
tail -n 288 "$LOCAL" > "$LOCAL.tmp" && mv "$LOCAL.tmp" "$LOCAL"   # 24 h at 5 min

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
