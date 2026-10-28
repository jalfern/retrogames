// boredomcheck.mjs — the gate for the boredom map (#1131). Three halves:
//
//  A. MATH (plain Node, no browser): scripts/lib/boredom.mjs holds every
//     verdict, so every threshold gets pinned on fixtures — a silent second is
//     dead, reward/damage/motion keep a second alive, the flat/spike ratios are
//     real against the median, truncated tail seconds are dropped, multi-seed
//     means ignore seconds a seed never reached, dead outranks flat in the
//     worst-stretch call, and the boredom score is (dead + flat/2)/seconds.
//  B. LIVE (headless Chrome, needs `npm run dev`): Lunar Lander replayed with
//     the exact instrument the audit ships — the tick diff must see thrust
//     motion, the samples must scale with the run, done-runs must not be
//     padded past death, and the committed public/forge/boredom.json must
//     validate against the contract roster (fresh, complete, sane thresholds).
//  C. MUTANT: BOREDOM_MUTATE=dead blinds `dead` classification in the lib —
//     the frozen-seconds fixture must go RED (a map that cannot see dead air
//     is the exact failure mode this instrument must never hide).
//
// Run: npm run dev (another terminal), then npm run boredomcheck [-- --mutate].

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
    tickSignals, bucketSeconds, combineSeeds, classifySecond, classifyStrip,
    boredomScore, worstStretch, segmentLevels, shouldFile, buildReport,
    FLAT_RATIO, SPIKE_RATIO, FLAT_WEIGHT, FLAT_FILE_SHARE, MEDIAN_FLOOR, DEAD_FILE_SECS, DAMAGE_KEYS,
} from './lib/boredom.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUTANT = process.argv.includes('--mutate') || process.env.BOREDOM_MUTATE === 'dead'
const NO_BROWSER = process.argv.includes('--no-browser')
const BASE = process.env.BOREDOM_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const ENV_ON = process.env.BOREDOM_MUTATE === 'dead'

let failed = 0
const ok = (label, pass, detail = '') => {
    if (!pass) failed++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// ------------------------------------------------------------------- math ----
console.log('math (scripts/lib/boredom.mjs)')
{
    const S = (o) => ({ tick: 1, hash: 9, seed: 3, done: false, ...o })
    ok('an unchanged state produces no signal',
        JSON.stringify(tickSignals(S({ score: 5, x: 1 }), S({ score: 5, x: 1 }))) === JSON.stringify({ ev: 0, dmg: 0, act: 0, dist: 0 }))
    ok('tick/hash/seed/done churn is noise',
        tickSignals({ tick: 1, hash: 1, seed: 1, done: false }, { tick: 2, hash: 2, seed: 1, done: true }).act === 0)
    ok('score up is reward, score down is not',
        tickSignals(S({ score: 10 }), S({ score: 40 })).ev === 30 && tickSignals(S({ score: 40 }), S({ score: 10 })).ev === 0)
    ok('a lives drop is damage', tickSignals(S({ lives: 3 }), S({ lives: 2 })).dmg === 1)
    ok('every named damage key bites', DAMAGE_KEYS.every((k) => tickSignals(S({ [k]: 3 }), S({ [k]: 2 })).dmg === 1))
    ok('a moved position key is motion', tickSignals(S({ x: 1 }), S({ x: 2 })).act === 1)
    ok('motion weighs by distance: sprint louder than crawl',
        tickSignals(S({ x: 0 }), S({ x: 30 })).dist === 30 && tickSignals(S({ x: 0 }), S({ x: 1 })).dist === 1)
    ok('a moved pair carries both axes',
        tickSignals(S({ pos: [0, 0] }), S({ pos: [3, -4] })).dist === 7)
    ok('sub-tick motion survives rounding (#1190): a 0.045 walk is not erased',
        tickSignals(S({ x: 5 }), S({ x: 5.045 })).dist === 0.045
        && tickSignals(S({ pos: [5, 5] }), S({ pos: [5.045, 5.045] })).dist > 0)
    ok('an oversized key is scenery, not motion',
        tickSignals(S({ grid: 'x'.repeat(5000) }), S({ grid: 'y'.repeat(5000) })).act === 0)

    const s = (ev, dmg, dist) => ({ ev, dmg, act: dist > 0 ? 1 : 0, dist })
    const sample61 = [s(5, 0, 0), ...Array.from({ length: 59 }, () => s(0, 0, 1)), s(0, 0, 0)]
    ok('61 ticks bucket to one full second (trailing partial dropped)',
        bucketSeconds(sample61).length === 1 && bucketSeconds(sample61)[0] === 5 + 59)
    ok('a sub-second run still maps to one second', bucketSeconds([s(1, 0, 0), s(0, 2, 0)]).length === 1)
    ok('legacy samples without dist fall back to the key count',
        bucketSeconds(Array.from({ length: 60 }, () => ({ ev: 0, dmg: 0, act: 2 })))[0] === 120)
    {
        const walk = Array.from({ length: 600 }, (_, i) => s(0, 0, i === 299 ? 400 : 0.045))
        const wStrip = bucketSeconds(walk)
        const wCls = classifyStrip(wStrip)
        ok('a hero walking 0.045/tick never reads dead and never files (#1190)',
            wStrip.every((v) => v > 0) && !wCls.includes('dead')
            && shouldFile(wCls, worstStretch(wCls), false) === false,
            `strip ${wStrip.map((v) => v.toFixed(1)).join(',')}`)
    }
    ok('combineSeeds means over seeds that reached the second',
        combineSeeds([[10, 10], [20]]).join(',') === '15,10', combineSeeds([[10, 10], [20]]).join(','))

    ok('a zero second against a living median is dead', classifySecond(0, 10) === 'dead')
    ok(`a second at the flat ratio (${FLAT_RATIO}) is flat`, classifySecond(3.5, 10) === 'flat')
    ok('a second between flat and spike is live', classifySecond(5, 10) === 'live')
    ok(`a second at the spike ratio (${SPIKE_RATIO}) spikes`, classifySecond(25, 10) === 'spike')
    ok('a near-quiet run (median < floor) classifies flat, never live', classifySecond(0.5, MEDIAN_FLOOR - 0.1) === 'flat')
    ok('classifyStrip applies the median', classifyStrip([0, 10, 10, 30]).join(',') === 'dead,live,live,spike')

    ok('boredom is (dead + flat/2)/seconds',
        boredomScore([1, 1, 1, 1], ['dead', 'flat', 'live', 'spike']) === (1 + FLAT_WEIGHT) / 4)
    ok('an all-live strip is not bored', boredomScore([10, 10], ['live', 'live']) === 0)
    ok('an empty strip scores null, never a fake zero', boredomScore([], []) === null)

    ok('worstStretch finds the longest dead-or-flat run',
        worstStretch(['live', 'dead', 'dead', 'flat', 'live', 'flat', 'live']).len === 3)
    ok('worstStretch names it dead when the run contains dead',
        worstStretch(['dead', 'flat', 'live']).type === 'dead')
    ok('worstStretch on a fully live strip is null', worstStretch(['live', 'spike']) === null)
    ok('worstStretch spacers break runs (live/spike)',
        worstStretch(['flat', 'spike', 'flat']).len === 1)

    ok('segmentLevels splits on a changing level', JSON.stringify(segmentLevels([1, 1, 2, 2, 2]).map((l) => `${l.label}:${l.len}`)) === JSON.stringify(['1:2', '2:3']))
    ok('a constant level field yields no segments (single course)', segmentLevels([3, 3, 3]).length === 0)

    ok('a short dead blip does not file (wait-phase law)', shouldFile(['live', 'dead', 'live'], { type: 'dead', startSec: 1, len: 1 }, false) === false)
    ok(`a ${'dead'} stretch of DEAD_FILE_SECS files`, shouldFile(['dead', 'dead', 'dead', 'live'], { type: 'dead', startSec: 0, len: 3 }, false) === true)
    ok(`a majority-flat run files (${FLAT_FILE_SHARE})`, shouldFile(['flat', 'flat', 'live'], null, false) === true)
    ok('a mostly-live run never files', shouldFile(['flat', 'live', 'live'], null, false) === false)
    ok('a blind game never files, however dead it reads', shouldFile(['dead', 'dead', 'dead'], { type: 'dead', startSec: 0, len: 3 }, true) === false)

    const rep = buildReport({ commit: 'abc1234', seeds: [7], games: [{ id: 'x', strip: [0, 10, 10, 30] }] })
    ok('report stamps commit + ISO time + seeds + thresholds', rep.commit === 'abc1234'
        && !Number.isNaN(Date.parse(rep.generated)) && rep.seeds.join() === '7'
        && rep.thresholds.flatRatio === FLAT_RATIO && rep.thresholds.spikeRatio === SPIKE_RATIO
        && rep.thresholds.flatWeight === FLAT_WEIGHT && rep.thresholds.flatFileShare === FLAT_FILE_SHARE
        && rep.thresholds.medianFloor === MEDIAN_FLOOR && rep.thresholds.deadFileSecs === DEAD_FILE_SECS)
    ok('report decorates games with classes/boredom/worst',
        rep.games[0].classes.join(',') === 'dead,live,live,spike'
        && rep.games[0].boredom === 0.25
        && rep.games[0].worst.type === 'dead' && rep.games[0].worst.len === 1)
    ok('a long dead run files from the report, a short blip does not',
        buildReport({ games: [{ id: 'x', strip: [0, 0, 0, 10] }] }).games[0].file === true
        && buildReport({ games: [{ id: 'x', strip: [0, 10] }] }).games[0].file === false)
    ok('the report marks a blind game unfileable',
        buildReport({ games: [{ id: 'x', strip: [0, 0, 0, 0], blind: true }] }).games[0].file === false)
}

// --------------------------------------------------- mutant (lib-blindness) ----
if (ENV_ON) {
    console.log('mutant (BOREDOM_MUTATE=dead — expect red):')
    ok('MUTANT: blinded map cannot see a dead second', classifySecond(0, 10) === 'dead')
    ok('MUTANT: report can no longer name a dead worst stretch',
        buildReport({ games: [{ id: 'x', strip: [0, 10] }] }).games[0].worst.type === 'dead')
}

// ------------------------------------------------------------------ live ----
if (!NO_BROWSER && !ENV_ON) {
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    await requireDevServer(`${BASE}/lunar-lander`)
    const { REPLAY } = await import('./lib/boredomPage.mjs')
    const OPTS = {
        noise: ['tick', 'hash', 'seed', 'done'],
        damage: DAMAGE_KEYS,
        keyMaxLen: 4096,
        waits: ['banner', 'attract', 'intro', 'ready', 'menu', 'start', 'over', 'gameover', 'game over', 'select', 'choose', 'levelup', 'level up', 'pause', 'paused', 'dying', 'respawn', 'brief', 'story'],
        preRoll: 600,
    }

    console.log('live (lunar-lander):')
    const browser = await launch()
    try {
        const page = await openGame(browser, { url: `${BASE}/lunar-lander`, hook: '__game', start: true, wait: 500 })
        const errs = []
        page.on('pageerror', (e) => errs.push(e.message))
        const meta = await page.evaluate(() => window.__game.meta)
        const run = await page.evaluate(REPLAY, { seed: 7, cap: 600, buttons: meta?.buttons || ['a'], pointer: meta?.method === 'pointer', opts: OPTS })
        ok('replay advances ticks and returns per-tick samples', run.ticks >= 500 && run.samples.length === run.ticks + 1, `${run.ticks} ticks`)
        const motion = run.samples.filter((x) => x.act > 0).length
        ok('the instrument sees world motion across the run', motion > run.ticks * 0.5, `${motion}/${run.ticks} ticks moved`)
        const rewarded = run.samples.filter((x) => x.ev > 0).length + run.samples.filter((x) => x.dmg > 0).length
        ok('landing/crash events surface as reward or damage at some point',
            rewarded > 0 || run.done === false, `reward/damage ticks=${rewarded}, done=${run.done}`)
        const long = await page.evaluate(REPLAY, { seed: 7, cap: 300, buttons: meta?.buttons || ['a'], pointer: meta?.method === 'pointer', opts: OPTS })
        ok('replay length tracks the cap (no hidden padding)', long.ticks <= 300 && run.ticks >= long.ticks, `${run.ticks} vs ${long.ticks}`)
        if (run.done) {
            ok('a finished run stops sampling at death (no post-done padding)', run.ticks <= 3600, `died at ${run.ticks}`)
        } else {
            ok('an unfinished run fills the cap', run.ticks === 600, `ticks=${run.ticks}`)
        }
        ok('the page ran clean', errs.length === 0, errs.join(' | '))
        await page.close()
    } finally {
        await browser.close()
    }

    // committed artifact: fresh, complete, sane
    try {
        const committed = JSON.parse(readFileSync(join(HERE, '../public/forge/boredom.json'), 'utf8'))
        const { GAMES } = await import('./lib/contractGames.mjs')
        ok('committed boredom.json covers every contract game',
            GAMES.every((g) => committed.games.some((c) => c.id === g.id)),
            `${committed.games.length}/${GAMES.length} ids present`)
        ok('committed strips classify inside the schema',
            committed.games.every((g) => g.strip.length === 0
                || (g.classes && g.classes.length === g.strip.length
                    && g.classes.every((c) => ['dead', 'flat', 'live', 'spike'].includes(c)))) && !('mutated' in committed),
            `worst commit ${committed.commit}`)
        ok('committed report carries seeds and thresholds',
            Array.isArray(committed.seeds) && committed.seeds.length > 0 && !!committed.thresholds)
    } catch (e) {
        ok('committed public/forge/boredom.json exists and parses', false, e.message.split('\n')[0])
    }

    // roster parity with the nightly bot — parse its source (importing the
    // module would launch its fleet; nightlybot selftests the same way back)
    const nbSrc = readFileSync(join(HERE, 'nightlybot.mjs'), 'utf8')
    const nbIds = [...nbSrc.matchAll(/\{ id: '([^']+)', path: '([^']+)' \}/g)].map((m) => m[1])
    const { GAMES } = await import('./lib/contractGames.mjs')
    ok('boredom roster matches the nightly bot roster',
        nbIds.length === GAMES.length && nbIds.every((id, i) => id === GAMES[i].id),
        `${GAMES.length} games`)
}

console.log(`\nboredomcheck: ${failed ? `${failed} FAILED` : 'OK'}`)
process.exit(failed ? 1 : 0)
