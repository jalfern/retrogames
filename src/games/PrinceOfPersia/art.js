// PRINCE OF PERSIA — every pixel generated in code. The dungeon as the 1989
// game looks at it: blue-grey cut stone with mortar grain, floors that read as
// ledges (lit top, dark front face), torches that pool trembling light on the
// wall, rooms without torches sunk into shadow. The prince is most of a floor
// tall, weighted, eight-frame run, separate skid / crouch / land / hang / climb
// / block poses, sword drawn only when there is steel to meet. The HUD is the
// row of little flasks. Portcullis bars lift into the ceiling, chomper jaws
// snap between pillars, loose tiles crack, stay and pile into rubble. No assets.

import { RW, H, T, SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, DROP, EXITPLATE, TORCH, EXIT, SWORD, POTION } from './levels.js'
import { CFG, chompDown, clockText } from './sim.js'

export const VW = RW * T
export const VH = H * T

// per-guard-type look: tunic, trim, skin, sword metal. Jaffar adds a robe + hat.
export const PALETTES = {
    green: { cloth: '#2a5038', trim: '#70a080', skin: '#c89878', sword: '#c8ccd8' },
    fibula: { cloth: '#8a5a2a', trim: '#d0a860', skin: '#d8a880', sword: '#dce2ee' },
    skeleton: { cloth: '#d8d8cc', trim: '#9a9a8c', skin: '#eceada', sword: '#b0b8c8' },
    shadow: { cloth: '#16161f', trim: '#3a3a4e', skin: '#5a5a6a', sword: '#525a6a' },
    jaffar: { cloth: '#5a1f72', trim: '#d24ad2', skin: '#c89878', sword: '#e0d0ff', robe: true, hat: true },
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

// ---- tiles --------------------------------------------------------------------
// floors read as ledges: a lit top edge and a dark front face under it
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
}

// ---- portcullis over a gate column: bars lift into the ceiling ---------------
function drawGate(ctx, c, lowRow, open, tick) {
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
    void tick
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

// ---- figure -------------------------------------------------------------------
// origin = feet (x, y). Angles: 0 = straight down, + toward the facing dir.
function limb(ctx, x, y, ang, len, w, col) {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(ang) * len * 1.0, y + Math.cos(ang) * len)
    ctx.stroke()
}

const q8 = (t, sp) => (Math.floor(t * sp) % 8) / 8 * Math.PI * 2

function figure(ctx, st, p, opts) {
    const f = p.facing
    const t = opts.tick
    const skin = opts.skin, cloth = opts.cloth, trim = opts.trim
    let lean = 0, bob = 0, hip = 18, head = 44, legLen = 18
    let legA = 0.12, legB = -0.12, armB = -0.3, armF = null
    let swordAng = -0.9, swordOut = opts.sword
    if (opts.crouch) { hip = 12; head = 30; legLen = 12 }
    if (p.hang) {
        const lift = Math.max(10, p.y - p.hang.r * T)
        legA = 0.35; legB = -0.15
        legLen = 16
        hip = Math.min(30, lift * 0.55)
        armB = -0.12 - lift / 24
        swordOut = false
        bob = Math.sin(t * 0.09) * 1.5
    }
    if (st === 'climb') {
        armB = -0.2
        legA = 0.7; legB = -0.5
        hip = 12 + (1 - opts.prog) * 14
        bob = -(opts.prog * 10)
        legLen = 14 + opts.prog * 4
    }
    if (st === 'walk' || st === 'run') {
        const sp = st === 'run' ? 0.38 : 0.26
        const ph = q8(t, st === 'run' ? 0.3 : 0.22)
        legA = Math.sin(ph) * sp + 0.05
        legB = -Math.sin(ph) * sp + 0.05
        armB = Math.sin(ph) * 0.3 - 0.3
        bob = -Math.abs(Math.sin(ph)) * (st === 'run' ? 3 : 1.5)
        lean = st === 'run' ? 0.16 : 0.06
    }
    if (st === 'skid') { lean = -0.22; legA = 0.4; legB = -0.5; armB = 0.5 }
    if (st === 'jump') { legA = 0.5; legB = -0.6; armB = 0.4; lean = 0.1 }
    if (st === 'fall') { legA = 0.25; legB = -0.35; armB = 0.6 }
    if (st === 'land') { hip = 12; head = 30; legLen = 12; legA = 0.35; legB = -0.35; lean = 0.12 }
    if (st === 'shimmy') { armB = -0.15; legA = 0.4 * Math.sin(t * 0.3); legB = -0.2 }
    if (st === 'crouch') { hip = 12; head = 30; legLen = 12 }
    if (st === 'block') { armF = -1.35; swordAng = -1.5; lean = -0.05 }
    if (opts.hurt > 0) { lean = -0.3 * f; armB = 0.7 }
    if (opts.die > 0) {
        const k = Math.min(1, opts.die / 40)
        lean = -1.4 * k
        bob = 14 * k
        legA = 0.9; legB = 0.3
        swordOut = false
    }

    ctx.save()
    ctx.translate(p.x, p.y + bob)
    ctx.scale(f, 1)
    ctx.rotate(lean)

    const hx = 0, hy = -hip
    limb(ctx, hx, hy, legA, legLen, 5, cloth)
    limb(ctx, hx, hy, legB, legLen, 5, shade(cloth))
    if (opts.robe) {
        const sway = Math.sin(t * 0.18) * 3
        ctx.fillStyle = cloth
        ctx.beginPath()
        ctx.moveTo(-6, hy)
        ctx.lineTo(-9, 2 + sway)
        ctx.lineTo(9, 2 - sway)
        ctx.lineTo(6, hy)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = trim
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-9, 2 + sway); ctx.lineTo(9, 2 - sway)
        ctx.stroke()
    }
    ctx.strokeStyle = cloth
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(0, hy)
    ctx.lineTo(2, -head + 10)
    ctx.stroke()
    ctx.strokeStyle = trim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-3, hy - 4)
    ctx.lineTo(5, hy - 10)
    ctx.stroke()
    limb(ctx, 2, -head + 12, armB, 16, 4, shade(cloth))

    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = trim
    ctx.fillRect(-4, -head + 1, 13, 4)
    ctx.beginPath()
    ctx.arc(3, -head + 2, 6.5, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = trim
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-4, -head + 3)
    ctx.quadraticCurveTo(-12, -head + 6 + Math.sin(t * 0.2) * 2, -14, -head + 12)
    ctx.stroke()
    if (opts.hat) {
        ctx.fillStyle = trim
        ctx.beginPath()
        ctx.moveTo(-3, -head - 1)
        ctx.lineTo(3, -head - 17)
        ctx.lineTo(9, -head - 1)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#f0e0a0'
        ctx.fillRect(-1, -head - 2, 8, 2)
    }

    // sword arm: sheathed at the hip, or a timing arc through a strike
    const shY = -head + 12
    if (!swordOut) {
        if (opts.sheath) {
            ctx.strokeStyle = '#6a6a80'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.moveTo(-2, hy + 2)
            ctx.lineTo(-12, hy + 14)
            ctx.stroke()
        }
        ctx.restore()
        return
    }
    let swing = 0
    if (opts.swing > 0) {
        const k = 1 - opts.swing / CFG.strikeDur
        swing = k < 0.3 ? 0.9 * (k / 0.3) : 0.9 - 2.1 * Math.min(1, (k - 0.3) / 0.35)
    }
    const stAng = swordAng + swing
    if (armF !== null) armB = armF
    ctx.strokeStyle = opts.swing > 0 ? '#ffffff' : shade(cloth)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(2, shY)
    const hxp = 2 + Math.sin(stAng + 0.9) * 12
    const hyp = shY - Math.cos(stAng + 0.9) * 12 + 4
    ctx.lineTo(hxp, hyp)
    ctx.stroke()
    const biting = opts.swing > 0 && opts.swing <= CFG.strikeDur - CFG.strikeHit0
    ctx.strokeStyle = biting ? '#fff8d8' : (opts.swordMetal || '#c8ccd8')
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hxp, hyp)
    ctx.lineTo(hxp + Math.sin(stAng) * 26, hyp - Math.cos(stAng) * 26)
    ctx.stroke()
    ctx.fillStyle = '#d8b040'
    ctx.fillRect(hxp - 2, hyp - 2, 4, 4)
    ctx.restore()
}

// ---- the scene -----------------------------------------------------------------
export function drawScene(ctx, g, opts = {}) {
    const { attract = false } = opts
    const tick = g.tick
    // background (screen space, no shake — the dungeon shakes, the hour does not)
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
    // gates, lifted per room
    for (let c = c0; c < c1; c++) {
        let lowRow = -1
        for (let r = 0; r < H; r++) if (lvl.grid[r * lvl.W + c] === GATE) lowRow = r
        if (lowRow >= 0) drawGate(ctx, c, lowRow, g.gateOpen[g.room], tick)
    }
    // loose tiles still standing but trembling; fallen ones pile into rubble
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
        const st = gd.wind > 0 ? 'wind' : gd.recoil > 0 ? 'recoil' : gd.engaged ? 'ready' : gd.anim === 'advance' ? 'walk' : 'patrol'
        const swing = gd.wind > 0 && gd.wind <= CFG.guardWind - CFG.guardHit0 ? CFG.guardWind - gd.wind : 0
        figure(ctx, st === 'patrol' ? 'walk' : st === 'wind' ? 'idle' : st === 'recoil' ? 'skid' : st === 'ready' ? 'block' : 'walk',
            { x: gd.x, y: gd.y, facing: gd.dir || -1, onGround: true, hang: null, crouch: false },
            {
                tick: tick + gd.id * 13, skin: look.skin, cloth: look.cloth, trim: look.trim,
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
            ctx.fillStyle = gd.boss ? '#d040d0' : '#c04040'
            ctx.fillRect(gd.x - w / 2, gd.y - CFG.PH - 14, w * (gd.hp / gd.maxHp), 3)
        }
    }

    // the prince
    if (g.status !== 'lost' && !(g.status === 'dying' && g.p.dieT % 8 < 4)) {
        const p = g.p
        const dueling = g.guards.some((q) => !q.dead && q.room === g.room && Math.abs(q.x - p.x) < 8 * T && Math.abs(q.y - p.y) < 3 * T)
        figure(ctx, p.anim || 'idle', p, {
            tick, skin: '#e0b898', cloth: '#e8e8f0', trim: '#c03028',
            sword: g.sword && (p.atk > 0 || p.block || dueling),
            sheath: g.sword && !(p.atk > 0 || p.block || dueling),
            swing: p.atk, hurt: p.hurtT, die: g.status === 'dying' ? p.dieT : 0,
            prog: p.climb / CFG.climbT, crouch: p.crouch,
        })
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
