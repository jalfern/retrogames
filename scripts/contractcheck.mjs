// contractcheck.mjs — the window.__game contract is real on both pilots (#377).
//
// Per pilot, in headless Chrome against the DEV server:
//   boot (window.__game exists, zero page errors) · meta · state shape ·
//   frame() PNG · reset(seed) lands on tick 0 · snapshot/restore round-trip ·
//   determinism: reset(7) + the same 600 scripted pad ticks run TWICE must
//   produce an identical final state JSON AND identical sampled hashes every
//   100 ticks — and a different seed must produce a DIFFERENT JSON ·
//   release() hands the clock back to the rAF loop (tick advances on its own).
//
// Run: npm run dev in another terminal, then `npm run contractcheck`.

import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const BASE = process.env.CONTRACT_URL || 'http://localhost:5173/retrogames'
const PILOTS = [
    { id: 'lunar-lander', path: '/lunar-lander' },
    { id: 'tempest', path: '/tempest' },
]
const TICKS = 600

const scriptFor = (id) => Array.from({ length: TICKS }, (_, i) => id === 'lunar-lander'
    ? { left: i % 71 < 16, right: false, up: i % 37 < 18 }
    : { left: i % 53 < 12, right: i % 53 >= 20 && i % 53 < 34, a: i % 9 < 4 })

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
        restoreOk = JSON.stringify(g.state()) === atSnap
    }
    g.release()
    return { zeroTick: zero.tick, zeroDone: !!zero.done, final: JSON.stringify(s), samples, heldTick, restoreOk }
}

await requireDevServer(`${BASE}/lunar-lander`)
const browser = await launch()
const r = new Report('contractcheck')
const script = { lunar: scriptFor('lunar-lander'), tempest: scriptFor('tempest') }

for (const p of PILOTS) {
    console.log(`\n[${p.id}] ${BASE}${p.path}`)
    const page = await openGame(browser, { url: `${BASE}${p.path}`, hook: '__game' })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))

    const meta = await page.evaluate(() => window.__game.meta)
    r.check(`${p.id}: meta.id`, meta?.id === p.id, `id=${meta?.id}`)
    r.check(`${p.id}: meta.buttons`, Array.isArray(meta?.buttons) && meta.buttons.includes('a'), JSON.stringify(meta?.buttons))

    const api = await page.evaluate(() => {
        const g = window.__game
        return { fns: ['reset', 'step', 'release', 'state', 'frame', 'snapshot', 'restore'].filter((k) => typeof g[k] === 'function') }
    })
    r.check(`${p.id}: full API surface`, api.fns.length === 7, api.fns.join(','))

    const png = await page.evaluate(() => window.__game.frame())
    r.check(`${p.id}: frame() is a PNG data URL`, typeof png === 'string' && png.startsWith('data:image/png;base64,') && png.length > 5000, `${png?.length}b`)

    const r1 = await page.evaluate(DRIVE, { seed: 7, script: p.id === 'lunar-lander' ? script.lunar : script.tempest })
    const r2 = await page.evaluate(DRIVE, { seed: 7, script: p.id === 'lunar-lander' ? script.lunar : script.tempest })
    const r3 = await page.evaluate(DRIVE, { seed: 9, script: p.id === 'lunar-lander' ? script.lunar : script.tempest })

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
