// A long race for the parity gate: the web planner (seat 1, aim on ax/ay) and,
// with --two, the CPU partner seat drive the web sim through as many halls as
// it reaches; --fuzz n lets random pads override them about one tick in four
// minutes. Writes a retrogames-rec/v1 recording and the web's per-tick trace;
// `gauntlet-trace check <dir>` (or `race <rec> <trace>`) replays it in Swift.
//   node scripts/race.mjs <out-prefix> [--seed n] [--two] [--fuzz n] [--ticks n] [--hero k]
import { writeFileSync } from 'node:fs'
import { step, stateHash } from '../../../src/games/Gauntlet/sim.js'
import { decide, partnerPad } from '../../../src/games/Gauntlet/planner.js'
import { makeHeroPadCodec, heroFromPad, p2FromPad, newGame } from '../../../scripts/plaicraft-export.mjs'
import { createRecorder } from '../../../src/utils/recording.js'
import { flattenState } from '../../../scripts/lib/trace.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d }
const out = argv[0]
const seed = Number(opt('--seed', 1)), two = argv.includes('--two'), ticks = Number(opt('--ticks', 30000))
let fz = Number(opt('--fuzz', 0)) >>> 0
const fuzz = fz > 0
const rand = () => { fz = (Math.imul(fz, 1103515245) + 12345) >>> 0; return (fz >>> 8) / 16777216 }
const gs = newGame(seed, {}, two)
const codec = makeHeroPadCodec()
const rec = createRecorder({ gameId: 'gauntlet', method: 'stick', seed, players: two ? 2 : 1, build: 'unknown', hashEvery: 30, sources: two ? [{ kind: 'cpu' }, { kind: 'cpu' }] : [{ kind: 'cpu' }] })
// streaming retrogames-trace/v1 rows: fields indexed as first seen, consts {},
// a pair per change (an explicit null when a path vanishes) — the full per-tick
// maps for 20k ticks x 6k fields would not fit in memory.
const fields = [], fidx = new Map(), prev = new Map(), rows = []
const enc = (v) => JSON.stringify(v)
function pushTick(flat) {
    const row = []
    for (const [k, v] of Object.entries(flat)) {
        let i = fidx.get(k)
        if (i === undefined) { i = fields.length; fields.push(k); fidx.set(k, i) }
        const e = enc(v)
        if (prev.get(k) !== e) { row.push(i, v); prev.set(k, e) }
    }
    for (const [k, e] of prev) if (!(k in flat) && e !== 'null') { row.push(fidx.get(k), null); prev.set(k, 'null') }
    rows.push(row)
}
let prevA = false, over = 0, pad = null, padT = 0, n = 0
const bot = [] // what the web planner / partner seat said each tick, before any fuzz override
for (let t = 1; t <= ticks && over < 60; t++) {
    let p1 = codec.toPad(decide(gs))
    const said = [p1]
    if (fuzz) {
        if (padT <= 0 && rand() < 0.01) { padT = 10 + Math.floor(rand() * 120); pad = { up: rand() < 0.3, down: rand() < 0.3, left: rand() < 0.3, right: rand() < 0.3, a: rand() < 0.3, b: rand() < 0.2 } }
        if (padT > 0) { padT--; p1 = { ...pad, a: rand() < 0.3, b: rand() < 0.15 } }
    }
    const pads = [p1]
    if (two) { const p2 = partnerPad(gs, prevA); prevA = !!p2.a; pads.push(p2); said.push(p2) }
    bot.push(said)
    step(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
    gs.events.length = 0
    const h = stateHash(gs)
    rec.addTick(pads, pads.map(() => ({ x: 0, y: 0 })), h)
    pushTick({ ...flattenState(gs, ['events', 'levelData']), hash: h })
    n = t
    if (gs.end) over++
}
const file = rec.finish(stateHash(gs))
writeFileSync(out + '.json', JSON.stringify(file) + '\n')
writeFileSync(out + '.trace.json', JSON.stringify({ format: 'retrogames-trace/v1', game: 'gauntlet', rec: 'race.json', build: 'unknown', seed, players: two ? 2 : 1, ticks: n, excludes: ['events', 'levelData'], quant: 1000, fields, consts: {}, rows }) + '\n')
writeFileSync(out + '.bot.json', JSON.stringify(bot) + '\n')
console.log(`race seed ${seed}${two ? ' 2p' : ''}${fuzz ? ' fuzz' : ''}: ${n} ticks, hall ${gs.level + 1}, end ${gs.end}, deaths ${gs.deaths}, score ${gs.score}`)
