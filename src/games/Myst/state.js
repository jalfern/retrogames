// MYST — pure rules machine. dispatch(state, action) -> { state, events }.
// No DOM, no three.js: the harness (scripts/mystcheck.mjs) imports THIS file
// unchanged and the browser component renders around it.

import { NODES, AGE_LIST } from './nodes.js'

export const SAFE_CODE = '852'
export const STAR_CODE = [4, 1, 3, 2]
export const SPHERE_CODE = [2, 0, 3, 1]
export const SWITCH_LINKS = [
  [0, 1], [1, 0, 2], [2, 1, 3], [3, 2, 4], [4, 3],
]

export const BROTHER_LINES = {
  red: [
    '...fath... rrrr... thhh wrriten a book... you c...n free me...',
    'Father wrote a book... b...it is HIDDEN. Free me and I will reward you.',
    'The white page — bring it here INSTEAD. Free ME, Sirrus. Trust no one else.',
    'You have brought me all my pages! At last — place your hand on the leaf and SPEAK.',
  ],
  blue: [
    'ACh...n... help... my broth... mad... the ge...trap...',
    'Achenar here. My brother is dangerous. Free me and I will guide you home.',
    'Restore my pages fully and the old man\'s white page will answer. FREE ME FIRST.',
    'All my pages! Good — now bind me out, and take the white page to Atrus. HURRY.',
  ],
}

export function freshState() {
  return {
    node: 'dock',
    turn: 0,
    flags: {},
    pages: {},
    placed: { red: 0, blue: 0 },
    safeDial: '000',
    sphereDial: [-1, -1, -1, -1],
    starDial: [0, 0, 0, 0],
    switches: [0, 0, 0, 0, 0],
    ending: null,
    message: 'You fall through the starless dark — and land at the foot of a wooden dock.',
    bookOpen: null,
    panelOpen: null,
    time: 0,
  }
}

const AGE_OF = { selenitic: 'selenitic', stoneship: 'stoneship', mechanical: 'mechanical', channelwood: 'channelwood' }

function has(s, f) { return !!s.flags[f] }

export function dispatch(st, a) {
  const s = { ...st, flags: { ...st.flags }, pages: { ...st.pages }, placed: { ...st.placed } }
  const ev = []
  s.time += 1

  if (st.ending) {
    if (a.t === 'restart') return { state: freshState(), events: ['restart'] }
    return { state: st, events: [] }
  }

  switch (a.t) {
    case 'turn': {
      s.turn = (st.turn + a.dir + 4) % 4
      ev.push('turn')
      break
    }
    case 'move': {
      const n = NODES[st.node]
      const spot = n.spots.find((x) => x.id === a.id)
      if (!spot || !spot.to) return { state: st, events: [] }
      if (spot.need && !has(s, spot.need)) { s.message = spot.needMsg || 'It will not move.'; ev.push('blocked'); break }
      if (spot.gone && has(s, spot.gone)) { s.message = 'There is nothing there now.'; ev.push('blocked'); break }
      s.node = spot.to; s.turn = 0
      s.message = NODES[spot.to].caption
      ev.push('travel', `enter:${spot.to}`)
      break
    }
    case 'click': {
      const n = NODES[st.node]
      const spot = n.spots.find((x) => x.id === a.id)
      if (!spot) return { state: st, events: [] }
      if (spot.msg) { s.message = spot.msg; ev.push('look'); if (spot.reveal && !has(s, spot.reveal)) { s.flags[spot.reveal] = true; ev.push('reveal') } break }
      if (spot.reveal && !has(s, spot.reveal)) { s.flags[spot.reveal] = true; s.message = 'Behind the flickering image your fingers find cold iron — a lever, set into the rock.'; ev.push('reveal'); break }
      if (spot.need && !has(s, spot.need)) { s.message = spot.needMsg || 'It will not move.'; ev.push('blocked'); break }
      if (spot.to) { s.node = spot.to; s.turn = 0; s.message = NODES[spot.to].caption; ev.push('travel', `enter:${spot.to}`); break }
      if (spot.act) return act(s, spot, ev)
      return { state: st, events: [] }
    }
    case 'closePanel': s.panelOpen = null; s.bookOpen = null; ev.push('page'); break
    case 'dial': {
      const i = a.i
      if (a.pad === 'safe') { const d = s.safeDial.split(''); d[i] = String(a.v != null ? ((a.v % 10) + 10) % 10 : (Number(d[i]) + (a.step || 1)) % 10); s.safeDial = d.join(''); ev.push('dial'); if (s.safeDial === SAFE_CODE && !has(s, 'safeOpen')) { s.flags.safeOpen = true; s.panelOpen = null; s.message = 'The safe swings open. Inside: a book bound in blue, and cold sea-light leaking from its pages.'; ev.push('safeOpen', 'link:stoneship'); s.flags.link_stoneship = true } }
      if (a.pad === 'sphere') { const vv = a.v != null ? a.v : a.step; s.sphereDial[i] = vv != null ? ((vv % 4) + 4) % 4 : ((s.sphereDial[i] + 1) % 4); ev.push('dial'); if (s.sphereDial.every((v, j) => v === SPHERE_CODE[j]) && !has(s, 'sphereSolved')) { s.flags.sphereSolved = true; s.panelOpen = null; s.message = 'The tones stack in perfect order — the sphere hums, and its stone lid grinds open.'; ev.push('sphereSolved') } }
      if (a.pad === 'star') { const vv = a.v != null ? a.v : a.step; s.starDial[i] = vv != null ? Math.max(1, Math.min(4, vv)) : (s.starDial[i] % 4) + 1; ev.push('dial'); if (s.starDial.every((v, j) => v === STAR_CODE[j]) && !has(s, 'starPanel')) { s.flags.starPanel = true; s.panelOpen = null; s.message = 'The symbols match the dome. Deep in the rock, something heavy slides free.'; ev.push('starSolved') } }
      break
    }
    case 'toggle': {
      const i = a.i
      const sw = s.switches.map((v, j) => (SWITCH_LINKS[i].includes(j) ? 1 - v : v))
      s.switches = sw; ev.push('switch')
      if (sw.every((v) => v === 1) && !has(s, 'switchPanel')) { s.flags.switchPanel = true; s.message = 'Every cog engages at once. Somewhere a sealed gear-lid clunks aside.'; ev.push('switchSolved') }
      break
    }
    case 'closeBook': s.bookOpen = null; ev.push('page'); break
    default: return { state: st, events: [] }
  }
  return { state: s, events: ev }
}

function act(s, spot, ev) {
  switch (spot.act) {
    case 'redBook': case 'blueBook': {
      const c = spot.act === 'redBook' ? 'red' : 'blue'
      const got = AGE_LIST.filter((age) => s.pages[`${c}:${age}`])
      for (const age of got) { delete s.pages[`${c}:${age}`]; s.placed[c] += 1; ev.push('placePage') }
      if (has(s, 'whitePage')) {
        s.ending = c === 'red' ? 'sirrus' : 'achenar'
        s.message = c === 'red'
          ? 'You speak the words of freeing. SIRRUS steps out of the leaf into the light — and your hand is already closing on the cover from the inside.'
          : 'ACHENAR smiles as the book closes around you. Both Brothers are free — and you have a page to stay.'
        ev.push('endBad'); break
      }
      if (s.placed[c] === AGE_LIST.length && s.placed.red === AGE_LIST.length && s.placed.blue === AGE_LIST.length) {
        s.flags.whitePage = true
        s.message = 'Eight pages rest, red against blue. On the reading stand a WHITE page glimmers — Atrus\'s page. The pedestal slot waits.'
        ev.push('whitePage'); break
      }
      s.bookOpen = c
      s.message = BROTHER_LINES[c][Math.min(s.placed[c], BROTHER_LINES[c].length - 1)]
      ev.push('page', 'bookVoice')
      break
    }
    case 'fireplace': {
      if (!has(s, 'matchbook')) { s.message = 'Cold ash and birch logs. You have nothing to light them with.'; ev.push('blocked'); break }
      if (!has(s, 'burnedBook')) { s.flags.burnedBook = true; s.message = 'The wooden cover catches — the varnish melts away and the grain splits to show a link-panel behind the boards.'; ev.push('burn', 'link:selenitic'); s.flags.link_selenitic = true }
      else if (has(s, 'link_selenitic')) { s.node = 'selenitic'; s.turn = 0; s.message = NODES.selenitic.caption; ev.push('travel', 'enter:selenitic') }
      break
    }
    case 'mechanicalBook': {
      s.flags.link_mechanical = true
      s.node = 'mechanical'; s.turn = 0; s.message = NODES.mechanical.caption
      ev.push('travel', 'link:mechanical', 'enter:mechanical')
      break
    }
    case 'safe': {
      if (has(s, 'safeOpen')) { s.node = 'stoneship'; s.turn = 0; s.message = NODES.stoneship.caption; ev.push('travel', 'enter:stoneship') }
      else { s.panelOpen = 'safe'; s.message = `A safe: three dials, now reading ${s.safeDial.split('').join('-')}. Three numbers, and no mercy.`; ev.push('panel') }
      break
    }
    case 'shelfNote': s.message = 'A note in Atrus\'s hand: "The lock takes three numbers — eight, five, two. I am sorry, my sons."'; ev.push('look'); break
    case 'pedestal': {
      if (has(s, 'whitePage')) { s.ending = 'atrus'; s.message = 'The white page seats itself. The air folds — ATRUS steps onto the dock of Myst at dawn, and the island finally exhales.'; ev.push('endGood') }
      else { s.message = 'An empty slot on the pedestal, sized for a single white page.'; ev.push('look') }
      break
    }
    case 'takePage': {
      if (has(s, spot.gone)) return { state: s, events: [] }
      s.flags[spot.gone] = true; s.pages[spot.page] = true
      s.message = `A ${spot.page.startsWith('red') ? 'RED' : 'BLUE'} page from ${spot.page.split(':')[1]} — it belongs in a book upstairs.`
      ev.push('takePage'); break
    }
    case 'takeMatch': s.flags.matchbook = true; s.message = 'A matchbook, still dry after all these years. Fire belongs in a fireplace.'; ev.push('pickup'); break
    case 'sphere': s.panelOpen = 'sphere'; s.message = `The sphere ring-dials read ${s.sphereDial.map((v) => (v < 0 ? '·' : v)).join('-')} — four rings, and the posts sing in sequence.`; ev.push('panel', 'sphereSing'); break
    case 'starPanel': s.panelOpen = 'star'; s.message = `Stone dials: ${s.starDial.join('-')} points of light each. The dome above shows the true stars.`; ev.push('panel'); break
    case 'starWheel': s.message = 'The great star turns its patient circles above the falls — a symbol of Channelwood, mirrored on the panel below.'; ev.push('look'); break
    case 'towerLever': s.message = 'The great lever is braced solid in its stone well. Whatever bell it once rang, no bell hangs here anymore.'; ev.push('look'); break
    case 'switchPanel': s.panelOpen = 'switches'; s.message = `Five iron switches: ${s.switches.join(' ')}. Switches here move gears elsewhere.`; ev.push('panel'); break
    case 'observatory': {
      if (!has(s, 'obsNote')) { s.flags.obsNote = true; s.message = 'Inside the observatory, a chart and a note: "TRAPPED!!! — my father cannot hear us. Search the wood cabin — the safe holds the sea-world\'s book."'
        ev.push('look') }
      else { s.message = 'The observatory dome tracks a sun that never sets on this grey sea.'; ev.push('look') }
      break
    }
    default: break
  }
  return { state: s, events: ev }
}

export function isWin(st) { return st.ending === 'atrus' }
export function pagesTotal(st) { return Object.keys(st.pages).length }
export function currentSpots(st) {
  const n = NODES[st.node]
  return n.spots
    .filter((x) => !(x.gone && has(st, x.gone)))
    .map((x) => ({ ...x, locked: !!(x.need && !has(st, x.need)) }))
}

// Deterministic solve order used by the harness and the attract autopilot.
export function solveScript() {
  const S = (t, extra = {}) => ({ t, ...extra })
  return [
    S('move', { id: 'dockBeach' }), S('move', { id: 'toLanding' }),
    S('click', { id: 'palmIllusion' }), S('move', { id: 'toStairs' }),
    S('move', { id: 'towerDoor' }), S('move', { id: 'towerClimb' }),
    S('click', { id: 'mechanicalBook' }),
    S('click', { id: 'matchbook' }),
    S('toggle', { i: 0 }), S('toggle', { i: 3 }),
    S('click', { id: 'pageMechanicalRed' }), S('click', { id: 'pageMechanicalBlue' }),
    S('move', { id: 'retMechanical' }),
    S('click', { id: 'fireplace' }), S('click', { id: 'fireplace' }),
    S('click', { id: 'pageSeleniticRed' }), S('click', { id: 'pageSeleniticBlue' }),
    S('click', { id: 'sphere' }), S('dial', { pad: 'sphere', i: 0, step: SPHERE_CODE[0] }), S('dial', { pad: 'sphere', i: 1, step: SPHERE_CODE[1] }), S('dial', { pad: 'sphere', i: 2, step: SPHERE_CODE[2] }), S('dial', { pad: 'sphere', i: 3, step: SPHERE_CODE[3] }), S('closePanel'),
    S('move', { id: 'retSelenitic' }),
    S('click', { id: 'ladderDown' }),
    S('click', { id: 'starPanel' }), ...STAR_CODE.map((v, i) => S('dial', { pad: 'star', i, step: v })), S('closePanel'),
    S('move', { id: 'channelwoodDoor' }),
    S('click', { id: 'pageChannelwoodRed' }), S('click', { id: 'pageChannelwoodBlue' }),
    S('move', { id: 'retChannelwood' }), S('move', { id: 'ladderUp' }),
    S('move', { id: 'outLibrary' }), S('move', { id: 'cabinDoor' }),
    S('click', { id: 'cabinShelf' }), S('click', { id: 'safe' }),
    ...SAFE_CODE.split('').map((v, i) => S('dial', { pad: 'safe', i, step: Number(v) })),
    S('click', { id: 'safe' }),
    S('click', { id: 'observatory' }),
    S('click', { id: 'pageStoneshipRed' }), S('click', { id: 'pageStoneshipBlue' }),
    S('move', { id: 'retStoneship' }),
    S('click', { id: 'redBook' }), S('click', { id: 'blueBook' }),
    S('click', { id: 'pedestal' }),
  ]
}

export function runSolver(start = freshState()) {
  let s = start
  for (const a of solveScript()) {
    const r = dispatch(s, a)
    s = r.state
  }
  return s
}
