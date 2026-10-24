// mystcheck — proves MYST boots as pure logic, its island graph is sound,
// every gate really gates, all eight pages are collectible, both bad endings
// trap you, and the white page brings Atrus home. Node-only, no browser.

import { NODES, AGE_LIST } from '../src/games/Myst/nodes.js'
import { freshState, dispatch, solveScript, runSolver, isWin, STONE_SIZES, SUN_MOON, RIDE, STAR_SHAPES, WHEEL_SPOKES, WHEEL_BITE } from '../src/games/Myst/state.js'
import { deriveCodes, safeWords, seedFromSearch, notebookSeed, storeSeed, loadSeed } from '../src/games/Myst/codes.js'
import { MESSAGES, PRESS } from '../src/games/Myst/attract.js'
import { plan, TONES, STONE_TONES, singTicks } from '../src/games/Myst/soundplan.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok ${name}`) } else { fail++; console.error(`  FAIL ${name}`) } }

console.log('MYST — graph')
ok(Object.keys(NODES).length === 27, '27 nodes: island, tower, cave, cabin, rocket silo, four Ages, walkable Mechanical (4), walkable Selenitic (4), walkable Channelwood (2), walkable Stoneship (2)')
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
const chanSub = ['chanChannels', 'chanWheel']
ok(['channelwood', ...chanSub].every((n) => seen.has(n)), 'Channelwood is walkable end to end once the wood door stands open')
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
    const r = dispatch(s, { t: 'click', id: 'starWheel' })
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
  for (let i = 0; i < 4; i++) { a = dispatch(a, { t: 'click', id: 'starWheel' }).state; b = dispatch(b, { t: 'click', id: 'starWheel' }).state }
  ok(a.wheel === b.wheel && a.flags.wheelBite === b.flags.wheelBite, 'the wheel is deterministic across runs')
  ok(plan('wheel').length > 0 && plan('wheelBite').length > 0, 'the wheel grind and the bite each have their own sound')
  ok(JSON.stringify(plan('wheelBite')) !== JSON.stringify(plan('flood')), 'the bite is not just the flood lever sounding again')
  const nd = NODES.chanWheel.spots.find((x) => x.id === 'starWheel')
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
  let bad = { ...w, ending: null, flags: { ...w.flags, whitePage: true }, node: 'library' }
  ok(dispatch(bad, { t: 'click', id: 'redBook' }).state.ending === 'sirrus', 'freeing Sirrus traps you (red)')
  bad = { ...w, ending: null, flags: { ...w.flags, whitePage: true }, node: 'library' }
  ok(dispatch(bad, { t: 'click', id: 'blueBook' }).state.ending === 'achenar', 'freeing Achenar traps you (blue)')
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
  ok(['chanChannels', 'chanWheel'].every((n) => visited.has(n)), 'the winning route walks every new Channelwood view')
  ok(s.flags.chanFlood && s.flags.pageRed_channelwood && s.flags.pageBlue_channelwood, 'the solver flooded the channels and took both pages')
  ok(s.flags.wheelBite && s.flags.gearChannelwood, 'the winning route also bites the star-wheel and lifts its gear')
  ok(isWin(s), 'and the detour still brings Atrus home')
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
  for (const seed of SEEDS) {
    const s = freshState(seed)
    ok(shapeOk(s.codes), `seed ${seed}: codes are legal shapes (${s.codes.safe}/${s.codes.star.join('')}/${s.codes.sphere.join('')})`)
    ok(isWin(runSolver(freshState(seed))), `seed ${seed}: the island is winnable with its own codes`)
  }
  const locks = (c) => JSON.stringify([c.safe, c.star, c.sphere])
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

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
  console.log('MYST — mutants (each MUST die)')
  const MF = 'src/games/Myst/attract.js'
  const JX = 'src/games/Myst/index.jsx'
  const SP = 'src/games/Myst/soundplan.js'
  const ST = 'src/games/Myst/state.js'
  const ND = 'src/games/Myst/nodes.js'
  const CD = 'src/games/Myst/codes.js'
  const MUTANTS = [
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
  ]
  let died = 0
  for (const [name, f, from, to] of MUTANTS) {
    const orig = readFileSync(f, 'utf8')
    if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing in ${f}`); continue }
    writeFileSync(f, orig.replace(from, to))
    const res = spawnSync(process.execPath, ['scripts/mystcheck.mjs'], { encoding: 'utf8' })
    if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
    else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
    writeFileSync(f, orig)
  }
  ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
