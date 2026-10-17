// LUNAR LANDER — policy.js : JS forward pass for the exported PPO policy net.
// Pure ESM (no DOM, no fetch) so scripts/landerpolicycheck.mjs can audit it
// against SB3-scored fixtures. Obs arrive raw (physical units) and are scaled
// exactly like the training env; probs = softmax(action_net(tanh∘tanh)).

import { makeGame, step } from './sim.js'
import { terrainY } from './terrain.js'

export const ACTION_LABELS = ['nothing', 'rotate_left', 'rotate_right', 'thrust']
export const BTN = { nothing: [0, false], rotate_left: [-1, false], rotate_right: [1, false], thrust: [0, true] }
export const ACTION_VECS = {
    nothing: [0, false], rotate_left: [-1, false], rotate_right: [1, false], thrust: [0, true],
    rotate_left_thrust: [-1, true], rotate_right_thrust: [1, true],
}

// an exported policy JSON carries its own action list — 4- and 6-action nets both run
export function actionVector(policy, idx) {
    return ACTION_VECS[policy.actions?.[idx]] || [0, false]
}

export function softmax(logits) {
    const m = Math.max(...logits)
    const e = logits.map((v) => Math.exp(v - m))
    const s = e.reduce((a, b) => a + b, 0)
    return e.map((v) => v / s)
}

export function policyProbs(policy, raw) {
    let v = raw.map((x, i) => x * policy.scale[i])
    const last = policy.layers.length - 1
    policy.layers.forEach((L, li) => {
        const out = new Array(L.w.length)
        for (let o = 0; o < L.w.length; o++) {
            let s = L.b[o]
            const row = L.w[o]
            for (let i = 0; i < v.length; i++) s += row[i] * v[i]
            out[o] = s
        }
        v = li === last ? out : out.map(Math.tanh)
    })
    return softmax(v)
}

export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (Math.imul(a, 1664525) + 1013904223) >>> 0
        return a / 4294967296
    }
}

export function sampleAction(probs, rng) {
    let r = rng()
    for (let i = 0; i < probs.length; i++) {
        r -= probs[i]
        if (r <= 0) return i
    }
    return probs.length - 1
}

// the RL bridge's observation vector from live sim state
export function obsFrom(gs) {
    let padCx = 512, bestD = Infinity
    for (const p of gs.terrain.pads) {
        const d = Math.abs(gs.x - p.cx)
        if (d < bestD) { bestD = d; padCx = p.cx }
    }
    return [gs.x, gs.y, gs.vx, gs.vy, gs.rot, gs.fuel, gs.x - padCx, gs.y - terrainY(gs.terrain.pts, gs.x)]
}

// headless episode: fly the policy from a start point; returns the outcome tag
export function episodeOutcome(policy, seed, x, vx, maxTicks = 1200, rngSeed = null) {
    const gs = makeGame(seed)
    gs.x = Math.max(20, Math.min(1008, x))
    gs.vx = vx
    const rs = rngSeed !== null ? rngSeed >>> 0
        : (seed ^ Math.imul(Math.round(x), 7919) ^ Math.imul(Math.round(vx * 97), 104729)) >>> 0
    const rng = mulberry32(rs)
    for (let i = 0; i < maxTicks; i++) {
        const probs = policyProbs(policy, obsFrom(gs))
        const [rot, thrust] = actionVector(policy, sampleAction(probs, rng))
        gs.events.length = 0
        step(gs, { rot, thrust })
        for (const e of gs.events) {
            if (e.type === 'crash') return 'crash'
            if (e.type === 'land') return e.pad ? 'pad' : 'off_pad'
        }
        if (gs.end) return 'crash'
    }
    return 'timeout'
}
