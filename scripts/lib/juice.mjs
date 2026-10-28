// JUICE — the audit's decision math (#1130). Pure: no browser, no clock, no
// fs, so scripts/juicecheck.mjs can gate every threshold on fixtures in plain
// Node while scripts/juiceaudit.mjs feeds it live measurements from Chrome.
// The rule the audit enforces: every player action should get a reaction back
// within ~150 ms — a sound, a visual burst (particles, shake, flash, motion
// beyond what the world does on its own), or a score pop. Nothing back = a
// polish bug, filed to QA.
//
// Channels:
//   sound   — one-shot SFX scheduled by AudioController during the window
//             (the bed does not count; a held note is ambience, not feedback).
//   motion  — the SIM responded: state fields changed during the action window
//             that did NOT move during the equal idle window at the same seed
//             and phase. Deterministic sims make this a noise-free paired test —
//             the pixel diff cannot be that, because attract twinkle and star
//             fields move every frame regardless of input.
//   pop     — state().score changed during the window.
//   fx      — a BIG visual event (explosion, flash, shake): the changed-pixel
//             fraction of a canvas copy must clear BURST_MIN and beat idle. It
//             is deliberately a high bar: the catch-all reaction channel is
//             `motion`, this one names the loud ones.

export const WINDOW_TICKS = 9      // ~150 ms at the shell's 60 Hz fixed step
export const TRIALS = 3            // per action, same seed — one fluke is not a verdict
export const BURST_MIN = 0.02     // ≥2% of the sampled canvas moved at once
export const IDLE_EXCEED = 1.6    // ...and 1.6× the idle baseline at the same phase
export const PIXEL_TOL = 10       // per-channel luma tolerance in the frame diff
// State fields that move without meaning anything (clocks, stamps, seats).
export const STATE_NOISE = ['tick', 'hash', 'seed', 'players']

// Fraction of pixels that differ between two equal-length RGBA arrays. Lives in
// the pure module so juicecheck can pin it; the browser driver passes the same
// tolerance into its canvas sampler.
export function frameDiff(a, b, tol = PIXEL_TOL) {
    let changed = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i += 4) {
        if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) changed++
    }
    return n ? changed / (n / 4) : 0
}

// Keys of a state object that changed between two samples (JSON-stringified
// values; noise keys dropped). The audit collects these per window.
export function changedKeys(before, after) {
    const out = []
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    for (const k of keys) {
        if (STATE_NOISE.includes(k)) continue
        if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) out.push(k)
    }
    return out
}

export function actionVerdict({ sfx = 0, burstMax = 0, idleMax = 0, pop = false, keys = [], idleKeys = [] }) {
    const sound = sfx > 0
    const fx = burstMax >= BURST_MIN && burstMax >= idleMax * IDLE_EXCEED
    const moved = keys.length > idleKeys.length || keys.some((k) => !idleKeys.includes(k))
    const juice = sound || fx || moved || !!pop
    return { sound, fx, moved, pop: !!pop, juice }
}

// One game's score: the share of probed actions that got a reaction.
export function gameScore(actions) {
    const list = Object.values(actions || {})
    if (!list.length) return null
    return list.filter((a) => a.juice).length / list.length
}

export function silentActions(actions) {
    return Object.entries(actions || {}).filter(([, a]) => !a.juice).map(([k]) => k)
}

export function buildReport({ commit = 'unknown', games = [] }) {
    return {
        generated: new Date().toISOString(),
        commit,
        windowTicks: WINDOW_TICKS,
        trials: TRIALS,
        thresholds: { burstMin: BURST_MIN, idleExceed: IDLE_EXCEED, pixelTol: PIXEL_TOL },
        games: games.map((g) => ({ ...g, score: gameScore(g.actions) })),
    }
}
