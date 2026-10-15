// OUT RUN — sim.js : the whole game as one pure function of (state, input).
// No DOM, no React, no canvas, no Math.random — a seeded state LCG only. This is
// the exact module scripts/outruncheck.mjs imports in Node, so what the harness
// proves winnable is the exact road the cabinet drives, tick for tick.
//
// THE CONTRACT (the arcade's, honoured):
// - THE TIMER IS THE ONLY KILLER. The clock drains every tick; each checkpoint
//   reached bankes time and opens the fork. There are no lives — you lose when
//   the clock hits zero, you win by crossing the depth-5 goal gantry alive.
// - GEARS. LOW pulls hardest and claws the hairpins (strong accel, low ceiling);
//   HIGH carries the real top end (weak low-end, big ceiling). Downshift to get
//   out of a corner, upshift on the straights — the gear is a two-state decision
//   the whole run turns on.
// - CENTRIFUGAL FORCE. A curve pushes you OUTWARD in proportion to speed; hold
//   the line or the road leaves you and you land in the grass (where it drags),
//   and off the tarmac the roadside props flip the car.
// - A ROADSIDE HIT FLIPS THE CAR (the couple tumble out) — a heavy penalty: the
//   car spins helplessly, you nearly stop, and you pay seconds. A traffic hit is
//   lighter — you bog down. Both cost time; only the clock can end the run.
// - THE FORK decides your column, and your column decides the country.

import { buildStage, SEG_LEN, ROAD_W, LANES, laneX } from './road.js'

export const W = 512
export const H = 288
export const HORIZON = Math.round(H * 0.42)

export const HIGH_TOP = 6000            // world z-units / second
export const LOW_TOP = 2600
export const ACCEL_LOW = 2600
export const ACCEL_HIGH = 1500
export const BRAKE = 5200
export const COAST = 550
export const OFFROAD_MAX = 1500
export const OFFROAD_DRAG = 2600
export const STEER = 2.4              // lateral fraction / second at full speed
export const CENTRIF = 0.5
export const KMH = (spd) => Math.round(spd / HIGH_TOP * 305)   // face plate: HIGH top ≈ 305 km/h

export const CFG = {
    START_TIME: 24,
    brake: true,
    centrifugal: true,               // curves push you outward
    offroadDrag: true,             // grass slows you
    trafficCrash: true,            // a rear-end bog is real
    flipCrash: true,               // hitting a roadside prop spins the car
    spinLock: true,                // you cannot steer mid-spin
    gearCeil: true,                // LOW genuinely caps your top speed
    // switches the harness mutates to prove each rule is load-bearing; all true in play
}

const CAR_W = 0.42                  // traffic car half-width, in fractions of ROAD_W
const PROP_W = 0.26                 // roadside prop hit half-width
const VERGE = 2.4                 // hard edge of the drivable verge

const rand = (g) => { g._rs = (Math.imul(g._rs, 1664525) + 1013904223) >>> 0; return g._rs / 4294967296 }

export function push(g, e) { if (!g.search) g.events.push(e) }

function loadStage(g, depth, col) {
    const st = buildStage(depth, col)
    g.stage = st
    g.depth = depth
    g.col = col
    g.position = 0
    g.forkOpen = false
    g.spin = 0
    g.spinDir = 0
    g.flip = 0
    g._rs = (st.id * 2654435761 + 99991) >>> 0
    g.cars = st.cars.map((c) => ({ pos: c.f * st.length, lane: c.lane, spd: c.spd * HIGH_TOP, hue: c.hue, hit: false }))
    push(g, { type: 'stage', depth, col, id: st.id, name: st.theme.name, bonus: st.timeBonus })
}

export function makeGame(seed = 0) {
    const g = {
        seed, tick: 0,
        depth: 0, col: 0, stage: null,
        position: 0, speed: 0, playerX: 0, gear: 1,
        timeLeft: CFG.START_TIME, score: 0, dist: 0, crashes: 0, distanceKm: 0,
        spin: 0, spinDir: 0, flip: 0, offroad: false,
        forkOpen: false, forkSide: 0, stagesDone: 0,
        end: null, win: false,
        cars: [], _rs: 1, events: [],
    }
    loadStage(g, 0, 0)
    return g
}

// the hash of everything a future branch could depend on — identical scripts on
// identical seeds MUST hash identical at every tick.
export function stateHash(g) {
    let h = 0x811c9dc5
    const add = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } }
    add(`${g.tick}|${g.depth}|${g.col}|${g.position.toFixed(2)}|${g.speed.toFixed(2)}|${g.playerX.toFixed(3)}|${g.gear}|${g.timeLeft.toFixed(2)}|${g.score}|${g.crashes}|${g.spin}|${g.flip}|${g.offroad ? 1 : 0}|${g.forkSide}|${g.stagesDone}|${g._rs}|${g.end}`)
    for (const c of g.cars) add(`|c${c.pos.toFixed(1)},${c.lane},${c.spd.toFixed(1)},${c.hit ? 1 : 0}`)
    return (h >>> 0).toString(16)
}

// one crash. flip=true is a roadside tumble (hard); flip=false is a traffic bog.
function crash(g, what, flip) {
    if (g.spin > 0 || g.end) return
    g.crashes++
    if (flip && CFG.flipCrash) {
        g.speed *= 0.12
        g.spin = 54
        g.flip = 54
        g.spinDir = g.playerX >= 0 ? 1 : -1
        g.timeLeft -= 4
        g.position -= 120                       // shoved back off the prop
        push(g, { type: 'flip', what, x: g.playerX, t: g.tick })
    } else if (CFG.trafficCrash) {
        g.speed *= 0.34
        g.spin = 26
        g.spinDir = g.playerX >= 0 ? 1 : -1
        g.timeLeft -= 2
        push(g, { type: 'crash', what, x: g.playerX, t: g.tick })
    }
    if (g.timeLeft <= 0) endGame(g, false)
}

function endGame(g, win) {
    if (g.end) return
    g.end = win ? 'win' : 'dead'
    g.win = win
    if (win) g.score += Math.round(g.timeLeft * 100)     // the arcade's big finisher bonus
    push(g, { type: win ? 'win' : 'over', score: g.score, timeLeft: Math.max(0, g.timeLeft) })
}

// inp = { steer: -1|0|1, gas: bool, brake: bool, gear: 0|1 }
export function step(g, inp = {}) {
    if (g.end) return
    const dt = 1 / 60
    g.tick++
    g.timeLeft -= dt

    // ---- longitudinal ----
    const top = (CFG.gearCeil && g.gear === 0) ? LOW_TOP : HIGH_TOP
    const accel = g.gear === 0 ? ACCEL_LOW : ACCEL_HIGH
    const locked = CFG.spinLock && g.spin > 0
    if (locked) {
        g.speed -= COAST * 3 * dt
        g.spin--
        if (g.flip > 0) g.flip--
    } else {
        g.gear = inp.gear === 0 ? 0 : 1
        if (inp.gas) g.speed += accel * dt
        else g.speed -= COAST * dt
        if (inp.brake && CFG.brake) g.speed -= BRAKE * dt
    }
    g.speed = Math.max(0, Math.min(top, g.speed))

    // ---- lateral: steer against the centrifugal push of the curve ----
    const seg = g.stage.segs[Math.min(g.stage.segCount - 1, Math.floor(g.position / SEG_LEN))]
    const speedFrac = g.speed / HIGH_TOP
    if (!locked) g.playerX += (inp.steer || 0) * STEER * speedFrac * dt
    if (CFG.centrifugal) g.playerX -= seg.curve * speedFrac * CENTRIF * dt
    g.playerX = Math.max(-VERGE, Math.min(VERGE, g.playerX))

    // ---- off the tarmac the grass drags ----
    g.offroad = Math.abs(g.playerX) > 1
    if (g.offroad && CFG.offroadDrag && g.speed > OFFROAD_MAX) g.speed -= OFFROAD_DRAG * dt

    // ---- traffic ----
    for (const c of g.cars) {
        c.pos += c.spd * dt
        if (c.pos < g.position - 500) {          // fell behind: recycle to fresh traffic ahead
            c.pos = g.position + SEG_LEN * (140 + rand(g) * 90)
            c.lane = Math.floor(rand(g) * LANES)
            c.spd = (0.30 + rand(g) * 0.26) * HIGH_TOP
            c.hit = false
        }
        if (!c.hit && Math.abs(c.pos - g.position) < SEG_LEN && Math.abs(laneX(c.lane) - g.playerX) < CAR_W) {
            c.hit = true
            c.pos = g.position - 600
            crash(g, 'traffic', false)
        }
    }

    // ---- roadside props (only bite when you are actually off the racing line) ----
    if (g.spin <= 0) {
        const i0 = Math.floor(g.position / SEG_LEN)
        for (let k = 0; k <= 1; k++) {
            const s = g.stage.segs[i0 + k]
            if (!s) continue
            for (const sp of s.sprites) {
                if (sp.type === 'goal') continue
                if (Math.abs(sp.offset - g.playerX) < PROP_W) {
                    const z = (i0 + k) * SEG_LEN
                    if (Math.abs(z - g.position) < SEG_LEN * 0.7) { crash(g, sp.type, true); break }
                }
            }
            if (g.spin > 0) break
        }
    }

    // ---- forward motion + score ----
    const move = g.speed * dt
    g.position += move
    g.dist += move
    g.distanceKm = g.dist / 100000
    g.score += speedFrac * move * 0.05

    // ---- the fork island opens on the run-in to a checkpoint ----
    if (g.position > g.stage.forkFrom * SEG_LEN && g.depth < 4) g.forkOpen = true

    // ---- the checkpoint line ----
    if (g.position >= g.stage.length) {
        g.timeLeft += g.stage.timeBonus
        g.stagesDone++
        push(g, { type: 'checkpoint', depth: g.depth, col: g.col, bonus: g.stage.timeBonus, timeLeft: Math.round(g.timeLeft) })
        if (g.depth >= 4) {
            endGame(g, true)
        } else {
            g.forkSide = g.playerX < 0 ? 0 : 1        // LEFT keeps the column, RIGHT takes the harder one
            push(g, { type: 'fork', side: g.forkSide ? 'RIGHT' : 'LEFT', to: g.col + g.forkSide })
            loadStage(g, g.depth + 1, g.col + g.forkSide)
        }
    }

    if (g.timeLeft <= 0) endGame(g, false)
}
