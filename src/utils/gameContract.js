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

import { normalizePad, rawPad } from './onePad'
import { createRecorder, verifyRecording, DEFAULT_HASH_EVERY } from './recording'

let loopLock = false
let exposed = null
let recorder = null

export const contractHoldsLoop = () => loopLock

// `spec.method` is the game's input method ('dpad' | 'stick' | 'pointer', #420)
// and `spec.reads` the one-pad fields it actually consumes. Both surface on
// __game.meta so the harness and a remapper know what the game hears. `step`
// folds whatever a caller passes into THE one pad for that method, so a dpad
// game's step({x: 1}) reads as "right" exactly the way the on-screen d-pad does.
export function exposeGame(spec) {
    if (!import.meta.env.DEV) return null
    const method = spec.method || 'stick'
    const BUILD = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
    // #495: while a recorder runs, every step tick is banked — the normalized
    // pad per seat, the raw device view per seat, and the game's state.hash at
    // checkpoint ticks. hashAt marks which tick of this batch the post-step
    // hash belongs to (held-pad batches of n identical ticks only know one).
    const captureTicks = (pads, raws, hashAt = 0) => {
        const st = spec.state()
        const h = st && (typeof st.hash === 'number' || typeof st.hash === 'string') ? st.hash : null
        const seats = raws || pads.map((_, i) => rawPad(i + 1))
        for (let k = 0; k < pads.length; k++) recorder.addTick(pads[k], seats, k === hashAt ? h : null)
    }
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
            const array = Array.isArray(pad)
            if (array) {
                const ones = pad.map((p) => normalizePad(p || {}, method))
                if (!ones.length) ones.push(normalizePad({}, method))
                spec.tick(ones[0], ones)
                if (recorder) captureTicks(ones, null)
            } else {
                const one = normalizePad(pad || {}, method)
                const len = n > 0 ? Math.ceil(n) : 0
                for (let i = 0; i < len; i++) spec.tick(one, [one])
                if (recorder && len > 0) captureTicks(Array.from({ length: len }, () => one), null, len - 1)
            }
            return api.state()
        },
        release: () => { loopLock = false },
        // #495 RECORD/REPLAY. recordStart opens a `retrogames-rec/v1` capture
        // (seed taken from the game's own state — the game must report it),
        // every following step() is banked, recordStop returns the file object
        // (also parked at window.__lastRecording). replay(rec) replays a file
        // through this very contract and checks state.hash at every checkpoint.
        recordStart: (hashEvery = DEFAULT_HASH_EVERY) => {
            const s = spec.state()
            if (!Number.isInteger(s.seed)) throw new Error('recordStart: state() must report an integer seed')
            recorder = createRecorder({
                gameId: spec.id,
                method,
                seed: s.seed,
                players: spec.players && spec.players > 1 ? spec.players : 1,
                build: spec.build || BUILD,
                hashEvery,
                sources: spec.sources ? spec.sources() : null,
            })
            return { recording: true, seed: s.seed, players: spec.players && spec.players > 1 ? spec.players : 1, hashEvery }
        },
        recordStop: () => {
            if (!recorder) return null
            const s = spec.state()
            const rec = recorder.finish(typeof s.hash === 'number' || typeof s.hash === 'string' ? s.hash : null)
            recorder = null
            window.__lastRecording = rec
            return rec
        },
        replay: (rec) => verifyRecording(rec, {
            reset: (seed, players) => { api.reset(seed, players) },
            step: (pads) => { api.step(pads) },
            state: () => api.state(),
        }),
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
    recorder = null
    if (exposed && window.__game === exposed) delete window.__game
    exposed = null
}
