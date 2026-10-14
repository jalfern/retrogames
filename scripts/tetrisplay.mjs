// tetrisplay — TETRIS driven by REAL key events in a real browser: the drawn
// piece must be where the DAS-logic says it is, rotation changes the sprite,
// soft drop descends at ~2 frames per row, the well tops out honestly, and the
// game restarts clean. Zero page errors throughout. The DEV hook is only used
// to read state (and to seed a deterministic situation) — every motion comes
// from keyboard events the sim's own input path sees.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.TETRIS_URL || 'http://localhost:5173/retrogames/tetris'
const FX = 88, FY = 48, CELL = 8

const r = new Report('tetrisplay')
const HARD_DEADLINE = setTimeout(() => { console.error('tetrisplay: hard deadline hit — the page wedged'); process.exit(1) }, 150000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__tetrisTest' })

const probe = () => page.evaluate(() => window.__tetrisTest.probe())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// A CDP roundtrip can stall a rAF, and the fixed timestep owes the held key
// a catch-up tick that lands AFTER waitForTimeout returns. So every motion
// assertion polls to a settle: the verdict is the state once it stops
// changing, never the first glance after the key.
const settle = async (pred, ms = 1500) => {
    let best = null
    for (let t = 0; t < ms; t += 25) {
        best = await probe()
        if (pred(best)) return best
        await page.waitForTimeout(25)
    }
    return best
}
// Every hold is measured in WORLD ticks (the same clock `npm run heistclock`
// made law in this repo): `setTimeout` measures the harness, the sim tick
// measures the game. A held key is held for N simulated frames, period.
const simWait = async (ticks, budget = 5000) => {
    const t0 = (await probe()).tick
    await settle((q) => q.tick >= t0 + ticks, budget)
}

const pixel = (px, py) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-tetris-stage]')
    if (!c) return null
    const g = c.getContext('2d')
    const d = g.getImageData(x, y, 1, 1).data
    return d[0] + d[1] + d[2]
}, [px, py])

const cellLit = (rr, cc) => pixel(FX + cc * CELL + 4, FY + rr * CELL + 4)

const key = async (code, ticks = 8) => {
    await page.keyboard.down(code)
    await simWait(ticks)
    await page.keyboard.up(code)
}

// ------------------------------------------------------------- attract ----
{
    const p = await probe()
    r.check('opens in attract mode', p.screen === 'attract', p.screen)
    await page.waitForTimeout(1200)
    const art = await pixel(244, 100)
    const title = await pixel(97, 14)
    r.check('attract paints the NES frame (art column + title glyph)', art > 0 && title > 0, `art ${art}, title ${title}`)
    const t0 = p.tick
    await page.waitForTimeout(500)
    const t1 = (await probe()).tick
    r.check('attract demo runs tick-for-tick', t1 > t0, `${t0} -> ${t1}`)
    r.check('gamepad withdrawn on the title screen', await page.evaluate(() => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === 'A')))
}

// ------------------------------------------------------------ tap start ----
{
    const canvas = await page.$('canvas[data-tetris-stage]')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(300)
    const p = await probe()
    r.check('a real tap on the canvas starts the race... the well', p.screen === 'play', p.screen)
    r.check('pad appears during play', await page.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === 'A')))
}

// --------------------------------------------------- deterministic setup ----
const SEED = 2 // seed 2 opens with J: it survives three left taps and rotates on screen
await page.evaluate((sd) => window.__tetrisTest.start(0, sd), SEED)
await page.waitForTimeout(120)

// ----------------------------------------------------- tap moves by one ----
{
    let prev = (await probe()).cur.x
    const steps = []
    for (let i = 0; i < 3; i++) {
        await key('ArrowLeft', 6)
        const p = await settle((q) => prev - q.cur.x >= 1)
        steps.push(prev - p.cur.x)
        prev = p.cur.x
    }
    r.check('three left taps = three cells west (one per press, no drift)', steps.every((d) => d === 1), steps.join(','))
    const p = await probe()
    const c0 = p.cur.cells.find(([rr]) => rr >= 0)
    const lit = await cellLit(c0[0], c0[1])
    r.check('drawn piece sits on the logical cells', lit > 0, `cell ${c0[0]},${c0[1]} pixel ${lit}`)
    const ghostX = p.cur.x + 4
    const old = ghostX < 10 ? await cellLit(c0[0], ghostX) : 0
    r.check('no ghost of the old position left behind', old === 0, `old cell pixel ${old}`)
}

// ------------------------------------------------------- DAS via real key ----
{
    const before = (await probe()).cur.x
    const HELD = 18 // world ticks under a held RIGHT (repeat window opens at 17)
    await page.keyboard.down('ArrowRight')
    await simWait(HELD)
    await page.keyboard.up('ArrowRight')
    const p = await settle((q) => q.cur.x - before >= 2)
    const moved = p.cur.x - before
    // exact DAS arithmetic for 20 ticks: move at f=1 and f=17 -> 2 cells
    r.check(`a ${HELD}-tick hold covers DAS exactly: immediate + one repeat`, moved === 2, `moved ${moved}, want 2`)
}

// ------------------------------------------------------- rotate is real ----
{
    const p0 = await probe()
    if (p0.cur.type === 'O') {
        r.skip('rotation pixel check (first piece is the O — rotation is a no-op)')
    } else {
        await key('ArrowUp')
        const p1 = await probe()
        r.check('UP rotates the piece (logical rot changes)', p1.cur.rot !== p0.cur.rot, `${p0.cur.type} rot ${p0.cur.rot} -> ${p1.cur.rot}`)
        const c0 = p0.cur.cells.map(([a, b]) => `${a},${b}`).sort().join('|')
        const c1 = p1.cur.cells.map(([a, b]) => `${a},${b}`).sort().join('|')
        r.check('the rotated footprint is different', c0 !== c1)
        const lit = await cellLit(p1.cur.cells[0][0], p1.cur.cells[0][1])
        r.check('rotated sprite drawn at the new footprint', lit > 0, `pixel ${lit}`)
    }
}

// --------------------------------------------------------- soft drop ----
{
    const y0 = (await probe()).cur.y
    const SOFT_TICKS = 24
    const want = Math.floor(SOFT_TICKS / 2) // 12 rows at 2f/row
    await page.keyboard.down('ArrowDown')
    await simWait(SOFT_TICKS)
    await page.keyboard.up('ArrowDown')
    const p = await settle((q) => q.cur.y - y0 >= want - 1)
    const dy = p.cur.y - y0
    r.check(`soft drop = ${want} rows over ${SOFT_TICKS} held ticks (2 frames per row)`, Math.abs(dy - want) <= 1, `dropped ${dy}`)
    const pc = p.cur.cells.find(([rr]) => rr >= 0)
    const lit = await cellLit(pc[0], pc[1])
    r.check('the piece is pixels where the clock says it is', lit > 0)
}

// --------------------------------------------------------- pause holds ----
{
    const tRun0 = (await probe()).tick
    await simWait(12)
    const tRun1 = (await probe()).tick
    await page.keyboard.press('Shift+Slash') // '?'
    await page.waitForTimeout(150)
    const t0 = (await probe()).tick
    await page.waitForTimeout(700)
    const t1 = (await probe()).tick
    r.check('pause freezes the world', t1 === t0 && tRun1 > tRun0, `running ${tRun0}->${tRun1}, held ${t0} -> ${t1}`)
    r.check('pause overlay is up', await page.evaluate(() => !!Array.from(document.querySelectorAll('h1')).find((h) => h.textContent.includes('TETRIS'))))
    await page.keyboard.press('Shift+Slash')
    await simWait(8)
    const t2 = (await probe()).tick
    r.check('resume restarts the clock', t2 > t1, `tick ${t1} -> ${t2}`)
}

// ------------------------------------------------------ top out for real ----
{
    // The long drop waits stay in wall time on purpose (heistclock lesson's
    // OTHER half): tight CDP polling at 25ms starves the renderer at scale.
    // The world clock still grades the run — via locks, which cannot lie —
    // simWait is reserved for the short holds above.
    const t0 = Date.now()
    let p = await probe()
    let guard = 0
    while (!p.over && guard++ < 120) {
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(200)
        await page.keyboard.up('ArrowDown')
        await key(guard % 2 ? 'ArrowLeft' : 'ArrowRight', 6)
        await key('ArrowUp', 6)
        p = await probe()
    }
    r.check('the drop cadence tracked real time (no runaway catch-up)', Date.now() - t0 < guard * 600, `${guard} drops in ${Date.now() - t0}ms`)
    r.check('mashing the well honestly tops out', p.over && guard < 120, `over=${p.over} after ${guard} drops`)
    const po = await settle((q) => q.screen === 'over', 2500)
    await page.waitForTimeout(900) // the game ignores restart keys for its first 0.8s
    r.check('the GAME OVER screen shows', po.screen === 'over', po.screen)
    r.check('the run locked a real stack before the top-out', po.locks >= 10, `locks ${po.locks} score ${po.score} lines ${po.lines}`)
}

// ------------------------------------------------------------ restart ----
{
    const p = await settle(() => true, 0)
    void p
    await page.keyboard.press('Enter')
    const q = await settle((z) => z.screen === 'play' && z.score === 0 && z.lines === 0)
    r.check('ENTER restarts clean', q.screen === 'play' && q.score === 0 && q.lines === 0, `${q.screen} score ${q.score}`)
    const padGone = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === 'A'))
    r.check('pad back for the new run', padGone)
}

r.check('zero page errors for the whole session', errors.length === 0, errors.join(' | '))
clearTimeout(HARD_DEADLINE)
r.exit(browser)
