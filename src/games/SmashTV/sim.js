// SMASH TV — pure simulation. step(state, input) -> state, zero Math.random():
// crate picks, thrower wander and add spawns come from a seeded LCG, so
// scripts/smashcheck.mjs audits the rules and replays the pilot hash-for-hash.
//
// Load-bearing rules (the harness pins these):
//   - ONE HIT KILLS: any enemy bullet, grenade blast or contact ends a life;
//     spawn invulnerability is the only mercy. Zero lives -> game over.
//   - exits stay SEALED until every enemy in the room is dead (and the wave
//     has fully spawned); then they open and walking into one advances the room.
//   - crates shatter under fire and reveal their weapon; touching it swaps the
//     gun. LASER burns energy per shot; B drops a FIREBOMB (kills every live
//     enemy, pays their points) for 34 energy. Energy refills on room clear.
//   - bonus rooms: timer, fleeing civilians, 100 + 50*combo per hit, exits
//     open when the timer expires; the run advances like any other room.
//   - killing THE ANNOUNCER (room 9) wins the game.
//   - score ledger: final score == sum of every scored event.

import {
    GW, GH, CELL, HUD_H, CW, CH, EXITS, ENEMIES, WEAPONS,
    TOTAL_ROOMS, genRoom, isBonus, isBoss, START, lcg,
} from './levels.js'
import { TELEGRAPH } from './enemies.js'

export { GW, GH, CELL, HUD_H, CW, CH, EXITS, ENEMIES, WEAPONS, TOTAL_ROOMS, isBonus, isBoss }

export const CFG = {
    playerSpeed: 1.2,
    playerR: 5,
    lives: 3,
    extraLife: 20000,
    roomBonus: 1000,
    invulnRespawn: 150,
    invulnRoom: 70,
    deadFreeze: 70,
    firebombCost: 34,
    maxEnergy: 100,
    grenadeSpeed: 1.3,
    grenadeTicks: 80,
    grenadeR: 16,
    bulletR: 2,
    contactR: 9,
}

const cx = (c) => c * CELL + CELL / 2
const cy = (r) => HUD_H + r * CELL + CELL / 2
export const cellOf = (x, y) => [Math.floor(x / CELL), Math.floor((y - HUD_H) / CELL)]

function wallSet(room) {
    const s = new Set(['border'])
    for (const [c, r] of room.walls) s.add(`${c},${r}`)
    return s
}

function blockedPx(gs, x, y, r) {
    const x0 = x - r, x1 = x + r, y0 = y - r, y1 = y + r
    if (x0 < CFG.playerR || x1 > CW - CFG.playerR || y0 < HUD_H + CFG.playerR || y1 > CH - CFG.playerR) return true
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const [c, rr] = cellOf(px, py)
        if (c < 0 || rr < 0 || c >= GW || rr >= GH) return true
        if (gs.walls.has(`${c},${rr}`)) return true
    }
    return false
}
export { blockedPx }

const q8 = (dx, dy) => {
    if (!dx && !dy) return [0, 0]
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return [Math.round(Math.cos(a)), Math.round(Math.sin(a))]
}
export { q8 }

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

function los(gs, x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1)
    const steps = Math.ceil(d / 5)
    for (let i = 1; i < steps; i++) {
        const t = i / steps
        const [c, r] = cellOf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
        if (gs.walls.has(`${c},${r}`)) return false
    }
    return true
}
export { los }

// ---------------------------------------------------------------- setup ----
export function makeGame(seed = 0, opts = {}) {
    const gs = {
        seed, rng: { v: (seed * 97 + 13) | 0 }, slack: !!opts.slack,
        tick: 0, room: 0, lives: CFG.lives, score: 0, end: null,
        events: [], _nextId: 1, upTo: CFG.extraLife,
        player: null, enemies: [], bullets: [], ebullets: [], crates: [],
        items: [], civilians: [], grenades: [],
        energy: CFG.maxEnergy, weapon: 'twin',
        cleared: false, spawnT: 0, bonusT: 0, combo: 0, roomsCleared: 0,
        bossDead: false, walls: null, roomData: null,
    }
    loadRoom(gs, 0)
    return gs
}

function loadRoom(gs, idx) {
    gs.room = idx
    const room = genRoom(gs.seed, idx)
    gs.roomData = room
    gs.walls = wallSet(room)
    gs.enemies = []
    gs.bullets = []
    gs.ebullets = []
    gs.grenades = []
    gs.items = []
    gs.civilians = []
    gs.cleared = false
    gs.spawnT = room.spawnAt
    gs.bonusT = room.bonus ? room.bonusTime : 0
    gs.combo = 0
    gs.energy = CFG.maxEnergy
    if (room.boss) gs.bossDead = false
    gs.crates = room.crates.map((k) => ({ id: gs._nextId++, x: cx(k.c), y: cy(k.r), hp: 2, weapon: k.weapon, shake: 0 }))
    const energyCells = gs.slack ? 0 : room.energyCells
    if (gs.slack && gs.crates.length) gs.crates.shift()
    if (energyCells) gs.items.push({ id: gs._nextId++, t: 'energy', x: cx(3), y: cy(2) })
    gs.player = {
        x: cx(START.c), y: cy(START.r), aim: [0, -1], fireT: 0, deadT: 0,
        invuln: gs.tick === 0 ? CFG.invulnRoom : CFG.invulnRespawn, walk: 0,
    }
    if (room.bonus) {
        for (let i = 0; i < room.civilians; i++) {
            const c = 2 + Math.floor(lcg(gs.rng) * (GW - 4))
            const r = 2 + Math.floor(lcg(gs.rng) * (GH - 4))
            gs.civilians.push({ id: gs._nextId++, x: cx(c), y: cy(r), dx: 0, dy: 0, panic: 0, walk: i })
        }
    }
    gs.events.push({ type: 'room', room: idx, bonus: room.bonus, boss: room.boss })
}

function addScore(gs, pts, meta) {
    gs.score += pts
    if (gs.score >= gs.upTo) { gs.lives++; gs.upTo += CFG.extraLife; gs.events.push({ type: '1up' }) }
    if (meta) gs.events.push({ type: 'score', pts, ...meta })
    else gs.events.push({ type: 'score', pts })
}

// ---------------------------------------------------------------- death ----
function killPlayer(gs, how) {
    const p = gs.player
    if (p.deadT > 0 || gs.end || p.invuln > 0) return
    p.deadT = CFG.deadFreeze
    gs.lives--
    gs.events.push({ type: 'death', how, lives: gs.lives })
}

// ---------------------------------------------------------------- firing ----
const LATERAL = 3

function firePlayer(gs) {
    const p = gs.player
    const w = WEAPONS[gs.weapon]
    const [fx, fy] = p.aim
    if (w.energy > 0 && gs.energy < w.energy) return
    gs.energy -= w.energy
    p.fireT = w.interval
    // perpendicular offset for twin barrels
    const ox = -fy * LATERAL, oy = fx * LATERAL
    if (gs.weapon === 'spread') {
        const a = Math.atan2(fy, fx)
        for (const d of [-0.38, 0, 0.38]) {
            gs.bullets.push({ id: gs._nextId++, x: p.x, y: p.y, dx: Math.cos(a + d) * w.speed, dy: Math.sin(a + d) * w.speed, pierce: w.pierce, dmg: w.dmg, kind: gs.weapon })
        }
    } else {
        gs.bullets.push({ id: gs._nextId++, x: p.x + ox, y: p.y + oy, dx: fx * w.speed, dy: fy * w.speed, pierce: w.pierce, dmg: w.dmg, kind: gs.weapon })
        gs.bullets.push({ id: gs._nextId++, x: p.x - ox, y: p.y - oy, dx: fx * w.speed, dy: fy * w.speed, pierce: w.pierce, dmg: w.dmg, kind: gs.weapon })
    }
    gs.events.push({ type: 'shoot', weapon: gs.weapon })
}

function firebomb(gs) {
    if (gs.energy < CFG.firebombCost) { gs.events.push({ type: 'bombFail' }); return }
    gs.energy -= CFG.firebombCost
    let killed = 0
    for (const e of gs.enemies) {
        if (e.kind === 'boss') continue
        addScore(gs, ENEMIES[e.kind].pts, { kind: e.kind })
        gs.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: e.y, bomb: true })
        killed++
    }
    gs.enemies = gs.enemies.filter((e) => e.kind === 'boss')
    gs.ebullets = []
    gs.grenades = []
    gs.events.push({ type: 'bomb', killed })
}

// ---------------------------------------------------------------- enemies ----
function spawnQueued(gs) {
    const room = gs.roomData
    if (gs.spawnT > 0) { gs.spawnT--; return }
    if (!room.spawns.length) return
    const s = room.spawns.shift()
    const e = makeEnemy(gs, s.kind, cx(s.c), cy(s.r))
    gs.enemies.push(e)
    gs.events.push({ type: 'spawn', kind: s.kind, x: e.x, y: e.y })
}

function makeEnemy(gs, kind, x, y) {
    return { id: gs._nextId++, kind, x, y, hp: ENEMIES[kind].hp, cd: ENEMIES[kind].cd ? Math.floor(ENEMIES[kind].cd / 2) : 0, wanderT: 0, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] }
}

// the tracked aim: unit vector from the enemy to the player (sees through
// walls once a charge has started — the cameras are everywhere)
function trackAim(gs, e) {
    const p = gs.player
    const d = dist(e.x, e.y, p.x, p.y) || 1
    e.aim = [(p.x - e.x) / d, (p.y - e.y) / d]
}

// the telegraph: TELEGRAPH ticks of visible tracking before the shot commits
function beginCharge(gs, e) {
    e.chg = TELEGRAPH
    trackAim(gs, e)
    gs.events.push({ type: 'charge', kind: e.kind })
}

function moveEnemy(gs, e, sp) {
    const p = gs.player
    const [mx, my] = q8(p.x - e.x, p.y - e.y)
    const k = sp * (mx && my ? 0.7071 : 1)
    const nx = e.x + mx * k, ny = e.y + my * k
    const x0 = e.x, y0 = e.y
    if (!blockedPx(gs, nx, ny, 6)) { e.x = nx; e.y = ny }
    else if (!blockedPx(gs, nx, e.y, 6)) e.x = nx
    else if (!blockedPx(gs, e.x, ny, 6)) e.y = ny
    if (e.x !== x0 || e.y !== y0) { e.walk = (e.walk || 0) + k; e.moving = true }
}

function enemyShoot(gs, e, dx, dy, speed, kind, dmg) {
    const d = Math.hypot(dx, dy) || 1
    gs.ebullets.push({ id: gs._nextId++, x: e.x, y: e.y, dx: (dx / d) * speed, dy: (dy / d) * speed, dmg: dmg || 1, kind: kind || 'shot' })
    gs.events.push({ type: 'eshoot', kind: e.kind })
}

function updateEnemies(gs) {
    const p = gs.player
    for (const e of gs.enemies) {
        const def = ENEMIES[e.kind]
        if (e.hitT > 0) e.hitT--
        if (e.cd > 0) e.cd--
        e.moving = false
        if (def.kind === 'chaser') {
            moveEnemy(gs, e, def.speed * (1 + gs.room * 0.03))
        } else if (def.kind === 'turret') {
            if (e.chg > 0) {
                trackAim(gs, e)
                e.chg--
                if (e.chg === 0) { e.cd = def.cd; enemyShoot(gs, e, e.aim[0], e.aim[1], 1.8) }
            } else if (e.cd <= TELEGRAPH && e.cd > 0 && p.deadT === 0 && los(gs, e.x, e.y, p.x, p.y)) {
                beginCharge(gs, e)
            } else if (e.cd <= 0 && p.deadT === 0 && los(gs, e.x, e.y, p.x, p.y)) {
                e.cd = def.cd
                enemyShoot(gs, e, p.x - e.x, p.y - e.y, 1.8)
            }
        } else if (def.kind === 'thrower') {
            e.wanderT--
            if (e.wanderT <= 0) {
                e.wanderT = 40
                const a = Math.floor(lcg(gs.rng) * 8) * Math.PI / 4
                e.wdx = Math.round(Math.cos(a)); e.wdy = Math.round(Math.sin(a))
            }
            const k = def.speed * (e.wdx && e.wdy ? 0.7071 : 1)
            const nx = e.x + e.wdx * k, ny = e.y + e.wdy * k
            if (!blockedPx(gs, nx, ny, 6)) { e.x = nx; e.y = ny; e.walk = (e.walk || 0) + k; e.moving = true } else e.wanderT = 0
            if (e.cd <= 0 && p.deadT === 0 && los(gs, e.x, e.y, p.x, p.y)) {
                e.cd = def.cd
                gs.grenades.push({ id: gs._nextId++, x: e.x, y: e.y, dx: (p.x - e.x) / (dist(e.x, e.y, p.x, p.y) || 1) * CFG.grenadeSpeed, dy: (p.y - e.y) / (dist(e.x, e.y, p.x, p.y) || 1) * CFG.grenadeSpeed, t: CFG.grenadeTicks })
                gs.events.push({ type: 'throw' })
            }
        } else if (def.kind === 'heavy') {
            moveEnemy(gs, e, def.speed)
            if (e.chg > 0) {
                trackAim(gs, e)
                e.chg--
                if (e.chg === 0) {
                    e.cd = def.cd
                    const a = Math.atan2(e.aim[1], e.aim[0])
                    for (const d of [-0.35, 0, 0.35]) enemyShoot(gs, e, Math.cos(a + d), Math.sin(a + d), 1.6)
                }
            } else if (e.cd <= TELEGRAPH && e.cd > 0 && p.deadT === 0 && los(gs, e.x, e.y, p.x, p.y)) {
                beginCharge(gs, e)
            } else if (e.cd <= 0 && p.deadT === 0 && los(gs, e.x, e.y, p.x, p.y)) {
                e.cd = def.cd
                const a = Math.atan2(p.y - e.y, p.x - e.x)
                for (const d of [-0.35, 0, 0.35]) enemyShoot(gs, e, Math.cos(a + d), Math.sin(a + d), 1.6)
            }
        } else if (def.kind === 'boss') {
            e.x += e.dir * def.speed
            if (e.x > CW - 30) e.dir = -1
            if (e.x < 30) e.dir = 1
            if (e.cd <= 0 && p.deadT === 0) {
                e.cd = def.cd
                const a = Math.atan2(p.y - e.y, p.x - e.x)
                for (const d of [-0.4, 0, 0.4]) enemyShoot(gs, e, Math.cos(a + d), Math.sin(a + d), 1.55)
            }
            gs._adds = gs.enemies.filter((x) => x.kind !== 'boss').length
            e.spawnT = (e.spawnT || 0) - 1
            if (e.spawnT <= 0 && gs._adds < 3) {
                e.spawnT = 360
                const kind = lcg(gs.rng) < 0.5 ? 'walkcam' : 'runner'
                const e2 = makeEnemy(gs, kind, 24 + lcg(gs.rng) * (CW - 48), cy(2))
                gs.enemies.push(e2)
                gs.events.push({ type: 'spawn', kind, x: e2.x, y: e2.y, bossAdd: true })
            }
        }
        // contact kills (invuln respected inside killPlayer)
        if (p.deadT === 0 && dist(e.x, e.y, p.x, p.y) < CFG.contactR) killPlayer(gs, `touch-${e.kind}`)
    }
}

// ---------------------------------------------------------------- shots ----
function damageEnemy(gs, e, dmg, via) {
    e.hp -= dmg
    e.hitT = 4
    gs.events.push({ type: 'enemyHit', id: e.id, kind: e.kind, via })
    if (e.hp <= 0) {
        addScore(gs, ENEMIES[e.kind].pts, { kind: e.kind })
        gs.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: e.y, pts: ENEMIES[e.kind].pts })
        gs.enemies = gs.enemies.filter((x) => x.id !== e.id)
        if (e.kind === 'boss') { gs.bossDead = true; gs.events.push({ type: 'bossKill' }) }
    }
}

function updateBullets(gs) {
    const p = gs.player
    for (const b of gs.bullets) {
        b.x += b.dx; b.y += b.dy
        if (b.x < 4 || b.x > CW - 4 || b.y < HUD_H + 4 || b.y > CH - 4) { b.done = true; continue }
        const [c, r] = cellOf(b.x, b.y)
        if (gs.walls.has(`${c},${r}`)) { b.done = true; gs.events.push({ type: 'wallHit', x: b.x, y: b.y }); continue }
        let hitCrate = false
        for (const k of gs.crates) {
            if (k.hp <= 0) continue
            if (Math.abs(b.x - k.x) < 8 && Math.abs(b.y - k.y) < 8) {
                k.hp -= b.dmg; k.shake = 5
                hitCrate = true
                if (k.hp <= 0) {
                    addScore(gs, 50, { kind: 'crate' })
                    gs.items.push({ id: gs._nextId++, t: 'weapon', w: k.weapon, x: k.x, y: k.y })
                    gs.events.push({ type: 'crateBreak', x: k.x, y: k.y, weapon: k.weapon })
                }
                break
            }
        }
        if (hitCrate && !b.pierce) { b.done = true; continue }
        for (const e of gs.enemies) {
            if (dist(b.x, b.y, e.x, e.y) < (e.kind === 'boss' ? 14 : 7)) {
                damageEnemy(gs, e, b.dmg, b.kind)
                if (!b.pierce) b.done = true
                break
            }
        }
    }
    gs.bullets = gs.bullets.filter((b) => !b.done)

    for (const b of gs.ebullets) {
        b.x += b.dx; b.y += b.dy
        const [c, r] = cellOf(b.x, b.y)
        if (b.x < 4 || b.x > CW - 4 || b.y < HUD_H + 4 || b.y > CH - 4 || gs.walls.has(`${c},${r}`)) { b.done = true; continue }
        if (p.deadT === 0 && dist(b.x, b.y, p.x, p.y) < CFG.bulletR + CFG.playerR) {
            b.done = true
            killPlayer(gs, `shot-${b.kind}`)
        }
    }
    gs.ebullets = gs.ebullets.filter((b) => !b.done)

    for (const g of gs.grenades) {
        g.x += g.dx; g.y += g.dy; g.t--
        const [c, r] = cellOf(g.x, g.y)
        if (g.t <= 0 || gs.walls.has(`${c},${r}`)) {
            g.done = true
            gs.events.push({ type: 'blast', x: g.x, y: g.y, r: CFG.grenadeR })
            if (p.deadT === 0 && dist(g.x, g.y, p.x, p.y) < CFG.grenadeR + CFG.playerR) killPlayer(gs, 'grenade')
        }
    }
    gs.grenades = gs.grenades.filter((g) => !g.done)
}

// ---------------------------------------------------------------- civilians ----
function updateCivilians(gs) {
    const p = gs.player
    for (const v of gs.civilians) {
        const d = dist(v.x, v.y, p.x, p.y)
        if (d < 52) {
            const [qx, qy] = q8(v.x - p.x, v.y - p.y)
            if (qx || qy) { v.dx = qx; v.dy = qy; v.panic = 30 }
        }
        if (v.panic > 0) v.panic--
        else if (gs.tick % 40 === 0) {
            const a = Math.floor(lcg(gs.rng) * 8) * Math.PI / 4
            v.dx = Math.round(Math.cos(a)); v.dy = Math.round(Math.sin(a))
        }
        const sp = v.panic > 0 ? 1.0 : 0.45
        const k = sp * (v.dx && v.dy ? 0.7071 : 1)
        const nx = v.x + v.dx * k, ny = v.y + v.dy * k
        if (nx < 12 || nx > CW - 12) { v.dx = -v.dx; v.panic = Math.max(v.panic, 10) }
        else v.x = nx
        if (ny < HUD_H + 12 || ny > CH - 12) { v.dy = -v.dy; v.panic = Math.max(v.panic, 10) }
        else v.y = ny
        v.walk += sp
    }
}

function shootCivilians(gs) {
    for (const b of gs.bullets) {
        for (const v of gs.civilians) {
            if (v.done) continue
            if (dist(b.x, b.y, v.x, v.y) < 7) {
                v.done = true
                gs.combo++
                const pts = 100 + (gs.combo - 1) * 50
                addScore(gs, pts, { kind: 'civilian', combo: gs.combo })
                gs.events.push({ type: 'civKill', id: v.id, x: v.x, y: v.y, pts, combo: gs.combo })
                if (!b.pierce) b.done = true
                break
            }
        }
    }
    gs.civilians = gs.civilians.filter((v) => !v.done)
}

// ---------------------------------------------------------------- items ----
function updateItems(gs) {
    const p = gs.player
    for (const it of gs.items) {
        if (it.taken || dist(it.x, it.y, p.x, p.y) > 10) continue
        it.taken = true
        if (it.t === 'weapon') { gs.weapon = it.w; gs.events.push({ type: 'pickup', t: 'weapon', w: it.w }) }
        else if (it.t === 'energy') { gs.energy = CFG.maxEnergy; gs.events.push({ type: 'pickup', t: 'energy' }) }
    }
    gs.items = gs.items.filter((it) => !it.taken)
}

// ---------------------------------------------------------------- rooms ----
function checkClear(gs) {
    if (gs.cleared) return
    const room = gs.roomData
    if (room.bonus) {
        if (gs.bonusT <= 0) {
            gs.cleared = true
            addScore(gs, CFG.roomBonus, { kind: 'roomBonus', bonus: true })
            gs.events.push({ type: 'clear', room: gs.room, bonus: true })
        }
        return
    }
    if (room.boss) {
        if (gs.bossDead && gs.enemies.length === 0 && !room.spawns.length) {
            gs.end = 'win'
            addScore(gs, CFG.roomBonus * 3, { kind: 'finalBonus' })
            gs.events.push({ type: 'win' })
        }
        return
    }
    if (gs.spawnT <= 0 && !room.spawns.length && gs.enemies.length === 0) {
        gs.cleared = true
        addScore(gs, CFG.roomBonus, { kind: 'roomBonus' })
        gs.events.push({ type: 'clear', room: gs.room })
    }
}

function checkExit(gs) {
    if (!gs.cleared || !EXITS.length) return
    const p = gs.player
    for (const ex of EXITS) {
        const x = cx(ex.c), y = cy(ex.r)
        if (Math.abs(p.x - x) < 7 && Math.abs(p.y - y) < 7) {
            gs.roomsCleared++
            if (gs.room + 1 >= TOTAL_ROOMS) return
            gs.events.push({ type: 'advance', room: gs.room })
            loadRoom(gs, gs.room + 1)
            return
        }
    }
}

// ---------------------------------------------------------------- step ----
export function step(gs, inp = {}) {
    gs.tick++
    if (gs.end) return gs
    const p = gs.player

    if (p.deadT > 0) {
        p.deadT--
        if (p.deadT === 0) {
            if (gs.lives <= 0) { gs.end = 'over'; gs.events.push({ type: 'over' }); return gs }
            p.x = cx(START.c); p.y = cy(START.r)
            p.invuln = CFG.invulnRespawn
            gs.energy = CFG.maxEnergy
            gs.events.push({ type: 'respawn' })
        }
        return gs
    }

    if (p.invuln > 0) p.invuln--
    const room = gs.roomData

    // twin-stick input: movement + independent 8-way fire
    const [mx, my] = q8(Math.sign(inp.mx || 0), Math.sign(inp.my || 0))
    if (mx || my) {
        const k = CFG.playerSpeed * (mx && my ? 0.7071 : 1)
        const nx = p.x + mx * k, ny = p.y + my * k
        if (!blockedPx(gs, nx, ny, CFG.playerR)) { p.x = nx; p.y = ny }
        else if (!blockedPx(gs, nx, p.y, CFG.playerR)) p.x = nx
        else if (!blockedPx(gs, p.x, ny, CFG.playerR)) p.y = ny
        p.walk += k
        p.aim = [mx, my]
    }
    let [fx, fy] = q8(Math.sign(inp.fx ?? inp.mx ?? 0), Math.sign(inp.fy ?? inp.my ?? 0))
    if (fx || fy) p.aim = [fx, fy]
    if (p.fireT > 0) p.fireT--
    if (inp.fire && p.fireT <= 0) firePlayer(gs)
    if (inp.bomb) firebomb(gs)

    if (room.bonus) {
        gs.bonusT--
        updateCivilians(gs)
        shootCivilians(gs)
    } else {
        spawnQueued(gs)
        updateEnemies(gs)
    }
    if (gs.end || p.deadT > 0) return gs
    updateBullets(gs)
    updateItems(gs)
    checkClear(gs)
    checkExit(gs)
    return gs
}

// ---------------------------------------------------------------- hash ----
function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

export function stateHash(gs) {
    const p = gs.player
    return fnv([
        gs.tick, gs.room, gs.lives, gs.score, gs.energy, gs.weapon, gs.cleared ? 1 : 0,
        gs.end || '-', p.x.toFixed(2), p.y.toFixed(2), p.aim.join(','), p.deadT, p.invuln,
        ...gs.enemies.map((e) => `${e.id}${e.kind}${e.x.toFixed(2)},${e.y.toFixed(2)}h${e.hp}`),
        ...gs.bullets.map((b) => `${b.id}${b.x.toFixed(2)},${b.y.toFixed(2)}`),
        ...gs.ebullets.map((b) => `${b.id}${b.x.toFixed(2)},${b.y.toFixed(2)}`),
        ...gs.crates.map((k) => `${k.id}${k.hp}${k.weapon}`),
        ...gs.items.map((i) => `${i.id}${i.t}${i.taken ? 'T' : ''}`),
        ...gs.civilians.map((v) => `${v.id}${v.x.toFixed(2)},${v.y.toFixed(2)}`),
        ...gs.grenades.map((g) => `${g.id}${g.t}`),
    ].join('|'))
}
