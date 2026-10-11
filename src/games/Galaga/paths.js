// THE PATH LIBRARY — the muscle issue #71 asked for: scripted dive paths
// that a harness can actually audit. Every path is a pure function of
// u in [0,1] plus a context {slot, px, py, dir} captured ONCE when the
// behavior tree commits the enemy to the path. No clock, no world reads,
// no randomness inside a path — which is what lets galactcheck sample
// every path tick-by-tick offline and assert:
//
//   continuity  every per-tick step <= MAX_STEP (a dive that teleports
//               is a dive the player could not have dodged)
//   anchors     entry paths land EXACTLY on their formation slot;
//               loops return to the anchor they launched from;
//               one-way dives exit through the bottom band
//   registry    the tree may only ever name a path that exists here —
//               resolvePath throws on an unknown name (the aicheck
//               rejected-skill lesson: an unimplemented move must fail
//               loudly, never fall through to a surprise)

export const W = 224
export const H = 288
export const MAX_STEP = 9

// name -> { ticks, end, band?, build(ctx) -> pts[] }  (end: anchor|exit|top)
export const REGISTRY = {
    // one-way S-dive aimed (loosely) at the player's x when committed
    zig: {
        ticks: 88, end: 'exit',
        build: (c) => {
            const tx = Math.max(40, Math.min(W - 40, c.px))
            const pts = [[c.x, c.y]]
            const n = 13
            for (let i = 1; i <= n; i++) {
                const u = i / n
                pts.push([
                    c.x + Math.sin(u * Math.PI * 2.5) * 16 * (c.dir || 1) + (tx - c.x) * u,
                    c.y + (H + 26 - c.y) * u,
                ])
            }
            return pts
        },
    },
    // one-way steep swoop onto the player's x
    swoop: {
        ticks: 80, end: 'exit',
        build: (c) => {
            const tx = Math.max(40, Math.min(W - 40, c.px))
            const pts = [[c.x, c.y], [c.x + (c.dir || 1) * 12, c.y + 42], [tx, (c.y + H) / 2], [tx, H + 26]]
            return pts
        },
    },
    // dive, swing a full loop near the bottom, climb back to the anchor
    loop: {
        ticks: 190, end: 'anchor',
        build: (c) => {
            const s = c.dir || 1
            const Yb = 236, R = 24
            const cx = c.x + s * (R + 10)
            const pts = [[c.x, c.y], [c.x + s * 14, c.y + 60], [cx - s * R, Yb]]
            for (let k = 1; k <= 8; k++) {
                const a = (k / 8) * Math.PI * 2
                pts.push([cx - Math.cos(a) * R, Yb + Math.sin(a) * R])
            }
            pts.push([c.x + s * 6, c.y + 90], [c.x, c.y])
            return pts
        },
    },
    // the tractor-beam routine: slide over the captive-to-be, hold with the
    // band OPEN, then drop and exit the bottom (a missed beam leaves the
    // screen dirty — it rejoins via `rejoin`). A caught fighter is carried
    // off the top by `carry` instead.
    beam: {
        ticks: 300, end: 'exit', band: [0.60, 0.90], half: 17,
        build: (c) => {
            const bx = Math.max(34, Math.min(W - 34, c.px))
            const hold = Math.max(c.y + 42, 120)
            return [
                [c.x, c.y], [(c.x + bx) / 2, c.y + 14], [bx, hold],
                [bx, hold + 10], [bx, hold + 24], [bx, hold + 38], [bx, hold + 56],
                [bx, 210], [bx, 248], [bx, H + 40],
            ]
        },
    },
    // the prize ride: straight up off the top, fighter in tow
    carry: {
        ticks: 70, end: 'top',
        build: (c) => [[c.x, c.y], [c.x, c.y - 40], [c.x, -30]],
    },
    // a diver that exited the bottom (or finished a loop back at its
    // anchor) flies home along a real path FROM WHEREVER IT STANDS — the
    // handoff must be position-continuous, or the browser draw blinks the
    // bee across the player's own lane
    rejoin: {
        ticks: 185, end: 'slot',
        build: (c) => [
            [c.x, c.y],
            [c.x < W / 2 ? -20 : W + 20, Math.max(H - 30, Math.min(H + 26, c.y))],
            [c.x < W / 2 ? -14 : W + 14, 190],
            [c.slot.x - (c.x < W / 2 ? 24 : -24), c.slot.y + 34],
            [c.slot.x, c.slot.y],
        ],
    },
    entryBeeL: {
        ticks: 145, end: 'slot',
        build: (c) => [
            [-22, 306], [22, 252], [78, 222], [66, 176], [30, 150],
            [c.x - 26, 104], [c.x - 8, c.y + 26], [c.x, c.y],
        ],
    },
    entryBeeR: {
        ticks: 145, end: 'slot',
        build: (c) => [
            [W + 22, 306], [W - 22, 252], [W - 78, 222], [W - 66, 176], [W - 30, 150],
            [c.x + 26, 104], [c.x + 8, c.y + 26], [c.x, c.y],
        ],
    },
    entryBossL: {
        ticks: 165, end: 'slot',
        build: (c) => [
            [-26, c.y + 8], [70, c.y + 6], [W - 34, c.y + 22], [40, c.y + 14],
            [c.x - 14, c.y + 4], [c.x, c.y],
        ],
    },
    entryBossR: {
        ticks: 165, end: 'slot',
        build: (c) => [
            [W + 26, c.y + 8], [W - 70, c.y + 6], [34, c.y + 22], [W - 40, c.y + 14],
            [c.x + 14, c.y + 4], [c.x, c.y],
        ],
    },
    entryFlag: {
        ticks: 150, end: 'slot',
        build: (c) => [
            [112, -24], [112, 44], [70, 74], [c.x - 20, c.y + 18], [c.x, c.y],
        ],
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

// resolvePath('zig', ctx) -> { ticks, end, band?, half?, fn(u) -> [x, y] }
export function resolvePath(name, ctx) {
    const def = REGISTRY[name]
    if (!def) throw new Error(`unknown path "${name}" — the behavior tree named a move that does not exist`)
    const pts = def.build(ctx)
    return {
        ticks: def.ticks,
        end: def.end,
        band: def.band || null,
        half: def.half || 0,
        fn: (u) => catmull(pts, Math.max(0, Math.min(1, u))),
    }
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
