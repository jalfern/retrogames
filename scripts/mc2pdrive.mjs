// mc2pdrive (#3630 slice 2) — real Chrome, real keys: the hot-seat on the
// live page. missilecmdcheck owns the seat law; this proves the browser half:
// `2` opens the mode, the HUD shows both books as ink, P1's real mouse fires
// on P1's wave, the board hands over after wave 1, off-duty P1 inputs spend
// nothing while P2's own key (F) does, the CPU seat defends the shared board
// untouched, arrows aim the crosshair for the pad, and a real W press joins a
// human P2 who then fires on wave 4 while Space stays asleep.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mc2pdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=2204`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = () => page.evaluate(() => window.__mcTest.probe())
const waitPlaying = async (maxMs = 6000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < maxMs) {
        const p = await probe()
        if (p.state === 'playing') return p
        await sleep(100)
    }
    return probe()
}

// scan a game-coords box for HUD ink (any non-black pixel)
const inkAt = (gx, gy, hw, hh) => page.evaluate(({ gx, gy, hw, hh }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const rx = Math.round(hw * scale * dpr)
    const ry = Math.round(hh * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - rx, py - ry, rx * 2, ry * 2).data
    let ink = 0
    for (let i = 0; i < img.length; i += 4) {
        if (img[i] > 90 || img[i + 1] > 90 || img[i + 2] > 90) ink++
    }
    return ink
}, { gx, gy, hw, hh })

const clientOf = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + transX + gx * scale, y: rect.top + transY + gy * scale }
}, { gx, gy })

// ---- the mode key ----
await page.keyboard.press('Digit2')
await sleep(400)
{
    const a = await probe()
    rep.check('`2` opens the hot-seat: live run, P1 on duty, CPU holding seat 2',
        a.twoP === true && a.turn === 1 && a.p2cpu === true && a.wave === 1 && a.cities === 6,
        `twoP ${a.twoP} turn ${a.turn} cpu ${a.p2cpu} w${a.wave}`)
    const left = await inkAt(30, 62, 70, 20)
    const right = await inkAt(770, 62, 70, 20)
    rep.check('both score blocks are on the HUD from wave 1 (manual §6: both scores display)',
        left > 10 && right > 10, `L ${left} R ${right} px`)
}

// ---- P1 fires for real on P1's wave ----
{
    const before = await probe()
    const pt = await clientOf(400, 300)
    await page.mouse.move(pt.x, pt.y)
    await page.mouse.down(); await page.mouse.up()
    await sleep(80)
    const after = await probe()
    rep.check('a real P1 click spends ammo and flies an ABM on wave 1',
        after.ammo === before.ammo - 1 && after.abms > 0, `${before.ammo}→${after.ammo}, abms ${after.abms}`)
}

// ---- hand-off after wave 1 ----
await page.evaluate(() => window.__mcTest.endWave())
await sleep(150) // let the clear tick land before reading the flip
{
    let p = await probe()
    rep.check('closing wave 1 hands the board to P2',
        p.turn === 2 && p.wave === 2 && p.state === 'waveEnd',
        `turn ${p.turn} w${p.wave} ${p.state}`)
    p = await waitPlaying()
    rep.check('P2\'s wave resumes after the sim-clock break',
        p.state === 'playing' && p.turn === 2 && p.wave === 2, `${p.state} turn ${p.turn} w${p.wave}`)
}

// ---- off-duty guard + P2's own fire key (CPU disarmed for the test) ----
await page.evaluate(() => window.__mcTest.p2cpu(false))
{
    const before = await probe()
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    const pt = await clientOf(500, 250)
    await page.mouse.move(pt.x, pt.y)
    await page.mouse.down(); await page.mouse.up()
    await sleep(80)
    const mid = await probe()
    rep.check('off-duty P1 inputs spend nothing on P2\'s wave (keys and mouse)',
        mid.ammo === before.ammo && mid.abms === 0, `ammo ${mid.ammo}/${before.ammo} abms ${mid.abms}`)
    await page.keyboard.press('KeyF')
    await sleep(80)
    const fired = await probe()
    rep.check('P2\'s own key (F) flies a shot on P2\'s wave',
        fired.ammo === before.ammo - 1 && fired.abms > 0, `ammo ${fired.ammo} abms ${fired.abms}`)
}
await page.evaluate(() => window.__mcTest.p2cpu(true))

// ---- the CPU seat defends the shared board ----
let cpuHeld = false
for (let i = 0; i < 300; i++) { // wave 2 runs ~25 s of world time end to end
    await sleep(150)
    const p = await probe()
    if (p.wave >= 3 || p.done) { cpuHeld = p.cities === 6 && !p.done; break }
}
{
    const p = await probe()
    rep.check('the CPU seat holds the shared board through wave 2 and books P2 the bonus',
        cpuHeld && p.turn === 1 && p.p2 > 0, `w${p.wave} c${p.cities} turn ${p.turn} p2 ${p.p2}`)
}

// ---- P1 regains the board + pad arrows aim ----
{
    const p = await waitPlaying(6000)
    rep.check('after P2\'s wave the board hands back to P1', p.turn === 1 && p.wave === 3,
        `turn ${p.turn} w${p.wave}`)
    const x0 = (await probe()).crosshair[0]
    await page.keyboard.down('ArrowRight')
    await sleep(400)
    await page.keyboard.up('ArrowRight')
    const x1 = (await probe()).crosshair[0]
    rep.check('pad/arrow aim moves the crosshair (the stick finally has a load)',
        x1 > x0 + 30, `${x0}→${x1}`)
}

// ---- a human joins mid-run and takes seat 2 for real ----
await page.keyboard.press('KeyW')
{
    const p = await probe()
    rep.check('a real W press joins a human P2 — the CPU yields the seat',
        p.twoP === true && p.p2cpu === false, `p2cpu ${p.p2cpu}`)
}
await page.evaluate(() => window.__mcTest.endWave())
await sleep(150)
{
    let p = await probe()
    rep.check('wave 3 hands over to the human P2', p.turn === 2 && p.wave === 4, `turn ${p.turn} w${p.wave}`)
    p = await waitPlaying()
    const before = await probe()
    await page.keyboard.press('Space')
    await sleep(60)
    const asleep = await probe()
    rep.check('P1\'s Space still sleeps on the human P2\'s wave',
        asleep.ammo === before.ammo, `ammo ${asleep.ammo}/${before.ammo}`)
    await page.keyboard.press('KeyF')
    await sleep(80)
    const fired = await probe()
    rep.check('the joined human fires P2\'s wave with F',
        fired.ammo === before.ammo - 1 && fired.abms > 0, `ammo ${fired.ammo} abms ${fired.abms}`)
}

rep.check('zero page errors across the hot-seat drive', errors === 0, `${errors}`)
rep.exit(browser)
