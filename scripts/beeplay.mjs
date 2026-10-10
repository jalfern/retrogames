// BEEZEE — Chrome plays the garden with NOTHING but real key events.
//
//   npm run beeplay     (needs `npm run dev`)
//
// The sim is proven in Node (beecheck); this is the other half: the input path.
// An `evaluate(sim.step)` shortcut would prove nothing about arrow keys, the
// pointer gate, the rAF/timestep plumbing, or the canvas readback the bee's
// eyes depend on. So the driver READS state through the DEV probe (read-only:
// probe + aim, which mutate nothing) and ACTS only through page.keyboard —
// the same path a thumb on the virtual pad drives (the heistplay rule).
//
// Route: attract demo paints → real key starts the run → steering yaws the bee
// and repaints the frame → V flips UV and darkens the sky → drive to flowers
// and drink, then bank a full load at the hive → HUD pixels match sim state →
// bait the gecko until the run ends → ledger, back to attract, tap to restart.

import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.BEE_URL || 'http://localhost:5173/retrogames/beezee'
await requireDevServer(URL)

const r = new Report('beeplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__beeTest.probe())
const aim = () => page.evaluate(() => window.__beeTest.aim())
// ONE evaluate per driver tick: every extra round-trip is 30-60 ms the sim
// spends flying while the driver is still thinking. Slow drivers miss turns.
const snap = () => page.evaluate(() => ({ ...window.__beeTest.probe(), aim: window.__beeTest.aim() }))
const wait = ms => page.waitForTimeout(ms)
const tap = async (code, ms = 120) => { await page.keyboard.down(code); await wait(ms); await page.keyboard.up(code) }
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

// the exact centre of the frame, as the GPU painted it. three.js owns this
// canvas's WebGL context — there is no 2d on it; dev sets
// preserveDrawingBuffer precisely so readPixels can see the frame.
const pixels = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-bee-stage]')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const W = 80, H = 60
    const d = new Uint8Array(W * H * 4)
    gl.readPixels((c.width >> 1) - W / 2, (c.height >> 1) - H / 2, W, H, gl.RGBA, gl.UNSIGNED_BYTE, d)
    let sum = 0
    const uniq = new Set()
    for (let i = 0; i < d.length; i += 16) {
        sum += d[i] + d[i + 1] + d[i + 2]
        uniq.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
    }
    return { sum: sum / (d.length / 16), colors: uniq.size }
})

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__beeTest, null, { timeout: 20000 })
} catch {
    r.check('DEV hook exists', false, 'window.__beeTest never appeared (dev server? /beezee route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

{
    const a = await probe()
    r.check('opens in attract with the autopilot demo flying', a.screen === 'attract' && a.t > 0, `t=${a.t.toFixed(1)}s`)
    const p = await pixels()
    r.check('the meadow is painted, not black', p.sum > 20 && p.colors > 6, `mean=${p.sum.toFixed(1)} colors=${p.colors}`)
}

await tap('KeyX', 60)
await wait(400)
{
    const a = await probe()
    r.check('a real key leaves attract and starts the run', a.screen === 'play', `screen=${a.screen}`)
}

{
    const b0 = await probe()
    const p0 = await pixels()
    await tap('ArrowLeft', 700)
    await wait(250)
    const b1 = await probe()
    const p1 = await pixels()
    const dyaw = Math.abs(wrap(b1.yaw - b0.yaw))
    r.check('ArrowLeft yaws the bee', dyaw > 0.25, `Δyaw=${dyaw.toFixed(2)} rad`)
    r.check('the frame changed when the head turned', Math.abs(p1.sum - p0.sum) > 2 || p1.colors !== p0.colors,
        `mean ${p0.sum.toFixed(0)}→${p1.sum.toFixed(0)}, colors ${p0.colors}→${p1.colors}`)
    r.check('no key stuck down', !(await probe()).keys.includes('ArrowLeft'))
}

{
    // UV is a HOLD key (eyes on while held) — probe while the key is still down.
    const u0 = await pixels()
    await page.keyboard.down('KeyV')
    await wait(400)
    const s1 = await probe()
    const u1 = await pixels()
    r.check('V (held) switches the bee into ultraviolet', s1.uv === true, `uv=${s1.uv}`)
    r.check('UV visibly repaints the world darker', u1.sum < u0.sum * 0.75, `mean ${u0.sum.toFixed(0)}→${u1.sum.toFixed(0)}`)
    const op = await page.evaluate(() => getComputedStyle(document.getElementById('bee-uv')).opacity)
    r.check('the HUD UV badge lights with the sense', +op > 0.9, `opacity=${op}`)
    await page.keyboard.up('KeyV')
    await wait(200)
    r.check('releasing V flips back to day', (await probe()).uv === false)
}

// ---------------- the flight: flowers + hive, arrows + space only ----------------
r.info('flying the garden with keys only', 'slow on purpose: real time, real keys, no teleports')
let carried = 0
let banked = 0
let thrustDown = false
let uvHeld = false
const press = async (code, ms) => { await page.keyboard.down(code); await wait(ms); await page.keyboard.up(code) }

for (let i = 0; i < 520; i++) {
    const s = await snap()
    if (s.screen !== 'play') break
    if (banked > 0) break
    const a = s.aim
    // eyes on only over the cups that need them
    if (a.uv && !uvHeld) { await page.keyboard.down('KeyV'); uvHeld = true }
    if (!a.uv && uvHeld) { await page.keyboard.up('KeyV'); uvHeld = false }

    // Cruise-and-buzz: steer with short arrow pulses, hold thrust, match
    // altitude. No dedicated hover controller — a bee that buzzes through a
    // flower center still lands inside the drink radius, and a simpler driver
    // makes FEWER round-trips, which is what actually keeps it in tempo.
    const tx = a.home ? 0 : a.x, tz = a.home ? 0 : a.z
    const d = Math.hypot(tx - s.x, tz - s.z)
    const dyaw = wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw)
    if (Math.abs(dyaw) > 0.12) {
        const k = dyaw > 0 ? 'ArrowLeft' : 'ArrowRight'
        await page.keyboard.down(k); await wait(Math.min(400, 55 + Math.abs(dyaw) * 210)); await page.keyboard.up(k)
    }
    const ty = a.home ? (d > 7 ? 3.8 : 1.2) : a.y
    const dy = ty - s.y
    if (Math.abs(dy) > 0.55) {
        const k = dy > 0 ? 'ArrowUp' : 'ArrowDown'
        await page.keyboard.down(k); await wait(Math.min(300, Math.abs(dy) * 170)); await page.keyboard.up(k)
    }
    if (!thrustDown) { await page.keyboard.down('Space'); thrustDown = true }
    await wait(150)

    if (i % 20 === 19 || a.home) {
        const now = await probe()
        if (now.nectar > carried) { carried = now.nectar; r.info('drank nectar', `carrying ${carried} at t=${now.t.toFixed(0)}`) }
        if (now.delivered > banked) { banked = now.delivered; r.info('banked at the hive', `${banked} total at t=${now.t.toFixed(0)}`) }
        if (now.screen !== 'play') { if (thrustDown) { await page.keyboard.up('Space'); thrustDown = false } break }
        if (a.home) r.info('homing', `t=${now.t.toFixed(0)} carry=${now.nectar} distHome=${d.toFixed(1)}`)
    }
}
if (thrustDown) await page.keyboard.up('Space')
if (uvHeld) await page.keyboard.up('KeyV')
r.check('the bee drank nectar with only real keys', carried > 0, `carried=${carried}`)
r.check('nectar was banked at the hive', banked > 0, `banked=${banked}`)
{
    const s = await probe()
    const domN = await page.evaluate(() => document.getElementById('bee-nectar').textContent.split('').filter(c => c === '●').length)
    r.check('HUD nectar dots match the sim carry', domN === s.nectar, `dom=${domN} sim=${s.nectar}`)
    const domScore = await page.evaluate(() => document.getElementById('bee-score').textContent)
    r.check('HUD score matches the sim ledger', +domScore === s.score, `dom=${domScore} sim=${s.score}`)
}

// ---------------- dying: bait the gecko ----------------
r.info('baiting the gecko', 'hovering slow under a predator is how bees learn; deterministic toll')
for (let i = 0; i < 200; i++) {
    const s = await probe()
    if (s.screen === 'over' || s.end) break
    const d = Math.hypot(s.x - 4.6, s.z - 0.5)
    if (d > 1.0) {
        const dyaw = wrap(Math.atan2(4.6 - s.x, 0.5 - s.z) - s.yaw)
        if (Math.abs(dyaw) > 0.3) await press(dyaw > 0 ? 'ArrowLeft' : 'ArrowRight', Math.min(420, Math.abs(dyaw) * 240))
        await press('Space', d > 2 ? 340 : 140)
    } else {
        const yawTo = Math.atan2(-s.wind[0], -s.wind[1])
        const dyaw = wrap(yawTo - s.yaw)
        if (Math.abs(dyaw) > 0.4) await press(dyaw > 0 ? 'ArrowLeft' : 'ArrowRight', 240)
        if (s.y > 1.4) await press('ArrowDown', 220)
        await press('Space', 150)
    }
}
{
    const fin = await probe()
    r.check('the run ENDS (stung or sunset, not a hang)', fin.screen === 'over', `screen=${fin.screen} end=${fin.end}`)
    const board = fin.board
    r.check('the nectar ledger recorded the run', Array.isArray(board) && board.length >= 1, `entries=${board?.length}`)
}

// ---------------- restart ----------------
await wait(1100)
await tap('KeyJ', 60)
await wait(300)
r.check('a key returns to attract', (await probe()).screen === 'attract')
await page.mouse.click(550, 400)
await wait(500)
{
    const a = await probe()
    r.check('a tap starts a fresh run (clock + score reset)', a.screen === 'play' && a.t < 12 && a.score === 0, `t=${a.t.toFixed(1)} score=${a.score}`)
}
await page.keyboard.press('?')
await wait(300)
{
    const has = await page.evaluate(() => !!document.body.textContent.includes('PAUSED') || !!document.querySelector('h1, h2'))
    r.check('the ? pause path opens the overlay without throwing', has)
}
r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
