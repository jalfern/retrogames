// RACCOON HEIST — the check that PLAYS a job to the end, on foot, with no shortcuts.
//
//   npm run heistwin            # job 2 (the museum)
//   npm run heistwin -- --job 3 # job 3 (the manor)
//
// `heistplay` walks job 1 through scripted set-pieces whose coordinates a human typed.
// That method cannot be copied to jobs 2 and 3 — those maps have never been walked by
// anything, and out there a driver needs not coordinates but *decisions*: which pile
// to fetch next, when a cone has swung far enough to cross, where to wait a patrol
// out. So this driver is a small player. It keeps its own map (read out of the DEV
// hook, like a player who studied the blueprint), plans routes in Node, and touches
// the game through exactly the input paths a thumb has:
//
//   * `stick(x, y)`   — the thumb, camera-relative exactly like the real pad;
//   * `key('KeyC')`   — crouch (the silent gait);
//   * `tap('grab')`   — the same action queue E/Space/Z push into;
//   * `hold(true)`    — chewing a lock;
//   * `switchTo(i)`   — the CREW button.
//
// It never calls `moveTo`, never warps a watcher, never releases a prisoner. If the
// raccoon is somewhere, it walked there. The pass condition is one sentence: the job
// reaches `clear` with every pile delivered, from spawn to gate, moving only by stick.
//
// Honesty notes:
//   * the threat model is the game's OWN sight rule — same sight blockers, the cone
//     half-angles and ranges the watchers were actually spawned with, the same march
//     step — so "the planner thinks it is safe" means "the sim cannot see it either".
//     The driver knows the map layout, which is a thing a player learns by looking;
//   * every wait/budget is in **world** seconds through the same `__simSleep` EMA
//     heistplay established; the wall clock is only a stall detector;
//   * a bust is a diagnostic, not a shrug: the run dumps the last events, the crew
//     positions, and where every watcher stood when the crew fell.

import { opt, openGame, launch, requireDevServer, Report, throttleCPU } from './lib/harness.mjs'

const JOB = +opt(process.argv, '--job', 2) - 1 // human 1-based -> index
if (!(JOB >= 0 && JOB <= 2)) { console.error('--job is 1-based (1..3)'); process.exit(2) }
const URL0 = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1')
const LITE = process.env.HEIST_LITE ? process.env.HEIST_LITE !== '0' : !!process.env.CI
const VIEW = LITE ? { width: 640, height: 426 } : { width: 1100, height: 700 }
const URL = URL0 + (LITE ? (URL0.includes('?') ? '&' : '?') + 'lite=1' : '')
const THROTTLE = +opt(process.argv, '--throttle', 0)
const BUDGET = +opt(process.argv, '--budget', 30 * 60) // world seconds for the whole job
const MAX_RUNS = +opt(process.argv, '--runs', 3)       // restart attempts after a bust
const TRACE = process.argv.includes('--trace')
// DEV EXPERIMENT, not a play mode: jump the actor beside the vault door and chew,
// so door-geometry failures stop costing six minutes of walking to reproduce.
const FASTDOOR = process.argv.includes('--fastdoor')

await requireDevServer(URL)
let browser = await launch()
let page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: VIEW })
if (THROTTLE) await throttleCPU(page, THROTTLE)
const r = new Report('heistwin')
console.log(`  ..  job ${JOB + 1} · ${VIEW.width}x${VIEW.height}${LITE ? ' — lite pipeline' : ''} · budget ${BUDGET}s of world time`)

// Headless Chrome eating a full WebGL sim for ten minutes is the one genuinely flaky
// thing in this suite: the renderer can die. When the page is gone, relaunch it and
// re-run the attempt — the attempt counter, not the browser's mood, bounds the job.
async function revivePage() {
    console.log('      ..  page died — relaunching Chrome for the next attempt')
    try { await browser.close() } catch { /* the dead thing cannot be closed twice */ }
    browser = await launch()
    page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: VIEW })
    if (THROTTLE) await throttleCPU(page, THROTTLE)
    await installClockHooks()
}

const api = (fn, ...args) => page.evaluate(fn, ...args)

// World-second sleep + job clock, exactly as heistplay defines them: a driver asleep
// on setTimeout measures the runner, not the game.
async function installClockHooks() {
    await api(() => {
    window.__simRate = 1
    window.__simLast = null
    window.__sample = () => window.__heistTest?.engine()?.st?.elapsed ?? 0
    window.__simSleep = async (secs) => {
        const now = performance.now()
        const s = window.__sample()
        if (window.__simLast && s > window.__simLast.s) {
            const dw = (now - window.__simLast.w) / 1000
            if (dw > 0.04) {
                const inst = (s - window.__simLast.s) / dw
                window.__simRate = window.__simRate * 0.6 + inst * 0.4
            }
        }
        window.__simLast = { s, w: now }
        const wall = Math.max(40, (1000 * secs) / Math.min(4, Math.max(0.05, window.__simRate)))
        await new Promise(res => setTimeout(res, wall))
    }
    })
}
const sleep = async (secs) => api((s) => window.__simSleep(s), secs)
await installClockHooks()

// --------------------------------------------------------------- world model ----
// The planner mirrors the sim's own grid, READ out of the running level — never
// retyped, so the audit and the driver cannot disagree about where the walls are.
const CELL = 2.2
const TNAME = { VOID: 0, FLOOR: 1, MARBLE: 2, WALL: 3, FENCE: 4, BUSH: 5, DUMP: 6, CRATE: 7, LAMP: 8, WATER: 9 }
const blocksMove = (t) => t === 0 || t === 3 || t === 4 || t === 6 || t === 7
const blocksSight = (t) => t === 0 || t === 3 || t === 6 || t === 7

class Model {
    constructor(dims, names, marks, props) {
        this.w = dims.w; this.h = dims.h; this.ox = dims.ox; this.oz = dims.oz
        // FLAT, indexed y*w+x — the day this was `names.map(...)` (an array of rows)
        // while `at()` kept computing `grid[y*w+x]`, every lookup past row 0 read
        // `undefined`, every wall read walkable, and the driver phantom-routed through
        // the museum's brick until it face-planted into real collision at a door.
        this.grid = names.flat().map(n => TNAME[n] ?? 0)
        this.props = props.map(p => ({ x: p.x, z: p.z, r: p.r }))
        const mk = (ch) => marks.filter(m => m.ch === ch)
        this.cart = this.cellOf(mk('S')[0].wx, mk('S')[0].wz)
        this.gate = this.cellOf(mk('X')[0].wx, mk('X')[0].wz)
        this.pound = this.cellOf(mk('P')[0].wx, mk('P')[0].wz)
        this.vaultCells = mk('V').map(m => this.cellOf(m.wx, m.wz))
    }
    at(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.grid[y * this.w + x] }
    cellOf(wx, wz) { return [Math.round(wx / CELL - this.ox), Math.round(wz / CELL - this.oz)] }
    worldOf(x, y) { return [(x + this.ox) * CELL, (y + this.oz) * CELL] }
    los(ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az
        const len = Math.hypot(dx, dz)
        if (len < 1e-6) return true
        const n = Math.ceil(len / 0.22)
        const sx = dx / n / CELL, sy = dz / n / CELL
        let x = ax / CELL - this.ox, y = az / CELL - this.oz
        for (let i = 1; i <= n; i++) {
            x += sx; y += sy
            if (blocksSight(this.at(Math.round(x), Math.round(y)))) return false
        }
        return true
    }
    propBlocks(x, y) {
        // any prop whose BODY (plus a body's worth of clearance) claims this cell —
        // the old p.r+0.34 test only caught dead-centre props and happily routed
        // the whole plan straight through a bin the engine refuses to let anyone
        // cross (job 3: pinned in a two-barrel slot at y24, both contact rings
        // touching, zero legal axis, full stick into the barrel forever).
        const [wx, wz] = this.worldOf(x, y)
        return this.props.some(p => Math.hypot(wx - p.x, wz - p.z) < p.r + 0.65)
    }
}

// Dijkstra over cells. `sealed`: Set of "x,y" (shut vault/gate doors); `danger`: Map
// "x,y" -> extra cost. Small grids (~800 cells), so a linear-scan frontier is fine.
function route(model, from, to, { sealed = new Set(), danger = new Map() } = {}) {
    const { w, h } = model
    const key = (x, y) => x + ',' + y
    if (blocksMove(model.at(to[0], to[1]))) return null
    const start = from[1] * w + from[0], goal = to[1] * w + to[0]
    const cost = new Float64Array(w * h).fill(Infinity)
    const prev = new Int32Array(w * h).fill(-2)
    cost[start] = 0
    const q = [start]
    while (q.length) {
        let bi = 0
        for (let i = 1; i < q.length; i++) if (cost[q[i]] < cost[q[bi]]) bi = i
        const cur = q.splice(bi, 1)[0]
        if (cur === goal) break
        const cx = cur % w, cy = (cur / w) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const k = ny * w + nx
            if (cost[k] < Infinity / 2 && cost[k] <= cost[cur]) continue // settled-ish prune
            const t = model.at(nx, ny)
            if (blocksMove(t)) continue
            if (sealed.has(key(nx, ny))) continue
            let c = 1
            if (t === 9) c += 6                                // water is loud
            if (model.propBlocks(nx, ny)) c += 14             // a bin standing in it
            if (t === 5) c -= 0.35                            // hedges are cheap at night
            const d = danger.get(key(nx, ny)) || 0
            const step = c + (d ? 3 * d : d) // watched cells must also be LOOKED AHEAD through
            if (cost[cur] + step < cost[k]) {
                cost[k] = cost[cur] + step
                prev[k] = cur
                if (!q.includes(k)) q.push(k)
            }
        }
    }
    if (prev[goal] === -2 && start !== goal) return null
    const out = []
    for (let k = goal; ; k = prev[k]) {
        out.push([k % w, (k / w) | 0])
        if (k === start) break
    }
    return out.reverse()
}

// ------------------------------------------------------------------ sensing -------
async function sense() {
    return await api(() => {
        const t = window.__heistTest
        const e = t.engine()
        const st = e.st
        return {
            t: st.t, elapsed: st.elapsed, phase: st.phase, heat: st.heat, gate: st.gateOpen,
            masked: st.masked, delivered: st.delivered, msg: st.msg, hint: st.hint || '',
            result: st.result,
            x: e.activeCrew.x, z: e.activeCrew.z,
            held: e.activeCrew.held ? e.activeCrew.held.label : null,
            crew: e.snapshot().crew,
            camEff: st.camYawEff ?? st.camYaw,
            watchers: t.watchers().map(k => ({
                kind: k.kind, state: k.state, x: k.x, z: k.z, yaw: k.yaw, range: k.range, half: k.half,
            })),
            loot: t.lootList(),
            // The sim's OWN truth about which vault doors stand open — read off the
            // door hinge the engine animates, not off an event queue a busy poll could
            // have drained. Whether a cell is sealed must survive any lost event.
            vaultOpen: t.world().vaults.map(v => v.open > 0.5),
            lasers: t.world().lasers.map(l => ({ z: l.z, x0: l.x0, x1: l.x1, on: !!l.on, period: l.period, duty: l.duty, phase: l.phase })),
            events: t.events(),
        }
    })
}

// Where the guards can see, right now, per cell. The game's own sight rule: the cone
// half-angle and range the watcher was spawned with, the same blocksSight march.
function threatMap(model, s) {
    const danger = new Map()
    const mark = (x, y, v) => {
        const k = x + ',' + y
        danger.set(k, Math.max(danger.get(k) || 0, v))
    }
    for (const wa of s.watchers) {
        const [gx, gy] = model.cellOf(wa.x, wa.z)
        const R = Math.ceil((wa.range || 9) / CELL) + 1
        for (let y = gy - R; y <= gy + R; y++) {
            for (let x = gx - R; x <= gx + R; x++) {
                if (blocksMove(model.at(x, y))) continue
                const [wx, wz] = model.worldOf(x, y)
                const d = Math.hypot(wx - wa.x, wz - wa.z)
                if (d > (wa.range || 9)) continue
                let a = Math.atan2(wx - wa.x, wz - wa.z) - wa.yaw
                while (a > Math.PI) a -= Math.PI * 2
                while (a < -Math.PI) a += Math.PI * 2
                if (Math.abs(a) > (wa.half || 0.66) * 1.15) continue
                if (!model.los(wa.x, wa.z, wx, wz)) continue
                // In a cone AND inside grab range of THIS watcher: a wall, not a cost.
                // A suspect grabs at 0.85 m; open floor 2 m from his face is a race the
                // driver cannot win on foot.
                const near = d < 3.4
                mark(x, y, near ? 900 : wa.state === 'alert' ? 400 : wa.state === 'suspect' ? 160 : 45)
            }
        }
        mark(gx, gy, 900) // the cell he stands on is not a corridor, seen or not
    }
    return danger
}

// Beam rows as enterable decisions: cross only while dark AND dark long enough.
function beamOk(model, s, beams, x, y) {
    const [wx, wz] = model.worldOf(x, y)
    for (const b of beams) {
        if (Math.abs(wz - b.z) > 0.9) continue          // beam band only
        if (wx < b.x0 - 1.2 || wx > b.x1 + 1.2) continue
        if (b.on) return false
        if (b.left < 1.1) return false                   // about to light up mid-cross
    }
    return true
}
function beamState(s) {
    return s.lasers.map(l => {
        const cyc = l.period
        const pos = ((s.t + l.phase) % cyc + cyc) % cyc
        const on = pos < cyc * l.duty
        return { z: l.z, x0: l.x0, x1: l.x1, on, left: on ? cyc * l.duty - pos : cyc - pos }
    })
}

// The nearest cell nobody can see right now (preferring hedge/dumpster floor).
function nearestSafe(m, s, danger, { maxR = 13 } = {}) {
    const [ax, ay] = m.cellOf(s.x, s.z)
    let best = null
    for (let y = Math.max(0, ay - 6); y <= Math.min(m.h - 1, ay + 6); y++) {
        for (let x = Math.max(0, ax - 6); x <= Math.min(m.w - 1, ax + 6); x++) {
            if (blocksMove(m.at(x, y))) continue
            if ((danger.get(x + ',' + y) || 0) > 0) continue
            const [wx, wz] = m.worldOf(x, y)
            const d = Math.hypot(wx - s.x, wz - s.z)
            if (d > maxR) continue
            const t = m.at(x, y)
            const score = d - (t === 5 || t === 6 ? 3 : 0)
            if (!best || score < best.score) best = { x, y, score }
        }
    }
    return best
}

// A hedge or dumpster within reach — the place a crouched raccoon is invisible to
// the sight model AND immune to the grab (`if (c.hidden) continue` in the catch).
// When a search is on top of us and no unwatched floor exists, this is the cell.
function nearestHide(m, s, { maxR = 9 } = {}) {
    const [ax, ay] = m.cellOf(s.x, s.z)
    let best = null
    for (let y = Math.max(0, ay - 4); y <= Math.min(m.h - 1, ay + 4); y++) {
        for (let x = Math.max(0, ax - 4); x <= Math.min(m.w - 1, ax + 4); x++) {
            const t = m.at(x, y)
            if (t !== 5 && t !== 6) continue
            const [wx, wz] = m.worldOf(x, y)
            const d = Math.hypot(wx - s.x, wz - s.z)
            if (d > maxR) continue
            if (s.watchers.some(w => Math.hypot(w.x - wx, w.z - wz) < 3)) continue
            if (!best || d < best.d) best = { x, y, d }
        }
    }
    return best
}

// ------------------------------------------------------------------ driving -------
const stick = (x, y) => api(([a, b]) => window.__heistTest.stick(a, b), [x, y])
const crouch = (on) => api(([k, d]) => window.__heistTest.key(k, d), ['KeyC', on])
const tap = (a) => api((n) => window.__heistTest.tap(n), a)
const hold = (on) => api((v) => window.__heistTest.hold(v), on)
const switchTo = (i) => api((n) => window.__heistTest.switchTo(n), i)

// Stick is camera-relative (the pad is screen-space; the engine rotates by camYawEff).
// Invert the engine's wx = my*sin - mx*cos ; wz = my*cos + mx*sin, then remember the
// hook negates y again (thumb-up is +y on glass, and -y is what the engine wants).
function stickFor(camEff, wx, wz) {
    const m = Math.hypot(wx, wz) || 1
    const ux = wx / m, uz = wz / m
    const s = Math.sin(camEff), c = Math.cos(camEff)
    const my = ux * s + uz * c
    const mx = uz * s - ux * c
    return [Math.max(-1, Math.min(1, mx)), Math.max(-1, Math.min(1, -my))]
}

class Player {
    constructor(model) {
        this.m = model
        this.traceN = 0
    }
    async say(...bits) {
        console.log(`      [w] ${bits.join(' ')}`)
    }
    async trace(...bits) {
        if (!TRACE) return
        console.log(`      · ${bits.join(' ')}`)
    }
    // Always-on heartbeat: a leg silent for minutes in a CI log is a hung renderer,
    // and one line per 8 s is cheap insurance against guessing that from an eof.
    async beat(msg) {
        console.log(`      ~ ${msg}`)
    }
    legN = 0
    async stickOff() { await stick(0, 0) }

    /** Break line of sight from anyone close enough to catch us, and stand down. */
    async evade(s) {
        const m = this.m
        let since = s.elapsed
        while (s.phase === 'play') {
            const pressure = s.watchers.some(w => {
                const d = Math.hypot(w.x - s.x, w.z - s.z)
                return (w.state === 'alert' && d < 10) || (w.state === 'suspect' && d < 5.5)
            })
            if (!pressure) return s
            if (TRACE && s.elapsed - since > 1.5) {
                since = s.elapsed
                await this.trace(`EVADING heat=${Math.round(s.heat)} ${s.watchers.map(w => `${w.kind[0]}${w.state.slice(0, 3)} d=${Math.hypot(w.x - s.x, w.z - s.z).toFixed(0)}`).join(' ')}`)
            }
            const danger = threatMap(m, s)
            const safe = nearestSafe(m, s, danger) || nearestHide(m, s)
            await crouch(true)
            if (safe) {
                const here = m.cellOf(s.x, s.z)
                const path = route(m, here, [safe.x, safe.y], { sealed: sealedNow(m, s), danger })
                if (path && path.length > 1) {
                    const [wx, wz] = m.worldOf(path[1][0], path[1][1])
                    const [mx, my] = stickFor(s.camEff, wx - s.x, wz - s.z)
                    await stick(mx, my)
                    s = await this.refresh(0.16)
                    continue
                }
            }
            // Nowhere cleaner to stand: crouch into whatever is under us and hold still.
            await stick(0, 0)
            s = await this.refresh(0.4)
        }
        return s
    }

    /** Walk to within `radius` metres of a world point, waiting out cones. */
    async goTo(s, tx, tz, { radius = 0.55, hurry = false, leash = 160 } = {}) {
        const m = this.m
        const endAt = s.elapsed + leash
        let waited = 0
        let bounces = 0
        let lastX = s.x, lastZ = s.z, movedT = s.elapsed
        let bestD = Math.hypot(s.x - tx, s.z - tz)
        let bestT = s.elapsed
        while (true) {
            if (s.phase !== 'play') { await stick(0, 0); return s.phase === 'clear' }
            const dW = Math.hypot(s.x - tx, s.z - tz)
            if (dW <= radius) { await stick(0, 0); return true }
            if (s.elapsed > endAt) { await stick(0, 0); await this.say('leg leash blown heading', [tx, tz].map(v => v.toFixed(1)), `d=${dW.toFixed(1)}`); return false }
            const here = m.cellOf(s.x, s.z)
            const target = m.cellOf(tx, tz)
            const sealed = sealedNow(m, s)
            const danger = threatMap(m, s)
            const beams = beamState(s)
            // Being hunted is a different problem than being seen: crouching in a
            // corridor that a search is walking down is not stealth, it is waiting
            // to be bagged. Break sight, get to a clean cell, let the night pass.
            const pressure = s.watchers.some(w => {
                const d = Math.hypot(w.x - s.x, w.z - s.z)
                return (w.state === 'alert' && d < 10) || (w.state === 'suspect' && d < 5.5)
            })
            if (pressure) {
                await stick(0, 0)
                s = await this.evade(s)
                continue
            }
            const path = route(m, here, target, { sealed, danger })
            if (!path) {
                await stick(0, 0)
                await this.say('no route from', here, 'to', target, `(sealed: ${[...sealed].join(' ') || '—'})`)
                return false
            }
            // path.length 1 means the target lives in the cell we are standing on —
            // walk straight at the POINT; aiming at that cell's centre instead stalls
            // forever one radius short (that is what made the vault door unreachable).
            const [nx, ny] = path.length > 1 ? path[1] : target
            const [wx, wz] = path.length > 1 ? m.worldOf(nx, ny) : [tx, tz]
            const bad = (danger.get(nx + ',' + ny) || 0) >= 100 || !beamOk(m, s, beams, nx, ny)
            const hereWatched = (danger.get(here.join(',')) || 0) >= 100
            if (bad && dW > radius + 3.2 && waited < 150 && !hurry) {
                // Being watched WHERE WE STAND outranks the wait: step into the
                // nearest hedge and wait inside it — job 3's garden watchdog parked
                // in the one doorway to the last painting and every route crossed
                // his cone; sitting in the open corridor chewing patience is how
                // three attempts died. Crouched in a hedge at night he cannot see
                // us at all; the patrol walks its route and the way reopens.
                if (hereWatched) {
                    const hid = nearestHide(m, s)
                    if (hid && (hid.x !== here[0] || hid.y !== here[1])) {
                        const [hx, hz] = m.worldOf(hid.x, hid.y)
                        await this.say(`watched standing up — ducking into hedge ${[hid.x, hid.y]}`)
                        await this.goTo(s, hx, hz, { radius: 0.45, leash: 40 })
                        s = await this.refresh(0.2)
                        waited += 6 // cost the wait loop for the detour
                        continue
                    }
                }
                // Hold, and hold *well*: crouch if the floor under us is cover, and if
                // a watcher is in 'suspect' state heading roughly at us, back off the
                // route they are walking instead of standing on the doorbell.
                await crouch(true)
                await stick(0, 0)
                waited += 0.2
                if (TRACE && ++this.traceN % 15 === 0) {
                    await this.trace(`wait @${here} ${waited.toFixed(1)}s`, s.watchers.map(x => `${x.kind[0]}${x.state.slice(0, 3)} d=${Math.hypot(x.x - s.x, x.z - s.z).toFixed(0)}`).join(' '), `hint="${s.hint}"`)
                }
                s = await this.refresh(0.2)
                continue
            }
            if (bad && !hurry && waited >= 150) {
                // Forty seconds of the same cone and no pressure to run from: the patrol
                // is not coming off this cell on its own. Fall back to the nearest clean
                // cell and regroup there rather than standing on the doormat forever.
                const safe = nearestSafe(m, s, danger)
                if (safe && (safe.x !== here[0] || safe.y !== here[1])) {
                    if (++bounces > 4) { await stick(0, 0); await this.say('livelock: patrol owns every way out — abandon leg'); return false }
                    await this.say('patrol parked on the route — relocating to', [safe.x, safe.y])
                    const [sx2, sz2] = m.worldOf(safe.x, safe.y)
                    await this.goTo(s, sx2, sz2, { radius: 0.5, leash: 60 })
                    s = await this.refresh(0.2)
                    waited = 0
                    continue
                }
            }
            if (TRACE && ++this.traceN % 20 === 0) {
                await this.trace(`walk @${here} (${s.x.toFixed(2)},${s.z.toFixed(2)}) -> ${nx},${ny} (${m.worldOf(nx, ny).map(v => v.toFixed(2))}) d=${dW.toFixed(1)} bad=${bad} hint="${s.hint}" heat=${Math.round(s.heat)}`)
            }
            // Progress watchdog: a prop (bin, lamppost) stops the walker dead mid-cell,
            // and the grid route cannot see the difference between "stuck" and "slow".
            if (dW < bestD - 0.07) { bestD = dW; bestT = s.elapsed }
            // Frozen watchdog: `bad` can never trigger when the grid says open floor —
            // a bin fills the next cell, the aim clips it, and every tick's push
            // cancels itself with dW CONSTANT, so a d-based watchdog never wakes up.
            // Constant POSITION is the only witness. This is also the "a thumb would
            // notice" case: nobody stands at a full stick into a barrel for minutes.
            if (Math.abs(s.x - lastX) + Math.abs(s.z - lastZ) > 0.12) { lastX = s.x; lastZ = s.z; movedT = s.elapsed }
            let evasive = false
            let ax, az
            ax = wx - s.x; az = wz - s.z
            if (s.elapsed - movedT > 2.5) {
                // aim tangent to the prop that owns our feet, alternating sides
                evasive = true
                let fp = null, fd = 9e9
                for (const pr of m.props) { const dd = Math.hypot(pr.x - s.x, pr.z - s.z); if (dd < fd) { fd = dd; fp = pr } }
                if (fp && fd < fp.r + 0.8) {
                    const dx2 = s.x - fp.x, dz2 = s.z - fp.z
                    const pl3 = Math.hypot(dx2, dz2) || 1
                    const sgn = (Math.floor(s.elapsed * 0.7) % 2) ? 1 : -1
                    ax = (-dz2 / pl3) * 1.2 * sgn + (dx2 / pl3) * 0.55
                    az = (dx2 / pl3) * 1.2 * sgn + (dz2 / pl3) * 0.55
                }
            }
            // Arc around props the straight chord clips. Bins are invisible to the
            // GRID, the route only penalises their cell, and the engine simply
            // refuses the walk — job 3 stalled forever at a barrel mid-corridor with
            // a heartbeat frozen at one cell because every tick aimed through it.
            {
                const L = Math.hypot(ax, az) || 1
                const ux = ax / L, uz = az / L
                const px2 = -uz, pz2 = ux
                for (const pr of m.props) {
                    const rx = pr.x - s.x, rz = pr.z - s.z
                    const t = rx * ux + rz * uz
                    if (t < 0.1 || t > L + 0.1) continue
                    const cx = rx - ux * t, cz = rz - uz * t
                    const d = Math.hypot(cx, cz)
                    const need = pr.r + 0.62 // > the engine's r + 0.32 contact ring —
                    // sitting exactly ON the ring is what froze the walk dead
                    if (d < need) {
                        const side = (cx * px2 + cz * pz2) >= 0 ? 1 : -1
                        const push = Math.min(0.9, need - d + 0.25)
                        ax -= px2 * push * side * (evasive ? 0.35 : 1)
                        az -= pz2 * push * side * (evasive ? 0.35 : 1)
                    }
                }
            }
            if (s.elapsed - bestT > 1.6 && !evasive) {
                if (TRACE) {
                    const sm = stickFor(s.camEff, ax, az)
                    await this.trace(`stuck at ${s.x.toFixed(2)},${s.z.toFixed(2)} best=${bestD.toFixed(2)} aim=(${ax.toFixed(1)},${az.toFixed(1)}) stick=(${sm[0].toFixed(2)},${sm[1].toFixed(2)}) cam=${s.camEff.toFixed(2)} side=${Math.floor((s.elapsed - bestT) / 1.6) % 2 ? -1 : 1}`)
                }
                // Nudge sideways, but KEEP THRUST FORWARD and reset the watchdog:
                // perpendicular-dominant steering that never re-arms walks the actor
                // into a permanent waltz on the spot — measured in the doorcell of
                // job 2, where a pure-forward stick walks straight to the collider
                // limit but the old jiggle stalled 0.6 m short of chew reach forever.
                const px = -az, pz = ax
                const sgn = (Math.floor((s.elapsed - bestT) / 1.6) % 2) ? -1 : 1
                const pl = Math.hypot(ax, az) || 1
                ax = (ax / pl) * 0.75 + (px / pl) * 0.55 * sgn
                az = (az / pl) * 0.75 + (pz / pl) * 0.55 * sgn
                bestT = s.elapsed
                bestD = dW
            }
            const [mx, my] = stickFor(s.camEff, ax, az)
            if (++this.legN % 50 === 0) {
                let np = null, nd = 9e9
                for (const pr of m.props) { const dd = Math.hypot(pr.x - s.x, pr.z - s.z); if (dd < nd) { nd = dd; np = pr } }
                await this.beat(`leg->(${tx.toFixed(1)},${tz.toFixed(1)}) @${here} (${s.x.toFixed(2)},${s.z.toFixed(2)}) d=${dW.toFixed(1)} bad=${bad} stick=(${mx.toFixed(2)},${my.toFixed(2)}) prop=${np ? `${nd.toFixed(2)}/${np.r.toFixed(2)}` : '—'} hint="${s.hint}"`)
            }
            // The gait: a watcher within earshot means CROUCH — crouch noise is 0, and
            // every suspect this job generated was summoned by upright footsteps. The
            // walk is only allowed where nobody could hear it anyway.
            const nearestW = s.watchers.reduce((a, w) => Math.min(a, Math.hypot(w.x - s.x, w.z - s.z)), 99)
            await crouch(nearestW < 15)
            await stick(mx, my)
            s = await this.refresh(0.16)
        }
    }
    async refresh(dt) {
        await sleep(dt)
        return await sense()
    }
}

function sealedNow(m, s) {
    const out = new Set()
    if (!s.gate) out.add(m.gate.join(','))
    m.vaultCells.forEach((v, i) => { if (!s.vaultOpen || !s.vaultOpen[i]) out.add(v.join(',')) })
    return out
}

async function startJob(job) {
    // attract --job(i)--> brief -> beginJob -> play. All through the same start() the
    // title card uses; the driver never pokes engine.start() itself.
    await api((j) => window.__heistTest.job(j), job)
    await sleep(0.8)
    await api(() => window.__heistTest.press())
    await sleep(1.4)
    return await sense()
}

// --------------------------------------------------------------- job brain --------
async function run(job) {
    // Start FIRST: `level` only exists once a job is mounted, and dims/grid questions in
    // attract mode answer about a world that was never built.
    let s = await startJob(job)
    if (s.phase !== 'play') throw new Error(`job did not start (phase ${s.phase})`)
    const dump = await api(() => {
        const t = window.__heistTest
        const d = t.dims()
        const names = []
        for (let y = 0; y < d.h; y++) {
            const row = []
            for (let x = 0; x < d.w; x++) row.push(t.navAt((x + d.ox) * d.cell, (y + d.oz) * d.cell))
            names.push(row)
        }
        return { d, names, props: t.props().map(p => ({ x: p.x, z: p.z, r: p.r })), marks: t.marks() }
    })
    const model = new Model(dump.d, dump.names, dump.marks, dump.props)
    const p = new Player(model)
    await p.say(`spawn ${model.cellOf(s.x, s.z)} · ${s.loot.length} piles · ${s.watchers.length} on shift · cart ${model.cart} gate ${model.gate} pound ${model.pound} vault ${JSON.stringify(model.vaultCells)}`)

    if (FASTDOOR) {
        const [vx, vz] = model.worldOf(...model.vaultCells[0])
        const mv = await api((x) => {
            // teleport EVERY crew member — chewVault takes TINKER to the door, and a
            // TINKER left at the spawn turns "fast door" into a six-minute stroll.
            const t = window.__heistTest
            const e = t.engine()
            for (const c of e.snapshot().crew) { if (!c.caged) { t.switchTo(c.idx); t.moveTo(x, 7.7) } }
            t.switchTo(0)
            return [e.activeCrew.x, e.activeCrew.z]
        }, vx - 2.2)
        await p.stickOff()
        s = await p.refresh(0.4)
        await p.say(`fastdoor: door=(${vx.toFixed(1)},${vz.toFixed(1)}) moveTo=${JSON.stringify(mv)} actor=(${s.x.toFixed(1)},${s.z.toFixed(1)})`)
        const ok = await chewVault(p, model, s, 0)
        console.log(`      ..  fastdoor chew: ${ok ? 'OPENED' : 'FAILED'}`)
        await api(() => window.__heistTest.engine().st)
        return { s: await p.refresh(0.2), p, model, fast: true }
    }

    const endAt = s.elapsed + BUDGET
    let loops = 0, noDeliver = 0, lastDelivered = 0
    const stuck = { vault: 0 }
    while (s.phase === 'play' && s.elapsed < endAt && loops++ < 400) {
        // ---- what is there to do? Derived from the sim EVERY loop: arrests, drops
        // and finished chews all change the answer mid-leg.
        const caged = s.crew.find(c => c.caged)
        const holder = s.crew.find(c => c.held && !c.caged)
        const want = s.loot.filter(l => !l.delivered)

        if (s.gate && !want.length) {
            await p.say('gate is up — go get it')
            const [gx, gz] = model.worldOf(...model.gate)
            await p.goTo(s, gx, gz, { radius: 0.35, hurry: true, leash: 90 })
            s = await p.refresh(0.4)
            if (s.phase !== 'play') break
            continue
        }
        if (caged) {
            await p.say(`chewing the pound open for ${caged.name}`)
            await chewPound(p, model, s)
            s = await p.refresh(0.2)
            continue
        }
        if (holder && !holder.active) {
            await p.say(`switching to ${holder.name}, who is holding something`)
            await switchTo(holder.idx)
            s = await p.refresh(0.3)
            continue
        }
        if (s.held) {
            const [cx, cz] = model.worldOf(...model.cart)
            await p.say(`carrying ${s.held} to the cart (${s.delivered}/${s.loot.length} in)`)
            const ok = await p.goTo(s, cx, cz, { radius: 1.3, leash: 120 })
            s = await p.refresh(0.2)
            if (s.phase !== 'play') break
            if (!ok) { await p.say('never made the cart with the sack'); continue }
            await tap('grab')
            await sleep(0.5)
            s = await p.refresh(0.1)
            if (s.held) { await p.say(`cart refused the sack (hint "${s.hint}")`); continue }
            continue
        }
        if (!want.length) { await p.say('all delivered but gate still shut?'); break }

        // Can we REACH each pile right now (doors as they stand)? Anything behind the
        // shut vault goes to the back of the queue — and chews the lock first.
        const sealed = sealedNow(model, s)
        const danger0 = threatMap(model, s)
        const pool = []
        for (const l of want) {
            const cell = model.cellOf(l.x, l.z)
            const here = model.cellOf(s.x, s.z)
            const ok = route(model, here, cell, { sealed, danger: danger0 })
            // Distance plus a discount rate of the RISK on the way: with six piles and
            // three patrols, the nearest bag of coins across a live cone is not the
            // cheap one — the quiet corner you can loot twice is.
            const risk = ok ? ok.reduce((a, [x, y]) => a + Math.min(50, danger0.get(x + ',' + y) || 0), 0) : 1e9
            pool.push({ l, ok: !!ok, risk, d: Math.hypot(l.x - s.x, l.z - s.z) })
        }
        const reachable = pool.filter(k => k.ok)
        if (!reachable.length) {
            // Nothing is reachable => the vault is what is in the way (that is the only
            // door this generator makes a route disappear for). Chew it, TINKER first.
            const vi = model.vaultCells.findIndex((_, i) => !(s.vaultOpen && s.vaultOpen[i]))
            if (vi < 0) { await p.say('nothing reachable and no shut vault to chew — stuck'); break }
            const opened = await chewVault(p, model, s, vi)
            s = await p.refresh(0.2)
            if (!opened && s.phase === 'play' && ++stuck.vault > 2) { await p.say('vault will not open — giving up'); break }
            continue
        }
        reachable.sort((a, b) => (a.d + a.risk * 0.35) - (b.d + b.risk * 0.35))
        const l = reachable[0].l
        await p.say(`heading for ${l.label} @${model.cellOf(l.x, l.z)} (${reachable.length} piles reachable, ${s.delivered}/${s.loot.length} delivered, heat ${Math.round(s.heat)})`)
        const ok = await p.goTo(s, l.x, l.z, { radius: 0.6, leash: 120 })
        s = await p.refresh(0.2)
        if (s.phase !== 'play') break
        if (!ok) { await p.say(`walk to ${l.label} failed`); noDeliver++; if (noDeliver > 6) break; continue }
        await tap('grab')
        await sleep(0.5)
        s = await p.refresh(0.1)
        const took = s.loot.find(k => k.label === l.label && k.taken && !k.delivered)
        if (took || s.held) await p.say(`took ${l.label}`)
        else { await p.say(`TAKE failed (hint "${s.hint}")`) }
        if (s.delivered > lastDelivered) { noDeliver = 0; lastDelivered = s.delivered } else noDeliver++
        if (noDeliver > 10) { await p.say('ten loops with no delivery — bailing to diagnostics'); break }
    }
    await stick(0, 0)
    return { s, p, model }
}

async function chewVault(p, model, s, vi) {
    const vaultCell = model.vaultCells[vi]
    await p.say('chewing the vault lock')
    // TINKER chews 1.55x faster — and the crew switch is the pad's CREW button, a
    // real action. Only swap with empty hands; a sack does not travel with a swap.
    const before = s.crew.find(c => c.active)
    const tinker = s.crew.find(c => c.name === 'TINKER' && !c.caged && !c.held)
    if (tinker && !tinker.active) { await switchTo(tinker.idx); s = await p.refresh(0.3) }
    const [vx, vz] = model.worldOf(...vaultCell)
    // Approach along ONE CARDINAL AXIS: pick a walkable neighbour cell of the door,
    // walk to its centre, then drag straight at the door along that axis to 1.45 m.
    // The old approach aimed at `door − normalize(door−actor)·1.42` from wherever the
    // actor happened to stand — a diagonal aim at a point whose corner geometry the
    // 0.32 m collider cannot legally reach (it stopped 2 mm short, forever, and the
    // leg leash died face-first in a doorframe).
    const here = model.cellOf(s.x, s.z)
    const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([ax, ay]) => ({ ax, ay, cx: vaultCell[0] + ax, cy: vaultCell[1] + ay }))
        .filter(c => !blocksMove(model.at(c.cx, c.cy)))
    cands.sort((a, b) =>
        Math.hypot(a.cx - here[0], a.cy - here[1]) - Math.hypot(b.cx - here[0], b.cy - here[1]))
    if (!cands.length) { await p.say('no walkable cell beside the vault door'); return false }
    // Drop neighbours that are only reachable THROUGH the sealed door (the office
    // side of the museum vault is walkable grid — but it is on the wrong side of
    // the lock, and a route to it simply does not exist until the lock is chewed).
    const sealed = sealedNow(model, s)
    const reachable = cands.filter(c => route(model, here, [c.cx, c.cy], { sealed }))
    if (reachable.length) cands.length = 0, cands.push(...reachable)
    const c = cands[0]
    let tries = 0
    while (s.phase === 'play' && tries++ < 4) {
        // Cycle to the next neighbour if this one cannot be reached (its route may
        // detour through the very door we are trying to open).
        const door = cands[(tries - 1) % cands.length]
        const [ccx, ccz] = model.worldOf(door.cx, door.cy)
        if (Math.hypot(s.x - ccx, s.z - ccz) > 0.9) {
            const there = await p.goTo(s, ccx, ccz, { radius: 0.8, leash: 90 })
            if (!there) continue
            s = await p.refresh(0.2)
        }
        // Aim PAST the collider stop (he jams at d≈1.42 against the door face) and
        // land INSIDE the 1.5 m chew gate: an aim point at 1.45 m with any radius
        // slack whatsoever stops the walk at 1.55-1.7 m — out of reach of the very
        // lock this whole leg exists for. The chew range is a strict `< 1.5`.
        const tx = vx + door.ax * 1.25, tz = vz + door.ay * 1.25
        await p.goTo(s, tx, tz, { radius: 0.3, hurry: true, leash: 45 })
        s = await p.refresh(0.2)
        const reach = Math.hypot(s.x - vx, s.z - vz)
        await p.trace(`door d=${reach.toFixed(2)} hint="${s.hint}"`)
        if (!String(s.hint).includes('LOCK') && !String(s.hint).includes('TINKER')) {
            await p.say(`door reach ${reach.toFixed(2)} m — hint says "${s.hint}" — retrying`)
            continue
        }
        await hold(true)
        for (let i = 0; i < 50 && s.phase === 'play'; i++) {
            await sleep(0.3)
            s = await p.refresh(0)
            if (s.vaultOpen && s.vaultOpen[vi]) {
                await hold(false)
                await p.say('LOCK CHEWED')
                if (before && !before.caged && before.idx !== s.crew.find(k => k.active)?.idx) await switchTo(before.idx)
                return true
            }
            if (!String(s.hint).includes('LOCK') && !String(s.hint).includes('TINKER')) break // lost the door — re-approach
        }
        await hold(false)
        s = await p.refresh(0.2)
        if (s.vaultOpen && s.vaultOpen[vi]) {
            if (before && !before.caged) await switchTo(before.idx)
            return true
        }
        await p.say(`chew stalled at d=${Math.hypot(s.x - vx, s.z - vz).toFixed(2)} hint="${s.hint}" — repositioning`)
    }
    if (before && !before.caged && !s.crew.find(c => c.active)?.caged) await switchTo(before.idx)
    return false
}

async function chewPound(p, model, s) {
    const [px, pz] = model.worldOf(...model.pound)
    await p.goTo(s, px, pz, { radius: 1.6, hurry: true, leash: 90 })
    s = await p.refresh(0.2)
    if (s.phase !== 'play') return
    if (!String(s.hint).includes('LOOSE')) {
        // The pound turns to face the approach, but the driver may have come in the
        // back way: hug the cage until the verb appears.
        for (let a = 0; a < 6 && s.phase === 'play'; a++) {
            const ang = a * Math.PI / 3
            await p.goTo(s, px + Math.cos(ang) * 1.55, pz + Math.sin(ang) * 1.55, { radius: 0.4, hurry: true, leash: 25 })
            s = await p.refresh(0.2)
            if (String(s.hint).includes('LOOSE')) break
        }
    }
    await hold(true)
    for (let i = 0; i < 50 && s.phase === 'play'; i++) {
        await sleep(0.3)
        s = await p.refresh(0)
        if (!s.crew.some(c => c.caged)) { await hold(false); await p.say('crewmate chewed loose'); break }
        if (s.events.some(e => e.type === 'free')) { await hold(false); break }
    }
    await hold(false)
}

// ------------------------------------------------------------------ main ----------
let won = null
for (let attempt = 1; attempt <= MAX_RUNS; attempt++) {
    console.log(`\n  -- attempt ${attempt}/${MAX_RUNS} — job ${JOB + 1} on foot, stick only`)
    try {
        const out = await run(JOB)
        const s = out.s
        won = s
        if (out.fast) { won = { phase: 'fast' }; break }
        r.check(`attempt ${attempt}: the job ends in CLEAR, not in a bail-out`, s.phase === 'clear',
            `phase=${s.phase} delivered=${s.delivered}/${s.loot.length} heat=${Math.round(s.heat)} elapsed=${s.elapsed.toFixed(0)}s msg="${s.msg}"`)
        if (s.phase === 'clear') {
            r.check('every pile reached the cart before the gate opened', s.delivered === s.loot.length,
                `${s.delivered}/${s.loot.length}`)
            r.check('the win is the real win flag', s.result?.win === true, JSON.stringify(s.result))
            break
        }
        console.log('      .. last events:', JSON.stringify(s.events.slice(-12)))
        console.log('      .. watchers  :', JSON.stringify(s.watchers.map(w => `${w.kind}:${w.state}@${w.x.toFixed(0)},${w.z.toFixed(0)}`)))
        console.log('      .. crew      :', JSON.stringify(s.crew.map(c => `${c.name}${c.caged ? '*' : ''}${c.held ? 'P' : ''}@${c.x.toFixed(0)},${c.z.toFixed(0)}`)))
        await api((j) => window.__heistTest.job(j), JOB) // full engine.reset() + brief
        await sleep(1.0)
    } catch (e) {
        console.error('      !! driver error:', e.message)
        won = { phase: 'error' }
        if (/closed|detach|target frame/i.test(e.message)) { await revivePage(); continue }
        break
    }
}
if (!won || (won.phase !== 'clear' && won.phase !== 'fast')) {
    r.check('the job is completable on foot', false, `last phase: ${won?.phase}`)
}
await browser.close()
process.exit(r.failed ? 1 : 0)
