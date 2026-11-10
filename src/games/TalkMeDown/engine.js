// TALK ME DOWN — deterministic split-info bomb puzzle (#1252).
//
// Pure module: Node + browser, no DOM, no React. All randomness comes from the
// seed (mulberry32). Seed + per-seat pad streams ⇒ identical hashes (#494).
//
// THE SPLIT: seat 1 (DEFUSER) sees the bomb panel — LED bar, bolt, modules
// stamped N3/D1/G2 — but owns NO rules; the SERIAL hides on the BACK plate
// (#1802), so serial rules force the flip conversation. Seat 2 (MANUAL) owns the
// rulebook whose entries answer those stamps but cannot see the bomb. The only
// channel between human seats is speech (the couch, or the mic, voice.js).
//
// MODULES (tiny strict verbs so a trained model can take either seat):
//   NEON  — cut exactly ONE colored wire   (arrows pick, A cuts)
//   DIAL  — turn a 0-9 dial, press SET   (arrows turn, A = SET)
//   GLYPH — press THREE symbols in order  (arrows pick, A presses)
// Every rule is a pure function of features the DEFUSER can see and read
// aloud: serial digit (BACK plate), LED count, bolt color, wire colors/lit states.
//
// STRIKES: a wrong verb sparks — module locks 3 s, -5 s off the fuse, one of
// three breakers trips. Three breakers or a zero fuse and the block glows.
//
// BACK PANEL (#1797): UP at module 1 tilts the bomb onto its maintenance back —
// 0-2 BATTERIES stamped there are facts no front rule ever needed, and D5/G5
// demand them aloud. DOWN tilts back; the flipped side holds no verbs.
//
// ROUNDS: short bombs, rising pressure — round r carries min(1+(r>>1), 4)
// modules on max(30, 70-5r) seconds; rule variants unlock 1+round deep, so
// round 1 is exactly N1/N2/D1/D2/G1/G3 and every stamp is live by the quota.
// Five bombs cleared = SQUAD CHIEF stamp.

import { mulberry32 } from './rng.js'

export const MAX_STRIKES = 3
export const LOCK_TICKS = 180      // 3 s lockout after a strike
export const STRIKE_FUSE_COST = 300 // -5 s per strike
export const QUOTA_BOMBS = 5
export const SEAT_DEFUSER = 0
export const SEAT_MANUAL = 1

// ---- shared vocabularies ------------------------------------------------------
export const WIRE_COLORS = ['RED', 'BLUE', 'YELLOW', 'GREEN', 'WHITE', 'BLACK']
export const GLYPHS = ['STAR', 'DIAMOND', 'CLUB', 'SPADE', 'BOLT', 'MOON']

// footer maps printed on the manual pages (and stamped on the bomb plate).
export const COLOR_NUM = Object.fromEntries(WIRE_COLORS.map((c, i) => [c, i]))
export const GLYPH_NUM = Object.fromEntries(GLYPHS.map((g, i) => [g, i]))

// ---- rulebook ---------------------------------------------------------------
// Rule fns read the bomb features + the module itself and answer the target,
// or null when the printed precondition fails (never happens on generated
// bombs — the generator retries until every rule resolves).
//   target kinds: { wire: idx } | { dial: n } | { seq: [glyphIdx x3] }
export const RULEBOOK = {
    N: [
        {
            id: 'N1', text: 'Cut the RED wire.',
            target: (f, m) => m.wires.findIndex(w => w.color === 0 && !w.cut),
        },
        {
            id: 'N2', text: 'Cut the ONE lit wire.',
            target: (f, m) => {
                const on = m.wires.filter(w => w.lit && !w.cut)
                return on.length === 1 ? m.wires.indexOf(on[0]) : -1
            },
        },
        {
            id: 'N3', text: 'Cut the BLUE wire. No BLUE? Cut the WHITE.',
            target: (f, m) => {
                const i = m.wires.findIndex(w => w.color === 1 && !w.cut)
                return i >= 0 ? i : m.wires.findIndex(w => w.color === 4 && !w.cut)
            },
        },
        {
            id: 'N4', text: 'LIT count even? Cut the LEFT lit wire. Odd? Cut the RIGHT lit wire.',
            target: (f, m) => {
                const on = m.wires.filter(w => w.lit && !w.cut)
                if (!on.length) return -1
                return m.wires.indexOf(on.length % 2 === 0 ? on[0] : on[on.length - 1])
            },
        },
        {
            id: 'N5', text: 'Cut the wire the color of the BOLT.',
            target: (f, m) => m.wires.findIndex(w => w.color === f.bolt && !w.cut),
        },
        {
            id: 'N6', text: 'BACK-plate SERIAL digit picks a color (footer). Cut that color DARK; none dark? Cut it LIT.',
            target: (f, m) => {
                const c = f.serialDigit % 6
                const dark = m.wires.findIndex(w => w.color === c && !w.lit && !w.cut)
                if (dark >= 0) return dark
                return m.wires.findIndex(w => w.color === c && !w.cut)
            },
        },
    ],
    D: [
        { id: 'D1', text: 'Set the dial to the SERIAL\'s last digit (BACK plate). Then SET.', target: f => f.serialDigit },
        { id: 'D2', text: 'Set the dial to the number of lit LEDs. Then SET.', target: f => f.leds },
        {
            id: 'D3', text: 'Double the SERIAL digit (BACK plate), keep the units. Set that. Then SET.',
            target: f => (f.serialDigit * 2) % 10,
        },
        {
            id: 'D4', text: 'Another module has wires? Set that wire count. If not, lit LEDs + 3, units. Then SET.',
            // ANCHORED (#1708): the cross-reference is the LAYOUT, not the
            // progress. A NEON sibling keeps its wires on the panel after its
            // cut, so the printed count stays the truth for the whole bomb.
            // The old `!x.solved` guard let the answer silently flip to the
            // LEDs+3 fallback the moment the defuser cut that sibling — the
            // page kept saying 3 while the engine demanded something else.
            target: (f, m, all) => {
                const neon = all && all.find(x => x !== m && x.type === 'N')
                if (neon) return neon.wires.length
                return (f.leds + 3) % 10
            },
        },
        {
            id: 'D5', text: 'Count the BATTERIES on the BACK panel. Set the dial to that number. Then SET.',            // #1797: the back panel's batteries are the dial's whole answer —
            // 0..2, so this rule is solvable by construction on every bomb.
            // #1909: the count is LIVE — if the squad drained one first, the
            // plate shows one less and the page is still true (it says COUNT).
            target: f => f.batteries,
        },
        {
            id: 'D6', pull: true,
            text: 'PULL OUT a battery from the BACK plate (it has one). Set the dial to the number of batteries LEFT. Then SET.',
            // #1909 THE DRAIN: the original's battery holders are physical —
            // KTANE rules that spend a battery make the flip an ACTION, not
            // just a read. The demanded number is the live plate count once
            // pulled (what is LEFT); before the pull the page already names
            // b-1 because the rule spends exactly one (hold caps at one).
            // Gate is pulls (the act, once done, stays done) — pushing a
            // battery back is a fiddle, and the demanded number is then the
            // live plate count the page's "LEFT" still matches.
            target: (f, m, all, gs) => (gs && gs.pulls > 0 ? f.batteries : f.batteries - 1),
        },
    ],
    G: [
        { id: 'G1', text: 'Press STAR, then BOLT, then MOON.', target: () => [0, 4, 5] },
        {
            id: 'G2', text: 'Press MOON, then the SERIAL digit\'s glyph (serial is on the BACK), then the LED count\'s glyph (footer).',
            target: f => [5, f.serialDigit % 6, f.leds % 6],
        },
        { id: 'G3', text: 'Press DIAMOND, then CLUB, then SPADE.', target: () => [1, 2, 3] },
        {
            id: 'G4', text: 'LED count\'s glyph, SERIAL digit\'s glyph (BACK plate), then LED count again (footer).',
            target: f => [f.leds % 6, f.serialDigit % 6, f.leds % 6],
        },
        {
            id: 'G5', text: 'BACK-panel BATTERY count as a glyph (footer), then SPADE, then the count again.',
            // #1797: batteries are 0..2 — always a real footer glyph, always
            // solvable; the defuser must tilt the bomb over to read them aloud.
            target: f => [f.batteries, 3, f.batteries],
        },
    ],
}

// #1802: the stamps whose fact lives on the BACK plate (serial moved there —
// the original hides it, and "Serial Port!" is the reason to flip). Seat 2's
// page stamps an "ask them to FLIP" coach line while any of these is live.
export const BACK_FACT_STAMPS = ['N6', 'D1', 'D3', 'D5', 'G2', 'G4', 'G5']

export function ruleOf(m) {
    return RULEBOOK[m.type].find(r => r.id === m.stamp)
}

// computeTarget — the solver primitive (the CPU manual partner and the harness
// both use THIS; the printed rule text is the human copy of the same truth).
export function computeTarget(gs, m) {
    if (m.solved) return null
    const r = ruleOf(m)
    if (m.type === 'N') {
        const i = r.target(gs.features, m, gs.modules)
        return i >= 0 ? { wire: i } : null
    }
    if (m.type === 'D') {
        const n = r.target(gs.features, m, gs.modules, gs)
        if (!Number.isInteger(n) || n < 0 || n > 9) return null
        // #1909: a pull rule answers with its pull flag until the battery is
        // actually out — the dial value it prints is already the LEFT count.
        return r.pull && gs.pulls === 0 ? { dial: n, pull: true } : { dial: n }
    }
    const seq = r.target(gs.features, m, gs.modules)
    return Array.isArray(seq) && seq.length === 3 ? { seq: seq.slice() } : null
}

// ---- bomb generation --------------------------------------------------------
function fuseFor(round) { return Math.max(30, 70 - round * 5) }
function moduleCountFor(round) { return Math.min(1 + (round >> 1), 4) }
export function variantPool(type, round) {
    const all = RULEBOOK[type]
    // #1797: slope 1 + round. Round 1 now carries EXACTLY the set the README
    // promises (N1/N2/D1/D2/G1/G3 — the old 2+ceil(r/2) leaked N5/D3/G2 into
    // round 1, a text!=truth), and every stamp unlocks inside the 5-bomb
    // quota: D5/G5 at round 2, and N6 — dead under the old slope (needed
    // round 8, the quota ends at 5) — at round 5.
    const open = { N: [1, 2, 5, 3, 4, 6], D: [1, 2, 5, 4, 3, 6], G: [1, 3, 5, 2, 4] }[type]
    // D keeps D4 at round 3 (where #1708's anchor gates prove it; D3 slides to
    // round 4) and surfaces D5 at round 2; G surfaces G5 at round 2, G4 by 4.
    // #1909 appends D6 last: depth 6 = round 5 — and round 5 is exactly where
    // the seat law lands a DIAL (GLYPH only seats at round 4/depth 5, so a G6
    // would never generate; the drain rides the dial, and G5 is its mirror).
    const depth = Math.min(all.length, 1 + round)
    return open.slice(0, depth)
}

function genFeatures(rng) {
    const L = () => String.fromCharCode(65 + (rng() * 26) | 0)
    const d = () => (rng() * 10) | 0
    return {
        serial: `${L()}${L()}${d()}${L()}${d()}`,
        leds: (rng() * 9) | 0,
        bolt: (rng() * 6) | 0,
        serialDigit: 0, // fixed below — last char is always a digit
        batteries: (rng() * 3) | 0, // #1797: 0-2, stamped on the BACK panel
    }
}

function genModule(rng, type, stamp, round, features) {
    const m = { type, stamp, solved: false, locked: 0, flash: 0 }
    if (type === 'N') {
        const n = Math.min(3 + ((round - 1) % 2), 5)
        for (let attempt = 0; attempt < 40; attempt++) {
            const colors = []
            while (colors.length < n) {
                const c = (rng() * 6) | 0
                if (!colors.includes(c)) colors.push(c)
            }
            m.wires = colors.map(c => ({ color: c, lit: rng() < 0.45, cut: false }))
            const probe = { ...features }
            const t = ruleOf(m).target(probe, m, null)
            if (t >= 0 && m.wires[t] && !m.wires[t].cut) return m
        }
        // deterministic fallback (never seen in practice): N1 with a RED wire.
        m.wires = [{ color: 0, lit: false, cut: false }, { color: 5, lit: false, cut: false }, { color: 1, lit: false, cut: false }]
        m.stamp = 'N1'
        return m
    }
    if (type === 'D') {
        m.dial = (rng() * 10) | 0
        return m
    }
    return m // GLYPH: keys are always the six symbols
}

export function buildBomb(gs) {
    const rng = gs.rng
    const round = gs.round
    // #1909: a new bomb lands with a full, untouched plate — whatever the
    // squad drained off the last block stays off it. Reset BEFORE the module
    // probes so pull rules resolve against this bomb's fresh battery count.
    gs.held = 0
    const features = genFeatures(rng)
    features.serialDigit = Number(features.serial[features.serial.length - 1])
    const n = moduleCountFor(round)
    const types = ['N', 'D', 'G']
    const mods = []
    for (let i = 0; i < n; i++) {
        // seat the iconic wire module first — a bomb is recognizable in one glance
        const type = i === 0 ? 'N' : types[(i + round) % 3]
        let stampId = 0
        let m = null
        for (let attempt = 0; attempt < 24 && !m; attempt++) {
            const pool = variantPool(type, round)
            stampId = pool[(rng() * pool.length) | 0]
            const stamp = type + stampId
            const cand = genModule(rng, type, stamp, round, features)
            // solvable against the features + already-planned modules?
            const probe = { modules: mods.concat([cand]) }
            const t = solveTarget(gs, cand, features, probe.modules)
            if (t !== null) m = cand
        }
        if (!m) { // last-ditch deterministic floor: easiest shallow rule
            const stamp = type + '1'
            m = genModule(rng, type, stamp, round, features)
            if (type === 'N') m.wires = [{ color: 0, lit: false, cut: false }, { color: 1, lit: true, cut: false }, { color: 2, lit: false, cut: false }]
        }
        mods.push(m)
    }
    // wire the D4 cross-reference deterministically: ensure a NEON sibling exists
    // when D4 is picked (or fall back to its else-branch — both resolve).
    gs.features = features
    gs.modules = mods
    gs.fuse = fuseFor(round) * 60
    gs.fuseMax = gs.fuse
    gs.cursor = { mod: 0, sub: 0 }
    gs.cursorFlash = 0
    gs.flip = 0 // #1797: every new bomb lands face-up
    gs.order = null
    gs.orderFor = -1
    gs.orderTicks = 0
}

function solveTarget(gs, m, features, all) {
    if (m.solved) return null
    const r = ruleOf(m)
    if (m.type === 'N') {
        const i = r.target(features, m, all)
        return i >= 0 ? { wire: i } : null
    }
    if (m.type === 'D') {
        const n = r.target(features, m, all, gs)
        return Number.isInteger(n) && n >= 0 && n <= 9 ? { dial: n } : null
    }
    const seq = r.target(features, m, all)
    return Array.isArray(seq) && seq.length === 3 ? { seq: seq.slice() } : null
}

// ---- game -------------------------------------------------------------------
export function createGame(seed, players = 1) {
    const gs = {
        seed: seed >>> 0,
        rng: mulberry32((seed >>> 0) ^ 0xB0DB),
        tick: 0,
        round: 1,
        score: 0,
        strikes: 0,
        bombsCleared: 0,
        done: false,
        won: false,
        boomTick: -1,
        players: Math.max(1, Math.min(2, players | 0 || 1)),
        features: null,
        modules: [],
        fuse: 0,
        fuseMax: 0,
        cursor: { mod: 0, sub: 0 },
        cursorFlash: 0,
        manual: { page: 0, line: 0, flag: null, flagTicks: 0 },
        order: null, orderFor: -1, orderTicks: 0,   // CPU partner chat
        events: [],           // transient fx cues consumed by the shell
        clearFlash: 0,
        seqInput: {},         // moduleId -> glyphs pressed so far
        flip: 0,              // #1797: 0 = module panel, 1 = back plate
        held: 0,              // #1909: battery in hand (0/1 — the pocket is one deep)
        pulls: 0,             // #1909: batteries pulled since this bomb armed (pull rules gate on it)
        aPrev: false,         // #1909: A held last tick — the drain edge-detects on it (not hashed: input echo)
    }
    buildBomb(gs)
    return gs
}

function spark(gs, m, why) {
    gs.strikes += 1
    m.locked = LOCK_TICKS
    gs.fuse = Math.max(1, gs.fuse - STRIKE_FUSE_COST)
    gs.events.push({ k: 'strike', why })
    if (gs.strikes >= MAX_STRIKES) {
        gs.done = true
        gs.won = false
        gs.boomTick = gs.tick
    }
}

function defuserAct(gs, pad) {
    const mods = gs.modules
    // #1909: rising-edge of A, for the drain (the flipped branch has no
    // module-lock to swallow held-key repeats).
    const aTap = pad.a && !gs.aPrev
    gs.aPrev = !!pad.a
    // #1797 THE FLIP LAW — UP at module 1 tilts the bomb onto its back,
    // DOWN tilts it face-up again. While flipped the module verbs stay
    // refused silently (no strike — the tilt is free, KTANE-style, and a
    // strike for looking at your own batteries would punish the very
    // curiosity the panel advertises). #1909 amended the law: the back has
    // ONE verb of its own — A drains the plate (THE DRAIN, just below).
    // Seat 1 alone owns hands; the manual seat never sees the bomb.
    if (gs.flip) {
        if (pad.down) { gs.flip = 0; gs.events.push({ k: 'flip', to: 0 }); return }
        // #1909 THE DRAIN — while the back is up, A is a hand: it pulls one
        // battery out (the pocket holds one) or puts it back. Handling the
        // batteries is as free as the tilt itself — the empty end and the
        // full end refuse SILENTLY, a fiddle with the plate is never a strike.
        // The drain is EDGE-triggered (aTap): the flip branch has no lock to
        // swallow held-key repeats, so a held A would ratchet pull-push-pull.
        // One press, one action.
        if (aTap && gs.held === 0 && gs.features.batteries > 0) {
            gs.features.batteries -= 1; gs.held = 1; gs.pulls += 1
            gs.events.push({ k: 'pull' })
        } else if (aTap && gs.held > 0) {
            gs.features.batteries += 1; gs.held = 0
            gs.events.push({ k: 'push' })
        }
        return
    }
    if (pad.up && gs.cursor.mod === 0) { gs.flip = 1; gs.events.push({ k: 'flip', to: 1 }); return }
    const m = mods[gs.cursor.mod]
    if (!m) return
    // module selector: up/down cycles live modules
    if (pad.up) {
        gs.cursor.mod = (gs.cursor.mod + mods.length - 1) % mods.length
        gs.cursor.sub = 0; gs.cursorFlash = 8; gs.orderFor = -1
        return
    }
    if (pad.down) {
        gs.cursor.mod = (gs.cursor.mod + 1) % mods.length
        gs.cursor.sub = 0; gs.cursorFlash = 8; gs.orderFor = -1
        return
    }
    if (m.locked > 0) return // locked modules refuse every verb
    const t = computeTarget(gs, m)

    if (m.type === 'N') {
        const live = m.wires.length
        if (pad.left) { gs.cursor.sub = (gs.cursor.sub + live - 1) % live; return }
        if (pad.right) { gs.cursor.sub = (gs.cursor.sub + 1) % live; return }
        if (pad.a) {
            const w = m.wires[gs.cursor.sub]
            if (!w || w.cut) return
            if (t && t.wire === gs.cursor.sub) {
                w.cut = true
                m.solved = true; m.flash = 30
                gs.score += 100 + gs.round * 20
                gs.events.push({ k: 'safe' })
                settle(gs)
            } else spark(gs, m, 'wrong wire')
        }
        return
    }
    if (m.type === 'D') {
        if (pad.left) { m.dial = (m.dial + 9) % 10; return }
        if (pad.right) { m.dial = (m.dial + 1) % 10; return }
        if (pad.a) {
            if (t && m.dial === t.dial && !t.pull) {
                m.solved = true; m.flash = 30
                gs.score += 100 + gs.round * 20
                gs.events.push({ k: 'safe' })
                settle(gs)
            } else spark(gs, m, t && t.pull ? 'battery still in place' : 'dial off')
        }
        return
    }
    // GLYPH
    if (pad.left) { gs.cursor.sub = (gs.cursor.sub + 5) % 6; return }
    if (pad.right) { gs.cursor.sub = (gs.cursor.sub + 1) % 6; return }
    if (pad.a) {
        const pressed = gs.seqInput[gs.cursor.mod] || []
        const want = t ? t.seq[pressed.length] : -1
        if (gs.cursor.sub === want) {
            pressed.push(gs.cursor.sub)
            gs.seqInput[gs.cursor.mod] = pressed
            gs.events.push({ k: 'key' })
            if (pressed.length === 3) {
                m.solved = true; m.flash = 30
                gs.score += 100 + gs.round * 20
                gs.events.push({ k: 'safe' })
                settle(gs)
            }
        } else {
            gs.seqInput[gs.cursor.mod] = []
            spark(gs, m, 'wrong glyph')
        }
    }
}

function manualAct(gs, pad) {
    const pages = ['N', 'D', 'G']
    if (pad.left) { gs.manual.page = (gs.manual.page + 2) % 3; gs.manual.line = 0 }
    if (pad.right) { gs.manual.page = (gs.manual.page + 1) % 3; gs.manual.line = 0 }
    const rules = RULEBOOK[pages[gs.manual.page]]
    const depth = Math.min(rules.length, variantPool(pages[gs.manual.page], gs.round).length)
    if (pad.up) gs.manual.line = (gs.manual.line + depth - 1) % depth
    if (pad.down) gs.manual.line = (gs.manual.line + 1) % depth
    if (pad.a) {
        const stamp = rules[gs.manual.line].id
        gs.manual.flag = stamp
        gs.manual.flagTicks = 180
        gs.events.push({ k: 'flag', stamp })
    }
}

function settle(gs) {
    if (gs.modules.every(m => m.solved)) {
        const bonus = Math.ceil(gs.fuse / 60) * 5
        gs.score += bonus + 50 * gs.modules.length
        gs.events.push({ k: 'clear', bonus })
        gs.bombsCleared += 1
        gs.clearFlash = 90
        if (gs.bombsCleared >= QUOTA_BOMBS) {
            gs.done = true; gs.won = true
        } else {
            gs.round += 1
            gs.seqInput = {}
            buildBomb(gs)
        }
    }
}

// partnerSay — the CPU manual seat prints an order into the chat rail whenever
// the defuser sits at a live module (90-tick delay so the human reads first).
function partnerSay(gs) {
    if (gs.players > 1 || gs.done) { gs.order = null; return }
    const m = gs.modules[gs.cursor.mod]
    if (!m || m.solved) { gs.order = null; return }
    if (gs.orderFor !== gs.cursor.mod) {
        gs.orderFor = gs.cursor.mod
        gs.orderTicks = gs.tick + 90
    }
    if (gs.tick < gs.orderTicks || m.locked > 0) return
    const t = computeTarget(gs, m)
    if (!t) return
    // #1909: the CPU manual orders the drain first — words carry the ORDER
    // of the rule exactly as the page prints it (pull, then the LEFT count).
    if (t.pull) gs.order = `PULL A BATTERY, THEN DIAL ${t.dial}, THEN SET`
    else if (t.wire !== undefined) gs.order = `CUT ${WIRE_COLORS[m.wires[t.wire].color]}`
    else if (t.dial !== undefined) gs.order = `DIAL TO ${t.dial}, THEN SET`
    else gs.order = `PRESS ${t.seq.map(i => GLYPHS[i]).join(', ')}`
}

// step — advance exactly one tick. pads: pad | [padDefuser, padManual?].
export function step(gs, pads) {
    if (gs.done) return gs
    gs.tick += 1
    const arr = Array.isArray(pads) ? pads : [pads || {}]
    if (gs.cursorFlash > 0) gs.cursorFlash -= 1
    if (gs.clearFlash > 0) gs.clearFlash -= 1
    if (gs.manual.flagTicks > 0) { gs.manual.flagTicks -= 1; if (!gs.manual.flagTicks) gs.manual.flag = null }
    for (const m of gs.modules) {
        if (m.locked > 0) m.locked -= 1
        if (m.flash > 0) m.flash -= 1
    }
    defuserAct(gs, arr[0] || {})
    if (gs.players > 1 && arr[1]) manualAct(gs, arr[1])
    partnerSay(gs)
    gs.fuse -= 1
    if (gs.fuse <= 0 && !gs.done) {
        gs.done = true; gs.won = false; gs.boomTick = gs.tick
        gs.events.push({ k: 'boom' })
    }
    return gs
}

// solvePad — one pad that plays the cursor's module correctly (the attract
// demo's hands and the harness's autopilot; same rules the manual prints).
export function solvePad(gs) {
    // #1909 THE DRAIN: a live rule demanding a spent battery is solved at
    // the BACK plate first — home the cursor (the tilt lives at module 1),
    // tilt, pull (the back's one verb), then the front resumes as before.
    if (gs.modules.some(x => !x.solved && ruleOf(x).pull && gs.pulls === 0 && gs.features.batteries >= 1)) {
        if (!gs.flip) return gs.cursor.mod === 0 ? { up: true } : { down: true }
        return { a: true }
    }
    if (gs.flip) return { down: true }
    const m = gs.modules[gs.cursor.mod]
    if (!m || m.solved) return { down: true }
    if (m.locked > 0) return {}
    const t = computeTarget(gs, m)
    if (!t) return {}
    const pad = {}
    if (t.wire !== undefined) {
        const d = t.wire - gs.cursor.sub
        if (d > 0) pad.right = true
        if (d < 0) pad.left = true
        if (d === 0) pad.a = true
    } else if (t.dial !== undefined) {
        if (m.dial !== t.dial) {
            const cw = (t.dial - m.dial + 10) % 10
            if (cw <= 5) pad.right = true
            else pad.left = true
        } else pad.a = true
    } else {
        const pressed = (gs.seqInput[gs.cursor.mod] || []).length
        const d = t.seq[pressed] - gs.cursor.sub
        if (d > 0) pad.right = true
        if (d < 0) pad.left = true
        if (d === 0) pad.a = true
    }
    return pad
}

// drainEvents — the shell pops transient fx cues once per tick.
export function drainEvents(gs) { return gs.events.splice(0) }

// ---- state / hash -----------------------------------------------------------
export function simState(gs) {
    return {
        tick: gs.tick,
        // #1362: recordStart() requires state().seed to be an integer (#527);
        // simState omitted it, so captures and the contract seed gate refused.
        seed: gs.seed,
        score: gs.score,
        done: gs.done,
        won: gs.won,
        round: gs.round,
        strikes: gs.strikes,
        bombs: gs.bombsCleared,
        fuse: gs.fuse,
        serial: gs.features.serial,
        leds: gs.features.leds,
        bolt: gs.features.bolt,
        batteries: gs.features.batteries, // #1797: the back-plate fact
        flipped: gs.flip,                // #1797: which side you are on
        held: gs.held,                 // #1909: battery in hand (THE DRAIN)
        pulls: gs.pulls,               // #1909: drains spent on this bomb
        cursor: { ...gs.cursor },
        modules: gs.modules.map(m => ({
            stamp: m.stamp, type: m.type, solved: m.solved, locked: m.locked > 0,
            wires: m.wires ? m.wires.map(w => [w.color, w.lit ? 1 : 0, w.cut ? 1 : 0]) : undefined,
            dial: m.dial,
        })),
        manualPage: gs.manual.page,
        // #1373: harness visibility into seat 2 — where the manual cursor is
        // and what rule its flag clipped. Additive; hash() is untouched.
        manualLine: gs.manual.line,
        flag: gs.manual.flag,
        hash: hash(gs),
    }
}

export function hash(gs) {
    const s = [
        gs.tick, gs.round, gs.score, gs.strikes, gs.bombsCleared, gs.fuse,
        gs.features.serial, gs.features.leds, gs.features.bolt, gs.features.batteries,
        gs.cursor.mod, gs.cursor.sub, gs.manual.page, gs.manual.line, gs.flip,
        gs.held, gs.pulls, // #1909: THE DRAIN is observable state (#494)
        gs.modules.map(m => `${m.stamp}${m.solved ? 1 : 0}${m.locked}${m.dial ?? -1}${m.wires ? m.wires.map(w => `${w.color}${w.lit ? 1 : 0}${w.cut ? 1 : 0}`).join('') : ''}`).join('|'),
        Object.values(gs.seqInput).map(q => q.join('')).join('.'),
    ].join(',')
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}
