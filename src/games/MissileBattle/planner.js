// MISSILE BATTLE — the autopilot. `plan(game)` drives the real sim with the
// real input shape (aimTo + fire) and returns its run; the attract demo IS
// this run replayed tick for tick. decide() is stateless greedy over live
// threats: least ground-ETA first, intercept scanned tick by tick against the
// exact enemy motion law (including the smart bomb's weave), batteries chosen
// to keep their ammo balances even — that balance is what the slack rule
// (one fewer interceptor in EVERY battery) grades. When the sky holds no
// unanswered work it hunts loaded bombers — a pre-drop kill cancels every
// drop they still carry (issue #2306).

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
        // The sky holds no work that must be answered THIS tick — hunt bombers
        // ON PURPOSE. A bomber is the best target on screen: one round on it
        // cancels every drop it still carries (2-4 future intercepts in these
        // scripts), so the pre-drop kill denies the delivery instead of
        // chasing the fall. The old branch gated on a fixed `ammo >= 7`
        // surplus that almost never held while bombers flew; the honest
        // reserve counts the threats still open on screen — warheads not yet
        // dying in a blast and not yet reserved by a shot in the air, each
        // of which will want a round when it comes into range. Hunting is
        // legal while the tubes can cover that reserve after spending one
        // round on the bomber (chains make this conservative, never loose).
        const reserve = live.filter((e) => !inBlast(e) && !(held.get(e.id) > g.tick)).length
        const ammo = g.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0)
        if (ammo <= reserve) return {}
        const dropETA = (e) => Math.min(...e.drops.filter((d) => !d.done).map((d) => d.t - (g.playT - e.spawnAt)))
        const bombs = g.enemies.filter((e) => e.kind === 'bomber' && e.alive &&
            e.drops.some((d) => !d.done) && !(held.get(e.id) > g.tick))
        if (!bombs.length) return {}
        // the one whose next drop is soonest first — cancel the most imminent delivery
        pick = bombs.slice().sort((a, b) => dropETA(a) - dropETA(b) || a.id - b.id)[0]
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
