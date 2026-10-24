// MYST — pure rules machine. dispatch(state, action) -> { state, events }.
// No DOM, no three.js: the harness (scripts/mystcheck.mjs) imports THIS file
// unchanged and the browser component renders around it.

import { NODES, AGE_LIST } from './nodes.js'
import { deriveCodes, freshSeed, safeWords, NUMBER_WORDS } from './codes.js'

export const SAFE_LEN = 3
export const SWITCH_LINKS = [
  [0, 1], [1, 0, 2], [2, 1, 3], [3, 2, 4], [4, 3],
]
export const STONE_SIZES = 6
export const SUN_MOON = 5
export const RIDE = { ignite: 50, liftoff: 100, ascent: 170, coast: 170, reentry: 140 }
export const RIDE_STAGES = ['ignite', 'liftoff', 'ascent', 'coast', 'reentry']
// #1008 — the dome reliefs differ in silhouette, not only size: four-, five-
// and six-point stars. Fixed per slot (the SIZE is this save's clue; the
// shape is carved decoration, so it never doubles as a second answer).
export const STAR_SHAPES = [4, 5, 6, 5]
// #1017 — the Channelwood star-wheel is a five-spoke lock: the notched ray
// meets the housing groove (one notch in the stone) at detent 3; that is the
// only position the falls can catch, and the caught axle throws the shelter's
// lock over the brass gear. Fixed world constant, like the sun-and-moon detent.
export const WHEEL_SPOKES = 5
export const WHEEL_BITE = 3
// #1014 — the same great wheel carries three concentric symbol rings, five
// star-symbols a turn apart (4–8 points each). The alignment is stamped per
// save (codes.wheel); the observatory drum keeps the pattern and opens the
// hub — the Age's linking book, its way home — as the original's Ages each
// kept their own copy's answers. The spokes drive the axle (#1017); the rings
// read the sky (#1014): one wheel, two locks, both true.
export const WHEEL_RINGS = 3
export const WHEEL_NOTCH = 5
export const WHEEL_POINTS = [4, 5, 6, 7, 8]

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

export function freshState(seed) {
  const codeSeed = seed != null ? seed >>> 0 : freshSeed()
  return {
    seed: codeSeed,
    codes: deriveCodes(codeSeed),
    node: 'dock',
    turn: 0,
    flags: {},
    pages: {},
    placed: { red: 0, blue: 0 },
    safeDial: '000',
    sphereDial: [-1, -1, -1, -1],
    starDial: [0, 0, 0, 0],
    wheel: 0,
    wheelDial: new Array(WHEEL_RINGS).fill(0),
    switches: [0, 0, 0, 0, 0],
    selStone: 0,
    selChair: 0,
    ride: null,
    rideT: 0,
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

  // Mid-ride the rocket drives you, not the player: once the switch is
  // thrown, every input but the loop's own tick is refused until the surface
  // — or an ending — takes hold. In the saddle it is still your call.
  if (st.ride && st.ride !== 'seated' && st.ride !== 'landed') {
    if (a.t !== 'tick') return { state: st, events: [] }
    const s = { ...st, flags: { ...st.flags }, pages: { ...st.pages }, placed: { ...st.placed } }
    s.time += 1
    s.rideT += 1
    if (s.ride === 'ignite' && s.rideT >= RIDE.ignite) { s.ride = 'liftoff'; s.rideT = 0; s.message = 'IGNITION. The whole silo becomes a drum — flame pours down the shaft and the rocket rises, slowly at first, then all at once, dusk falling off you in sheets of fire.'; ev.push('rocketLift') }
    else if (s.ride === 'liftoff' && s.rideT >= RIDE.liftoff) { s.ride = 'ascent'; s.rideT = 0; s.message = 'The shaft, the cliff, the whole grey coin of Myst shrinks under the roar. The dusk thickens above you — indigo, then a blue you have never seen, then none at all.'; ev.push('ascent') }
    else if (s.ride === 'ascent' && s.rideT >= RIDE.ascent) { s.ride = 'coast'; s.rideT = 0; s.message = 'The motor burns out and the world goes silent. Stars, without twinkle, crowd the black. Far below, a small dark leaf with a pale ring of surf: the island, and everything on it, getting small.'; ev.push('coast') }
    else if (s.ride === 'coast' && s.rideT >= RIDE.coast) { s.ride = 'reentry'; s.rideT = 0; s.message = 'The nose tips down. Air returns as a whisper, then a rush; the fins steady the long drop toward a wide, bright, water-covered world.'; ev.push('reentry') }
    else if (s.ride === 'reentry' && s.rideT >= RIDE.reentry) {
      s.ride = 'landed'; s.rideT = 0; s.ending = 'surface'
      s.message = 'The chute cracks out, the sea rushes up — and lets you down gently. Sunrise gilds an empty ocean in every direction. You left MYST. Whatever it was keeping, it kept for itself.'
      ev.push('splash', 'endSurface')
    }
    return { state: s, events: ev }
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
      if (spot.to === 'mechRoom') {
        s.flags.mechDoorOpen = false; s.flags.mechPlateD = false; s.flags.mechPlateE = false; s.flags.mechLatchD = false; s.flags.mechLatchE = false
        s.message = 'You duck through the open steel door — and it bangs shut behind you. Two iron floor plates, a latch lever between them, and the great glass sphere watches from its cradle.'
        ev.push('clank')
      }
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
      if (spot.to) {
        s.node = spot.to; s.turn = 0; s.message = NODES[spot.to].caption
        if (spot.to === 'mechRoom') {
          s.flags.mechDoorOpen = false; s.flags.mechPlateD = false; s.flags.mechPlateE = false; s.flags.mechLatchD = false; s.flags.mechLatchE = false
          s.message = 'You duck through the open steel door — and it bangs shut behind you. Two iron floor plates, a latch lever between them, and the great glass sphere watches from its cradle.'
          ev.push('clank')
        }
        ev.push('travel', `enter:${spot.to}`); break
      }
      if (spot.act) return act(s, spot, ev)
      return { state: st, events: [] }
    }
    case 'closePanel': s.panelOpen = null; s.bookOpen = null; ev.push('page'); break
    case 'dial': {
      const i = a.i
      if (a.pad === 'safe') { const d = s.safeDial.split(''); d[i] = String(a.v != null ? ((a.v % 10) + 10) % 10 : (Number(d[i]) + (a.step || 1)) % 10); s.safeDial = d.join(''); ev.push('dial'); if (s.safeDial === s.codes.safe && !has(s, 'safeOpen')) { s.flags.safeOpen = true; s.panelOpen = null; s.message = 'The safe swings open. Inside: a book bound in blue, and cold sea-light leaking from its pages.'; ev.push('safeOpen', 'link:stoneship'); s.flags.link_stoneship = true } }
      if (a.pad === 'sphere') { const vv = a.v != null ? a.v : a.step; s.sphereDial[i] = vv != null ? ((vv % 4) + 4) % 4 : ((s.sphereDial[i] + 1) % 4); ev.push('dial'); if (s.sphereDial.every((v, j) => v === s.codes.sphere[j]) && !has(s, 'sphereSolved')) { s.flags.sphereSolved = true; s.panelOpen = null; s.message = 'The tones stack in perfect order — the sphere hums, and its stone lid grinds open.'; ev.push('sphereSolved') } }
      if (a.pad === 'star') { const vv = a.v != null ? a.v : a.step; s.starDial[i] = vv != null ? Math.max(1, Math.min(4, vv)) : (s.starDial[i] % 4) + 1; ev.push('dial'); if (s.starDial.every((v, j) => v === s.codes.star[j]) && !has(s, 'starPanel')) { s.flags.starPanel = true; s.panelOpen = null; s.message = 'The symbols match the dome. Deep in the rock, something heavy slides free.'; ev.push('starSolved') } }
      if (a.pad === 'wheel') {
        // #1014 — one notch per click, wrapping; each ring answers with its own
        // weight (outer ring, deeper clunk). The alignment is this save's —
        // stamped at codes.wheel, readable off the observatory drum.
        const vv = a.v != null ? ((a.v % WHEEL_NOTCH) + WHEEL_NOTCH) % WHEEL_NOTCH : (s.wheelDial[i] + 1) % WHEEL_NOTCH
        s.wheelDial[i] = vv
        ev.push(`wheelTick:${i}`)
        if (s.wheelDial.every((v, j) => v === s.codes.wheel[j]) && !has(s, 'wheelOpen')) {
          s.flags.wheelOpen = true; s.panelOpen = null
          s.message = 'Three stars stand together at the mark — the sky the drum remembers. Something heavy finds its notch deep inside the wheel, and the hub grinds open; inside, a book waits on a stone shelf.'
          ev.push('wheelOpen')
        } else {
          s.message = `The ${['outer', 'middle', 'inner'][i]} ring clicks over: a ${WHEEL_POINTS[vv]}-pointed star stands at the mark.`
        }
      }
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
    case 'echo': {
      // The Selenitic sound-book replays a sounding stone's pitch — the same
      // `stone:<i>` event the real stones ring, so book and field never drift.
      if (st.panelOpen !== 'soundbook') return { state: st, events: [] }
      const i = Math.max(0, Math.min(STONE_SIZES - 1, Number(a.i) || 0))
      ev.push(`stone:${i}`)
      break
    }
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
    case 'shelfNote': s.message = `A note in Atrus's hand: "The lock takes three numbers — ${safeWords(s.codes.safe)}. I am sorry, my sons."`; ev.push('look'); break
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
    case 'sphere': s.panelOpen = 'sphere'; s.message = `The sphere ring-dials read ${s.sphereDial.map((v) => (v < 0 ? '·' : v)).join('-')} — four rings, and the posts sing in sequence.`; ev.push('panel', `sing:${s.codes.sphere.join('')}`); break
    case 'starPanel': s.panelOpen = 'star'; s.message = `Stone dials: ${s.starDial.join('-')} points of light each. The dome above shows the true stars.`; ev.push('panel'); break
    case 'starWheel': {
      // #1014 — the wheel is no longer a monument; its three symbol rings are
      // this Age's lock, and the hub keeps the Age's way home. The spokes and
      // the notched ray (#1017) are what the hand hauls on the terrace.
      s.panelOpen = 'wheel'
      s.message = `The great stone wheel: three rings of star-symbols around a shut hub, five spokes for hauling. At the mark today: ${s.wheelDial.map((v) => WHEEL_POINTS[v]).join('-')} points. The observatory above the terrace keeps the pattern this island was carved with.`
      ev.push('panel'); break
    }
    case 'starDrum': {
      const pts = s.codes.wheel.map((v) => NUMBER_WORDS[WHEEL_POINTS[v]])
      s.message = `Three stars glow on the bronze drum — a ${pts[0]}-pointed to the left, a ${pts[1]}-pointed at the crown, a ${pts[2]}-pointed to the right. The rim reads: "Outer, middle, inner — as the sky writes itself, so turn the wheel."`
      ev.push('look'); break
    }
    case 'wheelTurn': {
      s.wheel = (s.wheel + 1) % WHEEL_SPOKES
      ev.push('wheel')
      if (s.wheel === WHEEL_BITE && !has(s, 'wheelBite')) {
        s.flags.wheelBite = true
        s.message = 'The notched ray grinds down into the housing groove and the wheel BITES. Water finds the vanes below; the falls begin to drive the axle of their own weight — and far inside the wheel-shelter something old unlatches with a sound like a held breath let go.'
        ev.push('wheelBite')
      } else if (s.wheel === 1) {
        s.message = 'You haul the spoke round a fifth of a turn. The wheel groans against its axle; the notched ray, which rested high above it, now hangs a thumb short of the groove in the housing.'
      } else if (s.wheel === 2) {
        s.message = 'A second fifth-turn. The notch nears the groove — close enough that the spray breaks over it — but there is no purchase yet, and the star slips past.'
      } else if (s.wheel === 4) {
        s.message = 'Past home and round the long way: the notch comes back up the far side, dry. Five spokes; the groove waits at the bottom for exactly one of them.'
      } else {
        s.message = has(s, 'wheelBite')
          ? 'You turn it a fifth back against the water\u2019s hand. The shelter\u2019s lock stays thrown \u2014 what the falls unlatched, the star will not relatch.'
          : 'The notched ray stands high over the axle again, and the groove below it gapes empty.'
      }
      break
    }
    case 'takeGearChan': {
      if (has(s, 'gearChannelwood')) return { state: s, events: [] }
      s.flags.gearChannelwood = true
      s.message = 'You lift a brass gear from the opened shelter — the colour of old honey, its face stamped with a five-spoke star like the great stone wheel above the falls. Two of five, it said on the tower of Mechanical. Five, to open something that should stay shut.'
      ev.push('gearTake')
      break
    }
    case 'chanFlood': {
      s.flags.chanFlood = !s.flags.chanFlood
      if (s.flags.chanFlood) {
        s.message = 'You lean the whole weight of your shoulder into the flood lever. Far down the channels a sluice gate grinds shut across the water; the stone cuts begin, slowly, to fill.'
      } else {
        s.message = 'You haul the flood lever back. The sluice opens its throat again and the channels drain, dark water running to the falls.'
      }
      ev.push('motor', 'flood'); break
    }
    case 'towerLever': s.message = 'The great lever is braced solid in its stone well. Whatever bell it once rang, no bell hangs here anymore.'; ev.push('look'); break
    case 'switchPanel': s.panelOpen = 'switches'; s.message = `Five iron switches: ${s.switches.join(' ')}. Switches here move gears elsewhere.`; ev.push('panel'); break
    case 'observatory': {
      if (!has(s, 'obsNote')) { s.flags.obsNote = true; s.message = 'Inside the observatory, a chart and a note: "TRAPPED!!! — my father cannot hear us. Search the wood cabin — the safe holds the sea-world\'s book."'
        ev.push('look') }
      else { s.message = 'The observatory dome tracks a sun that never sets on this grey sea.'; ev.push('look') }
      break
    }
    // ---- THE ROCKET (#1010): the Amatem note opens the seam; the ride opens ----
    case 'rocketDoor': {
      if (has(s, 'rocketOpen')) { s.node = 'rocketSilo'; s.turn = 0; s.message = NODES.rocketSilo.caption; ev.push('travel', 'enter:rocketSilo'); break }
      s.flags.rocketOpen = true
      s.message = 'You press the folded observatory note against the reader-plate. Water hisses aside the seam; something old and patient unlatches, and the metal door swings inward on a breath of cold, dry air.'
      ev.push('rocketOpen'); break
    }
    case 'boardRocket': {
      if (s.ride) { s.message = 'You are already astride the saddle.'; ev.push('blocked'); break }
      s.ride = 'seated'; s.rideT = 0
      s.message = 'You swing a leg over the saddle. It fits you like it was cast for you — and under your right hand, under a hinged guard, a single switch waits.'
      ev.push('straddle'); break
    }
    case 'igniteRocket': {
      if (s.ride !== 'seated') { s.message = 'The ignition switch sits under the saddle-guard — it means nothing to anybody not sitting on the rocket.'; ev.push('blocked'); break }
      s.ride = 'ignite'; s.rideT = 0
      s.message = 'You lift the guard and throw the switch. Below you the fuel lines wake with a deepening shudder; the porthole glows, and the whole silo starts to hum like a struck bell.'
      ev.push('ignite'); break
    }
    case 'soundBook': {
      s.panelOpen = 'soundbook'
      s.message = 'A tree-stump book of six painted pages — each stone of the sounding path, biggest to smallest. Touch a page and the stone answers.'
      ev.push('panel', 'soundbook'); break
    }
    case 'mechCall': {
      s.flags.mechCarDown = !s.flags.mechCarDown
      s.message = s.flags.mechCarDown
        ? 'The lever groans over. Somewhere above you the cage shudders and sinks down its rails, cables singing.'
        : 'You shove the call lever back the other way; the cables go taut and the cage climbs empty to the gantry.'
      ev.push('motor', 'flood'); break
    }
    case 'cageRaise': {
      if (s.flags.mechCageTop) { s.message = 'The cage is already at the top of its rails.'; ev.push('blocked'); break }
      s.flags.mechCageTop = true; s.flags.mechCarDown = false; s.node = 'mechTop'; s.turn = 0
      s.message = NODES.mechTop.caption
      ev.push('motor', 'travel', 'enter:mechTop'); break
    }
    case 'cageDescend': {
      if (!s.flags.mechCageTop) { s.message = 'You pull the chain and nothing answers — the cage is already on the deck.'; ev.push('blocked'); break }
      s.flags.mechCageTop = false; s.flags.mechCarDown = true
      s.message = 'The brake hisses; the deck drops under your feet as the cage slides down the tower face.'
      ev.push('motor', 'flood'); break
    }
    case 'cageOut': {
      if (s.flags.mechCageTop) { s.node = 'mechTop'; s.turn = 0; s.message = NODES.mechTop.caption; ev.push('travel', 'enter:mechTop') }
      else { s.node = 'mechanical'; s.turn = 0; s.message = NODES.mechanical.caption; ev.push('travel', 'enter:mechanical') }
      break
    }
    case 'mechSendDown': {
      if (s.flags.mechCarDown) { s.message = 'The cage is already down at the landing, swaying on its cables.'; ev.push('blocked'); break }
      s.flags.mechCarDown = true
      s.message = 'You throw the send-down lever; the cage glides off the gantry and the door slot stands clear.'
      ev.push('motor', 'flood'); break
    }
    case 'mechDoorBtn': {
      if (!s.flags.mechCarDown) { s.message = 'The release button sinks and clicks — but the bronze cage is jammed in the door slot. Nothing moves but the cage.'; ev.push('blocked'); break }
      s.flags.mechDoorOpen = true
      s.message = 'The button sinks home. Bolts retract in sequence, and the steel door swings inward on counterweights.'
      ev.push('clank'); break
    }
    case 'cageBoardTop': {
      if (s.flags.mechCarDown) { s.message = 'The cage waits at the bottom of the shaft, twenty metres below the gantry.'; ev.push('blocked'); break }
      s.flags.mechCageTop = true; s.node = 'mechCar'; s.turn = 0
      s.message = NODES.mechCar.caption
      ev.push('travel', 'enter:mechCar'); break
    }
    case 'stepPlateD': {
      s.flags.mechPlateD = !s.flags.mechPlateD
      if (s.flags.mechPlateD) { if (!s.flags.mechLatchD) s.flags.mechDoorOpen = true; s.message = 'You stand on the door plate. Cables tighten overhead; the steel door grinds open — but only while your weight holds the iron down.' }
      else { if (!s.flags.mechLatchD) s.flags.mechDoorOpen = false; s.message = s.flags.mechLatchD ? 'You step off the plate — the latch holds it for you. The door stays open.' : 'You shift your weight off the plate and the door begins to swing shut.' }
      ev.push('plate'); break
    }
    case 'stepPlateE': {
      s.flags.mechPlateE = !s.flags.mechPlateE
      if (s.flags.mechPlateE) { if (!s.flags.mechLatchE) s.flags.mechCarDown = false; s.message = 'You press the shaft plate. Far below, the cage jumps onto the lift cable and rises to the gantry.' }
      else { if (!s.flags.mechLatchE) s.flags.mechCarDown = true; s.message = s.flags.mechLatchE ? 'You step off the shaft plate — the latch holds; the cage stays called.' : 'You leave the shaft plate and the cage sinks back to the landing below.' }
      ev.push('motor', 'flood'); break
    }
    case 'mechLatch': {
      if (s.flags.mechPlateD && !s.flags.mechLatchD) { s.flags.mechLatchD = true; s.message = 'CLACK. The latch lever bites. Whatever the door plate is doing, it will keep doing it now — your feet are free.'; ev.push('latch') }
      else if (s.flags.mechPlateE && !s.flags.mechLatchE) { s.flags.mechLatchE = true; s.message = 'CLACK. The latch bites again. The cage stays called even off the plate.'; ev.push('latch') }
      else { s.message = 'The latch lever hunts for a pressed plate to hold and finds none — it works only on iron that is already down.'; ev.push('blocked') }
      break
    }
    case 'spectator': {
      s.flags.spectatorSeen = true; s.panelOpen = 'spectator'
      const known = AGE_LIST.filter((a) => a !== 'mechanical' && has(s, `link_${a}`))
      s.message = 'The SPECTATOR: a glass sphere full of slow-turning light. Three lights swim inside it — a world of green rings, a grey and glassy sea, a world of waterfalls.' + (known.length ? ` You have walked in ${known.map((a) => a.toUpperCase()).join(', ')}.` : ' Ages, all of them. Worlds inside books.')
      ev.push('panel', 'spectator'); break
    }
    // ---- SELENITIC: the sounding path, the sun-and-moon throne, the gear ----
    case 'toneStone': {
      const i = spot.tone
      if (i === s.selStone) {
        s.selStone = i + 1
        ev.push(`stone:${i}`)
        if (s.selStone === STONE_SIZES) {
          s.flags.selPath = true
          s.message = 'The last stone rings out clear and high — and the whole corridor of rock answers. Deep in the cliff face a gate grinds open, tooth against tooth.'
          ev.push('gateOpen')
        } else {
          s.message = `A pure tone, ${i + 1} of ${STONE_SIZES}. The stone sinks a finger's width and stays. ${STONE_SIZES - i - 1} to go — and the pitch climbs as you cross.`
        }
      } else {
        s.selStone = 0
        s.message = 'A sour buzz crawls across the field — wrong stone, or wrong order. The path falls silent, and every stone rises back to the dirt to start again.'
        ev.push('buzz')
      }
      break
    }
    case 'selChair': {
      s.selChair = (s.selChair + 1) % 8
      ev.push('swivel')
      if (s.selChair === SUN_MOON && !has(s, 'selAlign')) {
        s.flags.selAlign = true
        s.message = 'The chair locks into its detent. Through the window arch: the moon at the left jamb, the low sun at the right — sun AND moon, in one frame of stone. Something vast shifts inside the mountain; a door you have not seen opens above the terraces.'
        ev.push('alignOpen')
      } else if (s.selChair === SUN_MOON) {
        s.message = 'Sun and moon again, framed together in the arch. The mountain has already opened for that sight.'
      } else if (s.selChair === 2) {
        s.message = 'You swivel the throne. The window takes the low sun full-on — gold on the green rock — but the moon has swung out of the arch. Only one light in the frame.'
      } else {
        s.message = 'You swivel the throne. The great moon hangs in the arch, fat and cratered — but the arch wants the sun beside it, and the sun is somewhere else.'
      }
      break
    }
    case 'takeGear': {
      if (has(s, 'gearSelenitic')) return { state: s, events: [] }
      s.flags.gearSelenitic = true
      s.message = 'You lift the GEAR from its slot — brass the colour of old honey, stamped with the sun-and-moon sigil of this Age. One of five, it said on the tower of Mechanical. Five, to open something that should stay shut.'
      ev.push('gearTake'); break
    }
    case 'throneCarving': s.message = 'A plaque carved above the window arch: "When sun and moon share the arch, the mountain opens." Below it, eight notches are worn into the floor around the throne.'; ev.push('look'); break
    case 'lookMoon': s.message = 'The moon of SELENITIC: close enough to count its craters, green-white on a sky the colour of deep water. It does not move — nothing here does, except the light.'; ev.push('look'); break
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
// Codes come from the live save (#1005): the script solves whatever island
// the seed stamped, not the one from some other save's walkthrough.
export function solveScript(codes) {
  if (!codes) throw new Error('solveScript needs the save codes (state.codes)')
  const S = (t, extra = {}) => ({ t, ...extra })
  return [
    S('move', { id: 'dockBeach' }), S('move', { id: 'toLanding' }),
    S('click', { id: 'palmIllusion' }), S('move', { id: 'toStairs' }),
    S('move', { id: 'towerDoor' }), S('move', { id: 'towerClimb' }),
    S('click', { id: 'mechanicalBook' }),
    S('click', { id: 'matchbook' }),
    S('click', { id: 'pageMechanicalBlue' }),
    S('move', { id: 'toTowerWalk' }),
    S('toggle', { i: 0 }), S('toggle', { i: 3 }),
    S('click', { id: 'mechCall' }),
    S('move', { id: 'boardCar' }),
    S('click', { id: 'cageRaise' }),
    S('click', { id: 'pageMechanicalRed' }),
    S('click', { id: 'mechSendDown' }), S('click', { id: 'mechDoorBtn' }),
    S('move', { id: 'enterRoom' }),
    S('click', { id: 'spectator' }), S('closePanel'),
    S('click', { id: 'stepPlateD' }), S('click', { id: 'mechLatch' }), S('click', { id: 'stepPlateD' }),
    S('click', { id: 'stepPlateE' }), S('click', { id: 'mechLatch' }), S('click', { id: 'stepPlateE' }),
    S('move', { id: 'exitRoom' }),
    S('click', { id: 'cageBoardTop' }), S('click', { id: 'cageDescend' }), S('click', { id: 'cageOut' }),
    S('move', { id: 'retMechanical' }),
    S('click', { id: 'fireplace' }), S('click', { id: 'fireplace' }),
    S('click', { id: 'pageSeleniticRed' }), S('click', { id: 'pageSeleniticBlue' }),
    S('click', { id: 'sphere' }), S('dial', { pad: 'sphere', i: 0, step: codes.sphere[0] }), S('dial', { pad: 'sphere', i: 1, step: codes.sphere[1] }), S('dial', { pad: 'sphere', i: 2, step: codes.sphere[2] }), S('dial', { pad: 'sphere', i: 3, step: codes.sphere[3] }), S('closePanel'),
    S('move', { id: 'toSelSound' }),
    ...[0, 1, 2, 3, 4, 5].map((i) => S('click', { id: `stone${i}` })),
    S('move', { id: 'toSelThrone' }),
    ...Array.from({ length: SUN_MOON }, () => S('click', { id: 'selChair' })),
    S('move', { id: 'toSelGate' }),
    S('move', { id: 'upTop' }),
    S('click', { id: 'takeGear' }),
    S('move', { id: 'downGate' }), S('move', { id: 'backThrone' }), S('move', { id: 'backSelSound' }), S('move', { id: 'backSel' }),
    S('move', { id: 'retSelenitic' }),
    S('click', { id: 'ladderDown' }),
    S('click', { id: 'starPanel' }), ...codes.star.map((v, i) => S('dial', { pad: 'star', i, step: v })), S('closePanel'),
    S('move', { id: 'channelwoodDoor' }),
    S('move', { id: 'toChanChannels' }),
    S('click', { id: 'pageChannelwoodBlue' }),
    S('click', { id: 'chanFlood' }),
    S('move', { id: 'boardRaft' }),
    S('click', { id: 'pageChannelwoodRed' }),
    ...Array.from({ length: WHEEL_BITE }, () => S('click', { id: 'wheelTurn' })),
    S('click', { id: 'gearChan' }),
    S('move', { id: 'toChanObs' }),
    S('click', { id: 'starDrum' }),
    S('move', { id: 'retWheel' }),
    S('click', { id: 'starWheel' }),
    ...codes.wheel.map((v, i) => S('dial', { pad: 'wheel', i, v })),
    S('move', { id: 'hubBook' }), S('move', { id: 'ladderUp' }),
    S('move', { id: 'outLibrary' }), S('move', { id: 'cabinDoor' }),
    S('click', { id: 'cabinShelf' }), S('click', { id: 'safe' }),
    ...codes.safe.split('').map((v, i) => S('dial', { pad: 'safe', i, step: Number(v) })),
    S('click', { id: 'safe' }),
    S('move', { id: 'toShipDeck' }),
    S('move', { id: 'toObservatory' }),
    S('click', { id: 'observatory' }),
    S('move', { id: 'retStoneObs' }),
    S('move', { id: 'retStoneDeck' }),
    S('click', { id: 'pageStoneshipRed' }), S('click', { id: 'pageStoneshipBlue' }),
    S('move', { id: 'retStoneship' }),
    S('click', { id: 'redBook' }), S('click', { id: 'blueBook' }),
    S('click', { id: 'pedestal' }),
  ]
}

export function runSolver(start = freshState()) {
  let s = start
  for (const a of solveScript(s.codes)) {
    const r = dispatch(s, a)
    s = r.state
  }
  return s
}
