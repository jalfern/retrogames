// CONTRA — art. Every pixel generated in code, RETRO bar (docs/ART.md):
// the arcade jungle of Konami 1987 — a deep green gradient sky, silhouetted
// mountains, canopy layers, the grass-lipped jungle floor, and the giant
// leaf fronds that framed stage 1's corners. Palette from the original's mood:
// viridian darks, olive soldier uniforms, the hero's white tank + blue pants
// + red bandana, hazard-orange capsules.

import { CFG } from './sim.js'

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
    water: '#1d4f7a', waterLit: '#2a6ea0', waterDeep: '#123450', foam: '#dcedf5',
    barrel: '#8a5a2b', barrelDark: '#5c3a17', barrelBand: '#d8c07a',
    capsule: '#ff8c1a', capsuleLit: '#ffd23c', capsuleWin: '#fff6e0',
    ink: '#f4f2e6', gold: '#ffd23c',
    // S3 — the weapon wheel + the new roster
    letterM: '#2b6fd4', letterF: '#e23b2e', letterL: '#8a3ad4', letterS: '#ff8c1a',
    laser: '#ff4ad4', laserCore: '#ffd6f6', flame: '#ff6a2a', flameHot: '#ffe27a',
    nest: '#2b1c0c', nestLit: '#41290f', scope: '#8ad4ff', vest: '#2e3122',
    // S2 — the waterfall canyon & the gate
    rockHi: '#5d6672', rock: '#414a58', rockLo: '#2a303c', rockDeep: '#171c26',
    moss: '#3f7a3a', mossLit: '#5fae52',
    waterTop: '#1c4a6e', waterMid: '#123a5c', waterLo: '#0a2440', foam2: '#7fb8d4',
    fall: '#2a6a8f', fallLit: '#bfe4ef', fallLo: '#14405e',
    steel: '#78838f', steelLit: '#a8b2bc', steelLo: '#4a5460', rust: '#8a5a3a',
    coreRed: '#ff3b30', coreDark: '#701812', shutter: '#5a616c', shutterLit: '#8a929e',
}

// The capsule's letter, 5x5 pixel glyphs — S M F L as the cabinet stamps them
// (salvaged from #2789: crisp bitmap stamps replace antialiased fillText on the
// pixel grid, per docs/ART.md). Row bits: bit4 = leftmost pixel.
const GLYPH = {
    S: [0b11111, 0b10000, 0b11111, 0b00001, 0b11111],
    M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001],
    F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000],
    L: [0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
}
const LETTER_OF = { machine: 'M', fire: 'F', laser: 'L', spread: 'S' }
const INK_OF = { machine: 'letterM', fire: 'letterF', laser: 'letterL', spread: 'letterS' }

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
// The world floor is a shoreline (the commission's "water at the bottom
// edge"): walkable sand at 196, a foaming lip, then the sea to the screen
// bottom. tick animates the ripple crests and the foam; deterministic — the
// art reads the sim tick, never Math.random.
export function drawGround (ctx, cam, tick) {
    const x0 = cam - 8, x1 = cam + 392
    // sand beach the hero walks on
    ctx.fillStyle = C.sand
    ctx.fillRect(x0, 196, x1 - x0, 12)
    ctx.fillStyle = C.grass
    ctx.fillRect(x0, 194, x1 - x0, 3)
    ctx.fillStyle = C.grassLit
    for (let gx = Math.floor(x0 / 8) * 8; gx < x1; gx += 8) {
        if (((gx * 7919) >>> 3) % 3 === 0) ctx.fillRect(gx, 192, 2, 2)
        if (((gx * 104729) >>> 2) % 4 === 0) ctx.fillRect(gx + 3, 191, 1, 3)
    }
    ctx.fillStyle = C.sandDark
    for (let gx = Math.floor(x0 / 12) * 12; gx < x1; gx += 12) {
        if (((gx * 48271) >>> 4) % 2 === 0) ctx.fillRect(gx + ((gx >> 5) % 7), 199 + ((gx >> 3) % 3) * 3, 3, 2)
    }
    // the sea: two-tone bands with drifting crest lines
    ctx.fillStyle = C.water
    ctx.fillRect(x0, 208, x1 - x0, 16)
    ctx.fillStyle = C.waterDeep
    for (let gx = Math.floor(x0 / 24) * 24; gx < x1; gx += 24) {
        const wy = 212 + (((gx >> 3) % 3) * 3)
        ctx.fillRect(gx + ((tick >> 2) % 24), wy, 10, 2)
    }
    ctx.fillStyle = C.waterLit
    for (let gx = Math.floor(x0 / 16) * 16; gx < x1; gx += 16) {
        const wy = 209 + (((gx + tick) >> 3) % 2) * 7
        ctx.fillRect(gx - ((tick >> 1) % 16), wy, 6 + ((gx >> 4) % 5), 1)
    }
    // foam lip at the sand line — dashes breathing in and out
    const wob = Math.floor(Math.sin(tick / 9) * 1.5 + 1.5)
    ctx.fillStyle = C.foam
    for (let gx = Math.floor(x0 / 6) * 6; gx < x1; gx += 6) {
        if (((gx * 2654435761) >>> 6) % 3 !== 0) ctx.fillRect(gx, 206 + (((gx >> 2) + wob) % 2), 4, 2)
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

// --- hero: white tank, blue pants, red bandana; run/jump frames, 8-way arm.
// S4 blue seat: the same body, arcade P2 palette (blue bandana, cold tank,
// navy pants) — the palette swap IS the original's co-op language. ---
export function drawPlayer (ctx, p, tick, blue = false, solid = false, rappel = false) {
    // #2837: `solid` suppresses the respawn flicker for the arrival rappel —
    // a soldier on the rope must be seen coming, not blinking in and out.
    if (!solid && p.inv > 0 && Math.floor(tick / 4) % 2 === 0) return // respawn flicker
    const band = blue ? '#2b6fd4' : C.band
    const tank = blue ? '#a8cfe0' : C.tank
    const pants = blue ? '#16265c' : C.pants
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y))
    const f = p.onGround ? Math.floor(p.walk / 4) % 4 : 9
    // legs
    ctx.fillStyle = pants
    if (rappel) {
        // #2842 the cling-rappel pose: legs braced long with the toes pointed,
        // not the generic jump tuck — the eye reads hanging vs leaping.
        ctx.fillRect(-5, -12, 4, 9); ctx.fillRect(1, -12, 4, 10)
        ctx.fillStyle = C.boots
        ctx.fillRect(-5, -3, 4, 3); ctx.fillRect(1, -2, 4, 3)
    } else if (!p.onGround) {
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
    ctx.fillStyle = tank
    ctx.fillRect(-4, -22, 8, 10)
    ctx.fillStyle = C.skin
    ctx.fillRect(-4, -24, 8, 3) // shoulders / arms base skin
    // head + bandana, facing
    ctx.fillStyle = C.skin
    ctx.fillRect(-3 + p.face, -31, 6, 7)
    ctx.fillStyle = C.hair
    ctx.fillRect(-3 + p.face * 2, -32, 4, 2)
    ctx.fillStyle = band
    ctx.fillRect(-4, -32, 8, 3)
    // bandana tails stream behind, snapping in the wind
    ctx.fillRect(-p.face * 4 - (p.face > 0 ? 3 : -1), -31 + Math.floor(Math.sin(tick / 5) * 1.5), 4, 2)
    // gun arm along the 8-way aim — #2842: on the rope both hands grip the
    // line instead (it runs at p.x, straight overhead) and the rifle slings.
    if (rappel) {
        ctx.strokeStyle = '#20242c'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(4, -23); ctx.stroke()
        ctx.strokeStyle = C.skin; ctx.lineWidth = 2.4
        ctx.beginPath(); ctx.moveTo(-2, -21); ctx.lineTo(0, -33); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(2, -21); ctx.lineTo(1, -33); ctx.stroke()
        ctx.restore()
        return
    }
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
    } else if (p.weapon === 'machine') {
        ctx.fillStyle = '#5a6672'
        ctx.fillRect(sx * 3.2 - 2, sy + ay * 8 - 2, 6, 3) // boxy MG receiver
    } else if (p.weapon === 'fire') {
        ctx.fillStyle = C.flame
        ctx.fillRect(sx * 3.4 - 2, sy + ay * 8 - 2, 4, 4)
        ctx.fillStyle = C.flameHot
        ctx.fillRect(sx * 3.4 - 1, sy + ay * 8 - 1, 2, 2)
    } else if (p.weapon === 'laser') {
        ctx.fillStyle = C.laser
        ctx.fillRect(sx * 3.4 - 1, sy + ay * 8 - 1, 3, 3)
    }
    ctx.restore()
}

// --- enemy soldier: olive uniform, red beret; three-frame run at speed, a
// held-rifle idle, muzzle flash + recoil on the shot (s.flash rides the sim) ---
// #2837 the arrival rappel: the rope the fresh blue soldier drops in on —
// drawn behind him from the top of the camera to his hands, with a knot.
// Pure paint: the descent itself is sim truth (p2.enterT).
export function drawRappel (ctx, x, topY, y) {
    ctx.fillStyle = '#2c3a2c'
    ctx.fillRect(Math.round(x) - 1, Math.round(topY), 2, Math.max(0, Math.round(y - 24 - topY)))
    ctx.fillStyle = '#48583f'
    ctx.fillRect(Math.round(x) - 2, Math.round(y - 26), 4, 3)
}

// #2842 the 2UP tag is the seat's arrival tell, not a constant. 'arrive'
// blinks until the soles touch (HUD tied to the body); 'warn' blinks the
// last TAG_WARN ticks of drop-out patience — the wingman is about to take the
// seat back. Pure function of sim truth, so contracheck can pin the tell.
export const TAG_WARN = 120 // 2 s at patience's tail
export function seatTagState (gs) {
    const q = gs.p2
    if (!q || q.out) return 'off'
    if (q.enterT > 0) return 'arrive'
    if (q.padClaim && q.human && q.idle > CFG.seatIdle - TAG_WARN) return 'warn'
    return 'lit'
}

// #2842 the ceremony chopper — the wingman's ride out. A dark silhouette that
// hovers over the rappel while the fresh soldier descends, then pulls off to
// the right fading: the vanishing wingman finally has an exit (the original's
// 2P helicopter). Pure paint — index.jsx owns the lifecycle, the sim never
// sees it (zero gs.r, deterministic bob from tick).
export function drawHeli (ctx, x, y, tick, fade = 1) {
    ctx.save(); ctx.translate(Math.round(Math.max(26, x)), Math.round(y))
    if (fade < 1) ctx.globalAlpha = Math.max(0.12, fade)
    // hull, tail boom + fin with the red light. The night canopy is nearly
    // black, so the silhouette rides a shade above the sky's darkest stop and
    // carries a moonlit top line — the cabinet's chopper reads, so ours must.
    ctx.fillStyle = '#2c3a1e'
    ctx.fillRect(-4, -5, 22, 9)
    ctx.fillRect(16, -3, 12, 3)
    ctx.fillRect(25, -8, 3, 5)
    ctx.fillStyle = '#e23b2e'
    ctx.fillRect(26, -7, 2, 2)
    ctx.fillStyle = '#47582d'
    ctx.fillRect(-4, -5, 22, 2) // moonlit top
    ctx.fillStyle = '#10170b'
    ctx.fillRect(-4, 2, 22, 2) // belly shadow — the rope drops from here
    ctx.fillStyle = '#8ad4ff'
    ctx.fillRect(-2, -3, 4, 3) // cockpit glass, catching the sky
    ctx.fillStyle = '#dcedf5'
    ctx.fillRect(-2, -3, 2, 1)
    // skids
    ctx.fillStyle = '#141a10'
    ctx.fillRect(-2, 4, 18, 1); ctx.fillRect(0, 3, 1, 1); ctx.fillRect(12, 3, 1, 1)
    // rotor: mast + a wide bright blur disc that chops (the courier's chop,
    // one span wider and brighter — the ceremony bird must out-read it)
    ctx.fillStyle = '#141a10'
    ctx.fillRect(-1, -9, 2, 4)
    const chop = [30, 22, 30, 16][Math.floor(tick / 3) % 4]
    ctx.fillStyle = 'rgba(168,178,168,0.72)'
    ctx.fillRect(-chop, -11, chop * 2, 2)
    ctx.restore()
}

export function drawSoldier (ctx, s, _tick) {
    ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y))
    const dir = Math.sign(s.walkDir || -1)
    const moving = !s.hold
    const f = moving ? Math.floor(s.walk / 5) % 3 : 0
    ctx.fillStyle = C.uniDark
    ctx.fillRect(-4, -11, 3, 8); ctx.fillRect(1, -11, 3, 8)
    if (moving && f === 0) { ctx.fillRect(-6, -11, 3, 9); ctx.fillRect(3, -12, 3, 8) }      // long stride
    else if (moving && f === 1) { ctx.fillRect(-3, -11, 3, 9); ctx.fillRect(0, -11, 3, 9) }  // passing
    else if (moving) { ctx.fillRect(-5, -12, 3, 8); ctx.fillRect(2, -10, 3, 8) }             // push-off
    ctx.fillStyle = '#303020'
    ctx.fillRect(-5, -2, 3, 2); ctx.fillRect(2, -2, 3, 2)
    ctx.fillStyle = C.uni
    ctx.fillRect(-5, -20, 10, 9)
    // S3 grenadier: dark vest + shell bandolier, and the lob wind-up arm
    if (s.nade) {
        ctx.fillStyle = C.vest
        ctx.fillRect(-5, -18, 10, 3)
        ctx.fillStyle = '#8a7040'
        for (let i = 0; i < 3; i++) ctx.fillRect(-4 + i * 3, -17, 2, 2)
        if (s.throwT > 0 && s.throwT <= 20) {
            ctx.fillStyle = C.skin
            ctx.fillRect(dir > 0 ? 3 : -6, -24, 3, 6) // arm cocked back over the head
            ctx.fillStyle = '#232a20'
            ctx.fillRect(dir > 0 ? 4 : -6, -27, 3, 3) // bomb in hand
        }
    }
    ctx.fillStyle = C.skin
    ctx.fillRect(-3, -26, 6, 6)
    ctx.fillStyle = C.beret
    ctx.fillRect(-4 + dir, -28, 8, 3)
    const recoil = s.flash > 0 ? -dir : 0
    ctx.fillStyle = C.gunMetal
    ctx.fillRect((dir > 0 ? 2 : -10) + recoil, -16, 8, 2)
    if (s.flash > 0) { // muzzle flash: two-frame star at the barrel tip
        const mx = (dir > 0 ? 11 : -11) + recoil
        ctx.fillStyle = s.flash > 2 ? '#fff6c8' : '#ffb347'
        ctx.fillRect(mx - 2, -18, 4, 4)
        ctx.fillRect(mx - (dir > 0 ? 0 : 4), -17, 3, 2)
    }
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

// S3.5 arms depot: a concrete emplacement — seam-slab body, hazard-toothed
// cap, aimed slit gun, supply hatch (it breathes open before a spill), and a
// crack pattern that deepens to ember glow as the ten hp burn down.
export function drawDepot (ctx, d, tick) {
    ctx.save(); ctx.translate(Math.round(d.x), Math.round(d.y))
    ctx.fillStyle = '#525c66'
    ctx.fillRect(-18, -44, 36, 44)
    ctx.fillStyle = '#3a4148'
    ctx.fillRect(-14, -40, 28, 40)
    for (let r = 0; r < 5; r++) ctx.fillRect(-14, -38 + r * 8, 28, 1)
    ctx.fillStyle = '#242a30'
    ctx.fillRect(-20, -48, 40, 5)
    ctx.fillStyle = '#c22f28'
    for (let i = 0; i < 5; i++) ctx.fillRect(-18 + i * 8, -48, 4, 3)
    ctx.fillStyle = '#131a22'
    ctx.fillRect(-10, -30, 20, 5)
    ctx.strokeStyle = '#78838f'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(Math.cos(d.aim) * 15, -28 + Math.sin(d.aim) * 15); ctx.stroke()
    ctx.fillStyle = '#242a30'
    ctx.fillRect(4, -16, 12, 14)
    if (d.spawnT < 50) { ctx.fillStyle = '#131a22'; ctx.fillRect(5, -15, 10, 12) }
    ctx.fillStyle = '#d8c07a'
    ctx.fillRect(6, -9, 3, 3); ctx.fillRect(11, -9, 3, 3)
    const dmg = 10 - d.hp
    const CRACKS = [[-12, -34], [8, -22], [-6, -12], [14, -36], [-2, -36], [10, -8], [-14, -20], [2, -18], [-8, -26], [4, -30]]
    ctx.fillStyle = '#181d22'
    for (let i = 0; i < dmg; i++) { const [cx, cy] = CRACKS[i]; ctx.fillRect(cx, cy, 2, 4); ctx.fillRect(cx + 1, cy + 3, 2, 2) }
    if (dmg >= 7 && Math.floor(tick / 6) % 2 === 0) { ctx.fillStyle = '#ff7a3c'; ctx.fillRect(-10, -30, 20, 2) }
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

// #2847 pod carrier — Konami's power-up courier: a chunky dark-olive gunship
// running low across the jungle, pod slung on twin cables under the belly.
// The rotor is a chopping disc (the blade line sweeps 4 phases), the cockpit
// glass catches the sky, and a wounded airframe (hp 1) trails deterministic
// embers. Art reads the tick — no rng on the pixel grid.
export function drawCarrier (ctx, cr, tick) {
    ctx.save(); ctx.translate(Math.round(cr.x), Math.round(cr.y))
    // cargo cables + the pod it ferries (the prize visible before the fight)
    ctx.fillStyle = '#20242c'
    ctx.fillRect(-6, 7, 1, 6); ctx.fillRect(5, 7, 1, 6)
    drawCapsule(ctx, { x: 0, y: 15 }, tick)
    // tail boom + fin
    ctx.fillStyle = '#4a5430'
    ctx.fillRect(10, -4, 14, 5)
    ctx.fillStyle = '#38401f'
    ctx.fillRect(21, -10, 3, 7)
    ctx.fillStyle = '#e23b2e'
    ctx.fillRect(22, -9, 2, 2)
    // airframe: hull, lit belly line, engine nacelle
    ctx.fillStyle = '#55623a'
    ctx.fillRect(-14, -7, 26, 12)
    ctx.fillStyle = '#6d7c48'
    ctx.fillRect(-14, -7, 26, 3)
    ctx.fillStyle = '#38401f'
    ctx.fillRect(-14, 3, 26, 2)
    ctx.fillStyle = '#3c4650'
    ctx.fillRect(-18, -2, 6, 7)
    // cockpit glass, catching the canopy green
    ctx.fillStyle = '#8ad4ff'
    ctx.fillRect(-12, -5, 5, 4)
    ctx.fillStyle = '#dcedf5'
    ctx.fillRect(-12, -5, 2, 2)
    // landing skids
    ctx.fillStyle = '#20242c'
    ctx.fillRect(-12, 5, 22, 1)
    ctx.fillRect(-10, 3, 1, 3); ctx.fillRect(6, 3, 1, 3)
    // rotor: mast + a blurred disc (the cabinet's wide chop, #2852) — a
    // translucent sweep under two counter-phase blade lines, so it never
    // reads as a lone antenna at a glance. Art reads the tick; no rng.
    ctx.fillStyle = '#20242c'
    ctx.fillRect(-1, -11, 2, 4)
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#c8d0bc'
    ctx.fillRect(-19, -12, 38, 2)
    ctx.globalAlpha = 1
    const ph = Math.floor(tick / 3) % 4
    const wA = [20, 14, 20, 10][ph]
    const wB = [10, 20, 10, 20][ph]
    ctx.fillStyle = '#aab4a0'
    ctx.fillRect(-wA, -12, wA * 2, 1)
    ctx.fillStyle = '#87917e'
    ctx.fillRect(-wB, -11, wB * 2, 1)
    ctx.fillStyle = '#5a6450'
    ctx.fillRect(-1, -13, 2, 2)
    // wounded: embers streaming from the nacelle (deterministic — tick-phased)
    if (cr.hp <= 1) {
        for (let i = 0; i < 4; i++) {
            const e = (Math.floor(tick / 2) + i * 5) % 16
            ctx.fillStyle = e % 2 ? '#ff8c1a' : '#7d848c'
            ctx.fillRect(7 + e, 2 + ((i + Math.floor(tick / 4)) % 3), 2, 2)
        }
    }
    ctx.restore()
}

export function drawCapsule (ctx, c, tick) {
    const recoil = c.recoil || 0   // #2852: jettison snap (freshly-cut pod only)
    const puff = c.puff || 0       // #2852: sand kick on touchdown
    const lift = recoil >= 4 ? -2 : recoil > 0 ? -1 : 0
    ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y) + lift)
    if (recoil > 0) {
        // the hooks: two cable stubs off the top, tips flicking open as they part
        ctx.fillStyle = '#20242c'
        ctx.fillRect(-6, -9, 1, 3); ctx.fillRect(5, -9, 1, 3)
        if (recoil <= 3) { ctx.fillStyle = '#5a6450'; ctx.fillRect(-8, -11, 1, 3); ctx.fillRect(7, -11, 1, 3) }
    }
    const pulse = Math.floor(tick / 8) % 2
    ctx.fillStyle = pulse ? C.capsuleLit : C.capsule
    ctx.fillRect(-8, -6, 16, 12)
    ctx.fillStyle = C.capsuleWin
    ctx.fillRect(-5, -3, 10, 6)
    // the letter wheel: every capsule carries its gun (S/M/F/L) — stamped as
    // a crisp 5x5 bitmap (#2789 salvage), no antialiased font on the pixel grid
    const kind = c.kind || 'spread'
    ctx.fillStyle = C[INK_OF[kind] || INK_OF.spread]
    const rows = GLYPH[LETTER_OF[kind] || LETTER_OF.spread]
    for (let r = 0; r < 5; r++) { for (let bit = 0; bit < 5; bit++) if (rows[r] & (1 << (4 - bit))) ctx.fillRect(-2 + bit, -2 + r, 1, 1) }
    // sparkle trail
    ctx.fillStyle = pulse ? '#fff2b0' : '#ffb347'
    ctx.fillRect(10, -1, 3, 2); ctx.fillRect(15, -2 + (tick % 3), 2, 1)
    if (puff > 0) {
        // #2852 touchdown: three sand specks kicked out, deterministic arcing
        const k = 12 - puff
        ctx.fillStyle = k % 2 ? '#c2a06a' : '#8f7750'
        ctx.fillRect(-9 - k, 3 + (k % 3), 2, 2)
        ctx.fillRect(8 + k, 4 - (k % 2), 2, 1)
        ctx.fillRect(-2 - Math.floor(k / 2), 5, 1, 1)
    }
    ctx.restore()
}

export function drawBullet (ctx, b, enemy) {
    const x = Math.round(b.x), y = Math.round(b.y)
    if (!enemy && b.k === 'f') {
        // firebar: a flame ball, hottest at the core, flickering as it tumbles
        const fl = Math.floor((b.ph || 0) * 4) % 2
        ctx.fillStyle = C.flame
        ctx.beginPath(); ctx.arc(x, y, 3 + fl, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = C.flameHot
        ctx.beginPath(); ctx.arc(x, y, 1 + fl, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ff9a4a'
        ctx.fillRect(x - 4 - fl, y - 1, 2, 2)
        return
    }
    if (!enemy && b.k === 'l') {
        // laser: a long thin coherent streak along its travel
        const m = Math.hypot(b.vx, b.vy) || 1
        const ux = b.vx / m, uy = b.vy / m
        ctx.strokeStyle = C.laser
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x - ux * 10, y - uy * 10); ctx.lineTo(x, y); ctx.stroke()
        ctx.strokeStyle = C.laserCore
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x - ux * 7, y - uy * 7); ctx.lineTo(x, y); ctx.stroke()
        return
    }
    if (!enemy && b.k === 'm') {
        // machine gun: hotter, fatter tracers than the rifle's
        ctx.fillStyle = '#ffd23c'
        ctx.fillRect(x - 3, y - 1, 5, 2)
        ctx.fillStyle = '#fff6c8'
        ctx.fillRect(x + 1, y - 1, 2, 2)
        return
    }
    ctx.fillStyle = enemy ? '#ff5a3c' : '#ffe27a'
    ctx.fillRect(x - 2, y - 1, enemy ? 3 : 4, 2)
}

// S3 grenade: a dark iron bomb spinning on its arc (rides the eb stream)
export function drawGrenade (ctx, b) {
    const x = Math.round(b.x), y = Math.round(b.y)
    ctx.fillStyle = '#232a20'
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#3f4a38'
    ctx.fillRect(x - 1, y - 4, 2, 2)
    ctx.fillStyle = '#ffb347'
    ctx.fillRect(x + 1, y - 4, 1, 1) // fuse spark
}

// S3 tree-line sniper: a nest in the canopy, a prone body, a long rifle, and
// the scope glint that flashes while the shot charges (t < 40 = telegraph).
export function drawSniper (ctx, sn, tick) {
    ctx.save(); ctx.translate(Math.round(sn.x), Math.round(sn.y))
    // branch + nest
    ctx.fillStyle = C.nest
    ctx.fillRect(-14, -2, 28, 6)
    ctx.fillStyle = C.nestLit
    ctx.fillRect(-14, -2, 28, 2)
    ctx.fillStyle = C.leafDark
    ctx.fillRect(-17, -14, 6, 12); ctx.fillRect(11, -12, 6, 10)
    ctx.fillStyle = C.leaf
    ctx.fillRect(-17, -16, 5, 4); ctx.fillRect(12, -14, 5, 3)
    // crouched body
    ctx.fillStyle = C.uniDark
    ctx.fillRect(-5, -9, 4, 7); ctx.fillRect(1, -8, 4, 6)
    ctx.fillStyle = C.uni
    ctx.fillRect(-5, -17, 10, 8)
    ctx.fillStyle = C.skin
    ctx.fillRect(-2, -22, 5, 5)
    ctx.fillStyle = C.vest
    ctx.fillRect(-5, -15, 10, 3)
    // long rifle along the aim
    const a = sn.aim
    ctx.strokeStyle = C.gunMetal
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(Math.cos(a) * 16, -14 + Math.sin(a) * 16); ctx.stroke()
    // scope glint: the telegraph — blinks while the round charges
    if (sn.t < 40 && Math.floor(tick / 4) % 2 === 0) {
        ctx.fillStyle = C.scope
        ctx.fillRect(Math.cos(a) * 8 - 1, -16 + Math.sin(a) * 8, 3, 3)
    }
    if (sn.flash > 0) {
        ctx.fillStyle = sn.flash > 4 ? '#fff6c8' : '#ffb347'
        ctx.fillRect(Math.cos(a) * 16 - 2, -14 + Math.sin(a) * 16 - 2, 4, 4)
    }
    ctx.restore()
}

// the hero's death tumble (ART.md bar 2/5: dies animate, 2-4 frames). The
// sim's freeze law is untouched — this is the body the shell draws during the
// respawn freeze: the original spins the hero away from the hit. blue = S4
// seat 2's palette (the arcade swaps the whole body, seat-for-seat).
export function drawDeathTumble (ctx, x, y, frame, blue = false) {
    ctx.save()
    ctx.translate(Math.round(x), Math.round(y) - 14)
    ctx.rotate((frame * Math.PI) / 2 + 0.3)
    ctx.fillStyle = blue ? '#a8cfe0' : C.tank
    ctx.fillRect(-4, -8, 8, 10)
    ctx.fillStyle = blue ? '#16265c' : C.pants
    ctx.fillRect(-4, 2, 8, 6)
    ctx.fillStyle = C.skin
    ctx.fillRect(-3, -13, 6, 5)
    ctx.fillStyle = blue ? '#2b6fd4' : C.band
    ctx.fillRect(-3, -14, 6, 3)
    ctx.fillStyle = C.boots
    ctx.fillRect(-5, 7, 4, 3); ctx.fillRect(1, 7, 4, 3)
    ctx.restore()
}

// Expanding fireball (ART.md bar 5: juice on every impact). kind sizes it:
// 'tnt' = full demolition multi-ring; 'kill' = a crisp snap for one soldier;
// 'death' = the hero's red burst. t counts up in shell-cosmetic ticks.
export function drawFireball (ctx, f) {
    const life = f.kind === 'kill' ? 16 : 26
    if (f.t >= life) return false
    const p = f.t / life
    ctx.save()
    ctx.translate(Math.round(f.x), Math.round(f.y))
    ctx.globalAlpha = 1 - p * p
    const ring = (r, col) => {
        if (r <= 0) return
        ctx.fillStyle = col
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
    }
    if (f.kind === 'kill') {
        ring(2 + 9 * p, '#ff6a2a')
        ring(1 + 5 * p, p < 0.5 ? '#fff6c8' : '#ffd23c')
    } else {
        ring(4 + 24 * p, '#d0342c')          // outer fire ring
        ring(3 + 17 * p, '#ff6a2a')         // middle ring
        ring(2 + 9 * p, p < 0.45 ? '#ffffff' : '#ffd23c') // flash then core
        // ember flecks riding the shockwave
        ctx.fillStyle = '#ffb347'
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + 0.5
            const r = 8 + 26 * p
            ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2)
        }
    }
    ctx.restore()
    return true
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
    // #2814 SHARED POOL: the cabinet shows ONE lives counter for the whole
    // team — these heads are every life both seats have left.
    for (let i = 0; i < gs.lives; i++) {
        ctx.fillStyle = C.band
        ctx.fillRect(150 + i * 10, 12, 6, 2)
        ctx.fillStyle = C.skin
        ctx.fillRect(150 + i * 10, 14, 6, 4)
    }
    const wnames = { rifle: 'RIFLE', spread: 'SPREAD', machine: 'MGUN', fire: 'FIRE', laser: 'LASER' }
    const wcols = { rifle: C.ink, spread: C.capsuleLit, machine: '#7fb2ff', fire: '#ff6a2a', laser: '#ff4ad4' }
    ctx.fillStyle = wcols[gs.p.weapon] || C.ink
    ctx.fillText(wnames[gs.p.weapon] || 'RIFLE', 314, 4)
    // S4 co-op: seat 2 reads blue — his tag and his wheel. #2814: NO bank of
    // his own anymore — the single head-row is the SHARED pool, the cabinet's
    // one-pool law (#2814). A seat that's down leaves the HUD entirely.
    if (gs.p2 && !gs.p2.out) {
        // #2842: the tag speaks — steady while seated, blink-in all the way
        // down the rope (synced with the arrival), gold fast-blink for the
        // last two seconds of drop-out patience.
        const tag = seatTagState(gs)
        const on = tag === 'warn' ? Math.floor(gs.tick / 4) % 2 === 0
            : tag === 'arrive' ? Math.floor(gs.tick / 6) % 2 === 0
            : true
        if (on) {
            ctx.fillStyle = tag === 'warn' ? C.gold : '#7fb2ff'
            ctx.fillText('2UP', 232, 4)
        }
        ctx.fillStyle = wcols[gs.p2.weapon] || C.ink
        ctx.fillText(wnames[gs.p2.weapon] || 'RIFLE', 314, 12)
    }
}

// ================================================================ S2 ════════
// The waterfall canyon. Konami's vertical section: a slate gorge, the torrent
// thundering down the face, moss-lipped rock shelves zigzagging to the top,
// and the white foam line chasing you at the bottom of the screen.

const h1 = (n) => { let x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }

// Canyon backdrop — screen space (caller draws before the camera translate).
export function drawCanyon (ctx, camY, tick) {
    const g = ctx.createLinearGradient(0, 0, 0, 224)
    g.addColorStop(0, '#0d1622'); g.addColorStop(0.6, '#122232'); g.addColorStop(1, '#0a141f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 384, 224)
    // far wall mist bands, slow parallax
    ctx.fillStyle = 'rgba(70,110,140,0.14)'
    for (let i = 0; i < 4; i++) {
        const my = ((i * 61 - camY * 0.25 + tick * 0.12) % 250 + 250) % 250 - 14
        ctx.fillRect(0, my, 384, 6 + (i % 3) * 3)
    }
    // jagged rock edges both sides (stable in world space via camY)
    const edge = (side) => {
        ctx.fillStyle = side < 0 ? C.rockLo : C.rock
        const step = 16
        for (let sy = -(camY % step); sy < 224 + step; sy += step) {
            const wy = Math.round(camY + sy)
            const j = Math.floor(h1(side * 31 + Math.floor(wy / step) * 7) * 9)
            const xw = 10 + j
            if (side < 0) ctx.fillRect(0, sy, xw, step + 1)
            else ctx.fillRect(384 - xw, sy, xw, step + 1)
        }
        ctx.fillStyle = C.rockDeep
        for (let sy = -(camY % (step * 2)); sy < 224 + step * 2; sy += step * 2) {
            const wy = Math.round(camY + sy)
            if (side < 0) ctx.fillRect(0, sy, 4 + Math.floor(h1(wy * 1.7) * 4), step * 2)
            else ctx.fillRect(384 - 4 - Math.floor(h1(wy * 2.3) * 4), sy, 8, step * 2)
        }
    }
    edge(-1); edge(1)
    // the cascade: broad blue face down the middle-back, streaks running down
    ctx.fillStyle = 'rgba(30,74,110,0.55)'
    ctx.fillRect(150, 0, 84, 224)
    ctx.fillStyle = 'rgba(18,58,92,0.5)'
    ctx.fillRect(138, 0, 10, 224); ctx.fillRect(236, 0, 10, 224)
    for (let i = 0; i < 16; i++) {
        const sx = 152 + h1(i * 11.3) * 80
        const len = 18 + h1(i * 5.1) * 26
        const sy = ((tick * (3 + h1(i) * 2) + h1(i * 3.7) * 240) % (224 + len)) - len
        ctx.fillStyle = i % 3 === 0 ? 'rgba(191,228,239,0.5)' : 'rgba(120,180,210,0.35)'
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, len)
    }
    // spray motes near the bottom
    for (let i = 0; i < 10; i++) {
        const mx = ((i * 47 + tick * (1 + h1(i * 9) * 2)) % 420) - 18
        const my = 170 + h1(i * 7.7) * 40
        ctx.fillStyle = (Math.floor(tick / 9) + i) % 2 === 0 ? 'rgba(207,232,242,0.7)' : 'rgba(127,184,212,0.4)'
        ctx.fillRect(Math.round(mx), Math.round(my), 1, 1)
    }
}

// A rock shelf — one-way like the jungle walkways, but cut from the gorge wall.
export function drawLedge (ctx, l) {
    ctx.fillStyle = C.rockLo
    ctx.fillRect(l.x, l.y + 2, l.w, 9)
    ctx.fillStyle = C.rock
    ctx.fillRect(l.x, l.y, l.w, 5)
    ctx.fillStyle = C.rockHi
    ctx.fillRect(l.x + 2, l.y - 1, l.w - 4, 2)
    // moss lips, drips off the front edge
    ctx.fillStyle = C.moss
    for (let gx = l.x + 3; gx < l.x + l.w - 3; gx += 6) {
        if (h1(gx * 3.1) > 0.5) ctx.fillRect(gx, l.y - 2, 3, 2)
    }
    ctx.fillStyle = C.mossLit
    for (let gx = l.x + 5; gx < l.x + l.w - 4; gx += 11) {
        if (h1(gx * 7.9) > 0.62) ctx.fillRect(gx, l.y - 3, 2, 1)
    }
    ctx.fillStyle = 'rgba(127,184,212,0.5)'
    for (let gx = l.x + 8; gx < l.x + l.w - 6; gx += 23) {
        if (h1(gx * 1.7) > 0.5) ctx.fillRect(gx, l.y + 10, 1, 3)
    }
}

// The torrent at the bottom of the screen — screen space, drawn last.
export function drawWater (ctx, tick) {
    const top = 208
    const g = ctx.createLinearGradient(0, top, 0, 224)
    g.addColorStop(0, C.foam2); g.addColorStop(0.25, C.waterTop); g.addColorStop(1, C.waterLo)
    ctx.fillStyle = g
    ctx.fillRect(0, top, 384, 16)
    // wave crests
    ctx.fillStyle = C.foam
    for (let x = 0; x < 384; x += 8) {
        const bob = Math.sin(tick / 6 + x / 9) * 1.6
        ctx.fillRect(x, Math.round(top + bob), 5, 2)
    }
    ctx.fillStyle = 'rgba(207,232,242,0.45)'
    for (let x = 2; x < 384; x += 13) {
        const bob = Math.sin(tick / 5 + x / 7 + 2) * 1.2
        ctx.fillRect(x + ((tick % 13) - 6), Math.round(top + 4 + bob), 3, 1)
    }
}

// The fortress gate: the wall right of the arena, cannon emplacements, the
// spawn door, and the core — armored while its shutter rides, a red furnace
// when it opens (stage 1's real finish).
export function drawGateStructure (ctx, boss, tick) {
    const open = (boss.coreT % CFG.coreCycle) < CFG.coreOpen
    // wall blocks the whole right reach
    ctx.fillStyle = C.steelLo
    ctx.fillRect(168, 16, 216, 134)
    ctx.fillStyle = C.steel
    for (let ry = 0; ry < 7; ry++) {
        for (let rx = 0; rx < 9; rx++) {
            const off = (ry % 2) * 12
            ctx.fillRect(170 + rx * 24 + off, 18 + ry * 19, 22, 17)
        }
    }
    ctx.fillStyle = C.steelLit
    ctx.fillRect(168, 16, 216, 2)
    ctx.fillStyle = C.rust
    for (let i = 0; i < 8; i++) {
        const rx = 174 + Math.floor(h1(i * 13.7) * 200)
        const ry = 22 + Math.floor(h1(i * 9.1) * 118)
        ctx.fillRect(rx, ry, 2 + Math.floor(h1(i * 3.3) * 3), 1)
    }
    // bolts along the wall face
    ctx.fillStyle = C.steelLit
    for (let by = 24; by < 148; by += 22) { ctx.fillRect(172, by, 2, 2); ctx.fillRect(378, by, 2, 2) }
    // cannon emplacements
    for (const g of boss.guns) {
        ctx.fillStyle = C.rockLo
        ctx.fillRect(g.x - 11, g.y - 9, 22, 18)
        ctx.fillStyle = '#141820'
        ctx.fillRect(g.x - 7, g.y - 5, 14, 10)
        ctx.fillStyle = recharging(g, tick) ? '#ff8c1a' : '#3c4650'
        ctx.fillRect(g.x - 2, g.y - 2, 5, 4)
    }
    // spawn doors: the arch in the gate wall, and a rock postern in the left cliff
    const d = boss.doors[0]
    ctx.fillStyle = '#10141c'
    ctx.fillRect(d.x - 14, d.y - 34, 28, 34)
    ctx.fillStyle = C.steelLo
    ctx.fillRect(d.x - 16, d.y - 36, 32, 3)
    ctx.fillStyle = open ? '#e23b2e' : '#5a201c'
    ctx.fillRect(d.x - 14, d.y - 34, 28, 2)
    const d2 = boss.doors[1]
    ctx.fillStyle = '#0c1118'
    ctx.fillRect(d2.x - 4, d2.y - 30, 22, 30)
    ctx.fillStyle = C.rockLo
    ctx.fillRect(d2.x - 6, d2.y - 32, 26, 3)
    ctx.fillStyle = C.rockHi
    ctx.fillRect(d2.x - 6, d2.y - 32, 8, 2)
    // the core housing
    ctx.fillStyle = C.rockLo
    ctx.fillRect(176, 74, 48, 44)
    ctx.fillStyle = C.steelLo
    ctx.fillRect(180, 78, 40, 36)
    if (open) {
        const pulse = Math.floor(tick / 6) % 2
        ctx.fillStyle = pulse ? C.coreRed : '#ff6a4a'
        ctx.fillRect(186, 84, 28, 24)
        ctx.fillStyle = '#ffd0a0'
        ctx.fillRect(192 + Math.floor(h1(tick % 7) * 8), 90 + Math.floor(h1(tick % 5) * 8), 4, 4)
        ctx.fillStyle = C.coreDark
        ctx.fillRect(186, 84, 28, 2); ctx.fillRect(186, 106, 28, 2)
    } else {
        ctx.fillStyle = C.shutter
        ctx.fillRect(184, 82, 32, 28)
        ctx.fillStyle = C.shutterLit
        for (let sy = 84; sy < 110; sy += 4) ctx.fillRect(184, sy, 32, 2)
        ctx.fillStyle = '#20242c'
        ctx.fillRect(198, 82, 4, 28)
    }
    // damage cracks as the core weakens
    if (boss.core <= CFG.coreHp - 3) {
        ctx.fillStyle = '#20242c'
        ctx.fillRect(178, 80, 1, 30); ctx.fillRect(222, 76, 1, 26)
    }
    if (boss.core <= CFG.coreHp / 2) {
        ctx.fillStyle = '#ff8c1a'
        for (let i = 0; i < 3; i++) ctx.fillRect(178 + Math.floor(h1(i * 17.3 + (tick >> 4)) * 40), 76 + Math.floor(h1(i * 7.9) * 30), 2, 2)
    }
}

function recharging (g, tick) { return g.t < 24 && Math.floor(tick / 3) % 2 === 0 }

// the arena floor before the gate (falls phase draws it as a full-width shelf)
