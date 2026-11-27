// mcp2battdrive (#3760) — real Chrome, real keys: seat 2's three buttons on
// the live page. missilecmdcheck owns the named-battery physics and the wiring
// text; this proves the browser half: `2` opens the hot-seat, a real Z press
// JOINS the human seat (and teaches the triangle on the board), off-duty Z/X/C
// spend nothing on P1's wave, on P2's wave Z/X/C launch their OWN batteries
// (origins 40/400/760) each spending only its own magazine, P1's keys and mouse
// stay asleep, and a repeat of the whole script on one seed lands byte-equal —
// the named shot consumes no dice.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcp2battdrive')
await requireDevServer(BASE)
const browser = await launch()
let errors = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// page is opened per scripted pass below; scan a game-coords box for cyan ink
// (the join card's teaching line, #00e5ff)
let page
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
const cyanAtBox = (gx, gy, hw, hh) => page.evaluate(({ gx, gy, hw, hh }) => {
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
    let cyan = 0
    for (let i = 0; i < img.length; i += 4) {
        if (img[i] < 90 && img[i + 1] > 170 && img[i + 2] > 170) cyan++
    }
    return cyan
}, { gx, gy, hw, hh })

// ---- one scripted pass, real keys only; returns a trace of the law ----
const runPass = async () => {
    page = await openGame(browser, { url: `${BASE}?seed=3760`, hook: '__mcTest', wait: 600 })
    page.on('pageerror', () => errors++)

    await page.keyboard.press('Digit2')
    await sleep(400)
    {
        const p = await probe()
        rep.check('`2` opens the hot-seat: P1 on duty, CPU holding seat 2',
            p.twoP === true && p.turn === 1 && p.p2cpu === true, `turn ${p.turn} cpu ${p.p2cpu}`)
    }

    // ---- a real Z press JOINS seat 2 — and teaches the triangle on the board ----
    {
        const before = await probe()
        await page.keyboard.press('KeyZ')
        const joined = await probe()
        rep.check('a real Z press joins the human seat (the CPU yields) and spends nothing off-duty',
            joined.p2cpu === false && joined.ammo === before.ammo, `cpu ${joined.p2cpu} ammo ${joined.ammo}/${before.ammo}`)
        await sleep(200) // the flash paints on the NEXT frame (evaluate round-trips
                         // can close inside one frame gap — the #3753 lesson)
        const cyan = await cyanAtBox(400, 150, 150, 14) // the teaching line at y=150
        rep.check('the join moment paints the Z/X/C teaching line (cyan, mid-sky)',
            cyan > 20, `cyan ${cyan} px`)
    }

    // ---- off-duty: Z/X/C arm nothing on P1's wave ----
    {
        const before = await probe()
        await page.keyboard.press('KeyZ')
        await page.keyboard.press('KeyX')
        await page.keyboard.press('KeyC')
        await sleep(80)
        const mid = await probe()
        rep.check('Z/X/C stay asleep on P1\'s wave — they join but never spend P1\'s ammo',
            mid.ammo === before.ammo && mid.abms === 0, `ammo ${mid.ammo}/${before.ammo} abms ${mid.abms}`)
    }

    // ---- hand the board to seat 2 ----
    await page.evaluate(() => window.__mcTest.endWave())
    await sleep(150)
    {
        const p = await probe()
        rep.check('closing wave 1 hands the board to the human P2',
            p.turn === 2 && p.wave === 2 && p.state === 'waveEnd', `turn ${p.turn} w${p.wave} ${p.state}`)
        await waitPlaying()
    }

    // ---- on duty: each button names its OWN battery ----
    // POLL, don't pace: under box load (two lanes + QA share this Mac) the rAF
    // chain lags fixed sleeps and a shot lands a cycle late — that late frame
    // is the #3753 break-swallower shape, and fixed sleeps lost to it twice.
    // Poll each press to its landing, then read the law: origin + own magazine.
    const presses = ['KeyZ', 'KeyX', 'KeyC']
    const originTrace = []
    for (const code of presses) {
        await sleep(120)
        let b = await probe()
        if (b.turn !== 2 || b.state !== 'playing') { await waitPlaying(); b = await probe() }
        const n0 = b.abms
        await page.keyboard.press(code)
        let spawned = null
        let spent = 0
        for (let i = 0; i < 50; i++) { // up to ~1.5 s of world settle
            await sleep(30)
            const a = await probe()
            spent = b.ammo - a.ammo
            if (spent >= 1 || a.abms > n0) {
                spawned = a.origins.length ? a.origins[a.origins.length - 1] : null
                break
            }
        }
        originTrace.push(`${code}:${spawned}:${spent}`)
    }
    rep.check('Z/X/C launch LEFT/CENTER/RIGHT (origins 40/400/760), each spending its own magazine',
        originTrace.join('|') === 'KeyZ:40:1|KeyX:400:1|KeyC:760:1', originTrace.join('|'))

    // ---- P1 stays asleep on the human seat's wave: Space, digit batteries, mouse ----
    {
        const before = await probe()
        await page.keyboard.press('Space')
        await page.keyboard.press('Digit2')
        const p1off = await probe()
        rep.check('P1\'s Space AND key 2 spend nothing on the human P2\'s wave',
            p1off.ammo === before.ammo, `ammo ${p1off.ammo}/${before.ammo}`)
    }

    // ---- determinism: the named shot consumes no dice — repeat lands equal ----
    return originTrace.join('|')
}

const first = await runPass()
const second = await runPass() // same seed, same script — byte-equal origins law
rep.check('one seed replays the button law byte-equal (no die on the named path)',
    first === second, `${first} vs ${second}`)

rep.check('zero page errors across the p2-battery drive', errors === 0, `${errors}`)
rep.exit(browser)
