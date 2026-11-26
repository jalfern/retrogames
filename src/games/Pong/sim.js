// sim.js — the seeded dice and table geometry of PONG (#1473 seedpin batch 16).
//
// Pre-port, every die rolled straight off Math.random: serve direction, serve
// angle, paddle start positions and the vertical spin added on each paddle hit.
// A filed seed replayed nothing. These pure functions moved the dice surface
// onto ONE mulberry32 stream owned by index.jsx (regenerated at every human
// start honoring ?seed=N), so `scripts/pongcheck.mjs` can replay a serve
// script in plain Node and prove the pin. #3532 then restored the cabinet:
// only the two SERVE dice remain (the machine's serve was analog-random);
// paddle scatter and hit-spin are gone — deflection is strike-position law.
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

// #3502 — the cabinet's switches, restored. The 1972 coin door carried an
// AUTO/HUMAN selector for the machine paddle and a RANGE switch labeled
// Easy/Difficult. Here that becomes four attract picks: three CPU tiers plus
// TWO (right paddle = human, desktop W/S — the multiplayer ruling: CPU is
// the default, 2P is a keyboard option). NORMAL is the shipped physics
// VERBATIM (speed 3.5, zone ±10, no ceiling) so the #1473 seedpin and the
// #1637 39/40 driver floor replay bit-identical under the default pick.
// EASY is the Easy RANGE: the horizontal speed ceiling (5.5) plus a slower,
// sloppier tracker; HARD is the Difficult table — faster, tighter machine.
export const DIFFS = ['EASY', 'NORMAL', 'HARD', 'TWO']
const CPU_TIERS = {
    EASY: { speed: 2.2, zone: 16, cap: 5.5 },
    NORMAL: { speed: AI_SPEED, zone: 10, cap: Infinity },
    HARD: { speed: 4.5, zone: 5, cap: Infinity },
}
// undefined/unknown (every pre-#3502 gs, every replay) → NORMAL, exactly.
export const cpuTier = (diff) => CPU_TIERS[diff] || CPU_TIERS.NORMAL

// #3565 — the selectable max-score knob, in the sim where it binds. FREE
// (gs.range = null/undefined — every pre-#3565 gs and every default start)
// keeps the b16 ruling verbatim: no enforced cap, quit is the terminal. A
// number is a target the player chose on the attract dial, so the point that
// reaches it ends the match honestly: no new ball enters play (the cabinet
// never served a ball nobody would play) and ev.winner names who got there.
// Scoring-only state — zero physics, zero new dice. The classic ladder
// 1·3·5·7·9 follows the Pong-family score dials; the 1972 table's own RANGE
// switch was the Easy/Difficult speed control (#3502 tiers), so this is a
// feature on top of the honest terminal, not a restoration (README says so).
export const RANGES = ['FREE', 1, 3, 5, 7, 9]
const capHit = (gs, score) => typeof gs.range === 'number' && score >= gs.range

// Serve from the center: direction coin-flip + vertical angle, both on the stream.
export function serveBall(rand, width, height) {
    return {
        x: width / 2,
        y: height / 2,
        dx: (rand() > 0.5 ? 1 : -1) * BASE_SPEED,
        dy: (rand() * 2 - 1) * BASE_SPEED,
    }
}

// #3532 — the cabinet's deflection law, restored. The 1972 potentiometer mix
// steered by WHERE the ball struck the paddle: an edge hit returns steeper
// than a center hit, and no die was rolled. The Feb port instead added random
// jitter per hit (`paddleSpin`) and teleported the paddles after every point
// (`paddleStart`) — both port inventions, both removed here. SPIN_K keeps the
// ±2 envelope the spin die had: same range, zero new entropy, and the
// anti-loop purpose survives geometrically (center hits flatten, edge hits
// steepen). sim.js now rolls dice ONLY in serveBall.
export const SPIN_K = 2

// Anti-loop, dice-free (#3532): strike deflection converges (a centered hit
// returns flat; flat returns stay flat), and on the capped EASY table a flat
// rally never ends — measured 0-0 at the hour cap. The port needed jitter for
// the same reason; the dice did it randomly. A floor on |dy| does it from
// state alone: after any paddle return the ball keeps at least a shallow
// vertical drift, so fold geometry keeps changing and rallies resolve.
export const DY_MIN = 0.5

// Vertical deflection from the strike offset: (ball center − paddle center)
// over the paddle half-height, in [−1, 1]. Clamped — a corner hit is the
// steepest the cabinet could send it.
export function strikeSpin(ballY, paddleY) {
    const offset = (ballY + BALL_SIZE / 2) - (paddleY + PADDLE_HEIGHT / 2)
    const ratio = Math.max(-1, Math.min(1, offset / (PADDLE_HEIGHT / 2)))
    return ratio * SPIN_K
}

// One paddle return: strike deflection, then the |dy| floor. Mutants anchor
// here (flat deflection / flipped sign must die on the §deflection checks).
function applyReturn(ball, paddleY) {
    ball.dy += strikeSpin(ball.y, paddleY)
    if (Math.abs(ball.dy) < DY_MIN) ball.dy = (ball.dy < 0 ? -1 : 1) * DY_MIN
}

// Paddle speed while a human (or the seat) drives — the Feb port's manual
// rate. The seat applies the SAME speed the player's fingers get, so the
// Node proof and the live table run one physics, not two.
export const PAD_SPEED = BASE_SPEED * 1.5

// One ball step, verbatim from the Feb port's update(): move, flip at the
// walls (position keeps its penetration — the original behaviour, and the
// predictor must replay the same arithmetic or it lies). #3532 adds the
// direction guard: the cabinet's flip was the CONTACT event, not a position
// re-test — re-flipping a ball still inside the penetration band parked it
// above the ceiling (measured: y≈−6.6, dy +2 per hit, endless shuttle).
// Requiring motion into the wall keeps the penetration AND guarantees the
// escape one step later (penetration ≤ |dy|). Returns true when the ball
// bounced, so index.jsx keeps owning the sound.
export function stepBall(ball, height) {
    ball.x += ball.dx
    ball.y += ball.dy
    if ((ball.y <= 0 && ball.dy < 0) || (ball.y + BALL_SIZE >= height && ball.dy > 0)) {
        ball.dy *= -1
        return true
    }
    return false
}

// The machine's paddle (right side): the dead-zone tracker the Feb port
// shipped and the 1972 circuit roughly behaved like — chase the ball's top
// edge, ±10px dead zone, capped at AI_SPEED. Lifted into sim.js (#1637 b24)
// so the harness faces the SAME opponent the player does. #3502: the zone
// and speed come from the selected CPU tier; default (no cfg) is NORMAL.
export function cpuStep(paddle, ball, height, cfg) {
    const { speed, zone } = cfg || CPU_TIERS.NORMAL
    const center = paddle.y + PADDLE_HEIGHT / 2
    if (center < ball.y - zone) paddle.y += speed
    else if (center > ball.y + zone) paddle.y -= speed
    paddle.y = Math.max(0, Math.min(height - PADDLE_HEIGHT, paddle.y))
}

// #1637 batch 24 — the proven route's core: where will the ball cross the
// left paddle's plane? Forward-replay of the game's OWN step physics (the
// same flip-at-wall rule, tick for tick), so the answer is exact for the
// shipped table — not an idealised parabola. Returns the ball's center-y at
// the crossing, or null when the ball is heading away (the opponent's return
// steepens by where it strikes the ball, and the tracker only commits to a
// strike position at contact — unknowable before it, see watchStep).
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
        if ((y <= 0 && dy < 0) || (y + BALL_SIZE >= height && dy > 0)) dy *= -1 // the same guarded flip — replay it exactly or the answer lies
    }
    return y + BALL_SIZE / 2
}

// THE DRIVER (#1637 batch 24): the decision the left paddle obeys while the
// seat is on. Ball coming left → aim the exact predicted crossing; #3532
// gave it the cabinet's aiming skill: meet the ball OFF-center (edge strike)
// so the return steers toward the wall farthest from the machine paddle —
// maximum travel for the opponent, the shot a PONG player aims. Ball going
// right → hold table-center: the opponent's return steepens by where it
// strikes the ball, and the tracker commits to its offset only at contact,
// so no prediction exists yet and center minimises the worst-case travel
// (the classic center-up). Reactive against live state every tick — Rogue
// law: seats anywhere, re-seats from where you stopped. Null = nothing to do
// (or the match is over: honest release).
const AIM_RATIO = 0.75 // fraction of paddle half-height aimed (edge strike)

export function watchStep(gs) {
    if (gs.over) return null
    const land = predictLand(gs.ball, gs.height)
    let target
    if (land === null) {
        target = (gs.height - PADDLE_HEIGHT) / 2
    } else {
        const machineCenter = gs.right.y + PADDLE_HEIGHT / 2
        const towardFarWall = machineCenter <= gs.height / 2 ? 1 : -1
        target = land - towardFarWall * AIM_RATIO * (PADDLE_HEIGHT / 2)
    }
    const center = gs.left.y + PADDLE_HEIGHT / 2
    if (center < target - 1.5) return { down: true }
    if (center > target + 1.5) return { up: true }
    return null
}

// One full match tick, lifted verbatim from index.jsx update() (#1637 b24)
// so pongcheck proves the SHIPPED physics: ball step, both paddles (human
// input or driver on the left, the tracker on the right), clamps, paddle
// collisions with strike-position deflection + 1.05× acceleration, and
// scoring. #3532: the ball leaves on where it hit the paddle (cabinet law),
// and scoring does NOT touch the paddles — they hold where the player left
// them, exactly as the 1972 machine. Mutates gs; returns the events index.jsx
// turns into sound.
export function tickPong(gs, input) {
    // #3536: ev.serve marks the FIRST paddle return after a serve (the voice
    // answers it twice). gs.servePending is observation, not physics — it
    // never touches ball or paddles, and rolls no dice.
    const ev = { wall: false, hitL: false, hitR: false, scored: 0, serve: false, winner: 0 }
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
    // #3502 — the AUTO/HUMAN switch: TWO seats a human on W/S (the keyboard
    // 2P option; no CPU). Every other diff runs the tier's tracker.
    const tier = cpuTier(gs.diff)
    if (gs.diff === 'TWO') {
        if (input?.up2) gs.right.y -= PAD_SPEED
        if (input?.down2) gs.right.y += PAD_SPEED
    } else {
        cpuStep(gs.right, gs.ball, gs.height, tier)
    }
    gs.left.y = Math.max(0, Math.min(gs.height - PADDLE_HEIGHT, gs.left.y))
    gs.right.y = Math.max(0, Math.min(gs.height - PADDLE_HEIGHT, gs.right.y))

    const b = gs.ball
    if (b.x <= PADDLE_OFFSET + PADDLE_WIDTH && b.x >= PADDLE_OFFSET &&
        b.y + BALL_SIZE >= gs.left.y && b.y <= gs.left.y + PADDLE_HEIGHT) {
        b.dx *= -1.05 // Slight speed up
        if (Math.abs(b.dx) > tier.cap) b.dx = Math.sign(b.dx) * tier.cap // Easy RANGE ceiling (#3502)
        b.x = PADDLE_OFFSET + PADDLE_WIDTH + 1 // Push out to avoid sticking
        applyReturn(b, gs.left.y) // cabinet deflection + dice-free anti-loop
        ev.hitL = true
        ev.serve = gs.servePending === true
        gs.servePending = false
    }
    if (b.x + BALL_SIZE >= gs.width - PADDLE_OFFSET - PADDLE_WIDTH &&
        b.x + BALL_SIZE <= gs.width - PADDLE_OFFSET &&
        b.y + BALL_SIZE >= gs.right.y && b.y <= gs.right.y + PADDLE_HEIGHT) {
        b.dx *= -1.05
        if (Math.abs(b.dx) > tier.cap) b.dx = Math.sign(b.dx) * tier.cap // Easy RANGE ceiling (#3502)
        b.x = gs.width - PADDLE_OFFSET - PADDLE_WIDTH - BALL_SIZE - 1
        applyReturn(b, gs.right.y)
        ev.hitR = true
        ev.serve = gs.servePending === true
        gs.servePending = false
    }

    // #3532 — scoring: serve from center; the paddles HOLD. The cabinet never
    // teleported them after a point.
    if (b.x < 0) {
        gs.right.score++
        // #3565 — target reached: honest terminal, the dead ball is never served.
        if (capHit(gs, gs.right.score)) { gs.over = true; ev.winner = 2 }
        else gs.ball = serveBall(gs.rand, gs.width, gs.height)
        gs.servePending = true // new ball in play — its first return is the serve (#3536)
        ev.scored = 1 // left conceded
    } else if (b.x > gs.width) {
        gs.left.score++
        if (capHit(gs, gs.left.score)) { gs.over = true; ev.winner = 1 }
        else gs.ball = serveBall(gs.rand, gs.width, gs.height)
        gs.servePending = true // new ball in play — its first return is the serve (#3536)
        ev.scored = 2 // left scored
    }
    return ev
}
