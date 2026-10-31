// quick solvability smoke: solve 200 seeds, report stats
import { createGame, step, computeTarget, simState, hash, WIRE_COLORS, GLYPHS } from '../src/games/TalkMeDown/engine.js'

function solveOne(gs) {
    // drive seat 1 by script until done or 30k ticks
    for (let i = 0; i < 30000 && !gs.done; i++) {
        const pad = {}
        const m = gs.modules[gs.cursor.mod]
        if (m.solved) { pad.down = true; step(gs, pad); continue }
        if (m.locked > 0) { step(gs, {}); continue }
        const t = computeTarget(gs, m)
        if (!t) { step(gs, {}); continue }
        if (t.wire !== undefined) {
            const d = t.wire - gs.cursor.sub
            if (d > 0) pad.right = true; if (d < 0) pad.left = true
            if (d === 0) pad.a = true
        } else if (t.dial !== undefined) {
            if (m.dial !== t.dial) {
                const cw = (t.dial - m.dial + 10) % 10
                if (cw <= 5) pad.right = true; else pad.left = true
            } else pad.a = true
        } else {
            const pressed = (gs.seqInput[gs.cursor.mod] || []).length
            const want = t.seq[pressed]
            const d = want - gs.cursor.sub
            if (d > 0) pad.right = true; if (d < 0) pad.left = true
            if (d === 0) pad.a = true
        }
        step(gs, pad)
    }
    return gs
}

let wins = 0, fails = []
for (let seed = 1; seed <= 200; seed++) {
    const gs = solveOne(createGame(seed, 1))
    if (gs.done && gs.won) wins++
    else fails.push({ seed, round: gs.round, strikes: gs.strikes, done: gs.done, fuse: gs.fuse })
}
console.log(`wins ${wins}/200`)
if (fails.length) console.log('fails:', JSON.stringify(fails.slice(0, 10)))

// determinism: same seed => same hash stream
const a = createGame(42), b = createGame(42)
const ha = [], hb = []
for (let i = 0; i < 600; i++) { step(a, { right: i % 7 === 0, a: i % 37 === 0 }); ha.push(hash(a)) }
for (let i = 0; i < 600; i++) { step(b, { right: i % 7 === 0, a: i % 37 === 0 }); hb.push(hash(b)) }
console.log('determinism:', ha.join() === hb.join() ? 'OK' : 'FAIL')

// feature probe: first bomb of seed 1
const g = createGame(7, 2)
console.log(JSON.stringify(simState(g), null, 1).slice(0, 900))
