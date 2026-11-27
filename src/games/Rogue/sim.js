// ROGUE — pure sim (Rogue, 1980, Eglit/Upl — the ur-dungeon).
//
// Entropy discipline (#1473): zero Math.random here. Every roll — dungeon
// layout, item dice, monster rosters, d20 combat, hunger faints, the potion
// colour / scroll title ciphers — draws from one mulberry32 stream (gameCon-
// tract seedRng's algorithm) replayed from `randState` carried inside the
// state (UTILITIES). createInitialState(seed) regenerates the whole
// world; ?seed=N therefore replays the exact dungeon: same rooms, same
// kestrels, same run. The seed is regenerated at every human start
// (DonkeyKong/batch-8 precedent).
//
// Turn model: Rogue is turn-based. `turn` counts every action that consumes
// player time (move, rest, pickup, quaff, read, wield, wear, take-off, eat,
// drop, descend, search) — it is the report's `tick`, so a filed run is
// pinpointable down to the turn. Monster ids are turn-derived (negative for
// mid-run spawns) so no Date.now can leak into a replay.

export const MAP_W = 80
export const MAP_H = 22

// #1833 glyph grammar (the 1980 legend): room walls are '-' (runs E-W) and
// '|' (runs N-S) and they BLOCK. Corridors are '#', room floor is '.', an
// open door leaves a jamb "'", a closed door '+', stairs '%', and ' ' is the
// solid rock everything sits in. MOVE and monster pathing both ask blocksMove
// — anything that moves must ask (AGENTS gotcha), walls block, always.
export const isWall = (c) => c === '-' || c === '|'
export const blocksMove = (c) => c === ' ' || isWall(c)

export const COLORS = {
  '@': '#ffff55',
  '#': '#666666',
  '-': '#999999',
  '|': '#999999',
  "'": '#aa7744',
  '.': '#3a4a3a',
  '+': '#cc8833',
  '%': '#00dddd',
  '*': '#ffff00',
  '!': '#ff66bb',
  '?': '#66ffff',
  ')': '#aaaaaa',
  '[': '#88aacc',
  '/': '#bb44ff',
  '=': '#ffaa00',
  ':': '#996633',
  // monsters
  K: '#ffaa44', S: '#44ff44', B: '#888888', G: '#aa7744',
  H: '#ff6600', E: '#99bb00', O: '#ff4400', A: '#44aaff',
  C: '#ffbb55', T: '#ff2200', L: '#ffff44', D: '#ff2222',
  V: '#cc00cc', W: '#cccccc', M: '#ff55ff', J: '#00ffcc',
}

// speed is the 1980 mobility clock in quarter-energy units (#3509): the hero
// spends one turn, every monster accrues `speed` quanta per hero turn and a
// full MONSTER_ENERGY buys one action — so ×1.5 races double-step on some
// turns and ×0.75 races skip others. Approximation table (same honesty class
// as the damage bands below): fast = small/flying/legendary swift, slow =
// lumbering.
export const MONSTER_ENERGY = 4
export const MONSTER_DEFS = {
  K: { name: 'kestrel',    hp: [1, 4],   dmg: '1d3', ac: 7,  xp: 1,   minLevel: 1, speed: 6 },
  S: { name: 'snake',      hp: [2, 6],   dmg: '1d3', ac: 5,  xp: 2,   minLevel: 1, speed: 4 },
  B: { name: 'bat',        hp: [1, 8],   dmg: '1d2', ac: 3,  xp: 1,   minLevel: 1, speed: 6 },
  G: { name: 'gnome',      hp: [2, 8],   dmg: '1d6', ac: 5,  xp: 3,   minLevel: 1, speed: 4 },
  H: { name: 'hobgoblin',  hp: [3, 8],   dmg: '1d8', ac: 5,  xp: 3,   minLevel: 2, speed: 4 },
  E: { name: 'emu',        hp: [2, 8],   dmg: '1d2', ac: 7,  xp: 2,   minLevel: 2, speed: 4 },
  O: { name: 'orc',        hp: [5, 10],  dmg: '1d8', ac: 6,  xp: 5,   minLevel: 4, speed: 4 },
  A: { name: 'aquator',    hp: [5, 10],  dmg: '0d0', ac: 2,  xp: 9,   minLevel: 4, speed: 4 },
  C: { name: 'centaur',    hp: [6, 12],  dmg: '1d6', ac: 4,  xp: 8,   minLevel: 5, speed: 6 },
  T: { name: 'troll',      hp: [8, 18],  dmg: '1d8', ac: 4,  xp: 10,  minLevel: 6, speed: 3 },
  L: { name: 'leprechaun', hp: [3, 8],   dmg: '1d1', ac: 3,  xp: 10,  minLevel: 5, speed: 6 },
  D: { name: 'dragon',     hp: [15, 30], dmg: '3d8', ac: -1, xp: 100, minLevel: 8, speed: 4 },
  V: { name: 'vampire',    hp: [8, 15],  dmg: '1d10',ac: 1,  xp: 50,  minLevel: 8, speed: 4 },
  W: { name: 'wraith',     hp: [5, 15],  dmg: '1d6', ac: 4,  xp: 25,  minLevel: 8, speed: 4 },
  M: { name: 'medusa',     hp: [8, 18],  dmg: '3d4', ac: 2,  xp: 80,  minLevel: 8, speed: 3 },
  J: { name: 'jabberwock', hp: [15, 25], dmg: '2d8', ac: 6,  xp: 75,  minLevel: 9, speed: 6 },
}

export const POTION_TYPES = [
  { name: 'healing',          effect: 'heal',         desc: 'You feel better.' },
  { name: 'extra healing',    effect: 'heal2',        desc: 'You feel much better!' },
  { name: 'poison',           effect: 'poison',       desc: 'You feel very sick.' },
  { name: 'strength',         effect: 'strength',     desc: 'You feel stronger.' },
  { name: 'restore strength', effect: 'restore_str',  desc: 'You feel your strength return.' },
  { name: 'blindness',        effect: 'blind',        desc: 'A cloak of darkness falls over your eyes.' },
  { name: 'confusion',        effect: 'confuse',      desc: 'You feel confused.' },
  { name: 'haste self',       effect: 'haste',        desc: 'You feel yourself moving faster.' },
]

export const SCROLL_TYPES = [
  { name: 'identify',        effect: 'identify',       desc: 'You feel more knowledgeable.' },
  { name: 'teleportation',   effect: 'teleport',       desc: 'You are whisked away!' },
  { name: 'sleep',           effect: 'sleep',          desc: 'You fall asleep.' },
  { name: 'enchant weapon',  effect: 'enchant_weapon', desc: 'Your weapon glows blue.' },
  { name: 'enchant armor',   effect: 'enchant_armor',  desc: 'Your armor shimmers.' },
  { name: 'create monster',  effect: 'create_monster', desc: 'You hear a strange noise.' },
  { name: 'magic mapping',   effect: 'magic_map',      desc: 'Your surroundings become familiar.' },
]

export const WEAPON_TYPES = [
  { name: 'dagger',           dmg: '1d4' },
  { name: 'mace',             dmg: '2d4' },
  { name: 'short sword',      dmg: '1d6' },
  { name: 'long sword',       dmg: '1d8' },
  { name: 'two-handed sword', dmg: '2d6' },
  { name: 'war hammer',       dmg: '2d5' },
]

// #3491 ranged combat — the cart's staves (`/`) and arrows. The 1980 legend
// keeps every weapon AND missile on the single `)` glyph (the original map
// draws arrows as `)` too — the item line tells you what it is), and staves
// share the `/` glyph the sim already coloured. The damage bands are the
// cart's flavour: lightning is the hard one, cold the soft one, striking the
// reliable one; the exact per-level tables of the original are approximated
// honestly (README gap). Arrows are the salvage loop: spend one per throw,
// a missed bundle lies where it fell and can be picked back up.
export const WAND_TYPES = [
  { name: 'lightning', dmg: '2d4' },
  { name: 'fire',      dmg: '2d3' },
  { name: 'cold',      dmg: '1d6' },
  { name: 'striking',  dmg: '2d6' },
]

export const ARMOR_TYPES = [
  { name: 'leather armor',   ac: 2 },
  { name: 'ring mail',       ac: 3 },
  { name: 'studded leather', ac: 3 },
  { name: 'chain mail',      ac: 4 },
  { name: 'splint mail',     ac: 6 },
  { name: 'banded mail',     ac: 6 },
  { name: 'plate mail',      ac: 7 },
]

// #3579: the 1980 trap floor. Traps hide until sprung — there is no trap
// search and no ring of warning; the hero finds a trap by being wrong, and
// from then on it is marked with the original's backtick glyph and (unlike
// the trap door it fell through) stays armed.
export const TRAP_TYPES = [
  { kind: 'door', msg: 'You fall through a trap door!' },
  { kind: 'teleport', msg: 'A trap teleports you away!' },
  { kind: 'sleep', msg: 'A poisoned needle pricks you — you fall asleep!' },
  { kind: 'str', msg: 'A trap drains your strength!' },
  { kind: 'confuse', msg: 'A cloud of gas confuses you!' },
  { kind: 'snare', msg: 'You are caught in a snare!' },
  { kind: 'darts', msg: 'Darts spring from the wall!' },
]

// #3588: compact HUD shorthand for the body's shackles. A hero drugged for
// eight turns cannot see WHY arrows stopped coming — the banner must say.
// Pure so the harness can pin the notation against the counters themselves.
export const shackles = (player) =>
  (player.sleeping > 0 ? ` Slp:${player.sleeping}` : '') +
  (player.held > 0 ? ` Hld:${player.held}` : '')

export const POTION_COLORS = ['red', 'blue', 'green', 'yellow', 'bubbly', 'smoky', 'fizzy', 'dark', 'clear', 'murky', 'pink', 'white']
export const SCROLL_TITLES = ['XIXAXA XOXO', 'ZELGO MER', 'FOOBIE BLETCH', 'NATRIX AN', 'PONCHO WIGG', 'YZAX VORN', 'BLIBBER BLUBBER', 'JUYED AWK']

// ============================================================
// UTILITIES
// ============================================================
// The one entropy source: a mulberry32 stream (same algorithm as the shared
// seedRng) whose position travels INSIDE the state as `randState`. Every
// reducer entry restores the stream from the state and every exit banks it
// back, so two worlds alive at once can never interleave streams — a replay
// of (seed, action sequence) is byte-identical no matter what else runs.
let _s = 0
export function setSeed(seed) { _s = seed >>> 0 }
export function getRandState() { return _s }
export function setRandState(v) { _s = v | 0 }

function rand() {
  _s = (_s + 0x6D2B79F5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function rng(min, max) {
  return min + Math.floor(rand() * (max - min + 1))
}

export function rollDice(str) {
  if (!str || str === '0d0') return 0
  const [n, d] = str.split('d').map(Number)
  let t = 0
  for (let i = 0; i < n; i++) t += rng(1, d)
  return t
}

export function hpRoll([lo, hi]) {
  return rng(lo, hi)
}

// ============================================================
// DUNGEON GENERATION
// ============================================================
// #3592 — the Amulet of Yendor (Rogue, 1980): ONE goal object, generated on
// monster level 20. Stepping onto it and picking it up ends the run — the
// cart's you-win terminal. The dice roll only at dlvl 20, so the stream at
// levels 1..19 is untouched and every pre-existing trace replays identical.
const AMULET_LEVEL = 20

export function generateDungeon(dungeonLevel) {
  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(' '))
  const rooms = []
  const maxRooms = rng(6, 8)

  for (let attempt = 0; attempt < 300 && rooms.length < maxRooms; attempt++) {
    const w = rng(5, 14)
    const h = rng(4, 8)
    const x = rng(1, MAP_W - w - 2)
    const y = rng(1, MAP_H - h - 2)
    const overlap = rooms.some(r =>
      x < r.x + r.w + 2 && x + w + 2 > r.x &&
      y < r.y + r.h + 2 && y + h + 2 > r.y
    )
    if (overlap) continue

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        // #1833: walls are the original's '-'/'|' — solid, and drawn unlike
        // the '#'-corridor they wrap. Corners take the vertical stroke.
        const edgeH = ry === y || ry === y + h - 1
        const edgeV = rx === x || rx === x + w - 1
        map[ry][rx] = edgeV ? '|' : edgeH ? '-' : '.'
      }
    }
    rooms.push({ x, y, w, h })
  }

  // Connect rooms with L-shaped corridors (segment list kept for door
  // placement below — doors are a pure function of the dug layout)
  const segments = []
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i], b = rooms[i + 1]
    const ax = rng(a.x + 1, a.x + a.w - 2)
    const ay = rng(a.y + 1, a.y + a.h - 2)
    const bx = rng(b.x + 1, b.x + b.w - 2)
    const by = rng(b.y + 1, b.y + b.h - 2)
    if (rng(0, 1) === 0) {
      segments.push({ x1: ax, x2: bx, y: ay })
      digH(map, ax, bx, ay)
      segments.push({ y1: ay, y2: by, x: bx })
      digV(map, ay, by, bx)
    } else {
      segments.push({ y1: ay, y2: by, x: ax })
      digV(map, ay, by, ax)
      segments.push({ x1: ax, x2: bx, y: by })
      digH(map, ax, bx, by)
    }
  }

  // Stairs in last room
  const lastRoom = rooms[rooms.length - 1]
  const stairsX = rng(lastRoom.x + 1, lastRoom.x + lastRoom.w - 2)
  const stairsY = rng(lastRoom.y + 1, lastRoom.y + lastRoom.h - 2)
  map[stairsY][stairsX] = '%'

  // Doors (#1502): one per corridor segment, at the segment midpoint, only on
  // solid rock or wall — the doorway cells where a corridor crosses a room
  // wall, plus mid-corridor stone in the gaps. A pure function of the dug
  // layout (no new rolls), so the entropy stream and every existing seed's
  // layout are untouched — doors simply appear on the same dungeon. Since
  // #1833 walls block, so the door cell is a real gate on the route; the
  // 1980 rules apply: a closed door blocks and is opened by bumping.
  const doors = []
  const solidAt = (x, y) => map[y][x] === '#' || isWall(map[y][x])
  const placeDoor = (x, y) => {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return
    if (!solidAt(x, y)) return
    if (doors.some(d => d.x === x && d.y === y)) return
    map[y][x] = '+'
    doors.push({ x, y })
  }
  for (const seg of segments) {
    // Walk the segment, find the contiguous solid run (dug '#', wall '-'/'|')
    // — the corridor gap between the two rooms — and door its middle. Room
    // floor stays '.' and breaks the run, so it is never doored.
    const cells = []
    if ('x1' in seg) {
      const step = seg.x1 <= seg.x2 ? 1 : -1
      for (let x = seg.x1; x !== seg.x2 + step; x += step) cells.push([x, seg.y])
    } else {
      const step = seg.y1 <= seg.y2 ? 1 : -1
      for (let y = seg.y1; y !== seg.y2 + step; y += step) cells.push([seg.x, y])
    }
    let run = []
    const flush = () => {
      if (run.length >= 2) placeDoor(run[Math.floor(run.length / 2)][0], run[Math.floor(run.length / 2)][1])
      run = []
    }
    for (const [x, y] of cells) {
      if (solidAt(x, y)) run.push([x, y])
      else flush()
    }
    flush()
  }

  // Hidden doors (#1502, 1980 mechanic): one per room on its wall (top middle,
  // falling back to bottom middle), never on a corridor path or an existing
  // door. Invisible and walkable until found — SEARCH in the 3x3 around the
  // hero, or stumbling into the cell, which swings it open under his feet.
  // Found without the hero on the cell it stands closed ('+'). Pure function
  // of the layout again: zero new rolls, the entropy stream stays untouched.
  const hiddenDoors = []
  const onPath = (x, y) => segments.some(sg =>
    'x1' in sg
      ? sg.y === y && x >= Math.min(sg.x1, sg.x2) && x <= Math.max(sg.x1, sg.x2)
      : sg.x === x && y >= Math.min(sg.y1, sg.y2) && y <= Math.max(sg.y1, sg.y2))
  for (const r of rooms) {
    const spots = [
      [r.x + Math.floor(r.w / 2), r.y],
      [r.x + Math.floor(r.w / 2), r.y + r.h - 1],
    ]
    for (const [hx, hy] of spots) {
      if (hx < 0 || hx >= MAP_W || hy < 0 || hy >= MAP_H) continue
      if (!isWall(map[hy][hx])) continue
      if (doors.some(d => d.x === hx && d.y === hy)) continue
      if (onPath(hx, hy)) continue
      map[hy][hx] = '+'
      doors.push({ x: hx, y: hy })
      hiddenDoors.push({ x: hx, y: hy })
      break
    }
  }

  // Items
  const items = []
  const numItems = rng(8, 14)
  for (let i = 0; i < numItems; i++) {
    const room = rooms[rng(0, rooms.length - 1)]
    const ix = rng(room.x + 1, room.x + room.w - 2)
    const iy = rng(room.y + 1, room.y + room.h - 2)
    if (map[iy][ix] !== '.') continue
    const roll = rng(0, 9)
    let item
    if (roll <= 1) {
      item = { type: '!', subtype: rng(0, POTION_TYPES.length - 1) }
    } else if (roll <= 3) {
      item = { type: '?', subtype: rng(0, SCROLL_TYPES.length - 1) }
    } else if (roll === 4) {
      // #3491: the weapon bin also carries the ranged shelf — 3-in-5 a hand
      // weapon, 1-in-5 a staff `/`, 1-in-5 a quiver of arrows (`)` glyph, the
      // original's single weapon/missile symbol).
      const kind = rng(0, 4)
      if (kind <= 2) {
        const wt = rng(0, WEAPON_TYPES.length - 1)
        item = { type: ')', subtype: wt, name: WEAPON_TYPES[wt].name, dmg: WEAPON_TYPES[wt].dmg, bonus: 0 }
      } else if (kind === 3) {
        const st = rng(0, WAND_TYPES.length - 1)
        item = { type: '/', subtype: st, charges: rng(3, 9) }
      } else {
        item = { type: ')', missile: true, name: 'arrows', qty: rng(4, 9) }
      }
    } else if (roll === 5) {
      const at = rng(0, ARMOR_TYPES.length - 1)
      item = { type: '[', subtype: at, name: ARMOR_TYPES[at].name, ac: ARMOR_TYPES[at].ac, bonus: 0 }
    } else if (roll <= 7) {
      item = { type: '*', amount: rng(1, 10) * (dungeonLevel + 1) + rng(5, 20) }
    } else {
      item = { type: ':', name: 'food ration' }
    }
    items.push({ ...item, x: ix, y: iy })
  }

  // Monsters
  const monsters = []
  const numMonsters = rng(3, 4 + dungeonLevel)
  const eligible = Object.entries(MONSTER_DEFS)
    .filter(([, d]) => d.minLevel <= dungeonLevel)
    .map(([k]) => k)

  for (let i = 0; i < numMonsters; i++) {
    const ri = rng(1, rooms.length - 1)
    const room = rooms[ri]
    const mx = rng(room.x + 1, room.x + room.w - 2)
    const my = rng(room.y + 1, room.y + room.h - 2)
    const letter = eligible[rng(0, eligible.length - 1)]
    const def = MONSTER_DEFS[letter]
    const hp = hpRoll(def.hp)
    monsters.push({
      id: dungeonLevel * 1000 + i,
      x: mx, y: my, letter,
      name: def.name, hp, maxHp: hp,
      dmg: def.dmg, ac: def.ac, xp: def.xp,
      chasing: false, energy: 0, fleeing: false, bitten: false, speed: def.speed,
    })
  }

  // Start in first room
  const sr = rooms[0]
  const startX = rng(sr.x + 1, sr.x + sr.w - 2)
  const startY = rng(sr.y + 1, sr.y + sr.h - 2)

  // Traps (#3579, the 1980 minefield): hidden on any walkable cell — room
  // floor or corridor — never the start square or its ring, never stairs,
  // never under an item or a monster. The rolls are taken on a borrowed
  // slice of the stream and rewound (getRandState/setRandState), so traps
  // vary per seed yet nothing downstream shifts: every existing seed's
  // dungeon, items, monsters and later levels replay byte-identical —
  // traps appear on the same dungeon, they do not reshuffle it.
  const traps = []
  const randSnap = getRandState()
  const numTraps = rng(2, 4 + Math.floor(dungeonLevel / 2))
  const freeForTrap = (x, y) => {
    const c = map[y][x]
    if (c !== '.' && c !== '#') return false
    if (Math.abs(x - startX) <= 1 && Math.abs(y - startY) <= 1) return false
    if (monsters.some(m => m.x === x && m.y === y)) return false
    if (items.some(i => i.x === x && i.y === y)) return false
    return !traps.some(t => t.x === x && t.y === y)
  }
  for (let i = 0; i < numTraps; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const tx = rng(1, MAP_W - 2)
      const ty = rng(1, MAP_H - 2)
      if (!freeForTrap(tx, ty)) continue
      traps.push({ x: tx, y: ty, kind: TRAP_TYPES[rng(0, TRAP_TYPES.length - 1)].kind, armed: true, seen: false })
      break
    }
  }
  setRandState(randSnap)

  const explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
  const visible = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))

  // #3592 — the Amulet settles on monster level 20, the cart's depth: a room
  // floor cell, never the start ring, never the staircase (the stairs cell is
  // '%', and only '.' cells qualify here), never sharing ground with an item,
  // a monster or a mine.
  if (dungeonLevel === AMULET_LEVEL) {
    const free = []
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      if (map[y][x] !== '.') continue
      if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) <= 1) continue
      if (items.some(i => i.x === x && i.y === y)) continue
      if (monsters.some(m => m.x === x && m.y === y)) continue
      if (traps.some(t => t.x === x && t.y === y)) continue
      free.push([x, y])
    }
    if (free.length) {
      const [ax, ay] = free[rng(0, free.length - 1)]
      items.push({ type: '%', amulet: true, x: ax, y: ay })
    }
  }

  return { map, rooms, doors, hiddenDoors, items, monsters, traps, startX, startY, explored, visible }
}

export function digH(map, x1, x2, y) {
  const step = x1 <= x2 ? 1 : -1
  for (let x = x1; x !== x2 + step; x += step) {
    // #1833: a corridor PIERCES walls it crosses ('-'/|' -> '#'), because
    // walls now genuinely block — the old game only reached rooms because
    // its walls were walkable stone.
    if (map[y] && (map[y][x] === ' ' || isWall(map[y][x]))) map[y][x] = '#'
  }
}

export function digV(map, y1, y2, x) {
  const step = y1 <= y2 ? 1 : -1
  for (let y = y1; y !== y2 + step; y += step) {
    if (map[y] && (map[y][x] === ' ' || isWall(map[y][x]))) map[y][x] = '#'
  }
}

export function revealAround(px, py, map, visible, explored, rooms) {
  // Clear visible
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      visible[y][x] = false

  // Find enclosing room
  const room = rooms.find(r =>
    px > r.x && px < r.x + r.w - 1 &&
    py > r.y && py < r.y + r.h - 1
  )

  if (room) {
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        visible[ry][rx] = true
        explored[ry][rx] = true
      }
    }
  }

  // Always reveal immediate neighbors (corridors)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = px + dx, ny = py + dy
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
        visible[ny][nx] = true
        explored[ny][nx] = true
      }
    }
  }
}

// ============================================================
// INITIAL STATE
// ============================================================
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(0, i);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createInitialState(seed) {
  setSeed(seed)
  const dungeon = generateDungeon(1)
  const { map, rooms, doors, hiddenDoors, items, monsters, traps, startX, startY, explored, visible } = dungeon

  const potionColorMap = {}
  const shuffledColors = shuffle(POTION_COLORS)
  POTION_TYPES.forEach((_, i) => { potionColorMap[i] = shuffledColors[i % shuffledColors.length] })

  const scrollTitleMap = {}
  const shuffledTitles = shuffle(SCROLL_TITLES)
  SCROLL_TYPES.forEach((_, i) => { scrollTitleMap[i] = shuffledTitles[i % shuffledTitles.length] })

  revealAround(startX, startY, map, visible, explored, rooms)

  return {
    phase: 'playing',
    seed,
    turn: 0,
    randState: getRandState(),
    dungeonLevel: 1,
    map, rooms, doors, hiddenDoors, items, monsters, traps,
    explored, visible,
    // #3579 fall grudge: consecutive trap-door falls without ever walking
    // down the stairs honest. The nth fall hurts (n−1)·2d6 — the original's
    // escalating law; a stair descent wipes the slate.
    falls: 0,
    // fx log (#1502): one event per audible moment (hit, kill, door, ...).
    // The sim only RECORDS — index.jsx drains it into audioController tones,
    // and roguecheck asserts the events fire (the audibility gate).
    fx: [],
    player: {
      x: startX, y: startY,
      hp: 12, maxHp: 12,
      str: 16, maxStr: 16,
      ac: 4,
      level: 1, exp: 0,
      gold: 0,
      food: 1500, hunger: 'full',
      weapon: { name: 'mace', dmg: '2d4', bonus: 0 },
      armor: { name: 'ring mail', ac: 3, bonus: 0 },
      inventory: [],
      confused: 0, blind: 0, haste: 0, sleeping: 0, held: 0,
    },
    messages: ['Welcome to the Dungeons of Doom!  Press ? for help.',
      'Goal: find the stairs (%) and descend — dlvl 20 keeps the Amulet of Yendor; the deeper you go, the richer you die.'],
    potionColorMap,
    scrollTitleMap,
    identifiedPotions: {},
    identifiedScrolls: {},
    aimIndex: null, // #3491: the pack item awaiting a direction at the aim prompt
    finalScore: 0,
    // #3592: the amulet terminal — won runs end at the pickup, not at death.
    won: false,
  }
}

// ============================================================
// HELPERS
// ============================================================
export function addMsg(state, msg) {
  return { ...state, messages: [...state.messages.slice(-9), msg] }
}

// An fx event: the sim's one-way ticket to the speakers (see state.fx).
const emitFx = (s, k, extra = {}) => ({ ...s, fx: [...s.fx, { k, ...extra }] })

// #1502: a hidden door is a door the hero has not found yet. While hidden it
// is invisible (buildGrid draws wall) and walkable for EVERYONE — the 1980
// rule that the dungeon's creatures know their own doors.
export function doorIsHidden(state, x, y) {
  return state.hiddenDoors?.some(d => d.x === x && d.y === y) === true
}

export function getItemName(item, state) {
  if (item.type === '!') {
    if (state.identifiedPotions[item.subtype]) return `potion of ${POTION_TYPES[item.subtype].name}`
    return `${state.potionColorMap[item.subtype]} potion`
  }
  if (item.type === '?') {
    if (state.identifiedScrolls[item.subtype]) return `scroll of ${SCROLL_TYPES[item.subtype].name}`
    return `scroll titled '${state.scrollTitleMap[item.subtype]}'`
  }
  if (item.type === ')') return item.missile ? `${item.qty} arrows` : `${item.name}${item.bonus ? ` (+${item.bonus})` : ''}`
  if (item.type === '[') return `${item.name}${item.bonus ? ` (+${item.bonus})` : ''}`
  if (item.type === '*') return `${item.amount} gold pieces`
  if (item.type === ':') return 'food ration'
  if (item.type === '/') return `staff of ${WAND_TYPES[item.subtype].name}${item.charges !== undefined ? ` (${item.charges} charges)` : ''}`
  if (item.type === '=' ) return 'ring'
  return '?'
}

export function playerAC(player) {
  const base = player.armor ? player.armor.ac + (player.armor.bonus || 0) : 0
  return 10 - base
}

export function xpNeeded(level) {
  const table = [0, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120]
  return table[Math.min(level - 1, table.length - 1)]
}

// Honor score (the terminal tally): gold carried + depth bonus.
export function runScore(state) {
  return state.phase === 'gameover' ? state.finalScore : state.player.gold + state.dungeonLevel * 50
}

export function done(state) {
  return state.phase === 'gameover'
}

// The drawn grid, built from logical state — lives in sim.js so the harness
// can fingerprint what the screen shows against what the world says (drawn
// sprite must match logical state, FORGE step 6).
export function buildGrid(state) {
  const { map, player, monsters, items, visible, explored } = state
  const rows = []
  for (let y = 0; y < MAP_H; y++) {
    const cols = []
    for (let x = 0; x < MAP_W; x++) {
      let char = ' ', color = '#000'

      if (x === player.x && y === player.y) {
        char = '@'
        color = player.blind > 0 ? '#555' : COLORS['@']
      } else {
        const isVis = visible[y]?.[x]
        const isExp = explored[y]?.[x]

        if (isVis) {
          const mon = monsters.find(m => m.x === x && m.y === y)
          const itm = items.find(i => i.x === x && i.y === y)
          if (mon) {
            char = mon.letter
            color = COLORS[mon.letter] || '#ff4444'
          } else if (itm) {
            char = itm.type
            // #3592 — the Amulet wears gold even among the other % glyphs.
            color = itm.amulet ? '#ffd700' : (COLORS[itm.type] || '#aaaaaa')
          } else {
            // #1502: an unfound hidden door draws as wall — it is found,
            // not seen. #3579: a sprung trap marks the map with the
            // original's backtick; hidden traps draw as plain floor.
            char = map[y][x]
            if (char === '+' && doorIsHidden(state, x, y)) char = '-'
            const seenTrap = state.traps?.some(t => t.seen && t.x === x && t.y === y)
            if (seenTrap) char = '`'
            if (char === '.') color = '#3a5a3a'
            else if (char === '#') color = '#666'
            else if (isWall(char)) color = '#999'
            else if (char === '+') color = '#cc8833'
            else if (char === "'") color = '#aa7744'
            else if (char === '%') color = '#00dddd'
            else if (char === '`') color = '#dd6644'
            else color = '#555'
          }
        } else if (isExp) {
          char = map[y][x]
          if (char === '+' && doorIsHidden(state, x, y)) char = '-'
          if (state.traps?.some(t => t.seen && t.x === x && t.y === y)) char = '`'
          if (char === '.') color = '#223322'
          else if (char === '#') color = '#444'
          else if (isWall(char)) color = '#555'
          else if (char === '+') color = '#664400'
          else if (char === "'") color = '#554022'
          else if (char === '%') color = '#006666'
          else if (char === '`') color = '#7a3a28'
          else color = '#333'
        }
      }
      cols.push({ char, color })
    }
    rows.push(cols)
  }
  return rows
}

// fnv1a over the gameplay state — the determinism fingerprint.
export function hash(state) {
  let h = 0x811c9dc5
  const mix = (str) => {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  mix(`L${state.dungeonLevel}T${state.turn}R${state.randState}P${state.player.x},${state.player.y}:${state.player.hp}/${state.player.gold}/${state.player.level}`)
  for (const row of state.map) mix(row.join(''))
  for (const m of state.monsters) mix(`M${m.letter}@${m.x},${m.y}:${m.hp}:${m.chasing ? 1 : 0}:${m.energy || 0}:${m.fleeing ? 1 : 0}:${m.bitten ? 1 : 0}`)
  for (const it of state.items) mix(`I${it.type}${it.x},${it.y}${it.amount || ''}${it.charges || ''}${it.qty || ''}`)
  mix(`F${state.falls || 0}`)
  for (const t of state.traps || []) mix(`R${t.kind}@${t.x},${t.y}${t.seen ? 1 : 0}${t.armed ? 1 : 0}`)
  return h >>> 0
}

// ============================================================
// COMBAT
// ============================================================
export function playerAttack(state, mIdx) {
  const { player } = state
  const mon = state.monsters[mIdx]
  let msgs = []
  let newMonsters = [...state.monsters]
  let newPlayer = { ...player }

  const hitRoll = rng(1, 20)
  const toHit = 10 - mon.ac + Math.floor((newPlayer.str - 10) / 2)

  if (hitRoll === 20 || hitRoll + toHit >= 10) {
    const dmg = Math.max(1, rollDice(newPlayer.weapon?.dmg || '1d4') + (newPlayer.weapon?.bonus || 0))
    const newHp = mon.hp - dmg
    msgs.push(`You hit the ${mon.name} for ${dmg} damage.`)
    if (newHp <= 0) {
      msgs.push(`You defeated the ${mon.name}!`)
      newMonsters = newMonsters.filter((_, i) => i !== mIdx)
      newPlayer.exp += mon.xp
      if (newPlayer.exp >= xpNeeded(newPlayer.level + 1)) {
        newPlayer.level += 1
        const gain = rng(3, 10)
        newPlayer.maxHp += gain
        newPlayer.hp = Math.min(newPlayer.hp + gain, newPlayer.maxHp)
        msgs.push(`Welcome to level ${newPlayer.level}! Hp:${newPlayer.hp}`)
      }
    } else {
      newMonsters[mIdx] = { ...mon, hp: newHp, chasing: true }
    }
  } else {
    msgs.push(`You miss the ${mon.name}.`)
  }

  let s = { ...state, player: newPlayer, monsters: newMonsters }
  for (const m of msgs) s = addMsg(s, m)
  if (msgs.some((m) => m.startsWith('You hit'))) s = emitFx(s, 'hit')
  if (msgs.some((m) => m.startsWith('You defeated'))) s = emitFx(s, 'kill')
  if (msgs.some((m) => m.startsWith('Welcome to level'))) s = emitFx(s, 'levelup')
  return s
}

export function monsterAttack(state, mIdx) {
  if (mIdx >= state.monsters.length) return state
  const mon = state.monsters[mIdx]
  const { player } = state
  if (Math.abs(mon.x - player.x) > 1 || Math.abs(mon.y - player.y) > 1) return state

  const hitRoll = rng(1, 20)
  const ac = playerAC(player)
  if (hitRoll === 20 || hitRoll + mon.ac - ac >= 10) {
    const dmg = Math.max(1, rollDice(mon.dmg))
    const newHp = player.hp - dmg

    // Special: leprechaun steals gold
    if (mon.letter === 'L' && player.gold > 0) {
      const stolen = Math.min(player.gold, rng(1, 10) * state.dungeonLevel + 5)
      let s = addMsg(state, `The ${mon.name} hits you and steals ${stolen} gold!`)
      s = { ...s, player: { ...player, hp: newHp, gold: player.gold - stolen } }
      s = emitFx(s, 'hurt')
      if (newHp <= 0) return { ...emitFx(s, 'die', { killer: mon.letter }), phase: 'gameover', killer: mon.name, finalScore: s.player.gold + state.dungeonLevel * 50 }
      return s
    }

    // Special: aquator rusts armor
    if (mon.letter === 'A' && player.armor) {
      let s = addMsg(state, `The ${mon.name} hits your armor and rusts it!`)
      const newArmor = { ...player.armor, ac: Math.max(0, player.armor.ac - 1) }
      return { ...s, player: { ...player, armor: newArmor } }
    }

    let s = addMsg(state, `The ${mon.name} hits you for ${dmg} damage.`)
    const newPlayer = { ...player, hp: newHp }
    s = emitFx(s, 'hurt')
    if (newHp <= 0) {
      return { ...emitFx(s, 'die', { killer: mon.letter }), player: newPlayer, phase: 'gameover', killer: mon.name, finalScore: player.gold + state.dungeonLevel * 50 }
    }
    // #3509, the snake's own 1980 law: it flees for good once it has bitten.
    // #3514: the port's message voice already narrates doors and salvage, so the
    // recoil gets a line too — the 1980 cart printed nothing here, and this stays
    // an honestly-labelled port addition (README mobility section).
    if (mon.letter === 'S') {
      s = addMsg(s, 'The snake recoils!')
      s = emitFx(s, 'flee', { id: mon.id, letter: 'S' })
      s = { ...s, monsters: s.monsters.map((mm, ii) => (ii === mIdx ? { ...mm, bitten: true, fleeing: true, chasing: false } : mm)) }
    }
    return { ...s, player: newPlayer }
  } else {
    return addMsg(state, `The ${mon.name} misses.`)
  }
}

// ============================================================
// MONSTER AI
// ============================================================
// Fixed 8-neighbour order (N, NE, E, SE, S, SW, W, NW): the flee law breaks
// distance ties on this order, so seeded replays stay byte-equal.
const DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]

export function advanceMonsters(state, skipId = -1) {
  if (state.phase === 'gameover') return state
  const { player, map, visible } = state
  let s = state
  let newMonsters = [...s.monsters]

  for (let i = 0; i < newMonsters.length; i++) {
    let m = newMonsters[i]
    const speed = m.speed || MONSTER_ENERGY
    const gain = (m.energy || 0) + speed

    // The bumped monster already bought its bite this turn: energy accrues,
    // the step is spent.
    if (m.id === skipId) {
      newMonsters[i] = { ...m, energy: Math.max(0, gain - MONSTER_ENERGY) }
      continue
    }

    const dist = Math.abs(m.x - player.x) + Math.abs(m.y - player.y)
    const playerVisible = visible[m.y]?.[m.x]

    // Wake up if sees player
    let chasing = m.chasing
    if (playerVisible && dist <= 8) chasing = true
    // #3509, the 1980 flee law: a wounded creature that sees the hero runs
    // (hp ≤ ¼ max); the snake's bite flag is set in monsterAttack. Fleeing
    // is for good — wounded things do not get brave again.
    let fleeing = m.fleeing || (chasing && playerVisible && m.hp * 4 <= m.maxHp)
    // #3514: the flee MOMENT is a witnessed event — this creature broke and now
    // runs for good. The sim records it once per creature (a for-good fleer never
    // re-breaks); index.jsx turns it into a distinctive blip + a one-turn glyph
    // tint so the break reads at a glance. No rng — replay hashes untouched.
    if (!m.fleeing && fleeing) s = emitFx(s, 'flee', { id: m.id, letter: m.letter })

    // Energy clock (#3509): a full MONSTER_ENERGY buys one action; the
    // remainder carries, so ×1.5 races double-step and ×0.75 races skip.
    let energy = gain
    if (energy < MONSTER_ENERGY) {
      newMonsters[i] = { ...m, chasing, fleeing, energy }
      continue
    }

    while (energy >= MONSTER_ENERGY) {
      m = newMonsters[i]
      energy -= MONSTER_ENERGY
      const stepDist = Math.abs(m.x - player.x) + Math.abs(m.y - player.y)

      const blockedBy = (nx, ny) => {
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return true
        const tile = map[ny][nx]
        if (blocksMove(tile)) return true
        // closed VISIBLE doors block monsters; hidden doors are known to
        // the creatures (1980 rule) and pass
        if (tile === '+' && !doorIsHidden(s, nx, ny)) return true
        return newMonsters.some((other, ii) => ii !== i && other.x === nx && other.y === ny)
      }

      if (fleeing) {
        // Farthest walkable step from the hero; cornered rats fight — no
        // step flees and it is adjacent, it bites.
        let bx = -1, by = -1, bestD = stepDist
        for (const [dx, dy] of DIRS8) {
          const nx = m.x + dx, ny = m.y + dy
          if (blockedBy(nx, ny)) continue
          if (nx === player.x && ny === player.y) continue
          const d = Math.abs(nx - player.x) + Math.abs(ny - player.y)
          if (d > bestD) { bestD = d; bx = nx; by = ny }
        }
        if (bx >= 0) {
          newMonsters[i] = { ...m, x: bx, y: by, chasing, fleeing, energy }
        } else if (stepDist <= 1) {
          newMonsters[i] = { ...m, chasing, fleeing, energy }
          s = { ...s, monsters: newMonsters }
          s = monsterAttack(s, i)
          if (s.phase === 'gameover') return s
          newMonsters = [...s.monsters]
          newMonsters[i] = { ...newMonsters[i], energy }
        } else {
          newMonsters[i] = { ...m, chasing, fleeing, energy }
        }
      } else if (chasing) {
        // Try to move toward player, or attack if adjacent
        if (stepDist <= 1.5) {
          // Adjacent - attack
          newMonsters[i] = { ...m, chasing, fleeing, energy }
          s = { ...s, monsters: newMonsters }
          s = monsterAttack(s, i)
          if (s.phase === 'gameover') return s
          newMonsters = [...s.monsters]
          newMonsters[i] = { ...newMonsters[i], energy }
          if (newMonsters[i].fleeing) fleeing = true
        } else {
          // Move toward player
          const dx = Math.sign(player.x - m.x)
          const dy = Math.sign(player.y - m.y)
          const moves = []
          if (dx !== 0 && dy !== 0) moves.push([dx, dy], [dx, 0], [0, dy])
          else if (dx !== 0) moves.push([dx, 0], [0, 1], [0, -1])
          else moves.push([0, dy], [1, 0], [-1, 0])

          let moved = false
          for (const [mx, my] of moves) {
            const nx = m.x + mx, ny = m.y + my
            if (blockedBy(nx, ny)) continue
            if (nx === player.x && ny === player.y) {
              // Attack
              newMonsters[i] = { ...m, chasing, fleeing, energy }
              s = { ...s, monsters: newMonsters }
              s = monsterAttack(s, i)
              if (s.phase === 'gameover') return s
              newMonsters = [...s.monsters]
              newMonsters[i] = { ...newMonsters[i], energy }
              if (newMonsters[i].fleeing) fleeing = true
              moved = true
              break
            }
            newMonsters[i] = { ...m, x: nx, y: ny, chasing, fleeing, energy }
            moved = true
            break
          }
          if (!moved) newMonsters[i] = { ...m, chasing, fleeing, energy }
        }
      } else {
        // Wander randomly
        newMonsters[i] = { ...m, chasing, fleeing, energy }
        if (rng(0, 2) === 0) {
          const dx = rng(-1, 1), dy = rng(-1, 1)
          const nx = m.x + dx, ny = m.y + dy
          if (!blockedBy(nx, ny) && !(nx === player.x && ny === player.y)) {
            newMonsters[i] = { ...newMonsters[i], x: nx, y: ny }
          }
        }
      }
    }

    // Stamp the carry-over if the last branch didn't (gameover returns exit
    // early, so this only runs on live turns).
    if (newMonsters[i] && newMonsters[i].energy !== energy) {
      newMonsters[i] = { ...newMonsters[i], energy }
    }
  }

  return { ...s, monsters: newMonsters }
}

// ============================================================
// HUNGER
// ============================================================
export function tickHunger(state) {
  let { player } = state
  let s = state
  let food = player.food - 1
  let hunger = player.hunger

  if (food <= 0) {
    food = 0
    const dmg = rng(1, 3)
    player = { ...player, hp: Math.max(1, player.hp - dmg), food: 0, hunger: 'faint' }
    s = addMsg(s, 'You faint from hunger!')
    if (player.hp <= 1) {
      return { ...emitFx(s, 'die', { killer: 'starvation' }), player, phase: 'gameover', killer: 'starvation', finalScore: player.gold + state.dungeonLevel * 50 }
    }
  } else {
    if (food < 150 && hunger !== 'faint') {
      hunger = 'faint'
      s = addMsg(s, 'You are fainting from hunger!')
    } else if (food < 300 && hunger !== 'weak' && hunger !== 'faint') {
      hunger = 'weak'
      s = addMsg(s, 'You feel weak from hunger.')
    } else if (food < 500 && hunger !== 'hungry' && hunger !== 'weak' && hunger !== 'faint') {
      hunger = 'hungry'
      s = addMsg(s, 'You are hungry.')
    } else if (food >= 500) {
      hunger = 'full'
    }
    player = { ...player, food, hunger }
  }

  return { ...s, player }
}

// ============================================================
// ITEM ACTIONS
// ============================================================
export function handlePickup(state) {
  const { player, items } = state
  const idx = items.findIndex(i => i.x === player.x && i.y === player.y)
  if (idx < 0) return addMsg(state, "There is nothing here.")
  const item = items[idx]

  // #3592 — the cart's you-win terminal: the run ends at the moment of
  // pickup, the line is the one the cabinet printed, and the score keeps the
  // cart's own law (gold + depth). The amulet never fills a slot away.
  if (item.amulet) {
    const s = emitFx({
      ...state,
      items: items.filter((_, i) => i !== idx),
      player: { ...player, inventory: [...player.inventory, item] },
      won: true,
      finalScore: player.gold + state.dungeonLevel * 50,
    }, 'win')
    return addMsg({ ...s, phase: 'gameover' }, 'you have found the Amulet of Yendor!!')
  }

  if (item.type === '*') {
    const s = addMsg({
      ...state,
      player: { ...player, gold: player.gold + item.amount },
      items: items.filter((_, i) => i !== idx),
    }, `You pick up ${item.amount} gold pieces.`)
    return emitFx(s, 'gold')
  }

  if (player.inventory.length >= 26) return addMsg(state, "Your pack is full!")
  // #3491: arrows stack onto the quiver already carried (the original kept
  // missiles as counted piles).
  if (item.missile) {
    const mergeIdx = player.inventory.findIndex(p => p.missile && p.name === item.name)
    const pickupMsg = `You pick up ${item.qty} arrows.`
    if (mergeIdx >= 0) {
      const merged = { ...player.inventory[mergeIdx], qty: player.inventory[mergeIdx].qty + item.qty }
      return addMsg({
        ...state,
        player: { ...player, inventory: player.inventory.map((p, i) => (i === mergeIdx ? merged : p)) },
        items: items.filter((_, i) => i !== idx),
      }, pickupMsg)
    }
    return addMsg({
      ...state,
      player: { ...player, inventory: [...player.inventory, item] },
      items: items.filter((_, i) => i !== idx),
    }, pickupMsg)
  }
  const name = getItemName(item, state)
  return addMsg({
    ...state,
    player: { ...player, inventory: [...player.inventory, item] },
    items: items.filter((_, i) => i !== idx),
  }, `You pick up a ${name}.`)
}

export function handleDrop(state, index) {
  const { player } = state
  if (index < 0 || index >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[index]
  const name = getItemName(item, state)
  return addMsg({
    ...state,
    phase: 'playing',
    player: { ...player, inventory: player.inventory.filter((_, i) => i !== index) },
    items: [...state.items, { ...item, x: player.x, y: player.y }],
  }, `You drop the ${name}.`)
}

export function handleQuaff(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== '!') return { ...state, phase: 'playing' }
  const potion = POTION_TYPES[item.subtype]
  let p = { ...player, inventory: player.inventory.filter((_, i) => i !== invIndex) }
  const newIdent = { ...state.identifiedPotions, [item.subtype]: true }

  switch (potion.effect) {
    case 'heal':    p.hp = Math.min(p.maxHp, p.hp + rng(4, 10)); break
    case 'heal2':   p.hp = Math.min(p.maxHp, p.hp + rng(10, 20)); break
    case 'poison':  p.str = Math.max(1, p.str - rng(1, 3)); break
    case 'strength': p.str = Math.min(p.maxStr + 3, p.str + 1); break
    case 'restore_str': p.str = p.maxStr; break
    case 'blind':   p.blind = 25; break
    case 'confuse': p.confused = 15; break
    case 'haste':   p.haste = 20; break
    default: break
  }

  const s = addMsg({ ...state, phase: 'playing', player: p, identifiedPotions: newIdent },
    `You drink the ${state.potionColorMap[item.subtype]} potion. ${potion.desc}`)
  return emitFx(s, 'quaff')
}

export function handleRead(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== '?') return { ...state, phase: 'playing' }
  const scroll = SCROLL_TYPES[item.subtype]
  let p = { ...player, inventory: player.inventory.filter((_, i) => i !== invIndex) }
  const newIdent = { ...state.identifiedScrolls, [item.subtype]: true }
  let s = { ...state, phase: 'playing', player: p, identifiedScrolls: newIdent }

  switch (scroll.effect) {
    case 'teleport': {
      const room = state.rooms[rng(0, state.rooms.length - 1)]
      const tx = rng(room.x + 1, room.x + room.w - 2)
      const ty = rng(room.y + 1, room.y + room.h - 2)
      const newVis = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
      const newExp = state.explored.map(r => [...r])
      revealAround(tx, ty, state.map, newVis, newExp, state.rooms)
      s = { ...s, player: { ...p, x: tx, y: ty }, visible: newVis, explored: newExp }
      break
    }
    case 'enchant_weapon':
      if (p.weapon) s = { ...s, player: { ...p, weapon: { ...p.weapon, bonus: (p.weapon.bonus || 0) + 1 } } }
      break
    case 'enchant_armor':
      if (p.armor) s = { ...s, player: { ...p, armor: { ...p.armor, bonus: (p.armor.bonus || 0) + 1 } } }
      break
    case 'magic_map': {
      const full = state.map.map(r => r.map(() => true))
      s = { ...s, explored: full }
      break
    }
    case 'sleep':
      s = { ...s, player: { ...p, sleeping: 5 } }
      break
    case 'create_monster': {
      for (let tries = 0; tries < 20; tries++) {
        const nx = player.x + rng(-3, 3), ny = player.y + rng(-3, 3)
        if (nx < 1 || nx >= MAP_W - 1 || ny < 1 || ny >= MAP_H - 1) continue
        if (state.map[ny][nx] !== '.') continue
        if (s.monsters.some(m => m.x === nx && m.y === ny)) continue
        const eligible = Object.entries(MONSTER_DEFS).filter(([, d]) => d.minLevel <= state.dungeonLevel)
        if (eligible.length === 0) break
        const [letter, def] = eligible[rng(0, eligible.length - 1)]
        const hp = hpRoll(def.hp)
        s = { ...s, monsters: [...s.monsters, { id: -1 - s.turn, x: nx, y: ny, letter, name: def.name, hp, maxHp: hp, dmg: def.dmg, ac: def.ac, xp: def.xp, chasing: true, energy: 0, fleeing: false, bitten: false, speed: def.speed }] }
        break
      }
      break
    }
    default: break
  }

  return addMsg(s, `You read the scroll titled '${state.scrollTitleMap[item.subtype]}'. ${scroll.desc}`)
}

export function handleWield(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  // #3491: arrows share the original's weapon glyph but are not wieldable —
  // they answer to the throw command, not the sword hand.
  if (item.type !== ')' || item.missile) return { ...state, phase: 'playing' }
  let inv = player.inventory.filter((_, i) => i !== invIndex)
  if (player.weapon) inv = [...inv, player.weapon]
  return addMsg({ ...state, phase: 'playing', player: { ...player, weapon: item, inventory: inv } },
    `You wield the ${item.name}.`)
}

export function handleWear(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== '[') return { ...state, phase: 'playing' }
  let inv = player.inventory.filter((_, i) => i !== invIndex)
  if (player.armor) inv = [...inv, player.armor]
  return addMsg({ ...state, phase: 'playing', player: { ...player, armor: item, inventory: inv } },
    `You put on the ${item.name}.`)
}

export function handleTakeOff(state) {
  const { player } = state
  if (!player.armor) return addMsg(state, "You're not wearing any armor.")
  const armor = player.armor
  return addMsg({ ...state, player: { ...player, armor: null, inventory: [...player.inventory, armor] } },
    `You take off the ${armor.name}.`)
}

// ============================================================
// RANGED COMBAT (#3491 — the cart's away-game)
// ============================================================
// XP + the level-up fanfare, factored out of playerAttack so a kill by arrow
// or staff books exactly like a kill by mace.
function grantExp(s, xp, msgs) {
  const p = { ...s.player, exp: s.player.exp + xp }
  if (p.exp >= xpNeeded(p.level + 1)) {
    p.level += 1
    const gain = rng(3, 10)
    p.maxHp += gain
    p.hp = Math.min(p.hp + gain, p.maxHp)
    msgs.push(`Welcome to level ${p.level}! Hp:${p.hp}`)
  }
  return { ...s, player: p }
}

// What answers to the throw command: counted arrows and charged staves.
export const isThrowable = (item) => item.type === '/' || (item.type === ')' && item.missile === true)

// Walk the shot line cell by cell from the hero. It stops at the first solid
// (rock and walls; a closed visible door, too — arrows stick in doors) and at
// the first monster. Hidden doors pass: the 1980 law says the dungeon's
// creatures know their own doors, and so does a bolt fired down one.
export function shootRay(state, dx, dy) {
  let lastX = state.player.x, lastY = state.player.y
  const steps = Math.max(MAP_W, MAP_H)
  for (let i = 1; i <= steps; i++) {
    const nx = lastX + dx, ny = lastY + dy
    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return { monster: -1, x: lastX, y: lastY, blocked: true }
    const tile = state.map[ny][nx]
    if (blocksMove(tile) || (tile === '+' && !doorIsHidden(state, nx, ny))) {
      return { monster: -1, x: lastX, y: lastY, blocked: true }
    }
    const mi = state.monsters.findIndex(m => m.x === nx && m.y === ny)
    if (mi >= 0) return { monster: mi, x: nx, y: ny, blocked: false }
    lastX = nx; lastY = ny
  }
  return { monster: -1, x: lastX, y: lastY, blocked: true }
}

// Fire one shot: pick the pack item, aim down (dx,dy). Missiles resolve the
// same law — d20 like melee but with the steady-hand +2 in place of strength,
// the item's damage dice, first body stops the flight. Arrows spend one from
// the bundle; a miss leaves the remainder on the floor to be salvaged. A
// staff spends a charge and crumbles with its last.
export function handleThrow(state, invIndex, dx, dy) {
  const { player } = state
  const item = player.inventory[invIndex]
  if (!item || !isThrowable(item) || Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
    return { ...state, phase: 'playing' }
  }

  const rest = player.inventory.filter((_, i) => i !== invIndex)
  let s = { ...state, phase: 'playing', player: { ...player, inventory: rest }, aimIndex: null }

  const isStaff = item.type === '/'
  s = emitFx(s, isStaff ? 'zap' : 'shoot')
  const ray = shootRay(s, dx, dy)
  const msgs = []
  const label = isStaff ? 'bolt' : 'arrow'
  let hitLanded = false

  if (ray.monster >= 0) {
    const mon = s.monsters[ray.monster]
    const hitRoll = rng(1, 20)
    const toHit = 10 - mon.ac + 2
    if (hitRoll === 20 || hitRoll + toHit >= 10) {
      hitLanded = true
      const dmg = Math.max(1, rollDice(isStaff ? WAND_TYPES[item.subtype].dmg : '1d4'))
      const newHp = mon.hp - dmg
      msgs.push(`You hit the ${mon.name} with your ${label} for ${dmg} damage.`)
      if (newHp <= 0) {
        msgs.push(`You defeated the ${mon.name}!`)
        s = grantExp({ ...s, monsters: s.monsters.filter((_, i) => i !== ray.monster) }, mon.xp, msgs)
        if (!isStaff) msgs.push('your arrow is lost.')
      } else {
        s = { ...s, monsters: s.monsters.map((m, i) => (i === ray.monster ? { ...m, hp: newHp, chasing: true } : m)) }
        if (isStaff) msgs.push('the bolt crackles and dies.')
        else msgs.push('the arrow sticks and is lost.')
      }
    } else {
      msgs.push(`You miss the ${mon.name}.`)
      if (isStaff) msgs.push('the bolt fizzles past it.')
    }
  } else {
    msgs.push(ray.blocked ? `Your ${label} hits the wall.` : `Your ${label} flies into the dark.`)
  }

  // Staff charges — spend one, crumble at zero.
  if (isStaff) {
    const charges = (item.charges || 0) - 1
    if (charges > 0) s = { ...s, player: { ...s.player, inventory: [...s.player.inventory, { ...item, charges }] } }
    else msgs.push(`The staff of ${WAND_TYPES[item.subtype].name} crumbles to dust.`)
  } else {
    // Arrows: ONE arrow leaves the quiver per throw (the quiver stays in the
    // pack); a MISS leaves that arrow on the last free cell of the flight to
    // be salvaged — the original's retrieval loop. A hit arrow is stuck and
    // lost. An empty quiver is just gone.
    const qty = item.qty - 1
    if (qty > 0) s = { ...s, player: { ...s.player, inventory: [...s.player.inventory, { ...item, qty }] } }
    else msgs.push('That was your last arrow.')
    if (!hitLanded) s = { ...s, items: [...s.items, { ...item, qty: 1, x: ray.x, y: ray.y }] }
  }

  for (const m of msgs) s = addMsg(s, m)
  if (msgs.some(m => m.startsWith('You hit'))) s = emitFx(s, 'hit')
  if (msgs.some(m => m.startsWith('You defeated'))) s = emitFx(s, 'kill')
  if (msgs.some(m => m.startsWith('Welcome to level'))) s = emitFx(s, 'levelup')

  s = tickHunger(s)
  if (s.phase === 'gameover') return s
  return advanceMonsters(s)
}

export function handleEat(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== ':') return { ...state, phase: 'playing' }
  const s = addMsg({
    ...state,
    phase: 'playing',
    player: { ...player, food: Math.min(2000, player.food + 800), hunger: 'full', inventory: player.inventory.filter((_, i) => i !== invIndex) },
  }, "You eat the food ration. You feel satisfied.")
  return emitFx(s, 'eat')
}

export function handleDescend(state) {
  const { player, map } = state
  if (map[player.y][player.x] !== '%') return addMsg(state, "You see no stairs here.")
  const newLevel = state.dungeonLevel + 1
  const d = generateDungeon(newLevel)
  revealAround(d.startX, d.startY, d.map, d.visible, d.explored, d.rooms)
  const s = emitFx({
    ...state,
    dungeonLevel: newLevel,
    map: d.map, rooms: d.rooms, doors: d.doors, hiddenDoors: d.hiddenDoors,
    items: d.items, monsters: d.monsters, traps: d.traps,
    visible: d.visible, explored: d.explored,
    // #3579: walking the stairs honest settles the fall grudge.
    falls: 0,
    player: { ...player, x: d.startX, y: d.startY },
  }, 'descend')
  return addMsg(s, `You descend to dungeon level ${newLevel}.`)
}

// #3592 — QA pin (?dlvl=N): seat the hero at the mouth of dungeon level N.
// Same dice a true descent would roll, minus nineteen fights. Harness plumbing
// only — everything after the seating rides the real reducer.
export function qaSeatLevel(state, n) {
  let s = state
  while (s.dungeonLevel < n) {
    const d = generateDungeon(s.dungeonLevel + 1)
    revealAround(d.startX, d.startY, d.map, d.visible, d.explored, d.rooms)
    s = {
      ...s,
      dungeonLevel: s.dungeonLevel + 1,
      map: d.map, rooms: d.rooms, doors: d.doors, hiddenDoors: d.hiddenDoors,
      items: d.items, monsters: d.monsters, traps: d.traps,
      visible: d.visible, explored: d.explored,
      falls: 0,
      player: { ...s.player, x: d.startX, y: d.startY },
    }
  }
  // Bank the stream position the seating rolled, so stepGame resumes honest.
  return addMsg({ ...s, randState: getRandState() }, `You enter dungeon level ${s.dungeonLevel}.`)
}

// SEARCH (1980): one turn, and the 3x3 around the hero is raked over for
// hidden doors. Found without the hero on the cell, a door stands closed
// ('+') from that moment — the creatures may keep passing through; if one is
// actually on the cell, the door is thrown open for it instead.
export function handleSearch(state) {
  let s = state
  const near = (d) => Math.abs(d.x - s.player.x) <= 1 && Math.abs(d.y - s.player.y) <= 1
  const found = s.hiddenDoors.filter(near)
  if (found.length > 0) {
    let map = s.map
    for (const d of found) {
      if (s.monsters.some(m => m.x === d.x && m.y === d.y)) {
        if (map === s.map) map = s.map.map(r => [...r])
        map[d.y][d.x] = "'"
      }
    }
    s = addMsg({ ...s, map, hiddenDoors: s.hiddenDoors.filter(d => !near(d)) }, 'You found a hidden door!')
    s = emitFx(s, 'door-found')
  } else {
    s = addMsg(s, 'You search the area.')
  }
  s = tickHunger(s)
  if (s.phase === 'gameover') return s
  return advanceMonsters(s)
}

// ============================================================
// TRAPS (#3579 — the 1980 minefield)
// ============================================================
// The hero just landed on an armed trap; this owns the rest of the turn.
// The sprung trap stays marked (backtick), and — bar the trap door the hero
// fell through — stays ARMED: the teleport trap is the 1980 running joke.
// Every branch spends the turn through the same door: advanceMonsters.
export function trapSpring(state, trap) {
  let s = { ...state, traps: state.traps.map(t => (t.x === trap.x && t.y === trap.y ? { ...t, seen: true } : t)) }
  const { player } = s
  // #3588: the event names the cell too — the view flashes the white beat
  // exactly where the hero was wrong.
  s = emitFx(s, 'trap', { kind: trap.kind, x: trap.x, y: trap.y })
  s = addMsg(s, TRAP_TYPES.find(t => t.kind === trap.kind).msg)

  switch (trap.kind) {
    case 'door': {
      // Escalating fall grudge: the nth consecutive trap-door fall without
      // walking the stairs costs (n−1)·2d6 — first free, then 2d6, 4d6...
      const falls = (s.falls || 0) + 1
      const dice = (falls - 1) * 2
      const dmg = dice > 0 ? rollDice(`${dice}d6`) : 0
      const hp = player.hp - dmg
      if (hp <= 0) {
        return { ...emitFx(s, 'die', { killer: 'trap door' }), player: { ...player, hp: 0 }, phase: 'gameover', killer: 'the trap door', finalScore: player.gold + s.dungeonLevel * 50 }
      }
      const newLevel = s.dungeonLevel + 1
      const d = generateDungeon(newLevel)
      revealAround(d.startX, d.startY, d.map, d.visible, d.explored, d.rooms)
      s = emitFx({
        ...s,
        dungeonLevel: newLevel,
        map: d.map, rooms: d.rooms, doors: d.doors, hiddenDoors: d.hiddenDoors,
        items: d.items, monsters: d.monsters, traps: d.traps,
        visible: d.visible, explored: d.explored, falls,
        player: { ...player, x: d.startX, y: d.startY, hp },
        // #3588: the wail rides the grudge — the view pitches it deeper
        // the second and third time the floor opens.
      }, 'trapdoor', { falls })
      if (dmg > 0) s = addMsg(emitFx(s, 'hurt'), `The fall hurls you deeper — ${dmg} damage!`)
      break
    }
    case 'teleport': {
      const room = s.rooms[rng(0, s.rooms.length - 1)]
      const tx = rng(room.x + 1, room.x + room.w - 2)
      const ty = rng(room.y + 1, room.y + room.h - 2)
      const newVis = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
      const newExp = s.explored.map(r => [...r])
      revealAround(tx, ty, s.map, newVis, newExp, s.rooms)
      s = { ...s, player: { ...player, x: tx, y: ty }, visible: newVis, explored: newExp }
      break
    }
    case 'sleep':
      s = { ...s, player: { ...player, sleeping: rng(5, 9) } }
      break
    case 'snare':
      s = { ...s, player: { ...player, held: rng(3, 6) } }
      break
    case 'str':
      s = { ...s, player: { ...player, str: Math.max(1, player.str - rng(1, 3)) } }
      break
    case 'confuse':
      s = { ...s, player: { ...player, confused: rng(10, 20) } }
      break
    case 'darts': {
      const dmg = rng(1, 6)
      const hp = player.hp - dmg
      if (hp <= 0) {
        return { ...emitFx(s, 'die', { killer: 'darts' }), player: { ...player, hp: 0 }, phase: 'gameover', killer: 'a dart trap', finalScore: player.gold + s.dungeonLevel * 50 }
      }
      s = emitFx({ ...s, player: { ...player, hp } }, 'hurt')
      break
    }
    default: break
  }
  return s
}

// ============================================================
// REDUCER
// ============================================================
// Actions that consume player time (the report's `tick`).
const TURN_ACTIONS = new Set([
  'MOVE', 'PICKUP', 'DESCEND', 'SEARCH', 'DROP_ITEM', 'QUAFF_ITEM',
  'READ_ITEM', 'WIELD_ITEM', 'WEAR_ITEM', 'TAKE_OFF', 'EAT_ITEM', 'THROW',
])

export function reducer(state, action) {
  if (state.phase === 'gameover' && action.type !== 'NEW_GAME') return state

  if (TURN_ACTIONS.has(action.type)) state = { ...state, turn: state.turn + 1 }

  switch (action.type) {
    case 'NEW_GAME': return createInitialState(action.seed)

    case 'MOVE': {
      if (state.phase !== 'playing') return state
      const { player, map, monsters } = state
      let s = state

      if (player.sleeping > 0) {
        s = tickHunger({ ...s, player: { ...player, sleeping: player.sleeping - 1 } })
        s = addMsg(s, "You are asleep.")
        return advanceMonsters(s)
      }

      if (player.held > 0) {
        s = tickHunger({ ...s, player: { ...player, held: player.held - 1 } })
        s = addMsg(s, 'You struggle in the snare.')
        return advanceMonsters(s)
      }

      const nx = player.x + action.dx
      const ny = player.y + action.dy
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return state
      // #1833, the 1980 rule: rock AND walls block. Only floor, corridor,
      // open jambs and stairs admit the hero; doors handled below.
      if (blocksMove(map[ny][nx])) return state

      // Check monster bump (BEFORE the door logic: a monster can stand on a
      // hidden door cell — creatures know their own doors — and a bump is a
      // swing, not a stumble)
      const mIdx = monsters.findIndex(m => m.x === nx && m.y === ny)
      if (mIdx >= 0) {
        s = playerAttack(s, mIdx)
        if (s.phase === 'gameover') return s
        // Skip this monster in advanceMonsters
        s = tickHunger(s)
        return advanceMonsters(s, state.monsters[mIdx].id)
      }

      // Doors (#1502, 1980 rules): a closed door blocks; bumping it opens it —
      // one turn, no move, and it stays open. A hidden door is invisible and
      // walkable until found: the hero stumbles into the cell and it swings
      // open under his feet.
      if (map[ny][nx] === '+') {
        if (doorIsHidden(s, nx, ny)) {
          const openMap = s.map.map(r => [...r])
          openMap[ny][nx] = "'"
          s = addMsg({
            ...s, map: openMap,
            hiddenDoors: s.hiddenDoors.filter(d => d.x !== nx || d.y !== ny),
          }, "You stumble into a hidden door!")
          s = emitFx(s, 'door-found')
        } else {
          const openMap = s.map.map(r => [...r])
          openMap[ny][nx] = "'"
          s = addMsg({ ...s, map: openMap }, "You open the door.")
          s = emitFx(s, 'door-open')
          s = tickHunger(s)
          if (s.phase === 'gameover') return s
          return advanceMonsters(s)
        }
      }

      // Move player
      const newPlayer = { ...player, x: nx, y: ny }

      // Confused movement
      let finalX = nx, finalY = ny
      if (player.confused > 0) {
        const rdx = rng(-1, 1), rdy = rng(-1, 1)
        const cx = player.x + rdx, cy = player.y + rdy
        if (cx >= 0 && cx < MAP_W && cy >= 0 && cy < MAP_H && !blocksMove(map[cy][cx]) && map[cy][cx] !== '+') {
          finalX = cx; finalY = cy
        }
        newPlayer.confused = player.confused - 1
        newPlayer.x = finalX; newPlayer.y = finalY
      }

      // Tick blindness/haste
      if (newPlayer.blind > 0) newPlayer.blind -= 1
      if (newPlayer.haste > 0) newPlayer.haste -= 1

      const newVis = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
      const newExp = s.explored.map(r => [...r])
      revealAround(finalX, finalY, s.map, newVis, newExp, s.rooms)

      s = { ...s, player: newPlayer, visible: newVis, explored: newExp }
      s = tickHunger(s)
      if (s.phase === 'gameover') return s

      // #3579: the minefield — the hero has landed; if the square was mined,
      // the trap owns the turn (and relocation ends the move outright).
      const trap = s.traps.find(t => t.armed && t.x === finalX && t.y === finalY)
      if (trap) {
        s = trapSpring(s, trap)
        if (s.phase === 'gameover') return s
        return advanceMonsters(s)
      }

      // Auto-pickup gold
      const goldItem = s.items.find(i => i.x === finalX && i.y === finalY && i.type === '*')
      if (goldItem) {
        s = handlePickup(s)
      }

      return advanceMonsters(s)
    }

    case 'PICKUP': return handlePickup(state)

    case 'SHOW_INVENTORY': return { ...state, phase: 'inventory' }
    case 'SHOW_HELP':      return { ...state, phase: 'help' }
    case 'CLOSE_MENU':     return { ...state, phase: 'playing', aimIndex: null }

    case 'SHOW_DROP': {
      if (state.player.inventory.length === 0) return addMsg(state, "You have nothing to drop.")
      return { ...state, phase: 'drop' }
    }
    case 'DROP_ITEM': return handleDrop(state, action.index)

    case 'SHOW_QUAFF': {
      if (!state.player.inventory.some(i => i.type === '!')) return addMsg(state, "You have no potions.")
      return { ...state, phase: 'quaff' }
    }
    case 'QUAFF_ITEM': return handleQuaff(state, action.index)

    case 'SHOW_READ': {
      if (!state.player.inventory.some(i => i.type === '?')) return addMsg(state, "You have no scrolls.")
      return { ...state, phase: 'read' }
    }
    case 'READ_ITEM': return handleRead(state, action.index)

    case 'SHOW_WIELD': {
      if (!state.player.inventory.some(i => i.type === ')')) return addMsg(state, "You have no weapons.")
      return { ...state, phase: 'wield' }
    }
    case 'WIELD_ITEM': return handleWield(state, action.index)

    case 'SHOW_WEAR': {
      if (!state.player.inventory.some(i => i.type === '[')) return addMsg(state, "You have no armor.")
      return { ...state, phase: 'wear' }
    }
    case 'WEAR_ITEM': return handleWear(state, action.index)

    case 'TAKE_OFF': return handleTakeOff(state)
    case 'DESCEND': return handleDescend(state)
    case 'SEARCH': return handleSearch(state)

    case 'SHOW_EAT': {
      if (!state.player.inventory.some(i => i.type === ':')) return addMsg(state, "You have nothing to eat.")
      return { ...state, phase: 'eat' }
    }
    case 'EAT_ITEM': return handleEat(state, action.index)

    // #3491 — throw/zap: pick the missile, then answer the direction prompt.
    case 'SHOW_THROW': {
      if (!state.player.inventory.some(isThrowable)) return addMsg(state, 'You have nothing to fire.')
      return { ...state, phase: 'throw' }
    }
    case 'AIM_THROW': {
      const it = state.player.inventory[action.index]
      if (!it || !isThrowable(it)) return { ...state, phase: 'playing' }
      return addMsg({ ...state, phase: 'aim', aimIndex: action.index }, 'Which direction?')
    }
    case 'THROW': return handleThrow(state, action.index, action.dx, action.dy)

    case 'QUIT': {
      const finalScore = state.player.gold + state.dungeonLevel * 50
      return { ...state, phase: 'gameover', finalScore }
    }

    default: return state
  }
}

// The playable step: restore the entropy stream from the state, run one
// action, bank the stream position back. Use THIS everywhere (index.jsx's
// useReducer, the roguecheck harness) — never call `reducer` on states whose
// streams might interleave. NEW_GAME re-seeds through createInitialState.
export function stepGame(state, action) {
  setRandState(state.randState | 0)
  const next = reducer(state, action)
  return { ...next, randState: getRandState() }
}

// #1637 batch 23 — the WATCH brain (the Y key): roguecheck §6's proven
// autopilot lifted OUT of the harness and INTO the game, so the guide drives
// the real reducer. The same route the check wins with — every seed reaches
// dlvl 2, >=15/20 reach dlvl 4, supplies untouched (slack law) — replanned
// from the LIVE state every turn: an adjacent monster gets hit (walk-and-
// attack, the 1980 way), otherwise the first step of the 8-dir BFS toward
// the `%` stairs; standing on the stairs descends. No route from here ->
// null, and the watcher honestly holds instead of faking progress.
function watchPath(state, goal = null) {
  const start = `${state.player.x},${state.player.y}`
  const prev = new Map([[start, null]])
  const q = [[state.player.x, state.player.y]]
  while (q.length) {
    const [x, y] = q.shift()
    const hit = goal ? (x === goal.x && y === goal.y) : state.map[y][x] === '%'
    if (hit) {
      const path = []
      let k = `${x},${y}`
      while (prev.get(k)) {
        const [cx, cy] = k.split(',').map(Number)
        const [px, py] = prev.get(k).split(',').map(Number)
        path.unshift({ dx: Math.sign(cx - px), dy: Math.sign(cy - py) })
        k = prev.get(k)
      }
      return path
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H || blocksMove(state.map[ny][nx])) continue
      const k = `${nx},${ny}`
      if (prev.has(k)) continue
      prev.set(k, `${x},${y}`); q.push([nx, ny])
    }
  }
  return null
}

export function watchStep(state) {
  if (state.phase !== 'playing') return null
  // #3592 — on the amulet floor the guide hunts the Amulet instead of the
  // stairs: walk onto it, then open the pack like any other floor object.
  const am = state.items.find(i => i.amulet)
  if (am) {
    if (state.player.x === am.x && state.player.y === am.y) return { type: 'PICKUP' }
    const hunt = watchPath(state, am)
    if (hunt) return { type: 'MOVE', dx: hunt[0].dx, dy: hunt[0].dy }
  }
  if (state.map[state.player.y][state.player.x] === '%') return { type: 'DESCEND' }
  const foe = state.monsters.find(m =>
    Math.abs(m.x - state.player.x) <= 1 && Math.abs(m.y - state.player.y) <= 1 &&
    (m.x !== state.player.x || m.y !== state.player.y))
  if (foe) return { type: 'MOVE', dx: Math.sign(foe.x - state.player.x), dy: Math.sign(foe.y - state.player.y) }
  const path = watchPath(state)
  return path ? { type: 'MOVE', dx: path[0].dx, dy: path[0].dy } : null
}
