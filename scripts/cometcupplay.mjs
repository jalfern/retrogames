// COMET CUP PLAY (#1737) — Chrome drives the grand prix with NOTHING but real
// key/tap events:
//
//   npm run cometcupplay   (needs `npm run dev`; DEV_PORT/COMET_URL respected)
//
//   1. C ARMS THE BADGE — real KeyC toggles the COMET CUP badge, and the drawn
//      pill visibly changes (gold-ish pixels appear where the unarmed pill was
//      dim): the picture matches the logical state.
//   2. THE CUP RACES ITS THREE LEGS — tap-to-start drives Gulch, the flag
//      lands on the standings panel, a real tap walks leg 2 (Sandbank) and leg
//      3 (Corkscomb), and the final panel crowns the points leader.
//   3. THE POINTS ARE THE LIVE ORDER — COMET crossing first scores the win's
//      10, and the panel's standings are the sim's classification.
//   4. HOME IS CLEAN — a tap from the final panel returns to attract with the
//      cup reset, and disarming switches back to the classic flow (a mid-race
//      tap walks nothing). Zero page errors throughout.
// Legs are completed by the game's own certified autopilot (setPlan — the same
// decide() line cometcheck wins with in Node and cometplay drives end-to-end):
// every checkpoint, lap and place stays honest. Rules + mutants live in
// cometcheck.mjs.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.COMET_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift`
await requireDevServer(URL)

const r = new Report('cometcupplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(240000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle' })
const wait = (ms) => page.waitForTimeout(ms)
const probe = () => page.evaluate(() => {
    const t = window.__cometTest
    const g = t.game()
    return { screen: t.screen(), course: t.course(), phase: g.phase, end: g.end, cup: (t.cup ? t.cup() : null), place: g.karts[0].place }
})

// gold-pixel census of the badge pill (canvas-space -> page-space is contained;
// sample through the canvas element's own box)
const badgeGold = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const W = c.width; const H = c.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const y = Math.round(H * 0.84)
    const x0 = Math.round(W / 2 - 78); const x1 = Math.round(W / 2 + 78)
    if (y + 14 >= H) return -1
    const img = ctx.getImageData(x0, Math.max(0, y - 14), x1 - x0, 28).data
    let gold = 0
    for (let i = 0; i < img.length; i += 4) {
        if (img[i] > 200 && img[i + 1] > 150 && img[i + 2] < 120) gold++
    }
    return gold
})

r.check('the title loads on attract', (await probe()).screen === 'attract')

// 1 — real C arms the badge, and the drawn pill turns gold
const dim = await badgeGold()
await page.keyboard.press('KeyC')
await wait(250)
const armed = (await probe()).cup
let lit = await badgeGold()
r.check('C arms the cup (state) and the badge visibly lights up (pixels)', armed?.on === true && lit > dim, `dim ${dim} -> lit ${lit}`)
await page.keyboard.press('KeyC')
await wait(150)
r.check('C again disarms (state)', (await probe()).cup?.on === false)
await page.keyboard.press('KeyC')
await wait(150)

// 2 — tap-to-start races leg 1 on Gulch
const box = await (await page.$('canvas')).boundingBox()
const tapMid = async () => { await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height * 0.6)) }
await tapMid()
await wait(400)
let s = await probe()
r.check('a tap starts leg 1 (Gulch) with the cup live', s.screen === 'race' && s.course === 'gulch' && s.cup?.on && s.cup.raceIdx === 0, `${s.screen} ${s.course} ${JSON.stringify(s.cup)}`)

// finish a leg the certified way: the game's OWN autopilot (st.plan — the
// same decide() line cometcheck proves wins and cometplay drives end-to-end)
// runs the four honest laps. Every checkpoint, lap and place is real.
const driveToFlag = async () => {
    let st = await probe()
    let w = 0
    while (st.screen === 'race' && st.phase !== 'race' && w++ < 200) { st = await probe(); await wait(120) }
    await page.evaluate(() => window.__cometTest.setPlan(true))
    st = await probe()
    let guard = 0
    while (st.screen === 'race' && guard++ < 170) { st = await probe(); await wait(1500) }
    await page.evaluate(() => window.__cometTest.setPlan(false))
    return st
}

s = await driveToFlag()
r.check('leg 1 flags onto the standings panel, not the plain end screen', s.screen === 'cupbreak', `${s.screen}`)
let cup = (await probe()).cup
const table = [10, 8, 6, 4, 3, 2, 1]
const comets = (cup.standings || []).find((x) => x.name === 'COMET')
const placeNow = (await probe()).place
r.check('COMET\u2019s panel points are the table value of its real finishing place',
    !!comets && comets.pts === table[placeNow - 1], `place ${placeNow} pts ${comets?.pts}`)

// tap walks the panels: leg 2, leg 3, final
await wait(400)
await tapMid()
await wait(400)
s = await probe()
r.check('the panel tap launches leg 2 on Sandbank', s.screen === 'race' && s.course === 'sandbank' && s.cup.raceIdx === 1, `${s.screen} ${s.course}`)
s = await driveToFlag()
r.check('leg 2 flags onto the standings panel', s.screen === 'cupbreak', `${s.screen}`)
await wait(400)
await tapMid()
await wait(400)
s = await probe()
r.check('the panel tap launches leg 3 on Corkscomb', s.screen === 'race' && s.course === 'corkscomb' && s.cup.raceIdx === 2, `${s.screen} ${s.course}`)
s = await driveToFlag()
r.check('the third flag closes the cup on the final panel', s.screen === 'cupfinal', `${s.screen}`)
cup = (await probe()).cup
const ptsSum = (cup.standings || []).reduce((a, x) => a + x.pts, 0)
const ordered = (cup.standings || []).every((x, i, arr) => i === 0 || arr[i - 1].pts >= x.pts)
r.check('the cup is done: ordered standings and three full ledgers (sum 102)',
    cup.done === true && ordered && ptsSum === 102, `sum ${ptsSum} lead ${cup.leader}`)

// home is clean, and the armed reset keeps the badge state honest
await wait(400)
await tapMid()
await wait(400)
s = await probe()
r.check('a tap from the final panel returns home with the cup legs reset', s.screen === 'attract' && s.cup?.raceIdx === 0 && s.cup?.on === true, `${s.screen} ${JSON.stringify(s.cup)}`)

// 4 — unarmed races keep the classic flow (the plain end screen itself is
// graded by cometplay's full-race stage; here we prove arming is a true mode
// switch and mid-race taps do not walk the cup).
await page.keyboard.press('KeyC') // disarm
await wait(150)
await tapMid()
await wait(400)
s = await probe()
r.check('a plain race starts when the cup is disarmed', s.screen === 'race' && s.cup?.on === false, `${s.screen} ${JSON.stringify(s.cup)}`)
await wait(200)
await tapMid() // a stray tap mid-race must not change screens
r.check('a mid-race tap stays in the race (no phantom panel)', (await probe()).screen === 'race')

r.check('zero page errors across the whole grand prix', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
r.exit(browser)
