// OUTPOST — the pure colony sim. step(gs, input) is the whole outpost:
// procedurally carved depths (./cave.js), autonomous colonists who claim
// WORK OFF A PRIORITY QUEUE and A-star to it, a hunger clock that eats from
// the depot, and a descent that carries the survivors downward.
// Zero Math.random anywhere below this line — the only dice are the seeded
// generator, frozen-and-proven in scripts/outpostcheck.mjs. Ids belong to
// the game (gs.nextId), never to the module.
//
// The job queue is the contract: every job is pending -> claimed -> resolved
// exactly once; a death RETURNS its claim; nothing is double-claimed, and
// the ledger (depot + carried + eaten + rotten == start + harvested)
// balances to every unit every tick.

import { W, H, ROCK, FLOOR, STAIRS, gen, mulberry32 } from './cave.js'

export { W, H, ROCK, FLOOR, STAIRS }

export const CFG = {
    MOVE: 6,             // ticks per walked tile
    DIG: 20,             // ticks of pickwork per rock
    FARMWORK: 12,
    PICK: 10,
    EAT: 8,
    HAUL: 2,
    HUNGER_TICK: 8,      // +1 hunger per N ticks
    HUNGER_MAX: 100,
    STARVE_MAX: 40,      // ticks at full hunger with no food -> death
    FARM_GROW: 520,      // a plot ripens N ticks after planting/reaping
    DWARVES: 4,
    FOOD0: 6,
    BUSH_FOOD: 3,
    FARM_FOOD: 2,
    MAX_DEPTH: 3,
}

const idx = (x, y) => y * W + x
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H
export { inB }
const walkable = (gs, i) => gs.cave.t[i] !== ROCK

// -------------------------------------------------------------------- A* ----
// Manhattan heuristic over the 4-dir walk graph, unit costs — the honest
// pin (outpostcheck): path length == BFS distance. Unreachable returns
// null; a path is never a lie.
export function astar(gs, start, goal) {
    const si = idx(start[0], start[1]), gi = idx(goal[0], goal[1])
    if (!walkable(gs, si) || !walkable(gs, gi)) return null
    if (si === gi) return []
    const open = [{ i: si, f: 0 }]
    const g = new Map([[si, 0]])
    const came = new Map()
    const closed = new Set()
    let found = false
    while (open.length) {
        let bi = 0
        for (let k = 1; k < open.length; k++) {
            if (open[k].f < open[bi].f || (open[k].f === open[bi].f && open[k].i < open[bi].i)) bi = k
        }
        const { i } = open.splice(bi, 1)[0]
        if (i === gi) { found = true; break }
        if (closed.has(i)) continue
        closed.add(i)
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of N4) {
            const nx = x + dx, ny = y + dy
            if (!inB(nx, ny)) continue
            const ni = idx(nx, ny)
            if (!walkable(gs, ni) || closed.has(ni)) continue
            const ng = g.get(i) + 1
            if (g.has(ni) && g.get(ni) <= ng) continue
            g.set(ni, ng)
            came.set(ni, i)
            open.push({ i: ni, f: ng + Math.abs((ni % W) - (gi % W)) + Math.abs(((ni - (ni % W)) / W) - ((gi - (gi % W)) / W)) })
        }
    }
    if (!found) return null
    const path = []
    for (let i = gi; i !== si; i = came.get(i)) path.push([i % W, (i - (i % W)) / W])
    return path.reverse()
}

// -------------------------------------------------------------- job queue ----
export const JOB_KINDS = ['dig', 'farm', 'pick']
const PRIORITY = { eat: 0, haul: 0, rally: 1, pick: 2, dig: 3, farm: 4 }

function addJob(gs, kind, x, y) {
    const job = { id: gs.nextId++, kind, x, y, claim: null, born: gs.tick }
    gs.jobs.push(job)
    gs.events.push({ type: 'job', job: job.id, kind, x, y })
    return job
}

const jobAt = (gs, kind, x, y) => gs.jobs.find((j) => j.kind === kind && j.x === x && j.y === y && !j.done)

function desigValid(gs, tool, x, y) {
    if (!inB(x, y)) return 'OFFMAP'
    const i = idx(x, y)
    if (tool === 'dig') {
        if (gs.cave.t[i] !== ROCK) return 'NOTROCK'
        if (jobAt(gs, 'dig', x, y)) return 'DUP'
        if (!N4.some(([dx, dy]) => inB(x + dx, y + dy) && walkable(gs, idx(x + dx, y + dy)))) return 'SEALED'
    } else if (tool === 'farm') {
        if (gs.cave.t[i] !== FLOOR || gs.cave.bush[i] || gs.farm[i]) return 'NOTGROUND'
        if (x === gs.cave.depot[0] && y === gs.cave.depot[1]) return 'DEPOT'
        if (jobAt(gs, 'farm', x, y)) return 'DUP'
    } else if (tool === 'rally') {
        if (gs.cave.t[i] !== STAIRS) return 'NOTSTAIRS'
        if (gs.rally) return 'DUP'
    } else return 'TOOL'
    return null
}

function designate(gs, tool, x, y) {
    const bad = desigValid(gs, tool, x, y)
    if (bad) { gs.events.push({ type: 'deny', why: bad, x, y }); return false }
    if (tool === 'rally') { gs.rally = true; gs.events.push({ type: 'rally', x, y }); return true }
    addJob(gs, tool, x, y)
    gs.designated.push({ tool, x, y })
    return true
}

// --------------------------------------------------------------- dwarves ----
function spawnDwarves(gs) {
    const [sx, sy] = gs.cave.spawn
    for (let k = 0; k < gs.dwarfCap; k++) {
        const prev = gs.dwarves.find((d) => d.id === k)
        const body = prev || { id: k, hunger: 0, starve: 0, alive: true, carryFood: 0, carryOre: 0 }
        Object.assign(body, { x: sx, y: sy, jobId: null, path: null, dwell: 0, moveIn: 0, act: 'idle', workKind: null, tX: sx, tY: sy })
        body.carryFood = 0
        if (!prev) gs.dwarves.push(body)
    }
}

function die(gs, d) {
    d.alive = false
    gs.rotten += d.carryFood       // the pack rots where the dwarf fell — the
    d.carryFood = 0                // ledger counts it, never forgets it
    gs.ore += d.carryOre           // ore drops where they fell (audit: mined
    d.carryOre = 0                 // == ore + carried-alive, always)
    if (d.jobId !== null) {        // THE claim returns to the queue — leak
        const j = gs.jobs.find((jj) => jj.id === d.jobId)
        if (j && !j.done) j.claim = null
        d.jobId = null
    }
    d.act = 'idle'; d.path = null; d.workKind = null
    gs.events.push({ type: 'die', id: d.id })
}

function release(gs, d) {          // the job was RESOLVED: it leaves the queue
    if (d.jobId !== null) {
        const j = gs.jobs.find((jj) => jj.id === d.jobId)
        if (j) j.done = true
        gs.jobs = gs.jobs.filter((jj) => jj.id !== d.jobId)
        d.jobId = null
    }
}

function returnJob(gs, d) {        // the dwarf lets go; the JOB survives,
    if (d.jobId !== null) {        // the player's designation is not the
        const j = gs.jobs.find((jj) => jj.id === d.jobId)  // dwarf's private property
        if (j && !j.done) j.claim = null
        d.jobId = null
    }
}

function claimFor(gs, d) {
    if (gs.rally && gs.cave.t[idx(d.x, d.y)] !== STAIRS) {
        const p = astar(gs, [d.x, d.y], gs.cave.stairs)
        if (p) return { kind: 'rally', x: gs.cave.stairs[0], y: gs.cave.stairs[1], path: p, job: null }
    }
    const pool = gs.jobs.filter((j) => !j.done && j.claim === null)
        .sort((a, b) => (PRIORITY[a.kind] - PRIORITY[b.kind]) || (a.id - b.id))
    for (const j of pool) {
        const i = idx(j.x, j.y)
        if (j.kind === 'pick' && !(gs.cave.bush[i] || gs.farm[i] === 2)) continue
        if (j.kind === 'dig' && gs.cave.t[i] !== ROCK) continue
        if (j.kind === 'farm' && (gs.cave.t[i] !== FLOOR || gs.cave.bush[i] || gs.farm[i])) continue
        // a dig targets ROCK: nobody can stand on stone. The digger paths
        // to the NEAREST adjacent open cell and swings from there.
        let p = null
        if (j.kind === 'dig') {
            for (const [dx, dy] of N4) {
                const nx = j.x + dx, ny = j.y + dy
                if (!inB(nx, ny) || !walkable(gs, idx(nx, ny))) continue
                const q = astar(gs, [d.x, d.y], [nx, ny])
                if (q && (p === null || q.length < p.length)) p = q
            }
        } else p = astar(gs, [d.x, d.y], [j.x, j.y])
        if (!p) { j.done = true; gs.jobs = gs.jobs.filter((jj) => jj.id !== j.id); gs.events.push({ type: 'unreach', job: j.id, kind: j.kind }); continue }
        j.claim = d.id
        return { kind: j.kind, x: j.x, y: j.y, path: p, job: j }
    }
    return null
}

function startWork(gs, d, kind) {
    d.workKind = kind
    d.act = 'work'
    d.dwell = 0
}

function sendHome(gs, d) {   // carry -> depot or eat -> depot
    if (d.carryFood === 0 && d.carryOre === 0 && d.workKind !== 'eat') return false
    const p = astar(gs, [d.x, d.y], gs.cave.depot)
    if (!p) return false
    d.act = 'walk'
    d.path = p
    if (!p.length) startWork(gs, d, d.workKind === 'eat' ? 'eat' : 'haul')
    return true
}

function resolve(gs, d) {
    const kind = d.workKind
    if (kind === 'dig' || kind === 'farm' || kind === 'pick') release(gs, d)
    const i = idx(d.x, d.y)
    if (kind === 'eat') {
        if (gs.food > 0) {
            gs.food--; gs.eaten++
            d.hunger = 0; d.starve = 0
            gs.events.push({ type: 'eat', id: d.id })
        }
        d.act = 'idle'; d.workKind = null
        return
    }
    if (kind === 'haul') {
        gs.food += d.carryFood; gs.ore += d.carryOre
        d.carryFood = 0; d.carryOre = 0
        d.act = 'idle'; d.workKind = null
        return
    }
    if (kind === 'rally') { d.act = 'idle'; d.workKind = null; return }
    if (kind === 'dig') {
        const di = idx(d.digX, d.digY)
        if (gs.cave.t[di] !== ROCK) { d.act = 'idle'; d.workKind = null; return }  // stale target: release, dig nothing
        gs.cave.t[di] = FLOOR
        gs.dug++
        gs.events.push({ type: 'dig', x: d.digX, y: d.digY })
        if (gs.cave.ore[di]) {
            d.carryOre = gs.cave.ore[di]
            gs.minedOre += gs.cave.ore[di]
            gs.cave.ore[di] = 0
            if (!sendHome(gs, d)) { gs.ore += d.carryOre; d.carryOre = 0; d.act = 'idle' }
            d.workKind = d.act === 'idle' ? null : 'haul'
            gs.events.push({ type: 'ore', x: d.x, y: d.y })
            return
        }
        d.act = 'idle'; d.workKind = null
        return
    }
    if (kind === 'farm') {
        gs.farm[i] = 1
        gs.farmAge[i] = 0
        gs.events.push({ type: 'farm', x: d.x, y: d.y })
        d.act = 'idle'; d.workKind = null
        return
    }
    if (kind === 'pick') {
        if (gs.cave.bush[i]) {
            gs.cave.bush[i] = 0
            d.carryFood += CFG.BUSH_FOOD
            gs.harvested += CFG.BUSH_FOOD
        } else if (gs.farm[i] === 2) {
            gs.farm[i] = 1
            gs.farmAge[i] = 0
            d.carryFood += CFG.FARM_FOOD
            gs.harvested += CFG.FARM_FOOD
        }
        gs.events.push({ type: 'pick', x: d.x, y: d.y })
        if (d.carryFood > 0 && sendHome(gs, d)) { d.workKind = 'haul'; return }
        if (d.carryFood > 0) { gs.food += d.carryFood; d.carryFood = 0 }
        d.act = 'idle'; d.workKind = null
        return
    }
    d.act = 'idle'; d.workKind = null
}

const DWELL = { dig: CFG.DIG, farm: CFG.FARMWORK, pick: CFG.PICK, eat: CFG.EAT, haul: CFG.HAUL, rally: 1 }

function dwarfTick(gs, d) {
    if (!d.alive) return
    if (gs.tick % CFG.HUNGER_TICK === 0) d.hunger++
    if (d.hunger >= CFG.HUNGER_MAX && d.workKind !== 'eat') {
        if (gs.food > 0) {
            returnJob(gs, d)                        // the meal outranks the
            const p = astar(gs, [d.x, d.y], gs.cave.depot)  // queue: the JOB
            if (p) { d.act = 'walk'; d.path = p; d.workKind = 'eat'; if (!p.length) startWork(gs, d, 'eat') }  // survives the bite
            return
        }
        d.starve++
        if (d.starve > CFG.STARVE_MAX) { die(gs, d); return }
        return
    }
    if (d.act === 'idle') {
        if ((d.carryFood || d.carryOre) && sendHome(gs, d)) { d.workKind = 'haul'; return }
        const job = claimFor(gs, d)
        if (!job) return
        if (job.job) { d.jobId = job.job.id }
        if (job.kind === 'dig') {
            const last = job.path.length ? job.path[job.path.length - 1] : [d.x, d.y]
            d.digX = job.x; d.digY = job.y
            d.tX = last[0]; d.tY = last[1]
        } else { d.tX = job.x; d.tY = job.y }
        d.workKind = job.kind
        d.path = job.path
        if (!job.path.length) startWork(gs, d, job.kind)
        else { d.act = 'walk'; d.moveIn = 0 }
        return
    }
    if (d.act === 'walk') {
        d.moveIn++
        if (d.moveIn < CFG.MOVE) return
        d.moveIn = 0
        if (!d.path || !d.path.length) { startWork(gs, d, d.workKind); return }
        const [nx, ny] = d.path.shift()
        if (!walkable(gs, idx(nx, ny))) {
            const goal = d.workKind === 'eat' || d.workKind === 'haul'
                ? gs.cave.depot : [d.tX, d.tY]
            const p = astar(gs, [d.x, d.y], goal)
            if (!p) { release(gs, d); d.act = 'idle'; d.workKind = null; return }
            d.path = p
            if (!p.length) startWork(gs, d, d.workKind)
            return
        }
        d.x = nx; d.y = ny
        if (!d.path.length) startWork(gs, d, d.workKind)
        return
    }
    if (d.act === 'work') {
        d.dwell++
        if (d.dwell >= (DWELL[d.workKind] || 1)) resolve(gs, d)
    }
}

// ------------------------------------------------------------------ depth ----
export function newDepth(gs, depth) {
    gs.cave = gen(gs.baseSeed, depth)
    gs.t0 = Uint8Array.from(gs.cave.t)
    gs.farm = new Uint8Array(W * H)
    gs.farmAge = new Uint8Array(W * H)
    gs.jobs = []
    gs.designated = []
    gs.rally = false
    gs.depth = depth
    gs.depthTick = 0
    for (let i = 0; i < W * H; i++) if (gs.cave.bush[i]) addJob(gs, 'pick', i % W, (i - (i % W)) / W)
    spawnDwarves(gs)
    gs.events.push({ type: 'depth', depth })
}

export function newRun(baseSeed = 0, opts = {}) {
    const dwarfCap = Math.max(1, CFG.DWARVES - (opts.dwarfCut || 0))
    const food0 = Math.max(0, CFG.FOOD0 - (opts.foodCut || 0))
    const gs = {
        baseSeed, tick: 0, depth: 1, depthTick: 0,
        dwarfCap, food: food0, food0, eaten: 0, harvested: 0, rotten: 0,
        ore: 0, minedOre: 0, dug: 0,
        dwarves: [], jobs: [], designated: [], nextId: 1,
        events: [], end: null, endWhy: null, farm: null, farmAge: null, cave: null, t0: null, rally: false,
    }
    newDepth(gs, 1)
    return gs
}

// -------------------------------------------------------------------- step ----
export function step(gs, input = {}) {
    gs.events = []
    if (gs.end) return gs
    gs.tick++
    gs.depthTick++
    if (input.designate) designate(gs, input.tool, input.designate[0], input.designate[1])

    for (const d of gs.dwarves) dwarfTick(gs, d)

    for (let i = 0; i < W * H; i++) {
        if (gs.farm[i] === 1) {
            gs.farmAge[i]++
            if (gs.farmAge[i] >= CFG.FARM_GROW) {
                gs.farm[i] = 2
                if (!jobAt(gs, 'pick', i % W, (i - (i % W)) / W)) addJob(gs, 'pick', i % W, (i - (i % W)) / W)
            }
        }
    }

    // rally resolves from STATE, not prose: every living dwarf ON the stairs
    const alive = gs.dwarves.filter((d) => d.alive)
    if (gs.rally && alive.length && alive.every((d) => gs.cave.t[idx(d.x, d.y)] === STAIRS)) {
        gs.events.push({ type: 'descend', depth: gs.depth, alive: alive.length })
        if (gs.depth >= CFG.MAX_DEPTH) {
            gs.end = 'win'
            gs.endWhy = `${alive.length} dwarves at the beacon`
            gs.events.push({ type: 'win', depth: gs.depth })
            return gs
        }
        for (const d of alive) { gs.food += d.carryFood; gs.ore += d.carryOre; d.carryFood = 0; d.carryOre = 0 }
        newDepth(gs, gs.depth + 1)
        return gs
    }
    if (!alive.length) {
        gs.end = 'lose'
        gs.endWhy = 'the last dwarf starved'
        gs.events.push({ type: 'lose', tick: gs.tick })
    }
    return gs
}

export function stateHash(gs) {
    const cells = []
    for (let i = 0; i < W * H; i++) {
        if (gs.cave.t[i] !== gs.t0[i] || gs.cave.bush[i] || gs.cave.ore[i] || gs.farm[i]) cells.push(`${i}:${gs.cave.t[i]}/${gs.cave.bush[i]}/${gs.cave.ore[i]}/${gs.farm[i]}`)
    }
    return [gs.tick, gs.depth, gs.food, gs.eaten, gs.harvested, gs.rotten, gs.ore, gs.minedOre, gs.dug, gs.rally ? 1 : 0, gs.end, gs.endWhy,
        gs.dwarves.map((d) => `${d.id}:${d.alive ? d.x : 'x'}/${d.alive ? d.y : 'x'}/${d.hunger}/${d.starve}/${d.act}/${d.jobId}/${d.carryFood}/${d.carryOre}`).join(';'),
        gs.jobs.map((j) => `${j.id}:${j.kind}@${j.x},${j.y}/${j.claim}`).join(';'),
        cells.join(',')].join('|')
}

export { mulberry32 }
