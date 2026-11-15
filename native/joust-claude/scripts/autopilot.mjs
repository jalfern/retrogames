// argv: players ticks [fuzzSeed|idle] [startWave]. The web sim + planner, same loop as `joust-trace autopilot`: one "tick hash"
// line per tick. Diffing the two streams checks the port (sim AND planner)
// through all five waves — further than the 1300-tick goldens reach.
import { makeGame, step, stateHash } from '../../../src/games/Joust/sim.js'
import { plan } from '../../../src/games/Joust/planner.js'
const players = Number(process.argv[2] || 1), n = Number(process.argv[3] || 20000)
const idle = process.argv[4] === 'idle' // no input at all: riders settle (and crumble ledges)
const seed = idle ? 0 : Number(process.argv[4] || 0)
const startWave = Number(process.argv[5] || 0)
const gs = makeGame({ players })
while (gs.wave < startWave) { gs.pending = { reason: 'wave', t: 1 }; step(gs, {}) } // the DEV menu's NEXT WAVE
gs.events.length = 0
let out = ''
let s = seed >>> 0
for (let i = 0; i < n && !gs.end; i++) {
    let inp = idle ? {} : plan(gs)
    if (seed) { // fuzz: same LCG as the Swift side
        s = (Math.imul(s, 1103515245) + 12345) >>> 0
        if (((s >>> 16) % 4) === 0) {
            const b = s >>> 8
            inp = { l: !!(b & 1), r: !!(b & 2), f: !!(b & 4), l2: !!(b & 8), r2: !!(b & 16), f2: !!(b & 32) }
        }
    }
    step(gs, inp); gs.events.length = 0; out += `${gs.tick} ${stateHash(gs)}\n` }
process.stdout.write(out)
