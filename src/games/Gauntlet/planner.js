// GAUNTLET — the autopilot. It drives the SAME sim the player does, with the
// same key/tap actions, and proves every maze is winnable. The attract mode
// replays its proven run tick-for-tick; gauntletcheck grades it (and grades it
// again with the slack rule: one fewer food and one fewer potion per maze).
//
// Strategy, maze by maze:
//   1. If keys < locks-between-me-and-stairs, BFS to the nearest key.
//   2. Else BFS to the stairs. Slam/locked doors are passable in the BFS
//      because the pilot CAN open them (locks cost a key it already counted).
//   3. Each tick: face the next waypoint's cell center, and if a monster is
//      in reach and roughly ahead, turn and swing instead of walking.
//   4. It grabs food/potion/gold/key whenever one sits ON its path line, and
//      eats early when hp drops below half.

import { makeGame, step, stateHash, CFG, doorAt } from './sim.js'
import { LEVELS, W, H, MONSTERS } from './levels.js'

// #950: the pilot plans conservatively — breakable and trap walls are stone to
// it (a level must not REQUIRE the hammer or the vanishing cycle to be won);
// warp pads, teleporters and stun tiles it shares with a player.
const cellWalk = (gs, c, r) => {
    const ch = gs.levelData.grid[r][c]
    if (ch === '#' || ch === 'B' || ch === 'T') return false
    return true // doors are passable: the pilot opens them on contact
}

function bfs(gs, sr, sc, tr, tc) {
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([sr * W + sc])
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            const path = []
            let k = tr * W + tc
            while (k !== sr * W + sc) {
                path.unshift([k % W, Math.floor(k / W)])
                k = prev.get(k)
                if (k === undefined) return []
            }
            return path
        }
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc
            const key = nr * W + nc
            if (seen.has(key) || nr < 0 || nc < 0 || nr >= H || nc >= W) continue
            if (!cellWalk(gs, nc, nr)) continue
            seen.add(key); prev.set(key, r * W + c); q.push([nr, nc])
        }
    }
    return []
}

function locksBetween(gs, sr, sc, tr, tc) {
    // count locked doors on a BFS path; keys on the open map cover them
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([sr * W + sc])
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            let n = 0, k = tr * W + tc
            while (k !== sr * W + sc) {
                const cc = k % W, rr = Math.floor(k / W)
                if (gs.levelData.grid[rr][cc] === 'L') n++
                k = prev.get(k)
            }
            return n
        }
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc
            const key = nr * W + nc
            if (seen.has(key) || nr < 0 || nc < 0 || nr >= H || nc >= W) continue
            if (!cellWalk(gs, nc, nr)) continue
            seen.add(key); prev.set(key, r * W + c); q.push([nr, nc])
        }
    }
    return Infinity
}

const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

function losClear(gs, x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.ceil(d / 0.25)
    for (let i = 1; i < steps; i++) {
        const t = i / steps
        const c = Math.floor(x0 + (x1 - x0) * t), r = Math.floor(y0 + (y1 - y0) * t)
        if ('#BT'.includes(gs.levelData.grid[r][c])) return false
    }
    return true
}

export function decide(gs) {
    const h = gs.hero
    if (!h || h.deadT > 0 || gs.end) return {}
    const inp = {}

    // face and swing at a LOCKED threat (Death outranks the rest — it drains).
    // The lock matters: with two grunts in reach, retargeting every tick
    // oscillates the aim and the pilot never swings.
    let threat = gs.monsters.find((m) => m.id === gs._pThreat)
    if (threat) {
        const d = Math.hypot(threat.x - h.x, threat.y - h.y)
        const drain = MONSTERS[threat.kind].drain
        if (d > 7 || !losClear(gs, h.x, h.y, threat.x, threat.y) || (!drain && d > 2.4 && gs.tick > (gs._pThreatAt || 0) + 90)) threat = null
    }
    if (!threat) {
        // engage: anything close, or anything roughly AHEAD within arrow reach.
        // We never chase monsters across the maze — the objective walk is the
        // economy; hunts are time-sinks that starve us out.
        let drain = null, dd = 1e9, front = null, fs = 1e9
        for (const m of gs.monsters) {
            const d = Math.hypot(m.x - h.x, m.y - h.y)
            if (d > 7 || !losClear(gs, h.x, h.y, m.x, m.y)) continue
            if (MONSTERS[m.kind].drain) { if (d < dd) { drain = m; dd = d }; continue }
            const diff = Math.abs(norm(Math.atan2(m.y - h.y, m.x - h.x) - h.a))
            if (d < 1.45 || (diff < 0.35 && d <= h.arrowRange)) {
                const s = d + diff * 4
                if (s < fs) { front = m; fs = s }
            }
        }
        if (front) { threat = front }
        else if (drain) threat = drain
    }
    gs._pThreat = threat ? threat.id : 0
    if (threat) gs._pThreatAt = gs.tick
    if (threat) {
        const dx = threat.x - h.x, dy = threat.y - h.y
        const d = Math.hypot(dx, dy)
        if (d < 0.65) { inp.sword = true; return inp }
        const want = Math.atan2(dy, dx)
        const diff = norm(want - h.a)
        if (gs.topDown) {
            // overhead: the pilot points absolutely (aim) and only travels down
            // the barrel it is looking through; the sim re-faces before it
            // swings, so aim + attack lands the same tick.
            if (Math.abs(diff) > 2.2 && d < 3.2) { inp.aim = want + Math.PI; inp.fwd = true; return inp }
            inp.aim = want
            if (d < 1.45) { inp.sword = true; return inp }
            if (d <= h.arrowRange) {
                inp.arrow = true
                if (MONSTERS[threat.kind].drain && d < 4.5) inp.back = true
                else inp.fwd = d > 3
            }
            return inp
        }
        const aiming = Math.abs(diff) <= 0.18
        if (aiming && d < 1.45) { inp.sword = true; return inp }
        if (aiming && d <= h.arrowRange) {
            inp.arrow = true
            if (MONSTERS[threat.kind].drain && d < 4.5) inp.back = true
            else inp.fwd = d > 3
            return inp
        }
        if (aiming) { inp.arrow = true; return inp }
        // something visible and hostile is BEHIND us and close: a run breaks
        // its contact (every walker is slower than the hero at full speed)
        if (Math.abs(diff) > 2.2 && d < 3.2) { inp.fwd = true; return inp }
        inp.left = diff < 0
        inp.right = diff > 0
        return inp
    }

    // doctrine: food when low -> keys the stairs need -> generators (the
    // attrition war is won at the spout) -> stairs.
    const hc = Math.floor(h.x), hr = Math.floor(h.y)
    const [ex, ey] = gs.levelData.exit
    const near = (t, onlyLiveGen = false) => {
        let bd = 1e9, goal = null
        const list = onlyLiveGen ? gs.gens.filter((g) => g.alive) : gs.items.filter((it) => !it.taken && it.t === t)
        for (const it of list) {
            const x = onlyLiveGen ? it.x : it.x
            const y = onlyLiveGen ? it.y : it.y
            const d = Math.abs(x - h.x) + Math.abs(y - h.y)
            if (d < bd) { bd = d; goal = [Math.floor(x), Math.floor(y)] }
        }
        return goal
    }
    let goal = null
    if (h.hp < h.maxHp * 0.7) goal = near('food') || near('potion')
    const locks = locksBetween(gs, hr, hc, ey, ex)
    if (gs.keys < locks) goal = goal || near('key')
    if (!goal) goal = [ex, ey]

    const path = bfs(gs, hr, hc, goal[1], goal[0])
    if (!path.length) { inp.fwd = true; return inp }
    // aim two cells ahead when we can see that far — aiming at the cell we are
    // standing on the boundary of flips the BFS start every tick and the
    // heading jitters instead of walking.
    const [pc, pr] = path[0]
    const straight = path.length > 1 && Math.abs(path[1][0] - pc) + Math.abs(path[1][1] - pr) === 2
    const [tc, tr] = straight ? path[1] : path[0]
    const want = Math.atan2(tr + 0.5 - h.y, tc + 0.5 - h.x)
    if (gs.topDown) { inp.aim = want; inp.fwd = true; return inp }
    const diff = norm(want - h.a)
    if (Math.abs(diff) > 0.1) {
        const dir = diff < 0 ? -1 : 1
        if (gs._pTurn && gs._pTurn !== dir && Math.abs(diff) < 0.35) {
            inp.left = gs._pTurn < 0
            inp.right = gs._pTurn > 0
        } else {
            gs._pTurn = dir
            inp.left = dir < 0
            inp.right = dir > 0
        }
    } else inp.fwd = true
    return inp
}

export function plan(seed = 0, opts = {}) {    const gs = makeGame(seed, opts.hero || 'warrior', { slack: !!opts.slack, partner: !!opts.partner, topDown: !!opts.topDown, levelCount: opts.levelCount })
    const script = []
    let deaths = 0
    const max = opts.maxTicks || 40000
    while (!gs.end && script.length < max) {
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
        if (gs.events.some((e) => e.type === 'death')) deaths++
        gs.events.length = 0
    }
    return { won: gs.end === 'win', deaths, score: gs.score, script, hash: stateHash(gs), gs }
}

// PARTNER PADS (#494, intelligence pass #505) — the CPU seat as a human: a pad
// emitter, nothing else. decide() drives P1; this drives P2, and it says ONLY
// what a pad can say: direction booleans + an `a` pulse (a level; the caller
// takes the sword edge from it, exactly like a gamepad). It trails no invisible
// leash and opens no doors by favor — it reads the maze the way a player does:
// it walks the BFS lane toward where the hero is HEADING (not where he was),
// waits at a locked door instead of grinding its face, cuts what walks into its
// reach, and breaks away for food when it is hurting. Pure and deterministic:
// same seed, same pads, same hash.
export function partnerPad(gs, prevA = false) {
    const pad = { left: false, right: false, up: false, down: false, a: false }
    const p = gs.partner, h = gs.hero
    if (!p || p.down || gs.end || !h || h.deadT > 0) return pad
    // cut what walks into reach (#505): a monster at the blade gets the `a`
    // pulse, but at honest pace the lane toward the hero is NEVER abandoned to
    // chase a beast across the room — the hero's sprint is the economy; a
    // partner that stops to duel a straggler is two cells behind him forever.
    let cut = false
    for (const m of gs.monsters) {
        if (Math.hypot(m.x - p.x, m.y - p.y) < 1.25) { cut = true; break }
    }
    if (cut) pad.a = !prevA
    // heading prediction (#505): the hero's per-tick velocity, smoothed — the
    // partner steps onto the hero's NEXT straight while he is still on this
    // one, so a sprint pulls it along instead of yo-yoing 3 cells behind him.
    const vx = h.x - (gs._pHX ?? h.x), vy = h.y - (gs._pHY ?? h.y)
    gs._pHX = h.x; gs._pHY = h.y
    gs._pVX = (gs._pVX ?? 0) * 0.4 + vx * 0.6
    gs._pVY = (gs._pVY ?? 0) * 0.4 + vy * 0.6
    const vs = Math.hypot(gs._pVX, gs._pVY)
    let tx, ty
    if (vs > 0.012) {
        const look = Math.min(1.8, vs * 24)
        tx = h.x + (gs._pVX / vs) * look
        ty = h.y + (gs._pVY / vs) * look
    } else {
        tx = h.x - Math.cos(h.a) * 1.0
        ty = h.y - Math.sin(h.a) * 1.0
    }
    const steer = (gx, gy, dead) => {
        const dx = gx - p.x, dy = gy - p.y
        if (Math.hypot(dx, dy) <= dead) return false
        pad.left = dx < -0.18
        pad.right = dx > 0.18
        pad.up = dy < -0.18
        pad.down = dy > 0.18
        return pad.left || pad.right || pad.up || pad.down
    }
    // hurt partners eat (#505): FOOD within a reasonable detour beats tailing
    // the hero — a downed partner is a life and a revival dash lost. Potions
    // are the hero's tactical call (they clear the halls); the seat never
    // walks onto one for them.
    if (p.hp < p.maxHp * 0.55) {
        let bd = 20, goal = null
        for (const it of gs.items) {
            if (it.taken || it.t !== 'food') continue
            const d = Math.abs(it.x - p.x) + Math.abs(it.y - p.y)
            if (d < bd) { bd = d; goal = [Math.floor(it.x), Math.floor(it.y)] }
        }
        if (goal) {
            const path = padPath(gs, Math.floor(p.y), Math.floor(p.x), goal[1], goal[0])
            if (path.length) { steerOnPath(pad, p, path, 0.3); return pad }
        }
    }
    const pr = Math.floor(p.y), pc = Math.floor(p.x)
    let path = padPath(gs, pr, pc, Math.floor(ty), Math.floor(tx))
    if (!path.length) path = padPath(gs, pr, pc, Math.floor(h.y), Math.floor(h.x))
    if (path.length) {
        steerOnPath(pad, p, path, 0.25)
        return pad
    }
    // No lane reaches the target. Either the hero is on the partner's own cell
    // (hold his back at a human's distance, stop dead when already there), or
    // he is sealed behind a locked door the seat cannot spend a key on — then
    // it WAITS at the threshold like a player (#505), no grinding the blade
    // into a door that will not give.
    const near = (gx, gy) => Math.floor(gy) === pr && Math.floor(gx) === pc
    if (near(tx, ty)) steer(tx, ty, 0.45)
    else if (near(h.x, h.y)) steer(h.x - Math.cos(h.a) * 1.0, h.y - Math.sin(h.a) * 1.0, 0.45)
    return pad
}

// BFS on the partner's walk rules: stone blocks; a slam door ('D') counts as
// open (it can push it — the seat's own push-to-open, #275); a LOCKED door
// ('L') blocks: the partner never spends the hero's key, it waits for him.
function padPath(gs, sr, sc, tr, tc) {
    const passable = (c, r) => {
        const ch = gs.levelData.grid[r] ? gs.levelData.grid[r][c] : '#'
        if (ch === '#' || ch === 'B' || ch === 'T') return false
        if (ch === 'L') {
            const d = doorAt(gs, c, r)
            return !!d && (d.open || d.broken)
        }
        return true
    }
    if (!passable(sc, sr) || !passable(tc, tr)) return []
    if (sr === tr && sc === tc) return []
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([sr * W + sc])
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            const path = []
            let k = tr * W + tc
            while (k !== sr * W + sc) {
                path.unshift([k % W, Math.floor(k / W)])
                k = prev.get(k)
                if (k === undefined) return []
            }
            return path
        }
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc
            const key = nr * W + nc
            if (seen.has(key) || nr < 0 || nc < 0 || nr >= H || nc >= W) continue
            if (!passable(nc, nr)) continue
            seen.add(key); prev.set(key, r * W + c); q.push([nr, nc])
        }
    }
    return []
}

// Walk the first waypoint of the lane with the pad. A locked door never
// appears as a waypoint (padPath blocks it), so a corridor sealed by a lock
// arrives as "no lane" and partnerPad holds — wait at the threshold, never
// grind the blade into a door that will not give.
function steerOnPath(pad, p, path, dead) {
    const [wc, wr] = path[0]
    const dx = wc + 0.5 - p.x, dy = wr + 0.5 - p.y
    if (Math.hypot(dx, dy) <= dead) return false
    pad.left = dx < -0.18
    pad.right = dx > 0.18
    pad.up = dy < -0.18
    pad.down = dy > 0.18
    return true
}
