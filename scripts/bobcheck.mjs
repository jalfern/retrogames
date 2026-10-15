// bobcheck — BUBBLE BOBBLE in plain Node, no browser.
//   geometry : all 100 generated levels audited with an INDEPENDENT walker
//              (this file's own reachability model, not the planner's graph):
//              door and every ground spawn reachable from the entry drop
//   rules    : trap -> float -> pop pays CHAIN_PAY by chain index; unpopped
//              traps release angry and reset the chain; E,X,T,E,N,D = EXTEND
//              1UP; LIGHTNING zaps every free enemy (Blubba survives it);
//              water turns floor walkers into snails (slow, still trappable);
//              red power breathes fire (flat 200 kills); the boss takes three
//              bubble hits; the door opens only when the roster is empty;
//              max-size bubbles block walking; platforms are one-way (jump
//              up through, drop down with down); a HURRY UP! warning leads
//              von Blubba, who is unkillable — even lightning
//   win      : testbed clears level 100 -> end 'win'
//   pilot    : seed 0 clears >= 1 level within its 3 lives; survives the
//              lives-1 slack; the attract run's score equals its event ledger
//   co-op    : two players drive without error and bank kills
//   determinism : same seed twice -> identical digest
// `-- --mutate` re-plants four fixed bugs in fresh child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const L = await import('../src/games/BubbleBobble/levels.js')
const { CELL, COLS, W, H, FIELD_Y0, FLOOR_ROW, chainPay, CHAIN_PAY, LEVEL_COUNT, isBossLevel } = L

async function fresh() {
    const sim = await import(`../src/games/BubbleBobble/sim.js?c=${Date.now()}${Math.random()}`)
    const planner = await import(`../src/games/BubbleBobble/planner.js?c=${Date.now()}${Math.random()}`)
    return { ...sim, plan: planner.plan }
}
const S = await fresh()
const { makeGame, step, CFG } = S

// ---------------------------------------------------------------- geometry ----
// independent reachability: stand cells, walks, falls, 2-row jumps, ladders,
// drop-throughs (down) — written from the rules, not from planner.graphOf
console.log('geometry')
{
    const stand = (lv, r, c) => c >= 0 && c < COLS && (r === FLOOR_ROW || lv.platforms.some((p) => p.row === r && c >= p.c0 && c <= p.c1))
    let bad = 0
    for (let n = 0; n < LEVEL_COUNT; n++) {
        const lv = L.genLevel(n)
        const edges = (r, c) => {
            const out = []
            if (stand(lv, r, c + 1)) out.push([r, c + 1])
            if (stand(lv, r, c - 1)) out.push([r, c - 1])
            for (let r2 = r + 1; r2 <= FLOOR_ROW; r2++) if (stand(lv, r2, c)) { out.push([r2, c]); break }
            for (const dr of [-1, -2]) for (let dc = -2; dc <= 2; dc++) {
                if (stand(lv, r + dr, c + dc)) out.push([r + dr, c + dc])
            }
            for (const l of lv.ladders) {
                if (l.col !== c) continue
                const lo = Math.min(l.rowTop, l.rowBot), hi = Math.max(l.rowTop, l.rowBot)
                if (r >= lo && r <= hi) for (const r2 of [lo, hi]) if (r2 !== r && stand(lv, r2, c)) out.push([r2, c])
            }
            return out
        }
        // entry falls to the first stand cell below
        let startR = lv.entry.row
        while (startR <= FLOOR_ROW && !stand(lv, startR, lv.entry.col)) startR++
        const seen = new Set()
        const q = [[Math.min(startR, FLOOR_ROW), lv.entry.col]]
        while (q.length) {
            const [r, c] = q.pop()
            const k = `${r},${c}`
            if (seen.has(k)) continue
            seen.add(k)
            for (const [r2, c2] of edges(r, c)) if (!seen.has(`${r2},${c2}`)) q.push([r2, c2])
        }
        const doorOk = seen.has(`${lv.door.row},${lv.door.col}`)
        const ground = lv.spawns.filter((s) => s.kind !== 'pulppul' && s.kind !== 'boss')
        const spawnOk = ground.every((s) => seen.has(`${s.row === FLOOR_ROW || !lv.platforms.some((p) => p.row === s.row && s.col >= p.c0 && s.col <= p.c1) ? FLOOR_ROW : s.row},${s.col}`))
        if (!doorOk || !spawnOk) { bad++; if (bad <= 3) console.log(`  level ${n + 1}: door ${doorOk} groundSpawns ${spawnOk}`) }
    }
    ok(bad === 0, 'all 100 levels: door + ground spawns reachable from entry', `${bad} levels failed`)
}

// ------------------------------------------------------------------- rules ----
console.log('rules')
const rowOf = (y) => Math.round((y - FIELD_Y0) / CELL)
function platformOf(gs) { return gs.lv.platforms.find((p) => p.c1 - p.c0 >= 4) }

function rig(gs, prow, pcol, ecol, kind = 'zenchan') {
    const p = gs.players[0]
    gs.lv.platforms.forEach((pl) => { if (pl.row === prow) { pl.c0 = 0; pl.c1 = COLS - 1 } })
    gs.lv.ladders.length = 0
    p.x = (pcol + 0.5) * CELL; p.y = FIELD_Y0 + prow * CELL - 8; p.vy = 0; p.onGround = true; p.dir = ecol > pcol ? 1 : -1
    gs.enemies = [{
        id: 900, kind, x: (ecol + 0.5) * CELL, y: FIELD_Y0 + prow * CELL - 8,
        dir: ecol > pcol ? -1 : 1, state: 'walk', trapT: 0, angry: false, snail: false,
        hp: 1, span: { row: prow, c0: 0, c1: COLS - 1 }, phase: 7, diveT: 0, home: { x: 0, y: 0 },
    }]
    // a parked dummy on a far row keeps the roster alive: an empty roster
    // opens the door and the level bonus contaminates every ledger
    gs.enemies.push({
        id: 902, kind: 'zenchan', x: (13 + 0.5) * CELL, y: FIELD_Y0 + (prow + 2) * CELL - 8,
        dir: 1, state: 'walk', trapT: 0, angry: false, snail: false, hp: 1,
        span: { row: prow + 2, c0: 12, c1: 13 }, phase: 3, diveT: 0, home: { x: 0, y: 0 },
    })
    gs.bubbles = []
    gs.items = []
    gs.blubbas = []
    gs.kills = 0
    gs.levelPhase = 'play'
    gs.door.open = false
    gs.players[0].invuln = 9999
}
function trapOnce(gs) {
    const dir = gs.players[0].dir > 0 ? { right: true } : { left: true }
    let trapped = false
    for (let i = 0; i < 200 && !trapped; i++) {
        step(gs, { ...dir, fire: i === 0 })
        trapped = gs.bubbles.some((b) => b.trapped)
        gs.events.length = 0
    }
    return trapped
}
function walkIntoAndPop(gs) {
    for (let i = 0; i < 260; i++) {
        const b = gs.bubbles.find((x) => x.trapped)
        if (!b) return true
        const p = gs.players[0]
        step(gs, { left: b.x < p.x - 2, right: b.x > p.x + 2, up: b.y < p.y - 12 })
        gs.events.length = 0
    }
    return false
}
{
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 8)
    ok(trapOnce(gs), 'a walking enemy into a bubble gets TRAPPED')
    const before = gs.score
    ok(walkIntoAndPop(gs), 'the player pops the trapped bubble by touching it')
    const got = gs.score - before
    ok(got === CHAIN_PAY[0], `first pop pays ${CHAIN_PAY[0]}`, `got ${got}`)
    rig(gs, P.row, 2, 8)
    ok(trapOnce(gs), 'second trap')
    const before2 = gs.score
    ok(walkIntoAndPop(gs), 'second pop')
    ok(gs.score - before2 === CHAIN_PAY[1], `chain-2 pop pays ${CHAIN_PAY[1]} (chain ledger escalates)`, `got ${gs.score - before2}`)
}
{
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 8)
    trapOnce(gs)
    let escaped = null
    for (let i = 0; i < CFG.escapeTicks + 60 && !escaped; i++) {
        gs.players[0].x = 20
        step(gs, {})
        escaped = gs.events.find((e) => e.type === 'escape')
        gs.events.length = 0
    }
    ok(!!escaped && gs.enemies[0].angry && gs.chain === 0, 'un-popped trap releases the enemy ANGRY and resets the chain')
}
{
    // max-size bubbles block the walk; small ones pass
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 12)
    gs.bubbles = [{ id: 1, kind: 'bubble', owner: 1, x: (6 + 0.5) * CELL, y: FIELD_Y0 + P.row * CELL - 8, vx: 0, vy: 0, r: CFG.bubbleMax, max: CFG.bubbleMax, life: 200, letter: null, trapped: null, hitIds: null }]
    for (let i = 0; i < 60; i++) { step(gs, { right: true }); gs.events.length = 0 }
    ok(gs.players[0].x < 6 * CELL, 'a max-size bubble blocks the walk', `stopped at ${gs.players[0].x.toFixed(0)}`)
    const g2 = makeGame(0)
    rig(g2, P.row, 2, 12)
    g2.bubbles = [{ id: 1, kind: 'bubble', owner: 1, x: (6 + 0.5) * CELL, y: FIELD_Y0 + P.row * CELL - 8, vx: 0, vy: 0, r: 5, max: CFG.bubbleMax, life: 200, letter: null, trapped: null, hitIds: null }]
    for (let i = 0; i < 60; i++) { step(g2, { right: true }); g2.events.length = 0 }
    ok(g2.players[0].x > 6 * CELL, 'a small bubble does not block', `passed to ${g2.players[0].x.toFixed(0)}`)
}
{
    // bubble schedule carries the EXTEND letters in order…
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 8)
    gs.bubbleSeq = 2
    step(gs, { right: true, fire: true })
    const lb = gs.bubbles.find((b) => b.letter)
    ok(!!lb && lb.letter === 'E', 'every 7th bubble carries the next EXTEND letter (E first)', lb ? lb.letter : 'none')
    // …and collecting all six pays the 1UP
    let got = 0
    let extended = false
    for (let round = 0; round < 6; round++) {
        gs.items.push({ id: 60 + round, kind: 'letter', ch: L.LETTERS[round], x: gs.players[0].x, y: gs.players[0].y, vy: 0, life: 100, grounded: true })
        for (let i = 0; i < 20 && !extended; i++) {
            step(gs, {})
            if (gs.events.some((e) => e.type === 'letter')) got++
            if (gs.events.some((e) => e.type === 'extend')) extended = true
            gs.events.length = 0
        }
    }
    ok(got === 6 && extended && gs.lives === 4, 'E,X,T,E,N,D -> EXTEND -> +1 life', `letters=${got} lives=${gs.lives}`)
}
{
    // LIGHTNING zaps all free enemies — but never Blubba
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 8)
    gs.enemies.push({ id: 901, kind: 'zenchan', x: 30, y: FIELD_Y0 + P.row * CELL - 8, dir: 1, state: 'walk', trapT: 0, angry: false, snail: false, hp: 1, span: { row: P.row, c0: 0, c1: COLS - 1 }, phase: 3, diveT: 0, home: { x: 0, y: 0 } })
    gs.blubbas = [{ id: 999, x: 40, y: 40 }]
    gs.chain = 8
    trapOnce(gs)
    walkIntoAndPop(gs)
    ok(gs.items.some((it) => it.kind === 'lightning'), 'chain 9 drops LIGHTNING')
    const it = gs.items.find((x) => x.kind === 'lightning')
    gs.enemies[0].x = 240
    for (let i = 0; i < 80 && gs.items.some((x) => x.kind === 'lightning'); i++) {
        const p = gs.players[0]
        const cur = gs.items.find((x) => x.kind === 'lightning')
        if (cur) { p.x = cur.x; p.y = cur.y }
        step(gs, {})
        gs.events.length = 0
    }
    ok(gs.enemies.length === 0 && gs.blubbas.length === 1, 'LIGHTNING zaps every free enemy — Blubba survives it', `en ${gs.enemies.length} blubba ${gs.blubbas.length}`)
}
{
    // water -> snail on a wet theme (SEA FLOOR starts at level index 30)
    const gs = makeGame(0)
    gs.lv = L.genLevel(30)
    gs.lv._g = null
    gs.door = { x: (gs.lv.door.col + 0.5) * CELL, y: FIELD_Y0 + gs.lv.door.row * CELL - 12, open: false }
    gs.enemies = gs.lv.spawns.map((s, i) => {
        const col = s.col
        return { id: 800 + i, kind: s.kind === 'boss' ? 'zenchan' : s.kind, x: (col + 0.5) * CELL, y: s.kind === 'pulppul' ? FIELD_Y0 + s.row * CELL : H - 8, dir: 1, state: s.kind === 'pulppul' ? 'float' : 'walk', trapT: 0, angry: false, snail: false, hp: 1, span: { row: FLOOR_ROW, c0: 0, c1: COLS - 1 }, phase: i * 9, diveT: 0, home: { x: 0, y: 0 } }
    })
    step(gs, {})
    const walkers = gs.enemies.filter((e) => e.state === 'walk')
    ok(walkers.length > 0 && walkers.every((e) => e.snail), 'floor walkers in water become SNAILS')
    const x0 = walkers[0].x
    for (let i = 0; i < 30; i++) { walkers[0].x = x0; step(gs, {}); gs.events.length = 0 }
    ok(Math.abs(walkers[0].x - x0) < 12, 'snails crawl slowly', `moved ${(walkers[0].x - x0).toFixed(1)}px in 30t`)
    // trappable
    const p = gs.players[0]
    p.x = x0 - 40; p.y = H - 8; p.onGround = true
    let trapped = false
    for (let i = 0; i < 200 && !trapped; i++) { step(gs, { right: true, fire: i === 0 }); trapped = gs.bubbles.some((b) => b.trapped); gs.events.length = 0 }
    ok(trapped, 'a snail can still be trapped')
}
{
    // fire power
    const gs = makeGame(0)
    const P = platformOf(gs)
    rig(gs, P.row, 2, 8)
    gs.players[0].power = 'red'
    const before = gs.score
    let killed = false
    for (let i = 0; i < 120 && !killed; i++) {
        step(gs, { right: true, fire: i === 0 })
        killed = gs.events.some((e) => e.type === 'flameKill')
        gs.events.length = 0
    }
    ok(killed && gs.score - before === CFG.flamePts, `red power breathes fire for a flat ${CFG.flamePts}`, `got ${gs.score - before}`)
}
{
    // boss: three bubble hits
    const gs = makeGame(0)
    gs.lv = L.genLevel(19)
    gs.lv._g = null
    gs.door = { x: (gs.lv.door.col + 0.5) * CELL, y: FIELD_Y0 + gs.lv.door.row * CELL - 12, open: false }
    gs.enemies = gs.lv.spawns.filter((s) => s.kind === 'boss').map((s, i) => ({ id: 700 + i, kind: 'boss', x: (s.col + 0.5) * CELL, y: FIELD_Y0 + s.row * CELL, dir: 1, state: 'boss', trapT: 0, angry: false, snail: false, hp: 3, span: null, phase: 0, diveT: 0, home: { x: 0, y: 0 } }))
    ok(gs.enemies.length === 1 && isBossLevel(19), 'every 20th level carries a boss (level 20)')
    let hits = 0, killedev = false
    for (let i = 0; i < 900 && !killedev; i++) {
        const p = gs.players[0]
        p.x = gs.enemies[0] ? gs.enemies[0].x : p.x
        p.y = Math.max(FIELD_Y0 + 24, (gs.enemies[0] ? gs.enemies[0].y : p.y) + 20)
        p.invuln = 999
        gs.bubbles = []
        step(gs, { fire: i % 15 === 0 })
        hits += gs.events.filter((e) => e.type === 'bossHit').length
        killedev = gs.events.some((e) => e.type === 'bossKill')
        gs.events.length = 0
    }
    ok(hits >= 3 && killedev && gs.score >= L.BOSS_POINTS, 'the boss dies to three bubble hits and pays BIG', `hits=${hits}`)
}
{
    // Blubba: a HURRY UP! warning leads his arrival; nothing kills him
    const gs = makeGame(0)
    gs.lives = 9
    const p = gs.players[0]
    p.invuln = 999999
    gs.lingerT = gs.lv.blubbaAt - CFG.hurryTicks - 1
    step(gs, {})
    ok(gs.events.some((e) => e.type === 'blubbaWarn') && gs.blubbas.length === 0, 'HURRY UP! flashes while Blubba is still off screen')
    let arrived = null
    for (let i = 0; i < CFG.hurryTicks + 10; i++) {
        step(gs, {})
        if (arrived === null && gs.events.some((e) => e.type === 'blubba')) arrived = gs.lingerT
        gs.events.length = 0
    }
    ok(gs.blubbas.length === 1 && arrived === gs.lv.blubbaAt, 'von Blubba arrives exactly when the level timer runs out', `arrived ${arrived} vs ${gs.lv.blubbaAt}`)
    gs.items = [{ id: 5, kind: 'lightning', x: p.x, y: p.y, vy: 0, life: 100, grounded: true }]
    step(gs, {})
    ok(gs.blubbas.length === 1 && !gs.events.some((e) => e.type === 'blubbaGone'), 'Blubba is unkillable — even lightning leaves him on screen')
}
{
    // door discipline + the win path at level 100
    const gs = makeGame(0)
    gs.lives = 9
    step(gs, {})
    ok(!gs.door.open, 'the door stays shut while the roster lives')
    gs.level = LEVEL_COUNT - 1
    gs.lv = L.genLevel(LEVEL_COUNT - 1)
    gs.lv._g = null
    gs.door = { x: (gs.lv.door.col + 0.5) * CELL, y: FIELD_Y0 + gs.lv.door.row * CELL - 12, open: false }
    gs.enemies = []
    step(gs, {})
    ok(gs.door.open, 'the door OPENS when the roster is dead')
    gs.players[0].x = gs.door.x; gs.players[0].y = gs.door.y
    step(gs, {})
    ok(gs.levelPhase === 'clear', 'walking into the open door clears the level')
    for (let i = 0; i < CFG.clearPause + 2 && !gs.end; i++) { step(gs, {}); gs.events.length = 0 }
    ok(gs.end === 'win', 'clearing level 100 ends the game — WIN')
}
{
    // one-way platforms + drop-through, on a built two-row testbed
    const gs = makeGame(0)
    gs.lives = 9
    gs.lv = L.genLevel(0)
    gs.lv._g = null
    gs.lv.platforms = [{ row: 6, c0: 2, c1: 12 }, { row: 8, c0: 2, c1: 12 }]
    gs.lv.ladders = []
    gs.bubbles = []
    gs.players[0].invuln = 9999
    gs.door.open = false
    const p = gs.players[0]
    p.x = (7 + 0.5) * CELL; p.y = FIELD_Y0 + 8 * CELL - 8; p.vy = 0; p.onGround = true; p.dropT = 0
    for (let i = 0; i < 40; i++) { step(gs, { up: i < 6 }); gs.events.length = 0 }
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0 }
    const landedTop = Math.abs(p.y - (FIELD_Y0 + 6 * CELL - 8)) < 2
    ok(landedTop, 'jump UP through a one-way platform and land on its top', `y=${p.y.toFixed(0)}`)
    for (let i = 0; i < 20; i++) { step(gs, { down: i < 3 }); gs.events.length = 0 }
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0 }
    ok(Math.abs(p.y - (FIELD_Y0 + 8 * CELL - 8)) < 2, 'DOWN drops THROUGH the platform onto the one below', `y=${p.y.toFixed(0)}`)
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
{
    const r = S.plan(0)
    ok(r.levelsCleared >= 1 && r.deaths <= 3, 'seed 0 clears at least one level with its 3 lives', `cleared=${r.levelsCleared} deaths=${r.deaths}`)
    let ledger = 0
    const gs = makeGame(0)
    for (const inp of r.script) {
        step(gs, inp)
        for (const ev of gs.events) if (ev.type === 'score') ledger += ev.pts
        gs.events.length = 0
    }
    ok(ledger === r.gs.score, 'the run score equals its event ledger', `${ledger} vs ${r.gs.score}`)
    const sl = S.plan(0, { livesOverride: 2 })
    ok(sl.levelsCleared >= 1, 'the proven run survives the lives-1 slack', `cleared=${sl.levelsCleared}`)
    const co = S.plan(0, { players: 2 })
    ok(co.gs.players.length === 2 && co.gs.tick > 1000, 'two players drive the sim without error', `ticks=${co.gs.tick}`)
}

// ---------------------------------------------------------- determinism ----
console.log('determinism')
{
    const a = S.plan(0), b = S.plan(0)
    ok(a.hash === b.hash, 'same seed replays identically', `${a.hash} vs ${b.hash}`)
}

// --------------------------------------------------------------- win path ----
console.log('win path (testbed)')
{
    const gs = makeGame(0)
    gs.lives = 9
    let cleared = 0
    for (let lvl = 0; lvl < LEVEL_COUNT; lvl++) {
        gs.level = lvl
        gs.lv = L.genLevel(lvl)
        gs.lv._g = null
        gs.door = { x: (gs.lv.door.col + 0.5) * CELL, y: FIELD_Y0 + gs.lv.door.row * CELL - 12, open: false }
        gs.enemies = []
        gs.levelPhase = 'play'
        step(gs, {})
        if (!gs.door.open) break
        gs.players[0].x = gs.door.x; gs.players[0].y = gs.door.y
        step(gs, {})
        if (gs.levelPhase !== 'clear') break
        cleared++
        for (let i = 0; i < CFG.clearPause + 2 && gs.levelPhase === 'clear'; i++) step(gs, {})
    }
    ok(gs.end === 'win' && cleared === LEVEL_COUNT, `the door-chain carries the game through all ${LEVEL_COUNT} levels to WIN`, `cleared=${cleared}`)
}

// ------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const SIM = 'src/games/BubbleBobble/sim.js'
    const LEVELS = 'src/games/BubbleBobble/levels.js'
    const MUTANTS = [
        ['trapped enemies never escape', SIM, 'escapeTicks: 300,', 'escapeTicks: 9999999,'],
        ['door opens while enemies live', SIM, 'const cleared = gs.enemies.length === 0', 'const cleared = gs.enemies.length >= 0'],
        ['chain pay never escalates', LEVELS, 'CHAIN_PAY[Math.min(CHAIN_PAY.length - 1, chainIndex)]', 'CHAIN_PAY[0]'],
        ['lightning clears Blubba again', SIM, '    // von Blubba is unkillable — the lightning passes right through him\n}', '    if (gs.blubbas.length) { gs.blubbas = []; gs.events.push({ type: \'blubbaGone\' }) }\n}'],
    ]
    const files = {}
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        files[file] = files[file] || readFileSync(file, 'utf8')
        if (!files[file].includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(file, files[file].replace(from, to))
        const res = spawnSync('node', ['scripts/bobcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
        writeFileSync(file, files[file])
    }
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)
