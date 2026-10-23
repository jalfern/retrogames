// GARDEN GUARD — pure simulation (no DOM, Node-testable).
//
// An original lane-defense game in the lineage of Plants vs. Zombies (PC, 2009,
// PopCap) but its own IP: an autumn orchard cottage raided by goblin GRUNCH.
// You bank ACORNS (drift down from the sky + a Gilded Daisy makes more), tap a
// card then a tile to plant defenders, and hold five lanes against escalating
// waves that build to a big final wave; clearing a level unlocks a new defender.
//
// Everything here is deterministic from a single integer seed: sky-drop timing and
// position, wave composition, lane choice. `Math.random()` never reaches this
// file's state — juice (particles, shake, twinkle) lives in the shell and is
// allowed to be non-deterministic. The bot is the attract autopilot AND the
// harness's proof the game is winnable: it drives the exact same action helpers
// the keyboard, pointer and contract do, so nothing can cheat a rule the human
// cannot use.

export const FIXED_DT = 1000 / 60

export const W = 800
export const H = 600
export const ROWS = 5
export const COLS = 9
export const TRAY_H = 104
export const GLX = 76
export const GLY = 122
export const CW = 78
export const CH = 90
export const HOUSE_X = GLX
export const SPAWN_X = W + 34

export const colX = (c) => GLX + c * CW + CW / 2
export const rowY = (r) => GLY + r * CH + CH / 2
export const tileOf = (px, py) => {
    const c = Math.floor((px - GLX) / CW)
    const r = Math.floor((py - GLY) / CH)
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null
    return { r, c }
}

// ----------------------------------------------------------- defenders ----
// id, name, cost, recharge(s), hp, kind, behavior params, unlock level (1..N).
export const PLANTS = {
    daisy: { id: 'daisy', name: 'Gilded Daisy', cost: 50, recharge: 6, hp: 60, kind: 'producer', make: 25, every: 8.5, color: '#ffcf3f', unlock: 1 },
    squirrel: { id: 'squirrel', name: 'Acorn Squirrel', cost: 100, recharge: 6, hp: 70, kind: 'shooter', dmg: 22, rate: 1.2, color: '#c98a4b', unlock: 1 },
    hedge: { id: 'hedge', name: 'Hedgerow', cost: 50, recharge: 24, hp: 340, kind: 'wall', color: '#3f9f4f', unlock: 2 },
    chili: { id: 'chili', name: 'Chili Bomb', cost: 150, recharge: 30, hp: 1, kind: 'bomb', dmg: 320, radius: 115, fuse: 0.7, color: '#e63b2e', unlock: 3 },
    frost: { id: 'frost', name: 'Frostcap', cost: 175, recharge: 6, hp: 70, kind: 'frost', dmg: 16, rate: 1.4, slow: 0.45, slowFor: 4.0, color: '#5fd0e6', unlock: 4 },
    pumpkin: { id: 'pumpkin', name: 'Pumpkin Catapult', cost: 200, recharge: 28, hp: 90, kind: 'lobber', dmg: 90, splash: 74, rate: 3.0, color: '#e0822b', unlock: 5 },
}
export const CARD_ORDER = ['daisy', 'squirrel', 'hedge', 'chili', 'frost', 'pumpkin']

// -------------------------------------------------------------- enemies ----
// hp, speed(px/s), size, attack dps on plants, score, first-level, armor.
export const ENEMIES = {
    grunt: { id: 'grunt', name: 'Grunt', hp: 90, speed: 20, r: 24, dps: 22, score: 10, color: '#7fae4a' },
    sprinter: { id: 'sprinter', name: 'Sprinter', hp: 60, speed: 40, r: 22, dps: 20, score: 14, color: '#c9d94a' },
    pup: { id: 'pup', name: 'Pup', hp: 34, speed: 34, r: 18, dps: 14, score: 6, color: '#9ecb5a' },
    brute: { id: 'brute', name: 'Brute', hp: 150, speed: 12, r: 30, dps: 40, score: 40, color: '#5d8a34' },
    warlord: { id: 'warlord', name: 'Warlord', hp: 700, speed: 9, r: 40, dps: 80, score: 600, color: '#3f6b22' },
}
export const LEVELS = [
    { pool: ['grunt', 'sprinter'], waves: 3, perWave: 2 },
    { pool: ['grunt', 'sprinter', 'pup'], waves: 4, perWave: 2 },
    { pool: ['grunt', 'sprinter', 'brute'], waves: 4, perWave: 3 },
    { pool: ['grunt', 'sprinter', 'pup', 'brute'], waves: 5, perWave: 3 },
    { pool: ['grunt', 'sprinter', 'pup', 'brute', 'warlord'], waves: 5, perWave: 3, boss: true },
]

// ------------------------------------------------------------ rng ----
export const roll = (g) => { g.rs = (Math.imul(g.rs, 1664525) + 1013904223) >>> 0; return g.rs / 4294967296 }
export const pick = (g, arr) => arr[Math.floor(roll(g) * arr.length) % arr.length]
const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

// ------------------------------------------------------------ new run ----
export function newRun(seed) {
    const g = {
        seed: (seed >>> 0) || 1,
        rs: 0,
        tick: 0,
        sec: 0,
        score: 0,
        level: 1,
        done: null,          // 'win' | 'lose' | null
        endMsg: '',
        acorns: 125,
        cursor: { r: 2, c: 4 },
        sel: 0,              // index into unlocked cards
        trowel: false,
        cd: {},
        unlocked: [],
        plants: [],          // {r,c,type,hp,maxHp,cool,bornT,anim,fuse?,lob?}
        enemies: [],         // {id,r,x,hp,maxHp,slow,slowT,anim,eat,dead?}
        projs: [],           // {r,x,y,vx,dmg,splash?,slow?,kind,lobT?,lobFrom}
        acornDrops: [],      // {x,y,ty,vy,rest,bankT,val,taken}
        mowers: [true, true, true, true, true],
        mowerRun: [0, 0, 0, 0, 0],
        events: [],
        // wave machine (per level):
        waves: [],
        waveIdx: 0,
        nextWaveAt: 0,
        spawned: 0,
        totalSpawns: 0,
        // bot bookkeeping (part of state so bot-driven runs stay reproducible)
        botFill: 0,
    }
    g.rs = nextSeed(g.seed)
    g.skyT = 1.5 + (g.rs % 100) / 100 * 2.5
    startLevel(g, 1)
    return g
}

export function unlockFor(level) {
    const out = []
    for (const id of CARD_ORDER) if (PLANTS[id].unlock <= level) out.push(id)
    return out
}

export function startLevel(g, level) {
    g.level = level
    g.plants = []
    g.enemies = []
    g.projs = []
    g.acornDrops = []
    g.mowers = [true, true, true, true, true]
    g.mowerRun = [0, 0, 0, 0, 0]
    g.unlocked = unlockFor(level)
    g.sel = 0
    for (const id of CARD_ORDER) g.cd[id] = 0
    g.cd[g.unlocked[0]] = 0
    g.waves = buildWaves(g, level)
    g.waveIdx = 0
    g.spawned = 0
    g.totalSpawns = g.waves.reduce((a, w) => a + w.entries.length, 0)
    g.nextWaveAt = 5.0
    g.skyT = 1.2
    g.sec = 0
    g.botFill = 0
    g.levelClearAt = -1
    // The lawn wipes between levels (as in the original), so each level after the
    // first opens with a sunlight cache to rebuild from — otherwise a cleared board
    // and waves at five seconds cannot be defended before they reach the gate.
    if (level > 1) g.acorns += 120 + 40 * level
    g.events.push({ t: 'level', level })
}

function buildWaves(g, level) {
    const cfg = LEVELS[Math.min(level, LEVELS.length) - 1]
    const waves = []
    for (let w = 0; w < cfg.waves; w++) {
        const big = w === cfg.waves - 1
        const count = cfg.perWave + w + (big ? 2 : 0)
        const entries = []
        let tanks = 0
        const tankCap = cfg.boss && big ? 2 : 1
        for (let i = 0; i < count; i++) {
            let type = pick(g, cfg.pool)
            if (cfg.boss && big && i === 0) type = 'warlord'
            if (cfg.pool.indexOf(type) < 0) type = 'grunt'
            if (type === 'brute' || type === 'warlord') {
                if (tanks >= tankCap) type = pick(g, ['grunt', 'sprinter'])
                else tanks++
            }
            entries.push({ type, lane: Math.floor(roll(g) * ROWS) % ROWS, gap: 0.6 + roll(g) * 1.1 })
        }
        waves.push({ entries, big, started: false, spawnAt: 0, i: 0 })
    }
    return waves
}

// ----------------------------------------------------------- actions ----
export function moveCursor(g, dr, dc) {
    g.cursor.r = Math.max(0, Math.min(ROWS - 1, g.cursor.r + dr))
    g.cursor.c = Math.max(0, Math.min(COLS - 1, g.cursor.c + dc))
}
export function cycleCard(g, dir) {
    const n = g.unlocked.length
    g.trowel = false
    g.sel = ((g.sel + dir) % n + n) % n
}
export function selectCard(g, i) {
    if (i < 0 || i >= g.unlocked.length) return false
    g.trowel = false
    g.sel = i
    return true
}
export function toggleTrowel(g) { g.trowel = !g.trowel }

export function occupied(g, r, c) {
    return g.plants.some((p) => p.r === r && p.c === c)
}

// Attempt to plant the selected card (or dig with the trowel) at (r,c).
// Returns true when a real world-change happened. Single canonical path used by
// keyboard, pointer, bot and contract.
export function actAt(g, r, c) {
    if (g.done) return false
    if (g.trowel) {
        const i = g.plants.findIndex((p) => p.r === r && p.c === c)
        if (i < 0) return false
        g.plants.splice(i, 1)
        g.cd.daisy = Math.max(g.cd.daisy || 0, 2)
        g.events.push({ t: 'dig', r, c })
        return true
    }
    const id = g.unlocked[g.sel]
    if (!id) return false
    return plant(g, id, r, c)
}

export function plant(g, id, r, c) {
    const def = PLANTS[id]
    if (!def || def.unlock > g.level) return false
    if (occupied(g, r, c)) return false
    if ((g.cd[id] || 0) > 0) return false
    if (g.acorns < def.cost) return false
    g.acorns -= def.cost
    g.cd[id] = def.recharge
    g.plants.push({
        r, c, type: id, hp: def.hp, maxHp: def.hp, cool: def.kind === 'shooter' || def.kind === 'frost' ? def.rate * 0.6 : 0,
        bornT: g.sec, anim: roll(g) * 6, fuse: def.kind === 'bomb' ? def.fuse : 0, made: 0,
    })
    g.events.push({ t: 'plant', id, r, c })
    return true
}

// ---------------------------------------------------------- advance ----
// Input-independent world step: economy, waves, movement, collisions, mowers.
export function advance(g, dt) {
    if (g.done) return
    g.tick++
    g.sec += dt
    for (const id of Object.keys(g.cd)) if (g.cd[id] > 0) g.cd[id] = Math.max(0, g.cd[id] - dt)

    // sky acorns drift down and auto-bank a beat after landing (mobile-friendly;
    // tapping a drop banks it instantly — see shell).
    g.skyT -= dt
    if (g.skyT <= 0) {
        g.skyT = 7 + roll(g) * 4
        g.acornDrops.push({ x: GLX + 20 + roll(g) * (W - GLX - 60), y: TRAY_H + 10, ty: GLY + 40 + roll(g) * (ROWS * CH - 80), vy: 46, rest: 0, bankT: 1.4, val: 25, taken: false })
        g.events.push({ t: 'sky' })
    }
    for (const d of g.acornDrops) {
        if (d.taken) continue
        if (d.y < d.ty) d.y = Math.min(d.ty, d.y + d.vy * dt)
        else { d.rest += dt; if (d.rest > d.bankT) bankAcorn(g, d) }
    }
    g.acornDrops = g.acornDrops.filter((d) => !d.taken)

    // producers
    for (const p of g.plants) {
        p.anim += dt * 6
        const def = PLANTS[p.type]
        if (def.kind === 'producer') {
            p.cool = (p.cool || 0) - dt
            if (p.cool <= 0) { p.cool = def.every; g.acornDrops.push({ x: colX(p.c) + (roll(g) - 0.5) * 18, y: rowY(p.r) - 10, ty: rowY(p.r) + 8, vy: 40, rest: 0, bankT: 1.0, val: def.make, taken: false }); g.events.push({ t: 'make' }) }
        }
    }

    waveMachine(g, dt)
    enemiesStep(g, dt)
    defendersStep(g, dt)
    projStep(g, dt)
    cleanDead(g)
    mowerStep(g, dt)
    checkLevelDone(g)

    if (g.levelClearAt > 0 && g.sec - g.levelClearAt > 3.2 && !g.done) {
        if (g.level >= LEVELS.length) { g.done = 'win'; g.endMsg = 'ORCHARD HELD' }
        else startLevel(g, g.level + 1)
    }
}

function waveMachine(g, dt) {
    void dt
    if (g.levelClearAt > 0) return
    const next = g.waves[g.waveIdx]
    if (next && !next.started && g.sec >= g.nextWaveAt) {
        next.started = true
        next.spawnAt = g.sec
        next.i = 0
        if (next.big) g.events.push({ t: 'bigwave' })
        else g.events.push({ t: 'wave', n: g.waveIdx + 1 })
    }
    if (next && next.started) {
        while (next.i < next.entries.length && g.sec >= next.spawnAt) {
            const e = next.entries[next.i]
            spawnEnemy(g, e.type, e.lane)
            g.spawned++
            next.i++
            next.spawnAt += next.entries[next.i - 1].gap
        }
        if (next.i >= next.entries.length) { g.waveIdx++; g.nextWaveAt = g.sec + 4 + roll(g) * 3 }
    }
}

export function spawnEnemy(g, type, lane) {
    const def = ENEMIES[type]
    g.enemies.push({ id: type, r: lane, x: SPAWN_X + roll(g) * 26, hp: def.hp, maxHp: def.hp, slow: 1, slowT: 0, anim: roll(g) * 6, eat: 0 })
}

function enemiesStep(g, dt) {
    for (const e of g.enemies) {
        e.anim += dt * (6 + ENEMIES[e.id].speed * 0.2)
        if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 1 }
        // find the plant it is eating (nearest defender at or left of its front)
        const def = ENEMIES[e.id]
        let eatP = null
        for (const p of g.plants) {
            if (p.r !== e.r) continue
            if (PLANTS[p.type].kind === 'bomb') continue // a lit bomb is not food
            const px = colX(p.c)
            if (px <= e.x + 6 && px >= e.x - CW * 0.6) { if (!eatP || px > colX(eatP.c)) eatP = p }
        }
        if (eatP) {
            e.eat = 1
            eatP.hp -= def.dps * dt
            continue
        }
        e.eat = 0
        e.x -= def.speed * e.slow * dt
        if (e.x <= HOUSE_X) {
            if (g.mowers[e.r]) {
                g.mowers[e.r] = false
                g.mowerRun[e.r] = 1
                g.events.push({ t: 'mow', r: e.r })
                // the scarecrow sweeps the whole lane at once, so the enemy that
                // tripped it dies with the rest (no race where it re-arrives next
                // tick against a now-spent mower).
                for (const e2 of g.enemies) if (e2.r === e.r) damage(g, e2, 100000)
                cleanDead(g)
            } else {
                g.done = 'lose'
                g.endMsg = `A ${def.name} reached the cottage!`
                g.events.push({ t: 'breach', r: e.r })
            }
        }
    }
}

function defendersStep(g, dt) {
    for (const p of g.plants) {
        const def = PLANTS[p.type]
        if (def.kind === 'shooter' || def.kind === 'frost') {
            const target = g.enemies.some((e) => e.r === p.r && e.x > colX(p.c) - 8 && e.hp > 0)
            p.cool -= dt
            if (target && p.cool <= 0) {
                p.cool = def.rate
                g.projs.push({ r: p.r, x: colX(p.c) + 16, y: rowY(p.r) - 6, vx: 320, dmg: def.dmg, kind: def.kind, slow: def.slow || 1, slowFor: def.slowFor || 0 })
                g.events.push({ t: def.kind === 'frost' ? 'frostshot' : 'shoot', x: colX(p.c) + 16, y: rowY(p.r) - 6 })
            }
        } else if (def.kind === 'lobber') {
            const target = g.enemies.some((e) => e.r === p.r && e.x > colX(p.c))
            p.cool -= dt
            if (target && p.cool <= 0) {
                p.cool = def.rate
                g.projs.push({ r: p.r, x: colX(p.c), y: rowY(p.r), vx: 200, dmg: def.dmg, splash: def.splash, kind: 'lob', lobT: 0 })
                g.events.push({ t: 'lob', x: colX(p.c), y: rowY(p.r) })
            }
        } else if (def.kind === 'bomb') {
            p.fuse -= dt
            if (p.fuse <= 0) {
                p.hp = 0
                g.events.push({ t: 'boom', x: colX(p.c), y: rowY(p.r) })
                for (const e of g.enemies) {
                    if (Math.abs(e.r - p.r) > 1) continue
                    const dx = e.x - colX(p.c), dy = (e.r - p.r) * CH
                    if (Math.hypot(dx, dy) <= def.radius) damage(g, e, def.dmg)
                }
            }
        }
    }
}

function projStep(g, dt) {
    for (const pr of g.projs) {
        pr.x += pr.vx * dt
        if (pr.kind === 'lob') pr.lobT += dt
        if (pr.kind === 'lob') pr.y = rowY(pr.r) - Math.sin(Math.min(1, pr.x / 300) * Math.PI) * 40
        for (const e of g.enemies) {
            if (e.r !== pr.r || e.hp <= 0) continue
            if (Math.abs(e.x - pr.x) <= ENEMIES[e.id].r + 6) {
                if (pr.splash) {
                    g.events.push({ t: 'splat', x: pr.x, y: pr.y })
                    for (const e2 of g.enemies) { if (Math.abs(e2.r - pr.r) <= 0 && Math.abs(e2.x - pr.x) <= pr.splash) damage(g, e2, pr.dmg) }
                } else {
                    damage(g, e, pr.dmg)
                    if (pr.kind === 'frost') { e.slow = pr.slow; e.slowT = pr.slowFor }
                    g.events.push({ t: pr.kind === 'frost' ? 'frosthit' : 'hit', x: pr.x, y: pr.y })
                }
                pr.dead = true
                break
            }
        }
        if (pr.x > W + 20) pr.dead = true
    }
    g.projs = g.projs.filter((p) => !p.dead)
}

function damage(g, e, dmg) { e.hp -= dmg; if (e.hp <= 0 && !e.dead) { e.dead = true; g.score += ENEMIES[e.id].score; g.events.push({ t: 'kill', id: e.id, x: e.x, y: rowY(e.r) }) } }

function cleanDead(g) {
    g.plants = g.plants.filter((p) => p.hp > 0)
    g.enemies = g.enemies.filter((e) => !e.dead)
}

function mowerStep(g, dt) {
    for (let r = 0; r < ROWS; r++) {
        if (g.mowerRun[r] > 0) {
            g.mowerRun[r] += dt * 520
            const mx = g.mowerRun[r]
            for (const e of g.enemies) if (e.r === r && e.x <= mx + 30) damage(g, e, 100000)
            cleanDead(g)
            if (mx > W + 80) g.mowerRun[r] = 0 // the scarecrow has crossed off-screen
        }
    }
}

function bankAcorn(g, d) { d.taken = true; g.acorns += d.val; g.events.push({ t: 'bank', val: d.val, x: d.x, y: d.y }) }
export function bankTap(g, d) { if (!d.taken) bankAcorn(g, d) }

function checkLevelDone(g) {
    if (g.levelClearAt > 0 || g.done) return
    const allSpawned = g.waveIdx >= g.waves.length
    if (allSpawned && g.enemies.length === 0 && g.waves.every((w) => !w.started || w.i >= w.entries.length)) {
        g.levelClearAt = g.sec
        g.score += 250
        g.events.push({ t: 'clear', level: g.level, next: g.level >= LEVELS.length ? null : g.level + 1 })
    }
}

// progress bar 0..1 for this level (wave machine position).
export function waveProgress(g) {
    const done = g.waves.slice(0, g.waveIdx).reduce((a, w) => a + w.entries.length, 0)
    const cur = g.waves[g.waveIdx] ? g.waves[g.waveIdx].i : 0
    return g.totalSpawns ? (done + cur) / g.totalSpawns : 1
}
export function bigWaveUp(g) {
    const cur = g.waves[g.waveIdx]
    return !!(cur && cur.big && cur.started)
}

// ------------------------------------------------------------- bot ----
// Fill order the autopilot uses: economy first (col 0/1), then shooters (col
// 4,3,5,2), wall at col 6, specials reactive. One decision per tick.
function laneThreat(g, r) {
    let min = Infinity
    for (const e of g.enemies) if (e.r === r && e.hp > 0) min = Math.min(min, e.x)
    return min
}
function hasShooter(g, r) {
    return g.plants.some((p) => p.r === r && (PLANTS[p.type].kind === 'shooter' || PLANTS[p.type].kind === 'frost' || PLANTS[p.type].kind === 'lobber'))
}
function countDaisy(g) { return g.plants.filter((p) => p.type === 'daisy').length }

function freeCell(g, r, cols) {
    for (const c of cols) if (c >= 0 && c < COLS && !occupied(g, r, c)) return c
    return -1
}

export function bot(g) {
    if (g.done || g.levelClearAt > 0) return
    const daisies = countDaisy(g)
    const targetD = Math.min(7, 2 + g.level + Math.floor(g.sec / 20))
    const canAfford = (id) => g.acorns >= PLANTS[id].cost && (g.cd[id] || 0) <= 0 && PLANTS[id].unlock <= g.level
    const place = (id, r, cols) => {
        const c = freeCell(g, r, cols)
        if (c < 0) return false
        selectCard(g, g.unlocked.indexOf(id))
        return plant(g, id, r, c)
    }
    const naked = []
    for (let r = 0; r < ROWS; r++) if (!hasShooter(g, r)) naked.push(r)
    naked.sort((a, b) => (laneThreat(g, a) - laneThreat(g, b)) || (a - b))

    // 1. lethal: a threat is at the gate of an undefended lane.
    if (naked.length) {
        const r = naked[0]
        const t = laneThreat(g, r)
        if (t < Infinity && t - HOUSE_X < CW * 2.6) {
            if (canAfford('squirrel') && place('squirrel', r, [3, 4, 2, 5])) return
            if (canAfford('chili') && g.enemies.filter((e) => e.r === r && e.x > HOUSE_X).length >= 2 && place('chili', r, [4, 3, 5])) return
        }
    }
    // 2. reactive: chili a corridor cluster, frost the nearest tank.
    if (canAfford('chili')) {
        for (let k = 0; k < ROWS; k++) {
            const r = (g.botFill + k) % ROWS
            if (g.enemies.filter((e) => e.r === r && e.x > colX(4)).length >= 3 && place('chili', r, [5, 4, 6])) return
        }
    }
    if (canAfford('frost')) {
        let tankR = -1, tankX = Infinity
        for (const e of g.enemies) if ((e.id === 'brute' || e.id === 'warlord') && e.slowT <= 0 && e.x < tankX) { tankX = e.x; tankR = e.r }
        if (tankR >= 0 && place('frost', tankR, [3, 4, 2])) return
    }
    // spend a chili on a lone tank that has no frost on it (no frost before L4).
    if (canAfford('chili')) {
        let tankR = -1, tankX = Infinity
        for (const e of g.enemies) if ((e.id === 'brute' || e.id === 'warlord') && e.x < colX(6.5) && e.x < tankX) { tankX = e.x; tankR = e.r }
        if (tankR >= 0 && place('chili', tankR, [4, 5, 3, 6])) return
    }
    // 3. seed the economy (two daisies), THEN line every naked lane with a
    //    shooter before growing more economy — a half-finished wall is what loses.
    if (canAfford('daisy') && daisies < 2 && place('daisy', g.botFill % ROWS, [0, 1])) { g.botFill++; return }
    if (canAfford('squirrel') && naked.length && place('squirrel', naked[0], [4, 3, 5, 2])) { g.botFill++; return }
    if (canAfford('daisy') && daisies < targetD) {
        if (place('daisy', g.botFill % ROWS, [0, 1]) || place('daisy', (g.botFill + 1) % ROWS, [0, 1])) { g.botFill++; return }
    }
    // 4. deepen the line: a second shooter per lane (keeping a chili/tank reserve),
    //    then walls on threatened lanes.
    if (canAfford('squirrel') && g.acorns >= PLANTS.squirrel.cost + 150) {
        for (let k = 0; k < ROWS; k++) {
            const r = (g.botFill + k) % ROWS
            if (g.plants.filter((p) => p.r === r && PLANTS[p.type].kind === 'shooter').length < 2 && place('squirrel', r, [3, 2, 5])) { g.botFill++; return }
        }
    }
    if (canAfford('hedge')) {
        for (let k = 0; k < ROWS; k++) {
            const r = (g.botFill + k) % ROWS
            if (laneThreat(g, r) < Infinity && place('hedge', r, [6])) { g.botFill++; return }
        }
    }
}

// drive one full tick with the bot (attract autopilot + harness win proof).
export function autoStep(g, dt) {
    bot(g)
    advance(g, dt)
}

// ------------------------------------------------------------ hash ----
export function stateHash(g) {
    let h = 2166136261 >>> 0
    const add = (n) => { h ^= (n | 0); h = Math.imul(h, 16777619) }
    add(g.rs); add(g.tick); add(g.score); add(g.level); add(g.acorns)
    add(Math.round((g.skyT || 0) * 100)); add(g.waveIdx); add(g.spawned); add(g.botFill)
    add(g.cursor.r * 10 + g.cursor.c); add(g.sel); add(g.trowel ? 1 : 0)
    add(g.plants.length); for (const p of g.plants) add(p.r * 10 + p.c + PLANTS[p.type].cost)
    add(g.enemies.length); for (const e of g.enemies) add(Math.round(e.x) + ENEMIES[e.id].hp)
    add(g.projs.length); for (const pr of g.projs) add(pr.r * 40 + Math.round(pr.x))
    for (const m of g.mowers) add(m ? 1 : 0)
    add(g.done ? 7 : 0)
    return h >>> 0
}
