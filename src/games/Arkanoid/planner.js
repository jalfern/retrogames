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

function shaftX(gs) {
    // a column that is open from below all the way up (never-placed or
    // already-drilled cells only; gold blocks) — the drill corridor
    const rows = ROUNDS[gs.round].rows
    let best = null, bd = 1e9
    for (let c = 0; c < COLS; c++) {
        let open = true
        for (let r = 0; r < rows.length; r++) {
            if (rows[r][c] === 'g') { open = false; break }
            const b = gs.bricks.find((x) => x.col === c && x.row === r && x.alive)
            if (b) { open = false; break }
        }
        if (!open) continue
        const cx = CFG.gridX0 + c * CFG.colW + CFG.colW / 2
        const d = Math.abs(cx - W / 2)
        if (d < bd) { bd = d; best = cx }
    }
    return best
}

function target(gs) {
    if (gs.boss) {
        let best = null, bd = 1e9
        for (const e of gs.boss.eyes) {
            if (!e.alive) continue
            const d = Math.abs(gs.boss.x + e.dx - W / 2)
            if (d < bd) { bd = d; best = gs.boss.x + e.dx }
        }
        return { x: best === null ? W / 2 : best, precise: true }
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
        const s = b.y * 2 + Math.abs(b.x + CFG.colW / 2 - W / 2) * 0.15
        if (s < score) { score = s; best = b.x + CFG.colW / 2 }
    }
    if (best !== null) return { x: best, precise: true }
    const sh = shaftX(gs)
    return { x: sh === null ? W / 2 : sh, precise: false }
}

export function decide(gs) {
    const P = gs.paddle
    const out = { l: false, r: false, fire: false }

    const stuck = gs.balls.find((b) => b.stuck)
    if (stuck) {
        const tg = target(gs)
        const tx = tg.x
        out.l = P.x > tx + 1
        out.r = P.x < tx - 1
        // launch while still travelling: the sim turns paddle velocity into
        // launch angle. Precise targets may fire vertical; shaft mode wants
        // an angled entry so the ball shaves the fortress walls inside.
        out.fire = stuck.held > 30
            && (((out.l || out.r) && Math.abs(P.x - tx) <= 24)
                || (tg.precise && stuck.held > 60)
                || (!tg.precise && stuck.held > 90))
        return out
    }

    // dodge: anything falling near the paddle column gets sidestepped
    let tx = null
    let danger = null
    for (const e of gs.enemies) {
        if (e.state !== 'dive' || e.y < 150) continue
        if (Math.abs(e.x - P.x) < 14) danger = e.x
    }
    for (const u of gs.bullets) {
        if (u.y > 160 && Math.abs(u.x - P.x) < 12) danger = u.x
    }
    if (danger !== null) tx = danger > W / 2 ? P.x - 40 : P.x + 40

    if (tx === null) {
        const ball = gs.balls.find((b) => b.vy > 0) || gs.balls[0]
        const tg = target(gs)
        if (ball && ball.vy > 0) {
            const px = predictX(ball)
            // shaft mode: thread the drill corridor — the rebound must cross
            // the lowest gold row (~109 px up) inside the open column, so the
            // needed angle is (shaft - landing) / (drift-per-px * climb)
            const rel = tg.precise ? clamp((tg.x - px) / 50, -0.7, 0.7) : clamp((tg.x - px) / 87, -0.7, 0.7)
            tx = px - (rel * P.w) / 2
        } else {
            tx = tg.x
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
