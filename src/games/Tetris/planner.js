// TETRIS (NES) — the autopilot. The SAME module drives the attract demo and
// scripts/tetrischeck.mjs, so the demo is the proof replayed, not theatre.
// Deterministic: no Math.random; ties break by candidate order.

import { SHAPES, COLS, ROWS, fits } from './sim.js'

function cellsAfter(type, rot, x, y) {
    return SHAPES[type][rot].map(([r, c]) => [y + r, x + c])
}

export function landingY(s, type, rot, x) {
    let y = 0
    if (!fits(s, type, rot, x, y)) return null
    while (fits(s, type, rot, x, y + 1)) y++
    return y
}

function boardAfter(s, type, rot, x, y) {
    const b = s.board.slice()
    for (const [r, c] of cellsAfter(type, rot, x, y)) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) b[r * COLS + c] = type + 1
    }
    let cleared = 0
    for (let r = ROWS - 1; r >= 0; r--) {
        let full = true
        for (let c = 0; c < COLS; c++) if (!b[r * COLS + c]) { full = false; break }
        if (full) {
            cleared++
            for (let rr = r; rr > 0; rr--) b.copyWithin(rr * COLS, (rr - 1) * COLS, rr * COLS)
            b.fill(0, 0, COLS)
            r++
        }
    }
    return { b, cleared }
}

function evaluate(b, cleared) {
    const heights = new Array(COLS).fill(0)
    let holes = 0
    for (let c = 0; c < COLS; c++) {
        let seen = false
        for (let r = 0; r < ROWS; r++) {
            if (b[r * COLS + c]) {
                if (!seen) { seen = true; heights[c] = ROWS - r }
            } else if (seen) holes++
        }
    }
    let bump = 0, agg = 0, maxH = 0
    for (let c = 0; c < COLS; c++) {
        agg += heights[c]
        if (heights[c] > maxH) maxH = heights[c]
        if (c > 0) bump += Math.abs(heights[c] - heights[c - 1])
    }
    return cleared * cleared * 100 - holes * 120 - bump * 10 - agg - maxH * 4
}

// A placement is fully reachable when every column it lands in is open above
// it: at NES gravity and DAS the demo slides on the surface and cannot tunnel
// under towers, so an unreachable plan strands the piece and digs a hole.
function reachable(s, type, rot, x, y) {
    for (const [r, c] of cellsAfter(type, rot, x, y)) {
        if (c < 0 || c >= COLS) return false
        for (let rr = 0; rr < r; rr++) if (s.board[rr * COLS + c]) return false
    }
    return true
}

export function choosePlan(s) {
    const type = s.cur.type
    let best = null
    for (let rot = 0; rot < SHAPES[type].length; rot++) {
        for (let x = -2; x <= COLS + 2; x++) {
            const y = landingY(s, type, rot, x)
            if (y === null) continue
            const { b, cleared } = boardAfter(s, type, rot, x, y)
            let v = evaluate(b, cleared)
            if (!reachable(s, type, rot, x, y)) v -= 150
            if (!best || v > best.v) best = { x, rot, y, v }
        }
    }
    return best
}

function fitsLocal(b, type, rot, x, y) {
    for (const [r, c] of cellsAfter(type, rot, x, y)) {
        if (c < 0 || c >= COLS || r >= ROWS) return false
        if (r >= 0 && b[r * COLS + c]) return false
    }
    return true
}

// One tick of honest driving: the demo presses keys, so the run obeys the same
// DAS and soft-drop clocks the player is subject to. `mem` is caller-owned
// per-piece memory (the stuck watchdog); pass a fresh {} after each new piece
// you do not want one.
export function driveInput(s, plan, mem = { lastLocks: -1, stuck: 0 }) {
    const input = { left: false, right: false, down: false, rot: false }
    if (!plan || s.over) return input
    if (mem.lastLocks !== s.locks) { mem.lastLocks = s.locks; mem.same = 0 }
    const posKey = s.cur.x + ',' + s.cur.rot + ',' + s.cur.y
    if (mem.posKey !== posKey) { mem.posKey = posKey; mem.same = 0 } else mem.same++
    if (mem.same > 28) { input.down = true; return input }

    const type = s.cur.type
    const needRot = s.cur.rot !== plan.rot
    if (needRot) {
        const nr = (s.cur.rot + 1) % SHAPES[type].length
        if (fitsLocal(s.board, type, nr, s.cur.x, s.cur.y)) {
            if (!s.prevRot) input.rot = true
            return input
        }
    }
    if (s.cur.x < plan.x) input.right = true
    else if (s.cur.x > plan.x) input.left = true
    else if (!needRot && s.cur.y < plan.y) input.down = true
    return input
}
