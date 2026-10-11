// MISSILE BATTLE — the pure simulation. `step(state, input)` is the whole
// world: scripted saturation attacks from waves.js, interceptors launched at
// a point by the nearest battery in range, expanding blasts that chain.
// Zero Math.random() anywhere — the harness (scripts/missilecheck.mjs) freezes
// Math.random to enforce it and re-plays this world tick for tick.
//
// The whole game state is plain data: the renderer draws it, the planner
// reads it, the harness clones it. Pixel = sim unit on a 256x224 canvas.

import { WAVES, TARGETS, CITIES, BASES } from './waves.js'

export const W = 256
export const H = 224

export const CFG = {
    groundY: 192,
    bannerLen: 150,
    clearLen: 170,
    ammoWave: 10,
    ivSpeed: 2.1,
    blastR: 13,
    blastGrow: 0.7,
    blastHold: 6,
    chainR: 0.72,
    aimSpd: 2.6,
    aimMinY: 6,
    aimMaxY: 160,
    killLine: 150,
    maxVY: 0.95,
    maxBlasts: 26,
    score: { icbm: 25, smart: 60, bomber: 45, chain: 40 },
    spans: [[0, 104], [40, 216], [152, 256]],
}

let eid = 1

// ti indexes TARGETS; a dead target keeps its column (the impact reads as a
// dud on the rubble — legality never depends on a living victim).
const resolveTarget = (g, ti) => TARGETS[ti] ?? (void g, 128)

function nearestTarget(g, x) {
    let best = -1, bd = 1e9
    g.cities.forEach((c, i) => {
        if (!c.alive) return
        const d = Math.abs(c.x - x)
        if (d < bd) { bd = d; best = i }
    })
    return best
}

function pushEnemy(g, e) {
    e.id = eid++
    e.t = 0
    e.alive = true
    g.enemies.push(e)
    return e
}

function spawnEnemy(g, spec) {
    const tx = resolveTarget(g, spec.ti)
    const vy = spec.kind === 'bomber' ? 0 : (CFG.groundY + 4) / spec.spd
    const vx = spec.kind === 'bomber' ? spec.vx : (tx - spec.x0) / spec.spd
    if (!(vy <= CFG.maxVY) || !Number.isFinite(vy) || !Number.isFinite(vx) || !Number.isFinite(spec.x0)) {
        throw new Error(`wave script unusable: kind ${spec.kind} spd ${spec.spd} x0 ${spec.x0}`)
    }
    const e = pushEnemy(g, {
        kind: spec.kind, x: spec.x0, px: spec.x0, y: -4,
        vx, vy,
        ti: spec.ti ?? -1,
        split: spec.split ? { ...spec.split, done: false } : null,
        amp: spec.amp || 0,
        drops: spec.drops ? spec.drops.map((d) => ({ ...d, done: false })) : null,
        spawnAt: g.playT,
        score: CFG.score[spec.kind],
    })
    g.events.push({ type: 'launch', kind: e.kind, x: e.x, y: e.y, tick: g.tick })
    return e
}

// MIRV siblings converge on the parent's target city with a speed spread:
// they fan out at the split, then arrive at the same crater staggered —
// which is what makes a chain blast worth engineering.
function spawnChild(g, parent, k) {
    const n = parent.split.n
    const tgt = parent.ti >= 0 && parent.ti < 6 && g.cities[parent.ti].alive
        ? CITIES[parent.ti]
        : nearestTarget(g, parent.x)
    const tx0 = Math.max(2, Math.min(W - 2, (tgt ?? 128) + (k - (n - 1) / 2) * 10))
    const spd = parent.split.spd * (1 + (k - (n - 1) / 2) * 0.16)
    const vy = (CFG.groundY - parent.y) / spd
    return pushEnemy(g, {
        kind: 'icbm', x: parent.x, px: parent.x, y: parent.y,
        vx: (tx0 - parent.x) / spd, vy,
        ti: tgt ?? -1, split: null, amp: 0, drops: null,
        spawnAt: g.playT, score: CFG.score.icbm,
    })
}

function fire(g, tx, ty) {
    tx = Math.max(2, Math.min(W - 2, tx))
    ty = Math.max(CFG.aimMinY, Math.min(CFG.aimMaxY, ty))
    let bi = -1, bd = 1e9
    g.bases.forEach((b, i) => {
        if (!b.alive || b.ammo <= 0) return
        const [a, z] = CFG.spans[i]
        if (tx < a || tx > z) return
        const d = Math.abs(b.x - tx)
        if (d < bd) { bd = d; bi = i }
    })
    if (bi < 0) { g.events.push({ type: 'deny', x: Math.round(tx), y: Math.round(ty), tick: g.tick }); return false }
    const b = g.bases[bi]
    b.ammo--
    const sx = b.x, sy = CFG.groundY + 8
    const eta = Math.max(1, Math.round(Math.hypot(tx - sx, ty - sy) / CFG.ivSpeed))
    g.intc.push({ id: eid++, x: sx, y: sy, tx, ty, vx: (tx - sx) / eta, vy: (ty - sy) / eta, eta, t: 0, bat: bi })
    g.fired++
    g.firedBy[bi]++
    g.events.push({ type: 'ifire', x: sx, y: sy, tx: Math.round(tx), ty: Math.round(ty), bat: bi, tick: g.tick })
    return true
}

function addBlast(g, x, y, r, chain = false) {
    if (g.blasts.length >= CFG.maxBlasts) g.blasts.shift()
    g.blasts.push({ x, y, r: 0, rMax: r, age: 0, state: 'grow', chain })
}

const freshWave = (g, wave) => {
    g.wave = wave
    g.cities = CITIES.map((x) => ({ x, alive: true }))
    g.bases = BASES.map((x) => ({ x, ammo: CFG.ammoWave, alive: true }))
    g.enemies = []; g.intc = []; g.blasts = []
    g.queue = structuredClone(WAVES[wave].entries)
    g.fired = 0; g.firedBy = [0, 0, 0]; g.kills = 0
    g.phase = 'banner'; g.pT = CFG.bannerLen
    g.events.push({ type: 'banner', wave, tick: g.tick })
}

export function makeGame(wave = 0) {
    eid = 1
    const g = {
        tick: 0, playT: 0, wave: 0, phase: 'banner', pT: CFG.bannerLen,
        score: 0, end: null,
        cities: [], bases: [], aim: { x: 128, y: 90 },
        fireHeld: false, fired: 0, firedBy: [0, 0, 0], kills: 0,
        enemies: [], intc: [], blasts: [], queue: [], events: [],
    }
    freshWave(g, wave)
    return g
}

export const stateHash = (g) => {
    const r1 = (n) => Math.round(n * 10)
    return [
        g.tick, g.wave, g.phase, g.end, g.score,
        g.cities.map((c) => (c.alive ? 1 : 0)).join(''),
        g.bases.map((b) => `${b.ammo}${b.alive ? 1 : 0}`).join(','),
        g.aim.x.toFixed(1), g.aim.y.toFixed(1), g.fired, g.kills,
        g.enemies.map((e) => `${e.id}${e.kind[0]}${r1(e.x)},${r1(e.y)}`).join(';'),
        g.intc.map((m) => `${m.id}${r1(m.x)},${r1(m.y)}`).join(';'),
        g.blasts.map((b) => `${r1(b.x)},${r1(b.y)},${r1(b.r)}${b.chain ? 'c' : ''}`).join(';'),
    ].join('|')
}

export function step(g, input = {}) {
    g.events = []
    if (g.end) return g
    g.tick++

    if (g.phase === 'banner') {
        g.pT--
        if (g.pT <= 0) { g.phase = 'play'; g.playT = 0; g.events.push({ type: 'go', wave: g.wave, tick: g.tick }) }
        return g
    }
    if (g.phase === 'clear') {
        g.pT--
        if (g.pT <= 0) {
            if (g.wave >= WAVES.length - 1) { g.end = 'win'; g.events.push({ type: 'win', tick: g.tick }); return g }
            freshWave(g, g.wave + 1)
        }
        return g
    }

    g.playT++

    // 1. the script launches
    for (let i = g.queue.length - 1; i >= 0; i--) {
        if (g.queue[i].t <= g.playT) { spawnEnemy(g, g.queue[i]); g.queue.splice(i, 1) }
    }

    // 2. aim + fire (edge-triggered; aimTo lets a tap set the reticle and
    //    fire in one tick — the phone path and the autopilot's lock-on)
    if (input.aimTo) {
        g.aim.x = Math.max(2, Math.min(W - 2, input.aimTo[0]))
        g.aim.y = Math.max(CFG.aimMinY, Math.min(CFG.aimMaxY, input.aimTo[1]))
    }
    if (input.l) g.aim.x -= CFG.aimSpd
    if (input.r) g.aim.x += CFG.aimSpd
    if (input.u) g.aim.y -= CFG.aimSpd
    if (input.d) g.aim.y += CFG.aimSpd
    g.aim.x = Math.max(2, Math.min(W - 2, g.aim.x))
    g.aim.y = Math.max(CFG.aimMinY, Math.min(CFG.aimMaxY, g.aim.y))
    if (input.fire && !g.fireHeld) fire(g, g.aim.x, g.aim.y)
    g.fireHeld = !!input.fire

    // 3. interceptors fly to their point
    for (const m of g.intc) {
        m.t++
        m.x += m.vx; m.y += m.vy
        if (m.t >= m.eta) {
            m.x = m.tx; m.y = m.ty; m.done = true
            addBlast(g, m.tx, m.ty, CFG.blastR)
            g.events.push({ type: 'boom', x: m.tx, y: m.ty, tick: g.tick })
        }
    }
    g.intc = g.intc.filter((m) => !m.done)

    // 4. blasts grow, hold, shrink — contact kills, every kill chains
    const chains = []
    for (const b of g.blasts) {
        b.age++
        if (b.state === 'grow') { b.r += CFG.blastGrow; if (b.r >= b.rMax) { b.r = b.rMax; b.state = 'hold' } }
        else if (b.state === 'hold') { if (b.age > CFG.blastHold + b.rMax / CFG.blastGrow) b.state = 'shrink' }
        else { b.r -= CFG.blastGrow }
        for (const e of g.enemies) {
            if (!e.alive) continue
            const dx = e.x - b.x, dy = e.y - b.y
            if (dx * dx + dy * dy <= b.r * b.r) {
                e.alive = false
                g.score += b.chain ? CFG.score.chain : e.score
                g.kills++
                g.events.push({ type: 'kill', kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), pts: b.chain ? CFG.score.chain : e.score, chain: !!b.chain, tick: g.tick })
                if (CFG.chainR > 0) chains.push([e.x, e.y])
            }
        }
    }
    for (const [x, y] of chains) addBlast(g, x, y, CFG.blastR * CFG.chainR, true)
    g.blasts = g.blasts.filter((b) => b.r > 0)

    // 5. enemies fall, weave, split, drop, hit ground
    for (const e of g.enemies) {
        if (!e.alive) continue
        e.t++
        e.px += e.vx
        e.y += e.vy
        e.x = e.px + (e.amp ? Math.sin(e.t * 0.07) * e.amp : 0)

        if (e.kind === 'bomber') {
            for (const d of e.drops) {
                if (!d.done && g.playT - e.spawnAt >= d.t) {
                    d.done = true
                    const tx = resolveTarget(g, d.ti)
                    const spd = 230
                    pushEnemy(g, {
                        kind: 'icbm', x: e.x, px: e.x, y: e.y,
                        vx: (tx - e.x) / spd, vy: (CFG.groundY - e.y) / spd,
                        ti: d.ti, split: null, amp: 0, drops: null,
                        spawnAt: g.playT, score: CFG.score.icbm,
                    })
                    g.events.push({ type: 'drop', x: Math.round(e.x), y: Math.round(e.y), tick: g.tick })
                }
            }
            if (e.x < -30 || e.x > W + 30) { e.alive = false; g.events.push({ type: 'escape', kind: 'bomber', tick: g.tick }) }
            continue
        }

        if (e.split && !e.split.done && e.y >= e.split.y) {
            e.split.done = true
            e.alive = false
            for (let k = 0; k < e.split.n; k++) spawnChild(g, e, k)
            g.events.push({ type: 'split', x: Math.round(e.x), y: Math.round(e.y), n: e.split.n, tick: g.tick })
            continue
        }

        if (e.y >= CFG.groundY) {
            e.alive = false
            if (e.ti >= 0 && e.ti < 6 && g.cities[e.ti].alive) {
                g.cities[e.ti].alive = false
                g.events.push({ type: 'cityHit', x: CITIES[e.ti], tick: g.tick })
            } else if (e.ti >= 6 && g.bases[e.ti - 6].alive) {
                g.bases[e.ti - 6].alive = false
                g.bases[e.ti - 6].ammo = 0
                g.events.push({ type: 'baseHit', x: BASES[e.ti - 6], tick: g.tick })
            } else {
                g.events.push({ type: 'dud', x: Math.round(e.x), tick: g.tick })
            }
            addBlast(g, e.x, CFG.groundY - 2, CFG.blastR * 0.8)
            if (g.cities.every((c) => !c.alive)) {
                g.end = 'lose'
                g.events.push({ type: 'lose', tick: g.tick })
                return g
            }
        }
    }
    g.enemies = g.enemies.filter((e) => e.alive)

    // 6. wave clear: script spent, sky empty — the classic rebuilds the
    //    cities between waves, which is what makes every wave a closed,
    //    re-solvable puzzle for the slack rule in the harness
    if (g.queue.length === 0 && g.enemies.length === 0 && g.blasts.length === 0 && g.intc.length === 0) {
        const ammo = g.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0)
        const cities = g.cities.filter((c) => c.alive).length
        g.score += ammo * 5 + cities * 10
        g.phase = 'clear'; g.pT = CFG.clearLen
        g.events.push({ type: 'clear', wave: g.wave, ammo, cities, score: g.score, tick: g.tick })
    }

    return g
}
