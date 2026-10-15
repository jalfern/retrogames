// OUT RUN — planner.js : the autopilot. It drives the SAME pure sim the player
// and the harness drive, with a legible policy, and produces an input SCRIPT.
// The attract demo replays that script tick-for-tick, and scripts/outruncheck.mjs
// re-runs it (and re-runs the whole run on a colder clock — the slack rule) to
// prove the game is genuinely winnable and that the winning is load-bearing.
//
// The policy is honest, not cheat-shaped:
//   * hold a committed lane nearest the centre, and only leave it when a slower
//     car actually sits ahead in it — never drive under stationary traffic;
//   * counter-steer the centrifugal push out of every curve;
//   * ride LOW for the punch off the line and out of corners, HIGH on the straights;
//   * take the LEFT (easier, same-column) branch at every fork — the clean showcase.

import { makeGame, step, HIGH_TOP, LOW_TOP } from './sim.js'
import { SEG_LEN, LANES, laneX } from './road.js'

const LOOK = SEG_LEN * 20               // how far ahead the lane scan reads

export function plan(opts = {}) {
    const g = makeGame(opts.seed || 0)
    let lane = 1                        // start in the middle
    const script = []
    const maxTicks = opts.maxTicks || 120000
    while (!g.end && g.tick < maxTicks) {
        const inp = decide(g, lane)
        lane = inp.lane
        script.push({ steer: inp.steer, gas: inp.gas, brake: inp.brake, gear: inp.gear })
        step(g, script[script.length - 1])
    }
    return {
        script,
        won: g.win,
        end: g.end,
        crashes: g.crashes,
        stages: g.stagesDone,
        score: Math.round(g.score),
        timeLeft: g.timeLeft,
        ticks: g.tick,
    }
}

// the three lane centres, ordered near-to-far from `from`
const laneCentres = () => [1, 0, 2].sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1))

function decide(g, prevLane) {
    const st = g.stage
    const seg = st.segs[Math.min(st.segCount - 1, Math.floor(g.position / SEG_LEN))]
    const locked = g.spin > 0
    if (locked) return { steer: 0, gas: false, brake: false, gear: 1, lane: prevLane }

    // ---- gear: LOW for the punch up to its ceiling, HIGH beyond ----
    const gear = g.speed < LOW_TOP * 0.85 ? 0 : 1

    // ---- pick a lane: keep the committed one if it is clear ahead, else the
    //      nearest clear lane. On the fork run-in commit hard LEFT (lane 0). ----
    const occupied = (L) => g.cars.some((c) => {
        const d = c.pos - g.position
        return d > -SEG_LEN && d < LOOK && c.lane === L
    })
    let lane = prevLane
    if (g.forkOpen && g.depth < 4) {
        lane = 0
    } else if (occupied(lane)) {
        const order = [prevLane, ...laneCentres()]
        lane = order.find((L) => !occupied(L))
        if (lane === undefined) lane = prevLane           // boxed in: stay, brake
    }

    const target = laneX(lane)
    const dx = target - g.playerX

    // ---- counter the curve so we don't get shoved into the grass ----
    const curvePush = seg.curve * (g.speed / HIGH_TOP) * 0.5
    let steer = 0
    if (dx > 0.06) steer = 1
    else if (dx < -0.06) steer = -1
    else if (curvePush > 0.03) steer = 1
    else if (curvePush < -0.03) steer = -1

    // ---- brake for the sharpest corners only, gas otherwise ----
    const sharp = Math.abs(seg.curve) > 1.55
    const braking = sharp && g.speed > LOW_TOP * 1.05

    return { steer, gas: !braking, brake: braking, gear, lane }
}
