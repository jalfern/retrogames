// TEMPEST — sim.js : the whole game as a pure step(state, input, dt).
// No DOM, no React, no Math.random — the seeded rng.js only.
//
// World model (abstract, resolution-free):
//   Perimeter coordinate A ∈ [0, N): a point's absolute position walking the
//   tube's near ring, in FACE units (face i spans [i, i+1)). A enemy at A on
//   depth t ∈ [0,1] (0 = far end, 1 = near edge you stand on) is somewhere in
//   the trapezoid of face floor(A), at lateral frac(A).
//   The player p ∈ [0, N) rides the near ring; the camera locks the player at
//   screen-bottom, so the tube visually rotates under the ship.
//   Bullets carry the absolute A they were fired along; firing while straddling
//   a face boundary sends an edge shot — the super bullet — which travels the
//   edge line and kills EVERY enemy touching it, not just the first.

import { mulberry32 } from './rng.js'

export const W = 1024
export const H = 768
export const TARGET_WAVES = 4 // one full pass of the level table = mission win

export const LEVELS = [
    { faces: 16, ridge: 0, mix: ['pulse', 'flip'] },
    { faces: 16, ridge: 1, mix: ['pulse', 'flip', 'spin'] },
    { faces: 32, ridge: 0, mix: ['pulse', 'flip', 'spin'] },
    { faces: 96, ridge: 1, mix: ['pulse'] },
]

export const SCORE = { flip: 200, pulse: 50, spin: 150 }
export const WAVE_BONUS = 1000
export const BONUS_LIFE_AT = 10000

export const CFG = {
    lives: 4,
    playerRev: 0.75,        // revolutions per second around the ring (the cabinet wrapped the tube at a constant angular rate, ~1.3 s/rev, whatever the face count)
    bulletSpeed: 1.25,      // depth / second
    fireCooldown: 0.26,     // seconds between shots while held
    edgeSnap: 0.07,         // how close to a face boundary counts as "on the edge"
    killLat: 0.14,          // normal-bullet lateral tolerance, face units
    edgeKillLat: 0.12,      // how near an integer an enemy must be to ride the edge
    killTolT: 0.07,         // depth tolerance for bullet-vs-enemy
    rimKill: true,          // anything that reaches the near rim kills you (the cabinet rule)
    superPierce: true,      // the edge shot keeps flying after a hit and chain-kills
    laneKill: true,         // a normal bullet kills the enemy riding its face
    scoreOn: true,          // kills actually bank points
    climbBase: 0.075,       // depth/s at wave 1
    climbPerWave: 0.006,
    flipPeriod: 1.15,       // seconds for a flipper to hinge one face
    pulseStageT: 0.9,       // seconds between pulser pulse stages
    pulseHome: 0.8,         // faces/s a pulser curves toward the player
    pulserSpeed: 1.1,       // multiplier on climb speed
    spinOrbit: 2.2,         // faces/s while spiralling the far end
    spinDive: 2.4,          // multiplier once a spinner locks and dives
    spawnGap: 0.75,         // seconds between spawns
    spawnMax: 10,
}

const wrapN = (x, n) => ((x % n) + n) % n
export const wrapDelta = (x, n) => { const w = wrapN(x, n); return w > n / 2 ? w - n : w }

export function playerSpeed(g) { return CFG.playerRev * g.faces }

export function waveSize(level, faces = 16) {
    const base = Math.min(4 + level * 2, CFG.spawnMax)
    return faces >= 64 ? Math.min(base, 8) : base
}

export function makeGame(seed = 1) {
    const g = {
        seed, tick: 0, t: 0,
        level: 1, loop: 0,
        score: 0, lives: CFG.lives, nextLife: BONUS_LIFE_AT,
        p: 0, cooldown: 0,
        bullets: [], enemies: [],
        spawned: 0, spawnT: 0,
        nextId: 1,
        end: null, lastCause: null, lastEvent: null, events: [],
        killsThisWave: 0, superKills: 0,
    }
    resetWave(g)
    return g
}

export function levelCfg(g) { return LEVELS[wrapN(g.level - 1, LEVELS.length)] }

function resetWave(g) {
    const cfg = levelCfg(g)
    g.faces = cfg.faces
    g.ridge = cfg.ridge
    g.p = 0
    g.bullets = []
    g.enemies = []
    g.spawned = 0
    g.spawnT = 0
    g.cooldown = 0
    g.killsThisWave = 0
    g.lastEvent = null
    g.events = g.events || []
}

function emit(g, ev) { g.lastEvent = ev; g.events.push(ev) }

function spawnEnemy(g) {
    const cfg = levelCfg(g)
    const rnd = mulberry32((g.seed ^ 0x9E3779B9) + g.level * 1013 + g.spawned * 7919)
    const type = cfg.mix[Math.floor(rnd() * cfg.mix.length)]
    const A = Math.floor(rnd() * cfg.faces) + 0.15 + rnd() * 0.7
    const speed = (CFG.climbBase + CFG.climbPerWave * (g.level + g.loop * LEVELS.length)) *
        (type === 'pulse' ? CFG.pulserSpeed : type === 'spin' ? 0.7 : 1)
    g.enemies.push({
        id: g.nextId++, type, A, t: 0.02 + rnd() * 0.22, spd: speed,
        flipDir: rnd() < 0.5 ? 1 : -1, stage: 0, stageT: 0, diving: false,
    })
    g.spawned++
    emit(g, { kind: 'spawn', type, A })
}

const scoreFor = (e) => (e.type === 'pulse' ? SCORE.pulse * (1 + e.stage) : SCORE[e.type])

export function step(g, input, dt = 1 / 60) {
    if (g.end) return g
    g.tick++
    g.t += dt
    const n = g.faces

    g.p = wrapN(g.p + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * playerSpeed(g) * dt, n)
    if (g.cooldown > 0) g.cooldown -= dt
    if (input.fire && g.cooldown <= 0) {
        const off = Math.abs(wrapDelta(g.p - Math.round(g.p), n))
        const isSuper = off <= CFG.edgeSnap * (n / 16)
        g.bullets.push({ A: isSuper ? wrapN(Math.round(g.p), n) : g.p, super: isSuper, t: 0.97 })
        g.cooldown = CFG.fireCooldown
        emit(g, { kind: isSuper ? 'super' : 'fire', A: g.p })
    }

    if (g.spawned < waveSize(g.level, g.faces)) {
        g.spawnT -= dt
        if (g.spawnT <= 0) { spawnEnemy(g); g.spawnT = CFG.spawnGap }
    }

    // bullets travel away down the tube
    for (const b of g.bullets) b.t -= CFG.bulletSpeed * dt
    g.bullets = g.bullets.filter((b) => b.t > 0.02)

    // enemies
    for (const e of g.enemies) {
        e.t += e.spd * dt
        if (e.type === 'flip') {
            e.A = wrapN(e.A + e.flipDir * (dt / CFG.flipPeriod), n)
        } else if (e.type === 'pulse') {
            e.stageT += dt
            if (e.stageT >= CFG.pulseStageT) { e.stageT = 0; if (e.stage < 2) e.stage++ }
            const d = wrapDelta(g.p - e.A, n)
            const stepAmt = CFG.pulseHome * (n / 16) * dt
            e.A = wrapN(e.A + (Math.abs(d) <= stepAmt ? d : Math.sign(d) * stepAmt), n)
        } else if (e.type === 'spin') {
            if (!e.diving) {
                e.A = wrapN(e.A + CFG.spinOrbit * dt, n)
                if (e.t >= 0.4) e.diving = true
            } else {
                e.t += e.spd * (CFG.spinDive - 1) * dt
            }
        }
    }

    // bullet x enemy — the face is the lane: a normal bullet kills the first
    // enemy riding its face; a super bullet flies the edge line and chain-kills
    // everything touching that edge on either adjacent face.
    const dead = new Set()
    for (const b of g.bullets) {
        let hit = false
        const fb = Math.floor(wrapN(b.A, n))
        for (const e of g.enemies) {
            if (dead.has(e.id)) continue
            if (Math.abs(b.t - e.t) > CFG.killTolT + (e.type === 'pulse' ? e.stage * 0.015 : 0)) continue
            const fa = Math.floor(wrapN(e.A, n))
            const near = b.super
                ? Math.abs(wrapDelta(e.A - b.A, n)) <= CFG.edgeKillLat * (n / 16) || fa === fb || fa === (fb - 1 + n) % n
                : CFG.laneKill && fa === fb
            if (near) {
                dead.add(e.id)
                if (CFG.scoreOn) g.score += scoreFor(e)
                g.killsThisWave++
                if (b.super) g.superKills++
                hit = true
                emit(g, { kind: 'kill', type: e.type, A: e.A, t: e.t, super: b.super, pts: scoreFor(e) })
            }
        }
        if (hit && (!b.super || !CFG.superPierce)) b.t = -1
    }
    g.bullets = g.bullets.filter((b) => b.t > 0.02)
    if (dead.size) g.enemies = g.enemies.filter((e) => !dead.has(e.id))

    // reaching the near edge
    const passed = new Set()
    for (const e of g.enemies) {
        if (e.t < 1) continue
        const exposed = CFG.rimKill || Math.abs(wrapDelta(e.A - g.p, n)) <= 0.75
        if (exposed) {
            g.lives--
            g.lastCause = `${e.type} reached the edge`
            emit(g, { kind: 'death', A: e.A, lives: g.lives })
            if (g.lives <= 0) { g.end = 'over'; emit(g, { kind: 'over' }) } else { resetWave(g) }
            return g
        }
        passed.add(e.id)
        emit(g, { kind: 'passed', A: e.A })
    }
    if (passed.size) g.enemies = g.enemies.filter((e) => !passed.has(e.id))

    // life bonus
    while (g.score >= g.nextLife) { g.lives++; g.nextLife += BONUS_LIFE_AT; emit(g, { kind: 'bonusLife', lives: g.lives }) }

    // wave clear
    if (g.spawned >= waveSize(g.level, g.faces) && g.enemies.length === 0) {
        g.score += WAVE_BONUS * g.level
        emit(g, { kind: 'waveClear', level: g.level })
        if (g.level >= TARGET_WAVES) { g.end = 'win'; emit(g, { kind: 'win' }); return g }
        g.level++
        if (g.level > LEVELS.length) { g.level = 1; g.loop++ }
        resetWave(g)
    }
    return g
}

export function stateHash(g) {
    let h = 2166136261
    const mix = (v) => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619) }
    mix(g.tick); mix(g.score); mix(g.lives); mix(g.level); mix(g.loop)
    mix(g.p); mix(g.nextLife); mix(g.spawned); mix(g.cooldown * 100)
    mix(g.end ? (g.end === 'win' ? 7 : 3) : 0)
    for (const b of g.bullets) { mix(b.A); mix(b.t * 1000); mix(b.super ? 1 : 0) }
    for (const e of g.enemies) { mix(e.A); mix(e.t * 1000); mix(e.id); mix(e.stage); mix(e.diving ? 1 : 0) }
    return (h >>> 0).toString(16)
}
