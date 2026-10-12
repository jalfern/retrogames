// LODE RUNNER-LITE — runtime pixel art. No image assets, no Math.random:
// every sprite and tile is a fixed pixel map (or a few rects) painted into
// an offscreen 20x22 canvas at load, exactly the way the original shipped —
// low internal resolution, scaled crisply. sim.js and levels.js stay pure
// Node; this file is paint-only and the browser alone ever imports it.
//
//   CW x CH cell            runner frames     guard frames   ghost (dim copy)
//   brick / solid / rope /  stand runA runB   same set,      all runner frames
//   ladder / hole / crumble / climbA climbB   other palette  in spectral blue
//                 3 stages   hang  fall

export const CW = 20
export const CH = 22

// ------------------------------------------------------------- pixel maps ----
// '.' is transparent. Maps are bottom-anchored in the cell (feet on the floor
// line) and centered horizontally, so a shorter run frame bobs up and down
// against the taller stand frame — that is the run, not a bug.

// runner, facing right. w=cap/shirt, s=skin, b=overalls, k=dark (eyes, boots)
const RUNNER = {
    stand: [
        '...wwww.....',
        '..wwwwww....',
        '..wwwwwwww..',
        '...ssssss...',
        '...ssskss...',
        '...wwwwww...',
        '..swwwwwws..',
        '..swwwwwws..',
        '...bbbbbb...',
        '...bbbbbb...',
        '...bb..bb...',
        '...bb..bb...',
        '..kk...kk...',
        '.kkk...kkk..',
    ],
    runA: [
        '...wwww.....',
        '..wwwwww....',
        '..wwwwwwww..',
        '...ssskss...',
        '...wwwwww...',
        '..swwwwwws..',
        '..swwwwwws..',
        '...bbbbbb...',
        '...bbbbbb...',
        '...bb..bb...',
        '..bb....bb..',
        '.kk......kk.',
    ],
    runB: [
        '...wwww.....',
        '..wwwwww....',
        '..wwwwwwww..',
        '...ssskss...',
        '...wwwwww...',
        '..swwwwwws..',
        '..swwwwwws..',
        '...bbbbbb...',
        '...bbbbbb...',
        '....bbbb....',
        '....bbbb....',
        '...kk..kk...',
    ],
    climbA: [
        '.s........s.',
        '.s........s.',
        '..s......s..',
        '..wwwwwwww..',
        '...ssskss...',
        '...wwwwww...',
        '...bbbbbb...',
        '...bbbbbb...',
        '..bb..bb....',
        '.kk...kk....',
    ],
    climbB: [
        '.s........s.',
        '..s......s..',
        '..s......s..',
        '..wwwwwwww..',
        '...ssskss...',
        '...wwwwww...',
        '...bbbbbb...',
        '...bbbbbb...',
        '..bb..bb....',
        '..kk....kk..',
    ],
    hang: [
        '....s..s....',
        '....s..s....',
        '....s..s....',
        '....s..s....',
        '...wwwwww...',
        '...ssskss...',
        '...wwwwww...',
        '..swwwwwws..',
        '...bbbbbb...',
        '...bbbbbb...',
        '...bb..bb...',
        '...bb..bb...',
    ],
    fall: [
        's.....ww....',
        's...wwwwww..',
        's...wwwwww..',
        's..sssksss..',
        '....ssssss..',
        '....wwwwww..',
        '....bbbbbb..',
        '....bbbbbb..',
        '....bb..bb..',
        '....bb..bb..',
        '...kk...kk..',
    ],
}

// the guard is the same body, olive kit — a silhouette you cannot mistake for
// the runner at the far end of a vault. o=cap/shirt, p=pants
const GUARD = {
    stand: [
        '...oooo.....',
        '..oooooo....',
        '..oooooooo..',
        '...ssssss...',
        '...ssskss...',
        '...oooooo...',
        '..soooooos..',
        '..soooooos..',
        '...pppppp...',
        '...pppppp...',
        '...pp..pp...',
        '...pp..pp...',
        '..kk...kk...',
        '.kkk...kkk..',
    ],
    runA: [
        '...oooo.....',
        '..oooooo....',
        '..oooooooo..',
        '...ssskss...',
        '...oooooo...',
        '..soooooos..',
        '..soooooos..',
        '...pppppp...',
        '...pppppp...',
        '...pp..pp...',
        '..pp....pp..',
        '.kk......kk.',
    ],
    runB: [
        '...oooo.....',
        '..oooooo....',
        '..oooooooo..',
        '...ssskss...',
        '...oooooo...',
        '..soooooos..',
        '..soooooos..',
        '...pppppp...',
        '...pppppp...',
        '....pppp....',
        '....pppp....',
        '...kk..kk...',
    ],
    climbA: [
        '.s........s.',
        '.s........s.',
        '..s......s..',
        '..oooooooo..',
        '...ssskss...',
        '...oooooo...',
        '...pppppp...',
        '...pppppp...',
        '..pp..pp....',
        '.kk...kk....',
    ],
    climbB: [
        '.s........s.',
        '..s......s..',
        '..s......s..',
        '..oooooooo..',
        '...ssskss...',
        '...oooooo...',
        '...pppppp...',
        '...pppppp...',
        '..pp..pp....',
        '..kk....kk..',
    ],
    hang: [
        '....s..s....',
        '....s..s....',
        '....s..s....',
        '....s..s....',
        '...oooooo...',
        '...ssskss...',
        '...oooooo...',
        '..soooooos..',
        '...pppppp...',
        '...pppppp...',
        '...pp..pp...',
        '...pp..pp...',
    ],
    fall: [
        's.....oo....',
        's...oooooo..',
        's...oooooo..',
        's..sssksss..',
        '....ssssss..',
        '....oooooo..',
        '....pppppp..',
        '....pppppp..',
        '....pp..pp..',
        '....pp..pp..',
        '...kk...kk..',
    ],
}

// the Apple II original's palette: an aqua runner, orange guards, grey
// rope and ladder on a dark navy vault. lodeplay pins each of these in
// pixels (a revert to the old white/olive/green/yellow read fails).
const PALETTES = {
    runner: { w: '#98e8c8', s: '#84dcc0', b: '#3ec8b4', k: '#0e2a33' },
    guard: { o: '#f08434', s: '#f2b078', p: '#c8681c', k: '#2a1808' },
    ghost: { w: '#b8c8dc', s: '#ccd8e8', b: '#5e7a9e', k: '#16202e' },
}

function fromMap(map, pal) {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    const w = map[0].length
    const offX = (CW - w) >> 1
    const offY = CH - map.length - 1               // bottom-anchored
    x.fillStyle = 'transparent'
    for (let r = 0; r < map.length; r++) {
        for (let col = 0; col < w; col++) {
            const ch = map[r][col]
            if (ch === '.') continue
            x.fillStyle = pal[ch]
            x.fillRect(offX + col, offY + r, 1, 1)
        }
    }
    // a 1px dark rim around the silhouette: the maps have no outline of
    // their own, and a runner standing on a same-hued brick needs it
    const src = x.getImageData(0, 0, CW, CH)
    const dark = pal.k
    const put = (px, py) => {
        const i = (py * CW + px) * 4
        if (src.data[i + 3] === 0) {
            x.fillStyle = dark
            x.fillRect(px, py, 1, 1)
        }
    }
    for (let py = 0; py < CH; py++) {
        for (let px = 0; px < CW; px++) {
            const i = (py * CW + px) * 4
            if (src.data[i + 3] !== 0) continue
            const nb = (ox, oy) => {
                if (px + ox < 0 || py + oy < 0 || px + ox >= CW || py + oy >= CH) return false
                return src.data[((py + oy) * CW + px + ox) * 4 + 3] !== 0
            }
            if (nb(1, 0) || nb(-1, 0) || nb(0, 1) || nb(0, -1)) put(px, py)
        }
    }
    return c
}

// the gold: the original's nugget — a bright lump that blinks, not a chest.
// g=body, G=sparkle, f=base. Two blink shades — BOTH pass lodeplay's
// warm-yellow pixel test (r>150, g>110, b<140).
const NUGGET = [
    '.....gggggg.....',
    '...gggggggggg...',
    '..gggggggggggg..',
    '.gggggggggggggg.',
    '.ggGgggggggggGg.',
    '.gggggggggggggg.',
    '.gggggggggggggg.',
    '.gggggggggggggg.',
    '..ffffffffffff..',
]

function nugget(pal) {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    const w = NUGGET[0].length
    const offX = (CW - w) >> 1
    const offY = CH - NUGGET.length - 1
    for (let r = 0; r < NUGGET.length; r++) {
        for (let col = 0; col < w; col++) {
            const ch = NUGGET[r][col]
            if (ch === '.') continue
            x.fillStyle = pal[ch]
            x.fillRect(offX + col, offY + r, 1, 1)
        }
    }
    return c
}

// ----------------------------------------------------------------- tiles ----
function rect(x, px, py, w, h, color) {
    x.fillStyle = color
    x.fillRect(px, py, w, h)
}

function brickTile() {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    rect(x, 0, 0, CW, CH, '#b06a3f')
    const mortar = '#714024'
    const hi = '#c8845a'
    // three courses of brick, offset like masonry; 1px mortar between
    const courses = [[0, [9]], [7, [4, 15]], [14, [9]]]
    for (const [y, joints] of courses) {
        rect(x, 0, y, CW, 1, mortar)
        rect(x, 0, y + 1, CW, 1, hi)
        for (const jx of joints) rect(x, jx, y + 1, 2, 6, mortar)
    }
    rect(x, 0, 21, CW, 1, mortar)
    return c
}

function solidTile() {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    rect(x, 0, 0, CW, CH, '#3a4258')
    rect(x, 0, 0, CW, 1, '#4a5570')
    rect(x, 0, 0, 1, CH, '#4a5570')
    rect(x, 9, 0, 2, CH, '#2c3346')          // concrete seam: a cross,
    rect(x, 0, 10, CW, 2, '#2c3346')         // never a mortar grid
    rect(x, 0, 21, CW, 1, '#232939')
    return c
}

function ropeTile() {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    rect(x, 0, 8, CW, 3, '#c9c9d4')
    rect(x, 0, 11, CW, 1, '#707088')
    for (let px = 1; px < CW; px += 3) rect(x, px, 9, 1, 1, '#9090a8')
    return c
}

function ladderTile() {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    rect(x, 5, 0, 2, CH, '#c9cdd9')
    rect(x, 13, 0, 2, CH, '#c9cdd9')
    for (const y of [4, 11, 18]) rect(x, 5, y, 10, 2, '#c9cdd9')
    rect(x, 5, 0, 10, 1, '#8890a4')
    return c
}

function holeTile() {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const x = c.getContext('2d')
    rect(x, 0, 0, CW, CH, '#0d0805')
    rect(x, 0, 0, CW, 2, '#1f130c')
    rect(x, 0, CH - 1, CW, 1, '#241a10')
    return c
}

// digging: the brick breaks in three falling stages over the anim window
function crumbleTiles() {
    const pit = holeTile()
    const out = []
    const shards = [
        [[3, 2, 5, 3], [11, 4, 5, 3], [6, 9, 4, 3]],
        [[5, 7, 5, 3], [12, 10, 4, 3]],
        [[7, 15, 4, 3]],
    ]
    for (const s of shards) {
        const c = document.createElement('canvas')
        c.width = CW; c.height = CH
        const x = c.getContext('2d')
        x.drawImage(pit, 0, 0)
        for (const [px, py, w, h] of s) {
            rect(x, px, py, w, h, '#b06a3f')
            rect(x, px, py + h - 1, w, 1, '#714024')
        }
        out.push(c)
    }
    return out
}

// refilling: the brick grows back out of a dark gap, closing to whole
function rebuildTiles(brick) {
    const out = []
    const gaps = [6, 2, 0]
    for (const gap of gaps) {
        const c = document.createElement('canvas')
        c.width = CW; c.height = CH
        const x = c.getContext('2d')
        x.drawImage(brick, 0, 0)
        if (gap > 0) {
            const gx = (CW - gap) >> 1
            rect(x, gx, 0, gap, CH, '#0d0805')
            rect(x, gx, 2, Math.max(1, gap - 2), 3, '#b06a3f')     // a chunk
            rect(x, gx, CH - 6, Math.max(1, gap - 2), 3, '#b06a3f') // half grown back
        }
        out.push(c)
    }
    return out
}

// ------------------------------------------------------------------ build ----
export function buildArt() {
    const frames = (maps, pal) => {
        const out = {}
        for (const name of Object.keys(maps)) out[name] = fromMap(maps[name], pal)
        return out
    }
    const runner = frames(RUNNER, PALETTES.runner)
    const guard = frames(GUARD, PALETTES.guard)
    const ghost = frames(RUNNER, PALETTES.ghost)
    const art = {
        runner, guard, ghost,
        gold: [nugget({ g: '#ffd23e', G: '#fff6c8', f: '#8a6a1c' }),
            nugget({ g: '#b8922e', G: '#d8bc6e', f: '#6e5213' })],
        brick: brickTile(),
        solid: solidTile(),
        rope: ropeTile(),
        ladder: ladderTile(),
        hole: holeTile(),
    }
    art.crumble = crumbleTiles()
    art.rebuild = rebuildTiles(art.brick)
    return art
}
