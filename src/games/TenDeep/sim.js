// TEN-DEEP — the pure heart: state + discrete command -> new state + events.
// Zero Math.random (the only dice are dungeon.js's seeded mulberry, and only
// at floor generation). Every combat round is a ledger entry the harness
// recomputes independently: damage dealt == damage taken, always.
//
// The party of six walks a grid in first person. Commands are human cadence:
//   map:    fwd back left right use potion
//   combat: attack fire heal potion flee  (targets: target+ / target-)
// Each combat command resolves ONE full round (all survivors act in SPD
// order, heroes before monsters on a tie). Combat is chess with HP pools:
// focus fire, MP and potions are the resource puzzle — which is exactly what
// the slack rule re-grades with one fewer of every supply consumed.

import { genFloor, MOBS, FLOORS, SIZE, mulberry32 } from './dungeon.js'
import { BUILDINGS, SERVICES, rollRecruit, serviceHeroOk, TOWN } from './town.js'

export { SIZE, BUILDINGS, SERVICES, TOWN }
export const W = 256
export const H = 224
export const VIEWD = 6

export const CFG = {
    dmgFloor: 1,        // every honest swing lands at least this
    potionHeal: 26,
    springMp: 10,
    fireCost: 3,
    healCost: 4,
    fleeCost: 6,        // monsters' parting shot when the party runs (normal fights)
    xpBase: 100,        // next level at xpBase * lvl^2
    lvlHp: 8, lvlMp: 3, lvlAtk: 2, lvlDef: 1,
    healAmt: 16,        // + lvl*3
    // --- THE RIM (stage 2, #1127): gold prices and the wipe tax -----------
    goldPerXp: 4,       // every mob pays goldPerXp gold per XP it grants
    hireCost: 40,       // tavern: replace a fallen hero with a fresh roll
    mournCost: 200,     // temple: 200 × lvl — the dead return at 1 hp
    restoreCost: 400,   // temple: 400 × lvl — the dead return whole
    mendCost: 30,       // temple: fill one hero's HP
    refreshCost: 25,    // temple: fill one hero's MP
    trainCost: 100,     // grounds: 100 × next level, and the XP is spent
    potionCost: 25,     // alchemist: one crimson vial
    wipeTax: 2,         // a wipe costs half the purse (the dead-body tax)
}

export const purse = (st) => st.party.reduce((n, h) => n + h.gold, 0)

export const HEROES0 = [
    { name: 'THANREL', hp: 36, mp: 2, atk: 8, def: 4, spd: 3, gold: 20 },
    { name: 'MIRABEL', hp: 28, mp: 14, atk: 6, def: 2, spd: 5, gold: 20 },
    { name: 'OSRIC',   hp: 30, mp: 10, atk: 7, def: 3, spd: 6, gold: 20 },
    { name: 'GWENDA',  hp: 24, mp: 18, atk: 5, def: 2, spd: 8, gold: 20 },
    { name: 'BORAM',   hp: 34, mp: 6, atk: 9, def: 3, spd: 4, gold: 20 },
    { name: 'ELARA',   hp: 26, mp: 12, atk: 6, def: 2, spd: 7, gold: 20 },
]

const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1]    // dir: 0=E 1=S 2=W 3=N

// the throne on the last deep: the King and his two wyrm wardens
const BOSS_GROUP = ['KING', 'WYRM', 'WYRM']

// opts.skipPots / skipSprings: ["floor,x,y", ...] tiles the harness can delete
// to grade the SLACK RULE — the campaign must still be winnable with one
// fewer of every supply the winning script actually consumed.
export function makeRun(opts = {}) {
    const st = {
        tick: 0, floor: 0, x: 1, y: 1, dir: 0,
        mode: 'town', end: null, potions: 1,
        strict: !!opts.strict,
        party: HEROES0.map(h => ({ ...h, maxHp: h.hp, maxMp: h.mp, lvl: 1, xp: 0, alive: true })),
        explored: new Set(),
        skipPots: new Set(opts.skipPots || []),
        skipSprings: new Set(opts.skipSprings || []),
        // per-floor mutable state, filled by enterFloor
        pots: new Set(), springs: new Set(), ambushes: new Set(),
        combat: null, target: 0,
        // THE RIM: street or building interior; wipe = bodies just carried home
        town: { b: null, svc: 0, hero: 0 }, wipe: false,
        townSeed: opts.townSeed || 0x5EED,
        ledger: { dealt: 0, taken: 0, casts: 0, potionsUsed: 0, springsUsed: 0, potTiles: [], springTiles: [], goldIn: HEROES0.reduce((n, h) => n + h.gold, 0), goldSpent: 0, tx: [] },
        events: [],
    }
    markViewTown(st)
    return st
}

function markViewTown(st) {
    st.explored = new Set()
    st.map = null
}

export function enterDungeon(st) {
    st.mode = 'map'
    st.wipe = false
    st.town = { b: null, svc: 0, hero: 0 }
    enterFloor(st, 0)
}

function enterFloor(st, fi) {
    st.floor = fi
    st.x = 1; st.y = 1; st.dir = 0
    st.map = genFloor(fi)
    st.explored = new Set()
    st.pots = new Set(st.map.pots.filter(p => !st.skipPots.has(`${fi},${p.x},${p.y}`)).map(p => p.y * SIZE + p.x))
    st.springs = new Set(st.map.springs.filter(p => !st.skipSprings.has(`${fi},${p.x},${p.y}`)).map(p => p.y * SIZE + p.x))
    st.ambushes = new Set(st.map.ambushes.map(a => a.y * SIZE + a.x))
    st.combat = null
    markView(st)
}

export function cloneState(st) {
    const c = JSON.parse(JSON.stringify({ ...st, map: null, explored: [...st.explored], pots: [...st.pots], springs: [...st.springs], ambushes: [...st.ambushes], skipPots: [...st.skipPots], skipSprings: [...st.skipSprings], events: [] }))
    c.map = genFloor(st.floor)   // seeded — identical grid, and the wall() fn survives
    c.explored = new Set(st.explored)
    c.pots = new Set(st.pots)
    c.springs = new Set(st.springs)
    c.ambushes = new Set(st.ambushes)
    c.skipPots = new Set(st.skipPots)
    c.skipSprings = new Set(st.skipSprings)
    return c
}

export const at = (st, dx, dy) => st.map.wall(st.x + dx, st.y + dy)

function markView(st) {
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (!st.map.wall(st.x + dx, st.y + dy)) st.explored.add((st.y + dy) * SIZE + (st.x + dx))
        }
    }
}

export const fireDmg = (h) => 10 + h.lvl * 4
export const healPow = (h) => CFG.healAmt + h.lvl * 3
export const xpNext = (lvl) => CFG.xpBase * lvl * lvl

function gainXp(st, n) {
    for (const h of st.party) {
        if (!h.alive) continue
        h.xp += n
        while (h.xp >= xpNext(h.lvl)) {
            h.xp -= xpNext(h.lvl)
            h.lvl++
            h.maxHp += CFG.lvlHp; h.hp = Math.min(h.maxHp, h.hp + CFG.lvlHp)
            h.maxMp += CFG.lvlMp; h.mp = Math.min(h.maxMp, h.mp + CFG.lvlMp)
            h.atk += CFG.lvlAtk
            h.def += CFG.lvlDef
            st.events.push({ type: 'levelup', who: h.name, lvl: h.lvl })
        }
    }
}

function startCombat(st, group, boss) {
    st.combat = {
        boss: !!boss,
        mobs: group.map((k, i) => {
            const m = MOBS[k]
            return { id: i, key: k, name: m.name, art: m.art, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, spd: m.spd, xp: m.xp }
        }),
        round: 0,
    }
    st.target = 0
    st.mode = 'combat'
    st.events.push({ type: 'ambush', boss: !!boss, group: group.map(k => MOBS[k].name) })
}

function firstAliveEnemy(st) {
    for (const m of st.combat.mobs) if (m.hp > 0) return m
    return null
}

function resolveRound(st, cmd) {
    const c = st.combat
    c.round++
    const dealt = [], taken = []
    const heros = st.party.filter(h => h.alive)
    const mobs = c.mobs.filter(m => m.hp > 0)
    const order = [...heros.map(h => ({ h, m: null, s: h.spd, hero: true })), ...mobs.map(m => ({ m, h: null, s: m.spd, hero: false }))]
        .sort((a, b) => b.s - a.s || (a.hero ? -1 : b.hero ? 1 : 0))
    // the healer/actor assignment was chosen this round by the command; a
    // command applies to the party leader-capable hero (the first alive hero
    // with MP for casts); everyone else swings steel at the target.
    const caster = cmd === 'fire' || cmd === 'heal'
        ? (cmd === 'fire'
            ? [...heros].sort((a, b) => b.mp - a.mp || b.name.localeCompare(a.name))[0]
            : [...heros].sort((a, b) => b.mp - a.mp || b.name.localeCompare(a.name))[0])
        : null
    const needCost = cmd === 'fire' ? CFG.fireCost : CFG.healCost
    const castOk = caster && caster.mp >= needCost
    const potionHero = cmd === 'potion'
        ? [...heros].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.name.localeCompare(b.name))[0]
        : null
    const potionOk = cmd === 'potion' && st.potions > 0 && !!potionHero

    const tgt = () => {
        const t = c.mobs[st.target]
        if (t && t.hp > 0) return t
        return firstAliveEnemy(st)
    }

    for (const o of order) {
        if (st.mode !== 'combat') break
        if (o.m && o.m.hp <= 0) continue   // killed before its turn never strikes
        if (o.hero) {
            if (o.h === potionHero && potionOk) {
                st.potions--
                st.ledger.potionsUsed++
                const got = Math.min(CFG.potionHeal, o.h.maxHp - o.h.hp)
                o.h.hp += got
                dealt.push({ to: null, heal: got })
                st.events.push({ type: 'potion', who: o.h.name, got })
                continue
            }
            if (o.h === caster && castOk) {
                if (cmd === 'fire') {
                    const t = tgt()
                    if (t) {
                        o.h.mp -= CFG.fireCost
                        st.ledger.casts++
                        const d = Math.min(t.hp, fireDmg(o.h))
                        t.hp -= d
                        dealt.push({ to: t.id, d })
                        st.events.push({ type: 'fire', who: o.h.name, mob: t.id, d })
                        if (t.hp <= 0) mobDeath(st, t)
                    }
                } else {
                    const hurt = [...heros].filter(h => h.alive && h.hp < h.maxHp).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.name.localeCompare(b.name))[0]
                    if (hurt) {
                        o.h.mp -= CFG.healCost
                        st.ledger.casts++
                        const got = Math.min(healPow(o.h), hurt.maxHp - hurt.hp)
                        hurt.hp += got
                        dealt.push({ to: null, heal: got })
                        st.events.push({ type: 'heal', who: o.h.name, on: hurt.name, got })
                    } else {
                        const t = tgt()
                        if (t) { const d = Math.min(t.hp, Math.max(CFG.dmgFloor, o.h.atk - t.def)); t.hp -= d; dealt.push({ to: t.id, d }); if (t.hp <= 0) mobDeath(st, t) }
                    }
                }
                continue
            }
            const t = tgt()
            if (t) {
                const d = Math.min(t.hp, Math.max(CFG.dmgFloor, o.h.atk - t.def))
                t.hp -= d
                dealt.push({ to: t.id, d })
                if (t.hp <= 0) mobDeath(st, t)
            }
        } else {
            if (m_ended(st)) break
            const alive = st.party.filter(h => h.alive)
            if (!alive.length) break
            const prey = [...alive].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.name.localeCompare(b.name))[0]
            // overkill does not carry over: the ledger counts damage ACTUALLY
            // lost, so a kill cannot book more than the prey had to give
            const d = Math.min(prey.hp, Math.max(CFG.dmgFloor, o.m.atk - prey.def))
            prey.hp -= d
            taken.push({ from: o.m.id, to: prey.name, d })
            st.events.push({ type: 'hit', mob: o.m.id, who: prey.name, d })
            if (prey.hp <= 0) {
                prey.alive = false; prey.hp = 0
                st.events.push({ type: 'fall', who: prey.name })
            }
        }
    }

    const dSum = dealt.filter(e => e.d).reduce((n, e) => n + e.d, 0)
    const tSum = taken.reduce((n, e) => n + e.d, 0)
    st.ledger.dealt += dSum
    st.ledger.taken += tSum
    st.events.push({ type: 'round', n: c.round, dealt: dealt.filter(e => e.d), taken, dSum, tSum })

    if (!c.mobs.some(m => m.hp > 0)) winCombat(st)
    else if (!st.party.some(h => h.alive)) carryHome(st)
}

// a wipe is not the end any more (stage 2): the bodies are carried back to
// THE RIM and the purse pays the dead-body tax. A strict run (the Node
// proof, the slack re-grade, the determinism pins) has no second life —
// the campaign must still win or die on its own supplies, exactly as in
// stage 1. Only the player gets the temple's bargain.
function carryHome(st) {
    let lost = 0
    for (const h of st.party) {
        const take = Math.floor(h.gold / CFG.wipeTax)
        h.gold -= take
        lost += take
    }
    st.ledger.goldSpent += lost
    st.combat = null
    if (st.strict) { st.mode = 'over'; st.end = 'dead'; return }
    st.mode = 'town'
    st.wipe = true
    st.town = { b: null, svc: 0, hero: 0 }
    markViewTown(st)
    st.events.push({ type: 'wipe', lost })
    // dead and broke at the gate: nobody left to call and nothing to pay with
    if (!st.party.some(h => h.alive) && purse(st) < CFG.hireCost) {
        st.mode = 'over'; st.end = 'dead'
    }
}

function m_ended(st) { return !st.combat || st.mode !== 'combat' }

function mobDeath(st, m) {
    m.hp = 0
    const gold = Math.max(1, Math.round(m.xp / CFG.goldPerXp))
    st.party[m.id % st.party.length].gold += gold
    st.ledger.goldIn += gold
    st.events.push({ type: 'slay', mob: m.id, name: m.name, xp: m.xp, gold })
    gainXp(st, m.xp)
}

function winCombat(st) {
    const boss = st.combat.boss
    st.events.push({ type: 'victory', boss })
    st.combat = null
    if (boss) { st.mode = 'over'; st.end = 'win'; return }
    st.mode = 'map'
}

export const DX = HX
export const DY = HY

export function step(st, cmd) {
    st.tick++
    if (st.end) return
    if (st.mode === 'combat') {
        if (cmd === 'target+' || cmd === 'target-') {
            const n = st.combat.mobs.length
            let t = st.target
            for (let i = 1; i <= n; i++) {
                const cand = (t + (cmd === 'target+' ? i : n - i)) % n
                if (st.combat.mobs[cand].hp > 0) { t = cand; break }
            }
            st.target = t
            st.events.push({ type: 'target', to: t })
            return
        }
        if (cmd === 'flee') {
            if (st.combat.boss) { st.events.push({ type: 'noback' }); return }
            const rear = [...st.party].filter(h => h.alive).sort((a, b) => a.spd - b.spd)[0]
            if (rear) {
                const d = Math.min(rear.hp, CFG.fleeCost)
                rear.hp -= d
                st.ledger.taken += d
                st.events.push({ type: 'fleeHit', who: rear.name, d })
                if (rear.hp === 0) { rear.alive = false; st.events.push({ type: 'fall', who: rear.name }) }
            }
            st.events.push({ type: 'fled' })
            st.combat = null
            st.mode = 'map'
            if (!st.party.some(h => h.alive)) carryHome(st)
            return
        }
        resolveRound(st, cmd)
        return
    }
    if (st.mode === 'town') {
        townStep(st, cmd)
        return
    }
    if (st.mode !== 'map') return

    if (cmd === 'potion') {
        if (st.potions <= 0) { st.events.push({ type: 'empty' }); return }
        const hurt = st.party.filter(h => h.alive).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
        if (!hurt) return
        st.potions--
        st.ledger.potionsUsed++
        const got = Math.min(CFG.potionHeal, hurt.maxHp - hurt.hp)
        hurt.hp += got
        st.events.push({ type: 'potion', who: hurt.name, got })
        return
    }
    if (cmd === 'left' || cmd === 'right') {
        st.dir = (st.dir + (cmd === 'left' ? 3 : 1)) % 4
        markView(st)
        return
    }
    if (cmd === 'fwd' || cmd === 'back') {
        const s = cmd === 'fwd' ? 0 : 2
        const nx = st.x + HX[(st.dir + s) % 4], ny = st.y + HY[(st.dir + s) % 4]
        if (!st.map.wall(nx, ny)) { st.x = nx; st.y = ny; markView(st); settleTile(st) }
        else st.events.push({ type: 'bump' })
        return
    }
    if (cmd === 'use') {
        const t = st.y * SIZE + st.x
        if (st.map.stairs && st.map.stairs.x === st.x && st.map.stairs.y === st.y) {
            st.events.push({ type: 'descend', to: st.floor + 1 })
            enterFloor(st, st.floor + 1)
            return
        }
        if (st.springs.has(t)) {
            const full = st.party.every(h => !h.alive || h.mp >= h.maxMp)
            if (full) { st.events.push({ type: 'springFull' }); return }
            st.springs.delete(t)
            st.ledger.springsUsed++
            st.ledger.springTiles.push({ floor: st.floor, x: st.x, y: st.y })
            for (const h of st.party) if (h.alive) h.mp = Math.min(h.maxMp, h.mp + CFG.springMp)
            st.events.push({ type: 'spring' })
            return
        }
        const fx = st.x + HX[st.dir], fy = st.y + HY[st.dir]
        if (st.map.throne && st.map.throne.x === fx && st.map.throne.y === fy) {
            startCombat(st, BOSS_GROUP, true)
            return
        }
        st.events.push({ type: 'nothing' })
    }
}

// --------------------------------------------------------------- THE RIM ----
// Town commands: enter-<B> | leave | down | sel+/sel- (hero) | svc+/svc- |
// buy | wait. Money is conserved loudly: every purchase books into
// ledger.goldSpent and ledger.tx, so the harness can recompute the purse.
export const servicePrice = (st, svc) =>
    svc.id === 'mourn' || svc.id === 'restore'
        ? CFG[svc.priceKey] * st.party[st.town.hero].lvl
        : svc.id === 'train'
            ? CFG[svc.priceKey] * (st.party[st.town.hero].lvl + 1)
            : CFG[svc.priceKey]

export function currentService(st) {
    return st.town.b ? SERVICES[st.town.b][st.town.svc] : null
}

export function canBuy(st) {
    const svc = currentService(st)
    if (!svc) return false
    const h = st.party[st.town.hero]
    if (!serviceHeroOk(svc.id, h)) return false
    if (svc.id === 'train') return h.xp >= xpNext(h.lvl)
    return purse(st) >= servicePrice(st, svc)
}

function charge(st, price, h) {
    let left = price
    for (const p of st.party) {
        const take = Math.min(p.gold, left)
        p.gold -= take
        left -= take
        if (!left) break
    }
    st.ledger.goldSpent += price
    void h
}

function townStep(st, cmd) {
    const t = st.town
    if (cmd === 'wait') return
    if (cmd === 'down') {
        if (t.b) { st.events.push({ type: 'townNo' }); return }
        if (!st.party.some(h => h.alive)) { st.events.push({ type: 'noBreathers' }); return }
        st.events.push({ type: 'descend', to: 0 })
        enterDungeon(st)
        return
    }
    if (cmd === 'leave') {
        if (!t.b) return
        t.b = null; t.svc = 0
        st.events.push({ type: 'townStreet' })
        return
    }
    const ent = BUILDINGS.find(b => b.key === cmd.replace('enter-', ''))
    if (cmd.startsWith('enter-')) {
        if (!ent) { st.events.push({ type: 'townNo' }); return }
        t.b = ent.key; t.svc = 0
        st.events.push({ type: 'townEnter', b: ent.key, name: ent.name })
        return
    }
    if (!t.b) { st.events.push({ type: 'townNo' }); return }
    const list = SERVICES[t.b]
    if (cmd === 'svc+' || cmd === 'svc-') {
        t.svc = (t.svc + (cmd === 'svc+' ? 1 : list.length - 1)) % list.length
        return
    }
    if (cmd === 'sel+' || cmd === 'sel-') {
        t.hero = (t.hero + (cmd === 'sel+' ? 1 : st.party.length - 1)) % st.party.length
        return
    }
    if (cmd !== 'buy') return
    const svc = list[t.svc]
    const h = st.party[t.hero]
    if (!serviceHeroOk(svc.id, h)) { st.events.push({ type: 'townNo', why: svc.id }); return }
    if (svc.id === 'train' && h.xp < xpNext(h.lvl)) { st.events.push({ type: 'townNo', why: 'xp' }); return }
    const price = servicePrice(st, svc)
    if (purse(st) < price) { st.events.push({ type: 'broke', price }); return }
    charge(st, price, h)
    st.ledger.tx.push({ b: t.b, id: svc.id, hero: t.hero, price })
    st.events.push({ type: 'townBuy', id: svc.id, who: h.name, price })
    switch (svc.id) {
        case 'post': {
            const rnd = mulberry32(st.townSeed + st.ledger.tx.length * 7919)
            st.townSeed = (st.townSeed + 104729) >>> 0
            const r = rollRecruit(rnd)
            Object.assign(h, r, { maxHp: r.hp, maxMp: r.mp, lvl: 1, xp: 0, alive: true })
            st.events.push({ type: 'hire', who: h.name, hp: r.hp, mp: r.mp, atk: r.atk, def: r.def, spd: r.spd })
            break
        }
        case 'mourn':
            h.alive = true; h.hp = 1
            st.events.push({ type: 'mourn', who: h.name })
            break
        case 'restore':
            h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp
            st.events.push({ type: 'restore', who: h.name })
            break
        case 'mend':
            h.hp = h.maxHp
            break
        case 'refresh':
            h.mp = h.maxMp
            break
        case 'train': {
            h.xp -= xpNext(h.lvl)
            h.lvl++
            h.maxHp += CFG.lvlHp; h.hp = Math.min(h.maxHp, h.hp + CFG.lvlHp)
            h.maxMp += CFG.lvlMp; h.mp = Math.min(h.maxMp, h.mp + CFG.lvlMp)
            h.atk += CFG.lvlAtk
            h.def += CFG.lvlDef
            st.events.push({ type: 'levelup', who: h.name, lvl: h.lvl, trained: true })
            break
        }
        case 'potion':
            st.potions++
            st.events.push({ type: 'buyPotion', potions: st.potions })
            break
        default:
            break
    }
    // broke and fallen: no service can lift this company — that is the run's end
    if (st.wipe && !st.party.some(h2 => h2.alive) && purse(st) < CFG.hireCost) {
        st.mode = 'over'; st.end = 'dead'
    }
}

function settleTile(st) {
    const t = st.y * SIZE + st.x
    if (st.map.throne && st.map.throne.y === st.y && st.map.throne.x === st.x) {
        startCombat(st, BOSS_GROUP, true)
        return
    }
    if (st.pots.has(t)) {
        st.pots.delete(t)
        st.potions++
        st.ledger.potTiles.push({ floor: st.floor, x: st.x, y: st.y })
        st.events.push({ type: 'pickup', potions: st.potions })
    }
    if (st.springs.has(t)) st.events.push({ type: 'seeSpring' })
    if (st.ambushes.has(t)) {
        const amb = st.map.ambushes.find(q => q.y * SIZE + q.x === t)
        st.ambushes.delete(t)
        startCombat(st, amb.group, false)
    }
}

export function stateHash(st) {
    let h = 0x811c9dc5
    const mix = (n) => { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193) }
    mix(st.tick); mix(st.floor); mix(st.x); mix(st.y); mix(st.dir); mix(st.potions)
    mix(st.mode === 'town' ? (st.town.b ? 300 + st.town.svc : 299) : st.mode === 'combat' ? 2 : st.mode === 'over' ? 4 : 1)
    mix(purse(st)); mix(st.town.hero); mix(st.wipe ? 1 : 0); mix(st.townSeed)
    if (st.end) mix(st.end === 'win' ? 777 : 666)
    for (const p of st.party) { mix(p.hp); mix(p.mp); mix(p.lvl); mix(p.alive ? 1 : 0) }
    if (st.combat) for (const m of st.combat.mobs) mix(m.hp)
    mix(st.ledger.dealt * 131 + st.ledger.taken)
    return (h >>> 0).toString(16)
}
