// watchcheck — #1624 WATCH key, driven for real in Chrome.
// For each pilot (SSX, Emberwood, MYST): press Y and prove the game plays
// itself on its proven route (sim state advances with nobody touching it),
// then press an ordinary input and prove the player takes over immediately.
// Needs the dev server (DEV hooks are DEV-only):  npm run dev -- --port <p>
//
//   npm run watchcheck            # all three pilots
//   npm run watchcheck -- --only ssx
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const BASE = process.env.WATCH_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]
  || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null)

const key = (page, code) => page.keyboard.press(code)

// openGame without the exit() — a first visit can also fail on a Vite reload,
// and this script wants to retry and report, not die.
async function openGameNoExit(browser, pilot) {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 })
    page.setDefaultTimeout(60000)
    page.on('pageerror', e => console.log('[pageerror]', e.message))
    await page.goto(pilot.url, { waitUntil: 'load' })
    await page.waitForFunction((h) => !!window[h], pilot.hook, { timeout: 25000 })
    return page
}

const PILOTS = [
    // #1637 rollout — the arcade family on one factory: Y starts the watcher, the
    // prover advances the real sim untouched, a steer key takes over, Y re-seats it
    // mid-run and it carries on from exactly there. advanced() reads each game's own
    // probe: score up (kills/flips/bricks) or the avatar visibly moved — both are
    // impossible while an idle player watches nothing happen.
    // id, hook, extra waits, and an optional custom advanced/note.
    ...[
        {
            id: 'qbert', hook: '__qbertTest',
            advanced: (a, b) => b.flips > a.flips || b.px !== a.px || b.py !== a.py,
            note: (a, b) => `flips ${a.flips} -> ${b.flips} @cube(${b.r},${b.c})`,
            takeover: 'ArrowUp', resumeWait: 4000,
        },
        {
            id: 'joust', hook: '__joustTest',
            advanced: (a, b) => (a.p1?.x ?? 0) !== (b.p1?.x ?? 0) || b.p1.score > a.p1.score || b.foes < a.foes,
            note: (a, b) => `p1 x ${(a.p1?.x ?? 0).toFixed(0)} -> ${(b.p1?.x ?? 0).toFixed(0)}, score ${a.p1.score} -> ${b.p1.score}`,
        },
        {
            id: 'galaga', hook: '__galagaTest',
            advanced: (a, b) => b.score > a.score || Math.abs(b.player.x - a.player.x) > 8,
            note: (a, b) => `score ${a.score} -> ${b.score}, x ${a.player.x.toFixed(0)} -> ${b.player.x.toFixed(0)}`,
        },
        {
            id: 'tempest', hook: '__tempestTest',
            // Tempest punishes idle: things that reach the rim kill. The prover not
            // only survives the window, it scores — both sides of the promise.
            advanced: (a, b) => b.score > a.score && b.lives === a.lives,
            note: (a, b) => `score ${a.score} -> ${b.score}, lives ${a.lives} held`,
            advanceWait: 6000,
        },
        {
            id: 'dig-dug', hook: '__dugTest',
            advanced: (a, b) => b.score > a.score || Math.abs(b.player.x - a.player.x) > 8,
            note: (a, b) => `score ${a.score} -> ${b.score}, x ${a.player.x.toFixed(0)} -> ${b.player.x.toFixed(0)}`,
        },
        {
            id: 'bubble-bobble', hook: '__bobTest',
            advanced: (a, b) => b.score > a.score || Math.abs((b.player?.x ?? 0) - (a.player?.x ?? 0)) > 8,
            note: (a, b) => `score ${a.score} -> ${b.score}, x ${(a.player?.x ?? 0).toFixed(0)} -> ${(b.player?.x ?? 0).toFixed(0)}`,
        },
        {
            id: 'spy-hunter', hook: '__spyTest',
            // idle Spy Hunter can get shot; the proven line holds lives and banks kills
            advanced: (a, b) => b.score > a.score && b.lives === a.lives,
            note: (a, b) => `score ${a.score} -> ${b.score}, lives ${a.lives} held`,
            advanceWait: 6000,
        },
        {
            id: 'arkanoid', hook: '__arkTest',
            // idle Arkanoid never even launches the ball — score > 0 is prover-only
            advanced: (a, b) => b.score > a.score || Math.abs(b.paddle - a.paddle) > 4,
            note: (a, b) => `score ${a.score} -> ${b.score}, paddle ${a.paddle.toFixed(0)} -> ${b.paddle.toFixed(0)}`,
        },
    ].map((g) => ({
        id: g.id, url: `${BASE}/${g.id}`, hook: g.hook,
        async run(page, rep) {
            const H = g.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')                       // attract -> play
            await page.waitForTimeout(600)
            await key(page, 'KeyY')
            rep.check(`${g.id}: Y starts the watcher`, await watching())
            const a = await probe()
            await page.waitForTimeout(g.advanceWait || 5000)
            const b = await probe()
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            rep.check(`${g.id}: still watching mid-route`, await watching())
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            const c = await probe()
            await page.waitForTimeout(g.resumeWait || 3500)
            const d = await probe()
            rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            await key(page, 'KeyY')                       // hand the controls back
            rep.check(`${g.id}: Y again releases the watcher`, !(await watching()))
        },
    })),
    {
        id: 'ssx', url: `${BASE}/ssx`, hook: '__ssxTest',
        async run(page, rep) {
            await key(page, 'Space')                       // attract -> race (count)
            await page.waitForTimeout(500)
            await key(page, 'KeyY')
            rep.check('SSX: Y starts the watcher', await page.evaluate(() => window.__ssxTest.watching()))
            await page.waitForTimeout(7000)               // count + some downhill
            const s1 = await page.evaluate(() => window.__ssxTest.probe())
            await page.waitForTimeout(1500)
            const s2 = await page.evaluate(() => window.__ssxTest.probe())
            rep.check('SSX: the rider runs the line untouched', s1.tick < s2.tick && s2.p.s > s1.p.s,
                `s ${s1.p.s.toFixed(0)} -> ${s2.p.s.toFixed(0)} @v ${s2.p.v.toFixed(1)}`)
            rep.check('SSX: still watching mid-hill', await page.evaluate(() => window.__ssxTest.watching()))
            await page.keyboard.down('ArrowLeft')          // the player takes over
            rep.check('SSX: steer key takes over', !(await page.evaluate(() => window.__ssxTest.watching())))
            await page.keyboard.up('ArrowLeft')
        },
    },
    {
        id: 'emberwood', url: `${BASE}/emberwood`, hook: '__emberwoodTest',
        async run(page, rep) {
            await key(page, 'Space')
            await page.waitForTimeout(600)
            const before = await page.evaluate(() => window.__emberwoodTest.state())
            const hero0 = await page.evaluate(() => window.__emberwoodTest.heroPos())
            await key(page, 'KeyY')
            rep.check('EMBERWOOD: Y starts the guide', await page.evaluate(() => window.__emberwoodTest.watching()))
            await page.waitForTimeout(4000)
            const mid = await page.evaluate(() => window.__emberwoodTest.heroPos())
            rep.check('EMBERWOOD: the prover walks without input',
                Math.hypot(mid.x - hero0.x, mid.y - hero0.y) > 6,
                `moved ${Math.hypot(mid.x - hero0.x, mid.y - hero0.y).toFixed(0)}px`)
            await page.keyboard.down('ArrowLeft')
            rep.check('EMBERWOOD: arrow key takes over', !(await page.evaluate(() => window.__emberwoodTest.watching())))
            await page.keyboard.up('ArrowLeft')
            const after = await page.evaluate(() => window.__emberwoodTest.state())
            // the kit policy: watchSnapshot/watchRestore — your items and embers
            // are exactly what they were; the guide's loan is handed back whole.
            const kitSame = JSON.stringify(before.items) === JSON.stringify(after.items) && before.score === after.score
            rep.check('EMBERWOOD: the demo kit is handed back on takeover', kitSame,
                `embers ${before.score} -> ${after.score}`)
        },
    },
    {
        id: 'myst', url: `${BASE}/myst`, hook: '__mystTest',
        async run(page, rep) {
            await key(page, 'Space')                       // attract -> dock
            await page.waitForTimeout(600)
            await key(page, 'KeyY')
            rep.check('MYST: Y starts the watcher', await page.evaluate(() => window.__mystTest.watching()))
            await page.waitForTimeout(500)
            const len1 = await page.evaluate(() => window.__mystTest.watchLen())
            const full = await page.evaluate(() => window.__mystTest.script().length)
            rep.check('MYST: the route resumed from the dock at full length', len1 >= full - 8 && len1 <= full,
                `suffix ${len1} of ${full} (2-3 moves already run at read time)`)
            await page.waitForTimeout(4000)
            const p = await page.evaluate(() => window.__mystTest.probe())
            const len2 = await page.evaluate(() => window.__mystTest.watchLen())
            rep.check('MYST: the island moves on its own', p.node !== 'dock' && len2 < len1,
                `node ${p.node}, route ${len1} -> ${len2}`)
            if (p.node !== 'dock') await page.screenshot({ path: '/tmp/forge/watch-myst.png' }) // PR evidence: mid-watch
            await page.keyboard.down('ArrowLeft')
            rep.check('MYST: turn key takes over', !(await page.evaluate(() => window.__mystTest.watching())))
            await page.keyboard.up('ArrowLeft')
            // honesty clause: parked off the proven line, the watcher declines.
            // goto('selGate') puts the dock-fresh player at a route node whose
            // route state has many flags — no junction can match.
            await page.evaluate(() => window.__mystTest.goto('selGate'))
            await page.waitForTimeout(300)
            await key(page, 'KeyY')
            await page.waitForTimeout(1200)
            const off = await page.evaluate(() => ({ w: window.__mystTest.watching(), len: window.__mystTest.watchLen() }))
            rep.check('MYST: off the proven line says no guide (watcher never starts)', !off.w && off.len === 0)
        },
    },
]

const run = PILOTS.filter((p) => !ONLY || p.id === ONLY)
if (!run.length) { console.error(`unknown --only "${ONLY}"`); process.exit(1) }

await requireDevServer(`${BASE}/`)
const rep = new Report(`WATCH key (${run.map((p) => p.id).join(', ')})`)
console.log(`WATCH key — ${run.length} pilot(s) against ${BASE}`)
for (const pilot of run) {
    console.log(`\n— ${pilot.id}`)
    // ONE browser per pilot: on the #1622 shell+sp boot mode (--single-process,
    // what this no-GUI box needs) closing a heavy WebGL page takes the whole
    // process with it, and the next pilot's page dies with it.
    const browser = await launch()
    console.log(`  boot ${browser.__bootMode || 'chrome'}`)
    let page = null
    // Vite may full-reload once on first visit (dep re-optimization) and kill
    // the hook wait — retry once, then it's a real miss.
    for (let attempt = 0; attempt < 2 && !page; attempt++) {
        try {
            page = await openGameNoExit(browser, pilot)
        } catch {
            if (attempt === 1) rep.check(`${pilot.id}: DEV hook present`, false, `window.${pilot.hook} missing`)
        }
    }
    if (!page) { await browser.close().catch(() => {}); continue }
    try {
        await pilot.run(page, rep)
    } catch (e) {
        rep.check(`${pilot.id}: drove without page error`, false, e.message)
    }
    await page.close().catch(() => {})
    await browser.close().catch(() => {})
}
rep.exit()
