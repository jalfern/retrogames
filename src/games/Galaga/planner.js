// THE AUTOPILOT — a greedy closed-loop pilot: reads nothing but `gs`, emits
// the same per-tick input vectors a human would. It drives the attract demo
// (the demo IS this pilot's recorded run, replayed through the real step()),
// and it is the referee for the slack rule: galactcheck runs it once with
// the real life count and once with ONE FEWER — a human who loses one ship
// must still be able to finish.

import { step, CFG, H } from './sim.js'

const PREDICT = 48

// Every body that can kill, projected tick-by-tick along its actual path.
// The third number is its danger radius: an armed-but-unfired diver counts
// WIDER than its body, because the bullet it will release cannot be
// predicted before it exists — respect the lane a shooter is in.
export function threats(gs) {
    const out = []
    for (const b of gs.enemyShots) {
        if (b.vy <= 0) continue
        const n = Math.min(PREDICT, Math.ceil((H + 16 - b.y) / b.vy))
        for (let t = 0; t <= n; t++) out.push([b.x + b.vx * t, b.y + b.vy * t, 8])
    }
    for (const e of gs.enemies) {
        if (e.state === 'dead' || e.state === 'hold' || e.state === 'wait') continue
        if (e.state === 'beam') {
            if (!e.bandX) continue
            // an open band is a WATED column, not a point: dodge the whole
            // shaft it hangs down, all the way to the floor
            for (let k = 8; k <= H - e.y - 6; k += 8) out.push([e.bandX, e.y + k, 19])
            continue
        }
        if (!e.path?.fn) continue
        const armed = e.kind !== 'flag' && !e.fired && e.uT / e.path.ticks > 0.35
        const n = Math.min(PREDICT, e.path.ticks - e.uT)
        for (let t = 0; t <= n; t++) {
            const u = (e.uT + t) / e.path.ticks
            const q = e.path.fn(u)
            out.push([q[0], q[1], armed ? (e.kind === 'flag' ? 18 : 16) : e.kind === 'flag' ? 12 : 10])
        }
    }
    return out
}

// The worst clearance (Chebyshev px) over the whole dodge window along a
// candidate velocity — NOT a single-tick lookahead: a diver passing through
// the lane is caught mid-window. < 0 means that vector dies.
export function margin(gs, th, dx, dy) {
    const p = gs.player
    let m = 1e9
    for (let t = 0; t <= PREDICT; t++) {
        const px = Math.max(11, Math.min(213, p.x + dx * t))
        const py = Math.max(204, Math.min(274, p.y + dy * t))
        for (const [x, y, r] of th) {
            const c = Math.max(Math.abs(x - px), Math.abs(y - py)) - r
            if (c < m) m = c
        }
    }
    return m
}

const S = CFG.pSpeed
// Lateral only, deliberately: climbing into the inbound lanes halves the
// warning every bullet and diver gets. Galaga players stay low; so does
// this pilot (proven twice on this sim — vertical escapes score less and
// die faster even for a full-projection policy).
const DIRS = [[-S, 0], [S, 0], [0, 0]]

// Pick the vector that keeps the most air AND gets closest to `goalX`
// (the shot line, or a falling fighter to rescue). Below the SAFETY
// floor the goal is FORGOTTEN — lane pairs (a diver shepherding you into
// its bullet) are built by margin-chasing with a reward pulling you into
// the ALMOST-safe lane. Run first, shoot second. `st` persists the dodge
// direction so the pilot never oscillates inside a closing lane.
const SAFE = 10

export function policy(gs, st = { dodge: 0 }) {
    const p = gs.player
    if (p.state !== 'alive' || gs.phase !== 'play') return { l: 0, r: 0, u: 0, d: 0, f: 0 }

    const th = threats(gs)
    let rescue = gs.fallers.length ? gs.fallers[0].x : 0
    if (rescue) for (const b of gs.shots) if (b.y > p.y - 90) rescue = 0

    let goalX = null
    let tgt = null
    if (rescue) goalX = rescue
    else {
        let dive = null, hold = null, edge = null, bd = 1e9, be = 1e9
        for (const e of gs.enemies) {
            if (e.state === 'dead' || e.state === 'wait' || e.y > p.y - 12) continue
            const d = Math.abs(e.x - p.x) + (p.y - e.y) * 0.04
            if (e.state === 'dive' || e.state === 'beam') { if (!dive || e.y > dive.y) dive = e }
            // holding formation on an EDGE column is not worth a corner
            // fight — unless the edge column is ALL that is left
            else if (e.x > 32 && e.x < 192) { if (d < bd) { bd = d; hold = e } }
            else if (d < be) { be = d; edge = e }
        }
        tgt = dive || hold || edge
        if (tgt) {
            // LEAD the shot: aim where the target will be when the bullet
            // arrives — formation bees sway on the fleet sine, divers keep
            // flying their script. Shooting where a bee IS misses bees.
            const flight = (p.y - tgt.y) / CFG.bulletV
            goalX = tgt.state === 'dive' || tgt.state === 'beam'
                ? tgt.path.fn(Math.min(1, (tgt.uT + flight) / tgt.path.ticks))[0]
                : tgt.x + CFG.swayAmp * (Math.sin((gs.pt + flight) / CFG.swayPeriod * Math.PI * 2) - Math.sin(gs.pt / CFG.swayPeriod * Math.PI * 2))
        }
    }

    const ms = DIRS.map(([dx]) => margin(gs, th, dx, 0))
    const maxM = Math.max(...ms)

    if (maxM < SAFE) {
        let bi = 0
        for (let i = 1; i < DIRS.length; i++) {
            const keep = DIRS[i][0] !== 0 && DIRS[i][0] === st.dodge
            if (ms[i] > ms[bi] + (keep ? 1 : 5)) bi = i
        }
        if (p.x <= 13 && DIRS[bi][0] < 0) bi = 1
        if (p.x >= 211 && DIRS[bi][0] > 0) bi = 0
        return { l: DIRS[bi][0] < 0 ? 1 : 0, r: DIRS[bi][0] > 0 ? 1 : 0, u: 0, d: 0, f: 0 }
    }

    let bx = 0, by = 0, best = -1e18
    for (const i of [0, 1, 2]) {
        const [dx] = DIRS[i]
        const gx = goalX === null ? p.x : goalX
        const fx = Math.max(11, Math.min(213, p.x + dx * 6))
        // the center bias is the anti-corner rule: a lane near a wall is
        // a lane with one side of the escape already spent — inside 24 px
        // of a wall the bill becomes steep
        const wall = Math.max(0, 24 - Math.min(fx, 224 - fx)) * 3
        const score = Math.min(ms[i], 60) * 6 - Math.abs(fx - gx) - Math.abs(fx - 112) * 0.35 - wall
        if (score > best) { best = score; bx = dx; by = 0 }
    }
    void by
    const aligned = goalX !== null && !rescue && Math.abs(goalX - p.x) < 5
    return { l: bx < 0 ? 1 : 0, r: bx > 0 ? 1 : 0, u: 0, d: 0, f: aligned ? 1 : 0 }
}

export function plan(gs, { maxTicks = 20000, onFrame = null } = {}) {
    const script = []
    const receipts = { kills: 0, deaths: 0, dodges: 0, rescues: 0, captures: 0, waves: 0 }
    const st = { dodge: 0 }
    let seen = 0
    for (let t = 0; t < maxTicks && !gs.end; t++) {
        const inp = policy(gs, st)
        script.push(inp)
        if (inp.l || inp.r) receipts.dodges++
        step(gs, inp)
        for (const ev of gs.events.slice(seen)) {
            seen++
            if (ev.type === 'kill') receipts.kills++
            if (ev.type === 'death') receipts.deaths++
            if (ev.type === 'rescued') receipts.rescues++
            if (ev.type === 'captured') receipts.captures++
            if (ev.type === 'clear') receipts.waves++
        }
        if (onFrame) onFrame(t, gs)
    }
    return { ok: gs.end === 'win', script, receipts, end: gs.end, lives: gs.lives }
}
