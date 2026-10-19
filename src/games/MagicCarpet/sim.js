export const W = 320
export const H = 200
export const HUD_H = 28
export const MAP = 512
export const GRID = 64
export const CELL = MAP / GRID
export const WATER = 14
export const SANDL = 20
export const GRASSL = 54
export const ROCKL = 74
export const QUOTA = 180
export const HORIZON = 92

export const CFG = {
    speed: 2.0, climb: 0.75, turn: 0.052, focal: 260,
    
}

export const SPILLS = [
    { id: 'fireball', name: 'FIREBALL', cost: 15 },
    { id: 'lightning', name: 'LIGHTNING', cost: 25 },
    { id: 'heal', name: 'HEAL', cost: 20 },
    { id: 'protect', name: 'PROTECTION', cost: 25 },
    { id: 'slow', name: 'SLOW TIME', cost: 30 },
    { id: 'telekinesis', name: 'TELEKINESIS', cost: 12 },
]
export const spellById = (id) => SPILLS.find((s) => s.id === id)
export const OFFENSE = { fireball: 1, lightning: 1, telekinesis: 1 }

const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const wrap = (v, m) => ((v % m) + m) % m
const wrapD = (v) => wrap(v + MAP / 2, MAP) - MAP / 2

export function rnd(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = gs.rngState
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const noiseNodes = (N, r) => Array.from({ length: N * N }, () => r())
const sampleNodes = (g, N, x, y) => {
    const fx = wrap(x, 1) * N, fy = wrap(y, 1) * N
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = smooth(fx - x0), ty = smooth(fy - y0)
    const i0 = wrap(x0, N), i1 = wrap(x0 + 1, N), j0 = wrap(y0, N), j1 = wrap(y0 + 1, N)
    return lerp(lerp(g[j0 * N + i0], g[j0 * N + i1], tx), lerp(g[j1 * N + i0], g[j1 * N + i1], tx), ty)
}

function genHeights(r) {
    const L = [[4, 42], [8, 24], [16, 11], [32, 5]]
    const grids = L.map(([N]) => noiseNodes(N, r))
    const cones = Array.from({ length: 3 }, () => ({
        cx: r(), cy: r(), h: 42 + r() * 44, w: 0.06 + r() * 0.07,
    }))
    const h = new Array(GRID * GRID)
    for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
            const u = i / GRID, v = j / GRID
            let e = -18
            for (let k = 0; k < L.length; k++) e += sampleNodes(grids[k], L[k][0], u, v) * L[k][1]
            for (const c of cones) {
                const du = Math.abs(wrap(u - c.cx + 0.5, 1) - 0.5)
                const dv = Math.abs(wrap(v - c.cy + 0.5, 1) - 0.5)
                const d = Math.sqrt(du * du + dv * dv)
                if (d < c.w) e += (1 - d / c.w) * c.h
            }
            h[j * GRID + i] = Math.max(0, Math.min(96, e))
        }
    }
    return h
}

export function sampleH(gs, x, y) {
    const gx = wrap(x, MAP) / CELL, gy = wrap(y, MAP) / CELL
    const x0 = Math.floor(gx), y0 = Math.floor(gy)
    const tx = gx - x0, ty = gy - y0
    const i0 = wrap(x0, GRID), i1 = wrap(x0 + 1, GRID), j0 = wrap(y0, GRID), j1 = wrap(y0 + 1, GRID)
    return lerp(
        lerp(gs.heights[j0 * GRID + i0], gs.heights[j0 * GRID + i1], tx),
        lerp(gs.heights[j1 * GRID + i0], gs.heights[j1 * GRID + i1], tx),
        ty,
    )
}

const findSpot = (gs, minH, maxH, flat, away, minAway) => {
    for (let tries = 0; tries < 800; tries++) {
        const x = rnd(gs) * MAP, y = rnd(gs) * MAP
        const h = sampleH(gs, x, y)
        if (h < minH || h > maxH) continue
        let ok = true
        if (flat) {
            for (const [dx, dy] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
                if (Math.abs(sampleH(gs, x + dx, y + dy) - h) > 5) { ok = false; break }
            }
        }
        if (!ok) continue
        if (away) {
            const d = Math.hypot(wrapD(x - away.x), wrapD(y - away.y))
            if (d < minAway) continue
        }
        return { x, y }
    }
    return { x: MAP / 2, y: MAP / 2 }
}

const BOUNTY = { giant: 18, wolf: 6, cow: 2 }

export function makeGame(seed) {
    const gs = {
        seed: seed >>> 0, rngState: seed >>> 0, tick: 0, end: null,
        x: 0, y: 0, alt: 34, yaw: 0,
        hp: 100, shield: 0, mana: 0, deaths: 0,
        kills: 0, wizardKills: 0,
        castle: null, castleStage: 0,
        wizard: null, pearls: [], books: [], monsters: [], projs: [], fireMarks: [],
        learned: ['fireball'], hands: { L: 'fireball', R: null },
        coolL: 0, coolR: 0, heldEnt: null, holdT: 0,
        wizSlow: 0, wizFire: 40, spawnCool: 360, guardFire: 45,
        heights: null, events: [], score: 0,
    }
    gs.heights = genHeights((() => {
        let s = gs.rngState
        return () => { gs.rngState = (gs.rngState + 0x6D2B79F5) | 0; let t = gs.rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    })())
    gs.rngState = seed >>> 0

    const cs = findSpot(gs, 26, 44, true, null, 0)
    gs.castle = { x: cs.x, y: cs.y }
    gs.x = wrap(cs.x + 40, MAP); gs.y = wrap(cs.y + 40, MAP)
    const ts = findSpot(gs, 24, 48, true, gs.castle, 140)
    gs.wizard = { x: ts.x, y: ts.y, tx: ts.x, ty: ts.y, hp: 60, mana: 90, alive: true, ang: rnd(gs) * 6.28 }

    const bs = []
    for (const sp of SPILLS) {
        let p = null
        for (let k = 0; k < 60; k++) {
            const c = findSpot(gs, 24, 50, false, null, 0)
            if (!bs.some((b) => Math.hypot(wrapD(c.x - b.x), wrapD(c.y - b.y)) < 70) &&
                Math.hypot(wrapD(c.x - gs.castle.x), wrapD(c.y - gs.castle.y)) > 45) { p = c; break }
        }
        gs.books.push({ id: sp.id, x: p.x, y: p.y, taken: idTaken(sp.id, gs.learned), cd: 0 })
        bs.push(p)
    }

    for (let i = 0; i < 56; i++) {
        const x = rnd(gs) * MAP, y = rnd(gs) * MAP
        const z = Math.max(sampleH(gs, x, y), WATER) + [2, 2, 6, 12][Math.floor(rnd(gs) * 4)]
        gs.pearls.push({ x, y, z, m: 2 + Math.floor(rnd(gs) * 5), alive: true })
    }
    for (let i = 0; i < 2; i++) spawnMon(gs, 'giant', gs.castle, 90)
    for (let i = 0; i < 4; i++) spawnMon(gs, 'wolf', gs.castle, 90)
    for (let i = 0; i < 4; i++) spawnMon(gs, 'cow', gs.castle, 70)
    for (let i = 0; i < 7; i++) {
        const c = findSpot(gs, 26, 46, false, null, 0)
        gs.huts = (gs.huts || []).concat([{ x: c.x, y: c.y, v: Math.floor(rnd(gs) * 3) }])
    }
    return gs
}
const idTaken = (id, learned) => learned.includes(id)

function spawnMon(gs, kind, away, minD) {
    const p = findSpot(gs, kind === 'giant' ? 24 : 20, kind === 'cow' ? 46 : 60, false, away || null, minD || 0)
    gs.monsters.push({
        kind, x: p.x, y: p.y, hp: kind === 'giant' ? 30 : kind === 'wolf' ? 8 : 4,
        dir: rnd(gs) * 6.28, cool: Math.floor(rnd(gs) * 40), wanderT: 0,
    })
}

function dropPearls(gs, x, y, bounty) {
    let left = bounty
    while (left > 0) {
        const m = Math.min(left, 1 + Math.floor(rnd(gs) * 3))
        const a = rnd(gs) * 6.28, d = 2 + rnd(gs) * 6
        const px = wrap(x + Math.cos(a) * d, MAP), py = wrap(y + Math.sin(a) * d, MAP)
        gs.pearls.push({ x: px, y: py, z: Math.max(sampleH(gs, px, py), WATER) + 2, m, alive: true })
        left -= m
    }
}

function lookPoint(gs) {
    let d = 55
    for (let t = 6; t <= 70; t += 2) {
        const z = gs.alt - t * 0.08
        if (sampleH(gs, wrap(gs.x + Math.cos(gs.yaw) * t, MAP), wrap(gs.y + Math.sin(gs.yaw) * t, MAP)) > z) { d = t; break }
    }
    return {
        x: wrap(gs.x + Math.cos(gs.yaw) * d, MAP),
        y: wrap(gs.y + Math.sin(gs.yaw) * d, MAP),
        d,
    }
}

const entZ = (gs, x, y) => Math.max(sampleH(gs, x, y), WATER) + 4

function hurtPlayer(gs, dmg) {
    if (gs.shield > 0) { gs.shield = Math.max(0, gs.shield - dmg); gs.events.push({ type: 'shieldHit' }); return }
    gs.hp -= dmg
    gs.events.push({ type: 'hurt', dmg })
    if (gs.hp <= 0) {
        if (gs.mana > 0) {
            gs.deaths++
            gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = 34; gs.hp = 100; gs.shield = 150
            gs.events.push({ type: 'respawn' })
        } else {
            gs.hp = 0
            gs.end = 'dead'
            gs.events.push({ type: 'dead' })
        }
    }
}

function killEntity(gs, mo, i) {
    gs.monsters.splice(i, 1)
    gs.kills++
    dropPearls(gs, mo.x, mo.y, BOUNTY[mo.kind])
    gs.events.push({ type: 'kill', kind: mo.kind, x: mo.x, y: mo.y })
    if (gs.heldEnt && gs.heldEnt.ref === mo) { gs.heldEnt = null; gs.holdT = 0 }
}

function castHand(gs, hand) {
    const id = gs.hands[hand]
    const cool = hand === 'L' ? gs.coolL : gs.coolR
    if (!id || cool > 0) { if (id) gs.events.push({ type: 'deny' }); return }
    const sp = spellById(id)
    if (gs.mana < sp.cost) { gs.events.push({ type: 'nomana' }); return }
    gs.mana -= sp.cost
    if (hand === 'L') gs.coolL = 18; else gs.coolR = 18
    gs.events.push({ type: 'cast', hand, id })
    if (id === 'fireball') {
        gs.projs.push({ kind: 'fireball', from: 'p', x: gs.x, y: gs.y, z: gs.alt - 2, vz: -0.12, vx: Math.cos(gs.yaw) * 3.2, vy: Math.sin(gs.yaw) * 3.2, dmg: 14, life: 60 })
    } else if (id === 'lightning') {
        const lp = lookPoint(gs)
        const struck = []
        let best = -1, bestD = 14
        gs.monsters.forEach((m, i) => { const d = Math.hypot(wrapD(m.x - lp.x), wrapD(m.y - lp.y)); if (d < bestD) { bestD = d; best = i } })
        if (gs.wizard.alive) {
            const d = Math.hypot(wrapD(gs.wizard.x - lp.x), wrapD(gs.wizard.y - lp.y))
            if (d < 18) struck.push({ tgt: 'wiz', dmg: 26 })
        }
        if (best >= 0) struck.push({ tgt: 'mon', i: best, dmg: 26 })
        gs.monsters.forEach((m, i) => {
            if (i === best) return
            const d = Math.hypot(wrapD(m.x - lp.x), wrapD(m.y - lp.y))
            if (d < 24) struck.push({ tgt: 'mon', i, dmg: 12 })
        })
        gs.events.push({ type: 'zap', x: lp.x, y: lp.y, d: lp.d })
        for (const s of struck) {
            if (s.tgt === 'wiz') { gs.wizard.hp -= s.dmg; gs.events.push({ type: 'wizHit' }) }
        }
        const idxs = struck.filter((s) => s.tgt === 'mon').map((s) => s.i).sort((a, b) => b - a)
        const dead = []
        for (const i of idxs) { gs.monsters[i].hp -= struck.find((s) => s.i === i).dmg; if (gs.monsters[i].hp <= 0) dead.push(i) }
        for (const i of [...new Set(dead)].sort((a, b) => b - a)) killEntity(gs, gs.monsters[i], i)
    } else if (id === 'heal') {
        gs.hp = Math.min(100, gs.hp + 30)
    } else if (id === 'protect') {
        gs.shield = 150
    } else if (id === 'slow') {
        gs.wizSlow = 300
    } else if (id === 'telekinesis') {
        if (gs.heldEnt) {
            const e = gs.heldEnt
            const ei = gs.monsters.indexOf(e.ref)
            if (ei >= 0) gs.monsters.splice(ei, 1)
            gs.projs.push({ kind: 'throw', ekind: e.kind, from: 'p', x: gs.x, y: gs.y, z: gs.alt, vz: -0.12, vx: Math.cos(gs.yaw) * 3.4, vy: Math.sin(gs.yaw) * 3.4, dmg: 26, life: 70 })
            gs.heldEnt = null; gs.holdT = 0
        } else {
            let bi = -1, bd = 14
            gs.monsters.forEach((m, i) => { const d = Math.hypot(wrapD(m.x - gs.x), wrapD(m.y - gs.y)); if (d < bd) { bd = d; bi = i } })
            if (bi >= 0) {
                gs.heldEnt = { ref: gs.monsters[bi], kind: gs.monsters[bi].kind }
                gs.heldEnt.ref.grabbed = true
                gs.holdT = 180
            } else gs.events.push({ type: 'emptygrab' })
        }
    }
}

function applySplash(gs, x, y, dmg) {
    let hit = false
    if (gs.wizard.alive && Math.hypot(wrapD(gs.wizard.x - x), wrapD(gs.wizard.y - y)) < 13) {
        gs.wizard.hp -= dmg; hit = true
        gs.events.push({ type: 'wizHit' })
    }
    const dead = []
    gs.monsters.forEach((m, i) => {
        if (Math.hypot(wrapD(m.x - x), wrapD(m.y - y)) < 11) { m.hp -= dmg; hit = true; if (m.hp <= 0) dead.push(i) }
    })
    for (const i of [...new Set(dead)].sort((a, b) => b - a)) killEntity(gs, gs.monsters[i], i)
    return hit
}

export function setHand(gs, hand, id) {
    if (!gs.learned.includes(id)) return false
    gs.hands[hand] = id
    gs.events.push({ type: 'equip', hand, id })
    return true
}

export function cycleR(gs) {
    const list = gs.learned
    if (!list.length) return
    const i = list.indexOf(gs.hands.R)
    setHand(gs, 'R', list[(i + 1) % list.length])
}

export function step(gs, inp) {
    gs.tick++
    if (gs.end) return
    if (gs.coolL > 0) gs.coolL--
    if (gs.coolR > 0) gs.coolR--
    if (gs.shield > 0) gs.shield--
    if (gs.wizSlow > 0) gs.wizSlow--
    if (gs.holdT > 0 && gs.heldEnt) { gs.holdT--; if (gs.holdT === 0) { gs.heldEnt.ref.grabbed = false; gs.heldEnt = null } }

    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
    const vert = (inp.up ? 1 : 0) - (inp.down ? 1 : 0)
    gs.yaw += steer * CFG.turn
    const v = CFG.speed * (1 - 0.78 * Math.abs(steer))
    gs.x = wrap(gs.x + Math.cos(gs.yaw) * v, MAP)
    gs.y = wrap(gs.y + Math.sin(gs.yaw) * v, MAP)
    gs.alt += vert * CFG.climb
    const aheadH = Math.max(
        sampleH(gs, gs.x + Math.cos(gs.yaw) * 14, gs.y + Math.sin(gs.yaw) * 14),
        sampleH(gs, gs.x + Math.cos(gs.yaw) * 26, gs.y + Math.sin(gs.yaw) * 26),
    )
    if (aheadH + 4 > gs.alt) gs.alt = Math.min(gs.alt + CFG.climb, aheadH + 4)
    gs.alt = Math.max(Math.max(WATER + 3, sampleH(gs, gs.x, gs.y) + 1.6), Math.min(120, gs.alt))

    if (inp.castL || inp.a) castHand(gs, 'L')
    if (inp.castR || inp.b) castHand(gs, 'R')

    for (const p of gs.pearls) {
        if (!p.alive) continue
        const dxp = wrapD(gs.x - p.x), dyp = wrapD(gs.y - p.y)
        const dp = Math.hypot(dxp, dyp)
        if (dp < 16) {
            p.x = wrap(p.x + dxp / Math.max(3, dp) * Math.min(1.6, dp * 0.3), MAP)
            p.y = wrap(p.y + dyp / Math.max(3, dp) * Math.min(1.6, dp * 0.3), MAP)
            p.z = lerp(p.z, gs.alt, 0.18)
        }
        if (dp < 6 && Math.abs(p.z - gs.alt) < 14) {
            p.alive = false
            gs.mana += p.m
            gs.events.push({ type: 'bank', m: p.m })
        }
    }

    for (const b of gs.books) {
        if (b.cd > 0) b.cd--
        if (!b.taken && Math.hypot(wrapD(b.x - gs.x), wrapD(b.y - gs.y)) < 8 && Math.abs(gs.alt - (sampleH(gs, b.x, b.y) + 4)) < 16) {
            b.cd = 90
            if (rnd(gs) < 0.8) {
                b.taken = true
                gs.learned.push(b.id)
                gs.events.push({ type: 'learn', id: b.id })
                if (!gs.hands.R) setHand(gs, 'R', b.id)
                else if (!gs.hands.L) setHand(gs, 'L', b.id)
            } else {
                gs.events.push({ type: 'fizzle' })
            }
        }
    }

    if (Math.hypot(wrapD(gs.castle.x - gs.x), wrapD(gs.castle.y - gs.y)) < CFG.castleR) {
        if (gs.hp < 100) gs.hp = Math.min(100, gs.hp + 1.2)
    }
    {
        const stages = [0, 30, 70, 120, 180]
        const st = stages.filter((q) => gs.mana >= q).length - 1
        if (st > gs.castleStage) { gs.castleStage = st; gs.events.push({ type: 'stage', n: st }) }
        if (gs.mana >= QUOTA) { gs.end = 'win'; gs.events.push({ type: 'win' }) }
    }

    const wz = gs.wizard
    if (wz.alive) {
        wz.ang += (gs.wizSlow > 0 ? 0.004 : 0.012)
        wz.x = wrap(wz.tx + Math.cos(wz.ang) * 34, MAP)
        wz.y = wrap(wz.ty + Math.sin(wz.ang) * 34, MAP)
        for (const p of gs.pearls) {
            if (!p.alive) continue
            const d = Math.hypot(wrapD(p.x - wz.x), wrapD(p.y - wz.y))
            if (d < 45) {
                p.x = wrap(p.x + wrapD(wz.x - p.x) / Math.max(6, d), MAP)
                p.y = wrap(p.y + wrapD(wz.y - p.y) / Math.max(6, d), MAP)
                p.z = lerp(p.z, entZ(gs, wz.x, wz.y) + 2, 0.1)
                if (d < 5) { p.alive = false; wz.mana += p.m; gs.events.push({ type: 'absorb', m: p.m }) }
            }
        }
        gs.wizFire--
        const pd = Math.hypot(wrapD(gs.x - wz.x), wrapD(gs.y - wz.y))
        if (gs.wizFire <= 0 && pd < 75) {
            gs.wizFire = gs.wizSlow > 0 ? 150 : 55
            const a = Math.atan2(wrapD(gs.y - wz.y), wrapD(gs.x - wz.x))
            gs.projs.push({ kind: 'bolt', from: 'w', x: wz.x, y: wz.y, z: Math.max(sampleH(gs, wz.x, wz.y), WATER) + 10, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, dmg: 6, life: 90 })
            gs.events.push({ type: 'wizfire' })
        }
        if (wz.hp <= 0) {
            wz.alive = false
            gs.wizardKills++
            dropPearls(gs, wz.tx, wz.ty, wz.mana)
            gs.events.push({ type: 'wizardDown' })
        }
    }

    if (gs.castleStage >= 2 && wz.alive) {
        gs.guardFire--
        if (gs.guardFire <= 0 && Math.hypot(wrapD(wz.x - gs.castle.x), wrapD(wz.y - gs.castle.y)) < 200) {
            gs.guardFire = 45
            const a = Math.atan2(wrapD(wz.y - gs.castle.y), wrapD(wz.x - gs.castle.x))
            gs.projs.push({ kind: 'arrow', from: 'c', x: gs.castle.x, y: gs.castle.y, z: 26, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, dmg: 2, life: 100 })
        }
    }

    for (let i = gs.monsters.length - 1; i >= 0; i--) {
        const m = gs.monsters[i]
        if (m.grabbed) continue
        const pd = Math.hypot(wrapD(gs.x - m.x), wrapD(gs.y - m.y))
        m.wanderT++
        if (m.kind === 'giant') {
            if (m.wanderT > 60) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            m.x = wrap(m.x + Math.cos(m.dir) * 0.35, MAP); m.y = wrap(m.y + Math.sin(m.dir) * 0.35, MAP)
            if (m.cool > 0) m.cool--
            if (pd < 70 && m.cool <= 0) {
                m.cool = 90
                const a = Math.atan2(wrapD(gs.y - m.y), wrapD(gs.x - m.x))
                gs.projs.push({ kind: 'rock', from: 'm', x: m.x, y: m.y, z: sampleH(gs, m.x, m.y) + 8, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, dmg: 8, life: 80 })
                gs.events.push({ type: 'rocksling' })
            }
        } else if (m.kind === 'wolf') {
            const cd = Math.hypot(wrapD(gs.castle.x - m.x), wrapD(gs.castle.y - m.y))
            if (cd < 34) m.dir = Math.atan2(wrapD(m.y - gs.castle.y), wrapD(m.x - gs.castle.x))
            else if (pd < 45) m.dir = Math.atan2(wrapD(gs.y - m.y), wrapD(gs.x - m.x))
            else if (m.wanderT > 50) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            const sp = pd < 45 ? 1.0 : 0.4
            m.x = wrap(m.x + Math.cos(m.dir) * sp, MAP); m.y = wrap(m.y + Math.sin(m.dir) * sp, MAP)
            if (m.cool > 0) m.cool--
            if (pd < 6 && m.cool <= 0) { m.cool = 50; hurtPlayer(gs, 5); gs.events.push({ type: 'bite' }) }
        } else {
            if (m.wanderT > 90) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            m.x = wrap(m.x + Math.cos(m.dir) * 0.25, MAP); m.y = wrap(m.y + Math.sin(m.dir) * 0.25, MAP)
            if (pd < 5 && m.cool <= 0) { m.cool = 200; killEntity(gs, m, i); gs.events.push({ type: 'stampede' }) }
        }
    }

    gs.spawnCool--
    if (gs.spawnCool <= 0) {
        gs.spawnCool = 360
        if (gs.fireMarks.length > 0 && gs.monsters.length < 12) {
            const f = gs.fireMarks[Math.floor(rnd(gs) * gs.fireMarks.length)]
            spawnMon(gs, 'wolf')
            const nm = gs.monsters[gs.monsters.length - 1]
            nm.x = wrap(f.x + 6, MAP); nm.y = wrap(f.y + 6, MAP)
            gs.events.push({ type: 'spawn' })
        }
    }
    if (gs.fireMarks.length > 24) gs.fireMarks.shift()

    for (let i = gs.projs.length - 1; i >= 0; i--) {
        const p = gs.projs[i]
        p.life--
        p.x = wrap(p.x + p.vx, MAP); p.y = wrap(p.y + p.vy, MAP)
        if (p.vz) p.z += p.vz
        if (p.from === 'p' && (p.kind === 'fireball' || p.kind === 'throw')) {
            let tg = null, tdx = 0, tdy = 0, tdz = 0, td = 1e9
            if (gs.wizard.alive) {
                const d = Math.hypot(wrapD(gs.wizard.x - p.x), wrapD(gs.wizard.y - p.y))
                if (d < 90) { tg = 'w'; tdx = wrapD(gs.wizard.x - p.x); tdy = wrapD(gs.wizard.y - p.y); tdz = entZ(gs, gs.wizard.x, gs.wizard.y) - p.z; td = d }
            }
            for (const m of gs.monsters) {
                const d = Math.hypot(wrapD(m.x - p.x), wrapD(m.y - p.y))
                if (d < 55 && d < td) { tg = 'm'; tdx = wrapD(m.x - p.x); tdy = wrapD(m.y - p.y); tdz = entZ(gs, m.x, m.y) - p.z; td = d }
            }
            if (tg) {
                const sp = Math.hypot(p.vx, p.vy) || 3.2
                const want = Math.atan2(tdy, tdx)
                const cur = Math.atan2(p.vy, p.vx)
                const da = wrap(want - cur + Math.PI, Math.PI * 2) - Math.PI
                const mx = Math.max(0.12, Math.min(0.6, Math.abs(da) * 0.5))
                const na = cur + Math.max(-mx, Math.min(mx, da))
                p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp
                p.vz = p.vz || -0.12
                p.vz += tdz * 0.015
                p.vz = Math.max(-0.5, Math.min(0.5, p.vz))
            }
        }
        let gone = p.life <= 0
        if (!gone && (p.kind === 'fireball' || p.kind === 'throw')) {
            if (gs.wizard.alive && Math.hypot(wrapD(p.x - gs.wizard.x), wrapD(p.y - gs.wizard.y)) < 7 &&
                Math.abs(p.z - (entZ(gs, gs.wizard.x, gs.wizard.y))) < 10) {
                gone = true
                gs.fireMarks.push({ x: p.x, y: p.y, t: gs.tick })
                applySplash(gs, gs.wizard.x, gs.wizard.y, p.dmg)
                gs.events.push({ type: 'boom', x: p.x, y: p.y })
            } else {
                let hi = -1, hd = 6
                for (let j = 0; j < gs.monsters.length; j++) {
                    const m = gs.monsters[j]
                    const d = Math.hypot(wrapD(p.x - m.x), wrapD(p.y - m.y))
                    if (d < hd && Math.abs(p.z - entZ(gs, m.x, m.y)) < 10) { hd = d; hi = j }
                }
                if (hi >= 0) {
                    const m = gs.monsters[hi]
                    gone = true
                    gs.fireMarks.push({ x: p.x, y: p.y, t: gs.tick })
                    applySplash(gs, m.x, m.y, p.dmg)
                    gs.events.push({ type: 'boom', x: p.x, y: p.y })
                }
            }
        }
        if (!gone && (p.kind === 'fireball' || p.kind === 'throw') && p.z <= sampleH(gs, p.x, p.y) + 0.5) {
            gone = true
            gs.fireMarks.push({ x: p.x, y: p.y, t: gs.tick })
            applySplash(gs, p.x, p.y, p.dmg)
            gs.events.push({ type: 'boom', x: p.x, y: p.y })
        }
        if (!gone && p.from !== 'p') {
            if (Math.hypot(wrapD(p.x - gs.x), wrapD(p.y - gs.y)) < 6 && Math.abs(p.z - gs.alt) < 7) {
                hurtPlayer(gs, p.dmg)
                gone = true
            }
            if (p.kind === 'arrow' && gs.wizard.alive && Math.hypot(wrapD(p.x - gs.wizard.x), wrapD(p.y - gs.wizard.y)) < 8) {
                gs.wizard.hp -= p.dmg; gone = true; gs.events.push({ type: 'wizHit' })
            }
        }
        if (!gone && p.kind === 'bolt' && p.z <= sampleH(gs, p.x, p.y)) gone = true
        if (gone) gs.projs.splice(i, 1)
    }

    gs.score = Math.floor(gs.mana * 10 + gs.kills * 25 + gs.wizardKills * 500 +
        (gs.end === 'win' ? 1000 + Math.max(0, 9000 - gs.tick) : 0))
    return gs
}

export function autopilot(gs) {
    if (gs.end) return {}
    if (!gs.hands.R && gs.learned.length > 1) cycleR(gs)
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    let tx = null, ty = null, tz = 30

    if (gs.hp < 55 && gs.mana > 0) {
        tx = gs.castle.x; ty = gs.castle.y; tz = 30
    } else {
        const off = OFFENSE[gs.hands.L] ? spellById(gs.hands.L).cost
            : (OFFENSE[gs.hands.R] ? spellById(gs.hands.R).cost : 999)
        let target = null
        const wdNow = gs.wizard.alive ? Math.hypot(wrapD(gs.wizard.x - gs.x), wrapD(gs.wizard.y - gs.y)) : 1e9
        if (gs.wizard.alive && gs.mana >= off) {
            target = { x: gs.wizard.x, y: gs.wizard.y, z: entZ(gs, gs.wizard.tx, gs.wizard.ty) + 6 }
        } else {
            let bp = null, bd = 1e9
            for (const q of gs.pearls) {
                if (!q.alive) continue
                const d = Math.hypot(wrapD(q.x - gs.x), wrapD(q.y - gs.y))
                if (d < bd) { bd = d; bp = q }
            }
            let bk = null, bd2 = 1e9
            for (const b of gs.books) {
                if (b.taken) continue
                const d = Math.hypot(wrapD(b.x - gs.x), wrapD(b.y - gs.y))
                if (d < bd2) { bd2 = d; bk = b }
            }
            if (bp && (bd < 90 || !bk)) target = { x: bp.x, y: bp.y, z: bp.z }
            else if (bk) target = { x: bk.x, y: bk.y, z: entZ(gs, bk.x, bk.y) }
            else { tx = gs.castle.x; ty = gs.castle.y; tz = 30 }
        }
        if (target) { tx = target.x; ty = target.y; tz = target.z + 2 }
    }

    const dx = wrapD(tx - gs.x), dy = wrapD(ty - gs.y)
    const da = wrap(Math.atan2(dy, dx) - gs.yaw + Math.PI, Math.PI * 2) - Math.PI
    const turn = Math.max(-1, Math.min(1, da / 0.3))
    pad.left = turn < -0.05
    pad.right = turn > 0.05
    if (tz > gs.alt + 2.5) pad.up = true
    if (tz < gs.alt - 2.5) pad.down = true

    if (gs.wizard.alive && gs.hp >= 40) {
        const wx = wrapD(gs.wizard.x - gs.x), wy = wrapD(gs.wizard.y - gs.y)
        const wd = Math.hypot(wx, wy)
        const wda = wrap(Math.atan2(wy, wx) - gs.yaw + Math.PI, Math.PI * 2) - Math.PI
        const ph = gs.tick % 26
        if (gs.heldEnt) {
            if (wd < 40 && Math.abs(wda) < 0.25) pad.b = ph < 2
        } else if (wd < 44 && Math.abs(wda) < 0.25 && gs.mana >= 15) {
            pad.a = ph < 2
            if (gs.hands.R && OFFENSE[gs.hands.R]) pad.b = ph >= 13 && ph < 15
            else if (gs.hands.R === 'slow' && gs.wizSlow <= 0 && gs.mana >= 30) pad.b = ph < 2
        }
    }
    return pad
}

export function stateHash(gs) {
    let h = 0x811c9dc5
    const mix = (n) => {
        const s = String(n)
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    }
    mix(gs.rngState); mix(gs.tick); mix(gs.score); mix(gs.end)
    mix(gs.x.toFixed(1)); mix(gs.y.toFixed(1)); mix(gs.alt.toFixed(1)); mix(gs.yaw.toFixed(3))
    mix(gs.hp); mix(gs.shield); mix(gs.mana); mix(gs.castleStage)
    mix(gs.wizard.alive ? gs.wizard.hp : 'x'); mix(gs.wizard.mana)
    mix(gs.hands.L); mix(gs.hands.R); mix(gs.learned.length)
    mix(gs.pearls.filter((p) => p.alive).length)
    mix(gs.monsters.length); mix(gs.projs.length); mix(gs.fireMarks.length)
    mix(gs.kills); mix(gs.wizardKills); mix(gs.deaths)
    for (const p of gs.pearls) if (p.alive) { mix(p.x.toFixed(0)); mix(p.y.toFixed(0)) }
    return (h >>> 0).toString(16)
}
