// RECORDING FORMAT — `retrogames-rec/v1` (issue #495): ONE JSON file for a
// recorded multiplayer run, good enough to replay it EXACTLY and to train on.
//
//   {
//     format: 'retrogames-rec/v1',
//     build,            // git commit the capture ran on (Vite define, DEV stamp)
//     game,             // registry id ('gauntlet')
//     method,           // input method: 'dpad' | 'stick' | 'pointer' (#420)
//     seed,             // the one integer the sim resets from
//     players,          // seat count
//     ticks,            // pads per slot == ticks
//     hashEvery,        // checkpoint cadence (default 30 = 2/s)
//     slots: [ { source: { kind, modelId? },          // #494 kinds: human/cpu/model/remote/off
//                pads: [ compactPad x ticks ],         // THE one pad, one per tick
//                raw:  [ compactRaw x ticks ] } ],     // pre-dead-zone device analog
//     hashes: [ { t, h } ]                            // state.hash at t, ..., ticks
//   }
//
// Compact pads omit every false/zero field; decoding routes through normalizePad,
// so decode(encode(p)) === normalizePad(p) for any pad — the one-pad's own
// idempotence makes the round trip exact, no separate schema needed.
//
// The raw channel is what a thumb actually did BEFORE the shared dead zone and
// quantizer (onePad's rawPad holders, #495): a 0.08 nudge lives in `raw` while
// the pad idles. Digital keys/buttons are already verbatim in the pad, so raw
// carries only the analog nothing else keeps: pre-zone x/y + aim, pre-clamp
// pointer. Cpu/model seats have no device — their raw is zeros, honestly.
//
// Replay: verifyRecording drives a contract-shaped { reset, step, state } and
// compares state.hash at every checkpoint — a bad file names its divergence
// tick instead of silently diverging. Pure: Node (replaycheck) + browser
// (__game.replay). No DOM, no React.

import { METHODS, DIR_FIELDS, AIM_FIELDS, normalizePad } from './onePad.js'
import { SLOT_KINDS } from './slotSources.js'

export const REC_FORMAT = 'retrogames-rec/v1'

export const DEFAULT_HASH_EVERY = 30

const DIGITAL_FIELDS = [...DIR_FIELDS, 'a', 'b', 'start', ...AIM_FIELDS]
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)

// --- pad codec -----------------------------------------------------------------

export function encodePad(p) {
    const pad = p || {}
    const o = {}
    for (const f of DIGITAL_FIELDS) if (pad[f]) o[f] = true
    if (pad.x) o.x = pad.x
    if (pad.y) o.y = pad.y
    if (pad.ax) o.ax = pad.ax
    if (pad.ay) o.ay = pad.ay
    const pt = pad.pointer
    if (pt && (pt.down || pt.alt || pt.x || pt.y)) {
        o.pointer = { x: num(pt.x), y: num(pt.y) }
        if (pt.down) o.pointer.down = true
        if (pt.alt) o.pointer.alt = true
    }
    return o
}

export function decodePad(compact, method = 'stick') {
    return normalizePad(compact || {}, method)
}

// --- raw codec (pre-zone analog, zeros omitted) ---------------------------------

export function encodeRaw(r) {
    const raw = r || {}
    const o = {}
    if (raw.x) o.x = num(raw.x)
    if (raw.y) o.y = num(raw.y)
    if (raw.ax) o.ax = num(raw.ax)
    if (raw.ay) o.ay = num(raw.ay)
    if (raw.px) o.px = num(raw.px)
    if (raw.py) o.py = num(raw.py)
    return o
}

export function decodeRaw(compact) {
    const c = compact || {}
    return { x: num(c.x), y: num(c.y), ax: num(c.ax), ay: num(c.ay), px: num(c.px), py: num(c.py) }
}

// --- recorder ------------------------------------------------------------------
// addTick runs once per simulated tick: pads/raws are per-slot arrays (a plain
// pad is one slot), hash is the game's state.hash when one is due (or null).

export function createRecorder(opts = {}) {
    const { gameId, method = 'stick', seed, players = 1, build = 'dev', hashEvery = DEFAULT_HASH_EVERY } = opts
    if (!gameId) throw new Error('recorder: gameId required')
    if (!METHODS.includes(method)) throw new Error(`recorder: unknown method ${method}`)
    if (!Number.isInteger(seed)) throw new Error('recorder: seed must be an integer')
    if (!Number.isInteger(hashEvery) || hashEvery < 1) throw new Error('recorder: hashEvery must be a positive integer')
    const seats = Math.max(1, players | 0)
    // Sources may be a function — seat kinds live at record-STOP time (seats
    // flip while the game runs); an array is accepted for static callers.
    const sourcesOf = typeof opts.sources === 'function' ? opts.sources : () => opts.sources
    const resolveSources = () => {
        const raw = sourcesOf()
        const list = (raw && raw.length ? raw : Array.from({ length: seats }, () => ({ kind: 'model' }))).slice(0, seats)
        return list.map((s) => (typeof s === 'string' ? { kind: s } : { kind: s.kind || 'model', ...(s.modelId ? { modelId: String(s.modelId) } : {}) }))
    }

    const slots = Array.from({ length: seats }, () => ({ source: null, pads: [], raw: [] }))
    const hashes = []
    let ticks = 0

    return {
        get ticks() { return ticks },
        addTick(pads, raws = null, hash = null) {
            const list = Array.isArray(pads) ? pads : [pads]
            for (let i = 0; i < slots.length; i++) {
                slots[i].pads.push(encodePad(list[i] || {}))
                slots[i].raw.push(encodeRaw(raws && (Array.isArray(raws) ? raws[i] : null)))
            }
            ticks++
            if (hash !== null && hash !== undefined && ticks % hashEvery === 0) hashes.push({ t: ticks, h: hash })
        },
        finish(finalHash = null) {
            const srcs = resolveSources()
            if (!srcs.every((s) => SLOT_KINDS.includes(s.kind))) throw new Error('recorder: unknown source kind')
            slots.forEach((s, i) => { s.source = srcs[i] })
            const rec = {
                format: REC_FORMAT,
                build,
                game: gameId,
                method,
                seed,
                players: seats,
                ticks,
                hashEvery,
                slots,
                hashes,
            }
            if (finalHash !== null && finalHash !== undefined && (hashes.length === 0 || hashes[hashes.length - 1].t !== ticks) && ticks > 0) {
                hashes.push({ t: ticks, h: finalHash })
            }
            return rec
        },
    }
}

// --- validation ----------------------------------------------------------------
// Returns an error string, or null when the file is structurally sound.

export function validate(rec) {
    if (!rec || typeof rec !== 'object') return 'not an object'
    if (rec.format !== REC_FORMAT) return `bad format tag: ${JSON.stringify(rec.format)}`
    if (typeof rec.game !== 'string' || !rec.game) return 'missing game id'
    if (!METHODS.includes(rec.method)) return `bad method: ${JSON.stringify(rec.method)}`
    if (!Number.isInteger(rec.seed)) return 'seed must be an integer'
    if (!Number.isInteger(rec.players) || rec.players < 1 || rec.players > 4) return 'players must be 1..4'
    if (!Number.isInteger(rec.ticks) || rec.ticks < 0) return 'ticks must be a non-negative integer'
    if (!Number.isInteger(rec.hashEvery) || rec.hashEvery < 1) return 'hashEvery must be a positive integer'
    if (!Array.isArray(rec.slots) || rec.slots.length !== rec.players) return 'slots must match players'
    for (const s of rec.slots) {
        if (!s.source || !SLOT_KINDS.includes(s.source.kind)) return `bad source kind: ${JSON.stringify(s.source && s.source.kind)}`
        if (!Array.isArray(s.pads) || s.pads.length !== rec.ticks) return `slot ${s.source.kind}: pads must hold one pad per tick`
        if (!Array.isArray(s.raw) || s.raw.length !== rec.ticks) return `slot ${s.source.kind}: raw must hold one entry per tick`
    }
    if (!Array.isArray(rec.hashes)) return 'hashes must be an array'
    let last = 0
    for (const x of rec.hashes) {
        if (!x || !Number.isInteger(x.t) || x.t < 1 || x.t > rec.ticks || x.t <= last) return 'hash checkpoints must increase within ticks'
        if (!Number.isFinite(x.h) && typeof x.h !== 'string') return 'hash values must be numbers or strings'
        last = x.t
    }
    if (rec.ticks > 0 && rec.hashes.length > 0 && rec.hashes[rec.hashes.length - 1].t !== rec.ticks) return 'final checkpoint must be at the last tick'
    return null
}

// --- replay --------------------------------------------------------------------
// driver is contract-shaped: reset(seed, players), step(pads) advances EXACTLY
// one tick with one pad per slot, state() carries { tick, hash }.

export function verifyRecording(rec, driver) {
    const bad = validate(rec)
    if (bad) return { ok: false, ticks: 0, mismatch: null, error: bad }
    driver.reset(rec.seed, rec.players)
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    let mismatch = null
    let t = 0
    for (; t < rec.ticks && !mismatch; t++) {
        driver.step(rec.slots.map((s) => decodePad(s.pads[t], rec.method)))
        const t1 = t + 1
        if (want.has(t1)) {
            const got = driver.state().hash
            if (got !== want.get(t1)) mismatch = { tick: t1, want: want.get(t1), got }
        }
    }
    const state = driver.state()
    const finalWanted = rec.hashes.length ? rec.hashes[rec.hashes.length - 1].h : null
    const ok = !mismatch && state.tick === rec.ticks && (finalWanted === null || finalWanted === state.hash)
    return { ok, ticks: t, mismatch, error: null, state }
}
