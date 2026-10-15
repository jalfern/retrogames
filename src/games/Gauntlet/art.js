// GAUNTLET — runtime sprite art. Every monster, item and portrait is a
// pixel string punched into an offscreen canvas at load; no assets.
// Chars map through each sprite's palette; ' ' is transparent.

const SP = {}
function sprite(name, pal, rows) {
    const w = rows[0].length, h = rows.length
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            const col = pal[rows[y][x]]
            if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1) }
        }
    }
    SP[name] = c
    return c
}

export function buildSprites() {
    if (SP.grunt) return SP
    sprite('grunt', { o: '#e0723a', d: '#a24a20', w: '#fff', k: '#1a0b0b', y: '#ffd23f' }, [
        ' dd    dd ',
        'ddddddddddd',
        'dodddddddod',
        'dwwddddwwd ',
        'dwkdddawkd ',
        'ddddddddddd',
        ' ddddddddd ',
        ' oydddddyo ',
        '  dddddd  ',
        '  d k k d ',
        '   k   k  ',
    ])
    sprite('ghost', { b: '#7db4ff', l: '#cfe4ff', k: '#101a33', w: '#fff' }, [
        '   bbbbb   ',
        ' blllllllb ',
        'blwlllllwlb',
        'blkllllklkb',
        'blllllllllb',
        'bllkkkkkllb',
        'blllllllllb',
        'blblblblllb',
        ' l l l l l ',
    ])
    sprite('demon', { r: '#c93030', d: '#7d1414', y: '#ffd23f', k: '#180404', w: '#ffe9a0' }, [
        ' d d   d d ',
        ' ddrrrrrdd ',
        'drrrrrrrrrd',
        'drwyrwyrwrd',
        'drkyrkyrkrd',
        'drrrrrrrrrd',
        ' rrdkkkddr ',
        '  rrrrrrr  ',
        ' rrrrrrrrr ',
        ' rdy r ydr ',
        '  kk   kk  ',
    ])
    sprite('sorcerer', { p: '#7b3fbf', l: '#b487e8', k: '#12081f', y: '#ffd23f', g: '#59d98a' }, [
        '   ppppp   ',
        '  plllllp  ',
        ' ppppppppp ',
        ' pkyppppyp ',
        ' pk pk pk  ',
        '  ppppppp  ',
        ' pppllppll ',
        ' ppppppppp ',
        'ppllgglggpp',
        ' ppppppppp ',
        '  kk   kk  ',
    ])
    sprite('lobber', { g: '#4f9e4f', d: '#2c6b2c', k: '#0e1f0e', w: '#d9ffd9', y: '#ffd23f' }, [
        '   dddd    ',
        ' dggggggd  ',
        'dgwwgggggd ',
        'dgkwgggkgd ',
        'dgggggggggd',
        'dgygggggygd',
        ' dgggggggd ',
        ' dg dd dg  ',
        '  kk   kk  ',
    ])
    sprite('death', { k: '#0c0c12', s: '#e8e8f0', y: '#8fff9f', r: '#5d0f0f' }, [
        '  kkkkkkk  ',
        ' ksssssssk ',
        ' ksysysysk ',
        ' ksssssssk ',
        ' ksksksksk ',
        '  ksssssk  ',
        '  kkkkkkk  ',
        '  ksksksk  ',
        '  k k k k  ',
        '   k k k   ',
    ])
    sprite('food', { m: '#c96a3a', d: '#8a4620', w: '#f2d8b0', b: '#7d3b16' }, [
        ' bbbbb   ',
        'bmmmmmb  ',
        'bmwmmmb  ',
        'bmwwwmb  ',
        'bmmmmbbb ',
        ' bbmbmmmmb',
        '  bmmmmbb ',
        '   bbbb   ',
    ])
    sprite('potion', { r: '#ff4f5d', l: '#ffb0b8', g: '#9adfff', c: '#cfd8ff' }, [
        '  cc  ',
        '  cc  ',
        ' crlc ',
        'crrrc ',
        'crllc ',
        'crrrc ',
        ' crrc ',
        '  cc  ',
    ])
    sprite('gold', { y: '#ffd23f', o: '#c99a1e', k: '#6b4d00' }, [
        ' kkk  ',
        'kyyok ',
        'kyyk  ',
        ' oyok ',
        'oyyyok',
        'koyyok',
        ' kyyk ',
        '  kk  ',
    ])
    sprite('key', { y: '#ffe27a', o: '#b8892b' }, [
        ' yy   ',
        'yoyy  ',
        ' yy   ',
        ' oy   ',
        ' oy   ',
        'oyyy  ',
    ])
    sprite('gen', { r: '#e03a3a', d: '#7d1414', y: '#ffd23f', s: '#8d99b5', k: '#20242c' }, [
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
    ])
    sprite('warrior', { g: '#d8b04a', s: '#cfd8e8', k: '#141a26', r: '#c93030' }, [
        ' sssss ',
        'srrrrrs',
        'sksssk ',
        'sksssk ',
        ' sssss ',
        ' ggsgg ',
        'ggggggg',
        'gg g gg',
    ])
    sprite('valkyrie', { g: '#e8d8a0', s: '#8fd0ff', k: '#14212e', p: '#ff8ab0' }, [
        ' sssss ',
        'sgggggs',
        'sksgks ',
        'sgggggs',
        ' sssss ',
        ' ssppss ',
        'sspppss',
        'ss   ss',
    ])
    sprite('wizard', { p: '#7b3fbf', l: '#b487e8', k: '#12081f', w: '#f0e8ff', y: '#ffd23f' }, [
        '  ppp  ',
        ' ppypp ',
        'ppppppp',
        ' kwwwk ',
        ' pwppw ',
        ' ppppp ',
        'pplplpp',
        'pp   pp',
    ])
    sprite('elf', { g: '#4fae5f', l: '#9fe0a8', k: '#0e1f12', w: '#f0ffe0', y: '#d9b06a' }, [
        ' g   g ',
        ' gg gg ',
        'glwwlg ',
        'gwkwkg ',
        ' gwwwg ',
        ' lllll ',
        'll g ll',
        'll   ll',
    ])
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
