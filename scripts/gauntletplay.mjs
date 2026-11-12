// gauntletplay — advisory browser driver (step 6: it must start, play, die and
// restart with real keys and zero page errors; the drawn frame must track the
// logical state). Needs `npm run dev` running.
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.GAUNTLET_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/gauntlet`
const r = new Report('gauntletplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__gauntletTest', start: false, viewport: { width: 820, height: 640 } })

const probe = () => page.evaluate(() => window.__gauntletTest.probe())

// #2091: where the research store answers, the first humanStart raises the
// auto-record consent gate (fixed inset-0, z-9990) and it swallows every
// scripted start until clicked. Answer it with its own NO THANKS button
// (touchselectcheck's phone-true path — a real click, never a grant). Do NOT
// use Escape here: Gauntlet maps Escape to pause (index.jsx onKeyDown), so the
// keyboard decline would freeze the run that the decline just unlocked.
// On machines where the store stays silent the gate never rises: no-op.
const defuseGate = async () => {
    const declined = await page.evaluate(() => {
        const gate = document.querySelector('[data-auto-record-gate]')
        if (!gate) return false
        const btn = [...gate.querySelectorAll('button')].find((el) => /NO THANKS/i.test(el.textContent || ''))
        if (btn) btn.click()
        return true
    })
    if (declined) await page.waitForTimeout(400)
    return declined
}

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const frameHash1 = await page.evaluate(() => window.__gauntletTest.hash())
await page.waitForTimeout(700)
const frameHash2 = await page.evaluate(() => window.__gauntletTest.hash())
r.check('attract demo is alive', frameHash1 !== frameHash2)

// #1641: the attract demo the TRAINED NET plays. Fast-forward a whole quest
// through the browser's own demo tick (advance -> doSim, the real path), and
// the screen must stay attract, the run must end in a WIN, the victory
// banner must fire, the hi-score board must stay untouched, and leaving the
// attract must not carry the demo's BRAIN seat into the player's select.
{
    const q0 = await page.evaluate(() => { localStorage.setItem('gauntlet.board', '[]'); return window.__gauntletTest.netDemoProbe() })
    r.check('#1641: net-demo route live at boot', q0.broken === false && q0.seed === 100 && q0.screen === 'attract' && q0.winBanner === 0, JSON.stringify(q0))
    const res = await page.evaluate(() => {
        const t = window.__gauntletTest
        t.demoSeed(103)
        const before = t.probe().p2
        let banner = 0
        for (let i = 0; i < 20000; i++) {
            t.demoTick()
            const q = t.netDemoProbe()
            if (q.winBanner > 0) { banner = q.winBanner; break }
        }
        const after = t.probe().p2
        const q = t.netDemoProbe()
        return { banner, screen: q.screen, broken: q.broken, end: t.state().end,
            moved: after && before ? Math.hypot(after.x - before.x, after.y - before.y) : -1,
            board: localStorage.getItem('gauntlet.board') }
    })
    r.check('#1641: net wins the attract quest on the real path (seed 103)', res.banner > 0 && res.end === 'win' && !res.broken && res.screen === 'attract', JSON.stringify(res))
    r.check('#1641: the net partner travelled under its own pads', res.moved > 5, `${res.moved.toFixed(1)} cells`)
    r.check('#1641: a demo win banks no hi-score', res.board === '[]', String(res.board))
    await page.reload()
    await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
    await page.waitForTimeout(400)
}

await page.keyboard.press('Enter')
await page.waitForTimeout(300)
p0 = await probe()
r.check('hero select opens', p0.screen === 'select', p0.screen)
{
    const pm = await page.evaluate(() => window.__gauntletTest.state().partnerMode)
    r.check('#1641: leaving attract hands the player an unseated brain', pm === 'off', `pm=${pm}`)
}
await page.keyboard.press('Digit1')
await page.waitForTimeout(400)
const gateUp = await defuseGate()
r.check('#2091: the consent gate declines — never grants — on scripted starts',
    !gateUp || await page.evaluate(() => {
        const map = JSON.parse(localStorage.getItem('retrogames-consent-v1') || '{}')
        return Object.keys(map).length > 0
            && Object.values(map).every((c) => c && !c.motion && !c.voice && c.at > 0)
    }), gateUp ? 'gate rose; NO THANKS clicked (motion+voice false, at stamped)' : 'store silent — no gate on this machine')
p0 = await probe()
r.check('Warrior starts the first maze', p0.screen === 'play' && p0.level === 0, `${p0.screen} lvl${p0.level}`)

// drive with real keys: walk, turn, swing, shoot
const before = await probe()
for (let i = 0; i < 6; i++) { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(120) }
await page.keyboard.up('ArrowUp')
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(200)
await page.keyboard.up('ArrowLeft')
await page.keyboard.press('Space')
await page.keyboard.press('KeyX')
await page.waitForTimeout(250)
const after = await probe()
r.check('arrow keys move the hero', Math.hypot(after.hero.x - before.hero.x, after.hero.y - before.hero.y) > 0.2,
    `${before.hero.x.toFixed(2)},${before.hero.y.toFixed(2)} -> ${after.hero.x.toFixed(2)},${after.hero.y.toFixed(2)}`)
r.check('turn changed heading', after.hero.a !== before.hero.a)
const evs = await page.evaluate(() => window.__gauntletTest.events().map((e) => e.type))
r.check('sword + bow fired', evs.includes('sword') && evs.includes('shoot'), [...new Set(evs)].join(','))

// 2P real frame path (issue #491): with a human partner, P2 (WASD) steers itself
// by its OWN input through the actual rAF body (doFrameSim -> doSim -> step); it
// does NOT trail the hero. The drop was in doSim's one-arg signature; #492 fixed
// that (and folded the second pad in via p2From). This drives the real frame
// path so the fix can't regress: P2 holding W must leave a stationary P1 behind.
{
    await page.evaluate(() => {
        const t = window.__gauntletTest
        t.start2P('warrior', 'elf')
        const gs = t.state()
        gs.monsters = []; gs.gens.forEach((g) => { g.alive = false })
        gs.hero.hp = 1e9; gs.partner.hp = 1e9
        t.setP2({ u: true })                    // P2 holds W (up); P1 hands off
        const a = t.probe()
        for (let i = 0; i < 50; i++) t.frame()  // drive the real frame path
        const b = t.probe()
        t.setP2({ u: false })
        t.__491 = { p0: a.p2, p1: b.p2, h: b.hero }
    })
    const g = await page.evaluate(() => window.__gauntletTest.__491)
    r.check('2P: P2 walks up by its own input (real frame path)', g.p1.y < g.p0.y - 1,
        `${g.p0.y.toFixed(2)} -> ${g.p1.y.toFixed(2)}`)
    r.check('2P: P2 does not trail the idle hero', Math.hypot(g.p1.x - g.h.x, g.p1.y - g.h.y) > 1,
        `dist ${Math.hypot(g.p1.x - g.h.x, g.p1.y - g.h.y).toFixed(2)}`)
    r.check('2P: P2 faces where it walks', Math.abs(g.p1.a + Math.PI / 2) < 0.01, `a ${g.p1.a.toFixed(2)}`)
}

// death via the dev hook (no cheating inside sim: starve it honestly)
await page.evaluate(() => { window.__gauntletTest.state().hero.hp = 1 })
await page.waitForTimeout(600)
let p = await probe()
r.check('low health dies (lives spent)', p.lives < 3 || p.end === 'over', `lives ${p.lives}`)
// drain it to the end
for (let i = 0; i < 40 && p.screen === 'play'; i++) {
    await page.evaluate(() => { const gs = window.__gauntletTest.state(); if (gs.hero.hp > 0) gs.hero.hp = 1 })
    await page.waitForTimeout(400)
    p = await probe()
}
r.check('all lives spent -> game over screen', p.screen === 'over' || p.end === 'over', `${p.screen} end=${p.end}`)
await page.waitForTimeout(1200)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p = await probe()
r.check('restart returns to hero select', p.screen === 'select', p.screen)

// pixel sanity: the view is not blank while playing
await page.keyboard.press('Digit3')
await page.waitForTimeout(700)
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-gauntlet-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(40, 40, 120, 100).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++
    return lit
})
r.check('the corridor actually renders', px > 500, `${px} lit px`)

// #494 player slots on the REAL path: a cpu seat opened at hero select must
// carry a partner that moves under its own emitted pads, and the contract must
// step one pad per player.
{
    for (let i = 0; i < 20 && (await probe()).screen === 'play'; i++) {
        await page.evaluate(() => { const gs = window.__gauntletTest.state(); if (gs.hero.hp > 0) gs.hero.hp = 1 })
        await page.waitForTimeout(350)
    }
    await page.waitForTimeout(1200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    let q = await probe()
    r.check('#494: back at hero select for the seat test', q.screen === 'select', q.screen)
    await page.keyboard.press('KeyC')
    await page.waitForTimeout(150)
    q = await probe()
    r.check('#494: C opens the cpu seat at select', q.seat === 'cpu', q.seat)
    await page.keyboard.press('Digit1')
    await page.waitForTimeout(500)
    await defuseGate() // defensive: any start that re-asks still lands
    const c0 = await probe()
    r.check('#494: the cpu seat carries a partner into the maze', c0.p2 !== null && c0.seat === 'cpu', `p2=${!!c0.p2} seat=${c0.seat}`)
    // the hero runs; the pad-emitting partner must follow under its own pads
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(60); await page.evaluate(() => window.__gauntletTest.frame()) }
    await page.keyboard.up('ArrowUp')
    for (let i = 0; i < 60; i++) await page.evaluate(() => window.__gauntletTest.frame())
    const c1 = await probe()
    const travel = c0.p2 && c1.p2 ? Math.hypot(c1.p2.x - c0.p2.x, c1.p2.y - c0.p2.y) : -1
    r.check('#494: the cpu partner travels under its own pads',
        travel > 0.3,
        travel < 0 ? 'no partner on the board (start blocked?)' :
            `${c0.p2.x.toFixed(2)},${c0.p2.y.toFixed(2)} -> ${c1.p2.x.toFixed(2)},${c1.p2.y.toFixed(2)}`)

    const cs = await page.evaluate(() => {
        const g = window.__game
        g.reset(7)
        const s1 = g.step([{ up: true }, { right: true, a: true }], 1)
        const s2 = g.step({ up: true }, 1)
        g.release()
        return { t1: s1.tick, t2: s2.tick }
    })
    r.check('#494: step([p1,p2]) steps exactly one tick and legacy pad still steps',
        cs.t1 === cs.t2 - 1, JSON.stringify(cs))
}

// #495 recording format on the REAL page: record a driven 2P run through the
// contract, stop, and replay the file through the same live contract — every
// checkpoint hash must land, and the raw channel must carry the sub-dead-zone
// nudges the pads dropped.
{
    const rr = await page.evaluate(() => {
        const g = window.__game
        g.reset(11, 2)
        g.recordStart(30)
        for (let i = 0; i < 240; i++) {
            const go = i % 97 < 40
            g.step([{ x: go ? 0.9 : 0.08, y: go ? -0.3 : 0.03, a: i % 19 < 2 }, { up: go, right: !go }])
        }
        const rec = g.recordStop()
        const res = g.replay(rec)
        g.release()
        return {
            fmt: rec.format, seed: rec.seed, ticks: rec.ticks, build: rec.build,
            voice: rec.voice === undefined ? null : { tracks: rec.voice.tracks.length, declined: rec.voice.declined.length },
            src: rec.slots.map((s) => s.source.kind),
            hashes: rec.hashes.length,
            nudged: rec.slots[0].raw.filter((x) => x.x === 0.08).length,
            ok: res.ok, mismatch: res.mismatch ? res.mismatch.tick : null, replayTicks: res.ticks,
        }
    })
    // #2100: the old v1 pin was stale from before #1247 voice capture landed.
    // On a real page the armed interaction opens the voice session and ANY voice
    // section tags the file v2 (recording.js finish()); machines where mic
    // acquisition fails stay v1 with no section. Pin the SEMANTICS — v2 iff a
    // voice section is present — not one tag, so both honest answers pass and a
    // tag/content mismatch goes red even if replay skipped validation.
    r.check('#495: contract capture writes a well-tagged file with v2 iff voice (240 ticks, human-stream seats)',
        rr.seed === 11 && rr.ticks === 240 && rr.hashes >= 8 && rr.src.every((k) => k === 'model') &&
            (rr.fmt === 'retrogames-rec/v2') === (rr.voice !== null) &&
            (rr.fmt === 'retrogames-rec/v1' || rr.fmt === 'retrogames-rec/v2'),
        JSON.stringify(rr))
    r.check('#495: raw channel mirrors the contract stream analog per tick (pre-quantize)', rr.nudged > 3, `${rr.nudged} ticks`)
    r.check('#495: recorded run replays hash-equal through __game.replay', rr.ok === true && rr.mismatch === null,
        rr.mismatch !== null ? `diverged at tick ${rr.mismatch}` : JSON.stringify(rr))
}

r.exit(browser)
