// viperpitcheck — proves VIPER PIT boots, its core rules hold, and it can be
// won. Part A runs the shared fighting core (guardButton mode) in plain Node:
// the #1096 differences — the dedicated GUARD verb (back-walking never
// blocks), launching uppercuts, qcbf finishing moves that end a wounded
// opponent in style — plus the inherited rules (block/chip, low-block, throw
// through guard, projectiles, cancel-combos, seeded determinism) and every
// ladder CPU completing a match — plus #1106 juggle rules (a launched foe
// hangs in a pocket; exactly one aerial follow-up lands, the next is locked
// until the floor resets). Part B drives the cabinet in headless Chrome
// with real key events: attract → select → fight → K.O., inputs reaching the
// sim, the drawn frame moving. `--mutate` proves the harness can fail: a dead
// guard (blockHeld never true) must let heavies smash through the GUARD, and
// a removed juggle cap must let the third aerial hit connect.
//
//   npm run viperpitcheck              # Node rules + browser drive
//   npm run viperpitcheck -- --mutate  # prove red
//   needs `npm run dev` for Part B (VIPERPIT_URL to point elsewhere)

import { writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { launch, requireDevServer, relayNoise } from './lib/harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const URL = process.env.VIPERPIT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/viper-pit`
const MUT = process.argv.includes('--mutate')

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.error(`FAIL  ${msg}`) } }

const P = (o = {}) => ({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, bk: false, ...o })
const bust = (p) => `${p}?c=${Date.now()}${MUT ? 'm' : ''}`

console.log(`viperpitcheck part A: fighting core + guard-button + juggle rules${MUT ? ' (MUTANT: guard dead, juggle cap lifted)' : ''}`)
const SRC = path.join(HERE, '../src/engine/fighting.js')
if (MUT) {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'))
    const mutated = src
        .replace(
            'f.blockHeld = !!pad.bk && groundedIdle',
            'f.blockHeld = !!pad.bk && groundedIdle && !globalThis.__VIPER_NOGUARD__')
        .replace(
            'if (m.juggle && airborne && def.juggled >= 1) {',
            'if (m.juggle && airborne && def.juggled >= (globalThis.__VIPER_NOLOCK__ ? 99 : 1)) {')
    ok(mutated.includes('__VIPER_NOGUARD__'), 'mutate: guard gate line found to patch')
    ok(mutated.includes('__VIPER_NOLOCK__'), 'mutate: juggle lock gate line found to patch')
    writeFileSync(path.join(HERE, '../src/engine/.mutant-fighting.mjs'), mutated)
}
const ENG_PATH = MUT ? '../src/engine/.mutant-fighting.mjs' : '../src/engine/fighting.js'
const e = await import(bust(ENG_PATH))
const { ROSTER, BY_ID, LADDER } = await import(bust('../src/games/ViperPit/fighters.js'))

ok(ROSTER.length >= 5, `roster has ${ROSTER.length} distinct fighters`)
ok(LADDER.length >= 5, 'street ladder has 5 opponents')
ok(ROSTER.every((d) => d.moves.lp && d.moves.hp && d.moves.lk && d.moves.hk && d.moves.throw), 'every fighter has punch/kick/throw verbs')
ok(ROSTER.every((d) => (d.moves.dp || d.moves.charge) && (d.moves.dp ? d.moves.dp.launch > 0.1 : d.moves.charge.launch > 0.07)), 'every fighter has a launching uppercut/power')
ok(ROSTER.every((d) => d.moves.qcbf && d.moves.qcbf.finisher), 'every fighter has a signature FINISHING MOVE (qcbf finisher)')
ok(ROSTER.every((d) => d.specials.qcb && d.moves.qcb && d.moves.qcb.type === 'special' && d.moves.qcb.startup >= 1 && d.moves.qcb.active >= 1 && d.moves.qcb.recovery >= 1 && d.moves.qcb.dmg >= 5 && d.moves.qcb.hitstun >= 10 && d.moves.qcb.blockstun >= 5 && d.moves.qcb.push >= 0.1 && Array.isArray(d.moves.qcb.box) && d.moves.qcb.box.length === 4), 'every fighter has a qcb counter special with real frame data')
ok(ROSTER.every((d) => d.finish), 'every finisher is named')

const human = (id) => ({ ...BY_ID[id], cpu: false })
const mk = (p1 = 'riv', p2 = 'nyx', seed = 5) => {
    const m = e.createMatch({ seed, guardButton: true, juggle: true, p1: human(p1), p2: human(p2) })
    let g = 0
    while (m.phase !== 'fight' && g++ < 400) e.step(m, [P(), P()])
    return m
}
const QCBF = [{ down: true }, { down: true, left: true }, { left: true }, { down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }, { right: true }]
const QCF = [{ down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }]
const DP = [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }, {}]
const QCB = [{ down: true }, { down: true, left: true }, { left: true }, { left: true, lp: true }]

// a heavy punch lands for its frame data
let m = mk()
m.fighters[1].x = m.fighters[0].x + 1.2
let hp = m.fighters[1].hp
e.step(m, [P({ hp: true }), P()])
for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
ok(MUT ? hp - m.fighters[1].hp === 9 : hp - m.fighters[1].hp === 9, `heavy punch deals ${hp - m.fighters[1].hp} dmg`)

if (!MUT) {
    // GUARD blocks (chip only)
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P({ bk: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P(), P({ bk: true })])
    ok(m.fighters[1].st === 'blockstun' && hp - m.fighters[1].hp <= 1, `GUARD takes ${hp - m.fighters[1].hp} (chip), st ${m.fighters[1].st}`)

    // back-walking is NOT blocking (the MK difference)
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.6
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P({ left: true })])
    for (let i = 0; i < 16; i++) e.step(m, [P(), P({ left: true })])
    ok(hp - m.fighters[1].hp >= 8, `back-walking does NOT block (${hp - m.fighters[1].hp} dmg taken)`)

    // lows need GUARD+DOWN
    m = mk('nyx', 'riv')
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ bk: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ bk: true })])
    ok(hp - m.fighters[1].hp >= 4, `low kick hits a standing GUARD (${hp - m.fighters[1].hp} dmg)`)
    m = mk('nyx', 'riv')
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ bk: true, down: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ bk: true, down: true })])
    ok(hp - m.fighters[1].hp <= 1, `GUARD+DOWN blocks the low (${hp - m.fighters[1].hp} dmg)`)

    // throws beat GUARD
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ right: true }), P({ bk: true })])
    e.step(m, [P({ right: true, hp: true }), P({ bk: true })])
    for (let i = 0; i < 24; i++) e.step(m, [P(), P({ bk: true })])
    ok(hp - m.fighters[1].hp >= 12, `throw goes through GUARD (${hp - m.fighters[1].hp} dmg)`)

    // projectile fires and hits
    m = mk('cinder', 'nyx')
    m.fighters[1].x = m.fighters[0].x + 3.5
    hp = m.fighters[1].hp
    for (const fr of QCF) e.step(m, [fr, P()])
    for (let i = 0; i < 80; i++) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 7, `projectile crosses and hits (${hp - m.fighters[1].hp} dmg)`)

    // uppercut launches
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.1
    for (const fr of DP) e.step(m, [fr, P()])
    let airSeen = false
    for (let i = 0; i < 30; i++) { e.step(m, [P(), P()]); if (m.fighters[1].y > 0.15) airSeen = true }
    ok(airSeen || (m.fighters[1].hp < 100 && m.fighters[1].st === 'hitair'), 'uppercut launches the victim airborne')

    // finisher: wounded foe is FINISHED
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    m.fighters[0].meter = 100
    m.fighters[1].hp = 25
    let finished = false
    for (const fr of QCBF) { e.step(m, [fr, P()]) }
    for (let i = 0; i < 40; i++) {
        e.step(m, [P(), P()])
        if (m.events.some((x) => x.kind === 'finish')) finished = true
    }
    ok(finished && m.phase === 'ko' && m.banner === 'FINISH!' && m.fighters[1].hp === 0, 'qcbf finisher ends a wounded foe (FINISH!)')

    // finisher on healthy foe: big damage, no KO
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    m.fighters[0].meter = 100
    for (const fr of QCBF) e.step(m, [fr, P()])
    for (let i = 0; i < 40; i++) e.step(m, [P(), P()])
    ok(m.phase === 'fight' && m.fighters[1].hp > 40 && m.fighters[1].hp < 100, `finisher on healthy foe is big, not a KO (hp ${m.fighters[1].hp})`)

    // qcf must not be stolen by the qcbf parser
    m = mk('riv', 'nyx')
    m.fighters[1].x = m.fighters[0].x + 3.5
    for (const fr of QCF) e.step(m, [fr, P()])
    ok(m.fighters[0].move === 'qcf', `plain down-forward still fires the special (${m.fighters[0].move})`)

    // qcb counter: down-back + punch fires it (resolved after qcbf)
    m = mk('riv', 'nyx')
    m.fighters[1].x = m.fighters[0].x + 1.5
    for (const fr of QCB) e.step(m, [fr, P()])
    ok(m.fighters[0].move === 'qcb', `down-back + punch fires the qcb counter (${m.fighters[0].move})`)

    // qcb must not steal the qcbf finisher's d,b prefix at full meter
    m = mk('riv', 'nyx')
    m.fighters[1].x = m.fighters[0].x + 1.2
    m.fighters[0].meter = 100
    for (const fr of QCBF) e.step(m, [fr, P()])
    ok(m.fighters[0].move === 'qcbf', `full qcbf at max meter fires the finisher, not the qcb counter (${m.fighters[0].move})`)

    // cancel combo: light into heavy chains
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ lp: true }), P()])
    for (let i = 0; i < 8; i++) e.step(m, [P(), P()])
    e.step(m, [P({ hp: true }), P()])
    for (let i = 0; i < 20; i++) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 13, `lp→hp chains for ${hp - m.fighters[1].hp} dmg (cancel window)`)

    // juggle (#1106): launched victims hang in a pocket, exactly ONE aerial
    // follow-up lands, the next is refused even in range, recovery resets it
    const groundedAtk = (mm) => { let w = 0; while ((mm.fighters[0].st === 'attack' || mm.fighters[0].y > 0) && w++ < 90) e.step(mm, [P(), P()]) }
    const pin = (mm) => { mm.fighters[1].x = mm.fighters[0].x + 1.2; if (mm.fighters[1].y < 0.8) mm.fighters[1].y = 0.8 }
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.1
    for (const fr of DP) e.step(m, [fr, P()])
    groundedAtk(m)
    hp = m.fighters[1].hp
    for (const fr of DP) e.step(m, [fr, P()])
    let fj = 0
    while (m.fighters[1].hp === hp && fj++ < 20) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 8 && m.fighters[0].combo === 2 && m.fighters[1].juggled === 1,
        `juggle: aerial follow-up on a launched foe lands (${hp - m.fighters[1].hp} dmg, combo ${m.fighters[0].combo})`)
    groundedAtk(m)
    hp = m.fighters[1].hp
    for (const fr of DP) { pin(m); e.step(m, [fr, P()]) }
    for (let i = 0; i < 12; i++) { pin(m); e.step(m, [P(), P()]) }
    ok(hp - m.fighters[1].hp === 0, `juggle lock: third aerial hit refused even in range (${hp - m.fighters[1].hp} dmg)`)
    let gj = 0
    while (m.fighters[1].st !== 'idle' && gj++ < 300) e.step(m, [P({ right: true }), P()])
    hp = m.fighters[1].hp
    for (const fr of DP) e.step(m, [fr, P()])
    fj = 0
    while (m.fighters[1].hp === hp && fj++ < 25) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 8 && m.fighters[1].juggled === 0, 'juggle lock clears on recovery — the floor resets the combo game')

    // guard crush (#1106): a guard that absorbs enough blocked hits CRUSHES —
    // the defender is stunned, takes chip, and a follow-up punch can no longer
    // be blocked (the punish window opens). The gauge regens once not guarding.
    {
        const mkC = (seed = 5) => {
            const mm = e.createMatch({ seed, guardButton: true, juggle: true, guardCrush: true, p1: human('riv'), p2: human('nyx') })
            let g = 0
            while (mm.phase !== 'fight' && g++ < 400) e.step(mm, [P(), P()])
            return mm
        }
        m = mkC()
        m.fighters[1].guard = 24
        let sawCrush = false
        for (let round = 0; round < 8 && !sawCrush; round++) {
            let w = 0
            while (m.fighters[0].st !== 'idle' && w++ < 90) e.step(m, [P(), P({ bk: true })])
            m.fighters[1].x = m.fighters[0].x + 1.3
            e.step(m, [P({ hp: true }), P({ bk: true })])
            for (let i = 0; i < 24; i++) { e.step(m, [P(), P({ bk: true })]); if (m.events.some((x) => x.kind === 'crush')) { sawCrush = true; break } }
        }
        ok(sawCrush, `guard crushes after absorbing repeated blocks (p2 ${m.fighters[1].st}, guard ${m.fighters[1].guard})`)
        ok(m.events.some((x) => x.kind === 'crush'), 'guard-break event fires (the punish window opens)')
        m = mkC()
        m.fighters[1].x = m.fighters[0].x + 1.2
        m.fighters[1].st = 'crush'; m.fighters[1].stun = 46; m.fighters[1].sf = 0; m.fighters[1].guard = 0
        const hpC = m.fighters[1].hp
        e.step(m, [P({ hp: true }), P({ bk: true })])
        for (let i = 0; i < 14; i++) e.step(m, [P(), P({ bk: true })])
        ok(hpC - m.fighters[1].hp >= 8, `a crushed foe can't block — the punish connects (${hpC - m.fighters[1].hp} dmg)`)
        m = mkC()
        m.fighters[1].guard = 30
        let gRegen = 0
        while (m.fighters[1].guard < 90 && gRegen++ < 200) e.step(m, [P(), P()])
        ok(m.fighters[1].guard >= 90, `guard gauge regens while not guarding (${m.fighters[1].guard})`)
    }

    // determinism
    const run = (seed) => {
        const mm = e.createMatch({ seed, guardButton: true, juggle: true, p1: { ...BY_ID.riv, cpu: true }, p2: human('krax') })
        const hs = []
        for (let k = 0; k < 300; k++) {
            e.step(mm, [P({ left: k % 61 >= 44, bk: k % 40 < 8, lp: k % 29 === 0 }), P({ left: k % 61 < 22, bk: k % 50 < 10 })])
            hs.push(e.matchHash(mm))
        }
        return hs.join(',')
    }
    ok(run(3) === run(3), 'same seed + same pads -> identical hash stream')
    ok(run(3) !== run(4), 'different seed -> different stream')

    // the game can be won: every ladder CPU beats an idle dummy
    for (const id of LADDER) {
        const mm = e.createMatch({ seed: 1234, guardButton: true, juggle: true, p1: { ...BY_ID[id], cpu: true }, p2: human('nyx') })
        let g = 0
        while (mm.phase !== 'done' && g++ < 60 * 60 * 4) e.step(mm, [P(), P()])
        ok(mm.phase === 'done' && mm.winner === 0 && mm.fighters[0].wins >= 2, `CPU ${id} completes a match vs idle`)
    }

    // clock + round structure
    m = mk()
    const t0 = m.timer
    for (let i = 0; i < 60; i++) e.step(m, [P(), P()])
    ok(m.timer === t0 - 60, 'clock ticks 1 per second')

    // #1106 audio slice — the hit event must carry the move key so the cabinet
    // can tell a throw slam / launcher hit from a plain punch
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    e.step(m, [P({ hp: true }), P()])
    for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
    const hpEv = m.events.find((x) => x.kind === 'hit')
    ok(hpEv && hpEv.mv === 'hp', `hit event carries the move key (mv=${hpEv && hpEv.mv})`)
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    e.step(m, [P({ right: true }), P()])
    e.step(m, [P({ right: true, hp: true }), P()])
    for (let i = 0; i < 24; i++) e.step(m, [P(), P()])
    const throwEv = m.events.find((x) => x.kind === 'hit' && x.mv === 'throw')
    ok(!!throwEv, 'throw hit event carries mv=throw (the slam seam)')
}

if (MUT) {
    globalThis.__VIPER_NOGUARD__ = true
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P({ bk: true })])
    for (let i = 0; i < 16; i++) e.step(m, [P(), P({ bk: true })])
    ok(hp - m.fighters[1].hp === 9, 'MUTANT check: guard gate removed → heavies smash through (harness bites)')
    globalThis.__VIPER_NOGUARD__ = false
    // juggle-lock mutant: the aerial follow-up cap removed → the third hit lands
    globalThis.__VIPER_NOLOCK__ = true
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.1
    for (const fr of DP) e.step(m, [fr, P()])
    let wm = 0
    while ((m.fighters[0].st === 'attack' || m.fighters[0].y > 0) && wm++ < 90) e.step(m, [P(), P()])
    hp = m.fighters[1].hp
    for (const fr of DP) e.step(m, [fr, P()])
    let fm = 0
    while (m.fighters[1].hp === hp && fm++ < 20) e.step(m, [P(), P()])
    const mutJuggle = hp - m.fighters[1].hp
    while ((m.fighters[0].st === 'attack' || m.fighters[0].y > 0) && wm++ < 180) e.step(m, [P(), P()])
    hp = m.fighters[1].hp
    for (const fr of DP) { m.fighters[1].x = m.fighters[0].x + 1.2; if (m.fighters[1].y < 0.8) m.fighters[1].y = 0.8; e.step(m, [fr, P()]) }
    for (let i = 0; i < 12; i++) { m.fighters[1].x = m.fighters[0].x + 1.2; if (m.fighters[1].y < 0.8) m.fighters[1].y = 0.8; e.step(m, [P(), P()]) }
    ok(mutJuggle >= 8 && hp - m.fighters[1].hp >= 8, `MUTANT check: juggle cap removed → unlimited air juggles (${mutJuggle} then ${hp - m.fighters[1].hp})`)
    globalThis.__VIPER_NOLOCK__ = false
    unlinkSync(path.join(HERE, '../src/engine/.mutant-fighting.mjs'))
}

// ---- #1106 audio wiring gate ---------------------------------------------------------
// The SFX live inside a React component (not runnable in Node), so the gate is
// source-level on the call sites, plus a mutant proving the gate bites — the
// same pattern lemcheck/gauntletcheck use for audio.
{
    const fs = await import('node:fs')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    const asrc = fs.readFileSync(path.join(HERE, '../src/utils/AudioController.js'), 'utf8')
    const audioGates = [
        ['launcher whoosh at move start (rising sweep)', /playSweep\(160, 640, 0\.16, 'sawtooth', 0\.055\)/],
        ['launcher whoosh air (filtered noise)', /playFilteredNoise\(0\.13, 0\.09, 1600\)/],
        ['throw grunt at move start', /playSweep\(120, 55, 0\.15, 'sawtooth', 0\.1\)/],
        ['throw slam keys off the hit event move', /mdef\.type === 'throw'/],
        ['throw slam impact (falling sweep)', /playSweep\(95, 28, 0\.26, 'sawtooth', 0\.16\)/],
        ['swing trigger is the st:move start transition', /pre\[i\] !== 'attack:' \+ f\.move/],
        ['KO crowd surge (filtered swell)', /playFilteredNoise\(1\.1, 0\.16, 480\)/],
        ['stage bed starts with the fight', /audioController\.startMusic\(stage\.bed\)/],
        ['stage bed stops on unmount', /audioController\.stopMusic\(\)/],
    ]
    for (const [label, re] of audioGates) ok(re.test(gsrc), `audio gate: ${label}`)
    for (const fid of ['nyx', 'cinder', 'vess', 'riv']) ok(gsrc.includes(`fid === '${fid}'`), `finisher sting: ${fid} voice`)
    ok(gsrc.includes("playTone(82, 0.22, 'square', 0.12)"), 'finisher sting: krax voice')
    for (const bed of ['viperAlley', 'viperFoundry', 'viperSubway']) ok(new RegExp(`${bed}: \\{`).test(asrc), `MUSIC bed ${bed} registered`)
    // mutant: strip the whoosh + krax sting — the gate must fail
    const mutSrc = gsrc
        .replace("audioController.playSweep(160, 640, 0.16, 'sawtooth', 0.055)", '')
        .replace("audioController.playTone(82, 0.22, 'square', 0.12)", '')
    ok(!/playSweep\(160, 640, 0\.16, 'sawtooth', 0\.055\)/.test(mutSrc) && !mutSrc.includes("playTone(82, 0.22, 'square', 0.12)"), 'mutant: stripped whoosh/sting fails the gate (harness bites)')
}

// ---- #1106 intro / outround dialogue gate ----------------------------------------
// Arcade fighters talk: the opponent taunts at the round intro and the winner
// gets the last word over the loser's reply. Data gate (intro/win/lose/voice
// on every fighter, lines distinct), source gates on the cabinet (quote set at
// fight start and every round intro, the outround card pairs both lines, the
// card draws + decays per frame, the DEV quote() probe), plus a mutant that
// strips NYX's win line — the data gate must fail.
{
    const fs = await import('node:fs')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok(ROSTER.every((d) => typeof d.intro === 'string' && d.intro.length >= 8), 'dialogue: every fighter has an intro taunt')
    ok(ROSTER.every((d) => typeof d.win === 'string' && d.win.length >= 4), 'dialogue: every fighter has a win line')
    ok(ROSTER.every((d) => typeof d.lose === 'string' && d.lose.length >= 4), 'dialogue: every fighter has a lose line')
    ok(new Set(ROSTER.map((d) => d.intro)).size === ROSTER.length, 'dialogue: intro taunts are distinct per fighter')
    ok(new Set(ROSTER.map((d) => d.win)).size === ROSTER.length, 'dialogue: win lines are distinct per fighter')
    ok(new Set(ROSTER.map((d) => d.lose)).size === ROSTER.length, 'dialogue: lose lines are distinct per fighter')
    ok(ROSTER.every((d) => Array.isArray(d.voice) && d.voice.length === 3 && d.voice.every((hz) => hz > 60 && hz < 1200)), 'dialogue: every fighter has a 3-note voice blip')
    const talkGates = [
        ['taunt is spoken when a fight starts', /if \(d2raw\.intro\) say\(d2raw, 'intro', 'intro'\)/],
        ['new round replays the opponent taunt', /say\(m\.fighters\[1\]\.def, 'intro', 'intro'\)/],
        ['outround pairs the winner line with the loser reply', /say\(wd, 'win', 'win', ld\.name \+ ': ' \+ ld\.lose\)/],
        ['every spoken line gets a voice blip', /voiceBlip\(d\)/],
        ['dialogue card draws on the cabinet', /if \(quote && quote\.t > 0\)/],
        ['dialogue card decays per frame', /quote\.t--/],
        ['DEV hook exposes the live quote', /quote\(\) \{ return quote && quote\.t > 0/],
    ]
    for (const [label, re] of talkGates) ok(re.test(gsrc), `dialogue gate: ${label}`)
    // mutant: strip NYX's win line — the data gate must fail on it
    const fsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/fighters.js'), 'utf8')
    const mutF = fsrc.replace("win: 'QUIET NIGHT. QUIET WIN.', ", '')
    ok(mutF !== fsrc, 'mutate: win line found to patch')
    writeFileSync(path.join(HERE, '../src/games/ViperPit/.mutant-fighters.mjs'), mutF)
    const mutRoster = (await import(bust('../src/games/ViperPit/.mutant-fighters.mjs'))).ROSTER
    ok(!mutRoster.every((d) => typeof d.win === 'string' && d.win.length >= 4), 'mutant: stripped win line fails the dialogue gate (harness bites)')
    unlinkSync(path.join(HERE, '../src/games/ViperPit/.mutant-fighters.mjs'))
}

// ---- #1106 stage-life wiring gate ---------------------------------------------------
// The pits must live: foundry molten pulses and casts light, alley rain falls,
// a subway train light-sweeps past. Source-level gates + a mutant proving the
// gate bites; part B probes the live cabinet through __viperPitTest.fx().
{
    const fs = await import('node:fs')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    const stageGates = [
        ['molten glow breathes (slow pulse)', /0\.5 \* Math\.sin\(tSec \* 1\.4\)/],
        ['molten cast light (PointLight over the pool)', /new THREE\.PointLight\(0xff6a20/],
        ['alley rain streaks (LineSegments)', /new THREE\.LineSegments\(rGeo/],
        ['rain falls (streak positions advanced)', /rp\.array\[i \* 6 \+ 1\] -= dy/],
        ['subway sweep light (PointLight on the track)', /new THREE\.PointLight\(0xdce8ff/],
        ['sweep crosses the pit with time', /s\.light\.position\.x = -15 \+ k \* 30/],
        ['train windows flash during the pass', /w\.material\.opacity = 0\.75 \+ 0\.25 \* Math\.sin\(Math\.PI \* k\)/],
    ]
    for (const [label, re] of stageGates) ok(re.test(rsrc), `stage-life gate: ${label}`)
    ok(/fx\(\) \{/.test(gsrc) && /stage\(i\) \{ startFight\(i, 'cpu'\) \}/.test(gsrc), 'stage-life gate: dev hooks expose fx() and jump stages')
    ok(/stageFx\.sweep\.force = performance\.now\(\) \/ 1000/.test(gsrc), 'stage-life gate: sweep can be forced for the probe')
    // mutant: kill the molten pulse — the gate must fail
    const mutR = rsrc.replace('0.5 + 0.5 * Math.sin(tSec * 1.4)', '0.5')
    ok(!/0\.5 \* Math\.sin\(tSec \* 1\.4\)/.test(mutR), 'mutant: dead molten pulse fails the gate (harness bites)')
}

// ---- #1106 stage midground gate ------------------------------------------------
// Each pit has a midground layer beyond the flat backdrop (variety), and the
// props react to the fight: a fighter rushing past, or a forced kick, rocks them.
// Data gate on stages.js, source gates on render.js/index.jsx, a dead-sway
// mutant, and a part B runtime probe through __viperPitTest.fx()/midKick().
{
    const fs = await import('node:fs')
    const { STAGES } = await import(bust('../src/games/ViperPit/stages.js'))
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok(STAGES.length >= 3 && STAGES.every((s) => Array.isArray(s.midground) && s.midground.length >= 3),
        'each pit defines a midground layer (>=3 props)')
    const midGates = [
        ['midground pivot groups built from the stage data', /const midItems = \(stage\.midground \|\| \[\]\)\.map\(/],
        ['midground exposed on the fx handle', /mid: midFx/],
        ['breeze (wall-clock sway on each prop)', /Math\.sin\(tSec \* 1\.6 \+ it\.phase\) \* it\.base/],
        ['kick from a fighter rushing past (proximity * |vx|)', /Math\.abs\(f\.vx \|\| 0\) \/ 1\.6/],
        ['live sway tracked for the probe', /md\.maxSway = Math\.max\(md\.maxSway, Math\.abs\(sway\)\)/],
    ]
    for (const [label, re] of midGates) ok(re.test(rsrc), `midground gate: ${label}`)
    ok(/midKick\(\) \{ if \(stageFx && stageFx\.mid\) stageFx\.mid\.force = 1 \}/.test(gsrc), 'midground gate: dev hook can force a kick for the probe')
    ok(/midSway: stageFx\.mid \? \+stageFx\.mid\.maxSway\.toFixed\(4\)/.test(gsrc), 'midground gate: fx() reports the live sway')
    // mutant: kill the sway (breeze + kick) — the gate must fail
    const mutMid = rsrc.replace('Math.sin(tSec * 1.6 + it.phase) * it.base + kick * 0.12 * it.ampl', '0')
    ok(!/Math\.sin\(tSec \* 1\.6 \+ it\.phase\) \* it\.base/.test(mutMid), 'mutant: dead midground sway fails the gate (harness bites)')
}

// ---- #1106 finisher cinematic gate ------------------------------------------------
// The signature finish sells as a multi-beat sequence: a per-beat camera punch-in,
// a per-beat blow, and the loser scripted through the fighter's beats. Data gate
// (beats on every qcbf), source gates (the cine driver + beat poses), and a mutant.
{
    const fs = await import('node:fs')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    const BEAT_KINDS = new Set(['grab', 'stitch', 'strike', 'flip', 'slam', 'blast', 'charge', 'surge', 'flare'])
    ok(ROSTER.every((d) => Array.isArray(d.moves.qcbf.beats) && d.moves.qcbf.beats.length >= 2 && d.moves.qcbf.beats.length <= 3 && d.moves.qcbf.beats.every((k) => BEAT_KINDS.has(k))), 'every finisher has a 2-3 beat signature sequence')
    ok(/baseZ - \(cine \? cine\.zoom/.test(rsrc), 'finisher-cine gate: per-beat camera punch-in')
    ok(/poseFinisherBeat\(rig, cine\.kind, cine\.k\)/.test(rsrc), 'finisher-cine gate: loser scripted through the beats')
    ok(/export function poseFinisherBeat\(/.test(rsrc), 'finisher-cine gate: per-beat victim pose exists')
    ok(/finishCine = \{ beats: \(qcbf && qcbf\.beats\)/.test(gsrc), 'finisher-cine gate: cine starts on the finish event')
    ok(/finishCine\.fired !== i/.test(gsrc), 'finisher-cine gate: per-beat stepping')
    ok(/playSweep\(330, 70, 0\.32, 'sawtooth', 0\.17\)/.test(gsrc), 'finisher-cine gate: final-blow boom')
    ok(/cine\(\) \{/.test(gsrc) && /forceFinish\(\) \{/.test(gsrc), 'finisher-cine gate: dev hooks expose cine() and forceFinish()')
    // mutant: kill the camera punch-in — the gate must fail
    const mutR = rsrc.replace('baseZ - (cine ? cine.zoom : 0)', 'baseZ')
    ok(!/baseZ - \(cine \? cine\.zoom/.test(mutR), 'mutant: dead camera punch-in fails the gate (harness bites)')
}

// ---- #1106 qcb counter gate ------------------------------------------------
// Every fighter has a down-back counter; the engine resolves it AFTER the qcbf
// finisher (so the finisher's d,b prefix isn't stolen) and the CPU throws it at
// close range. Source gates + a dead-resolver mutant + a part B runtime probe.
{
    const fs = await import('node:fs')
    const esrc = fs.readFileSync(path.join(HERE, '../src/engine/fighting.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok(/if \(sp\.qcb && matchMotion\(hist, MOTION\.qcb\)\) return fire\('qcb'\)/.test(esrc), 'qcb gate: engine resolves the down-back counter motion')
    ok(/sp\.qcb && dist < 2\.2 && m\.rng\(\) < tier \* 0\.22/.test(esrc), 'qcb gate: the CPU throws the counter at close range')
    ok(/forceQcb\(\) \{/.test(gsrc), 'qcb gate: dev hook can force the counter for the probe')
    const mutE = esrc.replace("if (sp.qcb && matchMotion(hist, MOTION.qcb)) return fire('qcb')", "if (false) return fire('qcb')")
    ok(!/if \(sp\.qcb && matchMotion\(hist, MOTION\.qcb\)\) return fire\('qcb'\)/.test(mutE), 'mutant: dead qcb resolver fails the gate (harness bites)')
}

// ---- #1106 guard crush gate ------------------------------------------------
// A guard that absorbs enough blocks CRUSHES: the defender is stunned, takes
// chip, and can't block the punish. Engine gates (drain / crush state / regen)
// + cabinet gates (flag on, hears the event, draws the gauge) + a dead-drain
// mutant. The real mechanic is driven in part A above; part B probes the live
// cabinet through __viperPitTest.forceCrush()/guard().
{
    const fs = await import('node:fs')
    const esrc = fs.readFileSync(path.join(HERE, '../src/engine/fighting.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok(/def\.guard = Math\.max\(0, def\.guard - raw\)/.test(esrc), 'crush gate: blocking drains the guard gauge')
    ok(/def\.st = 'crush'; def\.stun = CRUSH_FRAMES/.test(esrc), 'crush gate: an empty guard breaks into a crush stun')
    ok(/case 'crush':/.test(esrc), 'crush gate: the crush stun is a real state')
    ok(/m\.guardCrush && f\.st !== 'blockstun' && f\.st !== 'crush'\) f\.guard = Math\.min\(GUARD_MAX/.test(esrc), 'crush gate: the guard gauge regens while not guarding')
    ok(/guardCrush: true/.test(gsrc), 'crush gate: the cabinet turns guardCrush on')
    ok(/e\.kind === 'crush'/.test(gsrc), 'crush gate: the cabinet hears the guard-break event')
    ok(/f\[i\]\.guard/.test(gsrc), 'crush gate: the HUD draws the guard gauge')
    ok(/forceCrush\(\) \{/.test(gsrc) && /guard\(\) \{ return gs/.test(gsrc), 'crush gate: dev hooks expose guard() and forceCrush()')
    // mutant: kill the drain — the gate must fail
    const mutE = esrc.replace('def.guard = Math.max(0, def.guard - raw)', 'def.guard = def.guard')
    ok(!/def\.guard = Math\.max\(0, def\.guard - raw\)/.test(mutE), 'mutant: dead guard drain fails the gate (harness bites)')
}

console.log(`part A: ${pass} ok, ${fail} fail`)

// ---- Part B: browser drive ---------------------------------------------------------
if (!MUT) {
    console.log('part B: browser drive at', URL)
    await requireDevServer(URL)
    const browser = await launch()
    const page = await browser.newPage({ viewport: { width: 1024, height: 640 } })
    const errors = []
    page.on('console', (msg) => { if (msg.type() === 'error' && !relayNoise(msg.text())) errors.push(msg.text()) })
    page.on('pageerror', (err) => errors.push(String(err)))
    await page.context().addInitScript(() => {
        window.__vpAudio = { osc: 0, buf: 0 }
        const patch = (C) => {
            if (!C) return
            const o = C.prototype.createOscillator
            C.prototype.createOscillator = function () { window.__vpAudio.osc++; return o.call(this) }
            const b = C.prototype.createBufferSource
            C.prototype.createBufferSource = function () { window.__vpAudio.buf++; return b.call(this) }
        }
        patch(window.AudioContext)
        patch(window.webkitAudioContext)
    })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('canvas[data-viperpit-stage]') && window.__viperPitTest, null, { timeout: 15000 })

    const shots = await page.locator('canvas[data-viperpit-stage]').screenshot()
    ok(shots.length > 5000, 'attract renders a rich frame (non-trivial canvas)')

    const attractSt = await page.evaluate(() => window.__viperPitTest.state)
    ok(attractSt && attractSt.bed && /^viper(Alley|Foundry|Subway)$/.test(attractSt.bed), `attract runs the stage's ambient bed (${attractSt && attractSt.bed})`)

    await page.keyboard.press('Digit1')
    await page.waitForTimeout(200)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro', null, { timeout: 20000 })
    let st = await page.evaluate(() => window.__viperPitTest.state)
    ok(st && (st.phase === 'fight' || st.phase === 'ko'), `fight starts from select (phase ${st && st.phase})`)

    await page.keyboard.down('ArrowRight')
    let punchStarted = false, hitLanded = false
    for (let i = 0; i < 16 && !(punchStarted && hitLanded); i++) {
        await page.keyboard.press('KeyK')
        await page.waitForTimeout(200)
        const s = await page.evaluate(() => window.__viperPitTest.state)
        if (s.st[0] === 'hp' || s.st[0] === 'lp' || s.st[0] === 'hk') punchStarted = true
        if (s.hp[1] < 100) hitLanded = true
    }
    const shotA = await page.locator('canvas[data-viperpit-stage]').screenshot()
    await page.keyboard.press('KeyK')
    await page.waitForTimeout(250)
    const shotB = await page.locator('canvas[data-viperpit-stage]').screenshot()
    await page.keyboard.up('ArrowRight')
    ok(Buffer.compare(shotA, shotB) !== 0, 'frame changes between consecutive frames (renderer alive)')
    st = await page.evaluate(() => window.__viperPitTest.state)
    ok(punchStarted, 'keyboard attack input starts a move in the sim')
    ok(hitLanded || st.x[0] !== -2.6, `attack closes on the CPU (P2 hp ${st.hp[1]}, P1 x ${st.x[0]})`)

    // #1106 audio: the bed + hit SFX must reach the real audio graph in the cabinet
    const a0 = await page.evaluate(() => ({ ...window.__vpAudio }))
    await page.waitForTimeout(2500)
    const a1 = await page.evaluate(() => window.__vpAudio)
    ok(a1.osc + a1.buf - a0.osc - a0.buf >= 4, `audio graph produces voices in the cabinet (${a1.osc - a0.osc} osc, ${a1.buf - a0.buf} noise in 2.5s)`)

    // GUARD key reaches the engine: hold O while the CPU attacks — over a long
    // window its heavies must be blocked somewhere (no full damage while
    // holding) — plus the on-screen GUARD button dispatches KeyO too.
    await page.keyboard.down('KeyO')
    let sawGuard = false, guardHpLoss = 0
    const hpBefore = (await page.evaluate(() => window.__viperPitTest.state)).hp[0]
    for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(120)
        const s = await page.evaluate(() => window.__viperPitTest.state)
        if (s.st[0] === 'blockstun') sawGuard = true
        guardHpLoss = hpBefore - s.hp[0]
    }
    await page.keyboard.up('KeyO')
    ok(sawGuard || guardHpLoss <= 4, `GUARD hold limits damage while held (lost ${guardHpLoss}, sawGuard ${sawGuard})`)
    const guardBtnOk = await page.evaluate(() => !!document.querySelector('[data-vc="guard"]'))
    ok(guardBtnOk, 'on-screen GUARD button is present during play')

    // #1106 audio: the K.O. crowd surge must reach the real audio graph
    {
        let w = 0
        while (w++ < 25 && (await page.evaluate(() => window.__viperPitTest.state)).phase !== 'fight') await page.waitForTimeout(200)
        const b0 = await page.evaluate(() => ({ ...window.__vpAudio }))
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'ko', null, { timeout: 5000 })
        await page.waitForTimeout(900)
        const b1 = await page.evaluate(() => window.__vpAudio)
        ok(b1.osc - b0.osc + b1.buf - b0.buf >= 3, `K.O. crowd surge reaches the audio graph (${b1.osc - b0.osc} osc, ${b1.buf - b0.buf} noise)`)
    }

    // two K.O.s advance rounds
    let guard = 0
    while (guard++ < 8 && st.wins[0] < 2 && st.phase !== 'done') {
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForTimeout(3300)
        st = await page.evaluate(() => window.__viperPitTest.state)
    }
    ok(st.wins[0] >= 2 || st.phase === 'done', `two K.O.s advance rounds (wins ${st.wins.join('-')}, phase ${st.phase})`)

    // #1106 stage life: the pits must be alive. Foundry molten pulses and casts
    // light; alley rain streaks fall; the subway train light-sweeps the pit.
    {
        const toStage = async (i, id) => {
            await page.evaluate((n) => window.__viperPitTest.stage(n), i)
            await page.waitForFunction((want) => {
                const f = window.__viperPitTest.fx()
                return f && f.id === want && window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro'
            }, id, { timeout: 20000 })
        }
        await toStage(1, 'foundry')
        const m1 = await page.evaluate(() => window.__viperPitTest.fx())
        ok(m1 && m1.molten != null && m1.rain == null && m1.sweep == null, `foundry stage is live (molten ${m1 && m1.molten})`)
        await page.waitForTimeout(700)
        const m2 = await page.evaluate(() => window.__viperPitTest.fx())
        ok(m2 && m2.molten !== m1.molten, `molten glow pulses over time (${m1.molten} -> ${m2.molten})`)
        ok(m2.moltenLight > 8, `molten casts light onto the pit (intensity ${m2.moltenLight})`)

        await toStage(0, 'alley')
        const r1 = await page.evaluate(() => window.__viperPitTest.fx())
        ok(r1 && r1.rain > 40 && r1.molten == null && r1.sweep == null, `alley rain streaks present (${r1 && r1.rain})`)
        await page.waitForTimeout(500)
        const r2 = await page.evaluate(() => window.__viperPitTest.fx())
        ok(r2.rainFallen > r1.rainFallen, `rain is falling (fallen ${r1.rainFallen} -> ${r2.rainFallen})`)

        await toStage(2, 'subway')
        await page.evaluate(() => window.__viperPitTest.sweep())
        await page.waitForFunction(() => {
            const f = window.__viperPitTest.fx()
            return f && f.sweep > 0 && f.sweep < 1
        }, null, { timeout: 4000 })
        const s1 = await page.evaluate(() => window.__viperPitTest.fx())
        await page.waitForTimeout(450)
        const s2 = await page.evaluate(() => window.__viperPitTest.fx())
        ok(s2.sweep > s1.sweep && s2.sweep <= 1, `subway train light-sweep passes the pit (${s1.sweep} -> ${s2.sweep})`)
    }

    // #1106 finisher cinematic: the signature finish is a multi-beat sequence —
    // camera punch-in + a per-beat blow + the loser scripted through the beats.
    // forceFinish() starts the cine for P1's finisher; cine() reports the sequence.
    {
        await page.evaluate(() => window.__viperPitTest.forceFinish())
        let sawActive = false, maxI = -1
        for (let i = 0; i < 30 && !sawActive; i++) {
            const c = await page.evaluate(() => window.__viperPitTest.cine())
            if (c.active) { sawActive = true; if (c.i > maxI) maxI = c.i }
            await page.waitForTimeout(60)
        }
        ok(sawActive, 'finisher cinematic starts on a finish')
        let cleared = false
        for (let i = 0; i < 40 && !cleared; i++) {
            const c = await page.evaluate(() => window.__viperPitTest.cine())
            if (c.active && c.i > maxI) maxI = c.i
            if (!c.active) { cleared = true; break }
            await page.waitForTimeout(60)
        }
        ok(maxI >= 1, `finisher cinematic fires multiple beats (reached beat ${maxI})`)
        ok(cleared, 'finisher cinematic clears after its last beat')
    }

    // #1106 stage midground: each pit has a midground layer beyond the backdrop,
    // and the props react to the fight — a forced kick rocks them well past the
    // idle breeze.
    {
        const toStage = async (i, id) => {
            await page.evaluate((n) => window.__viperPitTest.stage(n), i)
            await page.waitForFunction((want) => {
                const f = window.__viperPitTest.fx()
                return f && f.id === want && window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro'
            }, id, { timeout: 20000 })
        }
        for (const [i, id] of [[0, 'alley'], [1, 'foundry'], [2, 'subway']]) {
            await toStage(i, id)
            const f1 = await page.evaluate(() => window.__viperPitTest.fx())
            ok(f1 && f1.mid >= 3, `${id} midground layer present (${f1 && f1.mid} props)`)
            const idle = f1.midSway
            await page.evaluate(() => window.__viperPitTest.midKick())
            await page.waitForFunction((base) => {
                const f = window.__viperPitTest.fx()
                return f && f.midSway > base + 0.01
            }, idle, { timeout: 1500 })
            const f2 = await page.evaluate(() => window.__viperPitTest.fx())
            ok(f2.midSway > idle + 0.01, `${id} midground reacts to the fight (sway ${idle} -> ${f2.midSway})`)
        }
    }

    // #1106 qcb counter: the down-back counter is live in the cabinet — it starts,
    // poses and renders without a page error (forceQcb -> state().st[0] === 'qcb').
    {
        await page.evaluate(() => window.__viperPitTest.stage(1))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro', null, { timeout: 20000 })
        await page.evaluate(() => window.__viperPitTest.forceQcb())
        let sawQcb = false
        for (let i = 0; i < 10 && !sawQcb; i++) {
            const s = await page.evaluate(() => window.__viperPitTest.state)
            if (s && s.st[0] === 'qcb') sawQcb = true
            await page.waitForTimeout(25)
        }
        ok(sawQcb, 'qcb counter is live in the sim (state reports the move)')
    }

    // #1106 guard crush: the guard gauge + crush stun are live in the cabinet —
    // force a guard break, watch the fighter enter the crush stun, then recover
    // with a full guard.
    {
        await page.evaluate(() => window.__viperPitTest.stage(1))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro', null, { timeout: 20000 })
        const gFull = await page.evaluate(() => window.__viperPitTest.guard())
        ok(gFull && gFull[1] >= 90, `guard gauge starts full in the cabinet (${gFull && gFull[1]})`)
        await page.evaluate(() => window.__viperPitTest.forceCrush())
        let sawCrush = false
        for (let i = 0; i < 25 && !sawCrush; i++) {
            const s = await page.evaluate(() => window.__viperPitTest.state)
            if (s && s.st[1] === 'crush') sawCrush = true
            await page.waitForTimeout(40)
        }
        ok(sawCrush, 'guard-crush stun is live in the sim (state reports crush)')
        let recovered = false
        for (let i = 0; i < 200 && !recovered; i++) {
            const s = await page.evaluate(() => window.__viperPitTest.state)
            if (s && s.st[1] !== 'crush') { recovered = true; break }
            await page.waitForTimeout(40)
        }
        const gAfter = await page.evaluate(() => window.__viperPitTest.guard())
        ok(recovered, 'crush stun clears back to a guarding-ready fighter')
        ok(gAfter && gAfter[1] >= 90, `guard gauge refills after the crush (${gAfter && gAfter[1]})`)
    }

    // #1106 dialogue: the opponent taunts at the round intro and the winner gets
    // the last word over the loser's reply at the outround — quote() reports the
    // live card in the cabinet.
    {
        const krax = ROSTER.find((d) => d.id === 'krax')
        const nyx = ROSTER.find((d) => d.id === 'nyx')
        await page.evaluate(() => window.__viperPitTest.setChars('nyx', 'krax'))
        let q = null
        for (let i = 0; i < 20 && !(q && q.kind === 'intro'); i++) {
            q = await page.evaluate(() => window.__viperPitTest.quote())
            await page.waitForTimeout(60)
        }
        ok(q && q.kind === 'intro' && q.name === krax.name && q.text === krax.intro,
            `opponent taunts at the round intro (${q ? `${q.name}: "${q.text}"` : 'nothing'})`)
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'done', null, { timeout: 20000 })
        const qw = await page.evaluate(() => window.__viperPitTest.quote())
        ok(qw && qw.kind === 'win' && qw.name === nyx.name && qw.text === nyx.win,
            `winner gets the last word at the outround (${qw ? `${qw.name}: "${qw.text}"` : 'nothing'})`)
        ok(qw && qw.sub === `${krax.name}: ${krax.lose}`, `loser replies under the win line (${qw && qw.sub})`)
    }

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const pausedVisible = await page.evaluate(() => !!document.body.innerText.match(/VIPER PIT|RESUME|PAUSED|CONTROL/i))
    ok(pausedVisible, '?/Esc opens the pause overlay')
    await page.keyboard.press('Escape')

    ok(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ') || 'clean'})`)
    await browser.close()
}

console.log(`viperpitcheck: ${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
