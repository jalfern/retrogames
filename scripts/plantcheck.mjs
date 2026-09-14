// Piranha plant behaviour check.
//
// Verifies the contract that makes plants fair rather than random death:
//   1. they spawn from the level def, one per declared pipe
//   2. they cycle fully: retracted -> fully out -> retracted
//   3. the hitbox is EXACTLY the emerged part (h = PLANT_H * out, y = pipeTop - h),
//      which is what makes standing on a pipe lip safe while it is down
//   4. contact hurts Mario -- and never while the plant is still in its pipe
//   5. they are not stompable and survive the contact (no squash, no flip)
//
// Mario is parked on a 4-tile pipe lip, which no ground enemy can reach, so the
// only thing that can hurt him in this test is the plant. He is re-powered to
// Big between hits so several full cycles get sampled instead of one death.
//
// Usage:
//   npm run plantcheck
//   node scripts/plantcheck.mjs [--seconds 14] [--url <url>]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const seconds = +opt(args, '--seconds', 14)

const PIPE_COL = 46       // the 4-tile pipe in 1-1 that carries a plant
const STAND_COL = PIPE_COL // stand ON the pipe's own tile — derived, never hand-tuned,
                           // because the plant's hitbox used to hang 6px off the pipe's
                           // right shoulder and this constant was quietly tuned to that
const STAND_ROW = 9       // solid row of the pipe top (13 - pipe height 4)
const EXPECT_PLANTS_1_1 = 3
const PLANT_H = 26

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url, start: true, wait: 2600 })
const r = new Report('plantcheck')

const sample = () => page.evaluate(() => ({
    plants: window.__marioTest.plants(),
    st: window.__marioTest.getState(),
}))

// Drop Big Mario precisely onto the pipe lip. teleport(col) alone only sets x,
// which would embed him in the pipe at ground level and prove nothing.
await page.evaluate(([c, row]) => {
    window.__marioTest.setPower('big')
    window.__marioTest.teleport(c, row)
}, [STAND_COL, STAND_ROW])

const rows = []
let shotTaken = false
const t0 = Date.now()
while ((Date.now() - t0) / 1000 < seconds) {
    const s = await sample()
    const p = s.plants.find(x => (x.pipeCol ?? -1) === PIPE_COL) || s.plants[0]
    if (p) {
        rows.push({
            out: p.out, h: p.h, y: p.y, pipeTop: p.pipeTop, alive: p.alive,
            flip: p.flip, squash: p.squash,
            power: s.st.power, state: s.st.state, my: s.st.y, mh: s.st.h, mcol: s.st.col,
        })
    }
    if (!shotTaken && p && p.out > 0.9 && s.st.state === 'play') {
        await page.screenshot({ path: 'scripts/.shots/plant-out.png' })
        shotTaken = true
    }
    if (s.st.state !== 'play') break
    // Keep him alive: one hit is what we're measuring, but a death would end the
    // run before we could watch the plant complete more of its cycle.
    if (s.st.power === 'small') await page.evaluate(() => window.__marioTest.setPower('big'))
    await page.waitForTimeout(40)
}

if (!rows.length) { r.check('sampled at least one frame', false); r.exit(browser) }

const first = rows[0]
const feet = first.my + first.mh
const maxOut = Math.max(...rows.map(x => x.out))
const minOut = Math.min(...rows.map(x => x.out))
const zeroRows = rows.filter(x => x.out === 0)

console.log(`  ..    sampled ${rows.length} frames over ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`  ..    out range ${minOut.toFixed(2)} .. ${maxOut.toFixed(2)}   pipeTop=${first.pipeTop}   retracted frames=${zeroRows.length}`)
console.log(`  ..    lives: ${first.state} -> ${rows[rows.length - 1].state}`)

// 1. level def
const declared = (await sample()).plants
r.check(`${EXPECT_PLANTS_1_1} plants declared in 1-1`, declared.length === EXPECT_PLANTS_1_1,
    `found ${declared.length} at cols ${declared.map(p => p.col).join(',')}`)

// 2. Mario is where the test claims he is, or the rest is meaningless
r.check('Mario is standing on the pipe lip', Math.abs(feet - first.pipeTop) <= 2,
    `feet=${feet} pipeTop=${first.pipeTop}`)

// 3. full cycle in both directions
r.check('plant fully retracts at some point', minOut === 0, `min=${minOut.toFixed(2)}`)
r.check('plant fully emerges at some point', maxOut > 0.99, `max=${maxOut.toFixed(2)}`)
const rose = rows.some((x, i) => i > 0 && x.out > 0.9 && rows[i - 1].out <= x.out)
const sank = rows.some((x, i) => i > 0 && x.out < 0.3 && rows[i - 1].out > x.out)
r.check('rises AND sinks (not a one-way pop)', rose && sank, `rose=${rose} sank=${sank}`)

// 4. hitbox == emerged part. This is the whole safety story.
const badBox = rows.filter(x => x.h !== Math.round(PLANT_H * x.out) || x.y !== x.pipeTop - x.h)
r.check('hitbox tracks the emerged part exactly', badBox.length === 0,
    badBox.length ? `${badBox.length} bad, e.g. ${JSON.stringify(badBox[0])}` : `${rows.length}/${rows.length} ok`)
r.check('retracted plant has a zero-height hitbox', zeroRows.length > 0 && zeroRows.every(x => x.h === 0),
    `${zeroRows.length} retracted frames`)

// 5. hurts while out, never while in the pipe. Polling is ~40ms so the hurt itself
// may land between samples: it is only a real violation if the plant was still
// fully retracted at BOTH bracketing samples.
const hurts = []
for (let i = 1; i < rows.length; i++) {
    if (rows[i].power !== rows[i - 1].power || (rows[i].state !== 'play' && rows[i - 1].state === 'play')) {
        hurts.push({ i, before: rows[i - 1].out, after: rows[i].out })
    }
}
r.check('an emerged plant hurts Mario', hurts.length > 0, `${hurts.length} contact(s)`)
const badHurts = hurts.filter(h => !(h.before > 0 || h.after > 0))
r.check('never hurts Mario while fully retracted', badHurts.length === 0,
    badHurts.length ? `hurt between out=${badHurts[0].before} and ${badHurts[0].after}` : `all ${hurts.length} contact(s) had it out`)
r.check('stood on the lip safely while it was down', zeroRows.length > 10,
    `${zeroRows.length} safe frames with a retracted plant`)

// 6. not stompable, survives contact
const harmed = rows.filter(x => x.flip || x.squash > 0 || !x.alive)
r.check('plant is never stomped/defeated by contact', harmed.length === 0,
    harmed.length ? `flip=${harmed[0].flip} squash=${harmed[0].squash}` : 'still alive at end of run')

if (!shotTaken) await page.screenshot({ path: 'scripts/.shots/plant-out.png' }).catch(() => {})

console.log('  ..    out/hitbox/power: ' + rows.filter((_, i) => i % 3 === 0)
    .map(x => `${x.out.toFixed(1)}/${x.h}${x.power === 'big' ? 'B' : x.power === 'fire' ? 'F' : 'S'}`).join(' '))

r.exit(browser)
