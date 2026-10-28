// boredomaudit.mjs — the boredom map (#1131): where does a bot run go flat,
// dead or spiky? For every contract game (scripts/lib/contractGames.mjs), in
// headless Chrome against the DEV server, replay the nightly bot policy
// (scripts/nightlybot.mjs padFor, same seed math) over several seeds through
// locked contract steps and diff `__game.state()` every tick into three
// signals: reward (score gained), damage (lives-style fields lost), motion
// (meaningful state keys moving). Sum into 1-second strips, combine seeds,
// classify each second against the run median (dead / flat / live / spike)
// and score the run: boredom = (dead + 0.5×flat) / seconds.
//
// Output: public/forge/boredom.json (the Forge board's BOREDOM MAP section —
// heat strips worst-first) and a console table. This is a measurement, not a
// gate — scripts/boredomcheck.mjs is the gate. Regenerate after shipping:
//   npm run dev   (another terminal)
//   npm run boredomaudit                    # all contract games
//   BOREDOM_ONLY=momentum npm run boredomaudit
//   node scripts/boredomaudit.mjs --only=momentum --seeds=7 --cap=1800 --out=/tmp/b.json
//
// File the worst stretches as short QA issues (deduped by failure-shape like
// nightlybot; only an operator/warden sets this):
//   BOREDOM_FILE=1 npm run boredomaudit
//
// Momentum Runner's empty courses are the founding example this exists to catch.

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launch, openGame, requireDevServer } from './lib/harness.mjs'
import { GAMES } from './lib/contractGames.mjs'
import { bucketSeconds, combineSeeds, buildReport, segmentLevels } from './lib/boredom.mjs'
import { REPLAY } from './lib/boredomPage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BOREDOM_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const arg = (name, d) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.split('=')[1] : d
}
const ONLY = process.env.BOREDOM_ONLY || arg('only', null)
const SEEDS = (process.env.BOREDOM_SEEDS || arg('seeds', '7,101,2027')).split(',').map(Number).filter((n) => !Number.isNaN(n))
const CAP = Math.max(120, parseInt(arg('cap', 5400), 10))   // 90 s of world time
const OUT = arg('out', join(HERE, '../public/forge/boredom.json'))
const OPTS = {
    noise: ['tick', 'hash', 'seed', 'done'],
    damage: ['lives', 'cities', 'ammo', 'health', 'hp', 'fuels', 'shields'],
    keyMaxLen: 4096,
    waits: ['banner', 'attract', 'intro', 'ready', 'menu', 'start', 'over', 'gameover', 'game over', 'select', 'choose', 'levelup', 'level up', 'pause', 'paused', 'dying', 'respawn', 'brief', 'story'],
    preRoll: 600,
}
// Comet Drift HD defaults to WebGPU (state is fine, but keep the documented
// readback pin the other contract harnesses use).
const QUERY = { 'comet-drift-hd': 'gl=webgl2' }
// A state() that exposes no position carrier is BLIND: the sim can be
// sprinting while every visible key sits still (MomentumRunner hid its runner
// until this map caught it; #1184 is the fleet-wide calibration). Flat
// readings on blind games are suspect, not verdicts — board and filing agree.
const POSITION_KEYS = ['pos', 'aim', 'playerX', 'playerY', 'p', 'x', 'y', 'px', 'py']

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
    const meta = await page.evaluate(() => window.__game.meta)
    const buttons = meta?.buttons || ['a']
    const pointer = meta?.method === 'pointer'
    const perSeedSeconds = []
    const seenKeys = new Set()
    let firstLevels = null
    let secondsDone = 0
    let ticksTotal = 0
    for (const seed of SEEDS) {
        const run = await page.evaluate(REPLAY, { seed, cap: CAP, buttons, pointer, opts: OPTS })
        if (!run || !run.samples || run.samples.length < 2) continue
        ticksTotal += run.ticks
        perSeedSeconds.push(bucketSeconds(run.samples))
        if (!firstLevels) firstLevels = run.samples.map((s) => s.level)
        for (const k of run.keys || []) seenKeys.add(k)
        if (run.done) secondsDone++
    }
    if (!perSeedSeconds.length) {
        console.log(`NO DATA${errs.length ? ` (${errs.length} page errors)` : ''}`)
        games.push({ id: p.id, strip: [], runs: 0, errors: errs.length })
        await page.close()
        continue
    }
    const strip = combineSeeds(perSeedSeconds).map((x) => Math.round(x * 10) / 10)
    const blind = !POSITION_KEYS.some((k) => seenKeys.has(k))
    games.push({
        id: p.id,
        strip,
        seconds: strip.length,
        runs: perSeedSeconds.length,
        runsDone: secondsDone,
        ticksAvg: Math.round(ticksTotal / perSeedSeconds.length),
        blind,
        levels: (firstLevels ? segmentLevels(firstLevels) : [])
            .map((l) => ({ label: l.label, seconds: Math.round(l.len / 60) })),
        errors: errs.length,
    })
    await page.close()
    const rep = buildReport({ commit, seeds: SEEDS, games: [games[games.length - 1]] }).games[0]
    const pct = rep.boredom === null ? '??' : `${Math.round(rep.boredom * 100)}%`
    console.log(`${pct} bored · ${strip.length}s ${rep.worst ? `· worst ${rep.worst.type} ${rep.worst.len}s @${rep.worst.startSec}s` : ''}${blind ? ' · BLIND(state)' : ''}${rep.file && !blind ? ' · FILES' : ''}${errs.length ? ` (${errs.length} page errors)` : ''}`)
}
await browser.close()

const report = buildReport({ commit, seeds: SEEDS, games })
const ranked = [...report.games].sort((a, b) => (b.boredom ?? -1) - (a.boredom ?? -1))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n')
console.log(`\nboredom map @${commit} — written to ${OUT}`)
for (const g of ranked) {
    console.log(`  ${g.boredom === null ? ' ??' : String(Math.round(g.boredom * 100)).padStart(3)}%  ${g.id}${g.worst ? `  ${g.worst.type} ${g.worst.len}s @${g.worst.startSec}s` : ''}${g.file ? '  ← would file' : ''}`)
}

if (process.env.BOREDOM_FILE) {
    const { execFileSync } = await import('node:child_process')
    const open = JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', 'jalfern/retrogames', '--state', 'open',
        '--label', 'feedback', '--json', 'title'], { encoding: 'utf8' })).map((i) => i.title)
    const shape = (g) => `${g.worst ? g.worst.type : 'flat'} ${String(g.worst ? g.worst.startSec : 0).replace(/\d+/g, '#')}s`.slice(0, 60)
    for (const g of report.games) {
        if (!g.file || g.boredom === null || g.blind) continue
        const sh = shape(g)
        if (open.some((t) => t.startsWith(`QA \u2014 ${g.id}: boredom`))) continue
        const body = `Found by the boredom map (${report.generated}, seeds ${SEEDS.join(',')}, commit ${commit}).\n\n` +
            `**what happened:** ${g.worst ? `a ${g.worst.len}-second ${g.worst.type} stretch from second ${g.worst.startSec} of the bot run` : `${Math.round(g.boredom * 100)}% of the run reads flat`}` +
            ` — boredom score ${Math.round(g.boredom * 100)}% over ${g.seconds}s.\n` +
            `**repro:** \`BOREDOM_ONLY=${g.id} npm run boredomaudit\` (needs \`npm run dev\`)\n` +
            `_Filed automatically by scripts/boredomaudit.mjs (#1131)._`
        execFileSync('gh', ['issue', 'create', '--repo', 'jalfern/retrogames', '--label', 'feedback', '--label', 'lane:qa',
            '--title', `QA — ${g.id}: boredom ${sh}`, '--body', body])
        console.log(`filed QA issue for ${g.id}`)
    }
}
