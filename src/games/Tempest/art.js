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

export function drawTube(ctx, g, tick) {
    const n = g.faces
    const step = Math.max(1, Math.round(n / 32))
    const hue = ['#3ae0ff', '#59ffb6', '#ffd053', '#ff7ce6'][Math.max(0, g.level - 1) % 4]
    ctx.lineWidth = 1

    // radial edges
    ctx.strokeStyle = hue
    ctx.globalAlpha = 0.5
    for (let i = 0; i < n; i += step) {
        const a0 = ringPt(g, i, 0)
        const a1 = ringPt(g, i, 1)
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke()
    }
    ctx.globalAlpha = 1

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
        ctx.globalAlpha = 0.65
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
        ctx.globalAlpha = 1
    }

    // near rim, brightest with glow
    ctx.save()
    ctx.shadowColor = hue
    ctx.shadowBlur = 10 + 3 * Math.sin(tick * 0.06)
    ctx.strokeStyle = hue
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
        const p = ringPt(g, i, 1)
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.restore()
}

export function drawPlayer(ctx, g, tick, dead) {
    if (dead) return
    const th = angAt(g, g.p)
    const r = RN - 4
    const x = CX + Math.cos(th) * r
    const y = CY + Math.sin(th) * r
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(th + Math.PI / 2) // ship nose points down the tube
    const hue = (tick * 6) % 360 // the cabinet's ship constantly cycled color
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
    for (const e of g.enemies) {
        const p = posAt(g, e.A, e.t)
        const sc = Math.max(0.35, p.s)
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.scale(sc, sc)
        ctx.lineWidth = 1.6
        if (e.type === 'flip') {
            const phi = (e.A % 1) * Math.PI
            const w = Math.cos(phi) * 13
            ctx.strokeStyle = '#ff5f5f'
            ctx.shadowColor = '#ff5f5f'; ctx.shadowBlur = 6
            ctx.beginPath()
            ctx.moveTo(-w, -7); ctx.lineTo(0, 7); ctx.lineTo(w, -7)
            ctx.moveTo(0, -7); ctx.lineTo(0, 7)
            ctx.stroke()
        } else if (e.type === 'pulse') {
            const rr = 6 + e.stage * 2.5
            const pulse = 1 + 0.25 * Math.sin(tick * 0.25)
            ctx.strokeStyle = '#c77dff'
            ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 8
            ctx.beginPath()
            ctx.moveTo(0, -rr * pulse); ctx.lineTo(rr * pulse, 0); ctx.lineTo(0, rr * pulse); ctx.lineTo(-rr * pulse, 0)
            ctx.closePath(); ctx.stroke()
            ctx.beginPath(); ctx.arc(0, 0, rr * 0.45, 0, Math.PI * 2); ctx.stroke()
        } else {
            ctx.strokeStyle = e.diving ? '#ff6a3d' : '#7dff9a'
            ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 7
            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke()
            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.restore()
    }
}

export function drawBullets(ctx, g) {
    for (const b of g.bullets) {
        const p0 = posAt(g, b.A, b.t)
        const p1 = posAt(g, b.A, Math.min(1, b.t + 0.07))
        ctx.save()
        ctx.strokeStyle = b.super ? '#fff2a0' : '#a0eaff'
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = b.super ? 12 : 6
        ctx.lineWidth = b.super ? 2.6 : 1.8
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
        ctx.restore()
    }
}
