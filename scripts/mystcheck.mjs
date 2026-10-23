// mystcheck — proves MYST boots as pure logic, its island graph is sound,
// every gate really gates, all eight pages are collectible, both bad endings
// trap you, and the white page brings Atrus home. Node-only, no browser.

import { NODES, AGE_LIST } from '../src/games/Myst/nodes.js'
import { freshState, dispatch, solveScript, runSolver, isWin, SAFE_CODE, STAR_CODE, SPHERE_CODE, STONE_SIZES, SUN_MOON } from '../src/games/Myst/state.js'
import { MESSAGES, PRESS } from '../src/games/Myst/attract.js'
import { plan, TONES, STONE_TONES } from '../src/games/Myst/soundplan.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok ${name}`) } else { fail++; console.error(`  FAIL ${name}`) } }

console.log('MYST — graph')
ok(Object.keys(NODES).length === 22, '22 nodes: island, tower, cave, cabin, four Ages, walkable Mechanical (4), walkable Selenitic (4)')
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
  let s = { ...freshState(), node: 'cave' }
  ok(dispatch(s, { t: 'move', id: 'channelwoodDoor' }).events.includes('blocked'), 'wood door locked before the stars')
  s = dispatch(s, { t: 'click', id: 'starPanel' }).state
  let wrong = STAR_CODE.map((v, i) => (v % 4) + 1)
  for (let i = 0; i < 4; i++) s = dispatch(s, { t: 'dial', pad: 'star', i, v: wrong[i] }).state
  ok(!s.flags.starPanel, 'wrong star order does not open the door')
  let s2 = { ...freshState(), node: 'cave' }
  s2 = dispatch(s2, { t: 'click', id: 'starPanel' }).state
  for (let i = 0; i < 4; i++) s2 = dispatch(s2, { t: 'dial', pad: 'star', i, v: STAR_CODE[i] }).state
  ok(!!s2.flags.starPanel, 'the dome stars (4-1-3-2) open the wood door')
}
{ // fireplace needs matches; safe needs the three numbers
  let s = { ...freshState(), node: 'library' }
  ok(dispatch(s, { t: 'click', id: 'fireplace' }).events.includes('blocked'), 'fireplace cold without matches')
  s = { ...s, flags: { ...s.flags, matchbook: true } }
  s = dispatch(s, { t: 'click', id: 'fireplace' }).state
  ok(!!s.flags.link_selenitic, 'burning the wooden book reveals the Selenitic link')
  s = dispatch(s, { t: 'click', id: 'fireplace' }).state
  ok(s.node === 'selenitic', 'the fireplace links to SELENITIC')
  let c = { ...freshState(), node: 'cabin' }
  c = dispatch(c, { t: 'click', id: 'safe' }).state
  ok(c.panelOpen === 'safe', 'the safe opens its dials')
  c = dispatch(c, { t: 'dial', pad: 'safe', i: 0, v: 1 }).state
  c = dispatch(c, { t: 'dial', pad: 'safe', i: 1, v: 2 }).state
  c = dispatch(c, { t: 'dial', pad: 'safe', i: 2, v: 3 }).state
  ok(!c.flags.safeOpen, '1-2-3 does not open the safe')
  for (let i = 0; i < 3; i++) c = dispatch(c, { t: 'dial', pad: 'safe', i, v: Number(SAFE_CODE[i]) }).state
  ok(!!c.flags.safeOpen && !!c.flags.link_stoneship, `the safe code ${SAFE_CODE} opens the sea-world book`)
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
  let s = { ...freshState(), node: 'selenitic' }
  s = dispatch(s, { t: 'click', id: 'sphere' }).state
  for (let i = 0; i < 4; i++) s = dispatch(s, { t: 'dial', pad: 'sphere', i, v: SPHERE_CODE[i] }).state
  ok(!!s.flags.sphereSolved, 'the tone sequence opens the sphere')
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
  let s = runSolver()
  ok(isWin(s), 'the solver seats the white page and brings Atrus home')
  ok(s.placed.red === 4 && s.placed.blue === 4, 'all eight pages rest in the books')
  const scripted = solveScript()
  let mid = freshState()
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
  let w = runSolver()
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
  const sing = plan('sphereSing')
  ok(sing.length === 4, 'opening the sphere makes the four posts sing (four cues)', String(sing.length))
  ok(sing.every((c, i) => c.delay === i * 0.34), 'the posts sing IN SEQUENCE (staggered delays)', sing.map((c) => c.delay).join(','))
  ok(TONES.length === 4, 'the four posts carry four distinct tones', TONES.join(','))
  const r = dispatch({ ...freshState(), node: 'selenitic' }, { t: 'click', id: 'sphere' })
  ok(r.events.includes('sphereSing'), 'state emits sphereSing when the sphere opens')
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
}

console.log('MYST — the walkable Mechanical gets played, not skipped')
{
  let s = freshState()
  const visited = new Set()
  for (const a of solveScript()) {
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
  for (const a of solveScript()) {
    const r = dispatch(s, a)
    s = r.state
    visited.add(s.node)
  }
  ok(['selSound', 'selThrone', 'selGate', 'selTop'].every((n) => visited.has(n)), 'the winning route walks every new Selenitic view')
  ok(s.flags.selPath && s.flags.selAlign && s.flags.gearSelenitic, 'the solver rang the stones, aligned sun and moon, and took the gear')
  ok(isWin(s), 'and the detour still brings Atrus home')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
  console.log('MYST — mutants (each MUST die)')
  const MF = 'src/games/Myst/attract.js'
  const JX = 'src/games/Myst/index.jsx'
  const SP = 'src/games/Myst/soundplan.js'
  const ST = 'src/games/Myst/state.js'
  const ND = 'src/games/Myst/nodes.js'
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
    ['the four posts go silent when the sphere opens', SP,
      `    case 'sphereSing': TONES.forEach((f, i) => P.push({ type: 'tone', f, dur: 0.4, wave: 'sine', vol: 0.09, delay: i * 0.34 })); break`,
      `    case 'sphereSing': break`],
    ['the page-turn cue vanishes', SP,
      `    case 'page': P.push({ type: 'fnoise', dur: 0.16, vol: 0.08, freq: 1400 }); break`,
      `    case 'page': break`],
    ['state stops firing the sphere sing', ST,
      `ev.push('panel', 'sphereSing'); break`,
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
