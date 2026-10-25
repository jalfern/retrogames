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

function screenRoute(from, to, flags) {
    if (from === to) return null
    const ok = (k) => !SCREENS[k] || !SCREENS[k].req || !flags || flags[SCREENS[k].req]
    const prev = { [from]: null }
    const q = [from]
    while (q.length) {
        const id = q.shift()
        for (const e of GRAPH[id]) {
            if (e.to in prev || !ok(e.to)) continue
            prev[e.to] = { id, e }
            if (e.to === to) { let cur = to; while (prev[cur].id !== from) cur = prev[cur].id; return prev[cur].e }
            q.push(e.to)
        }
    }
    return null
}

function screenReachable(from, to, flags) {
    if (from === to) return true
    const ok = (k) => !SCREENS[k] || !SCREENS[k].req || !flags || flags[SCREENS[k].req]
    const seen = { [from]: true }
    const q = [from]
    while (q.length) {
        const id = q.shift()
        for (const e of GRAPH[id]) { if (!ok(e.to)) continue; if (e.to === to) return true; if (!(e.to in seen)) { seen[e.to] = true; q.push(e.to) } }
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

// ---- graceful combat (#874) ----------------------------------------------
// Hit-and-run, species-aware, deterministic (pure sim + counters). The sim's
// own rules are the choreography: the tuskroot locks its charge line (dodge
// perpendicular, punish the rest), the husk's frontal arc deflects steel
// (toward = d·(-f) > 0.5), so bites come from the diagonal flank; the Maw
// only opens in its thorn window (strike, then stand off); the Wyrm's maw
// is arrowed from mid range while the hero keeps moving.

const ENGAGE = 46, LEASH = 84, FIGHT_BUDGET = 2400

const freeAt = (sim, x, y) => {
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS)
    if (tx < 0 || ty < 0 || tx >= SW || ty >= SH) return false
    const ch = tileAt(SCREENS[sim.screen], tx, ty)
    return !isSolidTile(ch) && ch !== 'C'
}

const setMove = (inp, dx, dy) => {
    inp.lx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0
    inp.ly = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0
}
const moveAway = (inp, dx, dy) => setMove(inp, -dx, -dy)

// 3-tick A tap inside a fight cadence; `every` spaces swings past the 16f
// sword cooldown. Returns true on the release tick (a strike was loosed).
function cadenceTap(f, inp, every) {
    f.tap = (f.tap || 0) + 1
    const p = f.tap % every
    if (p === 1) inp.aPressed = true
    else if (p === 2) inp.aHeld = true
    else if (p === 3) { inp.aReleased = true; return true }
    return false
}

// always-on danger: a pawing/charging tuskroot outranks the macro plan
function dodgeTick(sim, b, inp) {
    const h = sim.hero
    let threat = null, tBest = 1e9
    for (const e of sim.enemies) {
        if (e.dead || e.type !== 'tuskroot') continue
        if (!(e.st > 0 || e.charging > 0)) continue
        const d = Math.hypot(e.x - h.x, e.y - h.y)
        if (d < 120 && d < tBest) { tBest = d; threat = e }
    }
    if (!threat) return false
    let nx, ny
    if (threat.charging > 0) { nx = threat.chx; ny = threat.chy }
    else { const l = tBest || 1; nx = (h.x - threat.x) / l; ny = (h.y - threat.y) / l }
    let px = -ny, py = nx
    let side = ((threat.seedOff || 0) % 2) ? 1 : -1
    if (!freeAt(sim, h.x + px * side * 16, h.y + py * side * 16)) side = -side
    if (freeAt(sim, h.x + px * side * 16, h.y + py * side * 16)) {
        inp.lx = Math.sign(px * side); inp.ly = Math.sign(py * side)
    } else {
        moveAway(inp, nx, ny) // boxed: break the line backwards
    }
    return true
}

// fight only what the hero can actually walk to (the macro BFS is the only
// obstacle-aware path — chasing a monster through a lake starves the route)
function reachableThreat(sim, b, st) {
    const h = sim.hero
    let best = null, bd = ENGAGE
    for (const e of sim.enemies) {
        if (e.dead || e.hidden || e.boss) continue
        if (b.black && b.black[`${sim.screen}:${e.i}`]) continue // one honest try each
        const d = Math.hypot(e.x - h.x, e.y - h.y)
        if (d < bd) { bd = d; best = e }
    }
    if (!best) return null
    const p = tilePath(sim.screen,
        [Math.floor(h.x / TS), Math.floor(h.y / TS)],
        [Math.floor(best.x / TS), Math.floor(best.y / TS)], st)
    return p && p.length <= 20 ? best : null
}

export function fightTick(sim, b, inp) {
    const h = sim.hero
    const f = b.fight
    if (!f) return false
    const e = f.e
    if (e.dead) { b.fight = null; return false }
    const dx = e.x - h.x, dy = e.y - h.y
    const dist = Math.hypot(dx, dy)
    const blacken = () => { (b.black || (b.black = {}))[`${sim.screen}:${e.i}`] = true; b.fight = null; b.fightCool = 60 }
    if (dist > LEASH) { blacken(); return false }
    if (++f.t > FIGHT_BUDGET) {
        const k = `:`
        b.broke = b.broke || {}
        b.broke[k] = (b.broke[k] || 0) + 1
        if (b.broke[k] > 2) blacken(); else { b.fight = null; b.fightCool = 60 }
        return false
    }
    if (f.px === undefined) { f.px = h.x; f.py = h.y; f.pt = 0 }
    if (++f.pt > 60) {
        // pin detection: a rooted hero is stuck on geometry, not fighting;
        // tuskroot circles are legitimate patience, judge them by leash/budget
        if (Math.hypot(h.x - f.px, h.y - f.py) < 2 && e.type !== 'tuskroot') { blacken(); return false }
        f.px = h.x; f.py = h.y; f.pt = 0
    }
    f.tt = (f.tt || 0) + 1
    f.ph = f.ph || 'close'

    if (e.type === 'tuskroot') {
        // windup/charge is handled by dodgeTick; here: punish the rest, else
        // keep spacing just outside its wake-up range
        if (e.rest > 0) {
            if (dist > 20) { setMove(inp, dx, dy); return true }
            cadenceTap(f, inp, 8)
            return true
        }
        if (dist < 36) moveAway(inp, dx, dy); else if (dist > 52) setMove(inp, dx, dy)
        else { const s = f.side || 1; inp.lx = Math.sign(-dy) || s; inp.ly = Math.sign(dx) || s }
        return true
    }

    if (e.type === 'husk') {
        // frontal steel clanks (toward = dom/r > 0.5) — bite from a steep
        // diagonal: 4px off the swing axis, 13.5px off the minor (outside the
        // 12.5px contact band). Axis and side freeze at engage so the pose
        // doesn't flip as the husk circles.
        if (f.ax === undefined) {
            const horiz = Math.abs(dx) >= Math.abs(dy)
            f.ax = horiz ? 1 : 0
            f.sx = horiz ? (Math.sign(dx) || 1) : 1
            f.sy = horiz ? 1 : (Math.sign(dy) || 1)
            f.mn = ((e.seedOff || 0) % 2) ? 1 : -1
        }
        const mx = f.ax, my = 1 - f.ax
        const s0 = mx ? f.sx : f.sy
        const poseX = e.x + mx * s0 * 4 + (1 - mx) * f.mn * 13.5
        const poseY = e.y + my * s0 * 4 + mx * f.mn * 13.5
        if (f.ph === 'close') {
            const minorDelta = mx ? (h.y - e.y) : (h.x - e.x)
            if (minorDelta * f.mn < 0) { // wrong side of the blade line: slip around, never through
                if (mx) inp.ly = f.mn; else inp.lx = f.mn
                return true
            }
            if (Math.hypot(h.x - poseX, h.y - poseY) > 5) { setMove(inp, poseX - h.x, poseY - h.y); return true }
            f.ph = 'aim'; f.tt = 0
            return true
        }
        if (f.ph === 'aim') {
            inp.lx = -mx * s0; inp.ly = -my * s0 // one tick of facing along the swing axis
            if (f.tt > 0) { f.ph = 'strike'; f.tt = 0; f.hp = e.hp }
            return true
        }
        if (f.ph === 'strike') {
            if (f.tt === 1) inp.aPressed = true
            else if (f.tt === 2) inp.aHeld = true
            else if (f.tt === 3) inp.aReleased = true // short tap = sword, not bow
            if (f.tt > 4) {
                if (e.dead) { b.fight = null; return false }
                if (!(e.hp < f.hp)) f.mn = -f.mn // clanked: new corner
                f.ph = 'close'; f.tt = 0 // re-orbit between bites, the husk walks
            }
            return true
        }
        return true
    }

    // trash ghouls (cinderling/wisp/bat/sprig/pod-sparks/spitter): close,
    // slash, hop back out of the contact box before re-engaging
    if (f.ph === 'close') {
        if (e.type === 'spitter' && f.t % 12 < 6) { inp.lx = f.zz || 1; inp.ly = 0 }
        if (dist > 20) { setMove(inp, dx, dy); return true }
        f.ph = 'strike'; f.tt = 0
        return true
    }
    if (f.ph === 'strike') {
        cadenceTap(f, inp, 6)
        if (f.tt > 4) { f.ph = 'back'; f.tt = 0; f.zz = -(f.zz || 1) }
        return true
    }
    moveAway(inp, dx, dy)
    if (f.tt > 12) { f.ph = 'close'; f.tt = 0 }
    return true
}

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

    if (sim.death || sim.win) { b.pi = 0; b.seq = null; b.fight = null; b.boss = null; return inp }
    if (b.fight && b.fight.screen !== sim.screen) b.fight = null
    if (b.boss && b.boss.screen !== sim.screen) b.boss = null
    if (b.fightCool > 0) b.fightCool--
    if (dodgeTick(sim, b, inp)) return inp
    // panic-break: a monster that refuses to lose contact (a blacklisted tail
    // at a slow puzzle step) gets shed with a sprint on a free axis (#874)
    if (b.panicT > 0) { b.panicT--; inp.lx = b.panicV[0]; inp.ly = b.panicV[1]; return inp }
    {
        const h0 = sim.hero
        let tail = null, td = 26
        for (const e of sim.enemies) {
            if (e.dead || e.hidden || e.boss) continue
            const d = Math.hypot(e.x - h0.x, e.y - h0.y)
            if (d < td) { td = d; tail = e }
        }
        const key = tail ? `${sim.screen}:${tail.i}` : null
        b.tailT = tail && b.tailKey === key ? b.tailT + 1 : 0
        b.tailKey = key
        if (tail && b.tailT > 48) {
            b.tailT = 0
            const ax = h0.x - tail.x, ay = h0.y - tail.y
            const cands = Math.abs(ax) >= Math.abs(ay)
                ? [[Math.sign(ax) || 1, 0], [0, Math.sign(ay) || 1], [0, -(Math.sign(ay) || 1)], [-Math.sign(ax) || 1, 0]]
                : [[0, Math.sign(ay) || 1], [Math.sign(ax) || 1, 0], [-Math.sign(ax) || 1, 0], [0, -Math.sign(ay) || 1]]
            for (const v of cands) if (freeAt(sim, h0.x + v[0] * 20, h0.y + v[1] * 20)) { b.panicV = v; b.panicT = 26; break }
        }
    }
    if (!b.plan) b.plan = proveGame({ bombs: true }).route.filter(a => !SCREENS[a.screen] || !SCREENS[a.screen].req)
    const st = solveSt(sim)
    if (!b.fight && (!b.seq || b.seq.kind === 'walk') && !b.fightCool) {
        const t = reachableThreat(sim, b, st)
        if (t) b.fight = { e: t, screen: sim.screen, t: 0, tt: 0, ph: 'close', tap: 0, zz: 1, side: 1 }
    }
    if (b.fight && fightTick(sim, b, inp)) return inp
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
            if (ph < bestPhase && screenReachable(sim.screen, b.plan[i].screen, sim.flags)) { bestPhase = ph; ti = i }
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
        const e = screenRoute(sim.screen, a.screen, sim.flags)
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

// bosses: choreography, not tile-chasing (#874). Maw = strike-in-window then
// stand off until the thorns open again. Wyrm = arrow the open maw from mid
// range on the move (align, set facing, draw, loose, hop back), then carve
// the stunned core in slash-pulse rhythm.
export function bossTick(sim, b, inp, id) {
    const e = sim.enemies.find(x => (id === 'boss1' ? x.type === 'maw' : x.type === 'wyrm') && !x.dead)
    if (!e) return inp
    const h = sim.hero
    const s = b.boss || (b.boss = { screen: sim.screen, ph: 'reposition', tt: 0, strikes: 0, tap: 0, side: ((e.seedOff || 0) % 2) ? 1 : -1 })
    s.tt++
    const dx = e.x - h.x, dy = e.y - h.y
    const dist = Math.hypot(dx, dy)
    const horiz = Math.abs(dx) >= Math.abs(dy)
    const px = horiz ? 0 : (Math.sign(dx) || s.side)
    const py = horiz ? (Math.sign(dy) || s.side) : 0

    if (id === 'boss1') {
        if (e.open > 0) {
            if (s.ph !== 'window' && s.ph !== 'bounce') { s.ph = 'window'; s.tt = 0; s.strikes = 0 }
            if (s.ph === 'window') {
                if (dist > 24) { setMove(inp, dx, dy); return inp }
                cadenceTap(s, inp, 8)
                if (dist < 28 && s.tap % 8 === 3) s.strikes++
                if (s.strikes >= 2) { s.ph = 'bounce'; s.tt = 0 }
                return inp
            }
            if (dist < 52) { moveAway(inp, dx, dy); return inp }
        }
        if (s.ph !== 'orbit') { s.ph = 'orbit'; s.tt = 0; s.strikes = 0 }
        if (dist < 40) moveAway(inp, dx, dy)
        else if (dist > 54) setMove(inp, dx, dy)
        else { inp.lx = px; inp.ly = py }
        return inp
    }

    if (e.stagger > 0) {
        if (s.ph !== 'rush' && s.ph !== 'pulse') { s.ph = 'rush'; s.tt = 0 }
        if (s.ph === 'rush') {
            if (dist > 22) { setMove(inp, dx, dy); return inp }
            cadenceTap(s, inp, 10)
            if (s.tap % 10 === 3) { s.ph = 'pulse'; s.tt = 0 }
            return inp
        }
        moveAway(inp, dx, dy)
        if (s.tt > 10) { s.ph = 'rush'; s.tt = 0 }
        return inp
    }
    if (e.open > 0) {
        if (!['align', 'face', 'draw', 'retreat'].includes(s.ph)) { s.ph = 'align'; s.tt = 0 }
        if (s.ph === 'align') {
            if (dist > 70) { setMove(inp, dx, dy); return inp }
            const minor = horiz ? dy : dx
            if (Math.abs(minor) > 8) { if (horiz) inp.ly = Math.sign(minor); else inp.lx = Math.sign(minor); return inp }
            s.ph = 'face'; s.tt = 0
            return inp
        }
        if (s.ph === 'face') {
            setMove(inp, dx, dy)
            if (s.tt > 1) { s.ph = 'draw'; s.tt = 0 }
            return inp
        }
        if (s.ph === 'draw') {
            if (s.tt === 1) inp.aPressed = true
            else if (s.tt < 15) inp.aHeld = true
            else { inp.aReleased = true; s.ph = 'retreat'; s.tt = 0 }
            return inp
        }
        moveAway(inp, dx, dy)
        if (s.tt > 14) { s.ph = 'align'; s.tt = 0 }
        return inp
    }
    if (dist < 48) moveAway(inp, dx, dy)
    else if (dist > 78) setMove(inp, dx, dy)
    else { inp.lx = px; inp.ly = py }
    return inp
}
