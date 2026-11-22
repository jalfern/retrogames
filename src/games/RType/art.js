// art.js — R-TYPE S1+S2 look, designed from the 1987 Irem M-72 cabinet:
// deep indigo space under three parallax star layers, a chunky white-blue-red
// R-7C with a living engine flame, sickly green Bydo flesh, rust-armoured
// hull plates, the Phase-1 bio-ship whose maw glows when it gapes — and the
// S.E.E.D. force pod: a rotating cyan energy ball with a blue capsule seed.
// Everything generated in code; nothing borrowed. 320x224, no smoothing.

import { W, H, FIELD_TOP, FIELD_BOT, POD, CORE_Y, DOBK } from './sim.js'

// ------------------------------------------------------------ pixel font ---
// 5x7 arcade-cube glyphs cut for this cabinet (rows: '#' = ink).
const G = {
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
    '1': '..#..|.##..|..#..|..#..|..#..|#.#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
    '3': '####.|....#|....#|.###.|....#|#...#|.###.',
    '4': '..#..|..##.|.#.#.|#..#.|#####|...#.|...#.',
    '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
    '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    '9': '.###.|#...#|#...#|.####|....#|...#|.##..',
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
    B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####',
    F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
    H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
    L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
    N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
    R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.',
    T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
    X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
    Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    ' ': '.....|.....|.....|.....|.....|.....|.....',
    '-': '.....|.....|.....|.###.|.....|.....|.....',
    '!': '..#..|..#..|..#..|..#..|.....|..#..|.....',
    ':': '.....|..#..|.....|.....|.....|..#..|.....',
    '.': '.....|.....|.....|.....|.....|.##..|.##..',
    '/': '....#|...#.|..#..|..#..|.#...|#....|#....',
    '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
}

// 2 px letter-gap: 5-wide glyphs at a 7px advance sit a hair looser and read
// far better scaled up on phone screens (#2818: the cube font was a touch tight)
export function textWidth(s, sc = 1) { return s.length * 7 * sc - sc }

export function drawText(ctx, s, x, y, color, sc = 1) {
    ctx.fillStyle = color
    for (let i = 0; i < s.length; i++) {
        const g = G[s[i]] || G[' ']
        const rows = g.split('|')
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 5; c++) {
                if (rows[r][c] === '#') ctx.fillRect(x + i * 7 * sc + c * sc, y + r * sc, sc, sc)
            }
        }
    }
}

// ------------------------------------------------------------ sprites -----
function makeSpr(w, h, paint) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    paint(g)
    return c
}

const has = typeof document !== 'undefined'
const SPR = has ? {
    ship: [0, 1].map((f) => makeSpr(26, 16, (g) => {
        // swept wings
        g.fillStyle = '#5f7bb8'
        g.fillRect(6, 9, 12, 5); g.fillRect(9, 11, 14, 3)
        g.fillStyle = '#41568a'
        g.fillRect(6, 13, 10, 2)
        // fuselage: white-blue top, blue belly
        g.fillStyle = '#9db8e8'
        g.fillRect(2, 6, 22, 3)
        g.fillStyle = '#e8f0ff'
        g.fillRect(3, 4, 18, 2); g.fillRect(6, 3, 12, 1)
        g.fillStyle = '#5f7bb8'
        g.fillRect(2, 9, 20, 2)
        // nose + cockpit
        g.fillStyle = '#e03030'
        g.fillRect(22, 5, 3, 4)
        g.fillStyle = '#37d0ff'
        g.fillRect(14, 5, 4, 2)
        // engine block + flame
        g.fillStyle = '#2c3a5e'
        g.fillRect(0, 5, 4, 6)
        g.fillStyle = f ? '#ffd23c' : '#ff9a2a'
        g.fillRect(f ? -4 : -2, 7, f ? 4 : 2, 2)
        g.fillStyle = '#ff5a1e'
        g.fillRect(f ? -6 : -3, 7, 2, 2)
    })),
    larva: [0, 1].map((f) => makeSpr(14, 10, (g) => {
        g.fillStyle = '#6f9a26'
        g.fillRect(1, 2, 12, 6)
        g.fillStyle = '#9ac93c'
        g.fillRect(0, 3, 6, 4)
        g.fillRect(2, 1, 8, 2)
        g.fillStyle = '#37501c'
        g.fillRect(4 + (f ? 1 : 0), 3, 2, 4)
        g.fillRect(8 + (f ? 0 : 1), 3, 2, 4)
        g.fillStyle = '#ff5a2a' // eye, facing travel (left)
        g.fillRect(0, 4, 2, 2)
    })),
    pod: [0, 1].map((f) => makeSpr(16, 12, (g) => {
        g.fillStyle = '#7a3c96'
        g.fillRect(2, 1, 12, 10)
        g.fillStyle = '#b46ad0'
        g.fillRect(3, 2, 8, 6); g.fillRect(5, 1, 6, 2)
        g.fillStyle = '#e090ff'
        g.fillRect(f ? 6 : 8, 3, 2, 2)
        g.fillStyle = '#2c1436' // nozzle faces left
        g.fillRect(0, 4, 3, 4)
    })),
    missile: [0, 1].map((f) => makeSpr(12, 6, (g) => {
        g.fillStyle = '#e8e8f0'
        g.fillRect(3, 2, 8, 2)
        g.fillStyle = '#d02020'
        g.fillRect(0, 1, 3, 4); g.fillRect(9, 0, 2, 2); g.fillRect(9, 4, 2, 2)
        g.fillStyle = f ? '#ffd23c' : '#ff9a2a'
        g.fillRect(11, 2, f ? 2 : 1, 2)
    })),
    bullet: makeSpr(4, 4, (g) => {
        g.fillStyle = '#37d0ff'
        g.fillRect(0, 1, 4, 2); g.fillRect(1, 0, 2, 4)
        g.fillStyle = '#eaffff'
        g.fillRect(1, 1, 2, 2)
    }),
    cap: [0, 1].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#a04a00'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#ff9a1e'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#ffd23c'
        g.fillRect(f ? 4 : 6, 3, 4, 4)
        g.fillStyle = '#fff4c0'
        g.fillRect(f ? 5 : 7, 4, 2, 2)
    })),
    // S.E.E.D. force capsule: blue where the weapon capsule is orange,
    // with a white spark mark instead of the amber core
    fcap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#0e3c78'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#2e7ad0'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#8ae0ff'
        g.fillRect(3 + (f === 1 ? 2 : 0), 3, 4, 4)
        g.fillStyle = '#eaffff'
        g.fillRect(4 + (f === 1 ? 2 : 0), 4, 2, 2)
        g.fillStyle = '#08284e' // capsule seam
        g.fillRect(7, 1, 2, 8)
    })),
    // BIT capsule (S3): the green drone-case — same silhouette, moss palette,
    // a white crystal shard stamped on it
    bcap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#1c4a10'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#3e8c1e'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#7ad64a'
        g.fillRect(3 + (f === 2 ? 2 : 0), 3, 4, 4)
        g.fillStyle = '#e8ffe0'
        g.fillRect(4 + (f === 2 ? 2 : 0), 4, 2, 2)
        g.fillStyle = '#0e2c08' // capsule seam
        g.fillRect(7, 1, 2, 8)
    })),
    // #2915 DOUBLE pod: the arcade's red D-case — same silhouette, crimson
    // shell, a white twin-stamp marking (the paired stream it grants)
    dcap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#6e1010'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#c83228'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#ffd0c8'
        g.fillRect(4 + (f === 1 ? 2 : 0), 3, 2, 4) // twin rounds, stacked
        g.fillRect(7 + (f === 1 ? 2 : 0), 3, 2, 4)
        g.fillStyle = '#4a0808' // capsule seam
        g.fillRect(10, 1, 2, 8)
    })),
    // #2915 SPEED UP pod: violet case with an arrow chevron walking forward
    scap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#3c1070'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#7840d8'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#e4ccff'
        for (let i = 0; i < 3; i++) g.fillRect(4 + i * 2 + (f === 2 ? 2 : 0), 3 + Math.abs(i - 1), 2, 2) // chevron >
        g.fillStyle = '#260848' // capsule seam
        g.fillRect(7, 1, 2, 8)
    })),
    // #2919 OPTIONS pod: the arcade's O-case — bullion shell, white ring
    // stamp walking its shimmer (the pair of orbs it summons)
    ocap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#6e4a10'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#c89228'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#fff0c8' // hollow O stamp
        const ox = 4 + (f === 1 ? 1 : 0)
        g.fillRect(ox, 3, 4, 1); g.fillRect(ox, 6, 4, 1)
        g.fillRect(ox, 3, 1, 4); g.fillRect(ox + 3, 3, 1, 4)
        g.fillStyle = '#4a3008' // capsule seam
        g.fillRect(10, 1, 2, 8)
    })),
    // #2922 HALF pod: the arcade's H-case — cold teal shell (the pod that
    // cools your guns), a white down-chevron stamp walking its shimmer
    hcap: [0, 1, 2].map((f) => makeSpr(16, 10, (g) => {
        g.fillStyle = '#0f4a44'
        g.fillRect(1, 1, 14, 8)
        g.fillStyle = '#1e8c7e'
        g.fillRect(2, 2, 12, 6)
        g.fillStyle = '#d8fff4' // ▼ stamp — the arm falls one step
        const ox = 4 + (f === 1 ? 1 : 0)
        g.fillRect(ox, 3, 4, 1)
        g.fillRect(ox + 1, 4, 2, 1)
        g.fillRect(ox + 1.5 | 0, 5, 1, 1)
        g.fillStyle = '#083028' // capsule seam
        g.fillRect(10, 1, 2, 8)
    })),
    // #2919 the option orb: a golden sphere with a rotating specular facet
    // (the seed's rotation discipline, in the arcade's bullion palette)
    opt: [0, 1, 2, 3].map((f) => makeSpr(8, 8, (g) => {
        g.fillStyle = '#8a5a10'
        g.fillRect(2, 0, 4, 8); g.fillRect(1, 1, 6, 6); g.fillRect(0, 2, 8, 4)
        g.fillStyle = '#d89a28'
        g.fillRect(2, 1, 4, 6); g.fillRect(1, 2, 6, 4)
        g.fillStyle = '#ffd870'
        const fx = 1 + (f % 3), fy = 1 + ((f + 1) % 3)
        g.fillRect(fx, fy, 3, 3)
        g.fillStyle = '#fff2c0'
        g.fillRect(fx + 1, fy + 1, 1, 1)
    })),
    // the bit drone (S3): a green crystal chip with a spinning facet
    bit: [0, 1, 2, 3].map((f) => makeSpr(10, 10, (g) => {
        g.fillStyle = '#1e5c14'
        g.fillRect(3, 0, 4, 10); g.fillRect(1, 2, 8, 6); g.fillRect(0, 3, 10, 4)
        g.fillStyle = '#46a02a'
        g.fillRect(3, 1, 4, 8); g.fillRect(2, 2, 6, 6)
        g.fillStyle = '#7ad64a'
        const fx = 2 + (f % 3), fy = 2 + ((f + 1) % 3)
        g.fillRect(fx, fy, 3, 3)
        g.fillStyle = '#e8ffe0'
        g.fillRect(fx + 1, fy + 1, 1, 1)
    })),
    // the force pod itself: an energy ball with a dark band rotating around it
    seed: [0, 1, 2, 3].map((f) => makeSpr(12, 12, (g) => {
        g.fillStyle = '#0e4a86'
        g.fillRect(2, 1, 8, 10); g.fillRect(1, 2, 10, 8); g.fillRect(0, 3, 12, 6)
        g.fillStyle = '#2e8ad8'
        g.fillRect(2, 2, 8, 8)
        g.fillStyle = '#8ae0ff'
        g.fillRect(3, 3, 6, 6)
        g.fillStyle = '#eaffff'
        g.fillRect(4, 3, 3, 2)
        g.fillStyle = '#083c6e' // equatorial band, walking down the ball to sell the spin
        const bandY = 5 + (f % 3)
        g.fillRect(1, bandY, 10, 1)
        g.fillRect(0, bandY + 1, 12, 1)
    })),
    shipIcon: makeSpr(13, 8, (g) => {
        g.fillStyle = '#e8f0ff'
        g.fillRect(1, 3, 9, 2)
        g.fillStyle = '#5f7bb8'
        g.fillRect(4, 5, 6, 2)
        g.fillStyle = '#e03030'
        g.fillRect(10, 3, 2, 2)
    }),
    // seat two (S4): the 2P livery in the arcade two-player tradition — the
    // wing flips seat one's white/red scheme: deep blue hull, steel wings,
    // cyan nose-tip, amber cockpit, cool-blue exhaust
    wingShip: [0, 1].map((f) => makeSpr(26, 16, (g) => {
        g.fillStyle = '#2e5aa8'
        g.fillRect(6, 9, 12, 5); g.fillRect(9, 11, 14, 3)
        g.fillStyle = '#1e3e78'
        g.fillRect(6, 13, 10, 2)
        g.fillStyle = '#6fa8e8'
        g.fillRect(2, 6, 22, 3)
        g.fillStyle = '#c8e4ff'
        g.fillRect(3, 4, 18, 2); g.fillRect(6, 3, 12, 1)
        g.fillStyle = '#2e5aa8'
        g.fillRect(2, 9, 20, 2)
        g.fillStyle = '#37d0ff'
        g.fillRect(22, 5, 3, 4)
        g.fillStyle = '#ffd23c'
        g.fillRect(14, 5, 4, 2)
        g.fillStyle = '#16294e'
        g.fillRect(0, 5, 4, 6)
        g.fillStyle = f ? '#8ae0ff' : '#4aa8e0'
        g.fillRect(f ? -4 : -2, 7, f ? 4 : 2, 2)
        g.fillStyle = '#2e8ad8'
        g.fillRect(f ? -6 : -3, 7, 2, 2)
    })),
    shipIconP2: makeSpr(13, 8, (g) => {
        g.fillStyle = '#c8e4ff'
        g.fillRect(1, 3, 9, 2)
        g.fillStyle = '#2e5aa8'
        g.fillRect(4, 5, 6, 2)
        g.fillStyle = '#37d0ff'
        g.fillRect(10, 3, 2, 2)
    }),
} : {}

// ----------------------------------------------------------- background ----
function mulberry(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const STARS = (() => {
    const r = mulberry(0xade17)
    const layers = []
    for (let l = 0; l < 3; l++) {
        const arr = []
        for (let i = 0; i < 26 + l * 14; i++) arr.push({ x: r() * W, y: 20 + r() * (H - 24), b: r() })
        layers.push(arr)
    }
    return layers
})()

export function drawBackground(ctx, camX, tick) {
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#04040f')
    grad.addColorStop(0.55, '#0a0a24')
    grad.addColorStop(1, '#101034')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    // slow nebula bloomed behind the field
    const nx = ((-camX * 0.12) % (W * 2))
    const neb = ctx.createRadialGradient(nx + 230, 150, 10, nx + 230, 150, 130)
    neb.addColorStop(0, 'rgba(64,28,110,0.30)')
    neb.addColorStop(1, 'rgba(64,28,110,0)')
    ctx.fillStyle = neb
    ctx.fillRect(0, 0, W, H)
    const neb2 = ctx.createRadialGradient(((nx + 640) % (W * 2)) - 220, 70, 6, ((nx + 640) % (W * 2)) - 220, 70, 90)
    neb2.addColorStop(0, 'rgba(20,90,120,0.22)')
    neb2.addColorStop(1, 'rgba(20,90,120,0)')
    ctx.fillStyle = neb2
    ctx.fillRect(0, 0, W, H)
    // three parallax star layers
    const F = [0.18, 0.42, 0.75]
    for (let l = 0; l < 3; l++) {
        for (const st of STARS[l]) {
            const sx = ((st.x - camX * F[l] - tick * 0.02 * (l + 1)) % W + W) % W
            const tw = st.b > 0.85 && ((tick >> 3) + (st.x | 0)) % 7 === 0 ? 1 : 0
            ctx.fillStyle = l === 2 ? (tw ? '#ffffff' : '#c8d8e8') : l === 1 ? '#7088a8' : '#3c4c68'
            ctx.fillRect(sx | 0, st.y | 0, l === 2 ? 2 : 1, l === 2 ? (tw ? 2 : 1) : 1)
        }
    }
    // playfield boundary hairlines (cabinet framing)
    ctx.fillStyle = '#1c2440'
    ctx.fillRect(0, FIELD_TOP - 2, W, 1)
    ctx.fillRect(0, FIELD_BOT + 2, W, 1)
}

// --------------------------------------------------------------- pieces ----
export function drawShip(ctx, ship, camX) {
    if (ship.dead) return
    // mercy state reads as a SHIELD, not as a missing ship (#2818: full-invisible
    // flicker frames over a bright starfield looked like a dropped sprite)
    const ghost = ship.inv > 0 && (ship.inv >> 2) % 2 === 0
    if (ghost) ctx.globalAlpha = 0.38
    const f = (ship.anim >> 2) % 2
    const sx = Math.round(ship.x - camX) - 13, sy = Math.round(ship.y) - 8
    ctx.drawImage(SPR.ship[f], sx, sy)
    if (ghost) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(55,208,255,0.55)'
        ctx.lineWidth = 1
        ctx.strokeRect(sx - 1.5, sy - 1.5, 29, 19)
    }
}

// seat two (S4): same silhouette in the 2P blue livery; a human at the seat
// gets a thin cyan halo so the takeover reads at a glance
export function drawShipWing(ctx, w, camX) {
    if (!w || w.dead || w.out) return
    const ghost = w.inv > 0 && (w.inv >> 2) % 2 === 0
    if (ghost) ctx.globalAlpha = 0.38
    const f = (w.anim >> 2) % 2
    const sx = Math.round(w.x - camX) - 13, sy = Math.round(w.y) - 8
    ctx.drawImage(SPR.wingShip[f], sx, sy)
    if (ghost) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(55,208,255,0.55)'
        ctx.lineWidth = 1
        ctx.strokeRect(sx - 1.5, sy - 1.5, 29, 19)
    }
    if (w.human) {
        ctx.strokeStyle = 'rgba(138,224,255,0.35)'
        ctx.lineWidth = 1
        ctx.strokeRect(sx - 3.5, sy - 3.5, 33, 23)
    }
}

export function drawLarva(ctx, e, camX) {
    ctx.drawImage(SPR.larva[(e.anim >> 2) % 2], Math.round(e.x - camX) - 7, Math.round(e.y) - 5)
}

export function drawTurret(ctx, e, camX) {
    const x = Math.round(e.x - camX), y = Math.round(e.y)
    ctx.fillStyle = '#5a606c'
    ctx.fillRect(x - 7, y - 3, 14, 7)
    ctx.fillStyle = '#b8bec9'
    ctx.fillRect(x - 5, y - 6, 10, 4)
    ctx.fillStyle = '#8a929e'
    ctx.fillRect(x - 3, y - 8, 6, 2)
    // barrel tracks the ship
    const a = e.aim || Math.PI
    ctx.strokeStyle = '#d8dee8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 3)
    ctx.lineTo(x + Math.cos(a) * 8, y - 3 + Math.sin(a) * 8)
    ctx.stroke()
    if (e.anim < 5) { ctx.fillStyle = '#ffd23c'; ctx.fillRect(x + Math.cos(a) * 8 - 1, y - 3 + Math.sin(a) * 8 - 1, 3, 3) }
    ctx.fillStyle = '#37d0ff'
    ctx.fillRect(x - 1, y - 5, 2, 2)
}

export function drawPod(ctx, e, camX) {
    ctx.drawImage(SPR.pod[(e.anim >> 3) % 2], Math.round(e.x - camX) - 8, Math.round(e.y) - 6)
}

// #2835 bit carrier: an armoured ferry with a lit cargo bay — the bits glow
// behind the ribs, so the payload reads before the shot that frees it.
export function drawBitPod(ctx, e, camX) {
    const x = Math.round(e.x - camX), y = Math.round(e.y)
    ctx.fillStyle = '#20263c'
    ctx.fillRect(x - 13, y - 9, 26, 18)
    ctx.fillStyle = '#46506c'
    ctx.fillRect(x - 11, y - 7, 22, 14)
    ctx.fillStyle = '#5e6c8e'
    ctx.fillRect(x - 13, y - 9, 26, 2)
    ctx.fillRect(x - 13, y + 7, 26, 2)
    ctx.fillStyle = '#0c1018'
    ctx.fillRect(x - 8, y - 4, 16, 8) // cargo bay
    for (let i = 0; i < e.n; i++) {
        ctx.fillStyle = ((e.anim >> 3) % 2) ? '#c9ff5c' : '#9ac93c'
        ctx.fillRect(x - 6 + i * 5, y - 2, 4, 4)
    }
    ctx.fillStyle = '#7c8ab0'
    ctx.fillRect(x - 12, y - 3, 2, 2) // jaw rivets
    ctx.fillRect(x - 12, y + 1, 2, 2)
}

export function drawMissile(ctx, m, camX) {
    const x = Math.round(m.x - camX), y = Math.round(m.y)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(m.a)
    ctx.drawImage(SPR.missile[(m.t >> 2) % 2], -6, -3)
    ctx.restore()
}

export function drawBullet(ctx, b, camX) {
    ctx.drawImage(SPR.bullet, Math.round(b.x - camX) - 2, Math.round(b.y) - 2)
}

export function drawCap(ctx, c, camX) {
    const set = c.type === 'force' ? SPR.fcap : c.type === 'bit' ? SPR.bcap
        : c.type === 'double' ? SPR.dcap : c.type === 'speed' ? SPR.scap
            : c.type === 'options' ? SPR.ocap : c.type === 'half' ? SPR.hcap : SPR.cap
    const f = Math.floor(Date.now() / 250) % set.length
    ctx.drawImage(set[f], Math.round(c.x - camX) - 8, Math.round(c.y) - 5)
}

// the force pod (S.E.E.D.): a live energy ball, brighter at the nose than parked
export function drawSeedPod(ctx, pod, camX, shipAlive) {
    const x = Math.round(pod.x - camX), y = Math.round(pod.y)
    const f = Math.floor(Date.now() / 90) % 4
    if (shipAlive) { ctx.fillStyle = 'rgba(138,224,255,0.22)'; ctx.fillRect(x - 7, y - 7, 14, 14) } // halo while it plugs fire
    ctx.drawImage(SPR.seed[f], x - 6, y - 6)
}

// #2919 option orb: home on its mount it keeps a quiet gold halo; on the
// fly-in it trails exhaust, so the arrival reads across the screen before
// the mount dings. px/py are sim-written — draw and fire never disagree.
export function drawOption(ctx, o, camX) {
    const x = Math.round(o.px - camX), y = Math.round(o.py)
    if (o.burn) {
        // #2924 the thrown drone: exhaust STREAMS off its back (left), the
        // mirror image of the inbound plume — a comet outbound
        ctx.fillStyle = 'rgba(255,216,112,0.4)'
        ctx.fillRect(x - 10, y - 1, 6, 2)
        ctx.fillStyle = 'rgba(255,216,112,0.18)'
        ctx.fillRect(x - 16, y - 1, 4, 2)
    } else if (o.docked) {
        ctx.fillStyle = 'rgba(255,216,112,0.14)'
        ctx.fillRect(x - 5, y - 5, 10, 10)
    } else {
        ctx.fillStyle = 'rgba(255,216,112,0.35)'
        ctx.fillRect(x + 4, y - 1, 6, 2)
        ctx.fillStyle = 'rgba(255,216,112,0.16)'
        ctx.fillRect(x + 10, y - 1, 4, 2)
    }
    ctx.drawImage(SPR.opt[Math.floor(Date.now() / 90) % 4], x - 4, y - 4)
}

// #2823: the S.E.E.D. force reads as a PAIR — a faint 1-px energy thread
// keeps shell and ship visually connected while the pod is out. Skipped when
// attached (the shell rides the nose) and while the pilot is down.
export function drawPodTether(ctx, pod, ship, camX, tick) {
    if (!ship || ship.dead || pod.state === 'attached') return
    const px = Math.round(pod.x - camX) + 0.5, py = Math.round(pod.y) + 0.5
    const sx = Math.round(ship.x - camX) + 12 + 0.5, sy = Math.round(ship.y) + 0.5
    const mx = Math.round((px + sx) / 2) + 0.5
    const my = Math.round((py + sy) / 2 + Math.sin(tick * 0.35) * 2.2) + 0.5
    ctx.strokeStyle = 'rgba(138,224,255,0.40)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(mx, my, px, py)
    ctx.stroke()
}

// #2823: capture ceremony — the arcade flashes the pod into existence over
// the ship. k counts down from ~14: a white-hot seed and an expanding ring.
export function drawForceMerge(ctx, x, y, k) {
    const a = k / 14
    const r = Math.round(16 * (1 - a)) + 3
    ctx.strokeStyle = `rgba(138,224,255,${(a * 0.8).toFixed(2)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2)
    ctx.stroke()
    if (k > 8) { ctx.fillStyle = '#eaffff'; ctx.fillRect(x - 2, y - 2, 5, 5) }
    if (k > 11) { ctx.fillStyle = 'rgba(234,255,255,0.5)'; ctx.fillRect(x - 5, y - 1, 11, 2); ctx.fillRect(x - 1, y - 5, 2, 11) }
}

// charge-and-release laser lance: length AND heat scale with the charge tier
// (#2823: the cabinet's beam thickens as it drinks — tier 0 a needle, tier 2
// a bar, with a brighter core and hot side-glow so tiers read at a glance)
export function drawLance(ctx, q, camX) {
    const x = Math.round(q.x - camX), y = Math.round(q.y)
    const len = POD.laserTiers[q.size]
    // #2831: bits riding the chain widen the lance (+1px half-height each,
    // cap 4) — the same spread the hit boxes use, drawn where it bites
    const hh = [2, 3, 4][q.size] + Math.min(4, q.wy ?? 0)
    const ch = [1, 1, 2][q.size] // core half-height
    if (q.size > 0) {
        ctx.fillStyle = q.size === 2 ? 'rgba(255,42,90,0.30)' : 'rgba(255,90,60,0.22)'
        ctx.fillRect(x, y - hh - 1, len, 1)
        ctx.fillRect(x, y + hh, len, 1)
    }
    ctx.fillStyle = q.size === 2 ? '#ff2a5a' : q.size === 1 ? '#ff5a3c' : '#ffb03c'
    ctx.fillRect(x, y - hh, len, hh * 2)
    ctx.fillStyle = q.size === 2 ? '#ffd0e0' : q.size === 1 ? '#ffe0c8' : '#fff0c0'
    ctx.fillRect(x, y - ch, len, ch * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x + len - 4, y - hh, 4, hh * 2)
}

export function drawWave(ctx, q, camX) {
    const x = Math.round(q.x - camX), y = Math.round(q.y)
    // #2831: bits broaden the crescent (+2px half-height each) — the sweep
    // the collision law grants is the sweep the player sees
    const hh = [9, 14, 20][q.size] + (q.hx ?? 0) * 2
    const cols = ['#eaffff', '#8ae8ff', '#37b8e8']
    for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = cols[i]
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let dy = -hh; dy <= hh; dy += 2) {
            const bulge = 6 + q.size * 2 - Math.abs(dy) * (0.14 + q.size * 0.03)
            ctx.lineTo(x + (i - 1) * 2 - bulge + 4, y + dy)
        }
        ctx.stroke()
    }
}

// armour hull-segment: riveted plates with a lit open-side edge
export function drawSeg(ctx, e, camX) {
    const x = Math.round(e.x - camX)
    ctx.fillStyle = '#4a3c2c'
    ctx.fillRect(x, e.y0, e.len, e.y1 - e.y0)
    ctx.fillStyle = '#6a5a48'
    for (let px = 0; px < e.len - 6; px += 16) {
        ctx.fillRect(x + px + 2, e.y0 + 2, 12, Math.max(4, e.y1 - e.y0 - 4))
    }
    ctx.fillStyle = '#8a7a64'
    for (let px = 6; px < e.len; px += 16) {
        for (let py = e.y0 + 4; py < e.y1 - 2; py += 10) ctx.fillRect(x + px, py, 2, 2)
    }
    ctx.fillStyle = '#2c2418'
    ctx.fillRect(x - 2, e.y0, 2, e.y1 - e.y0)
    ctx.fillRect(x + e.len, e.y0, 2, e.y1 - e.y0)
    // lit edge facing the lane
    ctx.fillStyle = '#c8a050'
    if ((e.y0 + e.y1) / 2 < 120) ctx.fillRect(x, e.y1 - 1, e.len, 1)
    else ctx.fillRect(x, e.y0, e.len, 1)
}

// the Phase-1 bio-ship: plated dread mass with eyes and the maw
export function drawP1(ctx, p1, camX, tick) {
    // death roll (#2818): a stricken hull lurches, shudders and lists over
    const dying = p1.dyingT > 0
    const k = dying ? 170 - p1.dyingT : 0
    // #2901 desperation phase: a hot hull burns — the whole mass jitters an
    // impatient pixel, the plating flushes ember, and the maw rim glows hot.
    const hot = !!p1.hot && !dying
    ctx.save()
    if (dying) {
        const cx = Math.round(p1.x - camX) + 60, cy = 120
        ctx.translate(cx, cy)
        ctx.rotate(k * 0.0011)
        ctx.translate(-cx + (((tick * 13) % 3) - 1), -cy + (((tick * 7) % 3) - 1))
    } else if (hot) {
        ctx.translate((((tick * 11) % 3) - 1), (((tick * 5) % 3) - 1))
    } else if (p1.spasm > 0) {
        // #2906 telegraph: a hull about to panic twitches — a two-px vertical
        // kick on the marks, the dread testing its chains before it burns.
        ctx.translate(0, (tick & 1) ? -2 : 2)
    }
    const x = Math.round(p1.x - camX)
    const top = 34, bot = 200
    // body
    ctx.fillStyle = '#3a3226'
    ctx.fillRect(x - 4, top, W + 40, bot - top)
    ctx.fillStyle = '#564c38'
    ctx.fillRect(x + 2, top + 4, W + 30, bot - top - 8)
    ctx.fillStyle = '#7a6f58'
    for (let px = 0; px + x < W; px += 22) ctx.fillRect(x + px + 4, top + 8, 16, bot - top - 16)
    // ridge highlights + bio ribs
    ctx.fillStyle = '#9a8c6c'
    for (let px = 8; px + x < W; px += 22) ctx.fillRect(x + px, top + 6, 2, bot - top - 12)
    ctx.fillStyle = '#2a2018'
    for (let py = top + 12; py < bot - 8; py += 18) ctx.fillRect(x + 6, py, W, 2)
    if (hot) {
        // the flush: a low ember wash that breathes two-shades on a fast beat
        ctx.fillStyle = ((tick >> 2) % 2) ? 'rgba(255,70,30,0.14)' : 'rgba(255,110,40,0.08)'
        ctx.fillRect(x - 4, top, W + 40, bot - top)
        // #2906 travelling glint: a seam of light runs seam-to-rim and back
        // on pure tick arithmetic (no rng, like the S3 sway) — heat as
        // travelling light, so the panic feels alive at 320x224.
        const tp = (tick * 3) % 96
        const gx = x + 6 + (tp < 48 ? tp : 95 - tp) * 3
        ctx.fillStyle = 'rgba(255,224,130,0.32)'
        ctx.fillRect(gx, top + 8, 2, bot - top - 16)
    }
    // red eyes watching the lane
    for (const [ex, ey] of [[x + 14, top + 26], [x + 10, bot - 34], [x + 40, top + 14]]) {
        ctx.fillStyle = '#701414'
        ctx.fillRect(ex, ey, 6, 6)
        ctx.fillStyle = ((tick >> 4) % 9 === 0) ? '#ffa0a0' : '#e03030'
        ctx.fillRect(ex + 1, ey + 1, 4, 4)
    }
    // maw: armour lips part on the core column
    const mouthX = x + 2, coreY = 120
    if (p1.mouth === 'open' || p1.mouth === 'opening' || p1.mouth === 'closing') {
        const openAmt = p1.mouth === 'open' ? 16 : p1.mouth === 'opening' ? Math.round(16 * (1 - p1.mouthT / 30)) : Math.round(16 * (p1.mouthT / 30))
        // throat
        ctx.fillStyle = '#1a0808'
        ctx.fillRect(mouthX, coreY - openAmt, 30, openAmt * 2)
        // the core itself, pulsing
        const pulse = ((tick >> 3) % 3) * 2
        ctx.fillStyle = '#ff8a2a'
        ctx.fillRect(mouthX + 8, coreY - 8 + pulse / 2, 14, 16 - pulse)
        ctx.fillStyle = '#ffe080'
        ctx.fillRect(mouthX + 12, coreY - 4, 8, 8)
        // lip plates
        ctx.fillStyle = '#9a8c6c'
        ctx.fillRect(mouthX - 2, coreY - openAmt - 4, 34, 4)
        ctx.fillRect(mouthX - 2, coreY + openAmt, 34, 4)
        ctx.fillStyle = hot ? (((tick >> 1) % 2) ? '#ff7030' : '#ffb040') : '#d02020'
        ctx.fillRect(mouthX, coreY - openAmt - 1, 30, 1)
        ctx.fillRect(mouthX, coreY + openAmt, 30, 1)
    } else {
        // sealed: seam glow between crossing plates
        ctx.fillStyle = '#701414'
        ctx.fillRect(mouthX, coreY - 14, 30, 28)
        ctx.fillStyle = hot ? (((tick >> 1) % 2) ? '#ff7030' : '#ffb040') : '#d02020'
        ctx.fillRect(mouthX + 2, coreY - 1, 26, 2)
        ctx.fillStyle = '#9a8c6c'
        ctx.fillRect(mouthX - 2, coreY - 18, 34, 4)
        ctx.fillRect(mouthX - 2, coreY + 14, 34, 4)
    }
    if (hot) {
        // the maw wears an ember halo while the core panics
        ctx.fillStyle = ((tick >> 1) % 2) ? 'rgba(255,150,50,0.30)' : 'rgba(255,90,30,0.16)'
        ctx.fillRect(mouthX - 3, coreY - 21, 36, 42)
    }
    if (dying) {
        // breaking-up cascade: plates strobe hot and the maw spasms wide (#2818)
        if ((tick >> 1) % 3 !== 0) {
            ctx.fillStyle = 'rgba(255,150,40,0.16)'
            ctx.fillRect(x - 4, top, W + 40, bot - top)
        }
        ctx.fillStyle = '#ff8a2a'
        for (let i = 0; i < 4; i++) {
            const fx = x + 16 + ((k * 7 + i * 37) % 120)
            const fy = top + 10 + ((k * 5 + i * 53) % (bot - top - 20))
            ctx.fillRect(fx, fy, 3 + (k % 4), 3 + ((k >> 1) % 3))
        }
    }
    ctx.restore()
}

// the bit drone (S3): rides its slot; in shield orbit it wears a green sheen
export function drawBit(ctx, bt, camX, shielded, tick) {
    if (bt.px == null) return
    // #2831: a bit that just ate a round (or ground a body) flashes white and
    // shudders — the shield reads as work done, not a silent erase
    const fl = bt.flash ?? 0
    const jx = fl > 0 ? ((tick * 5 + bt.id) % 3) - 1 : 0
    const jy = fl > 0 ? ((tick * 7 + bt.id * 2) % 3) - 1 : 0
    const x = Math.round(bt.px - camX) + jx, y = Math.round(bt.py) + jy
    const f = Math.floor(Date.now() / 110) % SPR.bit.length
    if (shielded) { ctx.fillStyle = 'rgba(122,214,74,0.20)'; ctx.fillRect(x - 8, y - 8, 16, 16) }
    ctx.drawImage(SPR.bit[f], x - 5, y - 5)
    if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${(Math.min(1, fl / 8) * 0.85).toFixed(2)})`; ctx.fillRect(x - 5, y - 5, 10, 10) }
}

// the PHASE-2 fortress (S3): blue-black plating over the twin core ports —
// darker and colder than Phase-1's flesh, its two red eye-columns stacked
export function drawP2(ctx, p2, camX, tick) {
    const dying = p2.dyingT > 0
    const cs = p2.cascade || 190 // #2835: the twin-core death runs its own (double) length
    const k = dying ? cs - p2.dyingT : 0
    ctx.save()
    if (dying) {
        const cx = Math.round(p2.x - camX) + 60, cy = 120
        ctx.translate(cx, cy)
        ctx.rotate(-k * 0.0009)
        ctx.translate(-cx + (((tick * 11) % 3) - 1), -cy + (((tick * 17) % 3) - 1))
    }
    // #2835: the whole mass sways — the draw rides the sim's swayOff so the
    // picture and the hit windows never disagree
    ctx.translate(0, Math.round(p2.swayOff || 0))
    const x = Math.round(p2.x - camX)
    const top = 30, bot = 210
    ctx.fillStyle = '#20263c'
    ctx.fillRect(x - 4, top, W + 40, bot - top)
    ctx.fillStyle = '#323c58'
    ctx.fillRect(x + 2, top + 4, W + 30, bot - top - 8)
    ctx.fillStyle = '#4a5878'
    for (let px = 0; px + x < W; px += 24) ctx.fillRect(x + px + 4, top + 8, 16, bot - top - 16)
    ctx.fillStyle = '#5e6c8e'
    for (let px = 8; px + x < W; px += 24) ctx.fillRect(x + px, top + 6, 2, bot - top - 12)
    ctx.fillStyle = '#161b2c'
    for (let py = top + 14; py < bot - 8; py += 20) ctx.fillRect(x + 6, py, W, 2)
    // rivet rows along the face
    ctx.fillStyle = '#7c8ab0'
    for (let py = top + 6; py < bot - 4; py += 12) ctx.fillRect(x + 3, py, 2, 2)
    // twin eyes watching the lane, one per core column
    for (const cy of CORE_Y) {
        ctx.fillStyle = '#701414'
        ctx.fillRect(x + 34, cy - 3, 6, 6)
        ctx.fillStyle = ((tick >> 4) % 8 === 0) ? '#ffa0a0' : '#e03030'
        ctx.fillRect(x + 35, cy - 2, 4, 4)
    }
    // the two core ports: armour lips over a hot throat, on their own clocks
    for (const [ci, core] of p2.cores.entries()) {
        const py = CORE_Y[ci]
        const mouthX = x + 2
        if (core.hp <= 0) {
            // a burned-out port: a smoking hole, edges slagged
            ctx.fillStyle = '#0a0c14'
            ctx.fillRect(mouthX, py - 14, 30, 28)
            ctx.fillStyle = '#3a2018'
            ctx.fillRect(mouthX + 4, py - 10, 22, 20)
            if ((tick >> 1) % 3 !== 0) {
                ctx.fillStyle = tick % 4 < 2 ? '#ff8a2a' : '#7a3410'
                ctx.fillRect(mouthX + 8 + ((tick * 5) % 12), py - 6 + ((tick * 3) % 10), 3, 3)
            }
            continue
        }
        if (core.mouth === 'open' || core.mouth === 'opening' || core.mouth === 'closing') {
            const full = core.enraged ? 20 : 16
            const openAmt = core.mouth === 'open' ? full : core.mouth === 'opening'
                ? Math.round(full * (1 - core.mouthT / 30)) : Math.round(full * (core.mouthT / 30))
            ctx.fillStyle = '#12080c'
            ctx.fillRect(mouthX, py - openAmt, 30, openAmt * 2)
            const pulse = ((tick >> 3) % 3) * 2
            ctx.fillStyle = core.enraged ? '#ff2a3a' : '#ff8a2a'
            ctx.fillRect(mouthX + 8, py - 8 + pulse / 2, 14, 16 - pulse)
            ctx.fillStyle = core.enraged ? '#ffd0d8' : '#ffe080'
            ctx.fillRect(mouthX + 12, py - 4, 8, 8)
            ctx.fillStyle = '#5e6c8e'
            ctx.fillRect(mouthX - 2, py - openAmt - 4, 34, 4)
            ctx.fillRect(mouthX - 2, py + openAmt, 34, 4)
            ctx.fillStyle = core.enraged ? '#ff5a6a' : '#d02020'
            ctx.fillRect(mouthX, py - openAmt - 1, 30, 1)
            ctx.fillRect(mouthX, py + openAmt, 30, 1)
            // #2835: the port that holds the NEXT salvo glints while it gapes
            if (!dying && p2.port === ci) {
                ctx.fillStyle = (tick >> 2) % 2 ? '#ffd23c' : '#ff8a2a'
                ctx.fillRect(mouthX + 13, py - 1, 4, 2)
            }
        } else {
            ctx.fillStyle = '#4a1020'
            ctx.fillRect(mouthX, py - 14, 30, 28)
            ctx.fillStyle = core.enraged ? '#ff5a6a' : '#d02020'
            ctx.fillRect(mouthX + 2, py - 1, 26, 2)
            ctx.fillStyle = '#5e6c8e'
            ctx.fillRect(mouthX - 2, py - 18, 34, 4)
            ctx.fillRect(mouthX - 2, py + 14, 34, 4)
        }
    }
    if (dying) {
        if ((tick >> 1) % 3 !== 0) {
            ctx.fillStyle = 'rgba(160,190,255,0.12)'
            ctx.fillRect(x - 4, top, W + 40, bot - top)
        }
        // #2835 walking death: a hot seam crosses the face from the port that
        // fell last toward its twin, and whole rows of plating shed behind it.
        const lane = Math.max(0, p2.lastCore)
        const seamLane = k < cs / 2 ? lane : 1 - lane
        const sx = x + 10 + Math.floor(k * 0.3)
        const sy = CORE_Y[seamLane]
        ctx.fillStyle = 'rgba(255,140,60,0.30)'
        ctx.fillRect(sx - 4, sy - 18, 9, 36)
        ctx.fillStyle = '#ffd23c'
        ctx.fillRect(sx, sy - 6 + ((k * 13) % 7), 3, 3)
        ctx.fillStyle = '#ff8a2a'
        ctx.fillRect(sx - 6, sy + 8 - ((k * 7) % 9), 3, 3)
        for (let r = 0; r < 6; r++) {
            const rp = k - 12 - r * 22
            if (rp < 0 || rp > 64) continue
            const a = (1 - rp / 64) * 0.85
            ctx.fillStyle = `rgba(94,108,142,${a.toFixed(2)})`
            const ry = top + 10 + r * 28
            for (let c2 = 4; c2 + x < W; c2 += 26) ctx.fillRect(x + c2 + ((r * 7 + c2) % 5), ry + rp, 14, 5)
        }
    }
    ctx.restore()
}

// ------------------------------------------------ DOBKERATOPS (#2911) ----
// The arcade's Stage-2 gate that walks: a broad olive carapace over four
// stomping legs, a snouted head whose maw glows hot before every ricochet
// fan. Blaster scars accumulate as the flesh-armour spends; the wreck
// buckles front-to-back like the sim's boom train says it should.
export function drawDobk(ctx, dk, camX, tick) {
    const dying = dk.dyingT > 0
    const k = dying ? 240 - dk.dyingT : 0
    const x = Math.round(dk.x - camX)
    const top = DOBK.bodyTop, bot = DOBK.bodyBot
    ctx.save()
    if (dying) {
        const cx = x + 60, cy = 120
        ctx.translate(cx, cy)
        ctx.rotate(k * 0.0012) // it lists bow-first into the fire
        ctx.translate(-cx + (((tick * 13) % 3) - 1), -cy + (((tick * 7) % 3) - 1))
    }
    // four legs — hip to a clawed foot at the field floor, swinging in pairs.
    // A foot lifts on its swing and throws dust as it lands (26-tick march).
    for (let li = 0; li < 4; li++) {
        const ph = dk.walkT * 0.12 + li * Math.PI
        const hx = x + 12 + li * 34
        const lift = dying ? Math.max(0, 14 - k * 0.2) * (li % 2) : Math.max(0, Math.sin(ph)) * 7
        const swx = Math.cos(ph) * 8
        const fy = FIELD_BOT - 4 - lift
        ctx.strokeStyle = li % 2 ? '#3d4a26' : '#313d1e'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(hx, bot - 4)
        ctx.lineTo(hx + swx * 0.5, (bot + fy) / 2 + 4)
        ctx.lineTo(hx + swx, fy)
        ctx.stroke()
        ctx.fillStyle = '#202814'
        ctx.fillRect(hx + swx - 5, fy, 12, 4) // claw plate
        const land = ((dk.walkT - li * 13) % 26)
        if (!dying && land < 5 && Math.sin(ph) < 0) {
            ctx.fillStyle = `rgba(150,140,110,${(0.5 - land * 0.1).toFixed(2)})`
            ctx.fillRect(hx + swx - 8 - land, fy + 2, 4, 2)
            ctx.fillRect(hx + swx + 9 + land, fy + 2, 4, 2)
        }
    }
    // carapace: stacked plates doming from the flanks to a ridge
    ctx.fillStyle = '#243018'
    ctx.fillRect(x + 2, top, 134, bot - top)
    ctx.fillStyle = '#39492a'
    ctx.fillRect(x + 6, top + 6, 128, bot - top - 12)
    ctx.fillStyle = '#4b5d36'
    ctx.fillRect(x + 14, top - 8, 110, 14)
    ctx.fillRect(x + 30, top - 14, 78, 10)
    ctx.fillStyle = '#5e7242'
    for (let px = 18; px < 128; px += 16) ctx.fillRect(x + px, top - 4, 8, 6)
    ctx.fillStyle = '#1a2210'
    for (let py = top + 12; py < bot - 6; py += 16) ctx.fillRect(x + 8, py, 124, 2) // plate seams
    ctx.fillStyle = '#71854e'
    for (let px = 10; px < 130; px += 22) ctx.fillRect(x + px, top + 4, 2, 2) // rivets
    // head: a snout on the face of it, eye low and mean
    ctx.fillStyle = '#2c381c'
    ctx.fillRect(x, 60, 26, bot - 60)
    ctx.fillStyle = '#43542c'
    ctx.fillRect(x + 2, 64, 22, bot - 68)
    ctx.fillStyle = '#701414'
    ctx.fillRect(x + 6, 70, 7, 6)
    ctx.fillStyle = ((tick >> 4) % 8 === 0) ? '#ffa0a0' : '#e03030'
    ctx.fillRect(x + 7, 71, 5, 4)
    // the maw — the telegraph: rim glints on the open, throats hot before fire
    const my = DOBK.mouthY
    if (dk.mouth === 'open' || dk.mouth === 'opening' || dk.mouth === 'closing') {
        const full = 15
        const amt = dk.mouth === 'open' ? full : dk.mouth === 'opening'
            ? Math.round(full * (1 - dk.mouthT / 30)) : Math.round(full * (dk.mouthT / 30))
        ctx.fillStyle = '#12080c'
        ctx.fillRect(x, my - amt, 22, amt * 2)
        const pulse = ((tick >> 3) % 3) * 2
        ctx.fillStyle = '#ff8a2a'
        ctx.fillRect(x + 4, my - 8 + pulse / 2, 14, 16 - pulse)
        ctx.fillStyle = '#ffe080'
        ctx.fillRect(x + 8, my - 4, 7, 8)
        ctx.fillStyle = '#5e7242'
        ctx.fillRect(x - 2, my - amt - 4, 26, 4) // upper lip
        ctx.fillRect(x - 2, my + amt, 26, 4)     // lower jaw
        ctx.fillStyle = '#d02020'
        ctx.fillRect(x, my - amt - 1, 22, 1)
        ctx.fillRect(x, my + amt, 22, 1)
    } else {
        ctx.fillStyle = '#3d2416'
        ctx.fillRect(x + 2, my - 10, 20, 20)
        ctx.fillStyle = '#6b8a3c'
        ctx.fillRect(x + 2, my - 1, 20, 2) // sealed seam
    }
    // accumulated fire: every spent notch of the pool leaves a blackened scar
    const spent = dk.max - dk.hp
    for (let ki = 0; ki < spent; ki++) {
        const sxp = x + 30 + ((ki * 53) % 92)
        const syp = top + 8 + ((ki * 37) % (bot - top - 16))
        ctx.fillStyle = '#10160b'
        ctx.fillRect(sxp, syp, 4, 3)
        ctx.fillStyle = '#5c3a1c'
        ctx.fillRect(sxp + 1, syp + 1, 2, 1)
    }
    if (dk.flashT > 0 && !dying) { // fresh hit: the whole slab blinks
        ctx.fillStyle = 'rgba(220,255,190,0.18)'
        ctx.fillRect(x, top - 14, 134, bot - top + 14)
    }
    if (dying) {
        // the buckling wreck: hot seams walk the carapace as the booms do
        if ((tick >> 1) % 3 !== 0) {
            ctx.fillStyle = 'rgba(190,220,150,0.10)'
            ctx.fillRect(x, top - 14, 134, bot - top + 14)
        }
        const sxp = x + 12 + Math.floor(k * 0.35)
        ctx.fillStyle = 'rgba(255,140,60,0.30)'
        ctx.fillRect(sxp - 4, top + 10 + ((k * 11) % 70), 9, 26)
        ctx.fillStyle = '#ffd23c'
        ctx.fillRect(sxp, top + 16 + ((k * 17) % 60), 3, 3)
        // plates shed off the back as it goes under
        for (let r = 0; r < 5; r++) {
            const rp = k - 10 - r * 26
            if (rp < 0 || rp > 64) continue
            const a = (1 - rp / 64) * 0.8
            ctx.fillStyle = `rgba(75,93,54,${a.toFixed(2)})`
            ctx.fillRect(x + 120 - r * 22, top + 6 + r * 20 + rp, 14, 5)
        }
    }
    ctx.restore()
}

// ---------------------------------------------------------------- HUD ----
export function drawHud(ctx, gs) {
    drawText(ctx, '1UP', 8, 8, (gs.tick % 50) < 36 ? '#e03030' : '#601010')
    drawText(ctx, String(gs.score).padStart(7, '0'), 44, 8, '#f0f0f0')
    drawText(ctx, 'HI', 196, 8, '#37d0ff')
    drawText(ctx, String(Math.max(gs.hi, gs.score)).padStart(7, '0'), 220, 8, '#f0f0f0')
    // #2906 HUD ember voice: at ignition the panic names itself by the score
    // field for ~1 s (hotAnn is the sim's juice countdown) — a first-timer
    // learns the rules changed without ever opening the F1 panel.
    if (gs.p1 && gs.p1.hotAnn > 0) drawText(ctx, 'HOT', 120, 8, ((gs.tick >> 2) % 2) ? '#ff7030' : '#7c2810')
    for (let i = 0; i < Math.min(gs.lives - 1, 5); i++) ctx.drawImage(SPR.shipIcon, 8 + i * 15, H - 12)
    const wl = gs.ship.weapon === 'wave' ? 'WAVE' : gs.ship.weapon === 'laser' ? 'LASER' : gs.ship.weapon === 'double' ? 'DOUBLE' : 'VULCAN'
    const wcol = gs.ship.weapon === 'wave' ? '#37d0ff' : gs.ship.weapon === 'laser' ? '#ff5a7a' : '#9ac93c'
    drawText(ctx, wl, 90, H - 12, wcol)
    // #2919 option pips: one gold bead per docked orb, riding right behind
    // the arm word — the shield-guns stay readable in the middle of a fight.
    // #2924: a thrown orb keeps its socket — a dark bead, spending with the
    // drone (the wall is gone but the pair is still out there, burning).
    const pipX = 90 + textWidth(wl) + 8
    ;(gs.ship.opts || []).forEach((o, i) => {
        if (o.docked) {
            ctx.fillStyle = ((gs.tick >> 3) % 4) === 0 ? '#fff2c0' : '#ffd870'
            ctx.fillRect(pipX + i * 7, H - 10, 4, 4)
        } else {
            ctx.fillStyle = ((gs.tick >> 4) % 2) ? '#5c4410' : '#3a2b0a'
            ctx.fillRect(pipX + i * 7, H - 10, 4, 4)
        }
    })
    // #2919 the summon names itself at the score field, ember-style (#2906)
    if (gs.optAnn > 0) drawText(ctx, 'OPTIONS', 108, 8, ((gs.tick >> 2) % 2) ? '#ffd870' : '#7c5a10')
    if (gs.pod) ctx.drawImage(SPR.seed[Math.floor(Date.now() / 90) % 4], 172, H - 14) // the shell rides with you
    // bit pips (S3): one diamond per chained drone; the full chain spells SHIELD
    for (let i = 0; i < gs.bits.length; i++) {
        const bx = 200 + i * 10, by = H - 9
        ctx.fillStyle = gs.bits.length === 4 ? '#7ad64a' : '#46a02a'
        ctx.fillRect(bx + 2, by, 4, 4); ctx.fillRect(bx + 1, by + 1, 6, 2); ctx.fillRect(bx + 3, by - 1, 2, 6)
    }
    if (gs.bits.length === 4) drawText(ctx, 'SHIELD', 246, H - 12, (gs.tick % 40) < 28 ? '#7ad64a' : '#2c5018')
    if (gs.ship.weapon === 'wave' || gs.ship.weapon === 'laser') {
        // charge gauge: three tier boxes (cyan for the crescent, hot for the lance)
        const hot = gs.ship.weapon === 'laser'
        for (let i = 0; i < 3; i++) {
            const lit = gs.ship.charge >= [10, 25, 50][i]
            ctx.fillStyle = lit ? (i === 2 ? (hot ? '#ffe8ee' : '#eaffff') : hot ? '#ff8aa0' : '#8ae8ff') : hot ? '#40121e' : '#1c2c44'
            ctx.fillRect(140 + i * 10, H - 12, 8, 7)
        }
    }
    // dual pools (S4): seat two keeps its tickets in a blue row under 1UP
    if (gs.wing) {
        drawText(ctx, '2P', 8, 16, gs.wing.out ? '#4a5568' : '#2e8ad8')
        if (gs.wing.out) drawText(ctx, 'SEAT DARK', 30, 16, '#5a6478')
        else if (gs.wing.dead) drawText(ctx, 'DOWN', 30, 16, (gs.tick % 30) < 20 ? '#e03030' : '#701818')
        else for (let i = 0; i < Math.min(gs.wing.lives - 1, 5); i++) ctx.drawImage(SPR.shipIconP2, 30 + i * 15, 15)
        // #2841: the drop-in keys sit by the dual pools all flight — attract
        // says them once, but seat two is found mid-run, not from memory
        if (!gs.wing.human && !gs.wing.out) drawText(ctx, 'SEAT 2 : WASD+F', 112, 16, '#3c5c80')
    }
}

export function drawBanner(ctx, gs) {
    const center = (s, y, col, sc = 1) => drawText(ctx, s, Math.round((W - textWidth(s, sc)) / 2), y, col, sc)
    if (gs.mode === 'clear') {
        center('STAGE CLEAR', 96, '#37d0ff', 2)
        center(String(gs.score).padStart(7, '0'), 124, '#f0f0f0')
    } else if (gs.dobk && gs.tick - gs.dobk.at < 170) {
        center('WARNING : DOBKERATOPS', 100, gs.tick % 20 < 12 ? '#ff9a3c' : '#7c4010')
    } else if (gs.leg === 3 && gs.tick - gs.legAt < 130) {
        center('STAGE 2 : THE BRIDGEHEAD', 100, '#9ac93c')
    } else if (gs.p2 && gs.tick - gs.p2.at < 150) {
        center('PHASE 2 : TWIN CORES', 100, gs.tick % 20 < 12 ? '#ff5a6a' : '#802030')
    } else if (gs.leg === 2 && gs.tick - gs.legAt < 130) {
        center('THE CONVOY RESUMES', 100, '#9ac93c')
    } else if (gs.tick < 140 && gs.mode === 'play') {
        center('STAGE 1  OUTER SPACE', 100, '#9ac93c')
    }
    // seat two banners (S4) keep their own line at y=118 — never over another
    if (gs.wing && gs.mode !== 'clear') {
        if (gs.tick - gs.wingAt < 130 && gs.tick >= 40) center('PILOT TWO JOINS THE FIGHT', 118, '#6fa8e8')
        else if (gs.wing.out && gs.tick - (gs.wingLostAt || 0) < 110) center('PILOT TWO DOWN', 118, '#8a98b8')
    }
}

export function drawAttract(ctx, phase, tick) {
    // the logo: blocky cyan-blue with a white top edge
    const lx = Math.round((W - textWidth('R-TYPE', 5)) / 2)
    drawText(ctx, 'R-TYPE', lx + 3, 53, '#101830', 5)
    drawText(ctx, 'R-TYPE', lx, 50, '#37d0ff', 5)
    for (let i = 0; i < 'R-TYPE'.length; i++) {
        const g = G['R-TYPE'[i]].split('|')
        ctx.fillStyle = '#eaffff'
        for (let c = 0; c < 5; c++) if (g[0][c] === '#') ctx.fillRect(lx + i * 35 + c * 5, 50, 5, 5)
    }
    const center = (s, y, col, sc = 1) => drawText(ctx, s, Math.round((W - textWidth(s, sc)) / 2), y, col, sc)
    center('THE FIGHTING FANTASY', 92, '#8ae8ff')
    const msgs = [
        'ENEMY BIOMECHANICAL FLEET : BYDO',
        'WAVE CANNON : HOLD FIRE, RELEASE',
        'LASER : CHARGE THE LANCE, PIERCE THE LINE',
        'GREEN BIT CAPSULES : CHAIN FOUR FOR THE SHIELD',
        'PHASE 2 HAS TWO HEARTS : HUNT THE VENTS',
        'DOBKERATOPS WALKS THE BRIDGEHEAD : HIS FIRE BOUNCES',
        'SHOOT THE MAW WHEN IT GAPES',
        'THE FORCE POD : B DEPLOYS, B RETRIEVES',
        'PILOT TWO FLIES FREE : WASD + F + G',
        'V RELIEVES SEAT TWO : WINGMAN BACK ON DUTY',
        'THE LEFT EDGE DOES NOT FORGIVE',
    ]
    center(msgs[phase % msgs.length], 124, '#f0f0f0')
    if ((tick >> 4) % 2 === 0) center('PUSH ANY KEY', 152, '#ffd23c')
    center('IREM-ERA CABINET, REBUILT IN CODE', 176, '#3c4c68')
}
