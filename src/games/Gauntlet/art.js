// GAUNTLET — runtime sprite art. Every monster, item and portrait is a
// pixel string punched into an offscreen canvas at load; no assets.
// Chars map through each sprite's palette; ' ' is transparent.
//
// The pixel DATA is the single source of truth (SPRITE_DATA) and is pure JS
// (no canvas), so gauntletcheck can assert the grid rules in plain Node.
// Monsters are at least 14x14 and carry a 2-frame walk wobble: frame 2 is a
// 1px vertical bob of frame 1, which reads as a step at the arcade's 60fps.

const CENTER = (rows, w) => rows.map((r) => {
    const pad = Math.max(0, w - r.length)
    const l = Math.floor(pad / 2)
    return ' '.repeat(l) + r + ' '.repeat(pad - l)
})

const MON = (name, pal, rows) => {
    const w = Math.max(...rows.map((r) => r.length))
    const a = CENTER(rows, w)
    const b = a.slice(1).concat([' '.repeat(w)])
    return { pal, frames: [a, b] }
}

// a hero: a standing frame plus the same 1px-bob walk frame the beasts use
// (issue #302 — the hero was a static overhead sprite). Frame 1 keeps the
// original pixels; frame 2 steps down one row so the walk reads as a step.
const HRC = (pal, rows) => {
    const w = Math.max(...rows.map((r) => r.length))
    const a = rows.map((r) => r.padEnd(w, ' '))
    return { pal, frames: [a, a.slice(1).concat([' '.repeat(w)])] }
}

export const SPRITE_DATA = {
    grunt: MON('grunt', { o: '#e0723a', d: '#a24a20', c: '#5a2410', w: '#ffffff', k: '#1a0b0b', y: '#ffd23f' }, [
        '  .d        d.  ',
        ' ddo        odd ',
        'doddo      odod ',
        'dooddddddddddo d',
        'dooyyooyyoooood',
        'dokkkkkkkkkkkod',
        'doywooyywoyoood',
        'dododododododod',
        ' dogoodgoodood ',
        ' dgggggggggggg ',
        ' dgcggggggcggg ',
        ' ddgcccccccgdd ',
        '  dd  cc  cc  ',
        '  yy   yy   yy  ',
    ]),
    ghost: MON('ghost', { b: '#7db4ff', l: '#cfe4ff', k: '#101a33', w: '#ffffff' }, [
        '   bbbbbbbb    ',
        '  bllllllllb   ',
        ' blwwllllwwlb  ',
        'blklllllllkbl ',
        'blwlllllllwlb ',
        'blllllllllllb ',
        'bllkkkkkkkllb ',
        'blllllllllllb ',
        'blbllbllblllb ',
        ' llllllllllll ',
        ' l l l l l l  ',
        '   l  l  l    ',
        '  l     l     ',
        ' l        l   ',
    ]),
    demon: MON('demon', { r: '#c93030', d: '#7d1414', y: '#ffd23f', k: '#180404', w: '#ffe9a0', n: '#3a0d0d' }, [
        '  r         r   ',
        ' nr       rn  ',
        'nrrrrrrrrrrrn ',
        ' nrrrrrrrrrrn ',
        'rryyrrrrrryyrr',
        'rkywrrrrrwyrk r',
        'rrrrrrrrrrrrrrr',
        'rrrdkkkkkkdrrrr',
        ' rrrrrrrrrrrr  ',
        ' rrdrrrrrrdrr  ',
        '  rrrrrrrrrr   ',
        '  rrnrrrrnrr   ',
        '  rr     rr    ',
        '  kk     kk    ',
    ]),
    sorcerer: MON('sorcerer', { p: '#7b3fbf', l: '#b487e8', k: '#12081f', y: '#ffd23f', g: '#59d98a', s: '#8d99b5' }, [
        '      pppp      ',
        '     pllllp     ',
        '    pllllllp    ',
        '   pppppppppp   ',
        '   pkyppppykp   ',
        '   pppppppppp   ',
        '   pkspkp spkp  ',
        '   pppppppppp   ',
        '  pppllllllpp   ',
        ' pplllgggglllp  ',
        'ppllgggggggllpp ',
        ' ppppppppppppp  ',
        '  kkkk    kkkk  ',
        '  kkkk    kkkk  ',
    ]),
    lobber: MON('lobber', { g: '#4f9e4f', d: '#2c6b2c', k: '#0e1f0e', w: '#d9ffd9', y: '#ffd23f' }, [
        '    ddddd       ',
        '   dgggggg      ',
        '  dgwwggggg     ',
        ' dgkwgggggg     ',
        ' dgggggggggg    ',
        ' dgygggggggy    ',
        '  dggggggggg    ',
        '  dgdddddddg  g ',
        '   dggggggdg ggg',
        '    dggggg ggggg',
        '   kk  kk kkkkk ',
        '   kk  kk kkkkk ',
        '  kkk kkk kkkkk ',
        '  kkk kkk       ',
    ]),
    death: MON('death', { k: '#0c0c12', s: '#e8e8f0', y: '#8fff9f', r: '#5d0f0f', g: '#9fb2c8' }, [
        '      g         ',
        '     g  g      ',
        '    g    g     ',
        '   g    g      ',
        '  kkkk  g      ',
        ' kssssk g      ',
        'ksyyyskk g     ',
        'ksyssysk g     ',
        ' ksssskk g     ',
        '  kkkkkk g     ',
        '  kskskk g     ',
        '  k k k g      ',
        '   k  k  g     ',
        '    kk   gg    ',
    ]),
    food: { pal: { m: '#c96a3a', d: '#8a4620', w: '#f2d8b0', b: '#7d3b16' }, frames: [[
        ' bbbbb   ',
        'bmmmmmb  ',
        'bmwmmmb  ',
        'bmwwwmb  ',
        'bmmmmbbb ',
        ' bbmbmmmmb',
        '  bmmmmbb ',
        '   bbbb   ',
    ]] },
    potion: { pal: { r: '#ff4f5d', l: '#ffb0b8', g: '#9adfff', c: '#cfd8ff' }, frames: [[
        '  cc  ',
        '  cc  ',
        ' crlc ',
        'crrrc ',
        'crllc ',
        'crrrc ',
        ' crrc ',
        '  cc  ',
    ]] },
    gold: { pal: { y: '#ffd23f', o: '#c99a1e', k: '#6b4d00' }, frames: [[
        ' kkk  ',
        'kyyok ',
        'kyyk  ',
        ' oyok ',
        'oyyyok',
        'koyyok',
        ' kyyk ',
        '  kk  ',
    ]] },
    key: { pal: { y: '#ffe27a', o: '#b8892b' }, frames: [[
        ' yy   ',
        'yoyy  ',
        ' yy   ',
        ' oy   ',
        ' oy   ',
        'oyyy  ',
    ]] },
    gen: { pal: { r: '#e03a3a', d: '#7d1414', y: '#ffd23f', s: '#8d99b5', k: '#20242c' }, frames: [[
        '  yyyy  ',
        ' ryryyr ',
        'yrrrrry ',
        'yrrdrry ',
        'yrdrrdy ',
        'yrrdrry ',
        ' ryryyr ',
        '  yyyy  ',
        ' sskss  ',
        'sk kk s ',
    ]] },
    warrior: HRC({ g: '#d8b04a', s: '#cfd8e8', k: '#141a26', r: '#c93030' }, [
        ' sssss ',
        'srrrrrs',
        'sksssk ',
        'sksssk ',
        ' sssss ',
        ' ggsgg ',
        'ggggggg',
        'gg g gg',
    ]),
    valkyrie: HRC({ g: '#e8d8a0', s: '#8fd0ff', k: '#14212e', p: '#ff8ab0' }, [
        ' sssss ',
        'sgggggs',
        'sksgks ',
        'sgggggs',
        ' sssss ',
        ' ssppss ',
        'sspppss',
        'ss   ss',
    ]),
    wizard: HRC({ p: '#7b3fbf', l: '#b487e8', k: '#12081f', w: '#f0e8ff', y: '#ffd23f' }, [
        '  ppp  ',
        ' ppypp ',
        'ppppppp',
        ' kwwwk ',
        ' pwppw ',
        ' ppppp ',
        'pplplpp',
        'pp   pp',
    ]),
    elf: HRC({ g: '#4fae5f', l: '#9fe0a8', k: '#0e1f12', w: '#f0ffe0', y: '#d9b06a' }, [
        ' g   g ',
        ' gg gg ',
        'glwwlg ',
        'gwkwkg ',
        ' gwwwg ',
        ' lllll ',
        'll g ll',
        'll   ll',
    ]),
}

const SP = {}
function punch(pal, rows, white = false) {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            const ch = rows[y][x]
            if (ch === ' ') continue
            const col = white ? '#ffffff' : pal[ch]
            if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1) }
        }
    }
    return c
}

export function buildSprites() {
    if (SP.grunt) return SP
    SP.__flash = {}
    for (const name of Object.keys(SPRITE_DATA)) {
        const { pal, frames } = SPRITE_DATA[name]
        SP[name] = frames.map((rows) => punch(pal, rows))
        // a white silhouette per frame: the hero's hit-flash overlay (issue #302)
        SP.__flash[name] = frames.map((rows) => punch(pal, rows, true))
    }
    return SP
}

export function getSprites() {
    return SP
}

// palette per level material (wall base, shade, mortar, cap)
export const MATERIALS = {
    red: { base: '#8f2f28', lite: '#c25a4a', dark: '#571a16', mortar: '#2e0d0b', accent: '#ffd23f' },
    green: { base: '#2f6b34', lite: '#5da262', dark: '#17391b', mortar: '#0b1e0d', accent: '#8fff9f' },
    blue: { base: '#2f4a8f', lite: '#5a7ac2', dark: '#16274f', mortar: '#0b1226', accent: '#8fb0ff' },
    purple: { base: '#6b2f8f', lite: '#9c5ac2', dark: '#37174f', mortar: '#180b26', accent: '#e08fff' },
}
