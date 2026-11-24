// STOMPTOWN renderer — canvas drawing only (no DOM, no state): every function
// takes the ctx and the live sim state, so stompcheck can import this in Node
// and pin the pure geometry (the coil/disc precedent). The look is the MODERN
// bar (#3094): Jon's prototype rendering — dusk skies, parallax skylines, neon
// roof edges, and three monsters with a glow rim and a shine.
//
// The monster cast is ours (GROG the ape, ZARRA the reptile, FENRIS the
// werewolf); none of it is copied from the 1986 original's sprites.

import { GROUND, W, H, MONSTERS, cityName, buildingsLeft } from './sim.js'

export const PALETTES = [
    { sky: ['#120a24', '#2c1440', '#5c2140', '#c24b3f'], sun: ['#ffd98a', '#ff9a4d', '#ffe099'], sunGlow: ['rgba(255,196,90,0.95)', 'rgba(255,140,80,0.55)', 'rgba(255,90,70,0)'], haze: '#c24b3f', ground: ['#241b2e', '#120d1a'], far: '#221536', mid: '#2c1b40', edge: '#ffb347' },
    { sky: ['#0a0f24', '#141c3a', '#283a5c', '#4d5f8a'], sun: ['#ffe9c9', '#f2a65e', '#fff3d0'], sunGlow: ['rgba(255,233,201,0.9)', 'rgba(242,166,94,0.5)', 'rgba(120,140,200,0)'], haze: '#4d5f8a', ground: ['#141826', '#0a0b14'], far: '#141c30', mid: '#1e2842', edge: '#9fd4ff' },
    { sky: ['#061a12', '#0d2a1f', '#1d4434', '#2e6b4a'], sun: ['#d8f3b0', '#8fd16a', '#eefcd0'], sunGlow: ['rgba(216,243,176,0.9)', 'rgba(143,209,106,0.5)', 'rgba(90,140,80,0)'], haze: '#2e6b4a', ground: ['#121c14', '#0a0f0c'], far: '#10231a', mid: '#173024', edge: '#7dffb0' },
    { sky: ['#160a2a', '#2a1240', '#452055', '#6b2d5c'], sun: ['#f3b0e0', '#e06aa8', '#ffd6ec'], sunGlow: ['rgba(243,176,224,0.9)', 'rgba(224,106,168,0.5)', 'rgba(140,60,110,0)'], haze: '#6b2d5c', ground: ['#1a1226', '#100c18'], far: '#221436', mid: '#2e1a42', edge: '#ff8ad8' },
    { sky: ['#1a1030', '#33204a', '#5a3558', '#8a4a5c'], sun: ['#ffc9a0', '#e87a4e', '#ffe0b8'], sunGlow: ['rgba(255,201,160,0.9)', 'rgba(232,122,78,0.5)', 'rgba(160,80,70,0)'], haze: '#8a4a5c', ground: ['#221a26', '#120e14'], far: '#2a1c30', mid: '#38243a', edge: '#ffcf7a' },
]
export const pal = (cityIndex) => PALETTES[cityIndex % PALETTES.length]

export function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// decorative skyline rows (builder takes an rng so this module stays pure)
export function buildSkyline(rng, minH, maxH) {
    const arr = []
    let x = -100
    while (x < W + 200) {
        const w = 70 + rng() * 80
        const h = minH + rng() * (maxH - minH)
        arr.push({ x, w, h })
        x += w + 8 + rng() * 18
    }
    return arr
}

export function makeStars(rng, n = 90) {
    return Array.from({ length: n }, () => ({ x: rng(), y: rng() * 0.55, r: rng() * 1.6 + 0.4, tw: rng() * 6.28 }))
}

export function makeClouds(rng, n = 4) {
    return Array.from({ length: n }, () => ({ x: rng(), y: 0.08 + rng() * 0.38, s: 60 + rng() * 90, sp: 6 + rng() * 9, a: 0.25 + rng() * 0.2 }))
}

// ------------------------------------------------------------------ sky ----
export function drawSky(ctx, cityIndex, t, stars, clouds) {
    const P = pal(cityIndex)
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, P.sky[0]); g.addColorStop(0.45, P.sky[1]); g.addColorStop(0.78, P.sky[2]); g.addColorStop(1, P.sky[3])
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    for (const s of stars) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.tw))
        ctx.fillStyle = `rgba(255,240,220,${0.5 * tw})`
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.28); ctx.fill()
    }
    const sx = W * 0.68, sy = H * 0.62, sr = 150
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, sr * 2.4)
    sg.addColorStop(0, P.sunGlow[0]); sg.addColorStop(0.35, P.sunGlow[1]); sg.addColorStop(1, P.sunGlow[2])
    ctx.fillStyle = sg; ctx.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8)
    ctx.fillStyle = P.sun[0]; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.28); ctx.fill()
    ctx.fillStyle = P.sun[1]; ctx.beginPath(); ctx.arc(sx, sy + 18, sr * 0.9, 0, 6.28); ctx.fill()
    ctx.fillStyle = hexA(P.sun[2], 0.9); ctx.beginPath(); ctx.arc(sx, sy, sr * 0.72, 0, 6.28); ctx.fill()
    ctx.save()
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.28); ctx.clip()
    for (let i = 0; i < 6; i++) {
        const y = sy + sr * 0.08 + i * (sr / 6.5)
        ctx.fillStyle = g
        ctx.fillRect(sx - sr, y, sr * 2, 2 + i * 2.2)
    }
    ctx.restore()
    for (const c of clouds) {
        const cx = ((c.x * W + t * c.sp) % (W + 500)) - 250
        const cy = c.y * H * 0.7
        ctx.fillStyle = `rgba(18,10,28,${c.a + 0.25})`
        ctx.beginPath(); ctx.ellipse(cx, cy, c.s, c.s * 0.26, 0, 0, 6.28); ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx - c.s * 0.55, cy + c.s * 0.12, c.s * 0.5, c.s * 0.18, 0, 0, 6.28); ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx + c.s * 0.5, cy + c.s * 0.14, c.s * 0.46, c.s * 0.16, 0, 0, 6.28); ctx.fill()
    }
    const hz = ctx.createLinearGradient(0, GROUND - 170, 0, GROUND)
    hz.addColorStop(0, hexA(P.haze, 0)); hz.addColorStop(1, hexA(P.haze, 0.55))
    ctx.fillStyle = hz; ctx.fillRect(0, GROUND - 170, W, 170)
}

export function drawSkylineRow(ctx, arr, parallax, color, winCol, camX, t) {
    ctx.save()
    ctx.translate(-camX * parallax, 0)
    for (const b of arr) {
        const y = GROUND - b.h
        ctx.fillStyle = color; ctx.fillRect(b.x, y, b.w, b.h)
        ctx.fillStyle = winCol
        for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 18) {
            for (let wy = y + 14; wy < GROUND - 20; wy += 26) {
                if (Math.sin(wx * 0.7 + wy * 1.3) > 0.2 && Math.sin(wy * 0.9 + wx * 1.7 + t * 0.4) > -0.4) {
                    ctx.globalAlpha = 0.55
                    ctx.fillRect(wx, wy, 5, 7)
                }
            }
        }
        ctx.globalAlpha = 1
    }
    ctx.restore()
}

export function drawGround(ctx, cityIndex) {
    const P = pal(cityIndex)
    const g = ctx.createLinearGradient(0, GROUND, 0, H)
    g.addColorStop(0, P.ground[0]); g.addColorStop(1, P.ground[1])
    ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND)
    ctx.strokeStyle = hexA(P.edge, 0.5); ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, GROUND + 1); ctx.lineTo(W, GROUND + 1); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 3; ctx.setLineDash([26, 30])
    ctx.beginPath(); ctx.moveTo(0, GROUND + 44); ctx.lineTo(W, GROUND + 44); ctx.stroke()
    ctx.setLineDash([])
}

// ------------------------------------------------------------ buildings ----
export function drawBuildings(ctx, gs, jit) {
    const camX = gs.camX
    const P = pal(gs.cityIndex)
    for (const b of gs.buildings) {
        if (!b.alive && !b.crumbling) continue
        const crumbling = !!b.crumbling
        const prog = crumbling ? Math.min(1, b.crumbling) : 0
        if (crumbling) {
            // THE FALL — a sequential top-down crush: the front drops floor by
            // floor and crushed floors land as thin jagged slabs, then the sim
            // flushes the body into rubble + 'landed'.
            const rows = b.rows
            const front = prog * (rows + 1)
            const lean = Math.sin(b.x * 0.013) * 14 * prog
            const shakeX = jit(-1.6, 1.6) * prog
            const x = b.x - camX + lean + shakeX
            if (x + b.w < -40 || x > W + 40) continue
            const hurt = 1 - b.hp / b.maxhp
            const ch = b.h / rows
            const cw = b.w / (b.cols + 1)
            const facade = `rgb(${34 + hurt * 8},${26 + hurt * 6},${44 + hurt * 10})`
            ctx.fillStyle = 'rgba(5,3,10,0.38)'
            ctx.beginPath(); ctx.ellipse(x + b.w / 2, GROUND + 9, b.w * 0.66, 11, 0, 0, 6.28); ctx.fill()
            let baseY = GROUND
            let capY = GROUND
            for (let r = rows - 1; r >= 0; r--) {
                const rp = Math.max(0, Math.min(1, front - r))
                const floorH = ch * (1 - rp * 0.92)
                const fy = baseY - floorH
                const jx = rp > 0 ? jit(-3.5, 3.5) * rp : 0
                const fx = x + jx
                capY = Math.min(capY, fy)
                if (rp >= 0.85) {
                    // fully crushed slab — flatter, warmer, darker
                    ctx.fillStyle = `rgb(${46 - rp * 12},${37 - rp * 9},${40 - rp * 9})`
                    ctx.fillRect(fx, fy, b.w, floorH)
                    ctx.fillStyle = 'rgba(255,190,120,0.85)'
                    ctx.fillRect(fx - 1, fy - 2, b.w + 2, 2.5)
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.6
                    ctx.beginPath()
                    ctx.moveTo(fx + b.w * 0.22, fy + 1); ctx.lineTo(fx + b.w * 0.4, fy + floorH - 1)
                    ctx.moveTo(fx + b.w * 0.66, fy + 2); ctx.lineTo(fx + b.w * 0.58, fy + floorH - 2)
                    ctx.stroke()
                } else {
                    ctx.fillStyle = facade
                    ctx.fillRect(fx, fy, b.w, floorH)
                    ctx.fillStyle = 'rgba(255,255,255,0.22)'
                    ctx.fillRect(fx + b.w - 3, fy, 3, floorH)
                    for (let c = 0; c < b.cols; c++) {
                        const win = b.wins[r * b.cols + c]
                        const wx = fx + cw * (c + 1) - cw * 0.28, ww = cw * 0.56
                        const wy = fy + floorH * 0.24
                        const wh = Math.min(floorH * 0.5, ch * 0.5)
                        if (win.shattered) {
                            ctx.fillStyle = '#04060d'; ctx.fillRect(wx, wy, ww, wh)
                            ctx.strokeStyle = 'rgba(210,230,255,0.4)'; ctx.lineWidth = 1
                            ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww * 0.42, wy + wh * 0.62); ctx.lineTo(wx + ww * 0.18, wy + wh); ctx.stroke()
                            continue
                        }
                        const flick = Math.sin(gs.tick / 60 * 2.2 + win.ph) > -0.85
                        if (win.lit && flick) {
                            ctx.fillStyle = win.warm ? 'rgba(255,209,102,0.92)' : 'rgba(140,200,255,0.9)'
                            ctx.fillRect(wx, wy, ww, wh)
                        } else {
                            ctx.fillStyle = 'rgba(10,12,22,0.85)'; ctx.fillRect(wx, wy, ww, wh)
                        }
                    }
                }
                // floor separation line
                ctx.fillStyle = 'rgba(0,0,0,0.42)'
                ctx.fillRect(fx, fy, b.w, 1.5)
                // the crush front — the floor currently falling, brightest lip
                if (rp > 0 && rp < 0.85) {
                    ctx.fillStyle = 'rgba(255,170,96,0.95)'
                    ctx.fillRect(fx - 2, fy - 3, b.w + 4, 3)
                }
                baseY = fy
            }
            // roof edge on the pile top (neon, or red when hurt)
            ctx.fillStyle = hurt > 0.5 ? '#ff5470' : P.edge
            ctx.fillRect(x - 2, capY - 4, b.w + 4, 5)
            continue
        }
        const drawH = b.h
        const x = b.x - camX, y = GROUND - drawH
        if (x + b.w < -40 || x > W + 40) continue
        const hurt = 1 - b.hp / b.maxhp
        const shift = drawH * 0.55
        ctx.fillStyle = 'rgba(5,3,10,0.34)'
        ctx.beginPath()
        ctx.moveTo(x, GROUND); ctx.lineTo(x + b.w, GROUND)
        ctx.lineTo(x + b.w - shift, GROUND + 15); ctx.lineTo(x - shift, GROUND + 15)
        ctx.closePath(); ctx.fill()
        const g = ctx.createLinearGradient(x, y, x + b.w, y)
        g.addColorStop(0, `rgb(${34 + hurt * 8},${26 + hurt * 6},${44 + hurt * 10})`)
        g.addColorStop(1, `rgb(${22 + hurt * 6},${18 + hurt * 4},${30 + hurt * 8})`)
        ctx.fillStyle = g; ctx.fillRect(x, y, b.w, drawH)
        ctx.fillStyle = hurt > 0.5 ? '#ff5470' : P.edge
        ctx.fillRect(x - 2, y - 4, b.w + 4, 5)
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.fillRect(x + b.w - 3, y, 3, drawH)
        if (b.h > 260) {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(x + b.w * 0.5, y - 4); ctx.lineTo(x + b.w * 0.5, y - 30); ctx.stroke()
            ctx.fillStyle = '#ff5470'; ctx.beginPath(); ctx.arc(x + b.w * 0.5, y - 32, 3, 0, 6.28); ctx.fill()
        }
        const cw = b.w / (b.cols + 1), ch = b.h / (b.rows + 1)
        for (let r = 0; r < b.rows; r++) {
            for (let c = 0; c < b.cols; c++) {
                const wy = y + ch * (r + 1) - ch * 0.26
                if (wy + ch * 0.5 > y + drawH) continue
                const win = b.wins[r * b.cols + c]
                const wx = x + cw * (c + 1) - cw * 0.28, ww = cw * 0.56, wh = ch * 0.5
                if (win.shattered) {
                    ctx.fillStyle = '#04060d'; ctx.fillRect(wx, wy, ww, wh)
                    ctx.strokeStyle = 'rgba(210,230,255,0.4)'; ctx.lineWidth = 1
                    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww * 0.42, wy + wh * 0.62); ctx.lineTo(wx + ww * 0.18, wy + wh); ctx.stroke()
                    ctx.beginPath(); ctx.moveTo(wx + ww, wy + wh * 0.3); ctx.lineTo(wx + ww * 0.55, wy + wh * 0.5); ctx.stroke()
                    continue
                }
                const flick = Math.sin(gs.tick / 60 * 2.2 + win.ph) > -0.85
                if (win.lit && flick) {
                    ctx.fillStyle = win.warm ? 'rgba(255,209,102,0.92)' : 'rgba(140,200,255,0.9)'
                    ctx.fillRect(wx, wy, ww, wh)
                    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(wx, wy, ww, 2)
                } else {
                    ctx.fillStyle = 'rgba(10,12,22,0.85)'; ctx.fillRect(wx, wy, ww, wh)
                }
            }
        }
        if (hurt > 0.2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x + b.w * 0.3, y + 6); ctx.lineTo(x + b.w * 0.45, y + drawH * 0.4); ctx.lineTo(x + b.w * 0.3, y + drawH * 0.72)
            if (hurt > 0.5) { ctx.moveTo(x + b.w * 0.7, y + 4); ctx.lineTo(x + b.w * 0.62, y + drawH * 0.5) }
            ctx.stroke()
        }
    }
}

export function drawRubble(ctx, gs) {
    for (const r of gs.rubbles) {
        const x = r.x - gs.camX
        if (x + r.w < -40 || x > W + 40) continue
        ctx.fillStyle = 'rgba(5,3,10,0.34)'
        ctx.beginPath(); ctx.ellipse(x + r.w / 2, GROUND + 4, r.w * 0.62, 4, 0, 0, 6.28); ctx.fill()
        ctx.fillStyle = '#3c3244'
        ctx.beginPath()
        ctx.moveTo(x, GROUND)
        for (let i = 0; i <= 8; i++) {
            const px = x + (r.w / 8) * i
            const py = GROUND - r.h * (0.4 + 0.6 * Math.abs(Math.sin(i * 2.1 + r.x)))
            ctx.lineTo(px, py)
        }
        ctx.lineTo(x + r.w, GROUND); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#54455a'
        for (let i = 0; i < 4; i++) ctx.fillRect(x + (r.w / 5) * i + 8, GROUND - r.h * 0.5 - (i % 2) * 10, 16, 12)
    }
}

// ------------------------------------------------------------- entities ----
export function drawCivilian(ctx, c, camX, t) {
    const x = c.x - camX, y = c.y
    if (x < -60 || x > W + 60) return
    if (!c.corpse) {
        ctx.fillStyle = 'rgba(5,3,10,0.38)'
        ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 3, 0, 0, 6.28); ctx.fill()
    }
    ctx.save(); ctx.translate(x, y)
    if (c.corpse) {
        ctx.rotate(1.5)
        ctx.fillStyle = '#caa27a'; ctx.fillRect(-8, -4, 26, 8)
        ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.arc(20, -4, 5, 0, 6.28); ctx.fill()
        ctx.restore(); return
    }
    const bob = Math.sin(c.wob * 9) * 2
    ctx.strokeStyle = '#3a2a3e'; ctx.lineWidth = 5; ctx.lineCap = 'round'
    const lp = Math.sin(c.wob * 9) * 6
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-6 + lp * 0.3, 0); ctx.moveTo(0, -22); ctx.lineTo(6 - lp * 0.3, 0); ctx.stroke()
    ctx.fillStyle = c.waving ? '#ffd166' : c.color
    ctx.fillRect(-8, -44 + bob, 16, 22)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-8, -44 + bob, 16, 5)
    ctx.fillStyle = '#e8b48a'; ctx.beginPath(); ctx.arc(0, -52 + bob, 7, 0, 6.28); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-2, -54 + bob, 3, 0, 6.28); ctx.fill()
    if (c.hat) { ctx.fillStyle = '#3a2a3e'; ctx.fillRect(-9, -60 + bob, 18, 5); ctx.fillRect(-6, -66 + bob, 12, 6) }
    ctx.strokeStyle = '#e8b48a'; ctx.lineWidth = 4
    const wave = c.waving ? Math.sin(t * 8 + c.wob) * 10 : Math.sin(c.wob * 9) * 3
    ctx.beginPath(); ctx.moveTo(-6, -40 + bob); ctx.lineTo(-14, -58 + bob - wave); ctx.moveTo(6, -40 + bob); ctx.lineTo(14, -58 + bob + wave); ctx.stroke()
    ctx.restore()
}

export function drawTank(ctx, tr, camX, t) {
    const x = tr.x - camX, y = tr.y
    if (x < -120 || x > W + 120) return
    ctx.fillStyle = 'rgba(5,3,10,0.4)'
    ctx.beginPath(); ctx.ellipse(x, y + 4, 40, 5, 0, 0, 6.28); ctx.fill()
    ctx.save(); ctx.translate(x, y)
    ctx.fillStyle = '#2c3a2a'; ctx.fillRect(-34, -26, 68, 22)
    ctx.fillStyle = '#22301f'; ctx.fillRect(-38, -8, 76, 12)
    ctx.fillStyle = '#37472f'; ctx.fillRect(-22, -40, 44, 16)
    ctx.fillStyle = '#1c2418'; ctx.fillRect(18, -36, 38, 6)
    ctx.fillStyle = '#161c12'; ctx.fillRect(52, -38, 5, 10)
    const beacon = Math.sin(t * 6 + tr.wob) > 0
    ctx.fillStyle = beacon ? '#ff5470' : '#7c2a3a'; ctx.beginPath(); ctx.arc(0, -42, 3.5, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#ff8a5c'; ctx.beginPath(); ctx.arc(-22, -28, 4, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#141b10'; ctx.fillRect(-38, -4, 76, 4)
    for (let i = -36; i <= 36; i += 12) ctx.fillRect(i, -7, 3, 4)
    ctx.restore()
}

export function drawCar(ctx, c, camX, t) {
    const x = c.x - camX, y = c.y
    if (x < -120 || x > W + 120) return
    ctx.fillStyle = 'rgba(5,3,10,0.38)'
    ctx.beginPath(); ctx.ellipse(x, y + 4, 36, 5, 0, 0, 6.28); ctx.fill()
    ctx.save(); ctx.translate(x, y)
    ctx.fillStyle = '#23303f'
    ctx.beginPath()
    ctx.moveTo(-32, -6); ctx.lineTo(-28, -22); ctx.lineTo(-6, -24); ctx.lineTo(4, -34); ctx.lineTo(26, -34); ctx.lineTo(32, -18); ctx.lineTo(34, -6); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#0d1219'
    ctx.beginPath(); ctx.arc(-18, -4, 9, 0, 6.28); ctx.arc(18, -4, 9, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#9fd4ff'; ctx.fillRect(-20, -22, 12, 8); ctx.fillRect(6, -32, 14, 8)
    const dir = (c.vx || 1) >= 0 ? 1 : -1
    ctx.fillStyle = 'rgba(255,230,170,0.12)'
    ctx.beginPath(); ctx.moveTo(dir * 32, -22); ctx.lineTo(dir * 110, -34); ctx.lineTo(dir * 110, -4); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#ffe9b0'; ctx.fillRect(dir * 30, -24, 4, 5)
    const flash = Math.sin(t * 14) > 0
    ctx.fillStyle = flash ? '#ff4444' : '#4488ff'; ctx.beginPath(); ctx.arc(0, -38, 5, 0, 6.28); ctx.fill()
    ctx.restore()
}

export function drawHeli(ctx, h, camX, t) {
    const x = h.x - camX, y = h.y
    if (x < -120 || x > W + 120) return
    ctx.fillStyle = 'rgba(5,3,10,0.3)'
    ctx.beginPath(); ctx.ellipse(x, GROUND, 30, 5, 0, 0, 6.28); ctx.fill()
    ctx.save(); ctx.translate(x, y)
    const tilt = Math.sin(t * 3 + h.wob) * 0.06
    ctx.rotate(tilt)
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.ellipse(0, -36, 74, 5, 0, 0, 6.28); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    const rw = 60 + Math.sin(t * 40) * 6
    ctx.beginPath(); ctx.moveTo(-rw, -34); ctx.lineTo(rw, -34); ctx.stroke()
    ctx.fillStyle = '#3c3244'; ctx.beginPath(); ctx.ellipse(0, -8, 30, 16, 0, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#4c4256'; ctx.beginPath(); ctx.ellipse(4, -14, 18, 10, 0, 0, 6.28); ctx.fill()
    ctx.strokeStyle = '#3c3244'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(26, -10); ctx.lineTo(52, -18); ctx.stroke()
    ctx.fillStyle = '#ff8a5c'; ctx.fillRect(-34, -12, 8, 10)
    const beacon = Math.sin(t * 5 + h.wob) > 0
    ctx.fillStyle = beacon ? '#ff5470' : '#5c2130'; ctx.beginPath(); ctx.arc(52, -19, 3.5, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(-12, -10, 4, 0, 6.28); ctx.fill()
    ctx.restore()
}

export function drawHuman(ctx, xw, y, dir, t) {
    if (xw < -80 || xw > W + 80) return
    ctx.fillStyle = 'rgba(5,3,10,0.38)'
    ctx.beginPath(); ctx.ellipse(xw, y + 4, 12, 3, 0, 0, 6.28); ctx.fill()
    ctx.save(); ctx.translate(xw, y); ctx.scale(dir || 1, 1)
    const bob = Math.sin(t * 10) * 2
    ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 6; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(-5 + Math.sin(t * 10) * 4, 0); ctx.moveTo(0, -26); ctx.lineTo(5 - Math.sin(t * 10) * 4, 0); ctx.stroke()
    ctx.fillStyle = '#d8cfc4'; ctx.fillRect(-9, -48 + bob, 18, 24)
    ctx.fillStyle = '#e8c4a0'; ctx.beginPath(); ctx.arc(0, -56 + bob, 8, 0, 6.28); ctx.fill()
    ctx.strokeStyle = '#e8c4a0'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(-7, -42 + bob); ctx.lineTo(-16, -62 + bob - Math.sin(t * 8) * 8); ctx.moveTo(7, -42 + bob); ctx.lineTo(16, -62 + bob + Math.sin(t * 8) * 8); ctx.stroke()
    ctx.restore()
}

export function drawBlimp(ctx, b, camX, t, human) {
    const x = b.x - camX, y = b.y + Math.sin(t * 1.4) * 6
    if (x < -260 || x > W + 260) return
    ctx.fillStyle = 'rgba(5,3,10,0.2)'
    ctx.beginPath(); ctx.ellipse(x, GROUND, 80, 7, 0, 0, 6.28); ctx.fill()
    ctx.save(); ctx.translate(x, y)
    ctx.fillStyle = '#5c2140'; ctx.beginPath(); ctx.ellipse(0, 0, 86, 34, 0, 0, 6.28); ctx.fill()
    ctx.fillStyle = '#7c2f4e'; ctx.beginPath(); ctx.ellipse(0, -6, 70, 22, 0, 0, 6.28); ctx.fill()
    ctx.strokeStyle = 'rgba(255,180,90,0.6)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(0, 0, 86, 34, 0, -0.5, 0.5); ctx.stroke()
    ctx.fillStyle = '#5c2140'
    ctx.beginPath(); ctx.moveTo(-80, 0); ctx.lineTo(-112, -18); ctx.lineTo(-112, 18); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(70, -22); ctx.lineTo(86, -40); ctx.lineTo(88, -18); ctx.closePath(); ctx.fill()
    const flick = Math.sin(t * 6) > 0 ? 1 : 0.3
    ctx.fillStyle = `rgba(255,209,102,${flick})`; ctx.beginPath(); ctx.arc(0, 26, 6, 0, 6.28); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-20, 30); ctx.lineTo(-14, 56); ctx.moveTo(20, 30); ctx.lineTo(14, 56); ctx.stroke()
    ctx.fillStyle = '#2a1b30'; ctx.fillRect(-18, 52, 36, 18)
    ctx.fillStyle = '#ffd166'; ctx.font = '700 9px ui-monospace, monospace'; ctx.textAlign = 'center'
    ctx.fillText('NEWS', 0, 64)
    if (human) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, 56); ctx.lineTo(0, 84); ctx.stroke()
        ctx.save(); ctx.translate(0, 84); ctx.scale(human.dir || 1, 1)
        ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-5, 0); ctx.moveTo(0, -18); ctx.lineTo(5, 0); ctx.stroke()
        ctx.fillStyle = '#d8cfc4'; ctx.fillRect(-7, -36, 14, 18)
        ctx.fillStyle = '#e8c4a0'; ctx.beginPath(); ctx.arc(0, -44, 6, 0, 6.28); ctx.fill()
        ctx.strokeStyle = '#e8c4a0'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(-13, -44 - Math.sin(t * 9) * 6); ctx.moveTo(6, -30); ctx.lineTo(13, -44 + Math.sin(t * 9) * 6); ctx.stroke()
        ctx.restore()
    }
    ctx.restore()
}

// ------------------------------------------------------------- monsters ----
// Pose helpers (pure — stompcheck pins the schedule): punch arm windup→snap,
// squash on land, idle sway.
export function punchT(attackT) {
    return attackT > 0 ? 1 - attackT / 16 : 0
}
export function armAngle(punchAim, t0) {
    if (t0 <= 0) return 0.38
    return punchAim === 'up' ? -0.72 : punchAim === 'down' ? 0.72 : 0
}

export function drawMonster(ctx, gs, t) {
    const p = gs.player
    const m = MONSTERS[gs.monster]
    const x = p.x - gs.camX, y = p.y
    const moving = Math.abs(p.vx) > 10
    const idle = p.onGround && !moving && p.attackT <= 0 && !p.climb && !p.reverting
    const lean = Math.max(-0.13, Math.min(0.13, p.vx * 0.00045))
    const punchP = punchT(p.attackT)
    const a0 = armAngle(p.punchAim, punchP)
    const bob = p.onGround ? Math.sin(p.walk * 2) * 3 : 0
    const sway = idle ? Math.sin(t * 2.2) * 2.2 : 0
    ctx.fillStyle = 'rgba(5,3,10,0.4)'
    ctx.beginPath(); ctx.ellipse(x, y + 4, 22, 5, 0, 0, 6.28); ctx.fill()
    const hurt = p.hurtT > 0 && Math.floor(t * 20) % 2 === 0
    const land = p.landT > 0 ? p.landT / 8 : 0
    const punchSquash = punchP > 0 ? Math.sin(Math.min(1, punchP) * Math.PI) * 0.12 : 0
    const squashY = 1 - punchSquash - land * 0.18
    const squashX = 1 + punchSquash * 0.7 + land * 0.16
    ctx.save()
    ctx.translate(x, y + bob + (idle ? sway : 0))
    if (hurt) ctx.globalAlpha = 0.4
    if (idle) ctx.rotate(Math.sin(t * 2.2) * 0.035)
    ctx.rotate(lean)
    ctx.scale(p.facing * squashX, squashY)
    ctx.shadowColor = m.glow; ctx.shadowBlur = 22
    const punching = punchP > 0
    const swing = punching ? 0 : Math.sin(p.walk * 2) * 0.16
    const a = a0 + swing
    if (m.body === 'ape') {
        ctx.strokeStyle = m.dark; ctx.lineWidth = 11; ctx.lineCap = 'round'
        const lp = Math.sin(p.walk * 2) * 10
        ctx.beginPath()
        ctx.moveTo(-8, -38); ctx.lineTo(-8 + lp * 0.5, -2)
        ctx.moveTo(10, -38); ctx.lineTo(10 - lp * 0.5, -2)
        ctx.stroke()
        ctx.fillStyle = m.ac
        ctx.beginPath(); ctx.ellipse(0, -66, 34, 38, 0, 0, 6.28); ctx.fill()
        ctx.fillStyle = hexA(m.glow, 0.25)
        ctx.beginPath(); ctx.ellipse(-6, -56, 18, 24, 0, 0, 6.28); ctx.fill()
        ctx.strokeStyle = hexA(m.glow, 0.55); ctx.lineWidth = 3; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.ellipse(0, -66, 31, 35, 0, Math.PI * 0.55, Math.PI * 1.25); ctx.stroke()
        ctx.strokeStyle = m.dark; ctx.lineWidth = 13
        ctx.beginPath(); ctx.moveTo(-22, -84); ctx.lineTo(-34 - Math.sin(p.walk * 2) * 6, -30); ctx.stroke()
        const reach = punching ? 62 : 26
        const ax = 22 + Math.cos(a) * reach, ay = -84 + Math.sin(a) * reach
        ctx.beginPath(); ctx.moveTo(22, -84); ctx.lineTo(ax, ay); ctx.stroke()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 6, ay + Math.sin(a) * 6, 12, 0, 6.28); ctx.fill()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.ellipse(0, -112, 17, 15, 0, 0, 6.28); ctx.fill()
        ctx.fillStyle = m.dark; ctx.fillRect(-16, -116, 32, 8)
        ctx.fillStyle = m.glow; ctx.fillRect(-8, -114, 6, 5); ctx.fillRect(3, -114, 6, 5)
        ctx.fillStyle = '#fff'; ctx.fillRect(-6, -113, 2, 3); ctx.fillRect(5, -113, 2, 3)
    } else if (m.body === 'reptile') {
        ctx.strokeStyle = m.dark; ctx.lineWidth = 12; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-18, -34); ctx.quadraticCurveTo(-52, -28, -78, -44 + Math.sin(p.walk * 3) * 8); ctx.stroke()
        ctx.fillStyle = m.dark
        for (let i = 0; i < 4; i++) { const tx2 = -30 - i * 13, ty = -32 - i * 3; ctx.beginPath(); ctx.moveTo(tx2, ty); ctx.lineTo(tx2 - 5, ty - 12 - Math.sin(i) * 4); ctx.lineTo(tx2 - 11, ty); ctx.closePath(); ctx.fill() }
        ctx.strokeStyle = m.dark; ctx.lineWidth = 11; ctx.lineCap = 'round'
        const lp = Math.sin(p.walk * 2) * 10
        ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(-8 + lp * 0.5, -2); ctx.moveTo(10, -34); ctx.lineTo(10 - lp * 0.5, -2); ctx.stroke()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.ellipse(0, -52, 30, 26, 0, 0, 6.28); ctx.fill()
        ctx.fillStyle = hexA(m.glow, 0.25); ctx.beginPath(); ctx.ellipse(-4, -44, 17, 15, 0, 0, 6.28); ctx.fill()
        ctx.strokeStyle = hexA(m.glow, 0.55); ctx.lineWidth = 3; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.ellipse(0, -52, 27, 23, 0, Math.PI * 0.55, Math.PI * 1.25); ctx.stroke()
        ctx.strokeStyle = hexA(m.dark, 0.6); ctx.lineWidth = 3
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-2, -48 + i * 8, 14, 6, 0, 0.15, Math.PI - 0.15); ctx.stroke() }
        ctx.strokeStyle = m.ac; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(8, -68); ctx.lineTo(26, -102); ctx.stroke()
        ctx.fillStyle = m.dark
        for (let i = 0; i < 3; i++) { const nx = 10 + i * 6, ny = -74 - i * 10; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - 7, ny - 13); ctx.lineTo(nx - 1, ny + 4); ctx.closePath(); ctx.fill() }
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.ellipse(30, -108, 15, 11, 0.3, 0, 6.28); ctx.fill()
        ctx.fillStyle = m.dark; ctx.fillRect(28, -104, 18, 5)
        ctx.fillStyle = m.glow; ctx.beginPath(); ctx.arc(34, -112, 3.4, 0, 6.28); ctx.fill()
        ctx.fillStyle = '#0b0714'; ctx.beginPath(); ctx.arc(34, -112, 1.6, 0, 6.28); ctx.fill()
        ctx.fillStyle = m.glow; ctx.beginPath(); ctx.moveTo(22, -118); ctx.lineTo(30, -132); ctx.lineTo(36, -118); ctx.closePath(); ctx.fill()
        const reach = punching ? 56 : 20
        const ax = 12 + Math.cos(a) * reach, ay = -60 + Math.sin(a) * reach
        ctx.strokeStyle = m.dark; ctx.lineWidth = 10
        ctx.beginPath(); ctx.moveTo(12, -60); ctx.lineTo(ax, ay); ctx.stroke()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 5, ay + Math.sin(a) * 5, 9, 0, 6.28); ctx.fill()
    } else {
        ctx.strokeStyle = m.dark; ctx.lineWidth = 9; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(-26, -6 + Math.sin(p.walk * 2.4) * 5); ctx.moveTo(2, -30); ctx.lineTo(6, -2); ctx.moveTo(12, -32); ctx.lineTo(18, -4); ctx.stroke()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.ellipse(0, -62, 24, 30, -0.25, 0, 6.28); ctx.fill()
        ctx.fillStyle = hexA(m.glow, 0.25); ctx.beginPath(); ctx.ellipse(-3, -56, 12, 20, -0.25, 0, 6.28); ctx.fill()
        ctx.strokeStyle = hexA(m.glow, 0.5); ctx.lineWidth = 3; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.ellipse(0, -62, 21, 27, -0.25, Math.PI * 0.55, Math.PI * 1.2); ctx.stroke()
        ctx.fillStyle = m.dark
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-16 + i * 8, -84 - Math.sin(i) * 4); ctx.lineTo(-12 + i * 8, -100 - Math.sin(i * 1.7) * 6); ctx.lineTo(-8 + i * 8, -84); ctx.closePath(); ctx.fill() }
        ctx.fillStyle = hexA(m.dark, 0.9)
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(2 + i * 6, -84 - Math.sin(i) * 3); ctx.lineTo(4 + i * 6, -98 - Math.sin(i * 2) * 5); ctx.lineTo(9 + i * 6, -82); ctx.closePath(); ctx.fill() }
        const reach = punching ? 54 : 22
        const ax = 10 + Math.cos(a) * reach, ay = -74 + Math.sin(a) * reach
        ctx.strokeStyle = m.dark; ctx.lineWidth = 9
        ctx.beginPath(); ctx.moveTo(10, -74); ctx.lineTo(ax, ay); ctx.stroke()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 5, ay + Math.sin(a) * 5, 9, 0, 6.28); ctx.fill()
        ctx.fillStyle = m.ac; ctx.beginPath(); ctx.ellipse(18, -100, 13, 12, 0.2, 0, 6.28); ctx.fill()
        ctx.beginPath(); ctx.moveTo(10, -110); ctx.lineTo(12, -126); ctx.lineTo(19, -112); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(22, -112); ctx.lineTo(28, -126); ctx.lineTo(31, -110); ctx.closePath(); ctx.fill()
        ctx.fillStyle = m.glow; ctx.beginPath(); ctx.arc(23, -103, 3, 0, 6.28); ctx.fill()
        ctx.fillStyle = '#0b0714'; ctx.beginPath(); ctx.arc(23, -103, 1.5, 0, 6.28); ctx.fill()
    }
    if (p.eatT > 0) {
        const prog = Math.sin(Math.min(1, (24 - p.eatT) / 24) * Math.PI)
        const mo = 4 + 12 * prog
        const mouth = m.body === 'ape' ? { x: 8, y: -104 } : m.body === 'reptile' ? { x: 42, y: -98 } : { x: 30, y: -92 }
        ctx.fillStyle = '#1a0a14'
        ctx.beginPath(); ctx.ellipse(mouth.x, mouth.y, mo * 1.1, mo * 0.62, 0, 0, 6.28); ctx.fill()
        ctx.fillStyle = '#fff'
        for (let i = 0; i < 5; i++) {
            const tx2 = mouth.x - mo * 0.55 + i * (mo * 1.1 / 4)
            ctx.beginPath(); ctx.moveTo(tx2, mouth.y - mo * 0.42); ctx.lineTo(tx2 + mo * 0.11, mouth.y - mo * 0.06); ctx.lineTo(tx2 + mo * 0.22, mouth.y - mo * 0.42); ctx.closePath(); ctx.fill()
        }
        ctx.fillStyle = `rgba(255,209,102,${0.55 + prog * 0.3})`
        ctx.beginPath(); ctx.arc(mouth.x, mouth.y + mo * 0.18, mo * 0.34, 0, 6.28); ctx.fill()
    }
    if (p.climb) { ctx.fillStyle = m.glow; ctx.beginPath(); ctx.arc(-p.climbSide * 6, -70, 4 + Math.sin(t * 14) * 2, 0, 6.28); ctx.fill() }
    ctx.restore()
    ctx.shadowBlur = 0
    if (p.attackT > 0) {
        const aim = p.punchAim
        const hx = x + p.facing * 74
        const hy = y - 60 + (aim === 'up' ? -50 : aim === 'down' ? 52 : 0)
        const al = Math.max(0, p.attackT / 16)
        ctx.save()
        ctx.globalAlpha = al * 0.9
        ctx.strokeStyle = '#ffd166'; ctx.lineCap = 'round'
        ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 16
        ctx.lineWidth = 7 * al + 2
        ctx.beginPath(); ctx.moveTo(x + p.facing * 30, y - 68); ctx.lineTo(hx, hy); ctx.stroke()
        ctx.lineWidth = 2.5 * al + 1
        ctx.strokeStyle = '#fff3d6'
        ctx.beginPath(); ctx.moveTo(x + p.facing * 30, y - 68); ctx.lineTo(hx, hy); ctx.stroke()
        ctx.restore()
    }
}

export function drawBullets(ctx, gs) {
    for (const b of gs.bullets) {
        const x = b.x - gs.camX
        ctx.strokeStyle = b.col; ctx.lineWidth = 4; ctx.lineCap = 'round'
        ctx.shadowColor = b.col; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.moveTo(x - b.vx * 1.8, b.y - b.vy * 1.8); ctx.lineTo(x, b.y); ctx.stroke()
        ctx.shadowBlur = 0
    }
}

// ----------------------------------------------------------------- HUD ----
// Corner clearance law (#2899): ARCADE chip sits viewport top-left, PAUSE
// top-right — meaningful ink stays inside x∈[84, W−140], below row 16 is fine.
export function drawHud(ctx, gs) {
    const m = MONSTERS[gs.monster]
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(10,7,20,0.55)'
    ctx.fillRect(84, 14, 210, 46)
    ctx.fillStyle = m.ac
    ctx.font = '900 15px ui-monospace, monospace'
    ctx.fillText(m.name, 96, 32)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(96, 40, 186, 10)
    const w = Math.max(0, gs.player.hp / 100) * 186
    const g = ctx.createLinearGradient(96, 0, 282, 0)
    g.addColorStop(0, '#ff5470'); g.addColorStop(1, '#ffb347')
    ctx.fillStyle = g
    ctx.fillRect(96, 40, w, 10)
    // lives: tiny monster heads
    for (let i = 0; i < gs.lives; i++) { ctx.fillStyle = i === 0 ? m.ac : hexA(m.ac, 0.7); ctx.beginPath(); ctx.arc(99 + i * 14, 56, 4, 0, 6.28); ctx.fill() }

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(10,7,20,0.55)'
    ctx.fillRect(W / 2 - 130, 14, 260, 46)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '700 9px ui-monospace, monospace'
    ctx.fillText(cityName(gs.cityIndex), W / 2, 28)
    ctx.fillStyle = '#fff'
    ctx.font = '900 18px ui-monospace, monospace'
    ctx.fillText(`DAY ${gs.day}`, W / 2, 48)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '700 9px ui-monospace, monospace'
    const left = buildingsLeft(gs)
    ctx.fillText(`${left} BUILDING${left === 1 ? '' : 'S'} LEFT`, W / 2, 60)

    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(10,7,20,0.55)'
    ctx.fillRect(W - 320, 14, 180, 46)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '700 9px ui-monospace, monospace'
    ctx.fillText('SCORE', W - 156, 28)
    ctx.fillStyle = '#fff'
    ctx.font = '900 18px ui-monospace, monospace'
    ctx.fillText(String(gs.score).toLocaleString(), W - 156, 48)
    if (gs.combo > 1) {
        ctx.fillStyle = '#ffd166'
        ctx.font = '900 11px ui-monospace, monospace'
        ctx.fillText(`COMBO ×${gs.combo.toFixed(1)}`, W - 156, 60)
    }
    ctx.textAlign = 'left'
}
