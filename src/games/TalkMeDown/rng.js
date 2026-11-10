// mulberry32 — the one seeded generator this sim consumes (determinism law).
// #1880: the counter rides the net snapshot (the one thing a seed alone
// cannot rebuild mid-run), so the stream position is readable/settable on the
// function object. Additive — the sequence a seed produces is untouched.
export function mulberry32(a) {
    const f = function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    f.state = () => a | 0
    f.setState = (v) => { a = v | 0 }
    return f
}
