// LUNAR LANDER — art.js : everything drawn in code, in the vector-cabinet style
// the 1979 original wore: white line-work over a black void, amber readouts,
// a gold lander with a cyan cabin window, the orbiter a silver capsule.
// The starfield is seeded (rng.js) so the attract replay haunts the same sky.

import { mulberry32 } from './rng.js'
import { WORLD_W, STEP } from './terrain.js'
import { ORBIT_Y } from './sim.js'

export function makeStars(seed) {
    const rnd = mulberry32((seed ^ 0x5EED) >>> 0)
    const stars = []
    for (let i = 0; i < 70; i++) {
        stars.push({ x: rnd() * WORLD_W, y: 120 + rnd() * 430, b: 0.35 + rnd() * 0.65, tw: rnd() * 6.28 })
    }
    return stars
}

// world -> screen helpers (s = uniform scale, cam = view centre in world units)
export const makeCam = (zoom) => {
    const s = zoom ? 1 : 0.5
    const halfW = 256 / s
    const halfH = 192 / s
    return {
        s,
        clampX: (x) => Math.max(halfW, Math.min(WORLD_W - halfW, x)),
        clampY: (y) => Math.max(halfH, Math.min(430 - halfH + 46, y)),
        px: (x, camX) => (x - camX) * s + 256,
        py: (y, camY) => 192 - (y - camY) * s,
    }
}

export function drawStars(ctx, stars, camX, tick) {
    for (const st of stars) {
        const x = ((st.x - camX * 0.12) % WORLD_W + WORLD_W) % WORLD_W
        if (x < -8 || x > 520) continue
        const b = st.b * (0.75 + 0.25 * Math.sin(tick / 22 + st.tw))
        ctx.fillStyle = `rgba(233,240,255,${b.toFixed(2)})`
        ctx.fillRect(x, st.y, st.b > 0.8 ? 2 : 1, st.b > 0.8 ? 2 : 1)
    }
}

// terrain polyline: bright line with a soft glow, pads drawn heavier and
// labelled with their point values — the arcade's landing announcements.
export function drawTerrain(ctx, terrain, cam, camX, camY) {
    const pts = terrain.pts
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(160,220,255,0.55)'
    ctx.shadowBlur = 6
    ctx.strokeStyle = '#dfe9ff'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    let started = false
    for (let i = 0; i < pts.length; i++) {
        const x = i * STEP
        const sx = cam.px(x, camX)
        if (sx < -20 || sx > 532) continue
        const sy = cam.py(pts[i], camY)
        if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    // pads: brighter bar + amber value tag hovering above
    ctx.textAlign = 'center'
    for (const p of terrain.pads) {
        const x0 = cam.px(p.i0 * STEP, camX)
        const x1 = cam.px(p.i1 * STEP, camX)
        const y = cam.py(p.y, camY)
        if (x1 < -10 || x0 > 522) continue
        ctx.strokeStyle = '#ffd76b'
        ctx.lineWidth = 2.4
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
        if (cam.s > 0.7) {
            ctx.fillStyle = 'rgba(255,215,107,0.85)'
            ctx.font = 'bold 8px monospace'
            ctx.fillText(String(p.val), (x0 + x1) / 2, y - 5)
        }
    }
    ctx.restore()
}

// the lander: gold descent stage, cyan cabin, two splayed legs, nozzle below.
// Drawn at world scale so it stays vector-sharp at either zoom.
// The shape below is in BODY coords, y-UP like the sim (legs at y −10 = the
// sim's FEET). The canvas is y-down, so: rotate by +rot, then scale y by −s.
// That maps body (bx,by) to exactly the sim's footWorld() point on screen.
// (#287: it used to rotate(−rot)+scale(s,s), which drew the craft upside down.)
export function drawLander(ctx, g, cam, camX, camY, thrusting, tick) {
    const x = cam.px(g.x, camX)
    const y = cam.py(g.y, camY)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(g.rot)
    ctx.scale(cam.s, -cam.s)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // legs
    ctx.strokeStyle = '#cfd6e6'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-5, -2); ctx.lineTo(-9.5, -10); ctx.moveTo(-9.5, -10); ctx.lineTo(-12, -10)
    ctx.moveTo(5, -2); ctx.lineTo(9.5, -10); ctx.moveTo(9.5, -10); ctx.lineTo(12, -10)
    ctx.stroke()
    // body: gold trapezoid
    const grd = ctx.createLinearGradient(-7, 0, 7, 0)
    grd.addColorStop(0, '#8a6b1e'); grd.addColorStop(0.5, '#e8b64a'); grd.addColorStop(1, '#8a6b1e')
    ctx.fillStyle = grd
    ctx.strokeStyle = '#ffe9a8'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-7, -1); ctx.lineTo(-4.5, 5); ctx.lineTo(4.5, 5); ctx.lineTo(7, -1); ctx.lineTo(4, -3); ctx.lineTo(-4, -3); ctx.closePath()
    ctx.fill(); ctx.stroke()
    // cabin window
    ctx.fillStyle = '#7de3ff'
    ctx.beginPath(); ctx.moveTo(-3, 1.5); ctx.lineTo(-1.8, 4); ctx.lineTo(1.8, 4); ctx.lineTo(3, 1.5); ctx.closePath(); ctx.fill()
    // nozzle
    ctx.strokeStyle = '#9aa3b5'
    ctx.beginPath(); ctx.moveTo(-2.4, -3); ctx.lineTo(-3.4, -6.5); ctx.moveTo(2.4, -3); ctx.lineTo(3.4, -6.5); ctx.stroke()
    // main engine flame — two-frame flicker
    if (thrusting) {
        const f = Math.floor(tick / 3) % 2
        const len = 7 + f * 4 + Math.random() * 2
        const fg = ctx.createLinearGradient(0, -6.5, 0, -6.5 - len)
        fg.addColorStop(0, 'rgba(255,240,160,0.95)'); fg.addColorStop(0.5, 'rgba(255,150,40,0.8)'); fg.addColorStop(1, 'rgba(255,60,20,0)')
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.moveTo(-3, -6.5); ctx.lineTo(3, -6.5); ctx.lineTo(0.8 + f, -6.5 - len); ctx.lineTo(-0.8 - f, -6.5 - len)
        ctx.closePath(); ctx.fill()
    }
    ctx.restore()
}

// the lunar orbiter: a silver capsule with a docking probe that trails,
// crossing the top of the sky.
export function drawOrbiter(ctx, g, cam, camX, camY) {
    const x = cam.px(g.orb.x, camX)
    const y = cam.py(ORBIT_Y, camY)
    if (x < -30 || x > 542) return
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(cam.s, cam.s)
    ctx.rotate(g.orb.vx >= 0 ? 0 : Math.PI)
    ctx.strokeStyle = '#dfe6f5'
    ctx.fillStyle = 'rgba(190,205,230,0.25)'
    ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(8, -3); ctx.lineTo(11, 0); ctx.lineTo(8, 3); ctx.lineTo(-8, 3); ctx.lineTo(-10, 0); ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#7de3ff'
    ctx.beginPath(); ctx.arc(4, 0, 1.8, 0, Math.PI * 2); ctx.fill()
    // docking probe toward the moon
    ctx.strokeStyle = '#ffd76b'
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, 7.5); ctx.moveTo(-2, 7.5); ctx.lineTo(2, 7.5); ctx.stroke()
    // engine glow behind
    const f = Math.floor(g.tick / 2) % 2
    ctx.fillStyle = `rgba(140,190,255,${0.35 + f * 0.2})`
    ctx.beginPath(); ctx.moveTo(-8, -1.5); ctx.lineTo(-8, 1.5); ctx.lineTo(-13 - f * 2, 0); ctx.closePath(); ctx.fill()
    ctx.restore()
}
