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

import { normalizePad, rawPad } from './onePad.js'
import { createRecorder, verifyRecording, DEFAULT_HASH_EVERY } from './recording.js'
import { createVoiceSession } from './voiceCapture.js'

let loopLock = false
let exposed = null
let recorder = null
let lastPlayers = 1
let liveFeed = null
// #1711 S2: the armed spec — the loop-facing capture plumbing (liveFeed/
// liveCmdFeed) is production-safe by design: it banks only while a recorder
// runs, and autoStart is consent-gated upstream (autoRecord.js). `armed` is
// what makes auto-capture possible outside the DEV contract.
let armed = null
// #1247: while a recorder runs, the local mic banks a raw voice track aligned
// to the recorded ticks. `voiceExtra` lets a game contribute already-assembled
// tracks (Gauntlet online: guest audio relayed in). Flush promise parked at
// window.__voiceFlush so a download can await the mic's final chunk.
let voice = null
let voiceExtra = null
// #1249: while a recorder runs, recognized spoken calls bank into the file's
// `voiceCmd` channel ({ t, said, intent, ok } — words → meaning → consented
// intent; what the seat DID is already slots[seat].pads on the same clock).
// Metadata like the ping trace: replay ignores it, v1 files stay valid.
let liveCmdFeed = null

export const contractHoldsLoop = () => loopLock

// #527 item 1 — live-session capture. A human (or the attract demo) plays at
// rAF speed through the game's OWN loop, which never calls step(), so the
// recorder (fed only inside step) would bank nothing. Each wired game's loop
// calls recordLiveTick(thePad) once per simulated play tick; the active
// recorder banks it exactly the way step() would — same pad codec, same raw
// device view, same hash cadence — so a live capture replays hash-equal.
export const recordLiveTick = (pads) => { if (liveFeed) liveFeed(pads) }
export const isRecording = () => !!recorder
// #1249: one recognized spoken call, banked when it happens. Entry shape
// { t, said, intent|null, ok, dir?, why? } — see recording.js `voiceCmd`.
export const recordVoiceCmd = (entry) => { if (liveCmdFeed && entry) liveCmdFeed(entry) }

// `spec.method` is the game's input method ('dpad' | 'stick' | 'pointer', #420)
// and `spec.reads` the one-pad fields it actually consumes. Both surface on
// __game.meta so the harness and a remapper know what the game hears. `step`
// folds whatever a caller passes into THE one pad for that method, so a dpad
// game's step({x: 1}) reads as "right" exactly the way the on-screen d-pad does.
// armLiveCapture(spec) — #1711 S2: hoisted out of exposeGame so the live
// bank exists in PRODUCTION builds too (games call it next to exposeGame;
// exposeGame calls it itself, byte-identical wiring). Production safety is
// structural: liveFeed banks only while `recorder` is non-null, and the only
// production path to a recorder is autoStart, which only autoRecord.js calls
// after stored consent says motion is granted.
export function armLiveCapture(spec) {
    if (!spec || !spec.id || typeof spec.state !== 'function') return false
    const method = spec.method || 'stick'
    const BUILD = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
    const seatCount = spec.players && spec.players > 1 ? spec.players : 1
    const rnum = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
    const rawsFor = (pads) => Array.from({ length: seatCount }, (_, i) => {
        const r = rawPad(i + 1)
        if (r.x || r.y || r.ax || r.ay || r.px || r.py) return r
        // A contract-driven seat has no live device: mirror the analog its
        // stream asked for (pre-clamp x/y, aim, pointer) so a harness record
        // still carries a raw channel; idle seats stay zeros.
        const p = pads[i] || {}
        const pt = p.pointer || {}
        return { x: rnum(p.x), y: rnum(p.y), ax: rnum(p.ax), ay: rnum(p.ay), px: rnum(pt.x), py: rnum(pt.y) }
    })
    const hashNow = () => {
        const st = spec.state()
        return typeof st.hash === 'number' || typeof st.hash === 'string' ? st.hash : null
    }
    // #919: while a link-pad room is live, sample each seat's measured RTT so
    // the recording carries a per-seat ping trace (metadata; replay ignores it).
    const pingsNow = () => {
        const lp = typeof window !== 'undefined' ? window.__padlink : null
        const list = lp && lp.pads
        if (!list || !list.length) return null
        const out = new Array(seatCount).fill(0)
        for (const p of list) {
            const i = (p.seat | 0) - 1
            if (i >= 0 && i < seatCount && p.rtt > 0) out[i] = p.rtt
        }
        return out
    }
    // The loop-facing live bank (recordLiveTick): one addTick per rAF play
    // tick, mirroring the step() bank byte-for-byte so a live capture is the
    // same file the harness would record. rawsFor reads the live device; a
    // keyboard/dpad seat has no analog device so its raw mirrors the pad.
    liveFeed = (pads) => { if (recorder) { recorder.addTick(pads, rawsFor(pads), hashNow(), pingsNow()); if (voice) voice.onTick(recorder.ticks) } }
    liveCmdFeed = (e) => { if (recorder) recorder.addVoiceCmd(e) }
    armed = { spec, method, BUILD, seatCount, rawsFor, hashNow, pingsNow }
    return true
}

// autoStart(opts) — #1711 S2 production capture for a human run, mirroring
// recordStart's seed/rules. opts.voiceConsent: the #1711 voice grant already
// recorded by the consent gate — the mic layer takes it without re-asking
// (the browser permission bubble still applies). opts.sources overrides the
// seat labels for games whose armed spec lies about a human seat.
export function autoStart(opts = {}) {
    if (!armed || recorder) return false
    const { spec, method, BUILD } = armed
    const s = spec.state()
    if (!Number.isInteger(s.seed)) return false
    const players = spec.players && spec.players > 1 ? spec.players : 1
    // #2058: seat 0 of an AUTO-captured run is a human, by construction —
    // autoRecord.beginRun only fires at human-start sites after a stored
    // motion grant (the harness drives the DEV contract, never this path).
    // Game specs stamp seat 0 `model` because that is TRUE for contract
    // steps; on a phone that seat is the thumb, and `model` there poisoned
    // every training label (humanSeats 0 on Jon's iPhone takes). Override
    // at the origin; other seats keep whatever the game reports. A game
    // whose LOCAL player may sit elsewhere (Rally's watch seat) opts out
    // with humanSeats:false and labels honestly itself.
    const srcs = opts.sources || spec.sources || null
    const stamp = opts.humanSeats !== false
    const localHuman = (raw) => {
        const arr = (Array.isArray(raw) ? [...raw] : []).slice(0, players)
        while (arr.length < players) arr.push({ kind: 'model' }) // recorder default, unchanged
        if (stamp) arr[0] = { kind: 'human' }
        return arr
    }
    const sourcesOut = srcs
        ? (typeof srcs === 'function' ? () => localHuman(srcs()) : localHuman(srcs))
        : (stamp ? () => localHuman(null) : null)
    recorder = createRecorder({
        gameId: spec.id,
        method,
        seed: s.seed,
        players,
        build: spec.build || BUILD,
        hashEvery: opts.hashEvery || DEFAULT_HASH_EVERY,
        sources: sourcesOut,
        // #1711 S3: rule knobs the seed doesn't fix (Rally weather...); the
        // spec may hold an object or a live getter — resolved at recorder birth.
        rules: spec.rules || null,
    })
    voiceExtra = typeof spec.voiceExtra === 'function' ? spec.voiceExtra : null
    voice = null
    if (spec.voice !== false && opts.voiceConsent) {
        const vslots = spec.voice && Array.isArray(spec.voice.slots) ? spec.voice.slots : Array.from({ length: players }, (_, i) => i)
        voice = createVoiceSession({ slots: vslots, ask: () => Promise.resolve({ consent: true, headset: false }) })
    }
    if (typeof window !== 'undefined') window.__autoCapture = { recording: true, seed: s.seed, players, voice: !!voice }
    return true
}

// autoStop() — mirror of recordStop for the auto path; returns { rec, flush }
// where flush resolves once the mic's final chunk has joined the file (the
// uploader awaits it, bounded).
export function autoStop() {
    if (!armed || !recorder) return null
    const s = armed.spec.state()
    const extra = (voiceExtra ? voiceExtra() : null) || { tracks: [], declined: [] }
    const local = voice
    const localSlots = local ? local.slots : []
    voice = null
    voiceExtra = null
    const wantVoice = !!local || (extra.tracks && extra.tracks.length > 0) || (extra.declined && extra.declined.length > 0)
    const voiceSec = wantVoice ? { tracks: [...(extra.tracks || [])], declined: [...(extra.declined || [])] } : null
    const rec = recorder.finish(typeof s.hash === 'number' || typeof s.hash === 'string' ? s.hash : null, voiceSec)
    recorder = null
    if (typeof window !== 'undefined') window.__lastRecording = rec
    let flush = null
    if (local) {
        flush = local.finalize().then((track) => {
            if (track) {
                rec.voice.tracks.push(track)
                rec.voice.tracks.sort((a, b) => a.slots[0] - b.slots[0])
            } else if (local.consent.consent === false && local.consent.reason === 'declined') {
                for (const sl of localSlots) if (!rec.voice.declined.includes(sl)) rec.voice.declined.push(sl)
            }
            return rec
        })
    }
    if (typeof window !== 'undefined') window.__autoCapture = { recording: false, ticks: rec.ticks, voice: wantVoice }
    return { rec, flush }
}

export function exposeGame(spec) {
    if (!import.meta.env.DEV) return null
    armLiveCapture(spec)
    const { method, BUILD, seatCount, rawsFor, hashNow, pingsNow } = armed
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
        // #1793: `rec` (from replay()) rides through to spec.reset so a game
        // can rebuild the seats the take actually had (seat `off` = nobody
        // there); specs that ignore the third arg replay as before.
        reset: (seed = 0, players = 1, rec = null) => {
            lastPlayers = Math.max(1, Math.min(4, players | 0 || 1))
            spec.reset(seed, lastPlayers, rec)
            return api.state()
        },
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
                if (recorder) { recorder.addTick(ones, rawsFor(ones), hashNow(), pingsNow()); if (voice) voice.onTick(recorder.ticks) }
            } else {
                const one = normalizePad(pad || {}, method)
                const len = n > 0 ? Math.ceil(n) : 0
                for (let i = 0; i < len; i++) spec.tick(one, [one])
                if (recorder) {
                    const h = len > 0 ? hashNow() : null
                    const raws = len > 0 ? rawsFor([one]) : null
                    const pings = len > 0 ? pingsNow() : null
                    for (let i = 0; i < len; i++) {
                        recorder.addTick([one], raws, i === len - 1 ? h : null, pings)
                        if (voice) voice.onTick(recorder.ticks)
                    }
                }
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
                sources: spec.sources || null,
            })
            // #1247 local voice. Only a REAL interaction opens the consent
            // prompt (navigator.userActivation): scripted harness captures
            // never see an overlay and keep producing plain v1 files. A game
            // opts out with spec.voice === false; spec.voice.slots narrows
            // which seats this device's mic covers (Gauntlet online: [0]).
            voiceExtra = typeof spec.voiceExtra === 'function' ? spec.voiceExtra : null
            voice = null
            const activationOk = typeof navigator === 'undefined' || !navigator.userActivation || navigator.userActivation.isActive !== false
            if (spec.voice !== false && activationOk) {
                const vslots = spec.voice && Array.isArray(spec.voice.slots) ? spec.voice.slots : Array.from({ length: seatCount }, (_, i) => i)
                voice = createVoiceSession({ slots: vslots })
            }
            return { recording: true, seed: s.seed, players: spec.players && spec.players > 1 ? spec.players : 1, hashEvery }
        },
        recordStop: () => {
            if (!recorder) return null
            const s = spec.state()
            const extra = (voiceExtra ? voiceExtra() : null) || { tracks: [], declined: [] }
            const local = voice
            const localSlots = local ? local.slots : []
            voice = null
            voiceExtra = null
            // A voice section (even empty) marks the file v2; consent-pending
            // or unsupported runs simply end up with no tracks. No voice
            // attempted at all (harness, spec.voice:false) -> stays v1.
            const wantVoice = !!local || (extra.tracks && extra.tracks.length > 0) || (extra.declined && extra.declined.length > 0)
            const voiceSec = wantVoice ? { tracks: [...(extra.tracks || [])], declined: [...(extra.declined || [])] } : null
            const rec = recorder.finish(typeof s.hash === 'number' || typeof s.hash === 'string' ? s.hash : null, voiceSec)
            recorder = null
            window.__lastRecording = rec
            if (local) {
                // The mic flushes its last chunk asynchronously; the download
                // button awaits this promise before serialising the file.
                window.__voiceFlush = local.finalize().then((track) => {
                    if (track) {
                        rec.voice.tracks.push(track)
                        rec.voice.tracks.sort((a, b) => a.slots[0] - b.slots[0])
                    } else if (local.consent.consent === false && local.consent.reason === 'declined') {
                        for (const sl of localSlots) if (!rec.voice.declined.includes(sl)) rec.voice.declined.push(sl)
                    }
                    return rec
                })
            }
            return rec
        },
        isRecording: () => !!recorder,
        replay: (rec) => verifyRecording(rec, {
            reset: (seed, players, rec2) => { api.reset(seed, players, rec2) }, // #1793: rec rides to reset so seat-`off` replays without ghosts
            step: (pads) => { api.step(pads) },
            state: () => api.state(),
        }),
        state: () => {
            const s = spec.state()
            return { tick: 0, score: 0, done: false, players: lastPlayers, ...s }
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
    liveFeed = null
    liveCmdFeed = null
    voice = null
    voiceExtra = null
    armed = null // #1711: a dead mount must not leave an armed capture behind
    if (exposed && window.__game === exposed) delete window.__game
    exposed = null
}

// #1200 — production-safe FEEDBACK state hook. The __game contract above is
// DEV-only, but the in-game feedback button files reports from jalfern.com
// (Jon's phone = production) and needs the game's live state to replay them:
// captureState() reads window.__feedbackInfo when __game is absent. Games
// register their own state() — the same source the contract uses — in EVERY
// build, outside the DEV gate. A broken state() must never take the game down,
// so the getter is try/caught and window-guarded.
export function exposeFeedbackState(stateFn) {
    if (typeof window === 'undefined' || typeof stateFn !== 'function') return
    window.__feedbackInfo = () => {
        try {
            const s = stateFn()
            return s && typeof s === 'object' ? s : null
        } catch { return null }
    }
}

export function unexposeFeedbackState() {
    if (typeof window !== 'undefined') delete window.__feedbackInfo
}

// #737 — seed pinning for feedback replays. A filed report carries its seed
// (via __feedbackInfo), and scripts/feedbackreplay.mjs drives the live game at
// `<route>?seed=N`. A game that only reports the seed but ignores it cannot be
// replayed: the pin helper gives every seed-reporting game the other half of
// the contract. Returns the integer seed or null — null means "keep your own
// RNG". Production-safe by design: seeding procedural content from the URL is
// exactly what the harness already does with ?lite=1; there is no score to
// cheat here. Games use it at their human-start site:
//   makeGame(seedFromQuery() ?? randomSeed(), ...)
export function seedFromQuery(search = (typeof window !== 'undefined' ? window.location.search : '')) {
    let v = null
    try { v = new URLSearchParams(search).get('seed') } catch { return null }
    if (v == null) return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : null
}

// #1473 seed-param helper: the RNG half of the contract. mulberry32 — 32-bit,
// one integer in, deterministic [0,1) stream out. Paired with seedFromQuery it
// gives engine seed-param ports one import for both halves:
//   const rand = seedRng(seedFromQuery() ?? Math.floor(Math.random() * 1e6))
// so gameplay randomness (not just decor) replays from the reported seed.
export function seedRng(seed) {
    let s = seed | 0
    return () => {
        s = (s + 0x6D2B79F5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
