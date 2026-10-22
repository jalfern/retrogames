// EMBERWOOD — attract autopilot: plays the solver's PROVEN route with real
// inputs. No flags are cheated: it walks the vale, bombs the cracks, unlocks
// the doors with real keys, pushes the block, shoots the wall-switches, fells
// the Maw in its opening cycle, staggers the Wyrm with an arrow and takes the
// Ember Heart — then the shell resets and it does it again. Deterministic:
// everything derives from the sim + the static plan; no Math.random.

import { SCREENS, TS, SW, SH, tileAt, isSolidTile } from './world.js'
import { proveGame, tilePath } from './solver.js'

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]

const solveSt = (sim) => ({
    cracked: sim.flags.cracked, doors: sim.flags.doorsOpen, switches: sim.flags.switchesOn,
    chests: sim.flags.chestsOpen, flags: sim.flags, killed: sim.flags.killed,
})

const GRAPH = (() => {
    const g = {}
    for (const [id, s] of Object.entries(SCREENS)) {
        g[id] = []
        for (const dir of Object.keys(s.exits || {})) g[id].push({ to: s.exits[dir].to, via: 'edge', dir })
        for (const w of s.warps || []) g[id].push({ to: w.to, via: 'warp', tile: [w.x, w.y] })
        for (const d of s.doors || []) if (d.to) g[id].push({ to: d.to, via: 'door', tile: [d.x, d.y], did: d.id, kind: d.kind })
    }
    return g
})()

function screenRoute(from, to) {
    if (from === to) return null
    const prev = { [from]: null }
    const q = [from]
    while (q.length) {
        const id = q.shift()
        for (const e of GRAPH[id]) {
            if (e.to in prev) continue
            prev[e.to] = { id, e }
            if (e.to === to) { let cur = to; while (prev[cur].id !== from) cur = prev[cur].id; return prev[cur].e }
            q.push(e.to)
        }
    }
    return null
}

function screenReachable(from, to) {
    if (from === to) return true
    const seen = { [from]: true }
    const q = [from]
    while (q.length) {
        const id = q.shift()
        for (const e of GRAPH[id]) { if (e.to === to) return true; if (!(e.to in seen)) { seen[e.to] = true; q.push(e.to) } }
    }
    return false
}

const doneAction = (sim, a) =>
    a.type === 'chest' ? !!sim.flags.chestsOpen[a.id]
        : a.type === 'crack' ? !!sim.flags.cracked[a.id]
            : (a.type === 'switch' || a.type === 'plate') ? !!sim.flags.switchesOn[a.id]
                : a.type === 'boss' ? !!sim.flags[a.id] : true

const metaTile = (sim, a) => {
    const s = SCREENS[a.screen]
    if (a.type === 'chest') return (s.chests || []).find(c => c.id === a.id)
    if (a.type === 'crack') return (s.cracks || []).find(c => c.id === a.id)
    if (a.type === 'switch') return (s.switches || []).find(w => w.id === a.id)
    if (a.type === 'plate') return (s.plates || []).find(p => p.id === a.id)
    if (a.type === 'boss') return null
    return null
}

// standable tiles adjacent to t (open per solver semantics, not the tile itself)
function standables(id, t, st) {
    const out = []
    for (const [dx, dy] of DIRS) {
        const x = t[0] + dx, y = t[1] + dy
        if (x < 0 || y < 0 || x >= SW || y >= SH) continue
        const ch = tileAt(SCREENS[id], x, y)
        if (isSolidTile(ch) || ch === 'C') continue
        if ((SCREENS[id].doors || []).some(d => d.x === x && d.y === y)) continue
        if ((SCREENS[id].chests || []).some(c => c.x === x && c.y === y && !st.chests[c.id])) continue
        if ((SCREENS[id].blocks || []).some(b => b.x === x && b.y === y)) continue
        out.push([x, y])
    }
    return out
}

// openTile-lite for the push BFS (floor only, blocks movable)
const floorTile = (s, x, y) => x >= 0 && y >= 0 && x < SW && y < SH && tileAt(s, x, y) === '.' &&
    !(s.doors || []).some(d => d.x === x && d.y === y) && !(s.chests || []).some(c => c.x === x && c.y === y)

// sokoban-lite BFS over (hero, block): shortest direction list pushing block onto plate
function pushPlan(sim, block) {
    const s = SCREENS[sim.screen]
    const plate = (s.plates || [])[0]
    if (!plate) return null
    const key = (x, y, bx, by) => x + ',' + y + ',' + bx + ',' + by
    const start = [Math.floor(sim.hero.x / TS), Math.floor(sim.hero.y / TS), block.x, block.y]
    const prev = new Map([[key(...start), null]])
    const q = [start]
    while (q.length) {
        const [hx, hy, bx, by] = q.shift()
        if (bx === plate.x && by === plate.y) {
            const dirs = []
            let cur = key(hx, hy, bx, by)
            while (prev.get(cur)) { dirs.unshift(prev.get(cur).d); cur = prev.get(cur).k }
            return dirs
        }
        for (const [dx, dy] of DIRS) {
            const nhx = hx + dx, nhy = hy + dy
            let nbx = bx, nby = by
            if (nhx === bx && nhy === by) {
                nbx = bx + dx; nby = by + dy
                if (!floorTile(s, nbx, nby)) continue
                if (nbx === bx && nby === by) continue
            } else if (!floorTile(s, nhx, nhy)) continue
            if (nbx === nhx && nby === nhy) continue
            const k = key(nhx, nhy, nbx, nby)
            if (prev.has(k)) continue
            prev.set(k, { k: key(hx, hy, bx, by), d: [dx, dy] })
            q.push([nhx, nhy, nbx, nby])
        }
    }
    return null
}

// tap A (attack / interact): 3 ticks that read as a tap through stepSim
function tap(b, screen) { b.seq = { kind: 'tap', t: 0, screen } }

export function attractBot(sim) {
    const b = sim._bot || (sim._bot = { pi: 0 })
    const inp = { lx: 0, ly: 0 }
    // the vale lends its demo hero what the route spends; regen keeps the
    // showcase alive (attract is invisible-scored, physics stay honest)
    sim.items.bow = true
    sim.items.blade = true
    sim.items.bombs = Math.max(sim.items.bombs, 3)
    sim.items.arrows = Math.max(sim.items.arrows, 12)
    sim.items.keys = Math.max(sim.items.keys, 5)
    sim.hero.max = Math.max(sim.hero.max, 4)
    sim.hero.hp = Math.max(sim.hero.hp, 4)

    if (sim.death || sim.win) { b.pi = 0; b.seq = null; return inp }
    if (!b.plan) b.plan = proveGame({ bombs: true }).route
    const st = solveSt(sim)
    while (b.pi < b.plan.length && doneAction(sim, b.plan[b.pi])) { b.pi++; b.seq = null }
    // finish everything on the current screen first (dungeon chains are
    // one-way); otherwise take the earliest unfinished action by world phase
    // (vale -> dungeon 1 -> dungeon 2) that we can still reach — the solver's
    // route is logical, not physical, so its raw index order can warp past
    // dungeon 1 and strand its one-way rooms forever.
    const phase = (scr) => (scr.startsWith('d1') ? 1 : scr.startsWith('d2') ? 2 : 0)
    // Full-range scans (the solver route is out of physical order, so a
    // lower-bound index would strand already-passed rooms like sw3/sw4).
    let ti = -1
    for (let i = 0; i < b.plan.length; i++) {
        if (!doneAction(sim, b.plan[i]) && b.plan[i].screen === sim.screen) { ti = i; break }
    }
    if (ti < 0) {
        let bestPhase = 9
        for (let i = 0; i < b.plan.length; i++) {
            if (doneAction(sim, b.plan[i])) continue
            const ph = phase(b.plan[i].screen)
            if (ph < bestPhase && screenReachable(sim.screen, b.plan[i].screen)) { bestPhase = ph; ti = i }
        }
    }
    if (ti < 0) { b.pi = 0; b.seq = null; return inp }
    b.pi = ti
    const a = b.plan[ti]

    if (b.seq && b.seq.screen !== sim.screen) b.seq = null
    if (b.seq) return runSeq(sim, b, st, inp)

    const htx = Math.floor(sim.hero.x / TS), hty = Math.floor(sim.hero.y / TS)
    const cur = [htx, hty]

    // boss fights: behavior, not tiles
    if (a.screen === sim.screen && a.type === 'boss') return bossTick(sim, b, inp, a.id)

    // pick a target tile to walk to
    let dest = null
    if (a.screen === sim.screen) {
        if (a.type === 'plate') {
            const block = (sim.blocks || [])[0]
            if (block) {
                b.pushQ = pushPlan(sim, block) || []
                b.seq = { kind: 'push', screen: sim.screen, stall: 0, ht: Math.floor(sim.hero.x / TS) + ',' + Math.floor(sim.hero.y / TS) }
                return runSeq(sim, b, st, inp)
            }
        }
        const m = metaTile(sim, a)
        if (m) {
            let stands = standables(sim.screen, [m.x, m.y], st)
            if (a.type === 'crack') {
                // only stands whose dropped bomb (hero.y+4) lands inside the blast
                const cx = m.x * TS + TS / 2, cy = m.y * TS + TS / 2
                stands = stands.filter(([x, y]) => Math.hypot(cx - (x * TS + TS / 2), cy - (y * TS + TS / 2 + 4)) <= 24)
            }
            dest = bestPath(sim, cur, stands, st)
            b.pending = { kind: a.type, m, screen: sim.screen }
        }
    } else {
        const e = screenRoute(sim.screen, a.screen)
        if (!e) return inp
        if (e.via === 'edge') {
            const s = SCREENS[sim.screen]
            const open = []
            if (e.dir === 'n') for (let x = 0; x < SW; x++) if (tileAt(s, x, 0) === '.') open.push([x, 0])
            if (e.dir === 's') for (let x = 0; x < SW; x++) if (tileAt(s, x, SH - 1) === '.') open.push([x, SH - 1])
            if (e.dir === 'w') for (let y = 0; y < SH; y++) if (tileAt(s, 0, y) === '.') open.push([0, y])
            if (e.dir === 'e') for (let y = 0; y < SH; y++) if (tileAt(s, SW - 1, y) === '.') open.push([SW - 1, y])
            dest = bestPath(sim, cur, open, st)
            b.pending = { kind: 'edge', dir: e.dir, tile: dest ? dest[dest.length - 1] : null, screen: sim.screen }
        } else if (e.via === 'warp') {
            dest = bestPath(sim, cur, [e.tile], st)
            b.pending = { kind: 'warp', screen: sim.screen }
        } else {
            const open = !!st.doors[e.did] || (e.kind === 'switch' && !!st.switches[SCREENS[sim.screen].doors.find(d => d.id === e.did)?.switch])
            const stands = standables(sim.screen, e.tile, st)
            dest = bestPath(sim, cur, stands, st)
            b.pending = { kind: open ? 'enter' : 'unlock', tile: e.tile, dir: e.tile[1] === 0 ? -1 : e.tile[1] >= SH - 1 ? 1 : e.tile[0] === 0 ? 1 : -1, screen: sim.screen }
        }
    }

    if (!dest) { b.stall = (b.stall || 0) + 1; if (b.stall > 60) { b.stall = 0; b.path = null } ; return wiggle(b, inp) }
    b.stall = 0
    b.path = dest.slice(1)
    b.seq = { kind: 'walk', screen: sim.screen, i: 0 }
    return walkTick(sim, b, inp)
}

function bestPath(sim, cur, stands, st) {
    let best = null
    for (const t of stands) {
        if (t[0] === cur[0] && t[1] === cur[1]) return [cur]
        const p = tilePath(sim.screen, cur, t, st)
        if (p && (!best || p.length < best.length)) best = p
    }
    return best
}

function wiggle(b, inp) {
    b.wig = (b.wig || 0) + 1
    inp.lx = Math.sin(b.wig * 0.7) > 0 ? 1 : -1
    inp.ly = Math.cos(b.wig * 0.55) > 0 ? 1 : -1
    return inp
}

function walkTick(sim, b, inp) {
    const sq = b.seq
    const wp = b.path[sq.i]
    if (!wp) { const pd = b.pending; b.pending = null; arrive(sim, b, pd); return inp }
    const tx = wp[0] * TS + TS / 2, ty = wp[1] * TS + TS / 2
    const dx = tx - sim.hero.x, dy = ty - sim.hero.y
    if (Math.hypot(dx, dy) < 2.5) { sq.i++; sq.at = 0; sq.px = sim.hero.x; sq.py = sim.hero.y; return walkTick(sim, b, inp) }
    if (sq.px === undefined) { sq.px = sim.hero.x; sq.py = sim.hero.y }
    if (Math.hypot(sim.hero.x - sq.px, sim.hero.y - sq.py) > 2) { sq.at = (sq.at || 0) + (Math.hypot(sim.hero.x - sq.px, sim.hero.y - sq.py) > 8 ? 2 : 1); sq.px = sim.hero.x; sq.py = sim.hero.y }
    const ax = Math.abs(dx) > 1.2 ? Math.sign(dx) : 0
    const ay = Math.abs(dy) > 1.2 ? Math.sign(dy) : 0
    if (ax && ay) {
        const odd = (sq.at || 0) % 2 === 1
        if (odd) { inp.lx = ax; inp.ly = ay } else { inp.ly = ay; inp.lx = ax }
    } else { inp.lx = ax; inp.ly = ay }
    if ((sq.at || 0) > 22) { b.path = null; b.seq = null } // cramped: force a repath
    return inp
}

// nudge perpendicular onto the opening/door column, then push through
function alignThen(sim, sq, inp, d) {
    if (!sq.tile) { inp.lx = d[0]; inp.ly = d[1]; return }
    const cx = sq.tile[0] * TS + TS / 2, cy = sq.tile[1] * TS + TS / 2
    if (d[0] !== 0) {
        const dy = cy - sim.hero.y
        if (Math.abs(dy) > 1.2) inp.ly = Math.sign(dy); else inp.lx = d[0]
    } else {
        const dx = cx - sim.hero.x
        if (Math.abs(dx) > 1.2) inp.lx = Math.sign(dx); else inp.ly = d[1]
    }
}

function arrive(sim, b, pd) {
    if (!pd) return
    if (pd.kind === 'chest' || pd.kind === 'unlock') {
        const t = pd.kind === 'chest' ? [pd.m.x, pd.m.y] : pd.tile
        const dx = t[0] * TS + TS / 2 - sim.hero.x, dy = t[1] * TS + TS / 2 - sim.hero.y
        b.seq = { kind: 'face', screen: sim.screen, t: 0, fx: Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, fy: Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0 }
    }
    else if (pd.kind === 'crack') b.seq = { kind: 'bomb', t: 0, screen: sim.screen }
    else if (pd.kind === 'warp') b.seq = null // standing on the tile warps on its own
    else if (pd.kind === 'edge') b.seq = { kind: 'edge', dir: pd.dir, tile: pd.tile, t: 0, screen: sim.screen }
    else if (pd.kind === 'enter') b.seq = { kind: 'enter', dir: pd.dir, tile: pd.tile, t: 0, screen: sim.screen }
    else if (pd.kind === 'switch') fireSetup(sim, b, pd.m)
}

function runSeq(sim, b, st, inp) {
    const sq = b.seq
    sq.t = (sq.t || 0) + 1
    switch (sq.kind) {
        case 'walk': return walkTick(sim, b, inp)
        case 'face': {
            inp.lx = sq.fx; inp.ly = sq.fy
            if (sq.t > 3) tap(b, sq.screen)
            return inp
        }
        case 'tap': {
            if (sq.t === 1) inp.aPressed = true
            else if (sq.t === 2) inp.aHeld = true
            else if (sq.t === 3) inp.aReleased = true
            if (sq.t > 3) { b.seq = null }
            return inp
        }
        case 'bomb': {
            if (sq.t === 2) inp.bPressed = true
            if (sq.t > 95) b.seq = null
            return inp
        }
        case 'edge': {
            const dmap = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
            const d = dmap[sq.dir] || [1, 0]
            alignThen(sim, sq, inp, d)
            if (sq.t > 80) b.seq = null
            return inp
        }
        case 'enter': {
            alignThen(sim, sq, inp, [0, sq.dir])
            if (sq.t > 80) b.seq = null
            return inp
        }
        case 'aim': {
            // nudge to the switch column/row center, then draw + loose
            const m = sq.m
            const cx = m.x * TS + TS / 2
            const dx = cx - sim.hero.x
            if (Math.abs(dx) > 1) { inp.lx = Math.sign(dx); inp.ly = sq.dir * -1; return inp }
            if (sq.t < 3) { inp.ly = sq.dir; return inp } // face the plaque
            if (sq.t === 3) { inp.aPressed = true; b.drawing = true }
            else if (sq.t < 20) inp.aHeld = true
            else if (sq.t === 20) { inp.aReleased = true; b.seq = null }
            return inp
        }
        case 'push': {
            const block = (sim.blocks || [])[0]
            const plate = (SCREENS[sim.screen].plates || [])[0]
            if (!block || !plate) { b.seq = null; return inp }
            if (block.x === plate.x && block.y === plate.y) { b.seq = null; return inp }
            if (!b.pushQ || !b.pushQ.length) {
                b.pushQ = pushPlan(sim, block) || []
                if (!b.pushQ.length) { b.seq = null; return inp }
                sq.ht = Math.floor(sim.hero.x / TS) + ',' + Math.floor(sim.hero.y / TS)
            }
            const [dx, dy] = b.pushQ[0]
            inp.lx = dx; inp.ly = dy
            const ht = Math.floor(sim.hero.x / TS) + ',' + Math.floor(sim.hero.y / TS)
            if (ht !== sq.ht) { b.pushQ.shift(); sq.ht = ht; sq.stall = 0; b.pushStall = 0 }
            else if (++sq.stall > 28) {
                sq.stall = 0
                b.pushStall = (b.pushStall || 0) + 1
                if (b.pushStall > 12) { b.seq = null; b.pushStall = 0 } // give up, re-evaluate macro state
                else b.pushQ = pushPlan(sim, block) || b.pushQ
            }
            return inp
        }
        default: b.seq = null; return inp
    }
}

function fireSetup(sim, b, m) {
    // stand below/above the plaque in its column, aligned, then shoot
    const s = SCREENS[sim.screen]
    const dir = m.y === 0 ? 1 : -1 // plaque on top wall -> shoot up (face dir -1)
    void dir
    const faceUp = m.y <= 1
    let sy = -1
    for (let y = m.y + 1; y < SH; y++) {
        if (tileAt(s, m.x, y) !== '.') { break }
        sy = y
    }
    if (sy < 0) return
    b.seq = { kind: 'aim', m, dir: faceUp ? -1 : 1, t: 0, screen: sim.screen }
    void sy
}

function bossTick(sim, b, inp, id) {
    const e = sim.enemies.find(x => (id === 'boss1' ? x.type === 'maw' : x.type === 'wyrm') && !x.dead)
    if (!e) return inp
    const h = sim.hero
    const dx = e.x - h.x, dy = e.y - h.y
    const dist = Math.hypot(dx, dy)
    const killable = id === 'boss1' ? e.open > 0 : e.stagger > 0
    if (killable && dist < 30) {
        if (b.swT === undefined) b.swT = 0
        if (++b.swT % 18 === 1) { inp.aPressed = true } else if (b.swT % 18 === 2) { inp.aHeld = true } else if (b.swT % 18 === 3) { inp.aReleased = true }
        inp.lx = Math.sign(dx) || 0; inp.ly = Math.sign(dy) || 0
        return inp
    }
    b.swT = 0
    if (id === 'boss2' && e.open > 0 && e.stagger <= 0) {
        // arrow the open maw from mid range, dominant axis
        if (dist > 40) { inp.lx = Math.sign(dx) || 1; inp.ly = Math.sign(dy); return inp }
        const horiz = Math.abs(dy) < 12
        inp.lx = horiz ? Math.sign(dx) : 0
        inp.ly = horiz ? 0 : Math.sign(dy)
        if (b.arT === undefined) b.arT = 0
        if (++b.arT % 40 === 1) inp.aPressed = true
        else if (b.arT % 40 > 1 && b.arT % 40 < 16) inp.aHeld = true
        else if (b.arT % 40 === 16) inp.aReleased = true
        return inp
    }
    b.arT = 0
    // reposition: orbit mid-range
    if (dist > 60) { inp.lx = Math.sign(dx) || 1; inp.ly = Math.sign(dy) }
    else { inp.lx = Math.sin((sim.tick + (e.i || 0)) * 0.05) > 0 ? 1 : -1; inp.ly = 0 }
    return inp
}
