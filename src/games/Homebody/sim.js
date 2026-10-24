// HOMEBODY — pure simulation (rules only; the shell is index.jsx, the look is art.js).
//
// An original people sim in the spirit of The Sims (Maxis, PC 2000) — its own IP,
// names and art. One suburban lot, two residents with five needs, a clock that
// never stops, a buy catalog, a job at the mailbox, a neighbour who wanders in,
// and a lifetime wish (60 contentment) as the win; both residents collapsed at
// once is the loss.
//
// Determinism law: every random the sim consumes comes from s.rng (mulberry32 of
// the seed). Math.random() is juice-only in the shell.

export const FIXED_DT = 1000 / 60
export const W = 640
export const H = 480
export const TILE = 32
export const COLS = 16
export const ROWS = 13
export const LOT_X = 8
export const LOT_Y = 40
export const PANEL_X = 528

export const HOUR_SEC = 5            // one sim hour = 5 real seconds (a day = 2 min)
export const WIN_CONTENT = 80
export const WORK_START = 8
export const WORK_END = 17
export const COLLAPSE_AT = 16       // seconds a red need may go unanswered
export const FAINT_SEC = 14        // how long a faint lasts
export const RED_AT = 0.12         // a need at/below this reads red (and alarms the gem)

// Per-need satisfaction signature: a distinct frequency, timbre and short note
// sequence (crunch / snooze / giggle / chatter / splash) plus an optional noise
// texture, so satisfying hunger never sounds like topping off energy. Consumed
// by the shell's handleEvents; a pure data table so peoplecheck can prove the
// five are actually distinct.
export const SFX = {
    hunger: { f: 660, type: 'square', seq: [1, 1.5, 1.25], noise: 0.07 },   // crunch
    energy: { f: 330, type: 'sine', seq: [1, 0.75, 0.5] },                   // snooze (falling)
    fun: { f: 523, type: 'triangle', seq: [1, 1.26, 1.5, 2] },               // giggle (arpeggio)
    social: { f: 700, type: 'triangle', seq: [1, 1.5, 1, 1.5] },            // chatter (alternating)
    bladder: { f: 600, type: 'sine', seq: [1, 0.66], noise: 0.06 },          // splash
}

// ---------------------------------------------------------------- map --------
// . grass   p path   F house floor   # wall   D door/gate (walkable)
export const MAP = [
    '................',
    '.###########....',
    '.#FFFFFFFFF#....',
    '.#FFFFFFFFF#....',
    '.#FFFFFFFFF#....',
    '.#F#####F###....',
    '.#FFFFF#FFF#....',
    '.#FFFFF#FFF#....',
    '.####D######....',
    '.....p..........',
    '.....p..........',
    '.....p..........',
    '#####D##########',
]

export const cellChar = (r, c) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? '#' : MAP[r][c])
export const groundAt = (r, c) => {
    const ch = cellChar(r, c)
    return ch === '.' ? 'grass' : ch === 'p' ? 'path' : ch === 'F' || ch === 'D' ? 'floor' : 'wall'
}

export const tileX = (c) => LOT_X + c * TILE
export const tileY = (r) => LOT_Y + r * TILE
export const tileOf = (px, py) => {
    const c = Math.floor((px - LOT_X) / TILE)
    const r = Math.floor((py - LOT_Y) / TILE)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return { r, c }
}

// ------------------------------------------------------------- catalog ------
// solid pieces block walking; décor pieces don't. `need`/`amt`/`dur` drive use.
export const CATALOG = [
    { id: 'bed', name: 'Cozy Bed', price: 210, h: 1, solid: true, need: 'energy', amt: 0.3, dur: 9 },
    { id: 'fridge', name: 'Fridge', price: 160, h: 1, solid: true, need: 'hunger', amt: 0.5, dur: 3 },
    { id: 'stove', name: 'Stove', price: 200, h: 1, solid: true, need: 'hunger', amt: 0.9, dur: 6 },
    { id: 'toilet', name: 'Porcelain Throne', price: 120, h: 1, solid: true, need: 'bladder', amt: 0.95, dur: 3 },
    { id: 'tv', name: 'Box TV', price: 250, h: 1, solid: true, need: 'fun', amt: 0.55, dur: 5 },
    { id: 'radio', name: 'Radio', price: 90, h: 1, solid: true, need: 'fun', amt: 0.35, dur: 4 },
    { id: 'book', name: 'Bookshelf', price: 120, h: 1, solid: true, need: 'fun', amt: 0.4, dur: 5 },
    { id: 'phone', name: 'Wall Phone', price: 110, h: 1, solid: true, need: 'social', amt: 0.55, dur: 4 },
    { id: 'shower', name: 'Shower Cubby', price: 150, h: 1, solid: true, need: 'bladder', amt: 0.2, dur: 4 },
    { id: 'sofa', name: 'Puffed Sofa', price: 180, h: 1, solid: true, need: 'fun', amt: 0.3, dur: 4, social: true },
    { id: 'plant', name: 'Potted Fern', price: 40, h: 1, solid: false, decor: true },
    { id: 'rug', name: 'Round Rug', price: 60, h: 1, solid: false, decor: true },
    { id: 'lamp', name: 'Floor Lamp', price: 80, h: 1, solid: false, decor: true },
]
export const DEF = Object.fromEntries(CATALOG.map((d) => [d.id, d]))
export const NEEDS = ['hunger', 'energy', 'fun', 'social', 'bladder']
export const PHYS = ['hunger', 'energy', 'bladder']
export const DECOR = ['plant', 'rug', 'lamp', 'book', 'sofa', 'tv', 'radio', 'phone']

// decay per sim hour, straight from the original's five motives
export const DECAY = { hunger: 0.15, energy: 0.055, fun: 0.115, social: 0.1, bladder: 0.14 }
export const NIGHT_ENERGY = 0.22    // energy drains faster after dark

// ---------------------------------------------------------------- rng -------
export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ------------------------------------------------------------- people -------
const person = (name, r, c, hue, worksOn) => ({
    name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2,
    hue,
    worksOn,
    needs: { hunger: 0.82, energy: 0.84, fun: 0.8, social: 0.75, bladder: 0.85 },
    queue: [], path: null, goal: null,
    use: null,             // { obj, def, t, dur }
    faintT: 0, redT: {},  // per-need seconds spent fully red
    workedToday: false, working: false,
    mood: 1, walkPhase: 0, face: 1,
    chatT: 0, alarmT: 0, wasRed: {},
})

export function newRun(seed) {
    const s = {
        seed: seed >>> 0,
        rng: mulberry32((seed >>> 0) ^ 0x4b0bb0d1),
        tick: 0, sec: 0, hour: 7, day: 1,
        money: 520, rank: 1, workDays: 0, content: 0,
        build: false, sel: 0,
        cursor: { r: 6, c: 8 },          // build cursor
        cursorA: { r: 2, c: 3 },        // dpad "use" cursor
        items: [
            { uid: 1, id: 'bed', r: 6, c: 4 },
            { uid: 2, id: 'fridge', r: 2, c: 9 },
            { uid: 3, id: 'toilet', r: 6, c: 9 },
            { uid: 4, id: 'mail', r: 11, c: 6 },
            { uid: 5, id: 'radio', r: 3, c: 2 },
        ],
        nextUid: 6,
        people: [person('Otto', 3, 3, '#e2574c', 1), person('Mira', 3, 8, '#3f7fd1', 0)],
        active: 0,
        visitor: null,                  // { name, x, y, path, state, t }
        visitAfter: null,             // hour of next visit
        visitGap: 0,
        thoughts: [], thoughtT: 0,
        events: [],
        fastT: 0,                      // "AT WORK" overlay seconds left
        done: null, endMsg: '',
        demo: false,
        ambience: 0, happyHours: 0,
    }
    scheduleVisit(s)
    return s
}

function scheduleVisit(s) {
    s.visitAfter = 9 + Math.floor(s.rng() * 5)
    s.visitGap = s.rng()
}

// ------------------------------------------------------------- occupancy -------
// occupancy of solid cells: the cells a placed item physically blocks
export function cellItem(s, r, c) {
    for (const it of s.items) {
        if (it.id === 'mail') { if (it.r === r && it.c === c) return it; continue }
        const d = DEF[it.id]
        if (!d) continue
        const h = d.h || 1
        if (it.c === c && r >= it.r && r < it.r + h) return it
    }
    return null
}

export function solidAt(s, r, c) {
    if (groundAt(r, c) === 'wall') return true
    const it = cellItem(s, r, c)
    if (!it) return false
    const d = DEF[it.id]
    return d ? d.solid !== false : true
}

export function walkable(s, r, c) {
    return groundAt(r, c) !== 'wall' && !solidAt(s, r, c)
}

// target tiles for an item: walkable neighbours
export function targetsOf(s, it) {
    const out = []
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const rr = it.r + dr, cc = it.c + dc
        if (walkable(s, rr, cc)) out.push({ r: rr, c: cc })
    }
    return out
}

// ------------------------------------------------------------- path -------
export function bfsPath(s, from, to) {
    if (!to.length) return null
    const q = [from]
    const prev = new Map()
    const seen = new Set([`${from.r},${from.c}`])
    const goalKey = new Set(to.map((t) => `${t.r},${t.c}`))
    while (q.length) {
        const cur = q.shift()
        if (goalKey.has(`${cur.r},${cur.c}`)) {
            const path = [cur]
            let k = `${cur.r},${cur.c}`
            while (prev.has(k)) {
                const p = prev.get(k)
                path.unshift(p)
                k = `${p.r},${p.c}`
            }
            path.shift()
            return path
        }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = cur.r + dr, nc = cur.c + dc
            const key = `${nr},${nc}`
            if (seen.has(key) || !walkable(s, nr, nc)) continue
            seen.add(key)
            prev.set(key, cur)
            q.push({ r: nr, c: nc })
        }
    }
    return null
}

// --------------------------------------------------------- commands -------
export function findNearest(s, p, type) {
    let best = null, bd = 1e9
    for (const it of s.items) {
        if (it.id !== type) continue
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const d = Math.min(...tg.map((t) => Math.abs(t.r - p.r) + Math.abs(t.c - p.c)))
        if (d < bd) { bd = d; best = { it, tg } }
    }
    return best
}

export function cmdUse(s, p, it) {
    const tg = targetsOf(s, it)
    if (!tg.length) return false
    const path = bfsPath(s, { r: p.r, c: p.c }, tg)
    if (!path) return false
    p.path = path
    p.goal = { kind: 'use', it }
    return true
}

export function cmdWork(s, p) {
    const mail = s.items.find((it) => it.id === 'mail')
    if (!mail || p.working || p.faintT > 0) return false
    if (s.hour < WORK_START || s.hour >= WORK_END - 1 || p.workedToday || p.worksOn !== s.day % 2) return false
    return cmdUse(s, p, mail)
}

export function cmdWalk(s, p, r, c) {
    if (!walkable(s, r, c)) return false
    const path = bfsPath(s, { r: p.r, c: p.c }, [{ r, c }])
    if (!path) return false
    p.path = path
    p.goal = null
    return true
}

// the "A button" use: nearest usable object adjacent to the person
export function tryUse(s, p) {
    let best = null, bd = 3
    for (const it of s.items) {
        if (it.id === 'mail') {
            if (!p.workedToday && !p.working && s.day % 2 === p.worksOn && s.hour >= WORK_START && s.hour < WORK_END - 1
                && Math.abs(it.r - p.r) + Math.abs(it.c - p.c) <= 2) return cmdWork(s, p)
            continue
        }
        const d = DEF[it.id]
        if (!d || !d.need) continue
        const near = Math.min(...targetsOf(s, it).map((t) => Math.abs(t.r - p.r) + Math.abs(t.c - p.c)))
        if (near < bd) { bd = near; best = it }
    }
    if (best) return cmdUse(s, p, best)
    return false
}

// ---------------------------------------------------------- building ------
export function canPlace(s, def, r, c) {
    if (r < 0 || c < 0 || r + def.h - 1 >= ROWS || c >= COLS) return false
    for (let rr = r; rr < r + def.h; rr++) {
        if (groundAt(rr, c) === 'wall') return false
        if (solidAt(s, rr, c)) return false
    }
    if (def.decor && groundAt(r, c) === 'wall') return false
    return true
}

// a solid piece may never wall in a person, the gate, or any solid item's use
function keepsOpen(s, r, c) {
    const test = (rr, cc) => (rr === r && cc === c) || solidAt(s, rr, cc)
    if (test(8, 5)) return false
    const seen = new Set(['8,5'])
    const q = [[8, 5]]
    while (q.length) {
        const [a, b] = q.shift()
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = a + dr, nc = b + dc, k = `${nr},${nc}`
            if (seen.has(k) || nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue
            if (test(nr, nc)) continue
            seen.add(k)
            q.push([nr, nc])
        }
    }
    if (!seen.has('12,5')) return false
    for (const p of s.people) if (!seen.has(`${p.r},${p.c}`)) return false
    for (const it of s.items) {
        const d = DEF[it.id]
        if (!d || d.decor || !d.solid) continue
        if (!targetsOf(s, it).some((t) => seen.has(`${t.r},${t.c}`))) return false
    }
    return true
}

export function place(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def || s.money < def.price || !canPlace(s, def, r, c)) return false
    if (def.solid && !keepsOpen(s, r, c)) return false
    s.money -= def.price
    s.items.push({ uid: s.nextUid++, id: def.id, r, c })
    s.events.push({ t: 'place', r, c, id: def.id })
    reflow(s)
    return true
}

export function placeOk(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def || s.money < def.price || !canPlace(s, def, r, c)) return false
    if (def.solid && !keepsOpen(s, r, c)) return false
    return true
}

export function sellAt(s, r, c) {
    const it = cellItem(s, r, c)
    if (!it || it.id === 'mail') return false
    const def = DEF[it.id]
    s.items = s.items.filter((x) => x !== it)
    s.money += Math.floor(def.price / 2)
    s.events.push({ t: 'sell', r: it.r, c: it.c, id: it.id })
    reflow(s)
    return true
}

// if a person is standing on a just-placed solid, nudge them to a free neighbour
function reflow(s) {
    for (const p of s.people) {
        if (solidAt(s, p.r, p.c)) {
            for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]]) {
                if (walkable(s, p.r + dr, p.c + dc)) { p.r += dr; p.c += dc; p.path = null; p.goal = null; return }
            }
        }
    }
}

// -------------------------------------------------------- autonomy --------
function needTarget(s, p, need) {
    let best = null, bd = 1e9
    for (const it of s.items) {
        const d = DEF[it.id]
        if (!d || d.need !== need) continue
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const dist = bfsPath(s, { r: p.r, c: p.c }, tg)
        if (!dist) continue
        if (dist.length < bd) { bd = dist.length; best = { it, path: dist } }
    }
    return best
}

function autonomous(s, p) {
    if (p.faintT > 0 || p.use || p.path || p.goal) return
    if (s.demo && !p.workedToday && !p.working && s.day % 2 === p.worksOn && s.hour >= WORK_START && s.hour < WORK_END - 1) {
        if (cmdWork(s, p)) return
    }
    let worst = null, wv = 1e9
    for (const n of NEEDS) if (p.needs[n] < wv) { wv = p.needs[n]; worst = n }
    if (s.demo && worst && p.needs[worst] < 0.55) {
        const t = needTarget(s, p, worst)
        if (t) { p.path = t.path; p.goal = { kind: 'use', it: t.it }; return }
        if (worst === 'social' && hasVisitor(s)) {
            const v = s.visitor
            const cell = nearestFreeTo(s, v.r, v.c)
            if (cell) { const path = bfsPath(s, { r: p.r, c: p.c }, [cell]); if (path) { p.path = path; p.goal = { kind: 'chat' }; return } }
        }
    }
    // idle wander (seeded)
    if (s.rng() < 0.006) {
        const opts = []
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (walkable(s, p.r + dr, p.c + dc)) opts.push({ r: p.r + dr, c: p.c + dc })
        if (opts.length) {
            const t = opts[Math.floor(s.rng() * opts.length)]
            const path = bfsPath(s, { r: p.r, c: p.c }, [t])
            if (path) p.path = path
        }
    }
}

function hasVisitor(s) { return !!s.visitor && s.visitor.state !== 'leaving' }
function nearestFreeTo(s, r, c) {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (walkable(s, r + dr, c + dc)) return { r: r + dr, c: c + dc }
    return null
}

// ----------------------------------------------------------- visitor ------
function updateVisitor(s, dt) {
    const v = s.visitor
    if (!v) {
        if (s.hour >= s.visitAfter + s.visitGap && s.hour < 19) {
            const room = s.items.find((it) => it.id === 'sofa')
            const dest = room ? targetsOf(s, room)[0] : { r: 3, c: 4 }
            const path = dest && walkable(s, 12, 5) ? bfsPath(s, { r: 12, c: 5 }, [dest]) : null
            if (path) {
                s.visitor = {
                    name: 'Fern', r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
                    path, state: 'enter', t: 0, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0,
                    hangUntil: 45 + s.rng() * 45,
                }
                s.events.push({ t: 'visit', name: 'Fern' })
                think(s, 'A neighbour rings the bell. Fern drifts in through the gate.')
            }
        }
        return
    }
    v.t += dt
    walkAlong(s, v, dt, 44)
    if (v.path && !v.path.length) v.path = null
    if (v.state === 'enter' && !v.path) { v.state = 'hang'; v.t = 0 }
    if (v.state === 'hang') {
        // chat with any resident standing close
        let partner = null
        for (const p of s.people) if (p.faintT <= 0 && !p.working && Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= 2) partner = p
        if (partner) {
            partner.chatT += dt
            v.chatT += dt
            partner.needs.social = Math.min(1, partner.needs.social + 0.06 * dt)
            if (partner.chatT > 2.4 && partner.chatT - 0.06 * dt <= 2.4) think(s, chatLine(s, partner))
        }
        if (s.hour > 19 || v.t > v.hangUntil) { v.state = 'leaving'; v.path = bfsPath(s, { r: v.r, c: v.c }, [{ r: 12, c: 5 }]) }
    } else if (v.state === 'leaving' && !v.path) {
        s.visitor = null
        s.events.push({ t: 'visit-end' })
        scheduleVisit(s)
        return
    }
    // if furniture changed around them, re-home toward the living room
    if (v.state === 'hang' && !v.path && !partnerNear(s, v) && !v.repathT) {
        v.repathT = 3
    }
    if (v.repathT) {
        v.repathT -= dt
        if (v.repathT <= 0 && !v.path) {
            const sofa = s.items.find((it) => it.id === 'sofa')
            const dest = sofa ? targetsOf(s, sofa)[0] : { r: 3, c: 4 }
            if (dest) v.path = bfsPath(s, { r: v.r, c: v.c }, [dest])
        }
    }
}
function partnerNear(s, v) {
    for (const p of s.people) if (Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= 3) return true
    return false
}

// ----------------------------------------------------------- walking ------
function walkAlong(s, p, dt, spd) {
    if (!p.path || !p.path.length) return
    let step = spd * dt
    while (step > 0 && p.path.length) {
        const t = p.path[0]
        const tx = tileX(t.c) + TILE / 2, ty = tileY(t.r) + TILE / 2
        const dx = tx - p.x, dy = ty - p.y
        const d = Math.hypot(dx, dy)
        p.face = dx >= 0 ? 1 : -1
        if (d <= step) {
            p.x = tx; p.y = ty; p.r = t.r; p.c = t.c
            p.path.shift()
            step -= d
        } else {
            p.x += (dx / d) * step; p.y += (dy / d) * step
            step = 0
        }
        p.walkPhase += dt * 9
    }
}

const moodMul = (p) => (p.needs.energy < 0.2 ? 0.6 : p.needs.hunger < 0.2 ? 0.75 : p.mood > 0.7 ? 1.12 : 1)

// --------------------------------------------------------- interactions ----
function finishUse(s, p) {
    const { def } = p.use
    const before = p.needs[def.need]
    p.needs[def.need] = Math.min(1, p.needs[def.need] + def.amt)
    p.use = null
    const quality = avg(p) > 0.55
    let n = quality ? 2 : 1
    if (def.social && hasVisitor(s)) { p.needs.social = Math.min(1, p.needs.social + 0.25); n += 1 }
    s.content = Math.min(WIN_CONTENT, s.content + n)
    s.events.push({ t: 'content', n, id: def.id })
    s.events.push({ t: 'satisfied', need: def.need, name: p.name })
    think(s, doneLine(s, p, def, before))
}

// -------------------------------------------------------------- work ------
function startWork(s, p) {
    p.working = true
    p.workedToday = true
    s.fastT = Math.max(s.fastT, 6)
    s.events.push({ t: 'work-go', name: p.name })
    s.fastT = 1.5
    think(s, `${p.name} heads off to work — the day pays the bills.`)
}
function endWork(s, p) {
    p.working = false
    const pay = 60 + s.rank * 40
    s.money += pay
    s.workDays++
    s.rank = Math.min(3, 1 + Math.floor(s.workDays / 2))
    s.content = Math.min(WIN_CONTENT, s.content + 3)
    s.events.push({ t: 'pay', pay, rank: s.rank })
    think(s, pick(s, [
        `${p.name} clocks out with §${pay} jingling in their pocket.`,
        `A decent day at work — §${pay} richer, a little prouder.`,
    ]))
    const mail = s.items.find((it) => it.id === 'mail')
    if (mail) { const t = targetsOf(s, mail)[0]; if (t) { p.r = t.r; p.c = t.c; p.x = tileX(t.c) + TILE / 2; p.y = tileY(t.r) + TILE / 2; p.path = null } }
}

// ------------------------------------------------------------ thoughts ----
function think(s, line) {
    s.thoughts.unshift({ text: line, t: 7 })
    if (s.thoughts.length > 4) s.thoughts.length = 4
}
function pick(s, opts) { return Array.isArray(opts) ? opts[Math.floor(s.rng() * opts.length)] : opts }
function chatLine(s, p) {
    return pick(s, [
        `${p.name} and Fern swap stories about the weather.`,
        `Fern brings over a casserole nobody asked for.`,
        `${p.name} laughs at Fern's terrible jokes.`,
        `They argue, gently, about garden gnomes.`,
    ])
}
function doneLine(s, p, def, before) {
    if (def.id === 'bed') return pick(s, [`${p.name} sleeps like a log.`, `${p.name} dreamed about flying.`])
    if (def.id === 'mail') return ''
    if (def.id === 'phone') return `${p.name} chats for ages on the phone.`
    if (def.id === 'toilet') return `${p.name} feels enormously relieved.`
    if (before < 0.25) return pick(s, [`${p.name} needed that.`, `${p.name} sighs with relief.`])
    return pick(s, [`${p.name} hums a little tune.`, `${p.name} feels quite accomplished.`, `${p.name} enjoys a small pleasure.`])
}
function idleThought(s, p) {
    if (p.needs.hunger < 0.3) return pick(s, [`${p.name} is dreaming about cheese.`, `${p.name}'s stomach rumbles loudly.`])
    if (p.needs.energy < 0.3) return `${p.name} can barely keep their eyes open.`
    if (p.needs.fun < 0.3) return `${p.name} wishes there was more to do out here.`
    if (p.needs.social < 0.3) return `${p.name} waves at no one in particular.`
    if (p.needs.bladder < 0.25) return `${p.name} does a little dance. Not that kind.`
    if (avg(p) > 0.85) return pick(s, [`${p.name} is feeling wonderful.`, `${p.name} twirls once for joy.`])
    return pick(s, [`${p.name} watches a cloud shaped like a hat.`, `${p.name} hums a tune nobody knows.`, `${p.name} wonders what's for dinner.`])
}

export const avg = (p) => NEEDS.reduce((a, n) => a + p.needs[n], 0) / NEEDS.length
export const isNight = (s) => s.hour >= 22 || s.hour < 6
export const moodOf = (p) => { const a = avg(p); return p.faintT > 0 ? 0 : a > 0.7 ? 2 : a > 0.4 ? 1 : 0 }

// -------------------------------------------------------------- clock -----
function applyHourAt(s, hh) {
    const night = hh >= 22 || hh < 6
    for (const p of s.people) {
        if (p.working) continue
        const sleeping = !!(p.use && p.use.def.id === 'bed')
        for (const n of NEEDS) {
            if (sleeping) {
                if (n === 'energy') p.needs.energy = Math.min(1, p.needs.energy + 0.13)
                continue
            }
            let d = DECAY[n]
            if (night) d *= 0.5
            if (n === 'energy' && night) d = NIGHT_ENERGY
            p.needs[n] = Math.max(0, p.needs[n] - d)
        }
    }
    if (!night) {
        const allHappy = s.people.every((p) => !p.working && avg(p) > 0.65)
        if (allHappy && ambienceOf(s) > 0.45) {
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            s.happyHours++
            s.events.push({ t: 'content', n: 2, id: 'home' })
            think(s, pick(s, ['A happy hour passes over the little house.', 'The household hums along contentedly.']))
        }
    }
}
function newDay(s) {
    for (const p of s.people) p.workedToday = false
    s.day++
    s.events.push({ t: 'day', day: s.day })
}

export function ambienceOf(s) {
    let d = 0
    for (const it of s.items) if (DECOR.includes(it.id)) d++
    return Math.min(1, d * 0.12)
}

// ------------------------------------------------------------- tick -------
export function advance(s, dt) {
    if (s.done) return
    s.tick++
    s.sec += dt
    if (s.build) return     // time stands still in buy mode
    if (s.fastT > 0) s.fastT = Math.max(0, s.fastT - dt)
    const anyWork = s.people.some((p) => p.working)
    const simDt = dt * (anyWork ? 8 : 1)
    const dh = simDt / HOUR_SEC
    const b0 = Math.floor(s.hour)
    s.hour += dh
    let b = b0 + 1
    while (b <= Math.floor(s.hour)) {
        if (b >= 24) { s.hour -= 24; newDay(s) }
        applyHourAt(s, b % 24)
        b++
    }

    updateVisitor(s, simDt)

    for (const p of s.people) {
        p.mood = avg(p)
        if (p.alarmT > 0) p.alarmT = Math.max(0, p.alarmT - simDt)
        if (p.working) {
            if (s.hour >= WORK_END - 1e-9) endWork(s, p)
            continue
        }
        if (p.faintT > 0) {
            p.faintT = Math.max(0, p.faintT - simDt)
            if (p.faintT === 0) {
                for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.32)
                p.redT = {}
                s.events.push({ t: 'wake', name: p.name })
                think(s, `${p.name} comes to on the floor. Embarrassing, but survivable.`)
            }
            continue
        }
        // emergencies: only PHYSICAL needs unattended collapse into a faint
        // (sad and bored is life, not death — like the original)
        const asleep = !!(p.use && p.use.def.id === 'bed')
        // any need crossing into red raises a one-shot alarm pulse on the mood gem
        // (advisory only — collapse is still governed by PHYS redT below)
        if (asleep) { for (const n of NEEDS) p.wasRed[n] = false }
        else {
            for (const n of NEEDS) {
                if (p.needs[n] <= RED_AT && !p.wasRed[n]) {
                    p.wasRed[n] = true
                    p.alarmT = 1.3
                    s.events.push({ t: 'redcross', need: n, name: p.name })
                } else if (p.needs[n] > RED_AT + 0.03) p.wasRed[n] = false
            }
        }
        for (const n of PHYS) {
            if (asleep) { p.redT[n] = 0; continue }
            if (p.needs[n] <= 0.02) {
                p.redT[n] = (p.redT[n] || 0) + simDt
                if (p.redT[n] > COLLAPSE_AT) {
                    p.faintT = FAINT_SEC
                    p.path = null; p.goal = null; p.use = null
                    s.events.push({ t: 'faint', name: p.name, x: p.x, y: p.y })
                    think(s, `${p.name} collapses! Someone, help!`)
                }
            } else p.redT[n] = 0
        }
        if (p.faintT > 0) continue

        // executing an interaction
        if (p.use) {
            p.use.t += simDt
            if (p.use.def.id === 'bed') p.needs.energy = Math.min(1, p.needs.energy + 0.03 * simDt)
            const done = p.use.def.id === 'bed' ? (p.use.night ? (s.hour >= 6 && s.hour < 22) : p.use.t >= p.use.dur) : p.use.t >= p.use.dur
            if (done) finishUse(s, p)
            continue
        }
        // walking toward a goal
        if (p.path && p.path.length) { walkAlong(s, p, simDt, 55 * moodMul(p)); continue }
        p.path = null
        if (p.goal && p.goal.kind === 'use') {
            const it = p.goal.it
            p.goal = null
            const d = DEF[it.id]
            if (it.id === 'mail') { startWork(s, p); continue }
            if (d && d.need) p.use = { it, def: d, t: 0, dur: d.dur, night: isNight(s) }
            continue
        }
        if (p.goal && p.goal.kind === 'chat') {
            p.goal = null
            if (hasVisitor(s)) {
                p.needs.social = Math.min(1, p.needs.social + 0.3)
                s.content = Math.min(WIN_CONTENT, s.content + 1)
                s.events.push({ t: 'content', n: 1, id: 'chat' })
                think(s, chatLine(s, p))
            }
            continue
        }
        autonomous(s, p)
        // idle flavour
        s.thoughtT += simDt
        if (s.thoughtT > 9) { s.thoughtT = 0; think(s, idleThought(s, p)) }
    }

    if (s.thoughts.length) for (const t of s.thoughts) t.t -= dt
    s.thoughts = s.thoughts.filter((t) => t.t > 0)

    if (s.people.every((p) => p.faintT > 0)) {
        s.done = 'lose'
        s.endMsg = 'Both residents collapsed — the household falls into chaos.'
    }
    if (s.content >= WIN_CONTENT) {
        s.done = 'win'
        s.endMsg = 'The lifetime wish comes true: a happy, humming little home.'
    }
}

// ---------------------------------------------------------- manual move ----
// direct d-pad/stick control of one resident (pointer routes use cmdWalk).
// Continuous pixels with tile permission — everything that moves asks first.
export function manualMove(s, p, dx, dy, dt) {
    if (p.faintT > 0 || p.working || p.use) return false
    if (!dx && !dy) return false
    p.path = null; p.goal = null
    const spd = 52 * moodMul(p) * dt
    if (dx) p.face = dx > 0 ? 1 : -1
    const nx = p.x + (dx ? Math.sign(dx) * spd : 0)
    const ny = p.y + (dy ? Math.sign(dy) * spd : 0)
    const tileAt = (px, py) => ({ r: Math.floor((py - LOT_Y) / TILE), c: Math.floor((px - LOT_X) / TILE) })
    if (dx) {
        const t = tileAt(nx + Math.sign(dx) * 6, p.y)
        if (walkable(s, t.r, t.c)) p.x = nx
    }
    if (dy) {
        const t = tileAt(p.x, ny + Math.sign(dy) * 6)
        if (walkable(s, t.r, t.c)) p.y = ny
    }
    const c = tileAt(p.x, p.y)
    p.r = c.r; p.c = c.c
    p.walkPhase += dt * 11
    return true
}

// ------------------------------------------------------------- bot --------
// attract autopilot + harness brain: buys like a player; the residents' own
// autonomy (needs, work, chatting) does the rest.
const KEEP_CELLS = new Set(['8,5', '5,2', '5,8', '12,5'])   // doors and the gate

export function bot(s) {
    if (s.done) return
    const p = s.people[0]
    if (p.working || p.faintT > 0 || p.path || p.use) return
    if (s.money > 300 && s.content < WIN_CONTENT) {
        const wants = ['phone', 'stove', 'tv', 'sofa', 'radio', 'book', 'shower', 'plant', 'lamp', 'rug']
        for (const id of wants) {
            const def = DEF[id]
            if (s.items.some((it) => it.id === id) || s.money < def.price) continue
            for (let r = 1; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (KEEP_CELLS.has(`${r},${c}`)) continue
                    const g = groundAt(r, c)
                    if (g === 'wall' || g === 'path') continue
                    if (def.solid && g !== 'floor') continue
                    if (!canPlace(s, def, r, c)) continue
                    const keep = s.sel
                    s.sel = CATALOG.findIndex((d) => d.id === id)
                    place(s, r, c)
                    s.sel = keep
                    return
                }
            }
        }
    }
}

export function autoStep(s, dt) {
    s.demo = true
    bot(s)
    advance(s, dt)
}

// ------------------------------------------------------------- hash -------
export function stateHash(s) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619) }
    mix(s.tick); mix(s.day); mix(s.hour); mix(s.money); mix(s.content); mix(s.rank)
    for (const p of s.people) {
        mix(p.r); mix(p.c)
        for (const n of NEEDS) mix(p.needs[n])
        mix(p.faintT); mix(p.working ? 1 : 0); mix(p.queue.length)
    }
    mix(s.items.length)
    for (const it of s.items) { mix(it.r); mix(it.c) }
    mix(s.visitor ? 1 : 0)
    return h >>> 0
}
