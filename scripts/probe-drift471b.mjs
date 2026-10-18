import { makeGame, step, decide } from '../src/games/CometDrift/sim.js'
import { TRACK } from '../src/games/CometDrift/track.js'

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// drive one race, log every drift engagement: length + what killed it
function race(name, seed, inputFn) {
    const g = makeGame(seed)
    const logs = []
    let eng = null
    let t = 0
    while (!g.end && t < 60000) {
        const P = g.karts[0]
        const inp = inputFn(g)
        const beforeDrift = P.driftT
        const steerMag = typeof inp.steer === 'number' ? Math.abs(inp.steer) : ((inp.l || inp.r) ? 1 : 0)
        step(g, inp)
        const afterDrift = P.driftT
        if (afterDrift > beforeDrift) {
            eng = { len: afterDrift, v: P.v, bendK: TRACK.aheadK(P.idx, 12) }
        } else if (eng && afterDrift === 0) {
            // what killed it
            const why = !inp.drift ? 'release' : steerMag === 0 ? 'steer0' : P.v <= 4.5 ? 'slow' : 'sim-off'
            logs.push({ len: eng.len, why, v: eng.v.toFixed(1) })
            eng = null
        }
        t++
    }
    const lens = logs.map((l) => l.len)
    const byWhy = {}
    for (const l of logs) byWhy[l.why] = (byWhy[l.why] || 0) + 1
    console.log(`${name} seed ${seed}: engagements=${logs.length} maxLen=${Math.max(0, ...lens)} why=${JSON.stringify(byWhy)}`)
    const long = logs.filter((l) => l.len >= 50).length
    console.log(`   engagements >=50 (blue): ${long}  >=105: ${logs.filter((l) => l.len >= 105).length}  >=165: ${logs.filter((l) => l.len >= 165).length}`)
    return { g, logs }
}

const autopilot = (g) => decide(g)

// human-style: bend-hold drift, apex steer with small deadzone
const human = (g) => {
    const P = g.karts[0]
    const inp = { u: true, d: false, l: false, r: false, drift: false }
    if (g.phase !== 'race') return inp
    const look = 4 + Math.round(P.v * 2.6)
    const q = TRACK.pts[(P.idx + look) % TRACK.N]
    const kmax = TRACK.aheadK((P.idx + look) % TRACK.N, look + 8)
    const lat = -Math.sign(q.k) * Math.min(78, Math.abs(q.k) * 6.2e4)
    const tx = q.x + Math.cos(q.a + Math.PI / 2) * lat
    const ty = q.y + Math.sin(q.a + Math.PI / 2) * lat
    const da = wrap(Math.atan2(ty - P.y, tx - P.x) - P.a)
    if (da < -0.01) inp.l = true
    if (da > 0.01) inp.r = true
    const vmax = Math.min(8.6 * 0.92, 0.045 / Math.max(kmax, 9e-4))
    if (P.v > vmax + 0.3) { inp.d = true; inp.u = false }
    if (kmax > 0.0012 && P.v > 5.5) inp.drift = true
    return inp
}

race('autopilot', 0, autopilot)
race('human    ', 0, human)

// how long are the bends? count consecutive points with |k| > thresholds
const K = [0.0012, 0.0015, 0.0024]
for (const k of K) {
    let run = 0; const runs = []
    for (let i = 0; i < TRACK.N; i++) {
        if (Math.abs(TRACK.pts[i].k) > k) run++
        else { if (run > 0) runs.push(run); run = 0 }
    }
    if (run > 0) runs.push(run)
    // ticks to cross a bend at v=7: pts spacing = len/N px; ticks = px/7
    const pxPerPt = TRACK.len / TRACK.N
    const tickLens = runs.map((r) => Math.round(r * pxPerPt / 7))
    console.log(`|k|>${k}: ${runs.length} bends, pt-run ${Math.min(...runs)}..${Math.max(...runs)} pts ≈ ${Math.min(...tickLens)}..${Math.max(...tickLens)} ticks @v7`)
}
