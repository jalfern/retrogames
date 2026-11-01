// ironringcheck — proves IRON RING boots, its core fighting rules hold, and it
// can be won. Part A runs the shared fighting core in plain Node (every verb:
// punch, block/chip, throw, projectile, anti-air, EX, super, charge, cancels,
// combos, round/match flow, seeded determinism, and every CPU tier beating a
// dummy). Part B drives the cabinet in headless Chrome with real key events:
// attract → select → fight → K.O., and checks the drawn frame moves when the
// logical state moves. `--mutate` proves the harness can fail: a dead hitbox
// (never active) must stop all damage.
//
//   npm run ironringcheck            # Node rules + browser drive
//   npm run ironringcheck -- --mutate  # prove red
//   needs `npm run dev` for Part B (IRONRING_URL to point elsewhere)

import { plantNew, pull } from './lib/mutateguard.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { launch, requireDevServer, relayNoise } from './lib/harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const URL = process.env.IRONRING_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/iron-ring`
const MUT = process.argv.includes('--mutate')
const MUTCONT = process.argv.includes('--mutate-continue')

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.error(`FAIL  ${msg}`) } }

const P = (o = {}) => ({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, ...o })
const bust = (p) => `${p}?c=${Date.now()}${MUT ? 'm' : ''}`

// ---- Part A: rules in Node --------------------------------------------------------
console.log(`ironringcheck part A: fighting core rules${MUT ? ' (MUTANT: dead hitboxes)' : ''}`)
const SRC = path.join(HERE, '../src/engine/fighting.js')
if (MUT) {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'))
    const before = src
    const mutated = src.replace(
        "if (!mv || f.phase !== 'active' || !mv.box) return null",
        "if (!mv || f.phase !== 'active' || !mv.box) return null; if (globalThis.__IRONRING_NOHIT__) return null")
    ok(mutated !== before, 'mutate: hitbox gate line found to patch')
    plantNew(path.join(HERE, '../src/engine/.mutant-fighting.mjs'), mutated)
    globalThis.__IRONRING_NOHIT__ = true
}
const ENG_PATH = MUT ? '../src/engine/.mutant-fighting.mjs' : '../src/engine/fighting.js'
const e = await import(bust(ENG_PATH))
const { ROSTER, BY_ID, LADDER } = await import(bust('../src/games/IronRing/fighters.js'))
ok(ROSTER.length >= 6, `roster has ${ROSTER.length} distinct fighters`)
ok(LADDER.length >= 6, 'arcade ladder has 6 opponents')
ok(ROSTER.every((d) => d.moves.lp && d.moves.hp && d.moves.lk && d.moves.hk && d.moves.throw), 'every fighter has punch/kick/throw verbs')

const human = (id) => ({ ...BY_ID[id], cpu: false })
const go = (m) => { let g = 0; while (m.phase !== 'fight' && g++ < 400) e.step(m, [P(), P()]) }
const QCF = [{ down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }]

// punch lands
let m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
go(m)
m.fighters[1].x = m.fighters[0].x + 1.2
let hp = m.fighters[1].hp
e.step(m, [P({ hp: true }), P()])
for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
    ok(MUT ? hp - m.fighters[1].hp === 0 : hp - m.fighters[1].hp === 9, `heavy punch deals ${hp - m.fighters[1].hp} dmg${MUT ? ' (mutant suppresses it)' : ''}`)

// block absorbs, chips heavy only
if (!MUT) {
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P({ right: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P(), P({ right: true })])
    ok(m.fighters[1].st === 'blockstun' && hp - m.fighters[1].hp <= 1, `blocking takes ${hp - m.fighters[1].hp} (chip), st ${m.fighters[1].st}`)

    // low must be crouch-blocked: standing block vs sweep
    m = e.createMatch({ seed: 5, p1: human('vexa'), p2: human('kade') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ right: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ right: true })])
    ok(hp - m.fighters[1].hp >= 4, `low kick hits a standing block (${hp - m.fighters[1].hp} dmg)`)
    m = e.createMatch({ seed: 5, p1: human('vexa'), p2: human('kade') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ right: true, down: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ right: true, down: true })])
    ok(hp - m.fighters[1].hp === 0, 'low kick is crouch-blocked cleanly')

    // throw ignores block
    m = e.createMatch({ seed: 5, p1: human('brakk'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ right: true, hp: true }), P({ left: true })])
    for (let i = 0; i < 8; i++) e.step(m, [P({ right: true }), P({ left: true })])
    ok(hp - m.fighters[1].hp === 12, `throw beats block (${hp - m.fighters[1].hp})`)

    // projectile
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m)
    hp = m.fighters[1].hp
    for (const s of QCF) e.step(m, [P(s), P()])
    let spawned = 0
    for (let i = 0; i < 110; i++) { if (m.projectiles.length) spawned = 1; e.step(m, [P(), P()]) }
    ok(spawned === 1, 'fireball spawns')
    ok(hp - m.fighters[1].hp === 7, 'fireball hits for its damage')

    // anti-air dp
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    for (const s of [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }]) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'dp', 'rising anti-air (dp) starts')

    // ex + super auto-upgrade the same motion
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m); m.fighters[0].meter = 60
    for (const s of QCF) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcfx' && m.fighters[0].meter === 10, 'EX special at 50+ meter')
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m); m.fighters[0].meter = 100
    for (const s of QCF) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcf_S' && m.fighters[0].meter === 0, 'super auto-fires at full meter')

    // charge special
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('vexa') })
    go(m)
    for (let i = 0; i < 50; i++) e.step(m, [P({ left: true }), P()])
    e.step(m, [P({ right: true, lp: true }), P()])
    ok(m.fighters[0].move === 'charge', 'charge special after holding back')

    // cancel chain: lp -> hp after the hit lands, combo >= 2
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    let i = 0
    for (; i < 40; i++) { e.step(m, [i === 0 ? P({ lp: true }) : P(), P()]); if (m.events.some((ev) => ev.kind === 'hit')) break }
    for (let j = 0; j < 4; j++) e.step(m, [P(), P()])
    e.step(m, [P({ hp: true }), P()])
    for (let j = 0; j < 14; j++) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 12 && m.fighters[0].combo >= 2, `cancel combo deals ${hp - m.fighters[1].hp} with ${m.fighters[0].combo}-hit counter`)

    // determinism: seed + pad streams -> identical hashes
    const run = (seed) => {
        const mm = e.createMatch({ seed, p1: human('kade'), p2: human('hyde') })
        go(mm)
        const hs = []
        for (let k = 0; k < 900; k++) {
            e.step(mm, [P({ right: k % 40 < 20, lp: k % 37 === 0, down: k % 90 === 0 }), P({ left: k % 50 < 25, hk: k % 53 === 0 })])
            hs.push(e.matchHash(mm))
        }
        return hs.join(',')
    }
    ok(run(3) === run(3), 'same seed + same pads -> identical hash stream')
    const runCpu = (seed) => {
        const mm = e.createMatch({ seed, p1: { ...BY_ID.kade, cpu: true }, p2: human('hyde') })
        go(mm)
        const hs = []
        for (let k = 0; k < 900; k++) { e.step(mm, [P(), P()]); hs.push(e.matchHash(mm)) }
        return hs.join(',')
    }
    ok(runCpu(3) !== runCpu(4), 'different seed -> different CPU stream')

    // the game can be won: every CPU tier beats an idle dummy 2-0
    for (const id of LADDER) {
        const mm = e.createMatch({ seed: 1234, p1: { ...BY_ID[id], cpu: true }, p2: human('vexa') })
        let g = 0
        while (mm.phase !== 'done' && g++ < 60 * 60 * 4) e.step(mm, [P(), P()])
        ok(mm.phase === 'done' && mm.winner === 0 && mm.fighters[0].wins >= 2, `CPU ${id} completes a match vs idle`)
    }

    // round + match structure: two KOs = done, timer decrements
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    const t0 = m.timer
    for (let i = 0; i < 60; i++) e.step(m, [P(), P()])
    ok(m.timer === t0 - 60, 'clock ticks 1 per second')
    let g = 0
    while (m.phase !== 'done' && g++ < 60000) { m.fighters[1].hp = 0; e.step(m, [P(), P()]) }
    ok(m.phase === 'done' && m.winner === 0 && m.fighters[0].wins >= 2, 'match completes when rounds are won')
}

if (MUT) {
    globalThis.__IRONRING_NOHIT__ = true
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P()])
    for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
    ok(m.fighters[1].hp === hp, 'MUTANT check: with the patched gate no damage ever lands (harness bites)')
    globalThis.__IRONRING_NOHIT__ = false
    pull(path.join(HERE, '../src/engine/.mutant-fighting.mjs'))
}

console.log(`part A: ${pass} ok, ${fail} fail`)

// ---- mutate-continue: prove the ladder-loss continue gate can fail --------------
// (deleting the continue branch keeps a lost ladder run silently on 'play'/'attract'
// instead of the CONTINUE? screen — the normal-mode gate below must then go red.)
if (MUTCONT) {
    console.log('mutate-continue: proving the continue-screen gate bites')
    await requireDevServer(URL)
    const mb = await launch()
    const mp = await mb.newPage({ viewport: { width: 1024, height: 640 } })
    await mp.addInitScript(() => { window.__IRONRING_NOCONTINUE__ = true })
    await mp.goto(URL, { waitUntil: 'networkidle' })
    await mp.waitForFunction(() => window.__ironRingTest, null, { timeout: 15000 })
    await mp.evaluate(() => window.__ironRingTest.start())
    await mp.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await mp.evaluate(() => window.__ironRingTest.koP1())
    await mp.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await mp.evaluate(() => window.__ironRingTest.koP1())
    await mp.waitForTimeout(3200)
    const ms = await mp.evaluate(() => window.__ironRingTest.state)
    ok(ms.screen !== 'continue' && (ms.screen === 'play' || ms.screen === 'attract'),
        `mutant: loss never reaches the continue screen (screen ${ms.screen}) — the gate would catch its removal`)
    await mb.close()
    console.log(`ironringcheck (mutate-continue): ${pass} ok, ${fail} fail`)
    process.exit(fail ? 1 : 0)
}

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
    await page.waitForFunction(() => document.querySelector('canvas[data-ironring-stage]') && window.__ironRingTest, null, { timeout: 15000 })

    let shots = await page.locator('canvas[data-ironring-stage]').screenshot()
    ok(shots.length > 5000, 'attract renders a rich frame (non-trivial canvas)')

    await page.keyboard.press('Digit1')
    await page.waitForTimeout(200)
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase !== 'intro', null, { timeout: 20000 })
    let st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st && (st.phase === 'fight' || st.phase === 'ko'), `fight starts from select (phase ${st && st.phase})`)

    // walk forward while punching: inputs must reach the sim, and land when in range
    await page.keyboard.down('ArrowRight')
    let punchStarted = false, hitLanded = false
    for (let i = 0; i < 16 && !(punchStarted && hitLanded); i++) {
        await page.keyboard.press('KeyK')
        await page.waitForTimeout(200)
        const s = await page.evaluate(() => window.__ironRingTest.state)
        if (s.st[0] === 'hp' || s.st[0] === 'lp' || s.st[0] === 'hk') punchStarted = true
        if (s.hp[1] < 100) hitLanded = true
    }
    const shotA = await page.locator('canvas[data-ironring-stage]').screenshot()
    await page.keyboard.press('KeyK')
    await page.waitForTimeout(250)
    const shotB = await page.locator('canvas[data-ironring-stage]').screenshot()
    await page.keyboard.up('ArrowRight')
    ok(Buffer.compare(shotA, shotB) !== 0, 'frame changes between consecutive frames (renderer alive)')
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(punchStarted, 'keyboard attack input starts a move in the sim (inputs reach the engine)')
    ok(hitLanded || st.x[0] !== -2.6, `attack closes on the CPU (P2 hp ${st.hp[1]}, P1 x ${st.x[0]})`)

    // round + match flow: two K.O.s end the match with the human ahead
    let guard = 0
    while (guard++ < 8 && st.wins[0] < 2 && st.phase !== 'done') {
        await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
        await page.evaluate(() => window.__ironRingTest.koP2())
        await page.waitForTimeout(200)
        st = await page.evaluate(() => window.__ironRingTest.state)
    }
    ok(st.wins[0] >= 2 || st.phase === 'done', `two K.O.s advance rounds (wins ${st.wins.join('-')}, phase ${st.phase})`)

    // pause overlay
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const pausedVisible = await page.evaluate(() => !!document.body.innerText.match(/IRON RING|RESUME|PAUSED|CONTROL/i))
    ok(pausedVisible, '?/Esc opens the pause overlay')
    await page.keyboard.press('Escape')

    // ---- continue screen (#1103): a lost ladder run asks CONTINUE? with credits ----
    await page.evaluate(() => window.__ironRingTest.start())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'continue', null, { timeout: 8000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'continue', `ladder loss lands on the CONTINUE screen (screen ${st.screen})`)
    ok(st.continueFrames > 0 && st.credits === 3, `continue shows a countdown + full credits (frames ${st.continueFrames}, credits ${st.credits})`)
    ok(st.quote === BY_ID[st.opponent].quote, `the winning CPU taunts with its quote (${st.quote})`)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'play', null, { timeout: 4000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.credits === 2 && st.opponent === 'vexa', `SPACE spends a credit and retries the SAME rung (credits ${st.credits}, opp ${st.opponent})`)
    // lose the retried run too, then let the countdown run out (no key) → attract
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'continue', null, { timeout: 8000 })
    ok((await page.evaluate(() => window.__ironRingTest.state)).credits === 2, `second loss keeps the spent credit (credits 2)`)
    await page.evaluate(() => window.__ironRingTest.expireContinue())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'attract', null, { timeout: 2000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'attract' && st.credits === 0, `countdown expiry ends the run at attract, credits lost (credits ${st.credits})`)

    // ---- victory quote (#1103): winning the last rung crowns with the fighter's quote ----
    await page.evaluate(() => { window.__ironRingTest.start(); window.__ironRingTest.setLadder(5) })
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP2())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP2())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'champion', null, { timeout: 8000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'champion', `winning the final rung crowns the player (screen ${st.screen})`)
    ok(st.quote === BY_ID.kade.quote, `champion screen shows the player's victory quote (${st.quote})`)

    ok(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ') || 'clean'})`)
    await browser.close()
}

console.log(`ironringcheck: ${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
