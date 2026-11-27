// froggercheck — FROGGER's attract screen layout in plain Node, no browser
// (#365 rule 6). The old attract stacked "GET ACROSS. DON'T GET FLATTENED."
// over "HOP ON LOGS - AVOID THE TURTLES' NAPS" at once — a wall of rules text
// on the demo. attract.js is the layout the shell actually draws, so this audit
// cannot rot away from the pixels. `--mutate` re-plants the broken behaviours;
// the child MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, HUD, estWidth } from '../src/games/Frogger/attract.js'
import { makeLane, DIVE_CYCLE, deathStyle, bankEdgeX, SPLAT_BANK_PAD, makeRun, tickFrogger, watchStep,
    ROW_FREEZE, timeBonus, TIME_LIMIT, START_ROW, ROAD_BOT, CELL, W,
    addScore, die, ONE_UP_AT, LADY_BONUS, RIVER_CFG, RIVER_TOP, HOUSE_COLS, spansOf } from '../src/games/Frogger/sim.js'
import { OPENING_VERSE, ONE_UP_STING, GAME_OVER_STING, freqOf } from '../src/games/Frogger/tunes.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------- attract rule 6 ----
console.log('attract (rule 6)')
{
    // The canvas is fixed 260x266, but audit a couple of wider viewports too so
    // the size-to-fit and the kept-clear-of-HUD rules stay honest if the shell scales.
    const SIZES = [[260, 266], [400, 410]]
    const span = HOLD * INFO_MSGS.length + 5
    for (const [w, h] of SIZES) {
        let stacked = 0
        let clipped = 0
        let overHud = 0
        let overPill = 0
        const seen = new Set()
        for (let t = 0; t < span; t++) {
            const lines = attractFrame(t, w, h, HUD)
            const info = lines.filter((l) => l.text !== 'FROGGER' && l.text !== PRESS)
            if (info.length > 1) stacked++
            info.forEach((l) => seen.add(l.text))
            for (const l of lines) {
                if (estWidth(l) > w || l.y + l.size > h) clipped++
                if (l.y - l.size < HUD) overHud++
                // #3436: the WATCH hint + pill overlay sits at bottom:'24%' of the
                // frame (watchphonecheck law) and grows upward ~10% more — canvas
                // attract text must stay out of that band (bottom 34%).
                if (l.y + l.size > h * 0.66) overPill++
            }
        }
        ok(stacked === 0, `one informational message at a time (${w}x${h})`, `${stacked} stacked frames`)
        ok(clipped === 0, `no attract line clips the frame edge (${w}x${h})`, `${clipped} clipped lines`)
        ok(overHud === 0, `attract text stays below the HUD (${w}x${h})`, `${overHud} lines over the HUD`)
        ok(overPill === 0, `attract text stays clear of the WATCH-pill band (${w}x${h})`, `${overPill} lines in the pill band`)
        ok(seen.size === INFO_MSGS.length, `attract cycles every message (${w}x${h})`, `${seen.size}/${INFO_MSGS.length}`)
    }
    let on = 0
    let off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, 260, 266, HUD).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, 'the press prompt blinks', `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)$/)?.[1]) >= 0.3, 'the demo dims behind the attract text', DIM)
}

// ------------------------------------------------------------------ mutants ----
// ------------------------------------------------------- seed pin (#1473 b15) ----
console.log('seed pin: the seeded traffic replays')
{
    // The engine's lane configs (index.jsx RIVER_CFG) — makeLane is generic,
    // the shapes are what a seeded replay has to reproduce.
    const CFG = [
        { dir: 1, speed: 0.6, kind: 'log', widths: [3], gap: 2.4 },
        { dir: -1, speed: 0.75, kind: 'turtle', widths: [2, 2], gap: 2.6, dive: true },
        { dir: 1, speed: 1.0, kind: 'log', widths: [2, 2], gap: 2.4 },
        { dir: -1, speed: 1.1, kind: 'log', widths: [1], gap: 2.7 },
    ]
    const world = seed => {
        const r = seedRng(seed)
        const lanes = CFG.map(c => makeLane(c, r))
        const flyIdx = Math.floor(r() * 5)
        return { lanes, flyIdx }
    }
    const a = JSON.stringify(world(4242))
    ok(a === JSON.stringify(world(4242)), 'same seed → identical traffic (river lanes + bonus fly)')
    ok(a !== JSON.stringify(world(4243)), 'different seed → different dive offsets')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const w = world(s * 7919)
        for (const l of w.lanes) {
            if (!(l.t >= 0 && l.t < DIVE_CYCLE)) bad++
            if (l.items.length === 0 || l.cycle <= 0) bad++
        }
        if (!(w.flyIdx >= 0 && w.flyIdx < 5)) bad++
    }
    ok(bad === 0, 'dive offsets and fly house stay in range over 12 seeds', `${bad}`)
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
    const src = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /makeRun\(seed\)/.test(src), 'human start regenerates the seed and honors ?seed=N')
    ok(/seed: seed/.test(src), 'production report carries the seed')
    ok(!/Math\.random\(\) \* houses\.length/.test(src), 'the bonus fly house is drawn from the seeded stream')
    const simSrc = readFileSync('src/games/Frogger/sim.js', 'utf8')
    ok(/rand: seedRng\(seed\)/.test(simSrc) &&
        !/Math\.random\(\) \* gs\.houses\.length/.test(simSrc), 'b25: the lifted world still draws every die from the seeded stream')
}

// ------------------------------------------ off-board death is distinct (#1508) ----
// ART.md feel: going OFF the board must not read as a water splash. deathStyle()
// is the pure decision the renderer + audio branch on, so this is provable in
// plain Node without a browser.
console.log('off-board death is distinct from a water splash')
{
    const off = deathStyle('off')
    const water = deathStyle('water')
    ok(off.kind !== water.kind, 'off-board death does not reuse the water ripple', `${off.kind} vs ${water.kind}`)
    ok(off.color !== water.color, 'off-board death carries its own colour', `${off.color} vs ${water.color}`)
    ok(deathStyle('car').kind === 'squash' && deathStyle('water').kind === 'ripple',
        'car squashes and water rings (regression anchors)')
    const src = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/deathStyle\(\s*frog\.cause\s*\)/.test(src), 'the death animation consults deathStyle(cause)')
    ok(!/cause === 'time' \? '#ffe14d' : 'rgba\(160,210,255/.test(src), 'no hard-coded blue ring for every death')
}

// ------------- 1981 tunes + the carry-off splat (#3703) --------------------
// The opening verse, one-up sting and game-over sting are ORIGINAL note tables
// (never a recording of the cabinet); the harness pins their shape and the
// shell wiring so a silent one-shot can't regress. The carry-off splat is the
// off-board death's own mark — clamped to the bank edge (its x is off-canvas).
console.log('1981 tunes (#3703)')
{
    const TABLES = [
        ['OPENING_VERSE', OPENING_VERSE],
        ['ONE_UP_STING', ONE_UP_STING],
        ['GAME_OVER_STING', GAME_OVER_STING],
    ]
    for (const [name, table] of TABLES) {
        ok(table.length >= 4, `${name}: at least four notes`, `${table.length}`)
        ok(table.every(e => isFinite(freqOf(e.midi)) && e.midi >= 36 && e.midi <= 96 && e.dur > 0 && e.at >= 0 && e.vol > 0 && e.vol <= 0.2),
            `${name}: every note is valid and within the cabinet's loud band`)
        ok(table.every((e, i) => i === 0 || e.at > table[i - 1].at),
            `${name}: notes are ascending in time`)
    }
    ok(OPENING_VERSE.every((e, i) => i === 0 || e.midi > OPENING_VERSE[i - 1].midi),
        'the opening verse climbs')
    ok(ONE_UP_STING.every((e, i) => i === 0 || e.midi > ONE_UP_STING[i - 1].midi),
        'the one-up sting climbs')
    ok(ONE_UP_STING.slice(0, 4).every(e => e.dur <= 0.06),
        'the one-up sting is fast (four notes <= 60 ms)')
    ok(GAME_OVER_STING.every((e, i) => i === 0 || e.midi < GAME_OVER_STING[i - 1].midi),
        'the game-over sting descends')
    ok(JSON.stringify(OPENING_VERSE) !== JSON.stringify(ONE_UP_STING) &&
        JSON.stringify(OPENING_VERSE) !== JSON.stringify(GAME_OVER_STING) &&
        JSON.stringify(ONE_UP_STING) !== JSON.stringify(GAME_OVER_STING),
        'the three tunes are three distinct figures')

    // Shell wiring: the verse plays at game start, the defeat sting on game
    // over, once per run, and the one-up sting from the same table.
    const srcT = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/const playOpeningVerse \= \(\) => playTune\(OPENING_VERSE\)/.test(srcT) &&
        /playOpeningVerse\(\)/.test(srcT), 'the shell plays the opening verse')
    ok(/const playGameOver \= \(\) => playTune\(GAME_OVER_STING\)/.test(srcT) &&
        /playGameOver\(\)/.test(srcT), 'the shell plays the game-over sting')
    ok(/const playOneUp \= \(\) => playTune\(ONE_UP_STING\)/.test(srcT),
        'the shell plays the one-up sting from the 1981 table')
    ok(/if \(!gameOverShown\) \{ gameOverShown = true; playGameOver\(\) \}/.test(srcT),
        'the defeat sting fires once per run')

    // The carry-off splat: a pure clamp so the splat lands at the shoreline.
    ok(bankEdgeX(-100) === SPLAT_BANK_PAD, 'an off-left splat is clamped to the left bank pad', `${bankEdgeX(-100)}`)
    ok(bankEdgeX(W + 100) === W - SPLAT_BANK_PAD, 'an off-right splat is clamped to the right bank pad', `${bankEdgeX(W + 100)}`)
    ok(bankEdgeX(120) === 120, 'an on-board splat stays where the frog was', `${bankEdgeX(120)}`)
    ok(isFinite(SPLAT_BANK_PAD) && SPLAT_BANK_PAD > 0 && SPLAT_BANK_PAD < CELL && CELL > 0,
        'the bank pad is a small shoreline inset')
    ok(/bankEdgeX\(frog\.x\)/.test(srcT), 'the carry-off splat draws clamped to the bank edge')
}

// --------------------------------- watch driver: crossings on the shipped tick ----
// #1637 batch 25: the seat's brain (sim.js watchStep) proven against the SAME
// tick the browser runs. Reactive, rand-free, and honest at the edges.
console.log('watch driver: crossings proven on the shipped tick (#1637 b25)')
{
    const SEEDS = [...Array(40)].map((_, k) => 1000 + k * 97)
    const runSeed = seed => {
        const gs = makeRun(seed)
        gs.watching = true
        let h = 0, d = 0, c = 0
        for (let t = 0; t < 7200; t++) {
            const ev = tickFrogger(gs)
            h += ev.home
            if (ev.died) d++
            if (ev.level) c++
        }
        return { h, d, c, score: gs.score, lives: gs.lives, level: gs.level }
    }
    let homes = 0, clean = 0, clears = 0, det = 0, minH = Infinity
    for (const s of SEEDS) {
        const a = runSeed(s), b = runSeed(s)
        if (JSON.stringify(a) === JSON.stringify(b)) det++
        homes += a.h
        clean += a.d === 0 ? 1 : 0
        if (a.c > 0) clears++
        minH = Math.min(minH, a.h)
    }
    ok(det === 40, 'driver: 40/40 seeds replay byte-equal (watchStep draws no rand)')
    ok(clears === 40, 'driver: every seed banks at least one full level in 120 s', `${clears}/40`)
    ok(clean >= 38, 'driver: zero-death runs on ≥38 seeds (#2869 measured 40/40 since the away-lane generalization; was 36 — 2 lives of margin)', `${clean}/40`)
    ok(minH >= 20, 'driver: ≥20 homes landed on every seed', `min ${minH}`)
    ok(homes >= 1800, 'driver: ≥1800 homes across the 40-seed sweep', `${homes}`)
    const gsA = makeRun(4242, { attract: true })
    ok(watchStep(gsA) === null, 'driver: silent while attract holds the pad')
    const gsO = makeRun(4242)
    gsO.over = true
    ok(watchStep(gsO) === null, 'driver: silent at game over (watch never lingers)')
}

// #2869: every pin above is an OUTCOME over 120 s — clears, homes, deaths — and a
// ~2000-tick zigzag/park stall still cleared the bars (that is how seeds 103/3910
// hid until a nightly rolled one). Pin the metric directly: across the certified
// family plus every known stall seed (pre-fix 2940/3134/3910; loop-break-era
// 1970/3328/3425; cross-repo 103/1679/4492), NO home-to-home gap may reach
// 1800 ticks (the 30 s watchcheck leg budget). Pure sim, deterministic, no browser.
{
    const STALL = 1800
    const SEEDS = [...new Set([...[...Array(40)].map((_, k) => 1000 + k * 97),
        103, 3910, 1679, 1970, 3328, 3425, 2940, 3134, 4492])]
    let maxGap = 0, worst = -1, done = false, homes = 0, deaths = 0
    for (const seed of SEEDS) {
        const gs = makeRun(seed)
        gs.watching = true
        let gap = 0
        for (let t = 0; t < 7200 && !gs.over && !done; t++) {
            const ev = tickFrogger(gs)
            gap = ev.home ? 0 : gap + 1
            homes += ev.home
            if (ev.died) deaths++
            if (gap >= STALL) { maxGap = gap; worst = seed; done = true; break }
            if (gap > maxGap) { maxGap = gap; worst = seed }
        }
    }
    ok(!done, `gapsweep: no stalled 30 s window across ${SEEDS.length} seeds`, `seed ${worst} gap ${maxGap}`)
    ok(homes >= 2850, 'gapsweep: ≥2850 homes on the sweep (#2869 measured 2926; muting the loop-break ~6% lower)', `${homes}`)
    ok(deaths === 0, 'gapsweep: zero deaths across the sweep (#2869 measured)', `${deaths}`)
}

// #601 main-fix (nightly 44914600702): watchcheck's frogger pilot rides a PINNED
// seed (?seed=1776) because ~1 in 60 roll seeds lose a life and then zigzag the
// middle river lanes without banking a home inside the leg's 30 s lily-pad window
// (#2869 owns the planner zigzag). This pin replays the leg ITSELF against the
// shipped tick — seat at Space+400 ms, the 8 s advance probe, the 30 s home wait
// (with margin), handback, re-seat, the 8 s resume — so a sim tweak that drifts
// the pinned route goes red HERE, deterministically, before the nightly lottery
// re-opens. Also pins the pin: the pilot URL must carry the seed.
{
    const wcSrc = readFileSync('scripts/watchcheck.mjs', 'utf8')
    ok(/id: 'frogger', url: `\$\{BASE\}\/frogger\?seed=1776`/.test(wcSrc),
        'watchcheck frogger pilot carries the certified seed pin')
    const HOME_WAIT = 1800 // 30 s world ticks, the leg's browser wait
    const gs = makeRun(1776)
    let t = 0, died = 0, homeTick = -1
    for (; t < 24; t++) tickFrogger(gs) // Space, 400 ms, then Y seats
    gs.watching = true
    for (; t < 504; t++) { const e = tickFrogger(gs); if (e.died) died++ }
    ok(gs.score > 0 || gs.houses.some(h => h.filled), 'pin: advance probe sees progress at +8 s', `score ${gs.score}`)
    for (; t < 504 + HOME_WAIT; t++) {
        const e = tickFrogger(gs); if (e.died) died++
        if (gs.frog.state === 'home') { homeTick = t - 504; break }
    }
    ok(homeTick >= 0 && homeTick < HOME_WAIT / 2, 'pin: first home banks inside half the browser window', `tick ${homeTick}/${HOME_WAIT}`)
    gs.watching = false // ArrowUp takeover
    tickFrogger(gs)
    gs.watching = true // KeyY re-seat
    const cScore = gs.score
    for (let k = 0; k < 480 && !gs.over; k++) { const e = tickFrogger(gs); if (e.died) died++ }
    ok(!gs.over && (gs.score > cScore || gs.houses.some(h => h.filled)), 'pin: resume climbs after re-seat', `score ${cScore} -> ${gs.score}`)
    ok(died === 0 && gs.lives === 3, 'pin: leg is zero-death (no life lottery in the browser leg)', `deaths ${died}`)
}

// --------------- #3676 gap 0: alternating 2P + row-entry tell + time bonus ----
// Wikipedia §Gameplay: "two players alternating turns"; §Scoring: "Ten points
// are awarded per each unused ½ second of time." All three laws are pure sim
// and provable in Node against the shipped tick — like the rest of this file,
// no browser needed.
console.log('duel & tell (#3676): alternating 2P, row-entry pause, time bonus')
{
    const kill = gs => { gs.frog.state = 'dying'; gs.frog.cause = 'car'; gs.frog.deadT = 1; return tickFrogger(gs) }

    const g1 = makeRun(4242)
    ok(g1.players === 1 && g1.player === 1 && g1.winner === 0 && g1.freeze === 0,
        '1P run: duel fields inert')

    ok(timeBonus({ timeLeft: TIME_LIMIT }) === 600 && timeBonus({ timeLeft: 900 }) === 300 &&
        timeBonus({ timeLeft: 29 }) === 0,
        'time bonus = ten points per unused ½ second', `${timeBonus({ timeLeft: 900 })}`)

    // Home pays the bonus from the clock AT ARRIVAL, then resets it. Sit the
    // frog right above the centre house — deterministic, no traffic involved.
    const g2 = makeRun(4242)
    g2.frog.row = 1; g2.frog.x = 6 * CELL + CELL / 2; g2.frog.bestRow = 1
    g2.timeLeft = 900
    const flyWas = g2.houses[2].fly
    const s2 = g2.score
    const ev2 = tickFrogger(g2, { dx: 0, dy: -1 })
    ok(ev2.home === 1 && ev2.bonus === 300, 'home pays 300 bonus with 15 s left', `bonus ${ev2.bonus}`)
    ok(g2.score - s2 === 360 + (flyWas ? 200 : 0),
        'home totals 10 forward + 50 home + 300 bonus (+200 when the fly was there)', `delta ${g2.score - s2}`)
    ok(g2.timeLeft === TIME_LIMIT, 'the clock resets after the home entry')

    // Row-entry tell — a surviving hop onto road row 10 stops the field, the
    // clock holds with it, and the hold lasts ROW_FREEZE ticks. Road rows score
    // on clearance, so scan the seeded lane for an honest standing spot; the
    // whole probe stays deterministic (fixed seed, no rand in the scan).
    const probe = cx => {
        const t = makeRun(4242)
        t.frog.row = START_ROW; t.frog.x = cx; t.frog.prevX = cx; t.frog.bestRow = START_ROW
        const e1 = tickFrogger(t, { dx: 0, dy: -1 })
        if (e1.enter !== ROAD_BOT || t.freeze <= 0 || t.frog.state !== 'alive') return null
        const lanesBefore = JSON.stringify(Object.values(t.roadLanes).map(l => l.items.map(i => i.x)))
        const timeBefore = t.timeLeft
        const eF = tickFrogger(t)
        const heldLanes = eF.frozen && JSON.stringify(Object.values(t.roadLanes).map(l => l.items.map(i => i.x))) === lanesBefore
        const heldClock = t.timeLeft === timeBefore
        let hold = 1
        while (t.freeze > 0 && hold < 60) { tickFrogger(t); hold++ }
        tickFrogger(t, { dx: 0, dy: 1 }) // back down to the start strip
        const e2 = tickFrogger(t, { dx: 0, dy: -1 }) // re-enter the SAME row
        return { e1, heldLanes, heldClock, hold, reEnter: !!e2.enter, alive: t.frog.state === 'alive' }
    }
    let T = null
    for (let cx = CELL; cx <= 260 - CELL && !T; cx++) {
        const p = probe(cx)
        if (p && p.heldLanes && p.heldClock && p.hold === ROW_FREEZE && !p.reEnter && p.alive) T = p
    }
    ok(T !== null, 'row-entry tell: new row pauses field+clock for ROW_FREEZE ticks; re-entry is silent',
        T ? '' : 'no standing spot held the whole tell')
    ok(T && T.e1.enter === ROAD_BOT, 'the tell event carries the entered row', `row ${T && T.e1.enter}`)

    // Alternating 2P: P1 until out, P2 takes the SAME board with fresh frogs.
    const g4 = makeRun(4242, { players: 2 })
    g4.houses[0].filled = true
    const handoffs = []
    for (let i = 0; i < 3; i++) handoffs.push(kill(g4).handoff)
    ok(handoffs.join() === '0,0,2', 'P1 is out at the third death — the handoff event is only there', handoffs.join())
    ok(g4.player === 2 && g4.lives === 3 && g4.timeLeft === TIME_LIMIT && g4.banner > 0,
        'P2 takes the seat: three frogs, full clock, PLAYER 2 banner')
    ok(g4.houses[0].filled && g4.frog.row === START_ROW && g4.frog.state === 'alive',
        'the board persists across the handoff — filled homes stay filled')
    g4.scores[0] = 500
    let verdict = null
    for (let i = 0; i < 3 && !verdict; i++) { const e = kill(g4); if (e.over) verdict = e }
    ok(verdict && verdict.winner === 1, 'when P2 is also out the duel ends — higher score wins', `winner ${verdict && verdict.winner}`)

    const g5 = makeRun(4242, { players: 2 }); g5.scores = [40, 90]; g5.player = 2; g5.lives = 1
    ok(kill(g5).winner === 2, 'the second seat can win it too')
    const g6 = makeRun(4242, { players: 2 }); g6.scores = [77, 77]; g6.player = 2; g6.lives = 1
    ok(kill(g6).winner === 0, 'tied scores draw')
    const g7 = makeRun(4242)
    let over7 = false
    for (let i = 0; i < 3; i++) over7 = kill(g7).over || over7
    ok(over7 && g7.player === 1, '1P never hands off — the third death is simply GAME OVER')

    // Event honesty: a filled nest is a WALL — it must not fire the home jingle.
    const g8 = makeRun(4242)
    g8.houses[2].filled = true
    g8.frog.row = 1; g8.frog.x = 6 * CELL + CELL / 2; g8.frog.bestRow = 1
    const ev8 = tickFrogger(g8, { dx: 0, dy: -1 })
    ok(ev8.died === 'wall' && ev8.home === 0, 'a filled nest reports died, not home', `died ${ev8.died} home ${ev8.home}`)

    // The tell is a human-seat law: the watch planner's dt arithmetic stays
    // exact (certified pins #2869/#1776 cannot desync), and the attract demo
    // still shows the pause to whoever walks up.
    const g9 = makeRun(1776)
    g9.watching = true
    let sawFrozen = 0, sawEnter = 0
    for (let t = 0; t < 1200; t++) { const e = tickFrogger(g9); if (e.frozen) sawFrozen++; if (e.enter) sawEnter++ }
    ok(sawFrozen === 0 && sawEnter === 0 && g9.tickN === 1200,
        'the seated watch never pauses mid-crossing (the b25 dt law stays exact)', `frozen ${sawFrozen}`)
    const g10 = makeRun(1776, { attract: true })
    let attractTell = false
    for (let t = 0; t < 3000 && !attractTell; t++) attractTell = tickFrogger(g10).frozen
    ok(attractTell, 'the attract demo shows the row-entry pause')

    // Shell pins: the entry key, the sounds, the verdict text, QA visibility.
    const src2 = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/startGame\(e\.code === 'Digit2' \? 2 : 1\)/.test(src2), '`2` opens the duel at attract and game over')
    ok(/ev\.handoff/.test(src2) && /ev\.enter/.test(src2) && /ev\.bonus/.test(src2),
        'the shell sounds the handoff, the entry bleep and the bonus triad')
    ok(/PLAYER \$\{gs\.player\}/.test(src2) && /WINS/.test(src2),
        'the banner names the seat and the verdict names the winner')
    ok(/players: gs\.players/.test(src2), 'the QA state carries the duel fields')
}

// ---------------------------------------- lady frog + bonus frog (#3692) ----
// §Scoring: "A single bonus frog is given at 20,000 points"; 99,990 is the
// cabinet ceiling — passing it "rolls over", only the last five digits are
// kept. §Gameplay: the lady frog is "sometimes on a log"; delivering her home
// scores 200. Her dice are seeded and rolled AFTER the fly's, so a seed's
// pre-#3692 traffic (lane phases + fly house) stays byte-identical.
console.log('lady frog + bonus frog + rollover (#3692)')
{
    const g = makeRun(99)
    addScore(g, ONE_UP_AT)
    ok(g.lives === 4 && g.oneUp, 'bonus frog at 20,000 (§Scoring)', `lives ${g.lives}`)
    addScore(g, ONE_UP_AT)
    ok(g.lives === 4, 'a SINGLE bonus frog — no second life at 40,000', `lives ${g.lives}`)
    g.scores[0] = 99990
    addScore(g, 50)
    ok(g.score === 40, 'rollover keeps the last five digits (§Scoring)', `${g.score}`)

    // "Sometimes": seeded sweep shows her on some worlds, not all — always on
    // a log, never on the diving turtles.
    let ladies = 0, badLane = 0
    for (let s = 1; s <= 40; s++) {
        const w = makeRun(s * 77)
        if (w.lady) { ladies++; if (RIVER_CFG[w.lady.lane].kind !== 'log') badLane++ }
    }
    ok(ladies > 0 && ladies < 40, 'the lady frog appears on some worlds and not others (§Gameplay)', `${ladies}/40`)
    ok(badLane === 0, 'she rides logs only', `${badLane} on turtles`)
    const simSrc = readFileSync('src/games/Frogger/sim.js', 'utf8')
    ok(simSrc.indexOf('gs.lady = { lane') > simSrc.indexOf('const flyIdx'),
        'the lady dice roll after the fly roll — per-seed traffic stays byte-stable')

    // Ride her home: pickup standing on her log, +200 at the nest, and she
    // leaves the river.
    const g2 = makeRun(5150)
    const spans0 = spansOf(g2.riverLanes[0])
    const vi = spans0.findIndex(s => s.x + s.w / 2 > 2 * CELL && s.x + s.w / 2 < (CELL * 13) - 2 * CELL)
    g2.lady = { lane: 0, idx: vi }
    g2.frog.row = RIVER_TOP
    g2.frog.x = spans0[vi].x + spans0[vi].w / 2
    g2.frog.riding = 0
    let picked = false
    for (let t = 0; t < 4 && !picked; t++) picked = tickFrogger(g2).ladyPick
    ok(picked && g2.frog.lady, 'standing on her log takes her along (pickup event)', `carry ${g2.frog.lady}`)
    const before = g2.score
    const hi = g2.houses.findIndex(h => !h.filled)
    g2.frog.row = RIVER_TOP
    g2.frog.x = HOUSE_COLS[hi] * CELL + CELL / 2
    const evD = tickFrogger(g2, { dx: 0, dy: -1 })
    ok(evD.home === 1 && evD.lady, 'delivering her home fires its own event', JSON.stringify({ home: evD.home, lady: evD.lady }))
    ok(g2.score - before >= LADY_BONUS + 50, 'the nest pays +200 for the lady (§Scoring)', `+${g2.score - before}`)
    ok(g2.lady === null, 'delivered — she leaves the river for the rest of the level')

    // A drowned carrier loses her; she herself waits on her log.
    const g3 = makeRun(5150)
    g3.lady = { lane: 0, idx: vi }
    g3.frog.row = RIVER_TOP
    g3.frog.x = spansOf(g3.riverLanes[0])[vi].x + spansOf(g3.riverLanes[0])[vi].w / 2
    g3.frog.riding = 0
    for (let t = 0; t < 4 && !g3.frog.lady; t++) tickFrogger(g3)
    die(g3, 'water')
    for (let t = 0; t < 60; t++) tickFrogger(g3)
    ok(g3.frog.state === 'alive' && !g3.frog.lady && !!g3.lady,
        'a drowned carrier loses her; she waits on her log', JSON.stringify({ carry: g3.frog.lady, lady: !!g3.lady }))

    // Shell pins: the sounds and the five-digit HUD exist in the shell.
    const src3 = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/ev\.ladyPick/.test(src3) && /playOneUp\(\)/.test(src3),
        'the shell sounds the pickup chirp and the one-up jingle')
    ok(/SCORE_WRAP/.test(src3) && /padStart\(5, '0'\)/.test(src3),
        'the HUD pads the score to five digits (the rollover is visible)')
}

if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const F = 'src/games/Frogger/attract.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)',
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`,
            'src/games/Frogger/index.jsx'],
        ['the bonus fly house leaves the seeded stream',
            `const flyIdx = Math.floor(gs.rand() * gs.houses.length)`,
            `const flyIdx = Math.floor(Math.random() * gs.houses.length)`,
            'src/games/Frogger/sim.js'],
        ['attract stacks a second message',
            `        { text: msg, x: w / 2, y: hud + region * 0.36, size: fitSize(msg, w, 11), col: '#ffffff', glow: 0 },`,
            `        { text: msg, x: w / 2, y: hud + region * 0.36, size: fitSize(msg, w, 11), col: '#ffffff', glow: 0 },
        { text: 'HOP ON LOGS', x: w / 2, y: hud + region * 0.86, size: 8, col: '#8f8f8f', glow: 0 },`],
        ['attract message never cycles',
            `cycleAttract(tick, INFO_MSGS, HOLD)`,
            `INFO_MSGS[0]`],
        ['a line clips the frame edge',
            `size: fitSize(msg, w, 11),`,
            `size: 60,`],
        ['text creeps up over the HUD',
            `y: hud + region * 0.20,`,
            `y: hud * 0.4,`],
        ['the prompt drops into the WATCH-pill band (#3436)',
            `y: hud + region * 0.48,`,
            `y: hud + region * 0.70,`],
        ['the press prompt never blinks',
            `!l.blink || Math.floor(tick / 24) % 2 === 0`,
            `true`],
        ['no dim behind the attract text',
            `export const DIM = 'rgba(0,0,0,0.55)'`,
            `export const DIM = 'rgba(0,0,0,0)'`],
        ['off-board death collapses to the water ripple (#1508 regression)',
            `    if (cause === 'off') return { kind: 'splat', color: '#ff7a5c' }`,
            `    if (cause === 'off') return { kind: 'ripple', color: 'rgba(160,210,255,0.9)' }`,
            'src/games/Frogger/sim.js'],
        ['the death animation ignores deathStyle',
            `const st = deathStyle(frog.cause)`,
            `const st = { kind: 'ripple', color: 'rgba(160,210,255,0.9)' }`,
            'src/games/Frogger/index.jsx'],
        // b25 driver mutants — each breaks a swept floor, none can hide.
        ['the watch driver is muted (hold forever)',
            `    let best = null
    let bestV = -Infinity
    for (const [dx, dy] of CANDIDATES) {`,
            `    let best = null
    let bestV = -Infinity
    for (const [dx, dy] of []) {`,
            'src/games/Frogger/sim.js'],
        ['home lands without the earliness bonus (procrastination bug #b25)',
            `        if (hi >= 0 && !gs.houses[hi].filled) return { ok: true, value: 1e6 + WATCH_HORIZON }`,
            `        if (hi >= 0 && !gs.houses[hi].filled) return { ok: true, value: 1e6 }`,
            'src/games/Frogger/sim.js'],
        ['row 1 never shuffles back for houses behind',
            `            const houseBehind = ridesAway(gs, row, x) // #2869: was row-1/columns-left only`,
            `            const houseBehind = false`,
            'src/games/Frogger/sim.js'],
        // #2869 — the two stall cures, each pinned by the gap-ceiling block above.
        ['the position-loop break is blind (zigzag stall returns, #2869)',
            `        for (const b of noGo) if (b.row === r && Math.abs(xx - b.x) <= LOOP_TOL) return true`,
            `        for (const b of noGo) if (false && b.row === r && Math.abs(xx - b.x) <= LOOP_TOL) return true`,
            'src/games/Frogger/sim.js'],
        ['away-lane descent trigger narrowed back to row 1/columns-left (park-loop stall returns, #2869)',
            `            const houseBehind = ridesAway(gs, row, x) // #2869: was row-1/columns-left only`,
            `            const houseBehind = row === RIVER_TOP && openSide(gs, x) === -1`,
            'src/games/Frogger/sim.js'],
        // #3703 — tunes + carry-off splat mutants, each pinned by the block above.
        ['the opening verse never plays',
            `            playOpeningVerse() // the run begins — the opening verse, not a blip`,
            `            // (verse removed)`,
            'src/games/Frogger/index.jsx'],
        ['the defeat sting replays every frame',
            `                if (!gameOverShown) { gameOverShown = true; playGameOver() }`,
            `                gameOverShown = true; playGameOver()`,
            'src/games/Frogger/index.jsx'],
        ['the one-up sting stops climbing',
            `    { midi: 67, dur: 0.05, at: 0.10, vol: 0.10 },`,
            `    { midi: 62, dur: 0.05, at: 0.10, vol: 0.10 },`,
            'src/games/Frogger/tunes.js'],
        ['the carry-off splat draws off-canvas',
            `                    const sx = bankEdgeX(frog.x)`,
            `                    const sx = frog.x`,
            'src/games/Frogger/index.jsx'],
        // #3676 — duel + tell mutants, each pinned by the §duel block above.
        ['the handoff gate is closed (P1 never passes the seat, #3676)',
            `    if (gs.players === 2 && gs.player === 1) {`,
            `    if (false) {`,
            'src/games/Frogger/sim.js'],
        ['the time bonus counts whole seconds, not halves (#3676)',
            `export const timeBonus = gs => Math.floor(gs.timeLeft / 30) * 10`,
            `export const timeBonus = gs => Math.floor(gs.timeLeft / 60) * 10`,
            'src/games/Frogger/sim.js'],
        ['the row-entry hold never fires (#3676)',
            `    if (newBest && !gs.watching) gs.freeze = ROW_FREEZE`,
            `    if (newBest && !gs.watching) gs.freeze = 0`,
            'src/games/Frogger/sim.js'],
        ['the seat exemption is dropped (watch desyncs mid-crossing, #3676)',
            `    if (newBest && !gs.watching) gs.freeze = ROW_FREEZE`,
            `    if (newBest) gs.freeze = ROW_FREEZE`,
            'src/games/Frogger/sim.js'],
        ['the duel verdict always picks the first seat (#3676)',
            `gs.winner = gs.scores[0] === gs.scores[1] ? 0 : (gs.scores[0] > gs.scores[1] ? 1 : 2)`,
            `gs.winner = gs.scores[0] === gs.scores[1] ? 0 : 1`,
            'src/games/Frogger/sim.js'],
        ['a filled home is reported as home, jingle over the splat (#3676)',
            `            if (!res) return { kind: 'died', cause: 'wall', row }`,
            `            if (!res) return { kind: 'home', row, fly: false, bonus: 0 }`,
            'src/games/Frogger/sim.js'],
    ]
    // --mutant-only <substr>: re-verify a slice (by name) without re-running
    // the whole ~50-minute board — same plants, same children, same verdicts.
    const only = process.argv.find((_, i, a) => a[i - 1] === '--mutant-only')
    const RUN = only ? MUTANTS.filter(([n]) => n.includes(only)) : MUTANTS
    if (only && RUN.length === 0) { console.log(`no mutants match --mutant-only "${only}"`); process.exit(1) }
    let died = 0
    for (const [name, from, to, file = F] of RUN) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/froggercheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === RUN.length, `all ${RUN.length} mutants die`, `${died}/${RUN.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
