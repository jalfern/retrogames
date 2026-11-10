// TMDLINKDRIVE (#1880) — the TALK ME DOWN squad link proven in a REAL browser.
// Two headless contexts ride a local relay (relay/server.mjs, same code as the
// production worker) against the dev server: the host opens the bomb room, a
// phone-shaped guest joins by code, SPACE kicks a shared seed, and the boxes
// tick together over the wire. The guest's REAL ArrowRight presses turn the
// host's manual pages (the pad really crosses the relay); SPACE stamps a rule.
// Then the walkaway laws, live: guest closes => the host demotes to the CPU
// manual and wins the whole campaign solo; host closes => the guest FREEZES
// (no role inversion) and any key walks it back to the lobby; and a guest that
// closes and REOPENS the join URL seats back INTO THE LIVE RUN on a shared
// flip tick, lockstep and hash agreement resuming mid-run.
// Node owns determinism detail (tmdlinkcheck); this tier owns the DOM, real
// sockets, and two JS runtimes agreeing.
//
// npm run tmdlinkdrive   (needs `npm run dev`; DEV_PORT respected, relay on
// DRIVE_RELAY_PORT || 8792 so it never collides with other lanes' relays)

import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { launchPersistentChrome } from './lib/chromeboot.mjs'
import { startRelay } from '../relay/server.mjs'

const PORT = Number(process.env.DRIVE_RELAY_PORT || 8792)
const relay = await startRelay(PORT)
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
await requireDevServer(`${BASE}/talk-me-down`)

const r = new Report('tmdlinkdrive')
// Two tabs, two ways: full Chrome gives each tab its own context, exactly like
// two devices. On the #1622 --single-process fallback the browser ABORTS at the
// second isolated context — so there the drive rides one persistent context with
// two tabs instead. Still two independent JS runtimes over two independent
// relay sockets, which is what this tier proves.
const boot = await launch()
let closeBrowser, newTab
if (/\+sp$/.test(boot.__bootMode || 'chrome')) {
    console.log(`tmdlinkdrive: boot ${boot.__bootMode} — one persistent context, two tabs (second context aborts sp browsers)`)
    await boot.close()
    const ctx = await launchPersistentChrome({ userDataDir: `/tmp/forge/tmdlink-profile-${process.pid}`, channel: 'chrome', headless: true })
    if (ctx.pages()[0]) await ctx.pages()[0].close().catch(() => {})
    closeBrowser = () => ctx.close()
    newTab = async (opts = {}) => { const p = await ctx.newPage(); if (opts.viewport) await p.setViewportSize(opts.viewport); return p }
} else {
    closeBrowser = () => boot.close()
    newTab = (opts) => boot.newPage(opts)
}
const errors = []
const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`))
    // same noise filter as defuselinkdrive (#1819): sandboxed Chrome here cannot read
    // DNS (fonts/favicons fail by environment, not by bug)
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|ERR_NAME_NOT_RESOLVED/i.test(m.text())) errors.push(`[${tag} console] ${m.text()}`) })
}
const RELAY = `ws://localhost:${PORT}`
const PHONE = { viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true }

// Poll helpers ---------------------------------------------------------------
const probeOf = (page) => page.evaluate(() => {
    const t = window.__tmdTest
    const s = t.state(), n = t.netState()
    return {
        screen: t.screen(), tick: s ? s.tick : -1, hash: s ? s.hash : 0, seed: s ? s.seed : 0,
        bombs: s ? s.bombs : -1, done: s ? !!s.done : false, won: s ? !!s.won : false,
        manualPage: s ? s.manualPage : -1, flag: s ? s.flag : null,
        role: n ? n.role : null, code: n ? n.code : '', phase: n ? n.phase : 'off',
        miss: n ? n.miss : 0, desyncs: n ? n.desyncs : 0, frozen: n ? !!n.frozen : false,
        hostLost: n ? !!n.hostLost : false, solo: n ? !!n.solo : false,
        players: n ? n.players : 0, watch: n ? n.watch : null, dropped: n ? n.dropped : null,
    }
})
const wait = async (page, fn, arg, ms, tag) => {
    try { await page.waitForFunction(fn, arg, { timeout: ms }); return true }
    catch { throw new Error(`${tag}: wait timed out after ${ms}ms — last ${JSON.stringify(await probeOf(page).catch(() => 'dead'))}`) }
}
// Hand a box's OWN seat to the solver at the sample instant (delay 0). The
// wire, the ready gate and the hash law all keep running for real — this only
// replaces the human hands, like the node harness's recorded readPad.
const autopilot = (page, on) => page.evaluate((go) => window.__tmdTest.autopilot(go), on)

async function openRoom(tag) {
    const host = await newTab({ viewport: { width: 900, height: 700 } })
    watch(host, `${tag}-host`)
    await host.goto(`${BASE}/talk-me-down?net=host&seed=1234&relay=${RELAY}`, { waitUntil: 'load' })
    await wait(host, () => {
        const n = window.__tmdTest && window.__tmdTest.netState()
        return !!(n && n.role === 'host' && n.phase === 'waiting' && n.code.length === 4)
    }, null, 25000, `${tag} host room`)
    return { host, code: await host.evaluate(() => window.__tmdTest.netState().code) }
}
async function joinRoom(url, tag) {
    const g = await newTab(PHONE)
    watch(g, tag)
    await g.goto(url, { waitUntil: 'load' })
    await wait(g, () => {
        const n = window.__tmdTest && window.__tmdTest.netState()
        return !!(n && n.role === 'guest')
    }, null, 25000, `${tag} guest join`)
    return g
}
async function kick(host) {
    await wait(host, () => window.__tmdTest.netState().slots.length === 2, null, 15000, 'kick: roster full')
    await host.bringToFront().catch(() => {})
    await host.keyboard.press('Space')
}

// ==== A. join, kick, real remote page-turns, hash agreement ==================
const { host, code } = await openRoom('A')
r.check(`host opens room ${code} in a real browser`, code.length === 4)
const lobbyDom = await host.evaluate(() => ({
    chips: document.querySelectorAll('[data-seat]').length,
    qr: !!document.querySelector('svg[shape-rendering="crispEdges"] path'),
}))
r.check('the shared Lobby renders two seat chips + a scannable QR',
    lobbyDom.chips === 2 && lobbyDom.qr, JSON.stringify(lobbyDom))

const guest = await joinRoom(`${BASE}/talk-me-down?net=join&room=${code}&relay=${RELAY}`, 'A-guest')
// room truth, not chip paint: liveSlots() includes yourself, so >=1 is
// vacuous — wait until the RELAY roster shows both seats before the kick,
// else startNetMatch seats players=2 while watchSeats stays empty (run 2's
// one-way wire).
await wait(host, () => window.__tmdTest.netState().slots.length === 2, null, 15000, 'A relay roster seats both')
r.check('phone joins by code and the relay seats both', true)

await kick(host)
await Promise.all([
    wait(host, () => window.__tmdTest.netState().phase === 'racing' && window.__tmdTest.screen() === 'play', null, 15000, 'A host racing'),
    wait(guest, () => window.__tmdTest.netState().phase === 'racing' && window.__tmdTest.screen() === 'play', null, 15000, 'A guest racing'),
])
r.check('SPACE starts the run and BOTH boxes hit play', true)
const seeds = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__tmdTest.state().seed)))
r.check('the go carried the pinned seed to both boxes', seeds[0] === seeds[1] && seeds[0] === 1234, JSON.stringify(seeds))
let beat = await Promise.all([host, guest].map(probeOf))
r.check('both boxes run the squad (players=2)', beat.every((b) => b.players === 2), JSON.stringify(beat.map((b) => b.players)))

// real ArrowRight held on the phone turns the HOST's manual pages — the pad
// really crossed the relay and drove the twin sim.
await guest.keyboard.down('ArrowRight')
try {
    await wait(host, () => {
        const s = window.__tmdTest.state()
        window.__pages = window.__pages || new Set([s.manualPage])
        window.__pages.add(s.manualPage)
        return window.__pages.size >= 3
    }, null, 12000, 'A host manual pages')
    r.check('phone ArrowRights turn the manual pages on the HOST box', true)
} catch (e) {
    r.check('phone ArrowRights turn the manual pages on the HOST box', false, e.message)
}
await guest.keyboard.up('ArrowRight')
await guest.keyboard.press('Space')
try {
    await wait(host, () => !!window.__tmdTest.state().flag, null, 8000, 'A host flag')
    r.check('phone SPACE stamps a rule flag the host sees', true)
} catch (e) {
    r.check('phone SPACE stamps a rule flag the host sees', false, e.message)
}
// Hash truth over real sockets: the protocol itself compares the whole-sim
// hash at every boundary (HASH_EVERY) between the two runtimes — desyncs===0
// after several boundaries means the twins agreed every single time. Eval-side
// tick sampling sits a tick or two apart by CDP latency, so drift <= 2.
await Promise.all([
    wait(host, () => window.__tmdTest.state().tick >= 240, null, 30000, 'A host 240'),
    wait(guest, () => window.__tmdTest.state().tick >= 240, null, 30000, 'A guest 240'),
])
const stampBeat = await Promise.all([host, guest].map(probeOf))
r.check('whole-sim hash matched at every boundary across two runtimes (4 hashes, 0 desyncs)',
    stampBeat.every((b) => b.desyncs === 0 && !b.solo && !b.frozen) && Math.abs(stampBeat[0].tick - stampBeat[1].tick) <= 4,
    JSON.stringify(stampBeat.map((b) => [b.tick, b.desyncs])))

// ==== B. guest walks away; the host wins the WHOLE campaign solo ============
// The phone holds its arrow down before vanishing so the pad stream is live at
// the cut. After the demote the host defuses alone (CPU manual voices orders;
// solvePad answers without it) through all five bombs.
await guest.keyboard.down('ArrowRight')
await autopilot(host, true)
const tickCut = await host.evaluate(() => window.__tmdTest.state().tick)
await guest.close()
try {
    await wait(host, (t) => window.__tmdTest.netState().solo === true
        && window.__tmdTest.state().tick > t + 60, tickCut, 20000, 'B host solo')
} catch { /* gates below still score the finish */ }
let soloWon = false
try {
    await wait(host, () => window.__tmdTest.state().done === true, null, 90000, 'B host finished')
    const fin = await probeOf(host)
    soloWon = fin.won === true && fin.bombs >= 5 && fin.players === 1 && fin.desyncs === 0
    r.check('guest walkaway demotes to the CPU manual and the host WINS the campaign solo',
        soloWon, JSON.stringify(fin))
} catch (e) {
    r.check('guest walkaway demotes to the CPU manual and the host WINS the campaign solo', false, e.message)
}
await autopilot(host, false)
await host.close()

// ==== C. host vanishes; the guest FREEZES, any key returns it to lobby ======
const c = await openRoom('C')
const guestC = await joinRoom(`${BASE}/talk-me-down?net=join&room=${c.code}&relay=${RELAY}`, 'C-guest')
await kick(c.host)
await wait(guestC, () => window.__tmdTest.screen() === 'play', null, 15000, 'C guest play')
await autopilot(c.host, true)
await guestC.keyboard.down('ArrowRight')
await wait(guestC, () => window.__tmdTest.state().tick > 30, null, 15000, 'C ticking')
await c.host.close()
await wait(guestC, () => window.__tmdTest.netState().hostLost === true, null, 20000, 'C hostLost')
const frozenTick = await guestC.evaluate(() => window.__tmdTest.state().tick)
await new Promise((res) => setTimeout(res, 1200)) // let any rogue ticking show
const frozenBeat = await probeOf(guestC)
r.check('host gone: the guest FREEZES (no role inversion, sim parked)',
    frozenBeat.hostLost && frozenBeat.tick <= frozenTick + 1 && frozenBeat.players === 2,
    JSON.stringify({ ...frozenBeat, before: frozenTick }))
await guestC.keyboard.press('ArrowLeft')
let backToLobby = false
try {
    await wait(guestC, () => window.__tmdTest.screen() === 'attract', null, 8000, 'C back to lobby')
    backToLobby = true
} catch { /* gate below */ }
r.check('any key walks the frozen guest back to the lobby', backToLobby)
await guestC.close()

// ==== D. guest closes and REOPENS: seated back INTO THE LIVE RUN =============
const d = await openRoom('D')
const guestD = await joinRoom(`${BASE}/talk-me-down?net=join&room=${d.code}&relay=${RELAY}`, 'D-guest')
await kick(d.host)
await wait(guestD, () => window.__tmdTest.screen() === 'play', null, 15000, 'D guest play')
await autopilot(d.host, true) // hands on early so the run is warm...
await autopilot(guestD, true) // the absent-human seat streams until the cut
// cut while bomb 1 is still LIVE: demote lands ~0.5 s after the close, the
// reseat waits up to 3 s more, and the returner reload needs ~1.5 s — all
// inside bomb 1's fuse, so the campaign stays alive for the squad gates.
await wait(d.host, () => window.__tmdTest.state().tick >= 20, null, 25000, 'D warm')
await autopilot(d.host, false)
await guestD.close()
let demoted = null
let demoteErr = ''
try {
    await wait(d.host, () => !!(window.__tmdTest.netState() && window.__tmdTest.netState().solo === true), null, 8000, 'D demote')
    demoted = await probeOf(d.host)
} catch (e) { demoteErr = e.message }
r.check('the seat demotes while the returner is away',
    !!demoted && demoted.solo && demoted.players === 1,
    demoted ? JSON.stringify({ solo: demoted.solo, players: demoted.players }) : demoteErr)
const guestD2 = await joinRoom(`${BASE}/talk-me-down?net=join&room=${d.code}&relay=${RELAY}`, 'D-guest2')
await autopilot(guestD2, true) // the returner streams from its first frame
try {
    await wait(guestD2, () => window.__tmdTest.screen() === 'play' && window.__tmdTest.state().tick >= 15, null, 25000, 'D2 live seat')
    r.check('the returner sits INTO THE LIVE RUN (screen play, tick rebuilt, no fresh go)', true)
} catch (e) {
    r.check('the returner sits INTO THE LIVE RUN (screen play, tick rebuilt, no fresh go)', false, e.message)
}
// the shared flip: both boxes cross players 1->2 on the same stamp
let reseated = false
try {
    await Promise.all([
        wait(d.host, () => window.__tmdTest.netState().players === 2 && window.__tmdTest.netState().solo === false, null, 25000, 'D host flip'),
        wait(guestD2, () => window.__tmdTest.netState().players === 2, null, 25000, 'D2 flip'),
    ])
    reseated = true
} catch (e) { /* gate below */ }
r.check('the players flip lands on BOTH boxes: host squad whole, returner drives the manual', reseated)
await autopilot(d.host, true) // now the SQUAD (not a solo host) finishes the run
await autopilot(guestD2, true)
// lockstep resumes: hunt a healthy same-window sample across the two runtimes
let beat2 = null
for (let i = 0; i < 40 && !(beat2 && Math.abs(beat2[0].tick - beat2[1].tick) <= 4 && (beat2[0].done || beat2[0].tick >= 40)); i++) {
    await new Promise((res) => setTimeout(res, 100))
    beat2 = await Promise.all([d.host, guestD2].map(probeOf))
}
r.check('both boxes tick together after the reseat (drift within sampling)',
    !!beat2 && Math.abs(beat2[0].tick - beat2[1].tick) <= 4 && (beat2[0].done || beat2[0].tick >= 40),
    JSON.stringify(beat2 && beat2.map((b) => [b.tick, b.done])))
r.check('no desync was filed across the whole walkaway-and-return',
    beat2.every((b) => b.desyncs === 0), JSON.stringify(beat2.map((b) => b.desyncs)))
if (beat2 && beat2[0].tick === beat2[1].tick) {
    r.check('same tick => same whole-sim hash after the reseat',
        beat2[0].hash === beat2[1].hash && beat2[0].players === 2 && beat2[1].players === 2, JSON.stringify(beat2))
} else {
    r.check('both boxes run coop after the flip (players=2 each side)',
        beat2.every((b) => b.players === 2), JSON.stringify(beat2.map((b) => b.players)))
}
// and the re-seated squad can still finish the job
try {
    await wait(d.host, () => window.__tmdTest.state().done === true, null, 90000, 'D squad finished')
    const finD = await probeOf(d.host)
    r.check('the re-seated squad clears the campaign together', finD.won === true && finD.players === 2, JSON.stringify(finD))
} catch (e) {
    r.check('the re-seated squad clears the campaign together', false, e.message)
}
await autopilot(d.host, false).catch(() => {})
await autopilot(guestD2, false).catch(() => {})
await d.host.close().catch(() => {})
await guestD2.close().catch(() => {})

// ==== E. phone manual seat (#1888) =============================================
// The guest is the READER; on a touch-shaped join the page must take the
// 400px bomb bay at bigger type, not hide in the 216px right rail. The
// ?touch=1 / ?touch=0 overrides make both layouts deterministic in every
// boot mode (the persistent-context path cannot emulate hasTouch).
const viewPix = (page) => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)
    return { bay: px(200, 20), bayR: px(390, 20), rail: px(520, 100), lcd: px(390, 322) }
})
const near = (a, b) => Math.abs(a[0] - b[0]) <= 6 && Math.abs(a[1] - b[1]) <= 6 && Math.abs(a[2] - b[2]) <= 6
const CREAM = [239, 230, 200], PLATE = [23, 25, 29], LCD = [14, 36, 22]
const e = await openRoom('E')
const guestE = await joinRoom(`${BASE}/talk-me-down?net=join&room=${e.code}&relay=${RELAY}&touch=1`, 'E-guest')
await kick(e.host)
await wait(guestE, () => window.__tmdTest.screen() === 'play', null, 15000, 'E guest play')
const widePix = await viewPix(guestE)
r.check('phone guest: the rulebook takes the bomb bay (cream page spans x200..x390)',
    near(widePix.bay, CREAM) && near(widePix.bayR, CREAM), JSON.stringify(widePix))
r.check('phone guest: the defuser plate shrinks to the right rail',
    near(widePix.rail, PLATE), JSON.stringify(widePix))
r.check('phone guest: the partner LCD keeps its band under the page',
    near(widePix.lcd, LCD), JSON.stringify(widePix))
await guestE.close().catch(() => {})
await e.host.close().catch(() => {})
const f = await openRoom('F')
const guestF = await joinRoom(`${BASE}/talk-me-down?net=join&room=${f.code}&relay=${RELAY}&touch=0`, 'F-guest')
await kick(f.host)
await wait(guestF, () => window.__tmdTest.screen() === 'play', null, 15000, 'F guest play')
const narrowPix = await viewPix(guestF)
r.check('desktop guest keeps the narrow rail (bay plate-dark, page in the rail)',
    near(narrowPix.bay, PLATE) && near(narrowPix.rail, CREAM), JSON.stringify(narrowPix))
await guestF.close().catch(() => {})
await f.host.close().catch(() => {})

r.check('zero page errors across the browsers', errors.length === 0, errors.slice(0, 3).join(' | '))

await closeBrowser()
await relay.close()
process.exit(r.failed ? 1 : 0)
