// GAUNTLET — pure simulation. step(state, input) -> state, zero Math.random():
// spawn picks, gold values and Death's entry corner come from a seeded LCG, so
// scripts/gauntletcheck.mjs can audit the rules and replay a pilot run
// hash-for-hash in plain Node.
//
// The load-bearing rules (the ones the harness pins):
//   - health drains every DRAIN ticks; food restores FOOD_HEAL; when hp drops
//     below 30% the narrator shouts "<WHO> NEEDS FOOD, BADLY!".
//   - slam doors ('D') open when you push through and SLAM behind you
//     ("<WHO>: CORRIDOR SEALED BEHIND YOU!" — you may walk back into a closed
//     slam door to force it open again); locked doors ('L') eat one key.
//   - generators pulse monsters of the level roster up to the cap until the
//     generator itself is smashed; smashed generators never spawn again.
//   - a potion clears every roaming monster off the level (not Death);
//     killing this way still pays the monster's points.
//   - when a level's treasure timer runs out, DEATH enters and drains hp
//     point by point while it is on screen.
//   - stairs up clear the level (+1000 x level-weight); the fourth staircase
//     ends the quest. Touching zero hp costs a life and restarts the maze.

import { LEVELS, W, H, HEROES, MONSTERS } from './levels.js'

export { LEVELS, W, H, HEROES, MONSTERS }

export const CFG = {
    turn: 0.042,
    walk: 0.045,
    radius: 0.28,
    drainEvery: 24,
    foodHeal: 45,
    swordCool: 18,
    swordReach: 1.15,
    swordArc: 0.4,
    arrowCool: 22,
    arrowSpeed: 0.30,
    genHp: 10,
    slamClose: 40,
    slamForce: 2,
    lockForce: 1,
    contactR: 0.52,
    monsterAtkCd: 90,
    castCd: 150,
    fireSpeed: 0.16,
    rockSpeed: 0.12,
    deathDrainEvery: 8,
    deathFreeze: 100,
    lives: 3,
    extraLife: 20000,
    levelBonus: 1000,
}

function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

const cellChar = (gs, x, y) => {
    const c = Math.floor(x), r = Math.floor(y)
    if (c < 0 || r < 0 || c >= W || r >= H || !gs.levelData) return '#'
    return gs.levelData.grid[r][c]
}

export const doorAt = (gs, c, r) => gs.doors.find((d) => d.x === c && d.y === r)

// blocked for walkers (hero and non-ghost monsters): stone; doors when closed.
export function blocked(gs, x, y) {
    const ch = cellChar(gs, x, y)
    if (ch === '#') return true
    if (ch === 'D' || ch === 'L') {
        const d = doorAt(gs, Math.floor(x), Math.floor(y))
        return !!d && !d.open && !d.broken
    }
    return false
}

const walkable = (gs, c, r) => {
    const ch = gs.levelData.grid[r][c]
    if (ch === '#') return false
    if (ch === 'D' || ch === 'L') {
        const d = doorAt(gs, c, r)
        return !!d && (d.open || d.broken)
    }
    return true
}

// ---------------------------------------------------------------- setup ----
export function makeGame(seed = 0, heroKey = 'warrior', opts = {}) {
    const gs = {
        seed, heroKey, slack: !!opts.slack, partnerOn: !!opts.partner,
        rng: seed | 0, tick: 0, playT: 0, level: 0,
        lives: CFG.lives, score: 0, gold: 0, keys: 0,
        end: null, events: [], _nextId: 1, upTo: CFG.extraLife,
        hero: null, partner: null, monsters: [], shots: [], items: [], gens: [], doors: [],
        explored: LEVELS.map(() => new Uint8Array(W * H)),
        deathSpawned: false, foodWarnT: 0, deaths: 0, _fwd: false,
    }
    loadLevel(gs, 0)
    return gs
}

function loadLevel(gs, idx) {
    const lv = LEVELS[idx]
    gs.level = idx
    gs.levelData = lv
    gs.doors = lv.doors.map((d) => ({ x: d.x, y: d.y, locked: !!d.lock, open: false, broken: false, closeT: -1 }))
    gs.items = []
    gs.gens = []
    gs.monsters = []
    gs.shots = []
    gs.deathSpawned = false
    gs.playT = 0
    let foodCut = gs.slack ? 1 : 0
    let potionCut = gs.slack ? 1 : 0
    for (const [t, x, y] of lv.props) {
        if (t === 'food' && foodCut > 0) { foodCut--; continue }
        if (t === 'potion' && potionCut > 0) { potionCut--; continue }
        if (t === 'generator') { gs.gens.push({ id: gs._nextId++, x, y, hp: CFG.genHp, alive: true, t: Math.floor(lv.gen.every / 2) }); continue }
        if (MONSTERS[t]) { spawnMonster(gs, t, x, y); continue }
        gs.items.push({ id: gs._nextId++, t, x, y })
    }
    const h = HEROES[gs.heroKey]
    gs.hero = {
        x: lv.start.x, y: lv.start.y, a: lv.start.a,
        hp: gs.heroHpOverride ?? h.hp, maxHp: h.hp, speed: h.speed, power: h.power,
        arrowRange: h.arrow, name: h.name, who: h.who,
        deadT: 0, atkT: 0, atkAnim: 0, arrowT: 0, swingId: 0,
    }
    if (gs.partnerOn && !gs.partnerDone) {
        const p = gs.partnerKey === 'valkyrie' && gs.heroKey === 'valkyrie' ? HEROES.warrior : HEROES[gs.partnerKey || 'valkyrie']
        gs.partner = {
            x: lv.start.x, y: lv.start.y, a: lv.start.a, hp: p.hp, maxHp: p.hp, speed: p.speed,
            power: p.power, name: p.name, atkT: 0, down: false,
        }
    } else gs.partner = null
    markExplored(gs)
}

function spawnMonster(gs, kind, x, y) {
    const m = MONSTERS[kind]
    gs.monsters.push({
        id: gs._nextId++, kind, x, y, hp: m.hp, atkT: 0, castT: Math.floor(gs.tick % 60),
        path: [], repathT: 0, drainT: 0,
    })
}

function addScore(gs, pts, meta) {
    gs.score += pts
    if (gs.score >= gs.upTo) { gs.lives++; gs.upTo += CFG.extraLife; gs.events.push({ type: '1up' }) }
    if (meta) gs.events.push({ type: 'score', pts, ...meta })
}

const say = (gs, text) => gs.events.push({ type: 'say', text })

// ---------------------------------------------------------------- explored ----
function markExplored(gs) {
    const map = gs.explored[gs.level]
    const hc = Math.floor(gs.hero.x), hr = Math.floor(gs.hero.y)
    for (let r = hr - 2; r <= hr + 2; r++) {
        for (let c = hc - 2; c <= hc + 2; c++) {
            if (c < 0 || r < 0 || c >= W || r >= H) continue
            map[r * W + c] = 1
        }
    }
}

// ---------------------------------------------------------------- hero ----
function killHero(gs, how) {
    if (gs.hero.deadT > 0 || gs.end) return
    gs.hero.deadT = CFG.deathFreeze
    gs.lives--
    gs.deaths++
    say(gs, `${gs.hero.who} IS DEAD`)
    gs.events.push({ type: 'death', how, lives: gs.lives })
}

function losClear(gs, x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.ceil(d / 0.25)
    for (let i = 1; i < steps; i++) {
        const t = i / steps
        if (cellChar(gs, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) === '#') return false
    }
    return true
}

function heroHits(gs) {
    const h = gs.hero
    h.atkAnim = CFG.swordCool
    let hitAny = false
    for (const m of gs.monsters) {
        const dx = m.x - h.x, dy = m.y - h.y
        const d = Math.hypot(dx, dy)
        if (d > CFG.swordReach + 0.4) continue
        if (d > 0.6) {
            const dot = (dx * Math.cos(h.a) + dy * Math.sin(h.a)) / d
            if (dot < CFG.swordArc) continue
            if (!losClear(gs, h.x, h.y, m.x, m.y)) continue
        }
        damageMonster(gs, m, h.power + 1, 'sword')
        hitAny = true
    }
    for (const g of gs.gens) {
        if (!g.alive) continue
        const dx = g.x - h.x, dy = g.y - h.y
        const d = Math.hypot(dx, dy)
        if (d > CFG.swordReach + 0.3) continue
        const dot = (dx * Math.cos(h.a) + dy * Math.sin(h.a)) / (d || 1)
        if (dot < CFG.swordArc) continue
        g.hp -= h.power + 2
        gs.events.push({ type: 'genHit', id: g.id, x: g.x, y: g.y })
        if (g.hp <= 0) {
            g.alive = false
            const pts = 500 + gs.level * 100
            addScore(gs, pts, { kind: 'generator' })
            gs.events.push({ type: 'genKill', id: g.id, pts })
            say(gs, 'THE GENERATOR SHATTERS')
        }
        hitAny = true
    }
    gs.events.push({ type: 'sword', hit: hitAny })
}

function damageMonster(gs, m, dmg, via) {
    m.hp -= dmg
    gs.events.push({ type: 'monsterHit', id: m.id, kind: m.kind, via, x: m.x, y: m.y })
    if (m.hp <= 0) {
        const pts = MONSTERS[m.kind].pts
        if (pts > 0) addScore(gs, pts, { kind: m.kind })
        gs.events.push({ type: 'kill', id: m.id, kind: m.kind, pts, x: m.x, y: m.y })
        gs.monsters = gs.monsters.filter((x) => x.id !== m.id)
    }
}

function fireArrow(gs) {
    const h = gs.hero
    gs.shots.push({
        id: gs._nextId++, mine: true, kind: 'arrow',
        x: h.x, y: h.y, dx: Math.cos(h.a), dy: Math.sin(h.a),
        dist: 0, range: h.arrowRange, dmg: h.power + 1,
    })
    gs.events.push({ type: 'shoot' })
}

function losToHero(gs, x, y, range) {
    const h = gs.hero
    const dx = h.x - x, dy = h.y - y
    const d = Math.hypot(dx, dy)
    if (d > range) return false
    const steps = Math.ceil(d / 0.25)
    for (let i = 1; i < steps; i++) {
        const t = i / steps
        if (cellChar(gs, x + dx * t, y + dy * t) === '#') return false
    }
    return d > 1
}

// ---------------------------------------------------------------- doors ----
function tryDoors(gs, nx, ny) {
    const c = Math.floor(nx), r = Math.floor(ny)
    const ch = gs.levelData.grid[r] ? gs.levelData.grid[r][c] : '#'
    if (ch !== 'D' && ch !== 'L') return true
    const d = doorAt(gs, c, r)
    if (!d || d.open || d.broken) return true
    if (ch === 'L') {
        if (gs.keys >= CFG.lockForce) {
            gs.keys -= CFG.lockForce
            d.open = true
            gs.events.push({ type: 'keyUsed', x: c, y: r })
            say(gs, 'THE LOCK YIELDS')
            return true
        }
        say(gs, 'A LOCKED DOOR — FIND A KEY')
        return false
    }
    d.open = true
    d.closeT = -1
    gs.events.push({ type: 'doorOpen', x: c, y: r })
    return true
}

function updateSlamDoors(gs) {
    const hc = Math.floor(gs.hero.x), hr = Math.floor(gs.hero.y)
    for (const d of gs.doors) {
        if (d.locked || d.broken) continue
        if (d.open && d.closeT < 0 && !(d.x === hc && d.y === hr)) d.closeT = CFG.slamClose
        if (d.closeT > 0) d.closeT--
        else if (d.closeT === 0) {
            d.open = false
            d.closeT = -1
            gs.events.push({ type: 'slam', x: d.x, y: d.y })
            say(gs, `${gs.hero.who}: CORRIDOR SEALED BEHIND YOU!`)
        }
        // a closed slam door can be battered open by the sword
        if (!d.open && !d.locked && gs.hero.atkAnim === CFG.swordCool) {
            const dx = d.x + 0.5 - gs.hero.x, dy = d.y + 0.5 - gs.hero.y
            if (Math.hypot(dx, dy) < CFG.swordReach + 0.6) {
                d.hits = (d.hits || 0) + 1
                if (d.hits >= CFG.slamForce) { d.broken = true; gs.events.push({ type: 'doorSmash', x: d.x, y: d.y }) }
            }
        }
    }
}

// ---------------------------------------------------------------- monsters ----
function bfsPath(gs, sc, sr, tc, tr) {
    if (!walkable(gs, tc, tr)) return []
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([sr * W + sc])
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            const path = []
            let k = tr * W + tc
            while (k !== sr * W + sc) {
                path.unshift([k % W, Math.floor(k / W)])
                k = prev.get(k)
                if (k === undefined) return []
            }
            return path
        }
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc
            const key = nr * W + nc
            if (seen.has(key) || nr < 0 || nc < 0 || nr >= H || nc >= W) continue
            if (!walkable(gs, nc, nr)) continue
            seen.add(key); prev.set(key, r * W + c); q.push([nr, nc])
        }
    }
    return []
}

function moveMonster(gs, m, speed) {
    const h = gs.hero
    const kind = MONSTERS[m.kind]
    if (kind.ghost) {
        let dx = h.x - m.x, dy = h.y - m.y
        let d = Math.hypot(dx, dy)
        if (d < 0.05) { dx = Math.cos(gs.tick) ; dy = Math.sin(gs.tick); d = 1 }
        m.x += (dx / d) * speed
        m.y += (dy / d) * speed
        return
    }
    m.repathT--
    if (m.repathT <= 0 || m.path.length === 0) {
        m.path = bfsPath(gs, Math.floor(m.x), Math.floor(m.y), Math.floor(h.x), Math.floor(h.y))
        m.repathT = 24
    }
    const [tc, tr] = m.path.length ? m.path[0] : [Math.floor(h.x), Math.floor(h.y)]
    const tx = tc + 0.5, ty = tr + 0.5
    const dx = tx - m.x, dy = ty - m.y
    const d = Math.hypot(dx, dy)
    if (d < 0.08) { m.path.shift(); return }
    m.x += (dx / d) * speed
    m.y += (dy / d) * speed
}

function updateMonsters(gs) {
    const h = gs.hero
    for (const m of gs.monsters) {
        const kind = MONSTERS[m.kind]
        if (m.atkT > 0) m.atkT--
        const speed = kind.speed * (1 + gs.level * 0.06)
        if (kind.drain) {
            moveMonster(gs, m, speed)
            const d = Math.hypot(m.x - h.x, m.y - h.y)
            if (d < 0.75) {
                m.drainT++
                if (m.drainT % CFG.deathDrainEvery === 0) {
                    h.hp -= 1
                    gs.events.push({ type: 'drain', x: m.x, y: m.y })
                    if (h.hp <= 0) { killHero(gs, 'death'); return }
                }
            }
            continue
        }
        moveMonster(gs, m, speed)
        // melee contact (hero or partner)
        let tx = h.x, ty = h.y, target = 'hero'
        if (gs.partner && !gs.partner.down) {
            const dp = Math.hypot(m.x - gs.partner.x, m.y - gs.partner.y)
            if (dp < Math.hypot(m.x - h.x, m.y - h.y)) { tx = gs.partner.x; ty = gs.partner.y; target = 'partner' }
        }
        if (m.atkT <= 0 && Math.hypot(m.x - tx, m.y - ty) < CFG.contactR) {
            m.atkT = CFG.monsterAtkCd
            gs.events.push({ type: 'hit', kind: m.kind, target })
            if (target === 'hero') {
                h.hp -= kind.dmg
                if (h.hp <= 0) { killHero(gs, m.kind); return }
            } else {
                gs.partner.hp -= kind.dmg
                if (gs.partner.hp <= 0) { gs.partner.down = true; gs.events.push({ type: 'partnerDown' }); gs.partnerDone = true }
            }
        }
        // casters
        if (kind.casts) {
            m.castT--
            if (m.castT <= 0 && losToHero(gs, m.x, m.y, kind.casts === 'fire' ? 8 : 7)) {
                m.castT = CFG.castCd
                const dx = h.x - m.x, dy = h.y - m.y
                const d = Math.hypot(dx, dy) || 1
                gs.shots.push({
                    id: gs._nextId++, mine: false, kind: kind.casts,
                    x: m.x, y: m.y, dx: dx / d, dy: dy / d,
                    dist: 0, range: d + 1, dmg: kind.dmg, overWalls: kind.casts === 'rock',
                })
                gs.events.push({ type: 'cast', kind: kind.casts, x: m.x, y: m.y })
            }
        }
    }
}

function updateShots(gs) {
    const h = gs.hero
    for (const s of gs.shots) {
        s.x += s.dx * (s.kind === 'arrow' ? CFG.arrowSpeed : s.kind === 'fire' ? CFG.fireSpeed : CFG.rockSpeed)
        s.y += s.dy * (s.kind === 'arrow' ? CFG.arrowSpeed : s.kind === 'fire' ? CFG.fireSpeed : CFG.rockSpeed)
        s.dist += s.kind === 'arrow' ? CFG.arrowSpeed : s.kind === 'fire' ? CFG.fireSpeed : CFG.rockSpeed
        if (s.dist > s.range) { s.done = true; continue }
        if (!s.overWalls && cellChar(gs, s.x, s.y) === '#') { s.done = true; continue }
        if (s.mine) {
            for (const m of gs.monsters) {
                if (Math.hypot(m.x - s.x, m.y - s.y) < 0.42) {
                    damageMonster(gs, m, s.dmg, 'arrow')
                    s.done = true
                    break
                }
            }
            if (!s.done) {
                for (const g of gs.gens) {
                    if (g.alive && Math.hypot(g.x - s.x, g.y - s.y) < 0.5) {
                        g.hp -= s.dmg + 1
                        gs.events.push({ type: 'genHit', id: g.id, x: g.x, y: g.y })
                        if (g.hp <= 0) {
                            g.alive = false
                            addScore(gs, 500 + gs.level * 100, { kind: 'generator' })
                            gs.events.push({ type: 'genKill', id: g.id })
                        }
                        s.done = true
                        break
                    }
                }
            }
        } else if (h.deadT === 0 && Math.hypot(h.x - s.x, h.y - s.y) < CFG.contactR) {
            h.hp -= s.dmg
            s.done = true
            gs.events.push({ type: 'hit', kind: s.kind, target: 'hero' })
            if (h.hp <= 0) { killHero(gs, s.kind); return }
        } else if (gs.partner && !gs.partner.down && Math.hypot(gs.partner.x - s.x, gs.partner.y - s.y) < CFG.contactR) {
            gs.partner.hp -= s.dmg
            s.done = true
            if (gs.partner.hp <= 0) { gs.partner.down = true; gs.events.push({ type: 'partnerDown' }); gs.partnerDone = true }
        }
    }
    gs.shots = gs.shots.filter((s) => !s.done)
}

// ---------------------------------------------------------------- generators ----
function updateGens(gs) {
    const lv = gs.levelData
    for (const g of gs.gens) {
        if (!g.alive) continue
        g.t--
        if (g.t <= 0 && gs.monsters.length < lv.gen.cap) {
            g.t = lv.gen.every
            const kind = lv.gen.comp[Math.floor(rand(gs) * lv.gen.comp.length)]
            spawnMonster(gs, kind, g.x, g.y)
            gs.events.push({ type: 'spawn', kind, x: g.x, y: g.y })
        }
    }
}

const rand = (gs) => {
    gs.rng = (gs.rng + 0x6d2b79f5) | 0
    let t = gs.rng
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------- items ----
function updateItems(gs) {
    const h = gs.hero
    for (const it of gs.items) {
        if (it.taken) continue
        if (Math.hypot(it.x - h.x, it.y - h.y) > 0.5) continue
        it.taken = true
        if (it.t === 'key') {
            gs.keys++
            addScore(gs, 200, { kind: 'key' })
            say(gs, 'A KEY!')
            gs.events.push({ type: 'pickup', t: 'key' })
        } else if (it.t === 'food') {
            h.hp = Math.min(h.maxHp, h.hp + CFG.foodHeal)
            addScore(gs, 500, { kind: 'food' })
            say(gs, `${h.who} IS RESTORED`)
            gs.events.push({ type: 'pickup', t: 'food', heal: CFG.foodHeal })
        } else if (it.t === 'potion') {
            if (h.hp > h.maxHp * 0.6 && gs.monsters.filter((m) => !MONSTERS[m.kind].drain).length < 3) continue
            let cleared = 0
            const roamers = gs.monsters.filter((m) => !MONSTERS[m.kind].drain)
            for (const m of roamers) {
                addScore(gs, MONSTERS[m.kind].pts, { kind: m.kind })
                gs.events.push({ type: 'kill', id: m.id, kind: m.kind, pts: MONSTERS[m.kind].pts, x: m.x, y: m.y, potion: true })
                cleared++
            }
            gs.monsters = gs.monsters.filter((m) => MONSTERS[m.kind].drain)
            addScore(gs, 0)
            say(gs, 'THE POTION FLARES — THE HALLS CLEAR!')
            gs.events.push({ type: 'pickup', t: 'potion', cleared })
        } else if (it.t === 'gold') {
            const v = [50, 100, 200, 500][Math.floor(rand(gs) * 4)]
            gs.gold += v
            addScore(gs, v, { kind: 'gold' })
            gs.events.push({ type: 'pickup', t: 'gold', v })
        }
    }
}

// ---------------------------------------------------------------- stairs ----
function checkStairs(gs) {
    const [ex, ey] = gs.levelData.exit
    if (Math.floor(gs.hero.x) !== ex || Math.floor(gs.hero.y) !== ey) return
    const pts = CFG.levelBonus * (gs.level + 1)
    addScore(gs, pts, { kind: 'levelBonus' })
    gs.events.push({ type: 'levelClear', level: gs.level, pts })
    if (gs.level + 1 >= LEVELS.length) {
        gs.end = 'win'
        say(gs, 'THE GAUNTLET IS DONE!')
        gs.events.push({ type: 'win' })
        return
    }
    say(gs, LEVELS[gs.level + 1].name)
    loadLevel(gs, gs.level + 1)
    gs.events.push({ type: 'level', level: gs.level })
}

// ---------------------------------------------------------------- step ----
export function step(gs, inp) {
    gs.tick++
    if (gs.end) return gs
    gs.foodWarnT = Math.max(0, gs.foodWarnT - 1)

    const h = gs.hero
    if (h.deadT > 0) {
        h.deadT--
        if (h.deadT === 0) {
            if (gs.lives <= 0) { gs.end = 'over'; gs.events.push({ type: 'over' }); return gs }
            gs.heroHpOverride = Math.max(80, Math.floor(h.maxHp * 0.6))
            loadLevel(gs, gs.level)
            gs.heroHpOverride = null
            gs.events.push({ type: 'respawn' })
        }
        return gs
    }

    gs.playT++
    if (inp.left) h.a -= CFG.turn
    if (inp.right) h.a += CFG.turn
    let mv = 0
    if (inp.fwd) mv = 1
    else if (inp.back) mv = -0.6
    if (mv !== 0) {
        const sp = CFG.walk * h.speed * mv
        const nx = h.x + Math.cos(h.a) * sp
        const ny = h.y + Math.sin(h.a) * sp
        const R = CFG.radius
        // corner probes are STONE only — doors must stay enterable so the hero
        // can reach the door cell and push it open (the center-cell rule below
        // decides door interaction).
        const stone = (x, y) => cellChar(gs, x, y) === '#'
        const wallHit =
            stone(nx + Math.sign(Math.cos(h.a)) * R, ny) ||
            stone(nx, ny + Math.sign(Math.sin(h.a)) * R) ||
            stone(nx + Math.sign(Math.cos(h.a)) * R, ny + Math.sign(Math.sin(h.a)) * R)
        if (!wallHit) {
            const cc = Math.floor(nx), cr = Math.floor(ny)
            const ch = gs.levelData.grid[cr][cc]
            if ((ch === 'D' || ch === 'L') && mv > 0) { if (tryDoors(gs, nx, ny)) { h.x = nx; h.y = ny } }
            else if ((ch === 'D' || ch === 'L') && mv < 0) {
                if (gs.doors.some((d) => d.x === cc && d.y === cr && (d.open || d.broken))) { h.x = nx; h.y = ny }
            }
            else { h.x = nx; h.y = ny }
        }
    }
    gs._fwd = inp.fwd
    markExplored(gs)

    if (gs.tick % CFG.drainEvery === 0) {
        h.hp -= 1
        if (h.hp <= 0) { killHero(gs, 'starved'); return gs }
    }
    if (h.hp < h.maxHp * 0.3 && gs.foodWarnT === 0) {
        gs.foodWarnT = 600
        say(gs, `${h.name} NEEDS FOOD, BADLY!`)
    }

    if (h.atkT > 0) h.atkT--
    if (h.atkAnim > 0) h.atkAnim--
    if (h.arrowT > 0) h.arrowT--
    if (inp.sword && h.atkT <= 0) { h.atkT = CFG.swordCool; heroHits(gs) }
    if (inp.arrow && h.arrowT <= 0) { h.arrowT = CFG.arrowCool; fireArrow(gs) }

    updateSlamDoors(gs)
    updateMonsters(gs)
    if (gs.end || gs.hero.deadT > 0) return gs
    updateShots(gs)
    if (gs.end || gs.hero.deadT > 0) return gs
    updateGens(gs)
    updatePartner(gs)
    updateItems(gs)
    checkStairs(gs)

    if (!gs.deathSpawned && gs.playT >= gs.levelData.deathAt) {
        gs.deathSpawned = true
        const corners = [[1.5, 1.5], [W - 1.5, 1.5], [1.5, H - 1.5], [W - 1.5, H - 1.5]]
        let best = corners[0], bd = -1
        for (const c of corners) {
            const d = Math.hypot(c[0] - h.x, c[1] - h.y)
            if (d > bd) { bd = d; best = c }
        }
        spawnMonster(gs, 'death', best[0], best[1])
        gs.events.push({ type: 'deathSpawn', x: best[0], y: best[1] })
        say(gs, 'DEATH WALKS THE MAZE!')
    }
    return gs
}

function updatePartner(gs) {
    const p = gs.partner
    if (!p || p.down) return
    const h = gs.hero
    const tx = h.x - Math.cos(h.a) * 1.1
    const ty = h.y - Math.sin(h.a) * 1.1
    const dx = tx - p.x, dy = ty - p.y
    const d = Math.hypot(dx, dy)
    if (d > 0.5) {
        const sp = CFG.walk * p.speed * 1.15
        const nx = p.x + (dx / d) * sp, ny = p.y + (dy / d) * sp
        if (!blocked(gs, nx, ny)) { p.x = nx; p.y = ny }
        else if (!blocked(gs, nx, p.y)) p.x = nx
        else if (!blocked(gs, p.x, ny)) p.y = ny
    }
    if (p.atkT > 0) { p.atkT--; return }
    for (const m of gs.monsters) {
        if (Math.hypot(m.x - p.x, m.y - p.y) < 1.25) {
            p.atkT = 30
            damageMonster(gs, m, p.power, 'partner')
            gs.events.push({ type: 'partnerHit', x: p.x, y: p.y })
            break
        }
    }
}

// ---------------------------------------------------------------- hash ----
export function stateHash(gs) {
    const h = gs.hero
    const parts = [
        gs.tick, gs.level, gs.lives, gs.score, gs.keys, gs.gold, gs.end || '-',
        h.x.toFixed(2), h.y.toFixed(2), h.a.toFixed(3), h.hp, h.deadT,
        gs.deathSpawned ? 1 : 0,
        gs.explored.map((m) => m.reduce((a, b) => a + b, 0)).join(','),
        ...gs.items.map((it) => `${it.t}${it.x.toFixed(1)},${it.y.toFixed(1)}${it.taken ? 'T' : ''}`),
        ...gs.gens.map((g) => `${g.id}${g.alive ? 1 : 0}${g.hp}`),
        ...gs.doors.map((d) => `${d.x},${d.y}${d.open ? 'O' : ''}${d.broken ? 'B' : ''}`),
        ...gs.monsters.map((m) => `${m.id}${m.kind}${m.x.toFixed(2)},${m.y.toFixed(2)},h${m.hp}`),
        ...gs.shots.map((s) => `${s.id}${s.kind}${s.x.toFixed(2)},${s.y.toFixed(2)}`),
    ]
    return fnv(parts.join('|'))
}

export function clone(gs) {
    const c = JSON.parse(JSON.stringify(gs))
    c.explored = gs.explored.map((m) => Uint8Array.from(m))
    return c
}
