// ARKANOID — pure simulation. (state, input) -> state, zero Math.random():
// every capsule sits on a brick the round author placed, every enemy dive
// picks its moment from tick arithmetic, so a run replays hash-for-hash and
// scripts/arkanoidcheck.mjs can audit the whole game in Node.
//
// The load-bearing rules (the ones the harness pins):
//   - paddle bounce is POSITIONAL: where the ball lands on the Vaus sets the
//     angle; edges ~52 deg, dead center straight up. |vx| <= 0.78*speed
//     everywhere so a reflection can never seal a horizontal forever-ball.
//   - '#' dies in 1 hit, 's' (silver) in 3, 'g' (gold) NEVER but reflects.
//   - every capsule type ships exactly once across the game (rounds.js).
//   - BREAK advances the round and salvages (pays out) what remains.
//   - DOH answers only to its eyes: 3 + 5 + 7 hits, head reflects unharmed.

import { ROUNDS, COLS } from './rounds.js'

export const W = 256
export const H = 224

export const CFG = {
    wallX: 8,          // side walls: x < 8 or x > W-8
    ceilY: 8,
    paddleY: 200,      // paddle top
    paddleH: 8,
    paddleW: 32,
    paddleWExp: 50,
    paddleSpeed: 4,
    ballR: 3,
    baseSpeed: 2.15,
    speedStep: 0.12,
    slowFactor: 0.62,
    maxVxFrac: 0.78,   // reflection angle cap (~52 deg from vertical)
    minVyFrac: 0.55,   // no horizontal forever-balls
    capsuleSpeed: 1.1,
    powerTicks: 600,   // EXPAND / SLOW duration
    laserCool: 9,
    gridX0: 8,
    gridY0: 48,
    colW: 16,
    rowH: 8,
    roundScores: [1, 3, 5, 7, 9, 11, 13],
    clearBonus: 300,
    bossEyeR: 6,
    bossHalfW: 40,
    bossH: 40,
    bossY: 14,
    bossSway: 44,
    bossSwaySpeed: 47,
    bossShoot: 200,
    bossSpawn: 460,
    bossPhases: [[-24, 0, 24], [-32, -16, 0, 16, 32], [-36, -24, -12, 0, 12, 24, 36]],
    clearGrace: 90,
    maxLives: 5,
}

const CAPS = 'LSDCB+E'
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function makeGame(seed = 0) {
    const gs = {
        seed,
        tick: 0,
        round: 0,
        lives: 3,
        score: 0,
        paddle: { x: W / 2, w: CFG.paddleW },
        pvel: 0,
        balls: [],
        bricks: [],
        capsules: [],
        lasers: [],
        bullets: [],
        enemies: [],
        boss: null,
        power: { laser: 0, catch: 0, expandAt: 0, slowAt: 0 },
        laserCd: 0,
        enemySeq: 0,
        spawnT: 0,
        dry: 0,
        clearAt: 0,
        end: null,
        events: [],
    }
    buildRound(gs)
    return gs
}

function speedOf(gs) {
    const base = CFG.baseSpeed + CFG.speedStep * gs.round
    return gs.power.slowAt > gs.tick ? base * CFG.slowFactor : base
}

function buildRound(gs) {
    const R = ROUNDS[gs.round]
    gs.bricks = []
    R.rows.forEach((row, r) => {
        for (let c = 0; c < COLS; c++) {
            const ch = row[c]
            if (ch === '.') continue
            const b = {
                col: c, row: r,
                x: CFG.gridX0 + c * CFG.colW,
                y: CFG.gridY0 + r * CFG.rowH,
                kind: ch === 'g' ? 'gold' : ch === 's' ? 'silver' : 'norm',
                hp: ch === 's' ? 3 : 1,
                capsule: CAPS.includes(ch) ? ch : null,
                alive: true,
            }
            gs.bricks.push(b)
        }
    })
    gs.capsules = []
    gs.lasers = []
    gs.bullets = []
    gs.enemies = []
    gs.spawnT = Math.floor(R.enemyPeriod / 2)
    gs.clearAt = 0
    gs.pvel = 0
    gs.power.expandAt = 0
    gs.power.slowAt = 0
    gs.paddle.w = CFG.paddleW
    gs.boss = R.boss
        ? {
            swayT: 0,
            x: W / 2,
            y: CFG.bossY,
            phase: 0,
            eyes: CFG.bossPhases[0].map((dx) => ({ dx, alive: true })),
            shootT: CFG.bossShoot,
            spawnT: CFG.bossSpawn,
        }
        : null
    stickNewBall(gs)
}

function stickNewBall(gs) {
    gs.balls = [{ x: gs.paddle.x, y: CFG.paddleY - CFG.ballR, vx: 0, vy: 0, stuck: true, held: 0 }]
}

function destructibles(gs) {
    return gs.bricks.filter((b) => b.alive && b.kind !== 'gold').length
}

function launchBall(gs, b) {
    const sp = speedOf(gs)
    const rel = clamp(gs.pvel * 0.35 / sp, -CFG.maxVxFrac, CFG.maxVxFrac)
    b.vx = rel * sp
    b.vy = -Math.sqrt(Math.max(sp * sp - b.vx * b.vx, sp * sp * CFG.minVyFrac * CFG.minVyFrac))
    b.stuck = false
    gs.events.push({ type: 'launch', x: Math.round(b.x), y: Math.round(b.y) })
}

function addScore(gs, ev) {
    gs.events.push(ev)
    gs.score += ev.value
}

function killBall(gs) {
    gs.balls = gs.balls.filter((b) => !(b.y - CFG.ballR > H))
    if (gs.balls.length) return
    gs.lives--
    gs.events.push({ type: 'death', lives: gs.lives })
    gs.power.laser = 0
    gs.power.catch = 0
    gs.power.expandAt = 0
    gs.power.slowAt = 0
    gs.paddle.w = CFG.paddleW
    gs.capsules = []
    gs.lasers = []
    gs.bullets = []
    if (gs.lives <= 0) { gs.end = 'over'; return }
    stickNewBall(gs)
}

function applyCapsule(gs, kind) {
    addScore(gs, { type: 'capsule', kind, value: 20 })
    if (kind === 'L') gs.power.laser = 1
    else if (kind === 'C') gs.power.catch = 1
    else if (kind === 'E') gs.power.expandAt = gs.tick + CFG.powerTicks
    else if (kind === 'S') gs.power.slowAt = gs.tick + CFG.powerTicks
    else if (kind === 'D') {
        const lead = gs.balls.find((b) => !b.stuck) || gs.balls[0]
        const sp = speedOf(gs)
        while (gs.balls.length < 3 && lead) {
            const a = Math.atan2(lead.vy || -1, lead.vx || 0) + (gs.balls.length === 1 ? 0.5 : -0.5)
            gs.balls.push({ x: lead.x, y: lead.y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a) * sp), stuck: false, held: 0 })
        }
    } else if (kind === '+') gs.lives = Math.min(CFG.maxLives, gs.lives + 1)
    else if (kind === 'B') advanceRound(gs, 'break')
}

function salvage(gs) {
    const v = ROUNDS[gs.round].boss ? 0 : destructibles(gs) * CFG.roundScores[gs.round]
    if (v > 0) addScore(gs, { type: 'salvage', value: v, n: destructibles(gs) })
}

function advanceRound(gs, by) {
    salvage(gs)
    if (by === 'clear') addScore(gs, { type: 'clear', value: CFG.clearBonus })
    gs.round++
    if (gs.round >= ROUNDS.length) { gs.end = 'win'; return }
    gs.events.push({ type: 'round', to: gs.round, by })
    buildRound(gs)
}

function spawnEnemy(gs) {
    const R = ROUNDS[gs.round]
    const gate = R.gates[gs.enemySeq % R.gates.length]
    const patrolY = 100 + ((gs.enemySeq % 3) * 14)
    gs.enemies.push({
        x: gate,
        y: CFG.ceilY + 4,
        vx: gs.enemySeq % 2 ? 1.1 : -1.1,
        vy: 1.2,
        state: 'enter',
        patrolY,
        diveAt: gs.tick + 130 + (gs.enemySeq % 4) * 45,
        dir: gs.enemySeq % 2 ? 1 : -1,
    })
    gs.enemySeq++
    gs.events.push({ type: 'enemySpawn', x: gate })
}

function killEnemy(gs, e) {
    e.state = 'dead'
    addScore(gs, { type: 'enemy', value: 50 * (gs.round + 1), x: Math.round(e.x), y: Math.round(e.y) })
}

// circle vs axis-aligned rect; returns axis of least penetration or null
function hitRect(bx, by, r, x, y, w, h) {
    const nx = clamp(bx, x, x + w)
    const ny = clamp(by, y, y + h)
    const dx = bx - nx
    const dy = by - ny
    if (dx * dx + dy * dy > r * r) return null
    const overX = w / 2 + r - Math.abs(bx - (x + w / 2))
    const overY = h / 2 + r - Math.abs(by - (y + h / 2))
    return overX < overY ? 'x' : 'y'
}

// velocity hygiene after any reflection: |vx| capped so no horizontal
// forever-ball, |vy| floored, total speed normalised back to sp
function clampSpeed(b, sp) {
    b.vx = clamp(b.vx, -CFG.maxVxFrac * sp, CFG.maxVxFrac * sp)
    const vyMin = CFG.minVyFrac * sp
    if (Math.abs(b.vy) < vyMin) b.vy = Math.sign(b.vy || -1) * vyMin
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || sp
    if (s > sp) { b.vx *= sp / s; b.vy *= sp / s }
}

function stepBoss(gs, sp) {
    const bo = gs.boss
    bo.swayT++
    bo.x = W / 2 + Math.sin(bo.swayT / CFG.bossSwaySpeed) * CFG.bossSway
    bo.shootT--
    if (bo.shootT <= 0) {
        bo.shootT = CFG.bossShoot - gs.round * 4
        gs.bullets.push({
            x: bo.x, y: bo.y + CFG.bossH,
            vx: clamp((gs.paddle.x - bo.x) / 90, -0.8, 0.8),
            vy: 2.0,
        })
        gs.events.push({ type: 'bossShoot' })
    }
    bo.spawnT--
    if (bo.spawnT <= 0 && gs.enemies.length < ROUNDS[gs.round].enemyCap) {
        bo.spawnT = CFG.bossSpawn
        spawnEnemy(gs)
    }
    for (const b of gs.balls) {
        if (b.stuck) continue
        const ax = hitRect(b.x, b.y, CFG.ballR, bo.x - CFG.bossHalfW, bo.y, CFG.bossHalfW * 2, CFG.bossH)
        if (ax) {
            let hitEye = null
            if (b.y >= bo.y + CFG.bossH / 2) {
                for (const e of bo.eyes) {
                    if (!e.alive) continue
                    if (Math.abs(b.x - (bo.x + e.dx)) <= CFG.bossEyeR + CFG.ballR) { hitEye = e; break }
                }
            }
            if (ax === 'x') {
                b.vx = b.x < bo.x ? -Math.abs(b.vx) : Math.abs(b.vx)
                b.x = b.x < bo.x ? bo.x - CFG.bossHalfW - CFG.ballR : bo.x + CFG.bossHalfW + CFG.ballR
            } else {
                b.vy = b.y < bo.y + CFG.bossH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy)
                b.y = b.y < bo.y + CFG.bossH / 2 ? bo.y - CFG.ballR : bo.y + CFG.bossH + CFG.ballR
            }
            clampSpeed(b, sp)
            if (hitEye) {
                hitEye.alive = false
                addScore(gs, { type: 'bossEye', value: 100, phase: bo.phase, left: bo.eyes.filter((e) => e.alive).length })
                if (bo.eyes.every((e) => !e.alive)) {
                    addScore(gs, { type: 'bossPhase', value: 500, phase: bo.phase })
                    bo.phase++
                    if (bo.phase > 2) {
                        gs.boss = null
                        gs.events.push({ type: 'bossDead' })
                        addScore(gs, { type: 'win', value: 2000 })
                        gs.end = 'win'
                        return
                    }
                    bo.eyes = CFG.bossPhases[bo.phase].map((dx) => ({ dx, alive: true }))
                }
            } else {
                gs.dry++
                gs.events.push({ type: 'bossThud' })
            }
        }
    }
}

export function step(gs, inp) {
    if (gs.end) return gs
    gs.tick++
    const sp = speedOf(gs)

    // ---- paddle
    const prevX = gs.paddle.x
    if (gs.power.expandAt > gs.tick) gs.paddle.w = CFG.paddleWExp
    else if (gs.power.expandAt && gs.power.expandAt <= gs.tick) gs.paddle.w = CFG.paddleW
    if (inp.l) gs.paddle.x -= CFG.paddleSpeed
    if (inp.r) gs.paddle.x += CFG.paddleSpeed
    gs.paddle.x = clamp(gs.paddle.x, CFG.wallX + gs.paddle.w / 2, W - CFG.wallX - gs.paddle.w / 2)
    gs.pvel = gs.paddle.x - prevX

    // ---- fire edge
    if (inp.fire) {
        const stuck = gs.balls.find((b) => b.stuck)
        if (stuck) launchBall(gs, stuck)
        else if (gs.power.laser && gs.laserCd <= 0) {
            gs.laserCd = CFG.laserCool
            gs.lasers.push({ x: gs.paddle.x - 8, y: CFG.paddleY }, { x: gs.paddle.x + 8, y: CFG.paddleY })
            gs.events.push({ type: 'laser' })
        }
    }
    if (gs.laserCd > 0) gs.laserCd--

    // ---- stuck balls ride the paddle
    for (const b of gs.balls) {
        if (b.stuck) {
            b.x = gs.paddle.x
            b.y = CFG.paddleY - CFG.ballR
            b.held++
        }
    }

    // ---- balls
    let killedThisTick = false
    for (const b of gs.balls) {
        if (b.stuck) continue
        b.x += b.vx
        b.y += b.vy
        // walls
        if (b.x - CFG.ballR < CFG.wallX) {
            b.x = CFG.wallX + CFG.ballR
            b.vx = Math.abs(b.vx)
            if (gs.dry >= 10) b.vx = (0.30 + (gs.dry % 5) * 0.1) * sp
            clampSpeed(b, sp)
        }
        if (b.x + CFG.ballR > W - CFG.wallX) {
            b.x = W - CFG.wallX - CFG.ballR
            b.vx = -Math.abs(b.vx)
            if (gs.dry >= 10) b.vx = -(0.30 + (gs.dry % 5) * 0.1) * sp
            clampSpeed(b, sp)
        }
        if (b.y - CFG.ballR < CFG.ceilY) {
            b.y = CFG.ceilY + CFG.ballR
            b.vy = Math.abs(b.vy)
            if (gs.dry >= 10) b.vx = (gs.dry % 2 ? 1 : -1) * (0.30 + (gs.dry % 5) * 0.1) * sp
            else if (Math.abs(b.vx) < 0.08 * sp) b.vx = (gs.tick % 2 ? 1 : -1) * 0.12 * sp
            gs.events.push({ type: 'ceiling' })
        }

        // paddle
        if (b.vy > 0 && b.y + CFG.ballR >= CFG.paddleY && b.y + CFG.ballR <= CFG.paddleY + CFG.paddleH + 2
            && Math.abs(b.x - gs.paddle.x) <= gs.paddle.w / 2 + CFG.ballR * 0.8) {
            if (gs.power.catch) {
                b.stuck = true
                b.held = 0
                b.vx = 0
                b.vy = 0
                b.y = CFG.paddleY - CFG.ballR
                gs.events.push({ type: 'caught' })
            } else {
                const rel = clamp((b.x - gs.paddle.x) / (gs.paddle.w / 2), -1, 1)
                b.vx = rel * CFG.maxVxFrac * sp
                if (Math.abs(b.vx) < 0.08 * sp) b.vx = (gs.tick % 2 ? 1 : -1) * 0.12 * sp
                gs.dry++
                if (gs.dry >= 60 && Math.abs(b.vx) < 0.2 * sp) b.vx = (gs.dry % 2 ? 1 : -1) * (0.30 + (gs.dry % 5) * 0.1) * sp
                b.vy = -Math.sqrt(Math.max(sp * sp - b.vx * b.vx, 0))
                if (Math.abs(b.vy) < CFG.minVyFrac * sp) b.vy = -CFG.minVyFrac * sp
                b.y = CFG.paddleY - CFG.ballR
                gs.events.push({ type: 'paddle' })
            }
        }

        // bricks (first hit per tick; one reflection is all a tick can honour)
        for (const br of gs.bricks) {
            if (!br.alive) continue
            const ax = hitRect(b.x, b.y, CFG.ballR, br.x, br.y, CFG.colW, CFG.rowH)
            if (!ax) continue
            if (ax === 'x') { b.vx = b.x < br.x + CFG.colW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x = b.x < br.x + CFG.colW / 2 ? br.x - CFG.ballR : br.x + CFG.colW + CFG.ballR }
            else { b.vy = b.y < br.y + CFG.rowH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y = b.y < br.y + CFG.rowH / 2 ? br.y - CFG.ballR : br.y + CFG.rowH + CFG.ballR }
            clampSpeed(b, sp)
            if (br.kind === 'gold') { gs.dry++; gs.events.push({ type: 'goldHit' }); break }
            br.hp--
            if (br.hp > 0) { gs.dry = 0; gs.events.push({ type: 'silverHit', x: br.x, y: br.y }); break }
            br.alive = false
            gs.dry = 0
            addScore(gs, { type: 'brick', value: CFG.roundScores[gs.round] * (br.kind === 'silver' ? 3 : 1), kind: br.kind, x: br.x + CFG.colW / 2, y: br.y + CFG.rowH / 2 })
            if (br.capsule) {
                gs.capsules.push({ x: br.x + CFG.colW / 2, y: br.y + CFG.rowH, kind: br.capsule })
                gs.events.push({ type: 'capsuleDrop', kind: br.capsule })
            }
            break
        }

        // enemies (the ball eats them and never slows)
        for (const e of gs.enemies) {
            if (e.state === 'dead') continue
            if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= (CFG.ballR + 7) ** 2) killEnemy(gs, e)
        }

        if (gs.boss) stepBoss(gs, sp)
        if (gs.end === 'win') return gs
    }

    // ---- balls that fell past the floor
    const before = gs.balls.length
    gs.balls = gs.balls.filter((b) => b.y - CFG.ballR <= H)
    if (gs.balls.length < before) {
        gs.events.push({ type: 'ballLost' })
        if (!gs.balls.length) killBall(gs)
        if (gs.end) return gs
    }

    // ---- lasers
    for (const l of gs.lasers) l.y -= 5
    gs.lasers = gs.lasers.filter((l) => l.y > CFG.ceilY)
    for (const e of gs.enemies) {
        if (e.state === 'dead') continue
        for (const l of gs.lasers) {
            if ((l.x - e.x) ** 2 + (l.y - e.y) ** 2 <= 8 * 8) { killEnemy(gs, e); l.y = -99; break }
        }
    }
    gs.lasers = gs.lasers.filter((l) => l.y > -50)

    // ---- capsules
    for (const c of gs.capsules) c.y += CFG.capsuleSpeed
    gs.capsules = gs.capsules.filter((c) => {
        if (c.y > H) return false
        if (Math.abs(c.x - gs.paddle.x) <= gs.paddle.w / 2 + 5 && c.y > CFG.paddleY - 4 && c.y < CFG.paddleY + CFG.paddleH) {
            applyCapsule(gs, c.kind)
            return false
        }
        return true
    })

    // ---- enemy bullets
    for (const u of gs.bullets) { u.x += u.vx; u.y += u.vy }
    gs.bullets = gs.bullets.filter((u) => u.y < H)
    if (gs.bullets.some((u) => Math.abs(u.x - gs.paddle.x) <= gs.paddle.w / 2 + 2 && u.y > CFG.paddleY - 2 && u.y < CFG.paddleY + CFG.paddleH)) {
        gs.bullets = []
        killBall(gs)
        return gs
    }

    // ---- enemies
    for (const e of gs.enemies) {
        if (e.state === 'dead') continue
        if (e.state === 'enter') {
            e.y += e.vy
            if (e.y >= e.patrolY) { e.state = 'patrol'; e.vy = 0 }
        } else if (e.state === 'patrol') {
            e.x += e.vx
            if (e.x < CFG.wallX + 8) { e.x = CFG.wallX + 8; e.vx = Math.abs(e.vx) }
            if (e.x > W - CFG.wallX - 8) { e.x = W - CFG.wallX - 8; e.vx = -Math.abs(e.vx) }
            if (gs.tick >= e.diveAt) {
                e.state = 'dive'
                e.vx = clamp((gs.paddle.x - e.x) / 60, -1.4, 1.4)
                e.vy = 1.7
            }
        } else if (e.state === 'dive') {
            e.x += e.vx
            e.y += e.vy
            if (e.y > H) {
                e.state = 'enter'
                e.y = CFG.ceilY + 4
                e.x = ROUNDS[gs.round].gates[gs.enemySeq % ROUNDS[gs.round].gates.length]
                e.vy = 1.2
                e.diveAt = gs.tick + 140 + (gs.enemySeq % 4) * 40
                gs.enemySeq++
            }
        }
        // touching the Vaus is death
        if (Math.abs(e.x - gs.paddle.x) <= gs.paddle.w / 2 + 6 && Math.abs(e.y - (CFG.paddleY + 3)) <= CFG.paddleH + 4) {
            gs.events.push({ type: 'enemyTouch' })
            gs.enemies = gs.enemies.filter((x) => x !== e)
            killBall(gs)
            return gs
        }
    }
    gs.enemies = gs.enemies.filter((e) => e.state !== 'dead')

    // ---- spawning
    if (!ROUNDS[gs.round].boss && gs.clearAt === 0) {
        gs.spawnT--
        if (gs.spawnT <= 0 && gs.enemies.length < ROUNDS[gs.round].enemyCap) {
            gs.spawnT = ROUNDS[gs.round].enemyPeriod
            spawnEnemy(gs)
        }
    }

    // ---- round clear
    if (!ROUNDS[gs.round].boss) {
        if (destructibles(gs) === 0) {
            if (gs.clearAt === 0) gs.clearAt = gs.tick
            else if (gs.tick - gs.clearAt >= CFG.clearGrace) advanceRound(gs, 'clear')
        }
    }
    return gs
}

// ------------------------------------------------------------------ hash ----
function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

export function stateHash(gs) {
    const parts = [
        gs.tick, gs.round, gs.lives, gs.score,
        Math.round(gs.paddle.x * 100), gs.paddle.w,
        gs.balls.length,
        ...gs.balls.map((b) => `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.vx.toFixed(4)},${b.vy.toFixed(4)},${b.stuck ? 1 : 0}`),
        gs.bricks.filter((b) => b.alive).length, gs.bricks.reduce((s, b) => s + (b.alive ? b.hp : 0), 0),
        ...gs.capsules.map((c) => `${c.kind}${c.y.toFixed(2)}`),
        ...gs.enemies.map((e) => `${e.state}${e.x.toFixed(2)},${e.y.toFixed(2)}`),
        ...gs.bullets.map((u) => `${u.x.toFixed(2)},${u.y.toFixed(2)}`),
        gs.boss ? `p${gs.boss.phase}:${gs.boss.eyes.filter((e) => e.alive).length}@${gs.boss.x.toFixed(2)}` : '-',
        gs.power.laser, gs.power.catch, gs.power.expandAt, gs.power.slowAt, gs.end || '-',
    ]
    return fnv(parts.join('|'))
}
