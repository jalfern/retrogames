import re

def patch(p, old, new, count=1):
    s = open(p).read()
    assert old in s, f"ANCHOR MISSING in {p}: {old[:60]}"
    s = s.replace(old, new, count)
    open(p, 'w').write(s)

# 1) warden: catch website bug reports that lost their label
patch('/tmp/mini/.opencode/agent/warden.md',
"""3. TRIAGE. Open issues whose title starts with "GAME" (case-insensitive) and
   carry NO queue label (`game-queue`/`building`/`shipped`): add `game-queue`""",
"""3. TRIAGE. Open issues with NO queue label. Two shapes:
   a) title starts with "GAME" (case-insensitive) -> add `game-queue`""")
patch('/tmp/mini/.opencode/agent/warden.md',
"""   lack triage rights and lose the prefilled label.""",
"""   lack triage rights and lose the prefilled label.
   b) title starts with "QA" or "BUG" (case-insensitive) OR the body starts
     with `**where:**` (the website bug template) -> add `feedback` and
     comment `WARDEN: queued for QA`. If the body is still the empty
     template placeholders (`<game/screen>`), comment that details are
     needed and close it - an empty report is noise the lane must not chew.""")

# 2) mini tunnel
open('/tmp/mini/scripts/com.jalfern.tunnel.plist', 'w').write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jalfern.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-c</string>
        <string>while true; do ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 18000:127.0.0.1:8000 sfm5mini; sleep 5; done</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/forge/tunnel.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/jon</string>
    </dict>
</dict>
</plist>
''')

# 3) QA lane -> mini model, local fallback
patch('/tmp/mini/scripts/forge-qa.sh',
'PROMPT="You are THE QA MASTER.',
'''# The QA brain runs on the Mac mini (omlxmini) so it never fights the game
# builder for the studio GPU. If the tunnel/mini is down, fall back local.
MODEL="omlxmini/Qwen3.8-27B-oQ4e-mtp"
if ! curl -s -m 3 http://127.0.0.1:18000/v1/models >/dev/null 2>&1; then
    echo "$(date): mini unreachable, running QA on the local GPU instead" >> "$LOG"
    MODEL="omlx/Qwen3.8-Flash-Next-oQ5e-mtp"
fi

PROMPT="You are THE QA MASTER.''')
patch('/tmp/mini/scripts/forge-qa.sh',
'opencode run --auto "$PROMPT" >> "$LOG" 2>&1',
'opencode run --auto --model "$MODEL" "$PROMPT" >> "$LOG" 2>&1')

# 4) cadence 30 -> 15 min (own GPU now)
patch('/tmp/mini/scripts/com.jalfern.forge-qa.plist',
'<integer>1800</integer>', '<integer>900</integer>')

# 6) board: mini sparkline row + unlabeled website bugs show in QA board
patch('/tmp/mini/src/pages/Telemetry.jsx',
"['omlx', '#66b3ff']]", "['omlx', '#66b3ff'], ['mini', '#c58aff']]")
patch('/tmp/mini/src/pages/ForgeBoard.jsx',
"""    const qa = (issues ?? []).filter(i => i.state === 'open' && !i.pull_request
        && (labelOf(i, 'feedback') || labelOf(i, 'building-qa')))""",
"""    const qaShape = i => (/^(qa|bug)\\b/i.test(i.title) || (i.body || '').startsWith('**where:**'))
        && !labelOf(i, 'game-queue') && !labelOf(i, 'building') && !labelOf(i, 'shipped')
    const qa = (issues ?? []).filter(i => i.state === 'open' && !i.pull_request
        && (labelOf(i, 'feedback') || labelOf(i, 'building-qa') || qaShape(i)))""")

# 7) warden pulse: mini token
patch('/tmp/mini/.opencode/agent/warden.md',
'main=<7chars> qa=<n> gate=<none|#N> actions=none`',
'main=<7chars> qa=<n> mini=<up|down> gate=<none|#N> actions=none`')
patch('/tmp/mini/.opencode/agent/warden.md',
'4b. QA lane:',
"""4a2. MINI. `curl -s -m 3 http://127.0.0.1:18000/v1/models` — down means the
     QA brain fell back to the studio GPU (the driver logs it); report
     `mini=down` in the pulse so a dead second box is a visible state.
4b. QA lane:""")

print('all patched')
