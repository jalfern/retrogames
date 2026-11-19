// CONTRA — sim (pure Node, zero DOM). Jon's #1530 commission; #2779 stages.
//
// The arcade original (Konami, 1987) runs its stage at 60 Hz: this sim is the
// whole game truth, one `step(gs, pad)` per tick. Determinism law: EVERY random
// the sim consumes rides `gs.r` (mulberry32 as an integer state) — so seed +
// pad streams replay hash-identical, and snapshot/restore survive JSON (no
// functions inside gs). Math.random is banned here; it may only live in the
// shell's cosmetic particle layer.
//
// S1 (the jungle): horizontal scroll ~6 screens; 8-way run-and-gun, one-hit
// death with 3 lives + respawn mercy, the SPREAD capsule, soldiers, turrets,
// TNT barrels.
// S2 (#2779, the base): reaching the bolted gate drops the hero into the
// WATERFALL — a vertical canyon the camera ratchets up (never retreats), the
// torrent at the screen's bottom edge drowns you, one-way rock shelves zigzag
// upward with gunners firing down. The top opens on the BOSS GATE: an armored
// fortress wall with two cannons and spawn doors; the one weak point is the
// core — armored when shut, vulnerable when open. Destroy it and stage 1 is
// truly finished (#2779 "stage 1's real finish").

export const W = 384
export const H = 224

export const CFG = {
    ground: 196,           // feet y of the jungle floor
    worldW: 2048,
    endX: 2000,           // reaching the base gate enters the waterfall (S2)
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
    // --- S2: the waterfall ---
    worldH: 700,          // world y of the canyon bottom (y grows downward)
    rise: 0.22,           // the torrent pushes the camera up this fast (px/tick)
    anchor: 140,          // hero above this screen line pushes the camera
    drownAt: 16,          // feet at camY + H - drownAt are in the water
    bossFloor: 150,       // arena floor world/screen y once the gate opens
    wallX: 168,           // the gate wall face; hero patrol is x < 162
    coreX: 200, coreY: 96, coreHW: 22, coreHH: 18,
    coreHp: 8,
    coreOpen: 120,        // vulnerable window (ticks)
    coreCycle: 190,       // open, then armored shut
    doorCap: 1,           // doors never spill more than this many live runners
    // --- S3: the weapon wall (#2779) ---
    mgCool: 3,            // machine gun cadence (rifle is 8)
    fireCoolFire: 9,      // the flame gun lobs slower than it threats
    fireCoolLaser: 12,    // the laser bites harder than it repeats
    laserSpeed: 8.2,
    fireSpeed: 3.6,
    sniperSpeed: 2.6,
    sniperRange: 320,     // outruns the grunt's 220 — aim up, take the roof
    depotHp: 10,          // the arms depot's armor rating
    grenCool: 130,        // grenade soldier throw cadence (fixed — no rng)
    grenR: 24,            // grenade blast radius (smaller than a barrel's)
}

// S3 weapon wall: the capsule pays a letter, M F L S as on the cabinet.
export const CAP_LETTERS = ['S', 'M', 'F', 'L']
const WPN_CODE = { rifle: 0, spread: 1, machine: 2, fire: 3, laser: 4 }
const KIND_CODE = { grunt: 0, sniper: 1, gren: 2 }

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

// The waterfall shelves — zigzag, each one reachable from the one below:
// rise <= 44 (jump apex ~48) and edge gap <= 55 (one jump travels ~74px).
// The last entry is the boss arena floor, full width.
export const FALLS_LEDGES = [
    { x: 110, y: 662, w: 160 },  // the lip you land on entering
    { x: 30, y: 618, w: 110 },
    { x: 170, y: 574, w: 170 },
    { x: 40, y: 530, w: 150 },
    { x: 230, y: 486, w: 130 },
    { x: 70, y: 442, w: 140 },
    { x: 250, y: 398, w: 120 },
    { x: 90, y: 354, w: 130 },
    { x: 260, y: 310, w: 110 },
    { x: 80, y: 266, w: 150 },
    { x: 230, y: 222, w: 140 },
    { x: 80, y: 186, w: 150 },    // last lip before the arena floor
    { x: 0, y: 150, w: 384 },     // the arena floor before the gate
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
    // S3 — the weapon wall: a sniper watches the far walkway...
    { x: 1800, y: 138, hold: true, kind: 'sniper' },
    // ...and one rides the depot roof, above level fire (aim up).
    { x: 1660, y: 152, hold: true, kind: 'sniper' },
]
const TURRET_AT = [470, 1050, 1650]
const BARREL_AT = [640, 662, 980, 1300, 1840]

// Gunners holding the waterfall shelves (y = their shelf top).
const FALLS_GUNNERS = [
    { x: 260, y: 574 },
    { x: 300, y: 486 },
    { x: 310, y: 398 },
    { x: 315, y: 310 },
    { x: 300, y: 222 },
]

// The gate: two cannon emplacements and two spawn doors (world == screen y
// once the camera locks at 0). The wall itself is armor — only the core hurts.
const GUNS = [{ x: 190, y: 36 }, { x: 330, y: 60 }]
const DOORS = [{ x: 250, y: 150 }, { x: 16, y: 150 }]

export function makeGame (seed) {
    const gs = {
        seed: seed >>> 0,
        r: (seed >>> 0) ^ 0x9e3779b9,
        tick: 0,
        cam: 0,
        camY: 0,
        phase: 'jungle',            // jungle | falls | boss
        score: 0,
        lives: 3,
        end: null,                  // 'dead' | 'win'
        p: {
            x: 40, y: CFG.ground, vy: 0, onGround: true, face: 1,
            ax: 1, ay: 0,            // normalized 8-way aim (ax = straight ahead by default)
            cool: 0, weapon: 'rifle', // 'rifle' | 'spread' | 'machine' | 'fire' | 'laser' — the weapon dies with you
            inv: 120,               // spawn-in grace
            dead: 0,                // freeze ticks after a hit
            coyote: 0, drop: 0,     // coyote frames; ignore-platform frames
            walk: 0,                // animation phase (world ticks)
        },
        safe: { x: 40, y: CFG.ground },   // respawn point (last ground/shelf touched)
        prevA: false,
        pb: [],                     // player bullets {x,y,vx,vy[,pierce][,kind]}
        eb: [],                     // enemy bullets ([,g] marks an arcing grenade)
        soldiers: SOLDIERS.map((d) => ({ x: d.x, y: d.y, hold: d.hold, kind: d.kind || 'grunt', hp: 1, awake: false, t: 0, walk: 0, walkDir: -1, dead: false, flash: 0 })),
        turrets: TURRET_AT.map((x, i) => ({ x, y: CFG.ground, hp: 2, aim: Math.PI, t: 40 + i * 27, dead: false })),
        barrels: BARREL_AT.map((x) => ({ x, y: CFG.ground, gone: false })),
        capsule: null,              // {x,y,vx,letter} — flies in from the right edge
        nextCapsule: 240,
        capN: 0,                    // capsule serial: letters cycle S -> M -> F -> L (no rng)
        depot: { x: 1660, y: CFG.ground, hp: CFG.depotHp, aim: Math.PI, t: 70, dead: false, spawnT: 240 },
        vc: [],                     // S3 volley capsules {x,y,vx,letter} released by the depot
        boss: null,                 // the gate, once the arena opens (see makeBoss)
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
    } else if (p.weapon === 'machine') {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.bulletSpeed, vy: p.ay * CFG.bulletSpeed, kind: 'mg' })
        gs.ev.push({ type: 'mg' })
    } else if (p.weapon === 'fire') {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.fireSpeed, vy: p.ay * CFG.fireSpeed, kind: 'fire' })
        gs.ev.push({ type: 'fsf' })
    } else if (p.weapon === 'laser') {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.laserSpeed, vy: p.ay * CFG.laserSpeed, pierce: true })
        gs.ev.push({ type: 'laser' })
    } else {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.bulletSpeed, vy: p.ay * CFG.bulletSpeed })
        gs.ev.push({ type: 'shot' })
    }
}

// The capsule's letter IS the weapon (S spread / M machine / F fire / L
// laser). +1000 only when the gun actually changes — repeats are a free top-up.
function grantWeapon (gs, letter) {
    const w = letter === 'M' ? 'machine' : letter === 'F' ? 'fire' : letter === 'L' ? 'laser' : 'spread'
    gs.ev.push({ type: 'pickup', letter })
    if (gs.p.weapon !== w) { gs.p.weapon = w; gs.score += 1000 }
}

// The depot's payout — Contra's capsule volley, three altitudes, deterministic
// letters (M F L). No rng: the wall pays the same honest prize every run.
function releaseVolley (gs) {
    const dx = gs.depot ? gs.depot.x : 1660
    gs.vc = [
        { x: dx + 22, y: 120, vx: -1.2, letter: 'M' },
        { x: dx + 36, y: 96, vx: -1.2, letter: 'F' },
        { x: dx + 50, y: 144, vx: -1.2, letter: 'L' },
    ]
    gs.ev.push({ type: 'volley' })
}

// kind rides the (unhashed, cosmetic) event so the shell can size the blast:
// 'tnt' = barrel/turret demolition, 'kill' = a soldier dropped, 'death' = hero.
// pr overrides the player-hurt radius (a grenade burst is smaller than TNT).
function boom (gs, x, y, hurtTurrets, kind, pr) {
    gs.ev.push({ type: 'boom', x, y, kind: kind || 'tnt' })
    for (const s of gs.soldiers) if (!s.dead && Math.hypot(s.x - x, s.y - y - 12) < CFG.blastR) killSoldier(gs, s)
    if (hurtTurrets) for (const t of gs.turrets) if (!t.dead && Math.hypot(t.x - x, t.y - 18 - y) < CFG.blastR) hitTurret(gs, t)
    if (gs.p.dead === 0 && gs.p.inv <= 0 && Math.hypot(gs.p.x - x, gs.p.y - 12 - y) < (pr || CFG.blastPlayerR)) killPlayer(gs)
}

function killSoldier (gs, s) {
    s.dead = true
    gs.score += s.kind === 'sniper' ? 200 : 100
    gs.ev.push({ type: 'boom', x: s.x, y: s.y - 12, kind: 'kill' })
}

function hitTurret (gs, t, dmg = 1) {
    t.hp -= dmg
    gs.ev.push({ type: 'spark', x: t.x, y: t.y - 18 })
    if (t.hp <= 0) { t.dead = true; gs.score += 300; gs.ev.push({ type: 'boom', x: t.x, y: t.y - 18, kind: 'tnt' }) }
}

function killPlayer (gs) {
    gs.p.dead = CFG.respawnFreeze
    gs.lives -= 1
    gs.ev.push({ type: 'boom', x: gs.p.x, y: gs.p.y - 12, kind: 'death' })
    if (gs.lives <= 0) { gs.lives = 0; gs.end = 'dead'; gs.ev.push({ type: 'gameover' }) }
}

// --- S2: entering the waterfall. The gate swallows the run: fresh vertical
// space, fresh gunners, the weapon (the fight is not your reward for dying). ---
function enterFalls (gs) {
    gs.phase = 'falls'
    gs.cam = 0
    gs.camY = CFG.worldH - H
    const p = gs.p
    p.x = 190; p.y = 662; p.vy = 0; p.onGround = true; p.drop = 0; p.coyote = 0
    gs.safe = { x: 190, y: 662 }
    gs.soldiers = FALLS_GUNNERS.map((d) => ({ x: d.x, y: d.y, hold: true, hp: 1, awake: false, t: 0, walk: 0, walkDir: -1, dead: false, flash: 0 }))
    gs.pb.length = 0; gs.eb.length = 0; gs.capsule = null
    gs.vc.length = 0
    gs.ev.push({ type: 'enter' })
}

function makeBoss (gs) {
    gs.phase = 'boss'
    gs.camY = 0
    const p = gs.p
    p.x = 60; p.y = CFG.bossFloor; p.vy = 0; p.onGround = true
    gs.safe = { x: 60, y: CFG.bossFloor }
    gs.soldiers = []
    gs.pb.length = 0; gs.eb.length = 0
    gs.boss = {
        core: CFG.coreHp,
        coreT: 30,                                  // start armored; first opening soon
        dying: 0,                                   // cascade countdown after the core falls
        guns: GUNS.map((g, i) => ({ x: g.x, y: g.y, t: 90 + i * 55 })),
        doors: DOORS.map((d, i) => ({ x: d.x, y: d.y, t: 150 + i * 120 })),
    }
    gs.ev.push({ type: 'enter' })
}

export function step (gs, pad = PAD0) {
    if (gs.end) { gs.tick += 1; return }
    const p = gs.p
    gs.tick += 1
    if (p.dead > 0) {
        p.dead -= 1
        if (p.dead === 0) {           // respawn at the last safe ground (arcade checkpoints),
            p.x = gs.safe.x           // weapon lost, flashing
            p.y = gs.safe.y; p.vy = 0; p.onGround = true
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
    if (gs.phase === 'jungle') p.x = Math.max(4, Math.min(CFG.worldW - 4, p.x))
    else p.x = Math.max(8, Math.min(gs.phase === 'boss' ? CFG.wallX - 10 : W - 8, p.x))
    p.px = p.x

    const ledges = gs.phase === 'jungle' ? PLATFORMS : FALLS_LEDGES
    const floorY = gs.phase === 'jungle' ? CFG.ground : (gs.phase === 'boss' ? CFG.bossFloor : Infinity)

    if (p.onGround) p.coyote = CFG.coyote
    else if (p.coyote > 0) p.coyote -= 1
    const jumpEdge = pad.a && !gs.prevA
    gs.prevA = pad.a
    if (jumpEdge && p.onGround) {
        const onPlat = ledges.some((pl) => p.px >= pl.x && p.px <= pl.x + pl.w && Math.abs(p.y - pl.y) < 2)
        if (pad.down && onPlat) { p.drop = 12; p.y += 2; p.onGround = false; p.vy = 0.5 }
        else { p.vy = CFG.jumpV; p.onGround = false; gs.ev.push({ type: 'jump' }) }
    }
    if (p.drop > 0) p.drop -= 1

    p.vy += CFG.grav
    p.y += p.vy
    p.onGround = false
    if (p.y >= floorY) { p.y = floorY; p.vy = 0; p.onGround = true }
    else if (p.vy > 0 && p.drop === 0) {
        p.px = p.x
        for (const pl of ledges) {
            if (p.px >= pl.x - 3 && p.px <= pl.x + pl.w + 3 && p.y >= pl.y && p.y - p.vy <= pl.y + 1) {
                p.y = pl.y; p.vy = 0; p.onGround = true; break
            }
        }
    }
    if (p.onGround) gs.safe = { x: p.x, y: p.y }

    if (p.cool > 0) p.cool -= 1
    if (pad.b && p.cool === 0) {
        fire(gs)
        p.cool = p.weapon === 'spread' ? CFG.fireCoolSpread
            : p.weapon === 'machine' ? CFG.mgCool
                : p.weapon === 'fire' ? CFG.fireCoolFire
                    : p.weapon === 'laser' ? CFG.fireCoolLaser
                        : CFG.fireCool
    }
    if (p.inv > 0) p.inv -= 1

    // --- camera + stage progression per phase ---
    if (gs.phase === 'jungle') {
        gs.cam = Math.max(0, Math.min(CFG.worldW - W, p.x - 110))
        if (p.x >= CFG.endX) { enterFalls(gs); return }
    } else if (gs.phase === 'falls') {
        // ratchet camera: the torrent rises, and climbing pushes it further;
        // it NEVER comes back down — retreating into the water is how you drown.
        gs.camY -= CFG.rise
        const anchorY = p.y - CFG.anchor
        if (anchorY < gs.camY) gs.camY = anchorY
        if (gs.camY < 0) gs.camY = 0
        if (p.y >= gs.camY + H - CFG.drownAt) {         // the torrent takes you
            gs.ev.push({ type: 'drown' })
            killPlayer(gs)
            return
        }
        if (p.onGround && p.y <= CFG.bossFloor + 2) { makeBoss(gs); return }
    }

    // --- bullets ---
    gs.pb = gs.pb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < gs.camY - 8 || b.y > gs.camY + H + 8) return false
        if (gs.phase === 'boss' && gs.boss && gs.boss.dying === 0) {
            // the gate: armor takes rounds with a spark but never dents; the
            // core is the ONE weak point — and only while its shutter is open.
            const bo = gs.boss
            if (Math.abs(b.x - CFG.coreX) <= CFG.coreHW && Math.abs(b.y - CFG.coreY) <= CFG.coreHH) {
                const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
                if (open) {
                    bo.core -= 1
                    gs.score += 100
                    gs.ev.push({ type: 'coreHit', x: CFG.coreX, y: CFG.coreY })
                    if (bo.core <= 0) { bo.core = 0; bo.dying = 110; gs.score += 5000; gs.ev.push({ type: 'roar' }) }
                } else {
                    gs.ev.push({ type: 'spark', x: b.x, y: b.y })
                }
                return false
            }
            // cannon housings take rounds with a spark (the wall itself is just
            // scenery behind the play plane — arcade planes don't block shots)
            for (const g of bo.guns) {
                if (Math.abs(b.x - g.x) <= 9 && Math.abs(b.y - g.y) <= 8) { gs.ev.push({ type: 'spark', x: b.x, y: b.y }); return false }
            }
        }
        for (const br of gs.barrels) {
            if (!br.gone && Math.hypot(b.x - br.x, b.y - (br.y - 10)) < 12) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true); return false }
        }
        // S3 arms depot: the slab eats rounds (even a laser — walls are walls),
        // but ten hits cave it in and the volley flies. Mutant anchor line.
        const dp = gs.depot
        if (gs.phase === 'jungle' && dp && !dp.dead && Math.abs(b.x - dp.x) <= 18 && Math.abs(b.y - (dp.y - 14)) <= 22) {
            dp.hp -= 1; gs.ev.push({ type: 'spark', x: b.x, y: b.y })
            if (dp.hp <= 0) { dp.hp = 0; dp.dead = true; gs.score += 1000; gs.ev.push({ type: 'boom', x: dp.x, y: dp.y - 16, kind: 'tnt' }); releaseVolley(gs) }
            return false
        }
        for (const s of gs.soldiers) {
            if (!s.dead && s.awake && Math.abs(b.x - s.x) < 8 && Math.abs(b.y - (s.y - 12)) < 13) {
                killSoldier(gs, s)
                if (!b.pierce) return false   // the laser keeps flying through bodies
            }
        }
        for (const t of gs.turrets) {
            if (!t.dead && Math.abs(b.x - t.x) < 10 && Math.abs(b.y - (t.y - 16)) < 14) { hitTurret(gs, t, b.kind === 'fire' ? 2 : 1); if (!b.pierce) return false }
        }
        return true
    })

    // --- soldiers: wake just inside the view (the spawn-shield law spans both
    // axes: x past cam + W - 4 OR y past camY + H - 4 is beyond bullet reach),
    // open fire within a third of a second, runners close in, gunners hold the
    // walkways and shelves and shoot down-diagonals like the original's snipers. ---
    for (const s of gs.soldiers) {
        if (s.dead) continue
        if (!s.awake) {
            if (s.x < gs.cam + W - 4 && s.y < gs.camY + H - 4) { s.awake = true; s.t = 10 + Math.floor(rnd(gs) * 25) }
            continue
        }
        const K = s.kind || 'grunt'
        const dx = p.x - s.x
        const dy = (p.y - 14) - (s.y - 12)
        s.walk += 1
        if (s.flash > 0) s.flash -= 1
        if (!s.hold && Math.abs(dx) > 26) { s.x += Math.sign(dx) * (K === 'gren' ? 0.7 : 1.1); s.walkDir = Math.sign(dx) }
        s.t -= 1
        const range = K === 'sniper' ? CFG.sniperRange : s.hold ? (gs.phase === 'falls' ? 210 : 280) : 220
        const inCamX = gs.cam < s.x && s.x < gs.cam + W + 4
        const inCamY = s.y > gs.camY - 4 && s.y < gs.camY + H + 4
        if (s.t <= 0 && Math.abs(dx) < range && Math.abs(dy) < range * 0.9 && inCamX && inCamY) {
            if (K === 'gren' && Math.abs(dx) > 55) {
                // lob it: an arcing grenade that bursts where it lands
                gs.eb.push({ x: s.x, y: s.y - 18, vx: Math.sign(dx) * Math.min(1.9, 0.5 + Math.abs(dx) * 0.011), vy: -2.4, g: 1, f: 100 })
                gs.ev.push({ type: 'egren' })
                s.flash = 4
                s.t = CFG.grenCool
            } else {
                const a = Math.atan2(dy, dx)
                const sp = K === 'sniper' ? CFG.sniperSpeed : s.hold ? (gs.phase === 'falls' ? 1.8 : CFG.eBulletSpeed) : CFG.eBulletSpeed
                gs.eb.push({ x: s.x + Math.cos(a) * 8, y: s.y - 12 + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp })
                gs.ev.push(K === 'sniper' ? { type: 'efire', sniper: true } : { type: 'efire' })
                s.flash = 4
                s.t = K === 'sniper' ? 110 : (s.hold ? (gs.phase === 'falls' ? 100 : 40) : 45) + Math.floor(rnd(gs) * 60)
            }
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

    // --- S3 the arms depot: an armored slab with an aimed gun and a hatch
    // that spits exactly one live grenade soldier at a time (the door law,
    // reused). Break it and the wall pays its capsule volley. ---
    const dp = gs.depot
    if (gs.phase === 'jungle' && dp && !dp.dead) {
        dp.aim = Math.atan2((p.y - 14) - (dp.y - 14), p.x - dp.x)
        dp.t -= 1
        const onScreen = dp.x > gs.cam && dp.x < gs.cam + W + 8
        if (dp.t <= 0 && onScreen && Math.abs(p.x - dp.x) < 300 && p.x < dp.x) {
            gs.eb.push({ x: dp.x + Math.cos(dp.aim) * 14, y: dp.y - 14 + Math.sin(dp.aim) * 14, vx: Math.cos(dp.aim) * 2.2, vy: Math.sin(dp.aim) * 2.2 })
            gs.ev.push({ type: 'dfire' })
            dp.t = 95
        }
        dp.spawnT -= 1
        const liveGren = gs.soldiers.some((s) => !s.dead && s.kind === 'gren')
        // the hatch only opens with the spill point inside the view — the
        // spawn-shield law spans both axes and applies to door-born soldiers too
        if (dp.spawnT <= 0 && !liveGren && dp.x + 26 < gs.cam + W - 4) {
            gs.soldiers.push({ x: dp.x + 26, y: CFG.ground, hold: false, kind: 'gren', hp: 1, awake: true, t: 60, walk: 0, walkDir: -1, dead: false, flash: 0 })
            gs.ev.push({ type: 'door' })
            dp.spawnT = 320
        }
    }

    // --- barrels sitting on the ground: step into them and they go off ---
    if (gs.phase === 'jungle') {
        for (const br of gs.barrels) {
            if (!br.gone && Math.abs(p.x - br.x) < 10 && p.y > br.y - 24) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true) }
        }
    }

    // --- the flying capsule: Contra's signature weapon courier (jungle runs).
    // S3: it carries a letter — the serial cycles S -> M -> F -> L. ---
    if (gs.phase === 'jungle') {
        if (!gs.capsule && gs.tick >= gs.nextCapsule) {
            gs.capsule = { x: gs.cam + W + 10, y: 140, vx: -1.4, letter: CAP_LETTERS[gs.capN % 4] }
            gs.capN += 1
        }
    }
    if (gs.capsule) {
        gs.capsule.x += gs.capsule.vx
        const c = gs.capsule
        if (p.inv >= 0 && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 600 + Math.floor(rnd(gs) * 300)
            grantWeapon(gs, c.letter || 'S')
        } else if (c.x < gs.cam - 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 300
        }
    }

    // --- S3 volley capsules (the depot's payout): they fly the same honest
    // line, letters already stamped; leave the screen behind you unclaimed
    // and they are gone like the original's. ---
    gs.vc = gs.vc.filter((c) => {
        c.x += c.vx
        if (p.inv >= 0 && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) { grantWeapon(gs, c.letter); return false }
        return c.x > gs.cam - 16
    })

    // --- the boss gate: shutter cycle, cannon fire, door spill, death cascade ---
    if (gs.phase === 'boss' && gs.boss) {
        const bo = gs.boss
        bo.coreT += 1
        if (bo.dying > 0) {
            // the core fell — the gate comes apart in a chain of blasts, then
            // the stage is truly clear.
            bo.dying -= 1
            if (bo.dying % 8 === 0) {
                const a = rnd(gs) * Math.PI * 2
                boom(gs, CFG.wallX + 20 + rnd(gs) * 180, 30 + rnd(gs) * 110, false)
                void a
            }
            if (bo.dying === 0) { gs.end = 'win'; gs.ev.push({ type: 'clear' }) }
            gs.eb.length = 0
        } else {
            const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
            if (open && !bo.wasOpen) gs.ev.push({ type: 'unlock' })
            bo.wasOpen = open
            for (const g of bo.guns) {
                g.t -= 1
                if (g.t <= 0) {
                    const a = Math.atan2((p.y - 14) - g.y, p.x - g.x)
                    gs.eb.push({ x: g.x + Math.cos(a) * 12, y: g.y + Math.sin(a) * 12, vx: Math.cos(a) * 2.0, vy: Math.sin(a) * 2.0 })
                    gs.ev.push({ type: 'cannon' })
                    g.t = 170 + Math.floor(rnd(gs) * 110)
                }
            }
            const live = gs.soldiers.reduce((n, s) => n + (s.dead ? 0 : 1), 0)
            for (const d of bo.doors) {
                d.t -= 1
                if (d.t <= 0 && live < CFG.doorCap) {
                    gs.soldiers.push({ x: d.x, y: d.y, hold: false, hp: 1, awake: true, t: 30, walk: 0, walkDir: d.x > 192 ? -1 : 1, dead: false, flash: 0 })
                    gs.ev.push({ type: 'door' })
                    d.t = 300 + Math.floor(rnd(gs) * 150)
                }
            }
        }
    }

    // --- enemy bullets: one hit kills (inv frames aside) ---
    gs.eb = gs.eb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < gs.camY - 8 || b.y > gs.camY + H + 8) return false
        if (b.g) {
            // arcing grenade: gravity on the lob, bursts on the ground or at
            // the end of its fuse — radius smaller than a TNT barrel.
            b.vy += 0.11
            b.f -= 1
            if ((b.vy > 0 && b.y >= CFG.ground - 2) || b.f <= 0) { boom(gs, b.x, Math.min(b.y, CFG.ground - 6), true, 'tnt', CFG.grenR); return false }
        }
        if (p.inv <= 0 && p.dead === 0 && Math.abs(b.x - p.x) < 7 && Math.abs(b.y - (p.y - 14)) < 13) { killPlayer(gs); return false }
        return true
    })
}

// --- S2 hazards warp helpers (DEV harness/DebugKit): drop straight into a
// vertical phase with fully constructed state (no cheat physics). ---
export function warpFalls (gs) { enterFalls(gs) }
export function warpBoss (gs) { enterFalls(gs); makeBoss(gs) }

// --- attract autopilot: the demo drives the seat, and so does the harness's
// "it can be won" leg. Honest-percept law: reads only what a player on the
// screen can see (own position, visible enemies/bullets/capsules). ---
export function autopilot (gs) {
    const p = gs.p
    const pad = { right: true, a: false, b: true, up: false, down: false, left: false }
    if (p.dead > 0 || gs.end) return pad

    if (gs.phase === 'jungle') {
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
        // S3 volley: the depot's payout is the prize — line up and hop at the
        // nearest; the low ones (144) come to a jump, the high ones ride by.
        if (!pad.a && gs.vc.length) {
            const c = gs.vc.filter((v) => v.x > p.x - 6).sort((a, b) => a.x - b.x)[0]
            if (c && c.x - p.x < 34 && c.y < p.y - 20) pad.a = true
        }
        // grenade dodge: read the arc's landing spot and step off it — a thumb
        // never stands in a burst.
        for (const b of gs.eb) if (b.g && b.vy > 0.2) {
            const tL = (p.y - 4 - b.y) / b.vy
            if (tL > 0 && tL < 90) {
                const landX = b.x + b.vx * tL
                if (Math.abs(landX - p.x) < 26) { pad.right = landX < p.x; pad.left = landX >= p.x; break }
            }
        }
        return pad
    }

    // --- S2 waterfall: climb the zigzag. The shelf above is the whole plan:
    // line up with it, jump the moment the feet touch, keep firing upward at
    // whatever holds the high ground. The torrent is why you never stop. ---
    if (gs.phase === 'falls') {
        // Persistent target: lock onto the shelf above and keep driving at it
        // until the feet LAND somewhere on it (re-picking per-tick by "nearest
        // above" flips the plan mid-jump the moment the feet near the line).
        let t = gs.apT != null && gs.apT >= 0 ? FALLS_LEDGES[gs.apT] : null
        const landedHere = t && p.onGround && Math.abs(p.y - t.y) < 2
        const fellWayBelow = t && p.y > t.y + 60
        if (!t || landedHere || fellWayBelow) {
            const cand = FALLS_LEDGES.filter((l) => l.y < p.y - 4 && l.y >= gs.camY - 20)
            t = cand.length ? cand.reduce((a, b) => (a.y > b.y ? a : b)) : null
            gs.apT = t ? FALLS_LEDGES.indexOf(t) : -1
        }
        pad.right = false; pad.left = false
        if (t) {
            if (p.x < t.x + 4) pad.right = true
            else if (p.x > t.x + t.w - 4) pad.left = true
            pad.up = p.y - t.y > 34 && Math.abs(p.x - (t.x + t.w / 2)) < t.w / 2 + 30 // gun the shelves
            // Jump when lined up under (or level with) the shelf — or at the
            // last moment before running off my own edge toward it: a shelf
            // across a gap is never reachable by walking, only by leaping.
            if (p.onGround) {
                const inBand = p.x >= t.x - 6 && p.x <= t.x + t.w + 6
                const sup = FALLS_LEDGES.find((l) => Math.abs(p.y - l.y) < 2 && p.x >= l.x - 3 && p.x <= l.x + l.w + 3)
                const offEdgeSoon = sup && ((t.x + t.w > sup.x + sup.w + 6 && p.x + CFG.run >= sup.x + sup.w - 1) || (t.x < sup.x - 6 && p.x - CFG.run <= sup.x + 1))
                if (inBand || offEdgeSoon) pad.a = true
            }
        }
        // dodge: shelf gunners drop aimed shots — when one falls onto you,
        // sidestep away from its line (a thumb learns to zigzag, not stand still).
        for (const b of gs.eb) {
            const dx = b.x - p.x
            if (b.vy > 0 && p.y - b.y > 6 && p.y - b.y < 70 && Math.abs(dx) < 16) {
                pad.right = dx < 0; pad.left = dx > 0
                break
            }
        }
        return pad
    }

    // --- boss gate: hug the wall face, put 45-degree fire into the core while
    // the shutter is open, drop runners before they close, and run away from
    // anything aimed at you. ---
    const bo = gs.boss
    pad.right = false; pad.left = false
    if (!bo) return pad
    if (bo.dying > 0) { pad.b = false; return pad }
    const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
    const runner = gs.soldiers.filter((s) => !s.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0]
    // Never stand in an aimed round's road: patrol the firing band (x 136..158,
    // where the 45-degree line reaches the core) in a constant zigzag — the
    // cabinet lesson that an aimed round only hits the thumb that rests.
    if (gs.apDir === undefined) gs.apDir = 1
    if (!runner) {
        // Never turn back INTO a round still in the road: when a shot is
        // inbound from the right, keep running left until it passes behind.
        if (p.x >= 158) gs.apDir = -1
        else if (p.x <= 136) gs.apDir = 1
        pad.right = gs.apDir > 0; pad.left = gs.apDir < 0
        pad.up = open && gs.apDir > 0 // the core lies right: fire lives in the rightward phase
    } else {
        // a charger: face it and keep the trigger down — a runner is one hit,
        // and fleeing only points your gun the wrong way (the arcade read:
        // shoot through the rush, never back-pedal from it)
        const dx = runner.x - p.x
        pad.right = dx > 0; pad.left = dx < 0
    }
    // dodge: an aimed shot closing on the chest — HOP the flat ones (the
    // cabinet answer; run-away never outruns an aimed round) and slip the
    // steep drop-shots sideways.
    for (const b of gs.eb) {
        const dx = b.x - p.x
        const toward = (dx > 0 && b.vx < -0.3) || (dx < 0 && b.vx > 0.3) || (b.vy > 0.5 && Math.abs(dx) < 14)
        if (!toward) continue
        const adx = Math.abs(dx)
        const ady = Math.abs(b.y - (p.y - 14))
        if (ady < 34 && adx < 60) {
            if (Math.abs(b.vy) < 1.2) { if (p.onGround) pad.a = true }
            else { pad.left = dx > 0; pad.right = dx < 0 }
            break
        }
    }
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
    put(gs.tick); put(gs.cam); put(gs.camY); put(gs.score); put(gs.lives); put(gs.seed); put(gs.r)
    put(gs.phase === 'jungle' ? 0 : gs.phase === 'falls' ? 1 : 2)
    put(gs.safe.x); put(gs.safe.y)
    put(gs.p.x); put(gs.p.y); put(gs.p.vy); put(gs.p.onGround ? 1 : 0); put(gs.p.face)
    put(gs.p.ax); put(gs.p.ay); put(gs.p.cool); put(WPN_CODE[gs.p.weapon] || 0)
    put(gs.p.inv); put(gs.p.dead); put(gs.prevA ? 1 : 0)
    for (const b of gs.pb) { put(b.x); put(b.y); put(b.vx); put(b.vy); put(b.pierce ? 1 : 0); put(b.kind === 'fire' ? 1 : 0) }
    for (const b of gs.eb) { put(b.x); put(b.y); put(b.vx); put(b.vy); put(b.g ? b.f : -1) }
    for (const s of gs.soldiers) { put(s.awake ? 1 : 0); put(s.dead ? 1 : 0); put(s.x); put(s.y); put(s.t); put(s.walk); put(KIND_CODE[s.kind || 'grunt']) }
    for (const t of gs.turrets) { put(t.dead ? 1 : 0); put(t.hp); put(t.aim); put(t.t) }
    for (const br of gs.barrels) put(br.gone ? 1 : 0)
    put(gs.capsule ? gs.capsule.x : -9999); put(gs.nextCapsule); put(gs.capN)
    put(gs.depot ? gs.depot.hp : -1); put(gs.depot ? (gs.depot.dead ? 1 : 0) : -1); put(gs.depot ? gs.depot.t : -1); put(gs.depot ? gs.depot.spawnT : -1)
    for (const c of gs.vc) put(c.x)
    if (gs.boss) {
        put(gs.boss.core); put(gs.boss.coreT); put(gs.boss.dying)
        for (const g of gs.boss.guns) put(g.t)
        for (const d of gs.boss.doors) put(d.t)
    } else put(-1)
    put(gs.end ? (gs.end === 'win' ? 2 : 1) : 0)
    return (h >>> 0)
}
