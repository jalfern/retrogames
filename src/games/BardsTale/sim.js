// THE BARD'S TALE — the pure heart: state + discrete command -> new state +
// events. No Math.random (mulberry only, inside dungeons.js). Round-based
// combat at ranges: monsters stand 10/20/30/40 ft away (bands 1..4); melee
// needs band 1, bows shoot any band, spells ignore range. Every swing, heal,
// note and coin is a ledger entry the harness recomputes independently.

import { makeTown, genFloor, FLOORS, MOBS } from './dungeons.js'

export { FLOORS, MOBS, makeTown }
export const W = 256
export const H = 224
export const BANDS = [10, 20, 30, 40]   // ft, index 0 = melee range

export const CFG = {
    dmgFloor: 1,
    potionHeal: 26,
    aleCost: 10, roundCost: 25, roundAles: 3,
    healCost: 30, raiseCost: 50,
    xpNext: (lvl) => 100 * lvl * lvl,
    lvlHp: 7, lvlMp: 3, lvlAtk: 2, lvlDef: 1,
    spPerLvl: 1,
    boardHp: 5, boardMp: 2,
    fleeCost: 5,
    songHeal: 3,
    towerFloors: [0, 1, 2, 3, 4],   // clear these and the Review Board grants the tower key
}

export const CLASSES = {
    warrior: { name: 'WARRIOR', hp: 34, mp: 0, atk: 8, def: 5, spd: 4 },
    paladin: { name: 'PALADIN', hp: 30, mp: 6, atk: 7, def: 5, spd: 4 },
    rogue: { name: 'ROGUE', hp: 22, mp: 0, atk: 8, def: 3, spd: 8 },
    bard: { name: 'BARD', hp: 20, mp: 8, atk: 5, def: 3, spd: 6 },
    hunter: { name: 'HUNTER', hp: 24, mp: 0, atk: 8, def: 3, spd: 7, bow: true },
    monk: { name: 'MONK', hp: 26, mp: 4, atk: 7, def: 4, spd: 7 },
    conjurer: { name: 'CONJURER', hp: 16, mp: 14, atk: 4, def: 2, spd: 5 },
    magician: { name: 'MAGICIAN', hp: 14, mp: 16, atk: 3, def: 2, spd: 5 },
}

// four-letter codes, as in the original: you cast by the code
export const SPELLS = {
    MAFL: { name: 'MAGIC FLAME', cost: 6, dmg: 18, who: ['conjurer', 'sorcerer'] },
    DISR: { name: 'DISRUPTION', cost: 9, dmg: 26, who: ['conjurer', 'sorcerer'] },
    ARFI: { name: 'MAGIC ARROW', cost: 4, dmg: 13, who: ['magician', 'wizard'] },
    CANI: { name: 'FROST RUNE', cost: 7, dmg: 19, who: ['magician', 'wizard'] },
    HEAL: { name: 'HEALING', cost: 5, heal: 22, who: ['paladin', 'monk'] },
    PROT: { name: 'PROTECTION', cost: 4, buff: 'def', who: ['paladin', 'monk'] },
    // tier II — granted by the Review Board conversions
    FLMB: { name: 'FLAME SHIELD BLAST', cost: 12, dmg: 34, who: ['sorcerer'] },
    KILL: { name: 'KILL', cost: 16, dmg: 48, who: ['sorcerer'] },
    ARLI: { name: 'ARROW STORM', cost: 11, dmg: 30, who: ['wizard'] },
    FRGB: { name: 'FREEZING CLOUD', cost: 13, dmg: 26, slow: 2, who: ['wizard'] },
}

export const SONGS = [
    { id: 'canto', name: 'CANTO E VITA', text: 'heals 3 HP each round' },
    { id: 'steel', name: 'BALLAD - STEEL SKIN', text: '+2 party defense' },
    { id: 'jack', name: 'MARCH - BLACK JACK', text: '+2 party attack' },
    { id: 'lament', name: 'LAMENT O\' THE DARK MAGE', text: 'monsters hit 2 softer' },
    { id: 'lull', name: 'LULLABY OF LICHEN LORD', text: 'monsters advance slower' },
]

export const GEAR = [
    { id: 'm1', name: 'LEATHER ARMOR', def: 1, cost: 50 },
    { id: 'm2', name: 'BROAD SWORD', atk: 2, cost: 80 },
    { id: 'm3', name: 'CHAIN MAIL', def: 2, cost: 120 },
    { id: 'm4', name: 'PLATE ARMOR', def: 3, cost: 200 },
]

const NAMES = ['THANREL', 'MIRABEL', 'OSRIC', 'GWENDA', 'BORAM', 'ELARA', 'KEOGH', 'SORSCHA', 'DUNCAN', 'MAIRIS', 'FIONN', 'CONCH']

const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1]
export const DX = HX, DY = HY

// default party (attract demo + harness): the classic six
export const DEFAULT_ROSTER = ['warrior', 'paladin', 'rogue', 'bard', 'hunter', 'magician']

export function makeRun(roster = DEFAULT_ROSTER) {
    const st = {
        tick: 0, end: null, mode: 'town',
        fi: -1, map: makeTown(), x: 7, y: 12, dir: 3, deepest: 0,
        party: roster.map((cls, i) => {
            const c = CLASSES[cls]
            return { i, name: NAMES[i % NAMES.length], cls, hp: c.hp, maxHp: c.hp, mp: c.mp, maxMp: c.mp, atk: c.atk, def: c.def, spd: c.spd, lvl: 1, xp: 0, alive: true }
        }),
        gold: 75, potions: 2, ales: 2, towerKey: false,
        floorsDone: [false, false, false, false, false, false],
        gear: {}, sp: 0,
        song: null, songRounds: 0,
        buffs: { atk: 0, def: 0, regen: 0, soften: 0, slow: 0 },
        band: 0,          // monster distance band 1..4 (0 outside combat)
        combat: null, target: 0,
        menu: null,
        explored: new Set(),
        ambSeen: new Set(), strSeen: new Set(), keySeen: new Set(), taken: new Set(),
        ledger: { dealt: 0, taken: 0, heals: 0, casts: 0, songs: 0, alesUsed: 0, potsUsed: 0, slain: 0, goldEarned: 0, goldSpent: 0, descended: 0 },
        events: [],
    }
    markView(st)
    return st
}

export function enterFloor(st, fi) {
    st.fi = fi
    st.deepest = Math.max(st.deepest || 0, fi)
    st.map = genFloor(fi)
    st.hasFloorKey = false
    st.x = st.map.entrance.x; st.y = st.map.entrance.y; st.dir = 0
    st.explored = new Set()
    st.ambSeen = new Set()
    st.strSeen = new Set(); st.keySeen = new Set(); st.taken = new Set()
    const t = st.y * st.map.size + st.x
    if (st.floorsDone[fi]) {
        st.strSeen.add(st.map.strong.y * st.map.size + st.map.strong.x)
        for (const a of st.map.ambushes) st.ambSeen.add(a.y * st.map.size + a.x)
    } else if (st.map.strong && st.map.strong.y === st.y && st.map.strong.x === st.x) st.strSeen.add(t)
    markView(st)
    st.events.push({ type: 'descend', floor: fi, name: st.map.name })
    st.ledger.descended++
}

function markView(st) {
    const size = st.map.size || st.map.w
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const x = st.x + dx, y = st.y + dy
            if (x >= 0 && y >= 0 && x < size && y < size && !st.map.wall(x, y)) st.explored.add(y * size + x)
        }
    }
}

export const heroAtk = (h, st) => h.atk + st.buffs.atk + (st.gear.m2 ? GEAR[1].atk : 0)
export const heroDef = (h, st) => h.def + st.buffs.def + gearDef(st)
export const gearDef = (st) => (st.gear.m1 ? 1 : 0) + (st.gear.m3 ? 2 : 0) + (st.gear.m4 ? 3 : 0)
export const knownSpells = (st) => Object.entries(SPELLS).filter(([, s]) => st.party.some((h) => h.alive && s.who.includes(h.cls)))
export const living = (st) => st.party.filter((h) => h.alive)

function spend(st, n) { st.gold -= n; st.ledger.goldSpent += n }

function gainXp(st, n) {
    for (const h of st.party) {
        if (!h.alive) continue
        h.xp += n
        while (h.xp >= CFG.xpNext(h.lvl)) {
            h.xp -= CFG.xpNext(h.lvl)
            h.lvl++
            h.maxHp += CFG.lvlHp; h.hp = Math.min(h.maxHp, h.hp + CFG.lvlHp)
            h.maxMp += CFG.lvlMp; h.mp = Math.min(h.maxMp, h.mp + CFG.lvlMp)
            h.atk += CFG.lvlAtk; h.def += CFG.lvlDef
            st.sp += CFG.spPerLvl
            st.events.push({ type: 'levelup', who: h.name, lvl: h.lvl })
        }
    }
}

// ------------------------------------------------------------------ combat ----
function startCombat(st, group, boss, strong) {
    st.combat = {
        boss: !!boss,
        strong: !!strong,
        round: 0,
        mobs: group.map((k, i) => {
            const m = MOBS[k]
            return { id: i, key: k, name: m.name, art: m.art, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, spd: m.spd, xp: m.xp, band: Math.min(4, m.range + 1), slowed: 0 }
        }),
    }
    st.band = Math.max(...group.map((k) => MOBS[k].range))
    st.target = 0
    st.mode = 'combat'
    st.events.push({ type: 'ambush', boss: !!boss, strong: !!strong, group: group.map((k) => MOBS[k].name) })
}

function firstAliveEnemy(st) {
    for (const m of st.combat.mobs) if (m.hp > 0) return m
    return null
}

const tgt = (st) => {
    const t = st.combat.mobs[st.target]
    if (t && t.hp > 0) return t
    return firstAliveEnemy(st)
}

function applyDmgHero(st, h, raw) {
    const d = Math.min(h.hp, Math.max(CFG.dmgFloor, raw - heroDef(h, st) - st.buffs.soften))
    h.hp -= d
    st.ledger.taken += d
    st.events.push({ type: 'hit', who: h.name, d })
    if (h.hp <= 0) { h.hp = 0; h.alive = false; st.events.push({ type: 'fall', who: h.name }) }
    return d
}

function killMob(st, m) {
    m.hp = 0
    st.ledger.slain++
    st.events.push({ type: 'slay', mob: m.id, name: m.name, xp: m.xp })
    gainXp(st, m.xp)
}

function singer(st) { return st.party.find((h) => h.alive && h.cls === 'bard') }

function resolveRound(st, cmd) {
    const c = st.combat
    c.round++
    const dealt = [], taken = []
    // the song: one drink per round, and it lands before the blades
    let sung = null
    if (cmd.startsWith('song:') && singer(st) && st.ales > 0) {
        const id = cmd.slice(5)
        st.ales--
        st.ledger.alesUsed++
        st.ledger.songs++
        sung = id
        st.song = id
        st.songRounds = 999
        st.events.push({ type: 'song', id })
    }
    if (st.combat.mobs.some((m) => m.hp > 0) && cmd.startsWith('cast:')) {
        const code = cmd.slice(5)
        const sp = SPELLS[code]
        const caster = sp && living(st).filter((h) => sp.who.includes(h.cls) && h.mp >= sp.cost).sort((a, b) => b.mp - a.mp || a.i - b.i)[0]
        if (!sp) st.events.push({ type: 'badCode', code })
        else if (!caster) st.events.push({ type: 'noMana', code })
        else {
            caster.mp -= sp.cost
            st.ledger.casts++
            if (sp.dmg) {
                const t = tgt(st)
                if (t) {
                    const d = Math.min(t.hp, sp.dmg)
                    t.hp -= d
                    dealt.push({ to: t.id, d })
                    st.events.push({ type: 'cast', code, who: caster.name, mob: t.id, d })
                    if (sp.slow) { t.slowed = sp.slow }
                    if (t.hp <= 0) killMob(st, t)
                }
            } else if (sp.heal) {
                const hurt = living(st).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
                if (hurt && hurt.hp < hurt.maxHp) {
                    const got = Math.min(sp.heal, hurt.maxHp - hurt.hp)
                    hurt.hp += got
                    st.ledger.heals += got
                    st.events.push({ type: 'heal', who: caster.name, on: hurt.name, got })
                }
            } else if (sp.buff === 'def') {
                st.buffs.def += 2
                st.events.push({ type: 'buff', what: 'def', n: 2 })
            }
        }
    }
    const order = [...living(st).map((h) => ({ h, hero: true, s: h.spd })), ...c.mobs.filter((m) => m.hp > 0).map((m) => ({ m, hero: false, s: Math.max(1, m.spd - (m.slowed > 0 ? 3 : 0)) }))]
        .sort((a, b) => b.s - a.s || (a.hero ? -1 : b.hero ? 1 : 0))
    for (const o of order) {
        if (st.mode !== 'combat' || !c.mobs.some((m) => m.hp > 0)) break
        if (o.hero) {
            if (cmd === 'advance' || cmd === 'retreat' || cmd === 'flee') continue
            const t = tgt(st)
            if (!t) break
            if (o.h.cls === 'hunter' && st.band > 1 && cmd !== 'attack') {
                // a hunter's bow: any range, lighter shot
                const d = Math.min(t.hp, Math.max(CFG.dmgFloor, Math.floor(heroAtk(o.h, st) * 0.7) - t.def))
                t.hp -= d; dealt.push({ to: t.id, d })
                st.events.push({ type: 'shot', who: o.h.name, mob: t.id, d })
                if (t.hp <= 0) killMob(st, t)
            } else if (st.band === 1) {
                const d = Math.min(t.hp, Math.max(CFG.dmgFloor, heroAtk(o.h, st) - t.def))
                t.hp -= d; dealt.push({ to: t.id, d })
                st.events.push({ type: 'strike', who: o.h.name, mob: t.id, d })
                if (t.hp <= 0) killMob(st, t)
            }
        } else if (o.m.hp > 0) {
            if (st.band === 1) {
                const prey = [...living(st)].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.i - b.i)[0]
                if (prey) taken.push({ from: o.m.id, ...{ d: applyDmgHero(st, prey, o.m.atk) }, who: prey.name })
            }
        }
    }
    // movement after the blades
    if (cmd === 'advance') st.band = Math.max(1, st.band - 1)
    if (cmd === 'retreat') st.band = Math.min(4, st.band + 1)
    if (cmd === 'potion' && st.potions > 0) {
        const hurt = [...living(st)].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
        if (hurt && hurt.hp < hurt.maxHp) {
            st.potions--
            st.ledger.potsUsed++
            const got = Math.min(CFG.potionHeal, hurt.maxHp - hurt.hp)
            hurt.hp += got
            st.ledger.heals += got
            st.events.push({ type: 'potion', who: hurt.name, got })
        }
    }
    // monsters close the distance unless already locked; the Lullaby slows them
    if (st.band > 1) {
        const lull = st.song === 'lull'
        if (lull && st.ales > 0) {
            st.ales--; st.ledger.alesUsed++
            if (st.tick % 2 === 0) st.band = Math.max(1, st.band - 1)
        } else st.band = Math.max(1, st.band - 1)
    }
    // songs keep working
    if (st.song === 'canto') {
        if (st.ales > 0) {
            st.ales--; st.ledger.alesUsed++
            for (const h of living(st)) {
                if (h.hp < h.maxHp) {
                    const got = Math.min(CFG.songHeal, h.maxHp - h.hp)
                    h.hp += got; st.ledger.heals += got
                }
            }
            st.events.push({ type: 'canto' })
        } else st.events.push({ type: 'songDry', id: st.song })
    }
    if (st.song === 'steel') st.buffs.def = Math.max(st.buffs.def, 2)
    if (st.song === 'jack') st.buffs.atk = Math.max(st.buffs.atk, 2)
    if (st.song === 'lament') st.buffs.soften = Math.max(st.buffs.soften, 2)
    const dSum = dealt.reduce((n, e) => n + e.d, 0)
    const tSum = taken.reduce((n, e) => n + e.d, 0)
    st.ledger.dealt += dSum
    st.ledger.taken += tSum
    st.events.push({ type: 'round', n: c.round, band: st.band, dealt, taken, dSum, tSum, sung })
    if (!c.mobs.some((m) => m.hp > 0)) winCombat(st)
    else if (!living(st).length) { st.mode = 'over'; st.end = 'dead' }
}

function winCombat(st) {
    const boss = st.combat.boss, strong = st.combat.strong
    const name = st.map && st.map.name
    st.events.push({ type: 'victory', boss, strong })
    if (strong && st.fi >= 0) st.floorsDone[st.fi] = true
    st.combat = null
    st.band = 0
    st.buffs = { atk: 0, def: 0, regen: 0, soften: 0, slow: 0 }
    st.song = null
    if (boss) { st.mode = 'over'; st.end = 'win'; st.events.push({ type: 'thaw', name }); return }
    st.mode = st.fi >= 0 ? 'dungeon' : 'town'
}

// -------------------------------------------------------------------- map ----
function settleTile(st) {
    const size = st.map.size || st.map.w
    const t = st.y * size + st.x
    if (st.fi >= 0) {
        const m = st.map
        if (m.boss && m.boss.y === st.y && m.boss.x === st.x) { startCombat(st, ['MANGAR'], true, false); return }
        if (m.strong && m.strong.y === st.y && m.strong.x === st.x && !st.strSeen.has(t)) {
            st.strSeen.add(t)
            startCombat(st, [m.strong.key], false, true)
            return
        }
        if (m.key && m.key.y === st.y && m.key.x === st.x && !st.keySeen.has(t)) {
            st.keySeen.add(t); st.hasFloorKey = true
            st.events.push({ type: 'gotFloorKey' })
        }
        if (m.pots.some((p) => p.y === st.y && p.x === st.x) && !st.taken.has(t)) { st.taken.add(t); st.pots++; st.events.push({ type: 'pickupPotion', potions: st.potions }) }
        if (m.ales.some((p) => p.y === st.y && p.x === st.x) && !st.taken.has(t)) { st.taken.add(t); st.ales++; st.events.push({ type: 'pickupAle', ales: st.ales }) }
        if (m.treasure.some((p) => p.y === st.y && p.x === st.x) && !st.taken.has(t)) { st.taken.add(t);
            const g = 15 + ((st.x * 7 + st.y * 13 + st.fi * 31) % 26)
            st.gold += g; st.ledger.goldEarned += g
            st.events.push({ type: 'treasure', gold: g })
        }
        const amb = m.ambushes.find((a) => a.y === st.y && a.x === st.x)
        if (amb && !st.ambSeen.has(t)) {
            st.ambSeen.add(t)
            startCombat(st, amb.group, false, false)
        }
    } else {
        const sp = st.map.specials.get(t)
        if (sp) st.events.push({ type: 'atDoor', kind: sp.kind, name: sp.name })
    }
}

export function stateHash(st) {
    let h = 0x811c9dc5
    const mix = (n) => { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193) }
    mix(st.tick); mix(st.fi + 1); mix(st.x); mix(st.y); mix(st.dir); mix(st.gold); mix(st.potions); mix(st.ales); mix(st.band)
    if (st.end) mix(st.end === 'win' ? 777 : 666)
    for (const p of st.party) { mix(p.hp); mix(p.mp); mix(p.lvl); mix(p.alive ? 1 : 0) }
    if (st.combat) for (const m of st.combat.mobs) mix(m.hp)
    mix(st.ledger.dealt * 131 + st.ledger.taken)
    return (h >>> 0).toString(16)
}

export function cloneState(st) {
    const c = JSON.parse(JSON.stringify({ ...st, map: null, explored: [...st.explored], events: [] }))
    c.map = st.fi >= 0 ? genFloor(st.fi) : makeTown()
    c.explored = new Set(st.explored)
    c.ambSeen = new Set(st.ambSeen); c.strSeen = new Set(st.strSeen); c.keySeen = new Set(st.keySeen); c.taken = new Set(st.taken)
    return c
}

function doorBars(st, nx, ny) {
    const m = st.map
    return st.fi >= 0 && m.locked && m.locked.y === ny && m.locked.x === nx && !st.hasFloorKey
}

// ------------------------------------------------------------------ step ----
export function step(st, cmd) {
    st.tick++
    if (st.end) return
    if (st.menu) { stepMenu(st, cmd); return }
    if (st.mode === 'combat') { stepCombat(st, cmd); return }
    if (st.mode !== 'town' && st.mode !== 'dungeon') return

    if (cmd === 'left' || cmd === 'right') { st.dir = (st.dir + (cmd === 'left' ? 3 : 1)) % 4; markView(st); return }
    if (cmd === 'fwd' || cmd === 'back') {
        const s = cmd === 'fwd' ? 0 : 2
        const nx = st.x + HX[(st.dir + s) % 4], ny = st.y + HY[(st.dir + s) % 4]
        if (!st.map.wall(nx, ny) && !doorBars(st, nx, ny)) { st.x = nx; st.y = ny; markView(st); settleTile(st) }
        else st.events.push({ type: st.map.wall(nx, ny) ? 'bump' : 'doorLocked' })
        return
    }
    if (cmd === 'potion') {
        if (st.potions <= 0) { st.events.push({ type: 'empty' }); return }
        const hurt = [...living(st)].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
        if (hurt && hurt.hp < hurt.maxHp) {
            st.potions--; st.ledger.potsUsed++
            const got = Math.min(CFG.potionHeal, hurt.maxHp - hurt.hp)
            hurt.hp += got; st.ledger.heals += got
            st.events.push({ type: 'potion', who: hurt.name, got })
        }
        return
    }
    if (cmd.startsWith('song:')) {
        const id = cmd.slice(5)
        if (!SONGS.some((s) => s.id === id)) { st.events.push({ type: 'noSong' }); return }
        if (!singer(st)) { st.events.push({ type: 'noBard' }); return }
        if (st.ales <= 0) { st.events.push({ type: 'noAle' }); return }
        st.ales--; st.ledger.alesUsed++; st.ledger.songs++
        st.song = id
        st.events.push({ type: 'song', id })
        if (id === 'steel') st.buffs.def = 2
        if (id === 'jack') st.buffs.atk = 2
        if (id === 'lament') st.buffs.soften = 2
        if (id === 'lull') st.buffs.slow = 1
        return
    }
    if (cmd === 'use') {
        const size = st.map.size || st.map.w
        const t = st.y * size + st.x
        const sp = st.map.specials && st.map.specials.get(t)
        if (sp) {
            if (sp.kind === 'sewer') { enterFloor(st, 0); st.mode = 'dungeon'; return }
            if (sp.kind === 'towergate') {
                if (st.towerKey) { enterFloor(st, 5); st.mode = 'dungeon'; return }
                st.events.push({ type: 'lockedGate' })
                return
            }
            st.menu = { kind: sp.kind, name: sp.name }
            st.events.push({ type: 'menu', kind: sp.kind })
            return
        }
        if (st.fi >= 0) {
            const m = st.map
            if (m.locked && ((m.locked.y === st.y && m.locked.x === st.x) || (m.locked.y === st.y + HY[st.dir] && m.locked.x === st.x + HX[st.dir]))) {
                st.events.push({ type: 'door', open: !!st.hasFloorKey })
                return
            }            if (m.exit && m.exit.y === st.y && m.exit.x === st.x) {
                st.fi = -1
                st.map = makeTown()
                st.x = st.map.spawn.x; st.y = st.map.spawn.y; st.dir = st.map.spawn.dir
                st.explored = new Set()
                markView(st)
                st.mode = 'town'
                st.hasFloorKey = false
                st.events.push({ type: 'ascend' })
                return
            }
            if (m.stairs && m.stairs.y === st.y && m.stairs.x === st.x) {
                st.floorsDone[st.fi] = true
                enterFloor(st, st.fi + 1)
                st.mode = 'dungeon'
                return
            }
        }
        st.events.push({ type: 'nothing' })
        return
    }
    if (cmd === 'wait') return
}

function stepCombat(st, cmd) {
    if (cmd === 'target+' || cmd === 'target-') {
        const n = st.combat.mobs.length
        let t = st.target
        for (let i = 1; i <= n; i++) {
            const cand = (t + (cmd === 'target+' ? i : n - i)) % n
            if (st.combat.mobs[cand].hp > 0) { t = cand; break }
        }
        st.target = t
        return
    }
    if (cmd === 'flee') {
        if (st.combat.boss) { st.events.push({ type: 'noback' }); return }
        const rear = [...living(st)].sort((a, b) => a.spd - b.spd)[0]
        if (rear) applyDmgHero(st, rear, CFG.fleeCost)
        st.events.push({ type: 'fled' })
        st.combat = null; st.band = 0
        st.buffs = { atk: 0, def: 0, regen: 0, soften: 0, slow: 0 }
        st.song = null
        st.mode = st.fi >= 0 ? 'dungeon' : 'town'
        if (!living(st).length) { st.mode = 'over'; st.end = 'dead' }
        return
    }
    resolveRound(st, cmd)
}

function stepMenu(st, cmd) {
    const k = st.menu.kind
    if (cmd === 'm0' || cmd === 'close') { st.menu = null; return }
    if (k === 'garth') {
        const g = GEAR.find((x) => x.id === cmd)
        if (!g) return
        if (st.gear[g.id]) { st.events.push({ type: 'owned', name: g.name }); return }
        if (st.gold < g.cost) { st.events.push({ type: 'poor', name: g.name }); return }
        spend(st, g.cost); st.gear[g.id] = true
        st.events.push({ type: 'buy', name: g.name, cost: g.cost })
        return
    }
    if (k === 'tavern') {
        if (cmd === 'm1') {
            if (st.gold < CFG.aleCost) { st.events.push({ type: 'poor', name: 'ALE' }); return }
            spend(st, CFG.aleCost); st.ales++
            st.events.push({ type: 'ale', ales: st.ales })
        } else if (cmd === 'm2') {
            if (st.gold < CFG.roundCost) { st.events.push({ type: 'poor', name: 'ROUNDS' }); return }
            spend(st, CFG.roundCost); st.ales += CFG.roundAles
            st.events.push({ type: 'ale', ales: st.ales })
        } else if (cmd === 'm3') {
            st.events.push({ type: 'rumor', text: st.towerKey ? 'The gate to Mangar\'s tower stands open.' : 'Mangar\'s tower gate bites shut on the untested. Prove every deep dark first.' })
        }
        return
    }
    if (k === 'temple') {
        if (cmd === 'm1') {
            if (st.gold < CFG.healCost) { st.events.push({ type: 'poor', name: 'HEAL' }); return }
            spend(st, CFG.healCost)
            let healed = 0
            for (const h of st.party) {
                if (!h.alive) continue
                const got = h.maxHp - h.hp; healed += got; h.hp = h.maxHp
                h.mp = h.maxMp
            }
            st.ledger.heals += healed
            st.events.push({ type: 'templeHeal', healed })
        } else if (cmd === 'm2') {
            const dead = st.party.find((h) => !h.alive)
            if (!dead) { st.events.push({ type: 'nobodyDead' }); return }
            if (st.gold < CFG.raiseCost) { st.events.push({ type: 'poor', name: 'RAISE' }); return }
            spend(st, CFG.raiseCost)
            dead.alive = true; dead.hp = Math.ceil(dead.maxHp / 2)
            st.events.push({ type: 'raise', who: dead.name })
        }
        return
    }
    if (k === 'board') {
        if (!st.towerKey && CFG.towerFloors.every((f) => st.floorsDone[f])) {
            st.towerKey = true
            st.events.push({ type: 'grantKey' })
        }
        const lowest = [...living(st)].sort((a, b) => a.lvl - b.lvl || a.i - b.i)[0]
        if (!lowest) return
        if (cmd === 'm1' && st.sp >= 1) { st.sp--; lowest.maxHp += CFG.boardHp; lowest.hp += CFG.boardHp; st.events.push({ type: 'boost', who: lowest.name, what: 'hp' }) }
        else if (cmd === 'm2' && st.sp >= 1) { st.sp--; lowest.maxMp += CFG.boardMp; lowest.mp += CFG.boardMp; st.events.push({ type: 'boost', who: lowest.name, what: 'mp' }) }
        else if (cmd === 'm3' && st.sp >= 2) { st.sp -= 2; lowest.atk += 1; st.events.push({ type: 'boost', who: lowest.name, what: 'atk' }) }
        else if (cmd === 'm4' && st.sp >= 2) { st.sp -= 2; lowest.def += 1; st.events.push({ type: 'boost', who: lowest.name, what: 'def' }) }
        else if (cmd === 'm5') {
            const cand = st.party.find((h) => h.alive && (h.cls === 'conjurer' || h.cls === 'magician') && h.lvl >= 3)
            if (!cand || st.sp < 3) { st.events.push({ type: 'noConvert' }); return }
            st.sp -= 3
            cand.cls = cand.cls === 'conjurer' ? 'sorcerer' : 'wizard'
            cand.maxMp += 8; cand.mp = cand.maxMp
            st.events.push({ type: 'convert', who: cand.name, to: cand.cls })
        } else st.events.push({ type: 'noPoints' })
        return
    }
    if (k === 'guild') {
        if (cmd === 'm1') { st.events.push({ type: 'guild', text: 'Mangar keeps Skara Brae in winter. The deep darks hold the road to his tower.' }) }
        return
    }
    st.events.push({ type: 'nothing' })
}

// tower-key grant also when descending the last pre-Mangar floor (used before gate)
export function towerReady(st) { return CFG.towerFloors.every((f) => st.floorsDone[f]) }
