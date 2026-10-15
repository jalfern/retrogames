// BUBBLE BOBBLE — pure simulation. step(gs, inputs) -> gs, zero Math.random():
// every layout, spawn and oscillation comes from levels.js data + the tick
// clock, so scripts/bobcheck.mjs can audit the rules and replay a pilot run
// hash-for-hash in plain Node.
//
// The load-bearing rules (the ones the harness pins):
//   - a bubble that touches a free enemy TRAPS it; the trapped bubble floats
//     up; touch it to pop: chain pay CHAIN_PAY[n] and fruit/transform drops.
//   - an un-popped trap releases the enemy ANGRY after ESCAPE ticks and the
//     chain resets; max-size bubbles block walking; small ones pass through.
//   - letter bubbles carry E,X,T,E,N,D in order; all six = EXTEND = 1UP.
//   - water turns walkers into snails (slow, still deadly, still trappable);
//     blowing a bubble in the water makes it rise.
//   - chain 4..7 drops a transform (red fire / cyan double / green speed /
//     pink long); chain 9+ drops LIGHTNING, which zaps every free enemy on
//     screen into fruit. von Blubba is the one thing it does not touch.
//   - linger past lv.blubbaAt and BARON VON BLUBBA arrives — a HURRY UP!
//     warning leads him by hurryTicks. He is unkillable; the door is the
//     only answer.
//   - the door opens when the roster is dead; walk in to take the level.
//     100 levels -> win. Bosses (every 20th) need three bubble hits.

import {
    CELL, COLS, ROWS, W, H, FIELD_Y0, FLOOR_ROW,
    genLevel, LEVEL_COUNT, chainPay, CHAIN_PAY, FRUITS, FRUIT_POINTS,
    LETTERS, POWERS, POWER_TICKS, BOSS_POINTS, LEVEL_BONUS,
} from './levels.js'

export { W, H, CELL, COLS, ROWS, FIELD_Y0, FLOOR_ROW }

export const CFG = {
    gravity: 0.22, jumpV: -4.4, walkSpd: 1.1, fastSpd: 1.55, climbSpd: 1.1,
    terminal: 3.6,
    bubbleV: 1.6, bubbleGrow: 0.09, bubbleMax: 10, bubbleLife: 260,
    bubbleCool: 14, popR: 8,
    floatV: -0.42, escapeTicks: 300, angryMul: 1.6,
    flameV: 3, flameLife: 40, flamePts: 200,
    fruitLife: 540, letterLife: 420, powerLife: 600,
    respawn: 120, invuln: 150, clearPause: 150,
    blubbaSpd: 2.05, hurryTicks: 90,
    extraLife: 20000, maxLives: 6,
    bossHp: 3, bossHitPts: 500, bossDiveSpd: 1.8,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const half = CELL / 2
const platTop = (row) => FIELD_Y0 + row * CELL

function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

// ---------------------------------------------------------------- setup ----
function makePlayer(gs, idx) {
    const lv = gs.lv
    return {
        id: idx, x: (lv.entry.col * CELL + half), y: FIELD_Y0 + lv.entry.row * CELL + 8,
        vx: 0, vy: 0, dir: 1, onGround: false, climbing: false, dropT: 0,
        deadT: 0, invuln: 90, power: null, powerT: 0, cool: 0,
        moving: false, inWater: false, walkT: 0,
    }
}

export function makeGame(seed = 0, { players = 1 } = {}) {
    const gs = {
        seed, playersN: Math.max(1, Math.min(2, players)),
        tick: 0, score: 0, lives: 3, level: 0, chain: 0, letterProg: 0,
        kills: 0, end: null, events: [], _nextId: 1, upTo: CFG.extraLife,
        levelPhase: 'play', phaseT: 0, lingerT: 0, blubbaWarned: false, bubbleSeq: 0,
        blubbaNext: 0, players: [], bubbles: [], enemies: [], items: [], blubbas: [],
        door: { x: 0, y: 0, open: false },
    }
    startLevel(gs, 0)
    return gs
}

function startLevel(gs, level) {
    gs.level = level
    gs.lv = genLevel(level)
    gs.chain = 0
    gs.kills = 0
    gs.levelPhase = 'play'
    gs.phaseT = 0
    gs.lingerT = 0
    gs.bubbles = []
    gs.items = []
    gs.blubbas = []
    gs.blubbaWarned = false
    gs.blubbaNext = gs.lv.blubbaAt
    gs.door = { x: (gs.lv.door.col * CELL + half), y: platTop(gs.lv.door.row) - 12, open: false }
    gs.players = []
    for (let i = 0; i < gs.playersN; i++) {
        const p = makePlayer(gs, i)
        p.x += i * 14
        gs.players.push(p)
    }
    gs.enemies = gs.lv.spawns.map((s, i) => spawnEnemy(gs, s, i))
    gs.events.push({ type: 'level', level: level + 1, name: gs.lv.name })
}

function spawnEnemy(gs, s, i) {
    let col = s.col
    // never materialise on top of the entry column — the classic spawns away
    if (s.kind === 'pulppul' && Math.abs(col - gs.lv.entry.col) <= 3) col = COLS - 1 - col
    const e = {
        id: gs._nextId++, kind: s.kind,
        x: (col * CELL + half), y: platTop(s.row) - 8,
        dir: (gs.seed + i) % 2 === 0 ? 1 : -1,
        state: s.kind === 'pulppul' ? 'float' : s.kind === 'boss' ? 'boss' : 'walk',
        trapT: 0, angry: false, snail: false, hp: s.kind === 'boss' ? CFG.bossHp : 1,
        span: null, phase: i * 41, diveT: 0, home: { x: (col * CELL + half), y: platTop(s.row) - 8 },
    }
    if (e.state === 'walk') {
        e.span = gs.lv.platforms.find((p) => p.row === s.row && s.col >= p.c0 && s.col <= p.c1) ||
            { row: FLOOR_ROW, c0: 0, c1: COLS - 1 }
        e.y = platTop(e.span.row) - 8
        if (gs.lv.water && e.span.row >= FLOOR_ROW) e.y = H - 8
    }
    return e
}

// ---------------------------------------------------------------- score ----
function addScore(gs, pts, meta) {
    gs.score += pts
    if (gs.score >= gs.upTo) { gs.lives = Math.min(CFG.maxLives, gs.lives + 1); gs.upTo += CFG.extraLife; gs.events.push({ type: '1up' }) }
    if (pts > 0) gs.events.push({ type: 'score', pts, ...meta })
}

// ---------------------------------------------------------------- physics ----
function landSurface(gs, x, feetPrev, feetNew) {
    if (feetNew < feetPrev) return null
    let best = null
    const consider = (yTop) => {
        if (feetPrev <= yTop + 1 && feetNew >= yTop && (best === null || yTop < best)) best = yTop
    }
    for (const p of gs.lv.platforms) {
        if (x >= p.c0 * CELL - 2 && x <= (p.c1 + 1) * CELL + 2) consider(platTop(p.row))
    }
    consider(H) // floor
    return best
}

function ladderAt(gs, p) {
    for (const l of gs.lv.ladders) {
        const lx = (l.col * CELL + half)
        const topY = platTop(l.rowTop)
        const botY = l.rowBot >= FLOOR_ROW ? H : platTop(l.rowBot)
        if (Math.abs(p.x - lx) < 7 && p.y + 8 >= topY - 6 && p.y + 8 <= botY + 4) return { l, lx, topY, botY }
    }
    return null
}

function updatePlayer(gs, p, inp) {
    if (p.deadT > 0) return
    const waterTop = gs.lv.water ? H - CELL : H + 1
    p.inWater = p.y + 8 > waterTop
    const left = !!inp.left, right = !!inp.right, up = !!inp.up, down = !!inp.down
    p.moving = false

    const lad = ladderAt(gs, p)
    if (lad && up && p.y + 8 > lad.topY + 2) p.climbing = true
    if (lad && down && p.onGround && Math.abs(p.y + 8 - lad.topY) < 4) p.climbing = true

    if (p.climbing && lad) {
        p.vy = 0
        if (up) p.vy = -CFG.climbSpd
        else if (down) p.vy = CFG.climbSpd
        if (left) { p.vx = -0.8 } else if (right) { p.vx = 0.8 } else p.vx = 0
        p.y += p.vy
        p.x = clamp(p.x + p.vx, half, W - half)
        if (p.y + 8 <= lad.topY) { p.y = lad.topY - 8; p.climbing = false; p.onGround = true; p.vy = 0 }
        if (p.y + 8 >= lad.botY) { p.y = lad.botY - 8; p.climbing = false; p.onGround = lad.botY >= H; p.vy = 0 }
        if (Math.abs(p.x - lad.lx) >= 8) p.climbing = false
    } else {
        const spd = p.power === 'green' ? CFG.fastSpd : CFG.walkSpd
        if (left) { p.vx = -spd; p.dir = -1; p.moving = true }
        else if (right) { p.vx = spd; p.dir = 1; p.moving = true }
        else p.vx = 0
        const g = p.inWater ? CFG.gravity * 0.22 : CFG.gravity
        p.vy = Math.min(CFG.terminal * (p.inWater ? 0.35 : 1), p.vy + g)
        if (p.inWater && up) p.vy = -1.0
        if (p.onGround) {
            if (up) { p.vy = CFG.jumpV * (p.inWater ? 0.45 : 1); p.onGround = false }
            else if (down && p.dropT <= 0) { p.onGround = false; p.dropT = 14 }
        }
        const feetPrev = p.y + 8
        p.x = clamp(p.x + p.vx, half, W - half)
        p.y += p.vy
        if (p.dropT > 0) p.dropT--
        const surf = p.vy >= 0 && p.dropT <= 0 ? landSurface(gs, p.x, feetPrev, p.y + 8) : null
        if (surf !== null && p.vy >= 0) { p.y = surf - 8; p.vy = 0; p.onGround = true }
        else p.onGround = false
        p.y = clamp(p.y, FIELD_Y0 + 8, H - 8)
        if (p.y >= H - 8) p.onGround = true
    }
    if (p.invuln > 0) p.invuln--
    if (p.cool > 0) p.cool--
    if (p.powerT > 0) { p.powerT--; if (p.powerT === 0) p.power = null }

    // ---- fire a bubble / flame
    if (inp.fire && p.cool <= 0) {
        const mine = gs.bubbles.filter((b) => b.owner === p.id).length
        if (p.power === 'red') {
            gs.bubbles.push({ id: gs._nextId++, kind: 'flame', owner: p.id, x: p.x + p.dir * 10, y: p.y, vx: p.dir * CFG.flameV, vy: 0, r: 7, max: CFG.bubbleMax, life: CFG.flameLife, letter: null, trapped: null, hitIds: [] })
            p.cool = 10
            gs.events.push({ type: 'flame', x: p.x, y: p.y })
        } else if (mine < (p.power === 'cyan' ? 2 : 1)) {
            const long = p.power === 'pink'
            const letterIdx = gs.bubbleSeq = (gs.bubbleSeq || 0) + 1
            const hasLetter = letterIdx % 7 === 3 && gs.letterProg < 6
            gs.bubbles.push({
                id: gs._nextId++, kind: gs.lv.water && p.inWater ? 'water' : 'bubble', owner: p.id,
                x: p.x + p.dir * 10, y: p.y - 2, vx: p.dir * (long ? CFG.bubbleV * 1.7 : CFG.bubbleV), vy: gs.lv.water && p.inWater ? -0.8 : 0,
                r: 5, max: long ? 12 : CFG.bubbleMax, life: CFG.bubbleLife,
                letter: hasLetter ? LETTERS[gs.letterProg] : null, trapped: null, hitIds: null,
            })
            p.cool = CFG.bubbleCool
            gs.events.push({ type: 'blow', x: p.x, y: p.y })
        }
    }
}

// ---------------------------------------------------------------- bubbles ----
function popTrapped(gs, b, byFlame) {
    const e = gs.enemies.find((x) => x.id === b.trapped)
    b.dead = true
    if (!e || e.state !== 'trap') return
    gs.enemies = gs.enemies.filter((x) => x.id !== e.id)
    gs.kills++
    if (byFlame) {
        addScore(gs, CFG.flamePts, { kind: 'flameKill' })
        gs.events.push({ type: 'flameKill', x: e.x, y: e.y, pts: CFG.flamePts })
    } else {
        gs.chain++
        const pts = chainPay(gs.chain - 1)
        addScore(gs, pts, { kind: 'pop', chain: gs.chain })
        gs.events.push({ type: 'pop', chain: gs.chain, pts, x: e.x, y: e.y, kind: e.kind })
    }
    releaseDrop(gs, e.x, e.y, gs.chain, b.letter)
}

function releaseDrop(gs, x, y, chain, letter) {
    if (letter) gs.items.push({ id: gs._nextId++, kind: 'letter', ch: letter, x, y, vy: 0, life: CFG.letterLife, grounded: false })
    if (chain >= 9 && chain % 2 === 1) gs.items.push({ id: gs._nextId++, kind: 'lightning', x, y: y - 10, vy: 0, life: 420, grounded: false })
    else if (chain >= 4 && gs.kills % 2 === 0) {
        const pw = POWERS[Math.min(7, chain)]
        if (!gs.items.some((it) => it.kind === 'power' && it.power === pw)) {
            gs.items.push({ id: gs._nextId++, kind: 'power', power: pw, x, y: y - 10, vy: 0, life: CFG.powerLife, grounded: false })
        }
    } else {
        const fk = (gs.kills + gs.seed) % FRUITS.length
        gs.items.push({ id: gs._nextId++, kind: 'fruit', fruit: fk, x, y, vy: 0, life: CFG.fruitLife, grounded: false })
    }
}

function enemyTouch(gs, e, b) {
    return Math.abs(e.x - b.x) < b.r + 7 && Math.abs(e.y - b.y) < 14
}

function updateBubbles(gs) {
    for (const b of gs.bubbles) {
        if (!b.trapped) b.life--
        if (b.kind === 'flame') {
            b.x += b.vx
            if (b.x < 6 || b.x > W - 6) b.life = 0
            for (const e of gs.enemies) {
                if (e.state === 'trap' || b.hitIds.includes(e.id)) continue
                const hitR = e.kind === 'boss' ? 18 : 9
                if (Math.abs(e.x - b.x) < hitR + 5 && Math.abs(e.y - b.y) < 14) {
                    b.hitIds.push(e.id)
                    if (e.kind === 'boss') hitBoss(gs, e, 1)
                    else killByFlame(gs, e)
                }
            }
            for (const o of gs.bubbles) if (o !== b && o.trapped && !o.dead && Math.abs(o.x - b.x) < o.r + 6 && Math.abs(o.y - b.y) < 14) popTrapped(gs, o, true)
            continue
        }
        b.r = Math.min(b.max, b.r + CFG.bubbleGrow)
        if (b.trapped) {
            b.vy = CFG.floatV
            b.vx = Math.sin((gs.tick + b.id * 31) / 34) * 0.28
            if (b.y < FIELD_Y0 + 18) { b.y = FIELD_Y0 + 18; b.vy = 0 }
            const e = gs.enemies.find((x) => x.id === b.trapped)
            if (!e) { b.dead = true; continue }
            e.x = b.x; e.y = b.y
            e.trapT++
            if (e.trapT >= CFG.escapeTicks) {
                b.dead = true
                e.state = e.home ? 'walk' : 'float'
                if (e.kind === 'pulppul') e.state = 'float'
                e.angry = true
                gs.chain = 0
                gs.events.push({ type: 'escape', id: e.id, x: e.x, y: e.y })
                continue
            }
        } else {
            if (b.life < 50) b.r = Math.max(0, b.r - CFG.bubbleGrow * 1.6)
        }
        b.x += b.vx
        b.y += b.vy
        if (b.x < b.r + 1) { b.x = b.r + 1; b.vx = 0 }
        if (b.x > W - b.r - 1) { b.x = W - b.r - 1; b.vx = 0 }
        if (b.r <= 0) {
            b.dead = true
            if (b.letter) gs.items.push({ id: gs._nextId++, kind: 'letter', ch: b.letter, x: b.x, y: b.y, vy: 0, life: CFG.letterLife, grounded: false })
            if (b.trapped) {
                const e = gs.enemies.find((x) => x.id === b.trapped)
                if (e) {
                    e.state = e.kind === 'pulppul' ? 'float' : 'walk'
                    e.angry = true
                    gs.chain = 0
                    gs.events.push({ type: 'escape', id: e.id, x: e.x, y: e.y })
                }
            }
            continue
        }
        // max-size bubbles block the players' walk
        if (b.r >= b.max - 0.5 && !b.trapped) {
            for (const p of gs.players) {
                if (p.deadT > 0) continue
                if (Math.abs(p.y - b.y) < 12 && Math.abs(p.x - b.x) < b.r + 7 && p.vx !== 0 && Math.sign(p.vx) === Math.sign(b.x - p.x)) {
                    p.x = clamp(b.x - Math.sign(b.x - p.x) * (b.r + 7), half, W - half)
                    p.vx = 0
                }
            }
        }
        // free enemy into a bubble
        if (!b.trapped) {
            const boss = gs.enemies.find((e) => e.kind === 'boss')
            if (boss && Math.abs(boss.x - b.x) < 18 + b.r && Math.abs(boss.y - b.y) < 18) {
                hitBoss(gs, boss, 1)
                b.dead = true
                continue
            }
            for (const e of gs.enemies) {
                if (e.state === 'trap' || e.kind === 'boss') continue
                if (enemyTouch(gs, e, b)) {
                    if (b.kind === 'water' || b.r >= b.max * 0.6) {
                        b.trapped = e.id
                        e.state = 'trap'
                        e.trapT = 0
                        e.angryPrev = e.angry
                        gs.events.push({ type: 'trap', id: e.id, kind: e.kind, x: e.x, y: e.y })
                    }
                    break
                }
            }
        }
        // player pops (trapped = kill; free = harmless pop)
        if (!b.dead) {
            for (const p of gs.players) {
                if (p.deadT > 0) continue
                if (Math.abs(p.x - b.x) < b.r + CFG.popR - 4 && Math.abs(p.y - b.y) < 13) {
                if (b.trapped) { popTrapped(gs, b, false); break }
                b.dead = true
                if (b.letter) gs.items.push({ id: gs._nextId++, kind: 'letter', ch: b.letter, x: b.x, y: b.y, vy: 0, life: CFG.letterLife, grounded: false })
                gs.events.push({ type: 'popFree', x: b.x, y: b.y })
                break
                }
            }
        }
    }
    gs.bubbles = gs.bubbles.filter((b) => !b.dead && b.life > 0)
}

function killByFlame(gs, e) {
    gs.enemies = gs.enemies.filter((x) => x.id !== e.id)
    gs.kills++
    addScore(gs, CFG.flamePts, { kind: 'flameKill' })
    gs.events.push({ type: 'flameKill', x: e.x, y: e.y, pts: CFG.flamePts, kind: e.kind })
    releaseDrop(gs, e.x, e.y, 1, null)
}

function hitBoss(gs, e, n) {
    e.hp -= n
    addScore(gs, CFG.bossHitPts, { kind: 'bossHit' })
    gs.events.push({ type: 'bossHit', id: e.id, hp: e.hp, x: e.x, y: e.y })
    if (e.hp <= 0) {
        gs.enemies = gs.enemies.filter((x) => x.id !== e.id)
        gs.kills++
        addScore(gs, BOSS_POINTS, { kind: 'bossKill' })
        gs.events.push({ type: 'bossKill', x: e.x, y: e.y, pts: BOSS_POINTS })
        for (let i = 0; i < 6; i++) gs.items.push({ id: gs._nextId++, kind: 'fruit', fruit: i % FRUITS.length, x: clamp(e.x + (i - 3) * 14, half, W - half), y: e.y, vy: -1 - (i % 3) * 0.4, life: CFG.fruitLife, grounded: false })
    }
}

// ---------------------------------------------------------------- enemies ----
function updateEnemies(gs) {
    for (const e of gs.enemies) {
        if (e.state === 'trap') continue
        const speedMul = e.angry ? CFG.angryMul : 1
        if (e.state === 'float') {
            e.x += Math.cos((gs.tick + e.phase) / (e.angry ? 46 : 64)) * (e.angry ? 1.3 : 0.75)
            e.y += Math.sin((gs.tick + e.phase) / (e.angry ? 30 : 52)) * (e.angry ? 0.85 : 0.55)
            if (e.x < half) e.x = half
            if (e.x > W - half) e.x = W - half
            e.y = clamp(e.y, FIELD_Y0 + 12, H - 12)
        } else if (e.state === 'boss') {
            e.diveT++
            const dx = gs.players[0] && gs.players[0].deadT === 0 ? gs.players[0].x : W / 2
            e.x += clamp(dx - e.x, -1, 1) * 0.9
            const ty = platTop(3) - 8 + Math.sin(e.diveT / 47) * 30 + (Math.sin(e.diveT / 131) > 0.8 ? 60 : 0)
            e.y += clamp(ty - e.y, -CFG.bossDiveSpd, CFG.bossDiveSpd)
            e.x = clamp(e.x, 20, W - 20)
        } else {
            // walker / snail
            const waterTop = gs.lv.water ? H - CELL : H + 1
            const wasSnail = e.snail
            e.snail = e.kind !== 'pulppul' && e.y + 8 > waterTop
            if (!wasSnail && e.snail) gs.events.push({ type: 'snail', id: e.id })
            let sp = e.kind === 'tongling' ? 1.0 : 0.55
            if (e.snail) sp = 0.3
            sp *= speedMul
            if (e.kind === 'tongling' && !e.snail) {
                const p = nearestPlayer(gs, e)
                if (p && Math.abs(p.y - e.y) < 10 && Math.sign(p.x - e.x) === e.dir) sp = Math.max(sp, 1.7 * speedMul)
            }
            e.x += e.dir * sp
            const lo = e.span.c0 * CELL + half, hi = e.span.c1 * CELL + half
            if (e.x <= lo) { e.x = lo; e.dir = 1 }
            if (e.x >= hi) { e.x = hi; e.dir = -1 }
            e.y = e.snail ? H - 8 : platTop(e.span.row) - 8
            // walkers drop into the water line when the floor is water
            if (gs.lv.water && e.span.row >= FLOOR_ROW) e.y = H - 8
        }
        // deadly touch
        for (const p of gs.players) {
            if (p.deadT > 0 || p.invuln > 0) continue
            const hitR = e.kind === 'boss' ? 16 : 8
            if (Math.abs(p.x - e.x) < hitR + 6 && Math.abs(p.y - e.y) < 13) {
                killPlayer(gs, p, e.kind)
                return
            }
        }
    }
}

function nearestPlayer(gs, e) {
    let best = null, d = Infinity
    for (const p of gs.players) {
        if (p.deadT > 0) continue
        const dd = Math.hypot(p.x - e.x, p.y - e.y)
        if (dd < d) { d = dd; best = p }
    }
    return best
}

// ---------------------------------------------------------------- items ----
function updateItems(gs) {
    for (const it of gs.items) {
        it.life--
        if (!it.grounded) {
            it.vy = Math.min(2, (it.vy || 0) + 0.12)
            const prevFeet = it.y + 6 - it.vy
            it.y += it.vy
            const surf = landSurface(gs, it.x, prevFeet, it.y + 6)
            if (surf !== null && it.vy >= 0) { it.y = surf - 6; it.vy = 0; it.grounded = true }
            if (it.y > H - 6) { it.y = H - 6; it.vy = 0; it.grounded = true }
        }
        for (const p of gs.players) {
            if (p.deadT > 0 || it.eaten) continue
            if (Math.abs(p.x - it.x) < 11 && Math.abs(p.y - it.y) < 13) {
                it.eaten = true
                if (it.kind === 'fruit') {
                    const pts = FRUIT_POINTS[it.fruit % FRUIT_POINTS.length]
                    addScore(gs, pts, { kind: 'fruit', fruit: FRUITS[it.fruit % FRUITS.length] })
                    gs.events.push({ type: 'fruit', pts, fruit: FRUITS[it.fruit % FRUITS.length], x: it.x, y: it.y })
                } else if (it.kind === 'letter') {
                    gs.letterProg++
                    gs.events.push({ type: 'letter', ch: it.ch, prog: gs.letterProg })
                    if (gs.letterProg >= LETTERS.length) {
                        gs.lives = Math.min(CFG.maxLives, gs.lives + 1)
                        gs.letterProg = 0
                        gs.events.push({ type: 'extend' })
                    }
                } else if (it.kind === 'power') {
                    p.power = it.power
                    p.powerT = POWER_TICKS
                    gs.events.push({ type: 'power', power: it.power })
                } else if (it.kind === 'lightning') {
                    gs.events.push({ type: 'lightning' })
                    zap(gs)
                }
                break
            }
        }
    }
    gs.items = gs.items.filter((it) => !it.eaten && it.life > 0)
}

function zap(gs) {
    const zapped = gs.enemies.filter((e) => e.state !== 'trap')
    gs.enemies = gs.enemies.filter((e) => e.state === 'trap')
    for (const e of zapped) {
        if (e.kind === 'boss') hitBoss(gs, e, CFG.bossHp)
        else {
            gs.kills++
            addScore(gs, 100, { kind: 'zap' })
            gs.events.push({ type: 'zapKill', id: e.id, x: e.x, y: e.y })
            releaseDrop(gs, e.x, e.y, 1, null)
        }
    }
    // von Blubba is unkillable — the lightning passes right through him
}

// ---------------------------------------------------------------- blubba ----
function updateBlubba(gs) {
    if (gs.levelPhase !== 'play') return
    gs.lingerT++
    if (!gs.blubbaWarned && gs.lingerT >= gs.blubbaNext - CFG.hurryTicks) {
        gs.blubbaWarned = true
        gs.events.push({ type: 'blubbaWarn' })
    }
    if (!gs.blubbas.length && gs.lingerT >= gs.blubbaNext) {
        gs.blubbas.push({ id: gs._nextId++, x: -12, y: FIELD_Y0 + 24 })
        gs.events.push({ type: 'blubba' })
    }
    for (const b of gs.blubbas) {
        const p = nearestPlayer(gs, b)
        if (!p) continue
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1
        b.x += (dx / d) * CFG.blubbaSpd
        b.y += (dy / d) * CFG.blubbaSpd
        if (p.invuln <= 0 && d < 12) killPlayer(gs, p, 'blubba')
    }
}

// ---------------------------------------------------------------- death ----
function killPlayer(gs, p, how) {
    if (p.deadT > 0 || gs.end || gs.levelPhase !== 'play') return
    p.deadT = CFG.respawn
    gs.lives--
    gs.events.push({ type: 'death', how, lives: gs.lives })
}

function postUpdate(gs) {
    let anyAlive = false
    for (const p of gs.players) {
        if (p.deadT > 0) {
            p.deadT--
            if (p.deadT === 0) {
                if (gs.lives <= 0) { gs.end = 'over'; return }
                // the screen restarts (classic): enemies and board come back,
                // score and letters stay
                const keepScore = gs.score, keepLetters = gs.letterProg, keepLives = gs.lives
                startLevel(gs, gs.level)
                gs.score = keepScore; gs.letterProg = keepLetters; gs.lives = keepLives
                gs.events.push({ type: 'screenReset' })
                return
            }
        } else anyAlive = true
    }
    if (!anyAlive && gs.lives <= 0) gs.end = 'over'
}

// ---------------------------------------------------------------- step ----
export function step(gs, inputs) {
    gs.tick++
    if (gs.end) return gs
    const arr = Array.isArray(inputs) ? inputs : [inputs || {}]

    if (gs.levelPhase === 'clear') {
        gs.phaseT--
        if (gs.phaseT <= 0) {
            if (gs.level + 1 >= LEVEL_COUNT) { gs.end = 'win'; gs.events.push({ type: 'win' }); return gs }
            startLevel(gs, gs.level + 1)
        }
        return gs
    }

    postUpdate(gs)
    if (gs.end) return gs
    for (let i = 0; i < gs.players.length; i++) updatePlayer(gs, gs.players[i], arr[i] || {})
    updateBubbles(gs)
    updateEnemies(gs)
    if (gs.end) return gs
    updateItems(gs)
    updateBlubba(gs)

    // door
    const cleared = gs.enemies.length === 0
    if (cleared && !gs.door.open) {
        gs.door.open = true
        addScore(gs, LEVEL_BONUS(gs.level), { kind: 'levelBonus' })
        gs.events.push({ type: 'doorOpen', level: gs.level + 1, pts: LEVEL_BONUS(gs.level) })
    }
    if (gs.door.open) {
        for (const p of gs.players) {
            if (p.deadT > 0) continue
            if (Math.abs(p.x - gs.door.x) < 12 && Math.abs(p.y - gs.door.y) < 18) {
                gs.levelPhase = 'clear'
                gs.phaseT = CFG.clearPause
                gs.events.push({ type: 'levelClear', level: gs.level + 1 })
                break
            }
        }
    }
    return gs
}

// ---------------------------------------------------------------- hash ----
export function stateHash(gs) {
    const parts = [
        gs.tick, gs.level, gs.lives, gs.score, gs.chain, gs.letterProg, gs.kills, gs.end || '-', gs.levelPhase,
        ...gs.players.map((p) => `${p.id}${p.x.toFixed(2)},${p.y.toFixed(2)}${p.onGround ? 'G' : ''}${p.climbing ? 'C' : ''}${p.power || ''}${p.deadT}`),
        ...gs.bubbles.map((b) => `${b.id}${b.kind}${b.x.toFixed(1)},${b.y.toFixed(1)}r${b.r.toFixed(1)}t${b.trapped || 0}${b.letter || ''}`),
        ...gs.enemies.map((e) => `${e.id}${e.kind}${e.state}${e.x.toFixed(1)},${e.y.toFixed(1)}d${e.dir}${e.angry ? 'A' : ''}${e.snail ? 'S' : ''}h${e.hp}${e.trapT}`),
        ...gs.items.map((it) => `${it.id}${it.kind}${it.x.toFixed(1)},${it.y.toFixed(1)}l${it.life}`),
        ...gs.blubbas.map((b) => `${b.id}${b.x.toFixed(1)},${b.y.toFixed(1)}`),
        gs.door.open ? 'DOOR' : '-',
    ]
    return fnv(parts.join('|'))
}

export function clone(gs) {
    const c = JSON.parse(JSON.stringify(gs))
    if (c.lv) c.lv._g = null // the planner graph cache is a Map — rebuild, don't stringify
    return c
}
