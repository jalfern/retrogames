// PLANNER — the autopilot. It walks a BFS route per macro-phase on the REAL
// grid (real pots, real blocks, real doors), fights by swinging at anything
// aligned within reach, tanks the boss room, and stops with a reason. plan()
// runs the real sim and records the tick stream; the attract demo replays it
// and scripts/zeldacheck.mjs re-runs it as the winnability proof (slack too).

import { makeGame, step, CFG } from './sim.js'
import { TILE, COLS, ROWS, PLAY_H, screenOf, at, isWall } from './world.js'

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

function walkable(s, c, r) {
    const scr = screenOf(s.scr)
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false
    const ch = at(scr, c, r)
    if (ch === 'B' || ch === 'p') return false
    if (ch === 'T' && !s.flags.crack) return false
    if (isWall(ch, scr.kind)) return false
    if (s.pots.some((p) => p.c === c && p.r === r && !p.smashed)) return false
    return true
}

function bfs(s, tc, tr) {
    const seen = new Set(); const q = []
    let sc = Math.floor((s.px + 8) / TILE); const sr = Math.floor((s.py + 10) / TILE)
    if (!walkable(s, sc, sr)) {
        // the edge nudge can park the box against a wall tile; hop to the
        // nearest open tile rather than declaring the world unroutable
        const cand = [[sc - 1, sr], [sc + 1, sr], [sc, sr - 1], [sc, sr + 1]].find(([c, r]) => walkable(s, c, r))
        if (!cand) return null
        sc = cand[0]
    }
    q.push([sc, sr]); seen.add(sc + ',' + sr)
    const from = {}
    while (q.length) {
        const [c, r] = q.shift()
        if (c === tc && r === tr) {
            const path = []; let k = tc + ',' + tr
            while (k !== sc + ',' + sr) { path.unshift(k.split(',').map(Number)); k = from[k] }
            return path
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dx; const nr = r + dy
            if (seen.has(nc + ',' + nr) || !walkable(s, nc, nr)) continue
            seen.add(nc + ',' + nr); from[nc + ',' + nr] = c + ',' + r
            q.push([nc, nr])
        }
    }
    return null
}

export function makePlanner(_opts = {}) {
    let phase = 0
    let path = null
    let stuck = 0
    const brain = makeBrain()
    const dist = (s, e) => Math.max(Math.abs(e.x - s.px), Math.abs(e.y - s.py))
    const SPAN = { up: [0, 15], down: [0, 15], left: [0, ROWS - 1], right: [0, ROWS - 1] }
    const edgeOf = (s) => {
        const scr = screenOf(s.scr)
        const near = (span, v) => v >= span[0] && v <= span[1]
        const cc = Math.floor((s.px + 8) / TILE); const cr = Math.floor((s.py + 10) / TILE)
        for (const d of ['up', 'down', 'left', 'right']) {
            const e = scr[d]
            if (!e) continue
            const span = e.cols || e.rows || SPAN[d]
            if (d === 'up' && cr <= 1 && near(span, cc)) return 'up'
            if (d === 'down' && cr >= ROWS - 2 && near(span, cc)) return 'down'
            if (d === 'left' && cc <= 1 && near(span, cr)) return 'left'
            if (d === 'right' && cc >= COLS - 2 && near(span, cr)) return 'right'
        }
        return null
    }
    let lastPx = 0; let lastPy = 0; let lastInp = null
    let lastScr = '1,1'
    let noExit = null
    let noExitT = 0
    let wig = 0
    let bombArmed = false
    let crackWait = 0
    let fail = null
    const PH = [
        { at: '1,1', to: [12, 4] },
        { at: 'CAVE_SWORD', to: [6, 5], talk: 'sword' },
        { at: 'CAVE_SWORD', exit: true },
        { at: '1,1', to: [5, 8] },
        { at: '1,1', to: [14, 1] },
        { at: '1,1', to: [6, 10] },
        { at: '1,2', to: [6, 6] },
        { at: '1,2', to: [0, 6] },
        { at: '0,2', to: [8, 3] },
        { at: '0,2', to: [5, 1], buy: true },
        { at: 'SHOP', to: [6, 3], talk: 'buy' },
        { at: 'SHOP', exit: true },
        { at: '0,2', to: [15, 6], go: 'r' },
        { at: '1,2', to: [6, 0] },
        { at: '1,1', to: [3, 6] },
        { at: '1,1', to: [0, 6] },
        { at: '0,1', to: [4, 2], bomb: true },
        { at: '0,1', to: [4, 0], crack: true },
        { at: 'CAVE_BOMBS', to: [6, 3], talk: 'bombs' },
        { at: 'CAVE_BOMBS', exit: true },
        { at: '0,1', to: [8, 0] },
        { at: '0,0', to: [15, 5] },
        { at: '1,0', to: [7, 0] },
        { at: 'D0', to: [10, 5] },
        { at: 'D0', to: [8, 0] },
        { at: 'D1', to: [6, 6] },
        { at: 'D1', push: true },
        { at: 'D1', to: [15, 4] },
        { at: 'D2', boss: true },
    ]

    return {
        done: () => fail,
        dbg: () => ({ phase, path: path && path.slice(0, 3), stuck, wig }),
        decide(s) {
            const inp = this._decide(s)
            lastInp = inp.r ? 'r' : inp.l ? 'l' : inp.u ? 'u' : inp.d ? 'd' : null
            return inp
        },
        _decide(s) {
            const inp = { u: false, d: false, l: false, r: false, a: false, b: false }
            if (s.end || s.trans) return inp
            void 0
            if (s.scr !== PH[phase].at) {
                if (PH[phase + 1] && PH[phase + 1].at === s.scr) { phase++; path = null }
                else { fail = `phase ${phase} (${PH[phase].at}) saw ${s.scr}`; return inp }
            }
            const ph = PH[phase]

            // talk: mash A until the gift is booked
            if (ph.talk && s.talk) {
                if (ph.talk === 'buy' && !s.prevATalk && s.talk.i >= s.talk.lines.length - 1 && !s.flags.bought && s.rupees < s.price) {
                    fail = `BROKE: ${s.rupees}/${s.price} rupees`; return inp
                }
                s.prevATalk = !!inp.a
                inp.a = s.tick % 7 < 2; return inp
            }
            if (ph.talk && !s.talk) {
                const got = ph.talk === 'sword' ? s.flags.swordTaken : ph.talk === 'bombs' ? s.flags.bombsTaken : s.flags.bought
                if (got) { phase++; path = null; brain.reset(); s.prevATalk = false; return inp }
            }
            if (ph.exit) {
                // the shopkeeper re-offers as long as you stand in his range —
                // close the chat with A, then walk out of earshot
                if (s.talk) { inp.a = s.tick % 7 < 2; return inp }
                inp.d = true; return inp
            }
            if (ph.crack) {
                if (!s.flags.crack) { crackWait++; if (crackWait > 400) fail = 'crack never came' }
                inp.u = true
                return inp
            }

            // STUCK against last tick's motion request — measured per axis,
            // because a fight pocket at a boulder face wiggles px by ±1 and a
            // position-keyed detector resets itself on the boundary forever.
            const ddx = s.px - lastPx; const ddy = s.py - lastPy
            const wantX = lastInp === 'l' || lastInp === 'r'
            const wantY = lastInp === 'u' || lastInp === 'd'
            if ((wantX && Math.abs(ddx) < 0.4) || (wantY && Math.abs(ddy) < 0.4)) stuck++
            else stuck = 0
            lastPx = s.px; lastPy = s.py
            if (stuck > 12) { stuck = 0; wig = 34; brain.drop(s); path = null }

            // dodge: a projectile on a rail is a solved problem — step off the
            // rail. This is how a player survives octorok streams: the sidestep.
            const cx = s.px + 8; const cy = s.py + 10
            for (const q of s.shots) {
                const h = q.vx && Math.abs(q.y - cy) < 10 && (q.vx > 0 ? q.x < cx + 110 && q.x > cx - 8 : q.x > cx - 110 && q.x < cx + 8)
                const v = q.vy && Math.abs(q.x - cx) < 10 && (q.vy > 0 ? q.y < cy + 110 && q.y > cy - 8 : q.y > cy - 110 && q.y < cy + 8)
                if (h) { if (q.y > cy) inp.u = true; else inp.d = true; return inp }
                if (v) { if (q.x > cx) inp.l = true; else inp.r = true; return inp }
            }

            // fight: committed target, walked into real sword range.
            // Pinned (input demands motion, world says no) drops the fight and
            // wiggles free first - combat shoving the bot into a tree forever
            // is a planner bug, not a wall's fault.
            const edge = edgeOf(s)
            // wiggling "free" out of the edge you just walked through is just
            // a way to walk backwards onto the previous screen — but only
            // THAT edge. Guarding every edge killed the up-shimmy a boulder
            // corner needs, and the bot starved at range instead.
            const WDIR = { r: 'right', l: 'left', u: 'up', d: 'down' }
            if (s.scr !== lastScr) {
                const back = ['up', 'down', 'left', 'right'].find((d) => screenOf(s.scr)[d] && screenOf(s.scr)[d].to === lastScr)
                if (back) { noExit = back; noExitT = s.tick + 140 }
                lastScr = s.scr
            }
            const block = edge && edge === noExit && s.tick < noExitT ? edge : null
            if (wig > 0) {
                wig--
                const k = ['r', 'u', 'd', 'u'][(Math.floor(wig / 14)) % 4]
                if (WDIR[k] !== block) inp[k] = true
                return inp
            }
            const watch = new Set()
            if (path) for (const [c, r] of path.slice(0, 5)) watch.add(`${c},${r}`)
            const e = brain.tick(s, edge, dist, watch)
            // SWARM RETREAT: two or more within howling range means the road,
            // not the duel. Kill nothing that is not already inside the sword
            // arc; a player backs out of a mob and picks them off after.
            const near2 = s.enemies.filter((q) => dist(s, q) < 60).length
            if (e && s.flags.sword && near2 < 2) { 
                const dx = e.x - s.px; const dy = e.y - s.py
                // STANDOFF: the sword reaches from 8 to 27 px; inside 17 the
                // bodies touch. Walk to the pocket, never into the monster.
                // SWING PULSE: the sim edge-triggers A (press != hold), so a
                // fight that pressed A every tick swung exactly once. Pulse it.
                // RUSH, never retreat: backing off a biter in a corridor is
                // how the bot starved. Close the gap and keep swinging; the
                // iframe chain eats grazes, hearts pay them back.
                let reach = false
                if (Math.abs(dx) > Math.abs(dy)) {
                    if (Math.abs(dx) > 17) { if (dx > 0) inp.r = true; else inp.l = true }
                    else if (Math.abs(dy) > 4) { if (dy > 0) inp.d = true; else inp.u = true }
                    else { if (dx > 0) inp.r = true; else inp.l = true }
                    reach = Math.abs(dx) < 30 && Math.abs(dy) < 12
                } else {
                    if (Math.abs(dy) > 17) { if (dy > 0) inp.d = true; else inp.u = true }
                    else if (Math.abs(dx) > 4) { if (dx > 0) inp.r = true; else inp.l = true }
                    else { if (dy > 0) inp.d = true; else inp.u = true }
                    reach = Math.abs(dy) < 30 && Math.abs(dx) < 12
                }
                if (reach || Math.abs(dx) < 44 || Math.abs(dy) < 44) inp.a = s.tick % 7 < 2
                brain.advanced()
                return inp
            }
            if (e && s.flags.sword) {
                for (const q of s.enemies) {
                    const d = dist(s, q)
                    if (d < 26) { if (Math.abs(q.x - s.px) > Math.abs(q.y - s.py)) inp[q.x > s.px ? 'r' : 'l'] = true; else inp[q.y > s.py ? 'd' : 'u'] = true; inp.a = s.tick % 8 < 2; return inp }
                }
            }

            // Aquamentus: no pocket to duel it in — it owns the middle band.
            // Wait in the top-left corner until its patrol drops below the
            // top row, then dash along row 1 to the pedestal. A player waits
            // for the head to pass; so does the brain.
            if (ph.boss) {
                const b = s.enemies.find((e) => e.type === 'aquamentus')
                if (b) {
                    const c = Math.floor((s.px + 8) / TILE); const r = Math.floor((s.py + 10) / TILE)
                    const safe = b.y > 88
                    if (!safe) {
                        if (r !== 1) { if (r > 1) inp.u = true; else inp.d = true; return inp }
                        if (c !== 12) { if (c > 12) inp.l = true; else inp.r = true; return inp }
                        if (s.tick % 16 < 2) inp.a = true
                        return inp
                    }
                    if (r !== 1) { inp.u = true; return inp }
                    if (c > 4) { inp.l = true; if (s.tick % 14 < 2) inp.a = true; return inp }
                    if (r < 2) { inp.d = true; return inp }
                }
            }
            if (ph.push) {
                if (Math.abs(s.px - 6 * TILE) > 6) { if (s.px < 6 * TILE) inp.r = true; else inp.l = true; return inp }
                if (!s.flags.switch) { inp.u = true; return inp }
                phase++; path = null; return inp
            }
            if (ph.bomb) {
                if (bombArmed && !s.bomb && !s.flags.crack) bombArmed = false // fuse expired, missed — throw again
                if (!s.flags.crack && !bombArmed && Math.abs(s.py - 2 * TILE) < 12 && Math.abs(s.px - 4 * TILE) < 10) {
                    inp.u = true
                    if (s.tick % 5 === 0) { inp.b = true; bombArmed = true }
                    return inp
                }
                if (s.flags.crack) { phase++; path = null; return inp }
            }

            // walk the route
            if (!path || !path.length) {
                if (!ph.to) return inp
                if (Math.floor((s.px + 8) / TILE) === ph.to[0] && Math.floor((s.py + 10) / TILE) === ph.to[1]) {
                    phase++; path = null; brain.reset()
                    if (ph.go) inp[ph.go] = true // walk THROUGH the edge, don't stand on the tripwire
                    return inp
                }
                path = bfs(s, ph.to[0], ph.to[1])
                if (!path) { fail = `no route ${s.scr} → ${ph.to} (phase ${phase})`; return inp }
            }
            const [tc, tr] = path[0]
            const tx = tc * TILE + 8; const ty = tr * TILE + 10
            const dx = tx - (s.px + 8); const dy = ty - (s.py + 10)
            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { path.shift(); return inp }
            // A corridor along a boulder face only passes at one exact lane
            // (the hitbox straddles the next row's corners). If the lane axis
            // is refused, probe the other axis for a tick — a player shimmies;
            // a bot that just re-presses the wall starves under sniper fire.
            if (stuck > 5) {
                const wantV = Math.abs(dx) >= Math.abs(dy)
                if (wantV) { if ((s.tick % 4) < 2) inp.u = true; else inp.d = true; stuck = stuck > 26 ? (stuck = 0, 999) : stuck; return inp }
            }
            if (Math.abs(dx) >= Math.abs(dy)) { if (dx > 0) inp.r = true; else inp.l = true }
            else if (dy > 0) inp.d = true; else inp.u = true
            return inp
        },
    }
}

// A threat list with memory. Recomputing "the nearest aligned enemy" every
// tick made the bot an infinite punching bag: it fought an octorok that stood
// IN its path, never closed because the octorok sidestepped at its turn
// interval, and let the route rot. So the brain commits to a target, walks
// INTO reach (the sword is ~22px, so anything that only demands alignment is
// a lie), refuses to fight across a screen edge it is about to cross, and
// abandons a target that will not die before the route matters again.
function los(s, e) {
    const x0 = s.px + 8; const y0 = s.py + 10; const x1 = e.x + 8; const y1 = e.y + 8
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 8)
    for (let k = 1; k < n; k++) {
        const x = x0 + (x1 - x0) * k / n; const y = y0 + (y1 - y0) * k / n
        if (!walkable(s, Math.floor(x / TILE), Math.floor(y / TILE))) return false
    }
    return true
}

function makeBrain() {
    let target = null
    let hunt = 0
    let cool = 0
    let banned = new Map()
    return {
        reset() { target = null; hunt = 0; cool = 60 },
        // "I cannot reach that one" must outlive the cooldown, or the next
        // target is the same octorok and the bot pins against the tree again
        drop(s) { if (target && s) banned.set(target, s.tick + 600); target = null; hunt = 0; cool = 30 },
        tick(s, edge, dist, watch) {
            if (cool > 0) { cool--; if (target && (dist(s, target) > 34 || (banned.get(target) || 0) > s.tick)) target = null; return null }
            for (const [e, until] of banned) if (until < s.tick && !s.enemies.includes(e)) banned.delete(e)
            if (target && ((banned.get(target) || 0) > s.tick || !s.enemies.includes(target))) target = null
            if (target) { hunt++; if ((edge && hunt > 150 && dist(s, target) > 30) || hunt > 300) this.drop(s); return target }
            // TRANSIT policy: fight what can touch you or bar the route.
            // 110px was a bar-fight, 44px a sniping gallery you can never
            // dodge in a corridor. 78 with swarm-retreat + heart drops is
            // the pace of a player clearing a screen while crossing it.
            let best = null; let bd = 0
            for (const e of s.enemies) {
                if ((banned.get(e) || 0) > s.tick) continue
                if (!los(s, e) || (edge && acrossEdge(e, edge))) continue
                const d = dist(s, e)
                const blocking = watch && watch.has(`${Math.floor((e.x + 8) / TILE)},${Math.floor((e.y + 8) / TILE)}`)
                const score = blocking ? Math.min(d, 20) : d
                if ((d < 78 || blocking) && score <= (bd || 1e9)) { bd = score; best = e }
            }
            target = best
            if (best) { hunt = 1 }
            return target
        },
        advanced() { hunt++ },
    }
}
// an enemy on the far side of the edge we are walking through is not a fight,
// it is a door: chasing it drags the bot back out of the screen it just entered
const acrossEdge = (e, edge) =>
    edge === 'right' ? e.x > 236 : edge === 'left' ? e.x < 20 :
    edge === 'down' ? e.y > PLAY_H - 24 : edge === 'up' ? e.y < 16 : false
export function plan(opts = {}) {
    const s = makeGame(opts)
    const pl = makePlanner(opts)
    const script = []
    for (let i = 0; i < 30000 && !s.end; i++) {
        const inp = pl.decide(s)
        script.push(inp)
        step(s, inp)
        if (pl.done() && !s.end) { return { result: 'fail: ' + pl.done(), ticks: i, script, state: s } }
    }
    return { result: s.end || 'timeout', ticks: script.length, script, state: s }
}
