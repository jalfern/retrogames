// TEN-DEEP — floor generation. Pure and seeded: mulberry32 lives here and is
// the ONLY dice in the game; Math.random is banned at the door by tendeepcheck.
// Floors are carved as a randomized DFS maze on odd cells, then BRAIDED
// (dead ends punched into loops) — a maze is a tree, so by construction every
// open cell is reachable from the entrance. tendeepcheck re-proves that with its
// own BFS anyway: the generator may never referee its own work.
//
// Everything the campaign consumes is PLACED, never rolled: stairs at the
// far end, potions and MP-springs on real cells, ambushes as NAMED tiles
// (stepping on one fires a fixed group, once). A slack supply is a placeable
// tile so the harness can physically remove one and re-prove the win.
//
// The world is ours: TEN DEEPS below a fallen keep, each a seeded maze with
// its own keeper bestiary, the Hollow King on the last.

export const SIZE = 19

export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const MOBS = {
    RAT:      { name: 'Cave Rat',       hp: 12, atk: 6,  def: 1, spd: 6, xp: 24,   art: 'rat' },
    SNAKE:    { name: 'Mire Adder',     hp: 16, atk: 7,  def: 2, spd: 7, xp: 34,   art: 'snake' },
    GOBLIN:   { name: 'Rag Goblin',     hp: 22, atk: 9,  def: 3, spd: 4, xp: 58,   art: 'goblin' },
    SKELET:   { name: 'Bone Sentry',    hp: 28, atk: 10, def: 4, spd: 5, xp: 86,   art: 'skelet' },
    WRAITH:   { name: 'Pale Wraith',    hp: 26, atk: 12, def: 3, spd: 8, xp: 120,  art: 'wraith' },
    GHOUL:    { name: 'Grave Ghoul',    hp: 34, atk: 11, def: 3, spd: 5, xp: 110,  art: 'ghoul' },
    TROLL:    { name: 'Bog Troll',      hp: 48, atk: 13, def: 5, spd: 3, xp: 150,  art: 'troll' },
    MINOTAUR: { name: 'Minotauros',     hp: 58, atk: 15, def: 5, spd: 6, xp: 210,  art: 'minotaur' },
    WYRM:     { name: 'Deep Wyrm',      hp: 70, atk: 17, def: 6, spd: 7, xp: 300,  art: 'wyrm' },
    KING:     { name: 'THE HOLLOW KING', hp: 340, atk: 22, def: 8, spd: 6, xp: 5000, art: 'king' },
}

// Ten seeded deeps. Names, monsters, layouts and story are original work.
// The ramp is deliberate: each deep's mix steps above the last so XP and the
// spring/potion economy carry a party from 36-hp novices to king-slayers.
export const FLOORS = [
    {
        name: 'DEEP 1 — RAT CELLAR', seed: 1337,
        groups: [['RAT', 'RAT', 'RAT', 'RAT'], ['SNAKE', 'SNAKE', 'SNAKE'], ['GOBLIN', 'GOBLIN', 'RAT', 'RAT'], ['SNAKE', 'SNAKE', 'RAT'], ['GOBLIN', 'SNAKE', 'SNAKE', 'RAT'], ['GOBLIN', 'GOBLIN', 'GOBLIN']],
        ambushes: 7, pots: 3, springs: 1,
    },
    {
        name: 'DEEP 2 — GOBLIN RENTS', seed: 4711,
        groups: [['SKELET', 'SKELET', 'SKELET'], ['GOBLIN', 'GOBLIN', 'SKELET', 'SNAKE'], ['SNAKE', 'SNAKE', 'SNAKE', 'SNAKE'], ['SKELET', 'WRAITH'], ['GOBLIN', 'SKELET', 'SKELET', 'RAT', 'RAT'], ['WRAITH', 'SNAKE', 'SNAKE'], ['SKELET', 'SKELET', 'SKELET', 'SKELET']],
        ambushes: 8, pots: 3, springs: 2,
    },
    {
        name: 'DEEP 3 — HALL OF SENTRIES', seed: 90210,
        groups: [['WRAITH', 'WRAITH'], ['SKELET', 'SKELET', 'WRAITH'], ['WRAITH', 'SNAKE', 'SNAKE', 'SNAKE'], ['SKELET', 'WRAITH', 'GOBLIN', 'GOBLIN'], ['WRAITH', 'WRAITH', 'SNAKE'], ['GHOUL', 'SKELET', 'SKELET']],
        ambushes: 8, pots: 3, springs: 2,
    },
    {
        name: 'DEEP 4 — THE GNAWING PIT', seed: 20270,
        groups: [['GHOUL', 'GHOUL'], ['GHOUL', 'SKELET', 'SKELET', 'RAT'], ['WRAITH', 'GHOUL'], ['SKELET', 'SKELET', 'SKELET', 'SKELET'], ['GHOUL', 'WRAITH', 'SNAKE', 'SNAKE']],
        ambushes: 9, pots: 3, springs: 2,
    },
    {
        name: 'DEEP 5 — BOG OF TROLLS', seed: 55513,
        groups: [['TROLL', 'GHOUL'], ['TROLL', 'SKELET', 'SKELET'], ['WRAITH', 'WRAITH', 'GHOUL'], ['GHOUL', 'GHOUL', 'GHOUL'], ['TROLL', 'RAT', 'RAT', 'RAT', 'RAT'], ['WRAITH', 'GHOUL', 'SKELET']],
        ambushes: 9, pots: 3, springs: 2,
    },
    {
        name: 'DEEP 6 — THE GRINDING GALLERY', seed: 61742,
        groups: [['TROLL', 'TROLL'], ['MINOTAUR', 'GHOUL', 'GHOUL'], ['TROLL', 'WRAITH', 'SKELET', 'SKELET'], ['MINOTAUR', 'SKELET', 'SKELET'], ['GHOUL', 'GHOUL', 'WRAITH', 'WRAITH']],
        ambushes: 9, pots: 3, springs: 2,
    },
    {
        name: 'DEEP 7 — LABYRINTH OF HORNS', seed: 77301,
        groups: [['MINOTAUR', 'TROLL'], ['MINOTAUR', 'WRAITH', 'WRAITH'], ['TROLL', 'TROLL', 'GHOUL', 'GHOUL'], ['MINOTAUR', 'MINOTAUR'], ['WRAITH', 'WRAITH', 'WRAITH', 'SKELET']],
        ambushes: 9, pots: 2, springs: 2,
    },
    {
        name: 'DEEP 8 — THE MOLT HALL', seed: 80817,
        groups: [['WYRM', 'MINOTAUR'], ['WYRM', 'GHOUL', 'GHOUL', 'GHOUL'], ['TROLL', 'TROLL', 'TROLL', 'WRAITH'], ['MINOTAUR', 'WRAITH', 'SKELET', 'SKELET', 'SKELET']],
        ambushes: 10, pots: 2, springs: 2,
    },
    {
        name: 'DEEP 9 — GATE OF WYRMS', seed: 91919,
        groups: [['WYRM', 'WYRM'], ['WYRM', 'WRAITH', 'WRAITH'], ['MINOTAUR', 'MINOTAUR', 'GHOUL', 'GHOUL'], ['WYRM', 'TROLL', 'SKELET', 'SKELET'], ['WRAITH', 'WRAITH', 'WRAITH', 'WRAITH']],
        ambushes: 10, pots: 2, springs: 3,
    },
    {
        name: 'DEEP 10 — THRONE OF THE HOLLOW KING', seed: 10010,
        groups: [['WYRM', 'WRAITH', 'WRAITH'], ['MINOTAUR', 'MINOTAUR', 'MINOTAUR'], ['WYRM', 'GHOUL', 'GHOUL', 'GHOUL'], ['WRAITH', 'WRAITH', 'WYRM'], ['TROLL', 'TROLL', 'TROLL', 'TROLL']],
        ambushes: 8, pots: 2, springs: 3,
    },
]

const idx = (x, y) => y * SIZE + x

export function genFloor(fi) {
    const def = FLOORS[fi]
    const rnd = mulberry32(def.seed)
    const grid = new Uint8Array(SIZE * SIZE).fill(1)
    const open = []
    const carve = (x, y) => { grid[idx(x, y)] = 0; open.push([x, y]) }
    // randomized DFS maze on odd cells; walls between live at even coords
    const stack = [[1, 1]]
    const seen = new Set([idx(1, 1)])
    grid[idx(1, 1)] = 0
    const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]]
    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1]
        const shuffled = DIRS.slice()
        for (let si = shuffled.length - 1; si > 0; si--) {
            const j = Math.floor(rnd() * (si + 1))
            const tmp = shuffled[si]; shuffled[si] = shuffled[j]; shuffled[j] = tmp
        }
        let moved = false
        for (const [dx, dy] of shuffled) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 1 || ny < 1 || nx >= SIZE - 1 || ny >= SIZE - 1 || seen.has(idx(nx, ny))) continue
            seen.add(idx(nx, ny))
            grid[idx(cx + dx / 2, cy + dy / 2)] = 0
            carve(nx, ny)
            stack.push([nx, ny])
            moved = true
            break
        }
        if (!moved) stack.pop()
    }
    // braid: punch ~40% of dead ends into loops so the keep breathes
    for (let y = 1; y < SIZE - 1; y += 2) {
        for (let x = 1; x < SIZE - 1; x += 2) {
            const n = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => grid[idx(x + dx / 2, y + dy / 2)] === 0).length
            if (n === 1 && rnd() < 0.4) {
                const wall = DIRS.filter(([dx, dy]) => {
                    const wx = x + dx / 2, wy = y + dy / 2, nx = x + dx, ny = y + dy
                    return wx >= 1 && wy >= 1 && wx < SIZE - 1 && wy < SIZE - 1 && nx >= 1 && ny >= 1 && nx < SIZE - 1 && ny < SIZE - 1 && grid[idx(wx, wy)] === 1
                })
                if (wall.length) {
                    const [dx, dy] = wall[Math.floor(rnd() * wall.length)]
                    grid[idx(x + dx / 2, y + dy / 2)] = 0
                }
            }
        }
    }

    // BFS distances from the entrance — placement and the audit share nothing,
    // but the generator uses this for sane distances only.
    const dist = new Int32Array(SIZE * SIZE).fill(-1)
    dist[idx(1, 1)] = 0
    const q = [[1, 1]]
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (grid[idx(nx, ny)] === 0 && dist[idx(nx, ny)] < 0) {
                dist[idx(nx, ny)] = dist[idx(cx, cy)] + 1
                q.push([nx, ny])
            }
        }
    }
    const cells = open.filter(([x, y]) => dist[idx(x, y)] >= 0)
    const maxD = Math.max(...cells.map(([x, y]) => dist[idx(x, y)]))
    const used = new Set([idx(1, 1)])

    // stairs (or the throne) at the far end
    const far = cells.filter(([x, y]) => dist[idx(x, y)] >= maxD - 2 && !used.has(idx(x, y)))
    const end = far[Math.floor(rnd() * far.length)]
    used.add(idx(end[0], end[1]))
    const throne = fi === FLOORS.length - 1

    // supplies mid-depth: sort by distance, sample the 0.35..0.9 band
    const byDist = cells.slice().sort((a, b) => dist[idx(a[0], a[1])] - dist[idx(b[0], b[1])])
    const pick = (bandLo, bandHi, n) => {
        const lo = Math.floor(byDist.length * bandLo), hi = Math.floor(byDist.length * bandHi)
        const out = []
        for (let i = 0; i < n && lo + i < hi; i++) {
            let c = null
            for (let tries = 0; tries < 24; tries++) {
                const cand = byDist[lo + Math.floor(rnd() * (hi - lo))]
                if (cand && !used.has(idx(cand[0], cand[1]))) { c = cand; break }
            }
            if (!c) continue
            used.add(idx(c[0], c[1]))
            out.push({ x: c[0], y: c[1] })
        }
        return out
    }
    const pots = pick(0.35, 0.95, def.pots)
    const springs = pick(0.4, 0.95, def.springs)
    const ambushes = []
    const groupPool = def.groups
    const cand = cells.filter(([x, y]) => dist[idx(x, y)] >= 3 && !used.has(idx(x, y)))
    for (let i = 0; i < def.ambushes && cand.length; i++) {
        const c = cand[Math.floor(rnd() * cand.length)]
        cand.splice(cand.indexOf(c), 1)
        used.add(idx(c[0], c[1]))
        ambushes.push({ x: c[0], y: c[1], id: ambushes.length, group: groupPool[ambushes.length % groupPool.length] })
    }

    return {
        fi, name: def.name, grid, dist, maxD,
        entrance: { x: 1, y: 1, dir: 0 },
        stairs: throne ? null : { x: end[0], y: end[1] },
        throne: throne ? { x: end[0], y: end[1] } : null,
        pots, springs, ambushes,
        wall: (x, y) => x < 0 || y < 0 || x >= SIZE || y >= SIZE || grid[idx(x, y)] === 1,
    }
}
