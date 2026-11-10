// watchcheck — #1624 WATCH key, driven for real in Chrome.
// For each pilot (SSX, Emberwood, MYST): press Y and prove the game plays
// itself on its proven route (sim state advances with nobody touching it),
// then press an ordinary input and prove the player takes over immediately.
// Needs the dev server (DEV hooks are DEV-only):  npm run dev -- --port <p>
//
//   npm run watchcheck            # all three pilots
//   npm run watchcheck -- --only ssx
import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { readFileSync, realpathSync, existsSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'

const BASE = process.env.WATCH_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]
  || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null)

const key = (page, code) => page.keyboard.press(code)

// #1722 — late-seat guard (CI timing family). On CI Chrome (software-rendered) the
// seat lands late: a planner/hash receipt finishes a few ticks after the key, so a
// single reading of watching() right after KeyY is false while the watcher really
// seats moments later (the advance gate right after passes — the watcher drove).
// Poll the seat instead of sleeping a bigger constant; gates that require a DECLINE
// still read once — this only waits for a seat the game genuinely provides.
const seatPoll = (page, H, ms = 2500) =>
    page.waitForFunction((h) => window[h].watching(), H, { timeout: ms }).catch(() => {})

// #601 lesson: CI filesystems are case-sensitive, macOS APFS is not. A roster
// name that differs from disk only in case (Qbert vs QBert) boots fine on the
// dev box and ENOENT-crashes the whole nightly smoke mid-suite. realpathSync
// reports the TRUE casing even on macOS, so this guard catches it anywhere.
function readRoster(rel) {
    const abs = pathResolve(rel)
    const real = realpathSync(abs)
    if (real !== abs) throw new Error(`roster case mismatch: ${rel} resolves to ${real} on disk — CI would ENOENT`)
    return readFileSync(rel, 'utf8')
}

// Nightly #40 lesson: CI's software-rendered Chrome can starve the frame clock
// for seconds, and a single probe at the end of a fixed window calls a healthy
// prover "no progress" (iron-ring/SSX 0-progress FAILs that pass locally every
// time, and a stale dev server can fake the same verdict). Poll instead: sleep
// the honest window, then keep probing until a 3x ceiling. The rule is intact —
// progress is REQUIRED by the ceiling — only its meaning hardened from "exactly
// at 5 s" to "by the ceiling", which is what the game promises, not Chrome.
const pollAdvance = async (page, probe, advanced, a, waitMs) => {
    const t0 = Date.now()
    await page.waitForTimeout(waitMs)
    let b = await probe()
    while (!advanced(a, b) && Date.now() - t0 < waitMs * 3) {
        await page.waitForTimeout(250)
        b = await probe()
    }
    return b
}

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
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            // A revive-capable prover may have WON by now — releasing the
            // watch at the end of the run is the honest behaviour (#1656), so
            // "no longer watching" here means the empire is done, not that
            // the watcher quit. The label names which it was.
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            // #1705-nightly-fix (opt-in revive): a prover can WIN inside the
            // advance window (civ-v takes its size-growth win ~turn 11 on the
            // default seed) — the chain below proves takeover/re-seat/resume
            // and needs a LIVE game. If the run ended, start a fresh empire
            // and re-seat: every promise still gets proven, just on the next
            // route the same brain runs.
            if (g.revive) {
                if (endedEarly) {
                    // over -> attract, attract -> play: two presses, and the
                    // revive waits past the over-screen dwell itself.
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            // #1637 b7: honest-decline family. A route proven ONLY from a fresh
            // bench (robot-lab's waypoint script) must refuse re-seat once the
            // bench left the proven line (goal banked / gear held). Fast boxes
            // bank progress inside the advance window; CI's slow software render
            // happened not to, so the old blanket "Y re-seats" expectation passed
            // by timing luck. On the decline path the resume proof cannot apply —
            // the refusal IS the promise (never a fake route).
            const stP = g.offLine ? await probe() : null
            const off = !!g.offLine && g.offLine(stP)
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            if (off) {
                rep.check(`${g.id}: mid-run re-seat declines off the proven bench (never a fake route)`, !(await watching()))
            } else {
                rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            }
            const c = await probe()
            if (!off) {
                const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
                rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            }
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
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            // A revive-capable prover may have WON by now — releasing the
            // watch at the end of the run is the honest behaviour (#1656), so
            // "no longer watching" here means the empire is done, not that
            // the watcher quit. The label names which it was.
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            // #1705-nightly-fix (opt-in revive): a prover can WIN inside the
            // advance window (civ-v takes its size-growth win ~turn 11 on the
            // default seed) — the chain below proves takeover/re-seat/resume
            // and needs a LIVE game. If the run ended, start a fresh empire
            // and re-seat: every promise still gets proven, just on the next
            // route the same brain runs.
            if (g.revive) {
                if (endedEarly) {
                    // over -> attract, attract -> play: two presses, and the
                    // revive waits past the over-screen dwell itself.
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            // #1637 b7: honest-decline family. A route proven ONLY from a fresh
            // bench (robot-lab's waypoint script) must refuse re-seat once the
            // bench left the proven line (goal banked / gear held). Fast boxes
            // bank progress inside the advance window; CI's slow software render
            // happened not to, so the old blanket "Y re-seats" expectation passed
            // by timing luck. On the decline path the resume proof cannot apply —
            // the refusal IS the promise (never a fake route).
            const stP = g.offLine ? await probe() : null
            const off = !!g.offLine && g.offLine(stP)
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            if (off) {
                rep.check(`${g.id}: mid-run re-seat declines off the proven bench (never a fake route)`, !(await watching()))
            } else {
                rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            }
            const c = await probe()
            if (!off) {
                const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
                rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            }
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
            seatWait: 900, advanceWait: 8000, revive: true, // the prover wins ~turn 11 — chain on the next empire if so
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
            // well.rounds counts rounds WON (the OTHER well overflowing, sim.js
            // :363) — demanding one inside the watch window asked the CPU to
            // drown in 5 s, which a healthy prover never causes. The prover's
            // promise is the contract of the game itself: seat 1 keeps stacking
            // and scoring without overflowing. #1705-nightly-fix.
            advanced: (a, b) => b.scores[0] > a.scores[0] && !b.over,
            note: (a, b) => `seat1 score ${a.scores[0]} -> ${b.scores[0]}, rounds won ${a.rounds[0]} -> ${b.rounds[0]}`,
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
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            // A revive-capable prover may have WON by now — releasing the
            // watch at the end of the run is the honest behaviour (#1656), so
            // "no longer watching" here means the empire is done, not that
            // the watcher quit. The label names which it was.
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            // #1705-nightly-fix (opt-in revive): a prover can WIN inside the
            // advance window (civ-v takes its size-growth win ~turn 11 on the
            // default seed) — the chain below proves takeover/re-seat/resume
            // and needs a LIVE game. If the run ended, start a fresh empire
            // and re-seat: every promise still gets proven, just on the next
            // route the same brain runs.
            if (g.revive) {
                if (endedEarly) {
                    // over -> attract, attract -> play: two presses, and the
                    // revive waits past the over-screen dwell itself.
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            // #1637 b7: honest-decline family. A route proven ONLY from a fresh
            // bench (robot-lab's waypoint script) must refuse re-seat once the
            // bench left the proven line (goal banked / gear held). Fast boxes
            // bank progress inside the advance window; CI's slow software render
            // happened not to, so the old blanket "Y re-seats" expectation passed
            // by timing luck. On the decline path the resume proof cannot apply —
            // the refusal IS the promise (never a fake route).
            const stP = g.offLine ? await probe() : null
            const off = !!g.offLine && g.offLine(stP)
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            if (off) {
                rep.check(`${g.id}: mid-run re-seat declines off the proven bench (never a fake route)`, !(await watching()))
            } else {
                rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            }
            const c = await probe()
            if (!off) {
                const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
                rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            }
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
            // #1637 b7: the route is proven from a FRESH bench, and the game itself
            // declines to re-seat once any goal is banked (the waypoint script no
            // longer applies — RobotLab/index.jsx seat rule). offLine names that
            // state so the harness grades the refusal it actually owes.
            offLine: (b) => Object.values(b.goals).some(Boolean),
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
            // #1722: round-start freeze outlived the fixed window on CI (advance
            // read -2.6 -> -2.6 while the resume leg advanced fine). Wait for the
            // bell: any fighter drift, hp spend or round won means the round is on.
            settle: (h) => {
                const w = (window.__watchSettle || (window.__watchSettle = {}))
                const p = window[h].probe()
                const prev = w.ironRing
                w.ironRing = { x0: p.x[0], x1: p.x[1], hp0: p.hp[0], hp1: p.hp[1], w0: p.wins[0] }
                return !!prev && (Math.abs(prev.x0 - p.x[0]) > 0.03 || Math.abs(prev.x1 - p.x[1]) > 0.03
                    || p.hp0 < prev.hp0 || p.hp1 < prev.hp1 || p.w0 > prev.w0)
            },
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
            // #1722: optional settle — wait for the round clock to actually move
            // before the advance window (iron-ring's round-start freeze outlived
            // the fixed window on CI; the resume leg proved the seat works).
            if (g.settle) await page.waitForFunction(g.settle, H, { timeout: 25000 }).catch(() => {})
            const a = await probe()
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            // A revive-capable prover may have WON by now — releasing the
            // watch at the end of the run is the honest behaviour (#1656), so
            // "no longer watching" here means the empire is done, not that
            // the watcher quit. The label names which it was.
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            // #1705-nightly-fix (opt-in revive): a prover can WIN inside the
            // advance window (civ-v takes its size-growth win ~turn 11 on the
            // default seed) — the chain below proves takeover/re-seat/resume
            // and needs a LIVE game. If the run ended, start a fresh empire
            // and re-seat: every promise still gets proven, just on the next
            // route the same brain runs.
            if (g.revive) {
                if (endedEarly) {
                    // over -> attract, attract -> play: two presses, and the
                    // revive waits past the over-screen dwell itself.
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            // #1637 b7: honest-decline family. A route proven ONLY from a fresh
            // bench (robot-lab's waypoint script) must refuse re-seat once the
            // bench left the proven line (goal banked / gear held). Fast boxes
            // bank progress inside the advance window; CI's slow software render
            // happened not to, so the old blanket "Y re-seats" expectation passed
            // by timing luck. On the decline path the resume proof cannot apply —
            // the refusal IS the promise (never a fake route).
            const stP = g.offLine ? await probe() : null
            const off = !!g.offLine && g.offLine(stP)
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            if (off) {
                rep.check(`${g.id}: mid-run re-seat declines off the proven bench (never a fake route)`, !(await watching()))
            } else {
                rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            }
            const c = await probe()
            if (!off) {
                const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
                rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            }
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
            // vault ticks restart on a carry — movement/gold/level alone prove
            // the sim advanced (an idle runner stands still); vaultCleared keeps
            // the guide seated across the carry, which the level bump records.
            advanced: (a, b) => b.have > a.have || b.level > a.level || Math.abs(b.player.x - a.player.x) + Math.abs(b.player.y - a.player.y) > 1,
            note: (a, b) => `runner (${a.player.x},${a.player.y}) -> (${b.player.x},${b.player.y}), gold ${b.have}/${b.need}, vault ${b.level + 1}`,
            resumeWait: 4500,
        },
        {
            id: 'arena-archery', hook: '__archeryTest',
            // seat 1 becomes the archerycheck winner (botInput skill 1). Idle
            // seat-1 keys never draw or walk, so movement/score/ammo spend at
            // seat 1 all prove the brain is flying — not the player.
            // Choreography is deliberate: the first kill lands early and the duel
            // then holds — in this CROSSGLOVE opening the bot-vs-bot economy drives
            // arrows into cells neither archer can reach and both stand until the
            // stuck-arrow TTL (CFG.stuckTTL=1200) drips the quivers back (~20 s,
            // measured). That's the game's own rule, so the resume leg waits
            // through it: deterministic, and the reopening + walk + shoot that
            // follows is exactly what a seated brain restarts from where the
            // player left it. The stalemate itself is game code, filed to QA
            // on #1637.
            startKeys: ['Space'], seatWait: 700, advanceWait: 8000, resumeWait: 30000,
            // seat-1-only signals: the foe bot lobs arrows on its own, so
            // "something flying" is NOT prover-only (a mutant with a dead seat 1
            // passed this leg until the mutant run proved it — moved/score/
            // quiver-spend at seat 1 are). No tick requirement: the tick clock
            // can stall under software rendering (lode-runner lesson).
            advanced: (a, b) => Math.hypot(b.p1.x - a.p1.x, b.p1.y - a.p1.y) > 20 || b.p1.score > a.p1.score || b.p1.quiver < a.p1.quiver,
            note: (a, b) => `P1 (${Math.round(a.p1.x)},${Math.round(a.p1.y)}) -> (${Math.round(b.p1.x)},${Math.round(b.p1.y)}), score ${b.scores[0]}-${b.scores[1]}, quiver ${b.p1.quiver}, flying ${b.flying}`,
        },
        {
            id: 'dogfight', hook: '__dogTest',
            // an idle plane flies straight: yaw and pitch sit and the belt
            // stays full. The pilot zoom-climbs the opening (pitch), banks
            // onto the bandits (yaw) and fires on a predictHit receipt (belt).
            // 14 s, not 6: software-rendered Chrome (this box + CI) runs the
            // WebGL world slower than real time, and the determinism of the
            // patrol means the banks land at fixed SIM ticks — the window must
            // cover them in wall seconds on the slowest honest clock.
            startKeys: ['Space'], seatWait: 700, advanceWait: 14000, resumeWait: 4500,
            advanced: (a, b) => Math.abs(b.p.pitch - a.p.pitch) > 0.05 || Math.abs(b.p.yaw - a.p.yaw) > 0.08 || b.p.belt < a.p.belt,
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
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            // A revive-capable prover may have WON by now — releasing the
            // watch at the end of the run is the honest behaviour (#1656), so
            // "no longer watching" here means the empire is done, not that
            // the watcher quit. The label names which it was.
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            // #1705-nightly-fix (opt-in revive): a prover can WIN inside the
            // advance window (civ-v takes its size-growth win ~turn 11 on the
            // default seed) — the chain below proves takeover/re-seat/resume
            // and needs a LIVE game. If the run ended, start a fresh empire
            // and re-seat: every promise still gets proven, just on the next
            // route the same brain runs.
            if (g.revive) {
                if (endedEarly) {
                    // over -> attract, attract -> play: two presses, and the
                    // revive waits past the over-screen dwell itself.
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            // #1637 b7: honest-decline family. A route proven ONLY from a fresh
            // bench (robot-lab's waypoint script) must refuse re-seat once the
            // bench left the proven line (goal banked / gear held). Fast boxes
            // bank progress inside the advance window; CI's slow software render
            // happened not to, so the old blanket "Y re-seats" expectation passed
            // by timing luck. On the decline path the resume proof cannot apply —
            // the refusal IS the promise (never a fake route).
            const stP = g.offLine ? await probe() : null
            const off = !!g.offLine && g.offLine(stP)
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            if (off) {
                rep.check(`${g.id}: mid-run re-seat declines off the proven bench (never a fake route)`, !(await watching()))
            } else {
                rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            }
            const c = await probe()
            if (!off) {
                const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
                rep.check(`${g.id}: resumes from where the player left it`, g.advanced(c, d), g.note(c, d))
            }
            await key(page, 'KeyY')                       // hand the controls back
            rep.check(`${g.id}: Y again releases the watcher`, !(await watching()))
        },
    })),
    // #1637 batch 6 — MAGIC CARPET. The seat is sim.js's own autopilot: the
    // brain the attract demo flies and carpetcheck's 60-seed sweep wins all
    // three worlds with. Seed-pinned (?seed=7 — a sweep seed) so the flight is
    // deterministic. Advance signals are prover-only (verified head-to-head
    // against an idle carpet on this seed: idle flies yaw-dead-straight and
    // never banks mana — |Δyaw| over even a 60-tick window is 0.65 for the
    // pilot vs 0.000 idle): steering, casts, kills, a banked vault tick or a
    // world clear all mean the brain is flying, not the player.
    {
        id: 'magic-carpet', url: `${BASE}/magic-carpet?seed=7`, hook: '__carpetTest',
        async run(page, rep) {
            const H = '__carpetTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(800)
            await key(page, 'KeyY')
            rep.check('magic-carpet: Y seats the autopilot', await watching())
            rep.check('magic-carpet: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            await page.waitForTimeout(8000)
            const b = await probe()
            const dYaw = (x, y) => Math.abs(((y - x + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
            const adv = (x, y) => dYaw(x.yaw, y.yaw) > 0.12 || y.casts > x.casts || y.kills > x.kills || y.bank > x.bank || y.level > x.level
            rep.check('magic-carpet: the pilot flies the run untouched', adv(a, b),
                `yaw ${(a.yaw * 57.3).toFixed(0)}° -> ${(b.yaw * 57.3).toFixed(0)}°, casts ${a.casts} -> ${b.casts}, vault ${Math.floor(a.bank)} -> ${Math.floor(b.bank)}, kills ${b.kills}, world ${b.level + 1}`)
            rep.check('magic-carpet: still watching mid-flight', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('magic-carpet: steer key takes the carpet back', !(await watching()))
            rep.check('magic-carpet: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')                       // re-seat: fly from HERE
            rep.check('magic-carpet: Y re-seats the pilot mid-run', await watching())
            const c = await probe()
            await page.waitForTimeout(5000)
            const d = await probe()
            rep.check('magic-carpet: resumes from where the player left it', adv(c, d),
                `yaw ${(c.yaw * 57.3).toFixed(0)}° -> ${(d.yaw * 57.3).toFixed(0)}°, casts ${c.casts} -> ${d.casts}, vault ${Math.floor(c.bank)} -> ${Math.floor(d.bank)}`)
            await key(page, 'KeyY')                       // hand the controls back
            rep.check('magic-carpet: Y again releases the pilot', !(await watching()))
        },
    },
    // #1637 batch 8 — the attract-brain family: four titles whose seat is the
    // sim's own autopilot, the exact call their attract demo already runs and
    // their own harness wins with, re-deciding from live state every tick.
    // Advance signals are prover-only: an idle watcher never moves the bee,
    // the bot, the claw or the plants, and never banks what they touch.
    ...[
        {
            id: 'beezee', hook: '__beeTest',
            // Wind drifts an idle bee across flowers and contact pollinates it —
            // movement and nectar are NOT prover-only here (the batch-8 mutant
            // proved it). The honest signal is the pad: autopilot holds thrust
            // through the flight; an idle watcher never thrusts at all.
            startKeys: ['Space'], seatWait: 700, advanceWait: 9000, resumeWait: 9000, revive: true,
            advanced: (a, b) => b.thrustTicks > a.thrustTicks + 30 || b.delivered > a.delivered || b.score > a.score,
            note: (a, b) => `thrust ticks ${a.thrustTicks} -> ${b.thrustTicks}, nectar ${b.nectar}, delivered ${b.delivered}, score ${b.score}`,
        },
        {
            id: 'tidy-bot', hook: '__tidybotTest',
            // the bot only moves on the brain's legs: position, tidies and
            // score are prover-only against an idle shift.
            startKeys: ['Space'], seatWait: 700, advanceWait: 9000, resumeWait: 9000, revive: true,
            advanced: (a, b) => b.tidies > a.tidies || b.score > a.score || Math.hypot(b.x - a.x, b.y - a.y) > 12,
            note: (a, b) => `tidies ${a.tidies} -> ${b.tidies}, score ${a.score} -> ${b.score}, bot (${Math.round(a.x)},${Math.round(a.y)}) -> (${Math.round(b.x)},${Math.round(b.y)}), loose ${b.loose}`,
        },
        {
            id: 'pick-rush', hook: '__pickrushTest',
            // seat-1-only signals (the foreman races on its own arm — but an
            // idle seat 1 never moves ITS gantry, corrects or scores).
            startKeys: ['Space'], seatWait: 700, advanceWait: 9000, resumeWait: 9000, revive: true,
            advanced: (a, b) => b.correct > a.correct || b.score > a.score || Math.abs(b.x - a.x) > 8,
            note: (a, b) => `correct ${a.correct} -> ${b.correct}, score ${a.score} -> ${b.score}, gantry ${Math.round(a.x)} -> ${Math.round(b.x)}, shift ${b.shift + 1}`,
        },
        {
            id: 'garden-guard', hook: '__gardenTest',
            // idle lawn plants nothing (and nothing defends, nothing scores) —
            // placements and score are prover-only on every seed.
            startKeys: ['Space'], seatWait: 700, advanceWait: 12000, resumeWait: 12000, revive: true,
            advanced: (a, b) => b.plants > a.plants || b.score > a.score || b.unlocked.length > a.unlocked.length,
            note: (a, b) => `plants ${a.plants} -> ${b.plants}, score ${a.score} -> ${b.score}, acorns ${a.acorns} -> ${b.acorns}, spawned ${b.spawned}/${b.total}`,
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
            const b = await pollAdvance(page, probe, g.advanced, a, g.advanceWait || 5000)
            rep.check(`${g.id}: the route advances untouched`, g.advanced(a, b), g.note(a, b))
            const stEnd = await probe()
            const endedEarly = !!g.revive && (stEnd.screen !== 'play' || stEnd.over || stEnd.end)
            rep.check(`${g.id}: still watching mid-route${g.revive ? ' (or the prover already finished it)' : ''}`,
                endedEarly || await watching(), endedEarly ? `prover finished (screen ${stEnd.screen})` : '')
            if (g.revive) {
                if (endedEarly) {
                    for (const k of (g.startKeys || ['Space', 'Space'])) { await key(page, k); await page.waitForTimeout(1100) }
                    await page.waitForTimeout(g.seatWait || 600)
                    await key(page, 'KeyY')
                    await page.waitForTimeout(400)
                }
            }
            await page.keyboard.down(g.takeover || 'ArrowLeft')
            rep.check(`${g.id}: steer key takes over`, !(await watching()))
            await page.keyboard.up(g.takeover || 'ArrowLeft')
            await key(page, 'KeyY')                       // re-seat: watch from HERE
            rep.check(`${g.id}: Y re-seats the prover mid-run`, await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, g.advanced, c, g.resumeWait || 3500)
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
            await seatPoll(page, H)                       // #1722: the hash receipt lands a tick after the key on CI; the build gate proved the watcher drove
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
    // #1637 batch 9 — the planner-in-the-box family: three titles that ship
    // planner.js inside the game folder, whose attract demo flies it and whose
    // own check grades it. The seat is the planner's live call in the play tick.
    {
        // TETRIS — prover-only seeded well: row 19 lacks cols 6-9 and the I
        // sits at SPAWN. Idle drops it onto row 18 (no row ever completes);
        // only the planner's slide reaches the gap. Level 9 so gravity can
        // deliver the proof in seconds.
        id: 'tetris', url: `${BASE}/tetris`, hook: '__tetrisTest',
        async run(page, rep) {
            const H = '__tetrisTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await page.evaluate(() => window.__tetrisTest.start(9))
            await page.waitForTimeout(400)
            await page.evaluate(() => window.__tetrisTest.seedWatch())
            await key(page, 'KeyY')
            rep.check('tetris: Y seats the planner', await watching())
            const a = await probe()
            // prover-only: horizontal presses while the watcher sits. An idle
            // watcher never presses left/right; bag stacking can clear a row by
            // luck over a long window, but luck never slides a piece.
            const adv = (x, y) => y.slides > x.slides + 1
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('tetris: the planner drives the pieces untouched (an idle watcher never slides one)',
                adv(a, b), `slides ${a.slides} -> ${b.slides}, lines ${a.lines} -> ${b.lines}, score ${a.score} -> ${b.score}, locks ${a.locks} -> ${b.locks}`)
            rep.check('tetris: still watching mid-route', await watching())
            await page.keyboard.down('ArrowRight')
            rep.check('tetris: steer key takes over', !(await watching()))
            await page.keyboard.up('ArrowRight')
            await key(page, 'KeyY')
            rep.check('tetris: Y re-seats the planner mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('tetris: resumes from where the player left it', adv(c, d),
                `slides ${c.slides} -> ${d.slides}, lines ${c.lines} -> ${d.lines}, score ${c.score} -> ${d.score}, locks ${c.locks} -> ${d.locks}`)
            await key(page, 'KeyY')
            rep.check('tetris: Y again releases the planner', !(await watching()))
        },
    },
    {
        // EXCITEBIKE — an idle bike sits at the gate: total distance only grows
        // when the gas is on. decide() re-decides by rolling the real sim.
        id: 'excitebike', url: `${BASE}/excitebike`, hook: '__bikeTest',
        async run(page, rep) {
            const H = '__bikeTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            rep.check('excitebike: Y seats the rollout planner', await watching())
            const a = await probe()
            const adv = (x, y) => y.total > x.total + 40 || y.score > x.score
            const b = await pollAdvance(page, probe, adv, a, 10000)
            rep.check('excitebike: the planner rides the track untouched (an idle bike never touches gas)',
                adv(a, b), `total ${Math.round(a.total)} -> ${Math.round(b.total)}, score ${a.score} -> ${b.score}, v ${b.v.toFixed(1)}`)
            rep.check('excitebike: still watching mid-route', await watching())
            await page.keyboard.down('ArrowUp')
            rep.check('excitebike: throttle key takes over', !(await watching()))
            await page.keyboard.up('ArrowUp')
            await key(page, 'KeyY')
            rep.check('excitebike: Y re-seats the planner mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 8000)
            rep.check('excitebike: resumes from where the player left it', adv(c, d),
                `total ${Math.round(c.total)} -> ${Math.round(d.total)}`)
            await key(page, 'KeyY')
            rep.check('excitebike: Y again releases the planner', !(await watching()))
        },
    },
    {
        // MARBLE MADNESS — an idle marble stays on the PRACTICE start shelf
        // (measured: no input, no movement). decide() re-decides a BFS
        // arc-steer from the live marble every tick.
        id: 'marble-madness', url: `${BASE}/marble-madness`, hook: '__marble',
        async run(page, rep) {
            const H = '__marble'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            rep.check('marble-madness: Y seats the BFS autopilot', await watching())
            const a = await probe()
            const adv = (x, y) => y.clears > x.clears || y.score > x.score || Math.hypot(y.x - x.x, y.y - x.y) > 4
            const b = await pollAdvance(page, probe, adv, a, 12000)
            rep.check('marble-madness: the autopilot runs the course untouched (an idle marble stays at the start)',
                adv(a, b), `clears ${a.clears} -> ${b.clears}, score ${a.score} -> ${b.score}, pos (${a.x.toFixed(1)},${a.y.toFixed(1)}) -> (${b.x.toFixed(1)},${b.y.toFixed(1)})`)
            rep.check('marble-madness: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('marble-madness: steer key takes over', !(await watching()))
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            rep.check('marble-madness: Y re-seats the autopilot mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 12000)
            rep.check('marble-madness: resumes from where the player left it', adv(c, d),
                `clears ${c.clears} -> ${d.clears}, score ${c.score} -> ${d.score}`)
            await key(page, 'KeyY')
            rep.check('marble-madness: Y again releases the autopilot', !(await watching()))
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
            await seatPoll(page, H)                       // #1722: the plan is computed from the live state — slow CI seats late, watch.js confirms
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
            await seatPoll(page, H)                       // #1722: re-plan is async too
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
            // #1722: CI froze the whole loop for the first seconds here (s -14 -> -14
            // @v 0.0 through the whole 7000+1500 ms) — a longer sleep is the wrong
            // fix. Wait for the sim's own release signal (the rider moving), then a
            // short downhill run, then measure. Locally this exits in about the same
            // time; on CI it exits the moment the first frame lands.
            await page.waitForFunction(() => window.__ssxTest.probe().p.v > 0.05, null, { timeout: 25000 }).catch(() => {})
            await page.waitForTimeout(1200)               // some downhill after release
            const s1 = await page.evaluate(() => window.__ssxTest.probe())
            // Nightly #40 CI flake: the frame clock can starve seconds on the
            // software-rendered box (`s -14 -> -14 @v 0.0`, locally green every
            // time). Poll for the descent to a ceiling instead of sampling one
            // instant — the rule is unchanged (the rider must move untouched),
            // a stalled box gets a later look, never a pass.
            let s2 = s1
            const tSs = Date.now()
            while (!(s1.tick < s2.tick && s2.p.s > s1.p.s) && Date.now() - tSs < 20000) {
                await page.waitForTimeout(500)
                s2 = await page.evaluate(() => window.__ssxTest.probe())
            }
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
    // #1637 batch 10 — the SOLVER-SCRIPT family: four titles whose attract demo
    // already replays a script their own harness proves (zeldacheck re-runs the
    // planner; lemcheck replays solve() to an identical hash; runnercheck CHAIN
    // replays planRun(); paperscheck survives the week with autopilot()). The
    // seat converts that attract-only proof into a mid-run Y: plan the LIVE
    // state, drive its script tick for tick, decline honestly when the oracle
    // sees no win from here. Advance signals are prover-only — an idle player
    // never walks Hyrule, never assigns a skill, never touches gas, never stamps.
    {
        id: 'zelda', url: `${BASE}/zelda`, hook: '__zeldaTest',
        async run(page, rep) {
            const H = '__zeldaTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            rep.check('zelda: Y seats the quest planner', await watching())
            rep.check('zelda: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            const adv = (x, y) => Math.hypot(y.px - x.px, y.py - x.py) > 6 || y.swings > x.swings || y.kills > x.kills || y.rupees > x.rupees
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('zelda: the planner walks the quest untouched (an idle Link never moves or swings)',
                adv(a, b), `pos (${Math.round(a.px)},${Math.round(a.py)}) -> (${Math.round(b.px)},${Math.round(b.py)}), swings ${a.swings} -> ${b.swings}, kills ${a.kills} -> ${b.kills}, screen ${b.scr}`)
            rep.check('zelda: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('zelda: steer key takes over', !(await watching()))
            rep.check('zelda: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            rep.check('zelda: Y re-seats the planner mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('zelda: resumes from where the player left it', adv(c, d),
                `pos (${Math.round(c.px)},${Math.round(c.py)}) -> (${Math.round(d.px)},${Math.round(d.py)}), swings ${c.swings} -> ${d.swings}, screen ${d.scr}`)
            await key(page, 'KeyY')
            rep.check('zelda: Y again releases the planner', !(await watching()))
        },
    },
    {
        id: 'lemmings', url: `${BASE}/lemmings`, hook: '__lemTest',
        async run(page, rep) {
            const H = '__lemTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            rep.check('lemmings: Y seats the solver', await watching())
            rep.check('lemmings: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            // prover-only: gcmds counts every assignment the sim booked — an
            // idle crowd just walks and falls, the solver SIGNS the script.
            const adv = (x, y) => y.gcmds > x.gcmds || y.exited > x.exited || y.score > x.score
            const b = await pollAdvance(page, probe, adv, a, 9000)
            rep.check('lemmings: the solver assigns the line untouched (an idle booth never assigns a skill)',
                adv(a, b), `cmds ${a.gcmds} -> ${b.gcmds}, out ${a.exited} -> ${b.exited}, spawned ${b.spawned}, score ${a.score} -> ${b.score}`)
            rep.check('lemmings: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('lemmings: steer key takes over', !(await watching()))
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            rep.check('lemmings: Y re-seats the solver mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 9000)
            rep.check('lemmings: resumes from where the player left it', adv(c, d),
                `cmds ${c.gcmds} -> ${d.gcmds}, out ${c.exited} -> ${d.exited}, score ${c.score} -> ${d.score}`)
            await key(page, 'KeyY')
            rep.check('lemmings: Y again releases the solver', !(await watching()))
        },
    },
    {
        id: 'momentum', url: `${BASE}/momentum`, hook: '__runnerTest',
        async run(page, rep) {
            const H = '__runnerTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            // #1637 b10 PHASE LAW / #1828 WAITING-SEAT: momentum's drones sweep on
            // ABSOLUTE ticks, so the greedy plan from a standing runner is clean at
            // most start phases and declines at a few (that plan would die at a
            // patrol). The engine now proves "coast k ≤ 6 clean ticks, THEN win"
            // and seats the wait into the script — so ONE press seats at every
            // phase. The old pilot retried Y up to 8×; those retries are removed
            // deliberately: they were the workaround this issue replaced.
            await key(page, 'KeyY')
            rep.check('momentum: one Y press seats the autopilot plan at any phase (#1828 waiting-seat)', await watching())
            rep.check('momentum: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            const adv = (x, y) => y.x > x.x + 30 || y.score > x.score || y.zone > x.zone
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('momentum: the plan runs the sector untouched (an idle runner coasts to a stop)',
                adv(a, b), `x ${Math.round(a.x)} -> ${Math.round(b.x)}, score ${a.score} -> ${b.score}, ${a.zoneName} -> ${b.zoneName}`)
            rep.check('momentum: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('momentum: brake key takes over', !(await watching()))
            rep.check('momentum: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')                       // re-seat: plan from HERE (wait proven in-engine)
            rep.check('momentum: Y re-seats the plan mid-run on the first press', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('momentum: resumes from where the player left it', adv(c, d),
                `x ${Math.round(c.x)} -> ${Math.round(d.x)}, score ${c.score} -> ${d.score}`)
            await key(page, 'KeyY')
            rep.check('momentum: Y again releases the plan', !(await watching()))
        },
    },
    {
        id: 'papers-please', url: `${BASE}/papers-please`, hook: '__ppTest',
        async run(page, rep) {
            const H = '__ppTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            rep.check('papers-please: Y seats the perfect inspector', await watching())
            rep.check('papers-please: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            // prover-only: only a stamp moves the queue — an idle booth stares
            // at the first entrant forever.
            const adv = (x, y) => y.idx > x.idx || y.admitted > x.admitted || y.score > x.score || y.day > x.day
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('papers-please: the inspector works the line untouched (an idle booth never stamps)',
                adv(a, b), `entrant ${a.idx} -> ${b.idx}, admitted ${a.admitted} -> ${b.admitted}, day ${a.day} -> ${b.day}, score ${b.score}`)
            rep.check('papers-please: still watching mid-week', await watching())
            await key(page, 'KeyD')
            rep.check('papers-please: the deny key takes over', !(await watching()))
            rep.check('papers-please: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await key(page, 'KeyY')
            rep.check('papers-please: Y re-seats the inspector mid-week', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('papers-please: resumes from where the player left it', adv(c, d),
                `entrant ${c.idx} -> ${d.idx}, admitted ${c.admitted} -> ${d.admitted}, strikes ${d.strikes}`)
            await key(page, 'KeyY')
            rep.check('papers-please: Y again releases the inspector', !(await watching()))
        },
    },
    {
        id: 'adventure', url: `${BASE}/adventure`, hook: '__advTest',
        async run(page, rep) {
            const H = '__advTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(700)
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('adventure: Y seats the route', await watching())
            rep.check('adventure: handoff blip at seat', (await sfx()).at(-1) === 'start')
            // #1845 — the seat voice names the driver the ear is about to watch.
            const vlog = () => page.evaluate((h) => window[h].watchVoiceLog(), H)
            const dmsg = () => page.evaluate((h) => window[h].declineMsg(), H)
            rep.check('adventure: V1 seat voice names the script driver', (await vlog()).at(-1) === 'script:1',
                `voice log ${(await vlog()).join(',')}`)
            const a = await probe()
            const adv = (x, y) => Math.hypot(y.x - x.x, y.y - x.y) > 6 || y.room !== x.room || y.carrying !== x.carrying || y.score > x.score
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('adventure: the route walks the world untouched (an idle dot never moves)',
                adv(a, b), `pos (${Math.round(a.x)},${Math.round(a.y)}) -> (${Math.round(b.x)},${Math.round(b.y)}), room ${a.room} -> ${b.room}, carry ${a.carrying} -> ${b.carrying}`)
            rep.check('adventure: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('adventure: steer key takes over', !(await watching()))
            rep.check('adventure: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('adventure: Y re-seats the route mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('adventure: resumes from where the player left it', adv(c, d),
                `pos (${Math.round(c.x)},${Math.round(c.y)}) -> (${Math.round(d.x)},${Math.round(d.y)}), room ${c.room} -> ${d.room}, carry ${c.carrying} -> ${d.carrying}`)
            await key(page, 'KeyY')
            rep.check('adventure: Y again releases the route', !(await watching()))
            // #1845 — a proven road teaches no decline: watching a live route
            // never raises the canvas lesson (it fires only when the road runs out).
            rep.check('adventure: no decline lesson while the road is proven', (await dmsg()) === null,
                `decline msg ${await dmsg()}`)
            // #1845 — every cart sings its own driver: V2 shares the fixed-map
            // script voice, V3 re-homes loot and gets the adaptive note.
            for (const vn of [2, 3]) {
                await page.goto(`${BASE}/adventure?variant=${vn}`)
                await page.waitForTimeout(600)
                await key(page, 'Space')
                await page.waitForTimeout(300)
                await key(page, 'KeyY')
                await seatPoll(page, H)
                const want = `${vn >= 3 ? 'adaptive' : 'script'}:${vn}`
                rep.check(`adventure: V${vn} seat voice is the ${vn >= 3 ? 'adaptive' : 'script'} driver`,
                    (await vlog()).at(-1) === want, `voice log ${(await vlog()).join(',')}`)
            }
            await page.goto(`${BASE}/adventure`)
        },
    },
    {
        // #1637 batch 12 — BOMB DEFUSE: solvePads (engine.js) drives BOTH seats.
        // The same crew defusecheck wins 40/40 seeds with; every action is checked
        // against live integer state, so a mid-run re-seat is honest (reactive,
        // not a bench script). Score is prover-only: +50/step, +500/bomb — an
        // idle crew turns no keys and scores nothing.
        id: 'bomb-defuse', url: `${BASE}/bomb-defuse`, hook: '__bdTest',
        async run(page, rep) {
            const H = '__bdTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            // attract -> crew select -> solo run (Space owns each screen)
            await key(page, 'Space')
            await page.waitForTimeout(300)
            await key(page, 'Space')
            await page.waitForTimeout(900)
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('bomb-defuse: Y seats the solver crew', await watching())
            rep.check('bomb-defuse: handoff blip at seat', (await sfx()).at(-1) === 'start')
            const a = await probe()
            const adv = (x, y) => y.score > x.score || y.bomb > x.bomb || (!!y.won && !x.won)
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('bomb-defuse: the crew works untouched (idle hands turn no key)',
                adv(a, b), `score ${a.score} -> ${b.score}, bomb ${b.bomb + 1}/3 step ${b.step + 1}, fuse ${Math.ceil(b.fuse / 60)}s`)
            rep.check('bomb-defuse: still watching mid-route', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('bomb-defuse: steer key takes over', !(await watching()))
            rep.check('bomb-defuse: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('bomb-defuse: Y re-seats the crew mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 6000)
            rep.check('bomb-defuse: resumes from where the player left it', adv(c, d),
                `score ${c.score} -> ${d.score}, bomb ${d.bomb + 1}/3 step ${d.step + 1}, fuse ${Math.ceil(d.fuse / 60)}s`)
            await key(page, 'KeyY')
            rep.check('bomb-defuse: Y again releases the crew', !(await watching()))
        },
    },
    // #1637 batch 13 — the racer family seats its CERTIFIED autopilot. decide()
    // (CometDrift/sim.js) is the brain cometcheck races to victory ("autopilot
    // wins the 5-lap GP from P7", #1687-certified drift ladder) and both titles'
    // attract demos already replay tick-for-tick. Reactive against live state each
    // tick, so a mid-race seat is honest from any position. The countdown locks
    // input in the sim: the advance window waits out 'go' on its own.
    ...[
        { id: 'comet-drift', url: `${BASE}/comet-drift`, hook: '__cometTest', title: 'COMET DRIFT GP', long: 8000 },
        { id: 'comet-drift-hd', url: `${BASE}/comet-drift-hd`, hook: '__cometHDTest', title: 'COMET DRIFT HD', long: 9000 },
    ].map((G) => ({
        id: G.id, url: G.url, hook: G.hook,
        async run(page, rep) {
            const H = G.hook
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(500)
            rep.check(`${G.id}: the race is live before the seat`, (await probe()).phase !== undefined && await page.evaluate((h) => window[h].screen(), H) === 'race')
            rep.check(`${G.id}: nobody is driving yet (no seat before Y)`, !(await watching()))
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check(`${G.id}: Y seats the certified autopilot`, await watching())
            rep.check(`${G.id}: handoff blip at seat`, (await sfx()).at(-1) === 'start')
            // score is lap progress on a LOOP (grid sits just before the line):
            // wrap it modulo the track length so crossing start/finish reads as
            // forward motion. Idle hands coast to v=0 and never advance 500u;
            // backward drift is impossible for decide(), which never reverses.
            const adv = (x, y) => y.lap > x.lap || (!!y.done && !x.done) || ((y.score - x.score + x.len) % x.len) > 500
            const a = await probe()
            const b = await pollAdvance(page, probe, adv, a, G.long)
            rep.check(`${G.id}: the prover races untouched (idle hands touch no pedal)`, adv(a, b),
                `score ${a.score} -> ${b.score} of len ${a.len}, lap ${a.lap} -> ${b.lap}, v ${a.v} -> ${b.v}`)
            rep.check(`${G.id}: still watching mid-race`, await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check(`${G.id}: steer key takes over`, !(await watching()))
            rep.check(`${G.id}: handoff blip on takeover`, (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check(`${G.id}: Y re-seats the prover mid-race`, await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 4000)
            rep.check(`${G.id}: resumes from where the player left it`, adv(c, d),
                `score ${c.score} -> ${d.score}, lap ${c.lap} -> ${d.lap}`)
            await key(page, 'KeyY')
            rep.check(`${G.id}: Y again releases the wheel`, !(await watching()))
        },
    })),
    // #1637 batch 14 — the reactive divers seat their live-state brains. Both
    // drivers are the titles' OWN planners, the witnesses their Node harnesses
    // win with: SONAR's planStep is a (cell, move#) BFS against an exact eel
    // timeline, casting pings on the sim's own cooldown (sonarcheck races the
    // script it produces across 20/20 seeded depths); BOULDER DASH's planStep
    // digs BFS to gems-then-exit, one arrow every CFG.moveEvery CA ticks
    // (dashcheck proves all four caves with it). Reactive per tick, so a
    // mid-run seat is honest from any position.
    {
        id: 'sonar', url: `${BASE}/sonar`, hook: '__sonarTest',
        async run(page, rep) {
            const H = '__sonarTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(500)
            rep.check('sonar: the dive is live before the seat', (await probe()).screen === 'play')
            rep.check('sonar: nobody is driving yet (no seat before Y)', !(await watching()))
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('sonar: Y seats the proven diver', await watching())
            rep.check('sonar: handoff blip at seat', (await sfx()).at(-1) === 'start')
            // Idle hands stroke nothing: cells only move by playerMove, pearls
            // only bank by touching them, and the eel timeline the planner
            // carries keeps lives whole — a seat that loses either lied.
            const adv = (x, y) => (y.have > x.have || y.score > x.score
                || y.player.x !== x.player.x || y.player.y !== x.player.y) && y.lives >= x.lives
            const a = await probe()
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('sonar: the prover swims untouched (idle hands stroke nothing)', adv(a, b),
                `pearls ${a.have} -> ${b.have}, cell (${a.player.x},${a.player.y}) -> (${b.player.x},${b.player.y}), lives ${b.lives} held`)
            rep.check('sonar: still watching mid-dive', await watching())
            await page.keyboard.down('ArrowLeft')
            rep.check('sonar: steer key takes over', !(await watching()))
            rep.check('sonar: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('sonar: Y re-seats the prover mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 4000)
            rep.check('sonar: resumes from where the player left it', adv(c, d),
                `pearls ${c.have} -> ${d.have}, cell (${c.player.x},${c.player.y}) -> (${d.player.x},${d.player.y})`)
            await key(page, 'KeyY')
            rep.check('sonar: Y again releases the wheel', !(await watching()))
        },
    },
    {
        id: 'boulder-dash', url: `${BASE}/boulder-dash`, hook: '__dashTest',
        async run(page, rep) {
            const H = '__dashTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')
            await page.waitForTimeout(500)
            rep.check('boulder-dash: the dig is live before the seat', (await probe()).screen === 'play')
            rep.check('boulder-dash: nobody is digging yet (no seat before Y)', !(await watching()))
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('boulder-dash: Y seats the proven digger', await watching())
            rep.check('boulder-dash: handoff blip at seat', (await sfx()).at(-1) === 'start')
            // moves counts successful playerMoves — an idle player digs nothing,
            // and the score the prover banks is prover-only. A cleared cave (win)
            // is the route's own finish line, so it counts as advance too.
            const adv = (x, y) => y.moves > x.moves || y.have > x.have || (!!y.win && !x.win)
            const a = await probe()
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('boulder-dash: the prover digs untouched (idle hands move no cell)', adv(a, b),
                `moves ${a.moves} -> ${b.moves}, gems ${a.have}/${a.need}, score ${a.score} -> ${b.score}`)
            rep.check('boulder-dash: still watching mid-cave', await watching() || (await probe()).done)
            await page.keyboard.down('ArrowLeft')
            rep.check('boulder-dash: steer key takes over', !(await watching()))
            rep.check('boulder-dash: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('boulder-dash: Y re-seats the prover mid-run', await watching())
            const c = await probe()
            const d = await pollAdvance(page, probe, adv, c, 4000)
            rep.check('boulder-dash: resumes from where the player left it', adv(c, d),
                `moves ${c.moves} -> ${d.moves}, gems ${d.have}/${d.need}`)
            await key(page, 'KeyY')
            rep.check('boulder-dash: Y again releases the wheel', !(await watching()))
        },
    },
    // #1637 batch 15 — the rulebook solver takes the seat. TALK ME DOWN's
    // driver is the engine's OWN solvePad, reactive per tick against live
    // state (module under the cursor, locks, fuse), cutting only the wire the
    // rulebook says — the same brain tmd-smoke wins 200/200 seeds with and
    // the attract demo runs. A mid-run seat is honest from any module, strike
    // or fuse position; strikes are the honesty meter (the prover cuts right).
    {
        id: 'talk-me-down', url: `${BASE}/talk-me-down`, hook: '__tmdTest',
        async run(page, rep) {
            const H = '__tmdTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')                       // attract -> select
            await page.waitForTimeout(300)
            await key(page, 'Space')                       // select -> play (1P default)
            await page.waitForTimeout(500)
            rep.check('talk-me-down: the bomb is live before the seat', (await probe()).screen === 'play')
            rep.check('talk-me-down: nobody is defusing yet (no seat before Y)', !(await watching()))
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('talk-me-down: Y seats the proven defuser', await watching())
            rep.check('talk-me-down: handoff blip at seat', (await sfx()).at(-1) === 'start')
            // Steer while round 1 is still in flight — the seat was just
            // claimed, the first module is still open, and ArrowLeft is S1's
            // wire key, so the hand MUST land back on a live run.
            await page.keyboard.down('ArrowLeft')
            rep.check('talk-me-down: steer key takes over', !(await watching()))
            rep.check('talk-me-down: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('talk-me-down: Y re-seats the prover mid-run', await watching())
            // solvePad cuts only correct wires: the strike count is the honesty
            // meter — a hand that guessed would trip a breaker. Solved modules
            // or banked bombs prove the seat is driving, not just ticking.
            const adv = (x, y) => (y.solved > x.solved || y.bombs > x.bombs || y.score > x.score || !!y.done) && y.strikes <= x.strikes
            const a = await probe()
            const b = await pollAdvance(page, probe, adv, a, 6000)
            rep.check('talk-me-down: the prover defuses untouched (idle hands trip no breaker)', adv(a, b),
                `modules ${a.solved} -> ${b.solved}, bombs ${a.bombs}/5 -> ${b.bombs}/5, strikes ${b.strikes} held`)
            // The route's end must release the seat silently (racer rule) and
            // win — tmd-smoke's all-seed proof says any seed the prover holds
            // goes down clean, so demanding `won` here is fair.
            let ended = false
            try {
                await page.waitForFunction((h) => window[h].probe().screen === 'over', H, { timeout: 20000 })
                ended = true
            } catch { /* fall through to the check */ }
            const fin = await probe()
            rep.check('talk-me-down: the route runs to its end and wins', ended && !!fin.won,
                `bombs ${fin.bombs}/5, strikes ${fin.strikes}, screen ${fin.screen}`)
            const s = await sfx()
            const stops = s.filter((x) => x === 'stop').length
            rep.check('talk-me-down: released silently at the finish (one stop = the steer only)', !(await watching()) && stops === 1,
                `sfx log ${JSON.stringify(s)}`)
            // #1656 one-tap: from attract, ▶ WATCH must start the run AND seat
            // the prover — the banked-seat path keeps the multi-screen boot honest.
            await page.waitForTimeout(900)                          // over-screen guard
            await key(page, 'Space')                                // over -> attract
            await page.waitForTimeout(900)
            rep.check('talk-me-down: back on attract before the tap', (await probe()).screen === 'attract')
            const btn = await page.$('[data-watch-attract="1"]')
            rep.check('talk-me-down: attract presents the one-tap ▶ WATCH button', !!btn)
            if (btn) {
                const bx = await btn.boundingBox()
                await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2)
                await page.waitForFunction((h) => window[h].watching(), H, { timeout: 4000 }).catch(() => {})
                const q = await probe()
                rep.check('talk-me-down: one tap starts the run AND seats the prover', q.screen === 'play' && await watching(), JSON.stringify(q))
            }
        },
    },
    // #1637 batch 16 — the referee sweeps its own field. MINESWEEPER's driver
    // is nextDigs, the gate's OWN autopilot: the exact solver rule the fairness
    // gate certifies every board with (subset-core, chord-forbidden). Boards
    // plant AT the first dig and are proven zero-guess-closable from it
    // (sweepcheck's witness), so a seated sweep hitting a mine would mean the
    // referee lied — no death while seated is an honesty assertion, not luck.
    // COLT floods hard and wins in ~2 s, so the steer lands early and the
    // re-seat resumes mid-field.
    {
        id: 'minesweeper', url: `${BASE}/minesweeper`, hook: '__sweepTest',
        async run(page, rep) {
            const H = '__sweepTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            await key(page, 'Space')                       // attract -> play (single-screen boot)
            await page.waitForTimeout(400)
            rep.check('minesweeper: the field is live before the seat', (await probe()).screen === 'play')
            rep.check('minesweeper: nobody is digging yet (no seat before Y)', !(await watching()))
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('minesweeper: Y seats the referee', await watching())
            rep.check('minesweeper: handoff blip at seat', (await sfx()).at(-1) === 'start')
            await page.keyboard.down('ArrowLeft')
            rep.check('minesweeper: steer key takes over', !(await watching()))
            rep.check('minesweeper: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            await key(page, 'KeyY')
            await seatPoll(page, H)
            const mid = await probe()
            rep.check('minesweeper: Y re-seats the prover mid-field',
                (await watching()) || mid.screen !== 'play', JSON.stringify(mid))
            if (mid.screen === 'play') {
                // opened counts every cell the sweep banked; end === 'dead' in
                // the same breath is the referee lying — that must never hold.
                const adv = (x, y) => y.opened > x.opened && y.end !== 'dead'
                const c = mid
                const d = await pollAdvance(page, probe, adv, c, 4000)
                rep.check('minesweeper: the prover sweeps untouched (idle hands dig nothing, hit nothing)',
                    adv(c, d), `opened ${c.opened} -> ${d.end || d.opened}`)
            } else rep.check('minesweeper: the prover sweeps untouched (idle hands dig nothing, hit nothing)', false, 'never re-seated in time')
            let ended = false
            try {
                await page.waitForFunction((h) => window[h].probe().screen === 'over', H, { timeout: 25000 })
                ended = true
            } catch { /* fall through to the check */ }
            const fin = await probe()
            const safe = fin.w * fin.h - fin.totalMines
            rep.check('minesweeper: the route runs to its end and sweeps the field',
                ended && fin.end === 'win' && fin.opened === safe,
                `opened ${fin.opened}/${safe}, end ${fin.end}, screen ${fin.screen}`)
            const s = await sfx()
            const stops = s.filter((x) => x === 'stop').length
            rep.check('minesweeper: released silently at the finish (one stop = the steer only)', !(await watching()) && stops === 1,
                `sfx log ${JSON.stringify(s)}`)
            // #1656 one-tap: from attract, ▶ WATCH must start the run AND seat
            // the referee — the single-screen boot seats directly, no bank.
            await page.waitForTimeout(900)                          // over-screen guard
            await key(page, 'Space')                                // over -> attract
            await page.waitForTimeout(900)
            rep.check('minesweeper: back on attract before the tap', (await probe()).screen === 'attract')
            const btn = await page.$('[data-watch-attract="1"]')
            rep.check('minesweeper: attract presents the one-tap ▶ WATCH button', !!btn)
            if (btn) {
                const bx = await btn.boundingBox()
                await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2)
                await page.waitForFunction((h) => window[h].watching(), H, { timeout: 4000 }).catch(() => {})
                const q = await probe()
                rep.check('minesweeper: one tap starts the run AND seats the prover', q.screen === 'play' && await watching(), JSON.stringify(q))
            }
        },
    },
    // #1637 batch 17 — the attract brain tends the street. HOME BODY's seat is
    // autoStep = bot + advance, the exact call its attract demo runs and
    // peoplecheck's WINNABLE section grants the lifetime wish with (witness
    // below). Autonomy lives in the sim under s.demo and the flag is the
    // seat's: release clears it. Beezee's lesson (#1653 era) repeats here:
    // proximity life is NOT prover-only — Fern's chat and the house's
    // co-presence climb social bars on their own, and ambience hours bank
    // content. The honest signals are the demo-gated commands: a buy (items
    // up, money down), a clock-in, and the payday that follows work. An
    // unseated street buys nothing, clocks in nowhere and banks no pay.
    {
        id: 'homebody', url: `${BASE}/homebody`, hook: '__homebodyTest',
        async run(page, rep) {
            const H = '__homebodyTest'
            const watching = () => page.evaluate((h) => window[h].watching(), H)
            const probe = () => page.evaluate((h) => window[h].probe(), H)
            const sfx = () => page.evaluate((h) => window[h].watchSfx(), H)
            const moved = (a, b) => b.items.length !== a.items.length || b.money !== a.money
                || b.people.some((p, i) => p.working !== a.people[i].working)
            await key(page, 'Space')                       // attract -> play (single-screen boot)
            await page.waitForTimeout(400)
            rep.check('homebody: the street is live before the seat', (await probe()).screen === 'play')
            rep.check('homebody: nobody is at the controls yet', !(await watching()))
            const q0 = await probe()
            await page.waitForTimeout(4000)
            const q1 = await probe()
            rep.check('homebody: an idle street buys nothing and works nowhere (prover-only law)',
                !moved(q0, q1),
                `items ${q0.items.length} -> ${q1.items.length}, money ${q0.money} -> ${q1.money}, working ${q0.people.map((p) => p.working)} -> ${q1.people.map((p) => p.working)}`)
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('homebody: Y seats the attract brain', await watching())
            rep.check('homebody: handoff blip at seat', (await sfx()).at(-1) === 'start')
            await page.waitForFunction((h) => window[h].probe().demo === true, H, { timeout: 4000 }).catch(() => {})
            rep.check('homebody: seated autonomy rides the sim flag (demo is on)', (await probe()).demo === true)
            const a = await probe()
            const b = await pollAdvance(page, probe, moved, a, 15000)
            rep.check('homebody: the street wakes under the prover (buys / clocks in)',
                moved(a, b), `items ${a.items.length} -> ${b.items.length}, money ${a.money} -> ${b.money}, day ${a.day} -> ${b.day}`)
            await page.keyboard.down('ArrowLeft')
            rep.check('homebody: steer key takes over', !(await watching()))
            rep.check('homebody: handoff blip on takeover', (await sfx()).at(-1) === 'stop')
            await page.keyboard.up('ArrowLeft')
            rep.check('homebody: release clears the sim autonomy flag (demo off with the seat)',
                (await probe()).demo === false)
            await key(page, 'KeyY')
            await seatPoll(page, H)
            rep.check('homebody: Y re-seats mid-street', await watching())
            const c = await probe()
            // Payday lands at 17:00 = ~50 s of play from a 07:00 boot; the
            // seat was up ~20 s ago, so this poll must span the shift's end.
            const d = await pollAdvance(page, probe, moved, c, 50000)
            rep.check('homebody: resumes from where the player left it (pay / buys)', moved(c, d),
                `items ${c.items.length} -> ${d.items.length}, money ${c.money} -> ${d.money}`)
            await key(page, 'KeyY')                       // hand the controls back
            rep.check('homebody: Y again releases the watcher', !(await watching()) && (await probe()).demo === false)
            // #1656 one-tap: end this street honestly (both residents down —
            // the sim's own lose resolves inside advance), return to the
            // marquee, and let the attract pill start AND seat a fresh run.
            await page.evaluate((h) => window[h].collapseAll(), H)
            await page.waitForTimeout(1200)               // over-screen guard
            await key(page, 'Space')                      // over -> attract
            await page.waitForTimeout(900)
            rep.check('homebody: back on attract before the tap', (await probe()).screen === 'attract')
            const btn = await page.$('[data-watch-attract="1"]')
            rep.check('homebody: attract presents the one-tap ▶ WATCH button', !!btn)
            if (btn) {
                const bx = await btn.boundingBox()
                await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2)
                await page.waitForFunction((h) => window[h].watching(), H, { timeout: 4000 }).catch(() => {})
                const q = await probe()
                rep.check('homebody: one tap starts the run AND seats the prover', q.screen === 'play' && await watching(), JSON.stringify({ ...q, people: undefined }))
            }
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
const ARCADE = ['QBert', 'Joust', 'Galaga', 'Tempest', 'DigDug', 'BubbleBobble',
    'SpyHunter', 'Arkanoid', 'OutRun', 'LunarLander', 'Outpost', 'Polarity',
    'MissileBattle', 'SmashTV', 'MarioKart', 'Gauntlet', 'FourHalls',
    'PrinceOfPersia', 'CivilizationV', 'BardsTale', 'TenDeep', 'BlobBattle',
    'SimCityMin', 'Paperboy', 'IceClimber']
const watchSrc = readFileSync('src/utils/watch.js', 'utf8')
rep.check('watch.js: one shared blip pair, audible (two tones each)',
    /export const playWatchStart[\s\S]*?playTone\([\s\S]*?playTone\([\s\S]*?export const playWatchStop[\s\S]*?playTone\([\s\S]*?playTone\(/.test(watchSrc))
rep.check('watch.js: exports the shared attract hint', /export const WATCH_ATTRACT_HINT = 'Y — WATCH THE PROVEN ROUTE'/.test(watchSrc))
for (const g of [...FLAGSHIP, ...ARCADE]) {
    const src = readRoster(`src/games/${g}/index.jsx`)
    rep.check(`${g}: imports the shared blips and logs`,
        /from '\.\.\/\.\.\/utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
}
for (const g of FLAGSHIP) {
    const src = readRoster(`src/games/${g}/index.jsx`)
    rep.check(`${g}: attract screen shows the WATCH hint`,
        /screen === 'attract'[\s\S]{0,1600}?Y — [Ww][Aa][Tt][Cc][Hh] THE PROVEN ROUTE/i.test(src))
}
// #1654: the arcade family draws WATCH_ATTRACT_HINT — JSX titles in index.jsx,
// the canvas contracts in attract.js (import + a drawn line, no orphans).
for (const g of ARCADE) {
    let src = readRoster(`src/games/${g}/index.jsx`)
    try {
        const at = `src/games/${g}/attract.js`
        if (existsSync(at)) src += '\n' + readRoster(at)
    } catch (e) {
        if (/case mismatch/.test(e.message)) throw e // canvas-direct may skip attract.js; a lying case never
    }
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
    // no-guide remainder (DOS/IF: no proven solver) must not.
    const reg5 = readFileSync('src/config/games.js', 'utf8')
    const entryHas5 = (p, s) => { const m = reg5.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const p of ['/lode-runner', '/arena-archery', '/dogfight'])
        rep.check(`registry ${p}: controls carry the WATCH line`, entryHas5(p, 'WATCH_HELP'))
    for (const p of ['/kingsquest', '/britannia'])
        rep.check(`registry ${p}: no WATCH line (no proven solver drives it yet)`, !entryHas5(p, 'WATCH_HELP'))
}
// ---- #1637 batch-6 source pins — MAGIC CARPET: the seat is the sim's own brain ----
{
    const src = readFileSync('src/games/MagicCarpet/index.jsx', 'utf8')
    rep.check('MAGICCARPET: imports the shared blips and logs',
        /utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
    rep.check('MAGICCARPET: attract screen shows the WATCH hint', (src.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('MAGICCARPET: the watcher seats autopilot(gs) — the closed-loop brain of the sim itself (no witness script)',
        /if \(watchingRef\.current && !gs\.end\) \{[\s\S]{0,480}const ap = autopilot\(gs\)/.test(src))
    rep.check('MAGICCARPET: visuals follow the FLOWN pad (bank/sway read eff, not phantom keys)',
        /const eff = \{ l: false, r: false, u: false, d: false \}/.test(src)
        && /const steer = \(eff\.r \? 1 : 0\) - \(eff\.l \? 1 : 0\)/.test(src))
    rep.check('MAGICCARPET: watch never lingers — cleared at run end AND at every start',
        /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 the run ends in your hands/.test(src)
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 a new run starts in your hands/.test(src))
    const reg6 = readFileSync('src/config/games.js', 'utf8')
    const entryHas6 = (p, s) => { const m = reg6.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    rep.check('registry /magic-carpet: controls carry the WATCH line', entryHas6('/magic-carpet', 'WATCH_HELP'))
}
// ---- #1637 batch-8 source pins — the attract-brain family ----
{
    const B8_SRC = {
        'BEEZEE': 'src/games/Beezee/index.jsx',
        'TIDYBOT': 'src/games/TidyBot/index.jsx',
        'PICKRUSH': 'src/games/PickRush/index.jsx',
        'GARDENGUARD': 'src/games/GardenGuard/index.jsx',
    }
    for (const [name, f] of Object.entries(B8_SRC)) {
        const src = readFileSync(f, 'utf8')
        rep.check(`${name}: imports the shared blips and logs`,
            /utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
        rep.check(`${name}: attract screen shows the WATCH hint`, (src.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    }
    // The seat IS the attract call — each pin names the exact swap in the play tick.
    rep.check('BEEZEE: the watcher seats autopilot(gs) in the play tick and the probe counts consumed thrust',
        /const pad = watchingRef\.current \? autopilot\(gs\) : input[\s\S]{0,80}if \(pad\.thrust\) padThrust\+\+/.test(readFileSync(B8_SRC.BEEZEE, 'utf8')))
    rep.check('TIDYBOT: the watcher seats autopilot(gs) in the play tick',
        /step\(gs, \[watchingRef\.current \? autopilot\(gs\) : livePad\(\)\]\)/.test(readFileSync(B8_SRC.TIDYBOT, 'utf8')))
    {
        const prSrc = readFileSync(B8_SRC.PICKRUSH, 'utf8')
        rep.check('PICKRUSH: seat 1 becomes autopilot(gs, 0) under watch',
            /const p1 = watchingRef\.current\s*\n?\s*\? autopilot\(gs, 0\)/.test(prSrc))
        rep.check('PICKRUSH: seat-2 keys never unseat the watcher (partner keeps their seat)',
            /watchingRef\.current && isTakeoverKey\(e\) && !\(humanSeat2Ref\.current && \['KeyA', 'KeyD', 'KeyS', 'KeyF'\]\.includes\(e\.code\)\)/.test(prSrc))
    }
    rep.check('GARDENGUARD: the watcher runs autoStep (bot + advance) in the play tick',
        /if \(watchingRef\.current\) \{[\s\S]{0,400}autoStep\(gs, SIM_MS \/ 1000\)/.test(readFileSync(B8_SRC.GARDENGUARD, 'utf8')))
    const reg8 = readFileSync('src/config/games.js', 'utf8')
    const entryHas8 = (p, s) => { const m = reg8.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const p of ['/beezee', '/tidy-bot', '/pick-rush', '/garden-guard'])
        rep.check(`registry ${p}: controls carry the WATCH line`, entryHas8(p, 'WATCH_HELP'))
}
// ---- #1637 batch-9 source pins — the planner-in-the-box family ----
{
    const B9_SRC = {
        'TETRIS': 'src/games/Tetris/index.jsx',
        'EXCITEBIKE': 'src/games/Excitebike/index.jsx',
        'MARBLEMADNESS': 'src/games/MarbleMadness/index.jsx',
    }
    for (const [name, f] of Object.entries(B9_SRC)) {
        const src = readFileSync(f, 'utf8')
        rep.check(`${name}: imports the shared blips and logs`,
            /utils\/watch'/.test(src) && /playWatchStart/.test(src) && /playWatchStop/.test(src) && /watchSfx: watchSfxLog/.test(src))
        rep.check(`${name}: attract screen shows the WATCH hint`, (src.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    }
    // The seat IS the game's own planner call — each pin names the exact swap in the play tick.
    rep.check('TETRIS: the watcher seats driveInput in the play tick and re-plans at every lock',
        /const pad = watchingRef\.current \? driveInput\(gs, playPlan, playMem\) : \{ \.\.\.keys \}/.test(readFileSync(B9_SRC.TETRIS, 'utf8'))
        && /watchingRef\.current && playPlan && gs\.locks !== playMem\.lastLocks && !gs\.clearing/.test(readFileSync(B9_SRC.TETRIS, 'utf8')))
    rep.check('EXCITEBIKE: the watcher seats decide(gs, mem) — the rollout brain of the sim itself — in the play tick',
        /if \(watchingRef\.current\) \{ doSim\(decide\(gs, bikeMem\)\); return \}/.test(readFileSync(B9_SRC.EXCITEBIKE, 'utf8')))
    rep.check('MARBLEMADNESS: the watcher seats decide(gs) — the BFS autopilot that generated the attract script — in the play tick',
        /\? \(watchingRef\.current \? decide\(gs\) : inp\(\)\)/.test(readFileSync(B9_SRC.MARBLEMADNESS, 'utf8')))
    // watch never lingers: each seat clears at run end AND at every start.
    rep.check('TETRIS: watch never lingers — cleared at run end AND at every start',
        /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 the run ends in your hands/.test(readFileSync(B9_SRC.TETRIS, 'utf8'))
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 a new well starts in your hands/.test(readFileSync(B9_SRC.TETRIS, 'utf8')))
    rep.check('EXCITEBIKE: watch never lingers — cleared at run end AND at every start',
        /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 the run ends in your hands/.test(readFileSync(B9_SRC.EXCITEBIKE, 'utf8'))
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 a new race starts in your hands/.test(readFileSync(B9_SRC.EXCITEBIKE, 'utf8')))
    rep.check('MARBLEMADNESS: watch never lingers — cleared at run end AND at every start',
        /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 the run ends in your hands/.test(readFileSync(B9_SRC.MARBLEMADNESS, 'utf8'))
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 a new run starts in your hands/.test(readFileSync(B9_SRC.MARBLEMADNESS, 'utf8'))
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637 watch never lingers/.test(readFileSync(B9_SRC.MARBLEMADNESS, 'utf8')))
    const reg9 = readFileSync('src/config/games.js', 'utf8')
    const entryHas9 = (p, s) => { const m = reg9.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const p of ['/tetris', '/excitebike', '/marble-madness'])
        rep.check(`registry ${p}: controls carry the WATCH line`, entryHas9(p, 'WATCH_HELP'))
}
// #1637 batch 11 — the solver-script family grows one: ADVENTURE seats route.js
// (V1/V2 waypoint script + V3 adaptive adapter, both the drivers adventurecheck
// wins with, emitted one input per tick).
{
    const ADV = readFileSync('src/games/Adventure/index.jsx', 'utf8')
    rep.check('ADVENTURE: the watcher feeds route.js per-tick inputs in the play tick',
        /if \(watchingRef\.current && watcher\) \{\s*const r = watcher\.next\(\)/.test(ADV)
        && /dx = w\.dx \|\| 0/.test(ADV))
    rep.check('ADVENTURE: watch never lingers — cleared at terminal AND at every start',
        /if \(watchingRef\.current && \(sim\.won \|\| sim\.dead\)\) \{ watchingRef\.current = false/.test(ADV)
        && /watcher = null \/\/ #1637: the old route ends with the old run/.test(ADV))
    rep.check('ADVENTURE: seats the variant-aware driver (route.js makeRoute at the seat)',
        /watcher = makeRoute\(sim\)/.test(ADV))
    const reg11 = readFileSync('src/config/games.js', 'utf8')
    const entryHas11 = (p, s) => { const m = reg11.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    rep.check('registry /adventure: controls carry the WATCH line', entryHas11('/adventure', 'WATCH_HELP'))
}

// #1845 watch polish — the seat says WHICH driver took the wheel (a cart voice
// stacked after the shared blip; utils/watch.js untouched) and the honest
// decline is taught on canvas for ~1.5s, under the batch-13 suppression law:
// a run that won or died already spoke for itself.
{
    const ADV = readFileSync('src/games/Adventure/index.jsx', 'utf8')
    const RT = readFileSync('src/games/Adventure/route.js', 'utf8')
    rep.check('ADVENTURE: one-brain law — watchVoice branches on variant exactly as makeRoute',
        /export function watchVoice\(sim\) \{\s*return sim\.variant >= 3 \? \{ driver: 'adaptive'/.test(RT)
        && /const gen = sim\.variant >= 3 \? runRoute\(sim\) : scriptRun\(sim\)/.test(RT))
    rep.check('ADVENTURE: the seat stacks the cart voice after the shared blip, receipt to the log',
        /const v = watchVoice\(sim\)\s*audioController\.playTone\(v\.tone, 0\.09, 'square', 0\.05, 0\.15\)\s*voiceLog\.push\(`\$\{v\.driver\}:\$\{sim\.variant\}`\)/.test(ADV))
    rep.check('ADVENTURE: the honest decline is taught on canvas, only when the road ran out',
        /if \(r\.done\) \{[\s\S]*?playWatchStop\(\)[\s\S]*?if \(!\(sim\.won \|\| sim\.dead\)\) \{ declineMsg = 'NO ROUTE FROM HERE'; declineTtl = 90 \}/.test(ADV))
    rep.check('ADVENTURE: the lesson expires (~1.5s) and clears with every new run',
        /if \(declineTtl > 0 && --declineTtl === 0\) declineMsg = null/.test(ADV)
        && /declineMsg = null; declineTtl = 0; voiceLog\.length = 0/.test(ADV))
    rep.check('ADVENTURE: voice receipts and the decline lesson are harness-observable',
        /watchVoiceLog: \(\) => voiceLog\.slice\(\)/.test(ADV)
        && /declineMsg: \(\) => declineMsg/.test(ADV))
}
// #1637 batch 12 — BOMB DEFUSE seats the solver crew. The honesty rules that
// don't need Chrome (the driver itself is graded by defusecheck's 40/40 win
// gate; these pins prove the seat wires the driver, never fakes one).
{
    const BD = readFileSync('src/games/BombDefuse/index.jsx', 'utf8')
    rep.check('BOMB DEFUSE: the watch seat feeds solvePads per play tick',
        /if \(watchingRef\.current && gsw && !gsw\.done\) \{ pads = E\.solvePads\(gsw\)/.test(BD))
    rep.check('BOMB DEFUSE: the seat supplies seat 2 even in solo runs',
        /g\.players > 1 \|\| watchingRef\.current/.test(BD))
    rep.check('BOMB DEFUSE: watch never lingers — cleared at done AND at every start',
        /watchingRef\.current && gsw && gsw\.done\) \{ watchingRef\.current = false/.test(BD)
        && /watchingRef\.current = false; setWatching\(false\) \/\/ #1637: the old route ends with the old run/.test(BD))
    rep.check('BOMB DEFUSE: online play no-ops the seat (no guide on the wire)',
        /screenRef\.current === 'play' && !net\.active && g && !g\.done/.test(BD))
    const reg12 = readFileSync('src/config/games.js', 'utf8')
    const entryHas12 = (p, s) => { const m = reg12.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    rep.check('registry /bomb-defuse: controls carry the WATCH line', entryHas12('/bomb-defuse', 'WATCH_HELP'))
}
// ---- #1637 batch 13 source pins — the racer family seats the certified autopilot ----
{
    const srcs = {
        'COMET DRIFT GP': ['src/games/CometDrift/index.jsx', '/comet-drift'],
        'COMET DRIFT HD': ['src/games/CometDriftHD/index.jsx', '/comet-drift-hd'],
    }
    const reg13 = readFileSync('src/config/games.js', 'utf8')
    const entryHas13 = (p, s) => { const m = reg13.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    for (const [name, [file, route]] of Object.entries(srcs)) {
        const S = readFileSync(file, 'utf8')
        rep.check(`${name}: the watch seat rides the st.plan feed into decide()`,
            /if \(st\.plan\) \{[\s\S]{0,500}?inp = decide\(g\)/.test(S))
        rep.check(`${name}: Y seats with blips; any driving key takes over`,
            /if \(isWatchKey\(e\)\) \{ st\.plan = !st\.plan; setWatching\(st\.plan\)/.test(S)
            && /if \(st\.plan && isTakeoverKey\(e\)\) \{ st\.plan = false; setWatching\(false\)/.test(S))
        rep.check(`${name}: watch never lingers — released at the flag AND at every restart`,
            /if \(st\.plan\) \{ st\.plan = false; setWatching\(false\) \}/.test(S)
            && /setWatching\(false\) \/\/ #1637: the old route ends with the old run/.test(S))
        rep.check(`${name}: attract shows the shared WATCH hint (import + drawn line)`,
            (S.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
        rep.check(`registry ${route}: controls carry the WATCH line`, entryHas13(route, 'WATCH_HELP'))
    }
    // Both titles race the SAME certified brain — the HD seat must import the
    // shared sim's decide, never a fork of its own.
    rep.check('batch 13: HD seats the shared sim decide (no forked brain)',
        /from '\.\.\/CometDrift\/sim\.js'/.test(readFileSync('src/games/CometDriftHD/index.jsx', 'utf8')))
}
// ---- #1637 batch 14 source pins — the reactive divers seat live-state brains ----
{
    const sonar = readFileSync('src/games/Sonar/index.jsx', 'utf8')
    const dash = readFileSync('src/games/BoulderDash/index.jsx', 'utf8')
    const reg14 = readFileSync('src/config/games.js', 'utf8')
    const entryHas14 = (p, s) => { const m = reg14.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    // The seat must feed the sim's OWN planStep into the real actuator (the same
    // playerMove the keyboard drives) on the planner's cadence — no re-rolled,
    // simplified brain, no touching a copy.
    rep.check('SONAR: the seat feeds planStep into the real playerMove, pings on the sim cadence',
        /if \(watchingRef\.current\) \{[\s\S]{0,700}?gs\.tick - gs\.lastPing >= CFG\.pingCd[\s\S]{0,300}?gs\.tick % CFG\.moveEvery === 0[\s\S]{0,80}?planStep\(gs\)[\s\S]{0,40}?movePlayer\(d\)/.test(sonar))
    rep.check('SONAR: Y seats with blips; any driving key takes over',
        /if \(isWatchKey\(e\)\) \{ watchingRef\.current = !watchingRef\.current; setWatching\(watchingRef\.current\)/.test(sonar)
        && /if \(watchingRef\.current && isTakeoverKey\(e\)\) \{ watchingRef\.current = false; setWatching\(false\)/.test(sonar))
    rep.check('SONAR: watch never lingers — released at the end of the dive',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\) \}/.test(sonar))
    rep.check('SONAR: attract shows the shared WATCH hint (import + drawn line)',
        (sonar.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('registry /sonar: controls carry the WATCH line', entryHas14('/sonar', 'WATCH_HELP'))
    rep.check('BOULDER DASH: the seat feeds planStep into the real playerMove on the CA cadence',
        /if \(watchingRef\.current && !gs\.end\) \{[\s\S]{0,500}?gs\.tick % CFG\.moveEvery === 0[\s\S]{0,80}?planStep\(gs\)[\s\S]{0,40}?movePlayer\(d\)/.test(dash))
    rep.check('BOULDER DASH: Y seats with blips; any driving key takes over',
        /if \(isWatchKey\(e\)\) \{ watchingRef\.current = !watchingRef\.current; setWatching\(watchingRef\.current\)/.test(dash)
        && /if \(watchingRef\.current && isTakeoverKey\(e\)\) \{ watchingRef\.current = false; setWatching\(false\)/.test(dash))
    rep.check('BOULDER DASH: watch never lingers — released at the door (or the grave)',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\) \}/.test(dash))
    rep.check('BOULDER DASH: attract shows the shared WATCH hint (import + drawn line)',
        (dash.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('registry /boulder-dash: controls carry the WATCH line', entryHas14('/boulder-dash', 'WATCH_HELP'))
    // No forked brains: both seats import planStep from their own sim.js, and
    // the brains stay honest because their harnesses still carry the win proofs
    // the seats replay — gate that the witnesses exist where they always did.
    rep.check('batch 14: both seats import the sim\'s own planStep (no forked brain)',
        /from '\.\/sim\.js'/.test(sonar) && /planStep/.test(sonar)
        && /from '\.\/sim\.js'/.test(dash) && /planStep/.test(dash))
    rep.check('batch 14: sonarcheck still proves crossings to the vent (the seat\'s witness)',
        /descend/.test(readFileSync('scripts/sonarcheck.mjs', 'utf8')))
    rep.check('batch 14: dashcheck still proves every cave winnable (the seat\'s witness)',
        /did NOT win/.test(readFileSync('scripts/dashcheck.mjs', 'utf8')))
}
// ---- #1637 batch 15 source pins — the rulebook solver takes the seat ----
{
    const tmd = readFileSync('src/games/TalkMeDown/index.jsx', 'utf8')
    const reg15 = readFileSync('src/config/games.js', 'utf8')
    const entryHas15 = (p, s) => { const m = reg15.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    // The seat must feed the engine's OWN solvePad into the real pad path —
    // the same pads object the keyboard and the phone pad build — never a
    // re-rolled, simplified brain, never a copy of the sim.
    rep.check('TALK ME DOWN: the seat feeds solvePad into the real pad path (no forked brain)',
        /if \(watchingRef\.current && g && !g\.done\) p1 = solvePad\(g\)/.test(tmd)
        && /spec\.tick\(p1, pads\)/.test(tmd))
    rep.check('TALK ME DOWN: Y seats with blips; any driving key takes over',
        /if \(isWatchKey\(e\)\) \{ e\.preventDefault\(\); watchingRef\.current = !watchingRef\.current; setWatching\(watchingRef\.current\)/.test(tmd)
        && /if \(watchingRef\.current && isTakeoverKey\(e\)\) \{ watchingRef\.current = false; setWatching\(false\)/.test(tmd))
    rep.check('TALK ME DOWN: a tap on the bench hands the hands back too',
        /else if \(screenRef\.current === 'play' && watchingRef\.current\) \{/.test(tmd))
    rep.check('TALK ME DOWN: watch never lingers — released at the end of the run (silent, racer rule)',
        /if \(watchingRef\.current && screenRef\.current === 'over'\) \{ watchingRef\.current = false; setWatching\(false\) \}/.test(tmd))
    rep.check('TALK ME DOWN: attract shows the shared WATCH hint (import + drawn line)',
        (tmd.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('TALK ME DOWN: one-tap ▶ WATCH survives the multi-screen boot (banked seat at startPlay)',
        /pendingWatchRef\.current = true/.test(tmd)
        && /if \(pendingWatchRef\.current\) \{ pendingWatchRef\.current = false; watchingRef\.current = true; setWatching\(true\); playWatchStart\(\) \}/.test(tmd))
    rep.check('registry /talk-me-down: controls carry the WATCH line', entryHas15('/talk-me-down', 'WATCH_HELP'))
    // No forked brain, and the witness still carries the proof the seat
    // replays: solvePad comes from the game's own engine.js, and tmd-smoke
    // still races it across every seed.
    rep.check('batch 15: the seat imports solvePad from its own engine.js',
        /from '\.\/engine\.js'/.test(tmd) && /solvePad/.test(tmd))
    rep.check('batch 15: tmd-smoke still races solvePad across 200 seeds (the seat\'s witness)',
        /wins \$\{wins\}\/200/.test(readFileSync('scripts/tmd-smoke.mjs', 'utf8'))
        && /gs\.done && gs\.won/.test(readFileSync('scripts/tmd-smoke.mjs', 'utf8')))
}
// ---- #1637 batch 16 source pins — the referee sweeps its own field ----
{
    const swp = readFileSync('src/games/Minesweeper/index.jsx', 'utf8')
    const reg16 = readFileSync('src/config/games.js', 'utf8')
    const entryHas16 = (p, s) => { const m = reg16.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    // The seat must feed the gate's OWN autopilot into the real dig path —
    // nextDigs through actDig, auto-chord intact — never a re-rolled brain
    // and never a replay of a stored plan.
    rep.check('MINESWEEPER: the seat feeds nextDigs into the real dig path (no forked brain)',
        /if \(sc === 'play' && watchingRef\.current\) watchTick\(\)/.test(swp)
        && /if \(!watchPlan\.length\) watchPlan = nextDigs\(gs\)/.test(swp)
        && /actDig\(p\.x, p\.y\)/.test(swp))
    rep.check('MINESWEEPER: the first dig takes the center — the original\'s guaranteed-safe click the gate plants AT',
        /if \(!gs\.planted\) \{ actDig\(gs\.w >> 1, gs\.h >> 1\); return \}/.test(swp))
    rep.check('MINESWEEPER: Y seats with blips; any driving key takes over',
        /if \(isWatchKey\(e\)\) \{/.test(swp)
        && /if \(watchingRef\.current && isTakeoverKey\(e\)\) \{ watchingRef\.current = false; setWatching\(false\)/.test(swp))
    rep.check('MINESWEEPER: a tap on the field hands the dig back too',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\); playWatchStop\(\) \}/.test(swp))
    rep.check('MINESWEEPER: watch never lingers — released at the end of the run (silent, racer rule)',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\) \}/.test(swp))
    rep.check('MINESWEEPER: attract shows the shared WATCH hint (import + drawn line)',
        (swp.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('registry /minesweeper: controls carry the WATCH line', entryHas16('/minesweeper', 'WATCH_HELP'))
    // No forked brain, and the witness still carries the proof the seat rides:
    // nextDigs comes from the game's own minefield.js, and sweepcheck still
    // audits the zero-guess gate the seat leans on, sequential play included.
    rep.check('batch 16: the seat imports nextDigs from its own minefield.js',
        /from '\.\/minefield\.js'/.test(swp) && /nextDigs/.test(swp))
    rep.check('batch 16: sweepcheck still audits the gate the seat rides (seq-play wins)',
        /seqFail === 0/.test(readFileSync('scripts/sweepcheck.mjs', 'utf8'))
        && /sequential play lost or stalled on/.test(readFileSync('scripts/sweepcheck.mjs', 'utf8')))
}
// ---- #1637 batch 17 source pins — the attract brain tends the street ----
{
    const hb = readFileSync('src/games/Homebody/index.jsx', 'utf8')
    const reg17 = readFileSync('src/config/games.js', 'utf8')
    const entryHas17 = (p, s) => { const m = reg17.split(`path: '${p}'`)[1]; return !!m && m.split('path:')[0].includes(s) }
    // The seat must BE the attract call — autoStep in the play tick, from the
    // game's own sim.js — never a re-forked brain or a stored script.
    rep.check('HOMEBODY: the seat runs autoStep (bot + advance) in the play tick',
        /if \(watchingRef\.current\) autoStep\(gs, SIM_MS \/ 1000\)/.test(hb))
    rep.check('batch 17: the seat imports autoStep from its own sim.js (no forked brain)',
        /from '\.\/sim\.js'/.test(hb) && /autoStep/.test(hb))
    rep.check('HOMEBODY: imports the shared blips and logs',
        /from '\.\.\/\.\.\/utils\/watch'/.test(hb) && /playWatchStart/.test(hb) && /playWatchStop/.test(hb) && /watchSfx: watchSfxLog/.test(hb))
    rep.check('HOMEBODY: Y seats with blips; any driving key hands back and clears the autonomy flag',
        /if \(isWatchKey\(e\)\) \{/.test(hb)
        && /if \(watchingRef\.current && isTakeoverKey\(e\)\) \{ watchingRef\.current = false; setWatching\(false\); if \(gs\) gs\.demo = false; playWatchStop\(\) \}/.test(hb))
    rep.check('HOMEBODY: a tap on the lot hands the street back too',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\); if \(gs\) gs\.demo = false; playWatchStop\(\); return \}/.test(hb))
    rep.check('HOMEBODY: watch never lingers — released at the end of the street (silent, racer rule)',
        /if \(watchingRef\.current\) \{ watchingRef\.current = false; setWatching\(false\); s\.demo = false \}/.test(hb))
    rep.check('HOMEBODY: attract shows the shared WATCH hint (import + drawn line)',
        (hb.match(/WATCH_ATTRACT_HINT/g) || []).length >= 2)
    rep.check('registry /homebody: controls carry the WATCH line', entryHas17('/homebody', 'WATCH_HELP'))
    // The witness still carries the proof the seat rides: peoplecheck grants
    // the lifetime wish driving this SAME autoStep across seeds — seat and
    // cert share one brain.
    const pc = readFileSync('scripts/peoplecheck.mjs', 'utf8')
    rep.check('batch 17: peoplecheck still grants the wish with autoStep (the seat\'s witness)',
        /while \(!g\.done && t < cap\) \{ autoStep\(g, DT\)/.test(pc)
        && /autopilot grants the lifetime wish/.test(pc))
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
    rep.check(`phone: registry parse finds the advertised WATCH titles`, PHONE_TITLES.length >= 40,
        `${PHONE_TITLES.length} titles parsed`)
    // #1884: pilot urls may carry query params (magic-carpet's is `?seed=7`),
    // so the route→hook lookup compares paths, not full urls. This census pins
    // that every pilot's path is a real registry route — a drift here once made
    // the phone section report magic-carpet as unmapped while its pilot passed.
    rep.check('#1884 every PILOTS url resolves to a registry route once the query is stripped',
        PILOTS.every((x) => PHONE_TITLES.includes(x.url.split('?')[0].slice(BASE.length))),
        PILOTS.filter((x) => !PHONE_TITLES.includes(x.url.split('?')[0].slice(BASE.length))).map((x) => x.url).join(' ') || 'all resolve')
    const browser = await launch()
    console.log(`\n— phone 390x844 (boot ${browser.__bootMode || 'chrome'}), ${titles.length} watch titles`)
    for (const p of titles) {
        const id = p.replace(/^\//, '')
        // #1884: compare paths, not full urls — PILOTS entries may carry query
        // params (`magic-carpet?seed=7`), and the exact compare missed the route.
        const hook = (PILOTS.find((x) => x.url.split('?')[0] === `${BASE}/${id}`) || {}).hook
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
