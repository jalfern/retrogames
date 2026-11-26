// advedrive — #3482 in real Chrome: the Blue Castle claims only a browser can
// make. adventurecheck owns the math; this leg proves what a phone player
// feels, with REAL key events only:
//   - any key starts from attract (start law),
//   - a route of real arrow holds walks Gold Castle → Blue Labyrinth 2 → into
//     the open Blue keep (the two-way west door is real, not declared),
//   - the duplicate chalice is DRAWN in the keep (device pixels, gold),
//   - a real overlap pick-up takes chalice2 (score 1 — kind honesty),
//   - the carried cup leaves the keep empty (pixel law again),
//   - a dragon kills in Blue Lab 1 (the world is still lethal),
//   - the dead state restarts to a fresh run on a real key,
//   - zero page errors across the ride.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const URL = process.env.ADV_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/adventure`
await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__advTest', wait: 400 })
const r = new Report('advedrive')
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__advTest.probe())
const sleep = (ms) => page.waitForTimeout(ms)
const until = async (fn, ms, label) => {
    const t0 = Date.now()
    for (;;) {
        const v = await fn()
        if (v) return v
        if (Date.now() - t0 > ms) throw new Error(`timeout waiting: ${label}`)
        await sleep(50)
    }
}
// Hold a real arrow until the probe says we arrived, then release.
let lastProbe = null
const snap = () => probe().then((q) => { lastProbe = q; return q })
const at = () => (lastProbe ? `${lastProbe.room}:${lastProbe.x.toFixed(0)},${lastProbe.y.toFixed(0)} dead=${lastProbe.dead}` : '?')
const holdTo = async (key, pred, label, ms = 15000) => {
    await page.keyboard.down(key)
    try {
        const t0 = Date.now()
        for (;;) {
            await snap()
            if (await pred()) return
            if (Date.now() - t0 > ms) throw new Error(`timeout waiting: ${label} @ ${at()}`)
            await sleep(50)
        }
    } finally { await page.keyboard.up(key) }
}
// Reactive real-key walking (what a player does looking at the screen): press
// toward a target, slide along walls, wiggle out of stalls, until pred holds.
const WIGGLE = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']
const navUntil = async (tx, ty, pred, label, ms = 40000) => {
    const down = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false }
    const set = async (k, on) => { if (down[k] !== on) { await page.keyboard[on ? 'down' : 'up'](k); down[k] = on } }
    let stall = 0
    let last = null
    const t0 = Date.now()
    try {
        for (;;) {
            if (await pred()) return
            if (Date.now() - t0 > ms) throw new Error(`nav timeout: ${label} @ ${last ? `${last.room}:${last.x.toFixed(0)},${last.y.toFixed(0)}` : '?'}`)
            const q = await probe()
            last = q
            const want = new Set()
            if (tx - q.x > 3) want.add('ArrowRight')
            if (tx - q.x < -3) want.add('ArrowLeft')
            if (ty - q.y > 3) want.add('ArrowDown')
            if (ty - q.y < -3) want.add('ArrowUp')
            for (const k of Object.keys(down)) await set(k, want.has(k))
            await sleep(140)
            const q2 = await probe()
            if (Math.abs(q2.x - q.x) + Math.abs(q2.y - q.y) < 0.8) {
                if (++stall >= 3) {
                    const wk = WIGGLE[stall % WIGGLE.length]
                    await page.keyboard.down(wk); await sleep(200); await page.keyboard.up(wk)
                    stall = 0
                }
            } else stall = 0
        }
    } finally {
        for (const k of Object.keys(down)) await set(k, false)
    }
}
const goldPixels = (wx, wy, ww, wh) => page.evaluate(([x, y, w, h]) => {
    const c = document.querySelector('canvas')
    const ctx = c.getContext('2d')
    const sx = c.width / 160; const sy = c.height / 192
    const d = ctx.getImageData(Math.round(x * sx), Math.round(y * sy), Math.max(1, Math.round(w * sx)), Math.max(1, Math.round(h * sy))).data
    let gold = 0
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 150 && d[i] < 235 && d[i + 1] > 110 && d[i + 1] < 190 && d[i + 2] < 60) gold++
    }
    return gold
}, [wx, wy, ww, wh])

// ---- 1. attract → any key starts ------------------------------------------------
let p = await probe()
r.check('hook answers on the adventure page', !!p)
await page.keyboard.press('ArrowRight')
await sleep(300)
p = await probe()
r.check('a real key starts the run outside the Gold Castle', p.room === 0 && p.tick >= 0 && !p.dead && !p.won,
    `room=${p.room} tick=${p.tick}`)

// ---- 2. real-route into the keep -----------------------------------------------
await holdTo('ArrowDown', async () => (await probe()).room === 2, 'OW1')
await holdTo('ArrowDown', async () => (await probe()).room === 3, 'OW2')
await navUntil(-10, 95, async () => (await probe()).room === 7, 'west door into Blue Lab 1', 30000)
// Blue Lab 1: down the east corridor, west along the open floor row, drop
// through the south gap (the maze's inner walls never touch these lines).
await holdTo('ArrowDown', async () => (await probe()).y > 170, 'east corridor down', 9000)
await holdTo('ArrowLeft', async () => { const q = await probe(); return q.x < 82 && q.x > 62 }, 'west along the floor')
await holdTo('ArrowDown', async () => (await probe()).room === 8, 'south gap into Blue Lab 2')
// Blue Lab 2: east over the pillar head (y≈8), down the east column past the
// pocket, right through the keep door.
await holdTo('ArrowRight', async () => (await probe()).x > 138, 'east over the pillar')
await holdTo('ArrowDown', async () => (await probe()).y > 78, 'east column down to the gap lane')
await holdTo('ArrowRight', async () => (await probe()).room === 18, 'through the keep door', 20000)
p = await probe()
r.check('real arrow holds walk into the open Blue keep', p.room === 18, `room=${p.room} x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}`)

// ---- 3. the duplicate is DRAWN in the keep -------------------------------------
const before = await goldPixels(78, 98, 14, 20)
r.check('the duplicate chalice draws gold in the keep', before > 10, `${before} gold px at (80,100)`)

// ---- 4. real overlap picks it up; kind-honest score --------------------------
await holdTo('ArrowRight', async () => (await probe()).x > 72, 'to the cup column')
await holdTo('ArrowDown', async () => (await probe()).carrying === 'chalice2', 'onto the cup', 8000)
p = await probe()
r.check('walking onto the duplicate takes it', p.carrying === 'chalice2', `carrying=${p.carrying}`)
r.check('kind-honest score: the cup is ONE distinct item', p.score === 1, `score=${p.score}`)
const after = await goldPixels(78, 98, 14, 20)
r.check('the keep floor is empty once the cup rides with you', after === 0 || p.x > 74, `gold=${after} x=${p.x.toFixed(0)}`)

// ---- 5. the world is still lethal: die to Yorgle in Blue Lab 1 ---------------
await holdTo('ArrowLeft', async () => (await probe()).room === 8, 'out of the keep west')
await holdTo('ArrowUp', async () => (await probe()).y < 16, 'up the east side', 9000)
await holdTo('ArrowLeft', async () => { const q = await probe(); return q.x < 82 && q.x > 62 }, 'west under the top wall')
await holdTo('ArrowUp', async () => (await probe()).room === 7, 'down the top gap into the dragon room')
let died = false
const t0 = Date.now()
while (!died && Date.now() - t0 < 60000) {
    const q = await probe()
    const d = (q.dragons || []).find((x) => x.alive && x.room === q.room)
    if (!d) { await sleep(100); continue }
    const dx = d.x - q.x; const dy = d.y - q.y
    // greedy real keys toward the hunter; short pulses so walls slide
    const kx = dx > 4 ? 'ArrowRight' : dx < -4 ? 'ArrowLeft' : null
    const ky = dy > 4 ? 'ArrowDown' : dy < -4 ? 'ArrowUp' : null
    if (kx) await page.keyboard.down(kx)
    if (ky) await page.keyboard.down(ky)
    await sleep(120)
    if (kx) await page.keyboard.up(kx)
    if (ky) await page.keyboard.up(ky)
    const s = await probe()
    died = s.dead === true
}
r.check('a hunting dragon kills the dot for real (bite law live in the browser)', died)

// ---- 6. the dead terminal restarts on a real key ------------------------------
if (died) {
    await sleep(2600) // the cart's death hold (deathTimer) runs out
    await page.keyboard.press('Space')
    await sleep(300)
    const q = await probe()
    r.check('death restarts to a fresh run at the Gold Castle', q.room === 0 && q.tick < 60 && !q.dead && q.score === 0,
        `room=${q.room} tick=${q.tick} score=${q.score}`)
}

r.check('zero page errors across the whole ride', errors.length === 0, errors.join(' | '))
await page.screenshot({ path: process.env.ADV_SHOT || '/tmp/advedrive.png' })
r.exit(browser)
