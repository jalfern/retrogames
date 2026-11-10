// britannidrive.mjs — real-key browser drive for BRITANNIA's wind-lifted sea
// (#1822): boots, starts with genuine keys, walks the Avatar with real Arrow
// presses, then rides the clock one epoch at a time and proves what the panel
// says the sky does the sea — storm overhead means the panel roughness sits at
// 1.00, a clearing sky never wears full heave — and that the painted pixels
// really carry more bright crest/foam/whitecap ink on storm epochs than clear
// ones. Kept SHORT: full Chrome can't boot on the launchd-kicked box (#1622).
//
// npm run britannidrive   (needs `npm run dev` on $DEV_PORT, default 5173)
import { readFileSync } from 'fs'
import { launchChrome } from './lib/chromeboot.mjs'
import { Report } from './lib/harness.mjs'
import { zipRead, makeWorld, isSea } from '../src/games/Britannia/britmap.js'
import { seaRough } from '../src/games/Britannia/swell.js'
import { routeDest, moonName, DAY_TICKS } from '../src/games/Britannia/moons.js'
import { WX, weatherAt } from '../src/games/Britannia/weather.js'

const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/britannia`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const r = new Report("britannidrive")
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|ERR_NAME_NOT_RESOLVED/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__britanniaTest', null, { timeout: 30000 })
r.check('boots: __britanniaTest present, zero page errors', errs.length === 0, errs.join(' | '))

// bright sea ink: crest strokes, foam and whitecaps all sit light over the
// dark sea body — min(R,G,B) > 90 counts them and nothing flat.
const litInk = async () => {
    const d = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data)
    })
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) > 90) lit++
    return lit
}

await page.keyboard.press('ArrowUp')
await sleep(400)
const started = await page.evaluate(() => !!window.__britanniaTest.state().ready)
r.check('a genuine Arrow press starts the walk', started)

// real keys move the Avatar and pose him
const p0 = await page.evaluate(() => {
    const s = window.__britanniaTest.state()
    return { x: s.x, y: s.y, face: s.face }
})
await page.keyboard.down('ArrowUp')
await sleep(700)
await page.keyboard.up('ArrowUp')
await sleep(200)
const p1 = await page.evaluate(() => {
    const s = window.__britanniaTest.state()
    return { x: s.x, y: s.y, face: s.face, frame: s.frame }
})
r.check('held ArrowUp walks north (y falls, face up, limbs cycling)', p1.y < p0.y && p1.face === 'up' && p1.frame > 0, JSON.stringify({ p0, p1 }))

// the sea knows the wind: ride the clock epoch by epoch and read the panel's
// own exposed words — weather, seaRough, seaRain (not the module constants)
const seen = []
for (let e = 0; e < 12; e++) {
    await page.evaluate(() => window.__britanniaTest.step(1440))
    await sleep(90)
    const s = await page.evaluate(() => {
        const t = window.__britanniaTest.state()
        return { x: t.x, y: t.y, wx: t.weather, r: t.seaRough, rain: t.seaRain }
    })
    seen.push(`${s.wx}:${s.r.toFixed(2)}@${s.x},${s.y}`)
    if (s.wx === 'STORM' && s.r < 0.999) r.check(`storm epoch at ${s.x},${s.y} shows panel roughness 1.00`, false, JSON.stringify(s))
    if (s.wx === 'CLEAR' && (s.r > 0.8501 || (s.r === 0 && s.rain > 0))) r.check(`clearing sky at ${s.x},${s.y} never wears full heave`, false, JSON.stringify(s))
}
const wets = seen.filter((x) => !x.startsWith('CLEAR')).length
r.check('across 12 epochs the walk-point sees both clearing and wet skies', wets >= 2 && seen.length - wets >= 2, seen.join(' '))

// deterministic ink proof: the drive recomputes the wind state of every SEA
// tile the camera shows (same modules, same seed, same ticks the page runs),
// picks the lightest and heaviest epochs of the window, restarts the page to
// each (same spawn, same tick offset) and compares bright crest/foam/whitecap
// pixels. More wind over the same water must paint more light.
const buf = readFileSync('public/games/ultima4.jsdos')
const zip = await zipRead(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const world = makeWorld(zip['WORLD.MAP'])
const terrainAt = (x, y) => world.get(x, y)
const seed0 = await page.evaluate(() => window.__britanniaTest.state().seed)
// stand the Avatar on the coastal moongate (i=5 at 235,211): an inland spawn
// never sees water, and 235,211 sits south of the snow line where fronts rain
await page.evaluate((sd) => { window.__game.reset(sd); window.__britanniaTest.teleport(5); window.__britanniaTest.step(80) }, seed0)
await sleep(150)
const spawn = await page.evaluate(() => { const s = window.__britanniaTest.state(); return { x: s.x, y: s.y, seed: s.seed } })
const R = 10
const seaTiles = []
for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
    if (isSea(world.get(spawn.x + dx, spawn.y + dy))) seaTiles.push([spawn.x + dx, spawn.y + dy])
}
r.check(`the spawn view holds open water to judge (${seaTiles.length} sea tiles within ${R} of ${spawn.x},${spawn.y})`, seaTiles.length >= 6)
const E = 1440
// (#1853) candidates are restricted to epochs where the AVATAR's sky is CLEAR:
// a storm overhead dims the whole frame (the veil darkens the sea ink too), and
// comparing a veiled heavy epoch against a bright light epoch measures the veil,
// not the wind. Under clear skies on both ends, more wind over the same water
// can only paint more light — the post-front sea still heaving under blue sky.
const epochs = []
for (let e = 0; e < 24; e++) {
    const t = e * E + 100
    if (weatherAt(spawn.x, spawn.y, t, spawn.seed, terrainAt) !== WX.CLEAR) continue
    let avg = 0
    for (const [tx, ty] of seaTiles) avg += seaRough(tx, ty, t, spawn.seed, terrainAt)
    avg /= seaTiles.length
    epochs.push({ e, t, avg })
}
epochs.sort((a, b) => a.avg - b.avg)
const lightest = epochs[0], heaviest = epochs[epochs.length - 1]
r.check(`the view spans a real wind range under clear skies (${lightest.avg.toFixed(2)} -> ${heaviest.avg.toFixed(2)} over ${epochs.length} clear epochs)`, heaviest.avg - lightest.avg >= 0.15, JSON.stringify({ lightest, heaviest }))
// replay to the SAME seed and tick offsets: only the epoch differs, so any
// pixel difference is the wind painting the same water.
const seedReset = spawn.seed
const inkAtSeed = async (t) => {
    await page.evaluate((a) => { window.__game.reset(a.sd); window.__britanniaTest.teleport(5); window.__britanniaTest.step(a.tt) }, { sd: seedReset, tt: t })
    await sleep(140)
    return litInk()
}
const inkLight = await inkAtSeed(lightest.t)
const inkHeavy = await inkAtSeed(heaviest.t)
r.check('the heaviest-wind epoch paints more bright sea ink than the lightest (crest gain + foam gain + whitecaps visible)',
    inkHeavy > inkLight, `light=${inkLight} (avg ${lightest.avg.toFixed(2)}) heavy=${inkHeavy} (avg ${heaviest.avg.toFixed(2)})`)
// panel == node: the state the harness exposes matches the drive's own math
const pv = await page.evaluate(() => {
    const s = window.__britanniaTest.state()
    return { r: s.seaRough, x: s.x, y: s.y }
})
const expect = seaRough(spawn.x, spawn.y, heaviest.t, seedReset, terrainAt)
r.check('panel seaRough matches the drive-side recomputation at the same place+tick+seed', Math.abs(pv.r - expect) < 1e-9, JSON.stringify({ pv, expect }))
await page.screenshot({ path: '/tmp/forge/britannia-drive.png' })

// #1862 moon-phase routing: the gate is no taxi — tonight's moon decides the
// destination. Real keys against the wheel: the wrong row is refused (and the
// refusal names the true road), the moonlit row rides, and the road flips when
// the day turns to a full moon.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const st = async () => page.evaluate(() => window.__britanniaTest.state())
const openMenuOn = async (gi) => {
    for (const dir of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']) {
        await page.keyboard.press(dir)
        await sleep(240)
        const s = await st()
        if (s.gate === gi) return true
        if (s.ship) { await page.keyboard.press(dir === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown'); await sleep(240) }
    }
    return false
}
await page.evaluate((sd) => { window.__game.reset(sd); window.__britanniaTest.teleport(0) }, seed0)
await sleep(150)
r.check('stepping beside moongate I whirls the menu open', await openMenuOn(0), JSON.stringify(await st()))
let s = await st()
const routed0 = routeDest(0, s.moon, 8)
r.check(`panel moonRoute matches the wheel at gate I (phase ${s.moon} -> ${ROMAN[routed0]})`, s.moonRoute === routed0, JSON.stringify(s))
const wrong0 = routed0 === 2 ? 3 : 2
await page.keyboard.press(String(wrong0 + 1))
await sleep(160)
s = await st()
r.check(`the wrong road is refused: Digit${wrong0 + 1} neither warps nor closes the menu`, !s.warping && s.gate === 0, JSON.stringify(s))
r.check('the refusal teaches — the toast names the refused gate AND tonight\'s true road',
    /refuseth/.test(s.toastMsg) && s.toastMsg.includes(`routeth to ${ROMAN[routed0]} of ${moonName(routed0)}`), s.toastMsg)
await page.keyboard.press(String(routed0 + 1))
await sleep(200)
s = await st()
r.check('the moonlit road rides: a warp is underway to the routed gate', s.warping && s.warpDest === routed0, JSON.stringify(s))
await sleep(1100)
s = await st()
r.check(`the warp lands on gate ${ROMAN[routed0]} — the moon-route ride completes`,
    s.x === s.gates[routed0][0] && s.y === s.gates[routed0][1] && !s.warping, JSON.stringify({ x: s.x, y: s.y, want: s.gates[routed0] }))
// the wheel turns with the sky: same gate, full moon, a different road
await page.evaluate((i) => { window.__britanniaTest.teleport(i) }, routed0)
await sleep(120)
r.check(`menu whirls open again beside gate ${ROMAN[routed0]}`, await openMenuOn(routed0), JSON.stringify(await st()))
const pre = await st()
await page.evaluate((t) => window.__britanniaTest.setTime(t), DAY_TICKS * 4)
await sleep(140)
s = await st()
r.check(`the day turns to a full moon and the road flips (gate ${ROMAN[routed0]}: ${ROMAN[routeDest(routed0, pre.moon, 8)]} -> ${ROMAN[(routed0 + 4) % 8]})`,
    s.moon === 4 && s.moonRoute === (routed0 + 4) % 8 && routeDest(routed0, pre.moon, 8) !== (routed0 + 4) % 8, JSON.stringify({ preMoon: pre.moon, preRoute: pre.moonRoute, postMoon: s.moon, postRoute: s.moonRoute }))
await page.keyboard.press(String(((routed0 + 1) % 8) + 1))
await sleep(160)
s = await st()
r.check(`yesterday's road is now refused at gate ${ROMAN[routed0]}`, !s.warping && s.gate === routed0 && /refuseth/.test(s.toastMsg), JSON.stringify(s))
await page.keyboard.press(String(((routed0 + 4) % 8) + 1))
await sleep(1100)
s = await st()
r.check(`the full moon carries gate ${ROMAN[routed0]} its diameter (lands gate ${ROMAN[(routed0 + 4) % 8]})`,
    s.x === s.gates[(routed0 + 4) % 8][0] && s.y === s.gates[(routed0 + 4) % 8][1], JSON.stringify({ x: s.x, y: s.y, want: s.gates[(routed0 + 4) % 8] }))

// restart path stays clean
await page.evaluate(() => window.__game.reset(7))
await sleep(250)
const rs = await page.evaluate(() => {
    const s = window.__britanniaTest.state()
    return s.ready && s.seed === 7 && s.tick < 200
})
r.check('reset(7) returns a fresh world at seed 7', rs)
r.check('zero page errors across the whole drive', errs.length === 0, errs.join(' | '))

await r.exit(browser)
