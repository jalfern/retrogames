// SIMCITY-MIN — the pure simulation. step(state, input) is the whole city:
// a grid, a yearly economy, power that flows ALONG the road network with a
// range limit (long mains need relay plants), and scripted disasters.
// Zero Math.random anywhere — citycheck freezes it and replays every economy
// tick. All money is integer dollars: the ledger conserves to the dollar and
// the harness proves it every year.
//
// The one economic law everything else hangs off: RESIDENTS FOLLOW JOBS.
// Demand for each zone type is computed from the counts the OTHER types
// produce, with a hysteresis band (grow above, shrink below), so a city with
// no input settles instead of exploding or crashing — "stable" is a number
// in scripts/citycheck.mjs, not an adjective.

import { W, H, SCEN, terrainOf } from './scen.js'

export const T = { GRASS: 0, WATER: 1, ROCK: 2, ROAD: 3, PLANT: 4, RES: 5, COM: 6, IND: 7, FIRE: 8, PARK: 9 }
export const isZone = (t) => t >= T.RES && t <= T.IND
const conducts = (t) => t === T.ROAD || t === T.PLANT
export const BURNABLE = (t) => isZone(t) || t === T.PLANT

export const CFG = {
    yearTicks: 240,          // 4 s per year at 60 Hz
    powerRange: 12,          // road-graph steps a plant's current travels
    fireRadius: 5,           // Chebyshev douse radius of a fire station
    fireYears: 2,
    spreadMod: 5,            // a burning cell ignites a neighbour when (7x+13y+year)%3==0
    popPerLevel: 6,
    jobsI: 14, jobsC: 7,
    maxLvl: 4,
    overhead: 20,            // civic overhead: doing NOTHING still bills
    cost: { road: 10, plant: 150, res: 20, com: 20, ind: 20, fire: 160, park: 15, doze: 2 },
    rate: { [T.RES]: 14, [T.COM]: 20, [T.IND]: 26 },
    upkeep: { [T.ROAD]: 1, [T.PLANT]: 6, [T.FIRE]: 4, [T.PARK]: 1 },
    growCooldown: 3,         // a level rises at most every N years per tile
    taxBest: 7,
    taxMax: 20,
}

const idx = (x, y) => y * W + x
export const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const roadAdj = (g, x, y) => N4.some(([dx, dy]) => inB(x + dx, y + dy) && g.grid[idx(x + dx, y + dy)].t === T.ROAD)

// --------------------------------------------------------------- construction ----
function place(g, x, y) {
    if (!inB(x, y)) { g.events.push({ type: 'deny', why: 'OFFMAP', x, y }); return false }
    const cell = g.grid[idx(x, y)]
    const tool = g.tool
    if (tool === 'doze') {
        if (cell.t < T.ROAD) { g.events.push({ type: 'deny', why: 'NOTHING', x, y }); return false }
        if (g.funds < CFG.cost.doze) { g.events.push({ type: 'deny', why: 'BROKE', x, y }); return false }
        g.funds -= CFG.cost.doze
        cell.t = T.GRASS; cell.lvl = 0; cell.burn = 0
        g.events.push({ type: 'doze', x, y, cost: CFG.cost.doze })
        return true
    }
    if (cell.t !== T.GRASS || cell.burn) { g.events.push({ type: 'deny', why: 'GROUND', x, y }); return false }
    const cost = CFG.cost[[null, null, null, 'road', 'plant', 'res', 'com', 'ind', 'fire', 'park'][tool]]
    if (cost === undefined) { g.events.push({ type: 'deny', why: 'TOOL', x, y }); return false }
    if (tool !== T.ROAD && !roadAdj(g, x, y)) { g.events.push({ type: 'deny', why: 'NOROAD', x, y }); return false }
    if (g.funds < cost) { g.events.push({ type: 'deny', why: 'BROKE', x, y }); return false }
    g.funds -= cost
    cell.t = tool
    g.events.push({ type: 'place', t: tool, x, y, cost })
    return true
}

// ------------------------------------------------------------------- the grid ----
// Power travels the ROAD graph (ducts under the street): BFS from every plant
// through road/plant cells, `powerRange` steps. A zone is lit when a
// neighbour cell is lit. Recomputed every tick — it is 384 cells, the renderer
// may draw wires live without lying.
export function litSet(g) {
    const lit = new Set()
    const q = []
    for (let i = 0; i < g.grid.length; i++) {
        if (g.grid[i].t === T.PLANT) { lit.add(i); q.push([i, 0]) }
    }
    while (q.length) {
        const [i, d] = q.shift()
        if (d >= CFG.powerRange) continue
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of N4) {
            const nx = x + dx, ny = y + dy
            if (!inB(nx, ny)) continue
            const ni = idx(nx, ny)
            if (lit.has(ni) || !conducts(g.grid[ni].t)) continue
            lit.add(ni); q.push([ni, d + 1])
        }
    }
    return lit
}

const taxPen = (tax) => Math.abs(tax - CFG.taxBest) * 0.06

function indNear(g, x, y) {
    let n = 0
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            if (dx * dx + dy * dy > 9) continue
            const nx = x + dx, ny = y + dy
            if (inB(nx, ny) && g.grid[idx(nx, ny)].t === T.IND) n++
        }
    }
    return n
}
const adjOf = (g, x, y, t) => N4.filter(([dx, dy]) => inB(x + dx, y + dy) && g.grid[idx(x + dx, y + dy)].t === t).length

function nearDeveloped(g, x, y) {
    for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
                const nx = x + dx, ny = y + dy
                if (!inB(nx, ny)) continue
                const c = g.grid[idx(nx, ny)]
                if (c.burn) continue
                if (BURNABLE(c.t) && (c.t === T.PLANT || c.lvl > 0)) return [nx, ny]
            }
        }
    }
    return null
}

// --------------------------------------------------------------- the economy ----
function yearTick(g) {
    const S = SCEN[g.sc]
    g.year++
    const lit = litSet(g)
    const P = g.pop, J = g.jobs
    let income = 0
    let expense = CFG.overhead
    let pop = 0, jobs = 0
    const stations = []
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i].t === T.FIRE) stations.push(i)

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = g.grid[idx(x, y)]
            c.lit = false
            for (const [dx, dy] of N4) {
                if (inB(x + dx, y + dy) && lit.has(idx(x + dx, y + dy))) { c.lit = true; break }
            }
            if (c.scar > 0) c.scar--
            expense += CFG.upkeep[c.t] || 0
            if (!isZone(c.t)) continue
            if (c.burn) continue
            const roadA = roadAdj(g, x, y)
            const parks = adjOf(g, x, y, T.PARK)
            const water = adjOf(g, x, y, T.WATER)
            const smog = c.t === T.IND ? 0 : indNear(g, x, y)
            const nearFire = stations.some((si) => Math.max(Math.abs((si % W) - x), Math.abs(((si - (si % W)) / W) - y)) <= CFG.fireRadius)
            let qv = 0
            if (c.t === T.RES) {
                const jobF = J > P + 6 ? 1.4 : (J >= P * 0.65 ? 0.45 : -0.9)
                qv = jobF + (c.lit ? 0.4 : -1.6) + (roadA ? 0 : -1.3) + 0.15 * parks - 0.15 * smog - taxPen(g.tax) + (nearFire ? 0.2 : -0.2)
            } else if (c.t === T.COM) {
                qv = (P >= c.lvl * 24 + 18 ? 1.15 : -0.85) + (c.lit ? 0.45 : -1.6) + (roadA ? 0 : -1.3) + 0.1 * parks - taxPen(g.tax)
            } else {
                qv = 0.85 + (c.lit ? 0.3 : -1.6) + (roadA ? 0 : -1.3) - taxPen(g.tax) - (g.tax > 13 ? 0.6 : 0)
            }
            // growth is BLOCK BY BLOCK: a level only rises when the demand
            // says yes AND the construction cooldown has run out, so a city
            // ratchets toward its job base instead of saturating in a season
            if (c.gc > 0) c.gc--
            if (qv >= 0.7 && c.lit && roadA && c.lvl < CFG.maxLvl && c.gc === 0) { c.lvl++; c.gc = CFG.growCooldown }
            else if (qv <= -0.4 || !c.lit || !roadA) c.lvl = Math.max(0, c.lvl - 1)
            if (c.lvl > 0) {
                if (c.t === T.RES) pop += c.lvl * CFG.popPerLevel
                jobs += c.t === T.IND ? c.lvl * CFG.jobsI : c.t === T.COM ? c.lvl * CFG.jobsC : 0
                const v = 1 + (c.lit ? 1 : 0) + 0.5 * parks + 0.5 * water - 0.3 * smog - 0.3 * c.scar
                income += Math.max(0, Math.round(c.lvl * Math.max(0.2, v) * CFG.rate[c.t] * g.tax / 100))
            }
        }
    }

    // disasters: scripted ignition, deterministic spread, stations douse
    for (const f of S.fires) {
        if (f.year !== g.year || g.doneFire?.includes(f.year)) continue
        g.doneFire.push(f.year)
        const at = g.grid[idx(f.x, f.y)]
        const cell = BURNABLE(at.t) && (at.t === T.PLANT || at.lvl > 0) ? [f.x, f.y] : nearDeveloped(g, f.x, f.y)
        if (cell) {
            g.grid[idx(cell[0], cell[1])].burn = CFG.fireYears
            g.events.push({ type: 'fire', x: cell[0], y: cell[1], year: g.year })
        } else {
            g.events.push({ type: 'dudfire', x: f.x, y: f.y, year: g.year })
        }
    }
    if (S.tornado && g.year >= S.tornado.startYear && g.year - S.tornado.startYear < S.tornado.path.length) {
        const [tx, ty] = S.tornado.path[g.year - S.tornado.startYear]
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = tx + dx, ny = ty + dy
                if (!inB(nx, ny)) continue
                const c = g.grid[idx(nx, ny)]
                if (c.t === T.PLANT) continue      // plants are concrete; they stand
                if (c.t >= T.ROAD && c.t !== T.WATER && c.t !== T.ROCK) {
                    const was = c.t
                    c.t = T.GRASS; c.lvl = 0; c.burn = 0; c.scar = 3
                    g.events.push({ type: 'wreck', x: nx, y: ny, was, year: g.year })
                }
            }
        }
        g.tornadoAt = [tx, ty]
        g.events.push({ type: 'tornado', x: tx, y: ty, year: g.year })
    } else if (g.tornadoAt) {
        g.tornadoAt = null
    }
    // fire lifecycle: doused first (a station near a fire wins), then spread, then burnout
    const burns = []
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i].burn) burns.push(i)
    for (const i of burns) {
        const x = i % W, y = (i - x) / W
        if (stations.some((si) => Math.max(Math.abs((si % W) - x), Math.abs(((si - (si % W)) / W) - y)) <= CFG.fireRadius)) {
            g.grid[i].burn = 0
            g.events.push({ type: 'doused', x, y, year: g.year })
            continue
        }
        const c = g.grid[i]
        c.burn--
        if (c.burn > 0) {
            for (const [dx, dy] of N4) {
                const nx = x + dx, ny = y + dy
                if (!inB(nx, ny)) continue
                const n = g.grid[idx(nx, ny)]
                if (n.burn || !BURNABLE(n.t) || (n.t !== T.PLANT && n.lvl <= 0)) continue
                if ((nx * 7 + ny * 13 + g.year) % CFG.spreadMod === 0) {
                    n.burn = CFG.fireYears
                    g.events.push({ type: 'spread', x: nx, y: ny, year: g.year })
                }
            }
        } else {
            const was = c.t
            c.t = T.GRASS; c.lvl = 0; c.scar = 3; c.gc = 0
            g.events.push({ type: 'ash', x, y, was, year: g.year })
        }
    }

    const before = g.funds
    g.income = income
    g.expense = expense
    g.funds += income - expense
    g.score += income
    g.pop = pop
    g.jobs = jobs
    g.popHistory.push(pop)
    g.events.push({ type: 'year', year: g.year, income, expense, delta: income - expense, pop, funds: g.funds, events: burns.length })
    if (g.funds < 0) { g.end = 'lose'; g.endWhy = 'BANKRUPT'; g.events.push({ type: 'lose', why: 'BANKRUPT', year: g.year }) }
    else if (g.pop >= S.target) { g.end = 'win'; g.endWhy = 'POP'; g.events.push({ type: 'win', pop: g.pop, year: g.year }) }
    else if (g.year >= S.deadline) { g.end = 'lose'; g.endWhy = 'MISSED'; g.events.push({ type: 'lose', why: 'MISSED', year: g.year, pop: g.pop }) }
}

// ------------------------------------------------------------------- the loop ----
// One honest constructor. The state carries ONLY `sc` — scenario config is
// read from the import when needed, so structuredClone(state) round-trips
// without dragging config (or a function) through it.
export function newCity(scenIdx = 0, { fundsCut = 0 } = {}) {
    const rows = terrainOf(scenIdx)
    const S = SCEN[scenIdx]
    const grid = []
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const ch = rows[y][x]
            grid.push({ t: ch === '~' ? T.WATER : ch === '#' ? T.ROCK : T.GRASS, lvl: 0, scar: 0, burn: 0, lit: false, gc: 0 })
        }
    }
    return {
        sc: scenIdx,
        tick: 0, year: 0, yTick: 0,
        funds: S.funds - fundsCut, tax: S.tax, tool: T.ROAD,
        pop: 0, jobs: 0, income: 0, expense: 0, score: 0,
        grid, events: [], end: null, endWhy: null,
        doneFire: [], tornadoAt: null, popHistory: [],
        cursor: { x: 11, y: 8 },
    }
}

export function step(g, input = {}) {
    g.events = []
    if (g.end) return g
    g.tick++
    if (input.tool !== undefined) g.tool = input.tool
    if (input.tax !== undefined) g.tax = Math.max(0, Math.min(CFG.taxMax, input.tax))
    if (input.cursor) {
        g.cursor.x = Math.max(0, Math.min(W - 1, input.cursor[0]))
        g.cursor.y = Math.max(0, Math.min(H - 1, input.cursor[1]))
    }
    if (input.place) place(g, input.place[0], input.place[1])
    if (g.yTick < CFG.yearTicks - 1) g.yTick++
    else { g.yTick = 0; yearTick(g) }
    return g
}

export function stateHash(g) {
    const cells = []
    for (let i = 0; i < g.grid.length; i++) {
        const c = g.grid[i]
        if (c.t !== 0 || c.lvl || c.burn || c.scar || c.gc) cells.push(`${i}:${c.t}/${c.lvl}/${c.burn}/${c.scar}/${c.gc}`)
    }
    return [g.tick, g.year, g.funds, g.tax, g.pop, g.jobs, g.score, g.tool, g.end, g.endWhy,
        g.cursor.x, g.cursor.y, g.doneFire.join('-'), JSON.stringify(g.tornadoAt), cells.join(',')].join('|')
}
