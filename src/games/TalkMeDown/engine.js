// TALK ME DOWN — deterministic split-info bomb puzzle (#1252).
//
// Pure module: Node + browser, no DOM, no React. All randomness comes from the
// seed (mulberry32). Seed + per-seat pad streams ⇒ identical hashes (#494).
//
// THE SPLIT: seat 1 (DEFUSER) sees the bomb panel — serial, LED bar, bolt,
// modules stamped N3/D1/G2 — but owns NO rules. Seat 2 (MANUAL) owns the
// rulebook whose entries answer those stamps but cannot see the bomb. The only
// channel between human seats is speech (the couch, or the mic, voice.js).
//
// MODULES (tiny strict verbs so a trained model can take either seat):
//   NEON  — cut exactly ONE colored wire   (arrows pick, A cuts)
//   DIAL  — turn a 0-9 dial, press SET   (arrows turn, A = SET)
//   GLYPH — press THREE symbols in order  (arrows pick, A presses)
// Every rule is a pure function of features the DEFUSER can see and read
// aloud: serial digit, LED count, bolt color, wire colors/lit states.
//
// STRIKES: a wrong verb sparks — module locks 3 s, -5 s off the fuse, one of
// three breakers trips. Three breakers or a zero fuse and the block glows.
//
// ROUNDS: short bombs, rising pressure — round r carries min(1+(r>>1), 4)
// modules on max(30, 70-5r) seconds, deeper rule variants unlocking as the
// squad chief likes you. Five bombs cleared = SQUAD CHIEF stamp.

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
            id: 'N6', text: 'SERIAL digit picks a color (footer). Cut that color DARK; none dark? Cut it LIT.',
            target: (f, m) => {
                const c = f.serialDigit % 6
                const dark = m.wires.findIndex(w => w.color === c && !w.lit && !w.cut)
                if (dark >= 0) return dark
                return m.wires.findIndex(w => w.color === c && !w.cut)
            },
        },
    ],
    D: [
        { id: 'D1', text: 'Set the dial to the SERIAL\'s last digit. Then SET.', target: f => f.serialDigit },
        { id: 'D2', text: 'Set the dial to the number of lit LEDs. Then SET.', target: f => f.leds },
        {
            id: 'D3', text: 'Double the SERIAL digit, keep the units. Set that. Then SET.',
            target: f => (f.serialDigit * 2) % 10,
        },
        {
            id: 'D4', text: 'Another module has wires? Set that wire count. If not, lit LEDs + 3, units. Then SET.',
            target: (f, m, all) => {
                const neon = all && all.find(x => x !== m && x.type === 'N' && !x.solved)
                if (neon) return neon.wires.length
                return (f.leds + 3) % 10
            },
        },
    ],
    G: [
        { id: 'G1', text: 'Press STAR, then BOLT, then MOON.', target: () => [0, 4, 5] },
        {
            id: 'G2', text: 'Press MOON, then the SERIAL digit\'s glyph, then the LED count\'s glyph (footer).',
            target: f => [5, f.serialDigit % 6, f.leds % 6],
        },
        { id: 'G3', text: 'Press DIAMOND, then CLUB, then SPADE.', target: () => [1, 2, 3] },
        {
            id: 'G4', text: 'LED count\'s glyph, SERIAL digit\'s glyph, then LED count again (footer).',
            target: f => [f.leds % 6, f.serialDigit % 6, f.leds % 6],
        },
    ],
}

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
        const n = r.target(gs.features, m, gs.modules)
        return Number.isInteger(n) && n >= 0 && n <= 9 ? { dial: n } : null
    }
    const seq = r.target(gs.features, m, gs.modules)
    return Array.isArray(seq) && seq.length === 3 ? { seq: seq.slice() } : null
}

// ---- bomb generation --------------------------------------------------------
function fuseFor(round) { return Math.max(30, 70 - round * 5) }
function moduleCountFor(round) { return Math.min(1 + (round >> 1), 4) }
export function variantPool(type, round) {
    const all = RULEBOOK[type]
    // round 1-2: gentle shallow rules; deeper variants unlock round by round.
    const open = { N: [1, 2, 5, 3, 4, 6], D: [1, 2, 3, 4], G: [1, 3, 2, 4] }[type]
    const depth = Math.min(all.length, 2 + Math.ceil(round / 2))
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
        const n = r.target(features, m, all)
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
            if (t && m.dial === t.dial) {
                m.solved = true; m.flash = 30
                gs.score += 100 + gs.round * 20
                gs.events.push({ k: 'safe' })
                settle(gs)
            } else spark(gs, m, 'dial off')
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
    if (t.wire !== undefined) gs.order = `CUT ${WIRE_COLORS[m.wires[t.wire].color]}`
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
        cursor: { ...gs.cursor },
        modules: gs.modules.map(m => ({
            stamp: m.stamp, type: m.type, solved: m.solved, locked: m.locked > 0,
            wires: m.wires ? m.wires.map(w => [w.color, w.lit ? 1 : 0, w.cut ? 1 : 0]) : undefined,
            dial: m.dial,
        })),
        manualPage: gs.manual.page,
        hash: hash(gs),
    }
}

export function hash(gs) {
    const s = [
        gs.tick, gs.round, gs.score, gs.strikes, gs.bombsCleared, gs.fuse,
        gs.features.serial, gs.features.leds, gs.features.bolt,
        gs.cursor.mod, gs.cursor.sub, gs.manual.page, gs.manual.line,
        gs.modules.map(m => `${m.stamp}${m.solved ? 1 : 0}${m.locked}${m.dial ?? -1}${m.wires ? m.wires.map(w => `${w.color}${w.lit ? 1 : 0}${w.cut ? 1 : 0}`).join('') : ''}`).join('|'),
        Object.values(gs.seqInput).map(q => q.join('')).join('.'),
    ].join(',')
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}
