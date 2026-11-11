// sim.js — the seeded dice and table geometry of PONG (#1473 seedpin batch 16).
//
// Pre-port, every die rolled straight off Math.random: serve direction, serve
// angle, paddle start positions and the vertical spin added on each paddle hit.
// A filed seed replayed nothing. These pure functions move the whole dice
// surface onto ONE mulberry32 stream owned by index.jsx (regenerated at every
// human start honoring ?seed=N), so `scripts/pongcheck.mjs` can replay a serve
// script in plain Node and prove the pin.
//
// Fidelity note (the b15 map sketched "first-to-N, N=7?"): the 1972 machine
// played to a player-selected score, but this port ships no selectable cap and
// the map's own ruling stands — faithful terminal = play-to-quit (`q`/Escape
// ends the match; see index.jsx).

export const PADDLE_WIDTH = 10
export const PADDLE_HEIGHT = 80
export const BALL_SIZE = 8
export const PADDLE_OFFSET = 20
export const BASE_SPEED = 4
export const AI_SPEED = 3.5

// Serve from the center: direction coin-flip + vertical angle, both on the stream.
export function serveBall(rand, width, height) {
    return {
        x: width / 2,
        y: height / 2,
        dx: (rand() > 0.5 ? 1 : -1) * BASE_SPEED,
        dy: (rand() * 2 - 1) * BASE_SPEED,
    }
}

// Paddles start at seeded positions along the table (the port scattered them).
export function paddleStart(rand, height) {
    return rand() * Math.max(0, height - PADDLE_HEIGHT)
}

// Extra vertical spin added when a paddle returns the ball (anti-loop jitter).
export function paddleSpin(rand) {
    return rand() * 4 - 2
}

// Paddle speed while a human (or the seat) drives — the Feb port's manual
// rate. The seat applies the SAME speed the player's fingers get, so the
// Node proof and the live table run one physics, not two.
export const PAD_SPEED = BASE_SPEED * 1.5

// One ball step, verbatim from the Feb port's update(): move, flip at the
// walls (position keeps its penetration — the original behaviour, and the
// predictor must replay the same arithmetic or it lies). Returns true when
// the ball bounced, so index.jsx keeps owning the sound.
export function stepBall(ball, height) {
    ball.x += ball.dx
    ball.y += ball.dy
    if (ball.y <= 0 || ball.y + BALL_SIZE >= height) {
        ball.dy *= -1
        return true
    }
    return false
}

// The machine's paddle (right side): the dead-zone tracker the Feb port
// shipped and the 1972 circuit roughly behaved like — chase the ball's top
// edge, ±10px dead zone, capped at AI_SPEED. Lifted into sim.js (#1637 b24)
// so the harness faces the SAME opponent the player does.
export function cpuStep(paddle, ball, height) {
    const center = paddle.y + PADDLE_HEIGHT / 2
    if (center < ball.y - 10) paddle.y += AI_SPEED
    else if (center > ball.y + 10) paddle.y -= AI_SPEED
    paddle.y = Math.max(0, Math.min(height - PADDLE_HEIGHT, paddle.y))
}

// #1637 batch 24 — the proven route's core: where will the ball cross the
// left paddle's plane? Forward-replay of the game's OWN step physics (the
// same flip-at-wall rule, tick for tick), so the answer is exact for the
// shipped table — not an idealised parabola. Returns the ball's center-y at
// the crossing, or null when the ball is heading away (its return spin is
// drawn off the stream at contact — unknowable before it, see watchStep).
export function predictLand(ball, height) {
    if (ball.dx >= 0) return null
    let x = ball.x
    let y = ball.y
    let dx = ball.dx
    let dy = ball.dy
    let guard = 0
    while (x > PADDLE_OFFSET + PADDLE_WIDTH && guard++ < 10000) {
        x += dx
        y += dy
        if (y <= 0 || y + BALL_SIZE >= height) dy *= -1
    }
    return y + BALL_SIZE / 2
}

// THE DRIVER (#1637 batch 24): the decision the left paddle obeys while the
// seat is on. Ball coming left → aim the exact predicted crossing. Ball
// going right → hold table-center: the opponent's return angle and spin are
// drawn at contact, so no prediction exists yet, and center minimises the
// worst-case travel (the classic center-up). Reactive against live state
// every tick — Rogue law: seats anywhere, re-seats from where you stopped.
// Null = nothing to do (or the match is over: honest release).
export function watchStep(gs) {
    if (gs.over) return null
    const target = predictLand(gs.ball, gs.height)
        ?? (gs.height - PADDLE_HEIGHT) / 2
    const center = gs.left.y + PADDLE_HEIGHT / 2
    if (center < target - 1.5) return { down: true }
    if (center > target + 1.5) return { up: true }
    return null
}

// One full match tick, lifted verbatim from index.jsx update() (#1637 b24)
// so pongcheck proves the SHIPPED physics: ball step, both paddles (human
// input or driver on the left, the tracker on the right), clamps, paddle
// collisions with seeded spin + 1.05× acceleration, and scoring. Mutates gs;
// returns the events index.jsx turns into sound.
export function tickPong(gs, input) {
    const ev = { wall: false, hitL: false, hitR: false, scored: 0 }
    if (gs.over) return ev
    ev.wall = stepBall(gs.ball, gs.height)

    if (gs.watching) {
        const act = watchStep(gs)
        if (act?.up) gs.left.y -= PAD_SPEED
        if (act?.down) gs.left.y += PAD_SPEED
    } else {
        if (input?.up) gs.left.y -= PAD_SPEED
        if (input?.down) gs.left.y += PAD_SPEED
    }
    cpuStep(gs.right, gs.ball, gs.height)
    gs.left.y = Math.max(0, Math.min(gs.height - PADDLE_HEIGHT, gs.left.y))
    gs.right.y = Math.max(0, Math.min(gs.height - PADDLE_HEIGHT, gs.right.y))

    const b = gs.ball
    if (b.x <= PADDLE_OFFSET + PADDLE_WIDTH && b.x >= PADDLE_OFFSET &&
        b.y + BALL_SIZE >= gs.left.y && b.y <= gs.left.y + PADDLE_HEIGHT) {
        b.dx *= -1.05 // Slight speed up
        b.x = PADDLE_OFFSET + PADDLE_WIDTH + 1 // Push out to avoid sticking
        b.dy += paddleSpin(gs.rand) // seeded anti-loop spin
        ev.hitL = true
    }
    if (b.x + BALL_SIZE >= gs.width - PADDLE_OFFSET - PADDLE_WIDTH &&
        b.x + BALL_SIZE <= gs.width - PADDLE_OFFSET &&
        b.y + BALL_SIZE >= gs.right.y && b.y <= gs.right.y + PADDLE_HEIGHT) {
        b.dx *= -1.05
        b.x = gs.width - PADDLE_OFFSET - PADDLE_WIDTH - BALL_SIZE - 1
        b.dy += paddleSpin(gs.rand)
        ev.hitR = true
    }

    if (b.x < 0) {
        gs.right.score++
        gs.ball = serveBall(gs.rand, gs.width, gs.height)
        gs.left.y = paddleStart(gs.rand, gs.height)
        gs.right.y = paddleStart(gs.rand, gs.height)
        ev.scored = 1 // left conceded
    } else if (b.x > gs.width) {
        gs.left.score++
        gs.ball = serveBall(gs.rand, gs.width, gs.height)
        gs.left.y = paddleStart(gs.rand, gs.height)
        gs.right.y = paddleStart(gs.rand, gs.height)
        ev.scored = 2 // left scored
    }
    return ev
}
