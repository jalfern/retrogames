/**
 * RALLY pace brain (#1427) — drives seat 1 from the Percept and nothing else.
 *
 * AgentLoop brain contract (src/ai/loop.js): sense → step → skills. The one
 * skill is `pad`: it emits the contract's driver keys (up/down/left/right/a),
 * so nightly/RL soak this seat exactly like a human pad stream — this is the
 * spine path that carries seat 1 beyond `cpuDriverPad` (which stays the
 * attract/harness autopilot living inside the sim).
 *
 * The rules mirror what a competent co-driven human does, built ONLY from
 * fields the sensor earned: the called note (audio) and corners the sightline
 * reaches (extra.corners, already crest-trimmed by the sensor). The brain has
 * no import of stage truth past the fog — if the sensor lies, the brain hits
 * the wall, which is the whole point of the seam.
 */

import { VMAX } from '../sim.js'
import { STAGE_L } from '../stage.js'
import { senseRally } from '../sensors/pacecard.js'

export function createPaceBrain(gs) {
    return {
        name: 'rally-pace',
        arm: 'ram',
        lastPad: {},

        sense() {
            return senseRally(gs)
        },

        skills: {
            // the only actuator: a raw driver pad (the contract's seat-1 keys)
            pad(args) {
                this.lastPad = { ...args }
                return { ok: true }
            },
        },

        step(percept) {
            const ego = percept.ego
            const x = percept.extra
            const pad = { up: true }
            const v = x.v

            // steer target: nearest seen corner (or a fresh note close enough),
            // severity sets the angle, proportional return against cross-position
            // keeps the line honest without ever knowing the radius.
            const seen = x.corners.length && x.corners[0].d < 300 ? x.corners[0] : null
            const note = x.note && x.note.d < 340 ? x.note : null
            const active = seen || note
            let desired = 0
            if (active) desired = active.dir * (0.10 + 0.13 * active.sev) * (v / VMAX)
            desired -= ego.x * 0.006
            const diff = desired - ego.dir
            if (diff < -0.05) pad.left = true
            else if (diff > 0.05) pad.right = true

            // throttle: lift before a close threat, brake inside its window; a
            // threat stays a threat while distance shrinks (never hold the brake
            // on a car that has already stopped — cpuDriverPad's release law).
            const threat = (seen && seen.d < 240) ? seen : (note && note.d < 340 ? note : null)
            if (threat) {
                if (threat.d < 50 + 30 * threat.sev) { pad.up = false; pad.down = true }
                else if (threat.d < 95 + 55 * threat.sev) pad.up = false
            }
            if (v < 0.6) { pad.down = false; pad.up = true }

            // off the ribbon: steer home, keep the momentum back
            if (x.off) {
                if (ego.x > 0) { pad.left = true; pad.right = false }
                else { pad.right = true; pad.left = false }
                pad.up = true
                pad.down = false
            }

            return { skill: 'pad', args: pad }
        },

        // recovery: same home-steer the off-track branch uses (the watchdog's
        // "car is stuck" move is to point at the ribbon and go)
        recover(percept) {
            return this.step(percept)
        },

        // progress currency: total forward arc-length (lap counter × L + s) —
        // monotonic across the lap wrap, flat when the car is truly stuck so
        // AgentLoop's watchdog still bites.
        progress(percept) {
            return percept.score * STAGE_L + percept.ego.y
        },

        diagnose(percept) {
            const x = percept.extra
            const c = x.corners.length ? `${x.corners[0].dir < 0 ? 'L' : x.corners[0].dir > 0 ? 'R' : 'S'}${x.corners[0].sev}@${x.corners[0].d}` : 'open'
            return `${c} · fog ${x.fog}${x.off ? ' · OFF' : ''}`
        },
    }
}

// modelSeatPad(gs, brain) — one spine tick's worth of seat-1 pad:
// sense → decide → skill. The shell's loop calls this when the model seat is
// on; rallycheck's soak loop uses the same one-liner (one driver per loop —
// the sim owns the clock, the brain only answers for the pad).
export function modelSeatPad(gs, brain) {
    const decision = brain.step(brain.sense('ram'), {})
    if (!decision || decision.skill !== 'pad') return {}
    brain.skills.pad.call(brain, decision.args)
    return decision.args
}
