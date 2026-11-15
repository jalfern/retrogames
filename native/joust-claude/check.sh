#!/bin/zsh
# Parity gate for the Swift port: replays every committed Joust recording
# through the Swift sim and compares against the web game's golden traces
# (public/traces, #2402), then cross-checks with the repo's own diff tool and
# races the web sim+planner against the Swift one on fuzzed runs.
set -e
cd "${0:A:h}"
root=../..
tmp=$(mktemp -d)
swift build -q
B=.build/debug/joust-trace
$B check $root/public/traces
for n in 1p 2p death; do
    $B trace $root/public/traces/joust-$n.json $tmp/joust-$n.port.json >/dev/null
    node $root/scripts/goldentrace.mjs diff $root/public/traces/joust-$n.trace.json $tmp/joust-$n.port.json
done
fails=0; runs=0
for args in "1 30000" "2 30000" "1 30000 7" "2 30000 7" "1 30000 11 2" "2 30000 13 4" "1 9000 idle 2" "2 9000 idle 4"; do
    a=(${=args})
    node scripts/autopilot.mjs $a > $tmp/js.txt
    $B autopilot $a > $tmp/sw.txt
    runs=$((runs+1))
    cmp -s $tmp/js.txt $tmp/sw.txt || { fails=$((fails+1)); echo "autopilot $args: $(cmp $tmp/js.txt $tmp/sw.txt)"; }
done
echo "autopilot/fuzz: $runs runs, $fails differ"
rm -rf $tmp
[ $fails -eq 0 ]
