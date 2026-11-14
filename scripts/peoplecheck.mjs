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
//   5. FEEL      — #1823: walking footfalls name their ground (plank/gravel/
//                  lawn), refusal events name their cell, and views are pinned.
//   6. COURT     — #2131: player-ordered romance — coo/affection/insult on the
//                  chat ring, the FAMILY-tier deepening, the shared cooldown
//                  economy, grudge-on-command with the human exit intact.
//   6b. THUMB COURT — #2171: the pad has no third button, so the court rides
//                  press-DURATION on A/Space: release inside HOLD_INSULT_MS is
//                  the coo, holding past it hurls the insult mid-hold — world-ms
//                  clock, one command per cooldown unchanged.
//   7. SECOND VISITOR — #2143: Ivy, the market neighbour — her own schedule
//                  window, rel.ivy ladder (growth, one-rel-up law, fade and
//                  demote), the FRIENDS+/FAMILY gift economy, linger/return
//                  ladder math, court + roomClear + hash carries, determinism.
//   8. PET (#2197) — Miso, the adoptable cat: counter law (price, one cat,
//                  honest refusal at the gate), legal wandering, self-served
//                  kibble, night sleep with energy payback, the coo law with
//                  its cooldown, hash carries, attract-bot adoption, and the
//                  wish still landing with a cat on the lot.
//
// It proves IT can fail the playbook way: break one load-bearing line in sim.js
// (content accrual in finishUse, or the relAdd(s,'fern') feed in the visitor
// chat block, or the relAdd(s,'ivy') feed in Ivy's chat block) and the matching
// sections go red; restore.
//
// Run: node scripts/peoplecheck.mjs

import {
    FIXED_DT, W, H, COLS, ROWS, MAP, TILE, WIN_CONTENT, NEEDS,
    CATALOG, DEF, tileOf, tileX, tileY, SFX, RED_AT, EXT_ROOM,
    REL_NAMES, relLevel, chatPool,
    SPAT_DROP, SPAT_SOCIAL, SPAT_CD, MAKEUP_BOND, moodOf, avg,
    COOL_LINES, HOUSE_LINES, GRUDGE_FIRST_CD, GRUDGE_COOL_CD,   // #2135: the cooling beat
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, sellAt, targetsOf, walkable, bfsPath, stateHash, buildRoom, buildRoomOk,
    manualMove,
    court, courtTarget, COO_BOND, AFFECTION_BOND, INSULT_DROP, CMD_CD, REL_EDGES,   // #2131
    courtHoldArm, courtTick, courtTap, HOLD_INSULT_MS,   // #2171: thumb court
    ivyChatPool, IVY_CHAT, IVY_FADE, IVY_GIFT_HUNGER, IVY_GIFT_CASH,   // #2143
    adoptPet, adoptOk, PET, PET_COOS,   // #2197: Miso
    adoptKid, adoptKidOk, KID,   // #2203: Pip
    CAT_TABS, TAB_CARDS, TAB_OF, tabCards, setSel, flipTab, selectTab, digitCard,   // #2222: catalog shelves
    SPEED_MULT, SPEED_NAMES, setSpeed, cycleSpeed, attractSpeed,   // #2227: the speed dial
    TRI_TELL_CD, TRI_LINES, IVY_SOCIAL,   // #2154: visitor choreography law
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
    check('sixteen catalog pieces with prices; Spare Room card 14 keyed R, Adopt a Cat card 15 keyed P, Adopt a Child card 16 keyed K', CATALOG.length === 16 && CATALOG.every((d) => d.price > 0) && CATALOG[13].id === 'roomkit' && CATALOG.filter((d) => d.room).length === 1 && CATALOG[14].id === 'petkit' && CATALOG.filter((d) => d.pet).length === 1 && CATALOG[15].id === 'kidkit' && CATALOG.filter((d) => d.kid).length === 1)   // #2197/#2203
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
    check('pin: advance drives the household bond tick', /updateVisitor\(s, simDt\)\s*\n\s*updateIvy\(s, simDt\)\s*\n\s*updatePet\(s, simDt\)\s*\n\s*updateKid\(s, simDt\)\s*\n\s*updateHouseBond\(s, simDt\)/.test(simSrc))   // #2143/#2197/#2203: the chain is five deep — Ivy ticks between the neighbours, the cat between Ivy and the child, the child between the cat and the hearth

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
    check('pin: every refusal branch emits its event', (feelSim.match(/t: 'refuse'/g) || []).length === 5)   // #2197/#2203: the two adoption counters make the fifth door that answers
    check('pin: the shell plays three distinct step timbres', /e\.surf === 'floor'[\s\S]*e\.surf === 'path'/.test(feelJsx))
    check('pin: the refusal flashes a red ghost cell', /refuses\.push\(\{ r: e\.r, c: e\.c/.test(feelJsx) && /fillStyle = '#e23b2e'/.test(feelJsx))
}

// SPATS & MAKE-UPS (#2070): the bond can break — and thaw -----------------
section('SPATS (#2070): quarrels, cold war, make-up')
{
    const FOUL = 0.30    // avg under 0.4 → moodOf 0 (temper down)
    const SWEET = 0.90   // avg over 0.7 → moodOf 2 (tempers up)
    const MID = 0.55     // neither foul nor sweet
    // park both residents idle beside each other at chosen need levels
    const park = (g, lvA, lvB) => {
        g.demo = false; g.visitAfter = 99
        const [a, b] = g.people
        a.r = 3; a.c = 3; a.path = null
        b.r = 3; b.c = 4; b.path = null
        for (const n of NEEDS) {
            if (lvA !== null) a.needs[n] = lvA
            if (lvB !== null) b.needs[n] = lvB
        }
        return g
    }

    // the trigger: idle, adjacent, both in the red — one hard spat
    const g1 = park(newRun(501), FOUL, FOUL)
    g1.rel.house = 50
    const h0 = g1.rel.house
    let evs = []
    for (let i = 0; i < 60; i++) { advance(g1, DT); evs.push(...drain(g1)) }
    const [pa, pb] = g1.people
    check('an idle pair in the red spats once', evs.filter((e) => e.t === 'spat').length === 1 && g1.spats === 1, JSON.stringify(evs.map((e) => e.t)))
    check('the spat docks exactly SPAT_DROP from the heart', h0 - g1.rel.house === SPAT_DROP, `house=${g1.rel.house.toFixed(2)}`)
    check('both residents eat the social sting', Math.abs(pa.needs.social - (FOUL - SPAT_SOCIAL)) < 1e-9 && Math.abs(pb.needs.social - (FOUL - SPAT_SOCIAL)) < 1e-9)
    check('the grudge sets — the house goes cold', g1.grudge === 1)

    // cold war: same reach, nothing builds, only absence cools
    park(g1, MID, MID)   // tempers neutral — no make-up, no climb
    const h1 = g1.rel.house
    const sa1 = pa.needs.social
    evs = []
    for (let i = 0; i < 60; i++) { advance(g1, DT); evs.push(...drain(g1)) }
    check('cold war: company builds nothing while the grudge holds', g1.rel.house <= h1 && Math.abs(pa.needs.social - sa1) < 1e-9 && !evs.some((e) => e.t === 'rel-up'), `house=${g1.rel.house.toFixed(2)}`)

    // the make-up: same reach, tempers both up — the lump back, once
    park(g1, SWEET, SWEET)
    const h2 = g1.rel.house
    const c2 = g1.content
    evs = []
    // stop the clock the tick the thaw lands — the ordinary climb resumes after
    for (let i = 0; i < 120 && !evs.some((e) => e.t === 'makeup'); i++) { advance(g1, DT); evs.push(...drain(g1)) }
    check('tempers up in reach — the pair makes up', evs.filter((e) => e.t === 'makeup').length === 1 && g1.grudge === 0)
    check('the make-up repays MAKEUP_BOND and banks one content', Math.abs(g1.rel.house - (h2 + MAKEUP_BOND)) < 1e-9 && g1.content === c2 + 1, `house=${g1.rel.house.toFixed(2)}`)
    park(g1, SWEET, SWEET)
    evs = []
    for (let i = 0; i < 60; i++) { advance(g1, DT); evs.push(...drain(g1)) }
    check('one make-up per spat — the thaw does not repeat', !evs.some((e) => e.t === 'makeup'))
    check('after the thaw the hearth climbs again', g1.rel.house > h2 + MAKEUP_BOND)

    // no make-up without a grudge (content must not farm on happy idling)
    const g2 = park(newRun(503), SWEET, SWEET)
    evs = []
    for (let i = 0; i < 120; i++) { advance(g2, DT); evs.push(...drain(g2)) }
    check('happy idling never “makes up” what was never broken', !evs.some((e) => e.t === 'makeup') && g2.spats === 0)

    // trigger gating: apart stays quiet; one sweet temper stays quiet;
    // a worker stays quiet — the original needs BOTH present and miserable
    const g3 = park(newRun(505), FOUL, FOUL)
    g3.people[1].r = 1; g3.people[1].c = 12
    evs = []
    for (let i = 0; i < 240; i++) { advance(g3, DT); evs.push(...drain(g3)) }
    check('foul AND apart does not start a quarrel', !evs.some((e) => e.t === 'spat') && g3.rel.house === 0)
    const g4 = park(newRun(507), FOUL, SWEET)
    evs = []
    for (let i = 0; i < 240; i++) { advance(g4, DT); evs.push(...drain(g4)) }
    check('one sweet temper talks the other down — no spat', !evs.some((e) => e.t === 'spat') && g4.rel.house > 0)
    const g5 = park(newRun(509), FOUL, FOUL)
    g5.people[1].working = true
    evs = []
    for (let i = 0; i < 240; i++) { advance(g5, DT); evs.push(...drain(g5)) }
    check('an argument needs both at home — a worker is no company', !evs.some((e) => e.t === 'spat'))

    // demotion is a visible moment; a mid-level drop stays silent
    const g6 = park(newRun(511), FOUL, FOUL)
    g6.rel.house = 13   // FRIENDLY — one drop below the edge
    evs = []
    for (let i = 0; i < 60; i++) { advance(g6, DT); evs.push(...drain(g6)) }
    const downs = evs.filter((e) => e.t === 'rel-down')
    check('falling below an edge fires rel-down with the new level', downs.length === 1 && downs[0].k === 'house' && downs[0].level === 0, JSON.stringify(downs))
    check('a FRIENDS-to-FRIENDLY fall lands exactly at the edge, minus eight', g6.rel.house === 13 - SPAT_DROP, `house=${g6.rel.house.toFixed(2)}`)
    const g6b = park(newRun(519), FOUL, FOUL)
    g6b.rel.house = 3   // barely above ACQUAINTED — the drop floors at zero
    evs = []
    for (let i = 0; i < 60; i++) { advance(g6b, DT); evs.push(...drain(g6b)) }
    check('ACQUAINTED floors at zero — a broken bond is not negative', g6b.rel.house === 0 && evs.some((e) => e.t === 'spat') && !evs.some((e) => e.t === 'rel-down'))
    const g7 = park(newRun(513), FOUL, FOUL)
    g7.rel.house = 50   // mid-FRIENDLY drop stays inside the level
    evs = []
    for (let i = 0; i < 60; i++) { advance(g7, DT); evs.push(...drain(g7)) }
    check('a drop inside a level demotes nothing', !evs.some((e) => e.t === 'rel-down') && g7.rel.house === 50 - SPAT_DROP)

    // cooldown: even with the grudge cleared by hand, the window stays hot.
    // Needs are refreshed every tick — a 40 s window spans hours, and if the
    // pair starved into a faint they'd stop being idle (and stop fighting).
    const holdFoul = (g, sec) => {
        const out = []
        for (let i = 0; i < Math.round(sec / DT); i++) {
            for (const p of g.people) { for (const n of NEEDS) p.needs[n] = FOUL; p.path = null }
            advance(g, DT); out.push(...drain(g))
        }
        return out
    }
    const g8 = park(newRun(515), FOUL, FOUL)
    g8.rel.house = 50
    evs = []
    for (let i = 0; i < 60; i++) { advance(g8, DT); evs.push(...drain(g8)) }
    g8.grudge = 0   // harness pokes the state; the clock must still gate
    evs = holdFoul(g8, SPAT_CD - 5)
    check('the spat window holds — no second round at once', g8.spats === 1 && !evs.some((e) => e.t === 'spat'))
    g8.grudge = 0
    evs = holdFoul(g8, 7)
    check('when the window expires, a miserable house does crack again', g8.spats === 2 && evs.some((e) => e.t === 'spat'))

    // hash + determinism
    const hb = newRun(517)
    const ha1 = newRun(517); ha1.spats = 1
    const ha2 = newRun(517); ha2.grudge = 1
    check('spats and grudge ride the hash', stateHash(ha1) !== stateHash(hb) && stateHash(ha2) !== stateHash(hb))
    check('seed 7 replays identical with the spat law live', stateHash(play(7)) === stateHash(play(7)))

    // source pins: the view's choke points
    const spatSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const spatJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const spatArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: the law sits in the co-presence tick', /function updateHouseBond[\s\S]*t: 'spat'[\s\S]*t: 'makeup'/.test(spatSim))
    check('pin: the shell tells spat, thaw and demotion', /case 'spat'/.test(spatJsx) && /case 'makeup'/.test(spatJsx) && /case 'rel-down'/.test(spatJsx))
    check('pin: the panel heart runs ash-dark on the grudge', /s\.grudge \? '#8c3b34' : '#e2574c'/.test(spatArt))
}

// SPAT TELL & FADE DEMOTION (#2076): the lot shows the quarrel, and the
// hourly neglect fade crosses edges through the SAME rel-down event a spat
// uses — two routes down, ONE tell. --------------------------
section('TELL & FADE (#2076): sprite tell timer, neglect demotes loudly')
{
    const FOUL = 0.30
    const park = (g, lvA, lvB) => {
        g.demo = false; g.visitAfter = 99
        const [a, b] = g.people
        a.r = 3; a.c = 3; a.path = null
        b.r = 3; b.c = 4; b.path = null
        for (const n of NEEDS) {
            if (lvA !== null) a.needs[n] = lvA
            if (lvB !== null) b.needs[n] = lvB
        }
        return g
    }
    const apart = (g, lv) => {
        park(g, lv, lv)
        g.people[1].r = 1; g.people[1].c = 12   // no co-presence — fade alone
        g.people[1].x = tileX(12) + 16; g.people[1].y = tileY(1) + 16
        return g
    }

    // the sprite tell rides the sim clock and fades on its own
    check('a fresh run carries no spat tell', newRun(531).spatFx === 0)
    const g9 = park(newRun(531), FOUL, FOUL)
    g9.rel.house = 50
    let evs = []
    for (let i = 0; i < 60 && !(g9.spats === 1); i++) { advance(g9, DT); evs.push(...drain(g9)) }
    check('the spat arms the sprite tell (#2076)', evs.some((e) => e.t === 'spat') && g9.spatFx > 0, `spatFx=${g9.spatFx.toFixed(1)}`)
    for (let i = 0; i < Math.round(3 / DT); i++) { advance(g9, DT); evs.push(...drain(g9)) }
    check('the tell fades while the cold war still holds', g9.spatFx === 0 && g9.grudge === 1, `spatFx=${g9.spatFx}`)

    // neglect fade demotions (#2076): a bond sinking past an edge from absence
    // alone fires rel-down — one event per crossing, not per hour.
    const g10 = apart(newRun(533), 0.75)
    g10.rel.house = 12.01   // a hair over FRIENDLY — one hour's fade crosses it
    g10.rel.fern = 30.01    // a hair over FRIENDS for Fern — same crossing
    evs = []
    for (let i = 0; i < 340; i++) { advance(g10, DT); evs.push(...drain(g10)) }   // ~1 sim hour
    const downs = evs.filter((e) => e.t === 'rel-down')
    check('absence across an edge fires rel-down for the house', downs.some((e) => e.k === 'house' && e.level === 0), JSON.stringify(downs.map((e) => `${e.k}@${e.level}`)))
    check('absence across an edge fires rel-down for Fern', downs.some((e) => e.k === 'fern' && e.level === 1), JSON.stringify(downs.map((e) => `${e.k}@${e.level}`)))
    check('the fade lands right under the edge it crossed', Math.abs(g10.rel.house - (12.01 - 0.02)) < 1e-9 && Math.abs(g10.rel.fern - (30.01 - 0.035)) < 1e-9, `house=${g10.rel.house.toFixed(3)} fern=${g10.rel.fern.toFixed(3)}`)

    // one event per CROSSING, not per hour: mid-level fade runs silent
    const g11 = apart(newRun(535), 0.75)
    g11.rel.house = 50; g11.rel.fern = 50
    evs = []
    for (let i = 0; i < 3 * 300 + 40; i++) { advance(g11, DT); evs.push(...drain(g11)) }   // 3 sim hours
    check('hours of mid-level fade stay silent — one tell per crossing', !evs.some((e) => e.t === 'rel-down') && Math.abs(g11.rel.house - (50 - 3 * 0.02)) < 1e-9, `house=${g11.rel.house.toFixed(3)}`)

    // the zero floor stays quiet: faded-to-nothing bonds emit no repeat demotion
    const g12 = apart(newRun(537), 0.75)
    g12.rel.house = 0; g12.rel.fern = 0
    evs = []
    for (let i = 0; i < 3 * 300 + 40; i++) { advance(g12, DT); evs.push(...drain(g12)) }
    check('a fully cooled bond fades silent at zero', !evs.some((e) => e.t === 'rel-down') && g12.rel.house === 0 && g12.rel.fern === 0)

    // determinism: the same seed replays identical with the new law live
    check('seed 9 replays identical with the tell law live', stateHash(play(9)) === stateHash(play(9)))

    // source pins: the view's choke points for the polish
    const polSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const polJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const polArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: the hourly fade rides relSub', /function applyHourAt[\s\S]*relSub\(s, 'house', 0\.02\)[\s\S]*relSub\(s, 'fern', 0\.035\)/.test(polSim))
    check('pin: the spat arms the sprite tell', /s\.spatFx = 2\.4/.test(polSim))
    check('pin: the art draws both the storm puff and the cold-war lean', /fx === 'spat'/.test(polArt) && /fx === 'cold'/.test(polArt))
    check('pin: the make-up pays hearts, not generic sparkles', /kind: 'heart'/.test(polJsx) && /case 'makeup'[\s\S]*heartBurst\(e\.x/.test(polJsx))
    check('pin: the attract teaches that bonds can break', /SPAT cracks BONDS/.test(polJsx))
}

// ---------------------------------------------------------------- COURT (#2131)
// Player-ordered romance: the bond law gets a handle. C coo (Space/A rides the
// compliment where no object is near), X insult. The pair stands within the
// chat ring; commands pay/cut the RIGHT bond, share one cooldown, and the
// #2070 make-up stays the only mending.
section('COURT')
{
    const pair = (g) => { g.people[0].r = 3; g.people[0].c = 3; g.people[1].r = 3; g.people[1].c = 4; g.people[0].path = null; g.people[1].path = null; g.spatCd = 0; g.grudge = 0; g.cmdCd = 0; return g }
    const noOne = newRun(31)
    check('no one within arm\'s reach — both commands refuse, nothing moves',
        court(noOne, 'coo') === null && court(noOne, 'insult') === null && courtTarget(noOne) === null && noOne.rel.house === 0 && noOne.cmdCd === 0)

    const g1 = pair(newRun(33))
    const evs = []
    const r1 = court(g1, 'coo')
    evs.push(...drain(g1))
    check('a coo pays COO_BOND on the household bond and sets the cooldown',
        !!r1 && !r1.deep && Math.abs(g1.rel.house - COO_BOND) < 1e-9 && g1.cmdCd === CMD_CD && evs.some((e) => e.t === 'coo' && e.k === 'house'))
    check('both sides of the pair get the social lift', g1.people[0].needs.social > 0.3 && g1.people[1].needs.social > 0.3)
    check('a second command inside the cooldown refuses — even the kind ones',
        court(g1, 'coo') === null && court(g1, 'insult') === null && Math.abs(g1.rel.house - COO_BOND) < 1e-9)
    for (let i = 0; i < Math.round((CMD_CD + 0.1) / DT); i++) advance(g1, DT)
    g1.people[0].r = 3; g1.people[0].c = 3; g1.people[1].r = 3; g1.people[1].c = 4   // they may have idled apart — this gate is about the cooldown, not the walk
    check('the cooldown runs on the real clock and releases', g1.cmdCd === 0 && !!court(g1, 'coo'))

    // tier gate: the FAMILY edge (60) is the exact deepening point
    const g2 = pair(newRun(35))
    g2.rel.house = REL_EDGES[2] - 0.01
    const r2 = court(g2, 'coo')
    check('just below FAMILY it is still only a compliment', !!r2 && !r2.deep && Math.abs(g2.rel.house - (REL_EDGES[2] - 0.01 + COO_BOND)) < 1e-9)
    g2.cmdCd = 0; g2.rel.house = REL_EDGES[2]
    const r3 = court(g2, 'coo')
    check('at FAMILY the compliment deepens into affection (double pay, its own event)',
        !!r3 && r3.deep && Math.abs(g2.rel.house - (REL_EDGES[2] + AFFECTION_BOND)) < 1e-9 && drain(g2).some((e) => e.t === 'affection'))

    // insult cuts and starts the cold war on command
    const g3 = pair(newRun(37))
    g3.rel.house = 20
    const i1 = court(g3, 'insult')
    check('an insult cuts INSULT_DROP and sets the grudge',
        !!i1 && Math.abs(g3.rel.house - (20 - INSULT_DROP)) < 1e-9 && g3.grudge === 1 && drain(g3).some((e) => e.t === 'insult'))
    g3.cmdCd = 0
    g3.rel.house = 2
    court(g3, 'insult')
    check('the bond cannot be driven below zero by spam of cruelty', g3.rel.house === 0 && g3.grudge === 1)
    // the human exit still works after a COMMANDED spat
    for (const p of g3.people) { for (const n of NEEDS) p.needs[n] = 0.9; p.working = false; p.path = null; p.use = null; p.goal = null; p.faintT = 0 }
    for (let i = 0; i < Math.round(1 / DT); i++) { advance(g3, DT); g3.people.forEach((p) => { p.working = false; p.path = null; p.use = null; p.goal = null }) }
    check('a commanded cold war still mends the human way (reach + both tempers up)',
        g3.grudge === 0 && g3.rel.house >= MAKEUP_BOND - 1e-9 && drain(g3).some((e) => e.t === 'makeup'))

    // Fern is company too — and the nearer person takes the address
    const g4 = pair(newRun(39))
    g4.visitor = { name: 'Fern', r: 3, c: 5, x: 0, y: 0, path: null, state: 'hang', t: 5 }
    const r4 = court(g4, 'coo')
    check('the address goes to the NEAREST person (partner at 1 beats Fern at 2)', !!r4 && r4.k === 'house' && drain(g4).some((e) => e.k === 'house'))
    g4.cmdCd = 0; g4.people[1].r = 9; g4.people[1].c = 9
    const r5 = court(g4, 'coo')
    check('with the partner away, Fern takes the compliment on the leaf meter',
        !!r5 && r5.k === 'fern' && Math.abs(g4.rel.fern - COO_BOND) < 1e-9 && drain(g4).some((e) => e.t === 'coo' && e.k === 'fern'))
    g4.cmdCd = 0
    const i2 = court(g4, 'insult')
    check('an insult to Fern cuts the leaf (zero floor) and leaves the household grudge alone',
        !!i2 && i2.k === 'fern' && g4.grudge === 0 && g4.rel.fern === 0 && drain(g4).some((e) => e.t === 'insult' && e.k === 'fern'))

    // faint guards: nobody addresses the dead-and-gone, and fainting can't speak
    const g5 = pair(newRun(41))
    g5.people[1].faintT = 5
    check('a fainted partner is not company', courtTarget(g5) === null && court(g5, 'coo') === null)
    g5.people[1].faintT = 0; g5.people[0].faintT = 5
    check('a fainted resident cannot command the household', courtTarget(g5) === null && court(g5, 'coo') === null)

    // the economy law: one command per CMD_CD window, however frantic the thumb
    const g6 = pair(newRun(43))
    let landed = 0
    for (let i = 0; i < Math.round(25 / DT); i++) {
        const r = court(g6, 'coo'); if (r) landed++
        advance(g6, DT)
        g6.people[0].path = null; g6.people[1].path = null
    }
    check('spam cannot flatten the meter — at most one command per cooldown window in 25 s',
        landed === Math.ceil(25 / CMD_CD), `landed=${landed} expected=${Math.ceil(25 / CMD_CD)}`)

    // hash: the cooldown rides determinism
    const script = () => { const g = pair(newRun(45)); court(g, 'coo'); for (let i = 0; i < Math.round(20 / DT); i++) advance(g, DT); return stateHash(g) }
    check('scripted court run is seed-exact', script() === script())
    const gH1 = pair(newRun(47)); court(gH1, 'coo')
    const gH2 = pair(newRun(47))
    check('the cooldown state rides the hash (a fresh command differs from the same run cooling)',
        stateHash(gH1) !== stateHash(gH2))

    // source pins: the handle wiring must not silently drop
    const ctSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const ctJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: both commands arm the cooldown', (ctSim.match(/s\.cmdCd = CMD_CD/g) || []).length === 2)
    check('pin: the empty press rides the compliment (Space/A), objects still win (#2171: the press arms, the release pays)',
        /else if \(!tryUse\(gs, p\)\)[\s\S]*courtHoldArm\(gs\)/.test(ctJsx) && /courtTap\(gs\)/.test(ctJsx))
    check('pin: C/X are real keys, not stray ones', /COURT_KEYS = new Set\(\['KeyC', 'KeyX'\]\)/.test(ctJsx) && /KeyC'\s*\?\s*'coo'\s*:\s*'insult'/.test(ctJsx))
    check('pin: affection pays its own chord and hearts, insult its own sour fall',
        /case 'affection'/.test(ctJsx) && /case 'insult'/.test(ctJsx) && /AFFECTION ♥ FAMILY/.test(ctJsx))
    check('pin: the warm tell lifts off the pair', /g\.cooFx > 0 && g\.cooAt/.test(ctJsx) && /s\.cooAt = \{ x: mx, y: my \}/.test(ctSim))
}

section('THUMB COURT')   // #2171 — one pad button, two orders: tap = coo, hold past HOLD_INSULT_MS = insult
{
    const pair = (g) => { g.people[0].r = 3; g.people[0].c = 3; g.people[1].r = 3; g.people[1].c = 4; g.people[0].path = null; g.people[1].path = null; g.spatCd = 0; g.grudge = 0; g.cmdCd = 0; g.holdT = -1; return g }
    const holdOver = (g) => { let r = null; while (!r && g.holdT >= 0) r = courtTick(g, FIXED_DT); return r }

    const t0 = pair(newRun(71))
    const alone = newRun(72)
    check('nobody in reach — the press cannot arm the heat, and a bare release stays quiet',
        courtHoldArm(alone) === false && alone.holdT === -1 && courtTap(alone) === null && courtTick(alone, FIXED_DT) === null)
    check('a fresh run holds no pending word', t0.holdT === -1 && courtTap(t0) === null)

    const g1 = pair(newRun(73))
    g1.rel.house = 20
    check('the press finds the person and starts the clock cold', courtHoldArm(g1) === true && g1.holdT === 0)
    const r1 = courtTap(g1)
    check('release inside the window lands the coo exactly as C did, and disarms',
        !!r1 && r1.fired === 'coo' && Math.abs(g1.rel.house - (20 + COO_BOND)) < 1e-9 && g1.cmdCd === CMD_CD && g1.holdT === -1 && drain(g1).some((e) => e.t === 'coo' && e.k === 'house'))
    check('the release after a landed coo is quiet (a tap pays once)', courtTap(g1) === null && Math.abs(g1.rel.house - (20 + COO_BOND)) < 1e-9)

    const g2 = pair(newRun(74))
    g2.rel.house = 20
    courtHoldArm(g2)
    const r2 = holdOver(g2)
    check('held past the window the insult flies MID-hold — cut, grudge, its own event',
        !!r2 && r2.fired === 'insult' && Math.abs(g2.rel.house - (20 - INSULT_DROP)) < 1e-9 && g2.grudge === 1 && g2.cmdCd === CMD_CD && drain(g2).some((e) => e.t === 'insult' && e.k === 'house'))
    check('…and the release that follows hurls nothing twice (no coo piled on the cruelty)',
        courtTap(g2) === null && courtTick(g2, FIXED_DT) === null && Math.abs(g2.rel.house - (20 - INSULT_DROP)) < 1e-9)

    const g3 = pair(newRun(75))
    g3.rel.house = 20
    courtHoldArm(g3)
    let short = 0
    while (g3.holdT < HOLD_INSULT_MS - FIXED_DT) { courtTick(g3, FIXED_DT); short++ }
    check('one step short of the window it is still kind — nothing has fired',
        courtTap(g3) && courtTap(g3) === null && g3.rel.house === 20 + COO_BOND && g3.grudge === 0 && short * FIXED_DT < HOLD_INSULT_MS)

    const g4 = pair(newRun(76))
    g4.rel.house = 20
    court(g4, 'coo')                                   // the shared cooldown is still the economy
    courtHoldArm(g4)
    const r4 = holdOver(g4)
    check('inside the cooldown the cruel word refuses (NOT SO FAST) and spends nothing',
        !!r4 && r4.refused === true && g4.rel.house === 20 + COO_BOND && g4.grudge === 0 && g4.holdT === -1)

    const g5 = pair(newRun(77))
    let landed = 0, refused = 0
    for (let i = 0; i < Math.round(25 / DT); i++) {
        g5.people[0].r = 3; g5.people[0].c = 3; g5.people[1].r = 3; g5.people[1].c = 4   // hold the aim through the walk
        if (g5.holdT < 0) courtHoldArm(g5)
        const r = courtTick(g5, FIXED_DT)
        if (r && r.fired === 'insult') landed++
        if (r && r.refused) refused++
        // the word spends the hold at the threshold (fired or refused) — the
        // next iteration's re-arm is the thumb pressing angry again
        g5.people[0].path = null; g5.people[1].path = null
        advance(g5, DT)
    }
    check('endless angry thumbs cannot outrun the economy — at most one order per cooldown window, and refusals prove it',
        landed > 0 && landed <= Math.ceil(25 / CMD_CD) && refused > 0 && g5.rel.house >= 0, `landed=${landed} ceiling=${Math.ceil(25 / CMD_CD)} refused=${refused}`)

    const script = () => {
        const g = pair(newRun(78)); courtHoldArm(g)
        for (let i = 0; i < Math.round(1 / DT); i++) { courtTick(g, FIXED_DT); advance(g, DT) }
        courtTap(g)
        for (let i = 0; i < Math.round(20 / DT); i++) advance(g, DT)
        return stateHash(g)
    }
    const scriptIdle = () => { const g = pair(newRun(78)); for (let i = 0; i < Math.round(21 / DT); i++) advance(g, DT); return stateHash(g) }
    check('the thumb-court run is seed-exact, and a pressed thumb weighs differently than an idle one',
        script() === script() && script() !== scriptIdle())

    const tbSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const tbJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the window is ONE number, and it is the hold law in the sim', /HOLD_INSULT_MS = 600/.test(tbSim))
    check('pin: the clock feeds every live step, whichever seat drives', /courtTick\(gs, SIM_MS\)/.test(tbJsx))
    check('pin: the release lands only in play — paused, attract and death stay quiet',
        /ACTION_KEYS\.has\(e\.code\)[\s\S]{0,120}screenRef\.current === 'play' && !pausedRef\.current && !gs\.done/.test(tbJsx) && /courtTap\(gs\)/.test(tbJsx))
    check('pin: the heat tell paints only while armed, in the refuse-red', /live && g\.holdT >= 0/.test(tbJsx) && /'#e23b2e'/.test(tbJsx))
    check('pin: the pad contract is untouched — still A=Space and the one ⚒ secondAction', /secondAction=\{\{ label: '⚒', code: 'KeyB' \}\}/.test(tbJsx))
    check('pin: the hold rides the hash like every other live state', /mix\(s\.holdT\)/.test(tbSim))
}

section('SECOND VISITOR')   // #2143 — Ivy, the market neighbour
{
    const hangIvy = (g, { r = 3, c = 9, lv = 0, gift = false, hang = 9999 } = {}) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g.rel.ivy = lv
        g.ivy = { name: 'Ivy', r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang', t: 0, hue: '#a3579b', face: 1, walkPhase: 0, chatT: 0, hangUntil: hang, gift }
        return g.ivy
    }
    const beside = (p, v, dc = -1) => { p.r = v.r; p.c = v.c + dc; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0 }

    // Arrival: her own clock, the front gate, a path actually walked.
    const g1 = newRun(7)
    g1.visitAfter = 99; g1.ivyAfter = 12; g1.ivyGap = 0; g1.hour = 12
    let arrived = false
    for (let i = 0; i < 60 * 20 && !arrived; i++) { advance(g1, DT); arrived = drain(g1).some((e) => e.t === 'visit' && e.name === 'Ivy') }
    check('Ivy arrives through the gate on her own hour', arrived && !!g1.ivy && g1.ivy.r === 12 && g1.ivy.c === 5)
    check('and walks a real path toward the kitchen', !!g1.ivy && Array.isArray(g1.ivy.path) && g1.ivy.path.length > 4)
    const g1w = newRun(9)
    g1w.visitAfter = 99; g1w.ivyAfter = 19.5; g1w.ivyGap = 0; g1w.hour = 18.9; g1w.people[1].working = true
    for (let i = 0; i < 60 * 6; i++) { advance(g1w, DT); drain(g1w) }
    check('the visit window is honest — after 19:00 she never appears', g1w.hour >= 19.5 && !g1w.ivy)

    // Growth: chat feeds rel.ivy at the documented rate; nobody else's meter leaks.
    const g2 = newRun(11); hangIvy(g2)
    beside(g2.people[0], g2.ivy)
    g2.people[1].r = 1; g2.people[1].c = 12; g2.people[1].path = null; g2.people[1].goal = null
    const iv0 = g2.rel.ivy, fe0 = g2.rel.fern
    for (let i = 0; i < 60 * 5; i++) { beside(g2.people[0], g2.ivy); g2.people[1].path = null; advance(g2, DT); drain(g2) }
    const grew = g2.rel.ivy - iv0
    check('chatting beside Ivy grows her meter at IVY_CHAT/s', grew > 5 * IVY_CHAT - 0.05 && grew <= 5 * IVY_CHAT + 0.01, `grew=${grew.toFixed(3)}`)
    check('Ivy-chat pays NOTHING to Fern or the household meter', g2.rel.fern === fe0 && g2.rel.house === 0)

    // Crossing: exactly one rel-up per edge, level named.
    const g3 = newRun(13); hangIvy(g3, { lv: 11.95 })
    let ups3 = []
    for (let i = 0; i < 60 * 2; i++) { beside(g3.people[0], g3.ivy); g3.people[1].path = null; advance(g3, DT); ups3.push(...drain(g3).filter((e) => e.t === 'rel-up')) }
    check('crossing the FRIENDLY edge pays Ivy exactly one rel-up, level 1', ups3.length === 1 && ups3[0].k === 'ivy' && ups3[0].level === 1, JSON.stringify(ups3))

    // Gift economy: FRIENDS feeds the household, FAMILY adds honey-money.
    const giftRun = (relIvy) => {
        const s = newRun(17); s.visitAfter = 99; s.ivyAfter = 12; s.ivyGap = 0; s.hour = 12; s.rel.ivy = relIvy
        const hun0 = s.people.map((p) => p.needs.hunger); const money0 = s.money; const cont0 = s.content
        let paid = null
        for (let i = 0; i < 60 * 20 && !paid; i++) { s.people.forEach((p) => { p.path = null }); advance(s, DT); paid = drain(s).find((e) => e.t === 'gift') || null }
        return { s, paid, hun0, money0, cont0 }
    }
    const R0 = giftRun(0), R2 = giftRun(30), R3 = giftRun(60)
    check('below FRIENDS the basket stays at the market', !R0.paid && !R0.s.ivy.gift && R0.s.money === R0.money0 && R0.s.people.every((p, i) => p.needs.hunger <= R0.hun0[i] + 1e-9))
    check('FRIENDS+ arrives with the market basket — the household eats and +1 content', !!R2.paid && R2.paid.money === 0 && R2.s.ivy.gift && R2.s.people.every((p) => Math.abs(p.needs.hunger - 1) < 1e-9) && R2.s.content === R2.cont0 + 1)
    check('FAMILY adds the honey-money and a second content point', !!R3.paid && R3.paid.money === IVY_GIFT_CASH && R3.s.money === R3.money0 + IVY_GIFT_CASH && R3.s.content === R3.cont0 + 2)

    // Ladder math: FAMILY lingers 24 s longer; the NEXT visit lands 3 h sooner
    // (rescheduled on departure, same rng sequence — the fern law mirrored).
    let seedL = 0
    for (let sd = 1; sd < 500; sd++) { const t = newRun(sd); if (t.ivyAfter >= 15 && t.ivyAfter <= 18) { seedL = sd; break } }
    const driveToIvy = (seed, ivy0) => {
        const g = newRun(seed); g.rel.ivy = ivy0; g.visitAfter = 99; g.ivyAfter = Math.min(g.ivyAfter, 8); g.ivyGap = 0; g.hour = 8
        for (let i = 0; i < 60 * 30; i++) { g.people.forEach((p) => { p.path = null; p.goal = null }); advance(g, DT); if (drain(g).some((e) => e.t === 'visit' && e.name === 'Ivy')) return g }
        return null
    }
    const finishIvy = (g) => {
        if (!g || !g.ivy) return false
        g.ivy.state = 'leaving'; g.ivy.path = null
        for (let i = 0; i < 60 * 8; i++) { g.people.forEach((p) => { p.path = null }); advance(g, DT); if (drain(g).some((e) => e.t === 'visit-end' && e.who === 'ivy')) return true }
        return false
    }
    const la = driveToIvy(seedL, 0), lb = driveToIvy(seedL, 60)
    const lingerA = la ? la.ivy.hangUntil : NaN, lingerB = lb ? lb.ivy.hangUntil : NaN
    const lingerOk = !!la && !!lb && Math.abs(lingerB - (lingerA + 24)) < 1e-9
    const goA = finishIvy(la), goB = finishIvy(lb)
    check('FAMILY Ivy lingers 24 s longer and schedules her return 3 h sooner',
        lingerOk && goA && goB && lb.ivyAfter === Math.max(12, la.ivyAfter - 3),
        `linger=${(lingerB - lingerA).toFixed(1)} sooner=${la && lb ? `${la.ivyAfter}->${lb.ivyAfter}` : '-'}`)
    {
        const lg = driveToIvy(seedL + 1, 12)
        const gone = lg && finishIvy(lg)
        check('she walks out the gate, and her next visit reschedules', !!gone && !lg.ivy && lg.ivyAfter >= 12)
    }

    // Fade: absence demotes through exactly one rel-down (the #2076 law, reused).
    const gf = newRun(21); gf.visitAfter = 99; gf.ivyAfter = 99; gf.rel.ivy = 12.05; gf.people[1].working = true
    let downs = []
    for (let i = 0; i < 60 * 12; i++) { gf.people[0].path = null; gf.people[1].path = null; advance(gf, DT); downs.push(...drain(gf).filter((e) => e.t === 'rel-down' && e.k === 'ivy')) }
    check('absence demotes Ivy through exactly one rel-down (fade rides relSub)', gf.rel.ivy < 12 && downs.length === 1 && downs[0].level === 0, `ivy=${gf.rel.ivy.toFixed(2)} downs=${downs.length}`)

    // Court: Ivy is company the player can address too (#2131 doctrine, symmetric).
    const gc = newRun(23); hangIvy(gc, { r: 3, c: 5 }); gc.rel.ivy = 20
    gc.people[0].r = 3; gc.people[0].c = 4; gc.people[0].path = null; gc.people[0].x = tileX(4) + TILE / 2; gc.people[0].y = tileY(3) + TILE / 2
    gc.people[1].r = 1; gc.people[1].c = 12; gc.people[1].path = null
    const ck = courtTarget(gc), cr = court(gc, 'coo')
    check('the court counts Ivy — a coo in reach pays her meter', !!ck && ck.k === 'ivy' && !!cr && cr.k === 'ivy' && Math.abs(gc.rel.ivy - (20 + COO_BOND)) < 1e-9)
    gc.cmdCd = 0
    const ci = court(gc, 'insult')
    check('an insult to Ivy cuts her meter but keeps the household peace', !!ci && gc.grudge === 0 && Math.abs(gc.rel.ivy - (20 + COO_BOND - INSULT_DROP)) < 1e-9)

    // Autonomy: a lonely resident walks to the NEAREST neighbour, whoever she is.
    const gz = newRun(25); hangIvy(gz)
    gz.visitor = { name: 'Fern', r: 2, c: 2, x: tileX(2) + TILE / 2, y: tileY(2) + TILE / 2, path: null, state: 'hang', t: 5, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0, hangUntil: 999 }
    gz.demo = true
    const pa = gz.people[0]; pa.r = 3; pa.c = 6; pa.path = null; pa.goal = null; pa.use = null; pa.working = false; pa.faintT = 0
    pa.needs.social = 0.2; for (const n of NEEDS) if (n !== 'social') pa.needs[n] = 0.9
    advance(gz, DT); drain(gz)
    check('autonomy walks to the NEAREST neighbour (Ivy beats Fern here)', pa.goal && pa.goal.kind === 'chat' && pa.goal.v === 'ivy', JSON.stringify(pa.goal))

    // The wing must not rise on top of a standing neighbour.
    const gr = newRun(27); hangIvy(gr, { r: 3, c: 13 }); gr.money = 1000
    check('the Spare Room cannot rise on a neighbour in the footprint', !buildRoomOk(gr))
    gr.ivy.r = 3; gr.ivy.c = 4
    check('…and clears the moment she steps out', buildRoomOk(gr))

    // Hash + determinism + pools.
    const hb0 = stateHash(newRun(31))
    const h1 = newRun(31); h1.rel.ivy += 1
    const h2 = newRun(31); h2.ivy = { name: 'Ivy', r: 3, c: 5, x: 0, y: 0, path: null, state: 'hang', t: 0, gift: false }
    const h3 = newRun(31); h3.ivy = { ...h2.ivy, gift: true }
    check('rel.ivy, Ivy on the lot and the basket all ride the hash', stateHash(h1) !== hb0 && stateHash(h2) !== hb0 && stateHash(h3) !== hb0 && stateHash(h3) !== stateHash(h2))
    const dA = newRun(2143), dB = newRun(2143)
    for (let i = 0; i < 60 * 60; i++) { autoStep(dA, DT); drain(dA); autoStep(dB, DT); drain(dB) }
    check('an attract hour spanning Ivy is seed-exact', stateHash(dA) === stateHash(dB))
    const ivSizes = [0, 12, 30, 60].map((v) => { const z = newRun(1); z.rel.ivy = v; return ivyChatPool(z).length })
    check('Ivy\u2019s topic pool widens on her own ladder (3→8 lines)', ivSizes.join(',') === '3,4,6,8', ivSizes.join(','))
    const fSizes = [0, 12, 30, 60].map((v) => { const z = newRun(1); z.rel.fern = v; return chatPool(z).length })
    check('Fern keeps her own pool untouched (4→9)', fSizes.join(',') === '4,5,7,9', fSizes.join(','))

    // Source pins: the second-neighbour wiring must not silently drop.
    const ivSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const ivJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const ivArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: the Ivy-chat block feeds the flower meter', /if \(partner\) \{[^}]*relAdd\(s, 'ivy'/.test(ivSim))
    check('pin: gift tiers are FRIENDS/FAMILY and the window closes at dusk', /const gift = lv >= 2/.test(ivSim) && /lv >= 3/.test(ivSim) && /s\.hour < 19/.test(ivSim))
    check('pin: the panel runs the flower IVY row with its FAMILY pulse', /'flower', '#a3579b', relLevel\(s\.rel\.ivy\), 'IVY'/.test(ivArt) && /relLevel\(s\.rel\.ivy\) === 3/.test(ivArt))
    check('pin: Ivy rides the draw order and the basket is painted', ivJsx.includes('g.ivy ? [{ p: g.ivy, v: g.ivy.y }]') && /if \(p\.gift\) \{/.test(ivArt))
    check('pin: the shell names her arrival, her gift and her bond lines', /case 'gift'/.test(ivJsx) && /IVY AT THE GATE/.test(ivJsx) && /ivy: 'IVY'/.test(ivJsx))
}

// ------------------------------------------------ CHOREOGRAPHY (#2154) -------
section('CHOREOGRAPHY (#2154): nearest resident, contested pays closer, three-way tell')
{
    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0 }
    const hold = (pairs) => pairs.forEach(([p, r, c]) => park(p, r, c))
    const soak = (g, pairs, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); drain(g) } }

    // Nearest, not last: the old loop let the LAST eligible resident in array
    // order win the ring. The nearer one (people[0]) must now get the chat.
    const a = newRun(101); hang(a, 'visitor', 'Fern', 3, 6, '#4fae5f')
    const a0s = a.people[0].needs.social, af0 = a.rel.fern
    soak(a, [[a.people[0], 3, 5], [a.people[1], 3, 8]], 2)   // d1 and d2 — both eligible
    check('nearest resident wins the ring, not the last one in array order',
        a.people[0].needs.social - a0s > 0.05 && a.people[1].chatT === 0 && a.rel.fern - af0 > 2 * 0.07 - 0.05,
        `near=${(a.people[0].needs.social - a0s).toFixed(3)} farChatT=${a.people[1].chatT}`)
    check('no contest, no three-way tell (solo visitor stays quiet)', a.triHits === 0)

    // Contested: one resident in BOTH rings (Fern d1, Ivy d2) — the closer
    // visitor gets the ear; the loser pays nothing, and the resident is paid
    // by ONE visitor only (single 0.06 rate, never 0.06+IVY_SOCIAL stacked).
    const b = newRun(103); hang(b, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(b, 'ivy', 'Ivy', 3, 8, '#a3579b')
    const b0s = b.people[0].needs.social
    soak(b, [[b.people[0], 3, 6], [b.people[1], 1, 12]], 2)
    check('contested resident pays the CLOSER visitor — Fern wins the d1/d2 split',
        b.rel.fern > 2 * 0.07 - 0.05 && b.rel.ivy === 0 && b0s < b.people[0].needs.social,
        `fern=${b.rel.fern.toFixed(3)} ivy=${b.rel.ivy.toFixed(3)}`)
    const bGain = b.people[0].needs.social - b0s
    check('a resident pays only ONE visitor per tick (no stacked social from both rings)',
        bGain > 2 * 0.06 - 0.05 && bGain < 2 * 0.06 + 0.04, `gain=${bGain.toFixed(3)}`)

    // Loser fallback: put a second resident in Ivy's ring only — she re-aims
    // at her own next-nearest instead of idling.
    const c = newRun(107); hang(c, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(c, 'ivy', 'Ivy', 3, 8, '#a3579b')
    soak(c, [[c.people[0], 3, 6], [c.people[1], 3, 10]], 2)   // people[1]: Ivy d2, Fern d5
    check('the losing visitor falls back to its own next-nearest',
        c.rel.fern > 2 * 0.07 - 0.05 && c.rel.ivy > 2 * IVY_CHAT - 0.05,
        `fern=${c.rel.fern.toFixed(3)} ivy=${c.rel.ivy.toFixed(3)}`)

    // Tie law: equidistant resident goes to Fern, the first neighbour (#2143 order).
    const t = newRun(109); hang(t, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(t, 'ivy', 'Ivy', 3, 9, '#a3579b')
    soak(t, [[t.people[0], 3, 7], [t.people[1], 1, 12]], 2)   // d2/d2 tie
    check('a tie gives Fern, the first neighbour, the ear',
        t.rel.fern > 2 * 0.07 - 0.05 && t.rel.ivy === 0,
        `fern=${t.rel.fern.toFixed(3)} ivy=${t.rel.ivy.toFixed(3)}`)

    // The three-way tell: fires on a live contest, alternates wording, and
    // throttles at TRI_TELL_CD so 17 s of quarrelling lands exactly 3 beats.
    const w = newRun(113); hang(w, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(w, 'ivy', 'Ivy', 3, 8, '#a3579b')
    const tells = []
    let lastHits = 0
    for (let i = 0; i < Math.round(17 / DT); i++) {
        hold([[w.people[0], 3, 6], [w.people[1], 1, 12]]); advance(w, DT); drain(w)
        if (w.triHits !== lastHits) { lastHits = w.triHits; tells.push({ tick: i, line: w.thoughts[0] ? w.thoughts[0].text : '' }) }
    }
    const cdOk = tells.every((x, i) => i === 0 || x.tick - tells[i - 1].tick >= Math.floor(TRI_TELL_CD / DT) - 1)
    check('a live contest tells the neighbourhood — 3 beats in 17 s, spaced ≥ the throttle',
        tells.length === 3 && cdOk, `tells=${tells.length}`)
    check('the tell alternates its two wordings',
        tells.length >= 2 && TRI_LINES.includes(tells[0].line) && TRI_LINES.includes(tells[1].line) &&
        tells[0].line !== tells[1].line && (tells.length < 3 || tells[2].line === tells[0].line))

    // Determinism through a scripted contest, and the throttle rides the hash.
    const contest = (seed) => {
        const g = newRun(seed); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 8, '#a3579b')
        soak(g, [[g.people[0], 3, 6], [g.people[1], 3, 10]], 12)
        return stateHash(g)
    }
    check('a contested hour is seed-exact', contest(2154) === contest(2154) && contest(7) === contest(7))
    const hz0 = newRun(5), hz1 = newRun(5); hz1.triTell = 4.5
    const hz2 = newRun(5); hz2.triHits = 1
    check('the tell throttle and its beat count ride the hash',
        stateHash(hz1) !== stateHash(hz0) && stateHash(hz2) !== stateHash(hz0))

    // Source pins: the law must not be silently unwired.
    const chSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    check('pin: BOTH chat blocks read the arbitrated claim, once each',
        (chSim.match(/const partner = v\.claim \|\| null/g) || []).length === 2)
    check('pin: claims settle BEFORE either visitor is updated',
        /arbitrateVisitors\(s\)[^\n]*\n\s*updateVisitor\(s, simDt\)\n\s*updateIvy\(s, simDt\)/.test(chSim))
    check('pin: eligibility keeps the faint/working gate and the reach ring ≤2',
        /\.filter\(\(e\) => e\.d <= 2 && e\.p\.faintT <= 0 && !e\.p\.working\)/.test(chSim))
}

// ----------------------------------------------------------- PET (#2197) -----
section('PET (#2197): Miso — counter law, cat day, coos, hash')
{
    const petSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const petJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const petArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')

    // the counter: price, honest refusal, one cat per lot
    const s0 = newRun(11)
    check('a fresh lot has no cat; the counter opens at §150 (card 15)', s0.pet === null && adoptOk(s0) && PET.price === DEF.petkit.price && CATALOG[14].id === 'petkit' && CATALOG[14].pet === true)
    s0.money = 100
    check('pennies at the counter: adoptOk says no', !adoptOk(s0))
    s0.sel = 14
    const refused = place(s0, 3, 3)
    check('a refused adoption speaks at the gate', !refused && drain(s0).some((e) => e.t === 'refuse' && e.r === 12 && e.c === 5) && s0.pet === null)
    s0.money = 520
    const bought = place(s0, 0, 0)
    check('the counter sells a cat: paid, no furniture, a gate event', bought && s0.money === 520 - PET.price && !!s0.pet && !s0.items.some((it) => it.id === 'petkit'))
    check('one cat per lot — the carrier is already empty', adoptPet(s0) === false && s0.pet !== null)

    // legal wander: every step asks walkable — 33 sim-minutes on the lot
    let badCell = 0
    for (let i = 0; i < 2000; i++) { advance(s0, DT); drain(s0); if (s0.pet && (!walkable(s0, s0.pet.r, s0.pet.c) || s0.done)) badCell++ }
    check('the cat never steps somewhere illegal (and stays out of trouble)', badCell === 0)

    // kibble: a hungry cat walks herself to the fridge
    s0.pet.needs.hunger = 0.1
    const h0 = s0.pet.needs.hunger
    let ate = 0
    for (let i = 0; i < 900 && !ate; i++) { advance(s0, DT); if (drain(s0).some((e) => e.t === 'pet-eat')) ate = 1 }
    check('a hungry cat works the fridge for kibble', ate === 1 && s0.pet.needs.hunger > h0 + 0.4)

    // night: sleep on the floorboards, energy paid back; dawn wakes her
    s0.hour = 22.2
    s0.pet.needs.energy = 0.4
    let slept = 0
    for (let i = 0; i < 600 && !slept; i++) { advance(s0, DT); drain(s0); if (s0.pet.asleep) slept = 1 }
    const en1 = s0.pet.needs.energy
    check('night pours her into a sleeping loaf', slept === 1)
    for (let i = 0; i < 300; i++) { advance(s0, DT); drain(s0) }
    check('sleep pays her energy back', s0.pet.asleep && s0.pet.needs.energy > en1)
    s0.hour = 6.5
    for (let i = 0; i < 20; i++) { advance(s0, DT); drain(s0) }
    check('dawn unspools the cat', !s0.pet.asleep)

    // the coo law + its cooldown: park the cat beside an idle resident
    s0.hour = 10
    const o = s0.people[0]
    o.path = null; o.goal = null; o.use = null; o.working = false; o.faintT = 0
    const parkCat = () => { s0.pet.r = o.r; s0.pet.c = o.c + 1; s0.pet.x = tileX(o.c + 1) + TILE / 2; s0.pet.y = o.y; s0.pet.path = null; s0.pet.state = 'roam' }
    s0.pet.cd = 0
    parkCat()
    const rel0 = s0.rel.house, soc0 = o.needs.social, c0 = s0.content
    let coos = 0
    for (let i = 0; i < 60; i++) { advance(s0, DT); coos += drain(s0).filter((e) => e.t === 'pet-coo').length }
    check('an arm\u2019s-reach resident coos: bond, social, content and an event', coos >= 1 && s0.rel.house > rel0 && o.needs.social > soc0 && s0.content > c0)
    parkCat()
    let coos2 = 0
    for (let i = 0; i < Math.round((PET_COOS - 1.5) * 60); i++) { advance(s0, DT); parkCat(); o.path = null; coos2 += drain(s0).filter((e) => e.t === 'pet-coo').length }
    check('the coo economy: at most one coo per PET_COOS seconds', coos2 === 0)

    // determinism with the bot adopting mid-shift, and the hash carrying her
    const dA = newRun(9), dB = newRun(9)
    for (let i = 0; i < 3600; i++) { if (i === 600) { dA.money = 900; dB.money = 900 } autoStep(dA, DT); drain(dA); autoStep(dB, DT); drain(dB) }
    check('attract hours including the counter are seed-exact', stateHash(dA) === stateHash(dB))
    const anyPet = dA.pet || dB.pet
    check('the attract bot adopts when the till allows', !!anyPet)
    if (anyPet) {
        const h1 = stateHash(dA)
        if (dA.pet) dA.pet.cd = 3.3; else dA.pet = { ...dB.pet }
        check('the cat rides the hash — she is state', stateHash(dA) !== h1)
    }

    // the lifetime wish still lands with a cat on the lot
    const w = newRun(1)
    let wn = 0
    while (!w.done && wn++ < 60 * 60 * 6) { autoStep(w, DT); drain(w) }
    check('the wish still lands with a cat on the lot', w.done === 'win' && !!w.pet)

    // source pins — the wiring must not silently drop
    check('pin: advance ticks the cat between Ivy and the hearth', /updatePet\(s, simDt\)/.test(petSim))
    check('pin: every wander pick asks walkable AND pathfinds before it commits', /if \(walkable\(s, rr, cc\)\)/.test(petSim))
    check('pin: the coo law feeds house bond and resident social', /partner\.needs\.social = Math\.min\(1, partner\.needs\.social \+ PET_SOCIAL\)/.test(petSim) && /relAdd\(s, 'house', PET_BOND\)/.test(petSim))
    check('pin: the cat rides stateHash', /mix\(s\.pet \? 1 : 0\)/.test(petSim))
    check('pin: the shell draws Miso in the depth order', /drawPet/.test(petJsx) && petJsx.includes('g.pet ? [{ p: g.pet, v: g.pet.y }]'))
    check('pin: P keys the card and the counter events have voices', /PET_KEYS = new Set\(\['KeyP'\]\)/.test(petJsx) && /specialPick = 'petkit'/.test(petJsx) && /case 'pet':/.test(petJsx) && /case 'pet-coo'/.test(petJsx))   // #2222: the P key now rides setSel
    check('pin: the sprite ships — loaf, walk and purr sparks in art', /export function drawPet/.test(petArt) && /purrT/.test(petArt) && /case 'petkit'/.test(petArt))
    check('pin: the probe answers with the cat', petJsx.includes('pet: gs.pet ?'))
}

section('KIDS (#2203): Pip — counter law, kid day, coos, hash')
{
    const kidSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const kidJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const kidArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')

    // the counter: price, honest refusal, one child per lot
    const k0 = newRun(11)
    check('a fresh lot has no child; the counter opens at §150 (card 16)', k0.kid === null && adoptKidOk(k0) && KID.price === 150 && CATALOG[15].id === 'kidkit' && CATALOG[15].kid === true)
    k0.money = 100
    check('pennies at the counter: adoptKidOk says no', !adoptKidOk(k0))
    k0.sel = 15
    const kRefused = place(k0, 3, 3)
    check('a refused adoption speaks at the gate', !kRefused && drain(k0).some((e) => e.t === 'refuse' && e.r === 12 && e.c === 5) && k0.kid === null)
    k0.money = 520
    const kBought = place(k0, 0, 0)
    check('the counter sells a child: paid, no furniture, a gate event', kBought && k0.money === 520 - KID.price && !!k0.kid && !k0.items.some((it) => it.id === 'kidkit'))
    check('one child per lot — the agency answers only once', adoptKid(k0) === false && k0.kid !== null)
    check('pin: the counter sits in placeOk and place answers at the gate', /if \(def\.kid\) return adoptKidOk\(s\)/.test(kidSim) && /if \(def\.kid\) \{[\s\S]{0,80}adoptKid\(s\)/.test(kidSim))

    // legal wander: every step asks walkable — the kid day, live loop
    const keepAlive = (g) => { for (const q of g.people) { q.faintT = 0; q.needs.hunger = Math.max(q.needs.hunger, 0.8); q.needs.energy = Math.max(q.needs.energy, 0.8); q.needs.bladder = Math.max(q.needs.bladder, 0.8) } }   // the household being alive is not what these gates test
    let kBadCell = 0
    const kSeen = new Set()
    const kLast = { r: k0.kid.r, c: k0.kid.c }
    let snacks = 0, plays = 0, tumbles = 0, cries = 0
    k0.money = 900
    for (let i = 0; i < 2000; i++) {
        advance(k0, DT); drain(k0); keepAlive(k0)
        const k = k0.kid
        if (!walkable(k0, k.r, k.c) || k0.done) kBadCell++
        if (k.r !== kLast.r || k.c !== kLast.c) { kSeen.add(`${k.r},${k.c}`); kLast.r = k.r; kLast.c = k.c }
    }
    check('the child never steps somewhere illegal (and stays out of trouble)', kBadCell === 0)
    check('the child really moves through the house', kSeen.size >= 4, `${kSeen.size} cells`)

    // snack law: hunger drives the child to the fridge
    k0.kid.needs.hunger = 0.1
    const kH0 = k0.kid.needs.hunger
    let ateKid = 0
    for (let i = 0; i < 900 && !ateKid; i++) { advance(k0, DT); keepAlive(k0); if (drain(k0).some((e) => e.t === 'kid-eat')) ateKid = 1 }
    check('a hungry child works the fridge for a snack', ateKid === 1 && k0.kid.needs.hunger > kH0 + 0.4)

    // play law: boredom sends the child to whatever the living room offers
    k0.hour = 10
    k0.kid.needs.fun = 0.1
    const kF0 = k0.kid.needs.fun
    let playedKid = 0
    for (let i = 0; i < 900 && !playedKid; i++) { advance(k0, DT); keepAlive(k0); if (drain(k0).some((e) => e.t === 'kid-play')) playedKid = 1 }
    check('a bored child finds the fun things — toys, pond, tree, arcade', playedKid === 1 && k0.kid.needs.fun > kF0 + 0.3)

    // night: a child folds up small on the floorboards; dawn wakes them
    k0.hour = 22.2
    k0.kid.needs.energy = 0.4
    let kidSlept = 0
    for (let i = 0; i < 600 && !kidSlept; i++) { advance(k0, DT); drain(k0); keepAlive(k0); if (k0.kid.asleep) kidSlept = 1 }
    const kEn1 = k0.kid.needs.energy
    check('night folds the child up asleep', kidSlept === 1)
    for (let i = 0; i < 300; i++) { advance(k0, DT); drain(k0); keepAlive(k0) }
    check('sleep pays the child energy back', k0.kid.asleep && k0.kid.needs.energy > kEn1)
    k0.hour = 6.5
    for (let i = 0; i < 20; i++) { advance(k0, DT); drain(k0) }
    check('dawn stretches Pip awake', !k0.kid.asleep)
    check('the child never faints', k0.kid.needs.energy > 0)

    // the tumble law: an idle resident nearby means play, not tears (evening:
    // shift over, nobody mopping the floor)
    k0.hour = 19.5
    const kPartner = k0.people[0]
    k0.kid.needs.fun = Math.max(k0.kid.needs.fun, 0.6)
    const parkKid = () => { k0.kid.r = kPartner.r; k0.kid.c = kPartner.c + 1; k0.kid.x = tileX(kPartner.c + 1) + TILE / 2; k0.kid.y = kPartner.y; k0.kid.path = null; k0.kid.state = 'roam'; k0.kid.cd = 0 }
    const stayParked = () => { kPartner.path = null; kPartner.goal = null; kPartner.use = null; kPartner.working = false; kPartner.faintT = 0; parkKid() }
    stayParked()
    const kRel0 = k0.rel.kid, kSoc0 = kPartner.needs.social, kCon0 = k0.content
    for (let i = 0; i < 480; i++) { advance(k0, DT); keepAlive(k0); stayParked(); const ev = drain(k0); cries += ev.filter((e) => e.t === 'kid-cry').length; tumbles += ev.filter((e) => e.t === 'kid-tumble').length }
    check('tumbles: bond, resident social, content — and the cry never starts next to family', tumbles >= 1 && k0.rel.kid > kRel0 && kPartner.needs.social > kSoc0 && k0.content > kCon0 && cries === 0, JSON.stringify({ tumbles, cries }))

    // the cry law: a red-fun child wails on a cooldown, and the wail stings
    // the earshot — neglect made audible. Park Pip next to a resident, pin fun
    // red (a tumble needs fun above red, so only the crying can happen).
    const k1 = newRun(7); k1.money = 900
    adoptKid(k1)
    const kEar = k1.people[0]
    const parkCry = () => { kEar.path = null; kEar.goal = null; kEar.use = null; kEar.working = false; kEar.faintT = 0; kEar.needs.social = 1; k1.kid.r = kEar.r; k1.kid.c = kEar.c + 1; k1.kid.x = tileX(kEar.c + 1) + TILE / 2; k1.kid.y = kEar.y; k1.kid.path = null; k1.kid.state = 'roam'; k1.kid.needs.fun = 0.05 }
    let stung = 0
    for (let i = 0; i < 600; i++) { parkCry(); const soc0 = kEar.needs.social; advance(k1, DT); keepAlive(k1); const ev = drain(k1).filter((e) => e.t === 'kid-cry').length; cries += ev; if (ev && kEar.needs.social < soc0) stung = 1 }
    check('a red-fun child wails on a cooldown (never faster than KID_CRY_CD)', cries >= 2 && cries <= 4, `cries in 10s: ${cries}`)
    check('the wail stings the earshot', stung === 1, `social: ${kEar.needs.social.toFixed(2)}`)

    // court reaches the child — kind words cheer, scolds put out the play-fire
    k1.hour = 10
    k1.visitor = null; k1.ivy = null; k1.cmdCd = 0
    const kAct = k1.people[k1.active], kOther = k1.people[1 - k1.active]
    kOther.faintT = 5   // the partner is out of court; the child should win the glance
    kAct.path = null; kAct.goal = null; kAct.use = null; kAct.working = false; kAct.faintT = 0
    k1.kid.r = kAct.r; k1.kid.c = kAct.c + 1; k1.kid.x = tileX(kAct.c + 1) + TILE / 2; k1.kid.y = kAct.y; k1.kid.path = null; k1.kid.state = 'roam'
    const kCRel0 = k1.rel.kid, kCFun0 = k1.kid.needs.fun
    const kCoo = court(k1, 'coo')
    check('the court reaches the child — cooing bonds and cheers', kCoo && kCoo.k === 'kid' && k1.rel.kid > kCRel0 && k1.kid.needs.fun > kCFun0, JSON.stringify(kCoo))
    k1.cmdCd = 0
    k1.grudge = 0
    const kRel1 = k1.rel.kid, kCFun1 = k1.kid.needs.fun
    const kScold = court(k1, 'insult')
    check('a scold stings the child but makes no house enemy', kScold && kScold.k === 'kid' && k1.rel.kid < kRel1 && k1.kid.needs.fun < kCFun1 && !k1.grudge, JSON.stringify({ res: kScold, grudge: k1.grudge }))
    kOther.faintT = 0

    // determinism with the bot adopting mid-shift, and the hash carrying the child
    const ka = newRun(9), kb = newRun(9)
    for (let i = 0; i < 3600; i++) { if (i === 600) { ka.money = 900; kb.money = 900; adoptKid(ka); adoptKid(kb) } autoStep(ka, DT); drain(ka); autoStep(kb, DT); drain(kb) }
    check('attract hours including the counter are seed-exact', stateHash(ka) === stateHash(kb))
    const hK1 = stateHash(ka)
    ka.kid.needs.fun = Math.max(0, ka.kid.needs.fun - 0.25)
    check('the child rides the hash — they are state', stateHash(ka) !== hK1)

    // the lifetime wish still lands with a child on the lot
    const kw = newRun(1)
    let kwn = 0
    while (!kw.done && kwn++ < 60 * 60 * 6) { if (kwn === 600) { kw.money = 900; adoptKid(kw) } autoStep(kw, DT); drain(kw) }
    check('the wish still lands with a child on the lot', kw.done === 'win' && !!kw.kid, `done=${kw.done}`)

    // source pins — the wiring must not silently drop
    check('pin: advance ticks the child between the cat and the hearth', /updateKid\(s, simDt\)/.test(kidSim))
    check('pin: the cry law stings nearby residents', /KID_CRY_STING/.test(kidSim) && /needs\.social = Math\.max\(0,[^)]*- KID_CRY_STING\)/.test(kidSim))
    check('pin: tumbles feed the kid bond and the resident', /relAdd\(s, 'kid', KID_BOND\)/.test(kidSim) && /needs\.social = Math\.min\(1, partner\.needs\.social \+ KID_SOCIAL\)/.test(kidSim))
    check('pin: the child rides stateHash', /mix\(s\.kid \? 1 : 0\)/.test(kidSim))
    check('pin: the bond panel rows the child under the stars', /if \(s\.kid\) bondRow/.test(kidArt) && /'PIP'/.test(kidArt))
    check('pin: the shell draws Pip in the depth order', /drawKid/.test(kidJsx) && kidJsx.includes('g.kid ? [{ p: g.kid, v: g.kid.y }]'))
    check('pin: K keys the card and the counter events have voices', /KID_KEYS = new Set\(\['KeyK'\]\)/.test(kidJsx) && /specialPick = 'kidkit'/.test(kidJsx) && /case 'kid':/.test(kidJsx) && /case 'kid-tumble'/.test(kidJsx) && /case 'kid-cry'/.test(kidJsx))   // #2222: the K key now rides setSel
    check('pin: the sprite ships — scamper, Zzz and tears in art', /export function drawKid/.test(kidArt) && /Zzz/.test(kidArt) && /case 'kidkit'/.test(kidArt))
    check('pin: the probe answers with the child', kidJsx.includes('kid: gs.kid ?'))
}

// --------------------------------------------------------- STORES (#2222) ----
section('STORES (#2222): catalog shelves — partition, flip, digits, hash')
{
    // partition integrity: shelves cover CATALOG exactly, no duplicates
    const flat = TAB_CARDS.flat()
    check('shelves partition the catalog — nothing lost, nothing doubled',
        flat.length === CATALOG.length && CATALOG.every((d, i) => flat.includes(i)) && TAB_CARDS.every((cards) => cards.every((i) => i >= 0)),
        `flat=${flat.length}/${CATALOG.length}`)
    check('TAB_OF agrees with the shelves both ways',
        TAB_CARDS.every((cards, t) => cards.every((i) => TAB_OF[i] === t)) && CATALOG.every((d, i) => TAB_OF[i] !== undefined))

    // cycling
    const a = newRun(11)
    check('a fresh run opens on the first shelf', a.tab === 0 && tabCards(a).length === CAT_TABS[0].ids.length)
    let seq = []
    for (let i = 0; i < CAT_TABS.length; i++) { flipTab(a, 1); seq.push(a.tab) }
    check('flipping forward cycles every shelf and lands back where it started', seq.join(',') === '1,2,3,0')
    seq = []
    for (let i = 0; i < CAT_TABS.length; i++) { flipTab(a, -1); seq.push(a.tab) }
    check('flipping backward cycles too', seq.join(',') === '3,2,1,0')

    // selection always lands on the open shelf
    const b = newRun(12)
    check('the selection always sits on the open shelf', CAT_TABS.every((t, ti) => { selectTab(b, ti); return TAB_OF[b.sel] === ti }))
    check('each shelf defaults its selection to its first card', TAB_CARDS.every((cards, ti) => { selectTab(b, ti); return b.sel === cards[0] }))

    // per-shelf memory
    const c = newRun(13)
    const plantI = CATALOG.findIndex((d) => d.id === 'plant')
    const lampI = CATALOG.findIndex((d) => d.id === 'lamp')
    const tvI = CATALOG.findIndex((d) => d.id === 'tv')
    setSel(c, plantI)
    check('picking a card follows it to its shelf', c.tab === TAB_OF[plantI] && c.tabSel[TAB_OF[plantI]] === plantI)
    flipTab(c, 1)
    setSel(c, tvI)
    check('each shelf remembers its own last pick', c.tabSel[TAB_OF[tvI]] === tvI && c.tabSel[TAB_OF[plantI]] === plantI)
    selectTab(c, TAB_OF[plantI])
    check('coming back recalls the shelf\'s last pick, not its first card', c.tab === TAB_OF[plantI] && c.sel === plantI)
    setSel(c, lampI)
    flipTab(c, 1); flipTab(c, -1)
    check('memory updates when the shelf is picked again', c.sel === lampI)

    // digits within the shelf — every card reachable
    const d1 = newRun(14)
    const reach = new Set()
    for (let t = 0; t < CAT_TABS.length; t++) { selectTab(d1, t); for (let n = 1; n <= 9; n++) { const i = digitCard(d1, n); if (i >= 0) reach.add(i) } }
    check('every catalog card is reachable by shelf + digit 1-9', reach.size === CATALOG.length, `${reach.size}/${CATALOG.length}`)
    selectTab(d1, 2)
    check('a digit past the shelf picks nothing', digitCard(d1, CAT_TABS[2].ids.length + 1) === -1)
    selectTab(d1, 0)
    check('digit 4 on HOME is the Porcelain Throne', digitCard(d1, 4) === CATALOG.findIndex((d) => d.id === 'toilet'))

    // purchase laws unchanged by shelves
    const e = newRun(15)
    setSel(e, tvI)
    check('the TV selects onto the FUN shelf', e.tab === 1 && e.sel === tvI)
    const moneyBefore = e.money
    let tvPlaced = false
    for (let r = 1; r < ROWS && !tvPlaced; r++) {
        for (let cx = 0; cx < COLS && !tvPlaced; cx++) {
            if (e.money - DEF.tv.price < 0) break
            if (place(e, r, cx)) tvPlaced = e.money === moneyBefore - DEF.tv.price
        }
    }
    check('placing from a non-first shelf bills the card', tvPlaced)
    const f = newRun(16)
    const roomI = CATALOG.findIndex((d) => d.id === 'roomkit')
    setSel(f, roomI)
    check('the Spare Room kit opens the SPECIAL shelf', f.tab === TAB_OF[roomI])
    f.money = 100
    check('short money still refuses at the gate', place(f, 0, 0) === false && f.ext === 0)

    // the shelf rides the hash
    const hA = newRun(17)
    const h0 = stateHash(hA)
    const hB = newRun(17); hB.tab = 2
    check('the open shelf rides stateHash — flipping is state', stateHash(hB) !== h0)
    flipTab(hA, 1); flipTab(hA, -1)
    const hC = newRun(17)
    check('a full flip cycle returns the same hash', stateHash(hA) === stateHash(hC))

    // source pins — the wiring must not silently drop
    const stSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const stArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const stJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the shelf law is pure in sim.js', /export const CAT_TABS/.test(stSim) && /export function setSel/.test(stSim) && /export function flipTab/.test(stSim) && /export function digitCard/.test(stSim))
    check('pin: the shelf rides stateHash', /mix\(s\.tab\)/.test(stSim))
    check('pin: attract purchases ride setSel (the shelf follows the demo)', (stSim.match(/setSel\(s, CATALOG\.findIndex/g) || []).length >= 4)
    check('pin: the view draws tabs and shelf cards', stArt.includes('CAT_TABS.forEach') && /export function tabHit/.test(stArt) && /tabCards\(s\)/.test(stArt))
    check('pin: the shell wires [ ] flips, per-shelf digits and tab taps', /BracketLeft/.test(stJsx) && /BracketRight/.test(stJsx) && /digitCard\(gs, digitPick\)/.test(stJsx) && /tabHit\(px, py\)/.test(stJsx) && /selectTab\(gs, tb\)/.test(stJsx))
}

// --------------------------------------------------------- SPEED (#2227) ----
section('SPEED (#2227): the clock dial — partition, clamp, cycle, hash')
{
    // the dial: four named gears, pause through fastest
    check('the dial has four gears: pause, normal, x2, x4',
        JSON.stringify(SPEED_MULT) === '[0,1,2,4]' && SPEED_NAMES.length === 4 && SPEED_NAMES[0] === 'PAUSED' && SPEED_NAMES[3] === 'FASTEST')
    check('a fresh run moves in at NORMAL', newRun(31).speed === 1)

    // setSpeed clamps and reports change
    const s1 = newRun(32)
    check('setSpeed accepts the four gears', setSpeed(s1, 3) && s1.speed === 3 && setSpeed(s1, 0) && s1.speed === 0)
    check('setSpeed clamps past the ends', (setSpeed(s1, 9), s1.speed === 3) && (setSpeed(s1, -9), s1.speed === 0))
    check('setSpeed to the current gear reports no change', !setSpeed(s1, 0) && setSpeed(s1, 2))

    // cycle wraps both ways
    const s2 = newRun(33)
    setSpeed(s2, 3)
    check('cycling up from fastest wraps to pause', cycleSpeed(s2, 1) && s2.speed === 0)
    check('cycling down from pause wraps to fastest', cycleSpeed(s2, -1) && s2.speed === 3)

    // the dial rides the hash — pausing is state, not decoration
    const h1 = newRun(34)
    const hh0 = stateHash(h1)
    setSpeed(h1, 0)
    const hhP = stateHash(h1)
    setSpeed(h1, 1)
    check('the speed dial rides stateHash', hhP !== hh0)
    check('resume at normal returns the run to its old hash', stateHash(h1) === hh0)

    // the day boundary keeps the player's gear (the original persists speed)
    const s3 = newRun(35)
    setSpeed(s3, 2)
    s3.hour = 23.9
    const d0 = s3.day
    for (let i = 0; i < 60 * 6 && s3.day === d0; i++) advance(s3, DT)
    check('speed persists across the day boundary', s3.day === d0 + 1 && s3.speed === 2, `day ${d0}->${s3.day} speed ${s3.speed}`)

    // the attract teaching law: hurry the morning, ease back, never freeze
    const s4 = newRun(36)
    const gears = [7, 8, 9, 10, 11].map((h) => { s4.hour = h; return attractSpeed(s4) })
    check('attract rushes 8h-10h and eases back', gears.join(',') === '1,2,2,1,1', gears.join(','))
    check('attract never pauses — the marquee always moves',
        [0, 6, 12, 18, 23].every((h) => { s4.hour = h; return attractSpeed(s4) > 0 }))

    // source pins — the wiring must not silently drop (same law as STORES)
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the dial law is pure in sim.js', /export const SPEED_MULT/.test(pSim) && /export function setSpeed/.test(pSim) && /export function cycleSpeed/.test(pSim) && /export const attractSpeed/.test(pSim))
    check('pin: the dial rides stateHash', /mix\(s\.speed\)/.test(pSim))
    check('pin: the loop buys world steps by the gear — one driver, one dt', /const steps = SPEED_MULT\[/.test(pJsx) && /for \(let sp = 0; sp < steps; sp\+\+\)/.test(pJsx))
    check('pin: dial keys are consumed ABOVE the multiplier — pause still answers', pJsx.indexOf('speedPick !== null') < pJsx.indexOf('while (acc >= SIM_MS)') && pJsx.indexOf('if (speedCycled)') < pJsx.indexOf('while (acc >= SIM_MS)'))
    check('pin: digits 1-4 drive the dial outside buy; the #2222 card law stays for shelves', /\^Digit\[1-4\]\$\/\.test\(e\.code\) && gs && !gs\.build\) speedPick/.test(pJsx) && /Digit\[1-9\]/.test(pJsx))
    check('pin: , and . cycle the dial', /'Comma'/.test(pJsx) && /'Period'/.test(pJsx) && /cycleSpeed\(gs, speedCycled\)/.test(pJsx))
    check('pin: the thumb-court release freezes when the world freezes', /!gs\.done && gs\.speed > 0/.test(pJsx))
    check('pin: the attract demo teaches the dial', /attractSpeed\(demoG\)/.test(pJsx) && /THE CLOCK IS YOURS/.test(pJsx))
    check('pin: the panel draws the dial and the shell routes taps to it', /export const DIAL/.test(pArt) && /export function speedHit/.test(pArt) && /s\.speed === i/.test(pArt) && /speedHit\(px, py\)/.test(pJsx) && /setSpeed\(gs, dd\)/.test(pJsx))
    check('pin: a new street resets the dial (startPlay) and the contract view carries it', /speedPick = null; speedCycled = 0/.test(pJsx) && /speed: gs\.speed/.test(pJsx))
}

// ------------------------------------------------- COURT POLISH (#2135)
// The polish pass after the court commands: neighbours' spoken chat actually
// crosses (the fern threshold read 0.06·dt and could never fire), the cold war
// speaks on a cooling clock, the ring tie keeps its law, and the view carries
// the word: a chat event with coordinates, a gold reach tell, a speech bubble.
section('COURT POLISH (#2135): spoken chat, cooling beats, the ring tell')
{
    const park = (g, needs) => {
        g.people[0].r = 3; g.people[0].c = 3; g.people[1].r = 3; g.people[1].c = 4
        g.people.forEach((p) => { p.path = null; p.use = null; p.goal = null; p.working = false; p.faintT = 0; p.chatT = 0; for (const n of NEEDS) p.needs[n] = needs })
        g.visitor = null; g.ivy = null; g.grudge = 0; g.spatCd = 0; g.cmdCd = 0
        return g
    }
    const hangFern = (g) => {
        g.visitor = { name: 'Fern', r: 3, c: 5, x: tileX(5) + TILE / 2, y: tileY(3) + TILE / 2, path: null, state: 'hang', t: 0, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0, hangUntil: 999 }
        g.people[0].r = 3; g.people[0].c = 5; g.people[0].x = tileX(5) + TILE / 2; g.people[0].y = tileY(3) + TILE / 2; g.people[0].path = null; g.people[0].use = null; g.people[0].goal = null; g.people[0].working = false; g.people[0].chatT = 0
        return g
    }

    // the fern chat line crossing — the typo (0.06·dt) meant this NEVER fired
    const gf = hangFern(park(newRun(261), 0.55))
    let fernChat = null
    for (let i = 0; i < Math.round(5 / DT); i++) {
        advance(gf, DT)
        gf.people[0].path = null
        const hit = drain(gf).find((e) => e.t === 'chat' && e.k === 'fern')
        if (hit) fernChat = hit
    }
    check('Fern\u2019s spoken chat line actually crosses and lands a bubble event at the pair',
        !!fernChat && Number.isFinite(fernChat.x) && Number.isFinite(fernChat.y))
    check('the spoken line is one of Fern\u2019s topics in the log too',
        gf.thoughts.some((th) => chatPool(gf).includes(th.text)))

    const gi2 = hangFern(park(newRun(263), 0.55))
    gi2.visitor = null
    gi2.ivy = { name: 'Ivy', r: 3, c: 5, x: tileX(5) + TILE / 2, y: tileY(3) + TILE / 2, path: null, state: 'hang', t: 0, hue: '#a3579b', face: 1, walkPhase: 0, chatT: 0, hangUntil: 999 }
    let ivyChat = null
    for (let i = 0; i < Math.round(5 / DT); i++) {
        advance(gi2, DT)
        gi2.people[0].path = null
        const hit = drain(gi2).find((e) => e.t === 'chat' && e.k === 'ivy')
        if (hit) ivyChat = hit
    }
    check('Ivy\u2019s chat event lands too (the pair midpoint travels with it)',
        !!ivyChat && Number.isFinite(ivyChat.x) && Number.isFinite(ivyChat.y))

    // the cooling beat: sour lines speak ONLY during the cold war, on GRUDGE clocks
    const gc = park(newRun(265), 0.3)
    let cools = 0
    const coolTexts = []
    for (let i = 0; i < Math.round(24 / DT); i++) {
        advance(gc, DT)
        gc.people.forEach((p) => { p.path = null; p.use = null; p.goal = null; p.working = false; for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.5) })
        for (const e of drain(gc)) if (e.t === 'grudge-cool') cools++
    }
    check('the crack silences the gossip and starts the cold war', gc.grudge === 1 && gc.spats === 1)
    check(`the cold war speaks on the cooling clock (${GRUDGE_FIRST_CD}s, then every ${GRUDGE_COOL_CD}s) — two beats in 24 s`,
        cools === 2, `cools=${cools}`)
    gc.thoughts.forEach((th) => { if (COOL_LINES.includes(th.text)) coolTexts.push(th.text) })
    check('a sour beat names itself in the log', coolTexts.length >= 1)

    // make-up is still the only exit — and it silences the sour beats
    gc.people.forEach((p) => { for (const n of NEEDS) p.needs[n] = 0.9 })
    let post = 0
    for (let i = 0; i < Math.round(16 / DT); i++) {
        advance(gc, DT)
        gc.people.forEach((p) => { p.path = null; p.use = null; p.goal = null; p.working = false })
        for (const e of drain(gc)) if (e.t === 'grudge-cool') post++
    }
    check('the thaw ends the cold war AND its sour beat', gc.grudge === 0 && post === 0)

    // peacetime: gossip keeps its clock, sourness stays silent
    const gp = park(newRun(267), 0.55)
    let pc = 0, gossip = 0
    for (let i = 0; i < Math.round(24 / DT); i++) {
        advance(gp, DT)
        gp.people.forEach((p) => { p.path = null; p.use = null; p.goal = null; p.working = false; for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.5) })
        for (const e of drain(gp)) if (e.t === 'grudge-cool') pc++
    }
    gp.thoughts.forEach((th) => { if (HOUSE_LINES.includes(th.text)) gossip++ })
    check('no grudge, no sourness — the cooling beat is grudge-only', pc === 0 && gp.grudge === 0)
    check('the friendly co-presence line keeps its own clock', gossip >= 1, `gossip=${gossip}`)

    // a COMMANDED insult schedules the cooling too — the law is one law
    const gci = park(newRun(269), 0.55)
    court(gci, 'insult')
    check('an ordered insult sets the grudge and arms the first sour beat', gci.grudge === 1 && gci.houseLineCd === GRUDGE_FIRST_CD)

    // the ring tell must match the law: a tie at reach goes to the partner
    const gt = park(newRun(271), 0.55)
    gt.people[1].c = 5
    gt.visitor = { name: 'Fern', r: 5, c: 3, x: 0, y: 0, path: null, state: 'hang', t: 1, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0, hangUntil: 999 }
    check('a tie at arm\u2019s reach addresses the partner — the gold ring will show exactly that',
        courtTarget(gt) && courtTarget(gt).k === 'house')

    // source pins: the view wiring and the marquee teaching must not silently drop
    const cpSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const cpArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const cpJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: both neighbours\u2019 crossings use the honest dt check and speak a chat event',
        (cpSim.match(/partner\.chatT - dt <= 2\.4/g) || []).length === 2 && (cpSim.match(/t: 'chat'/g) || []).length === 2)
    check('pin: the cooling beat emits its own event once', (cpSim.match(/t: 'grudge-cool'/g) || []).length === 1)
    check('pin: the reach ring paints only when a word is ready (cooldown closed, buy mode closed)',
        /g\.cmdCd <= 0/.test(cpJsx) && /courtTarget\(g\)/.test(cpJsx) && /ctx\.ellipse\(t\.p\.x/.test(cpJsx))
    check('pin: spoken lines render as a bubble over the pair (art + shell + all five spoken events)',
        /export function drawSay/.test(cpArt) && /drawSay\(ctx, sayB\)/.test(cpJsx) && (cpJsx.match(/showSay\(s, e\)/g) || []).length === 7)
    check('pin: the marquee teaches C/X and the ring tell', /SAY THE KIND THING \u2014 C coos, X cuts\./.test(cpJsx) && /gold ring/.test(cpJsx))
}

console.log(`\n=== peoplecheck: ${pass} pass, ${fail} fail ===`)

if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
