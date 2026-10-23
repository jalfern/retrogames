// BLOBNET — BLOB BATTLE online UX (#863) in two headless Chromes over the local
// relay twin: the 3-2-1 countdown runs on BOTH boxes before the first blob
// moves (and again after a desync re-join), a rival who leaves mid-match
// freezes the board with a RIVAL LEFT screen that offers a Return, the host
// re-opens the room for a new challenger, and the guest whose host left
// escapes to the CPU cabinet. Advisory browser tier, the netdrill pattern —
// the deterministic gate is `npm run blobcheck` in static. Needs `npm run dev`.

import { launch, requireDevServer } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const BASE = process.env.BLOB_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/blob-battle`
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
        await sleep(40)
    }
}

const HARD = setTimeout(() => { console.error('blobnet: hard deadline — page wedged'); process.exit(1) }, 180000)

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
    await page.waitForFunction(() => !!window.__blobbattleTest, null, { timeout: 15000 })
    return page
}
const probe = (page) => page.evaluate(() => window.__blobbattleTest.probe())

try {
    const A = await open(`${BASE}?net=host&relay=${RELAY}`)
    const hostP = await until(async () => { const p = await probe(A); return p.netPhase === 'waiting' && p.netCode.length === 4 ? p : null })
    ok(hostP && hostP.netCode.length === 4, 'host opens a room and shows its code', JSON.stringify(hostP))

    const B = await open(`${BASE}?net=join&room=${hostP.netCode}&relay=${RELAY}`)
    ok(await until(async () => (await probe(B)).seats.length === 2 && (await probe(A)).seats.length === 2, 8000), 'guest joins by code and pairs',
        `A ${(await probe(A)).seats} B ${(await probe(B)).seats}`)

    // 3-2-1: both boxes count down BEFORE the board moves
    await A.keyboard.press('Space')
    const cd = await until(async () => {
        const pa = await probe(A), pb = await probe(B)
        return pa.screen === 'play' && pb.screen === 'play' && pa.countdown > 0 && pb.countdown > 0 ? { pa, pb } : null
    }, 4000)
    ok(!!cd, 'the start countdown is running on BOTH boxes', `A ${cd && cd.pa.countdown} B ${cd && cd.pb.countdown}`)
    ok(cd && cd.pa.tick === 0 && cd.pb.tick === 0, 'the board is frozen while the countdown runs', `A ${cd && cd.pa.tick} B ${cd && cd.pb.tick}`)
    ok(await until(async () => {
        const pa = await probe(A), pb = await probe(B)
        return pa.countdown === 0 && pb.countdown === 0 && pa.tick > 0 && pb.tick > 0
    }, 8000), 'the countdown ends and both boxes move on the same seed',
        `A ${JSON.stringify(await probe(A))} B ${JSON.stringify(await probe(B))}`)

    await A.keyboard.down('ArrowRight')
    await B.keyboard.down('ArrowUp')
    await sleep(1500)
    await A.keyboard.up('ArrowRight')
    await B.keyboard.up('ArrowUp')
    const ta = await probe(A), tb = await probe(B)
    ok(ta.tick > 60 && tb.tick > 60, 'both sims run while keys are held', `A ${ta.tick} B ${tb.tick}`)
    ok(Math.abs(ta.tick - tb.tick) <= 6, 'the two worlds stay locked together', `Δ ${Math.abs(ta.tick - tb.tick)}`)
    ok(ta.desync === false && tb.desync === false, 'no desync on honest play')

    // desync -> re-join: the restart also rides the countdown, and the fresh
    // match actually ADVANCES (a re-join that wedges on the old desync freeze
    // reddens the advance check below)
    await B.evaluate(() => window.__blobbattleTest.corrupt())
    ok(await until(async () => (await probe(A)).desync && (await probe(B)).desync, 6000), 'a corrupted sim freezes BOTH with DESYNC',
        `A ${(await probe(A)).desync} B ${(await probe(B)).desync}`)
    const frozenA = (await probe(A)).tick, frozenB = (await probe(B)).tick
    await A.keyboard.press('Space')
    const rc = await until(async () => {
        const pa = await probe(A), pb = await probe(B)
        return pa.screen === 'play' && pb.screen === 'play' && pa.countdown > 0 && pb.countdown > 0 ? { pa, pb } : null
    }, 4000)
    ok(!!rc, 'the re-join restart counts down on BOTH boxes', `A ${rc && rc.pa.countdown} B ${rc && rc.pb.countdown}`)
    ok(await until(async () => {
        const pa = await probe(A), pb = await probe(B)
        return pa.tick > frozenA && pb.tick > frozenB && pa.desync === false && pb.desync === false
    }, 10000), 'the re-joined match advances on both boxes (no wedge on the desync freeze)',
        `A ${await probe(A).tick} B ${await probe(B).tick} (frozen at ${frozenA}/${frozenB})`)

    // rival left: the board FREEZES with a RIVAL LEFT screen that offers Return
    const pre = await probe(A)
    await B.close()
    ok(await until(async () => (await probe(A)).rivalGone, 6000), 'the host learns the rival left mid-match', JSON.stringify(await probe(A)))
    const t1 = (await probe(A)).tick
    await sleep(1200)
    const t2 = (await probe(A)).tick
    ok(t1 === t2 && t1 > 0, 'the board is frozen, not left to drift', `tick ${t1} -> ${t2}`)
    ok(await A.evaluate(() => /RIVAL LEFT/.test(document.body.innerText)), 'the RIVAL LEFT screen offers a Return')
    await A.keyboard.press('Space')
    const back = await until(async () => { const p = await probe(A); return p.screen === 'attract' ? p : null }, 4000)
    ok(!!back && back.netPhase === 'waiting', 'Return re-opens the host room for a new challenger',
        `screen ${back && back.screen} phase ${back && back.netPhase}`)

    // a new challenger joins the re-opened room and gets the countdown too
    const C = await open(`${BASE}?net=join&room=${hostP.netCode}&relay=${RELAY}`)
    ok(await until(async () => (await probe(C)).seats.length === 2, 8000), 'a new challenger re-pairs in the re-opened room', JSON.stringify(await probe(C)))
    await A.keyboard.press('Space')
    ok(await until(async () => {
        const pa = await probe(A), pc = await probe(C)
        return pa.screen === 'play' && pc.screen === 'play' && pa.countdown > 0 && pc.countdown > 0
    }, 4000), 'the new match counts down on both boxes', '')
    ok(await until(async () => {
        const pa = await probe(A), pc = await probe(C)
        return pa.countdown === 0 && pc.countdown === 0 && pa.tick > 0 && pc.tick > 0
    }, 8000), 'the new match moves on both boxes', `A ${(await probe(A)).tick} C ${(await probe(C)).tick}`)
    C.close()

    // the guest whose HOST left: socket close is the only signal — it must
    // still freeze + Return, and Return must drop the dead net (CPU cabinet)
    const E = await open(`${BASE}?net=host&relay=${RELAY}`)
    const pe = await until(async () => { const p = await probe(E); return p.netPhase === 'waiting' && p.netCode.length === 4 ? p : null })
    const F = await open(`${BASE}?net=join&room=${pe.netCode}&relay=${RELAY}`)
    await until(async () => (await probe(F)).seats.length === 2, 8000)
    await E.keyboard.press('Space')
    ok(await until(async () => (await probe(F)).screen === 'play', 6000), 'the guest is mid-match', JSON.stringify(await probe(F)))
    await E.close()
    ok(await until(async () => (await probe(F)).rivalGone, 6000), 'the guest learns the host left (socket close)', JSON.stringify(await probe(F)))
    await F.keyboard.press('Space')
    const fe = await until(async () => { const p = await probe(F); return p.screen === 'attract' ? p : null }, 4000)
    ok(!!fe && fe.netPhase === 'off', 'Return drops the dead room for the guest', `screen ${fe && fe.screen} phase ${fe && fe.netPhase}`)
    await F.keyboard.press('Enter')
    ok(await until(async () => { const p = await probe(F); return p.screen === 'play' && p.mode === 'cpu' && p.tick > 0 }, 6000),
        'the guest is back in the CPU cabinet', JSON.stringify(await probe(F)))
    F.close()

    ok(errors.length === 0, 'zero page errors', errors.slice(0, 3).join(' | '))
} finally {
    await browser.close()
    await srv.close()
    clearTimeout(HARD)
}

console.log(`\nblobnet: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
