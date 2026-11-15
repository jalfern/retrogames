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
function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16)
    const clamp = (v) => Math.max(0, Math.min(255, v))
    const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt)
    return `rgb(${r},${g},${b})`
}
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

// ---------------------------------------------------------- card portrait ----
// #2328: the tray cards used to stamp the 30px field icon on a flat tint plate
// ("card art reuses the small defender icons" — README honest gap #2). A card
// is a PORTRAIT PLATE: the critter posed at card scale on orchard ground under
// a dusk sky in its own hue — soil mound, treeline, low sun, drifting cloud —
// inside a beveled, riveted wooden frame that gilds when selected. Everything
// moves on the sim clock (deterministic: attract replays stay byte-identical).
function drawPlateFrame(ctx, x, y, w, h, sel) {
    ctx.lineWidth = 1
    ctx.strokeStyle = sel ? '#ffd24a' : 'rgba(60,38,16,0.75)'
    rr(ctx, x, y, w, h, 5); ctx.stroke()
    ctx.strokeStyle = sel ? 'rgba(255,226,138,0.9)' : 'rgba(255,238,200,0.28)'
    ctx.beginPath(); ctx.moveTo(x + 5, y + 1.5); ctx.lineTo(x + w - 5, y + 1.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 1.5, y + 5); ctx.lineTo(x + 1.5, y + h - 5); ctx.stroke()
    ctx.fillStyle = sel ? '#ffd24a' : '#c9a24b'
    for (const [rx, ry] of [[x + 3.5, y + 3.5], [x + w - 3.5, y + 3.5], [x + 3.5, y + h - 3.5], [x + w - 3.5, y + h - 3.5]]) {
        ctx.beginPath(); ctx.arc(rx, ry, 1.4, 0, 7); ctx.fill()
    }
}

export function drawCardPortrait(ctx, id, x, y, w, h, sec, sel) {
    const def = PLANTS[id]
    const sway = Math.sin(sec * 2.1 + def.name.length) * 1.6
    ctx.save()
    rr(ctx, x, y, w, h, 5)
    ctx.clip()
    // dusk sky in the defender's own hue
    const pg = ctx.createLinearGradient(0, y, 0, y + h)
    pg.addColorStop(0, shade(def.color, 34)); pg.addColorStop(1, shade(def.color, -22))
    ctx.fillStyle = pg; ctx.fillRect(x, y, w, h)
    // the orchard's low sun, and a cloud drifting across every card
    ctx.fillStyle = 'rgba(255,242,194,0.85)'; ctx.beginPath(); ctx.arc(x + w - 12, y + 10, 4.5, 0, 7); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    const cx0 = x + ((sec * 3 + def.name.length * 7) % (w + 14)) - 7
    ctx.beginPath(); ctx.arc(cx0, y + 8, 3.4, 0, 7); ctx.arc(cx0 + 5, y + 9, 4, 0, 7); ctx.fill()
    // distant treeline arcs (soft silhouettes, not heavy blobs) + ground line
    // + the soil mound it all stands on
    ctx.fillStyle = 'rgba(43,29,18,0.30)'
    ctx.beginPath(); ctx.arc(x + 9, y + h - 11, 8, Math.PI, 0); ctx.fill()
    ctx.beginPath(); ctx.arc(x + w - 12, y + h - 10, 6.5, Math.PI, 0); ctx.fill()
    ctx.fillStyle = 'rgba(70,45,25,0.55)'; ctx.fillRect(x, y + h - 9, w, 9)
    ctx.fillStyle = 'rgba(94,62,34,0.9)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 8, 17, 5, 0, 0, 7); ctx.fill()
    drawCardPose(ctx, id, x + w / 2 + sway * 0.35, y + h - 9, sec)
    ctx.restore()
    drawPlateFrame(ctx, x, y, w, h, sel)
}

// posed defender, drawn around its foot point (fx, fy); ~28px tall budget.
function drawCardPose(ctx, id, fx, fy, sec) {
    ctx.lineJoin = 'round'
    if (id === 'daisy') {
        // two blooms and a leaf — the gilded daisy at full height
        ctx.strokeStyle = '#2f7d2f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(fx - 6, fy); ctx.quadraticCurveTo(fx - 8, fy - 12, fx - 6, fy - 19); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(fx + 5, fy); ctx.quadraticCurveTo(fx + 7, fy - 8, fx + 6, fy - 13); ctx.stroke()
        ctx.fillStyle = '#3f9f4f'; ctx.beginPath(); ctx.ellipse(fx + 1, fy - 6, 5, 2.4, 0.6, 0, 7); ctx.fill()
        const bloom = (bx, by, r, spin) => {
            ctx.fillStyle = '#ffdf4f'
            for (let i = 0; i < 10; i++) { const a = spin + (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.55, r * 0.3, a, 0, 7); ctx.fill() }
            ctx.fillStyle = '#a86a2a'; ctx.beginPath(); ctx.arc(bx, by, r * 0.62, 0, 7); ctx.fill()
        }
        bloom(fx - 6, fy - 20, 7, sec * 0.4)
        bloom(fx + 6, fy - 14, 4, -sec * 0.5)
    } else if (id === 'squirrel') {
        // sitting up, big curled tail, hefting an acorn overhead
        ctx.fillStyle = '#8a5a2c'
        ctx.beginPath(); ctx.moveTo(fx - 5, fy - 2); ctx.quadraticCurveTo(fx - 16, fy - 6, fx - 12, fy - 18); ctx.quadraticCurveTo(fx - 8, fy - 12, fx - 5, fy - 8); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#b9793f'
        ctx.beginPath(); ctx.ellipse(fx, fy - 7, 6.5, 8, 0, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(fx + 2, fy - 16, 5, 0, 7); ctx.fill()
        ctx.fillStyle = '#d8a878'; ctx.beginPath(); ctx.ellipse(fx + 3.5, fy - 15, 2.6, 3, 0, 0, 7); ctx.fill()
        ctx.fillStyle = '#2b1d12'; ctx.beginPath(); ctx.arc(fx + 3.5, fy - 17.5, 1.2, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(fx + 0.5, fy - 20, 1, 0, 7); ctx.fill()
        ctx.strokeStyle = '#b9793f'; ctx.lineWidth = 2; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(fx + 1, fy - 12); ctx.lineTo(fx + 3, fy - 21); ctx.stroke()
        drawAcornIcon(ctx, fx + 4, fy - 24, 12)
        ctx.fillStyle = '#8a5a2c'; ctx.beginPath(); ctx.ellipse(fx + 3, fy - 1, 3, 1.6, 0, 0, 7); ctx.fill()
    } else if (id === 'hedge') {
        // a wall you can see: full block, lobed tufts, berries, gripping roots
        ctx.fillStyle = '#3f9f4f'; rr(ctx, fx - 13, fy - 22, 26, 22, 5); ctx.fill()
        ctx.fillStyle = '#2f7d3f'
        for (let i = 0; i < 7; i++) { const a = rnd(i, 2) * 6.28; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 8, fy - 11 + Math.sin(a) * 7, 5 + rnd(i, 5) * 2.4, 0, 7); ctx.fill() }
        ctx.fillStyle = '#d8483f'
        for (const [bx, by] of [[-8, -16], [4, -13], [-2, -6], [8, -18]]) { ctx.beginPath(); ctx.arc(fx + bx, fy + by, 1.7, 0, 7); ctx.fill() }
        ctx.strokeStyle = '#6b4326'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(fx - 6, fy - 1); ctx.lineTo(fx - 9, fy + 1.5); ctx.moveTo(fx + 5, fy - 1); ctx.lineTo(fx + 8, fy + 1.5); ctx.stroke()
    } else if (id === 'chili') {
        // a cluster of three, smoke wisps drifting — the bomb is thinking about it
        const pod = (bx, by, s, rot) => {
            ctx.save(); ctx.translate(bx, by); ctx.rotate(rot)
            ctx.fillStyle = '#d92e21'
            ctx.beginPath(); ctx.moveTo(-2 * s, -6 * s); ctx.quadraticCurveTo(-6 * s, 2 * s, 0, 8 * s); ctx.quadraticCurveTo(3 * s, 2 * s, 2 * s, -6 * s); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#ff6f56'
            ctx.beginPath(); ctx.moveTo(-1.5 * s, -4 * s); ctx.quadraticCurveTo(-4 * s, 1.5 * s, -0.5 * s, 6.5 * s); ctx.quadraticCurveTo(-1 * s, 0, -0.5 * s, -4 * s); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = 'rgba(70,22,12,0.6)'; ctx.lineWidth = 1.1
            ctx.beginPath(); ctx.moveTo(-2 * s, -6 * s); ctx.quadraticCurveTo(-6 * s, 2 * s, 0, 8 * s); ctx.quadraticCurveTo(3 * s, 2 * s, 2 * s, -6 * s); ctx.closePath(); ctx.stroke()
            ctx.strokeStyle = '#2f7d2f'; ctx.lineWidth = 1.4 * s
            ctx.beginPath(); ctx.moveTo(0, -6 * s); ctx.quadraticCurveTo(2 * s, -8.5 * s, 4 * s, -7 * s); ctx.stroke()
            ctx.restore()
        }
        pod(fx - 6, fy - 9, 0.9, 0.18)
        pod(fx + 5, fy - 8, 0.8, -0.22)
        pod(fx, fy - 12, 1.25, 0)
        ctx.strokeStyle = 'rgba(120,110,100,0.5)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'
        for (let k = 0; k < 2; k++) {
            const py = fy - 24 - k * 5 - ((sec * 4 + k * 2) % 5)
            ctx.beginPath(); ctx.moveTo(fx + 3 + k * 3, py); ctx.quadraticCurveTo(fx + 6 + k * 3, py - 3, fx + 3 + k * 3, py - 6); ctx.stroke()
        }
        ctx.fillStyle = sec % 0.5 < 0.25 ? '#fff6a0' : '#ff8a3a'
        ctx.beginPath(); ctx.arc(fx + 5, fy - 26, 1.8, 0, 7); ctx.fill()
    } else if (id === 'frost') {
        // frosted toadstool with ice crystals at the base and a slow twinkle
        ctx.fillStyle = '#e8e2d2'; rr(ctx, fx - 3, fy - 10, 6, 10, 2.5); ctx.fill()
        ctx.fillStyle = '#bfe9f2'
        ctx.beginPath(); ctx.moveTo(fx - 13, fy - 9); ctx.quadraticCurveTo(fx - 13, fy - 24, fx, fy - 24); ctx.quadraticCurveTo(fx + 13, fy - 24, fx + 13, fy - 9); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#5fd0e6'
        ctx.beginPath(); ctx.arc(fx - 5, fy - 15, 2.6, 0, 7); ctx.arc(fx + 4, fy - 18, 2, 0, 7); ctx.arc(fx + 7, fy - 12, 1.6, 0, 7); ctx.fill()
        ctx.fillStyle = '#eafbff'
        ctx.beginPath(); ctx.moveTo(fx - 9, fy - 1); ctx.lineTo(fx - 7, fy - 7); ctx.lineTo(fx - 5, fy - 1); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(fx + 5, fy - 1); ctx.lineTo(fx + 7, fy - 6); ctx.lineTo(fx + 9, fy - 1); ctx.closePath(); ctx.fill()
        if (Math.sin(sec * 5) > 0.2) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(fx - 8, fy - 22, 1.4, 0, 7); ctx.fill() }
    } else if (id === 'pumpkin') {
        // a pumpkin loaded on the little orchard catapult, band drawn back
        ctx.strokeStyle = '#6b4326'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(fx + 8, fy); ctx.lineTo(fx + 8, fy - 14); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(fx + 8, fy - 14); ctx.lineTo(fx + 13, fy - 20); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(fx + 8, fy - 14); ctx.lineTo(fx + 3, fy - 21); ctx.stroke()
        const pull = 1 + Math.sin(sec * 2.4) * 0.8
        ctx.strokeStyle = '#c9b08a'; ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.moveTo(fx + 13, fy - 20); ctx.lineTo(fx - 2 - pull, fy - 12); ctx.lineTo(fx + 3, fy - 21); ctx.stroke()
        ctx.fillStyle = '#e0822b'; ctx.beginPath(); ctx.ellipse(fx - 3 - pull, fy - 11, 7.5, 6.5, 0, 0, 7); ctx.fill()
        ctx.strokeStyle = '#b9641f'; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(fx - 3 - pull, fy - 17); ctx.lineTo(fx - 3 - pull, fy - 5); ctx.moveTo(fx - 7 - pull, fy - 15); ctx.quadraticCurveTo(fx - 7 - pull, fy - 9, fx - 6 - pull, fy - 6); ctx.stroke()
        ctx.fillStyle = '#2f7d2f'; ctx.fillRect(fx - 4.5 - pull, fy - 20, 3, 4)
    }
}

// ------------------------------------------------- level-clear ceremony ----
// #2336 gap 4: clearing a level used to unlock quietly. The lineage's dance
// moment was missing — so in the ~3.2s window between `clear` and the next raid
// the orchard gets a warm gold wash, a sparkle rain drifting over the lawn, and,
// when a defender unlocks, that defender's portrait plate (#2328) presented big
// and centre-lawn on a ribbon board — popping in, gilded, breathing on the sim
// clock. All deterministic (rnd(i,k) + sin of g.sec): the attract demo replays
// the ceremony byte-identically.
function sparkle(ctx, x, y, r) {
    ctx.fillStyle = '#fff6c9'
    ctx.beginPath()
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.45, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.45, y)
    ctx.closePath(); ctx.fill()
}

export function drawClearCeremony(ctx, g) {
    if (!(g.levelClearAt > 0) || g.done) return
    const k = g.sec - g.levelClearAt
    const t = g.sec
    // the gold wash, pulsing out as the ceremony fades toward the next raid
    ctx.globalAlpha = Math.max(0, (0.10 + Math.sin(t * 3) * 0.03) * (1 - k / 3.4))
    ctx.fillStyle = '#ffdf8a'
    ctx.fillRect(0, 0, W, H)
    // sparkle rain — 14 diamonds on their own lanes, twinkling
    for (let i = 0; i < 14; i++) {
        const sx = 90 + rnd(i, 17) * (W - 140)
        const fall = (rnd(i, 31) + k * (0.28 + rnd(i, 53) * 0.22)) % 1
        const sy = 110 + fall * (H - 150)
        const tw = 0.5 + 0.5 * Math.sin(t * 6 + i * 1.7)
        ctx.globalAlpha = 0.35 + tw * 0.5
        sparkle(ctx, sx + Math.sin(t * 2 + i) * 8, sy, 3 + tw * 2.4)
    }
    ctx.globalAlpha = 1
    // new-defender presentation (final level unlocks nothing — wash + sparkles only)
    const nid = Object.keys(PLANTS).find((pid) => PLANTS[pid].unlock === g.level + 1)
    if (!nid) return
    const def = PLANTS[nid]
    const cw = 150, ch = 176
    const cx = Math.round(GLX + (COLS * CW) / 2), cy = 330
    const pop = Math.min(1, k / 0.45)
    const sc = pop < 1 ? 0.35 + 0.65 * pop : 1 + Math.sin(t * 2.6) * 0.02
    ctx.globalAlpha = Math.min(1, pop * 1.8)
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy)
    // classic banner: gold ribbon band with V-notched tails + dark folds behind
    // the board, the headline riding the band
    const ry = cy - ch / 2 - 10
    ctx.fillStyle = '#8a5a1c'
    for (const s of [-1, 1]) {
        const ex = cx + s * (cw / 2 + 34)
        ctx.beginPath()
        ctx.moveTo(cx + s * (cw / 2 - 2), ry - 13); ctx.lineTo(ex, ry - 13)
        ctx.lineTo(ex - s * 12, ry); ctx.lineTo(ex, ry + 13)
        ctx.lineTo(cx + s * (cw / 2 - 2), ry + 13)
        ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = '#5a3410'
    for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(cx + s * (cw / 2 + 10), ry + 13); ctx.lineTo(cx + s * (cw / 2 + 10), ry + 21)
        ctx.lineTo(cx + s * (cw / 2 + 2), ry + 13)
        ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = 'rgba(43,29,18,0.88)'
    rr(ctx, cx - cw / 2 - 10, cy - ch / 2 - 26, cw + 20, ch + 42, 12); ctx.fill()
    ctx.strokeStyle = '#e4a52b'; ctx.lineWidth = 2
    rr(ctx, cx - cw / 2 - 10, cy - ch / 2 - 26, cw + 20, ch + 42, 12); ctx.stroke()
    ctx.fillStyle = '#ffd24a'
    rr(ctx, cx - cw / 2 - 10, ry - 13, cw + 20, 26, 5); ctx.fill()
    ctx.strokeStyle = '#8a5a1c'; ctx.lineWidth = 1
    rr(ctx, cx - cw / 2 - 10, ry - 13, cw + 20, 26, 5); ctx.stroke()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#4c2f1a'; ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText('NEW DEFENDER', cx, ry + 1)
    // the defender's own portrait plate at presentation scale, gilded (sel=true)
    drawCardPortrait(ctx, nid, cx - cw / 2, cy - ch / 2 + 14, cw, 96, t, true)
    // name + cost under the plate
    ctx.fillStyle = C.cream; ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText(def.name.toUpperCase(), cx, cy + ch / 2 - 8)
    drawAcornIcon(ctx, cx - 22, cy + ch / 2 + 4, 16)
    ctx.fillStyle = C.cream; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(String(def.cost), cx - 10, cy + ch / 2 + 4)
    ctx.restore()
    ctx.globalAlpha = 1
}

// ---------------------------------------------------------- card tray ----
// #1832: the board contents sit right of x=128 — the site's top-left chrome
// (ARCADE at y 12-38, FEEDBACK at y 44-70, each ~95px wide) owns the corner,
// and a 4:3-ish pane insets the canvas to within a few pixels of that edge.
export function drawTray(ctx, g, hover, shake) {
    // wooden board
    const grd = ctx.createLinearGradient(0, 0, 0, TRAY_H)
    grd.addColorStop(0, C.trayWoodHi); grd.addColorStop(1, C.trayWood)
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, TRAY_H)
    ctx.fillStyle = C.trayWoodDark; ctx.fillRect(0, TRAY_H - 4, W, 4)
    // acorn purse (inset so the site's top-left chrome never covers it)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, 128, 14, 78, 76, 10); ctx.fill()
    drawAcornIcon(ctx, 167, 40, 34)
    ctx.fillStyle = C.cream; ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(g.acorns), 167, 68)
    // cards — themed portrait plate + name so each defender reads at a glance
    const cardW = 64, cardH = 78, gap = 8
    const startX = 218
    const SHORT = { daisy: 'DAISY', squirrel: 'SQUIRREL', hedge: 'HEDGE', chili: 'CHILI', frost: 'FROST', pumpkin: 'PUMPKIN' }
    for (let i = 0; i < g.unlocked.length; i++) {
        const id = g.unlocked[i]
        const def = PLANTS[id]
        // #1832: a refused plant rattles its card (shell decays shake.k 1 -> 0)
        const shx = (shake && shake.i === i) ? Math.round(Math.sin(g.sec * 46) * 3 * shake.k) : 0
        const x = startX + i * (cardW + gap) + shx, y = 12
        const sel = !g.trowel && g.sel === i
        const cd = g.cd[id] || 0
        const afford = g.acorns >= def.cost
        ctx.fillStyle = sel ? '#fff3cf' : '#efe0bd'
        rr(ctx, x, y, cardW, cardH, 7); ctx.fill()
        ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#e4a52b' : 'rgba(90,60,30,0.5)'
        rr(ctx, x, y, cardW, cardH, 7); ctx.stroke()
        // portrait plate — a posed vignette in the defender's own colour inside
        // a beveled, riveted frame (#2328); it breathes on the sim clock.
        drawCardPortrait(ctx, id, x + 5, y + 5, cardW - 10, 40, g.sec, sel)
        // name plate
        ctx.fillStyle = C.ink; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(SHORT[id] || def.name.slice(0, 8).toUpperCase(), x + cardW / 2, y + 52)
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
    // #2328: the trowel card gets the same framed plate language as the defenders
    ctx.fillStyle = 'rgba(43,29,18,0.35)'; rr(ctx, tx + 5, 17, cardW - 10, 40, 5); ctx.fill()
    ctx.save(); rr(ctx, tx + 5, 17, cardW - 10, 40, 5); ctx.clip()
    drawTrowel(ctx, tx + cardW / 2, 12 + 30)
    ctx.restore()
    drawPlateFrame(ctx, tx + 5, 17, cardW - 10, 40, g.trowel)
    ctx.fillStyle = C.ink; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('TROWEL', tx + cardW / 2, 12 + cardH - 12)
    if (hover && hover.kind === 'trowel') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(ctx, tx - 1, 11, cardW + 2, cardH + 2, 8); ctx.stroke() }
}

function drawTrowel(ctx, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.38)
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
        // recoil right after firing: cool resets to def.rate, so (def.rate - p.cool)
        // is time-since-shot; squash + kick the body back off the muzzle.
        const rec = Math.max(0, 1 - (def.rate - p.cool) / 0.14)
        ctx.save(); ctx.translate(sway * 0.4 - rec * 3, 0); ctx.scale(1 - rec * 0.14, 1 + rec * 0.1)
        drawPlantIcon(ctx, p.type, 0, 0, 34)
        ctx.restore()
        if (rec > 0.5) {
            const mx = 12, my = -6
            ctx.fillStyle = def.kind === 'frost' ? 'rgba(191,240,255,0.85)' : 'rgba(255,230,168,0.9)'
            ctx.beginPath(); ctx.arc(mx, my, 3 + rec * 4, 0, 7); ctx.fill()
        }
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
    const type = e.id
    const sprint = type === 'sprinter'
    const heavy = type === 'brute' || type === 'warlord'
    const ph = e.anim
    // gait: Sprinter = quick low bob, Brute = slow heavy dip, Grunt/Pup = the classic roll
    let bob
    if (heavy) bob = e.eat ? Math.sin(t * 11) * 2.4 : Math.sin(ph) * 3.2
    else if (sprint) bob = e.eat ? Math.sin(t * 18) * 2 : Math.sin(ph * 2) * 1.4
    else bob = e.eat ? Math.sin(t * 16) * 2 : Math.sin(ph) * 2.2
    // Sprinter leans into the run; eaters lunge at the plant
    let lean = e.eat ? 0.12 : (sprint ? -0.14 : heavy ? 0.04 : 0)
    ctx.save(); ctx.translate(e.x, cy + bob)
    ctx.rotate(lean)
    const slowed = e.slowT > 0
    const flash = type === 'warlord' ? '#3f6b22' : def.color
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, def.r * 0.7, def.r * 0.8, 5, 0, 0, 7); ctx.fill()
    // brute ground-shake dust at each footfall (the dip of the bob)
    if (heavy && !e.eat && Math.sin(ph) < -0.72) {
        ctx.fillStyle = 'rgba(120,90,55,0.32)'
        for (let k = 0; k < 3; k++) { const dx = (k - 1) * 5 + rnd(e.r, k) * 3; ctx.beginPath(); ctx.arc(dx, def.r * 0.72, 2.6 - k * 0.6, 0, 7); ctx.fill() }
    }
    // legs — per-gait cycle (Sprinter quickens, Brute drives wider)
    const stride = heavy ? 7 : sprint ? 6 : 5
    const legPhase = sprint ? ph * 2 : ph
    const step = Math.sin(legPhase)
    const step2 = Math.sin(legPhase + Math.PI * 0.6)
    ctx.strokeStyle = '#3a5a20'; ctx.lineWidth = def.r * (heavy ? 0.32 : 0.26); ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-2, def.r * 0.2); ctx.lineTo(-2 + step * stride, def.r * 0.72)
    ctx.moveTo(2, def.r * 0.2); ctx.lineTo(2 - step2 * stride, def.r * 0.72)
    ctx.stroke()
    // tail — Grunt/Pup carry a wagging one behind the body (a stub on the Grunt)
    if (type === 'pup' || type === 'grunt') {
        const wag = Math.sin(ph * 1.5) * (type === 'pup' ? 1 : 0.55)
        ctx.strokeStyle = def.color; ctx.lineWidth = def.r * (type === 'pup' ? 0.26 : 0.2); ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(def.r * 0.55, -def.r * 0.1)
        ctx.quadraticCurveTo(def.r * 1.0, -def.r * 0.2 + wag * def.r * 0.35, def.r * 1.15, -def.r * 0.5 + wag * def.r * 0.5)
        ctx.stroke()
    }
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
// #1832: the lane saver used to be a 9px lantern dot that read as a porch lamp.
// Now it is a real scarecrow (pole + cross-arms + burlap head + scarf): gold
// glow while armed, grey and head-tilted once it has swept. ~44px tall, so a
// newcomer can count five of them and tell the spent ones.
function scarecrowAt(ctx, x, gy, armed, tilt = 0) {
    ctx.save()
    ctx.translate(x, gy); ctx.rotate(tilt)
    if (armed) { ctx.fillStyle = 'rgba(255,210,74,0.30)'; ctx.beginPath(); ctx.arc(0, -26, 17, 0, 7); ctx.fill() }
    const wood = armed ? '#8a5a2c' : '#5a5a56'
    const burlap = armed ? '#d8b98c' : '#9a9a90'
    // pole + cross-arms
    ctx.fillStyle = wood; ctx.fillRect(-1.5, -40, 3, 40)
    ctx.fillRect(-13, -31, 26, 3)
    // scarf
    ctx.fillStyle = armed ? '#c23b2e' : '#6a6a66'; ctx.fillRect(-5, -26, 10, 4)
    // burlap head
    ctx.fillStyle = burlap; ctx.beginPath(); ctx.arc(0, -33, 7, 0, 7); ctx.fill()
    // straw fringe
    ctx.fillStyle = armed ? '#c9a24b' : '#7a7a72'
    for (let k = -2; k <= 2; k++) ctx.fillRect(k * 3 - 1, -27, 2, 4)
    // eyes
    ctx.fillStyle = armed ? '#2b1d12' : '#4a4a46'
    ctx.beginPath(); ctx.arc(-2.6, -34, 1.1, 0, 7); ctx.arc(2.6, -34, 1.1, 0, 7); ctx.fill()
    ctx.restore()
}

export function drawMower(ctx, r, prog, armed) {
    const gy = rowY(r) + 20
    if (prog > 0) {
        const mx = prog
        // motion blur bar
        ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fillRect(HOUSE_X - 4, gy - 8, mx - (HOUSE_X - 4), 14)
        scarecrowAt(ctx, mx, gy, true)
    }
    // parked scarecrow on the cottage line: gold while armed, grey when spent
    scarecrowAt(ctx, HOUSE_X - 8, gy, armed !== false, armed === false ? -0.1 : 0)
}

// ------------------------------------------------------------ cursor ----
// #1832: `ghost` (default true for the attract-era call shape) — the translucent
// defender read as a planted one that goblins walked straight through, so the
// shell only passes true once the player has actually used the keyboard cursor.
export function drawCursor(ctx, g, ghost = true) {
    if (g.done) return
    const x = GLX + g.cursor.c * CW, y = GLY + g.cursor.r * CH
    const blink = Math.floor(g.tick / 12) % 2 === 0
    ctx.strokeStyle = g.trowel ? (blink ? '#ffd24a' : '#fff') : (blink ? '#fff3cf' : '#7fd0ff')
    ctx.lineWidth = 3
    rr(ctx, x + 2, y + 2, CW - 4, CH - 4, 8); ctx.stroke()
    ctx.lineWidth = 1
    // ghost of the selected defender
    if (ghost && !g.trowel && g.unlocked[g.sel]) {
        ctx.globalAlpha = 0.5
        drawPlantIcon(ctx, g.unlocked[g.sel], x + CW / 2, y + CH / 2, 30)
        ctx.globalAlpha = 1
    }
}

// -------------------------------------------------------------- HUD ----
// #1832: the whole HUD lives in the 28px strip BELOW the lawn (y 572..600).
// The old panel (y 548..582) painted over row 5's grass — plants and goblins
// in the left columns sat under the LEVEL text and the wave bar.
export function drawHud(ctx, g, bigUp) {
    const y0 = GLY + ROWS * CH // 572 — the lawn's bottom edge
    const bx = 10, by = y0 + 2, bw = 372, bh = H - y0 - 4 // 24px panel, off the grass
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = 'rgba(40,24,12,0.6)'; rr(ctx, bx, by, bw, bh, 6); ctx.fill()
    // level label
    ctx.fillStyle = C.cream; ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(`LEVEL ${g.level}`, bx + 10, by + 16)
    // wave progress bar
    const pxx = bx + 92, pby = by + 7, pbw = 170, pbh = 10
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, pxx, pby, pbw, pbh, 5); ctx.fill()
    const frac = Math.min(1, (g.spawned) / Math.max(1, g.totalSpawns))
    ctx.fillStyle = bigUp ? '#e23b2e' : '#7cb042'; rr(ctx, pxx, pby, Math.max(pbh, pbw * frac), pbh, 5); ctx.fill()
    // wave flag markers
    let acc = 0
    for (const w of g.waves) { acc += w.entries.length; const fx = pxx + pbw * (acc / Math.max(1, g.totalSpawns)); ctx.fillStyle = w.big ? '#e23b2e' : '#4a7228'; ctx.fillRect(fx - 1, pby - 3, 2, 6) }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pxx + pbw * frac, pby + pbh / 2, 4, 0, 7); ctx.fill()
    ctx.strokeStyle = bigUp ? '#e23b2e' : 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke()
    // scarecrow-mower pips: one per lane — gold while armed, grey once spent (#1832)
    for (let r = 0; r < ROWS; r++) {
        const px = pxx + pbw + 18 + r * 16
        const armed = g.mowers[r]
        ctx.strokeStyle = armed ? '#ffd24a' : '#6a6a64'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(px, pby + 2); ctx.lineTo(px, pby + 10); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(px - 3.5, pby + 4.5); ctx.lineTo(px + 3.5, pby + 4.5); ctx.stroke()
        ctx.fillStyle = armed ? '#ffd24a' : '#8a8a84'
        ctx.beginPath(); ctx.arc(px, pby + 1.5, 2.6, 0, 7); ctx.fill()
    }
}
