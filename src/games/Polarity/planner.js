// THE AUTOPILOT — a receding-horizon pilot that IS the fairness audit:
// every tick it freezes the world and replays the real step() forward
// under all six skeletons (stand / step left / step right × keep / flip),
// then lives the safest one. The attract demo is this pilot's proven run,
// polarcheck demands that at least one skeleton survives at every tick of
// it, and the slack rule runs the whole thing with one fewer life. It is
// also the referee the issue asked for: with flips pinned off it CANNOT
// drain the core's dual-color quota, with movement pinned off it walks
// into the storm columns — both are pinned to LOSE in the harness, so
// "the polarity rule is load-bearing" is a checked fact, not a brochure.

import { CFG, L, D, other, survives, step, W } from './sim.js'

const S = CFG.pSpeed

export function killable(gs, e, pol) {
    if (e.state === 'wait' || e.state === 'dead') return false
    if (e.kind === 'core') {
        // the core is not a colored enemy — its shell decides: the shot's
        // color must oppose the shell AT ARRIVAL, and that color's quota
        // must still have room. The base color never filters the core.
        const flight = (gs.player.y - e.y) / CFG.bulletV
        const flips = Math.floor((gs.pt + flight) / CFG.shellPeriod) - Math.floor(gs.pt / CFG.shellPeriod)
        const shellAt = flips % 2 ? other(e.shell) : e.shell
        return shellAt !== pol && e.quota[pol] < CFG.coreNeed
    }
    return e.color !== pol // your shots pass through your own color
}

function predictX(gs, e, flight) {
    if (e.state === 'dive' || e.state === 'entry' || e.state === 'return') {
        const u = Math.min(1, (e.uT + flight) / e.path.ticks)
        return e.path.fn(u)[0]
    }
    if (e.kind === 'weaver' || e.kind === 'core') return e.x
    return e.x + CFG.swayAmp * (Math.sin((gs.pt + flight) / CFG.swayPeriod * Math.PI * 2) - Math.sin(gs.pt / CFG.swayPeriod * Math.PI * 2))
}

export function policy(gs, opts = {}, st = {}) {
    const p = gs.player
    const zero = { l: 0, r: 0, u: 0, d: 0, f: 0, s: 0 }
    if (p.state !== 'alive' || gs.phase !== 'play' || gs.pending || gs.end) return zero

    const dxs = opts.noMove ? [0] : [-S, 0, S]
    const pols = opts.noFlip ? [p.pol] : [p.pol, other(p.pol)]

    // goal per polarity: the best killable target's predicted x, else the
    // center column (walls and storms leave their gaps near the middle of
    // the board far more often than the walls leave open ground)
    const goals = {}
    for (const pol of pols) {
        let best = null, bd = 1e9
        for (const e of gs.enemies) {
            if (!killable(gs, e, pol)) continue
            const flight = (p.y - e.y) / CFG.bulletV
            if (flight < 4) continue
            const d = Math.abs(predictX(gs, e, flight) - p.x) + (p.y - e.y) * 0.02
            if (d < bd) { bd = d; best = e }
        }
        goals[pol] = best
    }

    const skels = []
    for (const dx of dxs) for (const pol of pols) {
        const surv = survives(gs, dx, pol, 34)
        skels.push({ dx, pol, surv })
    }

    let chosen = null
    const aliveSkel = skels.filter((k) => k.surv)
    if (aliveSkel.length) {
        let bestScore = -1e18
        for (const k of aliveSkel) {
            const gx = goals[k.pol] ? predictX(gs, goals[k.pol], (p.y - goals[k.pol].y) / CFG.bulletV) : 112
            const fx = Math.max(10, Math.min(W - 10, p.x + k.dx * 7))
            const wall = Math.max(0, 20 - Math.min(fx, W - fx)) * 2.5
            const align = goals[k.pol] ? -Math.abs(fx - gx) : -Math.abs(fx - 112) * 0.5
            const keep = k.pol === p.pol ? 6 : 0
            const score = align + keep + (goals[k.pol] ? 30 : 0) - wall + (k.dx === st.dodge ? 1 : 0)
            if (score > bestScore) { bestScore = score; chosen = k }
        }
    } else {
        // fairness would be red here; drive somewhere anyway so the run
        // ends with a receipt, not a stall
        let far = -1
        for (const k of skels) {
            const fx = Math.max(10, Math.min(W - 10, p.x + k.dx * 7))
            const c = Math.min(fx, W - fx)
            if (c > far) { far = c; chosen = k }
        }
    }
    st.dodge = chosen.dx

    let f = 0
    const tgt = goals[chosen.pol]
    if (tgt && gs.shots.length < CFG.maxShots) {
        const flight = (p.y - tgt.y) / CFG.bulletV
        if (Math.abs(predictX(gs, tgt, flight) - (p.x + chosen.dx)) < 5) f = 1
    }
    return {
        l: chosen.dx < 0 ? 1 : 0,
        r: chosen.dx > 0 ? 1 : 0,
        u: 0, d: 0,
        f,
        s: chosen.pol !== p.pol ? 1 : 0,
    }
}

export function plan(gs, { maxTicks = 20000, noMove = false, noFlip = false, onFrame = null } = {}) {
    const script = []
    const receipts = { kills: 0, deaths: 0, flips: 0, absorbs: 0, novas: 0, blocked: 0, chits: 0, walls: 0, storms: 0, timeouts: 0 }
    const st = { dodge: 0 }
    let seen = 0
    for (let t = 0; t < maxTicks && !gs.end; t++) {
        const inp = policy(gs, { noMove, noFlip }, st)
        script.push(inp)
        step(gs, inp)
        for (const e of gs.events.slice(seen)) {
            seen++
            if (e.type === 'kill') receipts.kills++
            if (e.type === 'death') receipts.deaths++
            if (e.type === 'flip') receipts.flips++
            if (e.type === 'absorb') receipts.absorbs++
            if (e.type === 'nova') receipts.novas++
            if (e.type === 'blocked') receipts.blocked++
            if (e.type === 'chit') receipts.chits++
            if (e.type === 'wall') receipts.walls++
            if (e.type === 'storm') receipts.storms++
            if (e.type === 'timeout') receipts.timeouts++
        }
        if (onFrame) onFrame(t, gs)
    }
    return { ok: gs.end === 'win', script, receipts, end: gs.end, lives: gs.lives, wave: gs.wave }
}

// The six skeletons the fairness audit speaks in. (W is re-exported so
// the harness reads the board width from the sim, not its own constant.)
export const SKELETONS = [-S, 0, S]
export { W }
