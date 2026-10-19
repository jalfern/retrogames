// GAME CONTRACT — one window.__game API for every title (issue #377).
//
// QA bots, replays and an RL wrapper drive any game the same way:
//   __game.reset(seed) → __game.step(pad, n) → __game.state() / __game.frame()
//
// DEV-only: a production build makes exposeGame a no-op, so window.__game never
// exists on jalfern.com — same law as every __<game>Test hook.
//
// A game supplies primitives (reset/tick/state/canvas) and this wrapper builds
// the uniform surface. The loop lock is one module-level latch: `step` closes
// it, `release` opens it, and the game's rAF loop checks contractHoldsLoop()
// before simulating — the driver owns the clock while it is closed. The loop
// keeps drawing, so frame() always shows the live canvas.

import { normalizePad } from './onePad'

let loopLock = false
let exposed = null

export const contractHoldsLoop = () => loopLock

// `spec.method` is the game's input method ('dpad' | 'stick' | 'pointer', #420)
// and `spec.reads` the one-pad fields it actually consumes. Both surface on
// __game.meta so the harness and a remapper know what the game hears. `step`
// folds whatever a caller passes into THE one pad for that method, so a dpad
// game's step({x: 1}) reads as "right" exactly the way the on-screen d-pad does.
export function exposeGame(spec) {
    if (!import.meta.env.DEV) return null
    const method = spec.method || 'stick'
    const api = {
        meta: {
            id: spec.id,
            method,
            players: spec.players && spec.players > 1 ? spec.players : 1,
            buttons: spec.buttons || [],
            reads: spec.reads || [],
            ...(spec.ways ? { ways: spec.ways } : {}),
            ...(spec.steer ? { steer: spec.steer } : {}),
        },
        // `players` (#494): an optional seat count for games that support more
        // than one hero — single-player titles ignore it entirely.
        reset: (seed = 0, players = 1) => { spec.reset(seed, players); return api.state() },
        step: (pad = {}, n = 1) => {
            loopLock = true
            // One pad PER PLAYER (#494): an array steps once with pads[0] for
            // player 1, pads[1] for player 2, ... A single pad still steps the
            // same way it always did — held for n ticks — so every legacy
            // call and every single-player game is byte-identical.
            if (Array.isArray(pad)) {
                const ones = pad.map((p) => normalizePad(p || {}, method))
                if (!ones.length) ones.push(normalizePad({}, method))
                spec.tick(ones[0], ones)
            } else {
                const one = normalizePad(pad || {}, method)
                for (let i = 0; i < n; i++) spec.tick(one, [one])
            }
            return api.state()
        },
        release: () => { loopLock = false },
        state: () => {
            const s = spec.state()
            return { tick: 0, score: 0, done: false, ...s }
        },
        frame: () => {
            const c = spec.canvas()
            return c ? c.toDataURL('image/png') : null
        },
    }
    if (spec.snapshot) api.snapshot = () => spec.snapshot()
    if (spec.restore) api.restore = (s) => spec.restore(structuredClone(s))
    exposed = api
    window.__game = api
    return api
}

export function unexposeGame() {
    loopLock = false
    if (exposed && window.__game === exposed) delete window.__game
    exposed = null
}
