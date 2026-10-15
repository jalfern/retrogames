// MARBLE MADNESS — course data. Six races as heightmap blocks over a 36x36
// tile grid. World units are TILES (the marble's x/y are continuous floats in
// tile space); rendering is 2:1 isometric at TWxTH px per tile.
//
// heights[r][c]: integer tile-steps above the deck, -1 = void (the void is
// where lives end). Runs are horizontal/vertical corridors 4-5 tiles wide;
// consecutive runs overlap at their joints, so connectivity holds by
// construction (the harness BFS-proves it anyway).

export const W = 512
export const H = 384
export const GRID = 36
export const TW = 12 // px per tile, iso half-width factor
export const TH = 6
export const TZ = 5  // px per height step
export const BREAKDROP = 3 // landing this many tile-steps deep shatters the marble

// pastel cabinet palette: checker pairs per base hue, side faces darker
export const PAIRS = [
    ['#8fd8c8', '#f2b8c6'], // mint / pink
    ['#f2b8c6', '#8fd8c8'],
    ['#e8d8a8', '#a8c8e8'], // sand / sky
    ['#a8c8e8', '#e8d8a8'],
    ['#c8e8a0', '#e0a8d8'], // lime / orchid
]
export const SKY_TOP = '#101a3d'
export const SKY_BOT = '#2a1a4d'
export const SIDE1 = '#5a6a96'
export const SIDE2 = '#3c4668'
export const STEEL = '#101018'

// run: rectangle corners inclusive; z lerps along the longer axis
function run(blocks, x0, y0, x1, y1, z0 = null, z1 = null) {
    blocks.push({ x0, y0, x1, y1, z0, z1 })
}

export const RACES = [
    {
        name: 'PRACTICE', time: 60, noPenalty: true, pairs: 0,
        // gentle S down an easy hill; the cabinet's tutorial hazards
        blocks: (b) => {
            run(b, 14, 1, 21, 4, 8, 8)
            run(b, 14, 4, 21, 10, 8, 6)
            run(b, 6, 10, 21, 14, 6, 6)
            run(b, 14, 14, 21, 18, 6, 6)
            run(b, 12, 14, 13, 19, 6, 6)   // west spur past hammer 1
            run(b, 12, 18, 15, 19, 6, 6)   // spur foot into the ramp
            run(b, 12, 20, 13, 25, 6, 4)   // bypass column past hammer 2
            run(b, 12, 24, 15, 25, 4, 4)   // rejoin apron
            run(b, 14, 18, 21, 24, 6, 4)
            run(b, 14, 24, 21, 28, 4, 4)
        },
        start: { c: 17, r: 2 }, goal: { c: 17, r: 27 },
        hammers: [{ c: 17, r: 16, phase: 0 }, { c: 17, r: 22, phase: 45 }],
        steelies: [{ c: 8, r: 12 }],
        slinkies: [{ c: 19, r: 8, acid: false }],
        munchers: [], waves: [],
    },
    {
        name: 'BEGINNER', time: 60, pairs: 1,
        blocks: (b) => {
            run(b, 2, 1, 9, 4, 8, 8)
            run(b, 2, 4, 9, 9, 8, 6)
            run(b, 2, 9, 21, 14, 6, 6)
            run(b, 17, 9, 20, 2, 8, 6)
            run(b, 20, 3, 32, 6, 8, 8)
            run(b, 26, 6, 32, 12, 8, 6)
            run(b, 19, 12, 32, 16, 6, 6)
        },
        start: { c: 5, r: 2 }, goal: { c: 28, r: 15 },
        hammers: [],
        steelies: [{ c: 18, r: 5 }],
        slinkies: [{ c: 12, r: 11, acid: false }],
        munchers: [{ c: 8, r: 11, phase: 0 }, { c: 15, r: 11, phase: 55 }],
        waves: [],
    },
    {
        name: 'INTERMEDIATE', time: 100, pairs: 2,
        blocks: (b) => {
            run(b, 26, 1, 33, 4, 10, 10)
            run(b, 26, 4, 33, 8, 10, 8)
            run(b, 16, 7, 33, 11, 8, 8)
            run(b, 16, 11, 19, 16, 8, 6)
            run(b, 4, 16, 19, 19, 6, 6)
            run(b, 4, 19, 7, 26, 6, 4)
            run(b, 4, 26, 16, 30, 4, 4)
            run(b, 12, 26, 18, 21, 6, 4)
            run(b, 16, 21, 28, 24, 6, 6)
        },
        start: { c: 29, r: 2 }, goal: { c: 26, r: 23 },
        hammers: [{ c: 22, r: 7, phase: 20 }],
        steelies: [{ c: 6, r: 17 }],
        slinkies: [{ c: 24, r: 7, acid: true }, { c: 30, r: 8, acid: false }, { c: 9, r: 28, acid: true }],
        munchers: [{ c: 5, r: 17, phase: 0 }, { c: 14, r: 28, phase: 60 }],
        waves: [],
    },
    {
        name: 'AERIAL', time: 110, pairs: 3,
        // sky bridges 3 wide over the void — the fall line is the whole race
        blocks: (b) => {
            run(b, 14, 1, 18, 4, 10, 10)
            run(b, 15, 4, 17, 9, 10, 8)
            run(b, 17, 8, 26, 10, 8, 8)
            run(b, 24, 10, 26, 14, 8, 6)
            run(b, 12, 14, 26, 16, 6, 6)
            run(b, 12, 16, 14, 22, 6, 4)
            run(b, 14, 21, 24, 23, 4, 4)
            run(b, 22, 23, 24, 29, 4, 2)
            run(b, 18, 28, 24, 31, 2, 2)
        },
        start: { c: 16, r: 2 }, goal: { c: 21, r: 30 },
        hammers: [],
        steelies: [{ c: 20, r: 9 }],
        slinkies: [{ c: 13, r: 15, acid: false }, { c: 23, r: 25, acid: true }],
        munchers: [],
        waves: [],
    },
    {
        name: 'SILLY', time: 120, pairs: 4, reversed: true,
        // gravity pulls the far way and every floor is a trampoline
        blocks: (b) => {
            run(b, 2, 1, 9, 4, 6, 6)
            run(b, 2, 4, 9, 8, 6, 8)
            run(b, 2, 8, 20, 12, 8, 8)
            run(b, 17, 8, 20, 2, 8, 6)
            run(b, 19, 3, 32, 6, 6, 6)
            run(b, 26, 6, 32, 11, 6, 8)
            run(b, 20, 10, 32, 15, 8, 8)
            run(b, 26, 15, 32, 20, 8, 6)
            run(b, 22, 20, 32, 24, 6, 6)
            run(b, 22, 24, 30, 28, 6, 6)
        },
        start: { c: 5, r: 2 }, goal: { c: 28, r: 27 },
        hammers: [{ c: 22, r: 11, phase: 0 }],
        steelies: [{ c: 10, r: 10 }],
        slinkies: [{ c: 14, r: 10, acid: false }, { c: 28, r: 17, acid: true }],
        munchers: [{ c: 24, r: 22, phase: 0 }],
        waves: [],
    },
    {
        name: 'ULTIMATE', time: 150, pairs: 1,
        blocks: (b) => {
            run(b, 14, 1, 21, 4, 12, 12)
            run(b, 14, 4, 21, 9, 12, 10)
            run(b, 4, 9, 21, 12, 10, 10)
            run(b, 4, 12, 7, 18, 10, 8)
            run(b, 2, 12, 3, 18, 10, 8)    // bypass spur around the drop hammer
            run(b, 4, 18, 20, 21, 8, 8)
            run(b, 16, 21, 19, 28, 8, 6)
            run(b, 16, 28, 30, 31, 6, 6)
            run(b, 26, 22, 30, 28, 8, 6)
            run(b, 24, 22, 30, 25, 8, 8)
        },
        start: { c: 17, r: 2 }, goal: { c: 27, r: 23 },
        hammers: [{ c: 12, r: 9, phase: 0 }, { c: 5, r: 15, phase: 38 }],
        steelies: [{ c: 18, r: 23 }, { c: 28, r: 26 }],
        slinkies: [{ c: 10, r: 10, acid: true }, { c: 8, r: 19, acid: false }, { c: 22, r: 29, acid: true }],
        munchers: [{ c: 14, r: 19, phase: 0 }, { c: 17, r: 26, phase: 45 }, { c: 28, r: 24, phase: 90 }],
        waves: [{ x0: 6, y0: 18, x1: 18, y1: 21, dir: 1, speed: 0.11, amp: 1.6 }],
    },
]

export const WIN_BONUS = 5000
export const EXTRA_LIFE = 50000

// height at tile (r,c) after building a race's blocks; -1 = void
export function buildHeights(raceIdx) {
    const z = []
    for (let r = 0; r < GRID; r++) z.push(new Array(GRID).fill(-1))
    const race = RACES[raceIdx]
    const blocks = []
    race.blocks(blocks)
    for (const b of blocks) {
        const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1)
        const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1)
        const alongX = (x1 - x0) >= (y1 - y0)
        const span = Math.max(1, alongX ? x1 - x0 : y1 - y0)
        const za = b.z0 == null ? 8 : b.z0
        const zb = b.z1 == null ? za : b.z1
        for (let r = y0; r <= y1; r++) {
            for (let c = x0; c <= x1; c++) {
                const t = alongX ? (c - x0) / span : (r - y0) / span
                z[r][c] = Math.round(za + (zb - za) * t)
            }
        }
    }
    return z
}
