// OUTPOST — procedural depths. The generator is the ONLY place dice exist,
// and they are SEEDED dice (mulberry32): cave(seed) is a pure function, so
// the harness can audit every seed it ships and replay any depth exactly.
// Connectivity is by CONSTRUCTION (rooms chained by corridors), never by
// prayer-and-floodcheck. The last room is deliberately SEALED: the stairs
// out live in rock, so every depth ends in a dig the tunnel-BFS guides.

export const W = 36
export const H = 20

// cell kinds
export const ROCK = 0, FLOOR = 1, STAIRS = 2

export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const DEPTH_SEED = (baseSeed, depth) => (baseSeed * 1000 + depth * 77) | 0

const room = (t, x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) t[j * W + i] = FLOOR
}
// chain rooms 0..n-2 into one component (the beacon room, n-1, stays sealed)
const chain = (t, rng, rooms) => {
    const hline = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t[y * W + x] = FLOOR }
    const vline = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) t[y * W + x] = FLOOR }
    for (let k = 1; k < rooms.length - 1; k++) {
        const [ax, ay] = centre(rooms[k - 1]), [bx, by] = centre(rooms[k])
        if (rng() < 0.5) { hline(ax, bx, ay); vline(ay, by, bx) } else { vline(ay, by, ax); hline(ax, bx, by) }
    }
}
const centre = ([x, y, w, h]) => [Math.floor(x + w / 2), Math.floor(y + h / 2)]

// an LAYOUT generator: every call rolls 5 rooms with the given rng. The
// returned rooms are [x,y,w,h]; centres are derived, never stored twice.
function carveRooms(rng) {
    return () => {
        const rooms = []
        for (let k = 0; k < 5; k++) {
            const rw = 4 + Math.floor(rng() * 4), rh = 3 + Math.floor(rng() * 3)
            const x = 1 + Math.floor(rng() * (W - rw - 2)), y = 1 + Math.floor(rng() * (H - rh - 2))
            rooms.push([x, y, rw, rh])
        }
        return rooms
    }
}

// returns { t, bush, ore, spawn, depot, stairs, rooms, seed } — deterministic.
export function gen(baseSeed, depth) {
    const rng = mulberry32(DEPTH_SEED(baseSeed, depth))
    const carved = carveRooms(rng)
    // A layout whose beacon room is ALREADY walkable from spawn turns the dig
    // into a stroll — dead code wearing a green test. Retire such layouts;
    // the die is deterministic, so the retry is too.
    let layout = null
    for (let tries = 0; tries < 24; tries++) {
        const rooms = carved()
        const t = new Uint8Array(W * H).fill(ROCK)
        for (const r of rooms) room(t, ...r)
        chain(t, rng, rooms)
        t[centre(rooms[rooms.length - 1])[1] * W + centre(rooms[rooms.length - 1])[0]] = STAIRS
        const seen = flood(t, centre(rooms[0]))
        const si = centre(rooms[rooms.length - 1])
        if (!seen.has(si[1] * W + si[0])) { layout = { rooms, t }; break }
    }
    if (!layout) {
        const rooms = carved()
        const t = new Uint8Array(W * H).fill(ROCK)
        for (const r of rooms) room(t, ...r)
        chain(t, rng, rooms)
        layout = { rooms, t }
    }
    const { rooms, t } = layout
    const [sx, sy] = centre(rooms[0])
    const spawn = [sx, sy]
    let depot = [sx - 1, sy]
    if (t[depot[1] * W + depot[0]] !== FLOOR) depot = [sx, sy - 1]
    // the sealed room is rock to the walker; its centre is STAIRS so the dig
    // that breaks through lands on the stairs, not on bare rock.
    const stairs = centre(rooms[rooms.length - 1])
    t[stairs[1] * W + stairs[0]] = STAIRS

    const bush = new Uint8Array(W * H)
    const ore = new Uint8Array(W * H)
    // The walker's world is ONE component (the sealed last room is not part
    // of it yet). Bushes and ore seams exist only on THAT side — loot behind
    // an unreachable wall is fake loot and would be an un-actionable job.
    const seen = flood(t, spawn)
    const openNeighbour = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((y + dy) * W + x + dx))

    // bushes: on reachable floor, not spawn/depot, deterministic scatter
    const bushes = []
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x
            if (t[i] !== FLOOR || (x === spawn[0] && y === spawn[1]) || (x === depot[0] && y === depot[1])) continue
            if (!seen.has(i)) continue
            if ((i * 2654435761 >>> 0) % 100 < 8 + depth * 2) { bush[i] = 1; bushes.push([x, y]) }
        }
    }
    // ore: in rock, but only rock that TOUCHES the walker's floor (a seam the
    // eye can see and the pick can reach).
    const ores = []
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x
            if (t[i] !== ROCK) continue
            if (openNeighbour(x, y) && (i * 40503 >>> 0) % 100 < 7) { ore[i] = 2; ores.push([x, y]) }
        }
    }
    return { t, bush, ore, spawn, depot, stairs, rooms, seed: DEPTH_SEED(baseSeed, depth) }
}

// floors reachable on foot from a start (bushes and stairs are walkable)
export function flood(t, start) {
    const seen = new Set([start[1] * W + start[0]])
    const q = [start[0] + start[1] * W]
    while (q.length) {
        const i = q.shift(), x = i % W, y = (i - x) / W
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const ni = ny * W + nx
            if (seen.has(ni) || t[ni] === ROCK) continue
            seen.add(ni); q.push(ni)
        }
    }
    return seen
}
