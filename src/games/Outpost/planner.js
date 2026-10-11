// OUTPOST — the greedy autopilot. plan(seed) drives the SAME step() the
// player rides: every tick it reads the live state and posts the designations
// a good foreman would: plots first, then the tunnel — the rock front that
// 0-1-BFS through stone says is shortest to the beacon — then the rally once
// the stairs see daylight. Its proven run IS the attract demo, tick for tick,
// and it is what the SLACK RULE re-runs with one fewer dwarf and one fewer
// ration. No dice, no cheating: only the input vocabulary the player has.

import { W, H, ROCK, FLOOR, STAIRS } from './cave.js'
import { CFG, newRun, step } from './sim.js'

const idx = (x, y) => y * W + x
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function flood(t, start) {
    const seen = new Set([idx(start[0], start[1])])
    const q = [idx(start[0], start[1])]
    while (q.length) {
        const i = q.shift()
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of N4) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const ni = idx(nx, ny)
            if (seen.has(ni) || t[ni] === ROCK) continue
            seen.add(ni); q.push(ni)
        }
    }
    return seen
}

// 0-1 BFS through stone: floor costs 0, rock costs 1. dist[i] = how many
// pick-strokes from cell i to the beacon. The tunnel front is the ROCK cell
// adjacent to open floor with the smallest dist — the honest shortest dig.
export function rockDist(gs, goal) {
    const gi = idx(goal[0], goal[1])
    const dist = new Array(W * H).fill(Infinity)
    dist[gi] = gs.cave.t[gi] === ROCK ? 1 : 0
    const deq = [gi]
    while (deq.length) {
        const i = deq.shift()
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of N4) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const ni = idx(nx, ny)
            const nd = dist[i] + (gs.cave.t[ni] === ROCK ? 1 : 0)
            if (nd < dist[ni]) {
                dist[ni] = nd
                if (gs.cave.t[ni] === ROCK) deq.push(ni); else deq.unshift(ni)
            }
        }
    }
    return dist
}

export function decide(gs) {
    const reach = flood(gs.cave.t, gs.cave.spawn)
    if (gs.cave.t[idx(gs.cave.stairs[0], gs.cave.stairs[1])] === STAIRS && !reach.has(idx(gs.cave.stairs[0], gs.cave.stairs[1])) && !gs.rally) {
        // stairs exist but the beacon room is still sealed until one more dig
    }
    // 1. plots: farms are the only renewable food; keep the count up
    const target = 2 + gs.depth
    let farms = 0
    for (let i = 0; i < W * H; i++) if (gs.farm[i]) farms++
    const farmJobs = gs.jobs.filter((j) => j.kind === 'farm').length
    if (farms + farmJobs < target) {
        const cands = []
        for (let i = 0; i < W * H; i++) {
            if (!reach.has(i) || gs.cave.t[i] !== FLOOR || gs.cave.bush[i] || gs.farm[i]) continue
            const x = i % W, y = (i - x) / W
            if ((x === gs.cave.depot[0] && y === gs.cave.depot[1]) || (x === gs.cave.spawn[0] && y === gs.cave.spawn[1])) continue
            if (gs.jobs.some((j) => j.kind === 'farm' && j.x === x && j.y === y)) continue
            cands.push([i, x, y])
        }
        cands.sort((a, b) => {
            const da = Math.abs((a[1] - gs.cave.depot[0])) + Math.abs((a[2] - gs.cave.depot[1]))
            const db = Math.abs((b[1] - gs.cave.depot[0])) + Math.abs((b[2] - gs.cave.depot[1]))
            return da - db || a[0] - b[0]
        })
        if (cands.length) return { tool: 'farm', designate: [cands[0][1], cands[0][2]] }
    }
    // 2. rally when the colony can stand on the beacon
    const si = idx(gs.cave.stairs[0], gs.cave.stairs[1])
    if (!gs.rally && gs.cave.t[si] === STAIRS && reach.has(si)) {
        return { tool: 'rally', designate: [gs.cave.stairs[0], gs.cave.stairs[1]] }
    }
    // 3. the tunnel: designate the shortest rock front, keep the queue fed
    if (!gs.rally) {
        const digJobs = gs.jobs.filter((j) => j.kind === 'dig').length
        if (digJobs < gs.dwarfCap - 1) {
            const dist = rockDist(gs, gs.cave.stairs)
            let best = null, bestScore = Infinity
            for (let i = 0; i < W * H; i++) {
                if (gs.cave.t[i] !== ROCK || dist[i] === Infinity) continue
                const x = i % W, y = (i - x) / W
                if (!N4.some(([dx, dy]) => reach.has(idx(x + dx, y + dy)))) continue
                if (gs.jobs.some((j) => j.kind === 'dig' && j.x === x && j.y === y)) continue
                const score = dist[i] * 1000 + i
                if (score < bestScore) { bestScore = score; best = [x, y] }
            }
            if (best) return { tool: 'dig', designate: best }
        }
    }
    return {}
}

export function plan(baseSeed = 0, opts = {}) {
    const maxTicks = opts.maxTicks || 60 * 60 * 12   // 12 game-minutes per depth-set budget
    const gs = opts.from || newRun(baseSeed, opts)
    const script = opts.script || []
    const startTick = gs.tick
    while (!gs.end && gs.tick - startTick < maxTicks) {
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
    }
    const alive = gs.dwarves.filter((d) => d.alive).length
    return {
        ok: gs.end === 'win',
        script,
        receipts: {
            why: gs.endWhy, depth: gs.depth, alive,
            ore: gs.ore, eaten: gs.eaten, dug: gs.dug,
            rotten: gs.rotten, harvested: gs.harvested, food0: gs.food0,
            ticks: gs.tick,
        },
    }
}

// drive an existing state with the autopilot for N ticks (DebugKit prognosis
// + harness helpers). Mutates gs — callers pass a clone if they must not.
export function autopilot(gs, maxTicks = 60 * 60 * 6) {
    const t0 = gs.tick
    while (!gs.end && gs.tick - t0 < maxTicks) step(gs, decide(gs))
    return gs
}
