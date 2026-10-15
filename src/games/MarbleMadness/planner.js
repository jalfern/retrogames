// MARBLE MADNESS — autopilot. BFS over the walkable tile graph (acid, green
// slinkies and muncher mouths blocked; a hammer only threatens the row it
// sweeps — its strike radius is smaller than the row pitch, so adjacent rows
// are honest ground, not terrain walls). Live steering through real step():
// the target is a point a constant ARC LENGTH ahead on the BFS polyline, and
// the brake latches on the ray along ACTUAL VELOCITY (plus a short ray along
// the steer vector for corners), so brake and steer never fight each other at
// bottleneck turns. plan() runs the whole six-race campaign and returns the
// tick-by-tick input script the attract mode replays; scripts/marblecheck.mjs
// audits that same script hash-for-hash.

import { makeGame, step, stepOk, CFG } from './sim.js'

const WAYS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
]

function blockedCell(gs, r, c, steel) {
    if (steel) for (const st of gs.steelies) if (Math.hypot(st.x - (c + 0.5), st.y - (r + 0.5)) < 1.3) return true
    for (const s of gs.slinkies) if (s.r === r && s.c === c) return true
    for (const m of gs.munchers) if (m.r === r && m.c === c) return true
    for (const h of gs.hammers) {
        // hy is pinned to the pivot row and hammerR < 0.5, so the sweep can
        // only ever touch the pivot row itself
        if (h.r === r && Math.abs(h.c - c) < CFG.hammerReach + CFG.hammerR) return true
    }
    return false
}

export function bfsPath(gs, sr, sc, tr, tc, steel, maxStep = 2) {
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
            if (seen.has(key) || !stepOk(gs, r, c, nr, nc) || Math.abs(gs.heights[nr][nc] - gs.heights[r][c]) > maxStep) continue
            if (blockedCell(gs, nr, nc, steel) && !(nr === tr && nc === tc)) continue
            seen.add(key); prev.set(key, `${r},${c}`); q.push([nr, nc])
        }
    }
    return []
}

// the sim reconstructs world acceleration from key combos (screenToWorld in
// sim.js), so the achievable push directions are the 4 cardinals and 4
// diagonals of TILE space. Quantize the desired vector onto that octagon by
// max-dot — an anisotropic screen projection is NOT the inverse mapping and
// silently flips the sign of the lateral component at lips.
const KEYS = [
    { dx: 1, dy: 0, k: ['right', 'down'] },
    { dx: 0.707, dy: 0.707, k: ['down'] },
    { dx: 0, dy: 1, k: ['left', 'down'] },
    { dx: -0.707, dy: 0.707, k: ['left'] },
    { dx: -1, dy: 0, k: ['left', 'up'] },
    { dx: -0.707, dy: -0.707, k: ['up'] },
    { dx: 0, dy: -1, k: ['right', 'up'] },
    { dx: 0.707, dy: -0.707, k: ['right'] },
]

function press(vx, vy) {
    const o = { left: false, right: false, up: false, down: false }
    const n = Math.hypot(vx, vy)
    if (n < 1e-6) return o
    let best = KEYS[0], bd = -Infinity
    for (const key of KEYS) {
        const d = (key.dx * vx + key.dy * vy) / n
        if (d > bd) { bd = d; best = key }
    }
    for (const k of best.k) o[k] = true
    return o
}

// distance along unit ray (x,y)+u*(ux,uy) until the tile sequence leaves
// walkable ground; Infinity when clear for `reach`. The coarse 0.25 walk is
// bisected at the transition so a lip registers at its TRUE distance — the
// brake budget is often <0.5 tile and quantization there is lethal.
function blockedStep(gs, r1, c1, r2, c2) {
    return !stepOk(gs, r1, c1, r2, c2) || blockedCell(gs, r2, c2)
}

function rayToBlock(gs, x, y, ux, uy, reach) {
    const at = (d) => [Math.floor(y + uy * d), Math.floor(x + ux * d)]
    let prevR = Math.floor(y), prevC = Math.floor(x)
    for (let d = 0.25; d <= reach; d += 0.25) {
        const [pr, pc] = at(d)
        if (pr === prevR && pc === prevC) continue
        if (blockedStep(gs, prevR, prevC, pr, pc)) {
            let lo = d - 0.25, hi = d
            for (let i = 0; i < 8; i++) {
                const mid = (lo + hi) / 2
                const [mr, mc] = at(mid)
                if (mr === prevR && mc === prevC) lo = mid
                else if (blockedStep(gs, prevR, prevC, mr, mc)) hi = mid
                else { lo = mid; prevR = mr; prevC = mc }
            }
            return hi
        }
        prevR = pr; prevC = pc
    }
    return Infinity
}

export function decide(gs) {
    const out = { left: false, right: false, up: false, down: false }
    const m = gs.m
    if (gs.phase !== 'play' || m.air) return out
    if (!gs._path || !gs._path.length || gs._pathRace !== gs.raceIdx || gs._pathT <= 0 ||
        Math.hypot(m.x - (gs._path[0][1] + 0.5), m.y - (gs._path[0][0] + 0.5)) > 3.5) {
        const pr = Math.floor(m.y), pc = Math.floor(m.x)
        const fresh = bfsPath(gs, pr, pc, gs.race.goal.r, gs.race.goal.c, true, 1)
            || bfsPath(gs, pr, pc, gs.race.goal.r, gs.race.goal.c, true, 2)
            || bfsPath(gs, pr, pc, gs.race.goal.r, gs.race.goal.c, false, 1)
            || bfsPath(gs, pr, pc, gs.race.goal.r, gs.race.goal.c, false, 2)
        // a transient block (steelie idling in a doorway) must never freeze the
        // pilot — an old route beats no route
        if (fresh.length || !gs._path || !gs._path.length) gs._path = fresh
        gs._pathRace = gs.raceIdx
        gs._pathT = 22
    }
    gs._pathT--
    if (!gs._path.length) return out

    // polyline with cumulative arc length, anchored at the marble's own cell
    const pts = [[m.x, m.y], ...gs._path.map(([r, c]) => [c + 0.5, r + 0.5])]
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const total = cum[cum.length - 1]

    const sp = Math.hypot(m.vx, m.vy)

    // the straight CHORD to a far lead point can cut across a void corner, so
    // walk the polyline and clamp the target to the last vertex the chord from
    // the marble can actually reach on foot
    const lead = clampNum(2.4 + sp * 18, 2.4, Math.max(2.4, total))
    let tx = pts[pts.length - 1][0], ty = pts[pts.length - 1][1]
    for (let i = 1; i < pts.length; i++) {
        const ddx = pts[i][0] - m.x, ddy = pts[i][1] - m.y
        const dd = Math.hypot(ddx, ddy)
        if (dd > 0.05 && rayToBlock(gs, m.x, m.y, ddx / dd, ddy / dd, dd) < dd - 0.1) break
        tx = pts[i][0]; ty = pts[i][1]
        if (cum[i] >= lead) {
            const j = i - 1
            const sdx = pts[i][0] - pts[j][0], sdy = pts[i][1] - pts[j][1]
            const seg = Math.hypot(sdx, sdy) || 1
            const f = clampNum((lead - cum[j]) / seg, 0, 1)
            const px = pts[j][0] + sdx * f, py = pts[j][1] + sdy * f
            const pdx = px - m.x, pdy = py - m.y
            const pd = Math.hypot(pdx, pdy)
            if (pd > 0.05 && rayToBlock(gs, m.x, m.y, pdx / pd, pdy / pd, pd) < pd - 0.1) break
            tx = px; ty = py
            break
        }
    }
    let sx = tx - m.x, sy = ty - m.y
    const sl0 = Math.hypot(sx, sy) || 1
    sx /= sl0; sy /= sl0

    // dodge the steelie: its knock pushes off cliffs, so treat it as moving
    // terrain — dodge early and hard, harder the closer it gets
    for (const s of gs.steelies) {
        const sdx = m.x - s.x, sdy = m.y - s.y
        const sd = Math.hypot(sdx, sdy)
        if (sd < 3.0 && sd > 0.01) { const w = (3.0 - sd) * 0.9; sx += (sdx / sd) * w; sy += (sdy / sd) * w }
    }
    const nl = Math.hypot(sx, sy) || 1
    sx /= nl; sy /= nl

    // if the composed steer heads off a lip, swing it toward the nearest
    // heading with ground under it — humans slide ALONG a cliff, not into it
    if (rayToBlock(gs, m.x, m.y, sx, sy, 1.5) < 1.5) {
        const a = Math.atan2(sy, sx)
        let bestX = sx, bestY = sy
        let best = rayToBlock(gs, m.x, m.y, sx, sy, 3)
        for (const da of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
            const ux = Math.cos(a + da), uy = Math.sin(a + da)
            const score = rayToBlock(gs, m.x, m.y, ux, uy, 3) - Math.abs(da) * 0.5
            if (score > best) { best = score; bestX = ux; bestY = uy }
        }
        sx = bestX; sy = bestY
    }

    // latched edge brake: the stop distance is swept along ACTUAL velocity and
    // along the steer chord — both rays overfly the lip they were aimed at, so
    // cornering near a void trips the brake before momentum does the killing.
    // Release needs a clear margin, so the latch never chatters with the steer.
    const stopD = 0.1 + sp * 6 + sp * sp * 12
    const margin = gs._brake ? 1.5 : 0
    const vhatX = sp > 0.02 ? m.vx / sp : sx
    const vhatY = sp > 0.02 ? m.vy / sp : sy
    const d = Math.min(rayToBlock(gs, m.x, m.y, vhatX, vhatY, stopD + margin),
        rayToBlock(gs, m.x, m.y, sx, sy, stopD + margin))
    if (gs._brake) gs._brake = sp >= 0.025 && d <= stopD + 1.5
    else gs._brake = sp >= 0.025 && d < stopD

    let dx = sx, dy = sy
    if (gs._brake) {
        // hard brake against momentum; steer only with the component of the
        // path direction PERPENDICULAR to velocity — a steer term pointing
        // along the braked axis would push straight into the lip it just saw
        const sPar = sx * vhatX + sy * vhatY
        dx = -vhatX + (sx - sPar * vhatX) * 0.8
        dy = -vhatY + (sy - sPar * vhatY) * 0.8
    }

    return press(dx, dy)
}

function clampNum(v, a, b) { return v < a ? a : v > b ? b : v }

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
