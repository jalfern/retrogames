// THE PATH LIBRARY — every darter flight in POLARITY is a named sampled
// path, auditable tick-by-tick offline (the Galaga lesson: a dive that
// teleports is a dive the player could not have dodged). No clock, no
// world reads, no randomness: a pure function of u in [0,1] plus a
// context captured ONCE when the behavior tree commits the enemy.
//
// POLARITY adds one rule of its own on top of continuity: every hostile
// thing is LIGHT or DARK, so a path is only fair if it leaves BOTH a
// position answer and a polarity answer — polarcheck proves that per tick
// with the freeze-and-replay fairness scan, and it uses the SAME fn() the
// engine flies, never a second copy of the physics.

export const W = 224
export const H = 288
export const MAX_STEP = 8

// name -> { ticks, end, build(ctx) -> pts[] }  (end: slot|exit)
export const REGISTRY = {
    // one-way S-dive down the player's side of the board
    zig: {
        ticks: 88, end: 'exit',
        build: (c) => {
            const tx = Math.max(40, Math.min(W - 40, c.px))
            const pts = [[c.x, c.y]]
            const n = 13
            for (let i = 1; i <= n; i++) {
                const u = i / n
                pts.push([
                    c.x + Math.sin(u * Math.PI * 2.5) * 15 * (c.dir || 1) + (tx - c.x) * u,
                    c.y + (H + 26 - c.y) * u,
                ])
            }
            return pts
        },
    },
    // one-way steep swoop onto the player's column
    swoop: {
        ticks: 78, end: 'exit',
        build: (c) => {
            const tx = Math.max(40, Math.min(W - 40, c.px))
            return [
                [c.x, c.y],
                [c.x + (c.dir || 1) * 12, c.y + 40],
                [tx, (c.y + H) / 2],
                [tx, H + 26],
            ]
        },
    },
    // a diver that exited the bottom flies home along a real path FROM
    // WHEREVER IT STANDS — the handoff is position-continuous or the
    // browser draw blinks a darter across the player's own lane
    rejoin: {
        ticks: 170, end: 'slot',
        build: (c) => {
            const left = c.x < W / 2
            return [
                [c.x, c.y],
                [left ? -20 : W + 20, Math.max(H - 30, Math.min(H + 26, c.y))],
                [left ? -14 : W + 14, 150],
                [c.slot.x - (left ? 24 : -24), c.slot.y + 30],
                [c.slot.x, c.slot.y],
            ]
        },
    },
    entryDartL: {
        ticks: 150, end: 'slot',
        build: (c) => [
            [-22, 262], [18, 208], [66, 180], [54, 140], [26, 112],
            [c.x - 22, c.y + 28], [c.x, c.y],
        ],
    },
    entryDartR: {
        ticks: 150, end: 'slot',
        build: (c) => [
            [W + 22, 262], [W - 18, 208], [W - 66, 180], [W - 54, 140], [W - 26, 112],
            [c.x + 22, c.y + 28], [c.x, c.y],
        ],
    },
    // weavers slide along the gun lane and STOP — their x is fixed forever
    // after entry, which is what makes their rail columns a readable
    // positional puzzle (the fairness scan predicts them exactly)
    entryWeaverL: {
        ticks: 120, end: 'slot',
        build: (c) => [[-26, c.y + 12], [c.x - 42, c.y + 16], [c.x, c.y]],
    },
    entryWeaverR: {
        ticks: 120, end: 'slot',
        build: (c) => [[W + 26, c.y + 12], [W - 42, c.y + 16], [c.x, c.y]],
    },
}

function catmull(p, u) {
    const n = p.length - 1
    const f = u * n
    const i = Math.min(Math.floor(f), n - 1)
    const t = f - i
    const P = (k) => p[Math.max(0, Math.min(n, k))]
    const out = [0, 0]
    for (let d = 0; d < 2; d++) {
        const p0 = P(i - 1)[d], p1 = P(i)[d], p2 = P(i + 1)[d], p3 = P(i + 2)[d]
        out[d] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
    }
    return out
}

// resolvePath('zig', ctx) -> { ticks, end, pts, fn(u) -> [x, y] }
// pts travels WITH the path: sim.freeze() stores the pts reference and
// thaw() re-wraps fn without recomputing, so a fairness scan that sends a
// diver home via 'rejoin' cannot corrupt the real game's path geometry.
export function wrapPath(pts, ticks, end) {
    return { ticks, end, pts, fn: (u) => catmull(pts, Math.max(0, Math.min(1, u))) }
}

export function resolvePath(name, ctx) {
    const def = REGISTRY[name]
    if (!def) throw new Error(`unknown path "${name}" — the behavior tree named a move that does not exist`)
    return wrapPath(def.build(ctx), def.ticks, def.end)
}

// samplePath(name, ctx) -> [{u, x, y}] one row per tick of the path.
export function samplePath(name, ctx) {
    const p = resolvePath(name, ctx)
    const rows = []
    for (let t = 0; t <= p.ticks; t++) {
        const [x, y] = p.fn(t / p.ticks)
        rows.push({ u: t / p.ticks, x, y })
    }
    return rows
}
