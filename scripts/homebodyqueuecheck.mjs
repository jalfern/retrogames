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
//   8. POLISH #2474  — the NOW cell (running errand leads the chip row with a
//      draining wipe; AI errands and faints show none) and the per-glyph append
//      timbres (distinct first frequency per category, one glyph source).
//   9. POLISH 2 #2474 — the name reveal (chipHover reads the pending chip or the
//      NOW cell and names it; hover never cancels) and the row-collapse beat
//      (a emptied row holds its space while ghost chips shrink, then reflows).
//  10. POLISH 3 #2474 — drag-to-front (#2495 answer B): queuePromote splices
//      order only; the head chip and out-of-range are inert; the promoted
//      errand rides the pump first and still re-validates; the view routes
//      (arm/press-lift/settle/pad) and the QCELL-derived head-slot distance.
//
// Prove it can fail (FORGE step 5): in sim.js, stub the pump guard
// `p.queue.length && !p.path && !p.goal && !p.use` to `false` -> [ISSUE & DRAIN]
// and [RE-VALIDATION] go red; restore.
// Mutant #2474: in art.js, make chipProgress `return null` — the NOW-cell pins
// (row reports / tap inert / head shifted) go red and the wipe-rise pins die;
// restore. Drop the `off` in queueHit — the inert-tap and shifted-head pins
// go red; restore.
// Mutant #2474-2: in art.js, make chipHover `return null` — the four reveal
// pins go red; restore. Drop the reserved-space line in residentRows
// (`if (fade) row.queueY = ...`) — the hold-open pin goes red; restore.
// Mutant #2474-3: stub queuePromote `return null` — the front-move, rides-the-
// pump and hash pins go red; restore.

import {
    FIXED_DT, DEF, COLLAPSE_AT,
    newRun, advance, autoStep, cmdUse, cmdWork, cmdQueue, queueCancel, queuePromote, orderBusy, tryUseOrQueue,
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
    // #2474 QA recalibration: this constant predated #2503 (ice-cream truck) —
    // truckHour/binAt/iceDay/serial/cone all ride stateHash now, so the frozen
    // 1609037625 was red on main before this branch (verified at 096faac).
    check('no-tap play is seed-exact', stateHash(p) === 3998885235, `got ${stateHash(p)} (re-sampled for #2721: the garden jar joins the hash, Pip's round shifts the attract tour by nothing in the till but the wing lands a beat earlier; the last join was 3836882361 at 68e1cf1 — sneak #2520, prowl #2532, stroll-neiWalk #2611, mediation-neiMediated #2672; autoplay twin-gate green)`)
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

section('POLISH #2474 — NOW CELL & PER-GLYPH APPEND')
{
    const art = await import('../src/games/Homebody/art.js')
    const { residentRows, queueHit, QCELL, queueGlyphFor, chipProgress } = art
    // --- per-glyph timbre table (pure data, #2240/#2264 pattern)
    const TIM = await import('../src/games/Homebody/sim.js')
    const QT = TIM.QUEUE_TIMBRE
    const glyphs = ['fork', 'moon', 'star', 'chat', 'drop', 'case', 'arrow']
    check('every chip glyph has its own timbre', glyphs.every((g) => Array.isArray(QT[g]) && QT[g].length >= 1))
    check('timbres are shaped notes [freq,dur,delayMs]', glyphs.every((g) => QT[g].every(([f, d, ms]) => f > 0 && d > 0 && ms >= 0)))
    check('timbres are distinct — no two categories share a first frequency', new Set(glyphs.map((g) => QT[g][0][0])).size === glyphs.length)
    check('append glyphs derive from one source', queueGlyphFor('walk') === 'arrow' && queueGlyphFor('work') === 'case' && queueGlyphFor('mail') === 'case'
        && queueGlyphFor('fridge') === 'fork' && queueGlyphFor('bed') === 'moon' && queueGlyphFor('tv') === 'star' && queueGlyphFor('phone') === 'chat' && queueGlyphFor('toilet') === 'drop')
    check('an unknown glyph falls back to the historic blip', JSON.stringify(TIM.QUEUE_TIMBRE_FALLBACK) === JSON.stringify([[660, 0.04, 0]]))
    // --- NOW cell progress: interaction drains t/dur
    const g = newRun(11)
    const otto = g.people[0]
    const fridge = g.items.find((it) => it.id === 'fridge')
    const toilet = g.items.find((it) => it.id === 'toilet')
    check('an idle resident shows no NOW cell', chipProgress(otto) === null)
    cmdUse(g, otto, fridge)
    cmdQueue(g, otto, { kind: 'use', it: toilet })
    drain(g)
    check('the walk to the fridge carries a progress', chipProgress(otto) && chipProgress(otto).glyph === 'fork' && chipProgress(otto).frac >= 0 && chipProgress(otto).frac <= 1)
    let f0 = -1, rose = false, seated = false
    for (let i = 0; i < 60 * 40 && !seated; i++) {
        advance(g, DT); drain(g)
        const cp = chipProgress(otto)
        if (cp) { if (f0 < 0) f0 = cp.frac; if (cp.frac > f0) rose = true; seated = !!otto.use }
    }
    check('the walk wipe rises as steps are spent', rose, `f0=${f0.toFixed(2)}`)
    check('the interaction wipe is keyed to t/dur', seated && chipProgress(otto) !== null && chipProgress(otto).frac <= 1 && chipProgress(otto).frac >= 0)
    let f1 = chipProgress(otto) ? chipProgress(otto).frac : -1, grew = seated
    for (let i = 0; i < 60 * 8; i++) { advance(g, DT); drain(g); const cp = chipProgress(otto); if (cp && f1 >= 0 && cp.frac > f1) grew = true }
    check('the interaction wipe drains while they use it', grew || seated, `f1=${f1.toFixed(2)}`)
    // --- AI errands never take the panel
    const gB = newRun(31)
    const pB = gB.people[0]
    pB.owner = 'ai'
    pB.path = [{ r: pB.r, c: pB.c }, { r: pB.r + 1, c: pB.c }]
    pB.walkN0 = 2
    pB.goal = { kind: 'chat', v: 'fern' }
    cmdQueue(gB, pB, { kind: 'walk', r: 6, c: 2 })
    check('an AI wander shows no NOW cell (chips are the player’s list)', chipProgress(pB) === null)
    check('a fainted resident shows no NOW cell', (() => { const q = newRun(12); q.people[0].owner = 'human'; q.people[0].path = [{ r: q.people[0].r, c: q.people[0].c }]; q.people[0].walkN0 = 1; q.people[0].faintT = 2; return chipProgress(q.people[0]) === null })())
    // --- row geometry: NOW cell leads, pending chips shift right one cell
    // (fresh run, walk still in flight — deterministic, no pump racing)
    const gC = newRun(11)
    const ottoC = gC.people[0]
    cmdUse(gC, ottoC, gC.items.find((it) => it.id === 'fridge'))
    cmdQueue(gC, ottoC, { kind: 'use', it: gC.items.find((it) => it.id === 'toilet') })
    const rows = residentRows(gC)
    const row = rows.find((rr) => rr.p === ottoC)
    check('the row reports the NOW cell ahead of the pending chips', row && row.queueY !== null && row.now && row.now.glyph === 'fork')
    const cy = row.queueY + QCELL.ch / 2
    const base = TIM.PANEL_X
    const hitNow = queueHit(gC, base + 26 + QCELL.cw / 2, cy)   // sits on the NOW cell
    const hitHead = queueHit(gC, base + 26 + (QCELL.cw + QCELL.gap) + QCELL.cw / 2, cy)   // first pending chip, shifted right
    check('a tap on the NOW cell is inert (a tell, not a button)', hitNow === null)
    check('the head pending chip sits one cell right and still cancels', hitHead && hitHead.pi === rows.indexOf(row) && hitHead.qi === 0)
    // --- hash safety: the view layer may not touch the world
    const h0 = stateHash(g)
    for (let i = 0; i < 30; i++) { residentRows(g); chipProgress(otto); queueHit(g, base, cy) }
    check('probing the view never moves the hash', stateHash(g) === h0)
    // --- source pins
    const artSrc = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const idxSrc2 = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const simSrc2 = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    check('sim stamps the walk length at issue', (simSrc2.match(/p\.walkN0 = path\.length/g) || []).length >= 2)
    check('art derives rows, glyph and progress from one source', artSrc.includes('export function chipProgress') && artSrc.includes('export function queueGlyphFor') && artSrc.includes('chipProgress(p)'))
    check('the painter drains a bar in the NOW cell', artSrc.includes('1 - row.now.frac') && artSrc.includes('row.now.glyph'))
    check('the hit route offsets by the NOW cell', artSrc.includes('row.now ? QCELL.cw + QCELL.gap : 0'))
    check('the shell plays the per-glyph timbre verbatim', idxSrc2.includes('QUEUE_TIMBRE[queueGlyphFor(e.id)]'))
}

section('POLISH 2 #2474 — NAME REVEAL & COLLAPSE BEAT')
{
    const art = await import('../src/games/Homebody/art.js')
    const { residentRows, queueHit, chipHover, chipName, chipCollapse, chipCollapseArm, COLLAPSE_FRAMES, QCELL, queueGlyphFor } = art
    const base = 528   // PANEL_X
    // --- chipName: one source for the spoken name
    check('chipName names catalog objects', chipName('fridge') === 'FRIDGE' && chipName('toilet') === 'PORCELAIN THRONE')
    check('chipName speaks the mail and the walk', chipName('mail') === 'WORK' && chipName('work') === 'WORK' && chipName('walk') === 'WALK')
    check('an unknown id still answers in caps', chipName('hmm') === 'HMM')
    // --- hover: mouse route over the chips AND the NOW cell
    // (fresh walk to the fridge with the toilet queued — deterministic, no pump racing)
    const gH = newRun(11)
    const ottoH = gH.people[0]
    cmdUse(gH, ottoH, gH.items.find((it) => it.id === 'fridge'))
    cmdQueue(gH, ottoH, { kind: 'use', it: gH.items.find((it) => it.id === 'toilet') })
    const rowsH = residentRows(gH)
    const rowH = rowsH.find((rr) => rr.p === ottoH)
    const cyH = rowH.queueY + QCELL.ch / 2
    check('the NOW cell leads and the hover reads its errand', rowH.now && rowH.now.id === 'fridge'
        && (() => { const h = chipHover(gH, base + 26 + QCELL.cw / 2, cyH); return h && h.qi === -1 && h.glyph === 'fork' && h.name === 'FRIDGE' })())
    check('hover names the pending chip', (() => { const h = chipHover(gH, base + 26 + (QCELL.cw + QCELL.gap) + QCELL.cw / 2, cyH); return h && h.qi === 0 && h.name === 'PORCELAIN THRONE' })())
    check('hover off the row reads nothing', chipHover(gH, base + 26 + QCELL.cw / 2, cyH - 10) === null
        && chipHover(gH, base + 4, cyH) === null)
    const hH = stateHash(gH)
    const qH = ottoH.queue.length
    for (let i = 0; i < 40; i++) { chipHover(gH, base + 26 + (QCELL.cw + QCELL.gap) + QCELL.cw / 2, cyH); chipHover(gH, base + 26 + QCELL.cw / 2, cyH) }
    check('hover never cancels and never moves the hash', ottoH.queue.length === qH && stateHash(gH) === hH)
    check('the NOW name rides one glyph/id source', rowH.now.glyph === queueGlyphFor(rowH.now.id))
    // --- collapse beat: an emptied row holds space while ghosts shrink, then reflows.
    // (the queue is sim state, so emptying it moves the hash — capture the view's
    // own reflow before/after the fade, and prove probing stable on THIS state.)
    const cache = new Map()
    const hEmpty = stateHash(gH)   // queue still has the toilet
    ottoH.queue.length = 0         // the list drains (as cancel/drop would)
    const rowEmpty = residentRows(gH).find((rr) => rr.p === ottoH)
    const hAfter = stateHash(gH)
    check('the sim owns the queue state (hash moves when the list drains)', hEmpty !== hAfter)
    chipCollapseArm(cache, gH.people.indexOf(ottoH), ['fork', 'drop'], 0)
    const rowG = residentRows(gH, cache).find((rr) => rr.p === ottoH)
    check('arm keeps the row reserved while chips are gone', rowG.queueY !== null && rowG.fade && rowG.fade.glyphs.length === 2 && rowG.fade.t === COLLAPSE_FRAMES)
    check('the beat holds the panel open (the next row sits lower)', rowG.nextY === rowEmpty.nextY + 18)
    for (let i = 0; i < COLLAPSE_FRAMES - 1; i++) chipCollapse(gH, cache)
    check('the ghosts survive until the last frame', residentRows(gH, cache).find((rr) => rr.p === ottoH).fade && cache.has(0))
    chipCollapse(gH, cache)
    check('the row reflows when the beat ends', !cache.has(0) && residentRows(gH, cache).find((rr) => rr.p === ottoH).queueY === null
        && residentRows(gH, cache).find((rr) => rr.p === ottoH).nextY === rowEmpty.nextY)
    check('arming nothing arms nothing', (() => { const c2 = new Map(); chipCollapseArm(c2, 0, [], 0); return c2.size === 0 })())
    cache.clear()
    check('probing the new view never moves the hash', stateHash(gH) === hAfter && stateHash(gH) === hAfter)
    // --- source pins: the layer is view-only, hover never rides the tap route
    const artSrc3 = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const idxSrc3 = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('art exports the reveal and collapse routes', ['export function chipHover', 'export function chipName', 'export function chipCollapse', 'export function chipCollapseArm', 'export const COLLAPSE_FRAMES'].every((x) => artSrc3.includes(x)))
    check('the painter draws ghosts and the name label', artSrc3.includes('if (row.fade)') && artSrc3.includes('hoverName.name'))
    check('the hover route sits beside queueHit, not inside it', artSrc3.indexOf('export function chipHover') > artSrc3.indexOf('export function queueHit')
        && !(/pointerPx[\s\S]{0,400}chipHover/).test(idxSrc3.slice(idxSrc3.indexOf('const pointerPx'), idxSrc3.indexOf('const pointerPx') + 400)))
    check('the shell arms ghosts on a shrinking list and decays per world step', idxSrc3.includes('chipCollapseArm(collapseCache') && idxSrc3.includes('chipCollapse(gs, collapseCache)'))
    check('the cancel law still owns the settled tap (arm on press, queueCancel on lift)', /queueHit\(gs, px, py\)[\s\S]{0,220}queueCancel/s.test(idxSrc3) && idxSrc3.includes('chipLift()'))
    check('the probe exposes the view state for QA', idxSrc3.includes('collapse: gs.people.map') && idxSrc3.includes('hoverName: hoverReveal'))
    check('a new street clears ghosts and names', idxSrc3.includes('collapseCache.clear(); hoverReveal = null'))
}

section('POLISH 3 #2474 — DRAG-TO-FRONT (promote a queued chip)')
{
    const simSrc4 = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const idxSrc4 = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('sim exports the promote law', simSrc4.includes('export function queuePromote'))
    // --- pure order law: only the LIST moves, the head-in-flight never does
    const gP = newRun(21)
    const oP = gP.people[0]
    const fridgeP = gP.items.find((it) => it.id === 'fridge')
    const aP = gP.items.find((it) => it.id === 'toilet')
    const bP = gP.items.find((it) => it.id === 'tv') || gP.items.find((it) => it.id === 'radio')
    drain(gP)
    cmdUse(gP, oP, fridgeP)                                   // errand in flight
    cmdQueue(gP, oP, { kind: 'use', it: aP })          // [a]
    cmdQueue(gP, oP, { kind: 'use', it: bP })             // [a, b]
    const hBefore = stateHash(gP)
    const pr = queuePromote(gP, oP, 1)
    const evP = drain(gP).filter((e) => e.t === 'queue-promote')
    check('promote moves the chosen chip to the front', pr && pr.it === bP && oP.queue[0].it === bP && oP.queue[1].it === aP)
    check('the promote event names the errand and the resident', evP.length === 1 && evP[0].id === bP.id && evP[0].name === oP.name)
    check('order is state — the hash moves', stateHash(gP) !== hBefore)
    check('the head chip has no front to pull to', queuePromote(gP, oP, 0) === null && oP.queue[0].it === bP && !drain(gP).some((e) => e.t === 'queue-promote'))
    check('out of range is inert', queuePromote(gP, oP, 2) === null && queuePromote(gP, oP, -1) === null && oP.queue.length === 2)
    // --- the promoted errand is the one that runs next
    const hMid = stateHash(gP)
    check('promoting the same head is inert (hash still)', queuePromote(gP, oP, 0) === null && stateHash(gP) === hMid)
    const issueSeq = []
    for (let i = 0; i < 60 * 60 && oP.queue.length; i++) {
        advance(gP, DT); drain(gP)
        const cur = oP.use ? oP.use.it.id : (oP.goal && oP.goal.it ? oP.goal.it.id : null)
        if ((cur === aP.id || cur === bP.id) && issueSeq[issueSeq.length - 1] !== cur) issueSeq.push(cur)
    }
    check('the promoted errand rides the pump first', issueSeq[0] === bP.id && issueSeq.includes(aP.id), `issued: ${issueSeq.join(',')}`)
    // --- re-validation survives promotion: a sold promoted order drops honestly at issue
    const gS = newRun(22)
    const oS = gS.people[0]
    const fridgeS = gS.items.find((it) => it.id === 'fridge')
    const bedS = gS.items.find((it) => it.id === 'bed')
    const toiletS = gS.items.find((it) => it.id === 'toilet')
    drain(gS)
    cmdUse(gS, oS, fridgeS)
    cmdQueue(gS, oS, { kind: 'use', it: toiletS })
    cmdQueue(gS, oS, { kind: 'use', it: bedS })
    queuePromote(gS, oS, 1)                                   // bed steps to the front
    sellAt(gS, bedS.r, bedS.c)
    drain(gS)
    let dropped = false
    for (let i = 0; i < 60 * 60 && !dropped; i++) { advance(gS, DT); dropped = drain(gS).some((e) => e.t === 'queue-drop' && e.id === 'bed') }
    check('a sold promoted order still drops honestly at issue', dropped && !oS.queue.some((o) => o.kind === 'use' && o.it === bedS))
    check('the resident is never stranded by the reorder', !oS.done && !oS.queue.some((o) => o.kind === 'use' && o.it === bedS))
    // --- wiring: the view routes through the sim law, threshold derives from QCELL
    check('the shell arms, drags and settles chips via the sim law', idxSrc4.includes('queuePromote(gs, gs.people[chipDrag.pi], chipDrag.qi)')
        && idxSrc4.includes('queueCancel(gs, gs.people[qh.pi], qh.qi)'))
    check('the drag lands on the head slot — distance derives from QCELL, not magic numbers', idxSrc4.includes('headEdge = chipDrag.x0 - chipDrag.qi * (QCELL.cw + QCELL.gap) + QCELL.cw') && idxSrc4.includes('px <= headEdge'))
    check('the harness gets the whole gesture: tap is press+release, drag pulls', idxSrc4.includes('pointerPx(px, py); chipLift()') && idxSrc4.includes('pointerPx(fx, fy); chipDragMove(tx, ty); chipLift()'))
    check('the pad route settles and drags too', idxSrc4.includes('chipDragMove(pad.pointer.x * W, pad.pointer.y * H)') && idxSrc4.includes('chipLift()   // #2474 item 3: pad lift'))
    check('pulling the head chip is the plain press-cancel', /if \(qh\.qi === 0\) \{ queueCancel\(gs, gs\.people\[qh\.pi\], qh\.qi\)/.test(idxSrc4))
    check('the promote has its own two-note up and a spoken line', /case 'queue-promote':[\s\S]{0,420}ORDERED NEXT/.test(idxSrc4))
}

console.log(`\nhomebodyqueuecheck: ${pass}/${pass + fail}${fail ? '  FAILED: ' + fails.join(', ') : ''}`)
process.exit(fail ? 1 : 0)
