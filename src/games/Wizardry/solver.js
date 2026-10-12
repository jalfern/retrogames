// WIZARDRY — the autopilot AND the proof. This is the same code the attract
// demo drives live; wizcheck runs it cold on the whole campaign and on the
// slack-deleted supplies, so the demo is never theatre: it is the witness.
//
// The policy deliberately does NOT cheat: it walks BFS toward the stairs/
// throne (a goal a player learns by exploring), it never dodges ambush tiles
// (they cost it HP exactly like a human walking blind), and it uses supplies
// only when a hero is actually hurting. If this policy can still win with one
// fewer potion and spring than it consumes, a person can.

import { SIZE, DX, DY, CFG, makeRun, step, cloneState, fireDmg } from './sim.js'

const key = (x, y) => y * SIZE + x

// BFS seeded AT THE GOALS: prev[cell] = the dir to move from `cell` toward
// the nearest goal. Returns -1 when unreachable or already standing on one.
function toward(map, x, y, goals) {
    const start = key(x, y)
    if (goals.has(start)) return -1
    const prev = new Map()
    const q = []
    for (const g of goals) {
        const gx = g % SIZE, gy = Math.floor(g / SIZE)
        prev.set(g, null)
        q.push([gx, gy])
    }
    if (!q.length) return -1
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (let d = 0; d < 4; d++) {
            const nx = cx + DX[d], ny = cy + DY[d]
            if (map.wall(nx, ny) || prev.has(key(nx, ny))) continue
            prev.set(key(nx, ny), (d + 2) % 4)
            q.push([nx, ny])
        }
    }
    const d = prev.get(start)
    return d === null || d === undefined ? -1 : d
}

function turnToward(dir, want) {
    const d = (want - dir + 4) % 4
    if (d === 1) return 'right'
    if (d === 3) return 'left'
    return 'right'   // a full reverse: one turn per tick, the harness sees it resolve
}

export function nextAction(st) {
    if (st.end) return 'wait'
    if (st.mode === 'combat') {
        const alive = st.party.filter(h => h.alive)
        if (!alive.length) return 'attack'
        const hurt = alive.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
        const caster = alive.slice().sort((a, b) => b.mp - a.mp || a.name.localeCompare(b.name))[0]
        const mobs = st.combat.mobs
        const live = mobs.filter(m => m.hp > 0)
        if (!live.length) return 'attack'
        const low = hurt.hp / hurt.maxHp
        if (low < 0.4 && st.potions > 0) return 'potion'
        if (low < 0.6 && caster.mp >= CFG.healCost) return 'heal'
        const pick = live.find(m => caster.mp >= CFG.fireCost && m.hp <= fireDmg(caster)) || live[0]
        const pi = mobs.indexOf(pick)
        if (st.target !== pi) return st.target < pi ? 'target+' : 'target-'
        if (caster.mp >= CFG.fireCost && pick.hp <= fireDmg(caster)) return 'fire'
        return 'attack'
    }
    const m = st.map
    const t = key(st.x, st.y)
    if (m.stairs && m.stairs.y === st.y && m.stairs.x === st.x) return 'use'
    if (st.springs.has(t)) return 'use'
    const goals = new Set()
    if (m.stairs) goals.add(key(m.stairs.x, m.stairs.y))
    if (m.throne) goals.add(key(m.throne.x, m.throne.y))
    const want = toward(m, st.x, st.y, goals)
    if (want < 0) return 'wait'
    if (st.dir !== want) return turnToward(st.dir, want)
    return 'fwd'
}

export function solveRun(opts = {}, maxTicks = 60000) {
    return playOut(makeRun(opts), maxTicks)
}

export function playOut(st, maxTicks = 60000) {
    const s = cloneState(st)
    const receipts = []
    let t = 0
    while (!s.end && t < maxTicks) {
        const cmd = nextAction(s)
        step(s, cmd)
        receipts.push(cmd)
        t++
    }
    return {
        won: s.end === 'win',
        end: s.end,
        ticks: t,
        ledger: s.ledger,
        party: s.party.map(h => ({ name: h.name, hp: h.hp, maxHp: h.maxHp, mp: h.mp, lvl: h.lvl, alive: h.alive })),
        script: receipts,
        hash: stateHashOf(s),
    }
}

function stateHashOf(s) {
    let h = 0x811c9dc5
    const mix = (n) => { h ^= (n | 0); h = Math.imul(h, 0x01000193) }
    mix(s.ledger.dealt * 131 + s.ledger.taken)
    mix(s.potions)
    for (const p of s.party) { mix(p.hp); mix(p.mp * 7); mix(p.lvl * 31); mix(p.alive ? 1 : 0) }
    mix(s.floor); mix(s.x); mix(s.y)
    return (h >>> 0).toString(16)
}
