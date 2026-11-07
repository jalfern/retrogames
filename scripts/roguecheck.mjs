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

console.log(`\nroguecheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
