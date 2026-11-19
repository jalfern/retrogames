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
//   6c. COURT PICK — #2235: a contested ring is the player's choice: tap a
//                  shared-ring person and they hear the next words until they
//                  leave the ring; uncontested rings keep the nearest law.
//   6d. GO-SAY — #2683: choose WHICH two share the ring: a tap on Fern/Ivy/Pip
//                  beyond reach walks the resident over and the coo lands the
//                  tick they meet — pick promotion, cooldown wait, honest folds,
//                  bounded chase, queue parity, speaks-as-itself, hash.
//   7. SECOND VISITOR — #2143: Ivy, the market neighbour — her own schedule
//                  window, rel.ivy ladder (growth, one-rel-up law, fade and
//                  demote), the FRIENDS+/FAMILY gift economy, linger/return
//                  ladder math, court + roomClear + hash carries, determinism.
//   8. PET (#2197) — Miso, the adoptable cat: counter law (price, one cat,
//                  honest refusal at the gate), legal wandering, self-served
//                  kibble, night sleep with energy payback, the coo law with
//                  its cooldown, hash carries, attract-bot adoption, and the
//                  wish still landing with a cat on the lot.
//   8b. PET POLISH (#2200) — mood law (petMood average, alarm at RED_AT),
//                  the visible kibble bowl (feedT arms and fades), the
//                  greeting law (once per visit, Fern and Ivy, ladder bump,
//                  seed-exact), and the panel/shell source pins.
//   9. PAPER ROUTE (#2238) — hourly news: lands 06:30–10:00, exactly one a
//                  day (the day stamp is the law), tap-to-read pays FUN and
//                  consumes, unread rots at midnight, sale refuses, hash and
//                  determinism carry, and the bot reads it in attract.
//  10. MEAL BELLS (#2244) — three hour-scheduled plates a day beside the
//                  kitchen: one helping per resident (the serial stamp), a cold
//                  window, honest skips without a kitchen, midnight rots, sale
//                  refuses, the shared-table law pays social/bond/content once
//                  per plate, hash and determinism carry, and the bot eats in
//                  attract with the wish still landing.
//  11. FIRST PASS (#2253) — the newcomer's law: day 1 decays at half pace,
//                  every need crossing into amber raises one named prompt
//                  (need → fix, re-armed by recovery), an issued order rings
//                  its target, and the banner sits on the lawn, not over the
//                  residents.
//  12. GIFT LANDS & TIMBRES (#2240) — the FRIENDS+ basket is PHYSICALLY set
//                  down beside the fridge (honey rides FAMILY) with its own
//                  event, timer and hash-silence; Fern and Ivy own distinct
//                  call motifs and entrance footfalls; the attract rings Ivy
//                  once per run and a chat at her ring actually lands.
//  13. GARBAGE DAY (#2303) — the truck keeps the street: every third day,
//                  the eve announces once and fixes a dawn hour, the bin is
//                  wheeled to the curb (order or quiet-lot autonomy), the
//                  collection pays fun/bond/one content, and a missed set-out
//                  skips the whole cycle honestly; hash carries and the wish
//                  still lands.
//  14. ICE CREAM TRUCK (#2503) — the jingle passes on warm afternoons: an
//                  arithmetic hour (never rng) drops one cone at the curb per
//                  day, the till pays for it (broke refuses at the tap and at
//                  the curb), one serving retires with the sale, the child
//                  beats the toy box to it, and the leftovers leave with the
//                  truck; hash carries and the wish still lands.
//
// It proves IT can fail the playbook way: break one load-bearing line in sim.js
// (content accrual in finishUse, or the relAdd(s,'fern') feed in the visitor
// chat block, or the relAdd(s,'ivy') feed in Ivy's chat block) and the matching
// sections go red; restore.
//
// Run: node scripts/peoplecheck.mjs

import {
    FIXED_DT, W, H, COLS, ROWS, MAP, TILE, LOT_X, LOT_Y, WIN_CONTENT, NEEDS,
    CATALOG, DEF, tileOf, tileX, tileY, SFX, RED_AT, EXT_ROOM,
    REL_NAMES, relLevel, chatPool,
    SPAT_DROP, SPAT_SOCIAL, SPAT_CD, MAKEUP_BOND, moodOf, avg,
    COOL_LINES, HOUSE_LINES, GRUDGE_FIRST_CD, GRUDGE_COOL_CD,   // #2135: the cooling beat
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, placeOk, sellAt, targetsOf, walkable, bfsPath, stateHash, buildRoom, buildRoomOk, canPlace,   // #2689: canPlace joins for the two-wing bedroom law
    manualMove,
    court, courtTarget, COO_BOND, AFFECTION_BOND, INSULT_DROP, CMD_CD, REL_EDGES,   // #2131
    courtHoldArm, courtTick, courtTap, HOLD_INSULT_MS,   // #2171: thumb court
    courtReach, courtPickSet,   // #2235: choose your court target
    cmdGoSay, goSayTarget, GO_SAY_CHASE, GO_SAY_SETTLE, COURT_REACH,   // #2683: go-say — the far tap walks the word over; #2697: the settle cadence
    farCycle, FAR_EARS,   // #2708 tail 5: the desktop far-tap — T cycles the ear, C says it
    cmdQueue, orderBusy,   // #2470: the queue law the promise rides
    ivyChatPool, IVY_CHAT, IVY_FADE, IVY_GIFT_HUNGER, IVY_GIFT_CASH,   // #2143
    adoptPet, adoptOk, PET, PET_COOS,   // #2197: Miso
    petMood, PET_FEED_T, CAT_MEET_BOND, CAT_MEET_DIST,   // #2200: mood row, visible kibble, meet law
    adoptKid, adoptKidOk, KID,   // #2203: Pip
    CAT_TABS, TAB_CARDS, TAB_OF, tabCards, setSel, flipTab, selectTab, digitCard,   // #2222: catalog shelves
    SPEED_MULT, SPEED_NAMES, setSpeed, cycleSpeed, attractSpeed,   // #2227: the speed dial
    TRI_TELL_CD, TRI_LINES, IVY_SOCIAL,   // #2154: visitor choreography law
    NEIGH_CHAT, NEIGH_GLANCE, NEIGH_FADE, NEIGH_COOL_CD, NEIGH_WARM, NEIGH_LINES,   // #2588: the third-party bond
    NEIGH_IGNORE_T, NEIGH_SPAT_DROP, NEIGH_MAKEUP, NEIGH_SPAT_CD,   // #2604: the pair's own quarrel law
    NEIGH_MEDIATE_PAY,   // #2672: the mediators — soft warmth of the break-up
    NEIGH_STROLL_T, NEIGH_SPOTS, NEIGH_STROLL_LINES,   // #2611: the pair's circuit — bank, spots, beat lines
    NEIGH_MURMUR_CD, NEIGH_SOUR_LINES,   // #2599 handoff 2: the cold-war murmur — clock and sour lines
    PAPER, PAPER_LATE, PAPER_LINES,   // #2238: the paper route
    MEAL, MEAL_NAMES, MEAL_DUE, MEAL_WINDOW, MEAL_BOND, MEAL_LINES, SHARED_MEAL_LINES, HOUR_SEC,   // #2244: the meal bells
    MEAL_TIMBRE, SHARED_TABLE_CHORDS, sharedChord, nightLevel,   // #2264: per-bell timbres, the rotating table chord, one night curve
    AMBER_AT, DAY1_GRACE, NEED_HINT,   // #2253: the first-time player pass
    GIFT_LAND_T, VISIT_TIMBRE,   // #2240: the set-down basket + the visitor timbres
    YARN_CD, YARN_CAT_FUN, YARN_BOND, YARN_SOCIAL, YARN_PLAY_T, PET_SELF_FUN, PET_BORED, yarnOrderOk,   // #2256: the yarn ball — ordered play + the cat's own game
    BIN, BIN_HOME, BIN_CURB, GARBAGE_EVERY, TRUCK_DUE, BIN_FUN, BIN_BOND, binOrderOk,   // #2303: garbage day — the eve, the curb, the truck
    CONE, CONE_PRICE, ICE_DUE, ICE_WINDOW, ICE_FUN, ICE_KID_FUN, KID_ICE_FLOOR, coneOrderOk, ringTruck, icePassHour, ICE_TIMBRE, ICE_ENDINGS,   // #2503: the ice-cream truck — the jingle, the curb, the price, the chase
    ICE_HOLD_T, ICE_DRIPS, coneDripCount,   // #2508 item 3: the eat beat — the hold, its drips, the drip math
    SNEAK_DUE, SNEAK_WINDOW, SNEAK_LOOT, sneakNightDue, hasAlarm, ringSneak, SNEAK_CREEP, SNEAK_SIREN,   // #2520: the sneak — the window, the loot list, the parity, the alarm, the rig
    PROWL_DUE, PROWL_WINDOW, prowlNightDue, PET_PROWL_FUN, ringProwl, PROWL_PADS, PROWL_HOME_SFX,   // #2532: Miso's even-night prowl — the window, the parity, the cat-scale pay, the rig, the sound tables
    eastWing, GARDEN, EAST_ANCHORS, DEFAULT_ANCHOR, wingPick, wingGeom, WINGS_MAX, groundAt,   // #2689: deeper multi-room — the anchor law, the garden cottage, the pick
    wingSets,   // #2705: the purpose view's floor question — exported from the law's own module
    TEND_HOURS, HARVEST_FOOD, HARVEST_FUN, LODGE_FUN,   // #2695: rooms with purpose — the sun law and the lodging law
    archetypeOf, onWingFloor, PAGES_INSIGHT, READ_INSIGHT_FUN, PLAYS_DELIGHT, KID_ROOM_FUN, KID_ROOM_BOND,   // #2736: rooms with a personality — the study and the playroom
    ROUTE, JAR_CAP,   // #2721: the kit-two economy window — Pip's round and the earmarked garden jar
    wingToyOn, surplusToyOk, buyWingToy,   // #2752: the jar's surplus clause — the fund's next round names a room
} from '../src/games/Homebody/sim.js'
import { bondRows, pairStride, strollTrail, STRIDE_BOB, jarRow } from '../src/games/Homebody/art.js'   // #2599: the BONDS rows are pure data — the view gate reads them straight; #2618: so are the stride and the trail · #2729: and the jar row
import { promiseTell, earReact, gardenLamp, EAR_REACT, PROMISE_TIGHTEN, EAR_HUES, PAIR_HUES, LOST_RING_T } from '../src/games/Homebody/art.js'   // #2688: the go-say tells and the garden lamp are pure derivations too
import { ripenessOf, hamperLoad, sleepingCells, wingLodged, moonlitWait, HAMPER_CAP, pauseLedger } from '../src/games/Homebody/art.js'   // #2705: the purpose view — ripeness ramp, harvest hamper, lodged panes, moonlit wait, all pure derivations (+ #2713 the pause-sheet ledger)
import { roomBadges } from '../src/games/Homebody/art.js'   // #2736: the door badge is a pure derivation too
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
    check('nineteen catalog pieces with prices; Spare Room card 14 keyed R, Adopt a Cat card 15 keyed P, Adopt a Child card 16 keyed K, Yarn Ball card 17 cat-only, Canopy Bed card 18 wing-only, Burglar Alarm card 19', CATALOG.length === 19 && CATALOG.every((d) => d.price > 0) && CATALOG[13].id === 'roomkit' && CATALOG.filter((d) => d.room).length === 1 && CATALOG[14].id === 'petkit' && CATALOG.filter((d) => d.pet).length === 1 && CATALOG[15].id === 'kidkit' && CATALOG.filter((d) => d.kid).length === 1 && CATALOG[16].id === 'yarn' && CATALOG[16].catOnly === true && CATALOG[17].id === 'canopy' && CATALOG.filter((d) => d.wingOnly).length === 1 && CATALOG[18].id === 'alarm')   // #2197/#2203/#2256/#2272/#2520
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
    check('the lot grows twice: kit two raises the garden, kit three is refused', g9.ext === 1 && buildRoom(g9) && g9.ext === 2 && !buildRoom(g9))   // #2689 lifts #1806's one-per-lot

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

section('WINGS (#2689): choose the row, raise the garden — deeper multi-room')
{
    // the anchor law is arithmetic off the map, not a taste table: a row is a
    // site exactly when its punched door meets a house-floor cell
    const derived = []
    for (let r0 = 0; r0 + 5 < ROWS; r0++) if (groundAt(r0 + 2, 10) === 'floor') derived.push(r0)
    check('EAST_ANCHORS IS the door-into-floor law (derived from MAP independently)', JSON.stringify(derived) === JSON.stringify(EAST_ANCHORS), `derived ${derived.join(',')}`)
    check('row 3 is out — bricks west of its door', groundAt(5, 10) !== 'floor')

    // every legal anchor stands, connects, and drains to the kerb
    for (const r0 of EAST_ANCHORS) {
        const g = newRun(501 + r0)
        g.money = 99999
        const w = eastWing(r0)
        const ok = buildRoom(g, w)
        const doorOk = walkable(g, w.door[0], w.door[1]) && groundAt(w.door[0], w.door[1] - 1) === 'floor'
        const deepest = w.floor[w.floor.length - 1]
        const intoHouse = !!bfsPath(g, { r: deepest[0], c: deepest[1] }, [{ r: 3, c: 3 }])
        const toKerb = !!bfsPath(g, { r: deepest[0], c: deepest[1] }, [{ r: 12, c: 5 }])
        const floorAll = w.floor.every(([r, c]) => walkable(g, r, c))
        const wallAll = w.walls.every(([r, c]) => !walkable(g, r, c))
        check(`anchor r0=${r0}: stands, door onto floor, room walkable, walls sealed, kerb+house reachable`, ok && doorOk && intoHouse && toKerb && floorAll && wallAll)
    }

    const g3 = newRun(507)
    g3.money = 99999
    check('a door onto bricks refuses — the law rejects an illegal anchor even by direct call', !buildRoomOk(g3, eastWing(3)) && !buildRoom(g3, eastWing(3)))

    // the pick: west of the lawn keeps the classic row (muscle memory + bot);
    // pointing east slides the anchor to the cursor and snaps illegal rows near
    check('pick: cursor west of the lawn keeps the classic row', wingPick(newRun(1), 6, 8).r0 === DEFAULT_ANCHOR && DEFAULT_ANCHOR === 2)
    check('pick: pointing at row 1 takes row 1', wingPick(newRun(1), 1, 13).r0 === 0)
    check('pick: pointing at row 5 snaps off the illegal row 3', wingPick(newRun(1), 5, 12).r0 === 2)
    check('pick: pointing at the bottom lawn takes row 5', wingPick(newRun(1), 11, 12).r0 === 5)
    check('pick: once one wing stands, the card points at the garden', (() => { const s = newRun(2); s.money = 99999; buildRoom(s, eastWing(2)); return wingPick(s, 6, 8) === GARDEN })())

    // the garden cottage: stands after any anchor, links the house, drains the lot
    for (const r0 of EAST_ANCHORS) {
        const g = newRun(601 + r0)
        g.money = 99999
        buildRoom(g, eastWing(r0))
        const ok = buildRoom(g, GARDEN)
        const links = walkable(g, 8, 2) && groundAt(7, 2) === 'floor'
        const toHouse = !!bfsPath(g, { r: 9, c: 2 }, [{ r: 3, c: 3 }])
        const toKerb = !!bfsPath(g, { r: 10, c: 3 }, [{ r: 12, c: 5 }])
        const mailOk = targetsOf(g, { id: 'mail', r: 11, c: 6 }).some((t) => walkable(g, t.r, t.c) && !!bfsPath(g, { r: 12, c: 5 }, [{ r: t.r, c: t.c }]))
        const gateOk = !!bfsPath(g, { r: 8, c: 5 }, [{ r: 12, c: 5 }])
        check(`garden after r0=${r0}: stands, south door links house, kerb+mail+back-gate stay reachable`, ok && links && toHouse && toKerb && mailOk && gateOk)
    }
    check('WINGS_MAX is two — a third kit refuses', (() => { const s = newRun(611); s.money = 99999; buildRoom(s, eastWing(2)); buildRoom(s, GARDEN); return s.ext === WINGS_MAX && !buildRoom(s, eastWing(4)) })())

    // the guards stay honest around the garden: a resident on a future wall cell
    // (not even the footprint!) refuses the hammer — keepsWing, not roomClear
    const gW = newRun(613)
    gW.money = 99999
    buildRoom(gW, eastWing(2))
    gW.people[0].r = 9; gW.people[0].c = 4; gW.people[0].x = tileX(4) + 16; gW.people[0].y = tileY(9) + 16
    check('the garden refuses while a resident stands on a future wall cell (keepsWing)', !buildRoomOk(gW, GARDEN) && !buildRoom(gW, GARDEN))
    const gF = newRun(617)
    gF.money = 99999
    buildRoom(gF, eastWing(2))
    gF.people[0].r = 10; gF.people[0].c = 1; gF.people[0].x = tileX(1) + 16; gF.people[0].y = tileY(10) + 16
    check('and while one stands on the future planks (roomClear)', !buildRoomOk(gF, GARDEN))

    // the bedroom bed fits either room's floorboards (#2272 law, now two homes)
    const gB = newRun(619)
    gB.money = 99999
    buildRoom(gB, eastWing(2))
    buildRoom(gB, GARDEN)
    check('canopy bed fits the east wing AND the garden floorboards', canPlace(gB, DEF.canopy, 4, 13) && canPlace(gB, DEF.canopy, 9, 2) && !canPlace(gB, DEF.canopy, 5, 8))

    // move-in reactions ride the NEWEST wing (#1814, now twice)
    const gR = newRun(623)
    gR.money = 99999
    buildRoom(gR, eastWing(2))
    for (const p of gR.people) p.roomSeen = true
    buildRoom(gR, GARDEN)
    check('the garden re-arms the move-in ledger and the reaction cells stand inside it', gR.roomReact === gR.people.length && GARDEN.react.every(([r, c]) => walkable(gR, r, c)) && wingGeom({ id: 'garden' }) === GARDEN)

    // the hash carries WHICH rooms stand WHERE, twins stay one world
    const tA = newRun(631); tA.money = 99999; buildRoom(tA, eastWing(2)); buildRoom(tA, GARDEN)
    const tB = newRun(631); tB.money = 99999; buildRoom(tB, eastWing(2)); buildRoom(tB, GARDEN)
    const tC = newRun(631); tC.money = 99999; buildRoom(tC, eastWing(4)); buildRoom(tC, GARDEN)
    check('twins: same seed, same wings, one hash', stateHash(tA) === stateHash(tB))
    check('a different anchor row is a different world', stateHash(tA) !== stateHash(tC))

    // source pins: the law lives in the sim, the view only reads it
    const wSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const wJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: roomClear asks the links law before the hammer', /roomClear\(s, g\)[\s\S]*?g\.links\.every/.test(wSrc))
    check('pin: place routes the kit through the pick — the cursor row is the site', /if \(def\.room\) \{[\s\S]*?wingPick\(s, r, c\)/.test(wSrc))
    check('pin: nothing but wingPick hands the autopilot a site — the classic row is its only one', /if \(id === 'roomkit'\)[\s\S]*?place\(s, 0, 0\)/.test(wSrc))
    // #2714: the demo runs the real economy to a win one wing deep — the marquee
    // teaches kit two as a savings goal (§300), never as a second growth that lands.
    check('pin: the marquee teaches TWO growths — and the economy now funds the second (#2721)', /THE LOT GROWS TWICE/.test(wJsx) && /paper round fills the garden jar/.test(wJsx), wJsx.match(/THE LOT GROWS[^']*/)?.[0]?.slice(0, 90))
    check('pin: the ghost is a pure read — drawWingGhost takes geometry, never mutates', /export function drawWingGhost\(ctx, geom, ok\)/.test(readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')) && /drawWingGhost\(ctx, wingPick\(g, g\.cursor\.r, g\.cursor\.c\)/.test(wJsx))
}

section('PURPOSE (#2695): a room earns its keep — ripening gardens, lodging wings')
{
    // the sun law: tending accrues only through daylit hours, ripe at exactly
    // TEND_HOURS — no early, no late. dh is re-derived per tick exactly the
    // way advance() does it (the work clock runs 8×, granularity included).
    const Dh = (st) => FIXED_DT / 1000 / HOUR_SEC * (st.people.some((p) => p.working) ? 8 : 1)
    const ripen = (st, capTicks = 60 * 60) => {
        let cum = 0
        for (let i = 0; i < capTicks; i++) {
            cum += Dh(st)
            advance(st, FIXED_DT / 1000)
            if (st.wings.some((w) => w.id === 'garden' && (w.herbs || 0) > 0)) break
        }
        return cum
    }
    const s1 = newRun(701); s1.money = 99999; buildRoom(s1, GARDEN); s1.hour = 8
    const h1 = ripen(s1)
    const gw1 = s1.wings.find((w) => w.id === 'garden')
    check(`first harvest at exactly TEND_HOURS (${TEND_HOURS}) — not early, not late`, gw1.herbs === 1 && Math.abs(h1 - TEND_HOURS) < 0.05, `elapsed ${h1.toFixed(3)}h, leftover tend ${gw1.tend.toFixed(3)}`)
    check('a second bed ripens on the reset clock', Math.abs(gw1.tend) < 0.01 && gw1.herbs === 1)

    // night silences the garden — the ripening bed waits for morning
    const s2 = newRun(702); s2.money = 99999; buildRoom(s2, GARDEN)
    s2.hour = 8
    for (let i = 0; i < 60 * 60; i++) { advance(s2, FIXED_DT / 1000); if (s2.wings[0].tend >= 1) break }   // a bed half-ripened
    const half = s2.wings[0].tend
    const c2 = s2.content
    check('sanity: the midday bed is ripening between 1 and TEND_HOURS', half >= 1 && half < TEND_HOURS, `tend ${half.toFixed(3)}`)
    s2.hour = 23
    for (let i = 0; i < 60 * 20; i++) advance(s2, FIXED_DT / 1000)   // four sim-hours of dark, still before dawn
    check('night stops the clock — no tending, no harvest, no pride', s2.wings[0].tend === half && s2.wings[0].herbs === 0 && s2.content <= c2, `tend ${half}→${s2.wings[0].tend}`)

    // the hungriest eats what was picked; ties keep roster order — fixed, pure
    const s3 = newRun(703); s3.money = 99999; buildRoom(s3, GARDEN); s3.hour = 8
    s3.people.forEach((p, i) => { p.needs.hunger = i === 1 ? 0.2 : 0.5 })
    ripen(s3)
    check('harvest feeds the hungriest resident (named event)', s3.events.some((e) => e.t === 'harvest' && e.name === s3.people[1].name))
    const s3t = newRun(704); s3t.money = 99999; buildRoom(s3t, GARDEN); s3t.hour = 8
    s3t.people.forEach((p) => { p.needs.hunger = 0.3 })
    ripen(s3t)
    check('an even hunger is settled by roster order, not the rng', s3t.events.some((e) => e.t === 'harvest' && e.name === s3t.people[0].name))
    const s3j = newRun(705); s3j.money = 99999; buildRoom(s3j, GARDEN); s3j.hour = 8
    const c3 = s3j.content
    ripen(s3j)
    check('the house takes the pride — one contentment per harvest', s3j.content === c3 + 1)

    // the Spare Room law: lodging rides the GEOMETRY, one lodging per night
    const lodge = (st, p, bed) => {
        p.use = { it: bed, def: DEF.canopy, t: 0, dur: 9, night: true }
        st.hour = 10   // the morning the existing sleep law wakes night sleepers
        for (let i = 0; i < 60 * 3 && p.use; i++) advance(st, FIXED_DT / 1000)
    }
    const s4 = newRun(706); s4.money = 99999; buildRoom(s4, eastWing(2))
    s4.items.push({ uid: 91, id: 'canopy', r: 4, c: 12 })
    const bed4 = s4.items[s4.items.length - 1]
    const f4a = s4.people[0].needs.fun; const f4b = s4.people[1].needs.fun
    lodge(s4, s4.people[0], bed4)
    const ew4 = s4.wings.find((w) => w.id === 'east')
    check('waking in the wing pays the rested joy', s4.people[0].needs.fun > f4a + LODGE_FUN - 0.03 && s4.events.some((e) => e.t === 'lodged' && e.name === s4.people[0].name))
    check('the room keeps one lodging per night', ew4.sleptWell === 1 && ew4.lodgeDay === s4.day)
    lodge(s4, s4.people[1], bed4)
    check('the second waker still feels it — but the night is one lodging', ew4.sleptWell === 1 && s4.people[1].needs.fun > f4b + LODGE_FUN - 0.03)

    // a bed outside the room lodges nothing — the law is the geometry
    const s5 = newRun(707); s5.money = 99999; buildRoom(s5, eastWing(2))
    const bedHome = s5.items.find((it) => it.id === 'bed')
    lodge(s5, s5.people[0], bedHome)
    check('the house bed never lodges — only a bed inside the room counts', !s5.events.some((e) => e.t === 'lodged') && s5.wings.find((w) => w.id === 'east').sleptWell === 0)

    // a garden lodges nobody (the east room is the lodging one) and an east
    // wing never ripens — each room keeps to its own purpose
    const s6 = newRun(708); s6.money = 99999; buildRoom(s6, eastWing(2)); s6.hour = 8
    for (let i = 0; i < 60 * 60; i++) advance(s6, FIXED_DT / 1000)
    check('the Spare Room never tends — ripening is the garden\u2019s own', s6.wings.find((w) => w.id === 'east').tend === undefined)

    // an unbuilt lot gains NOTHING: purpose rides only the wing records, and a
    // no-wings run hashes exactly as the pre-#2699 world did (queuecheck's
    // seed-exact pin 3836882361 re-passed untouched against this sim)
    const s7 = newRun(709)
    check('purpose is the room\u2019s own ledger, not the house\u2019s state', !('herbs' in s7) && !('tend' in s7) && s7.wings.length === 0)

    // twins: purpose rides the hash, determinism stays one world
    const drive = (seed) => {
        const st = newRun(seed); st.money = 99999
        buildRoom(st, GARDEN); buildRoom(st, eastWing(2))
        st.items.push({ uid: 92, id: 'canopy', r: 5, c: 13 })
        const bed = st.items[st.items.length - 1]
        st.hour = 8
        lodge(st, st.people[0], bed)
        for (let i = 0; i < 60 * 240; i++) advance(st, FIXED_DT / 1000)   // sun up, sun down
        return st
    }
    const tP1 = drive(711); const tP2 = drive(711)
    check('twins with purpose still one world — determinism green', stateHash(tP1) === stateHash(tP2) && tP1.wings[0].herbs === tP2.wings[0].herbs)
    const tNoRoom = newRun(711); tNoRoom.money = 99999
    for (let i = 0; i < 60 * 240; i++) advance(tNoRoom, FIXED_DT / 1000)
    check('purpose is state — rooms with a harvest hash differently than bare lots', stateHash(tP1) !== stateHash(tNoRoom))

    // source pins: the laws live in the sim, the shell only voices them
    const pSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: purpose mixes ride INSIDE the wings loop — an empty lot adds no mixes', /for \(const w of s\.wings\) \{[\s\S]*?w\.tend[\s\S]*?w\.herbs[\s\S]*?w\.sleptWell[\s\S]*?\}/.test(pSrc.match(/export function stateHash[\s\S]*?\n\}/)[0]))
    check('pin: night silences the garden in the sim itself', /if \(isNight\(st\)\) continue/.test(pSrc))
    check('pin: lodging asks the room geometry, never an item id', /floor\.has\(`\$\{it\.r\},\$\{it\.c\}`\)/.test(pSrc))
    check('pin: the lodging tally stamps the day — one night, one lodging', /w\.lodgeDay !== s\.day/.test(pSrc))
    check('pin: the shell voices ripening and lodging', /THE GARDEN RIPENS/.test(pJsx) && /SLEPT WELL IN THE WING/.test(pJsx))
    check('pin: the view carries what each room earned', /purpose: gs\.wings\.map/.test(pJsx))
}

section('LEDGER SHEET (#2713 tail 4): the pause sheet reads what the rooms provide')
{
    // #2705 tail 4: sleptWell/herbs were view-only — the tally reached the
    // screen as a momentary toast and never stayed readable. pauseLedger (art)
    // derives the pause rows from the wing records; the shell snaps it the
    // moment '?' seats the sheet (a paused world ticks nothing, so the snap IS
    // the live truth); PauseOverlay draws rows from a generic per-game slot —
    // the overlay stays game-blind (the CAUTION: no forking the shared sheet).
    const bare = newRun(731)
    check('a bare lot answers null — every sheet without a ledger is byte-for-byte unchanged', pauseLedger(bare) === null && pauseLedger(null) === null)

    const s1 = newRun(732); s1.money = 99999; buildRoom(s1, eastWing(2))
    s1.wings.find((w) => w.id === 'east').sleptWell = 3
    const L1 = pauseLedger(s1)
    check('the east room names itself and its lodged tally', L1 && L1.rows.length === 1 && L1.rows[0].text === 'SPARE ROOM — lodged 3' && L1.rows[0].n === 3 && L1.rows[0].color === '#a8d4ee')

    const s2 = newRun(733); s2.money = 99999; buildRoom(s2, GARDEN)
    s2.wings[0].herbs = 2
    const L2 = pauseLedger(s2)
    check('the garden row counts herbs in the harvest green', L2 && L2.rows.length === 1 && L2.rows[0].text === 'HERBS 2' && L2.rows[0].n === 2 && L2.rows[0].color === '#7ec850')

    // live tallies ride it — lodge a night, ripen a bed, read the sheet
    const lodge = (st, p, bed) => {
        p.use = { it: bed, def: DEF.canopy, t: 0, dur: 9, night: true }
        st.hour = 10
        for (let i = 0; i < 60 * 3 && p.use; i++) advance(st, FIXED_DT / 1000)
    }
    const s3 = newRun(734); s3.money = 99999
    buildRoom(s3, eastWing(2)); buildRoom(s3, GARDEN)
    s3.items.push({ uid: 93, id: 'canopy', r: 4, c: 12 })
    lodge(s3, s3.people[0], s3.items[s3.items.length - 1])
    s3.hour = 8
    for (let i = 0; i < 60 * 60 * 2; i++) { advance(s3, FIXED_DT / 1000); if (s3.wings.some((w) => w.herbs > 0)) break }
    const L3 = pauseLedger(s3)
    check('earned tallies ride the sheet — one lodged night, one harvest, both rooms', L3 && L3.title === 'THE HOUSE PROVIDES' && L3.rows.some((r) => r.text === 'SPARE ROOM — lodged 1' && r.n === 1) && L3.rows.some((r) => r.text === 'HERBS 1' && r.n === 1), JSON.stringify(L3))

    // purity: the view never touches the world — no mutation, twins one world,
    // and the hash never hears of the sheet (queuecheck's seed pin stays put)
    const twin = (seed) => { const st = newRun(seed); st.money = 99999; buildRoom(st, GARDEN); buildRoom(st, eastWing(2)); st.wings[0].herbs = 1; st.wings[1].sleptWell = 2; return st }
    const tA = twin(735); const tB = twin(735)
    const hBefore = stateHash(tA)
    const jA = JSON.stringify(pauseLedger(tA)); JSON.stringify(pauseLedger(tA))
    check('the ledger is pure — the same lot reads the same sheet, twice, unchanged', jA === JSON.stringify(pauseLedger(tB)) && stateHash(tA) === hBefore)

    // source pins: the overlay stays generic (no room names), the pips cap,
    // the shell wires the pure derivation, and the WORDS live in the game
    const pSheetJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const ovSrc = readFileSync(new URL('../src/components/PauseOverlay.jsx', import.meta.url), 'utf8')
    check('pin: the shared overlay is game-blind — the words are authored per-game', !/SPARE ROOM|HERBS|THE HOUSE PROVIDES/.test(ovSrc) && /ledger\?\.rows\?\.length/.test(ovSrc))
    check('pin: pip rows cap at eight — a long tally can never eat the sheet', /Math\.min\(Math\.max\(row\.n \|\| 0, 0\), 8\)/.test(ovSrc))
    check('pin: the shell snaps the ledger at the pause toggle (a paused world is the truth)', /setLedgerSnap\(pausedRef\.current \? pauseLedger\(gs\)/.test(pSheetJsx) && /ledger=\{ledgerSnap\}/.test(pSheetJsx))
    check('pin: the pause sheet\u2019s copy lives in the view module, beside the other purpose derivations', /export function pauseLedger/.test(readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')))
}

section('PERSONALITY (#2736): rooms read their own furniture — a study that reads, a playroom the child gravitates to')
{
    const mkEast = (seed) => { const g = newRun(seed); g.money = 99999; buildRoom(g, eastWing(2)); g.hour = 8; return g }

    // ---- naming by contents: the room is called by what stands on it ----
    const a0 = mkEast(701)
    check('an empty wing has earned no name', archetypeOf(a0, a0.wings[0]) === null)
    a0.items.push({ uid: 2701, id: 'book', r: 3, c: 13 })
    check('a bookshelf on the boards names the study', archetypeOf(a0, a0.wings[0]) === 'study')
    a0.items.push({ uid: 2702, id: 'tv', r: 5, c: 13 })
    check('a toy in the study is still a study — shelf outranks toy', archetypeOf(a0, a0.wings[0]) === 'study')
    a0.items.push({ uid: 2703, id: 'canopy', r: 6, c: 13 })
    check('the bed outranks everything — the deepest purpose names the room', archetypeOf(a0, a0.wings[0]) === 'bedroom')
    const pOnly = mkEast(702); pOnly.items.push({ uid: 2704, id: 'radio', r: 5, c: 12 })
    check('a radio alone names the playroom', archetypeOf(pOnly, pOnly.wings[0]) === 'playroom')
    const gar = newRun(703); gar.money = 99999; buildRoom(gar, GARDEN); gar.hour = 8
    gar.items.push({ uid: 2705, id: 'book', r: 9, c: 2 })
    check('the garden cottage can study too — personality is contents, not kit', archetypeOf(gar, gar.wings[0]) === 'study')
    const noext = newRun(704)
    check('a lot without wings names nothing', archetypeOf(noext, noext.wings.length ? noext.wings[0] : null) === null)

    // ---- the study law: three finished reads make an insight ----
    const read = (g, p, it, sink) => {
        cmdUse(g, p, it)
        let n = 0
        while (n++ < 60 * 60) {
            g.hour = 8
            advance(g, DT)
            const ev = drain(g)
            if (sink) sink.push(...ev)
            if (ev.some((e) => e.t === 'satisfied' && e.name === p.name)) return true
        }
        return false
    }
    const st = mkEast(706)
    st.items.push({ uid: 2706, id: 'book', r: 3, c: 13 })
    const book = st.items[st.items.length - 1]
    const otto = st.people[0]
    const funAt = () => otto.needs.fun
    const cAt = () => st.content
    st.wings[0].insights = 0
    const sink = []
    const okReads = []
    const deltas = []
    for (let i = 0; i < PAGES_INSIGHT; i++) {
        otto.needs = { hunger: 0.6, fun: 0.1, social: 0.6, energy: 0.6, bladder: 0.6 }
        const f0 = funAt(); const c0 = cAt()
        okReads.push(read(st, otto, book, sink))
        deltas.push({ fun: funAt() - f0, content: cAt() - c0 })
    }
    const studied = sink.filter((e) => e.t === 'studied').length
    check('all three errands land in the room', okReads.every(Boolean), JSON.stringify(okReads))
    check('pages accrue one per finished read and reset on the pay', st.wings[0].pages === 0 && st.wings[0].insights === 1, `pages=${st.wings[0].pages} insights=${st.wings[0].insights}`)
    check('the third read fires the studied event exactly once', studied === 1, `studied=${studied}`)
    check('the insight lifts the reader — the paying read carries READ_INSIGHT_FUN extra',
        Math.abs(deltas[0].fun - 0.4) < 0.001 && Math.abs(deltas[1].fun - 0.4) < 0.001 && Math.abs(deltas[2].fun - (0.4 + READ_INSIGHT_FUN)) < 0.001,
        JSON.stringify(deltas.map((d) => Math.round(d.fun * 1000) / 1000)))
    check('quiet pride — the paying read adds one contentment on top',
        deltas[0].content === deltas[1].content && deltas[2].content === deltas[0].content + 1, JSON.stringify(deltas.map((d) => d.content)))
    const studEv = sink.find((e) => e.t === 'studied')
    check('#2743 the insight event names the room that paid', !!studEv && studEv.room === 'study', studEv ? String(studEv.room) : 'no studied event')

    // the living-room shelf stays plain: the clause is the ROOM's, not the item's
    const hl = mkEast(707)
    let houseBook = null
    for (let r = 0; r < ROWS && !houseBook; r++) for (let c = 0; c < COLS && !houseBook; c++) {
        if (groundAt(r, c) !== 'floor' || c >= 11) continue   // any house-floor cell west of the rooms
        hl.items.push({ uid: 2707, id: 'book', r, c })
        houseBook = hl.items[hl.items.length - 1]
    }
    check('scenario: a living-room bookshelf found for the control', !!houseBook)
    let houseReads = 0
    for (let i = 0; i < PAGES_INSIGHT; i++) if (read(hl, hl.people[0], houseBook)) houseReads++
    check('control: the house reads actually land', houseReads === PAGES_INSIGHT, `${houseReads}/${PAGES_INSIGHT}`)
    check('a house-floor shelf turns no pages — three reads, still zero insight',
        (hl.wings[0].pages || 0) === 0 && (hl.wings[0].insights || 0) === 0, `pages=${hl.wings[0].pages} insights=${hl.wings[0].insights}`)

    // ---- the playroom pull: the child crosses the lot for the in-room toy ----
    const kidRun = (seed) => { const g = mkEast(seed); g.money = 99999; adoptKid(g); g.hour = 8; return g }
    const nearHouseFloor = (g, pr, pc) => {
        let best = null, bd = 1e9
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < 10; c++) {   // house side only (cols < 10)
            if (groundAt(r, c) !== 'floor') continue
            const d = Math.abs(r - pr) + Math.abs(c - pc)
            if (d < bd) { bd = d; best = { r, c } }
        }
        return best
    }
    const pull = kidRun(708)
    const k8 = pull.kid
    const near = nearHouseFloor(pull, k8.r, k8.c)
    pull.items.push({ uid: 2708, id: 'radio', r: near.r, c: near.c })          // nearer toy, house floor
    const wingTv = { uid: 2709, id: 'tv', r: 5, c: 13 }
    pull.items.push(wingTv)                                                      // farther toy, the room
    const dNear = Math.abs(near.r - k8.r) + Math.abs(near.c - k8.c)
    const dWing = Math.abs(5 - k8.r) + Math.abs(13 - k8.c)
    k8.needs.fun = 0.2
    let pick = null
    for (let i = 0; i < 60 * 5 && !pick; i++) { pull.hour = 8; advance(pull, DT); drain(pull); if (k8.playObj && k8.playIt) pick = k8.playIt }
    check('the pull is real — the room toy stands farther than the house toy', dWing > dNear, `wing=${dWing} house=${dNear}`)
    check('the child gravitates: the funnel pick prefers the in-room TV over the nearer radio', pick === wingTv, pick ? pick.id : 'no pick')
    // control: without a room, the nearest law keeps its seat
    const plain = kidRun(709)
    const k9 = plain.kid
    const near2 = nearHouseFloor(plain, k9.r, k9.c)
    plain.items.push({ uid: 2710, id: 'radio', r: near2.r, c: near2.c })
    k9.needs.fun = 0.2
    let pick2 = null
    for (let i = 0; i < 60 * 5 && !pick2; i++) { plain.hour = 8; advance(plain, DT); drain(plain); if (k9.playObj && k9.playIt) pick2 = k9.playIt }
    check('no room, no pull — the nearest-fun law is byte-unchanged on a bare wing lot', pick2 && pick2.id === 'radio', pick2 ? pick2.id : 'no pick')
    // a study does NOT pull the child — books are for grown-ups
    const studieKid = kidRun(710)
    const k10 = studieKid.kid
    const near3 = nearHouseFloor(studieKid, k10.r, k10.c)
    studieKid.items.push({ uid: 2711, id: 'book', r: 5, c: 13 })   // study in the room, far
    studieKid.items.push({ uid: 2712, id: 'radio', r: near3.r, c: near3.c })   // radio near, house
    k10.needs.fun = 0.2
    let pick3 = null
    for (let i = 0; i < 60 * 5 && !pick3; i++) { studieKid.hour = 8; advance(studieKid, DT); drain(studieKid); if (k10.playObj && k10.playIt) pick3 = k10.playIt }
    check('the playroom pull is toys-only — a far book in a study never lures the child', pick3 && pick3.id === 'radio', pick3 ? pick3.id : 'no pick')

    // ---- the delight: three finished in-room plays pay the room ----
    const delight = (seed) => {
        const g = kidRun(seed)
        const k = g.kid
        g.items.push({ uid: 2720 + seed % 7, id: 'tv', r: 5, c: 13 })
        const w = g.wings[0]
        const rel0 = g.rel.kid
        const c0 = g.content
        let laughs = 0, sessions = 0, laRoom = null
        for (let i = 0; i < 60 * 400 && sessions < PLAYS_DELIGHT + 1; i++) {
            g.hour = 8
            if (!k.playObj && !k.food && !k.treat && k.state !== 'bed' && k.state !== 'sleep') k.needs.fun = Math.min(k.needs.fun, 0.2)
            advance(g, DT)
            const ev = drain(g)
            const la = ev.find((e) => e.t === 'kid-laugh')
            if (la) { laughs++; laRoom = la.room }   // #2743: catch which room the laugh names
            if (ev.some((e) => e.t === 'kid-play')) sessions++
        }
        return { g, w, laughs, sessions, dRel: g.rel.kid - rel0, dContent: g.content - c0, h: stateHash(g), laRoom }
    }
    const dl = delight(711)
    check('plays accrue at the room toy and cash at the third — delight paid once',
        dl.w.delights === 1 && dl.w.plays === 1, `delights=${dl.w.delights} plays=${dl.w.plays} sessions=${dl.sessions}`)
    check('exactly one kid-laugh lands in the run', dl.laughs === 1, `laughs=${dl.laughs}`)
    check('#2743 the delight event names the room that paid', dl.laRoom === 'playroom', String(dl.laRoom))
    check('the delight pays the kid: bond and pride ride the pay',
        dl.dRel >= KID_ROOM_BOND - 0.01 && dl.dContent >= 1, `dRel=${Math.round(dl.dRel * 100) / 100} dContent=${dl.dContent}`)
    const dl2 = delight(711)
    check('the whole delighted life is seed-exact — twins giggle identically', dl.h === dl2.h && dl2.w.delights === 1 && dl2.laughs === 1)

    // a toy sold mid-walk leaves the room unpaid — the walk was honest, the
    // room just wasn't there (the adult walk-cost doctrine)
    const sold = kidRun(713)
    const kS = sold.kid
    sold.items.push({ uid: 2713, id: 'tv', r: 5, c: 13 })
    const tvS = sold.items[sold.items.length - 1]
    kS.needs.fun = 0.2
    for (let i = 0; i < 60 * 5 && !(kS.playObj && kS.playIt === tvS); i++) { sold.hour = 8; advance(sold, DT); drain(sold) }
    sold.items = sold.items.filter((x) => x !== tvS)   // gone from the lot mid-errand
    for (let i = 0; i < 60 * 40 && kS.playObj; i++) { sold.hour = 8; advance(sold, DT); drain(sold) }
    check('a vanished toy pays the kid but never the room', kS.playObj === false && (sold.wings[0].plays || 0) === 0, `plays=${sold.wings[0].plays}`)

    // ---- seen: ledger rows appear only when paid; badges name the room live ----
    const sh = mkEast(714)
    check('an unearned study shows no tally row — the sheet keeps its shipped shape', pauseLedger(sh).rows.length === 1 && pauseLedger(sh).rows[0].text === 'SPARE ROOM — lodged 0')
    sh.wings[0].insights = 2; sh.wings[0].delights = 1
    const Lp = pauseLedger(sh)
    check('paid insights ride the sheet in lamp amber', Lp.rows.some((r) => r.text === 'STUDY — insights 2' && r.n === 2 && r.color === '#d9b23c'), JSON.stringify(Lp.rows))
    check('paid giggles ride the sheet in star gold', Lp.rows.some((r) => r.text === 'PLAYROOM — giggles 1' && r.n === 1 && r.color === '#ffd24a'), JSON.stringify(Lp.rows))
    check('badge silence on a bare floor — nothing stands, nothing is named', roomBadges(mkEast(715)).length === 0)
    const bS = mkEast(716); bS.items.push({ uid: 2716, id: 'book', r: 4, c: 12 })
    const bs = roomBadges(bS)
    check('the study wears an open book at its own door', bs.length === 1 && bs[0].kind === 'study' && bs[0].r === 4 && bs[0].c === 11, JSON.stringify(bs))
    const bP = mkEast(717); bP.items.push({ uid: 2717, id: 'radio', r: 6, c: 14 })
    check('the playroom wears a star at the same post', roomBadges(bP).length === 1 && roomBadges(bP)[0].kind === 'playroom')
    const bB = mkEast(718); bB.items.push({ uid: 2718, id: 'canopy', r: 6, c: 13 })
    check('the bedroom needs no badge — its panes already burn amber (#2705)', roomBadges(bB).length === 0)
    const bG = newRun(719); bG.money = 99999; buildRoom(bG, GARDEN); bG.items.push({ uid: 2719, id: 'tv', r: 10, c: 1 })
    const bg = roomBadges(bG)
    check('the cottage badges at its own south door too', bg.length === 1 && bg[0].r === 8 && bg[0].c === 2 && bg[0].kind === 'playroom', JSON.stringify(bg))

    // ---- determinism + hygiene: tallies ride the hash, the view writes none ----
    const twin = (seed) => { const g = mkEast(seed); g.wings[0].insights = 1; return stateHash(g) }
    check('the personality ledgers ride stateHash inside the wings loop',
        /for \(const w of s\.wings\) \{[\s\S]*?w\.insights[\s\S]*?w\.delights[\s\S]*?\}/.test(readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8').match(/export function stateHash[\s\S]*?\n\}/)[0])
        && twin(721) === twin(721))
    const artSrc = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: the view never writes a tally — the painter only reads the room\u2019s ledger', !/\bw\w*\.(pages|insights|plays|delights)\s*=[^=]/.test(artSrc))
    check('pin: the badge is exported from the view module and wired into the shell',
        /export function roomBadges/.test(artSrc) && /drawRoomBadges\(ctx, g\)/.test(readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')))
    const lawSrc = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const studyBlock = lawSrc.slice(lawSrc.indexOf("if (def.id === 'book' && s.ext)"), lawSrc.indexOf("if (def.id === 'book' && s.ext)") + 900)
    check('pin: the study timing is counter-pure — no rng in the law, the way #2695 keeps purpose', !studyBlock.includes('s.rng'))

    // ---- #2743 polish: the naming beat, the badge ramp, the room word ----
    const shelfSel = CATALOG.findIndex((d) => d.id === 'book')
    const bedSel = CATALOG.findIndex((d) => d.id === 'canopy')
    const radioSel = CATALOG.findIndex((d) => d.id === 'radio')

    // the beat: the piece that GIVES a wing its name rings once at the door
    const nmS = mkEast(726); nmS.sel = shelfSel
    const nmSok = place(nmS, 3, 13)
    const nmSev = drain(nmS).filter((e) => e.t === 'room-named')
    check('#2743 the shelf that names the study rings the beat at the doorstep',
        nmSok && nmSev.length === 1 && nmSev[0].kind === 'study' && nmSev[0].r === 4 && nmSev[0].c === 11, JSON.stringify(nmSev))
    const nmS2ok = place(nmS, 5, 13)
    check('#2743 the second shelf adds books, not a renaming', nmS2ok && drain(nmS).filter((e) => e.t === 'room-named').length === 0)
    const nmP = mkEast(729); nmP.sel = radioSel
    const nmPok = place(nmP, 5, 12)
    const nmPEv = drain(nmP).filter((e) => e.t === 'room-named')
    check('#2743 the radio rings the playroom name', nmPok && nmPEv.length === 1 && nmPEv[0].kind === 'playroom', JSON.stringify(nmPEv))
    const nmB = mkEast(727); nmB.sel = bedSel
    const nmBok = place(nmB, 6, 13)
    check('#2743 the bed names the bedroom but the beat keeps its seat — the panes already speak (#2705)',
        nmBok && archetypeOf(nmB, nmB.wings[0]) === 'bedroom' && drain(nmB).filter((e) => e.t === 'room-named').length === 0)
    const nmR = mkEast(730); nmR.sel = shelfSel
    place(nmR, 3, 13); drain(nmR)
    nmR.sel = bedSel
    const nmRok = place(nmR, 6, 13)
    check('#2743 the bed buries the study name silently — no badge, no beat',
        nmRok && archetypeOf(nmR, nmR.wings[0]) === 'bedroom' && drain(nmR).filter((e) => e.t === 'room-named').length === 0)
    let nmHcell = null
    const nmH = newRun(728); nmH.money = 99999; nmH.sel = shelfSel
    for (let r = 0; r < ROWS && !nmHcell; r++) for (let c = 0; c < COLS && !nmHcell; c++) {
        if (groundAt(r, c) !== 'floor' || c >= 11) continue
        if (place(nmH, r, c)) nmHcell = { r, c }
    }
    check('#2743 control: the house-floor shelf actually lands', !!nmHcell, JSON.stringify(nmHcell))
    check('#2743 a living-room shelf never rings — the clause is the room\u2019s, not the item\u2019s',
        drain(nmH).filter((e) => e.t === 'room-named').length === 0)

    // determinism: the beat is pure derivation — no rng, twins still match
    check('#2743 the naming beat draws no rng — twins with a named room hash identical',
        (() => {
            const twinN = (seed) => { const g = mkEast(seed); g.sel = shelfSel; place(g, 3, 13); return stateHash(g) }
            return twinN(731) === twinN(731)
        })())
    const beatBlock = lawSrc.slice(lawSrc.indexOf('const nbWas'), lawSrc.indexOf('reflow(s)\n    return true'))
    check('#2743 pin: the beat block itself is rng-free', beatBlock.length > 0 && !beatBlock.includes('s.rng'))

    // the badge shows the pay COMING — p ramps to the room's next payout
    const bpS = mkEast(732); bpS.items.push({ uid: 2732, id: 'book', r: 4, c: 12 })
    bpS.wings[0].pages = 2; bpS.wings[0].insights = 3
    const bpp = roomBadges(bpS)
    check('#2743 the study badge rides pages on p and its bank on n',
        bpp.length === 1 && Math.abs(bpp[0].p - 2 / PAGES_INSIGHT) < 1e-9 && bpp[0].n === 3, JSON.stringify(bpp))
    const bpP = mkEast(733); bpP.items.push({ uid: 2733, id: 'radio', r: 6, c: 14 })
    bpP.wings[0].plays = 1
    const bppP = roomBadges(bpP)
    check('#2743 the playroom badge ramps the same way',
        bppP.length === 1 && Math.abs(bppP[0].p - 1 / PLAYS_DELIGHT) < 1e-9 && bppP[0].n === 0, JSON.stringify(bppP))
    const bpZ = mkEast(734); bpZ.items.push({ uid: 2734, id: 'book', r: 4, c: 12 })
    roomBadges(bpZ)
    check('#2743 asking the badge never writes the tally — the ramp is view-only', (bpZ.wings[0].pages || 0) === 0)

    // pins: the banners, the shell wiring, the ramp paint, the phone probe aim
    const hbIdx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('#2743 pin: the pay banners carry the paying room\u2019s own word',
        /THE \$\{\(e\.room \|\| 'study'\)\.toUpperCase\(\)\} PAYS/.test(hbIdx) && /THE \$\{\(e\.room \|\| 'playroom'\)\.toUpperCase\(\)\} GIGGLES/.test(hbIdx))
    check('#2743 pin: the naming beat is wired into the shell with its own callout',
        /case 'room-named'/.test(hbIdx) && /THIS ROOM IS A \$\{e\.kind\.toUpperCase\(\)\}/.test(hbIdx))
    check('#2743 pin: the ramp paints a track always and fills from the badge\u2019s own p',
        /rgba\(24,16,6,0\.72\)/.test(artSrc) && /Math\.round\(14 \* b\.p\)/.test(artSrc) &&
        /#2752: the track is 0\.72-dark and 3 px tall/.test(artSrc))   // #2752 re-pinned: alpha 0.55→0.72, height 2→3 — the drive's live 390-px leg read rampTrack 0 on the old line and 8px on this one
    check('#2743 pin: the phone-scale probe aims at roomBadges(gs) and rides the probe return',
        /const rb = roomBadges\(gs\)/.test(hbIdx) && /badges: rb/.test(hbIdx))
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
    // #2209: honest attract — the demo must SHOW the child, not only advertise
    // her in MESSAGES. Before the reorder the §300 wall starved kidkit out of
    // every run: 9/9 seeds won with Pip unadopted (README honest gap).
    for (const seed of [7, 42, 1234, 99, 20261023]) {
        const gk = play(seed)
        check(`seed ${seed}: the demo sells Pip — the child moves in`, !!gk.kid, `kid=${!!gk.kid} money=${Math.round(gk.money)}`)
    }
    const tourSeen = []
    const gTour = newRun(7)
    let tTour = 0
    while (!gTour.done && tTour++ < 60 * 60 * 45) { autoStep(gTour, DT); for (const e of gTour.events) if (e.t === 'pet' || e.t === 'kid') tourSeen.push(e.t); gTour.events.length = 0 }
    check('the till tours the family in order — cat, then child', tourSeen.join(',') === 'pet,kid', tourSeen.join(','))
    // #2721: the economy window — the same pin, flipped. Kit two used to sit
    // outside demo time on every seed (§720 income against a §710 tour); now
    // Pip's round money buys the cottage and the winning demo shows BOTH wings
    // with the garden ripening. Copy and economy pinned together, still.
    {
        const jsx21 = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
        let ext2At = Infinity, harvestBeforeWin = false, done21 = null
        const g21 = newRun(7)
        let t21 = 0
        while (!g21.done && t21++ < 60 * 60 * 45) {
            autoStep(g21, DT)
            for (const e of g21.events) {
                if (e.t === 'room' && e.w === 'garden' && ext2At === Infinity) ext2At = t21
                if (e.t === 'harvest' && ext2At !== Infinity) harvestBeforeWin = true
            }
            g21.events.length = 0
        }
        done21 = g21.done
        check('#2721: the demo grows the lot TWICE — kit two funds inside the winning run, and the garden ripens on screen',
            done21 === 'win' && g21.ext === WINGS_MAX && harvestBeforeWin && /GROWS TWICE/.test(jsx21),
            `done=${done21} ext=${g21.ext} cottage@d${ext2At === Infinity ? 'never' : Math.round(ext2At / 60)}s harvest=${harvestBeforeWin ? 'yes' : 'no'}`)
    }
}

// #2752: the jar's surplus clause. Once the cottage has paid, the fund's
// next refill (JAR_CAP, §90) has nothing left to buy — that dead money now
// buys the wing ONE radio: charged to the jar, the till untouched, ONCE per
// run, and a standing wing with no name yet gets one through the #2743 beat.
// Measured on the WINNABLE tour: the refill lands before the win on seeds
// 7/1234/20261023; seed 42 wins d2h19.8 (the refill only comes at dawn) and
// seed 99 never completes the lot — honest absence, the #2240 pattern.
section('#2752 (the jar buys the wing one radio)')
{
    const fired = [], silent = []
    let tillHonored = true, jarHonored = true
    for (const seed of [7, 42, 1234, 99, 20261023]) {
        const g = newRun(seed)
        let t = 0
        let toys = 0, named = null
        while (!g.done && t++ < 60 * 60 * 45) {
            const m0 = g.money, j0 = g.jar
            autoStep(g, DT)
            for (const e of drain(g)) {
                if (e.t === 'wing-toy') {
                    toys++
                    if (g.money !== m0) tillHonored = false
                    if (j0 - g.jar !== DEF.radio.price) jarHonored = false   // the pay comes OUT of the fund — exactly one radio's price
                }
                if (e.t === 'room-named' && e.kind === 'playroom') named = named || `d${g.day}h${g.hour.toFixed(1)}`
            }
        }
        const play = g.wings.map((w) => archetypeOf(g, w)).includes('playroom')
        const badge = roomBadges(g).some((b) => b.kind === 'playroom')
        if (toys) fired.push({ seed, toys, named, play, badge, done: g.done })
        else silent.push(seed)
    }
    check('#2752 surplus seeds name a playroom in the demo — radio on the wing floor, beat at the doorstep, badge through the win, and the run still wins',
        fired.length === 3 && fired.every((f) => f.toys === 1 && f.named && f.play && f.badge && f.done === 'win'),
        JSON.stringify(fired))
    check('#2752 the clause stays silent where the economy says so — seed 42 wins before the refill, seed 99 never completes the lot',
        silent.length === 2 && silent.includes(42) && silent.includes(99), JSON.stringify(silent))
    check('#2752 the clause pays from the fund only — till byte-still on a buy tick, and the jar drops by exactly one radio', tillHonored && jarHonored)
    {
        const g7 = newRun(7)
        let t7 = 0, fired7 = false
        while (!g7.done && t7++ < 60 * 60 * 45) {
            autoStep(g7, DT)
            if (drain(g7).some((e) => e.t === 'wing-toy')) fired7 = true
        }
        check('#2752 once is the law, derived from what stands — wingToyOn reads the radio, surplusToyOk is closed after',
            fired7 && wingToyOn(g7) && !surplusToyOk(g7))
        const g0 = newRun(7)
        g0.jar = JAR_CAP
        check('#2752 no kit-two, no deal — surplusToyOk refuses before the lot is complete, and the jar keeps its money',
            !surplusToyOk(g0) && buyWingToy(g0) === false && g0.jar === JAR_CAP)
    }
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
    check('attract builds the wings and its residents move in', gb.done === 'win' && gb.ext === WINGS_MAX && bSeen >= 2, `done=${gb.done} ext=${gb.ext} sees=${bSeen}`)   // #2721: both hammers arm the reaction ledger; a run may grant the wish before the second pair walks

    // source pins: one window source, the glow asked for, the kit guard
    const sim2Src = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const artSrc = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const jsxSrc = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the wing bake paints windows from the geometry', /for \(const \[r, c\] of geom\.windows\)/.test(artSrc))   // #2689: one bake serves every site
    check('pin: nightTint takes the ext flag and lights every standing wing', /function nightTint\(ctx, hour, ext, wings = null, sleepers = null\)[\s\S]*if \(ext\)[\s\S]*wingGeom/.test(artSrc))   // #2705: the tint gained the sleepers arg — re-aimed, the ext law unchanged
    check('pin: the shell passes the live ext flag and wings into the tint', /nightTint\(ctx, g\.hour, g\.ext, g\.wings, sleepingCells\(g\)\)/.test(jsxSrc))   // #2705: plus the night's sleepers, so lodged panes burn deeper
    check('pin: the bot asks the kit law for BOTH wings', /if \(id === 'roomkit'\)[\s\S]*?!buildRoomOk\(s, s\.ext === 0 \? eastWing\(DEFAULT_ANCHOR\) : GARDEN\)/.test(sim2Src))   // #2721: the autopilot's thrift gate now spans kit two too — the law it asks is still the site law
    check('pin: the hammer arms the reaction ledger', /s\.roomReact = s\.people\.length/.test(sim2Src))
}

section('CANOPY (#2272): wing-only bedroom bed, premium sleep')
{
    // The Spare Room finally sells furniture that reads bedroom: the Canopy
    // Bed lives on the wing's floorboards and nowhere else, shares the bed's
    // night law, and sleeps deeper (cozy rides the def, not the id).
    const g = newRun(31)
    g.money = 1000
    drain(g)
    setSel(g, CATALOG.findIndex((d) => d.id === 'canopy'))
    check('before the hammer the canopy fits nowhere — lawn is not a bedroom', !place(g, 3, 12) && !place(g, 6, 13) && !placeOk(g, 5, 3) && g.money === 1000 && !g.items.some((it) => it.id === 'canopy'))
    buildRoom(g)
    check('card 18: premium furniture law — priced, solid, sleeps', DEF.canopy.price === 260 && DEF.canopy.solid === true && DEF.canopy.need === 'energy' && DEF.canopy.sleep === true && DEF.canopy.wingOnly === true)
    check('bed shares the sleep law (id tests promoted to def)', DEF.bed.sleep === true && DEF.bed.cozy === 0.03 && DEF.canopy.cozy > DEF.bed.cozy)
    check('the house floor still refuses it — it belongs to the wing', !place(g, 5, 3) && !place(g, 6, 3) && !g.items.some((it) => it.id === 'canopy'))
    check('the wing accepts it on its floorboards', place(g, 5, 13) && g.items.some((it) => it.id === 'canopy' && it.r === 5 && it.c === 13) && g.money === 1000 - EXT_ROOM.price - DEF.canopy.price)
    check('HOME + digit 7 reaches card 18', selectTab(g, 0) && digitCard(g, 7) === CATALOG.findIndex((d) => d.id === 'canopy'))

    // premium nap: a full midday sleep on the canopy wakes fuller than the
    // plain bed's arithmetic (bed: amt + cozy*dur = 0.87 from 0.3)
    const p = g.people[0]
    p.r = 5; p.c = 12; p.path = null; p.goal = null; p.use = null
    p.needs.energy = 0.3
    check('the bed orders a canopy nap from next door', cmdUse(g, p, g.items.find((it) => it.id === 'canopy')))
    for (let i = 0; i < 60 * 30 && (p.path || p.use); i++) advance(g, DT)
    check('a canopy nap tops the tank — deeper than any bed nap', !p.use && p.needs.energy >= 0.999, `energy=${p.needs.energy.toFixed(3)}`)
    check('the premium is real arithmetic', DEF.canopy.amt + DEF.canopy.cozy * DEF.canopy.dur > DEF.bed.amt + DEF.bed.cozy * DEF.bed.dur)

    // night law rides sleep too: a canopy bed at 23:00 holds until dawn
    const g2 = newRun(31)
    g2.money = 1000
    buildRoom(g2)
    setSel(g2, CATALOG.findIndex((d) => d.id === 'canopy'))
    place(g2, 5, 13)
    const q = g2.people[0]
    q.r = 5; q.c = 12; q.path = null; q.goal = null; q.use = null
    g2.hour = 23
    cmdUse(g2, q, g2.items.find((it) => it.id === 'canopy'))
    for (let i = 0; i < 60 * 14 && (q.path || !q.use); i++) advance(g2, DT)   // walk in and settle
    for (let i = 0; i < 60 * 13; i++) advance(g2, DT)   // past dur (9s), still night
    check('a canopy night-sleep rides past its duration until morning', q.use && q.use.night === true && q.use.t > q.use.dur && (g2.hour < 6 || g2.hour >= 22))
    for (let i = 0; i < 60 * 60 && (q.path || q.use); i++) advance(g2, DT)
    check('dawn lets the canopy sleeper up, fully rested', !q.use && q.needs.energy >= 0.999, `hour=${g2.hour} energy=${q.needs.energy.toFixed(3)}`)

    // economy + hash
    const moneyBefore = g2.money
    check('selling the canopy frees the cell and pays half back', sellAt(g2, 5, 13) && g2.money === moneyBefore + Math.floor(DEF.canopy.price / 2) && !g2.items.some((it) => it.id === 'canopy'))
    const gA = newRun(77), gB = newRun(77)
    gA.money = 1000; gB.money = 1000
    buildRoom(gA); buildRoom(gB)
    setSel(gB, CATALOG.findIndex((d) => d.id === 'canopy'))
    place(gB, 6, 14)
    check('stateHash carries the canopy bed', stateHash(gA) !== stateHash(gB))

    // source pins: the laws must not silently drop
    const cSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const cArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: canPlace asks wingOnly against any standing wing floor under ext', /def\.wingOnly && !\(s\.ext && s\.wings\.some/.test(cSim))   // #2689: east or garden, a wing's floorboards are bedroom boards
    check('pin: the sleep laws ride def.sleep, no bed-id checks left', /p\.use\.def\.sleep/.test(cSim) && !/p\.use\.def\.id === 'bed'/.test(cSim))
    check('pin: the view draws the canopy sprite and zzz-s every sleeper', /case 'canopy'/.test(cArt) && /p\.use\.def\.sleep/.test(cArt))
    check('pin: shelf cards size to the shelf, so HOME carries seven', /const shelfCW = \(n\)/.test(cArt) && /shelfCW\(cards\.length\)/.test(cArt) && CAT_TABS[0].ids.length === 7)
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
    g.noWander = true   // #2253: pin the seeded idle stroll — stillness is law here, not a lucky draw
    drain(g)
    // #2253: the step decayer owes one trailing footfall after a short walk;
    // let it spend, then assert the genuinely quiet window. (Under the grace
    // the rng re-phase moved this overdue step across the old drain boundary.)
    for (let i = 0; i < 10; i++) advance(g, DT)
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
    // #2721: the second kit is no longer refused on price — the cottage (§90)
    // affords out of the till's leftover, and the lot then stands full: it is
    // the THIRD kit that refuses (WINGS_MAX, unchanged).
    check('the lot grows twice — the cottage rises on the till\'s leftover', place(g5, 0, 0) && drain(g5).some((e) => e.t === 'room' && e.w === 'garden'))
    check('a third kit is refused too', !place(g5, 0, 0) && drain(g5).some((e) => e.t === 'refuse'))

    // source pins: the events exist at the choke points the view depends on
    const feelSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const feelJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: footfalls carry their surface', /t: 'step', surf: groundOf\(s, p\.r, p\.c\)/.test(feelSim))
    check('pin: both walk routes feed the footfall meter', /footstep\(s, p, budget - step\)/.test(feelSim) && /footstep\(s, p, Math\.abs\(p\.x - ox\)/.test(feelSim))
    check('pin: every refusal branch emits its event', (feelSim.match(/t: 'refuse'/g) || []).length === 13)   // #2197/#2203: the two adoption counters make the fifth door that answers; #2256: the yarn ball answers twice — at the order and at the finish; #2303: the bin answers twice too; #2503: the cone answers at the order, at the finish (gone or broke), and at the child's curb
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
        /else if \(!tryUse(?:OrQueue)?\(gs, p\)\)[\s\S]*courtHoldArm\(gs\)/.test(ctJsx) && /courtTap\(gs\)/.test(ctJsx))   // #2470: the queue parity renamed the route; the press-arms/release-pays law itself is pinned above and in homebodyqueuecheck
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

section('COURT PICK (#2235)')   // when the ring is crowded, tap decides WHO hears you — until they step away
{
    const crowd = (g) => {   // me (3,3), partner (3,4) dist 1, Fern (4,4) dist 2 — the ring shares
        g.people[0].r = 3; g.people[0].c = 3; g.people[1].r = 3; g.people[1].c = 4
        g.people[0].path = null; g.people[1].path = null
        g.spatCd = 0; g.grudge = 0; g.cmdCd = 0; g.holdT = -1; g.courtPick = null
        g.visitor = { name: 'Fern', r: 4, c: 4, x: 0, y: 0, path: null, state: 'hang', t: 5 }
        return g
    }
    const reachKs = (g) => courtReach(g).map((c) => c.k).join(',')

    const solo = newRun(92)
    solo.people[0].r = 3; solo.people[0].c = 3; solo.people[1].r = 3; solo.people[1].c = 4
    solo.people[0].path = null; solo.people[1].path = null; solo.cmdCd = 0
    check('an uncontested ring keeps the old law — nearest wins and a tap picks nobody (switch/walk idioms untouched)',
        courtTarget(solo).k === 'house' && courtPickSet(solo, 'house') === false && solo.courtPick === null)

    const g0 = crowd(newRun(91))
    check('a contested ring lists both ears (partner first) and still auto-picks the nearest',
        reachKs(g0) === 'house,fern' && courtTarget(g0).k === 'house')
    check('a tap on Fern picks her — the pick is state and outranks the nearest law',
        courtPickSet(g0, 'fern') === true && g0.courtPick === 'fern' && courtTarget(g0).k === 'fern')
    const e1 = court(g0, 'coo')
    check('the word pays Fern: rel.fern, a fern event, the partner stays cold',
        !!e1 && e1.k === 'fern' && Math.abs(g0.rel.fern - COO_BOND) < 1e-9 && g0.rel.house === 0 && drain(g0).some((e) => e.t === 'coo' && e.k === 'fern'))
    check('the pick survives the word — until she steps away, Fern stays the ear',
        g0.courtPick === 'fern' && courtTarget(g0).k === 'fern')
    for (let i = 0; i < Math.round(3 / DT); i++) {
        g0.people[0].r = 3; g0.people[0].c = 3; g0.visitor.r = 4; g0.visitor.c = 4   // hold the pair in the ring through the wander
        g0.visitor.path = null; g0.people[0].path = null
        courtTick(g0, FIXED_DT); advance(g0, DT)
    }
    check('the pick lives across live steps while she shares the ring', g0.courtPick === 'fern' && courtTarget(g0).k === 'fern')
    g0.visitor.r = 9; g0.visitor.c = 9
    courtTick(g0, FIXED_DT)
    check('she steps out of the ring — the pick expires and the nearest law takes the word again',
        g0.courtPick === null && courtTarget(g0).k === 'house')
    g0.visitor.r = 4; g0.visitor.c = 4
    check('her return does not resurrect the pick — until she steps away means until',
        courtTarget(g0).k === 'house' && courtPickSet(g0, 'fern') === true && courtTarget(g0).k === 'fern')

    const g1 = crowd(newRun(93))
    g1.visitor.r = 9; g1.visitor.c = 9
    check('someone out of the ring cannot be picked, and neither can an absent ear',
        courtPickSet(g1, 'fern') === false && courtPickSet(g1, 'ivy') === false && courtPickSet(g1, 'kid') === false && g1.courtPick === null)

    const g2 = crowd(newRun(94))
    g2.people[1].r = 4; g2.people[1].c = 4   // partner dist 2
    g2.visitor.r = 3; g2.visitor.c = 4       // Fern dist 1 — the auto-law would take Fern
    check('the partner CAN be chosen against a nearer visitor — the crowded ring is where the law hurt',
        courtTarget(g2).k === 'fern' && courtPickSet(g2, 'house') === true && courtTarget(g2).k === 'house')
    const e2 = court(g2, 'coo')
    check('and the chosen word pays the household, not the nearer neighbour',
        !!e2 && e2.k === 'house' && Math.abs(g2.rel.house - COO_BOND) < 1e-9 && g2.rel.fern === 0)

    const g3 = crowd(newRun(95))
    courtPickSet(g3, 'fern')
    g3.visitor.state = 'leaving'
    check('a visitor leaving takes her pick with her — the stale pick is ignored the same instant',
        courtTarget(g3).k === 'house' && (courtTick(g3, FIXED_DT), g3.courtPick === null) && courtTarget(g3).k === 'house')
    const g4 = crowd(newRun(96))
    courtPickSet(g4, 'house')
    g4.people[1].faintT = 5
    check('a fainted partner cannot be addressed — the word falls to the next ear at once',
        courtTarget(g4).k === 'fern' && (courtTick(g4, FIXED_DT), g4.courtPick === null) && courtTarget(g4).k === 'fern')

    const gH1 = crowd(newRun(97)); courtPickSet(gH1, 'fern')
    const gH2 = crowd(newRun(97))
    const pickScript = () => { const g = crowd(newRun(98)); courtPickSet(g, 'fern'); court(g, 'coo'); for (let i = 0; i < Math.round(20 / DT); i++) advance(g, DT); return stateHash(g) }
    check('the pick rides the hash — a chosen ear differs from an idle one, and it is seed-exact',
        stateHash(gH1) !== stateHash(gH2) && pickScript() === pickScript())

    const cpSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const cpJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the view spends the tap on a shared-ring person before the switch and walk idioms (#2235)',
        // #2683: the go-say loop now sits between the pick and the switch — the window grew,
        // and the GO-SAY section pins the new order itself; the pick still spends first.
        /for \(const c of courtReach\(gs\)\)[\s\S]{0,240}courtPickSet\(gs, c\.k\)[\s\S]{0,2600}\/\/ tap a person to switch/.test(cpJsx))
    check('pin: the expiry rides every live step alongside the hold clock', /courtPick && !courtReach\(s\)/.test(cpSim))
    check('pin: the pick rides the hash like every other live state', /mix\(s\.courtPick/.test(cpSim))
}

section('GO-SAY (#2683)')   // choose WHICH two share the ring — a far tap walks over; the coo lands on arrival
{
    const far = (g, { pr = 12, pc = 5, fr = 3, fc = 4 } = {}) => {   // Fern hangs by the sofa; a resident waits at the gate — the lot divided
        g.people[0].r = pr; g.people[0].c = pc
        g.people[1].r = 6; g.people[1].c = 6
        g.people[0].path = null; g.people[1].path = null
        g.people[0].goal = null; g.people[1].goal = null
        g.cmdCd = 0; g.holdT = -1; g.courtPick = null; g.grudge = 0; g.spatCd = 0
        g.visitor = { name: 'Fern', r: fr, c: fc, x: tileX(fc) + TILE / 2, y: tileY(fr) + TILE / 2, path: null, state: 'hang', t: 5, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, metCat: false }
        return g
    }
    // pin Fern at the sofa and the spare resident at rest; run until the
    // promise settles (or the tick budget runs), collecting every event.
    const runPin = (g, ticks, stopOn = null) => {
        const seen = []
        for (let i = 0; i < ticks; i++) {
            if (g.visitor) { g.visitor.r = 3; g.visitor.c = 4; g.visitor.path = null }
            g.people[1].r = 6; g.people[1].c = 6; g.people[1].path = null
            advance(g, DT)
            seen.push(...drain(g))
            if (stopOn && seen.some(stopOn)) break
        }
        return seen
    }

    const g0 = far(newRun(201))
    g0.people[0].r = 3; g0.people[0].c = 3   // step right up to Fern — the same-ring case
    check('same-ring taps keep the old idioms — go-say refuses an ear already in reach',
        cmdGoSay(g0, g0.people[0], 'fern') === false && g0.people[0].goal === null)
    check('neither a resident (the switch idiom owns them) nor an absent neighbour can be promised a word',
        cmdGoSay(g0, g0.people[0], 'house') === false && cmdGoSay(g0, g0.people[0], 'ivy') === false && cmdGoSay(g0, g0.people[0], 'kid') === false && g0.people[0].goal === null)

    const g1 = far(newRun(202))
    const ok1 = cmdGoSay(g1, g1.people[0], 'fern')
    check('the far tap issues: a gosay goal, a real path, the hand owns it, the ping names the promise',
        ok1 === true && g1.people[0].goal && g1.people[0].goal.kind === 'gosay' && g1.people[0].goal.k === 'fern'
        && g1.people[0].path && g1.people[0].path.length > 0 && g1.people[0].owner === 'human'
        && g1.orderPing.label === 'GO SAY IT — FERN')

    const g2 = far(newRun(203))
    cmdGoSay(g2, g2.people[0], 'fern')
    const evs2 = runPin(g2, Math.round(60 / DT), (e) => e.t === 'go-say')
    const fires = evs2.filter((e) => e.t === 'go-say' && e.stage === 'fire')
    const coos = evs2.filter((e) => e.t === 'coo' && e.k === 'fern')
    check('the errand walks and the word lands: one go-say fire, one coo through the existing law',
        fires.length === 1 && coos.length === 1 && g2.people[0].goal === null)
    check('arrival pays the bond and the cooldown — court law untouched (chat-drift tolerated to one coo)',
        g2.rel.fern >= COO_BOND && g2.rel.fern <= COO_BOND * 1.5 && g2.cmdCd > CMD_CD - 2 && g2.cmdCd <= CMD_CD + 1e-9)
    check('arrival promotes the promise to the #2235 pick — the chosen ear, now in-ring',
        g2.courtPick === 'fern')
    const evs2b = runPin(g2, Math.round(2 / DT))
    check('the coo lands ONCE — the errand does not loop on the doorstep',
        evs2b.filter((e) => e.t === 'coo').length === 0 && evs2b.filter((e) => e.t === 'go-say').length === 0)

    const g3 = far(newRun(204))
    g3.people[0].r = 3; g3.people[0].c = 3   // parked right beside Fern — arrival is now
    g3.people[0].path = null
    g3.people[0].goal = { kind: 'gosay', k: 'fern', tries: 0 }
    g3.cmdCd = 5
    const seen3 = []
    for (let i = 0; i < Math.round(3 / DT); i++) { g3.visitor.r = 3; g3.visitor.c = 4; g3.visitor.path = null; g3.people[1].r = 6; g3.people[1].c = 6; g3.people[1].path = null; advance(g3, DT); seen3.push(...drain(g3)) }
    check('a word that just landed elsewhere makes the promise WAIT — goal held, the coo not yet spoken',
        g3.people[0].goal !== null && g3.people[0].goal.kind === 'gosay' && !seen3.some((e) => e.t === 'coo' && e.k === 'fern') && !seen3.some((e) => e.t === 'go-say'))
    const seen3b = []
    for (let i = 0; i < Math.round(6 / DT); i++) { g3.visitor.r = 3; g3.visitor.c = 4; g3.visitor.path = null; g3.people[1].r = 6; g3.people[1].c = 6; g3.people[1].path = null; advance(g3, DT); seen3b.push(...drain(g3)) }
    check('when the cooldown clears the held word lands — frozen breath first, then the pay (#2697)',
        g3.people[0].goal === null && seen3b.filter((e) => e.t === 'coo' && e.k === 'fern').length === 1
        && seen3b.some((e) => e.t === 'go-say' && e.stage === 'fire'))

    const g4 = far(newRun(205))
    cmdGoSay(g4, g4.people[0], 'fern')
    g4.visitor.state = 'leaving'
    const evs4 = runPin(g4, Math.round(30 / DT))
    check('an ear that starts to leave takes the promise with her — lost, unpaid',
        evs4.some((e) => e.t === 'go-say' && e.stage === 'lost') && g4.people[0].goal === null && g4.rel.fern === 0
        && !evs4.some((e) => e.t === 'coo'))

    // #2697 tail 1: the face-and-breath. Park the errand in-ring with the ear and
    // watch the cadence: meet the ring, hold GO_SAY_SETTLE ticks, THEN pay.
    const gSe = far(newRun(214))
    gSe.people[0].r = 3; gSe.people[0].c = 3
    gSe.people[0].path = null
    gSe.people[0].goal = { kind: 'gosay', k: 'fern', tries: 0 }
    let tickBreath = -1, tickFire = -1, cooInHold = 0
    for (let i = 0; i < Math.round(4 / DT); i++) {
        gSe.visitor.r = 3; gSe.visitor.c = 4; gSe.visitor.path = null
        gSe.people[1].r = 6; gSe.people[1].c = 6; gSe.people[1].path = null
        advance(gSe, DT)
        const ev = drain(gSe)
        if (tickBreath < 0 && gSe.people[0].settleT > 0) tickBreath = i
        if (ev.some((e) => e.t === 'go-say' && e.stage === 'fire')) { tickFire = i; break }   // the pay tick is not the hold
        if (tickBreath >= 0) cooInHold += ev.filter((e) => e.t === 'coo').length
    }
    check('#2697 the errand breathes — fire lands exactly GO_SAY_SETTLE ticks after the ring is met',
        tickBreath >= 0 && tickFire >= 0 && tickFire - tickBreath === GO_SAY_SETTLE - 1)
    check('#2697 the hold is silent — nothing pays before the breath ends',
        cooInHold === 0 && gSe.rel.fern >= COO_BOND && gSe.rel.fern <= COO_BOND * 1.5)
    check('#2697 the breath is spent with the word — no stale hold rides the next errand',
        gSe.people[0].settleT === 0)

    // #2697 tail 2: the errand narrates its own stakes — issue and blocked-loss,
    // both fixed text (no rng spend, so every stored hash on this page stands).
    const gTh = far(newRun(215))
    cmdGoSay(gTh, gTh.people[0], 'fern')
    check('#2697 the errand names itself at issue — one fixed thought on the sheet',
        gTh.thoughts[0] && gTh.thoughts[0].text === 'You cross the lot to say the thing you mean.')
    const gTh2 = far(newRun(216))
    gTh2.people[0].goal = { kind: 'gosay', k: 'fern', tries: 0 }
    gTh2.people[0].path = null
    let shutLine = ''
    for (let i = 0; i < 8; i++) {
        gTh2.visitor.r = -3; gTh2.visitor.c = -3; gTh2.visitor.path = null
        gTh2.people[1].r = 6; gTh2.people[1].c = 6; gTh2.people[1].path = null
        advance(gTh2, DT)
        if (gTh2.people[0].goal === null) { shutLine = gTh2.thoughts[0] ? gTh2.thoughts[0].text : ''; break }
    }
    check('#2697 the blocked errand speaks honestly — the shut-way line rides the loss',
        gTh2.people[0].goal === null && shutLine === 'The way over is shut — the kind word waits for another day.')

    const g5 = far(newRun(206))
    g5.hour = 23   // the child's nap is the dark's law — the fold must be tested while she truly sleeps
    g5.kid = { name: 'Pip', r: 8, c: 8, x: 0, y: 0, path: null, needs: { hunger: 0.8, fun: 0.8, social: 0.8, energy: 0.9 }, asleep: true, cd: 0, giggleT: 0, cryT: 0, wanderT: 2, food: false, playObj: false, treat: false, bedT: 0, stepDist: 0 }
    check('a sleeping child cannot even be promised — the target law refuses the tap',
        goSayTarget(g5, 'kid') === null && cmdGoSay(g5, g5.people[0], 'kid') === false)
    g5.people[0].goal = { kind: 'gosay', k: 'kid', tries: 0 }
    g5.people[0].path = null
    const evs5 = []
    for (let i = 0; i < Math.round(2 / DT); i++) { g5.people[0].path = null; advance(g5, DT); evs5.push(...drain(g5)) }
    check('a promise already walking when the ear falls asleep folds honestly',
        evs5.some((e) => e.t === 'go-say' && e.stage === 'lost') && g5.people[0].goal === null)

    const g6 = far(newRun(207))
    cmdGoSay(g6, g6.people[0], 'fern')
    let triesSeen = 0
    let repathed = false
    const evs6 = []
    for (let i = 0; i < Math.round(30 / DT); i++) {
        g6.visitor.r = 3; g6.visitor.c = 4; g6.visitor.path = null
        g6.people[1].r = 6; g6.people[1].c = 6; g6.people[1].path = null
        g6.people[0].r = 12; g6.people[0].c = 5; g6.people[0].path = null   // Fern keeps slipping — the walker never closes
        advance(g6, DT)
        evs6.push(...drain(g6))
        if (g6.people[0].goal) { triesSeen = Math.max(triesSeen, g6.people[0].goal.tries); if (g6.people[0].path && g6.people[0].path.length) repathed = true }
    }
    check('a slipping target is chased with fresh paths — and the chase is bounded',
        repathed && triesSeen === GO_SAY_CHASE && g6.people[0].goal === null
        && evs6.some((e) => e.t === 'go-say' && e.stage === 'lost') && g6.rel.fern === 0)

    const g7 = far(newRun(208))
    g7.people[0].path = [{ r: 11, c: 5 }]   // an errand mid-step — the tap lands on a busy hand
    g7.people[0].goal = { kind: 'walk' }
    check('busy? the promise joins the list like any errand (#2470), and the queue holds it',
        cmdQueue(g7, g7.people[0], { kind: 'gosay', k: 'fern' }) === true && g7.people[0].queue.some((o) => o.kind === 'gosay' && o.k === 'fern'))
    g7.people[0].path = null; g7.people[0].goal = null
    const evs7 = runPin(g7, Math.round(60 / DT), (e) => e.t === 'go-say')
    check('when the errand before it ends the promise re-issues from wherever they stand and pays',
        evs7.some((e) => e.t === 'coo' && e.k === 'fern') && g7.rel.fern >= COO_BOND)
    const g8 = far(newRun(209))
    cmdQueue(g8, g8.people[0], { kind: 'gosay', k: 'fern' })
    g8.people[0].path = null; g8.people[0].goal = null
    g8.visitor = null   // Fern went home between the tap and the turn
    const evs8 = []
    for (let i = 0; i < Math.round(6 / DT); i++) { g8.people[1].r = 6; g8.people[1].c = 6; g8.people[1].path = null; advance(g8, DT); evs8.push(...drain(g8)) }
    check('an ear gone home before the queue turns around — the listed promise drops honestly',
        evs8.some((e) => e.t === 'queue-drop' && e.id === 'gosay') && g8.rel.fern === 0)

    const g9 = far(newRun(210))
    cmdGoSay(g9, g9.people[1], 'fern')   // the promise sits on Mira while the hand holds Otto
    const soc0 = g9.people[1].needs.social
    const evs9 = []
    for (let i = 0; i < Math.round(60 / DT) && g9.people[1].goal; i++) { g9.visitor.r = 3; g9.visitor.c = 4; g9.visitor.path = null; g9.people[0].r = 12; g9.people[0].c = 5; g9.people[0].path = null; advance(g9, DT); evs9.push(...drain(g9)) }
    check('the errand speaks AS ITSELF — the walker delivers it even while the hand sits on the other resident',
        evs9.some((e) => e.t === 'go-say' && e.stage === 'fire' && e.name === g9.people[1].name)
        && g9.people[1].needs.social > soc0 && g9.active === 0)

    const g10 = far(newRun(211))
    g10.people[1].r = 3; g10.people[1].c = 3   // the partner is already at Fern's shoulder — the auto-law would take the nearest
    cmdGoSay(g10, g10.people[0], 'fern')
    const evs10 = []
    for (let i = 0; i < Math.round(60 / DT) && g10.people[0].goal; i++) { g10.visitor.r = 3; g10.visitor.c = 4; g10.visitor.path = null; g10.people[1].r = 3; g10.people[1].c = 3; g10.people[1].path = null; advance(g10, DT); evs10.push(...drain(g10)) }
    const coo10 = evs10.find((e) => e.t === 'coo')
    check('arrival in a crowd still pays the CHOSEN ear — the pick law extended to promises',
        !!coo10 && coo10.k === 'fern' && g10.courtPick === 'fern')

    const gosayScript = (seed) => { const g = far(newRun(seed)); cmdGoSay(g, g.people[0], 'fern'); for (let i = 0; i < Math.round(30 / DT); i++) { g.visitor.r = 3; g.visitor.c = 4; g.visitor.path = null; g.people[1].r = 6; g.people[1].c = 6; g.people[1].path = null; advance(g, DT) } return stateHash(g) }
    check('the promise rides determinism — seed-exact twins walk the same errand',
        gosayScript(212) === gosayScript(212))
    const gH = far(newRun(213)); const gHa = far(newRun(213))
    cmdQueue(gHa, gHa.people[0], { kind: 'gosay', k: 'fern' })
    check('a listed promise is state — the hash hears it', stateHash(gH) !== stateHash(gHa))

    const gA = newRun(214)
    let attractGo = 0
    for (let i = 0; i < Math.round(240 / DT); i++) { autoStep(gA, DT); attractGo += drain(gA).filter((e) => e.t === 'go-say').length; if (gA.people.some((p) => p.goal && p.goal.kind === 'gosay')) attractGo++ }
    check('the attract bot never go-says — old demos stay byte-identical', attractGo === 0)

    const gsSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const gsJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const gsArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const gsReg = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    check('pin: the far-tap loop sits after the #2235 pick loop and before the switch idiom',
        /for \(const kk of \['fern', 'ivy', 'kid'\]\)[\s\S]{0,1300}\/\/ tap a person to switch/.test(gsJsx))
    check('pin: arrival is wired into the goal chain of advance', /kind === 'gosay'\) \{ goSayArrive\(s, p\); continue \}/.test(gsSim))
    check('pin: a listed gosay re-validates at issue, and rides the hash', /o\.kind === 'gosay'\) return cmdGoSay/.test(gsSim) && /o\.kind === 'gosay'\) \{ mix/.test(gsSim))
    check('pin: the errand speaks as itself — court, courtReach and courtTarget take the speaker',
        /function court\(s, kind, speakerIdx = s\.active\)/.test(gsSim) && /function courtReach\(s, speakerIdx = s\.active\)/.test(gsSim) && /function courtTarget\(s, speakerIdx = s\.active\)/.test(gsSim))
    check('pin: the chip and the marquee and the registry all name the errand',
        /id === 'gosay'\) return 'gosay'/.test(gsArt) && /walks it over and says the kind thing/.test(gsJsx) && /walks the word over/.test(gsReg))
    check('the walking word wears its OWN chip — a bubble-on-legs glyph, not the seated chat glyph (#2704 tail 3)',
        /id === 'gosay'\) return 'gosay'/.test(gsArt) && /case 'gosay'/.test(gsArt) &&
        /gosay: \[\[740, 0\.04, 0\], \[988, 0\.05, 50\], \[460, 0\.035, 110\]\]/.test(gsSim))
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
    check('pin: the panel runs the flower IVY row with its FAMILY pulse', /glyph: 'flower', col: '#a3579b', lv: relLevel\(s\.rel\.ivy\)/.test(ivArt) && /pulse: relLevel\(s\.rel\.ivy\) === 3/.test(ivArt))   // #2240: rows now ship as bondRows data
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

// --------------------------------------------- NEIGHBOURS (#2588) -------
section('NEIGHBOURS (#2588): third-party bond — chat, glance, meet, warm')
{
    const nbSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const nbArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0 }
    const hold = (pairs) => pairs.forEach(([p, r, c]) => park(p, r, c))
    const soak = (g, pairs, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); drain(g) } }

    // Full chat: both guests free, ring 2 — the pair climbs and nobody else's
    // meter moves. (The bond web now has a spoke the household is NOT on.)
    const a = newRun(2588); hang(a, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(a, 'ivy', 'Ivy', 3, 7, '#a3579b')
    const na0 = a.rel.neigh, ca0 = a.content
    soak(a, [[a.people[0], 1, 12], [a.people[1], 1, 1]], 4)
    const grewA = a.rel.neigh - na0
    check('two free neighbours inside the ring befriend at NEIGH_CHAT/s',
        grewA >= 4 * NEIGH_CHAT - 0.03 && grewA <= 4 * NEIGH_CHAT + 0.01, `grew=${grewA.toFixed(3)}`)
    check('the pair bond pays NOTHING to the household meters',
        a.rel.fern === 0 && a.rel.ivy === 0 && a.rel.house === 0 && a.content === ca0)

    // Silence laws: out of gossip reach, both hosts busy, or solo company.
    // (Idle and apart is NOT silence — that's the meet-up. The held cells
    // isolate the reach gate from Ivy's honest drift toward the kitchen.)
    const f = newRun(2590); hang(f, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(f, 'ivy', 'Ivy', 3, 10, '#a3579b')
    soak(f, [[f.visitor, 3, 5], [f.ivy, 3, 10], [f.people[0], 3, 4], [f.people[1], 1, 1]], 4)   // p0 claims Fern; Ivy waits, held at d 5
    check('across the room the pair stays silent (d 5 > glance reach)', f.rel.neigh === 0, `neigh=${f.rel.neigh.toFixed(3)}`)
    const b = newRun(2592); hang(b, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(b, 'ivy', 'Ivy', 3, 7, '#a3579b')
    soak(b, [[b.people[0], 3, 4], [b.people[1], 3, 8]], 4)   // p0 nearest Fern, p1 nearest Ivy
    check('when BOTH guests have the ear, the pair says nothing',
        b.rel.neigh === 0 && b.rel.fern > 0 && b.rel.ivy > 0,
        `neigh=${b.rel.neigh.toFixed(3)} fern=${b.rel.fern.toFixed(3)} ivy=${b.rel.ivy.toFixed(3)}`)
    const c = newRun(2594); hang(c, 'visitor', 'Fern', 3, 5, '#4fae5f')
    soak(c, [[c.people[0], 1, 12], [c.people[1], 1, 1]], 4)
    check('one neighbour alone on the lot grows no pair', c.rel.neigh === 0)

    // Glance: exactly one claimed, within gossip reach — the waiting neighbour
    // rides the rumour at the slower law.
    const gl = newRun(2596); hang(gl, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(gl, 'ivy', 'Ivy', 3, 7, '#a3579b')
    soak(gl, [[gl.people[0], 3, 4], [gl.people[1], 1, 1]], 4)
    const grewGl = gl.rel.neigh
    check('one claimed, one waiting — the pair still grows at glance rate',
        grewGl > 4 * NEIGH_GLANCE - 0.06 && grewGl <= 4 * NEIGH_GLANCE + 0.01 && grewGl < 4 * NEIGH_CHAT - 0.05,
        `grew=${grewGl.toFixed(3)}`)

    // The meet-up: both idle and far apart, the newcomer crosses the room
    // (#2588 etiquette — the first neighbour stays home, Ivy walks).
    const m = newRun(2598); hang(m, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(m, 'ivy', 'Ivy', 3, 10, '#a3579b')
    let walked = false
    for (let i = 0; i < Math.round(8 / DT); i++) {
        hold([[m.visitor, 3, 5], [m.people[0], 1, 12], [m.people[1], 1, 1]]); advance(m, DT); drain(m)
        if (Array.isArray(m.ivy.path) && m.ivy.path.length) walked = true
    }
    const dEnd = Math.abs(m.ivy.r - m.visitor.r) + Math.abs(m.ivy.c - m.visitor.c)
    check('idle and apart, Ivy walks a real path to Fern and the pair then chats',
        walked && dEnd <= 2 && m.rel.neigh > 0.05 && m.visitor.path === null,
        `d=${dEnd} neigh=${m.rel.neigh.toFixed(3)} walked=${walked}`)

    // Crossing: exactly one rel-up, level named, content pays like every ladder.
    const x = newRun(2600); hang(x, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(x, 'ivy', 'Ivy', 3, 7, '#a3579b')
    x.rel.neigh = 11.95
    const cx0 = x.content
    const ups = []
    for (let i = 0; i < Math.round(2 / DT); i++) { hold([[x.people[0], 1, 12], [x.people[1], 1, 1]]); advance(x, DT); ups.push(...drain(x).filter((e) => e.t === 'rel-up')) }
    check('crossing the first rung pays the pair exactly one rel-up, level 1, +2 content',
        ups.length === 1 && ups[0].k === 'neigh' && ups[0].level === 1 && x.content === cx0 + 2, JSON.stringify(ups))

    // Cross-warmth: a pair on speaking terms chats DEEPER with the house.
    const warmth = (neigh0) => {
        const g = newRun(2602); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 7, '#a3579b')
        g.rel.neigh = neigh0
        soak(g, [[g.people[0], 3, 4], [g.people[1], 1, 1]], 4)
        return g.rel.fern
    }
    const fCold = warmth(0), fWarm = warmth(12)
    check('at rung 1+ Fern chats 25% deeper with the household (cross-warmth)',
        fWarm > fCold + 4 * 0.07 * (NEIGH_WARM - 1) - 0.04 && fWarm < fCold + 4 * 0.07 * (NEIGH_WARM - 1) + 0.03,
        `cold=${fCold.toFixed(3)} warm=${fWarm.toFixed(3)}`)
    const iw = newRun(2604); hang(iw, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(iw, 'ivy', 'Ivy', 3, 7, '#a3579b')
    iw.rel.neigh = 12
    soak(iw, [[iw.people[0], 3, 8], [iw.people[1], 1, 1]], 4)
    check('the warmth law reaches Ivy too', iw.rel.ivy > 4 * IVY_CHAT * NEIGH_WARM - 0.06 && iw.rel.ivy <= 4 * IVY_CHAT * NEIGH_WARM + 0.01,
        `ivy=${iw.rel.ivy.toFixed(3)}`)
    check('below the rung the law is invisible — Fern grows at exactly the old rate',
        fCold > 4 * 0.07 - 0.06 && fCold <= 4 * 0.07 + 0.001, `cold=${fCold.toFixed(3)}`)

    // The pair's own conversation: beats on the throttle, wordings rotate.
    const w = newRun(2606); hang(w, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(w, 'ivy', 'Ivy', 3, 7, '#a3579b')
    w.rel.neigh = 13.5
    const nbTicks = []
    let hitsSeen = 0, nbAt = null
    for (let i = 0; i < Math.round(23 / DT); i++) {
        hold([[w.people[0], 1, 12], [w.people[1], 1, 1]]); advance(w, DT)
        const got = drain(w).filter((e) => e.t === 'neigh')
        if (got.length) { hitsSeen += got.length; nbTicks.push(i); if (!nbAt) nbAt = got[0] }
    }
    const nbCdOk = nbTicks.every((t, i) => i === 0 || t - nbTicks[i - 1] >= Math.floor(NEIGH_COOL_CD / DT) - 1)
    check('a warm pair trades three lines in 23 s, spaced ≥ the exchange throttle',
        hitsSeen === 3 && w.neighHits === 3 && nbCdOk, `hits=${hitsSeen} ticks=${nbTicks.join(',')}`)
    check('exchange events carry a spot for the bubble',
        !!nbAt && Number.isFinite(nbAt.x) && Number.isFinite(nbAt.y))
    check('the pair rotates its three wordings', NEIGH_LINES.length === 3)

    // Absence cools the pair — the softest fade on the panel.
    const cool = newRun(2608)
    cool.rel.neigh = 30.01   // just above the FRIENDS edge — two hours of quiet tips it over
    for (let i = 0; i < Math.round(10.2 / DT); i++) { advance(cool, DT); drain(cool) }   // two sim-hours, nobody visits
    check('absence demotes the pair through relSub, quietly',
        cool.rel.neigh < 30 && cool.rel.neigh >= 30 - 2 * NEIGH_FADE - 0.01 && cool.rel.neigh > 30 - 3 * NEIGH_FADE,
        `neigh=${cool.rel.neigh.toFixed(3)}`)

    // Hash + determinism: the web rides the state and replays exactly.
    const h0 = newRun(31)
    const h1 = newRun(31); h1.rel.neigh = 40
    const h2 = newRun(31); h2.neighTell = 4.5
    const h3 = newRun(31); h3.neighHits = 1
    check('rel.neigh and the exchange throttle/beat count ride the hash',
        stateHash(h1) !== h0 && stateHash(h2) !== h0 && stateHash(h3) !== h0)
    const meet = (seed) => {
        const g = newRun(seed); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 10, '#a3579b')
        g.rel.neigh = 13.5
        soak(g, [[g.people[0], 3, 4], [g.people[1], 1, 1]], 14)
        return stateHash(g)
    }
    check('an afternoon under the neighbour law is seed-exact', meet(7) === meet(7) && meet(2588) === meet(2588))

    // Source pins: the law must not be silently unwired.
    check('pin: the pair law runs after the household tick, off the settled claims',
        /updateHouseBond\(s, simDt\)\n\s*updateNeighbours\(s, simDt\)/.test(nbSim))
    check('pin: cross-warmth stands in BOTH chat blocks',
        (nbSim.match(/NEIGH_WARM - 1/g) || []).length === 2)
    check('pin: the pair rates are the named constants',
        /relAdd\(s, 'neigh', NEIGH_CHAT \* dt\)/.test(nbSim) && /relAdd\(s, 'neigh', NEIGH_GLANCE \* dt\)/.test(nbSim) && /relSub\(s, 'neigh', NEIGH_FADE\)/.test(nbSim))
    check('pin: the BONDS panel runs the twin-leaf NEIGH row',
        /key: 'neigh', glyph: 'twin'/.test(nbArt) && /'NEIGH'/.test(nbArt))
}

// --------------------------------------------- NEIGH SPAT (#2604) -------
section('NEIGH SPAT (#2604): third-party grudge — souring, cold war, thaw, reunion, cooldown')
{
    const spSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const spJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const spArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; if (p.queue) p.queue.length = 0; p.owner = null; if (p.needs) for (const n of ['hunger', 'energy', 'fun', 'social', 'bladder']) p.needs[n] = Math.max(p.needs[n], 0.55) }   // #2604: a held resident stays out of the collapse lane — these soaks are long, and a frozen lost world tests nothing
    const hold = (pairs) => pairs.forEach(([p, r, c]) => park(p, r, c))
    const soak = (g, pairs, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); drain(g) } }
    const soakEv = (g, pairs, sec, sink) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); sink.push(...drain(g)) } }
    // one-ear layout: Fern (3,5) has the ear of p0 (3,4); Ivy waits beside her at
    // (3,7) — inside the pair ring, watching; p1 parked out of everyone's reach.
    const ear = (g) => [[g.visitor, 3, 5], [g.ivy, 3, 7], [g.people[0], 3, 4], [g.people[1], 1, 1]]
    const free = (g) => [[g.visitor, 3, 5], [g.ivy, 3, 7], [g.people[0], 1, 12], [g.people[1], 1, 1]]

    // The souring: exactly one ear, the other watches — 30 s and the pair cracks.
    const s1 = newRun(2604); hang(s1, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(s1, 'ivy', 'Ivy', 3, 7, '#a3579b')
    s1.rel.neigh = 20
    const rn0 = s1.rel.neigh
    soak(s1, ear(s1), NEIGH_IGNORE_T - 1)
    check('a near-miss of one-ear waiting sours NOTHING (boundary under the timer)',
        s1.neiGrudge === 0 && s1.neiSpats === 0 && s1.neiIgnore >= NEIGH_IGNORE_T - 1.05 && s1.neiIgnore < NEIGH_IGNORE_T - 0.5,
        `ignore=${s1.neiIgnore.toFixed(2)}`)
    const ev1 = []
    soakEv(s1, ear(s1), 2, ev1)
    check('the 30th second of watched-but-unheard cracks the pair',
        s1.neiGrudge === 1 && s1.neiSpats === 1 && s1.neiIgnore === 0, `grudge=${s1.neiGrudge} spats=${s1.neiSpats}`)
    const evSpat = ev1.filter((e) => e.t === 'spat')
    check('the pair spat rides the household crack event, names itself, carries a spot',
        evSpat.length === 1 && evSpat[0].who === 'neigh' && Number.isFinite(evSpat[0].x) && Number.isFinite(evSpat[0].y), JSON.stringify(evSpat))
    check('the spat takes NEIGH_SPAT_DROP off the pair and only the pair',
        s1.rel.neigh >= rn0 - NEIGH_SPAT_DROP - 0.02 && s1.rel.neigh <= rn0 - NEIGH_SPAT_DROP + (NEIGH_IGNORE_T + 2) * NEIGH_GLANCE + 0.02
        && s1.rel.fern > 0 && s1.rel.house === 0,
        `neigh=${s1.rel.neigh.toFixed(3)} (was ${rn0}) fern=${s1.rel.fern.toFixed(3)}`)

    // The cold war: proximity builds NOTHING — no chat, no glance, no meet-up —
    // while individual chats with residents are untouched (the grudge is theirs).
    // Tolerances: the hourly absence-fade (NEIGH_FADE per 5 s sim-hour) still
    // runs while cold — so "builds nothing" means NOTHING POSITIVE, and each
    // 10 s soak may lose up to three hour-ticks (0.06) to the ordinary clock.
    const rnCold = s1.rel.neigh, fernCold = s1.rel.fern
    soak(s1, [[s1.visitor, 3, 5], [s1.ivy, 3, 7], [s1.people[0], 1, 12], [s1.people[1], 1, 1]], 6)   // both free, in ring: chat WOULD pay
    check('a cold pair in the ring builds nothing (chat silenced)',
        s1.rel.neigh > rnCold - 3 * NEIGH_FADE - 0.001 && s1.rel.neigh <= rnCold && s1.neiIgnore === 0)
    let coldWalk = false
    for (let i = 0; i < Math.round(6 / DT); i++) {
        hold([[s1.visitor, 3, 5], [s1.ivy, 3, 10], [s1.people[0], 1, 12], [s1.people[1], 1, 1]]); advance(s1, DT); drain(s1)
        if (Array.isArray(s1.ivy.path) && s1.ivy.path.length) coldWalk = true   // apart: meet-up WOULD walk
    }
    check('a cold pair keeps its distance — the meet-up walk is refused',
        !coldWalk && s1.rel.neigh > rnCold - 6 * NEIGH_FADE - 0.001, `walk=${coldWalk}`)
    const fernMid = s1.rel.fern
    soak(s1, ear(s1), 6)   // one ear again: glance WOULD pay
    check('a cold pair at a glance stays flat — while the resident chat is NOT the pair\u2019s quarrel',
        s1.rel.neigh > rnCold - 9 * NEIGH_FADE - 0.001 && s1.rel.neigh <= rnCold && s1.rel.fern > fernMid,
        `neigh=${(s1.rel.neigh - rnCold).toFixed(3)} fern=+${(s1.rel.fern - fernMid).toFixed(3)}`)

    // The exit is absence: one goes home → thaw; the pay waits for the reunion.
    s1.visitor = null
    soak(s1, [[s1.ivy, 3, 7], [s1.people[0], 1, 12], [s1.people[1], 1, 1]], 4)
    check('absence thaws the pair grudge into mending', s1.neiGrudge === 0 && s1.neiMending === 1)
    const rn2 = s1.rel.neigh, ct2 = s1.content
    hang(s1, 'visitor', 'Fern', 3, 5, '#4fae5f')
    const ev2 = []
    soakEv(s1, free(s1), 2, ev2)   // back together, nobody claiming
    const evMake = ev2.filter((e) => e.t === 'makeup')
    check('the reunion in the ring pays the thaw once: +NEIGH_MAKEUP, hearts, no content',
        s1.neiMending === 0 && evMake.length === 1 && evMake[0].who === 'neigh'
        && s1.rel.neigh >= rn2 + NEIGH_MAKEUP - 3 * NEIGH_FADE - 0.001 && s1.rel.neigh <= rn2 + NEIGH_MAKEUP + 2 * NEIGH_CHAT + 0.02 && s1.content === ct2,
        `neigh=+${(s1.rel.neigh - rn2).toFixed(3)} content=${s1.content}`)
    const ct3 = s1.content
    soakEv(s1, free(s1), 4, ev2)
    check('the thaw pays once — the chat law takes it from there',
        ev2.filter((e) => e.t === 'makeup').length === 1 && s1.rel.neigh > rn2 + NEIGH_MAKEUP && s1.content === ct3)

    // Resets: the timer counts WAITING, not time. Any peace breaks it.
    // Resets: the timer counts WAITING, not time. Any peace breaks it. Each
    // run stays under the hour-19 exit so the pair lives to answer for itself.
    const resetCase = (name, midPairs) => {
        const g = newRun(2610); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 7, '#a3579b')
        soak(g, ear(g), 16)
        check(`${name}: the watch accumulates before the peace`, g.neiIgnore >= 15.9 && g.neiSpats === 0, `ignore=${g.neiIgnore.toFixed(2)}`)
        soak(g, midPairs(g), 10)
        check(`${name} resets the souring clock`, g.neiIgnore === 0 && g.neiSpats === 0, `ignore=${g.neiIgnore.toFixed(2)}`)
        soak(g, ear(g), 16)   // 32 one-ear seconds total — without the reset the timer would have fired
        check(`${name}: a restarted watch cannot reach the timer on borrowed minutes`,
            g.neiIgnore < NEIGH_IGNORE_T && g.neiSpats === 0, `ignore=${g.neiIgnore.toFixed(2)} spats=${g.neiSpats}`)
        return g
    }
    resetCase('both hang free together', free)
    resetCase('both guests share an ear', (g) => [[g.visitor, 3, 5], [g.ivy, 3, 7], [g.people[0], 3, 4], [g.people[1], 3, 8]])
    resetCase('the waiting neighbour steps out of gossip reach', (g) => [[g.visitor, 3, 5], [g.ivy, 3, 10], [g.people[0], 3, 4], [g.people[1], 1, 1]])

    // The cooldown mirror: SPAT_CD holds even a re-soured pair. The flags and
    // the timer are state — forcing them stands in for "the pair already had
    // its full sour stretch", so this run stays short of the hour-19 exits.
    const cd = newRun(2614); hang(cd, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(cd, 'ivy', 'Ivy', 3, 7, '#a3579b')
    cd.neiIgnore = NEIGH_IGNORE_T - 3
    soak(cd, ear(cd), 4)
    check('the cooldown rig: first spat fired on schedule', cd.neiSpats === 1 && cd.neiGrudge === 1)
    cd.neiGrudge = 0; cd.neiMending = 0; cd.neiIgnore = NEIGH_IGNORE_T   // re-soured to the teeth, mid-cooldown
    soak(cd, ear(cd), 2)
    check('the SPAT_CD mirror: a re-soured pair inside the cooldown waits',
        cd.neiSpats === 1 && cd.neiIgnore >= NEIGH_IGNORE_T && cd.neiSpatCd > 0, `spats=${cd.neiSpats} cd=${cd.neiSpatCd.toFixed(1)}`)
    soak(cd, ear(cd), cd.neiSpatCd + 1.5)
    check('when the cooldown runs out, the sour pair cracks again', cd.neiSpats === 2 && cd.neiGrudge === 1)

    // Hash, determinism, source pins: the ledger is state and the law is wired.
    const k0 = newRun(31)
    const k1 = newRun(31); k1.neiSpats = 1
    const k2 = newRun(31); k2.neiGrudge = 1
    const k3 = newRun(31); k3.neiMending = 1
    check('the pair\u2019s quarrel ledger rides the hash',
        stateHash(k1) !== k0 && stateHash(k2) !== k0 && stateHash(k3) !== k0)
    const spatRun = (seed) => {
        const g = newRun(seed); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 7, '#a3579b')
        soak(g, ear(g), NEIGH_IGNORE_T + 2)          // crack
        g.visitor = null; soak(g, [[g.ivy, 3, 7], [g.people[0], 1, 12], [g.people[1], 1, 1]], 3)   // absence
        hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f')
        soak(g, free(g), 2)                          // reunion
        return stateHash(g)
    }
    check('a whole quarrel — crack, absence, reunion — is seed-exact',
        spatRun(7) === spatRun(7) && spatRun(2604) === spatRun(2604))
    const cwBlk = (spSim.match(/\n    if \(s\.neiGrudge\) \{[\s\S]*?\n    \}\n/) || [''])[0]
    const cwNoMed = cwBlk.replace(/if \(!s\.neiMediated\) \{[\s\S]*?\n        \}\n/, '')   // #2672: mediation is an EXIT from the cold war, not the cold war — strip it before the never-pay test
    check('pin: the cold war silences the pair by returning before any pay (#2599: it may murmur lines — never pay; #2672: except the mediation exit)',
        /return/.test(cwBlk) && !/rel(?:Add|Sub)|money|content|neiSpats/.test(cwNoMed)
        && /s\.neiIgnore >= NEIGH_IGNORE_T && s\.neiSpatCd <= 0/.test(spSim))
    check('pin: absence thaws, reunion pays NEIGH_MAKEUP once',
        /if \(s\.neiGrudge\) \{\s*s\.neiGrudge = 0\s*s\.neiMending = 1/.test(spSim)
        && /relAdd\(s, 'neigh', NEIGH_MAKEUP\)/.test(spSim) && /if \(s\.neiMending && !fv\.claim && !iv\.claim && d <= NEIGH_REACH\)/.test(spSim))
    check('pin: the ledger mixes into stateHash', /mix\(s\.neiSpats\); mix\(s\.neiGrudge\); mix\(s\.neiMending\)/.test(spSim))
    check('pin: the banners name the pair, the NEIGH row runs ash while cold',
        /who === 'neigh' \? 'FERN AND IVY SPAT!'/.test(spJsx) && /who === 'neigh' \? 'THE NEIGHBOURS MADE UP/.test(spJsx)
        && /neiGrudge \? '#2c6b5b' : '#3aa08a'/.test(spArt))
    check('pin: the marquee teaches the law', /WATCHED but never HEARD/.test(spJsx))
}

// ------------------------------------------ NEIGH MEDIATE (#2672) -------
section('NEIGH MEDIATE (#2672): the kid broke it up — reach ring, once per spat, soft pay, mending lane, hash')
{
    const mdSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const mdJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; if (p.queue) p.queue.length = 0; p.owner = null; if (p.needs) for (const n of ['hunger', 'energy', 'fun', 'social', 'bladder']) p.needs[n] = Math.max(p.needs[n], 0.55) }   // #2604 pattern
    const stand = (m, r, c) => { m.r = r; m.c = c; m.x = tileX(c) + TILE / 2; m.y = tileY(r) + TILE / 2; m.path = null; m.wanderT = 9999; m.play = false }   // #2672: mediators get position held only — pets/kids carry no queue, and standing their needs up would invent NaN
    const hold = (pairs) => pairs.forEach(([p, r, c]) => park(p, r, c))
    const soak = (g, pairs, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); drain(g) } }
    const soakEv = (g, pairs, sec, sink) => { for (let i = 0; i < Math.round(sec / DT); i++) { hold(pairs); advance(g, DT); sink.push(...drain(g)) } }
    const ear = (g) => [[g.visitor, 3, 5], [g.ivy, 3, 7], [g.people[0], 3, 4], [g.people[1], 1, 1]]
    const free = (g) => [[g.visitor, 3, 5], [g.ivy, 3, 7], [g.people[0], 1, 12], [g.people[1], 1, 1]]
    // A cracked pair (Fern 3,5 / Ivy 3,7 — the #2604 layout), paid-for, money
    // in pocket. Mediators enter by the real counter; positions then stand-held.
    const crack = (seed) => {
        const g = newRun(seed); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 7, '#a3579b')
        g.rel.neigh = 20
        soak(g, ear(g), NEIGH_IGNORE_T + 1)
        g.money = 900
        return g
    }

    // The law: an awake mediator within reach of BOTH cracks the cold war —
    // soft pay at once, mending lane entered (the reunion still pays its own).
    const m1 = crack(2672)
    adoptPet(m1)
    check('a cold war with nobody nearby just murmurs — no mediation, nothing paid', (() => {
        const before = m1.rel.neigh
        soak(m1, free(m1), 3)
        return m1.neiGrudge === 1 && m1.neiMediated === 0 && m1.rel.neigh <= before + 0.001
    })(), `grudge=${m1.neiGrudge} mediated=${m1.neiMediated}`)
    const ev1 = []
    const rnA = m1.rel.neigh
    soakEv(m1, [...free(m1), [m1.pet, 1, 6]], 2, ev1)   // (1,6): exactly 3 from Fern, exactly 3 from Ivy — the boundary in
    check('a mediator at exactly reach 3 of BOTH cracks the cold war', m1.neiGrudge === 0 && m1.neiMediated === 1)
    check('the mediation pays its soft warmth and enters the mending lane', (() => {
        const makeup = ev1.filter((e) => e.t === 'makeup').length
        return rnA + NEIGH_MEDIATE_PAY + (makeup ? NEIGH_MAKEUP : 0) - 0.12 <= m1.rel.neigh && m1.rel.neigh <= rnA + NEIGH_MEDIATE_PAY + (makeup ? NEIGH_MAKEUP : 0) + 0.12
    })(), `neigh=${m1.rel.neigh.toFixed(3)} (was ${rnA.toFixed(3)})`)
    const evMediate = ev1.filter((e) => e.t === 'mediate')
    check('the mediate event names the pair, the mediator and a spot — once only',
        evMediate.length === 1 && evMediate[0].who === 'neigh' && evMediate[0].med === 'pet' && Number.isFinite(evMediate[0].x), JSON.stringify(evMediate))

    // Reach is to BOTH: one elbow out of the ring and the war stands. (The
    // awake clause is source-pinned below — a daytime soak cannot hold a pet
    // asleep: updatePet's day-wake law rightly overrides it, and inventing a
    // second sleep law to make the pin pass would be the harness wagging the dog.)
    const m2 = crack(31)
    adoptPet(m2)
    soak(m2, [...free(m2), [m2.pet, 0, 6]], 3)   // (0,6): 4 from each — out
    check('a mediator out of reach of the pair mediates nothing', m2.neiGrudge === 1 && m2.neiMediated === 0)

    // After the peace: an inert bystander. Then a SECOND cold war that arrives
    // WITHOUT a fresh spat must stay locked (absence-thaws the war, but only a
    // new spat re-arms the mediation chance). Then the real second spat: thaw
    // apart, reunite, sour past the cooldown — and the cat breaks IT.
    const ev3 = []
    soakEv(m1, [...free(m1), [m1.pet, 1, 6]], 2, ev3)
    check('after the peace, a mediator standing there is inert', m1.neiMediated === 1 && ev3.filter((e) => e.t === 'mediate').length === 0)
    m1.neiGrudge = 1; m1.neiMending = 0   // a cold war without a new spat: the lock holds
    soak(m1, [...free(m1), [m1.pet, 1, 6]], 2)
    check('the once-per-spat lock holds while no new spat has fired', m1.neiGrudge === 1 && m1.neiMediated === 1 && m1.neiMending === 0)
    m1.visitor = null
    soak(m1, [[m1.ivy, 3, 7], [m1.people[0], 1, 12], [m1.people[1], 1, 1], [m1.pet, 1, 6]], 3)   // absence thaws…
    check('absence thaws the locked war too', m1.neiGrudge === 0 && m1.neiMending === 1)
    hang(m1, 'visitor', 'Fern', 3, 5, '#4fae5f')
    soak(m1, [...free(m1), [m1.pet, 1, 6]], 2)   // …and the reunion pays; mediation stays locked
    check('the reunion pays, but mediation waits for a new spat', m1.neiMending === 0 && m1.neiMediated === 1)
    // Sour again, past the cooldown. A whole day is only ~2 min of real time
    // (#2244's clock), and past hour 19 both neighbours head home — this soak
    // runs at the *end* of a long scripted day, so rewind the hour first
    // (visitors then stay through the souring; the cooldown wait has played
    // out for real, and Ivy's patience gets re-hangs if she still wanders).
    m1.hour = 8; m1.sec = 0
    for (let i = 0; i < Math.round(44 / DT); i++) {
        if (!m1.visitor) hang(m1, 'visitor', 'Fern', 3, 5, '#4fae5f')
        if (!m1.ivy) hang(m1, 'ivy', 'Ivy', 3, 7, '#a3579b')
        hold([...ear(m1), [m1.pet, 1, 6]]); advance(m1, DT); drain(m1)
    }
    check('the second spat re-arms mediation — and the cat breaks it at once',
        m1.neiSpats === 2 && m1.neiMediated === 1 && m1.neiGrudge === 0 && m1.neiMending === 1,
        `spats=${m1.neiSpats} mediated=${m1.neiMediated} grudge=${m1.neiGrudge}`)

    // The kid takes the cat's job when the cat is out of the ring — med names the kid.
    const k1 = crack(7)
    adoptPet(k1); adoptKid(k1)
    const evK = []
    soakEv(k1, [...free(k1), [k1.pet, 12, 1], [k1.kid, 2, 6]], 1, evK)
    check('the kid mediates when the cat is out of the ring, and is named for it', (() => {
        const e = evK.filter((x) => x.t === 'mediate')
        return e.length === 1 && e[0].med === 'kid' && k1.neiMediated === 1
    })(), JSON.stringify(evK.filter((x) => x.t === 'mediate')))

    // The cat is asked before the kid — Miso arrived first (#2197 precedes #2203).
    const k2 = crack(9)
    adoptPet(k2); adoptKid(k2)
    const evK2 = []
    soakEv(k2, [...free(k2), [k2.pet, 1, 6], [k2.kid, 2, 6]], 1, evK2)
    check('both nearby: the cat breaks it up (shelf order, not a coin)', (() => {
        const e = evK2.filter((x) => x.t === 'mediate')
        return e.length === 1 && e[0].med === 'pet'
    })(), JSON.stringify(evK2.filter((x) => x.t === 'mediate')))

    // Hash + determinism: the ledger flag is state; a mediated day is seed-exact.
    const h0 = newRun(31)
    const h1 = newRun(31); h1.neiMediated = 1
    check('the mediation flag rides the hash', stateHash(h1) !== stateHash(h0))
    const medRun = (seed) => {
        const g = crack(seed); adoptPet(g)
        const ev = []
        soakEv(g, [...free(g), [g.pet, 1, 6]], 3, ev)
        return { h: stateHash(g), med: ev.filter((e) => e.t === 'mediate').length }
    }
    check('a mediated quarrel is seed-exact, and it really mediated',
        medRun(2672).h === medRun(2672).h && medRun(5).h === medRun(5).h && medRun(2672).med === 1 && medRun(5).med === 1,
        JSON.stringify({ a: medRun(2672), b: medRun(5) }))

    // Source pins: the ring tests BOTH, a new spat clears the flag, the view names the mediator.
    check('pin: the ring asks BOTH quarrellers and the cat goes first',
        /function mediatorNear\(s, fv, iv\) \{\s*for \(const m of \[s\.pet, s\.kid\]\)/.test(mdSim)
        && /dF <= NEIGH_MEDIATE_REACH && dI <= NEIGH_MEDIATE_REACH/.test(mdSim) && /if \(!m \|\| m\.asleep\) continue/.test(mdSim))
    check('pin: a fresh spat clears the ledger flag; the hash mixes it',
        /s\.neiGrudge = 1\s*s\.neiMediated = 0/.test(mdSim) && /mix\(s\.neiMediated\)/.test(mdSim))
    check('pin: the view plays the beat — soft chord, named mediator, pair bubble',
        /case 'mediate'/.test(mdJsx) && /e\.med === 'kid' \? 'PIP' : 'MISO'/.test(mdJsx) && /BROKE IT UP ♥/.test(mdJsx))
}

// ------------------------------------------- NEIGH STROLL (#2611) -------
section('NEIGH STROLL (#2611): the pair walks the lot — bank, circuit, walk-pause, carry, zeroing, hash')
{
    const stSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const stJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; if (p.queue) p.queue.length = 0; p.owner = null; if (p.needs) for (const n of ['hunger', 'energy', 'fun', 'social', 'bladder']) p.needs[n] = Math.max(p.needs[n], 0.55) }   // #2604 clamp — laps are long
    // Hold RESIDENTS only, and in cells whose d≤2 claim halo never touches the
    // circuit (road cells, the west corridor, row 0): a claim mid-lap would open
    // the kitchen re-home guard, split the pair, and fake both a leak and a stall.
    const free = (g) => [[g.people[0], 6, 8], [g.people[1], 1, 1]]   // residents also stay arm's-reach apart — idle co-presence would grow rel.house
    const ear = (g) => [[g.people[0], 3, 4], [g.people[1], 1, 1]]   // p0 claims Fern at (3,5); Ivy watches beside her
    // laps run past the hour-19 visitor exit, so these soaks pin the clock below it —
    // needs clamp (above) keeps the household out of the collapse lane (STATE #2604 catch).
    const lap = (g, pairs, sec, sink) => { for (let i = 0; i < Math.round(sec / DT); i++) { pairs.forEach(([p, r, c]) => park(p, r, c)); g.hour = Math.min(g.hour, 10); advance(g, DT); if (sink) sink.push(...drain(g)); else drain(g) } }
    const strolls = (evs) => evs.filter((e) => e.t === 'neigh-stroll')

    // The bank and the boundary: chat accrues the walk, and nothing fires short.
    const a = newRun(2611); hang(a, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(a, 'ivy', 'Ivy', 3, 7, '#a3579b')
    const evA = []
    lap(a, free(a), NEIGH_STROLL_T - 1, evA)
    check('free chat banks the walk but sours nothing early (boundary under the timer)',
        strolls(evA).length === 0 && a.neiStroll >= NEIGH_STROLL_T - 1.05 && a.neiStroll < NEIGH_STROLL_T - 0.5
        && a.rel.neigh > 0, `bank=${a.neiStroll.toFixed(2)}`)
    lap(a, free(a), 1.5, evA)
    const e0 = strolls(evA)
    check('the 12th second of free chat sends the pair off on lap one, bank cleared',
        e0.length === 1 && e0[0].i === 0 && a.neiStroll < 1.05 && !!a.visitor.path && !!a.ivy.path,
        JSON.stringify(e0.map((e) => e.i)))
    check('the stroll event carries a spot for the tell',
        e0.length === 1 && Number.isFinite(e0[0].x) && Number.isFinite(e0[0].y), JSON.stringify(e0))

    // Fern leads, Ivy trails: the pair arrives at the front-path spot together.
    const evW = []
    lap(a, free(a), 16, evW)
    check('Fern leads to the front path and Ivy takes the cell beside her',
        !a.visitor.path && a.visitor.r === NEIGH_SPOTS[0].r && a.visitor.c === NEIGH_SPOTS[0].c
        && Math.abs(a.visitor.r - a.ivy.r) + Math.abs(a.visitor.c - a.ivy.c) <= 2,
        `f=${a.visitor.r},${a.visitor.c} iv=${a.ivy.r},${a.ivy.c}`)
    check('a mid-stride pair never queues the next stroll — the bank only fills once both are mobile',
        a.neiStroll > 0 && a.neiStroll < 6.5, `bank=${a.neiStroll.toFixed(2)}`)
    check('no second stroll while the first lap is still walking', strolls(evW).length === 0, `${strolls(evW).length}`)
    const rnHere = a.rel.neigh
    const evLap = []
    lap(a, free(a), 5, evLap)
    check('arrived and mobile, the pair chats at full rate again',
        a.rel.neigh - rnHere >= 5 * NEIGH_CHAT - 0.08 && a.rel.neigh - rnHere <= 5 * NEIGH_CHAT + 0.01,
        `grew=${(a.rel.neigh - rnHere).toFixed(3)}`)

    // The circuit: every lap must point at its fixed spot, and the rotation wraps.
    // Capture each fire's target at the fire tick — walk lengths drift, the law doesn't.
    const fires = []
    let maxD = 0
    for (let i = 0; i < Math.round(95 / DT); i++) {
        free(a).forEach(([p, r, c]) => park(p, r, c))
        a.hour = Math.min(a.hour, 10)
        advance(a, DT)
        for (const e of a.events) if (e.t === 'neigh-stroll')
            fires.push({ i: e.i, tail: Array.isArray(a.visitor.path) ? a.visitor.path[a.visitor.path.length - 1] : null })
        a.events.length = 0
        maxD = Math.max(maxD, Math.abs(a.visitor.r - a.ivy.r) + Math.abs(a.visitor.c - a.ivy.c))
    }
    check('every lap aims at its fixed circuit spot',
        fires.length >= 4 && fires.every((f) => f.tail && f.tail.r === NEIGH_SPOTS[f.i].r && f.tail.c === NEIGH_SPOTS[f.i].c),
        JSON.stringify(fires.map((f) => `${f.i}:${f.tail ? f.tail.r + ',' + f.tail.c : 'null'}`)))
    check('the rotation advances one spot a lap, mod three, and wraps past the back lawn',
        fires.length >= 4 && fires.every((f, k) => k === 0 || f.i === (fires[k - 1].i + 1) % 3)
        && fires.some((f, k) => k > 0 && f.i === 0 && fires[k - 1].i === 2),
        fires.map((f) => f.i).join(','))
    check('the pair never splits past gossip reach across the whole circuit',
        maxD <= 4 && !a.done, `maxD=${maxD} f=${a.visitor.r},${a.visitor.c} iv=${a.ivy.r},${a.ivy.c}`)

    // Isolation: the lap belongs to the pair — household meters and content never move.
    check('the stroll lap pays NOTHING to the household meters',
        a.rel.fern === 0 && a.rel.ivy === 0 && a.rel.house === 0, `fern=${a.rel.fern} ivy=${a.rel.ivy} house=${a.rel.house}`)

    // Claims CARRY the bank (a paused conversation resumes where it stopped)…
    const c = newRun(2613); hang(c, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(c, 'ivy', 'Ivy', 3, 7, '#a3579b')
    const evC = []
    lap(c, free(c), 10)
    lap(c, ear(c), 20, evC)
    check('while an ear is on the pair the walk is held — claims freeze, never fire',
        strolls(evC).length === 0 && c.neiStroll >= 9.5, `bank=${c.neiStroll.toFixed(2)}`)
    const evC2 = []
    lap(c, free(c), 3, evC2)
    check('the peace resumes the walk on the carried bank — no reset', strolls(evC2).length === 1)

    // …but a spat KILLS it, and absence resets it to a full timer.
    const d1 = newRun(2615); hang(d1, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(d1, 'ivy', 'Ivy', 3, 7, '#a3579b')
    lap(d1, free(d1), 10)
    lap(d1, ear(d1), NEIGH_IGNORE_T + 2)
    check('the quarrel zeroes the walk bank — a cold pair takes no exercise',
        d1.neiSpats === 1 && d1.neiStroll === 0, `spats=${d1.neiSpats} bank=${d1.neiStroll}`)
    const cold = newRun(2617); hang(cold, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(cold, 'ivy', 'Ivy', 3, 7, '#a3579b')
    cold.neiGrudge = 1
    const evCold = []
    lap(cold, free(cold), 30, evCold)
    check('the cold war refuses the circuit outright (thirty free seconds, no lap)',
        strolls(evCold).length === 0 && cold.rel.neigh <= 0.001, `strolls=${strolls(evCold).length}`)
    cold.neiGrudge = 0; cold.neiMending = 1
    const evWarm = []
    lap(cold, free(cold), 20, evWarm)
    check('after the thaw the circuit walks again', strolls(evWarm).length >= 1 && cold.rel.neigh > 0,
        `strolls=${strolls(evWarm).length} neigh=${cold.rel.neigh.toFixed(2)}`)
    const ab = newRun(2619); hang(ab, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(ab, 'ivy', 'Ivy', 3, 7, '#a3579b')
    lap(ab, free(ab), 10)
    ab.ivy = null
    advance(ab, DT); drain(ab)
    ab.visitor.repathT = null   // Fern's single solo tick may arm a sofa re-home — that drift is rig noise, not the law
    check('absence zeroes the bank — a visit starts its walks at the gate', ab.neiStroll === 0, `bank=${ab.neiStroll}`)
    hang(ab, 'ivy', 'Ivy', 3, 7, '#a3579b')
    const evAb = []
    lap(ab, free(ab), 10, evAb)
    check('the fresh pair needs the FULL timer before the next stroll', strolls(evAb).length === 0 && ab.neiStroll >= 9.5 && ab.neiStroll < NEIGH_STROLL_T - 0.5, `bank=${ab.neiStroll.toFixed(2)}`)
    lap(ab, free(ab), 4, evAb)
    check('…and takes it when the bank fills', strolls(evAb).length === 1)

    // Hash law: the beat rides it, the clock stays off (the spatCd rule, mirrored).
    const w0 = newRun(31)
    const w1 = newRun(31); w1.neiWalk = 1
    const w2 = newRun(31); w2.neiStroll = 5
    check('the circuit beat rides the hash; the bank (a clock) stays off',
        stateHash(w1) !== stateHash(w0) && stateHash(w2) === stateHash(w0))
    const strollRun = (seed) => {
        const g = newRun(seed); hang(g, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(g, 'ivy', 'Ivy', 3, 7, '#a3579b')
        lap(g, free(g), 60)
        return stateHash(g)
    }
    check('a minute of strolling is seed-exact', strollRun(7) === strollRun(7) && strollRun(2611) === strollRun(2611))

    // Pins: the law, the tells, the honest circuit.
    check('pin: the bank fires on the named constant and the rotating spot table',
        /s\.neiStroll >= NEIGH_STROLL_T/.test(stSim) && /NEIGH_SPOTS\[idx\]/.test(stSim)
        && /s\.neiWalk = \(s\.neiWalk \+ 1\) % NEIGH_SPOTS\.length/.test(stSim))
    check('pin: the bank fills only while both are mobile, and the lap runs after the cold-war return',
        /if \(!fv\.path && !iv\.path\) \{\s*s\.neiStroll \+= dt/.test(stSim) && /if \(s\.neiGrudge\) \{[\s\S]{0,1400}?\n    \}\n    if \(s\.neiMending/.test(stSim))   // #2672: the mediation exit widened the grudge block — window 640→1400
    check('pin: the tell names the pair and the marquee teaches the law',
        /FERN AND IVY TAKE A WALK/.test(stJsx) && /THE PAIR WANDERS THE LOT/.test(stJsx))
    const fresh = newRun(3)
    check('the circuit is honest — three fixed spots, all walkable, one line each',
        NEIGH_SPOTS.length === 3 && NEIGH_SPOTS.every((sp) => walkable(fresh, sp.r, sp.c))
        && NEIGH_STROLL_LINES.length === NEIGH_SPOTS.length && NEIGH_STROLL_T === 12)
}

// --------------------------------------------------------- NEIGH VIEW (#2599) ----
// The pair's identity on the VIEW side: their lines wear their hues, their
// reunion sparkles teal, their cold war leans them apart, and the panel teaches
// cross-warmth. No economy here — sim.js must not learn any of these words.
section('NEIGH VIEW (#2599): pair bubbles, teal reunion, guest sulks, warmth sparkle, murmur, attract ring')
{
    const nvArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const nvJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const nvSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')

    // bondRows behaviour: the warmth flag is data, derived like `pulse`.
    const w0 = newRun(5)
    const r0 = bondRows(w0)
    check('below the rung no row is marked warm', r0.every((r) => !r.warm))
    const w1 = newRun(5); w1.rel.neigh = REL_EDGES[0]   // rung 1 — the rung the chat law deepens at
    const r1 = bondRows(w1)
    const by = (k) => r1.find((r) => r.key === k)
    check('at the rung BOTH guest rows carry the warmth tell', by('fern').warm === true && by('ivy').warm === true)
    check('warmth marks only the guests — the house and the pair row stay clean', !by('house').warm && !by('neigh').warm)

    check('pin: the warmth flag derives from NEIGH_WARM_AT, twice over (no drift)',
        (nvArt.match(/relLevel\(s\.rel\.neigh\) >= NEIGH_WARM_AT/g) || []).length === 2 && /NEIGH_WARM_AT,/.test(nvArt))
    check('pin: the panel breathes a teal diamond on warm rows', /row\.warm && Math\.floor\(t \* 2\.5\)/.test(nvArt) && /row\.x \+ 82, dy = row\.y \+ 3\.5/.test(nvArt))
    check('pin: pair hues are THE pair colours — the same ones the rows and dresses paint',
        /export const PAIR_HUES = \['#4fae5f', '#a3579b'\]/.test(nvArt) && /col: '#4fae5f'/.test(nvArt) && /col: '#a3579b'/.test(nvArt))
    check('pin: showSay stamps the pair hue by the event, nothing else',
        /e\.t === 'neigh' \|\| e\.who === 'neigh' \? PAIR_HUES : null/.test(nvJsx))
    check('pin: drawSay wears split rims and twin tinted tails for pair lines',
        /if \(b\.hues\)/.test(nvArt) && /b\.hues\[0\]/.test(nvArt) && /b\.hues\[1\]/.test(nvArt)
        && (nvArt.match(/ctx\.clip\(\)/g) || []).length >= 2)
    check('pin: pair reunions sparkle leaves; household ones keep their hearts',
        /if \(e\.who === 'neigh'\) pairSparkle\(e\.x, e\.y - 12\); else heartBurst/.test(nvJsx))
    check('pin: the leaf particle is the twin-leaf NEIGH glyph in flight',
        /kind === 'leaf'/.test(nvJsx) && /mirrored leaves/.test(nvJsx) && /'#3aa08a' : '#7fd0c0'/.test(nvJsx))
    check('pin: the guests borrow the cold-war idiom — lean apart while neiGrudge holds',
        /g\.neiGrudge && g\.visitor && g\.ivy && \(o\.p === g\.visitor \|\| o\.p === g\.ivy\)/.test(nvJsx)
        && /o\.p === g\.visitor \? g\.ivy : g\.visitor/.test(nvJsx))
    check('pin: the guests\u2019 puff arms at the crack and fades on the real clock',
        /if \(e\.who === 'neigh'\) neighSulks = 2\.4/.test(nvJsx) && /neighSulks = Math\.max\(0, neighSulks - dtMs \/ 1000\)/.test(nvJsx))
    check('pin: no stale pair-puff across streets', /sayB\.life = 0[\s\S]{0,120}neighSulks = 0/.test(nvJsx))
    check('pin: arrival rings the greeting on the ring crossing, unclaimed and warm only',
        /neighPrevD > 2 && d0 <= 2/.test(nvJsx) && /!gs\.neiGrudge && !gs\.visitor\.claim && !gs\.ivy\.claim/.test(nvJsx)
        && /neighWave = 1\.1/.test(nvJsx))
    check('pin: the greeting is one soft note and teal glints — AudioController only, no assets',
        /playTone\(784, 0\.06, 'triangle', 0\.03\)/.test(nvJsx) && /'#7fd0c0', 1\.6, 'flash'/.test(nvJsx))
    check('pin: Fern wears the wave — the host of the street greets, and the cold-war branches outrank the beat',
        /neighWave > 0 && g\.visitor && o\.p === g\.visitor/.test(nvJsx) && /fx = 'wave'/.test(nvJsx)
        && /else if \(ri < 0 && neighWave > 0/.test(nvJsx))
    check('pin: the greeting has a raised pumping arm in the paint',
        /if \(fx === 'wave'\)/.test(nvArt) && /Math\.sin\(t \* 14\)/.test(nvArt) && /const pump = Math\.sin\(t \* 14\)/.test(nvArt))
    check('pin: the beat fades on the real clock and never crosses streets',
        /neighWave = Math\.max\(0, neighWave - dtMs \/ 1000\)/.test(nvJsx) && /neighWave = 0; neighPrevD = 99/.test(nvJsx)
        && /else neighPrevD = 99/.test(nvJsx))
    check('pin: the view pass stays out of the sim — the economy never heard of these tells',
        !/PAIR_HUES|pairSparkle|neighSulks|neigh\.warm|neighWave|neighPrevD/.test(nvSim))

    // #2599 handoff 2 — the cold war speaks. Sour murmurs on a long clock while
    // the pair stands apart; the crack and the pay stay exactly as #2604 left them.
    const hangN = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    // hold + hour-cap, the §NEIGH STROLL lap shape: nobody works, no bell rings,
    // the world stands at ten — sixty honest seconds of cold war and nothing else.
    const lapN = (g, pairs, sec, sink) => {
        for (let i = 0; i < Math.round(sec / DT); i++) {
            pairs.forEach(([p, r, c]) => { p.r = r; p.c = c; p.path = null; p.use = null; p.goal = null; p.working = false })
            g.hour = Math.min(g.hour, 10)
            advance(g, DT); sink.push(...drain(g))
        }
    }
    const c1 = newRun(2599); hangN(c1, 'visitor', 'Fern', 3, 5, '#4fae5f'); hangN(c1, 'ivy', 'Ivy', 3, 7, '#a3579b')
    c1.neiGrudge = 1
    const rnNeigh = c1.rel.neigh
    const evCold2 = []
    lapN(c1, [[c1.visitor, 3, 5], [c1.ivy, 3, 7], [c1.people[0], 1, 12], [c1.people[1], 1, 1]], 60, evCold2)
    const murmurs = evCold2.filter((e) => e.t === 'grudge-cool' && e.who === 'neigh')
    check('the cold war murmurs — a minute of cold pair trades sour beats, never silence',
        murmurs.length >= 2 && murmurs.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)), `beats=${murmurs.length}`)
    check('the murmur pays NOTHING — sixty cold seconds move the pair bond not at all',
        Math.abs(c1.rel.neigh - rnNeigh) < 1e-9 && c1.rel.fern === 0 && c1.rel.ivy === 0,
        `neigh=${c1.rel.neigh} fern=${c1.rel.fern} ivy=${c1.rel.ivy}`)
    check('the murmur keeps the household beat honest — only pair murmurs carry who:neigh here',
        evCold2.filter((e) => e.t === 'grudge-cool' && e.who !== 'neigh').length === 0)
    c1.ivy = null   // absence thaws, as ever — and the murmuring stops with the war
    const evThawed = []
    lapN(c1, [[c1.visitor, 3, 5], [c1.people[0], 1, 12], [c1.people[1], 1, 1]], 60, evThawed)
    check('the thaw outlasts the murmur — warm-free air after absence, no more sour beats',
        c1.neiGrudge === 0 && c1.neiMending === 1 && evThawed.filter((e) => e.t === 'grudge-cool' && e.who === 'neigh').length === 0)
    const h0 = newRun(9), h1 = newRun(9); h1.neiMurmurCd = 13.7; h1.neiMurrs = 2
    check('pin: the murmur is a clock, not state — it never rides the hash', stateHash(h0) === stateHash(h1))
    check('pin: the pair murmur mirrors the household beat — longer cooldown, first line after the crack',
        /export const NEIGH_MURMUR_CD = 24/.test(nvSim) && /s\.neiMurmurCd = GRUDGE_FIRST_CD/.test(nvSim)
        && /if \(s\.neiMurmurCd <= 0\)/.test(nvSim) && /s\.neiMurmurCd -= dt/.test(nvSim))
    check('pin: the murmur rides the household crack event and wears the pair plate automatically',
        /t: 'grudge-cool', who: 'neigh'/.test(nvSim))
    check('pin: the sour lines rotate on a counter, never rng — seeded timelines hold',
        /NEIGH_SOUR_LINES\[s\.neiMurrs\+\+ % NEIGH_SOUR_LINES\.length\]/.test(nvSim)
        && !/pick\(s, NEIGH_SOUR_LINES\)/.test(nvSim) && /export const NEIGH_SOUR_LINES = \[/.test(nvSim)
        && (nvSim.match(/export const NEIGH_SOUR_LINES = \[[\s\S]*?\]/)[0].match(/,$/gm) || []).length >= 3)
    check('pin: absence still ends the war — the murmur block lives inside the grudge return',
        /if \(s\.neiGrudge\) \{[\s\S]{0,1400}?\n    \}\n    if \(s\.neiMending/.test(nvSim))   // #2672: the mediation exit widened the grudge block — window 700→1400

    // #2599 item 3 — the attract sells the pair on its own copy beat.
    const nmJsx = readFileSync(new URL('../src/components/AttractMessage.jsx', import.meta.url), 'utf8')
    check('pin: AttractMessage can announce its copy beats — optional, other titles never see it',
        /onIndex/.test(nmJsx) && /cbRef\.current\?\.\(0\)/.test(nmJsx) && /cbRef\.current\?\.\(ixRef\.current\)/.test(nmJsx))
    check('pin: the NEIGH marquee index derives from the copy, never a magic number',
        /MESSAGES\.findIndex\(\(m\) => m\.startsWith\('FERN AND IVY'\)\)/.test(nvJsx))
    check('pin: on that beat the demo rings Ivy while Fern hangs at an empty gate, before dusk',
        /marqueeIx\.current === NEIGH_MARQUEE[\s\S]{0,160}demoG\.visitor && demoG\.visitor\.state === 'hang' && !demoG\.ivy && demoG\.hour < 19/.test(nvJsx)
        && /demoG\.ivyAfter = Math\.min\(demoG\.ivyAfter, Math\.floor\(demoG\.hour\)\); demoG\.ivyGap = 0/.test(nvJsx))
    check('pin: the ring is once per demo run, re-armed by the next street',
        /neighBeatRung = demoG/.test(nvJsx) && /freshDemo = \(\) => \{ neighBeatRung = null/.test(nvJsx))
    check('pin: the attract wires its marquee to the hook', /onIndex=\{\(i\) => \{ marqueeIx\.current = i \}\}/.test(nvJsx))
}

// ------------------------------------- NEIGH STROLL VIEW (#2618) ----
// The lap's view pass: the pair strides facing each other, settles on arrival,
// the route is named at the fire tick, the attract sells a lap, and the panel
// pips walk. Pure view — sim.js must not learn any of these words.
section('NEIGH STROLL VIEW (#2618): stride bob, facing turn, arrival settle, route trail, attract lap, panel pips')
{
    const svArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const svJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const svSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')

    const hang = (g, key, name, r, c, hue) => {
        g.visitAfter = 99; g.ivyAfter = 99; g.ivyGap = 0
        g[key] = { name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2, path: null, state: 'hang',
            t: 0, hue, face: 1, walkPhase: 0, chatT: 0, hangUntil: 9999, neighT: 0 }
        return g[key]
    }
    const park = (p, r, c) => { p.r = r; p.c = c; p.x = tileX(c) + TILE / 2; p.y = tileY(r) + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; if (p.queue) p.queue.length = 0; p.owner = null; if (p.needs) for (const n of ['hunger', 'energy', 'fun', 'social', 'bladder']) p.needs[n] = Math.max(p.needs[n], 0.55) }
    const free = (g) => [[g.people[0], 6, 8], [g.people[1], 1, 1]]
    const lap = (g, pairs, sec, sink) => { for (let i = 0; i < Math.round(sec / DT); i++) { pairs.forEach(([p, r, c]) => park(p, r, c)); g.hour = Math.min(g.hour, 10); advance(g, DT); if (sink) sink.push(...drain(g)); else drain(g) } }

    // Data helpers first: pairStride answers ONLY mid-lap, aimed at the partner.
    const v = newRun(2618); hang(v, 'visitor', 'Fern', 3, 5, '#4fae5f'); hang(v, 'ivy', 'Ivy', 3, 7, '#a3579b')
    check('pairStride answers null while both hang — no phantom stride on an idle pair',
        pairStride(v.visitor, v.ivy) === null && pairStride(null, v.ivy) === null)
    check('strollTrail honest on empty, cap three', strollTrail(null).length === 0 && strollTrail([]).length === 0 && strollTrail([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }]).length === 3)
    const evF = []
    lap(v, free(v), NEIGH_STROLL_T + 0.3, evF)
    check('a lap is running for the view gates to read', evF.filter((e) => e.t === 'neigh-stroll').length === 1)
    const mid = pairStride(v.visitor, v.ivy)
    check('mid-lap: pairStride answers, and each face points at the partner',
        !!mid && mid.aFace === (v.ivy.x >= v.visitor.x ? 1 : -1) && mid.bFace === (v.visitor.x >= v.ivy.x ? 1 : -1),
        mid ? `${mid.aFace}/${mid.bFace}` : 'null')
    const rowsMid = bondRows(v)
    check('mid-lap: the NEIGH row carries the stroll flag — that row and ONLY that row',
        rowsMid.find((r) => r.key === 'neigh').strolling === true && rowsMid.filter((r) => r.strolling).length === 1)
    // the trail is the lead's own first steps, as pixel centres (the fire-tick capture)
    const tr = strollTrail(v.visitor.path)
    check('the trail rides the lead path: pixel centres of the first cells, nothing invented',
        tr.length > 0 && tr.length <= 3 && tr.every((d, i) => d.x === tileX(v.visitor.path[i].c) + TILE / 2 && d.y === tileY(v.visitor.path[i].r) + TILE / 2))
    const hB = stateHash(v)
    pairStride(v.visitor, v.ivy); bondRows(v); strollTrail(v.visitor.path)
    check('the view helpers are honest — reading them moves no state (hash identical)', stateHash(v) === hB)

    // Run the lap to its landing: stride and pips must rest with it.
    for (let i = 0; i < Math.round(16 / DT); i++) {
        free(v).forEach(([p, r, c]) => park(p, r, c))
        v.hour = Math.min(v.hour, 10)
        advance(v, DT); drain(v)
        if (!v.visitor.path && !v.ivy.path) break
    }
    check('arrived: the stride answers null and the panel pips rest',
        pairStride(v.visitor, v.ivy) === null && bondRows(v).find((r) => r.key === 'neigh').strolling === false)

    // Pins — the painter wears the stride.
    check('pin: the stride deepens the bob past the solo walk (2.2 > 1.6) and gates on the view flag',
        /export const STRIDE_BOB = 2\.2/.test(svArt) && STRIDE_BOB > 1.6 && /stride \? Math\.sin\(p\.walkPhase\) \* STRIDE_BOB/.test(svArt))
    check('pin: mid-route the eyes lead toward the partner (the cold-war turn keeps its away-lean)',
        /stride \? stride\.face \* 1\.4 : p\.face >= 0 \? 1\.4 : -1\.4/.test(svArt))
    check('pin: the pair carries the flag through the painter — stride computed once per frame, worn per person',
        /ps = pairStride\(g\.visitor, g\.ivy\)/.test(svJsx) && /o\.p === g\.visitor \? \{ face: ps\.aFace \} : o\.p === g\.ivy \? \{ face: ps\.bFace \}/.test(svJsx))
    check('pin: a cold war never strides — the grudge outranks the beat and clears the walk flag',
        /if \(g\.visitor && g\.ivy && !g\.neiGrudge\)/.test(svJsx) && /else stridePrevWalk = false/.test(svJsx))

    // Pins — arrival.
    check('pin: arrival counts walkers — it survives the lead landing first and fires when the last foot stops',
        /if \(walkN === 2\) stridePrevWalk = true/.test(svJsx)
        && /else if \(walkN === 0 && stridePrevWalk && g\.visitor\.state === 'hang' && g\.ivy\.state === 'hang'\)/.test(svJsx))
    check('pin: the settle half-second holds the faces on each other',
        /if \(!ps && neighArrive > 0\) ps = \{ aFace: g\.ivy\.x >= g\.visitor\.x \? 1 : -1, bFace: g\.visitor\.x >= g\.ivy\.x \? 1 : -1 \}/.test(svJsx))
    check('pin: the arrival pays one soft note — live only, the attract pre-empts the audio unlock',
        /if \(live\) audioController\.playTone\(523, 0\.09, 'sine', 0\.02\)/.test(svJsx) && /neighArrive = 0\.5/.test(svJsx))
    check('pin: the settle and the route tell fade on the real clock',
        /neighArrive = Math\.max\(0, neighArrive - dtMs \/ 1000\)/.test(svJsx)
        && /if \(strollFx > 0\) strollFx = Math\.max\(0, strollFx - dtMs \/ 1000\)/.test(svJsx))

    // Pins — the route tell.
    check('pin: the trail captures off the lead path AT the fire tick and paints over 2.5 s',
        /strollDots = strollTrail\(s\.visitor && s\.visitor\.path\)/.test(svJsx) && /strollFx = 2\.5/.test(svJsx)
        && /if \(strollFx > 0\) drawStrollTrail\(ctx, strollDots, strollFx \/ 2\.5\)/.test(svJsx))
    check('pin: the trail dots are the pair teal, shrinking down the route',
        /i % 2 \? '#7fd0c0' : '#3aa08a'/.test(svArt) && /const s = 2\.4 - i \* 0\.5/.test(svArt))

    // Pins — the attract sells a lap on the WALK copy beat.
    check('pin: the STROLL marquee index derives from the copy, never a magic number',
        /MESSAGES\.findIndex\(\(m\) => m\.startsWith\('WHILE THEY TALK'\)\)/.test(svJsx))
    check('pin: on that beat the demo rings Ivy while Fern hangs, before dusk',
        /marqueeIx\.current === STROLL_MARQUEE[\s\S]{0,200}demoG\.visitor && demoG\.visitor\.state === 'hang' && !demoG\.ivy && demoG\.hour < 19/.test(svJsx)
        && /strollBeatRung = demoG[\s\S]{0,140}demoG\.ivyAfter = Math\.min\(demoG\.ivyAfter, Math\.floor\(demoG\.hour\)\); demoG\.ivyGap = 0/.test(svJsx))
    check('pin: the lap ring is once per demo run, re-armed by the next street — and no stale view state crosses it',
        /freshDemo = \(\) => \{ neighBeatRung = null; strollBeatRung = null; stridePrevWalk = false/.test(svJsx)
        && /stridePrevWalk = false; neighArrive = 0; strollFx = 0; strollDots = null/.test(svJsx))

    // Pins — the panel teaches the walk from the BONDS row.
    check('pin: the lap flag rides the NEIGH row as derived data, read from the paths themselves',
        /strolling: !!\(s\.visitor && s\.visitor\.path && s\.visitor\.path\.length \|\| s\.ivy && s\.ivy\.path && s\.ivy\.path\.length\)/.test(svArt))
    check('pin: the panel walks two teal pips beside the flagged row, stepping on the clock',
        /if \(row\.strolling\)/.test(svArt) && /Math\.floor\(t \* 4\) % 2/.test(svArt)
        && /'#7fd0c0'[\s\S]{0,120}'#3aa08a'/.test(svArt))

    // The pass stays on the view side of the wall.
    check('pin: the view pass stays out of the sim — the economy never heard of these tells',
        !/pairStride|strollTrail|STRIDE_BOB|neighArrive|strollFx|strollDots|strolling:/.test(svSim))
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
        // #2238: seed 9's cd now lands on exactly 3.3 (the route's rng draw at
        // move-in shifted the stream) — a FIXED mutation value can collide with
        // reality. Mutate relative; no stream can dodge that.
        dA.pet.cd += 1.1
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

section('PET POLISH (#2200): Miso — mood law, visible kibble, neighbours meet the cat')
{
    const ppSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const ppJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const ppArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')

    // keep the household alive while a test runs the clock through the day
    const upkeep = (s) => {
        for (const q of s.people) { q.needs.hunger = 1; q.needs.energy = 1; q.needs.bladder = 1; q.faintT = 0 }
        if (s.pet) { s.pet.needs.energy = 1; s.pet.asleep = false }
    }

    // --- mood law (#2200): the panel's paw row reads the average of her needs
    const n0 = newRun(3)
    check('no cat, no mood', petMood(n0) === null)
    n0.money = 900; n0.sel = 14; place(n0, 0, 0)
    n0.pet.needs.hunger = 1; n0.pet.needs.fun = 0.5; n0.pet.needs.energy = 0.75
    check('MISO\u2019s mood is the plain average of her three needs', Math.abs(petMood(n0) - (1 + 0.5 + 0.75) / 3) < 1e-9)
    n0.pet.needs.hunger = 1; n0.pet.needs.fun = 1; n0.pet.needs.energy = 1
    check('a blissful tabby caps at one', petMood(n0) === 1)
    n0.pet.needs.hunger = 0; n0.pet.needs.fun = 0.1; n0.pet.needs.energy = 0.2
    check('a neglected cat reads low', petMood(n0) < 0.15)

    // --- visible kibble: the eat moment paints a bowl that fades
    n0.pet.needs.hunger = 0.1
    let fed = 0, armed = 0
    for (let i = 0; i < 900 && !fed; i++) { upkeep(n0); advance(n0, DT); if (drain(n0).some((e) => e.t === 'pet-eat')) { fed = 1; armed = n0.pet.feedT } }
    check('kibble is seen: the bowl arms the tick she eats', fed === 1 && armed === PET_FEED_T)
    for (let i = 0; i < Math.round(PET_FEED_T * 60) + 10; i++) { advance(n0, DT); drain(n0) }
    check('the bowl fades — the lot is clean after', n0.pet.feedT === 0)

    // --- the greeting law: Fern meets Miso once per visit, again next visit
    const mv = newRun(7)
    mv.money = 900; mv.sel = 14; place(mv, 0, 0)
    const sofaCell = { r: 3, c: 4 }   // Fern's no-sofa destination — park the cat ON it
    const parkMiso = () => {
        mv.pet.r = sofaCell.r; mv.pet.c = sofaCell.c
        mv.pet.x = tileX(sofaCell.c) + TILE / 2; mv.pet.y = tileY(sofaCell.r) + TILE / 2
        mv.pet.path = null; mv.pet.wanderT = 1e9; mv.pet.state = 'roam'; mv.pet.asleep = false
    }
    const relFern0 = mv.rel.fern
    let visits = 0, meets = 0
    for (let visit = 0; visit < 2; visit++) {
        mv.visitAfter = 9; mv.visitGap = 0; mv.hour = 9
        let seen = false
        for (let i = 0; i < 60 * 120; i++) {
            if (i > 2400) mv.hour = Math.max(mv.hour, 19.5)   // evening sends her home
            advance(mv, DT)
            const ev = drain(mv)
            meets += ev.filter((e) => e.t === 'cat-meet' && e.name === 'Fern').length
            parkMiso(); upkeep(mv)
            if (mv.visitor) seen = true
            else if (seen) { visits++; break }
            if (mv.done) break
        }
    }
    check('a hanging visitor greets Miso once per visit — twice across two visits', visits === 2 && meets === 2)
    check('the greeting warms the ladder — a bump, not a jump', mv.rel.fern > relFern0 && mv.rel.fern - relFern0 < REL_EDGES[0] + 2 * CAT_MEET_BOND + 20)

    // no cat on the lot -> the law stays silent
    const nc = newRun(4)
    nc.visitAfter = 9; nc.visitGap = 0; nc.hour = 9
    let ghostMeets = 0, ncSeen = false
    for (let i = 0; i < 60 * 120; i++) {
        if (i > 2400) nc.hour = Math.max(nc.hour, 19.5)
        advance(nc, DT)
        ghostMeets += drain(nc).filter((e) => e.t === 'cat-meet').length
        upkeep(nc)
        if (nc.visitor) ncSeen = true
        else if (ncSeen) break
        if (nc.done) break
    }
    check('an empty lot meets nobody', ghostMeets === 0 && !nc.pet)

    // Ivy gets the same law on her own clock, at her own doorway
    const iv = newRun(5)
    iv.money = 900; iv.sel = 14; place(iv, 0, 0)
    const fridge = iv.items.find((it) => it.id === 'fridge')
    const ft = targetsOf(iv, fridge)[0]
    const parkAt = (r, c) => {
        iv.pet.r = r; iv.pet.c = c; iv.pet.x = tileX(c) + TILE / 2; iv.pet.y = tileY(r) + TILE / 2
        iv.pet.path = null; iv.pet.wanderT = 1e9; iv.pet.state = 'roam'; iv.pet.asleep = false
    }
    iv.ivyAfter = 12; iv.ivyGap = 0; iv.hour = 12
    let ivyMeets = 0, ivySeen = false
    const relIvy0 = iv.rel.ivy
    for (let i = 0; i < 60 * 120; i++) {
        if (i > 2400) iv.hour = Math.max(iv.hour, 19.5)
        advance(iv, DT)
        ivyMeets += drain(iv).filter((e) => e.t === 'cat-meet' && e.name === 'Ivy').length
        parkAt(ft.r, ft.c); upkeep(iv)
        if (iv.ivy) ivySeen = true
        else if (ivySeen) break
        if (iv.done) break
    }
    check('the gardener has a favourite ankle: Ivy meets Miso at the kitchen', ivyMeets === 1 && iv.rel.ivy > relIvy0)

    // determinism: the greeting spends no rng
    const dA = newRun(9), dB = newRun(9)
    for (let i = 0; i < 3600; i++) { if (i === 600) { dA.money = 900; dB.money = 900 } autoStep(dA, DT); drain(dA); autoStep(dB, DT); drain(dB) }
    check('meet-law hours stay seed-exact', stateHash(dA) === stateHash(dB))

    // source pins — the wiring must not silently drop
    check('pin: the panel rows Miso with the paw glyph and the mood law', /petMood\(s\)/.test(ppArt) && /'paw'/.test(ppArt) && /'MISO'/.test(ppArt))
    check('pin: the mood row alarms at RED_AT like the need bars', /mood <= RED_AT/.test(ppArt))
    check('pin: the paw glyph ships — three toes over a pad', /glyph === 'paw'/.test(ppArt))
    check('pin: the bowl paints while feedT runs, and the sim arms it at the eat', /p\.feedT > 0/.test(ppArt) && /feedT = PET_FEED_T/.test(ppSim))
    check('pin: the shell voices the meet and the crumbs', /case 'cat-meet'/.test(ppJsx) && /burst\(e\.x, e\.y \+ 5, 3, '#8a5626'/.test(ppJsx))
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
    check('pin: the bond panel rows the child under the stars', /rows\.push\(\{ key: 'kid', glyph: 'star'/.test(kidArt) && /'PIP'/.test(kidArt))   // #2240: the rows ship as bondRows data now
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
    // #2209: the paused tell — the whole lot is the indicator, not just the pip.
    check('pin: a paused lot breathes a || ghost on the real clock', /live && g\.speed === 0 && !g\.build/.test(pJsx) && /performance\.now\(\)/.test(pJsx))
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
    // #2599 handoff 2 adds a second emitter: the pair's cold-war murmur rides the
    // same beat, tagged who:'neigh'. Two sources, one event id — the view's single
    // grudge-cool handler stays the whole rendering law.
    check('pin: the cooling beat emits its own event once per cold war — household + pair (#2599)', (cpSim.match(/t: 'grudge-cool'/g) || []).length === 2)
    check('pin: the reach ring paints only when a word is ready (cooldown closed, buy mode closed)',
        /g\.cmdCd <= 0/.test(cpJsx) && /courtTarget\(g\)/.test(cpJsx) && /ctx\.ellipse\(t\.p\.x/.test(cpJsx))
    check('pin: spoken lines render as a bubble over the pair (art + shell + all spoken events)',
        /export function drawSay/.test(cpArt) && /drawSay\(ctx, sayB\)/.test(cpJsx) && (cpJsx.match(/showSay\(s, e\)/g) || []).length === 9)   // #2672: the mediate beat speaks too — 8→9
    check('pin: the marquee teaches C/X and the ring tell', /SAY THE KIND THING \u2014 C coos, X cuts\./.test(cpJsx) && /gold ring/.test(cpJsx))
}

// ------------------------------------------------- PAPER ROUTE (#2238) ----
section('PAPER ROUTE (#2238): hourly news, one a day, tap to read')
{
    // the object: an appliance the lot owns but nobody buys
    check('the paper is a walkable FUN object, never a catalog card',
        PAPER.need === 'fun' && PAPER.solid === false && PAPER.amt > 0.1 && PAPER.dur > 1 && !CATALOG.some((d) => d.id === 'paper'))

    // a fresh street: no news yet, route due mid-morning
    const s0 = newRun(42)
    check('a fresh lot has no paper yet; the route is due 06:30–08:00',
        s0.paper === null && s0.paperDay === 0 && s0.paperAfter >= 6.5 && s0.paperAfter <= 8)

    // delivery lands on the step with its event, stamped today
    const s1 = newRun(42)
    let paperEv = null
    for (let i = 0; i < 60 * 60 && !s1.paper; i++) { advance(s1, DT); const e = drain(s1); if (!paperEv) paperEv = e.find((x) => x.t === 'paper') }
    check('the daily lands on the step inside the morning window',
        !!s1.paper && s1.paper.r === 10 && s1.paper.c === 5 && s1.hour >= s1.paperAfter && s1.hour < PAPER_LATE, `@${s1.hour.toFixed(1)}h`)
    check('the arrival is an event and stamps the day', !!paperEv && s1.paperDay === s1.day)

    // reading: walk over, FUN lifts, the sheet is consumed, content pays.
    // Seated next to the news first (not on the far side of the lot): the
    // walk itself costs real decay, and this gate measures the READ, not the commute.
    const otto = s1.people[0]
    otto.r = 9; otto.c = 5; otto.x = tileX(5) + 16; otto.y = tileY(9) + 16; otto.path = null; otto.goal = null
    const fun0 = otto.needs.fun, cont0 = s1.content
    const started = cmdUse(s1, otto, s1.paper)
    let satEv = false
    for (let i = 0; i < 60 * 30 && s1.paper; i++) { advance(s1, DT); const e = drain(s1); if (e.some((x) => x.t === 'satisfied' && x.need === 'fun')) satEv = true }
    check('commanded, a resident walks down and reads the paper', started && s1.paper === null && !s1.items.some((it) => it.id === 'paper'))
    check('reading pays FUN, a satisfied event and contentment',
        otto.needs.fun > fun0 + 0.1 && satEv && s1.content > cont0, `fun ${fun0.toFixed(2)}->${otto.needs.fun.toFixed(2)}`)

    // one paper a day: reading at 07:xx must NOT re-arm the route in-window
    let more = 0
    for (let i = 0; i < 60 * 60 && s1.day === 1; i++) { drain(s1); advance(s1, DT); if (s1.paper) more++ }
    check('one paper a day — reading early does not re-arm the route', more === 0)

    // fresh news: an unread paper rides the evening, and the morning replaces
    // it. (The evening loop keeps the residents alive — an unattended run
    // faints by ~16:00 and `done` then stands the clock, which would end the
    // test before midnight, not the route.)
    const keepAlive = (g) => { if (!g.done) for (const p of g.people) for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.9) }
    const s2 = newRun(7)
    for (let i = 0; i < 60 * 60 && !s2.paper; i++) { drain(s2); advance(s2, DT) }
    const uid1 = s2.paper && s2.paper.uid
    for (let i = 0; i < 60 * 60 && s2.day === 1; i++) { if (i % 300 === 0) keepAlive(s2); drain(s2); advance(s2, DT) }
    check('an unread paper waits on the step all evening', !!s2.paper && s2.paper.uid === uid1 && s2.hour >= PAPER_LATE, `day ${s2.day} ${s2.hour.toFixed(1)}h`)
    for (let i = 0; i < 60 * 60 && s2.day === 1; i++) { if (i % 300 === 0) keepAlive(s2); drain(s2); advance(s2, DT) }
    check('midnight clears the step — yesterday rots', s2.day === 2 && s2.paper === null && !s2.items.some((it) => it.id === 'paper'), `day ${s2.day}`)
    for (let i = 0; i < 60 * 45 && !s2.paper; i++) { if (i % 300 === 0) keepAlive(s2); drain(s2); advance(s2, DT) }
    check('a fresh edition arrives on day 2, stamped and exactly one',
        s2.day === 2 && s2.paperDay === 2 && s2.paper.uid !== uid1 && s2.hour < PAPER_LATE && s2.items.filter((it) => it.id === 'paper').length === 1)

    // the news is not merchandise; furniture on the step tucks it away
    const s3 = newRun(11)
    for (let i = 0; i < 60 * 60 && !s3.paper; i++) { drain(s3); advance(s3, DT) }
    check('the news cannot be sold', sellAt(s3, 10, 5) === false && !!s3.paper && s3.money === newRun(11).money)
    s3.money = 900
    setSel(s3, CATALOG.findIndex((d) => d.id === 'fridge'))
    const tucked = place(s3, 10, 5)
    check('furniture landing on the step tucks the paper — no dangling reference',
        tucked && s3.paper === null && !s3.items.some((it) => it.id === 'paper'))

    // a blocked step falls back to its free edge instead of skipping silently
    const s4 = newRun(13)
    s4.money = 900
    setSel(s4, CATALOG.findIndex((d) => d.id === 'fridge'))
    place(s4, 10, 5)
    s4.hour = 6.4; s4.paperAfter = 6.5
    for (let i = 0; i < 60 * 60 && !s4.paper && s4.hour < PAPER_LATE; i++) { drain(s4); advance(s4, DT) }
    check('a blocked step takes the nearest free edge', !!s4.paper && s4.paper.uid > 0 && !(s4.paper.r === 10 && s4.paper.c === 5), s4.paper ? `${s4.paper.r},${s4.paper.c}` : 'never')

    // the window is honest: past 10:00 the route has passed
    const s5 = newRun(17)
    s5.hour = 10.5
    for (let i = 0; i < 60 * 30; i++) { drain(s5); advance(s5, DT) }
    check('no news after 10:00 — the route keeps its hours', s5.paper === null)

    // state law: the day stamp rides the hash
    const h1 = newRun(21), h2 = newRun(21)
    h2.paperDay = 1
    check('paperDay rides stateHash', stateHash(h1) !== stateHash(h2))

    // the attract bot reads the paper — the demo teaches the route
    const m2 = (g) => { autoStep(g, DT); drain(g) }
    const d1 = newRun(42)
    for (let i = 0; i < 60 * 60 && !d1.paper; i++) m2(d1)
    for (let i = 0; i < 60 * 40 && d1.paper; i++) m2(d1)
    check('the attract bot walks down and reads the news itself', d1.paper === null && d1.paperDay === 1 && !d1.items.some((it) => it.id === 'paper'))

    // determinism + the wish still lands with the route running
    const w1 = newRun(42), w2 = newRun(42)
    for (let i = 0; i < 60 * 60 * 2; i++) { autoStep(w1, DT); autoStep(w2, DT); drain(w1); drain(w2) }
    check('seeds stay exact with the route running', stateHash(w1) === stateHash(w2))
    const win = play(42)
    check('the lifetime wish still lands with the route running', win.done === 'win', `content ${win.content}`)

    // source pins — the wiring must not silently drop (same law as STORES)
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the route is hour-scheduled on the world clock', /function schedulePaper/.test(pSim) && /paperAfter = 6\.5 \+ s\.rng/.test(pSim) && /updatePaper\(s\)/.test(pSim))
    check('pin: the day stamp — not mere presence — is the once-a-day law', /s\.paperDay === s\.day/.test(pSim))
    check('pin: the object is DEF-only (never merchandised)', /DEF\.paper = PAPER/.test(pSim) && !/'paper'/.test(pSim.match(/export const CATALOG = \[[\s\S]*?\]/)[0]))
    check('pin: read folds it, sale refuses it, newDay replaces it',
        /def\.id === 'paper'/.test(pSim) && /id === 'paper'/.test(pSim.match(/export function sellAt[\s\S]*?\n}/)[0])
        && /it !== s\.paper/.test(pSim.match(/function newDay[\s\S]*?\n}/)[0]) && /s\.paper\.r === r && s\.paper\.c === c/.test(pSim))
    check('pin: the bot teaches it in attract', /if \(s\.paper\) \{ if \(cmdUse\(s, p, s\.paper\)\) return \}/.test(pSim))
    check('pin: paperDay rides the hash', /mix\(s\.paperDay\)/.test(pSim))
    check('pin: the shell answers the arrival — flutter, banner, marquee', /case 'paper'/.test(pJsx) && /THE PAPER BOY SWEEPS PAST/.test(pJsx) && /boy sweeps past/.test(pJsx))
    check('pin: art draws the newsprint; probe + F1 cheat carry the route', /case 'paper'/.test(pArt) && /paperDay: gs\.paperDay/.test(pJsx) && /DROP PAPER/.test(pJsx))
    check('pin: the teaching lines ship in sim', Array.isArray(PAPER_LINES) && PAPER_LINES.length >= 3)
}

// ------------------------------------------------------ MEAL BELLS (#2244) ----
// The day/night clause's second citizen: three hour-scheduled bells a day set
// a warm plate beside the kitchen — one helping per resident (the serial stamp
// is the law), a cold window, honest skips — and when the WHOLE household eats
// the same plate, the table pays socially (social, house bond, content, hearts).
section('MEAL BELLS (#2244): three bells, one helping each, the table pays socially')
{
    const keepAlive = (g) => { if (!g.done) for (const p of g.people) for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.9) }
    const eatTill = (g, p) => {   // command p onto the current plate; true if a helping was had
        const plate = g.meal
        if (!plate || !cmdUse(g, p, plate)) return false
        for (let i = 0; i < 60 * 25; i++) { advance(g, DT); drain(g); if (p.mealTaken === g.mealSerial) return true; if (g.meal !== plate) return false }
        return false
    }

    check('the plate is a walkable HUNGER object, never a catalog card',
        MEAL.need === 'hunger' && MEAL.solid === false && MEAL.amt > 0.4 && MEAL.dur > 2 && !CATALOG.some((d) => d.id === 'meal'))
    check('three bells, seeded inside their windows and in order', (() => {
        const s = newRun(7)
        return s.meal === null && s.mealSlot === 0 && s.mealSerial === 0 && s.mealDay === 0 && s.mealEaten.length === 0
            && MEAL_DUE.length === 3 && s.mealAfter.length === 3
            && s.mealAfter.every((h, i) => h >= MEAL_DUE[i][0] && h <= MEAL_DUE[i][1])
            && s.mealAfter[0] < s.mealAfter[1] && s.mealAfter[1] < s.mealAfter[2]
    })())

    // breakfast lands beside the starter kitchen (fridge at 2,9)
    const s1 = newRun(7)
    let mealEv = null
    for (let i = 0; i < 60 * 60 && !s1.meal; i++) { advance(s1, DT); const e = drain(s1); if (!mealEv) mealEv = e.find((x) => x.t === 'meal') }
    check('the breakfast bell rings and a plate lands beside the kitchen',
        !!s1.meal && s1.hour >= s1.mealAfter[0] && Math.abs(s1.meal.r - 2) <= 1 && Math.abs(s1.meal.c - 9) <= 1, `@${s1.hour.toFixed(1)}h ${s1.meal.r},${s1.meal.c}`)
    check('the arrival is an event — name, slot, serial and day stamp',
        !!mealEv && mealEv.name === MEAL_NAMES[0] && mealEv.slot === 0 && s1.mealDay === s1.day && s1.mealSlot === 1 && s1.mealSerial === 1)

    // the first helping, then the shared table immediately — while it's warm
    const otto = s1.people[0], mira = s1.people[1]
    otto.needs.hunger = 0.5
    const ate1 = eatTill(s1, otto)
    check('a commanded resident walks down and eats — hunger pays, the plate stays for the other',
        ate1 && !!s1.meal && s1.mealEaten.length === 1 && otto.needs.hunger > 0.8 && otto.mealTaken === s1.mealSerial)
    const house0 = s1.rel.house, soc0 = otto.needs.social, con0 = s1.content
    let sharedAt = null
    {
        const plate = s1.meal
        cmdUse(s1, mira, plate)
        for (let i = 0; i < 60 * 25; i++) {
            advance(s1, DT); const e = drain(s1)
            sharedAt = e.find((x) => x.t === 'meal-shared') || sharedAt
            if (sharedAt) break
        }
    }
    check('both residents on one plate: the SHARED TABLE fires once', !!sharedAt && s1.meal === null && s1.mealEaten.length === 0)
    check('the table pays socially — social up, house bond +MEAL_BOND, content +1',
        s1.rel.house - house0 >= MEAL_BOND && otto.needs.social > soc0 && s1.content >= con0 + 1)

    // one helping per bell, at the NEXT bell too — the stamp resets per plate
    // (a breakfast diner is welcome at lunch; a second lunch line is refused).
    // The resident is parked kitchen-side first — the idle wander may have
    // taken them out of the window's walking distance, which the cold gate
    // already proves honest; here we test the stamp, not the stride.
    let lunch = null
    for (let i = 0; i < 60 * 60 * 2 && !lunch; i++) {
        advance(s1, DT); const e = drain(s1); keepAlive(s1)
        if (s1.mealSerial === 2) {
            lunch = s1.meal
            otto.r = 2; otto.c = 8; otto.x = tileX(8) + TILE / 2; otto.y = tileY(2) + TILE / 2
            otto.path = null; otto.goal = null; otto.use = null
        }
    }
    const ateLunch = lunch && eatTill(s1, otto)
    let satAgain = false
    if (lunch && ateLunch) {
        cmdUse(s1, otto, lunch)
        for (let i = 0; i < 60 * 25; i++) {
            advance(s1, DT); const e = drain(s1)
            if (e.some((x) => x.t === 'satisfied' && x.name === 'Otto')) satAgain = true
            if (!otto.path && !otto.use && !otto.goal) break
        }
    }
    check('one helping per bell — reset by plate, not by person; a second line is refused', !!lunch && !!ateLunch && !satAgain)

    // the cold window: untouched food goes out, the bell stays rung
    const s2 = newRun(11)
    for (let i = 0; i < 60 * 60 && !s2.meal; i++) { advance(s2, DT); drain(s2) }
    const due2 = s2.mealAt
    let coldEv = null
    for (let i = 0; i < 60 * 60 * 2 && !coldEv; i++) { advance(s2, DT); const e = drain(s2); coldEv = e.find((x) => x.t === 'meal-cold') || coldEv }
    check('nobody ate: the plate goes cold exactly one window later and the counter clears',
        !!coldEv && s2.meal === null && !s2.items.some((it) => it.id === 'meal') && s2.hour >= due2 + MEAL_WINDOW - 0.02 && s2.mealSlot === 1)

    // honest skip: no kitchen, no cooked meal — and the bell is never banked
    const s3 = newRun(31)
    s3.items = s3.items.filter((it) => it.id !== 'fridge')
    let served3 = false
    for (let i = 0; i < 60 * 60 * 12 && s3.day === 1 && s3.hour < s3.mealAfter[1] + MEAL_WINDOW + 0.1; i++) { advance(s3, DT); drain(s3); keepAlive(s3); if (s3.meal) served3 = true }
    check('no kitchen, no cooked meal — and the missed bells skip honestly', !served3 && s3.mealSlot >= 2)

    // late but in-window delivery still serves (the window is the law, not the minute)
    const s5 = newRun(17)
    s5.mealAfter = [20.05, 21.0, 22.5]
    for (let i = 0; i < 60 * 60 * 2 && !s5.meal && s5.hour < 21.5; i++) { advance(s5, DT); drain(s5); keepAlive(s5) }
    check('a bell rung late still lands — the window serves, not the due minute', !!s5.meal && s5.hour >= 20.05 && s5.hour < 20.05 + MEAL_WINDOW)

    // the plate dying UNDER the walk is honest refusal, not a broken
    // actuator: the steps are the cost, the stamp is the law — a corpse
    // plate feeds nobody and leaves no taken-mark (the drive found this live).
    const s9 = newRun(11)
    keepAlive(s9)
    s9.mealAfter[s9.mealSlot] = s9.hour + DT * 2 / HOUR_SEC   // due in two ticks, deterministic
    for (let i = 0; i < 60 && !s9.meal; i++) { advance(s9, DT); drain(s9); keepAlive(s9) }
    const plate9 = s9.meal, ser9 = s9.mealSerial
    const otto9 = s9.people[0]
    otto9.r = plate9.r + 1; otto9.c = plate9.c
    check('the plate is ordered while warm', cmdUse(s9, otto9, plate9) && !!otto9.path)
    s9.hour = s9.mealAt + MEAL_WINDOW + DT * 2 / HOUR_SEC   // it goes cold mid-stride
    for (let i = 0; i < 600 && (otto9.path || otto9.use); i++) { advance(s9, DT); drain(s9); keepAlive(s9) }
    check('a plate that dies under the walk feeds nobody — no stamp, no shared credit',
        s9.meal === null && otto9.mealTaken !== ser9 && s9.mealEaten.length === 0 && !otto9.use,
        `taken ${otto9.mealTaken} ser ${ser9} eaten ${s9.mealEaten.length}`)

    // the plate cannot be sold, and furniture tucks it (no dangling reference)
    const s6 = newRun(41)
    for (let i = 0; i < 60 * 60 && !s6.meal; i++) { advance(s6, DT); drain(s6) }
    const pr = s6.meal.r, pc = s6.meal.c
    check('the meal cannot be sold — the kitchen serves, nobody sells dinner', sellAt(s6, pr, pc) === false && !!s6.meal)
    setSel(s6, 0)
    const tucked = place(s6, pr, pc)
    check('furniture landing on the plate tucks it — no dangling reference', tucked && s6.meal === null && !s6.items.some((it) => it.id === 'meal'))

    // the whole day keeps hours: three bells, named, and midnight resets the table
    const s7 = newRun(21)
    const bells7 = []
    let slot7 = 0
    for (let i = 0; i < 60 * 60 * 20 && s7.day === 1; i++) { advance(s7, DT); const e = drain(s7); keepAlive(s7); bells7.push(...e.filter((x) => x.t === 'meal').map((x) => x.name)); slot7 = Math.max(slot7, s7.mealSlot) }
    check('one day rings three bells — BREAKFAST, LUNCH, DINNER, in that order',
        bells7.length === 3 && bells7.join(',') === MEAL_NAMES.join(',') && slot7 === 3, bells7.join(','))
    // rig an untouched plate past midnight (mealAt set far — the cold never arrives, newDay must)
    const s8 = newRun(23)
    for (let i = 0; i < 60 * 60 && !s8.meal; i++) { advance(s8, DT); drain(s8) }
    s8.mealAt = s8.hour + 100
    const uid8 = s8.meal.uid
    while (s8.day === 1) { advance(s8, DT); drain(s8); keepAlive(s8) }
    check('midnight clears the table — yesterday\u2019s plate rots, the slot resets, tomorrow re-seeds',
        s8.day === 2 && s8.meal === null && !s8.items.some((it) => it.id === 'meal') && s8.mealSlot === 0 && s8.mealSerial >= 1 && uid8 > 0)

    // hash carries: every stamp that matters moves the hash
    const g1 = newRun(55)
    const base0 = stateHash(g1)
    for (let i = 0; i < 60 * 60 && !g1.meal; i++) { advance(g1, DT); drain(g1) }
    const servedHash = stateHash(g1)
    check('meal state rides stateHash — serving moves it', servedHash !== base0)
    const hMut = (fn) => { const g = newRun(55); for (let i = 0; i < 60 * 60 && !g.meal; i++) { advance(g, DT); drain(g) } fn(g); return stateHash(g) !== servedHash }
    check('mealDay, mealSlot and mealSerial each move the hash',
        hMut((g) => { g.mealDay += 1 }) && hMut((g) => { g.mealSlot += 1 }) && hMut((g) => { g.mealSerial += 1 }))
    check('who has sat at the plate moves the hash', hMut((g) => { g.mealEaten.push(g.people[1]) }))

    // determinism + the attract bot learns the bells + the wish still lands
    const d1 = newRun(42), d2 = newRun(42)
    for (let i = 0; i < 60 * 60 * 3; i++) { autoStep(d1, DT); autoStep(d2, DT); drain(d1); drain(d2) }
    check('seeds stay exact with the bells running', stateHash(d1) === stateHash(d2))
    const m2 = (g) => { autoStep(g, DT); drain(g) }
    const a1 = newRun(42)
    // #2253: the grace slowed day-1 hunger, so a passive cap can no longer
    // pull the bot off its errands twice — rig the hunger instead. The gate
    // tests that the bot READS a warm plate, not that it starves on schedule.
    if (!a1.done) for (const p of a1.people) p.needs.hunger = 0.25
    let took = 0
    for (let i = 0; i < 60 * 60 * 4 && !a1.done && took < 2; i++) { m2(a1); took = a1.people.reduce((n, p) => n + (p.mealTaken > 0 ? 1 : 0), 0) }
    check('the attract bot walks to a warm plate itself — the demo teaches the bells', took >= 2, `taken ${took}`)
    const win = play(42)
    check('the lifetime wish still lands with the bells running', win.done === 'win', `content ${win.content}`)

    // source pins — the wiring must not silently drop (same law as PAPER)
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('pin: the bells are hour-scheduled on the world clock',
        /function scheduleMeals|export function scheduleMeals/.test(pSim) && /MEAL_DUE\.map/.test(pSim) && /updateMeals\(s\)/.test(pSim))
    check('pin: the slot+serial stamps — not mere presence — are the once-a-bell law',
        /s\.hour >= s\.mealAfter\[s\.mealSlot\]/.test(pSim) && /p\.mealTaken === s\.mealSerial/.test(pSim))
    check('pin: the object is DEF-only (never merchandised)',
        /DEF\.meal = MEAL/.test(pSim) && !/'meal'/.test(pSim.match(/export const CATALOG = \[[\s\S]*?\]/)[0]))
    check('pin: sale refuses it, place tucks it, newDay clears it',
        /id === 'meal'/.test(pSim.match(/export function sellAt[\s\S]*?\n}/)[0])
        && /s\.meal\.r === r && s\.meal\.c === c/.test(pSim) && /it !== s\.meal/.test(pSim.match(/function newDay[\s\S]*?\n}/)[0]))
    check('pin: the shared-table law pays social, bond and content once per plate',
        /meal-shared/.test(pSim) && /relAdd\(s, 'house', MEAL_BOND\)/.test(pSim) && /mealEaten\.length >= s\.people\.length/.test(pSim))
    check('pin: meal stamps ride the hash', /mix\(s\.mealDay\)/.test(pSim) && /mix\(s\.mealSlot\)/.test(pSim) && /mix\(s\.mealEaten\.length\)/.test(pSim))
    check('pin: the shell answers the bells — brass ring, banners, marquee',
        /case 'meal'/.test(pJsx) && /case 'meal-shared'/.test(pJsx) && /FOOD ON THE COUNTER/.test(pJsx) && /BELLS RING/.test(pJsx))
    check('pin: art draws the steaming plate; probe + F1 cheat carry the bells', /case 'meal'/.test(pArt) && /mealSerial: gs\.mealSerial/.test(pJsx) && /DROP MEAL/.test(pJsx))
    check('pin: the teaching lines ship in sim', Array.isArray(MEAL_LINES) && MEAL_LINES.length === 3 && Array.isArray(SHARED_MEAL_LINES) && SHARED_MEAL_LINES.length >= 3)
}

section('MEAL POLISH (#2264) — three timbres, rotating chords, seen cold, night steam, hearts at the table')
{
    // Three timbres (#2240's VISIT_TIMBRE pattern): one dinger three times a
    // day reads as a loop, not a clock. Motifs must be provably apart.
    check('MEAL_TIMBRE: three motifs, distinct note counts, pitch sets and spacing',
        MEAL_TIMBRE.length === 3
        && new Set(MEAL_TIMBRE.map((m) => m.call.length)).size === 3
        && new Set(MEAL_TIMBRE.map((m) => m.call.map(([f]) => f).join('/'))).size === 3
        && new Set(MEAL_TIMBRE.map((m) => m.call.map(([, , d]) => d).join('/'))).size === 3)
    check('breakfast keeps the historic rising strike — the 07:00 dinger is unchanged',
        MEAL_TIMBRE[0].call[0][0] === 1046 && MEAL_TIMBRE[0].call[1][0] === 1318 && MEAL_TIMBRE[0].call[1][2] === 170)
    check('dinner sits lower and slower than breakfast; lunch is the brighter midday pair',
        MEAL_TIMBRE[2].call[0][0] < MEAL_TIMBRE[0].call[0][0]
        && MEAL_TIMBRE[2].call.map(([f]) => f).every((f) => f <= 988)
        && MEAL_TIMBRE[1].call[0][0] > MEAL_TIMBRE[2].call[0][0]
        && Math.max(...MEAL_TIMBRE[2].call.map(([, d]) => d)) > Math.max(...MEAL_TIMBRE[0].call.map(([, d]) => d)))
    // The shared-table arpeggio rotates by plate — repeat days feel fresh.
    check('the shared-table chord rotates by plate — three shapes, then the table repeats',
        SHARED_TABLE_CHORDS.length === 3
        && new Set(SHARED_TABLE_CHORDS.map((c) => c.map(([f]) => f).join('/'))).size === 3
        && SHARED_TABLE_CHORDS[0][0][0] === 523 && SHARED_TABLE_CHORDS[2][2][0] === 880)
    check('sharedChord keys the rotation to the plate serial and wraps honestly',
        sharedChord(1) === SHARED_TABLE_CHORDS[1] && sharedChord(2) === SHARED_TABLE_CHORDS[2]
        && sharedChord(3) === SHARED_TABLE_CHORDS[0] && sharedChord(7) === SHARED_TABLE_CHORDS[1])
    // One night curve, hoisted from nightTint so tint, steam and halo cannot drift.
    check('nightLevel answers the tint curve exactly',
        nightLevel(12) === 0 && nightLevel(19) === 0 && Math.abs(nightLevel(22) - 0.42) < 1e-9 && nightLevel(4) === 0.42
        && Math.abs(nightLevel(20.5) - 0.21) < 1e-9 && Math.abs(nightLevel(6) - 0.21) < 1e-9
        && Math.abs(nightLevel(18.9) - 0) < 1e-12)
    // The shared-table hearts anchor over the EATER CLUSTER — the average of
    // where the residents actually stood the instant the last fork landed —
    // never a hardcoded kitchen point. Rig: residents start on the step far
    // from the kitchen; whatever spots they settle on, the event x/y must be
    // exactly their midpoint (the old law hardcoded the plate cell; the new
    // law follows the people, so any cluster shift moves the hearts).
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const keepAlive264 = (g) => { if (!g.done) for (const p of g.people) for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.9) }
    const sA = newRun(55)
    for (let i = 0; i < 60 * 60 && !sA.meal; i++) { advance(sA, DT); drain(sA) }
    const plateA = sA.meal
    const orderA = sA.people.map((p) => {   // both dine from the far end of the lot — orders issued together, like two taps
        p.r = 9; p.c = 5; p.x = tileX(5) + TILE / 2; p.y = tileY(9) + TILE / 2; p.path = null; p.goal = null; p.use = null
        keepAlive264(sA)
        return cmdUse(sA, p, plateA)
    })
    // The event fires on the LAST helping; lift meal-shared out of every drain.
    let sharedA = null
    const sEv = (g) => { const o = [...g.events]; g.events.length = 0; for (const e of o) if (e.t === 'meal-shared') sharedA = sharedA || e; return o }
    for (let i = 0; i < 60 * 60 * 4 && !sharedA && !sA.done; i++) { advance(sA, DT); sEv(sA); keepAlive264(sA) }
    sEv(sA)
    const spotA = sA.people.map((p) => [p.x, p.y])
    check('the shared table anchors its hearts over the eaters, not over a fixed kitchen point',
        orderA.every(Boolean) && !!sharedA
        && Math.abs(sharedA.x - (spotA[0][0] + spotA[1][0]) / 2) < 26 && Math.abs(sharedA.y - (spotA[0][1] + spotA[1][1]) / 2) < 26
        && Math.hypot(sharedA.x - (tileX(5) + TILE / 2), sharedA.y - (tileY(9) + TILE / 2)) > 40,
        `orders ${orderA.join('/')} shared ${sharedA ? `${sharedA.x.toFixed(0)},${sharedA.y.toFixed(0)}` : 'no'} spots ${spotA.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ')}`)
    check('the shared event carries its plate serial — the shell can vary the chord',
        !!sharedA && sharedA.serial >= 1)
    // The cold plate leaves a tell (asserted here at the source; the drive can
    // screenshot the grey puff — the storm-puff doctrine names this pattern).
    check('pin: the bells read their timbre table and the chord table in the shell',
        /MEAL_TIMBRE\[e\.slot\]/.test(pJsx) && /sharedChord\(e\.serial\)/.test(pJsx))
    check('pin: breakfast\u2019s historic notes still ring (no hardcoded 1046 left in the bell case)',
        /const tb = MEAL_TIMBRE\[e\.slot\]/.test(pJsx)
        && !/case 'meal' \{[\s\S]{0,400}playTone\(1046/.test(pJsx))
    check('pin: the shared anchor rides the event coords — the shell draws no kitchen-plate point',
        xCase(pJsx, 'meal-shared').includes('heartBurst(e.x, e.y - 12)') && !xCase(pJsx, 'meal-shared').includes('tileX(e.c)'))
    check('pin: cold leaves a grey puff + crumbs on the spot',
        /'#9a958a'/.test(pJsx) && /'#d9d2bc'/.test(pJsx) && /case 'meal-cold'/.test(pJsx))
    check('pin: the shell feeds the sprite the live night level (lit lots cannot pin 0)',
        /drawItem\(ctx, it, g\.sec, nightLevel\(g\.hour\)\)/.test(pJsx))
    check('pin: the plate sprite keeps night hours — dim/slow steam and a warm halo, one source for the curve',
        /nightLevel/.test(pArt) && /const k = 1 - night \/ 0\.42 \* 0\.72/.test(pArt)
        && /t \* 1\.4 \* k/.test(pArt) && /rgba\(255,200,120/.test(pArt) && /drawItemAt\(ctx, it\.id, tileX\(it\.c\), tileY\(it\.r\), t, night\)/.test(pArt))
    check('pin: nightTint paints from the same hoisted curve',
        /const a = nightLevel\(hour\)/.test(pArt) && !/let a = 0/.test(pArt))
}
function xCase(src, name) {
    const i = src.indexOf(`case '${name}'`)
    const j = src.indexOf("case '", i + 10)
    return src.slice(i, j < 0 ? i + 600 : j)
}

section('FIRST PASS (#2253) — grace, amber prompts, order ping')
{

    // DAY1_GRACE: the learning day decays half pace — day 1 is a tutorial,
    // not the 2-minute starvation race a cold player lost in the report.
    const hrs = (g, sec) => { for (let i = 0; i < Math.round(sec / DT) && !g.done; i++) { advance(g, DT); drain(g) } }
    const g1 = newRun(5), g2 = newRun(5)
    g2.day = 2
    const h0 = g1.people[0].needs.hunger
    hrs(g1, 20); hrs(g2, 20)
    const dropD1 = h0 - g1.people[0].needs.hunger
    const dropD2 = h0 - g2.people[0].needs.hunger
    check('day 1 decays at DAY1_GRACE pace — half of a later day',
        dropD1 > 0 && Math.abs(dropD1 * 2 - dropD2) < 0.005,
        `d1=${dropD1.toFixed(3)} d2=${dropD2.toFixed(3)}`)
    {
        const g1b = newRun(5), g2b = newRun(5); g2b.day = 2
        const hb = g1b.people[0].needs.hunger
        hrs(g1b, 20); hrs(g2b, 20)
        check('day-2 drop is exactly double the day-1 drop',
            Math.abs((hb - g1b.people[0].needs.hunger) * 2 - (hb - g2b.people[0].needs.hunger)) < 0.005)
        // the window closes at noon — the afternoon and the x8 work clock
        // run on the normal law (a whole-day halving re-phases the bot's day
        // and stranded seed 20261023's wish; found by the WINNABLE gate)
        const gw = newRun(5); gw.hour = 12.01
        const hw = gw.people[0].needs.hunger
        hrs(gw, 20)
        check('the grace ends at noon — afternoon day 1 decays full pace',
            Math.abs((hw - gw.people[0].needs.hunger) - dropD2) < 0.005)
    }

    // amber crosses BEFORE red, one-shot per crossing, and names the fix
    const ga = newRun(9)
    const amberEv = [], redEv = []
    for (let i = 0; i < 60 * 60 * 4 && !ga.done; i++) {
        advance(ga, DT); const e = drain(ga)
        amberEv.push(...e.filter((x) => x.t === 'amber')); redEv.push(...e.filter((x) => x.t === 'redcross'))
    }
    check('a starving day speaks early — amber prompts fire before any redcross',
        amberEv.length > 0 && ga.people.some((p) => p.needs.hunger <= RED_AT || p.faintT > 0) && amberEv.length >= redEv.length,
        `amber=${amberEv.length} red=${redEv.length}`)
    const keysOf = (ev) => ev.map((x) => `${x.name}:${x.need}`)
    const ka = keysOf(amberEv)
    check('one amber prompt per need-crossing — never spam', new Set(ka).size === ka.length)
    // every need names a fix, and every fix but social ships on the starter
    // lot (social is Fern's bell — the phone answers it once she visits)
    const NAMED_FIX = { hunger: 'FRIDGE', energy: 'BED', fun: 'TV', social: 'PHONE', bladder: 'TOILET' }
    check('every need has a one-tap fix in the hint map',
        NEEDS.every((n) => NEED_HINT[n] && NEED_HINT[n].toUpperCase().includes(NAMED_FIX[n])))
    const names = new Set(newRun(9).people.map((p) => p.name))
    check('every amber prompt is a resident with a hint the lot can answer',
        amberEv.every((x) => names.has(x.name) && NEED_HINT[x.need]))
    check('amber outranks red on the ladder (AMBER_AT above RED_AT)', AMBER_AT > RED_AT && DAY1_GRACE > 0 && DAY1_GRACE < 1)

    // recovery re-arms the stamp
    const gr = newRun(9)
    gr.people[0].needs.hunger = AMBER_AT - 0.01; gr.people[0].wasAmber = {}
    advance(gr, DT); drain(gr)
    const once = gr.events.filter((x) => x.t === 'amber').length
    gr.people[0].needs.hunger = 0.9
    advance(gr, DT); drain(gr)
    gr.people[0].needs.hunger = AMBER_AT - 0.01
    advance(gr, DT)
    check('feeding re-arms the amber prompt — a later slide warns again',
        once === 0 && gr.events.filter((x) => x.t === 'amber').length === 1)

    // the order ping: a commanded use rings the target the instant it lands
    const gp = newRun(7)
    const fridge = gp.items.find((it) => it.id === 'fridge')
    check('no ping on an idle lot', gp.orderPing.t === 0)
    check('ordering the fridge arms the ping', cmdUse(gp, gp.people[0], fridge) && gp.orderPing.t > 0 && gp.orderPing.label === 'FRIDGE')
    const last = gp.people[0].path[gp.people[0].path.length - 1]
    check('the ping sits on the target cell',
        Math.abs(gp.orderPing.x - (LOT_X + last.c * TILE + TILE / 2)) < 1 && Math.abs(gp.orderPing.y - (LOT_Y + last.r * TILE + TILE / 2)) < 1)
    const gp2 = newRun(7)
    cmdUse(gp2, gp2.people[0], gp2.items.find((it) => it.id === 'fridge'))
    for (let i = 0; i < 200; i++) { advance(gp2, DT); drain(gp2) }
    check('the ring fades on the real clock', gp2.orderPing.t === 0)
    const gd1 = newRun(42), gd2 = newRun(42)
    for (let i = 0; i < 60 * 60 * 3; i++) { autoStep(gd1, DT); autoStep(gd2, DT); drain(gd1); drain(gd2) }
    check('seeds stay exact with the first-pass law running', stateHash(gd1) === stateHash(gd2))

    // the wish still lands — grace delays the hazard, it does not remove it
    const w42 = play(42)
    check('the lifetime wish still lands with grace + prompts', w42.done === 'win', `content ${w42.content} day ${w42.day}`)
    const ign = newRun(11)
    let fainted = false
    for (let i = 0; i < 60 * 60 * 4 && !fainted; i++) { advance(ign, DT); fainted = drain(ign).some((x) => x.t === 'faint') }
    check('an ignored household still collapses — the grace teaches, it never wins the game for you', fainted)

    // source pins — the wiring must not silently drop
    const fSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const fJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const fReg = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    check('pin: the morning grace rides the hourly decay', /if \(s\.day === 1 && s\.hour < 12\) d \*= DAY1_GRACE/.test(fSim))
    check('pin: the amber crossing is a one-shot event on the same loop as the red alarm',
        /t: 'amber'/.test(fSim) && /wasAmber/.test(fSim) && /p\.needs\[n\] > 0\.5\) p\.wasAmber\[n\] = false/.test(fSim))
    check('pin: the shell answers amber and the tap — the tap always answers back',
        /case 'amber'/.test(fJsx) && /NEED_HINT\[e\.need\]/.test(fJsx) && /✓ \$\{/.test(fJsx))
    check('pin: the order ring draws on the play screen and fades on the sim clock',
        /g\.orderPing\.t > 0/.test(fJsx) && /orderPing\.t = Math\.max\(0, s\.orderPing\.t - dt\)/.test(fSim))
    check('pin: the banner left the house centre for the lawn (below every house row)',
        /const y = 348/.test(fJsx) && !/const y = H \/ 2 - 90/.test(fJsx))
    check('pin: HOMEBODY\'s pad names its A button — no FIRE on a life sim',
        /aLabel: '✓'/.test(fReg.match(/path: '\/homebody'[\s\S]*?\n    \}/)[0]))
}

section('GIFT LANDS & TIMBRES')   // #2240 — the basket that lands, the two bells that differ, the attract that sells Ivy
{
    // The set-down: a FRIENDS+ gift no longer ends at the toast — when Ivy
    // reaches her kitchen destination the basket lands with its own event.
    const ivyRing = (g, lv) => { g.visitAfter = 99; g.ivyAfter = Math.min(g.ivyAfter ?? 99, Math.floor(g.hour)); g.ivyGap = 0; g.rel.ivy = lv }
    const landRun = (lv, seed = 17) => {
        const g = newRun(seed); ivyRing(g, lv)
        const ev = []
        let land = null, visitAt = -1, landAt = -1, armed = 0
        for (let i = 0; i < 60 * 40 && !land; i++) {
            advance(g, DT)
            for (const e of drain(g)) {
                ev.push(e)
                if (e.t === 'visit' && e.name === 'Ivy' && visitAt < 0) visitAt = i
                if (e.t === 'gift-land') { land = e; landAt = i; armed = g.giftFx }
            }
        }
        return { g, ev, land, visitAt, landAt, armed }
    }
    const L2 = landRun(30), L3 = landRun(60), L0 = landRun(0)
    check('#2240 the FRIENDS basket LANDS when Ivy reaches the kitchen — its own event after the ring',
        !!L2.land && L2.landAt > L2.visitAt, `ring@${L2.visitAt} land@${L2.landAt}`)
    {
        const fridge = L2.g.items.find((it) => it.id === 'fridge')
        const want = targetsOf(L2.g, fridge).find((t) => walkable(L2.g, t.r, t.c))
        const ok = want && Math.abs(L2.land.x - (LOT_X + want.c * TILE + TILE / 2)) < 1 && Math.abs(L2.land.y - (LOT_Y + want.r * TILE + TILE / 2)) < 1
        check('#2240 the basket lands beside the fridge (the thought line always promised the kitchen step)', ok, JSON.stringify(L2.land))
    }
    check('#2240 the set-down arms its stage timer at GIFT_LAND_T', L2.armed === GIFT_LAND_T)
    check('#2240 FAMILY sends honey too; FRIENDS sends greens only', L3.land?.honey === true && L2.land?.honey === false)
    check('#2240 below FRIENDS nothing lands — no gift, no beat', !L0.land && L0.g.giftFx === 0)
    {
        // no kitchen → the front step takes the gift; and the timer fades.
        const g = newRun(19); g.items = g.items.filter((it) => it.id !== 'fridge'); ivyRing(g, 30)
        let land = null
        for (let i = 0; i < 60 * 40 && !land; i++) { advance(g, DT); land = drain(g).find((e) => e.t === 'gift-land') || null }
        const stepOk = land && walkable(g, 10, 5)
            ? Math.abs(land.x - (LOT_X + 5 * TILE + TILE / 2)) < 1 && Math.abs(land.y - (LOT_Y + 10 * TILE + TILE / 2)) < 1
            : false
        check('#2240 with no fridge left standing the basket takes the front step', !!land && stepOk, JSON.stringify(land))
        const g2 = newRun(17); ivyRing(g2, 30)
        let landed = false, faded = false
        for (let i = 0; i < 60 * 60; i++) {
            advance(g2, DT); drain(g2)
            if (!landed && g2.giftFx > 0) landed = true
            if (landed && g2.giftFx === 0) { faded = true; break }
        }
        check('#2240 the basket fades on the real clock and never re-arms unbidden', landed && faded && g2.giftFx === 0)
    }
    // Hash-silence: the staging is a view beat, not a rule — the run that
    // "sees" the basket and the run that drained it early hash identical.
    {
        const h1 = newRun(17); ivyRing(h1, 30)
        for (let i = 0; i < 60 * 40; i++) { advance(h1, DT); drain(h1) }
        const h2 = newRun(17); ivyRing(h2, 30)
        for (let i = 0; i < 60 * 40; i++) { advance(h2, DT); drain(h2) }
        h2.giftFx = 0; h2.giftAt = null
        check('#2240 the set-down is view-only — giftFx/giftAt stay off the hash', stateHash(h1) === stateHash(h2))
    }

    // Visitor timbres: two neighbours, two voices. Fern keeps the historic
    // dinger; Ivy earns her own lilt; both take their entrance by foot.
    {
        const F = VISIT_TIMBRE.Fern, I = VISIT_TIMBRE.Ivy
        check('#2240 Fern keeps the historic two-note rising dinger (660 → 880)',
            F.call.length === 2 && F.call[0][0] === 660 && F.call[1][0] === 880 && F.call[1][0] > F.call[0][0])
        check('#2240 Ivy rings a three-note lilt that LANDS DOWN — her own motif, not Fern\'s register',
            I.call.length === 3 && I.call[2][0] < I.call[1][0] && I.call.every(([f]) => !F.call.some(([ff]) => ff === f)))
        check('#2240 both come in on foot — a two-pat flourish each, Ivy lower and slower (the basket arm)',
            F.steps.length === 2 && I.steps.length === 2
            && I.steps.every(([f]) => f < Math.min(F.steps[0][0], F.steps[1][0]))
            && (I.steps[1][2] - I.steps[0][2]) > (F.steps[1][2] - F.steps[0][2]),
            `fern ${F.steps.map((s) => `${s[0]}@${s[2]}`).join(' ')} | ivy ${I.steps.map((s) => `${s[0]}@${s[2]}`).join(' ')}`)
        const fJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
        const fArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
        check('#2240 pin: the shell plays the motif tables verbatim — no hardcoded rings left',
            /VISIT_TIMBRE\[e\.name\]/.test(fJsx) && !/playTone\(660, 0\.14/.test(fJsx))
        check('#2240 pin: the set-down thunk is its own event case, and the basket painter rides the depth line',
            /case 'gift-land'/.test(fJsx) && /drawGroundGift\(ctx, g\)/.test(fJsx) && /export function drawGroundGift/.test(fArt))
    }

    // Attract sells Ivy: every demo run rings her once, and a resident who
    // strolls into her ring actually chats.
    {
        const attract = (seed) => {
            const g = newRun(seed)
            let present = 0, chats = 0, ivyMax = 0
            const seen = { ring: 0 }
            for (let i = 0; i < 60 * 60 * 6 && !g.done; i++) {
                autoStep(g, DT)
                if (g.ivy) present++
                seen.ring = Math.max(seen.ring, g.demoIvy)
                ivyMax = Math.max(ivyMax, g.rel.ivy)
                for (const e of drain(g)) { if (e.t === 'chat' && e.k === 'ivy') chats++; if (e.t === 'visit' && e.name === 'Ivy') seen.coo = (seen.coo || 0) + 1 }
            }
            return { g, present, chats, ivyMax, rung: seen.ring, coos: seen.coo || 0 }
        }
        const A = attract(20261023), B = attract(5), C = attract(99)
        check('#2240 attract rings Ivy once per run — every seed shows the second neighbour (3 seeds)',
            A.rung === 1 && B.rung === 1 && C.rung === 1 && A.coos >= 1 && B.coos >= 1 && C.coos >= 1,
            `coos ${A.coos}/${B.coos}/${C.coos}`)
        // A chat beside Ivy means her meter actually ticked (rel.ivy grows ONLY
        // while claimed in the ring). The lonely-resident law (#2143) is the
        // walker — autonomy's own nearest-visitor route — because seed 7's
        // knife-edge economy (§10 left at the win) broke when the demo forced
        // extra walks; the ring, the arrival and the lonely chats sell her.
        check('#2240 her law speaks in attract — across seeds a resident reaches Ivy, the meter ticks and a bubble lands',
            A.ivyMax + B.ivyMax + C.ivyMax > 0 && A.chats + B.chats + C.chats >= 1,
            `rel.ivy ${A.ivyMax.toFixed(2)}/${B.ivyMax.toFixed(2)}/${C.ivyMax.toFixed(2)}, chats ${A.chats}/${B.chats}/${C.chats}`)
        const dA = newRun(2026), dB = newRun(2026)
        for (let i = 0; i < 60 * 60; i++) { autoStep(dA, DT); drain(dA); autoStep(dB, DT); drain(dB) }
        check('#2240 the Ivy-biased attract stays seed-exact', stateHash(dA) === stateHash(dB))
        const w = play(20261023)
        check('#2240 the wish still lands with the Ivy ring and the stroll law running', w.done === 'win', `content ${w.content} day ${w.day}`)
    }
}

// --------------------------------------------------------- YARN (#2256) ------
section('YARN BALL (#2256): ordered play, honest refusals, the cat\u2019s own game, exclusions')
{
    const yarnSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const yarnJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const yarnArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')

    // the card: FUN shelf, catOnly flag, décor (never blocks anybody)
    check('the yarn card sits on the FUN shelf, cat-only decor at §60', DEF.yarn.catOnly === true && DEF.yarn.decor === true && DEF.yarn.need === 'fun' && TAB_CARDS[1].includes(16) && TAB_OF[16] === 1)

    // refusal without a cat: the order dies honest at the ball, with a voice
    const s1 = newRun(12)
    s1.money = 600
    s1.sel = 16
    check('the shelf sells a ball: placed, paid', place(s1, 10, 2) && s1.money === 600 - DEF.yarn.price)
    const ball = s1.items.find((it) => it.id === 'yarn')
    check('without a cat the play order refuses at the ball', !cmdUse(s1, s1.people[0], ball) && drain(s1).some((e) => e.t === 'refuse' && e.r === 10 && e.c === 2) && !yarnOrderOk(s1))

    // cat home — but night keeps the offer: Miso sleeps through orders
    adoptPet(s1)
    s1.hour = 23
    check('night: the cat sleeps and the ball waits', !yarnOrderOk(s1))
    s1.hour = 10
    s1.pet.needs.fun = 0.45   // leave headroom under the cap so the +YARN_CAT_FUN pay is visible

    // the ordered session: walk, dangle, both paid, bond + content + cooldown + staging
    const o = s1.people[0]
    const parkBallCat = () => {
        s1.pet.r = 10; s1.pet.c = 3; s1.pet.x = tileX(3) + TILE / 2; s1.pet.y = tileY(10) + TILE / 2
        s1.pet.path = null; s1.pet.state = 'roam'; s1.pet.play = false
        s1.pet.cd = PET_COOS   // arm the coo cooldown so the proximity law can't co-pay
        o.r = 9; o.c = 2; o.x = tileX(2) + TILE / 2; o.y = tileY(9) + TILE / 2
        o.path = null; o.goal = null; o.use = null; o.working = false; o.faintT = 0
    }
    parkBallCat()
    s1.yarnCd = 0
    const cf0 = s1.pet.needs.fun, soc0 = o.needs.social, rel0 = s1.rel.house, cnt0 = s1.content
    check('with Miso home and rested the order stands', yarnOrderOk(s1) && cmdUse(s1, o, ball))
    let paidCd = -1, playEv = null
    for (let i = 0; i < 600; i++) {
        // keep the cat in reach, but let the resident finish the walk on their own
        s1.pet.r = 10; s1.pet.c = 3; s1.pet.x = tileX(3) + TILE / 2; s1.pet.y = tileY(10) + TILE / 2
        s1.pet.path = null; s1.pet.state = 'roam'; s1.pet.play = false
        s1.pet.needs.fun = cf0   // hold fun steady against hourly decay so the pay is exact
        o.needs.social = soc0    // ditto the resident's social
        advance(s1, DT)
        const ev = drain(s1).find((e) => e.t === 'pet-play')
        if (ev) { playEv = ev; paidCd = s1.yarnCd; break }
    }
    check('the ordered play pays both sides, the bond and an event', !!playEv && s1.pet.needs.fun >= cf0 + YARN_CAT_FUN - 0.01 && o.needs.social > soc0 && s1.rel.house >= rel0 + YARN_BOND - 0.05 && s1.content > cnt0)
    check('the session arms the cooldown and the ball spins', paidCd === YARN_CD && ball.playT > 0 && s1.pet.playT > 0)

    // the cooldown economy: one session per YARN_CD
    o.path = null; o.goal = null; o.use = null
    check('a second order inside the cooldown refuses', !cmdUse(s1, o, ball))
    for (let i = 0; i < Math.ceil(YARN_CD * 60) + 10; i++) { advance(s1, DT); drain(s1) }
    check('the offer stands again once the cooldown closes', yarnOrderOk(s1) && cmdUse(s1, o, ball))

    // the cat wandered off — the finish refuses honestly, fun unchanged
    const cf1 = s1.pet.needs.fun
    s1.pet.r = 12; s1.pet.c = 5; s1.pet.x = tileX(5) + TILE / 2; s1.pet.y = tileY(12) + TILE / 2; s1.pet.play = false
    let refusedFar = false
    for (let i = 0; i < 400; i++) {
        s1.pet.r = 12; s1.pet.c = 5; s1.pet.x = tileX(5) + TILE / 2; s1.pet.y = tileY(12) + TILE / 2; s1.pet.path = null; s1.pet.needs.fun = cf1
        advance(s1, DT)
        if (drain(s1).some((e) => e.t === 'refuse' && e.r === 10 && e.c === 2)) { refusedFar = true; break }
    }
    check('a cat out of reach refuses the finish — the wasted walk is the cost', refusedFar && s1.pet.needs.fun <= cf1 + 0.01)

    // pad-A doctrine: the A button takes the order only while it stands
    o.path = null; o.goal = null; o.use = null
    o.r = 10; o.c = 3; o.x = tileX(3) + TILE / 2; o.y = tileY(10) + TILE / 2
    s1.yarnCd = 4
    check('pad-A skips the ball while the cooldown holds', !tryUse(s1, o))
    s1.yarnCd = 0
    check('pad-A takes the play order when it stands', tryUse(s1, o) === true && o.goal && o.goal.it.id === 'yarn')
    o.path = null; o.goal = null; o.use = null

    // the cat\u2019s own game: a bored Miso hunts the ball unasked
    const s2 = newRun(14)
    s2.money = 600
    s2.sel = 16
    place(s2, 10, 2)
    adoptPet(s2)
    s2.pet.needs.fun = 0.2
    s2.pet.cd = PET_COOS
    let selfPlay = null
    for (let i = 0; i < 1200 && !selfPlay; i++) { advance(s2, DT); selfPlay = drain(s2).find((e) => e.t === 'pet-play' && e.self) || null }
    check('a bored cat hunts the yarn herself — the toy works unasked', !!selfPlay && s2.pet.playT > 0)

    // exclusions: Pip does not play with the cat\u2019s ball
    const s3 = newRun(15)
    s3.money = 900
    s3.sel = 16
    place(s3, 10, 2)
    adoptKid(s3)
    s3.kid.needs.fun = 0.1
    let kidOnBall = false
    for (let i = 0; i < 900; i++) {
        advance(s3, DT); drain(s3)
        if (s3.kid.goal && s3.kid.goal.it && s3.kid.goal.it.id === 'yarn') kidOnBall = true
    }
    check('generic fun-seeking skips the cat toy — Pip never targets the ball', !kidOnBall)

    // the sale: it is furniture after all — half back, gone from the lot
    s3.money = 100
    check('the ball sells back for half and leaves the lot', sellAt(s3, 10, 2) && s3.money === 100 + Math.floor(DEF.yarn.price / 2) && !s3.items.some((it) => it.id === 'yarn'))

    // determinism + the hash: the cooldown is state
    const dA = newRun(16), dB = newRun(16)
    for (const d of [dA, dB]) { d.money = 600; d.sel = 16; place(d, 10, 2); adoptPet(d) }
    for (let i = 0; i < 900; i++) { advance(dA, DT); drain(dA); advance(dB, DT); drain(dB) }
    check('yarn hours stay seed-exact', stateHash(dA) === stateHash(dB))
    const hy = stateHash(dA)
    dA.yarnCd += 1.1
    check('the yarn cooldown rides the hash', stateHash(dA) !== hy)

    // the wish still lands with a cat and a yarn economy (and the ball never gets in the way)
    const w = newRun(1)
    let wn = 0
    while (!w.done && wn++ < 60 * 60 * 6) { autoStep(w, DT); drain(w) }
    check('the lifetime wish still lands with the yarn shelf open', w.done === 'win')

    // source pins — the wiring must not silently drop
    check('pin: cat-only is skipped by BOTH generic fun hunts', (yarnSim.match(/d\.catOnly \|\| d\.binOnly(?: \|\| d\.truckOnly)?\) continue/g) || []).length >= 2)   // #2303: the bin's exclusion rides the same lines; #2503: and the cone's joins them (generic hunts never spend the till)
    check('pin: the order gate is one honest voice', /catOnly && !yarnOrderOk\(s\)/.test(yarnSim) && /export function yarnOrderOk/.test(yarnSim))
    check('pin: the finish pays cat fun, social, bond and content', /cat\.needs\.fun = Math\.min\(1, cat\.needs\.fun \+ YARN_CAT_FUN\)/.test(yarnSim) && /relAdd\(s, 'house', YARN_BOND\)/.test(yarnSim))
    check('pin: the cooldown rides advance and the hash', /if \(s\.yarnCd > 0\) s\.yarnCd = Math\.max\(0, s\.yarnCd - dt\)/.test(yarnSim) && /mix\(s\.yarnCd\)/.test(yarnSim))
    check('pin: the shell names the honest refusals and voices the session', /NO CAT ON THE LOT/.test(yarnJsx) && /MISO IS NOT FEELING IT/.test(yarnJsx) && /case 'pet-play'/.test(yarnJsx) && /MISO WANTS A GAME/.test(yarnJsx))
    check('pin: the art ships — ball, spin staging, and the new cat states', /case 'yarn'/.test(yarnArt) && /it\.playT/.test(yarnArt) && /sitT/.test(yarnArt) && /stretchT/.test(yarnArt))
}

// ------------------------------------------------- GARBAGE DAY (#2303) ----
section('GARBAGE DAY (#2303): the eve sets out, dawn resolves, a miss is honest')
{
    // the bin is the lot's own object — never a card, never for sale
    const s0 = newRun(31)
    const bin0 = s0.items.find((it) => it.id === 'bin')
    check('the bin is a walkable lot-owned object, never a catalog card',
        BIN.need === 'fun' && BIN.solid === false && BIN.binOnly === true && !CATALOG.some((d) => d.id === 'bin'))
    check('a fresh lot has the bin by the gate and the truck three days out',
        !!bin0 && bin0.r === BIN_HOME.r && bin0.c === BIN_HOME.c && s0.binAt === 'home'
        && s0.collectionDay === GARBAGE_EVERY && s0.collections === 0 && s0.skips === 0)
    check('no order before the eve — the refusal is seen at the cell',
        !binOrderOk(s0) && !cmdUse(s0, s0.people[0], bin0) && drain(s0).some((e) => e.t === 'refuse' && e.r === BIN_HOME.r && e.c === BIN_HOME.c))
    check('the bin cannot be sold', sellAt(s0, BIN_HOME.r, BIN_HOME.c) === false && s0.money === newRun(31).money)

    // the eve law: one announcement, a seeded dawn hour, order only in-window
    const keepAlive = (g) => { for (const q of g.people) { q.faintT = 0; q.needs.hunger = Math.max(q.needs.hunger, 0.8); q.needs.energy = Math.max(q.needs.energy, 0.8); q.needs.bladder = Math.max(q.needs.bladder, 0.8) } }   // the household being alive is not what these gates test
    const s1 = newRun(32)
    s1.day = 2
    let eveEv = null
    for (let i = 0; i < 60 * 60 && !eveEv; i++) { advance(s1, DT); keepAlive(s1); eveEv = drain(s1).find((x) => x.t === 'bin-eve') || null }
    check('the eve before collection announces itself and arms the chore', !!eveEv && s1.day === 2 && s1.binAuto === true)
    const truck1 = s1.truckHour
    check('the dawn hour seeds inside the truck window', truck1 >= TRUCK_DUE[0] && truck1 <= TRUCK_DUE[1], `${truck1.toFixed(2)}h`)
    s1.hour = 12
    check('noon is not eve — the order waits', !binOrderOk(s1))
    s1.hour = 23
    check('midnight is not eve either — the bin goes out before dark', !binOrderOk(s1))
    s1.hour = 18
    keepAlive(s1)
    check('in the eve window the order stands', binOrderOk(s1) && cmdUse(s1, s1.people[0], s1.items.find((it) => it.id === 'bin')))
    let outEv = null
    for (let i = 0; i < 60 * 30 && !outEv; i++) { advance(s1, DT); keepAlive(s1); outEv = drain(s1).find((x) => x.t === 'bin-out') || null }
    const bin1 = s1.items.find((it) => it.id === 'bin')
    check('the resident wheels the bin to the curb and stamps the day',
        !!outEv && s1.binAt === 'curb' && bin1.r === BIN_CURB.r && bin1.c === BIN_CURB.c && s1.binSetDay === 2 && s1.binAuto === false)
    let extraEve = 0
    for (let i = 0; i < 60 * 40; i++) { advance(s1, DT); keepAlive(s1); extraEve += drain(s1).filter((x) => x.t === 'bin-eve').length }
    check('the eve announces once per cycle — never re-arms after the trip', extraEve === 0)
    check('the bin at the curb refuses a second order at the cell',
        !binOrderOk(s1) && !cmdUse(s1, s1.people[1], bin1) && drain(s1).some((e) => e.t === 'refuse'))

    // dawn collection: the truck keeps its hours
    const rel0 = s1.rel.house
    let colEv = null, cntAtTick = s1.content, funAtTick = s1.people.map((p) => p.needs.fun), relAtTick = rel0
    for (let i = 0; i < 60 * 60 * 2 && !colEv; i++) {
        cntAtTick = s1.content; funAtTick = s1.people.map((p) => p.needs.fun); relAtTick = s1.rel.house
        advance(s1, DT); keepAlive(s1); colEv = drain(s1).find((x) => x.t === 'garbage-collected') || null
    }
    check('the truck takes it at dawn and wheels the bin home',
        !!colEv && s1.day === 3 && s1.binAt === 'home' && bin1.r === BIN_HOME.r && bin1.c === BIN_HOME.c && s1.collections === 1 && s1.collectionDay === GARBAGE_EVERY * 2)
    check('collection pays honestly — fun up, bond up, never more than one content',
        s1.people.every((p, k) => p.needs.fun >= funAtTick[k] + BIN_FUN - 0.01)
        && s1.rel.house >= relAtTick + BIN_BOND - 0.01 && s1.content <= cntAtTick + 1)
    check('the next eve re-arms on schedule', (() => {
        let e = null
        for (let i = 0; i < 60 * 60 * 5 && !e; i++) { advance(s1, DT); keepAlive(s1); e = drain(s1).find((x) => x.t === 'bin-eve') || null }
        return !!e && s1.day === 5 && s1.binAuto === true
    })())

    // the honest skip: a forgotten set-out costs the whole cycle
    const s2 = newRun(33)
    let skipEv = null, colBefore = null
    for (let i = 0; i < 60 * 60 * 5 && !skipEv; i++) {
        advance(s2, DT); keepAlive(s2); const ev = drain(s2)
        if (!colBefore) colBefore = ev.find((x) => x.t === 'garbage-collected') || null
        skipEv = ev.find((x) => x.t === 'garbage-skipped') || null
    }
    check('a forgotten set-out skips the collection honestly and visibly',
        !!skipEv && s2.skips === 1 && s2.binAt === 'home' && !colBefore && s2.collections === 0)
    check('a skipped day cannot be collected late — the roster moves on',
        s2.collectionDay === GARBAGE_EVERY * 2 && s2.day === 3)
    let lateCol = null
    for (let i = 0; i < 60 * 60 * 3 && !lateCol && s2.day === 3; i++) { advance(s2, DT); keepAlive(s2); lateCol = drain(s2).find((x) => x.t === 'garbage-collected') || null }
    check('the passed truck cannot be flagged down — the missed day collects nothing',
        !lateCol && s2.day >= 4 && s2.collectionDay === GARBAGE_EVERY * 2 && s2.skips === 1)

    // autonomy: the quiet-lot law — a resident with needs in hand and nobody
    // on the lot wheels the bin out unasked (rigged honest: demo seeds keep
    // Fern or Ivy into the evening and the chore yields to chat by law, so
    // the law is proven on a lot with the neighbours away and needs banked —
    // not by stealing a chat minute)
    const s3 = newRun(34)
    let autoOut = null
    for (let i = 0; i < 60 * 60 * 8 && !autoOut; i++) {
        if (s3.day === 2 && s3.hour >= 18 && s3.binAuto) {
            s3.visitor = null; s3.ivy = null
            for (const q of s3.people) for (const n of NEEDS) q.needs[n] = 0.9
        }
        autoStep(s3, DT)
        autoOut = drain(s3).find((x) => x.t === 'bin-out') || null
        if (s3.day >= 3) break
    }
    check('on a quiet eve a resident with needs in hand wheels the bin out unasked', !!autoOut && s3.binAt === 'curb')

    // determinism and the hash
    const dA = newRun(35), dB = newRun(35)
    for (const d of [dA, dB]) for (let i = 0; i < 60 * 60 * 3; i++) { autoStep(d, DT); drain(d) }
    check('seeds stay exact with the truck running', stateHash(dA) === stateHash(dB))
    const hy = stateHash(dA)
    dA.binAt = dA.binAt === 'curb' ? 'home' : 'curb'
    check('where the bin stands rides the hash', stateHash(dA) !== hy)
    const hz = stateHash(dA)
    dA.collectionDay += 1; dA.truckHour += 0.5
    check('the truck roster rides the hash', stateHash(dA) !== hz)
    const hw = stateHash(dA)
    dA.binSetDay += 1; dA.collections += 1; dA.skips += 1
    check('the set-out stamp and the ledger ride the hash', stateHash(dA) !== hw)

    // the win economy is untouched: the wish still lands with the truck running
    const w = newRun(1)
    let wn = 0
    while (!w.done && wn++ < 60 * 60 * 6) { autoStep(w, DT); drain(w) }
    check('the lifetime wish still lands with garbage day in the lot', w.done === 'win')

    // source pins — the wiring must not silently drop
    const gSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const gJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const gArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('pin: the order gate is one honest voice', /binOnly && !binOrderOk\(s\)/.test(gSim) && /export function binOrderOk/.test(gSim))
    check('pin: the eve arms and dawn resolves on the world clock', /function updateBin\(s\)/.test(gSim) && /updateBin\(s\)/.test(gSim) && /s\.collectionDay \+= GARBAGE_EVERY/.test(gSim))
    check('pin: collection pays fun, bond and one content — never more', /q\.needs\.fun = Math\.min\(1, q\.needs\.fun \+ BIN_FUN\)/.test(gSim) && /relAdd\(s, 'house', BIN_BOND\)/.test(gSim) && !/garbage[\s\S]{0,400}content \+ 2/.test(gSim))
    check('pin: the sale refuses and the stamp refuses', /it\.id === 'meal' \|\| it\.id === 'bin'/.test(gSim) && /s\.binSetDay === s\.day/.test(gSim))
    check('pin: the demo autonomy keeps the eve chore', /s\.demo && s\.binAuto/.test(gSim))
    check('pin: the shell voices the whole cycle and the marquee teaches it',
        /case 'bin-eve'/.test(gJsx) && /case 'bin-out'/.test(gJsx) && /case 'garbage-collected'/.test(gJsx) && /case 'garbage-skipped'/.test(gJsx)
        && /GARBAGE TOMORROW — WHEEL OUT THE BIN/.test(gJsx) && /THE TRUCK PASSED US BY/.test(gJsx) && /GARBAGE DAY EVERY THIRD DAY/.test(gJsx))
    check('pin: the tap answers honestly out of season', /DEF\[it\.id\]\.binOnly/.test(gJsx) && /NO COLLECTION TONIGHT/.test(gJsx))
    check('pin: the art ships the bin', /case 'bin'/.test(gArt))
}

// ---------------------------------------------- ICE CREAM TRUCK (#2503) ----
section('ICE CREAM TRUCK (#2503): the jingle passes, the cone sells, the truck moves on')
{
    const keepAlive = (g) => { for (const q of g.people) { q.faintT = 0; q.needs.hunger = Math.max(q.needs.hunger, 0.8); q.needs.energy = Math.max(q.needs.energy, 0.8); q.needs.bladder = Math.max(q.needs.bladder, 0.8) } }   // the household being alive is not what these gates test

    // the cone belongs to the street — never a card, never for sale
    const s0 = newRun(41)
    check('the cone is a walkable street-owned object, never a catalog card',
        CONE.need === 'fun' && CONE.solid === false && CONE.truckOnly === true && !CATALOG.some((d) => d.id === 'cone'))
    check('a fresh lot has no cone and an empty ledger',
        s0.cone === null && s0.iceDay === 0 && s0.iceSerial === 0 && s0.treats === 0 && !s0.items.some((it) => it.id === 'cone'))
    check('the truck-not-here order refuses at the cell',
        !coneOrderOk(s0) && !cmdUse(s0, s0.people[0], { id: 'cone', r: 12, c: 5 })
        && drain(s0).some((e) => e.t === 'refuse' && e.r === 12 && e.c === 5))
    check('the cone cannot be sold', sellAt(s0, 12, 5) === false && s0.money === newRun(41).money)

    // the schedule law: arithmetic off the day, never rng, never banked
    check('the pass hour sits inside the warm-afternoon window, day after day',
        Array.from({ length: 30 }, (_, i) => icePassHour(i + 1)).every((h) => h >= ICE_DUE[0] && h < ICE_DUE[1]))
    check('the pass hour is pure arithmetic — the same day names the same hour',
        icePassHour(9) === icePassHour(9) && icePassHour(9) !== icePassHour(10))

    // the organic pass: land, idle, leave — the day stamp is the law
    const s1 = newRun(42)
    let truckEv = null, goneEv = null, landHour = 0, landCone = false, landDay = 0, landSerial = 0, landMoney = 0, n = 0
    while (!goneEv && s1.day === 1 && n++ < 60 * 60 * 6) {
        advance(s1, DT); keepAlive(s1)
        const ev = drain(s1)
        if (!truckEv && ev.some((e) => e.t === 'ice-truck')) { truckEv = true; landHour = s1.hour; landCone = !!s1.cone; landDay = s1.iceDay; landSerial = s1.iceSerial; landMoney = s1.money }
        if (ev.find((e) => e.t === 'ice-gone')) goneEv = true
    }
    check('the truck stops — one cone at the curb, the day stamped, nothing paid yet',
        !!truckEv && landCone && landDay === 1 && landSerial === 1 && landMoney === newRun(42).money
        && landHour >= icePassHour(1) && landHour < icePassHour(1) + 0.1, `${landHour.toFixed(2)}h`)
    check('the window closes — the leftover cone goes with the truck', !!goneEv && s1.cone === null && !s1.items.some((it) => it.id === 'cone'))
    const s1b = newRun(50)
    let trucks = { 1: 0, 2: 0 }, m = 0
    while (!(s1b.day === 2 && s1b.hour > icePassHour(2) + ICE_WINDOW + 0.5) && m++ < 60 * 60 * 8) {
        advance(s1b, DT); keepAlive(s1b)
        if (drain(s1b).some((e) => e.t === 'ice-truck')) trucks[s1b.day]++
    }
    check('one truck a day, both days, the stamp neither double-drops nor banks',
        trucks[1] === 1 && trucks[2] === 1 && s1b.iceSerial === 2, `day1 ${trucks[1]}, day2 ${trucks[2]}`)

    // the buy: the till pays, fun lands, the cone leaves the street
    const s2 = newRun(43)
    ringTruck(s2); advance(s2, DT)
    check('a rigged ring lands a fresh cone and the order gate stands', !!s2.cone && coneOrderOk(s2))
    check('the tap issues the order', cmdUse(s2, s2.people[0], s2.cone))
    let bought = null, m0 = s2.money, fun0 = s2.people[0].needs.fun, armHeld2 = -1
    for (let i = 0; i < 60 * 40 && !bought; i++) { advance(s2, DT); keepAlive(s2); bought = drain(s2).find((e) => e.t === 'ice-cream') || null; if (bought) armHeld2 = s2.people[0].coneHold }   // #2508 item 3: the arm instant — the sale tick stamps the hold
    check('the walk pays the till, pays the fun bar, and retires the cone',
        !!bought && m0 - s2.money === CONE_PRICE && s2.treats === 1 && s2.cone === null
        && s2.people[0].needs.fun >= Math.min(1, fun0 + ICE_FUN))

    // honest refusals — broke at the tap, broke at the finish
    const s3 = newRun(44)
    ringTruck(s3); advance(s3, DT)
    s3.money = CONE_PRICE - 1
    check('an order with empty pockets refuses at the tap',
        !coneOrderOk(s3) && !cmdUse(s3, s3.people[0], s3.cone) && drain(s3).some((e) => e.t === 'refuse') && s3.treats === 0)
    const s4 = newRun(45)
    ringTruck(s4); advance(s4, DT)
    cmdUse(s4, s4.people[0], s4.cone)
    s4.money = 0
    let brokeEv = null
    for (let i = 0; i < 60 * 40 && !brokeEv; i++) { advance(s4, DT); keepAlive(s4); brokeEv = drain(s4).find((e) => e.t === 'refuse') || null }
    check('a till drained mid-walk refuses at the curb — the wasted steps are the cost, the cone stays for a paying hand',
        !!brokeEv && s4.treats === 0 && !!s4.cone)

    // one serving per cone — whoever reaches first eats it
    const s5 = newRun(46)
    ringTruck(s5); advance(s5, DT)
    const cone5 = s5.cone
    const o1 = cmdUse(s5, s5.people[0], cone5), o2 = cmdUse(s5, s5.people[1], cone5)
    let nBuy = 0, nNo = 0
    for (let i = 0; i < 60 * 60 && nBuy + nNo < 2; i++) {
        advance(s5, DT); keepAlive(s5)
        const ev = drain(s5)
        nBuy += ev.filter((e) => e.t === 'ice-cream').length
        nNo += ev.filter((e) => e.t === 'refuse').length
    }
    check('one cone, one serving — the late hand is refused at the curb', o1 && o2 && nBuy === 1 && nNo === 1 && s5.treats === 1)

    // the child's law: Pip chases the jingle and pays from the till
    const s6 = newRun(47)
    adoptKid(s6)
    ringTruck(s6)
    let kidEv = null, kidArmHeld = -1
    for (let i = 0; i < 60 * 60 && !kidEv; i++) { autoStep(s6, DT); kidEv = drain(s6).find((e) => e.t === 'kid-ice') || null; if (kidEv) kidArmHeld = s6.kid.coneHold }   // #2508 item 3: the kid's arm rides the same tick as the catch
    check('with the jingle up the child beats the toy box to the curb and pays for the joy',
        !!kidEv && s6.treats === 1 && s6.kid.needs.fun >= ICE_KID_FUN - 0.01)

    // midnight takes whatever the window somehow kept
    const s8 = newRun(49)
    s8.hour = 23.5
    ringTruck(s8); advance(s8, DT)
    check('a rigged late stop may stand', !!s8.cone)
    runFor(s8, 3)   // 3 real seconds crosses midnight at 5 s per sim-hour
    check('midnight rots the late cone — the truck is home, nothing waits for tomorrow',
        s8.day === 2 && s8.cone === null && !s8.items.some((it) => it.id === 'cone'))

    // the ledger rides the hash
    const s9 = newRun(51)
    const hPre = stateHash(s9)
    ringTruck(s9); advance(s9, DT)
    check('the standing cone moves the hash', stateHash(s9) !== hPre)
    const h1 = stateHash(s9)
    s9.iceDay += 1; check('the stop stamp rides the hash', stateHash(s9) !== h1)
    s9.iceDay -= 1; s9.iceSerial += 1; check('the cone serial rides the hash', stateHash(s9) !== h1)
    s9.iceSerial -= 1; s9.treats += 1; check('the treats ledger rides the hash', stateHash(s9) !== h1)

    // the win economy is untouched: the wish still lands with the truck running
    const w = play(1)
    check('the lifetime wish still lands with the ice-cream man on the street', w.done === 'win')

    // source pins — the wiring must not silently drop
    const iSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const iJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const iArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const iBody = iSim.match(/function updateIceCream\(s\) \{[\s\S]*?\n\}/)?.[0] || 'MISSING'
    check('pin: the order gate is one honest voice', /truckOnly && !coneOrderOk\(s\)/.test(iSim) && /export function coneOrderOk/.test(iSim))
    check('pin: the clock\u2019s own paths draw no rng (the #2303 lesson)', /function updateIceCream\(s\)/.test(iSim) && iBody !== 'MISSING' && !/s\.rng\(\)|pick\(s,/.test(iBody) && /updateIceCream\(s\)/.test(iSim))
    check('pin: the till pays, fun pays, the ledger stamps', /s\.money -= CONE_PRICE/.test(iSim) && /p\.needs\.fun = Math\.min\(1, p\.needs\.fun \+ ICE_FUN\)/.test(iSim) && /s\.treats\+\+/.test(iSim))
    check('pin: the generic hunts never spend the till', (iSim.match(/d\.truckOnly\) continue/g) || []).length >= 2)
    check('pin: the child chase is till-gated, floor-gated, and outranks the toy box',
        /!k\.treat && s\.cone && s\.money >= CONE_PRICE && k\.needs\.fun < KID_ICE_FLOOR/.test(iSim)
        && iSim.indexOf('the ice-cream law') >= 0 && iSim.indexOf('the ice-cream law') < iSim.indexOf('// play: a bored child hunts'))
    check('pin: it rides the hash', /mix\(s\.iceDay\); mix\(s\.iceSerial\); mix\(s\.treats\)/.test(iSim) && /mix\(s\.cone \? 1 : 0\)/.test(iSim))
    check('pin: the sale refuses the cone', /it\.id === 'bin' \|\| it\.id === 'cone'/.test(iSim))
    check('pin: the shell voices the whole stop and the marquee teaches it',
        /case 'ice-truck'/.test(iJsx) && /case 'ice-cream'/.test(iJsx) && /case 'kid-ice'/.test(iJsx) && /case 'ice-gone'/.test(iJsx)
        && /THE ICE CREAM MAN COMES/.test(iJsx) && /THE TRUCK MOVED ON/.test(iJsx) && /CHASED THE TRUCK DOWN/.test(iJsx)
        && /ICE CREAM MAN PASSES EVERY AFTERNOON/.test(iJsx))
    check('pin: out-of-season taps answer honestly, and the marquee price is the till price',
        /DEF\[it\.id\]\.truckOnly/.test(iJsx) && /THE TILL IS SHORT OF/.test(iJsx) && /THE TRUCK IS NOT ON THE STREET/.test(iJsx)
        && CONE_PRICE === 2 && /\u00a7\$\{CONE_PRICE\}/.test(iJsx))
    check('pin: the jingle is a five-note music-box table', Array.isArray(ICE_TIMBRE) && ICE_TIMBRE.length === 5 && ICE_TIMBRE.every(([f, d, ms]) => f > 0 && d > 0 && ms >= 0))
    check('pin: the art ships the cone', /case 'cone'/.test(iArt))
    check('pin: the scenario ring ships — F1 cheat and dev hook', /RING TRUCK/.test(iJsx) && /ringTruck: \(\)/.test(iJsx))
    // #2508 item 1: the truck has a body now — view-only arrival/drive-off, sim law untouched
    check('pin: #2508 — the truck sprite ships with wheels, awning and a roof cone-sign',
        /export function drawIceTruck/.test(iArt) && /export const TRUCK_W/.test(iArt))
    check('pin: #2508 — it rolls in (~2 s) and drives off (~4 s), never appears or vanishes at the curb',
        /const ICE_TRUCK_IN_S = 2, ICE_TRUCK_OUT_S = 4/.test(iJsx)
        && /phase = 'in'/.test(iJsx) && /phase = 'parked'/.test(iJsx) && /phase = 'out'/.test(iJsx)
        && /drawIceTruck\(ctx, iceTruck\.px/.test(iJsx))
    check('pin: #2508 — every way the stop ends drives it off: sale, kid catch, window close, and the paint-tick backstop',
        (iJsx.match(/iceTruckRollOut\(s\)/g) || []).length === 3 && /iceTruckRollOut\(g\)/.test(iJsx))
    check('pin: #2508 — the truck is draw-only: the sim is untouched and the slide is QA-readable',
        iSim.indexOf('drawIceTruck') === -1 && /truckView: \{ phase:/.test(iJsx))
    // #2508 item 2: the call varies and swells — two ending bars on alternating
    // passes, per-note gain riding the truck's approach. Presentation only.
    const iceMotifEnd = ICE_TIMBRE[ICE_TIMBRE.length - 1][2] + ICE_TIMBRE[ICE_TIMBRE.length - 1][1] * 1000
    check('pin: #2508 item 2 — the call varies: two ending bars, each landing after the motif ends',
        Array.isArray(ICE_ENDINGS) && ICE_ENDINGS.length === 2
        && ICE_ENDINGS.every((bar) => bar.length >= 3 && bar.every(([f, d, ms]) => f > 0 && d > 0 && ms >= iceMotifEnd)))
    check('pin: #2508 item 2 — the ending alternates by pass parity off iceSerial, and QA can read which one rang',
        /iceTruck\.jingle = \(s\.iceSerial \+ 1\) % 2/.test(iJsx)
        && /ICE_ENDINGS\[iceTruck\.jingle === 'A' \? 0 : 1\]/.test(iJsx)
        && /jingle: iceTruck\.jingle/.test(iJsx))
    check('pin: #2508 item 2 — the volume swells with the approach: far < near and every jingle note rides iceVol',
        /const ICE_VOL_FAR = ([\d.]+), ICE_VOL_NEAR = ([\d.]+)/.test(iJsx) && Number(RegExp.$1) < Number(RegExp.$2)
        && (iJsx.match(/audioController\.playTone\(f, d, 'triangle', iceVol\(\)\)/g) || []).length === 2)
    check('pin: #2508 item 2 — presentation only: the swell lives in the shell, the sim ships no audio',
        iSim.indexOf('iceVol') === -1 && iSim.indexOf('ICE_VOL') === -1 && iSim.indexOf('audioController') === -1)
    check('pin: #2508 item 2 — a sim restart mid-roll never flings the truck west: rewound clocks finish the slide (both animators)',
        (iJsx.match(/if \(!\(k >= 0\)\) k = 1/g) || []).length === 2)

    // #2508 item 3: the eat beat — the cone rides home in the buyer's hand.
    // View-only: a world-clock countdown on the holder, two arithmetic drip
    // ticks, paint in both painters. No sim rule joins the party.
    check('#2508 item 3 — both sales arm the hold: adult at the curb, kid at the catch',
        armHeld2 === ICE_HOLD_T && kidArmHeld === ICE_HOLD_T, `adult ${armHeld2}, kid ${kidArmHeld}`)
    check('#2508 item 3 — the hold is a visible beat, not a blink',
        ICE_HOLD_T >= 8 && ICE_HOLD_T <= 20 && ICE_DRIPS === 2)
    check('#2508 item 3 — the drip math is arithmetic: none at the arm, one by mid-hold, both by the end',
        coneDripCount(ICE_HOLD_T) === 0 && coneDripCount(ICE_HOLD_T / 2) === 1 && coneDripCount(0) === ICE_DRIPS)
    let dripEv = 0
    for (let i = 0; i < Math.round((ICE_HOLD_T + 0.6) / DT); i++) {
        advance(s2, DT); keepAlive(s2)
        dripEv += drain(s2).filter((e) => e.t === 'ice-drip').length
    }
    check('#2508 item 3 — the hold empties on the world clock and every drip tick spoke exactly once',
        s2.people[0].coneHold === 0 && s2.people[0].coneDrips === ICE_DRIPS && dripEv === ICE_DRIPS,
        `hold ${s2.people[0].coneHold}, drips ${s2.people[0].coneDrips}, events ${dripEv}`)
    check('#2508 item 3 — the beat pays no rule: no second sale off the same cone', s2.treats === 1)
    const sH = newRun(53)
    const hH = stateHash(sH)
    sH.people[0].coneHold = ICE_HOLD_T; sH.people[0].coneDrips = 1
    check('#2508 item 3 — view-only: the hold rides no hash', stateHash(sH) === hH)
    const dH1 = newRun(54), dH2 = newRun(54)
    for (const r of [dH1, dH2]) { ringTruck(r); advance(r, DT); cmdUse(r, r.people[0], r.cone) }
    let dH1n = 0, dH2n = 0
    for (let i = 0; i < Math.round(ICE_HOLD_T * 2 / DT); i++) {
        advance(dH1, DT); keepAlive(dH1); dH1n += drain(dH1).filter((e) => e.t === 'ice-drip').length
        advance(dH2, DT); keepAlive(dH2); dH2n += drain(dH2).filter((e) => e.t === 'ice-drip').length
    }
    check('#2508 item 3 — the same seed holds the same cone: identical hashes, identical drips',
        dH1n === ICE_DRIPS && dH1n === dH2n && stateHash(dH1) === stateHash(dH2), `drips ${dH1n}/${dH2n}`)
    const holdBodyH = iSim.match(/function holdConeTick\(s, e, dt\) \{[\s\S]*?\n\}/)?.[0] || 'MISSING'
    check('pin: #2508 item 3 — the hold ticks on the world clock in both loops, and its drip voice draws no rng',
        /holdConeTick\(s, p, simDt\)/.test(iSim) && /holdConeTick\(s, k, dt\)/.test(iSim)
        && holdBodyH !== 'MISSING' && !/s\.rng\(\)|pick\(s,/.test(holdBodyH)
        && !/mix\(.*coneHold/.test(iSim))
    check('pin: #2508 item 3 — the art ships the held cone and paints it in both painters',
        /export function drawHeldCone/.test(iArt) && (iArt.match(/drawHeldCone\(ctx/g) || []).length === 3
        && /p\.coneHold > 0\) drawHeldCone/.test(iArt))
    check('pin: #2508 item 3 — the shell voices the drip and QA can read the hold',
        /case 'ice-drip'/.test(iJsx) && /heldTreats:/.test(iJsx))
}

// ---------------------------------------------- SNEAK IN THE NIGHT (#2520) ----
section('SNEAK IN THE NIGHT (#2520): odd nights the ornaments are at risk, and the alarm answers')
{
    const keepWarm = (g) => { for (const q of g.people) { q.faintT = 0; q.needs.hunger = Math.max(q.needs.hunger, 0.8); q.needs.energy = Math.max(q.needs.energy, 0.8); q.needs.bladder = Math.max(q.needs.bladder, 0.8) } }

    // the answer is purchasable, and the law reads the shelf
    check('the alarm is a card: §90, walkable, on the SPECIAL shelf',
        DEF.alarm && DEF.alarm.price === 90 && DEF.alarm.solid === false && !DEF.alarm.need
        && (CAT_TABS.find((t) => t.id === 'SPECIAL') || { ids: [] }).ids.includes('alarm'))

    // a fresh lot: no prowler, empty night ledger
    const s0 = newRun(41)
    check('a fresh lot has no sneak and an empty ledger',
        s0.sneak === null && s0.sneakNight === 0 && s0.scareDay === 0 && s0.sneakSerial === 0 && s0.lost === 0 && !hasAlarm(s0))

    // the parity is arithmetic off the day — Otto's own alternation, pure function
    check('odd nights due, even nights safe, forever',
        Array.from({ length: 30 }, (_, i) => sneakNightDue(i + 1)).every((d, i) => d === (i % 2 === 0)))

    // the organic visit: gate → door-step → verdict → gone, day 1 (odd), and NOTHING by day
    const s1 = newRun(42)
    let inEv = null, takeEv = null, emptyEv = null, goneEv = null, landHour = 0, dayAtIn = 0, gateOk = false, sawDaySneak = false, n = 0
    while (!goneEv && s1.day <= 2 && n++ < 60 * 60 * 12) {
        advance(s1, DT); keepWarm(s1)
        const ev = drain(s1)
        if (!inEv && ev.some((e) => e.t === 'sneak-in')) { inEv = true; landHour = s1.hour; dayAtIn = s1.day; gateOk = s1.sneak === null || (s1.sneak.r === 12 && s1.sneak.c === 5) }
        if (s1.sneak && s1.hour < SNEAK_DUE) sawDaySneak = true
        takeEv = takeEv || ev.find((e) => e.t === 'sneak-take') || null
        emptyEv = emptyEv || ev.find((e) => e.t === 'sneak-empty') || null
        goneEv = goneEv || ev.find((e) => e.t === 'sneak-gone') || null
    }
    check('the sneak crosses at 23:00 on odd nights only — never in daylight',
        !!inEv && dayAtIn === 1 && landHour >= SNEAK_DUE && landHour < SNEAK_DUE + SNEAK_WINDOW && !sawDaySneak, `${dayAtIn}@${landHour.toFixed(2)}h`)
    check('he enters at the honest gate cell and the visit ends in exactly one verdict',
        gateOk && (!!takeEv || !!emptyEv) && !(takeEv && emptyEv))
    check('he leaves clean — sprite and logic walk the same visit to the end',
        !!goneEv && s1.sneak === null && s1.lost === (takeEv ? 1 : 0) && s1.sneakNight === 1 && s1.sneakSerial === 1)

    // one sneak a night AND even nights pass untouched
    const s2 = newRun(43)
    let marks = { 1: 0, 2: 0 }, k = 0
    while (!(s2.day === 3) && k++ < 60 * 60 * 15) {
        advance(s2, DT); keepWarm(s2)
        const hits = drain(s2).filter((e) => e.t === 'sneak-in' || e.t === 'sneak-scared').length
        marks[s2.day] = (marks[s2.day] || 0) + hits
    }
    check('one visit a night, day 1 lands, day 2 (even) sleeps clean',
        marks[1] === 1 && marks[2] === 0 && s2.sneakSerial === 1, `d1 ${marks[1]}, d2 ${marks[2]}`)

    // the take is an ornament, never cash — and a bare lot gets an honest empty-handed note
    const s3 = newRun(44)
    s3.items.push({ uid: 800, id: 'plant', r: 6, c: 4 })
    ringSneak(s3)
    let took3 = null
    for (let i = 0; i < 60 * 60 && !took3; i++) { advance(s3, DT); keepWarm(s3); took3 = drain(s3).find((e) => e.t === 'sneak-take') || null }
    check('a loose fern is the prize — the take names the ornament, never cash',
        !!took3 && took3.id === 'plant' && SNEAK_LOOT.includes(took3.id) && s3.lost === 1
        && !s3.items.some((it) => it.id === 'plant'))
    s3.items = s3.items.filter((it) => !SNEAK_LOOT.includes(it.id))
    ringSneak(s3)
    let empty3 = null
    for (let i = 0; i < 60 * 60 && !empty3; i++) { advance(s3, DT); keepWarm(s3); empty3 = drain(s3).find((e) => e.t === 'sneak-empty') || null }
    check('a bare lot still gets the call — nothing loose, nothing lifted, the note is honest',
        !!empty3 && s3.lost === 1)

    // the answer: a placed alarm turns him at the gate post — foot never lands
    const s4 = newRun(45)
    s4.items.push({ uid: 900, id: 'alarm', r: 2, c: 2 })
    let scare = null, moneyBefore = s4.money, ever = false
    while (!scare && s4.day <= 1 && n++ < 60 * 60 * 20) {
        advance(s4, DT); keepWarm(s4)
        if (s4.sneak) ever = true
        scare = drain(s4).find((e) => e.t === 'sneak-scared') || null
    }
    check('with the tin standing he never sets foot past the gate — scared, stamped, safe',
        !!scare && !ever && s4.money === moneyBefore && s4.lost === 0 && s4.scareDay === 1 && s4.sneakNight === 1)
    check('the rig bypasses parity (harness needs a prowler on demand) but never the alarm',
        ringSneak(s4) !== undefined && (() => { drain(s4); for (let i = 0; i < 600 && !s4.sneak; i++) { advance(s4, DT); if (drain(s4).some((e) => e.t === 'sneak-scared')) return true } return false })())

    // midnight retires whoever is still on the lot
    const s5 = newRun(46)
    s5.hour = 23.55
    ringSneak(s5); advance(s5, DT)
    check('a rigged late visit may stand', !!s5.sneak)
    runFor(s5, 3)   // 3 real seconds crosses midnight at 5 s per sim-hour
    check('midnight sends him home — nothing prowls into tomorrow', s5.day === 2 && s5.sneak === null)

    // the night's ledger rides the hash
    const s6 = newRun(47)
    const hPre = stateHash(s6)
    s6.sneakNight += 1; check('the night stamp rides the hash', stateHash(s6) !== hPre); s6.sneakNight -= 1
    s6.scareDay += 1; check('the scare stamp rides the hash', stateHash(s6) !== hPre); s6.scareDay -= 1
    s6.lost += 1; check('the loot ledger rides the hash', stateHash(s6) !== hPre); s6.lost -= 1
    s6.sneakSerial += 1; check('the visit serial rides the hash', stateHash(s6) !== hPre); s6.sneakSerial -= 1
    ringSneak(s6); advance(s6, DT)
    check('the prowler on the lot is state', stateHash(s6) !== hPre)

    // determinism: the whole twelve-night run, twice
    const twin = () => { const g = newRun(4200); for (let i = 0; i < 60 * 60 * 12 * 6; i++) { advance(g, DT); keepWarm(g); if (g.done) break } return stateHash(g) }
    check('twelve nights, twice, one hash — the parity law consumes no rng', twin() === twin())

    // the win economy is untouched: the wish still lands with the night at risk
    const w = play(1)
    check('the lifetime wish still lands with the sneak on the payroll', w.done === 'win')

    // source pins — the wiring must not silently drop
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const sBody = pSim.match(/function updateSneak\(s, dt\) \{[\s\S]*?\n\}/)?.[0] || 'MISSING'
    check('pin: the clock\u2019s own paths draw no rng (the #2303 lesson)', sBody !== 'MISSING' && !/s\.rng\(\)|pick\(s,/.test(sBody) && /updateSneak\(s, dt\)/.test(pSim))
    check('pin: one night is the law in the source too', /s\.sneakNight === s\.day/.test(pSim) && /s\.sneakNight = s\.day/.test(pSim))
    check('pin: the sneak section never touches the till — the law is decor-only', !/s\.money/.test(sBody) && /SNEAK_LOOT\.includes\(it\.id\)/.test(sBody))
    check('pin: the source states the law in plain words', /SNEAK_LOOT = \['plant', 'rug', 'lamp'\]/.test(pSim) && /HE FOUND NOTHING TO TAKE|nothing loose/.test(pJsx + pSim))
    check('pin: the alarm gate reads the shelf once, honestly', /export function hasAlarm/.test(pSim) && /if \(hasAlarm\(s\)\)/.test(sBody))
    check('pin: midnight retires the prowler', /if \(s\.sneak\) \{ s\.sneak = null; s\.events\.push\(\{ t: 'sneak-gone' \}\) \}/.test(pSim))
    check('pin: the shell voices the whole visit and the marquee teaches it',
        /case 'sneak-in'/.test(pJsx) && /case 'sneak-take'/.test(pJsx) && /case 'sneak-scared'/.test(pJsx) && /case 'sneak-gone'/.test(pJsx)
        && /THE SNEAK TOOK/.test(pJsx) && /THE ALARM SCARES HIM OFF/.test(pJsx) && /SOMEONE IS ON THE LOT/.test(pJsx)
        && /THE SNEAK WALKS ODD NIGHTS AT ELEVEN/.test(pJsx))
    check('pin: the art ships the tin and the fedora', /case 'alarm'/.test(pArt) && /p\.sneak/.test(pArt))
    check('pin: the scenario rig ships — F1 cheat and dev hook', /RING SNEAK/.test(pJsx) && /ringSneak: \(\)/.test(pJsx))
    check('pin: he rides the depth line like every visitor here', /\.\.\.\(g\.sneak \? \[\{ p: g\.sneak, v: g\.sneak\.y \}\] : \[\]\)/.test(pJsx))
}

// ------------------------------------------------ EVEN-NIGHT PROWL (#2532) ----
section('EVEN-NIGHT PROWL (#2532): even 23:00s the flap opens, midnight calls her in')
{
    const keepWarm = (g) => { for (const q of g.people) { q.faintT = 0; q.needs.hunger = Math.max(q.needs.hunger, 0.8); q.needs.energy = Math.max(q.needs.energy, 0.8); q.needs.bladder = Math.max(q.needs.bladder, 0.8) } }

    // the windows are constants, and the pay is cat-scale
    check('prowl keeps the same unkind hour and one watched window', PROWL_DUE === 23 && PROWL_WINDOW === 1)
    check('the pay is fun, cat-scale, and nothing else is even importable as a till word', PET_PROWL_FUN > 0 && PET_PROWL_FUN <= 0.5)

    // parity is arithmetic off the day — and complementary to the sneak forever
    check('even nights due, odd nights quiet, forever',
        Array.from({ length: 30 }, (_, i) => prowlNightDue(i + 1)).every((d, i) => d === ((i + 1) % 2 === 0)))
    check('the two parities never share a dark — exactly one night-watch a night, forever',
        Array.from({ length: 60 }, (_, i) => sneakNightDue(i + 1) !== prowlNightDue(i + 1)).every(Boolean))

    // a lot without Miso: fresh fields, a refusal in words, and honest silence
    const s0 = newRun(41)
    check('a fresh lot has no cat and an empty prowl ledger',
        s0.pet === null && s0.prowl === null && s0.prowlNight === 0 && s0.prowlSerial === 0)
    const refuse0 = ringProwl(s0)
    let quiet0 = 0
    for (let i = 0; i < 60 * 60 * 6; i++) { advance(s0, DT); keepWarm(s0); quiet0 += drain(s0).filter((e) => e.t === 'prowl-out' || e.t === 'prowl-home').length }
    check('no cat, no call — the rig refuses in words and five nights stay silent',
        /no cat/.test(String(refuse0)) && quiet0 === 0 && s0.prowlNow === null && s0.prowlNight === 0, String(refuse0))

    // the organic due night: quiet day 1 (odd), slip-out day 2 (even), the walk
    // moves her own feet, midnight calls her in on the same night she started
    const s1 = newRun(42)
    check('the counter sells Miso to the nightly lot', adoptPet(s1) === true && !!s1.pet)
    const money1 = s1.money
    let out1 = null, home1 = null, lost1 = 0, n1 = 0, outCell = null, funAtOut = null, moved1 = false, dayAtOut = 0, outHour = 0
    while (!home1 && s1.day <= 3 && n1++ < 60 * 60 * 20) {
        advance(s1, DT); keepWarm(s1)
        const ev = drain(s1)
        if (!out1 && ev.some((e) => e.t === 'prowl-out')) { out1 = true; outCell = [s1.pet.r, s1.pet.c]; funAtOut = s1.pet.needs.fun; dayAtOut = s1.day; outHour = s1.hour; s1.pet.needs.fun = 0.3 }   // headroom, so the pay is measurable
        if (out1 && !moved1 && s1.prowl && (s1.pet.r !== outCell[0] || s1.pet.c !== outCell[1])) moved1 = true
        home1 = home1 || ev.find((e) => e.t === 'prowl-home') || null
        lost1 += ev.filter((e) => e.t === 'sneak-take').length
    }
    check('odd day 1 sleeps clean; the slip-out lands on even day 2 at eleven',
        !!out1 && dayAtOut === 2 && outHour >= PROWL_DUE && outHour < PROWL_DUE + PROWL_WINDOW, `d${dayAtOut}@${outHour.toFixed(2)}h`)
    check('her own feet carry the prowl — the sprite walks the BFS, then retires clean', moved1 && s1.prowl === null)
    check('midnight calls her in on the same night she left — stamp, serial, clean retire',
        !!home1 && s1.prowl === null && s1.prowlNight === 2 && s1.prowlSerial === 1)
    check('the prowl pays purrs, never pennies — fun up, the till untouched',
        s1.pet.needs.fun >= 0.3 + PET_PROWL_FUN - 0.15 && s1.money === money1 && s1.lost === lost1, `fun ${s1.pet.needs.fun.toFixed(2)}`)

    // one prowl a night for four nights, and the lot proves the complement on ice:
    // a sneak-in and a prowl-out never land on the same dark
    const s2 = newRun(43)
    adoptPet(s2)
    const pMarks = {}, sMarks = {}
    let k2 = 0
    while (s2.day <= 4 && k2++ < 60 * 60 * 15) {
        advance(s2, DT); keepWarm(s2)
        const ev = drain(s2)
        const d = s2.day
        pMarks[d] = (pMarks[d] || 0) + ev.filter((e) => e.t === 'prowl-out').length
        sMarks[d] = (sMarks[d] || 0) + ev.filter((e) => e.t === 'sneak-in' || e.t === 'sneak-scared').length
    }
    check('the cat keeps the evens: d1 quiet, d2 one, d3 quiet, d4 one',
        (pMarks[1] || 0) === 0 && (pMarks[2] || 0) === 1 && (pMarks[3] || 0) === 0 && (pMarks[4] || 0) === 1 && s2.prowlSerial === 2,
        JSON.stringify(pMarks))
    check('cross-check on one lot: no dark ever hosts both boots and paws',
        [1, 2, 3, 4].every((d) => !((sMarks[d] || 0) > 0 && (pMarks[d] || 0) > 0)) && (sMarks[1] || 0) === 1 && (sMarks[3] || 0) === 1,
        JSON.stringify(sMarks))

    // the rig bypasses parity on demand but still stamps — and the walk cannot outlive midnight
    const s3 = newRun(44)
    adoptPet(s3)
    const why3 = ringProwl(s3)
    let k3 = 0
    while (!s3.prowl && k3++ < 600) { advance(s3, DT); keepWarm(s3); drain(s3) }
    check('the rig opens the flap on an odd night (harness needs eyes on the lawn) and stamps the night',
        /flap swings open/.test(String(why3)) && !!s3.prowl && s3.prowlNight === s3.day && s3.prowlSerial === 1, String(why3))
    let home3 = null, k3b = 0
    while (!home3 && k3b++ < 60 * 60 * 8) { advance(s3, DT); keepWarm(s3); home3 = drain(s3).find((e) => e.t === 'prowl-home') || null }
    check('rung at breakfast she walks the whole errand home on her own paws — same day, both legs',
        !!home3 && s3.prowl === null && s3.day === 1 && s3.prowlNight === 1 && s3.prowlSerial === 1, `d${s3.day}@${s3.hour.toFixed(1)}h`)
    // and a late re-ring minutes before midnight cannot outrun the send-home
    s3.hour = 23.5
    ringProwl(s3)
    let home3b = null, k3c = 0
    while (!home3b && k3c++ < 60 * 60 * 2) { advance(s3, DT); keepWarm(s3); home3b = drain(s3).find((e) => e.t === 'prowl-home') || null }
    check('whatever hour the flap opens, midnight still calls her in — nothing prowls into tomorrow',
        !!home3b && s3.prowl === null && s3.day === 2 && s3.prowlSerial === 2)

    // the ledger rides the hash, live prowl included
    const s6 = newRun(47)
    adoptPet(s6)
    const hPre = stateHash(s6)
    s6.prowlNight += 1; check('the prowl night stamp rides the hash', stateHash(s6) !== hPre); s6.prowlNight -= 1
    s6.prowlSerial += 1; check('the prowl serial rides the hash', stateHash(s6) !== hPre); s6.prowlSerial -= 1
    ringProwl(s6)
    let k6 = 0
    while (!s6.prowl && k6++ < 600) { advance(s6, DT); keepWarm(s6); drain(s6) }
    check('the cat on the prowl is state', stateHash(s6) !== hPre && !!s6.prowl)

    // determinism: six nights with a cat, twice, one hash — the parity law consumes no rng
    const twin = () => { const g = newRun(4201); adoptPet(g); for (let i = 0; i < 60 * 60 * 12 && g.day <= 6; i++) { advance(g, DT); keepWarm(g); drain(g) } return stateHash(g) }
    check('six nights, twice, one hash — the prowl law draws no rng', twin() === twin())

    // the win economy is untouched: the wish still lands with the cat on the payroll
    const w = play(1)
    check('the lifetime wish still lands with the prowl on the payroll', w.done === 'win')

    // source pins — the wiring must not silently drop
    const pSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const pArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const wBody = pSim.match(/function updateProwl\(s, dt\) \{[\s\S]*?\n\}/)?.[0] || 'MISSING'
    const fBody = pSim.match(/function finishProwl\(s\) \{[\s\S]*?\n\}/)?.[0] || 'MISSING'
    check('pin: the clock\u2019s own paths draw no rng (the #2303 lesson)', wBody !== 'MISSING' && !/s\.rng\(\)|pick\(s,/.test(wBody) && /updateProwl\(s, simDt\)/.test(pSim))
    check('pin: parity is arithmetic off the day, in the source too', /prowlNightDue = \(day\) => day % 2 === 0/.test(pSim))
    check('pin: one night is the law in the source too', /s\.prowlNight === s\.day/.test(wBody) && /s\.prowlNight = s\.day/.test(wBody))
    check('pin: neither prowl function ever touches the till — the law is purrs-only', wBody !== 'MISSING' && fBody !== 'MISSING' && !/s\.money|s\.lost/.test(wBody + fBody) && /p\.needs\.fun = Math\.min\(1, p\.needs\.fun \+ PET_PROWL_FUN\)/.test(fBody))
    check('pin: midnight retires the cat, and the loaf waits while she walks', /if \(s\.prowl\) finishProwl\(s\)/.test(pSim) && /if \(night && s\.prowl\) return/.test(pSim))
    check('pin: the wake-and-slip — a sleeping Miso is woken for a due night', /if \(p\.asleep\) \{ p\.asleep = false; p\.stretchT = 0\.9 \}/.test(wBody))
    check('pin: the shell voices both ends of the walk and the marquee teaches the parity',
        /case 'prowl-out'/.test(pJsx) && /case 'prowl-home'/.test(pJsx)
        && /MISO IS OUT ON THE LOT/.test(pJsx) && /MISO IS HOME FOR THE NIGHT/.test(pJsx)
        && /MISO PROWLS EVEN NIGHTS AT ELEVEN/.test(pJsx) && /prowl pays purrs, never pennies/.test(pJsx))
    check('pin: the night-eyes are view-only art riding the prowl flag', /if \(prowl\)/.test(pArt) && /#ffb347/.test(pArt) && /drawPet\(ctx, o\.p, g\.sec, !!g\.prowl\)/.test(pJsx))
    check('pin: the drive reads the walk — hook state and ledger', /prowl: gs\.prowl/.test(pJsx) && /prowlLedger/.test(pJsx))
    check('pin: the scenario rig ships — F1 cheat, dev hook, and a refusal in words', /RING PROWL/.test(pJsx) && /ringProwl: \(\)/.test(pJsx) && /no cat on the lot/.test(pSim))
    check('pin: the sound tables hold — three soft pads out, a two-note lift home',
        Array.isArray(PROWL_PADS) && PROWL_PADS.length === 3 && PROWL_PADS.every(([f, d, ms]) => f > 0 && d > 0 && ms >= 0)
        && Array.isArray(PROWL_HOME_SFX) && PROWL_HOME_SFX.length === 2 && PROWL_HOME_SFX.every(([f, d, ms]) => f > 0 && d > 0 && ms >= 0))
}

// ---------------------------------------------------------- FEEL PASS (#2688) ----
// #2688 tails 2 & 6 + the wings handoff 3 — all view-only: the promise ring
// tightens as the errand nears, gold dots walk the remaining route, a folded
// errand's ring dies grey, the promised ear winks its hue when the walker is
// close, and the garden's potting bench keeps a lamp after dusk. sim.js must
// not learn any of these words — the economy is #2683/#2689's, untouched.
section('FEEL PASS (#2688): tightening ring, marching trail, hue wink, grey death ring, garden night lamp')
{
    const fpSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const fpJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const fpArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')

    // the divided lot (the #2683 rig shape): Fern hangs by the sofa, the
    // commanded resident stands at the gate — a nine-tile promise.
    const divide = (seed) => {
        const g = newRun(seed)
        g.visitAfter = 99; g.ivyAfter = 99
        if (!g.visitor) g.visitor = { name: 'Fern' }
        const v = g.visitor
        v.r = 3; v.c = 5; v.x = tileX(5) + TILE / 2; v.y = tileY(3) + TILE / 2
        v.path = null; v.state = 'hang'; v.t = 0; v.hue = '#4fae5f'; v.face = 1; v.walkPhase = 0; v.chatT = 0; v.hangUntil = 9999; v.neighT = 0
        const p = g.people[0]
        p.r = 12; p.c = 5; p.x = tileX(5) + TILE / 2; p.y = tileY(12) + TILE / 2
        p.path = null; p.goal = null; p.use = null; p.queue.length = 0; p.owner = null; p.working = false; p.faintT = 0
        g.active = 0; g.cmdCd = 0; g.holdT = -1; g.courtPick = null
        return g
    }

    const g = divide(7)
    check('no errand, no tell — the lot reads clean before the tap', promiseTell(g) === null && earReact(g) === null)
    check('the far tap issues the errand', cmdGoSay(g, g.people[0], 'fern') === true)
    const t0 = promiseTell(g)
    check('a live promise tells: nine tiles out, the ring is at its widest', t0 && t0.d === 9 && t0.tight === 0)
    check('the promised ear wears her dress colour', t0 && t0.hue === EAR_HUES.fern && EAR_HUES.fern === PAIR_HUES[0])
    let prevT = -1; let mono = true
    for (const d of [8, 7, 6, 4, 2, 1, 0]) {
        g.people[0].r = 3 + d
        const tt = promiseTell(g)
        if (!tt || !(tt.tight > prevT)) mono = false
        prevT = tt ? tt.tight : prevT
    }
    check('the ring closes as the errand nears — tight climbs at every step inside PROMISE_TIGHTEN', mono && prevT === 1)
    g.people[0].r = 3 + EAR_REACT
    const ear4 = earReact(g)
    check('the ear knows at exactly EAR_REACT tiles — it winks in her hue', ear4 && ear4.hue === EAR_HUES.fern && ear4.x === g.visitor.x && ear4.y === g.visitor.y)
    g.people[0].r = 3 + EAR_REACT + 1
    check('one tile further and the wink waits — the reaction has a range', earReact(g) === null && promiseTell(g) !== null)

    const g2 = divide(8)
    cmdGoSay(g2, g2.people[0], 'fern')
    const trail = promiseTell(g2).trail
    check('dots have a route to walk — the trail is the errand\u2019s remaining path', Array.isArray(trail) && trail.length > 0 && trail.length === g2.people[0].path.length)
    check('the trail fades along the route, walker end bright to the door', trail[0].k === 0 && trail[trail.length - 1].k === 1 && trail[1].k > trail[0].k)
    g2.people[0].goal = null
    check('a delivered or dropped errand trails nothing', promiseTell(g2) === null)
    g2.people[0].goal = { kind: 'gosay', k: 'fern', tries: 0 }
    g2.visitor.state = 'leaving'
    check('the promise rides with the ear — a leaving Fern silences every tell', promiseTell(g2) === null && earReact(g2) === null)

    const g3 = divide(9)
    g3.ivyAfter = 99
    if (!g3.ivy) g3.ivy = { name: 'Ivy', gift: false }
    const iv = g3.ivy
    iv.r = 3; iv.c = 7; iv.x = tileX(7) + TILE / 2; iv.y = tileY(3) + TILE / 2
    iv.path = null; iv.state = 'hang'; iv.t = 0; iv.hue = '#a3579b'; iv.face = 1; iv.walkPhase = 0; iv.claim = null
    cmdGoSay(g3, g3.people[0], 'ivy')
    g3.people[0].r = 5; g3.people[0].c = 7
    check('the second guest answers in plum — the wink is the pair idiom scaled to one ear', promiseTell(g3).hue === PAIR_HUES[1] && earReact(g3).hue === PAIR_HUES[1])

    // garden lamp: a lot's own geometry + the one night curve decide it
    const h = newRun(11); h.hour = 21
    check('day one, no wings, no lamp — the pool belongs to the garden at night', gardenLamp(h) === null)
    h.ext = 1; h.wings = [{ id: 'east', r0: 2 }]
    check('the east wing alone stays furniture-dark — the handoff names the garden', gardenLamp(h) === null)
    h.wings = [{ id: 'east', r0: 2 }, { id: 'garden' }]
    const lamp = gardenLamp(h)
    check('the garden stands and dusk falls — the bench gets its pool', lamp !== null && GARDEN.floor.some(([r, c]) => r === lamp.r && c === lamp.c))
    h.hour = 12
    check('dawn puts the lamp out', gardenLamp(h) === null)
    h.hour = 20
    check('the lamp keeps the panes\u2019 own dusk floor (nightLevel > 0.2)', gardenLamp(h) === null && nightLevel(20) <= 0.2 && nightLevel(21) > 0.2)

    // pins — the wiring, the paint, and the sim's silence
    check('pin: the view pass stays out of the sim — the economy never heard of these tells',
        !/promiseTell|earReact|gardenLamp|EAR_REACT|PROMISE_TIGHTEN|EAR_HUES|LOST_RING|lostRing/.test(fpSim))
    check('pin: the ring radius and stroke ride the tighten factor (no drift)',
        /15 - 5 \* pt\.tight/.test(fpJsx) && /5\.5 - 1\.5 \* pt\.tight/.test(fpJsx) && /ctx\.lineWidth = 1\.5 \+ pt\.tight/.test(fpJsx))
    check('pin: the dots march — one cell in three lights, the lit set advances with the clock',
        /Math\.floor\(g\.sec \* 6\)/.test(fpJsx) && /% 3\) continue/.test(fpJsx) && /0\.55 - tc\.k \* 0\.35/.test(fpJsx))
    check('pin: the wink paints in the derivation\u2019s hue, pulsing on the real clock',
        /earReact\(g\)/.test(fpJsx) && /ctx\.fillStyle = er\.hue/.test(fpJsx) && /0\.4 \+ 0\.4 \* Math\.sin\(g\.sec \* 7\)/.test(fpJsx))
    check('pin: the death ring arms at the fold, flickers grey, decays on the real clock, and never crosses streets',
        /e\.stage === 'lost'[\s\S]{0,460}lostRing\.t = LOST_RING_T/.test(fpJsx)
        && /lostRing\.t \/ LOST_RING_T/.test(fpJsx) && /Math\.sin\(g\.sec \* 16\)/.test(fpJsx)
        && /'#9aa0a8'/.test(fpJsx)
        && /lostRing\.t = Math\.max\(0, lostRing\.t - dtMs \/ 1000\)/.test(fpJsx) && /lostRing\.t = 0/.test(fpJsx))
    check('pin: the hue table derives from PAIR_HUES — guests wear their dresses, Pip her star',
        /fern: PAIR_HUES\[0\], ivy: PAIR_HUES\[1\], kid: '#ffd24a'/.test(fpArt))
    check('pin: the lamp paints from its own derivation and the one night curve, lit right after the tint',
        /const l = gardenLamp\(s\)/.test(fpArt) && /nightLevel\(s\.hour\)/.test(fpArt)
        && /nightTint\(ctx, g\.hour, g\.ext, g\.wings, sleepingCells\(g\)\)[^\n]*\n\s*drawGardenLamp\(ctx, g\)/.test(fpJsx))   // #2705: the tint call gained the sleepers arg — lamp still rides right after it
    check('pin: the tight range names both ends — react inside, tighten outside',
        EAR_REACT === 4 && PROMISE_TIGHTEN === 8 && LOST_RING_T > 0)
}

section('POLISH 3 (#2704): the walking word wears legs; the garden arrives worked')
{
    const plArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const plSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const plJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('the gosay chip derives its own glyph — the walk-over no longer hides behind the seated chat glyph',
        /id === 'gosay'\) return 'gosay'/.test(plArt) && /case 'gosay'/.test(plArt))
    check('the leg-glyph paints a bubble AND two striding legs (one shorter — mid-step)',
        /case 'gosay':[\s\S]{0,500}ctx\.fillRect\(x - 4, y - 5\.5, 8, 5\.5\)[\s\S]{0,200}ctx\.fillRect\(x - 3, y \+ 0\.5, 1\.6, 3\.5\)[\s\S]{0,200}ctx\.fillRect\(x \+ 1\.4, y \+ 0\.5, 1\.6, 2\.4\)/.test(plArt))
    check('the chip sounds like the errand: chat pair + one step; the SEATED chat timbre untouched',
        /gosay: \[\[740, 0\.04, 0\], \[988, 0\.05, 50\], \[460, 0\.035, 110\]\]/.test(plSim)
        && /chat: \[\[740, 0\.04, 0\], \[988, 0\.05, 50\]\]/.test(plSim))
    check('the garden bake arrives with a crate and a watering can at the bench\u2019s south end',
        /#2704 tail 6[\s\S]{0,500}crate[\s\S]{0,700}watering can/.test(plArt)
        && /g\.fillStyle = '#8a6134'; g\.fillRect\(x \+ 5, y \+ 7, 12, 10\)/.test(plArt)
        && /g\.fillStyle = '#4a7a8c'; g\.fillRect\(x2 \+ 6, y \+ 9, 9, 7\)/.test(plArt))
    check('the props are baked INSIDE the garden branch only — the east wing stays as it shipped',
        /if \(geom\.id === 'east'\)[\s\S]*?#2704 tail 6[\s\S]*?wingLayers\.set\(key, cv\)/.test(plArt))
    check('draw-only doctrine: the paint lives only in art.js and the garden geometry is byte-untouched (#2689 site stands)',
        plArt.includes('x2 + 6, y + 9, 9, 7') && !plSim.includes('x2 + 6, y + 9, 9, 7')
        && JSON.stringify(GARDEN.floor) === JSON.stringify([[9, 0], [9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]])
        && GARDEN.door[0] === 8 && GARDEN.door[1] === 2)
    check('the kit card previews its wing BEFORE the pick — hover feeds the same ghost painter, mouse-only (#2704 tail 5)',
        /let kitPreview = null/.test(plJsx) &&
        /if \(hi >= 0 && CATALOG\[hi\] && CATALOG\[hi\]\.room\) kitPreview = gs\.ext >= 1 \? GARDEN : eastWing\(DEFAULT_ANCHOR\)/.test(plJsx) &&
        /else if \(kitPreview\) drawWingGhost\(ctx, kitPreview, buildRoomOk\(g, kitPreview\)\)/.test(plJsx))
    check('the preview can never outrank the hand: it paints only while NO kit is selected, and a mouse leaving the lot puts it out',
        /else if \(kitPreview\)/.test(plJsx) &&
        /mouseHover = null; kitPreview = null; return/.test(plJsx) &&
        /kitPreview = null\n/.test(plJsx.replace(/\r/g, '')))
}

section('POLISH PASS (#2705): ripeness ramp on the bed, harvest hamper at the door, lodged panes, moonlit wait')
{
    const pvArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    const pvSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const pvJsx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')

    const pvLot = (seed) => { const g = newRun(seed); g.money = 9999; buildRoom(g, eastWing(DEFAULT_ANCHOR)); buildRoom(g, GARDEN); drain(g); return g }
    const FLOOR = [...wingSets(wingGeom(eastWing(DEFAULT_ANCHOR))).floor][0].split(',').map(Number)

    check('ripeness ramps the sun-law ledger exactly — and only the garden tends',
        ripenessOf({ id: 'garden', tend: 0 }) === 0
        && ripenessOf({ id: 'garden', tend: TEND_HOURS / 2 }) === 0.5
        && ripenessOf({ id: 'garden', tend: TEND_HOURS }) === 1
        && ripenessOf({ id: 'garden', tend: TEND_HOURS * 3 }) === 1
        && ripenessOf({ id: 'east', r0: 2, sleptWell: 4 }) === 0 && ripenessOf(null) === 0)

    const g = pvLot(7)
    const wg = g.wings.find((w) => w.id === 'garden')
    check('no harvest, no hamper — the door stands empty until the room pays', hamperLoad(g) === null)
    wg.herbs = 2
    const h2 = hamperLoad(g)
    check('the hamper carries what the garden paid, at the garden door (9,2)', h2 && h2.n === 2 && h2.r === 9 && h2.c === 2)
    wg.herbs = 9
    check('the sprite caps; the ledger keeps counting', hamperLoad(g).n === HAMPER_CAP && HAMPER_CAP === 4 && wg.herbs === 9)
    wg.herbs = 0
    const gE = newRun(7); gE.money = 9999; buildRoom(gE, eastWing(DEFAULT_ANCHOR))
    check('an east-only lot ships no hamper', hamperLoad(gE) === null)

    const p0 = g.people[0]
    p0.use = { it: null, def: DEF.canopy, t: 0, dur: 999, night: true }
    p0.r = FLOOR[0]; p0.c = FLOOR[1]
    const slp = sleepingCells(g)
    check('sleepers are the lodging law\u2019s own — through-the-night sleepers only', slp.length === 1 && slp[0].r === FLOOR[0] && slp[0].c === FLOOR[1])
    p0.use.night = false
    check('a midday nap never lodges — the panes stay honest', sleepingCells(g).length === 0)
    p0.use.night = true
    const eastG = wingGeom(eastWing(DEFAULT_ANCHOR)), garG = wingGeom(GARDEN)
    check('the lodged room is found by its OWN floor — east yes, garden never', wingLodged(eastG, slp) && !wingLodged(garG, slp))
    p0.r = 3; p0.c = 5
    check('a house-bed sleeper lodges no wing', !wingLodged(eastG, sleepingCells(g)) && !wingLodged(garG, sleepingCells(g)))
    p0.use = null

    const gm = pvLot(8)
    const wgm = gm.wings.find((w) => w.id === 'garden')
    gm.hour = 23; wgm.tend = TEND_HOURS / 2
    check('the moonlit wait reads at dusk with a half-ripe bed', moonlitWait(gm) === true)
    gm.hour = 12
    check('by day the wait goes silent — the gold creep is the day\u2019s tell', moonlitWait(gm) === false)
    gm.hour = 23; wgm.tend = 0
    check('an empty bed waits for nothing', moonlitWait(gm) === false)
    wgm.tend = TEND_HOURS
    check('a full bed is past waiting', moonlitWait(gm) === false)
    const gNg = newRun(8); gNg.hour = 23
    check('no garden, no wait', moonlitWait(gNg) === false)

    const gh = pvLot(9)
    const wgh = gh.wings.find((w) => w.id === 'garden'); wgh.herbs = 3; wgh.tend = TEND_HOURS / 2; gh.hour = 23
    const hBefore = stateHash(gh)
    ripenessOf(wgh); hamperLoad(gh); sleepingCells(gh); moonlitWait(gh)
    wingLodged(garG, sleepingCells(gh))
    check('probing every tell leaves the world byte-identical — the hash never hears of the view', stateHash(gh) === hBefore)

    check('draw-only doctrine: sim.js never learns a word of the view pass',
        !/ripenessOf|hamperLoad|moonlitWait|wingLodged|sleepingCells|drawPurposeView|drawMoonlitWait|HAMPER_CAP/.test(pvSim))
    check('the view draws no clock of its own — no rng, no Date, no wall-time in the #2705 block', (() => {
        const block = pvArt.slice(pvArt.indexOf('#2705 purpose view pass'), pvArt.indexOf('HUD ----'))
        return block.length > 500 && !/Math\.random|Date\.now|performance\.now/.test(block)
    })())
    check('the shell wires the view: bed + hamper sit under the furniture, the panes ask the sleepers, the glint rides over the tint',
        /drawGround\(ctx, g\)\n\s*drawPurposeView\(ctx, g\)/.test(pvJsx)
        && /nightTint\(ctx, g\.hour, g\.ext, g\.wings, sleepingCells\(g\)\)/.test(pvJsx)
        && /drawGardenLamp\(ctx, g\)[^\n]*\n\s*drawMoonlitWait\(ctx, g, g\.sec\)/.test(pvJsx))
    check('the lodged pane burns deep amber with a halo; unroused glass keeps its shipped colour',
        /rgba\(255,186,84,/.test(pvArt) && /rgba\(255,224,138,\$\{\(a \* 0\.9\)/.test(pvArt) && /wingLodged\(wg, sleepers\)/.test(pvArt))
    check('the ramp paints the bed itself — soil board, gold creep keyed to ripeness, sprouts that thicken',
        /rgba\(72,48,26,0\.72\)/.test(pvArt) && /\(bw - 6\) \* r/.test(pvArt) && /1 \+ Math\.floor\(r \* 4\)/.test(pvArt))
    check('moonlit glints are cool silver on a phase-only sine',
        /rgba\(214,228,255,/.test(pvArt) && /sin\(sec \* 2\.1/.test(pvArt))
    check('pin: the lodger question is the law\u2019s own geometry — art asks wingSets, and sim exports it for the view',
        /export function wingLodged\(wg, sleepers\)/.test(pvArt) && /wingSets\(wg\)\.floor\.has/.test(pvArt) && /export function wingSets\(g\)/.test(pvSim))
}

section('FAR-TAP KEY (#2708 tail 5): T picks the ear, C says it — the desktop idiom')
{
    const g = newRun(7)
    const needs0 = () => g.kid ? Object.assign(g.kid, { hunger: 0.5, fun: 0.5, energy: 0.5, social: 0.5 }) : null
    check('no ear, no cycle — null on an empty lot', farCycle(g, null) === null && farCycle(g, 'fern') === null)
    g.visitor = { name: 'Fern', state: 'hang' }
    if (!g.kid) g.kid = { r: 7, c: 2, asleep: false, needs: { hunger: 0.5, fun: 0.5, energy: 0.5, social: 0.5 } }; else g.kid.asleep = false; needs0()
    check('the first press lands the pointer tap order (fern first)', farCycle(g, null) === 'fern' && farCycle(g, '') === 'fern')
    g.ivy = { state: 'visit' }
    check('the cycle walks fern → ivy → kid → fern', farCycle(g, 'fern') === 'ivy' && farCycle(g, 'ivy') === 'kid' && farCycle(g, 'kid') === 'fern')
    g.kid.asleep = true
    check('an asleep Pip is skipped, not listed', farCycle(g, 'ivy') === 'fern')
    g.visitor.state = 'leaving'
    check('a leaving Fern is skipped', farCycle(g, 'kid') === 'ivy')
    g.ivy.state = 'leaving'
    check('when none can hear, the cycle answers null (the shell says so)', farCycle(g, 'fern') === null)
    const h0 = stateHash(g)
    farCycle(g, null); farCycle(g, 'ivy'); farCycle(g, 'kid')
    check('the cycle spends neither state nor rng (the hash never hears of it)', stateHash(g) === h0)
    check('the ear order is the pointer tap order, and the partner is absent', JSON.stringify(FAR_EARS) === JSON.stringify(['fern', 'ivy', 'kid']))
    const ftSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const ftIdx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    check('the law ships pure — farCycle reads goSayTarget, mutates nothing', /function farCycle\(s, from\) \{[\s\S]*?if \(goSayTarget\(s, k\)\) return k[\s\S]*?\n\}/.test(ftSim) && !/function farCycle[\s\S]{0,500}(s\.[a-zA-Z]+ ?=|pick\(s|Math\.random)/.test(ftSim))
    check('the shell drives it from KeyT, Tab untouched as the switch', ftIdx.includes("const EAR_KEYS = new Set(['KeyT'])") && ftIdx.includes('farCycle(gs, earHint)') && ftIdx.includes("const SWITCH_KEYS = new Set(['KeyG', 'Tab'])"))
    check('C with a hint runs the pointer\u2019s three legs (pick / list / walk)', ftIdx.includes("courtPickSet(gs, k); court(gs, 'coo')") && ftIdx.includes("{ kind: 'gosay', k }") && ftIdx.includes('cmdGoSay(gs, p, k)'))
    check('no second pad — the pad keeps exactly one build button', (ftIdx.match(/secondAction=\{\{[^}]*\}\}/g) || []).length === 1)
    check('the registry teaches the idiom', readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8').includes('T picks the ear'))
}

section('GARDEN JAR (#2721): Pip\u2019s round pays for kit two — earmarked money, honest till')
{
    const DTj = FIXED_DT / 1000
    const runFor = (g, seconds) => { const ev = []; for (let i = 0; i < Math.round(seconds / DTj); i++) { advance(g, DTj); ev.push(...drain(g)) } return ev }

    // no child on the lot, no round
    const g0 = newRun(7)
    const ev0 = runFor(g0, 3600)
    check('no Pip, no paper round', g0.jar === 0 && !ev0.some((e) => e.t === 'route'))

    // the round pays once, in the morning, into the jar — never the till
    const g1 = newRun(7)
    g1.money = 600
    adoptKid(g1); drain(g1)
    const ev1 = runFor(g1, 3600 * 26)
    const routes = ev1.filter((e) => e.t === 'route')
    check('the round lands once per morning', routes.length >= 1 && routes.every((e) => e.cash > 0), `routes=${routes.length}`)
    check('the round pays one day one beat (the day stamp is the law)', routes.length <= 26, `routes=${routes.length} over 26h`)
    check('the round\u2019s money is all in the jar (arithmetic exact)', g1.jar === Math.min(JAR_CAP, ROUTE.cash * routes.length), `jar=${g1.jar} routes=${routes.length}`)
    check('the jar reads the money in it', routes.reduce((a, e) => e.jar, 0) === g1.jar || g1.jar === JAR_CAP, `jar=${g1.jar}`)

    // the jar caps at the kit — no over-saving theatre
    const g2 = newRun(7)
    g2.money = 600; adoptKid(g2); drain(g2)
    g2.jar = JAR_CAP
    const before = g2.jar
    runFor(g2, 3600 * 20)
    check('a full jar stays full — the fund caps at the kit price', g2.jar === before && before === GARDEN.price, `jar=${g2.jar}/${GARDEN.price}`)

    // purity: jar money buys the cottage and NOTHING else
    const g3 = newRun(7)
    g3.money = 0; g3.jar = JAR_CAP
    g3.sel = CATALOG.findIndex((d) => d.id === 'plant')
    check('the jar cannot buy decor', !place(g3, 5, 0) && g3.money === 0 && g3.jar === JAR_CAP)
    check('the jar cannot buy the east wing (the fund is the garden\u2019s)', !buildRoom(g3, eastWing(DEFAULT_ANCHOR)) && g3.jar === JAR_CAP && g3.ext === 0)
    const g4 = newRun(7)
    g4.money = 10; g4.jar = JAR_CAP
    const evR = (drain(g4), buildRoom(g4, GARDEN), drain(g4))
    check('the cottage pays from the jar first — the till is left whole', g4.ext === 1 && g4.money === 10 && g4.jar === 0 && evR.some((e) => e.t === 'room' && e.w === 'garden' && e.jar === JAR_CAP),
        `ext=${g4.ext} money=${g4.money} jar=${g4.jar}`)
    const g6 = newRun(7)
    g6.money = 70; g6.jar = 30
    check('a short jar asks the till only for the shortfall', buildRoom(g6, GARDEN) && g6.money === 10 && g6.jar === 0, `money=${g6.money} jar=${g6.jar}`)   // 70 − (90 − 30)

    // the fund is state: it rides the hash; the day stamp is a clock and does not
    const ha = newRun(11); ha.jar = 90
    const hb = newRun(11); hb.jar = 0
    check('the jar rides stateHash', stateHash(ha) !== stateHash(hb))
    const hc = newRun(11); hc.jar = 90; hc.routeDay = 5
    check('the round\u2019s day stamp is a clock, not state', stateHash(hc) === stateHash(ha))
    const twin = () => { const g = newRun(42); let t = 0; while (!g.done && t++ < 60 * 60 * 45) autoStep(g, DTj); return stateHash(g) }
    check('the round keeps the sim deterministic', twin() === twin())

    // the law ships pure: one beat, fixed text, no rng, no till
    const jarSim = readFileSync(new URL('../src/games/Homebody/sim.js', import.meta.url), 'utf8')
    const jarFn = jarSim.match(/function updateRoute\(s\) \{[\s\S]*?\n\}/)?.[0] || ''
    check('pin: the round never reads the till and never rolls the rng', !!jarFn && !/s\.money/.test(jarFn) && !/pick\(|Math\.random/.test(jarFn))
    check('pin: the round is wired into the world clock behind the other citizens', /updateProwl\(s, simDt\)[\s\S]{0,120}updateRoute\(s\)/.test(jarSim))
    check('pin: the cottage price and the fund are one arithmetic (JAR_CAP = GARDEN.price)', /export const JAR_CAP = GARDEN\.price/.test(jarSim) && JAR_CAP === GARDEN.price)
    check('pin: the kit builder drains the jar before the till', /const fund = geom\.id === 'garden' \? s\.jar : 0/.test(jarSim))

    // the shell and the registry teach the beat
    const jarIdx = readFileSync(new URL('../src/games/Homebody/index.jsx', import.meta.url), 'utf8')
    const jarArt = readFileSync(new URL('../src/games/Homebody/art.js', import.meta.url), 'utf8')
    check('the shell names the beat (banner + coin timbre)', /case 'route':/.test(jarIdx) && jarIdx.includes('GARDEN JAR'))
    check('the catalog card prices the NEXT kit and shows the jar', /d\.room \? \(s\.ext >= 1 \? GARDEN : EXT_ROOM\)/.test(jarArt) && /JAR \$\{s\.jar\}/.test(jarArt))
    check('the dev eye reads and fills the jar', jarIdx.includes('jar=${gs.jar}/${GARDEN.price}') && /label: 'FILL JAR'/.test(jarIdx))
    check('the registry teaches the fund', readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8').includes('garden jar'))

    // #2729 — the fund READS in the panel, not just in the catalog: jarRow(s) is
    // pure view data (painter, bondsPix probe and this gate read one derivation).
    const gv = newRun(7)
    check('#2729 no Pip, no jar row', jarRow(gv) === null)
    gv.money = 999
    adoptKid(gv)
    const jv = jarRow(gv)
    const kidRow = bondRows(gv).find((r) => r.key === 'kid')
    check('#2729 Pip home, cottage still to raise — the row stands under PIP', !!jv && jv.lv === 0 && jv.label === 'JAR' && kidRow && jv.y === kidRow.y + 14, jv && `lv=${jv.lv} y=${jv.y}`)
    gv.jar = 44
    check('#2729 the pips track the fund (a partial fill reads partial)', jarRow(gv).lv === 1 && !jarRow(gv).pulse, `lv=${jarRow(gv).lv}`)
    gv.jar = 89
    check('#2729 an almost-full jar still reads 3 of 4 — the full read is earned', jarRow(gv).lv === 3 && !jarRow(gv).pulse)
    gv.jar = JAR_CAP
    check('#2729 a full jar reads 4 of 4 and pulses — buy the cottage now', jarRow(gv).lv === 4 && jarRow(gv).pulse === true)
    gv.money = 0
    check('#2729 the cottage stands — the row retires, its lesson taught', buildRoom(gv, GARDEN) && jarRow(gv) === null && gv.jar === 0, `jar=${gv.jar}`)
    check('#2729 pin: the panel paints the row and gives Miso a lower seat', /const jr = jarRow\(s\)/.test(jarArt) && /s\.kid \? \(jr \? 96 : 82\) : 68/.test(jarArt) && /label: 'JAR'/.test(jarArt))
    check('#2729 pin: the honest n/cap reads beside the label, amber like the fund', jarArt.includes('`${s.jar}/${JAR_CAP}`') && /ctx\.fillStyle = '#f2c14e'/.test(jarArt))
    check('#2729 pin: the phone-scale probe aims at the same derivation, not stale seats', /const jr = jarRow\(gs\)/.test(jarIdx) && /return \{ k: \+k\.toFixed\(3\), rows, bands, jar, badges: rb \}/.test(jarIdx))   // #2743: the return now carries the door badges too
}

console.log(`\n=== peoplecheck: ${pass} pass, ${fail} fail ===`)

if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
