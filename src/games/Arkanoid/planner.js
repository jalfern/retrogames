// ARKANOID pilot — the attract demo is this script replayed tick-for-tick,
// and the harness calls plan() to prove the game (and DOH) can be won.
// No search, no randomness: paddle chases the predicted landing x with an
// aiming offset that steers the rebound toward the nearest live target
// (lowest brick row, else a DOH eye), dodges anything falling on its head,
// and fires when a laser is loaded or the ball is held and it is centred.

import { CFG, W, makeGame, step, stateHash } from './sim.js'
import { ROUNDS, COLS } from './rounds.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function predictX(b) {
    // where the descending ball crosses the paddle plane, walls included
    if (b.vy <= 0) return b.x
    let x = b.x, vx = b.vx, y = b.y
    const plane = CFG.paddleY - CFG.ballR
    let guard = 0
    while (y < plane && guard++ < 2000) {
        x += vx
        y += b.vy
        if (x - CFG.ballR < CFG.wallX) { x = CFG.wallX + CFG.ballR; vx = Math.abs(vx) }
        if (x + CFG.ballR > W - CFG.wallX) { x = W - CFG.wallX - CFG.ballR; vx = -Math.abs(vx) }
    }
    return x
}

function shaftMode(gs) {
    // no clear lane exists: aim the rebound through a gap in the lowest gold
    // ring so the ball pierces up into the structure. rel is solved backwards
    // from the needed slope: m = drift/px-of-climb, rel ~= m / 1.15
    const rows = ROUNDS[gs.round].rows
    let lowRow = -1
    for (let r = rows.length - 1; r >= 0; r--) if (rows[r].includes('g')) { lowRow = r; break }
    if (lowRow < 0) return null
    const climb = CFG.paddleY - CFG.ballR - (CFG.gridY0 + lowRow * CFG.rowH)
    let best = null, bd = 1e9
    for (let c = 0; c < COLS; c++) {
        if (rows[lowRow][c] === 'g') continue
        // prefer gaps near where the live bricks are
        let bx = CFG.gridX0 + c * CFG.colW + CFG.colW / 2
        let near = 0
        for (const b of gs.bricks) {
            if (!b.alive || b.kind === 'gold') continue
            const d = Math.abs(b.x + CFG.colW / 2 - bx)
            if (d < near || near === 0) near = d
        }
        const cx = gs.balls[0] ? gs.balls[0].x : W / 2
        for (const m of [0.42, -0.42]) {
            const px = bx - m * climb
            if (px < CFG.wallX || px > W - CFG.wallX) continue
            const d = Math.abs(px - cx) + near * 0.25
            if (d < bd) { bd = d; best = { x: px, rel: m / 1.15 } }
        }
    }
    return best
}

function target(gs, hintX) {
    if (gs.boss) {
        const bo = gs.boss
        const eyeY = CFG.bossY + CFG.bossH
        const ball = gs.balls.find((b) => !b.stuck)
        const climb = CFG.paddleY - CFG.ballR - eyeY
        const sp = CFG.baseSpeed + CFG.speedStep * gs.round
        const t = ball && ball.vy < 0
            ? Math.max((CFG.paddleY - CFG.ballR - ball.y) / -ball.vy, 0)
            : climb / (0.8 * sp)
        let best = null, bd = 1e9
        for (const e of bo.eyes) {
            if (!e.alive) continue
            const ex = W / 2 + Math.sin((bo.swayT + t) / CFG.bossSwaySpeed) * CFG.bossSway + e.dx
            const d = Math.abs(ex - (hintX === undefined ? W / 2 : hintX))
            if (d < bd) { bd = d; best = ex }
        }
        return { x: best === null ? W / 2 : best, y: eyeY, precise: true }
    }
    const rows = ROUNDS[gs.round].rows
    let best = null, score = 1e9
    for (const b of gs.bricks) {
        if (!b.alive || b.kind === 'gold') continue
        // vertical lane from below must be clear of gold and live bricks
        let clear = true
        for (let r = b.row + 1; r < rows.length && clear; r++) {
            if (rows[r][b.col] === 'g') { clear = false; break }
            if (gs.bricks.some((x) => x.col === b.col && x.row === r && x.alive)) clear = false
        }
        if (!clear) continue
        // dig bottom-up: lowest open brick, biased to the column the ball
        // is already falling into (you clear what is above you)
        const hx = hintX === undefined || hintX === null ? W / 2 : hintX
        const s = -b.y * 2 + Math.abs(b.x + CFG.colW / 2 - hx) * 0.4
        if (s < score) { score = s; best = { x: b.x + CFG.colW / 2, y: b.y + CFG.rowH } }
    }
    if (best !== null) return { x: best.x, y: best.y, precise: true }
    const sh = shaftMode(gs)
    return sh ? { shaft: sh } : { x: W / 2, precise: true }
}

export function decide(gs) {
    const P = gs.paddle
    const out = { l: false, r: false, fire: false }

    const stuck = gs.balls.find((b) => b.stuck)
    if (stuck) {
        const tg = target(gs)
        const tx = tg.shaft ? tg.shaft.x : tg.x
        out.l = P.x > tx + 1
        out.r = P.x < tx - 1
        // launch while still travelling: the sim turns paddle velocity into
        // launch angle; vertical is only acceptable for a precise target.
        out.fire = stuck.held > 30
            && (((out.l || out.r) && Math.abs(P.x - tx) <= 24) || stuck.held > (tg.shaft ? 90 : 60))
        return out
    }

    // dodge: anything falling near the paddle column gets sidestepped — but
    // never at the cost of the ball's own landing
    let tx = null
    let danger = null
    const ball0 = gs.balls.find((b) => !b.stuck)
    for (const e of gs.enemies) {
        if (e.state !== 'dive' || e.y < 158) continue
        if (Math.abs(e.x - P.x) < 12) danger = e.x
    }
    for (const u of gs.bullets) {
        if (u.y > 168 && Math.abs(u.x - P.x) < 10) danger = u.x
    }
    const ballSafe = !ball0 || ball0.vy <= 0 ||
        Math.abs(predictX(ball0) - P.x) < ((CFG.paddleY - CFG.ballR - ball0.y) / ball0.vy) * CFG.paddleSpeed + P.w / 2 - 4
    if (danger !== null && ballSafe) tx = danger > W / 2 ? P.x - 32 : P.x + 32

    if (tx === null) {
        const ball = gs.balls.find((b) => b.vy > 0) || gs.balls[0]
        const px = ball && ball.vy > 0 ? predictX(ball) : P.x
        const tg = target(gs, px)
        if (ball && ball.vy > 0) {
            const ticksLeft = Math.max((CFG.paddleY - CFG.ballR - ball.y) / ball.vy, 1)
            const reach = ticksLeft * CFG.paddleSpeed + P.w / 2 - 4
            if (Math.abs(px - P.x) > reach) {
                tx = px   // too far to do anything clever — just get under it
            } else if (tg.shaft) {
                tx = tg.shaft.x - (tg.shaft.rel * P.w) / 2
            } else {
                // solve the rebound slope that carries the ball to the target
                // x at brick height: m = dx/climb; rel from m through the
                // sim's own reflection formula (vx = rel*0.78*sp)
                const climb = Math.max(CFG.paddleY - CFG.ballR - tg.y, 20)
                const m = clamp((tg.x - px) / climb, -0.6, 0.6)
                const rel = m / (CFG.maxVxFrac * Math.sqrt(1 + m * m))
                tx = px - (rel * P.w) / 2
            }
        } else {
            tx = tg.shaft ? tg.shaft.x : tg.x
        }
    }
    tx = clamp(tx, CFG.wallX + P.w / 2, W - CFG.wallX - P.w / 2)
    out.l = P.x > tx + 1.5
    out.r = P.x < tx - 1.5
    out.fire = gs.power.laser === 1
    return out
}

export function plan(seed = 0, { maxTicks = 120000 } = {}) {
    const gs = makeGame(seed)
    const script = []
    const receipts = { bricks: 0, silver: 0, enemies: 0, capsules: 0, deaths: 0, rounds: 0, bossEyes: 0, phases: 0 }
    let hash = ''
    while (!gs.end && gs.tick < maxTicks) {
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
        for (const e of gs.events.splice(0)) {
            if (e.type === 'brick') (e.kind === 'silver' ? receipts.silver++ : receipts.bricks++)
            else if (e.type === 'enemy') receipts.enemies++
            else if (e.type === 'capsule') receipts.capsules++
            else if (e.type === 'death') receipts.deaths++
            else if (e.type === 'round') receipts.rounds++
            else if (e.type === 'bossEye') receipts.bossEyes++
            else if (e.type === 'bossPhase') receipts.phases++
        }
        hash = stateHash(gs)
    }
    return { ok: gs.end === 'win', end: gs.end || 'timeout', script, receipts, hash, score: gs.score, lives: gs.lives, tick: gs.tick, rounds: ROUNDS.length }
}
