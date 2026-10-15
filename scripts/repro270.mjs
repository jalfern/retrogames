// Repro for #270: the dumb "one-street recipe". Placement is made robust
// (every zone lit + road-adjacent) so it actually wins, mirroring the issue.
import { newCity, step, T, CFG } from '../src/games/SimCityMin/sim.js'
import { SCEN, W, H } from '../src/games/SimCityMin/scen.js'

const idx = (x, y) => y * W + x
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H

function runRecipe(sc) {
    const S = SCEN[sc]
    const g = newCity(sc)
    // best long-grass row = the main street
    let bestY = 8, bestLen = 0
    for (let y = 1; y < H - 1; y++) {
        let run = 0
        for (let x = 0; x <= W; x++) {
            const isG = x < W && S.map[y][x] === '.'
            if (isG) run++; else { if (run > bestLen) { bestLen = run; bestY = y }; run = 0 }
        }
    }
    const y = bestY
    for (let x = 1; x < W - 1; x++) if (S.map[y][x] === '.') g.grid[idx(x, y)].t = T.ROAD
    // plant adjacent to the street, mid
    const py = (S.map[y - 1] && S.map[y - 1][12] === '.') ? y - 1 : y + 1
    g.grid[idx(12, y)].t = T.ROAD
    g.grid[idx(12, py)].t = T.PLANT
    // place a zone adjacent to the street on grass, return true if placed
    const placeZ = (zx, tool) => {
        for (const dy of [-1, 1]) {
            const zy = y + dy
            if (!inB(zx, zy) || S.map[zy][zx] !== '.' || g.grid[idx(zx, zy)].t !== T.GRASS) continue
            g.grid[idx(zx, zy)].t = tool; return true
        }
        return false
    }
    // 8 industry at one end, 22 homes at the other
    let ind = 0, res = 0
    for (let x = 2; x <= 10 && ind < 8; x++) if (placeZ(x, T.IND)) ind++
    for (let x = 14; x <= 22 && res < 22; x++) { if (placeZ(x, T.RES)) res++; if (res < 22 && placeZ(x, T.RES)) res++ }
    // run the city
    let fires = 0
    for (let t = 0; t < CFG.yearTicks * 60 && !g.end; t++) {
        step(g, {})
        for (const e of g.events) if (e.type === 'fire') fires++
    }
    return { sc, name: S.name, end: g.end, winYear: g.end === 'win' ? g.year : null, pop: g.pop, target: S.target, deadline: S.deadline, fires, ind, res }
}

let anyWin = false
for (const sc of [0, 1, 2]) {
    const r = runRecipe(sc)
    if (r.end === 'win') anyWin = true
    console.log(`${r.name}: ${r.end} @y${r.winYear ?? '?'} pop ${r.pop}/${r.target} (deadline ${r.deadline})  fires-fired ${r.fires}  scripted ${JSON.stringify(SCEN[sc].fires.map(f => f.year))}  built I${r.ind}/R${r.res}`)
}
console.log(anyWin ? 'REPRO CONFIRMED: dumb recipe wins' : 'recipe did not win — placement still off')
