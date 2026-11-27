// roguecheck.mjs — Node harness for ROGUE (#1473 batch 14 seed-param port).
// Proves three things: the game boots, its core rules hold, it can be won.
// Also proves the #1473 entropy contract: zero Math.random in the sim, the
// stream carried in state (interleaved replays byte-identical), ?seed=N pin
// honored at every human start, report {tick,score,done,seed}.
//
// npm run roguecheck

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MAP_W, MAP_H, createInitialState, stepGame, hash, done, runScore,
  buildGrid, monsterAttack, rng, setSeed, generateDungeon, isWall, blocksMove,
  isThrowable, shootRay, watchStep, advanceMonsters, MONSTER_DEFS, MONSTER_ENERGY, qaSeatLevel, shackles,
} from '../src/games/Rogue/sim.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${info ? ` — ${info}` : ''}`) }
}

// ── 1. boot / purity ─────────────────────────────────────────────────────────
console.log('boot + entropy purity')
{
    const simSrc = readFileSync(fileURLToPath(new URL('../src/games/Rogue/sim.js', import.meta.url)), 'utf8')
    const code = simSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    ok('sim.js carries zero Math.random (audit premise)', !/Math\.random/.test(code))
    ok('sim.js carries zero Date.now (replay-safe ids)', !/Date\.now/.test(code))
    const idxSrc = readFileSync(fileURLToPath(new URL('../src/games/Rogue/index.jsx', import.meta.url)), 'utf8')
    const stray = idxSrc.split('\n').filter((l) => /Math\.random/.test(l) && !/seed/i.test(l))
    ok('index.jsx — Math.random only on seed-generation lines', stray.length === 0, stray.map((l) => l.trim()).join(' | '))
    ok('index.jsx — honors the pin (seedFromQuery at human start)', /seedFromQuery\s*\(/.test(idxSrc))
    ok('index.jsx — reports {tick,score,done,seed} in the strict shape (b24)',
        /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{/.test(idxSrc)
        && /tick:\s*stateRef\.current\.turn/.test(idxSrc) && /score:\s*runScore\(stateRef\.current\)/.test(idxSrc)
        && /done:\s*done\(stateRef\.current\)/.test(idxSrc) && /seed:\s*stateRef\.current\.seed/.test(idxSrc))
    ok('index.jsx — restart regenerates the seed at every human start',
        (idxSrc.match(/freshSeed\(\)/g) || []).length >= 2)

    const s = createInitialState(12345)
    ok('boots into play: phase playing, 80x22 grid', s.phase === 'playing' && s.map.length === MAP_H && s.map[0].length === MAP_W)
    ok('hero starts on floor in the first room', s.map[s.player.y][s.player.x] === '.')
    ok('hero stats: hp 12/12, gold 0, food 1500', s.player.hp === 12 && s.player.maxHp === 12 && s.player.gold === 0 && s.player.food === 1500)
    ok('Dungeons of Doom greeting on the message line', /Dungeons of Doom/.test(s.messages[0]))
}

// ── 2. determinism (the seed-param contract) ─────────────────────────────────
console.log('determinism')
{
    const seeds = [1, 42, 777, 90210, 1000000]
    ok('same seed -> identical world (5 seeds)',
        seeds.every((x) => hash(createInitialState(x)) === hash(createInitialState(x))))
    let varOk = true
    for (const x of seeds) for (const y of seeds) if (x !== y && hash(createInitialState(x)) === hash(createInitialState(y))) varOk = false
    ok('different seeds -> different worlds', varOk)

    // interleaved worlds must not share stream position (the state-carried randState)
    const seq = [{ type: 'MOVE', dx: 1, dy: 0 }, { type: 'MOVE', dx: 0, dy: 1 }, { type: 'SEARCH' },
        { type: 'MOVE', dx: -1, dy: 0 }, { type: 'PICKUP' }, { type: 'MOVE', dx: 1, dy: 1 }]
    let A = createInitialState(55), C = createInitialState(66), B = createInitialState(55), junk = createInitialState(77)
    for (const m of seq) { A = stepGame(A, m); junk = stepGame(junk, m); B = stepGame(B, m); junk = stepGame(junk, m) }
    ok('parallel worlds never interleave streams (replay byte-identical)', hash(A) === hash(B))

    const over = stepGame(createInitialState(55), { type: 'QUIT' })
    ok('NEW_GAME(seed) rebuilds createInitialState(seed)', hash(stepGame(over, { type: 'NEW_GAME', seed: 4242 })) === hash(createInitialState(4242)))
}

// ── 3. dungeon validity: rooms connect, stairs reachable ─────────────────────
console.log('dungeon structure (BFS)')
{
    // #1833 rules: rock and '-'/'|' walls block; doors cross (the bump opens).
    const walkable = (t) => !blocksMove(t)
    const bfsReachesStairs = (st) => {
        const seen = new Set([`${st.player.x},${st.player.y}`])
        const q = [[st.player.x, st.player.y]]
        while (q.length) {
            const [x, y] = q.shift()
            if (st.map[y][x] === '%') return true
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue
                const nx = x + dx, ny = y + dy
                if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue
                if (!walkable(st.map[ny][nx])) continue
                const k = `${nx},${ny}`
                if (seen.has(k)) continue
                seen.add(k); q.push([nx, ny])
            }
        }
        return false
    }
    let roomsOk = true, stairsOk = true, bfsOk = true, occOk = true
    for (let seed = 1; seed <= 40; seed++) {
        const s = createInitialState(seed)
        if (s.rooms.length < 6) roomsOk = false
        if (!s.map.flat().includes('%')) stairsOk = false
        if (!bfsReachesStairs(s)) bfsOk = false
        for (const m of s.monsters) if (!walkable(s.map[m.y][m.x])) occOk = false
        for (const it of s.items) if (!walkable(s.map[it.y][it.x])) occOk = false
    }
    ok('40 seeds: at least 6 rooms everywhere', roomsOk)
    ok('40 seeds: stairs exist on every level', stairsOk)
    ok('40 seeds: stairs reachable from the start (8-dir BFS)', bfsOk)
    ok('40 seeds: monsters and items only on walkable tiles', occOk)
    ok('golden fixture seed 12345: 8 rooms, hash stable across constructions',
        createInitialState(12345).rooms.length === 8 && hash(createInitialState(12345)) === hash(createInitialState(12345)) && hash(createInitialState(12345)) !== hash(createInitialState(12346)))
}

// ── 3b. walls are solid (#1833) — the 1980 glyph grammar ────────────────────
console.log('walls solid + glyph grammar (#1833)')
{
    // (a) Room walls draw with the original's '-'/'|' strokes, never the
    // corridor '#'; any '#' on a room perimeter is a pierced doorway and must
    // touch walkable ground. And hero bumps into walls: never a step, never a
    // stumble, never a door.
    const FLOORY = new Set(['.', '#', "'"])
    let glyphsOk = true, bumpOk = true, bumpSamples = 0
    for (let seed = 1; seed <= 40; seed++) {
        const s = createInitialState(seed)
        for (const r of s.rooms) {
            for (let rx = r.x; rx < r.x + r.w; rx++) {
                for (const ry of [r.y, r.y + r.h - 1]) {
                    const c = s.map[ry][rx]
                    if (isWall(c) || c === '+' || c === "'") continue
                    if (c === '#') {
                        const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                          .some(([dx, dy]) => FLOORY.has(s.map[ry + dy]?.[rx + dx]) || s.map[ry + dy]?.[rx + dx] === '+')
                        if (!touch) glyphsOk = false
                        continue
                    }
                    glyphsOk = false // '.' (or worse) where a wall must be
                }
            }
            for (let ry = r.y + 1; ry < r.y + r.h - 1; ry++) {
                for (const rx of [r.x, r.x + r.w - 1]) {
                    const c = s.map[ry][rx]
                    if (isWall(c) || c === '+' || c === "'") continue
                    if (c === '#') {
                        const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                          .some(([dx, dy]) => FLOORY.has(s.map[ry + dy]?.[rx + dx]) || s.map[ry + dy]?.[rx + dx] === '+')
                        if (!touch) glyphsOk = false
                        continue
                    }
                    glyphsOk = false
                }
            }
        }
        // bump test: hero stood next to a wall cell, stepping into it does nothing
        outer:
        for (let y = 1; y < MAP_H - 1; y++) {
            for (let x = 1; x < MAP_W - 1; x++) {
                if (!isWall(s.map[y][x])) continue
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (!FLOORY.has(s.map[y - dy]?.[x - dx])) continue
                    let w = { ...s, player: { ...s.player, x: x - dx, y: y - dy }, monsters: [] }
                    const t = stepGame(w, { type: 'MOVE', dx, dy })
                    if (t.player.x !== w.player.x || t.player.y !== w.player.y
                        || /door/i.test(t.messages[t.messages.length - 1])) bumpOk = false
                    bumpSamples++
                    break outer
                }
            }
        }
    }
    ok('40 seeds: room perimeters are -/| strokes (or a pierced doorway touching ground), never walkable stone as wall', glyphsOk)
    ok('40 seeds: bumping a wall neither moves the hero nor fakes a door', bumpOk, `${bumpSamples} samples`)
    ok('40 seeds: every seed found a wall to bump (the probe itself works)', bumpSamples === 40)

    // (b) visible grammar: walls draw lighter than the corridors they wrap
    const g1 = buildGrid(createInitialState(12345))
    let wallLit = false
    for (const row of g1) for (const cell of row) if (cell.char === '-' && cell.color === '#999') wallLit = true
    ok('lit walls draw as bright - strokes (distinct from # corridors)', wallLit)

    // (c) the newcomer's questions answered on screen: legend + goal
    const idxSrc = readFileSync(fileURLToPath(new URL('../src/games/Rogue/index.jsx', import.meta.url)), 'utf8')
    ok('help legend separates wall from corridor (no "Wall or corridor")',
        /Wall — SOLID/.test(idxSrc) && /Corridor/.test(idxSrc) && !/Wall or corridor/.test(idxSrc))
    ok('welcome states the goal (stairs %, descend)',
        createInitialState(7).messages.some(m => /stairs \(%\)/.test(m) && /descend/i.test(m)))
    const gsrc = readFileSync(fileURLToPath(new URL('../src/config/games.js', import.meta.url)), 'utf8')
    const at = gsrc.indexOf("path: '/rogue'")
    const entry = gsrc.slice(at, gsrc.indexOf("path: '", at + 10))
    ok('registry: /rogue opts the footer mark out (map never reaches the bottom band)',
        /footer: 'none'/.test(entry))
    ok('registry: honest goal — no Amulet of Yendor in a game without one',
        !/Amulet/i.test(entry))
}

// ── 4. core rules ────────────────────────────────────────────────────────────
console.log('rules')
{
    // bump kill: wounded kestrel on an open tile in front; the d20 is the
    // d20, so sweep seeds until the mace connects (a hit at ac-7 kestrel-hp-1
    // must remove it and bank xp in the SAME turn)
    let bumpOk = false, before = 0, killFx = false
    for (let seed = 1; seed <= 50 && !bumpOk; seed++) {
        let w = createInitialState(seed)
        const open = [[1, 0], [0, 1], [-1, 0], [0, -1]].find(([dx, dy]) =>
            w.map[w.player.y + dy]?.[w.player.x + dx] === '.')
        before = w.turn
        w = { ...w, monsters: [{ ...w.monsters[0], x: w.player.x + open[0], y: w.player.y + open[1], letter: 'K', name: 'kestrel', hp: 1, maxHp: 1, xp: 1 }] }
        const t = stepGame(w, { type: 'MOVE', dx: open[0], dy: open[1] })
        if (/defeated the kestrel/.test(t.messages.join('\n'))) {
            bumpOk = t.monsters.length === 0 && t.player.exp >= 1 && t.turn === before + 1
            killFx = t.fx.some(f => f.k === 'kill')
        }
    }
    ok('bump into a wounded kestrel kills it and banks xp (same turn)', bumpOk)
    ok('the kill emits its fx (#1502 audibility gate)', killFx)

    // level-up: one kill worth 10 xp at exp 0 crosses the 10-xp table step
    let s2 = createInitialState(777)
    s2 = { ...s2, monsters: [{ ...s2.monsters[0], x: s2.player.x + 1, y: s2.player.y, letter: 'L', hp: 1, maxHp: 1, xp: 10 }], player: { ...s2.player, exp: 0 } }
    // force the hit through: run many worlds until the d20 cooperates at least once
    let leveled = false
    for (let seed = 1; seed <= 50 && !leveled; seed++) {
        let w = createInitialState(seed)
        w = { ...w, monsters: [{ ...w.monsters[0], x: w.player.x + 1, y: w.player.y, hp: 1, xp: 10 }], player: { ...w.player, exp: 0 } }
        const t = stepGame(w, { type: 'MOVE', dx: 1, dy: 0 })
        if (t.player.level === 2) leveled = true
    }
    ok('xp past the table threshold levels the hero up', leveled)

    // d20 fairness: the same adjacent duel sometimes hits, sometimes misses
    setSeed(5)
    let hits = 0, misses = 0
    for (let i = 0; i < 300; i++) {
        let w = createInitialState(1000 + i)
        w = { ...w, monsters: [{ id: 1, x: w.player.x + 1, y: w.player.y, letter: 'K', name: 'kestrel', hp: 99, maxHp: 99, dmg: '1d3', ac: 7, xp: 1, chasing: true }], player: { ...w.player, hp: 99 } }
        const t = monsterAttack(w, 0)
        if (t.messages[t.messages.length - 1].includes('hits you')) hits++
        else misses++
    }
    ok('monster attacks both hit and miss across rolls (no rubber-band)', hits > 20 && misses > 20, `${hits} hits / ${misses} misses`)

    // hunger clock: rest drains food, transitions fire in order
    // (hungry <500, weak <300, faint <150 — crossed at turns 1001/1201/1351)
    let h = createInitialState(9)
    for (let i = 0; i < 1351; i++) h = stepGame(h, { type: 'MOVE', dx: 0, dy: 0 })
    ok('1351 turns of rest put food at 149 (1500 - 1/turn)', h.player.food === 149, `food=${h.player.food}`)
    ok('hunger states fire in order: hungry -> weak -> faint',
        h.messages.some((m) => m.includes('hungry')) && h.messages.some((m) => m.includes('weak')) && h.player.hunger === 'faint')
    let starving = { ...h, player: { ...h.player, hp: 1, food: 1 } }
    starving = stepGame(starving, { type: 'MOVE', dx: 0, dy: 0 })
    ok('starving at 1 hp dies when the faint bite lands', done(starving))

    // descend: stairs teleport to a fresh, reachable level
    let d = createInitialState(4242)
    const si = d.map.findIndex((row) => row.includes('%'))
    const sx = d.map[si].indexOf('%')
    d = { ...d, player: { ...d.player, x: sx, y: si } }
    const before2 = d.turn
    d = stepGame(d, { type: 'DESCEND' })
    ok('> on stairs descends and consumes a turn', d.dungeonLevel === 2 && d.turn === before2 + 1 && d.player.x !== undefined)
    ok('descended level carries its own stairs', d.map.flat().includes('%'))
    ok('descending emits its fx (#1502 audibility gate)', d.fx.some(f => f.k === 'descend'))
    const wrong = stepGame(createInitialState(4242), { type: 'DESCEND' })
    ok('> off stairs is refused ("You see no stairs here.")', wrong.dungeonLevel === 1 && /no stairs/.test(wrong.messages[wrong.messages.length - 1]))

    // auto-pickup gold while walking
    let g = createInitialState(11)
    g = { ...g, map: g.map.map((r, y) => r.map((c, x) => (x === g.player.x + 1 && y === g.player.y ? '.' : c))), items: [{ type: '*', amount: 57, x: g.player.x + 1, y: g.player.y }, ...g.items] }
    g = stepGame(g, { type: 'MOVE', dx: 1, dy: 0 })
    ok('walking onto gold pockets it automatically', g.player.gold >= 57 && !g.items.some((i) => i.type === '*' && i.x === g.seed % 2 && i.y === g.player.y && i.amount === 57))

    // wield: new weapon equips, the old mace goes back to the pack
    let w2 = createInitialState(12)
    w2 = { ...w2, player: { ...w2.player, inventory: [{ type: ')', subtype: 3, name: 'long sword', dmg: '1d8', bonus: 0 }] } }
    w2 = stepGame(w2, { type: 'WIELD_ITEM', index: 0 })
    ok('wielding swaps the weapon and stows the mace', w2.player.weapon.name === 'long sword' && w2.player.inventory.some((i) => i.name === 'mace'))

    // eat: ration refills toward the 2000 cap
    let e = createInitialState(13)
    e = { ...e, player: { ...e.player, food: 100, hunger: 'faint', inventory: [{ type: ':', name: 'food ration' }] } }
    e = stepGame(e, { type: 'EAT_ITEM', index: 0 })
    ok('eating a ration restores 800 food and satiety', e.player.food === 900 && e.player.hunger === 'full')

    // quaff healing: hp rises and the colour gets identified
    let q2 = createInitialState(14)
    q2 = { ...q2, player: { ...q2.player, hp: 4, inventory: [{ type: '!', subtype: 0 }] } }
    q2 = stepGame(q2, { type: 'QUAFF_ITEM', index: 0 })
    ok('quaffing the healing potion raises hp and identifies it', q2.player.hp > 4 && q2.identifiedPotions[0] === true)
    ok('quaffing emits its fx (#1502 audibility gate)', q2.fx.some(f => f.k === 'quaff'))

    // enchant weapon scroll: +1 with a glowing confirmation
    let r2 = createInitialState(15)
    r2 = { ...r2, player: { ...r2.player, inventory: [{ type: '?', subtype: 3 }] } }
    r2 = stepGame(r2, { type: 'READ_ITEM', index: 0 })
    ok('reading enchant weapon adds +1 damage', r2.player.weapon.bonus === 1)

    // teleportation scroll: lands the hero on a walkable room tile
    let t2 = createInitialState(16)
    const oldPos = `${t2.player.x},${t2.player.y}`
    t2 = { ...t2, player: { ...t2.player, inventory: [{ type: '?', subtype: 1 }] } }
    t2 = stepGame(t2, { type: 'READ_ITEM', index: 0 })
    ok('teleportation scroll moves the hero onto walkable ground', t2.map[t2.player.y][t2.player.x] !== ' ' && `${t2.player.x},${t2.player.y}` !== oldPos)
}

// ── 4b. doors (#1502): the 1980 mechanic — open / block / hidden / search ──
console.log('doors (1980: closed blocks, bump opens, hidden found by search or stumble)')
{
    // Layout: every level digs visible + hidden doors, hidden ⊂ doors, all on stone
    let layoutOk = true
    for (let seed = 1; seed <= 10; seed++) {
        const s = createInitialState(seed)
        if (s.doors.length < 2 || s.hiddenDoors.length < 2) layoutOk = false
        for (const d of s.doors) if (s.map[d.y][d.x] !== '+') layoutOk = false
        for (const h of s.hiddenDoors) if (!s.doors.some(d => d.x === h.x && d.y === h.y)) layoutOk = false
    }
    ok('every level digs visible + hidden doors (hidden ⊂ doors, all on stone)', layoutOk)

    // Closed door: the bump opens it — one turn, no move, stone restored
    let s = createInitialState(12345)
    s = { ...s, monsters: [] }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const dir = dirs.find(([dx, dy]) =>
        (s.map[s.player.y + dy]?.[s.player.x + dx] === '.' || s.map[s.player.y + dy]?.[s.player.x + dx] === '#'))
    const nx = s.player.x + dir[0], ny = s.player.y + dir[1]
    const cMap = s.map.map(r => [...r]); cMap[ny][nx] = '+'
    s = { ...s, map: cMap, doors: [...s.doors, { x: nx, y: ny }] }
    const t0 = s.turn
    const opened = stepGame(s, { type: 'MOVE', dx: dir[0], dy: dir[1] })
    ok('a closed door blocks the step; the bump opens it (1 turn, no move)',
        opened.player.x === s.player.x && opened.player.y === s.player.y && opened.turn === t0 + 1)
    ok('the opened door leaves the walkable jamb glyph (\', not stone #, not floor .)', opened.map[ny][nx] === "'")
    ok('the next step walks straight through the opened door',
        stepGame(opened, { type: 'MOVE', dx: dir[0], dy: dir[1] }).player.x === nx)
    ok('opening a door fires the door-open fx (audibility gate)', opened.fx.some(f => f.k === 'door-open'))

    // Monsters vs doors: a closed VISIBLE door blocks the chase; an unfound
    // hidden one does not (creatures know their own doors, 1980 rule)
    const doorScenario = (kind) => {
        let w = createInitialState(222)
        w = { ...w, monsters: [] }
        const pm = w.map.map(r => [...r])
        const wx = w.player.x + 1, wy = w.player.y
        if (kind !== 'none') pm[wy][wx] = '+'
        pm[wy][wx + 1] = '.'
        if (kind !== 'none') w = { ...w, doors: [...w.doors, { x: wx, y: wy }] }
        if (kind === 'hidden') w = { ...w, hiddenDoors: [...w.hiddenDoors, { x: wx, y: wy }] }
        w = { ...w, map: pm }
        w = { ...w, monsters: [{ id: 1, x: wx + 1, y: wy, letter: 'K', name: 'kestrel', hp: 5, maxHp: 5, dmg: '1d3', ac: 7, xp: 1, chasing: true }] }
        const rest = stepGame(w, { type: 'MOVE', dx: 0, dy: 0 })
        return { mon: rest.monsters.find(m => m.id === 1), door: { x: wx, y: wy } }
    }
    const scVis = doorScenario('visible')
    const scHid = doorScenario('hidden')
    const scNone = doorScenario('none')
    ok('control: on open ground the chasing kestrel reaches the door cell',
        scNone.mon.x === scNone.door.x && scNone.mon.y === scNone.door.y)
    ok('a closed visible door blocks the chase',
        !(scVis.mon.x === scVis.door.x && scVis.mon.y === scVis.door.y))
    ok('an unfound hidden door passes the creatures (they know their doors)',
        scHid.mon.x === scHid.door.x && scHid.mon.y === scHid.door.y)

    // Hidden doors: invisible until found — by SEARCH (3x3) or by stumbling in
    let hd = createInitialState(12345)
    const r0 = hd.rooms[0]
    const h = hd.hiddenDoors.find(d => d.x > r0.x && d.x < r0.x + r0.w - 1 && (d.y === r0.y || d.y === r0.y + r0.h - 1))
    ok('the golden seed hides a door on the start room wall', Boolean(h))
    const gridHidden = buildGrid(hd)
    ok('an unfound hidden door draws as wall (-), not a door', gridHidden[h.y][h.x].char === '-')
    const under = { x: h.x, y: h.y === r0.y ? h.y + 1 : h.y - 1 }
    let f = { ...hd, player: { ...hd.player, x: under.x, y: under.y }, monsters: [] }
    const searched = stepGame(f, { type: 'SEARCH' })
    ok('SEARCH reveals a hidden door within the 3x3', !searched.hiddenDoors.some(d => d.x === h.x && d.y === h.y))
    ok('search consumes a turn', searched.turn === f.turn + 1)
    ok('a found door stands closed until bumped', searched.map[h.y][h.x] === '+')
    ok('the found door now draws as a door', buildGrid(searched)[h.y][h.x].char === '+')
    ok('finding the door fires the door-found fx (audibility gate)', searched.fx.some(e => e.k === 'door-found'))
    const stumbled = stepGame(f, { type: 'MOVE', dx: h.x - under.x, dy: h.y - under.y })
    ok('walking into a hidden door opens it under the hero',
        stumbled.player.x === h.x && stumbled.player.y === h.y && stumbled.map[h.y][h.x] === "'"
        && !stumbled.hiddenDoors.some(d => d.x === h.x && d.y === h.y))
}

// ── 5. terminals ─────────────────────────────────────────────────────────────
console.log('terminals')
{
    let s = createInitialState(3131)
    for (let i = 0; i < 30; i++) s = stepGame(s, { type: 'MOVE', dx: 1, dy: 0 })
    const q = stepGame(s, { type: 'QUIT' })
    ok('Q quits: done with finalScore = gold + dlvl*50', done(q) && q.finalScore === q.player.gold + q.dungeonLevel * 50)
    ok('score climbs with depth (dlvl 2 scores >= dlvl 1)', runScore(q) >= 50)
    const locked = stepGame(q, { type: 'MOVE', dx: 1, dy: 0 })
    ok('gameover locks every action but NEW_GAME', locked.phase === 'gameover' && locked.player.x === q.player.x)

    // death by monster is a terminal: run seeds until a hit finishes it
    let dead = false, dragonFx = false
    for (let seed = 1; seed <= 200 && !dead; seed++) {
        let w = createInitialState(seed)
        w = { ...w, monsters: [{ id: 1, x: w.player.x + 1, y: w.player.y, letter: 'D', name: 'dragon', hp: 30, maxHp: 30, dmg: '3d8', ac: -1, xp: 100, chasing: true }], player: { ...w.player, hp: 1 } }
        w = stepGame(w, { type: 'MOVE', dx: 1, dy: 0 })   // bump the dragon first
        const t = stepGame(w, { type: 'MOVE', dx: 0, dy: 0 })  // then let it swing
        if (done(t)) { dead = true; dragonFx = t.fx.some(f => f.k === 'die' && f.killer === 'D') }
    }
    ok('a dragon adjacent to a 1-hp hero eventually ends the run (death terminal)', dead)
    ok('the dragon death emits the die fx with its letter (#1502 audibility gate)', dragonFx)
}

// ── 6. won for real: BFS autopilot descends; death stays the deep-run risk ──
console.log('winnability (BFS autopilot, 20 seeds)')
{
    const bfsPath = (s) => {
        const start = `${s.player.x},${s.player.y}`
        const prev = new Map([[start, null]])
        const q = [[s.player.x, s.player.y]]
        while (q.length) {
            const [x, y] = q.shift()
            if (s.map[y][x] === '%') {
                const path = []
                let k = `${x},${y}`
                while (prev.get(k)) { const [cx, cy] = k.split(',').map(Number); const [pxx, pyy] = prev.get(k).split(',').map(Number); path.unshift({ dx: Math.sign(cx - pxx), dy: Math.sign(cy - pyy) }); k = prev.get(k) }
                return path
            }
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue
                const nx = x + dx, ny = y + dy
                if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H || blocksMove(s.map[ny][nx])) continue
                const k = `${nx},${ny}`
                if (prev.has(k)) continue
                prev.set(k, `${x},${y}`); q.push([nx, ny])
            }
        }
        return null
    }
    let reached2 = 0, reached4 = 0, minFood = Infinity, maxTurn = 0
    for (let seed = 1; seed <= 20; seed++) {
        let s = createInitialState(seed)
        for (let lvl = 0; lvl < 3 && !done(s); lvl++) {
            let guard = 0
            while (s.map[s.player.y][s.player.x] !== '%' && !done(s) && guard++ < 400) {
                // #1833: walls are real now — the runner can no longer sidestep
                // a chaser through stone. Fight what's adjacent before walking.
                const foe = s.monsters.find(m => Math.abs(m.x - s.player.x) <= 1 && Math.abs(m.y - s.player.y) <= 1 &&
                    (m.x !== s.player.x || m.y !== s.player.y))
                if (foe) {
                    s = stepGame(s, { type: 'MOVE', dx: Math.sign(foe.x - s.player.x), dy: Math.sign(foe.y - s.player.y) })
                    continue
                }
                const path = bfsPath(s)
                if (!path) break
                const step0 = path[0]
                s = stepGame(s, { type: 'MOVE', dx: step0.dx, dy: step0.dy }) // walk or bump-attack
            }
            if (done(s)) break
            if (s.map[s.player.y][s.player.x] === '%') s = stepGame(s, { type: 'DESCEND' })
        }
        if (s.dungeonLevel >= 2) { reached2++; minFood = Math.min(minFood, s.player.food); maxTurn = Math.max(maxTurn, s.turn) }
        if (s.dungeonLevel >= 4) reached4++
        // every seed must end cleanly one way or the other (no crash, no hang)
        s = stepGame(s, { type: 'QUIT' })
        if (!done(s)) { console.log(`  FAIL autopilot seed ${seed} never terminates`); fail++ }
    }
    ok('every seed reaches dungeon level 2 (stairs found + descended) — 20/20', reached2 === 20, `${reached2}/20`)
    ok('deep run: dungeon level 4 on at least 15/20 seeds (Rogue may kill you — the death terminal is proven separately)', reached4 >= 15, `${reached4}/20`)
    // slack rule (#1473): the winning route CONSUMES no supplies — it never
    // eats, quaffs or wears anything. Food only ticks down with turns, and the
    // slowest winner still holds >= 500 of its starting 1500: one fewer ration
    // (800) is free slack the perfect script doesn't even spend.
    ok('slack: winners keep >= 500 food without ever eating (800 ration of slack)', minFood >= 500, `min food left ${minFood}`)
    // #1502: every closed door crossed costs one opening turn (bump, then pass)
    // on top of the BFS route — the pre-door budget was 250, doors add ~10-20.
    ok('turn economy sane: 3 descents in under 300 turns (incl. door-open overhead)', maxTurn < 300, `max ${maxTurn}`)
}

// ── 7. drawn grid matches logical state ──────────────────────────────────────
console.log('draw vs logic')
{
    const s = createInitialState(6060)
    const grid = buildGrid(s)
    ok('@ drawn at the hero position', grid[s.player.y][s.player.x].char === '@')
    const si = s.map.findIndex((row) => row.includes('%'))
    if (si >= 0) {
        const sx = s.map[si].indexOf('%')
        ok('explored tiles draw the map char (% known => % drawn)', !s.explored[si][sx] || grid[si][sx].char === '%')
    }
    const mon = s.monsters.find((m) => s.visible[m.y][m.x])
    if (mon) ok('a visible monster draws its letter', grid[mon.y][mon.x].char === mon.letter)
    else ok('no monster happens to be visible in this seed (vacuous)', true)
    const blindGrid = buildGrid({ ...s, player: { ...s.player, blind: 3 } })
    ok('blindness greys the @', blindGrid[s.player.y][s.player.x].color === '#555')
}

// ── 8. seed generation sanity (rng bound within sim) ─────────────────────────
console.log('rng bounds')
{
    setSeed(4242)
    let inBound = true
    for (let i = 0; i < 5000; i++) { const v = rng(3, 8); if (v < 3 || v > 8 || !Number.isInteger(v)) inBound = false }
    ok('rng(min,max) is integer-valued and inclusive over 5000 draws', inBound)
    const d = generateDungeon(5)
    ok('deep level generation (dlvl 5) yields monsters with depth-scaled letters', d.monsters.length >= 3)
}

// ── 9. ranged combat (#3491) — staves, arrows, the away-game ────────────────
console.log('ranged combat (#3491)')
{
    // generation: both new families show up on the shelf
    let sawStaff = 0, sawArrows = 0
    for (let seed = 1; seed <= 60; seed++) {
        const g = createInitialState(seed)
        if (g.items.some((i) => i.type === '/')) sawStaff++
        if (g.items.some((i) => i.missile)) sawArrows++
    }
    ok('staves generate across seeds (>=5 of 60)', sawStaff >= 5, `saw ${sawStaff}`)
    ok('arrows generate across seeds (>=5 of 60)', sawArrows >= 5, `saw ${sawArrows}`)

    // the throw set: staves + counted arrows — never a mace
    ok('isThrowable: staff yes, arrows yes, mace no, armor no',
        isThrowable({ type: '/' }) && isThrowable({ type: ')', missile: true })
        && !isThrowable({ type: ')', name: 'mace' }) && !isThrowable({ type: '[' }))
    {
        const s = createInitialState(5)
        const withArrows = { ...s, player: { ...s.player, inventory: [{ type: ')', missile: true, name: 'arrows', qty: 5 }] } }
        const w = stepGame(withArrows, { type: 'WIELD_ITEM', index: 0 })
        ok('arrows refuse the sword hand (wield keeps the mace)', w.player.weapon.name === 'mace' && w.player.inventory.length === 1)
    }

    // ray physics on a synthetic hall: floor everywhere, wall at x=+6
    const pxWall = 6
    {
        const base = createInitialState(12345)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'))
        for (let y = 0; y < MAP_H; y++) map[y][base.player.x + 6] = '|'
        const s = { ...base, map, hiddenDoors: [], doors: [] }
        const ray = shootRay(s, 1, 0)
        ok('bolt stops before the wall', ray.monster === -1 && ray.blocked && ray.x === base.player.x + 5, JSON.stringify(ray))
        const near = { ...s, monsters: [
            { id: 901, x: base.player.x + 2, y: base.player.y, letter: 'K', name: 'kestrel', hp: 3, maxHp: 3, dmg: '1d3', ac: 7, xp: 1, chasing: false },
            { id: 902, x: base.player.x + 4, y: base.player.y, letter: 'S', name: 'snake', hp: 3, maxHp: 3, dmg: '1d3', ac: 5, xp: 2, chasing: false },
        ] }
        const ray2 = shootRay(near, 1, 0)
        ok('first body in the line stops the shot', ray2.monster === 0 && ray2.x === base.player.x + 2)
        // a closed VISIBLE door blocks; a hidden door passes (the dungeon's own law)
        const doorMap = map.map((r) => [...r]); doorMap[base.player.y][base.player.x + 3] = '+'
        const closed = shootRay({ ...s, map: doorMap }, 1, 0)
        ok('a closed door stops the arrow', closed.monster === -1 && closed.blocked && closed.x === base.player.x + 2)
        const hidden = shootRay({ ...s, map: doorMap, hiddenDoors: [{ x: base.player.x + 3, y: base.player.y }] }, 1, 0)
        ok('a hidden door lets it fly (the creatures know their doors)', !hidden.blocked || hidden.x > base.player.x + 2)
    }

    // hit/kill books like melee; the aim/salvage law cycles both ways over seeds
    {
        const base = createInitialState(12345)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'))
        let sawKill = false, sawMissSalvage = false, xpOk = false, chargeOk = true
        for (let seed = 1; seed <= 120 && !(sawKill && sawMissSalvage); seed++) {
            const mk = (hp) => [{ id: 909, x: base.player.x + 2, y: base.player.y, letter: 'K', name: 'kestrel', hp, maxHp: hp, dmg: '1d3', ac: 7, xp: 1, chasing: false }]
            const world = (inv) => ({ ...base, map, hiddenDoors: [], doors: [], monsters: mk(hpOf(seed)),
                randState: (base.randState + seed * 7919) | 0,
                player: { ...base.player, inventory: inv } })
            const hpOf = (sd) => (sd % 2 ? 1 : 50) // odd seeds: killable kestrel; even: unkillable wall of hp
            const a = stepGame(world([{ type: ')', missile: true, name: 'arrows', qty: 5 }]), { type: 'THROW', index: 0, dx: 1, dy: 0 })
            if (a.messages.some((m) => m.startsWith('You defeated'))) {
                sawKill = true
                if (a.player.exp >= 1) xpOk = true
                const salvage = a.items.filter((i) => i.missile)
                if (salvage.length !== 0) ok('a kill loses the arrow (no salvage)', false, 'found remains')
            } else if (a.messages.some((m) => m.startsWith('You miss'))) {
                const salvage = a.items.filter((i) => i.missile)
                const q = a.player.inventory.find((i) => i.missile)?.qty
                if (salvage.length === 1 && salvage[0].qty === 1 && q === 4) sawMissSalvage = true
            }
            const z = stepGame(world([{ type: '/', subtype: 0, charges: 3 }]), { type: 'THROW', index: 0, dx: 1, dy: 0 })
            const st = z.player.inventory.find((i) => i.type === '/')
            if (!st || st.charges !== 2) chargeOk = false
        }
        ok('ranged kills book xp like melee', sawKill && xpOk)
        ok('a miss leaves the bundle to be salvaged (qty-1)', sawMissSalvage)
        ok('every staff shot spends exactly one charge', chargeOk)
    }

    // salvage round-trip: pack up the bundle you missed with
    {
        const base = createInitialState(12345)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'))
        const s = { ...base, map, hiddenDoors: [], doors: [], monsters: [],
            player: { ...base.player, inventory: [] } }
        let a = stepGame({ ...s, player: { ...s.player, inventory: [{ type: ')', missile: true, name: 'arrows', qty: 3 }] } },
            { type: 'THROW', index: 0, dx: 1, dy: 0 })
        const landed = a.items.find((i) => i.missile)
        ok('one arrow per throw — the quiver stays packed', a.player.inventory.some((i) => i.missile && i.qty === 2))
        ok('the missed arrow lands on the flight line to salvage', !!landed && landed.qty === 1, JSON.stringify(landed))
        if (landed) {
            a = { ...a, player: { ...a.player, x: landed.x, y: landed.y } }
            a = stepGame(a, { type: 'PICKUP' })
            ok('salvage: the arrow goes back into the quiver', a.player.inventory.some((i) => i.missile && i.qty === 3))
            // stacking: a found bundle joins the carried quiver
            a = { ...a, items: [...a.items, { type: ')', missile: true, name: 'arrows', qty: 4, x: landed.x, y: landed.y }] }
            a = stepGame(a, { type: 'PICKUP' })
            ok('arrow bundles stack into one quiver',
                a.player.inventory.filter((i) => i.missile).length === 1 && a.player.inventory.find((i) => i.missile).qty === 7)
        } else {
            ok('salvage: the arrow goes back into the quiver', false, 'nothing landed')
            ok('arrow bundles stack into one quiver', false, 'nothing landed')
        }
    }

    // staff crumbles with its last charge
    {
        const base = createInitialState(12345)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'))
        const s = { ...base, map, hiddenDoors: [], doors: [], monsters: [] }
        const one = { ...s, player: { ...s.player, inventory: [{ type: '/', subtype: 1, charges: 1 }] } }
        const z = stepGame(one, { type: 'THROW', index: 0, dx: 1, dy: 0 })
        ok('the staff crumbles with its last charge',
            z.player.inventory.length === 0 && z.messages.some((m) => /crumbles/.test(m)))
    }

    // fx + turn law + menu flow
    {
        const base = createInitialState(12345)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'))
        const s = { ...base, map, hiddenDoors: [], doors: [], monsters: [] }
        const armed = { ...s, player: { ...s.player, inventory: [{ type: '/', subtype: 0, charges: 2 }, { type: ')', missile: true, name: 'arrows', qty: 3 }] } }
        const z = stepGame(armed, { type: 'THROW', index: 0, dx: 1, dy: 0 })
        const t = stepGame(armed, { type: 'THROW', index: 1, dx: 0, dy: 1 })
        ok('zap and shoot are audible moments in the fx log',
            z.fx.some((f) => f.k === 'zap') && t.fx.some((f) => f.k === 'shoot'))
        ok('THROW costs exactly one turn', t.turn === armed.turn + 1)
        ok('empty-hand SHOW_THROW says no',
            /nothing to fire/.test(stepGame(s, { type: 'SHOW_THROW' }).messages.slice(-1)[0]))
        const m = stepGame(armed, { type: 'SHOW_THROW' })
        ok('f opens the missile menu (throw phase)', m.phase === 'throw')
        const aim = stepGame(m, { type: 'AIM_THROW', index: 1 })
        ok('the pack answers with the direction prompt', aim.phase === 'aim' && aim.aimIndex === 1 && /Which direction/.test(aim.messages.slice(-1)[0]))
        const cancel = stepGame(aim, { type: 'CLOSE_MENU' })
        ok('ESC unaims cleanly', cancel.phase === 'playing' && cancel.aimIndex === null)
        const aimShot = stepGame(aim, { type: 'THROW', index: aim.aimIndex, dx: -1, dy: 0 })
        ok('the aimed throw fires and returns to play', aimShot.phase === 'playing' && aimShot.fx.some((f) => f.k === 'shoot'))
    }

    // determinism across the new dice — two interleaved worlds firing
    {
        const A0 = createInitialState(31), B0 = createInitialState(31), J = createInitialState(99)
        const fire = (st) => stepGame({ ...st, player: { ...st.player, inventory: [{ type: ')', missile: true, name: 'arrows', qty: 4 }] } },
            { type: 'THROW', index: 0, dx: 1, dy: 0 })
        let A = fire(A0); stepGame(J, { type: 'SEARCH' }); let B = fire(B0)
        stepGame(J, { type: 'MOVE', dx: 1, dy: 0 })
        let A2 = fire(A); let B2 = fire(B)
        ok('interleaved ranged replays are byte-identical',
            hash(A2) === hash(B2) && A2.randState === B2.randState && JSON.stringify(A2.messages) === JSON.stringify(B2.messages))
        void J
    }

    // the grid shows the new shelf: staff `/` and arrows `)` draw their glyphs
    {
        const s = createInitialState(12345)
        const gx = s.player.x + 1, gy = s.player.y
        const withShelf = { ...s, items: [...s.items, { type: '/', subtype: 0, charges: 3, x: gx, y: gy }] }
        const grid = buildGrid(withShelf)
        ok('a staff on the floor draws /', grid[gy][gx].char === '/')
    }

    // the WATCH pilot keeps the proven melee law — no ranged shortcuts
    {
        const s = createInitialState(4242)
        const w = watchStep(s)
        ok('watchStep still moves the proven way (never throws)', !w || w.type === 'MOVE' || w.type === 'DESCEND')
    }
}

// ── 8. mobility laws (#3509): per-monster energy + wounded flee ─────────────
console.log('mobility laws (#3509)')
{
    const mkState = (px, py, monsters) => {
        const base = createInitialState(1)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => ' '))
        const vis = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(true))
        return {
            ...base, dungeonLevel: 1, turn: 0, phase: 'playing', map, visible: vis,
            monsters, items: [], hiddenDoors: [], fx: [], msgs: [],
            player: { ...base.player, x: px, y: py },
        }
    }
    const floorPatch = (st, cells) => { for (const [x, y] of cells) st.map[y][x] = '.' }
    const mkMon = (id, letter, x, y, hp, extra = {}) => ({
        id, x, y, letter, name: letter, hp, maxHp: 8, dmg: '1d1', ac: 4, xp: 1,
        chasing: true, energy: 0, fleeing: false, bitten: false,
        speed: MONSTER_DEFS[letter].speed, ...extra,
    })

    // race table (spec section 4)
    const fast = ['K', 'B', 'C', 'L', 'J'], slow = ['T', 'M']
    ok('speed table: fast races x1.5, slow x0.75, rest x1.0',
        fast.every(l => MONSTER_DEFS[l].speed === 6) &&
        slow.every(l => MONSTER_DEFS[l].speed === 3) &&
        Object.values(MONSTER_DEFS).every(d => [3, 4, 6].includes(d.speed)))

    // energy clock: steps per hero turn, counted from energy spend
    const runClock = (letter, turns) => {
        const st = mkState(10, 10, [mkMon(1, letter, 17, 10, 8)])
        floorPatch(st, [])
        for (let x = 9; x <= 20; x++) for (let y = 8; y <= 12; y++) st.map[y][x] = '.'
        let s = st, prevEnergy = 0, steps = 0, perTurn = []
        for (let t = 0; t < turns; t++) {
            s = advanceMonsters(s)
            const m = s.monsters[0]
            const acted = (prevEnergy + m.speed - m.energy) / MONSTER_ENERGY
            steps += acted; perTurn.push(acted)
            prevEnergy = m.energy
        }
        return { steps, perTurn, final: s.monsters[0] }
    }
    const norm = runClock('O', 4)   // orc x1.0
    const fastR = runClock('K', 4)  // kestrel x1.5
    const slowR = runClock('T', 4)  // troll x0.75
    ok('x1.0 race steps exactly once per hero turn', norm.steps === 4 && norm.perTurn.every(n => n === 1), JSON.stringify(norm.perTurn))
    ok('x1.5 race double-steps (6 actions in 4 turns)', fastR.steps === 6, JSON.stringify(fastR.perTurn))
    ok('x0.75 race skips a turn (3 actions in 4)', slowR.steps === 3 && slowR.perTurn.includes(0), JSON.stringify(slowR.perTurn))
    ok('energy carries, never borrows: every race holds 0..3 leftover',
        [norm, fastR, slowR].every(r => r.final.energy >= 0 && r.final.energy < MONSTER_ENERGY))

    // flee law: wounded kestrel (hp 1 of 4) turns its back and runs
    {
        const st = mkState(10, 10, [mkMon(1, 'K', 12, 10, 1, { maxHp: 4 })])
        for (let x = 8; x <= 16; x++) for (let y = 8; y <= 12; y++) st.map[y][x] = '.'
        const d0 = Math.abs(12 - 10) + Math.abs(10 - 10)
        const s = advanceMonsters({ ...st, monsters: st.monsters.map(m => ({ ...m, energy: 4 })) })
        const m = s.monsters[0]
        const d1 = Math.abs(m.x - 10) + Math.abs(m.y - 10)
        ok('wounded monster flees: distance grows, no bite lands',
            m.fleeing && d1 > d0 && s.player.hp === st.player.hp, `d ${d0}->${d1} fleeing=${m.fleeing}`)
        ok('fleeing is for good (wounded never gets brave)', advanceMonsters(s).monsters[0].fleeing)
    }

    // boundary: hp just above the quarter threshold still fights
    {
        const st = mkState(10, 10, [mkMon(1, 'O', 13, 10, 3, { maxHp: 8 })]) // 12 > 8
        for (let x = 8; x <= 16; x++) for (let y = 8; y <= 12; y++) st.map[y][x] = '.'
        const s = advanceMonsters({ ...st, monsters: st.monsters.map(m => ({ ...m, energy: 4 })) })
        ok('3/8 hp is not wounded: keeps its nerve (no flee at the boundary)',
            !s.monsters[0].fleeing && s.monsters[0].x < 13)
    }

    // cornered rat bites: no flee step, adjacent -> attack
    {
        let s = mkState(10, 10, [mkMon(1, 'O', 10, 11, 1, { maxHp: 8 })]) // wounded, adjacent
        s.map[10][10] = '.'; s.map[10][11] = '.' // two-cell corridor: nowhere to run
        for (let t = 0; t < 60; t++) {
            s = advanceMonsters({ ...s, monsters: s.monsters.map(m => ({ ...m, energy: 4 })) })
            if (s.phase !== 'playing') break
        }
        const attacked = s.msgs.some(x => x.includes('hits you') || x.includes('misses')) ||
            s.player.hp < createInitialState(1).player.hp || s.phase === 'gameover'
        ok('cornered wounded monster fights (no fleeing step exists)', attacked)
    }

    // the snake's own law: flees for good once it has bitten
    {
        let s = mkState(10, 10, [mkMon(1, 'S', 11, 10, 6)]) // full hp — no flee trigger yet
        for (let x = 8; x <= 18; x++) for (let y = 8; y <= 12; y++) s.map[y][x] = '.'
        let bit = false
        for (let t = 0; t < 200 && !bit; t++) {
            const before = s.player.hp
            s = advanceMonsters({ ...s, monsters: s.monsters.map(m => ({ ...m, energy: 4 })) })
            if (s.player.hp < before) bit = true
            // if it slipped away unbit, pin it adjacent again (the law is
            // about the aftermath of a bite, not about the chase)
            if (!bit && !s.monsters.some(m => m.x === 11 && m.y === 10)) {
                s = { ...s, monsters: s.monsters.map(m => ({ ...m, x: 11, y: 10, fleeing: false })) }
            }
        }
        const snake = s.monsters[0]
        ok('snake bites (harness can drive the bite)', bit, `snake hp ${snake.hp} fleeing=${snake.fleeing}`)
        ok('the bitten snake flees for good: bitten+fleeing set, and it gains ground fleeing', (() => {
            if (!bit || !snake.bitten || !snake.fleeing) return false
            let s2 = { ...s, monsters: s.monsters.map(m => ({ ...m, energy: 4 })) }
            const d0 = Math.abs(s2.monsters[0].x - s2.player.x) + Math.abs(s2.monsters[0].y - s2.player.y)
            s2 = advanceMonsters(s2)
            const d1 = Math.abs(s2.monsters[0].x - s2.player.x) + Math.abs(s2.monsters[0].y - s2.player.y)
            return d1 >= d0 && d1 >= 2
        })())
    }

    // bump skip: the counterattacked monster accrues but spends its step
    {
        const st = mkState(10, 10, [mkMon(1, 'K', 11, 10, 8)]) // fast, adjacent
        st.map[10][10] = '.'; st.map[10][11] = '.'
        const s = advanceMonsters(st, 1) // monster 1 is the bumped one
        ok('bumped monster accrues but spends its step (no double-tap)',
            s.monsters[0].energy === 2 && s.monsters[0].x === 11)
    }

    // determinism of the new state bits
    {
        const mk = (fleec) => {
            const st = mkState(10, 10, [mkMon(1, 'K', 12, 10, 1, { maxHp: 4, fleeing: fleec })])
            for (let x = 8; x <= 16; x++) for (let y = 8; y <= 12; y++) st.map[y][x] = '.'
            return advanceMonsters(st)
        }
        ok('mobility bits are inside the replay hash (fleeing is proven state)',
            hash(mk(false)) !== hash({ ...mk(false), monsters: mk(false).monsters.map(m => ({ ...m, fleeing: !m.fleeing })) }))
        ok('mobility replays byte-equal (same scene twice)', hash(mk(true)) === hash(mk(true)))
    }
}

// ── 9. the flee moment (#3514 polish): fx fires once, snake narrates ────────
console.log('flee moment fx (#3514)')
{
    const mkState = (px, py, monsters, vis = true) => {
        const base = createInitialState(1)
        const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => ' '))
        const visible = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(vis))
        return {
            ...base, dungeonLevel: 1, turn: 0, phase: 'playing', map, visible,
            monsters, items: [], hiddenDoors: [], fx: [], msgs: [],
            player: { ...base.player, x: px, y: py },
        }
    }
    const mkMon = (id, letter, x, y, hp, extra = {}) => ({
        id, x, y, letter, name: letter, hp, maxHp: 8, dmg: '1d1', ac: 4, xp: 1,
        chasing: true, energy: 0, fleeing: false, bitten: false,
        speed: MONSTER_DEFS[letter].speed, ...extra,
    })
    const pad = (st, x0, x1, y0, y1) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.map[y][x] = '.' }
    const fleeFx = (s) => s.fx.filter(e => e.k === 'flee')

    // the break is witnessed once: a wounded kestrel flees for good, so exactly
    // one blip over eight turns — no re-fire while it keeps running
    {
        const st = mkState(10, 10, [mkMon(1, 'K', 12, 10, 1, { maxHp: 4 })])
        pad(st, 8, 16, 8, 12)
        let s = st, all = []
        for (let t = 0; t < 8; t++) { s = advanceMonsters(s); all = all.concat(fleeFx(s)); s = { ...s, fx: [] } }
        ok('the break fires exactly one flee fx (no re-fire for a for-good fleer)',
            all.length === 1 && all[0].id === 1 && all[0].letter === 'K', JSON.stringify(all))
        ok('the fx stamp carries the fleeing creature (index.jsx tints by id)',
            s.monsters[0].fleeing === true)
    }

    // heavy race: the break is the DECISION turn, not the first step — a troll
    // (0.75x) has no action yet on its break turn, and the blip still sounds
    {
        const st = mkState(10, 10, [mkMon(1, 'T', 12, 10, 1, { maxHp: 4 })])
        pad(st, 8, 16, 8, 12)
        const s = advanceMonsters(st)
        ok('heavy race: break fx sounds on the decision turn (before any step)',
            fleeFx(s).length === 1 && s.monsters[0].x === 12 && s.monsters[0].fleeing === true,
            `fx ${fleeFx(s).length} x ${s.monsters[0].x}`)
    }

    // silent when unseen: an unwitnessed break never fakes a cue
    {
        const st = mkState(10, 10, [mkMon(1, 'K', 12, 10, 1, { maxHp: 4 })], false)
        pad(st, 8, 16, 8, 12)
        let s = st, n = 0
        for (let t = 0; t < 8; t++) { s = advanceMonsters(s); n += fleeFx(s).length; s = { ...s, fx: [] } }
        ok('unseen wounded monster stays silent (fx needs the hero\'s eye)', n === 0)
    }

    // healthy never breaks: full-hp kestrel, eight turns, no cue
    {
        const st = mkState(10, 10, [mkMon(1, 'K', 12, 10, 4, { maxHp: 4 })])
        pad(st, 8, 16, 8, 12)
        let s = st, n = 0
        for (let t = 0; t < 8; t++) { s = advanceMonsters(s); n += fleeFx(s).length; s = { ...s, fx: [] } }
        ok('healthy monster never emits the flee cue', n === 0)
    }

    // the snake's recoil is narrated in the port's voice and cues the blip
    {
        let s = mkState(10, 10, [mkMon(1, 'S', 11, 10, 6)])
        pad(s, 8, 18, 8, 12)
        let bit = false, recoiled = null, cued = []
        for (let t = 0; t < 200 && !bit; t++) {
            const before = s.player.hp
            s = advanceMonsters({ ...s, monsters: s.monsters.map(m => ({ ...m, energy: 4 })) })
            cued = cued.concat(fleeFx(s).filter(e => e.id === 1))
            if (s.player.hp < before) {
                bit = true
                recoiled = s.messages[s.messages.length - 1]
            }
            if (!bit && !s.monsters.some(m => m.x === 11 && m.y === 10)) {
                s = { ...s, monsters: s.monsters.map(m => ({ ...m, x: 11, y: 10, fleeing: false })) }
            }
        }
        ok('snake bite prints the recoil line in the port\'s voice',
            bit && recoiled === 'The snake recoils!', String(recoiled))
        ok('the recoil cues exactly one flee blip for the snake, and it flees',
            bit && cued.length === 1 && cued[0].letter === 'S' && s.monsters[0].fleeing === true,
            JSON.stringify(cued))
    }
}

// ── 14. traps (#3579) — the 1980 minefield ──────────────────────────────────
console.log('traps: generation, spring law, fall grudge, honesty (#3579)')
{
    const ROSTER = new Set(['door', 'teleport', 'sleep', 'str', 'confuse', 'snare', 'darts'])
    // generation sweep — every level is mined, fairly, on walkable ground
    let countOk = true, kindOk = true, cellOk = true, startOk = true, occOk = true
    const seeds = []
    for (let i = 0; i < 40; i++) seeds.push(1000 + i * 137)
    for (const sd of seeds) {
        const s = createInitialState(sd)
        const ts = s.traps
        if (!(ts.length >= 2)) countOk = false
        for (const t of ts) {
            if (!ROSTER.has(t.kind)) kindOk = false
            const c = s.map[t.y][t.x]
            if (c !== '.' && c !== '#') cellOk = false
            if (Math.abs(t.x - s.player.x) <= 1 && Math.abs(t.y - s.player.y) <= 1) startOk = false
            if (s.monsters.some(m => m.x === t.x && m.y === t.y)) occOk = false
            if (s.items.some(it => it.x === t.x && it.y === t.y)) occOk = false
        }
    }
    ok('40 seeds: every level carries ≥ 2 traps', countOk)
    ok('trap kinds are the cart roster', kindOk)
    ok('traps sit on walkable floor/corridor cells only', cellOk)
    ok('no trap in the start ring — a fresh hero is never dead on arrival', startOk)
    ok('never under a monster or an item', occOk)

    // depth scaling: the upper bound grows with dlvl
    const maxAt = (lvl) => {
        let mx = 0
        for (let i = 0; i < 60; i++) {
            setSeed(5000 + i * 613)
            mx = Math.max(mx, generateDungeon(lvl).traps.length)
        }
        return mx
    }
    const m1 = maxAt(1), m20 = maxAt(20)
    ok('mine density scales with depth (level 20 reaches more traps than level 1)', m20 > m1, `l1=${m1} l20=${m20}`)

    // stream contract: traps are borrowed, not spent — same seed same mines,
    // and the identification maps downstream stay anchored (rewound rng slice)
    const A = createInitialState(777), B = createInitialState(777)
    ok('same seed, same mines (deterministic placement)',
        JSON.stringify(A.traps) === JSON.stringify(B.traps), JSON.stringify(A.traps))
    ok('golden seed 777 keeps its stream anchor (trap rolls never shift downstream)',
        JSON.stringify(A.traps) === JSON.stringify([{ x: 51, y: 5, kind: 'str', armed: true, seen: false }, { x: 52, y: 5, kind: 'sleep', armed: true, seen: false }, { x: 69, y: 12, kind: 'sleep', armed: true, seen: false }]) && A.potionColorMap[0] === 'red' && A.scrollTitleMap[0] === 'NATRIX AN',
        JSON.stringify(A.traps) + ' ' + A.potionColorMap[0] + '/' + A.scrollTitleMap[0])
    ok('hidden traps are invisible: backtick never drawn for an un-sprung trap',
        !buildGrid(A).flat().some(c => c.char === '`'))
}

// spring law per kind — forged mines on scanned walkable ground, real moves
const spotPair = (s) => {
    // any cell with a walkable west neighbour — deterministic in the map
    for (let y = 1; y < MAP_H - 1; y++)
        for (let x = 2; x < MAP_W - 1; x++)
            if ((s.map[y][x] === '.' || s.map[y][x] === '#') && (s.map[y][x - 1] === '.' || s.map[y][x - 1] === '#')) return { x, y }
    throw new Error('no walkable pair found')
}
const mineAt = (s, kind) => {
    const { x, y } = spotPair(s)
    return {
        ...s,
        traps: [{ x, y, kind, armed: true, seen: false }],
        monsters: s.monsters.filter(m => Math.abs(m.x - x) > 2 || Math.abs(m.y - y) > 2),
        player: { ...s.player, x: x - 1, y, sleeping: 0, held: 0, confused: 0, blind: 0 },
    }
}
{
    // strength trap
    let s = mineAt(createInitialState(3001), 'str')
    const str0 = s.player.str
    s = stepGame(s, { type: 'MOVE', dx: 1, dy: 0 })
    ok('strength trap drains 1..3 and narrates', s.player.x === s.traps[0].x && s.player.str >= str0 - 3 && s.player.str < str0 && /drains your strength/.test(s.messages.at(-1)))

    // darts trap: damage in band
    let d = mineAt(createInitialState(3002), 'darts')
    const hp0 = d.player.hp
    d = stepGame(d, { type: 'MOVE', dx: 1, dy: 0 })
    ok('dart trap bites 1..6 with its sting', hp0 - d.player.hp >= 1 && hp0 - d.player.hp <= 6 && /Darts spring/.test(d.messages.at(-1)))

    // darts kill honestly
    let k = mineAt(createInitialState(3003), 'darts')
    k = { ...k, player: { ...k.player, hp: 1 } }
    k = stepGame(k, { type: 'MOVE', dx: 1, dy: 0 })
    ok('a dart at 1 hp is an honest terminal', done(k) && k.killer === 'a dart trap' && k.finalScore > 0, k.killer)

    // sleep trap: the mine then eats the hero's turns
    let sl = mineAt(createInitialState(3004), 'sleep')
    sl = stepGame(sl, { type: 'MOVE', dx: 1, dy: 0 })
    const slept = sl.player.sleeping
    const turnBefore = sl.turn, posBefore = { x: sl.player.x, y: sl.player.y }
    sl = stepGame(sl, { type: 'MOVE', dx: 1, dy: 0 })
    ok('sleep trap drugs the hero 5..9 turns', slept >= 5 && slept <= 9 && /fall asleep/.test(sl.messages[sl.messages.length - 2]), `sleeping=${slept}`)
    ok('while asleep the turn still burns (monsters move, hero stays)', sl.turn === turnBefore + 1 && sl.player.x === posBefore.x && sl.player.y === posBefore.y && /asleep/.test(sl.messages.at(-1)))

    // snare trap: struggle costs turns in place
    let sn = mineAt(createInitialState(3005), 'snare')
    sn = stepGame(sn, { type: 'MOVE', dx: 1, dy: 0 })
    const held0 = sn.player.held
    sn = stepGame(sn, { type: 'MOVE', dx: 1, dy: 0 })
    ok('snare catches for 3..6 turns', held0 >= 3 && held0 <= 6 && /caught in a snare/.test(sn.messages[sn.messages.length - 2]), `held=${held0}`)
    ok('struggling spends the turn without moving the hero', sn.player.held === held0 - 1 && /struggle/.test(sn.messages.at(-1)))

    // confusion trap
    let cf = mineAt(createInitialState(3006), 'confuse')
    cf = stepGame(cf, { type: 'MOVE', dx: 1, dy: 0 })
    ok('gas trap confuses 10..20 turns', cf.player.confused >= 10 && cf.player.confused <= 20 && /confuses you/.test(cf.messages.at(-1)))

    // teleport trap: relocated on the same level, armed after — the 1980 joke
    let tp = mineAt(createInitialState(3007), 'teleport')
    const tpos = { x: tp.traps[0].x, y: tp.traps[0].y }
    tp = stepGame(tp, { type: 'MOVE', dx: 1, dy: 0 })
    ok('teleport trap hurls the hero across the same level', tp.dungeonLevel === 1 && tp.traps[0].seen && /teleports you/.test(tp.messages.at(-1)))
    ok('the teleport trap STAYS ARMED after springing', tp.traps[0].armed === true)
    // walk back onto it: it fires again
    let tp2 = { ...tp, monsters: tp.monsters.filter(m => Math.abs(m.x - tpos.x) > 2 || Math.abs(m.y - tpos.y) > 2), player: { ...tp.player, x: tpos.x - 1, y: tpos.y, confused: 0, sleeping: 0, held: 0 } }
    tp2 = stepGame(tp2, { type: 'MOVE', dx: 1, dy: 0 })
    ok('step two: the same mine fires again', /teleports you/.test(tp2.messages.at(-1)))

    // trap door: fall grudge 0 → 2d6 → 4d6, stairs settle it
    let dr = mineAt(createInitialState(3008), 'door')
    const hpA = dr.player.hp
    dr = stepGame(dr, { type: 'MOVE', dx: 1, dy: 0 })
    ok('first trap door drops a level, grudge unpaid (no damage)', dr.dungeonLevel === 2 && dr.falls === 1 && dr.player.hp === hpA && /fall through a trap door/.test(dr.messages.at(-1)), `hp ${hpA}->${dr.player.hp}`)
    ok('the new level carries its own fresh mines', dr.traps.length >= 2 && dr.traps.every(t => !t.seen))
    // second consecutive fall: 2d6 minimum 2
    let dr2 = mineAt(dr, 'door')
    const hpB = dr2.player.hp
    dr2 = stepGame(dr2, { type: 'MOVE', dx: 1, dy: 0 })
    ok('second consecutive fall hurts (2d6 or more)', dr2.dungeonLevel === 3 && dr2.falls === 2 && hpB - dr2.player.hp >= 2 && /fall hurls you deeper/.test(dr2.messages.at(-1)), `dmg=${hpB - dr2.player.hp}`)
    // walking the stairs honest settles the grudge
    let st = { ...dr2, map: dr2.map.map(r => [...r]) }
    st.map[st.player.y][st.player.x] = '%'
    st = stepGame(st, { type: 'DESCEND' })
    ok('walking the stairs honest wipes the fall grudge', st.falls === 0 && st.dungeonLevel === 4)
}

// honesty + drawing: sprung traps are known, secrets stay secret
{
    // backtick appears where the mine went off
    let s = mineAt(createInitialState(3009), 'str')
    const tx = s.traps[0].x, ty = s.traps[0].y
    s = stepGame(s, { type: 'MOVE', dx: 1, dy: 0 })
    // step away — the mark persists in the lit field
    let s2 = stepGame(s, { type: 'MOVE', dx: -1, dy: 0 })
    const marked = buildGrid(s2)[ty][tx]
    ok('a sprung trap is marked with the original backtick and survives the retreat', marked.char === '`' && s2.player.x === tx - 1 && s2.player.y === ty, marked.char)

    // SEARCH never reveals traps — the ring-of-warning gap stays honest
    let sc = mineAt(createInitialState(3010), 'str')
    const hidden0 = sc.traps.filter(t => t.seen).length
    sc = stepGame(sc, { type: 'SEARCH' })
    sc = stepGame(sc, { type: 'SEARCH' })
    ok('searching one\u2019s own minefield never uncovers a mine', sc.traps.filter(t => t.seen).length === hidden0 && sc.traps[0].seen === false)

    // monsters spring nothing (no monster-trap interaction, by design):
    // a hunter on a clear run between the hero and its mine crosses the
    // trap cell on its way to bite.
    let mm = createInitialState(3011)
    let run = null
    for (let y = 1; y < MAP_H - 1 && !run; y++) {
        let start = null
        for (let x = 1; x <= MAP_W - 2; x++) {
            const walk = mm.map[y][x] === '.' || mm.map[y][x] === '#'
            if (walk) { if (start === null) start = x }
            else if (start !== null && x - start >= 8) { run = { y, start }; break }
            else start = null
        }
    }
    if (!run) run = { y: spotPair(mm).y, start: spotPair(mm).x }
    const mky = run.y, trapX = run.start + 4, monX = run.start + 6, heroX = run.start
    mm = {
        ...mm,
        traps: [{ x: trapX, y: mky, kind: 'str', armed: true, seen: false }],
        monsters: [{ id: 99, x: monX, y: mky, letter: 'K', name: 'kestrel', hp: 4, maxHp: 4, dmg: '1d4', ac: 4, xp: 1, chasing: true, energy: 0, fleeing: false, bitten: false, speed: 1 }],
        player: { ...mm.player, x: heroX, y: mky },
    }
    let crossed = false
    for (let i = 0; i < 12 && !done(mm); i++) {
        mm = advanceMonsters(mm)
        if (mm.monsters[0].x <= trapX) crossed = true
    }
    ok('creatures cross the minefield untouched — monsters spring no traps', crossed && mm.traps[0].seen === false && mm.monsters[0].hp === 4, `crossed=${crossed}`)
}

// ── 14b. #3588 trap personality — named voices, spring-stamped fx, shackles ─
console.log('trap personality (#3588): fx stamps, grudge pitch, HUD shackles, sound kit')
{
    // every kind stamps its spring fx with kind + the cell the view flashes
    let fxOk = true, cellOk = true, first = ''
    for (const [i, kind] of ['door', 'teleport', 'sleep', 'str', 'confuse', 'snare', 'darts'].entries()) {
        let s = mineAt(createInitialState(3100 + i), kind)
        const cell = `${s.traps[0].x},${s.traps[0].y}`
        s = stepGame(s, { type: 'MOVE', dx: 1, dy: 0 })
        const ev = s.fx.find(f => f.k === 'trap')
        if (!ev || ev.kind !== kind) { fxOk = false; first = first || `${kind}: ${JSON.stringify(ev)}` }
        else if (`${ev.x},${ev.y}` !== cell) { cellOk = false; first = first || `${kind}: fx ${ev.x},${ev.y} != ${cell}` }
    }
    ok('every trap kind stamps its spring fx with kind (#3588)', fxOk, first)
    ok('the spring fx names the cell — the white beat lands where the hero was wrong', cellOk, first)

    // the fall grudge rides into the trapdoor fx so the wail can sink with it
    let g = mineAt(createInitialState(3110), 'door')
    g = stepGame(g, { type: 'MOVE', dx: 1, dy: 0 })
    const g1 = g.fx.find(f => f.k === 'trapdoor')
    let g2 = mineAt(g, 'door')
    g2 = stepGame(g2, { type: 'MOVE', dx: 1, dy: 0 })
    const g2e = g2.fx.filter(f => f.k === 'trapdoor').pop()
    ok('trapdoor fx carries the grudge count for pitch (1 → 2)', g1?.falls === 1 && g2e?.falls === 2, `${g1?.falls}/${g2e?.falls}`)

    // shackles: the banner shorthand, pinned against the counters themselves
    ok('shackles names Slp/Hld only while they bite',
        shackles({ sleeping: 5, held: 0 }) === ' Slp:5' && shackles({ sleeping: 0, held: 2 }) === ' Hld:2'
        && shackles({ sleeping: 5, held: 2 }) === ' Slp:5 Hld:2' && shackles({ sleeping: 0, held: 0 }) === '')
    let hud = mineAt(createInitialState(3005), 'snare')
    hud = stepGame(hud, { type: 'MOVE', dx: 1, dy: 0 })
    ok('a sprung snare reads as Hld on the banner', hud.player.held >= 3 && shackles(hud.player) === ` Hld:${hud.player.held}`, shackles(hud.player))
    let hudS = mineAt(createInitialState(3004), 'sleep')
    hudS = stepGame(hudS, { type: 'MOVE', dx: 1, dy: 0 })
    ok('a drugged hero reads as Slp on the banner', hudS.player.sleeping >= 5 && shackles(hudS.player) === ` Slp:${hudS.player.sleeping}`, shackles(hudS.player))

    // the per-kind SYNTH lives in the view (audio can't ring in Node) — gate
    // the kit at its source, so collapsing a voice back into the old snap is red.
    const idxSrc2 = readFileSync(fileURLToPath(new URL('../src/games/Rogue/index.jsx', import.meta.url)), 'utf8')
    ok('fxSound gives every trap kind its own voice (#3588 sound kit)',
        /case 'trap':\s*\n\s*switch \(e\.kind\)[\s\S]*case 'darts'[\s\S]*case 'teleport'[\s\S]*case 'sleep'[\s\S]*case 'snare'[\s\S]*case 'str'[\s\S]*case 'confuse'/.test(idxSrc2))
    ok('the trapdoor wail is pitched by the grudge it carries', /case 'trapdoor'/.test(idxSrc2) && /e\.falls/.test(idxSrc2))
    ok('the spring moment burns the cell white and jitters the grid (view stamps)',
        /trapFlashCells/.test(idxSrc2) && /trapFlashTurn/.test(idxSrc2) && /rogueSpringJitter/.test(idxSrc2) && /#ffffff/.test(idxSrc2))
    ok('the banner carries the shackles notation', /\$\{shackles\(player\)}/.test(idxSrc2))
}

// ── #3592 §amulet — the Amulet of Yendor (Rogue, 1980): dlvl 20 goal object
// and the you-win terminal. Spawn law, BFS reachability, byte-honest shallow
// replay, and the win driven through the REAL reducer.
console.log('\namulet (#3592)')
{
    const SEEDS = [1, 2, 3, 7, 42, 123, 90210, 3579]
    // Independent 8-dir BFS over the shipped map — the harness proves the
    // Amulet's cell is reachable from the level mouth, not trusting the sim.
    const route = (s, tx, ty) => {
        const start = `${s.player.x},${s.player.y}`
        const prev = new Map([[start, null]])
        const q = [[s.player.x, s.player.y]]
        while (q.length) {
            const [x, y] = q.shift()
            if (x === tx && y === ty) {
                const path = []
                let k = `${x},${y}`
                while (prev.get(k)) {
                    const [cx, cy] = k.split(',').map(Number)
                    const [px, py] = prev.get(k).split(',').map(Number)
                    path.unshift({ dx: Math.sign(cx - px), dy: Math.sign(cy - py) })
                    k = prev.get(k)
                }
                return path
            }
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue
                const nx = x + dx, ny = y + dy
                if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H || blocksMove(s.map[ny][nx])) continue
                const k = `${nx},${ny}`
                if (prev.has(k)) continue
                prev.set(k, `${x},${y}`); q.push([nx, ny])
            }
        }
        return null
    }

    // Byte-honest shallow replay (#3579 law): the amulet dice roll ONLY at
    // dlvl 20, so the dungeon structure and stream position below it are the
    // pre-#3592 cart's, exactly. Goldens were captured from origin/main's
    // sim.js (djb2 over map+items+monsters+traps+rooms+doors, randState).
    const GOLDEN = [{"s":1,"d":3141928902,"rs":1872778111},{"s":2,"d":264926641,"rs":-782446962},{"s":3,"d":2961130871,"rs":-1045788049},{"s":7,"d":1764222880,"rs":545165580},{"s":42,"d":1465172412,"rs":1368824876},{"s":123,"d":3733699308,"rs":-1004575632},{"s":90210,"d":3602691012,"rs":-1982086897},{"s":3579,"d":1800104612,"rs":-1677620143}]
    const djb2 = (x) => { let h = 5381; for (let i = 0; i < x.length; i++) h = ((h * 33) ^ x.charCodeAt(i)) >>> 0; return h }
    const shallow = GOLDEN.every((g) => {
        const st = createInitialState(g.s)
        const d = djb2(JSON.stringify([st.map, st.items, st.monsters, st.traps, st.rooms, st.doors]))
        return d === g.d && st.randState === g.rs
    })
    ok('dlvl 1 dungeons + stream replay byte-identical to the pre-#3592 cart (goldens)', shallow)

    let spawnOk = true, reachOk = true, noneShallow = true
    for (const s of SEEDS) {
        for (let lv = 1; lv <= 19; lv++) if (qaSeatLevel(createInitialState(s), lv).items.some(i => i.amulet)) noneShallow = false
        const st = qaSeatLevel(createInitialState(s), 20)
        const am = st.items.filter(i => i.amulet)
        if (am.length !== 1) spawnOk = false
        else {
            const a = am[0]
            if (st.map[a.y][a.x] !== '.') spawnOk = false
            if (Math.max(Math.abs(a.x - st.player.x), Math.abs(a.y - st.player.y)) <= 1) spawnOk = false
            if (st.traps.some(t => t.x === a.x && t.y === a.y)) spawnOk = false
            if (!route(st, a.x, a.y)) reachOk = false
        }
    }
    ok('no amulet on levels 1..19 — the goal sleeps only at dlvl 20', noneShallow)
    ok('exactly one amulet at dlvl 20: floor cell, off the start ring, trap-free', spawnOk)
    ok('the amulet is BFS-reachable from the level mouth on every seed', reachOk)

    // The you-win terminal through the real reducer: ride the guide's route
    // (it hunts the amulet and answers neighbours), then press ',' on the
    // spot — PICKUP is the harness's own keypress, not the guide's.
    // dlvl 20 is the cart's depth and it does kill: the two seeds the guide
    // cannot cross must die HONEST at the same terminal (won === false) —
    // honest losses are the win condition's other half, pinned per seed.
    let winOk = true, fxOk = true, scoreOk = true
    for (const s of [1, 2, 3, 7, 42, 123]) {
        let st = qaSeatLevel(createInitialState(s), 20)
        for (let n = 0; n < 800 && !st.won && st.phase === 'playing'; n++) {
            const a2 = st.items.find(i => i.amulet)
            if (!a2) { winOk = false; break }
            if (st.player.x === a2.x && st.player.y === a2.y) { st = stepGame(st, { type: 'PICKUP' }); break }
            st = stepGame(st, watchStep(st) || { type: 'WAIT' })
        }
        if (!(st.phase === 'gameover' && st.won === true && done(st))) { winOk = false; continue }
        if (!st.fx.some(f => f.k === 'win')) fxOk = false
        if (st.finalScore !== st.player.gold + 20 * 50) scoreOk = false
        if (!/Amulet of Yendor/.test(st.messages[st.messages.length - 1])) winOk = false
    }
    ok('the pickup ends the run: gameover+won, the cart names the Amulet', winOk)
    ok('the win rings its own fx (the view turns it into the sting)', fxOk)
    ok('the win tallies by the cart law: gold + dlvl*50 (dlvl 20)', scoreOk)
    let loseOk = true
    for (const s of [90210, 3579]) {
        let st = qaSeatLevel(createInitialState(s), 20)
        for (let n = 0; n < 800 && !st.won && st.phase === 'playing'; n++) st = stepGame(st, watchStep(st) || { type: 'WAIT' })
        if (!(st.phase === 'gameover' && st.won === false && !!st.killer)) loseOk = false
    }
    ok('depth still kills: the doomed seeds die honest (won false, killer named)', loseOk)

    // Honest terminals stay honest: quitting the amulet floor short of it is a
    // loss, not a silent win; the guide's own hunt reaches the terminal.
    const quit20 = stepGame(qaSeatLevel(createInitialState(7), 20), { type: 'QUIT' })
    ok('QUIT at dlvl 20 short of the Amulet is the loss terminal (won stays false)', quit20.phase === 'gameover' && quit20.won === false)
    let guided = qaSeatLevel(createInitialState(7), 20)
    for (let n = 0; n < 600 && !guided.won && done(guided) === false; n++) guided = stepGame(guided, watchStep(guided) || { type: 'WAIT' })
    ok('the watch brain hunts the Amulet and wins (seed 7, ≤600 turns)', guided.won === true, `turn ${guided.turn}`)
}

console.log(`\nroguecheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
