#!/bin/zsh
# Parity gate for the Swift port of EMBERWOOD (#2402): the web game is the spec.
#  1. WorldData.swift still matches world.js.
#  2. Every committed golden (public/traces/emberwood-*) replays field-for-field,
#     and the repo's own diff tool agrees on the Swift port's traces.
#  3. The attract run (web bot, recorded fresh) matches the web's per-tick trace
#     over its full ~11.6k ticks, and the bundled demo is still that run.
#  4. WATCH: the Swift bot (Bot.swift) must say exactly what bot.js says on
#     every tick — the attract run, another attract seed, and every bot fuzz.
#  5. Fuzz: the bot route with random pad overrides, and random pads started in
#     the act-two rooms (Hollow King, Cinderhawk, vents, gale runes, shop).
set -e
cd "${0:A:h}"
root=../..
tmp=$(mktemp -d)
node scripts/genworld.mjs --check
swift build -q
B=.build/debug/emberwood-trace
$B check $root/public/traces
for n in roam death; do
    $B trace $root/public/traces/emberwood-$n.json $tmp/$n.port.json >/dev/null
    node $root/scripts/goldentrace.mjs diff $root/public/traces/emberwood-$n.trace.json $tmp/$n.port.json
done
node scripts/demo.mjs $tmp/demo.json $tmp/demo.trace.json >/dev/null
cmp -s $tmp/demo.json App/Resources/emberwood-demo.json || { echo "App/Resources/emberwood-demo.json is stale: node scripts/demo.mjs App/Resources/emberwood-demo.json"; exit 1; }
$B demo $tmp/demo.json $tmp/demo.trace.json
runs=0; fails=0
race() { runs=$((runs+1)); node scripts/demo.mjs $tmp/f.json $tmp/f.trace.json "$@" >/dev/null; $B demo $tmp/f.json $tmp/f.trace.json >$tmp/out.txt || { fails=$((fails+1)); echo "fuzz $*: $(cat $tmp/out.txt)"; } }
race --seed 18
for fz in 1 2 3 4; do race --fuzz $fz; done
G='"gale":true,"step":true,"shield":true'
for st in \
  '{"screen":"d3-f0","items":{'$G'},"flags":{"emberTaken":true,"ventsOff":{"v-k1":true,"v-k2":true}}}' \
  '{"screen":"d3-f0","items":{'$G'},"flags":{"emberTaken":true}}' \
  '{"screen":"d4-3","items":{'$G'}}' \
  '{"screen":"d3-e2","items":{'$G'},"flags":{"emberTaken":true}}' \
  '{"screen":"d3-e3","items":{'$G'},"flags":{"emberTaken":true}}' \
  '{"screen":"d4-1","items":{'$G'}}' \
  '{"screen":"ow-11","items":{"shield":true},"score":900}'; do
  for fz in 3 9; do race --fuzz $fz --setup "$st"; done
done
echo "fuzz: $runs runs, $fails differ"
rm -rf $tmp
[ $fails -eq 0 ]
