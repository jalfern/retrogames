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
//
// It proves IT can fail the playbook way: break one load-bearing line in sim.js
// (content accrual in finishUse) and the WINNABLE section goes red; restore.
//
// Run: node scripts/peoplecheck.mjs

import {
    FIXED_DT, W, H, COLS, ROWS, MAP, TILE, WIN_CONTENT, NEEDS,
    CATALOG, DEF, tileOf, tileX, tileY,
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, sellAt, targetsOf, walkable, bfsPath, stateHash,
} from '../src/games/Homebody/sim.js'

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
    check('thirteen catalog pieces with prices', CATALOG.length === 13 && CATALOG.every((d) => d.price > 0))
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

console.log(`\n=== peoplecheck: ${pass} pass, ${fail} fail ===`)
if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
