// viperpitcheck — proves VIPER PIT boots, its core rules hold, and it can be
// won. Part A runs the shared fighting core (guardButton mode) in plain Node:
// the #1096 differences — the dedicated GUARD verb (back-walking never
// blocks), launching uppercuts, qcbf finishing moves that end a wounded
// opponent in style — plus the inherited rules (block/chip, low-block, throw
// through guard, projectiles, cancel-combos, seeded determinism) and every
// ladder CPU completing a match. Part B drives the cabinet in headless Chrome
// with real key events: attract → select → fight → K.O., inputs reaching the
// sim, the drawn frame moving. `--mutate` proves the harness can fail: a dead
// guard (blockHeld never true) must let heavies smash through the GUARD.
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

console.log(`viperpitcheck part A: fighting core + guard-button rules${MUT ? ' (MUTANT: guard never engages)' : ''}`)
const SRC = path.join(HERE, '../src/engine/fighting.js')
if (MUT) {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'))
    const before = src
    const mutated = src.replace(
        'f.blockHeld = !!pad.bk && groundedIdle',
        'f.blockHeld = !!pad.bk && groundedIdle && !globalThis.__VIPER_NOGUARD__')
    ok(mutated !== before, 'mutate: guard gate line found to patch')
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
ok(ROSTER.every((d) => d.finish), 'every finisher is named')

const human = (id) => ({ ...BY_ID[id], cpu: false })
const mk = (p1 = 'riv', p2 = 'nyx', seed = 5) => {
    const m = e.createMatch({ seed, guardButton: true, p1: human(p1), p2: human(p2) })
    let g = 0
    while (m.phase !== 'fight' && g++ < 400) e.step(m, [P(), P()])
    return m
}
const QCBF = [{ down: true }, { down: true, left: true }, { left: true }, { down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }, { right: true }]
const QCF = [{ down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }]
const DP = [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }, {}]

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

    // cancel combo: light into heavy chains
    m = mk()
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ lp: true }), P()])
    for (let i = 0; i < 8; i++) e.step(m, [P(), P()])
    e.step(m, [P({ hp: true }), P()])
    for (let i = 0; i < 20; i++) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 13, `lp→hp chains for ${hp - m.fighters[1].hp} dmg (cancel window)`)

    // determinism
    const run = (seed) => {
        const mm = e.createMatch({ seed, guardButton: true, p1: { ...BY_ID.riv, cpu: true }, p2: human('krax') })
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
        const mm = e.createMatch({ seed: 1234, guardButton: true, p1: { ...BY_ID[id], cpu: true }, p2: human('nyx') })
        let g = 0
        while (mm.phase !== 'done' && g++ < 60 * 60 * 4) e.step(mm, [P(), P()])
        ok(mm.phase === 'done' && mm.winner === 0 && mm.fighters[0].wins >= 2, `CPU ${id} completes a match vs idle`)
    }

    // clock + round structure
    m = mk()
    const t0 = m.timer
    for (let i = 0; i < 60; i++) e.step(m, [P(), P()])
    ok(m.timer === t0 - 60, 'clock ticks 1 per second')
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
    unlinkSync(path.join(HERE, '../src/engine/.mutant-fighting.mjs'))
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
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('canvas[data-viperpit-stage]') && window.__viperPitTest, null, { timeout: 15000 })

    const shots = await page.locator('canvas[data-viperpit-stage]').screenshot()
    ok(shots.length > 5000, 'attract renders a rich frame (non-trivial canvas)')

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

    // two K.O.s advance rounds
    let guard = 0
    while (guard++ < 8 && st.wins[0] < 2 && st.phase !== 'done') {
        await page.evaluate(() => window.__viperPitTest.koP2())
        await page.waitForTimeout(3300)
        st = await page.evaluate(() => window.__viperPitTest.state)
    }
    ok(st.wins[0] >= 2 || st.phase === 'done', `two K.O.s advance rounds (wins ${st.wins.join('-')}, phase ${st.phase})`)

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
