// Menu / touch-input regression for Super Mario.
//
// Promoted from scripts/.shots/menu.mjs (gitignored). That driver printed state
// and relied on a human reading it; this one asserts, so it can gate a PR that
// touches the title screen, options menu, or virtual gamepad.
//
// Regression this exists for (PR #22): a lone modifier — Shift on the way to
// '?' — used to start the game, so the desktop menu was unreachable by keyboard.
//
// Usage:
//   npm run mariocheck
//   node scripts/mariocheck.mjs [--url <url>]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, openGame, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)

await requireDevServer(url)
const browser = await launch()
const r = new Report('mariocheck')

const page = await openMario(browser, { url })
const fresh = async () => {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__marioTest, null, { timeout: 15000 })
    await page.waitForTimeout(250)
}
const state = () => page.evaluate(() => window.__marioTest.getState())
const is = async (want, label) => {
    const s = await state()
    const ok = Array.isArray(want) ? want.includes(s.state) : s.state === want
    r.check(label, ok, `state=${s.state}`)
    return s
}
// Gamepad presence is checked in step 8, on the side that can show it.

// 1. A lone modifier must NOT start the game (the PR #22 bug).
await fresh()
await is('attract', 'boots into attract mode')
await page.keyboard.press('Shift')
await page.waitForTimeout(150)
await is('attract', 'lone Shift does not start the game')

// 2. '?' then reaches the menu.
await page.keyboard.press('?')
await page.waitForTimeout(200)
await is('menu', "'?' opens the OPTIONS menu")

// 3. A normal key still starts the game.
await fresh()
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(250)
await is(['intro', 'play', 'menu'], 'ArrowRight leaves attract')

// 4. OPTIONS button (the touch path) opens the menu.
await fresh()
await page.getByRole('button', { name: /OPTIONS/ }).click()
await page.waitForTimeout(200)
await is('menu', 'OPTIONS button opens the menu')

// 5. Tapping an option actually starts that mode.
await page.getByText('CPU LEARNS').click()
await page.waitForTimeout(300)
{
    const s = await state()
    r.check('tapping "WATCH · CPU LEARNS" enters evolve mode', s.mode === 'evolve', `mode=${s.mode}`)
}

// 6. Numeric keys select from the menu.
await fresh()
await page.getByRole('button', { name: /OPTIONS/ }).click()
await page.waitForTimeout(200)
await page.keyboard.press('3')
await page.waitForTimeout(300)
{
    const s = await state()
    r.check('key 3 starts autopilot', s.mode === 'autopilot', `mode=${s.mode}`)
}

// 7. BACK returns to attract, and ESC closes the menu.
await fresh()
await page.getByRole('button', { name: /OPTIONS/ }).click()
await page.waitForTimeout(200)
await page.getByText('◂ BACK').click()
await page.waitForTimeout(200)
await is('attract', 'BACK returns to attract')

await page.getByRole('button', { name: /OPTIONS/ }).click()
await page.waitForTimeout(200)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await is('attract', 'ESC closes the menu')

// 8. Virtual gamepad: absent on the menus, present while a TOUCH player is in
//    the game. Two stale assumptions retired here (#2062, reproduced red-on-main):
//    (a) the pad is a touch-only contract — #290 withholds it from pages whose
//    primary pointer is not coarse, so a desktop page can never show it;
//    (b) buttons render under the game's own pad labels (Mario: stick + "F"),
//    not a literal "A" span — `data-vc` is the stable selector (#735).
//    The run must also START by tap: #290 hides the pad again on any keyboard key.
const padEl = 'span:text-is("A"), [data-vc]'
const padCount = () => page.locator(padEl).count()
await fresh()
const onAttract = await padCount()
r.check('gamepad hidden on attract', onAttract === 0, `found=${onAttract}`)
{
    const phone = await openGame(browser, { url, viewport: { width: 390, height: 844 }, touch: true })
    const phonePad = () => phone.locator(padEl).count()
    const attract0 = await phonePad()
    r.check('gamepad hidden on attract (touch)', attract0 === 0, `found=${attract0}`)
    const box = await phone.locator('canvas').first().boundingBox()
    await phone.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await phone.waitForTimeout(600)
    const playing = await phonePad()
    r.check('gamepad present while playing (touch)', playing >= 1, `found=${playing}`)
    await phone.screenshot({ path: 'scripts/.shots/mariocheck-pad.png' }).catch(() => {})
    await phone.close()
}

await page.screenshot({ path: 'scripts/.shots/mariocheck.png' }).catch(() => {})
r.exit(browser)
