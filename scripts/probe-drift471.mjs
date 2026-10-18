import { makeGame, step, decide } from '../src/games/CometDrift/sim.js'
import { TRACK } from '../src/games/CometDrift/track.js'

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// 1) autopilot race: count boost events by tier
function autopilotRace(seed) {
    const g = makeGame(seed)
    const boosts = [0, 0, 0]
    let t = 0
    while (!g.end && t < 60000) {
        step(g, decide(g))
        const evs = g.events.splice(0)
        for (const ev of evs) if (ev.e === 'boost' && ev.who === 'COMET') boosts[ev.tier]++
        t++
    }
    return { end: g.end, boosts, t }
}

// 2) human sim: full throttle; steer toward apex target; hold drift through a
// bend (curvature ahead), release on the straight. Like a player holding space.
function humanRace(seed) {
    const g = makeGame(seed)
    const boosts = [0, 0, 0]
    let t = 0
    while (!g.end && t < 60000) {
        const P = g.karts[0]
        const inp = { u: true, d: false, l: false, r: false, drift: false }
        if (g.phase === 'race') {
            const look = 4 + Math.round(P.v * 2.6)
            const q = TRACK.pts[(P.idx + look) % TRACK.N]
            const kmax = TRACK.aheadK((P.idx + look) % TRACK.N, look + 8)
            let lat = -Math.sign(q.k) * Math.min(78, Math.abs(q.k) * 6.2e4)
            const tx = q.x + Math.cos(q.a + Math.PI / 2) * lat
            const ty = q.y + Math.sin(q.a + Math.PI / 2) * lat
            const da = wrap(Math.atan2(ty - P.y, tx - P.x) - P.a)
            if (da < -0.02) inp.l = true
            if (da > 0.02) inp.r = true
            const vmax = 8.6 * 0.9 / Math.max(kmax, 9e-4) * 0.05
            if (P.v > Math.min(8.6 * 0.92, vmax)) { inp.d = true; inp.u = false }
            if (kmax > 0.0015 && P.v > 5) inp.drift = true
        }
        step(g, inp)
        const evs = g.events.splice(0)
        for (const ev of evs) if (ev.e === 'boost' && ev.who === 'COMET') boosts[ev.tier]++
        t++
    }
    return { end: g.end, boosts, t }
}

for (const seed of [0, 5, 42]) {
    const a = autopilotRace(seed)
    console.log(`autopilot seed ${seed}: end=${a.end} t=${(a.t / 60).toFixed(1)}s boosts=${a.boosts}`)
}
for (const seed of [0, 5, 42]) {
    const h = humanRace(seed)
    console.log(`human     seed ${seed}: end=${h.end} t=${(h.t / 60).toFixed(1)}s boosts=${h.boosts}`)
}
