// CONTRA — art. Every pixel generated in code, RETRO bar (docs/ART.md):
// the arcade jungle of Konami 1987 — a deep green gradient sky, silhouetted
// mountains, canopy layers, the grass-lipped jungle floor, and the giant
// leaf fronds that framed stage 1's corners. Palette from the original's mood:
// viridian darks, olive soldier uniforms, the hero's white tank + blue pants
// + red bandana, hazard-orange capsules.

const C = {
    skyTop: '#04140b', skyMid: '#0b3018', skyLow: '#17512a',
    mtnFar: '#0a2416', mtnNear: '#0e301d',
    canopy: '#123f22', canopyLit: '#1c5c30',
    grass: '#2f9e44', grassLit: '#57c96a', dirt: '#3e2a18', dirtDark: '#241708', dirtLit: '#5a4026',
    trunk: '#33230f', trunkLit: '#4d3618',
    leaf: '#1e6e33', leafLit: '#2f9e44', leafDark: '#123f22',
    skin: '#e8b88f', skinDark: '#b07850',
    band: '#e23b2e', tank: '#ece7d8', pants: '#2b4fc4', boots: '#20242c',
    hair: '#241a10',
    uni: '#6b7a3a', uniDark: '#485226', beret: '#a3283c', gunMetal: '#3c4650',
    sand: '#b49a6a', sandDark: '#7d6a45', turret: '#4a5a30',
    barrel: '#8a5a2b', barrelDark: '#5c3a17', barrelBand: '#d8c07a',
    capsule: '#ff8c1a', capsuleLit: '#ffd23c', capsuleWin: '#fff6e0',
    ink: '#f4f2e6', gold: '#ffd23c',
}

export function drawBackground (ctx, cam, tick) {
    // sky + far parallax live in screen space (caller draws before the camera
    // translate); returns nothing, just paints the window.
    const g = ctx.createLinearGradient(0, 0, 0, 196)
    g.addColorStop(0, C.skyTop); g.addColorStop(0.55, C.skyMid); g.addColorStop(1, C.skyLow)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 384, 196)
    // two mountain bands, slow parallax
    const m1 = -(cam * 0.22) % 192
    ctx.fillStyle = C.mtnFar
    for (let bx = m1 - 192; bx < 384 + 192; bx += 192) {
        ctx.beginPath(); ctx.moveTo(bx, 150); ctx.lineTo(bx + 46, 84); ctx.lineTo(bx + 92, 128); ctx.lineTo(bx + 138, 70); ctx.lineTo(bx + 192, 140); ctx.lineTo(bx + 192, 196); ctx.lineTo(bx, 196); ctx.closePath(); ctx.fill()
    }
    const m2 = -(cam * 0.45) % 160
    ctx.fillStyle = C.mtnNear
    for (let bx = m2 - 160; bx < 384 + 160; bx += 160) {
        ctx.beginPath(); ctx.moveTo(bx, 168); ctx.lineTo(bx + 40, 108); ctx.lineTo(bx + 82, 150); ctx.lineTo(bx + 122, 96); ctx.lineTo(bx + 160, 158); ctx.lineTo(bx + 160, 196); ctx.lineTo(bx, 196); ctx.closePath(); ctx.fill()
    }
    // canopy band with lit bumps; a few fireflies twinkle (cosmetic)
    ctx.fillStyle = C.canopy
    ctx.fillRect(0, 176, 384, 20)
    ctx.fillStyle = C.canopyLit
    const m3 = -(cam * 0.7) % 48
    for (let bx = m3 - 48; bx < 384 + 48; bx += 48) {
        ctx.beginPath(); ctx.arc(bx + 12, 178, 10, Math.PI, 0); ctx.fill()
        ctx.beginPath(); ctx.arc(bx + 32, 180, 7, Math.PI, 0); ctx.fill()
    }
    for (let i = 0; i < 5; i++) {
        const fx = ((i * 97 + Math.floor(tick / 3) * 3) % 420) - 18
        const fy = 60 + ((i * 53) % 90) + Math.sin((tick + i * 40) / 22) * 6
        ctx.fillStyle = (Math.floor(tick / 20) + i) % 3 === 0 ? '#cdeea8' : '#6d8f4e'
        ctx.fillRect(fx, fy, 1, 1)
    }
}

// foreground framing: the giant corner fronds that made Contra's stage 1 read
// as jungle from the first frame. Screen space, drawn last (after entities).
export function drawFringe (ctx, cam) {
    const sway = Math.sin(cam / 57) * 2
    const frond = (x, y, s, flip) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s)
        ctx.fillStyle = C.leafDark
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(28, 6, 52, 34); ctx.quadraticCurveTo(26, 24, 0, 14); ctx.closePath(); ctx.fill()
        ctx.fillStyle = C.leaf
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(24, 2, 44, 26); ctx.quadraticCurveTo(22, 18, 0, 10); ctx.closePath(); ctx.fill()
        ctx.fillStyle = C.leafLit
        ctx.fillRect(0, 0, 10, 3)
        ctx.restore()
    }
    frond(-4, 6 + sway, 1.5, false)
    frond(388, 10 - sway, 1.5, true)
    frond(-6, 40 - sway, 1.1, false)
    frond(390, 44 + sway, 1.1, true)
}

// jungle floor + trunk pillars, world space (camera translate applied).
export function drawGround (ctx, cam) {
    const x0 = cam - 8, x1 = cam + 392
    ctx.fillStyle = C.dirt
    ctx.fillRect(x0, 196, x1 - x0, 28)
    ctx.fillStyle = C.grass
    ctx.fillRect(x0, 194, x1 - x0, 4)
    ctx.fillStyle = C.grassLit
    for (let gx = Math.floor(x0 / 8) * 8; gx < x1; gx += 8) {
        if (((gx * 7919) >>> 3) % 3 === 0) ctx.fillRect(gx, 192, 2, 2)
        if (((gx * 104729) >>> 2) % 4 === 0) ctx.fillRect(gx + 3, 191, 1, 3)
    }
    ctx.fillStyle = C.dirtDark
    for (let gx = Math.floor(x0 / 12) * 12; gx < x1; gx += 12) {
        if (((gx * 48271) >>> 4) % 2 === 0) ctx.fillRect(gx + ((gx >> 5) % 7), 202 + ((gx >> 3) % 3) * 4, 3, 2)
    }
    ctx.fillStyle = C.dirtLit
    for (let gx = Math.floor(x0 / 16) * 16; gx < x1; gx += 16) {
        if (((gx * 16807) >>> 5) % 2 === 1) ctx.fillRect(gx + ((gx >> 4) % 9), 201 + ((gx >> 2) % 4) * 3, 2, 1)
    }
    // trunk pillars every ~180 world px, behind entities
    for (let tx = Math.floor(x0 / 180) * 180; tx < x1; tx += 180) {
        const s = (tx * 7919) >>> 1
        if (s % 2) continue
        ctx.fillStyle = C.trunk
        ctx.fillRect(tx + 60, 60, 14, 136)
        ctx.fillStyle = C.trunkLit
        ctx.fillRect(tx + 60, 60, 4, 136)
        ctx.fillStyle = C.trunk
        ctx.fillRect(tx + 48, 52, 22, 10)
        ctx.fillRect(tx + 70, 44, 24, 10)
        ctx.fillStyle = C.canopyLit
        ctx.fillRect(tx + 52, 46, 10, 6)
        ctx.fillRect(tx + 76, 38, 12, 6)
    }
}

export function drawPlatform (ctx, pl) {
    ctx.fillStyle = C.dirtDark
    ctx.fillRect(pl.x, pl.y + 2, pl.w, 8)
    ctx.fillStyle = C.dirt
    ctx.fillRect(pl.x, pl.y + 1, pl.w, 4)
    ctx.fillStyle = C.grass
    ctx.fillRect(pl.x, pl.y - 1, pl.w, 3)
    ctx.fillStyle = C.grassLit
    for (let gx = pl.x + 2; gx < pl.x + pl.w - 2; gx += 7) {
        if (((gx * 31) >>> 2) % 2 === 0) ctx.fillRect(gx, pl.y - 2, 2, 1)
    }
    // rope struts anchoring the walkway
    ctx.fillStyle = '#5a4a2e'
    ctx.fillRect(pl.x + 4, pl.y + 9, 2, 196 - pl.y - 8)
    ctx.fillRect(pl.x + pl.w - 6, pl.y + 9, 2, 196 - pl.y - 8)
}

// --- hero: white tank, blue pants, red bandana; run/jump frames, 8-way arm ---
export function drawPlayer (ctx, p, tick) {
    if (p.inv > 0 && Math.floor(tick / 4) % 2 === 0) return // respawn flicker
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y))
    const f = p.onGround ? Math.floor(p.walk / 4) % 4 : 9
    // legs
    ctx.fillStyle = C.pants
    if (!p.onGround) {
        ctx.fillRect(-5, -12, 4, 7); ctx.fillRect(1, -14, 4, 8) // tuck
        ctx.fillStyle = C.boots
        ctx.fillRect(-5, -5, 4, 3); ctx.fillRect(2, -6, 4, 3)
    } else if (f === 9) { ctx.fillRect(-5, -12, 4, 9); ctx.fillRect(1, -12, 4, 9); ctx.fillStyle = C.boots; ctx.fillRect(-5, -3, 4, 3); ctx.fillRect(1, -3, 4, 3) }
    else {
        const spread = [0, 2, 5, 2][f]
        ctx.fillRect(-4 - spread / 2, -12, 4, 9 - (f === 2 ? 2 : 0))
        ctx.fillRect(0 + spread / 2, -12, 4, 9)
        ctx.fillStyle = C.boots
        ctx.fillRect(-4 - spread / 2, -3, 4, 3)
        ctx.fillRect(0 + spread / 2, -3, 4, 3)
    }
    // torso
    ctx.fillStyle = C.tank
    ctx.fillRect(-4, -22, 8, 10)
    ctx.fillStyle = C.skin
    ctx.fillRect(-4, -24, 8, 3) // shoulders / arms base skin
    // head + bandana, facing
    ctx.fillStyle = C.skin
    ctx.fillRect(-3 + p.face, -31, 6, 7)
    ctx.fillStyle = C.hair
    ctx.fillRect(-3 + p.face * 2, -32, 4, 2)
    ctx.fillStyle = C.band
    ctx.fillRect(-4, -32, 8, 3)
    // bandana tails stream behind, snapping in the wind
    ctx.fillRect(-p.face * 4 - (p.face > 0 ? 3 : -1), -31 + Math.floor(Math.sin(tick / 5) * 1.5), 4, 2)
    // gun arm along the 8-way aim
    const ax = p.ax, ay = p.ay
    const sx = 2 * ax, sy = -18 + 5 * ay
    ctx.strokeStyle = C.skin
    ctx.lineWidth = 2.4
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(sx * 2.6, sy + ay * 6); ctx.stroke()
    ctx.strokeStyle = '#20242c'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(sx * 2.2, sy + ay * 5); ctx.lineTo(sx * 3.4, sy + ay * 8); ctx.stroke()
    if (p.weapon === 'spread') {
        ctx.fillStyle = C.gunMetal
        ctx.fillRect(sx * 3.4 - 2, sy + ay * 8 - 2, 4, 4)
    }
    ctx.restore()
}

// --- enemy soldier: olive uniform, red beret, two-frame run, muzzle flash ---
export function drawSoldier (ctx, s, _tick) {
    ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y))
    const dir = Math.sign(s.walkDir || -1)
    const f = Math.floor(s.walk / 5) % 2
    ctx.fillStyle = C.uniDark
    ctx.fillRect(-4, -11, 3, 8); ctx.fillRect(1, -11, 3, 8)
    if (f === 0) { ctx.fillRect(-5, -11, 3, 9); ctx.fillRect(2, -12, 3, 8) }
    ctx.fillStyle = '#303020'
    ctx.fillRect(-5, -2, 3, 2); ctx.fillRect(2, -2, 3, 2)
    ctx.fillStyle = C.uni
    ctx.fillRect(-5, -20, 10, 9)
    ctx.fillStyle = C.skin
    ctx.fillRect(-3, -26, 6, 6)
    ctx.fillStyle = C.beret
    ctx.fillRect(-4 + dir, -28, 8, 3)
    ctx.fillStyle = C.gunMetal
    ctx.fillRect(dir > 0 ? 2 : -10, -16, 8, 2)
    ctx.restore()
}

export function drawTurret (ctx, t) {
    ctx.save(); ctx.translate(Math.round(t.x), Math.round(t.y))
    // sandbag base
    ctx.fillStyle = C.sand
    ctx.fillRect(-11, -12, 22, 12)
    ctx.fillStyle = C.sandDark
    for (let r = 0; r < 3; r++) for (let cix = 0; cix < 3; cix++) ctx.fillRect(-10 + cix * 7, -11 + r * 4, 6, 3)
    // housing
    ctx.fillStyle = C.turret
    ctx.fillRect(-7, -22, 14, 10)
    ctx.fillStyle = t.hp === 1 ? '#7d3a2a' : '#5e7038'
    ctx.fillRect(-7, -22, 14, 3)
    // barrel toward its aim
    ctx.strokeStyle = C.gunMetal
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(Math.cos(t.aim) * 14, -18 + Math.sin(t.aim) * 14); ctx.stroke()
    ctx.restore()
}

export function drawBarrel (ctx, br) {
    ctx.save(); ctx.translate(Math.round(br.x), Math.round(br.y))
    ctx.fillStyle = C.barrel
    ctx.fillRect(-7, -20, 14, 20)
    ctx.fillStyle = C.barrelDark
    ctx.fillRect(-7, -20, 14, 2); ctx.fillRect(-7, -2, 14, 2)
    ctx.fillStyle = C.barrelBand
    ctx.fillRect(-7, -13, 14, 2)
    ctx.fillStyle = '#e23b2e'
    ctx.fillRect(-2, -11, 4, 6)
    ctx.restore()
}

export function drawCapsule (ctx, c, tick) {
    ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y))
    const pulse = Math.floor(tick / 8) % 2
    ctx.fillStyle = pulse ? C.capsuleLit : C.capsule
    ctx.fillRect(-8, -6, 16, 12)
    ctx.fillStyle = C.capsuleWin
    ctx.fillRect(-5, -3, 10, 6)
    ctx.fillStyle = C.capsule
    ctx.fillRect(-3, -2, 2, 4); ctx.fillRect(1, -2, 2, 4)
    // sparkle trail
    ctx.fillStyle = pulse ? '#fff2b0' : '#ffb347'
    ctx.fillRect(10, -1, 3, 2); ctx.fillRect(15, -2 + (tick % 3), 2, 1)
    ctx.restore()
}

export function drawBullet (ctx, b, enemy) {
    ctx.fillStyle = enemy ? '#ff5a3c' : '#ffe27a'
    ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 1, enemy ? 3 : 4, 2)
}

// the base gate at the end of the jungle — S2's door, bolted shut.
export function drawGate (ctx) {
    ctx.fillStyle = '#5a5f66'
    ctx.fillRect(2010, 60, 38, 136)
    ctx.fillStyle = '#3c4148'
    ctx.fillRect(2016, 76, 26, 120)
    ctx.fillStyle = '#8a9099'
    for (let ry = 0; ry < 6; ry++) ctx.fillRect(2012, 66 + ry * 22, 34, 3)
    ctx.fillStyle = C.gold
    ctx.fillRect(2026, 120, 6, 6)
    ctx.fillStyle = '#20242c'
    ctx.fillRect(2027, 121, 4, 4)
}

export function drawHud (ctx, gs, hiscore) {
    ctx.textBaseline = 'top'
    ctx.font = 'bold 8px "Courier New", monospace'
    ctx.fillStyle = C.ink
    ctx.fillText('1UP', 8, 4)
    ctx.fillStyle = C.gold
    ctx.fillText(String(gs.score).padStart(6, '0'), 8, 12)
    ctx.fillStyle = C.ink
    ctx.fillText('HI', 84, 4)
    ctx.fillStyle = C.gold
    ctx.fillText(String(Math.max(hiscore, gs.score)).padStart(6, '0'), 84, 12)
    ctx.fillStyle = C.ink
    ctx.fillText('CONTRA', 176, 4)
    // lives as mini hero heads
    for (let i = 0; i < gs.lives; i++) {
        ctx.fillStyle = C.band
        ctx.fillRect(150 + i * 10, 12, 6, 2)
        ctx.fillStyle = C.skin
        ctx.fillRect(150 + i * 10, 14, 6, 4)
    }
    ctx.fillStyle = gs.p.weapon === 'spread' ? C.capsuleLit : C.ink
    ctx.fillText(gs.p.weapon === 'spread' ? 'SPREAD' : 'RIFLE', 320, 4)
}
