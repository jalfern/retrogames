// LINK PADS (#893) — iPhone as controller for games on another screen.
//
// AirConsole-style: the game (host: iPad/Mac) opens a 4-letter room over the
// same relay the online modes use; phones open /retrogames/pad, join by code,
// and each phone takes the NEXT PLAYER SLOT — the same generic slot as
// CPU/model/remote players (#494). Nothing game-side changes: a phone's pad
// lands in onePad slot N through the same writers a physical gamepad uses
// (seat 1 additionally dispatches keyboard events, exactly like gamepad #1 in
// GamepadBridge), so Gauntlet's slot-2 A-claim and SSX's analog read work
// untouched.
//
// Transport: direct phone<->host WebRTC data channels (unordered, no
// retransmits — a lost pad packet is worthless, the next one is 8ms away),
// signaled THROUGH the relay room inside the already-forwarded 'pad' message
// type (no relay redeploy; the allowlist never sees a new type). WebRTC is
// attempted ~1.5s after a pad joins; until (or unless) it opens, pad state
// rides the relay WS at the slower fallback rate — the relay's room rate
// window is 240/s, so N pads must stream slower there. The pad shows which
// path is live plus a ping readout: every packet carries the phone's clock;
// the host echoes the newest stamp every ~500ms; RTT = now - echoed stamp.
//
// Seat policy: relay seat 0 is the host (it opens the room first with a fresh
// code). Phone seat N -> onePad slot N (1..3). A phone that lands on seat 0
// means no host is there (joining a dead code creates the room) — the pad
// refuses, closes and re-checks until a real host takes seat 0.
//
// Pure: the whole protocol runs on injected `makeTransport(url)` (the room.js
// contract) + `makePeer()` (anything shaped like {onOpen,onMessage,onSend,
// close,send}) so scripts/padlinkcheck.mjs proves it in plain Node with
// in-memory pipes. The DOM/WebSocket/RTCPeerConnection wiring lives in
// components/LinkPads.jsx (host) and pages/PadLink.jsx (phone).

import { createRoom, decodeCode } from './room.js'
import { pressSlot, releaseSlot, setStickVecSlot, setAimVecSlot, clearSlot } from './onePad.js'

export const LINK_CAP = 4                     // 1 host + 3 phones
export const PAD_HZ_DIRECT = 120             // full pad state on the direct link
export const PAD_HZ_RELAY = 50              // fallback rate inside the relay window
export const STALE_MS = 1000               // a silent pad releases its keys
export const PING_EVERY_MS = 500           // host echo cadence
export const RTC_WAIT_MS = 4000            // give ICE this long before settling on relay
export const PACKET_Q = 100                // analog quantisation (1/100th of full)

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// digital pad fields -> bit mask, tiny wire form.
const BIT = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32, start: 64, boost: 128 }
const BIT_FIELDS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'boost']
const SHOULDER_L = 1
const SHOULDER_R = 2

const q = (v) => {
    const n = Math.round((typeof v === 'number' && isFinite(v) ? v : 0) * PACKET_Q)
    return n > PACKET_Q ? PACKET_Q : n < -PACKET_Q ? -PACKET_Q : n
}
const unq = (v) => (typeof v === 'number' && isFinite(v) ? v / PACKET_Q : 0)
const clampSeat = (v) => (typeof v === 'number' && v >= 1 && v < LINK_CAP ? v | 0 : 0)

// One pad-state packet, ~40 bytes JSON. s = seat, c = phone clock stamp (the
// RTT pair), q = digital mask, x/y = raw pre-zone stick, u/v = aim,
// sl = shoulder bits, r = phone's last measured RTT (echoed up for the host's
// ping log; omitted until the first echo).
export function encodePadPacket(seat, pad, raw, shoulder, rtt, seq, clock) {
    const p = pad || {}
    const rw = raw || {}
    let m = 0
    for (const f of BIT_FIELDS) if (p[f]) m |= BIT[f]
    let sl = 0
    if (shoulder && shoulder.l) sl |= SHOULDER_L
    if (shoulder && shoulder.r) sl |= SHOULDER_R
    const pkt = { t: 'pad', k: 'pad', s: seat, n: seq, c: clock, q: m }
    const x = q(rw.x), y = q(rw.y), u = q(rw.ax), v = q(rw.ay)
    if (x) pkt.x = x
    if (y) pkt.y = y
    if (u) pkt.u = u
    if (v) pkt.v = v
    if (sl) pkt.sl = sl
    if (rtt > 0) pkt.r = Math.min(9999, Math.round(rtt))
    return pkt
}

// Wire -> plain fields (floats + booleans). Unknown/malformed -> null.
export function decodePadPacket(pkt) {
    if (!pkt || pkt.t !== 'pad' || pkt.k !== 'pad' || !clampSeat(pkt.s)) return null
    const m = pkt.q | 0
    const sl = pkt.sl | 0
    return {
        seat: pkt.s,
        seq: pkt.n | 0,
        clock: pkt.c,
        rtt: pkt.r || 0,
        up: !!(m & BIT.up), down: !!(m & BIT.down), left: !!(m & BIT.left), right: !!(m & BIT.right),
        a: !!(m & BIT.a), b: !!(m & BIT.b), start: !!(m & BIT.start), boost: !!(m & BIT.boost),
        x: unq(pkt.x), y: unq(pkt.y), ax: unq(pkt.u), ay: unq(pkt.v),
        shoulderL: !!(sl & SHOULDER_L), shoulderR: !!(sl & SHOULDER_R),
    }
}

// Signaling payloads (SDP) routinely exceed the relay's 512-byte budget, so
// sig messages are sliced into <=380-char fragments reassembled by the peer.
const SIG_CHUNK = 380

export function packSig(to, m, data) {
    const str = JSON.stringify(data)
    const out = []
    for (let i = 0, n = Math.max(1, Math.ceil(str.length / SIG_CHUNK)); i < n; i++) {
        out.push({ t: 'pad', k: 'sig', d: to, m, i, z: n, p: str.slice(i * SIG_CHUNK, (i + 1) * SIG_CHUNK) })
    }
    return out
}

// Receiver-side fragment buffer factory.
export function makeSigInbox() {
    const parts = new Map()
    return {
        // returns the parsed payload when the last fragment completes a message,
        // null while still collecting (or on garbage).
        push(msg) {
            if (!msg || msg.k !== 'sig' || typeof msg.p !== 'string') return null
            const key = `${msg.s || 0}:${msg.m}:${msg.d || 0}`
            let buf = parts.get(key)
            if (!buf) { buf = []; parts.set(key, buf) }
            buf[msg.i | 0] = msg.p
            const n = msg.z || 1
            if (buf.filter(Boolean).length < n) return null
            parts.delete(key)
            try { return JSON.parse(buf.join('')) } catch { return null }
        },
    }
}

// createPadHost(opts):
//   relay, makeTransport            room.js transport contract (WebSocket factory
//                                 in the browser, in-memory pipes in the check)
//   makePeer()                     optional WebRTC factory (host side):
//                                 { open, offer(), answer(sdp), ice(c), close(),
//                                   send(str), onOpen(cb), onMessage(cb), onState(cb) }
//   dispatch(code, type)           keyboard-event sink for seat 1 (gamepad #1)
//   now()                        clock (ms)
//   onPads({count, pads})        presence change (pads: [{seat, mode, rtt}])
// Seat -> onePad slot = seat. applyPad writes the slot; seat 1 also fires
// keyboard events through dispatch (edges only, GamepadBridge rules).
export function createPadHost(opts = {}) {
    const now = opts.now || (() => Date.now())
    const dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : () => {}
    const makePeer = typeof opts.makePeer === 'function' ? opts.makePeer : null
    let code = ''
    const sigIn = makeSigInbox()
    let pads = new Map()   // seat -> { chan, peer, lastSeen, rtt, mode, keys:Set, lastKeys:Set }

    const room = createRoom({
        relay: opts.relay,
        makeTransport: opts.makeTransport,
        onPhase: (p) => { if (opts.onPhase) opts.onPhase(p) },
        onJoin: ({ slot }) => {
            if (slot === 0) return
            const pad = { seat: slot, peer: null, chan: null, lastSeen: now(), rtt: 0, mode: 'relay', keys: new Set(), lastKeys: new Set(), pingAt: 0, offerAt: 0, needOffer: false }
            pads.set(slot, pad)
            announce()
            if (makePeer) {
                pad.peer = makePeer()
                wirePeer(pad)
                pad.needOffer = true
            }
        },
        onLeave: ({ slot }) => {
            if (dropPad(slot)) announce()
        },
    })
    room.on('pad', (msg) => hostRecv(msg))

    function wirePeer(pad) {
        const peer = pad.peer
        if (!peer) return
        peer.onOpen(() => { pad.chan = true; pad.mode = 'direct'; announce() })
        peer.onMessage((str) => { let obj = null; try { obj = JSON.parse(str) } catch { return } if (obj && obj.k === 'sig') hostRecv(obj, true); else if (obj && obj.k === 'pad') hostRecv(obj, true) })
        peer.onState && peer.onState((s) => { if (s === 'failed' || s === 'closed') { pad.chan = null; pad.mode = 'relay'; announce() } })
        peer.onIce && peer.onIce((c) => { for (const f of packSig(pad.seat, 'ice', c)) room.send('pad', f) })
    }

    function dropPad(seat) {
        const pad = pads.get(seat)
        if (!pad) return false
        if (pad.peer) { try { pad.peer.close() } catch { /* gone */ } }
        clearSlot(seat)
        releaseKeys(pad)
        pads.delete(seat)
        return true
    }

    function keyCodesFor(f) {
        const out = []
        if (f.left) out.push('ArrowLeft')
        if (f.right) out.push('ArrowRight')
        if (f.up) out.push('ArrowUp')
        if (f.down) out.push('ArrowDown')
        if (f.a) out.push('Space')
        if (f.b && opts.secondAction) out.push(opts.secondAction)
        if (f.start) out.push('Enter')
        if (f.boost) out.push('ShiftLeft')
        return out
    }

    // GamepadBridge's sync: release what went away, press what arrived.
    function syncKeys(pad, next) {
        for (const c of pad.keys) if (!next.has(c)) dispatch(c, 'keyup')
        for (const c of next) if (!pad.keys.has(c)) dispatch(c, 'keydown')
        pad.keys = next
    }

    function releaseKeys(pad) {
        for (const c of pad.keys) dispatch(c, 'keyup')
        pad.keys = new Set()
    }

    function applyPad(pad, f) {
        const seat = pad.seat
        for (const k of BIT_FIELDS) { if (f[k]) pressSlot(seat, k); else releaseSlot(seat, k) }
        setStickVecSlot(seat, f.x, f.y)
        setAimVecSlot(seat, f.ax, f.ay)
        if (seat === 1) syncKeys(pad, new Set(keyCodesFor(f)))
    }

    function hostRecv(msg, _viaPeer) {
        if (!msg) return
        if (msg.k === 'sig') {
            // signaling for the host only (from a phone seat); fragments first.
            const data = sigIn.push(msg)
            if (!data) return
            const seat = clampSeat(msg.s)
            if (!seat) return
            const pad = pads.get(seat)
            if (!pad || !pad.peer) return
            if (msg.m === 'answer') pad.peer.answer(data)
            else if (msg.m === 'ice') pad.peer.ice(data)
            else if (msg.m === 'ready' && pad.peer.offer) {
                Promise.resolve(pad.peer.offer()).catch(() => { /* relay only */ })
            }
            return
        }
        const f = decodePadPacket(msg)
        if (!f) return
        const pad = pads.get(f.seat)
        if (!pad) return
        pad.lastSeen = now()
        if (f.rtt) pad.rtt = f.rtt
        applyPad(pad, f)
        // echo the newest stamp for the phone's ping readout — over the direct
        // channel when it exists, else back through the relay.
        const t = now()
        if (t - pad.pingAt >= PING_EVERY_MS && typeof f.clock === 'number') {
            pad.pingAt = t
            if (pad.chan && pad.peer) pad.peer.send(JSON.stringify({ t: 'pad', k: 'q', d: pad.seat, c: f.clock }))
            else room.send('pad', { k: 'q', d: pad.seat, c: f.clock })
        }
    }

    function announce() {
        if (!opts.onPads) return
        const list = []
        for (const [, p] of pads) list.push({ seat: p.seat, mode: p.chan ? 'direct' : 'relay', rtt: p.rtt })
        list.sort((a, b) => a.seat - b.seat)
        opts.onPads({ count: list.length, pads: list })
    }

    const host = {
        room,
        get code() { return code },
        get pads() {
            const out = []
            for (const [, p] of pads) out.push({ seat: p.seat, mode: p.chan ? 'direct' : 'relay', rtt: p.rtt, age: now() - p.lastSeen })
            return out.sort((a, b) => a.seat - b.seat)
        },
        open() {
            let s = ''
            for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
            code = s
            room.connect(code, LINK_CAP)
            return code
        },
        // drive WebRTC offers + staleness from the caller's loop (a rAF in the
        // browser, a fake clock in the check).
        pump() {
            const t = now()
            let changed = false
            for (const [, pad] of pads) {
                if (pad.needOffer && pad.peer) {
                    pad.needOffer = false
                    pad.offerAt = t
                    Promise.resolve(pad.peer.offer()).then((sd) => { if (sd) for (const f of packSig(pad.seat, 'offer', sd)) room.send('pad', f) }).catch(() => { pad.peer = null })
                }
                if (!pad.chan && pad.peer && pad.offerAt && t - pad.offerAt > RTC_WAIT_MS) {
                    pad.offerAt = 0
                    changed = true // settled onto relay after ICE gave up
                }
                if (t - pad.lastSeen > STALE_MS) { clearSlot(pad.seat); releaseKeys(pad); pad.mode = 'stale'; changed = true }
            }
            if (changed) announce()
        },
        sendPadDirect(seat, str) {
            const pad = pads.get(seat)
            if (pad && pad.peer && pad.chan) { pad.peer.send(str); return true }
            return false
        },
        close() {
            for (const [, pad] of pads) { if (pad.peer) { try { pad.peer.close() } catch { /* gone */ } } clearSlot(pad.seat); releaseKeys(pad) }
            pads = new Map()
            room.reset()
            code = ''
            announce()
        },
    }
    return host
}

// --- phone pad ------------------------------------------------------------------
// createPadClient(opts):
//   relay, makeTransport, makePeer()  (pad side of the WebRTC pair)
//   readPad() -> { pad, raw, shoulder }   snapshot of the phone's local pad
//                                         (VirtualControls -> onePad held + rawPad)
//   now()  clock ms
//   onSeat(n) onMode('relay'|'direct') onRtt(ms) onError('full'|'hostless'|'refused'|'offline')
export function createPadClient(opts = {}) {
    const now = opts.now || (() => Date.now())
    const makePeer = typeof opts.makePeer === 'function' ? opts.makePeer : null
    const sigIn = makeSigInbox()
    const client = {
        seat: 0,
        mode: 'relay',
        rtt: 0,
        seq: 0,
        pending: new Map(),   // stamp -> sentAt (for RTT; bounded)
        lastRttAt: 0,
        phase: 'idle',        // idle | connecting | waiting | live | hostless | gone
        peer: null,
        chan: null,
        timer: 0,
        stampTimer: 0,
        wsSendRateMs: 1000 / PAD_HZ_RELAY,
        lastSent: 0,

        setPhase(p) { client.phase = p; if (opts.onPhase) opts.onPhase(p) },

        join(rawCode) {
            const code = decodeCode(rawCode)
            if (!code) { if (opts.onError) opts.onError('badcode'); return }
            client.setPhase('connecting')
            room.connect(code, 0)
        },

        // the steady stream: call from a timer/loop at >= PAD_HZ_DIRECT; it
        // self-throttles to the live transport's rate.
        tick() {
            if (client.seat < 1) return
            const rate = client.chan ? 1000 / PAD_HZ_DIRECT : client.wsSendRateMs
            const t = now()
            if (t - client.lastSent < rate) return
            client.lastSent = t
            const snap = (opts.readPad && opts.readPad()) || {}
            const stamp = t
            client.pending.set(stamp, t)
            if (client.pending.size > 32) client.pending.delete(client.pending.keys().next().value)
            const pkt = encodePadPacket(client.seat, snap.pad || {}, snap.raw || {}, snap.shoulder || {}, client.rtt, ++client.seq, stamp)
            const str = JSON.stringify(pkt)
            if (client.chan && client.peer) client.peer.send(str)
            else room.send('pad', { k: 'pad', n: pkt.n, c: stamp, q: pkt.q, x: pkt.x, y: pkt.y, u: pkt.u, v: pkt.v, sl: pkt.sl, r: pkt.r })
        },

        recv(obj) {
            if (!obj || obj.t !== 'pad') return
            if (obj.k === 'q') {
                if ((obj.d | 0) !== client.seat) return
                const sent = client.pending.get(obj.c)
                if (sent !== undefined) {
                    client.pending.delete(obj.c)
                    client.rtt = Math.max(1, Math.round(now() - sent))
                    client.lastRttAt = now()
                    if (opts.onRtt) opts.onRtt(client.rtt)
                }
                return
            }
            if (obj.k === 'sig') {
                const to = obj.d | 0
                if (to !== client.seat && to !== 0) return
                const data = sigIn.push(obj)
                if (!data) return
                if (!client.peer && makePeer) { client.peer = makePeer(); wirePeer(client.peer) }
                if (obj.m === 'offer' && client.peer) {
                    Promise.resolve(client.peer.answer(data)).then((sd) => {
                        if (sd) for (const f of packSig(0, 'answer', sd)) room.send('pad', f)
                    }).catch(() => { /* relay only */ })
                } else if (obj.m === 'ice' && client.peer) client.peer.ice(data)
                return
            }
            if (obj.k === 'kicked') { client.setPhase('gone'); client.stop() }
        },

        start() {
            client.stopTimers()
            client.timer = setInterval(() => client.tick(), Math.floor(1000 / PAD_HZ_DIRECT))
        },
        stopTimers() { clearInterval(client.timer); client.timer = 0 },
        stop() {
            client.stopTimers()
            if (client.peer) { try { client.peer.close() } catch { /* gone */ } client.peer = null; client.chan = null }
            room.send('pad', { k: 'out' })
            room.reset()
            client.seat = 0
            client.setPhase('idle')
        },
    }

    function wirePeer(peer) {
        peer.onOpen(() => {
            client.chan = true
            client.mode = 'direct'
            if (opts.onMode) opts.onMode('direct')
        })
        peer.onMessage((str) => { let obj = null; try { obj = JSON.parse(str) } catch { return } client.recv(obj) })
        peer.onState && peer.onState((s) => {
            if (s === 'failed' || s === 'closed') {
                client.chan = null
                client.mode = 'relay'
                if (opts.onMode) opts.onMode('relay')
            }
        })
        peer.onIce && peer.onIce((c) => { for (const f of packSig(0, 'ice', c)) room.send('pad', f) })
    }

    const room = createRoom({
        relay: opts.relay,
        makeTransport: opts.makeTransport,
        onPhase: (p) => { if (p === 'offline') client.setPhase('gone') },
        onRoster: ({ slots }) => {
            if (!slots.includes(0)) { client.setPhase('hostless'); room.reset(); client.seat = 0; return }
            client.setPhase(client.seat >= 1 ? 'live' : 'waiting')
        },
    })
    room.on('pad', (msg) => client.recv(msg))

    const origRecv = room.recv
    room.recv = function (obj) {
        origRecv.call(room, obj)
        if (obj && obj.t === 'welcome') {
            const you = obj.you | 0
            if (you === 0) {
                // joined a code nobody hosts: the room exists because WE made it.
                client.setPhase('hostless')
                room.reset()
                return
            }
            client.seat = you
            client.setPhase('live')
            if (opts.onSeat) opts.onSeat(you)
            client.start()
        }
    }
    client.room = room
    return client
}
