// THE BARD'S TALE — the painter. Everything here draws from a pure sim state;
// it never mutates or reads the clock except the animation phase `t` handed in.
// Dungeons render as coloured first-person walls (raycast DDA, shaded per floor
// palette — deliberately warmer and fuller than TEN-DEEP's green wireframe);
// Skara Brae renders as a bright overhead town; monsters are animated procedural
// portraits sized by their range band. No images, no external assets.

import { BANDS } from './sim.js'

export const VW = 256
export const VH = 224

const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1]

function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    r = Math.max(0, Math.min(255, Math.round(r * k)))
    g = Math.max(0, Math.min(255, Math.round(g * k)))
    b = Math.max(0, Math.min(255, Math.round(b * k)))
    return `rgb(${r},${g},${b})`
}

// ---------------------------------------------------------------- dungeon view ----
// DDA raycast, symmetric FOV. depth in cells; brightness falls off with distance.
export function drawDungeon(ctx, st, t) {
    const pal = st.map.palette
    const horizon = Math.round(VH * 0.44)
    const bob = Math.sin(t / 260) * 2

    // ceiling + floor
    const cg = ctx.createLinearGradient(0, 0, 0, horizon)
    cg.addColorStop(0, shade(pal.ceil, 0.6)); cg.addColorStop(1, pal.ceil)
    ctx.fillStyle = cg; ctx.fillRect(0, 0, VW, horizon)
    const fg = ctx.createLinearGradient(0, horizon, 0, VH)
    fg.addColorStop(0, shade(pal.floor, 0.7)); fg.addColorStop(1, shade(pal.floor, 1.6))
    ctx.fillStyle = fg; ctx.fillRect(0, horizon, VW, VH - horizon)

    // floor rungs for a sense of travel
    ctx.strokeStyle = shade(pal.floor, 1.2); ctx.lineWidth = 1
    for (let i = 1; i <= 5; i++) {
        const y = horizon + Math.pow(i / 5, 2) * (VH - horizon)
        ctx.globalAlpha = 0.35
        ctx.beginPath(); ctx.moveTo(0, y + bob * (i / 5)); ctx.lineTo(VW, y + bob * (i / 5)); ctx.stroke()
    }
    ctx.globalAlpha = 1

    const size = st.map.size
    const dirX = HX[st.dir], dirY = HY[st.dir]
    const planeX = -dirY * 0.66, planeY = dirX * 0.66
    const N = 64
    const colW = VW / N
    const range = 8
    for (let s = 0; s < N; s++) {
        const camX = (2 * s) / N - 1
        let rdx = dirX + planeX * camX, rdy = dirY + planeY * camX
        let mapX = Math.floor(st.x + 0.5), mapY = Math.floor(st.y + 0.5)
        const ddx = Math.abs(1 / (rdx || 1e-6)), ddy = Math.abs(1 / (rdy || 1e-6))
        let stepX, stepY, sideX, sideY
        if (rdx < 0) { stepX = -1; sideX = (st.x + 0.5 - mapX) * ddx } else { stepX = 1; sideX = (mapX + 1 - (st.x + 0.5)) * ddx }
        if (rdy < 0) { stepY = -1; sideY = (st.y + 0.5 - mapY) * ddy } else { stepY = 1; sideY = (mapY + 1 - (st.y + 0.5)) * ddy }
        let hit = 0, side = 0
        for (let g = 0; g < 64 && !hit; g++) {
            if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0 } else { sideY += ddy; mapY += stepY; side = 1 }
            if (mapX < 0 || mapY < 0 || mapX >= size || mapY >= size) { hit = 1; break }
            if (st.map.grid[mapY * size + mapX] === 1) hit = 1
        }
        const dist = Math.max(0.6, (side === 0 ? sideX - ddx : sideY - ddy))
        const lineH = Math.min(VH * 2, Math.floor(VH / dist))
        const top = horizon - lineH / 2 + bob
        const lit = Math.max(0.35, 1 - dist / range)
        ctx.fillStyle = shade(side === 1 ? pal.wall : pal.wallLit, lit)
        ctx.fillRect(Math.floor(s * colW), top, Math.ceil(colW) + 1, lineH)
        // faint vertical seam so columns read as blocks
        ctx.fillStyle = shade(pal.wall, lit * 0.7)
        ctx.fillRect(Math.floor(s * colW), top, 1, lineH)
    }
}

// ---------------------------------------------------------------- town view ----
export function drawTown(ctx, st, t) {
    const m = st.map
    ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, VW, VH)
    const tile = 14
    const ox = Math.round((VW - m.w * tile) / 2), oy = 8
    for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
            const px = ox + x * tile, py = oy + y * tile
            const sp = m.specials.get(y * m.w + x)
            if (m.wall(x, y)) {
                ctx.fillStyle = '#2a2f3a'; ctx.fillRect(px, py, tile, tile)
                ctx.fillStyle = '#3a4150'; ctx.fillRect(px + 1, py + 1, tile - 2, 3)
            } else {
                ctx.fillStyle = '#12301f'; ctx.fillRect(px, py, tile, tile)
                if (sp) {
                    ctx.fillStyle = '#c9a227'
                    ctx.font = 'bold 10px monospace'
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                    const glyph = { guild: 'G', garth: 'E', tavern: 'T', temple: '+', board: 'R', sewer: 'S', towergate: 'M' }[sp.kind]
                    ctx.fillText(glyph, px + tile / 2, py + tile / 2 + 1)
                }
            }
        }
    }
    // party marker
    const pulse = (t % 700) / 700
    ctx.fillStyle = `rgba(80,220,120,${0.9 - pulse * 0.5})`
    ctx.beginPath(); ctx.arc(ox + st.x * tile + tile / 2, oy + st.y * tile + tile / 2, 4 + pulse * 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#eafff0'
    ctx.beginPath(); ctx.arc(ox + st.x * tile + tile / 2, oy + st.y * tile + tile / 2, 2.5, 0, Math.PI * 2); ctx.fill()
    // facing nub
    ctx.strokeStyle = '#eafff0'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ox + st.x * tile + tile / 2, oy + st.y * tile + tile / 2)
    ctx.lineTo(ox + st.x * tile + tile / 2 + HX[st.dir] * 7, oy + st.y * tile + tile / 2 + HY[st.dir] * 7)
    ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
}

// ---------------------------------------------------------------- minimap ----
export function drawMinimap(ctx, st) {
    if (st.fi < 0) return
    const size = st.map.size
    const cell = 2, ox = VW - size * cell - 6, oy = 6
    ctx.fillStyle = 'rgba(10,12,16,0.4)'; ctx.fillRect(ox - 3, oy - 3, size * cell + 6, size * cell + 6)
    ctx.strokeStyle = 'rgba(245,196,90,0.7)'; ctx.lineWidth = 1
    ctx.strokeRect(ox - 3 + 0.5, oy - 3 + 0.5, size * cell + 5, size * cell + 5)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!st.explored.has(y * size + x)) continue
            ctx.fillStyle = st.map.wall(x, y) ? '#4a5262' : '#20242c'
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell)
        }
    }
    const mark = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * cell - 1, oy + y * cell - 1, cell + 2, cell + 2) }
    if (st.map.stairs) mark(st.map.stairs.x, st.map.stairs.y, '#5ad1ff')
    if (st.map.boss) mark(st.map.boss.x, st.map.boss.y, '#ff5ad1')
    if (st.map.key && !st.hasFloorKey && st.explored.has(st.map.key.y * size + st.map.key.x)) mark(st.map.key.x, st.map.key.y, '#ffe14a')
    mark(st.x, st.y, '#7dffa0')
}

// ---------------------------------------------------------- monster portraits ----
// Each art key is a distinct silhouette drawn procedurally, bobbing with t and
// flashing red on hit (hitFlash 0..1). Sized by caller via s (0..1 scale).
export function drawMonster(ctx, art, cx, cy, s, t, hitFlash = 0) {
    const bob = Math.sin(t / 220 + cx) * 3 * s
    const pal = {
        rat: '#7a5a3a', spider: '#2a2430', ratking: '#8a6a2a', slime: '#4ad14a', troll: '#5f9462',
        skelet: '#e8e8d8', ghost: '#bcd0e0', wight: '#7d6a8a', gargoyle: '#6a7080', orc: '#5a7a3a',
        warlord: '#b04040', gremlin: '#7aa02a', mage: '#6f86d8', demon: '#c03030', wraith: '#3a2a4a',
        mangar: '#6e4fa0',
    }[art] || '#c8b050'
    const flash = hitFlash > 0 ? `rgb(255,${Math.round(120 * (1 - hitFlash))},${Math.round(120 * (1 - hitFlash))})` : pal
    ctx.save(); ctx.translate(cx, cy + bob); ctx.scale(s, s)
    ctx.lineJoin = 'round'
    const E = () => { // shared eye glint
        ctx.fillStyle = flash
    }
    switch (art) {
        case 'rat': case 'ratking': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.ellipse(0, 6, 22, 14, 0, 0, 7); ctx.fill()
            ctx.beginPath(); ctx.arc(-6, -8, 7, 0, 7); ctx.arc(6, -8, 7, 0, 7); ctx.fill()
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-7, 2, 2, 0, 7); ctx.arc(7, 2, 2, 0, 7); ctx.fill()
            if (art === 'ratking') { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(-9, -26); ctx.lineTo(-4, -18); ctx.lineTo(0, -26); ctx.lineTo(4, -18); ctx.lineTo(9, -26); ctx.lineTo(14, -18); ctx.fill() }
            break
        }
        case 'spider': {
            ctx.strokeStyle = flash; ctx.lineWidth = 3
            for (let i = -2; i <= 2; i++) {
                if (i === 0) continue
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(i * 12, -14); ctx.lineTo(i * 16, 4); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(i * 12, 18); ctx.lineTo(i * 16, 30); ctx.stroke()
            }
            ctx.fillStyle = flash; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill()
            ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, 7); ctx.arc(4, -2, 2, 0, 7); ctx.fill()
            break
        }
        case 'slime': {
            ctx.fillStyle = flash; ctx.globalAlpha = 0.85
            ctx.beginPath(); ctx.moveTo(-20, 18); ctx.quadraticCurveTo(-22, -12, 0, -14); ctx.quadraticCurveTo(22, -12, 20, 18); ctx.closePath(); ctx.fill()
            ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, 0, 3, 0, 7); ctx.arc(6, 0, 3, 0, 7); ctx.fill()
            break
        }
        case 'troll': case 'orc': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(-14, -6); ctx.lineTo(14, -6); ctx.lineTo(18, 24); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(0, -14, 13, 0, 7); ctx.fill()
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-7, -12); ctx.lineTo(-3, -6); ctx.lineTo(-9, -6); ctx.fill(); ctx.moveTo(7, -12); ctx.lineTo(3, -6); ctx.lineTo(9, -6); ctx.fill()
            ctx.fillStyle = '#180a0a'; ctx.beginPath(); ctx.arc(-5, -16, 2, 0, 7); ctx.arc(5, -16, 2, 0, 7); ctx.fill()
            break
        }
        case 'skelet': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.arc(0, -14, 12, 0, 7); ctx.fill()
            ctx.fillRect(-3, -6, 6, 26)
            ctx.strokeStyle = flash; ctx.lineWidth = 3
            ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(14, 2); ctx.moveTo(-12, 10); ctx.lineTo(12, 10); ctx.stroke()
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-5, -14, 3, 0, 7); ctx.arc(5, -14, 3, 0, 7); ctx.fill()
            break
        }
        case 'ghost': case 'wraith': {
            ctx.globalAlpha = 0.8
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-14, 24); ctx.quadraticCurveTo(-18, -16, 0, -18); ctx.quadraticCurveTo(18, -16, 14, 24);
            ctx.lineTo(7, 16); ctx.lineTo(2, 24); ctx.lineTo(-4, 16); ctx.lineTo(-9, 24); ctx.closePath(); ctx.fill()
            ctx.globalAlpha = 1; ctx.fillStyle = art === 'wraith' ? '#ff2040' : '#20304a'
            ctx.beginPath(); ctx.arc(-5, -8, 2.5, 0, 7); ctx.arc(5, -8, 2.5, 0, 7); ctx.fill()
            break
        }
        case 'gargoyle': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-16, 20); ctx.lineTo(-10, -8); ctx.lineTo(10, -8); ctx.lineTo(16, 20); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(-20, -20); ctx.lineTo(-6, -12); ctx.fill(); ctx.moveTo(12, -6); ctx.lineTo(20, -20); ctx.lineTo(6, -12); ctx.fill()
            ctx.beginPath(); ctx.arc(0, -12, 9, 0, 7); ctx.fill()
            ctx.fillStyle = '#ff8020'; ctx.beginPath(); ctx.arc(-4, -12, 2, 0, 7); ctx.arc(4, -12, 2, 0, 7); ctx.fill()
            break
        }
        case 'gremlin': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.arc(0, -8, 11, 0, 7); ctx.fill()
            ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-15, -24); ctx.lineTo(-4, -16); ctx.fill(); ctx.moveTo(10, -12); ctx.lineTo(15, -24); ctx.lineTo(4, -16); ctx.fill()
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4, -9, 2, 0, 7); ctx.arc(4, -9, 2, 0, 7); ctx.fill()
            ctx.fillRect(-8, 4, 16, 14)
            break
        }
        case 'mage': case 'wizard': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-16, 24); ctx.lineTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(16, 24); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(0, -28); ctx.lineTo(12, -6); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(0, -6, 6, 0, 7); ctx.fill()
            ctx.fillStyle = '#8fe0ff'; ctx.beginPath(); ctx.arc(-3, -7, 1.5, 0, 7); ctx.arc(3, -7, 1.5, 0, 7); ctx.fill()
            break
        }
        case 'warlord': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-20, 26); ctx.lineTo(-15, -4); ctx.lineTo(15, -4); ctx.lineTo(20, 26); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(0, -12, 12, 0, 7); ctx.fill()
            ctx.fillStyle = '#2a1010'; ctx.fillRect(-11, -14, 22, 5)
            ctx.strokeStyle = '#d0b060'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(16, -18); ctx.lineTo(26, 8); ctx.stroke()
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-4, -11, 2, 0, 7); ctx.arc(4, -11, 2, 0, 7); ctx.fill()
            break
        }
        case 'demon': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-16, 22); ctx.lineTo(-12, -6); ctx.lineTo(12, -6); ctx.lineTo(16, 22); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(0, -12, 11, 0, 7); ctx.fill()
            ctx.strokeStyle = flash; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(-16, -28); ctx.moveTo(10, -18); ctx.lineTo(16, -28); ctx.stroke()
            ctx.fillStyle = '#ffe040'; ctx.beginPath(); ctx.arc(-4, -12, 2, 0, 7); ctx.arc(4, -12, 2, 0, 7); ctx.fill()
            break
        }
        case 'mangar': {
            ctx.fillStyle = flash
            ctx.beginPath(); ctx.moveTo(-22, 28); ctx.lineTo(-10, -6); ctx.lineTo(10, -6); ctx.lineTo(22, 28); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(0, -12, 13, 0, 7); ctx.fill()
            ctx.beginPath(); ctx.moveTo(-11, -18); ctx.lineTo(-20, -34); ctx.lineTo(-6, -22); ctx.fill(); ctx.moveTo(11, -18); ctx.lineTo(20, -34); ctx.lineTo(6, -22); ctx.fill()
            ctx.fillStyle = '#120b1c'; ctx.beginPath(); ctx.arc(0, -12, 7, 0, 7); ctx.fill()
            ctx.fillStyle = '#b060ff'; ctx.beginPath(); ctx.arc(-4, -13, 2, 0, 7); ctx.arc(4, -13, 2, 0, 7); ctx.fill()
            ctx.strokeStyle = '#7040b0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(20, -22); ctx.lineTo(28, 16); ctx.stroke()
            break
        }
        default: {
            ctx.fillStyle = flash; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill()
        }
    }
    ctx.restore()
    E()
}

// monsters of a combat placed across the view, scaled by their band distance
export function drawCombatMobs(ctx, st, t) {
    if (!st.combat) return
    const alive = st.combat.mobs.map((m, i) => ({ m, i })).filter((x) => x.m.hp > 0)
    const n = alive.length
    alive.forEach((x, k) => {
        const frac = n === 1 ? 0.5 : (k + 1) / (n + 1)
        const cx = Math.round(VW * frac)
        const depthScale = Math.max(0.45, 1.5 - x.m.band * 0.28)
        const cy = Math.round(VH * 0.40)
        if (x.i === st.target) {
            ctx.strokeStyle = 'rgba(255,240,120,0.8)'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(cx, cy, 34 * depthScale, 0, 7); ctx.stroke()
        }
        const flash = x.m.flash || 0
        drawMonster(ctx, x.m.art, cx, cy, depthScale, t + k * 90, flash)
    })
}
