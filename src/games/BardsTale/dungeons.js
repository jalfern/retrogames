// THE BARD'S TALE — world data + seeded generators.
// Skara Brae is hand-authored (authenticity beats provability: the town is
// the town). The five dungeon levels down from the wine cellars to Mangar's
// throne are seeded mazes, each with a palette, a monster table, supplies and
// — from the catacombs down — a locked door whose key hides on the same floor.
// No Math.random anywhere: mulberry32 only, so every audit re-runs identically.

export const TOWN_W = 16
export const TOWN_H = 14

// # wall/building mass  . street  + letter = special doorway (walkable)
// g guild  e Garth's equipment  t tavern  p temple  r Review Board
// s sewer entrance (open)   m Mangar's tower gate (needs the tower key)
const TOWN_ROWS = [
    '################',
    '#.##.##.##.....#',
    '#.g#.#e#.#t#...#',
    '#.##.##.##.....#',
    '#..............#',
    '####.######.####',
    '#..............#',
    '#.##.##.##.###.#',
    '#.p#.#r#.#s#m#.#',
    '#.##.##.##.###.#',
    '#..............#',
    '####.######.####',
    '#..............#',
    '################',
]

export const TOWN_SPECIALS = {
    g: { name: 'ADVENTURER\'S GUILD', kind: 'guild' },
    e: { name: 'GARTH\'S EQUIPMENT', kind: 'garth' },
    t: { name: 'THE TAVERN', kind: 'tavern' },
    p: { name: 'THE TEMPLE', kind: 'temple' },
    r: { name: 'REVIEW BOARD', kind: 'board' },
    s: { name: 'SEWER GRATE', kind: 'sewer' },
    m: { name: 'MANGAR\'S GATE', kind: 'towergate' },
}

export function makeTown() {
    const grid = new Uint8Array(TOWN_W * TOWN_H)
    const specials = new Map()
    for (let y = 0; y < TOWN_H; y++) {
        for (let x = 0; x < TOWN_W; x++) {
            const ch = TOWN_ROWS[y][x]
            if (ch === '#') grid[y * TOWN_W + x] = 1
            else if (ch !== '.') specials.set(y * TOWN_W + x, TOWN_SPECIALS[ch])
        }
    }
    return {
        name: 'SKARA BRAE',
        w: TOWN_W, h: TOWN_H, grid, specials,
        wall: (x, y) => x < 0 || y < 0 || x >= TOWN_W || y >= TOWN_H || grid[y * TOWN_W + x] === 1,
        spawn: { x: 7, y: 12, dir: 3 },
        town: true,
    }
}

// ------------------------------------------------------------------ dungeons ----
export const FLOORS = [
    {
        name: 'THE WINE CELLARS', size: 20, seed: 1985, maze: 'braid',
        palette: { wall: '#5a3b22', wallLit: '#a8763e', floor: '#2b1c10', ceil: '#1c1209', sky: null },
        mobs: ['RAT', 'RAT', 'SPIDER'], strong: 'RATKING', pots: 2, ales: 1, treasure: 3, ambushes: 5, locked: false,
    },
    {
        name: 'THE SEWERS OF SKARA BRAE', size: 22, seed: 2086, maze: 'braid',
        palette: { wall: '#2f4a30', wallLit: '#5f9462', floor: '#16241a', ceil: '#0e1811', sky: null },
        mobs: ['SLIME', 'SPIDER', 'RAT'], strong: 'TROLL', pots: 2, ales: 1, treasure: 3, ambushes: 6, locked: false,
    },
    {
        name: 'THE CATACOMBS', size: 22, seed: 3187, maze: 'rooms',
        palette: { wall: '#4a4a52', wallLit: '#9a9aab', floor: '#26262e', ceil: '#15151b', sky: null },
        mobs: ['SKELETON', 'GHOST', 'SPIDER'], strong: 'WIGHT', pots: 2, ales: 1, treasure: 3, ambushes: 6, locked: true,
    },
    {
        name: 'HARKYN\'S CASTLE', size: 24, seed: 4288, maze: 'rooms',
        palette: { wall: '#5c2f2f', wallLit: '#b06055', floor: '#241414', ceil: '#160c0c', sky: null },
        mobs: ['GARGOYLE', 'ORC', 'SKELETON'], strong: 'HARKYN', pots: 3, ales: 1, treasure: 4, ambushes: 7, locked: true,
    },
    {
        name: 'KYLEARAN\'S TOWER', size: 24, seed: 5389, maze: 'spiral',
        palette: { wall: '#2f3a6e', wallLit: '#6f86d8', floor: '#141830', ceil: '#0b0e1e', sky: null },
        mobs: ['GREMLIN', 'GHOST', 'ORC'], strong: 'WIZARD', pots: 3, ales: 2, treasure: 4, ambushes: 7, locked: true,
    },
    {
        name: 'MANGAR\'S TOWER', size: 20, seed: 6490, maze: 'spiral',
        palette: { wall: '#241a33', wallLit: '#6e4fa0', floor: '#120b1c', ceil: '#0a0613', sky: null },
        mobs: ['DEMON', 'GARGOYLE', 'WRAITH'], strong: 'MANGAR', pots: 2, ales: 1, treasure: 2, ambushes: 5, locked: false, boss: true,
    },
]

export const MOBS = {
    RAT: { name: 'GIANT RAT', art: 'rat', hp: 12, atk: 7, def: 2, spd: 7, xp: 14, range: 2 },
    SPIDER: { name: 'SPIDER', art: 'spider', hp: 14, atk: 8, def: 2, spd: 8, xp: 18, range: 2 },
    RATKING: { name: 'RAT KING', art: 'ratking', hp: 34, atk: 10, def: 3, spd: 6, xp: 40, range: 1 },
    SLIME: { name: 'GREEN SLIME', art: 'slime', hp: 22, atk: 9, def: 4, spd: 3, xp: 22, range: 2 },
    TROLL: { name: 'SEWER TROLL', art: 'troll', hp: 48, atk: 13, def: 5, spd: 4, xp: 55, range: 1 },
    SKELETON: { name: 'SKELETON', art: 'skelet', hp: 26, atk: 11, def: 4, spd: 5, xp: 30, range: 2 },
    GHOST: { name: 'GHOST', art: 'ghost', hp: 20, atk: 12, def: 2, spd: 9, xp: 32, range: 3 },
    WIGHT: { name: 'WIGHT', art: 'wight', hp: 42, atk: 14, def: 5, spd: 6, xp: 60, range: 1 },
    GARGOYLE: { name: 'GARGOYLE', art: 'gargoyle', hp: 36, atk: 14, def: 7, spd: 5, xp: 44, range: 2 },
    ORC: { name: 'ORC', art: 'orc', hp: 30, atk: 13, def: 4, spd: 6, xp: 36, range: 2 },
    HARKYN: { name: 'HARKYN', art: 'warlord', hp: 70, atk: 17, def: 8, spd: 5, xp: 120, range: 1 },
    GREMLIN: { name: 'GREMLIN', art: 'gremlin', hp: 24, atk: 12, def: 3, spd: 10, xp: 34, range: 3 },
    WIZARD: { name: 'APPRENTICE WIZARD', art: 'mage', hp: 40, atk: 15, def: 4, spd: 7, xp: 90, range: 4 },
    DEMON: { name: 'FROST DEMON', art: 'demon', hp: 44, atk: 16, def: 6, spd: 8, xp: 70, range: 2 },
    WRAITH: { name: 'SHADOW WRAITH', art: 'wraith', hp: 30, atk: 15, def: 3, spd: 9, xp: 52, range: 3 },
    MANGAR: { name: 'MANGAR THE DARK', art: 'mangar', hp: 140, atk: 20, def: 9, spd: 7, xp: 400, range: 1 },
}

const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// carve a perfect maze, then braid it (remove some dead ends) so first-person
// corridors have real choices instead of backtracking
function carve(size, rnd, mode) {
    const g = new Uint8Array(size * size).fill(1)
    const idx = (x, y) => y * size + x
    const stack = [[1, 1]]
    g[idx(1, 1)] = 0
    const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]]
    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1]
        const opts = []
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy
            if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && g[idx(nx, ny)] === 1) opts.push([nx, ny, cx + dx / 2, cy + dy / 2])
        }
        if (!opts.length) { stack.pop(); continue }
        const [nx, ny, ax, ay] = opts[Math.floor(rnd() * opts.length)]
        g[idx(nx, ny)] = 0; g[idx(ax, ay)] = 0
        stack.push([nx, ny])
    }
    if (mode === 'braid') {
        for (let y = 1; y < size - 1; y++) {
            for (let x = 1; x < size - 1; x++) {
                if (g[idx(x, y)] !== 0) continue
                let open = 0
                for (const [dx, dy] of DIRS) if (g[idx(x + dx, y + dy)] === 0) open++
                if (open <= 1 && rnd() < 0.55) {
                    const walls = DIRS.filter(([dx, dy]) => {
                        const wx = x + dx, wy = y + dy
                        return wx > 0 && wy > 0 && wx < size - 1 && wy < size - 1 && g[idx(wx, wy)] === 1
                    })
                    if (walls.length) {
                        const [dx, dy] = walls[Math.floor(rnd() * walls.length)]
                        g[idx(x + dx, y + dy)] = 0
                        g[idx(x + dx * 2, y + dy * 2)] = 0
                    }
                }
            }
        }
    } else if (mode === 'rooms') {
        const rooms = 3 + Math.floor(rnd() * 3)
        for (let r = 0; r < rooms; r++) {
            const rw = 3 + Math.floor(rnd() * 3), rh = 3 + Math.floor(rnd() * 3)
            const rx = 1 + Math.floor(rnd() * (size - rw - 2))
            const ry = 1 + Math.floor(rnd() * (size - rh - 2))
            for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) g[idx(x, y)] = 0
        }
    } else if (mode === 'spiral') {
        for (let y = 2; y < size - 2; y += 2) {
            for (let x = 2; x < size - 2; x++) g[idx(x, y)] = 0
        }
        for (let y = 1; y < size - 1; y++) g[idx(size - 2, y)] = 0
        for (let y = 1; y < size - 3; y += 2) g[idx(size - 4, y)] = 1
        g[idx(2, 2)] = 1
    }
    return g
}

const openCells = (g, size) => {
    const list = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (g[y * size + x] === 0) list.push({ x, y })
    return list
}

export function bfsDist(g, size, sx, sy) {
    const dist = new Int16Array(size * size).fill(-1)
    dist[sy * size + sx] = 0
    const q = [[sx, sy]]
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
            const t = ny * size + nx
            if (g[t] === 0 && dist[t] === -1) { dist[t] = dist[cy * size + cx] + 1; q.push([nx, ny]) }
        }
    }
    return dist
}

// punch isolated pockets open: every open cell must be reachable from the
// entrance, or the generator leaves a lie the solver can never walk
function connect(g, size, sx, sy) {
    for (;;) {
        const dist = bfsDist(g, size, sx, sy)
        let orphan = -1
        for (let t = 0; t < size * size; t++) {
            if (g[t] === 0 && dist[t] === -1) { orphan = t; break }
        }
        if (orphan === -1) return
        // BFS from the orphan through anything, shortest step path to the
        // reachable set; open every wall it crosses
        const prev = new Int32Array(size * size).fill(-2)
        prev[orphan] = -1
        const q = [orphan]
        let hit = -1
        for (let qi = 0; qi < q.length && hit === -1; qi++) {
            const c = q[qi]
            const cx = c % size, cy = (c / size) | 0
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy
                if (nx <= 0 || ny <= 0 || nx >= size - 1 || ny >= size - 1) continue
                const t = ny * size + nx
                if (prev[t] !== -2) continue
                prev[t] = c
                if (dist[t] !== -1) { hit = t; break }
                q.push(t)
            }
        }
        if (hit === -1) { g[orphan] = 1; continue }
        let c = hit
        while (prev[c] > 0) { g[c] = 0; c = prev[c] }
    }
}

export function genFloor(fi) {
    const f = FLOORS[fi]
    const size = f.size
    const rnd = mulberry(f.seed)
    const grid = carve(size, rnd, f.maze)
    const idx = (x, y) => y * size + x
    const entrance = { x: 1, y: 1 }
    grid[idx(1, 1)] = 0
    if (f.boss) {
        grid[idx(2, 1)] = 0
        grid[idx(1, 2)] = 0
    }
    connect(grid, size, entrance.x, entrance.y)
    const dist = bfsDist(grid, size, entrance.x, entrance.y)
    const open = openCells(grid, size).filter((c) => dist[idx(c.x, c.y)] >= 0)
    open.sort((a, b) => dist[idx(b.x, b.y)] - dist[idx(a.x, a.y)] || (a.x - b.x) || (a.y - b.y))
    const far = open[0]
    const goal = { x: far.x, y: far.y }
    const used = new Set([idx(entrance.x, entrance.y), idx(goal.x, goal.y)])
    const pick = (minD) => {
        const cand = open.filter((c) => !used.has(idx(c.x, c.y)) && dist[idx(c.x, c.y)] >= minD)
        const c = cand[Math.floor(rnd() * cand.length)]
        used.add(idx(c.x, c.y))
        return c
    }
    const minD = Math.max(4, Math.floor(dist[idx(goal.x, goal.y)] / 4))
    const pots = [], ales = [], treasure = [], ambushes = []
    for (let i = 0; i < f.pots; i++) pots.push(pick(minD))
    for (let i = 0; i < f.ales; i++) ales.push(pick(minD))
    for (let i = 0; i < f.treasure; i++) treasure.push(pick(minD))
    let id = 0
    for (let i = 0; i < f.ambushes; i++) {
        const c = pick(minD)
        const n = 1 + Math.floor(rnd() * 3)
        const group = []
        for (let k = 0; k < n; k++) group.push(f.mobs[Math.floor(rnd() * f.mobs.length)])
        ambushes.push({ id: id++, x: c.x, y: c.y, group })
    }
    let locked = null, key = null
    let strongCell = { x: goal.x, y: goal.y }
    if (f.locked) {
        const path = []
        let cx = goal.x, cy = goal.y
        while (!(cx === entrance.x && cy === entrance.y)) {
            path.push({ x: cx, y: cy })
            let best = null
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
                const t = idx(nx, ny)
                if (grid[t] === 0 && dist[t] !== -1 && dist[t] === dist[idx(cx, cy)] - 1) { best = { x: nx, y: ny }; break }
            }
            if (!best) break
            cx = best.x; cy = best.y
        }
        const doorIdx = Math.max(1, Math.floor(path.length / 2))
        const door = path[doorIdx]
        const keyPool = path.slice(doorIdx + 1)
        locked = { x: door.x, y: door.y }
        key = keyPool.length ? keyPool[Math.floor(rnd() * keyPool.length)] : pick(minD)
        used.add(idx(locked.x, locked.y))
        used.add(idx(key.x, key.y))
        const goalSide = path.slice(0, doorIdx).filter((c) => Math.abs(c.x - locked.x) + Math.abs(c.y - locked.y) === 1 && !(c.x === goal.x && c.y === goal.y))
        if (goalSide.length) strongCell = goalSide[0]
    }
    return {
        fi, name: f.name, size, grid, palette: f.palette,
        entrance, stairs: f.boss ? null : goal, boss: f.boss ? { x: goal.x, y: goal.y } : null,
        strong: { x: strongCell.x, y: strongCell.y, key: f.strong },
        pots, ales, treasure, ambushes, locked, key,
        wall: (x, y) => x < 0 || y < 0 || x >= size || y >= size || grid[y * size + x] === 1,
    }
}

export const floorAt = (fi) => genFloor(fi)
