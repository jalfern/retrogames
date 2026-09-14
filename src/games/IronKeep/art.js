// IRONKEEP — every pixel in this game is generated at runtime.
//
// There are no image assets: wall textures are drawn into offscreen canvases with
// 2D primitives + seeded noise, sprites are authored through a tiny rect/ellipse
// DSL, and the HUD uses a hand-built 5x5 bitmap font. Like the audio, it keeps the
// whole title self-contained (and reproducible: every generator is seeded).
//
// Pixel format is the ImageData native one (little-endian ABGR), so a texel can be
// copied straight into the framebuffer with no per-pixel conversion:
//   R = u & 255, G = (u >> 8) & 255, B = (u >> 16) & 255

export const TEX = 64
export const SHADES = 12

// ---------------------------------------------------------------- primitives

export function hex(c) {
    const n = parseInt(c.slice(1), 16)
    return (((255 << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0)
}

export function shadePixel(u, f) {
    const r = Math.min(255, (u & 255) * f) | 0
    const g = Math.min(255, ((u >> 8) & 255) * f) | 0
    const b = Math.min(255, ((u >> 16) & 255) * (f * 1.06)) | 0
    return (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0)
}

// Pre-shaded copies of one bitmap. The renderer picks a level from distance and
// blits texels with zero arithmetic — this is what makes a software raycaster hit
// 60fps in JS. Level 0 is brightest, SHADES-1 is the fog floor.
export function shadeTable(src, transparent = false) {
    const out = []
    for (let i = 0; i < SHADES; i++) {
        const f = 1 - (i / (SHADES - 1)) * 0.88
        const t = new Uint32Array(src.length)
        for (let k = 0; k < src.length; k++) {
            if (transparent && src[k] === 0) continue
            t[k] = shadePixel(src[k], f)
        }
        out.push(t)
    }
    return out
}

// Deterministic RNG so textures/sprites never shimmer between reloads.
export function rng(seed) {
    let s = seed | 0
    return () => {
        s = (s + 0x6D2B79F5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ------------------------------------------------------------- bitmap font

// 5x5 caps. Drawn with fillRect on the low-res canvas, so HUD type is as chunky
// as the world (no fillText, which would antialias against the pixel grid).
export const FONT = {
    A: '.###./#...#/#####/#...#/#...#', B: '####./#...#/####./#...#/####.',
    C: '.###./#...#/#..../#...#/.###.', D: '####./#...#/#...#/#...#/####.',
    E: '#####/#..../###../#..../#####', F: '#####/#..../###../#..../#....',
    G: '.###./#..../#.###/#...#/.###.', H: '#...#/#...#/#####/#...#/#...#',
    I: '#####/..#../..#../..#../#####', J: '..###/...#./...#./#..#./.##..',
    K: '#...#/#..#/###../#..#./#...#', L: '#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#',
    O: '.###./#...#/#...#/#...#/.###.', P: '####./#...#/####./#..../#....',
    Q: '.###./#...#/#.#.#/#..#./.##.#', R: '####./#...#/####./#..#./#...#',
    S: '.####/#..../.###./....#/####.', T: '#####/..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#.#.#/##.##/#...#', X: '#...#/.#.#./..#../.#.#./#...#',
    Y: '#...#/.#.#./..#../..#../..#..', Z: '#####/...#./..#../.#.../#####',
    '0': '.###./#...#/#...#/#...#/.###.', '1': '..#../.##../..#../..#../.###.',
    '2': '####./....#/..##./.#.../#####', '3': '####./....#/..##./....#/####.',
    '4': '#..#./#..#/#####/...#./...#.', '5': '#####/#..../####./....#/####.',
    '6': '.###./#..../####./#...#/.###.', '7': '#####/....#/...#./..#../..#..',
    '8': '.###./#...#/.###./#...#/.###.', '9': '.###./#...#/.####/....#/.###.',
    ' ': '...../...../...../...../.....', '.': '...../...../...../..##./..##.',
    ',': '...../...../..##./..##./.#...', ':': '...../..#../...../..#../.....',
    ';': '...../..#../...../..##./.#...', '-': '...../...../#####/...../.....',
    '_': '...../...../...../...../#####', '+': '...../..#../#####/..#../.....',
    '=': '...../#####/...../#####/.....', '/': '....#/...#./..#../.#.../#....',
    '\\': '#..../.#.../..#../...#./....#', '*': '..#../.#.#./#####/.#.#./..#..',
    '#': '.#.#./#####/.#.#./#####/.#.#.', '!': '..#../..#../..#../...../..#..',
    '?': '.###./#...#/..##./...../..#..', "'": '..#../..#../...../...../.....',
    '"': '.#.#./.#.#./...../...../.....', '(': '..##./.#.../.#.../.#.../..##.',
    ')': '.##../...#./...#./...#./.##..', '<': '#..../.#.../..#../.#.../#....',
    '>': '#..../...#./..#../...#./#....', '[': '.###./.#.../.#.../.#.../.###.',
    ']': '.###./...#./...#./...#./.###.', '%': '#...#/...#./..#../.#.../#...#',
    '&': '.##../#.#../.##.#/#.##./.###.', '|': '..#../..#../..#../..#../..#..',
    '^': '..#../.###./#####/.#.#./..#..', '~': '...../.#..#./#.#.#./..#../.....',
    // Middle dot: level names and help lines use it as a separator, and an unknown
    // glyph falls back to '?', which read as a broken character on the attract screen.
    '·': '...../...../.##../.##../.....',
    '{': '..##./.##../.#.../.##../..##.', '}': '.##../..##./...#./..##./.##..',
}

export function textWidth(str, scale = 1) {
    return str.length * 6 * scale - scale
}

export function drawText(ctx, str, x, y, opts = {}) {
    const { scale = 1, color = '#ffffff', align = 'left', shadow = null, shadowOff = null } = opts
    const s = String(str).toUpperCase()
    let px = align === 'center' ? Math.round(x - textWidth(s, scale) / 2)
        : align === 'right' ? Math.round(x - textWidth(s, scale)) : Math.round(x)
    const py = Math.round(y)
    if (shadow) {
        const off = shadowOff === null ? scale : shadowOff
        drawText(ctx, s, px + off, py + off, { scale, color: shadow })
    }
    ctx.fillStyle = color
    for (let i = 0; i < s.length; i++) {
        const glyph = FONT[s[i]] || FONT['?']
        const rows = glyph.split('/')
        for (let ry = 0; ry < 5; ry++) {
            const row = rows[ry]
            for (let rx = 0; rx < 5; rx++) {
                if (row[rx] === '#') ctx.fillRect(px + rx * scale, py + ry * scale, scale, scale)
            }
        }
        px += 6 * scale
    }
}

// -------------------------------------------------------------- sprite DSL

// Author a sprite with rects/ellipses instead of ASCII art: no ragged rows, and
// `mr`/`mell` mirror horizontally so humanoid figures are symmetric by construction.
export function grid(w, h) {
    const p = new Uint32Array(w * h)
    const g = {
        w, h, p,
        px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return g; p[y * w + x] = c; return g },
        get(x, y) { return (x < 0 || y < 0 || x >= w || y >= h) ? 0 : p[y * w + x] },
        rect(x, y, ww, hh, c) {
            for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) g.px(x + i, y + j, c)
            return g
        },
        frame(x, y, ww, hh, c) {
            g.rect(x, y, ww, 1, c); g.rect(x, y + hh - 1, ww, 1, c)
            g.rect(x, y, 1, hh); g.rect(x + ww - 1, y, 1, hh)
            return g
        },
        mr(x, y, ww, hh, c) { g.rect(x, y, ww, hh, c); g.rect(w - x - ww, y, ww, hh, c); return g },
        mframe(x, y, ww, hh, c) { g.frame(x, y, ww, hh, c); g.frame(w - x - ww, y, ww, hh, c); return g },
        ell(cx, cy, rx, ry, c) {
            for (let j = -ry; j <= ry; j++) {
                const k = 1 - (j * j) / (ry * ry || 1)
                if (k <= 0) continue
                const span = Math.round(rx * Math.sqrt(k))
                for (let i = -span; i <= span; i++) g.px(cx + i, cy + j, c)
            }
            return g
        },
        mell(cx, cy, rx, ry, c) { g.ell(cx, cy, rx, ry, c); g.ell(w - cx, cy, rx, ry, c); return g },
        ring(cx, cy, r, c) {
            for (let a = 0; a < 64; a++) {
                const t = (a / 64) * Math.PI * 2
                g.px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), c)
            }
            return g
        },
        line(x0, y0, x1, y1, c, t = 1) {
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
            const r = t >> 1
            for (let i = 0; i <= n; i++) {
                const x = Math.round(x0 + (x1 - x0) * i / n)
                const y = Math.round(y0 + (y1 - y0) * i / n)
                for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) g.px(x + k, y + j, c)
            }
            return g
        },
        speck(seed, n, colors, x0 = 0, y0 = 0, ww = w, hh = h) {
            const r = rng(seed)
            for (let i = 0; i < n; i++) {
                const x = x0 + Math.floor(r() * ww), y = y0 + Math.floor(r() * hh)
                g.px(x, y, colors[Math.floor(r() * colors.length)])
            }
            return g
        },
        outline(c) {
            const src = p.slice()
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (src[y * w + x] !== 0) continue
                let hit = 0
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const v = src[(y + dy) * w + (x + dx)]
                    if (v !== undefined && x + dx >= 0 && x + dx < w && v !== 0) hit = v
                }
                if (hit) p[y * w + x] = c
            }
            return g
        },
        tint(fn) { for (let i = 0; i < p.length; i++) if (p[i]) p[i] = fn(p[i]); return g },
    }
    return g
}

// ---------------------------------------------------------------- palette

export const C = {
    ink: hex('#0b0a10'),
    steel: hex('#8e93a6'),
    steelD: hex('#5b5f74'),
    steelL: hex('#c3c8dc'),
    iron: hex('#3b3d4c'),
    ironL: hex('#6a6d82'),
    bone: hex('#ddd0ad'),
    boneD: hex('#a3987a'),
    red: hex('#a8282c'),
    redD: hex('#6d1a1e'),
    redL: hex('#e0554a'),
    gold: hex('#d8a72c'),
    goldD: hex('#8a6415'),
    goldL: hex('#f6d97a'),
    wood: hex('#6b4526'),
    woodD: hex('#432b17'),
    woodL: hex('#8d6238'),
    green: hex('#4c7a3f'),
    greenL: hex('#7fbf5f'),
    greenD: hex('#2b4a26'),
    violet: hex('#5b2f7a'),
    violetL: hex('#9b62c4'),
    blue: hex('#2f4d7a'),
    ember: hex('#ff8a2b'),
    emberL: hex('#ffd27a'),
    skin: hex('#c99a6e'),
    white: hex('#f2f0ea'),
    black: hex('#000000'),
}

// ------------------------------------------------------------ world sprites

const H = 24   // humanoid sprite height
const W = 16   // humanoid sprite width

// Legionary grunt — iron helm, red tabard, crossbow across the body.
function grunt(pal, frame) {
    const g = grid(W, H)
    const s = pal.steel, sd = pal.steelD, tunic = pal.body, td = pal.bodyD
    // legs + boots
    g.mr(5, 16, 2, 6, sd); g.mr(4, 21, 3, 3, pal.boot)
    // torso
    g.rect(4, 8, 8, 8, tunic); g.rect(4, 8, 1, 8, td); g.rect(11, 8, 1, 8, td)
    g.rect(7, 8, 2, 8, pal.sigil || pal.gold)          // tabard stripe
    g.rect(4, 13, 8, 2, pal.belt); g.rect(7, 13, 2, 2, pal.gold)
    // shoulders
    g.mell(3, 8, 2, 2, s); g.mframe(2, 7, 4, 4, sd)
    // arms (raised when firing)
    const ay = frame === 'shoot' ? 10 : 10
    g.mr(1, ay, 2, frame === 'shoot' ? 4 : 6, sd)
    g.mr(1, frame === 'shoot' ? 14 : 16, 2, 2, pal.skin)
    // helm + visor
    g.rect(5, 1, 6, 6, s); g.frame(5, 0, 6, 7, sd)
    g.rect(6, 0, 4, 1, pal.plume)
    g.rect(5, 4, 6, 1, pal.ink)
    g.px(6, 4, pal.eye); g.px(9, 4, pal.eye)
    g.rect(7, 5, 2, 2, sd)
    // crossbow
    if (frame === 'shoot') {
        g.rect(3, 12, 10, 1, pal.wood); g.rect(2, 10, 1, 4, pal.woodD); g.rect(13, 10, 1, 4, pal.woodD)
        g.rect(7, 9, 2, 2, pal.ember); g.px(8, 8, pal.emberL)
    } else {
        g.rect(3, 14, 10, 1, pal.wood); g.rect(2, 13, 1, 3, pal.woodD); g.rect(13, 13, 1, 3, pal.woodD)
        g.line(2, 13, 13, 16, pal.boneD)
    }
    return g.outline(pal.ink)
}

// Hound — low, wide, front-on so it reads as "charging" at any distance.
function hound(pal, frame) {
    const g = grid(W, 16)
    g.ell(8, 10, 5, 4, pal.fur); g.ell(8, 9, 4, 3, pal.furL)
    g.mr(4, 13, 2, 3, pal.furD); g.mr(9, 13, 2, 3, pal.furD)
    if (frame === 'run') { g.mr(3, 12, 2, 3, pal.furD); g.mr(11, 12, 2, 3, pal.furD) }
    g.ell(8, 5, 4, 4, pal.fur); g.ell(8, 6, 3, 3, pal.furL)
    g.rect(6, 1, 2, 3, pal.furD); g.rect(12, 1, 2, 3, pal.furD)   // ears
    g.rect(6, 6, 4, 3, pal.furD)                                     // muzzle
    g.rect(7, 7, 2, 1, pal.white)
    g.px(6, 4, pal.eye); g.px(7, 4, pal.eye); g.px(9, 4, pal.eye); g.px(10, 4, pal.eye)
    if (frame === 'bite') {
        g.rect(6, 8, 4, 1, pal.ink); g.rect(6, 9, 1, 2, pal.white); g.rect(9, 9, 1, 2, pal.white)
        g.rect(7, 10, 2, 1, pal.redD)
    }
    g.line(13, 9, 15, 6, pal.furD)
    return g.outline(pal.ink)
}

// Occultist — robe, deep hood, staff orb. Fires from range.
function mage(pal, frame) {
    const g = grid(W, H)
    for (let y = 9; y < H; y++) {                            // cone robe
        const half = Math.min(6, 1 + Math.floor((y - 9) / 2.6))
        g.rect(8 - half, y, half * 2, 1, pal.robe)
        g.px(8 - half, y, pal.robeD); g.px(8 + half - 1, y, pal.robeD)
    }
    g.rect(7, 12, 2, 6, pal.trim)
    g.ell(8, 6, 4, 5, pal.robe); g.ell(8, 6, 3, 4, pal.ink)  // hood + shadow
    g.px(7, 6, pal.eye); g.px(9, 6, pal.eye); g.px(8, 5, pal.eye)
    g.rect(12, 4, 1, 16, pal.wood)                            // staff
    g.ring(12, 3, 3, pal.ink)                                  // iron cage
    g.ell(12, 3, 2, 2, frame === 'shoot' ? pal.emberL : pal.ember)
    g.ell(12, 3, 1, 1, pal.emberL)
    g.px(12, 3, pal.white)
    if (frame === 'shoot') { g.ell(12, 3, 3, 3, pal.ember); g.ell(12, 3, 1, 1, pal.white) }
    g.mr(2, 9, 2, 4, pal.robe)
    return g.outline(pal.ink)
}

// Boss — horned warden in black plate, twice the height.
function boss(pal, frame) {
    const g = grid(24, 32)
    g.rect(7, 20, 4, 10, pal.steelD); g.rect(13, 20, 4, 10, pal.steelD)   // legs
    g.mr(5, 29, 5, 3, pal.ironL)                                           // boots
    g.rect(5, 8, 14, 13, pal.plate)                                        // cuirass
    g.rect(5, 8, 2, 13, pal.plateD); g.rect(17, 8, 2, 13, pal.plateD)
    g.rect(10, 9, 4, 11, pal.trim); g.px(12, 13, pal.goldL)
    g.mell(3, 9, 3, 3, pal.steel); g.mframe(1, 7, 6, 6, pal.steelD)        // pauldrons
    g.rect(9, 1, 6, 7, pal.helm); g.frame(9, 1, 6, 7, pal.steelD)
    g.rect(10, 4, 4, 2, pal.ink); g.px(10, 5, pal.eye); g.px(11, 5, pal.eye)
    g.px(12, 5, pal.eye); g.px(13, 5, pal.eye)
    g.line(9, 1, 5, -2, pal.bone); g.line(15, 1, 19, -2, pal.bone)         // horns
    g.rect(11, 0, 2, 2, pal.plume)
    g.mr(1, 14, 3, 7, pal.plateD)                                          // arms
    g.line(20, 8, 20, 29, pal.woodD, 2)                                     // axe haft
    g.rect(15, 5, 8, 8, pal.steel); g.frame(15, 5, 8, 8, pal.ink)           // axe head
    g.ell(17, 9, 3, 4, pal.steelL)
    g.rect(14, 6, 2, 6, pal.steelL); g.px(15, 6, pal.white)
    if (frame === 'shoot') { g.ell(12, 14, 4, 4, pal.ember); g.ell(12, 14, 2, 2, pal.white) }
    return g.outline(pal.ink)
}

function corpse(pal) {
    const g = grid(W, 10)
    g.ell(8, 7, 6, 3, pal.blood); g.ell(7, 6, 4, 2, pal.bloodD)
    g.ell(4, 5, 3, 2, pal.steelD); g.rect(9, 4, 4, 3, pal.bone)
    g.px(10, 5, pal.ink); g.px(12, 5, pal.ink)
    g.mr(2, 8, 3, 2, pal.steel)
    return g.outline(pal.ink)
}

function pickup(w, h, draw) { const g = grid(w, h); draw(g); return g.outline(C.ink) }

const SPRITES = {
    grunt: (frame = 'stand') => grunt({
        steel: C.steel, steelD: C.steelD, body: C.red, bodyD: C.redD, boot: C.iron,
        belt: C.woodD, skin: C.skin, gold: C.gold, plume: C.redL, eye: C.ember,
        wood: C.wood, woodD: C.woodD, ink: C.ink, boneD: C.boneD, ember: C.ember, emberL: C.emberL, white: C.white,
    }, frame),
    hound: (frame = 'stand') => hound({
        fur: C.iron, furL: C.ironL, furD: C.ink, eye: C.redL, white: C.white,
        redD: C.redD, ink: C.ink,
    }, frame),
    mage: (frame = 'stand') => mage({
        robe: C.violet, robeD: C.ink, trim: C.gold, eye: C.greenL, ember: C.ember,
        emberL: C.emberL, wood: C.wood, white: C.white, ink: C.ink,
    }, frame),
    boss: (frame = 'stand') => boss({
        steel: C.steelD, steelD: C.ink, plate: C.iron, plateD: C.ink, helm: C.steelD,
        ironL: C.ironL, trim: C.violetL, eye: C.emberL, plume: C.redL, goldL: C.goldL,
        bone: C.bone, wood: C.woodD, woodD: hex('#241608'), ember: C.ember, white: C.white, ink: C.ink,
    }, frame),
    gruntCorpse: () => corpse({ blood: C.redD, bloodD: hex('#5b1418'), steel: C.steelD, steelD: C.iron, bone: C.bone, ink: C.ink }),
    houndCorpse: () => { const g = grid(16, 8); g.ell(8, 5, 6, 3, hex('#5b1418')); g.ell(6, 4, 3, 2, C.iron); g.px(5, 4, C.ink); g.px(7, 4, C.ink); return g.outline(C.ink) },
    mageCorpse: () => { const g = grid(16, 9); g.ell(8, 6, 6, 3, C.violet); g.ell(8, 5, 4, 2, C.violetL); g.rect(11, 2, 1, 6, C.wood); return g.outline(C.ink) },
    bossCorpse: () => { const g = grid(24, 12); g.ell(12, 8, 10, 4, hex('#5b1418')); g.ell(7, 6, 5, 3, C.iron); g.rect(14, 5, 6, 4, C.bone); g.rect(2, 3, 6, 3, C.steelD); return g.outline(C.ink) },

    potion: () => pickup(12, 14, g => {
        g.rect(5, 1, 2, 2, C.woodD); g.ell(6, 8, 4, 5, C.red); g.ell(6, 9, 3, 3, C.redL)
        g.rect(5, 4, 2, 3, C.steelL); g.px(4, 7, C.white)
    }),
    bolts: () => pickup(14, 12, g => {
        for (let i = 0; i < 3; i++) {
            const x = 3 + i * 3
            g.line(x, 10, x + 2, 1, C.wood); g.px(x + 2, 1, C.steelL); g.px(x + 1, 2, C.steel)
            g.px(x, 9, C.bone); g.px(x + 1, 8, C.boneD)
        }
        g.rect(2, 6, 9, 1, C.woodD)
    }),
    keyGold: () => pickup(12, 12, g => {
        g.ell(4, 4, 3, 3, C.gold); g.ell(4, 4, 1, 1, C.ink); g.ell(4, 4, 1, 1, C.goldL)
        g.rect(5, 4, 6, 2, C.gold); g.rect(9, 6, 1, 2, C.gold); g.rect(7, 6, 1, 3, C.gold)
        g.px(3, 2, C.goldL)
    }),
    keyIron: () => pickup(12, 12, g => {
        g.ell(4, 4, 3, 3, C.steel); g.ell(4, 4, 1, 1, C.ink)
        g.rect(5, 4, 6, 2, C.steel); g.rect(9, 6, 1, 2, C.steel); g.rect(7, 6, 1, 3, C.steel)
    }),
    chest: () => pickup(16, 14, g => {
        g.rect(2, 6, 12, 7, C.wood); g.rect(2, 6, 12, 2, C.woodD); g.frame(2, 6, 12, 7, C.woodD)
        g.rect(2, 9, 12, 2, C.gold); g.rect(7, 8, 2, 4, C.goldL)
        g.px(4, 11, C.gold); g.px(11, 11, C.gold); g.px(7, 4, C.emberL)
    }),
    goblet: () => pickup(12, 12, g => {
        g.rect(3, 2, 6, 4, C.gold); g.rect(4, 3, 4, 2, C.goldL); g.rect(5, 6, 2, 3, C.gold)
        g.rect(3, 9, 6, 2, C.goldD); g.px(4, 1, C.emberL); g.px(7, 1, C.greenL)
    }),
    banner: () => pickup(12, 16, g => {
        g.rect(2, 0, 1, 16, C.woodD); g.rect(3, 1, 8, 11, C.green)
        g.rect(3, 11, 8, 1, C.greenD); g.ell(7, 5, 2, 2, C.bone)
        g.px(6, 5, C.ink); g.px(8, 5, C.ink); g.rect(6, 8, 3, 1, C.ink)
        g.px(2, 0, C.goldL)
    }),
    repeater: () => pickup(18, 10, g => {
        g.rect(2, 5, 14, 3, C.woodD); g.rect(3, 3, 5, 2, C.steelD); g.rect(9, 3, 5, 2, C.steelD)
        g.rect(1, 4, 2, 4, C.wood); g.px(4, 2, C.steelL); g.px(10, 2, C.steelL)
    }),
    launcher: () => pickup(18, 12, g => {
        g.rect(2, 4, 13, 5, C.iron); g.rect(2, 4, 13, 1, C.ironL); g.ell(15, 6, 3, 3, C.ember)
        g.ell(15, 6, 1, 1, C.emberL); g.rect(4, 9, 4, 3, C.woodD); g.rect(9, 2, 3, 2, C.violetL)
    }),
    bolt: () => pickup(6, 6, g => { g.line(1, 4, 5, 1, C.steelL); g.px(5, 1, C.white); g.px(1, 4, C.boneD) }),
    fireball: () => pickup(10, 10, g => {
        g.ell(5, 5, 4, 4, C.ember); g.ell(5, 5, 3, 3, C.emberL); g.ell(5, 5, 1, 1, C.white)
    }),
    blood: () => pickup(6, 6, g => {
        g.ell(3, 3, 2, 2, C.redD); g.px(1, 1, C.red); g.px(5, 4, C.red); g.px(3, 0, C.redL)
    }),
    spark: () => pickup(6, 6, g => {
        g.ell(3, 3, 2, 2, C.emberL); g.px(3, 3, C.white); g.px(0, 3, C.ember); g.px(5, 3, C.ember)
    }),
}

export const SPRITE_META = {
    // worldH = height in world tiles; the raycaster scales art by this, so the
    // art aspect ratio must match the intended in-world proportions.
    grunt: { worldH: 0.86, frames: ['stand', 'shoot'] },
    hound: { worldH: 0.48, frames: ['stand', 'run', 'bite'] },
    mage: { worldH: 0.9, frames: ['stand', 'shoot'] },
    boss: { worldH: 1.65, frames: ['stand', 'shoot'] },
    gruntCorpse: { worldH: 0.3 }, houndCorpse: { worldH: 0.24 },
    mageCorpse: { worldH: 0.28 }, bossCorpse: { worldH: 0.5 },
    potion: { worldH: 0.36 }, bolts: { worldH: 0.32 }, keyGold: { worldH: 0.32 },
    keyIron: { worldH: 0.32 }, chest: { worldH: 0.38 }, goblet: { worldH: 0.32 },
    banner: { worldH: 0.44 }, repeater: { worldH: 0.3 }, launcher: { worldH: 0.34 },
    bolt: { worldH: 0.16 }, fireball: { worldH: 0.3 }, blood: { worldH: 0.14 },
    spark: { worldH: 0.16 },
}

// -------------------------------------------------------------- first-person

// The player's own weapon: authored as sprites too, then blitted with drawImage
// (smoothing off) so hands and gun are pixel-identical to the world. Composed
// bottom-heavy like a Wolf3D gun — the silhouette has to read at 80x56 while
// half of it runs off the bottom of the viewport.
const WEAPON_ART = {
    crossbow: (g) => {
        // bow: an arc whose tips lean toward the camera
        g.line(6, 26, 26, 14, C.woodD, 5)
        g.line(74, 26, 54, 14, C.woodD, 5)
        g.line(26, 14, 54, 14, C.wood, 4)
        g.line(26, 13, 54, 13, C.woodL, 1)
        g.px(6, 26, C.ironL); g.px(74, 26, C.ironL)
        // string, drawn taut to the nut
        g.line(7, 25, 40, 20, C.boneD, 1)
        g.line(73, 25, 40, 20, C.boneD, 1)
        // nut / winch housing
        g.rect(30, 16, 20, 12, C.steelD); g.frame(30, 16, 20, 12, C.ink)
        g.rect(32, 18, 16, 3, C.steel); g.rect(36, 22, 8, 4, C.iron)
        g.px(33, 26, C.steelL); g.px(46, 26, C.steelL)
        // bolt on the rail
        g.rect(39, 2, 2, 16, C.steel); g.px(40, 1, C.steelL); g.px(39, 1, C.ironL)
        g.rect(37, 15, 6, 3, C.woodD)
        // stock running off the bottom
        g.rect(33, 26, 14, 30, C.woodD)
        g.rect(35, 28, 10, 28, C.wood)
        g.rect(36, 30, 2, 24, C.woodL)
        g.rect(33, 40, 14, 3, C.iron); g.px(40, 44, C.gold)
        // hands: right on the grip, left under the bow
        g.rect(24, 34, 14, 18, C.skin); g.frame(24, 34, 14, 18, C.woodD)
        g.line(28, 34, 28, 44, C.woodD, 1); g.line(32, 34, 32, 44, C.woodD, 1)
        g.rect(50, 32, 13, 16, C.skin); g.frame(50, 32, 13, 16, C.woodD)
        g.line(54, 32, 54, 42, C.woodD, 1); g.line(58, 32, 58, 42, C.woodD, 1)
    },
    repeater: (g) => {
        // twin rails, drum magazine, shorter stock
        g.rect(16, 12, 48, 6, C.steelD); g.frame(16, 12, 48, 6, C.ink)
        g.rect(18, 13, 44, 2, C.steel)
        g.rect(12, 10, 6, 12, C.iron); g.rect(62, 10, 6, 12, C.iron)
        g.rect(30, 6, 20, 14, C.iron); g.frame(30, 6, 20, 14, C.ink)
        g.rect(32, 8, 16, 3, C.steel)
        g.rect(36, 2, 3, 8, C.steelL); g.rect(42, 2, 3, 8, C.steelL)
        g.ell(40, 24, 9, 6, C.iron); g.ring(40, 24, 8, C.ironL)   // drum
        g.rect(34, 30, 12, 26, C.woodD); g.rect(36, 32, 8, 24, C.wood)
        g.rect(34, 38, 12, 3, C.goldD)
        g.rect(22, 36, 14, 18, C.skin); g.frame(22, 36, 14, 18, C.woodD)
        g.line(26, 36, 26, 46, C.woodD, 1); g.line(30, 36, 30, 46, C.woodD, 1)
        g.rect(48, 34, 13, 16, C.skin); g.frame(48, 34, 13, 16, C.woodD)
        g.line(52, 34, 52, 44, C.woodD, 1)
    },
    launcher: (g) => {
        // occult tube: iron staves, violet bands, a mouth full of fire
        g.ell(40, 20, 15, 14, C.iron)
        g.rect(26, 20, 28, 30, C.iron)
        g.frame(26, 20, 28, 30, C.ink)
        g.rect(28, 22, 6, 26, C.ironL)
        g.ell(40, 18, 12, 11, C.ink)
        g.ell(40, 18, 9, 8, C.ember)
        g.ell(40, 18, 4, 4, C.emberL)
        g.ell(40, 18, 1, 1, C.white)
        g.rect(26, 30, 28, 4, C.violetL)
        g.rect(26, 42, 28, 4, C.violet)
        g.px(31, 38, C.greenL); g.px(40, 38, C.greenL); g.px(49, 38, C.greenL)
        g.rect(22, 26, 6, 14, C.steelD); g.rect(52, 26, 6, 14, C.steelD)
        g.rect(20, 40, 15, 16, C.skin); g.frame(20, 40, 15, 16, C.woodD)
        g.line(25, 40, 25, 50, C.woodD, 1)
        g.rect(46, 42, 14, 14, C.skin); g.frame(46, 42, 14, 14, C.woodD)
        g.line(51, 42, 51, 52, C.woodD, 1)
    },
}

function muzzleFlash(w, h) {
    // Angular burst, not a disc. The obvious version (filled ellipse + 8 even
    // spokes) rendered as a jack-o'-lantern and hid the weapon silhouette.
    const g = grid(w, h)
    const cx = w / 2 | 0, cy = (h * 0.44) | 0
    g.ell(cx, cy, 6, 5, C.ember)
    g.ell(cx, cy, 3, 3, C.emberL)
    g.ell(cx, cy, 1, 1, C.white)
    for (let i = 0; i < 7; i++) {
        const a = i * (Math.PI * 2 / 7) + 0.4
        const l = (i % 3 === 0 ? 15 : i % 3 === 1 ? 10 : 6) * (0.85 + ((i * 37) % 10) / 34)
        g.line(cx, cy, Math.round(cx + Math.cos(a) * l), Math.round(cy + Math.sin(a) * l * 0.8), C.emberL, 1)
        g.line(cx, cy, Math.round(cx + Math.cos(a) * (l * 0.55)), Math.round(cy + Math.sin(a) * l * 0.45), C.white, 1)
    }
    return g
}

// ------------------------------------------------------------------ textures

const T = {}

function texCanvas(draw, seed) {
    const c = document.createElement('canvas')
    c.width = TEX; c.height = TEX
    const g = c.getContext('2d')
    const r = rng(seed)
    draw(g, r)
    return new Uint32Array(g.getImageData(0, 0, TEX, TEX).data.buffer)
}

function noise(g, seed, n, colors, w = TEX, h = TEX) {
    const r = rng(seed)
    for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(r() * colors.length)]
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2))
    }
}

function buildTextures() {
    T.brick = texCanvas((g) => {
        g.fillStyle = '#241f1c'; g.fillRect(0, 0, TEX, TEX)
        const r = rng(7)
        for (let row = 0; row < 8; row++) {
            const off = (row % 2) * 8
            for (let col = -1; col < 5; col++) {
                const x = col * 16 + off, y = row * 8
                const t = 0.72 + r() * 0.4
                g.fillStyle = `rgb(${Math.round(120 * t)},${Math.round(66 * t)},${Math.round(48 * t)})`
                g.fillRect(x + 1, y + 1, 14, 6)
                g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 1, y + 5, 14, 2)
                g.fillStyle = 'rgba(255,220,190,0.10)'; g.fillRect(x + 1, y + 1, 14, 1)
            }
        }
        noise(g, 3, 500, ['rgba(0,0,0,0.35)', 'rgba(255,200,160,0.10)', 'rgba(30,20,16,0.5)'])
    }, 1)

    T.stone = texCanvas((g) => {
        g.fillStyle = '#2c2e38'; g.fillRect(0, 0, TEX, TEX)
        const r = rng(11)
        for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
            const x = col * 32 + (row % 2) * 16, y = row * 16
            const t = 0.8 + r() * 0.35
            g.fillStyle = `rgb(${Math.round(116 * t)},${Math.round(120 * t)},${Math.round(136 * t)})`
            g.fillRect(x + 1, y + 1, 30, 14)
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 11, 30, 4)
            g.fillStyle = 'rgba(210,220,245,0.12)'; g.fillRect(x + 1, y + 1, 30, 1)
        }
        noise(g, 5, 700, ['rgba(0,0,0,0.3)', 'rgba(190,200,220,0.10)'])
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1
        g.beginPath(); g.moveTo(8, 4); g.lineTo(18, 22); g.lineTo(12, 40); g.stroke()
    }, 2)

    T.moss = texCanvas((g) => {
        g.fillStyle = '#26301f'; g.fillRect(0, 0, TEX, TEX)
        const r = rng(23)
        // Brick grid under the moss, so the wall still reads as masonry when you are
        // nose-first into it — a pure blotch field turns to soup at close range.
        for (let row = 0; row < 8; row++) {
            const off = (row % 2) * 8
            for (let col = -1; col < 5; col++) {
                const x = col * 16 + off, y = row * 8
                const t = 0.7 + r() * 0.4
                g.fillStyle = `rgb(${58 * t | 0},${66 * t | 0},${52 * t | 0})`
                g.fillRect(x + 1, y + 1, 14, 6)
            }
        }
        for (let i = 0; i < 26; i++) {
            const x = r() * TEX, y = r() * TEX, rad = 4 + r() * 12
            g.fillStyle = `rgba(${50 + r() * 40 | 0},${90 + r() * 60 | 0},${40 + r() * 30 | 0},0.42)`
            g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill()
        }
        for (let y = 0; y < TEX; y += 8) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, TEX, 2) }
        for (let x = 0; x < TEX; x += 16) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 2, TEX) }
        noise(g, 9, 600, ['rgba(0,0,0,0.35)', 'rgba(150,200,120,0.14)'])
    }, 3)

    T.iron = texCanvas((g) => {
        g.fillStyle = '#31333f'; g.fillRect(0, 0, TEX, TEX)
        for (let i = 0; i < 4; i++) {
            g.fillStyle = '#3d4050'; g.fillRect(2 + i * 16, 2, 14, 60)
            g.fillStyle = 'rgba(200,210,235,0.10)'; g.fillRect(2 + i * 16, 2, 3, 60)
            g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(13 + i * 16, 2, 3, 60)
        }
        g.fillStyle = '#20222c'; g.fillRect(0, 0, TEX, 4); g.fillRect(0, 30, TEX, 4); g.fillRect(0, 60, TEX, 4)
        const r = rng(31)
        for (let i = 0; i < 40; i++) {
            const x = 4 + Math.floor(r() * 56), y = 4 + Math.floor(r() * 56)
            g.fillStyle = '#8b90a6'; g.fillRect(x, y, 2, 2)
            g.fillStyle = '#cfd5ea'; g.fillRect(x, y, 1, 1)
        }
        noise(g, 13, 400, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.06)'])
    }, 4)

    T.tapestry = texCanvas((g) => {
        g.fillStyle = '#4a1218'; g.fillRect(0, 0, TEX, TEX)
        g.fillStyle = '#5e1a22'; g.fillRect(4, 0, 56, TEX)
        g.fillStyle = '#c8a234'; g.fillRect(4, 2, 56, 3); g.fillRect(4, 59, 56, 3)
        g.fillStyle = '#c8a234'
        g.beginPath(); g.moveTo(32, 16); g.lineTo(44, 40); g.lineTo(20, 40); g.closePath(); g.fill()
        g.fillStyle = '#2b0b10'; g.fillRect(29, 24, 6, 12)
        g.fillStyle = '#c8a234'; g.fillRect(26, 44, 12, 3)
        for (let x = 6; x < 58; x += 4) { g.fillStyle = '#8d6a1c'; g.fillRect(x, 55, 2, 6) }
        noise(g, 17, 500, ['rgba(0,0,0,0.25)', 'rgba(255,220,180,0.06)'])
    }, 5)

    const door = (band, bandL) => (g) => {
        g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, TEX, TEX)
        // Eight planks with a dark seam and a lit edge each — at arm's length a door
        // fills the whole viewport, and mushy planks are the first thing to break it.
        for (let i = 0; i < 8; i++) {
            const x = i * 8
            const t = 0.74 + ((i * 37) % 11) / 40
            g.fillStyle = `rgb(${112 * t | 0},${72 * t | 0},${42 * t | 0})`
            g.fillRect(x + 1, 0, 6, TEX)
            g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + 7, 0, 1, TEX)
            g.fillStyle = 'rgba(255,214,160,0.13)'; g.fillRect(x + 1, 0, 1, TEX)
            g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 5, 0, 2, TEX)
        }
        noise(g, 41, 220, ['rgba(0,0,0,0.22)', 'rgba(255,220,170,0.05)'])
        g.fillStyle = band; g.fillRect(0, 6, TEX, 9); g.fillRect(0, 48, TEX, 9)
        g.fillStyle = bandL; g.fillRect(0, 6, TEX, 2); g.fillRect(0, 48, TEX, 2)
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 13, TEX, 2); g.fillRect(0, 55, TEX, 2)
        for (let i = 0; i < 8; i++) {
            const x = 4 + i * 8
            g.fillStyle = bandL; g.fillRect(x, 9, 3, 3); g.fillRect(x, 51, 3, 3)
            g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 2, 10, 1, 2); g.fillRect(x + 2, 52, 1, 2)
        }
        g.fillStyle = '#1a1208'; g.beginPath(); g.arc(32, 32, 8, 0, 7); g.fill()
        g.fillStyle = band; g.beginPath(); g.arc(32, 32, 6, 0, 7); g.fill()
        g.fillStyle = '#120b06'; g.beginPath(); g.arc(32, 31, 3, 0, 7); g.fill()
        g.fillRect(31, 31, 2, 7)
    }
    T.door = texCanvas(door('#4c4f5e', '#9aa0b8'), 6)
    T.doorGold = texCanvas(door('#8a6415', '#f0cd6b'), 7)
    T.doorIron = texCanvas(door('#565b6e', '#b7bdd4'), 8)

    T.exit = texCanvas((g) => {
        g.fillStyle = '#0a1410'; g.fillRect(0, 0, TEX, TEX)
        g.fillStyle = '#16302a'; g.fillRect(6, 4, 52, 60)
        const grd = g.createLinearGradient(0, 60, 0, 0)
        grd.addColorStop(0, 'rgba(90,255,170,0.85)'); grd.addColorStop(1, 'rgba(20,90,70,0.15)')
        g.fillStyle = grd; g.fillRect(10, 8, 44, 56)
        g.fillStyle = '#2b2a20'
        g.fillRect(10, 8, 44, 4); g.fillRect(10, 8, 5, 56); g.fillRect(49, 8, 5, 56)
        g.fillStyle = '#8ef0c0'
        for (let i = 0; i < 5; i++) g.fillRect(16 + i * 8, 20 + (i % 2) * 14, 3, 9)
        noise(g, 53, 300, ['rgba(140,255,200,0.10)', 'rgba(0,0,0,0.3)'])
    }, 9)

    T.floor = texCanvas((g) => {
        g.fillStyle = '#20222b'; g.fillRect(0, 0, TEX, TEX)
        const r = rng(61)
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const t = 0.72 + r() * 0.4
            g.fillStyle = `rgb(${64 * t | 0},${64 * t | 0},${74 * t | 0})`
            g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14)
            g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * 16 + 1, y * 16 + 12, 14, 3)
        }
        noise(g, 67, 900, ['rgba(0,0,0,0.35)', 'rgba(180,190,210,0.07)', 'rgba(90,110,80,0.06)'])
    }, 10)

    T.ceil = texCanvas((g) => {
        g.fillStyle = '#14151c'; g.fillRect(0, 0, TEX, TEX)
        g.fillStyle = '#1c1e28'; g.fillRect(0, 0, TEX, 8); g.fillRect(0, 56, TEX, 8)
        for (let i = 0; i < 4; i++) { g.fillStyle = '#191b24'; g.fillRect(i * 16 + 2, 10, 12, 44) }
        noise(g, 71, 700, ['rgba(0,0,0,0.5)', 'rgba(160,170,200,0.04)'])
    }, 11)

    const out = {}
    for (const k of Object.keys(T)) out[k] = { src: T[k], shades: shadeTable(T[k]) }
    return out
}

// ------------------------------------------------------------------ assembly

let cache = null

export function buildArt() {
    if (cache) return cache
    const sprites = {}
    for (const [name, make] of Object.entries(SPRITES)) {
        const meta = SPRITE_META[name] || {}
        const variants = {}
        const frames = meta.frames || [null]
        for (const f of frames) {
            const g = f ? make(f) : make()
            variants[f || 'base'] = { w: g.w, h: g.h, p: g.p, shades: shadeTable(g.p, true) }
        }
        sprites[name] = { meta, variants }
    }
    const weapons = {}
    for (const [name, draw] of Object.entries(WEAPON_ART)) {
        const g = grid(80, 56)
        draw(g)
        weapons[name] = { w: g.w, h: g.h, p: g.p }
    }
    const flash = muzzleFlash(30, 28)
    cache = {
        textures: buildTextures(),
        sprites,
        weapons,
        flash: { w: flash.w, h: flash.h, p: flash.p },
    }
    return cache
}

// One-off canvas for sprites that are blitted with drawImage rather than depth
// tested (the first-person weapon, muzzle flash, HUD icons).
export function toCanvas(s) {
    const c = document.createElement('canvas')
    c.width = s.w; c.height = s.h
    const g = c.getContext('2d')
    const img = g.createImageData(s.w, s.h)
    new Uint32Array(img.data.buffer).set(s.p)
    g.putImageData(img, 0, 0)
    return c
}
