// DIG DUG — the autopilot pilot. decide(gs) reads the pure sim state and
// returns one input frame; plan(seed) rolls the REAL sim forward and records
// the script. The attract demo replays this proven run, and dugcheck grades
// it (clears every round, zero deaths, on every spawn rotation).
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
//
// The model IS the sim: every dodge and every approach step is scored by
// cloning the world and rolling it forward ROLLOUT ticks under the real
// step() with that move held (plus the pilot's own firing policy). Anything
// that can kill the player — a hunter rounding the tunnel corner, Fygar fire
// down the row, a rock on the column — shows up in the rollout because it is
// the game, not a model of it. The hand-drawn threat rings of v1 lost to the
// real box on six of nine spawn rotations: the flood-scored dodger walked the
// pilot into the other hunter's path because it only saw dirt.

import { makeGame, step } from './sim.js'
import { CELL, COLS, AIR_TOP, DIRT_BOT, layerOf } from './levels.js'

const R = 44 // harpoon reach (matches CFG.harpoonLen)
const ROLLOUT = 48
const rowOf = (y) => Math.floor((y - 16) / CELL)
const colOf = (x) => Math.floor(x / CELL)
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
            while (from.get(k) !== undefined && from.get(k) !== key(sr, sc)) k = from.get(k)
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

    // The pilot's firing policy, re-applied inside a rollout: pump the hooked
    // enemy on the real tick cadence, otherwise shoot the nearest aligned foe.
    const rollFire = (c) => {
        const p = c.player
        if (p.deadT > 0 || c.end) return false
        const h = c.harpoon
        if (h && h.state === 'hold') return c.tick % 4 === 0
        if (h || (c._cool || 0) > 0) return false
        const solid = c.enemies.filter((e) => e.state !== 'gone' && !e.ghost && e.stage === 0)
        if (!solid.length) return false
        let o = solid[0], bd = Infinity
        for (const e of solid) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; o = e } }
        const dx = o.x - p.x, dy = o.y - p.y
        const pr = rowOf(p.y), pc = colOf(p.x)
        const ah = Math.abs(dy) < 13 && Math.abs(dx) <= R + 6 && losClear(c, pr, pc, colOf(o.x))
        const av = Math.abs(dx) < 13 && Math.abs(dy) <= R + 6 && colClear(c, pc, pr, rowOf(o.y))
        return (ah || av) && bd >= 18
    }

    // roll the real sim forward with one movement held; death anywhere in the
    // window loses, and the earlier the death the worse the score
    const rollout = (dir) => {
        const c = structuredClone(gs)
        c.events.length = 0
        const inp = { left: false, right: false, up: false, down: false, fire: false }
        if (dir[0] > 0) inp.down = true
        else if (dir[0] < 0) inp.up = true
        else if (dir[1] > 0) inp.right = true
        else inp.left = true
        for (let k = 0; k < ROLLOUT; k++) {
            inp.fire = rollFire(c)
            step(c, inp)
            if (c.player.deadT > 0) return { died: true, score: -1e9 - k }
            if (c.end) break
            c.events.length = 0
        }
        const p = c.player
        const h = c.harpoon
        const att = h && h.state === 'hold' ? c.enemies.find((e) => e.id === h.attached) : null
        let s = (c.kills - gs.kills) * 300
        if (att) s += 20 + att.stage * 25
        let nd = Infinity
        for (const e of c.enemies) {
            if (e.state === 'gone' || e.ghost || (att && e.id === att.id)) continue
            nd = Math.min(nd, Math.hypot(e.x - p.x, e.y - p.y))
        }
        s -= Math.max(0, 60 - nd) * 2
        return { died: false, score: s }
    }
    // the surviving candidate wins; on a full-board kill-fight the direction
    // that dies last wins (it still gets its shots off)
    const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    const bestMove = () => {
        let best = DIRS[0], bs = -Infinity
        for (const d of DIRS) {
            const r = rollout(d)
            if (r.score > bs) { bs = r.score; best = d }
        }
        return best
    }
    const press = (d) => {
        if (d[0] > 0) inp.down = true
        else if (d[0] < 0) inp.up = true
        else if (d[1] > 0) inp.right = true
        else inp.left = true
    }
    // the BFS step toward a foe is the cheapest route, not the safest one: a
    // hunter can round the tunnel corner mid-step. Rollout-test the step and,
    // when it dies, fall back to the survival move.
    const guard = () => {
        const dr = inp.down ? 1 : inp.up ? -1 : 0
        const dc = inp.right ? 1 : inp.left ? -1 : 0
        if (!dr && !dc) return
        const threatened = solid.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 72) ||
            solid.some((e) => e.kind === 'fygar' && !e.ghost && rowOf(e.y) === pr && Math.abs(e.x - p.x) < 120)
        if (threatened && rollout([dr, dc]).died) {
            inp.left = false; inp.right = false; inp.up = false; inp.down = false
            press(bestMove())
        }
    }

    // step out of a column a rock is dropping in
    const fallingRock = gs.rocks.find((k) => (k.state === 'fall' || k.state === 'warn') && k.col === pc && cy(k.row) < p.y)
    if (fallingRock) { press(bestMove()); return inp }

    // 1) pump an attached enemy; hit-and-run while pumping
    const h = gs.harpoon
    if (h && h.state === 'hold') {
        const e = gs.enemies.find((x) => x.id === h.attached)
        if (e) {
            const other = solid.find((o) => o.id !== e.id && o.stage === 0 && Math.hypot(o.x - p.x, o.y - p.y) < 52)
            if (other) press(bestMove())
            if (gs.tick % 4 === 0) inp.fire = true
            return inp
        }
    }

    // 2) engage the nearest solid enemy: aim (independent of movement) and
    //    fire whenever the axis is aligned; back off when a hunter gets close,
    //    chase when it is the fleeing last survivor
    const stage0 = solid.filter((o) => o.stage === 0)
    if (stage0.length) {
        const o = stage0.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
        const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy)
        const canFire = !gs.harpoon && gs._cool === 0
        const alignedH = Math.abs(dy) < 13 && Math.abs(dx) <= R + 6 && losClear(gs, pr, pc, colOf(o.x))
        const alignedV = Math.abs(dx) < 13 && Math.abs(dy) <= R + 6 && colClear(gs, pc, pr, rowOf(o.y))
        if (alignedH) inp.aim = [Math.sign(dx), 0]
        else if (alignedV) inp.aim = [0, Math.sign(dy)]
        const shooting = (alignedH || alignedV) && canFire && dist >= 18
        if (shooting) inp.fire = true
        if (o.flee) {
            // run it down: chase horizontally, climb to its row when aligned in column
            if (!shooting) {
                if (Math.abs(dx) > 10) { if (dx > 0) inp.right = true; else inp.left = true }
                else if (dy < 0 && pr > AIR_TOP) inp.up = true
                else if (dy > 0 && pr < DIRT_BOT) inp.down = true
            }
            guard()
            return inp
        }
        if (dist < 34) press(bestMove())
        else if (!shooting && dist < 60) press(bestMove())
        if (shooting || dist < 60) return inp
    }

    // 3) escape imminent Fygar fire on this row
    const threat = solid.find((e) => e.kind === 'fygar' && rowOf(e.y) === pr &&
        ((e.fireT > 0 && Math.sign(e.x - p.x) === e.fireDir) ||
            (e.breathT < 80 && losClear(gs, pr, pc, colOf(e.x)) && Math.abs(e.x - p.x) < 110)))
    if (threat) {
        press(bestMove())
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
        guard()
        return inp
    }
    if (stepTo.c < pc) inp.left = true
    else if (stepTo.c > pc) inp.right = true
    else if (stepTo.r < pr) inp.up = true
    else if (stepTo.r > pr) inp.down = true
    guard()
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
