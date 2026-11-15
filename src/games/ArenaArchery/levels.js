// ARENA ARCHERY — two hand-carved duelling grounds. '#' is stone, '.' is air.
// Every ledge is reachable — and #2307 made that word mean PHYSICS, not
// wishful comments. Measured against the real integrator, a granted hop is a
// run-up-at-speed whose apex-glide (~2.6 px/tick over ~17 airborne ticks)
// carries the body PAST the slab's near edge and down onto its top — which
// only settles when there is a PARAPET one step further: the far lip has to
// be stone one row higher (and the head must pass under it on the way).
// A parapet-less slab is a diving board: the glide overshoots and the body
// lands back on the floor. Every chain here is a run of one-row steps, each
// with its parapet, each verified by `archerycheck`'s CLIMBS section —
// which asks the same moveBody the tab runs, not a comment. Carved
// empty-first like IronKeep: the roof and floor are the grid border, so
// nothing leaks. Rows are hand-counted TWICE: #2307 lost an hour to a
// 19-char row that shifted every cell right of the hole.

const ARENAS = [
    {
        name: 'CROSSGLOVE',
        // four tiers per side; each step's far end carries its parapet.
        rows: [
            '####################',
            '#..................#',
            '#..................#',
            '#..................#',
            '#.......####.......#',
            '#..................#',
            '#......##....##....#',
            '#..................#',
            '#.....##......##...#',
            '#..................#',
            '#.###..........###.#',
            '#..................#',
            '####################',
        ],
        p1: { x: 5, y: 11 },
        p2: { x: 12, y: 11 },
    },
    {
        name: 'KNOCKBACK',
        // two facing towers: climb the outer spurs to the inner balconies;
        // the crown blocks step above the top balconies.
        rows: [
            '####################',
            '#..................#',
            '#..................#',
            '#..................#',
            '#......##..##......#',
            '#..................#',
            '#.....###....###...#',
            '#..................#',
            '#....##........##..#',
            '#..................#',
            '#.###..........###.#',
            '#..................#',
            '####################',
        ],
        p1: { x: 4, y: 11 },
        p2: { x: 15, y: 11 },
    },
    {
        name: 'THE NEST',
        // CROSSGLOVE's proven climb geometry plus the sniper cupola at row 2:
        // both wings chain floor→9→7→5 into the central nest ledge, and the
        // cupola pair is roof-blocked from below by design — reachable only
        // by an arrow's arc, never by feet (the lob-bot's favourite decoy).
        rows: [
            '####################',
            '#..................#',
            '#..............##..#',
            '#..................#',
            '#.......####.......#',
            '#..................#',
            '#......##....##....#',
            '#..................#',
            '#.....##......##...#',
            '#..................#',
            '#.###..........###.#',
            '#..................#',
            '####################',
        ],
        p1: { x: 5, y: 11 },
        p2: { x: 12, y: 11 },
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
