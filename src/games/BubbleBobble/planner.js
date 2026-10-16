// BUBBLE BOBBLE — the autopilot pilot. decide(gs, i) reads the pure sim and
// returns one input frame for player i; plan(seed) rolls the REAL sim forward
// and records the script. The attract demo replays this proven run, and
// bobcheck grades it.
//
// Movement rides a graph the harness audits too (graphOf, exported): nodes are
// stand cells (platform rows + the floor), edges are walks, falls,
// drop-throughs and two-row jumps — the same verbs the sim obeys. No ladders:
// the arcade has none, and the levels are generated so the jump chain reaches
// every row.
//
// Tactics, in order: dodge a close free enemy, pop the nearest trapped bubble,
// grab nearby loot (letters and lightning first), otherwise close on the
// nearest enemy and blow a bubble when the row lines up; when the door is open
// it walks in.

import { makeGame, step, clone } from './sim.js'
import { CELL, COLS, W, H, FIELD_Y0, FLOOR_ROW, isBossLevel } from './levels.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const platTop = (row) => FIELD_Y0 + row * CELL
const stand = (lv, r, c) => c >= 0 && c < COLS && (r === FLOOR_ROW || lv.platforms.some((p) => p.row === r && c >= p.c0 && c <= p.c1))
const rowFeet = (y) => Math.round((y - FIELD_Y0) / CELL)

export function graphOf(lv) {
    if (lv._g) return lv._g
    const edges = new Map()
    const add = (a, b) => {
        if (!edges.has(a)) edges.set(a, new Set())
        edges.get(a).add(b)
    }
    const key = (r, c) => r * 100 + c
    for (let r = 1; r <= FLOOR_ROW; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!stand(lv, r, c)) continue
            if (stand(lv, r, c + 1)) { add(key(r, c), key(r, c + 1)); add(key(r, c + 1), key(r, c)) }
            for (let r2 = r + 1; r2 <= FLOOR_ROW; r2++) {
                if (stand(lv, r2, c)) { add(key(r, c), key(r2, c)); add(key(r2, c), key(r, c)); break }
            }
            for (const dr of [-1, -2]) {
                for (let dc = -2; dc <= 2; dc++) {
                    const r2 = r + dr, c2 = c + dc
                    if (r2 >= 1 && stand(lv, r2, c2)) add(key(r, c), key(r2, c2))
                }
            }
        }
    }
    lv._g = { edges, key }
    return lv._g
}

function bfsPath(gs, sr, sc, tr, tc) {
    const { edges, key } = graphOf(gs.lv)
    const start = key(sr, sc), goal = key(tr, tc)
    if (!edges.has(start) || !edges.has(goal)) return null
    const prev = new Map([[start, null]])
    const q = [start]
    while (q.length) {
        const k = q.shift()
        if (k === goal) {
            const path = []
            let x = k
            while (x !== null && x !== start) { path.unshift(x); x = prev.get(x) }
            return path
        }
        for (const n of edges.get(k) || []) if (!prev.has(n)) { prev.set(n, k); q.push(n) }
    }
    return null
}

const INP = () => ({ left: false, right: false, up: false, down: false, fire: false })

export function decide(gs, idx = 0) {
    const inp = INP()
    const p = gs.players[idx]
    if (!p || p.deadT > 0 || gs.end || gs.levelPhase !== 'play') return inp
    const pr = clamp(rowFeet(p.y + 8), 1, FLOOR_ROW)
    const pc = clamp(Math.floor(p.x / CELL), 0, COLS - 1)
    const free = gs.enemies.filter((e) => e.state !== 'trap')
    const threats = [...free, ...gs.blubbas]

    // 1) BARON VON BLUBBA is unkillable and faster than a walk — when he is on
    //    screen and the door is open, the door is the only answer (the
    //    arcade's own pressure): rollout every direction and take the one
    //    that survives AND gains the most ground on the door
    if (gs.blubbas.length && gs.door.open) {
        const candidates = []
        for (const cx2 of [-1, 0, 1]) {
            for (const cy2 of [-1, 0, 1]) {
                if (cy2 > 0 && p.onGround && p.y + 8 < H - 2) continue // never drop through our own platform
                if (cy2 < 0 && !p.onGround) continue // no jump in mid-air
                candidates.push({ left: cx2 < 0, right: cx2 > 0, up: cy2 < 0, down: cy2 > 0, fire: false })
            }
        }
        let bestIn = null, bestScore = -Infinity
        for (const cand of candidates) {
            const c = clone(gs)
            let score = 0
            let died = false
            for (let k = 0; k < 30; k++) {
                step(c, [cand])
                const cp = c.players[idx]
                if (!cp || cp.deadT > 0 || c.end) { died = true; score = k - 1000; break }
                if (k % 9 === 8) {
                    let d = Infinity
                    for (const e of c.enemies) d = Math.min(d, Math.hypot(e.x - cp.x, e.y - cp.y))
                    for (const bb of c.blubbas) d = Math.min(d, Math.hypot(bb.x - cp.x, bb.y - cp.y))
                    const toDoor = Math.hypot(c.door.x - cp.x, c.door.y - cp.y)
                    score += 1.5 * Math.min(d, 60) - 0.5 * toDoor
                }
            }
            if (!died && score > bestScore) { bestScore = score; bestIn = cand }
        }
        if (bestIn) return bestIn
        steer(gs, p, pr, pc, clamp(rowFeet(gs.door.y + 12), 1, FLOOR_ROW), Math.floor(gs.door.x / CELL), inp)
        return inp
    }

    // 2) dodge by rolling the REAL sim forward per candidate input (the Spy
    //    Hunter lesson: hand-drawn threat models lose to the actual box) —
    //    keep the candidate that survives longest and stays far from enemies
    const near = threats.filter((t) => Math.hypot(t.x - p.x, t.y - p.y) < 52)
    if (near.length) {
        const candidates = []
        for (const cx2 of [-1, 0, 1]) {
            for (const cy2 of [-1, 0, 1]) {
                if (cx2 === 0 && cy2 === 0) continue
                if (cy2 > 0 && p.onGround && p.y + 8 < H - 2) continue // never drop through our own platform
                if (cy2 < 0 && !p.onGround) continue // no jump in mid-air
                candidates.push({ left: cx2 < 0, right: cx2 > 0, up: cy2 < 0, down: cy2 > 0, fire: false })
            }
        }
        const t0 = near.sort((a, b2) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b2.x - p.x, b2.y - p.y))[0]
        if (gs.bubbles.filter((b) => b.owner === p.id).length === 0 && Math.abs(t0.y - p.y) < 12 && t0.state !== 'boss') {
            candidates.push({ left: t0.x < p.x, right: t0.x > p.x, up: false, down: false, fire: true })
        }
        let bestIn = null, bestScore = -Infinity
        for (const cand of candidates) {
            const c = clone(gs)
            let score = 0
            let died = false
            for (let k = 0; k < 30; k++) {
                step(c, [cand])
                const cp = c.players[idx]
                if (!cp || cp.deadT > 0 || c.end) { died = true; score = k - 1000; break }
                if (k % 10 === 9) {
                    let d = Infinity
                    for (const e of c.enemies) d = Math.min(d, Math.hypot(e.x - cp.x, e.y - cp.y))
                    for (const bb of c.blubbas) d = Math.min(d, Math.hypot(bb.x - cp.x, bb.y - cp.y))
                    score += Math.min(d, 60)
                }
            }
            if (!died && cand.fire) score += 2 // a bubble in the road beats an empty dodge
            if (score > bestScore) { bestScore = score; bestIn = cand }
        }
        if (bestIn) return bestIn
    }

    // 3) pop a trapped bubble: hop when it hovers just above, steer under it
    //    when it is high, walk into it when level
    const trapped = gs.bubbles.filter((b) => b.trapped)
    if (trapped.length) {
        const b = trapped.sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0]
        const dx = b.x - p.x, dy = b.y - p.y
        if (Math.abs(dx) < 15 && dy < -8 && dy > -64) { inp.up = true; return inp }
        if (Math.abs(dx) < 15 && dy >= -8 && dy < 13) { if (dx > 0) inp.right = true; else if (dx < 0) inp.left = true; return inp }
        const bc = clamp(Math.floor(b.x / CELL), 0, COLS - 1)
        const rows = []
        for (let r = 1; r <= FLOOR_ROW; r++) if (stand(gs.lv, r, bc) && platTop(r) - 8 >= b.y - 18) rows.push(r)
        const tr = rows.length ? rows[0] : clamp(Math.floor(b.y / CELL), 1, FLOOR_ROW)
        steer(gs, p, pr, pc, tr, bc, inp)
        return inp
    }

    // 4) loot when close (letters and lightning outrank fruit)
    const rank = { lightning: 0, letter: 1, power: 2, fruit: 3 }
    const loot = gs.items.filter((it) => Math.hypot(it.x - p.x, it.y - p.y) < 90 && !gs.blubbas.length)
    if (loot.length) {
        const it = loot.sort((a, b) => rank[a.kind] - rank[b.kind] || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
        steer(gs, p, pr, pc, clamp(rowFeet(it.y + 6), 1, FLOOR_ROW), Math.floor(it.x / CELL), inp)
        return inp
    }

    // 5) door first if open
    if (gs.door.open) {
        steer(gs, p, pr, pc, clamp(rowFeet(gs.door.y + 12), 1, FLOOR_ROW), Math.floor(gs.door.x / CELL), inp)
        return inp
    }

    // 6) engage nearest enemy: line up and blow
    if (free.length) {
        const e = free.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
        const targetRow = e.state === 'walk' ? clamp(e.span.row, 1, FLOOR_ROW) : clamp(rowFeet(e.y + 8), 1, FLOOR_ROW)
        // fire whenever roughly aligned horizontally
        if (Math.abs(e.y - p.y) < 14 && Math.abs(e.x - p.x) < 130 && !gs.bubbles.some((b) => b.owner === p.id)) {
            if (e.x > p.x) { inp.right = true; inp.fire = true }
            else { inp.left = true; inp.fire = true }
            return inp
        }
        steer(gs, p, pr, pc, targetRow, clamp(Math.floor(e.x / CELL), 0, COLS - 1), inp)
        return inp
    }
    return inp
}

function steer(gs, _p, pr, pc, tr, tc, inp) {
    if (pr === tr && Math.abs(pc - tc) <= 1 && (tc === pc || stand(gs.lv, pr, tc))) {
        if (tc > pc) inp.right = true
        else if (tc < pc) inp.left = true
        return
    }
    const path = bfsPath(gs, pr, pc, tr, tc)
    if (!path) {
        if (tc > pc) inp.right = true
        else if (tc < pc) inp.left = true
        return
    }
    const [nk] = path
    const nr = Math.floor(nk / 100), nc = nk % 100
    if (nr === pr) {
        if (nc > pc) inp.right = true
        else if (nc < pc) inp.left = true
        return
    }
    // vertical leg: jump up (with lateral drift) or drop down
    if (nr < pr) {
        inp.up = true
        if (nc > pc) inp.right = true
        else if (nc < pc) inp.left = true
    } else {
        if (nc !== pc) { if (nc > pc) inp.right = true; else inp.left = true }
        else inp.down = true
    }
}

export function plan(seed = 0, { players = 1, maxTicks = 120000, stopAtLevel = null, livesOverride = null } = {}) {
    const gs = makeGame(seed, { players })
    if (livesOverride !== null) gs.lives = livesOverride
    const script = []
    let deaths = 0
    let lastLives = gs.lives
    while (!gs.end && script.length < maxTicks) {
        const inputs = gs.players.map((pl, i) => decide(gs, i))
        script.push(players === 1 ? inputs[0] : inputs)
        step(gs, inputs)
        if (gs.lives < lastLives) { deaths++; lastLives = gs.lives }
        if (stopAtLevel !== null && gs.level >= stopAtLevel && gs.levelPhase === 'clear') break
    }
    return {
        script, gs, deaths, ticks: script.length,
        won: gs.end === 'win',
        levelsCleared: gs.level + (gs.end === 'win' ? 1 : gs.levelPhase === 'clear' ? 1 : 0),
        hash: hashOf(gs),
    }
}

function hashOf(gs) {
    return JSON.stringify([gs.tick, gs.score, gs.level, gs.lives, gs.kills, gs.end, gs.players[0]?.x.toFixed(2)])
}

export { isBossLevel }
