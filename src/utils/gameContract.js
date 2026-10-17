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

let loopLock = false
let exposed = null

export const contractHoldsLoop = () => loopLock

export function exposeGame(spec) {
    if (!import.meta.env.DEV) return null
    const api = {
        meta: { id: spec.id, buttons: spec.buttons || [] },
        reset: (seed = 0) => { spec.reset(seed); return api.state() },
        step: (pad = {}, n = 1) => {
            loopLock = true
            for (let i = 0; i < n; i++) spec.tick(pad || {})
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
