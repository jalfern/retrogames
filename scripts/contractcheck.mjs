// contractcheck.mjs — the window.__game contract is real on every wired game
// (pilots #377; rollout batch 1 #391: arkanoid, galaga, dig-dug,
// missile-battle, spy-hunter, paperboy; batch 2: tetris, boulder-dash,
// bubble-bobble, ice-climber, joust, qbert; batch 3: lemmings, sonar,
// polarity, outpost, dogfight, smash-tv).
//
// Per game, in headless Chrome against the DEV server:
//   boot (window.__game exists, zero page errors) · meta · state shape ·
//   frame() PNG · reset(seed) lands on tick 0 · snapshot/restore round-trip,
//   restoring the SAME snapshot twice must return the same state (#381) ·
//   determinism: reset(7) + the same 600 scripted pad ticks run TWICE must
//   produce an identical final state JSON AND identical sampled hashes every
//   100 ticks — and a different seed must produce a DIFFERENT JSON ·
//   release() hands the clock back to the rAF loop (tick advances on its own).
//
// Run: npm run dev in another terminal, then `npm run contractcheck`.

import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const BASE = process.env.CONTRACT_URL || 'http://localhost:5173/retrogames'
const GAMES = [
    { id: 'lunar-lander', path: '/lunar-lander' },
    { id: 'tempest', path: '/tempest' },
    { id: 'arkanoid', path: '/arkanoid' },
    { id: 'galaga', path: '/galaga' },
    { id: 'dig-dug', path: '/dig-dug' },
    { id: 'missile-battle', path: '/missile-battle' },
    { id: 'spy-hunter', path: '/spy-hunter' },
    { id: 'paperboy', path: '/paperboy' },
    { id: 'tetris', path: '/tetris' },
    { id: 'boulder-dash', path: '/boulder-dash' },
    { id: 'bubble-bobble', path: '/bubble-bobble' },
    { id: 'ice-climber', path: '/ice-climber' },
    { id: 'joust', path: '/joust' },
    { id: 'qbert', path: '/qbert' },
    { id: 'comet-drift', path: '/comet-drift' },
    { id: 'lemmings', path: '/lemmings' },
    { id: 'sonar', path: '/sonar' },
    { id: 'polarity', path: '/polarity' },
    { id: 'outpost', path: '/outpost' },
    { id: 'dogfight', path: '/dogfight' },
    { id: 'smash-tv', path: '/smash-tv' },
]
const TICKS = 600
const ONLY = process.env.CONTRACT_ONLY

const PATTERNS = {
    'lunar-lander': (i) => ({ left: i % 71 < 16, right: false, up: i % 37 < 18 }),
    tempest: (i) => ({ left: i % 53 < 12, right: i % 53 >= 20 && i % 53 < 34, a: i % 9 < 4 }),
    arkanoid: (i) => ({ left: i % 43 < 21, right: i % 43 >= 24 && i % 43 < 40, a: i % 29 < 3 }),
    galaga: (i) => ({ left: i % 47 < 18, right: i % 47 >= 23 && i % 47 < 40, a: i % 7 < 3, up: i % 97 < 2 }),
    'dig-dug': (i) => ({ left: i % 53 < 15, right: i % 53 >= 20 && i % 53 < 35, up: i % 61 < 12, down: i % 61 >= 30 && i % 61 < 42, a: i % 11 < 4 }),
    'missile-battle': (i) => ({ left: i % 31 < 14, right: i % 31 >= 16 && i % 31 < 28, up: i % 41 < 9, a: i % 13 < 2 }),
    'spy-hunter': (i) => ({ left: i % 37 < 15, right: i % 37 >= 19 && i % 37 < 31, a: i % 5 < 3, b: i % 23 < 2 }),
    paperboy: (i) => ({ left: i % 41 < 17, right: i % 41 >= 22 && i % 41 < 36, up: i % 3 === 0, down: i % 89 < 4, a: i % 17 < 2 }),
    tetris: (i) => ({ left: i % 43 < 18, right: i % 43 >= 22 && i % 43 < 38, down: i % 17 < 4, a: i % 11 < 2 }),
    'boulder-dash': (i) => ({ left: i % 53 < 14, right: i % 53 >= 18 && i % 53 < 32, up: i % 61 < 10, down: i % 61 >= 28 && i % 61 < 40, a: i % 7 < 3 }),
    'bubble-bobble': (i) => ({ left: i % 47 < 16, right: i % 47 >= 20 && i % 47 < 36, up: i % 59 < 8, down: i % 59 >= 30 && i % 59 < 38, a: i % 13 < 2 }),
    'ice-climber': (i) => ({ left: i % 41 < 15, right: i % 41 >= 19 && i % 41 < 33, up: i % 53 < 12, down: i % 53 >= 26 && i % 53 < 36, a: i % 9 < 3 }),
    joust: (i) => ({ left: i % 37 < 14, right: i % 37 >= 17 && i % 37 < 30, a: i % 5 < 2 }),
    qbert: (i) => ({ left: i % 43 < 18 && i % 89 < 50, right: i % 43 >= 20 && i % 43 < 38, up: i % 29 < 14, down: i % 29 >= 15 && i % 29 < 28, a: i % 31 < 2 }),
    'comet-drift': (i) => ({ left: i % 43 < 15, right: i % 43 >= 21 && i % 43 < 34, up: i % 59 !== 0, a: i % 11 < 4 }),
    lemmings: (i) => ({ left: i % 43 < 18, right: i % 43 >= 22 && i % 43 < 38, up: i % 29 < 12, down: i % 29 >= 15 && i % 29 < 26, a: i % 13 < 2, b: i % 71 < 2 }),
    sonar: (i) => ({ left: i % 47 < 14, right: i % 47 >= 18 && i % 47 < 32, up: i % 53 < 10, down: i % 53 >= 28 && i % 53 < 40, a: i % 9 < 2 }),
    polarity: (i) => ({ left: i % 43 < 15, right: i % 43 >= 19 && i % 43 < 34, up: i % 59 < 8, down: i % 59 >= 30 && i % 59 < 38, a: i % 7 < 3, b: i % 23 < 2 }),
    outpost: (i) => ({ left: i % 41 < 16, right: i % 41 >= 20 && i % 41 < 36, up: i % 61 < 10, down: i % 61 >= 26 && i % 61 < 38, a: i % 11 < 3, b: i % 31 < 2 }),
    'dogfight': (i) => ({ left: i % 37 < 14, right: i % 37 >= 17 && i % 37 < 30, up: i % 41 < 12, down: i % 41 >= 20 && i % 41 < 30, a: i % 5 < 2, b: i % 53 < 20 }),
    'smash-tv': (i) => ({ left: i % 41 < 16, right: i % 41 >= 20 && i % 41 < 36, up: i % 53 < 12, down: i % 53 >= 26 && i % 53 < 38, a: i % 9 < 3, b: i % 29 < 2 }),
}
const scriptFor = (id) => Array.from({ length: TICKS }, (_, i) => PATTERNS[id](i))

const DRIVE = ({ seed, script }) => {
    const g = window.__game
    const zero = g.reset(seed)
    const samples = []
    let s = zero
    for (let i = 0; i < script.length; i++) {
        s = g.step(script[i], 1)
        if ((i + 1) % 100 === 0) samples.push(s.hash)
    }
    const heldTick = s.tick
    const snap = g.snapshot ? g.snapshot() : null
    const atSnap = JSON.stringify(g.state())
    let restoreOk = null
    if (snap) {
        g.step(script[0], 37)
        g.restore(snap)
        const first = JSON.stringify(g.state()) === atSnap
        g.step(script[0], 37)
        g.restore(snap)
        restoreOk = first && JSON.stringify(g.state()) === atSnap
    }
    g.release()
    return { zeroTick: zero.tick, zeroDone: !!zero.done, final: JSON.stringify(s), samples, heldTick, restoreOk }
}

await requireDevServer(`${BASE}/lunar-lander`)
const browser = await launch()
const r = new Report('contractcheck')
const scripts = Object.fromEntries(GAMES.map((g) => [g.id, scriptFor(g.id)]))

const RUN = ONLY ? GAMES.filter((g) => g.id === ONLY) : GAMES
if (ONLY && RUN.length === 0) { console.error(`CONTRACT_ONLY="${ONLY}" matched no game`); process.exit(2) }
for (const p of RUN) {
    console.log(`\n[${p.id}] ${BASE}${p.path}`)
    const page = await openGame(browser, { url: `${BASE}${p.path}`, hook: '__game' })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))

    const meta = await page.evaluate(() => window.__game.meta)
    r.check(`${p.id}: meta.id`, meta?.id === p.id, `id=${meta?.id}`)
    r.check(`${p.id}: meta.buttons`, Array.isArray(meta?.buttons) && meta.buttons.includes('a'), JSON.stringify(meta?.buttons))

    const api = await page.evaluate(() => {
        const g = window.__game
        const core = ['reset', 'step', 'release', 'state', 'frame'].filter((k) => typeof g[k] === 'function')
        const opt = ['snapshot', 'restore'].filter((k) => typeof g[k] === 'function')
        return { core, opt }
    })
    r.check(`${p.id}: core API surface (reset/step/release/state/frame)`, api.core.length === 5, api.core.join(','))
    r.check(`${p.id}: optional snapshot/restore present-or-absent together`, (api.opt.length === 0 || api.opt.length === 2), api.opt.join(',') || 'none (function-bearing state)')

    const png = await page.evaluate(() => window.__game.frame())
    // floor is "real content, not a blank/black canvas"; Spy Hunter's flat
    // road-and-sky frame compresses to ~4 KB, so 5 KB was too high a bar.
    r.check(`${p.id}: frame() is a PNG data URL`, typeof png === 'string' && png.startsWith('data:image/png;base64,') && png.length > 2000, `${png?.length}b`)

    const r1 = await page.evaluate(DRIVE, { seed: 7, script: scripts[p.id] })
    const r2 = await page.evaluate(DRIVE, { seed: 7, script: scripts[p.id] })
    const r3 = await page.evaluate(DRIVE, { seed: 9, script: scripts[p.id] })

    r.check(`${p.id}: reset(7) starts at tick 0`, r1.zeroTick === 0 && r1.zeroDone === false, `tick=${r1.zeroTick}`)
    r.check(`${p.id}: run survives all ${TICKS} ticks`, r1.heldTick === TICKS, `tick=${r1.heldTick}`)
    r.check(`${p.id}: state has tick/score/done/hash`, (() => {
        const s = JSON.parse(r1.final)
        return ['tick', 'score', 'done', 'hash'].every((k) => s[k] !== undefined)
    })())
    r.check(`${p.id}: seed 7 twice → identical final JSON`, r1.final === r2.final,
        r1.final === r2.final ? `${r1.final.length}b equal` : `A=${r1.final}\n                 B=${r2.final}`)
    r.check(`${p.id}: seed 7 twice → identical per-100-tick hashes`, JSON.stringify(r1.samples) === JSON.stringify(r2.samples), r1.samples.join(' '))
    r.check(`${p.id}: seed 9 → different JSON`, r1.final !== r3.final, `hash ${JSON.parse(r3.final).hash} vs ${JSON.parse(r1.final).hash}`)
    if (r1.restoreOk !== null) r.check(`${p.id}: snapshot/restore round-trip`, r1.restoreOk === true)

    const resume = await page.evaluate(() => {
        const g = window.__game
        g.reset(3)
        const a = g.step({}, 1).tick
        g.release()
        return a
    })
    await page.waitForTimeout(450)
    const after = await page.evaluate(() => window.__game.state().tick)
    r.check(`${p.id}: release() resumes the rAF loop`, after > resume, `tick ${resume} → ${after}`)

    r.check(`${p.id}: zero page errors`, errs.length === 0, errs.join(' | '))
    await page.close()
}

r.exit(browser)
