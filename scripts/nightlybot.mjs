// nightlybot.mjs — #1040: every contract game plays a full run each night.
//
// The forge ships games; nothing played them END TO END unattended. A level
// that boots its contract in 600 scripted ticks (contractcheck) can still
// softlock on tick 4000, and nobody is awake to see it. This runner sits at
// the same window.__game contract, but instead of proving the plumbing it
// PLAYS: seeded, stepped, headless, every registered contract game, until the
// run is done — then judges the run by invariants, not by score.
//
// Per game:
//   boot (hook exists, zero page errors) · reset(seed) at tick 0 ·
//   seeded pad policy until state.done or the tick cap ·
//   INVARIANTS: tick advances every step (except the terminal step) · the run
//   finishes, or the sim froze (hash invariant at the cap = softlock; still
//   moving at the cap = endurance, a warning) · zero page errors.
//   Warnings, never verdicts: seed echo (engines fold seeds), score drops.
//
// Reproducibility: the policy is a pure mulberry32 chain of the seed, so a
// failure line carries the seed and the exact repro command:
//   NIGHTLY_ONLY=<id> NIGHTLY_SEED=<seed> node scripts/nightlybot.mjs
//
// Outputs:
//   /tmp/forge/nightly.json          always (local artifact)
//   NIGHTLY_PUSH=1                   -> jalfern/forge-telemetry nightly.json
//                                      (same anonymous CDN pipe as board.json)
//   NIGHTLY_FILE=1                  -> file one QA issue per NEW hard failure
//                                      (deduped against open `QA — <id>: nightly`
//                                      issues; only the launchd job sets this)
//   --selftest                      -> pure core vs fixtures, no browser
//
// The nightly launchd job (scripts/com.jalfern.nightly-bot.plist) starts its
// OWN dev server on :5199 (lane dev servers on 5173 must not collide), runs
// this, pushes, files, and leaves the arcade untouched.
//
// Fail it once by hand: `NIGHTLY_MUTATE=stuck node scripts/nightlybot.mjs` swallows the
// softlock gate — any frozen run flips red→green, proving the gate is load-bearing.
// `NIGHTLY_MUTATE=squatter` does the same for the :5199 ownership proof (#1355): the bot
// plays against whatever squats its port again, which is exactly how #1312 filed 37
// bogus issues in 48 seconds against an orphan vite.

import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { launch, relayNoise } from './lib/harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = 'repos/jalfern/forge-telemetry'
const CDN = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/nightly.json'

// The contract roster. nightlybotcheck.mjs pins this set against
// contractcheck's roster (scripts/lib/contractGames.mjs) so the two cannot drift silently.
// cap = world ticks a run gets before it is called unfinished. Defaults are
// generous (150 s of world time); games listed here override when a full
// credit-free run legitimately needs longer.
export const GAMES = [
    { id: 'lunar-lander', path: '/lunar-lander' },
    { id: 'tempest', path: '/tempest' },
    { id: 'arkanoid', path: '/arkanoid' },
    { id: 'galaga', path: '/galaga' },
    { id: 'dig-dug', path: '/dig-dug' },
    { id: 'missile-battle', path: '/missile-battle' },
    { id: 'spy-hunter', path: '/spy-hunter' },
    { id: 'paperboy', path: '/paperboy' },
    { id: 'blob-battle', path: '/blob-battle' },
    { id: 'tetris', path: '/tetris' },
    { id: 'boulder-dash', path: '/boulder-dash' },
    { id: 'bubble-bobble', path: '/bubble-bobble' },
    { id: 'ice-climber', path: '/ice-climber' },
    { id: 'joust', path: '/joust' },
    { id: 'qbert', path: '/qbert' },
    { id: 'comet-drift', path: '/comet-drift' },
    { id: 'comet-drift-hd', path: '/comet-drift-hd' },
    { id: 'lemmings', path: '/lemmings' },
    { id: 'sonar', path: '/sonar' },
    { id: 'polarity', path: '/polarity' },
    { id: 'outpost', path: '/outpost' },
    { id: 'dogfight', path: '/dogfight' },
    { id: 'smash-tv', path: '/smash-tv' },
    { id: 'beezee', path: '/beezee' },
    { id: 'metroid', path: '/metroid' },
    { id: 'momentum', path: '/momentum' },
    { id: 'magic-carpet', path: '/magic-carpet' },
    { id: 'gauntlet', path: '/gauntlet' },
    { id: 'emberwood', path: '/emberwood' },
    { id: 'garden-guard', path: '/garden-guard' },
    { id: 'homebody', path: '/homebody' },
    { id: 'iron-ring', path: '/iron-ring' },
    { id: 'viper-pit', path: '/viper-pit' },
    { id: 'britannia', path: '/britannia' },
    { id: 'pick-rush', path: '/pick-rush' },
    { id: 'tidy-bot', path: '/tidy-bot' },
    { id: 'robot-lab', path: '/robot-lab' },
    { id: 'floor-boss', path: '/floor-boss' },
    { id: 'short-order-shout', path: '/short-order-shout' },
    { id: 'rally-co-driver', path: '/rally-co-driver' },
    { id: 'gravel-yard', path: '/gravel-yard' },
    { id: 'talk-me-down', path: '/talk-me-down' },
    { id: 'fire-crew', path: '/fire-crew' },
]
const CAP = 9000

export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const nightlySeed = (dateStr) => dateStr.replace(/-/g, '') * 1

// One pad per tick, pure in (seed, i). Movement most of the time, fire in
// bursts, rare idle ticks; pointer titles sweep the canvas.
export function padFor(seed, i, { buttons = [], pointer = false }) {
    const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0)
    const r = rng()
    if (pointer) {
        const nr = rng()
        return {
            pointer: {
                x: 0.08 + 0.84 * rng(),
                y: 0.10 + 0.8 * rng(),
                down: nr < 0.25,
            },
            a: buttons.includes('a') && nr > 0.8,
        }
    }
    const pad = {}
    if (r < 0.24) pad.left = true
    else if (r < 0.48) pad.right = true
    else if (r < 0.60) pad.up = true
    else if (r < 0.70) pad.down = true
    if (buttons.includes('a') && rng() < 0.18) pad.a = true
    if (buttons.includes('b') && rng() < 0.10) pad.b = true
    return pad
}

// Verdict for one finished run. A cap-reached run is only a SOFTLOCK when the
// sim has also frozen (tail hash invariant); a cap-reached run that is still
// moving is endurance — the bot just never failed, which is not a defect.
// Seed echo is a warning: engines legitimately consume seeds (Lemmings picks
// levels by seed, Gauntlet folds seeds into a 97-slot rng space); the
// determinism contract (same seed → same run) is what contractcheck pins.
export function verdict(run, cap) {
    const flags = []
    const warnings = []
    if (run.bootError) flags.push(`boot: ${run.bootError}`)
    if (run.pageErrors > 0) flags.push(`${run.pageErrors} page error(s): ${run.errorDetail || ''}`)
    if (run.zeroTick !== 0) flags.push(`reset(seed) started at tick ${run.zeroTick}, expected 0`)
    if (run.seedOut !== run.seed) warnings.push(`state.seed=${run.seedOut} != requested seed ${run.seed} (seed folded by the engine?)`)
    if (run.ticksStalled) flags.push(`tick did not advance on step ${run.ticksStalled}`)
    if (!run.done && run.ticks >= cap) {
        if (run.stuck) flags.push(`softlock: frozen at tick ${run.ticks} (hash invariant over last ${run.stuckSpan} steps), score ${run.score}`)
        else warnings.push(`endurance: no done within ${cap} ticks but the sim kept moving (score ${run.score})`)
    }
    if (run.scoreDrops > 0) warnings.push(`score dropped ${run.scoreDrops}x (min ${run.scoreMin})`)
    return { pass: flags.length === 0, flags, warnings }
}

// Failures to file: one issue per game per reason-shape (digits masked, so the
// same defect at different ticks/scores is one issue), deduped against the
// titles of already-open QA-nightly issues for that game. The shape is what
// goes INTO the title (same truncation both sides), so dedup is stable across
// nights — truncating the raw reason would make "tick 9000" and "tick 9100"
// differ after the cut and re-file every night.
export function failureShape(reason) {
    return reason.replace(/\d+/g, '#').slice(0, 72)
}
export function planFilings(results, openTitles) {
    const out = []
    for (const g of results) {
        if (g.pass) continue
        const reason = g.flags[0] || 'failed'
        const shape = failureShape(reason)
        if (openTitles.some(t => t.startsWith(`QA \u2014 ${g.id}: nightly ${shape}`))) continue
        out.push({ id: g.id, seed: g.seed, reason, shape })
    }
    return out
}

// ---------- port ownership (#1355) ----------
//
// The bot owns :5199 — but owning a port number is not the same as knowing the
// server answering it is yours. #1312: an orphan vite squatted :5199, strictPort
// killed our spawn, waitDev happily got 200s from the stranger, and 37 per-game
// issues filed in 48 s. Two proofs, one pure classifier:
//   pre  — anything already LISTENing before we spawn is a squatter by definition
//          (our strictPort bind would die silently while the stranger answers).
//   post — after waitDev, lsof names the answering PID; walking its ancestors must
//          reach the detached `npm run dev` leader we spawned (vite is its
//          grandchild, so ancestry, not equality). A chain that cannot is foreign.
// `prePid` is the PID heard before spawn (null = port free); `chain` is the
// answering PID followed by its ancestors (empty = nothing listening); `childPid`
// is the PID we spawned. `mutate === 'squatter'` swallows the verdict — the
// standing mutant that proves the gate is load-bearing.
export function classifyPort(prePid, chain, childPid, mutate) {
    if (mutate === 'squatter') return { state: 'port-ok', pid: null }
    if (prePid != null) return { state: 'squatted', pid: prePid }
    if (!chain || chain.length === 0) return { state: 'foreign-pid', pid: null }
    if (chain.includes(childPid)) return { state: 'port-ok', pid: chain[0] }
    return { state: 'foreign-pid', pid: chain[0] }
}

// One infra issue per squatter condition, never per-game. Digits are masked on
// both sides (same shape math as failureShape), so pid churn night-to-night — or
// a re-spawned squatter with a new pid — does not re-file.
export const squatterTitle = (port, pid) => `nightly-bot: :${port} is squatted by pid ${pid}`
export function planInfraFiling(squatter, openTitles) {
    const shape = failureShape(squatterTitle(squatter.port, squatter.pid))
    if (openTitles.some(t => failureShape(t) === shape)) return null
    return { title: squatterTitle(squatter.port, squatter.pid), shape }
}

// Consecutive fully-green runs. #1040's Done line is "3 nights unattended":
// the third green night closes the issue itself (see soakClose), so no human
// has to remember the soak ended.
export function nextGreenStreak(prev, allPassed) {
    return allPassed ? (prev?.greenStreak || 0) + 1 : 0
}

// Streaks: previous nightly.json's streak map + today's outcomes.
export function updateStreaks(prev, results) {
    const out = {}
    for (const g of results) {
        const was = prev?.games?.find?.(p => p.id === g.id)?.failStreak || 0
        out[g.id] = g.pass ? 0 : was + 1
    }
    return out
}

// ---------- selftest ----------

function selftest() {
    let pass = 0, fail = 0
    const ok = (cond, msg) => {
        if (cond) { pass++; console.log(`ok   ${msg}`) }
        else { fail++; console.log(`FAIL ${msg}`) }
    }
    const a = mulberry32(7), b = mulberry32(7)
    ok(a() === b() && a() === b(), 'mulberry32 is deterministic per seed')
    ok(mulberry32(7)() !== mulberry32(8)(), 'different seeds diverge')
    ok(nightlySeed('2026-10-25') === 20261025, 'nightly seed derives from the date')
    const padA = padFor(5, 100, { buttons: ['a', 'b'] })
    const padB = padFor(5, 100, { buttons: ['a', 'b'] })
    ok(JSON.stringify(padA) === JSON.stringify(padB), 'padFor is pure in (seed, i)')
    ok(Array.from({ length: 300 }, (_, i) => padFor(5, i, { buttons: [] })).every(p => !('a' in p) && !('b' in p)),
        'a title whose meta has no buttons never receives a/b pads')
    const pp = padFor(5, 3, { pointer: true })
    ok(pp.pointer && pp.pointer.x >= 0 && pp.pointer.x <= 1 && pp.pointer.y >= 0 && pp.pointer.y <= 1,
        'pointer pads sweep inside the canvas')
    const good = { seed: 7, seedOut: 7, zeroTick: 0, ticks: 500, done: true, pageErrors: 0, ticksStalled: 0, score: 100, scoreDrops: 0, scoreMin: 0, stuck: false, stuckSpan: 30 }
    ok(verdict(good, CAP).pass, 'a finished clean run passes')
    ok(verdict({ ...good, done: false, ticks: CAP, stuck: true }, CAP).flags.some(f => /softlock/.test(f)), 'a frozen cap-reached run is a softlock')
    ok(verdict({ ...good, done: false, ticks: CAP, stuck: false }, CAP).pass &&
        verdict({ ...good, done: false, ticks: CAP, stuck: false }, CAP).warnings.some(w => /endurance/.test(w)),
        'a cap-reached run that kept moving is endurance, not a verdict')
    ok(verdict({ ...good, pageErrors: 2 }, CAP).pass === false, 'page errors fail the run')
    ok(verdict({ ...good, ticksStalled: 42 }, CAP).flags.some(f => /tick did not advance/.test(f)), 'a stalled tick is caught')
    ok(verdict({ ...good, seedOut: 9 }, CAP).pass && verdict({ ...good, seedOut: 9 }, CAP).warnings.some(w => /state\.seed/.test(w)),
        'a folded seed warns but never verdict (engines legitimately consume seeds)')
    ok(verdict({ ...good, scoreDrops: 2 }, CAP).pass && verdict({ ...good, scoreDrops: 2 }, CAP).warnings.length === 1,
        'score drops warn but never verdict')
    const F = [{ id: 'tetris', pass: false, flags: ['softlock: frozen at tick 9000 (hash invariant over last 30 steps), score 0'], seed: 20261025 }]
    ok(planFilings(F, []).length === 1, 'a fresh failure files')
    ok(planFilings(F, ['QA — tetris: nightly ' + failureShape(F[0].flags[0])]).length === 0,
        'the same failure shape does not file twice')
    ok(planFilings([{ ...F[0], flags: ['3 page error(s): boom'] }], ['QA — tetris: nightly softlock']).length === 1,
        'a different failure shape for the same game still files')
    ok(planFilings([{ ...F[0], flags: ['softlock: frozen at tick 9123 (hash invariant over last 30 steps), score 7'] }],
        ['QA — tetris: nightly ' + failureShape(F[0].flags[0])]).length === 0,
        'same defect at different ticks/scores dedupes (digits masked)')
    ok(planFilings(F, ['QA — galaga: nightly softlock']).length === 1, 'another game open does not dedupe this one')
    // #1355 — port ownership, pure: the three states the live shells feed it.
    ok(classifyPort(null, [500, 499, 400], 400).state === 'port-ok', 'a listener descended from our spawned child is ours')
    ok(classifyPort(4242, [], 400).state === 'squatted' && classifyPort(4242, [], 400).pid === 4242,
        'a listener before spawn is a squatter and its pid is reported')
    ok(classifyPort(null, [777, 776, 1], 400).state === 'foreign-pid' && classifyPort(null, [777, 776, 1], 400).pid === 777,
        'a post-spawn listener we cannot trace to our child is foreign-pid')
    ok(classifyPort(null, [], 400).state === 'foreign-pid', 'nothing answering lsof after waitDev cannot be proven ours')
    ok(classifyPort(null, [777, 776], 400, 'squatter').state === 'port-ok',
        'mutant squatter plays against a stranger — the ownership gate is load-bearing')
    ok(planInfraFiling({ port: 5199, pid: 4242 }, []).title === 'nightly-bot: :5199 is squatted by pid 4242',
        'a fresh squatter files one infra issue naming the pid')
    ok(planInfraFiling({ port: 5199, pid: 9021 }, ['nightly-bot: :5199 is squatted by pid 4242']) === null,
        'the same squatter shape with a new pid does not re-file')
    ok(planInfraFiling({ port: 5199, pid: 4242 }, ['QA — tetris: nightly softlock']).title !== null,
        'unrelated open issues do not dedupe the infra alarm')
    const streaks = updateStreaks({ games: [{ id: 'tetris', failStreak: 2 }] }, F)
    ok(streaks.tetris === 3, 'fail streak increments')
    ok(updateStreaks({ games: [{ id: 'tetris', failStreak: 3 }] }, [{ id: 'tetris', pass: true }]).tetris === 0,
        'a green night resets the streak')
    ok(nextGreenStreak(null, true) === 1, 'first green night is streak 1')
    ok(nextGreenStreak({ greenStreak: 2 }, true) === 3, 'green nights accumulate')
    ok(nextGreenStreak({ greenStreak: 2 }, false) === 0, 'one red night resets the soak')
    const ccSrc = readFileSync(path.join(ROOT, 'scripts/lib/contractGames.mjs'), 'utf8')
    const ccIds = [...ccSrc.matchAll(/\{ id: '([^']+)', path: '([^']+)' \}/g)].map(m => `${m[1]}@${m[2]}`)
    const mine = GAMES.map(g => `${g.id}@${g.path}`)
    // SET equality, not order: append order legitimately differs when separate PRs
    // grow the two lists (fixing one drift, #1350, only set up the second by 2026-10-31).
    // Sorted comparison still catches every add/remove/dup — seeds take indexOf offsets,
    // which vary nightly anyway (the seed rides in the repro command itself).
    ok(ccIds.length === new Set(ccIds).size && mine.length === new Set(mine).size &&
        JSON.stringify([...ccIds].sort()) === JSON.stringify([...mine].sort()),
        `roster matches contractcheck (${mine.length} games)`)
    const selfSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const declAt = selfSrc.search(/const failed = results\.filter/)
    const useAt = selfSrc.search(/failed\.length/)
    ok(declAt >= 0 && declAt < useAt,
        'live shell declares `failed` before greenStreak reads it (TDZ #1145: selftest never reaches main())')
    console.log(`\n${fail ? 'FAILED' : 'PASSED'} ${pass}/${pass + fail}`)
    process.exit(fail ? 1 : 0)
}

// ---------- live shell ----------

const args = process.argv.slice(2)
const ONLY = process.env.NIGHTLY_ONLY
const SEED = process.env.NIGHTLY_SEED ? +process.env.NIGHTLY_SEED : nightlySeed(new Date().toISOString().slice(0, 10))
const PORT = process.env.NIGHTLY_PORT || 5199
const MUTATE = process.env.NIGHTLY_MUTATE

async function waitDev(base) {
    for (let i = 0; i < 90; i++) {
        try { if ((await fetch(base, { signal: AbortSignal.timeout(1500) })).ok) return } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`dev server never came up on :${PORT}`)
}

// Thin shells over lsof/ps — the DECISION is classifyPort (pure, selftested).
// lsof exits 1 with empty output when nothing listens; that is port-free, not an error.
function portListenerPid(port) {
    try {
        const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
        const pid = parseInt(out.split('\n')[0], 10)
        return Number.isFinite(pid) ? pid : null
    } catch { return null }
}

// [pid, parent, grandparent, ...] up to launchd; bounded in case a pid vanishes mid-walk.
function ancestorChain(pid) {
    const chain = []
    let p = pid
    for (let i = 0; i < 12 && Number.isFinite(p) && p > 0; i++) {
        chain.push(p)
        try { p = parseInt(execFileSync('ps', ['-o', 'ppid=', '-p', String(p)], { encoding: 'utf8' }).trim(), 10) } catch { break }
    }
    return chain
}

function squatterError(port, pid, state, chain) {
    const e = new Error(`:${port} answered but is not ours (${state}${pid != null ? `, pid ${pid}` : ''}) — aborting before playing; see #1355`)
    e.squatter = { port, pid, state, listenerChain: chain }
    return e
}

async function startDev(mutate) {
    // Stage 1 (#1355): never even spawn onto a squatted port — strictPort would
    // kill our child while waitDev played against the stranger.
    const pre = portListenerPid(PORT)
    const early = classifyPort(pre, [], 0, mutate)
    if (early.state === 'squatted') throw squatterError(PORT, early.pid, early.state, [])
    const child = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], detached: true })
    let log = ''
    child.stderr.on('data', d => { log += d })
    try {
        await waitDev(`http://localhost:${PORT}/retrogames/`)
    } catch (e) {
        child.kill('SIGKILL')
        throw new Error(`${e.message}\n${log.slice(-1500)}`)
    }
    // Stage 2: something answers — prove it descends from the process we spawned.
    const listener = portListenerPid(PORT)
    const chain = listener == null ? [] : ancestorChain(listener)
    const cls = classifyPort(pre, chain, child.pid, mutate)
    if (cls.state !== 'port-ok') {
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone / never bound */ }
        throw squatterError(PORT, cls.pid, cls.state, chain)
    }
    return () => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }
}

const DRIVE = ({ seed, cap, buttons, pointer }) => {
    const mul = (aa) => function () {
        aa |= 0; aa = (aa + 0x6D2B79F5) | 0
        let t = Math.imul(aa ^ (aa >>> 15), 1 | aa)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const g = window.__game
    const zero = g.reset(seed)
    let s = zero, score = zero.score ?? 0, scoreDrops = 0, scoreMin = score, stalled = 0
    let prevTick = zero.tick
    const hashes = [zero.hash]
    for (let i = 0; i < cap; i++) {
        const rng = mul((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0)
        const r = rng()
        const pad = {}
        if (pointer) {
            const nr = rng()
            pad.pointer = { x: 0.08 + 0.84 * rng(), y: 0.10 + 0.8 * rng(), down: nr < 0.25 }
            if (buttons.includes('a') && nr > 0.8) pad.a = true
        } else {
            if (r < 0.24) pad.left = true
            else if (r < 0.48) pad.right = true
            else if (r < 0.60) pad.up = true
            else if (r < 0.70) pad.down = true
            if (buttons.includes('a') && rng() < 0.18) pad.a = true
            if (buttons.includes('b') && rng() < 0.10) pad.b = true
        }
        s = g.step(pad, 1)
        if (!s.done && s.tick !== prevTick + 1 && !stalled) stalled = i + 1
        prevTick = s.tick
        if (typeof s.score === 'number') {
            if (s.score < score) scoreDrops++
            scoreMin = Math.min(scoreMin, s.score)
            score = s.score
        }
        if (i >= cap - 30) hashes.push(s.hash)
        if (s.done) break
    }
    g.release()
    const uniq = new Set(hashes.slice(-30))
    return {
        seed, seedOut: s.seed, zeroTick: zero.tick, ticks: s.tick, done: !!s.done,
        score, scoreDrops, scoreMin, ticksStalled: stalled, hash: s.hash,
        stuck: !s.done && uniq.size <= 1, stuckSpan: Math.min(30, hashes.length),
    }
}

async function play(browser, base, game, seed, mutate) {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    page.setDefaultTimeout(120000)
    let pageErrors = 0
    const errDetail = []
    page.on('pageerror', (e) => { if (!relayNoise(e.message)) { pageErrors++; errDetail.push(e.message.split('\n')[0].slice(0, 90)) } })
    const run = { id: game.id, seed }
    try {
        await page.goto(`${base}${game.path}`, { waitUntil: 'load' })
        await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 })
        const meta = await page.evaluate(() => window.__game.meta)
        const res = await page.evaluate(DRIVE, { seed, cap: game.cap || CAP, buttons: meta?.buttons || ['a'], pointer: meta?.method === 'pointer' })
        Object.assign(run, res, { pageErrors, errorDetail: errDetail.join(' | ') })
    } catch (e) {
        Object.assign(run, { bootError: e.message.split('\n')[0].slice(0, 120), pageErrors, errorDetail: errDetail.join(' | ') })
    } finally {
        await page.close().catch(() => {})
    }
    const v = verdict(run, game.cap || CAP)
    if (mutate === 'stuck') v.flags = v.flags.filter(f => !/softlock/.test(f)) // mutant: swallow the softlock gate
    v.pass = v.flags.length === 0
    return { ...run, pass: v.pass, flags: v.flags, warnings: v.warnings }
}

async function fetchPrev() {
    try {
        const r = await fetch(`${CDN}?t=${Date.now()}`, { signal: AbortSignal.timeout(5000) })
        return r.ok ? await r.json() : null
    } catch { return null }
}

// A squatter night aborts BEFORE the play loop: zero per-game verdicts, zero
// per-game issues (#1312's 37-in-48s is structurally impossible now). ONE infra
// issue, shape-deduped night-to-night; the CDN push is skipped so the board and
// sleepwatch keep the last known-good picture instead of a fake all-red night.
async function abortSquatter(sq) {
    const doc = {
        generated: new Date().toISOString(),
        seed: SEED,
        squatter: sq,
        aborted: `:${sq.port} is not ours (${sq.state}${sq.pid != null ? `, pid ${sq.pid}` : ''})`,
        greenStreak: 0,
        games: [],
    }
    writeFileSync('/tmp/forge/nightly.json', JSON.stringify(doc, null, 1))
    console.error(`nightlybot: ABORT — :${sq.port} is ${sq.state}` +
        (sq.pid != null ? ` (pid ${sq.pid}${sq.listenerChain.length ? `, chain ${sq.listenerChain.join(' < ')}` : ''})` : '') +
        ' — no games played, no per-game issues filed')
    if (process.env.NIGHTLY_FILE) {
        const open = JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', 'jalfern/retrogames', '--state', 'open',
            '--label', 'feedback', '--json', 'title'], { encoding: 'utf8' })).map(i => i.title)
        const plan = planInfraFiling(sq, open)
        if (plan) {
            const body = `Found by the nightly bot run (${doc.generated}).\n\n` +
                `**what happened:** the bot's port :${sq.port} was answered by a server it did not spawn ` +
                `(state \`${sq.state}\`, pid ${sq.pid}, ancestor chain \`${sq.listenerChain.join(' < ') || 'unknown'}\`). ` +
                `The run aborted before playing — the bot cannot judge games against a server it does not own.\n` +
                `**why:** #1312 — a squatter once answered :5199 and 37 bogus per-game issues filed in 48 s. ` +
                `This abort and the single-issue rule are the fix (verdict math: \`classifyPort\` in nightlybot.mjs).\n` +
                `**repro:** \`lsof -nP -iTCP:${sq.port} -sTCP:LISTEN\`, then \`node scripts/nightlybot.mjs\` ` +
                `(must abort with ":${sq.port} is not ours", never per-game failures)\n` +
                `_Filed automatically by scripts/nightlybot.mjs (#1355)._`
            execFileSync('gh', ['issue', 'create', '--repo', 'jalfern/retrogames', '--label', 'feedback', '--label', 'lane:qa',
                '--title', plan.title, '--body', body])
            console.log(`filed infra issue: ${plan.title}`)
        } else {
            console.log('squatter already has an open infra issue — not re-filing')
        }
    }
    process.exit(1)
}

async function main() {
    const base = `http://localhost:${PORT}/retrogames`
    let stopDev
    try {
        stopDev = await startDev(MUTATE)
    } catch (e) {
        if (!e.squatter) throw e
        await abortSquatter(e.squatter) // never returns
    }
    const browser = await launch()
    const games = ONLY ? GAMES.filter(g => g.id === ONLY) : GAMES
    if (ONLY && games.length === 0) { console.error(`NIGHTLY_ONLY="${ONLY}" matched no game`); process.exit(2) }
    const results = []
    for (const game of games) {
        const seed = SEED + GAMES.indexOf(game)
        console.log(`[${game.id}] seed=${seed}`)
        const res = await play(browser, base, game, seed, MUTATE)
        results.push(res)
        console.log(`  ${res.pass ? 'PASS' : 'FAIL'} ${res.done ? `done @${res.ticks}` : `tick ${res.ticks} not done`} score=${res.score}` +
            (res.flags.length ? ` — ${res.flags.join('; ')}` : '') +
            (res.warnings.length ? ` [warn: ${res.warnings.join('; ')}]` : ''))
    }
    await browser.close()
    stopDev()

    const prev = await fetchPrev()
    const streaks = updateStreaks(prev, results)
    for (const g of results) g.failStreak = streaks[g.id]
    const failed = results.filter(g => !g.pass)
    const doc = {
        generated: new Date().toISOString(),
        seed: SEED,
        mutated: MUTATE || null,
        greenStreak: nextGreenStreak(prev, !MUTATE && failed.length === 0),
        games: results.map(g => ({ id: g.id, pass: g.pass, done: !!g.done, ticks: g.ticks, score: g.score, seed: g.seed, failStreak: g.failStreak, flags: g.flags, warnings: g.warnings })),
    }
    writeFileSync('/tmp/forge/nightly.json', JSON.stringify(doc, null, 1))
    console.log(`\nnightlybot: ${results.length - failed.length}/${results.length} games passed` +
        (failed.length ? ` — ${failed.map(f => f.id).join(', ')} RED` : ' — OK'))

    if (failed.length && process.env.NIGHTLY_FILE) {
        const open = JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', 'jalfern/retrogames', '--state', 'open',
            '--label', 'feedback', '--json', 'title'], { encoding: 'utf8' })).map(i => i.title)
        for (const f of planFilings(failed, open)) {
            const body = `Found by the nightly bot run (${doc.generated}, seed ${f.seed}).\n\n` +
                `**what happened:** ${f.reason}\n**seed:** ${f.seed}\n**repro:** \`NIGHTLY_ONLY=${f.id} NIGHTLY_SEED=${f.seed} node scripts/nightlybot.mjs\` (starts its own dev server on :5199)\n` +
                `_Filed automatically by scripts/nightlybot.mjs (#1040)._`
            execFileSync('gh', ['issue', 'create', '--repo', 'jalfern/retrogames', '--label', 'feedback', '--label', 'lane:qa',
                '--title', `QA — ${f.id}: nightly ${f.shape}`, '--body', body])
            console.log(`filed QA issue for ${f.id}`)
        }
    }

    if (process.env.NIGHTLY_PUSH && !MUTATE) {
        const data = Buffer.from(JSON.stringify(doc)).toString('base64')
        const body = { message: 'nightly', content: data, branch: 'main' }
        let sha = ''
        try { sha = execFileSync('gh', ['api', `${OUT}/contents/nightly.json?ref=main`, '--jq', '.sha'], { encoding: 'utf8' }).trim() } catch { /* first write */ }
        if (/^[0-9a-f]{40}$/.test(sha)) body.sha = sha
        execFileSync('gh', ['api', '-X', 'PUT', `${OUT}/contents/nightly.json`, '--input', '-'], { input: JSON.stringify(body) })
        console.log('nightly.json pushed')
        if (doc.greenStreak >= 3) {
            try {
                execFileSync('gh', ['issue', 'comment', '1040', '--repo', 'jalfern/retrogames', '--body',
                    `SOAK: ${doc.greenStreak} consecutive fully-green nights (this run ${doc.generated}, seed ${doc.seed}, ${results.length} games). Done-line met — closing.`])
                execFileSync('gh', ['issue', 'close', '1040', '--repo', 'jalfern/retrogames', '--reason', 'completed'])
                console.log('soak complete — #1040 closed')
            } catch (e) { console.log(`soak close skipped: ${e.message.split('\n')[0]}`) }
        }
    }
    process.exit(failed.length ? 1 : 0)
}

if (args.includes('--selftest')) selftest()
else await main()
