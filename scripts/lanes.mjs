#!/usr/bin/env node
// lanes.mjs (bin) — feed the open-issues JSON array on stdin (the warden's
// $ISSUES verbatim), get eval-ready zsh vars out:
//
//   print -r -- "$ISSUES" | node scripts/lanes.mjs --free-a 1 --free-b 1 --b-loaded 1
//   A_TARGET=1253
//   B_TARGET=1254
//   KICK_A=1
//   KICK_B=1
//   QA_STUDIO_QUEUE=0
//   LADDER=8
//
// Values are integers or `-` only (warden eval's this output; nothing else can
// cross). --help prints usage; a stdin that isn't JSON exits 1 loudly (the
// warden then keeps its own fallback ladder rather than idling).

import { lanePlan } from './lib/lanes.mjs'

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt
}
if (argv.includes('--help')) {
    console.log('usage: <issues.json> lanes.mjs --free-a 0|1 --free-b 0|1 --b-loaded 0|1')
    process.exit(0)
}

let raw = ''
await new Promise((res, rej) => {
    process.stdin.on('data', (c) => { raw += c })
    process.stdin.on('end', res)
    process.stdin.on('error', rej)
})
let issues
try {
    issues = JSON.parse(raw)
    if (!Array.isArray(issues)) throw new Error('not an array')
} catch (e) {
    console.error(`lanes.mjs: stdin is not an issues JSON array (${e.message})`)
    process.exit(1)
}

const plan = lanePlan({
    issues,
    freeA: flag('free-a', '0') === '1',
    freeB: flag('free-b', '0') === '1',
    bLoaded: flag('b-loaded', '1') === '1',
})
console.log(`A_TARGET=${plan.targets.a ?? '-'}`)
console.log(`B_TARGET=${plan.targets.b ?? '-'}`)
console.log(`KICK_A=${plan.kick.a ? 1 : 0}`)
console.log(`KICK_B=${plan.kick.b ? 1 : 0}`)
console.log(`QA_STUDIO_QUEUE=${plan.qaStudioQueue ? 1 : 0}`)
console.log(`LADDER=${plan.counts.ladder}`)
