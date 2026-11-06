// watchcheck — #1624 WATCH key, driven for real in Chrome.
// For each pilot (SSX, Emberwood, MYST): press Y and prove the game plays
// itself on its proven route (sim state advances with nobody touching it),
// then press an ordinary input and prove the player takes over immediately.
// Needs the dev server (DEV hooks are DEV-only):  npm run dev -- --port <p>
//
//   npm run watchcheck            # all three pilots
//   npm run watchcheck -- --only ssx
import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { readFileSync } from 'node:fs'

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
    // id, hook, extra waits, and an optional custom advanced/note/probe/startKeys.
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
            const probe = g.probe || (() => page.evaluate((h) => window[h].probe(), H))
            for (const k of g.startKeys || ['Space']) { await key(page, k); await page.waitForTimeout(250) }
            await page.waitForTimeout(g.seatWait || 600)
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
    // #1637 batch 2 — the reactive solver titles. Every brain here is the same
    // per-tick decision the game's Node check grades, so the factory semantics
    // hold verbatim; only the advance predicate is game-specific.
    ...[
        {
            id: 'out-run', hook: '__outrunTest',
            // attract opens the radio screen; a second Space drops the flag
            // (200-tick count), so seat after the light goes green.
            startKeys: ['Space', 'Space'], seatWait: 3800, takeover: 'ArrowLeft',
            advanced: (a, b) => b.pos > a.pos + 100 && b.crashes === a.crashes,
            note: (a, b) => `pos ${a.pos} -> ${b.pos}, crashes ${a.crashes} held, gear ${b.gear}`,
        },
        {
            id: 'lunar-lander', hook: '__landerTest',
            // fuel burn is prover-only: an idle player never touches the throttle
            advanced: (a, b) => b.tick > a.tick && b.fuel < a.fuel,
            note: (a, b) => `fuel ${a.fuel} -> ${b.fuel}, alt ${a.alt} -> ${b.alt}, phase ${b.phase}`,
        },
        {
            id: 'outpost', hook: '__opTest',
            // its probe carries a live closure (cellAt) — take a serializable slice
            probeKeys: ['tick', 'dug', 'minedOre', 'harvested', 'food'],
            advanced: (a, b) => b.dug > a.dug || b.minedOre > a.minedOre || b.harvested > a.harvested,
            note: (a, b) => `dug ${a.dug} -> ${b.dug}, ore ${a.minedOre} -> ${b.minedOre}, farm ${a.harvested} -> ${b.harvested}`,
            resumeWait: 4500,
        },
        {
            id: 'polarity', hook: '__polarTest',
            advanced: (a, b) => b.score > a.score || Math.abs(b.player.x - a.player.x) > 4,
            note: (a, b) => `score ${a.score} -> ${b.score}, x ${a.player.x.toFixed(0)} -> ${b.player.x.toFixed(0)}, wave ${b.wave}`,
        },
        {
            id: 'missile-battle', hook: '__mbTest',
            // firing is prover-only — an idle player never launches; cities held
            advanced: (a, b) => b.fired > a.fired && b.cities.filter((c) => c).length === a.cities.filter((c) => c).length,
            note: (a, b) => `fired ${a.fired} -> ${b.fired}, kills ${a.kills} -> ${b.kills}, cities held`,
            advanceWait: 6000,
        },
        {
            id: 'smash-tv', hook: '__smashTest',
            advanced: (a, b) => b.score > a.score,
            note: (a, b) => `score ${a.score} -> ${b.score}, room ${b.room}, lives ${b.lives} held`,
            advanceWait: 6000,
        },
        {
            id: 'mario-kart', hook: '__kartTest',
            // the count eats the first beats; v > 0.3 cannot happen on an idle grid
            seatWait: 1200, advanceWait: 6000, takeover: 'ArrowLeft', resumeWait: 4500,
            advanced: (a, b) => b.tick > a.tick && b.v > 0.3,
            note: (a, b) => `v ${a.v} -> ${b.v}, lap ${b.lap + 1}/5, place ${b.place}`,
        },
    ].map((g) => ({
        id: g.id, url: `${BASE}/${g.id}`, hook: g.hook,
        async run(page, rep) {
            const H = g.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = g.probeKeys
                ? () => page.evaluate((a) => { const p = window[a.h].probe(); const o = {}; for (const k of a.keys) o[k] = p[k]; return o }, { h: H, keys: g.probeKeys })
                : () => page.evaluate((h) => window[h].probe(), H)
            for (const k of g.startKeys || ['Space']) { await key(page, k); await page.waitForTimeout(250) }
            await page.waitForTimeout(g.seatWait || 600)
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
    // #1637 batch 3 — the strategy/dungeon brains. Same factory semantics: these
    // drivers grade themselves in civcheck/citycheck/bardscheck/tendeepcheck/popcheck/
    // gauntletcheck/blobcheck, so the browser pilot only has to prove the seat works.
    // Ten Deep and Bard's Tale are command-paced: their tick ONLY moves when a
    // command is issued — tick growth while nobody touches the keys is prover-only.
    ...[
        {
            id: 'gauntlet', hook: '__gauntletTest',
            startKeys: ['Space', 'Space'], seatWait: 700, // attract -> select -> play
            advanced: (a, b) => b.score > a.score || b.keys > a.keys || b.level > a.level || Math.hypot(b.x - a.x, b.y - a.y) > 2,
            note: (a, b) => `score ${a.score} -> ${b.score}, keys ${a.keys} -> ${b.keys}, maze ${b.level + 1}`,
        },
        {
            id: 'four-halls', hook: '__fourHallsTest',
            startKeys: ['Space', 'Space'], seatWait: 700,
            advanced: (a, b) => b.score > a.score || b.keys > a.keys || b.level > a.level || Math.hypot(b.hero.x - a.hero.x, b.hero.y - a.hero.y) > 1,
            note: (a, b) => `score ${a.score} -> ${b.score}, keys ${a.keys} -> ${b.keys}, hall ${b.level + 1}`,
        },
        {
            id: 'prince-of-persia', hook: '__popTest',
            advanced: (a, b) => b.attract === false && (Math.abs(b.x - a.x) > 4 || b.room !== a.room),
            note: (a, b) => `x ${a.x.toFixed(0)} -> ${b.x.toFixed(0)}, room ${a.room} -> ${b.room}, clock ${b.clock}`,
        },
        {
            id: 'civilization-v', hook: '__civTest',
            seatWait: 900, advanceWait: 8000,
            advanced: (a, b) => b.turn > a.turn && b.end !== 'lost',
            note: (a, b) => `turn ${a.turn} -> ${b.turn}, cities ${a.playerCities} -> ${b.playerCities}, science ${b.science.toFixed(0)}`,
            resumeWait: 6000,
        },
        {
            id: 'bards-tale', hook: '__bardsTest',
            // the sim step happens only per COMMAND — tick growth with no input is prover-only
            advanced: (a, b) => b.tick > a.tick + 5,
            note: (a, b) => `cmds ${a.tick} -> ${b.tick}, floor ${a.fi} -> ${b.fi}, gold ${b.gold}`,
        },
        {
            id: 'ten-deep', hook: '__deepTest',
            advanced: (a, b) => b.tick > a.tick + 5,
            note: (a, b) => `cmds ${a.tick} -> ${b.tick}, mode ${b.mode}`,
        },
        {
            id: 'blob-battle', hook: '__blobbattleTest',
            advanced: (a, b) => b.rounds[0] > a.rounds[0],
            note: (a, b) => `seat1 blobs ${a.rounds[0]} -> ${b.rounds[0]}, score ${b.scores[0]}`,
        },
    ].map((g) => ({
        id: g.id, url: `${BASE}/${g.id}`, hook: g.hook,
        async run(page, rep) {
            const H = g.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = g.probeKeys
                ? () => page.evaluate((a) => { const p = window[a.h].probe(); const o = {}; for (const k of a.keys) o[k] = p[k]; return o }, { h: H, keys: g.probeKeys })
                : () => page.evaluate((h) => window[h].probe(), H)
            for (const k of g.startKeys || ['Space']) { await key(page, k); await page.waitForTimeout(250) }
            await page.waitForTimeout(g.seatWait || 600)
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
        // SIMCITY-MIN — the honest junction (Paperboy semantics). The proven plan
        // is a fixed script; Y seats only while the live city still matches the
        // witness state-for-state (hash receipt). A tax nuke departs the line,
        // and there the watcher declines rather than replay a divergent script.
        id: 'simcity-min', url: `${BASE}/simcity-min`, hook: '__scTest',
        async run(page, rep) {
            const H = '__scTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')
            await page.waitForTimeout(600)
            await key(page, 'KeyY')
            rep.check('simcity-min: Y seats the plan on the fresh city', await watching())
            const a = await probe()
            await page.waitForTimeout(8000)
            const b = await probe()
            rep.check('simcity-min: the plan builds untouched (funds spent, blocks lit)',
                b.funds < a.funds || b.pop > a.pop || b.lit > a.lit,
                `funds ${a.funds} -> ${b.funds}, pop ${a.pop} -> ${b.pop}, lit ${a.lit} -> ${b.lit}, year ${b.year}`)
            await key(page, 'BracketLeft')                // tax off the witness line
            rep.check('simcity-min: a tax nudge takes over', !(await watching()))
            await key(page, 'KeyY')                      // city now diverges from the script
            await page.waitForTimeout(300)
            rep.check('simcity-min: off the witness says no guide (never a fake route)', !(await watching()))
        },
    },
    {
        // PAPERBOY — the honest junction. The proven pedal-line is a fixed-v script;
        // it re-seats only where stage-local time still matches the witness receipt.
        // Mid-stage the watcher declines with the honesty toast, never a fake route.
        id: 'paperboy', url: `${BASE}/paperboy`, hook: '__paperTest',
        async run(page, rep) {
            const H = '__paperTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')                       // attract -> play (fresh street)
            await page.waitForTimeout(600)
            await key(page, 'KeyY')
            rep.check('paperboy: Y seats the route at the stage junction', await watching())
            const a = await probe()
            await page.waitForTimeout(8000)
            const b = await probe()
            rep.check('paperboy: the route delivers papers untouched', b.delivered > a.delivered,
                `delivered ${a.delivered} -> ${b.delivered}, score ${b.score}, street ${b.si}`)
            await page.keyboard.down('ArrowLeft')
            rep.check('paperboy: steer key takes over', !(await watching()))
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')                       // mid-stage: the honest decline
            await page.waitForTimeout(300)
            rep.check('paperboy: mid-stage re-seat says no guide (never a fake route)', !(await watching()))
        },
    },
    {
        // ICE CLIMBER — the route re-plans from the LIVE dwarf state at every
        // seat (the planner's macros are closed-loop, the same path icecheck's
        // PROGNOSIS runs), so takeover and re-seat resume from exactly there.
        id: 'ice-climber', url: `${BASE}/ice-climber`, hook: '__iceTest',
        async run(page, rep) {
            const H = '__iceTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')
            await page.waitForTimeout(600)
            await key(page, 'KeyY')
            rep.check('ice-climber: Y starts the solver (plans from the live state)', await watching())
            const a = await probe()
            await page.waitForTimeout(6000)
            const b = await probe()
            rep.check('ice-climber: the route bores ice untouched', b.climbers[0].digs + b.climbers[1].digs > a.climbers[0].digs + a.climbers[1].digs,
                `digs ${a.climbers[0].digs + a.climbers[1].digs} -> ${b.climbers[0].digs + b.climbers[1].digs}, bore rows ${b.boreRows.length}`)
            await page.keyboard.down('ArrowLeft')
            rep.check('ice-climber: steer key takes over', !(await watching()))
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')                       // re-seat: re-plan from HERE
            rep.check('ice-climber: Y re-seats by re-planning from where the dwarves stand', await watching())
            const c = await probe()
            await page.waitForTimeout(4500)
            const d = await probe()
            rep.check('ice-climber: resumes from where the player left it', d.climbers[0].digs + d.climbers[1].digs > c.climbers[0].digs + c.climbers[1].digs,
                `digs ${c.climbers[0].digs + c.climbers[1].digs} -> ${d.climbers[0].digs + d.climbers[1].digs}`)
            await key(page, 'KeyY')
            rep.check('ice-climber: Y again releases the watcher', !(await watching()))
        },
    },
    {
        id: 'ssx', url: `${BASE}/ssx`, hook: '__ssxTest',
        async run(page, rep) {
            await key(page, 'Space')                       // attract -> race (count)
            await page.waitForTimeout(500)
            await key(page, 'KeyY')
            rep.check('SSX: Y starts the watcher', await page.evaluate(() => window.__ssxTest.watching()))
            rep.check('SSX: handoff blip at start',
                (await page.evaluate(() => window.__ssxTest.watchSfx())).at(-1) === 'start')
            await page.waitForTimeout(7000)               // count + some downhill
            const s1 = await page.evaluate(() => window.__ssxTest.probe())
            await page.waitForTimeout(1500)
            const s2 = await page.evaluate(() => window.__ssxTest.probe())
            rep.check('SSX: the rider runs the line untouched', s1.tick < s2.tick && s2.p.s > s1.p.s,
                `s ${s1.p.s.toFixed(0)} -> ${s2.p.s.toFixed(0)} @v ${s2.p.v.toFixed(1)}`)
            rep.check('SSX: still watching mid-hill', await page.evaluate(() => window.__ssxTest.watching()))
            await page.keyboard.down('ArrowLeft')          // the player takes over
            rep.check('SSX: steer key takes over', !(await page.evaluate(() => window.__ssxTest.watching())))
            rep.check('SSX: handoff blip on takeover',
                (await page.evaluate(() => window.__ssxTest.watchSfx())).at(-1) === 'stop')
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
            rep.check('EMBERWOOD: handoff blip at start',
                (await page.evaluate(() => window.__emberwoodTest.watchSfx())).at(-1) === 'start')
            await page.waitForTimeout(4000)
            const mid = await page.evaluate(() => window.__emberwoodTest.heroPos())
            rep.check('EMBERWOOD: the prover walks without input',
                Math.hypot(mid.x - hero0.x, mid.y - hero0.y) > 6,
                `moved ${Math.hypot(mid.x - hero0.x, mid.y - hero0.y).toFixed(0)}px`)
            await page.keyboard.down('ArrowLeft')
            rep.check('EMBERWOOD: arrow key takes over', !(await page.evaluate(() => window.__emberwoodTest.watching())))
            rep.check('EMBERWOOD: handoff blip on takeover',
                (await page.evaluate(() => window.__emberwoodTest.watchSfx())).at(-1) === 'stop')
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
            rep.check('MYST: handoff blip once the route is proven',
                (await page.evaluate(() => window.__mystTest.watchSfx())).at(-1) === 'start')
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
            rep.check('MYST: handoff blip on takeover',
                (await page.evaluate(() => window.__mystTest.watchSfx())).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            // honesty clause: parked off the proven line, the watcher declines.
            // goto('selGate') puts the dock-fresh player at a route node whose
            // route state has many flags — no junction can match.
            await page.evaluate(() => window.__mystTest.goto('selGate'))
            await page.waitForTimeout(300)
            await key(page, 'KeyY')
            await page.waitForTimeout(1200)
            const off = await page.evaluate(() => ({ w: window.__mystTest.watching(), len: window.__mystTest.watchLen(), n: window.__mystTest.watchSfx().length }))
            rep.check('MYST: off the proven line says no guide (watcher never starts)', !off.w && off.len === 0)
            rep.check('MYST: a declined guide makes no sound', off.n === 2, `sfx log ${off.n} (start+stop from the live watch, nothing from the decline)`)
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
// #1638 source gates — one shared voice for the handoff, discoverable copy:
// a game that stops blipping (or ships an attract screen without the hint)
// goes red without needing Chrome to catch the audio.
// #1654 — the full roster: every WATCH pilot, not just the first three.
rep.section && rep.section('source')
const FLAGSHIP = ['SSX', 'Emberwood', 'Myst']
const ARCADE = ['Qbert', 'Joust', 'Galaga', 'Tempest', 'DigDug', 'BubbleBobble',
    'SpyHunter', 'Arkanoid', 'OutRun', 'LunarLander', 'Outpost', 'Polarity',
    'MissileBattle', 'SmashTV', 'MarioKart', 'Gauntlet', 'FourHalls',
    'PrinceOfPersia', 'CivilizationV', 'BardsTale', 'TenDeep', 'BlobBattle',
    'SimCityMin', 'Paperboy', 'IceClimber']
const watchSrc = readFileSync('src/utils/watch.js', 'utf8')
rep.check('watch.js: one shared blip pair, audible (two tones each)',
    /export const playWatchStart[\s\S]*?playTone\([\s\S]*?playTone\([\s\S]*?export const playWatchStop[\s\S]*?playTone\([\s\S]*?playTone\(/.test(watchSrc))
rep.check('watch.js: exports the shared attract hint', /export const WATCH_ATTRACT_HINT = 'Y — WATCH THE PROVEN ROUTE'/.test(watchSrc))
for (const g of [...FLAGSHIP, ...ARCADE]) {
    const src = readFileSync(`src/games/${g}/index.jsx`, 'utf8')
    rep.check(`${g}: imports the shared blips and logs`,
        /from '\.\.\/\.\.\/utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
}
for (const g of FLAGSHIP) {
    const src = readFileSync(`src/games/${g}/index.jsx`, 'utf8')
    rep.check(`${g}: attract screen shows the WATCH hint`,
        /screen === 'attract'[\s\S]{0,1600}?Y — [Ww][Aa][Tt][Cc][Hh] THE PROVEN ROUTE/i.test(src))
}
// #1654: the arcade family draws WATCH_ATTRACT_HINT — JSX titles in index.jsx,
// the canvas contracts in attract.js (import + a drawn line, no orphans).
for (const g of ARCADE) {
    let src = readFileSync(`src/games/${g}/index.jsx`, 'utf8')
    try { src += '\n' + readFileSync(`src/games/${g}/attract.js`, 'utf8') } catch { /* canvas-direct */ }
    rep.check(`${g}: attract screen shows the WATCH hint`, (src.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
}
rep.exit()
