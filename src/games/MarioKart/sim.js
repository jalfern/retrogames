// SUPER MARIO KART — the pure machine. step(state, input) mutates state;
// nothing here reads the clock, the DOM or Math.random. The item tables
// weighted by standing are the dice — the original rolls them on a chip,
// this rolls them on arithmetic. The renderer, the autopilot (planner.js)
// and scripts/kartcheck.mjs all drive THIS code, which is how the harness
// can race the whole 5-lap GP in Node and how the attract demo is an
// honest replay instead of theatre.

import { TRACK, BOOSTS, BOXES, CHECKPOINTS, surfaceAt, TX, TY } from './track.js'

export const LAPS = 5

export const CFG = {
    top: 9.2, acc: 0.075, brake: 0.24, coast: 0.015,
    grassTop: 3.6, kerbTop: 7.4,
    steer: 0.055, driftMul: 1.5, slide: 0.13,
    spinT: 50, bumpV: 0.42, wallLimit: 246,
    boostAcc: 0.17, boostOver: 4.2, boostDur: 95,
    shellV: 13.5, shellLife: 85, hitR: 30, bananaR: 24,
    respawnBox: 170, kartR: 27,
    count: 190,
}

// Items by standing, fixed cycles — no dice, but last place still gets the
// good stuff, like the original's weighted boxes.
const ITEM_TABLES = {
    1: ['banana', 'banana', 'mushroom', 'banana'],
    2: ['shell', 'banana', 'shell', 'mushroom'],
    3: ['shell', 'mushroom', 'shell', 'banana'],
    4: ['mushroom', 'shell', 'shell', 'mushroom'],
    5: ['mushroom', 'shell', 'mushroom', 'shell'],
}

const KART_DEFS = [
    { name: 'PLAYER', color: 'mario', isPlayer: true },
    { name: 'DAISY', color: 'daisy', skill: 0.945 },
    { name: 'YOSHI', color: 'yoshi', skill: 0.93 },
    { name: 'PEACH', color: 'peach', skill: 0.915 },
    { name: 'BOWSER', color: 'bowser', skill: 0.9 },
]

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

function mkKart(def, row) {
    const back = (row + 1) * 118
    const i = Math.round(T.N - back / TRACK.pts[0].d) % T.N
    const p = TRACK.pts[i]
    const side = row % 2 ? 1 : -1
    const lat = side * 85
    return {
        ...def, row,
        x: p.x + Math.cos(p.a + Math.PI / 2) * lat,
        y: p.y + Math.sin(p.a + Math.PI / 2) * lat,
        a: p.a, v: 0, idx: i, hint: i,
        item: null, boxes: 0, boostT: 0, spinT: 0, driftT: 0, steerVis: 0,
        cp: 0, lap: 0, lapStart: 0, lapTimes: [], place: row + 1,
        finished: false, finishT: 0, bananas: 0,
        offroad: false, bumpCd: 0, anim: 0,
    }
}

const T = TRACK

export function makeGame() {
    return {
        tick: 0, phase: 'count', count: CFG.count,
        // the player starts LAST (row 4); the whole race is the overtake
        karts: KART_DEFS.map((d, i) => mkKart(d, d.isPlayer ? 4 : i - 1)),
        shells: [], bananas: [],
        boxes: BOXES.map((b, i) => ({ ...b, id: i, taken: 0 })),
        events: [], end: null,
    }
}

function progress(k) {
    return k.lap * T.len + (k.finished ? T.len : T.pts[k.idx].s)
}

function rank(g) {
    // finished karts rank by who finished FIRST; still running by progress
    const score = (k) => (k.finished ? 1e12 - k.finishT : progress(k))
    const order = [...g.karts].sort((a, b) => score(b) - score(a))
    order.forEach((k, i) => { k.place = i + 1 })
}

function useItem(g, k) {
    if (!k.item || k.spinT > 0) return
    const it = k.item
    k.item = null
    if (it === 'mushroom') {
        k.boostT = CFG.boostDur
        g.events.push({ e: 'boost', who: k.name })
    } else if (it === 'shell') {
        g.shells.push({ x: k.x + Math.cos(k.a) * 30, y: k.y + Math.sin(k.a) * 30,
            a: k.a, v: CFG.shellV, life: CFG.shellLife, from: k.name })
        g.events.push({ e: 'shell', who: k.name })
    } else if (it === 'banana') {
        g.bananas.push({ x: k.x - Math.cos(k.a) * 34, y: k.y - Math.sin(k.a) * 34, from: k.name })
        // the road is not a landfill: two live peels per kart, five on the
        // circuit — the oldest goes, so lap 4 is not an obstacle course
        k.bananas++
        while (g.karts.reduce((n, o) => n + o.bananas, 0) > 2 * g.karts.length) {
            const old = g.bananas.find((b) => b.from === k.name)
            if (old) { g.bananas.splice(g.bananas.indexOf(old), 1); k.bananas-- } else break
        }
        while (g.bananas.length > 5) { g.bananas.shift() }
        g.events.push({ e: 'banana', who: k.name })
    }
}

function spin(k, g, why, by) {
    if (k.spinT > 0 || k.finished) return
    k.spinT = CFG.spinT
    k.boostT = 0
    g.events.push({ e: 'spin', who: k.name, why, by })
}

// One kart's physics for one tick. Shared by player and CPUs — the only
// difference is who computes the input.
function drive(g, k, inp) {
    if (k.finished) {
        k.v *= 0.97
        k.x += Math.cos(k.a) * k.v; k.y += Math.sin(k.a) * k.v
        return
    }
    if (k.spinT > 0) {
        k.spinT--
        k.a += 0.34
        k.v *= 0.975
    } else {
        const surf = surfaceAt(k.x, k.y, k.hint)
        k.hint = surf.i; k.idx = surf.i
        k.offroad = surf.surf === 'grass' || surf.surf === 'kerb'
        const top = surf.surf === 'grass' ? CFG.grassTop : surf.surf === 'kerb' ? CFG.kerbTop : CFG.top
        const boost = k.boostT > 0
        if (boost) { k.boostT--; k.v += CFG.boostAcc }
        if (inp.u && k.v < (boost ? top + CFG.boostOver : top)) k.v += CFG.acc
        else if (!inp.u && k.v > top && !boost) k.v -= CFG.coast * 6
        if (inp.d) k.v -= CFG.brake
        if (!inp.u && !inp.d && k.v <= top && !boost) k.v -= CFG.coast
        if (surf.surf === 'grass' && k.v > top) k.v -= 0.2
        k.steerVis = (inp.l ? -1 : 0) + (inp.r ? 1 : 0)
        const grip = Math.min(1, k.v / 2.2)
        const dr = inp.drift && Math.abs(k.steerVis) > 0 && k.v > 4.5
        if (dr) {
            k.driftT++
            k.a += k.steerVis * CFG.steer * grip * CFG.driftMul
            k.x += Math.cos(k.a + k.steerVis * Math.PI * 0.35) * k.v * CFG.slide
            k.y += Math.sin(k.a + k.steerVis * Math.PI * 0.35) * k.v * CFG.slide
        } else {
            k.driftT = 0
            k.a += k.steerVis * CFG.steer * grip
        }
        if (surf.surf === 'wall' && k.bumpCd === 0) {
            const p = T.pts[surf.i]
            const side = Math.sign(surf.lat)
            const lim = CFG.wallLimit
            k.x = p.x + Math.cos(p.a + Math.PI / 2) * side * lim
            k.y = p.y + Math.sin(p.a + Math.PI / 2) * side * lim
            k.v *= CFG.bumpV
            k.bumpCd = 12
            g.events.push({ e: 'bump', who: k.name })
        }
    }
    if (k.bumpCd > 0) k.bumpCd--
    k.v = Math.max(0, k.v)
    k.x += Math.cos(k.a) * k.v
    k.y += Math.sin(k.a) * k.v
    k.x = Math.max(30, Math.min(TX - 30, k.x))
    k.y = Math.max(30, Math.min(TY - 30, k.y))
    k.anim++
}

function dashPanels(g, k) {
    if (k.finished || k.v < 1) return
    const s = T.pts[k.idx].s
    for (const b of BOOSTS) {
        if (s > b.s0 && s < b.s1) {
            if (k.boostT < 40) { k.boostT = Math.max(k.boostT, 55); g.events.push({ e: 'dash', who: k.name }) }
        }
    }
}

function checkpoints(g, k, prevS) {
    if (k.finished || prevS === undefined) return
    const s = T.pts[k.idx].s
    const wrapped = prevS > T.len * 0.7 && s < T.len * 0.3
    if (!wrapped) {
        for (let ci = 0; ci < CHECKPOINTS.length; ci++) {
            const c = CHECKPOINTS[ci]
            if (prevS < c && s >= c && (ci === 0 || k.cp & (1 << (ci - 1)))) k.cp |= 1 << ci
        }
    }
    const crossed = prevS > T.len - 600 && s < 600
    if (crossed && k.cp === (1 << CHECKPOINTS.length) - 1) {
        k.lap++
        k.lapTimes.push(g.tick - k.lapStart)
        k.lapStart = g.tick
        k.cp = 0
        g.events.push({ e: 'lap', who: k.name, lap: k.lap, t: k.lapTimes[k.lapTimes.length - 1] })
        if (k.lap >= LAPS) {
            k.finished = true
            k.finishT = g.tick
            g.events.push({ e: 'finish', who: k.name, place: k.place, t: k.finishT })
        }
    }
}

function boxes(g, k) {
    if (k.item || k.finished) return
    for (const b of g.boxes) {
        if (b.taken > 0) continue
        if (Math.hypot(k.x - b.x, k.y - b.y) < 46 && k.v > 1) {
            const table = ITEM_TABLES[k.place] || ITEM_TABLES[3]
            b.taken = CFG.respawnBox
            k.item = table[k.boxes++ % table.length]
            g.events.push({ e: 'pickup', who: k.name, item: k.item })
        }
    }
}

function cpuInput(g, k) {
    const inp = { u: true, d: false, l: false, r: false, drift: false, item: false }
    if (g.phase !== 'race') return inp
    const look = 4 + Math.round(k.v * 2.6)
    const t = T.pts[(k.idx + look) % T.N]
    const kmax = T.aheadK((k.idx + look) % T.N, look + 6)
    const lat = -Math.sign(t.k) * Math.min(75, Math.abs(t.k) * 6.5e4)
    const tx = t.x + Math.cos(t.a + Math.PI / 2) * lat
    const ty = t.y + Math.sin(t.a + Math.PI / 2) * lat
    const want = Math.atan2(ty - k.y, tx - k.x)
    const da = wrap(want - k.a)
    if (da < -0.02) inp.l = true
    if (da > 0.02) inp.r = true
    const vmax = Math.min(CFG.top * k.skill, 0.041 / Math.max(kmax, 9e-4))
    if (k.v > vmax + 0.4) { inp.d = true; inp.u = false }
    if (Math.abs(k.steerVis) > 0 && Math.abs(da) > 0.2 && k.v > 5) inp.drift = true
    if (k.item) {
        if (k.item === 'mushroom') inp.item = true
        else if (k.item === 'shell') {
            for (const o of g.karts) {
                if (o === k || o.finished) continue
                const dd = Math.hypot(o.x - k.x, o.y - k.y)
                if (dd < 1000 && Math.abs(wrap(Math.atan2(o.y - k.y, o.x - k.x) - k.a)) < 0.32) { inp.item = true; break }
            }
        } else if (k.item === 'banana' && kmax > 0.0028) inp.item = true
    }
    return inp
}

function shellsStep(g) {
    for (const s of g.shells) {
        s.x += Math.cos(s.a) * s.v
        s.y += Math.sin(s.a) * s.v
        s.life--
        const near = surfaceAt(s.x, s.y, -1)
        if (near.surf === 'wall') s.life = 0
        for (const k of g.karts) {
            if (k.name === s.from || k.finished || k.spinT > 0) continue
            if (Math.hypot(k.x - s.x, k.y - s.y) < CFG.hitR) { s.life = 0; spin(k, g, 'shell', s.from) }
        }
    }
    g.shells = g.shells.filter((s) => s.life > 0)
    for (const b of g.bananas) {
        for (const k of g.karts) {
            if (k.finished || k.spinT > 0) continue
            if (Math.hypot(k.x - b.x, k.y - b.y) < CFG.bananaR && k.v > 1.5) {
                b.gone = true
                const own = g.karts.find((o) => o.name === b.from)
                if (own) own.bananas = Math.max(0, own.bananas - 1)
                spin(k, g, 'banana', b.from)
            }
        }
    }
    g.bananas = g.bananas.filter((b) => !b.gone)
}

function kartBump(g) {
    for (let i = 0; i < g.karts.length; i++) {
        for (let j = i + 1; j < g.karts.length; j++) {
            const a = g.karts[i]; const b = g.karts[j]
            const dx = b.x - a.x; const dy = b.y - a.y
            const d = Math.hypot(dx, dy)
            if (d > 0 && d < CFG.kartR * 2) {
                const push = (CFG.kartR * 2 - d) / 2
                const nx = dx / d; const ny = dy / d
                a.x -= nx * push; a.y -= ny * push
                b.x += nx * push; b.y += ny * push
                const slow = Math.min(a.v, b.v) * 0.5 + Math.max(a.v, b.v) * 0.5
                a.v = Math.min(a.v, slow * 0.96); b.v = Math.min(b.v, slow * 0.96)
            }
        }
    }
}

export function step(g, inp) {
    g.tick++
    if (g.end) return
    const P = g.karts[0]
    if (g.phase === 'count') {
        const prev = Math.ceil(g.count / 60)
        g.count--
        const now = Math.ceil(g.count / 60)
        if (now !== prev && now > 0) g.events.push({ e: 'count', n: now })
        if (g.count <= 0) { g.phase = 'race'; g.events.push({ e: 'go' }); for (const k of g.karts) k.lapStart = g.tick }
    }
    const locked = g.phase !== 'race'
    const pin = locked ? {} : inp || {}
    drive(g, P, { u: !!pin.u, d: !!pin.d, l: !!pin.l, r: !!pin.r, drift: !!pin.drift })
    if (pin.item && g.phase === 'race') useItem(g, P)
    for (let i = 1; i < g.karts.length; i++) {
        const k = g.karts[i]
        const ci = cpuInput(g, k)
        if (locked) ci.u = false
        drive(g, k, ci)
        if (ci.item && g.phase === 'race') useItem(g, k)
    }
    for (const k of g.karts) {
        checkpoints(g, k, k.lastS)
        k.lastS = T.pts[k.idx].s
        dashPanels(g, k)
        boxes(g, k)
    }
    for (const b of g.boxes) if (b.taken > 0) b.taken--
    shellsStep(g)
    kartBump(g)
    rank(g)
    const playerDone = P.finished
    if (playerDone && !g.end) {
        g.end = P.place === 1 ? 'win' : 'lose'
        g.events.push({ e: 'end', place: P.place, t: P.finishT })
    }
    g.events.splice(0, Math.max(0, g.events.length - 300))
}

export function stateHash(g) {
    let h = 2166136261
    const mix = (n) => { h ^= Math.round(n * 100) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(g.tick); mix(g.phase === 'race' ? 1 : 0)
    for (const k of g.karts) { mix(k.x); mix(k.y); mix(k.a); mix(k.v); mix(k.lap); mix(k.place); mix(k.item ? 1 : 0) }
    mix(g.shells.length); mix(g.bananas.length)
    return (h >>> 0).toString(16)
}

export function fmtTime(ticks) {
    const s = ticks / 60
    const m = Math.floor(s / 60)
    const r = s - m * 60
    return `${m}:${r.toFixed(2).padStart(5, '0')}`
}
