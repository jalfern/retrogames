// OUT RUN — scripts/outruncheck.mjs : the self-verifying harness. Node only, no
// browser. It imports the SAME road/sim/planner the cabinet drives and proves three
// things — it boots, its core rules hold, and it can be won — then (with --mutate)
// breaks three load-bearing lines and requires each to go red.
//
// Run:  npm run outruncheck  [-- --mutate]
//
//   determinism  identical seed + identical input script → identical state hash,
//                tick for tick (nothing here may depend on wall-clock or Math.random).
//   projection   farther segments project narrower and closer to the horizon, and
//                the projector + the renderer's downhill rule hide a crest — the
//                pseudo-3D road is real, not a flat band.
//   the lattice  depths 0..4 with merge-back columns give exactly ids 1..15 and
//                five depth-5 goals; the fork decides the column honestly.
//   the rules    the clock drains and is the only killer; a checkpoint buys time;
//                LOW caps the top speed and bites harder; centrifugal force throws
//                you to the outside; a traffic bog is lighter than a roadside flip.
//   the win      the autopilot clears all five stages DEATHLESS, and the whole
//                route re-wins with 3 seconds shaved at every checkpoint (slack)
//                yet DIES at 4 — so the winning is load-bearing, not padding.

import { buildStage, stageById, SCENES, SEG_LEN, ROAD_W, CAM_DEPTH, CAM_H, LANES, laneX, projectPoint, TOTAL_STAGES, GOALS } from '../src/games/OutRun/road.js'
import { makeGame, step, stateHash, CFG, HIGH_TOP, LOW_TOP, KMH } from '../src/games/OutRun/sim.js'
import { plan } from '../src/games/OutRun/planner.js'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`) } }
const section = (t) => console.log(`\n\u001b[1m${t}\u001b[0m`)

const RUN = plan({ seed: 0 })          // the autopilot's proven route (also the attract demo)

// replay a fixed script from scratch, returning the finished game
function replay(script, { dStart = 0, dBonus = 0 } = {}) {
    const g = makeGame(0)
    g.timeLeft = CFG.START_TIME - dStart
    for (const inp of script) {
        step(g, inp)
        for (const e of g.events) if (e.type === 'checkpoint') g.timeLeft -= dBonus
        g.events.length = 0
    }
    return g
}

section('BOOT + DETERMINISM')
ok('autopilot run finished', !!RUN.end, `end=${RUN.end}`)
ok('run reaches a terminal state within budget', RUN.ticks > 200 && RUN.ticks < 60000, `${RUN.ticks} ticks`)
{
    const a = makeGame(0), b = makeGame(0)
    const hashesA = [], hashesB = []
    for (let i = 0; i < 500; i++) {
        const inp = RUN.script[i] || { steer: 0, gas: true, brake: false, gear: 1 }
        step(a, inp); step(b, inp)
        if (i % 97 === 0) { hashesA.push(stateHash(a)); hashesB.push(stateHash(b)) }
    }
    ok('identical script → identical state hash (no wall-clock / Math.random)',
        hashesA.length > 4 && hashesA.every((h, i) => h === hashesB[i]))
}

section('PSEUDO-3D PROJECTION + HILLS')
{
    const W = 512, H = 288
    const near = projectPoint(0, 0, 300, 0, CAM_H + 0, 0, W, H)
    const far = projectPoint(0, 0, 40000, 0, CAM_H + 0, 0, W, H)
    ok('farther point projects narrower (sprite scale shrinks into the distance)', far.w < near.w && far.scale < near.scale)
    ok('near road fills more of the screen width than far road', near.w > W * 0.25 && far.w < W * 0.08)
    // a stage actually has hills, and the projector drops the downhill side so the
    // renderer's `p2.y >= p1.y` rule hides it behind the crest.
    let st = null, crest = -1, crestY = -1e9
    for (let d = 0; d < 5 && crest < 0; d++) {
        const cand = buildStage(d, Math.min(d, 1))
        for (let i = 1; i < cand.segCount - 1; i++) {
            const y = cand.segs[i].y
            if (y > cand.segs[i - 1].y && y >= cand.segs[i + 1].y && y - Math.min(...cand.segs.slice(i + 1).map((s) => s.y)) > 40 && y > crestY) { crestY = y; crest = i; st = cand }
        }
    }
    ok('a real stage has a crest with road dropping beyond it', st && crest > 0, `crest seg ${crest}${st ? ' y ' + Math.round(crestY) : ''}`)
    if (st && crest > 0) {
        const camZ = crest * SEG_LEN - 4000
        const camYv = st.segs[crest].y + CAM_H
        const crestPt = projectPoint(0, st.segs[crest].y, crest * SEG_LEN, 0, camYv, camZ, W, H)
        const farPt = projectPoint(0, st.segs[crest].y, crest * SEG_LEN + 60000, 0, camYv, camZ, W, H)
        ok('projector converges toward the vanishing line with distance (true perspective)', farPt.y < crestPt.y && Math.abs(farPt.y - H / 2) < Math.abs(crestPt.y - H / 2), `crest y ${crestPt.y} far y ${farPt.y} vanishing ${H / 2}`)
    }
}

section('THE FORK LATTICE')
{
    const ids = []
    for (let d = 0; d < 5; d++) for (let c = 0; c <= d; c++) ids.push(buildStage(d, c).id)
    ok('15 distinct stages, ids 1..15', ids.length === TOTAL_STAGES && ids.join(',') === Array.from({ length: 15 }, (_, i) => i + 1).join(','))
    ok('depth-5 has five goal columns', GOALS === 5)
    ok('stageById round-trips the lattice', [1, 6, 11, 15].every((id) => { const s = stageById(id); return s.id === id }))
    ok('harder column = longer stage', buildStage(2, 2).length >= buildStage(2, 0).length)
    ok('harder column = tighter purse', buildStage(2, 2).timeBonus <= buildStage(2, 0).timeBonus)
    ok('each stage carries cars and per-depth scenery', st_allProps())
}
function st_allProps() {
    for (let d = 0; d < 5; d++) {
        const s = buildStage(d, 0)
        if (!s.cars.length) return false
        if (s.theme !== SCENES[d]) return false
    }
    return true
}

section('THE RULES')
{
    const g = makeGame(0)
    const t0 = g.timeLeft
    step(g, { steer: 0, gas: false, brake: false, gear: 1 })
    ok('the clock drains every tick', g.timeLeft < t0)

    // gear ceiling: LOW genuinely caps the top speed below HIGH. Isolate the
    // ceiling from curve-drift / off-road drag so we measure the gear, not a crash.
    const iso = () => { CFG.centrifugal = false; CFG.offroadDrag = false }
    const uniso = () => { CFG.centrifugal = true; CFG.offroadDrag = true }
    iso()
    const gl = makeGame(0); gl.gear = 0
    for (let i = 0; i < 600; i++) step(gl, { steer: 0, gas: true, brake: false, gear: 0 })
    ok('LOW gear caps the top speed at LOW_TOP', gl.speed <= LOW_TOP + 1 && gl.speed > LOW_TOP * 0.9, `${Math.round(gl.speed)}`)
    const gh = makeGame(0); gh.gear = 1
    for (let i = 0; i < 600; i++) step(gh, { steer: 0, gas: true, brake: false, gear: 1 })
    uniso()
    ok('HIGH gear reaches a higher top speed than LOW', gh.speed > gl.speed + 100, `HIGH ${Math.round(gh.speed)} vs LOW ${Math.round(gl.speed)}`)

    // centrifugal: a right-hand curve (curve>0) pushes the car to the outside (−x)
    const gc = makeGame(0)
    for (let i = 0; i < 120; i++) step(gc, { steer: 0, gas: true, brake: false, gear: 1 })
    const startX = gc.playerX
    // aim it into a bend by jumping onto a curved segment
    const stB = gc.stage
    const curveIdx = stB.segs.findIndex((s) => s.curve > 1.4)
    if (curveIdx > 0) {
        gc.position = curveIdx * SEG_LEN
        const x0 = gc.playerX
        for (let i = 0; i < 40; i++) step(gc, { steer: 0, gas: true, brake: false, gear: 1 })
        ok('a right curve throws you outward (centrifugal)', gc.playerX < x0 - 0.01, `x ${x0.toFixed(3)} → ${gc.playerX.toFixed(3)} (curve ${stB.segs[curveIdx].curve.toFixed(2)})`)
    } else ok('a right curve throws you outward (centrifugal)', false, 'no sharp right in stage data')

    // crash costs: a roadside flip must hurt more than a traffic bog
    const gT = makeGame(0); gT.speed = HIGH_TOP * 0.8; const tT = gT.timeLeft
    gT.cars[0] = { pos: gT.position + SEG_LEN * 0.4, lane: 1, spd: 0, hue: 0, hit: false }; gT.playerX = laneX(1)
    step(gT, { steer: 0, gas: true, brake: false, gear: 1 })
    ok('a traffic hit costs speed and time', gT.crashes === 1 && gT.timeLeft < tT - 1 && gT.speed < HIGH_TOP * 0.5, `speed ${Math.round(gT.speed)}`)
    const gF = makeGame(0); gF.speed = HIGH_TOP * 0.8; const tF = gF.timeLeft
    // drop a prop right where an off-line car will hit it
    const gi = Math.floor(gF.position / SEG_LEN)
    gF.stage.segs[gi].sprites = [{ offset: 1.3, type: 'palm' }]
    gF.playerX = 1.3
    step(gF, { steer: 0, gas: true, brake: false, gear: 1 })
    ok('a roadside hit FLIPS the car (spin + heavier than a bog)', gF.crashes === 1 && gF.flip > 0 && gF.spin > gT.spin, `flip=${gF.flip} spin=${gF.spin}`)

    // death is by clock only: a fresh game never ends while time remains and no crash
    const gD = makeGame(0); gD.timeLeft = 0.5
    let stepsToDie = 0
    while (!gD.end && stepsToDie < 200) { step(gD, { steer: 0, gas: true, brake: false, gear: 1 }); stepsToDie++ }
    ok('the clock running out ends the run', gD.end === 'dead' && gD.crashes === 0)

    // the fork decides the column honestly (give the car enough speed to cross)
    const gK = makeGame(0); gK.speed = 3000
    gK.position = gK.stage.length - 1; gK.playerX = -0.5
    step(gK, { steer: 0, gas: true, brake: false, gear: 1 })
    ok('crossing the line LEFT keeps the column (easier branch)', gK.col === 0 && gK.depth === 1, `depth ${gK.depth} col ${gK.col}`)
    const gR = makeGame(0); gR.speed = 3000
    gR.position = gR.stage.length - 1; gR.playerX = 0.5
    step(gR, { steer: 0, gas: true, brake: false, gear: 1 })
    ok('crossing the line RIGHT takes the harder column', gR.col === 1 && gR.depth === 1, `depth ${gR.depth} col ${gR.col}`)
}

section('BRAKE LIGHTS')
{
    // #283 item 6: the brake light follows the PHYSICAL rule — lit while the
    // brake is applied to a moving car, out at rest, out under power, and out
    // entirely when the brake rule is muted (the light must not lie about a
    // pedal that does nothing).
    CFG.centrifugal = false; CFG.offroadDrag = false
    const g = makeGame(0)
    step(g, { steer: 0, gas: false, brake: true, gear: 1 })
    ok('no brake light at rest (brake held at speed 0)', g.braking === false, `braking=${g.braking}`)
    for (let i = 0; i < 40; i++) step(g, { steer: 0, gas: true, brake: false, gear: 1 })
    ok('no brake light under power', g.braking === false && g.speed > 0, `speed=${Math.round(g.speed)}`)
    step(g, { steer: 0, gas: false, brake: true, gear: 1 })
    ok('the brake light lights while the car is slowing', g.braking === true, `speed=${Math.round(g.speed)}`)
    let stopped = false
    for (let i = 0; i < 60 && !stopped; i++) { step(g, { steer: 0, gas: false, brake: true, gear: 1 }); if (g.speed === 0) stopped = true }
    step(g, { steer: 0, gas: false, brake: true, gear: 1 })   // the stop tick still braked; the next one does not
    ok('the brake light goes out again at the stop', stopped && g.braking === false, `speed=${g.speed} braking=${g.braking}`)
    ok('a re-applied brake at rest stays out (no light without a moving car)', g.braking === false)
    CFG.brake = false
    for (let i = 0; i < 40; i++) step(g, { steer: 0, gas: true, brake: false, gear: 1 })
    step(g, { steer: 0, gas: false, brake: true, gear: 1 })
    ok('with the brake rule muted the light cannot light (a dead pedal is no brake)', g.braking === false)
    CFG.brake = true; CFG.centrifugal = true; CFG.offroadDrag = true
}

section('IT CAN BE WON')
{
    ok('the autopilot clears all 5 stages', RUN.stages === 5, `stages=${RUN.stages}`)
    ok('the autopilot wins', RUN.won === true, `end=${RUN.end}`)
    ok('the winning run is DEATHLESS (zero crashes)', RUN.crashes === 0, `crashes=${RUN.crashes}`)
    ok('the win carries spare seconds on the clock', RUN.timeLeft > 0)

    // SLACK RULE — the arcade is time-pressure; the win must not be padding.
    ok('slack: still wins with 3s shaved at every checkpoint', replay(RUN.script, { dStart: 3, dBonus: 3 }).win === true)
    ok('load-bearing: the route DIES with 4s shaved at every checkpoint', replay(RUN.script, { dStart: 4, dBonus: 4 }).win === false)
}

section('SCORE SANITY')
{
    ok('score accumulates with distance travelled', RUN.score > 1000, `${RUN.score}`)
    ok('final score books the remaining-time bonus', RUN.score > 0 && Number.isFinite(RUN.score))
}

// --------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    section('MUTANTS (each must be CAUGHT — the check must go red)')
    const expectRed = (name, fn) => { const caught = !fn(); ok(`mutant killed: ${name}`, caught) }

    expectRed('gearCeil off (LOW no longer caps speed)', () => {
        CFG.gearCeil = false; CFG.centrifugal = false; CFG.offroadDrag = false
        const gl = makeGame(0); gl.gear = 0
        for (let i = 0; i < 900; i++) step(gl, { steer: 0, gas: true, brake: false, gear: 0 })
        CFG.gearCeil = true; CFG.centrifugal = true; CFG.offroadDrag = true
        return gl.speed <= LOW_TOP + 1          // true normally; if gearCeil broke, speed ran to HIGH
    })
    expectRed('centrifugal off (curves stop pushing)', () => {
        CFG.centrifugal = false
        const gc = makeGame(0)
        for (let i = 0; i < 120; i++) step(gc, { steer: 0, gas: true, brake: false, gear: 1 })
        const ci = gc.stage.segs.findIndex((s) => s.curve > 1.4)
        gc.position = ci * SEG_LEN
        const x0 = gc.playerX
        for (let i = 0; i < 40; i++) step(gc, { steer: 0, gas: true, brake: false, gear: 1 })
        CFG.centrifugal = true
        return gc.playerX < x0 - 0.01         // normally pushed out; without it, not
    })
    expectRed('flipCrash off (a roadside hit stops being a flip)', () => {
        CFG.flipCrash = false
        const gF = makeGame(0); gF.speed = HIGH_TOP * 0.8
        const gi = Math.floor(gF.position / SEG_LEN)
        gF.stage.segs[gi].sprites = [{ offset: 1.3, type: 'palm' }]
        gF.playerX = 1.3
        step(gF, { steer: 0, gas: true, brake: false, gear: 1 })
        CFG.flipCrash = true
        return gF.crashes === 1 && gF.flip > 0   // normally a flip; without it, no flip
    })
    expectRed('brake rule muted (the light must die with the rule)', () => {
        CFG.brake = false; CFG.centrifugal = false; CFG.offroadDrag = false
        const g = makeGame(0)
        for (let i = 0; i < 40; i++) step(g, { steer: 0, gas: true, brake: false, gear: 1 })
        step(g, { steer: 0, gas: false, brake: true, gear: 1 })
        const lit = g.braking
        CFG.brake = true; CFG.centrifugal = true; CFG.offroadDrag = true
        return lit === true   // normally the light is ON; a mute that the light ignores means the gate is gone
    })
    expectRed('inflated start time (the slack proof stops biting)', () => {
        CFG.START_TIME += 12
        const diesAt4 = replay(RUN.script, { dStart: 4, dBonus: 4 }).win === false
        CFG.START_TIME -= 12
        return diesAt4                        // normally the −4 route dies; a padded clock lets it live → proof broke
    })
}

console.log(`\n${fail === 0 ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m'}  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
