// drive the PINBALL TABLE SMITH (#3284) end to end in headless Chrome with
// REAL key events: walk the row to the ghost cabinet, bench opens, refusals
// bite, wipe/place/name/save land, the saved machine rides the row and plays,
// a TEST drop comes home to the bench, and the cabinet survives a reload.
// Advisory lane tool, dev-port aware (DEV_PORT).
import { openGame, launch } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const browser = await launch()
const out = []
const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const keys = async (page, code, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(code); await wait(16) } }
const smith = (page) => page.evaluate(() => window.__pinballTest.smith())
const ffToOver = async (page) => {
    let s = null
    for (let blk = 0; blk < 6; blk++) {
        await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__pinballTest.step(400) })
        for (let i = 0; i < 20; i++) { await wait(100); s = await page.evaluate(() => window.__pinballTest.state()); if (s.done && (s.screen === 'over' || s.screen === 'edit')) return s }
    }
    return s
}
try {
    const seedPage = await browser.newPage()
    await seedPage.goto(`${BASE}/pinball`)
    await seedPage.evaluate(() => localStorage.clear())
    await seedPage.close()

    const page = await openGame(browser, { url: `${BASE}/pinball?lite=1`, hook: '__pinballTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    ok('boots clean', errors.length === 0, errors.join(';'))

    // ---- the ghost slot waits on the row ----
    const s0 = await smith(page)
    ok('fresh browser: slot 2 is the ghost smith card', s0.saved === false && s0.tag === 'DESIGN YOUR OWN', s0.tag)
    await keys(page, 'ArrowRight', 2)
    ok('the row cycles to the smith slot', (await smith(page)).sel === 2)
    await page.keyboard.press('Space')
    await wait(120)
    ok('START on the ghost opens the bench', (await smith(page)).screen === 'edit')

    // ---- refusals bite with real keys ----
    await keys(page, 'ArrowLeft', 17)                  // x clamps at 40 — inside the row, left of the bumper zone (82)
    await page.keyboard.press('Space')
    await wait(60)
    let s = await smith(page)
    ok('a placement outside the zone is refused on the live bench',
        s.notice === 'BUMPER OUT OF ZONE', s.notice)
    await keys(page, 'ArrowRight', 17)                 // back under the dome centre
    await keys(page, 'ArrowDown', 5)                   // legal air, 30 px clear of the middle bumper
    await page.keyboard.press('Space')                  // default draft ships 3 bumpers already
    s = await smith(page)
    ok('the bumper cap answers over-cap placements', s.notice === 'MAX 3 BUMPS', s.notice)

    // ---- wipe one, move it, rename, save ----
    for (let i = 0; i < 8 && (await smith(page)).tool !== 'WIPE'; i++) await page.keyboard.press('KeyB')
    ok('B cycles the part palette', (await smith(page)).tool === 'WIPE')
    const b0 = (await smith(page)).draft.bumpers[0]    // default trio starts at (115,170)
    // walk the cursor onto bumper 0 (from wherever the refusals parked it)
    let guard = 0
    while (guard++ < 300) {
        const [cx, cy] = (await smith(page)).cursor
        if (Math.hypot(cx - b0[0], cy - b0[1]) < 7) break
        if (cx > b0[0]) await page.keyboard.press('ArrowLeft'); else if (cx < b0[0]) await page.keyboard.press('ArrowRight')
        if (cy > b0[1]) await page.keyboard.press('ArrowUp'); else if (cy < b0[1]) await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Space')
    s = await smith(page)
    ok('WIPE lifts the bumper off the bench', s.draft.bumpers.length === 2 && !s.draft.bumpers.some((p) => p[0] === b0[0] && p[1] === b0[1]), JSON.stringify(s.draft.bumpers))
    await keys(page, 'ArrowDown', 8)
    for (let i = 0; i < 8 && (await smith(page)).tool !== 'BUMPER'; i++) await page.keyboard.press('KeyB')
    await page.keyboard.press('Space')                  // drop a fresh bumper under the cursor
    s = await smith(page)
    ok('a moved bumper lands legal and counts', s.draft.bumpers.length === 3 && s.valid, JSON.stringify(s.draft.bumpers))
    for (let i = 0; i < 8 && (await smith(page)).tool !== 'NAME'; i++) await page.keyboard.press('KeyB')
    await page.keyboard.press('Space')
    s = await smith(page)
    ok('NAME stamps a new marquee name', s.draft.name !== 'NOVA RIDER' && s.draft.name.length > 3, s.draft.name)
    for (let i = 0; i < 8 && (await smith(page)).tool !== 'SAVE'; i++) await page.keyboard.press('KeyB')
    await page.keyboard.press('Space')
    await wait(150)
    s = await smith(page)
    ok('SAVE parks the cabinet and walks out to the row',
        s.screen === 'attract' && s.saved === true && s.tag === s.draft.name, `${s.screen} ${s.tag}`)

    // ---- the saved machine rides the row and plays ----
    await page.keyboard.press('Space')                  // slot 2 still selected: START
    await wait(120)
    s = await smith(page)
    ok('START plays the SAVED custom cabinet', s.screen === 'play' && s.tbId === 'my-table', `${s.screen} ${s.tbId}`)
    await page.keyboard.down('Space'); await wait(700); await page.keyboard.up('Space')   // commit the plunger
    let launched = false
    for (let i = 0; i < 60 && !launched; i++) { await wait(100); launched = (await page.evaluate(() => window.__pinballTest.state())).launched }
    ok('the player-built table launches on the stock engine', launched)
    const ov = await ffToOver(page)
    ok('the custom game reaches GAME OVER', !!ov && ov.done, `score=${ov?.score}`)
    await page.keyboard.press('ArrowLeft')              // arrows leave the row (SPACE stays the quick retry)
    await wait(80)
    ok('game over from the row goes home to the row', (await smith(page)).screen === 'attract')

    // ---- redesign entry + TEST drop comes home to the bench ----
    await keys(page, 'ArrowRight', 2)                  // back onto the saved custom card
    await page.keyboard.press('KeyB')
    await wait(80)
    ok('B on the saved cabinet reopens the bench', (await smith(page)).screen === 'edit')
    for (let i = 0; i < 10 && (await smith(page)).tool !== 'TEST'; i++) await page.keyboard.press('KeyB')
    await page.keyboard.press('Space')                  // TEST DROP
    await wait(120)
    s = await smith(page)
    ok('TEST drops one ball into the draft', s.screen === 'play' && s.tbId === 'my-table')
    const tv = await ffToOver(page)
    ok('the test drop resolves', !!tv && tv.done, `score=${tv?.score}`)
    await page.keyboard.press('Space')
    await wait(80)
    ok('a test drop comes HOME to the bench, not the row', (await smith(page)).screen === 'edit')

    // ---- pixels: the bench paints a real screen, then persistence ----
    const px = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        const seen = new Set()
        for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
        return seen.size
    })
    ok('the bench is drawn, not blank (distinct colours sampled)', px > 12, `colors=${px}`)
    const keepName = (await smith(page)).tag
    await page.reload()
    await page.waitForFunction('window.__pinballTest', { timeout: 20000 })
    s = await smith(page)
    ok('the cabinet survives a reload', s.saved === true && s.tag === keepName, s.tag)

    ok('zero page errors across the whole smith run', errors.length === 0, errors.join(';'))
} catch (e) {
    ok('no crash', false, e.message)
} finally {
    await browser.close()
}
console.log(out.join('\n'))
const bad = out.filter((l) => l.startsWith('FAIL')).length
console.log(`pinballsmith: ${out.length - bad}/${out.length} legs passed${bad ? ' — FAILURES ABOVE' : ' — OK'}`)
process.exit(bad ? 1 : 0)
