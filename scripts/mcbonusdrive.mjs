// mcbonusdrive (#3753) — real Chrome, real page: the arcade's bonus city on
// the live board. missilecmdcheck owns the rule table; this proves the shell
// half: the bank earns through the real credit path, the redraw lands at the
// break with its cyan rise-in visible on the canvas, a full board banks
// without drawing over a living city, an unbanked hole stays a hole — and the
// whole story costs zero page errors. mcbatterydrive convention.
// Order matters: unbanked FIRST (fresh bank), then earn-and-redraw, then the
// full-board bank — so each case starts from a known ledger.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcbonusdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=3753`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = () => page.evaluate(() => window.__mcTest.probe())
// the wave break is 180 world ticks (~3 s) — the lift only bites while a
// wave is PLAYING, so settle any running break first, then clear and catch
// the clear tick itself (the redraw and its rise-in fx live at break start).
const settle = async () => {
    for (let i = 0; i < 80; i++) {
        if ((await probe()).state !== 'waveEnd') return
        await sleep(100)
    }
}
const clearWave = async () => {
    await settle()
    const w = (await probe()).wave
    await page.evaluate(() => window.__mcTest.endWave())
    for (let i = 0; i < 80; i++) {
        await sleep(100)
        const p = await probe()
        if (p.wave > w) return p
    }
    return probe()
}
// cyan pixels around a game-space point — the rise-in ring is #00e5ff; scan
// the buffer directly (this game's canvas is 2D, getImageData is honest).
const cyanNear = (gx, gy, r = 34) => page.evaluate(({ gx, gy, r }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const cx = Math.round((transX + gx * scale) * dpr)
    const cy = Math.round((transY + gy * scale) * dpr)
    const rr = Math.round(r * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(Math.max(0, cx - rr), Math.max(0, cy - rr), rr * 2, rr * 2).data
    let n = 0
    for (let i = 0; i < img.length; i += 4) {
        if (img[i] < 120 && img[i + 1] > 170 && img[i + 2] > 170) n++
    }
    return n
}, { gx, gy, r })
const endWave = async () => { await page.evaluate(() => window.__mcTest.endWave()); await sleep(400) }

await page.keyboard.press('Space')
await sleep(350)
{
    const a = await probe()
    rep.check('raid is live at wave 1, bank empty', a.wave === 1 && a.cities === 6 && a.reviveBank === 0, `w${a.wave} c${a.cities} bank ${a.reviveBank}`)
}

// ---- unbanked first: a break never refills what was never earned ----
{
    const holes = await page.evaluate(() => window.__mcTest.hole())
    const p = await clearWave()
    rep.check('an unbanked break never redraws (the hole stays)',
        p.wave === 2 && p.cities === holes && p.reviveFx === 0 && p.reviveBank === 0,
        `w${p.wave} c${p.cities} fx ${p.reviveFx} bank ${p.reviveBank}`)
}

// ---- earn through the REAL credit path; redraw lands at the next break ----
{
    const bank = await page.evaluate(() => window.__mcTest.score10k())
    rep.check('the 10k credit banks one redraw', bank === 1, `bank ${bank}`)
    const p = await clearWave() // the break starts the same tick the sky clears; the draw rides nextWave
    rep.check('the wave break spent the bank and refilled the board',
        p.wave === 3 && p.cities === 6 && p.reviveBank === 0,
        `w${p.wave} c${p.cities} bank ${p.reviveBank}`)
    rep.check('the rise-in tell is live on the shell', p.reviveFx > 0, `fx ${p.reviveFx}`)
    // cyan ring on the town line — WHICH city is cityRand's pick, so scan
    // all six anchors and demand at least one bright.
    const xs = [120, 200, 280, 520, 600, 680]
    const lit = []
    for (const x of xs) {
        const n = await cyanNear(x, 538)
        if (n > 8) lit.push(x)
    }
    rep.check('the rebuild ring paints cyan on the board (city rising)', lit.length >= 1, `cyan anchors ${JSON.stringify(lit)}`)
}

// ---- full board banks: earn again with six alive — nothing draws over them ----
{
    const bank = await page.evaluate(() => window.__mcTest.score10k())
    rep.check('a second crossing banks once more', bank === 1, `bank ${bank}`)
    const p = await clearWave()
    rep.check('six cities standing: nothing redrawn, the credit waits',
        p.cities === 6 && p.reviveBank === 1 && p.reviveFx === 0,
        `c${p.cities} bank ${p.reviveBank} fx ${p.reviveFx}`)
}

rep.check('zero page errors through the whole bonus-city story', errors === 0, `${errors}`)

rep.exit(browser)
