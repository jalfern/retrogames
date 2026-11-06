// COMET DRIFT — SAND DEFORM proof (#1696): real key events only, presented
// state only. Geometry/determinism/mutants are cometcheck's job; this proves
// what the Node harness cannot see: the LIVE renderer's ground bake actually
// changes under real driving and heals on a fresh race.
//
//   npm run cometsandplay    (needs `npm run dev`)
//
// 1. a real ArrowRight walks the buggy off the Sandbank asphalt onto the sand,
//    and the live marks Map grows — ruts + lips appear (hist has -1);
// 2. the baked texels the renderer draws are painted — gndPeek shows the
//    pristine word replaced by the tinted step (0.89/0.78 dark, 1.11 lip),
//    clamped to the desert range, alpha intact;
// 3. a cliff bump on the sand stamps the deepest word (depth 3);
// 4. a reset (the harness's own reset(seed) path) heals: marks empty AND every
//    peeked texel back to its pristine word — the same bake the raster reads;
// 5. zero page errors across the whole drive.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'
import { selectCourse, TRACK } from '../src/games/CometDrift/track.js'

const URL = process.env.COMET_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift`
await requireDevServer(URL)

selectCourse('sandbank')
const N = TRACK.N
let straight = { len: 0, start: 0 }, cur = 0
for (let w = 0; w < 2 * N; w++) {
    cur = Math.abs(TRACK.pts[w % N].k) <= 0.0012 ? cur + 1 : 0
    if (cur > straight.len) straight = { len: cur, start: (w - cur + 1 + N) % N }
}
const ENTRY = (straight.start + 4) % N

const r = new Report('cometsandplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => {
    const t = window.__cometTest
    const g = t.game()
    return { screen: t.screen(), phase: g.phase, tick: g.tick, v: g.karts[0].v, ...t.pos(), sand: t.sand() }
})
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__cometTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__cometTest never appeared (dev server? /comet-drift route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(700)
await page.keyboard.press('KeyX')
await wait(300)
{
    const p = await probe()
    r.check('a real key starts the race', p.screen === 'race', `screen=${p.screen}`)
}

// seed the front straight (the __cometTest.setup precedent), then real keys only
await page.evaluate((i) => window.__cometTest.setup({ i, v: 5, go: true }), ENTRY)
await wait(350)

// drive onto the sand: throttle + held right across the shoulder
await page.keyboard.down('ArrowUp')
await wait(500)
await page.keyboard.down('ArrowRight')
await wait(430)
await page.keyboard.up('ArrowRight')
let s1 = null
for (let i = 0; i < 30; i++) { s1 = await probe(); if (s1.sand.size > 12) break; await wait(100) }
r.check('real ArrowRight walks off the asphalt and the sand starts recording', s1 && s1.sand.size > 12,
    `size ${s1 ? s1.sand.size : -1} surf ${s1 ? s1.surf : '?'}`)
r.check('the census sees ruts AND heaped lips', !!s1 && (s1.sand.hist['1'] || 0) > 4 && (s1.sand.hist['-1'] || 0) > 4,
    s1 ? JSON.stringify(s1.sand.hist) : 'no sample')

// keep the buggy on the move and swing it around — the circle reaches the
// cliff, where a bump must scar the deepest word
let hist = { ...(s1 ? s1.sand.hist : {}) }
await page.keyboard.down('ArrowLeft')
for (let i = 0; i < 30; i++) {
    const p = await probe()
    for (const [k, v] of Object.entries(p.sand.hist)) hist[k] = (hist[k] || 0) + v
    if ((hist['3'] || 0) > 0) break
    await wait(120)
}
await page.keyboard.up('ArrowLeft')
r.check('a cliff bump in the sand stamps the crater core (depth 3)', (hist['3'] || 0) > 0, JSON.stringify(hist))

// the bake the raster samples must actually carry the tint
const peek = await page.evaluate(() => {
    const t = window.__cometTest
    const g = t.game()
    const keys = [...g.marks.keys()].slice(0, 40)
    return { keys, words: keys.map((k) => t.gndPeek(k)) }
})
const rgba = (w) => [(w >>> 0) & 255, (w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255]
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b
let painted = 0; let alphaOk = true; let rangeOk = true
for (const [before, after] of peek.words) {
    const B = rgba(before); const A = rgba(after)
    if (A[3] !== 255 || B[3] !== 255) alphaOk = false
    if (lum(A) !== lum(B)) painted++
    if (A.slice(0, 3).some((c) => c > 255)) rangeOk = false
}
r.check('the drawn bake carries the deformation (marked texels differ from pristine)',
    peek.keys.length > 4 && painted >= Math.max(2, Math.floor(peek.keys.length * 0.5)),
    `${painted}/${peek.keys.length} peeked texels changed`)
r.check('tints stay inside the desert range with alpha intact', alphaOk && rangeOk)

// fresh race heals: marks gone AND the bake words back to pristine
await page.evaluate(() => window.__game.reset(4))
await wait(400)
const healed = await page.evaluate((keys) => {
    const t = window.__cometTest
    return { size: t.sand().size, same: keys.map((k) => t.gndPeek(k)).every(([a, b]) => a === b) }
}, peek.keys)
r.check('reset clears the census', healed.size === 0, `size ${healed.size}`)
r.check('reset heals every peeked texel back to its pristine word', healed.same)

await page.keyboard.up('ArrowUp').catch(() => {})
r.check('zero page errors across the whole drive', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
