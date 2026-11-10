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
import { plotShrines } from '../src/games/Britannia/shrines.js'
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
r.check('the arrival toast names the destination as a shrine, keeper included (#1876)',
    /whirls thee to the shrine of \w+, where \w+ standeth of old\./.test(s.toastMsg), s.toastMsg)

// #1829 item 6: britanniacheck pins the moonlit disc by REGEX on the draw
// call — the pixels themselves were never verified. Same gate, same real
// keys, now the painted pixels: the silver disc sits beside the routed row
// and beside NO other row, the caption ink is present, and the header phase
// disc's silver matches tonight's lit fraction. Geometry straight from
// index.jsx (GM = {w:480, rowTop:62, pitch:36, foot:64}; canvas 1280x720):
// box bx=400 by=171 bh=378, row i (gate skipped) at by+62+(i<gi?i:i-1)*36,
// the row disc at (bx+18, row+17) r3.5, caption baseline by+bh-58.
const GMW = 520, GMROW = 62, GMPITCH = 36, GMFOOT = 64
const GW = 1280, GH = 720
const gbh = GMROW + 7 * GMPITCH + GMFOOT
const gbx = GW / 2 - GMW / 2, gby = GH / 2 - gbh / 2
const rowY = (i, gi) => gby + GMROW + ((i < gi) ? i : i - 1) * GMPITCH
const SILVER = [232, 226, 200]   // #e8e2c8 — moonlit disc + row text + phase disc
const FOG = [159, 180, 216]      // #9fb4d8 — unmarked row text
const CAPTION = [200, 216, 168]  // #c8d8a8 — "tonight's moon routeth hence to …"
const inkIn = async (x, y, w, h, rgb, tol) => page.evaluate((a) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(a.x, a.y, a.w, a.h).data
    let n = 0
    for (let i = 0; i < d.length; i += 4)
        if (Math.abs(d[i] - a.r) <= a.t && Math.abs(d[i + 1] - a.g) <= a.t && Math.abs(d[i + 2] - a.b) <= a.t) n++
    return n
}, { x, y, w, h, r: rgb[0], g: rgb[1], b: rgb[2], t: tol })
// gate III (161,21) — checked: land 4 ways AND two deep south, so the
// stickiness walk below never boards a ship
const gi = 2
await page.evaluate((a) => { window.__game.reset(a.sd); window.__britanniaTest.teleport(a.gi) }, { sd: seed0, gi })
await page.evaluate((t) => window.__britanniaTest.setTime(t), DAY_TICKS * 4 + 100)
await sleep(140)
r.check('gate III menu whirls at full moon (wheel +4 -> the routed road is VII)',
    (await openMenuOn(gi)) && (await st()).moonRoute === 6, JSON.stringify(await st()))
{
    const routed = 6
    const on = await inkIn(gbx + 12, rowY(routed, gi) + 11, 13, 13, SILVER, 40)
    r.check('full moon: the silver disc is PAINTED beside the routed row (VII)', on >= 10, `disc ink ${on}px`)
    const off = []
    for (const i of [0, 1, 3, 4, 5, 7]) off.push(await inkIn(gbx + 12, rowY(i, gi) + 11, 13, 13, SILVER, 40))
    r.check('full moon: NO other row wears the moonlit disc', off.every((n) => n === 0), JSON.stringify(off))
    const cap = await inkIn(gbx + 28, gby + gbh - 64, 400, 20, CAPTION, 40)
    r.check('full moon: the route caption ink is painted ("…hence to VII of Sacrifice")', cap >= 100, `caption ink ${cap}px`)
    const routText = await inkIn(gbx + 28, rowY(routed, gi) + 8, 300, 22, SILVER, 30)
    r.check('full moon: the routed row text wears moonlit silver, not fog blue', routText >= 80, `${routText}px`)
    const fogText = await inkIn(gbx + 28, rowY(3, gi) + 8, 300, 22, FOG, 30)
    r.check('full moon: an unmarked row (IV) stays fog blue', fogText >= 80, `${fogText}px`)
    const hd = await inkIn(gbx + GMW - 40, gby + 19, 21, 21, SILVER, 40)
    r.check('full moon: the header phase disc is fully silver (lit fraction 1)', hd >= 60, `${hd}px`)
    await page.screenshot({ path: '/tmp/forge/britannia-moonmenu.png' })
}
// new moon on the SAME open menu: the road must live-flip, the disc must
// re-seat beside the new routed row and vacate the old one, and the header
// disc must go dark (lit fraction 0)
await page.evaluate((t) => window.__britanniaTest.setTime(t), 100)
await sleep(140)
let s2 = await st()
r.check('new moon: the open menu live-flips the road (VII -> IV, wheel +1)',
    s2.gate === gi && s2.moon === 0 && s2.moonRoute === 3, JSON.stringify(s2))
{
    const on = await inkIn(gbx + 12, rowY(3, gi) + 11, 13, 13, SILVER, 40)
    r.check('new moon: the silver disc re-seats beside the new routed row (IV)', on >= 10, `disc ink ${on}px`)
    const off = []
    for (const i of [0, 1, 4, 5, 6, 7]) off.push(await inkIn(gbx + 12, rowY(i, gi) + 11, 13, 13, SILVER, 40))
    r.check('new moon: the OLD routed row (VII) wears no disc anymore', off.every((n) => n === 0), JSON.stringify(off))
    const hd = await inkIn(gbx + GMW - 40, gby + 19, 21, 21, SILVER, 40)
    r.check('new moon: the header phase disc is dark (lit fraction 0)', hd === 0, `${hd}px`)
}
// #1829 item 7 look: at new moon the wheel is +1, so walking OFF a gate and
// back re-opens the menu beside the same destination. It must read
// intentional (the moon is unchanged), not sticky (a frozen menu): the
// cancel must hold, walking away must clear it, and the re-opened menu must
// seat fresh AND follow the wheel when the day turns. Re-seat the Avatar
// exactly on the gate tile first — openMenuOn's opener step leaves him one
// tile south of it, and the walk-off is measured from the gate itself.
// (#1876: the walk-off goes NORTH now — gate III's shrine stands two tiles
// south at (161,23), and the chapel is stone.)
await page.evaluate((i) => window.__britanniaTest.teleport(i), gi)
await sleep(120)
s2 = await st()
r.check('back on the gate tile the menu still shows the new-moon road (IV)',
    s2.gate === gi && s2.moonRoute === 3 && s2.x === 161 && s2.y === 21, JSON.stringify(s2))
await page.keyboard.press('KeyZ')
await sleep(160)
s2 = await st()
r.check('new moon: Z cancels and the gate stays cancelled beside the avatar', s2.gate === -1 && s2.moonRoute === -1, JSON.stringify(s2))
await page.keyboard.press('ArrowUp')
await sleep(240)
s2 = await st()
r.check('the first step off stays cancelled (the dismissal holds one tile)', s2.gate === -1 && s2.y === 20, JSON.stringify(s2))
await page.keyboard.press('ArrowUp')
await sleep(240)
s2 = await st()
r.check('two steps off, the dismissal clears (no menu, no ghost)', s2.gate === -1 && s2.y === 19, JSON.stringify(s2))
await page.keyboard.press('ArrowDown')
await sleep(240)
s2 = await st()
r.check('walking back re-opens the menu FRESH beside the same new-moon road (IV) — intentional, not sticky',
    s2.gate === gi && s2.moonRoute === 3 && s2.hoverRow === -1, JSON.stringify(s2))
await page.evaluate((t) => window.__britanniaTest.setTime(t), DAY_TICKS + 100)
await sleep(140)
s2 = await st()
r.check('the re-opened menu is live: the day turns (new -> waxing crescent, +3) and the road follows (IV -> VI)',
    s2.gate === gi && s2.moon === 1 && s2.moonRoute === 5, JSON.stringify(s2))

// #1876 shrines: panel == node parity, and the chapel stone is REAL. Gate VI
// (231,235, the dungeon star) plots its chapel due west at (229,235) — the one
// cardinal its POI ring leaves; walking west onto the sanctum must be refused.
await page.evaluate((sd) => { window.__game.reset(sd); window.__britanniaTest.teleport(6) }, seed0)
await sleep(150)
const sPar = await st()
const wantSpots = plotShrines(sPar.gates.map(([x, y]) => ({ x, y })), (x, y) => world.get(x, y)).map(sv => (sv ? [sv.x, sv.y] : null))
r.check('panel shrines match the Node sweep plot-for-plot (same eight tiles, same order)',
    JSON.stringify(sPar.shrines) === JSON.stringify(wantSpots), JSON.stringify({ got: sPar.shrines, want: wantSpots }))
await page.keyboard.press('ArrowLeft')
await sleep(240)
let sS = await st()
r.check('gate VI: one step west stands beside the moongate (menu whirls open)', sS.x === 230 && sS.gate === 6, JSON.stringify({ x: sS.x, y: sS.y, gate: sS.gate }))
await page.keyboard.press('KeyZ')
await sleep(160)
await page.keyboard.press('ArrowLeft')
await sleep(240)
sS = await st()
r.check('the chapel is stone: the west step onto the sanctum is refused (x stays 230)', sS.x === 230 && sS.y === 235, JSON.stringify({ x: sS.x, y: sS.y }))
r.check('the refusal names the shrine and counts the touch', /is stone — about face/.test(sS.toastMsg) && sS.bumped >= 1, JSON.stringify({ toast: sS.toastMsg, bumped: sS.bumped }))
await page.screenshot({ path: '/tmp/forge/britannia-shrine.png' })

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
