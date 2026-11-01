// RALLY CO-DRIVER CALLS (#1251) — the pace-note grammar and the CPU
// co-driver's decision. Pure Node: rallycheck pins every rule here without a
// browser or a mic.
//
// A CALL is { dir: -1 (LEFT) | 0 (STRAIGHT) | 1 (RIGHT), sev: 1|2|3 }.
// The co-driver seat emits calls three ways, all through this file:
//   cpu     — decideCoCall(): the seat reads its corner list (the real stage
//             data) and calls each corner once, at a lead that scales with
//             severity. Honest by construction.
//   human   — coCallFromPad(): the note keys as a rising edge on the co
//             driver's pad (left/right = direction, a/b held = severity 2/3,
//             up = STRAIGHT). The same edge detector the CPU's pads flow
//             through, so one path judges both.
//   voice   — parseCoCall(): "left two", "right three", "straight" → call.
//             The browser layer (speechListen, #1249-style) feeds it.

// lead distance (road units) at which a corner of severity sev gets called
export const leadDist = (sev) => 170 + sev * 95

// LATE_WINDOW — a call made closer to the corner than this is LATE: it
// reaches the driver with no time to act, which is the co-driver's fault
// (rallycheck counts it).
export const LATE_WINDOW = 45

export function callLabel(call) {
    if (!call) return ''
    if (call.crest) return 'CAUTION'
    if (call.dir === 0) return 'STRAIGHT'
    return (call.dir < 0 ? 'L' : 'R') + call.sev
}

// decideCoCall(gs) → call | null — the CPU co-driver, one decision per tick.
// Calls the next corner it has not called for when it enters its lead. It
// never re-calls a passed corner and never calls a corner that is not next:
// the notes are the stage, in order.
export function decideCoCall(gs) {
    const co = gs.co
    const st = gs.stage
    // nextIdx is UNBOUNDED: it counts corners called across the whole stage,
    // so the note flow never re-calls a corner and flows straight across the
    // start line into the next pass (like a real stage). resolvePassed
    // clears the per-corner stamp on every pass, so lap 2 re-calls freely.
    const i = co.nextIdx % st.corners.length
    const c = st.corners[i]
    const d = ((c.s - gs.car.s) % st.L + st.L) % st.L
    if (d > leadDist(c.sev)) return null
    return { dir: c.dir, sev: c.sev }
}

// applyCallEvent(gs, call, via) — fold one call (cpu/human/voice) into the
// sim state: link it to the next UNCALLED corner it names (within 700
// units), stamp the call ledger, push the pace card. A call that names no
// upcoming corner still reaches the card (a misspoken note is a human
// moment, not an error) but is unlinked. Returns the linked corner index or
// -1.
export function applyCallEvent(gs, call, via = 'cpu') {
    if (!call) return -1
    const co = gs.co
    const st = gs.stage
    gs.stats.called++
    let linked = -1
    if (call.dir !== 0) {
        for (let i = 0; i < st.corners.length; i++) {
            const idx = (co.nextIdx + i) % st.corners.length
            const c = st.corners[idx]
            const d = ((c.s - gs.car.s) % st.L + st.L) % st.L
            if (d > 700) break
            if (c.dir === call.dir && !co.called[idx]) {
                linked = idx
                break
            }
        }
        // a STRAIGHT-ish call against a wrong-direction corner: no link
    }
    if (linked >= 0) {
        const c = st.corners[linked]
        const d = ((c.s - gs.car.s) % st.L + st.L) % st.L
        co.called[linked] = { t: gs.tick, sev: call.sev, dir: call.dir, via, _dist0: d }
        co.nextIdx = linked + 1
    }
    gs.card.push({
        dir: call.dir, sev: call.sev, t: gs.tick, via, linked, crest: !!call.crest,
        atS: linked >= 0 ? st.corners[linked].s : null,
    })
    if (gs.card.length > 6) gs.card.shift()
    return linked
}

// resolvePassed(gs, cornerIdx) — the car crossed a corner's s: grade the
// co-driver. called + in the window → correct; called in the last moment →
// late; never called → missed. Also drops the corner's card entries.
export function resolvePassed(gs, cornerIdx) {
    const call = gs.co.called[cornerIdx]
    gs.co.called[cornerIdx] = null
    if (call) {
        // the corner is just passed; grade by how far out the call was made
        if (call._dist0 > LATE_WINDOW) gs.stats.correct++
        else gs.stats.late++
    } else {
        gs.stats.missed++
    }
    gs.card = gs.card.filter((n) => n.linked !== cornerIdx)
}

// coCallFromPad(prev, pad) → call | null — the rising-edge detector for
// human note keys (and the CPU's pads, so both flow through one judge).
//   left  = LEFT   (hold a → LEFT 2, hold b → LEFT 3)
//   right = RIGHT  (hold a → RIGHT 2, hold b → RIGHT 3)
//   up    = STRAIGHT
export function coCallFromPad(prev, pad) {
    const edge = (k) => !!pad[k] && !prev[k]
    if (edge('left') || edge('right')) {
        const dir = edge('left') ? -1 : 1
        const sev = pad.b ? 3 : pad.a ? 2 : 1
        return { dir, sev }
    }
    if (edge('up')) return { dir: 0, sev: 1 }
    return null
}

// parseCoCall(text) → call | null — the spoken grammar.
//   "left two" / "a left two" / "two left" / "hard left" (3) / "left" (1)
//   "right three", "straight on", "keep straight"
// Field QA (#1427): a recognizer mangles an accent the SAME way every time,
// so the grammar takes the common mis-hears — "tree"/"free" (three),
// "to"/"too" (two), "won" (one), "write" (right). NEGATION is silence:
// "no left", "not right three", "no three" name no note and must not fire —
// a negated note played as a note is worse than no note. "caution"/"crest"
// is a warning word: alone it is a CAUTION card (dir 0, sev 2); with a side
// it floors severity at 2 and stamps the call `crest`.
const WORDS = { one: 1, won: 1, '1': 1, two: 2, to: 2, too: 2, '2': 2, three: 3, tree: 3, free: 3, '3': 3, hard: 3, medium: 2, slow: 1 }
export function parseCoCall(text) {
    const t = String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!t) return null
    if (/\bno\b|\bnot\b|\bnone\b|\bdon'?t\b|\bcancel\b|\bignore\b|\bretract\b/.test(t)) return null
    if (/\bstraight\b|\bkeep (on |going )?(straight|flat)\b|\bon (it |through|straight)\b/.test(t)) return { dir: 0, sev: 1 }
    const crest = /\bcaution\b|\bcrest\b|\bblind\b/.test(t)
    let dir = 0
    if (/\bleft\b|\bl\b/.test(t)) dir = -1
    else if (/\bright\b|\br\b|\bwrite\b|\brite\b/.test(t)) dir = 1
    else if (!crest && !/\bcorner\b|\bnext\b/.test(t)) return null // a number with no side is noise
    let sev = crest ? 2 : 1
    for (const [w, n] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`).test(t)) sev = Math.max(sev, n)
    if (/\bhard\b/.test(t)) sev = 3
    if (/\bsharp\b|\bsnap\b/.test(t)) sev = 3
    return crest ? { dir, sev, crest: true } : { dir, sev }
}
