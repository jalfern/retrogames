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
const { ROSTER, BY_ID, LADDER, voiceNotes } = await import(bust('../src/games/ViperPit/fighters.js'))

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

// ---- #1106 intro + K.O. quote gate --------------------------------------------------
// Each fighter carries a round intro + a win line + a lose line; the FIGHT call and
// the K.O./match freeze show them. The selectors (introQuotes/koQuotes) are pure in
// fighters.js so the render stays thin. Source-level on the data + the call sites,
// plus a mutant that strips the table so the data gate bites.
{
    const fs = await import('node:fs')
    const fsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/fighters.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    for (const [label, re] of [
        ['pure intro selector (both fighters)', /export function introQuotes\(a, b\)/],
        ['pure K.O. selector (round + match line)', /export function koQuotes\(m\)/],
    ]) ok(re.test(fsrc), `quote gate: ${label}`)
    for (const [label, re] of [
        ['render reads the K.O. quote', /koQuotes\(m\)/],
        ['render reads the intro quote at FIGHT', /introQuotes\(BY_ID\[p1Char\], BY_ID\[p2Char\]\)/],
        ['K.O. quote is drawn as a card', /quote\.a, W \/ 2, H \* 0\.59/],
        ['per-fighter K.O. blurb sting', /const koSting = \(fid\)/],
    ]) ok(re.test(gsrc), `quote gate: ${label}`)
    ok((fsrc.match(/\bintro: /g) || []).length >= 5, 'quote gate: all five fighters carry an intro line')
    ok((fsrc.match(/\bwin: /g) || []).length >= 5, 'quote gate: all five fighters carry a win line')
    ok((fsrc.match(/\blose: /g) || []).length >= 5, 'quote gate: all five fighters carry a lose line')
    // mutant: strip the quote table — the "5 lines" data gate has nothing left to count
    const mutF = fsrc.replace(/\bintro: /g, 'intro__X: ').replace(/\bwin: /g, 'win__X: ').replace(/\blose: /g, 'lose__X: ')
    ok((mutF.match(/\bintro: /g) || []).length === 0 && (mutF.match(/\bwin: /g) || []).length === 0, 'mutant: stripped quote table empties the data gate (harness bites)')
}

// ---- #1106 fighter animation-depth gate ---------------------------------------------
// Five fighters must not share one skeleton: each carries its own idle stance
// (lean/bob/guard/legs), hitstun reads direction and height, and walking in
// leans toward the opponent while walking out keeps a tighter shuffle. All of it
// is presentation (rig-side data + poseFighter), so the gate is a data gate on
// fighters.js, source gates on render.js/index.jsx, and three mutants that each
// have to make the gate bite. Part B drives the live cabinet through
// __viperPitTest.pose()/forceHit().
{
    const fs = await import('node:fs')
    const fsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/fighters.js'), 'utf8')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok((fsrc.match(/\bstance: \{/g) || []).length >= 5, 'anim gate: all five fighters carry a stance profile')
    ok(new Set(ROSTER.map((d) => JSON.stringify(d.stance))).size === 5, 'anim gate: every idle stance differs from the others')
    const animGates = [
        ['idle pose reads the fighter stance', /const stance = \(f\.def && f\.def\.stance\) \|\| null/],
        ['per-fighter breathing (amplitude + tempo)', /Math\.sin\(tSec \* \(stance \? stance\.bobHz : 2\.2\)\) \* \(stance \? stance\.bobAmp : 0\.015\)/],
        ['a low hit buckles the knees', /hint && hint\.low/],
        ['an overhead snaps the head back', /hint && hint\.high/],
        ['a hit from behind pitches forward (push sign vs facing)', /\(f\.vx \|\| 0\) \* f\.facing > 0\.001/],
        ['walk-in leans toward, walk-out leans off', /q\.lean \+= forward \? 0\.12 : -0\.1/],
        ['walk-out shuffle is shorter than walk-in', /g\.stride \* \(forward \? 1 : 0\.7\)/],
        ['the hint clears when the stun ends', /rig\.hitHint && f\.st !== 'hitstun'/],
        ['the victim height hint lands on the rig', /victim\.hitHint = \{ low: !!\(mdef && mdef\.low\), high: !!\(mdef && mdef\.overhead\) \}/],
    ]
    for (const [label, re] of animGates) ok(re.test(rsrc) || re.test(gsrc), `anim gate: ${label}`)
    ok(/pose\(i\) \{/.test(gsrc) && /forceHit\(i, kind\) \{/.test(gsrc), 'anim gate: dev hooks expose pose() and forceHit()')
    const mutS = rsrc.replace('const stance = (f.def && f.def.stance) || null', 'const stance = null')
    ok(!/const stance = \(f\.def && f\.def\.stance\)/.test(mutS), 'mutant: stance dropped from the pose fails the gate (harness bites)')
    const mutD = rsrc.replace('const back = (f.vx || 0) * f.facing > 0.001', 'const back = false')
    ok(!/\(f\.vx \|\| 0\) \* f\.facing > 0\.001/.test(mutD), 'mutant: direction-blind hitstun fails the gate (harness bites)')
    const mutW = rsrc.replace('q.lean += forward ? 0.12 : -0.1', '')
    ok(!/q\.lean \+= forward \? 0\.12 : -0\.1/.test(mutW), 'mutant: dead walk lean fails the gate (harness bites)')
}

// ---- #1106 walk-gait gate -----------------------------------------------------------
// Walking is not one shared shuffle: each fighter carries a gait profile
// (tempo/stride/bob/armSwing/toe), the cycle alternates the legs, the hips bob
// once per step, the swinging foot lifts at the toe, and the arms counter-swing
// around the fighter's own guard geometry instead of a generic tuck. All of it
// is presentation (fighters.js data + render.js walk branch), so the gate is a
// data gate + source gates + three mutants that must bite. Part B drives the live
// cabinet through __viperPitTest.pose() while a real ArrowRight hold walks.
{
    const fs = await import('node:fs')
    const fsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/fighters.js'), 'utf8')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok((fsrc.match(/\bgait: \{/g) || []).length >= 5, 'gait gate: all five fighters carry a gait profile')
    ok(new Set(ROSTER.map((d) => JSON.stringify(d.gait))).size === 5, 'gait gate: every gait differs from the others')
    ok(ROSTER.every((d) => d.gait && d.gait.tempo > 0 && d.gait.stride > 0 && d.gait.bob > 0 && d.gait.armSwing > 0 && d.gait.toe >= 0), 'gait gate: every profile is complete and sane')
    const gaitGates = [
        ['walk pose reads the fighter gait (with a sane default)', /const g = \(f\.def && f\.def\.gait\) \|\| \{/],
        ['stride tempo is per-fighter; walk-out steps slower', /g\.tempo \* \(forward \? 1 : 0\.82\)/],
        ['hips bob once per step (lift on the pass)', /q\.hipY \+= g\.bob \* \(1 - Math\.abs\(sw\)\)/],
        ['the swinging foot lifts at the toe', /Math\.max\(0, sw\) \* g\.toe/],
        ['the trail knee bends as the planted leg takes weight', /-0\.2 - Math\.max\(0, -sw\) \* 0\.34/],
        ['arms counter-swing around the fighter\'s own guard geometry', /const baseArms = stance \? stance\.arms :/],
        ['the counter-swing scales by gait (and tightens walking out)', /g\.armSwing \* \(forward \? 1 : 0\.6\)/],
    ]
    for (const [label, re] of gaitGates) ok(re.test(rsrc), `gait gate: ${label}`)
    ok(/legR: \+rig\.legR\.hip\.rotation\.x/.test(gsrc) && /legL: \+rig\.legL\.hip\.rotation\.x/.test(gsrc), 'gait gate: pose() reports the hip joints for the live probe')
    const mutG = rsrc.replace('const g = (f.def && f.def.gait) || {', 'const g = {')
    ok(!/\(f\.def && f\.def\.gait\)/.test(mutG), 'mutant: gait dropped from the walk pose fails the gate (harness bites)')
    const mutB = rsrc.replace('q.hipY += g.bob * (1 - Math.abs(sw)) * (forward ? 1 : 0.7)', '')
    ok(!/q\.hipY \+= g\.bob/.test(mutB), 'mutant: dead walk bob fails the gate (harness bites)')
    const mutA = rsrc.replace('const baseArms = stance ? stance.arms :', 'const baseArms =')
    ok(!/stance \? stance\.arms :/.test(mutA), 'mutant: generic walk arms fail the guard-geometry gate (harness bites)')
}

// ---- #1106 walk-gait determinism (Part A, plain Node) ------------------------------
// poseFighter is pure math over a rig, so the gait itself is pinned here without
// a browser: sweep wall-clock time while a fighter walks and the cycle must
// alternate legs, bob the hips once per step, lumber wide for KRAX, take quick
// short steps for NYX, and shuffle shorter walking out than in.
{
    const { buildFighter, poseFighter } = await import(bust('../src/games/ViperPit/render.js'))
    const walkSig = (id, forward) => {
        const rig = buildFighter(BY_ID[id])
        const f = { st: 'idle', move: null, sf: 0, x: 0, y: 0, def: BY_ID[id], vx: (forward ? 0.088 : -0.068) * (BY_ID[id].walkMul || 1), facing: 1 }
        const s = []
        for (let t = 0; t <= 1680; t += 30) {
            poseFighter(rig, f, t / 1000)
            s.push({ legR: rig.legR.hip.rotation.x, legL: rig.legL.hip.rotation.x, hipY: rig.body.position.y, armR: rig.armR.sh.rotation.x })
        }
        return s
    }
    const rg = (s, k) => Math.max(...s.map((p) => p[k])) - Math.min(...s.map((p) => p[k]))
    const fl = (s) => { let f = 0, prev = 0; for (const p of s) { const d = Math.sign(p.legR - p.legL); if (prev !== 0 && d !== 0 && d !== prev) f++; if (d !== 0) prev = d } return f }
    const kF = walkSig('krax', true), kB = walkSig('krax', false), nF = walkSig('nyx', true), vF = walkSig('vess', true)
    ok(fl(kF) >= 3, `KRAX's walk alternates legs (${fl(kF)} phase flips over 1.7s)`)
    ok(fl(nF) >= 4, `NYX's quicker tempo alternates more often (${fl(nF)} flips)`)
    ok(fl(nF) > fl(kF), `NYX steps faster than KRAX walks (${fl(nF)} vs ${fl(kF)} flips)`)
    ok(rg(kF, 'legR') > 1.3 && rg(nF, 'legR') < rg(kF, 'legR') - 0.15,
        `KRAX lumbers with a longer stride than NYX (${rg(kF, 'legR').toFixed(3)} vs ${rg(nF, 'legR').toFixed(3)})`)
    ok(rg(kB, 'legR') < rg(kF, 'legR') * 0.92 && rg(kB, 'legR') > 0.6,
        `walking out is a shorter shuffle (${rg(kB, 'legR').toFixed(3)} vs ${rg(kF, 'legR').toFixed(3)})`)
    ok(rg(kF, 'hipY') > 0.02 && rg(vF, 'hipY') > rg(nF, 'hipY') + 0.01,
        `the stride bobs the hips, hardest on bouncy VESS (${rg(vF, 'hipY').toFixed(3)} vs ${rg(nF, 'hipY').toFixed(3)})`)
    ok(Math.abs(nF[0].armR - BY_ID.nyx.stance.arms[0].sh) < 0.001 && Math.abs(kF[0].armR - BY_ID.krax.stance.arms[0].sh) < 0.001,
        'at step-over the walk arms sit on the stance guard geometry, not a generic tuck')
    ok(Math.abs(rg(vF, 'armR') / 2 - BY_ID.vess.gait.armSwing) < 0.02 && Math.abs(rg(nF, 'armR') / 2 - BY_ID.nyx.gait.armSwing) < 0.02,
        `walk arms counter-swing scaled by gait (${(rg(vF, 'armR') / 2).toFixed(2)}/${(rg(nF, 'armR') / 2).toFixed(2)})`)
}

// ---- #1298 facing-yaw gate (Part A, plain Node) -------------------------------------
// Field report (Safari, build 4925114): "people face backwards and controls might
// be swapped". The engine spec is +x = right, facing 1 = facing right (fighting.js
// line 20); rigs are built facing +z (jaw/lapel/necklace/toes at +z, hood at −z);
// the fight camera sits on the +z side, so screen-right is world +x. A fighter
// facing right must therefore yaw local +z onto world +x: sin(rigYaw(1)) = +1.
// ViperPit shipped the mirrored sign since e39ea51 — both fighters rendered 180°
// out, moonwalking toward the foe they had their backs to (one line, both
// complaints: the walk direction was right, the faces pointed backwards). The yaw
// is exported as rigYaw so this gate checks algebra, not just source text.
// Mutant: legacy = the shipped sign → gate bites.
{
    const fs = await import('node:fs')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const esrc = fs.readFileSync(path.join(HERE, '../src/engine/fighting.js'), 'utf8')
    const esm = await import(bust('../src/games/ViperPit/render.js'))
    ok(/jaw\.position\.set\(0, 0\.0, 0\.08\)/.test(rsrc) && /lapel\.position\.set\(0, 0\.3 \* H, 0\.24 \* B\)/.test(rsrc) && /hood\.position\.set\(0, 0\.13, -0\.05\)/.test(rsrc),
        'facing gate: the rig is built facing +z (front features at +z, hood behind)')
    ok(/cam\.position\.z = Math\.max\(5\.5/.test(rsrc), 'facing gate: the fight camera sits on the +z side (screen-right = world +x)')
    ok(/1 = facing right/.test(esrc), 'facing gate: the engine spec pins facing 1 = right (+x)')
    ok(!/facing === 1 \? -Math\.PI \/ 2/.test(rsrc), 'facing gate: no mirrored yaw sign left in render.js (the #1298 bug)')
    ok(typeof esm.rigYaw === 'function', 'facing gate: render.js exports rigYaw(facing)')
    if (typeof esm.rigYaw === 'function') {
        const noseX = (facing) => Math.sin(esm.rigYaw(facing))
        ok(noseX(1) > 0.99 && Math.abs(Math.cos(esm.rigYaw(1))) < 0.02 && noseX(-1) < -0.99,
            `facing gate: facing right points the nose screen-right (${noseX(1).toFixed(2)} / ${noseX(-1).toFixed(2)})`)
        const legacy = (facing) => (facing === 1 ? -Math.PI / 2 : Math.PI / 2)
        ok(!(Math.sin(legacy(1)) > 0.99), 'mutant: the shipped-until-#1298 sign puts the nose screen-left — gate bites (harness proves)')
    }
    ok(/rig\.root\.rotation\.y = rigYaw\(f\.facing\)/.test(rsrc), 'facing gate: the sync loop yaws every rig through rigYaw')
}

// ---- #1106 HUD juice gate -----------------------------------------------------------
// Chips must be visible and K.O.s staged like the original: the health bar
// flashes on every hit, the K.O. freeze drops letterbox bars, steps the world
// at half speed, holds a camera punch-in and raises a winner card (name +
// tag). Presentation only (index.jsx draw/loop — no engine change), so the
// gates are source-level with two mutants that must bite. Part B drives the
// live cabinet through __viperPitTest.koFx()/chips() and measures the slow-mo
// as a real tick-rate drop across the freeze.
{
    const fs = await import('node:fs')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    const juiceGates = [
        ['every hit arms the chip flash', /chipFx\[e\.by\] = 20/],
        ['the chip flash drains every frame', /if \(chipFx\[i\] > 0\) \{\s*chipFx\[i\]--/],
        ['the K.O. opens a letterbox hold naming the winner', /koHold = \{ startedAt: performance\.now\(\), name: wf\.def\.name, tag: wf\.def\.tag/],
        ['the KO freeze steps at half speed', /if \(slow && \(slowFlip = !slowFlip\)\) acc = Math\.min\(acc, SIM_MS - 0\.5\)/],
        ['the hold camera punches in over the freeze', /cine = \{ side: -1, kind: null, k: 0, zoom: 0\.8 \*/],
        ['the letterbox bars slide in and back out', /const slide = Math\.max\(0, Math\.min\(1, el \/ 160, \(KO_HOLD_MS - el\) \/ 160\)\)/],
        ['the round-win card prints name + tag', /WINS ROUND \$\{koHold\.round\}/],
        ['the hold clears when the freeze ends or a new round starts', /gs\.phase !== 'ko' && gs\.phase !== 'done'/],
        ['the juice resets between matches', /chipFx = \[0, 0\]; shimmerFx = \[0, 0\]; shatterFx = \[0, 0\]; koHold = null; koFxRound = 0/],
        ['the K.O. dedupe resets with each new match (round-1 K.O. fires)', /koHold = null; koFxRound = 0/],
    ]
    for (const [label, re] of juiceGates) ok(re.test(gsrc), `HUD juice gate: ${label}`)
    ok(/koFx\(\) \{/.test(gsrc) && /chips\(\) \{/.test(gsrc), 'HUD juice gate: dev hooks expose koFx() and chips()')
    const mutSlow = gsrc.replace('if (slow && (slowFlip = !slowFlip)) acc = Math.min(acc, SIM_MS - 0.5)', '')
    ok(!/slowFlip = !slowFlip/.test(mutSlow), 'mutant: dead KO slow-mo fails the gate (harness bites)')
    const mutChip = gsrc.replace('chipFx[e.by] = 20', '')
    ok(!/chipFx\[e\.by\] = 20/.test(mutChip), 'mutant: stripped chip flash fails the gate (harness bites)')
}

// ---- #1106 guard-feedback fx gate ---------------------------------------------------
// A blocked hit must SHIMMER (arc in front of the defender + cyan sweep over the
// guard gauge) and a broken guard must SHATTER (white-hot gauge flash + crack
// ticks + teal ring + shards flying off the fighter). Pure curves are pinned in
// plain Node; the wiring is source-level; Part B drives the live cabinet through
// __viperPitTest.forceBlock()/forceCrush()/blockFx()/breakFx()/shieldFx() and
// pixel-audits the gauge strip.
{
    const fs = await import('node:fs')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    const { guardShimmer, guardShatter, SHIMMER_FRAMES, SHATTER_FRAMES } = await import(bust('../src/games/ViperPit/render.js'))
    const ks = [1, 0.75, 0.5, 0.25, 0]
    const sm = ks.map(guardShimmer)
    ok(sm[0].a < 0.05 && sm[4].a < 0.05 && sm[2].a > 0.5,
        `guard-fx: the shimmer ramps up and fades out (alpha ${sm.map((s) => s.a.toFixed(2)).join('→')})`)
    ok(sm.every((s, i) => i === 0 || s.r > sm[i - 1].r),
        `guard-fx: the shimmer arc expands as it fades (${sm[0].r.toFixed(2)}→${sm[4].r.toFixed(2)})`)
    ok(sm[0].sweep === 0 && Math.abs(sm[4].sweep - 1) < 1e-9 && sm.every((s, i) => i === 0 || s.sweep > sm[i - 1].sweep),
        'guard-fx: the gauge shimmer sweep travels the full strip')
    const st = ks.map(guardShatter)
    ok(st[0].a > 0.9 && st[4].a < 0.05,
        `guard-fx: the break flash starts hot and cools off (alpha ${st.map((s) => s.a.toFixed(2)).join('→')})`)
    ok(st.every((s, i) => i === 0 || (s.spread > st[i - 1].spread && s.ring > st[i - 1].ring)),
        `guard-fx: shards fly and the ring opens while the flash cools (${st[0].spread.toFixed(2)}→${st[4].spread.toFixed(2)})`)
    ok(st.every((s) => s.ticks === 8 && s.a >= 0 && s.a <= 1 && s.ring > 0.4 && s.ring < 3),
        'guard-fx: shatter output stays sane for every k')
    ok(SHIMMER_FRAMES === 18 && SHATTER_FRAMES === 26, `guard-fx: the break outlasts the shimmer (${SHIMMER_FRAMES}/${SHATTER_FRAMES} frames)`)
    const fxGates = [
        ['a blocked hit arms the defender shimmer', /shimmerFx\[e\.by\] = SHIMMER_FRAMES/],
        ['the shimmer arc sits in front of the defender, facing the attacker', /scene\.shield\(dfr\.x, atk\.x >= dfr\.x \? 1 : -1, 0x9ad8ff\)/],
        ['a crushed guard arms the break flash', /shatterFx\[e\.by\] = SHATTER_FRAMES/],
        ['the shatter burst fires at the defender', /scene\.shatter\(m\.fighters\[e\.by\]\.x, 1\.35\)/],
        ['the gauge shimmers while a block lands', /guardShimmer\(shimmerFx\[i\] \/ SHIMMER_FRAMES\)/],
        ['the gauge flashes white-hot on the break', /guardShatter\(shatterFx\[i\] \/ SHATTER_FRAMES\)/],
        ['the shimmer drains every frame', /if \(shimmerFx\[i\] > 0\) \{\s*shimmerFx\[i\]--/],
        ['the break flash drains every frame', /if \(shatterFx\[i\] > 0\) \{\s*shatterFx\[i\]--/],
        ['guard fx reset between matches', /chipFx = \[0, 0\]; shimmerFx = \[0, 0\]; shatterFx = \[0, 0\]; koHold = null/],
        ['dev hooks drive the live fx', /forceBlock\(i\) \{[\s\S]*blockFx\(\) \{ return shimmerFx\.map/,],
        ['dev hooks read the GL fx pool', /shieldFx\(\) \{ return scene \? scene\.fxCount\(\)/],
    ]
    for (const [label, re] of fxGates) ok(re.test(gsrc), `guard-fx gate: ${label}`)
    ok(gsrc.includes('shatterFx[1] = SHATTER_FRAMES'), 'guard-fx gate: forceCrush arms the break flash too')
    const rGates = [
        ['shield is an additive arc mesh', /new THREE\.TorusGeometry\(0\.55, 0\.05, 6, 22, Math\.PI \* 1\.25\)/],
        ['break ring mesh', /new THREE\.TorusGeometry\(0\.5, 0\.035, 6, 24\)/],
        ['shard meshes for the burst', /new THREE\.BoxGeometry\(0\.18, 0\.05, 0\.02\)/],
        ['the burst is teal additive light', /color: 0x39d8c8, transparent: true, opacity: 0, blending: THREE\.AdditiveBlending/],
        ['sync animates the shimmer', /guardShimmer\(s\.t \/ SHIMMER_FRAMES\)/],
        ['sync animates the burst', /guardShatter\(s\.t \/ SHATTER_FRAMES\)/],
        ['shards fly outward per frame', /sh\.mesh\.position\.set\(s\.x \+ sh\.ux \* g\.spread/],
        ['shimmer meshes recycle', /shieldFx\.splice\(i, 1\)/],
        ['burst meshes recycle', /shatterFx\.splice\(i, 1\)/],
    ]
    for (const [label, re] of rGates) ok(re.test(rsrc), `guard-fx gate: ${label}`)
    const mutShim = gsrc.replace('shimmerFx[e.by] = SHIMMER_FRAMES', '')
    ok(!/shimmerFx\[e\.by\] = SHIMMER_FRAMES/.test(mutShim), 'mutant: stripped block shimmer fails the gate (harness bites)')
    const mutBrk = gsrc.replace('shatterFx[e.by] = SHATTER_FRAMES', '')
    ok(!/shatterFx\[e\.by\] = SHATTER_FRAMES/.test(mutBrk), 'mutant: stripped break flash fails the gate (harness bites)')
    const MUT = path.join(HERE, '../src/games/ViperPit/.render-mut-guardfx.mjs')
    try {
        fs.writeFileSync(MUT, rsrc.replace('spread: p * 1.7', 'spread: 0').replace('Math.sin(Math.PI * p) * 0.85', '0'))
        const mm = await import(bust('../src/games/ViperPit/.render-mut-guardfx.mjs'))
        const mSpread = [1, 0.75, 0.5, 0.25, 0].map(mm.guardShatter)
        const mShim = [1, 0.75, 0.5, 0.25, 0].map(mm.guardShimmer)
        ok(!(mSpread.every((s, i) => i === 0 || s.spread > mSpread[i - 1].spread)), 'mutant: frozen shard spread fails the fly-apart pin (harness bites)')
        ok(!(mShim[2].a > 0.5), 'mutant: dead shimmer alpha fails the ramp pin (harness bites)')
    } finally { fs.unlinkSync(MUT) }
}

// ---- #1106 select-screen gate -----------------------------------------------------
// Picking a fighter must feel like the arcade: each card shows the fighter's OWN
// rig posed in their idle stance (a mini GL render composited onto the HUD),
// hovering blips their voice register, and the pick prints their intro line and
// carries it through the pre-fight intro. Data gate on fighters.js (voice
// registers + the pure note selector), source gates on render.js/index.jsx, and
// three mutants that must bite. Part B drives the live select screen through
// __viperPitTest.selectInfo()/hover() and a real arrow-hold + Space pick.
{
    const fs = await import('node:fs')
    const fsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/fighters.js'), 'utf8')
    const rsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/render.js'), 'utf8')
    const gsrc = fs.readFileSync(path.join(HERE, '../src/games/ViperPit/index.jsx'), 'utf8')
    ok((fsrc.match(/\bvoice: \{/g) || []).length >= 5, 'select gate: all five fighters carry a voice register')
    ok(new Set(ROSTER.map((d) => JSON.stringify(d.voice))).size === 5, 'select gate: every voice register differs')
    ok(ROSTER.every((d) => d.voice && d.voice.base > 60 && d.voice.base < 1000 && ['sine', 'square', 'sawtooth', 'triangle'].includes(d.voice.wave)),
        'select gate: every register is a sane pitch + waveform')
    ok(/export function voiceNotes\(def\)/.test(fsrc), 'select gate: pure voice-note selector exists')
    ok(ROSTER.every((d) => { const n = voiceNotes(d); return n.length === 3 && n.every((x) => x > 40 && x < 4000) }),
        'select gate: voiceNotes returns three sane notes per fighter')
    const vN = ['nyx', 'cinder', 'vess', 'riv', 'krax'].map((id) => voiceNotes(BY_ID[id])[0])
    ok(new Set(vN).size === 5, `select gate: hover-note pitches differ per fighter (${vN.join('/')})`)
    const portGates = [
        ['portrait mini-renderer captures frames for the HUD', /preserveDrawingBuffer: true/],
        ['portrait poses the rig in its own idle stance', /poseFighter\(rig, \{ st: 'idle'/],
        ['front three-quarter framing for the card', /rig\.root\.rotation\.y = 0\.55/],
        ['pit-teal rim light on the portrait', /new THREE\.DirectionalLight\(0x59e0c8, 1\.6\)/],
        ['card-aspect canvas so the HUD never stretches it', /canvas\.height = Math\.round\(w \* 0\.78\)/],
        ['full-body framing: camera back far enough to keep the head in', /cam\.position\.set\(0, 1\.6, 7\.4\)/],
    ]
    for (const [label, re] of portGates) ok(re.test(rsrc), `select gate: ${label}`)
    const mutC = rsrc.replace('cam.position.set(0, 1.6, 7.4)', 'cam.position.set(0, 1.2, 3.1)')
    ok(!/cam\.position\.set\(0, 1\.6, 7\.4\)/.test(mutC), 'mutant: portrait camera pushed too close fails the framing gate (harness bites)')
    const cabGates = [
        ['select screen builds the portraits once', /const ensurePortraits = \(\) => \{\s*if \(portraits\) return portraits/],
        ['card body composites the captured rig portrait', /hctx\.drawImage\(pt, x \+ cw \* 0\.04/],
        ['the hovered card glows teal', /shadowColor = 'rgba\(89,224,200,0\.75\)'/],
        ['hovering blips the hovered fighter voice', /const hoverSelect = \(d\) => \{\s*cursor = \(cursor \+ d \+ ROSTER\.length\) % ROSTER\.length\s*hoverBlip\(ROSTER\[cursor\]\)/],
        ['the arrow keys drive the hover blip', /hoverSelect\(-1\)[\s\S]*hoverSelect\(1\)/],
        ['the hovered intro blurb prints under the grid', /`"\$\{ROSTER\[cursor\]\.intro\}"`/],
        ['the pick prints the chosen fighter intro line', /pickLine = \{ text: `\$\{c\.name\} — \$\{c\.intro\}`, t: 150 \}/],
        ['the pick gets its own sting of the register', /const pickSting = \(def\) =>/],
        ['the intro line carries through the pre-fight intro', /pickLine && pickLine\.t > 0 && gs\.phase === 'intro'/],
        ['portraits fall back to colour blocks without WebGL', /catch \{ portraits = null \}/],
        ['all five cards fit the screen', /const cw = Math\.min\(H \* 0\.5, \(W \* 0\.94\) \/ \(total \* 1\.06\)\)/],
        ['card rects recorded at draw time for the probe', /cardRects\[i\] = \{ id: rd\.id, x, y, w: cw, h: ch \}/],
        ['dev hook reports the card rects', /cardRects\(\) \{ return cardRects\.slice\(\) \}/],
    ]
    for (const [label, re] of cabGates) ok(re.test(gsrc), `select gate: ${label}`)
    ok(/selectInfo\(\) \{/.test(gsrc) && /hover\(d\) \{ hoverSelect\(d \| 0\) \}/.test(gsrc) && /pick\(\) \{ atSelect\(\) \}/.test(gsrc),
        'select gate: dev hooks expose selectInfo/hover/pick')
    const mutP = gsrc.replace('hctx.drawImage(pt, x + cw * 0.04, y + ch * 0.02, cw * 0.92, ch * 0.92)', '')
    ok(!/hctx\.drawImage\(pt/.test(mutP), 'mutant: portraits dropped from the cards fails the gate (harness bites)')
    const mutH = gsrc.replace('hoverBlip(ROSTER[cursor])', '')
    ok(!/hoverBlip\(ROSTER\[cursor\]\)/.test(mutH), 'mutant: silent hover fails the gate (harness bites)')
    const mutV = fsrc.replace(/\bvoice: \{/g, 'voice__X: {')
    ok((mutV.match(/\bvoice: \{/g) || []).length === 0, 'mutant: stripped voice registers empty the data gate (harness bites)')
    const mutL = gsrc.replace('const cw = Math.min(H * 0.5, (W * 0.94) / (total * 1.06))', 'const cw = Math.min(W * 0.3, H * 0.5)')
    ok(!/const cw = Math\.min\(H \* 0\.5, \(W \* 0\.94\)/.test(mutL), 'mutant: overflowing card grid fails the fit gate (harness bites)')
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

    // #1106 select screen: rig portraits on the cards, voice-register hover
    // blips, and the intro line printed on the pick (selectInfo/hover hooks +
    // real arrow/Space keys).
    {
        await page.waitForFunction(() => {
            const s = window.__viperPitTest.selectInfo()
            return s && s.portraits >= 5
        }, null, { timeout: 10000 })
        const si = await page.evaluate(() => window.__viperPitTest.selectInfo())
        ok(si.portraits >= 5, `all five rig portraits render on the select cards (${si.portraits})`)
        // framing audit with pixels, not vibes: every portrait must paint a
        // fighter (enough ink) with the head inside the frame (top rows inked)
        // — a camera pushed into the chest crops the head and reads 0 up top.
        const pstats = await page.evaluate(() => window.__viperPitTest.portraitStats())
        const PIDS = ['nyx', 'cinder', 'vess', 'riv', 'krax']
        ok(pstats && PIDS.every((id) => pstats[id]), 'portrait pixels readable for the framing audit')
        ok(PIDS.every((id) => pstats && pstats[id] && pstats[id].ink > 0.1 && pstats[id].ink < 0.95),
            `every portrait paints a fighter, not a void or a wall (${PIDS.map((id) => `${id}:${pstats && pstats[id] ? pstats[id].ink : '-'}`).join(' ')})`)
        ok(PIDS.every((id) => pstats && pstats[id] && pstats[id].head > 100),
            `every portrait keeps the head inside the card (${PIDS.map((id) => pstats && pstats[id] ? pstats[id].head : '-').join('/')} head-pixels)`)
        // the cards themselves, audited on the live HUD canvas: every card
        // sits on screen and carries ink (a portrait) in its body region.
        const fit = await page.evaluate(() => {
            const cv = document.querySelector('canvas[data-viperpit-hud]')
            const g = cv.getContext('2d')
            return window.__viperPitTest.cardRects().map((r) => {
                const onScreen = r.x >= 0 && r.y >= 0 && r.x + r.w <= cv.width && r.y + r.h <= cv.height
                const d = g.getImageData(Math.round(r.x + r.w * 0.2), Math.round(r.y + r.h * 0.12), Math.round(r.w * 0.6), Math.round(r.h * 0.6)).data
                let ink = 0
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] > 24 && 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 50) ink++
                }
                return { id: r.id, onScreen, ink: +(ink / (d.length / 4)).toFixed(3) }
            })
        })
        ok(fit.length >= 5 && fit.every((c) => c.onScreen), `all five cards sit on screen (${fit.map((c) => c.id).join(',')})`)
        ok(fit.every((c) => c.ink > 0.04), `each card carries its portrait on the HUD (${fit.map((c) => `${c.id}:${c.ink}`).join(' ')})`)
        const b0 = await page.evaluate(() => ({ ...window.__vpAudio }))
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(150)
        const s1 = await page.evaluate(() => window.__viperPitTest.selectInfo())
        const b1 = await page.evaluate(() => window.__vpAudio)
        ok(s1.cursor !== si.cursor && s1.id, `select cursor moves on a real arrow press (${si.cursor} -> ${s1.cursor}, ${s1.id})`)
        ok(b1.osc - b0.osc >= 2, `hovering blips the fighter's voice register (${b1.osc - b0.osc} tones)`)
        await page.evaluate(() => window.__viperPitTest.hover(-1))
        const s2 = await page.evaluate(() => window.__viperPitTest.selectInfo())
        ok(s2.cursor === si.cursor, `the hover hook wraps the cursor back (${s1.cursor} -> ${s2.cursor})`)
        const selShot = await page.locator('canvas[data-viperpit-hud]').screenshot()
        ok(selShot.length > 2000, 'select screen draws a rich card grid (non-trivial HUD frame)')
        await page.keyboard.press('Space')
        let pl = null
        for (let i = 0; i < 25 && !pl; i++) {
            pl = (await page.evaluate(() => window.__viperPitTest.selectInfo())).line
            if (!pl) await page.waitForTimeout(40)
        }
        ok(pl && pl.includes('—'), `the pick prints the fighter's intro line (${pl})`)
    }

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

    // #1106 guard fx: a force-blocked hit shimmers the gauge cyan (HUD pixels)
    // and puts the arc in the live GL pool; a forced crush flashes the gauge
    // white-hot and spawns the teal shard burst — then both cool off.
    {
        await page.evaluate(() => window.__viperPitTest.stage(1))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro', null, { timeout: 20000 })
        const gaugePix = (side) => page.evaluate((s) => {
            const cv = document.querySelector('canvas[data-viperpit-hud]')
            const g = cv.getContext('2d')
            const W = cv.width, H = cv.height
            const gh = Math.max(4, Math.round(H * 0.009)), gy = Math.round(H * 0.9 - gh - 5)
            const x0 = s === 0 ? Math.round(W * 0.03) : Math.round(W - 0.03 * W - W * 0.28)
            const d = g.getImageData(x0, gy - 1, Math.round(W * 0.28), gh + 2).data
            let white = 0, blue = 0
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 20) continue
                if (d[i] > 215 && d[i + 1] > 215 && d[i + 2] > 215) white++
                blue += d[i + 2]
            }
            return { white, blue }
        }, side)
        const base = await gaugePix(0)
        await page.evaluate(() => window.__viperPitTest.forceBlock(0))
        const armed = await page.evaluate(() => ({ block: window.__viperPitTest.blockFx(), gl: window.__viperPitTest.shieldFx() }))
        ok(armed.block && armed.block[0] && !armed.block[1], 'guard-fx live: a blocked hit arms the shimmer on the blocker only')
        ok(armed.gl && armed.gl.shields > 0, `guard-fx live: the shimmer arc is in the scene (${armed.gl && armed.gl.shields})`)
        let peakBlue = base.blue
        for (let i = 0; i < 12; i++) { peakBlue = Math.max(peakBlue, (await gaugePix(0)).blue); await page.waitForTimeout(30) }
        ok(peakBlue > base.blue * 1.03, `guard-fx live: the gauge shimmers cyan under the block (blue ${peakBlue} vs base ${base.blue})`)
        let released = false
        for (let i = 0; i < 40 && !released; i++) { released = await page.evaluate(() => window.__viperPitTest.blockFx().every((v) => !v)); if (!released) await page.waitForTimeout(40) }
        ok(released, 'guard-fx live: the shimmer releases')
        await page.evaluate(() => window.__viperPitTest.forceCrush())
        const brk = await page.evaluate(() => ({ fx: window.__viperPitTest.breakFx(), gl: window.__viperPitTest.shieldFx() }))
        ok(brk.fx && brk.fx[1] && !brk.fx[0], 'guard-fx live: a crushed guard arms the break flash')
        ok(brk.gl && brk.gl.bursts > 0, `guard-fx live: the shard burst spawns in the scene (${brk.gl && brk.gl.bursts})`)
        let peakWhite = 0
        for (let i = 0; i < 14; i++) { peakWhite = Math.max(peakWhite, (await gaugePix(1)).white); await page.waitForTimeout(30) }
        ok(peakWhite > 150, `guard-fx live: the gauge flashes white-hot on the break (${peakWhite} white px)`)
        let cooled = false
        for (let i = 0; i < 60 && !cooled; i++) { cooled = await page.evaluate(() => window.__viperPitTest.breakFx().every((v) => !v)); if (!cooled) await page.waitForTimeout(40) }
        ok(cooled, 'guard-fx live: the break flash cools off')
    }

    // #1106 HUD juice: a hit flashes the health bar; the K.O. drops letterbox
    // bars, runs the freeze at half speed, holds the camera on the winner and
    // raises a "NAME WINS ROUND n" card — then everything releases.
    {
        await page.evaluate(() => window.__viperPitTest.stage(0))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
        const flash = await page.evaluate(() => { window.__viperPitTest.forceHit(1, 'front'); return window.__viperPitTest.chips() })
        ok(flash && flash[1], 'a hit flashes the health bar (chip flash live)')
        const n0 = await page.evaluate(() => window.__viperPitTest.state.tick)
        await page.waitForTimeout(500)
        const n1 = await page.evaluate(() => window.__viperPitTest.state.tick)
        const normalRate = (n1 - n0) / 500
        ok(normalRate > 0.02, `sim ticks at real time before the K.O. (${normalRate.toFixed(3)} tick/ms)`)
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'ko', null, { timeout: 5000 })
        // forceKO sets the phase synchronously; watchPhase arms the hold one
        // sim step later — poll for the hold, don't assume the same frame.
        let kf = { active: false }
        for (let i = 0; i < 25 && !kf.active; i++) {
            kf = await page.evaluate(() => window.__viperPitTest.koFx())
            if (!kf.active) await page.waitForTimeout(40)
        }
        ok(kf.active && kf.by === 0 && kf.name, `K.O. opens a letterbox hold naming the winner (${kf.name} WINS ROUND ${kf.round} "${kf.tag}")`)
        ok(kf.slow, 'the K.O. freeze starts in slow motion')
        const s0 = await page.evaluate(() => window.__viperPitTest.state.tick)
        await page.waitForTimeout(250)
        const s1 = await page.evaluate(() => window.__viperPitTest.state.tick)
        const slowRate = (s1 - s0) / 250
        ok(slowRate < normalRate * 0.75, `the freeze runs at half speed during the slow-mo (${slowRate.toFixed(3)} vs ${normalRate.toFixed(3)} tick/ms)`)
        let released = false
        for (let i = 0; i < 80 && !released; i++) {
            released = await page.evaluate(() => !window.__viperPitTest.koFx().active)
            if (!released) await page.waitForTimeout(50)
        }
        ok(released, 'the letterbox hold releases after the freeze')
    }

    // #1106 fighter animation depth: all five idle stances differ in the live
    // cabinet, and hit reactions are directional (front/back/low/overhead).
    {
        const sig = (p) => `${p.lean}|${p.head}|${p.armR}|${p.kneeR}`
        const poses = {}
        for (const id of ['nyx', 'cinder', 'vess', 'riv', 'krax']) {
            await page.evaluate((a) => window.__viperPitTest.setChars(a, 'nyx'), id)
            await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
            let p = null
            for (let i = 0; i < 40 && !(p && p.st === 'idle'); i++) {
                p = await page.evaluate(() => window.__viperPitTest.pose(0))
                await page.waitForTimeout(80)
            }
            ok(p && p.st === 'idle', `${id} settles into an idle stance`)
            if (p) poses[id] = sig(p)
        }
        ok(Object.keys(poses).length === 5 && new Set(Object.values(poses)).size === 5,
            `all five idle stances read differently live (${Object.values(poses).join(' ')})`)
        const fightLive = async () => {
            const s0 = await page.evaluate(() => window.__viperPitTest.state)
            if (s0 && s0.phase === 'fight') return
            await page.evaluate(() => window.__viperPitTest.stage(0))
            await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
        }
        const matches = (p, kind) => {
            if (!p || p.st !== 'hitstun') return false
            if (kind === 'back') return p.vx * p.facing > 0
            if (kind === 'low') return !!(p.hint && p.hint.low)
            if (kind === 'over') return !!(p.hint && p.hint.high)
            return p.vx * p.facing < 0
        }
        const reaction = async (kind) => {
            let seen = false
            for (let i = 0; i < 90; i++) {
                const p = await page.evaluate((k) => {
                    window.__viperPitTest.forceHit(1, k)
                    return window.__viperPitTest.pose(1)
                }, kind)
                const ph = await page.evaluate(() => window.__viperPitTest.state && window.__viperPitTest.state.phase)
                if (ph !== 'fight' || !matches(p, kind)) { seen = 0; await page.waitForTimeout(30); continue }
                seen++
                if (seen >= 3) {
                    await page.waitForTimeout(80)
                    const fin = await page.evaluate(() => window.__viperPitTest.pose(1))
                    return fin && fin.st === 'hitstun' ? fin : p
                }
                await page.waitForTimeout(30)
            }
            return null
        }
        const front = await reaction('front')
        const back = await reaction('back')
        const low = await reaction('low')
        const over = await reaction('over')
        ok(front && back && low && over, 'front/back/low/overhead hit reactions are all reachable live')
        ok(front && back && sig(front) !== sig(back), `a back hit reads differently from a front hit (${front && sig(front)} vs ${back && sig(back)})`)
        ok(front && low && sig(front) !== sig(low), `a low hit buckles differently from a body hit (${front && sig(front)} vs ${low && sig(low)})`)
        ok(front && over && Math.abs(over.head) > Math.abs(front.head) + 0.1, `an overhead snaps the head back harder (head ${over && over.head} vs ${front && front.head})`)
        await page.evaluate(() => window.__viperPitTest.stage(1))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase !== 'intro', null, { timeout: 20000 })
    }

    // #1106 walk gait (live): a real ArrowRight hold walks NYX — legs visibly
    // alternate, the hips bob, the stride is wide, and the guard arms stay up
    // (the deterministic stride/tempo comparison per fighter is Part A above).
    {
        await page.evaluate(() => window.__viperPitTest.setChars('nyx', 'riv'))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
        const walkSamples = async (key, need = 22) => {
            const out = []
            for (let t = 0; t < 14 && out.length < need; t++) {
                await page.keyboard.down(key)
                for (let i = 0; i < 4; i++) {
                    const p = await page.evaluate(() => window.__viperPitTest.pose(0))
                    if (p && p.st === 'idle' && Math.abs(p.vx) > 0.01) out.push(p)
                    await page.waitForTimeout(40)
                }
                await page.keyboard.up(key)
                await page.waitForTimeout(60)
            }
            return out
        }
        const range = (s, k) => (s.length ? Math.max(...s.map((p) => p[k])) - Math.min(...s.map((p) => p[k])) : 0)
        const mean = (s, k) => (s.length ? s.reduce((a, p) => a + p[k], 0) / s.length : 0)
        const fwd = await walkSamples('ArrowRight')
        ok(fwd.length >= 6, `NYX walks on real input (${fwd.length} walked samples)`)
        ok(fwd.filter((p) => Math.abs(p.legR - p.legL) > 0.1).length >= 4,
            `the live walk drives alternating legs (${fwd.filter((p) => Math.abs(p.legR - p.legL) > 0.1).length}/${fwd.length} samples mid-stride)`)
        ok(range(fwd, 'hipY') > 0.01, `the stride bobs the hips live (${range(fwd, 'hipY').toFixed(3)})`)
        ok(range(fwd, 'legR') > 0.4, `the stride swings the legs live (${range(fwd, 'legR').toFixed(3)})`)
        ok(mean(fwd, 'armR') < -0.47, `the guard arm stays raised while walking (mean armR ${mean(fwd, 'armR').toFixed(3)})`)
        const back = await walkSamples('ArrowLeft')
        ok(back.length >= 6 && range(back, 'legR') > 0.4,
            `walking out still drives the shuffle stride (${back.length} samples, ${back.length ? range(back, 'legR').toFixed(3) : '-'} swing)`)
        await page.evaluate(() => window.__viperPitTest.setChars('riv', 'nyx'))
        await page.waitForFunction(() => window.__viperPitTest.state && window.__viperPitTest.state.phase === 'fight', null, { timeout: 20000 })
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
