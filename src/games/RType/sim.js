// sim.js — R-TYPE S1 "Armament" — the pure side-scroll engine.
// DOM-free: Node (rtypecheck) and the browser shell share THIS truth.
// Determinism law: every sim random derives from the seed (mulberry32
// riding IN gs); Math.random() may only feed juice in the shell.
//
// The spec (issue #2808, the original: Irem M-72 arcade 1987):
//  - side-scroll, right-only camera; the left edge grinds you flat
//  - one hit kills; three lives; respawn mercy-flicker; death reverts the arm
//  - armament: VULCAN stream + WAVE CANNON (hold-charge, pierce a lane);
//    power capsules cycle VULCAN -> WAVE -> VULCAN (laser/pod join in S2)
//  - Bydo dread: sine larvae divers, armour hull-segments with leading
//    turrets, a missile pod loosing slow turning hunters, and the PHASE-1
//    bio-ship: camera locks, the maw-core only takes damage while it gapes
//  - clear the core: STAGE CLEAR, score carries, the stage loops

export const W = 320
export const H = 224
export const FIELD_TOP = 26
export const FIELD_BOT = 214
export const SCROLL = 0.45
export const STAGE_END = 900 // camX where the Phase-1 hull locks the screen

export const CFG = {
    shipSpeed: 2.1,
    vulcanCd: 6,
    vulcanSpeed: 4.6,
    waveMin: 10,       // ticks of hold before a release looses anything
    waveMax: 70,
    waveSpeed: 2.7,
    waveTiers: [9, 14, 20],   // half-heights at charge <25 / <50 / max
    lives: 3,
    respawnIFrames: 110,
    dying: 70,         // ticks of wreck before respawn / game over
    clearHold: 150,    // STAGE CLEAR banner ticks, then the loop re-runs
    oneUpEvery: 20000,
    crushX: 4,         // this close to the left edge and the world kills you
    missileWarn: 30,   // pre-launch chirp ticks (the shell sounds it)
}

// stage script: camX triggers -> delayed spawns (queue keeps spacing seeded-free:
// the schedule is authored, only enemy jitter draws rng).
export const WAVES = [
    { at: 60,  caps: 0, spawn: [
        { kind: 'larva', d: 0, y: 92 }, { kind: 'larva', d: 26, y: 134 },
        { kind: 'larva', d: 52, y: 60 }, { kind: 'larva', d: 78, y: 176 },
        { kind: 'larva', d: 104, y: 112 } ] },
    { at: 170, caps: 1 },
    { at: 210, spawn: [
        { kind: 'larva', d: 0, y: 70, dive: 1 }, { kind: 'larva', d: 18, y: 150 },
        { kind: 'larva', d: 36, y: 104, dive: 1 }, { kind: 'larva', d: 54, y: 186 },
        { kind: 'larva', d: 72, y: 44 }, { kind: 'larva', d: 90, y: 128, dive: 1 } ] },
    { at: 300, seg: { y0: FIELD_TOP, y1: 96, len: 130, turret: 96 } },
    { at: 380, caps: 1 },
    { at: 430, pod: { y: 64, missiles: 3 } },
    { at: 500, seg: { y0: 118, y1: FIELD_BOT, len: 150, turret: 118 } },
    { at: 560, spawn: [
        { kind: 'larva', d: 0, y: 80, dive: 1 }, { kind: 'larva', d: 20, y: 160 },
        { kind: 'larva', d: 40, y: 52, dive: 1 }, { kind: 'larva', d: 60, y: 196 },
        { kind: 'larva', d: 80, y: 120, dive: 1 }, { kind: 'larva', d: 100, y: 96 } ] },
    { at: 640, pod: { y: 168, missiles: 4 } },
    { at: 700, seg: { y0: FIELD_TOP, y1: 82, len: 170, turret: 82 } },
    { at: 770, spawn: [
        { kind: 'larva', d: 0, y: 140, dive: 1 }, { kind: 'larva', d: 22, y: 74 },
        { kind: 'larva', d: 44, y: 180, dive: 1 }, { kind: 'larva', d: 66, y: 108 } ] },
]

// mulberry32 as a state-carried step (snapshot/restore stays byte-exact).
export function rng(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function makeShip() {
    return {
        x: 60, y: 120, dead: false,
        inv: CFG.respawnIFrames,
        weapon: 'vulcan',   // vulcan | wave
        charge: 0,
        cd: 0,
        anim: 0,
    }
}

export function makeGame(seed = 1) {
    return {
        seed: seed >>> 0, rngState: seed >>> 0, nextId: 1,
        tick: 0, mode: 'play',       // play | clear | gameover
        score: 0, hi: 0, cleared: false,
        camX: 0, camLock: false,
        ship: makeShip(),
        lives: CFG.lives, dyingT: 0,
        weaponName: 'vulcan',           // mirror of ship.weapon for HUD/state
        shots: [],                   // player: {id,x,y,kind,size,hit[]}
        bullets: [],               // enemy: {id,x,y,vx,vy}
        missiles: [],              // {id,x,y,a,spd,t}
        enemies: [],               // larva | turret | pod | hullseg
        caps: [],                  // {id,x,y,baseY,bob}
        pending: [],               // {t,run} — run is authored, not serialized: keep ids
        schedule: WAVES.map((w, i) => ({ ...w, idx: i, fired: false })),
        waveIdx: 0,
        banner: 0,
        p1: null,                  // Phase-1 hull
        next1up: CFG.oneUpEvery,
        events: [],
    }
}

// ---- spawning ------------------------------------------------------------

function spawnLarva(gs, y, dive) {
    gs.enemies.push({
        id: gs.nextId++, kind: 'larva',
        x: gs.camX + W + 18, y,
        baseY: y, sine: rng(gs) * Math.PI * 2,
        dive: !!dive, state: dive ? 'enter' : 'sine', stateT: dive ? 70 + Math.floor(rng(gs) * 40) : 0,
        vx: -1.15, vy: 0, hp: 1, anim: Math.floor(rng(gs) * 4), inv: 0,
    })
}

function spawnCaps(gs) {
    const y = 60 + Math.floor(rng(gs) * 120)
    gs.caps.push({ id: gs.nextId++, x: gs.camX + W + 14, y, baseY: y, bob: rng(gs) * 6 })
}

function spawnSeg(gs, cfg) {
    const id = gs.nextId++
    gs.enemies.push({
        id, kind: 'hullseg', x: gs.camX + W + 20, y0: cfg.y0, y1: cfg.y1, len: cfg.len,
        vx: 0, hp: Infinity, inv: Infinity,
    })
    const topSeg = cfg.y1 < (FIELD_TOP + FIELD_BOT) / 2   // slab hangs from the top?
    gs.enemies.push({
        id: gs.nextId++, kind: 'turret', on: id,
        x: gs.camX + W + 20 + 30 + Math.floor(rng(gs) * (cfg.len - 60)),
        y: topSeg ? cfg.y1 + 9 : cfg.y0 - 9,               // gun protrudes toward the open lane
        face: -1, hp: 3, cd: 60 + Math.floor(rng(gs) * 60), anim: 0, inv: 0,
        edgeUp: topSeg,
    })
}

function spawnPod(gs, y, missiles) {
    gs.enemies.push({
        id: gs.nextId++, kind: 'pod', x: gs.camX + W + 16, y,
        baseY: y, bob: rng(gs) * 4, hp: 6, cd: 90, shots: missiles,
        state: 'enter', vx: -0.9, inv: 0, anim: 0, anchorX: gs.camX + 252,
    })
}

function startPhase1(gs) {
    gs.camLock = true
    // the dreadnought's arrival clears the field: stray hull-plates and their
    // guns fall away (leaving them would freeze the station on a slab the lock ends)
    gs.enemies = gs.enemies.filter((e) => e.kind !== 'hullseg' && typeof e.on !== 'number')
    gs.bullets.length = 0
    gs.missiles.length = 0
    const hx = gs.camX + 170   // hull face anchors mid-right of screen
    gs.p1 = {
        x: gs.camX + W + 150, targetX: hx, vx: -0.9,
        coreHp: 12, coreMax: 12,
        mouth: 'closed', mouthT: 140,          // first gape after 140 ticks
        dyingT: 0,
    }
    // onboard guns ride the hull (on: 'p1')
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p1', ox: 50, oy: 52,
        x: gs.p1.x + 50, y: 52, face: -1, hp: 3, cd: 80, anim: 0, inv: 0, edgeUp: true })
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p1', ox: 95, oy: 196,
        x: gs.p1.x + 95, y: 196, face: -1, hp: 3, cd: 130, anim: 0, inv: 0, edgeUp: false })
    gs.enemies.push({ id: gs.nextId++, kind: 'pod', on: 'p1', ox: 44, oy: 172,
        x: gs.p1.x + 44, y: 172, baseY: 172, bob: 2, hp: 6, cd: 200, shots: 5,
        state: 'hold', vx: 0, inv: 0, anim: 0 })
}

// ---- death / clear ---------------------------------------------------------

function killShip(gs, why) {
    if (gs.ship.dead || gs.ship.inv > 0 || gs.mode !== 'play') return false
    gs.ship.dead = true
    gs.dyingT = CFG.dying
    gs.events.push('die')
    gs.lastDeath = why
    gs.lives -= 1
    return true
}

function respawn(gs) {
    gs.ship = makeShip()
    gs.ship.x = gs.camX + 34
    gs.ship.y = 120
}

function addScore(gs, n) {
    gs.score += n
    if (gs.score >= gs.next1up) { gs.lives += 1; gs.next1up += CFG.oneUpEvery; gs.events.push('1up') }
    if (gs.score > gs.hi) gs.hi = gs.score
}

function stageClear(gs) {
    gs.mode = 'clear'
    gs.cleared = true
    gs.banner = CFG.clearHold
    addScore(gs, 5000)
    gs.events.push('clear')
}

function loopStage(gs) {
    gs.mode = 'play'
    gs.camX = 0
    gs.camLock = false
    gs.enemies.length = 0
    gs.bullets.length = 0
    gs.missiles.length = 0
    gs.shots.length = 0
    gs.caps.length = 0
    gs.pending.length = 0
    gs.p1 = null
    gs.schedule.forEach((s) => { s.fired = false })
    gs.waveIdx = 0
    gs.banner = 0
    respawn(gs)
    gs.ship.inv = CFG.respawnIFrames
    // the loop re-runs Walnuts-style: score and lives carry, the arm stays
}

// ---- the step --------------------------------------------------------------

export function step(gs, pad) {
    gs.events.length = 0
    if (gs.mode === 'gameover') return
    gs.tick += 1

    if (gs.mode === 'clear') {
        gs.banner -= 1
        if (gs.banner <= 0) loopStage(gs)
        return
    }

    // --- dying pause: the wreck hangs, then mercy or curtain
    if (gs.ship.dead) {
        gs.dyingT -= 1
        runWorld(gs, pad, true)
        if (gs.dyingT <= 0) {
            if (gs.lives > 0) respawn(gs)
            else gs.mode = 'gameover'
        }
        return
    }

    runWorld(gs, pad, false)
}

function runWorld(gs, pad, frozen) {
    const s = gs.ship

    // --- camera: right only, ever
    if (!gs.camLock) {
        gs.camX += SCROLL
        if (gs.camX >= STAGE_END) { gs.camX = STAGE_END; startPhase1(gs) }
    }
    if (s.x < gs.camX + 2) s.x = gs.camX + 2
    if (s.x > gs.camX + W - 10) s.x = gs.camX + W - 10
    if (!frozen && s.x - CFG.crushX <= gs.camX && killShip(gs, 'crush')) return

    // --- ship
    if (!frozen) {
        if (pad.left) s.x -= CFG.shipSpeed
        if (pad.right) s.x += CFG.shipSpeed
        if (pad.up) s.y -= CFG.shipSpeed
        if (pad.down) s.y += CFG.shipSpeed
        s.y = clamp(s.y, FIELD_TOP + 6, FIELD_BOT - 4)
        if (s.inv > 0) s.inv -= 1
        s.anim += 1
        gs.weaponName = s.weapon

        // fire / charge
        if (s.cd > 0) s.cd -= 1
        if (s.weapon === 'vulcan') {
            if (pad.a && s.cd <= 0) {
                gs.shots.push({ id: gs.nextId++, x: s.x + 12, y: s.y - 1, kind: 'v', size: 0, pierce: false, hit: [] })
                s.cd = CFG.vulcanCd
                gs.events.push('shot')
            }
        } else {
            if (pad.a) { if (s.charge < CFG.waveMax) s.charge += 1 }
            else if (s.charge > 0) {
                if (s.charge >= CFG.waveMin) {
                    const tier = s.charge >= 50 ? 2 : s.charge >= 25 ? 1 : 0
                    gs.shots.push({ id: gs.nextId++, x: s.x + 10, y: s.y, kind: 'w', size: tier, pierce: true, hit: [] })
                    gs.events.push('wave')
                }
                s.charge = 0
            }
        }
    }

    // --- stage schedule
    if (!gs.camLock) {
        for (const wv of gs.schedule) {
            if (wv.fired || gs.camX < wv.at) continue
            wv.fired = true
            gs.waveIdx = wv.idx + 1
            if (wv.caps) spawnCaps(gs)
            if (wv.seg) spawnSeg(gs, wv.seg)
            if (wv.pod) spawnPod(gs, wv.pod.y, wv.pod.missiles)
            if (wv.spawn) {
                for (const it of wv.spawn) gs.pending.push({ t: gs.tick + it.d, kind: it.kind, y: it.y, dive: it.dive })
            }
        }
    }
    for (let i = gs.pending.length - 1; i >= 0; i--) {
        const p = gs.pending[i]
        if (gs.tick >= p.t) { spawnLarva(gs, p.y, p.dive); gs.pending.splice(i, 1) }
    }

    // --- capsules
    for (let i = gs.caps.length - 1; i >= 0; i--) {
        const c = gs.caps[i]
        c.x -= 0.85; c.bob += 0.06; c.y = c.baseY + Math.sin(c.bob) * 16
        if (c.x < gs.camX - 20) { gs.caps.splice(i, 1); continue }
        if (!frozen && Math.abs(c.x - s.x) < 12 && Math.abs(c.y - s.y) < 12) {
            gs.caps.splice(i, 1)
            s.weapon = s.weapon === 'vulcan' ? 'wave' : 'vulcan'
            s.charge = 0
            gs.weaponName = s.weapon
            addScore(gs, 500)
            gs.events.push('capsule')
        }
    }

    // --- Phase-1 hull
    const p1 = gs.p1
    if (p1 && p1.dyingT === 0) {
        if (p1.x > p1.targetX) p1.x += p1.vx
        // maw cycle: closed -> opening -> open -> closing
        p1.mouthT -= 1
        if (p1.mouthT <= 0) {
            if (p1.mouth === 'closed') { p1.mouth = 'opening'; p1.mouthT = 30 }
            else if (p1.mouth === 'opening') { p1.mouth = 'open'; p1.mouthT = 110 }
            else if (p1.mouth === 'open') { p1.mouth = 'closing'; p1.mouthT = 30 }
            else { p1.mouth = 'closed'; p1.mouthT = 170 + Math.floor(rng(gs) * 60) }
        }
    } else if (p1 && p1.dyingT > 0) {
        p1.dyingT -= 1
        if (gs.tick % 5 === 0) gs.events.push('boom')
        if (p1.dyingT <= 0) { gs.p1 = null; stageClear(gs) }
    }

    // --- enemies
    for (let i = gs.enemies.length - 1; i >= 0; i--) {
        const e = gs.enemies[i]
        e.anim += 1
        if (e.inv > 0) e.inv -= 1
        if (e.on === 'p1') {
            if (p1 && p1.dyingT === 0) { e.x = p1.x + e.ox; e.y = e.oy + (e.kind === 'pod' ? Math.sin(gs.tick * 0.05) * 3 : 0) }
            else if (p1) { gs.enemies.splice(i, 1); continue }
        }
        if (e.kind === 'larva') {
            if (e.state === 'dive') { e.x += e.vx; e.y += e.vy }
            else if (e.state === 'windup') {
                e.stateT -= 1
                e.x -= 0.35
                if (e.stateT <= 0) {
                    const dx = s.x - e.x, dy = s.y - e.y
                    const m = Math.max(1e-6, Math.hypot(dx, dy))
                    e.vx = (dx / m) * 1.9; e.vy = (dy / m) * 1.9
                    e.state = 'dive'; gs.events.push('warn')
                }
            } else {
                e.x += e.vx
                e.sine += 0.08
                e.y = e.baseY + Math.sin(e.sine) * 22
                if (e.dive && e.x < gs.camX + W - 60 && !frozen) { e.state = 'windup'; e.stateT = 42 }
            }
            if (e.x < gs.camX - 24) { gs.enemies.splice(i, 1); continue }
        } else if (e.kind === 'turret') {
            e.aim = Math.atan2(gs.ship.y - e.y, gs.ship.x - e.x)
            e.cd -= 1
            if (e.cd <= 0 && !frozen && e.x > gs.camX && e.x < gs.camX + W + 10) {
                const dx = s.x - e.x, dy = s.y - e.y
                const m = Math.max(1e-6, Math.hypot(dx, dy))
                gs.bullets.push({ id: gs.nextId++, x: e.x, y: e.y + (e.edgeUp ? -6 : 6), vx: (dx / m) * 1.3, vy: (dy / m) * 1.3 })
                e.cd = 95 + Math.floor(rng(gs) * 55)
                e.anim = 0
                gs.events.push('tsfire')
            }
        } else if (e.kind === 'pod') {
            if (e.state === 'enter') {
                e.x += e.vx
                if (e.x <= e.anchorX) { e.state = 'hold'; e.baseY = e.y }
            } else if (e.state === 'hold') {
                e.y = e.baseY + Math.sin((e.bob += 0.05)) * 10
                e.cd -= 1
                if (e.cd <= 0 && e.shots > 0 && !frozen && e.x > gs.camX + 10 && e.x < gs.camX + W + 10) {
                    gs.missiles.push({ id: gs.nextId++, x: e.x - 6, y: e.y, a: Math.PI, spd: 0.75, t: 300 })
                    e.shots -= 1; e.cd = 170; gs.events.push('missile')
                    if (e.shots <= 0) { e.state = 'flee'; e.vx = -1.4 }
                }
            } else { e.x += e.vx }
            if (e.x < gs.camX - 22) { gs.enemies.splice(i, 1); continue }
        }
        // hullseg: anchored to world; scrolls out of life behind the camera
        if (e.kind === 'hullseg' && e.x + e.len < gs.camX - 8) { gs.enemies.splice(i, 1); continue }
    }

    // --- player shots
    for (let i = gs.shots.length - 1; i >= 0; i--) {
        const q = gs.shots[i]
        q.x += q.kind === 'v' ? CFG.vulcanSpeed : CFG.waveSpeed
        if (q.x > gs.camX + W + 20) { gs.shots.splice(i, 1); continue }
        let dead = false

        // vs missiles (any shot can down a hunter)
        for (let m = gs.missiles.length - 1; m >= 0; m--) {
            const ms = gs.missiles[m]
            if (Math.abs(ms.x - q.x) < 8 && Math.abs(ms.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] : 6)) {
                gs.missiles.splice(m, 1); addScore(gs, 50); gs.events.push('boom')
                if (!q.pierce) dead = true
                break
            }
        }

        // vs enemies / hull armour
        if (!dead) {
            for (let m = gs.enemies.length - 1; m >= 0; m--) {
                const e = gs.enemies[m]
                if (q.hit.includes(e.id)) continue
                let struck = false
                if (e.kind === 'hullseg') struck = q.x + 2 > e.x && q.x < e.x + e.len && q.y > e.y0 && q.y < e.y1
                else if (e.kind === 'larva') struck = Math.abs(e.x - q.x) < 9 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 : 6)
                else if (e.kind === 'turret') struck = Math.abs(e.x - q.x) < 9 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 : 7)
                else if (e.kind === 'pod') struck = Math.abs(e.x - q.x) < 11 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 : 8)
                if (!struck) continue
                if (e.kind === 'hullseg') { gs.events.push('clank'); dead = true; break } // armour eats it
                gs.lastHitX = e.x; gs.lastHitY = e.y
                e.hp -= q.kind === 'w' ? 2 : 1
                q.hit.push(e.id)
                gs.events.push('hit')
                if (e.hp <= 0) {
                    gs.enemies.splice(m, 1)
                    addScore(gs, e.kind === 'larva' ? 100 : e.kind === 'turret' ? 200 : 300)
                    gs.events.push('boom')
                }
                if (!q.pierce) { dead = true }
                break
            }
        }

        // vs Phase-1: armour unless the maw gapes
        if (!dead && p1 && p1.dyingT === 0 && q.x >= p1.x) {
            const coreY = 120
            if (p1.mouth === 'open' && Math.abs(q.y - coreY) < 16) {
                p1.coreHp -= q.kind === 'w' ? 2 : 1
                gs.events.push('corehit')
                if (p1.coreHp <= 0) {
                    p1.dyingT = 170
                    addScore(gs, 2000)
                    gs.events.push('bigboom')
                    gs.enemies = gs.enemies.filter((e) => !(e.on === 'p1'))
                    gs.bullets.length = 0
                    gs.missiles.length = 0
                }
                dead = true // the blast stops at the armor — even the wave spends itself in the maw
            } else {
                gs.events.push('clank')
                dead = true
            }
        }
        if (dead) gs.shots.splice(i, 1)
    }

    // --- enemy bullets
    for (let i = gs.bullets.length - 1; i >= 0; i--) {
        const b = gs.bullets[i]
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.camX - 8 || b.x > gs.camX + W + 8 || b.y < FIELD_TOP - 4 || b.y > FIELD_BOT + 4) { gs.bullets.splice(i, 1); continue }
        if (!frozen && s.inv <= 0 && Math.abs(b.x - s.x) < 5 && Math.abs(b.y - s.y) < 4) { gs.bullets.splice(i, 1); killShip(gs, 'bullet'); return }
    }

    // --- homing missiles: strong hunt at launch, then they straighten and
    // fly PAST — a hunter that looped forever could never be left behind
    for (let i = gs.missiles.length - 1; i >= 0; i--) {
        const m = gs.missiles[i]
        m.t -= 1
        if (!frozen && m.t > 240) {
            const want = Math.atan2(s.y - m.y, s.x - m.x)
            let da = want - m.a
            while (da > Math.PI) da -= Math.PI * 2
            while (da < -Math.PI) da += Math.PI * 2
            m.a += clamp(da, -0.035, 0.035)
            if (m.spd < 1.35) m.spd += 0.0032
        }
        m.x += Math.cos(m.a) * m.spd
        m.y += Math.sin(m.a) * m.spd
        if (m.t <= 0 || m.x < gs.camX - 14 || m.x > gs.camX + W + 14 || m.y < FIELD_TOP - 6 || m.y > FIELD_BOT + 6) { gs.missiles.splice(i, 1); continue }
        if (!frozen && s.inv <= 0 && Math.abs(m.x - s.x) < 7 && Math.abs(m.y - s.y) < 6) { gs.missiles.splice(i, 1); killShip(gs, 'missile'); return }
    }

    // --- bodies vs the ship (tiny core hitbox, honest dread)
    if (!frozen && s.inv <= 0) {
        for (const e of gs.enemies) {
            let hit = false
            if (e.kind === 'larva') hit = Math.abs(e.x - s.x) < 9 && Math.abs(e.y - s.y) < 7
            else if (e.kind === 'turret') hit = Math.abs(e.x - s.x) < 9 && Math.abs(e.y - s.y) < 8
            else if (e.kind === 'pod') hit = Math.abs(e.x - s.x) < 11 && Math.abs(e.y - s.y) < 9
            else if (e.kind === 'hullseg') hit = s.x + 5 > e.x && s.x - 5 < e.x + e.len && s.y + 4 > e.y0 && s.y - 4 < e.y1
            if (hit) { if (killShip(gs, 'body:' + e.kind)) return }
        }
        if (p1 && p1.dyingT === 0 && p1.x < gs.camX + W - 4 && s.x + 5 > p1.x + 4) {
            // the bio-ship's flank is a death wall, top to bottom
            if (killShip(gs, 'hull')) return
        }
    }
}

// ---- autopilot: the attract pilot; harness proves against the same code ----
// Lane potential field: score the lanes three lanes wide against EVERY threat
// (leading bullets, locked divers, curving hunters, parked bodies, slabs) and
// steer to the safest — never into the lane the last dodge forgot.

export function autopilot(gs) {
    const pad = { left: false, right: false, up: false, down: false, a: false }
    const s = gs.ship
    if (gs.mode !== 'play' || s.dead) return pad
    const px = s.x, py = s.y
    const p1 = gs.p1

    const lanes = []
    for (const off of [-30, 0, 30]) {
        const y = py + off
        if (y < FIELD_TOP + 8 || y > FIELD_BOT - 6) continue
        let risk = 999
        const consider = (t) => { if (t > 0 && t < risk) risk = t }
        for (const b of gs.bullets) {
            if (b.x - px < -4 || b.vx >= 0) continue
            const t = (px - b.x) / (-b.vx + 0.45)
            if (t < 40 && Math.abs(b.y + b.vy * t - y) < 10) consider(t)
        }
        for (const e of gs.enemies) {
            if (e.kind === 'larva') {
                if (e.state === 'dive' && e.vx < 0 && e.x > px - 6) {
                    const t = (px - e.x) / (-e.vx + 0.45) // closure rides the camera push too
                    if (t < 48 && Math.abs(e.y + e.vy * t - y) < 12) consider(t)
                } else if (e.x > px) {
                    const t = (e.x - px) / 1.6 // closure = its drift + the camera push; the swing keeps swinging
                    if (t < 50 && Math.abs(e.baseY + Math.sin(e.sine + t * 0.08) * 22 - y) < 10) consider(t)
                }
            }
            if (e.kind === 'hullseg' && px + 6 > e.x - 16 && px < e.x + e.len && y > e.y0 - 12 && y < e.y1 + 12) consider(0.5)
            if ((e.kind === 'turret' || e.kind === 'pod') && Math.abs(e.x - px) < 34 && Math.abs(e.y - y) < 24) consider(0.5)
        }
        for (const m of gs.missiles) {
            const dx = m.x - px
            if (dx < -6) { consider(Math.max(1, -dx / (m.spd + 0.6))); continue }
            if (dx > 160) continue
            const t = dx / m.spd
            if (t < 42 && Math.abs(m.y - y) < 12 + t * 0.06) consider(t * 0.7)
        }
        lanes.push({ y, risk })
    }
    const safe = lanes.filter((l) => l.risk >= 20)
    // an approaching slab owns the station soon: commit to its open side early
    const slab = gs.enemies.find((e) => e.kind === 'hullseg' && px < e.x + e.len + 6 && e.x - px < 56)
    let lane
    if (!safe.length) {
        lane = lanes.reduce((a, b) => (b.risk > a.risk ? b : a), lanes[0] || { y: 118, risk: 0 })
        if (slab) lane = { y: (slab.y0 + slab.y1) / 2 >= 120 ? FIELD_TOP + 10 : FIELD_BOT - 10, risk: lane.risk }
    } else {
        // the great ship: ride the maw lane — hunters curve to you there.
        // in the field: hold a live launcher's lane and cut its birds at the
        // source; chasing individual hunters leaves the gun to stream forever
        let targetY = 118
        let incMis = null
        for (const m of gs.missiles) if (m.x - px > 4 && m.x - px < 170 && (!incMis || m.x < incMis.x)) incMis = m
        let launcher = null
        for (const e of gs.enemies) if (e.kind === 'pod' && e.state !== 'flee' && e.x > px - 6 && (!launcher || e.x < launcher.x)) launcher = e
        if (p1 && p1.dyingT === 0) targetY = 120
        else if (launcher) targetY = launcher.y
        else if (incMis) targetY = incMis.y
        else {
            let bestD = 1e9
            for (const e of gs.enemies) {
                if (e.kind === 'hullseg' || e.x <= px + 8) continue
                const d = e.x - px + Math.abs(e.y - py) * 2
                if (d < bestD) { bestD = d; targetY = e.y }
            }
        }
        const pick = [...safe].sort((a, b) => Math.abs(a.y - targetY) - Math.abs(b.y - targetY) || b.risk - a.risk)
        lane = pick[0]
    }

    const dy = lane.y - py
    pad.up = dy < -1.5
    pad.down = dy > 1.5

    // before the great ship: never stand still in the firing solution —
    // strafe the maw lane while vulcan works; dive only when a lane must go
    if (p1 && p1.dyingT === 0 && lane.risk > 20) {
        let dir = gs.tick % 84 < 42 ? -1 : 1
        if (py < FIELD_TOP + 14) dir = 1
        if (py > FIELD_BOT - 12) dir = -1
        pad.up = dir < 0
        pad.down = dir > 0
    }

    // station: hold mid-lead, never drift into the grinder, never board the hull
    const want = gs.camX + (p1 && p1.dyingT === 0 ? 52 : 62)
    pad.right = px - want < -5
    pad.left = px - want > 5
    if (px - gs.camX < 26) { pad.right = true; pad.left = false }
    if (p1 && p1.dyingT === 0 && p1.x - px < 80) pad.right = false

    // trigger discipline: vulcan streams; wave charges when the lane breathes
    if (s.weapon === 'wave') pad.a = lane.risk > 18
    else pad.a = true
    return pad
}

// ---- hash -------------------------------------------------------------------

export function stateHash(gs) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(gs.tick); mix(gs.score)
    mix(gs.mode === 'play' ? 1 : gs.mode === 'clear' ? 2 : 3)
    mix(gs.camX); mix(gs.waveIdx)
    const s = gs.ship
    mix(s.x); mix(s.y); mix(gs.lives)
    mix(s.weapon === 'wave' ? 1 : 0); mix(s.charge); mix(s.inv); mix(s.dead ? 1 : 0)
    mix(gs.shots.length)
    for (const q of gs.shots) { mix(q.x); mix(q.y); mix(q.kind === 'w' ? q.size + 1 : 0) }
    mix(gs.bullets.length)
    for (const b of gs.bullets) { mix(b.x); mix(b.y) }
    mix(gs.missiles.length)
    for (const m of gs.missiles) { mix(m.x); mix(m.y); mix(m.a) }
    mix(gs.enemies.length)
    for (const e of gs.enemies) { mix(e.id); mix(e.x); mix(e.y); mix(e.hp === Infinity ? -1 : e.hp); mix(e.state ? e.state.length : 0) }
    mix(gs.caps.length)
    for (const c of gs.caps) { mix(c.x); mix(c.y) }
    mix(gs.p1 ? 1 : 0)
    if (gs.p1) { mix(gs.p1.x); mix(gs.p1.coreHp); mix(gs.p1.mouth.length) }
    return h >>> 0
}
