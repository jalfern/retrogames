// SMASH TV — every sprite and texture synthesized at runtime (no assets).
// Chunky broadcast-arena pixel art: chrome walls, camera-droids, a crowned
// ANNOUNCER, panicked dot-matrix contestants, glass weapon crates.
// Every enemy runs a four-frame cycle and wears its own 1px outline rim.

import { PLAYER_FRAMES } from './sprite.js'
import { OUTLINE } from './enemies.js'

function sheet(w, h) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    return [c, g]
}
const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h) }

// 1px rim in the kind's outline colour, stamped around every opaque pixel
function rim(c, col) {
    const w = c.width, h = c.height
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, w, h).data
    const mark = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) mark[i] = d[i * 4 + 3] > 0 ? 1 : 0
    const n = parseInt(col.slice(1), 16)
    const [cr, cg, cb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    const rc = document.createElement('canvas')
    rc.width = w; rc.height = h
    const rg = rc.getContext('2d')
    const rd = rg.createImageData(w, h)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x
            if (mark[i]) continue
            if ((x > 0 && mark[i - 1]) || (x < w - 1 && mark[i + 1]) || (y > 0 && mark[i - w]) || (y < h - 1 && mark[i + w])) {
                rd.data[i * 4] = cr; rd.data[i * 4 + 1] = cg; rd.data[i * 4 + 2] = cb; rd.data[i * 4 + 3] = 255
            }
        }
    }
    rg.putImageData(rd, 0, 0)
    g.drawImage(rc, 0, 0)
    return c
}

// walkcam: a rolling camera-droid on spider legs — a four-phase leg gait
// (feet stay planted) with a flickering red lens, chrome outline
function walkcam(f) {
    const [c, g] = sheet(18, 16)
    const L = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 1, 2]][f]
    px(g, 3, 2, 12, 9, '#3b3f52')
    px(g, 3, 2, 12, 2, '#5a6079')
    px(g, 5, 4, 8, 5, '#10141f')
    px(g, 6, 5, 4, 3, f % 2 ? '#ff4f4f' : '#c92020')
    px(g, 11, 5, 2, 2, '#5dc8ff')
    px(g, 2, 11 + L[0], 2, 5 - L[0], '#8d99b5')
    px(g, 8, 11 + L[1], 2, 5 - L[1], '#8d99b5')
    px(g, 14, 11 + L[2], 2, 5 - L[2], '#8d99b5')
    px(g, 1, 14, 3, 2, '#2b2f3d'); px(g, 7, 15, 3, 1, '#2b2f3d'); px(g, 14, 14, 3, 2, '#2b2f3d')
    return rim(c, OUTLINE.walkcam)
}

// runner: a sprinting contestant-hunter — a DARK skull helmet (never the
// contestant's white head), red jersey, four-frame sprint, red outline
function runner(f) {
    const [c, g] = sheet(14, 16)
    px(g, 4, 1, 6, 5, '#20242f')
    px(g, 5, 3, 4, 2, '#10141f')
    px(g, 5, 3, 1, 1, '#ff4f4f'); px(g, 8, 3, 1, 1, '#ff4f4f')
    px(g, 4, 6, 6, 6, '#d43a3a')
    px(g, 4, 6, 6, 1, '#ff7d6d')
    const ARM = [[0, 2], [2, 0], [1, 1], [2, 0]]
    const LEG = [[[0, 1], [1, -1]], [[1, -1], [0, 1]], [[0, 0], [0, 0]], [[1, 0], [0, 0]]]
    const [[lx, ly], [rx, ry]] = LEG[f]
    px(g, 2, 7 + ARM[f][0], 2, 5, '#e8b04f')
    px(g, 10, 12 - ARM[f][1], 2, 5, '#e8b04f')
    px(g, 4 + lx, 12 + ly, 3, 4, '#2b3a5c')
    px(g, 8 - rx, 12 + ry, 3, 4, '#2b3a5c')
    return rim(c, OUTLINE.runner)
}

// turret: a deployed tripod gun — a four-frame dish sweep with a blinking
// sight; while it charges, the renderer adds the tracking barrel + muzzle
// glow on top of this idle body
function turret(f) {
    const [c, g] = sheet(16, 16)
    const DX = [5, 6, 9, 8]
    px(g, 5, 2, 6, 6, '#5a6079')
    px(g, 6, 4, 4, 2, f % 2 ? '#ffd23f' : '#ff8a3f')
    px(g, DX[f], 0, 2, 3, '#8d99b5')
    px(g, 3, 8, 10, 3, '#3b3f52')
    px(g, 2, 11, 2, 5, '#8d99b5')
    px(g, 8, 11, 2, 5, '#8d99b5')
    px(g, 12, 11, 2, 5, '#8d99b5')
    return rim(c, OUTLINE.turret)
}

// thrower: a hunched grenade lobber — the grenade arm winds up through the
// four frames (highest on frame 2), green vest, green outline
function thrower(f) {
    const [c, g] = sheet(16, 16)
    const ARM = [3, 2, 0, 1]
    px(g, 4, 2, 8, 6, '#4a7d3a')
    px(g, 5, 3, 6, 2, '#10141f')
    px(g, 6, 3, 1, 1, '#8fff9f'); px(g, 9, 3, 1, 1, '#8fff9f')
    px(g, 3, 8, 10, 5, '#3a5c2b')
    px(g, 12, ARM[f], 3, 3, '#9aa5bd')
    px(g, 13, ARM[f] - 1, 2, 2, '#ffd23f')
    px(g, 4, 13, 3, 3, '#2b3a1c'); px(g, 9, 13, 3, 3, '#2b3a1c')
    return rim(c, OUTLINE.thrower)
}

// heavy: a walking tank — a four-frame tread roll (body bob 0/1/2/0 plus the
// shoulder-cannon phase), gold outline
function heavy(f) {
    const [c, g] = sheet(20, 18)
    const b = [0, 1, 2, 0][f]
    px(g, 5, 2 + b, 10, 4, '#6b7285')
    px(g, 6, 3 + b, 8, 2, '#10141f')
    px(g, 7, 3 + b, 2, 1, '#ff4f4f'); px(g, 11, 3 + b, 2, 1, '#ff4f4f')
    px(g, 3, 6 + b, 14, 8, '#4a5568')
    px(g, 3, 6 + b, 14, 1, '#8d99b5')
    px(g, 4, 8 + b, 3, 4, '#2b2f3d'); px(g, 13, 8 + b, 3, 4, '#2b2f3d')
    px(g, 1, 5 + (f % 2), 3, 3, '#8d99b5'); px(g, 16, 5 + (1 - f % 2), 3, 3, '#8d99b5')
    px(g, 5, 14, 4, 4, '#20242f'); px(g, 11, 14, 4, 4, '#20242f')
    return rim(c, OUTLINE.heavy)
}

// boss: THE ANNOUNCER — giant crowned monitor head over a chrome torso,
// a four-frame idle (mouth colour and eye heat cycle)
function boss(f) {
    const [c, g] = sheet(40, 34)
    px(g, 8, 0, 24, 4, '#ffd23f')
    px(g, 8, 0, 4, 8, '#ffd23f'); px(g, 18, 0, 4, 6, '#ffd23f'); px(g, 28, 0, 8, 8, '#ffd23f')
    px(g, 6, 6, 28, 18, '#5a6079')
    px(g, 9, 9, 22, 12, '#10141f')
    px(g, 12, 12, 5, 4, f % 2 ? '#ff4f4f' : '#ff8a3f')
    px(g, 23, 12, 5, 4, f % 2 ? '#ff4f4f' : '#ff8a3f')
    px(g, 14, 18, 12, 2, ['#8fb0ff', '#5d7094', '#8fb0ff', '#c8d8ff'][f])
    px(g, 10, 24, 20, 8, '#8d99b5')
    px(g, 10, 24, 20, 1, '#e8eef8')
    px(g, 4, 26, 5, 8, '#4a5568'); px(g, 31, 26, 5, 8, '#4a5568')
    return rim(c, OUTLINE.boss)
}

// civilians: dot-matrix contestants, arms up, two frames
function civ(f, tint) {
    const [c, g] = sheet(10, 14)
    px(g, 3, 1, 4, 4, tint.skin)
    px(g, 4, 2, 2, 1, '#10141f')
    px(g, 3, 5, 4, 5, tint.shirt)
    px(g, 1, f % 2 ? 0 : 2, 2, 3, tint.skin)
    px(g, 7, f % 2 ? 2 : 0, 2, 3, tint.skin)
    px(g, 3, 10, 1, 4, '#2b3a5c'); px(g, 6, 10, 1, 4, '#2b3a5c')
    return c
}

// the contestant: white camera visor, sponsor jersey, pale boots — a 4-frame
// run cycle, boots the lowest layer so the gun layer passes over the feet
function player(f) {
    const [c, g] = sheet(12, 16)
    px(g, 3, 1, 6, 5, '#e8eef8')
    px(g, 4, 3, 4, 2, '#10141f')
    px(g, 4, 3, 1, 1, '#ff4f4f'); px(g, 7, 3, 1, 1, '#ff4f4f')
    px(g, 3, 6, 6, 6, '#e8eef8')
    px(g, 3, 6, 6, 1, '#2b3a5c'); px(g, 3, 6, 1, 6, '#2b3a5c'); px(g, 8, 6, 1, 6, '#2b3a5c')
    px(g, 4, 8, 4, 1, '#d43a3a')
    px(g, 1, 7, 2, 3, '#cfd8ff'); px(g, 9, 7, 2, 3, '#cfd8ff')
    const LEGS = [[[0, 1], [1, -1]], [[0, 0], [0, 0]], [[1, -1], [0, 1]], [[1, 0], [0, 0]]]
    const [[lx, ly], [rx, ry]] = LEGS[f % PLAYER_FRAMES]
    px(g, 3 + lx, 12 + ly, 2, 3, '#cfd8ff')
    px(g, 7 + rx, 12 + ry, 2, 3, '#cfd8ff')
    return c
}

// glass weapon crate with the gun silhouette inside
function crate(weapon, f) {
    const [c, g] = sheet(16, 16)
    px(g, 1, 2, 14, 12, '#1d3a52')
    px(g, 2, 3, 12, 10, 'rgba(93,200,255,0.25)')
    px(g, 1, 2, 14, 1, '#5dc8ff'); px(g, 1, 13, 14, 1, '#2b5a7a')
    px(g, 1, 2, 1, 12, '#5dc8ff'); px(g, 14, 2, 1, 12, '#2b5a7a')
    const cols = { spread: '#ffd23f', laser: '#ff4f4f', gun: '#8fff9f' }
    px(g, 4, 7, 8, 2, cols[weapon] || '#8d99b5')
    px(g, 10, 5, 2, 2, cols[weapon] || '#8d99b5')
    if (f % 2) { px(g, 3, 4, 2, 1, '#e9f7ff'); px(g, 11, 10, 2, 1, '#e9f7ff') }
    return c
}

// weapon icon for the HUD
function icon(weapon) {
    const [c, g] = sheet(12, 8)
    const cols = { twin: '#8d99b5', gun: '#8fff9f', spread: '#ffd23f', laser: '#ff4f4f' }
    px(g, 1, 3, 8, 2, cols[weapon])
    if (weapon === 'twin') { px(g, 2, 1, 6, 1, cols[weapon]); px(g, 2, 6, 6, 1, cols[weapon]) }
    if (weapon === 'spread') { px(g, 9, 0, 2, 1, cols[weapon]); px(g, 9, 7, 2, 1, cols[weapon]) }
    if (weapon === 'laser') { px(g, 9, 3, 3, 2, '#ffb0a0') }
    if (weapon === 'gun') { px(g, 0, 5, 3, 3, '#4a5568') }
    return c
}

export function buildSprites() {
    const SP = {}
    for (const f of [0, 1, 2, 3]) {
        SP[`walkcam${f}`] = walkcam(f)
        SP[`runner${f}`] = runner(f)
        SP[`turret${f}`] = turret(f)
        SP[`thrower${f}`] = thrower(f)
        SP[`heavy${f}`] = heavy(f)
        SP[`boss${f}`] = boss(f)
        if (f < 2) SP[`crate${f}`] = crate('spread', f)
    }
    for (const f of [0, 1, 2, 3]) SP[`player${f}`] = player(f)
    const TINTS = [
        { skin: '#e8b04f', shirt: '#d43a3a' },
        { skin: '#f0c8a0', shirt: '#3a7dd4' },
        { skin: '#c98a5c', shirt: '#5dcc6d' },
    ]
    TINTS.forEach((t, i) => {
        SP[`civ${i}0`] = civ(0, t)
        SP[`civ${i}1`] = civ(1, t)
    })
    for (const w of ['twin', 'gun', 'spread', 'laser']) SP[`icon_${w}`] = icon(w)
    return SP
}

// arena floor: dark broadcast-studio concrete with a grid and seeded grain
export function buildFloor(roomIdx, seed) {
    const [c, g] = sheet(256, 224)
    let v = (seed * 7919 + roomIdx * 104729) | 0
    const rnd = () => { v = (v * 1103515245 + 12345) & 0x7fffffff; return v / 0x7fffffff }
    const tint = ['#15151f', '#161218', '#121519', '#171316'][roomIdx % 4]
    px(g, 0, 0, 256, 224, tint)
    for (let i = 0; i < 900; i++) {
        const x = Math.floor(rnd() * 256), y = Math.floor(rnd() * 224)
        const b = rnd()
        px(g, x, y, 1, 1, b < 0.5 ? '#1d1d29' : b < 0.8 ? '#101018' : '#22222f')
    }
    g.strokeStyle = 'rgba(93,200,255,0.05)'
    for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 224); g.stroke() }
    for (let y = 0; y <= 224; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(256, y + 0.5); g.stroke() }
    // studio center logo: a cracked SMASH diamond
    g.strokeStyle = 'rgba(255,93,93,0.10)'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(128, 70); g.lineTo(170, 112); g.lineTo(128, 154); g.lineTo(86, 112); g.closePath(); g.stroke()
    g.lineWidth = 1
    // crowd band at the very top edge of the arena
    for (let x = 0; x < 256; x += 4) {
        const h = 3 + Math.floor(rnd() * 4)
        px(g, x, 0, 3, h, ['#2b2f3d', '#333a4d', '#242836'][x % 3])
    }
    return c
}
