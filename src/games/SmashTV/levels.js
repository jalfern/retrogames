// SMASH TV — room data. A 16x14 grid of 16px cells under a 24px HUD strip.
// Rooms are generated deterministically from (seed, index): a wall pattern from
// a small pool, crates with the weapon ladder, and an enemy roster that grows.
// Rooms 3 and 6 are BONUS rooms; room 8 is THE ANNOUNCER.

export const GW = 16, GH = 14, CELL = 16
export const HUD_H = 24
export const CW = 256, CH = 248
export const ARENA = { x0: 0, y0: HUD_H, x1: CW, y1: CH }

export const TOTAL_ROOMS = 9

// exit cells on the border ring (walk into one when the room falls to advance)
export const EXITS = [
    { c: 8, r: 0, side: 'up' },
    { c: 7, r: GH - 1, side: 'down' },
    { c: 0, r: 7, side: 'left' },
    { c: GW - 1, r: 6, side: 'right' },
]

// interior wall patterns (grid cells). Every pattern keeps the border ring and
// the exit mouths reachable.
const PATTERNS = [
    [[4, 3], [11, 3], [4, 10], [11, 10], [7, 6], [8, 7]],
    [[6, 5], [7, 5], [8, 5], [9, 5], [6, 8], [7, 8], [8, 8], [9, 8]],
    [[5, 3], [5, 4], [5, 9], [5, 10], [10, 3], [10, 4], [10, 9], [10, 10]],
    [[3, 3], [4, 3], [3, 4], [11, 3], [12, 3], [12, 4], [3, 9], [3, 10], [4, 10], [11, 10], [12, 10], [12, 9]],
]

export const WEAPONS = {
    twin: { name: 'TWIN PISTOLS', interval: 12, speed: 3.2, dmg: 1, pierce: 0, energy: 0 },
    gun: { name: 'MACHINE GUN', interval: 5, speed: 3.4, dmg: 1, pierce: 0, energy: 0 },
    spread: { name: 'SPREAD GUN', interval: 10, speed: 3.0, dmg: 1, pierce: 0, energy: 0 },
    laser: { name: 'LASER', interval: 16, speed: 5.2, dmg: 2, pierce: 1, energy: 2 },
}

export const ENEMIES = {
    walkcam: { hp: 1, speed: 0.45, pts: 50, kind: 'chaser' },
    runner: { hp: 1, speed: 0.85, pts: 100, kind: 'chaser' },
    turret: { hp: 2, speed: 0, pts: 150, kind: 'turret', cd: 95 },
    thrower: { hp: 2, speed: 0.35, pts: 200, kind: 'thrower', cd: 110 },
    heavy: { hp: 5, speed: 0.3, pts: 300, kind: 'heavy', cd: 120 },
    boss: { hp: 30, speed: 0.7, pts: 5000, kind: 'boss', cd: 70 },
}

const ROSTERS = [
    ['walkcam', 'walkcam', 'walkcam', 'walkcam', 'runner', 'runner'],
    ['walkcam', 'walkcam', 'runner', 'runner', 'runner', 'turret', 'turret'],
    ['runner', 'runner', 'runner', 'runner', 'turret', 'turret', 'thrower', 'thrower'],
    null, // bonus
    ['walkcam', 'walkcam', 'runner', 'runner', 'runner', 'turret', 'turret', 'thrower', 'heavy'],
    ['runner', 'runner', 'runner', 'runner', 'runner', 'thrower', 'thrower', 'turret', 'heavy', 'heavy'],
    null, // bonus
    ['runner', 'runner', 'runner', 'runner', 'runner', 'runner', 'thrower', 'thrower', 'thrower', 'turret', 'turret', 'heavy', 'heavy'],
    ['boss', 'walkcam', 'walkcam'],
]

const CRATE_WEAPONS = ['spread', 'laser', 'gun', null, 'gun', 'spread', null, 'laser', 'laser']

export const isBonus = (idx) => ROSTERS[idx] === null
export const isBoss = (idx) => idx === TOTAL_ROOMS - 1

// deterministic pick helper (same LCG family as the sim)
export function lcg(s) {
    s.v = (s.v + 0x6d2b79f5) | 0
    let t = s.v
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const freeCells = (walls) => {
    const blocked = new Set(walls.map(([c, r]) => `${c},${r}`))
    const out = []
    for (let r = 1; r < GH - 1; r++) {
        for (let c = 1; c < GW - 1; c++) {
            if (!blocked.has(`${c},${r}`)) out.push([c, r])
        }
    }
    return out
}

// ---------------------------------------------------------------- rooms ----
export function genRoom(seed, idx) {
    const s = { v: (seed * 2654435761 + idx * 40503 + 12345) | 0 }
    const walls = PATTERNS[(seed + idx) % PATTERNS.length].map(([c, r]) => [c, r])
    const free = freeCells(walls)
    const pick = () => free.splice(Math.floor(lcg(s) * free.length), 1)[0]

    const room = {
        idx,
        walls,
        bonus: isBonus(idx),
        boss: isBoss(idx),
        spawnAt: 60,
        spawns: [],
        crates: [],
        energyCells: 0,
        civilians: idx === 3 ? 8 : 7,
        bonusTime: 600,
    }

    if (room.bonus) return room

    for (const kind of ROSTERS[idx]) {
        const [c, r] = pick()
        room.spawns.push({ kind, c, r })
    }
    const cw = CRATE_WEAPONS[idx]
    if (cw) {
        const [c, r] = pick()
        room.crates.push({ c, r, weapon: cw })
        if (idx === 4 || idx === 7) {
            const [c2, r2] = pick()
            room.crates.push({ c: c2, r: r2, weapon: 'spread' })
        }
    }
    if (idx === 2 || idx === 5 || idx === 7) room.energyCells = 1
    return room
}

// player start cell: lower middle of the arena
export const START = { c: 8, r: 11 }
