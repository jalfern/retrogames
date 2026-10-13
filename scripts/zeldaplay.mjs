// ZELDA — real-key browser smoke. The shipped build crashed ON MOUNT
// (PauseOverlay rendered unconditionally with the wrong prop) and every
// zelda gate ran in Node, so nothing saw it. This drives Chrome with real
// keys only: the page must mount, attract must draw, a real key must start
// the game, arrows must walk Link cell-for-cell along a route the world
// grid says is open, "?" must open and close the pause overlay, a paused
// world must not move under a held key, and play must resume after.
//
//   npm run zeldaplay     (needs `npm run dev`)
import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { screenOf, at, isWall, TILE } from '../src/games/Zelda/world.js'

const URL = process.env.OP_URL || 'http://localhost:5173/retrogames/zelda'
await requireDevServer(URL)

const r = new Report('zeldaplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 720, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => !!window.__zeldaTest)) break
    await page.waitForTimeout(200)
}
const mounted = await page.evaluate(() => !!window.__zeldaTest)
r.check('the game mounts (hook live, no crash)', mounted)
if (!mounted) {
    r.check('zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    r.exit(browser)
}

const lit = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++
    return n
})
r.check('the attract screen draws (lit pixels on canvas)', lit > 50, `${lit} lit`)

const st = () => page.evaluate(() => ({
    screen: window.__zeldaTest.screen(),
    scr: window.__zeldaTest.game().scr,
    x: window.__zeldaTest.game().px,
    y: window.__zeldaTest.game().py,
    hearts: window.__zeldaTest.game().hearts
}))
const cell = (s) => [Math.floor((s.x + 8) / TILE), Math.floor((s.y + 10) / TILE)]
const OK = (scrId, c, rl) => {
    const scrDef = screenOf(scrId)
    if (c < 0 || c >= 16 || rl < 0 || rl >= 11) return false
    const ch = at(scrDef, c, rl)
    return !isWall(ch, scrDef.kind) && !'CSDOF'.includes(ch || 'X')
}
// Link's face (#f8b800) is painted by drawLink and by nothing else in the
// palette — so counting it inside the box the sim puts him in is the only
// check that grades "I can see my character", not just "the sim moved".
// (An invisible player passed every coordinate-only check in v1 of this
// script while Jon died to octoroks he could not see.) Polls through the
// legitimate post-hit invincibility flicker (0.3 alpha on blink frames).
const faceAt = async (tries = 20) => {
    for (let k = 0; k < tries; k++) {
        const n = await page.evaluate(() => {
            const c = document.querySelector('canvas')
            const g = window.__zeldaTest.game()
            const x = Math.max(0, Math.round(g.px + 1))
            const y = Math.max(0, Math.round(g.py - 3))
            const d = c.getContext('2d').getImageData(x, y, 16, 22).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] === 0xf8 && d[i + 1] === 0xb8 && d[i + 2] === 0) n++
            return n
        })
        if (n >= 8) return n
        await page.waitForTimeout(50)
    }
    return 0
}

const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

await page.keyboard.press('Space')
await page.waitForTimeout(400)
r.check('a real key leaves attract', (await st()).screen === 'play')

r.check(`Link is ON SCREEN — his face pixels sit where the sim puts him (${await faceAt()} px)`, (await faceAt()) >= 8)

// Plan once from the live spawn cell: the longest straight run of open
// cells (walls, caves, doors and shops are not walkable targets).
let s0 = await st()
let [c0, r0] = cell(s0)
const runLen = (d) => {
    let n = 0
    while (n < 8 && OK(s0.scr, c0 + D[d][0] * (n + 1), r0 + D[d][1] * (n + 1))) n++
    return n
}
const dir = ['up', 'down', 'left', 'right'].sort((a, b) => runLen(b) - runLen(a))[0]
const run = runLen(dir)
r.check(`the grid offers a walkable ${dir}-run of 3+ cells from the spawn`, run >= 3, `run=${run}`)

for (let i = 1; i <= Math.min(run, 4); i++) {
    const tc = c0 + D[dir][0] * i, tr = r0 + D[dir][1] * i
    await page.keyboard.down(KEY[dir])
    let arrived = false
    for (let k = 0; k < 40; k++) {
        await page.waitForTimeout(50)
        const [c, rr] = cell(await st())
        if (c === tc && rr === tr) { arrived = true; break }
        if ((await st()).screen !== 'play') break
    }
    await page.keyboard.up(KEY[dir])
    const s = await st()
    const face = await faceAt()
    r.check(`cell ${i}: a held ${dir} walks onto the open cell (${tc},${tr})`, arrived && s.screen === 'play', `at ${cell(s)} hearts ${s.hearts}`)
    r.check(`cell ${i}: Link is VISIBLE there (${face} face px at his sim coords)`, arrived && face >= 8)
    if (!arrived) break
}

s0 = await st()
await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift')
await page.waitForTimeout(300)
r.check('"?" opens the pause overlay', await page.evaluate(() => document.body.innerText.includes('CONTROLS')))
r.check('the pause overlay names the game', await page.evaluate(() => document.body.innerText.includes('ZELDA')))

await page.keyboard.down(KEY[dir === 'up' ? 'down' : 'up'])
await page.waitForTimeout(700)
await page.keyboard.up(KEY[dir === 'up' ? 'down' : 'up'])
const p = await st()
r.check('a paused world ignores a held key', p.x === s0.x && p.y === s0.y, `(${s0.x},${s0.y}) -> (${p.x},${p.y})`)

await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift')
await page.waitForTimeout(300)
r.check('"?" closes the pause overlay', !(await page.evaluate(() => document.body.innerText.includes('CONTROLS'))))

await page.keyboard.down(KEY[dir])
let resumed = false
for (let k = 0; k < 30; k++) {
    await page.waitForTimeout(50)
    const s = await st()
    if (s.x !== p.x || s.y !== p.y) { resumed = true; break }
}
await page.keyboard.up(KEY[dir])
r.check('play resumes after unpausing (a real key moves Link again)', resumed)

const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
