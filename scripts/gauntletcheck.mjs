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
//   hero      : the hero steps only while he walks and flashes white the moment
//               he is struck — full the tick, decaying to nothing (issue #302).
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

// ----------------------------------------------------------------- hero ----
// The hero reads as a living fighter (issue #302 item 2): he takes a step only
// on the ticks he actually walks, flashes white the moment he is struck (full
// the tick, decaying to nothing over CFG.hitFlash ticks), and spins a full
// turn collapsing to a point over CFG.deathFreeze ticks as he dies.
console.log('hero')
{
    const H = await import('../src/games/Gauntlet/hero.js')
    // the walk frame steps in cycle and never leaves the frame range
    ok(H.walkFrame(0, 2) === 0 && H.walkFrame(8, 2) === 1 && H.walkFrame(16, 2) === 0, 'hero: the walk frame steps in cycle', `${H.walkFrame(8, 2)}`)
    ok([0, 1, 5, 7, 8, 15, 24].every((w) => H.walkFrame(w, 2) < 2), 'hero: the walk frame stays in range')
    // the hit flash: full the tick struck, decaying, 0 when it runs out
    ok(H.hitFlashAlpha(0) === 0, 'hero: no hit flash when unstruck')
    ok(H.hitFlashAlpha(S.CFG.hitFlash) === 1, 'hero: full white the tick he is struck', `${H.hitFlashAlpha(S.CFG.hitFlash)}`)
    ok(H.hitFlashAlpha(Math.round(S.CFG.hitFlash / 2)) > H.hitFlashAlpha(1) && H.hitFlashAlpha(1) > 0, 'hero: the flash decays to nothing', `${H.hitFlashAlpha(Math.round(S.CFG.hitFlash / 2))},${H.hitFlashAlpha(1)}`)
    // the death fall: full size the tick he dies, climbing to a full collapse
    // over deathFreeze; 0 while alive
    ok(H.deathProgress(0) === 0, 'hero: no death fall while he is alive')
    ok(H.deathProgress(S.CFG.deathFreeze) === 0, 'hero: full size the tick he dies')
    ok(H.deathProgress(1) > 0.9 && H.deathProgress(1) < 1, 'hero: nearly collapsed just before the respawn', `${H.deathProgress(1)}`)
    ok(H.deathProgress(Math.round(S.CFG.deathFreeze / 2)) > H.deathProgress(S.CFG.deathFreeze) && H.deathProgress(Math.round(S.CFG.deathFreeze / 2)) < H.deathProgress(1), 'hero: the death fall climbs as he goes down')
    // sim: the walk accumulator advances only the ticks the hero moves
    const g1 = makeGame(0, 'warrior', { topDown: true })
    g1.monsters = []; g1.gens.forEach((g) => { g.alive = false }); g1.hero.hp = 1e9; g1.deathSpawned = true
    const idle0 = g1.hero.walk
    for (let i = 0; i < 40; i++) { step(g1, {}); g1.events.length = 0 }
    ok(g1.hero.walk === idle0, 'hero: the walk holds still while he stands', `${g1.hero.walk}`)
    const move0 = g1.hero.walk
    for (let i = 0; i < 40; i++) { step(g1, { fwd: true }); g1.events.length = 0 }
    ok(g1.hero.walk > move0, 'hero: the walk advances while he walks', `${move0} -> ${g1.hero.walk}`)
    // sim: a strike sets the hit flash, and it decays to nothing on its own
    const g2 = makeGame(0, 'warrior', { topDown: true })
    g2.monsters = []; g2.gens.forEach((g) => { g.alive = false }); g2.hero.hp = 1e9; g2.deathSpawned = true
    g2.monsters.push({ id: 9701, kind: 'grunt', x: g2.hero.x, y: g2.hero.y, hp: MONSTERS.grunt.hp, atkT: 0, castT: 9999, path: [], repathT: 0, drainT: 0 })
    let struck = false
    for (let i = 0; i < 6 && !struck; i++) { step(g2, {}); struck = g2.events.some((e) => e.type === 'hit' && e.target === 'hero'); g2.events.length = 0 }
    ok(struck && g2.hero.hitT === S.CFG.hitFlash, 'hero: a strike sets the hit flash', `hitT=${g2.hero.hitT}`)
    for (let i = 0; i < S.CFG.hitFlash; i++) { step(g2, {}); g2.events.length = 0 }
    ok(g2.hero.hitT === 0, 'hero: the hit flash decays to nothing', `${g2.hero.hitT}`)
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
// Two players (#275 item 7, re-ruled by #494): ANY pad in seat 2 drives the
// partner by human rules — it walks where P2 points it, faces where it walks,
// and cuts beasts in reach; it does NOT trail and gets no door favors. Only
// a partner with NO pad at all (the first-person seat) falls back to the
// old follow.
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
    for (let i = 0; i < 60; i++) { step(g2, { fwd: true }); g2.events.length = 0 }
    ok(Math.hypot(g2.partner.x - g2.hero.x, g2.partner.y - g2.hero.y) < 2, '2p: a seat with no pad at all still trails (first-person fallback)',
        `dist ${(Math.hypot(g2.partner.x - g2.hero.x, g2.partner.y - g2.hero.y)).toFixed(2)}`)
    const g3 = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
    g3.monsters = []; g3.gens.forEach((g) => { g.alive = false })
    for (let i = 0; i < 60; i++) { step(g3, { fwd: true }, { right: true }); g3.events.length = 0 }
    ok(Math.hypot(g3.partner.x - g3.hero.x, g3.partner.y - g3.hero.y) > 2, '#494: a pad in seat 2 wins — even partnerHuman off, the partner obeys its pads',
        `dist ${(Math.hypot(g3.partner.x - g3.hero.x, g3.partner.y - g3.hero.y)).toFixed(2)}`)
}

// ------------------------------------------------- partner intelligence (#505) ----
// The CPU seat thinks like a player: it HOLDS PACE through the hero's sprints
// (heading prediction along a BFS lane), pushes slam doors like seat 1, WAITS
// at a locked door instead of grinding its face, cuts what walks into reach
// without leaving the lane, and breaks away for food when it is hurting.
console.log('partner intelligence (#505)')
{
    const { partnerPad, decide } = await import('../src/games/Gauntlet/planner.js')
    const runPad = (gs, heroInp) => {
        const pad = partnerPad(gs, runPad.prevA || false)
        runPad.prevA = pad.a
        step(gs, heroInp, { left: pad.left, right: pad.right, fwd: pad.up, back: pad.down, sword: pad.a })
        gs.events.length = 0
        return pad
    }
    // pace: down the long top corridor a full sprint; before #505 the elf
    // yo-yoed up to 3.4 cells behind; the pad must hold it inside two.
    {
        const gs = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
        gs.monsters = []; gs.gens.forEach((g) => { g.alive = false })
        gs.hero.x = 20.5; gs.hero.y = 2.5; gs.hero.a = Math.PI
        gs.partner.x = 19.5; gs.partner.y = 2.5
        runPad.prevA = false
        let worst = 0
        for (let i = 0; i < 300; i++) {
            if (i > 60) worst = Math.max(worst, Math.hypot(gs.partner.x - gs.hero.x, gs.partner.y - gs.hero.y))
            runPad(gs, { left: true })
        }
        // measured: heading prediction holds worst gap at 0.18; without it the
        // seat aims one cell behind and drifts to 1.05 — 2.0 was too loose to
        // tell the difference (surviving mutant, nightly 2026-10-21).
        ok(worst < 0.5, '#505: the CPU seat holds pace through a long sprint', `worst gap ${worst.toFixed(2)}`)
    }
    // slam-door parity: the hero waits on the far side; the partner pushes.
    {
        const gs = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
        gs.monsters = []; gs.gens.forEach((g) => { g.alive = false })
        const d = gs.doors.find((x) => !x.locked && !x.open)
        gs.hero.x = d.x + 1.5; gs.hero.y = d.y + 0.5; gs.hero.a = Math.PI
        gs.partner.x = d.x - 1.5; gs.partner.y = d.y + 0.5
        runPad.prevA = false
        let through = false
        for (let i = 0; i < 250 && !through; i++) {
            runPad(gs, {})
            if (Math.floor(gs.partner.x) >= d.x) through = true
        }
        ok(through && (d.open || d.broken), '#505: seat 2 pushes a slam door open like seat 1',
            `P${gs.partner.x.toFixed(1)},${gs.partner.y.toFixed(1)} door ${d.open ? 'open' : d.broken ? 'broken' : 'shut'}`)
    }
    // locked-door WAIT: hero sealed behind the lock; the partner holds at the
    // threshold and never pushes pads into the door face.
    {
        const gs = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
        gs.monsters = []; gs.gens.forEach((g) => { g.alive = false })
        const L = gs.doors.find((x) => x.locked)
        gs.keys = 0
        gs.hero.x = L.x + 1.5; gs.hero.y = L.y + 0.5; gs.hero.a = Math.PI
        gs.partner.x = L.x - 1.0; gs.partner.y = L.y + 0.5
        runPad.prevA = false
        let pushes = 0
        const p0 = { x: gs.partner.x, y: gs.partner.y }
        for (let i = 0; i < 200; i++) {
            const pad = runPad(gs, {})
            if ((pad.right && L.x > gs.partner.x) || (pad.left && L.x < gs.partner.x) ||
                (pad.down && L.y > gs.partner.y) || (pad.up && L.y < gs.partner.y)) pushes++
        }
        const drift = Math.hypot(gs.partner.x - p0.x, gs.partner.y - p0.y)
        ok(pushes === 0 && drift < 1.2 && !L.open && !L.broken,
            '#505: a sealed corridor is a WAIT, never a grind at the door face', `pushes ${pushes} drift ${drift.toFixed(2)}`)
    }
    // hurt partners eat: food off the lane beats tailing the hero; the seat
    // eats what it walks over, and a potion it merely crosses stays put.
    {
        const openGrid = () => Array.from({ length: H }, (_, r) =>
            (r === 0 || r === H - 1) ? '#'.repeat(W) : '#' + '.'.repeat(W - 2) + '#')
        const g = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
        g.levelData = { ...g.levelData, grid: openGrid(), exit: [99, 99] }
        g.doors = []; g.monsters = []; g.gens.forEach((x) => { x.alive = false })
        g.items = [
            { t: 'food', x: 20.5, y: 6.5, taken: false },
            { t: 'potion', x: 14.5, y: 12.5, taken: false },
        ]
        g.hero.x = 12.5; g.hero.y = 10.5; g.hero.a = 0
        g.partner.x = 12.5; g.partner.y = 12.5
        g.partner.hp = 40; g.hero.hp = 1e9
        runPad.prevA = false
        let ate = false
        for (let i = 0; i < 700 && !ate; i++) { runPad(g, {}); if (g.partner.hp > 40) ate = true }
        ok(ate && g.items[0].taken, '#505: a hurt partner breaks away for food', `hp ${g.partner.hp.toFixed(0)}`)
        ok(!g.items[1].taken, '#505: the partner leaves the hero the potion', `potion taken=${g.items[1].taken}`)
    }
    // cut what walks in — without leaving the lane for it
    {
        const openGrid = () => Array.from({ length: H }, (_, r) =>
            (r === 0 || r === H - 1) ? '#'.repeat(W) : '#' + '.'.repeat(W - 2) + '#')
        const g = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
        g.levelData = { ...g.levelData, grid: openGrid(), exit: [99, 99] }
        g.doors = []; g.gens.forEach((x) => { x.alive = false })
        g.items = []
        g.hero.x = 20.5; g.hero.y = 10.5; g.hero.a = Math.PI
        g.partner.x = 12.5; g.partner.y = 10.5
        g.monsters = [{ id: 9701, kind: 'grunt', x: 12.9, y: 10.5, hp: 1, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
        runPad.prevA = false
        let cut = false
        for (let i = 0; i < 40 && !cut; i++) { runPad(g, {}); cut = g.monsters.length === 0 }
        for (let i = 0; i < 40; i++) runPad(g, {})
        ok(cut && g.partner.x > 13.5, '#505: the seat cuts a beast at its blade and keeps closing on the hero',
            `killed=${cut} P${g.partner.x.toFixed(1)}`)
    }
    // regression across seeds: hero on the pilot, seat 2 on the pads — no gap
    // beyond three cells, no grind at any door face.
    {
        let bad = null
        for (const seed of [0, 1, 7]) {
            const gs = makeGame(seed, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
            runPad.prevA = false
            let far = 0, grind = 0
            while (!gs.end && gs.tick < 12000) {
                const d = Math.hypot(gs.partner.x - gs.hero.x, gs.partner.y - gs.hero.y)
                const px = gs.partner.x, py = gs.partner.y
                const shut = gs.doors.filter((dd) => !dd.locked && !dd.open && !dd.broken)
                runPad(gs, decide(gs))
                if (d > 3) far++
                if (Math.hypot(gs.partner.x - px, gs.partner.y - py) < 0.02 && d > 2 &&
                    shut.some((dd) => Math.hypot(dd.x + 0.5 - gs.partner.x, dd.y + 0.5 - gs.partner.y) < 1.6)) grind++
            }
            if (gs.end !== 'win' || far > 40 || grind > 0) bad = `seed ${seed}: end=${gs.end} far=${far} grind=${grind}`
        }
        ok(!bad, '#505: pilot+squad clear seeds 0/1/7 with pace held and zero door grind', bad || 'clean')
    }
}

// ------------------------------------------------------ shared screen (#524) ----
// The cabinet has ONE shared screen: the camera frames both heroes and the
// screen edge is a wall neither can leave. The wall is a SIM rule (step() pulls
// every seat back), so the CPU/model/net seats live by it too. A lone hero still
// roams to the maze edge unchanged.
console.log('shared screen (#524)')
{
    const mm = await import('../src/games/Gauntlet/minimap.js')
    const openGrid = () => Array.from({ length: H }, (_, r) =>
        (r === 0 || r === H - 1) ? '#'.repeat(W) : '#' + '.'.repeat(W - 2) + '#')
    const arena = (opts) => {
        const g = makeGame(0, 'warrior', { topDown: true, partner: true, partnerKey: 'elf', ...opts })
        g.levelData = { ...g.levelData, grid: openGrid(), exit: [99, 99] }
        g.doors = []; g.monsters = []
        g.gens.forEach((x) => { x.alive = false })
        g.hero.hp = 1e9; if (g.partner) g.partner.hp = 1e9
        g.hero.y = 12; if (g.partner) g.partner.y = 12
        return g
    }
    // P1 pushes left, P2 pushes right: they drift apart until the edge pins P2.
    const gs = arena(); gs.partnerHuman = true; gs.hero.x = 8; gs.partner.x = 8
    for (let i = 0; i < 400; i++) { step(gs, { left: true }, { right: true }); gs.events.length = 0 }
    const rect = mm.viewRect(gs.hero, gs.partner)
    ok(mm.inView(rect, gs.hero.x, gs.hero.y) && mm.inView(rect, gs.partner.x, gs.partner.y),
        'shared screen: both heroes stay framed', `H${gs.hero.x.toFixed(1)} P${gs.partner.x.toFixed(1)}`)
    const sep = Math.abs(gs.partner.x - gs.hero.x)
    ok(sep <= mm.VWC + 0.2, 'shared screen: the edge caps how far apart they drift', `sep ${sep.toFixed(2)} <= ${mm.VWC}`)
    // the window must CENTRE on the pair (level-clamped) — not sit on P1 while
    // P2 is merely pinned at P1's edge (a hero-centred camera passes "framed").
    const bA = mm.viewBounds(rect)
    const emx = Math.max(mm.VWC / 2, Math.min(W - mm.VWC / 2, (gs.hero.x + gs.partner.x) / 2))
    const emy = Math.max(mm.VHC / 2, Math.min(H - mm.VHC / 2, (gs.hero.y + gs.partner.y) / 2))
    ok(Math.abs((bA.minx + bA.maxx) / 2 - emx) < 0.01 && Math.abs((bA.miny + bA.maxy) / 2 - emy) < 0.01,
        'shared screen: the camera centres on the pair, not on P1', `cx ${((bA.minx + bA.maxx) / 2).toFixed(2)} vs ${emx.toFixed(2)}`)
    const px0 = gs.partner.x
    for (let i = 0; i < 10; i++) { step(gs, { left: true }, { right: true }); gs.events.length = 0 }
    ok(Math.abs(gs.partner.x - px0) < 0.05, 'shared screen: P2 pinned at the edge holds, never slides off', `dx ${(gs.partner.x - px0).toFixed(3)}`)
    ok(gs.partner.x > 10, 'shared screen: P2 walked away before the wall caught it', `P2 ${gs.partner.x.toFixed(1)}`)
    // a seat that gets flung past the edge (CPU/model/net, no pad) is pulled back
    const g2 = arena({ partnerKey: 'valkyrie' }); g2.partnerHuman = false; g2.hero.x = 6; g2.partner.x = 23
    for (let i = 0; i < 3; i++) { step(g2, {}, {}); g2.events.length = 0 }
    const r2 = mm.viewRect(g2.hero, g2.partner)
    ok(g2.partner.x < 22.9 && mm.inView(r2, g2.partner.x, g2.partner.y) && Math.abs(g2.partner.x - g2.hero.x) <= mm.VWC + 0.2,
        'shared screen: a seat pushed past the edge is pulled back by the sim', `P${g2.partner.x.toFixed(1)} H${g2.hero.x.toFixed(1)}`)
    // one player: the lone hero still roams to the maze edge, unchanged
    const g3 = arena({ partner: false }); g3.hero.x = 8
    for (let i = 0; i < 200; i++) { step(g3, { left: true }); g3.events.length = 0 }
    ok(g3.hero.x < 3 && mm.inView(mm.viewRect(g3.hero, null), g3.hero.x, g3.hero.y),
        'shared screen: a lone hero still roams free (1P unchanged)', `H${g3.hero.x.toFixed(1)}`)
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

// ------------------------------------------------------ attract rule 6 ----
// ART.md rule 6 (#365): one cycling message, a blinking prompt, and NOTHING
// over the HUD band. The old attract drew "DEMO PLAYS THE PROVEN FULL QUEST"
// at y = CH-14 — straight over the HUD level name, HI readout and watermark.
console.log('attract (rule 6)')
const CW = 320, CH = 240, HT = 40, VH = CH - HT
{
    const A = await import('../src/games/Gauntlet/attract.js')
    const { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, estWidth } = A
    ok(INFO_MSGS.length >= 2, 'has more than one message to cycle', `${INFO_MSGS.length}`)
    ok(INFO_MSGS.every((s) => s.length <= 28), 'every message fits one short line',
        INFO_MSGS.filter((s) => s.length > 28).join(' | '))
    ok(!INFO_MSGS.some((s) => /scripts?\/|\.mjs|audit|attract mode/i.test(s)), 'no harness leak in a visible message')
    let stacked = 0, overHud = 0, clipped = 0
    const seen = new Set()
    for (let t = 0; t < HOLD * INFO_MSGS.length + 5; t++) {
        const lines = attractFrame(t, CW, CH, HT, 999999)
        const info = lines.filter((l) => INFO_MSGS.includes(l.text))
        if (info.length !== 1) stacked++
        info.forEach((l) => seen.add(l.text))
        for (const l of lines) {
            if (l.y + l.size > VH) overHud++
            if (estWidth(l) > CW || l.y + l.size > CH || l.y - l.size < 0) clipped++
        }
    }
    ok(stacked === 0, 'one informational message at a time', `${stacked} stacked frames`)
    ok(seen.size === INFO_MSGS.length, 'the slot cycles every message', `${seen.size}/${INFO_MSGS.length}`)
    ok(overHud === 0, 'no attract line enters the HUD band', `${overHud} lines at y+size > ${VH}`)
    ok(clipped === 0, 'no attract line clips the frame', `${clipped}`)
    let on = 0, off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, CW, CH, HT, 0).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, 'the press prompt blinks', `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)/)?.[1]) >= 0.3, 'the demo dims behind the attract text', DIM)
    const jsx = readFileSync('src/games/Gauntlet/index.jsx', 'utf8')
    ok(jsx.includes("from './attract.js'") && jsx.includes('attractFrame(gs.tick'), 'the shell draws through attract.js')
    ok(!/DEMO PLAYS|PRESS ANY KEY TO CHOOSE YOUR HERO/.test(jsx), 'the HUD-over caption and long prompt are gone from the shell')
}

// ------------------------------------------------------------- net-seats ----
// #554 — on the guest, self IS gs.partner, so the hero it must still draw is
// gs.hero. Drawing only gs.partner left the host invisible on the guest screen.
console.log('net-seats (#554)')
{
    const { selfHero, otherHero } = await import('../src/games/Gauntlet/seat.js')
    const hero = { id: 'H' }, partner = { id: 'P' }
    const both = { hero, partner }, solo = { hero, partner: null }
    ok(selfHero(both, 'host') === hero && otherHero(both, 'host') === partner, 'host sees self=hero, other=guest hero')
    ok(selfHero(both, 'guest') === partner && otherHero(both, 'guest') === hero, 'guest sees self=partner AND the host hero', `other=${otherHero(both, 'guest')?.id}`)
    ok(selfHero(both, null) === hero && otherHero(both, null) === partner, 'local 2P keeps self=hero, other=partner')
    ok(otherHero(solo, null) === null && otherHero(solo, 'guest') === null, 'no second hero -> nothing else to draw')
    const jsx = readFileSync('src/games/Gauntlet/index.jsx', 'utf8')
    ok(jsx.includes("from './seat.js'") && jsx.includes('otherHero(gs, net.role)'), 'the shell routes the other-hero choice through seat.js')
    ok(/const other = otherEnt\(\)[\s\S]*?sprite\(other\.name\.toLowerCase\(\), sx\(other\.x\), sy\(other\.y\)/.test(jsx), 'the world draws the OTHER hero, not gs.partner')
    ok(/const mo = otherEnt\(\)/.test(jsx) && /ctx\.fillRect\(px \+ mo\.x \* s - 1, py \+ mo\.y \* s - 1/.test(jsx), 'the minimap plots the other hero too')
    ok(/hudOther && !hudOther\.down && \(gs\.partnerHuman \|\| net\.role\)/.test(jsx), 'the HUD shows the other hero online, not only when partnerHuman')
    ok(!/selfEnt\(\) !== gs\.partner/.test(jsx), 'the old partner-only draw guard is gone')
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
        ['a pad-driven partner ignores its input', 'src/games/Gauntlet/sim.js', 'if (partnerInp) {', 'if (false) {'],
        ['the partner never opens a slam door', 'src/games/Gauntlet/sim.js', 'openSlamInWay(gs, p, ux, uy)\n        const differentCell', 'const differentCell'],
        ['the hero never steps', 'src/games/Gauntlet/sim.js', 'if (Math.hypot(h.x - wx0, h.y - wy0) > 1e-6) h.walk++', 'if (false) h.walk++'],
        ['the hero never flashes on a strike', 'src/games/Gauntlet/sim.js', 'h.hp -= kind.dmg\n                h.hitT = CFG.hitFlash', 'h.hp -= kind.dmg'],
        ['the hero never collapses when dying', 'src/games/Gauntlet/hero.js', '(deadT <= 0 ? 0 : Math.min(1, (CFG.deathFreeze - deadT) / CFG.deathFreeze))', '(deadT <= 0 ? 0 : 0)'],
        ['the HUD-over attract caption returns', 'src/games/Gauntlet/attract.js', "        { text: PRESS,", "        { text: 'DEMO PLAYS THE PROVEN FULL QUEST', x: w / 2, y: h - 14, size: 7, col: '#5d7094', glow: 0 },\n        { text: PRESS,"],
        ['an attract message leaks the harness', 'src/games/Gauntlet/attract.js', "'FOUR MAZES AWAITS',", "'gauntletcheck audits the HUD band',"],
        ['#554 guest draws only the partner (host invisible)', 'src/games/Gauntlet/seat.js', 'selfHero(gs, role) === gs.hero ? gs.partner : gs.hero', 'gs.partner'],
        ['#554 guest self resolves to the hero', 'src/games/Gauntlet/seat.js', "role === 'guest' && gs.partner ? gs.partner : gs.hero", 'gs.hero'],
        ['#554 world reverts to the partner-only guard', 'src/games/Gauntlet/index.jsx', '            const other = otherEnt()\n            if (other && !other.down) sprite(other.name.toLowerCase(), sx(other.x), sy(other.y), 11)', '            if (gs.partner && !gs.partner.down && selfEnt() !== gs.partner) sprite(gs.partner.name.toLowerCase(), sx(gs.partner.x), sy(gs.partner.y), 11)'],
        ['#554 minimap drops the other hero', 'src/games/Gauntlet/index.jsx', 'const mo = otherEnt()', 'const mo = null'],
        ['#554 HUD hides the other hero online', 'src/games/Gauntlet/index.jsx', 'hudOther && !hudOther.down && (gs.partnerHuman || net.role)', 'hudOther && !hudOther.down && gs.partnerHuman'],
        ['#554 shell stops routing through seat.js', 'src/games/Gauntlet/index.jsx', 'const otherEnt = () => otherHero(gs, net.role)', 'const otherEnt = () => null'],
        ['#524 camera ignores the partner (P2 not framed)', 'src/games/Gauntlet/minimap.js', 'const ax = p ? (hero.x + p.x) / 2 : hero.x', 'const ax = hero.x'],
        ['#524 the shared-view wall is removed from the sim', 'src/games/Gauntlet/sim.js', '    clampToSharedView(gs)\n    updateItems(gs)', '    updateItems(gs)'],
        ['#524 the edge is too loose to wall players in', 'src/games/Gauntlet/minimap.js', 'maxx: rect.camX / PX + VWC, maxy: rect.camY / PX + VHC', 'maxx: rect.camX / PX + VWC * 2, maxy: rect.camY / PX + VHC * 2'],
        ['#505 the partner ignores the hero heading (yo-yo pace)', 'src/games/Gauntlet/planner.js', 'if (vs > 0.012) {', 'if (false) {'],
        ['#505 seat 2 never gets slam-door push parity', 'src/games/Gauntlet/sim.js', 'openSlamInWay(gs, p, Math.cos(a), Math.sin(a))\n                moveHuman(gs, p, Math.cos(a) * sp, Math.sin(a) * sp)', 'moveHuman(gs, p, Math.cos(a) * sp, Math.sin(a) * sp)'],
        ['#505 hurt partners never break for food', 'src/games/Gauntlet/planner.js', 'if (p.hp < p.maxHp * 0.55) {', 'if (false) {'],
        ['#505 a sealed corridor is grinded, not waited at', 'src/games/Gauntlet/planner.js', 'const near = (gx, gy) => Math.floor(gy) === pr && Math.floor(gx) === pc', 'const near = () => true'],
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
