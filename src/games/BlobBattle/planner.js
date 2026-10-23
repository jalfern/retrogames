// BLOB BATTLE — the CPU brain. Pure + deterministic: seeded from the match seed,
// so the autopilot emits identical pad streams on every box (the online law) and
// the harness can record/replay it like any human seat (the slotcheck law).
//
// Strategy, in arcade-CPU order of business:
//   1. take any placement that POPS now (bigger groups first)
//   2. prefer placements that set up a chain (a group of 3 left one short)
//   3. otherwise keep the stack flat and holes few
// It plays by human rules: it only ever emits pads.

import { COLS, ROWS, GARBAGE, idx, pairCells, findGroups, mulberry32 } from './sim.js'

function cloneBoard(b) { return Uint8Array.from(b) }

function dropY(board, x, rot) {
    let y = 0
    if (!pairCells(x, y, rot).every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !board[idx(r, c)])) return -1
    while (pairCells(x, y + 1, rot).every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !board[idx(r, c)])) y++
    return y
}

function place(board, x, y, rot, c1, c2) {
    const b = cloneBoard(board)
    const [a, d] = pairCells(x, y, rot)
    b[idx(a[0], a[1])] = c1
    b[idx(d[0], d[1])] = c2
    return b
}

function cascadeScore(board, depth) {
    let total = 0, chain = 0, b = board
    for (;;) {
        const groups = findGroups(b)
        if (!groups.length) break
        chain++
        total += groups.reduce((n, g) => n + g.cells.length, 0) * chain * 100
        for (const g of groups) for (const [r, c] of g.cells) b[idx(r, c)] = 0
        // collapse
        for (let c = 0; c < COLS; c++) {
            let write = ROWS - 1
            for (let r = ROWS - 1; r >= 0; r--) {
                const v = b[idx(r, c)]
                if (v) { b[idx(write, c)] = v; if (write !== r) b[idx(r, c)] = 0; write-- }
            }
        }
        if (depth && chain >= depth) break
    }
    return { chain, total }
}

function evaluate(board, x, y, rot, c1, c2, depth = 4) {
    const after = place(board, x, y, rot, c1, c2)
    const { chain, total } = cascadeScore(after, depth)
    let height = 0, holes = 0
    for (let c = 0; c < COLS; c++) {
        let top = ROWS
        for (let r = 0; r < ROWS; r++) if (after[idx(r, c)]) { top = r; break }
        if (ROWS - top > height) height = ROWS - top
        let seenSolid = false
        for (let r = 0; r < ROWS; r++) {
            const v = after[idx(r, c)]
            if (v) seenSolid = true
            else if (seenSolid && v === 0) {
                // a hole only under solid stack (garbage counts as solid)
                let below = false
                for (let rr = r + 1; rr < ROWS; rr++) if (after[idx(rr, c)]) { below = true; break }
                if (below) holes++
            }
        }
    }
    // setup value: same-color adjacencies of >=3 that could pop next pair
    let setup = 0
    for (const g of findGroupsNear(after, pairCells(x, y, rot))) setup += g * 30
    return total + setup - height * 5 - holes * 16 + (chain > 1 ? chain * 40 : 0)
}

function findGroupsNear(board, cells) {
    const out = []
    for (const [r, c] of cells) {
        const v = board[idx(r, c)]
        if (!v || v === GARBAGE) continue
        // flood the color cluster containing this cell
        const seen = new Uint8Array(ROWS * COLS)
        const stack = [[r, c]]
        let n = 0
        seen[idx(r, c)] = 1
        while (stack.length) {
            const [cr, cc] = stack.pop()
            n++
            for (const [ar, ac] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]) {
                if (ar < 0 || ar >= ROWS || ac < 0 || ac >= COLS) continue
                const j = idx(ar, ac)
                if (seen[j] || board[j] !== v) continue
                seen[j] = 1
                stack.push([ar, ac])
            }
        }
        if (n === 3) out.push(1) // one orb short of a pop = a live setup
    }
    return out
}

// plan the best landing for the current pair -> { rot, x, score }
export function choosePlacement(w, depth = 4) {
    if (!w.cur) return null
    const { c1, c2 } = w.cur
    let best = null
    for (let rot = 0; rot < 4; rot++) {
        for (let x = 0; x < COLS; x++) {
            const y = dropY(w.board, x, rot)
            if (y < 0) continue
            const sc = evaluate(w.board, x, y, rot, c1, c2, depth)
            if (!best || sc > best.score) best = { rot, x, score: sc }
        }
    }
    return best
}

// the beginner's fallback when it "misses": a flat, hole-free landing that
// ignores pops entirely — it keeps the well safe but lets the chain walk away.
function chooseSafe(w) {
    if (!w.cur) return null
    const { c1, c2 } = w.cur
    let best = null
    for (let rot = 0; rot < 4; rot++) {
        for (let x = 0; x < COLS; x++) {
            const y = dropY(w.board, x, rot)
            if (y < 0) continue
            const after = place(w.board, x, y, rot, c1, c2)
            let height = 0, holes = 0
            for (let c = 0; c < COLS; c++) {
                let top = ROWS
                for (let r = 0; r < ROWS; r++) if (after[idx(r, c)]) { top = r; break }
                if (ROWS - top > height) height = ROWS - top
                let seenSolid = false
                for (let r = 0; r < ROWS; r++) {
                    const v = after[idx(r, c)]
                    if (v) seenSolid = true
                    else if (seenSolid) {
                        let below = false
                        for (let rr = r + 1; rr < ROWS; rr++) if (after[idx(rr, c)]) { below = true; break }
                        if (below) holes++
                    }
                }
            }
            const sc = -(height * 5 + holes * 16)
            if (!best || sc > best.score) best = { rot, x, score: sc }
        }
    }
    return best
}

// one pad out. `mem` persists between ticks per seat { plan, wait }; `tier` is
// the CPU's rung on the ladder and `rng` its seeded stream (jitter + miss rolls).
export function cpuPad(w, mem, tier, rng) {
    const pad = { left: false, right: false, rot: false, down: false, drop: false }
    if (!w || w.over || !w.cur || w.phase !== 'fall') { mem.plan = null; return pad }
    if (!mem.plan) {
        mem.plan = choosePlacement(w, tier.depth)
        if (tier.miss && rng() < tier.miss) mem.plan = chooseSafe(w) // beginner misses the chain
    }
    const p = mem.plan
    if (!p) return pad
    if (w.cur.rot !== p.rot) {
        if (!mem.wait) { pad.rot = true; mem.wait = 2 }
        else mem.wait--
        return pad
    }
    mem.wait = 0
    if (w.cur.x < p.x) pad.right = true
    else if (w.cur.x > p.x) pad.left = true
    else {
        // aligned: sit for a beat (jitter makes the CPU human, not metronomic),
        // then slam.
        if (!mem.dropT) mem.dropT = 4 + Math.floor(tier.jitter(rng()) * 8)
        if (--mem.dropT > 0) pad.down = true
        else { pad.drop = true; mem.dropT = 0; mem.plan = null }
    }
    return pad
}

// the arcade ladder: each rung plans at a different chain depth, takes (or
// misses) the same pops, and drops at its own pace — all from the same seeded
// stream, so a given tier is reproducible on every box (the online law).
// `normal` is exactly the pre-#863 CPU (depth 4, no miss, jitter = raw rng).
export const TIERS = {
    easy: { depth: 2, miss: 0.45, jitter: (r) => 0.5 + r * 0.5 },
    normal: { depth: 4, miss: 0, jitter: (r) => r },
    hard: { depth: 8, miss: 0, jitter: (r) => r * 0.3 },
}

export function makeCpu(seed, tierName = 'normal') {
    const tier = TIERS[tierName] || TIERS.normal
    const rng = mulberry32((seed >>> 0) ^ 0xb0b1e5)
    const mem = {}
    return (w) => cpuPad(w, mem, tier, rng)
}
