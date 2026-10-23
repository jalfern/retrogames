// blobcheck — BLOB BATTLE harness (#840). Node-only: boots the sim, audits the
// chain/garbage/counter rules tick-for-tick, proves determinism (seed + pad
// streams => identical hashes, the slotcheck law), pairs two full online boxes
// over an in-memory pipe (the lockstep law of #531 on the room layer's pad
// wire), and proves a match can be WON. Proven to fail by mutant (see README).

import {
    newGame, step, stateHash, findGroups, idx, COLS, ROWS, GARBAGE, ROUNDS_TO_WIN, POP_FRAMES, winPresentation,
} from '../src/games/BlobBattle/sim.js'
import { makeCpu, choosePlacement } from '../src/games/BlobBattle/planner.js'
import { createLockStep } from '../src/utils/lockstep.js'
import { SEATS, PAD_DELAY, HASH_EVERY, toWire, assemblePads, randomCode, boardFor } from '../src/games/BlobBattle/net.js'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

console.log('boot')
{
    const s = newGame(1, 2)
    ok(s.tick === 0 && !s.over, 'fresh match at tick 0')
    ok(!!s.wells[0].cur && !!s.wells[1].cur, 'both wells spawn a pair')
    ok(s.wells[0].cur.x === 2 && s.wells[0].cur.y === 0, 'pair spawns top-center (col 2)')
    for (let t = 0; t < 120; t++) step(s, [{}, {}])
    ok(s.tick === 120 && !s.over, 'idle ticks advance without error')
}

console.log('rules — groups, chains, attacks, counter, garbage')
{
    // 3 connected never pops, 4 does
    const s = newGame(5, 1)
    const w = s.wells[0]
    w.board.fill(0)
    w.board[idx(11, 0)] = 1; w.board[idx(11, 1)] = 1; w.board[idx(11, 2)] = 1
    ok(findGroups(w.board).length === 0, 'three in a row does not pop')
    w.board[idx(10, 2)] = 1
    ok(findGroups(w.board).length === 1, 'an L of four pops')
    const g = findGroups(w.board)[0]
    ok(g.cells.length === 4 && g.color === 1, 'group carries its color and size')
    w.board[idx(10, 1)] = 2
    ok(findGroups(w.board).find((x) => x.color === 2) === undefined, 'a lone other color is not a group')
}
{
    // genuine 2-chain: pop 6, collapse aligns 4 more -> chain 2 -> send 1 row
    const s = newGame(99, 1)
    const w = s.wells[0], rival = s.wells[1]
    w.board.fill(0)
    for (let c = 0; c < 3; c++) w.board[idx(11, c)] = 1
    w.board[idx(10, 0)] = 1
    w.board[idx(9, 2)] = 2; w.board[idx(9, 3)] = 2
    w.board[idx(10, 4)] = 2; w.board[idx(10, 5)] = 2
    w.cur = { x: 0, y: 0, rot: 1, c1: 1, c2: 1 }
    const chains = [], sends = []
    for (let t = 0; t < 300; t++) {
        step(s, [{ down: true }])
        while (s.events.length) {
            const e = s.events.shift()
            if (e.t === 'pop' && e.seat === 0) chains.push(e.chain)
            if (e.t === 'send' && e.seat === 0) sends.push(e.rows)
        }
    }
    ok(chains[0] === 1 && chains[1] === 2, 'the collapse re-pops: chain reaches 2')
    ok(sends.length === 1 && sends[0] === 1, 'a 2-chain sends exactly 1 row')
    ok(rival.pending === 1 && rival.holes.length === 1 && rival.holes[0] >= 0 && rival.holes[0] < COLS, 'the row queues against the rival with a legal hole')
}
{
    // big group extra: an eight-pop on chain 1 sends 1 (8/4-1)
    const s = newGame(7, 1)
    const w = s.wells[0], rival = s.wells[1]
    w.board.fill(0)
    for (let c = 0; c < COLS; c++) { w.board[idx(11, c)] = 3 }
    w.board[idx(10, 0)] = 3; w.board[idx(10, 1)] = 3
    w.cur = null
    const sends = []
    step(s, [{}] )
    // lock nothing: seed via the pop path directly — drop a pair into place instead:
    w.cur = { x: 2, y: 0, rot: 0, c1: 3, c2: 3 }
    for (let t = 0; t < 200; t++) {
        step(s, [{ drop: t === 10, down: false }])
        while (s.events.length) { const e = s.events.shift(); if (e.t === 'send' && e.seat === 0) sends.push(e.rows) }
    }
    ok(sends.length >= 1 && sends[0] === 1, 'an eight-orb pop on chain 1 sends one extra row')
    void rival
}
{
    // counter: garbage queued, then a clear -> incoming nullified, own attack sent
    const s = newGame(11, 1)
    const w = s.wells[0]
    w.board.fill(0)
    for (let c = 0; c < COLS; c++) { w.board[idx(11, c)] = GARBAGE; w.board[idx(10, c)] = 2 }
    w.board[idx(10, 2)] = GARBAGE // carve the queue's hole pattern not needed here
    w.board[idx(9, 2)] = 2; w.board[idx(9, 3)] = 2; w.board[idx(10, 3)] = 2
    w.board[idx(10, 2)] = 2
    w.pending = 3
    w.holes = [0, 1, 2]
    w.cur = { x: 2, y: 0, rot: 0, c1: 2, c2: 2 }
    const ev = []
    for (let t = 0; t < 200; t++) {
        step(s, [{ drop: t === 8 }])
        while (s.events.length) { const e = s.events.shift(); if (e.seat === 0 || e.t === 'counter' || e.t === 'garbage') ev.push(e.t + (e.rows !== undefined ? e.rows : '')) }
    }
    ok(ev.some((x) => x === 'counter3'), 'clearing while 3 rows are queued fires COUNTER and wipes them')
    ok(!ev.some((x) => x.startsWith('garbage')), 'countered garbage never lands')
}
{
    // garbage lands when nothing is cleared: stack rises, bottom rows are grey
    const s = newGame(13, 1)
    const w = s.wells[0]
    w.board.fill(0)
    w.board[idx(11, 3)] = 4
    w.pending = 2
    w.holes = [5, 4]
    w.cur = { x: 0, y: 0, rot: 0, c1: 1, c2: 4 }
    let landed = 0
    for (let t = 0; t < 200; t++) {
        step(s, [{ drop: t === 8 }, {}])
        while (s.events.length) { const e = s.events.shift(); if (e.t === 'garbage' && e.seat === 0) landed = e.rows }
        if (landed) break
    }
    ok(landed === 2, 'queued garbage lands after its warning beat')
    ok(w.board[idx(11, 3)] === GARBAGE || w.board[idx(11, 5)] === 0, 'landed rows are grey with a punched hole')
    ok(w.board[idx(11, 3)] === GARBAGE && w.board[idx(9, 3)] === 4, 'the stack rode up on top of the garbage')
}

console.log('match — rounds and a winner')
{
    // seat 0 idles, CPU seat 1 stacks garbage rows into seat 0 until it tops out
    const s = newGame(3, 2)
    const cpu2 = makeCpu(3)
    for (let t = 0; t < 12000 && !s.over; t++) step(s, [{}, cpu2(s.wells[1])])
    ok(s.over && s.winner === 1 && s.wells[1].rounds >= ROUNDS_TO_WIN, 'the CPU wins the match against an idle seat')
}

console.log('determinism — seed + pads => identical hashes')
{
    function run(seed, scriptCpu) {
        const s = newGame(seed, 2)
        const p1 = makeCpu(seed), p2 = scriptCpu
        const hashes = []
        for (let t = 0; t < 2500 && !s.over; t++) {
            step(s, [p1(s.wells[0]), p2(s.wells[1])])
            hashes.push(stateHash(s))
        }
        return { hashes, s }
    }
    const a = run(777, makeCpu(4242))
    const b = run(777, makeCpu(4242))
    ok(a.hashes.length === b.hashes.length && a.hashes.every((h, i) => h === b.hashes[i]), `two identical runs hash-equal for ${a.hashes.length} ticks`)
    const c = run(778, makeCpu(4242))
    ok(!(c.hashes.length === a.hashes.length && c.hashes.every((h, i) => h === a.hashes[i])), 'a different seed diverges')
    // recorded stream replay (slotcheck law)
    const rec = []
    const s = newGame(777, 2)
    const p1 = makeCpu(777)
    const p2rec = makeCpu(4242)
    for (let t = 0; t < a.hashes.length; t++) { const p = p2rec(s.wells[1]); rec.push(toWire(p)); step(s, [p1(s.wells[0]), p]) }
    const hashes2 = []
    const s2 = newGame(777, 2)
    const p1b = makeCpu(777)
    for (let t = 0; t < rec.length; t++) { const p = rec[t]; step(s2, [p1b(s2.wells[0]), { left: p.l, right: p.r, down: p.d, rot: p.a, drop: p.s }]); hashes2.push(stateHash(s2)) }
    ok(hashes2.every((h, i) => h === a.hashes[i]), 'replaying the recorded pad stream reproduces every hash')
}

console.log('theater (#863) — next-pair preview and collapse slide')
{
    const s = newGame(21, 1)
    const w = s.wells[0]
    ok(Array.isArray(w.next) && w.next.length === 2 && w.next.every((c) => c >= 1 && c <= 4), 'the NEXT preview is drawn at game start')
    const pre = [...w.next]
    for (let t = 0; t < 300 && w.phase !== 'fall'; t++) step(s, [{ drop: t === 8 }])
    ok(w.phase === 'fall' && w.cur && w.cur.c1 === pre[0] && w.cur.c2 === pre[1], 'the previewed pair is the pair that spawns')
    ok(Array.isArray(w.next) && w.next.every((c) => c >= 1 && c <= 4), 'a fresh pair is drawn for the preview after the swap')
    const sig = (seed) => {
        const s2 = newGame(seed, 1)
        const out = []
        for (let t = 0; t < 600; t++) { step(s2, [{}]); out.push(s2.wells[0].next[0] * 8 + s2.wells[0].next[1], s2.wells[0].cur ? s2.wells[0].cur.c1 * 8 + s2.wells[0].cur.c2 : 0) }
        return out.join(',')
    }
    ok(sig(555) === sig(555) && sig(555) !== sig(556), 'the preview stream is deterministic per seed')
}
{
    const s = newGame(31, 1)
    const w = s.wells[0]
    w.board.fill(0)
    for (let c = 0; c < 3; c++) w.board[idx(11, c)] = 1
    w.board[idx(10, 2)] = 1
    w.board[idx(7, 5)] = 2
    w.cur = { x: 0, y: 0, rot: 0, c1: 1, c2: 1 }
    for (let t = 0; t < 300; t++) {
        step(s, [{ drop: t === 8 }])
        while (s.events.length) s.events.shift()
        if (w.phase === 'drop' && w.slide.length) break
    }
    ok(w.phase === 'drop' && w.slide.length === 1, 'the collapse records how far each orb fell')
    const e = w.slide[0]
    ok(e && e.c === 5 && e.r === 11 && e.dy === -4, 'the survivor at (11,5) fell exactly four rows')
    while (w.phase !== 'fall') { step(s, [{}]); while (s.events.length) s.events.shift() }
    ok(w.slide.length === 0, 'slide data clears when the next pair spawns')
}

console.log('DAS (#863) — repeat-on-hold tuned for thumbs')
{
    // The slide's repeat-on-hold, tick-for-tick. A tap is the press step (one
    // cell); holding then auto-repeats after the tuned delay. The timing IS the
    // gate: a keyboard-tight DAS_DELAY of 12 lands the first repeat on frame 13
    // (a thumb waits 200 ms, sluggish in a fast-falling battler) and reddens the
    // frame-9 assertion; the tuned 8 lands it on frame 9. Kept global on purpose
    // — it is the one DAS both online boxes apply to the same held pad stream.
    const s = newGame(41, 1)
    const w = s.wells[0]
    w.board.fill(0)
    w.cur = { x: COLS - 2, y: 0, rot: 0, c1: 1, c2: 2 }
    w.dasDir = 0; w.dasF = 0
    step(s, [{ left: true }, {}])
    ok(w.cur.x === COLS - 3, 'a tap slides the pair exactly one cell (the press step)')

    w.cur.x = COLS - 2; w.dasDir = 0; w.dasF = 0
    const moves = []
    let prev = COLS - 2
    for (let f = 1; f <= 24; f++) {
        step(s, [{ left: true }, {}])
        if (w.cur.x !== prev) { moves.push(f); prev = w.cur.x }
    }
    ok(moves[0] === 1, 'the press step moves on frame 1')
    ok(moves[1] === 9, `the first auto-repeat is at frame 9 — the tuned 8-frame thumb delay (a keyboard-tight 12 would land at 13)`)
    ok(moves[2] - moves[1] === 4 && moves[3] - moves[2] === 4, 'then it repeats every 4 frames')
    ok(prev === 0 && moves.length === 4, `a held slide crosses the well (col ${COLS - 2} -> 0) in ${moves.length} moves by frame ${moves[moves.length - 1]}`)
}

console.log('online — two boxes over an in-memory pipe')
{
    function box(seat) {
        const pads = [new Map(), new Map()]
        const b = {
            seat, pads, gs: null, local: null, desync: false, ls: null,
            receive(m) {
                if (m.t === 'pad') { b.ls.gotPad(m.k | 0, m.p); pads[m.s | 0].set(m.k | 0, m.p) }
                else if (m.t === 'hs') { const r = b.ls.gotHash(m.k | 0, m.h >>> 0); if (r && r.desync !== undefined) b.desync = true }
            },
        }
        return b
    }
    const seed = 0xf00d
    const A = box(0), B = box(1)
    A.ls = createLockStep({ delay: PAD_DELAY, hashEvery: HASH_EVERY, send: (m) => { if (m.t === 'pad') A.pads[0].set(m.k, m.p); B.receive(Object.assign({ s: 0 }, m)) } })
    B.ls = createLockStep({ delay: PAD_DELAY, hashEvery: HASH_EVERY, send: (m) => { if (m.t === 'pad') B.pads[1].set(m.k, m.p); A.receive(Object.assign({ s: 1 }, m)) } })
    A.gs = newGame(seed, 2); B.gs = newGame(seed, 2)
    A.local = makeCpu(seed ^ 1); B.local = makeCpu(seed ^ 2)
    let mismatch = -1, checked = 0
    for (let k = 0; k < 2000 && !A.gs.over; k++) {
        for (const b of [A, B]) {
            const keys = b.local(b.gs.wells[b.seat])
            b.ls.pumpTo(k + PAD_DELAY, () => toWire(keys))
        }
        if (!A.ls.ready(k) || !B.ls.ready(k)) continue
        step(A.gs, assemblePads(A.pads[0], A.pads[1], k))
        step(B.gs, assemblePads(B.pads[0], B.pads[1], k))
        if (k % HASH_EVERY === 0) {
            const ha = A.ls.hash(k, stateHash(A.gs))
            const hb = B.ls.hash(k, stateHash(B.gs))
            checked++
            if ((ha && ha.desync !== undefined) || (hb && hb.desync !== undefined)) mismatch = k
            A.ls.prune(k); B.ls.prune(k)
        }
    }
    ok(A.gs.tick === B.gs.tick && A.gs.tick > 500, `both boxes advanced ${A.gs.tick} ticks in lockstep`)
    ok(checked > 15 && mismatch === -1, `${checked} hash checkpoints, zero desyncs`)
    ok(stateHash(A.gs) === stateHash(B.gs), 'the two boxes finish on the same state hash')
    ok(!A.desync && !B.desync, 'neither box flagged a desync')
    ok(boardFor(0) === 0 && boardFor(1) === 1, 'seat->board mapping is canonical')
    const codes = new Set()
    for (let i = 0; i < 200; i++) codes.add(randomCode())
    ok([...codes].every((c) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(c)) && codes.size > 100, 'room codes avoid I/O/0/1 (the SSX lesson)')
}

console.log('online — re-join resyncs after a desync (#863)')
{
    // the re-join law: a frozen match is restarted clean on a FRESH seed with a
    // reset lockstep and emptied pad mirrors — the host re-kicks 'go' and both
    // boxes ride the same start path, so a desync no longer means "refresh".
    const mkBox = (seat) => {
        const pads = [new Map(), new Map()]
        const b = {
            seat, pads, gs: null, local: null, desync: false, ls: null,
            receive(m) {
                if (m.t === 'pad') { b.ls.gotPad(m.k | 0, m.p); pads[m.s | 0].set(m.k | 0, m.p) }
                else if (m.t === 'hs') { const r = b.ls.gotHash(m.k | 0, m.h >>> 0); if (r && r.desync !== undefined) b.desync = true }
            },
        }
        return b
    }
    const A = mkBox(0), B = mkBox(1)
    const wire = () => {
        A.ls = createLockStep({ delay: PAD_DELAY, hashEvery: HASH_EVERY, send: (m) => { if (m.t === 'pad') A.pads[0].set(m.k, m.p); B.receive(Object.assign({ s: 0 }, m)) } })
        B.ls = createLockStep({ delay: PAD_DELAY, hashEvery: HASH_EVERY, send: (m) => { if (m.t === 'pad') B.pads[1].set(m.k, m.p); A.receive(Object.assign({ s: 1 }, m)) } })
    }
    const mkGs = (s) => { A.gs = newGame(s, 2); B.gs = newGame(s, 2); A.local = makeCpu(s ^ 1); B.local = makeCpu(s ^ 2); A.desync = false; B.desync = false }
    // advance the locked pair from its current tick to `to`; freeze on the first
    // desync (the on-screen law). returns { desyncAt, checked, ticks }.
    const advance = (to) => {
        let desyncAt = -1, checked = 0
        for (let k = A.gs.tick; k < to && !A.gs.over; k++) {
            for (const b of [A, B]) b.ls.pumpTo(k + PAD_DELAY, () => toWire(b.local(b.gs.wells[b.seat])))
            if (!A.ls.ready(k) || !B.ls.ready(k)) continue
            step(A.gs, assemblePads(A.pads[0], A.pads[1], k))
            step(B.gs, assemblePads(B.pads[0], B.pads[1], k))
            if (k % HASH_EVERY === 0) {
                const ha = A.ls.hash(k, stateHash(A.gs))
                const hb = B.ls.hash(k, stateHash(B.gs))
                checked++
                if ((ha && ha.desync !== undefined) || (hb && hb.desync !== undefined)) { desyncAt = k; break }
                A.ls.prune(k); B.ls.prune(k)
            }
        }
        return { desyncAt, checked, ticks: A.gs.tick }
    }
    const rejoin = (seed) => { wire(); A.pads[0].clear(); A.pads[1].clear(); B.pads[0].clear(); B.pads[1].clear(); mkGs(seed) }

    wire(); mkGs(0xa11ce)
    let r = advance(180)
    ok(r.desyncAt === -1 && stateHash(A.gs) === stateHash(B.gs), `the pair runs clean to tick ${r.ticks} (${r.checked} checkpoints, no desync)`)
    B.gs.wells[1].board[idx(11, 0)] = 3 // box B's board flips -> the two sims diverge
    r = advance(240)
    ok(r.desyncAt !== -1, `a diverged box is caught at the next hash checkpoint (tick ${r.desyncAt})`)
    ok(A.gs.tick === B.gs.tick, 'both boxes froze on the same tick at the desync')
    rejoin(0x5eed) // fresh seed + reset lockstep + emptied pad mirrors
    ok(stateHash(A.gs) === stateHash(B.gs), 'the re-joined pair starts on an identical fresh state')
    r = advance(1200)
    ok(r.desyncAt === -1 && r.ticks > 300 && stateHash(A.gs) === stateHash(B.gs), `after re-join the pair resyncs, advances and holds (${r.ticks} ticks, ${r.checked} checkpoints, zero desyncs)`)
}

console.log('planner competence — the autopilot chains')
{
    const s = newGame(0xbeef, 2)
    const c1 = makeCpu(0xbeef), c2 = makeCpu(0xd00d)
    let pops = 0, maxChain = 0, sends = 0
    for (let t = 0; t < 8000 && !s.over; t++) {
        step(s, [c1(s.wells[0]), c2(s.wells[1])])
        while (s.events.length) {
            const e = s.events.shift()
            if (e.t === 'pop') { pops++; if (e.chain > maxChain) maxChain = e.chain }
            if (e.t === 'send') sends++
        }
    }
    ok(pops > 20, `the CPU pops organically (${pops} pops)`)
    ok(maxChain >= 2, `the CPU chains (max ${maxChain})`)
    ok(sends > 0 && maxChain >= 2, `the CPU attacks over a long run (${sends} sends, chains to ${maxChain})`)
    const p = choosePlacement(s.wells[0])
    ok(p === null || Number.isFinite(p.score), 'choosePlacement answers a scored plan')
}

console.log('CPU tiers (#863) — the arcade ladder')
{
    // determinism per rung: same seed + same tier => identical hash stream
    const stream = (seed, tier, ticks) => {
        const s = newGame(seed, 2)
        const c0 = makeCpu(seed ^ 0x1, tier), c1 = makeCpu(seed ^ 0x2, tier)
        const h = []
        for (let t = 0; t < ticks && !s.over; t++) { step(s, [c0(s.wells[0]), c1(s.wells[1])]); h.push(stateHash(s)) }
        return h
    }
    for (const tier of ['easy', 'normal', 'hard']) {
        const a = stream(0xc0de, tier, 1500), b = stream(0xc0de, tier, 1500)
        ok(a.every((x, i) => x === b[i]), `${tier} tier is deterministic per seed (${a.length} ticks)`)
    }
    const hh = stream(0xc0de, 'hard', 1500), ee = stream(0xc0de, 'easy', 1500)
    ok(hh.some((x, i) => x !== ee[i]) || hh.length !== ee.length, 'the ladder rungs differ (expert stream != beginner stream)')

    // the expert plans deeper chains and out-chains the beginner (aggregate over
    // fixed seeds — a beginner that stops missing or an expert that stops planning
    // deeper reddens this)
    const SEEDS = [0xbeef, 0xabcd, 0x1357, 0x2468, 0xdead]
    let csH = 0, csE = 0
    for (const sd of SEEDS) {
        const s = newGame(sd, 2)
        const c0 = makeCpu(sd ^ 0x1, 'hard'), c1 = makeCpu(sd ^ 0x2, 'easy')
        for (let t = 0; t < 6000 && !s.over; t++) {
            step(s, [c0(s.wells[0]), c1(s.wells[1])])
            while (s.events.length) { const e = s.events.shift(); if (e.t === 'pop') { if (e.seat === 0) csH += e.chain; else csE += e.chain } }
        }
    }
    ok(csH > csE, `the expert out-chains the beginner (${csH} vs ${csE} chain steps)`)

    // the beginner is sluggish: vs an idle seat, over a fixed window it locks
    // fewer pairs than the expert (its drops carry more human jitter)
    const lockCount = (seed, tier, ticks) => {
        const s = newGame(seed, 2); const c = makeCpu(seed ^ 0x7, tier); let locks = 0
        for (let t = 0; t < ticks; t++) { step(s, [c(s.wells[0]), {}]); while (s.events.length) { const e = s.events.shift(); if (e.t === 'lock' && e.seat === 0) locks++ } }
        return locks
    }
    let hardL = 0, easyL = 0
    for (const sd of SEEDS) { hardL += lockCount(sd, 'hard', 900); easyL += lockCount(sd, 'easy', 900) }
    ok(hardL > easyL, `the expert drops faster (${hardL} vs ${easyL} locks vs an idle seat)`)
}

console.log('win screen (#863) — the result podium script')
{
    // a finished match: seat 1 (the CPU) took it 2-0 against an idle seat 0.
    // winPresentation is the single source the renderer uses for the podium, so
    // a winner/loser swap or a wrong youWin/title reddens these in plain Node.
    const s = newGame(5, 2)
    s.wells[0].rounds = 0; s.wells[1].rounds = 2
    s.wells[0].score = 240; s.wells[1].score = 980
    s.over = true; s.winner = 1
    const p = winPresentation(s, 'cpu')
    ok(p.winner === 1 && p.loser === 0, 'the winner is crowned, the loser is on the spill side')
    ok(p.youWin === false && p.title === 'YOU LOSE', 'solo: losing to the CPU reads YOU LOSE')
    ok(p.rounds[0] === 0 && p.rounds[1] === 2 && p.scores[0] === 240 && p.scores[1] === 980, 'the podium carries the real rounds and points')
    ok(winPresentation(s, 'online', 1).youWin === true && winPresentation(s, 'online', 1).title === 'YOU WIN', 'online: the winning seat reads YOU WIN')
    ok(winPresentation(s, 'online', 0).youWin === false && winPresentation(s, 'online', 0).title === 'YOU LOSE', 'online: the losing seat reads YOU LOSE')
    ok(winPresentation(s, 'local').title === 'P2 WINS', 'local 2P: the headline names the seat, not YOU')

    // the gravity speed-up tick: a round that is NOT the last one tightens
    // gravity (a tick) and continues; the final round does not tick (fanfare).
    const g = newGame(17, 2)
    g.wells[0].over = true // seat 0 tops out -> seat 1 wins a round
    const b1 = g.events.length
    step(g, [{}, {}])
    const grav = g.events.slice(b1).filter((e) => e.t === 'gravity')
    ok(g.wells[1].rounds === 1 && grav.length === 1 && !g.over, 'a round win tightens gravity (one speed-up tick) and continues')
    g.wells[0].over = true // the next top-out is the match point
    const b2 = g.events.length
    step(g, [{}, {}])
    ok(g.over && g.events.slice(b2).every((e) => e.t !== 'gravity'), 'the final round does not tick — the fanfare plays instead')
}

console.log(`\nblobcheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
