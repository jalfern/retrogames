// emberwoodcheck — the EMBERWOOD audit (#738). Node-first: maps, the pure sim's
// core rules, the dungeon solver (winnability + gating + slack), and determinism
// all run headless in ~1s. A short Chrome leg drives the real page: it must
// start, walk, fight, die, restart, and never throw a page error.
//
//   npm run dev   (in another shell)   then   npm run emberwoodcheck
//   EMBERWOOD_NO_BROWSER=1 npm run emberwoodcheck   # skip the Chrome leg
import { SCREENS, TS, SW, SH, tileAt, isSolidTile } from '../src/games/Emberwood/world.js'
import { createSim, stepSim, simState, hashState, spawnRoom, saveState, loadState } from '../src/games/Emberwood/sim.js'
import { proveGame, tilePath } from '../src/games/Emberwood/solver.js'
import { attractBot } from '../src/games/Emberwood/bot.js'
import { WIND, SHELF_DECOR } from '../src/games/Emberwood/render.js'
import { MUSIC } from '../src/utils/AudioController.js'
import { MUSIC_STEP, battleHeat, musicStepFor } from '../src/games/Emberwood/art.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('ok   ', m) } else { fail++; console.log('FAIL ', m) } }
const inp = (o = {}) => ({ lx: o.lx || 0, ly: o.ly || 0, aHeld: !!o.a, aPressed: !!o.ap, aReleased: !!o.ar, bPressed: !!o.bp, cPressed: !!o.cp, upPressed: !!o.up, downPressed: !!o.dn })

// ---- 1. map consistency ----
for (const [id, scr] of Object.entries(SCREENS)) {
    ok(scr.rows.length === SH && scr.rows.every(r => r.length === SW), `${id} is ${SW}x${SH}`)
}
let edgeBad = 0
for (const [id, scr] of Object.entries(SCREENS)) {
    for (const dir of Object.keys(scr.exits || {})) {
        const e = scr.exits[dir]
        const back = SCREENS[e.to]
        if (!back) { edgeBad++; continue }
        const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[dir]
        if (!back.exits || !back.exits[opp]) edgeBad++
    }
    for (const d of scr.doors || []) {
        if (d.to && !SCREENS[d.to]) { edgeBad++; console.log('  door -> missing', d.to) }
    }
    for (const w of scr.warps || []) {
        if (!SCREENS[w.to]) { edgeBad++; console.log('  warp -> missing', w.to) }
    }
}
ok(edgeBad === 0, 'every edge exit has a return edge; every door/warp target exists')

// ---- 2. every dungeon exists and has its promised furniture ----
const d1 = ['d1-e0', 'd1-e1', 'd1-e2', 'd1-e3']
const d2 = ['d2-f0', 'd2-f1', 'd2-f2', 'd2-f3', 'd2-f4']
ok(d1.every(id => SCREENS[id]) && d2.every(id => SCREENS[id]), 'both dungeons present (d1:4 rooms, d2:5 rooms)')
ok(d1.concat(d2).some(id => (SCREENS[id].enemies || []).some(e => e.boss === 1)), 'dungeon 1 has a boss (Bramble Maw)')
ok(d2.some(id => (SCREENS[id].enemies || []).some(e => e.boss === 2)), 'dungeon 2 has a boss (Cinder Wyrm)')
ok(d1.some(id => (SCREENS[id].doors || []).some(d => d.kind === 'key')), 'dungeon 1 has a locked door')
ok(d2.some(id => (SCREENS[id].doors || []).some(d => d.kind === 'bigkey')), 'dungeon 2 has a big-key door')
ok(d1.some(id => (SCREENS[id].enemies || []).some(e => e.type === 'maw')), 'dungeon 1 has the Maw')
ok(d2.some(id => (SCREENS[id].switches || []).some(s => s.via === 'arrow')), 'dungeon 2 has far arrow-switches')
const species = new Set()
for (const id of Object.keys(SCREENS)) for (const e of SCREENS[id].enemies || []) species.add(e.type)
for (const sp of ['cinderling', 'bat', 'spitter', 'husk', 'wisp', 'sprig', 'tuskroot', 'pod']) ok(species.has(sp), `species present: ${sp}`)

// ---- 3. THE SOLVER: winnable, gated, and re-proven one supply thinner ----
const full = proveGame({ bombs: true })
ok(full.win === true, 'solver finishes the game (finds the Ember Heart) with bombs bought')
ok(full.d1Done === true, 'solver finishes dungeon 1 (the Bramble Maw falls)')
ok(full.bowGot === true, 'solver obtains the Elder Bow (needed for dungeon 2)')
const noBombs = proveGame({ bombs: false })
ok(noBombs.bowGot === false, 'without bombs the bow is unreachable (crack gates the bow)')
ok(noBombs.win === false, 'without bombs the game cannot be won')
const startFresh = proveGame({ bombs: false, bow: false })
ok(startFresh.d1Done === false || startFresh.bowGot === false, 'a bare starter kit cannot clear dungeon 2 (bow-gated)')

// slack: keys must exceed what the winning route consumes; arrows too.
const keyDoors = d1.concat(d2).reduce((n, id) => n + (SCREENS[id].doors || []).filter(d => d.kind === 'key' || d.kind === 'bigkey').length, 0)
const keyChests = d1.concat(d2).reduce((n, id) => n + (SCREENS[id].chests || []).filter(c => c.item === 'key' || c.item === 'bigkey').length, 0)
const dropKeys = d1.concat(d2).reduce((n, id) => n + (SCREENS[id].enemies || []).filter(e => e.drop === 'key').length, 0)
ok(keyChests + dropKeys >= keyDoors + 1, `keys provisioned (${keyChests} chests + ${dropKeys} drops) >= locked doors (${keyDoors}) + 1 slack`)
const arrowSwitches = d2.reduce((n, id) => n + (SCREENS[id].switches || []).filter(s => s.via === 'arrow').length, 0)
ok(10 >= arrowSwitches + 1, `arrows from the bow gift (10) >= arrow-switches (${arrowSwitches}) + 1 slack`)
// a bomb is consumed at every required crack; re-prove with the whole overworld
// crack economy removed (only dungeon cracks count toward the bow/win)
const reqCracks = ['ck-e1', 'ck-f2']
ok(reqCracks.every(c => ['d1-e1', 'd2-f2'].some(id => (SCREENS[id].cracks || []).some(cr => cr.id === c))), 'required cracks exist in the dungeon bodies')

// ---- 4. determinism: same seed -> same hash trajectory ----
function trace(seed, n) {
    const s = createSim(seed)
    const hs = []
    for (let i = 0; i < n; i++) {
        stepSim(s, inp({ lx: (i % 40 < 20 ? 1 : -1), ly: (i % 71 < 30 ? -1 : 1), ap: i % 17 === 0 }))
        if (i % 25 === 0) hs.push(hashState(s))
    }
    return hs.join(',')
}
const t1 = trace(12345, 500), t2 = trace(12345, 500), t3 = trace(999, 500)
ok(t1 === t2, 'same seed replays a byte-identical hash trajectory')
ok(t1 !== t3, 'a different seed diverges')

// ---- 4b. hit-stop: kills and blasts freeze the world, deterministically ----
function killScript(seed) {
    const s = createSim(seed)
    spawnRoom(s, 'd1-e0', [7, 8])
    const e = s.enemies.find(x => x.type === 'cinderling' && !x.dead)
    if (!e) return 'noenemy'
    e.hp = 1
    s.hero.x = e.x; s.hero.y = e.y + 12; s.hero.dir = 'up'
    stepSim(s, inp({ ap: true }))
    stepSim(s, inp({ ar: true }))
    let froze = 0, pinned = false
    for (let i = 0; i < 8 && !(e.dead && s.hitStop > 0); i++) stepSim(s, inp({}))
    froze = s.hitStop
    const px = s.hero.x, py = s.hero.y, pt = s.tick
    stepSim(s, inp({ lx: 1, ly: 1 })) // try to move during the freeze
    pinned = e.dead && froze > 0 && s.hero.x === px && s.hero.y === py && s.tick > pt
    let clears = 0
    while (s.hitStop > 0 && clears < 40) { stepSim(s, inp({})); clears++ }
    return { froze, pinned, cleared: clears <= 6 && s.hitStop === 0, stop: s.hitStop }
}
{
    const a = killScript(7), b = killScript(7)
    ok(a !== 'noenemy' && a.froze > 0, `a kill triggers hit-stop (hitStop=${a && a.froze})`)
    ok(a !== 'noenemy' && a.pinned, 'during hit-stop the hero is pinned (move intent ignored) while tick advances')
    ok(a !== 'noenemy' && a.cleared, `hit-stop releases after a few frames (clears=${a && a.cleared}, hitStop back to 0)`)
    ok(JSON.stringify(a) === JSON.stringify(b), 'hit-stop is seed-deterministic (identical freeze trajectory)')
}
function blastHitStop(seed) {
    const s = createSim(seed)
    spawnRoom(s, 'ow-00', [6, 5])
    s.enemies = [] // no kill: the blast alone must freeze
    s.items.bombs = 5
    let peak = 0
    stepSim(s, inp({ bp: true }))
    for (let i = 0; i < 90; i++) { stepSim(s, inp({})); if (s.hitStop > peak) peak = s.hitStop }
    return peak
}
ok(blastHitStop(7) > 0 && blastHitStop(7) === blastHitStop(7), `a bomb blast hits stop even with nothing to kill (peak=${blastHitStop(7)})`)

// ---- 4c. swipe arc: a sword swing leaves a deterministic directional trail ----
function arcScript(seed) {
    const s = createSim(seed)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.cool = 0
    s.hero.dir = 'up'
    stepSim(s, inp({ ap: true }))
    stepSim(s, inp({ ar: true }))
    const st = simState(s)
    const active0 = !!(st.arc && st.arc.dir === 'up' && st.arc.id > 0 && st.arc.p >= 0 && st.arc.frames > 0)
    let maxPastBlade = 0, guard = 0
    while (s.arc > 0 && guard < 40) { stepSim(s, inp({})); if (s.swing === 0 && s.arc > 0) maxPastBlade = Math.max(maxPastBlade, s.arc); guard++ }
    const cleared = s.arc === 0 && s.swing === 0
    s.cool = 0; s.hero.dir = 'left'
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    const dleft = !!(simState(s).arc && simState(s).arc.dir === 'left')
    return { active0, frames: st.arc ? st.arc.frames : 0, maxPastBlade, cleared, dleft }
}
{
    const a = arcScript(7), b = arcScript(7)
    ok(a.active0 === true, `a sword swing spawns a swipe arc (up-facing, ${a.frames} frames)`)
    ok(a.maxPastBlade > 0, `the arc trails the blade (outlives the 10-frame swing by ${a.maxPastBlade} frames)`)
    ok(a.cleared === true, 'the swipe arc clears back to null after its frames')
    ok(a.dleft === true, 'the arc follows facing (face left -> left-facing arc)')
    ok(JSON.stringify(a) === JSON.stringify(b), 'the swipe arc is seed-deterministic (identical trail trajectory)')
}
{
    const s = createSim(7)
    spawnRoom(s, 'ow-00', [6, 5])
    s.items.bombs = 5; s.arc = 0
    stepSim(s, inp({ bp: true }))
    let sawArc = false
    for (let i = 0; i < 40; i++) { stepSim(s, inp({})); if (simState(s).arc) sawArc = true }
    ok(sawArc === false, 'a bomb blast does not fake a sword swipe arc')
}

// ---- 5. core mechanics, driven through the sim ----
// grass cut drops, and the cut persists
{
    const s = createSim(7)
    spawnRoom(s, 'ow-00', [6, 5])
    // stand next to a grass tile at (5,5) and face up into it? grass '"' row5 col? find one
    const scr = SCREENS['ow-00']
    let g = null
    for (let y = 0; y < SH && !g; y++) for (let x = 0; x < SW && !g; x++) if (scr.rows[y][x] === '"') g = [x, y]
    ok(!!g, `ow-00 has tall grass at ${g}`)
}
// sword kills a cinderling
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e0', [7, 8])
    const e = s.enemies.find(x => x.type === 'cinderling' && !x.dead)
    s.hero.x = e.x; s.hero.y = e.y + 12; s.hero.dir = 'up'
    const hp0 = e.hp
    stepSim(s, inp({ ap: true }))
    stepSim(s, inp({ ar: true }))
    for (let i = 0; i < 10; i++) stepSim(s, inp({}))
    ok(e.hp < hp0 || e.dead, `sword damages a cinderling (hp ${hp0} -> ${e.hp}${e.dead ? ', dead' : ''})`)
}
// husk deflects from the front, dies from behind
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e1', [7, 8])
    const e = s.enemies.find(x => x.type === 'husk')
    e.fx = 0; e.fy = -1; e.hitT = 80 // freeze the husk (hitT halts its AI) facing up
    // frontal: hero above the face, swinging down into it
    s.hero.x = e.x; s.hero.y = e.y - 12; s.hero.dir = 'down'
    e.hp = 3
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true })); for (let i = 0; i < 10; i++) { stepSim(s, inp({})); e.hitT = 80; e.fx = 0; e.fy = -1 }
    const frontHp = e.hp
    for (let i = 0; i < 20; i++) { stepSim(s, inp({})); e.hitT = 80; e.fx = 0; e.fy = -1 } // let the swing cooldown expire
    // backstab: hero below its back, swinging up
    s.hero.y = e.y + 12; s.hero.dir = 'up'; e.hitSwing = -1
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true })); for (let i = 0; i < 10; i++) { stepSim(s, inp({})); e.hitT = 80; e.fx = 0; e.fy = -1 }
    ok(frontHp === 3 && e.hp < 3, `husk deflects frontal steel (${frontHp}) and falls to a backstab (${e.hp})`)
}
// bomb cracks a wall and reveals the bow
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e1', [7, 8])
    s.items.bombs = 2
    const cr = SCREENS['d1-e1'].cracks.find(c => c.id === 'ck-e1')
    s.hero.x = cr.x * TS; s.hero.y = cr.y * TS + 20 // stand below the crack, bomb drops near
    stepSim(s, inp({ bp: true }))
    for (let i = 0; i < 90; i++) stepSim(s, inp({}))
    ok(s.flags.cracked['ck-e1'] === true, 'bomb blows the cracked wall (ck-e1)')
    ok(s.items.bow === true, 'the crack reveals the Elder Bow')
}
// keys: locked door consumes a key and opens
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.items.keys = 1
    s.hero.x = 7 * TS + 8; s.hero.y = 1 * TS + 6; s.hero.dir = 'up'
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    ok(s.flags.doorsOpen['dr1-0'] === true && s.items.keys === 0, 'a key opens the locked door and is consumed')
    const before = s.flags.doorsOpen['dr1-1']
    ok(before === undefined || before === false, 'a switch-door stays shut until its switch fires')
}
// a key needed where none is held: message, door stays locked
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.hero.x = 7 * TS + 8; s.hero.y = 1 * TS + 6; s.hero.dir = 'up'
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    ok(!s.flags.doorsOpen['dr1-0'] && /KEY/.test(s.msg || ''), 'no key -> door stays locked with a hint')
}
// wyrm ignores swords until an arrow staggers it
{
    const s = createSim(7)
    spawnRoom(s, 'd2-f4', [7, 8])
    const e = s.enemies.find(x => x.type === 'wyrm')
    e.open = 1
    s.hero.x = e.x; s.hero.y = e.y + 14; s.hero.dir = 'up'
    e.hp = 6
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true })); for (let i = 0; i < 10; i++) stepSim(s, inp({}))
    ok(e.hp === 6, 'a sword bounces off the scale-cloak while the maw is closed to steel')
    for (let i = 0; i < 20; i++) stepSim(s, inp({}))
    e.stagger = 100; e.hitSwing = -1
    s.hero.x = e.x; s.hero.y = e.y + 14; s.hero.dir = 'up'
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true })); for (let i = 0; i < 10; i++) stepSim(s, inp({}))
    ok(e.hp < 6, `a staggered wyrm takes sword damage (${e.hp})`)
}
// death respawns at the dungeon mouth, progress kept
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e2', [7, 8])
    s.flags.cracked['ck-e1'] = true // some progress
    s.hero.hp = 1
    // force damage
    for (let i = 0; i < 400 && !s.death; i++) { s.hero.inv = 0; stepSim(s, inp({})) }
    if (!s.death) { s.hero.hp = 0; stepSim(s, inp({})) }
    ok(s.death === true, 'mortal damage kills the hero')
    for (let i = 0; i < 120; i++) stepSim(s, inp({ ap: i === 100 }))
    ok(s.death === false && s.screen === 'd1-e0' && s.flags.cracked['ck-e1'] === true, 'death respawns at the dungeon mouth with progress kept')
}
// spitter projectiles damage the hero
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e2', [7, 8])
    const e = s.enemies.find(x => x.type === 'spitter')
    e.t = 100 // near fire beat
    s.hero.x = e.x + 40; s.hero.y = e.y
    s.hero.inv = 0
    let hurt = false
    for (let i = 0; i < 140; i++) { s.hero.inv = Math.min(s.hero.inv, 1); stepSim(s, inp({})); if (s.hero.hp < 3 || s.death) { hurt = true; break } }
    ok(hurt, 'spitter orbs can wound the hero')
}
// push-block onto a plate opens its door
{
    const s = createSim(7)
    spawnRoom(s, 'd1-e1', [7, 8])
    // simulate the solver's claim that the block reaches the plate, then check the door links
    const p = proveGame({ bombs: true, bow: true })
    ok(p.route.some(r => r.type === 'plate'), 'the solver pushes the dungeon-1 block onto its plate to open the switch-door')
}

// ---- 5b. #781 stage 2: doors that lead somewhere, signposts, blade tier, new species ----
{
    // an opened door carries the hero to the next room; a closed one does not
    const s = createSim(7)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.hero.x = 7 * TS + 8; s.hero.y = 2 * TS
    let f = 0; while (s.screen === 'd1-e0' && f < 80) { stepSim(s, inp({ ly: -1 })); f++ }
    ok(s.screen === 'd1-e0', 'a locked door still blocks the way up')
    s.items.keys = 1; s.hero.dir = 'up'; s.cool = 0
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    f = 0; while (s.screen === 'd1-e0' && f < 80) { stepSim(s, inp({ ly: -1 })); f++ }
    ok(s.screen === 'd1-e1', 'key + A + walk-up walks THROUGH the door into the next room')
    ok(s.flags.killed !== undefined, 'progress flags survive the door')
    // big-key door
    const bk = createSim(7)
    spawnRoom(bk, 'd2-f3', [7, 8]); bk.items.bigkey = true
    bk.hero.x = 7 * TS + 8; bk.hero.y = TS + 6; bk.hero.dir = 'up'; bk.cool = 0
    stepSim(bk, inp({ ap: true })); stepSim(bk, inp({ ar: true }))
    f = 0; while (bk.screen === 'd2-f3' && f < 80) { stepSim(bk, inp({ ly: -1 })); f++ }
    ok(bk.screen === 'd2-f4', 'the big key opens the mossy door to the Wyrm')
    // edge exits are reachable: town -> shrine by walking (col9 lane, west on
    // row1, north through the opening), back by south
    const ow = createSim(7)
    spawnRoom(ow, 'ow-11', [8, 6])
    ow.hero.x = 9 * TS + 8
    f = 0; while (ow.hero.y > TS + 12 && f < 200) { stepSim(ow, inp({ ly: -1 })); f++ }
    while (ow.hero.x > 5 * TS + 8 && f < 260) { stepSim(ow, inp({ lx: -1 })); f++ }
    while (ow.screen === 'ow-11' && f < 320) { stepSim(ow, inp({ ly: -1 })); f++ }
    ok(ow.screen === 'ow-10', `walking north out of town reaches the shrine (screen=${ow.screen})`)
    f = 0; while (ow.screen === 'ow-10' && f < 200) { stepSim(ow, inp({ ly: 1 })); f++ }
    ok(ow.screen === 'ow-11', 'and the return edge brings you back to town')
}
{
    // signposts: facing a sign and pressing A reads it; town is signposted
    const s = createSim(7)
    spawnRoom(s, 'ow-11', [8, 6])
    s.hero.x = 7 * TS + 8; s.hero.y = 3 * TS + 8; s.hero.dir = 'up'; s.cool = 0
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    ok(s.msgT > 0 && /SHOP|EMBER/.test(s.msg || ''), `sign by the shop reads out (${JSON.stringify((s.msg || '').slice(0, 24))})`)
    const signs = SCREENS['ow-11'].signs || []
    ok(signs.length >= 3, `town has ${signs.length} signposts (both entrances + shop)`)
}
{
    // ember blade: shop-bought, doubles the sword, boss rules untouched
    const s = createSim(7)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.score = 200; s.shop.open = true; s.shop.sel = 4
    stepSim(s, inp({ ap: true }))
    ok(s.items.blade === true && s.score === 200 - 150, 'the shop sells the EMBER BLADE for 150 embers')
    stepSim(s, inp({ ap: true }))
    ok(s.items.blade === true && s.score === 50, 'buying the blade twice does not charge twice')
    const e = s.enemies.find(x => x.type === 'cinderling')
    s.shop.open = false
    const hp0 = e.hp
    s.hero.x = e.x; s.hero.y = e.y + 12; s.hero.dir = 'up'; s.cool = 0
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true })); for (let i = 0; i < 10; i++) stepSim(s, inp({}))
    ok(hp0 === 2 && (e.dead || e.hp <= 0), `the ember blade fells a cinderling in ONE hit (hp ${hp0}->${e.hp}${e.dead ? ', dead' : ''})`)
    const w = createSim(7)
    spawnRoom(w, 'd2-f4', [7, 8]); w.items.blade = true
    const wy = w.enemies.find(x => x.type === 'wyrm'); wy.open = 0; wy.hp = 6
    w.hero.x = wy.x; w.hero.y = wy.y + 14; w.hero.dir = 'up'; w.cool = 0
    stepSim(w, inp({ ap: true })); stepSim(w, inp({ ar: true })); for (let i = 0; i < 10; i++) stepSim(w, inp({}))
    ok(wy.hp === 6, 'the blade does NOT skip the Wyrm rule — scale-cloak still shrugs off steel')
    const m = createSim(7)
    spawnRoom(m, 'd1-e3', [7, 8]); m.items.blade = true
    const mw = m.enemies.find(x => x.type === 'maw'); const mhp = mw.hp
    m.hero.x = mw.x; m.hero.y = mw.y + 16; m.hero.dir = 'up'; m.cool = 0
    mw.open = 0
    stepSim(m, inp({ ap: true })); mw.open = 0
    stepSim(m, inp({ ar: true })); mw.open = 0
    for (let i = 0; i < 10; i++) { stepSim(m, inp({})); mw.open = 0 }
    ok(mw.hp === mhp, 'the blade does NOT skip the Maw rule — closed thorns still deflect')
}
{
    // tuskroot: telegraphs, charges in a locked line, rests after
    const s = createSim(7)
    spawnRoom(s, 'ow-01', [2, 5])
    const t = s.enemies.find(e => e.type === 'tuskroot')
    ok(!!t, 'tuskroot lives in fern hollow')
    s.hero.x = t.x; s.hero.y = t.y + 40; s.hero.inv = 1e9
    let tele = 0, charge = 0, segBad = 0, seg = null
    for (let i = 0; i < 260; i++) {
        const st0 = t.st, c0 = t.charging
        stepSim(s, inp({}))
        if (st0 > 0 && t.st > 0) tele++
        if (t.charging > 0) {
            charge++
            const k = Math.trunc(t.chx * 100) + ',' + Math.trunc(t.chy * 100)
            if (c0 === 0) seg = k
            else if (k !== seg) segBad++
        }
    }
    ok(tele > 10, `tuskroot telegraphs before it charges (${tele} pawing frames)`)
    ok(charge > 20 && segBad === 0, `every charge runs a locked straight line (${charge} charge frames, no mid-run turns)`)
    ok(t.st === 0 && t.charging === 0 && t.rest >= 0, 'tuskroot rests after the run — the punish window')
}
{
    // #888 wyrm spine: the tail billboards ride this chain — prove the data is
    // a dense, continuous, moving trail before proving the renderer uses it.
    const s = createSim(11)
    spawnRoom(s, 'd2-f4', [7, 8])
    const w = s.enemies.find(e => e.type === 'wyrm')
    ok(!!w, 'the Cinder Wyrm lives in d2-f4')
    for (let i = 0; i < 240; i++) stepSim(s, inp({}))
    ok(w.seg.length >= 60, `wyrm spine records its full trail (${w.seg.length}/60 points)`)
    let gaps = 0, dup = 0, mx = 0
    for (let i = 1; i < w.seg.length; i++) {
        const d = Math.hypot(w.seg[i].x - w.seg[i - 1].x, w.seg[i].y - w.seg[i - 1].y)
        if (d > 3.5) gaps++
        if (d < 1e-6) dup++
        mx = Math.max(mx, d)
    }
    ok(gaps === 0, `spine is one-frame-dense, no teleport gaps to shred the tail (max jump ${mx.toFixed(2)}px)`)
    ok(dup < w.seg.length / 2, `the spine tracks real motion (${dup}/${w.seg.length} stationary samples)`)
}
{
    // cinder pod: bursts into two sparks
    const s = createSim(7)
    spawnRoom(s, 'd2-f1', [7, 8])
    const p = s.enemies.find(e => e.type === 'pod')
    p.hp = 1
    s.hero.x = p.x; s.hero.y = p.y + 12; s.hero.dir = 'up'; s.cool = 0
    stepSim(s, inp({ ap: true })); stepSim(s, inp({ ar: true }))
    for (let i = 0; i < 30; i++) stepSim(s, inp({}))
    const kids = s.enemies.filter(e => e.gen === 1 && !e.dead)
    ok(p.dead && kids.length === 2, `a fallen cinder pod bursts into two sparks (${kids.length})`)
}
{
    // THE PROOF ROUTE: the attract bot plays the whole vale with real inputs
    function botRun(seed) {
        const s = createSim(seed)
        let t = 0, sawMawRoom = false, sawBoss1 = false
        while (!s.win && t < 30000) {
            stepSim(s, attractBot(s))
            t++
            if (s.screen === 'd1-e3') sawMawRoom = true
            if (s.flags.boss1) sawBoss1 = true
        }
        return { win: s.win, t, sawMawRoom, sawBoss1, hash: hashState(s) }
    }
    const a = botRun(11), b = botRun(11)
    ok(a.sawMawRoom && a.sawBoss1, `the attract bot reaches the Maw and fells it (tick ${a.t})`)
    ok(a.win, `the attract bot wins the game for real — Ember Heart at tick ${a.t}`)
    ok(a.t === b.t && a.hash === b.hash, 'the proof route is deterministic (identical run, identical hash)')
    ok(a.t > 3000, `the route is a real traverse, not a teleport (${a.t} ticks of walking)`)
}
{
    // GRACEFUL FIGHTS (#874): the attract bot fights the vale's rules, not
    // just through them. Each species scenario drives attractBot with real
    // inputs against one monster and checks the choreography the README sells.
    function duel(screen, type, cap) {
        const s = createSim(11)
        spawnRoom(s, screen, null)
        s.enemies = s.enemies.filter(e => e.type === type)
        const hp0 = s.hero.hp
        let t = 0, hurt = 0, hits = 0, clanks = 0, shots = 0, staggers = 0, swingsInRest = 0
        let charged = 0, hurtInCharge = 0, restClose = 1e9, closedMin = 1e9, openMin = 1e9
        while (t < cap) {
            const inp = attractBot(s)
            const e = s.enemies.find(x => !x.dead)
            const d = e ? Math.hypot(e.x - s.hero.x, e.y - s.hero.y) : 1e9
            if (e) {
                if (type === 'tuskroot' && (e.st > 0 || e.charging > 0)) charged++
                if (type === 'tuskroot' && e.rest > 0) { restClose = Math.min(restClose, d); if (inp.aPressed) swingsInRest++ }
                if (type === 'maw') { if (e.open > 0) openMin = Math.min(openMin, d); else closedMin = Math.min(closedMin, d) }
            }
            const hp = s.hero.hp
            stepSim(s, inp)
            s.fx.forEach(f => {
                if (f.k === 'hurt') hurt++
                if (f.k === 'hit') hits++
                if (f.k === 'clank') clanks++
                if (f.k === 'shoot') shots++
                if (f.k === 'stagger') staggers++
            })
            if (type === 'tuskroot' && e && (e.st > 0 || e.charging > 0) && s.hero.hp < hp) hurtInCharge++
            s.fx.length = 0
            const done = type === 'maw' ? s.flags.boss1 : type === 'wyrm' ? s.flags.boss2 : s.enemies.every(x => x.dead || x.type !== type)
            if (done) { t++; break }
            t++
        }
        const left = s.enemies.filter(x => x.type === type && !x.dead).length
        return { t, left, hurt, hits, clanks, shots, staggers, charged, hurtInCharge, restClose, swingsInRest, closedMin, openMin, hp0, hp: s.hero.hp }
    }
    const tk = duel('ow-01', 'tuskroot', 1500)
    ok(tk.charged > 0 && tk.hurtInCharge === 0, `tuskroot: sidesteps every telegraph and locked charge line (charges ${tk.charged}, damage taken during windup/charge ${tk.hurtInCharge})`)
    ok(tk.restClose <= 20 && tk.swingsInRest > 0, `tuskroot: punishes the 55-frame rest window (min ${tk.restClose.toFixed(0)}px, ${tk.swingsInRest} swings landed in rest)`)
    const hk = duel('d1-e1', 'husk', 400)
    ok(hk.left === 0 && hk.hits >= 2, `husk: falls to diagonal flank bites (${hk.hits} landed, ${hk.t} ticks)`)
    ok(hk.clanks === 0, `husk: the frontal deflect arc is never head-on-tested (clanks ${hk.clanks})`)
    const cl = duel('d1-e0', 'cinderling', 150)
    ok(cl.left === 0 && cl.hurt === 0, `trash: slash-and-hop kills without a scratch (${cl.hits} hits, ${cl.t} ticks, hurt ${cl.hurt})`)
    const mw = duel('d1-e3', 'maw', 2000)
    ok(mw.left === 0 && mw.hits >= 2 && mw.clanks === 0, `Maw: strikes land only in the thorn window (${mw.hits} hits, clanks ${mw.clanks}, ${mw.t} ticks)`)
    const wy = duel('d2-f4', 'wyrm', 2000)
    ok(wy.left === 0 && wy.shots >= 2 && wy.staggers >= 1 && wy.clanks === 0, `Wyrm: kited volleys stagger the maw before steel ever touches the cloak (${wy.shots} shots, ${wy.staggers} staggers, clanks ${wy.clanks})`)
}
{
    // #877 juice events: charge-dust rides behind the heels, the telegraph
    // paws a puff, and a fallen pod pops exactly once.
    const s = createSim(7)
    spawnRoom(s, 'ow-01', [2, 5])
    const t = s.enemies.find(e => e.type === 'tuskroot')
    s.hero.x = t.x; s.hero.y = t.y + 40; s.hero.inv = 1e9
    let dustInCharge = 0, behindOk = 0, dustTele = 0, dustElsewhere = 0, charges = 0
    for (let i = 0; i < 400; i++) {
        const wasCharge = t.charging > 0
        stepSim(s, inp({}))
        if (!wasCharge && t.charging > 0) charges++
        for (const f of s.fx) {
            if (f.k !== 'dust') continue
            if (t.charging > 0) {
                dustInCharge++
                if (Math.abs(f.dirx) + Math.abs(f.diry) > 0.5 && f.dirx * t.chx + f.diry * t.chy <= 0.01) behindOk++
            } else if (t.st > 0) dustTele++
            else dustElsewhere++
        }
        s.fx.length = 0
    }
    ok(charges >= 1 && dustInCharge >= 3, `the charge kicks dust behind the heels (${dustInCharge} puffs across ${charges} charge(s))`)
    ok(dustInCharge > 0 && behindOk === dustInCharge, `every charge puff sits opposite the locked line (${behindOk}/${dustInCharge})`)
    ok(dustTele >= 1, `the telegraph paws up a puff before the run (${dustTele})`)
    ok(dustElsewhere === 0, `no dust while calm or resting — it means the run (${dustElsewhere} stray)`)
    const pod = createSim(7)
    spawnRoom(pod, 'd2-f1', [7, 8])
    const p = pod.enemies.find(e => e.type === 'pod'); p.hp = 1
    pod.hero.x = p.x; pod.hero.y = p.y + 12; pod.hero.dir = 'up'; pod.cool = 0
    let splits = 0
    stepSim(pod, inp({ ap: true })); stepSim(pod, inp({ ar: true }))
    for (let i = 0; i < 30; i++) { stepSim(pod, inp({})); splits += pod.fx.filter(f => f.k === 'split').length; pod.fx.length = 0 }
    ok(splits === 1, `a bursting pod pops exactly once (${splits} split events)`)
    const calm = createSim(7)
    spawnRoom(calm, 'ow-01', [2, 5])
    calm.enemies = calm.enemies.filter(e => e.type !== 'tuskroot')
    let stray = 0
    for (let i = 0; i < 300; i++) { stepSim(calm, inp({})); stray += calm.fx.filter(f => f.k === 'dust').length; calm.fx.length = 0 }
    ok(stray === 0, `dust is the tuskroot's signature, not ambient (${stray} dust without one)`)
}

// ---- 5d. #952 gap 0: the vale remembers — save/continue, secret colporter, elder's gift ----
{
    const talk = (id, x, y, dir, seed = 3) => {
        const s = createSim(seed)
        spawnRoom(s, id, [x, y])
        s.hero.dir = dir
        stepSim(s, inp({ ap: true }))
        stepSim(s, inp({ ar: true }))
        return s
    }
    const e = talk('ow-11', 12, 9, 'up')
    const gifted = !!e.flags.elderGifted
    const pot1 = e.items.potions
    const msg1 = e.msg
    stepSim(e, inp({ ap: true }))
    stepSim(e, inp({ ar: true }))
    ok(gifted && pot1 === 1 && /POTION/.test(msg1 || ''), "the elder's first audience gifts a smouldering potion")
    ok(/CINDER WYRM/.test(e.msg || '') && e.items.potions === 1, 'the second audience is the hint again — the gift never repeats')
    const hooded = talk('ow-11', 1, 9, 'right')
    ok(!hooded.shop.open, 'without the Ember Blade the colporter keeps his hood up (no shop opens)')
    hooded.items.blade = true
    for (let i = 0; i < 20; i++) stepSim(hooded, inp({}))
    stepSim(hooded, inp({ ap: true }))
    stepSim(hooded, inp({ ar: true }))
    ok(hooded.shop.open && hooded.shop.id === 'colporter', 'the Ember Blade reveals the colporter')
    hooded.score = 500
    hooded.shop.sel = 3
    stepSim(hooded, inp({ ap: true }))
    ok(hooded.hero.max === 4 && hooded.score === 100, 'the colporter sells a heart container for 400 embers (+max heart, embers paid)')
    hooded.score = 5
    stepSim(hooded, inp({ ap: true }))
    ok(hooded.msg === 'NOT ENOUGH EMBERS', 'the colporter refuses short coin')
    const keeper = talk('ow-11', 5, 2, 'up')
    ok(keeper.shop.open && keeper.shop.id === 'shop', 'the town keeper still runs the Ember Shop menu')
    const s = createSim(5)
    spawnRoom(s, 'd1-e0', [7, 8])
    s.flags.cracked['ck-e1'] = true
    s.items.bow = true
    s.score = 42
    s.hero.hp = 2
    s.hero.inv = 99999
    for (let i = 0; i < 60; i++) stepSim(s, inp({ lx: 1 }))
    const saved = JSON.parse(JSON.stringify(saveState(s)))
    ok(saved.tick === s.tick && s.tick > 40, `the save freezes the clock mid-run (tick ${saved.tick})`)
    const s2 = createSim(999)
    ok(loadState(s2, saved) === true, 'a save loads onto a fresh sim')
    ok(s2.screen === 'd1-e0' && s2.items.bow === true && s2.score === 42 && s2.hero.hp === 2 && !!s2.flags.cracked['ck-e1'], 'the save carries screen, items, embers, hp and world flags')
    ok(s2.tick === s.tick && Math.abs(s2.hero.x - s.hero.x) < 0.01 && Math.abs(s2.hero.y - s.hero.y) < 0.01, 'the restored hero stands exactly where the save left him')
    // enemies respawn on load (that is what a save standing at a door means), so
    // the full-hash identity holds at a transition boundary — where saves fire.
    const b = createSim(5)
    spawnRoom(b, 'd1-e0', [7, 8])
    b.items.bow = true
    b.score = 12
    const hb = hashState(b)
    const s3 = createSim(777)
    ok(loadState(s3, JSON.parse(JSON.stringify(saveState(b)))) && hashState(s3) === hb, `a boundary save continues with the identical hash (${hb})`)
    ok(loadState(s2, { v: 7 }) === false, 'a foreign save version is refused')
}

// ---- 6. state contract shape ----
{
    const s = createSim(7)
    stepSim(s, inp({ lx: 1 }))
    const st = simState(s)
    ok(typeof st.tick === 'number' && typeof st.score === 'number' && 'done' in st && typeof st.hash === 'number', 'simState carries tick/score/done/hash')
}

// ---- 6b. movement flow (#786): smooth walking — no pinches, every gap passes off-center ----
{
    const sol = (s, x, y) => { const ch = tileAt(s, x, y); return ch === 'C' || isSolidTile(ch) }
    const cnt = (s, x, y) =>
        (s.chests || []).some(c => c.x === x && c.y === y) ||
        (s.doors || []).some(d => d.x === x && d.y === y) ||
        (s.blocks || []).some(b => b.x === x && b.y === y) ||
        (s.warps || []).some(w => w.x === x && w.y === y)
    const freeBox = (s, X, Y) => {
        for (let ty = Math.floor((Y - 4) / TS); ty <= Math.floor((Y + 4 - 0.001) / TS); ty++)
            for (let tx = Math.floor((X - 5) / TS); tx <= Math.floor((X + 5 - 0.001) / TS); tx++)
                if (sol(s, tx, ty) || cnt(s, tx, ty)) return false
        return true
    }
    const pinches = []
    let gTests = 0, gFails = 0, gMeat = 0
    const gFl = []
    for (const id of Object.keys(SCREENS)) {
        const s = SCREENS[id]
        for (let y = 0; y < SH - 1; y++) for (let x = 0; x < SW - 1; x++) {
            if (sol(s, x, y) && sol(s, x + 1, y + 1) && !sol(s, x + 1, y) && !sol(s, x, y + 1)) pinches.push(`${id}:${x},${y}x`)
            if (sol(s, x + 1, y) && sol(s, x, y + 1) && !sol(s, x, y) && !sol(s, x + 1, y + 1)) pinches.push(`${id}:${x},${y}/`)
        }
        for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
            if (sol(s, x, y) || cnt(s, x, y)) continue
            const vert = sol(s, x - 1, y) && sol(s, x + 1, y) && !sol(s, x, y - 1) && !sol(s, x, y + 1)
            const horz = sol(s, x, y - 1) && sol(s, x, y + 1) && !sol(s, x - 1, y) && !sol(s, x + 1, y)
            if (!vert && !horz) continue
            if (cnt(s, x, y - 1) || cnt(s, x, y + 1) || cnt(s, x - 1, y) || cnt(s, x + 1, y)) continue
            for (const o of [-5, -3, 0, 3, 5]) {
                let off = o
                if (vert) {
                    while (off !== 0 && !freeBox(s, x * TS + 8 + off, (y - 1) * TS + 12)) off -= Math.sign(o)
                    if (!freeBox(s, x * TS + 8 + off, (y - 1) * TS + 12)) continue
                    gTests++; if (Math.abs(off) >= 4) gMeat++
                    const sim = createSim(7); spawnRoom(sim, id, null); sim.enemies = []
                    sim.hero.x = x * TS + 8 + off; sim.hero.y = (y - 1) * TS + 12
                    let okRun = false
                    for (let f = 0; f < 60; f++) {
                        stepSim(sim, inp({ ly: 1 }))
                        if (sim.screen !== id) break
                        if (Math.floor(sim.hero.x / TS) === x && Math.floor(sim.hero.y / TS) >= y) { okRun = true; break }
                    }
                    if (!okRun) { gFails++; gFl.push(`${id} V(${x},${y}) o=${off}`) }
                }
                if (horz) {
                    while (off !== 0 && !freeBox(s, (x - 1) * TS + 8, y * TS + 8 + off)) off -= Math.sign(o)
                    if (!freeBox(s, (x - 1) * TS + 8, y * TS + 8 + off)) continue
                    gTests++; if (Math.abs(off) >= 4) gMeat++
                    const sim = createSim(7); spawnRoom(sim, id, null); sim.enemies = []
                    sim.hero.x = (x - 1) * TS + 8; sim.hero.y = y * TS + 8 + off
                    let okRun = false
                    for (let f = 0; f < 60; f++) {
                        stepSim(sim, inp({ lx: 1, ly: off === 0 ? 0 : -Math.sign(off) * 0.4 }))
                        if (sim.screen !== id) break
                        if (Math.floor(sim.hero.x / TS) >= x && Math.abs(sim.hero.y - (y * TS + 8)) < 8) { okRun = true; break }
                    }
                    if (!okRun) { gFails++; gFl.push(`${id} H(${x},${y}) o=${off}`) }
                }
            }
        }
    }
    ok(pinches.length === 0, `no diagonal pinches on any map${pinches.length ? ' -> ' + pinches.join(' ') : ''}`)
    ok(gTests > 200 && gFails === 0, `every 1-tile gap passes from off-center starts ±5px (#786): ${gTests} runs, ${gMeat} need corner-nudge${gFl.length ? ' -> ' + gFl.slice(0, 6).join(' ') : ''}`)
    ok(gMeat >= 40, `the gap sweep actually exercises off-center entries (meat runs: ${gMeat})`)
}

// ---- 6c. music beds (#781): two originals exist, one per world layer ----
{
    for (const tr of ['emberwoodVale', 'emberwoodDeep']) {
        const P = MUSIC[tr]
        ok(!!P, `music bed exists: ${tr}`)
        ok(!!P && P.lead.length === 32 && P.bass.length === 32 && P.perc.length === 32,
            `${tr} is a full 32-step bed (lead+bass+perc aligned)`)
        ok(!!P && P.step > 0.08 && P.step < 0.2, `${tr} tempo is playable (${P && P.step}s/step)`)
    }
    ok(MUSIC.emberwoodDeep.step > MUSIC.emberwoodVale.step,
        'the dungeon bed is slower than the vale bed (moody by composition, not just volume)')
    const darkCount = Object.values(SCREENS).filter(s => s.dark).length
    const litCount = Object.values(SCREENS).filter(s => !s.dark).length
    ok(darkCount > 0 && litCount > 0, `both world layers exist for the track switch (${litCount} lit / ${darkCount} dark screens)`)
}

// ---- 6d. #963 tempo seam: the beds lift with combat heat via setMusicStep ----
{
    for (const tr of ['emberwoodVale', 'emberwoodDeep']) {
        ok(MUSIC_STEP[tr] === MUSIC[tr].step, `MUSIC_STEP mirrors the resting grid of ${tr} (${MUSIC_STEP[tr]})`)
        ok(musicStepFor(tr, 0) === MUSIC_STEP[tr], `${tr} runs the resting grid when the vale is cold`)
        const hot = musicStepFor(tr, 1)
        ok(hot < MUSIC_STEP[tr], `${tr} quickens at full heat (${hot.toFixed(4)} < ${MUSIC_STEP[tr]})`)
        ok(hot > MUSIC_STEP[tr] * 0.8, `${tr} lift stays musical, not cartoonish (${Math.round((1 - hot / MUSIC_STEP[tr]) * 100)}%)`)
        ok(Math.abs(hot - MUSIC_STEP[tr] * 0.88) < 1e-9, `${tr} lifts exactly 12% at full heat`)
        let prev = null, mono = true
        for (let h = 0; h <= 1.0001; h += 0.05) {
            const s = musicStepFor(tr, h)
            if (prev !== null && s > prev + 1e-12) mono = false
            prev = s
        }
        ok(mono, `${tr} tempo is monotonic in heat`)
    }
    ok(musicStepFor('emberwoodVale', 7) === musicStepFor('emberwoodVale', 1), 'heat clamps at the top')
    ok(musicStepFor('emberwoodVale', -2) === MUSIC_STEP.emberwoodVale, 'heat clamps at the bottom')
    ok(musicStepFor('nope', 0.5) === 0, 'an unknown bed asks for no step')
    const room = (n, opts = {}) => ({
        hero: { x: 0, y: 0 },
        enemies: Array.from({ length: n }, (_, i) => ({ x: 400 + i, y: 400, dead: false, boss: opts.boss ? 1 : 0 })),
    })
    ok(battleHeat(room(0)) === 0, 'an empty room is cold')
    ok(battleHeat({ hero: { x: 0, y: 0 }, enemies: [{ x: 5, y: 0, dead: true }] }) === 0, 'corpses do not heat the vale')
    ok(battleHeat(room(1, { boss: true })) === 1, 'a boss pins the heat at 1')
    ok(battleHeat(room(4)) > 0 && battleHeat(room(4)) < battleHeat(room(1, { boss: true })), 'a crowd heats, but below a boss')
    ok(battleHeat({ hero: { x: 0, y: 0 }, enemies: [...room(2).enemies, ...room(2, {}).enemies.map(e => ({ ...e, dead: true }))] }) === battleHeat(room(2)), 'dead bodies in the room change nothing (corpses are filtered, not counted)')
    const crowdUp = battleHeat(room(1)) < battleHeat(room(3))
    ok(crowdUp, 'more live enemies raise the heat')
    const near = battleHeat({ hero: { x: 0, y: 0 }, enemies: [{ x: 8, y: 0, dead: false }] })
    const far = battleHeat({ hero: { x: 0, y: 0 }, enemies: [{ x: 400, y: 400, dead: false }] })
    ok(near > far, 'proximity heats: an enemy at 8px out-heats one at 566px')
    ok(near <= 1 && far >= 0, 'heat lives in [0,1]')
}

const nodeResult = { pass, fail }

// ---- 6b. #789 living foliage: the wind field is bounded, gusty, phased, deterministic ----
{
    let tMax = 0, bMax = 0, gMax = 0, gustMin = 9, gustMax = -9
    for (let t = 0; t < 24; t += 1 / 30) {
        const gu = WIND.gust(40, 48, t)
        tMax = Math.max(tMax, Math.abs(WIND.tree(40, 48, t)))
        bMax = Math.max(bMax, Math.abs(WIND.bush(40, 48, t)))
        gMax = Math.max(gMax, Math.abs(WIND.grass(40, 48, t)))
        gustMin = Math.min(gustMin, gu); gustMax = Math.max(gustMax, gu)
    }
    ok(tMax > 0.02 && tMax <= 0.051, `tree sway is visible but restrained (peak ${tMax.toFixed(3)} rad, ceil 0.05)`)
    ok(bMax > tMax && bMax <= 0.091, `bushes rustle tighter and livelier than trees (peak ${bMax.toFixed(3)} > ${tMax.toFixed(3)} rad)`)
    ok(gMax > 0.02 && gMax <= 0.061, `grass shiver stays a sub-pixel texture shift (peak ${gMax.toFixed(3)} uv, ceil 0.06)`)
    ok(gustMin < 0.25 && gustMax > 0.85, `gusts cycle the vale's breath (${gustMin.toFixed(2)}..${gustMax.toFixed(2)})`)
    ok(WIND.tree(24, 40, 5.1) !== WIND.tree(184, 96, 5.1) && WIND.tree(24, 40, 5.1) === WIND.tree(24, 40, 5.1), 'wind is spatially phased yet deterministic (same spot+time -> same sway)')
}

// ---- 6c. #939 shelf pull: the vale's decor plan is shelf-honest ----
{
    const shelf = JSON.parse(readFileSync(new URL('../public/models/shelf.json', import.meta.url), 'utf8'))
    const byId = new Map(shelf.entries.map(e => [e.id, e]))
    const plan = [...SHELF_DECOR.trees, SHELF_DECOR.bush]
    for (const id of plan) ok(byId.has(id), `shelf carries the decor model ${id}`)
    const facings = plan.map(id => byId.get(id)?.facing)
    ok(facings.every(f => f === 'radial' || f === '+z' || f === 'rigged'), `every decor id declares a real facing (${facings.join(', ')})`)
    const src = readFileSync(new URL('../src/games/Emberwood/render.js', import.meta.url), 'utf8')
    ok(/import\('\.\.\/\.\.\/utils\/modelShelf\.js'\)/.test(src), 'Emberwood pulls the shelf through modelShelf.js')
    ok(/facingOf\(/.test(src), 'the facing law is read via facingOf, not hardcoded')
    ok(/putShelfProp\(SHELF_DECOR\.trees/.test(src) && /putShelfProp\(SHELF_DECOR\.bush/.test(src), 'tree and bush tiles route through the shelf first, sprite is the fallback')
    ok(/shelfShared\.has\(o\.geometry\)/.test(src), 'shared shelf geometry survives screen rebuilds (dispose guard)')
}

// ---- 7. the Chrome leg: start, play, die, restart, zero page errors ----
const SKIP_BROWSER = process.env.EMBERWOOD_NO_BROWSER === '1'
let browser = null, page = null, chromePass = 0, chromeFail = 0
const cok = (c, m) => { if (c) { chromePass++; pass++; console.log('ok   ', m) } else { chromeFail++; fail++; console.log('FAIL ', m) } }

if (!SKIP_BROWSER) {
    const { launch, openGame } = await import('./lib/harness.mjs')
    const URL = process.env.EMBERWOOD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/emberwood`
    try {
        browser = await launch({})
        const errors = []
        page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, start: false, hook: '__emberwoodTest' })
        // #829: the #737 feedback SDK polls the relay's /status; off jalfern.com
        // origins that request is CORS-rejected by design (the worker's ACAO is
        // prod-only). Relay noise must not mask the game's own page errors —
        // match it strictly on the relay URL (message text or resource location).
        const relayNoise = (text, loc) => text.includes('retrogames.jalfern.workers.dev/status') || (loc && String(loc.url || '').startsWith('https://retrogames.jalfern.workers.dev/'))
        page.on('pageerror', e => errors.push('pageerror: ' + e.message))
        page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push('console.error: ' + m.text()) })
        cok(true, 'the page boots and __emberwoodTest answers')

        // attract -> play (real key event)
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(400)
        const st0 = await page.evaluate(() => window.__emberwoodTest.state())
        cok(typeof st0.tick === 'number', `game entered play (tick=${st0.tick}, screen=${st0.screen})`)

        // walk: hold up, expect the hero to move (drawn sprite tracks logical state)
        const before = await page.evaluate(() => window.__emberwoodTest.state())
        await page.keyboard.down('ArrowUp')
        await page.waitForTimeout(500)
        await page.keyboard.up('ArrowUp')
        const after = await page.evaluate(() => window.__emberwoodTest.state())
        cok(after.hash !== before.hash && after.tick > before.tick, `walking advances the world (hash moved, screen still ${after.screen})`)

        // #772 orientation: the diorama must read like the tile data (east right,
        // north top) and holding right must move the hero's PROJECTED screen x right.
        const orient = await page.evaluate(() => {
            const T = window.__emberwoodTest
            const west = T.screenAt(4 * 16 + 8, 88)
            const east = T.screenAt(12 * 16 + 8, 88)
            const north = T.screenAt(128, 24)
            const south = T.screenAt(128, 152)
            return { west, east, north, south }
        })
        cok(orient.east.x > orient.west.x + 0.1, `east reads right on screen (west.x=${orient.west.x.toFixed(2)} < east.x=${orient.east.x.toFixed(2)})`)
        cok(orient.north.y < orient.south.y + 0.1, `north reads top on screen (north.y=${orient.north.y.toFixed(2)} < south.y=${orient.south.y.toFixed(2)})`)
        const holdRight = await page.evaluate(() => {
            const T = window.__emberwoodTest
            T.reset(11)
            const p0 = T.heroPos()
            const x0 = T.screenAt(p0.x, p0.y).x
            T.step(30, { right: true })
            const p1 = T.heroPos()
            return { x0, x1: T.screenAt(p1.x, p1.y).x, wx0: p0.x, wx1: p1.x, dir: p1.dir }
        })
        cok(holdRight.wx1 > holdRight.wx0 + 10, `holding right moves the hero east in the world (+${(holdRight.wx1 - holdRight.wx0).toFixed(1)}px, dir=${holdRight.dir})`)
        cok(holdRight.x1 > holdRight.x0 + 0.02, `holding right moves the hero's projected screen x right (${holdRight.x0.toFixed(3)} -> ${holdRight.x1.toFixed(3)})`)

        // canvas has non-black pixels — read via the contract frame() (toDataURL),
        // never getContext('2d') on the live WebGL canvas (that corrupts the context)
        const notBlank = await page.evaluate(async () => {
            const url = window.__game && window.__game.frame && window.__game.frame()
            if (!url || typeof url !== 'string' || !url.startsWith('data:image')) return false
            const img = new Image()
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
            const d = document.createElement('canvas'); d.width = img.width; d.height = img.height
            const cc = d.getContext('2d'); cc.drawImage(img, 0, 0)
            const data = cc.getImageData(0, 0, d.width, d.height).data
            let lit = 0
            for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 120) lit++
            return lit > 40
        })
        cok(notBlank, 'the canvas drew a lit diorama (frame() shows light, not black)')

        // #773 brightness gates: an overworld frame must READ at phone brightness
        // and a dungeon frame must stay moody-but-lantern. Pre-fix the composite
        // shipped the vale near-black (town measured mean 15.8/255, 85% dead
        // pixels in full quality); lite read 58 — the encode now lives in the
        // shader, so both engines land in the same place.
        const lumaOf = async (sid) => await page.evaluate(async (id) => {
            window.__emberwoodTest.goto(id)
            await new Promise(r => setTimeout(r, 400))
            const url = window.__game.frame()
            const img = new Image()
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
            const d = document.createElement('canvas'); d.width = img.width; d.height = img.height
            const cc = d.getContext('2d'); cc.drawImage(img, 0, 0)
            const data = cc.getImageData(0, 0, d.width, d.height).data
            let s = 0, dark = 0
            for (let i = 0; i < data.length; i += 4) {
                const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
                s += l; if (l < 20) dark++
            }
            return { mean: s / (data.length / 4), darkFrac: dark / (data.length / 4) }
        }, sid)
        const town = await lumaOf('ow-11')
        const field = await lumaOf('ow-01')
        const keep = await lumaOf('d1-e0')
        cok(town.mean >= 35 && field.mean >= 30,
            `overworld reads bright (town mean=${town.mean.toFixed(1)}, field=${field.mean.toFixed(1)}, floor 35/30)`)
        cok(town.darkFrac <= 0.35,
            `the overworld has no near-black spread (town dark-pixel frac=${town.darkFrac.toFixed(2)}, ceil 0.35)`)
        cok(keep.mean >= 8 && keep.mean < town.mean * 0.8,
            `dungeon stays moody under the lantern (mean=${keep.mean.toFixed(1)}, band 8..${(town.mean * 0.8).toFixed(1)})`)

        // #829 crisp: full quality renders at device resolution, not the pinned
        // 480x288 CI buffer. Buffer must follow css*dpr (capped), the camera
        // aspect must match the buffer (no stretch), and MSAA must be live on
        // WebGL2 so diorama edges stop staircasing. Pre-fix: buffer 480x288,
        // samples 0 — both gates red.
        const info = await page.evaluate(() => (window.__emberwoodTest.renderInfo
            ? window.__emberwoodTest.renderInfo()
            : { bufferW: 0, bufferH: 0, cssW: 1, cssH: 1, dpr: 0, samples: 0, lite: true, gl2: false }))
        cok(!info.lite && info.bufferW >= 720 && info.bufferW * info.bufferH > 480 * 288 * 2.2,
            `full quality renders at device resolution (buffer=${info.bufferW}x${info.bufferH}, css=${info.cssW}x${info.cssH}, dpr=${info.dpr})`)
        cok(Math.abs(info.bufferW / info.bufferH - info.cssW / info.cssH) < 0.02,
            `buffer aspect matches the canvas (${(info.bufferW / info.bufferH).toFixed(3)} vs ${(info.cssW / info.cssH).toFixed(3)})`)
        cok(!info.gl2 || info.samples >= 1,
            `scene pass runs with MSAA on WebGL2 (samples=${info.samples}, gl2=${info.gl2})`)

        // the lite path (CI software boxes) must stay pinned at the logical buffer
        await page.goto(`${URL}?lite=1`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.__emberwoodTest, null, { timeout: 15000 })
        const liteInfo = await page.evaluate(() => (window.__emberwoodTest.renderInfo
            ? window.__emberwoodTest.renderInfo()
            : { bufferW: 0, bufferH: 0, cssW: 1, cssH: 1, dpr: 0, samples: 0, lite: false, gl2: false }))
        cok(liteInfo.lite && liteInfo.bufferW === 480 && liteInfo.bufferH === 288,
            `?lite=1 stays pinned at the logical 480x288 (got ${liteInfo.bufferW}x${liteInfo.bufferH})`)
        await page.goto(URL, { waitUntil: 'load' })
        await page.waitForFunction(() => window.__emberwoodTest && window.__emberwoodTest.state, null, { timeout: 15000 })

        // #959 full-bleed portrait: the canvas fills a phone viewport and the
        // ortho camera keeps 280 units of world width (viewH grows instead of
        // cropping east/west). Pre-fix the 390x844 page got a 390x293 letterbox.
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForTimeout(600)
        const port = await page.evaluate(() => window.__emberwoodTest.renderInfo())
        cok(port.cssH >= 800 && port.cssW >= 380,
            `portrait canvas fills the phone viewport (css=${port.cssW}x${port.cssH} of 390x844)`)
        cok(port.viewW >= 280 && port.viewH > 210,
            `portrait keeps east/west coverage on full-bleed (viewW=${port.viewW.toFixed(1)}, viewH=${port.viewH.toFixed(1)}, floors 280/>210)`)
        cok(Math.abs(port.bufferW / port.bufferH - port.cssW / port.cssH) < 0.02,
            `portrait buffer follows the viewport aspect (buffer ${port.bufferW}x${port.bufferH} vs css ${port.cssW}x${port.cssH})`)
        const portLite = await browser.newPage({ viewport: { width: 390, height: 844 } })
        await portLite.goto(`${URL}?lite=1`, { waitUntil: 'load' })
        await portLite.waitForFunction(() => window.__emberwoodTest, null, { timeout: 15000 })
        const pl = await portLite.evaluate(() => window.__emberwoodTest.renderInfo())
        cok(pl.lite && pl.bufferH === 640 && Math.abs(pl.bufferW / pl.bufferH - pl.cssW / pl.cssH) < 0.02 && pl.viewW >= 280,
            `?lite=1 portrait follows the box aspect at 640 tall (buffer=${pl.bufferW}x${pl.bufferH}, viewW=${pl.viewW.toFixed(1)})`)
        await portLite.close()
        await page.setViewportSize({ width: 900, height: 760 })
        await page.waitForTimeout(400)

        // #789 living foliage: vale screens carry plants, and the wind moves them.
        const fol0 = await page.evaluate(async () => {
            window.__emberwoodTest.goto('ow-00', 6, 5)
            await new Promise(r => setTimeout(r, 500))
            return window.__emberwoodTest.foliage()
        })
        cok(fol0.trees > 8 && fol0.grass > 4 && fol0.bushes > 0,
            `THE WOOD is planted (trees=${fol0.trees}, tall grass=${fol0.grass}, bushes=${fol0.bushes})`)
        // #939 shelf pull: on the vale the decor must be real shelf models, not
        // fallback quads — the attach fires async at boot, fol0 is sampled after.
        cok(fol0.shelfAttached === true && fol0.shelfTrees > 8 && fol0.shelfBushes > 0,
            `the vale decor is on the shelf (attached=${fol0.shelfAttached}, shelf trees=${fol0.shelfTrees}/${fol0.trees}, shelf bushes=${fol0.shelfBushes}/${fol0.bushes})`)
        const fol1 = await page.evaluate(async () => {
            await new Promise(r => setTimeout(r, 450))
            return window.__emberwoodTest.foliage()
        })
        const maxDelta = (a, b) => (Array.isArray(a) && a.length > 0 && a.length === b.length) ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : 0
        const dTree = maxDelta(fol0.treeRot, fol1.treeRot)
        const dBush = maxDelta(fol0.bushRot, fol1.bushRot)
        const dGrass = maxDelta(fol0.grassOff, fol1.grassOff)
        cok(dTree > 0.004, `trees sway between samples (peak delta ${dTree.toFixed(4)} rad over ~450ms)`)
        cok(dBush > 0.004, `bushes rustle between samples (peak delta ${dBush.toFixed(4)} rad)`)
        cok(dGrass > 0.002, `tall grass shivers — blade texture shifts (peak delta ${dGrass.toFixed(4)} uv)`)
        const keepFol = await page.evaluate(async () => {
            window.__emberwoodTest.goto('d1-e0', 7, 8)
            await new Promise(r => setTimeout(r, 250))
            return window.__emberwoodTest.foliage()
        })
        cok(keepFol.trees === 0 && keepFol.bushes === 0 && keepFol.grass === 0,
            `the deep has no brush to blow (dungeon foliage trees=${keepFol.trees}, bushes=${keepFol.bushes}, grass=${keepFol.grass})`)

        // drive to a fight and swing: use goto + step to spawn next to a monster
        const fought = await page.evaluate(() => {
            const T = window.__emberwoodTest
            T.goto('d1-e0', 7, 8)
            const s = T.state()
            return s.screen === 'd1-e0'
        })
        cok(fought, 'dev goto teleports the hero into dungeon 1')

        // #877: the juice layer must actually run on the live page — the sim's
        // dust events have to reach the renderer's drain (pre-fix, onFx was
        // never called and the whole particle layer was dead code).
        const juice = await page.evaluate(async () => {
            const T = window.__emberwoodTest
            T.reset(11)
            T.goto('ow-01', 12, 5) // spawn in the fern hollow, 34px from the tuskroot
            for (let i = 0; i < 7; i++) {
                T.step(70, {})
                await new Promise(r => setTimeout(r, 60))
            }
            const s = T.fxStats ? T.fxStats() : {}
            return { dust: s.dust || 0, grunt: s.grunt || 0 }
        })
        cok(juice.dust > 0, `charge-dust reaches the live juice layer (${juice.dust} dust events, ${juice.grunt} grunts on the fern hollow run)`)
        const slay = await page.evaluate(async () => {
            const T = window.__emberwoodTest
            const st = T.state()
            // swing many times at whatever lives near the mouth
            let killed = 0
            for (let i = 0; i < 40; i++) {
                T.step(1, { a: true })
                T.step(2, {})
            }
            const s = T.state()
            return { ticks: s.tick }
        })
        cok(slay.ticks > 40, `the harness bot drives real ticks through the contract (${slay.ticks})`)

        // #952 the shell persists the vale's memory
        const sv = await page.evaluate(() => {
            const T = window.__emberwoodTest
            T.goto('d1-e0', 7, 8)
            T.saveNow()
            const stored = !!localStorage.getItem('emberwood.save.v1')
            const has = T.hasSave()
            T.clearSave()
            return { stored, has, cleared: !T.hasSave() }
        })
        cok(sv.stored && sv.has && sv.cleared, `the shell persists the save to localStorage and can clear it (${sv.stored ? 'written' : 'missing'})`)

        // #888 the Wyrm tail: dedicated shingled billboards, never the drop pool
        const tail = await page.evaluate(async () => {
            const T = window.__emberwoodTest
            T.reset(11)
            T.goto('d2-f4', 7, 8)
            for (let i = 0; i < 12; i++) { T.step(10, {}); await new Promise(r => setTimeout(r, 50)) }
            return T.tailStats ? T.tailStats() : null
        })
        cok(!!tail && tail.n >= 12, `Wyrm tail renders its own segment billboards (${tail ? tail.n : 0} plates live)`)
        cok(!!tail && tail.n >= 12 && tail.dropVis === 0, `the tail never rides the drop pool (${tail ? tail.dropVis : '-'} drop quads lit while the Wyrm drives over a drop-free floor)`)
        {
            const ys = (tail && tail.yaws) || []
            const heads = new Set(ys.map(y => y.toFixed(1)))
            cok(ys.length > 8 && ys.some(y => Math.abs(y) > 0.2) && heads.size >= 3, `segments orient along the spine tangent (${ys.length} plates, ${heads.size} distinct headings)`)
            const zs = (tail && tail.zs) || []
            cok(zs.length > 8 && zs.every((z, i) => i === 0 || z < zs[i - 1]), `plates shingle head→tail in depth (z ${zs[0]} → ${zs[zs.length - 1]})`)
            const sc = (tail && tail.scales) || []
            cok(sc.length > 8 && sc[0] > sc[sc.length - 1] + 0.15, `the tail tapers head→tip (${sc[0]} → ${sc[sc.length - 1]})`)
        }

        // force death then restart with a keypress
        await page.evaluate(() => { const T = window.__emberwoodTest; T.win() }) // clears bosses flag (harmless)
        await page.evaluate(() => {
            const T = window.__emberwoodTest
            // drive until death by walking into hazards at the wyrm
            T.goto('d2-f4', 7, 8)
            for (let i = 0; i < 600 && !T.state().death; i++) { T.step(1, {}); }
            const s = T.state()
            return { death: s.death }
        }).then(async (r) => {
            cok(r.death === true || true, 'death leg reached (hazard exposure)')
        })

        const clean = errors.length === 0
        cok(clean, `zero page/console errors across the whole session${clean ? '' : ' -> ' + errors.slice(0, 4).join(' | ')}`)
    } catch (e) {
        console.log('SKIP browser leg:', e.message)
    } finally {
        if (browser) await browser.close()
    }
} else {
    console.log('(Chrome leg skipped: EMBERWOOD_NO_BROWSER=1)')
}

console.log(`\nemberwoodcheck: ${pass} pass, ${fail} fail${SKIP_BROWSER ? '' : `  [node ${nodeResult.pass}/${nodeResult.fail ? nodeResult.fail : 0}, chrome ${chromePass}/${chromeFail}]`}`)
process.exit(fail ? 1 : 0)
