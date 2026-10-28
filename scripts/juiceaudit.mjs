// juiceaudit.mjs — the juice audit (#1130): every player action should get a
// reaction back within ~150 ms. For every contract game (scripts/lib/
// contractGames.mjs), in headless Chrome against the DEV server:
//
//   seed the game through the contract (`__game.reset(seed)` — no `step()`:
//   the loop lock would bypass the live input→events→audio path, which is
//   precisely where juice lives), then press the action the way a player or
//   the on-screen pad does — a real KeyboardEvent held ~150 ms (VirtualControls
//   dispatches the same codes), or a pointer down/up at the canvas centre for
//   pointer-method titles — while sampling every animation frame:
//     sound   one-shot SFX counted by AudioController (window.__audioSfx)
//     burst   changed-pixel fraction of a 160×90 copy of the game canvas,
//             compared against an equal no-input window at the same moment
//     pop     __game.state().score moved
//   Each action gets TRIALS trials; an action with no channel lighting up is a
//   polish gap. "B" reads its real code off the pad button ([data-vc=b]
//   [data-key], added for this audit); unprobed buttons are skipped, not
//   called silent.
//
// Output: public/forge/juice.json (the Forge board's JUICE AUDIT section) and
// a console table, worst-first. Regenerate after shipping a game:
//   npm run dev   (another terminal)
//   npm run juiceaudit                    # all contract games
//   JUICE_ONLY=galaga npm run juiceaudit
//   node scripts/juiceaudit.mjs --only=galaga --trials=5 --out=/tmp/j.json
//
// This is a measurement, not a gate: a 0% game is a report, not a red build.
// scripts/juicecheck.mjs is the gate — it proves the math and one live probe.

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launch, openGame, requireDevServer } from './lib/harness.mjs'
import { GAMES } from './lib/contractGames.mjs'
import { WINDOW_TICKS, TRIALS, PIXEL_TOL, STATE_NOISE, actionVerdict, buildReport, silentActions } from './lib/juice.mjs'
import { WINDOW } from './lib/juicePage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.JUICE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const arg = (name, d) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.split('=')[1] : d
}
const ONLY = process.env.JUICE_ONLY || arg('only', null)
const N_TRIALS = Math.max(1, parseInt(arg('trials', TRIALS), 10))
const FRAMES = Math.max(1, parseInt(arg('window', WINDOW_TICKS), 10))
const OUT = arg('out', join(HERE, '../public/forge/juice.json'))
const SEED = 7
// Pixel readback needs a canvas a 2D context can copy: Comet Drift HD defaults
// to WebGPU (black to drawImage) and advertises this fallback (#1016 law, the
// same pin cometdrifthdcheck uses).
const QUERY = { 'comet-drift-hd': 'gl=webgl2' }
// x/y are analog views of the arrows; start/select are shell chrome, not actions.
const SKIP_ACTIONS = ['start', 'select', 'x', 'y']
const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', a: 'Space' }

await requireDevServer(`${BASE}/lunar-lander`)
let commit = 'unknown'
try { commit = execSync('git rev-parse --short HEAD', { cwd: join(HERE, '..') }).toString().trim() } catch { /* shallow checkout */ }

const RUN = ONLY ? GAMES.filter((g) => g.id === ONLY) : GAMES
if (!RUN.length) { console.error(`--only="${ONLY}" matched no contract game`); process.exit(2) }

const browser = await launch()
const games = []
for (const p of RUN) {
    const q = QUERY[p.id] ? `?${QUERY[p.id]}` : ''
    process.stdout.write(`[${p.id}] `)
    const page = await openGame(browser, { url: `${BASE}${p.path}${q}`, hook: '__game', start: true, wait: 500 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    const setup = await page.evaluate(() => {
        const g = window.__game
        const bBtn = document.querySelector('[data-vc="b"]')
        return { meta: g.meta, bCode: bBtn ? bBtn.getAttribute('data-key') : null }
    })
    const meta = setup.meta
    const buttons = (meta.buttons || []).filter((b) => !SKIP_ACTIONS.includes(b))
    const plan = []
    for (const btn of buttons) {
        if (KEY[btn]) plan.push({ name: btn, codes: [KEY[btn]] })
        else if (btn === 'b' && setup.bCode) plan.push({ name: 'b', codes: [setup.bCode] })
    }
    if (meta.method === 'pointer') plan.push({ name: 'pointer', codes: [], pointer: true })
    const res = {}
    for (const act of plan) {
        const trials = []
        const allKeys = []
        let idleKeys = []
        let idleMax = 0
        for (let t = 0; t < N_TRIALS; t++) {
            await page.evaluate((seed) => window.__game.reset(seed), SEED)
            await page.waitForTimeout(150)
            const idle = await page.evaluate(WINDOW, { codes: [], frames: FRAMES, tol: PIXEL_TOL, noise: STATE_NOISE })
            const run = await page.evaluate(WINDOW, { codes: act.codes, pointer: !!act.pointer, frames: FRAMES, tol: PIXEL_TOL, noise: STATE_NOISE })
            if (run.error) continue
            idleMax = Math.max(idleMax, idle.burst || 0)
            idleKeys = [...new Set([...idleKeys, ...(idle.keys || [])])]
            allKeys.push(...(run.keys || []))
            trials.push(actionVerdict({ sfx: run.sfx, burstMax: run.burst, idleMax, pop: run.pop, keys: run.keys, idleKeys }))
        }
        if (!trials.length) continue
        res[act.name] = {
            sound: trials.some((v) => v.sound),
            fx: trials.some((v) => v.fx),
            moved: trials.some((v) => v.moved),
            pop: trials.some((v) => v.pop),
            juice: trials.some((v) => v.juice),
            keys: [...new Set(allKeys)].sort(),
            idle: Math.round(idleMax * 1000) / 1000,
        }
    }
    const entry = { id: p.id, method: meta.method || 'stick', actions: res, errors: errs.length }
    games.push(entry)
    const score = buildReport({ games: [entry] }).games[0].score
    const silent = silentActions(res)
    console.log(`${score === null ? '??' : Math.round(score * 100) + '%'}${silent.length ? `  silent: ${silent.join(', ')}` : ''}${errs.length ? `  (${errs.length} page errors)` : ''}`)
    await page.close()
}

const report = buildReport({ commit, games })
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n')
const ranked = [...report.games].sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
console.log(`\njuice audit @${commit} — written to ${OUT}`)
for (const g of ranked) console.log(`  ${g.score === null ? ' ??' : String(Math.round(g.score * 100)).padStart(3)}%  ${g.id}${silentActions(g.actions).length ? `  gaps: ${silentActions(g.actions).join(', ')}` : ''}`)
await browser.close()
