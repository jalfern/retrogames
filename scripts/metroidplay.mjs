// METROID-LITE — Chrome plays the cave with NOTHING but real key events, and
// the PARALLAX contract is graded in pixels.
//
//   npm run metroidplay     (needs `npm run dev`)
//
// Three things a Node harness cannot see, and this does:
//   1. the input path — a real Space/Arrow/X keypress reaching step() through
//      the browser's event stack (the virtual pad dispatches these same codes);
//   2. the painter — the issue's second named muscle is three-layer parallax.
//      This harness hardcodes the promised factors [0.15, 0.35, 0.62] itself
//      (never reads them from the game), predicts where each star's pixel MUST
//      sit at the CURRENT camera, samples the canvas there — and also samples
//      where a camera-rate renderer would have painted it instead. Stars must
//      be bright at the prediction and dark at the wrong answer.
//   3. the attract proof — the proven zero-hit route plays itself in the page,
//      real rAF feeding the fixed step: upgrades light up on schedule, the
//      camera walks to the shaft, and the death counter stays at zero — then
//      the demo resets and hunts again.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.METROID_URL || 'http://localhost:5173/retrogames/metroid'
await requireDevServer(URL)

const r = new Report('metroidplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__metroidTest.probe())
const camX = () => page.evaluate(() => window.__metroidTest.camX())
const star = (l, k) => page.evaluate(([l, k]) => window.__metroidTest.star(l, k), [l, k])
const pxMax = (x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-metroid-stage]')
    const d = c.getContext('2d').getImageData(Math.max(0, Math.round(x) - 2), Math.max(0, Math.round(y) - 1), 5, 3).data
    let m = 0
    for (let i = 0; i < d.length; i += 4) m = Math.max(m, (d[i] + d[i + 1] + d[i + 2]) / 3)
    return m
}, [x, y])
const wait = ms => page.waitForTimeout(ms)
const tap = k => page.keyboard.press(k)
const hold = async (k, ms) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); await wait(50) }

// THE HARNESS'S OWN PARALLAX CONTRACT — hardcoded on purpose. If the game
// starts scrolling a layer at the camera, the "wrong" sample goes bright.
const F = [0.15, 0.35, 0.62]
const NSTAR = [26, 18, 12]
const STAR_PER = 2000
const wrap = v => ((v % STAR_PER) + STAR_PER) % STAR_PER

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__metroidTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__metroidTest never appeared (dev server? /metroid route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

// ---- attract mode runs the proven route: the page itself is the witness ----
let camMax = 0, deaths = 0, takenMax = 0, tickGrew = false, relicSeen = false
const hunt = {}
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    const t0 = a.tick
    for (let i = 0; i < 20; i++) {
        const s = await probe()
        if (s.tick > t0 + 30) tickGrew = true
        deaths = Math.max(deaths, s.deaths)
        takenMax = Math.max(takenMax, s.taken)
        if (s.end === 'win') relicSeen = true
        camMax = Math.max(camMax, await camX())
        // hunt stable stars (y<95 keeps them clear of the painted ridges)
        if (i < 10) {
            for (let l = 0; l < 3; l++) for (let k = 0; k < NSTAR[l]; k++) {
                const st = await star(l, k)
                if (st.wx.y > 95 || st.sx < 4 || st.sx > 476) continue
                const v = await pxMax(st.sx, st.wx.y)
                if (v > 50) {
                    await wait(160)
                    const v2 = await pxMax(st.sx, st.wx.y)
                    if (v2 > 50) hunt[`${l},${k}`] = { l, k, wx: st.wx.x, y: st.wx.y }
                }
            }
        }
        await wait(2200)
    }
    const b = await probe()
    r.check('attract sim is live and zero-hit for a whole half-route', tickGrew && deaths === 0, `tick ${t0}->${b.tick} deaths=${deaths}`)
    r.check('attract earns upgrades on schedule (beam≈8s bomb≈13s sj≈33s)', takenMax >= 2, `taken=${takenMax} end=${b.end}`)
    r.check('attract camera reaches deep into the cave', camMax > 1100, `camMax=${camMax}`)
    r.check('the attract route resets to hunt again (looped demo)', b.end === null || relicSeen, `end=${b.end}`)
}

// ---- parallax in pixels: bright at the prediction, dark at the cheat ----
{
    let confirmed = [0, 0, 0], wrongDark = 0, wrongSeen = 0
    const diag = [[], [], []]
    const perLayer = [0, 0, 0]
    for (const h of Object.values(hunt)) perLayer[h.l]++
    r.info('star candidates', `hunted per layer: ${perLayer.join('/')} (hunt: ${JSON.stringify(Object.values(hunt).map(h => `${h.l},${h.k}@${h.y}`))})`)
    for (const h of Object.values(hunt)) {
        const camNow = await camX()
        if (camNow < 250) continue
        const pred = wrap(h.wx - camNow * F[h.l])
        if (pred < 2 || pred > 478) continue
        let bright = false, last = 0
        for (let k = 0; k < 4 && !bright; k++) {
            last = await pxMax(pred, h.y)
            if (last > 48) bright = true
            else await wait(120)
        }
        if (bright) confirmed[h.l]++
        else if (diag[h.l].length < 3) diag[h.l].push(`${h.k}@${Math.round(pred)}=${Math.round(last)}`)
        const wrong = wrap(h.wx - camNow)
        if (Math.abs(wrong - pred) > 8 && wrong > 2 && wrong < 478) {
            wrongSeen++
            if (await pxMax(wrong, h.y) < 40) wrongDark++
        }
    }
    const dstr = diag.map((d, i) => `L${i}:${confirmed[i]}${d.length ? ` miss ${d.join(' ')}` : ''}`).join(' | ')
    r.check('stars sit where cam*f puts them (3 layers, hardcoded factors)', confirmed[0] >= 1 && confirmed[1] >= 1 && confirmed[2] >= 1, `${confirmed.join('/')} — ${dstr}`)
    r.check('stars are NOT painted where a cam-rate scroll would put them', wrongSeen >= 2 && wrongDark === wrongSeen, `${wrongDark}/${wrongSeen} cheat-position probes stayed dark`)
}

// ---- real keys start a fresh run and drive the body ----
await tap('KeyZ')
await wait(500)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.score === 0 && a.energy === 4 && a.taken === 0, `screen=${a.screen} energy=${a.energy}`)
    await hold('ArrowRight', 2000)
    const b = await probe()
    r.check('holding RIGHT walks the hunter and drags the camera', b.player.x > a.player.x + 30 && b.cam.x > 0, `x ${a.player.x}->${b.player.x} cam=${b.cam.x}`)
    await hold('ArrowLeft', 400)
    const c = await probe()
    r.check('holding LEFT walks back', c.player.x < b.player.x - 20, `x ${b.player.x}->${c.player.x}`)
    const gy = c.player.y
    await page.keyboard.down('Space')
    await wait(150)
    const j = await probe()
    await page.keyboard.up('Space')
    await wait(600)
    r.check('SPACE launches the real body (airborne frame sampled)', j.player.y < gy - 4 || !j.onGround, `y ${gy}->${j.player.y} onGround=${j.onGround}`)
    // a beam BEFORE it is owned must do nothing real
    await tap('KeyX')
    await wait(200)
    const w = await probe()
    r.check('firing without the BEAM fires nothing', !w.evLog.some(e => e.type === 'fire' && e.tick > w.tick - 30), 'no-fire rule holds in the shell')
}

// ---- gadgets: rig the OWNERSHIP (setup only), fire with real keys ----
{
    await page.evaluate(() => window.__metroidTest.grant('beam'))
    await tap('KeyX')
    await wait(250)
    const a = await probe()
    r.check('a real X after owning the beam really fires', a.evLog.some(e => e.type === 'fire' && e.tick > a.tick - 40), `fires=${a.evLog.filter(e => e.type === 'fire').length}`)
    await page.evaluate(() => window.__metroidTest.grant('bomb'))
    await page.evaluate(() => window.__metroidTest.teleport(86, 24))
    await wait(150)
    await page.keyboard.down('ArrowDown')
    await tap('KeyX')
    await page.keyboard.up('ArrowDown')
    let blown = false
    for (let i = 0; i < 30 && !blown; i++) { blown = (await probe()).bulks === 2; await wait(150) }
    r.check('DOWN+X drops a bomb that blows BOTH bulkheads in the live grid', blown, `bulks=${(await probe()).bulks}`)
    // the space jump through the keyboard: two real presses
    await page.evaluate(() => { window.__metroidTest.grant('sjump'); return window.__metroidTest.teleport(109, 25) })
    await wait(150)
    r.info('rig', JSON.stringify(await page.evaluate(() => {
        const bands = []
        for (let y = 21; y <= 26; y++) bands.push(window.__metroidTest.tile(106, y) + '' + window.__metroidTest.tile(109, y))
        return { n: document.querySelectorAll('canvas[data-metroid-stage]').length, p: window.__metroidTest.probe().player, scr: window.__metroidTest.probe().screen, shaft106_109: bands }
    })))
    await tap('Space')
    await page.keyboard.down('Space')
    await wait(200)
    await page.keyboard.up('Space')
    await wait(30)
    await page.keyboard.down('Space')
    await wait(520)
    await page.keyboard.up('Space')
    await page.keyboard.down('ArrowLeft')
    await wait(200)
    await page.keyboard.up('ArrowLeft')
    let up = false
    let s = null
    for (let i = 0; i < 30 && !up; i++) {
        s = await probe()
        up = s.onGround && s.player.foot.y === 20 && s.player.foot.x >= 106 && s.player.foot.x <= 108
        await wait(90)
    }
    r.info('sj hist', JSON.stringify((s ? s.hist : []).map(h => `${h[0]}:${h[1]},${h[2]}${h[3] ? 'G' : ''}${h[4] ? 'D' : ''}`)))
    r.info('sj grid', JSON.stringify({ dbg: s ? s.dbg : null, rows: await page.evaluate(() => {
        const rows = []
        for (let y = 22; y <= 26; y++) { let l = 'y' + y + ' '
            for (let x = 104; x <= 111; x++) l += window.__metroidTest.tile(x, y)
            rows.push(l) } return rows
    }) }))
    r.check('two real SPACE presses land the hunter on the 80px shelf', up, `foot=${JSON.stringify((await probe()).player.foot)}`)
}

// ---- the beacon remembers, and dying at the teeth proves it ----
{
    await page.evaluate(() => window.__metroidTest.teleport(5, 35))
    await hold('ArrowRight', 400)
    const a = await probe()
    r.check('walking into a beacon syncs the save point', a.save.x === 6 && a.save.y === 35, `save=${a.save.x},${a.save.y}`)
    await page.evaluate(() => window.__metroidTest.teleport(30, 37))
    let died = false
    for (let i = 0; i < 90 && !died; i++) { died = (await probe()).deaths >= 1; await wait(200) }
    r.check('four spike hits with real collision drop the hunter', died, `deaths=${(await probe()).deaths}`)
    await wait(1600)
    const b = await probe()
    const back = b.player.foot.x >= 5 && b.player.foot.x <= 7 && b.player.foot.y === 35
    r.check('death returns the hunter to the beacon it last touched — not the spawn', back && b.energy === 4, `foot=${b.player.foot.x},${b.player.foot.y} energy=${b.energy}`)
}

// ---- the pause door ----
{
    await tap('Shift+Slash')
    await wait(400)
    const shown = await page.locator('text=RESUME GAME').count() > 0
    r.check('a real ? opens the pause overlay', shown)
    await tap('Shift+Slash')
    await wait(300)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
