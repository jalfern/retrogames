// DIG DUG — the autopilot pilot. decide(gs) reads the pure sim state and
// returns one input frame; plan(seed) rolls the REAL sim forward and records
// the script. The attract demo replays this proven run, and dugcheck grades
// it (clears every round, zero deaths, lives-1 slack).
//
// Tactics, in order:
//   1. attached to an enemy  -> pump-pulse every 10 ticks; dodge sideways if
//      another solid enemy closes on the same row.
//   2. a solid enemy in line of sight inside harpoon range -> face it, fire,
//      then pump.
//   3. Fygar fire about to come down this row -> leave the row (vertical dig).
//   4. otherwise walk/dig toward the nearest enemy through the cheapest grid
//      (open tunnel costs 1, dirt costs 6, so the pilot prefers existing
//      tunnels but happily burrows when that is shorter).

import { makeGame, step } from './sim.js'
import { CELL, COLS, AIR_TOP, DIRT_BOT, layerOf } from './levels.js'

const R = 44 // harpoon reach (matches CFG.harpoonLen)
const rowOf = (y) => Math.floor((y - 16) / CELL)
const colOf = (x) => Math.floor(x / CELL)
const cx = (c) => c * CELL + CELL / 2
const cy = (r) => 16 + r * CELL + CELL / 2

function openCell(gs, r, c) {
    if (r < AIR_TOP || r > DIRT_BOT || c < 0 || c >= COLS) return false
    return !gs.dirt[r][c] && !gs.rocks.some((k) => k.state === 'held' && k.row === r && k.col === c)
}

function losClear(gs, r, c1, c2) {
    const dir = c1 < c2 ? 1 : -1
    for (let c = c1 + dir; dir > 0 ? c < c2 : c > c2; c += dir) if (!openCell(gs, r, c)) return false
    return openCell(gs, r, c1) && openCell(gs, r, c2)
}

// weighted BFS: tunnel cheap, dirt expensive; rocks block
function bestStep(gs, sr, sc, targets) {
    const key = (r, c) => r * COLS + c
    const dist = new Map()
    const from = new Map()
    const pq = [[0, sr, sc]]
    dist.set(key(sr, sc), 0)
    const goal = new Set(targets.map(([r, c]) => key(r, c)))
    const nbrs = [[0, 1, 1], [0, -1, 1], [1, 0, 3], [-1, 0, 3]]
    while (pq.length) {
        pq.sort((a, b) => a[0] - b[0])
        const [d, r, c] = pq.shift()
        if (d > (dist.get(key(r, c)) ?? Infinity)) continue
        if (goal.has(key(r, c))) {
            let k = key(r, c)
            let prev = key(r, c)
            while (from.get(k) !== undefined && from.get(k) !== key(sr, sc)) k = from.get(k)
            prev = from.get(k)
            if (from.get(k) === undefined) return null
            return { r: Math.floor(k / COLS), c: k % COLS }
        }
        for (const [dr, dc, w] of nbrs) {
            const nr = r + dr, nc = c + dc
            if (nr < AIR_TOP || nr > DIRT_BOT || nc < 0 || nc >= COLS) continue
            if (gs.rocks.some((k) => k.state === 'held' && k.row === nr && k.col === nc)) continue
            const cost = d + (gs.dirt[nr][nc] ? w + 5 : w) + (nr === 1 ? 7 : 0)
            if (cost < (dist.get(key(nr, nc)) ?? Infinity)) {
                dist.set(key(nr, nc), cost)
                from.set(key(nr, nc), key(r, c))
                pq.push([cost, nr, nc])
            }
        }
    }
    return null
}

export function decide(gs) {
    const inp = { left: false, right: false, up: false, down: false, fire: false, aim: null }
    const p = gs.player
    if (p.deadT > 0 || gs.end || gs.roundPhase !== 'play') return inp
    const pr = rowOf(p.y), pc = colOf(p.x)
    const live = gs.enemies.filter((e) => e.state !== 'gone')
    const solid = live.filter((e) => !e.ghost)

    const escapeDir = (avoid) => {
        let bestD = null, bestScore = -1
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            let score = 0
            for (let s = 1; s <= 2; s++) {
                const rr = pr + dr * s, cc = pc + dc * s
                if (openCell(gs, rr, cc)) score += 2 - s * 0.4
                else break
            }
            if (avoid) {
                const er = rowOf(avoid.y), ec = colOf(avoid.x)
                if (dr === Math.sign(er - pr)) score -= 2.5
                if (dc === Math.sign(ec - pc)) score -= 2.5
            }
            if (score > bestScore) { bestScore = score; bestD = [dr, dc] }
        }
        return bestD || [1, 0]
    }
    const press = (d) => {
        if (d[0] > 0) inp.down = true
        else if (d[0] < 0) inp.up = true
        else if (d[1] > 0) inp.right = true
        else inp.left = true
    }

    // step out of a column a rock is dropping in
    const fallingRock = gs.rocks.find((k) => (k.state === 'fall' || k.state === 'warn') && k.col === pc && cy(k.row) < p.y)
    if (fallingRock) { press(escapeDir(null)); return inp }

    // 1) pump an attached enemy; hit-and-run while pumping
    const h = gs.harpoon
    if (h && h.state === 'hold') {
        const e = gs.enemies.find((x) => x.id === h.attached)
        if (e) {
            const other = solid.find((o) => o.id !== e.id && o.stage === 0 && Math.hypot(o.x - p.x, o.y - p.y) < 52)
            if (other) press(escapeDir(other))
            if (gs.tick % 4 === 0) inp.fire = true
            return inp
        }
    }

    // 2) engage the nearest solid enemy: aim (independent of movement) and
    //    fire whenever the axis is aligned; back off whenever it gets close
    const stage0 = solid.filter((o) => o.stage === 0)
    if (stage0.length) {
        const o = stage0.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
        const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy)
        const alignedH = Math.abs(dy) < 11 && Math.abs(dx) <= R + 6 && losClear(gs, pr, pc, colOf(o.x))
        const alignedV = Math.abs(dx) < 9 && Math.abs(dy) <= R + 6 && colClear(gs, pc, pr, rowOf(o.y))
        if (alignedH) inp.aim = [Math.sign(dx), 0]
        else if (alignedV) inp.aim = [0, Math.sign(dy)]
        if (alignedH || alignedV) inp.fire = true
        if (dist < 34) press(escapeDir(o))
        else if (!inp.fire && dist < 60) press(escapeDir(o))
        if (inp.fire || dist < 60) return inp
    }

    // 3) escape imminent Fygar fire on this row
    const threat = solid.find((e) => e.kind === 'fygar' && rowOf(e.y) === pr &&
        ((e.fireT > 0 && Math.sign(e.x - p.x) === e.fireDir) ||
            (e.breathT < 80 && losClear(gs, pr, pc, colOf(e.x)) && Math.abs(e.x - p.x) < 110)))
    if (threat) {
        if (pr < DIRT_BOT) inp.down = true
        else inp.up = true
        return inp
    }

    // 4) approach nearest live enemy without ever stepping onto a solid one
    if (!live.length) return inp
    let nearest = live[0], best = Infinity
    for (const e of live) {
        const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y)
        if (d < best) { best = d; nearest = e }
    }
    const stepTo = bestStep(gs, pr, pc, [[rowOf(nearest.y), colOf(nearest.x)]])
    if (!stepTo) return inp
    const occupied = solid.some((e) => rowOf(e.y) === stepTo.r && colOf(e.x) === stepTo.c)
    if (occupied) {
        if (stepTo.r !== pr) {
            if (pc > 0 && openCell(gs, pr, pc - 1)) inp.left = true
            else if (openCell(gs, pr, pc + 1)) inp.right = true
            else { inp.up = pr < DIRT_BOT; inp.down = !inp.up }
        } else if (pr > AIR_TOP && openCell(gs, pr - 1, pc)) inp.up = true
        else if (pr < DIRT_BOT && openCell(gs, pr + 1, pc)) inp.down = true
        else { inp.left = pc > 0 && openCell(gs, pr, pc - 1); inp.right = !inp.left }
        return inp
    }
    if (stepTo.c < pc) inp.left = true
    else if (stepTo.c > pc) inp.right = true
    else if (stepTo.r < pr) inp.up = true
    else if (stepTo.r > pr) inp.down = true
    return inp
}

function colClear(gs, c, r1, r2) {
    const dir = r1 < r2 ? 1 : -1
    for (let r = r1 + dir; dir > 0 ? r < r2 : r > r2; r += dir) if (!openCell(gs, r, c)) return false
    return openCell(gs, r1, c) && openCell(gs, r2, c)
}

export function plan(seed = 0, { maxTicks = 200000, livesOverride = null, forceDeathAt = -1 } = {}) {
    const gs = makeGame(seed)
    if (livesOverride !== null) gs.lives = livesOverride
    const script = []
    let deaths = 0
    const deathsAt = []
    let lastLives = gs.lives
    while (!gs.end && script.length < maxTicks) {
        const inp = decide(gs)
        if (forceDeathAt >= 0 && script.length === forceDeathAt && deathsAt.length === 0) {
            gs.player.x = gs.enemies[0]?.x ?? gs.player.x
            gs.player.y = gs.enemies[0]?.y ?? gs.player.y
        }
        script.push(inp)
        step(gs, inp)
        if (gs.lives < lastLives) { deaths++; deathsAt.push(gs.tick); lastLives = gs.lives }
    }
    return { script, gs, deaths, ticks: script.length, won: gs.end === 'win', roundsCleared: gs.round + (gs.end === 'win' ? 1 : 0), hash: hashOf(gs) }
}

function hashOf(gs) {
    // cheap final-state digest for determinism pinning
    return JSON.stringify([gs.tick, gs.score, gs.round, gs.lives, gs.end, gs.player.x.toFixed(2), gs.kills])
}

export { layerOf }
