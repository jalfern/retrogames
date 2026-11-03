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

export const COLORS = {
  '@': '#ffff55',
  '#': '#666666',
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

export const MONSTER_DEFS = {
  K: { name: 'kestrel',    hp: [1, 4],   dmg: '1d3', ac: 7,  xp: 1,   minLevel: 1 },
  S: { name: 'snake',      hp: [2, 6],   dmg: '1d3', ac: 5,  xp: 2,   minLevel: 1 },
  B: { name: 'bat',        hp: [1, 8],   dmg: '1d2', ac: 3,  xp: 1,   minLevel: 1 },
  G: { name: 'gnome',      hp: [2, 8],   dmg: '1d6', ac: 5,  xp: 3,   minLevel: 1 },
  H: { name: 'hobgoblin',  hp: [3, 8],   dmg: '1d8', ac: 5,  xp: 3,   minLevel: 2 },
  E: { name: 'emu',        hp: [2, 8],   dmg: '1d2', ac: 7,  xp: 2,   minLevel: 2 },
  O: { name: 'orc',        hp: [5, 10],  dmg: '1d8', ac: 6,  xp: 5,   minLevel: 4 },
  A: { name: 'aquator',    hp: [5, 10],  dmg: '0d0', ac: 2,  xp: 9,   minLevel: 4 },
  C: { name: 'centaur',    hp: [6, 12],  dmg: '1d6', ac: 4,  xp: 8,   minLevel: 5 },
  T: { name: 'troll',      hp: [8, 18],  dmg: '1d8', ac: 4,  xp: 10,  minLevel: 6 },
  L: { name: 'leprechaun', hp: [3, 8],   dmg: '1d1', ac: 3,  xp: 10,  minLevel: 5 },
  D: { name: 'dragon',     hp: [15, 30], dmg: '3d8', ac: -1, xp: 100, minLevel: 8 },
  V: { name: 'vampire',    hp: [8, 15],  dmg: '1d10',ac: 1,  xp: 50,  minLevel: 8 },
  W: { name: 'wraith',     hp: [5, 15],  dmg: '1d6', ac: 4,  xp: 25,  minLevel: 8 },
  M: { name: 'medusa',     hp: [8, 18],  dmg: '3d4', ac: 2,  xp: 80,  minLevel: 8 },
  J: { name: 'jabberwock', hp: [15, 25], dmg: '2d8', ac: 6,  xp: 75,  minLevel: 9 },
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

export const ARMOR_TYPES = [
  { name: 'leather armor',   ac: 2 },
  { name: 'ring mail',       ac: 3 },
  { name: 'studded leather', ac: 3 },
  { name: 'chain mail',      ac: 4 },
  { name: 'splint mail',     ac: 6 },
  { name: 'banded mail',     ac: 6 },
  { name: 'plate mail',      ac: 7 },
]

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
        map[ry][rx] = (ry === y || ry === y + h - 1 || rx === x || rx === x + w - 1) ? '#' : '.'
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
  // stone ('#') — the doorway cells where a corridor crosses a room wall, plus
  // mid-corridor stone in the gaps. A pure function of the dug layout (no new
  // rolls), so the entropy stream and every existing seed's layout are
  // untouched — doors simply appear on the same dungeon. In the 1980 original
  // a closed door blocks and is opened by bumping; here corridors are walkable
  // stone, so a door cell is the only obstacle on them.
  const doors = []
  const placeDoor = (x, y) => {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return
    if (map[y][x] !== '#') return
    if (doors.some(d => d.x === x && d.y === y)) return
    map[y][x] = '+'
    doors.push({ x, y })
  }
  for (const seg of segments) {
    if ('x1' in seg) {
      const len = Math.abs(seg.x2 - seg.x1)
      if (len < 2) continue
      placeDoor(seg.x1 + Math.floor((seg.x2 - seg.x1) / 2), seg.y)
    } else {
      const len = Math.abs(seg.y2 - seg.y1)
      if (len < 2) continue
      placeDoor(seg.x, seg.y1 + Math.floor((seg.y2 - seg.y1) / 2))
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
      const wt = rng(0, WEAPON_TYPES.length - 1)
      item = { type: ')', subtype: wt, name: WEAPON_TYPES[wt].name, dmg: WEAPON_TYPES[wt].dmg, bonus: 0 }
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
      chasing: false, moved: false,
    })
  }

  // Start in first room
  const sr = rooms[0]
  const startX = rng(sr.x + 1, sr.x + sr.w - 2)
  const startY = rng(sr.y + 1, sr.y + sr.h - 2)

  const explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
  const visible = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))

  return { map, rooms, items, monsters, startX, startY, explored, visible }
}

export function digH(map, x1, x2, y) {
  const step = x1 <= x2 ? 1 : -1
  for (let x = x1; x !== x2 + step; x += step) {
    if (map[y] && map[y][x] === ' ') map[y][x] = '#'
  }
}

export function digV(map, y1, y2, x) {
  const step = y1 <= y2 ? 1 : -1
  for (let y = y1; y !== y2 + step; y += step) {
    if (map[y] && map[y][x] === ' ') map[y][x] = '#'
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
  const { map, rooms, items, monsters, startX, startY, explored, visible } = dungeon

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
    map, rooms, items, monsters,
    explored, visible,
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
      confused: 0, blind: 0, haste: 0, sleeping: 0,
    },
    messages: ['Welcome to the Dungeons of Doom!  Press ? for help.'],
    potionColorMap,
    scrollTitleMap,
    identifiedPotions: {},
    identifiedScrolls: {},
    finalScore: 0,
  }
}

// ============================================================
// HELPERS
// ============================================================
export function addMsg(state, msg) {
  return { ...state, messages: [...state.messages.slice(-9), msg] }
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
  if (item.type === ')') return `${item.name}${item.bonus ? ` (+${item.bonus})` : ''}`
  if (item.type === '[') return `${item.name}${item.bonus ? ` (+${item.bonus})` : ''}`
  if (item.type === '*') return `${item.amount} gold pieces`
  if (item.type === ':') return 'food ration'
  if (item.type === '/') return 'wand'
  if (item.type === '=') return 'ring'
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
            color = COLORS[itm.type] || '#aaaaaa'
          } else {
            char = map[y][x]
            if (char === '.') color = '#3a5a3a'
            else if (char === '#') color = '#666'
            else if (char === '+') color = '#cc8833'
            else if (char === '%') color = '#00dddd'
            else color = '#555'
          }
        } else if (isExp) {
          char = map[y][x]
          if (char === '.') color = '#223322'
          else if (char === '#') color = '#444'
          else if (char === '+') color = '#664400'
          else if (char === '%') color = '#006666'
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
  for (const m of state.monsters) mix(`M${m.letter}@${m.x},${m.y}:${m.hp}:${m.chasing ? 1 : 0}`)
  for (const it of state.items) mix(`I${it.type}${it.x},${it.y}${it.amount || ''}`)
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
      if (newHp <= 0) return { ...s, phase: 'gameover', finalScore: s.player.gold + state.dungeonLevel * 50 }
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
    if (newHp <= 0) {
      return { ...s, player: newPlayer, phase: 'gameover', finalScore: player.gold + state.dungeonLevel * 50 }
    }
    return { ...s, player: newPlayer }
  } else {
    return addMsg(state, `The ${mon.name} misses.`)
  }
}

// ============================================================
// MONSTER AI
// ============================================================
export function advanceMonsters(state, skipId = -1) {
  if (state.phase === 'gameover') return state
  const { player, map, visible } = state
  let s = state
  let newMonsters = [...s.monsters]

  for (let i = 0; i < newMonsters.length; i++) {
    let m = newMonsters[i]
    if (m.id === skipId) continue

    const dist = Math.abs(m.x - player.x) + Math.abs(m.y - player.y)
    const playerVisible = visible[m.y]?.[m.x]

    // Wake up if sees player
    let chasing = m.chasing
    if (playerVisible && dist <= 8) chasing = true

    // Decide action
    if (chasing) {
      // Try to move toward player, or attack if adjacent
      if (dist <= 1.5) {
        // Adjacent - attack
        newMonsters[i] = { ...m, chasing }
        s = { ...s, monsters: newMonsters }
        s = monsterAttack(s, i)
        if (s.phase === 'gameover') return s
        newMonsters = [...s.monsters]
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
          if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue
          const tile = map[ny][nx]
          if (tile === ' ') continue
          if (newMonsters.some(other => other !== m && other.x === nx && other.y === ny)) continue
          if (nx === player.x && ny === player.y) {
            // Attack
            newMonsters[i] = { ...m, chasing }
            s = { ...s, monsters: newMonsters }
            s = monsterAttack(s, i)
            if (s.phase === 'gameover') return s
            newMonsters = [...s.monsters]
            moved = true
            break
          }
          newMonsters[i] = { ...m, x: nx, y: ny, chasing }
          moved = true
          break
        }
        if (!moved) newMonsters[i] = { ...m, chasing }
      }
    } else {
      // Wander randomly
      newMonsters[i] = { ...m, chasing }
      if (rng(0, 2) === 0) {
        const dx = rng(-1, 1), dy = rng(-1, 1)
        const nx = m.x + dx, ny = m.y + dy
        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && map[ny][nx] !== ' ') {
          if (!newMonsters.some((other, ii) => ii !== i && other.x === nx && other.y === ny)) {
            if (!(nx === player.x && ny === player.y)) {
              newMonsters[i] = { ...newMonsters[i], x: nx, y: ny }
            }
          }
        }
      }
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
      return { ...s, player, phase: 'gameover', finalScore: player.gold + state.dungeonLevel * 50 }
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

  if (item.type === '*') {
    return addMsg({
      ...state,
      player: { ...player, gold: player.gold + item.amount },
      items: items.filter((_, i) => i !== idx),
    }, `You pick up ${item.amount} gold pieces.`)
  }

  if (player.inventory.length >= 26) return addMsg(state, "Your pack is full!")
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

  return addMsg({ ...state, phase: 'playing', player: p, identifiedPotions: newIdent },
    `You drink the ${state.potionColorMap[item.subtype]} potion. ${potion.desc}`)
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
        s = { ...s, monsters: [...s.monsters, { id: -1 - s.turn, x: nx, y: ny, letter, name: def.name, hp, maxHp: hp, dmg: def.dmg, ac: def.ac, xp: def.xp, chasing: true }] }
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
  if (item.type !== ')') return { ...state, phase: 'playing' }
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

export function handleEat(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== ':') return { ...state, phase: 'playing' }
  return addMsg({
    ...state,
    phase: 'playing',
    player: { ...player, food: Math.min(2000, player.food + 800), hunger: 'full', inventory: player.inventory.filter((_, i) => i !== invIndex) },
  }, "You eat the food ration. You feel satisfied.")
}

export function handleDescend(state) {
  const { player, map } = state
  if (map[player.y][player.x] !== '%') return addMsg(state, "You see no stairs here.")
  const newLevel = state.dungeonLevel + 1
  const d = generateDungeon(newLevel)
  revealAround(d.startX, d.startY, d.map, d.visible, d.explored, d.rooms)
  return addMsg({
    ...state,
    dungeonLevel: newLevel,
    map: d.map, rooms: d.rooms, items: d.items, monsters: d.monsters,
    visible: d.visible, explored: d.explored,
    player: { ...player, x: d.startX, y: d.startY },
  }, `You descend to dungeon level ${newLevel}.`)
}

// ============================================================
// REDUCER
// ============================================================
// Actions that consume player time (the report's `tick`).
const TURN_ACTIONS = new Set([
  'MOVE', 'PICKUP', 'DESCEND', 'SEARCH', 'DROP_ITEM', 'QUAFF_ITEM',
  'READ_ITEM', 'WIELD_ITEM', 'WEAR_ITEM', 'TAKE_OFF', 'EAT_ITEM',
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

      const nx = player.x + action.dx
      const ny = player.y + action.dy
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return state
      if (map[ny][nx] === ' ') return state

      // Check monster bump
      const mIdx = monsters.findIndex(m => m.x === nx && m.y === ny)
      if (mIdx >= 0) {
        s = playerAttack(s, mIdx)
        if (s.phase === 'gameover') return s
        // Skip this monster in advanceMonsters
        s = tickHunger(s)
        return advanceMonsters(s, state.monsters[mIdx].id)
      }

      // Move player
      const newPlayer = { ...player, x: nx, y: ny }

      // Confused movement
      let finalX = nx, finalY = ny
      if (player.confused > 0) {
        const rdx = rng(-1, 1), rdy = rng(-1, 1)
        const cx = player.x + rdx, cy = player.y + rdy
        if (cx >= 0 && cx < MAP_W && cy >= 0 && cy < MAP_H && map[cy][cx] !== ' ') {
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
    case 'CLOSE_MENU':     return { ...state, phase: 'playing' }

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
    case 'SEARCH': return addMsg(state, "You search the area.")

    case 'SHOW_EAT': {
      if (!state.player.inventory.some(i => i.type === ':')) return addMsg(state, "You have nothing to eat.")
      return { ...state, phase: 'eat' }
    }
    case 'EAT_ITEM': return handleEat(state, action.index)

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
