// PRINCE OF PERSIA — the dungeon, as data. Five hand-built one-screen rooms
// (19x12 tiles at 32 px) ending in the throne of Jaffar. Pure data: the same
// grid the tab paints is what scripts/popcheck.mjs audits. No Math.random.
//
// Legend (single chars, padded to width with '.'):
//   '#' solid brick      '=' thin ledge (land on top, pass under)
//   '~' loose tile       '^' spikes (always live)   's' spikes on a port
//   'p' pressure plate   'g' portcullis (open while its port is pressed)
//   '<' exit door        'G' guard spawn   'J' Jaffar   'o' torch (decor)
//   'L' life potion      'S' strength potion  'V' levitation  'X' poison

export const W = 19
export const H = 12

export const EMPTY = 0, SOLID = 1, PLATFORM = 2, LOOSE = 3, SPIKE = 4, SPIKE_PORTED = 5,
    GATE = 6, PLATE = 7, TORCH = 8, EXIT = 9

export const CODE = {
    '.': EMPTY, '#': SOLID, '=': PLATFORM, '~': LOOSE, '^': SPIKE, 's': SPIKE_PORTED,
    'p': PLATE, 'g': GATE, 'o': TORCH, '<': EXIT,
    'G': EMPTY, 'J': EMPTY, 'L': EMPTY, 'S': EMPTY, 'V': EMPTY, 'X': EMPTY,
}

const LEVELS = [
    { // 1 — the tutorial cells: pits, a crumbling tile, a step up. No blades yet.
        name: 'THE DUNGEON',
        rows: [
            '...................',
            '...................',
            '...o.............o.',
            '...................',
            '...................',
            '..............##...',
            '..............##...',
            '...................',
            '=========..~======<',
            '#########..########',
            '#########^^########',
            '###################',
        ],
        guards: [], pots: [], guills: [],
        start: { c: 1.5, r: 8 },
    },
    { // 2 — the first duel, and the port: cross the plate and the spikes retract.
        name: 'THE PORT',
        rows: [
            '...................',
            '...................',
            '..o.............o..',
            '...................',
            '...................',
            '...................',
            '...................',
            '...................',
            '==L==p.....ssG.gg<.',
            '###################',
            '###################',
            '###################',
        ],
        guards: [{ c: 13, patrol: [10, 16], hp: 3, type: 'fibula' }],
        pots: [{ c: 3, type: 'L' }],
        guills: [],
        start: { c: 1.5, r: 8 },
    },
    { // 3 — the guillotine gallery: time the falling blade, sprint the crumbling bridge.
        name: 'THE GUILLOTINE',
        rows: [
            '...................',
            '....o.......o......',
            '...................',
            '...................',
            '...................',
            '...................',
            '...................',
            '...................',
            '====G===!=S==~~~==<',
            '#############...###',
            '#############^^^###',
            '###################',
        ],
        guards: [{ c: 4, patrol: [2, 6], hp: 2, type: 'skeleton' }],
        pots: [{ c: 10, type: 'S' }],
        guills: [{ c: 8, rTop: 5, rBot: 8 }],
        start: { c: 1.5, r: 8 },
    },
    { // 4 — the alchemist store: drink well. The poison waits where greed walks.
        name: 'THE STOREHOUSE',
        rows: [
            '...................',
            '...................',
            '...o.....o.........',
            '...................',
            '...................',
            '...................',
            '...................',
            '...................',
            '===p.L.X.V.Gssss..<',
            '###################',
            '###################',
            '###################',
        ],
        guards: [{ c: 11, patrol: [11, 15], hp: 3, type: 'shadow' }],
        pots: [{ c: 5, type: 'L' }, { c: 7, type: 'X' }, { c: 9, type: 'V' }],
        guills: [],
        start: { c: 1.5, r: 8 },
    },
    { // 5 — the throne. Jaffar waits; the princess door only opens for a dead Vizier.
        name: "JAFFAR'S THRONEROOM",
        rows: [
            '..o.............o..',
            '...................',
            '...............#...',
            '...............#...',
            '...............#...',
            '...............#...',
            '...............#...',
            '...............g...',
            '===p.....ssss.Jg..<',
            '###################',
            '###################',
            '###################',
        ],
        guards: [{ c: 14, patrol: [12, 16], hp: 6, boss: true, type: 'jaffar' }],
        pots: [{ c: 4, type: 'L' }],
        guills: [],
        start: { c: 1.5, r: 8 },
        needBoss: true,
    },
]

export const LEVEL_COUNT = LEVELS.length

export function makeLevel(i) {
    const src = LEVELS[i]
    const grid = new Array(W * H).fill(EMPTY)
    const guards = []
    const pots = []
    let exit = null
    for (let r = 0; r < H; r++) {
        const row = src.rows[r]
        if (row.length !== W) throw new Error(`level ${i} row ${r} width ${row.length}`)
        for (let c = 0; c < W; c++) {
            const ch = row[c]
            grid[r * W + c] = CODE[ch] ?? EMPTY
            if (ch === '<') exit = { c, r }
            if (ch === 'G' || ch === 'J') {
                const spec = src.guards.find((gp) => gp.c === c)
                guards.push({
                    c, r,
                    patrol: spec?.patrol || [c - 2, c + 2],
                    hp: spec?.hp || 2,
                    boss: ch === 'J' || !!spec?.boss,
                    type: spec?.type || (ch === 'J' ? 'jaffar' : 'green'),
                })
            }
            if (ch === 'L' || ch === 'S' || ch === 'V' || ch === 'X') pots.push({ c, r, type: ch })
        }
    }
    const plates = []
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (grid[r * W + c] === PLATE) plates.push({ c, r })
    const gates = []
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (grid[r * W + c] === GATE) gates.push({ c, r })
    return {
        id: i,
        name: src.name,
        grid,
        guards: guards.map((g) => ({ ...g })),
        pots: pots.map((p) => ({ ...p })),
        guills: (src.guills || []).map((gu) => ({ ...gu })),
        plates,
        gates,
        exit,
        start: { ...src.start },
        needBoss: !!src.needBoss,
    }
}
