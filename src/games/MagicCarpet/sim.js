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
export const HORIZON = 92

export const CFG = {
    speed: 2.0, climb: 0.75, turn: 0.065, focal: 260,
    boost: 1.6, boostTurn: 0.55,
    castleR: 26, bankRate: 3,
}

export const LEVELS = [
    { name: 'VERDANT ISLES', quota: 115, hoard: 80, wizHp: 60, pearls: 56 },
    { name: 'EMBERWILD', quota: 160, hoard: 110, wizHp: 85, pearls: 62 },
    { name: 'FROSTBOUND', quota: 175, hoard: 140, wizHp: 110, pearls: 68 },
]
export const QUOTA = LEVELS[LEVELS.length - 1].quota

export const SPILLS = [
    { id: 'fireball', name: 'FIREBALL', cost: 15 },
    { id: 'lightning', name: 'LIGHTNING', cost: 25 },
    { id: 'heal', name: 'HEAL', cost: 20 },
    { id: 'protect', name: 'PROTECTION', cost: 25 },
    { id: 'slow', name: 'SLOW TIME', cost: 30 },
    { id: 'telekinesis', name: 'TELEKINESIS', cost: 12 },
    { id: 'invisibility', name: 'INVISIBILITY', cost: 20 },
    { id: 'volcano', name: 'VOLCANO', cost: 60 },
    { id: 'shatter', name: 'SHATTER', cost: 30 },
    { id: 'raise', name: 'RAISE', cost: 25 },
    { id: 'dissolve', name: 'DISSOLVE', cost: 40 },
    { id: 'clone', name: 'CLONE', cost: 35 },
]
export const spellById = (id) => SPILLS.find((s) => s.id === id)
export const OFFENSE = { fireball: 1, lightning: 1, telekinesis: 1 }

// Invisibility (#1610): the original's veil — while it holds, the enemies are
// blind to the carpet. Duration in WORLD ticks so it is deterministic.
export const INVIS_T = 420

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

// Terrain reshape (the original's signature): blasts punch craters into the
// heightmap itself; craters sunk below sea level flood with the ocean.
// Hot craters (from fire) glow with cooling lava for CRATER_GLOW ticks; the
// scorch rim stays. glowOf() answers the render side.
export const CRATER_GLOW = 300

export function crater(gs, x, y, r, depth, hot = 0) {
    const rCell = Math.ceil(r / CELL)
    const cx = wrap(x, MAP) / CELL, cy = wrap(y, MAP) / CELL
    const i0 = Math.floor(cx), j0 = Math.floor(cy)
    for (let j = j0 - rCell; j <= j0 + rCell; j++) {
        for (let i = i0 - rCell; i <= i0 + rCell; i++) {
            const du = (i + 0.5 - cx) * CELL, dv = (j + 0.5 - cy) * CELL
            const d = Math.hypot(du, dv)
            if (d > r) continue
            const fall = depth * (1 - d / r) ** 2
            const gi = wrap(j, GRID) * GRID + wrap(i, GRID)
            gs.heights[gi] = Math.max(0, gs.heights[gi] - fall)
        }
    }
    gs.craters.push({ x: wrap(x, MAP), y: wrap(y, MAP), r, t: gs.tick, hot })
    if (gs.craters.length > 10) gs.craters.shift()
}

export const glowOf = (gs, c) => (c.hot > 0 ? Math.max(0, 1 - (gs.tick - c.t) / CRATER_GLOW) : 0)

// Raise (#1639): the mirror of crater(). The original only tore the ground
// down — craters, floods, volcano; its later games learned the counter-spell,
// and so does this one. A quadratic mound of hgt at the look point: ridges
// the carpet must ride (the auto-climb reads the same heightmap), and land
// pushed above WATER drains craters the sea had swallowed. Deliberately NOT
// pushed into gs.craters — a raise glows with nothing: no lava, no scorch,
// the ground just rises. rng-free, so deterministic like every terrain rule.
export function raiseTerrain(gs, x, y, r, hgt) {
    const rCell = Math.ceil(r / CELL)
    const cx = wrap(x, MAP) / CELL, cy = wrap(y, MAP) / CELL
    const i0 = Math.floor(cx), j0 = Math.floor(cy)
    for (let j = j0 - rCell; j <= j0 + rCell; j++) {
        for (let i = i0 - rCell; i <= i0 + rCell; i++) {
            const du = (i + 0.5 - cx) * CELL, dv = (j + 0.5 - cy) * CELL
            const d = Math.hypot(du, dv)
            if (d > r) continue
            const rise = hgt * (1 - d / r) ** 2
            const gi = wrap(j, GRID) * GRID + wrap(i, GRID)
            gs.heights[gi] = Math.min(96, gs.heights[gi] + rise)
        }
    }
    gs.events.push({ type: 'raise', x: wrap(x, MAP), y: wrap(y, MAP), r })
}

// Dissolve (#1668, the 11th spell): the original's late-game land spells did
// not crack the ground, they erased it. This is deliberately NOT a crater()
// subtraction — it CLAMPS the heightmap down (min(h, floor)), so whatever the
// terrain was, the wound sinks below the sea: a guaranteed, permanent flood
// even on a mountaintop. Nothing regrows land; only RAISE (#1639's mirror)
// drains it — the counter-spell pairing stays symmetric. Every hut inside the
// radius is dissolved too: not burned, no rubble, no fire marks — the flood
// swallows it whole, as the original drowned whole villages. Creatures swim
// (huts and terrain are the targets, #1645), and the wizard's tower stands:
// cold, land-only, rng-free — same seed, same flood.
export const DISSOLVE_R = 22
export const DISSOLVE_SINK = 6

export function dissolveLand(gs, x, y) {
    const dx0 = wrap(x, MAP), dy0 = wrap(y, MAP)
    const rCell = Math.ceil(DISSOLVE_R / CELL)
    const cx = dx0 / CELL, cy = dy0 / CELL
    const i0 = Math.floor(cx), j0 = Math.floor(cy)
    for (let j = j0 - rCell; j <= j0 + rCell; j++) {
        for (let i = i0 - rCell; i <= i0 + rCell; i++) {
            const du = (i + 0.5 - cx) * CELL, dv = (j + 0.5 - cy) * CELL
            const d = Math.hypot(du, dv)
            if (d > DISSOLVE_R) continue
            const floor = WATER - DISSOLVE_SINK * (1 - d / DISSOLVE_R) ** 2
            const gi = wrap(j, GRID) * GRID + wrap(i, GRID)
            gs.heights[gi] = Math.min(gs.heights[gi], floor)
        }
    }
    const gone = []
    gs.huts.forEach((hs, i) => {
        if (Math.hypot(wrapD(hs.x - dx0), wrapD(hs.y - dy0)) < DISSOLVE_R) gone.push(i)
    })
    for (const i of [...new Set(gone)].sort((a, b) => b - a)) {
        const hs = gs.huts[i]
        gs.events.push({ type: 'dissolveHut', x: hs.x, y: hs.y })
        gs.huts.splice(i, 1)
    }
    gs.events.push({ type: 'dissolve', x: dx0, y: dy0, r: DISSOLVE_R, huts: gone.length })
}

// Shatter (#1639): the original's kill-without-cinders. Every creature within
// SHATTER_R of the point dies where it stands — wolf, giant, cow, even a
// creature in your grip — and the wizard takes the blast's force, but the
// land is untouched: no crater, no scorch, no fire mark, no topple. Death
// that leaves no trace is exactly why it was feared. rng-free: the kills are
// the deterministic same-set every replay.
export const SHATTER_R = 24
export function shatterAt(gs, x, y) {
    const sx = wrap(x, MAP), sy = wrap(y, MAP)
    const dead = []
    gs.monsters.forEach((m, i) => {
        if (Math.hypot(wrapD(m.x - sx), wrapD(m.y - sy)) < SHATTER_R) dead.push(i)
    })
    for (const i of [...new Set(dead)].sort((a, b) => b - a)) killEntity(gs, gs.monsters[i], i)
    if (gs.wizard.alive && Math.hypot(wrapD(gs.wizard.x - sx), wrapD(gs.wizard.y - sy)) < 20) {
        gs.wizard.hp -= 28
        gs.events.push({ type: 'wizHit' })
    }
    gs.events.push({ type: 'shatter', x: sx, y: sy, r: SHATTER_R })
}

// CLONE (#1680, the 12th spell): creature-cloning, the last entry of the
// original's later-game repertoire (#1612 item 5). Where you look, everything
// alive within CLONE_R gains a twin: the copy stands on the OPPOSITE side of
// the ring centre (mirrored across the cast point, never inside 6u of it), at
// its kind's full spawn health, a fresh AI clock, ordinary hostility — and an
// ordinary bounty. That is the whole bargain: cast into a pack and the land's
// killable mana doubles, and so does the danger. The wizard is unique and is
// never cloned; the land, huts, pearls and books are untouched — a cold,
// rng-free spell like shatter (same seed, same litter). Copies participate in
// every existing rule (bite, slings, stampede, the 12-wolf respawn clock is
// just the clock, not a cap on your own casting; CLONE_MAX keeps a ring-off-
// rings from ever melting the world).
export const CLONE_R = 24
export const CLONE_MAX = 32
export const SPAWN_HP = { giant: 30, wolf: 8, cow: 4 }

export function cloneAt(gs, x, y) {
    const cx = wrap(x, MAP), cy = wrap(y, MAP)
    const litter = []
    for (const m of [...gs.monsters]) {
        if (gs.monsters.length >= CLONE_MAX) break
        const dx = wrapD(m.x - cx), dy = wrapD(m.y - cy)
        const d = Math.hypot(dx, dy)
        if (d >= CLONE_R) continue
        const md = Math.max(d, 6)
        const ux = d >= 1 ? dx / d : 1, uy = d >= 1 ? dy / d : 0
        const nx = wrap(cx - ux * md, MAP), ny = wrap(cy - uy * md, MAP)
        const cp = {
            kind: m.kind, x: nx, y: ny, hp: SPAWN_HP[m.kind],
            dir: m.dir, cool: 0, wanderT: 0, lostT: 0,
        }
        gs.monsters.push(cp)
        litter.push({ kind: m.kind, x: nx, y: ny })
    }
    gs.events.push({ type: 'clone', x: cx, y: cy, r: CLONE_R, count: litter.length, copies: litter })
    return litter
}

// A physical blast at the wizard's tower base topples it (telekinesis throws
// and fireballs both). One topple per world; the wizard takes the fall.
export function toppleTower(gs, x, y) {
    if (gs.towerDown || !gs.wizard) return false
    if (Math.hypot(wrapD(x - gs.wizard.tx), wrapD(y - gs.wizard.ty)) > 14) return false
    gs.towerDown = true
    crater(gs, gs.wizard.tx, gs.wizard.ty, 12, 8, 0.6)
    igniteHuts(gs, gs.wizard.tx, gs.wizard.ty)
    gs.events.push({ type: 'towerDown', x: gs.wizard.tx, y: gs.wizard.ty })
    if (gs.wizard.alive) { gs.wizard.hp -= 30; gs.events.push({ type: 'wizHit' }) }
    return true
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

export const BOUNTY = { giant: 18, wolf: 6, cow: 2 }

export function makeGame(seed, level = 0) {
    const gs = {
        seed: seed >>> 0, rngState: seed >>> 0, tick: 0, end: null,
        level: Math.max(0, Math.min(LEVELS.length - 1, level)),
        x: 0, y: 0, alt: 34, yaw: 0,
        hp: 100, shield: 0, mana: 0, bank: 0, spilled: 0, deaths: 0,
        kills: 0, wizardKills: 0, levelClears: 0,
        castle: null, castleStage: 0,
        wizard: null, pearls: [], books: [], monsters: [], projs: [], fireMarks: [],
        craters: [], towerDown: false,
        learned: ['fireball'], hands: { L: 'fireball', R: null },
        coolL: 0, coolR: 0, heldEnt: null, holdT: 0,
        wizSlow: 0, wizFire: 40, spawnCool: 360, guardFire: 45, safeT: 0,
        invis: 0, book: false,
        heights: null, events: [], score: 0,
        quota: LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))].quota,
    }
    genWorld(gs)
    return gs
}

// (Re)generate the living world of gs.level on top of gs. The rng stream keeps
// running, so level N of seed S is reproducible from a fresh makeGame(S, N)…
// makeGame always starts at the requested level, and step()'s level transition
// calls genWorld in the same deterministic order.
export function genWorld(gs) {
    const lv = LEVELS[gs.level]
    gs.quota = lv.quota
    gs.heights = genHeights((() => {
        return () => { gs.rngState = (gs.rngState + 0x6D2B79F5) | 0; let t = gs.rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    })())
    gs.castleStage = 0
    const cs = findSpot(gs, 26, 44, true, null, 0)
    gs.castle = { x: cs.x, y: cs.y }
    gs.x = wrap(cs.x + 40, MAP); gs.y = wrap(cs.y + 40, MAP); gs.alt = 34; gs.yaw = 0
    gs.hp = 100; gs.shield = 0; gs.mana = 0; gs.bank = 0
    const ts = findSpot(gs, 24, 48, true, gs.castle, 140)
    // Fairness invariant (#1639): on the 512u wrapping map every wizard must
    // sit inside the castle guards' reach (they fire at <200u, arrows carry
    // ~300). A hoarding wizard with an out-of-range tower and a player at
    // 0 mana is a soft-locked world — seed 14 rolled exactly that when the
    // 10th books shifted the stream. Retry until the tower is within reach
    // (first keeping the full 140u distance, then easing); the final
    // fallback keeps the old behavior rather than returning null.
    ts.d = Math.hypot(wrapD(ts.x - gs.castle.x), wrapD(ts.y - gs.castle.y))
    if (ts.d > 180) {
        let tp = null
        for (let k = 0; k < 60 && !tp; k++) {
            const c = findSpot(gs, 24, 48, true, gs.castle, 140)
            if (Math.hypot(wrapD(c.x - gs.castle.x), wrapD(c.y - gs.castle.y)) <= 180) tp = c
        }
        if (!tp) {
            for (let k = 0; k < 60 && !tp; k++) {
                const c = findSpot(gs, 24, 48, true, null, 0)
                if (Math.hypot(wrapD(c.x - gs.castle.x), wrapD(c.y - gs.castle.y)) <= 180) tp = c
            }
        }
        if (tp) { ts.x = tp.x; ts.y = tp.y }
    }
    gs.wizard = { x: ts.x, y: ts.y, tx: ts.x, ty: ts.y, hp: lv.wizHp, mana: lv.hoard, alive: true, ang: rnd(gs) * 6.28, lostT: 0 }

    const bs = []
    gs.books = []
    for (const sp of SPILLS) {
        let p = null
        for (let k = 0; k < 60; k++) {
            const c = findSpot(gs, 24, 50, false, null, 0)
            if (!bs.some((b) => Math.hypot(wrapD(c.x - b.x), wrapD(c.y - b.y)) < 70) &&
                Math.hypot(wrapD(c.x - gs.castle.x), wrapD(c.y - gs.castle.y)) > 45) { p = c; break }
        }
        // #1639: with ten books the strict 70u spread starves the mid-height
        // band on unlucky seeds (seed 1 exhausted all 60 tries on the 9th).
        // After the honest strict attempt, ease the spread — first still past
        // the castle reach, then anywhere landable. Deterministic either way.
        // #1668 kept the loop honest for eleven books (DISSOLVE's grimoire);
        // #1680 for twelve (CLONE's — the fallback still always places).
        if (!p) p = findSpot(gs, 24, 50, false, gs.castle, 46)
        gs.books.push({ id: sp.id, x: p.x, y: p.y, taken: gs.learned.includes(sp.id), cd: 0 })
        bs.push(p)
    }

    gs.pearls = []
    for (let i = 0; i < lv.pearls; i++) {
        const x = rnd(gs) * MAP, y = rnd(gs) * MAP
        const z = Math.max(sampleH(gs, x, y), WATER) + [2, 2, 6, 12][Math.floor(rnd(gs) * 4)]
        gs.pearls.push({ x, y, z, m: 2 + Math.floor(rnd(gs) * 5), alive: true })
    }
    gs.monsters = []
    for (let i = 0; i < 2; i++) spawnMon(gs, 'giant', gs.castle, 90)
    for (let i = 0; i < 4 + gs.level; i++) spawnMon(gs, 'wolf', gs.castle, 90)
    for (let i = 0; i < 4; i++) spawnMon(gs, 'cow', gs.castle, 70)
    gs.huts = []
    for (let i = 0; i < 7; i++) {
        const c = findSpot(gs, 26, 46, false, null, 0)
        gs.huts.push({ x: c.x, y: c.y, v: Math.floor(rnd(gs) * 3), burn: 0, dead: false, catchT: 0 })
    }
    gs.projs = []
    gs.fireMarks = []
    gs.craters = []
    gs.towerDown = false
    gs.invis = 0
    gs.book = false
    return gs
}

function spawnMon(gs, kind, away, minD) {
    const p = findSpot(gs, kind === 'giant' ? 24 : 20, kind === 'cow' ? 46 : 60, false, away || null, minD || 0)
    gs.monsters.push({
        kind, x: p.x, y: p.y, hp: SPAWN_HP[kind],
        dir: rnd(gs) * 6.28, cool: Math.floor(rnd(gs) * 40), wanderT: 0, lostT: 0,
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

export function lookPoint(gs) {
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

function igniteHuts(gs, x, y) {
    for (const hs of gs.huts) {
        if (!hs.dead && hs.burn <= 0 && Math.hypot(wrapD(hs.x - x), wrapD(hs.y - y)) < 14) {
            hs.burn = 200
            gs.events.push({ type: 'ignite', x: hs.x, y: hs.y })
        }
    }
}

function hurtPlayer(gs, dmg) {
    if (gs.safeT > 0) return
    if (gs.shield > 0) { gs.shield = Math.max(0, gs.shield - dmg); gs.events.push({ type: 'shieldHit' }); return }
    gs.hp -= dmg
    gs.events.push({ type: 'hurt', dmg })
    if (gs.hp <= 0) {
        const lost = Math.floor(gs.mana)
        if (lost > 0) { gs.spilled += lost; gs.events.push({ type: 'spill', m: lost }) }
        gs.mana = 0
        if (gs.bank > 0) {
            gs.deaths++
            gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = 52; gs.hp = 100; gs.shield = 150
            gs.safeT = 240
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

function blast(gs, x, y, r, depth, dmg) {
    crater(gs, x, y, r, depth, 1)
    toppleTower(gs, x, y)
    igniteHuts(gs, x, y)
    for (let k = 0; k < 3; k++) {
        const a = rnd(gs) * 6.28, d = rnd(gs) * r
        gs.fireMarks.push({ x: wrap(x + Math.cos(a) * d, MAP), y: wrap(y + Math.sin(a) * d, MAP), t: gs.tick })
    }
    applySplash(gs, x, y, dmg)
    gs.events.push({ type: 'boom', x, y })
}

// Volcano (#1612 item 5, the 8th spell): the ground tears open where you look.
// One main hot vent plus three secondary hot craters scatter around it; each
// ignites huts in reach, splashes damage, and showers fire marks. All vents are
// hot, so they glow with cooling lava (CRATER_GLOW) and flood if sunk below
// sea — the eruption uses the exact crater machinery every blast already has.
// rng() only, so the eruption is deterministic from the seed.
export function volcanoErupt(gs, x, y) {
    const mx = wrap(x, MAP), my = wrap(y, MAP)
    crater(gs, mx, my, 18, 12, 1)
    toppleTower(gs, mx, my)
    igniteHuts(gs, mx, my)
    applySplash(gs, mx, my, 20)
    for (let k = 0; k < 8; k++) {
        const a = rnd(gs) * 6.28, d = rnd(gs) * 26
        gs.fireMarks.push({ x: wrap(mx + Math.cos(a) * d, MAP), y: wrap(my + Math.sin(a) * d, MAP), t: gs.tick })
    }
    const vents = [{ x: mx, y: my }]
    for (let k = 0; k < 3; k++) {
        const a = rnd(gs) * 6.28, d = 14 + rnd(gs) * 22
        const vx = wrap(mx + Math.cos(a) * d, MAP), vy = wrap(my + Math.sin(a) * d, MAP)
        crater(gs, vx, vy, 8 + rnd(gs) * 5, 6 + rnd(gs) * 3, 1)
        igniteHuts(gs, vx, vy)
        applySplash(gs, vx, vy, 14)
        gs.fireMarks.push({ x: vx, y: vy, t: gs.tick })
        vents.push({ x: vx, y: vy })
        gs.events.push({ type: 'boom', x: vx, y: vy })
    }
    gs.events.push({ type: 'volcano', x: mx, y: my, vents })
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
        gs.projs.push({ kind: 'fireball', from: 'p', grace: 4, x: gs.x, y: gs.y, z: Math.max(gs.alt - 2, sampleH(gs, gs.x, gs.y) + 1.5), vz: -0.12, vx: Math.cos(gs.yaw) * 3.2, vy: Math.sin(gs.yaw) * 3.2, dmg: 14, life: 60 })
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
        crater(gs, lp.x, lp.y, 10, 8)
        igniteHuts(gs, lp.x, lp.y)
        for (const s of struck) {
            if (s.tgt === 'wiz') { gs.wizard.hp -= s.dmg; gs.events.push({ type: 'wizHit' }) }
        }
        const idxs = struck.filter((s) => s.tgt === 'mon').map((s) => s.i).sort((a, b) => b - a)
        const dead = []
        for (const i of idxs) { gs.monsters[i].hp -= struck.find((s) => s.i === i).dmg; if (gs.monsters[i].hp <= 0) dead.push(i) }
        for (const i of [...new Set(dead)].sort((a, b) => b - a)) killEntity(gs, gs.monsters[i], i)
    } else if (id === 'heal') {
        gs.hp = Math.min(100, gs.hp + 30)
        gs.events.push({ type: 'heal' })
    } else if (id === 'protect') {
        gs.shield = 150
    } else if (id === 'slow') {
        gs.wizSlow = 300
    } else if (id === 'invisibility') {
        gs.invis = INVIS_T
    } else if (id === 'volcano') {
        const lp = lookPoint(gs)
        volcanoErupt(gs, lp.x, lp.y)
    } else if (id === 'shatter') {
        const lp = lookPoint(gs)
        shatterAt(gs, lp.x, lp.y)
    } else if (id === 'raise') {
        const lp = lookPoint(gs)
        raiseTerrain(gs, lp.x, lp.y, 16, 14)
    } else if (id === 'dissolve') {
        const lp = lookPoint(gs)
        dissolveLand(gs, lp.x, lp.y)
    } else if (id === 'clone') {
        const lp = lookPoint(gs)
        cloneAt(gs, lp.x, lp.y)
    } else if (id === 'telekinesis') {
        if (gs.heldEnt) {
            const e = gs.heldEnt
            const ei = gs.monsters.indexOf(e.ref)
            if (ei >= 0) gs.monsters.splice(ei, 1)
            gs.projs.push({ kind: 'throw', ekind: e.kind, from: 'p', grace: 4, x: gs.x, y: gs.y, z: gs.alt, vz: -0.12, vx: Math.cos(gs.yaw) * 3.4, vy: Math.sin(gs.yaw) * 3.4, dmg: 26, life: 70 })
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

export function cycleL(gs) {
    const list = gs.learned
    if (!list.length) return
    const i = list.indexOf(gs.hands.L)
    setHand(gs, 'L', list[(i + 1) % list.length])
}

// #1612 mobile spellbook: the original was mouse-first — you CLICKED the HUD to
// equip hands. The HUD-space hit map and the tap's effect live here (pure, so
// carpetcheck proves the whole touch path without a browser). hudTap routes a
// tap at HUD coords (0..W, 0..H):
//   'world'  above the strip and outside any open tray → cast (the shell maps
//            pointer button to left/right hand)
//   'slotL' / 'slotR'  tap a hand slot → cycle that hand through learned spells
//   'book'   tap the gold tab → open the spell tray
//   'equip'  tray open, tap a LEARNED spell → assign LEFT hand, tray closes
//   'close'  tray open, tap anywhere else → tray closes without casting (like
//            the original's click-out); unlearned icons are inert ('none'), and
//            dead HUD strip between the hit boxes does nothing ('none')
// Only equip/cycle/toggle mutate gs (same events setHand pushes); the sim's
// rules and the state hash are untouched by the tray itself.
export const TAP = {
    slotL: [258, H - HUD_H, 22, HUD_H],
    slotR: [280, H - HUD_H, 22, HUD_H],
    book: [258, H - HUD_H - 16, 44, 16],
}
// #1646: the tray grew 17→22px so each slot carries a readable cost digit AND a
// keycap caption (1–9,0) — the phone-legibility pass. Still flush on the HUD strip.
export const TRAY = [Math.floor((W - SPILLS.length * 14) / 2), H - HUD_H - 22, SPILLS.length * 14, 22]

export function hudTap(gs, x, y) {
    if (gs.end) return 'none'
    if (x < 0 || x >= W || y < 0 || y >= H) return 'world' // letterbox margin = still the world
    const hit = (r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]
    if (gs.book) {
        if (hit(TAP.book)) { gs.book = false; return 'book' }
        if (hit(TRAY)) {
            const i = Math.floor((x - TRAY[0]) / 14)
            const sp = SPILLS[i]
            if (sp && gs.learned.includes(sp.id)) {
                setHand(gs, 'L', sp.id)
                gs.book = false
                return 'equip'
            }
            return 'none' // unlearned cell: inert, tray stays open
        }
        gs.book = false
        return 'close' // click-out closes without casting
    }
    if (hit(TAP.book)) { gs.book = true; return 'book' }
    if (hit(TAP.slotL)) { cycleL(gs); return 'slotL' }
    if (hit(TAP.slotR)) { cycleR(gs); return 'slotR' }
    if (y >= H - HUD_H) return 'none' // dead HUD strip: never a stray cast
    return 'world'
}

// #1612 item 4: behind the veil the world is heard *through* the carpet. The
// shell hangs its sustained bed (wind, growls, boost hiss) on a low-pass whose
// cutoff this picks, so invisibility dulls the world instead of only changing
// the picture. It is a pure read of the veil (like hudTap is of the strip), so
// carpetcheck proves the decision without Web Audio; open when visible, a short
// closed band while veiled. It never feeds stateHash — it drives sound, not rules.
export const OPEN_CUTOFF = 18000
export const MUFFLE_CUTOFF = 520
export function muffleOf(gs) {
    return gs.invis > 0 ? MUFFLE_CUTOFF : OPEN_CUTOFF
}

export function step(gs, inp) {
    gs.tick++
    if (gs.end) return
    if (gs.coolL > 0) gs.coolL--
    if (gs.coolR > 0) gs.coolR--
    if (gs.shield > 0) gs.shield--
    if (gs.wizSlow > 0) gs.wizSlow--
    if (gs.safeT > 0) gs.safeT--
    if (gs.invis > 0) { gs.invis--; if (gs.invis === 0) gs.events.push({ type: 'invisEnd' }) }
    if (gs.holdT > 0 && gs.heldEnt) { gs.holdT--; if (gs.holdT === 0) { gs.heldEnt.ref.grabbed = false; gs.heldEnt = null } }

    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
    const vert = (inp.up ? 1 : 0) - (inp.down ? 1 : 0)
    const boosting = !!inp.boost
    gs.yaw += steer * CFG.turn * (boosting ? CFG.boostTurn : 1)
    const v = CFG.speed * (boosting ? CFG.boost : 1) * (1 - 0.78 * Math.abs(steer))
    gs.x = wrap(gs.x + Math.cos(gs.yaw) * v, MAP)
    gs.y = wrap(gs.y + Math.sin(gs.yaw) * v, MAP)
    gs.alt += vert * CFG.climb
    const aheadH = Math.max(
        sampleH(gs, gs.x + Math.cos(gs.yaw) * Math.max(14, v * 7), gs.y + Math.sin(gs.yaw) * Math.max(14, v * 7)),
        sampleH(gs, gs.x + Math.cos(gs.yaw) * Math.max(26, v * 13), gs.y + Math.sin(gs.yaw) * Math.max(26, v * 13)),
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
            gs.events.push({ type: 'pickup', m: p.m })
        }
    }

    for (const b of gs.books) {
        if (b.cd > 0) b.cd--
        const bdx = wrapD(gs.x - b.x), bdy = wrapD(gs.y - b.y)
        const bd = Math.hypot(bdx, bdy)
        const bz = sampleH(gs, b.x, b.y) + 4
        if (!b.taken && bd < 18 && Math.abs(gs.alt - bz) < 16) {
            b.x = wrap(b.x + bdx / Math.max(3, bd) * Math.min(1.4, bd * 0.25), MAP)
            b.y = wrap(b.y + bdy / Math.max(3, bd) * Math.min(1.4, bd * 0.25), MAP)
        }
        if (!b.taken && bd < 10 && Math.abs(gs.alt - bz) < 16) {
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

    // Bank-by-delivery: the load must be flown home. The vault is the score.
    if (Math.hypot(wrapD(gs.castle.x - gs.x), wrapD(gs.castle.y - gs.y)) < CFG.castleR) {
        if (gs.hp < 100) gs.hp = Math.min(100, gs.hp + 1.2)
        if (gs.mana > 0) {
            const move = Math.min(gs.mana, CFG.bankRate)
            gs.mana -= move
            gs.bank += move
            gs.events.push({ type: 'bankIn', m: move })
        }
    }
    {
        const stages = [0, 25, 60, 105, 150]
        const st = stages.filter((q) => gs.bank >= q).length - 1
        if (st > gs.castleStage) { gs.castleStage = st; gs.events.push({ type: 'stage', n: st }) }
        if (gs.bank >= gs.quota) {
            if (gs.level >= LEVELS.length - 1) {
                gs.end = 'win'
                gs.events.push({ type: 'win' })
            } else {
                gs.levelClears++
                gs.level++
                gs.quota = LEVELS[gs.level].quota
                if (gs.heldEnt) { gs.heldEnt = null; gs.holdT = 0 }
                gs.events.push({
                    type: 'level', n: gs.level, name: LEVELS[gs.level].name,
                    reset: {
                        bank: gs.bank,
                        pearls: gs.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0),
                        hoard: gs.wizard.alive ? gs.wizard.mana : 0,
                    },
                })
                const keepCarry = gs.mana
                genWorld(gs)
                gs.mana = keepCarry
            }
        }
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
        // The veil: a blinded wizard holds his shot — and a held fuse does not
        // run down, so fire resumes on its cadence the tick you become visible.
        if (gs.invis <= 0) gs.wizFire--
        const pd = Math.hypot(wrapD(gs.x - wz.x), wrapD(gs.y - wz.y))
        // Lost-target cue (#1612 item 1): the tick the veil rises, a wizard who
        // had a bead on the carpet loses it — the shell blips, the renderer
        // floats a '?'. Presentation only: cosmetic lostT never steers the AI.
        if (wz.lostT > 0) wz.lostT--
        if (gs.invis === INVIS_T && pd < 75) {
            wz.lostT = 40
            gs.events.push({ type: 'lost', kind: 'wizard', x: wz.x, y: wz.y })
        }
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
            crater(gs, wz.tx, wz.ty, 18, 11)
            igniteHuts(gs, wz.tx, wz.ty)
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
        const seen = gs.invis <= 0 // the veil: monsters lose the carpet entirely
        if (m.lostT > 0) m.lostT--
        if (gs.invis === INVIS_T && ((m.kind === 'wolf' && pd < 45) || (m.kind === 'giant' && pd < 70))) {
            m.lostT = 40 // the tick you vanish, the chaser that had you in range blinks
            gs.events.push({ type: 'lost', kind: m.kind, x: m.x, y: m.y })
        }
        m.wanderT++
        if (m.kind === 'giant') {
            if (m.wanderT > 60) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            const gcd = Math.hypot(wrapD(m.x - gs.castle.x), wrapD(m.y - gs.castle.y))
            if (gcd < 55) m.dir = Math.atan2(wrapD(m.y - gs.castle.y), wrapD(m.x - gs.castle.x))
            m.x = wrap(m.x + Math.cos(m.dir) * 0.35, MAP); m.y = wrap(m.y + Math.sin(m.dir) * 0.35, MAP)
            if (m.cool > 0) m.cool--
            if (seen && pd < 70 && m.cool <= 0) {
                m.cool = 90
                const a = Math.atan2(wrapD(gs.y - m.y), wrapD(gs.x - m.x))
                gs.projs.push({ kind: 'rock', from: 'm', x: m.x, y: m.y, z: sampleH(gs, m.x, m.y) + 8, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, dmg: 8, life: 80 })
                gs.events.push({ type: 'rocksling' })
            }
        } else if (m.kind === 'wolf') {
            const cd = Math.hypot(wrapD(gs.castle.x - m.x), wrapD(gs.castle.y - m.y))
            if (cd < 34) m.dir = Math.atan2(wrapD(m.y - gs.castle.y), wrapD(m.x - gs.castle.x))
            else if (seen && pd < 45) m.dir = Math.atan2(wrapD(gs.y - m.y), wrapD(gs.x - m.x))
            else if (m.wanderT > 50) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            const sp = seen && pd < 45 ? 1.0 : 0.4
            m.x = wrap(m.x + Math.cos(m.dir) * sp, MAP); m.y = wrap(m.y + Math.sin(m.dir) * sp, MAP)
            if (m.cool > 0) m.cool--
            if (seen && pd < 6 && m.cool <= 0 && gs.alt < sampleH(gs, m.x, m.y) + 10) { m.cool = 50; hurtPlayer(gs, 5); gs.events.push({ type: 'bite' }) }
        } else {
            if (m.wanderT > 90) { m.wanderT = 0; m.dir = rnd(gs) * 6.28 }
            m.x = wrap(m.x + Math.cos(m.dir) * 0.25, MAP); m.y = wrap(m.y + Math.sin(m.dir) * 0.25, MAP)
            if (pd < 5 && m.cool <= 0) { m.cool = 200; killEntity(gs, m, i); gs.events.push({ type: 'stampede' }) }
        }
    }

    for (const hs of gs.huts) {
        if (hs.burn > 0) {
            hs.burn--
            if (hs.burn === 0 && !hs.dead) {
                hs.dead = true
                crater(gs, hs.x, hs.y, 6, 3, 0.35)
                gs.events.push({ type: 'hutDown', x: hs.x, y: hs.y })
            }
        } else if (!hs.dead && hs.catchT > 0) {
            hs.catchT--
            if (hs.catchT === 0) {
                hs.burn = 200
                gs.events.push({ type: 'ignite', x: hs.x, y: hs.y })
            }
        }
    }
    for (const hs of gs.huts) {
        if (hs.burn <= 0) continue
        for (const o of gs.huts) {
            if (o === hs || o.dead || o.burn > 0 || o.catchT > 0) continue
            if (Math.hypot(wrapD(o.x - hs.x), wrapD(o.y - hs.y)) < 20) o.catchT = 120
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
        if (p.grace > 0) p.grace--
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
                blast(gs, p.x, p.y, 14, 10, p.dmg)
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
                    blast(gs, m.x, m.y, 14, 10, p.dmg)
                }
            }
        }
        if (!gone && (p.kind === 'fireball' || p.kind === 'throw') && p.grace <= 0 && p.z <= sampleH(gs, p.x, p.y) + 0.5) {
            gone = true
            blast(gs, p.x, p.y, 14, 10, p.dmg)
        }
        if (!gone && p.from !== 'p') {
            if (gs.invis <= 0 && Math.hypot(wrapD(p.x - gs.x), wrapD(gs.y - gs.y)) < 6 && Math.abs(p.z - gs.alt) < 7) {
                hurtPlayer(gs, p.dmg)
                gone = true
            }
            if (p.kind === 'arrow' && gs.wizard.alive && Math.hypot(wrapD(p.x - gs.wizard.x), wrapD(p.y - gs.wizard.y)) < 8) {
                gs.wizard.hp -= p.dmg; gone = true; gs.events.push({ type: 'wizHit' })
            }
        }
        if (!gone && p.kind === 'bolt' && p.z <= sampleH(gs, p.x, p.y)) {
            gone = true
            crater(gs, p.x, p.y, 8, 5)
            gs.events.push({ type: 'boom', x: p.x, y: p.y })
        }
        if (gone) gs.projs.splice(i, 1)
    }

    gs.score = Math.floor(gs.bank * 10 + gs.mana * 4 + gs.kills * 25 + gs.wizardKills * 500 +
        gs.levelClears * 1500 + (gs.end === 'win' ? 1000 + Math.max(0, 18000 - gs.tick) : 0))
    return gs
}

export function autopilot(gs) {
    if (gs.end) return {}
    if (!gs.hands.R && gs.learned.length > 1) cycleR(gs)
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    let tx = null, ty = null, tz = 30

    const home = () => { tx = gs.castle.x; ty = gs.castle.y; tz = 30 }
    const off = OFFENSE[gs.hands.L] ? spellById(gs.hands.L).cost
        : (OFFENSE[gs.hands.R] ? spellById(gs.hands.R).cost : 999)
    if (gs.bank + gs.mana >= gs.quota) {
        home()
    } else if (gs.wizard.alive && gs.hp >= 70 && gs.mana >= off + 10) {
        tx = gs.wizard.x; ty = gs.wizard.y; tz = entZ(gs, gs.wizard.tx, gs.wizard.ty) + 6
    } else if (gs.mana >= 12 || (gs.hp < 55 && gs.mana > 0)) {
        home()
    } else {
        let target = null
        {
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
            else home()
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

    if (gs.wizard.alive && gs.hp >= 40 && gs.mana >= 15) {
        const wx = wrapD(gs.wizard.x - gs.x), wy = wrapD(gs.wizard.y - gs.y)
        const wd = Math.hypot(wx, wy)
        const wda = wrap(Math.atan2(wy, wx) - gs.yaw + Math.PI, Math.PI * 2) - Math.PI
        const ph = gs.tick % 26
        if (gs.heldEnt) {
            if (wd < 40 && Math.abs(wda) < 0.25) pad.b = ph < 2
        } else if (wd < 44 && Math.abs(wda) < 0.25) {
            pad.a = ph < 2
            if (gs.hands.R && OFFENSE[gs.hands.R]) pad.b = ph >= 13 && ph < 15
            else if (gs.hands.R === 'slow' && gs.wizSlow <= 0 && gs.mana >= 30) pad.b = ph < 2
        }
    }

    // Defensive veil (#1610): low HP with a threat closing — a blind wizard and
    // wolves cannot finish the run. Whichever hand holds the veil casts it.
    if (gs.hp < 40 && gs.invis <= 0 && gs.mana >= spellById('invisibility').cost) {
        const closing = gs.monsters.some((m) => m.kind !== 'cow' &&
            Math.hypot(wrapD(m.x - gs.x), wrapD(m.y - gs.y)) < 25) ||
            (gs.wizard.alive && Math.hypot(wrapD(gs.wizard.x - gs.x), wrapD(gs.wizard.y - gs.y)) < 70)
        if (closing) {
            if (gs.hands.L === 'invisibility') pad.a = true
            else if (gs.hands.R === 'invisibility') pad.b = true
        }
    }
    // Altitude is armor (the original's lesson, #1610 sweep): when hurt and a
    // wolf is closing, climb — wolves only bite carpets flying low. Only climb
    // while genuinely low: past safe clearance the pack can't reach you, and a
    // pin-up rule with no floor-free ceiling check strands the bot above its
    // pearls when a wolf pack learns to shadow the carpet (#1612 sweep fix).
    // #1680 (seed 33 sweep): the armor line is the ground the WOLF stands on —
    // a ridge wolf bites a carpet that reads "high" over the valley below it.
    {
        const closing = gs.monsters.filter((m) => m.kind === 'wolf' &&
            Math.hypot(wrapD(m.x - gs.x), wrapD(m.y - gs.y)) < 24)
        if (gs.hp < 55 && closing.length) {
            let ceil = sampleH(gs, gs.x, gs.y)
            for (const m of closing) ceil = Math.max(ceil, sampleH(gs, m.x, m.y))
            if (gs.alt < ceil + 12) { pad.up = true; pad.down = false } // release the target-descent or they cancel (#1680)
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
    mix(gs.level); mix(gs.bank); mix(gs.spilled)
    mix(gs.x.toFixed(1)); mix(gs.y.toFixed(1)); mix(gs.alt.toFixed(1)); mix(gs.yaw.toFixed(3))
    mix(gs.hp); mix(gs.shield); mix(gs.mana); mix(gs.castleStage)
    mix(gs.invis)
    mix(gs.wizard.alive ? gs.wizard.hp : 'x'); mix(gs.wizard.mana)
    mix(gs.hands.L); mix(gs.hands.R); mix(gs.learned.length)
    mix(gs.pearls.filter((p) => p.alive).length)
    mix(gs.monsters.length); mix(gs.projs.length); mix(gs.fireMarks.length)
    mix(gs.kills); mix(gs.wizardKills); mix(gs.deaths); mix(gs.levelClears)
    for (const p of gs.pearls) if (p.alive) { mix(p.x.toFixed(0)); mix(p.y.toFixed(0)) }
    return (h >>> 0).toString(16)
}
