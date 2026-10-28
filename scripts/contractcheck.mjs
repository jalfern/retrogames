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
import { GAMES, TICKS, scriptFor, LIVE } from './lib/contractGames.mjs'

const BASE = process.env.CONTRACT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const ONLY = process.env.CONTRACT_ONLY
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
