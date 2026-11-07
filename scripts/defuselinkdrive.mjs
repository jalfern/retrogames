// DEFUSELINKDRIVE (#1819) — the BOMB DEFUSE lobby proven in a REAL browser.
// Two headless contexts ride a local relay (relay/server.mjs, same code as the
// production worker) against the dev server: the host opens the crew room, a
// phone-shaped guest joins by code, SPACE kicks a shared seed, real Space
// presses on BOTH boxes turn the SYNC keys, the boxes tick together with zero
// desync flags, and when the guest closes the tab the host demotes to the CPU
// partner and keeps defusing. Node owns determinism detail (defuselinkcheck);
// this tier owns the DOM, real sockets, and two JS runtimes agreeing.
//
// npm run defuselinkdrive   (needs `npm run dev`; DEV_PORT respected, relay on
// DRIVE_RELAY_PORT || 8792 so it never collides with other lanes' relays)

import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const PORT = Number(process.env.DRIVE_RELAY_PORT || 8792)
const relay = startRelay(PORT)
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
await requireDevServer(`${BASE}/bomb-defuse`)

const r = new Report('defuselinkdrive')
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
await host.goto(`${BASE}/bomb-defuse?net=host&seed=4242&relay=${RELAY}`, { waitUntil: 'load' })
await host.waitForFunction(() => {
    const n = window.__bdTest && window.__bdTest.net()
    return !!(n && n.role === 'host' && n.phase === 'waiting' && n.code.length === 4)
}, null, { timeout: 25000 }) // StrictMode remounts the lobby; the live code settles on mount 2
const code = await host.evaluate(() => window.__bdTest.net().code)
r.check(`host opens room ${code} in a real browser`, code.length === 4)
const lobbyDom = await host.evaluate(() => ({
    chips: document.querySelectorAll('[data-seat]').length,
    qr: !!document.querySelector('svg[shape-rendering="crispEdges"] path'),
}))
r.check('the shared Lobby renders two seat chips + a scannable QR',
    lobbyDom.chips === 2 && lobbyDom.qr, JSON.stringify(lobbyDom))

// ---- phone-shaped guest joins by code ----------------------------------------
const guest = await browser.newPage({ viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true })
watch(guest, 'guest')
await guest.goto(`${BASE}/bomb-defuse?net=join&room=${code}&relay=${RELAY}`, { waitUntil: 'load' })
await guest.waitForFunction(() => {
    const n = window.__bdTest && window.__bdTest.net()
    return !!(n && n.role === 'guest' && n.phase === 'waiting' && n.seat === 1)
}, null, { timeout: 25000 })
r.check('phone joins by code and takes seat 2', true)
await host.waitForFunction(() => document.querySelectorAll('[data-seat][data-joined]').length >= 1,
    null, { timeout: 15000 })
r.check('the guest seat shows as joined on the host', true)

// ---- host kicks with a real keystroke; both boxes go racing ------------------
await host.bringToFront()
await host.keyboard.press('Space')
const go = async (page, tag) => page.waitForFunction(() => window.__bdTest.net().phase === 'racing',
    null, { timeout: 15000 }).then(() => true, () => { throw new Error(`${tag} never saw racing`) })
await Promise.all([go(host, 'host'), go(guest, 'guest')])
r.check('SPACE starts the run and BOTH boxes see racing', true)
r.check('the go carried the pinned seed to both boxes',
    (await host.evaluate(() => window.__bdTest.state().seed)) === 4242
    && (await guest.evaluate(() => window.__bdTest.state().seed)) === 4242)

// ---- real Space presses on both boxes turn the SYNC keys ---------------------
await host.waitForFunction(() => window.__bdTest.state().tick > 30, null, { timeout: 15000 })
await host.keyboard.press('Space')
await new Promise((res) => setTimeout(res, 250))
await guest.keyboard.press('Space')
await host.waitForFunction(() => window.__bdTest.state().step > 0 || window.__bdTest.state().score >= 50,
    null, { timeout: 15000 })
r.check('two real Space presses (one per box) turn the SYNC keys — step 1 clears', true)

// ---- lockstep health over real sockets -----------------------------------------
await host.waitForFunction(() => window.__bdTest.state().tick > 180, null, { timeout: 20000 })
await guest.waitForFunction(() => window.__bdTest.state().tick > 180, null, { timeout: 20000 })
const beat = await Promise.all([host, guest].map((p) => p.evaluate(() => {
    const s = window.__bdTest.state()
    const n = window.__bdTest.net()
    return { tick: s.tick, hash: s.hash, fuse: s.fuse, score: s.score, desyncs: n.desyncs, stalls: n.stalls, solo: n.solo }
})))
r.check('both boxes ticked past 180', beat.every((b) => b.tick > 180), JSON.stringify(beat.map((b) => b.tick)))
r.check('no desync flagged in either browser', beat.every((b) => b.desyncs === 0), JSON.stringify(beat.map((b) => b.desyncs)))
r.check('nobody demoted yet', beat.every((b) => !b.solo), JSON.stringify(beat.map((b) => b.solo)))
if (beat[0].tick === beat[1].tick) {
    r.check('same tick => same whole-sim hash across two runtimes',
        beat[0].hash === beat[1].hash && beat[0].fuse === beat[1].fuse, JSON.stringify(beat))
} else {
    r.check('boxes sit at most one tick apart (the ready gate)',
        Math.abs(beat[0].tick - beat[1].tick) <= 1, JSON.stringify(beat.map((b) => b.tick)))
}

// ---- guest walks away; the host keeps defusing ------------------------------
const tickBefore = await host.evaluate(() => window.__bdTest.state().tick)
await guest.close()
await host.waitForFunction((t) => window.__bdTest.state().tick > t + 60, tickBefore, { timeout: 15000 })
const afterDrop = await host.evaluate(() => {
    const n = window.__bdTest.net()
    return { solo: n.solo, watch: n.watch.length }
})
r.check('host keeps defusing after the guest closes', true)
r.check('the lost seat demotes to the CPU partner on the host',
    afterDrop.solo === true && afterDrop.watch === 0, JSON.stringify(afterDrop))

r.check('zero page errors across both browsers', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
await relay.close()
process.exit(r.failed ? 1 : 0)
