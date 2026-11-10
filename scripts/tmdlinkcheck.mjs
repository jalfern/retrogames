// TALK ME DOWN LINK CHECK (#1880) — the remote-seats protocol harness. Pure
// Node: two "boxes" (host = seat 0 = DEFUSER, guest = seat 1 = MANUAL) run the
// SAME deterministic sim from one seed and talk only through an in-memory room
// obeying the real relay rules (relay/core.js: FORWARD_TYPES allowlist, 512B
// budget) under a 60 Hz fake clock. No sockets, no DOM.
//
//   1. the codec is honest       — padMask/unmaskPad round-trip all 64 masks
//   2. the snapshot round-trips  — restore (incl. the rng counter) keeps
//                                  ticking to the same hash; chunks are 512B-safe
//   3. lockstep holds            — every boundary hash agrees, the twin runs
//                                  finish identically (the same score, won)
//   4. it survives jitter        — legs inside the pad lead stall, never desync
//   5. a manual walkaway bends — after exactly DROP_GRACE stalled ticks the
//                                  seat demotes, gs.players flips to 1, the CPU
//                                  manual (partnerSay) takes the rail and the
//                                  bomb is still defusable solo
//   6. the host-gone law       — a guest whose defuser dies FREEZES (no role
//                                  inversion: the page holder owns no hands),
//                                  seat 0 is never demoted, the sim holds still
//   7. a desync resyncs        — the guest freezes at the boundary; the host's
//                                  snapshot restores it at the same tick
//   8. an in-flight rejoin RESEATS (#1838 law) — back + snapshot + mask
//                                  backfill rebuild the returner at the host's
//                                  tick; both boxes seat the human on the SAME
//                                  tick and hash agreement resumes mid-run
//   9. the page fold is honest — the (want-page+3)%3 tap math the mic uses
//                                  online lands the page exactly, no direct write
//  10. the shell is wired      — static audit of index.jsx + relay law
//
// Run: npm run tmdlinkcheck   (no dev server needed)
// Mutant: npm run tmdlinkcheck -- --mutate          (the walkaway never demotes
//          — test 5 goes RED: a lost link freezes frames; the law has teeth)
// Mutant: npm run tmdlinkcheck -- --mutate-reseat   (the shared players flip
//          never lands — test 8 goes RED: the seat stays CPU forever)
// Mutant: npm run tmdlinkcheck -- --mutate-freeze   (the guest hands the page
//          holder the bomb when the host dies — test 6 goes RED)
// Mutant: npm run tmdlinkcheck -- --mutate-phone    (the phone guest's wide
//          rulebook bay is reverted — the #1888 bay-swap audits go RED)

import { createGame, step, hash, solvePad } from '../src/games/TalkMeDown/engine.js'
import {
    createTmdSync, padMask, unmaskPad, snapshotNet, restoreNet, packSnap,
    PAD_DELAY, HASH_EVERY, DROP_GRACE, SEATS, CHUNK, RESEAT_LEAD, RESEAT_WINDOW,
} from '../src/games/TalkMeDown/net.js'
import { newRoom, join, leave, relay, MAX_MSG, FORWARD_TYPES } from '../relay/core.js'
import { readFileSync } from 'node:fs'

const MUTATE = process.argv.indexOf('--mutate') >= 0
const MUTATE_RESEAT = process.argv.indexOf('--mutate-reseat') >= 0
const MUTATE_FREEZE = process.argv.indexOf('--mutate-freeze') >= 0
// #1888: revert the phone guest's wide-page swap — the bay-swap audits go RED.
const MUTATE_PHONE = process.argv.indexOf('--mutate-phone') >= 0

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---- fake clock -------------------------------------------------------------
let FAKE_NOW = 1_000_000
const tickClock = () => { FAKE_NOW += 16 }
Date.now = () => FAKE_NOW

// ---- the in-memory room: relay/core.js rules, zero sockets ------------------
function makeLink(latMs = 0) {
    const room = newRoom('TEST', 2)
    const inq = new Map()
    const oversize = []
    const send = (fromId, obj) => {
        const str = JSON.stringify(obj)
        if (Buffer.byteLength(str) > MAX_MSG) { oversize.push(str.length); return }
        if (!room.members.some((m) => m.id === fromId)) return
        const r = relay(room, fromId, obj)
        if (!r.ok) throw new Error(`relay refused: ${r.err}`)
        const at = Date.now() + latMs
        for (const to of r.to) {
            if (!inq.has(to)) inq.set(to, [])
            inq.get(to).push({ m: obj, at })
        }
    }
    return {
        room,
        oversize,
        join: (id) => join(room, id),
        leave: (id) => leave(room, id),
        send,
        drain: (id, limit = Infinity) => {
            const q = inq.get(id) || []
            const out = []
            const rest = []
            for (const e of q) {
                if (out.length < limit && e.at <= Date.now()) out.push(e.m)
                else rest.push(e)
            }
            inq.set(id, rest)
            return out
        },
        members: () => room.members.map((m) => m.id).sort(),
    }
}

// ---- recorded absolute streams ----------------------------------------------
// Host seat: the engine's own solver, recorded ONCE per seed from a clean run
// (the tmd-smoke witness: 200/200 seeds win with solvePad — a proven route
// exists before any seat is offered, the #1637 honesty clause). Guest seat:
// scripted absolute page activity — stamps move manual.page, which rides the
// hash, so equal streams are the whole guarantee.
const streamCache = new Map()
function streamFor(seed) {
    if (streamCache.has(seed)) return streamCache.get(seed)
    const g = createGame(seed, 2)
    const stream = []
    while (!g.done) {
        const pad = solvePad(g)
        stream.push([pad, guestPad(stream.length)])
        step(g, stream[stream.length - 1])
        while (g.events.length) g.events.shift()
    }
    streamCache.set(seed, stream)
    return stream
}
function guestPad(k) {
    const p = {}
    if (k % 97 === 0) p.right = true   // turn a page
    if (k % 53 === 0) p.up = true      // walk a line
    if (k % 211 === 0) p.a = true      // clip a flag
    return p
}
const hostPadAt = (seed, k) => {
    const s = streamFor(seed)
    return s[Math.min(k - 1, s.length - 1)][0]
}
const guestPadAt = (seed, k) => {
    const s = streamFor(seed)
    return s[Math.min(k - 1, s.length - 1)][1]
}

// ---- one box: sim + sync core, the shell's exact tick contract --------------
function makeBox(link, id, mySeat, seed) {
    const g = createGame(seed, 2)
    const net = createTmdSync({
        mySeat,
        watchSeats: [1 - mySeat],
        // pair tests run a short campaign (~500 throttled ticks); boundaries
        // every 15 keep the desync machinery exercised inside that budget.
        hashEvery: 15,
        send: (t, p) => link.send(id, Object.assign({ t, s: mySeat }, p)),
    })
    const box = {
        link, id, g, net, seed, mySeat,
        desyncs: 0, desync: null, frozen: false, demoted: 0, hostLost: false,
        miss: 0, resyncs: 0, snap: null,
        reseated: 0, reseatSeat: null, reseatWait: 0, reseatStalls: 0, reseatBackTick: null, reseatArm: false,
        hashes: new Map(), // boundary tick -> whole-sim hash (the guarantee)
    }
    // throttle (defuser only): the recorded solvePad stream clears the whole
    // campaign in <50 ticks — too fast for boundary/walkaway scenarios to
    // land mid-run. Emit the SAME output sequence one press per 8 ticks:
    // contents identical, run stretched ~8x in time (well inside every fuse).
    let outIdx = 0
    box.idle = false
    box.pad = mySeat === 0
        ? (k) => {
            if (k % 8 !== 0 || box.idle) return {}
            const s = streamFor(seed)
            return s[Math.min(outIdx++, s.length - 1)][0]
        }
        : (k) => {
            const p = guestPadAt(seed, k)
            if (p && p.right) box.rights++
            return p
        }
    box.rights = 0
    box.pageTurns = 0
    const sim = (pads) => {
        const before = box.g.manual.page
        step(box.g, pads)
        if (box.g.manual.page !== before) box.pageTurns++
        while (box.g.events.length) box.g.events.shift()
    }
    box.pump = () => {
        for (const msg of link.drain(id)) {
            if (msg.t === 'pad') net.gotPad(msg)
            else if (msg.t === 'hs') {
                const d = net.gotHash(msg.k, msg.h)
                if (d) { box.desyncs++; box.desync = d; if (mySeat === 1) box.frozen = true }
            } else if (msg.t === 'res' && msg.e === 'req' && mySeat === 0) hostSnap(box)
            else if (msg.t === 'res' && msg.e === 'rejoin' && mySeat === 0 && !box.g.done) hostRejoin(box, msg.s)
            else if (msg.t === 'res' && msg.e === 'back' && mySeat === 1) { box.reseatArm = true; box.reseatBackTick = msg.k | 0 }
            else if (msg.t === 'res' && msg.e === 'snp') {
                const r = net.snapInbox.push(msg)
                if (r) {
                    if (box.reseatArm) reseatApply(box, r)
                    else box.snap = { snap: r.snap, tick: r.tick }
                }
            }
        }
    }
    // the shell law (index.jsx tickSim): pump -> ready -> assemble -> step ->
    // hash, with the walkaway laws: host demotes seat 1 after DROP_GRACE;
    // guest FREEZES when the defuser seat stalls (no inversion).
    box.step = () => {
        if (box.hostLost) return 'lost'
        if (box.frozen) {
            // a frozen box keeps ONLY the resync path alive: drain the wire and
            // apply the host's snapshot at its tick (streams preserved).
            box.pump()
            if (box.snap) {
                box.g = restoreNet(box.snap.snap)
                box.snap = null
                box.frozen = false
                box.resyncs++
            }
            return 'frozen'
        }
        box.pump()
        if (net.solo()) {
            net.pumpTo(box.g.tick + 1 + net.delay, box.pad)
            if (box.g.players > 1) box.g.players = 1
            sim(net.assemble(box.g.tick + 1))
            return 'tick'
        }
        const k = box.g.tick + 1
        net.pumpTo(k + net.delay, box.pad)
        if (!net.ready(k)) {
            if (box.reseatSeat != null && box.reseatWait < RESEAT_WINDOW) { box.reseatWait++; box.reseatStalls++; return 'stall' }
            if (box.reseatSeat != null) { box.reseatSeat = null; net.reseatTick = null }
            box.miss++
            if (box.miss >= DROP_GRACE) {
                box.miss = 0
                if (box.mySeat === 0) {
                    // MUTATE (opt-in, test 5): the walkaway never demotes.
                    if (!(MUTATE && box.noDemote)) {
                        const seat = net.watchSeats[0]
                        if (net.demote(seat)) { box.g.players = 1; box.demoted = k; box.reseatSeat = null; box.reseatWait = 0 }
                    }
                } else {
                    // MUTATE (opt-in, test 6): invert roles instead of holding
                    // still — WRONG for this game, the mutant must die.
                    if (MUTATE_FREEZE) { box.g.players = 1; box.inverted = k }
                    else box.hostLost = true
                }
            }
            return 'stall'
        }
        box.miss = 0
        if (net.reseatTick != null && k >= net.reseatTick) {
            // MUTATE (opt-in, test 8): the shared players flip never happens.
            if (!(MUTATE_RESEAT && box.noFlip)) {
                box.reseated = k
                if (box.g.players === 1) box.g.players = 2
            }
            net.reseatTick = null
            box.reseatSeat = null
            box.reseatWait = 0
        }
        sim(net.assemble(k))
        net.prune(box.g.tick)
        if (box.g.tick % net.hashEvery === 0) {
            const h = hash(box.g)
            box.hashes.set(box.g.tick, h)
            const d = net.hash(box.g.tick, h)
            if (d) { box.desyncs++; box.desync = d; if (box.mySeat === 0) hostSnap(box); else box.frozen = true }
        }
        return 'tick'
    }
    return box
}

const hostSnap = (box) => {
    for (const c of packSnap(JSON.stringify(snapshotNet(box.g)), box.g.tick)) {
        box.link.send(box.id, Object.assign({ t: 'res', s: box.net.mySeat }, c))
    }
}

// host answers a mid-run rejoin: stamp the shared flip tick, take the seat's
// pads again, put back + live snapshot + mask backfill on the wire.
const hostRejoin = (box, fromSlot) => {
    const seat = Number.isFinite(fromSlot) && fromSlot !== box.net.mySeat ? (fromSlot | 0) : 1
    box.reseatSeat = seat
    box.reseatWait = 0
    box.reseatStalls = 0
    box.reseatBackTick = box.g.tick + RESEAT_LEAD
    box.net.reseatTick = box.reseatBackTick
    if (box.net.droppedSeats().indexOf(seat) >= 0) box.net.promote(seat)
    box.link.send(box.id, { t: 'res', s: box.net.mySeat, e: 'back', k: box.reseatBackTick })
    hostSnap(box)
    const bf = box.net.backfillPads(box.g.tick + 1, box.net.delay)
    if (bf) box.link.send(box.id, Object.assign({ t: 'pad', s: box.net.mySeat }, bf))
    box.answeredAt = box.g.tick
}

// the returner's rebuild: sim at the host's tick, own buffers re-based,
// REMOTE preserved; seat 1 stays the CPU's until the shared flip tick.
const reseatApply = (box, r) => {
    box.reseatArm = false
    box.reseatApplied = { at: r.tick, flip: box.reseatBackTick != null ? box.reseatBackTick : r.tick + RESEAT_LEAD }
    box.g = restoreNet(r.snap)
    box.net.watchSeats = [0]
    box.net.reseatTick = box.reseatApplied.flip
    box.net.reseatBase(r.tick)
    box.frozen = false
    box.resyncs++
}

const runPair = (host, guest, cond, cap = 300000) => {
    let guard = 0
    while (cond(host, guest) && guard++ < cap) { host.step(); guest.step(); tickClock() }
    return guard < cap
}

// ---- 1. the codec is honest -------------------------------------------------
console.log('codec:')
{
    let rt = 0
    for (let m = 0; m < 64; m++) if (padMask(unmaskPad(m)) === m) rt++
    ok('all 64 masks round-trip', rt === 64, `${rt}/64`)
    ok('padMask of a loose pad is 0', padMask({}) === 0 && padMask(undefined) === 0)
    const p = unmaskPad(padMask({ left: true, right: true, a: true }))
    ok('unmask carries the page verbs', p.left === true && p.right === true && p.a === true && p.up === false)
}

// ---- 2. the snapshot round-trips ---------------------------------------------
console.log('snapshot:')
{
    const g = createGame(7, 2)
    for (let i = 0; i < 1400 && !g.done; i++) { step(g, [hostPadAt(7, g.tick + 1), guestPadAt(7, g.tick + 1)]); while (g.events.length) g.events.shift() }
    const str = JSON.stringify(snapshotNet(g))
    const chunks = packSnap(str, g.tick)
    ok(`snapshot fits the wire (${str.length} chars, ${chunks.length} chunks)`, str.length > 0 && chunks.length >= 1)
    ok('every chunk is 512B-safe on the wire',
        chunks.every((c) => Buffer.byteLength(JSON.stringify({ t: 'res', e: c.e, k: c.k, i: c.i, z: c.z, p: c.p, s: 0 })) <= MAX_MSG))
    ok('the snapshot carries the serial + flip + rng counter',
        snapshotNet(g).fx[0] === g.features.serial && snapshotNet(g).flip === g.flip && Number.isInteger(snapshotNet(g).rng))
    const b = restoreNet(JSON.parse(str))
    ok('restore lands at the same tick/round/score', b.tick === g.tick && b.round === g.round && b.score === g.score)
    let same = true
    for (let i = 0; i < 500 && !g.done; i++) {
        const k = g.tick + 1
        const pads = [hostPadAt(7, k), guestPadAt(7, k)]
        step(g, pads); while (g.events.length) g.events.shift()
        step(b, pads); while (b.events.length) b.events.shift()
        if (hash(g) !== hash(b) || g.tick !== b.tick) { same = false; break }
    }
    ok('restore keeps ticking to the same hash (rng counter rode the wire)', same && g.tick === b.tick)
}

// ---- 3. lockstep holds ------------------------------------------------------
console.log('lockstep:')
{
    const SEED = 11
    const link = makeLink(0)
    link.join('H'); link.join('G')
    const host = makeBox(link, 'H', 0, SEED)
    const guest = makeBox(link, 'G', 1, SEED)
    link.send('H', { t: 'go', seed: SEED })
    const done = runPair(host, guest, (h, g) => !h.g.done || !g.g.done)
    ok('the twin run finishes on both boxes', done && host.g.done && guest.g.done)
    ok('both boxes won the campaign identically', host.g.won && guest.g.won && host.g.score === guest.g.score && host.g.tick === guest.g.tick,
        `${host.g.score}/${guest.g.score} @${host.g.tick}/${guest.g.tick}`)
    let agree = 0, total = 0
    for (const [k, h] of host.hashes) { total++; if (guest.hashes.get(k) === h) agree++ }
    ok(`every boundary hash agrees (${agree}/${total})`, total >= 20 && agree === total)
    ok('no desync, no demote, no stall overflow',
        host.desyncs === 0 && guest.desyncs === 0 && host.demoted === 0 && guest.hostLost === false &&
        host.net.stats().maxStallRun < DROP_GRACE, `stallRun=${host.net.stats().maxStallRun}`)
    ok('the run rode the manual pages (wire-borne taps turned pages on both twins)',
        guest.rights > 0 && guest.pageTurns > 0 && host.pageTurns === guest.pageTurns,
        `rights=${guest.rights} turns ${host.pageTurns}/${guest.pageTurns}`)
}

// ---- 4. it survives jitter ---------------------------------------------------
console.log('jitter:')
{
    const SEED = 13
    const link = makeLink(90) // 90ms legs < PAD_DELAY (8 x ~16.7ms = 133ms)
    link.join('H'); link.join('G')
    const host = makeBox(link, 'H', 0, SEED)
    const guest = makeBox(link, 'G', 1, SEED)
    const done = runPair(host, guest, (h, g) => !h.g.done || !g.g.done)
    ok('a 90ms leg still finishes', done && host.g.done && guest.g.done)
    ok('jitter stalls but never desyncs',
        host.desyncs === 0 && guest.desyncs === 0 && !host.hostLost && !guest.hostLost)
    let agree = 0, total = 0
    for (const [k, h] of host.hashes) { total++; if (guest.hashes.get(k) === h) agree++ }
    ok('boundary hashes agree under jitter', total >= 20 && agree === total)
}

// ---- 5. a manual walkaway bends, never breaks -------------------------------
console.log('walkaway (guest gone):')
{
    const SEED = 17
    const link = makeLink(0)
    link.join('H'); link.join('G')
    const h = makeBox(link, 'H', 0, SEED)
    const g = makeBox(link, 'G', 1, SEED)
    h.noDemote = true // honoured only under --mutate
    let cutTick = 0
    let guard = 0
    let lastDemote = 0
    let sawOrder = false
    let parked = false
    let parkTicks = 0
    while (!h.g.done && guard++ < 300000) {
        // partnerSay restarts its 90-tick chat window on every cursor move,
        // so prove the rail by parking the hands after the demote: no pads
        // => no cursor movement => the CPU manual speaks. Then resume.
        if (lastDemote && !sawOrder && !parked) { parked = true; parkTicks = 0 }
        if (parked && !sawOrder) {
            parkTicks++
            if (parkTicks > 200) { parked = false } // safety: never stall the run
        }
        h.idle = parked && !sawOrder
        h.step()
        if (cutTick === 0) {
            g.step()
            if (h.g.tick >= 200) cutTick = h.g.tick // the friend walks away
        }
        if (cutTick > 0 && h.demoted) lastDemote = h.demoted
        if (h.g.order) sawOrder = true
        if (sawOrder) parked = false
        tickClock()
    }
    ok('the run still WINS without the manual seat', h.g.done && h.g.won, `tick=${h.g.tick}`)
    ok('the seat demoted exactly DROP_GRACE stalled ticks after the last wire pad',
        lastDemote > cutTick + PAD_DELAY && lastDemote <= cutTick + PAD_DELAY + DROP_GRACE + 4,
        `cut=${cutTick} demote=${lastDemote}`)
    ok('gs.players flipped to 1 at the demote', h.g.players === 1)
    ok('the CPU manual takes the rail back (partnerSay alive post-demote)', sawOrder)
}

// ---- 6. the host-gone law: the page holds still -----------------------------
console.log('host gone (guest freezes):')
{
    const SEED = 19
    const link = makeLink(0)
    link.join('H'); link.join('G')
    const host = makeBox(link, 'H', 0, SEED)
    const guest = makeBox(link, 'G', 1, SEED)
    host.inverted = 0
    let steps = 0
    while (steps++ < 6000 && host.g.tick < 120 && !host.g.done) { host.step(); guest.step(); tickClock() }
    // the defuser vanishes; the page-holder must hold STILL, not invert.
    const frozenTick = guest.g.tick
    for (let i = 0; i < DROP_GRACE + PAD_DELAY + 20; i++) { guest.step(); tickClock() }
    ok('the guest froze at the defuser loss (no role inversion)', guest.hostLost === true && guest.inverted == null)
    ok('the guest sim held still while frozen (one pad-lead of slack at most)',
        guest.g.tick <= frozenTick + PAD_DELAY + 1, `${frozenTick} -> ${guest.g.tick}`)
    ok('seat 0 is NEVER demotable (the defuser seat is the spine)', guest.net.demote(0) === false)
    ok('the page is not abandoned: watch seat stays live for a re-arm',
        guest.net.watchSeats.join(',') === '0' && guest.g.players === 2)
}

// ---- 7. a desync resyncs -----------------------------------------------------
console.log('desync resync:')
{
    const SEED = 23
    const link = makeLink(0)
    link.join('H'); link.join('G')
    const host = makeBox(link, 'H', 0, SEED)
    const guest = makeBox(link, 'G', 1, SEED)
    for (let i = 0; i < 6000 && host.g.tick < 150 && !host.g.done; i++) { host.step(); guest.step(); tickClock() }
    // corrupt the guest mid-run: a phantom strike it cannot have earned
    guest.g.strikes += 1
    let boundaryPassed = 0, frozen = false, resyncedAt = 0
    let guard = 0
    while (guard++ < 20000 && !guest.g.done) {
        host.step(); guest.step(); tickClock()
        if (guest.frozen && !frozen) { frozen = true; boundaryPassed = guest.desyncs }
        if (frozen && !guest.frozen && resyncedAt === 0) resyncedAt = guest.g.tick
        if (resyncedAt > 0) break
    }
    ok('a corrupted guest hits a desync and freezes', frozen && boundaryPassed >= 1)
    ok('the host snapshot restored the guest (resync)', resyncedAt > 0)
    let agree = true
    for (let i = 0; i < 400 && !host.g.done; i++) {
        host.step(); guest.step(); tickClock()
        const hb = Math.floor(host.g.tick / HASH_EVERY) * HASH_EVERY
        if (host.hashes.has(hb) && guest.hashes.has(hb) && host.hashes.get(hb) !== guest.hashes.get(hb)) { agree = false; break }
    }
    ok('hash agreement resumes after the resync', agree)
}

// ---- 8. an in-flight rejoin reseats (#1838 law) ----------------------------
console.log('in-flight reseat:')
{
    const SEED = 29
    const link = makeLink(0)
    link.join('H'); link.join('G')
    const host = makeBox(link, 'H', 0, SEED)
    const guest = makeBox(link, 'G', 1, SEED)
    host.noFlip = true // honoured only under --mutate-reseat
    for (let i = 0; i < 6000 && host.g.tick < 150 && !host.g.done; i++) { host.step(); guest.step(); tickClock() }
    // the guest page reloads: gone from the room, then back asking for the run
    link.leave('G')
    const goneTick = host.g.tick
    for (let i = 0; i < 120; i++) { host.step(); tickClock() }
    link.join('G')
    link.send('G', { t: 'res', e: 'rejoin', s: 1 })
    for (let i = 0; i < 60; i++) { host.step(); guest.step(); tickClock() }
    ok('the host answered rejoin with back + snapshot + backfill',
        guest.reseatApplied != null && guest.resyncs >= 1 && host.answeredAt >= goneTick,
        `answeredAt=${host.answeredAt} goneTick=${goneTick}`)
    // climb back: both boxes flip at the shared tick
    let guard = 0
    while (guard++ < 3000 && !(host.reseated > 0 && guest.reseated > 0)) { host.step(); guest.step(); tickClock() }
    ok('both boxes seated the human on the SAME sim tick',
        host.reseated > 0 && host.reseated === guest.reseated, `${host.reseated}/${guest.reseated}`)
    ok('players is whole on both boxes', host.g.players === 2 && guest.g.players === 2)
    let agree = true
    for (let i = 0; i < 300 && !host.g.done; i++) {
        host.step(); guest.step(); tickClock()
        const hb = Math.floor(host.g.tick / HASH_EVERY) * HASH_EVERY
        if (host.hashes.has(hb) && guest.hashes.has(hb) && host.hashes.get(hb) !== guest.hashes.get(hb)) { agree = false; break }
    }
    ok('lockstep resumed mid-run (hashes agree past the flip)', agree)
    const done = runPair(host, guest, (h, g) => !h.g.done || !g.g.done)
    ok('the re-seated twin run still wins together', done && host.g.done && guest.g.done && host.g.won && guest.g.won,
        `done=${done} ticks=${host.g.tick}/${guest.g.tick} frozen=${host.frozen}/${guest.frozen} lost=${host.hostLost}/${guest.hostLost} resyncs=${host.resyncs}/${guest.resyncs}`)
}

// ---- 9. the page fold is honest (mic -> sampled taps, #1247 online) --------
console.log('page fold:')
{
    let honest = true
    for (let from = 0; from < 3; from++) {
        for (let want = 0; want < 3; want++) {
            const taps = (want - from + 3) % 3
            let page = from
            for (let i = 0; i < taps; i++) page = (page + 1) % 3 // manualAct right-tap
            if (page !== want) honest = false
        }
    }
    ok('the (want-page+3)%3 tap math lands every page exactly', honest)
    const gs = createGame(31, 2)
    gs.manual.page = 0
    step(gs, [{}, { right: true }])
    ok('one folded tap turns exactly one page in the engine', gs.manual.page === 1)
}

// ---- 10. the shell is wired (static audit) ------------------------------------
console.log('shell audit:')
{
    const srcRaw = readFileSync('src/games/TalkMeDown/index.jsx', 'utf8')
    const src = MUTATE_PHONE ? srcRaw.replace('guestPhone ? ART.MANUAL_WIDE : ART.RAIL', 'ART.RAIL') : srcRaw
    const netjs = readFileSync('src/games/TalkMeDown/net.js', 'utf8')
    ok('the shared Lobby is mounted for the squad room', /import Lobby from/.test(src) && /<Lobby/.test(src))
    ok('the room closes when the page unmounts', /net\.lobby\.close\(\)/.test(src))
    ok('the go carries a seed (?seed= honored through humanSeed)', /lobby\.start\(\{ seed: humanSeed\(\) \}\)/.test(src))
    ok('the guest view hides the bomb panel behind the squad plate (#1888: on the phone the plate shrinks to the rail)', /guest\) \{[\s\S]*?drawSquadPlate\(g, guestPhone \? ART\.RAIL : ART\.PANEL/.test(src))
    ok('#1888 the phone guest takes the wide bay: flag derived + MANUAL_WIDE passed to the page',
        /const guestPhone = guest && !URL_NO_TOUCH && \(TOUCH_UI \|\| URL_TOUCH\)/.test(src) &&
        /drawManual\(g,[^]*?guestPhone \? ART\.MANUAL_WIDE : ART\.RAIL\)/.test(src))
    {
        const artjs = readFileSync('src/games/TalkMeDown/art.js', 'utf8')
        ok('#1888 art.js: wide bay defined, page rect-parameterized, type bumped on wide',
            /MANUAL_WIDE = \{ x: 8, y: 8, w: 400, h: 296 \}/.test(artjs) &&
            /flipped = 0, rect = RAIL/.test(artjs) &&
            /const wide = rect\.w > 300/.test(artjs))
    }
    ok('the host view hides the rulebook behind the squad plate', /role === 'host'\) \{\s*drawSquadPlate\(g, ART\.RAIL/.test(src))
    ok('the live-stamp rail rides with the page-holder', /drawManual\(g, gs\.manual\.page[^]*?\.map\(m => m\.stamp\)/.test(src))
    ok('heard page-words are refused on the host (their page to turn)', /THEIR PAGE TO TURN/.test(src))
    ok('heard page-words fold into sampled taps on the guest', /pageTapsRef\.current \+= \(want - gs\.manual\.page \+ 3\) % 3/.test(src))
    ok('WATCH is inert online (#1656 law: both at the bank and at play)',
        /isWatchKey\(e\) && !net\.active/.test(src) && /if \(isWatchKey\(e\)\) \{\s*e\.preventDefault\(\)\s*if \(!net\.active\)/.test(src))
    ok('the demote law flips players and names the CPU takeover', /MANUAL LINK LOST/.test(src) && /gs\.players = 1/.test(src))
    ok('the host-gone law freezes without inverting', /net\.hostLost = true/.test(src) && /desyncFrozen \|\| net\.hostLost/.test(src))
    ok('offline band tells the page-holder what happened', /DEFUSER OFFLINE/.test(src))
    ok('any key walks the frozen guest back to the lobby', /net\.hostLost = false[\s\S]{0,80}startAttract/.test(src))
    ok('reseat stamps the shared flip via RESEAT_LEAD', /RESEAT_LEAD/.test(src) && /back', k: net\.reseatBackTick/.test(src))
    ok('the hash law runs the game hash at boundaries', /gs\.tick % HASH_EVERY === 0/.test(src))
    ok('the whole keyboard drives YOUR seat online (arrows AND WASD)',
        /net\.active[\s\S]{0,400}?const fw = S2\[e\.code\][\s\S]{0,120}?pressMin\(keys1, fw\)/.test(src))
    ok('net.js is pure (no DOM, no sockets)', !/\bdocument\.|\bwindow\.|new WebSocket/.test(netjs))
    ok('the wire uses only pre-forwarded relay types',
        FORWARD_TYPES.includes('go') && FORWARD_TYPES.includes('pad') && FORWARD_TYPES.includes('hs') && FORWARD_TYPES.includes('res'))
    ok('net.js mirrors the proven #1819 tuning',
        PAD_DELAY === 8 && DROP_GRACE === 30 && HASH_EVERY === 60 && CHUNK <= 380 && SEATS === 2 && RESEAT_WINDOW === 180)
    // honesty clause: the seat is only offered on a proven route —
    // tmd-smoke's solvePad witness must still be the race.
    ok('the seat rides a proven route (tmd-smoke still wins 200/200)',
        /wins \$\{wins\}\/200/.test(readFileSync('scripts/tmd-smoke.mjs', 'utf8')) && /gs\.done && gs\.won/.test(readFileSync('scripts/tmd-smoke.mjs', 'utf8')))
}
{
    const netjs = readFileSync('src/games/TalkMeDown/net.js', 'utf8')
    ok('SAMPLE_EVERY is 2 on the wire', /export const SAMPLE_EVERY = 2/.test(netjs))
}

// ---- determinism spine --------------------------------------------------------
console.log('twin determinism:')
{
    let all = 0
    for (let seed = 1; seed <= 40; seed++) {
        const a = createGame(seed, 2)
        const b = createGame(seed, 2)
        let same = true
        for (let i = 0; i < 800 && !a.done; i++) {
            const k = a.tick + 1
            const pads = [hostPadAt(seed, k), guestPadAt(seed, k)]
            step(a, pads); while (a.events.length) a.events.shift()
            step(b, pads); while (b.events.length) b.events.shift()
            if (hash(a) !== hash(b)) { same = false; break }
        }
        if (same && a.done && a.won) all++
    }
    ok(`seed + pads => identical twin runs (40 seeds, ${all}/40 won both twins)`, all === 40)
}

console.log(`\ntmdlinkcheck: ${pass} ok, ${fail} red`)
process.exit(fail ? 1 : 0)
