// boredomPage.mjs — the browser half of the boredom map (#1131). Exported as
// a function so BOTH scripts/boredomaudit.mjs and scripts/boredomcheck.mjs
// hand the exact same replay+sensor to page.evaluate: one instrument, two
// users. Runs inside the page; never invoked in Node, only defined there.
//
// REPLAY is the nightly bot's own policy (mulberry32 chained on (seed, tick))
// driven through locked contract steps — the same clock nightlybot.mjs uses, so
// the map charts the runs the nightly bot actually lives through. Unlike the
// #1130 juice audit, no live loop is needed: boredom lives in the WORLD
// (score, enemies, damage), not in audio/particles, and locked steps are
// deterministic, seedable and ~1000× faster than real time.
//
// Per tick it diffs `__game.state()` into { ev, dmg, act } exactly as
// scripts/lib/boredom.mjs defines them (the rules ship as `opts` because
// page.evaluate carries function source only, no closure imports), plus the
// `level` field value so runs can be split into courses afterwards.
export const REPLAY = ({ seed, cap, buttons, pointer, opts }) => {
    const mul = (aa) => function () {
        aa |= 0; aa = (aa + 0x6D2B79F5) | 0
        let t = Math.imul(aa ^ (aa >>> 15), 1 | aa)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const g = window.__game
    const zero0 = g.reset(seed)
    // wait-phase pre-roll (#1130's PREP lesson): an attract/banner intro is original
    // law, not boredom — step through it before the first sample so dead air starts
    // where playing starts.
    const phaseOf = (s) => String((s && (s.phase || s.screen || s.mode)) || '').toLowerCase()
    let pre = zero0
    let preTicks = 0
    for (let n = 0; n < opts.preRoll && !pre.done && opts.waits.includes(phaseOf(pre)); n++) {
        pre = g.step({}, 1)
        preTicks++
    }
    const zero = pre
    let prev = zero
    const seenKeys = new Set(Object.keys(zero || {}))
    const samples = [{ ev: 0, dmg: 0, act: 0, level: zero.level !== undefined ? zero.level : (zero.wave !== undefined ? zero.wave : null) }]
    let done = !!zero.done
    for (let i = 0; i < cap; i++) {
        const rng = mul((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0)
        const r = rng()
        const pad = {}
        if (pointer) {
            const nr = rng()
            pad.pointer = { x: 0.08 + 0.84 * rng(), y: 0.10 + 0.8 * rng(), down: nr < 0.25 }
            if (buttons.includes('a') && nr > 0.8) pad.a = true
        } else {
            if (r < 0.24) pad.left = true
            else if (r < 0.48) pad.right = true
            else if (r < 0.60) pad.up = true
            else if (r < 0.70) pad.down = true
            if (buttons.includes('a') && rng() < 0.18) pad.a = true
            if (buttons.includes('b') && rng() < 0.10) pad.b = true
        }
        const s = g.step(pad, 1)
        let ev = 0, dmg = 0, act = 0, dist = 0
        const keys = new Set([...Object.keys(prev || {}), ...Object.keys(s || {})])
        for (const k of keys) {
            if (opts.noise.includes(k)) continue
            const b = prev ? prev[k] : undefined
            const a = s ? s[k] : undefined
            const bs = JSON.stringify(b), as = JSON.stringify(a)
            if (bs === as) continue
            if (k === 'score' && typeof b === 'number' && typeof a === 'number') { if (a > b) ev += a - b; continue }
            if (opts.damage.includes(k) && typeof b === 'number' && typeof a === 'number') { if (a < b) dmg += b - a; continue }
            const big = (x) => x === undefined || x.length > opts.keyMaxLen
            if (!big(bs) && !big(as)) {
                act++
                // a moved position carries HOW FAR, not just that it moved:
                // coasting must read quieter than sprinting, or a flat section
                // of a runner stays "live" at one count per tick forever
                if (Array.isArray(b) && Array.isArray(a)) {
                    for (let j = 0; j < Math.min(b.length, a.length); j++) {
                        if (typeof b[j] === 'number' && typeof a[j] === 'number') dist += Math.abs(a[j] - b[j])
                    }
                } else if (typeof b === 'number' && typeof a === 'number') {
                    dist += Math.abs(a - b)
                }
            }
        }
        for (const k of Object.keys(s || {})) seenKeys.add(k)
        samples.push({ ev, dmg, act, dist: Math.round(dist * 1000) / 1000, level: s.level !== undefined ? s.level : (s.wave !== undefined ? s.wave : null) })
        prev = s
        if (s.done) { done = true; break }
    }
    g.release()
    return { seed, preTicks, ticks: samples.length - 1, done, keys: [...seenKeys], samples }
}
