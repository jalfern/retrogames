// IRONKEEP — level definitions.
//
// Levels are *carved*, not drawn: the grid starts as solid rock and rooms/corridors
// are hollowed out of it. That makes an enclosed level the default — a hand-typed
// ASCII maze can leak to the void through one missing wall character, and a leak in
// a software raycaster means the player sees garbage and walks out of the world.
//
// The result is still a plain char grid the engine reads:
//   '#' brick   '=' stone   '%' moss   '*' tapestry   '|' iron
//   'D' door    'L' iron-locked door   'G' gold-locked door   'X' exit
//   '.' floor   ' ' solid rock
// Props (enemies / pickups / the player start) live in their own list so the grid
// stays a pure description of geometry.

const L1 = {
    name: 'I · THE GATEHOUSE',
    short: 'GATEHOUSE',
    hint: 'FIND THE GOLD KEY IN THE ARMOURY',
    w: 32, h: 24,
    fog: 1,
    rooms: [
        { x: 2, y: 14, w: 8, h: 8, wall: '#' },      // courtyard (start)
        { x: 13, y: 14, w: 10, h: 8, wall: '#' },    // gatehouse
        { x: 12, y: 3, w: 16, h: 9, wall: '*' },     // great hall (locked)
        { x: 2, y: 3, w: 7, h: 7, wall: '%' },       // armoury
        { x: 25, y: 14, w: 5, h: 8, wall: '=' },     // crypt
    ],
    corridors: [
        { x: 10, y: 17, w: 3, h: 1, wall: '#', door: [11, 17] },
        { x: 17, y: 12, w: 1, h: 2, wall: '#', door: [17, 12], lock: 'G' },
        { x: 5, y: 10, w: 1, h: 4, wall: '%', door: [5, 11] },
        { x: 23, y: 17, w: 2, h: 1, wall: '=', door: [23, 17] },
        // Both doors into the great hall are gold-locked, and the key is in the
        // armoury — so the hall cannot be reached without doing the errand. The
        // level audit in scripts/fpscheck.mjs is what proves that.
        { x: 9, y: 6, w: 3, h: 1, wall: '%', door: [10, 6], lock: 'G' },
    ],
    start: { x: 5.5, y: 19.5, a: -Math.PI / 2 },
    props: [
        ['grunt', 7.5, 16.5], ['grunt', 3.5, 20.5],
        ['grunt', 15.5, 16.5], ['grunt', 19.5, 15.5], ['hound', 20.5, 19.5],
        ['bolts', 14.5, 20.5], ['potion', 18.5, 20.5],
        ['hound', 26.5, 18.5], ['hound', 28.5, 20.5],
        ['chest', 27.5, 15.5], ['potion', 25.5, 21.5], ['banner', 29.5, 14.5],
        ['repeater', 3.5, 4.5], ['keyGold', 7.5, 3.5],
        ['potion', 7.5, 8.5], ['bolts', 4.5, 8.5], ['bolts', 6.5, 6.5],
        ['mage', 14.5, 5.5], ['mage', 24.5, 5.5],
        ['grunt', 20.5, 8.5], ['grunt', 22.5, 10.5], ['grunt', 16.5, 10.5],
        ['goblet', 13.5, 4.5], ['goblet', 18.5, 4.5], ['chest', 21.5, 4.5],
    ],
    exit: [28, 7],
}

const L2 = {
    name: 'II · THE UNDERCROFT',
    short: 'UNDERCROFT',
    hint: 'THE KENNELS HOLD THE IRON KEY',
    w: 34, h: 26,
    fog: 0.82,
    rooms: [
        { x: 2, y: 19, w: 7, h: 5, wall: '=' },      // landing (start)
        { x: 12, y: 19, w: 14, h: 5, wall: '#' },    // long hall
        { x: 28, y: 16, w: 5, h: 9, wall: '%' },     // flooded gallery
        { x: 2, y: 11, w: 5, h: 6, wall: '=' },      // west passage
        { x: 11, y: 9, w: 10, h: 6, wall: '|' },     // forge
        { x: 24, y: 4, w: 8, h: 7, wall: '*' },      // reliquary (iron-locked)
        { x: 2, y: 3, w: 8, h: 5, wall: '%' },       // kennels
        { x: 13, y: 2, w: 6, h: 4, wall: '=' },      // deep cell (gold-locked, exit)
    ],
    corridors: [
        { x: 9, y: 21, w: 3, h: 1, wall: '#', door: [10, 21] },
        { x: 26, y: 20, w: 2, h: 1, wall: '%', door: [26, 20] },
        { x: 15, y: 15, w: 1, h: 4, wall: '|', door: [15, 17] },
        { x: 4, y: 17, w: 1, h: 2, wall: '=', door: [4, 18] },
        { x: 4, y: 8, w: 1, h: 3, wall: '%', door: [4, 9] },
        { x: 21, y: 9, w: 3, h: 1, wall: '*', door: [22, 9], lock: 'L' },
        { x: 16, y: 6, w: 1, h: 3, wall: '=', door: [16, 7], lock: 'G' },
        { x: 30, y: 11, w: 1, h: 5, wall: '%', door: [30, 13] },
        { x: 7, y: 13, w: 4, h: 1, wall: '|', door: [8, 13] },
    ],
    start: { x: 3.5, y: 22.5, a: 0 },
    props: [
        ['potion', 6.5, 20.5], ['bolts', 4.5, 19.5],
        ['grunt', 14.5, 21.5], ['grunt', 18.5, 20.5], ['mage', 22.5, 22.5],
        ['hound', 24.5, 20.5], ['bolts', 13.5, 23.5], ['potion', 19.5, 19.5],
        ['hound', 29.5, 18.5], ['hound', 30.5, 22.5], ['chest', 28.5, 24.5],
        ['grunt', 3.5, 13.5], ['bolts', 5.5, 15.5],
        ['hound', 4.5, 5.5], ['hound', 7.5, 4.5], ['hound', 3.5, 4.5],
        ['keyIron', 8.5, 6.5], ['bolts', 6.5, 3.5],
        ['mage', 13.5, 10.5], ['grunt', 18.5, 12.5], ['grunt', 16.5, 10.5],
        ['launcher', 12.5, 13.5], ['bolts', 19.5, 10.5], ['potion', 17.5, 13.5],
        ['mage', 26.5, 6.5], ['mage', 29.5, 8.5], ['grunt', 28.5, 5.5],
        ['goblet', 24.5, 9.5], ['goblet', 30.5, 5.5], ['chest', 27.5, 4.5],
        ['keyGold', 25.5, 5.5], ['potion', 30.5, 9.5],
        ['banner', 14.5, 3.5], ['chest', 17.5, 2.5],
    ],
    exit: [19, 3],
}

const L3 = {
    name: 'III · THE BLACK HALL',
    short: 'BLACK HALL',
    hint: 'THE WARDEN WILL NOT MOVE ASIDE',
    w: 34, h: 22,
    fog: 0.7,
    rooms: [
        { x: 2, y: 15, w: 9, h: 6, wall: '=' },      // approach (start)
        { x: 14, y: 13, w: 16, h: 8, wall: '#' },    // the black hall (warden)
        { x: 2, y: 4, w: 7, h: 7, wall: '%' },       // west vault
        { x: 13, y: 3, w: 8, h: 7, wall: '*' },      // shrine
        { x: 24, y: 3, w: 8, h: 8, wall: '|' },      // throne room (exit)
    ],
    corridors: [
        { x: 11, y: 17, w: 3, h: 1, wall: '#', door: [12, 17] },
        { x: 5, y: 11, w: 1, h: 4, wall: '%', door: [5, 12] },
        { x: 16, y: 10, w: 1, h: 3, wall: '*', door: [16, 11] },
        { x: 27, y: 11, w: 1, h: 2, wall: '|', door: [27, 11], lock: 'G' },
        { x: 9, y: 6, w: 4, h: 1, wall: '*', door: [10, 6] },
    ],
    start: { x: 3.5, y: 18.5, a: 0 },
    props: [
        ['bolts', 4.5, 16.5], ['potion', 8.5, 16.5], ['grunt', 8.5, 19.5],
        ['hound', 5.5, 20.5], ['potion', 2.5, 15.5],
        ['boss', 22.5, 15.5],
        ['mage', 16.5, 19.5], ['mage', 27.5, 19.5],
        ['grunt', 15.5, 15.5], ['grunt', 25.5, 14.5], ['grunt', 28.5, 16.5],
        ['hound', 19.5, 20.5], ['hound', 24.5, 20.5],
        ['bolts', 14.5, 13.5], ['potion', 29.5, 13.5],
        ['mage', 4.5, 6.5], ['grunt', 7.5, 9.5], ['chest', 3.5, 5.5],
        ['bolts', 6.5, 4.5], ['potion', 7.5, 6.5],
        ['mage', 14.5, 5.5], ['mage', 18.5, 5.5], ['hound', 17.5, 8.5],
        ['keyGold', 15.5, 4.5], ['goblet', 19.5, 4.5], ['banner', 13.5, 8.5],
        ['chest', 18.5, 3.5], ['bolts', 20.5, 8.5],
        ['grunt', 25.5, 5.5], ['grunt', 30.5, 5.5], ['chest', 30.5, 9.5],
    ],
    exit: [32, 6],
}

// Carve one level def into a char grid + prop list.
export function buildLevel(def) {
    const { w, h } = def
    const g = Array.from({ length: h }, () => Array(w).fill(' '))
    const paint = (x, y, ww, hh, wall) => {
        for (let j = y - 1; j <= y + hh; j++) {
            for (let i = x - 1; i <= x + ww; i++) {
                if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue
                if (g[j][i] === ' ') g[j][i] = wall
            }
        }
    }
    for (const r of def.rooms) {
        for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) g[j][i] = '.'
        paint(r.x, r.y, r.w, r.h, r.wall || '#')
    }
    const doors = []
    for (const c of def.corridors) {
        for (let j = c.y; j < c.y + c.h; j++) for (let i = c.x; i < c.x + c.w; i++) g[j][i] = '.'
        paint(c.x, c.y, c.w, c.h, c.wall || '#')
        if (c.door) {
            const [dx, dy] = c.door
            g[dy][dx] = c.lock || 'D'
            doors.push({ x: dx, y: dy, lock: c.lock || null, open: 0, target: 0 })
        }
    }
    const [ex, ey] = def.exit
    g[ey][ex] = 'X'
    const props = def.props.map(([t, x, y]) => ({ t, x, y }))
    return {
        name: def.name, hint: def.hint, short: def.short || '', w, h, fog: def.fog ?? 1,
        rows: g.map(r => r.join('')), doors, props, start: def.start, exit: def.exit,
    }
}

export const LEVELS = [L1, L2, L3].map(def => ({ def, ...buildLevel(def) }))

export const WALL_TEX = {
    '#': 'brick', '=': 'stone', '%': 'moss', '*': 'tapestry', '|': 'iron',
    D: 'door', L: 'doorIron', G: 'doorGold', X: 'exit',
}
