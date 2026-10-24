// GAUNTLET — level definitions (Atari 1985, ten mazes to the top).
//
// The 1985 dungeons are not thin passages: they are open halls cut by chunky
// pillar-blocks with two-cell lanes between them. So the first four worlds are
// an open 24x24 field (border wall) plus 3x3 pillar rectangles punched back in
// (and FOUR HALLS still rides exactly these four, first person).
//
// Worlds 5–10 (#950) are hand-drawn 24x24 grids of real walls, corridors and
// sealed rooms, and they carry the dungeon's hazard furniture:
//   '#' wall  '.' lane  'D' slam door  'L' locked door  'X' stairs up
//   'W' warp exit (def.warps carries the target; painted "EXIT TO n")
//   'B' breakable wall (the sword shatters it after two blows)
//   'T' vanishing trap wall (solid for part of the level's fixed cycle;
//       caught inside, it bruises you and shoves you out)
//   'P' teleporter pad (one-way, lands on 'p')
//   'S' stun tile (legs go soft for over a second)
//   'h' hidden passage (walkable; drawn as solid stone until you stand beside)
// The exit is a walled room sealed by a locked door ('L'); the key always
// sits in the open — scripts/gauntletcheck.mjs audits that order, the
// connectivity of every level, the warp targets and the hazard rules.

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

// ------------------------------------------------------------- #950 worlds ----
// Five new dungeons below the original four. Each is an open field with wall
// STROKES punched in (rects of '#', rooms punched back to '.'), plus single
// feature cells. Gauntletcheck audits width, connectivity, key order and the
// hazard placement level by level.

function strokeGrid(walls, punches, feats) {
    const g = Array.from({ length: H }, () => Array(W).fill('#'))
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = '.'
    for (const [x, y, w, h] of walls) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1) g[yy][xx] = '#'
    for (const [x, y, w, h] of punches) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1) g[yy][xx] = '.'
    for (const [x, y, ch] of feats) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y][x] = ch
    return g
}

// L5 — THE IRON WORKS: breakable walls hide the treasure rooms, and the first
// warp arch waits in the south-east. The teleporter in the west ring drops you
// straight into the strongroom — if you can get the gold back out.
const L5 = {
    name: 'LEVEL 5 · THE IRON WORKS',
    material: 'iron',
    walls: [
        [3, 3, 6, 3], [14, 3, 6, 3],
        [3, 7, 3, 1], [8, 7, 6, 1], [16, 7, 3, 1],
        [15, 9, 4, 4],
        [7, 14, 6, 3],
        [3, 18, 3, 2], [8, 17, 4, 1], [14, 17, 3, 1],
        [1, 20, 4, 1], [4, 21, 1, 2],
    ],
    punches: [[16, 10, 2, 2], [15, 4, 1, 1]],
    feats: [
        [14, 4, 'h'],
        [16, 9, 'B'], [17, 10, 'p'], [3, 10, 'P'],
        [13, 15, 'S'],
        [10, 7, 'D'], [17, 7, 'D'], [9, 17, 'D'],
        [2, 20, 'L'],
    ],
    start: { x: 21.5, y: 1.5, a: Math.PI * 0.75 },
    exit: [2, 21],
    doors: [
        { x: 2, y: 20, lock: 'L' },
        { x: 10, y: 7, lock: null },
        { x: 17, y: 7, lock: null },
        { x: 9, y: 17, lock: null },
    ],
    warps: [{ x: 22, y: 21, to: 6 }],
    props: [
        ['key', 12.5, 21.5],
        ['generator', 12.5, 3.5], ['generator', 16.5, 10.5],
        ['grunt', 5.5, 10.5], ['grunt', 20.5, 5.5], ['grunt', 13.5, 16.5],
        ['demon', 12.5, 8.5], ['demon', 19.5, 18.5],
        ['ghost', 3.5, 17.5], ['ghost', 15.5, 13.5],
        ['lobber', 20.5, 12.5],
        ['food', 1.5, 8.5], ['food', 12.5, 6.5], ['food', 22.5, 12.5],
        ['food', 5.5, 22.5], ['food', 15.5, 22.5], ['food', 12.5, 1.5],
        ['potion', 22.5, 2.5], ['potion', 1.5, 12.5],
        ['gold', 15.5, 4.5], ['gold', 16.5, 10.5], ['gold', 17.5, 11.5],
        ['gold', 20.5, 2.5], ['gold', 4.5, 12.5], ['gold', 21.5, 22.5],
    ],
    gen: { comp: ['grunt', 'demon', 'ghost', 'lobber'], cap: 6, every: 175 },
    deathAt: 1250,
}

// L6 — THE VANISHING HALLS: trap walls gate the vaults; the loot is only
// safe while the stone breathes. Warp arch in the north-west corner.
const L6 = {
    name: 'LEVEL 6 · THE VANISHING HALLS',
    material: 'teal',
    walls: [
        [3, 3, 5, 4], [15, 3, 5, 4],
        [3, 16, 5, 4], [15, 16, 5, 4],
        [19, 1, 1, 4], [20, 4, 4, 1],
    ],
    punches: [[4, 4, 3, 2], [16, 4, 3, 2], [4, 17, 3, 2], [16, 17, 3, 2]],
    feats: [
        [3, 5, 'T'], [19, 5, 'T'], [3, 18, 'T'], [19, 18, 'T'],
        [5, 4, 'S'], [17, 4, 'S'], [5, 17, 'S'],
        [19, 2, 'L'],
        [11, 8, 'D'], [12, 15, 'D'],
    ],
    start: { x: 12.5, y: 22.5, a: -Math.PI / 2 },
    exit: [21, 1],
    doors: [
        { x: 19, y: 2, lock: 'L' },
        { x: 11, y: 8, lock: null },
        { x: 12, y: 15, lock: null },
    ],
    warps: [{ x: 1, y: 1, to: 8 }],
    trap: { period: 260, open: 100, phase: 0 },
    props: [
        ['key', 8.5, 1.5],
        ['key', 22.5, 22.5],
        ['generator', 11.5, 5.5], ['generator', 12.5, 18.5],
        ['demon', 12.5, 9.5], ['demon', 11.5, 13.5],
        ['grunt', 5.5, 11.5], ['grunt', 18.5, 11.5], ['grunt', 21.5, 8.5],
        ['ghost', 8.5, 5.5], ['ghost', 14.5, 17.5],
        ['sorcerer', 21.5, 11.5],
        ['food', 12.5, 1.5], ['food', 1.5, 12.5], ['food', 22.5, 12.5],
        ['food', 12.5, 8.5], ['food', 3.5, 22.5], ['food', 18.5, 22.5],
        ['potion', 12.5, 11.5], ['potion', 3.5, 1.5],
        ['gold', 4.5, 4.5], ['gold', 16.5, 5.5], ['gold', 4.5, 18.5],
        ['gold', 16.5, 18.5], ['gold', 17.5, 21.5],
    ],
    gen: { comp: ['grunt', 'demon', 'ghost', 'sorcerer'], cap: 6, every: 165 },
    deathAt: 1150,
}

// L7 — THE SORCERY: fire down every lane, and the twin teleporters swap the
// wings of the keep. No warp here — the sorcerers guard the stairs tight.
const L7 = {
    name: 'LEVEL 7 · THE SORCERY',
    material: 'arcane',
    walls: [
        [2, 2, 5, 5], [17, 2, 5, 5], [2, 17, 5, 5], [17, 17, 5, 5],
        [9, 10, 6, 5],
    ],
    punches: [[3, 3, 3, 3], [18, 3, 3, 3], [3, 18, 3, 3], [18, 18, 3, 3], [10, 11, 4, 3]],
    feats: [
        [4, 6, 'D'], [18, 6, 'D'], [4, 17, 'D'], [18, 17, 'D'],
        [10, 14, 'L'], [13, 14, 'L'],
        [7, 11, 'P'], [16, 11, 'P'], [16, 12, 'p'], [7, 12, 'p'],
        [11, 17, 'S'], [13, 17, 'S'],
        [20, 16, 'B'],
    ],
    start: { x: 1.5, y: 1.5, a: Math.PI / 4 },
    exit: [11, 12],
    doors: [
        { x: 10, y: 14, lock: 'L' },
        { x: 13, y: 14, lock: 'L' },
        { x: 4, y: 6, lock: null },
        { x: 18, y: 6, lock: null },
        { x: 4, y: 17, lock: null },
        { x: 18, y: 17, lock: null },
    ],
    props: [
        ['key', 1.5, 22.5],
        ['key', 22.5, 1.5],
        ['key', 12.5, 22.5],
        ['generator', 4.5, 4.5], ['generator', 19.5, 4.5],
        ['generator', 4.5, 19.5], ['generator', 19.5, 19.5],
        ['sorcerer', 7.5, 1.5], ['sorcerer', 16.5, 1.5], ['sorcerer', 1.5, 11.5],
        ['ghost', 7.5, 6.5], ['ghost', 16.5, 6.5], ['ghost', 7.5, 17.5],
        ['demon', 16.5, 17.5], ['demon', 12.5, 8.5],
        ['lobber', 12.5, 18.5],
        ['food', 12.5, 1.5], ['food', 1.5, 12.5], ['food', 22.5, 12.5],
        ['food', 5.5, 22.5], ['food', 18.5, 22.5], ['food', 12.5, 15.5],
        ['potion', 7.5, 22.5], ['potion', 16.5, 22.5],
        ['gold', 3.5, 3.5], ['gold', 19.5, 3.5], ['gold', 3.5, 19.5],
        ['gold', 19.5, 19.5], ['gold', 12.5, 6.5], ['gold', 5.5, 12.5],
    ],
    gen: { comp: ['ghost', 'demon', 'sorcerer', 'lobber'], cap: 7, every: 150 },
    deathAt: 1050,
}

// L8 — THE LABYRINTH: the corridors run, the vault needs a key, and a
// hidden door cuts the corner off the maze. The warp arch waits in the west.
const L8 = {
    name: 'LEVEL 8 · THE LABYRINTH',
    material: 'sand',
    walls: [
        [2, 4, 5, 1], [9, 4, 8, 1],
        [3, 6, 9, 1], [14, 6, 7, 1],
        [2, 8, 6, 1], [10, 8, 9, 1],
        [5, 10, 10, 1], [17, 10, 4, 1],
        [2, 12, 8, 1], [12, 12, 6, 1],
        [7, 14, 6, 1], [15, 14, 6, 1],
        [2, 16, 6, 1], [10, 16, 9, 1],
        [5, 18, 10, 1], [17, 18, 4, 1],
        [2, 20, 7, 1], [11, 20, 8, 1],
        [2, 10, 5, 1], [2, 11, 1, 2], [6, 11, 1, 2], [2, 13, 4, 1],
    ],
    punches: [],
    feats: [
        [9, 6, 'h'],
        [6, 11, 'L'],
        [10, 12, 'T'],
        [10, 21, 'S'], [20, 21, 'S'],
        [14, 4, 'D'], [7, 8, 'D'], [18, 18, 'D'],
    ],
    start: { x: 12.5, y: 1.5, a: Math.PI / 2 },
    exit: [4, 11],
    doors: [
        { x: 6, y: 11, lock: 'L' },
        { x: 14, y: 4, lock: null },
        { x: 7, y: 8, lock: null },
        { x: 18, y: 18, lock: null },
    ],
    warps: [{ x: 1, y: 20, to: 9 }],
    trap: { period: 300, open: 110, phase: 140 },
    props: [
        ['key', 21.5, 1.5],
        ['key', 1.5, 22.5],
        ['generator', 8.5, 9.5], ['generator', 16.5, 17.5],
        ['demon', 12.5, 9.5], ['demon', 5.5, 17.5], ['demon', 20.5, 8.5],
        ['sorcerer', 10.5, 1.5], ['sorcerer', 21.5, 12.5],
        ['ghost', 4.5, 5.5], ['ghost', 16.5, 5.5], ['ghost', 8.5, 21.5],
        ['grunt', 12.5, 17.5], ['grunt', 21.5, 16.5],
        ['lobber', 15.5, 10.5],
        ['food', 12.5, 5.5], ['food', 1.5, 9.5], ['food', 22.5, 5.5],
        ['food', 12.5, 13.5], ['food', 4.5, 22.5], ['food', 15.5, 22.5],
        ['potion', 10.5, 13.5], ['potion', 20.5, 22.5],
        ['gold', 3.5, 11.5], ['gold', 5.5, 11.5], ['gold', 16.5, 1.5],
        ['gold', 20.5, 5.5], ['gold', 10.5, 19.5], ['gold', 21.5, 21.5],
    ],
    gen: { comp: ['demon', 'sorcerer', 'grunt', 'ghost'], cap: 7, every: 145 },
    deathAt: 1000,
}

// L9 — THE GOLD VAULT: the whole world is a strongbox and you are inside it.
// The big vault seals the middle behind two shattered-ready walls; the robbers
// were here first. No warp — the money is IN the maze.
const L9 = {
    name: 'LEVEL 9 · THE GOLD VAULT',
    material: 'gold',
    walls: [
        [3, 1, 1, 2], [1, 3, 2, 1],
        [3, 5, 4, 1], [9, 5, 6, 1], [17, 5, 4, 1],
        [2, 8, 4, 1], [9, 8, 8, 1], [19, 8, 3, 1],
        [8, 10, 8, 6],
        [2, 12, 4, 1], [10, 12, 6, 1], [18, 12, 4, 1],
        [4, 15, 6, 1], [13, 15, 7, 1],
        [2, 18, 5, 1], [10, 18, 7, 1], [19, 18, 3, 1],
    ],
    punches: [[9, 11, 6, 4]],
    feats: [
        [3, 1, 'L'],
        [8, 12, 'B'], [15, 12, 'B'],
        [7, 12, 'S'], [16, 11, 'S'],
        [5, 8, 'D'], [13, 8, 'D'], [12, 15, 'D'],
    ],
    start: { x: 12.5, y: 22.5, a: -Math.PI / 2 },
    exit: [1, 1],
    doors: [
        { x: 3, y: 1, lock: 'L' },
        { x: 5, y: 8, lock: null },
        { x: 13, y: 8, lock: null },
        { x: 12, y: 15, lock: null },
    ],
    props: [
        ['key', 22.5, 12.5],
        ['generator', 5.5, 3.5], ['generator', 18.5, 3.5], ['generator', 12.5, 19.5],
        ['lobber', 8.5, 5.5], ['lobber', 16.5, 13.5], ['lobber', 3.5, 15.5],
        ['demon', 10.5, 13.5], ['demon', 20.5, 15.5],
        ['sorcerer', 12.5, 3.5], ['sorcerer', 5.5, 21.5],
        ['ghost', 21.5, 11.5], ['ghost', 8.5, 16.5],
        ['grunt', 16.5, 21.5], ['grunt', 2.5, 11.5],
        ['food', 12.5, 1.5], ['food', 1.5, 12.5], ['food', 22.5, 21.5],
        ['food', 8.5, 9.5], ['food', 18.5, 9.5], ['food', 12.5, 16.5],
        ['potion', 1.5, 22.5], ['potion', 22.5, 1.5],
        ['gold', 10.5, 11.5], ['gold', 11.5, 12.5], ['gold', 12.5, 11.5],
        ['gold', 13.5, 12.5], ['gold', 4.5, 6.5], ['gold', 20.5, 6.5],
        ['gold', 4.5, 9.5], ['gold', 12.5, 21.5], ['gold', 16.5, 5.5],
    ],
    gen: { comp: ['lobber', 'demon', 'sorcerer', 'grunt', 'ghost'], cap: 7, every: 140 },
    deathAt: 950,
}

// L10 — DEATH'S KEEP: the last hall. Three spouts, every monster on the
// roster, and Death does not wait long in the dark. The stairs sit in the
// keep at the center; the quest ends on them.
const L10 = {
    name: 'LEVEL 10 · DEATH\'S KEEP',
    material: 'obsidian',
    walls: [
        [3, 3, 3, 3], [8, 3, 3, 3], [14, 3, 3, 3], [19, 3, 2, 3],
        [3, 8, 3, 3], [19, 8, 2, 3],
        [3, 14, 3, 3], [19, 14, 2, 3],
        [7, 19, 3, 3], [14, 19, 3, 3],
        [9, 11, 6, 4],
    ],
    punches: [[10, 12, 4, 2]],
    feats: [
        [14, 12, 'L'],
        [15, 12, 'S'], [11, 15, 'T'],
        [5, 8, 'D'], [18, 14, 'D'],
    ],
    start: { x: 12.5, y: 22.5, a: -Math.PI / 2 },
    exit: [11, 12],
    doors: [
        { x: 14, y: 12, lock: 'L' },
        { x: 5, y: 8, lock: null },
        { x: 18, y: 14, lock: null },
    ],
    trap: { period: 240, open: 90, phase: 60 },
    props: [
        ['key', 1.5, 1.5],
        ['key', 22.5, 1.5],
        ['generator', 3.5, 11.5], ['generator', 21.5, 3.5], ['generator', 12.5, 22.5],
        ['demon', 8.5, 8.5], ['demon', 15.5, 9.5], ['demon', 8.5, 15.5],
        ['sorcerer', 12.5, 3.5], ['sorcerer', 3.5, 19.5],
        ['lobber', 20.5, 11.5], ['lobber', 12.5, 16.5],
        ['ghost', 8.5, 9.5], ['ghost', 15.5, 15.5],
        ['grunt', 6.5, 5.5], ['grunt', 17.5, 5.5], ['grunt', 5.5, 21.5],
        ['food', 12.5, 1.5], ['food', 1.5, 12.5], ['food', 22.5, 12.5],
        ['food', 8.5, 12.5], ['food', 12.5, 16.5], ['food', 1.5, 21.5],
        ['potion', 22.5, 21.5], ['potion', 12.5, 8.5],
        ['gold', 2.5, 6.5], ['gold', 21.5, 6.5], ['gold', 4.5, 13.5],
        ['gold', 20.5, 13.5], ['gold', 12.5, 21.5],
    ],
    gen: { comp: ['demon', 'sorcerer', 'lobber', 'ghost', 'grunt'], cap: 8, every: 130 },
    deathAt: 800,
}

export const LEVELS = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10].map((def, idx) => {
    const grid = def.walls
        ? strokeGrid(def.walls || [], def.punches || [], def.feats || [])
        : baseGrid(def.remove, def.extra || [])
    for (const d of def.doors) grid[d.y][d.x] = d.lock || 'D'
    for (const w of def.warps || []) grid[w.y][w.x] = 'W'
    grid[def.exit[1]][def.exit[0]] = 'X'
    return { ...def, idx, grid: grid.map((r) => r.join('')) }
})
