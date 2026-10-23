// SSXDRILL (#845 browser tier, advisory) — two headless Chromes, the local Node
// relay twin (relay/server.mjs), real key/tap events. Proves SSX ONLINE end to end
// on a laptop: the host opens a 4-letter room, a guest joins by code and both see
// the pair, the host starts everyone on one seed, both sims run and render the
// other racer as a live ghost, and a finish crosses the wire so the friends'
// standings light up on BOTH boxes. Needs `npm run dev` running. Advisory like the
// other *play checks (see docs/HARNESS.md) — the merge gate is CI `static`, not this.

import { launch, requireDevServer } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const BASE = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/ssx`
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ' — ' + info : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => {
    const t0 = Date.now()
    for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await sleep(60) }
}

await requireDevServer(BASE)
const srv = startRelay(0)
await until(() => srv.boundPort() > 0)
const RELAY = `ws://127.0.0.1:${srv.boundPort()}`
const browser = await launch()
const errors = []
const open = async (url) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => !!(window.__ssxTest && window.__ssxTest.netProbe), null, { timeout: 20000 })
    return page
}
const probe = (page) => page.evaluate(() => window.__ssxTest.netProbe())
const seek = (page) => page.evaluate(() => window.__ssxTest.seek(1000000))

try {
    const A = await open(`${BASE}?lite=1&net=host&relay=${RELAY}`)
    const hostP = await until(async () => { const p = await probe(A); return p.phase === 'waiting' && p.code.length === 4 ? p : null })
    ok(hostP && hostP.code.length === 4, 'host opens a room and shows its code', JSON.stringify(hostP))

    const B = await open(`${BASE}?lite=1&net=join&room=${hostP.code}&relay=${RELAY}`)
    ok(await until(async () => (await probe(B)).slot >= 1) === true, 'guest joins by code into a guest seat', JSON.stringify(await probe(B)))
    ok(await until(async () => (await probe(A)).slots === 2), 'host roster shows two racers', JSON.stringify(await probe(A)))
    ok(await until(async () => (await probe(B)).slots === 2), 'guest roster shows two racers')

    await A.keyboard.press('Space')
    ok(await until(async () => (await probe(A)).racing && (await probe(B)).racing, 9000), 'host start sends BOTH racers to the mountain',
        `A ${(await probe(A)).phase} B ${(await probe(B)).phase}`)
    const sa = await probe(A), sb = await probe(B)
    ok(sa.seed === sb.seed && sa.seed > 0, 'both race the same seed', `A ${sa.seed} B ${sb.seed}`)

    await A.keyboard.down('ArrowRight'); await B.keyboard.down('ArrowLeft')
    await sleep(1200)
    ok(await until(async () => (await probe(A)).tick > 120 && (await probe(B)).tick > 120, 6000), 'both sims run while keys are held',
        `A ${(await probe(A)).tick} B ${(await probe(B)).tick}`)
    ok(await until(async () => (await probe(A)).ghosts >= 1 && (await probe(B)).ghosts >= 1, 5000),
        'each racer renders the other as a live ghost', `A ghosts ${(await probe(A)).ghosts} B ghosts ${(await probe(B)).ghosts}`)
    await A.keyboard.up('ArrowRight'); await B.keyboard.up('ArrowLeft')

    // push both heroes to the line so a finish crosses the wire -> standings on both.
    await seek(A); await seek(B)
    ok(await until(async () => { const pa = await probe(A), pb = await probe(B); return pa.standings && pb.standings }, 9000),
        'a finish reaches the other racer and the friends standings light up on both',
        `A ${JSON.stringify((await probe(A)).standings)} B ${JSON.stringify((await probe(B)).standings)}`)
} catch (e) {
    ok(false, 'drill completed without throwing', String(e))
} finally {
    ok(errors.length === 0, 'zero page errors across the session', errors.join(' | '))
    await browser.close()
    await srv.close()
}

console.log(`\nssxdrill: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
