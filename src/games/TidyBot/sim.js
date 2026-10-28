// TIDY BOT — the pure sim. No DOM, no Math.random in the rules path: the sim
// is fully seeded and deterministic (seed + pads = identical hashes). The
// autopilot in this file scripts the attract demo AND the Node harness's
// "it can be won" proof — one brain, two jobs.
//
// A house robot with a chore list. Containers really open: the dishwasher rack
// slides out (and blocks the floor while it's out), the fridge door swings
// down; open cavities show racks holding every stowed item, and anything
// stowed can be retrieved. Order matters: a closed washer refuses cargo, an
// empty washer refuses to start, food in the dishwasher is a WRONG STOW you
// must fix. Gentle placements pay tidy points; throws jam, spill or shatter.
// Smashed dishes count as cleared, so a level can never brick — the game is
// always finishable, breakage only costs score.
//
// Contract: step(gs, pads) advances exactly one tick; pads[0] =
// { up, down, left, right, a, b }. state.hash makes drift visible.

export const FIXED_DT = 1000 / 60
export const VIEW_W = 320
export const VIEW_H = 240

export const WALL = 8
export const ROBOT_R = 6
export const ROBOT_SPEED = 1.25
export const HOME = { x: 156, y: 150 }
export const DOOR_RATE = 0.045
export const REACH = 18
export const GRAB_R = 26
export const THROW_V = 3.2
export const THROW_DEC = 0.075
export const LEVEL_TIME = [9600, 11400, 12600]

// ---- furniture (static blockers; robot AABB vs these) ----
export const COUNTER = { x: 18, y: WALL, w: 150, h: 22 }
export const STOVE = { x: 172, y: WALL, w: 32, h: 22 }
export const TABLE = { x: 198, y: 124, w: 96, h: 44 }
export const PLANTS = [
    { x: 18, y: 204, w: 12, h: 12 },
    { x: 226, y: 204, w: 12, h: 12 },
]
export const WALLS = [
    { x: 0, y: 0, w: VIEW_W, h: WALL },
    { x: 0, y: VIEW_H - WALL, w: VIEW_W, h: WALL },
    { x: 0, y: 0, w: WALL, h: VIEW_H },
    { x: VIEW_W - WALL, y: 0, w: WALL, h: VIEW_H },
]

// ---- containers: body blocks, door slides down when open, zones for work ----
export const DW = {
    id: 'dw', label: 'WASHER',
    x: 34, y: 30, w: 34, h: 26, doorLen: 26,
    zones: [
        { x: 14, y: 32, w: 18, h: 52 },
        { x: 70, y: 32, w: 18, h: 52 },
    ],
}
export const FR = {
    id: 'fr', label: 'FRIDGE',
    x: 266, y: 30, w: 38, h: 34, doorLen: 30,
    zones: [
        { x: 246, y: 32, w: 18, h: 52 },
    ],
}
export const CONTAINERS = [DW, FR]

export const KINDS = {
    plate: { to: 'dw', fragile: true, tidy: 10 },
    cup: { to: 'dw', fragile: false, tidy: 10 },
    apple: { to: 'fr', fragile: false, tidy: 8 },
    milk: { to: 'fr', fragile: false, tidy: 8 },
}

// ---- levels: each house messier than the last ----
export const LEVELS = [
    {
        name: 'KITCHEN / LIGHT DRIZZLE',
        items: [
            { kind: 'plate', x: 44, y: 20 },
            { kind: 'plate', x: 68, y: 20 },
            { kind: 'cup', x: 92, y: 20 },
            { kind: 'apple', x: 116, y: 20 },
            { kind: 'milk', x: 140, y: 20 },
            { kind: 'cup', x: 150, y: 200 },
        ],
    },
    {
        name: 'DINE-IN DISASTER',
        items: [
            { kind: 'plate', x: 212, y: 132 },
            { kind: 'plate', x: 238, y: 132 },
            { kind: 'plate', x: 264, y: 132 },
            { kind: 'cup', x: 222, y: 152 },
            { kind: 'cup', x: 248, y: 152 },
            { kind: 'apple', x: 274, y: 152 },
            { kind: 'milk', x: 92, y: 20 },
            { kind: 'apple', x: 116, y: 20 },
            { kind: 'plate', x: 140, y: 20 },
            { kind: 'cup', x: 150, y: 206 },
            { kind: 'apple', x: 252, y: 110 },
        ],
    },
    {
        name: 'FULL HOUSE FRENETIC',
        items: [
            { kind: 'plate', x: 44, y: 20 },
            { kind: 'cup', x: 66, y: 20 },
            { kind: 'milk', x: 88, y: 20 },
            { kind: 'plate', x: 212, y: 132 },
            { kind: 'cup', x: 236, y: 132 },
            { kind: 'apple', x: 260, y: 132 },
            { kind: 'milk', x: 284, y: 132 },
            { kind: 'plate', x: 224, y: 152 },
            { kind: 'cup', x: 248, y: 152 },
            { kind: 'cup', x: 170, y: 214 },
            { kind: 'plate', x: 90, y: 196 },
            { kind: 'apple', x: 0, y: 0, state: 'in', cont: 'dw' },
        ],
    },
]

const mulberry32 = (a) => {
    let s = a >>> 0
    return () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t >>> 7
        t = (t ^ (t >>> 3)) >>> 0
        return t / 4294967296
    }
}

const distToRect = (px, py, r) => {
    const dx = px < r.x ? r.x - px : px > r.x + r.w ? px - r.x - r.w : 0
    const dy = py < r.y ? r.y - py : py > r.y + r.h ? py - r.y - r.h : 0
    return Math.sqrt(dx * dx + dy * dy)
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

// mutant hooks (tidycheck --mutate only; production never sets these)
export const SIMHOOKS = { noBlock: false, freeRun: false, softStow: false }

export const blockers = (gs) => {
    const out = [...WALLS, COUNTER, STOVE, TABLE, ...PLANTS]
    for (const cc of [gs.dw, gs.fr]) {
        out.push({ x: cc.x, y: cc.y, w: cc.w, h: cc.h })
        if (cc.door > 0.55 && !SIMHOOKS.noBlock) out.push({ x: cc.x + 2, y: cc.y + cc.h, w: cc.w - 4, h: cc.doorLen })
    }
    return out
}

const canStand = (gs, cx, cy) => {
    const box = { x: cx - ROBOT_R, y: cy - ROBOT_R, w: ROBOT_R * 2, h: ROBOT_R * 2 }
    return !blockers(gs).some((r) => overlaps(box, r))
}

const overlapArea = (gs, cx, cy) => {
    const box = { x: cx - ROBOT_R, y: cy - ROBOT_R, w: ROBOT_R * 2, h: ROBOT_R * 2 }
    let a = 0
    for (const r of blockers(gs)) {
        if (!overlaps(box, r)) continue
        a += (Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x)) *
             (Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y))
    }
    return a
}

// standable OR a genuine escape: a robot caught by an opening door may step
// out (a move that shrinks its penetration), never deeper
const canStandRel = (gs, cx, cy) => {
    if (canStand(gs, cx, cy)) return true
    const cur = overlapArea(gs, gs.rx, gs.ry)
    return cur > 0 && overlapArea(gs, cx, cy) < cur
}

const inZone = (c, x, y) => c.zones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)
const nearBody = (c, x, y) => distToRect(x, y, { x: c.x, y: c.y, w: c.w, h: c.h }) <= REACH
const isOpen = (c) => c.door >= 0.9
const isShut = (c) => c.door <= 0.01

export const heldItem = (gs) => gs.items.find((it) => it.state === 'held') || null
const looseItems = (gs) => gs.items.filter((it) => it.state === 'loose')
const wrongInside = (gs) => gs.items.filter((it) => it.state === 'in' && KINDS[it.kind].to !== it.cont)
export const dwLoaded = (gs) => gs.items.filter((it) => it.state === 'in' && it.cont === 'dw').length

export function makeGame(seed, players = 1) {
    void players
    const gs = {
        seed: seed >>> 0,
        players: 1,
        tick: 0,
        score: 0,
        level: 0,
        clock: LEVEL_TIME[0],
        rx: HOME.x, ry: HOME.y, facing: 'down', walk: 0,
        held: null,
        items: [],
        dw: { ...DW, door: 0, target: 0, cd: 0 },
        fr: { ...FR, door: 0, target: 0, cd: 0 },
        dwRun: false,
        opened: { dw: false, fr: false },
        breaks: 0, wrongs: 0, spills: 0, jams: 0, tidies: 0,
        chores: [],
        ev: [],
        fx: [],
        end: null,
        endReason: '',
        levelsDone: 0,
        timeBonusTotal: 0,
        auto: { cd: 0 },
        rnd: mulberry32((seed >>> 0) ^ 0x5eed),
        hash: 0,
    }
    loadLevel(gs, 0)
    gs.hash = stateHash(gs)
    return gs
}

export function loadLevel(gs, level) {
    gs.level = level
    gs.clock = LEVEL_TIME[Math.min(level, LEVEL_TIME.length - 1)]
    gs.items = []
    let id = 1
    for (const spec of LEVELS[level].items) {
        gs.items.push({
            id: id++, kind: spec.kind,
            x: spec.x, y: spec.y, vx: 0, vy: 0,
            state: spec.state || 'loose',
            cont: spec.cont || null,
        })
    }
    gs.dw.door = 0; gs.dw.target = 0; gs.dw.cd = 0
    gs.fr.door = 0; gs.fr.target = 0; gs.fr.cd = 0
    gs.dwRun = false
    gs.opened = { dw: false, fr: false }
    gs.held = null
    gs.rx = HOME.x; gs.ry = HOME.y; gs.facing = 'down'
    gs.auto = { cd: 0 }
    gs.chores = computeChores(gs)
}

export function computeChores(gs) {
    const L = LEVELS[gs.level]
    const chores = []
    if (L.items.some((i) => i.x >= TABLE.x - 4 && i.x <= TABLE.x + TABLE.w + 4 && i.y >= TABLE.y - 4 && i.y <= TABLE.y + TABLE.h + 4))
        chores.push({ label: 'CLEAR TABLE', done: false })
    if (gs.items.some((i) => KINDS[i.kind].to === 'dw')) chores.push({ label: 'LOAD WASH', done: false })
    if (gs.items.some((i) => KINDS[i.kind].to === 'dw')) chores.push({ label: 'CLOSE & RUN', done: false })
    if (gs.items.some((i) => KINDS[i.kind].to === 'fr')) chores.push({ label: 'CHILL FOOD', done: false })
    chores.push({ label: 'CLOSE ALL', done: false })
    return chores
}

export const markChores = (gs) => {
    const onTable = looseItems(gs).filter((it) => it.x >= TABLE.x - 4 && it.x <= TABLE.x + TABLE.w + 4 && it.y >= TABLE.y - 4 && it.y <= TABLE.y + TABLE.h + 4)
    const dwAll = gs.items.filter((i) => KINDS[i.kind].to === 'dw').every((i) => (i.state === 'in' && i.cont === 'dw') || i.state === 'gone')
    const frAll = gs.items.filter((i) => KINDS[i.kind].to === 'fr').every((i) => (i.state === 'in' && i.cont === 'fr') || i.state === 'gone')
    const hasDw = gs.items.some((i) => KINDS[i.kind].to === 'dw')
    for (const c of gs.chores) {
        if (c.label === 'CLEAR TABLE') c.done = onTable.length === 0
        if (c.label === 'LOAD WASH') c.done = dwAll
        if (c.label === 'CLOSE & RUN') c.done = gs.dwRun
        if (c.label === 'CHILL FOOD') c.done = frAll
        if (c.label === 'CLOSE ALL') c.done = isShut(gs.dw) && isShut(gs.fr) &&
            (!gs.items.some((i) => KINDS[i.kind].to === 'dw') || gs.opened.dw) &&
            (!gs.items.some((i) => KINDS[i.kind].to === 'fr') || gs.opened.fr)
    }
    return { onTable: onTable.length, dwAll, frAll, hasDw }
}

const say = (gs, msg, x, y, t = 'ok') => { gs.fx.push({ msg, x, y, k: 0, t }) }

const placeInto = (gs, c, it, gentle) => {
    it.state = 'in'
    it.cont = c.id
    it.vx = 0; it.vy = 0
    const correct = KINDS[it.kind].to === c.id
    if (correct && gentle) {
        gs.score += KINDS[it.kind].tidy
        gs.tidies++
        say(gs, `TIDY +${KINDS[it.kind].tidy}`, it.x, it.y, 'ok')
        gs.ev.push({ type: 'place', kind: it.kind, x: c.x + c.w / 2, y: c.y + c.h / 2 })
    } else if (correct) {
        gs.score += 6
        gs.jams++
        say(gs, 'JAM +6', it.x, it.y, 'jam')
        gs.ev.push({ type: 'jam', kind: it.kind, x: c.x + c.w / 2, y: c.y + c.h / 2 })
    } else {
        if (!SIMHOOKS.softStow) {
            gs.score -= 20
            gs.wrongs++
        }
        say(gs, 'WRONG STOW −20', c.x + c.w / 2, c.y - 4, 'bad')
        gs.ev.push({ type: 'wrong', kind: it.kind, x: c.x + c.w / 2, y: c.y + c.h / 2 })
    }
}

const doorRect = (c) => ({ x: c.x + 2, y: c.y + c.h, w: c.w - 4, h: c.doorLen })

const toggleDoor = (gs, c, open) => {
    if (c.cd > 0) return
    if (open && c.door >= 0.9) return
    if (!open && c.door <= 0.01) return
    if (c.door > 0.01 && c.door < 0.99) return // mid-swing ignores presses
    if (open && !SIMHOOKS.noBlock) {
        const box = { x: gs.rx - ROBOT_R, y: gs.ry - ROBOT_R, w: ROBOT_R * 2, h: ROBOT_R * 2 }
        if (overlaps(box, doorRect(c))) {
            say(gs, 'STAND CLEAR', c.x + c.w / 2, c.y - 4, 'bad')
            gs.ev.push({ type: 'clear', c: c.id, x: c.x + c.w / 2, y: c.y + c.h })
            return
        }
    }
    c.target = open ? 1 : 0
    c.cd = 14
    if (open) gs.opened[c.id] = true
    gs.ev.push({ type: open ? 'open' : 'close', c: c.id, x: c.x + c.w / 2, y: c.y + c.h })
}

const stowTargets = (gs, c) => gs.items.filter((it) => it.state === 'in' && it.cont === c.id)

export function step(gs, pads) {
    gs.ev.length = 0
    gs.fx.forEach((f) => f.k++)
    for (let i = gs.fx.length - 1; i >= 0; i--) if (gs.fx[i].k > 50) gs.fx.splice(i, 1)
    if (gs.end) { gs.hash = stateHash(gs); return }
    const pad = (pads && pads[0]) || {}
    gs.tick++
    gs.clock--
    for (const c of CONTAINERS) {
        const cc = c.id === 'dw' ? gs.dw : gs.fr
        if (cc.cd > 0) cc.cd--
        if (cc.door < cc.target) cc.door = Math.min(cc.target, cc.door + DOOR_RATE)
        else if (cc.door > cc.target) cc.door = Math.max(cc.target, cc.door - DOOR_RATE)
    }

    // ---- movement ----
    let vx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0)
    let vy = (pad.down ? 1 : 0) - (pad.up ? 1 : 0)
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071 }
    if (vx || vy) {
        const nx = gs.rx + vx * ROBOT_SPEED
        const ny = gs.ry + vy * ROBOT_SPEED
        if (canStandRel(gs, nx, gs.ry)) gs.rx = nx
        if (canStandRel(gs, gs.rx, ny)) gs.ry = ny
        gs.facing = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up')
        gs.walk++
    }

    // ---- flying cargo ----
    for (const it of gs.items) {
        if (it.state !== 'fly') continue
        it.x += it.vx; it.y += it.vy
        it.vx *= (1 - THROW_DEC); it.vy *= (1 - THROW_DEC)
        const sp = Math.hypot(it.vx, it.vy)
        const spdx = gs.facing === 'left' ? -1 : gs.facing === 'right' ? 1 : 0
        void spdx
        let landedIn = null
        for (const c of CONTAINERS) {
            const cc = c.id === 'dw' ? gs.dw : gs.fr
            if (isOpen(cc) && it.x >= c.x && it.x <= c.x + c.w && it.y >= c.y && it.y <= c.y + c.h) { landedIn = cc; break }
        }
        if (landedIn) { placeInto(gs, landedIn, it, false); continue }
        if (sp < 0.5) {
            it.vx = 0; it.vy = 0
            if (KINDS[it.kind].fragile) {
                it.state = 'gone'
                gs.breaks++
                gs.score -= 40
                say(gs, 'SMASHED −40', it.x, it.y, 'bad')
                gs.ev.push({ type: 'break', kind: it.kind, x: it.x, y: it.y })
            } else {
                it.state = 'loose'
                gs.spills++
                gs.score -= 5
                say(gs, 'SPILL −5', it.x, it.y, 'bad')
                gs.ev.push({ type: 'spill', kind: it.kind, x: it.x, y: it.y })
            }
        }
    }

    // ---- actions ----
    // A: the move verb — grab litter, place into a zoned open mouth, open a
    // shut door, close an open one. B: the wrist verb — throw held cargo,
    // retrieve from an open container, or START a shut loaded washer.
    const allC = [gs.dw, gs.fr]
    if (pad.a) {
        const held = heldItem(gs)
        if (held) {
            const openC = allC.find((c) => isOpen(c) && inZone(c, gs.rx, gs.ry))
            if (openC) { placeInto(gs, openC, held, true); gs.held = null }
            else {
                const shutC = allC.find((c) => isShut(c) && nearBody(c, gs.rx, gs.ry))
                if (shutC) toggleDoor(gs, shutC, true)
                else softBuzz(gs)
            }
        } else {
            const it = looseItems(gs).filter((i2) => Math.hypot(i2.x - gs.rx, i2.y - gs.ry) <= GRAB_R)
                .sort((a, b) => Math.hypot(a.x - gs.rx, a.y - gs.ry) - Math.hypot(b.x - gs.rx, b.y - gs.ry))[0]
            const shutC = allC.find((c) => isShut(c) && nearBody(c, gs.rx, gs.ry))
            const openNear = allC.find((c) => isOpen(c) && nearBody(c, gs.rx, gs.ry))
            if (it) {
                it.state = 'held'
                gs.held = it.id
                gs.ev.push({ type: 'grab', kind: it.kind, x: it.x, y: it.y })
            } else if (shutC) toggleDoor(gs, shutC, true)
            else if (openNear) toggleDoor(gs, openNear, false)
            else softBuzz(gs)
        }
    }
    if (pad.b) {
        const held = heldItem(gs)
        if (held) {
            const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[gs.facing]
            held.state = 'fly'
            held.x = gs.rx + d[0] * 8
            held.y = gs.ry + d[1] * 8
            held.vx = d[0] * THROW_V
            held.vy = d[1] * THROW_V
            gs.held = null
            gs.ev.push({ type: 'throw', kind: held.kind, x: held.x, y: held.y })
        } else {
            const openC = allC.find((c) => isOpen(c) && nearBody(c, gs.rx, gs.ry))
            if (openC && stowTargets(gs, openC).length) {
                const pool = stowTargets(gs, openC)
                const it = pool.find((i2) => KINDS[i2.kind].to !== openC.id) || pool[pool.length - 1]
                it.state = 'held'
                gs.held = it.id
                gs.ev.push({ type: 'retrieve', kind: it.kind, x: gs.rx, y: gs.ry })
            } else if (gs.dwRun) softBuzz(gs)
            else if (nearBody(gs.dw, gs.rx, gs.ry)) {
                if (dwLoaded(gs) > 0 || SIMHOOKS.freeRun) {
                    gs.dwRun = true
                    gs.score += 40
                    say(gs, 'CYCLE ON +40', gs.dw.x + gs.dw.w / 2, gs.dw.y - 4, 'ok')
                    gs.ev.push({ type: 'start', x: gs.dw.x + gs.dw.w / 2, y: gs.dw.y + gs.dw.h })
                } else {
                    say(gs, 'WASHER EMPTY', gs.dw.x + gs.dw.w / 2, gs.dw.y - 4, 'bad')
                    gs.ev.push({ type: 'refuse', x: gs.dw.x, y: gs.dw.y })
                }
            } else softBuzz(gs)
        }
    }

    // ---- verdicts ----
    const flags = markChores(gs)
    const loose = looseItems(gs).length + gs.items.filter((i) => i.state === 'fly').length
    const finishable = loose === 0 && !gs.held && wrongInside(gs).length === 0 &&
        isShut(gs.dw) && isShut(gs.fr) && (!flags.hasDw || gs.dwRun)
    if (finishable) {
        const bonus = Math.max(0, Math.ceil(gs.clock / 6))
        gs.timeBonusTotal += bonus
        gs.score += 200 + bonus
        gs.levelsDone++
        gs.ev.push({ type: 'level', level: gs.level, bonus })
        if (gs.level >= LEVELS.length - 1) {
            const tidyRoll = gs.tidies + gs.jams + gs.wrongs + gs.spills + gs.breaks
            const tidyPct = tidyRoll ? Math.round((gs.tidies / tidyRoll) * 100) : 100
            gs.score += Math.round((tidyPct / 100) * 300)
            gs.end = 'win'
            gs.endReason = `ALL CHORES DONE — ${tidyPct}% TIDY`
            gs.ev.push({ type: 'win' })
        } else {
            loadLevel(gs, gs.level + 1)
            gs.ev.push({ type: 'levelgo', level: gs.level })
        }
    } else if (gs.clock <= 0) {
        gs.end = 'fail'
        gs.endReason = 'OUT OF TIME — THE HOUSE WINS'
        gs.ev.push({ type: 'over' })
    }

    gs.hash = stateHash(gs)
    return gs.ev
}

const softBuzz = (gs) => gs.ev.push({ type: 'noop' })

export function stateHash(gs) {
    const p = []
    p.push(gs.seed >>> 0, gs.tick, gs.level, gs.clock, gs.score,
        Math.round(gs.rx * 8), Math.round(gs.ry * 8), gs.facing,
        Math.round(gs.dw.door * 100), Math.round(gs.fr.door * 100),
        gs.dwRun ? 1 : 0, gs.held === null ? -1 : gs.held,
        gs.breaks, gs.wrongs, gs.spills, gs.jams, gs.tidies)
    for (const it of gs.items) p.push(it.id, it.state, Math.round(it.x * 8), Math.round(it.y * 8), it.cont || '-', it.state === 'fly' ? Math.round(it.vx * 100) : 0)
    for (const c of gs.chores) p.push(c.label, c.done ? 1 : 0)
    const str = p.join('|')
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}

// ---- autopilot: plans chores in the right order. Attract demo + proof ----
const zoneCenter = (c, gs) => {
    let best = null, bd = Infinity
    for (const z of c.zones) {
        const zx = z.x + z.w / 2, zy = z.y + z.h / 2
        if (!canStand(gs, zx, zy)) continue
        const d = Math.hypot(zx - gs.rx, zy - gs.ry)
        if (d < bd) { bd = d; best = { x: zx, y: zy } }
    }
    return best || { x: c.zones[0].x + c.zones[0].w / 2, y: c.zones[0].y + c.zones[0].h / 2 }
}

const bodyApproach = (c, gs) => {
    const cands = [
        { x: c.x + c.w + 12, y: c.y + c.h / 2 },
        { x: c.x - 12, y: c.y + c.h / 2 },
        { x: Math.max(c.x + 5, Math.min(c.x + c.w - 5, gs.rx)), y: c.y + c.h + 14 },
    ]
    const dr = doorRect(c)
    for (const o of cands) {
        if (!canStand(gs, o.x, o.y)) continue
        const box = { x: o.x - ROBOT_R, y: o.y - ROBOT_R, w: ROBOT_R * 2, h: ROBOT_R * 2 }
        if (overlaps(box, dr)) continue // the door would refuse to open on us
        if (distToRect(o.x, o.y, { x: c.x, y: c.y, w: c.w, h: c.h }) <= REACH) return o
    }
    return cands[0]
}

const nearPoint = (x, y) => ({ x, y })

// ---- BFS steering on an 8px grid (cached walkability per door state) ----
const CELL = 8
const CW = Math.ceil(VIEW_W / CELL)
const CH = Math.ceil(VIEW_H / CELL)
let wBit = null
let wKey = ''
const walkBit = (gs) => {
    const key = `${gs.level}${gs.dw.door > 0.55 ? 1 : 0}${gs.fr.door > 0.55 ? 1 : 0}`
    if (wKey === key && wBit) return wBit
    wBit = new Uint8Array(CW * CH)
    for (let gy = 0; gy < CH; gy++) {
        for (let gx = 0; gx < CW; gx++) if (canStand(gs, gx * CELL + CELL / 2, gy * CELL + CELL / 2)) wBit[gy * CW + gx] = 1
    }
    wKey = key
    return wBit
}

const freeCell = (bit, gx, gy) => {
    gx = Math.max(0, Math.min(CW - 1, gx))
    gy = Math.max(0, Math.min(CH - 1, gy))
    if (bit[gy * CW + gx]) return [gx, gy]
    for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
                const nx = gx + dx, ny = gy + dy
                if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue
                if (bit[ny * CW + nx]) return [nx, ny]
            }
        }
    }
    return null
}

const bfsNext = (gs, tx, ty) => {
    const bit = walkBit(gs)
    const s = freeCell(bit, Math.floor(gs.rx / CELL), Math.floor(gs.ry / CELL))
    const e = freeCell(bit, Math.floor(tx / CELL), Math.floor(ty / CELL))
    if (!s || !e) return null
    const si = s[1] * CW + s[0], ei = e[1] * CW + e[0]
    if (si === ei) return null
    const prev = new Int32Array(CW * CH).fill(-2)
    const q = [si]
    prev[si] = -1
    let found = false
    for (let qh = 0; qh < q.length && !found; qh++) {
        const cur = q[qh]
        const cx = cur % CW, cy = (cur - cx) / CW
        const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]
        for (const [nx, ny] of nb) {
            if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue
            const ni = ny * CW + nx
            if (prev[ni] !== -2 || !bit[ni]) continue
            prev[ni] = cur
            if (ni === ei) { found = true; break }
            q.push(ni)
        }
    }
    if (!found) return null
    let cur = ei
    while (prev[cur] !== si && prev[cur] >= 0) cur = prev[cur]
    return { x: (cur % CW) * CELL + CELL / 2, y: ((cur - (cur % CW)) / CW) * CELL + CELL / 2 }
}

export function autopilot(gs) {
    const pad = { a: false, b: false }
    const A = gs.auto
    if (A.cd > 0) A.cd--
    const press = () => { if (A.cd <= 0) { A.cd = 14; return true } return false }
    let goal = null
    let act = null
    const cc = (id) => (id === 'dw' ? gs.dw : gs.fr)
    const stepTo = (g) => { goal = g }

    // 1) carrying something
    const held = heldItem(gs)
    if (held) {
        const c = cc(KINDS[held.kind].to)
        if (isOpen(c)) {
            if (inZone(c, gs.rx, gs.ry)) act = 'a'
            else stepTo(zoneCenter(c, gs))
        } else if (isShut(c)) {
            if (nearBody(c, gs.rx, gs.ry)) act = 'a'
            else stepTo(bodyApproach(c, gs))
        } else stepTo(zoneCenter(c, gs))
    } else if (wrongInside(gs).length) {
        // 2) wrong stows get rescued first (retrieve is a B-verb)
        const bad = wrongInside(gs)
        const c = cc(bad[0].cont)
        if (isOpen(c)) {
            if (inZone(c, gs.rx, gs.ry)) act = 'b'
            else stepTo(zoneCenter(c, gs))
        } else if (isShut(c)) {
            if (nearBody(c, gs.rx, gs.ry)) act = 'a'
            else stepTo(bodyApproach(c, gs))
        }
    } else if (looseItems(gs).length) {
        // 3) loose litter: sticky pick (hysteresis — no flip-flop mid-walk),
        //    its container opened on approach
        const loose = looseItems(gs)
        let best = loose.find((it) => it.id === A.pick) || null
        if (!best) {
            best = null
            let bd = Infinity
            for (const it of loose) {
                const d = Math.hypot(it.x - gs.rx, it.y - gs.ry)
                if (d < bd) { bd = d; best = it }
            }
            A.pick = best.id
        }
        const bd = Math.hypot(best.x - gs.rx, best.y - gs.ry)
        const c = cc(KINDS[best.kind].to)
        if (!isOpen(c)) {
            if (isShut(c)) {
                if (nearBody(c, gs.rx, gs.ry)) act = 'a'
                else stepTo(bodyApproach(c, gs))
            } else stepTo(zoneCenter(c, gs))
        } else if (bd <= GRAB_R) act = 'a'
        else stepTo(itNearStand(gs, best))
    } else {
        A.pick = null
        // 4) everything away: shut any open doors
        const openAny = [gs.dw, gs.fr].find((c) => !isShut(c))
        if (openAny) {
            if (nearBody(openAny, gs.rx, gs.ry)) act = 'a'
            else stepTo(bodyApproach(openAny, gs))
        } else if (!gs.dwRun && dwLoaded(gs) > 0) {
            // 5) loaded and shut -> start the cycle
            if (nearBody(gs.dw, gs.rx, gs.ry)) act = 'b'
            else stepTo(bodyApproach(gs.dw, gs))
        } else stepTo(nearPoint(HOME.x, HOME.y)) // 6) idle home
    }

    if (act === 'a') pad.a = press()
    if (act === 'b') pad.b = press()
    if (goal) {
        const dx = goal.x - gs.rx, dy = goal.y - gs.ry
        if (Math.hypot(dx, dy) > 2.5) {
            const nxt = bfsNext(gs, goal.x, goal.y)
            const t = nxt || goal
            const mx = t.x - gs.rx, my = t.y - gs.ry
            const px = mx > 0 ? 1 : mx < 0 ? -1 : 0
            const py = my > 0 ? 1 : my < 0 ? -1 : 0
            // collision-aware axis choice: press what actually moves, so a
            // corner graze at cell granularity can never wedge the robot
            const axes = Math.abs(mx) >= Math.abs(my) ? ['x', 'y'] : ['y', 'x']
            let moved = false
            for (const ax of axes) {
                if (ax === 'x' && px && canStandRel(gs, gs.rx + px * 2.5, gs.ry)) { pad[px > 0 ? 'right' : 'left'] = true; moved = true; break }
                if (ax === 'y' && py && canStandRel(gs, gs.rx, gs.ry + py * 2.5)) { pad[py > 0 ? 'down' : 'up'] = true; moved = true; break }
            }
            if (!moved) {
                const esc = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([ex, ey]) => canStandRel(gs, gs.rx + ex * 2.5, gs.ry + ey * 2.5))
                if (esc) {
                    if (esc[0]) pad[esc[0] > 0 ? 'right' : 'left'] = true
                    else pad[esc[1] > 0 ? 'down' : 'up'] = true
                }
            }
        }
    }
    return pad
}

// where the robot stands to grab an item, hugging furniture from outside:
// dense scan of all stands within arm's reach, nearest-to-item first
const itNearStand = (gs, it) => {
    let best = null, bd = Infinity
    for (let ox = -GRAB_R; ox <= GRAB_R; ox += 3) {
        for (let oy = -GRAB_R; oy <= GRAB_R; oy += 3) {
            const d = Math.hypot(ox, oy)
            if (d > GRAB_R || d >= bd) continue
            const p = { x: it.x + ox, y: it.y + oy }
            if (canStand(gs, p.x, p.y)) { bd = d; best = p }
        }
    }
    return best || { x: it.x, y: it.y + 14 }
}

// Node-side win proof: run the whole game with the autopilot.
export function playthrough(seed, cap = 40000) {
    const gs = makeGame(seed, 1)
    while (!gs.end && gs.tick < cap) step(gs, [autopilot(gs)])
    return gs
}
