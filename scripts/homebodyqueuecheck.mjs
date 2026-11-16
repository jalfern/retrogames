// homebodyqueuecheck.mjs — the HOMEBODY action-queue harness (#2470).
// Node-first, no browser: drives the same pure sim (src/games/Homebody/sim.js)
// the shipping component runs. Proves:
//   1. ISSUE & DRAIN — idle taps issue instantly (old law untouched); a busy
//      resident APPENDS; the head re-issues automatically the tick they free up.
//   2. THE LINE      — three deep maximum; the fourth is refused with a voice.
//   3. RE-VALIDATION — orders are trusted at tap time but PROVEN at issue time:
//      a sold object drops honestly (queue-drop) and never strands the resident.
//   4. CANCEL        — queueCancel splices exactly the chosen item, head shifts up.
//   5. CLEARING      — collapse empties the list (collapsed knees can't run
//      errands); clocking in empties it (they're off the lot).
//   6. HASH & REPLAY — queued contents ride stateHash; identical scripts on one
//      seed produce identical worlds; a no-tap run hashes seed-exact, so the
//      old play is byte-identical (the bot never queues).
//   7. WIRING        — panel layout, hit route and shell taps share sources;
//      the chip check sits ABOVE tile routing.
//
// Prove it can fail (FORGE step 5): in sim.js, stub the pump guard
// `p.queue.length && !p.path && !p.goal && !p.use` to `false` -> [ISSUE & DRAIN]
// and [RE-VALIDATION] go red; restore.

import {
    FIXED_DT, DEF, COLLAPSE_AT,
    newRun, advance, autoStep, cmdUse, cmdWork, cmdQueue, queueCancel, orderBusy, tryUseOrQueue,
    sellAt, stateHash, WORK_START, targetsOf, tileX, tileY, TILE,
} from '../src/games/Homebody/sim.js'
import { readFileSync } from 'node:fs'

const DT = FIXED_DT / 1000
let pass = 0, fail = 0
const fails = []
const check = (name, cond, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}${info ? '  ' + info : ''}`) }
    else { fail++; fails.push(name); console.log(`  FAIL ${name}${info ? '  ' + info : ''}`) }
}
const section = (t) => console.log(`\n[${t}]`)
const drain = (s) => { const out = [...s.events]; s.events.length = 0; return out }
const runTicks = (g, n) => { for (let i = 0; i < n && !g.done; i++) advance(g, DT) }

section('ISSUE & DRAIN')
{
    const g = newRun(11)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    const toilet = g.items.find((it) => it.id === 'toilet')
    check('idle resident is not busy', !orderBusy(g, otto))
    check('idle issue goes straight through', cmdUse(g, otto, fridge) && otto.goal && otto.goal.it === fridge)
    check('an issued order marks the resident busy', orderBusy(g, otto))
    const evs = drain(g)
    check('the order ping rides the tap', g.orderPing.t > 0 && evs.every((e) => e.t !== 'queued'), JSON.stringify(evs.map((e) => e.t)))
    check('busy tap appends instead of replacing', cmdQueue(g, otto, { kind: 'use', it: toilet }) && otto.queue.length === 1 && otto.goal.it === fridge)
    check('the append speaks its name', drain(g).some((e) => e.t === 'queued' && e.id === 'toilet'))
    let ate = false
    for (let i = 0; i < 60 * 40 && !ate; i++) { advance(g, DT); ate = drain(g).some((e) => e.t === 'satisfied' && e.need === 'hunger') }
    check('the errand in flight completes first', ate && otto.needs.hunger > 0.7, `h=${otto.needs.hunger.toFixed(2)}`)
    runTicks(g, 8)   // let the pump take the turn the tick the fridge released them
    check('the queue re-issues automatically', otto.goal && otto.goal.it === toilet, JSON.stringify(otto.goal))
    let done = false
    for (let i = 0; i < 60 * 40 && !done; i++) { advance(g, DT); done = drain(g).some((e) => e.t === 'satisfied' && e.need === 'bladder') }
    check('the queued order actually runs to the end', done && otto.queue.length === 0, `b=${otto.needs.bladder.toFixed(2)}`)
    // the pad-A route at sim level: idle issues, busy appends the nearest
    const gA = newRun(29)
    const pA = gA.people[0]
    const fA = gA.items.find((it) => it.id === 'fridge')
    const fAt = targetsOf(gA, fA)[0]
    pA.r = fAt.r; pA.c = fAt.c; pA.x = tileX(fAt.c) + TILE / 2; pA.y = tileY(fAt.r) + TILE / 2
    check('idle pad-A issues at once', tryUseOrQueue(gA, pA) === true && pA.goal && pA.goal.it === fA && pA.queue.length === 0)
    drain(gA)
    check('a player order claims ownership', pA.owner === 'human')
    // #2470: free will never outranks the hand — an AI errand is preempted,
    // not queued behind, and the pump's ownership stamp tells them apart.
    const gB = newRun(31)
    const pB = gB.people[0]
    const fB = gB.items.find((it) => it.id === 'fridge')
    pB.owner = 'ai'
    pB.path = [{ r: pB.r, c: pB.c }]
    pB.goal = { kind: 'chat', v: 'fern' }
    const tB = targetsOf(gB, fB)[0]
    pB.r = tB.r; pB.c = tB.c; pB.x = tileX(tB.c) + TILE / 2; pB.y = tileY(tB.r) + TILE / 2
    check('an AI wander is preempted, never queued', tryUseOrQueue(gB, pB) === true && pB.queue.length === 0 && pB.owner === 'human' && pB.goal.it === fB)
    drain(gB)
}

section('THE LINE')
{
    const g = newRun(13)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    cmdUse(g, otto, fridge)
    check('three fit on the list', cmdQueue(g, otto, { kind: 'walk', r: 6, c: 2 }) && cmdQueue(g, otto, { kind: 'walk', r: 6, c: 3 }) && cmdQueue(g, otto, { kind: 'use', it: fridge }) && otto.queue.length === 3)
    check('the fourth is refused', cmdQueue(g, otto, { kind: 'walk', r: 7, c: 7 }) === false)
    check('the refusal is voiced', drain(g).some((e) => e.t === 'queue-full'))
}

section('RE-VALIDATION')
{
    const g = newRun(15)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    const toilet = g.items.find((it) => it.id === 'toilet')
    cmdUse(g, otto, fridge)
    cmdQueue(g, otto, { kind: 'use', it: toilet })
    sellAt(g, toilet.r, toilet.c)
    drain(g)
    let dropped = false
    for (let i = 0; i < 60 * 60 && !dropped; i++) { advance(g, DT); dropped = drain(g).some((e) => e.t === 'queue-drop' && e.id === 'toilet') }
    check('a sold object drops honestly at issue time', dropped && otto.queue.length === 0)
    check('the drop never strands the resident', !otto.goal && !otto.path, JSON.stringify({ goal: otto.goal && otto.goal.kind, path: !!otto.path }))
}

section('CANCEL')
{
    const g = newRun(17)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    const toilet = g.items.find((it) => it.id === 'toilet')
    const radio = g.items.find((it) => it.id === 'radio') || g.items.find((it) => it.id === 'tv')
    cmdUse(g, otto, fridge)
    cmdQueue(g, otto, { kind: 'use', it: toilet })
    cmdQueue(g, otto, { kind: 'use', it: radio })
    const gone = queueCancel(g, otto, 0)
    check('the chip cancels exactly its order', gone && gone.it === toilet && otto.queue.length === 1 && otto.queue[0].it === radio)
    check('the cancel is voiced', drain(g).some((e) => e.t === 'queue-cancel' && e.id === 'toilet'))
    check('out-of-range cancels are inert', queueCancel(g, otto, 5) === null && queueCancel(g, otto, -1) === null)
}

section('CLEARING')
{
    // collapse empties the list: strip every need-fixing object so the red
    // cannot be talked out of it, then let bladder do the falling.
    const g = newRun(19)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    cmdUse(g, otto, fridge)
    cmdQueue(g, otto, { kind: 'walk', r: 5, c: 5 })
    cmdQueue(g, otto, { kind: 'walk', r: 5, c: 6 })
    g.items = g.items.filter((it) => !DEF[it.id] || !DEF[it.id].need)
    otto.needs.bladder = 0
    drain(g)
    let fainted = false
    for (let i = 0; i < 60 * Math.ceil(COLLAPSE_AT + 8) && !fainted; i++) { advance(g, DT); fainted = drain(g).some((e) => e.t === 'faint' && e.name === otto.name) }
    check('collapse clears the list', fainted && otto.queue.length === 0)
    // clocking in empties it — they are off the lot for the day
    const g2 = newRun(23)
    g2.hour = WORK_START + 1
    const worker = g2.people.find((p) => p.worksOn === g2.day % 2 && !p.workedToday)
    const fridge2 = g2.items.find((it) => it.id === 'fridge')
    cmdUse(g2, worker, fridge2)
    cmdQueue(g2, worker, { kind: 'walk', r: 5, c: 5 })
    check('the clock-in order issues over the errand', cmdWork(g2, worker) === true)
    drain(g2)
    let went = false
    for (let i = 0; i < 60 * 60 && !went; i++) { advance(g2, DT); went = drain(g2).some((e) => e.t === 'work-go' && e.name === worker.name) }
    check('leaving for work empties the list', went && worker.working && worker.queue.length === 0)
}

section('HASH & REPLAY')
{
    const script = () => {
        const g = newRun(42)
        const otto = g.people[0]
        const fridge = g.items.find((it) => it.id === 'fridge')
        const toilet = g.items.find((it) => it.id === 'toilet')
        runTicks(g, 5)
        cmdUse(g, otto, fridge)
        cmdQueue(g, otto, { kind: 'use', it: toilet })
        runTicks(g, 900)
        drain(g)
        return g
    }
    const a = script(), b = script()
    check('same seed, same script, same world', stateHash(a) === stateHash(b))
    const c = newRun(42)
    runTicks(c, 5)
    const before = stateHash(c)
    cmdQueue(c, c.people[0], { kind: 'use', it: c.items.find((it) => it.id === 'toilet') })
    check('a queued list changes the hash', stateHash(c) !== before)
    // seed-exact freeze: a NO-TAP run hashes identically tick-for-tick, so the
    // queue layer provably did not touch the old play (the bot never queues).
    const p = newRun(7)
    for (let i = 0; i < 3000; i++) { advance(p, DT); drain(p) }
    check('no-tap play is seed-exact', stateHash(p) === 1609037625, `got ${stateHash(p)} (computed against unmodified main, #2470)`)
    let sawQueue = false
    const q = newRun(5)
    for (let i = 0; i < 60 * 900 && !q.done; i++) { autoStep(q, DT); drain(q); if (q.people.some((pp) => pp.queue.length)) sawQueue = true }
    check('the attract bot never queues', !sawQueue && q.done === 'win', `done=${q.done}`)
}

section('WIRING')
{
    const simSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const artSrc = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const idxSrc = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('sim exports the queue law', ['export const QUEUE_MAX', 'export function cmdQueue', 'export function queueCancel', 'export function orderBusy', 'export function tryUseOrQueue'].every((k) => simSrc.includes(k)))
    check('the pump sits before autonomy', /while \(p\.queue\.length && !ok\)[\s\S]{0,400}\n\s{8}autonomous\(s, p\)/.test(simSrc))
    check('collapse clears the queue in the sim', /p\.faintT = FAINT_SEC[\s\S]{0,120}p\.queue\.length = 0/.test(simSrc))
    check('the shift clears the queue in the sim', /p\.working = true[\s\S]{0,120}p\.queue\.length = 0/.test(simSrc))
    check('art exports the shared layout', artSrc.includes('export function residentRows') && artSrc.includes('export function queueHit') && artSrc.includes('export const QCELL'))
    check('the queue row derives from residentRows in the painter', artSrc.indexOf('for (const row of residentRows(s))') < artSrc.indexOf('BONDS'))
    check('new glyphs ship', artSrc.includes("case 'case':") && artSrc.includes("case 'arrow':"))
    check('the chip route sits above tile routing', idxSrc.indexOf('queueHit(gs, px, py)') < idxSrc.indexOf('const t = tileOf(px, py)'))
    check('the shell appends and cancels via the sim law', idxSrc.includes('cmdQueue(gs, p,') && idxSrc.includes('queueCancel(gs, gs.people[qh.pi], qh.qi)'))
    check('the shell queues only human errands', (idxSrc.match(/p\.owner === 'human' && orderBusy\(gs, p\)/g) || []).length >= 5)
    check('sim stamps ownership', simSrc.includes("p.owner = 'human'") && simSrc.includes("p.owner = 'ai'"))
    check('pad-A rides the queue law', idxSrc.includes('tryUseOrQueue(gs, p)'))
    check('the probe reports the lists', idxSrc.includes('queues: gs.people.map'))
}

console.log(`\nhomebodyqueuecheck: ${pass}/${pass + fail}${fail ? '  FAILED: ' + fails.join(', ') : ''}`)
process.exit(fail ? 1 : 0)
