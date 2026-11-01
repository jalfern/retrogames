// juicecheck.mjs — the gate for the juice audit (#1130). Two halves:
//
//  A. MATH (plain Node, no browser): scripts/lib/juice.mjs is where every
//     verdict lives, so every threshold gets pinned on fixtures — an identical
//     frame is quiet, a flash registers, the tolerance is real, a burst must
//     beat the idle baseline by the stated factor, and the score is the share
//     of actions that reacted.
//  B. LIVE (headless Chrome, needs `npm run dev`): Lunar Lander on the
//     contract — thrust must return sound AND pixels over its idle window;
//     an idle window must return neither. This proves the instrument measures
//     the real thing, not just the fixtures.
//
// Mutant: `node scripts/juicecheck.mjs --mutate` strips the SFX counter bump
// from AudioController (a silent instrument is the exact failure mode an audit
// must never hide), runs the live sound gate, requires RED, and restores.
//
// Run: npm run dev (another terminal), then npm run juicecheck [-- --mutate].

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    frameDiff, actionVerdict, gameScore, silentActions, buildReport,
    BURST_MIN, IDLE_EXCEED, PIXEL_TOL, STATE_NOISE, WINDOW_TICKS, TRIALS,
} from './lib/juice.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const AC = join(HERE, '../src/utils/AudioController.js')
const MUTATE = process.argv.includes('--mutate')
const NO_BROWSER = process.argv.includes('--no-browser')
const BASE = process.env.JUICE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`

let failed = 0
const ok = (label, pass, detail = '') => {
    if (!pass) failed++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// ------------------------------------------------------------------- math ----
console.log('math (scripts/lib/juice.mjs)')
{
    const A = new Uint8ClampedArray(160 * 90 * 4).fill(40)
    ok('a byte-identical frame diffs to zero', frameDiff(A, A) === 0)

    const B = Uint8ClampedArray.from(A)
    for (let i = 0; i < 16; i++) B[i * 4] = 250
    ok('a 16-pixel flash registers', Math.abs(frameDiff(A, B) - 16 / (160 * 90)) < 1e-9, `${frameDiff(A, B)}`)

    const C = Uint8ClampedArray.from(A)
    for (let i = 0; i < C.length; i += 4) C[i] = 40 + PIXEL_TOL
    ok(`a delta of exactly the tolerance is noise (${PIXEL_TOL})`, frameDiff(A, C) === 0)
    const D = Uint8ClampedArray.from(A)
    for (let i = 0; i < D.length; i += 4) D[i] = 40 + PIXEL_TOL + 1
    ok('a delta over the tolerance moves every pixel', frameDiff(A, D) === 1)

    ok('burst under BURST_MIN is not fx', actionVerdict({ burstMax: BURST_MIN * 0.5, idleMax: 0 }).fx === false)
    ok('burst at BURST_MIN over a still idle is fx', actionVerdict({ burstMax: BURST_MIN, idleMax: 0 }).fx === true)
    ok('a burst that merely trails the idle motion is NOT juice',
        actionVerdict({ burstMax: 0.5, idleMax: 0.4 }).fx === false, `0.5 < 0.4×${IDLE_EXCEED}`)
    ok('a burst that beats idle by the factor is fx',
        actionVerdict({ burstMax: 0.33, idleMax: 0.2 }).fx === true, `0.33 vs 0.2×${IDLE_EXCEED}`)
    ok('a state key the idle window never moved is motion',
        actionVerdict({ keys: ['vy'], idleKeys: ['x'] }).moved === true)
    ok('keys that move just as much while idle are not motion',
        actionVerdict({ keys: ['x', 'y'], idleKeys: ['x', 'y', 'z'] }).moved === false)
    ok('sound alone is a reaction', actionVerdict({ sfx: 1 }).juice === true)
    ok('a score pop alone is a reaction', actionVerdict({ pop: true }).juice === true)
    ok('nothing back is no reaction', actionVerdict({ sfx: 0, burstMax: 0, idleMax: 0, pop: false }).juice === false)

    ok('score is the reacted share', gameScore({
        a: { juice: true }, b: { juice: false }, c: { juice: true }, d: { juice: true },
    }) === 0.75)
    ok('a game with no probeable actions scores null (never a fake zero)', gameScore({}) === null)
    ok('silentActions names the dead ones', silentActions({
        a: { juice: true }, b: { juice: false }, c: { juice: false },
    }).join(',') === 'b,c')

    const rep = buildReport({ commit: 'abc1234', games: [{ id: 'x', actions: { a: { juice: true }, b: { juice: false } } }] })
    ok('report stamps commit + ISO time + thresholds', rep.commit === 'abc1234'
        && !Number.isNaN(Date.parse(rep.generated))
        && rep.thresholds.burstMin === BURST_MIN && rep.thresholds.idleExceed === IDLE_EXCEED
        && rep.windowTicks === WINDOW_TICKS && rep.trials === TRIALS)
    ok('report computes the per-game score', rep.games[0].score === 0.5)
}

// ------------------------------------------------------------------ live ----
if (!NO_BROWSER) {
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    await requireDevServer(`${BASE}/lunar-lander`)

    // Same sampler the audit ships with (scripts/lib/juicePage.mjs): real key
    // events, the game's own loop, canvas + SFX + state keys between frames.
    const { WINDOW, PREP, WAIT_PHASES } = await import('./lib/juicePage.mjs')

    const src = readFileSync(AC, 'utf8')
    let mutated = null
    if (MUTATE) {
        mutated = src
        plant(AC, src.replace('        this.sfx++\n        const bufferSize', '        const bufferSize'))
        console.log(`MUTANT: SFX counter stripped from AudioController.playNoise — the live sound gates must go RED`)
    }
    const browser = await launch()
    try {
        console.log(MUTATE ? 'live (mutated — expect red):' : 'live (lunar-lander):')
        const page = await openGame(browser, { url: `${BASE}/lunar-lander`, hook: '__game', start: true, wait: 500 })
        const errs = []
        page.on('pageerror', (e) => errs.push(e.message))
        const prep = await page.evaluate(PREP, { seed: 7, waits: WAIT_PHASES, steps: [0, 90, 180, 270, 360] })
        ok(`lunar-lander: PREP lands in a receptive phase (not ${WAIT_PHASES.slice(0, 3).join('/')}…)`, !WAIT_PHASES.includes(prep.phase) && prep.ticks <= 90, `phase=${prep.phase} after ${prep.ticks} ticks`)
        const idle = await page.evaluate(WINDOW, { codes: [], frames: WINDOW_TICKS, tol: PIXEL_TOL, noise: STATE_NOISE })
        const thrust = await page.evaluate(WINDOW, { codes: ['ArrowUp'], frames: WINDOW_TICKS, tol: PIXEL_TOL, noise: STATE_NOISE })
        const v = actionVerdict({ sfx: thrust.sfx, burstMax: thrust.burst, idleMax: idle.burst, pop: false, keys: thrust.keys, idleKeys: idle.keys })
        // Same assertion mutated and clean: with the counter stripped the sound
        // channel goes blind, this gate goes RED, and that red is the proof
        // (exit 1 while mutated is the correct outcome — see the header).
        ok('lunar-lander: thrust schedules SFX (sound channel hears it)', v.sound === true,
            `sfx=${thrust.sfx} idle=${idle.sfx}`)
        ok('lunar-lander: thrust moves the sim where idle did not (motion channel)', v.moved === true,
            `keys=${JSON.stringify(thrust.keys)} idle=${JSON.stringify(idle.keys)}`)
        ok('lunar-lander: an idle window moves strictly fewer state fields than thrust',
            thrust.keys.length > idle.keys.length, `${thrust.keys.length} vs ${idle.keys.length}`)
        ok('lunar-lander: a held-still window is quiet on sound', idle.sfx === 0, `idle sfx=${idle.sfx}`)
        ok('lunar-lander: the page ran clean', errs.length === 0, errs.join(' | '))
        await page.close()
    } finally {
        if (mutated) { pull(AC); console.log('mutant restored.') }
        await browser.close()
    }
}

console.log(`\njuicecheck: ${failed ? `${failed} FAILED` : 'OK'}`)
process.exit(failed ? 1 : 0)
