// stompcheck — STOMPTOWN audited in plain Node, no browser.
//
// sim.js + planner.js are pure (zero DOM, zero Math.random), so the tower-crash
// economy, the window loot table, the wall climb, the revert-and-blimp rescue,
// the lives ledger and the twelve-city tour are all provable offline against the
// SAME code the tab runs. Expectations are LITERAL numbers, not the sim's own
// constants — a check that imports the number it audits cannot see it change
// (the TETRIS lesson). The pilot here is planner.js (the attract brain); the
// tour must be won under it with ONE fewer life than dealt (the slack rule),
// hash-for-hash deterministic (#494). And #3094's ownership law is pinned: no
// name, character or credit of the 1986 original may appear anywhere we ship.
//
//   npm run stompcheck            rules + loot statistics + pilot tour + pins
//   node scripts/stompcheck.mjs --mutate   prove the pins can feel pain

import {
    makeGame, step, stateHash, buildingsLeft, cityName, damagePlayer, buildCity,
    W, GROUND, DAYS,
} from '../src/games/Stomptown/sim.js'
import { plan } from '../src/games/Stomptown/planner.js'
import { MESSAGES, PRESS } from '../src/games/Stomptown/attract.js'
import { Report } from './lib/harness.mjs'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { plant, pull } from './lib/mutateguard.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SELF = fileURLToPath(import.meta.url)
const ROOT = path.join(path.dirname(SELF), '..')
const GAME = path.join(ROOT, 'src/games/Stomptown')
const SIMF = path.join(GAME, 'sim.js')
const JX = path.join(GAME, 'index.jsx')
const MF = path.join(GAME, 'attract.js')
const REG = path.join(ROOT, 'src/config/games.js')
const CONTRACT = path.join(ROOT, 'scripts/lib/contractGames.mjs')
const PKG = path.join(ROOT, 'package.json')

const r = new Report('stompcheck')
r.info('boot', 'sim.js + planner.js imported in Node, zero DOM, zero Math.random')

const play = (gs, input = {}) => step(gs, input)
const clearEv = (gs) => { const out = [...gs.events]; gs.events.length = 0; return out }
const until = (gs, cond, max = 900, stepFn) => { let n = 0; while (!cond() && n < max) { (stepFn || play)(gs); n++ } return n }
const disarm = (gs) => { gs.tanks.length = 0; gs.cars.length = 0; gs.helicopters.length = 0; gs.bullets.length = 0 }
// scatter the civilians to the boulevard edges so a proof never scores by accident
// (kills lift the combo, and a combo would scale the very numbers we pin)
const isolate = (gs) => { disarm(gs); gs.civilians.forEach((c, i) => { c.x = i % 2 ? 60 : gs.cityLen - 60 }) }
const CLEAR_T = 144   // literal: the CITY CLEARED banner is 2.4 s at 60 Hz
const sideOf = (gs, b, side) => {
    const p = gs.player
    p.climb = null; p.climbSide = 0
    p.x = side === -1 ? b.x - p.w / 2 - 1 : b.x + b.w + p.w / 2 + 1
    p.y = GROUND; p.vx = 0; p.vy = 0; p.onGround = true
    p.facing = -side
}

// ------------------------------------------------------------- opening ----
{
    const gs = makeGame({ seed: 1 })
    r.check('a fresh tour opens on day 1 in Peoria with 3 lives and full health',
        gs.day === 1 && gs.cityIndex === 0 && gs.lives === 3 && gs.player.hp === 100 && !gs.end)
    r.check('the map is our own route: Peoria first, Dallas twelfth, Chicago second',
        cityName(0) === 'PEORIA, IL' && cityName(1) === 'CHICAGO, IL' && cityName(11) === 'DALLAS, TX')
    r.check('day 1 deals 9 towers, 8 civilians, 1 tank, 3 cars, 1 chopper',
        buildingsLeft(gs) === 9 && gs.civilians.length === 8 && gs.tanks.length === 1 && gs.cars.length === 3 && gs.helicopters.length === 1,
        `b=${buildingsLeft(gs)} c=${gs.civilians.length} t=${gs.tanks.length} v=${gs.cars.length} h=${gs.helicopters.length}`)
    r.check('the boulevard is longer than the screen', gs.cityLen > W, `cityLen=${gs.cityLen}`)
    r.check('the sim and the pilot never touch Math.random (seeded rng only)',
        !/Math\.random\s*\(/.test(readFileSync(SIMF, 'utf8')) && !/Math\.random\s*\(/.test(readFileSync(path.join(GAME, 'planner.js'), 'utf8')))
}

// --------------------------------------------------- ownership law #3094 ----
{
    const law = /rampage|bally|midway|george|lizzie|ralph/i
    const files = ['sim.js', 'planner.js', 'attract.js', 'art.js', 'index.jsx']
    let clean = true
    for (const f of files) {
        const m = readFileSync(path.join(GAME, f), 'utf8').match(law)
        if (m) { clean = false; r.info('ownership leak', `${f}: “${m[0]}”`) }
    }
    r.check('no name, character or studio of the 1986 original ships in our code', clean)
    const regSrc = readFileSync(REG, 'utf8')
    r.check('the registry sells the title under its own name', /label:\s*'STOMPTOWN'/.test(regSrc) && /path:\s*'\/stomptown'/.test(regSrc))
    const regBlock = regSrc.slice(regSrc.indexOf('path: \'/stomptown\'') - 400, regSrc.indexOf('path: \'/stomptown\'') + 6000)
    r.check('the pitch promises our cast, not theirs', /GROG the ape/.test(regBlock) && /ZARRA the reptile/.test(regBlock) && /FENRIS the werewolf/.test(regBlock) && !law.test(regBlock))
    r.check('the contract roster carries stomptown at /stomptown',
        /id:\s*'stomptown'/.test(readFileSync(CONTRACT, 'utf8')) && /path:\s*'\/stomptown'/.test(readFileSync(CONTRACT, 'utf8')))
    r.check('npm run stompcheck is wired', /"stompcheck":\s*"node scripts\/stompcheck\.mjs"/.test(readFileSync(PKG, 'utf8')))
}

// ---------------------------------------------------------- attract copy ----
{
    r.check('attract lines stay short (<= 44 chars)', MESSAGES.every((m) => m.length <= 44), `longest=${Math.max(...MESSAGES.map((m) => m.length))}`)
    r.check('no attract line leaks the harness', !MESSAGES.some((m) => /stompcheck|\.mjs|sim\.js|planner|seed/i.test(m)))
    r.check('the press prompt asks for any key', /ANY KEY/.test(PRESS) && PRESS.length <= 24)
    const jx = readFileSync(JX, 'utf8')
    const a0 = jx.indexOf("screen === 'attract' &&")
    const a1 = jx.indexOf("screen === 'over' &&")
    const block = jx.slice(a0, a1)
    r.check('only the press prompt is a raw paragraph (no stacked rules)', (block.match(/<p\b/g) || []).length === 1, `${(block.match(/<p\b/g) || []).length}`)
    r.check('the attract reads copy from the shared module', block.includes('{MESSAGES}'))
    r.check('the press prompt comes from the shared module', block.includes('{PRESS}'))
    r.check('the press prompt blinks', block.includes('animate-pulse'))
    const dim = block.match(/bg-black\/(\d+)/)
    r.check('the demo dims behind the attract text', !!dim && Number(dim[1]) >= 40, dim ? dim[0] : 'no scrim')
    r.check('the attract drives the same autopilot the harness grades', /step\(demo, plan\(demo\)\)/.test(jx))
    r.check('the pad carries PUNCH and a second EAT action',
        /aLabel:\s*'PUNCH'/.test(readFileSync(REG, 'utf8')) && /label:\s*'EAT',\s*code:\s*'KeyB'/.test(jx))
}

// ------------------------------------------------ tower crash + 300 pts ----
const flatten = (gs) => {
    let guard = 0
    while (buildingsLeft(gs) && guard++ < 40000) {
        const b = gs.buildings.find((x) => x.alive && !x.crumbling)
        if (b) sideOf(gs, b, gs.player.x <= b.x + b.w / 2 ? -1 : 1)
        play(gs, b ? { a: gs.tick % 2 === 0 } : {})
    }
    until(gs, () => gs.state === 'clear', 20)
}

{
    const gs = makeGame({ seed: 7 })
    disarm(gs)
    clearEv(gs)
    const b = gs.buildings[0]
    sideOf(gs, b, -1)
    let n = 0
    while (b.alive && b.crumbling === 0 && n++ < 400) play(gs, { a: gs.tick % 2 === 0 })
    r.check('a tower takes exactly ceil(height/34) solid hits before it starts to fall', b.hp === 0 && b.crumbling > 0, `hp-was=${Math.ceil(b.maxhp)} h=${b.h}`)
    const evs = []
    until(gs, () => !b.alive, 90); evs.push(...clearEv(gs))
    r.check('the falling tower flattens into rubble and reports landed', !b.alive && b.crumbling === 0 && gs.rubbles.length === 1 && evs.some((e) => e.t === 'landed'))
    r.check('the crash pays a literal 300', evs.some((e) => e.t === 'points' && e.pts === 300), evs.filter((e) => e.t === 'points').map((e) => e.pts).join('+'))
    r.check('a razed city trips CITY CLEARED and banks a literal 1000', (() => {
        const gs2 = makeGame({ seed: 9 }); isolate(gs2); clearEv(gs2)
        flatten(gs2)
        return gs2.state === 'clear' && clearEv(gs2).some((e) => e.t === 'points' && e.pts === 1000)
    })())
}

// --------------------------------------------------- the new-day ledger ----
{
    const gs = makeGame({ seed: 9 }); isolate(gs)
    flatten(gs)
    r.check('clearing banks 1000 on the board before dawn', gs.score >= 1000, `score=${gs.score}`)
    until(gs, () => gs.state === 'play' && gs.day === 2, 200)
    r.check('dawn rolls a fresh map: day 2 is Chicago with 10 towers',
        gs.day === 2 && cityName(gs.cityIndex) === 'CHICAGO, IL' && buildingsLeft(gs) === 10, `b=${buildingsLeft(gs)}`)
    r.check('the morning papers print a fresh giant (+1 life)', gs.lives === 4)
    r.check('the new day arms the blimp rewind with a fresh dawn score', gs.dayStartScore === gs.score, `dawn=${gs.dayStartScore}`)
    r.check('the tour gets harder every dawn (day 3 brings 2 tanks)', (() => {
        const gs3 = makeGame({ seed: 3 }); gs3.day = 3; buildCity(gs3)
        return gs3.tanks.length === 2 && gs3.civilians.length === 10 && buildingsLeft(gs3) === 10
    })(), 'day 3: 2 tanks, 10 civilians')
    {
        const gs6 = makeGame({ seed: 9, lives: 6 }); isolate(gs6)
        flatten(gs6); until(gs6, () => gs6.day === 2, 200)
        r.check('lives cap at six, no matter how many dawns', gs6.lives === 6, `lives=${gs6.lives}`)
    }
    {
        const gsw = makeGame({ seed: 5 }); isolate(gsw)
        gsw.day = DAYS
        flatten(gsw)
        until(gsw, () => gsw.end, CLEAR_T + 10)
        r.check('clearing the twelfth city wins the whole tour', gsw.end === 'won' && gsw.won === true)
    }
}

// --------------------------------------------- the blimp rescue (#spec) ----
{
    const gs = makeGame({ seed: 3 }); disarm(gs)
    // bank a first kill so the rewind has something to take away
    const b0 = gs.buildings[0]
    sideOf(gs, b0, -1)
    let n = 0
    while (b0.crumbling === 0 && n++ < 400) play(gs, { a: gs.tick % 2 === 0 })
    until(gs, () => !b0.alive, 90)
    r.check('the giant scores before it dies (the rewind has prey)', gs.score > 300, `score=${gs.score}`)
    clearEv(gs)
    gs.player.invuln = 0
    damagePlayer(gs, 999)
    const revEvs0 = clearEv(gs)
    r.check('an empty bar costs one life and shrinks the giant to human',
        gs.lives === 2 && gs.player.reverting && gs.player.revertPhase === 'walk' && revEvs0.some((e) => e.t === 'revert'))
    const phases = []
    const revEvs = []
    let guard = 0
    while (gs.player.reverting && guard++ < 2500) {
        const ph = gs.player.revertPhase
        if (ph && phases[phases.length - 1] !== ph) phases.push(ph)
        play(gs); revEvs.push(...clearEv(gs))
    }
    r.check('the news blimp walks in, descends, lifts and drops the giant back',
        JSON.stringify(phases) === JSON.stringify(['walk', 'blimp_in', 'descend', 'carry']), phases.join(' > '))
    r.check('the rescue tells its story in events (revert, blimp_in, lift, back)',
        revEvs.some((e) => e.t === 'blimp_in') && revEvs.some((e) => e.t === 'lift') && revEvs.some((e) => e.t === 'back'))
    r.check('the giant is back on the boulevard at full power', gs.player.hp === 100 && gs.player.onGround && !gs.player.reverting)
    r.check('the day\'s score unwinds to dawn', gs.score === gs.dayStartScore, `score=${gs.score} dawn=${gs.dayStartScore}`)
    r.check('mercy shields the drop (>= 100 ticks of invulnerability)', gs.player.invuln >= 100, `invuln=${gs.player.invuln}`)
    r.check('the blimp drifts off frame after the drop, and no extra life is spent', !!gs.blimpOut && gs.lives === 2)
}

// -------------------------------------------------------- the lives law ----
{
    const gs = makeGame({ seed: 4, lives: 1 })
    gs.player.invuln = 0
    damagePlayer(gs, 999)
    r.check('the last life ends the tour — no blimp for a finished giant',
        gs.end === 'over' && gs.lives === 0 && !gs.player.reverting)
    const gs3 = makeGame({ seed: 4 })
    for (let i = 0; i < 2; i++) {
        gs3.player.invuln = 0
        damagePlayer(gs3, 999)
        if (i === 0) until(gs3, () => !gs3.player.reverting, 2500)
    }
    r.check('three hits take three lives (rescues included)', gs3.lives === 1, `lives=${gs3.lives}`)
}

// ------------------------------------------------------- bullets + stun ----
{
    const gs = makeGame({ seed: 6 })
    disarm(gs)
    gs.player.x = 200; gs.player.y = GROUND; gs.player.onGround = true; gs.player.invuln = 0
    gs.bullets.push({ x: 200, y: GROUND - 50, vx: 0, vy: 0, life: 30, col: '#fff' })
    play(gs)
    r.check('a bullet takes a literal 9 HP and flickers 48 ticks of mercy',
        gs.player.hp === 91 && gs.player.invuln === 48, `hp=${gs.player.hp} inv=${gs.player.invuln}`)
    gs.bullets.push({ x: 200, y: GROUND - 50, vx: 0, vy: 0, life: 30, col: '#fff' })
    play(gs)
    r.check('mercy flicker is real: a second bullet during it does nothing', gs.player.hp === 91)
    const stun = makeGame({ seed: 8 })
    stun.player.stunT = 60
    const x0 = stun.player.x
    for (let i = 0; i < 40; i++) play(stun, { right: true, a: true, up: true, b: true })
    r.check('a stunned giant cannot walk, punch, climb or eat', stun.player.x === x0 && stun.player.attackT === 0)
    until(stun, () => stun.player.stunT === 0, 120)
    play(stun, { right: true })
    r.check('the stun wears off and the giant walks again', stun.player.x > x0)
}

// ------------------------------------------------ combo, meals and loot ----
{
    const gs = makeGame({ seed: 2 }); disarm(gs)
    gs.player.hp = 60; gs.combo = 1; gs.comboT = 0
    const c = gs.civilians[0]
    gs.player.x = c.x
    clearEv(gs)
    play(gs, { b: true })
    r.check('EAT hauls in a meal: +16 HP and a literal 250 at combo x1',
        gs.player.hp === 76 && gs.score === 250, `hp=${gs.player.hp} score=${gs.score}`)
    r.check('the combo rides the meal (x1 -> x1.5, and it decays)', gs.combo === 1.5 && gs.comboT === 300)
    gs.comboT = 1; play(gs)
    r.check('a quiet five seconds drops the combo back to x1', gs.combo === 1)
    gs.combo = 8; gs.player.hp = 99
    const s1 = gs.score
    for (const cc of gs.civilians) cc.x = gs.player.x + 40
    play(gs, { b: true })
    r.check('the combo caps at x8 (a meal pays 2000, never more)', gs.score - s1 === 2000, `delta=${gs.score - s1}`)
    // a punched waving civilian pays 100 + 150 and lifts the combo
    const gs2 = makeGame({ seed: 2 }); isolate(gs2)
    // the block past the last tower is guaranteed clear street (layout margin)
    const w = gs2.civilians[0]
    w.x = gs2.cityLen - 140; w.waving = true
    gs2.player.x = w.x - 20; gs2.player.facing = 1; gs2.combo = 1; gs2.comboT = 0
    gs2.civilians.forEach((cc, i) => { if (i !== 0) cc.x = i % 2 ? 60 : gs2.cityLen - 400 })
    clearEv(gs2)
    play(gs2, { a: true })
    const pts = clearEv(gs2).filter((e) => e.t === 'points').map((e) => e.pts)
    r.check('mercy is not in the score table: a waving civilian pays 100 + 150 and lifts the combo',
        pts.includes(100) && pts.includes(150) && gs2.combo === 1.5, `pts=${pts.join('+')} combo=${gs2.combo}`)
}

// ------------------------------------------------- the window loot table ----
{
    const evs = []
    let food = 0, cash = 0, bomb = 0, stun = 0
    const playAll = (gs, inp) => { play(gs, inp); evs.push(...clearEv(gs)) }
    const sweep = (gs) => {
        let guard = 0
        while (buildingsLeft(gs) && guard++ < 60000) {
            const b = gs.buildings.find((x) => x.alive && !x.crumbling)
            if (!b) { playAll(gs, {}); continue }
            const open = b.wins.some((w) => !w.shattered)
            if (!open) { b.hp = 1; sideOf(gs, b, -1); playAll(gs, { a: gs.tick % 2 === 0 }); continue }
            b.sw = (b.sw || 0) + 1
            const side = b.sw % 2 === 0 ? 1 : -1
            sideOf(gs, b, side)
            b.hp = 1e9   // the tower holds still while every window gets rattled
            playAll(gs, { up: true })
            const top = GROUND - b.h
            let t = 0
            if (gs.player.climb === b) {
                while (gs.player.climb === b && gs.player.y > top + 70 && t++ < 400) playAll(gs, { up: true })
                // ride the facade back down, firing: the down-aim fist passes every row
                while (gs.player.climb === b && t++ < 1400) playAll(gs, { down: true, a: t % 3 === 0 })
            }
        }
    }
    for (const seed of [21, 22, 23, 24, 25, 26]) {
        const gs = makeGame({ seed })
        sweep(gs)
        // finish whatever is left standing with ground punches
        disarm(gs)
        let n = 0
        while (buildingsLeft(gs) && n++ < 20000) {
            const b = gs.buildings.find((x) => x.alive && !x.crumbling)
            if (b) sideOf(gs, b, n % 4 < 2 ? -1 : 1)
            playAll(gs, b ? { a: gs.tick % 2 === 0, down: gs.tick % 6 === 0 } : {})
        }
        for (const e of evs) {
            if (e.t !== 'popup') continue
            if (e.msg === '+FOOD') food++
            else if (e.msg === '+$') cash++
            else if (e.msg === 'BOMB!') bomb++
            else if (e.msg === 'STUNNED!') stun++
        }
    }
    const total = food + cash + bomb + stun
    r.check('the loot sweep smashes enough windows to judge the table (>= 800)', total >= 800, `n=${total}`)
    const f = food / total, c2 = cash / total, b2 = bomb / total, s2 = stun / total
    r.check('four in ten windows hide FOOD', Math.abs(f - 0.45) < 0.06, `${(f * 100).toFixed(1)}%`)
    r.check('three in ten hide CASH', Math.abs(c2 - 0.35) < 0.06, `${(c2 * 100).toFixed(1)}%`)
    r.check('one in eight hides a BOMB', Math.abs(b2 - 0.12) < 0.05, `${(b2 * 100).toFixed(1)}%`)
    r.check('one in twelve jumps out and STUNS', Math.abs(s2 - 0.08) < 0.045, `${(s2 * 100).toFixed(1)}%`)
    r.check('every loot kind actually happens', food > 0 && cash > 0 && bomb > 0 && stun > 0)
}

// ------------------------------------------------------- climb the wall ----
{
    const gs = makeGame({ seed: 12 })
    disarm(gs)
    const b = gs.buildings[2]
    sideOf(gs, b, -1)
    clearEv(gs)
    play(gs, { up: true })
    r.check('UP at a tower face grabs the wall (a jump beside a tower becomes a climb)',
        gs.player.climb === b && !gs.player.onGround)
    const y0 = gs.player.y
    for (let i = 0; i < 60; i++) play(gs, { up: true })
    r.check('holding UP scales the facade at ~3.25 px/tick', gs.player.climb === b && y0 - gs.player.y > 180, `climbed=${y0 - gs.player.y}`)
    until(gs, () => gs.player.y <= GROUND - b.h, b.h + 60, () => play(gs, { up: true }))
    r.check('the roof catches the climber (grounded two floors up)',
        gs.player.onGround && !gs.player.climb && Math.abs(gs.player.y - (GROUND - b.h)) < 1, `y=${Math.round(gs.player.y)} top=${GROUND - b.h}`)
    const hp0 = b.hp
    for (let i = 0; i < 40; i++) { play(gs, { a: gs.tick % 2 === 0 }) }
    r.check('a rooftop punch cracks the tower it stands on (auto down-aim)', b.hp < hp0 || b.crumbling > 0)
    // climb back down the far side and drop off
    const other = gs.buildings.find((x) => x.alive && !x.crumbling && x !== b) || b
    sideOf(gs, other, 1)
    gs.player.stunT = 0
    play(gs, { up: true })
    const yc = gs.player.y
    for (let i = 0; i < 400 && gs.player.climb === other; i++) play(gs, { down: true })
    r.check('holding DOWN descends the wall back to the street', gs.player.y >= GROUND - 1 && !gs.player.climb, `y=${Math.round(gs.player.y)}`)
    // push-off
    sideOf(gs, other, -1)
    gs.player.stunT = 0   // a window earlier may have sprung a bomb on us; this rule needs free hands
    play(gs, { up: true })
    clearEv(gs)
    play(gs, { left: true })
    r.check('← / → on a wall pushes off with a jump event and outward speed',
        !gs.player.climb && gs.player.vx < 0 && gs.events.some((e) => e.t === 'jump'))
    // towers block the street
    const gs2 = makeGame({ seed: 15 })
    disarm(gs2)
    const t2 = gs2.buildings[1]
    gs2.player.x = t2.x + t2.w / 2; gs2.player.y = GROUND; gs2.player.onGround = true; gs2.player.vx = 0
    play(gs2)
    r.check('a standing tower blocks the boulevard (the flanker gets pushed out)',
        gs2.player.x < t2.x || gs2.player.x > t2.x + t2.w, `x=${Math.round(gs2.player.x)} tower=${Math.round(t2.x)}..${Math.round(t2.x + t2.w)}`)
}

// ------------------------------------------- determinism (#494) + the tour ----
{
    const run = (seed, maxTicks, opts = {}, stop) => {
        const gs = makeGame({ seed, ...opts })
        const hashes = []
        let t = 0
        while (!gs.end && t < maxTicks && !(stop && stop(gs))) {
            step(gs, plan(gs)); t++
            if (t % 997 === 0) hashes.push(stateHash(gs))
        }
        return { gs, t, hashes }
    }
    const A = run(11, 60000)
    const B = run(11, 60000)
    r.check('seed + autopilot replay hash-for-hash (#494)',
        A.hashes.length > 0 && JSON.stringify(A.hashes) === JSON.stringify(B.hashes), `${A.hashes.length} checkpoints`)
    const C = run(12, 60000)
    r.check('a different seed storms a different city', A.hashes.length > 0 && A.hashes[0] !== C.hashes[0], `A@997=${A.hashes[0]} C@997=${C.hashes[0]}`)
    const D = run(11, 18000, {}, (g) => g.day >= 2)
    r.check('the autopilot razes day 1 (Peoria) inside five minutes of world time',
        D.gs.day >= 2 && !D.gs.end && D.gs.lives >= 1, `ticks=${D.t} (~${(D.t / 60).toFixed(0)}s) lives=${D.gs.lives}`)
    let win = null, slacks = []
    for (const s of [11, 13, 29, 71, 424242]) {
        const w = run(s, 120000, { lives: 2 })   // the slack rule: one fewer than dealt
        slacks.push(`${s}:${w.gs.end || 'unfinished'}@${w.t}`)
        if (!win && w.gs.end === 'won') win = { s, w }
        if (win) break
    }
    r.check('the autopilot WINS the twelve-city tour with one fewer life than dealt (slack)',
        !!win, slacks.join(' '))
    if (win) {
        r.check('a won tour ends clean: end=won, twelve dawns, every city banked',
            win.w.gs.end === 'won' && win.w.gs.day === DAYS + 1 && win.w.gs.score >= 12000,
            `seed=${win.s} score=${win.w.gs.score} lives=${win.w.gs.lives} ticks=${win.w.t}`)
        const R1 = run(win.s, 120000, { lives: 2 })
        r.check('the winning tour is deterministic end-to-end (replay hash-for-hash)',
            R1.gs.end === 'won' && R1.gs.score === win.w.gs.score && JSON.stringify(R1.hashes) === JSON.stringify(win.w.hashes),
            `replay=${R1.gs.score}`)
    } else {
        r.check('the winning tour is deterministic end-to-end (replay hash-for-hash)', false, 'no winning seed to replay')
    }
}

// ----------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    const MUTANTS = [
        ['a fresh giant starts with 4 lives', SIMF, 'export const START_LIVES = 3', 'export const START_LIVES = 4'],
        ['the cash band slides off the loot table', SIMF, '} else if (roll < 0.8) {', '} else if (roll < 0.6) {'],
        ['the blimp forgets to rewind the day\'s score', SIMF, 'gs.score = gs.dayStartScore', 'gs.score = gs.score || 0'],
        ['the tower crash pays 250 instead of 300', SIMF, 'addScore(gs, 300, b.x + b.w / 2, GROUND - b.h - 20)', 'addScore(gs, 250, b.x + b.w / 2, GROUND - b.h - 20)'],
        ['the morning papers stop printing giants', SIMF, 'gs.lives = Math.min(gs.lives + 1, LIFE_CAP)', 'gs.lives = gs.lives'],
        ['the blimp drops you at half health', SIMF, 'p.hp = HP_MAX\n            p.invuln = RESPAWN_T', 'p.hp = 50\n            p.invuln = RESPAWN_T'],
        ['attract copy wraps the pane', MF, '    \'FALL AND THE NEWS BLIMP HAULS YOU BACK\',\n', '    \'FALL FLAT ON THE BOULEVARD AND THE NEWS CREW FILMS IT ALL AND HAULS YOUR HUMAN HALF BACK TO THE DAWN\',\n'],
        ['a harness leak lands in a visible line', MF, '    \'EAT THE TRAFFIC TO HEAL\',\n', '    \'stompcheck.mjs audits the loot table rolls\',\n'],
        ['the demo stops dimming', JX, 'bg-black/55', 'bg-black/0'],
        ['the press prompt stops blinking', JX, 'animate-pulse text-yellow-300', 'opacity-100 text-yellow-300'],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { r.check(`mutant anchor: ${name}`, false, file); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, [SELF], { encoding: 'utf8' })
        if (res.status !== 0) { died++; r.check(`mutant dies: ${name}`, true) }
        else r.check(`mutant dies: ${name}`, false, 'child passed despite the bug')
        pull(file)
    }
    r.check(`all ${MUTANTS.length} mutants die`, died === MUTANTS.length, `${died}/${MUTANTS.length}`)
}

r.exit()
