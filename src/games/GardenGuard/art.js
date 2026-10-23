// GARDEN GUARD — procedural art. Every sprite, texture and glyph is generated in
// code (no assets), an original autumn-orchard look built from the original's
// mechanics: a checkerboard lawn, a cottage on the left, a top card tray, falling
// currency, chunky cartoon defenders vs goblin raiders. Palette is its own (warm
// dusk + orchard greens), not the source game's.
import {
    W, H, ROWS, COLS, TRAY_H, GLX, GLY, CW, CH, HOUSE_X,
    colX, rowY, PLANTS, ENEMIES,
} from './sim.js'

const C = {
    skyTop: '#ffd9a0', skyMid: '#f7b069', skyLow: '#ef8f52',
    sun: '#fff2c2', sunGlow: '#ffd27a',
    roof: '#9c3b2e', roofDark: '#7a2c22', wall: '#d8b98c', wallDark: '#b8956a',
    door: '#6b4326', doorDark: '#4c2f1a',
    grassA: '#6fa63a', grassB: '#7cb042', grassEdge: '#5c8a2f',
    trayWood: '#6b4a2a', trayWoodHi: '#875f38', trayWoodDark: '#4a3219',
    ink: '#2b1d12', cream: '#fff3d6',
    acorn: '#9a6a34', acornDark: '#6f4a22', acornCap: '#c98a4b',
    wood: '#8a5a2c',
}

const rnd = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rad, y)
    ctx.arcTo(x + w, y, x + w, y + h, rad)
    ctx.arcTo(x + w, y + h, x, y + h, rad)
    ctx.arcTo(x, y + h, x, y, rad)
    ctx.arcTo(x, y, x + w, y, rad)
    ctx.closePath()
}

// ---------------------------------------------------------- background ----
export function drawBackground(ctx, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, GLY)
    sky.addColorStop(0, C.skyTop); sky.addColorStop(0.6, C.skyMid); sky.addColorStop(1, C.skyLow)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, GLY + 8)
    // low autumn sun
    const sx = W - 120, sy = 58
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60)
    glow.addColorStop(0, C.sun); glow.addColorStop(0.5, 'rgba(255,210,122,0.55)'); glow.addColorStop(1, 'rgba(255,210,122,0)')
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill()
    ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill()
    // drifting clouds
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    for (let i = 0; i < 4; i++) {
        const cx = ((i * 230 + t * 12) % (W + 160)) - 80
        const cy = 30 + (i % 2) * 26
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.arc(cx + 20, cy + 4, 20, 0, 7); ctx.arc(cx + 42, cy, 15, 0, 7); ctx.fill()
    }
    // distant orchard treeline
    ctx.fillStyle = '#4f7a34'
    for (let x = -10; x < W; x += 46) {
        const h0 = 22 + rnd(x, 3) * 16
        ctx.beginPath(); ctx.arc(x + (t * 0), GLY + 4, h0, Math.PI, 0); ctx.fill()
    }
}

// ------------------------------------------------------------ cottage ----
export function drawCottage(ctx) {
    const w = HOUSE_X + 6
    // wall
    ctx.fillStyle = C.wall; ctx.fillRect(0, GLY - 6, w, CH * ROWS)
    ctx.fillStyle = C.wallDark; ctx.fillRect(w - 10, GLY - 6, 10, CH * ROWS)
    // stone courses
    ctx.strokeStyle = 'rgba(120,90,60,0.35)'; ctx.lineWidth = 1
    for (let y = GLY; y < GLY + CH * ROWS; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    // roof
    ctx.fillStyle = C.roof
    ctx.beginPath(); ctx.moveTo(-4, GLY - 4); ctx.lineTo(w + 8, GLY - 40); ctx.lineTo(w + 8, GLY - 4); ctx.closePath(); ctx.fill()
    ctx.fillStyle = C.roofDark
    ctx.beginPath(); ctx.moveTo(-4, GLY - 4); ctx.lineTo(w + 8, GLY - 40); ctx.lineTo(w + 8, GLY - 30); ctx.lineTo(20, GLY - 4); ctx.closePath(); ctx.fill()
    // door
    ctx.fillStyle = C.door; rr(ctx, w - 34, GLY + CH * 2 + 12, 26, 44, 5); ctx.fill()
    ctx.fillStyle = C.doorDark; rr(ctx, w - 30, GLY + CH * 2 + 16, 18, 40, 4); ctx.fill()
    ctx.fillStyle = C.acornCap; ctx.beginPath(); ctx.arc(w - 15, GLY + CH * 2 + 38, 2.4, 0, 7); ctx.fill()
}

// ---------------------------------------------------------- lawn tiles ----
export function drawLawn(ctx, _g) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = GLX + c * CW, y = GLY + r * CH
            const base = (r + c) % 2 ? C.grassA : C.grassB
            ctx.fillStyle = base
            ctx.fillRect(x, y, CW, CH)
            // grain flecks (static per tile, deterministic)
            ctx.fillStyle = 'rgba(0,0,0,0.06)'
            for (let k = 0; k < 7; k++) {
                const fx = x + rnd(c * 9 + k, r) * CW
                const fy = y + rnd(c, r * 7 + k) * CH
                ctx.fillRect(fx, fy, 2, 1)
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1
            ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1)
        }
    }
    // house-side danger line
    ctx.fillStyle = 'rgba(150,40,30,0.35)'
    ctx.fillRect(HOUSE_X - 4, GLY, 3, CH * ROWS)
}

// ----------------------------------------------------------- acorn icon ----
export function drawAcornIcon(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 16, s / 16)
    ctx.fillStyle = C.acornCap
    rr(ctx, -8, -8, 16, 7, 3); ctx.fill()
    ctx.fillStyle = C.acornDark; ctx.fillRect(-6, -9, 12, 2)
    ctx.fillStyle = C.acorn
    ctx.beginPath(); ctx.moveTo(-7, -1); ctx.quadraticCurveTo(-7, 9, 0, 9); ctx.quadraticCurveTo(7, 9, 7, -1); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-2, 3, 2, 0, 7); ctx.fill()
    ctx.restore()
}

// ---------------------------------------------------------- card tray ----
export function drawTray(ctx, g, hover) {
    // wooden board
    const grd = ctx.createLinearGradient(0, 0, 0, TRAY_H)
    grd.addColorStop(0, C.trayWoodHi); grd.addColorStop(1, C.trayWood)
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, TRAY_H)
    ctx.fillStyle = C.trayWoodDark; ctx.fillRect(0, TRAY_H - 4, W, 4)
    // acorn purse (inset so the site's top-left chrome never covers it)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, 88, 14, 78, 76, 10); ctx.fill()
    drawAcornIcon(ctx, 127, 40, 34)
    ctx.fillStyle = C.cream; ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(g.acorns), 127, 68)
    // cards
    const cardW = 64, cardH = 78, gap = 8
    const startX = 178
    for (let i = 0; i < g.unlocked.length; i++) {
        const id = g.unlocked[i]
        const def = PLANTS[id]
        const x = startX + i * (cardW + gap), y = 12
        const sel = !g.trowel && g.sel === i
        const cd = g.cd[id] || 0
        const afford = g.acorns >= def.cost
        ctx.fillStyle = sel ? '#fff3cf' : '#efe0bd'
        rr(ctx, x, y, cardW, cardH, 7); ctx.fill()
        ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#e4a52b' : 'rgba(90,60,30,0.5)'
        rr(ctx, x, y, cardW, cardH, 7); ctx.stroke()
        drawPlantIcon(ctx, id, x + cardW / 2, y + 34, 30)
        // cost badge
        ctx.fillStyle = afford ? '#3a2a16' : '#b23a2a'
        rr(ctx, x + 6, y + cardH - 20, cardW - 12, 16, 4); ctx.fill()
        drawAcornIcon(ctx, x + 16, y + cardH - 12, 14)
        ctx.fillStyle = afford ? C.cream : '#ffd8d0'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'left'
        ctx.fillText(String(def.cost), x + 25, y + cardH - 11)
        // cooldown veil
        if (cd > 0) {
            ctx.fillStyle = 'rgba(20,22,40,0.55)'
            const frac = Math.min(1, cd / def.recharge)
            rr(ctx, x, y, cardW, cardH * frac, 7); ctx.fill()
        } else if (!afford) {
            ctx.fillStyle = 'rgba(20,22,40,0.3)'; rr(ctx, x, y, cardW, cardH, 7); ctx.fill()
        }
        if (hover && hover.kind === 'card' && hover.i === i) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(ctx, x - 1, y - 1, cardW + 2, cardH + 2, 8); ctx.stroke()
        }
    }
    // trowel card at the end
    const tx = startX + g.unlocked.length * (cardW + gap)
    ctx.fillStyle = g.trowel ? '#fff3cf' : '#efe0bd'; rr(ctx, tx, 12, cardW, cardH, 7); ctx.fill()
    ctx.lineWidth = g.trowel ? 3 : 1.5; ctx.strokeStyle = g.trowel ? '#e4a52b' : 'rgba(90,60,30,0.5)'; rr(ctx, tx, 12, cardW, cardH, 7); ctx.stroke()
    drawTrowel(ctx, tx + cardW / 2, 12 + 34)
    ctx.fillStyle = C.ink; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('TROWEL', tx + cardW / 2, 12 + cardH - 12)
    if (hover && hover.kind === 'trowel') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(ctx, tx - 1, 11, cardW + 2, cardH + 2, 8); ctx.stroke() }
}

function drawTrowel(ctx, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.5)
    ctx.fillStyle = '#c9c9d2'; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.lineTo(2, 16); ctx.lineTo(-2, 16); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#8a5a2c'; ctx.fillRect(-2, -14, 4, 18)
    ctx.fillStyle = '#6b4326'; rr(ctx, -4, -18, 8, 6, 2); ctx.fill()
    ctx.restore()
}

// ------------------------------------------------------- plant icons ----
export function drawPlantIcon(ctx, id, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy)
    const u = s / 16
    ctx.lineJoin = 'round'
    if (id === 'daisy') {
        ctx.strokeStyle = '#2f7d2f'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(0, 14 * u); ctx.lineTo(0, 2 * u); ctx.stroke()
        ctx.fillStyle = '#ffdf4f'
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u, 4 * u, 2.4 * u, a, 0, 7); ctx.fill() }
        ctx.fillStyle = '#a86a2a'; ctx.beginPath(); ctx.arc(0, 0, 4.5 * u, 0, 7); ctx.fill()
    } else if (id === 'squirrel') {
        ctx.fillStyle = '#b9793f'
        ctx.beginPath(); ctx.ellipse(0, 2 * u, 7 * u, 8 * u, 0, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(2 * u, -6 * u, 5 * u, 0, 7); ctx.fill()
        ctx.fillStyle = '#8a5a2c'; ctx.beginPath(); ctx.moveTo(-6 * u, -2 * u); ctx.quadraticCurveTo(-12 * u, -8 * u, -4 * u, -10 * u); ctx.quadraticCurveTo(-2 * u, -4 * u, -6 * u, -2 * u); ctx.fill()
        ctx.fillStyle = '#2b1d12'; ctx.beginPath(); ctx.arc(4 * u, -6 * u, 1.4 * u, 0, 7); ctx.fill()
        ctx.fillStyle = C.acorn; ctx.beginPath(); ctx.arc(7 * u, 2 * u, 2.4 * u, 0, 7); ctx.fill()
    } else if (id === 'hedge') {
        ctx.fillStyle = '#3f9f4f'; rr(ctx, -8 * u, -8 * u, 16 * u, 16 * u, 4 * u); ctx.fill()
        ctx.fillStyle = '#2f7d3f'
        for (let i = 0; i < 5; i++) { const a = rnd(i, 1) * 6.28; ctx.beginPath(); ctx.arc(Math.cos(a) * 5 * u, Math.sin(a) * 5 * u, 3.4 * u, 0, 7); ctx.fill() }
        ctx.fillStyle = '#d8483f'; ctx.beginPath(); ctx.arc(-3 * u, -2 * u, 1.3 * u, 0, 7); ctx.arc(3 * u, 2 * u, 1.3 * u, 0, 7); ctx.fill()
    } else if (id === 'chili') {
        ctx.strokeStyle = '#2f7d2f'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(0, -12 * u); ctx.quadraticCurveTo(3 * u, -14 * u, 5 * u, -12 * u); ctx.stroke()
        ctx.fillStyle = '#e63b2e'
        ctx.beginPath(); ctx.moveTo(-2 * u, -8 * u); ctx.quadraticCurveTo(-8 * u, 2 * u, -1 * u, 10 * u); ctx.quadraticCurveTo(3 * u, 2 * u, 2 * u, -8 * u); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#c22a20'; ctx.beginPath(); ctx.moveTo(3 * u, -6 * u); ctx.quadraticCurveTo(8 * u, 2 * u, 4 * u, 9 * u); ctx.quadraticCurveTo(6 * u, 0, 5 * u, -6 * u); ctx.closePath(); ctx.fill()
    } else if (id === 'frost') {
        ctx.fillStyle = '#bfe9f2'; ctx.beginPath(); ctx.moveTo(-8 * u, 8 * u); ctx.quadraticCurveTo(-8 * u, -8 * u, 0, -8 * u); ctx.quadraticCurveTo(8 * u, -8 * u, 8 * u, 8 * u); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#5fd0e6'; ctx.beginPath(); ctx.arc(-3 * u, 0, 2 * u, 0, 7); ctx.arc(3 * u, -2 * u, 1.6 * u, 0, 7); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-6 * u, 8 * u); ctx.lineTo(-4 * u, 12 * u); ctx.lineTo(-2 * u, 8 * u); ctx.closePath(); ctx.fill()
    } else if (id === 'pumpkin') {
        ctx.fillStyle = '#e0822b'; ctx.beginPath(); ctx.ellipse(0, 2 * u, 9 * u, 8 * u, 0, 0, 7); ctx.fill()
        ctx.strokeStyle = '#b9641f'; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.moveTo(0, -6 * u); ctx.lineTo(0, 10 * u); ctx.moveTo(-5 * u, -4 * u); ctx.quadraticCurveTo(-5 * u, 8 * u, -4 * u, 9 * u); ctx.stroke()
        ctx.fillStyle = '#2f7d2f'; ctx.fillRect(-1.5 * u, -11 * u, 3 * u, 5 * u)
    }
    ctx.restore()
}

// -------------------------------------------------------- defender art ----
export function drawPlant(ctx, p, t) {
    const cx = colX(p.c), cy = rowY(p.r)
    const def = PLANTS[p.type]
    // soil mound
    ctx.fillStyle = 'rgba(70,45,25,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + 22, 26, 9, 0, 0, 7); ctx.fill()
    const sway = Math.sin((t * 2 + p.anim)) * 1.5
    ctx.save(); ctx.translate(cx, cy)
    if (def.kind === 'bomb') {
        const lit = Math.max(0, 1 - p.fuse / def.fuse)
        ctx.save(); ctx.rotate(sway * 0.2)
        drawPlantIcon(ctx, 'chili', 0, 2, 34 + lit * 6)
        ctx.restore()
        if (p.fuse <= 0.001) { /* handled by shell particles */ }
        // fuse spark
        const fx = 0, fy = -26
        ctx.fillStyle = t % 0.1 < 0.05 ? '#fff6a0' : '#ff8a3a'
        ctx.beginPath(); ctx.arc(fx + 6, fy, 2.6 + lit * 2, 0, 7); ctx.fill()
    } else if (def.kind === 'producer') {
        const pulse = 1 + Math.sin(t * 3 + p.anim) * 0.06
        ctx.save(); ctx.scale(pulse, pulse); drawPlantIcon(ctx, 'daisy', sway, 0, 36); ctx.restore()
    } else if (def.kind === 'shooter' || def.kind === 'frost') {
        ctx.save(); ctx.translate(sway * 0.4, 0)
        drawPlantIcon(ctx, p.type, 0, 0, 34)
        ctx.restore()
    } else if (def.kind === 'wall') {
        drawPlantIcon(ctx, 'hedge', 0, 0, 36)
        const dmg = 1 - p.hp / p.maxHp
        if (dmg > 0.35) {
            ctx.strokeStyle = 'rgba(60,30,15,0.7)'; ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-2, -2); ctx.lineTo(-7, 6); ctx.stroke()
            if (dmg > 0.7) { ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(3, 0); ctx.lineTo(8, 8); ctx.stroke() }
        }
    } else if (def.kind === 'lobber') {
        drawPlantIcon(ctx, 'pumpkin', 0, 2, 34)
        ctx.strokeStyle = '#6b4326'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, -22); ctx.stroke()
    }
    ctx.restore()
    // hp bar (only when hurt)
    if (p.hp < p.maxHp && def.kind !== 'bomb') {
        const w = 34, frac = Math.max(0, p.hp / p.maxHp)
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - w / 2, cy - 26, w, 4)
        ctx.fillStyle = frac > 0.5 ? '#7fe07f' : frac > 0.25 ? '#ffd24a' : '#ff6a5a'
        ctx.fillRect(cx - w / 2, cy - 26, w * frac, 4)
    }
}

// ----------------------------------------------------------- goblins ----
export function drawEnemy(ctx, e, t) {
    const def = ENEMIES[e.id]
    const cy = rowY(e.r)
    const bob = e.eat ? Math.sin(t * 16) * 2 : Math.sin(e.anim) * 2.2
    const lean = e.eat ? 0.12 : 0
    ctx.save(); ctx.translate(e.x, cy + bob)
    ctx.rotate(lean)
    const slowed = e.slowT > 0
    const flash = e.id === 'warlord' ? '#3f6b22' : def.color
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, def.r * 0.7, def.r * 0.8, 5, 0, 0, 7); ctx.fill()
    // legs (two-frame walk)
    const step = Math.sin(e.anim)
    ctx.strokeStyle = '#3a5a20'; ctx.lineWidth = def.r * 0.26
    ctx.beginPath(); ctx.moveTo(-2, def.r * 0.2); ctx.lineTo(-2 + step * 5, def.r * 0.72); ctx.moveTo(2, def.r * 0.2); ctx.lineTo(2 - step * 5, def.r * 0.72); ctx.stroke()
    // body
    ctx.fillStyle = flash
    ctx.beginPath(); ctx.ellipse(0, 0, def.r * 0.78, def.r * 0.82, 0, 0, 7); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-def.r * 0.25, -def.r * 0.2, def.r * 0.34, def.r * 0.36, 0, 0, 7); ctx.fill()
    // head
    const hr = def.r * 0.5
    ctx.fillStyle = flash
    ctx.beginPath(); ctx.arc(-def.r * 0.35, -def.r * 0.5, hr, 0, 7); ctx.fill()
    // ears
    ctx.beginPath(); ctx.moveTo(-def.r * 0.7, -def.r * 0.7); ctx.lineTo(-def.r * 1.15, -def.r * 0.95); ctx.lineTo(-def.r * 0.55, -def.r * 0.35); ctx.closePath(); ctx.fill()
    // eyes (menacing, facing left toward the cottage)
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(-def.r * 0.55, -def.r * 0.55, hr * 0.26, 0, 7); ctx.fill()
    ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.arc(-def.r * 0.62, -def.r * 0.55, hr * 0.13, 0, 7); ctx.fill()
    // teeth
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.moveTo(-def.r * 0.7, -def.r * 0.32); ctx.lineTo(-def.r * 0.58, -def.r * 0.16); ctx.lineTo(-def.r * 0.46, -def.r * 0.32); ctx.closePath(); ctx.fill()
    // per-type gear
    if (e.id === 'brute') {
        ctx.fillStyle = '#7d7d86'; ctx.beginPath(); ctx.arc(-def.r * 0.35, -def.r * 0.55, hr * 1.05, Math.PI, 0); ctx.fill() // helmet
        ctx.strokeStyle = '#55555f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-def.r * 1.1, -def.r * 0.2); ctx.lineTo(-def.r * 1.5, def.r * 0.3); ctx.stroke() // club
    } else if (e.id === 'warlord') {
        ctx.fillStyle = '#6a6a72'; ctx.beginPath(); ctx.arc(-def.r * 0.35, -def.r * 0.55, hr * 1.1, Math.PI, 0); ctx.fill()
        ctx.fillStyle = '#d9d2c4' // horns
        ctx.beginPath(); ctx.moveTo(-def.r * 0.9, -def.r * 0.8); ctx.lineTo(-def.r * 1.35, -def.r * 1.2); ctx.lineTo(-def.r * 0.75, -def.r * 0.95); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(0, -def.r * 0.9); ctx.lineTo(0.3 * def.r, -def.r * 1.25); ctx.lineTo(0.2, -def.r * 0.8); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#5a3a1c'; rr(ctx, -def.r * 1.5, -def.r * 0.4, def.r * 0.5, def.r * 1.0, 4); ctx.fill() // shield
    } else if (e.id === 'sprinter') {
        ctx.fillStyle = '#e6f08a'; ctx.beginPath(); ctx.moveTo(def.r * 0.6, 0); ctx.lineTo(def.r * 1.1, -def.r * 0.3); ctx.lineTo(def.r * 1.0, def.r * 0.3); ctx.closePath(); ctx.fill() // motion tuft
    } else if (e.id === 'pup') {
        ctx.fillStyle = flash; ctx.beginPath(); ctx.ellipse(def.r * 0.2, def.r * 0.1, def.r * 0.5, def.r * 0.35, 0, 0, 7); ctx.fill()
    }
    if (slowed) {
        ctx.fillStyle = 'rgba(120,210,240,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, def.r * 0.85, def.r * 0.9, 0, 0, 7); ctx.fill()
        ctx.fillStyle = '#eafbff'
        for (let i = 0; i < 4; i++) { const a = t * 2 + i; ctx.beginPath(); ctx.arc(Math.cos(a) * def.r * 0.5, Math.sin(a) * def.r * 0.6, 1.6, 0, 7); ctx.fill() }
    }
    ctx.restore()
    // hp bar
    if (e.hp < e.maxHp) {
        const w = def.r * 1.5, frac = Math.max(0, e.hp / e.maxHp)
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(e.x - w / 2, cy - def.r - 12, w, 4)
        ctx.fillStyle = frac > 0.5 ? '#7fe07f' : frac > 0.25 ? '#ffd24a' : '#ff6a5a'
        ctx.fillRect(e.x - w / 2, cy - def.r - 12, w * frac, 4)
    }
}

// -------------------------------------------------------- projectiles ----
export function drawProj(ctx, pr) {
    if (pr.kind === 'frost') {
        ctx.fillStyle = '#bff0ff'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, 7); ctx.fill()
        ctx.fillStyle = '#5fd0e6'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.6, 0, 7); ctx.fill()
        ctx.strokeStyle = 'rgba(180,240,255,0.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(pr.x - 8, pr.y); ctx.lineTo(pr.x - 14, pr.y); ctx.stroke()
    } else if (pr.kind === 'lob') {
        drawAcornIcon(ctx, pr.x, pr.y, 18)
        ctx.fillStyle = '#e0822b'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 6, 0, 7); ctx.fill()
    } else {
        drawAcornIcon(ctx, pr.x, pr.y, 15)
    }
}

// -------------------------------------------------------- acorn drops ----
export function drawAcornDrop(ctx, d, t) {
    const pulse = 1 + Math.sin(t * 4 + d.x) * 0.08
    ctx.save(); ctx.translate(d.x, d.y); ctx.scale(pulse, pulse)
    drawAcornIcon(ctx, 0, 0, 22)
    ctx.restore()
}

// ---------------------------------------------------------- mowers ----
export function drawMower(ctx, r, prog) {
    const y = rowY(r) + 16
    if (prog > 0) {
        const mx = prog
        // motion blur bar
        ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fillRect(HOUSE_X - 4, y - 8, mx - (HOUSE_X - 4), 14)
        ctx.fillStyle = '#c9c9d2'; ctx.beginPath(); ctx.arc(mx, y, 8, 0, 7); ctx.fill()
        ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx - 14, y - 16); ctx.stroke()
        // scarecrow head
        ctx.fillStyle = '#d8b98c'; ctx.beginPath(); ctx.arc(mx - 14, y - 20, 6, 0, 7); ctx.fill()
    }
    // parked scarecrow (lantern) on the cottage line
    ctx.fillStyle = '#8a5a2c'; ctx.fillRect(HOUSE_X - 10, y - 18, 3, 22)
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(HOUSE_X - 8.5, y - 20, 4.5, 0, 7); ctx.fill()
}

// ------------------------------------------------------------ cursor ----
export function drawCursor(ctx, g) {
    if (g.done) return
    const x = GLX + g.cursor.c * CW, y = GLY + g.cursor.r * CH
    const blink = Math.floor(g.tick / 12) % 2 === 0
    ctx.strokeStyle = g.trowel ? (blink ? '#ffd24a' : '#fff') : (blink ? '#fff3cf' : '#7fd0ff')
    ctx.lineWidth = 3
    rr(ctx, x + 2, y + 2, CW - 4, CH - 4, 8); ctx.stroke()
    ctx.lineWidth = 1
    // ghost of the selected defender
    if (!g.trowel && g.unlocked[g.sel]) {
        ctx.globalAlpha = 0.5
        drawPlantIcon(ctx, g.unlocked[g.sel], x + CW / 2, y + CH / 2, 30)
        ctx.globalAlpha = 1
    }
}

// -------------------------------------------------------------- HUD ----
export function drawHud(ctx, g, bigUp) {
    // level + wave progress, bottom-left (the site chrome owns both top corners,
    // and the watermark owns bottom-centre — this lane is clear).
    const bw = 260, bx = 16, by = H - 30
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = 'rgba(40,24,12,0.6)'; ctx.fillRect(bx - 6, by - 22, bw + 96, 34)
    ctx.fillStyle = C.cream; ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText(`LEVEL ${g.level}`, bx, by - 6)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, bx, by, bw, 11, 5); ctx.fill()
    const frac = Math.min(1, (g.spawned) / Math.max(1, g.totalSpawns))
    ctx.fillStyle = bigUp ? '#e23b2e' : '#7cb042'; rr(ctx, bx, by, bw * frac, 11, 5); ctx.fill()
    // wave flag markers
    let acc = 0
    for (const w of g.waves) { acc += w.entries.length; const fx = bx + bw * (acc / Math.max(1, g.totalSpawns)); ctx.fillStyle = w.big ? '#e23b2e' : '#4a7228'; ctx.fillRect(fx - 1, by - 4, 2, 7) }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx + bw * frac, by + 5.5, 4.5, 0, 7); ctx.fill()
    ctx.strokeStyle = bigUp ? '#e23b2e' : 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke()
}
