// Records the web attract run (bot.js on createSim(11), lend + step every tick,
// until the Ember Heart) as emberwood-demo/v1 for the app, and writes the web
// sim's own per-tick golden trace of that run for the parity check.
//   node scripts/demo.mjs <demo-out.json> <trace-out.json> [--fuzz <n>]
// --fuzz n: the same run, but about one tick in four a random pad (through the
// shared padToInput fold) overrides the bot — the route wanders off, fights,
// shops and dies in ways the clean demo never does. Ends at the win, 120 ticks
// after a death, or the cap.
import { writeFileSync } from 'node:fs'
import { createSim, stepSim, hashState, spawnRoom } from '../../../src/games/Emberwood/sim.js'
import { attractBot } from '../../../src/games/Emberwood/bot.js'
import { padToInput } from '../../../src/games/Emberwood/input.js'
import { buildTrace, flattenState } from '../../../scripts/lib/trace.mjs'

const [demoOut, traceOut] = process.argv.slice(2)
const fi = process.argv.indexOf('--fuzz')
let fz = fi > 0 ? (Number(process.argv[fi + 1]) >>> 0) || 1 : 0
const rand = () => { fz = (Math.imul(fz, 1103515245) + 12345) >>> 0; return (fz >>> 8) / 16777216 }
const prev = { a: false, b: false, b2: false, up: false, down: false }
let pad = {}, padT = 0, deadT = 0
// --setup '<json>' {screen, entry?, items?, score?, flags?: {emberTaken, ventsOff: {...}}}
// starts the run in that room with that kit (no bot: random pads only, the
// loan still applied) — how the fuzz reaches act two, which the attract
// route never enters. The Swift Demo applies the same setup in the same order.
const si = process.argv.indexOf('--setup')
const setup = si > 0 ? JSON.parse(process.argv[si + 1]) : null
const sdi = process.argv.indexOf('--seed')
const SEED = sdi > 0 ? Number(process.argv[sdi + 1]) : 11, CAP = setup ? 6000 : 12000
const sim = createSim(SEED)
if (setup) {
    Object.assign(sim.items, setup.items || {})
    if (setup.score) sim.score = setup.score
    const { ventsOff, ...rest } = setup.flags || {}
    Object.assign(sim.flags, rest)
    Object.assign(sim.flags.ventsOff, ventsOff || {})
    spawnRoom(sim, setup.screen, setup.entry || null)
}
const inputs = [], perTick = [], hashes = [], botOut = []
// attractBot's first lines (the loan), for the no-bot setup runs
function attractLend(s) {
    s.items.bow = true; s.items.blade = true
    s.items.bombs = Math.max(s.items.bombs, 3); s.items.arrows = Math.max(s.items.arrows, 12)
    s.items.keys = Math.max(s.items.keys, 5)
    s.hero.max = Math.max(s.hero.max, 4); s.hero.hp = Math.max(s.hero.hp, 4)
}
function compact(inp) {
    const c = {}
    for (const k of KEYS) if (inp[k]) c[k] = typeof inp[k] === 'number' ? inp[k] : true
    for (const k of Object.keys(inp)) if (!KEYS.includes(k) && inp[k]) throw new Error(`bot input key ${k} not recorded`)
    return c
}
const KEYS = ['lx', 'ly', 'aHeld', 'aPressed', 'aReleased', 'bPressed', 'bHeld', 'bReleased', 'cPressed', 'upPressed', 'downPressed']
while (!sim.win && (fi > 0 ? deadT < 120 : !sim.death) && inputs.length < CAP) {
    let inp
    if (setup) { attractLend(sim); inp = { lx: 0, ly: 0 } } else inp = attractBot(sim)
    if (!setup && fi > 0) botOut.push(compact(inp)) // the bot's own answer, before any override
    if (fi > 0) {
        if (sim.death) deadT++
        if (padT <= 0 && rand() < (setup ? 0.08 : 0.02)) {
            padT = 4 + Math.floor(rand() * 60)
            const r = () => rand() < 0.3
            pad = { up: r(), down: r(), left: r(), right: r(), a: rand() < 0.4, b: rand() < 0.15 }
        }
        if (padT > 0) { padT--; inp = padToInput(pad, prev); if (rand() < 0.1) pad.a = !pad.a }
        else { const idle = padToInput({}, prev); if (setup) inp = idle } // keep the release edges (gale casts on B release)
    }
    inputs.push(compact(inp))
    stepSim(sim, inp)
    sim.fx.length = 0
    const flat = flattenState(sim, ['fx'])
    flat.hash = hashState(sim)
    hashes.push(flat.hash)
    perTick.push(flat)
}
if (!sim.win && fi < 0) throw new Error(`attract run did not win (tick ${sim.tick}, screen ${sim.screen})`)
writeFileSync(demoOut, JSON.stringify({ format: 'emberwood-demo/v1', seed: SEED, ticks: inputs.length, ...(setup ? { setup } : {}), inputs, ...(botOut.length ? { bot: botOut } : {}), hashes }) + '\n')
if (traceOut) writeFileSync(traceOut, JSON.stringify(buildTrace({ game: 'emberwood', rec: 'emberwood-demo.json', build: 'unknown', seed: SEED, players: 1, ticks: inputs.length, excludes: ['fx'] }, perTick)) + '\n')
console.log(`demo${fi > 0 ? ' fuzz ' + process.argv[fi + 1] : ''}: ${inputs.length} ticks, ${sim.win ? 'won' : sim.death ? 'died' : 'stopped'} on ${sim.screen}`)
