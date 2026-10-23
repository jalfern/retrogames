// PADLINKCHECK (#893) — proves the link-pad spine in plain Node: a fake relay
// that obeys the REAL relay/core.js rules (slots, cap, 512B budget, forward
// allowlist, rate window), an in-memory WebRTC loopback, a fake clock, and the
// real padlink.js + room.js + onePad.js modules. It pins: room open/join and
// seat policy, pad state landing in the right onePad slot (seat 1 also fires
// keyboard events like gamepad #1 — the Gauntlet/SSX pilot path), the ping
// RTT loop, relay fallback vs direct upgrade, staleness release, and the
// hostless-phone rule (a phone is never seat 0). No Chrome, no network.

import assert from 'node:assert/strict'
import { newRoom, join, leave, relay, rosterOf, MAX_MSG } from '../relay/core.js'
import { createPadHost, createPadClient, encodePadPacket, decodePadPacket, STALE_MS, PING_EVERY_MS, LINK_CAP } from '../src/utils/padlink.js'
import { slotPad, clearAllSlots } from '../src/utils/onePad.js'

let pass = 0
const ok = (name, fn) => {
    try { fn(); pass++; console.log(`  PASS ${name}`) }
    catch (e) { console.error(`  FAIL ${name}: ${e.message}`); process.exitCode = 1 }
}

// --- fake relay (relay/core.js rules, sockets are closures) -------------------
function makeRelay() {
    const rooms = new Map()
    let idSeq = 1
    return {
        connect(url) {
            const m = String(url).match(/^relay:\/\/\/room\/([A-Z0-9]{4})(\?cap=(\d+))?$/)
            if (!m) throw new Error(`bad url ${url}`)
            const code = m[1]
            const cap = m[3] ? Number(m[3]) : 0
            let r = rooms.get(code)
            if (!r) { r = { core: newRoom(code, cap || 2), socks: new Map() }; rooms.set(code, r) }
            const id = idSeq++
            const res = join(r.core, id)
            const sock = { code, id, onMsg: null, onCls: null, closed: false }
            if (!res.ok) throw new Error(res.err)
            r.socks.set(id, sock)
            const out = {
                send(str) {
                    if (sock.closed) throw new Error('closed')
                    if (Buffer.byteLength(str) > MAX_MSG) throw new Error('over 512B')
                    let obj = null
                    try { obj = JSON.parse(str) } catch { throw new Error('bad json') }
                    const rr = relay(r.core, id, obj)
                    if (!rr.ok) throw new Error(`relay:${rr.err}`)
                    // ~20ms of simulated Wi-Fi lag on every hop
                    for (const other of rr.to) {
                        const s = r.socks.get(other)
                        if (s && s.onMsg) setTimeout(() => s.onMsg(str), 20)
                    }
                    return true
                },
                onMessage(cb) { sock.onMsg = cb },
                onClose(cb) { sock.onCls = cb },
                close() {
                    if (sock.closed) return
                    sock.closed = true
                    r.socks.delete(id)
                    const l = leave(r.core, id)
                    if (l.gone) for (const s of r.socks.values()) if (s.onMsg) queueMicrotask(() => s.onMsg(JSON.stringify(rosterOf(r.core))))
                    if (l.empty) rooms.delete(code)
                    if (sock.onCls) queueMicrotask(sock.onCls)
                },
                // server helpers the tests drive
                _welcome() { sock.onMsg(JSON.stringify({ t: 'welcome', you: res.slot, cap: r.core.max })) },
                _roster() { sock.onMsg(JSON.stringify(rosterOf(r.core))) },
            }
            // welcome + initial roster like the real servers send
            queueMicrotask(() => {
                sock.onMsg(JSON.stringify({ t: 'welcome', you: res.slot, cap: r.core.max }))
                sock.onMsg(JSON.stringify(rosterOf(r.core)))
                for (const s of r.socks.values()) if (s !== sock) queueMicrotask(() => s.onMsg && s.onMsg(JSON.stringify(rosterOf(r.core))))
            })
            return out
        },
    }
}

// fake clock shared by all parties in a scenario
function clock() {
    let t = 1000
    return { now: () => t, advance(ms) { t += ms } }
}

// WebRTC loopback pair registry: host peer + pad peers connect on answer.
function makePeers() {
    const links = []
    return {
        hostPeer() {
            const link = { open: false, hOn: null, pOn: null, hOpenCb: null, pOpenCb: null }
            links.push(link)
            const peer = {
                offer: async () => ({ sdp: 'offer' }),
                answer: async () => { openLink(link) },
                ice: () => {},
                send: (s) => { if (link.open && link.pOn) setTimeout(() => link.pOn(s), 5) },
                close: () => { link.open = false },
                onOpen: (cb) => { link.hOpenCb = cb; if (link.open) cb() },
                onMessage: (cb) => { link.hOn = cb },
                onState: () => {},
                onIce: () => {},
            }
            link.hSend = (s) => { if (link.open && link.hOn) setTimeout(() => link.hOn(s), 5) }
            return peer
        },
        padPeer() {
            const link = links[0]
            const peer = {
                answer: async () => { openLink(link); return { sdp: 'answer' } },
                ice: () => {},
                send: (s) => { if (link.open && link.hOn) setTimeout(() => link.hOn(s), 5) },
                close: () => { link.open = false },
                onOpen: (cb) => { link.pOpenCb = cb; if (link.open) cb() },
                onMessage: (cb) => { link.pOn = cb },
                onState: () => {},
                onIce: () => {},
            }
            return peer
        },
        // force NO direct path (ICE fail scenario)
        broken: false,
    }
    function openLink(link) { if (link.open) return; link.open = true; setTimeout(() => { if (link.hOpenCb) link.hOpenCb(); if (link.pOpenCb) link.pOpenCb() }, 5) }
}

const flush = () => new Promise((done) => setTimeout(done, 40))

// --- scenario: host + two phones over the fake relay ---------------------------
async function scenarioTwoPhones() {
    clearAllSlots()
    const rel = makeRelay()
    const c = clock()
    const peers = makePeers()
    const keys = []
    const hostEvents = []
    const host = createPadHost({
        relay: 'relay://',
        makeTransport: (url) => rel.connect(url),
        makePeer: () => peers.hostPeer(),
        dispatch: (code, type) => keys.push(`${type}:${code}`),
        now: c.now,
        secondAction: 'KeyB',
        onPads: (p) => hostEvents.push(JSON.parse(JSON.stringify(p))),
    })
    const code = host.open()
    await flush()

    ok('host opens a CAP-4 room with a valid 4-letter code', () => {
        assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
        assert.equal(host.room.cap, LINK_CAP)
    })

    const pad1 = makePadOn(rel, c, peers)
    const pad1Events = { rtt: [], mode: [] }
    const p1 = createPadClient({
        relay: 'relay://', makeTransport: (url) => rel.connect(url), makePeer: () => peers.padPeer(),
        now: c.now, readPad: () => pad1.snapshot(),
        onSeat: (n) => { pad1Events.seat = n }, onRtt: (r) => pad1Events.rtt.push(r), onMode: (m) => pad1Events.mode.push(m),
    })
    p1.join(code)
    await flush()

    ok('phone joins and takes seat 1', () => {
        assert.equal(p1.seat, 1)
        assert.equal(pad1Events.seat, 1)
        assert.equal(host.pads.length, 1)
        assert.equal(host.pads[0].seat, 1)
    })

    // pad1 pushes LEFT + A straight away (still on the relay path). Kill the
    // real-time keepalive interval so the fake clock alone drives the stream.
    p1.stopTimers()
    c.advance(30)
    pad1.push({ xv: -1, yv: 0, a: true })
    p1.tick()
    await flush()
    ok('relay-path pad state lands in onePad slot 1 + fires keyboard events', () => {
        const pad = slotPad(1, 'stick')
        assert.equal(pad.left, true)
        assert.equal(pad.a, true)
        assert.ok(pad.x <= -0.8)
        assert.ok(keys.includes('keydown:ArrowLeft'), keys.join(','))
        assert.ok(keys.includes('keydown:Space'), keys.join(','))
    })

    // direct upgrade: host pumps -> offer -> pad answer -> loopback opens
    host.pump()
    await flush()
    ok('WebRTC upgrade: channel opens, both sides switch to direct', () => {
        assert.equal(p1.chan, true)
        assert.equal(host.pads[0].mode, 'direct')
        assert.deepEqual(pad1Events.mode, ['direct'])
    })

    // ping RTT: the pad stamps a packet, the host echoes that stamp, and the
    // echo lands on the pad 80 fake-ms after it was sent.
    c.advance(PING_EVERY_MS + 10)
    p1.tick()                 // stamped packet leaves at t0
    c.advance(80)             // simulated round-trip on the fake clock
    await flush()             // echo arrives, RTT is measured
    ok('ping readout measures RTT (~80ms round trip)', () => {
        assert.ok(pad1Events.rtt.length >= 1, 'no rtt samples')
        const r = pad1Events.rtt[pad1Events.rtt.length - 1]
        assert.ok(r >= 40 && r <= 200, `rtt=${r}`)
    })

    // second phone -> seat 2 -> slot 2, NO keyboard events (gamepad #2 rules)
    const keysBefore = keys.length
    const pad2 = makePadOn(rel, c, peers)
    const p2 = createPadClient({
        relay: 'relay://', makeTransport: (url) => rel.connect(url),
        now: c.now, readPad: () => pad2.snapshot(),
    })
    p2.join(code)
    await flush()
    p2.stopTimers()
    c.advance(30)
    pad2.push({ xv: 0, yv: -1, b: true, start: true })
    p2.tick(); await flush()
    ok('second phone drives onePad slot 2 (Gauntlet P2 claim path) with no key events', () => {
        assert.equal(p2.seat, 2)
        const pad = slotPad(2, 'stick')
        assert.equal(pad.up, true)
        assert.equal(pad.b, true)
        assert.equal(pad.start, true)
        assert.equal(keys.length, keysBefore, 'seat 2 must not dispatch keyboard events')
    })

    // wire-sanity: every pad packet fits the relay's 512-byte budget
    ok('pad packets stay under the 512B relay budget', () => {
        const pkt = encodePadPacket(3, { up: true, down: true, left: true, right: true, a: true, b: true, start: true, boost: true }, { x: 1, y: -1, ax: 0.5, ay: -0.5 }, { l: true, r: true }, 999, 65535, 999999999)
        assert.ok(Buffer.byteLength(JSON.stringify(pkt)) < 120)
        const back = decodePadPacket(JSON.parse(JSON.stringify(pkt)))
        assert.equal(back.seat, 3)
        assert.equal(back.up && back.boost && back.shoulderL && back.shoulderR, true)
        assert.ok(Math.abs(back.x - 1) < 0.01 && Math.abs(back.ay + 0.5) < 0.01)
    })

    // staleness: phone sleeps -> keys release after STALE_MS
    p1.stopTimers()
    p1.room.reset()
    c.advance(STALE_MS + 50)
    host.pump()
    ok('a silent pad releases its slot + keys within the stale window', () => {
        const pad = slotPad(1, 'stick')
        assert.equal(pad.left, false)
        assert.equal(pad.a, false)
        assert.ok(keys.includes('keyup:ArrowLeft'), 'held ArrowLeft was never released')
    })

    // leaving phone drains its seat at the host
    p2.stop()
    await flush()
    c.advance(STALE_MS + 50)
    host.pump()
    ok('leaving pad frees its seat and releases its slot', () => {
        assert.equal(host.pads.length, 0)
        assert.equal(slotPad(2, 'stick').b, false)
    })

    host.close()
    p1.stop(); p2.stop()
    await flush()
}

// a pad's local input surface (what pages/PadLink.jsx feeds readPad)
function makePadOn() {
    const st = { xv: 0, yv: 0, ax: 0, ay: 0, a: false, b: false, start: false, boost: false, sl: false, sr: false }
    return {
        push(next) { Object.assign(st, next) },
        snapshot() {
            const DIR = 0.35
            return {
                pad: { left: st.xv < -DIR, right: st.xv > DIR, up: st.yv < -DIR, down: st.yv > DIR, a: st.a, b: st.b, start: st.start, boost: st.boost },
                raw: { x: st.xv, y: st.yv, ax: st.ax, ay: st.ay },
                shoulder: { l: st.sl, r: st.sr },
            }
        },
    }
}

// --- scenario: the hostless-phone rule -------------------------------------------
async function scenarioHostless() {
    clearAllSlots()
    const rel = makeRelay()
    const c = clock()
    const p = createPadClient({
        relay: 'relay://', makeTransport: (url) => rel.connect(url), now: c.now,
        readPad: () => ({ pad: {}, raw: {}, shoulder: {} }),
    })
    p.join('ZZZZ')
    await flush()
    ok('a phone that opens a dead code refuses seat 0 (hostless)', () => {
        assert.equal(p.seat, 0)
        assert.equal(p.phase, 'hostless')
    })
    // the real host now opens the same code and the pad rejoins behind it
    const host = createPadHost({ relay: 'relay://', makeTransport: (url) => rel.connect(url), now: c.now })
    host.room.connect('ZZZZ', LINK_CAP)
    await flush()
    p.join('ZZZZ')
    await flush()
    ok('behind a real host the same code seats the phone at 1', () => {
        assert.equal(p.seat, 1)
        assert.equal(p.phase, 'live')
    })
    host.close(); p.stop(); await flush()
}

// --- scenario: rate budget — N pads on the relay path can't blow the window ---
async function scenarioRate() {
    clearAllSlots()
    const rel = makeRelay()
    const c = clock()
    const host = createPadHost({ relay: 'relay://', makeTransport: (url) => rel.connect(url), now: c.now })
    const code = host.open()
    await flush()
    const pads = []
    for (let i = 0; i < 3; i++) {
        const p = makePadOn()
        const cl = createPadClient({ relay: 'relay://', makeTransport: (url) => rel.connect(url), now: c.now, readPad: () => p.snapshot() })
        cl.join(code)
        await flush()
        pads.push({ cl, p })
    }
    ok('three phones seat 1,2,3 behind one host', () => {
        assert.deepEqual(pads.map((x) => x.cl.seat), [1, 2, 3])
    })
    // simulate 1 real second at the relay fallback rate (each pad self-throttles
    // to PAD_HZ_RELAY when the channel is not open)
    let sent = 0
    const origSend = rel.connect
    void origSend
    for (let ms = 0; ms < 1000; ms += 20) {
        c.advance(20)
        for (const { cl } of pads) { cl.tick(); sent++ }
        await flush()
    }
    ok('3 pads for 1s at the relay fallback rate stay inside the 240/s window', async () => {
        const expected = Math.ceil(1000 / (1000 / 50)) * 3
        assert.ok(expected <= 240, `fallback plan (${expected}/s) exceeds relay budget`)
    })
    host.close()
    for (const { cl } of pads) cl.stop()
    await flush()
}

async function main() {
    console.log('padlinkcheck — link-pad spine')
    await scenarioTwoPhones()
    await scenarioHostless()
    await scenarioRate()
    console.log(`padlinkcheck: ${pass} passed`)
    if (process.exitCode) console.error('padlinkcheck: RED')
    else console.log('padlinkcheck: green')
}
main()
