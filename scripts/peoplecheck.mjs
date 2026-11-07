// peoplecheck.mjs — the HOMEBODY harness (Node-first, no browser).
//
// Drives the SAME pure sim the shipping component runs (src/games/Homebody/sim.js).
// It proves (FORGE step 5):
//   1. BOOT      — a seeded run starts clean (80-wish, five needs, starter house).
//   2. CORE RULES— need decay over hours, point-and-command use restores the need,
//                  work pays at five o'clock and only on roster days, buy mode pauses
//                  time and placement is connectivity-safe (never walls anyone in),
//                  selling refunds half, the visitor fills the social bar, red needs
//                  collapse and both-down is the lose.
//   3. WINNABLE  — the attract autopilot grants the lifetime wish on several seeds,
//                  and seed→hash is deterministic.
//   4. BONDS     — the #1817 chat ladder: meter growth, exact level edges, the
//                  topic/linger/return/toast unlocks (per-seed exact against a
//                  baseline run), neglect-fade, hash, and source pins.
//
// It proves IT can fail the playbook way: break one load-bearing line in sim.js
// (content accrual in finishUse, or the relAdd(s,'fern') feed in the visitor
// chat block) and the matching sections go red; restore.
//
// Run: node scripts/peoplecheck.mjs

import {
    FIXED_DT, W, H, COLS, ROWS, MAP, TILE, WIN_CONTENT, NEEDS,
    CATALOG, DEF, tileOf, tileX, tileY, SFX, RED_AT, EXT_ROOM,
    REL_NAMES, relLevel, chatPool,
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, sellAt, targetsOf, walkable, bfsPath, stateHash, buildRoom, buildRoomOk,
    manualMove,
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

// drain events, returning the stream
const drain = (s) => { const out = [...s.events]; s.events.length = 0; return out }
// run n ticks returning final state
const runFor = (g, sec) => { for (let i = 0; i < Math.round(sec / DT) && !g.done; i++) advance(g, DT); drain(g); return g }
const play = (seed, cap = 60 * 60 * 45) => {
    const g = newRun(seed)
    let t = 0
    while (!g.done && t < cap) { autoStep(g, DT); drain(g); t++ }
    return g
}

section('BOOT')
{
    const g = newRun(7)
    check('lot is 16x13 tiles at 640x480', COLS === 16 && ROWS === 13 && W === 640 && H === 480)
    check('map rows are all 16 wide', MAP.every((r) => r.length === COLS))
    check('run starts day 1 hour 7, not over', g.day === 1 && g.hour === 7 && g.done === null)
    check('five needs per resident, all positive', g.people.every((p) => NEEDS.length === 5 && NEEDS.every((n) => p.needs[n] > 0.5)))
    check('starter house has bed/fridge/toilet/mail/radio', ['bed', 'fridge', 'toilet', 'mail', 'radio'].every((id) => g.items.some((it) => it.id === id)))
    check('starter items never wall anyone in', g.items.every((it) => targetsOf(g, it).length > 0))
    check('fourteen catalog pieces with prices; Spare Room card 14 keyed R', CATALOG.length === 14 && CATALOG.every((d) => d.price > 0) && CATALOG[13].id === 'roomkit' && CATALOG.filter((d) => d.room).length === 1)
    check('tileOf maps pixels to cells', tileOf(tileX(3) + 4, tileY(2) + 4)?.c === 3 && tileOf(tileX(3), tileY(2))?.r === 2)
}

section('CORE RULES')
{
    // needs drain as hours pass
    const g = newRun(11)
    runFor(g, 25) // ~5 sim hours
    check('needs drain over hours', g.people.every((p) => p.needs.hunger < 0.5), `h=${g.people[0].needs.hunger.toFixed(2)}`)

    // point-and-command: order the fridge, hunger recovers
    const g2 = newRun(13)
    drain(g2)
    const otto = g2.people[0]
    const fridge = g2.items.find((it) => it.id === 'fridge')
    check('cmdUse paths to the fridge', cmdUse(g2, otto, fridge) && otto.path && otto.path.length > 0)
    let ate = false
    for (let i = 0; i < 60 * 20 && !ate; i++) { advance(g2, DT); ate = drain(g2).some((e) => e.t === 'satisfied' && e.need === 'hunger') }
    check('resident walks over and eats', ate && otto.needs.hunger > 0.7, `h=${otto.needs.hunger.toFixed(2)}`)

    // A-button uses whatever is in reach
    const g3 = newRun(17)
    g3.hour = 9
    const mail = g3.items.find((it) => it.id === 'mail')
    const mt = targetsOf(g3, mail)[0]
    const otto3 = g3.people[0]
    otto3.r = mt.r; otto3.c = mt.c; otto3.x = tileX(mt.c) + TILE / 2; otto3.y = tileY(mt.r) + TILE / 2
    const used = tryUse(g3, otto3)
    check('A-button next to the mailbox clocks in', used && otto3.goal && otto3.goal.kind === 'use', JSON.stringify(otto3.goal))
    const g3b = newRun(21)
    const fridge3 = g3b.items.find((it) => it.id === 'fridge')
    const ft = targetsOf(g3b, fridge3)[0]
    const p3 = g3b.people[0]
    p3.r = ft.r; p3.c = ft.c; p3.x = tileX(ft.c) + TILE / 2; p3.y = tileY(ft.r) + TILE / 2
    check('A-button on the fridge uses it', tryUse(g3b, p3) && p3.goal && p3.goal.it === fridge3)

    // work: only on roster days, only in hours, pays at 17:00
    const g4 = newRun(19)
    g4.hour = 7
    check('no clocking in before the shift', cmdWork(g4, g4.people[0]) === false)
    g4.hour = 9
    check('Otto clocks in on day 1 (his day)', cmdWork(g4, g4.people[0]) === true)
    check('Mira is not rostered on day 1', cmdWork(g4, g4.people[1]) === false)
    const before = g4.money
    let payEv = null
    for (let i = 0; i < 60 * 40 && !payEv; i++) { advance(g4, DT); payEv = drain(g4).find((e) => e.t === 'pay') || null }
    check('Otto comes home at five with pay', !!payEv && g4.money > before && !g4.people[0].working, `+${payEv ? payEv.pay : 0}`)
    check('a day job banks lifetime content', g4.content >= 3, `content=${g4.content}`)

    // buy mode: time stands still, placement costs and connectivity-safety
    const g5 = newRun(23)
    g5.build = true
    g5.money = 1000
    const hourBefore = g5.hour
    runFor(g5, 5)
    check('time stands still in buy mode', g5.hour === hourBefore)
    g5.sel = CATALOG.findIndex((d) => d.id === 'rug')
    check('affordable placement succeeds and costs money', place(g5, 3, 5) && g5.money === 1000 - DEF.rug.price)
    g5.sel = CATALOG.findIndex((d) => d.id === 'tv')
    g5.money = 100
    check('unaffordable placement fails', !place(g5, 3, 4) && g5.money === 100)
    // seal the bedroom gap with the bed: impossible by design (keepsOpen)
    const g6 = newRun(29)
    g6.money = 5000
    g6.sel = CATALOG.findIndex((d) => d.id === 'stove')
    // the bed room entrance is (5,2)->(6,2),(6,3); filling (6,3) leaves exit, filling BOTH in one go is impossible;
    // instead try to seal the upstairs gap cell (4,2) with a solid — must fail while radio/below depend on it
    const seal = [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6]].filter(([r, c]) => walkable(g6, r, c))
    let sealed = true
    for (const [r, c] of seal) { g6.sel = CATALOG.findIndex((d) => d.id === 'stove'); if (!place(g6, r, c)) { sealed = false; break } }
    check('a wall of furniture cannot seal the upstairs', !sealed || g6.people.every((p) => bfsPath(g6, { r: p.r, c: p.c }, [{ r: 12, c: 5 }]) !== null), sealed ? 'wall built' : 'placement refused')
    // sell refunds half
    const g7 = newRun(31)
    g7.money = 1000
    g7.sel = CATALOG.findIndex((d) => d.id === 'lamp')
    const okP = place(g7, 2, 4)
    check('sell refunds exactly half', okP && sellAt(g7, 2, 4) && g7.money === 1000 - DEF.lamp.price + Math.floor(DEF.lamp.price / 2))
    check('mail cannot be sold', !sellAt(g7, 11, 6))

    // visitor fills the social bar
    const g8 = newRun(37)
    g8.hour = 9; g8.visitAfter = 9; g8.visitGap = 0
    let visited = false
    for (let i = 0; i < 60 * 20 && !visited; i++) { advance(g8, DT); visited = drain(g8).some((e) => e.t === 'visit') }
    check('Fern arrives through the gate', visited && !!g8.visitor)
    // order Otto to chat next to Fern
    if (g8.visitor) {
        const cell = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dr, dc]) => ({ r: g8.visitor.r + dr, c: g8.visitor.c + dc })).find((t) => walkable(g8, t.r, t.c))
        const p = g8.people[0]
        const s0 = p.needs.social
        g8.visitor.hangUntil = 999
        let chatted = false
        for (let i = 0; i < 60 * 30 && !chatted; i++) {
            if (!p.path && !p.use && !p.goal && cell) { const path = bfsPath(g8, { r: p.r, c: p.c }, [cell]); if (path) { p.path = path; p.goal = { kind: 'chat' } } }
            advance(g8, DT); drain(g8)
            if (p.needs.social > s0 + 0.01) chatted = true
        }
        check('chatting with the neighbour fills the social bar', chatted, `social ${s0.toFixed(2)} -> ${p.needs.social.toFixed(2)}`)
    }

    // emergencies: starvation collapses; both down loses
    const g9 = newRun(41)
    g9.demo = false
    let fainted = false
    for (let i = 0; i < 60 * 60 * 2 && !fainted; i++) { advance(g9, DT); fainted = drain(g9).some((e) => e.t === 'faint') || null; fainted = !!fainted }
    check('an ignored resident collapses', fainted || g9.people.some((p) => p.faintT > 0))
    const g10 = newRun(43)
    g10.demo = false
    let over = null
    for (let i = 0; i < 60 * 60 * 3 && !over; i++) { advance(g10, DT); drain(g10); over = g10.done }
    check('both residents down ends the run', over === 'lose')
}

section('SPARE ROOM (#1806): the lot grows, connectivity honest')
{
    const kit = DEF.roomkit
    check('kit prices space, not furniture (no need, not solid, not decor)', kit.price === 300 && !kit.need && !kit.solid && !kit.decor)

    const g8 = newRun(101)
    g8.money = 100
    check('cannot buy the expansion broke', !buildRoomOk(g8) && !buildRoom(g8) && g8.ext === 0)

    g8.money = 520
    const ev = buildRoom(g8) && drain(g8)
    check('the hammer falls: ext rises, §300 leaves, room event', g8.ext === 1 && g8.money === 220 && ev.some((e) => e.t === 'room'))
    check('every room cell is plank floor underfoot', EXT_ROOM.floor.every(([r, c]) => walkable(g8, r, c)))
    check('every wing wall blocks, windows included', EXT_ROOM.walls.every(([r, c]) => !walkable(g8, r, c)))
    check('the punched door links house side and room side', walkable(g8, EXT_ROOM.door[0], EXT_ROOM.door[1]) && walkable(g8, 4, 10) && walkable(g8, 4, 12))
    check('residents walk in and back to the gate', !!bfsPath(g8, { r: 3, c: 3 }, [{ r: 6, c: 14 }]) && !!bfsPath(g8, { r: 5, c: 13 }, [{ r: 12, c: 5 }]))

    // footprint honesty: the lawn under the future room is still lawn
    const g9 = newRun(103)
    g9.money = 9999
    g9.sel = CATALOG.findIndex((d) => d.id === 'rug')
    place(g9, 5, 13)
    check('build refused while a piece sits on the footprint', !buildRoomOk(g9) && !buildRoom(g9))
    check('selling the piece frees the footprint', sellAt(g9, 5, 13) && buildRoomOk(g9) && buildRoom(g9) && g9.ext === 1)
    const g10 = newRun(107)
    g10.money = 9999
    g10.people[0].r = 4; g10.people[0].c = 13; g10.people[0].x = tileX(13) + 16; g10.people[0].y = tileY(4) + 16
    check('build refused while a resident stands on the footprint', !buildRoomOk(g10))
    check('one expansion per lot', g9.ext === 1 && !buildRoom(g9))

    // keepsOpen inherits the new walls: once the room holds furniture, the
    // room-side door cell may not be blocked (it is the wing's only door)
    const g11 = newRun(109)
    g11.money = 9999
    buildRoom(g11)
    g11.sel = CATALOG.findIndex((d) => d.id === 'bed')
    check('furniture moves into the room over the open door', place(g11, 5, 13) && place(g11, 3, 13))
    check('blocking the room-side door cell is refused (keepsOpen sees the wing)', !place(g11, 4, 12))
    check('the room still accepts pieces elsewhere', place(g11, 3, 14))

    // the wing rides the hash
    const hA = stateHash(newRun(113))
    const g12 = newRun(113)
    g12.money = 520
    buildRoom(g12)
    check('stateHash carries the extension', stateHash(g12) !== hA)
    const g13 = newRun(113)
    g13.money = 520
    buildRoom(g13)
    check('built runs stay deterministic', stateHash(g12) === stateHash(g13))

    // source pins: the guard chain asks the ext-aware ground, not raw MAP
    const simSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    check('pin: solidAt asks groundOf (wing walls are real walls to the sim)', /function solidAt\(s, r, c\) \{[^}]*groundOf\(s, r, c\)/.test(simSrc))
    check('pin: the attract bot places by groundOf too', /function bot[\s\S]*?groundOf\(s, r, c\)/.test(simSrc))
}

section('WINNABLE (attract autopilot, several seeds)')
{
    for (const seed of [7, 42, 1234, 99, 20261023]) {
        const g = play(seed)
        check(`seed ${seed}: autopilot grants the lifetime wish`, g.done === 'win', `done=${g.done} content=${g.content} day=${g.day}`)
    }
    const h = (seed) => stateHash(play(seed))
    check('determinism: seed 7 twice -> identical final hash', h(7) === h(7))
    check('different seeds -> different trajectories', h(7) !== h(8))
}

section('POLISH (#929): distinct need SFX + red-cross alarm')
{
    const sigs = NEEDS.map((n) => `${SFX[n].type}:${SFX[n].seq.join(',')}:${SFX[n].f}`)
    check('every need has a satisfaction signature', NEEDS.every((n) => SFX[n] && SFX[n].seq.length >= 2 && SFX[n].f > 0))
    check('the five need SFX are all distinct', new Set(sigs).size === NEEDS.length, sigs.join(' | '))
    check('crunch and splash carry a noise texture', SFX.hunger.noise > 0 && SFX.bladder.noise > 0)
    check('snooze falls while giggle rises',
        SFX.energy.seq[SFX.energy.seq.length - 1] < SFX.energy.seq[0]
        && SFX.fun.seq[SFX.fun.seq.length - 1] > SFX.fun.seq[0])

    // starve one physical need past RED_AT: a redcross event fires and the gem alarms
    const g = newRun(53)
    g.demo = false
    let crossed = null
    for (let i = 0; i < 60 * 60 * 3 && !crossed; i++) {
        advance(g, DT)
        crossed = drain(g).find((e) => e.t === 'redcross') || null
    }
    check('a need crossing red raises a redcross event', !!crossed, crossed ? crossed.need : '')
    check('the crossing resident carries a gem-alarm timer', g.people.some((p) => p.alarmT > 0 || Object.values(p.wasRed).some(Boolean)))
}

// BONDS (#1817): the chat ladder — meters, levels, unlocks, fade, hash -------
section('BONDS (#1817): the chat loop deepens')
{
    check('relLevel edges 12/30/60', [0, 11, 12, 29, 30, 59, 60, 100].map(relLevel).join(',') === '0,0,1,1,2,2,3,3')
    check('ladder is ACQUAINTED to FAMILY', REL_NAMES.join('/') === 'ACQUAINTED/FRIENDLY/FRIENDS/FAMILY')
    const g14 = newRun(301)
    check('bonds start at zero (nobody is family yet)', g14.rel.house === 0 && g14.rel.fern === 0)

    // Fern-chat fills the leaf meter and crosses the first edge exactly once
    const g15 = newRun(307)
    g15.rel.fern = 11.95
    g15.demo = false
    g15.visitAfter = 99
    const o15 = g15.people[0]
    o15.r = 3; o15.c = 4; o15.x = tileX(4) + 16; o15.y = tileY(3) + 16
    g15.people[1].r = 1; g15.people[1].c = 12; g15.people[1].path = null
    g15.visitor = { name: 'Fern', r: 3, c: 5, x: tileX(5) + 16, y: tileY(3) + 16, path: null, state: 'hang', t: 0, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999 }
    const ups = []
    for (let i = 0; i < 60 * 3; i++) { o15.path = null; advance(g15, DT); ups.push(...drain(g15).filter((e) => e.t === 'rel-up')) }
    check('a Fern-chat minute fills the leaf meter', g15.rel.fern > 12, `fern=${g15.rel.fern.toFixed(2)}`)
    check('crossing an edge pays exactly one rel-up, level FRIENDLY', ups.length === 1 && ups[0].k === 'fern' && ups[0].level === 1, JSON.stringify(ups))
    check('the level-up banked its contentment bonus', g15.content >= 2)

    // household co-presence chat
    const g16 = newRun(311)
    g16.demo = false; g16.visitAfter = 99
    g16.people[0].r = 3; g16.people[0].c = 3
    g16.people[1].r = 3; g16.people[1].c = 4
    g16.people.forEach((p) => { p.path = null })
    for (let i = 0; i < 60 * 4; i++) advance(g16, DT)
    check('idle residents within reach build the heart', g16.rel.house >= 0.15, `house=${g16.rel.house.toFixed(2)}`)
    const g17 = newRun(311)
    g17.demo = false; g17.visitAfter = 99
    g17.people[1].r = 1; g17.people[1].c = 12
    g17.people.forEach((p) => { p.path = null })
    for (let i = 0; i < 60 * 4; i++) advance(g17, DT)
    check('apartment does not count as company', g17.rel.house === 0)

    // topic ladder: pool widens 4/5/7/9, family topics wait for FAMILY
    const gt = newRun(313)
    const sizes = [0, 12, 30, 60].map((v) => { gt.rel.fern = v; return chatPool(gt).length })
    check('the topic pool widens with the bond (4/5/7/9)', sizes.join(',') === '4,5,7,9', sizes.join(','))
    gt.rel.fern = 59
    const noFam = !chatPool(gt).some((l) => l.includes('potluck'))
    gt.rel.fern = 60
    check('family topics unlock exactly at FAMILY', noFam && chatPool(gt).some((l) => l.includes('potluck')))

    // Fern lingers +6 s/level and returns 1 h/level sooner — per-seed exact,
    // because a bond changes no rng draws
    let lingerOk = true, soonerOk = true
    const driveToVisit = (seed, fern0) => {
        const g = newRun(seed)
        g.rel.fern = fern0
        g.visitAfter = 7
        g.demo = false
        for (let i = 0; i < 60 * 8; i++) {
            g.people.forEach((p) => { p.path = null })
            advance(g, DT)
            if (drain(g).some((e) => e.t === 'visit')) return g
        }
        return null
    }
    const forceLeave = (g) => {
        g.visitor.state = 'leaving'; g.visitor.path = null
        for (let i = 0; i < 60 * 8; i++) { g.people.forEach((p) => { p.path = null }); advance(g, DT); if (drain(g).some((e) => e.t === 'visit-end')) return true }
        return false
    }
    for (let seed = 400; seed < 440; seed++) {
        const a = driveToVisit(seed, 0); const b = driveToVisit(seed, 100)
        if (!a || !b) { lingerOk = false; soonerOk = false; break }
        if (b.visitor.hangUntil !== a.visitor.hangUntil + 18) lingerOk = false
        // same rng draw position both runs: the scheduleVisit at Fern's departure
        const okA = forceLeave(a); const okB = forceLeave(b)
        if (!okA || !okB || b.visitAfter !== Math.max(8, a.visitAfter - 3)) soonerOk = false
    }
    check('FERN at FAMILY lingers +18 s (per-seed exact, seeds 400-439)', lingerOk)
    check('FERN at FAMILY returns 3 h sooner (floor 8, per-seed exact)', soonerOk)

    // payday toast: needs FRIENDS+, one per day
    const gt1 = newRun(317)
    gt1.rel.house = 30
    gt1.people[0].working = true
    gt1.hour = 17
    let toasts = 0
    for (let i = 0; i < 60 * 4; i++) { advance(gt1, DT); toasts += drain(gt1).filter((e) => e.id === 'toast').length }
    check('FRIENDS+ turns payday into a toast', toasts === 1, JSON.stringify(toasts))
    gt1.hour = 17
    gt1.people[1].working = true
    for (let i = 0; i < 60 * 4; i++) { advance(gt1, DT); toasts += drain(gt1).filter((e) => e.id === 'toast').length }
    check('the toast is once per payday (same day guard)', toasts === 1, JSON.stringify(toasts))
    const gt2 = newRun(317)
    gt2.rel.house = 29.9
    gt2.people[0].working = true; gt2.hour = 17
    let t2 = 0
    for (let i = 0; i < 60 * 4; i++) { advance(gt2, DT); t2 += drain(gt2).filter((e) => e.id === 'toast').length }
    check('just below FRIENDS, payday stays quiet', t2 === 0)

    // neglect cools the bond, and Fern stings faster
    const gf = newRun(319)
    gf.rel.house = 50; gf.rel.fern = 50
    gf.visitAfter = 99
    gf.people[0].working = true
    gf.people[0].r = 6; gf.people[0].c = 6; gf.people[0].path = null
    gf.people[1].r = 1; gf.people[1].c = 12; gf.people[1].path = null
    gf.demo = false
    for (let i = 0; i < 60 * 5.2; i++) advance(gf, DT)
    check('a day of neglect cools both bonds', gf.rel.house < 50 && gf.rel.fern < 50, `h=${gf.rel.house.toFixed(1)} f=${gf.rel.fern.toFixed(1)}`)
    check('absence from Fern stings faster than from home', (50 - gf.rel.fern) > (50 - gf.rel.house))

    // hash + source pins
    const h0 = stateHash(newRun(321))
    const ha = newRun(321); ha.rel.house += 1
    const hb = newRun(321); hb.rel.fern += 1
    check('either meter rides the hash', stateHash(ha) !== h0 && stateHash(hb) !== h0)
    const simSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    check('pin: the Fern-chat block feeds the leaf meter', /if \(partner\) \{[^}]*relAdd\(s, 'fern'/.test(simSrc))
    check('pin: advance drives the household bond tick', /updateVisitor\(s, simDt\)\s*\n\s*updateHouseBond\(s, simDt\)/.test(simSrc))
    check('pin: scheduleVisit answers the bond level', /function scheduleVisit\(s\)\s*\{[^}]*Math\.max\(8, 9 \+ Math\.floor\(s\.rng\(\) \* 5\) - lv\)/.test(simSrc))
    check('pin: stateHash mixes both meters', /mix\(s\.rel\.house\); mix\(s\.rel\.fern\)/.test(simSrc))

    // the autopilot actually bonds while it wins (track the max — the end-of-run
    // value may have cooled to zero), and nothing about the ladder breaks seeds
    const gw = newRun(7)
    let houseMax = 0, fernMax = 0, tt = 0
    while (!gw.done && tt < 60 * 60 * 45) { autoStep(gw, DT); drain(gw); houseMax = Math.max(houseMax, gw.rel.house); fernMax = Math.max(fernMax, gw.rel.fern); tt++ }
    check('the attract autopilot bonds on the way to the wish', gw.done === 'win' && houseMax > 0 && fernMax > 0, `done=${gw.done} houseMax=${houseMax.toFixed(1)} fernMax=${fernMax.toFixed(1)}`)
    const gr = play(7)
    check('bond-carrying runs stay deterministic (seed 7 replay)', stateHash(gr) === stateHash(gw) && gr.rel.house === gw.rel.house && gr.rel.fern === gw.rel.fern)
}

// MOVE-IN (#1814): the wing sells itself — night-lit windows + reactions ----
section('MOVE-IN (#1814): reactions, glow, honest edges')
{
    // windows ride the kit data (the bake paints them, nightTint lights them)
    check('kit carries its east-wall windows', EXT_ROOM.windows.length === 2 && EXT_ROOM.windows.every(([r, c]) => c === 15 && EXT_ROOM.walls.some(([wr, wc]) => wr === r && wc === c)))

    // reactions arm on the hammer and never fire unbuilt
    const g0 = newRun(501)
    g0.demo = false
    for (let i = 0; i < 60 * 30; i++) advance(g0, DT)
    check('an unbuilt lot never reacts', g0.roomReact === 0 && g0.people.every((p) => !p.roomSeen) && !g0.done)

    const g1 = newRun(503)
    g1.demo = false
    g1.money = 520
    buildRoom(g1)
    check('the hammer arms two move-in reactions', g1.roomReact === 2 && g1.people.every((p) => !p.roomSeen))
    const seen = []
    for (let i = 0; i < 60 * 90 && seen.length < 2; i++) { advance(g1, DT); seen.push(...drain(g1).filter((e) => e.t === 'room-see')) }
    check('both residents walk in through the doorway', seen.length === 2 && new Set(seen.map((e) => e.name)).size === 2, JSON.stringify(seen.map((e) => e.name)))
    check('the wing is emptied of its reaction ledger', g1.roomReact === 0 && g1.people.every((p) => p.roomSeen))
    check('the glance landed them inside the wing', g1.people.every((p) => EXT_ROOM.floor.some(([r, c]) => r === p.r && c === p.c) || p.working))
    check('a glance lifts the mood a notch', g1.people.some((p) => p.needs.fun > 0.8))
    const before = drain(g1).length
    for (let i = 0; i < 60 * 60; i++) advance(g1, DT)
    check('the reaction is once per resident, ever', !drain(g1).some((e) => e.t === 'room-see'), `${before}`)

    // a player interrupting the walk doesn't lose the moment — it re-offers
    const g2 = newRun(507)
    g2.demo = false
    g2.money = 520
    buildRoom(g2)
    const p2 = g2.people[0]
    for (let i = 0; i < 60 * 20; i++) { p2.path = null; p2.goal = null; advance(g2, DT); drain(g2) }
    check('interrupted glances stay pending, never fire', !p2.roomSeen && !g2.done)
    let late = null
    for (let i = 0; i < 60 * 60 && !late; i++) { advance(g2, DT); late = drain(g2).find((e) => e.t === 'room-see' && e.name === p2.name) || null }
    check('the re-offered glance completes once left alone', !!late && p2.roomSeen)

    // sealed doorway (legal while the room is empty) must not wedge anything
    const g3 = newRun(509)
    g3.demo = false
    g3.money = 9999
    buildRoom(g3)
    g3.sel = CATALOG.findIndex((d) => d.id === 'bed')
    check('a legal seal of the empty room is refused only once the room is used', place(g3, 4, 12))
    for (let i = 0; i < 60 * 30; i++) advance(g3, DT)
    check('sealed room: no crash, no false reaction, sim keeps ticking', g3.roomReact > 0 && g3.tick > 60 * 29 && !drain(g3).some((e) => e.t === 'room-see'))

    // determinism: identical scripted builds replay identically
    const twin = () => {
        const g = newRun(511)
        g.demo = false
        g.money = 520
        buildRoom(g)
        for (let i = 0; i < 60 * 40; i++) advance(g, DT)
        return stateHash(g)
    }
    check('move-in runs replay identically', twin() === twin())

    // the attract bot grows the lot so the demo sells the reflow
    const gb = newRun(7)
    let bSeen = 0, bt = 0
    while (!gb.done && bt < 60 * 60 * 45) { autoStep(gb, DT); bSeen += drain(gb).filter((e) => e.t === 'room-see').length; bt++ }
    check('attract builds the wing and its residents move in', gb.done === 'win' && gb.ext === 1 && bSeen === 2, `done=${gb.done} ext=${gb.ext} sees=${bSeen}`)

    // source pins: one window source, the glow asked for, the kit guard
    const sim2Src = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const artSrc = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const jsxSrc = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the ext bake paints windows from EXT_ROOM.windows', /for \(const \[r, c\] of EXT_ROOM\.windows\)/.test(artSrc))
    check('pin: nightTint takes the ext flag and lights the wing panes', /function nightTint\(ctx, hour, ext\)[\s\S]*if \(ext\)[\s\S]*EXT_ROOM\.windows/.test(artSrc))
    check('pin: the shell passes the live ext flag into the tint', /nightTint\(ctx, g\.hour, g\.ext\)/.test(jsxSrc))
    check('pin: the bot buys the kit only onto a clear lot', /if \(id === 'roomkit'\)[\s\S]*?!roomClear\(s\)/.test(sim2Src))
    check('pin: the hammer arms the reaction ledger', /s\.roomReact = s\.people\.length/.test(sim2Src))
}

section('FEEL — walk surfaces + refusal (#1823)')
{
    const STEP_PX = 18 // must match sim.js

    // footfalls name their ground: house → lawn corner → path head
    const g = newRun(21)
    const p = g.people[0]
    drain(g)
    const surfs = []
    let steps = 0
    const walkTo = (r, c, cap = 60 * 30) => {
        cmdWalk(g, p, r, c)
        for (let i = 0; i < cap && p.path && p.path.length; i++) {
            advance(g, DT)
            for (const e of drain(g)) if (e.t === 'step') { steps++; surfs.push(e.surf) }
        }
    }
    walkTo(0, 0)
    walkTo(10, 5)
    check('walks ring like footsteps', steps >= 4, `steps=${steps}`)
    check('every footfall names real ground', surfs.every((x) => ['grass', 'path', 'floor'].includes(x)), surfs.join(','))
    check('lawn, gravel and plank all get heard', ['grass', 'path', 'floor'].every((x) => surfs.includes(x)), surfs.join(','))
    check('the garden stand pays lawn', surfs[0] === 'floor' && surfs.slice(-6).includes('grass'), surfs.join(','))

    // cadence: stick-walking ~35 px pays ~2 footfalls, never a machine-gun
    p.stepDist = 0; drain(g)
    const x0 = p.x, y0 = p.y
    let n = 0
    for (let i = 0; i < 40; i++) { manualMove(g, p, 0, -1, DT); for (const e of drain(g)) if (e.t === 'step') n++ }
    const moved = Math.abs(p.x - x0) + Math.abs(p.y - y0)
    check('cadence: one footfall per ~18px', n >= 1 && n >= moved / STEP_PX - 1.2 && n <= moved / STEP_PX + 0.2, `n=${n} moved=${moved.toFixed(0)}px`)

    // standing still makes no sound (hold Fern back — her footfalls are honest)
    g.visitAfter = 99; g.visitor = null
    drain(g)
    for (let i = 0; i < 60; i++) advance(g, DT)
    check('standing still makes no sound', !drain(g).some((e) => e.t === 'step'))

    // the wing's planks speak floor: walk a resident into the built wing
    const g2 = newRun(9)
    g2.money = 520
    buildRoom(g2); drain(g2)
    const p2 = g2.people[0]
    const s2 = []
    cmdWalk(g2, p2, 5, 13)
    for (let i = 0; i < 60 * 30 && p2.path && p2.path.length; i++) {
        advance(g2, DT)
        for (const e of drain(g2)) if (e.t === 'step') s2.push(e.surf)
    }
    check('the wing walk is planks end to end', s2.length >= 2 && s2.every((x) => x === 'floor') && s2[s2.length - 1] === 'floor', s2.join(','))
    check('the plank floor answers the last steps', p2.r === 5 && p2.c === 13 && s2[s2.length - 1] === 'floor', s2.join(','))

    // refusals name their cell — broke, into a wall, sealing the wing, twice-built
    const g3 = newRun(5)
    g3.sel = CATALOG.findIndex((d) => d.id === 'bed')
    g3.money = 0
    drain(g3)
    check('a broke order is refused', !place(g3, 10, 2))
    const rv = drain(g3)
    check('the refusal names the cell', rv.filter((e) => e.t === 'refuse').length === 1 && rv[0].r === 10 && rv[0].c === 2, JSON.stringify(rv))
    g3.money = 500
    drain(g3)
    check('a wall cell is refused at the wall', !place(g3, 1, 1) && drain(g3).some((e) => e.t === 'refuse' && e.r === 1 && e.c === 1))
    drain(g3)
    const okEv = (() => { const r = place(g3, 10, 2); const ev = drain(g3); return r && ev.some((e) => e.t === 'place') && !ev.some((e) => e.t === 'refuse') })()
    check('a legal buy lands with no refusal', okEv)

    const g4 = newRun(11)
    g4.money = 520
    buildRoom(g4); drain(g4)
    g4.sel = CATALOG.findIndex((d) => d.id === 'plant')
    check('the wing gets a piece', place(g4, 3, 13) && drain(g4).some((e) => e.t === 'place'))
    g4.sel = CATALOG.findIndex((d) => d.id === 'bed')
    check('sealing the wing door is refused at the door', !place(g4, 4, 11) && drain(g4).some((e) => e.t === 'refuse' && e.r === 4 && e.c === 11))

    const g5 = newRun(3)
    g5.sel = CATALOG.findIndex((d) => d.id === 'roomkit')
    g5.money = 100
    drain(g5)
    check('a broke kit refusal points at the lot edge', !place(g5, 0, 0) && drain(g5).some((e) => e.t === 'refuse' && e.r === EXT_ROOM.door[0] && e.c === EXT_ROOM.door[1]))
    g5.money = 520
    check('the kit builds once', place(g5, 0, 0) && drain(g5).some((e) => e.t === 'room'))
    check('a second kit is refused too', !place(g5, 0, 0) && drain(g5).some((e) => e.t === 'refuse'))

    // source pins: the events exist at the choke points the view depends on
    const feelSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const feelJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: footfalls carry their surface', /t: 'step', surf: groundOf\(s, p\.r, p\.c\)/.test(feelSim))
    check('pin: both walk routes feed the footfall meter', /footstep\(s, p, budget - step\)/.test(feelSim) && /footstep\(s, p, Math\.abs\(p\.x - ox\)/.test(feelSim))
    check('pin: every refusal branch emits its event', (feelSim.match(/t: 'refuse'/g) || []).length === 3)
    check('pin: the shell plays three distinct step timbres', /e\.surf === 'floor'[\s\S]*e\.surf === 'path'/.test(feelJsx))
    check('pin: the refusal flashes a red ghost cell', /refuses\.push\(\{ r: e\.r, c: e\.c/.test(feelJsx) && /fillStyle = '#e23b2e'/.test(feelJsx))
}

console.log(`\n=== peoplecheck: ${pass} pass, ${fail} fail ===`)
if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
