// SHORT ORDER SHOUT — procedural art (#1248). Everything is generated in code:
// NES-era all-night diner: checkered floor, chrome-trimmed counter, dot-matrix
// ticket slips, four-frame cook walks in coloured aprons. 24px tiles, palette
// kept in period mood (no sprite from any original game).

export const TILE = 24
export const CANVAS_W = 320
export const CANVAS_H = 224
export const KITCHEN_X = 4
export const KITCHEN_Y = 48

const PAL = {
    floorA: '#e8d8a0', floorB: '#c25a48', grout: '#8a6a48',
    wall: '#3a2626', wallHi: '#543636', wallLo: '#241616',
    steel: '#b8c4cc', steelHi: '#e8f0f4', steelLo: '#6a7c88',
    wood: '#8a5a2a', woodHi: '#b47a3e', woodLo: '#5c3a18',
    chrome: '#d8e4ec', chromeLo: '#7a8c98',
    hat: '#f4f0e4', skin: '#e8b088', skinLo: '#b07850',
    apron: ['#d83830', '#e8b028', '#3878d0', '#38a848'], // seat colors
    ink: '#181018', paper: '#f0ead8', paperLo: '#c8bfa4',
    fire1: '#f8d038', fire2: '#f07820', fire3: '#c83018',
    water: '#48a8e0', tomato: '#e03028', bun: '#d8a050', patty: '#8a4828',
    pattyC: '#5c2c14', potato: '#c89858', soup: '#e8c050', char: '#2a2228',
}

function mk(w, h) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    return [c, g]
}

let cache = null

export function sprites() {
    if (cache) return cache
    cache = build()
    return cache
}

function build() {
    const S = {}

    // --- floor: cream/red checker with grain ------------------------------
    S.floor = []
    for (let i = 0; i < 2; i++) {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = i ? PAL.floorB : PAL.floorA
        g.fillRect(0, 0, TILE, TILE)
        g.fillStyle = 'rgba(0,0,0,0.10)'
        for (let k = 0; k < 22; k++) g.fillRect((k * 7 + i * 5) % TILE, (k * 11 + 3) % TILE, 1, 1)
        g.fillStyle = PAL.grout
        g.fillRect(0, TILE - 1, TILE, 1); g.fillRect(TILE - 1, 0, 1, TILE)
        S.floor.push(c)
    }

    // --- wall -----------------------------------------------------------
    S.wall = mk(TILE, TILE)[0]
    {
        const g = S.wall.getContext('2d')
        g.fillStyle = PAL.wall; g.fillRect(0, 0, TILE, TILE)
        g.fillStyle = PAL.wallHi; g.fillRect(0, 0, TILE, 2)
        g.fillStyle = PAL.wallLo; g.fillRect(0, TILE - 3, TILE, 3)
        g.fillStyle = 'rgba(255,255,255,0.05)'
        g.fillRect(2, 4, TILE - 4, 1)
    }

    // --- counter: wood top, chrome edge, sneeze guard ------------------
    S.counter = mk(TILE, TILE)[0]
    {
        const g = S.counter.getContext('2d')
        g.fillStyle = PAL.wood; g.fillRect(0, 0, TILE, TILE)
        g.fillStyle = PAL.woodHi; g.fillRect(0, 0, TILE, 5)
        g.fillStyle = PAL.chrome; g.fillRect(0, 0, TILE, 2)
        g.fillStyle = PAL.woodLo; g.fillRect(0, 6, TILE, 1)
        for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect((k * 7 + 2) % TILE, 8 + k * 3, 5, 1) }
        g.fillStyle = PAL.chromeLo; g.fillRect(0, TILE - 2, TILE, 2)
    }

    // --- station: walk-in cooler (two tiles wide) -----------------------
    S.cooler = mk(TILE, TILE)[0]
    {
        const g = S.cooler.getContext('2d')
        g.fillStyle = PAL.steel; g.fillRect(0, 0, TILE, TILE)
        g.fillStyle = PAL.steelHi; g.fillRect(0, 0, TILE, 3)
        g.fillStyle = PAL.steelLo; g.fillRect(0, TILE - 3, TILE, 3); g.fillRect(TILE - 1, 0, 1, TILE)
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(3, 5, 2, TILE - 10) // handle slot
        g.fillStyle = PAL.chrome; g.fillRect(3, 4, 3, TILE - 8)
        g.fillStyle = PAL.steelLo; g.fillRect(4, 6, 1, TILE - 12)
    }

    // --- burners: grate + flame states -------------------------------------
    S.burner = {}
    {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = '#20201e'; g.fillRect(0, 4, TILE, TILE - 4)
        g.fillStyle = '#383430'; g.fillRect(0, 4, TILE, 2)
        g.fillStyle = '#101008'
        g.fillRect(4, 8, TILE - 8, TILE - 12)
        g.fillStyle = '#3c3834'
        for (let k = 0; k < 3; k++) g.fillRect(4, 10 + k * 4, TILE - 8, 1)
        S.burner.empty = c
    }
    S.flame = []
    for (let f = 0; f < 4; f++) {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.burner.empty, 0, 0)
        const cols = [PAL.fire1, PAL.fire2, PAL.fire3]
        for (let k = 0; k < 5; k++) {
            const hgt = 6 + ((k + f) % 3) * 3
            const xx = 6 + k * 3
            g.fillStyle = cols[(k + f) % 3]
            g.fillRect(xx, 14 - hgt + 4, 2, hgt)
            g.fillStyle = PAL.fire1
            g.fillRect(xx, 16, 2, 2)
        }
        S.flame.push(c)
    }
    {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.burner.empty, 0, 0)
        g.fillStyle = PAL.char; g.fillRect(6, 9, TILE - 12, 6) // burnt patty
        g.fillStyle = '#484048'; g.fillRect(6, 9, TILE - 12, 1)
        S.burner.burnt = c
    }

    // --- pot states ---------------------------------------------------------
    S.pot = {}
    {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = '#181416'; g.fillRect(2, 8, TILE - 4, TILE - 10) // cold ring
        g.fillStyle = PAL.steelLo; g.fillRect(2, 8, TILE - 4, 2)
        S.pot.empty = c
    }
    S.pot.veg = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.pot.empty, 0, 0)
        g.fillStyle = PAL.potato; g.fillRect(6, 12, 4, 3)
        g.fillStyle = PAL.tomato; g.fillRect(12, 12, 4, 3)
        return c
    })()
    S.boil = []
    for (let f = 0; f < 4; f++) {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.pot.empty, 0, 0)
        g.fillStyle = PAL.soup; g.fillRect(4, 10, TILE - 8, TILE - 14)
        g.fillStyle = '#f8ecd0'
        g.fillRect(6 + (f * 3) % 8, 8 - (f % 2), 2, 2)
        g.fillRect(12 + (f * 5) % 4, 7 - ((f + 1) % 2), 2, 2)
        S.boil.push(c)
    }
    S.pot.ready = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.boil[0], 0, 0)
        g.fillStyle = '#fff8e0'
        g.fillRect(7, 5, 2, 3); g.fillRect(14, 4, 2, 3)
        return c
    })()
    S.pot.ruined = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.pot.empty, 0, 0)
        g.fillStyle = '#7c5820'; g.fillRect(4, 12, TILE - 8, 4)
        g.fillStyle = '#5c4010'; g.fillRect(3, 16, TILE - 6, 3) // boil-over mess
        return c
    })()

    // --- tap ------------------------------------------------------------
    S.tap = mk(TILE, TILE)[0]
    {
        const g = S.tap.getContext('2d')
        g.fillStyle = PAL.steelLo; g.fillRect(6, 2, 4, 8)
        g.fillStyle = PAL.steel; g.fillRect(4, 2, 10, 3)
        g.fillStyle = PAL.water; g.fillRect(7, 10, 2, 4)
        g.fillStyle = PAL.steelHi; g.fillRect(3, 16, 8, 6) // cup well
        g.fillStyle = PAL.steelLo; g.fillRect(3, 16, 8, 1)
    }

    // --- board with build states -------------------------------------------
    S.board = {}
    S.boardBase = mk(TILE, TILE)[0]
    {
        const g = S.boardBase.getContext('2d')
        g.fillStyle = '#7a4c20'; g.fillRect(0, 4, TILE, TILE - 4)
        g.fillStyle = PAL.woodHi; g.fillRect(0, 4, TILE, 2)
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 10, TILE, 1); g.fillRect(0, 16, TILE, 1)
        S.board.none = S.boardBase
    }
    S.board.bun = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.boardBase, 0, 0)
        g.fillStyle = PAL.bun; g.fillRect(6, 9, 12, 6)
        g.fillStyle = '#eec070'; g.fillRect(6, 9, 12, 2)
        return c
    })()
    S.board.buntom = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.board.bun, 0, 0)
        g.fillStyle = PAL.tomato; g.fillRect(7, 7, 10, 3)
        g.fillStyle = '#f05848'; g.fillRect(7, 7, 10, 1)
        return c
    })()
    S.board.melt = (function () {
        const [c, g] = mk(TILE, TILE)
        g.drawImage(S.board.buntom, 0, 0)
        g.fillStyle = PAL.pattyC; g.fillRect(6, 5, 12, 3)
        g.fillStyle = '#f8d860'; g.fillRect(6, 5, 12, 1) // cheese shine
        return c
    })()

    // --- service window ------------------------------------------------------
    S.window = mk(TILE, TILE)[0]
    {
        const g = S.window.getContext('2d')
        g.fillStyle = PAL.steelLo; g.fillRect(0, 0, TILE, TILE)
        g.fillStyle = '#1d3a24'; g.fillRect(2, 2, TILE - 4, TILE - 4) // dark pass
        g.fillStyle = '#38d058'; g.fillRect(4, 4, TILE - 8, 2) // PASS lamp
        g.fillStyle = PAL.chrome; g.fillRect(0, 0, TILE, 1); g.fillRect(0, TILE - 1, TILE, 1)
    }

    // --- items (12px) ---------------------------------------------------------
    S.item = {}
    const item = (fn) => { const [c, g] = mk(12, 12); fn(g); return c }
    S.item.bun = item((g) => { g.fillStyle = PAL.bun; g.fillRect(1, 4, 10, 6); g.fillStyle = '#eec070'; g.fillRect(1, 4, 10, 2) })
    S.item.tom = item((g) => { g.fillStyle = PAL.tomato; g.fillRect(2, 3, 8, 8); g.fillStyle = '#38a848'; g.fillRect(4, 1, 4, 2) })
    S.item.pot = item((g) => { g.fillStyle = PAL.potato; g.fillRect(2, 4, 8, 6); g.fillStyle = '#8a6838'; g.fillRect(4, 6, 1, 1); g.fillRect(7, 8, 1, 1) })
    S.item.patty = item((g) => { g.fillStyle = PAL.patty; g.fillRect(2, 5, 8, 4); g.fillStyle = '#a85838'; g.fillRect(2, 5, 8, 1) })
    S.item.pattyC = item((g) => { g.fillStyle = PAL.pattyC; g.fillRect(2, 5, 8, 4); g.fillStyle = '#301808'; g.fillRect(2, 7, 8, 1) })
    S.item.ruin = item((g) => { g.fillStyle = PAL.char; g.fillRect(2, 5, 8, 4); g.fillStyle = '#000'; g.fillRect(3, 6, 2, 2) })
    S.item.water = item((g) => { g.fillStyle = PAL.steel; g.fillRect(3, 3, 6, 8); g.fillStyle = PAL.water; g.fillRect(3, 3, 6, 3) })
    S.item.soup = item((g) => { g.fillStyle = '#e8e0d0'; g.fillRect(1, 5, 10, 5); g.fillStyle = PAL.soup; g.fillRect(2, 4, 8, 2); g.fillStyle = '#fff8e0'; g.fillRect(4, 1, 2, 2) })
    S.item.melt = item((g) => { g.fillStyle = PAL.bun; g.fillRect(1, 7, 10, 4); g.fillStyle = PAL.pattyC; g.fillRect(1, 5, 10, 2); g.fillStyle = '#eec070'; g.fillRect(1, 3, 10, 2) })
    S.item.meltG = item((g) => { g.drawImage(S.item.melt, 0, 0); g.fillStyle = PAL.tomato; g.fillRect(2, 2, 8, 2) })

    // --- cooks: 4 seats x 4 walk frames, 16x22, drawn per direction ------
    S.cook = []
    for (let seat = 0; seat < 4; seat++) {
        const frames = []
        for (let f = 0; f < 4; f++) {
            const [c, g] = mk(16, 22)
            const ap = PAL.apron[seat]
            // legs (walk cycle)
            g.fillStyle = '#2a2430'
            const lo = [0, 1, 0, -1][f]
            g.fillRect(4 + lo, 18, 3, 4); g.fillRect(9 - lo, 18, 3, 4)
            // shoes
            g.fillStyle = '#141014'
            g.fillRect(3 + lo, 21, 4, 1); g.fillRect(9 - lo, 21, 4, 1)
            // apron body
            g.fillStyle = ap; g.fillRect(3, 10, 10, 8)
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(3, 10, 10, 1)
            g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(3, 17, 10, 1)
            // arms
            g.fillStyle = ap; g.fillRect(1, 11 + (f % 2), 2, 5); g.fillRect(13, 11 + ((f + 1) % 2), 2, 5)
            // head + hat
            g.fillStyle = PAL.skin; g.fillRect(4, 5, 8, 6)
            g.fillStyle = PAL.skinLo; g.fillRect(4, 10, 8, 1)
            g.fillStyle = PAL.hat; g.fillRect(3, 1, 10, 5); g.fillRect(2, 4, 12, 2)
            g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(2, 5, 12, 1)
            // seat number pip
            g.fillStyle = '#fff'; g.fillRect(7, 12, 2, 2)
            frames.push(c)
        }
        S.cook.push(frames)
    }

    // --- ticket slip --------------------------------------------------------
    S.slip = {}
    for (const dish of ['soup', 'melt']) {
        const [c, g] = mk(34, 30)
        g.fillStyle = PAL.paper; g.fillRect(0, 0, 34, 30)
        g.fillStyle = PAL.paperLo
        for (let x = 0; x < 34; x += 4) g.fillRect(x, 28, 2, 2) // torn edge
        g.fillStyle = '#50484a'; g.fillRect(3, 3, 28, 2)
        g.fillStyle = dish === 'soup' ? PAL.soup : PAL.pattyC
        g.fillRect(4, 8, 10, 10)
        g.fillStyle = '#50484a'
        g.fillRect(17, 9, 14, 1); g.fillRect(17, 13, 12, 1); g.fillRect(17, 17, 14, 1)
        g.fillStyle = '#181018'
        g.fillRect(4, 21, 26, 1)
        S.slip[dish] = c
    }

    return S
}
