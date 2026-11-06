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
    // #1637 batch 4 — the IF/physics remainder. Drivers here are the same ones
    // robokitcheck/floorbosscheck/ironringcheck/rallycheck grade, and all four are
    // closed-loop (pad out of live state), so seat/takeover/re-seat semantics hold
    // verbatim. RobotLab's route is a waypoint script proven from a fresh bench,
    // so its watch seats clean only — the takeover below never banks a goal, so
    // the mid-run re-seat is honest by construction.
    ...[
        {
            id: 'robot-lab', hook: '__robotTest',
            // Space starts a run; the seat needs the fresh bench (clean junction).
            startKeys: ['Space'], seatWait: 700,
            advanced: (a, b) => b.tick > a.tick && (
                Math.max(Math.abs(b.hand[0] - a.hand[0]), Math.abs(b.hand[1] - a.hand[1]), Math.abs(b.hand[2] - a.hand[2])) > 0.02
                || b.score > a.score || Object.values(b.goals).some(Boolean)),
            note: (a, b) => `hand ${(a.hand[1] ?? 0).toFixed(2)} -> ${(b.hand[1] ?? 0).toFixed(2)}, goals ${Object.entries(b.goals).filter(([, v]) => v).map(([k]) => k).join('+') || 'none'}, score ${b.score}`,
        },
        {
            id: 'floor-boss', hook: '__floorbossTest',
            // score/stows are prover-only — an idle shift makes nothing
            startKeys: ['Space'], seatWait: 700, advanceWait: 8000,
            advanced: (a, b) => b.score > a.score || b.shipped > a.shipped || b.stows > a.stows,
            note: (a, b) => `score ${a.score} -> ${b.score}, stows ${a.stows} -> ${b.stows}, shipped ${a.shipped} -> ${b.shipped}`,
        },
        {
            id: 'iron-ring', hook: '__ironRingTest',
            // Digit1 inserts the coin (attract -> select), Space picks (cpu ladder)
            startKeys: ['Digit1', 'Space'], seatWait: 800, advanceWait: 6000,
            advanced: (a, b) => b.tick > a.tick && (Math.abs(b.x[0] - a.x[0]) > 0.08 || b.hp[1] < a.hp[1] || b.wins[0] > a.wins[0]),
            note: (a, b) => `p1 x ${a.x[0]} -> ${b.x[0]}, p2 hp ${a.hp[1]} -> ${b.hp[1]}, rounds ${b.wins[0]}`,
            resumeWait: 4500,
        },
        {
            id: 'rally-co-driver', hook: '__rallyTest',
            // Space kicks the race; the 3-2-1-GO lights hold physics ~4 s — seat
            // after GO, then the pace brain's throttle cannot come from idle keys.
            startKeys: ['Space'], seatWait: 4600, advanceWait: 6000, resumeWait: 4500,
            advanced: (a, b) => b.tick > a.tick && b.speed > 0.3,
            note: (a, b) => `v ${a.speed.toFixed(1)} -> ${b.speed.toFixed(1)}, lap ${b.lap + 1}/2, progress ${(b.progress * 100).toFixed(0)}%`,
            takeover: 'ArrowLeft',
        },
    ].map((g) => ({
        id: g.id, url: `${BASE}/${g.id}`, hook: g.hook,
        async run(page, rep) {
            const H = g.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
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
    // #1637 batch 5 — the reactive solvers their own harnesses grade. Factory
    // semantics hold verbatim; each advance signal is prover-only: an idle
    // player watching nothing cannot produce it (the sim tick advances anyway,
    // the runner/yeoman/scout only move when the brain drives them).
    ...[
        {
            id: 'lode-runner', hook: '__lodeTest',
            // planStep re-plans from live state every move and its route never
            // digs — a watched vault is never trashed. Runner movement is prover-only.
            startKeys: ['Space'], seatWait: 700, advanceWait: 6000,
            advanced: (a, b) => b.tick > a.tick && (b.have > a.have || Math.abs(b.player.x - a.player.x) + Math.abs(b.player.y - a.player.y) > 1),
            note: (a, b) => `runner (${a.player.x},${a.player.y}) -> (${b.player.x},${b.player.y}), gold ${b.have}/${b.need}, vault ${b.level + 1}`,
            resumeWait: 4500,
        },
        {
            id: 'arena-archery', hook: '__archeryTest',
            // seat 1 becomes the archerycheck winner (botInput skill 1). Idle
            // seat-1 keys never draw or walk, so movement/score/ammo spend at
            // seat 1 all prove the brain is flying — not the player.
            startKeys: ['Space'], seatWait: 700, advanceWait: 6000,
            advanced: (a, b) => b.tick > a.tick && (Math.hypot(b.p1.x - a.p1.x, b.p1.y - a.p1.y) > 20 || b.p1.score > a.p1.score || b.p1.quiver < a.p1.quiver),
            note: (a, b) => `P1 (${Math.round(a.p1.x)},${Math.round(a.p1.y)}) -> (${Math.round(b.p1.x)},${Math.round(b.p1.y)}), score ${b.scores[0]}-${b.scores[1]}, quiver ${b.p1.quiver}`,
            resumeWait: 4500,
        },
        {
            id: 'dogfight', hook: '__dogTest',
            // an idle plane flies straight: yaw and pitch sit and the belt
            // stays full. The pilot zoom-climbs the opening (pitch), banks
            // onto the bandits (yaw) and fires on a predictHit receipt (belt).
            startKeys: ['Space'], seatWait: 700, advanceWait: 6000,
            advanced: (a, b) => b.tick > a.tick && (Math.abs(b.p.pitch - a.p.pitch) > 0.05 || Math.abs(b.p.yaw - a.p.yaw) > 0.08 || b.p.belt < a.p.belt),
            note: (a, b) => `pitch ${(a.p.pitch * 57.3).toFixed(1)}° -> ${(b.p.pitch * 57.3).toFixed(1)}°, yaw ${(a.p.yaw * 57.3).toFixed(1)}° -> ${(b.p.yaw * 57.3).toFixed(1)}°, belt ${a.p.belt} -> ${b.p.belt}, v ${b.p.v.toFixed(0)} m/s`,
            resumeWait: 4500,
        },
    ].map((g) => ({
        id: g.id, url: `${BASE}/${g.id}`, hook: g.hook,
        async run(page, rep) {
            const H = g.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
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
        // ZORK I — commands, not pads. The Y key mounts the same ZorkExplorer +
        // AgentLoop zorkcheck drives, through the same send the form uses (one
        // driver; the loop owns its clock). Progress is graded on exchanges: an
        // idle player at a prompt types nothing.
        id: 'zork', url: `${BASE}/zork`, hook: '__zorkTest',
        async run(page, rep) {
            await page.waitForFunction(() => window.__zorkTest && window.__zorkTest.ready(), null, { timeout: 30000 })
            // the machine needs its first prompt before a command can land
            await page.waitForFunction(() => window.__zorkTest.state().inputEnabled, null, { timeout: 30000 })
            const watching = () => page.evaluate(() => window.__zorkTest.watching())
            const probe = () => page.evaluate(() => window.__zorkTest.probe())
            await key(page, 'KeyY')                       // prompt focused but empty -> the guide key
            rep.check('zork: Y seats the explorer brain', await watching())
            rep.check('zork: handoff blip at start',
                (await page.evaluate(() => window.__zorkTest.watchSfx())).at(-1) === 'start')
            const a = await probe()
            await page.waitForTimeout(8000)
            const b = await probe()
            rep.check('zork: the brain plays untouched (commands not pads)', b.exchanges > a.exchanges,
                `moves ${a.exchanges} -> ${b.exchanges}, room ${b.room || '?'}, lines ${b.lines}`)
            await page.keyboard.press('ArrowLeft')
            rep.check('zork: any key takes the keyboard back', !(await watching()))
            rep.check('zork: handoff blip on takeover',
                (await page.evaluate(() => window.__zorkTest.watchSfx())).at(-1) === 'stop')
            await key(page, 'KeyY')                       // re-seat from wherever the player stopped
            rep.check('zork: Y re-seats the brain mid-run', await watching())
            const c = await probe()
            await page.waitForTimeout(6000)
            const d = await probe()
            rep.check('zork: resumes from where the player left it', d.exchanges > c.exchanges,
                `moves ${c.exchanges} -> ${d.exchanges}, room ${d.room || '?'}`)
            await key(page, 'KeyY')
            rep.check('zork: Y again releases the brain', !(await watching()))
        },
    },
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
if (!run.length && ONLY !== 'phone' && ONLY !== null) {
    // --only also names phone-only routes (the registry drives that list)
    const routes = readFileSync('src/config/games.js', 'utf8').match(/path: '([^']+)'/g) || []
    if (!routes.some((r) => r.includes(`'/${ONLY}'`))) { console.error(`unknown --only "${ONLY}"`); process.exit(1) }
}

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
// #1637 batch-4 source pins — the honesty rules that don't need Chrome:
const B4_SRC = {
    'ZORK': 'src/games/Zork/index.jsx',
    'ROBOTLAB': 'src/games/RobotLab/index.jsx',
    'FLOORBOSS': 'src/games/FloorBoss/index.jsx',
    'IRONRING': 'src/games/IronRing/index.jsx',
    'RALLY': 'src/games/RallyCoDriver/index.jsx',
}
for (const [name, f] of Object.entries(B4_SRC)) {
    const src = readFileSync(f, 'utf8')
    rep.check(`${name}: imports the shared blips and logs`,
        /utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
}
{
    const zorkSrc = readFileSync(B4_SRC.ZORK, 'utf8')
    rep.check('ZORK: the watch gate is ZORK I only (the sequels carry no proven route)',
        /const canWatch = route === '\/zork'/.test(zorkSrc) && /if \(!canWatch \|\| aiOn\) return/.test(zorkSrc))
    const rlSrc = readFileSync(B4_SRC.ROBOTLAB, 'utf8')
    rep.check('ROBOTLAB: Y seats at a clean bench only, and declines with the shared no-guide copy',
        /const clean = !st\.done && !st\.timeout && !st\.held && !Object\.values\(st\.goals\)\.some\(Boolean\)/.test(rlSrc)
        && /NO_GUIDE/.test(rlSrc))
    const fbSrc = readFileSync(B4_SRC.FLOORBOSS, 'utf8')
    rep.check('FLOORBOSS: the watching branch feeds the autopilot pad into the episode tick (no human-shaped lie)',
        /const pad = watchingRef\.current && !gs\.end \? ap\(gs\) : livePad\(\)[\s\S]{0,80}recordTick\(pad\)/.test(fbSrc))
    const rlySrc = readFileSync(B4_SRC.RALLY, 'utf8')
    // #1663 updated: net never seats the watcher AND says so (amber chip, not silence).
    rep.check('RALLY: online never seats the watcher (the wire owns the seats)',
        /if \(code === WATCH_KEY && down\) \{\s*if \(net\.active\) \{/.test(rlySrc)
        && /setNoGuide\(true\)/.test(rlySrc) && /NO_GUIDE/.test(rlySrc))
    // ---- #1663 polish-pass pins: discoverability + honesty copy, per title.
    rep.check('ZORK: idle status strip teaches the watch key',
        /'PRESS Y TO WATCH THE PROVEN ROUTE'/.test(zorkSrc))
    rep.check('ZORK: the pill rides the status strip, never floats over the story',
        /top: '50%', right: 'calc\(0\.5rem \+ var\(--sar, 0px\)\)'/.test(zorkSrc)
        && !/top: 'calc\(3\.5rem/.test(zorkSrc))
    rep.check('ROBOTLAB: attract teaches Y (and when it seats)',
        /WATCH THE PROVEN RUN · AT A FRESH BENCH/.test(rlSrc))
    rep.check('ROBOTLAB: the decline chip teaches WHEN the guide is available, ~1.5s',
        /PRESS Y AT A FRESH BENCH/.test(rlSrc) && /setNoGuide\(false\) \}, 1500\)/.test(rlSrc))
    rep.check('FLOORBOSS: attract carries a static watch line of its own',
        /PRESS Y TO WATCH THE PROVEN SHIFT/.test(fbSrc))
    rep.check('FLOORBOSS: watch never lingers — cleared at shift end AND at every start',
        /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 the shift ends in your hands/.test(fbSrc)
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 a new shift starts in your hands/.test(fbSrc))
    const irSrc = readFileSync(B4_SRC.IRONRING, 'utf8')
    rep.check('IRONRING: title card carries the watch hint, offline only',
        /if \(!net\.active\) \{[\s\S]{0,200}PRESS Y TO WATCH THE CHAMPION/.test(irSrc))
    rep.check('RALLY: attract teaches the pace-brain route, solo only',
        /if \(!net\.active\) \{[\s\S]{0,200}Y: WATCH THE PACENOTE ROUTE/.test(rlySrc))
    rep.check('RALLY: while watching, the HUD names the driver BRAIN (never implies hands on)',
        /watchSeat\.on && !net\.active[\s\S]{0,240}DRIVER: BRAIN/.test(rlySrc))
    // registry copy: the five new titles carry the WATCH line; the unproven two don't.
    const reg = readFileSync('src/config/games.js', 'utf8')
    const entryHas = (p, s) => { const m = reg.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const p of ['/zork', '/robot-lab', '/floor-boss', '/iron-ring', '/rally-co-driver'])
        rep.check(`registry ${p}: controls carry the WATCH line`, entryHas(p, 'WATCH_HELP'))
    for (const p of ['/zork2', '/zork3'])
        rep.check(`registry ${p}: no WATCH line (the brain is proven on Zork I only)`, !entryHas(p, 'WATCH_HELP'))
}
// ---- #1637 batch-5 source pins — the honesty rules that don't need Chrome ----
{
    const B5_SRC = {
        'LODERUNNER': 'src/games/LodeRunnerLite/index.jsx',
        'ARENAARCHERY': 'src/games/ArenaArchery/index.jsx',
        'DOGFIGHT': 'src/games/Dogfight/index.jsx',
    }
    for (const [name, f] of Object.entries(B5_SRC)) {
        const src = readFileSync(f, 'utf8')
        rep.check(`${name}: imports the shared blips and logs`,
            /utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
        rep.check(`${name}: attract screen shows the WATCH hint`, (src.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    }
    const lrSrc = readFileSync(B5_SRC.LODERUNNER, 'utf8')
    rep.check('LODERUNNER: the watcher seats planStep — the solver route never digs (held keys bypassed)',
        /if \(watchingRef\.current\) \{[\s\S]{0,260}?const a = planStep\(gs\)/.test(lrSrc))
    const aaSrc = readFileSync(B5_SRC.ARENAARCHERY, 'utf8')
    rep.check('ARENAARCHERY: seat 1 = botInput(gs, 0, 1), the skill the harness wins with',
        /const in1 = watchingRef\.current \? botInput\(gs, 0, 1\) : inputOf\(held, P1_KEYS\)/.test(aaSrc))
    rep.check('ARENAARCHERY: seat-2 keys never unseat the watcher (partner keeps their seat)',
        /watchingRef\.current && isTakeoverKey\(e\) && !\(mode === '2p' && P2_CODES\.has\(e\.code\)\)/.test(aaSrc))
    const dfSrc = readFileSync(B5_SRC.DOGFIGHT, 'utf8')
    rep.check('DOGFIGHT: the watcher flies pilotInput and the throttle lever follows the plane',
        /pilotInput\(gs\)/.test(dfSrc) && /throttle = ai\.throttle/.test(dfSrc))
    // registry copy: the three new titles carry the WATCH line; the honest
    // no-guide remainder (DOS/IF + MagicCarpet: no proven solver) must not.
    const reg5 = readFileSync('src/config/games.js', 'utf8')
    const entryHas5 = (p, s) => { const m = reg5.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const p of ['/lode-runner', '/arena-archery', '/dogfight'])
        rep.check(`registry ${p}: controls carry the WATCH line`, entryHas5(p, 'WATCH_HELP'))
    for (const p of ['/kingsquest', '/britannia', '/magic-carpet'])
        rep.check(`registry ${p}: no WATCH line (no proven solver drives it yet)`, !entryHas5(p, 'WATCH_HELP'))
}
// #1654 item 6: the house style is ONE shared banner. Eight raw per-game divs
// in four palettes had drifted back in after #1650 folded the rest — a stray
// copy of the contract text anywhere outside the shared component goes red.
{
    const shared = readFileSync('src/components/WatchButton.jsx', 'utf8')
    rep.check('WatchToast: the shared banner holds the contract copy',
        shared.includes('WATCHING — THE PROVEN ROUTE · ANY INPUT TAKES OVER'))
    const stray = []
    for (const g of [...FLAGSHIP, ...ARCADE]) {
        if (readFileSync(`src/games/${g}/index.jsx`, 'utf8').includes('WATCHING — THE PROVEN ROUTE')) stray.push(g)
    }
    for (const f of Object.values(B4_SRC)) {
        if (readFileSync(f, 'utf8').includes('WATCHING — THE PROVEN ROUTE')) stray.push(f)
    }
    rep.check('every pilot renders the shared WatchToast (no per-game banner copies)', stray.length === 0, stray.join(', '))
}

// ---- #1667 phone section — the pill, driven by a real TOUCH at 390x844 ----
// The desktop pilots above prove the keyboard door; this proves the phone door:
// every shipped watch title renders its pill on-screen (inside the viewport,
// clear of the PAUSE chip — the #1653 inset law verified with live pixels,
// not just the parse), and one finger tap seats the watcher and releases it.
// `--phone` runs ONLY this section (that's what the soak-friendly slice is).
const PHONE = process.argv.includes('--phone') || ONLY === 'phone'
const PHONE_TITLES = (() => {
    // same chunk-split parse as the batch-4 registry gates: entries start at path:
    const src = readFileSync('src/config/games.js', 'utf8')
    return src.split(/path: '/).slice(1)
        .map((chunk) => [chunk.match(/^([^']+)'/)[1], chunk.split('\n  },')[0]])
        .filter(([, body]) => body.includes('WATCH_HELP'))
        .map(([p]) => p)
})()
if (PHONE) {
    const MINDIM = 30 // shipped pill is 64x34; #1666 will raise it to 44 — the floor catches a shrink regression
    const titles = (ONLY && ONLY !== 'phone') ? PHONE_TITLES.filter((t) => t === `/${ONLY}`) : PHONE_TITLES
    // #1575 lesson: a parse that silently finds nothing gates nothing.
    rep.check(`phone: registry parse finds the advertised WATCH titles`, PHONE_TITLES.length >= 33,
        `${PHONE_TITLES.length} titles parsed`)
    const browser = await launch()
    console.log(`\n— phone 390x844 (boot ${browser.__bootMode || 'chrome'}), ${titles.length} watch titles`)
    for (const p of titles) {
        const id = p.replace(/^\//, '')
        const hook = (PILOTS.find((x) => x.url === `${BASE}/${id}`) || {}).hook
        if (!hook) { rep.check(`phone ${id}: hook known`, false, 'no watch pilot maps this route — PILOTS and the registry drifted'); continue }
        let page = null
        for (let attempt = 0; attempt < 2 && !page; attempt++) {
            try {
                page = await browser.newPage({
                    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
                })
                page.setDefaultTimeout(45000)
                await page.goto(`${BASE}/${id}`, { waitUntil: 'load' })
                await page.waitForFunction((h) => !!window[h], hook, { timeout: 25000 })
            } catch {
                if (page) { await page.close().catch(() => {}); page = null }
                if (attempt === 1) rep.check(`phone ${id}: page mounted at 390x844`, false, 'DEV hook never appeared')
            }
        }
        if (!page) continue
        try {
            const pill = page.locator('[data-watch-toggle="1"]').first()
            await pill.waitFor({ state: 'visible', timeout: 8000 })
            const box = await pill.boundingBox()
            rep.check(`phone ${id}: pill on-screen at 390x844`,
                box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844,
                box && `(${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}x${box.height.toFixed(0)})`)
            rep.check(`phone ${id}: pill >= ${MINDIM}px tall`, box && box.height >= MINDIM, box && `${box.height.toFixed(0)}px`)
            const pause = page.locator('text=/^PAUSE$/').first()
            if (await pause.count()) {
                const pb = await pause.boundingBox()
                const clear = !pb || pb.y + pb.height <= box.y + 2 || box.y + box.height <= pb.y + 2 || pb.x + pb.width <= box.x || box.x + box.width <= pb.x
                rep.check(`phone ${id}: pill clear of PAUSE (#1653 insets law, live)`, clear, pb && `pause(${pb.x.toFixed(0)},${pb.y.toFixed(0)} ${pb.width.toFixed(0)}x${pb.height.toFixed(0)}) vs pill(${box.x.toFixed(0)},${box.y.toFixed(0)})`)
            }
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
            await page.waitForTimeout(900)
            rep.check(`phone ${id}: TAP seats the watcher`, await page.evaluate((h) => window[h].watching(), hook))
            const nb = await pill.boundingBox()
            await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2)
            await page.waitForTimeout(400)
            rep.check(`phone ${id}: TAP again releases it`, !(await page.evaluate((h) => window[h].watching(), hook)))
        } catch (e) {
            rep.check(`phone ${id}: pill driven without page error`, false, e.message)
        }
        await page.close().catch(() => {})
    }
    await browser.close().catch(() => {})
}
rep.exit()
