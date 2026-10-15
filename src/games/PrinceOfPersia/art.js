// PRINCE OF PERSIA — every pixel generated in code: EGA-palette stone with
// mortar grain, flickering torches that pool light on the wall, animated
// runners (walk/run/skid/jump/hang/climb/crouch/duel/hurt/die), spikes,
// portcullis bars, sparks, dust and the HUD. No assets.

import { W, H, SOLID, PLATFORM, LOOSE, SPIKE, SPIKE_PORTED, GATE, PLATE, TORCH, EXIT } from './levels.js'
import { CFG, portOpen, clockText } from './sim.js'

export const VW = W * CFG.T
export const VH = H * CFG.T

const hash = (n) => {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
}

function stone(ctx, c, r, code, g) {
    const T = CFG.T
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
    } else if (code === PLATFORM || code === LOOSE) {
        ctx.fillStyle = code === LOOSE ? '#6a5a44' : '#5e5e74'
        ctx.fillRect(x, y, T, 10)
        ctx.fillStyle = code === LOOSE ? '#7d6b50' : '#70708a'
        ctx.fillRect(x, y, T, 3)
        ctx.fillStyle = '#2a2a3c'
        ctx.fillRect(x, y + 9, T, 2)
        if (code === LOOSE) {
            ctx.strokeStyle = '#241d12'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x + 5, y + 1); ctx.lineTo(x + 12, y + 9)
            ctx.moveTo(x + 20, y + 2); ctx.lineTo(x + 17, y + 9)
            ctx.stroke()
        }
    } else if (code === SPIKE || code === SPIKE_PORTED) {
        const open = code === SPIKE ? 1 : (portOpen(g) ? 0 : 1)
        if (open <= 0) return
        ctx.fillStyle = '#20202e'
        ctx.fillRect(x, y + T - 6, T, 6)
        ctx.fillStyle = '#b8c0cc'
        const hh = 18 * open
        for (let i = 0; i < 4; i++) {
            const sx = x + 2 + i * 8
            ctx.beginPath()
            ctx.moveTo(sx, y + T - 5)
            ctx.lineTo(sx + 3, y + T - 5 - hh)
            ctx.lineTo(sx + 6, y + T - 5)
            ctx.fill()
        }
    } else if (code === GATE) {
        if (portOpen(g)) return
        ctx.fillStyle = '#2c2c3c'
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 10, y, 4, T)
        ctx.fillRect(x, y + T - 4, T, 4)
    } else if (code === PLATE) {
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 4, y + T - 8, T - 8, 6)
        const pressed = portOpen(g) && g.level.plates.some((pl) => pl.c === c && pl.r === r)
        ctx.fillStyle = pressed ? '#e8b04a' : '#8a8aa0'
        ctx.fillRect(x + 6, y + T - (pressed ? 4 : 7), T - 12, 3)
    } else if (code === EXIT) {
        ctx.fillStyle = '#15151f'
        ctx.fillRect(x + 2, y - T, T - 4, T * 2)
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
    const T = CFG.T
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

function figure(ctx, st, p, opts) {
    const f = p.facing
    const t = opts.tick
    const skin = opts.skin
    const cloth = opts.cloth
    const trim = opts.trim
    let lean = 0, bob = 0, hip = 18, head = 44
    let legA = 0.12, legB = -0.12, armB = -0.3, sword = opts.stance
    if (opts.crouch) { hip = 12; head = 30 }
    if (p.hang) {
        legA = 0.35; legB = -0.15
        armB = -2.9 * f
        hip = CFG.hangHand + 14
    }
    if (st === 'climb') {
        armB = -2.6 * f
        legA = 0.7; legB = -0.5
        bob = -Math.sin(opts.prog * Math.PI) * 6
    }
    if (st === 'walk' || st === 'run') {
        const sp = st === 'run' ? 0.38 : 0.26
        const ph = t * (st === 'run' ? 0.34 : 0.22)
        legA = Math.sin(ph) * sp + 0.05
        legB = -Math.sin(ph) * sp + 0.05
        armB = Math.sin(ph) * 0.3 - 0.3
        bob = -Math.abs(Math.sin(ph)) * (st === 'run' ? 3 : 1.5)
        lean = st === 'run' ? 0.16 : 0.06
    }
    if (st === 'jump') { legA = 0.5; legB = -0.6; armB = 0.4; lean = 0.1 }
    if (st === 'fall') { legA = 0.25; legB = -0.35; armB = 0.6 }
    if (st === 'shimmy') { armB = -2.6 * f; legA = 0.4 * Math.sin(t * 0.3); legB = -0.2 }
    if (opts.hurt > 0) { lean = -0.3 * f; armB = 0.7 }
    if (opts.die > 0) {
        const k = Math.min(1, opts.die / 40)
        lean = -1.4 * k
        bob = 14 * k
        legA = 0.9; legB = 0.3
    }

    ctx.save()
    ctx.translate(p.x, p.y + bob)
    ctx.scale(f, 1)
    ctx.rotate(lean)

    const hx = 0, hy = -hip
    // legs
    limb(ctx, hx, hy, legA, 18 - (opts.crouch ? 6 : 0), 5, cloth)
    limb(ctx, hx, hy, legB, 18 - (opts.crouch ? 6 : 0), 5, shade(cloth))
    // torso
    ctx.strokeStyle = cloth
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(0, hy)
    ctx.lineTo(2, -head + 10)
    ctx.stroke()
    // sash
    ctx.strokeStyle = trim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-3, hy - 4)
    ctx.lineTo(5, hy - 10)
    ctx.stroke()
    // back arm
    limb(ctx, 2, -head + 12, armB, 16, 4, shade(cloth))
    // head + turban
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = trim
    ctx.fillRect(-4, -head + 1, 13, 4)
    ctx.beginPath()
    ctx.arc(3, -head + 2, 6.5, Math.PI, Math.PI * 2)
    ctx.fill()
    // turban tail
    ctx.strokeStyle = trim
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-4, -head + 3)
    ctx.quadraticCurveTo(-12, -head + 6 + Math.sin(t * 0.2) * 2, -14, -head + 12)
    ctx.stroke()

    // sword arm + blade, by stance / swing progress
    const shY = -head + 12
    let swing = 0
    if (opts.swing > 0) {
        const total = CFG.swingDur
        const k = 1 - opts.swing / total
        swing = k < 0.35 ? -0.8 * (k / 0.35) : -0.8 + 1.9 * Math.min(1, (k - 0.35) / 0.3)
    }
    const stAng = [-1.15, -0.35, 0.5][sword] + swing
    const reach = opts.strong ? 1.18 : 1
    ctx.strokeStyle = opts.swing > 0 ? '#ffffff' : shade(cloth)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(2, shY)
    const hxp = 2 + Math.sin(stAng + 0.9) * 12
    const hyp = shY - Math.cos(stAng + 0.9) * 12 + 4
    ctx.lineTo(hxp, hyp)
    ctx.stroke()
    const bl = 26 * reach
    ctx.strokeStyle = opts.swing > 0 && opts.swing < CFG.swingDur - CFG.swingHit0 ? '#fff8d8' : '#c8ccd8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hxp, hyp)
    ctx.lineTo(hxp + Math.sin(stAng) * bl, hyp - Math.cos(stAng) * bl)
    ctx.stroke()
    ctx.fillStyle = '#d8b040'
    ctx.fillRect(hxp - 2, hyp - 2, 4, 4)
    ctx.restore()
}

const shade = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40)
    return `rgb(${r},${g},${b})`
}

// ---- the scene -----------------------------------------------------------------
export function drawScene(ctx, g, opts = {}) {
    const { attract = false } = opts
    const tick = g.tick
    ctx.save()
    if (g.shake > 0) ctx.translate((hash(tick * 3) - 0.5) * g.shake, (hash(tick * 7) - 0.5) * g.shake)

    const grad = ctx.createLinearGradient(0, 0, 0, VH)
    grad.addColorStop(0, '#0b0b16')
    grad.addColorStop(1, '#16162a')
    ctx.fillStyle = grad
    ctx.fillRect(-8, -8, VW + 16, VH + 16)

    const lvl = g.level
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const code = lvl.grid[r * W + c]
        if (code === 0) continue
        if (code === LOOSE && g.fallen[r * W + c]) continue
        if (code === TORCH) continue
        stone(ctx, c, r, code === PLATE ? PLATE : code, g)
    }
    // loose tiles still standing but trembling
    for (const k in g.loose) {
        if (g.fallen[k]) continue
        const c = Number(k % W), r = Number((k - c) / W)
        ctx.save()
        ctx.translate((hash(tick * 5 + Number(k)) - 0.5) * 3, (hash(tick * 11 + Number(k)) - 0.5) * 2)
        stone(ctx, c, r, LOOSE, g)
        ctx.restore()
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (lvl.grid[r * W + c] === TORCH) {
            drawTorch(ctx, c, r, tick)
            lightPool(ctx, c * CFG.T + CFG.T / 2, r * CFG.T + 8, Math.sin(tick * 0.2 + c))
        }
    }

    // princess in the throne-room doorway once Jaffar has fallen
    if (lvl.needBoss && g.guards.every((q) => !q.boss || q.dead) && lvl.exit) {
        const px = lvl.exit.c * CFG.T + 8
        const py = (lvl.exit.r + 1) * CFG.T
        figure(ctx, 'idle', { x: px - 14, y: py, facing: 1, onGround: true, hang: null, crouch: false },
            { tick, skin: '#e0b090', cloth: '#b04a8a', trim: '#e8d060', stance: 1, swing: 0, hurt: 0, die: 0, prog: 0, strong: false })
    }

    // guards
    for (const gd of g.guards) {
        if (gd.dead) continue
        const st = gd.wind > 0 ? 'wind' : gd.engaged ? 'ready' : 'patrol'
        figure(ctx, st === 'patrol' ? 'walk' : st, {
            x: gd.x, y: gd.y, facing: gd.dir || -1, onGround: true, hang: null, crouch: false,
        }, {
            tick: tick + gd.id * 13, skin: '#c89878', cloth: gd.boss ? '#502a68' : '#2a5038',
            trim: gd.boss ? '#d040d0' : '#70a080', stance: gd.stance,
            swing: gd.wind > CFG.guardWind - 4 ? gd.wind : 0, hurt: gd.hurtT, die: 0, prog: 0, strong: gd.boss,
        })
        if (gd.wind > 0 && gd.wind % 6 < 3) {
            ctx.fillStyle = '#ff5050'
            ctx.beginPath()
            ctx.arc(gd.x, gd.y - CFG.PH - 6, 2.5, 0, Math.PI * 2)
            ctx.fill()
        }
        if (gd.engaged && !gd.dead) {
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
        figure(ctx, p.anim || 'idle', p, {
            tick, skin: '#e0b898', cloth: '#e8e8f0', trim: '#c03028',
            stance: p.stance, swing: p.atk, hurt: p.hurtT, die: g.status === 'dying' ? p.dieT : 0,
            prog: p.climb / CFG.climbT, strong: p.strength, crouch: p.crouch,
        })
        if (p.lev > 0 && tick % 6 < 3) {
            ctx.fillStyle = 'rgba(120,220,255,0.5)'
            ctx.fillRect(p.x - 10, p.y - 2 + Math.sin(tick * 0.3) * 2, 20, 2)
        }
    }

    ctx.restore()

    drawHUD(ctx, g, attract)
}

function hearts(ctx, x, y, n, max) {
    for (let i = 0; i < max; i++) {
        ctx.fillStyle = i < n ? '#e04040' : '#3a2230'
        const hx = x + i * 16
        ctx.beginPath()
        ctx.moveTo(hx + 6, y + 10)
        ctx.lineTo(hx, y + 4); ctx.lineTo(hx + 3, y); ctx.lineTo(hx + 6, y + 3)
        ctx.lineTo(hx + 9, y); ctx.lineTo(hx + 12, y + 4)
        ctx.closePath(); ctx.fill()
    }
}

function drawHUD(ctx, g, attract) {
    ctx.fillStyle = 'rgba(8,8,16,0.75)'
    ctx.fillRect(0, 0, VW, 26)
    ctx.strokeStyle = '#2e2e46'
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(VW, 26); ctx.stroke()
    hearts(ctx, 10, 8, g.p ? g.p.hp : CFG.hearts, CFG.hearts)
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8ab0'
    ctx.fillText(`LIVES x${Math.max(0, g.lives)}`, 70, 18)
    ctx.textAlign = 'right'
    const secs = Math.ceil(g.clock / 60)
    ctx.fillStyle = secs <= 300 && Math.floor(g.tick / 15) % 2 === 0 ? '#ff5050' : '#e8d060'
    ctx.fillText(`TIME ${clockText(g)}`, VW - 10, 18)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#8a8ab0'
    ctx.fillText(g.level ? g.level.name : '', VW / 2, 18)
    if (g.p && g.p.strength) { ctx.fillStyle = '#d080e0'; ctx.textAlign = 'left'; ctx.fillText('STRENGTH', 150, 18) }
    if (g.p && g.p.lev > 0) { ctx.fillStyle = '#80d0ff'; ctx.textAlign = 'left'; ctx.fillText('LEVITATION', 230, 18) }
    void attract
}
