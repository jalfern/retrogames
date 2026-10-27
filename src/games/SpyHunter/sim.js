// SPY HUNTER — the pure machine. step(state, input) mutates state; nothing
// here reads the clock, the DOM or Math.random. The renderer, the autopilot
// (planner.js) and scripts/huntercheck.mjs all drive THIS code — which is
// how a Node harness can audit the road the player is about to drive on,
// and how the attract demo is an honest replay instead of theatre.
//
// Geometry: a 256x224 screen, the G-6155 parked at y=182, the road scrolling
// under it at SCROLL px/tick. Screen-space is the only frame: every entity
// carries its own screen velocity (an oil slick rides the road at SCROLL,
// a slow laker creeps down at SCROLL minus its engine, oncoming traffic
// hurtles at SCROLL plus theirs). Kills, damage and misses are booked as
// events with the arithmetic attached so the harness can recompute the
// score ledger from scratch — the tendeepcheck lesson.

import { STAGES } from './script.js'

export const W = 256
export const H = 224
export const ROAD_L = 26
export const ROAD_R = 198
export const RIVER_X = 224
export const PY = 182                      // player's fixed screen y

export const CFG = {
    scroll: 3.2,
    steer: 2.2,
    life: 3,
    gunCd: 12, gunCdUp: 6,
    heatMax: 24, heatPer: 1, heatCool: 0.22, lockTicks: 80,
    bulletV: 8.5,
    missileV: 6.2,
    spin: 55,
    offMax: 110,                           // off-road ticks before the car is spent
    respawn: 95, invuln: 80,
    bonusTicks: 260, bannerTicks: 150,
    boatFire: 105,
    points: {
        laker: 350, rambler: 400, sweeper: 600, killer: 750,
        traffic: 50, heli: 800, boat: 1000, bonus: 2000, crate: 250, stage: 1000,
    },
    distPer: 160, distPts: 5,
}

let uid = 0
const E = (g, type, x, y, vy, extra = {}) => {
    const e = { id: `${type}-${uid++}`, type, x, y, vy, t: 0, hp: 1, state: 'run', ...extra }
    g.ents.push(e)
    return e
}

export function makeGame(stage = 0) {
    uid = 0
    return {
        tick: 0, stage, stageT: 0, spawnIdx: 0, d: 0, distMark: 0,
        score: 0, lives: CFG.life, missiles: 0, gunUp: false,
        phase: 'drive',                    // drive | bonus | banner | done
        bonusT: 0, bannerT: 0,
        player: { x: 112, spin: 0, spinDrift: 0, offT: 0, dead: 0, invuln: 60, heat: 0, lock: 0, cd: 0 },
        shots: [], eshots: [], missilesFly: [], oils: [], crates: [], parts: 0,
        ents: [], boat: { type: 'boat', state: 'run', y: -20, t: 0, vy: 0.9, respawnAt: 0 },
        events: [],
        end: null,
    }
}

const onRoad = (x) => x > ROAD_L + 4 && x < ROAD_R - 4

function damage(g, why) {
    const p = g.player
    if (p.dead || p.invuln > 0 || g.end || g.phase !== 'drive') return
    p.dead = CFG.respawn
    g.lives--
    g.events.push({ type: 'death', why, x: p.x, y: PY })
    if (g.lives <= 0) { g.end = 'over'; g.phase = 'done' }
}

function killCredit(g, e) {
    e.state = 'dead'
    const pts = CFG.points[e.type] || 0
    g.score += pts
    g.events.push({ type: 'kill', kind: e.type, pts, x: Math.round(e.x), y: Math.round(e.y) })
}

function spawnScripted(g) {
    const st = STAGES[g.stage]
    while (g.spawnIdx < st.events.length && st.events[g.spawnIdx].t <= g.stageT) {
        const ev = st.events[g.spawnIdx++]
        if (ev.type === 'laker') E(g, 'laker', ev.x, -20, 0.9)
        else if (ev.type === 'rambler') E(g, 'rambler', ev.x, -20, 1.15)
        else if (ev.type === 'sweeper') E(g, 'sweeper', ev.x, -20, 1.0, { push: ev.push })
        else if (ev.type === 'killer') E(g, 'killer', ev.x, -20, 0.3, { fire: 40 })
        else if (ev.type === 'traffic') E(g, 'traffic', ev.x, -24, 5.8)
        else if (ev.type === 'heli') E(g, 'heli', ev.x, -18, 1.35, { vx: ev.vx, bombs: ev.bombs, fire: 18 })
        else if (ev.type === 'supporter') E(g, 'supporter', ev.x, H + 20, -1.5, { crate: ev.crate })
    }
}

function fireGun(g, p) {
    if (p.cd > 0 || p.lock > 0 || p.spin > 0 || p.dead) return
    p.cd = g.gunUp ? CFG.gunCdUp : CFG.gunCd
    p.heat += CFG.heatPer
    if (p.heat >= CFG.heatMax) { p.lock = CFG.lockTicks; g.events.push({ type: 'overheat' }) }
    g.shots.push({ x: p.x, y: PY - 18 })
    g.events.push({ type: 'fire' })
}

function fireMissile(g, p) {
    if (g.missiles <= 0 || p.spin > 0 || p.dead) return
    g.missiles--
    g.missilesFly.push({ x: p.x, y: PY - 14, vx: 0, vy: -CFG.missileV })
    g.events.push({ type: 'missile', left: g.missiles })
}

// The guncar boat is the one enemy the road cannon can never reach — it
// sits in the river, off the asphalt, and bullets only fly up the road.
function updateBoat(g) {
    const b = g.boat
    b.t++
    b.y += b.vy
    if (b.y > H + 20) { b.y = -20 }
    const p = g.player
    if (b.t % CFG.boatFire === 0 && b.y > 10 && b.y < 150 && !p.dead && g.phase === 'drive') {
        const dx = Math.max(-1.8, Math.min(1.8, (p.x - b.x) / 45))
        g.eshots.push({ x: b.x - 6, y: b.y + 6, vx: dx, vy: 2.5 })
        g.events.push({ type: 'boatfire', x: Math.round(b.x), y: Math.round(b.y) })
    }
}

function tickPlayer(g, inp) {
    const p = g.player
    if (p.cd > 0) p.cd--
    if (p.lock > 0) p.lock--
    if (p.cd <= 0 && p.lock <= 0) p.heat = Math.max(0, p.heat - CFG.heatCool)
    if (p.invuln > 0) p.invuln--
    if (p.dead > 0) {
        p.dead--
        if (p.dead === 0 && !g.end) {
            p.x = 112; p.spin = 0; p.offT = 0; p.heat = 0; p.lock = 0
            p.invuln = CFG.invuln
            g.events.push({ type: 'respawn', x: p.x })
        }
        return
    }
    if (p.spin > 0) {
        p.spin--
        p.x += p.spinDrift + Math.sin(g.tick * 0.5) * 1.1
    } else if (g.phase === 'drive') {
        if (inp.l) p.x -= CFG.steer
        if (inp.r) p.x += CFG.steer
    }
    p.x = Math.max(12, Math.min(210, p.x))
    if (p.x < 16 || p.x > 204) damage(g, 'wall')
    if (onRoad(p.x)) p.offT = 0
    else {
        p.offT++
        if (p.offT % 20 === 0) g.events.push({ type: 'rumble' })
        if (p.offT >= CFG.offMax) damage(g, 'offroad')
    }
}

function oilVsPlayer(g) {
    const p = g.player
    if (p.dead || p.spin > 0 || p.invuln > 0 || g.phase !== 'drive') return
    for (const o of g.oils) {
        if (o.hit) continue
        if (Math.abs(o.y - PY) < 12 && Math.abs(o.x - p.x) < o.w / 2 + 6) {
            o.hit = true
            p.spin = CFG.spin
            p.spinDrift = o.x < p.x ? 0.9 : -0.9
            g.events.push({ type: 'spin', x: Math.round(o.x), y: Math.round(o.y) })
        }
    }
}

function entsVsPlayer(g) {
    const p = g.player
    if (p.dead) return
    for (const e of g.ents) {
        if (e.state !== 'run') continue
        if (!(Math.abs(e.y - PY) < 16 && Math.abs(e.x - p.x) < 15)) continue
        if (e.type === 'sweeper') {
            const dir = e.push || (p.x >= e.x ? 1 : -1)
            p.x += dir * 1.6
            g.events.push({ type: 'push', dir, x: Math.round(p.x) })
        } else if (e.type === 'supporter') {
            // driving through the Supporter does nothing — shoot it
        } else if (p.invuln <= 0) {
            // the enemy survives the crash; only YOU die. No kill is booked
            // for the car that ran you over — the score ledger in
            // huntercheck would notice a kill credited to the victim.
            g.events.push({ type: 'crash', kind: e.type })
            damage(g, e.type)
        }
    }
}

function stepEnts(g) {
    const p = g.player
    for (const e of g.ents) {
        if (e.state === 'dead') continue
        e.t++
        e.y += e.vy
        if (e.vx) e.x += e.vx
        if (e.type === 'laker' && e.t % 22 === 0 && e.y > -8 && e.y < H - 10) {
            g.oils.push({ x: e.x, y: e.y + 10, w: 38, vy: CFG.scroll, hit: false })
            g.events.push({ type: 'oil', x: Math.round(e.x), y: Math.round(e.y) })
        }
        if (e.type === 'rambler' && e.y > PY - 140 && e.y < PY - 20 && !p.dead) {
            const d = Math.sign(p.x - e.x)
            e.x += d * 0.9
        }
        if (e.type === 'killer' && g.phase === 'drive') {
            e.fire--
            if (e.fire <= 0 && e.y > 10 && e.y < PY - 30 && !p.dead) {
                e.fire = 55
                g.eshots.push({ x: e.x, y: e.y + 14, vx: 0, vy: 3.1 })
                g.events.push({ type: 'killerfire', x: Math.round(e.x), y: Math.round(e.y) })
            }
        }
        if (e.type === 'heli') {
            e.fire--
            if (e.fire <= 0 && e.bombs > 0 && e.y > 8 && e.y < 140 && !p.dead) {
                e.fire = 46
                e.bombs--
                g.eshots.push({ x: e.x, y: e.y + 8, vx: 0, vy: 4.3 })
                g.events.push({ type: 'bomb', x: Math.round(e.x) })
            }
        }
        if (e.type === 'supporter' && e.crate === null && e.y < -20) e.state = 'dead'
        if (e.y > H + 30 || e.y < -40) e.state = 'gone'
    }
    g.ents = g.ents.filter((e) => e.state !== 'gone')
}

function stepShots(g) {
    for (const s of g.shots) s.y -= CFG.bulletV
    g.shots = g.shots.filter((s) => s.y > -12)
    for (const s of g.eshots) { s.x += s.vx; s.y += s.vy }
    g.eshots = g.eshots.filter((s) => s.y < H + 12 && s.x > -12 && s.x < W + 12)
    const p = g.player
    if (!p.dead && p.invuln <= 0 && g.phase === 'drive') {
        for (const s of g.eshots) {
            if (Math.abs(s.y - PY) < 12 && Math.abs(s.x - p.x) < 10) {
                s.y = H + 99
                damage(g, 'shot')
            }
        }
    }
    // gun bullets only answer to things on the road — the boat lives in the
    // river and never once has been hit by a road cannon (that is what the
    // missiles are for, and huntercheck pins this)
    for (const s of g.shots) {
        for (const e of g.ents) {
            if (e.state !== 'run' || e.type === 'supporter') continue
            if (Math.abs(s.y - e.y) < 14 && Math.abs(s.x - e.x) < 11) {
                s.y = -99
                e.hp--
                if (e.hp <= 0) killCredit(g, e)
                else g.events.push({ type: 'hit', kind: e.type })
                break
            }
        }
        for (const e of g.ents) {
            if (e.state === 'run' && e.type === 'supporter' && e.crate) {
                if (Math.abs(s.y - e.y) < 18 && Math.abs(s.x - e.x) < 14) {
                    s.y = -99
                    g.crates.push({ kind: e.crate, x: e.x, y: e.y, vy: CFG.scroll })
                    e.crate = null
                    g.events.push({ type: 'cratedrop', kind: 'supporter' })
                }
            }
        }
        if (g.bonusT > 0 && g.bonusAlive && Math.abs(s.y - 96) < 12 && Math.abs(s.x - g.bonusX) < 16) {
            s.y = -99
            g.bonusAlive = false
            g.score += CFG.points.bonus
            g.events.push({ type: 'kill', kind: 'bonus', pts: CFG.points.bonus, x: Math.round(g.bonusX), y: 96 })
        }
    }
    // missiles home on any vehicle the gun cannot reach — cars, heli, boat
    for (const m of g.missilesFly) {
        let best = null, bd = 1e9
        for (const e of g.ents) {
            if (e.state !== 'run' || e.type === 'supporter') continue
            const dd = Math.hypot(e.x - m.x, e.y - m.y)
            if (dd < bd) { bd = dd; best = e }
        }
        if (g.boat && g.boat.state === 'run') {
            const dd = Math.hypot(RIVER_X - m.x, g.boat.y - m.y)
            if (dd < bd) { bd = dd; best = { boat: true, x: RIVER_X, y: g.boat.y } }
        }
        if (g.bonusT > 0 && g.bonusX !== undefined) {
            const dd = Math.hypot(g.bonusX - m.x, 96 - m.y)
            if (dd < bd) { bd = dd; best = { bonus: true, x: g.bonusX, y: 96 } }
        }
        if (best) {
            const want = Math.atan2(best.y - m.y, best.x - m.x)
            let cur = Math.atan2(m.vy, m.vx)
            let diff = want - cur
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            cur += Math.max(-0.16, Math.min(0.16, diff))
            const sp = Math.hypot(m.vx, m.vy)
            m.vx = Math.cos(cur) * sp
            m.vy = Math.sin(cur) * sp
        }
        m.x += m.vx; m.y += m.vy
    }
    g.missilesFly = g.missilesFly.filter((m) => m.y > -20 && m.y < H + 20 && m.x > -20 && m.x < W + 20)
    for (const m of g.missilesFly) {
        for (const e of g.ents) {
            if (e.state !== 'run') continue
            if (Math.abs(m.y - e.y) < 14 && Math.abs(m.x - e.x) < 12) {
                m.y = 1e9
                e.hp = 0
                killCredit(g, e)
            }
        }
        if (g.boat && g.boat.state === 'run' && Math.abs(m.y - g.boat.y) < 14 && Math.abs(m.x - RIVER_X) < 16) {
            m.y = 1e9
            killCredit(g, g.boat)
            g.boat.state = 'dead'
            g.boat.respawnAt = g.stageT + 300
        }
        if (g.bonusT > 0 && g.bonusX !== undefined && g.bonusAlive && Math.abs(m.y - 96) < 14 && Math.abs(m.x - g.bonusX) < 16) {
            m.y = 1e9
            g.bonusAlive = false
            g.score += CFG.points.bonus
            g.events.push({ type: 'kill', kind: 'bonus', pts: CFG.points.bonus, x: Math.round(g.bonusX), y: 96 })
        }
    }
    // boat respawn while the stage keeps running
    if (g.boat.state === 'dead' && g.stageT >= g.boat.respawnAt) {
        g.boat.state = 'run'; g.boat.y = -20; g.boat.t = 0
        g.events.push({ type: 'boatback' })
    }
}

function stepOils(g) {
    for (const o of g.oils) o.y += o.vy
    g.oils = g.oils.filter((o) => o.y < H + 16)
}

function stepCrates(g) {
    const p = g.player
    for (const c of g.crates) c.y += c.vy
    g.crates = g.crates.filter((c) => {
        if (!p.dead && Math.abs(c.y - PY) < 15 && Math.abs(c.x - p.x) < 15) {
            // g.missileTax is the slack rule's lever: the harness re-runs
            // the proven campaign with the Supporter's crate carrying fewer
            // missiles and requires the SAME script to still win.
            if (c.kind === 'missile') g.missiles += Math.max(0, 3 - (g.missileTax || 0))
            else if (c.kind === 'gun') g.gunUp = true
            g.score += CFG.points.crate
            g.events.push({ type: 'crate', kind: c.kind, pts: CFG.points.crate, x: Math.round(c.x) })
            if (c.kind === 'repair') { p.offT = 0; p.spin = 0 }
            return false
        }
        return c.y < H + 14
    })
}

function stepStage(g) {
    const p = g.player
    if (g.phase === 'drive') {
        g.d += CFG.scroll
        g.stageT++
        const mark = Math.floor(g.d / CFG.distPer)
        if (mark > g.distMark) {
            g.score += CFG.distPts * (mark - g.distMark)
            g.events.push({ type: 'dist', pts: CFG.distPts * (mark - g.distMark) })
            g.distMark = mark
        }
        spawnScripted(g)
        if (g.stageT >= STAGES[g.stage].ticks) {
            g.phase = 'bonus'
            g.bonusT = 0
            g.bonusX = undefined
            g.bonusAlive = false
            g.events.push({ type: 'bonusstart', stage: g.stage })
        }
    } else if (g.phase === 'bonus') {
        g.d += CFG.scroll * 0.4
        g.bonusT++
        if (g.bonusT === 40) {
            g.bonusX = -24
            g.bonusAlive = true
            g.events.push({ type: 'bonuscar', pts: CFG.points.bonus })
        }
        if (g.bonusAlive) g.bonusX += 2.6
        if (g.bonusAlive && g.bonusX > W + 24) g.bonusAlive = false
        if (g.bonusT >= CFG.bonusTicks) {
            g.score += CFG.points.stage
            g.events.push({ type: 'stageclear', pts: CFG.points.stage, stage: g.stage })
            if (g.stage >= STAGES.length - 1) { g.end = 'win'; g.phase = 'done' } else {
                g.phase = 'banner'
                g.bannerT = 0
            }
        }
    } else if (g.phase === 'banner') {
        g.d += CFG.scroll * 0.2
        g.bannerT++
        if (g.bannerT >= CFG.bannerTicks) {
            g.stage++
            g.stageT = 0
            g.spawnIdx = 0
            g.player.offT = 0
            g.player.heat = 0
            g.player.lock = 0
            g.boat = { type: 'boat', state: 'run', y: -20, t: 0, vy: 0.9, respawnAt: 0 }
            g.phase = 'drive'
            g.events.push({ type: 'stage', stage: g.stage })
        }
    }
    void p
}

export function step(g, inp) {
    g.tick++
    if (g.end) return
    const p = g.player
    if (p.cd > 0 && inp && inp.f && p.cd > 1) p.cd = 1      // buffered trigger
    if (inp && inp.f) fireGun(g, p)
    if (inp && inp.m) fireMissile(g, p)
    tickPlayer(g, inp || {})
    if (g.phase !== 'done') {
        if (g.boat && g.boat.state === 'run') updateBoat(g)
        stepEnts(g)
        stepShots(g)
        stepOils(g)
        stepCrates(g)
        oilVsPlayer(g)
        entsVsPlayer(g)
        stepStage(g)
    }
    g.events.splice(0, Math.max(0, g.events.length - 400))
}

export function stateHash(g) {
    let h = 2166136261
    const mix = (n) => {
        h ^= Math.round(n * 1000) & 0xffffffff
        h = Math.imul(h, 16777619)
    }
    mix(g.tick); mix(g.score); mix(g.lives); mix(g.missiles); mix(g.d); mix(g.player.x)
    mix(g.gunUp ? 1 : 0); mix(g.missilesFly.length); mix(g.shots.length); mix(g.oils.length)
    mix(g.ents.length); mix(g.boat ? g.boat.y : 0)
    for (const e of g.ents) { mix(e.y * 0.01 + e.x * 7) }
    return (h >>> 0).toString(16)
}
