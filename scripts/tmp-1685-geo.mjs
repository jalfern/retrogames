// TEMP repro 3: dump arena + stuck-arrow cells + bot cells at the freeze.
import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'

function drive(opts) {
    const g = makeGame(buildArena(opts.arena), opts)
    const skills = opts.skills
    const cap = opts.maxTicks || CFG.matchTicks + 200
    const actions = []
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        for (const e of g.events) if (e.type === 'loose' || e.type === 'hit') actions.push({ tick: g.tick, type: e.type, who: e.who })
        g.events.length = 0
    }
    return { g, actions }
}

let best = null
for (let run = 0; run < 60; run++) {
    const { g, actions } = drive({ arena: 0, skills: [1, 0] })
    const fi = actions.findIndex((a) => a.type === 'hit')
    if (fi < 0) continue
    let worst = 0, wi = fi
    for (let i = fi + 1; i < actions.length; i++) {
        const gap = actions[i].tick - actions[i - 1].tick
        if (gap > worst) { worst = gap; wi = i }
    }
    if (!best || worst > best.worst) best = { worst, actions, g }
    if (best.worst > 500) break
}
const { g, actions } = best
const prev = actions[actions.length ? 0 : 0]
// re-drive to just before the window
const fi = actions.findIndex((a) => a.type === 'hit')
let prevA = fi
for (let i = fi + 1; i < actions.length; i++) {
    if (actions[i].tick - actions[i - 1].tick >= best.worst) { prevA = i - 1; break }
}
const at = actions[prevA].tick
const g3 = makeGame(buildArena(0))
const byTick = new Map(g.cmds.map((c) => [c.tick, c]))
while (g3.tick < at + 2) {
    const c = byTick.get(g3.tick)
    step(g3, c ? c.p1 : null, c ? c.p2 : null)
}
console.log(`arena 0: W=${g3.W} H=${g3.H} at tick ${g3.tick}`)
const A = buildArena(0)
for (let y = 0; y < A.H; y++) {
    let line = ''
    for (let x = 0; x < A.W; x++) line += A.grid[y * A.W + x] === 1 ? '#' : '.'
    console.log(`${y.toString().padStart(2)} ${line}`)
}
console.log('col  ' + Array.from({ length: A.W }, (_, i) => (i % 10) + '').join(''))
for (const s of g3.stuck) {
    console.log(`stuck arrow id=${s.id} owner=${s.owner} cell col=${s.cell % A.W} row=${Math.floor(s.cell / A.W)} age=${s.age}  at px=(${(s.cell % A.W) * 24 + 12},${Math.floor(s.cell / A.W) * 24 + 12})`)
}
for (const p of g3.p) {
    console.log(`P${p.id}: x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} cell col=${Math.floor(p.x / 24)} row=${Math.floor(p.y / 24)} body rows ${Math.floor((p.y - 8) / 24)}..${Math.floor((p.y + 8) / 24)} q=${p.quiver} alive=${p.alive} fire=${p.firing}`)
}
// what does the pull check sample?
for (const p of g3.p) {
    const cells = [[p.x, p.y], [p.x, p.y + 6], [p.x, p.y - 6]].map(([x, y]) => `col=${Math.floor(x / 24)},row=${Math.floor(y / 24)}`)
    console.log(`P${p.id} pull-samples: ${cells.join(' | ')}`)
}
