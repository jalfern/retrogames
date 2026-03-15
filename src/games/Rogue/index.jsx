import { useReducer, useEffect, useCallback, useRef } from 'react'

// ============================================================
// CONSTANTS
// ============================================================
const MAP_W = 80
const MAP_H = 22

const COLORS = {
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

const MONSTER_DEFS = {
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

const POTION_TYPES = [
  { name: 'healing',          effect: 'heal',         desc: 'You feel better.' },
  { name: 'extra healing',    effect: 'heal2',        desc: 'You feel much better!' },
  { name: 'poison',           effect: 'poison',       desc: 'You feel very sick.' },
  { name: 'strength',         effect: 'strength',     desc: 'You feel stronger.' },
  { name: 'restore strength', effect: 'restore_str',  desc: 'You feel your strength return.' },
  { name: 'blindness',        effect: 'blind',        desc: 'A cloak of darkness falls over your eyes.' },
  { name: 'confusion',        effect: 'confuse',      desc: 'You feel confused.' },
  { name: 'haste self',       effect: 'haste',        desc: 'You feel yourself moving faster.' },
]

const SCROLL_TYPES = [
  { name: 'identify',        effect: 'identify',       desc: 'You feel more knowledgeable.' },
  { name: 'teleportation',   effect: 'teleport',       desc: 'You are whisked away!' },
  { name: 'sleep',           effect: 'sleep',          desc: 'You fall asleep.' },
  { name: 'enchant weapon',  effect: 'enchant_weapon', desc: 'Your weapon glows blue.' },
  { name: 'enchant armor',   effect: 'enchant_armor',  desc: 'Your armor shimmers.' },
  { name: 'create monster',  effect: 'create_monster', desc: 'You hear a strange noise.' },
  { name: 'magic mapping',   effect: 'magic_map',      desc: 'Your surroundings become familiar.' },
]

const WEAPON_TYPES = [
  { name: 'dagger',           dmg: '1d4' },
  { name: 'mace',             dmg: '2d4' },
  { name: 'short sword',      dmg: '1d6' },
  { name: 'long sword',       dmg: '1d8' },
  { name: 'two-handed sword', dmg: '2d6' },
  { name: 'war hammer',       dmg: '2d5' },
]

const ARMOR_TYPES = [
  { name: 'leather armor',   ac: 2 },
  { name: 'ring mail',       ac: 3 },
  { name: 'studded leather', ac: 3 },
  { name: 'chain mail',      ac: 4 },
  { name: 'splint mail',     ac: 6 },
  { name: 'banded mail',     ac: 6 },
  { name: 'plate mail',      ac: 7 },
]

const POTION_COLORS = ['red', 'blue', 'green', 'yellow', 'bubbly', 'smoky', 'fizzy', 'dark', 'clear', 'murky', 'pink', 'white']
const SCROLL_TITLES = ['XIXAXA XOXO', 'ZELGO MER', 'FOOBIE BLETCH', 'NATRIX AN', 'PONCHO WIGG', 'YZAX VORN', 'BLIBBER BLUBBER', 'JUYED AWK']

// ============================================================
// UTILITIES
// ============================================================
function rng(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function rollDice(str) {
  if (!str || str === '0d0') return 0
  const [n, d] = str.split('d').map(Number)
  let t = 0
  for (let i = 0; i < n; i++) t += rng(1, d)
  return t
}

function hpRoll([lo, hi]) {
  return rng(lo, hi)
}

// ============================================================
// DUNGEON GENERATION
// ============================================================
function generateDungeon(dungeonLevel) {
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

  // Connect rooms with L-shaped corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i], b = rooms[i + 1]
    const ax = rng(a.x + 1, a.x + a.w - 2)
    const ay = rng(a.y + 1, a.y + a.h - 2)
    const bx = rng(b.x + 1, b.x + b.w - 2)
    const by = rng(b.y + 1, b.y + b.h - 2)
    if (rng(0, 1) === 0) {
      digH(map, ax, bx, ay)
      digV(map, ay, by, bx)
    } else {
      digV(map, ay, by, ax)
      digH(map, ax, bx, by)
    }
  }

  // Stairs in last room
  const lastRoom = rooms[rooms.length - 1]
  const stairsX = rng(lastRoom.x + 1, lastRoom.x + lastRoom.w - 2)
  const stairsY = rng(lastRoom.y + 1, lastRoom.y + lastRoom.h - 2)
  map[stairsY][stairsX] = '%'

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
      id: i * 1000 + Math.floor(Math.random() * 1000),
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

function digH(map, x1, x2, y) {
  const step = x1 <= x2 ? 1 : -1
  for (let x = x1; x !== x2 + step; x += step) {
    if (map[y] && map[y][x] === ' ') map[y][x] = '#'
  }
}

function digV(map, y1, y2, x) {
  const step = y1 <= y2 ? 1 : -1
  for (let y = y1; y !== y2 + step; y += step) {
    if (map[y] && map[y][x] === ' ') map[y][x] = '#'
  }
}

function revealAround(px, py, map, visible, explored, rooms) {
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
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function createInitialState() {
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
function addMsg(state, msg) {
  return { ...state, messages: [...state.messages.slice(-9), msg] }
}

function getItemName(item, state) {
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

function playerAC(player) {
  const base = player.armor ? player.armor.ac + (player.armor.bonus || 0) : 0
  return 10 - base
}

function xpNeeded(level) {
  const table = [0, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120]
  return table[Math.min(level - 1, table.length - 1)]
}

// ============================================================
// COMBAT
// ============================================================
function playerAttack(state, mIdx) {
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

function monsterAttack(state, mIdx) {
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
function advanceMonsters(state, skipId = -1) {
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
function tickHunger(state) {
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
function handlePickup(state) {
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

function handleDrop(state, index) {
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

function handleQuaff(state, invIndex) {
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

function handleRead(state, invIndex) {
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
        s = { ...s, monsters: [...s.monsters, { id: Date.now(), x: nx, y: ny, letter, name: def.name, hp, maxHp: hp, dmg: def.dmg, ac: def.ac, xp: def.xp, chasing: true }] }
        break
      }
      break
    }
    default: break
  }

  return addMsg(s, `You read the scroll titled '${state.scrollTitleMap[item.subtype]}'. ${scroll.desc}`)
}

function handleWield(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== ')') return { ...state, phase: 'playing' }
  let inv = player.inventory.filter((_, i) => i !== invIndex)
  if (player.weapon) inv = [...inv, player.weapon]
  return addMsg({ ...state, phase: 'playing', player: { ...player, weapon: item, inventory: inv } },
    `You wield the ${item.name}.`)
}

function handleWear(state, invIndex) {
  const { player } = state
  if (invIndex < 0 || invIndex >= player.inventory.length) return { ...state, phase: 'playing' }
  const item = player.inventory[invIndex]
  if (item.type !== '[') return { ...state, phase: 'playing' }
  let inv = player.inventory.filter((_, i) => i !== invIndex)
  if (player.armor) inv = [...inv, player.armor]
  return addMsg({ ...state, phase: 'playing', player: { ...player, armor: item, inventory: inv } },
    `You put on the ${item.name}.`)
}

function handleTakeOff(state) {
  const { player } = state
  if (!player.armor) return addMsg(state, "You're not wearing any armor.")
  const armor = player.armor
  return addMsg({ ...state, player: { ...player, armor: null, inventory: [...player.inventory, armor] } },
    `You take off the ${armor.name}.`)
}

function handleEat(state, invIndex) {
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

function handleDescend(state) {
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
function reducer(state, action) {
  if (state.phase === 'gameover' && action.type !== 'NEW_GAME') return state

  switch (action.type) {
    case 'NEW_GAME': return createInitialState()

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

// ============================================================
// RENDER
// ============================================================
function buildGrid(state) {
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

// ============================================================
// COMPONENT
// ============================================================
export default function RogueGame() {
  const [state, dispatch] = useReducer(reducer, null, createInitialState)
  const containerRef = useRef(null)

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleKey = (e) => {
      const { phase } = state

      // Prevent page scrolling for game keys
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault()
      }

      if (phase === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'NEW_GAME' })
        return
      }

      if (phase === 'inventory') {
        if (e.key === 'Escape' || e.key === 'i' || e.key === ' ') dispatch({ type: 'CLOSE_MENU' })
        return
      }

      if (phase === 'help') {
        if (e.key === 'Escape' || e.key === '?' || e.key === ' ') dispatch({ type: 'CLOSE_MENU' })
        return
      }

      // Menu phases: select by letter
      const menuPhases = { drop: 'DROP_ITEM', quaff: 'QUAFF_ITEM', read: 'READ_ITEM', wield: 'WIELD_ITEM', wear: 'WEAR_ITEM', eat: 'EAT_ITEM' }
      if (menuPhases[phase]) {
        if (e.key === 'Escape') { dispatch({ type: 'CLOSE_MENU' }); return }
        const idx = e.key.charCodeAt(0) - 97 // 'a' = 97
        if (idx >= 0 && idx < 26) dispatch({ type: menuPhases[phase], index: idx })
        return
      }

      // Playing
      switch (e.key) {
        case 'ArrowUp':    case 'k': case '8': dispatch({ type: 'MOVE', dx: 0,  dy: -1 }); break
        case 'ArrowDown':  case 'j': case '2': dispatch({ type: 'MOVE', dx: 0,  dy:  1 }); break
        case 'ArrowLeft':  case 'h': case '4': dispatch({ type: 'MOVE', dx: -1, dy:  0 }); break
        case 'ArrowRight': case 'l': case '6': dispatch({ type: 'MOVE', dx:  1, dy:  0 }); break
        case 'y': case '7': dispatch({ type: 'MOVE', dx: -1, dy: -1 }); break
        case 'u': case '9': dispatch({ type: 'MOVE', dx:  1, dy: -1 }); break
        case 'b': case '1': dispatch({ type: 'MOVE', dx: -1, dy:  1 }); break
        case 'n': case '3': dispatch({ type: 'MOVE', dx:  1, dy:  1 }); break
        case ',': case 't': dispatch({ type: 'PICKUP' }); break
        case 'i': dispatch({ type: 'SHOW_INVENTORY' }); break
        case 'd': dispatch({ type: 'SHOW_DROP' }); break
        case 'q': dispatch({ type: 'SHOW_QUAFF' }); break
        case 'r': dispatch({ type: 'SHOW_READ' }); break
        case 'w': dispatch({ type: 'SHOW_WIELD' }); break
        case 'W': dispatch({ type: 'SHOW_WEAR' }); break
        case 'T': dispatch({ type: 'TAKE_OFF' }); break
        case '>': dispatch({ type: 'DESCEND' }); break
        case 'e': dispatch({ type: 'SHOW_EAT' }); break
        case 's': dispatch({ type: 'SEARCH' }); break
        case '?': dispatch({ type: 'SHOW_HELP' }); break
        case 'Q': dispatch({ type: 'QUIT' }); break
        default: break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [state])

  const { player, phase, messages, dungeonLevel, finalScore } = state

  const base = {
    background: '#000',
    color: '#aaa',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '15px',
    lineHeight: '19px',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
    outline: 'none',
    boxSizing: 'border-box',
  }

  // ── GAME OVER ──────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div ref={containerRef} style={base} tabIndex={0}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ color: '#ff4444', fontSize: '30px', letterSpacing: '4px' }}>✝  GAME OVER  ✝</div>
          <div style={{ color: '#aaa', marginTop: '8px' }}>Slain in the Dungeons of Doom!</div>
          <div style={{ marginTop: '16px', color: '#ccc' }}>
            <div>Dungeon Level: <span style={{ color: '#ffff55' }}>{dungeonLevel}</span></div>
            <div>Gold: <span style={{ color: '#ffff00' }}>{player.gold}</span></div>
            <div>Experience Level: <span style={{ color: '#88ff88' }}>{player.level}</span></div>
          </div>
          <div style={{ color: '#ffffff', fontSize: '22px', marginTop: '12px' }}>
            Final Score: {finalScore}
          </div>
          <div style={{ color: '#555', marginTop: '20px', fontSize: '13px' }}>Press ENTER or SPACE to try again</div>
        </div>
      </div>
    )
  }

  // ── INVENTORY / MENU SCREENS ───────────────────────────────
  const menuPhaseTitle = {
    inventory: 'Inventory',
    drop:   'Drop which item? (press letter, ESC to cancel)',
    quaff:  'Quaff which potion?',
    read:   'Read which scroll?',
    wield:  'Wield which weapon?',
    wear:   'Wear which armor?',
    eat:    'Eat which food?',
  }

  const menuTypeFilter = {
    drop: null, inventory: null,
    quaff: '!', read: '?', wield: ')', wear: '[', eat: ':',
  }

  if (menuPhaseTitle[phase]) {
    const filterType = menuTypeFilter[phase]
    const shown = filterType
      ? player.inventory.map((item, i) => ({ item, i })).filter(({ item }) => item.type === filterType)
      : player.inventory.map((item, i) => ({ item, i }))

    return (
      <div ref={containerRef} style={base} tabIndex={0}>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
            {menuPhaseTitle[phase]}
          </div>
          {shown.length === 0 ? (
            <div style={{ color: '#666' }}>Nothing here.</div>
          ) : (
            shown.map(({ item, i }, listIdx) => (
              <div key={i} style={{ marginBottom: '3px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#888', minWidth: '24px' }}>{String.fromCharCode(97 + listIdx)})</span>
                <span style={{ color: COLORS[item.type] || '#aaa' }}>{item.type}</span>
                <span style={{ color: '#ddd' }}>{getItemName(item, state)}</span>
                {item === player.weapon && <span style={{ color: '#888' }}> (wielding)</span>}
                {item === player.armor  && <span style={{ color: '#888' }}> (wearing)</span>}
              </div>
            ))
          )}
          {phase === 'inventory' && (
            <>
              <div style={{ marginTop: '16px', borderTop: '1px solid #222', paddingTop: '8px' }}>
                <div style={{ color: '#888', fontSize: '13px' }}>Wielding: <span style={{ color: '#aaa' }}>{player.weapon?.name || 'nothing'}</span></div>
                <div style={{ color: '#888', fontSize: '13px' }}>Wearing:  <span style={{ color: '#aaa' }}>{player.armor?.name || 'nothing'}</span></div>
              </div>
              <div style={{ marginTop: '12px', color: '#444', fontSize: '12px' }}>Press i, SPACE, or ESC to close</div>
            </>
          )}
          {phase !== 'inventory' && (
            <div style={{ marginTop: '12px', color: '#444', fontSize: '12px' }}>Press letter to select, ESC to cancel</div>
          )}
        </div>
      </div>
    )
  }

  // ── HELP SCREEN ────────────────────────────────────────────
  if (phase === 'help') {
    const keys = [
      ['h/j/k/l', 'Move left/down/up/right'],
      ['y/u/b/n', 'Move diagonally (NW/NE/SW/SE)'],
      ['Arrow Keys', 'Move (also numpad 1-9)'],
      [',  or  t', 'Pick up item'],
      ['i', 'Show inventory'],
      ['d', 'Drop item'],
      ['e', 'Eat food'],
      ['q', 'Quaff (drink) a potion'],
      ['r', 'Read a scroll'],
      ['w', 'Wield a weapon'],
      ['W', 'Wear armor'],
      ['T', 'Take off armor'],
      ['>', 'Go down stairs (%)'],
      ['s', 'Search for hidden doors'],
      ['?', 'This help screen'],
      ['Q', 'Quit the game'],
    ]
    const syms = [
      ['@', COLORS['@'], 'You, the adventurer'],
      ['#', '#666', 'Wall or corridor'],
      ['.', '#3a5a3a', 'Floor'],
      ['+', COLORS['+'], 'Door'],
      ['%', COLORS['%'], 'Stairs down'],
      ['*', COLORS['*'], 'Gold'],
      ['!', COLORS['!'], 'Potion'],
      ['?', COLORS['?'], 'Scroll'],
      [')', COLORS[')'], 'Weapon'],
      ['[', COLORS['['], 'Armor'],
      [':', COLORS[':'], 'Food'],
      ['A-Z', '#ff4444', 'Monsters'],
    ]
    return (
      <div ref={containerRef} style={base} tabIndex={0}>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px' }}>Commands</div>
            {keys.map(([k, d], i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '3px' }}>
                <span style={{ color: '#ffcc44', minWidth: '100px', fontSize: '13px' }}>{k}</span>
                <span style={{ color: '#bbb', fontSize: '13px' }}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px' }}>Symbols</div>
            {syms.map(([sym, col, name], i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '3px' }}>
                <span style={{ color: col, minWidth: '30px', fontWeight: 'bold', fontSize: '14px' }}>{sym}</span>
                <span style={{ color: '#bbb', fontSize: '13px' }}>{name}</span>
              </div>
            ))}
            <div style={{ marginTop: '16px', color: '#444', fontSize: '12px' }}>Press ?, SPACE, or ESC to close</div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN GAME VIEW ─────────────────────────────────────────
  const grid = buildGrid(state)
  const lastMsg = messages[messages.length - 1] || ''
  const hungerStr = player.hunger !== 'full' ? ` [${player.hunger.toUpperCase()}]` : ''
  const statusStr = `Dlvl:${dungeonLevel}  Gold:${player.gold}  Hp:${player.hp}(${player.maxHp})  Str:${player.str}(${player.maxStr})  Arm:${playerAC(player)}  Exp:${player.level}/${player.exp}${hungerStr}`

  return (
    <div ref={containerRef} style={base} tabIndex={0} onClick={() => containerRef.current?.focus()}>
      {/* Message line */}
      <div style={{
        height: '20px', padding: '1px 6px', flexShrink: 0,
        color: '#dddd88', fontSize: '13px', lineHeight: '18px',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {lastMsg}
      </div>

      {/* Map */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <pre style={{
          margin: 0, padding: 0,
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '15px', lineHeight: '19px',
          letterSpacing: '1px',
        }}>
          {grid.map((row, y) => (
            <div key={y} style={{ height: '19px', display: 'flex' }}>
              {row.map((cell, x) => (
                <span key={x} style={{ color: cell.color, minWidth: '9.6px', display: 'inline-block', textAlign: 'center' }}>
                  {cell.char}
                </span>
              ))}
            </div>
          ))}
        </pre>
      </div>

      {/* Status bar */}
      <div style={{
        height: '20px', padding: '1px 6px', flexShrink: 0,
        color: '#88ee88', fontSize: '12px', lineHeight: '18px',
        borderTop: '1px solid #222', overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        {statusStr}
      </div>
    </div>
  )
}
