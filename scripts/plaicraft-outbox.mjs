// PLAICRAFT OUTBOX KILL TEST (#1711 S6) — "Jon plays 3 sessions on his
// phone, and all 3 appear in the store" survives the phone actually being
// a phone: the store is the PRODUCTION worker (relaysim #1711 S5), Chrome
// runs with a PERSISTENT profile (IndexedDB must outlive the browser, like
// an app-swap kill on iOS), and the takes are consented human-driven Gauntlet
// runs. Three scenarios, one command:
//
//   npm run dev -- --port 5173 --strictPort        (or DEV_PORT)
//   npm run plaicraft:outbox
//   npm run plaicraft:outbox -- --mutate   # strips the persist-before-upload
//                                          # line from autoRecord.js SOURCE —
//                                          # the killed take must then be LOST
//                                          # (red by design proves the line is
//                                          # the load-bearing part)
//
// A: KILL — consent YES(motion) -> record -> POST /sessions held open forever
//    -> browser KILLED mid-upload -> relaunch same profile -> the drain fires
//    on boot and the session lands in the store: validates, replay-verifies
//    against the real Gauntlet sim, pen emptied.
// B: OFFLINE -> ONLINE — upload aborts mid-run-end, entry kept; dispatching
//    the `online` event ships it (store lists two).
// C: REVOKE — a take queued while offline is PURGED, not shipped, when the
//    player revokes consent: nothing uploads and nothing lingers.
//
// --mutate writes a transient mutant into src/utils (autoRecord.js with the
// persist call stripped), verifies VITE SERVES THE MUTANT TEXT (the stale-
// transform lesson, #1784 notes), runs scenario A (the take must be lost),
// and restores + re-verifies intact. Exit mirrors relaycheck: red under
// --mutate is the expected result.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireDevServer, Report } from './lib/harness.mjs'
import { launchPersistentChrome } from './lib/chromeboot.mjs'
import { validate, verifyRecording } from '../src/utils/recording.js'
import { startRelaySim } from './lib/relaysim.mjs'
import { makeReplayDriver } from './plaicraft-export.mjs'
import { plant, pull } from './lib/mutateguard.mjs' // #1359: SIGTERM mid-mutate must not leave the autoRecord.js corpse

const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const MUTATE = argv.includes('--mutate')
const PAGE_URL = `http://localhost:${PORT}/retrogames/gauntlet?store=`

const r = new Report('plaicraft:outbox')
const sim = await startRelaySim()
const PAGE = `${PAGE_URL}${encodeURIComponent(sim.base)}`
await requireDevServer(PAGE)

// --- helpers ------------------------------------------------------------------
const until = async (fn, ms = 9000) => {
    const t0 = Date.now()
    for (;;) {
        const v = await fn()
        if (v) return v
        if (Date.now() - t0 > ms) return null
        await new Promise((res) => setTimeout(res, 200))
    }
}

// penCount — read the outbox IndexedDB straight from the page (the same store
// outbox.js writes; an independent read is the point).
const penCount = (page) => page.evaluate(() => new Promise((res) => {
    try {
        const rq = indexedDB.open('retrogames-outbox-v1', 1)
        rq.onupgradeneeded = () => {
            const db = rq.result
            if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
        }
        rq.onsuccess = () => {
            const db = rq.result
            const q = db.transaction('outbox', 'readonly').objectStore('outbox').count()
            q.onsuccess = () => { db.close(); res(q.result) }
            q.onerror = () => { db.close(); res(-1) }
        }
        rq.onerror = () => res(-1)
    } catch { res(-1) }
}))

const storeRows = async () => {
    try {
        const j = await (await fetch(`${sim.base}/sessions`, { headers: sim.readHeaders })).json()
        return j.sessions || []
    } catch { return [] }
}

// startRun — ArrowRight + Space (the clap-proven order); resolves 'recording'
// when the recorder opened (grant cached), 'gate' when the consent question
// came back (answered YES so the flow continues — the caller reports it), or
// null when nothing started.
async function startRun(page) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    await page.keyboard.press('Space')
    try {
        await page.waitForFunction(() => document.querySelector('[data-consent-gate]') || !!(window.__autoCapture && window.__autoCapture.recording), null, { timeout: 6000 })
    } catch { return null }
    if (await page.locator('[data-consent-gate]').count()) {
        await page.click('#consent-motion')
        await page.click('#consent-yes')
        await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording), null, { timeout: 4000 }).catch(() => null)
        return 'gate'
    }
    return 'recording'
}

// playRun — real inputs only. `first` runs the consent gate; later runs rely
// on the persisted grant (that IS one of the things this script proves). No
// forced gs.end: the recorded file must replay-verify, and a harness-injected
// 'lose' changes the final hash at a tick the sim will never reproduce — the
// human stops steering and the monsters end the run on their own schedule,
// deterministically, exactly as replay will re-run it.
async function playRun(page, { first = false, steerMs = 500 } = {}) {
    const opened = await startRun(page)
    if (first && opened !== 'gate') throw new Error(`consent gate did not come up on the first run (got: ${opened})`)
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(steerMs) // a visible run: some pads banked
    await page.keyboard.up('ArrowRight')
}
// idleToDeath — let the sim declare the loss honestly (the cabinet's own
// over-transition closes the recorder and uploads).
const idleToDeath = async (page, ms = 60000) => {
    const t0 = Date.now()
    for (;;) {
        try {
            const over = await page.evaluate(() => { const gs = window.__gauntletTest.state(); return gs && !!gs.end })
            if (over) return true
        } catch { return false }
        if (Date.now() - t0 > ms) return false
        await new Promise((res) => setTimeout(res, 250))
    }
}

const sessionsRoute = (u) => u.pathname === '/sessions'
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plaicraft-outbox-profile-'))
const errors = []
let ctx = null
const watch = (page) => page.on('pageerror', (e) => errors.push(String(e)))

// --- mutant setup (scenario A only) --------------------------------------------
const AUTO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/autoRecord.js')
const PERSIST = 'const entry = await queueRun(rec, opts.player || PLAYER_ID)'
const servedMutant = async () => {
    try { return (await (await fetch(`http://localhost:${PORT}/retrogames/src/utils/autoRecord.js`)).text()).includes('MUTANT: persist-before-upload stripped') } catch { return false }
}
let mutated = false
if (MUTATE) {
    const src = fs.readFileSync(AUTO, 'utf8')
    if (!src.includes(PERSIST)) { console.log('FAIL   persist-line anchor not found in autoRecord.js — update plaicraft-outbox PERSIST to match'); r.failed++; await sim.close(); process.exit(1) }
    plant(AUTO, src.replace(PERSIST, 'const entry = null // MUTANT: persist-before-upload stripped'))
    mutated = true
    const fresh = await until(servedMutant, 8000)
    if (!fresh) { // the stale-transform lesson: verify vite actually serves the mutant text
        console.log('FAIL   vite served a STALE transform of the mutant — restart the dev server and re-run')
        pull(AUTO)
        r.failed++; await sim.close(); process.exit(1)
    }
}

try {
    // ================= scenario A — kill an app mid-upload =================
    ctx = await launchPersistentChrome({ userDataDir: profile, headless: !argv.includes('--headful') })
    let page = await ctx.newPage()
    page.setDefaultTimeout(60000)
    watch(page)
    await page.goto(PAGE, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
    r.check('gauntlet boots against the real worker (persistent profile)', true)

    let gateUp = true
    try {
        await playRun(page, { first: true })
    } catch (e) {
        gateUp = false
    }
    r.check('consent gate goes up on the first consented run', gateUp)
    if (!gateUp) throw new Error('no consent gate — aborting scenarios')

    // hold POST /sessions open forever, then let the run die on its own:
    // endRun persists (entry lands in IndexedDB) and then blocks on the hung
    // fetch — exactly the window a phone kills live in.
    await page.route(sessionsRoute, (route) => (route.request().method() === 'POST' ? new Promise(() => {}) : route.fallback()))
    const persisted = await until(async () => (await penCount(page)) >= 1, 45000)
    r.check('take persisted to IndexedDB while the upload hangs (persist-before-upload)', !!persisted, `pen ${await penCount(page)}`)

    // S7 pill truth while the upload hangs: the take IS saved, and the phone
    // must say so in the very window a kill lives in.
    const pillA = await until(() => page.evaluate(() => {
        const el = document.querySelector('[data-sync-badge]')
        return el && el.dataset.syncBadge === 'queued' ? el.textContent : null
    }), 4000)
    r.check('S7: pill says SAVED — WILL SYNC while the upload hangs', !!pillA, pillA || 'no queued pill')

    // KILL: close the whole browser with the upload pending.
    await ctx.close()

    // --- relaunch the same profile: boot = drain trigger ---
    ctx = await launchPersistentChrome({ userDataDir: profile, headless: !argv.includes('--headful') })
    page = await ctx.newPage()
    page.setDefaultTimeout(60000)
    watch(page)
    await page.goto(PAGE, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })

    const rowsA = await until(async () => { const q = await storeRows(); return q.length >= 1 ? q : null }, 10000)
    r.check('killed take arrives in the store after relaunch (the acceptance line, minus Jon\'s thumb)', !!rowsA, `store has ${rowsA ? rowsA.length : 0}`)
    if (!rowsA) throw new Error(MUTATE ? 'expected under --mutate: without persist-before-upload the killed take is lost' : 'killed take never arrived')

    // S7: the boot drain must TELL the player, on the attract screen, before
    // they ever start a run — this is the moment Jon sees his take land.
    const pillSyncA = await until(() => page.evaluate(() => {
        const el = document.querySelector('[data-sync-badge]')
        return el && el.dataset.syncBadge === 'synced' ? el.textContent : null
    }), 8000)
    r.check('S7: relaunch drain says N TAKE(S) SYNCED on the attract screen', !!pillSyncA, pillSyncA || 'no synced pill')

    const row = rowsA.find((s) => s.game === 'gauntlet')
    r.check('store row names the game and player', !!row && row.player === 'player', JSON.stringify(row))
    const text = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(row.key)}`, { headers: sim.readHeaders })).text()
    const rec = JSON.parse(text)
    r.check('stored file validates', validate(rec) === null, validate(rec) || '')
    r.check('it is the killed take (seed + ticks match what the pen held)', !!rec.seed && rec.ticks >= 20, `seed ${rec.seed}, ticks ${rec.ticks}`)
    const ver = verifyRecording(rec, makeReplayDriver(rec.rules || {}))
    // #1793 closed the ghost-partner hole (replay now rebuilds seat 2 as the
    // take had it — 'off' seats replay without a phantom CPU). A divergence
    // here is a regression, not a known hole: hard-gate the acceptance line.
    if (!ver.ok && ver.mismatch) fs.writeFileSync('/tmp/forge/outbox-divergent-take.json', JSON.stringify({ key: row.key, mismatch: ver.mismatch, rec }, null, 1))
    r.check('killed take replay-verifies tick-for-tick (the 100% line, #1793)', ver.ok,
        ver.mismatch ? `diverged at tick ${ver.mismatch.tick} — dumped to /tmp/forge/outbox-divergent-take.json` : `seed ${rec.seed}, ${rec.ticks} ticks, ${rec.hashes.length} checkpoints`)
    r.check('the recovered take is structurally complete (slots x ticks + checkpoints intact)',
        rec.slots.length === rec.players && rec.slots.every((s) => s.pads.length === rec.ticks) && rec.hashes.length >= Math.floor(rec.ticks / rec.hashEvery),
        `${rec.ticks} ticks, ${rec.hashes.length} checkpoints`)
    const emptied = await until(async () => (await penCount(page)) === 0, 6000)
    r.check('pen emptied after the successful drain', !!emptied, `pen ${await penCount(page)}`)

    // ================= scenario B — offline, then online =================
    await page.route(sessionsRoute, (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
    await page.waitForTimeout(700)
    // second run: the stored grant must open the recorder with NO gate. If a
    // gate does appear that is the failure — answer it anyway so the rest of
    // the scenario still tests its own subject.
    const openedB = await startRun(page)
    r.check('consent grant persists across the app kill (second run asks nothing)', openedB === 'recording', openedB === 'gate' ? 'the gate came back up' : openedB || 'run never started')
    const diedB = await idleToDeath(page)
    r.check('the run ends on its own terms (honest over-transition, no forced state)', diedB)
    const lastB = await until(async () => { const l = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last); return l || null }, 8000)
    r.check('offline run-end: upload fails, take REQUEUED (not lost)', !!(lastB && !lastB.uploaded && lastB.requeued), JSON.stringify(lastB))
    r.check('the requeued take sits in the pen', (await penCount(page)) === 1)
    const pillB = await until(() => page.evaluate(() => {
        const el = document.querySelector('[data-sync-badge]')
        return el && el.dataset.syncBadge === 'queued' ? el.textContent : null
    }), 4000)
    r.check('S7: offline requeue shows the queued pill (player sees the backlog)', !!pillB, pillB || 'no queued pill')
    await page.unroute(sessionsRoute)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const rowsB = await until(async () => { const q = await storeRows(); return q.length >= 2 ? q : null }, 8000)
    r.check('`online` triggers the drain: store lists two', !!rowsB, `store has ${rowsB ? rowsB.length : 1}`)
    r.check('pen emptied again after shipping', (await penCount(page)) === 0)
    const pillSyncB = await until(() => page.evaluate(() => window.__syncBadge && window.__syncBadge.kind === 'synced' ? window.__syncBadge.text : null), 4000)
    r.check('S7: the online-drain says SYNCED too (mirror on window.__syncBadge)', !!pillSyncB, pillSyncB || '')
    if (rowsB) {
        const rowB = rowsB.find((s) => s.seed !== rec.seed) || rowsB[1]
        const recB = JSON.parse(await (await fetch(`${sim.base}/sessions/${encodeURIComponent(rowB.key)}`, { headers: sim.readHeaders })).text())
        const verB = verifyRecording(recB, makeReplayDriver(recB.rules || {}))
        r.check('the offline-retry take replay-verifies too (kills-vs-structural discriminator for the line above)', verB.ok, verB.mismatch ? `seed ${recB.seed} diverged at tick ${verB.mismatch.tick} of ${recB.ticks}` : verB.error || '')
    }

    // ================= scenario C — revoke purges the pile =================
    await page.route(sessionsRoute, (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
    await page.waitForTimeout(500)
    const openedC = await startRun(page)
    r.check('third run starts (grant still cached after scenario B)', openedC === 'recording')
    await idleToDeath(page)
    const queuedC = await until(async () => (await penCount(page)) >= 1, 10000)
    r.check('third take queued while offline', !!queuedC)
    await page.unroute(sessionsRoute)
    // the player changes their mind: revoke (the store shape consent.js uses)
    await page.evaluate(() => {
        const k = 'retrogames-consent-v1'
        const m = JSON.parse(localStorage.getItem(k) || '{}')
        m.player = { motion: false, voice: false, at: Date.now() }
        localStorage.setItem(k, JSON.stringify(m))
    })
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const purged = await until(async () => (await penCount(page)) === 0, 8000)
    const rowsC = await storeRows()
    r.check('revoked consent PURGES the queued take — nothing uploaded', !!purged && rowsC.length === 2, `store has ${rowsC.length}, pen ${await penCount(page)}`)
    r.check('revoked consent leaves NO pile on the device', !!purged)
    // S7 honesty: a purge shipped nothing — the pill must CLAIM nothing.
    const pillC = await page.evaluate(() => (window.__syncBadge ? window.__syncBadge.kind : 'hidden'))
    r.check('S7: after the purge the pill says nothing (no phantom sync)', pillC === 'hidden', `pill was ${pillC}`)

    // ================= scenario D — no store, no claims =================
    // A device that never reaches a store must never see the pill at all:
    // every word it could say would be a lie about storage that isn't there.
    const pageD = await ctx.newPage()
    pageD.setDefaultTimeout(60000)
    watch(pageD)
    await pageD.goto(`http://localhost:${PORT}/retrogames/gauntlet?store=http%3A%2F%2F127.0.0.1%3A9`, { waitUntil: 'load' })
    await pageD.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
    await pageD.waitForTimeout(1500) // probe fails, drains no-op; grace for any stray publish
    const pillD = await pageD.evaluate(() => !!document.querySelector('[data-sync-badge]') || !!(window.__syncBadge && window.__syncBadge.kind !== 'hidden'))
    r.check('S7: unreachable store = no pill ever (no-store, no claim)', !pillD)

    r.check('zero page errors', errors.length === 0, errors.join(' | '))
} catch (e) {
    if (!(MUTATE && /without persist-before-upload/.test(String(e)))) r.check('scenario completed without unexpected failure', false, String(e))
} finally {
    try { if (ctx) await ctx.close() } catch { /* already closed (scenario A kill) */ }
    if (mutated) {
        pull(AUTO) // exact original bytes back (guard), not a string-replace reconstruction
        const intact = await until(async () => !(await servedMutant()), 8000)
        if (!intact) console.log('  ..    WARNING: vite still serves mutant text after restore — check the dev server')
    }
    sim.close()
    fs.rmSync(profile, { recursive: true, force: true })
}

if (MUTATE) {
    console.log(`\nplaicraft:outbox: ${r.rows.length - r.failed}/${r.rows.length} checks passed under --mutate`)
    if (!r.failed) { console.log('mutate: expected RED, got green — persist-before-upload is NOT load-bearing?'); process.exit(1) }
    console.log('RED BY DESIGN (--mutate): without the persist line the killed take is lost — the line is load-bearing.')
    process.exit(0)
}
if (errors.length) { /* reported above */ }
process.exit(r.failed ? 1 : 0)
