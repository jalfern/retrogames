// gauntletcheck — GAUNTLET in plain Node, no browser.
//   geometry  : every prop, door, key and the stairs sit where they can be
//               reached; the exit pocket needs a key (unreachable without one);
//               keys >= locks on every level.
//   rules     : slam door opens on push, SLAMS behind and can be battered
//               open; locked door eats a key and refuses without one; food
//               heals, the drain ticks; potion clears roamers but NOT Death
//               and pays the cleared monsters; a smashed generator stops
//               spawning; Death spawns on the timer and drains; stairs clear
//               the level and the fourth clear ends the quest.
//   ledger    : final score == sum of scored events, pilot run included.
//   minimap   : the map shows beasts only while the view shows them; the
//               stairs pulse only once a key is held.
//   select    : the four hero cards sit where the touch test says they do —
//               a tap on a card can never miss its hero (issue #403).
//   juice     : the view breathes — a red edge throb under 30% health, a
//               sword light-arc trail mid-swing, and a green flush while
//               Death drains you (issue #275 item 4).
//   walls     : the corridor reads as raised brick courses under the hero's
//               torch — lit near him, dark at its reach, two-toned per
//               material (issue #275 item 2).
//   pilot     : seeds 0-3 clear all four mazes; 2/3 do it deathless;
//   slack     : the quest is re-won with one fewer food AND one fewer potion
//               per maze.
//   determinism : same seed twice -> identical digest.
// `-- --mutate` re-plants fifteen fixed bugs in child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { LEVELS, W, H, MONSTERS } = await import('../src/games/Gauntlet/levels.js')
const { SPRITE_DATA } = await import('../src/games/Gauntlet/art.js')
const { NARRATOR, STAIRS_FANFARE } = await import('../src/games/Gauntlet/sound.js')

async function fresh() {
    const sim = await import(`../src/games/Gauntlet/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/Gauntlet/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan, decide: planner.decide }
}
const S = await fresh()
const { makeGame, step, stateHash } = S

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
const bfs = (lv, sr, sc, throughLocks) => {
    const seen = new Set()
    const q = [[sr, sc]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = r * W + c
        if (seen.has(k)) continue
        const ch = lv.grid[r][c]
        if (ch === '#' || (ch === 'L' && !throughLocks)) continue
        seen.add(k)
        q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
    return seen
}
for (const lv of LEVELS) {
    const sNoLock = bfs(lv, Math.floor(lv.start.y), Math.floor(lv.start.x), false)
    const sAll = bfs(lv, Math.floor(lv.start.y), Math.floor(lv.start.x), true)
    const [ex, ey] = lv.exit
    ok(!sNoLock.has(ey * W + ex), `L${lv.idx + 1}: stairs are key-locked`)
    ok(sAll.has(ey * W + ex), `L${lv.idx + 1}: stairs reachable with a key`)
    const keys = lv.props.filter((p) => p[0] === 'key')
    const locks = lv.doors.filter((d) => d.lock).length
    ok(keys.length >= locks, `L${lv.idx + 1}: keys (${keys.length}) cover the locks (${locks})`)
    let keyReach = 0
    for (const [t, x, y] of lv.props) {
        const r = Math.floor(y), c = Math.floor(x)
        if (lv.grid[r][c] === '#') { ok(false, `L${lv.idx + 1}: ${t} sits in a wall`, `${c},${r}`); continue }
        if (t === 'key' && sNoLock.has(r * W + c)) keyReach++
        if (!sAll.has(r * W + c)) ok(false, `L${lv.idx + 1}: ${t} unreachable`, `${c},${r}`)
    }
    ok(keyReach >= locks, `L${lv.idx + 1}: ${keyReach} keys sit outside the locks`)
}

// -------------------------------------------------------------------- art ----
// The beasts are the arcade's spectacle: every monster reads as a >=14x14
// hand-pixeled sprite and carries a 2-frame walk wobble (frame 2 is a bob).
console.log('art')
{
    const mons = ['grunt', 'ghost', 'demon', 'sorcerer', 'lobber', 'death']
    for (const n of mons) {
        const { frames } = SPRITE_DATA[n]
        const w = Math.max(...frames[0].map((r) => r.length))
        const h = frames[0].length
        const even = frames.every((f) => f.length === h && f.every((r) => r.length === w))
        ok(w >= 14 && h >= 14, `art: ${n} sprite is ${w}x${h} (>=14x14)`)
        ok(frames.length >= 2, `art: ${n} carries a 2-frame walk wobble`, `${frames.length} frames`)
        ok(even, `art: ${n} frames are uniform grids`)
    }
}

// ------------------------------------------------------------------ sound ----
// The narrator's lines each carry their own buzz signature, and the
// stairs-clear is a 4-note fanfare rather than a single sweep.
console.log('sound')
{
    const sigs = Object.entries(NARRATOR)
    const canon = (s) => `${s.wave}:${s.notes.join(',')}`
    const uniq = new Set(sigs.map(([, s]) => canon(s)))
    ok(uniq.size === sigs.length, 'sound: every narrator line type has a distinct buzz', `${uniq.size}/${sigs.length}`)
    ok(sigs.every(([, s]) => s.notes.length > 0 && s.wave), 'sound: every buzz has notes + a waveform')
    ok(STAIRS_FANFARE.length === 4, 'sound: the stairs-clear is a 4-note fanfare', `${STAIRS_FANFARE.length} notes`)
    ok(new Set(STAIRS_FANFARE).size === STAIRS_FANFARE.length, 'sound: the fanfare notes are distinct')
    ok(STAIRS_FANFARE.every((f, i) => i === 0 || f > STAIRS_FANFARE[i - 1]), 'sound: the fanfare rises')
}

// --------------------------------------------------------------- minimap ----
// The side map admits only what the cabinet saw: a beast is mapped while the
// view shows it and unmapped when the view leaves, and the stairs pulse only
// once a key is in the pocket.
console.log('minimap')
{
    const mm = await import('../src/games/Gauntlet/minimap.js')
    const gs = makeGame(0, 'warrior', { topDown: true })
    gs.monsters = []
    const rect0 = mm.viewRect(gs.hero)
    ok(rect0.camX === 0 && rect0.camY === H * mm.PX - mm.VH, 'minimap: the camera clamps to the maze', `${rect0.camX},${rect0.camY}`)
    const mk = (id, kind, x, y) => ({ id, kind, x, y, hp: 1, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 })
    gs.monsters.push(
        mk(9201, 'grunt', 5.5, 20.5), // in the hero's view
        mk(9202, 'death', 10.5, 15.5), // in the hero's view
        mk(9203, 'demon', 21.5, 2.5), // far corner, out of view
    )
    const seen = mm.mapMonsters(gs, rect0)
    ok(seen.length === 2, 'minimap: only beasts in the view are mapped', seen.map((m) => m.kind).join(','))
    ok(seen.some((m) => m.kind === 'death'), 'minimap: Death is mapped while in view')
    gs.hero.x = 21.5; gs.hero.y = 2.5
    const rect1 = mm.viewRect(gs.hero)
    ok(mm.mapMonsters(gs, rect1).some((m) => m.kind === 'demon'), 'minimap: the same beast maps once the view reaches it')
    ok(!mm.mapMonsters(gs, rect1).some((m) => m.kind === 'grunt'), 'minimap: a beast leaves the map when the view leaves it')
    ok(mm.stairsPulse(0, 0) === null && mm.stairsPulse(0, 16) === null, 'minimap: no stairs pulse without a key')
    ok([0, 4, 8, 12, 16, 20].every((t) => mm.stairsPulse(1, t) === mm.stairsPulse(1, t + 16)), 'minimap: the stairs pulse runs on a 16-tick period')
    ok(new Set([0, 4, 8, 12].map((t) => mm.stairsPulse(2, t))).size === 3 && mm.stairsPulse(1, 8) === 1, 'minimap: the pulse dims and peaks', [0, 1, 2, 3, 4].map((t) => mm.stairsPulse(1, t)).join(','))
}

// ---------------------------------------------------------------- select ----
// The character-select cards: one definition (select.js) feeds both the
// painter and the touch test, and a tap must always land where the pixels
// are (issue #403 — on a phone the old confirm zone was a 24px sliver and
// the cards were dead).
console.log('select')
{
    const sel = await import('../src/games/Gauntlet/select.js')
    for (let i = 0; i < 4; i++) {
        const r = sel.cardRect(i)
        ok(sel.heroAt(r.x + r.w / 2, r.y + r.h / 2) === i, `select: card ${i + 1} center taps hero ${i + 1}`, `heroAt -> ${sel.heroAt(r.x + r.w / 2, r.y + r.h / 2)}`)
    }
    const a = sel.cardRect(0), b = sel.cardRect(1)
    ok(b.x > a.x + a.w, 'select: the cards do not overlap', `${a} vs ${b}`)
    ok(sel.heroAt((a.x + a.w + b.x) / 2, sel.CARD_Y + sel.CARD_H / 2) === null, 'select: the gap between cards taps nothing')
    ok(sel.heroAt(sel.cardCenter(1), sel.CARD_Y - 10) === null, 'select: above the card row taps nothing')
    ok(sel.heroAt(sel.cardCenter(1), sel.CARD_Y + sel.CARD_H + 10) === null, 'select: below the card row taps nothing')
    ok(sel.heroAt(-5, sel.CARD_Y + sel.CARD_H / 2) === null && sel.heroAt(330, sel.CARD_Y + sel.CARD_H / 2) === null, 'select: past the card edges taps nothing')
}

// ----------------------------------------------------------------- juice ----
// The view breathes (issue #275 item 4): the screen edges throb red under 30%
// health, a swing leaves a light-arc trail on the blade's own arc, and while
// Death is in drain range the whole view flushes green, frame by frame.
console.log('juice')
{
    const j = await import('../src/games/Gauntlet/juice.js')
    // the low-health edge throb
    ok(j.lowHpPulse(100, 100, 24) === 0, 'juice: full health, no screen-edge throb')
    ok(j.lowHpPulse(30, 100, 24) === 0, 'juice: the throb is gated at exactly 30%', `${j.lowHpPulse(30, 100, 24)}`)
    ok(j.lowHpPulse(29, 100, 24) === 1, 'juice: just under 30%, the throb peaks', `${j.lowHpPulse(29, 100, 24)}`)
    ok(j.lowHpPulse(20, 100, 0) === 0 && j.lowHpPulse(20, 100, 24) === 1, 'juice: the throb breathes 0 -> 1 -> 0')
    ok([0, 12, 36].every((t) => j.lowHpPulse(20, 100, t) === j.lowHpPulse(20, 100, t + 48)), 'juice: the throb runs on a fixed period')
    // the sword's light-arc trail
    ok(j.swordTrail(0) === null, 'juice: no trail between swings')
    const s0 = j.swordTrail(S.CFG.swordCool), s1 = j.swordTrail(1)
    ok(!!s0 && Math.abs(s0.lead + S.CFG.swordArc) < 1e-9, 'juice: the streak starts at the rear of the arc', `${s0 && s0.lead}`)
    ok(!!s0 && !!s1 && s1.lead > s0.lead, 'juice: the streak sweeps ahead of the blade', `${s0 && s0.lead} -> ${s1 && s1.lead}`)
    ok(!!s0 && !!s1 && s0.alpha > s1.alpha, 'juice: the streak fades as the swing settles', `${s0 && s0.alpha} -> ${s1 && s1.alpha}`)
    ok(!!s0 && !!s1 && s0.reach > s1.reach, 'juice: the streak stretches as the swing opens', `${s0 && s0.reach} -> ${s1 && s1.reach}`)
    // Death's green drain flush
    const jgs = makeGame(0, 'warrior')
    jgs.monsters = []
    ok(!j.isDraining(jgs), 'juice: no flush while Death is absent')
    jgs.monsters.push({ id: 9601, kind: 'death', x: jgs.hero.x + 2, y: jgs.hero.y, hp: 24, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 })
    ok(!j.isDraining(jgs), 'juice: no flush while Death is out of drain range')
    jgs.monsters[0].x = jgs.hero.x + 0.3
    ok(j.isDraining(jgs), 'juice: the flush arms once Death is in drain range')
    ok(j.deathTint(false, 20) === 0, 'juice: no green the moment Death lifts')
    ok(j.deathTint(true, 20) > 0 && j.deathTint(true, 20) <= 1, 'juice: a living green flush while he drains', `${j.deathTint(true, 20)}`)
    ok([0, 13, 27].every((t) => j.deathTint(true, t) === j.deathTint(true, t + 40)), 'juice: the flush pulses frame by frame on a fixed period')
}

// ----------------------------------------------------------------- walls ----
// The corridor reads as raised brick courses under the hero's torch
// (issue #275 item 2): a wall near the hero is lit, a wall at the torch's
// reach is not, and every course is two-toned — a dark recess + a light
// bevel, per material. A one-tone, evenly-lit wall is the flat look removed.
console.log('walls')
{
    const w = await import('../src/games/Gauntlet/walls.js')
    const M = (await import('../src/games/Gauntlet/art.js')).MATERIALS
    // the torch: full at the hero, zero at its reach, monotonic in distance
    ok(w.torch(0, 0) === 1, 'walls: the torch is full at the hero')
    ok(w.torch(w.TORCH_REACH, 0) === 0, 'walls: the torch dies at its reach', `${w.torch(w.TORCH_REACH, 0)}`)
    ok(w.torch(2, 0) > w.torch(6, 0) && w.torch(6, 0) > w.torch(10, 0), 'walls: the torch falls off with distance', [w.torch(2, 0), w.torch(6, 0), w.torch(10, 0)].join(','))
    ok(w.torch(5, 5) >= 0 && w.torch(5, 5) <= 1, 'walls: the torch stays in [0,1]')
    // lighting is monotonic in the torch level (never darkens a channel)
    ok(w.lum(w.litColor('#8f2f28', 1)) > w.lum(w.litColor('#8f2f28', 0)), 'walls: lit stone is brighter than ambient stone')
    // a wall near the hero out-shines the same wall at the torch reach
    const near = w.litColor(M.red.base, w.torch(1, 0)), far = w.litColor(M.red.base, w.torch(10, 0))
    ok(w.lum(near) > w.lum(far), 'walls: a wall near the hero out-shines one at the torch reach', `${w.lum(near)} vs ${w.lum(far)}`)
    // the courses are two-toned per material, and the tones differ between
    // materials (each world is its own stone)
    for (const name of Object.keys(M)) {
        const t = w.mortarTones(M[name])
        ok(t.recess !== t.bevel, `walls: ${name} course is two-toned (recess != bevel)`)
    }
    ok(w.mortarTones(M.red).recess !== w.mortarTones(M.blue).recess, 'walls: the mortar tone differs between materials')
}

// ---------------------------------------------------------- generators ----
// A generator winds up before it belches: it pulses for a fixed telegraph
// (genPulse ticks) and no beast exists in the hall during that window — the
// monster appears only at the end of the charge, never out of nowhere.
console.log('generators')
{
    const gs = makeGame(0, 'warrior')
    const g = gs.gens[0]
    for (const o of gs.gens) if (o !== g) o.alive = false
    gs.monsters = []
    gs.deathSpawned = true
    gs.hero.hp = 1e9
    let pulseTicks = 0, belched = false, beastDuringPulse = false
    for (let i = 0; i < 900 && !belched; i++) {
        step(gs, {})
        if (g.charge > 0) {
            pulseTicks++
            if (gs.monsters.some((m) => m.x === g.x && m.y === g.y)) beastDuringPulse = true
        }
        if (gs.events.some((e) => e.type === 'spawn')) belched = true
        gs.monsters = []
        gs.events.length = 0
    }
    ok(belched, 'a generator winds up, then belches a beast')
    ok(pulseTicks === S.CFG.genPulse, 'the wind-up lasts exactly the configured telegraph', `${pulseTicks} vs ${S.CFG.genPulse}`)
    ok(S.CFG.genPulse >= 15, 'the telegraph is a real delay, not an instant pop', `${S.CFG.genPulse} ticks`)
    ok(!beastDuringPulse, 'no beast exists while the generator is pulsing')
}

// ------------------------------------------------------------------ rules ----
console.log('rules')
// drain + food
{
    const gs = makeGame(0, 'warrior')
    const hp0 = gs.hero.hp
    for (let i = 0; i < 130; i++) { step(gs, {}); gs.events.length = 0 }
    ok(hp0 - gs.hero.hp >= 2, 'health drains on the clock')
    gs.hero.hp = 60
    const food = gs.items.find((it) => it.t === 'food')
    gs.hero.x = food.x; gs.hero.y = food.y
    step(gs, {})
    ok(gs.hero.hp > 60, 'food restores health')
}
// slam door: push open, slam behind, batter open
{
    const gs = makeGame(0, 'warrior')
    const d = gs.doors.find((x) => !x.locked)
    gs.hero.x = d.x + 1.5; gs.hero.y = d.y + 0.5
    gs.hero.a = Math.PI
    let opened = false
    for (let i = 0; i < 60 && !opened; i++) { step(gs, { fwd: true }); opened = d.open; gs.events.length = 0 }
    ok(opened, 'a slam door opens when you push through')
    for (let i = 0; i < 40 && Math.floor(gs.hero.x) === d.x; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    let slammed = false
    for (let i = 0; i < 120 && !slammed; i++) { step(gs, {}); slammed = !d.open && d.closeT < 0 && !d.broken; gs.events.length = 0 }
    ok(slammed, 'the slam door crashes shut behind you')
    gs.hero.x = d.x + 1.0; gs.hero.y = d.y + 0.5; gs.hero.a = Math.PI
    for (let i = 0; i < 80 && !d.broken; i++) { step(gs, { sword: i % 20 === 0 }); gs.events.length = 0 }
    ok(d.broken, 'a closed slam door can be battered open')
}
// locked door eats a key / refuses without
{
    const gs = makeGame(0, 'warrior')
    const d = gs.doors.find((x) => x.locked)
    gs.hero.x = d.x + 1.5; gs.hero.y = d.y + 0.5; gs.hero.a = Math.PI
    gs.keys = 0
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    ok(!d.open && !d.broken, 'a locked door refuses without a key')
    gs.keys = 1
    const before = gs.keys
    for (let i = 0; i < 60 && !d.open; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    ok(d.open && gs.keys === before - 1, 'a locked door eats exactly one key')
}
// generator: spawns while alive, silent when smashed
{
    const gs = makeGame(0, 'warrior')
    const g = gs.gens[0]
    gs.hero.x = g.x; gs.hero.y = g.y + 2
    gs.monsters = [] // the cap gates spawning; empty the hall to watch the spout
    let spawned = 0
    for (let i = 0; i < 400; i++) { spawned += gs.events.filter((e) => e.type === 'spawn').length; step(gs, {}); spawned += gs.events.filter((e) => e.type === 'spawn').length; gs.events.length = 0 }
    ok(spawned > 0, 'generators pulse monsters while alive')
    gs.hero.x = g.x + 1.2; gs.hero.y = g.y + 0.5; gs.hero.a = Math.PI
    gs.monsters = []
    for (let i = 0; i < 100 && g.alive; i++) { step(gs, { sword: i % 10 === 0 }); gs.events.length = 0 }
    ok(!g.alive, 'the generator itself can be smashed')
    gs.monsters = []
    let after = 0
    for (let i = 0; i < 600; i++) { step(gs, {}); after += gs.events.filter((e) => e.type === 'spawn').length; gs.events.length = 0 }
    ok(after === 0, 'a smashed generator never spawns again')
}
// potion clears roamers but NOT Death
{
    const gs = makeGame(0, 'warrior')
    gs.hero.hp = 20
    gs.monsters.push({ id: 9001, kind: 'death', x: gs.hero.x + 8, y: gs.hero.y, hp: MONSTERS.death.hp, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 })
    const roam0 = gs.monsters.filter((m) => m.kind !== 'death').length
    gs.deathSpawned = true
    const pot = gs.items.find((it) => it.t === 'potion')
    const score0 = gs.score
    gs.hero.x = pot.x; gs.hero.y = pot.y
    step(gs, {})
    ok(gs.monsters.filter((m) => m.kind !== 'death').length === 0 && roam0 > 0, 'a potion clears every roamer')
    ok(gs.monsters.some((m) => m.kind === 'death'), 'potion does NOT touch Death')
    ok(gs.score - score0 >= roam0 * 400, 'potion clears still pay the monsters', `+${gs.score - score0}`)
}
// Death spawns on the timer and drains
{
    const gs = makeGame(0, 'warrior')
    gs.monsters = []
    gs.gens.forEach((x) => { x.alive = false })
    gs.hero.hp = 1e9
    let t = 0
    while (!gs.deathSpawned && t++ < LEVELS[0].deathAt + 50 && !gs.end) step(gs, {}), gs.events.length = 0
    ok(gs.deathSpawned && gs.monsters.some((m) => m.kind === 'death'), 'Death walks the maze when the timer runs out')
    const death = gs.monsters.find((m) => m.kind === 'death')
    gs.hero.hp = 170
    let drained = false
    for (let i = 0; i < 80 && !drained; i++) {
        death.x = gs.hero.x + 0.3; death.y = gs.hero.y
        step(gs, {})
        drained = gs.hero.hp < 170 - 2
        gs.events.length = 0
    }
    ok(drained, 'Death drains health point by point')
}
// stairs clear the level, fourth ends the quest
{
    const gs = makeGame(0, 'warrior')
    const [ex, ey] = LEVELS[0].exit
    gs.keys = 5
    gs.hero.x = ex + 0.5; gs.hero.y = ey + 0.5
    gs.monsters = []
    let cleared = false
    for (let i = 0; i < 40 && !cleared; i++) { cleared = gs.level === 1; step(gs, { fwd: true }); gs.events.length = 0 }
    ok(cleared, 'the stairs lead to the next maze')
    gs.level = 3
    gs.levelData = LEVELS[3]
    gs.hero.x = LEVELS[3].exit[0] + 0.5; gs.hero.y = LEVELS[3].exit[1] + 0.5
    gs.keys = 5
    gs.monsters = []
    let won = false
    for (let i = 0; i < 40 && !won; i++) { step(gs, { fwd: true }); won = gs.end === 'win'; gs.events.length = 0 }
    ok(won, 'the fourth staircase ends the quest')
}
// sword cannot kill through stone
{
    const gs = makeGame(0, 'warrior')
    gs.monsters = [{ id: 9101, kind: 'grunt', x: gs.hero.x + 1.2, y: gs.hero.y - 3.6, hp: 3, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
    gs.hero.a = Math.atan2(-3.6, 1.2)
    const m0 = gs.monsters.length
    for (let i = 0; i < 40; i++) { step(gs, { sword: i % 20 === 0 }); gs.events.length = 0 }
    ok(gs.monsters.length === m0, 'a sword through a pillar hits nothing')
}

// ---------------------------------------------------------- overhead mode ----
// The top-down GAUNTLET rides the same sim: arrows are an 8-way stick (each
// sets facing AND moves), diagonals slide along the free axis, and the pilot
// lane aims absolutely without losing the door/collision rules.
console.log('overhead')
{
    const gs = makeGame(0, 'warrior', { topDown: true })
    gs.monsters = []
    gs.gens.forEach((g) => { g.alive = false })
    const y0 = gs.hero.y
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    ok(gs.hero.y < y0 - 1, 'overhead: UP walks north and faces north', `a ${gs.hero.a.toFixed(2)}`)
    ok(Math.abs(gs.hero.a + Math.PI / 2) < 0.01, 'overhead: facing follows the stick')
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true, right: true }); gs.events.length = 0 }
    ok(Math.abs(gs.hero.a - (-Math.PI / 4)) < 0.01, 'overhead: UP+RIGHT faces north-east')
    // pin against the north border, then a blocked diagonal slides east
    for (let i = 0; i < 400 && gs.hero.y > 1.3; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    const xP = gs.hero.x
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true, right: true }); gs.events.length = 0 }
    ok(gs.hero.x > xP + 1 && gs.hero.y < 1.35, 'overhead: a blocked diagonal slides along the free axis',
        `${gs.hero.x.toFixed(2)},${gs.hero.y.toFixed(2)}`)
    // aim without motion (pilot lane): facing turns, position holds
    const xa = gs.hero.x, ya = gs.hero.y
    for (let i = 0; i < 10; i++) { step(gs, { aim: 0.5 }); gs.events.length = 0 }
    ok(Math.abs(gs.hero.a - 0.5) < 1e-9 && gs.hero.x === xa && gs.hero.y === ya, 'overhead: aim points without walking')
    // an arrow loosed down the aim hits what it points at (south down col 6)
    gs.hero.x = 6.5; gs.hero.y = 2.5; gs.hero.a = Math.PI / 2
    gs.monsters = [{ id: 9501, kind: 'grunt', x: 6.5, y: 6.5, hp: 3, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
    let killed = false
    for (let i = 0; i < 60 && !killed; i++) { step(gs, { aim: Math.PI / 2, arrow: i === 0 }); killed = gs.monsters.length === 0; gs.events.length = 0 }
    ok(killed, 'overhead: arrows fly down the facing')
    // stone stops the arrow: fire NE across a pillar block at a monster beyond it
    gs.hero.x = 2.5; gs.hero.y = 4.5
    gs.monsters = [{ id: 9502, kind: 'grunt', x: 7.5, y: 1.5, hp: 3, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
    let through = false
    for (let i = 0; i < 60; i++) { step(gs, { aim: Math.atan2(-3, 5), arrow: i === 0 }); if (gs.monsters.length === 0) through = true; gs.events.length = 0 }
    ok(!through, 'overhead: stone stops an arrow')
    // the slam door behaves identically overhead
    {
        const g2 = makeGame(0, 'warrior', { topDown: true })
        const d = g2.doors.find((x) => !x.locked)
        g2.hero.x = d.x + 1.5; g2.hero.y = d.y + 0.5
        let opened = false
        for (let i = 0; i < 60 && !opened; i++) { step(g2, { aim: Math.PI, fwd: true }); opened = d.open; g2.events.length = 0 }
        ok(opened, 'overhead: slam doors open on contact too')
    }
}

// -------------------------------------------------------------------- 2p ----
// Human two-player (issue #275 item 7): the partner slot becomes a second
// hero driven by its OWN input (partnerHuman + partnerInp) — it walks where
// P2 points it, faces where it walks, and cuts beasts in reach, and it does
// NOT trail the hero. With partnerHuman off the CPU partner still follows.
console.log('2p')
{
    const gs = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
    gs.partnerHuman = true
    gs.monsters = []
    gs.gens.forEach((g) => { g.alive = false })
    const y0 = gs.partner.y
    for (let i = 0; i < 40; i++) { step(gs, {}, { fwd: true }); gs.events.length = 0 }
    ok(gs.partner.y < y0 - 1, '2p: a human partner walks by its own input', `${gs.partner.x.toFixed(2)},${gs.partner.y.toFixed(2)}`)
    ok(gs.partner.name === 'ELF', '2p: P2 takes the hero picked on the select screen', gs.partner.name)
    const fx = gs.partner.x, fy = gs.partner.y
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true, right: true }, {}); gs.events.length = 0 }
    ok(Math.abs(gs.partner.x - fx) < 0.3 && Math.abs(gs.partner.y - fy) < 0.3, '2p: the partner does not trail the hero', `${gs.partner.x.toFixed(2)},${gs.partner.y.toFixed(2)}`)
    for (let i = 0; i < 5; i++) { step(gs, {}, { fwd: true }); gs.events.length = 0 }
    ok(Math.abs(gs.partner.a + Math.PI / 2) < 0.01, '2p: the partner faces where it walks', `a ${gs.partner.a.toFixed(2)}`)
    gs.partner.x = 5.5; gs.partner.y = 5.5
    gs.monsters = [{ id: 9601, kind: 'grunt', x: 5.6, y: 5.5, hp: 1, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
    let cut = false
    for (let i = 0; i < 40 && !cut; i++) { step(gs, {}, { sword: i === 0 }); cut = gs.monsters.length === 0; gs.events.length = 0 }
    ok(cut, '2p: a partner swing cuts a beast in reach')
    const g2 = makeGame(0, 'warrior', { topDown: true, partner: true })
    g2.monsters = []; g2.gens.forEach((g) => { g.alive = false })
    for (let i = 0; i < 60; i++) { step(g2, { fwd: true }, { right: true }); g2.events.length = 0 }
    ok(Math.hypot(g2.partner.x - g2.hero.x, g2.partner.y - g2.hero.y) < 2, '2p: the CPU partner still follows when partnerHuman is off',
        `dist ${(Math.hypot(g2.partner.x - g2.hero.x, g2.partner.y - g2.hero.y)).toFixed(2)}`)
}

// ---------------------------------------------------------------- partner ----
// The CPU partner opens the slam doors it walks into (issue #275 item 6): the
// hero pushes a corridor open and it slams shut behind, and the partner
// following the hero must push that closed door open and get through — before
// the fix it was stranded on the near side. It opens on push, never by batter.
console.log('partner')
{
    const gs = makeGame(0, 'warrior', { topDown: true, partner: true })
    gs.monsters = []; gs.gens.forEach((g) => { g.alive = false }); gs.hero.hp = 1e9
    const d = gs.doors.find((x) => !x.locked)
    d.open = false; d.closeT = -1                    // the corridor is sealed
    gs.hero.x = d.x + 3.0; gs.hero.y = d.y + 0.5; gs.hero.a = 0
    gs.partner.x = d.x - 1.0; gs.partner.y = d.y + 0.5; gs.partner.a = 0
    let opened = false
    for (let i = 0; i < 400; i++) {
        step(gs, {})
        for (const ev of gs.events) if (ev.type === 'doorOpen') opened = true
        gs.events.length = 0
    }
    ok(opened, 'partner: the partner pushes the sealed slam door open', `${opened}`)
    ok(Math.floor(gs.partner.x) > d.x, 'partner: it follows the hero through the door it opened', `partner ${gs.partner.x.toFixed(2)} vs door ${d.x}`)
    ok(!d.broken, 'partner: it opens the door on push, not by battering it', `${d.broken}`)
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
for (const seed of [0, 1, 2, 3]) {
    const r = S.plan(seed)
    ok(r.won, `pilot clears all four mazes (seed ${seed})`, `deaths=${r.deaths} level=${r.gs.level}`)
}
{
    const a = S.plan(2), b = S.plan(3)
    ok(a.deaths === 0 || b.deaths === 0, 'seeds 2/3 prove a deathless clear', `deaths ${a.deaths}/${b.deaths}`)
}
console.log('slack')
{
    const r = S.plan(2, { slack: true })
    ok(r.won, 'the quest is still won with one fewer food AND potion per maze', `deaths=${r.deaths}`)
}

console.log('overhead pilot')
{
    for (const seed of [0, 1, 2, 3]) {
        const r = S.plan(seed, { topDown: true })
        ok(r.won, `overhead pilot clears all four mazes (seed ${seed})`, `deaths=${r.deaths} level=${r.gs.level}`)
    }
    const t = [0, 1, 2, 3].map((s) => S.plan(s, { topDown: true }).deaths)
    ok(t.some((d) => d === 0), 'the overhead pilot can run deathless', `deaths ${t.join('/')}`)
    const r = S.plan(2, { topDown: true, slack: true })
    ok(r.won, 'the overhead quest is still won with one fewer food AND potion per maze', `deaths=${r.deaths}`)
}

// ---------------------------------------------------------------- ledger ----
console.log('ledger')
{
    const r = S.plan(2)
    const gs = makeGame(2, 'warrior')
    let ledger = 0, up = 20000
    for (const inp of r.script) {
        step(gs, inp)
        for (const ev of gs.events) {
            if (ev.type === 'score') {
                ledger += ev.pts
                if (ledger >= up) { up += 20000 }
            }
        }
        gs.events.length = 0
    }
    ok(ledger === r.gs.score, 'final score equals the sum of scored events', `${ledger} vs ${r.gs.score}`)
}

// ---------------------------------------------------------- determinism ----
console.log('determinism')
{
    const a = S.plan(0), b = S.plan(0)
    ok(a.hash === b.hash, 'same seed replays identically', `${a.hash} vs ${b.hash}`)
}

// ------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const MUTANTS = [
        ['slam doors never close', 'src/games/Gauntlet/sim.js', 'd.closeT = CFG.slamClose', 'd.closeT = -2'],
        ['locked doors open without keys', 'src/games/Gauntlet/sim.js', 'if (gs.keys >= CFG.lockForce)', 'if (gs.keys >= 0 && !gs.keys)'],
        ['potion kills Death too', 'src/games/Gauntlet/sim.js', 'gs.monsters = gs.monsters.filter((m) => MONSTERS[m.kind].drain)', 'gs.monsters = []'],
        ['generators respawn when smashed', 'src/games/Gauntlet/sim.js', 'if (!g.alive) continue\n        if (g.charge > 0) {', 'if (g.charge > 0) {'],
        ['generators pop with no wind-up', 'src/games/Gauntlet/sim.js', 'genPulse: 36', 'genPulse: 1'],
        ['health never drains', 'src/games/Gauntlet/sim.js', 'if (gs.tick % CFG.drainEvery === 0)', 'if (gs.tick % 1000000 === 0)'],
        ['overhead pilot cannot aim', 'src/games/Gauntlet/sim.js', 'if (typeof inp.aim === \'number\') {', 'if (false) {'],
        ['the map shows beasts outside the view', 'src/games/Gauntlet/minimap.js', 'gs.monsters.filter((m) => inView(rect, m.x, m.y))', 'gs.monsters'],
        ['the stairs pulse without a key', 'src/games/Gauntlet/minimap.js', 'if (keys <= 0) return null', 'if (false) return null'],
        ['the low-HP vignette never throbs', 'src/games/Gauntlet/juice.js', 'if (hp >= maxHp * LOW_HP) return 0', 'return 0'],
        ['the sword leaves no light-arc trail', 'src/games/Gauntlet/juice.js', 'if (atkAnim <= 0) return null', 'return null'],
        ['Death drain never tints the view', 'src/games/Gauntlet/juice.js', 'if (!draining) return 0', 'return 0'],
        ['walls never fall off with the torch', 'src/games/Gauntlet/walls.js', 'return Math.max(0, Math.min(1, 1 - d / reach))', 'return 1'],
        ['the wall course is one tone', 'src/games/Gauntlet/walls.js', 'return { recess: mat.mortar, bevel: mat.lite }', 'return { recess: mat.mortar, bevel: mat.mortar }'],
        ['a tap on a card picks no hero', 'src/games/Gauntlet/select.js', 'if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i', 'if (false) return i'],
        ['a human partner ignores its input', 'src/games/Gauntlet/sim.js', 'if (gs.partnerHuman && partnerInp) {', 'if (false) {'],
        ['the partner never opens a slam door', 'src/games/Gauntlet/sim.js', 'openSlamInWay(gs, p, ux, uy)\n        const differentCell', 'const differentCell'],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(file, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/gauntletcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
        writeFileSync(file, orig)
    }
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)
