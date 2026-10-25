// EMBERWOOD — world data. Screens are 16x11 grids of 16px tiles (256x176 units).
// Tile legend:
//   T tree  # rock/wall  = fence  H house wall  R roof  I sign  ~ water  b bridge
//   . floor  " tall grass (slashable)  , path  < exit portal  C cracked wall
//   a ash floor (walkable, act two)  v crag (solid, act two)
// Entity meta (all in tile coords):
//   chests:[{id,x,y,item,after}]   doors:[{id,x,y,kind,switch,to,entry:[x,y]}]
//   switches:[{id,x,y,via,opens}]  plates:[{id,x,y}]  cracks:[{id,x,y,reveal,amount}]
//   enemies:[{type,x,y,i,drop,boss}]  npcs:[{id,kind,x,y,msg,wander:[[x,y]..]}]  signs:[{x,y,msg}]
//   warps:[{x,y,to,sx,sy}]  exits:{n/e/s/w:{to,x,y}}  spawn:[x,y] entry point
//   braziers:[{x,y}] (decor)  vents:[{id,x,y}] (act two: spore vents, seal with a gust)
// kind: 'key' | 'bigkey' | 'switch' (opens when linked switch fires) | 'heart' (Ember Heart).

export const TS = 16
export const SW = 16
export const SH = 11

const S = (id, name, rows, meta = {}) => ({ id, name, rows, dark: false, ...meta })

export const SCREENS = {
    'ow-00': S('ow-00', 'THE WOOD', [
        'TTTTTTTTTTTTTTTT',
        'T..C........T..T',
        'T..~~~......T..T',
        'T..~~~......T..T',
        'T...~~......##.T',
        'T.....""....##..',
        'T.."""".....#..T',
        'T......T.......T',
        'T.TT.....###...T',
        'T.....S.#######T',
        'TTTT.TTTTTTTTTTT',
    ], {
        exits: { e: { to: 'ow-10', x: 0, y: 5 }, s: { to: 'ow-01', x: 5, y: 0 } },
        warps: [{ x: 6, y: 9, to: 'd1-e0', sx: 7, sy: 8 }],
        cracks: [{ id: 'ck-00', x: 3, y: 1, reveal: 'embers', amount: 25 }],
        chests: [{ id: 'ch-00', x: 12, y: 1, item: 'heart' }],
        enemies: [
            { type: 'cinderling', x: 10, y: 2, i: 0, drop: 'key' },
            { type: 'cinderling', x: 5, y: 7, i: 1, drop: 'ember' },
            { type: 'sprig', x: 3, y: 5, i: 2 },
            { type: 'bat', x: 12, y: 6, i: 3 },
        ],
    }),
    'ow-10': S('ow-10', 'THE OLD SHRINE', [
        'TTTTTTTT.TTTTTTT',
        'T.TT...T...T...T',
        'T.T..C...TTTT..T',
        'T....T....T....T',
        'T.T.....S......T',
        '.........b......',
        'T.T.TT.........T',
        'T...T..."".....T',
        'T.TTTTT....T...T',
        'T....."".......T',
        'TTTT.TTTTTTTTTTT',
    ], {
        exits: { w: { to: 'ow-00', x: 15, y: 5 }, s: { to: 'ow-11', x: 5, y: 0 }, n: { to: 'ow-20', x: 8, y: 10 } },
        warps: [{ x: 8, y: 4, to: 'd2-f0', sx: 7, sy: 8 }],
        doors: [{ id: 'dr-heart', x: 8, y: 0, kind: 'heart', to: 'ow-20', entry: [8, 10] }],
        cracks: [{ id: 'ck-10', x: 5, y: 2, reveal: 'heart' }],
        chests: [],
        signs: [{ x: 10, y: 1, msg: 'ASHFELL GATE — THE NORTH WAY UP. IT OPENED FOR NONE... UNTIL THE WYRM\u2019S HEART WAS CARRIED.' }],
        enemies: [
            { type: 'bat', x: 8, y: 1, i: 0 },
            { type: 'wisp', x: 12, y: 3, i: 1 },
            { type: 'sprig', x: 6, y: 7, i: 2 },
            { type: 'cinderling', x: 10, y: 8, i: 3 },
            { type: 'pod', x: 10, y: 6, i: 4 },
        ],
    }),
    'ow-01': S('ow-01', 'FERN HOLLOW', [
        'TTTT.TTTTTTTTTTT',
        'T....~~~~~.....T',
        'T....~~~~~..T..T',
        'T.T..~~~~~.....T',
        'T....~~~~~...T.T',
        'T.....b.........',
        'T....~~~~~.T...T',
        'T.T..~~~~~.....T',
        'T....~~~~~.....T',
        'T..""~~~~~.....T',
        'TTTTTTTTTTTTTTTT',
    ], {
        exits: { n: { to: 'ow-00', x: 5, y: 10 }, e: { to: 'ow-11', x: 0, y: 5 } },
        warps: [],
        cracks: [],
        chests: [{ id: 'ch-01', x: 13, y: 1, item: 'shield' }],
        enemies: [
            { type: 'sprig', x: 3, y: 8, i: 0 },
            { type: 'sprig', x: 8, y: 9, i: 1 },
            { type: 'spitter', x: 12, y: 7, i: 2 },
            { type: 'wisp', x: 2, y: 5, i: 3 },
            { type: 'tuskroot', x: 12, y: 3, i: 4 },
        ],
    }),
    'ow-11': S('ow-11', 'EMBERWOOD TOWN', [
        'TTTTT.TTTTTTTTTT',
        'T.RRR..........T',
        'T.HHH.I........T',
        'T.....~~~......T',
        'T.....~~~......T',
        '..I.............',
        'T....="".......T',
        'T....="".......T',
        'T..T.....T...T.T',
        'T....."".......T',
        'TTTTTTTTTTTTTTTT',
    ], {
        exits: { n: { to: 'ow-10', x: 5, y: 10 }, w: { to: 'ow-01', x: 15, y: 5 } },
        spawn: [8, 6],
        warps: [],
        cracks: [],
        chests: [],
        npcs: [
            { id: 'shop', kind: 'shop', x: 5, y: 1, msg: 'WELCOME TO THE EMBER SHOP, TRAVELER.',
                wander: [[5, 1], [6, 1], [7, 1], [8, 1], [8, 2], [9, 2], [9, 1]] },
            { id: 'colporter', kind: 'shop', x: 2, y: 9, requires: 'blade', msg: 'HMPH. THE BLADE SUITS YE. SO DO ME WARES.',
                wander: [[2, 9], [1, 9], [2, 9], [2, 8], [2, 9], [3, 9]] },
            { id: 'elder', kind: 'oldman', x: 12, y: 8, msg: 'THE CINDER WYRM SLEEPS BENEATH THE SHRINE. ITS SCALECLOAK SHRUGS OFF STEEL — FIRE AN ARROW INTO ITS OPENING MAW TO STAGGER IT, THEN STRIKE.',
                wander: [[12, 8], [11, 8], [11, 9], [12, 9]] },
        ],
        signs: [
            { x: 7, y: 2, msg: 'EMBER SHOP — STAND BY THE KEEPER AND PRESS A. POTION, ARROWS, BOMBS, SHIELD — AND, FOR 150 EMBERS, THE EMBER BLADE.' },
            { x: 2, y: 5, msg: 'WEST: FERN HOLLOW — A SHIELD WAITS BEYOND THE FERNS.' },
            { x: 13, y: 3, msg: 'EAST AND NORTH: THE SHRINE, THE WOOD, AND TWO DARK DOORS BELOW.' },
            { x: 1, y: 8, msg: 'A COLPORTER HIDES IN THE SOUTHWEST CORNER — BUT ONLY FOR THOSE WHO CARRY THE EMBER BLADE.' },
        ],
        enemies: [{ type: 'cinderling', x: 13, y: 9, i: 0 }],
    }),

    // ---------------- DUNGEON 1 — BRAMBLE HOLLOW (the bow lives here) ----------------
    'd1-e0': S('d1-e0', 'BRAMBLE HOLLOW I', [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#.....##.......#',
        '#.....##.......#',
        '#..............#',
        '#..~~..........#',
        '#..~~..........#',
        '#<.............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr1-0', x: 7, y: 0, kind: 'key', to: 'd1-e1', entry: [7, 8] }],
        chests: [{ id: 'ch-e0', x: 9, y: 2, item: 'key' }],
        enemies: [
            { type: 'cinderling', x: 4, y: 6, i: 0, drop: 'key' },
            { type: 'cinderling', x: 12, y: 7, i: 1, drop: 'ember' },
            { type: 'bat', x: 10, y: 5, i: 2 },
        ],
        warps: [{ x: 1, y: 9, to: 'ow-00', sx: 6, sy: 8 }],
    }),
    'd1-e1': S('d1-e1', 'BRAMBLE HOLLOW II', [
        '################',
        '#..............#',
        '#..........C...#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#......##......#',
        '#..............#',
        '#..............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr1-1', x: 7, y: 0, kind: 'switch', switch: 'sw1', to: 'd1-e2', entry: [7, 8] }],
        cracks: [{ id: 'ck-e1', x: 11, y: 2, reveal: 'bow' }],
        plates: [{ id: 'sw1', x: 11, y: 6 }],
        blocks: [{ id: 'bk1', x: 3, y: 6 }],
        chests: [],
        enemies: [
            { type: 'bat', x: 3, y: 2, i: 0 },
            { type: 'bat', x: 2, y: 6, i: 1 },
            { type: 'husk', x: 12, y: 4, i: 2 },
        ],
        warps: [],
    }),
    'd1-e2': S('d1-e2', 'BRAMBLE HOLLOW III', [
        '################',
        '#..............#',
        '#..####........#',
        '#..#..#........#',
        '#..####........#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr1-2', x: 7, y: 0, kind: 'key', to: 'd1-e3', entry: [7, 8] }],
        chests: [{ id: 'ch-e2', x: 12, y: 2, item: 'key' }, { id: 'ch-e2b', x: 3, y: 8, item: 'heart' }],
        enemies: [
            { type: 'spitter', x: 10, y: 2, i: 0 },
            { type: 'pod', x: 8, y: 6, i: 1 },
            { type: 'husk', x: 5, y: 8, i: 2 },
        ],
        warps: [],
    }),
    'd1-e3': S('d1-e3', 'THE MAW', [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#.<............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [],
        chests: [{ id: 'ch-boss1', x: 4, y: 1, item: 'heart', after: 'boss1' }],
        enemies: [{ type: 'maw', x: 7, y: 4, i: 0, boss: 1 }],
        warps: [{ x: 2, y: 9, to: 'ow-00', sx: 6, sy: 8 }],
    }),

    // ---------------- DUNGEON 2 — CINDERKEEP (the bow gates its depths) ----------------
    'd2-f0': S('d2-f0', 'CINDERKEEP I', [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#<.............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr2-0', x: 7, y: 0, kind: 'key', to: 'd2-f1', entry: [7, 8] }],
        chests: [{ id: 'ch-f0', x: 2, y: 2, item: 'key' }],
        enemies: [
            { type: 'sprig', x: 8, y: 5, i: 0 },
            { type: 'sprig', x: 11, y: 7, i: 1 },
            { type: 'wisp', x: 5, y: 6, i: 2 },
        ],
        warps: [{ x: 1, y: 9, to: 'ow-10', sx: 8, sy: 3 }],
    }),
    'd2-f1': S('d2-f1', 'CINDERKEEP II', [
        '################',
        '#...A..........#',
        '#..............#',
        '#...##..##.....#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr2-1', x: 7, y: 0, kind: 'switch', switch: 'sw3', to: 'd2-f2', entry: [7, 8] }],
        switches: [{ id: 'sw3', x: 3, y: 1, via: 'arrow', opens: 'dr2-1' }],
        chests: [{ id: 'ch-f1', x: 12, y: 5, item: 'key' }],
        enemies: [
            { type: 'bat', x: 3, y: 2, i: 0 },
            { type: 'bat', x: 11, y: 2, i: 1 },
            { type: 'spitter', x: 12, y: 7, i: 2 },
            { type: 'pod', x: 8, y: 4, i: 3 },
        ],
        warps: [],
    }),
    'd2-f2': S('d2-f2', 'CINDERKEEP III', [
        '################',
        '#....A.........#',
        '#..............#',
        '#.####.####....#',
        '#.#..........#.#',
        '#.#..........#.#',
        '#.#..........#.#',
        '#.####.####..C.#',
        '#..............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr2-2', x: 7, y: 0, kind: 'switch', switch: 'sw4', to: 'd2-f3', entry: [7, 8] }],
        switches: [{ id: 'sw4', x: 5, y: 1, via: 'arrow', opens: 'dr2-2' }],
        cracks: [{ id: 'ck-f2', x: 13, y: 7, reveal: 'arrows' }],
        chests: [{ id: 'ch-f2', x: 6, y: 5, item: 'heart' }],
        enemies: [
            { type: 'husk', x: 3, y: 8, i: 0, drop: 'key' },
            { type: 'husk', x: 10, y: 2, i: 1 },
            { type: 'wisp', x: 8, y: 6, i: 2 },
        ],
        warps: [],
    }),
    'd2-f3': S('d2-f3', 'CINDERKEEP IV', [
        '################',
        '#..............#',
        '#..............#',
        '#....#..#......#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [{ id: 'dr2-3', x: 7, y: 0, kind: 'bigkey', to: 'd2-f4', entry: [7, 8] }],
        chests: [{ id: 'ch-f3', x: 2, y: 2, item: 'bigkey' }],
        enemies: [
            { type: 'wisp', x: 9, y: 2, i: 0 },
            { type: 'sprig', x: 4, y: 5, i: 1 },
            { type: 'spitter', x: 12, y: 4, i: 2 },
            { type: 'tuskroot', x: 9, y: 7, i: 3 },
        ],
        warps: [],
    }),
    'd2-f4': S('d2-f4', 'THE CINDER WYRM', [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#.#............#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8],
        doors: [],
        chests: [{ id: 'ch-boss2', x: 12, y: 1, item: 'emberheart', after: 'boss2' }],
        enemies: [{ type: 'wyrm', x: 7, y: 4, i: 0, boss: 2 }],
        warps: [],
    }),

    // ==================== ACT TWO — ASHFELL ====================
    'ow-20': S('ow-20', 'ASHFELL ASCENT', [
        'vvvvvvvvvvvvvvvv',
        'vaaaaaaaaaaaaaav',
        'vasaavvvavaaaaav',
        'vaavv~~~vvavaaav',
        'vavaa~~~avvavaav',
        'vaaavaa~~aaavaav',
        'vvvavvaaavvaavvv',
        'vaaavaavvvvavaav',
        'vavvaaavvaavavvv',
        'vaaaav' + 'aaaaaaaaa' + 'v',
        'vvvvvvvva' + 'vvvvvvv',
    ], {
        dark: true, spawn: [8, 10], req: 'emberTaken',
        exits: { s: { to: 'ow-10', x: 8, y: 1 } },
        warps: [{ x: 2, y: 2, to: 'd3-e0', sx: 7, sy: 8 }],
        cracks: [{ id: 'ck-20', x: 13, y: 8, reveal: 'embers', amount: 30 }],
        braziers: [{ x: 4, y: 4 }, { x: 11, y: 6 }],
        chests: [{ id: 'ch-20', x: 13, y: 1, item: 'heart' }],
        enemies: [
            { type: 'pod', x: 9, y: 5, i: 0 },
            { type: 'spitter', x: 13, y: 9, i: 1 },
            { type: 'tuskroot', x: 2, y: 7, i: 2 },
            { type: 'wisp', x: 12, y: 3, i: 3 },
        ],
        signs: [{ x: 6, y: 9, msg: 'ASHFELL — THE SPORE AND THE CINDER. AT THE TOP OF THE SPIRE SITS THE HOLLOW KING, AND THE DAWN HEART BEHIND HIM.' }],
    }),

    // ---------------- DUNGEON 3 — HOLLOW SPIRE (the Gale Charm lives here) ----------------
    'd3-e0': S('d3-e0', 'HOLLOW SPIRE I', [
        '################',
        '#..............#',
        '#..####........#',
        '#..#..#........#',
        '#..####........#',
        '#..............#',
        '#..............#',
        '#..~~..........#',
        '#..~~..........#',
        '#<.............#',
        '################',
    ], {
        dark: true, spawn: [7, 8], req: 'emberTaken',
        doors: [{ id: 'dr3-0', x: 7, y: 0, kind: 'key', to: 'd3-e1', entry: [7, 8] }],
        chests: [{ id: 'ch-3a', x: 12, y: 2, item: 'key' }],
        enemies: [
            { type: 'cinderling', x: 4, y: 6, i: 0, drop: 'key' },
            { type: 'bat', x: 10, y: 5, i: 1 },
            { type: 'spitter', x: 11, y: 7, i: 2 },
        ],
        warps: [{ x: 1, y: 9, to: 'ow-20', sx: 2, sy: 1 }],
    }),
    'd3-e1': S('d3-e1', 'HOLLOW SPIRE II', [
        '################',
        '#s.............#',
        '#..............#',
        '#...###........#',
        '#...#..........#',
        '#...#..........#',
        '#..~~~.........#',
        '#..............#',
        '#.....##...C...#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8], req: 'emberTaken',
        doors: [{ id: 'dr3-1', x: 7, y: 0, kind: 'switch', switch: 'sw-g1', to: 'd3-e2', entry: [7, 8] }],
        switches: [{ id: 'sw-g1', x: 1, y: 1, via: 'gust', opens: 'dr3-1' }],
        cracks: [{ id: 'ck-3b', x: 13, y: 8, reveal: 'arrows' }],
        chests: [{ id: 'ch-3g', x: 8, y: 2, item: 'gale' }],
        braziers: [{ x: 12, y: 5 }],
        enemies: [
            { type: 'husk', x: 12, y: 3, i: 0 },
            { type: 'bat', x: 3, y: 7, i: 1 },
            { type: 'pod', x: 9, y: 6, i: 2 },
        ],
        warps: [],
    }),
    'd3-e2': S('d3-e2', 'HOLLOW SPIRE III', [
        '################',
        '#.....s#.......#',
        '######vv########',
        '#............C.#',
        '#..####.####...#',
        '#..#........#..#',
        '#..#..~~....#..#',
        '#..#........#..#',
        '#..####.####...#',
        '#.....v........#',
        '################',
    ], {
        dark: true, spawn: [7, 8], req: 'emberTaken',
        doors: [{ id: 'dr3-2', x: 7, y: 0, kind: 'switch', switch: 'sw-g2', to: 'd3-e3', entry: [7, 8] }],
        switches: [{ id: 'sw-g2', x: 6, y: 1, via: 'gust', opens: 'dr3-2' }],
        vents: [{ id: 'v-3a', x: 6, y: 2 }, { id: 'v-3b', x: 7, y: 2 }, { id: 'v-3c', x: 6, y: 9 }],
        cracks: [{ id: 'ck-3c', x: 13, y: 3, reveal: 'heart' }],
        chests: [{ id: 'ch-3c', x: 5, y: 7, item: 'heart' }],
        enemies: [
            { type: 'spitter', x: 9, y: 5, i: 0 },
            { type: 'bat', x: 5, y: 5, i: 1 },
            { type: 'pod', x: 9, y: 8, i: 2 },
            { type: 'wisp', x: 12, y: 9, i: 3 },
        ],
        warps: [],
    }),
    'd3-e3': S('d3-e3', 'HOLLOW SPIRE IV', [
        '################',
        '#..............#',
        '#.####.####....#',
        '#.#........#...#',
        '#.#...B....#...#',
        '#.#........#.###',
        '#.#..~~....#...#',
        '#.####.###.....#',
        '#......#.......#',
        '#..............#',
        '################',
    ], {
        dark: true, spawn: [7, 8], req: 'emberTaken',
        doors: [{ id: 'dr3-3', x: 7, y: 0, kind: 'switch', switch: 'sw-3p', to: 'd3-f0', entry: [7, 8] }],
        plates: [{ id: 'sw-3p', x: 6, y: 1 }],
        blocks: [{ id: 'bk-3', x: 6, y: 4 }],
        chests: [{ id: 'ch-3d', x: 13, y: 2, item: 'heart' }],
        enemies: [
            { type: 'tuskroot', x: 12, y: 5, i: 0 },
            { type: 'wisp', x: 9, y: 8, i: 1 },
            { type: 'spitter', x: 3, y: 8, i: 2 },
        ],
        warps: [],
    }),
    'd3-f0': S('d3-f0', 'THE HOLLOW KING', [
        '################',
        '#..............#',
        '#.v..........v.#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#.#............#',
        '#<.............#',
        '################',
    ], {
        dark: true, spawn: [7, 8], req: 'emberTaken',
        doors: [],
        vents: [{ id: 'v-k1', x: 2, y: 2 }, { id: 'v-k2', x: 13, y: 2 }],
        braziers: [{ x: 5, y: 1 }, { x: 10, y: 1 }],
        chests: [{ id: 'ch-boss3', x: 7, y: 1, item: 'dawnheart', after: 'boss3' }],
        enemies: [{ type: 'king', x: 7, y: 4, i: 0, boss: 3 }],
        warps: [{ x: 1, y: 9, to: 'ow-20', sx: 8, sy: 9 }],
    }),
}

for (const id of Object.keys(SCREENS)) {
    const scr = SCREENS[id]
    if (scr.rows.length !== SH) throw new Error(`screen ${id} has ${scr.rows.length} rows`)
    scr.rows = scr.rows.map(r => {
        if (r.length !== SW) throw new Error(`screen ${id} row "${r}" width ${r.length}`)
        return r
    })
}

const SOLID_TILES = new Set(['T', '#', 'H', 'R', '=', '~', 'I', 'A'])

export const tileAt = (scr, x, y) => {
    if (!scr || x < 0 || y < 0 || x >= SW || y >= SH) return '#'
    return scr.rows[y][x]
}

export const isSolidTile = (ch) => SOLID_TILES.has(ch)

export const SHOP = [
    { item: 'potion', label: 'POTION', price: 20 },
    { item: 'arrows', label: 'ARROWS x10', price: 20 },
    { item: 'bombs', label: 'BOMBS x4', price: 30 },
    { item: 'shield', label: 'SHIELD', price: 80 },
    { item: 'blade', label: 'EMBER BLADE', price: 150 },
]

export const SECRET_SHOP = [
    { item: 'potion', label: 'POTION', price: 15 },
    { item: 'arrows', label: 'ARROWS x20', price: 30 },
    { item: 'key', label: 'BRASS KEY', price: 25 },
    { item: 'heart', label: 'HEART CONTAINER', price: 400 },
]
