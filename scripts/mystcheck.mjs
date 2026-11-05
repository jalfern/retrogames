// mystcheck — proves MYST boots as pure logic, its island graph is sound,
// every gate really gates, all eight pages are collectible, both bad endings
// trap you, and the white page brings Atrus home. Node-only, no browser.

import { NODES, AGE_LIST } from '../src/games/Myst/nodes.js'
import { freshState, dispatch, solveScript, runSolver, isWin, STONE_SIZES, SUN_MOON, RIDE, STAR_SHAPES, WHEEL_SPOKES, WHEEL_BITE, WHEEL_RINGS, WHEEL_NOTCH, WHEEL_POINTS, spectatorViews, portraitViews } from '../src/games/Myst/state.js'
import { drawVision, drawPortrait, PORTRAIT_TEAR0 } from '../src/games/Myst/visions.js'
import { LINK_TICKS, linkingBook, linkEnvelope, linkTint, linkStars, drawLink, linkAccel, linkSeam, LINK_PALETTE, TRAP_LINK } from '../src/games/Myst/link.js'
import { deriveCodes, safeWords, seedFromSearch, notebookSeed, storeSeed, loadSeed, NUMBER_WORDS } from '../src/games/Myst/codes.js'
import { MESSAGES, PRESS } from '../src/games/Myst/attract.js'
import { plan, TONES, STONE_TONES, THAW_TONES, singTicks, swellCues, thunderCues, ambCues, SKY_TUNE } from '../src/games/Myst/soundplan.js'
import { domeHeight, SEL_CRESTS, DOME, AGE_GROUND, ISLAND_GROUND, ageHeight, groundHeight } from '../src/games/Myst/terrain.js'
import { SEA_VIEWS, seaSwell, foamAt, foamLine, FOAM_BAND, FOAM_LAG, foamScale, SEA_EXTENT, glintFor, SEA_DEEP, DEEP_DARK, MIRROR_LIFT, deepTint, FAR_GAIN, farSwell, cloudMirror, cloudTint, SKY_CLOUD, MIRROR_RAMP, islesFor, ISL_LIMIT, landmarksFor, LANDMARK_LAW } from '../src/games/Myst/sea.js'
import { STORM, STORM_VIEWS, stormView, stormFlash, skyGain, seaGain } from '../src/games/Myst/storm.js'
import { GEARS, GEAR_KEYS, GEAR_SLOTS, SEAT_TONES, seatWeight, gearHeld, gearSeated, seatedCount, galleryOpen, gearRows } from '../src/games/Myst/gears.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { plant, pull } from './lib/mutateguard.mjs'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok ${name}`) } else { fail++; console.error(`  FAIL ${name}`) } }

console.log('MYST — graph')
ok(Object.keys(NODES).length === 28, '28 nodes: island, tower, cave, cabin, rocket silo, four Ages, walkable Mechanical (4), walkable Selenitic (4), walkable Channelwood (3), walkable Stoneship (2)')
ok(NODES.dock && NODES.dock.spots.some((s) => s.to === 'cliffPath'), 'the dock connects up the path')
for (const [id, n] of Object.entries(NODES)) {
  for (const s of n.spots) {
    if (s.to) ok(!!NODES[s.to], `${id}/${s.id} leads to a real node (${s.to})`)
    if (s.act) ok(true, `${id}/${s.id} acts (${s.act})`)
  }
}
// every node reachable from dock via pure moves/clicks (BFS)
const seen = new Set(['dock'])
const q = ['dock']
while (q.length) {
  const id = q.shift()
  for (const s of NODES[id].spots) {
    if (s.to && !seen.has(s.to)) { seen.add(s.to); q.push(s.to) }
  }
}
const linkAges = ['selenitic', 'mechanical', 'stoneship']
ok(['dock','cliffPath','beach','landing','stairTop','library','cave','towerBase','towerTop','cabin','channelwood'].every((n) => seen.has(n)), 'every walking node reachable from the dock')
ok(linkAges.every((a) => !seen.has(a)), 'the three link-Ages are sealed behind books/puzzles, not walking')
const mechSub = ['mechWalk', 'mechCar', 'mechTop', 'mechRoom']
ok(mechSub.every((n) => !seen.has(n)), 'the Mechanical tower lives inside its Age, not on the island path')
{
  const seenA = new Set(['mechanical'])
  const qa = ['mechanical']
  while (qa.length) { const id = qa.shift(); for (const sp of NODES[id].spots) { const t = sp.to ? [sp.to] : sp.visits ? [].concat(sp.visits) : []; for (const v of t) if (!seenA.has(v)) { seenA.add(v); qa.push(v) } } }
  ok(mechSub.every((n) => seenA.has(n)), 'Mechanical is walkable end to end once you are linked in')
}
const chanSub = ['chanChannels', 'chanWheel', 'chanObs']
ok(['channelwood', ...chanSub].every((n) => seen.has(n)), 'Channelwood is walkable end to end once the wood door stands open')
ok(NODES.channelwood.spots.some((s) => s.to === 'cave' && s.need === 'wheelOpen'), 'the landing panel home is keyed to the wheel — Channelwood keeps its own way out, as in 1993')
ok(NODES.chanWheel.spots.some((s) => s.id === 'hubBook' && s.to === 'cave' && s.need === 'wheelOpen'), 'the hub book is the Age\u2019s way home, sealed until the stars agree')
const stoneSub = ['stoneDeck', 'stoneObservatory']
ok(stoneSub.every((n) => !seen.has(n)), "the Stoneship ship and ridge live inside the Age, not on the island path")
{
  const seenS = new Set(['stoneship'])
  const qs = ['stoneship']
  while (qs.length) { const id = qs.shift(); for (const sp of NODES[id].spots) if (sp.to && !seenS.has(sp.to)) { seenS.add(sp.to); qs.push(sp.to) } }
  ok(stoneSub.every((n) => seenS.has(n)), 'Stoneship is walkable end to end once the safe book opens')
}
ok(NODES.stoneship.spots.every((s) => !(s.to === 'stoneObservatory' || s.act === 'observatory')), 'the observatory is no longer a single fixed view from the pier')
ok(NODES.stoneObservatory.spots.some((s) => s.act === 'observatory'), 'the observatory note now lives up on the ridge')
const ageRet = AGE_LIST.every((a) => NODES[a].spots.some((s) => s.to))
ok(ageRet, 'every Age has a way home')

console.log('MYST — gates hold')
{ // tower door locked until the palm illusion is touched
  let s = freshState()
  s = { ...s, node: 'stairTop' }
  let r = dispatch(s, { t: 'move', id: 'towerDoor' })
  ok(r.events.includes('blocked') && r.state.node === 'stairTop', 'clock tower is locked without the lever')
  let s2 = { ...freshState(), node: 'landing' }
  s2 = dispatch(s2, { t: 'click', id: 'palmIllusion' }).state
  ok(!!s2.flags.towerLever, 'the palm illusion reveals the hidden lever')
  s2 = { ...s2, node: 'stairTop' }
  r = dispatch(s2, { t: 'move', id: 'towerDoor' })
  ok(r.state.node === 'towerBase', 'with the lever the tower door opens')
}
{ // wood door needs the star panel; wrong stars do not open it
  let s = { ...freshState(4101), node: 'cave' }
  ok(dispatch(s, { t: 'move', id: 'channelwoodDoor' }).events.includes('blocked'), 'wood door locked before the stars')
  s = dispatch(s, { t: 'click', id: 'starPanel' }).state
  let wrong = s.codes.star.map((v) => (v % 4) + 1)
  for (let i = 0; i < 4; i++) s = dispatch(s, { t: 'dial', pad: 'star', i, v: wrong[i] }).state
  ok(!s.flags.starPanel, 'star order off by one everywhere does not open the door')
  let s2 = { ...freshState(4101), node: 'cave' }
  s2 = dispatch(s2, { t: 'click', id: 'starPanel' }).state
  for (let i = 0; i < 4; i++) s2 = dispatch(s2, { t: 'dial', pad: 'star', i, v: s2.codes.star[i] }).state
  ok(!!s2.flags.starPanel, `seed 4101's dome stars (${s2.codes.star.join('-')}) open the wood door`)
}
{ // CHANNELWOOD stage 3: the flood lever drowns the channels and floats the raft
  let s = { ...freshState(), node: 'chanChannels' }
  ok(dispatch(s, { t: 'move', id: 'boardRaft' }).events.includes('blocked'), 'the float sits mud-bound until the sluice closes')
  s = dispatch(s, { t: 'click', id: 'chanFlood' }).state
  ok(!!s.flags.chanFlood, 'the flood lever shuts the sluice')
  s = dispatch(s, { t: 'move', id: 'boardRaft' }).state
  ok(s.node === 'chanWheel', 'with the channels filled the float lifts you to the star terrace')
  s = dispatch(s, { t: 'click', id: 'pageChannelwoodRed' }).state
  ok(!!s.flags.pageRed_channelwood, 'the red page waits in the wheel shelter')
  s = dispatch(s, { t: 'move', id: 'retChanWheel' }).state
  s = dispatch(s, { t: 'click', id: 'chanFlood' }).state
  ok(!s.flags.chanFlood, 'the lever drains the channels again')
  let c = { ...freshState(), node: 'chanChannels' }
  c = dispatch(c, { t: 'click', id: 'pageChannelwoodBlue' }).state
  ok(!!c.flags.pageBlue_channelwood, 'the blue page lies on the wood bridge')
  // #1014 — the wheel is this Age's lock: both ways home refuse a stranger
  let u = { ...freshState(90210), node: 'chanWheel' }
  ok(dispatch(u, { t: 'move', id: 'hubBook' }).events.includes('blocked'), 'the hub cover will not budge shut')
  u = dispatch(u, { t: 'click', id: 'starWheel' }).state
  ok(u.panelOpen === 'wheel', 'the wheel opens its three rings to the hand')
  const wr = u.codes.wheel.map((v) => (v + 1) % WHEEL_NOTCH)
  for (let i = 0; i < WHEEL_RINGS; i++) u = dispatch(u, { t: 'dial', pad: 'wheel', i, v: wr[i] }).state
  ok(!u.flags.wheelOpen, `an alignment off by one notch everywhere (${wr.join('-')}) keeps the hub shut`)
  ok(dispatch(u, { t: 'move', id: 'hubBook' }).events.includes('blocked'), 'wrong stars, shut hub')
  u = dispatch(u, { t: 'click', id: 'closePanel' }).state
  ok(dispatch({ ...u, node: 'channelwood' }, { t: 'move', id: 'retChannelwood' }).events.includes('blocked'), 'the landing panel keeps its counsel until the wheel turns true')
  let o = { ...freshState(90210), node: 'chanWheel' }
  o = dispatch(o, { t: 'click', id: 'starWheel' }).state
  for (let i = 0; i < WHEEL_RINGS; i++) o = dispatch(o, { t: 'dial', pad: 'wheel', i, v: o.codes.wheel[i] }).state
  ok(!!o.flags.wheelOpen && o.panelOpen === null, `seed 90210's stars (${o.codes.wheel.map((v) => WHEEL_POINTS[v]).join('-')} points) grind the hub open and close the panel`)
  const again = dispatch(o, { t: 'dial', pad: 'wheel', i: 0, v: o.codes.wheel[0] })
  ok(!again.events.includes('wheelOpen'), 'the hub opens once, and keeps its word')
  const home = dispatch(o, { t: 'move', id: 'hubBook' })
  ok(home.state.node === 'cave' && home.events.includes('travel'), 'the hub book carries you home to the cave')
  { // one notch per click, wrapping; the ring says its points at the mark
    let d = { ...freshState(90210), node: 'chanWheel' }
    d = dispatch(d, { t: 'click', id: 'starWheel' }).state
    d = dispatch(d, { t: 'dial', pad: 'wheel', i: 1, v: WHEEL_NOTCH - 1 }).state
    ok(d.wheelDial[1] === WHEEL_NOTCH - 1, 'a ring can be turned to its last notch')
    const st = dispatch(d, { t: 'dial', pad: 'wheel', i: 1 })
    ok(st.state.wheelDial[1] === 0 && st.events.includes('wheelTick:1'), 'a click past the last notch wraps to the first, and the ring answers with its own tick')
    ok(/middle ring clicks over/.test(st.state.message), 'the ring reports what stands at the mark', st.state.message)
  }
}

console.log('MYST — the star-wheel bites (the Channelwood sub-puzzle, #1017)')
{
  let s = { ...freshState(), node: 'chanWheel' }
  ok(s.wheel === 0, 'the wheel rests at detent zero')
  const r0 = dispatch(s, { t: 'click', id: 'gearChan' })
  ok(r0.events.includes('blocked') && !r0.state.flags.gearChannelwood, 'the shelter gear stays locked before the bite')
  const detents = []
  const biteAt = []
  for (let i = 0; i < WHEEL_SPOKES; i++) {
    const r = dispatch(s, { t: 'click', id: 'wheelTurn' })
    s = r.state
    detents.push(s.wheel)
    if (r.events.includes('wheelBite')) biteAt.push(i + 1)
  }
  ok(detents.join(',') === '1,2,3,4,0', 'the wheel detents one fifth per turn and wraps through five spokes')
  ok(biteAt.length === 1 && biteAt[0] === WHEEL_BITE, `the bite lands exactly at detent ${WHEEL_BITE}, nowhere else`)
  ok(!!s.flags.wheelBite, 'once bitten, the falls hold the axle')
  const rGear = dispatch(s, { t: 'click', id: 'gearChan' })
  ok(!!rGear.state.flags.gearChannelwood && rGear.events.includes('gearTake'), 'the opened shelter yields its brass gear')
  const rTwice = dispatch(rGear.state, { t: 'click', id: 'gearChan' })
  ok(rTwice.events.length === 0, 'the empty shelter gives nothing twice')
  let a = { ...freshState(), node: 'chanWheel' }
  let b = { ...freshState(), node: 'chanWheel' }
  for (let i = 0; i < 4; i++) { a = dispatch(a, { t: 'click', id: 'wheelTurn' }).state; b = dispatch(b, { t: 'click', id: 'wheelTurn' }).state }
  ok(a.wheel === b.wheel && a.flags.wheelBite === b.flags.wheelBite, 'the wheel is deterministic across runs')
  ok(plan('wheel').length > 0 && plan('wheelBite').length > 0, 'the wheel grind and the bite each have their own sound')
  ok(JSON.stringify(plan('wheelBite')) !== JSON.stringify(plan('flood')), 'the bite is not just the flood lever sounding again')
  const nd = NODES.chanWheel.spots.find((x) => x.id === 'wheelTurn')
  ok(nd && nd.act === 'wheelTurn', 'the terrace star is a handle you can turn, not a poster')
  const gnd = NODES.chanWheel.spots.find((x) => x.id === 'gearChan')
  ok(gnd && gnd.need === 'wheelBite' && gnd.gone === 'gearChannelwood', 'the gear spot is gated by the bite and emptied by the take')
}
{ // STONESHIP walk: the pier → the ship's deck → the ridge observatory, on foot, free
  let s = { ...freshState(), node: 'stoneship' }
  s = dispatch(s, { t: 'move', id: 'toShipDeck' }).state
  ok(s.node === 'stoneDeck', 'you climb aboard the becalmed ship')
  ok(dispatch(s, { t: 'click', id: 'lookShipRig' }).events.includes('look'), "the rigging is a lookable thing on the deck")
  s = dispatch(s, { t: 'move', id: 'toObservatory' }).state
  ok(s.node === 'stoneObservatory', 'the rock stair runs from the stern up to the dome')
  ok(dispatch(s, { t: 'click', id: 'observatory' }).state.flags.obsNote, "the observatory hands over Atrus's note")
  s = dispatch(s, { t: 'move', id: 'retStoneObs' }).state
  ok(s.node === 'stoneDeck', 'the stair brings you back to the deck')
  s = dispatch(s, { t: 'move', id: 'retStoneDeck' }).state
  ok(s.node === 'stoneship', 'back down at the pier, where the two pages wait')
}
{ // fireplace needs matches; safe needs the three numbers
  let s = { ...freshState(), node: 'library' }
  ok(dispatch(s, { t: 'click', id: 'fireplace' }).events.includes('blocked'), 'fireplace cold without matches')
  s = { ...s, flags: { ...s.flags, matchbook: true } }
  s = dispatch(s, { t: 'click', id: 'fireplace' }).state
  ok(!!s.flags.link_selenitic, 'burning the wooden book reveals the Selenitic link')
  s = dispatch(s, { t: 'click', id: 'fireplace' }).state
  ok(s.node === 'selenitic', 'the fireplace links to SELENITIC')
  let c = { ...freshState(70707), node: 'cabin' }
  const safeCode = c.codes.safe
  c = dispatch(c, { t: 'click', id: 'safe' }).state
  ok(c.panelOpen === 'safe', 'the safe opens its dials')
  const nope = String((Number(safeCode[0]) % 9) + 1) + safeCode.slice(1)
  for (let i = 0; i < 3; i++) c = dispatch(c, { t: 'dial', pad: 'safe', i, v: Number(nope[i]) }).state
  ok(!c.flags.safeOpen, 'one digit off never opens the safe')
  for (let i = 0; i < 3; i++) c = dispatch(c, { t: 'dial', pad: 'safe', i, v: Number(safeCode[i]) }).state
  ok(!!c.flags.safeOpen && !!c.flags.link_stoneship, `seed 70707's safe code ${safeCode} opens the sea-world book`)
}
{ // mechanical red page sealed behind the switch linkage (the gear on the gantry)
  let s = { ...freshState(), node: 'mechTop' }
  ok(dispatch(s, { t: 'click', id: 'pageMechanicalRed' }).events.includes('blocked'), 'gear-sealed alcove holds its page')
  s = dispatch(s, { t: 'toggle', i: 0 }).state
  s = dispatch(s, { t: 'toggle', i: 3 }).state
  ok(!!s.flags.switchPanel, 'levers 1 and 4 light the whole chain')
  s = dispatch(s, { t: 'click', id: 'pageMechanicalRed' }).state
  ok(!!s.flags.pageRed_mechanical, 'the alcove opens and the page comes free')
}
{ // the walkable Mechanical: cage interlock, auto-shut, plates and latch
  let s = { ...freshState(), node: 'mechWalk' }
  ok(dispatch(s, { t: 'move', id: 'boardCar' }).events.includes('blocked'), 'the cage hangs out of reach until called')
  s = dispatch(s, { t: 'click', id: 'mechCall' }).state
  ok(!!s.flags.mechCarDown, 'the call lever brings the cage down to the deck')
  s = dispatch(s, { t: 'move', id: 'boardCar' }).state
  ok(s.node === 'mechCar', 'with the cage called you can step in')
  s = dispatch(s, { t: 'click', id: 'cageRaise' }).state
  ok(s.node === 'mechTop' && !s.flags.mechCarDown, 'the cage tops out on the gantry')
  ok(dispatch(s, { t: 'click', id: 'mechDoorBtn' }).events.includes('blocked'), 'the cage jams the door slot — the release is useless at the landing')
  s = dispatch(s, { t: 'click', id: 'mechSendDown' }).state
  ok(!!s.flags.mechCarDown, 'the send-down lever clears the door slot')
  s = dispatch(s, { t: 'click', id: 'mechDoorBtn' }).state
  ok(!!s.flags.mechDoorOpen, 'with the slot clear the door release opens the steel door')
  const e = dispatch(s, { t: 'move', id: 'enterRoom' })
  s = e.state
  ok(s.node === 'mechRoom' && !s.flags.mechDoorOpen && e.events.includes('clank'), 'the door bangs shut behind you')
  ok(dispatch(s, { t: 'move', id: 'exitRoom' }).events.includes('blocked'), 'you are shut in until the plates govern the door')
  s = dispatch(s, { t: 'click', id: 'stepPlateD' }).state
  ok(!!s.flags.mechDoorOpen, 'standing on the door plate grinds the door open')
  ok(dispatch(s, { t: 'click', id: 'stepPlateD' }).state.flags.mechDoorOpen === false, 'step off the un-latched plate and the door closes again')
  s = { ...s, flags: { ...s.flags, mechPlateD: true, mechDoorOpen: true } }
  s = dispatch(s, { t: 'click', id: 'mechLatch' }).state
  ok(!!s.flags.mechLatchD, 'the latch bites on the pressed door plate')
  s = dispatch(s, { t: 'click', id: 'stepPlateD' }).state
  ok(!!s.flags.mechDoorOpen, 'off the plate now — the latch holds the door open for you')
  s = dispatch(s, { t: 'click', id: 'stepPlateE' }).state
  s = dispatch(s, { t: 'click', id: 'mechLatch' }).state
  ok(!!s.flags.mechLatchE, 'the latch catches the shaft plate too')
  s = dispatch(s, { t: 'click', id: 'stepPlateE' }).state
  ok(!s.flags.mechCarDown, 'the cage stays called off the plate — latched')
  s = dispatch(s, { t: 'move', id: 'exitRoom' }).state
  ok(s.node === 'mechTop', 'and the latched door lets you walk out')
  s = dispatch(s, { t: 'click', id: 'cageBoardTop' }).state
  ok(s.node === 'mechCar', 'the latched cage waits at the gantry so you can leave')
  s = dispatch(s, { t: 'click', id: 'cageDescend' }).state
  s = dispatch(s, { t: 'click', id: 'cageOut' }).state
  ok(s.node === 'mechanical', 'the cage sets you back down at the landing')
}
{ // the latch lever only holds iron that is already down
  let s = { ...freshState(), node: 'mechRoom' }
  ok(dispatch(s, { t: 'click', id: 'mechLatch' }).events.includes('blocked'), 'the latch finds nothing to hold')
}
{ // the SPECTATOR shows the other Ages
  let s = { ...freshState(), node: 'mechRoom' }
  const r = dispatch(s, { t: 'click', id: 'spectator' })
  ok(r.state.panelOpen === 'spectator' && r.events.includes('spectator'), 'the sphere opens its panel of other ages')
  ok(!!r.state.flags.spectatorSeen && /green rings/.test(r.state.message), 'three lights swim inside the glass')
}
{ // #1027 — the thaw tone: each lens sings its colour note the first time it
  // clears (per save); a returning glance is silent, and sealed lenses never sing.
  let s = { ...freshState(), node: 'mechRoom' }
  s.flags.link_mechanical = true
  s.flags.link_selenitic = true
  const r1 = dispatch(s, { t: 'click', id: 'spectator' })
  ok(r1.events.includes('thaw:mechanical') && r1.events.includes('thaw:selenitic'), 'each newly-thawed lens sings its colour note the first time')
  ok(!r1.events.includes('thaw:stoneship') && !r1.events.includes('thaw:channelwood'), 'a sealed lens never sings')
  const r2 = dispatch(r1.state, { t: 'click', id: 'spectator' })
  ok(!r2.events.includes('thaw:mechanical') && !r2.events.includes('thaw:selenitic'), 'the thaw note is first-time only — a returning glance is silent')
}
console.log('MYST — the SPECTATOR lenses are live age-visions (#1024)')
{
  let s = freshState()
  ok(spectatorViews(s).every((v) => !v.unlocked), 'before any book is linked, every lens is sealed')
  ok(JSON.stringify(spectatorViews(s)) === JSON.stringify(spectatorViews(s)), 'spectatorViews is pure — same state, same lenses')
  s.flags.link_mechanical = true
  ok(spectatorViews(s).map((v) => `${v.age}${v.unlocked ? 'L' : '-'}`).join(',') === 'selenitic-,stoneship-,mechanicalL,channelwood-', 'a linked age thaws exactly its own lens')
  const openAt = {}
  for (const a of solveScript(s.codes)) {
    s = dispatch(s, a).state
    spectatorViews(s).forEach((v) => { if (v.unlocked && openAt[v.age] === undefined) openAt[v.age] = s.time })
  }
  ok(Object.keys(openAt).length === 4, 'the winning route thaws all four lenses')
  ok(openAt.mechanical <= openAt.selenitic && openAt.mechanical <= openAt.stoneship && openAt.mechanical <= openAt.channelwood, 'Mechanical — the age the sphere stands in — clears first')
}
{ // the lens painter: deterministic paint, every scene answers to the clock
  const OPS = ['save', 'restore', 'clip', 'beginPath', 'fill', 'stroke', 'closePath', 'fillRect', 'clearRect', 'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'translate', 'rotate']
  function recCtx() {
    const ops = []
    const num = (x) => (typeof x === 'number' ? x.toFixed(3) : String(x))
    const grad = { addColorStop: (...a) => ops.push('stop:' + a.map(num).join(',')) }
    const ctx = { ops }
    for (const m of OPS) ctx[m] = (...a) => ops.push(m + ':' + a.map(num).join(','))
    ctx.createLinearGradient = (...a) => { ops.push('lin:' + a.map(num).join(',')); return grad }
    ctx.createRadialGradient = (...a) => { ops.push('rad:' + a.map(num).join(',')); return grad }
    for (const p of ['fillStyle', 'strokeStyle']) {
      let v = ''
      Object.defineProperty(ctx, p, { get: () => v, set: (x) => { v = x; ops.push(p + ':' + x) } })
    }
    ctx.lineWidth = 0
    return ctx
  }
  const run = (age, t, un) => { const c = recCtx(); drawVision(c, age, t, un, 152, 114); return c.ops.join('|') }
  ok(run('mechanical', 1, true).includes('clip:'), 'each vision is painted through a glass lens')
  for (const age of ['selenitic', 'stoneship', 'mechanical', 'channelwood']) {
    ok(run(age, 1, true) === run(age, 1, true), `${age} lens paints the same picture at the same instant`)
    ok(run(age, 1, true) !== run(age, 9.25, true), `${age} lens answers to the world clock`)
    ok(run(age, 2, false) === run(age, 2, false) && run(age, 2, false) !== run(age, 2, true), `${age} sealed churn is not its vision`)
  }
  ok(run('selenitic', 1, true) !== run('stoneship', 1, true) && run('mechanical', 1, true) !== run('channelwood', 1, true), 'no two Ages share a vision')
  ok(run('nowhere', 1, true) === run('nowhere', 1, false), 'an unknown age still only shows the sealed churn')

  // #1027 — sealed-vs-dim-storm contrast and the lightning pacing, read straight
  // off the recorded paint ops (pure, no pixels): the sealed pane sits well
  // below the dimmest live lens in brightness and stays neutral grey, a dim
  // Selenitic reads green (alive), and its flash is a brief periodic window
  // whose colour lives only in the Selenitic painter (no second lens strobes).
  const rgb = (hex) => { const m = hex.replace('#', ''); return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) } }
  const lum = (h) => { const { r, g, b } = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 }
  const chroma = (h) => { const { r, g, b } = rgb(h); return Math.max(r, g, b) - Math.min(r, g, b) }
  const greenish = (h) => { const { r, g, b } = rgb(h); return g > r && g > b }
  const skyStops = (age, t, un) => {
    const toks = run(age, t, un).split('|')
    const li = toks.findIndex((t) => t.startsWith('lin:'))
    const out = []
    for (let i = li + 1; i < toks.length && out.length < 2; i++) if (toks[i].startsWith('stop:')) out.push(toks[i].slice(5).split(',').pop())
    return out
  }
  const [sealT, sealB] = skyStops('selenitic', 1, false)
  const [selT, selB] = skyStops('selenitic', 1, true)
  const sealL = (lum(sealT) + lum(sealB)) / 2
  const selL = (lum(selT) + lum(selB)) / 2
  ok(sealL < selL - 0.04, 'the sealed pane is clearly darker than a dim Selenitic storm', `seal ${sealL.toFixed(3)} vs storm ${selL.toFixed(3)}`)
  ok(chroma(sealT) <= 6 && chroma(sealB) <= 6, 'the sealed churn stays neutral grey — no colour to mistake for a storm', `${chroma(sealT)}/${chroma(sealB)}`)
  ok(greenish(selT) && greenish(selB), 'a dim Selenitic storm reads green (alive), not grey', `${selT}/${selB}`)
  const FLASH = '#3f5f52'
  let on = 0, n = 0
  for (let t = 0; t < 6.4; t += 0.02) { n++; if (run('selenitic', t, true).includes(FLASH)) on++ }
  ok(on > 0 && on / n < 0.08, 'the flash is a brief window of its 6.4 s cycle — a controlled pulse, not a stuck white-out', `${on}/${n} samples`)
  ok(!run('stoneship', 0.05, true).includes(FLASH) && !run('mechanical', 0.05, true).includes(FLASH), 'the flash colour is Selenitic-only — no second lens strobes with it')
}
{ // sphere puzzle
  let s = { ...freshState(31415), node: 'selenitic' }
  const singr = dispatch(s, { t: 'click', id: 'sphere' })
  s = singr.state
  ok(singr.events.includes(`sing:${s.codes.sphere.join('')}`), 'opening the sphere posts sing THIS save ring order')
  for (let i = 0; i < 4; i++) s = dispatch(s, { t: 'dial', pad: 'sphere', i, v: s.codes.sphere[i] }).state
  ok(!!s.flags.sphereSolved, 'the seeded tone sequence opens the sphere')
}

console.log('MYST — SELENITIC walkable: sounding path, sun-and-moon throne, the gear')
ok(['selSound', 'selThrone', 'selGate', 'selTop'].every((n) => !seen.has(n)), 'the Selenitic chain lives inside its Age, not on the island path')
{
  const seenS = new Set(['selenitic'])
  const qs = ['selenitic']
  while (qs.length) { const id = qs.shift(); for (const sp of NODES[id].spots) { const t = sp.to ? [sp.to] : sp.visits ? [].concat(sp.visits) : []; for (const v of t) if (!seenS.has(v)) { seenS.add(v); qs.push(v) } } }
  ok(['selSound', 'selThrone', 'selGate', 'selTop'].every((n) => seenS.has(n)), 'Selenitic is walkable end to end once you are linked in')
}
{ // the sounding path: six stones, ascending, and wrong order resets
  let s = { ...freshState(), node: 'selSound' }
  ok(dispatch(s, { t: 'move', id: 'toSelThrone' }).events.includes('blocked'), 'the gate is sealed before the stones are rung')
  let r = dispatch(s, { t: 'click', id: 'stone3' }); s = r.state
  ok(s.selStone === 0 && r.events.includes('buzz'), 'the wrong first stone buzzes and stays home')
  r = dispatch(s, { t: 'click', id: 'stone0' }); s = r.state
  ok(s.selStone === 1 && r.events.includes('stone:0'), 'the biggest stone is first — it rings the lowest')
  r = dispatch(s, { t: 'click', id: 'stone1' }); s = r.state
  r = dispatch(s, { t: 'click', id: 'stone0' }); s = r.state
  ok(s.selStone === 0 && r.events.includes('buzz'), 'stepping back onto a rung stone breaks the order — reset')
  for (let i = 0; i < STONE_SIZES; i++) { r = dispatch(s, { t: 'click', id: `stone${i}` }); s = r.state }
  ok(s.selStone === STONE_SIZES && !!s.flags.selPath && r.events.includes('gateOpen'), 'the full ascending route opens the gate in the cliff')
  ok(dispatch(s, { t: 'move', id: 'toSelThrone' }).state.node === 'selThrone', 'with the path rung you may walk through the gate')
}
{ // the sun-and-moon throne: only the true detent opens the mountain
  let s = { ...freshState(), node: 'selThrone' }
  ok(dispatch(s, { t: 'move', id: 'toSelGate' }).events.includes('blocked'), 'the seamless rock keeps its counsel before the alignment')
  let ev = []
  for (let i = 0; i < SUN_MOON; i++) { const rr = dispatch(s, { t: 'click', id: 'selChair' }); s = rr.state; ev = rr.events }
  ok(s.selChair === SUN_MOON && !!s.flags.selAlign && ev.includes('alignOpen'), 'swivel to the sun-and-moon detent and the mountain opens')
  ok(dispatch(s, { t: 'move', id: 'toSelGate' }).state.node === 'selGate', 'through the opened doorway onto the terraces')
  // a near-miss detent shows one light only and keeps the mountain shut
  let w = { ...freshState(), node: 'selThrone', selChair: 6 }
  const wr = dispatch(w, { t: 'click', id: 'selChair' })
  ok(wr.state.selChair === 7 && !wr.state.flags.selAlign && !wr.events.includes('alignOpen'), 'a wrong detent: one light in the arch, the mountain stays shut')
}
{ // the summit gear, one of five
  let s = { ...freshState(), node: 'selTop' }
  const rg = dispatch(s, { t: 'click', id: 'takeGear' }); s = rg.state
  ok(!!s.flags.gearSelenitic && rg.events.includes('gearTake'), 'the brass gear lifts from its slot')
  const s2 = dispatch(s, { t: 'click', id: 'takeGear' })
  ok(s2.events.length === 0 || !s2.events.includes('gearTake'), 'the empty slot gives nothing twice')
  ok(NODES.selTop.spots.some((x) => x.act === 'takeGear' && x.gone === 'gearSelenitic'), 'the gear spot closes once taken')
}

console.log('MYST — pages, books, endings')
{
  let s = runSolver(freshState(5150))
  ok(isWin(s), 'the solver seats the white page and brings Atrus home')
  ok(s.placed.red === 4 && s.placed.blue === 4, 'all eight pages rest in the books')
  let mid = freshState(5150)
  const scripted = solveScript(mid.codes)
  const pageClicks = scripted.filter((a) => a.id && a.id.startsWith('page')).length
  ok(pageClicks === 8, 'the solver visits eight pages')
  // books before pages = static; corrupt voices get clearer
  let b = { ...freshState(), node: 'library' }
  b = dispatch(b, { t: 'click', id: 'redBook' }).state
  ok(b.bookOpen === 'red' && b.message.includes('fath'), 'an empty red book is almost noise')
  b.flags = { ...b.flags }
  b.pages = { 'red:selenitic': true }
  b = dispatch(b, { t: 'click', id: 'redBook' }).state
  ok(b.placed.red === 1 && b.bookOpen === 'red' && !b.message.includes('fath'), 'a returned page clears the next line')
  // placing all pages does NOT free a brother; the white page must exist first
  let w = runSolver(freshState(5150))
  ok(w.ending === 'atrus', 'eight pages + pedestal = the good ending')
  // #838 — freeing a brother no longer CUTS to the fate screen: the trap flies
  // its own coloured starfield first, and the fate lands when the field clears.
  const trap = (id, fate) => {
    const p = { ...w, ending: null, pending: null, flags: { ...w.flags, whitePage: true }, node: 'library' }
    const r = dispatch(p, { t: 'click', id })
    ok(!r.state.ending && r.state.pending === fate, `${id}: the trap springs — the fate is taken, not shown`)
    let f = r.state
    for (let i = 0; i < LINK_TICKS - 1; i++) f = dispatch(f, { t: 'tick' }).state
    ok(f.ending === null && f.pending === fate && f.linkT === 1, `${id}: the coloured field still flies one tick before the ending`)
    const end = dispatch(f, { t: 'tick' })
    ok(end.state.ending === fate && end.state.pending === null && end.state.link === null, `${id}: the starfield clears exactly as the fate lands`)
    ok(end.events.includes('endBad'), `${id}: the fate still announces itself`)
  }
  trap('redBook', 'sirrus')
  trap('blueBook', 'achenar')
  ok(dispatch({ ...w, ending: null, pending: null, flags: { ...w.flags, whitePage: true }, node: 'library' }, { t: 'click', id: 'redBook' }).events.includes('link:trapRed'), 'the trap schedules its own linking sound')
  ok(dispatch(mid, { t: 'restart' }).state.node === 'dock', 'restart returns to the dock')
}
{ // no page is unreachable given its doors
  const needed = { pageMechanicalRed: 'switchPanel' }
  for (const [id, n] of Object.entries(NODES)) {
    for (const s of n.spots) {
      if (s.act === 'takePage' || s.id in needed) ok(!!s.page || s.id === 'matchbook' || s.id === 'pageMechanicalRed' || s.id === 'matchbook', `${id}/${s.id} is a real pickup`)
    }
  }
  const pagesNeeded = AGE_LIST.flatMap((a) => ['red:' + a, 'blue:' + a])
  const spots = Object.values(NODES).flatMap((n) => n.spots)
  ok(pagesNeeded.every((p) => spots.some((s) => s.page === p)), 'all eight red/blue pages exist somewhere on the island')
  ok(spots.some((s) => s.act === 'takeMatch'), 'matches exist (fire needs them)')
}

console.log('MYST — attract (rule 6, #365)')
{
  ok(MESSAGES.length >= 2, 'the attract cycles through more than one message', `${MESSAGES.length}`)
  ok(new Set(MESSAGES).size === MESSAGES.length, 'no message repeats', `${new Set(MESSAGES).size}/${MESSAGES.length}`)
  ok(MESSAGES.every((m) => m.length > 0 && m.length <= 64), 'every cycling message stays short', MESSAGES.map((m) => m.length).join(','))
  ok(MESSAGES.every((m) => !/scripts\/|\.mjs|autopilot/.test(m)), 'no harness leak in an attract line', MESSAGES.find((m) => /scripts\/|\.mjs|autopilot/.test(m)) || '')
  const jsx = readFileSync('src/games/Myst/index.jsx', 'utf8')
  const block = jsx.slice(jsx.indexOf("{screen === 'attract'"), jsx.indexOf("{screen === 'ending'"))
  ok(block.length > 0 && block.includes('<AttractMessage'), 'attract renders through the one-slot cycling helper')
  ok((block.match(/<AttractMessage/g) || []).length === 1, 'exactly one cycling message slot on the attract', `${(block.match(/<AttractMessage/g) || []).length}`)
  ok((block.match(/<p\b/g) || []).length === 1, 'only the press prompt is a raw paragraph (no stacked lore)', `${(block.match(/<p\b/g) || []).length}`)
  ok(block.includes('{MESSAGES}'), 'the attract reads copy from the shared module', '')
  ok(block.includes('{PRESS}'), 'the press prompt comes from the shared module', '')
  // #1027 — the Spectator shot: the title screen carries all four lenses,
  // drawn live, so the attract shows the sphere's world (the tour's dock loop
  // can never reach the sphere behind Mechanical's door).
  ok(block.includes('data-attract-vision') && block.includes('AGE_LIST'), 'the attract carries the Spectator shot — all four lenses, live', '')
}

console.log('MYST — sound plan (what each event schedules)')
{
  const travel = plan('travel')
  const link = plan('link:mechanical')
  ok(travel.length > 0, 'a plain travel schedules sound', String(travel.length))
  ok(link.length > 0, 'a linking-book leap schedules its own sound', String(link.length))
  ok(JSON.stringify(link) !== JSON.stringify(travel), 'the linking whoosh is distinct from a plain travel')
  ok(plan('page').length > 0, 'a page-turn is scheduled (books and panels open and close)')
  ok(plan('panel').length > 0, 'a panel opening is scheduled')
  ok(plan('safeOpen').length > 0, 'the safe-opening cue still schedules')
  const sing = plan('sing:0123')
  ok(sing.length === 4, 'a seeded sing plans four post cues', String(sing.length))
  ok(sing.every((c, i) => c.delay === i * 0.34), 'the posts sing IN SEQUENCE (staggered delays)', sing.map((c) => c.delay).join(','))
  ok(TONES.length === 4, 'the four posts carry four distinct tones', TONES.join(','))
  const sa = plan(`sing:${deriveCodes(11).sphere.join('')}`), sb = plan(`sing:${deriveCodes(12).sphere.join('')}`)
  ok(JSON.stringify(sa) !== JSON.stringify(sb) || deriveCodes(11).sphere.join('') === deriveCodes(12).sphere.join(''), 'two different saves can sing two different clue sequences')
  const r = dispatch({ ...freshState(9), node: 'selenitic' }, { t: 'click', id: 'sphere' })
  ok(r.events.includes(`sing:${deriveCodes(9).sphere.join('')}`), 'state emits the seeded sing when the sphere opens')
  ok(r.events.includes('panel'), 'state still opens the sphere panel')
  const rb = dispatch({ ...freshState(), node: 'library' }, { t: 'click', id: 'redBook' })
  ok(rb.events.includes('page'), 'opening a book turns its page')
  ok(plan('motor').length > 0 && JSON.stringify(plan('motor')) !== JSON.stringify(travel), 'the cage motor has its own sound, distinct from a walk')
  ok(plan('clank').length > 0 && plan('plate').length > 0 && plan('latch').length > 0, 'bolts, plates and the latch each schedule their own noise')
  ok(plan('spectator').length === 3, 'the SPECTATOR hums a three-note chord', String(plan('spectator').length))
  // #1027 — the per-Age thaw tone: four distinct colour notes, each a soft
  // warm-up sweep into its note; an unknown age is silent (never a fallback hum).
  const thawAges = ['selenitic', 'stoneship', 'mechanical', 'channelwood']
  const thaws = thawAges.map((a) => plan(`thaw:${a}`))
  ok(thaws.every((p) => p.length > 0), 'each thawed lens schedules its colour note', thaws.map((p) => p.length).join(','))
  ok(new Set(thawAges.map((a) => JSON.stringify(plan(`thaw:${a}`)))).size === 4, 'no two Ages share a thaw note')
  ok(new Set(Object.values(THAW_TONES)).size === 4, 'the four thaw notes are four distinct pitches')
  ok(plan('thaw:nowhere').length === 0, 'an unknown age is silent (no fallback hum)')
  // SELENITIC sound: the six stones must be six distinct ascending pitches, and
  // each step its own event — if every stone rang the same, the puzzle would be
  // unplayable blind. Buzz, swivel, alignment, gate and gear each get a cue too.
  const stones = [...Array(STONE_SIZES).keys()].map((i) => plan(`stone:${i}`))
  ok(stones.every((c) => c.length > 0), 'every sounding stone schedules a tone')
  ok(new Set(stones.map((c) => c[0].f)).size === STONE_SIZES, 'the six stones ring six distinct pitches', stones.map((c) => c[0].f).join(','))
  ok(stones.every((c, i) => i === 0 || c[0].f > stones[i - 1][0].f), 'the pitches climb as the route climbs', stones.map((c) => c[0].f).join(','))
  ok(JSON.stringify(stones[0]) !== JSON.stringify(stones[5]), 'the smallest stone is not the biggest stone')
  ok(plan('buzz').length > 0, 'a wrong stone has a sour buzz')
  ok(plan('swivel').length > 0 && plan('alignOpen').length > 0, 'the throne swivels and the alignment rings')
  ok(plan('gateOpen').length > 0 && plan('gearTake').length > 0, 'the gate grinds and the gear lifts with their own sounds')
  const buzz = plan('buzz'), al = plan('alignOpen')
  ok(JSON.stringify(buzz) !== JSON.stringify(al), 'the buzz never collapses into the alignment chord')
  // The field hums before it is touched: a low, sustained drone — the approach
  // cue that tells you the stones are alive. It must sit BELOW the smallest rung
  // (so it is heard as ambience, not a puzzle step) and never collapse into the
  // sour buzz it shares the field with.
  const hum = plan('hum')
  ok(hum.length > 0, 'the sounding field schedules an approach hum')
  ok(hum.every((c) => c.type === 'tone' && c.dur >= 1.0), 'the hum is a sustained drone, not a blip')
  ok(Math.min(...hum.map((c) => c.f)) < Math.min(...stones.map((c) => c[0].f)), 'the hum drones below the lowest rung', `hum=${Math.min(...hum.map((c) => c.f))} stone=${Math.min(...stones.map((c) => c[0].f))}`)
  ok(JSON.stringify(hum) !== JSON.stringify(buzz), 'the hum never collapses into the buzz')
  // #1014 — the star-wheel: three rings, three weights, and the hub grind is
  // its own event — never a re-used gate, safe or motor.
  const rings = [...Array(WHEEL_RINGS).keys()].map((i) => plan(`wheelTick:${i}`))
  ok(rings.every((c) => c.length > 0), 'every ring answers its click with sound')
  ok(new Set(rings.map((c) => c[0].f)).size === WHEEL_RINGS, 'the three rings clunk at three distinct weights', rings.map((c) => c[0].f).join(','))
  ok(rings.every((c, i) => i === 0 || c[0].f > rings[i - 1][0].f), 'outer ring lowest, inner ring highest')
  ok(plan('wheelOpen').length > 0, 'the hub grinds open with a sound of its own')
  ok(plan('wheelOpen').some((c) => c.type === 'sweep'), 'the hub grind is a grind, not a blip')
  ok(JSON.stringify(plan('wheelOpen')) !== JSON.stringify(plan('gateOpen')), 'the hub is not the cliff gate re-used')
  ok(JSON.stringify(plan('wheelOpen')) !== JSON.stringify(plan('safeOpen')), 'the hub is not the safe re-used')
  ok(JSON.stringify(rings[0]) !== JSON.stringify(rings[2]), 'the biggest ring never collapses into the smallest')
}

console.log('MYST — the walkable Mechanical gets played, not skipped')
{
  let s = freshState()
  const visited = new Set()
  for (const a of solveScript(s.codes)) {
    const r = dispatch(s, a)
    s = r.state
    visited.add(s.node)
  }
  ok(['mechWalk', 'mechCar', 'mechTop', 'mechRoom'].every((n) => visited.has(n)), 'the winning route walks every new Mechanical view')
  ok(s.flags.spectatorSeen && s.flags.mechLatchD && s.flags.mechLatchE, 'the solver used the Spectator and both latches')
  ok(isWin(s), 'and still brings Atrus home')
}

console.log('MYST — the walkable Selenitic gets played, not skipped')
{
  let s = freshState()
  const visited = new Set()
  for (const a of solveScript(s.codes)) {
    const r = dispatch(s, a)
    s = r.state
    visited.add(s.node)
  }
  ok(['selSound', 'selThrone', 'selGate', 'selTop'].every((n) => visited.has(n)), 'the winning route walks every new Selenitic view')
  ok(s.flags.selPath && s.flags.selAlign && s.flags.gearSelenitic, 'the solver rang the stones, aligned sun and moon, and took the gear')
  ok(isWin(s), 'and the detour still brings Atrus home')
}

console.log('MYST — the walkable Channelwood gets played, not skipped')
{
  let s = freshState()
  const visited = new Set()
  for (const a of solveScript(s.codes)) {
    const r = dispatch(s, a)
    s = r.state
    visited.add(s.node)
  }
  ok(['chanChannels', 'chanWheel', 'chanObs'].every((n) => visited.has(n)), 'the winning route walks every new Channelwood view')
  ok(s.flags.chanFlood && s.flags.pageRed_channelwood && s.flags.pageBlue_channelwood, 'the solver flooded the channels and took both pages')
  ok(s.flags.wheelBite && s.flags.gearChannelwood, 'the winning route also bites the star-wheel and lifts its gear')
  ok(s.flags.wheelOpen && JSON.stringify(s.wheelDial) === JSON.stringify(s.codes.wheel), 'the solver read the drum and stood the wheel true')
  ok(isWin(s), 'and the detour still brings Atrus home')
}

console.log('MYST — the observatory keeps the wheel\u2019s sky (#1014)')
{
  ok(NODES.chanObs && NODES.chanWheel.spots.some((s) => s.to === 'chanObs'), 'the observatory stands above the star terrace, one stair away')
  ok(NODES.chanObs.spots.some((s) => s.act === 'starDrum'), 'the star drum is a thing you can read up there')
  const drumMsg = (seed) => dispatch({ ...freshState(seed), node: 'chanObs' }, { t: 'click', id: 'starDrum' }).state.message
  for (const seed of [7, 4242, 90210]) {
    const w = deriveCodes(seed).wheel
    const want = w.map((v) => NUMBER_WORDS[WHEEL_POINTS[v]])
    const m = drumMsg(seed)
    ok(want.every((word) => m.includes(word)), `seed ${seed}: the drum spells this save\u2019s points (${want.join(', ')})`)
    ok(/Outer, middle, inner/.test(m), 'the rim names the ring order with the stars')
  }
  const m1 = drumMsg(7), m2 = drumMsg(90210)
  ok(m1 !== m2 || deriveCodes(7).wheel.join('') === deriveCodes(90210).wheel.join(''), 'two islands\u2019 skies differ when their wheels do')
}

console.log('MYST — the walkable Stoneship gets played, not skipped')
{
  let s = freshState()
  const visited = new Set()
  for (const a of solveScript(s.codes)) {
    const r = dispatch(s, a)
    s = r.state
    visited.add(s.node)
  }
  ok(['stoneDeck', 'stoneObservatory'].every((n) => visited.has(n)), 'the winning route walks every new Stoneship view')
  ok(s.flags.obsNote && s.flags.pageRed_stoneship && s.flags.pageBlue_stoneship, 'the solver boarded the ship, read the ridge note, and took both pages')
  ok(isWin(s), 'and the detour still brings Atrus home')
}

console.log('MYST — the rocket (#1010): the seam, the saddle, the ride home')
{
  // the metal seam in the cave: revealed by touch, opened by the AMATEM note
  let s = { ...freshState(), node: 'cave' }
  const rv = dispatch(s, { t: 'click', id: 'rocketDoor' })
  ok(!!rv.state.flags.rocketSeen && rv.events.includes('reveal'), 'the waterfall hides a metal seam (first touch reveals it)')
  s = dispatch(rv.state, { t: 'click', id: 'rocketDoor' }).state
  ok(!s.flags.rocketOpen && s.node === 'cave', 'a second touch without the observatory note still opens nothing')
  let w = { ...freshState(), node: 'cave', flags: { obsNote: true } }
  w = dispatch(w, { t: 'click', id: 'rocketDoor' }).state
  ok(w.flags.rocketSeen && !w.flags.rocketOpen, 'a hand on the seam finds the metal before the note is read to it')
  const op = dispatch(w, { t: 'click', id: 'rocketDoor' })
  ok(op.state.flags.rocketOpen && op.events.includes('rocketOpen'), 'the Amatem note unseals the metal door')
  const en = dispatch(op.state, { t: 'click', id: 'rocketDoor' })
  ok(en.state.node === 'rocketSilo' && en.events.includes('travel'), 'through the open seam into the silo')
  ok(!seen.has('rocketSilo'), 'the silo is not reachable by plain walking — it lives behind the note-gated seam')
}
{ // the ride itself: board, ignite, and let the machine fly you
  let s = { ...freshState(), node: 'rocketSilo' }
  ok(dispatch(s, { t: 'click', id: 'igniteSwitch' }).events.includes('blocked'), 'the ignition means nothing to a bystander')
  const bd = dispatch(s, { t: 'click', id: 'boardRocket' })
  s = bd.state
  ok(s.ride === 'seated' && bd.events.includes('straddle'), 'the saddle takes you astride the rocket')
  const ig = dispatch(s, { t: 'click', id: 'igniteSwitch' })
  s = ig.state
  ok(s.ride === 'ignite' && ig.events.includes('ignite'), 'throwing the switch wakes the fuel lines')
  // mid-ride the rocket drives you: every input but the loop's tick is refused
  const rej = dispatch(s, { t: 'turn', dir: 1 })
  ok(rej.events.length === 0 && rej.state.ride === 'ignite' && rej.state.rideT === 0, 'a steering input mid-ride is refused — and does not even advance the ride')
  const rej2 = dispatch(s, { t: 'click', id: 'retCave' })
  ok(rej2.events.length === 0 && rej2.state.node === 'rocketSilo' && rej2.state.rideT === 0, 'you cannot bail out of the ride')
  // the full ride, tick by tick, must reach the surface ending in order
  const stages = []
  let ticks = 0
  const target = RIDE.ignite + RIDE.liftoff + RIDE.ascent + RIDE.coast + RIDE.reentry
  const allEv = []
  while (!s.ending && ticks < target + 30) {
    const rr = dispatch(s, { t: 'tick' })
    s = rr.state; ticks += 1
    allEv.push(...rr.events)
    if (s.ride && stages[stages.length - 1] !== s.ride) stages.push(s.ride)
  }
  ok(s.ending === 'surface', 'the ride lands you on the surface — the escape ending')
  ok(ticks <= target + 5, 'the ride takes the scripted seconds, not longer', `${ticks} ticks`)
  ok(JSON.stringify(stages) === JSON.stringify(['ignite', 'liftoff', 'ascent', 'coast', 'reentry', 'landed']), 'the stages run in order: ignite, liftoff, ascent, coast, reentry, splash', stages.join('>') )
  ok(['rocketLift', 'ascent', 'coast', 'reentry', 'splash', 'endSurface'].every((e) => allEv.includes(e)), 'each stage announces itself in sound events')
  // determinism: the same seed rides the same arc
  const arc = (seed) => {
    let d = { ...freshState(seed), node: 'rocketSilo' }
    d = dispatch(d, { t: 'click', id: 'boardRocket' }).state
    d = dispatch(d, { t: 'click', id: 'igniteSwitch' }).state
    const seq = []
    for (let i = 0; i < target; i++) { const rr = dispatch(d, { t: 'tick' }); d = rr.state; seq.push(d.ride + ':' + d.rideT) }
    return { seq: seq.join('|'), end: d.ending }
  }
  const a1 = arc(4242), a2 = arc(4242)
  ok(a1.end === 'surface' && a1.seq === a2.seq, 'two identical saves ride identical arcs (deterministic)')
  // after the splash only restart moves you
  ok(dispatch(s, { t: 'click', id: 'retCave' }).state.ending === 'surface', 'the surface holds; only space restarts')
  ok(dispatch(s, { t: 'restart' }).state.ride === null, 'restart clears the ride')
}
{ // the Selenitic sound-book (#1010): six painted pages, six true pitches
  let s = { ...freshState(), node: 'selenitic' }
  const r = dispatch(s, { t: 'click', id: 'soundBook' })
  ok(r.state.panelOpen === 'soundbook' && r.events.includes('soundbook'), 'the tree-stump book opens its six pages')
  const echoed = []
  for (let i = 0; i < STONE_SIZES; i++) { const rr = dispatch(r.state, { t: 'echo', i }); echoed.push(...rr.events) }
  ok(echoed.length === STONE_SIZES && echoed.every((e, i) => e === `stone:${i}`), 'each page replays its own stone, biggest to smallest', echoed.join(','))
  const fs = plan('stone:0'), ls = plan(`stone:${STONE_SIZES - 1}`)
  ok(fs[0].f < ls[0].f, 'the book speaks the truth: biggest page, lowest note')
  ok(dispatch({ ...freshState(), node: 'selenitic' }, { t: 'echo', i: 3 }).events.length === 0, 'no echo with the book shut')
}
{ // the canonical solve is untouched by the rocket: Atrus still comes home
  const s = runSolver(freshState(8080))
  ok(isWin(s) && s.ride === null, 'the white-page route never boards the rocket — the solver still ends at the pedestal')
}

console.log('MYST — per-save codes (#1005: the original stamped its locks per copy)')
{
  const SEEDS = [1, 42, 555, 31415, 987654321, 0xffffffff]
  const shapeOk = (c) => /^[1-9][1-9][1-9]$/.test(c.safe)
    && [...c.star].sort().join('') === '1234'
    && [...c.sphere].sort().join('') === '0123'
    && c.wheel.length === WHEEL_RINGS
    && c.wheel.every((v) => Number.isInteger(v) && v >= 0 && v < WHEEL_NOTCH)
    && new Set(c.wheel).size === WHEEL_RINGS
  for (const seed of SEEDS) {
    const s = freshState(seed)
    ok(shapeOk(s.codes), `seed ${seed}: codes are legal shapes (${s.codes.safe}/${s.codes.star.join('')}/${s.codes.sphere.join('')}/${s.codes.wheel.join('')})`)
    ok(isWin(runSolver(freshState(seed))), `seed ${seed}: the island is winnable with its own codes`)
  }
  const locks = (c) => JSON.stringify([c.safe, c.star, c.sphere, c.wheel])
  ok(locks(deriveCodes(7)) === locks(deriveCodes(7)), 'same seed, same island (deterministic mulberry32)')
  const seenCodes = new Set(SEEDS.map((x) => locks(deriveCodes(x))))
  ok(seenCodes.size === SEEDS.length, 'no two of the probe seeds stamp the same locks')
  ok(!/^852$/.test(deriveCodes(7).safe) || !/^4321$/.test(deriveCodes(7).star.join('')), 'the locks are not the old fixed 852/4-1-3-2 island')
  const note = dispatch({ ...freshState(31415), node: 'library' }, { t: 'click', id: 'shelfNote' })
  ok(note.state.message.includes(safeWords(deriveCodes(31415).safe)), "Atrus's note spells this save's safe digits in words")
  ok(!note.state.message.includes('eight, five, two') || deriveCodes(31415).safe === '852', 'the note no longer defaults to the old fixed 852')
  // wrong codes stay wrong on a seeded island
  let w = { ...freshState(555), node: 'cave' }
  w = dispatch(w, { t: 'click', id: 'starPanel' }).state
  const starWrong = w.codes.star.map((v) => (v % 4) + 1)
  for (let i = 0; i < 4; i++) w = dispatch(w, { t: 'dial', pad: 'star', i, v: starWrong[i] }).state
  ok(!w.flags.starPanel, 'star panel ignores the rotated code')
  // a restart after an ending stamps a NEW island (a new book of Myst)
  const won = runSolver(freshState(5150))
  const rs = dispatch(won, { t: 'restart' }).state
  ok(rs.seed !== 5150 && rs.node === 'dock', 'restart redraws the seed and returns to the dock')
  ok(JSON.stringify([rs.codes.safe, rs.codes.star, rs.codes.sphere]) !== JSON.stringify([deriveCodes(5150).safe, deriveCodes(5150).star, deriveCodes(5150).sphere]), 'the restarted island carries different locks')
  ok(seedFromSearch('?seed=42') === 42 && seedFromSearch('?lite=1&seed=777&x=1') === 777 && seedFromSearch('?x=1') === null, '?seed=N pins the island; unpinned stays random')
}

console.log('MYST — rocket sound (every stage of the ride is audible, and distinct)')
{
  const rideCues = ['rocketOpen', 'straddle', 'ignite', 'rocketLift', 'ascent', 'reentry', 'splash', 'endSurface', 'soundbook']
  ok(rideCues.every((e) => plan(e).length > 0), 'every rocket stage schedules its own sound')
  ok(new Set(rideCues.map((e) => JSON.stringify(plan(e)))).size === rideCues.length, 'no two rocket stages share a cue')
  ok(plan('coast').length === 0, 'the coast is SILENT — the void takes the motor; the silence is the point, so it is asserted')
  ok(JSON.stringify(plan('endSurface')) !== JSON.stringify(plan('endGood')), 'the surf at dawn is not the Atrus fanfare')
  ok(JSON.stringify(plan('splash')) !== JSON.stringify(plan('gateOpen')), 'the splash is not the cliff gate re-used')
  ok(JSON.stringify(plan('ignite')) !== JSON.stringify(plan('motor')), 'ignition is not the cage motor re-used')
}

console.log('MYST — seed notebook (#1008: a save keeps its island across reloads)')
{
  const mem = new Map()
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) } }
  ok(loadSeed() == null, 'a virgin machine has no notebook seed')
  storeSeed(1234)
  ok(loadSeed() === 1234, 'the notebook stores the seed and reads it back')
  ok(notebookSeed(null) === 1234, 'a returning explorer finds the same locks')
  ok(notebookSeed('?seed=99') === 99, 'a ?seed= pin beats the notebook')
  storeSeed(0xffffffff)
  ok(loadSeed() === 0xffffffff, 'the notebook survives the max unsigned seed')
  const remembered = notebookSeed(null)
  ok(deriveCodes(remembered).safe === deriveCodes(0xffffffff).safe, 'the remembered seed derives the remembered locks')
  globalThis.localStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  let threw = false
  try { loadSeed(); storeSeed(7) } catch { threw = true }
  ok(!threw && loadSeed() === null, 'blocked storage (private mode) neither throws nor lies')
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) } }
  mem.clear()
  const rolled = notebookSeed(null)
  ok(Number.isInteger(rolled) && rolled >= 0 && rolled <= 0xffffffff, 'no notebook yet: a legal fresh island is rolled')
}

console.log('MYST — linking-book travel (#1031): the page cover, the seam, the starfield')
{
  ok(LINK_TICKS >= 120 && LINK_TICKS <= 240, `every leap takes ${LINK_TICKS} ticks (~${(LINK_TICKS / 60).toFixed(1)} s) — long enough to feel, short enough to keep`, String(LINK_TICKS))
  const at = (node, flags) => ({ ...freshState(4242), node, flags: { ...(flags || {}) } })
  // [node, spot, action, age, dest, flags] — action is how the real shell drives it
  const BOOKS = [
    ['towerTop', 'mechanicalBook', 'click', 'mechanical', 'mechanical', null],
    ['library', 'fireplace', 'click', 'selenitic', 'selenitic', { matchbook: true, burnedBook: true, link_selenitic: true }],
    ['cabin', 'safe', 'click', 'stoneship', 'stoneship', { safeOpen: true }],
    ['cave', 'channelwoodDoor', 'both', 'channelwood', 'channelwood', { starPanel: true }],
    ['chanWheel', 'hubBook', 'both', 'channelwood', 'cave', { wheelOpen: true }],
    ['channelwood', 'retChannelwood', 'both', 'myst', 'cave', { wheelOpen: true }],
    // #1035 — the other three Ages say goodbye through the starfield too
    ['selenitic', 'retSelenitic', 'both', 'myst', 'library', null],
    ['stoneship', 'retStoneship', 'both', 'myst', 'library', null],
    ['mechanical', 'retMechanical', 'both', 'myst', 'library', null],
  ]
  for (const [node, id, how, age, dest, flags] of BOOKS) {
    const ways = how === 'both' ? ['move', 'click'] : [how]
    for (const t of ways) {
      const r = dispatch(at(node, flags), { t, id })
      ok(r.state.node === dest && r.state.link === age && r.state.linkT === LINK_TICKS, `${node}/${id} (${t}): leaps to ${dest} under the ${age} starfield`)
      ok(r.events.includes('travel'), `${node}/${id} (${t}): the leap still announces the travel`)
    }
  }
  const shut = dispatch(at('chanWheel'), { t: 'move', id: 'hubBook' })
  ok(shut.events.includes('blocked') && !shut.state.link, 'a hub that refuses keeps you — and the starfield stays home')
  const walk = dispatch(at('dock'), { t: 'move', id: 'dockBeach' })
  ok(!walk.state.link, 'walking up the dock path is a step, not a linking-book leap')
  ok(!linkingBook('library', 'redBook') && !linkingBook('library', 'blueBook'), 'the brothers’ books are voices, not doors')
  // #1035 — leaving an Age folds space (starfield home); stepping inside one does not
  ok(['selenitic/retSelenitic', 'stoneship/retStoneship', 'mechanical/retMechanical'].every((k) => linkingBook(...k.split('/')) === 'myst'), 'every Age’s return panel flies home through the starfield (#1035)')
  ok(!['stoneship/retStoneDeck', 'stoneObservatory/retStoneObs', 'chanChannels/retChanChannels', 'chanWheel/retChanWheel', 'rocketSilo/retCave'].some((k) => linkingBook(...k.split('/'))), 'walking between views of the SAME Age stays a step, not a leap')
  // the loop's tick drains the flight; it clears exactly on arrival
  let f = dispatch(at('chanWheel', { wheelOpen: true }), { t: 'move', id: 'hubBook' }).state
  for (let i = 0; i < LINK_TICKS - 1; i++) f = dispatch(f, { t: 'tick' }).state
  ok(f.link === 'channelwood' && f.linkT === 1, 'the flight holds right up to its last tick')
  const done = dispatch(f, { t: 'tick' })
  ok(done.state.link === null && done.state.linkT === 0 && done.state.node === 'cave', 'the starfield clears exactly when the Age has arrived')
  // the page cover must be opaque across the swap window (the node changes
  // underneath it) and gone by the tick the sim clears the link
  ok(linkEnvelope(0) === 1 && linkEnvelope(Math.floor(LINK_TICKS * 0.25)) === 1, 'the page cover is opaque across the swap window')
  ok(linkEnvelope(LINK_TICKS) === 0 && linkEnvelope(LINK_TICKS - 1) > 0, 'the overlay is gone by the last tick, and still flying one before')
  ok(new Set(['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst'].map((a) => JSON.stringify(linkTint(a)))).size === 5, 'every Age’s starfield wears its own light')
  const jsx = readFileSync('src/games/Myst/index.jsx', 'utf8')
  ok((jsx.match(/if \(gs\.link\) return/g) || []).length >= 2, 'keys AND pad are muted through the leap', `${(jsx.match(/if \(gs\.link\) return/g) || []).length}`)
  ok(/data-linkfx=\{hud\.link\}/.test(jsx) && /drawLink\(/.test(jsx), 'the shell carries the starfield overlay and paints it from the sim', '')
  // #1035 — crisp streaks on phones: the overlay overdraws on a DPR-aware backing
  ok(/devicePixelRatio/.test(jsx) && /drawLink\([\s\S]*?pw,\s*ph\)/.test(jsx), 'the starfield overdraws on a DPR-aware backing (2× crisp on phones)', '')
}

console.log('MYST — the trap books fly (#838: red and blue starfields before the fate screens)')
{
  const at = (flags) => ({ ...freshState(4242), node: 'library', flags: { ...(flags || {}) } })
  const pullTrap = (c) => dispatch(at({ whitePage: true }), { t: 'click', id: c === 'red' ? 'redBook' : 'blueBook' })
  const fateOf = { red: 'sirrus', blue: 'achenar' }
  ok(TRAP_LINK.red === 'trapRed' && TRAP_LINK.blue === 'trapBlue' && TRAP_LINK.red !== TRAP_LINK.blue, 'each brother’s book owns its own linking field')
  ok(!!LINK_PALETTE[TRAP_LINK.red] && !!LINK_PALETTE[TRAP_LINK.blue], 'both trap fields carry their own palette (no quiet fallback to the Ages’ blue-white)')
  const tints = ['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst', TRAP_LINK.red, TRAP_LINK.blue].map((a) => JSON.stringify(linkTint(a)))
  ok(new Set(tints).size === 7, 'the two traps wear skies no Age has ever worn', tints.join(','))
  const [rr, rg, rb] = linkTint(TRAP_LINK.red), [br, bg, bb] = linkTint(TRAP_LINK.blue)
  ok(rr > rg + 120 && rr > rb + 120, 'the red book’s field is crimson, not tinted blue-white', `${rr},${rg},${rb}`)
  ok(bb > br + 120 && bb > bg + 120, 'the blue book’s field is cobalt, not the Ages’ blue-white', `${br},${bg},${bb}`)
  ok((LINK_PALETTE.myst.mix ?? 0.18) < LINK_PALETTE[TRAP_LINK.red].mix && (LINK_PALETTE.myst.mix ?? 0.18) < LINK_PALETTE[TRAP_LINK.blue].mix, 'a trap’s stars take their colour far harder than a leap’s', String(LINK_PALETTE[TRAP_LINK.red].mix))
  // the flight holds cover from the pull to the fate — no frame where the
  // library would flash back between the trap and its ending screen
  for (const c of ['red', 'blue']) {
    let f = pullTrap(c).state
    let covered = true, t = 0
    // capped: the flight is exactly LINK_TICKS long, and a mutant that never
    // lands the fate must DIE here (fail the next ok), not spin this loop
    // forever — an unbounded wait was a corpse factory (#838, 2026-11-05).
    while (f.pending && !f.ending && t < LINK_TICKS + 30) { covered = covered && !!f.link && f.linkT > 0; f = dispatch(f, { t: 'tick' }).state; t += 1 }
    ok(covered && t === LINK_TICKS, `the ${c} trap flies its full ${LINK_TICKS}-tick field with no uncovered frame`, `${t} ticks`)
    ok(f.ending === fateOf[c] && f.pending === null, `the ${c} trap lands its own fate`)
  }
  // the trap cannot be cancelled: every input but the loop's own tick is refused
  const mid = pullTrap('red').state
  for (const a of [{ t: 'turn', dir: 1 }, { t: 'move', id: 'libDesk' }, { t: 'click', id: 'pedestal' }, { t: 'restart' }]) {
    const r = dispatch(mid, a)
    ok(r.state === mid && r.events.length === 0, `the trap ignores ${a.t} — you cannot step back out of it`)
  }
  ok(dispatch(mid, { t: 'tick' }).state.linkT === LINK_TICKS - 1, 'only the clock moves you through the trap')
  // without the white page the books are still voices, not doors (the #1031 law holds)
  const voice = dispatch(at({}), { t: 'click', id: 'redBook' }).state
  ok(voice.bookOpen === 'red' && !voice.link && !voice.pending, 'an empty red book still only speaks — the trap needs the white page')
  const w = runSolver(freshState(5150))
  ok(w.ending === 'atrus' && !w.pending, 'the white page still brings Atrus home on its own tick')
  // and it sounds apart from a leap: an Age leap rises into the light, a trap falls
  const ageSnd = plan('link:mechanical'), trapSnd = plan(`link:${TRAP_LINK.red}`)
  ok(JSON.stringify(ageSnd) !== JSON.stringify(trapSnd), 'the trap’s linking sound is its own event')
  const rise = ageSnd.find((x) => x.type === 'sweep'), fall = trapSnd.find((x) => x.type === 'sweep')
  ok(rise.f1 > rise.f0 && fall.f1 < fall.f0, 'an Age leap rises into the light; the trap drags you down', `${rise.f0}->${rise.f1} vs ${fall.f0}->${fall.f1}`)
}
{ // the starfield painter: pure paint, alive on the clock, distinct per Age
  const OPS = ['save', 'restore', 'clip', 'beginPath', 'fill', 'stroke', 'closePath', 'fillRect', 'strokeRect', 'clearRect', 'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'translate', 'rotate']
  function recCtx() {
    const ops = []
    const num = (x) => (typeof x === 'number' ? x.toFixed(3) : String(x))
    const grad = { addColorStop: (...a) => ops.push('stop:' + a.map(num).join(',')) }
    const ctx = { ops }
    for (const m of OPS) ctx[m] = (...a) => ops.push(m + ':' + a.map(num).join(','))
    ctx.createLinearGradient = (...a) => { ops.push('lin:' + a.map(num).join(',')); return grad }
    ctx.createRadialGradient = (...a) => { ops.push('rad:' + a.map(num).join(',')); return grad }
    for (const p of ['fillStyle', 'strokeStyle']) {
      let v = ''
      Object.defineProperty(ctx, p, { get: () => v, set: (x) => { v = x; ops.push(p + ':' + x) } })
    }
    ctx.lineWidth = 0
    return ctx
  }
  const runL = (age, p) => { const c = recCtx(); drawLink(c, age, p, 320, 180); return c.ops.join('|') }
  ok(runL('mechanical', 0.5) === runL('mechanical', 0.5), 'the starfield paints the same picture at the same instant')
  ok(runL('mechanical', 0.2) !== runL('mechanical', 0.62), 'the stars wheel between two instants')
  for (const age of ['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst']) {
    ok(runL(age, 0.15) !== runL(age, 0.55), `${age} starfield answers the flight clock`)
  }
  ok(runL('mechanical', 0.5) !== runL('selenitic', 0.5) && runL('stoneship', 0.75) !== runL('channelwood', 0.75), 'no two Ages share a linking sky')
  // #838 — the trap skies paint: unlike every Age, unlike each other, and their
  // stars carry the brother's colour hard enough that the field reads as his.
  ok(runL(TRAP_LINK.red, 0.5) !== runL(TRAP_LINK.blue, 0.5), 'the two traps do not paint one field')
  ok(['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst'].every((a) => runL(TRAP_LINK.red, 0.5) !== runL(a, 0.5)), 'the crimson field belongs to no Age')
  ok(runL(TRAP_LINK.red, 0.15) !== runL(TRAP_LINK.red, 0.55), 'the trap field answers the flight clock')
  const streaks = (age, p) => (runL(age, p).match(/strokeStyle:rgba\((\d+),(\d+),(\d+)/g) || [])
    .map((s) => s.replace('strokeStyle:rgba(', '').split(',').map(Number))
  const rs = streaks(TRAP_LINK.red, 0.55)
  ok(rs.length >= 100 && rs.reduce((n, [r, , b]) => n + (r - b), 0) / rs.length > 40, 'the red trap’s stars run red-hot, not blue-white', `${rs.length} streaks`)
  const bs = streaks(TRAP_LINK.blue, 0.55)
  ok(bs.length >= 100 && bs.reduce((n, [r, , b]) => n + (b - r), 0) / bs.length > 40, 'the blue trap’s stars run cold cobalt', `${bs.length} streaks`)
  const inkOf = (age, p) => (runL(age, p).match(/fillStyle:(#[0-9a-f]{6})/) || [])[1]
  ok(new Set(['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst'].map((a) => inkOf(a, 0.15))).size === 5, 'each Age’s page cover carries its own ink', ['selenitic', 'stoneship', 'mechanical', 'channelwood', 'myst'].map(inkOf).join(','))
  // full cover: every sampled tick of the held window must paint ground AND a
  // sky full of streaks — a thin or empty frame would flash the world mid-leap
  for (const p of [0.01, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.99]) {
    const trace = runL('mechanical', p)
    ok(trace.includes('fillRect:') && (trace.match(/lineTo:/g) || []).length >= 100, `the field fully covers the screen at ${Math.round(p * 100)}% of the flight`, `${(trace.match(/lineTo:/g) || []).length} streaks`)
  }
  const sA = linkStars(), sB = linkStars()
  ok(sA.length === 240 && JSON.stringify(sA) === JSON.stringify(sB), 'the starfield is the same sky every leap (a world constant, no re-roll)')
  ok(sA.every((st) => st.rate > 0 && st.sz > 0 && st.cb >= 235 && st.cr <= 255), 'every star carries a legal speed, size and cool colour')
  // #1035 — arrival acceleration: the pull is calm at the start and steepens hard
  // toward arrival, monotonic so it never lurches backward.
  ok(linkAccel(0) === 1, 'the leap starts at rest-pull 1×')
  ok(linkAccel(1) > 2, `the field arrives at ${linkAccel(1).toFixed(2)}× — a real pull into the Age`)
  ok([0.2, 0.4, 0.6, 0.8].every((p) => linkAccel(p + 0.05) > linkAccel(p)), 'the acceleration never reverses (strictly gathering speed)')
  // #1035 — the seam shimmers and wavers (deterministic, no Math.random): two
  // nearby instants inside the open window read different geometry, the same
  // instant is identical, and the seam stays bounded so the rift never leaves the page.
  ok(linkSeam(0.22).angle === linkSeam(0.22).angle, 'the seam wobble is deterministic (same instant, same tilt)')
  ok(Math.abs(linkSeam(0.20).angle - linkSeam(0.26).angle) > 1e-3, 'the seam tilts between instants — it shimmers, it is not a stiff bar', `${linkSeam(0.20).angle.toFixed(4)} vs ${linkSeam(0.26).angle.toFixed(4)}`)
  ok(Math.abs(linkSeam(0.25).angle + 0.35) < 0.12 && linkSeam(0.25).len < 0.85 && linkSeam(0.25).len > 0.6, 'the waver stays a shimmer, not a wild swing', `${linkSeam(0.25).angle.toFixed(3)}/${linkSeam(0.25).len.toFixed(3)}`)
  // #1035 — the page cover snaps up as its own phase, distinct from the mid-flight whoosh
  const lsn = plan('link:mechanical')
  ok(lsn.length >= 3, 'a leap schedules both a cover snap and a flight whoosh', String(lsn.length))
  ok(lsn[0].type === 'fnoise' && lsn[0].freq > 1500 && lsn[0].dur < 0.25, 'the cover snaps up bright and short (its own phase)', JSON.stringify(lsn[0]))
  ok(JSON.stringify(lsn[0]) !== JSON.stringify(lsn[lsn.length - 1]), 'the cover snap never collapses into the whoosh rumble')
}

console.log('MYST — ring ticks (#1008: each post visibly answers its ring)')
{
  const t = singTicks('2013')
  ok(t.length === 4, 'four ticks, one per singing post')
  ok(t.map((x) => x.ring).join('') === '0123', 'the ticks walk the rings in order')
  ok(t.every((x, i) => x.tone === Number('2013'[i]) && x.at === i * 0.34), 'each tick carries its slot tone on the audio cue time')
  const a = singTicks(deriveCodes(7).sphere.join(''))
  const b = singTicks(deriveCodes(8).sphere.join(''))
  ok(a.map((x) => x.ring).join('') === b.map((x) => x.ring).join('') &&
     (a.map((x) => x.tone).join('') !== b.map((x) => x.tone).join('') || deriveCodes(7).sphere.join('') === deriveCodes(8).sphere.join('')),
  'two islands tick the same rhythm but different posts')
  const live = dispatch({ ...freshState(7), node: 'selenitic' }, { t: 'click', id: 'sphere' })
  const digits = live.state.codes.sphere.join('')
  ok(live.events.includes(`sing:${digits}`) && singTicks(digits).every((x, i) => x.tone === live.state.codes.sphere[i]), 'this save\'s sing lights this save\'s posts in ring order')
}

console.log('MYST — dome star silhouettes (#1008: shape varies alongside size)')
{
  ok(STAR_SHAPES.length === 4, 'one silhouette per true star')
  ok(STAR_SHAPES.every((n) => Number.isInteger(n) && n >= 4 && n <= 6), 'silhouettes stay 4–6 points')
  ok(new Set(STAR_SHAPES).size > 1, 'the true stars differ in shape, not only size')
}

console.log('MYST — Selenitic terrain sculpt (#1033: a dome, not rings on a disc)')
{
  ok(domeHeight(0, -16, 'selenitic') === 0 && domeHeight(0, 8, 'selenitic') === 0 &&
     domeHeight(0, 23, 'selenitic') === 0 && domeHeight(4.2, -9, 'selenitic') === 0 &&
     domeHeight(4.2, 3, 'selenitic') === 0,
  'the landing pad stays level under the rings, posts and sphere')
  ok(domeHeight(0, 95, 'selenitic') === SEL_CRESTS.selenitic.h &&
     domeHeight(0, 95, 'selenitic') > 1.15,
  'a crest rises on the sightline ahead, above the highest ring')
  const climb = [60, 65, 70, 75, 80, 85, 90, 95].map((z) => domeHeight(0, z, 'selenitic'))
  ok(climb.every((h, i) => i === 0 || h >= climb[i - 1]) && climb[climb.length - 1] - climb[0] > 8,
  'the flank climbs smoothly from the coast to the crest')
  let crossings = 0
  for (let z = 0; z < 195; z += 1) { const a = domeHeight(0, z, 'selenitic'), b = domeHeight(0, z + 1, 'selenitic'); if (a >= 0 && b < 0) crossings++ }
  ok(crossings === 1, 'the sightline meets the waterline exactly once — a coast, not an ocean under the world')
  ok(domeHeight(0, 175, 'selenitic') < 0 && domeHeight(200, 200, 'selenitic') === DOME.seabed,
  'the skirt dips below the sea so the shared plane ends at the shore')
  ok(domeHeight(0, -46, 'selSound') === 0 && domeHeight(0, -30, 'selSound') === 0 &&
     domeHeight(0, -27.4, 'selSound') === 0 && domeHeight(0, -18, 'selSound') >= 8,
  'the sounding field stays level and the gate sits in a cliff that rises behind it')
  ok(SEL_CRESTS.selenitic.z !== SEL_CRESTS.selSound.z && SEL_CRESTS.selenitic.h !== SEL_CRESTS.selSound.h,
  'each Selenitic view carves its own crest — one dome seen from two poses')
}

console.log('MYST — the other Ages’ ground (#838 item 1: beds and coasts, not disc edges)')
{
  // the player's feet plus landmarks that must sit on the level bed (from the
  // node cameras and the scene builders) — all strictly inside the flat carve
  const BED = {
    stoneship:        [[0, -24], [0, -2], [4.4, 0.4], [8, -1]],
    stoneDeck:        [[0, -10], [0, 0], [1.3, 4.4], [0, -16]],
    stoneObservatory: [[0, -4], [-9, -2], [-8.78, -0.36]],
    mechanical:       [[0, -14], [0, -6.2], [-4.4, 2.6], [11, -12]],
    mechWalk:         [[3.2, -8.5], [5.6, 5.6], [-2.4, 7.8], [8.4, -6]],
    channelwood:      [[0, -24], [0, -16], [0, -14]],
    chanChannels:     [[0, -40], [0, -25.6], [-2.2, -34.6], [1.5, -30]],
    chanWheel:        [[0, -56], [0, -53], [-4.8, -51.4], [7.6, -57]],
    chanObs:          [[0, -66], [-3.4, -63], [-4.4, -70], [5.6, -66]],
  }
  for (const [view, v] of Object.entries(AGE_GROUND)) {
    const f = v.flats[0]
    let bed = true
    for (const x of [f.x0 + 1, (f.x0 + f.x1) / 2, f.x1 - 1])
      for (const z of [f.z0 + 1, (f.z0 + f.z1) / 2, f.z1 - 1])
        if (ageHeight(x, z, view) !== v.base) bed = false
    ok(bed && BED[view].every(([x, z]) => ageHeight(x, z, view) === v.base),
      `${view}: the bed is exactly level under the player and its landmarks`)
    if (v.water !== null)
      ok(v.base > v.water, `${view}: the bed is dry land — the sea runs below the player's feet`)
    // the sculpt is real: a crest above the bed, a drop below the sea (or bed)
    let mx = -1e9, mn = 1e9
    for (let x = -110; x <= 110; x += 3) for (let z = -110; z <= 110; z += 3) {
      const h = ageHeight(x, z, view); if (h > mx) mx = h; if (h < mn) mn = h
    }
    ok(mx > v.base + 0.5 && mn < (v.water === null ? v.base - 0.5 : v.water),
      `${view}: the sculpt is real — a crest above the bed, a drop below ${v.water === null ? 'the bed' : 'the sea'}`,
      `mx ${mx.toFixed(2)} / mn ${mn.toFixed(2)}`)
    // sightline from the bed's centre through the crest: it meets the waterline
    // exactly once (a coast, not an ocean under the world), and the skirt ends
    // the shared plane below it
    const c = v.crest
    const fc = [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2]
    let dx = c.x - fc[0], dz = c.z - fc[1]
    const L = Math.hypot(dx, dz) || 1
    dx /= L; dz /= L
    let cross = 0, prev = ageHeight(fc[0], fc[1], view)
    for (let d = 0.5; d <= 130; d += 0.5) {
      const h = ageHeight(fc[0] + dx * d, fc[1] + dz * d, view)
      if (v.water !== null && prev >= v.water && h < v.water) cross++
      prev = h
    }
    if (v.water !== null) {
      ok(cross === 1, `${view}: the sightline meets the waterline exactly once (a coast)`, String(cross))
      ok(prev < v.water, `${view}: the skirt dips below the sea so the shared plane ends at the shore`, prev.toFixed(2))
    } else {
      ok(prev < v.base, `${view}: the drop runs below the old disc level — no hard disc edge`, prev.toFixed(2))
    }
  }
  ok(ageHeight(0, 3, 'stoneObservatory') > AGE_GROUND.stoneObservatory.base,
    'the ridge rises under the observatory dome (Stoneship)')
  ok(ageHeight(0, -57, 'chanObs') > AGE_GROUND.chanObs.base,
    'the ridge rises under the star drum (Channelwood)')
  const entries = Object.values(AGE_GROUND).map((v) => JSON.stringify(v))
  ok(new Set(entries).size === Object.keys(AGE_GROUND).length,
    'no two views share one sculpt (nine distinct entries)')
  const sig = (view) => {
    const v = AGE_GROUND[view]
    const out = []
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++)
      out.push(ageHeight(v.crest.x + i * 7, v.crest.z + j * 7, view).toFixed(2))
    return out.join(',')
  }
  ok(new Set(Object.keys(AGE_GROUND).map(sig)).size === Object.keys(AGE_GROUND).length,
    'no two views share one sculpt (nine distinct height fields)')
  // one entry point: the dome for Selenitic, the Age ground for the other three
  ok(groundHeight(0, 95, 'selenitic') === domeHeight(0, 95, 'selenitic') &&
     groundHeight(0, -24, 'stoneship') === ageHeight(0, -24, 'stoneship') &&
     groundHeight(0, -66, 'chanObs') === ageHeight(0, -66, 'chanObs'),
    'the scene displaces its heightfield through groundHeight — dome for Selenitic, Age ground for the rest')
  const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
  ok(Object.keys(AGE_GROUND).every((v) => new RegExp(`terrainField\\(g, TX\\.\\w+, '${v}'`).test(sc)),
    'every outdoor view of the three Ages displaces a heightfield in the scene (no old disc)')
}

console.log('MYST — the sea wears each Age (#838 item 2: per-Age water, swell, foam line)')
{
  const SEA = 'src/games/Myst/sea.js'
  const SEAV = Object.keys(SEA_VIEWS)
  ok(SEAV.length === 13 && ['dock', 'cliffPath', 'beach', 'stairTop', 'selenitic', 'selSound',
    'stoneship', 'stoneDeck', 'stoneObservatory', 'channelwood', 'chanChannels', 'chanWheel', 'chanObs']
      .every((v) => SEA_VIEWS[v]),
    'every sea view wears its Age (13 views: island, Selenitic, Stoneship, Channelwood)')
  ok(!SEA_VIEWS.mechanical && !SEA_VIEWS.mechWalk,
    'Mechanical keeps a dry forge floor — no sea entry for a smoke-black indoor Age')
  ok(new Set(SEAV.map((v) => SEA_VIEWS[v].color.join(','))).size >= 9,
    'no brother Age shares its water — the four Ages read apart at the shoreline')
  // hue laws, straight from the original's light
  const hue = (v) => SEA_VIEWS[v].color
  ok(hue('selenitic')[1] > hue('selenitic')[0] && hue('selenitic')[1] > hue('selenitic')[2],
    'Selenitic water is green-dominant — it swims in the same haze as its fog')
  ok(SEAV.filter((v) => v.startsWith('stoneship') || v.startsWith('stone')).every((v) => hue(v)[2] > hue(v)[0] && hue(v)[1] > hue(v)[0]),
    'Stoneship water is teal — blue and green well over red, the Atlantic of the original')
  ok(SEAV.filter((v) => v.startsWith('chan')).every((v) => hue(v)[1] > hue(v)[0] && Math.max(...hue(v)) <= 0.8),
    'Channelwood water is moss-dark — a cloud-world pool lit from cloud, not sun')
  ok(SEAV.filter((v) => ['dock', 'cliffPath', 'beach', 'stairTop'].includes(v)).every((v) => hue(v)[0] > hue(v)[1] && hue(v)[1] > hue(v)[2]),
    'the island sea is dusk-amber — warm r > g > b, the same sunset that gilds its fog')
  // swell: ocean > chop > wash > glass, and nobody's sea is dead
  const sw = (v) => SEA_VIEWS[v].swell
  ok(sw('stoneObservatory') > sw('selenitic') && sw('selenitic') > sw('beach') && sw('beach') > sw('channelwood') && sw('channelwood') > 0,
    'swell is pitched by the Age — Stoneship heaves, Selenitic chops, the island washes, Channelwood is glass')
  ok(sw('channelwood') <= 0.1, 'Channelwood stays glass — its pools barely ripple')
  // seaSwell: deterministic, bounded, alive, and pitched per Age
  {
    const a = seaSwell(12, -40, 7.5, 'stoneship'), b = seaSwell(12, -40, 7.5, 'stoneship')
    ok(a === b, 'seaSwell is deterministic — same instant paints the same water')
    ok(a !== seaSwell(12, -40, 7.5 + 0.31, 'stoneship'), 'the water moves — two instants never match')
    let mx = 0
    for (let t = 0; t < 12; t += 0.13) for (let x = -60; x <= 60; x += 7)
      mx = Math.max(mx, Math.abs(seaSwell(x, -30, t, 'stoneship')))
    ok(mx > 0.3 && mx <= sw('stoneship') * 1.01, 'the swell is bounded by its Age amplitude', mx.toFixed(3))
    let mS = 0, mC = 0
    for (let t = 0; t < 12; t += 0.17) {
      mS = Math.max(mS, Math.abs(seaSwell(9, -33, t, 'stoneship')))
      mC = Math.max(mC, Math.abs(seaSwell(9, -33, t, 'channelwood')))
    }
    ok(Math.abs(seaSwell(3, -20, 2.2, 'stoneship')) > Math.abs(seaSwell(3, -20, 2.2, 'channelwood')) && mS / mC >= 5,
      'one world time, two Ages — the ocean rocks where the glass sits still', `${mS.toFixed(3)} vs ${mC.toFixed(3)}`)
  }
  // foam: exactly where the sculpted ground meets its own sea
  ok(foamAt(0, 0, 'selenitic') === 0 && foamAt(0, -24, 'stoneship') === 0 && foamAt(0, -40, 'chanChannels') === 0,
    'dry carved pads wear no foam — a puzzle bed at sea level is not a beach')
  ok(['dock', 'beach', 'cliffPath', 'stairTop'].every((v) => foamLine(v).length >= 8),
    'the island shores wear waterlines too — the dusk sea meets sculpted ground on Myst itself (#838 item 3)')
  ok(foamAt(0, 28, 'dock') === 0, 'the pier foot stays dry — foam hugs the shore ahead, never the planks')
  ok(foamAt(0, 120, 'stoneship') === 0 && foamAt(0, 20, 'stoneObservatory') === 0,
    'foam sits neither on open water below the sea nor on high dry ground')
  const COAST = ['selenitic', 'selSound', 'stoneship', 'stoneDeck', 'stoneObservatory', 'channelwood', 'chanChannels', 'chanWheel', 'chanObs']
  for (const v of COAST) {
    const L = foamLine(v)
    ok(L.length >= 8, `${v}: its coast wears a foam line`, String(L.length))
    ok(L.every(([x, z, i]) => i > 0 && Math.abs(groundHeight(x, z, v) - SEA_VIEWS[v].water) < FOAM_BAND),
      `${v}: every puff hugs the waterline — foam only where land and sea agree`)
  }
  const coastSig = (v) => foamLine(v, 3, 20).map(([x, z]) => `${x},${z}`).join('|')
  ok(new Set(COAST.map(coastSig)).size === COAST.length, 'no two coasts share one foam line')
  // the scene actually dresses its seas through the pure law
  {
    const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
    ok(/p\.userData\.isSea = true/.test(sc), 'sea planes mark themselves for dressing')
    ok(/dressSea\(g, id, anim\)/.test(sc), 'every view dresses its sea at build time')
    ok(/o\.material\.color\.setRGB\(prof\.color/.test(sc) && /seaSwell\(base\[i \* 3\], -base\[i \* 3 \+ 1\], t, id\)/.test(sc) &&
       /foamLine\(id\)/.test(sc),
      'dressSea colours, heaves and foams through sea.js — colour and swell live in the pure law, not the scene')
  }
}

console.log('MYST — sea polish pass (#1587: ragged lagging foam, swell voice, sun glints, horizon cover)')
{
  // horizon cover: the plane's edge hides behind the sky dome (radius 900)
  ok(SEA_EXTENT / 2 > 900 && SEA_EXTENT / 2 + 900 < 4000,
    'the sea reaches past the sky dome without poking a neighbour — the horizon never shows the water\'s edge', String(SEA_EXTENT))
  // the break is ragged and lags the swell
  ok(FOAM_LAG > 0.2 && FOAM_LAG < 0.5, 'shore break lags the swell by ~0.3 s — foam trails the crest', String(FOAM_LAG))
  {
    let mn = Infinity, mx = 0
    for (const [x, z] of foamLine('selenitic')) { const s = foamScale(x, z, 'selenitic'); mn = Math.min(mn, s); mx = Math.max(mx, s) }
    ok(mn < 1.1 && mx > 1.6, 'the break is ragged — per-seat widths span a real range, not a uniform comb', `${mn.toFixed(2)}..${mx.toFixed(2)}`)
    ok(foamScale(3, -21, 'stoneship') === foamScale(3, -21, 'stoneship') && foamScale(3, -21, 'stoneship') !== foamScale(4, -21, 'stoneship'),
      'foamScale is a deterministic seat hash — replayable, and neighbours differ')
  }
  // the swell has a voice, pitched by the Age
  {
    const loud = (v) => swellCues(v).reduce((m, c) => Math.max(m, c.vol || 0), 0)
    ok(swellCues('stoneship').length > 0 && swellCues('mechanical').length === 0, 'the swell has a voice; the indoor Age stays dry')
    ok(loud('stoneship') > loud('selenitic') && loud('selenitic') > loud('channelwood') && loud('channelwood') > 0,
      'the rumble is pitched by the Age — Stoneship loud, Selenitic mid, Channelwood barely there')
    const dur = (v) => Math.max(...swellCues(v).map((c) => c.dur))
    ok(dur('stoneship') > dur('channelwood') + 0.8, 'ocean swells roll longer than glass ripples', `${dur('stoneship').toFixed(1)}s vs ${dur('channelwood').toFixed(1)}s`)
    ok(plan('swell:stoneship').length === swellCues('stoneship').length && plan('swell:stoneship')[0].vol === swellCues('stoneship')[0].vol,
      'plan() routes swell: events through the pure law')
  }
  // the low sun gilds each open sea
  {
    const gl = (v) => glintFor(v)
    const all = Object.keys(SEA_VIEWS)
    ok(all.every((v) => gl(v) && gl(v).base > 0 && gl(v).base < 0.4), 'every open sea catches the sun — a glint strip per view, bounded')
    ok(new Set(all.map((v) => JSON.stringify(gl(v)))).size === all.length, 'no two views seat the same glint (bearing and distance are per-view)')
    ok(gl('dock').color[0] > gl('dock').color[2] && gl('stoneship').color[2] >= gl('stoneship').color[0],
      'the glints wear their sky — amber on the dusk island, cold on the Atlantic')
    ok(gl('beach').base > gl('stoneObservatory').base, 'the heaving observatory breaks its mirror — the calm dusk wash holds the glint')
  }
  // the scene and loop wear the pure laws
  {
    const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
    const jx = readFileSync('src/games/Myst/index.jsx', 'utf8')
    const sd = readFileSync('src/games/Myst/sound.js', 'utf8')
    ok(/t - FOAM_LAG/.test(sc) && /foamScale\(fx, fz, id\)/.test(sc), 'the scene lags and rags its foam through sea.js')
    ok(/glintFor\(id\)/.test(sc) && /SEA_EXTENT/.test(sc), 'the scene seats its glints and sizes its seas through sea.js')
    ok(/ambience\(NODES\[gs\.node\]\.amb, SIM_MS \/ 1000, gs\.node\)/.test(jx), 'the loop passes the view to ambience so the swell rumble wears its Age')
    ok(/swell:\$\{view\}/.test(sd), 'the ambience layer routes each view to its swell cues')
  }
}

console.log('MYST — the deep ocean wears the Age too (#838 item 4: depth ladder + far ground-swell)')
{
  const SCENE = 'src/games/Myst/scene.js'
  const dlum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
  // the ladder sits between the break and the fog: the gradient reads before
  // the sky swallows the water, and it never dims the foam band
  ok(SEA_DEEP.coast >= 40 && SEA_DEEP.deep > SEA_DEEP.coast && SEA_DEEP.mirror > SEA_DEEP.deep &&
     SEA_DEEP.mirror <= 400 && DEEP_DARK < 0.8 && MIRROR_LIFT > DEEP_DARK && MIRROR_LIFT < 1,
    'the depth ladder runs coast < deep < mirror inside fog reach, darkening hard and lifting back', JSON.stringify(SEA_DEEP))
  ok(deepTint('mechanical', 200) === null, 'a dry Age wears no deep ladder — Mechanical keeps its dry forge floor')
  {
    const all = Object.keys(SEA_VIEWS)
    ok(all.every((v) => deepTint(v, 0).join(',') === SEA_VIEWS[v].color.join(',')),
      'shore water keeps its Age tint exactly — the item 2/3 shoreline is untouched')
    ok(all.every((v) => dlum(deepTint(v, SEA_DEEP.deep)) <= dlum(deepTint(v, 0)) * DEEP_DARK + 1e-9 &&
      dlum(deepTint(v, SEA_DEEP.deep)) < dlum(deepTint(v, 0)) - 0.05),
      'the deep is darker than the shore in every sea — no uniform sheet to the horizon')
    ok(all.every((v) => dlum(deepTint(v, SEA_DEEP.mirror)) > dlum(deepTint(v, SEA_DEEP.deep)) &&
      dlum(deepTint(v, SEA_DEEP.mirror)) < dlum(deepTint(v, 0))),
      'the last band before the fog catches the sky back — brighter than the deep, dimmer than the shore')
    ok(all.every((v) => deepTint(v, 900).join(',') === deepTint(v, SEA_DEEP.mirror).join(',')),
      'past the mirror band the tint holds — the fog finishes the melt, not the law')
    // monotone darkening shore→deep, deterministic everywhere
    ok(all.every((v) => {
      let prev = dlum(deepTint(v, SEA_DEEP.coast))
      for (let d = SEA_DEEP.coast; d <= SEA_DEEP.deep; d += 5) {
        const L = dlum(deepTint(v, d))
        if (L > prev + 1e-9) return false
        prev = L
      }
      return true
    }), 'water deepens monotonically — same direction for every sea')
    ok(deepTint('stoneship', 123.5).join(',') === deepTint('stoneship', 123.5).join(',') &&
      deepTint('stoneship', 123.5).join(',') !== deepTint('selenitic', 123.5).join(','),
      'deepTint is deterministic per view — replayable, and no two Ages share a deep')
    // hue laws survive the whole ladder
    ok([0, 60, 300, 380, 900].every((d) => {
      const c = deepTint('dock', d); return c[0] > c[1] && c[1] > c[2]
    }), 'the dusk sea stays amber r > g > b from foam to fog — the sunset never washes out at distance')
    ok(['stoneship', 'stoneDeck', 'stoneObservatory'].every((v) => [0, 300, 380].every((d) => {
      const c = deepTint(v, d); return c[2] > c[1] && c[1] > c[0]
    })), 'the Atlantic stays teal all the way out — blue over green over red at every depth')
    ok(deepTint('selenitic', 300)[1] > deepTint('selenitic', 300)[0] &&
      deepTint('selenitic', 300)[1] > deepTint('selenitic', 300)[2],
      'Selenitic stays green-dominant in the deep — its haze owns the water at range too')
  }
  // far ground-swell: the deep heaves with long slow waves the shore never feels
  ok(farSwell(0, 30, 5.5, 'selenitic') === 0 && farSwell(40, 40, 2.2, 'stoneship') === 0,
    'inside the coast band the far swell is silent — foam and puzzle beds ride the near chop only')
  {
    const a = farSwell(340, 60, 7.5, 'stoneship'), b = farSwell(340, 60, 7.5, 'stoneship')
    ok(a === b && a !== farSwell(340, 60, 7.5 + 0.37, 'stoneship'),
      'farSwell is deterministic and alive — same instant same water, next instant different')
    const peak = (v) => {
      let mx = 0
      for (let t = 0; t < 14; t += 0.19) mx = Math.max(mx, Math.abs(farSwell(330, 40, t, v)))
      return mx
    }
    ok(peak('stoneship') <= SEA_VIEWS.stoneship.swell * FAR_GAIN * 1.01 && peak('stoneship') > SEA_VIEWS.stoneship.swell * 0.4,
      'the ground-swell is bounded by its Age and actually rolls out there', peak('stoneship').toFixed(3))
    ok(peak('stoneship') > peak('selenitic') && peak('selenitic') > peak('channelwood') && peak('channelwood') > 0,
      'the far swell is pitched by the Age — ocean rolls, Selenitic lifts, Channelwood barely breathes')
    // long wavelength: 12-unit steps barely move the ground-swell but chew the chop
    let fd = 0, nd = 0
    for (let t = 0; t < 14; t += 0.21) {
      fd += Math.abs(farSwell(340 + 12, 40, t, 'stoneship') - farSwell(340, 40, t, 'stoneship'))
      nd += Math.abs(seaSwell(340 + 12, -40, t, 'stoneship') - seaSwell(340, -40, t, 'stoneship'))
    }
    ok(fd < nd * 0.6, 'the deep wave is LONG — the ground-swell changes gently where the chop snaps', `${fd.toFixed(2)} vs ${nd.toFixed(2)}`)
    // deep total motion beats shore motion — an ocean heaves hardest away from land
    const deepMax = (v) => {
      let mx = 0
      for (let t = 0; t < 14; t += 0.17) mx = Math.max(mx, Math.abs(seaSwell(330, 0, t, v) + farSwell(330, 0, t, v)))
      return mx
    }
    const shoreMax = (v) => {
      let mx = 0
      for (let t = 0; t < 14; t += 0.17) mx = Math.max(mx, Math.abs(seaSwell(0, -30, t, v)))
      return mx
    }
    ok(deepMax('stoneship') > shoreMax('stoneship') + 0.1,
      'the water heaves harder in the deep than at the pier — the ocean is not one sea everywhere', `${deepMax('stoneship').toFixed(2)} vs ${shoreMax('stoneship').toFixed(2)}`)
  }
  // the scene actually mirrors depth and swells the far water through the pure law
  {
    const sc = readFileSync(SCENE, 'utf8')
    ok(/o\.material\.vertexColors = true/.test(sc) && /deepTint\(id, Math\.hypot\(base\[i \* 3\], base\[i \* 3 \+ 1\]\)\)/.test(sc) &&
      /setAttribute\('color', new THREE\.BufferAttribute\(col, 3\)\)/.test(sc),
      'dressSea paints the depth ladder onto the sea through sea.js — the gradient lives in the pure law')
    ok(/seaSwell\(base\[i \* 3\], -base\[i \* 3 \+ 1\], t, id\) \+ farSwell\(base\[i \* 3\], -base\[i \* 3 \+ 1\], t, id\)/.test(sc),
      'every heave adds the far ground-swell — near chop AND deep roll, through sea.js')
    ok(/SEA_DEEP\.mirror \* 2/.test(sc),
      'only horizon-sized seas take the ladder — the cave fall and Channelwood pools stay small water')
  }
}

console.log('MYST — the island wears real shores too (#838 item 3: sculpted ground under dock, path, beach, plateau)')
{
  // the four sea-worn island views are now sculpted ground; the landing sits
  // above the tree line and keeps no sea, no sculpt
  ok(Object.keys(ISLAND_GROUND).length === 4 && ['dock', 'cliffPath', 'beach', 'stairTop']
    .every((v) => ISLAND_GROUND[v] && SEA_VIEWS[v]),
  'the island\u2019s four sea views wear sculpted ground (dock, cliff path, beach, stair-top)')
  ok(!ISLAND_GROUND.landing && !SEA_VIEWS.landing,
    'the stairway landing sits above the tree line \u2014 no sea in view, no sculpt needed')
  // the camera's stand: level beds at exactly the pose height the node promises
  // (dock is the exception \u2014 the pier stands OVER the sea, so its foot is sea floor, not land)
  ok(ageHeight(0, 18, 'cliffPath') === ISLAND_GROUND.cliffPath.base &&
     ageHeight(-14, 18, 'beach') === ISLAND_GROUND.beach.base &&
     ageHeight(0, -10, 'stairTop') === ISLAND_GROUND.stairTop.base,
  'the path, the sand and the library plateau are carved exactly level under the player')
  ok(ISLAND_GROUND.cliffPath.base > ISLAND_GROUND.cliffPath.water &&
     ISLAND_GROUND.beach.base > ISLAND_GROUND.beach.water &&
     ISLAND_GROUND.stairTop.base > ISLAND_GROUND.stairTop.water,
  'every island bed is dry land \u2014 the dusk sea runs below the player\u2019s feet')
  const dockFoot = ageHeight(0, 28, 'dock')
  ok(dockFoot < ISLAND_GROUND.dock.water && dockFoot > ISLAND_GROUND.dock.base - ISLAND_GROUND.dock.drop,
    'the pier foot is open water over sea floor \u2014 the dock was always a pier, not a beach', dockFoot.toFixed(2))
  // the sculpt is real per view: a crest above the bed, a drop below its sea
  for (const view of ['dock', 'cliffPath', 'beach', 'stairTop']) {
    const v = ISLAND_GROUND[view]
    let mx = -1e9, mn = 1e9
    for (let x = -110; x <= 110; x += 3) for (let z = -110; z <= 110; z += 3) {
      const h = ageHeight(x, z, view); if (h > mx) mx = h; if (h < mn) mn = h
    }
    ok(mx > v.base + 0.5 && mn < v.water,
      `${view}: the sculpt is real \u2014 a crest above the bed, a drop below the sea`, `mx ${mx.toFixed(2)} / mn ${mn.toFixed(2)}`)
  }
  // sightline from the camera out over its own shore: the waterline is met
  // exactly once (a coast, not an ocean under the world), and the skirt ends
  // the shared dusk plane below it
  const SIGHT = { dock: [0, 28, 0, 1], cliffPath: [0, 18, 0, -1], beach: [-14, 18, 0, 1], stairTop: [0, -10, 0, -1] }
  for (const [view, [cx, cz, dx, dz]] of Object.entries(SIGHT)) {
    const v = ISLAND_GROUND[view]
    let cross = 0, prev = ageHeight(cx, cz, view)
    for (let d = 0.5; d <= 130; d += 0.5) {
      const h = ageHeight(cx + dx * d, cz + dz * d, view)
      if (prev >= v.water && h < v.water) cross++
      prev = h
    }
    ok(cross === 1, `${view}: the sightline meets the waterline exactly once (a coast)`, String(cross))
    ok(prev < v.water, `${view}: the skirt dips below the sea so the shared plane ends at the shore`, prev.toFixed(2))
  }
  // the dusk sea foams at these coasts like every Age's does
  const ISLE = ['dock', 'cliffPath', 'beach', 'stairTop']
  for (const v of ISLE) {
    const L = foamLine(v)
    ok(L.length >= 8, `${v}: its coast wears a foam line`, String(L.length))
    ok(L.every(([x, z, i]) => i > 0 && Math.abs(groundHeight(x, z, v) - SEA_VIEWS[v].water) < FOAM_BAND),
      `${v}: every puff hugs the waterline \u2014 foam only where land and sea agree`)
  }
  const isleSig = (v) => foamLine(v, 3, 20).map(([x, z]) => `${x},${z}`).join('|')
  ok(new Set(ISLE.map(isleSig)).size === ISLE.length, 'no two island shores share one foam line')
  // and the scene actually displaces them (no flat disc left on the shelf)
  {
    const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
    ok(ISLE.every((v) => new RegExp(`terrainField\\(g, TX\\.\\w+, '${v}'`).test(sc)),
      'every island shore displaces a heightfield in the scene (the rock props are ground now)')
  }
}

console.log('MYST — the horizon is not empty (#838 item 5: mirrored cloud banks + land on the skyline)')
{
  const allSea = Object.keys(SEA_VIEWS)
  // — the mirror lives past the deep, never on the shore
  ok(allSea.every((v) => cloudMirror(0, 30, 4.4, v) === 0 && cloudMirror(40, 120, 2.2, v) === 0 && cloudMirror(0, 379, 1.1, v) === 0),
    'the cloud mirror never touches shore water — the items 2/3 shoreline is untouched')
  ok(cloudMirror(500, 80, 7.7, 'mechanical') === 0 && cloudTint('mechanical') === null,
    'a dry Age mirrors nothing — Mechanical keeps its dry forge horizon')
  // — deterministic and alive
  ok(cloudMirror(500, 80, 7.7, 'stoneship') === cloudMirror(500, 80, 7.7, 'stoneship'),
    'cloudMirror is deterministic — same instant paints the same sky')
  ok(cloudMirror(500, 80, 7.7, 'stoneship') !== cloudMirror(500, 80, 13.1, 'stoneship'),
    'the mirrored banks drift — the Atlantic sky moves on the water')
  ok(cloudMirror(520, 60, 7.7, 'stoneship') !== cloudMirror(520, 60, 7.7, 'dock'),
    'no two seas wear one cloud at the same instant')
  // — broken clumps, not a flat varnish: at the horizon ring every sea shows
  // bright cotton and dark gaps between them
  {
    const ringVar = (v) => {
      let mn = 2, mx = -1
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const q = cloudMirror(Math.sin(a) * 520, Math.cos(a) * 520, 6.6, v)
        if (q < mn) mn = q
        if (q > mx) mx = q
      }
      return [mn, mx]
    }
    ok(allSea.every((v) => { const [mn, mx] = ringVar(v); return mx - mn > 0.08 && mx > 0.2 && mn < 0.12 }),
      'the mirror is broken cotton — bright clumps with dark gaps, never a uniform sheet',
      allSea.map((v) => ringVar(v).map((x) => x.toFixed(2)).join('..')).join(' '))
    ok(allSea.every((v) => {
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const q = cloudMirror(Math.sin(a) * 520, Math.cos(a) * 520, 6.6, v)
        if (q < 0 || q > 1) return false
      }
      return true }),
    'the mirror stays bounded 0..1 — cotton, not lightning')
  }
  // — the hue laws ride up the mirror: every bank keeps its sky
  ok(SKY_CLOUD.dusk[0] > SKY_CLOUD.dusk[1] && SKY_CLOUD.dusk[1] > SKY_CLOUD.dusk[2],
    'dusk banks take the sunset — rose over the amber sea')
  ok(SKY_CLOUD.stoneship[2] > SKY_CLOUD.stoneship[1],
    'the Atlantic banks run cool — silver-grey, not gold')
  ok(SKY_CLOUD.selenitic[1] > SKY_CLOUD.selenitic[0] && SKY_CLOUD.selenitic[1] > SKY_CLOUD.selenitic[2],
    'Selenitic banks stay green in the haze')
  ok(SKY_CLOUD.channelwood.every((c) => c >= 0.9),
    'Channelwood sits on its cloud floor — the brightest mirror of all')
  ok(cloudTint('dock') === SKY_CLOUD.dusk && cloudTint('stoneDeck') === SKY_CLOUD.stoneship &&
    cloudTint('selSound') === SKY_CLOUD.selenitic && cloudTint('chanWheel') === SKY_CLOUD.channelwood,
    'every sea view resolves to its sky\u2019s cloud colour through the pure law')
  // — land on the skyline
  ok(islesFor('selenitic').length === 0 && islesFor('selSound').length === 0,
    'Selenitic\u2019s horizon is its caldera dome — no neighbouring land stands before it')
  ok(islesFor('channelwood').length === 0 && islesFor('chanObs').length === 0,
    'Channelwood floats above the clouds — no coast on its skyline')
  ok(islesFor('mechanical').length === 0 && islesFor('towerTop').length === 0,
    'dry views keep a dry skyline')
  const bay = ['dock', 'cliffPath', 'beach', 'stairTop']
  for (const v of bay) {
    const L = islesFor(v)
    ok(L.length >= 2, `${v}: the dusk bay frames itself with Myst\u2019s own headlands`, String(L.length))
    ok(L.every((i) => i.h > 0 && i.w > i.h && Math.hypot(i.x, i.z) >= ISL_LIMIT.min && Math.hypot(i.x, i.z) <= ISL_LIMIT.far),
      `${v}: every headland breaks the horizon low and wide, inside the fog\u2019s reach — land, not a floating boulder`)
  }
  for (const v of ['stoneship', 'stoneDeck', 'stoneObservatory']) {
    ok(islesFor(v).length === 2, `${v}: two low islands ride the far Atlantic`, String(islesFor(v).length))
  }
  {
    const sig = (v) => JSON.stringify(islesFor(v))
    const withLand = allSea.filter((v) => bay.includes(v) || v.startsWith('stone'))
    ok(new Set(withLand.map(sig)).size === withLand.length,
      'no two sea views share one skyline — each pose turns its own world')
    ok(JSON.stringify(islesFor('dock')) === JSON.stringify(islesFor('dock')),
      'islesFor is deterministic — replayable silhouettes, hash-born not random')
  }
  // — the scene paints the sky and seats the land through the pure law
  {
    const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
    ok(/cloudMirror\(base\[i \* 3\], -base\[i \* 3 \+ 1\], t, id\)/.test(sc) && /cloudTint\(id\)/.test(sc),
      'dressSea drifts the mirrored banks across the deep through sea.js — the clouds live in the pure law')
    ok(/for \(const isl of islesFor\(id\)\)/.test(sc) && /isle\.scale\.set\(isl\.w \/ 2, isl\.h, isl\.w \/ 2\)/.test(sc),
      'the scene seats its skyline domes through sea.js — the law sizes them, not the builder')
    ok(/isl\.x, prof\.water, isl\.z/.test(sc),
      'every isle sits ON its view\u2019s waterline — land rising out of its own sea')
  }
}

console.log('MYST — the skyline carries landmarks (#838 item 6: the clock tower and the dome-crag, anchored)')
{
  const bay = ['dock', 'cliffPath', 'beach', 'stairTop']
  const kinds = (v) => landmarksFor(v).map((L) => L.kind).join(',')
  // — the dusk bay wears its two named landmarks
  ok(bay.every((v) => kinds(v) === 'clockTower,domeCrag'),
    'every dusk view carries the clock tower and the dome-crag', bay.map((v) => `${v}:${kinds(v)}`).join(' '))
  // — ANCHORAGE: a landmark keeps one seat across the island. The generic
  //   headlands are per-view hash texture; the tower is geography.
  {
    const seat = (v, kind) => JSON.stringify(landmarksFor(v).find((L) => L.kind === kind))
    ok(bay.every((v) => seat(v, 'clockTower') === seat('dock', 'clockTower')),
      'the clock tower stands in ONE place — every pose on the island sees it at the same bearing')
    ok(bay.every((v) => seat(v, 'domeCrag') === seat('dock', 'domeCrag')),
      'the dome-crag stands in ONE place — anchored geography, not per-view props')
    ok(seat('dock', 'clockTower') !== seat('dock', 'domeCrag'),
      'the two landmarks hold different seats (a ridge, not one blob)')
  }
  // — every landmark seat is inside the fog\u2019s reach and out of arm\u2019s way
  ok(bay.every((v) => landmarksFor(v).every((L) =>
    Math.hypot(L.x, L.z) >= ISL_LIMIT.min && Math.hypot(L.x, L.z) <= ISL_LIMIT.far && L.h > 0 && L.w > 0)),
    'every landmark rides inside the fog limit — faint but seen, never swallowed')
  // — shape laws: the tower is slim and taller than any headland; headlands
  //   stay wide and low. The two laws are inverses.
  ok(bay.every((v) => {
    const t = landmarksFor(v).find((L) => L.kind === 'clockTower')
    const widest = Math.max(...islesFor(v).map((i) => i.h))
    return t.w < t.h && t.h > widest
  }),
    'the clock tower is slim (w < h) and the tallest thing on the skyline — a landmark, not a headland')
  ok(bay.every((v) => islesFor(v).every((i) => i.w > i.h)),
    'generic headlands stay wide and low — the inverse of the tower law')
  // — hue laws: jade dome over basalt; warm dial; only the tower carries light
  {
    const crag = landmarksFor('beach').find((L) => L.kind === 'domeCrag')
    ok(crag.dome[1] > crag.dome[0] && crag.dome[1] > crag.dome[2],
      'the crag wears a jade dome — Selenitic seen from across the bay')
    ok(crag.body[0] < 0.3 && crag.body[1] < 0.3 && crag.body[2] < 0.3,
      'the crag body stays dark basalt in the dusk haze')
    ok(crag.glow === null, 'the crag carries no light — only the tower glows')
    const t = landmarksFor('beach').find((L) => L.kind === 'clockTower')
    ok(t.glow && t.glow[0] > t.glow[2] && t.glow[0] > 0.9,
      'the dial glows warm (r > b) — brass catching the last sun')
    ok(t.roof && t.roof[0] < t.body[0] && t.roof[1] < t.body[1],
      'the tower\u2019s cap is darker than its body — a weathered roof line')
  }
  // — landmarks never hide inside a generic headland
  ok(bay.every((v) => landmarksFor(v).every((L) =>
    islesFor(v).every((i) => Math.hypot(L.x - i.x, L.z - i.z) >= 40))),
    'no landmark stands hidden inside a headland — the skyline reads in layers')
  // — skies that keep their own horizon answer through the table itself
  ok((LANDMARK_LAW.stoneship || ['x']).length === 0,
    'the Atlantic keeps generic low islands — the empty stoneship row is the law saying so')
  ok(['stoneship', 'stoneDeck', 'stoneObservatory'].every((v) => landmarksFor(v).length === 0),
    'no landmark crowds Stoneship\u2019s far Atlantic')
  ok(['selenitic', 'selSound', 'channelwood', 'chanWheel', 'mechanical', 'towerTop'].every((v) => landmarksFor(v).length === 0),
    'Selenitic, Channelwood and the dry Ages keep their own horizons untouched')
  // — deterministic
  ok(JSON.stringify(landmarksFor('dock')) === JSON.stringify(landmarksFor('dock')),
    'landmarksFor is deterministic — anchored seats replay identically')
  // — the scene seats them through the pure law
  {
    const sc = readFileSync('src/games/Myst/scene.js', 'utf8')
    ok(/for \(const lm of landmarksFor\(id\)\)/.test(sc),
      'the scene seats its landmarks through sea.js — the law owns the skyline, not the builder')
    ok(/lm\.x, prof\.water \+ lm\.h \* 0\.41, lm\.z/.test(sc) && /lm\.x, prof\.water, lm\.z/.test(sc),
      'tower and crag rise out of their view\u2019s own waterline')
    ok(/side: THREE\.DoubleSide/.test(sc) && /dial\.material\.opacity = 0\.55/.test(sc),
      'the dial faces the player and breathes on the world clock')
    ok(/tower\.userData\.noPick = true/.test(sc) && /dial\.userData\.noPick = true/.test(sc),
      'landmarks are scenery, never hotspots')
  }
}

console.log('MYST — the dome carries home and the brothers (#838 item 7: the island optics, the portraits)')
{
  // — portrait bookkeeping is pure and rides the right book's pages
  let s = freshState()
  ok(JSON.stringify(portraitViews(s)) === JSON.stringify(portraitViews(s)), 'portraitViews is pure — same state, same paintings')
  ok(portraitViews(s).map((p) => `${p.who}:${p.placed}`).join(',') === 'sirrus:0,achenar:0', 'a fresh island hangs both portraits ragged')
  s.placed.red = 3; s.placed.blue = 1
  ok(portraitViews(s).map((p) => `${p.who}:${p.placed}`).join(',') === 'sirrus:3,achenar:1', 'the paintings count pages returned to their own book')
  s.placed.red = 9
  ok(portraitViews(s)[0].placed === 4, 'a portrait never promises more than four')

  // — the painters: recorder ctx, same law as the #1024 lenses
  function recCtx() {
    const ops = []
    const num = (x) => (typeof x === 'number' ? x.toFixed(3) : String(x))
    const grad = { addColorStop: (...a) => ops.push('stop:' + a.map(num).join(',')) }
    const ctx = { ops }
    for (const m of ['save', 'restore', 'clip', 'beginPath', 'fill', 'stroke', 'closePath', 'fillRect', 'clearRect', 'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'translate', 'rotate']) ctx[m] = (...a) => ops.push(m + ':' + a.map(num).join(','))
    ctx.createLinearGradient = (...a) => { ops.push('lin:' + a.map(num).join(',')); return grad }
    ctx.createRadialGradient = (...a) => { ops.push('rad:' + a.map(num).join(',')); return grad }
    for (const p of ['fillStyle', 'strokeStyle']) {
      let v = ''
      Object.defineProperty(ctx, p, { get: () => v, set: (x) => { v = x; ops.push(p + ':' + x) } })
    }
    ctx.lineWidth = 0
    return ctx
  }
  const runV = (age, t, un) => { const c = recCtx(); drawVision(c, age, t, un, 152, 114); return c.ops.join('|') }
  const runP = (book, t, p) => { const c = recCtx(); drawPortrait(c, book, t, p, 76, 114); return c.ops.join('|') }

  // — the home optic: live, clocked, and wearing the island\u2019s own landmark laws
  ok(runV('myst', 1, true).includes('clip:'), 'the island looks through glass like the other lenses')
  ok(runV('myst', 1, true) === runV('myst', 1, true), 'the island lens paints the same picture at the same instant')
  ok(runV('myst', 1, true) !== runV('myst', 9.25, true), 'the island lens answers to the world clock')
  ok(runV('myst', 2, true) !== runV('myst', 2, false), 'the home optic is never the sealed churn — you stand on it')
  for (const age of ['selenitic', 'stoneship', 'mechanical', 'channelwood']) {
    ok(runV('myst', 1, true) !== runV(age, 1, true), `the island wears its own dusk, not ${age}`)
  }
  ok(runV('myst', 1, true).includes('255,176,90'), 'the clock tower wears the warm dial (r > b — brass catching dusk)')
  ok(runV('myst', 1, true).includes('110,220,150'), 'across the bay the dome-crag wears its jade (sea.js\u2019s landmark law, one hue)')

  // — the portraits: deterministic ruin, healing tears, trap-colour palettes
  ok(runP('red', 1, 0) === runP('red', 1, 0), 'a portrait is deterministic — same instant, the same ruin')
  ok(runP('red', 1, 0) !== runP('red', 9.25, 0), 'the static crawls — the ruin answers to the clock')
  ok(runP('red', 1, 0) !== runP('blue', 1, 0), 'the brothers do not share a face (crimson is not cobalt)')
  ok(runP('red', 1, 2).includes('255,62,54'), 'Sirrus wears his trap crimson (the link.js law, one source)')
  ok(runP('blue', 1, 2).includes('70,106,255'), 'Achenar wears his trap cobalt (the link.js law, one source)')
  const tears = (book, p) => runP(book, 1, p).split('|').filter((o) => o.startsWith('fillRect:')).length - 2 // minus sky + glass
  ok(tears('red', 0) === PORTRAIT_TEAR0, `ragged at 0/4 — ${PORTRAIT_TEAR0} tears in Sirrus\u2019s face`)
  for (let p = 1; p <= 4; p++) ok(tears('red', p) === tears('red', p - 1) - 2, `every page home heals exactly two tears (${p}/4)`)
  ok(tears('blue', 0) === PORTRAIT_TEAR0 && tears('blue', 4) === 0, 'the blue ruin follows the same law')
  ok(runP('red', 1, 4).includes('230,220,210'), 'at 4/4 the face resolves — calm and pale')
  for (const p of [0, 1, 2, 3]) ok(!runP('red', 1, p).includes('230,220,210'), `below four pages the face stays ruined (${p}/4)`)
  ok(runP('red', 1, 4) !== runP('red', 1, 3), 'the resolved portrait is another picture than the wounded one')
  ok(plan('thaw:myst').length === 0, 'the home optic never sings a thaw — it was never frozen')

  // — the shell hangs them
  const srcJX = readFileSync('src/games/Myst/index.jsx', 'utf8')
  const srcVI = readFileSync('src/games/Myst/visions.js', 'utf8')
  ok(/data-vision="myst"/.test(srcJX), 'the dome hangs its island pane')
  ok(/data-portrait=\{pv\.book\}/.test(srcJX), 'the dome hangs both portraits')
  ok(/drawPortrait\(cv\.getContext/.test(srcJX), 'the loop paints the portraits while the sphere is open')
  ok(/SCENES = \{ selenitic, stoneship, mechanical, channelwood, myst \}/.test(srcVI), 'the island painter is registered beside the Ages')
}

console.log('MYST — the storm strikes live (#838 item 8: the Age lights at once, thunder answers after)')
{
  // — the envelope: deterministic, bounded, a decaying double strike
  ok(stormFlash(3.1, 'selenitic') === stormFlash(3.1, 'selenitic'), 'the flash is deterministic — same instant, same light')
  ok(stormFlash(0, 'selenitic') === 1, 'the strike begins at full brightness')
  ok(stormFlash(STORM.width, 'selenitic') === 0, 'the main stroke dies at STORM.width')
  ok(stormFlash(STORM.period, 'selenitic') === stormFlash(0, 'selenitic'), 'the storm keeps its 6.4 s clock')
  let bounded = true, mainDecay = true
  for (let k = 0; k <= 6.4 * 120; k++) {
    const f = stormFlash(k / 120, 'selenitic')
    if (!(f >= 0 && f <= 1)) bounded = false
    const x = k / 120, xn = (k + 1) / 120
    if (x > STORM.bounce + STORM.bounceWidth && xn < STORM.width && f < stormFlash(xn, 'selenitic')) mainDecay = false
  }
  ok(bounded, 'the flash never overexposes — the envelope stays in 0..1')
  ok(mainDecay, 'after the bounce the sky decays monotonically to the dark')
  ok(stormFlash(0.07, 'selenitic') === 1, 'the second strike lifts the mid-decay sky back to full')
  ok(stormFlash(0.075, 'selenitic') > 1 - 0.075 / STORM.width, 'the bounce really brightens past the main decay (a double strike, not one)')
  ok(stormFlash(0.07 + STORM.bounceWidth + 0.01, 'selenitic') < stormFlash(0.07, 'selenitic'), 'the bounce is weaker than the main stroke')

  // — one storm, one clock: the world strikes exactly when the Spectator lens
  //   paints its flash (visions.js: t % 6.4 < 0.16)
  let sameClock = true
  for (let k = 0; k <= 64 * 120; k++) {
    const t = k / 120
    const lit = stormFlash(t, 'selenitic') > 0
    const lens = (t % 6.4) < 0.16
    if (lit !== lens) { sameClock = false; break }
  }
  ok(sameClock, 'the world flashes when the lens flashes — the pane and the Age share one storm')

  // — the storm belongs to Selenitic alone: every sel node, and nothing else
  const selNodes = Object.keys(NODES).filter((v) => v === 'selenitic' || v.startsWith('sel'))
  ok(selNodes.join(',') === STORM_VIEWS.join(','), 'every Selenitic view stands under the storm — and only they do')
  ok(STORM_VIEWS.every((v) => stormView(v)), 'the storm table knows its own views')
  let sky
  for (const v of ['dock', 'cliffPath', 'beach', 'stairTop', 'landing', 'mechanical', 'chanWheel', 'stoneDeck', 'towerTop']) {
    sky = stormFlash(0.02, v)
    ok(sky === 0, `${v} never flickers — the rest of the world keeps its sky`)
  }
  let atOnce = true
  for (const v of STORM_VIEWS) if (stormFlash(0.02, v) !== stormFlash(0.02, 'selenitic')) atOnce = false
  ok(atOnce, 'the whole Age lights at once — one sky over the caldera, not five')

  // — the gains ride the envelope
  ok(skyGain(0, 'selenitic') === 1.8 && seaGain(0, 'selenitic') === 0.5, 'at full strike the sky drives hardest, the sea mirrors softer')
  ok(skyGain(2.5, 'selenitic') === stormFlash(2.5, 'selenitic') * 1.8 && seaGain(2.5, 'selenitic') === stormFlash(2.5, 'selenitic') * 0.5, 'sky and sea gain ride the same envelope')
  ok(skyGain(0.02, 'dock') === 0 && seaGain(0.02, 'dock') === 0, 'a dry sky outside the storm keeps its gains at zero')

  // — thunder: it speaks, it is not a swell, and it arrives AFTER the light
  const th = plan('thunder')
  ok(th.length === 3 && JSON.stringify(th) === JSON.stringify(thunderCues()), 'thunder speaks the plan — crack, rumble, low stone moan')
  ok(th.some((c) => c.type === 'noise'), 'the crack is raw — the strike itself, not filtered wash')
  const swellAll = Object.keys(SEA_VIEWS).flatMap((v) => swellCues(v))
  ok(!swellAll.some((c) => c.type === 'noise'), 'no swell on any sea has a crack — thunder is never mistaken for surf')
  ok(Math.max(...th.map((c) => c.vol)) > Math.max(...swellAll.map((c) => c.vol)), 'the storm is closer than any surf — thunder out-scores every swell')
  ok(th.some((c) => c.type === 'fnoise' && c.freq < 220), 'the rumble sits under the sea\u2019s 220 Hz wash — an octave deeper, rock not water')
  ok(STORM.rumbleDelay > 1, 'thunder answers the flash with real distance — sound after light, never with it')

  // — the shell drives it: sky, sun, fog, and thunder off the sim clock
  const srcSC = readFileSync('src/games/Myst/scene.js', 'utf8')
  const srcJX = readFileSync('src/games/Myst/index.jsx', 'utf8')
  ok(/dressStorm\(g, id, anim\)/.test(srcSC), 'every view asks the storm (and gets nothing unless it is Selenitic)')
  ok(/if \(!stormView\(id\)\) return/.test(srcSC), 'dressStorm returns early for the calm Ages')
  ok(/1 \+ g \* STORM\.color\[0\]/.test(srcSC), 'the flash drives the sky dome past white (tone-mapped light, not an overlay)')
  ok(/s\.material\.emissive\.setRGB\(e \* STORM\.color\[0\]/.test(srcSC), 'the sea catches the strike in its emissive')
  ok(/sunBaseI \+ fl \* 2\.4/.test(srcJX), 'the sun lifts past its Age value under the flash')
  ok(/scene\.fog\.color\.copy\(fogBase\)\.lerp\(STORM_COL/.test(srcJX), 'the haze goes jade with the strike')
  ok(/sun\.intensity = sunBaseI\s*\n\s*scene\.fog\.color\.copy\(fogBase\)/.test(srcJX), 'the calm between strikes returns the atmosphere exactly')
  ok(/stormAt = wt \+ STORM\.rumbleDelay/.test(srcJX), 'thunder waits on the sim clock, never a setTimeout')
  ok(/if \(stormAt && wt >= stormAt\) \{ stormAt = 0; sfx\('thunder'\) \}/.test(srcJX), 'when its moment comes the storm rings')
}

console.log('MYST — the gear gallery (#838 item 9: five slots, four carried, one carved in)')
{
  // — the table: five slots, five distinct sigils, five distinct seat weights,
  // and exactly one slot the hand can never move.
  ok(GEARS.length === GEAR_SLOTS && GEAR_KEYS.length === 5, 'the wall wears five slots')
  ok(new Set(GEARS.map((g) => g.sigil)).size === 5, 'every slot is stamped with its own sigil')
  ok(GEARS.filter((g) => g.fixed).length === 1 && GEARS[GEARS.length - 1].key === 'myst', 'exactly one slot is carved in, and it is MYST\'s own')
  ok(SEAT_TONES.length === GEAR_SLOTS && SEAT_TONES.every((f, i) => i === 0 || f > SEAT_TONES[i - 1]), 'five seat weights, deepest first — the wall is five keys')
  ok(GEAR_KEYS.every((k, i) => seatWeight(k) === SEAT_TONES[i]), 'each gear drops to its own depth')
  const seatA = plan('gearSeat:selenitic'), seatB = plan('gearSeat:myst')
  ok(seatA.length > 0 && JSON.stringify(seatA) !== JSON.stringify(seatB), 'two seats answer apart — Selenitic\'s slot is not the island\'s')
  ok(plan('gearSeat:nonsense').length === 0, 'an unknown key is silent (never a fallback clank)')

  // — the wall's arithmetic: it starts at one, counts the fixed slot, and only
  // five opens the niche.
  let s = freshState(7)
  ok(seatedCount(s) === 1 && !galleryOpen(s), 'the wall starts with only the island\'s own gear riding it')
  ok(GEAR_KEYS.every((k) => !gearHeld(s, k)), 'a fresh explorer carries no brass')
  let r = dispatch(s, { t: 'seat', key: 'selenitic' })
  ok(r.events.includes('blocked') && !r.state.gearsSeated.selenitic, 'an empty slot refuses an empty hand')
  r = dispatch(s, { t: 'seat', key: 'myst' })
  ok(r.events.includes('blocked') && !galleryOpen(r.state), 'MYST\'s own gear is refused — the island keeps its own time')
  ok(/will not come/.test(r.state.message) && /one casting/.test(r.state.message),
    'refused with the law\'s own words, not the empty-slot shrug (the fixed branch speaks)')
  // The pull, from a wall that records its own gear seated: what holds the fifth
  // is the fixed law, not the empty hand — so seed the seat map as the carved
  // row reads it and pull. An unguarded lift branch answers with `gearLift`.
  const pull = dispatch({ ...s, gearsSeated: { ...s.gearsSeated, myst: true } }, { t: 'seat', key: 'myst' })
  ok(pull.events.includes('blocked') && !pull.events.includes('gearLift'),
    'pulled where the wall itself seats it, the island gear still refuses to come loose')
  s = { ...s, flags: { ...s.flags, gearSelenitic: true } }
  r = dispatch(s, { t: 'seat', key: 'selenitic' }); s = r.state
  ok(r.events.includes('gearSeat:selenitic') && gearSeated(s, 'selenitic') && seatedCount(s) === 2, 'a carried gear drops into its own slot')
  r = dispatch(s, { t: 'seat', key: 'selenitic' }); s = r.state
  ok(r.events.includes('gearLift') && !gearSeated(s, 'selenitic') && seatedCount(s) === 1, 'and lifts back out — the wall is not a one-way mouth')

  // — four of five keeps the seal; the fifth lands it home.
  s = freshState(7)
  s = { ...s, flags: { ...s.flags, gearSelenitic: true, gearChannelwood: true, gearStoneship: true } }
  for (const k of ['selenitic', 'channelwood', 'stoneship']) s = dispatch(s, { t: 'seat', key: k }).state
  ok(seatedCount(s) === 4 && !galleryOpen(s) && !s.flags.nicheOpen, 'four of five keeps the niche shut')
  s = { ...s, flags: { ...s.flags, gearMechanical: true } }
  r = dispatch(s, { t: 'seat', key: 'mechanical' }); s = r.state
  ok(r.events.includes('nicheOpen') && s.flags.nicheOpen && galleryOpen(s), 'the fifth gear home grinds the seal aside')
  ok(dispatch(s, { t: 'seat', key: 'myst' }).events.includes('blocked'), 'even with the niche open the island\'s gear stays put')

  // — where the two new gears hang: the ridge chart pins the dome gear, the
  // switch chain holds the tower lid.
  let s2 = { ...freshState(7), node: 'stoneObservatory' }
  let r2 = dispatch(s2, { t: 'click', id: 'gearShip' })
  ok(r2.events.includes('blocked') && !r2.state.flags.gearStoneship, 'the dome gear is pinned under its keeper plate until the chart is read')
  s2 = dispatch(s2, { t: 'click', id: 'observatory' }).state
  r2 = dispatch(s2, { t: 'click', id: 'gearShip' }); s2 = r2.state
  ok(s2.flags.gearStoneship && r2.events.includes('gearTake'), 'the note names the plate, and the gear comes off the axle')
  ok(dispatch(s2, { t: 'click', id: 'gearShip' }).events.length === 0, 'the axle gives up its gear once, not twice')
  let s3 = { ...freshState(7), node: 'mechWalk' }
  ok(dispatch(s3, { t: 'click', id: 'gearLid' }).events.includes('blocked'), 'the steel lid holds until the switch chain solves')
  s3 = dispatch(s3, { t: 'toggle', i: 0 }).state
  s3 = dispatch(s3, { t: 'toggle', i: 3 }).state
  ok(s3.switches.every((v) => v === 1) && s3.flags.switchPanel, 'the five switches stand lit')
  r2 = dispatch(s3, { t: 'click', id: 'gearLid' }); s3 = r2.state
  ok(s3.flags.gearMechanical && r2.events.includes('gearTake'), 'the lid the switches unsealed hands over the tower\'s own gear')

  // — the fifth is a law, not a grind: no route, canonical or otherwise, ever
  // takes the island's gear or opens the niche on the way to Atrus.
  const won = runSolver()
  ok(!won.flags.gearMyst, 'no route takes MYST\'s gear (the fifth never enters a hand)')
  ok(!won.flags.nicheOpen, 'the canonical win walk leaves the niche shut — the gallery is a secret, not a gate')

  // — the wall in the world: spots, gates, panel, and the book inside.
  ok(NODES.mechWalk.spots.some((sp) => sp.id === 'gearWall' && sp.act === 'gearWall'), 'the bronze wall stands at the tower base')
  ok(NODES.stoneObservatory.spots.some((sp) => sp.act === 'takeGearShip' && sp.need === 'obsNote'), 'the dome gear is keyed to the chart')
  ok(NODES.mechWalk.spots.some((sp) => sp.act === 'takeGearMech' && sp.need === 'switchPanel'), 'the tower lid is keyed to the switches')
  ok(NODES.mechWalk.spots.some((sp) => sp.act === 'nicheBook' && sp.need === 'nicheOpen'), 'the niche is keyed to all five')
  let s4 = { ...freshState(7), node: 'mechWalk' }
  let r4 = dispatch(s4, { t: 'click', id: 'gearWall' })
  ok(r4.state.panelOpen === 'gears' && r4.events.includes('panel'), 'the wall opens its panel')
  const rows = gearRows(r4.state)
  ok(rows.length === GEAR_SLOTS && rows[GEARS.length - 1].fixed && rows[GEARS.length - 1].seated, 'the panel shows five rows and the island\'s sits carved in from the start')
  ok(rows.some((x) => x.key === 'selenitic' && !x.seated && !x.held), 'and says plainly which slots stand empty')
  const open = { ...freshState(7), node: 'mechWalk', flags: { ...freshState(7).flags, nicheOpen: true } }
  const rd = dispatch(open, { t: 'click', id: 'nicheBook' })
  ok(rd.events.includes('nicheRead') && rd.state.flags.nicheRead && /does not fold/.test(rd.state.message), 'the sealed book of MYST opens — and the island does not fold: you cannot link to where you stand')
  ok(plan('nicheOpen').length >= 3 && plan('nicheOpen').some((c) => c.type === 'sweep'), 'the seal grinds with a voice of its own')
  ok(JSON.stringify(plan('gearLift')) !== JSON.stringify(plan('gearSeat:selenitic')), 'a gear lifted out is not a gear dropping in')
}

console.log('MYST — the ambience wears the Age (#838 item 10: a voice per view, distinct across the Ages)')
{
  // — every node's ambience kind resolves to a real voice
  const AMB_KINDS = [...new Set(Object.values(NODES).map((n) => n.amb))]
  ok(AMB_KINDS.length === 9, 'the island graph uses nine distinct ambience kinds', AMB_KINDS.sort().join(','))
  ok(Object.entries(NODES).every(([v, n]) => ambCues(n.amb, v).length > 0),
    'every node\'s ambience kind actually schedules a voice')
  ok(AMB_KINDS.every((k) => ambCues(k, 'dock').length > 0), 'each ambience kind resolves at a real view')
  ok(ambCues('nonsense', 'dock').length === 0 && ambCues('', 'dock').length === 0,
    'an unknown ambience kind is silent (never a fallback hum)')
  // — the seven sky families each tune the voice apart: seven distinct pitches
  ok(new Set(Object.values(SKY_TUNE).map((t) => t.pitch)).size === Object.keys(SKY_TUNE).length,
    'no two Ages share a pitch — every sky bends the voice its own way')
  ok(new Set(Object.values(SKY_TUNE).map((t) => t.pitch)).size === Object.keys(SKY_TUNE).length,
    'no two Ages share a pitch — every sky bends the voice its own way')
  ok(Object.values(SKY_TUNE).every((t) => t.pitch > 0.5 && t.pitch < 1.5 && t.gain > 0 && t.gain <= 1.2),
    'every sky stays in a sane tuning range — a voice a player can actually hear')
  // — distinct kinds never collapse into one another at the same view
  {
    const sig = (k) => JSON.stringify(ambCues(k, 'dock'))
    ok(new Set(AMB_KINDS.map(sig)).size === AMB_KINDS.length, 'no two ambience kinds sound alike', AMB_KINDS.map(sig).join(' '))
  }
  // — the SAME kind reads apart across the Ages: wind on six skies, six voices
  {
    const WIND = ['cliffPath', 'landing', 'selThrone', 'stoneObservatory', 'chanWheel', 'cabin']
    ok(new Set(WIND.map((v) => JSON.stringify(ambCues('wind', v)))).size === WIND.length,
      'wind is one voice on six skies and six voices apart — the wind wears the Age',
      WIND.map((v) => `${v}:${NODES[v].sky}`).join(' '))
    const SEA = ['dock', 'beach', 'stoneship', 'stoneDeck']
    ok(ambCues('sea', 'dock') !== null && JSON.stringify(ambCues('sea', 'dock')) !== JSON.stringify(ambCues('sea', 'stoneship')),
      'the dusk wash is not the Atlantic surge — the sea\'s own voice wears the Age too')
    // Selenitic's wind carries the caldera moan no other Age has
    ok(ambCues('wind', 'selThrone').length === ambCues('wind', 'cliffPath').length + 1,
      'the green caldera throws the wind back — Selenitic wind has the moan, the bay does not')
    // each stone chamber drips at its own pitch, never two alike
    const DRIP = ['library', 'cave', 'rocketSilo']
    ok(new Set(DRIP.map((v) => JSON.stringify(ambCues('drip', v)))).size === DRIP.length,
      'no two chambers fall the same drop — the drip is per-view')
  }
  // — determinism and the view still reaching the law through plan()
  ok(JSON.stringify(ambCues('wind', 'selThrone')) === JSON.stringify(ambCues('wind', 'selThrone')),
    'ambCues is deterministic — the same view sings the same voice every time')
  ok(JSON.stringify(plan('amb:wind:dock')) === JSON.stringify(ambCues('wind', 'dock')),
    'plan() routes amb: events through the pure law')
  ok(plan('amb:nonsense:dock').length === 0, 'an unknown kind is silent through the event bus too')
  // — the browser layer dispatches through the law and keeps threading the view
  {
    const sd = readFileSync('src/games/Myst/sound.js', 'utf8')
    ok(/amb:\$\{kind\}:\$\{view\}/.test(sd), 'the ambience layer routes each view through the pure law')
    ok(!/const AMB = \{/.test(sd), 'the old un-provable AMB table is gone (voices live in soundplan.js)')
  }
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
  console.log('MYST — mutants (each MUST die)')
  const MF = 'src/games/Myst/attract.js'
  const JX = 'src/games/Myst/index.jsx'
  const SP = 'src/games/Myst/soundplan.js'
  const ST = 'src/games/Myst/state.js'
  const ND = 'src/games/Myst/nodes.js'
  const CD = 'src/games/Myst/codes.js'
  const VI = 'src/games/Myst/visions.js'
  const GG = 'src/games/Myst/gears.js'
  const TR = 'src/games/Myst/terrain.js'
  const LK = 'src/games/Myst/link.js'
  const SEA = 'src/games/Myst/sea.js'
  const SD = 'src/games/Myst/sound.js'
  const MUTANTS = [
    ['every sea wears Myst again (the island turns Selenitic green)', SEA,
      'dock:             { water: 0,    color: [0.98, 0.80, 0.60], swell: 0.16',
      'dock:             { water: 0,    color: [0.52, 0.90, 0.62], swell: 0.16'],
    ['the Stoneship ocean flattens to a millpond', SEA,
      'stoneship:        { water: -0.3, color: [0.48, 0.84, 0.98], swell: 0.55',
      'stoneship:        { water: -0.3, color: [0.48, 0.84, 0.98], swell: 0.06'],
    ['Channelwood glass grows an ocean swell', SEA,
      'channelwood:      { water: -0.3, color: [0.42, 0.74, 0.70], swell: 0.06',
      'channelwood:      { water: -0.3, color: [0.42, 0.74, 0.70], swell: 0.55'],
    ['the swell freezes — water that never moves', SEA,
      'return s * (', 'return 0 * ('],
    ['foam forgets the sculpt (dry pads wear waterlines)', SEA,
      'if (nearRaw >= FOAM_BAND) return 0', 'if (nearRaw >= Infinity) return 0'],
    ['the deep forgets to darken (ocean stays shore-coloured to the fog)', SEA,
      'export const DEEP_DARK = 0.55', 'export const DEEP_DARK = 1'],
    ['the mirror band sinks (horizon darker than the deep)', SEA,
      'export const MIRROR_LIFT = 0.72', 'export const MIRROR_LIFT = 0.4'],
    ['the ground-swell dies (deep ocean flat as a millpond)', SEA,
      'export const FAR_GAIN = 0.9', 'export const FAR_GAIN = 0'],
    ['far swell is transplanted chop (short waves where the deep should roll)', SEA,
      '0.65 * Math.sin(x * 0.009 + z * 0.004 + t * 0.33)', '0.65 * Math.sin(x * 0.05 + z * 0.04 + t * 3.3)'],
    ['ground-swell floods the shore (the foam band heaves with the deep)', SEA,
      'if (r <= coast) return 0', 'if (r <= -1) return 0'],
    ['the scene stops mirroring depth (one uniform sheet again)', 'src/games/Myst/scene.js',
      'o.material.vertexColors = true', 'o.material.vertexColors = false'],
    ['the scene stops dressing its seas (one blue plane everywhere)', 'src/games/Myst/scene.js',
      'dressSea(g, id, anim)', 'void 0'],
    ['the dome has no coast (skirt sits at water level)', TR,
      'seabed: -3.5', 'seabed: 0'],
    ['the sculpt swallows the landing pad (no flat carve)', TR,
      `export const SEL_FLATS = {
  selenitic: [{ x0: -55, x1: 55, z0: -55, z1: 55, soft: 30 }],
  selSound: [{ x0: -7, x1: 7, z0: -46, z1: -25, soft: 6 }],
}`,
      'export const SEL_FLATS = {}'],
    ['Selenitic is flat again (crest sinks below the rings)', TR,
      `selenitic: { x: 0, z: 95, h: 14 }`,
      `selenitic: { x: 0, z: 95, h: 1 }`],
    ['the two views share one crest (no per-pose sculpt)', TR,
      `selSound: { x: 0, z: 0, h: 9 }`,
      `selSound: { x: 0, z: 95, h: 14 }`],
    ['attract never cycles (one message)', MF,
      `    'CYAN · 1993 · REBUILT IN CODE',\n    'Living books · two imprisoned brothers',\n    'Four Ages hidden in plain sight',\n    'No map. No hints. Take notes, as in 1993.',\n    'Click what you see · arrows step and turn',\n`,
      `    'CLICK TO START',\n`],
    ['a message repeats', MF,
      `    'Four Ages hidden in plain sight',`,
      `    'Living books · two imprisoned brothers',`],
    ['a harness script name leaks into an attract line', MF,
      `    'Four Ages hidden in plain sight',`,
      `    'scripts/mystcheck.mjs audits, live',`],
    ['attract stacks lore paragraphs', JX,
      `          <AttractMessage className="mb-8 text-amber-200/70 max-w-xl tracking-wide" messages={MESSAGES} />`,
      `          <p className="text-amber-200/70">A library of living books</p>\n          <p className="text-amber-300">No map, no hints</p>`],
    ['attract drops the cycling helper', JX,
      `          <AttractMessage className="mb-8 text-amber-200/70 max-w-xl tracking-wide" messages={MESSAGES} />`,
      `          <p className="text-amber-200/70">A library of living books</p>`],
    ['the press prompt is hard-coded, not from the module', JX,
      `<p className="text-lg animate-pulse text-amber-300">{PRESS}</p>`,
      `<p className="text-lg animate-pulse text-amber-300">CLICK</p>`],
    ['linking-book whoosh collapses into a plain travel', SP,
      `  if (typeof ev === 'string' && ev.startsWith('link:')) {`,
      `  if (false) {`],
    ['the posts go silent when the sphere opens', SP,
      `  if (typeof ev === 'string' && ev.startsWith('sing:')) {`,
      `  if (false) {`],
    ['the page-turn cue vanishes', SP,
      `    case 'page': P.push({ type: 'fnoise', dur: 0.16, vol: 0.08, freq: 1400 }); break`,
      `    case 'page': break`],
    ['state stops firing the sphere sing', ST,
      "ev.push('panel', `sing:${s.codes.sphere.join('')}`); break",
      `ev.push('panel'); break`],
    ['a book opening stops turning its page', ST,
      `ev.push('page', 'bookVoice')`,
      `ev.push('bookVoice')`],
    ['the cage stops jamming the door slot', ST,
      `if (!s.flags.mechCarDown) { s.message = 'The release button sinks and clicks — but the bronze cage is jammed in the door slot. Nothing moves but the cage.'; ev.push('blocked'); break }`,
      `if (false) { s.message = ''; ev.push('blocked'); break }`],
    ['the control-room door stops shutting behind you', ST,
      `s.flags.mechDoorOpen = false; s.flags.mechPlateD = false; s.flags.mechPlateE = false; s.flags.mechLatchD = false; s.flags.mechLatchE = false`,
      `s.flags.mechPlateD = false; s.flags.mechPlateE = false; s.flags.mechLatchD = false; s.flags.mechLatchE = false`],
    ['an un-latched plate stops releasing the door', ST,
      `else { if (!s.flags.mechLatchD) s.flags.mechDoorOpen = false; s.message = s.flags.mechLatchD`,
      `else { s.flags.mechDoorOpen = false; s.message = s.flags.mechLatchD`],
    ['the sounding path accepts any stone in any order', ST,
      `      if (i === s.selStone) {`,
      `      if (true) {`],
    ['the last stone stops opening the gate', ST,
      `          s.flags.selPath = true`,
      `          s.flags.selPathUnset = true`],
    ['the throne aligns at every detent', ST,
      `      if (s.selChair === SUN_MOON && !has(s, 'selAlign')) {`,
      `      if (true) {`],
    ['the mountain door stops needing the alignment', ND,
      `to: 'selGate', need: 'selAlign', needMsg:`,
      `to: 'selGate', needMsg:`],
    ['the gear slot keeps giving gears', ST,
      `      if (has(s, 'gearSelenitic')) return { state: s, events: [] }`,
      `      if (false) return { state: s, events: [] }`],
    ['the six stones collapse to one pitch', SP,
      `export const STONE_TONES = [110, 131, 147, 165, 196, 220]`,
      `export const STONE_TONES = [110, 110, 110, 110, 110, 110]`],
    ['the wrong-stone buzz goes silent', SP,
      `    case 'buzz': P.push(`,
      `    case 'buzzz': P.push(`],
    ['the flood gate stops needing the sluice', ND,
      `to: 'chanWheel', need: 'chanFlood', needMsg:`,
      `to: 'chanWheel', needMsg:`],
    ['the rock stair stops reaching the observatory', ND,
      `to: 'stoneObservatory'`,
      `to: 'stoneDeck'`],
    ['the observatory stops recording the note', ST,
      `if (!has(s, 'obsNote')) {`,
      `if (false) {`],
    ['every save stamps the same island (seed ignored)', CD,
      `  const rnd = mulberry32(seed >>> 0)`,
      `  const rnd = mulberry32(0)`],
    ['the Amatem note stops opening the seam', ND,
      `reveal: 'rocketSeen', need: 'obsNote', needMsg:`,
      `reveal: 'rocketSeen', needMsg:`],
    ['the ride never reaches the surface', ST,
      `s.ride = 'landed'; s.rideT = 0; s.ending = 'surface'`,
      `s.ride = 'landed'; s.rideT = 0`],
    ['the ride accepts steering (inputs not refused mid-flight)', ST,
      `if (a.t !== 'tick') return { state: st, events: [] }`,
      `if (false) return { state: st, events: [] }`],
    ['every sound-book page echoes the same stone', ST,
      "ev.push(`stone:${i}`)\n      break",
      `ev.push('stone:0')\n      break`],
    ['the notebook is ignored on return (island re-rolls each reload)', CD,
      `  const saved = loadSeed()`,
      `  const saved = null`],
    ['the seed never reaches the notebook', CD,
      `globalThis.localStorage.setItem(SEED_KEY, String(seed >>> 0))`,
      `void seed`],
    ['the dome stars collapse to one silhouette', ST,
      `export const STAR_SHAPES = [4, 5, 6, 5]`,
      `export const STAR_SHAPES = [5, 5, 5, 5]`],
    ['ring ticks stop carrying the post tone', SP,
      'return plan(`sing:${orderStr}`).map((c, i) => ({ ring: i, tone: order[i], at: c.delay || 0 }))',
      'return plan(`sing:${orderStr}`).map((c, i) => ({ ring: i, tone: 0, at: c.delay || 0 }))'],
    ['the star-wheel bites at every detent', ST,
      `if (s.wheel === WHEEL_BITE && !has(s, 'wheelBite')) {`,
      `if (!has(s, 'wheelBite')) {`],
    ['the wheel free-spins past its spokes', ST,
      `s.wheel = (s.wheel + 1) % WHEEL_SPOKES`,
      `s.wheel = WHEEL_BITE`],
    ['the shelter gear stops needing the bite', ND,
      `act: 'takeGearChan', gone: 'gearChannelwood', need: 'wheelBite',`,
      `act: 'takeGearChan', gone: 'gearChannelwood',`],
    ['the bite-sound goes silent', SP,
      `    case 'wheelBite': P.push({`,
      `    case 'wheelBitez': P.push({`],
    ['the star-wheel opens at any alignment', ST,
      `if (s.wheelDial.every((v, j) => v === s.codes.wheel[j]) && !has(s, 'wheelOpen')) {`,
      `if (true && !has(s, 'wheelOpen')) {`],
    ['the hub book stops needing the wheel', ND,
      `to: 'cave', need: 'wheelOpen', needMsg: 'The hub is shut fast`,
      `to: 'cave', needMsg: 'The hub is shut fast`],
    ['the landing panel never sealed with the wheel', ND,
      `to: 'cave', need: 'wheelOpen', needMsg: 'The landing panel is cold`,
      `to: 'cave', needMsg: 'The landing panel is cold`],
    ['the observatory drum preaches a fixed sky', ST,
      `const pts = s.codes.wheel.map((v) => NUMBER_WORDS[WHEEL_POINTS[v]])`,
      `const pts = ['four', 'five', 'six']`],
    ['all three wheel rings clunk at one pitch', SP,
      `export const WHEEL_TONES = [98, 131, 165]`,
      `export const WHEEL_TONES = [98, 98, 98]`],
    ['the Spectator forgets which ages you walked', ST,
      "return AGE_LIST.map((a) => ({ age: a, unlocked: has(s, `link_${a}`) }))",
      "return AGE_LIST.map((a) => ({ age: a, unlocked: false }))"],
    ['the lenses stop showing visions and only churn', VI,
      `if (unlocked && SCENES[age]) SCENES[age](ctx, w, h, t)`,
      `if (false && SCENES[age]) SCENES[age](ctx, w, h, t)`],
    ['a vision freezes outside time', VI,
      `if (unlocked && SCENES[age]) SCENES[age](ctx, w, h, t)`,
      `if (unlocked && SCENES[age]) SCENES[age](ctx, w, h, 0)`],
    ['the thaw notes collapse to one pitch', SP,
      `export const THAW_TONES = { selenitic: 262, stoneship: 330, mechanical: 392, channelwood: 494 }`,
      `export const THAW_TONES = { selenitic: 262, stoneship: 262, mechanical: 262, channelwood: 262 }`],
    ['the sphere never sings a thaw', ST,
      's.flags[k] = true; ev.push(`thaw:${a}`)',
      's.flags[k] = true; ev.push(`page`)'],
    ['the sealed pane climbs back to a dim storm brightness', VI,
      "sky(ctx, w, h, '#060609', '#0c0c11')",
      "sky(ctx, w, h, '#101014', '#1c1c22')"],
    ['a dim Selenitic storm is painted as sealed grey', VI,
      "sky(ctx, w, h, flash ? '#3f5f52' : '#183024', flash ? '#28443a' : '#0e1c16')",
      "sky(ctx, w, h, '#060609', '#0c0c11')"],
    ['the attract loses its Spectator shot', JX,
      `data-attract-vision={a}`,
      `data-attract-gone={a}`],
    ['a linked Age cuts straight — the move branch skips the starfield', ST,
      `      const lk = linkingBook(st.node, spot.id)\n      if (lk) { s.link = lk; s.linkT = LINK_TICKS }`,
      `      const lk = null\n      if (lk) { s.link = lk; s.linkT = LINK_TICKS }`],
    ['a linked Age cuts straight — the click branch skips the starfield', ST,
      `        const lk = linkingBook(st.node, spot.id)\n        if (lk) { s.link = lk; s.linkT = LINK_TICKS }`,
      `        const lk = null\n        if (lk) { s.link = lk; s.linkT = LINK_TICKS }`],
    ['the mechanical book cuts straight (no starfield on its act)', ST,
      `      s.link = 'mechanical'; s.linkT = LINK_TICKS`,
      `      s.linkNot = 'mechanical'`],
    ['the starfield never clears — the flight has no end', ST,
      `        if (st.linkT <= 1) { s.link = null; s.linkT = 0 }`,
      `        if (false) { s.link = null; s.linkT = 0 }`],
    ['the page cover lets the world flash through mid-leap', 'src/games/Myst/link.js',
      `  if (p < 0.30) return 1`,
      `  if (false) return 1`],
    ['the starfield collapses to one streak', 'src/games/Myst/link.js',
      `  for (let i = 0; i < n; i++) {`,
      `  for (let i = 0; i < 1; i++) {`],
    ['every Age links through the same sky', 'src/games/Myst/link.js',
      `  const pal = LINK_PALETTE[age] || LINK_PALETTE.myst`,
      `  const pal = LINK_PALETTE.myst`],
    ['the keys stay live through the leap', JX,
      `      if (gs.link) return
      switch (e.code) {`,
      `      if (gs.linkNot) return
      switch (e.code) {`],
    ['a return panel cuts straight home (Selenitic loses its farewell starfield)', 'src/games/Myst/link.js',
      `  'selenitic/retSelenitic': 'myst',`,
      ``],
    ['the seam opens stiff (the shimmer/waver collapses to a fixed bar)', 'src/games/Myst/link.js',
      `  const wob = Math.sin(prog * 38.0) * 0.028 + Math.sin(prog * 71.0 + 1.3) * 0.016 + Math.sin(prog * 13.0) * 0.011`,
      `  const wob = 0`],
    ['the arrival pull collapses to a constant swirl', 'src/games/Myst/link.js',
      `  return 1 + 1.9 * p * p * p`,
      `  return 1`],
    ['the page-rush cover collapses into the whoosh (no distinct snap)', SP,
      `      { type: 'fnoise', dur: 0.14, vol: 0.11, freq: 2200 },\n      { type: 'sweep', f0: 90, f1: 1400, dur: 0.9, wave: 'sine', vol: 0.1 },`,
      `      { type: 'sweep', f0: 90, f1: 1400, dur: 0.9, wave: 'sine', vol: 0.1 },`],
    ['the starfield overlay drops its DPR backing (soft streaks on phones)', JX,
      `const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio > 1 ? devicePixelRatio : 1) || 1)`,
      `const dpr = 1`],
    // #838 — the trap flights
    ['the trap’s fate never lands (the starfield flies forever)', ST,
      'if (s.pending && !s.link) {', 'if (false && s.pending && !s.link) {'],
    ['the trap can be cancelled (any input escapes the pull)', ST,
      'if (st.pending && a.t !== \'tick\') return { state: st, events: [] }',
      'if (false && st.pending && a.t !== \'tick\') return { state: st, events: [] }'],
    ['the red book’s trap borrows the Ages’ blue-white sky', LK,
      `trapRed: { ink: '#1c0408', floor: '#100103', tint: [255, 62, 54], mix: 0.42 }`,
      `trapRed: { ink: '#1c0408', floor: '#100103', tint: [150, 170, 230], mix: 0.42 }`],
    ['trap stars stop taking their colour (crimson field reads blue)', LK,
      'const mix = pal.mix ?? 0.18', 'const mix = 0.18'],
    ['the trap sounds like an ordinary leap (no inward pull)', SP,
      `if (typeof ev === 'string' && /^link:trap/.test(ev)) {`,
      `if (typeof ev === 'string' && /^link:trapXX/.test(ev)) {`],
    // #838 item 1 — the Age ground
    ['the Age coast is a disc edge again (the skirt never dips below the sea)', TR,
      `stoneship:        { base: 0,   water: -0.3, crest: { x: 0, z: -14, core: 6, rim: 26, h: 4 }, drop: 3.5,`,
      `stoneship:        { base: 0,   water: -0.3, crest: { x: 0, z: -14, core: 6, rim: 26, h: 4 }, drop: 0,`],
    ['the landing bed is not flat (the sculpt swallows the pier)', TR,
      `flats: [{ x0: -9, x1: 9, z0: -27, z1: 3, soft: 5 }]`,
      `flats: []`],
    ['the island ridge sinks (no sculpt on the Stoneship)', TR,
      `crest: { x: 0, z: -14, core: 6, rim: 26, h: 4 }`,
      `crest: { x: 0, z: -14, core: 6, rim: 26, h: 0 }`],
    ['two views share one sculpt (Channelwood observatory copies the terrace)', TR,
      `chanObs:          { base: 4.4, water: -0.5, crest: { x: 0, z: -57, core: 5, rim: 16, h: 1.2 }, drop: 6, skirt: 18, flats: [{ x0: -10, x1: 10, z0: -72, z1: -61, soft: 5 }] }`,
      `chanObs:          { base: 2.2, water: -0.5, crest: { x: 0, z: -53, core: 3, rim: 12, h: 0.8 }, drop: 3, skirt: 10, flats: [{ x0: -11, x1: 11, z0: -61, z1: -49, soft: 5 }] }`],
    ['the scene keeps the flat disc (the Stoneship heightfield is not displaced)', 'src/games/Myst/scene.js',
      `terrainField(g, TX.grey, 'stoneship')`,
      `const ground = mesh(new THREE.CircleGeometry(70, 26), mat(TX.grey), 0, -0.05, 0, g); ground.rotation.x = -Math.PI / 2`],
    ['the scene displaces the wrong height (the Selenitic dome leaks into the Ages)', TR,
      `if (view === 'selenitic' || view === 'selSound') return domeHeight(x, z, view)`,
      `return domeHeight(x, z, view)`],
    // #1587 — the sea polish pass
    ['the break stops lagging the swell (foam swims with the water)', 'src/games/Myst/scene.js',
      'seaSwell(fx, -fz, t - FOAM_LAG, id)',
      'seaSwell(fx, -fz, t, id)'],
    ['the break goes uniform again (one width for every puff)', 'src/games/Myst/scene.js',
      'const w = 1.7 * foamScale(fx, fz, id)',
      'const w = 1.7'],
    ['the sea shrinks back to a visible seam', SEA,
      'export const SEA_EXTENT = 2400',
      'export const SEA_EXTENT = 300'],
    ['the swell goes silent (the rumble volumes zero out)', SP,
      `    { type: 'fnoise', dur: 1.4 + 2.0 * k, vol: 0.015 + 0.075 * k, freq: 220 },
    { type: 'sweep', f0: 46 + 24 * k, f1: 32, dur: 1.8 + 1.8 * k, wave: 'sine', vol: 0.012 + 0.05 * k },`,
      `    { type: 'fnoise', dur: 1.4 + 2.0 * k, vol: 0, freq: 220 },
    { type: 'sweep', f0: 46 + 24 * k, f1: 32, dur: 1.8 + 1.8 * k, wave: 'sine', vol: 0 },`],
    ['the rumble forgets the Age (one flat volume for every sea)', SP,
      'vol: 0.015 + 0.075 * k',
      'vol: 0.015 + 0.075'],
    ['the sun forgets the seas (the glint strips vanish)', 'src/games/Myst/scene.js',
      'const gl = glintFor(id)',
      'const gl = null'],
    ['the ambience drops the view (no per-Age rumble)', JX,
      'ambience(NODES[gs.node].amb, SIM_MS / 1000, gs.node)',
      'ambience(NODES[gs.node].amb, SIM_MS / 1000)'],
    // #838 item 3 — the island shores
    ['the dock shore sinks again (the pier ends at open water)', TR,
      `crest: { x: 0, z: 44, core: 0, rim: 10, h: 4.8 }`,
      `crest: { x: 0, z: 44, core: 0, rim: 10, h: 0 }`],
    ['the cliff path hangs over an endless sea (its skirt stops short)', TR,
      `drop: 6.4, skirt: 14`,
      `drop: 1.0, skirt: 14`],
    ['the beach bed drowns (the rotted boat floats)', TR,
      `{ base: 0.12,`, `{ base: -0.2,`],
    ['the library plateau tips (the stair-top bed is not carved level)', TR,
      `z0: -14, z1: 13`, `z0: -14, z1: -14`],
    ['the scene leaves the beach a flat plane (no heightfield under the sand)', 'src/games/Myst/scene.js',
      `terrainField(g, TX.sand, 'beach')`,
      `const ground = mesh(new THREE.CircleGeometry(70, 26), mat(TX.sand), 0, -0.05, 0, g); ground.rotation.x = -Math.PI / 2`],
    ['the beach copies the dock sculpt (two island shores share one ground)', TR,
      `{ base: 0.12, water: 0,   crest: { x: -14, z: 36, core: 5, rim: 15, h: 0.7 }, drop: 3.2, skirt: 20, flats: [{ x0: -23, x1: -5, z0: 16, z1: 31, soft: 4 }] }`,
      `{ base: 0,    water: 0,   crest: { x: 0, z: 44, core: 0, rim: 10, h: 4.8 }, drop: 3.5, skirt: 12, flats: [] }`],
    // #838 item 5 — mirrored clouds + the skyline
    ['the cloud mirror bleeds onto the shore (the foam zone wears sky)', SEA,
      'if (r <= SEA_DEEP.mirror) return 0', 'if (r <= -1) return 0'],
    ['the mirrored banks freeze (the sky stops moving on the water)', SEA,
      'const ph = t * v.drift * 11', 'const ph = t * 0 * 11'],
    ['the clouds flatten to a uniform varnish (no cotton at the horizon)', SEA,
      'return ramp * q * q', 'return ramp * 0.5'],
    ['dusk banks turn cold (the mirror forgets the sunset)', SEA,
      'dusk:        [0.99, 0.72, 0.66], // rose-lit cirrus over the amber sea',
      'dusk:        [0.72, 0.86, 0.95], // rose-lit cirrus over the amber sea'],
    ['the skyline vanishes (the sea is empty again)', SEA,
      `dusk:      { n: 3,`, 'dusk:      { n: 0,'],
    ['Selenitic grows neighbouring coasts (its dome is not the horizon)', SEA,
      `const ISLE_LAW = {\n  dusk:`,
      `const ISLE_LAW = {\n  selenitic: { n: 2, base: 380, span: 180, w0: 90, h0: 14, tint: [0.16, 0.11, 0.16] },\n  dusk:`],
    ['a headland drowns (silhouette sinks under its own sea)', SEA,
      'const h = law.h0 + hash01(`${view}:isle${i}:h`) * 20',
      'const h = law.h0 - 54 + hash01(`${view}:isle${i}:h`) * 20'],
    ['the islands drift past the fog (a skyline no eye ever sees)', SEA,
      'const d = law.base + hash01(`${view}:isle${i}:d`) * law.span',
      'const d = law.base + 340 + hash01(`${view}:isle${i}:d`) * law.span'],
    ['the scene stops mirroring clouds (deep water forgets the sky)', 'src/games/Myst/scene.js',
      'const lift = cloudMirror(base[i * 3], -base[i * 3 + 1], t, id) * 0.55',
      'const lift = 0'],
    ['the scene stops seating its skyline (empty horizon on every sea)', 'src/games/Myst/scene.js',
      'for (const isl of islesFor(id))', 'for (const isl of [])'],
    ['an isle floats 60 units above the water (a boulder, not a coast)', 'src/games/Myst/scene.js',
      'isl.x, prof.water, isl.z, group)', 'isl.x, prof.water + 60, isl.z, group)'],
    // #838 item 6 — landmarks on the skyline
    ['the tower re-seats per view (the island becomes four sets of props)', SEA,
      'x: Math.sin((L.az * Math.PI) / 180) * L.dist,',
      'x: Math.sin(((L.az + 37 * hash01(view + L.kind)) * Math.PI) / 180) * L.dist,'],
    ['the clock tower shrinks below the headlands (no landmark on the skyline)', SEA,
      'az: 251, dist: 415, w: 13, h: 52,', 'az: 251, dist: 415, w: 13, h: 20,'],
    ['the crag\u2019s dome turns dusk-amber (Selenitic forgets its green)', SEA,
      'dome: [0.36, 0.62, 0.46]', 'dome: [0.62, 0.42, 0.3]'],
    ['the dial runs cold (brass stops catching the sun)', SEA,
      'glow: [0.96, 0.78, 0.36]', 'glow: [0.4, 0.6, 0.9]'],
    ['the Atlantic gets crowded (Stoneship\u2019s horizon wears the island\u2019s tower)', SEA,
      'stoneship: [],',
      'stoneship: [{ kind: \'clockTower\', az: 251, dist: 415, w: 13, h: 52, body: [0.17, 0.1, 0.13], roof: [0.11, 0.06, 0.09], glow: [0.96, 0.78, 0.36], dome: null }],'],
    ['the scene stops seating landmarks (an anchor-less skyline)', 'src/games/Myst/scene.js',
      'for (const lm of landmarksFor(id))', 'for (const lm of [])'],
    ['the dial freezes (the last sun stops breathing on the brass)', 'src/games/Myst/scene.js',
      'dial.material.opacity = 0.55 + 0.28 * Math.sin(t * 0.7 + lm.h)',
      'dial.material.opacity = 0.8'],
    // #838 item 7 — the dome carries home and the brothers
    ['the portraits get raggeder with every page home (healing runs backwards)', VI,
      'const tears = PORTRAIT_TEAR0 - 2 * p', 'const tears = 2 * p'],
    ['the blue brother steals the crimson (one trap colour for both)', VI,
      "const pal = book === 'blue' ? LINK_PALETTE.trapBlue : LINK_PALETTE.trapRed",
      'const pal = LINK_PALETTE.trapRed'],
    ['the face resolves at a single page (the ruin is a fake)', VI,
      'if (p >= 4) {', 'if (p >= 1) {'],
    ['the dome forgets home (the island pane only churns)', VI,
      'const SCENES = { selenitic, stoneship, mechanical, channelwood, myst }',
      'const SCENES = { selenitic, stoneship, mechanical, channelwood }'],
    ['the ruin freezes — static that never crawls', VI,
      'const x = w * (0.06 + hsh(seedK, 7) * 0.88) + Math.sin(t * 2 + k * 1.7) * w * 0.006',
      'const x = w * (0.06 + hsh(seedK, 7) * 0.88)'],
    ['the portraits forget whose pages healed them (both count red)', ST,
      'placed: Math.max(0, Math.min(AGE_LIST.length, s.placed.blue | 0))',
      'placed: Math.max(0, Math.min(AGE_LIST.length, s.placed.red | 0))'],
    ['the dome never hangs the portraits', JX,
      'data-portrait={pv.book}', 'data-portrai={pv.book}'],
    // #838 item 8 — the storm strikes live
    ['the storm never strikes (a still green wash inside the Age)', 'src/games/Myst/storm.js',
      'return Math.min(1, f)', 'return 0'],
    ['the bounce dies (a single stiff blink, not the original\u2019s double)', 'src/games/Myst/storm.js',
      'if (x >= STORM.bounce', 'if (false && x >= STORM.bounce'],
    ['the island flickers too (dusk forgets whose sky it is)', 'src/games/Myst/storm.js',
      'return STORM_VIEWS.includes(view)', 'return true'],
    ['the throne sits dark while the landing flashes (the Age splits)', 'src/games/Myst/storm.js',
      "'selenitic', 'selSound', 'selThrone', 'selGate', 'selTop'", "'selenitic', 'selSound'"],
    ['thunder arrives with the flash (sound outruns the light)', 'src/games/Myst/storm.js',
      'rumbleDelay: 1.7', 'rumbleDelay: 0'],
    ['thunder never speaks (a mute storm)', SP,
      "if (ev === 'thunder') return thunderCues()", "if (ev === 'thunder') return []"],
    ['thunder steals the surf\u2019s voice (crackless, swell-quiet)', SP,
      "{ type: 'noise', dur: 0.16, vol: 0.17 },", "{ type: 'fnoise', dur: 2.2, vol: 0.08, freq: 220 },"],
    ['the scene stops driving the sky (the flash lives only in the law)', 'src/games/Myst/scene.js',
      'd.material.color.setRGB(1 + g * STORM.color[0]', 'd.material.color.setRGB(1 + 0 * g * STORM.color[0]'],
    ['thunder is scheduled but never rings (the edge detector is deaf)', JX,
      "if (stormAt && wt >= stormAt) { stormAt = 0; sfx('thunder') }", 'if (stormAt && wt >= stormAt) { stormAt = 0 }'],
    // #838 item 9 — the gear gallery
    ['the niche counts to four (a seal that half-guards is no seal)', GG,
      'return seatedCount(s) === GEAR_SLOTS', 'return seatedCount(s) >= GEAR_SLOTS - 1'],
    ['the island\'s gear comes loose (MYST starts stopping)', ST,
      'if (g.fixed) {', 'if (g.nokey) {'],
    ['a seat accepts an empty hand (the wall trusts nobody)', ST,
      'if (!gearHeld(s, g.key)) {', 'if (false && !gearHeld(s, g.key)) {'],
    ['the dome gear ignores the chart (the keeper plate forgets its key)', 'src/games/Myst/nodes.js',
      "need: 'obsNote', needMsg: 'A drive-gear", "needMsg: 'A drive-gear"],
    ['the tower lid ignores the switches (the hasps hang open)', 'src/games/Myst/nodes.js',
      "need: 'switchPanel', needMsg: 'A steel lid", "needMsg: 'A steel lid"],
    ['every seat answers at one pitch (five keys, one note)', GG,
      'export const SEAT_TONES = [98, 110, 131, 165, 196]', 'export const SEAT_TONES = [98, 98, 98, 98, 98]'],
    ['a lifted gear reports as seated (the wall miscounts what leaves it)', ST,
      "ev.push('gearLift')", "ev.push('gearSeat:' + g.key)"],
    ['the fifth gear never lands the seal (a niche that stays shut forever)', ST,
      'if (galleryOpen(s)) {', 'if (false && galleryOpen(s)) {'],
    // #838 item 10 — the ambience wears the Age
    ['every sky tunes alike (the wind stops wearing the Age)', SP,
      'selenitic:   { pitch: 0.80, gain: 1.15 }, // low, loud, the green caldera',
      'selenitic:   { pitch: 1.00, gain: 1.00 }, // low, loud, the green caldera'],
    ['the caldera moan vanishes (Selenitic wind is just the bay wash)', SP,
      "  if (kind === 'wind' && node && node.sky === 'selenitic') {",
      "  if (false && kind === 'wind' && node && node.sky === 'selenitic') {"],
    ['a kind goes voiceless (the fireplace stops crackling)', SP,
      "  fire:   () => [{ type: 'fnoise', dur: 0.25, vol: 0.05, freq: 800 }],",
      "  fireXX: () => [{ type: 'fnoise', dur: 0.25, vol: 0.05, freq: 800 }],"],
    ['every chamber drips at one pitch (the cave, library and silo collapse)', SP,
      'const f = Math.round((900 + h01(String(view)) * 500) * tune.pitch)',
      'const f = Math.round(900 * tune.pitch)'],
    ['the ambience stops wearing the sky (voices ignore the tune)', SP,
      'const tune = SKY_TUNE[node ? node.sky : \'\'] || { pitch: 1, gain: 1 }',
      'const tune = { pitch: 1, gain: 1 }'],
    ['the ambience drops the view (every age gets the neutral voice)', SD,
      'for (const c of plan(`amb:${kind}:${view}`)) play(c)',
      'for (const c of plan(`amb:${kind}:`)) play(c)'],
  ]
  let died = 0
  for (const [name, f, from, to] of MUTANTS) {
    const orig = readFileSync(f, 'utf8')
    if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing in ${f}`); continue }
    plant(f, orig.replace(from, to))
    const res = spawnSync(process.execPath, ['scripts/mystcheck.mjs'], { encoding: 'utf8' })
    if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
    else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
    pull(f)
  }
  ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
