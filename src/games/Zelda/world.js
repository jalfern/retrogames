// WORLD — Hyrule as data. 3x3 overworld screens around the classic World-1
// start, a sword cave, a bombable tree secret, a bomb shop, and a three-room
// Level-1. Everything the Node harness audits (screen graph, the load-bearing
// push-block lock, bomb walls vs bombs) reads from this file; the sim and the
// renderer never invent geography.
//
// Screens are 16x11 tiles of 16px (256x176 play field + 64px HUD = 256x240,
// the NES frame). Tiles:
//   . grass   , sand/dirt path   # tree      R rock/cliff   W water (wall)
//   f flower  g gravestone       C cave mouth (walk UP into it)
//   D dungeon door               S shop door T bombable tree secret
//   o dungeon floor  x dungeon wall  O open door  L locked door (needs switch)
//   B pushable block s switch tile   p smashable pot   F triforce pedestal
//
// Edge exits are EXPLICIT (col/row ranges): the graph the harness proves is
// the graph the player can actually walk.

export const TILE = 16
export const COLS = 16
export const ROWS = 11
export const PLAY_H = ROWS * TILE          // 176
export const HUD_H = 64
export const W = COLS * TILE               // 256
export const H = PLAY_H + HUD_H            // 240

export const WALLS_OVER = new Set(['#', 'R', 'W', 'g'])
export const WALLS_DUNGEON = new Set(['x'])
export const SOLID_SHOP = new Set(['R'])

export function isWall(ch, kind) {
    if (ch === undefined) return true
    if (kind === 'dungeon') return WALLS_DUNGEON.has(ch) || ch === 'L'
    if (kind === 'shop') return SOLID_SHOP.has(ch)
    return WALLS_OVER.has(ch)
}

export const SCREENS = {
    '1,1': {
        name: 'START',
        rows: [
            '#.............#.',
            '....f.........f.',
            '.........,RRRRRR',
            '....,....,RRRRRR',
            '....,..,..RCCR.R',
            '....,.........f.',
            '...f..#.........',
            '....,......f....',
            '.#..,...#.......',
            '....,.f.........',
            '................',
        ],
        up: { to: '1,0', cols: [3, 10] },
        down: { to: '1,2', cols: [3, 10] },
        left: { to: '0,1', rows: [3, 7] },
        right: { to: '2,1', rows: [5, 7] },
        cave: { to: 'CAVE_SWORD', at: [12, 4] },
        enemies: [
            { type: 'octorok', x: 3, y: 5, i: 0 },
            { type: 'octorok', x: 7, y: 7, i: 1 },
            { type: 'blueoc', x: 9, y: 5, i: 2 },
            { type: 'rupee', x: 5, y: 8, worth: 1 },
            { type: 'rupee', x: 14, y: 1, worth: 1 },
        ],
    },
    '1,0': {
        name: 'DOOR CLIFFS',
        rows: [
            'RRRRRRRDRRRRRRRR',
            '................',
            '..f....,........',
            '......R,....#...',
            '......R,..,.....',
            '....f..,..,.....',
            '......#...,.....',
            '..#........f....',
            '....,....#......',
            '....,.f.........',
            '................',
        ],
        down: { to: '1,1', cols: [3, 10] },
        left: { to: '0,0', rows: [4, 7] },
        right: { to: '2,0', rows: [4, 7] },
        door: { to: 'D0', at: [7, 0] },
        enemies: [
            { type: 'octorok', x: 3, y: 6, i: 0 },
            { type: 'blueoc', x: 12, y: 5, i: 1 },
            { type: 'octorok', x: 10, y: 8, i: 2 },
            { type: 'rupee', x: 1, y: 3, worth: 5 },
        ],
    },
    '0,0': {
        name: 'LAKE SHORE',
        rows: [
            '.....WWW........',
            '..f.WWWWW.......',
            '....WWWWW#......',
            '..#.WWWWW....f..',
            '......#....R....',
            '.....,..,.......',
            '....f....f......',
            '..#....#........',
            '....,......#....',
            '....,.f.........',
            '................',
        ],
        down: { to: '0,1', cols: [7, 13] },
        right: { to: '1,0', rows: [4, 7] },
        enemies: [
            { type: 'tektite', x: 6, y: 4, i: 0 },
            { type: 'tektite', x: 11, y: 6, i: 1 },
            { type: 'zol', x: 2, y: 6, i: 2 },
            { type: 'rupee', x: 6, y: 9, worth: 1 },
        ],
    },
    '2,0': {
        name: 'NORTHERN FLATS',
        rows: [
            '..............#.',
            '...f.....f......',
            '......#.........',
            '.....,..,...f...',
            '..#..,..,...,...',
            '.....,..#.......',
            '........f.......',
            '....#......#....',
            '..f....,........',
            '....,.f.........',
            '................',
        ],
        down: { to: '2,1', cols: [3, 10] },
        left: { to: '1,0', rows: [4, 7] },
        enemies: [
            { type: 'blueoc', x: 4, y: 3, i: 0 },
            { type: 'moblin', x: 11, y: 3, i: 1 },
            { type: 'moblin', x: 12, y: 8, i: 2 },
            { type: 'rupee', x: 8, y: 6, worth: 1 },
        ],
    },
    '0,1': {
        name: 'WEST FOREST',
        rows: [
            'RRRRCR#.........',
            '....T....#......',
            '..#....f........',
            '....,.....f.....',
            '.f..,..,...#....',
            '....,..#........',
            '...#....f..#....',
            '..f.....,.......',
            '....,......f....',
            '....,.#.........',
            '....,...........',
        ],
        up: { to: '0,0', cols: [7, 13] },
        down: { to: '0,2', cols: [6, 6] },
        right: { to: '1,1', rows: [3, 7] },
        secret: { crack: [4, 1], cave: { to: 'CAVE_BOMBS', at: [4, 0] } },
        enemies: [
            { type: 'zol', x: 8, y: 4, i: 0 },
            { type: 'zol', x: 10, y: 7, i: 1 },
            { type: 'octorok', x: 6, y: 9, i: 2 },
            { type: 'rupee', x: 2, y: 2, worth: 1 },
        ],
    },
    '2,1': {
        name: 'TEKTITE FLATS',
        rows: [
            '..............#.',
            '....f......#....',
            '..#.............',
            '.....,....f.....',
            '......,..#......',
            '..f.....,.......',
            '...#......f.....',
            '......#.........',
            '....f....#......',
            '..#........f....',
            '................',
        ],
        up: { to: '2,0', cols: [3, 10] },
        down: { to: '2,2', cols: [3, 10] },
        left: { to: '1,1', rows: [5, 7] },
        enemies: [
            { type: 'tektite', x: 7, y: 4, i: 0 },
            { type: 'tektite', x: 10, y: 7, i: 1 },
            { type: 'tektite', x: 4, y: 8, i: 2 },
            { type: 'moblin', x: 12, y: 2, i: 3 },
            { type: 'rupee', x: 13, y: 9, worth: 5 },
        ],
    },
    '0,2': {
        name: 'SHOP YARD',
        rows: [
            '..RRRR.RRRRRRRR.',
            '..RRRS.RRRRRRRR.',
            '......,.........',
            '..f...,...f.....',
            '..#...,.........',
            '.....#..#....#..',
            '..f........f....',
            '..#...........#.',
            '....,.....#.....',
            '....,.f.........',
            '................',
        ],
        up: { to: '0,0', cols: [6, 6] },
        right: { to: '1,2', cols: [3, 10] },
        shop: { to: 'SHOP', at: [5, 1] },
        enemies: [
            { type: 'octorok', x: 10, y: 5, i: 0 },
            { type: 'blueoc', x: 12, y: 7, i: 1 },
            { type: 'rupee', x: 8, y: 3, worth: 1 },
        ],
    },
    '1,2': {
        name: 'GRAVEYARD',
        rows: [
            '................',
            '.g..g..f...g..g.',
            '................',
            '..f...#....f....',
            '....,..#........',
            '..#.............',
            '...g.....g......',
            '..f......#......',
            '....,......#....',
            '..#,.f..........',
            '....,...........',
        ],
        up: { to: '1,1', cols: [3, 10] },
        left: { to: '0,2', rows: [4, 8] },
        right: { to: '2,2', rows: [4, 8] },
        enemies: [
            { type: 'keese', x: 4, y: 3, i: 0 },
            { type: 'keese', x: 9, y: 2, i: 1 },
            { type: 'keese', x: 12, y: 5, i: 2 },
            { type: 'zol', x: 7, y: 7, i: 3 },
            { type: 'rupee', x: 6, y: 6, worth: 5 },
        ],
    },
    '2,2': {
        name: 'SOUTH SHORE',
        rows: [
            '.....#......f...',
            '..f....#........',
            '......WWWW......',
            '..#..WWWWW..#...',
            '..f.WWWWWW......',
            '....WWWWW#..f...',
            '...#.....,......',
            '......f..,....#.',
            '..#.....,..f....',
            '......#..,......',
            '................',
        ],
        up: { to: '2,1', cols: [3, 10] },
        left: { to: '1,2', rows: [4, 8] },
        enemies: [
            { type: 'dog', x: 12, y: 1, i: 0 },
            { type: 'blueoc', x: 3, y: 7, i: 1 },
            { type: 'moblin', x: 9, y: 9, i: 2 },
            { type: 'rupee', x: 8, y: 10, worth: 1 },
        ],
    },
}

for (const s of Object.values(SCREENS)) s.kind = 'over'

export const INTERIORS = {
    CAVE_SWORD: {
        kind: 'shop', name: 'SWORD CAVE',
        rows: [
            'RRRRRRRRRRRRRRRR',
            'RR............RR',
            'R..............R',
            'R..............R',
            'R.....K........R',
            'R..............R',
            'R..............R',
            'RR............RR',
            'RRR..........RRR',
            'RRR,,......,,RRR',
            'RRR,,,,,,,,,RRRR',
        ],
        exit: { to: '1,1', c: 12, r: 5 },
        talk: { at: [6, 4], who: 'old', lines: ['IT\'S DANGEROUS TO GO ALONE!', 'TAKE THIS.'], gives: 'sword' },
    },
    CAVE_BOMBS: {
        kind: 'shop', name: 'SECRET CAVE',
        rows: [
            'RRRRRRRRRRRRRRRR',
            'RR............RR',
            'R..............R',
            'R.....K........R',
            'R..............R',
            'R..............R',
            'RR............RR',
            'RRR..........RRR',
            'RRR,,......,,RRR',
            'RRR,,,,,,,,,RRRR',
            'RRR,,,,,,,,,RRRR',
        ],
        exit: { to: '0,1', c: 4, r: 2 },
        talk: { at: [6, 3], who: 'old', lines: ['TAKE THIS.', 'AND USE IT WELL.'], gives: 'bombs5' },
    },
    SHOP: {
        kind: 'shop', name: 'BOMB SHOP',
        rows: [
            'RRRRRRRRRRRRRRRR',
            'RR............RR',
            'R..............R',
            'R.....K........R',
            'R..............R',
            'R..............R',
            'RR............RR',
            'RRR..........RRR',
            'RRR,,......,,RRR',
            'RRR,,,,,,,,,RRRR',
            'RRR,,,,,,,,,RRRR',
        ],
        exit: { to: '0,2', c: 5, r: 2 },
        talk: { at: [6, 3], who: 'shop', lines: ['BUY BOMBS!', '15 RUPEES.'], gives: 'buy' },
    },
    // ---- level 1 ------------------------------------------------------------
    D0: {
        kind: 'dungeon', name: 'LEVEL-1',
        rows: [
            'xxxxxxx..xxxxxxx',
            'xo....xx....p.ox',
            'xo....xx......ox',
            'xo............ox',
            'xo....xx......ox',
            'xo....xx......ox',
            'xo....xx......ox',
            'xo......xx....ox',
            'xo.p....xx..p.ox',
            'xo............ox',
            'xxxxxxx..xxxxxxx',
        ],
        down: { to: '1,0' },
        up: { to: 'D1' },
        enemies: [
            { type: 'keese', x: 3, y: 2, i: 0 },
            { type: 'keese', x: 12, y: 2, i: 1 },
            { type: 'keese', x: 8, y: 6, i: 2 },
        ],
        container: [10, 5],
    },
    D1: {
        kind: 'dungeon', name: 'LEVEL-1',
        rows: [
            'xxxxxxxxxxxxxxxx',
            'xo.....xx.....ox',
            'xp.....xx...p.ox',
            'xo....s.......ox',
            'xo.............O',
            'xo....B...xx...O',
            'xo........xx..ox',
            'xo...xx.......ox',
            'xp...xx.....p.ox',
            'xo............ox',
            'xxxxxxx..xxxxxxx',
        ],
        down: { to: 'D0' },
        east: { to: 'D2', locked: true },
        enemies: [
            { type: 'stalfos', x: 2, y: 2, i: 0 },
            { type: 'stalfos', x: 9, y: 8, i: 1 },
            { type: 'moblin', x: 2, y: 9, i: 2 },
        ],
    },
    D2: {
        kind: 'dungeon', name: 'LEVEL-1',
        rows: [
            'xxxxxxxxxxxxxxxx',
            'xo............ox',
            'xo..F.......p.ox',
            'xo..x.........ox',
            'Oo............ox',
            'Oo............ox',
            'xo..x.........ox',
            'xo..........p.ox',
            'xp........xx..ox',
            'xo.......xx...ox',
            'xxxxxxxxxxxxxxxx',
        ],
        west: { to: 'D1' },
        enemies: [
            { type: 'aquamentus', x: 11, y: 5, i: 0 },
        ],
    },
}

// The screen graph as data, so the harness can walk it without the sim.
export const GRAPH = []
for (const [id, s] of Object.entries(SCREENS)) {
    for (const dir of ['up', 'down', 'left', 'right']) {
        if (s[dir]) GRAPH.push({ from: id, dir, to: s[dir].to, span: s[dir].cols || s[dir].rows, lock: null })
    }
    if (s.cave) GRAPH.push({ from: id, dir: 'cave', to: s.cave.to, lock: null })
    if (s.secret) GRAPH.push({ from: id, dir: 'secret', to: s.secret.cave.to, lock: 'crack' })
    if (s.shop) GRAPH.push({ from: id, dir: 'shop', to: s.shop.to, lock: null })
}
for (const [id, s] of Object.entries(INTERIORS)) {
    if (s.exit) GRAPH.push({ from: id, dir: 'exit', to: s.exit.to, lock: null })
    for (const dir of ['up', 'down', 'left', 'right', 'east', 'west']) {
        if (s[dir]) GRAPH.push({ from: id, dir, to: s[dir].to, lock: s[dir].locked ? 'switch' : null })
    }
}

export function screenOf(id) { return SCREENS[id] || INTERIORS[id] }
export function at(scr, c, r) { const row = scr.rows[r]; return row ? row[c] : undefined }
