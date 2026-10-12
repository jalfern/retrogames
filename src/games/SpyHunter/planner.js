// SPY HUNTER — the autopilot. It reads ONLY the sim state (no peeking past
// step()) and drives the real input struct, tick by tick, until the two
// stages are cleared or the engine says stop. The attract demo replays its
// winning script through the real step(); huntercheck re-runs it with one
// fewer missile and one fewer life. If this file cannot clear a stage, the
// stage does not ship.
//
// The model IS the sim: for each candidate lane the car clones the whole
// world and rolls it forward ~1.3 s under the real step(), steering toward
// that line. Anything that can kill you — a bomb crossing your transit, a
// spin drifting you into a standing Killer, an oil column you were about to
// cross three ticks from now — shows up in that rollout because it is not a
// model of the game, it IS the game. Hand-drawn threat rings lost to the
// real box twice: they always will.

import { makeGame, step, CFG, PY } from './sim.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const DEPTH = 78
const CENTER = 112

export function wantFire(g, x) {
    const p = g.player
    if (p.spin > 0 || p.dead) return false
    if (g.bonusT > 0 && g.bonusAlive && Math.abs(g.bonusX - x) < 11) return true
    for (const e of g.ents) {
        if (e.state !== 'run') continue
        if (e.type === 'supporter') {
            if (e.crate && e.y > 30 && e.y < PY - 22 && Math.abs(e.x - x) < 13) return true
            continue
        }
        if (e.type === 'traffic') continue     // you dodge traffic, you do not duel it
        if (e.type === 'sweeper') continue     // polite company
        if (e.y > PY - 20 || e.y < 8) continue
        if (Math.abs(e.x - x) < 13) return true
    }
    return false
}

function cratePullAt(g) {
    for (const c of g.crates) {
        const k = (PY - c.y) / CFG.scroll
        if (k > 0 && k < 70) return c.x
    }
    for (const e of g.ents) {
        if (e.state === 'run' && e.type === 'supporter' && e.crate && e.y > 24 && e.y < PY - 8) {
            return e.x
        }
    }
    return null
}

function rollout(g, target, wantMissile) {
    const c = structuredClone(g)
    c.events.length = 0
    let spins = 0, crates = 0, kills = 0, missileHit = 0
    for (let k = 0; k < DEPTH; k++) {
        const p = c.player
        const inp = {}
        if (!p.dead && p.spin <= 0 && c.phase !== 'done') {
            if (target > p.x + 1) inp.r = true
            else if (target < p.x - 1) inp.l = true
        }
        inp.f = wantFire(c, p.x)
        if (wantMissile && c.missiles > 0 && c.boat && c.boat.state === 'run') {
            inp.m = true
            wantMissile = false
        }
        step(c, inp)
        for (const e of c.events) {
            if (e.type === 'death') return { dead: true }
            if (e.type === 'spin') spins++
            if (e.type === 'crate') crates++
            if (e.type === 'kill') { kills++; if (e.kind === 'boat') missileHit++ }
        }
        c.events.length = 0
        if (c.end) break
    }
    if (c.player.dead > 0) return { dead: true }
    let cost = spins * 90 + c.player.offT * 8 - crates * 600 - kills * 70
    cost += Math.abs(c.player.x - CENTER) * 0.6          // never finish a dodge at the wall
    cost += Math.abs(target - g.player.x) * 1.2          // hysteresis: do not wiggle
    void missileHit
    return { cost }
}

export function decide(g) {
    const p = g.player
    const inp = {}
    if (p.dead || g.phase === 'done' || p.spin > 0) return inp

    const pull = cratePullAt(g)
    const wantMissile = g.missiles > 0 && !!g.boat && g.boat.state === 'run' &&
        g.boat.y > 24 && g.boat.y < 150
    const offs = [-66, -44, -22, 0, 22, 44, 66]
    let seen = new Set()
    let best = null, bestScore = 1e18
    for (const o of offs) {
        const t = clamp(p.x + o, 20, 200)
        if (seen.has(t)) continue
        seen.add(t)
        if (pull !== null && Math.abs(t - p.x) > Math.abs(pull - p.x)) continue
        const r = rollout(g, t, false)
        if (r.dead) continue
        let s = r.cost
        if (pull !== null) s -= 500 * Math.max(0.2, 1 - Math.abs(t - pull) / 80)
        if (s < bestScore) { bestScore = s; best = t }
    }
    if (best === null) {
        // every one-second horizon ends dead: keep the lane and fire — a
        // better pad is some other car's problem; this one dies shooting
        best = p.x
    }
    if (best > p.x + 1) inp.r = true
    else if (best < p.x - 1) inp.l = true
    inp.f = wantFire(g, p.x)
    if (wantMissile) {
        // spend a missile on the boat only from a lane the rollout says
        // survives the trip there — the gun cannot reach the river, but a
        // careless lane change can put you where its fire can
        const r = rollout(g, p.x, true)
        if (!r.dead) inp.m = true
    }
    return inp
}

export function plan(opts = {}) {
    const maxTicks = opts.maxTicks || 40000
    const g = opts.game || makeGame(0)
    if (opts.lives !== undefined) g.lives = opts.lives
    if (opts.missileTax !== undefined) g.missileTax = opts.missileTax
    const script = []
    const receipts = { kills: 0, deaths: 0, missilesFired: 0, crates: 0, spins: 0, stageClears: 0 }
    for (let t = 0; t < maxTicks && !g.end; t++) {
        const inp = decide(g)
        script.push(inp)
        step(g, inp)
        for (const e of g.events) {
            if (e.type === 'kill') receipts.kills++
            if (e.type === 'death') receipts.deaths++
            if (e.type === 'missile') receipts.missilesFired++
            if (e.type === 'crate') receipts.crates++
            if (e.type === 'spin') receipts.spins++
            if (e.type === 'stageclear') receipts.stageClears++
        }
        g.events.length = 0
    }
    return { game: g, script, ok: g.end === 'win', receipts }
}
