// Autopilot regression (option 3): the rule-based CPU must clear 1-1 outright.
//
// Promoted from the throwaway driver that iteration 12 left in scripts/.shots/.
// The autopilot is deterministic, so "did it reach the castle?" is a real gate —
// if a level/AI change drops it below a clean win, this exits non-zero.
//
// It runs the level TWICE, because one run cannot prove both things:
//
//   pass 1 (as it plays) — it should reach the fire flower at col 16 and become
//     Fire Mario. For years it did not: its ?-block rule jumped one tile early,
//     sailed over the flower, and so the entire fire branch of the autopilot had
//     literally never executed. That is gated now.
//   pass 2 (fire taken away past col 20) — Fire Mario burns every piranha plant
//     before ever reaching it, which is strictly better play and would leave the
//     plant-jump formula unexercised forever. 1-1 has exactly one fire flower, so
//     dropping his power after col 20 makes the rest of the run a pure jumping test.
//     He drifts back up to Big Mario off the other ? blocks, which is the harder
//     case anyway — a 28px-tall hitbox clips a plant that a 16px one sails past.
//
// Plant clearances are measured feet-vs-the-plant's-HEAD, and only against live
// plants, while accounting for Mario being 16px wide when Big. All three of those
// details were wrong at least once, each producing a green check that meant
// nothing (or a red check on a flawless run).
//
// Usage:
//   npm run autopilotcheck
//   node scripts/autopilotcheck.mjs [--max-wait 240] [--url <url>] [--pass one|two]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const maxWait = +opt(args, '--max-wait', 240)   // seconds of wall clock
const POLL = 40                                 // fine enough to catch a jump apex
const only = opt(args, '--pass', '')

await requireDevServer(url)
const browser = await launch()
const r = new Report('autopilotcheck')

// Drive one full autopilot run, sampling Mario and the plants as it goes.
async function runPass(page, { forceSmallAfter = 0 } = {}) {
    await page.evaluate(() => window.__marioTest.autoplay())
    const t0 = Date.now()
    let s = await page.evaluate(() => window.__marioTest.getState())
    let maxCol = s.col, deaths = 0, lastLives = s.lives, outcome = 'timeout'
    let facedEmerged = 0, everFire = false, demoted = false
    const crossings = new Map()                 // pipe col -> { minVert, atOut, atSlack }
    const burned = new Set()                    // pipe cols whose plant got fireballed

    while ((Date.now() - t0) / 1000 < maxWait) {
        await page.waitForTimeout(POLL)
        const snap = await page.evaluate(() => ({
            st: window.__marioTest.getState(),
            pl: window.__marioTest.plants ? window.__marioTest.plants() : [],
        }))
        s = snap.st
        if (s.power === 'fire') everFire = true
        maxCol = Math.max(maxCol, s.col)
        if (s.lives < lastLives) { deaths += lastLives - s.lives; r.info('lost a life', `at col ${maxCol}`) }
        lastLives = s.lives

        if (forceSmallAfter && !demoted && s.col > forceSmallAfter && s.power !== 'small') {
            demoted = true
            await page.evaluate(() => window.__marioTest.setPower('small'))
        }

        for (const p of snap.pl) {
            const pc = p.pipeCol ?? p.col
            if (Math.abs(p.col - s.col) < 9 && p.out > 0.9) facedEmerged++
            // A flipped plant is a BURNED plant: fireballs send the corpse flying off the
            // top of the screen, and scoring that as a "clearance" once reported feet
            // 466px below the head and failed a run where Mario killed it cleanly.
            if (p.flip || !p.alive) { if (p.flip) burned.add(pc); continue }
            if (p.h === 0) continue
            // Mario is 16px wide as Big/Fire Mario, not 12 — hardcoding the small hitbox
            // over-credited horizontal overlap exactly when he was likeliest to clip.
            const xSlack = Math.min(s.x + s.w - p.x, p.x + p.w - s.x)
            if (xSlack <= 0) continue
            const vert = p.y - (s.y + s.h)                      // feet above the HEAD
            const cur = crossings.get(pc)
            if (!cur || vert < cur.minVert) crossings.set(pc, { minVert: vert, atOut: p.out, atSlack: xSlack })
        }

        if (s.state === 'win') { outcome = 'win'; break }
        if (s.state === 'gameover') { outcome = 'gameover'; break }
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    return {
        s, maxCol, deaths, outcome, facedEmerged, everFire, crossings, burned, secs,
        demoted,
    }
}

const describe = (crossed) => crossed.map(([col, c]) =>
    `col ${col}: feet ${c.minVert}px above head (out=${c.atOut.toFixed(2)}, xSlack=${c.atSlack}px)`)

// ---------------------------------------------------------------- pass 1
if (only !== 'two') {
    const page = await openMario(browser, { url })
    const p = await runPass(page)
    console.log(`  ..    [fire] state=${p.s.state} col=${p.s.col} maxCol=${p.maxCol} lives=${p.s.lives} ` +
        `score=${p.s.score} power=${p.s.power} in ${p.secs}s`)
    r.check('autopilot mode engaged', p.s.mode === 'autopilot' || p.outcome !== 'timeout', `mode=${p.s.mode}`)
    r.check('reached the flagpole (col >= 170)', p.maxCol >= 170, `maxCol=${p.maxCol}`)
    r.check('cleared the level (WORLD 1-1 CLEAR)', p.outcome === 'win', `outcome=${p.outcome}`)
    r.check('no deaths', p.deaths === 0, `deaths=${p.deaths}`)
    // The autopilot used to sail straight over the fire flower at col 16, so the whole
    // Fire Mario branch — every fireball, every burn — was dead code that had never run
    // once. Gate it or it silently rots back.
    r.check('became Fire Mario (bumped the col-16 ? block)', p.everFire, `power at end=${p.s.power}`)
    r.check('actually faced a fully-emerged plant', p.facedEmerged > 0,
        `${p.facedEmerged} frames within 9 cols of a plant at full extension`)
    for (const line of describe([...p.crossings.entries()].sort((a, b) => a[0] - b[0]))) {
        r.info('plant clearance (fire pass)', line)
    }
    r.info('plants burned before reaching them',
        p.burned.size ? [...p.burned].join(', ') : 'none')
    await page.screenshot({ path: 'scripts/.shots/autopilot-end.png' }).catch(() => {})
    await page.close()
}

// ---------------------------------------------------------------- pass 2
// Same run with the fireball option taken away past the flower, so the plants have
// to be jumped. This is what keeps the arc-solving commit distance honest.
if (only !== 'one') {
    const page = await openMario(browser, { url })
    const p = await runPass(page, { forceSmallAfter: 20 })
    console.log(`  ..    [jump] state=${p.s.state} col=${p.s.col} maxCol=${p.maxCol} lives=${p.s.lives} ` +
        `power=${p.s.power} in ${p.secs}s`)
    r.check('[jump pass] cleared the level', p.outcome === 'win', `outcome=${p.outcome}`)
    r.check('[jump pass] no deaths', p.deaths === 0, `deaths=${p.deaths}`)
    r.check('[jump pass] was demoted out of Fire Mario', p.demoted, `demoted=${p.demoted}`)
    const crossed = [...p.crossings.entries()].sort((a, b) => a[0] - b[0])
    r.check('[jump pass] met the plants it could not burn', crossed.length >= 2,
        `jumped past ${crossed.length} plants (${crossed.map(([c]) => c).join(', ') || 'none'})`)
    for (const [col, c] of crossed) {
        const tag = c.minVert > 0 ? 'clear' : 'GRAZE'
        r.info('[jump pass] plant', `col ${col} ${tag}: feet ${c.minVert}px above head ` +
            `(out=${c.atOut.toFixed(2)}, xSlack=${c.atSlack}px)`)
    }
    // Hard gate: at least one plant must be cleared CLEANLY (feet above the head). This is
    // what pins the arc-solving commit distance — if the formula rots, every crossing goes
    // negative at once. Col 46 is knowingly reported as a graze rather than gated: the
    // goomba at col 41 forces a hop that lands Mario ~15px past the last usable take-off,
    // so he clips that one plant's leaves and loses power but never a life. Gating it would
    // mean gating the level's goomba placement, and fudging either would be a fake green.
    const clean = crossed.filter(([, c]) => c.minVert > 0)
    r.check('[jump pass] cleared at least one plant cleanly (feet above its head)', clean.length >= 1,
        `${clean.length}/${crossed.length} clean (${clean.map(([c, v]) => c + ':' + v.minVert + 'px').join(', ') || 'none'})`)
    await page.screenshot({ path: 'scripts/.shots/autopilot-jump.png' }).catch(() => {})
    await page.close()
}

r.exit(browser)
