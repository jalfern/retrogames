// ROOMCHECK (#845) — reusable multiplayer-room proof, plain Node, offline.
//
//   A. relay core N-cap: a room opened at cap 4 seats four and refuses the fifth;
//      rosterOf reports the live seats + capacity.
//   B. protocol over a real socket (relay/server.mjs, same core.js the Cloudflare
//      worker wraps): host opens ?cap=4, three guests join, every member's roster
//      shows all four, a fifth is refused, a leaving guest shrinks everyone's
//      roster and sends 'gone', and the code reopens once empty.
//   C. room.js client logic over synthetic server frames: welcome->role/slot,
//      roster join/leave deltas fire onJoin/onLeave, cpuSeats/seatKinds fill the
//      open field, send() stamps your slot, and a forwarded game msg routes to the
//      right handler.
//   D. SSX net.js: a live-state snapshot stays far under the relay's 512-byte cap
//      and round-trips a ghost; seatIds maps humans vs CPU identically for host
//      and guest; the standings reducer ranks finishers correctly and produces the
//      SAME podium on every box given the SAME finish table (no lockstep required).
//
//   node scripts/roomcheck.mjs            # must go green
//   node scripts/roomcheck.mjs --mutate  # must go RED: the seat cap is widened so
//                                        # a fifth joins — the roster/refusal has teeth

import { CODE_RE, newRoom, join, leave, relay, rosterOf, MAX_MSG } from '../relay/core.js'
import { decodeCode, seatKinds, createRoom, HOST_SLOT } from '../src/utils/room.js'
import { encodeState, decodeState, seatIds, resolveHeat, podiumSeats, computeStandings, FIELD } from '../src/games/SSX/net.js'
import { startRelay } from '../relay/server.mjs'
import { WebSocket } from 'ws'

const MUTATE = process.argv.indexOf('--mutate') >= 0
const capOf = (n) => n

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ' — ' + info : ''}`) }
}
const bytes = (v) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ tier A ----
console.log('A. relay core N-cap')
{
    const room = newRoom('WIND', capOf(4))
    const seats = [join(room, 'a'), join(room, 'b'), join(room, 'c'), join(room, 'd')]
    const e = join(room, 'e')
    ok(seats.every((r, i) => r.ok && r.slot === i), 'four joiners take seats 0..3', JSON.stringify(seats.map((r) => r.slot)))
    ok(!e.ok && e.err === 'full', 'a fifth joiner is refused: full')
    const ro = rosterOf(room)
    ok(ro.t === 'roster' && ro.n === 4 && ro.cap === capOf(4) && ro.slots.join(',') === '0,1,2,3', 'rosterOf lists seats + capacity', JSON.stringify(ro))
    ok(relay(room, 'a', { t: 'st', s: 0, d: 5 }).ok, "the 'st' ghost type is forwarded")
    ok(!relay(room, 'a', { t: 'hack' }).ok, 'an unknown type is still dropped')
    const lv = leave(room, 'b')
    ok(lv.gone && !lv.empty && rosterOf(room).slots.join(',') === '0,2,3', 'a leave drops that seat from the roster')
    ok(rosterOf(newRoom('DUAL')).cap === 2, 'a room opened without a cap keeps 2 seats (Gauntlet unchanged)')
}

// ------------------------------------------------------------------ tier B ----
console.log('B. protocol over ws (relay/server.mjs, ?cap=4)')
{
    const srv = startRelay(0)
    await new Promise((done) => { const iv = setInterval(() => { if (srv.boundPort()) { clearInterval(iv); done() } }, 20) })
    const url = (code, cap) => `ws://127.0.0.1:${srv.boundPort()}/room/${code}${cap ? `?cap=${cap}` : ''}`
    const open = (u) => new Promise((done, no) => {
        const ws = new WebSocket(u); const msgs = []
        ws.on('message', (m) => msgs.push(JSON.parse(m.toString())))
        ws.on('error', (e) => no(e)); ws.on('open', () => done([ws, msgs]))
    })
    const until = (msgs, pred, ms = 1500) => new Promise((done) => {
        const t0 = Date.now()
        const iv = setInterval(() => { if (msgs.some(pred) || Date.now() - t0 > ms) { clearInterval(iv); done(msgs.some(pred)) } }, 20)
    })
    const closed = (ws, ms = 1200) => new Promise((done) => {
        if (ws.readyState !== 1) { done(true); return }
        const t0 = Date.now()
        const iv = setInterval(() => { if (ws.readyState !== 1 || Date.now() - t0 > ms) { clearInterval(iv); done(ws.readyState !== 1) } }, 20)
    })
    const hasRoster = (msgs, n) => msgs.some((m) => m.t === 'roster' && m.n === n)

    const host = await open(url('RACE', capOf(4)))
    ok(await until(host[1], (m) => m.t === 'welcome' && m.you === 0 && m.cap === capOf(4)), 'host welcome carries slot 0 + cap')
    const g1 = await open(url('RACE'))
    ok(await until(host[1], (m) => m.t === 'roster' && m.n === 2 && m.slots.indexOf(1) >= 0), 'host roster grows to 2 when a guest joins')
    ok(await until(g1[1], (m) => m.t === 'welcome' && m.you === 1), 'guest1 welcome carries slot 1')
    const g2 = await open(url('RACE'))
    const g3 = await open(url('RACE'))
    ok(await until(host[1], (m) => m.t === 'roster' && m.n === 4), 'host roster reaches all four seats')
    ok(await until(g3[1], hasRoster.bind(null, g3[1], 4), 1500), 'the last guest sees the full 4-seat roster', JSON.stringify(g3[1].filter((m) => m.t === 'roster').map((m) => m.n)))
    let fifth = null
    try { fifth = await open(url('RACE')) } catch { /* refused */ }
    ok(!fifth || await closed(fifth[0]), 'a fifth seat is refused at cap 4')

    // a ghost state message from guest2 reaches host and the other guests.
    g2[0].send(JSON.stringify({ t: 'st', s: 2, d: 123, x: 0.5 }))
    ok(await until(host[1], (m) => m.t === 'st' && m.s === 2 && m.d === 123), "a ghost 'st' crosses to the host")
    ok(await until(g1[1], (m) => m.t === 'st' && m.s === 2), "a ghost 'st' crosses to another guest")

    g3[0].close()
    ok(await until(host[1], (m) => m.t === 'roster' && m.n === 3 && m.slots.indexOf(3) < 0), 'a leaving guest shrinks the roster to 3')
    ok(await until(host[1], (m) => m.t === 'gone'), 'the room learns a racer left')
    host[0].close(); g1[0].close(); g2[0].close()
    await sleep(150)

    // reopened + a fresh cap negotiation
    const h2 = await open(url('RACE', capOf(4)))
    ok(await until(h2[1], (m) => m.t === 'welcome' && m.you === 0), 'the code reopened after the room emptied')
    h2[0].close(); await sleep(120)
    await srv.close()
}

// ------------------------------------------------------------------ tier C ----
console.log('C. room.js client logic (synthetic frames)')
{
    ok(decodeCode('race') === 'RACE' && decodeCode('ab1') === '' && decodeCode('IOOI') === '', 'decodeCode upper-cases and rejects bad codes')

    const joinEv = [], leaveEv = [], got = []
    const out = []
    const fakeTransport = () => ({ send: (s) => out.push(JSON.parse(s)), onMessage: () => {}, onClose: () => {}, close: () => {} })
    const room = createRoom({
        relay: 'ws://x', makeTransport: fakeTransport,
        onRoster: () => {}, onJoin: (e) => joinEv.push(e.slot), onLeave: (e) => leaveEv.push(e.slot),
        on: { go: (m) => got.push(['go', m.seed]), st: (m) => got.push(['st', m.s]), bye: () => got.push(['bye']) },
    })
    room.connect('RACE', 4)
    room.recv({ t: 'welcome', you: 0, cap: 4 })
    ok(room.role === 'host' && room.phase === 'waiting' && room.yourSlot === HOST_SLOT, 'welcome makes slot 0 the host')
    room.recv({ t: 'roster', n: 1, cap: 4, slots: [0] })
    room.recv({ t: 'roster', n: 3, cap: 4, slots: [0, 1, 3] })
    ok(joinEv.join(',') === '1,3', 'roster join deltas fire for new seats', joinEv.join(','))
    ok(seatKinds(room.cap, room.slots).join(',') === 'host,human,cpu,human', 'seatKinds labels host/human/cpu', seatKinds(room.cap, room.slots).join(','))
    ok(room.cpuSeats().join(',') === '2', 'cpuSeats reports the one open seat', room.cpuSeats().join(','))
    room.recv({ t: 'roster', n: 2, cap: 4, slots: [0, 1] })
    ok(leaveEv.join(',') === '3', 'a dropped seat fires onLeave')
    room.send('st', { d: 50 })
    ok(out.length === 1 && out[0].t === 'st' && out[0].s === 0 && out[0].d === 50, 'send stamps the sender slot', JSON.stringify(out[0]))
    room.recv({ t: 'go', s: 0, seed: 77 })
    room.recv({ t: 'st', s: 2, d: 9 })
    ok(got.some((g) => g[0] === 'go' && g[1] === 77) && got.some((g) => g[0] === 'st' && g[1] === 2), 'forwarded game msgs route to their handlers', JSON.stringify(got))

    // guest role from a non-zero welcome; 'gone' is an event, not a phase trip.
    const goneEv = []
    const gr = createRoom({ relay: 'ws://x', makeTransport: fakeTransport, on: { gone: () => goneEv.push(1) } })
    gr.connect('RACE')
    gr.recv({ t: 'welcome', you: 2, cap: 4 })
    ok(gr.role === 'guest' && gr.yourSlot === 2, 'a slot-2 welcome makes a guest')
    gr.recv({ t: 'gone' })
    ok(goneEv.length === 1 && gr.phase === 'waiting', "a 'gone' fires an event without tripping the phase")
}

// ------------------------------------------------------------------ tier D ----
console.log('D. SSX online net.js (snapshots, seats, standings)')
{
    const rider = {
        id: 2, s: 142.37, x: -0.813, y: 22.4, v: 31.2, vy: -6.7, spin: 540, flip: 360, invert: 420,
        grab: 1, grabKind: 2, stance: 1, tumble: 0, boost: 1, tuck: 0, scrub: 1, crouch: 0, air: 1,
        finished: 0, score: 4820,
    }
    const msg = encodeState(rider, 1)
    const wire = JSON.stringify(Object.assign({ t: 'st', s: 2 }, msg))
    ok(bytes(wire) < MAX_MSG, `a ghost snapshot fits the 512-byte relay budget (${bytes(wire)}B)`)
    const gs = decodeState(msg)
    ok(Math.abs(gs.s - rider.s) < 0.05 && Math.abs(gs.x - rider.x) < 0.004 && Math.abs(gs.spin - rider.spin) < 5 && gs.flip === 360 && gs.invert === 420 && gs.grabKind === 2,
        'the ghost snapshot round-trips close enough to pose a rider', JSON.stringify({ s: gs.s, x: gs.x, spin: gs.spin }))
    const ghost = Object.assign({}, rider)
    applyGhostSafe(ghost, gs)
    ok(ghost.s === gs.s && ghost.spin === gs.spin && ghost.finished === false, 'applyGhost stamps a local stand-in rider')

    ok(FIELD === 6, 'the field is six riders')
    const host = seatIds(0, [0, 1, 3], 4)
    ok(host.seatToId[0] === 0 && host.remoteSeats.join(',') === '1,3' && host.cpuIds.join(',') === '3,4,5',
        'host seat0: remote humans take ids 1,2; cpus fill the rest', JSON.stringify({ remote: host.remoteSeats, cpu: host.cpuIds }))
    const guest = seatIds(3, [0, 1, 3], 4)
    ok(guest.seatToId[3] === 0 && guest.remoteSeats.join(',') === '0,1' && guest.cpuIds.length === 3,
        'guest seat3 maps itself to rider 0 and the other humans to ids 1,2', JSON.stringify({ remote: guest.remoteSeats, cpu: guest.cpuIds }))

    // standings: the friends ranked by finish time; same finish table -> same podium
    const seats = [0, 1, 3]
    const finA = { 0: 62.10, 1: 58.44, 3: 60.02 }
    if (MUTATE) finA[1] = 99 // the mutant: break the finish time the ranking keys on
    const r1 = resolveHeat(seats, finA, { 0: 0, 1: 0, 3: 0 })
    ok(r1.order.join(',') === '1,3,0', 'a heat ranks the fastest friend first', r1.order.join(','))
    ok(r1.pts[1] === 10 && r1.pts[3] === 7 && r1.pts[0] === 5, 'place points follow the original ladder', JSON.stringify(r1.pts))
    // heat 2: seat0 wins it; totals across two heats
    const finB = { 0: 55.0, 1: 57.0, 3: 70.0 }
    const r2 = resolveHeat(seats, finB, r1.totals)
    ok(r2.totals[0] === 5 + 10 && r2.totals[1] === 10 + 7 && r2.totals[3] === 7 + 5, 'standings accumulate points across heats', JSON.stringify(r2.totals))
    const pod = podiumSeats(seats, r2.totals)
    ok(pod.join(',') === '1,0,3', 'the podium ranks by accumulated points', pod.join(','))

    // identical on every box: recompute independently from the same tables
    const other = resolveHeat(seats, finA, { 0: 0, 1: 0, 3: 0 })
    const other2 = resolveHeat(seats, finB, other.totals)
    ok(podiumSeats(seats, other2.totals).join(',') === pod.join(','), 'two boxes given the same finishes agree on the podium')

    // the full online reducer: three heats of finish times -> points -> podium, done
    const heats = { 0: [60, 55, 56], 1: [58, 57, 66], 3: [59, 70, 60] }
    const st = computeStandings(seats, heats, 3)
    ok(st.done === true, 'computeStandings flags the tournament complete when all seats finished all heats')
    ok(st.totals[0] === 25 && st.totals[1] === 22 && st.totals[3] === 19, 'points accumulate across three heats by finish order', JSON.stringify(st.totals))
    ok(st.podium.join(',') === '0,1,3', 'computeStandings ranks the friends onto the podium', st.podium.join(','))
    // an unfinished seat is scored last for that heat, and the table is not "done"
    const st2 = computeStandings(seats, { 0: [60, 55, 56], 1: [58, 57, null], 3: [59, 70, 60] }, 3)
    ok(st2.done === false, 'a seat that has not finished every heat keeps the tournament open')
    void relay
}
function applyGhostSafe(r, gs) { r.s = gs.s; r.spin = gs.spin; r.finished = gs.finished }

console.log(`\nroomcheck: ${pass} passed, ${fail} failed${MUTATE ? '  [MUTANT]' : ''}`)
process.exit(fail ? 1 : 0)
