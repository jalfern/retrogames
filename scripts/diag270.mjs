// diagnostic for #270 — why does s2 (EMBERFALL) go bankrupt under the RCI leg?
import { newCity, step, T, CFG, inB } from '../src/games/SimCityMin/sim.js'
import { plan } from '../src/games/SimCityMin/planner.js'
import { W, H } from '../src/games/SimCityMin/scen.js'

const idx = (x, y) => y * W + x

function resNear(g, x, y) {
    let n = 0
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9) continue
        const nx = x + dx, ny = y + dy
        if (!inB(nx, ny)) continue
        const c = g.grid[idx(nx, ny)]
        if (c.t === T.RES && c.lvl > 0) n++
    }
    return n
}

function traj(sc) {
    const g = newCity(sc)
    const r = plan(sc)
    let throttled = 0, totalInd = 0, indCells = 0
    for (const inp of r.script) {
        step(g, inp)
        const ye = g.events.find((e) => e.type === 'year')
        if (ye) {
            throttled = 0; totalInd = 0; indCells = 0
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const c = g.grid[idx(x, y)]
                if (c.t === T.IND && c.lvl > 0) {
                    totalInd += c.lvl; indCells++
                    if (c.lvl >= 1 && resNear(g, x, y) < 2) throttled++
                }
            }
            console.log(`y${String(g.year).padStart(2)} pop ${String(g.pop).padStart(3)} jobs ${String(g.jobs).padStart(3)} inc ${String(g.income).padStart(4)} exp ${String(g.expense).padStart(3)} funds ${String(g.funds).padStart(5)}  indLvl ${String(totalInd).padStart(3)}(${indCells}c thr${throttled})`)
        }
    }
    console.log(`--- s${sc} END: ${g.end} ${g.endWhy} @y${g.year} pop ${g.pop} funds ${g.funds}`)
}

for (const sc of process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [0, 1, 2]) traj(sc)
