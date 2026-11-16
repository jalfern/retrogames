// VIPERNET — VIPER PIT net-select gate (#2476) proven LIVE: two headless
// Chromes over the local relay twin (the blobnet pattern). Three scenarios:
//   RACE     — the host's FIGHT lands BEFORE the challenger's pick: the host
//              must DEFER (stays on select, AWAITING-line), and the pick, when
//              it arrives, starts BOTH boxes on the guest's REAL fighter.
//   PRE-PICK — the guest picks first: the host's FIGHT starts immediately
//              (the gate never invents a wait), same choice on both boxes.
//   GHOST    — a challenger who leaves mid-wait un-hangs the host: `waiting`
//              clears; the host re-arms, a fresh joiner's pick fires the launch.
// Advisory browser tier — the deterministic gate is part A2 of `viperpitcheck`
// in static. Needs `npm run dev` (DEV_PORT, VIPER_URL to point elsewhere).

import { launch, requireDevServer, relayNoise } from './lib/harness.mjs'
import { startRelay } from '../relay/server.mjs'

const BASE = process.env.VIPER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/viper-pit`
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.error(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => {
    const t0 = Date.now()
    for (;;) {
        const v = await fn()
        if (v || Date.now() - t0 > ms) return v
        await sleep(40)
    }
}

const HARD = setTimeout(() => { console.error('vipernet: hard deadline — page wedged'); process.exit(1) }, 240000)

await requireDevServer(BASE)
const srv = startRelay(0)
await until(() => srv.boundPort() > 0)
const RELAY = `ws://127.0.0.1:${srv.boundPort()}`
const browser = await launch()
const errors = []

const open = async (url, tag) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    // Wire-level visibility (#2476): a socket that dies mid-scenario is the
    // difference between "the gate failed" and "this box was never seated".
    await page.addInitScript((t) => {
        const OS = window.WebSocket
        window.WebSocket = function (u, p) {
            const ws = new OS(u, p)
            const cu = String(u)
            if (cu.includes('/room/')) {
                console.log(`WS[${t}] new ${cu}`)
                ws.addEventListener('open', () => console.log(`WS[${t}] open ${cu}`))
                ws.addEventListener('close', (e) => console.log(`WS[${t}] close ${cu} code=${e.code}`))
            }
            return ws
        }
        window.WebSocket.prototype = OS.prototype
        Object.assign(window.WebSocket, OS)
    }, tag)
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('WS[')) console.log('   wire:', t) })
    page.on('pageerror', (e) => { if (!relayNoise(String(e))) errors.push(String(e)) })
    page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text()) && !m.text().startsWith('WS[')) errors.push(m.text()) })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => !!(window.__viperPitTest && window.__viperPitTest.netState), null, { timeout: 15000 })
    return page
}
const net = (page) => page.evaluate(() => window.__viperPitTest.netState())

// Fresh room: host opens, guest joins, both leave attract for the select screen.
const newPair = async () => {
    const A = await open(`${BASE}?net=host&relay=${RELAY}`, 'A')
    const hp = await until(async () => { const p = await net(A); return p && p.phase === 'waiting' && p.code.length === 4 ? p : null })
    if (!hp) throw new Error('host never opened a room')
    const B = await open(`${BASE}?net=join&room=${hp.code}&relay=${RELAY}`, 'B')
    await A.keyboard.press('Space')
    await B.keyboard.press('Space')
    // Seated, not just "on select": a guest's first socket can race its own
    // StrictMode ghost (`room full` → retry ladder), and select renders no
    // matter of the socket. Wait until the ROSTER agrees — both boxes show
    // two seats and hold an open room socket.
    const paired = await until(async () => {
        const [pa, pb] = await Promise.all([net(A), net(B)])
        return pa.screen === 'select' && pb.screen === 'select' && pa.code === pb.code
            && pa.rphase === 'waiting' && pb.rphase === 'waiting'
            && pa.seats.length === 2 && pb.seats.length === 2 ? true : null
    }, 20000)
    if (!paired) throw new Error('pair never reached select together')
    return { A, B, code: hp.code }
}
const closeBoth = async (p) => { for (const pg of [p.A, p.B]) { try { await pg.close() } catch { /* gone */ } } }

try {
    // ---- scenario 1: RACE — host FIGHT before the guest pick ----------------------
    {
        const p = await newPair()
        await p.A.keyboard.press('Space') // host commits while the pick is still owed
        const deferred = await until(async () => { const s = await net(p.A); return s.waiting && s.screen === 'select' ? s : null })
        ok(!!deferred, 'RACE: a FIGHT before the guest pick DEFERS — host waits on select')
        await p.B.keyboard.press('ArrowLeft') // default cursor 3 (riv) -> 2 (vess)
        await p.B.keyboard.press('Space')     // the pick lands late — the gate must release
        const both = await until(async () => {
            const [sa, sb] = await Promise.all([net(p.A), net(p.B)])
            return sa.screen === 'play' && sb.screen === 'play' ? [sa, sb] : null
        })
        ok(!!both, 'RACE: the late pick starts BOTH boxes')
        if (both) {
            const [sa, sb] = both
            ok(sa.chars[1] === 'vess' && sb.chars[1] === 'vess',
                'RACE: both boxes fight the guest REAL choice (vess), never a placeholder',
                `host ${JSON.stringify(sa.chars)} guest ${JSON.stringify(sb.chars)}`)
            ok(sa.chars[0] === 'riv' && sb.chars[0] === 'riv',
                'RACE: the host character rides the launch intact on both boxes')
        }
        await closeBoth(p)
    }

    // ---- scenario 2: PRE-PICK — pick in hand, launch is immediate ------------------
    {
        const p = await newPair()
        await p.B.keyboard.press('ArrowLeft')
        await p.B.keyboard.press('Space') // pick lands BEFORE any FIGHT press
        await sleep(150)
        await p.A.keyboard.press('Space')
        const both = await until(async () => {
            const [sa, sb] = await Promise.all([net(p.A), net(p.B)])
            return sa.screen === 'play' && sb.screen === 'play' ? [sa, sb] : null
        }, 2500)
        ok(!!both, 'PRE-PICK: a pick already in hand launches without a wait')
        if (both) ok(both[0].chars[1] === 'vess' && both[1].chars[1] === 'vess',
            'PRE-PICK: the stored pick rides the launch (vess on both boxes)',
            `host ${JSON.stringify(both[0].chars)} guest ${JSON.stringify(both[1].chars)}`)
        await closeBoth(p)
    }

    // ---- scenario 3: GHOST — the waiting challenger leaves, the host survives ------
    {
        const p = await newPair()
        await p.A.keyboard.press('Space')
        ok(!!(await until(async () => (await net(p.A)).waiting ? true : null)),
            'GHOST: host defers while the pick is owed')
        await p.B.close()
        const unhung = await until(async () => { const s = await net(p.A); return !s.waiting && s.screen === 'select' ? s : null })
        ok(!!unhung, 'GHOST: the leaving challenger UN-HANGS the gate (host back to SPACE: FIGHT)')
        await p.A.keyboard.press('Space') // re-press — must re-arm the wait, not crash or launch
        ok(!!(await until(async () => (await net(p.A)).waiting ? true : null)),
            'GHOST: a re-press re-arms the wait for the next challenger')
        const C = await open(`${BASE}?net=join&room=${p.code}&relay=${RELAY}`, 'C')
        ok(!!(await until(async () => { const s = await net(C); return s.rphase === 'waiting' && s.seats.length === 2 ? true : null }, 20000)),
            'GHOST: the fresh challenger seats in the still-open room')
        await C.keyboard.press('Space')
        await C.keyboard.press('ArrowLeft')
        await C.keyboard.press('Space') // the fresh pick lands at the re-armed host
        ok(!!(await until(async () => (await net(p.A)).gate.guestChar === 'vess' ? true : null)),
            'GHOST: the re-armed gate stores the fresh joiner pick before any FIGHT')
        await p.A.keyboard.press('Space') // the host launches when ready — with the real choice
        const both = await until(async () => {
            const [sa, sc] = await Promise.all([net(p.A), net(C)])
            return sa.screen === 'play' && sc.screen === 'play' ? [sa, sc] : null
        }, 20000)
        ok(!!both && both[0].chars[1] === 'vess' && both[1].chars[1] === 'vess',
            'GHOST: the fresh joiner picks and BOTH boxes agree on the real choice',
            both ? `host ${JSON.stringify(both[0].chars)}` : '')
        try { await C.close() } catch { /* gone */ }
    }

    ok(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ') || 'clean'})`)
    await browser.close()
} catch (e) {
    fail++
    console.error(`FAIL  vipernet aborted — ${e}`)
    try { await browser.close() } catch { /* gone */ }
} finally {
    clearTimeout(HARD)
    try { srv.close() } catch { /* gone */ }
}

console.log(`vipernet: ${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
