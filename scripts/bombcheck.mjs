// BOMB CHECK — Node harness for TALK ME DOWN (#1252). Proves three things:
// the sim boots legal bombs, its core rules hold on hundreds of seeds, and it
// can be won — plus the slack rule (every seed still clears with the fuse cut
// to 75%) and the voice grammar pins. One gate per behaviour; a red line names
// itself. Pure Node: engine.js and voice.js are DOM-free by design.

import {
    createGame, step, simState, hash, solvePad, computeTarget, drainEvents,
    RULEBOOK, WIRE_COLORS, GLYPHS, QUOTA_BOMBS, MAX_STRIKES, STRIKE_FUSE_COST, LOCK_TICKS,
} from '../src/games/TalkMeDown/engine.js'
import { parseCall, intentLabel } from '../src/games/TalkMeDown/voice.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---- 1. legal generation -----------------------------------------------------
{
    let legal = true, bad = ''
    for (let seed = 1; seed <= 300; seed++) {
        const gs = createGame(seed, 1)
        if (!/^[A-Z]{2}\d[A-Z]\d$/.test(gs.features.serial)) { legal = false; bad = `seed ${seed} serial ${gs.features.serial}`; break }
        if (!(gs.features.leds >= 0 && gs.features.leds <= 8)) { legal = false; bad = `seed ${seed} leds`; break }
        const count = Math.min(1 + (gs.round >> 1), 4)
        if (gs.modules.length !== count) { legal = false; bad = `seed ${seed} modules ${gs.modules.length} != ${count}`; break }
        for (const m of gs.modules) {
            if (!RULEBOOK[m.type].some(r => r.id === m.stamp)) { legal = false; bad = `seed ${seed} stamp ${m.stamp}`; break }
            if (computeTarget(gs, m) === null) { legal = false; bad = `seed ${seed} ${m.stamp} has no target`; break }
        }
        if (!legal) break
    }
    ok('300 seeds generate legal, solvable bombs', legal, bad)
}

// ---- 2. round pressure rises --------------------------------------------------
{
    const g = createGame(11, 1)
    const r1 = { mods: g.modules.length, fuse: g.fuseMax }
    for (let i = 0; i < 60000 && !g.done; i++) step(g, solvePad(g))
    ok('the solver rides every round to the quota', g.won && g.round === 5, `round=${g.round} won=${g.won}`)
    ok('more modules at the deep rounds than round 1', g.modules.length > r1.mods, `${r1.mods} -> ${g.modules.length}`)
    ok('shorter fuse at the deep rounds than round 1', g.fuseMax < r1.fuse, `${r1.fuse} -> ${g.fuseMax}`)
}

// ---- 3. rules hold as printed -----------------------------------------------
{
    let bad = ''
    outer:
    for (let seed = 1; seed <= 200; seed++) {
        const gs = createGame(seed, 2)
        for (const m of gs.modules) {
            const t = computeTarget(gs, m)
            const f = gs.features
            if (m.type === 'N') {
                const w = m.wires[t.wire]
                const litCount = m.wires.filter(x => x.lit).length
                if (m.stamp === 'N1' && w.color !== 0) { bad = `${seed}:N1 not red`; break outer }
                if (m.stamp === 'N2' && (!w.lit || litCount !== 1)) { bad = `${seed}:N2 lit=${litCount}`; break outer }
                if (m.stamp === 'N3' && w.color !== 1 && !(m.wires.every(x => x.color !== 1) && w.color === 4)) { bad = `${seed}:N3`; break outer }
                if (m.stamp === 'N4') {
                    const on = m.wires.filter(x => x.lit)
                    const want = litCount % 2 === 0 ? on[0] : on[on.length - 1]
                    if (w !== want) { bad = `${seed}:N4`; break outer }
                }
                if (m.stamp === 'N5' && w.color !== f.bolt) { bad = `${seed}:N5`; break outer }
                if (m.stamp === 'N6') {
                    const c = f.serialDigit % 6
                    const dark = m.wires.some(x => x.color === c && !x.lit)
                    if (w.color !== c) { bad = `${seed}:N6 color`; break outer }
                    if (dark && w.lit) { bad = `${seed}:N6 prefer-dark`; break outer }
                }
            } else if (m.type === 'D') {
                const sd = f.serialDigit
                const exp = { D1: sd, D2: f.leds, D3: (sd * 2) % 10 }[m.stamp]
                if (m.stamp === 'D4') {
                    const neon = gs.modules.find(x => x !== m && x.type === 'N')
                    const e4 = neon ? neon.wires.length : (f.leds + 3) % 10
                    if (t.dial !== e4) { bad = `${seed}:D4`; break outer }
                } else if (t.dial !== exp) { bad = `${seed}:${m.stamp} dial ${t.dial} != ${exp}`; break outer }
            } else {
                const gm = c => ({ STAR: 0, DIAMOND: 1, CLUB: 2, SPADE: 3, BOLT: 4, MOON: 5 }[c])
                const exp = {
                    G1: [0, 4, 5],
                    G3: [1, 2, 3],
                    G2: [gm('MOON'), gm(GLYPHS[f.serialDigit % 6]), gm(GLYPHS[f.leds % 6])],
                    G4: [gm(GLYPHS[f.leds % 6]), gm(GLYPHS[f.serialDigit % 6]), gm(GLYPHS[f.leds % 6])],
                }[m.stamp]
                if (JSON.stringify(t.seq) !== JSON.stringify(exp)) { bad = `${seed}:${m.stamp} seq`; break outer }
            }
        }
    }
    ok('every rule answer matches its printed text on 200 seeds', !bad, bad)
}

// ---- 4. determinism ---------------------------------------------------------
{
    const pads = i => ({ left: i % 47 < 11, right: i % 47 >= 18 && i % 47 < 30, up: i % 31 < 7, down: i % 31 >= 12 && i % 31 < 20, a: i % 23 < 2, b: i % 53 < 2 })
    const a = createGame(777, 2), b = createGame(777, 2)
    let same = true
    for (let i = 0; i < 900; i++) {
        step(a, [pads(i), { up: i % 13 < 2, a: i % 61 === 0 }])
        step(b, [pads(i), { up: i % 13 < 2, a: i % 61 === 0 }])
        if (hash(a) !== hash(b)) { same = false; break }
    }
    ok('same seed + pads => identical 900-tick hash stream', same)
    const c = createGame(778, 2)
    for (let i = 0; i < 300; i++) step(c, pads(i))
    ok('different seed => different state', hash(c) !== hash(a))
}

// ---- 5. strike mechanics ----------------------------------------------------
{
    const gs = createGame(9, 1)
    const m = gs.modules[0]
    const t = computeTarget(gs, m)
    const before = gs.fuse
    if (m.type === 'N') {
        gs.cursor.sub = (t.wire + 1) % m.wires.length
        step(gs, { a: true })
    } else if (m.type === 'D') {
        m.dial = (t.dial + 4) % 10
        step(gs, { a: true })
    } else {
        gs.cursor.sub = (t.seq[0] + 2) % 6
        step(gs, { a: true })
    }
    ok('wrong verb trips a strike', gs.strikes === 1)
    ok('the module locks for 3 s', m.locked === LOCK_TICKS, `locked=${m.locked}`)
    ok('a strike burns five seconds off the fuse', gs.fuse === before - 1 - STRIKE_FUSE_COST, `fuse ${before} -> ${gs.fuse}`)
    const ev = drainEvents(gs)
    ok('the strike event reaches the shell with a why', ev.some(e => e.k === 'strike' && /wrong|off/.test(e.why)))
    // locked module refuses verbs until unlocked
    const fuse2 = gs.fuse
    if (m.type === 'N') gs.cursor.sub = t.wire
    for (let i = 0; i < 60; i++) step(gs, { a: true })
    ok('locked module survives the lockout uncut', !m.solved)
    ok('no extra strike while locked (refused verbs)', gs.strikes === 1)
    void fuse2
}

// ---- 6. loss paths ----------------------------------------------------------
{
    const g1 = createGame(5, 1)
    let n = 0
    while (!g1.done && n++ < 20000) step(g1, {})
    ok('an ignored bomb explodes at fuse zero', g1.done && !g1.won && g1.fuse <= 0)
    const g2 = createGame(5, 1)
    let k = 0
    while (!g2.done && k++ < 40000) {
        const m = g2.modules[g2.cursor.mod]
        if (!m || m.locked > 0) { step(g2, {}); continue }
        const t = computeTarget(g2, m)
        if (m.type === 'N') g2.cursor.sub = (t.wire + 1) % m.wires.length
        else if (m.type === 'D') m.dial = (t.dial + 4) % 10
        else g2.cursor.sub = (t.seq[0] + 2) % 6
        step(g2, { a: true })
    }
    ok(`three strikes end the run (no win)`, g2.done && !g2.won && g2.strikes === MAX_STRIKES, `strikes=${g2.strikes}`)
}

// ---- 7. it can be won -------------------------------------------------------
{
    let wins = 0
    const N = 50
    for (let seed = 1; seed <= N; seed++) {
        const gs = createGame(seed, 1)
        let n = 0
        while (!gs.done && n++ < 80000) step(gs, solvePad(gs))
        if (gs.done && gs.won && gs.bombsCleared === QUOTA_BOMBS) wins++
    }
    ok(`solver wins the SQUAD CHIEF stamp on ${N}/${N} seeds`, wins === N, `${wins}/${N}`)
}

// ---- 8. slack rule (puzzle law) ---------------------------------------------
// Every supply the winning run consumes is one smaller: the fuse. The solver
// must still clear every seed at 75% fuse — zero-slack rounds are a build fail.
{
    let wins = 0, worst = null
    const N = 50
    for (let seed = 1; seed <= N; seed++) {
        const gs = createGame(seed, 1)
        gs.fuse = Math.floor(gs.fuse * 0.75)
        let n = 0, lastRound = 1
        while (!gs.done && n++ < 80000) {
            step(gs, solvePad(gs))
            if (gs.round !== lastRound) {
                lastRound = gs.round
                gs.fuse = Math.floor(gs.fuse * 0.75)
            }
        }
        if (gs.done && gs.won) wins++
        else worst = { seed, round: gs.round, strikes: gs.strikes }
    }
    ok(`slack: every seed still clears at 75% fuse`, wins === N, JSON.stringify(worst))
}

// ---- 9. partner + seat laws ---------------------------------------------------
{
    const solo = createGame(31, 1)
    let got = null
    for (let i = 0; i < 400 && !got; i++) { step(solo, {}); got = solo.order }
    ok('solo CPU partner prints an order', !!got, String(got))
    ok('the order names a solvable verb', /CUT|DIAL TO|PRESS/.test(String(got)))
    const duo = createGame(31, 2)
    for (let i = 0; i < 400; i++) step(duo, [{}, {}])
    ok('a human manual seat silences the CPU partner', duo.order === null)
    step(duo, [{}, { down: true }])
    step(duo, [{}, { down: true }])
    step(duo, [{}, { a: true }])
    ok('seat 2 flags a rule line', duo.manual.flag !== null, String(duo.manual.flag))
    ok('flag points at a real rulebook id', Object.values(RULEBOOK).flat().some(r => r.id === duo.manual.flag))
}

// ---- 10. state shape + hash ----------------------------------------------------
{
    const gs = createGame(2, 2)
    const st = simState(gs)
    ok('state carries the contract fields', ['tick', 'score', 'done', 'hash'].every(k => k in st))
    ok('state exposes the seat-relevant truth (serial, modules)', st.serial === gs.features.serial && st.modules.length === gs.modules.length)
    ok('WIRE_COLORS/GLYPHS are six each', WIRE_COLORS.length === 6 && GLYPHS.length === 6)
}

// ---- 11. voice grammar (#1247) -----------------------------------------------
{
    const pins = [
        ['cut the red wire', { kind: 'cut', color: 'red' }],
        ['cut blue!', { kind: 'cut', color: 'blue' }],
        ['snip yellow', { kind: 'cut', color: 'yellow' }],
        ['remove green', { kind: 'cut', color: 'green' }],
        ['CUT THE BLACK', { kind: 'cut', color: 'black' }],
        ['turn to seven', { kind: 'dial', value: 7 }],
        ['dial three', { kind: 'dial', value: 3 }],
        ['set it to nine', { kind: 'dial', value: 9 }],
        ['turn to 4', { kind: 'dial', value: 4 }],
        ['press star', { kind: 'press', glyph: 'star' }],
        ['hit the moon', { kind: 'press', glyph: 'moon' }],
        ['SET', { kind: 'set' }],
        ['confirm', { kind: 'set' }],
        ['flip to the dial page', { kind: 'page', page: 'dial' }],
        ['turn to the wires page', { kind: 'page', page: 'neon' }],
        ['hello there', null],
        ['red', null],
        ['blue two three', null],
        ['', null],
    ]
    let bad = ''
    for (const [said, want] of pins) {
        const got = parseCall(said)
        const same = want === null ? got === null : JSON.stringify(got) === JSON.stringify(want)
        if (!same) { bad = `"${said}" -> ${JSON.stringify(got)} (want ${JSON.stringify(want)})`; break }
    }
    ok(`grammar resolves ${pins.length} pinned phrasings`, !bad, bad)
    ok('labels read like shouts', intentLabel({ kind: 'cut', color: 'red' }) === 'CUT RED' && intentLabel(null) === '?')
    ok('no lookahead regex tricks leak (dial beats bare set)', parseCall('set nine').kind === 'dial')
}

console.log(`\nbombcheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
