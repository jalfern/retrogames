// MISSILE BATTLE — the autopilot. `plan(game)` drives the real sim with the
// real input shape (aimTo + fire) and returns its run; the attract demo IS
// this run replayed tick for tick. decide() is stateless greedy over live
// threats: least ground-ETA first, intercept scanned tick by tick against the
// exact enemy motion law (including the smart bomb's weave), batteries chosen
// to keep their ammo balances even — that balance is what the slack rule
// (one fewer interceptor in EVERY battery) grades.

import { CFG } from './sim.js'
import { step } from './sim.js'

export const MAX_TAU = 340

export function decide(g, held) {
    const live = g.enemies.filter((e) => e.kind !== 'bomber')
    if (!live.length) return {}
    const inBlast = (e) => g.blasts.some((b) => {
        const dx = e.x - b.x, dy = e.y - b.y
        return dx * dx + dy * dy <= b.r * b.r
    })
    const eta = (e) => (CFG.groundY - e.y) / e.vy

    let pick = null
    for (const e of live) {
        if (inBlast(e)) continue
        const h = held.get(e.id)
        if (h && g.tick < h) continue
        if (!pick || eta(e) < eta(pick)) pick = e
    }
    if (!pick) {
        // no falling work — pop a fat easy shot at a loaded bomber if we can
        // still afford the intercept AND its own battery
        const bomber = g.enemies.find((e) => e.kind === 'bomber' && e.drops.some((d) => !d.done))
        if (!bomber || Math.max(...g.bases.map((b) => (b.alive ? b.ammo : 0))) < 7) return {}
        pick = bomber
    }
    if (!pick) return {}
    const e = pick
    const groundETA = Math.floor(eta(e))

    const feasible = []
    g.bases.forEach((b, i) => {
        if (!b.alive || b.ammo <= 0) return
        const [a, z] = CFG.spans[i]
        if (e.x < a || e.x > z) return
        feasible.push(i)
    })
    if (!feasible.length) return {}

    for (let tau = 4; tau <= Math.min(MAX_TAU, groundETA - 3); tau++) {
        const ex = e.px + e.vx * tau + (e.amp ? Math.sin((e.t + tau) * 0.07) * e.amp : 0)
        const ey = e.y + e.vy * tau
        if (ey < CFG.aimMinY + 1) continue
        if (ey > CFG.killLine) break
        let best = -1, bestScore = -1
        for (const i of feasible) {
            const b = g.bases[i]
            const dist = Math.hypot(ex - b.x, ey - (CFG.groundY + 8))
            if (dist > CFG.ivSpeed * tau - 1) continue
            const score = b.ammo
            if (score > bestScore || (score === bestScore && best >= 0 && Math.abs(b.x - ex) < Math.abs(g.bases[best].x - ex))) {
                bestScore = score; best = i
            }
        }
        if (best >= 0) {
            const b = g.bases[best]
            const ivTicks = Math.round(Math.hypot(ex - b.x, ey - (CFG.groundY + 8)) / CFG.ivSpeed) + 2
            held.set(e.id, g.tick + ivTicks + 3)
            return { aimTo: [Math.max(2, Math.min(254, ex)), Math.max(CFG.aimMinY, Math.min(CFG.aimMaxY, ey))], fire: true }
        }
    }
    return {}
}

export function plan(g, { maxTicks = 40000 } = {}) {
    const held = new Map()
    const script = []
    const receipts = { fired: 0, kills: 0, citiesLost: 0, chainKills: 0, perWave: [], end: null }
    let lastWave = g.wave
    let w = { fired: 0, kills: 0, lost: 0, chains: 0 }
    for (let t = 0; t < maxTicks && !g.end; t++) {
        const inp = decide(g, held)
        script.push(inp)
        step(g, inp)
        if (inp.fire) w.fired++
        for (const ev of g.events) {
            if (ev.type === 'kill') { w.kills++; if (ev.chain) w.chains++ }
            if (ev.type === 'cityHit') w.lost++
        }
        if (g.wave !== lastWave) {
            receipts.perWave.push({ wave: lastWave, ...w })
            w = { fired: 0, kills: 0, lost: 0, chains: 0 }
            lastWave = g.wave
        }
    }
    receipts.perWave.push({ wave: lastWave, ...w })
    receipts.fired = script.filter((s) => s.fire).length
    receipts.kills = receipts.perWave.reduce((n, p) => n + p.kills, 0)
    receipts.chainKills = receipts.perWave.reduce((n, p) => n + p.chains, 0)
    receipts.citiesLost = receipts.perWave.reduce((n, p) => n + p.lost, 0)
    receipts.end = g.end
    receipts.score = g.score
    return { ok: g.end === 'win', script, receipts }
}
