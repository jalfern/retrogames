// THE BARD'S TALE — the autopilot. Same `step` the player drives: BFS on the
// live grid, ranged-combat doctrine (spells first, bow any band, steel at 10
// ft, heal at half, potion at third), town economy between dives (temple,
// Garth's, the tavern, the Review Board), and a supply sweep on every floor.
// The attract demo replays this; the Node harness grades it, then re-grades it
// with the slack rule.

import { step, SPELLS, CFG } from './sim.js'

const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1]
const sizeOf = (st) => st.map.size || st.map.w

function blocked(st, x, y) {
    if (st.map.wall(x, y)) return true
    return st.fi >= 0 && st.map.locked && !st.hasFloorKey && st.map.locked.y === y && st.map.locked.x === x
}

// BFS FROM the target: a step is right when d drops by 1
function bfsFrom(st, tx, ty) {
    const size = sizeOf(st)
    const d = new Int16Array(size * size).fill(-1)
    d[ty * size + tx] = 0
    const q = [[tx, ty]]
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (let dd = 0; dd < 4; dd++) {
            const nx = cx + HX[dd], ny = cy + HY[dd]
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
            const nt = ny * size + nx
            if (d[nt] === -1 && !blocked(st, nx, ny)) { d[nt] = d[cy * size + cx] + 1; q.push([nx, ny]) }
        }
    }
    return d
}

function walkTo(st, tx, ty) {
    if (st.x === tx && st.y === ty) return 'use'
    const size = sizeOf(st)
    const d = bfsFrom(st, tx, ty)
    const here = d[st.y * size + st.x]
    if (here === -1) return null
    let want = -1
    for (let dd = 0; dd < 4; dd++) {
        const nx = st.x + HX[dd], ny = st.y + HY[dd]
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const nt = ny * size + nx
        if (!blocked(st, nx, ny) && d[nt] === here - 1) { want = dd; break }
    }
    if (want === -1) return null
    if (st.dir !== want) return (want - st.dir + 4) % 4 === 1 ? 'right' : 'left'
    return 'fwd'
}

function specialTile(st, kind) {
    for (const [t, sp] of st.map.specials) {
        if (sp.kind === kind) return { x: t % sizeOf(st), y: Math.floor(t / sizeOf(st)) }
    }
    return null
}

const pct = (h) => h.hp / h.maxHp
const avgPct = (st) => { const l = st.party.filter((h) => h.alive); return l.reduce((n, h) => n + pct(h), 0) / l.length }
const anyDead = (st) => st.party.some((h) => !h.alive)
const GEAR_LIST = [{ id: 'm1', cost: 50 }, { id: 'm2', cost: 80 }, { id: 'm3', cost: 120 }, { id: 'm4', cost: 200 }]

function menuCmd(st) {
    const k = st.menu.kind
    if (k === 'temple') {
        if (anyDead(st) && st.gold >= 50) return 'm2'
        if (avgPct(st) < 0.85 && st.gold >= 30) return 'm1'
        return 'm0'
    }
    if (k === 'garth') {
        const buy = GEAR_LIST.find((g) => !st.gear[g.id] && st.gold >= g.cost)
        return buy ? buy.id : 'm0'
    }
    if (k === 'tavern') {
        if (st.ales < 5 && st.gold >= 25) return 'm2'
        return 'm0'
    }
    if (k === 'board') {
        const cand = st.party.find((h) => h.alive && (h.cls === 'conjurer' || h.cls === 'magician') && h.lvl >= 3)
        if (cand && st.sp >= 3) return 'm5'
        if (st.sp >= 1) return 'm1'
        return 'm0'
    }
    return 'm0'
}

function combatCmd(st) {
    const c = st.combat
    const castable = (sp) => st.party.some((h) => h.alive && sp.who.includes(h.cls) && h.mp >= sp.cost)
    const dmgCodes = Object.keys(SPELLS).filter((k) => SPELLS[k].dmg && castable(SPELLS[k])).sort((a, b) => SPELLS[b].dmg - SPELLS[a].dmg)
    const lowest = st.party.filter((h) => h.alive).sort((a, b) => pct(a) - pct(b))[0]
    if (lowest && pct(lowest) < 0.3 && st.potions > 0) return 'potion'
    if (lowest && pct(lowest) < 0.55 && castable(SPELLS.HEAL)) return 'cast:HEAL'
    if (!st.song && st.ales > 1 && avgPct(st) < 0.75) return 'song:canto'
    if (!st.song && st.ales > 1 && c.round === 1) return 'song:jack'
    if (dmgCodes.length) {
        const strong = c.mobs.filter((m) => m.hp > 0).sort((a, b) => b.hp - a.hp)[0]
        const cheap = dmgCodes.filter((code) => SPELLS[code].dmg <= (strong ? strong.hp : 99))
        return 'cast:' + (cheap.length ? cheap[cheap.length - 1] : dmgCodes[0])
    }
    if (st.band > 1 && !st.party.some((h) => h.alive && h.cls === 'hunter')) return 'advance'
    return 'attack'
}

function mapCmd(st) {
    const m = st.map
    if (st.fi === -1) {
        const templeUseful = (anyDead(st) && st.gold >= CFG.raiseCost) || (avgPct(st) < 0.82 && st.gold >= CFG.healCost)
        const gearBuy = GEAR_LIST.some((g) => !st.gear[g.id] && st.gold >= g.cost)
        const aleBuy = st.ales < 3 && st.gold >= CFG.roundCost
        const boardVisit = !st.towerKey && CFG.towerFloors.every((f) => st.floorsDone[f])
        const order = []
        if (templeUseful) order.push('temple')
        if (gearBuy) order.push('garth')
        if (aleBuy) order.push('tavern')
        if (boardVisit) order.push('board')
        if (st.towerKey) order.push('towergate')
        order.push('sewer')
        for (const kind of order) {
            const sp = specialTile(st, kind)
            if (!sp) continue
            if (kind === 'towergate' && !st.towerKey) continue
            const w = walkTo(st, sp.x, sp.y)
            if (w) return w
            if (kind === 'towergate' || kind === 'sewer') return 'use'
            return 'use'
        }
        return 'wait'
    }
    if (m.locked && !st.hasFloorKey && m.key && !(st.x === m.key.x && st.y === m.key.y)) {
        const w = walkTo(st, m.key.x, m.key.y)
        if (w) return w
    }
    // sweep nearby uncollected supplies and gold before committing
    const size = sizeOf(st)
    const here = st.y * size + st.x
    const marks = []
    for (const list of [m.pots, m.ales, m.treasure]) {
        for (const p of list) {
            const t = p.y * size + p.x
            if (st.taken.has(t)) continue
            const d = bfsFrom(st, p.x, p.y)
            if (d[here] !== -1) marks.push({ x: p.x, y: p.y, dist: d[here] })
        }
    }
    if (marks.length) {
        marks.sort((a, b) => a.dist - b.dist || a.x - b.x || a.y - b.y)
        const w = walkTo(st, marks[0].x, marks[0].y)
        if (w) return w
    }
    if (m.exit && st.floorsDone[st.fi]) {
        const poor = st.ales < 3 || st.potions < 1 || st.gold < 30
        const wounded = anyDead(st) || avgPct(st) < 0.82
        const wantsGear = GEAR_LIST.some((g) => !st.gear[g.id] && st.gold >= g.cost)
        const allDone = CFG.towerFloors.every((f) => st.floorsDone[f])
        if (st.fi === 4 || wounded || poor || wantsGear || allDone) {
            const w = walkTo(st, m.exit.x, m.exit.y)
            if (w) return w
            return 'use'
        }
    }
    const cleared = st.floorsDone[st.fi]
    const goal = st.fi === 5 ? (m.boss || m.strong) : cleared ? (m.stairs || m.strong) : (m.strong || m.stairs)
    if (goal && !(st.x === goal.x && st.y === goal.y)) {
        const w = walkTo(st, goal.x, goal.y)
        if (w) return w
    }
    if (m.boss && st.x === m.boss.x && st.y === m.boss.y) return 'wait'
    if (m.stairs && st.x === m.stairs.x && st.y === m.stairs.y) return 'use'
    return 'wait'
}

export function nextAction(st) {
    if (st.end) return 'wait'
    if (st.menu) return menuCmd(st)
    if (st.mode === 'combat') return combatCmd(st)
    if (st.mode === 'town' || st.mode === 'dungeon') return mapCmd(st)
    return 'wait'
}

export function playOut(st, maxTicks = 90000) {
    let n = 0
    while (!st.end && n < maxTicks) { st.events.splice(0); step(st, nextAction(st)); n++ }
    return { won: st.end === 'win', end: st.end, ticks: n, ledger: st.ledger }
}
