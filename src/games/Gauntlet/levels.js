// GAUNTLET — level definitions (Atari 1985, four mazes to the top).
//
// The 1985 dungeons are not thin passages: they are open halls cut by chunky
// pillar-blocks with two-cell lanes between them. So a level here is an open
// 24x24 field (border wall) plus 3x3 pillar rectangles punched back in.
// The exit is a walled room sealed by a locked door ('L'); the key always
// sits in the open — scripts/gauntletcheck.mjs audits that order and the
// connectivity of every level.
//
// Grid chars: '#' wall  '.' lane  'D' slam door  'L' locked door  'X' stairs up

export const W = 24, H = 24
export const CELL = 8 // px per cell on the side map

export const HEROES = {
    warrior: { name: 'WARRIOR', who: 'THOR', hp: 170, speed: 1.0, power: 4, arrow: 8, label: 'BRUTE FORCE' },
    valkyrie: { name: 'VALKYRIE', who: 'NIKO', hp: 150, speed: 1.12, power: 3, arrow: 10, label: 'SWIFT SWORD' },
    wizard: { name: 'WIZARD', who: 'MERLIN', hp: 130, speed: 0.95, power: 2, arrow: 18, label: 'HIGH MAGIC' },
    elf: { name: 'ELF', who: 'ATTOR', hp: 150, speed: 1.06, power: 3, arrow: 14, label: 'SHARPEST EYE' },
}
export const HERO_ORDER = ['warrior', 'valkyrie', 'wizard', 'elf']

export const MONSTERS = {
    grunt: { hp: 3, dmg: 12, speed: 0.028, ghost: false, pts: 400 },
    ghost: { hp: 4, dmg: 16, speed: 0.024, ghost: true, pts: 400 },
    demon: { hp: 8, dmg: 22, speed: 0.022, ghost: false, pts: 500 },
    sorcerer: { hp: 5, dmg: 18, speed: 0.020, ghost: false, pts: 600, casts: 'fire' },
    lobber: { hp: 6, dmg: 14, speed: 0.020, ghost: false, pts: 300, casts: 'rock' },
    death: { hp: 24, dmg: 0, speed: 0.052, ghost: true, pts: 0, drain: true },
}

const PX = [3, 8, 13, 18]
const PY = [3, 8, 13, 18]

// remove: pillar indices (row-major i*4+j) punched out; extra: [x,y,w,h,ch].
function baseGrid(remove, extra = []) {
    const g = Array.from({ length: H }, () => Array(W).fill('#'))
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = '.'
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (remove.includes(i * 4 + j)) continue
            for (let y = PY[i]; y < PY[i] + 3; y++) for (let x = PX[j]; x < PX[j] + 3; x++) g[y][x] = '#'
        }
    }
    for (const [x, y, w, h, ch] of extra) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1) g[yy][xx] = ch
    }
    return g
}

// A sealed exit room at the given corner: the outer two sides are the field
// border; two inner walls (with a shared corner cell) close the pocket, and
// the door (given in `doors`) sits in one of them. Interior is punched open
// so overlapping pillars can't wall off the stairs.
function exitRoom(corner) {
    if (corner === 'br') return [[18, 18, 3, 3, '.'], [17, 17, 5, 1, '#'], [17, 21, 5, 1, '#'], [17, 17, 1, 5, '#'], [21, 17, 1, 5, '#']]
    if (corner === 'tl') return [[1, 1, 4, 4, '.'], [5, 1, 1, 5, '#'], [1, 5, 5, 1, '#']]
    if (corner === 'bl') return [[1, 20, 3, 3, '.'], [1, 19, 4, 1, '#'], [4, 19, 1, 4, '#']]
    return []
}

// L1 — THE FIRE WORLD: grunts and ghosts, one locked exit pocket.
const L1 = {
    name: 'LEVEL 1 · THE FIRE WORLD',
    material: 'red',
    remove: [5, 6, 9, 10, 15],
    extra: exitRoom('br'),
    start: { x: 2.5, y: 21.5, a: -Math.PI / 2 },
    exit: [19, 19],
    doors: [
        { x: 17, y: 19, lock: 'L' },
        { x: 7, y: 11, lock: null },
        { x: 12, y: 6, lock: null },
    ],
    props: [
        ['key', 6.5, 2.5],
        ['generator', 9.5, 9.5],
        ['grunt', 2.5, 6.5], ['grunt', 14.5, 2.5], ['grunt', 21.5, 12.5],
        ['ghost', 6.5, 14.5], ['grunt', 14.5, 14.5],
        ['food', 2.5, 11.5], ['food', 11.5, 2.5], ['food', 21.5, 2.5],
        ['food', 4.5, 21.5], ['food', 11.5, 11.5], ['food', 21.5, 11.5],
        ['potion', 21.5, 6.5],
        ['gold', 2.5, 15.5], ['gold', 15.5, 21.5], ['gold', 21.5, 15.5], ['gold', 6.5, 6.5],
    ],
    gen: { comp: ['grunt', 'grunt', 'ghost'], cap: 4, every: 220 },
    deathAt: 1500,
}

// L2 — THE CAVE WORLD: two generators, demons join the roster.
const L2 = {
    name: 'LEVEL 2 · THE CAVE WORLD',
    material: 'green',
    remove: [0, 5, 12, 15, 1],
    extra: exitRoom('tl'),
    start: { x: 21.5, y: 21.5, a: Math.PI * 0.75 },
    exit: [2, 2],
    doors: [
        { x: 2, y: 5, lock: 'L' },
        { x: 6, y: 21, lock: null },
        { x: 11, y: 12, lock: null },
        { x: 17, y: 11, lock: null },
    ],
    props: [
        ['key', 21.5, 2.5],
        ['key', 11.5, 6.5],
        ['generator', 4.5, 11.5], ['generator', 16.5, 4.5],
        ['grunt', 2.5, 9.5], ['demon', 11.5, 2.5], ['grunt', 21.5, 9.5],
        ['ghost', 7.5, 14.5], ['demon', 16.5, 16.5], ['grunt', 14.5, 21.5],
        ['food', 6.5, 2.5], ['food', 21.5, 6.5], ['food', 2.5, 15.5],
        ['food', 16.5, 15.5], ['food', 11.5, 21.5], ['food', 19.5, 19.5],
        ['potion', 21.5, 15.5],
        ['gold', 6.5, 6.5], ['gold', 15.5, 6.5], ['gold', 11.5, 19.5],
    ],
    gen: { comp: ['grunt', 'ghost', 'demon'], cap: 5, every: 190 },
    deathAt: 1300,
}

// L3 — THE CRYSTAL WORLD: sorcerers throw fire down the lanes.
const L3 = {
    name: 'LEVEL 3 · THE CRYSTAL WORLD',
    material: 'blue',
    remove: [2, 4, 7, 11, 14],
    extra: exitRoom('tl'),
    start: { x: 11.5, y: 21.5, a: -Math.PI / 2 },
    exit: [2, 2],
    doors: [
        { x: 2, y: 5, lock: 'L' },
        { x: 11, y: 11, lock: null },
        { x: 17, y: 17, lock: 'L' },
        { x: 6, y: 12, lock: null },
    ],
    props: [
        ['key', 21.5, 11.5],
        ['key', 11.5, 2.5],
        ['generator', 12.5, 9.5], ['generator', 11.5, 12.5],
        ['demon', 2.5, 9.5], ['ghost', 9.5, 2.5], ['sorcerer', 21.5, 4.5],
        ['grunt', 12.5, 16.5], ['demon', 4.5, 16.5], ['ghost', 21.5, 14.5],
        ['grunt', 12.5, 14.5],
        ['food', 2.5, 6.5], ['food', 6.5, 21.5], ['food', 21.5, 15.5],
        ['food', 11.5, 9.5], ['food', 15.5, 19.5], ['food', 19.5, 6.5],
        ['potion', 6.5, 6.5], ['potion', 19.5, 21.5],
        ['gold', 11.5, 9.5], ['gold', 15.5, 11.5], ['gold', 11.5, 15.5], ['gold', 21.5, 2.5],
    ],
    gen: { comp: ['grunt', 'ghost', 'demon', 'sorcerer'], cap: 5, every: 175 },
    deathAt: 1100,
}

// L4 — THE ENDLESS WORLD: lobbers, three generators, Death is quick here.
const L4 = {
    name: 'LEVEL 4 · THE ENDLESS WORLD',
    material: 'purple',
    remove: [0, 3, 12, 15, 10],
    extra: exitRoom('bl'),
    start: { x: 21.5, y: 21.5, a: Math.PI },
    exit: [2, 21],
    doors: [
        { x: 2, y: 19, lock: 'L' },
        { x: 7, y: 7, lock: 'L' },
        { x: 12, y: 12, lock: null },
        { x: 17, y: 12, lock: null },
    ],
    props: [
        ['key', 2.5, 2.5],
        ['key', 21.5, 6.5],
        ['key', 9.5, 7.5],
        ['generator', 2.5, 14.5], ['generator', 16.5, 4.5], ['generator', 19.5, 19.5],
        ['demon', 9.5, 2.5], ['lobber', 2.5, 9.5], ['sorcerer', 16.5, 16.5],
        ['ghost', 11.5, 11.5], ['demon', 21.5, 14.5], ['lobber', 14.5, 21.5],
        ['grunt', 6.5, 16.5], ['sorcerer', 21.5, 9.5],
        ['food', 6.5, 21.5], ['food', 21.5, 2.5], ['food', 2.5, 12.5],
        ['food', 11.5, 6.5], ['food', 15.5, 15.5], ['food', 19.5, 11.5],
        ['potion', 2.5, 15.5], ['potion', 15.5, 2.5],
        ['gold', 9.5, 11.5], ['gold', 11.5, 9.5], ['gold', 21.5, 19.5], ['gold', 19.5, 21.5],
    ],
    gen: { comp: ['grunt', 'ghost', 'demon', 'lobber'], cap: 5, every: 170 },
    deathAt: 900,
}

export const LEVELS = [L1, L2, L3, L4].map((def, idx) => {
    const grid = baseGrid(def.remove, def.extra || [])
    for (const d of def.doors) grid[d.y][d.x] = d.lock || 'D'
    grid[def.exit[1]][def.exit[0]] = 'X'
    return { ...def, idx, grid: grid.map((r) => r.join('')) }
})
