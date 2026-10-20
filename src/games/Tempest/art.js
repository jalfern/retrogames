// TEMPEST — art.js : everything drawn in glowing vector style, no assets.
// Tube geometry is resolution-free world math: an absolute perimeter position A
// at depth t (0 far, 1 near) projects onto the screen by angle around the
// vanishing point — the camera locks the player at screen-bottom, so the tube
// visually rotates as the ship slides along the rim.

export const W = 1024
export const H = 768
export const CX = 512
export const CY = 330
export const RN = 372 // near ring radius
export const RF = 44  // far ring radius

const TAU = Math.PI * 2

const hexRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function makeStars(seed) {
    let a = (seed * 0x9E3779B9) | 0
    const rnd = () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const stars = []
    while (stars.length < 130) {
        const x = rnd() * W
        const y = rnd() * H
        const d = Math.hypot(x - CX, y - CY)
        if (d < RN - 30 && d > RF + 8) continue
        stars.push({ x, y, b: 0.3 + rnd() * 0.7, tw: rnd() * 100 })
    }
    return stars
}

export function drawStars(ctx, stars, tick) {
    for (const s of stars) {
        ctx.globalAlpha = s.b * (0.7 + 0.3 * Math.sin((tick + s.tw) * 0.05))
        ctx.fillStyle = '#cfe2ff'
        ctx.fillRect(s.x, s.y, 1.5, 1.5)
    }
    ctx.globalAlpha = 1
}

const angAt = (g, A) => ((A - g.p) / g.faces) * TAU + Math.PI / 2
const radAt = (t) => RF + (RN - RF) * t

export function posAt(g, A, t) {
    const th = angAt(g, A)
    const r = radAt(t)
    return { x: CX + Math.cos(th) * r, y: CY + Math.sin(th) * r, s: r / RN }
}

const ringPt = (g, A, t) => posAt(g, A, t)

export function drawTube(ctx, g, tick, opts = {}) {
    const n = g.faces
    const step = Math.max(1, Math.round(n / 32))
    const hue = opts.hue || ['#3ae0ff', '#59ffb6', '#ffd053', '#ff7ce6'][Math.max(0, g.level - 1) % 4]
    const a = opts.alpha === undefined ? 1 : opts.alpha
    ctx.lineWidth = 1

    // radial edges
    ctx.strokeStyle = hue
    ctx.globalAlpha = 0.5 * a
    for (let i = 0; i < n; i += step) {
        const a0 = ringPt(g, i, 0)
        const a1 = ringPt(g, i, 1)
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke()
    }
    ctx.globalAlpha = a

    // deep-center glow: the far end breathes with the rim pulse
    const pulse = 0.55 + 0.45 * Math.sin(tick * 0.06)
    const [gr, gg, gb] = hexRgb(hue)
    const grad = ctx.createRadialGradient(CX, CY, 2, CX, CY, RF * 0.92)
    grad.addColorStop(0, `rgba(${gr},${gg},${gb},${0.16 * pulse * a})`)
    grad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`)
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(CX, CY, RF * 0.92, 0, Math.PI * 2); ctx.fill()

    // far ring
    ctx.strokeStyle = hue
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
        const p = ringPt(g, i, 0)
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    // ridge chevrons (diamond tubes): bulging mid-depth lines on alternating faces
    if (g.ridge) {
        ctx.globalAlpha = 0.65 * a
        for (let i = 0; i < n; i += 2) {
            ctx.beginPath()
            for (let k = 0; k <= 3; k++) {
                const A = i + (k / 3)
                const t = 0.5
                const th = angAt(g, A)
                const r = radAt(t) + 26 * Math.sin(Math.PI * (k / 3))
                const x = CX + Math.cos(th) * r
                const y = CY + Math.sin(th) * r
                if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
            }
            ctx.stroke()
        }
        ctx.globalAlpha = a
    }

    // near rim, brightest with glow
    ctx.save()
    ctx.shadowColor = hue
    ctx.shadowBlur = (10 + 3 * Math.sin(tick * 0.06)) * a
    ctx.strokeStyle = hue
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
        const p = ringPt(g, i, 1)
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 1
}

export function drawPlayer(ctx, g, tick, dead, hue = 0) {
    if (dead) return
    const th = angAt(g, g.p)
    const r = RN - 4
    const x = CX + Math.cos(th) * r
    const y = CY + Math.sin(th) * r
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(th + Math.PI / 2) // ship nose points down the tube
    const col = `hsl(${hue}, 90%, 65%)`
    ctx.strokeStyle = col
    ctx.fillStyle = col
    ctx.lineWidth = 2
    ctx.shadowColor = col
    ctx.shadowBlur = 8
    // classic twin-dart hull
    ctx.beginPath()
    ctx.moveTo(0, -13)
    ctx.lineTo(6, 2); ctx.lineTo(12, 8); ctx.lineTo(4, 5); ctx.lineTo(0, 9)
    ctx.lineTo(-4, 5); ctx.lineTo(-12, 8); ctx.lineTo(-6, 2)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath(); ctx.arc(0, -2, 2.2, 0, TAU); ctx.fill()
    ctx.restore()
}

export function drawEnemies(ctx, g, tick) {
    const n = g.faces
    const wrapN = (x) => ((x % n) + n) % n
    for (const e of g.enemies) {
        const p = posAt(g, e.A, e.t)
        const sc = Math.max(0.35, p.s)
        const band = p.s < 0.45 ? 0 : p.s < 0.75 ? 1 : 2
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.scale(sc, sc)
        ctx.lineWidth = 1.6
        if (e.type === 'flip') {
            // hinged to the shared radial edge: the hinge axis runs along the
            // edge line; the flap folds across it face-to-face as it crosses.
            const raw = wrapN(e.A)
            const edge = Math.round(raw) % n
            const side = raw >= Math.round(raw) ? 1 : -1
            const d = raw - Math.round(raw)
            const open = 1 - Math.cos(d * Math.PI) // 0 on the edge, 1 mid-face
            ctx.strokeStyle = '#ff5f5f'
            ctx.shadowColor = '#ff5f5f'; ctx.shadowBlur = 6
            const h0 = posAt(g, edge, Math.max(0.02, e.t - 0.05))
            const h1 = posAt(g, edge, Math.min(1, e.t + 0.05))
            ctx.beginPath(); ctx.moveTo(h0.x - p.x, h0.y - p.y); ctx.lineTo(h1.x - p.x, h1.y - p.y); ctx.stroke()
            if (band > 0) {
                const ap = posAt(g, edge + side * 0.55 * open, e.t)
                ctx.beginPath()
                ctx.moveTo(h0.x - p.x, h0.y - p.y); ctx.lineTo(ap.x - p.x, ap.y - p.y)
                ctx.lineTo(h1.x - p.x, h1.y - p.y)
                ctx.stroke()
                if (band > 1) {
                    const mx = (h0.x + h1.x) / 2 - p.x
                    const my = (h0.y + h1.y) / 2 - p.y
                    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ap.x - p.x, ap.y - p.y); ctx.stroke()
                }
            }
        } else if (e.type === 'pulse') {
            const rr = 6 + e.stage * 2.5
            const pulse = 1 + 0.25 * Math.sin(tick * 0.25)
            ctx.strokeStyle = '#c77dff'
            ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 8
            ctx.beginPath()
            ctx.moveTo(0, -rr * pulse); ctx.lineTo(rr * pulse, 0); ctx.lineTo(0, rr * pulse); ctx.lineTo(-rr * pulse, 0)
            ctx.closePath(); ctx.stroke()
            if (band > 0) {
                ctx.beginPath(); ctx.arc(0, 0, rr * 0.45, 0, Math.PI * 2); ctx.stroke()
                if (band > 1) {
                    const r2 = rr * 1.35 * pulse
                    ctx.beginPath(); ctx.moveTo(0, -r2); ctx.lineTo(0, r2); ctx.moveTo(-r2, 0); ctx.lineTo(r2, 0); ctx.stroke()
                }
            }
        } else {
            ctx.strokeStyle = e.diving ? '#ff6a3d' : '#7dff9a'
            ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 7
            if (band > 0) { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke() }
            else { ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.stroke() }
            if (band > 0) { ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.stroke() }
            if (band > 1) {
                const oa = tick * 0.18
                for (let k = 0; k < 3; k++) {
                    const a = oa + (k / 3) * Math.PI * 2
                    ctx.beginPath(); ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 1.4, 0, Math.PI * 2); ctx.stroke()
                }
            }
        }
        ctx.restore()
    }
}

export function drawBullets(ctx, g) {
    for (const b of g.bullets) {
        const len = b.super ? 0.18 : 0.1
        ctx.save()
        ctx.strokeStyle = b.super ? '#fff2a0' : '#a0eaff'
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = b.super ? 12 : 6
        const pts = []
        for (let k = 0; k < 4; k++) pts.push(posAt(g, b.A, Math.min(1, b.t + len * (k / 3))))
        ctx.lineWidth = b.super ? 2.6 : 1.8
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke()
        ctx.globalAlpha = 0.55
        ctx.beginPath(); ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.stroke()
        ctx.globalAlpha = 0.28
        ctx.beginPath(); ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); ctx.stroke()
        if (b.super) {
            ctx.globalAlpha = 0.4
            ctx.lineWidth = 5
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.restore()
    }
}

// super-bullet edge zap: the whole edge line flashes and decays on launch (~12 ticks)
export function drawZaps(ctx, g, zaps) {
    for (const z of zaps) {
        const k = z.life / 12
        ctx.save()
        ctx.strokeStyle = `rgba(255,242,160,${k})`
        ctx.shadowColor = '#fff2a0'
        ctx.shadowBlur = 14 * k
        ctx.lineWidth = 1.5 + 2.5 * k
        const p0 = posAt(g, z.A, 0.02)
        const p1 = posAt(g, z.A, 1)
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
        ctx.restore()
    }
}

// arrival alarm: the rim segment where the imminent enemy will land, hot red
export function drawRimWarn(ctx, g, A, tick) {
    if (A < 0) return
    ctx.save()
    ctx.strokeStyle = '#ff4040'
    ctx.shadowColor = '#ff4040'
    ctx.shadowBlur = 12
    ctx.lineWidth = 3.5
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(tick * 0.5)
    ctx.beginPath()
    for (let k = 0; k <= 8; k++) {
        const p = posAt(g, A + (k / 8 - 0.5) * 0.6, 1)
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 1
}
