// NETDRILL (#531, browser tier of netcheck) — two headless Chromes, real key
// events, the local Node relay twin (relay/server.mjs). Proves the GAUNTLET
// online pilot end to end: room code appears, guest joins by code, host starts
// and the seed reaches the guest, both sims advance together behind the delay
// buffer, and a corrupted sim on one page raises the visible DESYNC on BOTH.
// Needs `npm run dev` running. Advisory (browser tier), like the other
// *play checks — see docs/HARNESS.md.

import { launch, requireDevServer, opt } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const BASE = process.env.GAUNTLET_URL || 'http://localhost:5173/retrogames/gauntlet'
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 6000) => {
    const t0 = Date.now()
    for (;;) {
        const v = await fn()
        if (v || Date.now() - t0 > ms) return v
        await sleep(50)
    }
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
    await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
    return page
}
const probe = (page) => page.evaluate(() => window.__gauntletTest.netProbe())

try {
    const A = await open(`${BASE}?net=host&relay=${RELAY}`)
    const hostP = await until(async () => { const p = await probe(A); return p.phase === 'waiting' && p.code.length === 4 ? p : null })
    ok(hostP && hostP.code.length === 4, 'host opens a room and shows its code', JSON.stringify(hostP))

    const B = await open(`${BASE}?net=join&room=${hostP.code}&relay=${RELAY}`)
    ok((await until(async () => (await probe(B)).peer)) === true, 'guest joins by code and pairs', JSON.stringify(await probe(B)))

    await A.keyboard.press('Space')
    await sleep(150)
    await A.keyboard.press('Space')
    ok(await until(async () => (await probe(A)).phase === 'play' && (await probe(B)).phase === 'play', 8000), 'host pick starts BOTH games from the shared seed',
        `A ${(await probe(A)).phase} B ${(await probe(B)).phase}`)
    const sa = await probe(A), sb = await probe(B)
    ok(sa.seed === sb.seed && sa.seed > 0, 'both sims carry the same seed', `A ${sa.seed} B ${sb.seed}`)

    await A.keyboard.down('ArrowRight')
    await B.keyboard.down('ArrowUp')
    await sleep(1500)
    await A.keyboard.up('ArrowRight')
    await B.keyboard.up('ArrowUp')
    const ta = await probe(A), tb = await probe(B)
    ok(ta.tick > 60 && tb.tick > 60, 'both sims run while keys are held', `A ${ta.tick} B ${tb.tick}`)
    ok(Math.abs(ta.tick - tb.tick) <= 6, 'the two worlds stay locked together', `Δ ${Math.abs(ta.tick - tb.tick)}`)
    ok(ta.phase === 'play' && tb.phase === 'play', 'no desync on honest play')

    await B.evaluate(() => { window.__gauntletTest.state().gold += 7 })
    ok(await until(async () => (await probe(A)).phase === 'desync' && (await probe(B)).phase === 'desync', 5000), 'a corrupted sim freezes BOTH with DESYNC',
        `A ${(await probe(A)).phase} B ${(await probe(B)).phase}`)

    const C = await open(`${BASE}?net=host&relay=${RELAY}`)
    const pc = await probe(C)
    const D = await open(`${BASE}?net=join&room=${pc.code}&relay=${RELAY}`)
    await until(async () => (await probe(D)).peer)
    await D.close()
    ok(await until(async () => (await probe(C)).phase === 'gone', 4000), 'a waiting host learns the friend left')

    ok(errors.length === 0, 'zero page errors', errors.slice(0, 3).join(' | '))
} finally {
    await browser.close()
    await srv.close()
}

console.log(`\nnetdrill: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
