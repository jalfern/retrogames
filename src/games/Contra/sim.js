// CONTRA — sim (pure Node, zero DOM). Jon's #1530 commission; S1 the jungle.
//
// The arcade original (Konami, 1987) runs its stage at 60 Hz: this sim is the
// whole game truth, one `step(gs, pad)` per tick. Determinism law: EVERY random
// the sim consumes rides `gs.r` (mulberry32 as an integer state) — so seed +
// pad streams replay hash-identical, and snapshot/restore survive JSON (no
// functions inside gs). Math.random is banned here; it may only live in the
// shell's cosmetic particle layer.
//
// Stage: one horizontal jungle scroll, ~6 screens to the base gate. The
// signature set S1 answers: 8-way run-and-gun while running/jumping, one-hit
// death with 3 lives and respawn i-frames, the flying SPREAD capsule, soldiers
// that run at you, turret posts, explosive barrels, and a STAGE CLEAR leg.
// The waterfall + boss gate are S2 (README honest gaps).

export const W = 384
export const H = 224

export const CFG = {
    ground: 196,           // feet y of the jungle floor
    worldW: 2048,
    endX: 2000,           // reaching the base gate clears the stage
    run: 2.0,
    jumpV: -5.2,
    grav: 0.28,
    coyote: 6,            // ticks of grace after walking off a ledge
    bulletSpeed: 5.5,
    spreadSpeed: 5.0,
    spreadArc: Math.PI / 4.1,
    fireCool: 8,
    fireCoolSpread: 10,
    eBulletSpeed: 2.2,
    respawnFreeze: 50,
    invuln: 100,
    blastR: 36,           // barrel/turret kill radius
    blastPlayerR: 30,
}

const PAD0 = { left: false, right: false, up: false, down: false, a: false, b: false }

// mulberry32 as pure state-in/state-out: the rng is just an integer on gs.
export function rnd (gs) {
    gs.r = (gs.r + 0x6d2b79f5) >>> 0
    let t = gs.r
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// One solid-topped platform list (jump through from below, land from above).
export const PLATFORMS = [
    { x: 320, y: 150, w: 96 },
    { x: 560, y: 140, w: 80 },
    { x: 800, y: 152, w: 110 },
    { x: 1180, y: 142, w: 90 },
    { x: 1520, y: 150, w: 120 },
    { x: 1760, y: 138, w: 80 },
]

const SOLDIERS = [
    { x: 300, y: 196, hold: false },
    { x: 600, y: 140, hold: true },   // platform gunner on the walkways
    { x: 760, y: 196, hold: false },
    { x: 855, y: 152, hold: true },
    { x: 1120, y: 196, hold: false },
    { x: 1225, y: 142, hold: true },
    { x: 1400, y: 196, hold: false },
    { x: 1580, y: 150, hold: true },
    { x: 1900, y: 196, hold: false },
]
const TURRET_AT = [470, 1050, 1650]
const BARREL_AT = [640, 662, 980, 1300, 1840]

export function makeGame (seed) {
    const gs = {
        seed: seed >>> 0,
        r: (seed >>> 0) ^ 0x9e3779b9,
        tick: 0,
        cam: 0,
        score: 0,
        lives: 3,
        end: null,                    // 'dead' | 'win'
        p: {
            x: 40, y: CFG.ground, vy: 0, onGround: true, face: 1,
            ax: 1, ay: 0,            // normalized 8-way aim (ax = straight ahead by default)
            cool: 0, weapon: 'rifle', // 'rifle' | 'spread' — the weapon dies with you
            inv: 120,               // spawn-in grace
            dead: 0,                // freeze ticks after a hit
            coyote: 0, drop: 0,     // coyote frames; ignore-platform frames
            walk: 0,                // animation phase (world ticks)
        },
        prevA: false,
        pb: [],                     // player bullets {x,y,vx,vy}
        eb: [],                     // enemy bullets
        soldiers: SOLDIERS.map((d) => ({ x: d.x, y: d.y, hold: d.hold, hp: 1, awake: false, t: 0, walk: 0, walkDir: -1, dead: false, flash: 0 })),
        turrets: TURRET_AT.map((x, i) => ({ x, y: CFG.ground, hp: 2, aim: Math.PI, t: 40 + i * 27, dead: false })),
        barrels: BARREL_AT.map((x) => ({ x, y: CFG.ground, gone: false })),
        capsule: null,              // {x,y,vx} — flies in from the right edge
        nextCapsule: 240,
        ev: [],                     // effect events (shell drains; not hashed)
    }
    return gs
}

function aimFrom (pad, gs) {
    const dx = pad.right ? 1 : pad.left ? -1 : 0
    let dy = 0
    if (pad.up) dy = -1
    else if (pad.down && !gs.p.onGround) dy = 1 // aim down only in mid-air, as on the cabinet
    let ax = dx, ay = dy
    if (dx === 0 && dy === 0) { ax = gs.p.face; ay = 0 }
    else if (dx !== 0) { gs.p.face = dx }
    const m = Math.hypot(ax, ay) || 1
    return { ax: ax / m, ay: ay / m }
}

function fire (gs) {
    const p = gs.p
    const o = { x: p.x + p.ax * 10, y: p.y - 16 + p.ay * 10 }
    if (p.weapon === 'spread') {
        const base = Math.atan2(p.ay, p.ax)
        for (let k = -2; k <= 2; k++) {
            const a = base + k * (CFG.spreadArc / 2)
            gs.pb.push({ x: o.x, y: o.y, vx: Math.cos(a) * CFG.spreadSpeed, vy: Math.sin(a) * CFG.spreadSpeed })
        }
        gs.ev.push({ type: 'spread' })
    } else {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.bulletSpeed, vy: p.ay * CFG.bulletSpeed })
        gs.ev.push({ type: 'shot' })
    }
}

// kind rides the (unhashed, cosmetic) event so the shell can size the blast:
// 'tnt' = barrel/turret demolition, 'kill' = a soldier dropped, 'death' = hero.
function boom (gs, x, y, hurtTurrets, kind) {
    gs.ev.push({ type: 'boom', x, y, kind: kind || 'tnt' })
    for (const s of gs.soldiers) if (!s.dead && Math.hypot(s.x - x, s.y - y - 12) < CFG.blastR) killSoldier(gs, s)
    if (hurtTurrets) for (const t of gs.turrets) if (!t.dead && Math.hypot(t.x - x, t.y - 18 - y) < CFG.blastR) hitTurret(gs, t)
    if (gs.p.dead === 0 && gs.p.inv <= 0 && Math.hypot(gs.p.x - x, gs.p.y - 12 - y) < CFG.blastPlayerR) killPlayer(gs)
}

function killSoldier (gs, s) {
    s.dead = true
    gs.score += 100
    gs.ev.push({ type: 'boom', x: s.x, y: s.y - 12, kind: 'kill' })
}

function hitTurret (gs, t) {
    t.hp -= 1
    gs.ev.push({ type: 'spark', x: t.x, y: t.y - 18 })
    if (t.hp <= 0) { t.dead = true; gs.score += 300; gs.ev.push({ type: 'boom', x: t.x, y: t.y - 18, kind: 'tnt' }) }
}

function killPlayer (gs) {
    gs.p.dead = CFG.respawnFreeze
    gs.lives -= 1
    gs.ev.push({ type: 'boom', x: gs.p.x, y: gs.p.y - 12, kind: 'death' })
    if (gs.lives <= 0) { gs.lives = 0; gs.end = 'dead'; gs.ev.push({ type: 'gameover' }) }
}

export function step (gs, pad = PAD0) {
    if (gs.end) { gs.tick += 1; return }
    const p = gs.p
    gs.tick += 1
    if (p.dead > 0) {
        p.dead -= 1
        if (p.dead === 0) {           // respawn at the camera lip, weapon lost, flashing
            p.x = Math.max(40, gs.cam + 40)
            p.y = CFG.ground; p.vy = 0; p.onGround = true
            p.weapon = 'rifle'; p.inv = CFG.invuln
            gs.eb.length = 0
            gs.ev.push({ type: 'respawn' })
        }
        return
    }

    // --- player: run, aim, jump, fire ---
    const aim = aimFrom(pad, gs)
    p.ax = aim.ax; p.ay = aim.ay
    const runDir = (pad.right ? 1 : 0) - (pad.left ? 1 : 0)
    if (runDir) { p.x += runDir * CFG.run; p.walk += 1 }
    p.x = Math.max(4, Math.min(CFG.worldW - 4, p.x))
    p.px = p.x

    if (p.onGround) p.coyote = CFG.coyote
    else if (p.coyote > 0) p.coyote -= 1
    const jumpEdge = pad.a && !gs.prevA
    gs.prevA = pad.a
    if (jumpEdge && p.onGround) {
        const onPlat = PLATFORMS.some((pl) => p.px >= pl.x && p.px <= pl.x + pl.w && Math.abs(p.y - pl.y) < 2)
        if (pad.down && onPlat) { p.drop = 12; p.y += 2; p.onGround = false; p.vy = 0.5 }
        else { p.vy = CFG.jumpV; p.onGround = false; gs.ev.push({ type: 'jump' }) }
    }
    if (p.drop > 0) p.drop -= 1

    p.vy += CFG.grav
    p.y += p.vy
    p.onGround = false
    if (p.y >= CFG.ground) { p.y = CFG.ground; p.vy = 0; p.onGround = true }
    else if (p.vy > 0 && p.drop === 0) {
        p.px = p.x
        for (const pl of PLATFORMS) {
            if (p.px >= pl.x - 3 && p.px <= pl.x + pl.w + 3 && p.y >= pl.y && p.y - p.vy <= pl.y + 1) {
                p.y = pl.y; p.vy = 0; p.onGround = true; break
            }
        }
    }

    if (p.cool > 0) p.cool -= 1
    if (pad.b && p.cool === 0) {
        fire(gs)
        p.cool = p.weapon === 'spread' ? CFG.fireCoolSpread : CFG.fireCool
    }
    if (p.inv > 0) p.inv -= 1

    gs.cam = Math.max(0, Math.min(CFG.worldW - W, p.x - 110))
    if (p.x >= CFG.endX) { gs.end = 'win'; gs.ev.push({ type: 'clear' }); return }

    // --- bullets ---
    gs.pb = gs.pb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < -8 || b.y > H + 8) return false
        for (const br of gs.barrels) {
            if (!br.gone && Math.hypot(b.x - br.x, b.y - (br.y - 10)) < 12) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true); return false }
        }
        for (const s of gs.soldiers) {
            if (!s.dead && s.awake && Math.abs(b.x - s.x) < 8 && Math.abs(b.y - (s.y - 12)) < 13) { killSoldier(gs, s); return false }
        }
        for (const t of gs.turrets) {
            if (!t.dead && Math.abs(b.x - t.x) < 10 && Math.abs(b.y - (t.y - 16)) < 14) { hitTurret(gs, t); return false }
        }
        return true
    })

    // --- soldiers: wake just inside the view (a spawn beyond the bullet-despawn
    // edge was an unshootable shield — the smoke run proved the stage trivial),
    // open fire within a third of a second, runners close in, gunners hold the
    // walkways and shoot down-diagnostics like the original's ledge snipers. ---
    for (const s of gs.soldiers) {
        if (s.dead) continue
        if (!s.awake) {
            if (s.x < gs.cam + W - 4) { s.awake = true; s.t = 10 + Math.floor(rnd(gs) * 25) }
            continue
        }
        const dx = p.x - s.x
        s.walk += 1
        if (s.flash > 0) s.flash -= 1
        if (!s.hold && Math.abs(dx) > 26) { s.x += Math.sign(dx) * 1.1; s.walkDir = Math.sign(dx) }
        s.t -= 1
        const range = s.hold ? 280 : 220
        if (s.t <= 0 && Math.abs(dx) < range && gs.cam < s.x && s.x < gs.cam + W + 4) {
            const a = Math.atan2((p.y - 14) - (s.y - 12), p.x - s.x)
            gs.eb.push({ x: s.x + Math.cos(a) * 8, y: s.y - 12 + Math.sin(a) * 8, vx: Math.cos(a) * CFG.eBulletSpeed, vy: Math.sin(a) * CFG.eBulletSpeed })
            gs.ev.push({ type: 'efire' })
            s.flash = 4
            s.t = (s.hold ? 40 : 45) + Math.floor(rnd(gs) * 45)
        }
        // touching a live runner is a hit, as on the cabinet
        if (!s.hold && p.inv <= 0 && Math.abs(p.x - s.x) < 9 && Math.abs(p.y - s.y) < 20) killPlayer(gs)
        if (p.dead > 0) break
    }

    // --- turrets: scan, fire aimed bursts while in range ---
    for (const t of gs.turrets) {
        if (t.dead) continue
        const dx = p.x - t.x
        const inCam = t.x > gs.cam && t.x < gs.cam + W
        t.aim = Math.atan2((p.y - 14) - (t.y - 18), dx)
        t.t -= 1
        if (t.t <= 0 && inCam && Math.abs(dx) < 260) {
            gs.eb.push({ x: t.x + Math.cos(t.aim) * 12, y: t.y - 18 + Math.sin(t.aim) * 12, vx: Math.cos(t.aim) * CFG.eBulletSpeed, vy: Math.sin(t.aim) * CFG.eBulletSpeed })
            gs.ev.push({ type: 'efire', big: true })
            t.t = 85
        }
    }

    // --- barrels sitting on the ground: step into them and they go off ---
    for (const br of gs.barrels) {
        if (!br.gone && Math.abs(p.x - br.x) < 10 && p.y > br.y - 24) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true) }
    }

    // --- the flying capsule: Contra's signature weapon courier ---
    if (!gs.capsule && gs.tick >= gs.nextCapsule) {
        gs.capsule = { x: gs.cam + W + 10, y: 140, vx: -1.4 }
    }
    if (gs.capsule) {
        gs.capsule.x += gs.capsule.vx
        const c = gs.capsule
        if (p.inv >= 0 && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 600 + Math.floor(rnd(gs) * 300)
            if (p.weapon !== 'spread') { p.weapon = 'spread'; gs.score += 1000; gs.ev.push({ type: 'pickup' }) }
            else gs.ev.push({ type: 'pickup' })
        } else if (c.x < gs.cam - 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 300
        }
    }

    // --- enemy bullets: one hit kills (inv frames aside) ---
    gs.eb = gs.eb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < -8 || b.y > H + 8) return false
        if (p.inv <= 0 && p.dead === 0 && Math.abs(b.x - p.x) < 7 && Math.abs(b.y - (p.y - 14)) < 13) { killPlayer(gs); return false }
        return true
    })
}

// --- attract autopilot: the demo drives the seat, and so does the harness's
// "it can be won" leg. Honest-percept law: reads only what a player on the
// screen can see (own position, visible enemies/bullets/capsules). ---
export function autopilot (gs) {
    const p = gs.p
    const pad = { right: true, a: false, b: true, up: false, down: false, left: false }
    if (p.dead > 0 || gs.end) return pad
    // barrels: the lane discipline a thumb learns fast — easing off the trigger
    // short of a barrel avoids blowing yourself up with your own catch, and a
    // hop clears the body itself (touch is death).
    for (const br of gs.barrels) {
        if (!br.gone && br.x > p.x - 6) {
            if (br.x - p.x < 110) pad.b = false
            if (p.onGround && br.x - p.x < 22) pad.a = true
        }
    }
    // dodge: jump when a bullet is bearing down on the lane ahead of the knees
    if (!pad.a) for (const b of gs.eb) {
        const dx = b.x - p.x
        if (p.onGround && dx > 4 && dx < 46 && Math.abs(b.y - (p.y - 14)) < 12 && b.vy < 1.2) { pad.a = true; break }
    }
    // the capsule is the prize: chase its altitude
    if (!pad.a && gs.capsule) {
        const c = gs.capsule
        if (c.x - p.x > 0 && c.x - p.x < 30 && c.y < p.y - 22) pad.a = true
    }
    // aim up at the capsule while firing, or up the tree line at nothing? no —
    // aim up only when the capsule is level with the gun
    if (gs.capsule && Math.abs(gs.capsule.x - p.x) < 14 && gs.capsule.y < p.y - 26) { pad.up = true }
    return pad
}

// --- state hash: FNV-1a over the rounded sim truth (not events, not art). ---
export function stateHash (gs) {
    let h = 0x811c9dc5
    const put = (v) => {
        let x = Math.round(v * 100)
        x = (x + 0x7fffffff) >>> 0
        const s = String(x)
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
        h ^= 0x2c; h = Math.imul(h, 0x01000193)
    }
    put(gs.tick); put(gs.cam); put(gs.score); put(gs.lives); put(gs.seed); put(gs.r)
    put(gs.p.x); put(gs.p.y); put(gs.p.vy); put(gs.p.onGround ? 1 : 0); put(gs.p.face)
    put(gs.p.ax); put(gs.p.ay); put(gs.p.cool); put(gs.p.weapon === 'spread' ? 1 : 0)
    put(gs.p.inv); put(gs.p.dead); put(gs.prevA ? 1 : 0)
    for (const b of gs.pb) { put(b.x); put(b.y); put(b.vx); put(b.vy) }
    for (const b of gs.eb) { put(b.x); put(b.y); put(b.vx); put(b.vy) }
    for (const s of gs.soldiers) { put(s.awake ? 1 : 0); put(s.dead ? 1 : 0); put(s.x); put(s.t); put(s.walk) }
    for (const t of gs.turrets) { put(t.dead ? 1 : 0); put(t.hp); put(t.aim); put(t.t) }
    for (const br of gs.barrels) put(br.gone ? 1 : 0)
    put(gs.capsule ? gs.capsule.x : -9999); put(gs.nextCapsule)
    put(gs.end ? (gs.end === 'win' ? 2 : 1) : 0)
    return (h >>> 0)
}
