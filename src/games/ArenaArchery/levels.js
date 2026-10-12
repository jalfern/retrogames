// ARENA ARCHERY — two hand-carved duelling grounds. '#' is stone, '.' is air.
// Every ledge is reachable: the jump rises EXACTLY 2 cells (pinned by the
// harness: h = jump²/2g), and every chain floor → shelf → balcony is at most
// a two-cell step with horizontal room to spare. Carved empty-first like
// IronKeep: the roof and floor are the grid border, so nothing leaks.

const ARENAS = [
    {
        name: 'CROSSGLOVE',
        rows: [
            '####################',
            '#..................#',
            '#..................#',
            '#..................#',
            '#.......####.......#',
            '#..................#',
            '#.####........####.#',
            '#..................#',
            '#.....####..####...#',
            '#..................#',
            '#.##..........##...#',
            '#..................#',
            '####################',
        ],
        p1: { x: 5, y: 11 },
        p2: { x: 12, y: 11 },
    },
    {
        name: 'KNOCKBACK',
        rows: [
            '####################',
            '#..................#',
            '#..................#',
            '#..................#',
            '#..................#',
            '#......##..##......#',
            '#.###..........###.#',
            '#..................#',
            '#..................#',
            '#....###......###..#',
            '#..................#',
            '#.#..............#.#',
            '####################',
        ],
        p1: { x: 4, y: 11 },
        p2: { x: 15, y: 11 },
    },
]

export const ARENA_NAMES = ARENAS.map((a) => a.name)

// compile an arena into a flat Uint8 grid + a fresh-clone spawn record
export function buildArena(i) {
    const a = ARENAS[((i % ARENAS.length) + ARENAS.length) % ARENAS.length]
    const W = a.rows[0].length
    const H = a.rows.length
    const grid = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
        if (a.rows[y].length !== W) throw new Error(`arena ${a.name} row ${y} ragged`)
        for (let x = 0; x < W; x++) grid[y * W + x] = a.rows[y][x] === '#' ? 1 : 0
    }
    for (const [k, p] of [['p1', a.p1], ['p2', a.p2]]) {
        if (grid[p.y * W + p.x] !== 0 || grid[(p.y + 1) * W + p.x] !== 1) {
            throw new Error(`arena ${a.name}: spawn ${k} ${p.x},${p.y} is not standing in air on stone`)
        }
    }
    return { name: a.name, W, H, grid: Array.from(grid), p1: { ...a.p1 }, p2: { ...a.p2 } }
}

export const ARENAS_COUNT = ARENAS.length
