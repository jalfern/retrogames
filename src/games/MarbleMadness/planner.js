// MARBLE MADNESS — autopilot. BFS over the walkable tile graph (acid, green
// slinkies and muncher mouths blocked; hammer rows are timing gates, not
// terrain), then live steering through real step(): iso input inversion,
// latched edge-braking with hysteresis, steelie avoidance and commit-to-stop
// hammer waits. plan() runs the whole six-race campaign and returns the
// tick-by-tick input script the attract mode replays; scripts/marblecheck.mjs
// audits that same script hash-for-hash.

import { makeGame, step, stepOk, CFG } from './sim.js'

const WAYS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
]

function blockedCell(gs, r, c) {
    for (const s of gs.slinkies) if (s.r === r && s.c === c) return true
    for (const m of gs.munchers) if (m.r === r && m.c === c) return true
    for (const h of gs.hammers) {
        // the head sweeps a band a row deep on either side of the pivot row
        if (Math.abs(h.r - r) <= 1 && Math.abs(h.c + 0.5 - (c + 0.5)) <= CFG.hammerReach + CFG.hammerR) return true
    }
    return false
}

export function bfsPath(gs, sr, sc, tr, tc) {
    if (!gs.heights[sr] || gs.heights[sr][sc] < 0) return []
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([`${sr},${sc}`])
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            const path = []
            let k = `${r},${c}`
            while (k !== `${sr},${sc}`) {
                path.unshift(k.split(',').map(Number))
                k = prev.get(k)
            }
            return path
        }
        for (const [dr, dc] of WAYS) {
            const nr = r + dr, nc = c + dc
            const key = `${nr},${nc}`
            if (seen.has(key) || !stepOk(gs, r, c, nr, nc)) continue
            if (blockedCell(gs, nr, nc) && !(nr === tr && nc === tc)) continue
            seen.add(key); prev.set(key, `${r},${c}`); q.push([nr, nc])
        }
    }
    return []
}

const worldToScreen = (wx, wy) => [6 * (wx - wy), 3 * (wx + wy)]

function press(vx, vy) {
    const o = { left: false, right: false, up: false, down: false }
    if (vx < -0.5) o.left = true
    if (vx > 0.5) o.right = true
    if (vy < -0.5) o.up = true
    if (vy > 0.5) o.down = true
    return o
}

export function decide(gs) {
    const out = { left: false, right: false, up: false, down: false }
    const m = gs.m
    if (gs.phase !== 'play' || m.air) return out
    if (!gs._path || !gs._path.length || gs._pathRace !== gs.raceIdx || gs._pathT <= 0 ||
        Math.hypot(m.x - (gs._path[0][1] + 0.5), m.y - (gs._path[0][0] + 0.5)) > 3.5) {
        gs._path = bfsPath(gs, Math.floor(m.y), Math.floor(m.x), gs.race.goal.r, gs.race.goal.c)
        gs._pathRace = gs.raceIdx
        gs._pathT = 22
    }
    gs._pathT--
    if (!gs._path.length) return out

    // steer target a few cells down the path
    const wpCell = gs._path[Math.min(gs._path.length - 1, 4)]
    const dx = wpCell[1] + 0.5 - m.x, dy = wpCell[0] + 0.5 - m.y
    const dl = Math.hypot(dx, dy) || 1
    let sx = dx / dl, sy = dy / dl

    // dodge the steelie: its knock pushes off cliffs, so treat it as moving terrain
    for (const s of gs.steelies) {
        const sdx = m.x - s.x, sdy = m.y - s.y
        const sd = Math.hypot(sdx, sdy)
        if (sd < 2.4 && sd > 0.01) { sx += (sdx / sd) * 0.9; sy += (sdy / sd) * 0.9 }
    }
    const nl = Math.hypot(sx, sy) || 1
    sx /= nl; sy /= nl

    // edge raycast with a latched brake: engage close, release with a margin,
    // and while braking press "turn into the open" — one uniform vector, so
    // brake and steer can never limit-cycle against each other.
    const sp = Math.hypot(m.vx, m.vy)
    const sl = Math.hypot(sx, sy) || 1
    const ux = sx / sl
    const uy = sy / sl
    const scan = (reach) => {
        let prevR = Math.floor(m.y), prevC = Math.floor(m.x)
        for (let d = 0.5; d <= reach; d += 0.5) {
            const pr = Math.floor(m.y + uy * d), pc = Math.floor(m.x + ux * d)
            if (pr === prevR && pc === prevC) continue
            if (!stepOk(gs, prevR, prevC, pr, pc) || blockedCell(gs, pr, pc)) return [pr, pc]
            prevR = pr; prevC = pc
        }
        return null
    }
    const ahead = Math.min(9, 2.2 + sp * 42)
    let hit = null
    if (gs._brake) hit = scan(Math.max(4.5, ahead))
    else hit = scan(ahead)
    gs._brake = !!hit
    if (hit) {
        // steer away from the blocker we can see, blended with the path target
        const bx = hit[1] + 0.5 - m.x, by = hit[0] + 0.5 - m.y
        const bd = Math.hypot(bx, by) || 1
        sx = sx * 0.9 - (bx / bd) * 1.5
        sy = sy * 0.9 - (by / bd) * 1.5
        if (sp > 0.05) { sx -= ux * 0.6; sy -= uy * 0.6 } // and scrub the speed
    }

    const [ix, iy] = worldToScreen(sx, sy)
    return press(ix, iy)
}

export function plan(seed = 0, opts = {}) {
    const maxTicks = opts.maxTicks || 60 * 60 * 8
    const gs = makeGame(seed)
    const script = []
    let deaths = 0
    for (let t = 0; t < maxTicks; t++) {
        if (gs.end) break
        if (gs.phase === 'dying' && gs.phaseT === CFG.deathT) deaths++
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
    }
    return { won: gs.end === 'win', script, deaths, ticks: gs.tick, score: gs.score, races: gs.clears }
}
