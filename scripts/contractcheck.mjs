// contractcheck.mjs — the window.__game contract is real on every wired game
// (pilots #377; rollout batch 1 #391: arkanoid, galaga, dig-dug,
// missile-battle, spy-hunter, paperboy; batch 2: tetris, boulder-dash,
// bubble-bobble, ice-climber, joust, qbert; batch 3: lemmings, sonar,
// polarity, outpost, dogfight, smash-tv; batch 4: beezee, metroid, momentum).
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
import { validate } from '../src/utils/recording.js'

const BASE = process.env.CONTRACT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const GAMES = [
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
]
const TICKS = 600
const ONLY = process.env.CONTRACT_ONLY
// #527 item 1 — games whose loop banks live ticks (recordLiveTick). The live
// gate below runs only for these; every other game's recorder is still fed by
// step(), so a full rollout is the remaining work on #527.
const LIVE = ['tetris']

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
    'comet-drift-hd': (i) => ({ left: i % 43 < 15, right: i % 43 >= 21 && i % 43 < 34, up: i % 59 !== 0, a: i % 11 < 4 }),
    lemmings: (i) => ({ pointer: { x: (i % 50) / 50, y: (i % 37) / 37, down: i % 97 === 0 }, b: i % 61 === 0 }),
    sonar: (i) => ({ left: i % 47 < 14, right: i % 47 >= 18 && i % 47 < 32, up: i % 53 < 10, down: i % 53 >= 28 && i % 53 < 40, a: i % 9 < 2 }),
    polarity: (i) => ({ left: i % 43 < 15, right: i % 43 >= 19 && i % 43 < 34, up: i % 59 < 8, down: i % 59 >= 30 && i % 59 < 38, a: i % 7 < 3, b: i % 23 < 2 }),
    outpost: (i) => ({ left: i % 41 < 16, right: i % 41 >= 20 && i % 41 < 36, up: i % 61 < 10, down: i % 61 >= 26 && i % 61 < 38, a: i % 11 < 3, b: i % 31 < 2 }),
    'dogfight': (i) => ({ left: i % 37 < 14, right: i % 37 >= 17 && i % 37 < 30, up: i % 41 < 12, down: i % 41 >= 20 && i % 41 < 30, a: i % 5 < 2, b: i % 53 < 20 }),
    'smash-tv': (i) => ({ left: i % 41 < 16, right: i % 41 >= 20 && i % 41 < 36, up: i % 53 < 12, down: i % 53 >= 26 && i % 53 < 38, a: i % 9 < 3, b: i % 29 < 2 }),
    beezee: (i) => ({ left: i % 47 < 16, right: i % 47 >= 20 && i % 47 < 34, up: i % 53 < 12, down: i % 53 >= 28 && i % 53 < 38, a: i % 7 < 4, b: i % 61 < 20 }),
    metroid: (i) => ({ left: i % 43 < 15, right: i % 43 >= 19 && i % 43 < 34, down: i % 67 < 6, a: i % 11 < 3, b: i % 17 < 2 }),
    momentum: (i) => ({ left: i % 97 < 6, right: i % 97 >= 10, up: i % 17 < 4, a: i % 19 < 5 }),
    'magic-carpet': (i) => ({ left: i % 41 < 14, right: i % 41 >= 18 && i % 41 < 32, up: i % 53 < 12, down: i % 53 >= 26 && i % 53 < 38, a: i % 13 < 2, b: i % 29 < 2 }),
    gauntlet: (i) => ({ left: i % 47 < 16, right: i % 47 >= 20 && i % 47 < 36, up: i % 59 < 12, down: i % 59 >= 30 && i % 59 < 42, a: i % 9 < 2, b: i % 23 < 2 }),
    emberwood: (i) => ({ left: i % 43 < 16, right: i % 43 >= 20 && i % 43 < 34, up: i % 53 < 12, down: i % 53 >= 26 && i % 53 < 36, a: i % 11 < 4, b: i % 29 < 2 }),
    'blob-battle': (i) => ({ left: i % 43 < 15, right: i % 43 >= 20 && i % 43 < 34, down: i % 17 < 4, a: i % 11 < 2, b: i % 23 === 0 }),
    homebody: (i) => ({ left: i % 53 < 12, right: i % 53 >= 20 && i % 53 < 30, up: i % 61 < 8, down: i % 61 >= 26 && i % 61 < 34, a: i % 17 === 0, b: i % 97 === 0, pointer: { x: 0.35 + 0.3 * Math.sin(i / 47), y: 0.45 + 0.25 * Math.cos(i / 41), down: i % 43 === 0 } }),
    'garden-guard': (i) => ({ left: i % 13 < 3, right: i % 17 >= 8 && i % 17 < 11, up: i % 29 < 2, down: i % 23 >= 6 && i % 23 < 8, a: i % 7 < 2, b: i % 31 < 1, pointer: { x: 0.55 + 0.32 * Math.sin(i / 40), y: 0.55 + 0.3 * Math.cos(i / 37), down: i % 53 === 0 } }),
    'iron-ring': (i) => ({ left: i % 61 >= 44, right: i % 61 < 22, up: i % 89 < 2, down: i % 61 >= 22 && i % 61 < 44, a: i % 13 < 2, b: i % 29 < 2 }),
    'viper-pit': (i) => ({ left: i % 61 >= 44, right: i % 61 < 22, up: i % 89 < 2, down: i % 61 >= 22 && i % 61 < 44, a: i % 13 < 2, b: i % 29 < 2 }),
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

// #496 co-op games: reset(seed, 2) must open seat 2, and the same script must
// replay deterministically when fed as PER-PLAYER pad arrays.
const DRIVE_COOP = ({ seed, script }) => {
    const g = window.__game
    const zero = g.reset(seed, 2)
    let s = zero
    for (const pad of script) s = g.step([pad, pad], 1)
    g.release()
    return { opened: (zero.players || 0) >= 2, players: s.players, heldTick: s.tick, final: JSON.stringify(s) }
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
    // A pointer game's action is the tap (an optional B), so it need not expose
    // an 'a' button; every other method must expose at least the A action. (#420)
    const isPointer = meta?.method === 'pointer'
    r.check(`${p.id}: meta.buttons`, Array.isArray(meta?.buttons) && (isPointer || meta.buttons.includes('a')), JSON.stringify(meta?.buttons))

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
    // #527 item 2: recordStart() refuses to open a capture unless state()
    // reports an integer seed — pin that, so the recorder works studio-wide.
    r.check(`${p.id}: state.seed is an integer (recordStart)`, (() => {
        const s = JSON.parse(r1.final)
        return Number.isInteger(s.seed)
    })(), `seed=${JSON.parse(r1.final).seed}`)
    r.check(`${p.id}: seed 7 twice → identical final JSON`, r1.final === r2.final,
        r1.final === r2.final ? `${r1.final.length}b equal` : `A=${r1.final}\n                 B=${r2.final}`)
    r.check(`${p.id}: seed 7 twice → identical per-100-tick hashes`, JSON.stringify(r1.samples) === JSON.stringify(r2.samples), r1.samples.join(' '))
    r.check(`${p.id}: seed 9 → different JSON`, r1.final !== r3.final, `hash ${JSON.parse(r3.final).hash} vs ${JSON.parse(r1.final).hash}`)
    if ((meta?.players || 1) > 1) {
        const c1 = await page.evaluate(DRIVE_COOP, { seed: 7, script: scripts[p.id] })
        const c2 = await page.evaluate(DRIVE_COOP, { seed: 7, script: scripts[p.id] })
        r.check(`${p.id}: co-op meta.players=${meta.players} — reset(7, 2) opens seat 2`, c1.opened && c1.players >= 2, `players=${c1.players}`)
        r.check(`${p.id}: co-op pad-array replay is deterministic`, c1.final === c2.final && c1.heldTick === TICKS, `tick=${c1.heldTick} hash=${JSON.parse(c1.final).hash}`)
    }
    if (r1.restoreOk !== null) r.check(`${p.id}: snapshot/restore round-trip`, r1.restoreOk === true)

    // #527 item 1 — LIVE-session capture. recordStart does NOT lock the loop,
    // so the game's own rAF loop owns the clock and banks each tick via
    // recordLiveTick; no harness drives step. We lock first (step n=0) so the
    // capture starts exactly at the reset's tick 0, replay then hits every hash.
    if (LIVE.includes(p.id)) {
        const live = await page.evaluate(async () => {
            const g = window.__game
            const kd = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }))
            const ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }))
            g.step({}, 0) // lock the rAF loop without advancing a tick
            g.reset(1234) // fresh seed-1234 game at tick 0 (loop locked)
            g.recordStart(30)
            g.release() // hand the clock to the real loop, from tick 0
            const plan = [[150, 'kd', 'ArrowLeft'], [500, 'ku', 'ArrowLeft'],
                [300, 'kd', 'ArrowRight'], [900, 'ku', 'ArrowRight'],
                [200, 'kd', 'ArrowUp'], [260, 'ku', 'ArrowUp'], [700, 'kd', 'ArrowUp'], [760, 'ku', 'ArrowUp']]
            for (const [t, kind, code] of plan) setTimeout(kind === 'kd' ? () => kd(code) : () => ku(code), t)
            await new Promise((r) => setTimeout(r, 1500))
            const rec = g.recordStop()
            g.release()
            return rec
        })
        r.check(`${p.id}: live capture banked ticks (loop-owned, no harness step)`, live && live.ticks > 0, live ? `ticks=${live.ticks}` : 'no recording')
        r.check(`${p.id}: live capture validates`, live && validate(live) === null, live ? (validate(live) || 'valid') : 'no recording')
        const rep = await page.evaluate((rec) => {
            const out = window.__game.replay(rec)
            window.__game.release()
            return out
        }, live)
        r.check(`${p.id}: live capture replays hash-equal`, rep && rep.ok === true && !rep.mismatch,
            rep ? (rep.mismatch ? `diverged @${rep.mismatch.tick} want ${rep.mismatch.want} got ${rep.mismatch.got}` : `ok, ${rep.ticks} ticks`) : 'no replay')
    }

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
