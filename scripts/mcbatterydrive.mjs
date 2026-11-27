// mcbatterydrive (#3695) — real Chrome, real keys: the arcade's three-button
// law on the live page. missilecmdcheck owns the rule table and pins the
// registry pad declaration; this proves the shell half: keys 1/2/3 and KeyB
// (what the phone FAST button dispatches) launch THEIR battery from a foreign
// sector and spend exactly that magazine; the mouse keeps the nearest-battery
// law; the fast center rides the gate live; the hot-seat duty guard swallows
// the key on the off-duty seat. mcsaucerdrive/mcsmartdrive convention.
// (The pad-tap itself is VirtualControls' generic machinery — vpadcheck
// certifies the button/code wiring shelf-wide; a touch-emulation context here
// proved too noisy for counting, so the drive presses the dispatched KEY.)
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcbatterydrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=3695`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = () => page.evaluate(() => window.__mcTest.probe())
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

// ---- attract: the FAST button is declared on the pad from the title screen ----
rep.check('the FAST pad button (KeyB) is declared in the registry pad',
    await page.evaluate(() => !!document.querySelector('[data-vc="b"][data-key="KeyB"]')))

// ---- live via click-to-start (existing law, not re-graded) ----
await page.keyboard.press('Space')
await sleep(350)
{
    const a = await probe()
    rep.check('raid is live at wave 1', a.wave === 1 && a.cities === 6 && !a.done, `w${a.wave} c${a.cities}`)
}

// ---- KeyB (the phone FAST button's code): center only, from the default aim ----
{
    const before = await probe()
    await page.keyboard.press('KeyB')
    const p = await probe()
    rep.check('KeyB (what the FAST pad button dispatches) spends the CENTER magazine and only it',
        p.silosAmmo[1] === before.silosAmmo[1] - 1 &&
        p.silosAmmo[0] === before.silosAmmo[0] && p.silosAmmo[2] === before.silosAmmo[2],
        `silos ${JSON.stringify(before.silosAmmo)} → ${JSON.stringify(p.silosAmmo)}`)
}

// ---- desktop keys: each battery answers from a foreign sector ----
{
    const pt = await clientOf(120, 300) // deep in the LEFT sector
    await page.mouse.move(pt.x, pt.y)
    const before = await probe()
    await page.keyboard.press('Digit2')
    const p = await probe()
    rep.check('key 2 aimed deep in the LEFT sector launches from CENTER (400)',
        p.origins[p.origins.length - 1] === 400, JSON.stringify(p.origins))
    rep.check('key 2 spent exactly the center magazine, nobody else\'s',
        p.silosAmmo[1] === before.silosAmmo[1] - 1 && p.silosAmmo[0] === before.silosAmmo[0],
        JSON.stringify(p.silosAmmo))
}
{
    const before = await probe()
    await page.keyboard.press('Digit1')
    await page.keyboard.press('Digit3')
    const p = await probe()
    rep.check('keys 1 and 3 launch from 40 and 760 at the same left-sector aim',
        p.origins.includes(40) && p.origins.includes(760), JSON.stringify(p.origins))
    rep.check('the named keys spent only their own magazines',
        p.silosAmmo[0] === before.silosAmmo[0] - 1 && p.silosAmmo[2] === before.silosAmmo[2] - 1,
        JSON.stringify(p.silosAmmo))
}
// the mouse keeps its law: nearest battery
{
    const before = await probe()
    const pt = await clientOf(120, 320)
    await page.mouse.click(pt.x, pt.y)
    const p = await probe()
    rep.check('a mouse click in the left sector still takes the nearest battery (40)',
        p.origins.length > before.origins.length && p.origins[p.origins.length - 1] === 40,
        JSON.stringify(p.origins))
}
// the gate: the named center key now flies the fast ABM live
{
    await page.evaluate(() => window.__mcTest.toWave7())
    await sleep(200)
    const pt = await clientOf(120, 300) // foreign sector again
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Digit2')
    const p = await probe()
    rep.check('at wave 7, key 2 from the left sector flies the 28 px/tick ABM',
        p.smartWave && p.abmSpeeds.includes(28) && p.origins.includes(400),
        `smartWave ${p.smartWave} speeds ${JSON.stringify(p.abmSpeeds)} origins ${JSON.stringify(p.origins)}`)
}
// hot-seat duty guard: on the CPU's wave the human's keys spend nothing
{
    await page.evaluate(() => window.__mcTest.start2())
    await sleep(300)
    const s0 = await probe()
    rep.check('2P opens with P1 on duty', s0.twoP && s0.turn === 1, `turn ${s0.turn}`)
    await page.evaluate(() => window.__mcTest.endWave())
    let turn2 = false
    for (let i = 0; i < 40 && !turn2; i++) { await sleep(150); turn2 = (await probe()).turn === 2 }
    rep.check('the wave clear hands the board to seat 2', turn2)
    if (turn2) {
        const before = await probe()
        await page.keyboard.press('Digit2')
        await page.keyboard.press('KeyB')
        await sleep(120)
        const after = await probe()
        rep.check('on the CPU seat\'s wave the battery keys spend nothing (duty guard)',
            after.ammo === before.ammo, `${before.ammo} → ${after.ammo}`)
    }
}
rep.check('zero page errors across the drive', errors === 0, `${errors}`)
rep.exit(browser)
