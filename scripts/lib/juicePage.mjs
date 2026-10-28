// juicePage.mjs — the browser half of the juice audit (#1130). Exported as a
// function so BOTH scripts/juiceaudit.mjs and scripts/juicecheck.mjs hand the
// exact same sampler to page.evaluate: one instrument, two users. Runs inside
// the page (window/document/rAF); never invoked in Node, only defined there.

// One window in the page: press `codes` (or tap the canvas centre) for `frames`
// animation frames, sampling the canvas and __game.state() each frame. The
// game's own loop keeps its clock — this only watches. Returns the loudest
// single-frame pixel change, the SFX count, the state keys that moved during
// the window, and whether the score popped.
export const WINDOW = async ({ codes, pointer, frames, tol, noise }) => {
    const g = window.__game
    const src = [...document.querySelectorAll('canvas')].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    if (!src) return { error: 'no canvas' }
    const w = Math.min(src.width || 320, 320)
    const h = Math.max(1, Math.round(w * (src.height || 240) / (src.width || 320)))
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const x = cv.getContext('2d', { willReadFrequently: true })
    const grab = () => { x.drawImage(src, 0, 0, w, h); return x.getImageData(0, 0, w, h).data }
    const raf = () => new Promise((r) => requestAnimationFrame(r))
    // noise keys arrive as an arg: page.evaluate ships the function source only,
    // closure imports do not cross into the page (STATE_NOISE is Node-side)
    const NOISE = noise
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true }))
    const rect = src.getBoundingClientRect()
    const cx = Math.round(rect.left + rect.width / 2)
    const cy = Math.round(rect.top + rect.height / 2)
    const ptr = (type, down) => {
        const opts = { clientX: cx, clientY: cy, bubbles: true, cancelable: true, button: 0, buttons: down ? 1 : 0, pointerId: 7, pointerType: 'mouse', isPrimary: true }
        src.dispatchEvent(new PointerEvent(type, opts))
        src.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts))
    }
    const sfx0 = window.__audioSfx ? window.__audioSfx() : 0
    const before = g.state()
    let prev = grab()
    let prevS = before
    let burst = 0
    const movedKeys = new Set()
    if (pointer) ptr('pointerdown', true)
    for (const c of codes) key('keydown', c)
    for (let i = 0; i < frames; i++) {
        await raf()
        const cur = grab()
        let changed = 0
        for (let k = 0; k < cur.length; k += 4) {
            if (Math.abs(cur[k] - prev[k]) > tol || Math.abs(cur[k + 1] - prev[k + 1]) > tol || Math.abs(cur[k + 2] - prev[k + 2]) > tol) changed++
        }
        burst = Math.max(burst, changed / (cur.length / 4))
        prev = cur
        const s = g.state()
        for (const k of Object.keys(s)) {
            if (NOISE.includes(k)) continue
            if (JSON.stringify(s[k]) !== JSON.stringify(prevS[k])) movedKeys.add(k)
        }
        prevS = s
    }
    for (const c of codes) key('keyup', c)
    if (pointer) ptr('pointerup', false)
    const after = g.state()
    return {
        burst,
        sfx: (window.__audioSfx ? window.__audioSfx() : 0) - sfx0,
        keys: [...movedKeys],
        pop: JSON.stringify(after.score) !== JSON.stringify(before.score),
    }
}

// #1130 — get the sim to a RECEPTIVE phase before measuring. Some titles gate
// input during a wave banner or intro by design (Missile Command ignores fire
// for 150 ticks — an audit that probes the banner reports a false 0%). Locked
// contract steps run the sim deterministically without needing the loop; take
// the shortest pre-roll after which the game is neither over nor parked in a
// wait phase. Both the idle and action windows inherit the same pre-roll at
// the same seed, so the paired comparison stays intact.
export const WAIT_PHASES = ['banner', 'attract', 'intro', 'ready', 'menu', 'start', 'over', 'gameover', 'game over', 'select', 'choose', 'levelup', 'level up', 'pause', 'paused', 'dying', 'respawn', 'brief', 'story']

export const PREP = ({ seed, waits, steps }) => {
    const g = window.__game
    const phaseOf = (s) => String(s.phase || s.screen || s.mode || '').toLowerCase()
    for (const n of steps) {
        g.reset(seed)
        if (n > 0) g.step({}, n)
        g.release()
        const s = g.state()
        if (!s.done && !waits.includes(phaseOf(s))) return { ticks: n, phase: phaseOf(s) }
    }
    return { ticks: steps[steps.length - 1], phase: phaseOf(g.state()) }
}
