#!/bin/zsh
# Parity gate for the Swift port of GAUNTLET (#2402): the web game is the spec.
#  1. LevelData.swift still matches levels.js + art.js.
#  2. The math is V8's: sin/cos/atan2 (fdlibm with clang's fused multiply-adds)
#     and toFixed, bit for bit on 300k / 300k inputs.
#  3. Every committed golden (public/traces/gauntlet-*) replays field-for-field,
#     and the repo's own diff tool agrees on the Swift port's traces.
#  4. Long races: the web planner (+ CPU partner seat) through the halls, 1P
#     and 2P, clean and fuzzed — the Swift sim must match every field every
#     tick AND the Swift pilot/partner must say what planner.js said each tick.
set -e
cd "${0:A:h}"
root=../..
tmp=$(mktemp -d)
node scripts/genlevels.mjs --check
swift build -q -c release
B=.build/release/gauntlet-trace
node scripts/mathfuzz.mjs $tmp/math.bin $tmp/tofixed.json
$B math $tmp/math.bin $tmp/tofixed.json
$B check $root/public/traces
for n in 1p 2p death; do
    $B trace $root/public/traces/gauntlet-$n.json $tmp/$n.port.json >/dev/null
    node $root/scripts/goldentrace.mjs diff $root/public/traces/gauntlet-$n.trace.json $tmp/$n.port.json
done
runs=0; fails=0
race() {
    runs=$((runs+1))
    node scripts/race.mjs $tmp/r "$@" >$tmp/what.txt
    $B race $tmp/r.json $tmp/r.trace.json $tmp/r.bot.json >$tmp/out.txt || { fails=$((fails+1)); echo "race $*: $(cat $tmp/what.txt) $(cat $tmp/out.txt)"; }
}
race --seed 1 --ticks 12000              # the whole quest, 1P
race --seed 7 --two --ticks 12000        # the whole quest, planner + CPU partner
race --seed 2 --fuzz 3 --ticks 8000
race --seed 3 --two --fuzz 7 --ticks 8000
echo "races: $runs runs (sim + planner), $fails differ"
rm -rf $tmp
[ $fails -eq 0 ]
