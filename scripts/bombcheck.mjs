// BOMB CHECK — Node harness for TALK ME DOWN (#1252). Proves three things:
// the sim boots legal bombs, its core rules hold on hundreds of seeds, and it
// can be won — plus the slack rule (every seed still clears with the fuse cut
// to 75%), the voice grammar pins, and the back panel (#1797: seeded
// batteries, the flip law, D5/G5 answering the printed count). One gate per
// behaviour; a red line names itself. Pure Node: engine.js and voice.js are
// DOM-free by design.

import {
    createGame, step, simState, hash, solvePad, computeTarget, drainEvents, buildBomb,
    RULEBOOK, WIRE_COLORS, GLYPHS, QUOTA_BOMBS, MAX_STRIKES, STRIKE_FUSE_COST, LOCK_TICKS, variantPool, BACK_FACT_STAMPS, ruleOf,
} from '../src/games/TalkMeDown/engine.js'
import { parseCall, intentLabel, ACCEPTED_HINT, applyCallKey, KEY_CALL_HINT, CALL_LINE_MAX } from '../src/games/TalkMeDown/voice.js'
import { createRecorder, verifyRecording, validate } from '../src/utils/recording.js'
import { readFileSync } from 'node:fs'

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
        ['flip it', { kind: 'flip' }],
        ['TURN IT OVER', { kind: 'flip' }],
        ['turn the bomb over', { kind: 'flip' }],
        ['tilt it', { kind: 'flip' }],
        ['flip over', { kind: 'flip' }],
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
    ok('a FLIP call labels as a shout', intentLabel({ kind: 'flip' }) === 'FLIP')
    ok('no lookahead regex tricks leak (dial beats bare set)', parseCall('set nine').kind === 'dial')
    ok('FLIP phrases never steal the page or the dial', parseCall('flip to the dial page').kind === 'page' && parseCall('turn to seven').kind === 'dial')
}

// ---- 12. voiceCmd banking + hint source (#1415) -----------------------------
{
    // The shell banks one entry per heard call into the recorder's voiceCmd
    // channel (#1249 Gauntlet pattern). Drive the REAL recorder with the same
    // entry shapes voiceCall emits and prove: the trace lands, the file stays
    // valid v1 (metadata, like the ping trace), and replay ignores the
    // channel — the same seeded pads still hash-exact.
    const rec = createRecorder({ gameId: 'talk-me-down', method: 'dpad', seed: 7, players: 1, hashEvery: 30 })
    const gs = createGame(7, 1)
    for (let i = 0; i < 90; i++) { step(gs, {}); rec.addTick([{}], null, gs.tick % 30 === 0 ? hash(gs) : null) }
    rec.addVoiceCmd({ said: 'cut red', intent: 'cut', ok: true, dir: 2 })
    rec.addVoiceCmd({ said: 'dial 7', intent: 'dial', ok: false, why: 'NO DIAL HERE' })
    rec.addVoiceCmd({ said: 'hello there', intent: null, ok: false, why: 'NO CALL' })
    const file = rec.finish(hash(gs))
    ok('a v1 talk-me-down file with a voiceCmd trace validates', validate(file) === null, validate(file) || '')
    ok('no voice attempted keeps the file v1', file.format === 'retrogames-rec/v1', file.format)
    const vc = file.voiceCmd || []
    ok('obey + refuse + no-call bank with why/dir', vc.length === 3 && vc[0].ok === true && vc[0].intent === 'cut' && vc[0].dir === '2' &&
        vc[1].why === 'NO DIAL HERE' && vc[2].intent === null && vc[2].why === 'NO CALL', JSON.stringify(vc))
    ok('voiceCmd ticks ride the recorder clock', vc.every(c => Number.isInteger(c.t) && c.t >= 1 && c.t <= file.ticks) && vc[0].t <= vc[1].t && vc[1].t <= vc[2].t)
    const rp = verifyRecording(file, {
        reset: (seed) => { globalThis.__rp = createGame(seed, 1) },
        step: (pads) => step(globalThis.__rp, pads),
        state: () => ({ tick: globalThis.__rp.tick, hash: hash(globalThis.__rp) }),
    })
    ok('the file replays hash-exact — replay ignores the trace', rp.ok, JSON.stringify(rp.mismatch || rp.error))
    // The hint line the footer and the page share must describe calls the
    // grammar actually accepts (one source, text == truth).
    ok('ACCEPTED_HINT names shapes the grammar accepts', ['cut red', 'dial 7', 'set', 'press star'].every(s => parseCall(s)) &&
        ACCEPTED_HINT.includes('"CUT RED"') && ACCEPTED_HINT.includes('"DIAL 7"') && ACCEPTED_HINT.includes('"SET"') && ACCEPTED_HINT.includes('"PRESS STAR"') && ACCEPTED_HINT.includes('"FLIP IT"'), ACCEPTED_HINT)
    const artSrc = readFileSync(new URL('../src/games/TalkMeDown/art.js', import.meta.url), 'utf8')
    ok('the LCD-rail footer draws the shared const (not a literal)', /ACCEPTED_HINT/.test(artSrc))
}

// ---- 13. D4 anchor — the printed dial answer survives the whole bomb (#1708) --
{
    const navigate = (gs, idx) => {
        for (let g = 0; gs.cursor.mod !== idx && g < 8; g++) step(gs, { down: true })
    }
    const solveHere = (gs, m) => {
        for (let i = 0; i < 400 && !m.solved && gs.strikes === 0 && !gs.done; i++) step(gs, solvePad(gs))
    }
    // (a) target identical before and after every sibling module is solved,
    // across rounds 3 + 5 (the only quota rounds that can seat a DIAL) — the
    // page prints once, the engine must agree for the bomb's whole life.
    let cases = 0, moved = ''
    outer13:
    for (const round of [3, 5]) {
        for (let seed = 1; seed <= 1200; seed++) {
            const gs = createGame(seed, 2)
            gs.round = round
            buildBomb(gs)
            const di = gs.modules.findIndex(m => m.stamp === 'D4')
            if (di < 0) continue
            const dial = gs.modules[di]
            const neon = gs.modules.find(x => x !== dial && x.type === 'N')
            if (!neon) { moved = `${round}/${seed}: D4 generated with no NEON sibling`; break outer13 }
            const t0 = computeTarget(gs, dial)
            if (t0.dial !== neon.wires.length) { moved = `${round}/${seed}: fresh D4 ${t0.dial} != wire count ${neon.wires.length}`; break outer13 }
            for (let i = 0; i < gs.modules.length; i++) {
                if (i === di) continue
                navigate(gs, i)
                solveHere(gs, gs.modules[i])
                if (!gs.modules[i].solved) { moved = `${round}/${seed}: sibling ${i} not solved`; break outer13 }
            }
            navigate(gs, di)
            const t1 = computeTarget(gs, dial)
            if (t1.dial !== t0.dial) { moved = `${round}/${seed}: D4 flipped ${t0.dial} -> ${t1.dial} after siblings solved`; break outer13 }
            cases++
        }
    }
    ok(`D4 target anchored across sibling progress (${cases} bombs, rounds 3+5)`, !moved && cases >= 100, moved || `only ${cases} D4 bombs found`)

    // (b) the human flow: cut the NEON, THEN dial the number the PAGE says
    // (the wire count still lying there in plain sight), SET. Pre-#1708 this
    // sparked — the guard flipped the engine's answer under the manual.
    let flowed = 0, flowBad = ''
    for (let seed = 1; seed <= 1200 && flowBad === ''; seed++) {
        const gs = createGame(seed, 2)
        gs.round = 3
        buildBomb(gs)
        const dial = gs.modules.find(m => m.stamp === 'D4')
        const neon = gs.modules.find(m => m !== dial && m.type === 'N')
        if (!dial || !neon) continue
        const printed = neon.wires.length
        navigate(gs, gs.modules.indexOf(neon))
        solveHere(gs, neon)
        if (!neon.solved) { flowBad = `seed ${seed}: NEON not cut`; break }
        navigate(gs, gs.modules.indexOf(dial))
        while (dial.dial !== printed) step(gs, dial.dial < printed ? { right: true } : { left: true })
        step(gs, { a: true })
        if (!dial.solved || gs.strikes !== 0) { flowBad = `seed ${seed}: printed ${printed} -> solved=${dial.solved} strikes=${gs.strikes}`; break }
        flowed++
    }
    ok(`human flow: siblings cut first, dial the PRINTED count, SET solves (${flowed} rigs)`, flowBad === '' && flowed >= 50, flowBad || `only ${flowed}`)

    // (c) source pin: the cross-reference is the bare layout find — guard
    // dead, in words not near-misses (id: 'D4' -> find is 640 bytes; STATE
    // lesson: measure the window before writing {0,N}).
    const engSrc = readFileSync(new URL('../src/games/TalkMeDown/engine.js', import.meta.url), 'utf8')
    ok('D4 cross-reference is the bare unsolved-blind find (source pin)',
        /id: 'D4'[\s\S]{0,700}all\.find\(x => x !== m && x\.type === 'N'\)/.test(engSrc))
}

// ---- 14. back panel (#1797): batteries, the flip law, battery rules ---------
{
    const navigate = (gs, idx) => {
        for (let g = 0; gs.cursor.mod !== idx && g < 8; g++) step(gs, { down: true })
    }
    // (a) batteries — a seeded back-plate fact, 0..2, stable across rebuilds.
    let bBad = ''
    for (let seed = 1; seed <= 300 && !bBad; seed++) {
        const b = createGame(seed, 1).features.batteries
        if (!Number.isInteger(b) || b < 0 || b > 2) bBad = `seed ${seed} batteries ${b}`
        else if (createGame(seed, 1).features.batteries !== b) bBad = `seed ${seed} batteries unstable`
    }
    ok('back panel: batteries are seeded 0..2 across 300 seeds', !bBad, bBad)

    // (b) the flip law — UP tilts over at module 1, DOWN tilts back; UP does
    // NOT flip once the cursor sits deeper (it walks the modules there).
    const g1 = createGame(4242, 1)
    step(g1, { up: true })
    const flipIn = g1.flip === 1
    step(g1, { down: true })
    const flipOut = g1.flip === 0
    // the UP-walks-elsewhere leg needs TWO modules (round 1's single-module
    // bomb has nowhere to walk — UP correctly tilts there).
    g1.round = 3
    buildBomb(g1)
    step(g1, { down: true })
    const walked = g1.cursor.mod === 1
    step(g1, { up: true })
    const upWalks = g1.flip === 0 && g1.cursor.mod === 0
    const g1b = createGame(4242, 1)
    const kinds = []
    step(g1b, { up: true }); drainEvents(g1b).forEach(f => { if (f.k === 'flip') kinds.push(f.to) })
    step(g1b, { down: true }); drainEvents(g1b).forEach(f => { if (f.k === 'flip') kinds.push(f.to) })
    ok('flip law: UP tilts over at module 1, DOWN back, UP walks elsewhere; both tilts announce',
        flipIn && flipOut && walked && upWalks && kinds.join(',') === '1,0',
        `in=${flipIn} out=${flipOut} walk=${walked} up=${upWalks} events=${kinds.join(',')}`)

    // (c) no verbs on the back — inputs refuse SILENTLY (no strike, no cut,
    // no cursor/dial move, no score). A locked module must not pin the bomb
    // face-down either way — the tilt stays legal while a module cools.
    // #1909: A got a verb on a FULL plate (THE DRAIN, section 16) — this
    // rig now seeds an empty plate so every input must be silent.
    let g2 = null
    for (let s = 1; s <= 300; s++) { const gg = createGame(s, 1); if (gg.features.batteries === 0) { g2 = gg; break } }
    const m0 = g2.modules[0]
    const sub0 = g2.cursor.sub
    const dial0 = m0.dial ?? -1
    step(g2, { up: true })
    step(g2, { a: true }); step(g2, { left: true }); step(g2, { right: true })
    const refusedOk = g2.flip === 1 && g2.strikes === 0 && g2.score === 0 && g2.cursor.sub === sub0 && (m0.dial ?? -1) === dial0 && !m0.solved
    const backAgain = (step(g2, { down: true }), g2.flip === 0)
    const g2b = createGame(7, 1)
    g2b.modules[0].locked = 60
    step(g2b, { up: true })
    step(g2b, { down: true })
    const lockTilt = g2b.flip === 0
    ok('flipped panel refuses verbs silently — no strike, no progress; the tilt escapes a lock',
        refusedOk && backAgain && lockTilt,
        `strikes=${g2.strikes} score=${g2.score} sub=${g2.cursor.sub} flip=${g2.flip} lockTilt=${lockTilt}`)

    // (d) every new bomb lands face-up.
    const g3 = createGame(7, 1)
    step(g3, { up: true })
    g3.round = 2
    buildBomb(g3)
    ok('a new bomb lands face-up (buildBomb resets the tilt)', g3.flip === 0)

    // (e) the autopilot tilts ONLY for the drain (#1909 rewrote this gate —
    // it used to read "never tilts"): solvePad stays face-up unless a live
    // rule demands a pulled battery, and never lies about needing one.
    let tiltSeen = false, tiltsForNothing = false
    {
        const g = createGame(11, 1)
        for (let i = 0; i < 60000 && !g.done; i++) {
            step(g, solvePad(g))
            if (g.flip) {
                tiltSeen = true
                if (g.pulls === 0 && !g.modules.some(x => !x.solved && ruleOf(x).pull)) tiltsForNothing = true
            }
        }
    }
    ok('the autopilot tilts only for a live pull rule — never for nothing', !tiltsForNothing, `tiltSeen=${tiltSeen} spurious=${tiltsForNothing}`)

    // (f) human flow: tilt to READ, then the printed count solves D5/G5 —
    // printed text and computed target are the same truth.
    let fBad = '', fRigs = 0
    outerF:
    for (const round of [3, 4, 5]) {
        for (let seed = 1; seed <= 1500 && fRigs < 40; seed++) {
            const gs = createGame(seed, 2)
            gs.round = round // D5 seats from round 3, G5 from round 4 (module-type law)
            buildBomb(gs)
            const b = gs.features.batteries
            for (const m of gs.modules) {
            const idx = gs.modules.indexOf(m)
            if (m.stamp === 'D5') {
                step(gs, { up: true }); step(gs, { down: true }) // tilt-read like a human
                navigate(gs, idx)
                for (let i = 0; m.dial !== b && i < 12; i++) step(gs, m.dial < b ? { right: true } : { left: true })
                step(gs, { a: true })
                if (!m.solved || gs.strikes !== 0) { fBad = `seed ${seed}: D5 b=${b} solved=${m.solved} strikes=${gs.strikes}`; break outerF }
                fRigs++
            } else if (m.stamp === 'G5') {
                step(gs, { up: true }); step(gs, { down: true })
                navigate(gs, idx)
                for (const want of [b, 3, b]) {
                    for (let i = 0; gs.cursor.sub !== want && i < 8; i++) step(gs, ((want - gs.cursor.sub + 6) % 6 <= 3) ? { right: true } : { left: true })
                    step(gs, { a: true })
                }
                if (!m.solved || gs.strikes !== 0) { fBad = `seed ${seed}: G5 b=${b} solved=${m.solved} strikes=${gs.strikes}`; break outerF }
                fRigs++
            }
        }
        }
    }
    ok(`human flow: tilt, count, solve — D5/G5 answer the printed truth (${fRigs} rigs)`, fRigs >= 20 && !fBad, fBad || `only ${fRigs} rigs`)

    // (g) unlock law — every stamp lives inside the 5-bomb quota (the slope
    // fix revives N6, dead under 2+ceil(r/2)); round 1 is EXACTLY the README set.
    const seen = new Set()
    for (let seed = 1; seed <= 800; seed++) {
        const gs = createGame(seed, 1)
        for (const round of [1, 2, 3, 4, 5]) {
            if (round > 1) { gs.round = round; buildBomb(gs) }
            for (const m of gs.modules) seen.add(m.stamp)
        }
    }
    const missing = ['D5', 'G5', 'N6', 'D4', 'G4', 'N4', 'D6'].filter(s => !seen.has(s))
    ok('every stamp unlocks inside the quota (D5, G5, and the once-dead N6 all generate; #1909 adds D6)', !missing.join(), `missing ${missing.join(',')}`)
    const r1 = ['N', 'D', 'G'].flatMap(t => variantPool(t, 1).map(v => t + v)).sort().join(',')
    ok('round 1 is exactly the README set (N1/N2/D1/D2/G1/G3)', r1 === 'D1,D2,G1,G3,N1,N2', r1)

    // (h) the tilt is observable state — hash and simState carry it (#494).
    const g4 = createGame(5, 1)
    const hUp = hash(g4)
    g4.flip = 1
    ok('hash + simState carry the tilt and the battery count',
        hash(g4) !== hUp && simState(g4).flipped === 1 && simState(g4).batteries === g4.features.batteries)

    // (i) source pin — the silent refusal guard is in the engine text.
    const engSrc14 = readFileSync(new URL('../src/games/TalkMeDown/engine.js', import.meta.url), 'utf8')
    ok('flip refusal is source-pinned in defuserAct', /if \(gs\.flip\) \{[\s\S]{0,200}pad\.down[\s\S]{0,160}return/.test(engSrc14))
}

// ---- 15. serial on the back (#1802): text points at the plate, seat 2 coaches
{
    // (a) every rule reading a back-plate fact (serial / batteries) must SAY
    // where the fact lives — text==truth includes WHERE, not just the math.
    const backRules = []
    for (const key of ['N', 'D', 'G']) {
        for (const r of RULEBOOK[key]) if (/SERIAL|BATTER/i.test(r.text)) backRules.push(r)
    }
    ok('every serial/battery rule prints where the fact lives (BACK)',
        backRules.every(r => /BACK/i.test(r.text)),
        backRules.filter(r => !/BACK/i.test(r.text)).map(r => r.id).join(','))
    // (b) the coach set matches the rules that actually reference back facts
    // (computed from the RULEBOOK, so the set cannot silently rot).
    const computed = backRules.map(r => r.id).sort().join(',')
    ok('BACK_FACT_STAMPS matches the rulebook (no rot)',
        [...BACK_FACT_STAMPS].sort().join(',') === computed, `${computed} vs ${BACK_FACT_STAMPS}`)
    // (c) source pins — the front never prints the serial; the back plate
    // stamps it; the manual page gets the flipped state and the coach line.
    const viewSrc = readFileSync(new URL('../src/games/TalkMeDown/index.jsx', import.meta.url), 'utf8')
    const artSrc15 = readFileSync(new URL('../src/games/TalkMeDown/art.js', import.meta.url), 'utf8')
    ok('the front view prints no serial (source pin)', !/fillText\(\s*'SER\s*'/.test(viewSrc))
    ok('the back plate draws the serial (source pin)',
        /function drawBack\([^)]*serial/.test(artSrc15) && /drawBack\(g, gs\.features\.batteries, tick, gs\.features\.serial,\s*gs\.held\)/.test(viewSrc))
    ok('seat 2 gets the flip coach line, fed by gs.flip (source pin)',
        /ASK THEM TO FLIP IT!/.test(artSrc15) && /BACK IS UP/.test(artSrc15) &&
        /drawManual\([\s\S]{0,240}, gs\.flip\)/.test(viewSrc))
}

// ---- #1894 CALL-BY-KEY: the line is an editor, not a second grammar -------
{
    const K = (buf, code) => applyCallKey(buf, code)
    ok('letters, digits and SPACE compose', K('cut', 'KeyR').buf === 'cutr' && K('7', 'Digit3').buf === '73' && K('cut', 'Space').buf === 'cut ')
    ok('ENTER shouts a held line; ENTER on empty only closes', K('cut red', 'Enter').commit === true && K('', 'Enter').commit === false && K('', 'Enter').close === true)
    ok('Backspace edits, and closing on the last char closes the line', K('red', 'Backspace').buf === 're' && K('a', 'Backspace').close === true)
    ok('X closes what X opened', K('draft', 'KeyX').close === true)
    ok('non-text keys are NOT the line\'s (arrows return null; the shell swallows them, never a pad — pinned live in bombdrive)', K('x', 'ArrowLeft') === null && K('x', 'Tab') === null && K('x', 'Space') !== null)
    ok('W/A/S/D compose as LETTERS (white, set...) — the seat swallow is the shell\'s law', K('', 'KeyW').buf === 'w' && K('', 'KeyS').buf === 's')
    // the fork law: whatever the line builds is just TEXT — the same text the
    // mic hands over — so parseCall decides, once, for both mouths.
    const built = ['KeyC', 'KeyU', 'KeyT', 'Space', 'KeyR', 'KeyE', 'KeyD'].reduce((s, c) => { const r = applyCallKey(s, c); return r ? r.buf : s }, '')
    ok('composed text parses through the SAME grammar (no fork)', built === 'cut red' && JSON.stringify(parseCall(built)) === JSON.stringify(parseCall('cut red')))
    const vSrc = readFileSync(new URL('../src/games/TalkMeDown/voice.js', import.meta.url), 'utf8')
    const fnBody = /export function applyCallKey\([\s\S]*?\n\}/.exec(vSrc)?.[0] || ''
    ok('applyCallKey holds no grammar of its own (source pin)', fnBody.length > 0 && !/parseCall|RULEBOOK/.test(fnBody))
    ok('KEY_CALL_HINT names the channel, not the shapes (one source stays alone)', /C/.test(KEY_CALL_HINT) && /ENTER/.test(KEY_CALL_HINT) && !KEY_CALL_HINT.includes('"CUT') && !KEY_CALL_HINT.includes('"SET'))
    ok('the coach fits the footer budget (<= the shapes line)', KEY_CALL_HINT.length <= ACCEPTED_HINT.length, `${KEY_CALL_HINT.length} vs ${ACCEPTED_HINT.length}`)
    ok('CALL_LINE_MAX is a real budget', CALL_LINE_MAX >= 12 && CALL_LINE_MAX <= 42, String(CALL_LINE_MAX))
    const viewSrc16 = readFileSync(new URL('../src/games/TalkMeDown/index.jsx', import.meta.url), 'utf8')
    const artSrc16 = readFileSync(new URL('../src/games/TalkMeDown/art.js', import.meta.url), 'utf8')
    ok('the commit routes through voiceCall — the mic\'s own entry (source pin)',
        /if \(r\.commit\)[\s\S]{0,140}voiceCall\(/.test(viewSrc16))
    ok('the glass draws the call line (source pin)',
        /function drawCallLine\(/.test(artSrc16) && /ART\.drawCallLine\(g, callRef\.current\.buf/.test(viewSrc16))
    ok('the footer swaps shapes for the coach by mic state (source pin)',
        /micOn \? ACCEPTED_HINT : KEY_CALL_HINT/.test(artSrc16))
    ok('the channel key never reaches the seat maps (source pin: KeyX is the mouth, not a pad)',
        !/KeyX:\s*'/.test(viewSrc16) && /if \(e\.code === 'KeyX'\)/.test(viewSrc16))
    ok('j, q, x are letters no call needs (the open key cannot starve a shape)',
        ['cut','cuts','snip','clip','remove','pull','yank','red','blue','yellow','green','white','black','press','hit','push','tap','touch','star','diamond','club','spade','bolt','moon','neon','wires','dial','glyph','symbols','page','flip','turn','set','confirm','done','engage','tilt','zero','one','two','three','four','five','six','seven','eight','nine']
            .every(w => !/[jq]/.test(w)),
        'grammar vocab contains j/q')
}

// ---- #1909 THE DRAIN: the back plate is physical, D6 spends a battery ------
{
    // (a) unlock law — D6 surfaces at round 5 (the deepest DIAL seat), and
    // the G pool stayed at 5: GLYPH seats only round 4/depth 5, so a G6
    // could never generate (caught pre-ship; the drain rides the dial alone).
    ok('D6 unlocks exactly at round 5', variantPool('D', 5).includes(6) && !variantPool('D', 4).includes(6))
    ok('G pool carries no dead stamp (no unreachable G6)', variantPool('G', 5).join(',') === '1,3,5,2,4', variantPool('G', 5).join(','))

    // (b) generation law — D6 lands only where there is a battery to spend.
    let d6 = 0, dBad = ''
    for (const round of [3, 5]) {
        for (let seed = 1; seed <= 1200 && !dBad; seed++) {
            const gs = createGame(seed, 2); gs.round = round; buildBomb(gs)
            if (gs.modules.some(m => m.stamp === 'D6')) { d6++; if (gs.features.batteries < 1) dBad = `round ${round} seed ${seed}: D6 with an empty plate` }
        }
    }
    ok(`D6 generates only with batteries >= 1 (${d6} bombs, rounds 3+5)`, !dBad && d6 >= 100, dBad || `only ${d6}`)

    // (c) human flow — the exact page procedure: flip, drain, dial the number
    // LEFT, SET. Zero strikes.
    let rigs = 0, rBad = ''
    for (let seed = 1; seed <= 3000 && rigs < 40 && !rBad; seed++) {
        const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
        const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
        const b = gs.features.batteries, d = gs.modules[di]
        step(gs, { up: true }); step(gs, { a: true }); step(gs, { down: true })
        for (let g = 0; gs.cursor.mod !== di && g < 8; g++) step(gs, { down: true })
        while (d.dial !== b - 1) step(gs, d.dial < b - 1 ? { right: true } : { left: true })
        const t = computeTarget(gs, d)
        step(gs, { a: true })
        if (!(d.solved && gs.strikes === 0 && t.dial === b - 1)) rBad = `seed ${seed}: solved=${d.solved} strikes=${gs.strikes} t=${JSON.stringify(t)}`
        rigs++
    }
    ok(`page procedure: flip, drain, dial LEFT, SET solves (${rigs} rigs)`, !rBad && rigs >= 20, rBad || `only ${rigs}`)

    // (d) SET before the drain is the wrong action — and the strike NAMES it.
    {
        let named = false
        for (let seed = 1; seed <= 500 && !named; seed++) {
            const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
            const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
            const d = gs.modules[di]; gs.cursor.mod = di
            while (d.dial !== gs.features.batteries - 1) step(gs, { right: true })
            drainEvents(gs); step(gs, { a: true })
            const ev = drainEvents(gs).filter(e => e.k === 'strike')
            named = gs.strikes === 1 && ev[0] && ev[0].why === 'battery still in place'
        }
        ok('SET before the drain strikes once and names the missed step', named)
    }

    // (e) the pocket law — A toggles out/in, but EDGE-triggered: one press,
    // one action. A held key (~5 samples) must NOT ratchet pull-push-pull;
    // empty and full ends refuse silently.
    {
        let s = null, e = null
        for (let seed = 1; seed <= 300; seed++) { const g = createGame(seed, 1); if (g.features.batteries === 2) { s = g; break } }
        const b0 = s.features.batteries
        step(s, { up: true }); drainEvents(s)
        step(s, { a: true }); step(s, { a: true }); step(s, { a: true }) // one ~3-tick press
        const oneOut = s.features.batteries === b0 - 1 && s.held === 1 && s.pulls === 1
        step(s, { a: false }); step(s, { a: true })                        // release, press again
        const backIn = s.held === 0 && s.features.batteries === b0 && s.pulls === 1
        ok('A toggles the pocket once per press (edge law); pulls count presses out', oneOut && backIn, `out=${oneOut} in=${backIn}`)
        for (let seed = 1; seed <= 300; seed++) { const g = createGame(seed, 1); if (g.features.batteries === 0) { e = g; break } }
        step(e, { up: true }); drainEvents(e)
        step(e, { a: true })
        ok('empty plate: A stays silent (no event, no strike)', drainEvents(e).length === 0 && e.strikes === 0)
    }

    // (f) live-count truth — the drain answers every battery rule live: pull
    // one and a D5/G5 now demands the NEW count (the page says COUNT, never
    // a frozen digit — text==truth stays whole through the trick). The drain
    // is free on any bomb, so this rides rounds where those rules seat
    // (D5 rounds 3+5, G5 round 4 — D6 never co-seats with either).
    {
        let ligs = 0, lBad = ''
        outerF2:
        for (const round of [3, 4, 5]) {
            for (let seed = 1; seed <= 1500 && ligs < 24 && !lBad; seed++) {
                const gs = createGame(seed, 2); gs.round = round; buildBomb(gs)
                if (gs.features.batteries < 1) continue
                const rule = gs.modules.find(m => m.stamp === 'D5' || m.stamp === 'G5')
                if (!rule) continue
                const t0 = computeTarget(gs, rule)
                step(gs, { up: true }); step(gs, { a: true })
                const t1 = computeTarget(gs, rule)
                const shift = v => v.map((n, i) => (rule.stamp === 'G5' && i === 1 ? n : n - 1))
                const want = rule.stamp === 'D5' ? [t0.dial - 1] : shift(t0.seq)
                const got = rule.stamp === 'D5' ? [t1.dial] : t1.seq
                if (got.join() !== want.join()) { lBad = `seed ${seed} r${round} ${rule.stamp} ${t0.seq || t0.dial} -> ${t1.seq || t1.dial}`; break outerF2 }
                ligs++
            }
        }
        ok(`drain shifts live battery rules (${ligs} rigs: D5/G5 answer the NEW count)`, !lBad && ligs >= 8, lBad || `only ${ligs}`)
    }

    // (g) the autopilot drains — solvePad spends the battery for D6 and still
    // wins every seed; watch/attract/harness all share this one brain.
    {
        let drained = 0, won = 0
        for (let seed = 1; seed <= 2000; seed++) {
            const g = createGame(seed, 1)
            let sawPull = false
            for (let i = 0; i < 60000 && !g.done; i++) { step(g, solvePad(g)); if (g.pulls > 0) sawPull = true }
            if (g.done && g.won) { won++; if (sawPull) drained++ }
        }
        ok(`solvePad drains for D6 and wins (${drained} drained campaigns, ${won}/2000 won)`, drained >= 5 && won === 2000, `${drained} drained, ${won} won`)
    }

    // (h) the CPU manual orders the pull first, exactly as the page prints.
    {
        let ordered = false
        for (let seed = 1; seed <= 500 && !ordered; seed++) {
            const gs = createGame(seed, 1); gs.round = 5; buildBomb(gs)
            const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
            gs.cursor.mod = di
            for (let i = 0; i < 120 && !gs.order; i++) step(gs, {})
            ordered = !!(gs.order && gs.order.startsWith('PULL A BATTERY, THEN DIAL'))
        }
        ok('solo partner orders "PULL A BATTERY, THEN DIAL n, THEN SET"', ordered)
    }

    // (i) observable state + determinism — held/pulls ride hash & simState, and
    // the remote snapshot carries them (additive hp; old snaps restore full).
    {
        const x = createGame(777, 1); const y = createGame(777, 1); const plain = createGame(777, 1)
        step(x, { up: true }); step(x, { a: true })
        step(y, { up: true }); step(y, { a: true })
        ok('drained sims hash equal; drained differs from undrained', hash(x) === hash(y) && hash(x) !== hash(plain))
        const sx = simState(x)
        ok('simState carries held/pulls (harness visibility)', sx.held === x.held && sx.pulls === x.pulls && (x.held === 1 || x.features.batteries === 0))
        const netSrc = readFileSync(new URL('../src/games/TalkMeDown/net.js', import.meta.url), 'utf8')
        ok('the snapshot wires held/pulls (source pin)', /hp:\s*\[gs\.held,\s*gs\.pulls\]/.test(netSrc) && /snap\.hp\s*\?\s*snap\.hp\[0\]/.test(netSrc))
    }

    // (j) source pins — the drain lives once, in the engine, edge-latched; the
    // art draws the pocket and the action hint.
    {
        const engSrc16 = readFileSync(new URL('../src/games/TalkMeDown/engine.js', import.meta.url), 'utf8')
        ok('the drain is edge-latched in defuserAct (source pin)', /const aTap = pad\.a && !gs\.aPrev/.test(engSrc16) && /if \(aTap && gs\.held === 0 && gs\.features\.batteries > 0\)/.test(engSrc16))
        ok('solvePad drains for pull rules (source pin)', /ruleOf\(x\)\.pull && gs\.pulls === 0 && gs\.features\.batteries >= 1/.test(engSrc16))
        ok('D6 carries its pull marker (source pin)', /id: 'D6', pull: true/.test(engSrc16))
        const artSrc16 = readFileSync(new URL('../src/games/TalkMeDown/art.js', import.meta.url), 'utf8')
        ok('the back plate draws the pocket and the action hint (source pin)', /IN HAND/.test(artSrc16) && /A PUTS IT BACK/.test(artSrc16) && /A PULLS ONE OUT/.test(artSrc16))
    }
}

console.log(`\nbombcheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
