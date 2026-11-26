// landerplay — advisory browser driver (step 6: start, play, crash, restart
// with real keys and zero page errors; the drawn frame tracks the sim).
// Needs `npm run dev` running (or LANDER_URL pointed at one).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.LANDER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/lunar-lander`
const r = new Report('landerplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__landerTest', start: false, viewport: { width: 820, height: 700 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__landerTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const h1 = await page.evaluate(() => window.__landerTest.hash())
await page.waitForTimeout(700)
const h2 = await page.evaluate(() => window.__landerTest.hash())
r.check('attract demo is alive', h1 !== h2)

// the canvas actually paints the moon (not a black frame)
const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lunar-lander-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++
    return lit
})
r.check('the vector scene is painted', painted > 400, `${painted} lit pixels`)

// real key starts the run
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
p0 = await probe()
r.check('press any key starts the descent', p0.screen === 'play' && p0.phase === 'descent', `${p0.screen}/${p0.phase}`)

// #3572 — CRT phosphor dressing proven from a live frame (visual law, no sim):
// the scanline veil must modulate rows, and the vignette must darken the sky
// corners against the centre. Fail-capable: delete the veil/vignette fills from
// the renderer and these flip red.
const crt = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lunar-lander-stage]')
    const g = c.getContext('2d')
    const w = c.width, h = c.height
    const d = g.getImageData(0, 0, w, h).data
    const lum = (x, y) => { const i = (y * w + x) << 2; return d[i] + d[i + 1] + d[i + 2] }
    let dark = 0, dn = 0, lit = 0, ln = 0
    for (let y = 1; y < h - 1; y++) for (let x = 4; x < w - 4; x++) {
        if (y % 3 === 0) { dark += lum(x, y); dn++ } else { lit += lum(x, y); ln++ }
    }
    const veil = (dark / dn) / (lit / ln)
    let corner = 0, cn = 0, centre = 0, mn = 0
    const xw = Math.floor(w * 0.20), yh = Math.floor(h * 0.28)
    for (let y = 4; y < yh; y++) for (let x = 4; x < xw; x++) { corner += lum(x, y) + lum(w - 1 - x, y); cn += 2 }
    for (let y = Math.floor(h * 0.30); y < Math.floor(h * 0.70); y++)
        for (let x = Math.floor(w * 0.42); x < Math.floor(w * 0.58); x++) { centre += lum(x, y); mn++ }
    return { veil, vig: (corner / cn) / Math.max(1e-6, centre / mn) }
})
r.check('CRT scanline veil rides the frame', crt.veil <= 0.92, `dark/lit row ratio ${crt.veil.toFixed(3)}`)
r.check('CRT vignette dims the sky corners', crt.vig <= 0.88, `corner/centre sky luminance ${crt.vig.toFixed(3)}`)

// thrust: the stick lights the engine and the sim responds
await page.keyboard.down('Space')
await page.waitForTimeout(600)
const afterThrust = await probe()
await page.keyboard.up('Space')
r.check('SPACE burns fuel and arrests the fall', afterThrust.fuel < 240 && afterThrust.vy > -8, `fuel ${afterThrust.fuel} vy ${afterThrust.vy}`)

// rotation tracks the stick both ways
const r0 = await probe()
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowLeft')
const r1 = await probe()
r.check('the stick rotates the lander', r1.rot < r0.rot - 0.05, `${r0.rot} -> ${r1.rot}`)
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowRight')
const r2 = await probe()
r.check('and back the other way', r2.rot > r1.rot + 0.05, `${r1.rot} -> ${r2.rot}`)

// zoom toggles on X
await page.keyboard.press('KeyX')
await page.waitForTimeout(120)
const z1 = await probe()
r.check('X zooms the view', z1.zoom === true)
await page.keyboard.press('KeyX')

// free fall: do nothing and gravity delivers a crash; landers must drop
const l0 = await probe()
for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(5200)
    const p = await probe()
    if (i === 0) r.check('gravity eventually crashes the idle lander', p.crashes > l0.crashes || p.end === 'over', `crashes ${p.crashes} end ${p.end}`)
    if (p.end === 'over') break
}
const over = await probe()
r.check('four crashes ends the run', over.end === 'over' || over.landers < 4, `end ${over.end} landers ${over.landers}`)

// restart loop keeps breathing
if (over.end === 'over') {
    await page.waitForTimeout(1100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const back = await probe()
    r.check('the over screen restarts', back.screen === 'play' || back.screen === 'attract', back.screen)
}

// HUD mirrors the sim
const hudAlt = await page.evaluate(() => document.body.innerText.match(/ALT\s+(\d+)/)?.[1])
const simAlt = (await probe()).alt
r.check('the ALT readout mirrors the sim', hudAlt === String(simAlt), `hud ${hudAlt} sim ${simAlt}`)

// ---- leg #3571: pad latch — the pad answers while the feet span it ----
// Park the lander straight and level, 24u over the widest pad. span mirrors
// the sim's padSpan law; the tag pixels carry the visual half. STEP=8 is
// terrain.js's world step. Off-span parks a full pad half-width + 24 clear.
let parkVal = 20
// value tags paint only zoomed-in (cam.s > 0.7): put the view in that state.
const ensureZoom = () => page.evaluate(() => {
    const T = window.__landerTest
    if (!T.probe().zoom) T.zoom()
})
const park = (on) => page.evaluate((keep) => {
    const T = window.__landerTest
    const g = T.state()
    const pad = g.terrain.pads.reduce((b, p) => (!b || (p.i1 - p.i0) > (b.i1 - b.i0) ? p : b), null)
    const dx = keep ? 0 : (pad.i1 - pad.i0) * 8 / 2 + 24 // STEP=8, clear of the span
    g.x = pad.cx + dx
    g.y = pad.y + 24; g.vx = 0; g.vy = 0; g.rot = 0
    return pad.val
}, on)
const tagLum = () => page.evaluate((val) => {
    const T = window.__landerTest
    const c = document.querySelector('canvas[data-lunar-lander-stage]')
    const g2 = c.getContext('2d')
    // canvas backing is a fixed W×H buffer (canvas.width = W): padPix already
    // lands in backing px — no CSS scale.
    const pix = T.padPix()
    const p = pix.find((q) => q.val === val) || pix[0]
    const img = g2.getImageData(0, 0, c.width, c.height).data
    const cxp = Math.round(p.cx), yp = Math.round(p.y)
    let mx = 0
    for (let x = cxp - 7; x <= cxp + 7; x++) {
        for (let y = yp - 12; y <= yp - 2; y++) {
            const i = (y * c.width + x) * 4
            if (i < 0 || i + 2 >= img.length) continue
            const v = img[i] + img[i + 1] + img[i + 2]
            if (v > mx) mx = v
        }
    }
    return { mx, span: T.span() }
}, parkVal)
parkVal = await park(true); await ensureZoom(); await page.waitForTimeout(140)
const j1 = await tagLum()
r.check('feet spanning a pad latch the span', j1.span === parkVal, `span ${j1.span}, pad ${parkVal}`)
r.check('the latched tag burns hot (>640)', j1.mx >= 640, `tag max ${j1.mx}`)
const seq = []
for (let i = 0; i < 14; i++) { await park(true); await page.waitForTimeout(60); seq.push((await tagLum()).mx) }
r.check('the tag pulses while latched (two cabinet levels)',
    Math.max(...seq) - Math.min(...seq) >= 20 && Math.min(...seq) >= 600, seq.join(','))
parkVal = 20
await park(false); await page.waitForTimeout(140)
const j0 = await tagLum()
r.check('off-span the span clears', j0.span === null, `span ${j0.span}`)
r.check('an idle pad sits dark (<600)', j0.mx < 600, `tag max ${j0.mx}`)

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await r.exit(browser)
