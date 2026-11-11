// SMASH TV — room data. A grid under a 24px HUD strip; every room of the
// show runs the GW_BIG=24-column board — arenas wider than the screen, framed
// by the camera like the cabinet's 16:9 show (#1973 widened rooms 5/8, #2007
// widened the whole show, #2024 brought THE ANNOUNCER's finale onto it too).
// Rooms are generated deterministically from (seed, index): a wall pattern from
// a small pool (mirrored across the wide boards), crates with the weapon
// ladder, and an enemy roster that grows.
// Rooms 3 and 6 are BONUS rooms; room 8 is THE ANNOUNCER.

export const GW = 16, GH = 14, CELL = 16
export const GW_BIG = 24
export const HUD_H = 24
export const CW = 256, CH = 248
export const ARENA = { x0: 0, y0: HUD_H, x1: CW, y1: CH }

export const TOTAL_ROOMS = 9

// the show's boards: bigger rooms, bigger show (#1973). The cabinet rotated the
// WHOLE frame to 16:9, so the whole show runs the wide board (#2007) — and
// since #2024 that includes THE ANNOUNCER: he hosts the finale on the same
// floor as every other room. His readability never depended on the width but
// on the shot, so the host rides it — the boss law in sim.js keeps him fully
// framed for every camera position (he is TV; the camera never loses him).
export const BIG_ROOMS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])
export const roomGw = (idx) => (BIG_ROOMS.has(idx) ? GW_BIG : GW)

// exit cells on the border ring (walk into one when the room falls to advance);
// the right door sits on the room's own border and the up/down doors centre on
// it, so wide rooms spread and standard rooms are byte-identical to before
export const exitsOf = (gw) => [
    { c: Math.floor(gw / 2), r: 0, side: 'up' },
    { c: Math.floor(gw / 2) - 1, r: GH - 1, side: 'down' },
    { c: 0, r: 7, side: 'left' },
    { c: gw - 1, r: 6, side: 'right' },
]
export const EXITS = exitsOf(GW)

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
    // the original's power-up ladder had five guns; #2032 completes it.
    // HEAT-SEEKER: one missile per shot, slow and self-homing — its lock curves
    // with a BOUNDED turn rate (sim.js), so it reads as guided, never as a
    // homing cheat; a clean sidestep still beats it, exactly like the cabinet.
    // FLAMER: a three-pellet puff of fire that burns through anything but
    // dies out after ~45 px — king at contact range, useless across the stage.
    homing: { name: 'HEAT-SEEKER', interval: 14, speed: 2.6, dmg: 2, pierce: 0, energy: 0 },
    flame: { name: 'FLAMER', interval: 5, speed: 2.2, dmg: 1, pierce: 1, energy: 0 },
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

// #2032: this label ladder stays byte-identical to the shipped show — every
// combat-room swap tested re-routed the autopilot's label-sensitive
// crate-find (seeds 1/2/3/4 all fell). The two new guns of #2032 live in the
// BONUS rounds instead (see genRoom), where the routes don't fight.
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

const freeCells = (walls, gw = GW) => {
    const blocked = new Set(walls.map(([c, r]) => `${c},${r}`))
    const out = []
    for (let r = 1; r < GH - 1; r++) {
        for (let c = 1; c < gw - 1; c++) {
            if (!blocked.has(`${c},${r}`)) out.push([c, r])
        }
    }
    return out
}

// ---------------------------------------------------------------- rooms ----
export function genRoom(seed, idx) {
    const s = { v: (seed * 2654435761 + idx * 40503 + 12345) | 0 }
    const gw = roomGw(idx)
    let walls = PATTERNS[(seed + idx) % PATTERNS.length].map(([c, r]) => [c, r])
    if (gw > GW) {
        // big boards mirror the pattern across the wider arena: the corridors
        // run longer, the studio reads bigger than the screen (#1973)
        const seen = new Set(walls.map(([c, r]) => `${c},${r}`))
        for (const [c, r] of PATTERNS[(seed + idx) % PATTERNS.length]) {
            const mc = gw - 1 - c
            const k = `${mc},${r}`
            if (!seen.has(k)) { seen.add(k); walls.push([mc, r]) }
        }
        walls.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    }
    const free = freeCells(walls, gw)
    const pick = () => free.splice(Math.floor(lcg(s) * free.length), 1)[0]

    const room = {
        idx,
        gw,
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

    if (room.bonus) {
        // #2032: the specials hide in the BONUS rounds — the originals handed
        // power-ups out between the killing floors, and the combat-room trials
        // proved why: a special crate on a contested board gets broken by
        // stray fire and the drop equips under any route that walks the lane
        // (seed 4 once took the flamer to THE ANNOUNCER mid-fan). The bonus
        // boards are the honest home: loot
        // you go and get, room-specific, deterministic pick on a free cell.
        const [bc, br] = pick()
        room.crates.push({ c: bc, r: br, weapon: idx === 3 ? 'homing' : 'flame' })
        return room
    }

    for (const kind of ROSTERS[idx]) {
        // #2024: the host opens centre-stage — the top middle cell of the
        // finale's board, mirrored pattern rows never wall it. Deterministic
        // drama: the camera sits mid-board at entry, so THE ANNOUNCER is
        // fully framed the tick the ROOM banner fades.
        const [c, r] = kind === 'boss' ? [Math.floor(gw / 2), 2] : pick()
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

// player start cell: lower middle of the ARENA (a wide room's middle is the
// 12th column; the standard board keeps START byte-identical)
export const START = { c: 8, r: 11 }
export const startColOf = (gw) => (gw > GW ? Math.floor(gw / 2) : START.c)
