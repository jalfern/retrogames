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
