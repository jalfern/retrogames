// tetrisplay — TETRIS driven by REAL key events in a real browser: the drawn
// piece must be where the DAS-logic says it is, rotation changes the sprite,
// soft drop descends at ~2 frames per row, the well tops out honestly, and the
// game restarts clean. Zero page errors throughout. The DEV hook is only used
// to read state (and to seed a deterministic situation) — every motion comes
// from keyboard events the sim's own input path sees.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.TETRIS_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/tetris`
const FX = 88, FY = 48, CELL = 8

const r = new Report('tetrisplay')
const HARD_DEADLINE = setTimeout(() => { console.error("tetrisplay: hard deadline hit — the page wedged"); process.exit(1) }, 240000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__tetrisTest' })

const probe = () => page.evaluate(() => window.__tetrisTest.probe())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// A CDP roundtrip can stall a rAF, and the fixed timestep owes the held key
// a catch-up tick that lands AFTER waitForTimeout returns. So every motion
// assertion polls to a settle: the verdict is the state once it stops
// changing, never the first glance after the key. Polls run at 50ms, not 25:
// the shared runner starves the tab's rAF under tight polling and the world
// stalls mid-mash (issue #214) — the world clock still grades every run.
const settle = async (pred, ms = 3000) => {
    let best = null
    for (let t = 0; t < ms; t += 50) {
        best = await probe()
        if (pred(best)) return best
        await page.waitForTimeout(50)
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
// A tap that a stalled rAF can swallow: hold the key only until the world
// shows the one move, then release. On a healthy box the hold lasts a
// frame or two — far inside the DAS repeat window (16 ticks) — so one
// press is exactly one cell. If the box bursts catch-up ticks while the
// key is still down (the starved-tab failure class), the tap can legally
// cover a DAS repeat and read 2 — that is a report about the machine, and
// the section fails loudly instead of drifting silently.
const tap = async (code, watch) => {
    const p0 = await probe()
    await page.keyboard.down(code)
    const moved = await settle((q) => watch(q, p0), 5000)
    await page.keyboard.up(code)
    return [moved, p0]
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
    r.check('gamepad withdrawn on the title screen', await page.evaluate(() => !Array.from(document.querySelectorAll('span')).some((s) => s.textContent.trim() === 'A')))
}

// ------------------------------------------------------------ tap start ----
{
    const canvas = await page.$('canvas[data-tetris-stage]')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(300)
    const p = await probe()
    r.check('a real tap on the canvas starts the race... the well', p.screen === 'play', p.screen)
    r.check('pad appears during play', await page.evaluate(() => Array.from(document.querySelectorAll('span')).some((s) => s.textContent.trim() === 'A')))
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
        const [p] = await tap('ArrowLeft', (q, p0) => p0.cur.x - q.cur.x >= 1)
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
    // key-up itself lands ~2 real frames after the last sampled tick, so up
    // to 2 rows of honest overshoot are allowed; the exact 2f/row cadence is
    // pinned tick-for-tick in tetrischeck (Node).
    r.check(`soft drop = ${want} rows over ${SOFT_TICKS} held ticks (2 frames per row, +-2 release overshoot)`, Math.abs(dy - want) <= 2, `dropped ${dy}`)
    const pc = p.cur.cells.find(([rr]) => rr >= 0)
    const lit = await cellLit(pc[0], pc[1])
    r.check('the piece is pixels where the clock says it is', lit > 0)
}

// ------------------------------------------------- clear window + tempo ----
// The NES flashes the full rows BEFORE the shift. The dev hook seeds a
// guaranteed single (an I over a hole, a marker block one row up, 9 lines
// banked); the piece is dropped with a REAL held DOWN key, and the probe +
// pixels grade the freeze, the shift and the tempo step.
{
    await page.evaluate(() => window.__tetrisTest.start(0, 5))
    await page.waitForTimeout(120)
    const pStart = await probe()
    r.check('music is running at the L0 tempo (0.15)', pStart.musicStep !== null && Math.abs(pStart.musicStep - 0.15) < 0.001, `step ${pStart.musicStep}`)
    const msg = await page.evaluate(() => window.__tetrisTest.seedClear(9))
    r.check('seedClear armed the well', /row 19/.test(msg), msg)

    await page.keyboard.down('ArrowDown')
    const pFlash = await settle((q) => q.clearing !== null)
    await page.keyboard.up('ArrowDown')
    r.check('a real soft drop completes the row and the flash window opens', pFlash.clearing && pFlash.clearing.rows.join(',') === '19', JSON.stringify(pFlash.clearing))
    const markerMid = await cellLit(18, 0)
    const rowMid = await cellLit(19, 4)
    r.check('during the flash: the marker still sits at row 18 (board frozen)', markerMid > 0, `pixel ${markerMid}`)
    r.check('during the flash: row 19 reads lit (flash over the locked row)', rowMid > 0, `pixel ${rowMid}`)

    const pAfter = await settle((q) => q.clearing === null && q.lines > 0)
    r.check('the shift lands: score 40, lines 10, level 1', pAfter.score === 40 && pAfter.lines === 10 && pAfter.level === 1, `score ${pAfter.score}, lines ${pAfter.lines}, level ${pAfter.level}`)
    const markerAfter = await cellLit(19, 0)
    const markerOld = await cellLit(18, 0)
    r.check('the marker rode the shift: row 19 lit, row 18 dark', markerAfter > 0 && markerOld === 0, `19=${markerAfter}, 18=${markerOld}`)
    r.check('the music stepped up to the L1 tempo (0.14)', pAfter.musicStep !== null && Math.abs(pAfter.musicStep - 0.14) < 0.001, `step ${pAfter.musicStep}`)
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
    // OTHER half): tight CDP polling at 25ms starves the renderer at scale,
    // so the drops breathe (800ms). The verdict, though, is in WORLD ticks —
    // every drop must show real descent, which is the assertion a starved
    // runner cannot fake and a slow box cannot break: a drop that held
    // ArrowDown 800ms of world time owes at least 24 ticks of clock. The
    // settle budget is generous (8s) because contended boxes stall rAF for
    // seconds and then burst — the burst is the game catching up, not a
    // runaway (a runaway would show in the tick delta, not the wall time).
    const t0 = Date.now()
    let p = await probe()
    let guard = 0
    let minDescent = 1e9, drops = 0
    while (!p.over && guard++ < 120) {
        const tDrop = p.tick
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(800)
        await page.keyboard.up('ArrowDown')
        p = await settle((q) => q.tick >= tDrop + 24, 8000)
        const descent = p.tick - tDrop
        drops++
        if (descent < minDescent) minDescent = descent
        await key(guard % 2 ? 'ArrowLeft' : 'ArrowRight', 6)
        await key('ArrowUp', 6)
        p = await probe()
    }
    r.check('every drop showed real world descent (>=24 ticks, no runaway catch-up)', drops > 0 && minDescent >= 24, `${drops} drops, min ${minDescent} ticks`)
    r.check('mashing the well honestly tops out', p.over && guard < 120, `over=${p.over} after ${guard} drops in ${Date.now() - t0}ms`)
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
    const padGone = await page.evaluate(() => Array.from(document.querySelectorAll('span')).some((s) => s.textContent.trim() === 'A'))
    r.check('pad back for the new run', padGone)
}

r.check('zero page errors for the whole session', errors.length === 0, errors.join(' | '))
clearTimeout(HARD_DEADLINE)
r.exit(browser)
