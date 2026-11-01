// SHORT ORDER SHOUT VOICE (#1416 gap 1) — push-to-talk over the room wire.
//
// Framing reuses the #1247 banked-voice shapes (src/utils/voice.js): the relay
// forwards `pad` only, so voice rides that type as a k:'v' subkind — sig-style,
// no relay redeploy. Lockstep is untouched by construction: net.js gotPad()
// reads only numeric-k messages, so a voice frame is invisible to the pad
// streams, the sampling law and the hashes (soslinkcheck proves a full shift
// with voice riding through the middle of it).
//
// Unlike the #1247 recorder (guest -> host, seats 1..3, whole-session banked
// audio), this is LIVE talk in every direction: any seat's utterance reaches
// every other box, so the host's mic is on the wire too. Delivery semantics are
// walkie-talkie: hold V, talk, release — the recorder hands over ONE complete
// webm/opus blob, it chunks onto the wire under a rate budget, and a receiving
// box plays it when whole. Half-duplex: while your message is draining you are
// not talking, one utterance on the wire at a time.
//
// Pure: no DOM, no mic (those live in index.jsx, thin). `now` is injectable so
// scripts/soslinkcheck.mjs proves it all in plain Node.

import { VOICE_MSG, VOICE_CHUNK } from '../../utils/voice.js'

// Budgets (measured against relay/core.js guards: 512B messages, 240 msg/s):
// a 440-char chunk envelope costs ~70B + RTT decoration c/a ~45B => ~555? No —
// the decoration is the same fields audio messages already pin: voice frames do
// NOT get c/a (decorate only stamps payloads without k... it does not check),
// so keep the payload under the #1247-proven 440 and let rtt pass through:
// {t,s,k,m,i,z,x} ~ 64 + 440 = ~504B worst case. soslinkcheck pins the max.
export const PTT_MAX_B64 = 32000 // ~8 s of opus @24kbps in base64; longer presses CUT
export const PTT_MIN_B64 = 220   // under ~0.05 s the take is a click — honest silence
export const PTT_RATE = 14       // msgs/s per member: 75-chunk max drains in ~5.4 s,
                                 // four talkers = ~56/s + pads ~93/s stays under 240/s.

export function createRateBudget(opts = {}) {
    const maxPerSec = opts.maxPerSec || PTT_RATE
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    let win = 0, count = 0, dropped = 0
    return {
        take() {
            const t = now()
            if (t - win >= 1000) { win = t; count = 0 }
            if (count >= maxPerSec) { dropped++; return false }
            count++
            return true
        },
        reset() { win = 0; count = 0; },
        stats: () => ({ dropped }),
    }
}

// createPttSender: the press machine. The component starts/stops the recorder
// and hands release() the finished blob's base64; drain() spreads it over the
// wire inside the rate budget (called from the sim loop, one send per take).
export function createPttSender(opts = {}) {
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    const budget = opts.budget || createRateBudget({ now })
    let holding = false, cutFlag = false, sent = 0, startedMs = 0
    let queued = []
    return {
        get holding() { return holding },
        get pending() { return queued.length },
        get cut() { return cutFlag },
        get sentMsgs() { return sent },
        // press V: start an utterance. false while one is held or still
        // draining — a walkie-talkie has one message on the wire at a time.
        press() {
            if (holding || queued.length) return false
            holding = true; cutFlag = false; startedMs = now()
            return true
        },
        // release V with the whole-utterance base64. Returns the message count
        // queued (0 when the take was too short to be a word — dropped whole).
        release(b64, meta) {
            holding = false
            const text = typeof b64 === 'string' ? b64 : ''
            if (text.length < PTT_MIN_B64) { queued = []; return 0 }
            cutFlag = text.length > PTT_MAX_B64
            const body = cutFlag ? text.slice(0, PTT_MAX_B64) : text
            queued = [{ k: 'v', m: VOICE_MSG.INTRO, x: JSON.stringify({ mime: (meta && meta.mime) || 'audio/webm;codecs=opus', headset: !!(meta && meta.headset) }) }]
            const n = Math.max(1, Math.ceil(body.length / VOICE_CHUNK))
            for (let i = 0; i < n; i++) {
                queued.push({ k: 'v', m: VOICE_MSG.AUDIO, i, z: n, x: body.slice(i * VOICE_CHUNK, (i + 1) * VOICE_CHUNK) })
            }
            queued.push({ k: 'v', m: VOICE_MSG.END, a: Math.max(1, Math.round(now() - startedMs)) })
            return queued.length
        },
        drain(send) {
            let n = 0
            while (queued.length && budget.take()) { send(queued.shift()); n++; sent++ }
            return n
        },
        reset() { holding = false; queued = []; cutFlag = false; budget.reset() },
    }
}

// createPttInbox: any-slot reassembler. feed(msg) swallows k:'v' frames and
// fires onUtterance({ slot, mime, ms, b64 }) the moment one is WHOLE. A torn
// take (END without every part) counts as lost, never half-played; a fresh
// INTRO from the same slot supersedes whatever was in flight.
export function createPttInbox(opts = {}) {
    const onUtterance = typeof opts.onUtterance === 'function' ? opts.onUtterance : () => {}
    const pending = new Map() // slot -> { meta, parts, z }
    let lost = 0, heard = 0
    return {
        feed(msg) {
            if (!msg || msg.k !== 'v' || typeof msg.s !== 'number') return null
            const slot = msg.s | 0
            if (msg.m === VOICE_MSG.INTRO) {
                let meta = null
                try { meta = JSON.parse(msg.x) } catch { return null }
                if (!meta || typeof meta.mime !== 'string') return null
                pending.set(slot, { meta, parts: [], z: 0 }) // supersedes a torn take
                return null
            }
            const p = pending.get(slot)
            if (!p) return null // audio/end before an intro — not our conversation
            if (msg.m === VOICE_MSG.AUDIO) {
                if (!Number.isInteger(msg.i) || msg.i < 0 || !Number.isInteger(msg.z) || msg.z < 1 || typeof msg.x !== 'string') return null
                p.z = msg.z
                p.parts[msg.i] = msg.x
                return null
            }
            if (msg.m === VOICE_MSG.END) {
                pending.delete(slot)
                const have = p.parts.filter((c) => typeof c === 'string').length
                if (!(p.z > 0) || have < p.z) { lost++; return null }
                const utter = { slot, mime: p.meta.mime, ms: Math.max(0, Math.round(msg.a || 0)), b64: p.parts.slice(0, p.z).join('') }
                heard++
                onUtterance(utter)
                return utter
            }
            return null
        },
        // a departed/demoted seat's half-take is dead — never play it later.
        drop(slot) { pending.delete(slot | 0) },
        reset() { pending.clear(); lost = 0; heard = 0 },
        get inflight() { return pending.size },
        get lostUtterances() { return lost },
        get heardUtterances() { return heard },
    }
}
