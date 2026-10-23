import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const PORT = Number(process.env.DRIVE_RELAY_PORT || 8789)
const relay = startRelay(PORT)
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
await requireDevServer(`${BASE}/gauntlet`)

const r = new Report('padlinkdrive')
const browser = await launch()
const errors = []
const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag} console] ${m.text()}`) })
}

const game = await browser.newPage({ viewport: { width: 900, height: 700 } })
watch(game, 'game')
await game.goto(`${BASE}/gauntlet?pads=1&relay=ws://localhost:${PORT}`, { waitUntil: 'load' })
await game.waitForFunction(() => !!window.__padlink && window.__padlink.code.length === 4, null, { timeout: 20000 })
const code = await game.evaluate(() => window.__padlink.code)
r.check(`game opens room ${code}`, code.length === 4)

const pad = await browser.newPage({ viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true })
watch(pad, 'pad')
await pad.goto(`${BASE}/pad?room=${code}&relay=ws://localhost:${PORT}`, { waitUntil: 'load' })
await pad.waitForFunction(() => window.__padclient && window.__padclient.seat === 1, null, { timeout: 20000 })
r.check('phone joins by code and takes seat 1', true)

await game.waitForFunction(() => window.__padlink.pads.length === 1, null, { timeout: 10000 })
r.check('host sees the pad', true)

// observe keydowns on the game page, then hold the left stick on the phone
await game.evaluate(() => { window.__k = []; window.__kUp = []; window.addEventListener('keydown', (e) => window.__k.push(e.code)); window.addEventListener('keyup', (e) => window.__kUp.push(e.code)) })
// hold the left stick on the phone via CDP touch — keyboard-route drives P1
const rect = await pad.evaluate(() => {
    const el = document.querySelector('[data-pad="MOVE"]')
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
const cdp = await pad.context().newCDPSession(pad)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x, y: rect.y }] })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x - 60, y: rect.y }] })
await pad.waitForTimeout(400)
const held = await game.evaluate(() => window.__k.includes('ArrowLeft'))
r.check(`stick-on-phone dispatches ArrowLeft to the game (${held})`, held === true)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await pad.waitForTimeout(300)
const released = await game.evaluate(() => window.__kUp && window.__kUp.includes('ArrowLeft'))
r.check('releasing the stick sends keyup:ArrowLeft to the game', released === true)

// ping readout appears on the phone
await pad.waitForTimeout(1500)
const ping = await pad.evaluate(() => (window.__padclient ? window.__padclient.rtt : 0))
r.check(`ping measured on the phone (${ping}ms)`, ping > 0 && ping < 2000)

// phone closes -> host releases the seat
await pad.close()
await game.waitForFunction(() => window.__padlink.pads.every((p) => p.seat !== 1), null, { timeout: 8000 })
r.check('phone disconnect releases the seat at the host', true)

const hard = errors.filter((e) => !/favicon|Download the React DevTools|WebSocket connection to|WebSocket is closed|Failed to load resource/i.test(e))
r.check(`zero page errors (${errors.length} raw, ${hard.length} unexplained)`, hard.length === 0)
if (hard.length) r.info('errors', hard.slice(0, 4).join(' | '))

await game.evaluate(() => window.__padlink && window.__padlink.close())
await browser.close()
relay.close()

