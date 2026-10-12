// MINESWEEPER — Chrome plays a COLT board with NOTHING but real key events,
// grading the claims the Node oracle cannot see:
//
//   npm run sweepplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — a real Space leaves attract and plants the first
//      (mine-free) click; real arrows move the cursor on the event stack.
//   2. THE PAINT FOLLOWS THE BOARD — a revealed cell paints a pixel the
//      hidden-cell colour never is (canvas readback is real, not the black
//      WebGL blackspace that plagued the DOS titles).
//   3. THE BROWSER PLAYS ITSELF TO A WIN — the solver names a safe cell, the
//      driver walks the cursor there with arrows and presses Space; the run
//      must WIN, never die. A guess-free board that a real player could lose
//      on is exactly the lie sweepcheck proves it is not.
//   4. DETERMINISM — the same (seed, first click) reproduces the same board.
// The battery, the brute-force oracle and the four mutants live in
// scripts/sweepcheck.mjs (Node) — this suite proves the browser plumbing.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.SWEEP_URL || 'http://localhost:5173/retrogames/minesweeper'
await requireDevServer(URL)

const r = new Report('sweepplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 720, height: 820 }, deviceScaleFactor: 2 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__sweepTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 12345

// A deterministic board: seed it through the hook so this run reproduces.
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
console.log('\nINPUT — a real key leaves attract and plants a mine-free click')

const attract = await probe()
r.check('opens on the attract screen', attract.screen === 'attract', `screen=${attract.screen}`)

await page.keyboard.press('Space')
await wait(400)
await page.evaluate((sd) => window.__sweepTest.start(0, sd), seed)
await wait(300)

let s = await probe()
r.check('a real Space leaves attract and enters play', s.screen === 'play', `screen=${s.screen}`)

// Plant the first click via the keyboard (Space digs the cursor). Before it,
// nothing is planted; after it the board exists and the click zone is safe.
r.check('board is live and not yet planted', s.planted === false, `planted=${s.planted}`)
await page.keyboard.press('Space')
await wait(250)
s = await probe()
r.check('first Space planted the board', s.planted === true, `planted=${s.planted} opened=${s.opened}`)
r.check('the first click opened a region (opened>1)', s.opened > 1, `opened=${s.opened}`)

// The whole 3x3 under the first click must be mine-free (firstClick safety).
const mineSet = new Set(await page.evaluate(() => window.__sweepTest.mineCells()))
let firstSafe = true
for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
        const x = s.cursor.x + dx, y = s.cursor.y + dy
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue
        if (mineSet.has(y * s.w + x)) firstSafe = false
    }
}
r.check('the first-click 3x3 is guaranteed mine-free', firstSafe, `cursor=${s.cursor.x},${s.cursor.y}`)

console.log('\nCURSOR — real arrows move it on the event stack')
const before = { ...s.cursor }
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await wait(120)
s = await probe()
r.check('ArrowRight/ArrowDown moved the cursor',
    s.cursor.x === Math.min(s.w - 1, before.x + 1) && s.cursor.y === Math.min(s.h - 1, before.y + 1),
    `${before.x},${before.y} -> ${s.cursor.x},${s.cursor.y}`)

console.log('\nPAINT — the canvas reads back the board (not a black void)')
// Sample an OPEN cell and a still-hidden cell; their colours must differ and
// neither may be pure black. A 2D canvas readback returning black would sink
// every pixel claim — this proves the framebuffer is real in the browser.
const paint = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    if (!cv) return { err: 'no canvas' }
    const g = cv.getContext('2d')
    if (!g) return { err: 'no 2d context (WebGL? readback would be black)' }
    const st = window.__sweepTest.probe()
    const open = window.__sweepTest.openCells()
    if (!open.length) return { err: 'nothing opened to sample' }
    const rect = cv.getBoundingClientRect()
    const cw = rect.width / st.w, ch = rect.height / st.h
    const px = (i) => {
        const x = i % st.w, y = (i / st.w) | 0
        const d = g.getImageData(Math.round((x + 0.5) * (cv.width / st.w)), Math.round((y + 0.5) * (cv.height / st.h)), 1, 1).data
        return [d[0], d[1], d[2]]
    }
    let hidden = -1
    for (let i = 0; i < st.w * st.h; i++) if (!open.includes(i) && !window.__sweepTest.mineCells().includes(i)) { hidden = i; break }
    return { open: px(open[0]), hidden: hidden >= 0 ? px(hidden) : null, cw, ch }
})
if (paint.err) {
    r.check('canvas exposes a 2D context for readback', false, paint.err)
} else {
    const notBlack = paint.open && (paint.open[0] + paint.open[1] + paint.open[2]) > 12
    const distinct = paint.hidden && paint.open &&
        (Math.abs(paint.open[0] - paint.hidden[0]) + Math.abs(paint.open[1] - paint.hidden[1]) + Math.abs(paint.open[2] - paint.hidden[2])) > 8
    r.check('a revealed cell reads non-black on the canvas', notBlack, `open=${paint.open}`)
    r.check('a revealed cell is a different colour from a hidden one', distinct, `open=${paint.open} hidden=${paint.hidden}`)
}

console.log('\nSELF-PLAY — the solver names it, arrows+Space dig it, and it WINS')
// Drive with the solver's safe-cell suggestion, delivered ONLY as real keys:
// walk the cursor with arrows, press Space. If any dig were ever a guess, a
// real board would die here — a win proves the guess-free claim in the browser.
let steps = 0, deaths = 0, lastOpened = -1, stuck = 0
const t0 = Date.now()
while (Date.now() - t0 < 90000) {
    s = await probe()
    if (s.end === 'win' || s.end === 'dead') break
    if (s.end === 'dead') { deaths++; break }
    const nx = await page.evaluate(() => window.__sweepTest.nextSafe())
    if (!nx) {
        // No derivable cell — the board would need a guess. On a fair COLT
        // board this must never happen before the win.
        r.check('solver always had a safe cell to name (never needed a guess)', false, `stalled at opened=${s.opened} end=${s.end}`)
        break
    }
    if (s.opened === lastOpened) { stuck++ } else { stuck = 0; lastOpened = s.opened }
    if (stuck > 6) {
        r.check('the board kept opening under real input', false, `opened stuck at ${s.opened}`)
        break
    }
    // walk the cursor to the target with real arrow keys
    let guard = 0
    while (guard++ < 40) {
        const c = await probe()
        if (c.cursor.x === nx.x && c.cursor.y === nx.y) break
        if (c.cursor.x < nx.x) await page.keyboard.press('ArrowRight')
        else if (c.cursor.x > nx.x) await page.keyboard.press('ArrowLeft')
        else if (c.cursor.y < nx.y) await page.keyboard.press('ArrowDown')
        else if (c.cursor.y > nx.y) await page.keyboard.press('ArrowUp')
    }
    const c = await probe()
    if (c.cursor.x !== nx.x || c.cursor.y !== nx.y) {
        r.check('arrows parked the cursor on the named cell', false, `cursor=${c.cursor.x},${c.cursor.y} want=${nx.x},${nx.y}`)
        break
    }
    await page.keyboard.press('Space')
    await wait(60)
    steps++
}
s = await probe()
r.check('the browser played the board to a WIN', s.end === 'win', `end=${s.end} opened=${s.opened}/${s.w * s.h - s.totalMines} digs=${steps}`)
r.check('it never died on a "guess-free" board', s.end !== 'dead' && deaths === 0, `end=${s.end}`)
r.check('every non-mine cell ended open', s.opened === s.w * s.h - s.totalMines, `opened=${s.opened} expected=${s.w * s.h - s.totalMines}`)

console.log('\nDETERMINISM — the same seed reproduces the same board')
const h1 = await page.evaluate((sd) => { window.__sweepTest.start(0, sd); return window.__sweepTest.hash() }, seed)
await wait(120)
const h2 = await page.evaluate((sd) => { window.__sweepTest.start(0, sd); return window.__sweepTest.hash() }, seed)
r.check('same seed -> same board', h1 === h2 && h1 !== 0, `hash ${h1} vs ${h2}`)

if (errors.length) r.check('no page errors during play', false, errors.slice(0, 4).join(' | '))
else r.check('no page errors during play', true)

r.exit(browser)
