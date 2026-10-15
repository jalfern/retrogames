// PRINCE OF PERSIA — every pixel generated in code (Stage 2: the look and the
// animation). Blue-grey cut stone with mortar grain; floors read as ledges with
// a lit top and a dark front face; torches flicker and tint the wall warm, and
// rooms without one sink into shadow; palace levels are pale stone with pillars,
// arched windows and tapestries. The prince is most of a floor tall, driven by
// a pose table: an 8-frame run on two-segment legs with real knee bends, plus
// separate start / skid / turn / jump-crouch / land / hang / climb / careful /
// drink / draw / sheathe poses. Deaths carry weight per cause — impaled bodies
// stay on the spikes, jaws slice, long falls crumple, the sword cuts you down.
// Guards rank at a glance: turban colour by skill, the fat guard's wide frame,
// the skeleton all bone, Jaffar in robes and a tall hat. No assets, no random.

import { RW, H, T, GROUND, SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, DROP, EXITPLATE, TORCH, EXIT, SWORD, POTION, MIRROR, BRIDGE } from './levels.js'
import { CFG, chompDown, clockText, GUARD_STYLE } from './sim.js'

export const VW = RW * T
export const VH = H * T

// per-guard look: turban, tunic, trim, skin, sword metal — colour by skill.
export const PALETTES = {
    green: { turban: '#2e6b46', cloth: '#2a5038', trim: '#70a080', skin: '#c89878', sword: '#c8ccd8' },
    red: { turban: '#a82828', cloth: '#7a2020', trim: '#d06050', skin: '#c0906c', sword: '#d8dce8' },
    fat: { turban: '#8a5a2a', cloth: '#6a4420', trim: '#d0a860', skin: '#d8a880', sword: '#dce2ee', wide: 1.55 },
    fibula: { cloth: '#8a5a2a', trim: '#d0a860', skin: '#d8a880', sword: '#dce2ee' },
    skeleton: { cloth: '#c9c9bb', trim: '#9a9a8c', skin: '#eceada', sword: '#b0b8c8', bone: true },
    shadow: { cloth: '#16161f', trim: '#3a3a4e', skin: '#5a5a6a', sword: '#525a6a' },
    jaffar: { turban: '#3a1050', cloth: '#5a1f72', trim: '#d24ad2', skin: '#c89878', sword: '#e0d0ff', robe: true, hat: true },
}
export const guardLook = (type, boss) => PALETTES[type] || PALETTES[boss ? 'jaffar' : 'green'] || PALETTES.green

const hash = (n) => {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
}
const shade = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40)
    return `rgb(${r},${g},${b})`
}

// ---- pose tables --------------------------------------------------------------
// One frame = joint targets, angles measured from straight-down, + toward the
// facing direction. Legs are two-segment: thigh (t) + knee bend (k). The run
// table is a full 8-frame cycle; guards and the prince share the vocabulary.
const RUN_T = [0.55, 0.38, 0.05, -0.28, -0.52, -0.30, 0.06, 0.34]
const RUN_K = [0.08, 0.12, 0.42, 0.95, 1.15, 0.65, 0.18, 0.05]
const ARM_R = [-0.42, -0.25, 0.0, 0.28, 0.42, 0.25, 0.0, -0.28]
const runFrame = (k, sp) => ({
    lean: 0.12 * sp, bob: -Math.abs(Math.sin(k / 8 * Math.PI * 2)) * (sp > 0.6 ? 3 : 1.5),
    hip: 26 - (sp > 0.6 ? 1.5 : 0), tA: RUN_T[k] * sp, kA: RUN_K[k] * sp,
    tB: RUN_T[(k + 4) % 8] * sp, kB: RUN_K[(k + 4) % 8] * sp, armB: ARM_R[k] * sp,
})

export const POSES = {
    idle: [{ lean: 0, bob: 0, hip: 26, tA: 0.10, kA: 0.05, tB: -0.10, kB: 0.05, armB: -0.25 }],
    walk: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => runFrame(k, 0.55)),
    run: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => runFrame(k, 1)),
    careful: [
        { lean: 0.1, bob: 0, hip: 24, tA: 0.42, kA: 0.22, tB: -0.05, kB: 0.10, armB: -0.6 },
        { lean: 0.12, bob: -1, hip: 23, tA: 0.5, kA: 0.3, tB: 0.1, kB: 0.25, armB: -0.85 },
        { lean: 0.1, bob: 0, hip: 24, tA: 0.05, kA: 0.15, tB: -0.3, kB: 0.5, armB: -0.7 },
        { lean: 0.08, bob: -1, hip: 23, tA: 0.2, kA: 0.35, tB: -0.1, kB: 0.2, armB: -0.95 },
    ],
    start: [
        { lean: 0.22, bob: 0, hip: 25, tA: 0.15, kA: 0.2, tB: -0.35, kB: 0.55, armB: -0.1 },
        { lean: 0.26, bob: -1, hip: 24, tA: 0.45, kA: 0.3, tB: -0.5, kB: 0.7, armB: 0.15 },
        { lean: 0.18, bob: 0, hip: 25, tA: 0.55, kA: 0.15, tB: -0.3, kB: 0.4, armB: 0.3 },
    ],
    skid: [
        { lean: -0.26, bob: 0, hip: 25, tA: 0.42, kA: 0.15, tB: -0.5, kB: 0.75, armB: 0.5 },
        { lean: -0.2, bob: -1, hip: 24, tA: 0.3, kA: 0.1, tB: -0.4, kB: 0.6, armB: 0.4 },
    ],
    turn: [
        { lean: -0.08, bob: -1, hip: 25, tA: 0.15, kA: 0.25, tB: -0.15, kB: 0.25, armB: 0.1 },
        { lean: 0.06, bob: 0, hip: 24, tA: 0.25, kA: 0.3, tB: -0.2, kB: 0.3, armB: -0.15 },
    ],
    crouch: [{ lean: 0.1, bob: 0, hip: 15, tA: 0.3, kA: 1.15, tB: -0.3, kB: 1.15, armB: -0.15 }],
    jump: [
        { lean: 0.12, bob: -2, hip: 18, tA: 0.3, kA: 1.25, tB: -0.35, kB: 1.1, armB: 0.55 },
        { lean: 0.1, bob: 0, hip: 24, tA: 0.4, kA: 0.7, tB: -0.45, kB: 0.85, armB: 0.45 },
    ],
    fall: [{ lean: 0.06, bob: 0, hip: 24, tA: 0.28, kA: 0.5, tB: -0.32, kB: 0.7, armB: 0.75 }],
    land: [
        { lean: 0.16, bob: 2, hip: 17, tA: 0.34, kA: 1.05, tB: -0.34, kB: 1.0, armB: 0.3 },
        { lean: 0.08, bob: 0, hip: 22, tA: 0.2, kA: 0.5, tB: -0.22, kB: 0.45, armB: 0.1 },
    ],
    hang: [
        { lean: -0.05, bob: 0, hip: 14, tA: 0.3, kA: 0.45, tB: -0.12, kB: 0.3, armB: -0.25 },
        { lean: 0.04, bob: 1.5, hip: 12, tA: 0.22, kA: 0.5, tB: -0.2, kB: 0.35, armB: -0.18 },
    ],
    climb: [
        { lean: 0.2, bob: 0, hip: 14, tA: 0.5, kA: 1.2, tB: -0.2, kB: 0.9, armB: -0.5 },
        { lean: 0.3, bob: -3, hip: 12, tA: 0.7, kA: 1.35, tB: 0.1, kB: 1.0, armB: -0.75 },
        { lean: 0.22, bob: -6, hip: 11, tA: 0.4, kA: 1.1, tB: -0.3, kB: 0.8, armB: -0.6 },
        { lean: 0.12, bob: -9, hip: 16, tA: 0.2, kA: 0.7, tB: -0.4, kB: 0.6, armB: -0.35 },
    ],
    shimmy: [
        { lean: -0.02, bob: 0, hip: 13, tA: 0.35, kA: 0.5, tB: -0.15, kB: 0.35, armB: -0.2 },
        { lean: 0.05, bob: 1, hip: 12, tA: 0.2, kA: 0.4, tB: -0.25, kB: 0.45, armB: -0.3 },
    ],
    block: [{ lean: -0.06, bob: 0, hip: 24, tA: 0.18, kA: 0.25, tB: -0.22, kB: 0.35, armB: -1.3 }],
    ready: [{ lean: 0.04, bob: 0, hip: 25, tA: 0.2, kA: 0.2, tB: -0.24, kB: 0.3, armB: -0.55 }],
    windup: [{ lean: -0.22, bob: -1, hip: 25, tA: 0.12, kA: 0.2, tB: -0.3, kB: 0.4, armB: -1.9 }],
    strike: [
        { lean: 0.1, bob: 0, hip: 24, tA: 0.25, kA: 0.2, tB: -0.35, kB: 0.4, armB: -1.2 },
        { lean: 0.34, bob: 0, hip: 23, tA: 0.5, kA: 0.15, tB: -0.5, kB: 0.5, armB: 0.35 },
        { lean: 0.24, bob: 0, hip: 24, tA: 0.4, kA: 0.2, tB: -0.42, kB: 0.45, armB: 0.15 },
    ],
    recoil: [{ lean: -0.3, bob: 1, hip: 25, tA: 0.1, kA: 0.3, tB: -0.4, kB: 0.6, armB: 0.8 }],
    attack: [
        { lean: -0.12, bob: 0, hip: 25, tA: 0.15, kA: 0.2, tB: -0.3, kB: 0.4, armB: -1.05 },
        { lean: 0.3, bob: 0, hip: 23, tA: 0.55, kA: 0.15, tB: -0.55, kB: 0.55, armB: 0.45 },
        { lean: 0.22, bob: 0, hip: 24, tA: 0.42, kA: 0.2, tB: -0.44, kB: 0.45, armB: 0.2 },
        { lean: 0.08, bob: 0, hip: 25, tA: 0.22, kA: 0.2, tB: -0.26, kB: 0.3, armB: -0.2 },
    ],
    drink: [
        { lean: -0.1, bob: 0, hip: 25, tA: 0.12, kA: 0.15, tB: -0.16, kB: 0.2, armB: -0.3 },
        { lean: -0.22, bob: 0, hip: 25, tA: 0.1, kA: 0.12, tB: -0.14, kB: 0.18, armB: -0.2 },
        { lean: 0.08, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.18, kB: 0.22, armB: -0.5 },
    ],
    draw: [
        { lean: -0.12, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.2, kB: 0.25, armB: 0.9 },
        { lean: 0.05, bob: 0, hip: 25, tA: 0.18, kA: 0.2, tB: -0.22, kB: 0.3, armB: -0.6 },
    ],
    sheathe: [
        { lean: 0.05, bob: 0, hip: 25, tA: 0.16, kA: 0.2, tB: -0.2, kB: 0.25, armB: -0.4 },
        { lean: -0.08, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.18, kB: 0.22, armB: 0.75 },
    ],
    // --- deaths, one per cause (weight, not a generic topple) --------------
    die_impale: [
        { lean: 0.9, bob: -7, hip: 20, tA: 0.25, kA: 0.55, tB: -0.1, kB: 0.45, armB: 0.95 },
        { lean: 1.05, bob: -6, hip: 19, tA: 0.3, kA: 0.6, tB: -0.05, kB: 0.5, armB: 1.05 },
        { lean: 1.0, bob: -6.5, hip: 19, tA: 0.28, kA: 0.58, tB: -0.08, kB: 0.48, armB: 1.0 },
    ],
    die_slice: [
        { lean: 0.18, bob: 0, hip: 22, tA: 0.55, kA: 0.3, tB: -0.55, kB: 0.3, armB: 0.6 },
        { lean: 0.3, bob: 1, hip: 20, tA: 0.7, kA: 0.4, tB: -0.7, kB: 0.4, armB: 0.8 },
    ],
    die_crumple: [
        { lean: 0.5, bob: 1, hip: 16, tA: 0.6, kA: 1.2, tB: -0.3, kB: 1.0, armB: 0.5 },
        { lean: 0.85, bob: 3, hip: 8, tA: 0.95, kA: 1.5, tB: 0.2, kB: 1.2, armB: 1.1 },
        { lean: 0.95, bob: 4, hip: 6, tA: 1.05, kA: 1.55, tB: 0.35, kB: 1.25, armB: 1.3 },
    ],
    die_cut: [
        { lean: -0.25, bob: 0, hip: 14, tA: 0.35, kA: 1.2, tB: -0.25, kB: 1.15, armB: 0.6 },
        { lean: -0.8, bob: 2, hip: 9, tA: 0.5, kA: 1.3, tB: -0.1, kB: 1.1, armB: 1.0 },
        { lean: -1.25, bob: 3, hip: 6, tA: 0.6, kA: 1.3, tB: 0.1, kB: 1.1, armB: 1.25 },
    ],
    die_poison: [
        { lean: -0.15, bob: 0, hip: 20, tA: 0.2, kA: 0.8, tB: -0.25, kB: 0.7, armB: 1.35 },
        { lean: -0.4, bob: 2, hip: 12, tA: 0.4, kA: 1.3, tB: -0.2, kB: 1.1, armB: 1.5 },
        { lean: -0.55, bob: 3, hip: 8, tA: 0.5, kA: 1.4, tB: -0.1, kB: 1.15, armB: 1.55 },
    ],
    die_shadow: [
        { lean: 0.1, bob: 0, hip: 22, tA: 0.3, kA: 0.6, tB: -0.3, kB: 0.55, armB: 0.7 },
        { lean: 0.3, bob: 2, hip: 14, tA: 0.55, kA: 1.1, tB: -0.2, kB: 0.9, armB: 1.0 },
        { lean: 0.5, bob: 4, hip: 7, tA: 0.8, kA: 1.4, tB: 0.1, kB: 1.2, armB: 1.3 },
    ],
}
export const RUN_FRAMES = POSES.run.length
export const DEATH_ANIMS = { spikes: 'die_impale', chomper: 'die_slice', fall: 'die_crumple', sword: 'die_cut', poison: 'die_poison', shadow: 'die_shadow' }

export function poseOf(name, k = 0) {
    const list = POSES[name] || POSES.idle
    return list[((k % list.length) + list.length) % list.length]
}

// ---- tiles --------------------------------------------------------------------
function floorLedge(ctx, x, y, top, front, crack) {
    ctx.fillStyle = top
    ctx.fillRect(x, y, T, 4)
    ctx.fillStyle = front
    ctx.fillRect(x, y + 4, T, T - 4)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(x, y + 4, T, 3)
    if (crack) {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + 13, y + 12)
        ctx.moveTo(x + 21, y + 3); ctx.lineTo(x + 17, y + 13)
        ctx.stroke()
    }
}

function stone(ctx, c, r, code, g) {
    const x = c * T, y = r * T
    const h = hash(c * 31 + r * 7)
    if (code === SOLID) {
        ctx.fillStyle = h > 0.5 ? '#4a4a5e' : '#42425a'
        ctx.fillRect(x, y, T, T)
        ctx.fillStyle = '#34344a'
        ctx.fillRect(x, y + T - 3, T, 3)
        ctx.fillRect(x + ((c + r) % 2 ? T - 3 : 0), y, 3, T)
        ctx.fillStyle = '#585872'
        ctx.fillRect(x + 2, y + 2, T - 4, 2)
        for (let i = 0; i < 3; i++) {
            const hx = Math.floor(hash(c * 13 + r * 17 + i * 3) * (T - 6))
            const hy = Math.floor(hash(c * 7 + r * 23 + i) * (T - 8))
            ctx.fillStyle = 'rgba(255,255,255,0.04)'
            ctx.fillRect(x + hx, y + hy, 3, 2)
        }
    } else if (code === PLATFORM) {
        floorLedge(ctx, x, y, '#70708a', '#50506a')
    } else if (code === LOOSE) {
        floorLedge(ctx, x, y, '#7d6b50', '#5c4c38', true)
    } else if (code === SPIKE) {
        ctx.fillStyle = '#20202e'
        ctx.fillRect(x, y + T - 6, T, 6)
        ctx.fillStyle = '#b8c0cc'
        for (let i = 0; i < 4; i++) {
            const sx = x + 2 + i * 8
            ctx.beginPath()
            ctx.moveTo(sx, y + T - 5)
            ctx.lineTo(sx + 3, y + T - 23)
            ctx.lineTo(sx + 6, y + T - 5)
            ctx.fill()
        }
    } else if (code === RAISE) {
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 3, y + T - 10, T - 6, 10)
        ctx.fillStyle = '#e8b04a'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 4)
    } else if (code === DROP) {
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 3, y + T - 10, T - 6, 10)
        ctx.fillStyle = '#c04040'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 4)
    } else if (code === EXITPLATE) {
        const pressed = g.exitOpen
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 2, y + T - 8, T - 4, 8)
        ctx.fillStyle = pressed ? '#e8d060' : '#8a8aa0'
        ctx.fillRect(x + 5, y + T - (pressed ? 4 : 7), T - 10, 3)
    } else if (code === EXIT) {
        ctx.fillStyle = '#15151f'
        ctx.fillRect(x + 2, y - T, T - 4, T * 2)
        ctx.fillStyle = g.exitOpen ? '#e8d060' : '#4a3a22'
        ctx.fillRect(x + 4, y - T + 4, T - 8, T * 2 - 6)
        if (g.exitOpen) {
            ctx.fillStyle = 'rgba(255,220,120,0.25)'
            ctx.fillRect(x + 4, y - T + 4, T - 8, T * 2 - 6)
        }
        ctx.fillStyle = '#2e2e42'
        ctx.fillRect(x + 2, y - T, T - 4, 4)
    }
}

// ---- palace dressing: pale walls, pillars, arched windows, tapestries --------
function palaceWall(ctx, c0, decos, tick) {
    for (let rm = 0; rm < decos.length; rm++) {
        const base = (c0 / RW + rm) * RW * T
        const d = decos[rm]
        ctx.fillStyle = '#8f8f7a'
        ctx.fillRect(base + d.pillar * T - 7, 24, 14, VH - 24 - 8)
        ctx.fillStyle = '#a8a890'
        ctx.fillRect(base + d.pillar * T - 7, 24, 5, VH - 24 - 8)
        ctx.fillStyle = '#6e6e5c'
        ctx.fillRect(base + d.pillar * T - 10, 20, 20, 8)
        ctx.fillRect(base + d.pillar * T - 10, VH - 12, 20, 8)
        const wx = base + d.window * T + 8
        ctx.fillStyle = '#1b1f33'
        ctx.beginPath()
        ctx.moveTo(wx, 84); ctx.lineTo(wx, 44)
        ctx.arc(wx + 8, 44, 8, Math.PI, 0)
        ctx.lineTo(wx + 16, 84)
        ctx.closePath()
        ctx.fill()
        const moon = 0.4 + 0.2 * Math.sin(tick * 0.02 + rm)
        ctx.fillStyle = `rgba(120,140,220,${moon.toFixed(2)})`
        ctx.fillRect(wx + 2, 60, 12, 22)
        const tx = base + d.tapestry * T + 4
        ctx.fillStyle = '#5a2540'
        ctx.fillRect(tx, 30, 24, 52)
        ctx.fillStyle = '#7a3558'
        ctx.fillRect(tx + 3, 34, 18, 44)
        ctx.fillStyle = '#c8a050'
        ctx.fillRect(tx + 8, 42, 8, 20)
        ctx.fillStyle = '#5a2540'
        for (let i = 0; i < 3; i++) ctx.fillRect(tx + 3 + i * 8, 82, 4, 6 + Math.sin(tick * 0.1 + i + rm) * 1.5)
    }
}

function lightPool(ctx, x, y, fl) {
    const grad = ctx.createRadialGradient(x, y, 4, x, y, 90 + fl * 14)
    grad.addColorStop(0, 'rgba(255,180,80,0.20)')
    grad.addColorStop(1, 'rgba(255,150,60,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - 110, y - 110, 220, 220)
}

function drawTorch(ctx, c, r, tick) {
    const x = c * T + T / 2, y = r * T + 10
    const fl = Math.sin(tick * 0.31 + c * 3) + Math.sin(tick * 0.17 + r)
    ctx.fillStyle = '#6a4a22'
    ctx.fillRect(x - 2, y, 4, 14)
    ctx.fillStyle = '#3a2a12'
    ctx.fillRect(x - 4, y + 10, 8, 5)
    ctx.fillStyle = '#e07020'
    ctx.beginPath()
    ctx.ellipse(x, y - 4 - fl, 5, 8 + fl * 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd050'
    ctx.beginPath()
    ctx.ellipse(x, y - 3 - fl, 2.5, 4.5 + fl, 0, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 3; i++) {
        const sp = (tick * 0.7 + i * 13) % 30
        ctx.fillStyle = `rgba(255,${Math.max(0, 140 - sp * 3)},60,${Math.max(0, 0.5 - sp / 60).toFixed(2)})`
        ctx.fillRect(x - 3 + ((hash(c * 5 + i) - 0.5) * 8), y - 10 - sp, 2, 2)
    }
}

// ---- portcullis over a gate column: bars lift into the ceiling ---------------
function drawGate(ctx, c, lowRow, open) {
    const span = (lowRow + 1) * T
    const vis = span * (1 - Math.min(1, open))
    if (vis < 3) return
    const x = c * T
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 0, T, lowRow * T + vis)
    ctx.clip()
    ctx.fillStyle = '#2c2c3c'
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 10, 0, 4, lowRow * T + vis)
    ctx.fillStyle = '#242434'
    ctx.fillRect(x + 2, lowRow * T + vis - 4, T - 4, 4)
    ctx.restore()
}

// ---- chomper jaws: teeth rise from the floor, a blade drops from the ceiling -
function drawChomp(ctx, ch, tick) {
    const down = chompDown({ tick }, ch)
    const ph = (tick + ch.phase) % CFG.chompPeriod
    let k = 0
    if (ph >= CFG.chompWait) k = Math.min(1, (ph - CFG.chompWait) / CFG.chompDrop)
    if (down && ph >= CFG.chompWait + CFG.chompDrop) k = 1
    if (k <= 0) return
    const x = ch.c * T, y = ch.r * T
    ctx.fillStyle = '#9aa2b0'
    const th = (T - 4) * k
    for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * 8
        ctx.beginPath()
        ctx.moveTo(sx, y + T)
        ctx.lineTo(sx + 3, y + T - 6 - th)
        ctx.lineTo(sx + 6, y + T)
        ctx.fill()
    }
    const bh = (ch.r * T) * k * 0.9
    ctx.fillStyle = '#7f8794'
    for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * 8
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx + 3, bh)
        ctx.lineTo(sx + 6, 0)
        ctx.fill()
    }
}

// ---- flasks and the sword on the floor ----------------------------------------
const FLASK_INK = { r: '#e04040', '+': '#ff6050', b: '#4080e0', f: '#80d0ff', u: '#c060e0' }
function drawFlask(ctx, pot, tick) {
    const x = (pot.c + 0.5) * T, y = (pot.r + 1) * T
    const bob = Math.sin(tick * 0.1 + pot.c) * 1
    ctx.fillStyle = '#2a2a3c'
    ctx.fillRect(x - 7, y - 12 + bob, 14, 12)
    ctx.fillStyle = FLASK_INK[pot.type] || '#e04040'
    ctx.beginPath()
    ctx.moveTo(x, y - 14 + bob)
    ctx.lineTo(x + 6, y - 2 + bob)
    ctx.lineTo(x - 6, y - 2 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c8ccd8'
    ctx.fillRect(x - 2, y - 18 + bob, 4, 5)
}

function drawSwordPickup(ctx, sw, tick) {
    const x = (sw.c + 0.5) * T, y = (sw.r + 1) * T
    const gl = 0.6 + 0.4 * Math.sin(tick * 0.12)
    ctx.strokeStyle = `rgba(240,244,255,${gl.toFixed(2)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 10, y - 4)
    ctx.lineTo(x + 10, y - 12)
    ctx.stroke()
    ctx.strokeStyle = '#d8b040'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 8, y - 10)
    ctx.lineTo(x - 4, y - 4)
    ctx.stroke()
}

// ---- the magic mirror: arched gold frame, rippling glass ---------------------
function drawMirror(ctx, m, tick) {
    const x = (m.c + 0.5) * T, base = (m.r + 1) * T
    ctx.fillStyle = '#6a5220'
    ctx.beginPath()
    ctx.moveTo(x - 13, base)
    ctx.lineTo(x - 13, base - 64)
    ctx.arc(x, base - 64, 13, Math.PI, 0)
    ctx.lineTo(x + 13, base)
    ctx.closePath()
    ctx.fill()
    const grad = ctx.createLinearGradient(x - 9, base - 74, x + 9, base)
    grad.addColorStop(0, '#3a4a6e')
    grad.addColorStop(0.5, '#7a92c8')
    grad.addColorStop(1, '#26304a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 9, base - 2)
    ctx.lineTo(x - 9, base - 64)
    ctx.arc(x, base - 64, 9, Math.PI, 0)
    ctx.lineTo(x + 9, base - 2)
    ctx.closePath()
    ctx.fill()
    const sh = ((tick * 0.6) % 90) - 20
    ctx.strokeStyle = 'rgba(220,230,255,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 8, base - 6 - sh)
    ctx.lineTo(x + 2, base - 16 - sh)
    ctx.moveTo(x - 8, base - 14 - sh)
    ctx.lineTo(x + 6, base - 28 - sh)
    ctx.stroke()
    ctx.fillStyle = '#e8d060'
    ctx.fillRect(x - 2, base - 82, 4, 5)
}

// ---- the princess's mouse -------------------------------------------------------
function drawMouse(ctx, m, tick) {
    const x = m.x, y = m.y
    const hop = Math.abs(Math.sin(tick * 0.35)) * 2
    ctx.fillStyle = '#9a9aa8'
    ctx.beginPath()
    ctx.ellipse(x, y - 5 - hop, 8, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 6 * m.dir, y - 7 - hop, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 4 * m.dir, y - 11 - hop, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#9a9aa8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - 8 * m.dir, y - 6 - hop)
    ctx.quadraticCurveTo(x - 14 * m.dir, y - 10 - hop + Math.sin(tick * 0.3) * 2, x - 16 * m.dir, y - 4 - hop)
    ctx.stroke()
    ctx.fillStyle = '#1a1a26'
    ctx.beginPath()
    ctx.arc(x + 7.5 * m.dir, y - 7.5 - hop, 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#d0d0dc'
    ctx.lineWidth = 0.7
    for (const wy of [-8, -6]) {
        ctx.beginPath(); ctx.moveTo(x + 8 * m.dir, y + wy - hop); ctx.lineTo(x + 12 * m.dir, y + wy - 1 - hop); ctx.stroke()
    }
}

// ---- figure -------------------------------------------------------------------
// origin = feet (x, y). Two-segment legs: thigh from the hip, shin from the
// knee. Angles: 0 = straight down, + toward the facing direction.
function limb(ctx, x, y, ang, len, w, col) {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(ang) * len, y + Math.cos(ang) * len)
    ctx.stroke()
}

function leg2(ctx, hx, hy, t, k, len, w, col) {
    const kx = hx + Math.sin(t) * len
    const ky = hy + Math.cos(t) * len
    limb(ctx, hx, hy, t, len, w, col)
    limb(ctx, kx, ky, t - k, len, w - 1, col)
    ctx.fillStyle = col
    ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3)
}

function figure(ctx, st, p, opts) {
    const f = p.facing
    const t = opts.tick
    const skin = opts.skin, cloth = opts.cloth, trim = opts.trim
    const pose = opts.pose || poseOf(st, opts.frame || 0)
    const wide = opts.wide || 1
    const hip = pose.hip
    const head = hip + 24
    const thigh = hip * 0.55
    const armLen = 15
    const bob = pose.bob + (opts.dieBob || 0)
    const lean = pose.lean + (opts.dieLean || 0)
    let swordOut = opts.sword
    if (p.hang) swordOut = false
    if (opts.die > 0 && st.startsWith('die')) swordOut = false

    ctx.save()
    ctx.translate(p.x, p.y + bob)
    ctx.scale(f, 1)
    ctx.rotate(lean)

    // far leg first (shaded), near leg after the torso
    leg2(ctx, 0, -hip, pose.tB, pose.kB, thigh, 5, shade(cloth))
    if (opts.robe) {
        const sway = Math.sin(t * 0.18) * 3
        ctx.fillStyle = cloth
        ctx.beginPath()
        ctx.moveTo(-6 * wide, -hip)
        ctx.lineTo(-10 * wide, 2 + sway)
        ctx.lineTo(10 * wide, 2 - sway)
        ctx.lineTo(6 * wide, -hip)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = trim
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-10 * wide, 2 + sway); ctx.lineTo(10 * wide, 2 - sway)
        ctx.stroke()
    }
    leg2(ctx, 0, -hip, pose.tA, pose.kA, thigh, 5, cloth)

    // torso (the fat guard gets a belly), trim sash across it
    ctx.strokeStyle = cloth
    ctx.lineWidth = 9 * wide
    ctx.beginPath()
    ctx.moveTo(0, -hip)
    ctx.lineTo(2, -head + 10)
    ctx.stroke()
    if (wide > 1) {
        ctx.fillStyle = cloth
        ctx.beginPath()
        ctx.ellipse(1, -hip + 4, 8 * wide, 9, 0, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.strokeStyle = trim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-3, -hip - 4)
    ctx.lineTo(5, -hip - 10)
    ctx.stroke()

    // back arm
    limb(ctx, 2, -head + 12, pose.armB, armLen, 4, shade(cloth))

    // head: skin + turban (wrapped, with a tail); skeletons get a bone skull
    if (opts.bone) {
        ctx.fillStyle = skin
        ctx.beginPath()
        ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#2a2a30'
        ctx.fillRect(1, -head + 2, 3, 3)
        ctx.fillRect(6, -head + 2, 3, 3)
        ctx.fillRect(3, -head + 7, 4, 2)
        ctx.strokeStyle = '#9a9a8c'
        ctx.lineWidth = 2
        for (let i = 0; i < 3; i++) {
            ctx.beginPath()
            ctx.moveTo(-3, -hip - 2 - i * 5)
            ctx.lineTo(6, -hip - 2 - i * 5)
            ctx.stroke()
        }
    } else {
        ctx.fillStyle = skin
        ctx.beginPath()
        ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = opts.turban || trim
        ctx.fillRect(-4, -head + 1, 13, 4)
        ctx.beginPath()
        ctx.arc(3, -head + 2, 6.5, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(-2, -head - 2, 10, 3)
        ctx.strokeStyle = opts.turban || trim
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(-4, -head + 3)
        ctx.quadraticCurveTo(-12, -head + 6 + Math.sin(t * 0.2) * 2, -14, -head + 12)
        ctx.stroke()
    }
    if (opts.hat) {
        ctx.fillStyle = '#1a1026'
        ctx.beginPath()
        ctx.moveTo(-3, -head - 1)
        ctx.lineTo(3, -head - 19)
        ctx.lineTo(9, -head - 1)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#d24ad2'
        ctx.fillRect(-1, -head - 4, 8, 2)
    }

    // sword arm: sheathed at the hip, drawing, or a timing arc through a strike
    const shY = -head + 12
    if (!swordOut) {
        if (opts.sheath) {
            ctx.strokeStyle = '#6a6a80'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.moveTo(-2, -hip + 2)
            ctx.lineTo(-12, -hip + 14)
            ctx.stroke()
            limb(ctx, 2, shY, st === 'sheathe' ? 1.1 : pose.armB, armLen * 0.8, 4, skin)
        }
        ctx.restore()
        return
    }
    let swing = 0
    if (opts.swing > 0) {
        const k = 1 - opts.swing / CFG.strikeDur
        swing = k < 0.3 ? 0.9 * (k / 0.3) : 0.9 - 2.1 * Math.min(1, (k - 0.3) / 0.35)
    }
    if (st === 'windup') swing = -0.9
    if (st === 'strike') swing = pose.armB > 0 ? 1.3 : 0.4
    const swordAng = (st === 'block' ? -1.5 : -0.9) + swing
    let armA = st === 'block' ? -1.3 : pose.armB
    if (st === 'draw') armA = pose.armB > 0.5 ? -0.1 : 0.9
    ctx.strokeStyle = opts.swing > 0 ? '#ffffff' : shade(cloth)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(2, shY)
    const hxp = 2 + Math.sin(armA + 0.9) * 12
    const hyp = shY - Math.cos(armA + 0.9) * 12 + 4
    ctx.lineTo(hxp, hyp)
    ctx.stroke()
    const biting = opts.swing > 0 && opts.swing <= CFG.strikeDur - CFG.strikeHit0
    ctx.strokeStyle = biting ? '#fff8d8' : (opts.swordMetal || '#c8ccd8')
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hxp, hyp)
    ctx.lineTo(hxp + Math.sin(swordAng) * 26, hyp - Math.cos(swordAng) * 26)
    ctx.stroke()
    ctx.fillStyle = '#d8b040'
    ctx.fillRect(hxp - 2, hyp - 2, 4, 4)
    ctx.restore()
}

// ---- the scene -----------------------------------------------------------------
export function drawScene(ctx, g, opts = {}) {
    const { attract = false } = opts
    const tick = g.tick
    const grad = ctx.createLinearGradient(0, 0, 0, VH)
    grad.addColorStop(0, '#0b0b16')
    grad.addColorStop(1, '#16162a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, VW, VH)

    const lvl = g.level
    const camX = g.room * RW * T
    ctx.save()
    if (g.shake > 0) ctx.translate((hash(tick * 3) - 0.5) * g.shake, (hash(tick * 7) - 0.5) * g.shake)
    ctx.save()
    ctx.translate(-camX, 0)
    if (g.p.flip > 0) {
        ctx.translate(camX + VW / 2, VH / 2)
        ctx.rotate(Math.PI)
        ctx.translate(-(camX + VW / 2), -VH / 2)
    }

    if (lvl.theme === 'palace') palaceWall(ctx, g.room * RW, lvl.deco.slice(g.room, g.room + 1), tick)

    const c0 = g.room * RW, c1 = c0 + RW
    for (let r = 0; r < H; r++) for (let c = c0; c < c1; c++) {
        const code = lvl.grid[r * lvl.W + c]
        if (code === 0 || code === TORCH) continue
        if (code === GATE) continue
        if (code === LOOSE && g.fallen[r * lvl.W + c]) continue
        if (code === SOLID && lvl.chomps.some((ch) => ch.c === c && ch.r === r)) {
            stone(ctx, c, r, SOLID, g)
            drawChomp(ctx, { ...lvl.chomps.find((ch) => ch.c === c && ch.r === r), r }, tick)
            continue
        }
        stone(ctx, c, r, code, g)
    }
    for (let c = c0; c < c1; c++) {
        let lowRow = -1
        for (let r = 0; r < H; r++) if (lvl.grid[r * lvl.W + c] === GATE) lowRow = r
        if (lowRow >= 0) drawGate(ctx, c, lowRow, g.gateOpen[g.room])
    }
    for (const k in g.loose) {
        if (g.fallen[k]) continue
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        ctx.save()
        ctx.translate((hash(tick * 5 + Number(k)) - 0.5) * 3, (hash(tick * 11 + Number(k)) - 0.5) * 2)
        stone(ctx, c, r, LOOSE, g)
        ctx.restore()
    }
    for (const k in g.fallen) {
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        const x = c * T, y = (r + 1) * T
        ctx.fillStyle = '#4c4c60'
        ctx.beginPath()
        ctx.moveTo(x + 2, y)
        ctx.lineTo(x + 9, y - 7)
        ctx.lineTo(x + 18, y - 4)
        ctx.lineTo(x + 28, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#34344a'
        ctx.fillRect(x + 8, y - 3, 10, 3)
    }
    for (let r = 0; r < H; r++) for (let c = c0; c < c1; c++) {
        if (lvl.grid[r * lvl.W + c] === TORCH) {
            drawTorch(ctx, c, r, tick)
            lightPool(ctx, c * T + T / 2, r * T + 8, Math.sin(tick * 0.2 + c))
        }
    }
    // a room without torches is darker
    if (!lvl.torches.some((tc) => tc.c >= c0 && tc.c < c1)) {
        ctx.fillStyle = 'rgba(0,0,8,0.32)'
        ctx.fillRect(c0 * T, 0, RW * T, VH)
    }

    if (!g.sword && lvl.sword) drawSwordPickup(ctx, lvl.sword, tick)
    for (const pot of g.pots) if (!pot.taken) drawFlask(ctx, pot, tick)

    // planks the eyes could not see, once the feet found them
    for (const k in g.bridgeSeen) {
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        const x = c * T, y = (r + 1) * T
        ctx.fillStyle = '#5a4a34'
        ctx.fillRect(x, y - 4, T, 4)
        ctx.fillStyle = '#3c3022'
        ctx.fillRect(x + 6, y - 3, 2, 2)
        ctx.fillRect(x + 22, y - 3, 2, 2)
    }
    // the magic mirror (and its far side, shimmering faintly)
    if (lvl.mirror && lvl.mirror.room === g.room) drawMirror(ctx, lvl.mirror, tick)
    if (lvl.mirrorTo && lvl.mirrorTo.room === g.room && !g.mirrorUsed) {
        ctx.fillStyle = 'rgba(120,146,200,0.12)'
        ctx.fillRect(lvl.mirrorTo.c * T, (lvl.mirrorTo.r - 2) * T, T, T * 3)
    }
    // the princess's mouse, hurrying to the button
    if (g.mouse && g.mouse.room === g.room) drawMouse(ctx, g.mouse, tick)

    // the shadow — your own silhouette, repeating you a little too late
    if (g.shadow && (!g.shadow.dead || g.shadow.dieT < 72)) {
        const s = g.shadow
        const sc = Math.floor(s.x / T)
        if (sc >= c0 - 1 && sc < c1 + 1) {
            ctx.save()
            if (s.dead) ctx.globalAlpha = Math.max(0, 1 - s.dieT / 72)
            const glow = ctx.createRadialGradient(s.x, s.y - 24, 2, s.x, s.y - 24, 30)
            glow.addColorStop(0, 'rgba(80,60,140,0.25)')
            glow.addColorStop(1, 'rgba(80,60,140,0)')
            ctx.fillStyle = glow
            ctx.fillRect(s.x - 30, s.y - 54, 60, 60)
            const sframe = s.anim.startsWith('die') ? Math.min(2, Math.floor(s.dieT / 12)) : Math.floor(tick * 0.42)
            figure(ctx, s.anim, { x: s.x, y: s.y, facing: s.facing, onGround: s.onGround, hang: null, crouch: false },
                {
                    tick, frame: sframe, skin: '#2e2e3e', cloth: '#14141e', trim: '#32324a',
                    turban: '#1e1e2c', sword: false, sheath: false, swing: 0, hurt: 0,
                    die: s.dead ? s.dieT : 0, prog: 0,
                })
            if (!s.dead) {
                ctx.fillStyle = '#9090e0'
                ctx.fillRect(s.x + s.facing * 3 - 1, s.y - CFG.PH + 4, 2, 2)
                ctx.fillRect(s.x + s.facing * 7 - 1, s.y - CFG.PH + 4, 2, 2)
            }
            ctx.restore()
        }
    }

    // princess in the doorway once the boss has fallen
    if (lvl.needBoss && g.guards.every((q) => !q.boss || q.dead) && lvl.exit && lvl.exit.room === g.room) {
        const px = lvl.exit.c * T + 8
        const py = (lvl.exit.r + 1) * T
        figure(ctx, 'idle', { x: px - 14, y: py, facing: 1, onGround: true, hang: null, crouch: false },
            { tick, skin: '#e0b090', cloth: '#b04a8a', trim: '#e8d060', sword: false, swing: 0, hurt: 0, die: 0, prog: 0 })
    }

    // guards
    for (const gd of g.guards) {
        if (gd.dead || gd.room !== g.room) continue
        const look = guardLook(gd.type, gd.boss)
        const style = GUARD_STYLE[gd.type] || GUARD_STYLE.green
        const st = gd.wind > 0 ? (gd.wind > gd.windT - CFG.guardHit0 ? 'windup' : 'strike')
            : gd.recoil > 0 ? 'recoil' : gd.engaged ? 'ready' : gd.anim === 'advance' ? 'walk' : 'patrol'
        const swing = gd.wind > 0 && gd.wind <= gd.windT - CFG.guardHit0 ? style.windT - gd.wind : 0
        const frame = gd.wind > 0 ? Math.floor((gd.windT - gd.wind) / 6) : Math.floor(tick / 8)
        figure(ctx, st === 'patrol' ? 'walk' : st, { x: gd.x, y: gd.y, facing: gd.dir || -1, onGround: true, hang: null, crouch: false },
            {
                tick: tick + gd.id * 13, frame, skin: look.skin, cloth: look.cloth, trim: look.trim,
                turban: look.turban, bone: look.bone, wide: look.wide || 1,
                swordMetal: look.sword, robe: look.robe, hat: look.hat,
                sword: true, sheath: false, swing, hurt: gd.hurtT, die: 0, prog: 0,
            })
        if (gd.wind > 0 && gd.wind % 6 < 3) {
            ctx.fillStyle = '#ff5050'
            ctx.beginPath()
            ctx.arc(gd.x, gd.y - CFG.PH - 6, 2.5, 0, Math.PI * 2)
            ctx.fill()
        }
        if (gd.engaged) {
            const w = 26
            ctx.fillStyle = '#20202e'
            ctx.fillRect(gd.x - w / 2, gd.y - CFG.PH - 14, w, 3)
            ctx.fillStyle = gd.boss ? '#d040d0' : (look.turban || '#c04040')
            ctx.fillRect(gd.x - w / 2, gd.y - CFG.PH - 14, w * (gd.hp / gd.maxHp), 3)
        }
    }

    // the prince
    if (g.status !== 'lost' && !(g.status === 'dying' && g.p.dieT % 8 < 4 && g.p.anim !== 'die_impale')) {
        const p = g.p
        const dying = g.status === 'dying'
        const st = p.anim || 'idle'
        const gaitFrame = st === 'run' ? Math.floor(tick * 0.42)
            : st === 'walk' ? Math.floor(tick * 0.26)
                : st === 'careful' ? Math.floor(tick * 0.14)
                    : st === 'climb' ? Math.min(POSES.climb.length - 1, Math.floor((p.climb / CFG.climbT) * POSES.climb.length))
                        : st === 'hang' || st === 'shimmy' ? Math.floor(tick * 0.07)
                            : Math.floor(tick * 0.25)
        const opts = {
            tick, skin: '#e0b898', cloth: '#e8e8f0', trim: '#c03028',
            sword: g.sword && (p.atk > 0 || p.block || p.duelDrawn),
            sheath: g.sword && !(p.atk > 0 || p.block || p.duelDrawn),
            swing: p.atk, hurt: p.hurtT, die: dying ? p.dieT : 0,
            prog: p.climb / CFG.climbT, crouch: p.crouch,
            frame: st.startsWith('die') ? Math.min(2, Math.floor(p.dieT / 12)) : gaitFrame,
        }
        if (st === 'die_slice') {
            // the jaws' mark: two halves parting where the blade met
            const gap = 2 + p.dieT * 0.12
            for (const half of [0, 1]) {
                ctx.save()
                ctx.beginPath()
                ctx.rect(p.x + (half ? 1 : -40), 0, 40, VH)
                ctx.clip()
                const q = { ...p, x: p.x + (half ? gap : -gap) }
                figure(ctx, 'die_slice', q, { ...opts, dieLean: half ? 0.12 : -0.05 })
                ctx.restore()
            }
            ctx.fillStyle = '#8a1818'
            ctx.fillRect(p.x - 3, p.y - 34 + p.dieT * 0.2, 6, Math.min(20, p.dieT * 0.5))
        } else {
            figure(ctx, st, p, opts)
        }
        if (st === 'die_impale') {
            ctx.fillStyle = '#8a1818'
            ctx.fillRect(p.x + 2, p.y - 26, 4, 8)
            for (let i = 0; i < 3; i++) {
                const d = (p.dieT + i * 9) % 26
                ctx.fillRect(p.x + 3 + (i - 1) * 2, p.y - 18 + d, 2, 3)
            }
        }
        if (st === 'die_cut') {
            for (let i = 0; i < 2; i++) {
                const d = (p.dieT + i * 7) % 20
                ctx.fillStyle = '#8a1818'
                ctx.fillRect(p.x - 6 + i * 8, p.y - 22 + d, 2, 3)
            }
        }
        if (p.lev > 0 && tick % 6 < 3) {
            ctx.fillStyle = 'rgba(120,220,255,0.5)'
            ctx.fillRect(p.x - 10, p.y - 2 + Math.sin(tick * 0.3) * 2, 20, 2)
        }
        if (p.hang) {
            ctx.fillStyle = '#e0b898'
            const hy = p.hang.r * T
            ctx.fillRect(p.x + (p.hang.side > 0 ? CFG.HW - 2 : -CFG.HW - 2) - 2, hy - 2, 4, 4)
        }
    }

    ctx.restore()
    ctx.restore()

    drawHUD(ctx, g, attract)
}

// ---- HUD: health as little flasks, bottom-left; guard's flasks bottom-right --
function flasks(ctx, x, y, n, max, dir) {
    for (let i = 0; i < max; i++) {
        const fx = x + dir * i * 13
        ctx.fillStyle = '#20202e'
        ctx.fillRect(fx - 5, y, 10, 10)
        ctx.fillStyle = i < n ? '#e04040' : '#3a2230'
        ctx.beginPath()
        ctx.moveTo(fx, y - 2)
        ctx.lineTo(fx + 4, y + 8)
        ctx.lineTo(fx - 4, y + 8)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#c8ccd8'
        ctx.fillRect(fx - 1, y - 5, 2, 3)
    }
}

function drawHUD(ctx, g, attract) {
    ctx.fillStyle = 'rgba(8,8,16,0.72)'
    ctx.fillRect(0, 0, VW, 22)
    ctx.strokeStyle = '#2e2e46'
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(VW, 22); ctx.stroke()
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8ab0'
    if (g.level) ctx.fillText(`ROOM ${g.room + 1}/${g.level.nRooms}`, 10, 14)
    if (g.sword) { ctx.fillStyle = '#c8ccd8'; ctx.fillText('⚔', 74, 15) }
    ctx.textAlign = 'center'
    ctx.fillStyle = '#8a8ab0'
    ctx.fillText(g.level ? g.level.name : '', VW / 2, 14)
    ctx.textAlign = 'right'
    const secs = Math.ceil(g.clock / 60)
    ctx.fillStyle = secs <= 300 && Math.floor(g.tick / 15) % 2 === 0 ? '#ff5050' : '#e8d060'
    ctx.fillText(clockText(g), VW - 10, 14)

    const p = g.p
    if (p) flasks(ctx, 12, VH - 14, p.hp, p.maxHP, 1)
    const gd = g.guards.find((q) => !q.dead && q.room === g.room && q.engaged)
    if (gd) flasks(ctx, VW - 12, VH - 14, gd.hp, gd.maxHp, -1)
    if (g.p && g.p.lev > 0) { ctx.fillStyle = '#80d0ff'; ctx.textAlign = 'right'; ctx.fillText('SLOW-FALL', VW - 10, VH - 22) }
    if (g.p && g.p.flip > 0) { ctx.fillStyle = '#c060e0'; ctx.textAlign = 'right'; ctx.fillText('UPSIDE-DOWN', VW - 10, VH - 22) }
    if (g.cpReached && g.level && g.level.checkpoint) { ctx.fillStyle = '#80e0a0'; ctx.textAlign = 'left'; ctx.fillText('CHECKPOINT', 10, 34) }
    void attract
}
