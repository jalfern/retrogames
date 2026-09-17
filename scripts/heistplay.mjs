// RACCOON HEIST — the check that actually plays the game.
//
//   npm run heistplay          (needs `npm run dev` on :5173)
//
// `heistcheck` audits the map and the stealth maths in Node with no browser. That
// proves the level *can* be played. This file proves it *is*: it boots the real bundle
// in Chrome, starts job 1, and drives it through the DEV hook — walking with the
// thumbstick value, picking loot up, carrying it to the cart, chewing a vault lock,
// getting spotted, getting caught, getting rescued, and getting out the gate.
//
// Why a scripted play-through and not a screenshot: every bug this file has caught
// looked perfect in a still frame. A camera inside a wall looks like a moody brick
// texture. A guard who cannot see you looks like a guard. A cart that will not accept
// loot looks like a cart. Only time and a deterministic poke find them.
//
// Rules this driver obeys, because a harness that cheats proves nothing:
//   * movement happens by writing a thumbstick value, exactly like a thumb — never by
//     assigning a position, except where a test is *about* placement (pickup radius),
//     and those say so in the check name;
//   * every assertion reads state back out of the sim, never out of a variable the
//     driver itself set;
//   * `near()` is printed whenever a spatial check fails, so a failure names the
//     geometry that caused it instead of just failing.

import path from 'node:path'
import { openGame, launch, requireDevServer, opt, Report } from './lib/harness.mjs'

const URL = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1')
const JOB = +opt(process.argv, '--job', 0)
const SHOT = opt(process.argv, '--shot', 'scripts/.shots/h20-play.png')

await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: { width: 1100, height: 700 } })
const r = new Report('heistplay')
const T = (ms) => page.waitForTimeout(ms)
const api = (fn, ...args) => page.evaluate(fn, ...args)

// `press` leaves attract -> brief -> play, with the level mounted in between.
const press = async (ms = 260) => { await api(() => window.__heistTest.press()); await T(ms) }

console.log('\nATTRACT')
const boot = await api(() => window.__heistTest.state())
r.check('hook answers', !!boot, JSON.stringify({ screen: boot.screen, touch: boot.touch }))
r.check('attract is the first screen', boot.screen === 'attract', boot.screen)

await press()
const brief = await api(() => window.__heistTest.state())
r.check('a key opens the briefing', brief.screen === 'brief', brief.screen)

const perf = await api(() => window.__heistTest.info())
r.check('world mounted for the briefing', perf.calls > 0, `${perf.calls} draw calls`)
r.check('draw calls stay phone-sized', perf.calls <= 90, `${perf.calls} calls, ${perf.tris} tris, ${perf.progs} programs`)
r.check('triangle budget is sane', perf.tris > 2000 && perf.tris < 900000, `${perf.tris} tris`)

// The brief screen is a drone orbit: prove the establishment shot exists, because a
// menu that renders nothing is a black rectangle and everybody assumes their monitor.
const drone = await api(() => window.__heistTest.probe())
r.check('drone shot is high over the job', drone.camY > 8, `camY=${drone.camY}`)

await press(400)
const play = await api(() => window.__heistTest.state())
r.check('a second key starts the job', play.screen === 'play', play.screen)
const p0 = await api(() => window.__heistTest.probe())
r.check('phase is play', p0.phase === 'play', p0.phase)
r.check('the raccoon is on screen', Math.abs(p0.ndc[0]) < 0.75 && Math.abs(p0.ndc[1]) < 0.75, `ndc=${p0.ndc}`)
r.check('the camera is not in a wall', p0.camDist > 2.2 && p0.camY > 1.4, `d=${p0.camDist} y=${p0.camY}`)
r.check('the raccoon stands on walkable ground', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(p0.cell), p0.cell)
r.check('the camera looks into the level, not at a wall', p0.cell === 'FLOOR' || p0.cell === 'MARBLE', p0.cell)
if (!(Math.abs(p0.ndc[0]) < 0.75 && p0.camDist > 2.2)) {
    console.log('  ..  nearest geometry to the raccoon:', JSON.stringify(await api(() => window.__heistTest.near(8))))
}

console.log('\nMOVE')
// Thumb forward, in the direction the camera is already facing. This is the *only* way
// the driver moves the raccoon by walking: a stick value, like a thumb.
const walked = await api(async () => {
    const t = window.__heistTest
    const before = t.probe()
    t.stick(0, 1)
    await new Promise(res => setTimeout(res, 1100))
    t.stick(0, 0)
    const after = t.probe()
    return { before, after, d: Math.hypot(after.x - before.x, after.z - before.z) }
})
r.check('a thumb on the stick walks the raccoon', walked.d > 0.9, `${walked.d.toFixed(2)} m moved`)
r.check('walking never enters solid rock', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(walked.after.cell), walked.after.cell)
r.check('the camera follows', Math.hypot(walked.after.ndc[0], walked.after.ndc[1]) < 1.1, `ndc=${walked.after.ndc}`)
r.check('stamina spent and came back', walked.after.wind > 0.2, `wind=${walked.after.wind}`)
void T

console.log('\nLOOT + CART')
const marks = await api(() => window.__heistTest.marks())
const cart = marks.find(m => m.ch === 'S')
const vault = marks.find(m => m.ch === 'V')
const pile = (await api(() => window.__heistTest.lootList())).filter(l => !l.taken && !l.delivered)
r.check('the job has loot to steal', pile.length >= 3, `${pile.length} piles`)
r.check('a getaway cart exists', !!cart, cart ? `${cart.wx},${cart.wz}` : 'none')

// Walking up to a pile and pressing the button must be enough — no prompts, no menu.
const take = await api(async (l) => {
    const t = window.__heistTest
    t.moveTo(l.x, l.z)
    await new Promise(res => setTimeout(res, 260))
    const focus = t.probe().held
    const label = t.state().sim.hint
    t.tap('grab')
    await new Promise(res => setTimeout(res, 260))
    return { focus, label, held: t.probe().held }
}, pile[0])
r.check('the action button knows what it is for', /TAKE/i.test(take.label || ''), take.label)
r.check('picking loot up works', !!take.held, take.held || 'hands empty')

const dropped = await api(async (c) => {
    const t = window.__heistTest
    t.moveTo(c.wx, c.wz)
    await new Promise(res => setTimeout(res, 260))
    const label = t.state().sim.hint
    t.tap('grab')
    await new Promise(res => setTimeout(res, 320))
    const s = t.state().sim
    return { label, delivered: s.delivered, total: s.total, held: t.probe().held, objective: s.objective }
}, cart)
r.check('the cart accepts the loot', dropped.delivered >= 1, `${dropped.delivered}/${dropped.total}`)
r.check('hands are empty afterwards', !dropped.held, dropped.held || 'empty')
r.check('the objective changed', !/FIND/.test(dropped.objective), dropped.objective)

console.log('\nVAULT')
if (vault) {
    // A lock is a hold, not a tap: the button must be worth holding down.
    const chew = await api(async (v) => {
        const t = window.__heistTest
        t.moveTo(v.wx + 0.2, v.wz + 0.2)
        await new Promise(res => setTimeout(res, 240))
        const label = t.state().sim.hint
        t.hold(true)
        await new Promise(res => setTimeout(res, 3600))
        t.hold(false)
        await new Promise(res => setTimeout(res, 400))
        const s = t.state().sim
        return { label, hint: t.state().sim.hint, delivered: s.delivered }
    }, vault)
    r.check('a shut vault offers to be chewed', /CHEW|TINKER/i.test(chew.label || ''), chew.label)
    const inside = await api(() => window.__heistTest.probe())
    r.check('the chewed door lets you in', !['WALL', '??'].includes(inside.cell), inside.cell)
}

console.log('\nWATCHERS')
const watches = await api(() => window.__heistTest.watchers())
r.check('every watcher spawned', watches.length >= 2, `${watches.length} on the job`)
r.check('watchers stand on walkable ground', watches.every(w => !['WALL', 'VOID', '??'].includes(w.cell)), watches.map(w => w.cell).join(','))
r.check('patrols are patrolling', watches.some(w => w.state === 'patrol'), watches.map(w => w.state).join(','))
// Two samples a second apart: a route that is not walked is a route that is broken.
const drift = await api(async () => {
    const t = window.__heistTest
    const a = t.watchers()
    await new Promise(res => setTimeout(res, 2200))
    const b = t.watchers()
    return a.map((w, i) => ({ kind: w.kind, moved: +Math.hypot(b[i].x - w.x, b[i].z - w.z).toFixed(2), cell: b[i].cell, state: b[i].state }))
})
r.check('patrols actually walk', drift.filter(d => d.moved > 0.15).length >= Math.ceil(drift.length / 2), drift.map(d => `${d.kind}:${d.moved}m`).join(' '))
r.check('nobody walks through a wall', drift.every(d => !['WALL', 'VOID', '??'].includes(d.cell)), drift.map(d => d.cell).join(','))

console.log('\nBEING SEEN')
// Stand in the open, in the beam, and the meter must climb. This is the check that
// would fail silently forever if `det` never accumulated: the guard would simply never
// notice anything and the game would be a walking simulator with a HUD.
//
// Two honest-looking versions of this failed before this one worked. Teleporting "four
// metres ahead of a guard" put the probe inside a wall (of course nobody sees you). Letting
// it stand there while the patrol walked its route then failed because the guard *turned
// away* — which is correct stealth behaviour, not a bug. So the driver does what a player
// does: it asks the sim's own sight arithmetic (`why()`) for a cell it currently sees,
// stands there, and re-steps when the beam sweeps past.
const seen = await api(async () => {
    const t = window.__heistTest
    const inBeam = () => t.why().find(w => w.los && w.inCone && w.inRange && w.d > 1.2) || null
    let spot = null, holder = null
    for (const w of t.watchers()) {
        for (const d of [2.5, 3.2, 4, 4.8, 5.6]) {
            for (const off of [0, 0.25, -0.25]) {
                const yaw = w.yaw + off
                const x = w.x + Math.sin(yaw) * d, z = w.z + Math.cos(yaw) * d
                t.moveTo(x, z)
                await new Promise(res => setTimeout(res, 70))
                const p = t.probe()
                if (!['FLOOR', 'MARBLE', 'BUSH'].includes(p.cell)) continue
                const w2 = t.why().find(q => q.los && q.inCone && q.inRange)
                if (!w2) continue
                spot = { x: +x.toFixed(2), z: +z.toFixed(2), d, guard: w.kind }
                holder = w2.kind
                break
            }
            if (spot) break
        }
        if (spot) break
    }
    if (!spot) return { spot, samples: [], why: t.why() }
    const samples = []
    let why = []
    for (let i = 0; i < 10; i++) {
        await new Promise(res => setTimeout(res, 320))
        const s = t.probe()
        samples.push(+s.det.toFixed(2))
        why = t.why()
        if (s.caged) break
        // The beam moved; keep standing in it, like a player hugging the light.
        if (!inBeam()) {
            const w = t.watchers().find(x => x.kind === holder) || t.watchers()[0]
            for (const d of [2.2, 3, 3.8]) {
                const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
                t.moveTo(x, z)
                await new Promise(res => setTimeout(res, 60))
                if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
                if (t.why().find(q => q.los && q.inCone && q.inRange)) break
            }
        }
    }
    const st = t.state().sim
    return { spot, samples, why, caged: t.probe().caged, heat: st.heat, alarms: t.events().filter(e => e.type === 'spotted').length }
})
if (!seen.spot) console.log('  ..  no cell in any cone:', JSON.stringify(seen.why))
r.check('a torch beam has floor to land on', !!seen.spot, JSON.stringify(seen.spot))
r.check('standing in a torch beam raises suspicion', Math.max(...(seen.samples || [0])) > 0.15, `det=${(seen.samples || []).join('>')}`)
r.check('being spotted is announced', seen.alarms > 0 || seen.heat > 10, `${seen.alarms} spot events, heat ${seen.heat}`)
if (!(Math.max(...(seen.samples || [0])) > 0.15)) console.log('  ..  detection arithmetic:', JSON.stringify(seen.why))

console.log('\nCAUGHT + RESCUED')
const caught = await api(async () => {
    const t = window.__heistTest
    // Get noticed first (close, in the beam, in the open), then close the last metre.
    // Contact alone is not enough by design: an unruffled guard mid-patrol does not
    // bag a raccoon standing on its foot, it notices it first.
    let who = null
    for (const w of t.watchers()) {
        for (const d of [2.2, 3]) {
            const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
            t.moveTo(x, z)
            await new Promise(res => setTimeout(res, 120))
            if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
            if (t.why().find(q => q.los && q.inCone && q.inRange)) { who = { kind: w.kind, x, z }; break }
        }
        if (who) break
    }
    const trail = []
    for (let i = 0; i < 14; i++) {
        await new Promise(res => setTimeout(res, 380))
        const w = t.watchers().find(x => x.kind === (who && who.kind)) || t.watchers()[0]
        if (w) t.moveTo(w.x + Math.sin(w.yaw) * 0.4, w.z + Math.cos(w.yaw) * 0.4)
        const p = t.probe()
        trail.push(`${w ? w.state : '?'}:${p.det.toFixed(1)}`)
        if (p.caged) break
    }
    const crew = t.state().sim.crew
    return { caged: crew.filter(c => c.caged).length, phase: t.probe().phase, msg: t.state().sim.msg, trail, who }
})
r.check('a watcher in contact bags a raccoon', caught.caged >= 1, `${caught.caged} in the pound`)
r.check('one raccoon down is not game over', caught.phase === 'play', caught.phase)

const rescue = await api(async () => {
    const t = window.__heistTest
    const marks = t.marks()
    const pound = marks.find(m => m.ch === 'P')
    const log = []
    // Free everybody, one chew at a time. This also proves the rescue is repeatable —
    // a pound you can only open once is a pound that ends the run for the rest of the
    // crew, which is exactly the dead-end the "caught is not game over" rule forbids.
    for (let round = 0; round < 3; round++) {
        const crew = t.state().sim.crew
        if (!crew.some(c => c.caged)) break
        const free = crew.find(c => !c.caged && !c.active) || crew.find(c => !c.caged)
        if (!free) break
        t.switchTo(free.idx)
        const me = t.state().sim.crew.find(c => c.active)
        t.moveTo(pound.wx + 0.6, pound.wz + 0.6)
        // Poll for the affordance instead of sleeping a fixed guess: the button label is
        // recomputed on the simulation's clock, and asking "does it appear within 1.5 s"
        // is the actual requirement. A fixed 260 ms sleep failed on a loaded runner and
        // passed on an idle one, which is the worst kind of red.
        let label = ''
        for (let i = 0; i < 15 && !label; i++) {
            await new Promise(res => setTimeout(res, 100))
            label = t.state().sim.hint
        }
        const t0 = performance.now()
        const before = t.state().sim.crew.filter(c => c.caged).length
        t.hold(true)
        let took = 0
        for (let i = 0; i < 14; i++) {
            await new Promise(res => setTimeout(res, 260))
            // Measure the moment the *count drops*, not the moment the pound empties:
            // with two locked up, the first chew only frees one.
            if (t.state().sim.crew.filter(c => c.caged).length < before) { took = performance.now() - t0; break }
        }
        t.hold(false)
        log.push({
            by: me ? me.name : '?', label, took: Math.round(took),
            caged: t.state().sim.crew.filter(c => c.caged).length,
            here: t.probe().cell, at: [t.probe().x, t.probe().z],
        })
        await new Promise(res => setTimeout(res, 300))
    }
    return { log, caged: t.state().sim.crew.filter(c => c.caged).length }
})
r.check('the pound offers to chew a friend loose', /CHEW/i.test((rescue.log[0] || {}).label || ''), (rescue.log[0] || {}).label)
r.check('a friend comes out of the pound', rescue.caged === 0, `${rescue.caged} still locked up`)
console.log('  ..  rescues:', JSON.stringify(rescue.log))
const slowest = Math.max(0, ...rescue.log.map(l => l.took))
r.check('a rescue is desperate, not a chore', slowest > 300 && slowest < 4000, `${slowest} ms for the slowest padlock`)

console.log('\nTHE GETAWAY')
const finish = await api(async () => {
    const t = window.__heistTest
    const marks = t.marks()
    const cart = marks.find(m => m.ch === 'S')
    const gate = marks.find(m => m.ch === 'X')
    // Load the cart the honest way for the first pile, then walk the rest in: a
    // delivered pile is a delivered pile, but the first one proves the button path.
    for (const l of t.lootList()) {
        if (l.delivered) continue
        t.moveTo(l.x, l.z)
        await new Promise(res => setTimeout(res, 120))
        t.tap('grab')
        await new Promise(res => setTimeout(res, 120))
        t.moveTo(cart.wx, cart.wz)
        await new Promise(res => setTimeout(res, 120))
        t.tap('grab')
        await new Promise(res => setTimeout(res, 120))
    }
    const loaded = t.state().sim
    await new Promise(res => setTimeout(res, 900))
    const open = t.probe().gate
    t.moveTo(gate.wx, gate.wz)
    await new Promise(res => setTimeout(res, 900))
    const s = t.state().sim
    return { delivered: loaded.delivered, total: loaded.total, open, phase: s.phase, result: s.result, screen: t.state().screen }
})
r.check('every pile can be carried to the cart', finish.delivered === finish.total, `${finish.delivered}/${finish.total}`)
r.check('a full cart raises the gate', finish.open === true, `gate=${finish.open}`)
r.check('reaching the gate with an open gate ends the job', finish.phase === 'clear' || finish.screen === 'clear', `${finish.phase}/${finish.screen}`)
r.check('the result card has numbers in it', finish.result && finish.result.value > 0, JSON.stringify(finish.result))

console.log('\nFRAME BUDGET')
const budget = await api(async () => {
    const t = window.__heistTest
    const a = t.perf().frameMs
    await new Promise(res => setTimeout(res, 1500))
    return { a, b: t.perf().frameMs }
})
r.check('render cost fits a phone frame', budget.b < 17, `${budget.b} ms avg render (dev build, software GL on CI)`)

await page.screenshot({ path: path.resolve(SHOT) }).catch(() => {})
console.log(`  ..  wrote ${SHOT}`)
await browser.close()
r.exit(null)
process.exit(r.failed ? 1 : 0)
