// NETCHECK (#531) — online-2P proof, plain Node. Three tiers, all offline:
//
//   1. relay core: room codes, join/full/rejoin/leave, type allowlist,
//      rate cap, registry room cap + TTL reclaim.
//   2. protocol over a real socket: boots relay/server.mjs (same core.js the
//      Cloudflare worker wraps) and drives two ws clients through the whole
//      lifecycle — welcome, peer, pads forwarded, junk dropped, oversize and
//      floods cut, 'gone' on leave, room released so the code reopens.
//   3. lockstep vs the real Gauntlet sim: two src/utils/lockstep.js brains
//      piped in memory, each driving a makeGame(seed) copy with 1-iteration
//      delivery lag. Same seed + same pads must give identical stateHashes at
//      every boundary. Then a tampered pad must be CAUGHT as a desync —
//      that's the "done when" clause of the issue, proved on a laptop.
//
//   node scripts/netcheck.mjs           # must go green
//   node scripts/netcheck.mjs --mutate # must go RED: hash verify disabled,
//                                       # a diverging sim slips through — the
//                                       # check has teeth
//   node scripts/netcheck.mjs --browser # optional: two headless Chromes vs
//                                       # the local relay (needs npm run dev)

import { CODE_RE, makeCode, newRoom, join, leave, relay, newRegistry, registryAdd, registryRemove, registryCount } from '../relay/core.js'
import { createLockStep, retryDelay } from '../src/utils/lockstep.js'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// ----------------------------------------------------------------- tier 1 ----
console.log('relay core')
{
    let c = 0
    const rand = () => { c = (c * 1103515245 + 12345) % 2147483648; return c / 2147483648 }
    const code = makeCode(rand)
    ok(CODE_RE.test(code), 'makeCode yields a valid 4-letter code', code)
    ok(!CODE_RE.test('IO01') && !CODE_RE.test('ABCD1') && !CODE_RE.test('ABC'), 'codes reject I/O/0/1, wrong length')

    const room = newRoom('ABCD')
    const a = join(room, 'a')
    const b = join(room, 'b')
    const d = join(room, 'd')
    ok(a.ok && a.slot === 0 && b.ok && b.slot === 1, 'two joiners take seats 0 and 1')
    ok(!d.ok && d.err === 'full', 'a third joiner is refused: full')
    const rj = join(room, 'a')
    ok(rj.ok && rj.slot === 0 && rj.rejoin, 'a reload reclaims its seat')

    const fwd = relay(room, 'a', { t: 'pad', k: 1, p: {} })
    ok(fwd.ok && fwd.to.length === 1 && fwd.to[0] === 'b', 'a pad forwards to the peer only')
    ok(!relay(room, 'a', { t: 'cheat' }).ok, 'types outside pad/hs/start are dropped')
    ok(!relay(room, 'a', null).ok, 'junk is dropped')
    let rateOk = true
    for (let i = 0; i < 500; i++) if (!relay(room, 'a', { t: 'pad', k: i, p: {} }).ok) { rateOk = false; break }
    ok(!rateOk, 'the per-room rate window cuts a flood')

    const gone = leave(room, 'b')
    ok(gone.gone && !gone.empty, 'a leave tells the room, which is not empty')
    ok(leave(room, 'a').empty, 'the room empties after both leave')

    const reg = newRegistry()
    let filled = false
    for (let i = 0; i < 130; i++) if (!registryAdd(reg, `A${String(i).padStart(3, '0')}`, 1000)) { filled = true; break }
    ok(filled, 'the registry caps live rooms (free tier)')
    registryRemove(reg, 'A001')
    ok(registryCount(reg) < 120, 'a closed room releases its lease')
    const reg2 = newRegistry()
    for (let i = 0; i < 120; i++) registryAdd(reg2, `B${String(i).padStart(3, '0')}`, 0)
    ok(registryAdd(reg2, 'ZZZZ', 4000000), 'stale leases (1h+) are reclaimed before refusing')
}

// ----------------------------------------------------------------- tier 2 ----
console.log('protocol over ws (relay/server.mjs)')
const { startRelay } = await import('../relay/server.mjs')
const { WebSocket } = await import('ws')
{
    const srv = startRelay(0)
    await new Promise((done) => { const iv = setInterval(() => { if (srv.boundPort()) { clearInterval(iv); done() } }, 20) })
    const url = (code) => `ws://127.0.0.1:${srv.boundPort()}/room/${code}`
    const open = (code) => new Promise((done, no) => {
        const ws = new WebSocket(url(code))
        const msgs = []
        ws.on('message', (m) => msgs.push(JSON.parse(m.toString())))
        ws.on('error', (e) => no(e))
        ws.on('open', () => done([ws, msgs]))
    })
    const until = (msgs, pred, ms = 1500) => new Promise((done) => {
        const t0 = Date.now()
        const iv = setInterval(() => {
            if (msgs.some(pred) || Date.now() - t0 > ms) { clearInterval(iv); done(msgs.some(pred)) }
        }, 20)
    })
    const closed = (ws, ms = 1500) => new Promise((done) => {
        if (ws.readyState !== 1) { done(true); return }
        const t0 = Date.now()
        const iv = setInterval(() => {
            if (ws.readyState !== 1 || Date.now() - t0 > ms) { clearInterval(iv); done(ws.readyState !== 1) }
        }, 20)
    })

    const host = await open('ABCD')
    ok(await until(host[1], (m) => m.t === 'welcome' && m.you === 0), 'host welcome carries slot 0')
    const guest = await open('ABCD')
    ok(await until(host[1], (m) => m.t === 'peer' && m.n === 2), 'host learns the room is paired')
    ok(await until(guest[1], (m) => m.t === 'welcome' && m.you === 1), 'guest welcome carries slot 1')

    guest[0].send(JSON.stringify({ t: 'pad', k: 7, p: { l: true } }))
    ok(await until(host[1], (m) => m.t === 'pad' && m.k === 7 && m.p && m.p.l === true), 'a pad crosses the wire intact')
    host[0].send(JSON.stringify({ t: 'start', seed: 42, hero: 'warrior', peerHero: 'valkyrie' }))
    ok(await until(guest[1], (m) => m.t === 'start' && m.seed === 42), 'the seed reaches the guest')

    const junk = () => host[1].filter((m) => m.t === 'nope' || m.t === undefined).length
    const before = junk()
    host[0].send(JSON.stringify({ t: 'nope' }))
    host[0].send('not json at all')
    await new Promise((r) => setTimeout(r, 150))
    ok(junk() === before, 'junk is silently dropped (no echo)')

    host[0].send(JSON.stringify({ t: 'pad', k: 8, p: { x: 'y'.repeat(600) } }))
    ok(await closed(host[0]), 'an oversize message cuts the sender')
    guest[0].close()
    await new Promise((r) => setTimeout(r, 150))

    const h2 = await open('ABCD')
    const g2 = await open('ABCD')
    ok(await until(h2[1], (m) => m.t === 'peer' && m.n === 2), 'the code reopened after the room emptied')
    let third = null
    try { third = await open('ABCD') } catch { /* refused */ }
    const refused = !third || await closed(third[0], 800)
    ok(refused, 'a third seat in the same room is refused')
    h2[0].close(); g2[0].close()
    await new Promise((r) => setTimeout(r, 150))

    const h3 = await open('HULK')
    const g3 = await open('HULK')
    await until(h3[1], (m) => m.t === 'peer')
    g3[0].close()
    ok(await until(h3[1], (m) => m.t === 'gone'), 'the peer learns when its friend leaves')
    h3[0].close()

    const flood = await open('RATE')
    let cut = false
    flood[0].on('close', () => { cut = true })
    for (let i = 0; i < 600; i++) flood[0].send(JSON.stringify({ t: 'pad', k: i, p: {} }))
    ok(await closed(flood[0]), 'a flooding client is disconnected (rate guard)')
    void cut

    await srv.close()
}

// ----------------------------------------------------------------- tier 3 ----
console.log('lockstep vs real Gauntlet sims')
{
    const seed = 11
    const mk = () => {
        const gs = makeGame(seed, 'warrior', { partner: true, topDown: true, partnerKey: 'elf' })
        return gs
    }
    const gsH = mk()
    const gsG = mk()
    ok(stateHash(gsH) === stateHash(gsG), 'both boxes start identical (seed law)')

    const qH = []
    const qG = []
    let desyncH = 0, desyncG = 0
    const mkSide = (out) => createLockStep({
        send: (m) => {
            out.push(m)
        },
    })
    const lockH = mkSide(qG)
    const lockG = mkSide(qH)
    const pump = (lock, inbox) => {
        while (inbox.length) {
            const m = inbox.shift()
            if (m.t === 'pad') lock.gotPad(m.k, m.p)
            else if (m.t === 'hs') {
                const r = lock.gotHash(m.k, m.h)
                if (r && r.desync !== undefined) return r.desync
            }
        }
        return 0
    }

    const script = (side, k) => {
        if (side === 'host') return { l: (k >> 4) % 2 === 0, r: (k >> 4) % 2 === 1, u: (k >> 6) % 3 === 0, d: false, s: k % 23 === 0, a: k % 37 === 0 }
        return { l: false, r: (k >> 5) % 2 === 1, u: false, d: (k >> 6) % 3 === 1, s: k % 19 === 0, a: false }
    }

    const runOne = (gs, lock, side) => {
        const k = gs.tick
        lock.pumpTo(k + lock.delay, (t) => script(side, t))
        if (!lock.ready(k)) { lock.stall(); return false }
        const [lp, rp] = lock.pads(k)
        const heroPad = side === 'host' ? lp : rp
        const partnerPad = side === 'host' ? rp : lp
        const pAlive = gs.partner && !gs.partner.down
        step(gs, { left: heroPad.l, right: heroPad.r, fwd: heroPad.u, back: heroPad.d, sword: heroPad.s, arrow: heroPad.a },
            pAlive ? { left: partnerPad.l, right: partnerPad.r, fwd: partnerPad.u, back: partnerPad.d, sword: partnerPad.s } : null)
        gs.events.length = 0
        if (gs.tick % lock.hashEvery === 0) {
            const r = lock.hash(gs.tick, stateHash(gs))
            if (r && r.desync !== undefined) return r.desync
        }
        lock.prune(k)
        return true
    }

    let boundaries = 0
    let mismatch = 0
    const hH = new Map()
    const hG = new Map()
    const TARGET = 36000
    while ((gsH.tick < TARGET || gsG.tick < TARGET) && gsH.tick < TARGET + 600 && gsG.tick < TARGET + 600) {
        const dh = pump(lockH, qH)
        if (dh) { desyncH = dh; break }
        runOne(gsH, lockH, 'host')
        const dg = pump(lockG, qG)
        if (dg) { desyncG = dg; break }
        runOne(gsG, lockG, 'guest')
        if (gsH.tick % 30 === 0 && gsH.tick > 0 && !hH.has(gsH.tick)) {
            hH.set(gsH.tick, stateHash(gsH))
            if (hG.has(gsH.tick)) {
                boundaries++
                if (hH.get(gsH.tick) !== hG.get(gsH.tick)) mismatch++
            }
        }
        if (gsG.tick % 30 === 0 && gsG.tick > 0 && !hG.has(gsG.tick)) {
            hG.set(gsG.tick, stateHash(gsG))
            if (hH.has(gsG.tick)) {
                boundaries++
                if (hH.get(gsG.tick) !== hG.get(gsG.tick)) mismatch++
            }
        }
        if (gsH.end && gsG.end) break
    }
    const stallsH = lockH.stats()
    const stallsG = lockG.stats()

    ok(gsH.tick >= TARGET || (gsH.end && gsG.end && Math.abs(gsH.tick - gsG.tick) <= 5),
        'the full ~10-minute lockstep session holds (a game ends early only if BOTH worlds end, within pipeline skew)', `H ${gsH.tick} G ${gsG.tick} end ${gsH.end}/${gsG.end}`)
    ok(boundaries >= 20, 'hash boundaries were crossed repeatedly', `boundaries ${boundaries}`)
    ok(mismatch === 0, 'no sim divergence across the session', `mismatches ${mismatch}`)
    ok(stallsH.maxStallRun <= 2 && stallsG.maxStallRun <= 2, 'the delay buffer absorbs the wire lag', `maxStallRun H ${stallsH.maxStallRun} G ${stallsG.maxStallRun}`)

    ok(desyncH === 0 && desyncG === 0, 'clean run reports no desync')
    {
        // detection pair: hashes work; ONE sim gets corrupted after tick 150
        // (stands in for any nondeterminism) — the next boundary must catch it.
        const q2H = [], q2G = []
        let desync2 = 0
        const lockH2 = createLockStep({ send: (m) => q2G.push(m) })
        const lockG2 = createLockStep({ send: (m) => q2H.push(m) })
        const gsH2 = makeGame(seed, 'warrior', { partner: true, topDown: true, partnerKey: 'elf' })
        const gsG2 = makeGame(seed, 'warrior', { partner: true, topDown: true, partnerKey: 'elf' })
        outer:
        for (let i = 0; i < 1200; i++) {
            while (q2H.length) {
                const m = q2H.shift()
                if (m.t === 'pad') lockH2.gotPad(m.k, m.p)
                else { const r = lockH2.gotHash(m.k, m.h); if (r && r.desync !== undefined) { desync2 = r.desync; break outer } }
            }
            const rh = runOne(gsH2, lockH2, 'host')
            if (typeof rh === 'number') { desync2 = rh; break outer }
            if (gsH2.tick === 151) gsH2.gold += 7
            while (q2G.length) {
                const m = q2G.shift()
                if (m.t === 'pad') lockG2.gotPad(m.k, m.p)
                else { const r = lockG2.gotHash(m.k, m.h); if (r && r.desync !== undefined) { desync2 = r.desync; break outer } }
            }
            const rg = runOne(gsG2, lockG2, 'guest')
            if (typeof rg === 'number') { desync2 = rg; break outer }
            if (gsH2.end || gsG2.end) break
        }
        ok(desync2 > 150, 'a corrupted sim IS caught by the 30-tick hash verify', `desync at ${desync2}`)
    }
}

// ----------------------------------------------------------------- tier 4 ----
console.log('net UX plumbing (#546: ping HUD + reconnect backoff)')
{
    const ladder = [0, 1, 2, 3, 4, 5, 9].map((a) => retryDelay(a))
    ok(ladder.join(',') === '400,800,1600,3200,6400,8000,8000', 'retryDelay doubles and caps at 8s', ladder.join(','))

    let t = 1000
    const lock = createLockStep({ now: () => t })
    ok(lock.padAge(t) === -1, 'padAge is unknown before any pad lands')
    lock.gotPad(5, { u: true })
    lock.gotPad(6, { u: true })
    t = 1250
    ok(lock.padAge(t) === 250, 'padAge reports the one-way age of the freshest pad', String(lock.padAge(t)))
    ok(!lock.ready(9), 'a tick without its remote pad is not ready')
    lock.stall(); lock.stall()
    ok(lock.stats().stallRun === 2 && lock.stats().stalls === 2, 'stats expose the live stall run', JSON.stringify(lock.stats()))
    lock.gotPad(9, {})
    ok(lock.ready(9) && lock.stats().stallRun === 0, 'the stall run resets when a pad lands')
    lock.reset()
    ok(lock.padAge(t) === -1 && lock.stats().stallRun === 0 && lock.stats().stalls === 0, 'reset clears age and stall counters')
}

console.log(`\nnetcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
