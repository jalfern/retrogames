// SOSLINKDRIVE (#1416 gap 7) — the SOS lobby proven in a REAL browser, not just
// in Node. Two headless contexts ride the real relay (relay/server.mjs) against
// the dev server: a host page opens the room, a phone-shaped guest joins by the
// code, both watch the roster fill, the host starts the shift, and the kitchen
// cooks in lockstep with zero page errors. The Node proof (soslinkcheck) owns
// determinism detail; this tier owns what Node cannot see: the DOM the player
// actually gets (seat chips, QR, the #1416 gap-4 neon-diner theming), real key
// events through the real window, and two separate JS runtimes agreeing.
//
// npm run soslinkdrive   (needs `npm run dev`; DEV_PORT respected, relay on
// DRIVE_RELAY_PORT || 8791 so it never collides with padlinkdrive's 8789)

import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const PORT = Number(process.env.DRIVE_RELAY_PORT || 8791)
const relay = startRelay(PORT)
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
await requireDevServer(`${BASE}/short-order-shout`)

const r = new Report('soslinkdrive')
const browser = await launch()
const errors = []
const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag} console] ${m.text()}`) })
}
const RELAY = `ws://localhost:${PORT}`

// ---- host opens a room -------------------------------------------------------
const host = await browser.newPage({ viewport: { width: 900, height: 700 } })
watch(host, 'host')
await host.goto(`${BASE}/short-order-shout?net=host&relay=${RELAY}`, { waitUntil: 'load' })
await host.waitForFunction(() => {
    const n = window.__sosTest && window.__sosTest.net()
    return !!(n && n.role === 'host' && n.code.length === 4)
}, null, { timeout: 20000 })
const code = await host.evaluate(() => window.__sosTest.net().code)
r.check(`host opens room ${code} in a real browser`, code.length === 4)

// gap-4 theming: the lobby must wear the cabinet, not the placeholder pink.
// #f0ead8 = PAL.paper (lobby text), QR = PAL.ink modules in a PAL.chrome frame.
const themed = await host.evaluate(() => {
    const root = document.querySelector('.font-mono.absolute.inset-0')
    const ink = (el) => el ? getComputedStyle(el).color : ''
    const paper = root && [...root.querySelectorAll('p,div')].some((el) => ink(el) === 'rgb(240, 234, 216)')
    const svg = document.querySelector('svg[shape-rendering="crispEdges"] path')
    const frame = svg ? svg.closest('div[style]') : null
    const border = frame ? getComputedStyle(frame).borderTopColor : ''
    return {
        paper: !!paper,
        qrInk: svg ? svg.getAttribute('fill') : '',
        qrFrame: border,
        chips: document.querySelectorAll('[data-seat]').length,
    }
})
r.check('lobby text wears the cabinet paper #f0ead8', themed.paper, JSON.stringify(themed))
r.check('QR modules wear ink #181018', themed.qrInk === '#181018', themed.qrInk)
r.check('QR wears the chrome frame #d8e4ec', themed.qrFrame === 'rgb(216, 228, 236)', themed.qrFrame)
r.check('four seat chips render in the lobby', themed.chips === 4, `${themed.chips}`)

// ---- phone-shaped guest joins by code ----------------------------------------
const guest = await browser.newPage({ viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true })
watch(guest, 'guest')
await guest.goto(`${BASE}/short-order-shout?net=join&room=${code}&relay=${RELAY}`, { waitUntil: 'load' })
await guest.waitForFunction(() => {
    const n = window.__sosTest && window.__sosTest.net()
    return !!(n && n.role === 'guest' && n.phase === 'waiting' && n.slot === 1)
}, null, { timeout: 20000 })
r.check('phone joins by code and takes seat 2', true)

await host.waitForFunction(() => {
    const n = window.__sosTest.net()
    return n.humans.filter((h) => h >= 0).length >= 2
}, null, { timeout: 15000 })
const roster = await host.evaluate(() => {
    const n = window.__sosTest.net()
    return { humans: n.humans.slice(), chipKinds: [...document.querySelectorAll('[data-seat]')].map((el) => el.textContent) }
})
r.check('host roster shows both humans', roster.humans.filter((h) => h >= 0).length >= 2, JSON.stringify(roster.humans))
r.check('chips label seats HOST and COOK 2', roster.chipKinds.some((t) => t.includes('HOST')) && roster.chipKinds.some((t) => t.includes('COOK 2')), JSON.stringify(roster.chipKinds))

// ---- host starts with a real keystroke; both kitchens cook ------------------
await host.bringToFront()
await host.keyboard.press('Space')
const go = async (page, tag) => page.waitForFunction(() => {
    const n = window.__sosTest.net()
    return n.phase === 'racing'
}, null, { timeout: 15000 }).then(() => true, () => { throw new Error(`${tag} never saw racing`) })
await Promise.all([go(host, 'host'), go(guest, 'guest')])
r.check('SPACE starts the shift and BOTH boxes see racing', true)

// Lockstep health the engine proves for us: hashes are compared every tick by
// the net layer itself — a divergence raises the desync notice. Sample after a
// couple seconds of real cooking: ticks advanced, notice silent, nobody dropped.
await host.waitForFunction(() => window.__sosTest.state().tick > 120, null, { timeout: 20000 })
await guest.waitForFunction(() => window.__sosTest.state().tick > 120, null, { timeout: 20000 })
const beat = await Promise.all([host, guest].map((p) => p.evaluate(() => {
    const s = window.__sosTest.state()
    const n = window.__sosTest.net()
    return { tick: s.tick, hash: window.__sosTest.hash(), notice: window.__sosTest.notice(), dropped: n.dropped.slice(), pips: n.rtt.filter((p) => typeof p === 'number' && p > 0).length }
})))
r.check('both kitchens ticked past 120', beat.every((b) => b.tick > 120), JSON.stringify(beat.map((b) => b.tick)))
r.check('no desync notice in either browser', beat.every((b) => !b.notice), JSON.stringify(beat.map((b) => b.notice)))
r.check('nobody dropped during the opening minutes', beat.every((b) => b.dropped.length === 0), JSON.stringify(beat.map((b) => b.dropped)))
r.check('latency pips populated on both boxes (#1416 gap 3 in a real browser)', beat.every((b) => b.pips > 0), JSON.stringify(beat.map((b) => b.pips)))

// ---- guest walks away; the host keeps cooking (drop UX over real sockets) ---
const tickBefore = await host.evaluate(() => window.__sosTest.state().tick)
await guest.close()
await host.waitForFunction((t) => window.__sosTest.state().tick > t + 60, tickBefore, { timeout: 15000 })
r.check('host keeps cooking after the guest closes', true)

r.check('zero page errors across both browsers', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
await relay.close()
process.exit(r.failed ? 1 : 0)
