// SIMCITY-MIN — the autopilot. plan(scenario) drives the real sim with the
// real input shape and returns its run; the attract demo IS this run replayed
// tick for tick, and citycheck re-runs it with ONE fewer plant, ONE fewer
// fire station and one plant-price less cash (the slack rule).
//
// A greedy terrain-aware city planner, not an oracle:
//   * pick the row with the longest grass run as the power avenue (a river
//     scenario forces the bridge row — power must cross water on roads);
//   * grow the avenue outward from BOTH ends of its grass run, zoning the
//     two rows it services in a 3R:1C:1I mix, because residents follow jobs
//     and this mix keeps jobs ahead of residents without drowning in smog;
//   * when the frontier outruns the plant's reach, drop a relay plant;
//   * every scripted fire gets a station within dousing range BEFORE its
//     year arrives — the disasters are known; preparing is the whole game;
//   * a tornado rebuilds missing avenue cells first: the corridor IS the
//     grid — a road cut mid-river un-lights the east side with it.
// Money discipline: nothing discretionary is spent below the reserve line.

import { W, H, SCEN } from './scen.js'
import { newCity, step, T, CFG, inB } from './sim.js'

const idx = (x, y) => y * W + x
const idOf = (x, y) => y * W + x
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const grass = (g, x, y) => inB(x, y) && g.grid[idx(x, y)].t === T.GRASS

export function bestAvenue(g) {
    let best = { y: 8, len: -1, x0: 1, x1: W - 2 }
    for (let y = 1; y < H - 1; y++) {
        let run = 0, bx = 0
        for (let x = 0; x <= W; x++) {
            const isG = x < W && g.grid[idx(x, y)].t === T.GRASS
            if (isG) { if (run === 0) bx = x; run++ }
            else {
                if (run > best.len) best = { y, len: run, x0: bx, x1: x - 1 }
                run = 0
            }
        }
    }
    return best
}

// steps along the road graph from the nearest standing plant
export function reach(g) {
    const d = new Map()
    const q = []
    for (let i = 0; i < g.grid.length; i++) {
        if (g.grid[i].t === T.PLANT) { d.set(i, 0); q.push(i) }
    }
    while (q.length) {
        const i = q.shift()
        const dd = d.get(i)
        if (dd >= CFG.powerRange) continue
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of N4) {
            const nx = x + dx, ny = y + dy
            if (!inB(nx, ny)) continue
            const ni = idx(nx, ny)
            const t = g.grid[ni].t
            if ((t === T.ROAD || t === T.PLANT) && !d.has(ni)) { d.set(ni, dd + 1); q.push(ni) }
        }
    }
    return d
}

const REACH_SAFE = CFG.powerRange - 2

function fireCovered(g, fx, fy) {
    for (let i = 0; i < g.grid.length; i++) {
        if (g.grid[i].t !== T.FIRE) continue
        if (Math.max(Math.abs((i % W) - fx), Math.abs(((i - (i % W)) / W) - fy)) <= CFG.fireRadius) return true
    }
    return false
}

const MIX = [T.RES, T.RES, T.RES, T.COM, T.IND]

export function decideYear(g, ctx) {
    const S = SCEN[g.sc]
    const can = (cost) => g.funds - cost >= ctx.reserve

    // 0. rebuild anything the tornado took that the avenue still needs —
    //    the corridor is load-bearing: light travels along it
    for (const i of ctx.roads) {
        if (g.grid[i].t !== T.ROAD && !ctx.rebuildRoads.some(([x, y]) => x === i % W && y === (i - (i % W)) / W)) {
            ctx.rebuildRoads.push([i % W, (i - (i % W)) / W])
        }
    }
    for (const [x, y] of ctx.rebuildRoads.splice(0)) {
        if (g.grid[idx(x, y)].t === T.ROAD || !can(CFG.cost.road)) continue
        ctx.queue.push({ tool: T.ROAD, place: [x, y] })
        ctx.roads.add(idx(x, y))
    }

    // 1. fire stations before the fire year. A straight avenue leaves no
    //    grass next to a road off-corridor, so if no site exists the planner
    //    spurs two road cells down the fire's column and hangs the station
    //    off that — seven years of lead time on a disaster the script named.
    for (const f of S.fires) {
        if (ctx.doneFireSite[f.year]) continue
        const due = f.year - g.year
        if (due > 7 || due < -1) continue
        if (fireCovered(g, f.x, f.y)) { ctx.doneFireSite[f.year] = true; continue }
        if (ctx.firesPlaced >= ctx.fireCap || !can(CFG.cost.fire + 60)) continue
        const d = f.y <= ctx.avenue.y ? 1 : -1
        const site = (x, y) => grass(g, x, y) && N4.some(([ax, ay]) => inB(x + ax, y + ay) &&
            (g.grid[idx(x + ax, y + ay)].t === T.ROAD || ctx.roads.has(idx(x + ax, y + ay))))
        let done = false
        for (let r = 0; r <= 2 && !done; r++) {
            for (let dy = -r; dy <= r && !done; dy++) {
                for (let dx = -r; dx <= r && !done; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
                    if (site(f.x + dx, f.y + dy)) {
                        ctx.queue.push({ tool: T.FIRE, place: [f.x + dx, f.y + dy] })
                        ctx.firesPlaced++
                        ctx.doneFireSite[f.year] = true
                        done = true
                    }
                }
            }
        }
        if (done) continue
        for (const xc of [f.x, f.x + 1, f.x - 1, f.x + 2, f.x - 2]) {
            const s1 = [xc, f.y + d], s2 = [xc, f.y + 2 * d]
            if (!grass(g, s1[0], s1[1]) || !grass(g, s2[0], s2[1])) continue
            for (const [sx, sy] of [[xc, f.y + 3 * d], [xc - 1, f.y + 2 * d], [xc + 1, f.y + 2 * d]]) {
                if (!grass(g, sx, sy)) continue
                const adj = N4.some(([ax, ay]) => inB(sx + ax, sy + ay) && (
                    g.grid[idx(sx + ax, sy + ay)].t === T.ROAD || ctx.roads.has(idx(sx + ax, sy + ay)) ||
                    (sx + ax === s1[0] && sy + ay === s1[1]) || (sx + ax === s2[0] && sy + ay === s2[1])))
                if (!adj) continue
                ctx.queue.push({ tool: T.ROAD, place: s1 })
                ctx.queue.push({ tool: T.ROAD, place: s2 })
                ctx.roads.add(idx(s1[0], s1[1]))
                ctx.roads.add(idx(s2[0], s2[1]))
                ctx.queue.push({ tool: T.FIRE, place: [sx, sy] })
                ctx.firesPlaced++
                ctx.doneFireSite[f.year] = true
                done = true
                break
            }
            if (done) break
        }
    }

    // 2. grow the avenue from BOTH ends every year — one cell a year is how
    //    a city starves its east side past the deadline
    for (const side of [1, 0]) {
        const x = side ? ctx.xb + 1 : ctx.xa - 1
        if (!grass(g, x, ctx.avenue.y) || !can(CFG.cost.road)) continue
        ctx.queue.push({ tool: T.ROAD, place: [x, ctx.avenue.y] })
        ctx.roads.add(idx(x, ctx.avenue.y))
        if (side) ctx.xb = x; else ctx.xa = x
        ctx.queuedRoads.push(x)
    }

    // 3. the first plant, then relays ONLY when out-of-reach demand is real:
    //    a plant every ≥3 years, never while the queue is still near a wire,
    //    never below plant+250 on hand. Plants were once dropped one per year
    //    by a greedy bug and bankrupted the city by year 5 — the cooldown and
    //    the out-of-reach gate are the fix citycheck keeps honest.
    const d = reach(g)
    let plants = 0
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i].t === T.PLANT) plants++
    const poweredNear = (x, y) => N4.some(([ax, ay]) => inB(x + ax, y + ay) && d.has(idx(x + ax, y + ay)) && d.get(idx(x + ax, y + ay)) <= REACH_SAFE)
    if (plants === 0 && ctx.plantsPlaced < ctx.plantCap && ctx.year >= 1 && can(CFG.cost.plant)) {
        const mid = Math.floor((ctx.xa + ctx.xb) / 2)
        for (const [sx, sy] of [[mid, ctx.avenue.y - 1], [mid, ctx.avenue.y + 1], [mid + 1, ctx.avenue.y - 1], [mid - 1, ctx.avenue.y + 1]]) {
            if (grass(g, sx, sy)) {
                ctx.queue.push({ tool: T.PLANT, place: [sx, sy] })
                ctx.plantsPlaced++
                ctx.lastPlantYear = ctx.year
                break
            }
        }
    } else if (plants > 0 && ctx.plantsPlaced < ctx.plantCap && ctx.year - (ctx.lastPlantYear || 0) >= 3 &&
        can(CFG.cost.plant + 120)) {
        // demand far from ANY standing plant — not just unlit: the frontier
        // cells right next to a relay's reach are already served, and
        // counting them was relaying the same block twice per cooldown
        const plantCells = []
        for (let i = 0; i < g.grid.length; i++) if (g.grid[i].t === T.PLANT) plantCells.push([i % W, (i - (i % W)) / W])
        const nearPlant = (x, y) => plantCells.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) <= 8)
        const outOfReach = ctx.zoneQueue.filter(([tool, x, y]) => tool !== T.PARK && !poweredNear(x, y) && !nearPlant(x, y))
        if (outOfReach.length >= 4) {
            const [fx] = outOfReach[0]
            const ry = ctx.avenue.y + (ctx.relaySide ? 1 : -1)
            ctx.relaySide = 1 - ctx.relaySide
            // a plant needs its own road adjacency: only columns whose
            // neighbouring avenue cell is already ROAD conduct current
            for (let dx = 0; dx <= 9; dx++) {
                const cand = [fx + dx, fx - dx].find((sx) =>
                    grass(g, sx, ry) && N4.some(([ax, ay]) => inB(sx + ax, ry + ay) &&
                        (g.grid[idx(sx + ax, ry + ay)].t === T.ROAD || ctx.roads.has(idx(sx + ax, ry + ay)))))
                if (cand !== undefined) {
                    ctx.queue.push({ tool: T.PLANT, place: [cand, ry] })
                    ctx.plantsPlaced++
                    ctx.lastPlantYear = ctx.year
                    break
                }
            }
        }
    }

    // 4. zones — but ONLY under power. A dark zone is $20 sunk into weeds;
    //    dark candidates wait in the queue for the relay that will light them.
    let budget = 8
    while (ctx.zoneQueue.length && budget-- > 0 && can(CFG.cost.res)) {
        const i = ctx.zoneQueue.findIndex(([tool, x, y]) => g.grid[idx(x, y)].t === T.GRASS && poweredNear(x, y))
        if (i < 0) break
        const [tool, x, y] = ctx.zoneQueue.splice(i, 1)[0]
        ctx.queue.push({ tool, place: [x, y] })
        ctx.built[tool === T.RES ? 'res' : tool === T.COM ? 'com' : tool === T.IND ? 'ind' : 'park']++
    }

    // 5. out of room AND out of queue with cash idle? open the next avenue:
    //    one connector off the current corridor, then the pattern repeats.
    //    (A one-row city tops out below the targets; inventory is the map.)
    //    "Out of queue" means out of POWERED queue: dark cells waiting for
    //    a relay must NOT block the tier — that was a deadlock where the
    //    tier needed the queue empty, the queue needed power, the power
    //    needed the tier, and the city sat on idle cash until the deadline.
    const placeable = ctx.zoneQueue.filter(([, x, y]) => g.grid[idx(x, y)].t === T.GRASS && poweredNear(x, y)).length
    if (!placeable && plants > 0 && can(CFG.cost.plant + 150) && ctx.tier < ctx.tierRows.length &&
        g.year < SCEN[g.sc].deadline - 10) {
        const y2 = ctx.tierRows[ctx.tier]
        if (y2 >= 1 && y2 <= H - 2) {
            const dir = y2 > ctx.avenue.y ? 1 : -1
            const step1 = ctx.avenue.y + dir
            let cx = -1
            for (const x of [ctx.xb, ctx.xa, ctx.xb - 1, ctx.xa + 1]) {
                if (grass(g, x, step1) && grass(g, x, y2)) { cx = x; break }
            }
            if (cx >= 0) {
                ctx.queue.push({ tool: T.ROAD, place: [cx, step1] })
                ctx.roads.add(idx(cx, step1))
                // seed the new avenue too: a single connector grows far too slow
                let seeded = 0
                for (let x = cx - 2; x <= cx + 2; x++) {
                    if (!grass(g, x, y2)) continue
                    ctx.queue.push({ tool: T.ROAD, place: [x, y2] })
                    ctx.roads.add(idx(x, y2))
                    ctx.queuedRoads.push(x)
                    seeded++
                }
                if (seeded) {
                    ctx.xa = cx - 2
                    ctx.xb = cx + 2
                    while (!grass(g, ctx.xa, y2)) ctx.xa++
                    while (!grass(g, ctx.xb, y2)) ctx.xb--
                }
                ctx.tier++
                ctx.avenue = { y: y2 }
                ctx.relaySide = 0
            }
        }
    }
}

export function rankAvenues(g) {
    const rows = []
    for (let y = 1; y < H - 1; y++) {
        let run = 0, best = 0
        for (let x = 0; x <= W; x++) {
            const isG = x < W && g.grid[idx(x, y)].t === T.GRASS
            run = isG ? run + 1 : 0
            if (run > best) best = run
        }
        rows.push([y, best])
    }
    return rows.filter(([, b]) => b >= 8).sort((a, b) => b[1] - a[1]).map(([y]) => y)
}

export function plan(scenIdx, { fundsCut = 0, plantCap = Infinity, fireCap = Infinity, maxYears = 90, reserve = 120 } = {}) {
    const g = newCity(scenIdx, { fundsCut })
    const avenue = bestAvenue(g)
    const x0 = Math.max(1, avenue.x0), x1 = Math.min(W - 2, avenue.x1)
    const ctx = {
        avenue,
        xa: x0, xb: x1,
        growSide: 0,
        relaySide: 0,
        year: 0,
        tier: 0,
        tierRows: rankAvenues(g).filter((y) => y !== avenue.y),
        lastPlantYear: 0,
        roads: new Set(),
        rebuildRoads: [],
        queuedRoads: [],
        zoneQueue: [],
        queue: [],
        doneFireSite: {},
        plantsPlaced: 0,
        firesPlaced: 0,
        plantCap,
        fireCap,
        reserve,
        built: { res: 0, com: 0, ind: 0, park: 0 },
    }
    const script = []
    const mix = { i: 0, park: 0 }

    const queueRow = (x) => {
        for (const dy of [-1, 1]) {
            const y = ctx.avenue.y + dy
            if (!inB(x, y) || g.grid[idx(x, y)].t !== T.GRASS) continue
            if (ctx.zoneQueue.some((z) => z[1] === x && z[2] === y)) continue
            const tool = MIX[mix.i++ % MIX.length]
            mix.park++
            ctx.zoneQueue.push([tool === T.RES && mix.park % 8 === 0 ? T.PARK : tool, x, y])
        }
    }

    // seed the avenue: five grass cells at the middle of its run. xa/xb are
    // the SEEDED ends, not the run ends — growth must sweep contiguous, or a
    // gap opens in the corridor the zones on both sides of it starve.
    const mid = Math.floor((x0 + x1) / 2)
    ctx.xa = Math.max(x0, mid - 2)
    ctx.xb = Math.min(x1, mid + 2)
    for (let x = ctx.xa; x <= ctx.xb; x++) {
        ctx.queue.push({ tool: T.ROAD, place: [x, avenue.y] })
        ctx.roads.add(idx(x, avenue.y))
        ctx.queuedRoads.push(x)
        queueRow(x)
    }

    for (let t = 0; t < maxYears * CFG.yearTicks && !g.end; t++) {
        if (t % CFG.yearTicks === 0) {
            ctx.year++
            decideYear(g, ctx)
            for (const x of ctx.queuedRoads.splice(0)) queueRow(x)
        }
        let inp = t === 0 ? { tax: SCEN[scenIdx].tax } : {}
        if (t % 12 === 0 && ctx.queue.length) {
            const a = ctx.queue.shift()
            inp = { ...inp, tool: a.tool, place: a.place }
        }
        script.push(inp)
        step(g, inp)
        // a zone that burned to ash goes back on the rebuild queue: disasters
        // are gameplay, not a death spiral — the cell remembers its purpose
        for (const e of g.events) {
            if ((e.type === 'ash' || e.type === 'wreck') && (e.was === T.RES || e.was === T.COM || e.was === T.IND)) {
                if (!ctx.zoneQueue.some((z) => z[1] === e.x && z[2] === e.y)) ctx.zoneQueue.push([e.was, e.x, e.y])
            }
        }
    }
    return {
        ok: g.end === 'win',
        script,
        receipts: {
            end: g.end, why: g.endWhy, year: g.year, pop: g.pop, funds: g.funds, score: g.score,
            plants: ctx.plantsPlaced, fires: ctx.firesPlaced,
            roads: ctx.roads.size, built: { ...ctx.built },
            popHistory: g.popHistory,
        },
    }
}
