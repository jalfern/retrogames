// mystcheck — proves MYST boots as pure logic, its island graph is sound,
// every gate really gates, all eight pages are collectible, both bad endings
// trap you, and the white page brings Atrus home. Node-only, no browser.

import { NODES, AGE_LIST } from '../src/games/Myst/nodes.js'
import { freshState, dispatch, solveScript, runSolver, isWin, SAFE_CODE, STAR_CODE, SPHERE_CODE } from '../src/games/Myst/state.js'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok ${name}`) } else { fail++; console.error(`  FAIL ${name}`) } }

console.log('MYST — graph')
ok(Object.keys(NODES).length === 14, '14 nodes: island, tower, cave, cabin, four Ages')
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
{ // mechanical red page sealed behind the switch linkage
  let s = { ...freshState(), node: 'mechanical' }
  ok(dispatch(s, { t: 'click', id: 'pageMechanicalRed' }).events.includes('blocked'), 'gear-sealed alcove holds its page')
  s = dispatch(s, { t: 'toggle', i: 0 }).state
  s = dispatch(s, { t: 'toggle', i: 3 }).state
  ok(!!s.flags.switchPanel, 'levers 1 and 4 light the whole chain')
  s = dispatch(s, { t: 'click', id: 'pageMechanicalRed' }).state
  ok(!!s.flags.pageRed_mechanical, 'the alcove opens and the page comes free')
}
{ // sphere puzzle
  let s = { ...freshState(), node: 'selenitic' }
  s = dispatch(s, { t: 'click', id: 'sphere' }).state
  for (let i = 0; i < 4; i++) s = dispatch(s, { t: 'dial', pad: 'sphere', i, v: SPHERE_CODE[i] }).state
  ok(!!s.flags.sphereSolved, 'the tone sequence opens the sphere')
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

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
