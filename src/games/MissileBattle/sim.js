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
    // #2473: a duo defender mans TWO tubes against the same named barrage the
    // solo three tubes answer — the sector budget adds this offset per tube so
    // the mirrored wave stays holdable. One knob: the harness slack loop
    // lowers ammoWave and the duo budget follows, keeping the slack rule real.
    duoAmmo: 6,
    // #2473 switches so --mutate can prove each duo law load-bearing: the
    // alternating gate, the sector retarget, and the per-seat ledger.
    seatGate: true,
    retargetOn: true,
    ledgerOn: true,
    spans: [[0, 104], [40, 216], [152, 256]],
    // JINK (#2375): the smart bomb reads the sky for a short-fused detonation
    // bearing down on it and commits sideways, away from the blast point. One
    // committed escape per bomb, then the jink is spent for its lifetime — the
    // arcade lesson: the yellow bomb makes you EARN the kill (feint, then lead
    // the escape). Deterministic: same sky, same jink, every replay.
    dodge: { r: 30, horizon: 26, v: 1.1, ticks: 14, cool: 20, budget: 1 },
    dodgeOn: true,
    // ESCALATION (#2379): by the GRAND BARRAGE the jink commits FURTHER and
    // LONGER — the longer, faster streak you see is the tell. Two late
    // veteran bombs (waves.js `jinks: 2`) hold a second escape: the wave-3
    // answer to a bomb is no longer memorised at round one. SATURATION still
    // teaches the plain escape, so the player meets the menagerie in order.
    // A bomb whose last escape ends flashes NAKED (`spent` event).
    dodgeEsc: { wave: 2, budget: 1, ticks: 18, v: 1.35, cool: 24 },
}


// ti indexes TARGETS; a dead target keeps its column (the impact reads as a
// dud on the rubble — legality never depends on a living victim).
const resolveTarget = (g, ti) => TARGETS[ti] ?? (void g, 128)

// ---- two-player ownership (#2473 — the arcade's alternating batteries) ----
// The map splits into sectors: P1 holds the west (cities 0-2 + the west
// battery), P2 the east (cities 3-5 + the east battery); the middle battery
// is the shared reserve that EITHER defender mans. Solo play never consults
// any of this (every helper short-circuits on !g.twoP), so the frozen solo
// hashes cannot move.
export const SEAT_OF_CITY = [1, 1, 1, 2, 2, 2]
export const SEAT_OF_BASE = [1, 0, 2]        // 0 = shared reserve

// Which seat may FIRE battery i this wave: its own seat, the shared reserve,
// or — once a player's sector has fallen — everything, because the survivor
// mans all six tubes (the arcade's carry-the-flag rescue).
export const seatOwnsBase = (g, i) => {
    if (!g.twoP || CFG.seatGate === false) return true
    const s = SEAT_OF_BASE[i]
    if (s === 0 || s === g.seat) return true
    return g.out[s - 1] === true     // the owner sector has fallen — the survivor mans it
}

// A wave belongs to a seat; an eliminated seat's turn passes to the survivor.
const seatForWave = (g, wave) => {
    const s = (wave % 2) + 1
    return g.out[s] ? (s === 1 ? 2 : 1) : s
}

// Retarget one script entry onto the active seat's sector by mirroring its
// column: city k lands in slot k%3 of the defender's three cities; the
// west/east batteries map to the defender's own battery; the shared reserve
// stays central. Each warhead then SPAWNS on the defender's own side of the
// map (W - x0 flip — the scripts' mirror pairs sum to 256), so a seat's
// wave is the same named script folded into its sector, not a diagonal the
// solo economy was never tuned against. Bombers keep cruising across.
const SECTOR_TI = {
    1: [0, 1, 2, 0, 1, 2, 6, 7, 6],
    2: [3, 4, 5, 3, 4, 5, 8, 7, 8],
}
const retarget = (entry, seat) => {
    const ti = entry.ti ?? -1
    const out = { ...entry, ti: ti >= 0 ? SECTOR_TI[seat][ti] : -1 }
    const x0 = entry.x0 ?? 0
    if (x0 > 128 && seat === 1) {
        out.x0 = W - x0
        if (entry.kind === 'bomber') out.vx = -entry.vx
    } else if (x0 < 128 && seat === 2) {
        out.x0 = W - x0
        if (entry.kind === 'bomber') out.vx = -entry.vx
    }
    if (entry.drops) out.drops = entry.drops.map((d) => ({ ...d, ti: d.ti >= 0 ? SECTOR_TI[seat][d.ti] : -1 }))
    if (entry.split) out.split = { ...entry.split }
    return out
}

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
    e.id = g.nextId++
    e.t = 0
    e.alive = true
    g.enemies.push(e)
    return e
}

function spawnEnemy(g, spec) {
    const tx = resolveTarget(g, spec.ti)
    const vy = spec.kind === 'bomber' ? 0 : (CFG.groundY + 4) / spec.spd
    const vx = spec.kind === 'bomber' ? spec.vx : (tx - spec.x0) / spec.spd
    if (!(vy <= CFG.maxVY) || !Number.isFinite(vy) || !Number.isFinite(vx) || !Number.isFinite(spec.x0) ||
        (spec.kind === 'bomber' && !(spec.y > 0 && spec.y < CFG.killLine))) {
        throw new Error(`wave script unusable: kind ${spec.kind} spd ${spec.spd} x0 ${spec.x0} y ${spec.y}`)
    }
    const e = pushEnemy(g, {
        kind: spec.kind, x: spec.x0, px: spec.x0,
        // a bomber cruises at its SCRIPTED altitude — the arcade's bomber is a
        // visible, hittable target (#2306: y:-4 for all kinds made bombers
        // invisible and effectively invulnerable, and the audit read spec.y
        // blindly so the lie survived the gate)
        y: spec.kind === 'bomber' ? spec.y : -4,
        vx, vy,
        ti: spec.ti ?? -1,
        split: spec.split ? { ...spec.split, done: false } : null,
        amp: spec.amp || 0,
        drops: spec.drops ? spec.drops.map((d) => ({ ...d, done: false })) : null,
        jinks: spec.jinks ?? null,   // #2379: a script may promote a bomb to a multi-escape veteran
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
    const ti = parent.ti >= 0 && parent.ti < 6 && g.cities[parent.ti].alive
        ? parent.ti
        : nearestTarget(g, parent.x)
    const tgt = ti >= 0 ? TARGETS[ti] : parent.x
    const tx0 = Math.max(2, Math.min(W - 2, tgt + (k - (n - 1) / 2) * 10))
    const spd = parent.split.spd * (1 + (k - (n - 1) / 2) * 0.16)
    const vy = (CFG.groundY - parent.y) / spd
    return pushEnemy(g, {
        kind: 'icbm', x: parent.x, px: parent.x, y: parent.y,
        vx: (tx0 - parent.x) / spd, vy,
        ti, split: null, amp: 0, drops: null,
        spawnAt: g.playT, score: CFG.score.icbm,
    })
}

function fire(g, tx, ty) {
    tx = Math.max(2, Math.min(W - 2, tx))
    ty = Math.max(CFG.aimMinY, Math.min(CFG.aimMaxY, ty))
    let bi = -1, bd = 1e9, spanHit = false
    g.bases.forEach((b, i) => {
        if (!b.alive || b.ammo <= 0) return
        const [a, z] = CFG.spans[i]
        if (tx < a || tx > z) return
        spanHit = true
        if (!seatOwnsBase(g, i)) return
        const d = Math.abs(b.x - tx)
        if (d < bd) { bd = d; bi = i }
    })
    if (bi < 0) {
        // the arcade's alternating battery says NO in its own voice: firing
        // across the sector line is a refusal, not an empty tube (#2473).
        // Solo keeps its exact event shape — only duo annotates the seat.
        g.events.push(g.twoP && spanHit
            ? { type: 'denySeat', x: Math.round(tx), y: Math.round(ty), seat: g.seat, tick: g.tick }
            : { type: 'deny', x: Math.round(tx), y: Math.round(ty), tick: g.tick })
        return false
    }
    const b = g.bases[bi]
    b.ammo--
    const sx = b.x, sy = CFG.groundY + 8
    const eta = Math.max(1, Math.round(Math.hypot(tx - sx, ty - sy) / CFG.ivSpeed))
    g.intc.push({ id: g.nextId++, x: sx, y: sy, tx, ty, vx: (tx - sx) / eta, vy: (ty - sy) / eta, eta, t: 0, bat: bi })
    g.fired++
    g.firedBy[bi]++
    g.events.push({ type: 'ifire', x: sx, y: sy, tx: Math.round(tx), ty: Math.round(ty), bat: bi, tick: g.tick })
    return true
}

function addBlast(g, x, y, r, chain = false, src = 'iv') {
    if (g.blasts.length >= CFG.maxBlasts) g.blasts.shift()
    // a blast is born ALREADY breathing: r=0 would be filtered out before
    // its first growth tick — a chain blast born invisible never kills
    g.blasts.push({ x, y, r: CFG.blastGrow, rMax: r, age: 0, state: 'grow', chain, src })
}

const freshWave = (g, wave) => {
    g.wave = wave
    g.seat = g.twoP ? seatForWave(g, wave) : 0
    g.cities = CITIES.map((x) => ({ x, alive: true }))
    const ammo = g.twoP ? CFG.ammoWave + CFG.duoAmmo : CFG.ammoWave
    g.bases = BASES.map((x) => ({ x, ammo, alive: true }))
    g.enemies = []; g.intc = []; g.blasts = []
    // duo: the same named script, retargeted onto the defender's sector (§2
    // of the #2473 law) — the barrage itself is never re-authored, only the
    // columns it falls on alternate with the seat.
    g.queue = structuredClone(WAVES[wave].entries).map((e) => (g.twoP && CFG.retargetOn ? retarget(e, g.seat) : e))
    g.fired = 0; g.firedBy = [0, 0, 0]; g.kills = 0
    g.phase = 'banner'; g.pT = CFG.bannerLen
    g.events.push(g.twoP ? { type: 'banner', wave, seat: g.seat, tick: g.tick } : { type: 'banner', wave, tick: g.tick })
}

export function makeGame(wave = 0, opts = {}) {
    const g = {
        tick: 0, playT: 0, wave: 0, phase: 'banner', pT: CFG.bannerLen,
        score: 0, end: null,
        cities: [], bases: [], aim: { x: 128, y: 90 },
        fireHeld: false, fired: 0, firedBy: [0, 0, 0], kills: 0, nextId: 1,
        enemies: [], intc: [], blasts: [], queue: [], events: [],
        // #2473 — two-player alternating batteries. Solo (the default) never
        // consults these fields; the seat rides on events and the hash only
        // when twoP is on, so the frozen solo hashes cannot move.
        twoP: !!opts.twoP, cpu: opts.cpu || [false, false], seat: 0,
        pscore: [0, 0], out: [false, false],
    }
    freshWave(g, wave)
    return g
}

export const stateHash = (g) => {
    const r1 = (n) => Math.round(n * 10)
    return [
        g.tick, g.wave, g.phase, g.end, g.score,
        // the two-player ledger rides the hash ONLY when duo is on — solo
        // replay hashes cannot move (#2473, same opt-in pattern as amoExt)
        ...(g.twoP ? [`D${g.seat}${g.pscore[0]}-${g.pscore[1]}${g.out[0] ? 'x' : ''}${g.out[1] ? 'x' : ''}`] : []),
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
                const pts = b.chain ? CFG.score.chain : e.score
                g.score += pts
                if (g.twoP && CFG.ledgerOn) g.pscore[g.seat - 1] += pts   // the defender of the wave bags the kill
                g.kills++
                g.events.push(g.twoP
                    ? { type: 'kill', kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), pts, chain: !!b.chain, seat: g.seat, tick: g.tick }
                    : { type: 'kill', kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), pts, chain: !!b.chain, tick: g.tick })
                if (CFG.chainR > 0) chains.push([e.x, e.y])
            }
        }
    }
    for (const [x, y] of chains) addBlast(g, x, y, CFG.blastR * CFG.chainR, true, 'chain')
    g.blasts = g.blasts.filter((b) => b.r > 0)

    // 5. enemies fall, weave, split, drop, hit ground
    for (const e of g.enemies) {
        if (!e.alive) continue
        e.t++
        // JINK (#2375): a smart bomb dodges a short-fused blast that will
        // arrive on top of it — away from the detonation point, committed for
        // CFG.dodge.ticks, once per bomb (then a cooldown; when the budget is
        // spent the weave is naked again). The first interceptor learns where
        // it runs; the next one is aimed there. Pure geometry, no luck.
        if (e.kind === 'smart' && CFG.dodgeOn) {
            if (e.dodgeT === undefined) {
                e.dodgeT = 0; e.dodgeCool = 0
                // #2379 escalation: late-wave bombs play by the tougher table.
                e.esc = CFG.dodgeEsc && g.wave >= CFG.dodgeEsc.wave ? CFG.dodgeEsc : CFG.dodge
                e.dodgeLeft = e.jinks != null ? e.jinks : e.esc.budget
            }
            if (e.dodgeT > 0) {
                e.dodgeT--
                e.px += e.dodgeDir * e.esc.v
                if (e.dodgeT === 0) {
                    e.dodgeLeft--; e.dodgeCool = e.esc.cool ?? CFG.dodge.cool
                    // the last escape ends: visibly naked from here on
                    if (e.dodgeLeft === 0) g.events.push({ type: 'spent', x: Math.round(e.x), y: Math.round(e.y), tick: g.tick })
                }
            } else {
                if (e.dodgeCool > 0) e.dodgeCool--
                if (e.dodgeLeft > 0 && e.dodgeCool === 0) {
                    let bd = CFG.dodge.r, dir = 0
                    for (const m of g.intc) {
                        const rem = m.eta - m.t
                        if (rem < 1 || rem > CFG.dodge.horizon) continue
                        const dx = e.x - m.tx, dy = e.y - m.ty
                        const d = Math.hypot(dx, dy)
                        if (d < bd) { bd = d; dir = dx >= 0 ? 1 : -1 }
                    }
                    if (dir !== 0) {
                        e.dodgeDir = dir
                        e.dodgeT = e.esc.ticks
                        g.events.push({ type: 'jink', x: Math.round(e.x), y: Math.round(e.y), dir, left: e.dodgeLeft - 1, tick: g.tick })
                    }
                }
            }
        }
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
            let src = 'dud'
            if (e.ti >= 0 && e.ti < 6 && g.cities[e.ti].alive) {
                g.cities[e.ti].alive = false
                g.events.push(g.twoP
                    ? { type: 'cityHit', x: CITIES[e.ti], seat: SEAT_OF_CITY[e.ti], tick: g.tick }
                    : { type: 'cityHit', x: CITIES[e.ti], tick: g.tick })
                src = 'city'
                // #2473 — a sector whose three cities all fall is OUT: the
                // survivor mans every battery from the next wave (rescue).
                if (g.twoP && !g.out[SEAT_OF_CITY[e.ti] - 1] &&
                    !g.cities.some((c, i) => c.alive && SEAT_OF_CITY[i] === SEAT_OF_CITY[e.ti])) {
                    g.out[SEAT_OF_CITY[e.ti] - 1] = true
                    g.events.push({ type: 'seatOut', seat: SEAT_OF_CITY[e.ti], tick: g.tick })
                }
            } else if (e.ti >= 6 && g.bases[e.ti - 6].alive) {
                g.bases[e.ti - 6].alive = false
                g.bases[e.ti - 6].ammo = 0
                g.events.push({ type: 'baseHit', x: BASES[e.ti - 6], tick: g.tick })
                src = 'base'
            } else {
                g.events.push({ type: 'dud', x: Math.round(e.x), tick: g.tick })
            }
            // the plume carries the MATERIAL it burned through (#2379): a city
            // plume, a battery spark and a rubble puff are not the same fire.
            addBlast(g, e.x, CFG.groundY - 2, CFG.blastR * 0.8, false, src)
            // duo: two sectors dark is the map dark; one standing city — on
            // either banner — keeps the war alive.
            const dark = g.twoP ? g.out[0] && g.out[1] : g.cities.every((c) => !c.alive)
            if (dark) {
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
        if (g.twoP && CFG.ledgerOn) {
            // per-seat bonus: your tubes, your cities; the shared reserve is
            // credited to whoever defended the wave (it only ever fired for
            // them); a fallen sector's tubes are credited to the survivor who
            // mans them from here on.
            for (const s of [1, 2]) {
                if (g.out[s - 1]) continue
                let a = 0, c = 0
                g.bases.forEach((b, i) => {
                    if (!b.alive) return
                    const o = SEAT_OF_BASE[i]
                    if (o === s || (o === 0 && g.seat === s) || (o > 0 && o !== s && g.out[o - 1])) a += b.ammo
                })
                g.cities.forEach((cc, i) => { if (cc.alive && SEAT_OF_CITY[i] === s) c++ })
                g.pscore[s - 1] += a * 5 + c * 10
            }
        }
        g.phase = 'clear'; g.pT = CFG.clearLen
        g.events.push(g.twoP
            ? { type: 'clear', wave: g.wave, ammo, cities, score: g.score, seat: g.seat, pscore: g.pscore.slice(), tick: g.tick }
            : { type: 'clear', wave: g.wave, ammo, cities, score: g.score, tick: g.tick })
    }

    return g
}
