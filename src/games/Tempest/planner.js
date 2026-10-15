// TEMPEST — planner.js : the autopilot / attract pilot.
// It reads the same state the harness reads and asks only for what the rules
// allow: slide along the ring, fire down faces and edges. Exposed so the
// harness can audit that the pilot never asks for a cheat.
//
// Policy: everything that climbs to the rim kills, so everything must be shot.
// Order by slack = time until it arrives minus time it would take me to kill it;
// commit to a target until it dies; take edge clusters with the super bullet.

import { CFG, wrapDelta, playerSpeed } from './sim.js'
import { step, makeGame } from './sim.js'

const wrapN = (x, n) => ((x % n) + n) % n

function aimAt(g, e) {
    const n = g.faces
    const flight = (0.97 - e.t) / CFG.bulletSpeed
    if (e.type === 'flip') return wrapN(e.A + e.flipDir * (flight / CFG.flipPeriod), n)
    if (e.type === 'spin' && !e.diving) return wrapN(e.A + CFG.spinOrbit * flight, n)
    return e.A
}

export function decide(g, mem = null) {
    if (g.end || !g.enemies.length) { if (mem) mem.id = null; return { left: false, right: false, fire: false } }
    const n = g.faces

    // commitment: keep the locked target while it is alive and not nearly landed
    let best = null
    if (mem && mem.id != null) {
        best = g.enemies.find((e) => e.id === mem.id && e.t < 0.93) || null
    }
    // arrival guard: whatever lands soonest owns the gun, unless the locked
    // target is within a whisker of dying first
    if (best && g.enemies.length > 1) {
        const mine = (1 - best.t) / best.spd
        const sooner = g.enemies.some((e) => e.id !== best.id && (1 - e.t) / e.spd < mine - 0.3)
        if (sooner) best = null
    }
    if (!best) {
        let bestSlack = Infinity
        for (const e of g.enemies) {
            const tEdge = (1 - e.t) / e.spd
            const aim = aimAt(g, e)
            const d0 = Math.abs(wrapDelta(Math.floor(aim) + 0.5 - g.p, n))
            const tKill = d0 / playerSpeed(g) + g.cooldown + 0.1
            let slack = tEdge - tKill
            if (e.type === 'pulse') slack -= (e.t > 0.5 ? 1.6 : 0.5)
            if (e.type === 'spin' && e.diving) slack -= 1.0
            slack += (d0 / playerSpeed(g)) * 0.15   // sweep, don't ping-pong
            if (slack < bestSlack) { bestSlack = slack; best = e }
        }
        if (mem) mem.id = best.id
    }
    const bestAim = aimAt(g, best)

    // edge cluster: several enemies near one edge line — the super bullet pays
    let target = Math.floor(bestAim) + 0.5
    let superShot = false
    const e0 = Math.round(bestAim) % n
    const riding = g.enemies.filter((e) => Math.abs(wrapDelta(aimAt(g, e) - e0, n)) <= CFG.edgeKillLat * (n / 16) && e.t >= 0.25)
    if (riding.length >= 2 && Math.max(...riding.map((e) => e.t)) > best.t - 0.2) {
        target = wrapN(e0, n)
        superShot = true
    }

    const d = wrapDelta(target - g.p, n)
    const deadband = (superShot ? 0.04 : 0.07) * (n / 16)
    const fireWin = (superShot ? 0.07 : 0.3) * (n / 16)

    // crossfire: anything already down the face you're on gets shot for free
    const crossfire = g.enemies.some((e) =>
        Math.abs(wrapDelta(e.A - g.p, n)) < 0.5 * (n / 16) && e.t >= 0.15 && e.t <= 0.97)

    return {
        left: d < -deadband,
        right: d > deadband,
        fire: (Math.abs(d) <= fireWin && best.t >= 0.15) || crossfire,
    }
}

export function runCampaign(seed, maxTicks = 60 * 60 * 12) {
    const g = makeGame(seed)
    const mem = { id: null }
    let deaths = 0
    let lives = g.lives
    for (let i = 0; i < maxTicks && !g.end; i++) {
        step(g, decide(g, mem), 1 / 60)
        if (g.lives < lives) deaths++
        lives = g.lives
    }
    return { g, deaths, ticks: g.tick }
}

// recorded script for the attract demo — replays the pilot tick for tick
export function plan(seed = 0, maxTicks = 60 * 60 * 12) {
    const g = makeGame(seed)
    const mem = { id: null }
    const script = []
    let deaths = 0
    let lives = g.lives
    for (let i = 0; i < maxTicks && !g.end; i++) {
        const inp = decide(g, mem)
        script.push(inp)
        step(g, inp, 1 / 60)
        if (g.lives < lives) deaths++
        lives = g.lives
    }
    return { script, won: g.end === 'win', deaths, ticks: g.tick, score: g.score }
}
