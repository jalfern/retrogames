// RACCOON HEIST — the check that actually plays the game.
//
//   npm run heistplay          (needs `npm run dev` on :5173)
//
// `heistcheck` audits the map and the stealth maths in Node with no browser. That
// proves the level *can* be played. This file proves it *is*: it boots the real bundle
// in Chrome, starts job 1, and drives it through the DEV hook — walking with the
// thumbstick value, picking loot up, carrying it to the cart, chewing a vault lock,
// getting spotted, getting caught, getting rescued, and getting out the gate.
//
// Why a scripted play-through and not a screenshot: every bug this file has caught
// looked perfect in a still frame. A camera inside a wall looks like a moody brick
// texture. A guard who cannot see you looks like a guard. A cart that will not accept
// loot looks like a cart. Only time and a deterministic poke find them.
//
// Rules this driver obeys, because a harness that cheats proves nothing:
//   * movement happens by writing a thumbstick value, exactly like a thumb — never by
//     assigning a position, except where a test is *about* placement (pickup radius),
//     and those say so in the check name;
//   * every assertion reads state back out of the sim, never out of a variable the
//     driver itself set;
//   * `near()` is printed whenever a spatial check fails, so a failure names the
//     geometry that caused it instead of just failing.

import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openGame, launch, requireDevServer, opt, Report, throttleCPU } from './lib/harness.mjs'

const URL0 = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1')
// The CI runner rasterises in software. At 1100x700 with antialiasing and shadow maps it
// was measured at **1 fps** (`sim clock 0.14x real time at 1 fps` in the job log), which is
// under the floor every timing-shaped assumption in this file needs — the camera never
// settles, a chew yields three lock samples, and the whole suite starts describing the
// runner. So on CI the page is asked for its documented lite path (`?lite=1`: no MSAA, no
// shadows, pixel ratio 1 — see the note in `index.jsx`) and a third of the pixels. Neither
// removes anything from the scene graph, so "the cast is a visible mesh" and "every verb has
// a body" mean exactly as much there as here. Locally, nothing changes.
const LITE = process.env.HEIST_LITE ? process.env.HEIST_LITE !== '0' : !!process.env.CI
const VIEW = LITE ? { width: 640, height: 426 } : { width: 1100, height: 700 }
const URL = URL0 + (LITE ? (URL0.includes('?') ? '&' : '?') + 'lite=1' : '')
const JOB = +opt(process.argv, '--job', 0)
const SHOT = opt(process.argv, '--shot', 'scripts/.shots/h20-play.png')
// `--throttle 8` reproduces a GitHub runner on a laptop. Without it every timing-shaped
// check here passes at 60 fps on the machine it is written on and reds on CI, which is
// the worst way for a check to fail: green where it is looked at most often.
const THROTTLE = +opt(process.argv, '--throttle', 0)

await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: VIEW })
if (THROTTLE) await throttleCPU(page, THROTTLE)
const r = new Report('heistplay')
console.log(`  ..  ${VIEW.width}x${VIEW.height}${LITE ? ' — lite pipeline (no MSAA, no shadows): the CI runner draws 1 fps any other way' : ''}`)
const T = (ms) => page.waitForTimeout(ms)
const api = (fn, ...args) => page.evaluate(fn, ...args)

/**
 * Sleeps in **world seconds**, not wall seconds.
 *
 * This driver asserts things like "spotted within 1.1 s" and "a rescue takes under 4 s",
 * and those are statements about the game's clock. If the machine cannot hold 60 fps the
 * sim runs slower than the wall — the fixed-timestep loop caps its catch-up on purpose, so
 * a backgrounded tab skips time instead of fast-forwarding guards — and a driver asleep on
 * `setTimeout` then measures the runner instead of the game. That is exactly how this file
 * produced ten red checks on CI while being green locally: `a thumb walks the raccoon
 * 0.46 m`, `the vault door does not swing`, `a rescue takes 15.7 s`.
 *
 * So the page keeps a running estimate of its own sim rate (`elapsed` over real time) and
 * every wait is converted through it. On a box that keeps real time the factor is 1 and
 * nothing changes; on a throttled box the driver just gets patient.
 */
await api(() => {
    window.__simRate = 1
    window.__simLast = null
    window.__frames = 0
    window.__fps = 0
    ;(function count(t) {
        window.__frames++
        if (window.__fpsLast) {
            const dt = (t - window.__fpsLast) / 1000
            if (dt > 0.05) window.__fps = window.__fps * 0.7 + (1 / dt) * 0.3
        }
        window.__fpsLast = t
        requestAnimationFrame(count)
    })(performance.now())
    window.__sample = () => ({ sim: window.__heistTest?.state()?.sim?.elapsed ?? 0, wall: performance.now() / 1000, frames: window.__frames })
    // The job's own clock. Any check that says "in under N seconds" means game seconds:
    // on a box that cannot hold 60 fps the wall is a different clock, and measuring the
    // wall means measuring the runner.
    window.__gameTime = () => window.__heistTest?.engine()?.st?.elapsed ?? 0
    window.__simSleep = async (secs) => {
        const now = performance.now()
        const s = window.__heistTest?.state()?.sim?.elapsed ?? 0
        if (window.__simLast && s > window.__simLast.s) {
            const dw = (now - window.__simLast.w) / 1000
            if (dw > 0.04) {
                const inst = (s - window.__simLast.s) / dw
                window.__simRate = window.__simRate * 0.6 + inst * 0.4
            }
        }
        window.__simLast = { s, w: now }
        const wall = Math.max(150, (1000 * secs) / Math.min(4, Math.max(0.05, window.__simRate)))
        await new Promise(res => setTimeout(res, wall))
        return wall
    }
})
/** Node-side twin of `__simSleep`: wait for `secs` of world time. */
const sleep = async (secs) => {
    const rate = await api(() => Math.min(4, Math.max(0.05, window.__simRate || 1)))
    return T(Math.max(150, (1000 * secs) / rate))
}
/**
 * Measure the clock. Returns `{rate, fps}`: world seconds advanced per wall second, and
 * the frame rate that produced it. This is the number that was silently 0.33 on CI — the
 * sim was running at a third speed and every check in seconds blamed the game.
 */
const clock = async (wallMs = 1200) => {
    const a = await api(() => window.__sample())
    await T(wallMs)
    const b = await api(() => window.__sample())
    const dw = b.wall - a.wall
    return {
        rate: dw > 0 ? +((b.sim - a.sim) / dw).toFixed(2) : 1,
        fps: dw > 0 ? Math.round((b.frames - a.frames) / dw) : 0,
    }
}

/**
 * Below 4 fps this machine cannot answer a single question in seconds, and pretending
 * otherwise is how a 3 fps runner once filed twenty-one red checks against the stealth
 * model: the driver teleported into a torch beam, the guard only redraws once per frame
 * (0.33 m of arc at 3 fps), the meter never left zero, nobody got spotted, so nobody got
 * bagged, so the pound was empty for the rescue section, so the job busted before the cart
 * section — and every one of those reads as a game bug. So: re-measure at each section
 * boundary (`pace`), and let `claim` downgrade a FAILURE to a SKIP once the floor has been
 * breached. Structural checks — does this verb have a mesh, is this cell solid — are never
 * downgraded, because a slow box still answers those correctly. The skip line says exactly
 * which machine failed to answer, and the tally counts them, so a green run states what it
 * did not look at.
 */
// Set from THE CLOCK below (`seeClock`), because the clock can only be measured after
// the job has been started — and a claim made before that measurement is a claim about a
// machine nobody sampled yet, which is how a slow runner files twenty red bugs.
let SLOW = 0
// The frame rate the last `pace()` actually measured, kept apart from SLOW because a
// section can need a HIGHER floor than the global one. BEING SEEN has to catch three
// consecutive "I see you" samples 80 ms apart before its stopwatch may start; below about
// 8 fps it cannot stage its own premise, and a check that cannot set up its experiment has
// no business reporting a verdict about the thing under test.
let PACE_FPS = 60
const claim = (label, pass, detail = '', floor = 4) => (!pass && PACE_FPS < floor)
    ? r.skip(label, `${detail} — not a verdict: the runner was at ${PACE_FPS} fps, under this check's ${floor} fps floor`)
    : r.check(label, pass, detail)
const pace = async () => {
    const c = await clock(700)
    if (c.fps) PACE_FPS = c.fps
    if (c.fps && c.fps < 4) SLOW = c.fps
    return c
}
const floorClaim = () => { if (clk.fps && clk.fps >= 4 && SLOW) clk = { fps: SLOW, rate: 0 } ; return SLOW }

// `press` leaves attract -> brief -> play, with the level mounted in between.
const press = async (secs = 0.28) => { await api(() => window.__heistTest.press()); await sleep(secs) }

/**
 * Verbs observed with a body attached, gathered as the run goes on and audited at the
 * end against the list scraped out of `focus()`. Every interaction the sim offers must
 * have a mesh where the verb points: the pound asked for `CHEW ULTRA LOOSE` with no
 * lock drawn anywhere, and the only cue was a line of HUD text (playtest: "I don't see a
 * lock"). Collecting the observations along the way means no new teleport-course is
 * pretending to be a play-through, and the coverage gate at the bottom is what stops a
 * future verb from shipping without one.
 */
const verbs = []
/** Stand somewhere, ask what the button would do, and whether you can SEE that thing. */
const affordAt = async (tag, x, z, wantKind) => {
    const a = await api(async ([px, pz]) => {
        const t = window.__heistTest
        t.moveTo(px, pz)
        await window.__simSleep(0.25)
        return t.afford()
    }, [x, z])
    if (!a || !a.kind) {
        r.check(`${tag}: the sim offers a verb here`, false, `afford() -> ${JSON.stringify(a)}`)
        verbs.push({ tag, kind: null, ok: false })
        return a
    }
    verbs.push({ ...a, tag, want: a.want })
    const seen = (a.near || []).map(m => `${m.mat} ${m.d}m`).join(', ') || 'nothing in 2.5 m'
    r.check(`${tag}: "${a.kind}" has a body you can see`, a.ok === true,
        a.hit === null ? `no ${a.want ? `"${a.want}" mesh` : 'mesh'} within ${a.tol} m — ${seen}` : `${a.hit} m to "${(a.near[0] || {}).mat}" (wanted ${a.want || 'any mesh'})`)
    if (wantKind) r.check(`${tag}: the verb is "${wantKind}"`, a.kind === wantKind, `sim offered "${a.kind}" — ${a.label}`)
    return a
}

console.log('\nATTRACT')
const boot = await api(() => window.__heistTest.state())
r.check('hook answers', !!boot, JSON.stringify({ screen: boot.screen, touch: boot.touch }))
r.check('attract is the first screen', boot.screen === 'attract', boot.screen)

await press()
const brief = await api(() => window.__heistTest.state())
r.check('a key opens the briefing', brief.screen === 'brief', brief.screen)

const perf = await api(() => window.__heistTest.info())
r.check('world mounted for the briefing', perf.calls > 0, `${perf.calls} draw calls`)
// Budget split in two, because the two halves have different physics. Static geometry
// is merged at build time and must stay tiny; the cast is an articulated hierarchy of
// small meshes that cannot be batched without skinning, so it has its own ceiling. One
// combined number would let a 400-mesh level hide behind a 20-mesh guard, or vice versa.
// The static level's own mesh count, measured on the world group rather than on total
// draw calls: at the brief the cast is already on stage, and a total would punish the
// rig for existing. What batching buys is a *level* of a few dozen meshes, so that is
// what gets pinned.
const levelMeshes = await api(() => {
    let n = 0
    window.__heistTest.world().group.traverse(o => { if (o.isMesh) n++ })
    return n
})
r.check('level geometry stays batched', levelMeshes <= 50, `${levelMeshes} meshes for a whole job (${perf.calls} calls, ${perf.progs} programs)`)
r.check('triangle budget is sane', perf.tris > 2000 && perf.tris < 900000, `${perf.tris} tris`)

// The brief screen is a drone orbit: prove the establishment shot exists, because a
// menu that renders nothing is a black rectangle and everybody assumes their monitor.
const drone = await api(() => window.__heistTest.probe())
r.check('drone shot is high over the job', drone.camY > 8, `camY=${drone.camY}`)

await press(0.4)
const play = await api(() => window.__heistTest.state())
r.check('a second key starts the job', play.screen === 'play', play.screen)
const p0 = await api(() => window.__heistTest.probe())
r.check('phase is play', p0.phase === 'play', p0.phase)
console.log('\nTHE CLOCK')
// The world has to run at one second per second. A fixed-timestep loop capped at five
// ticks per frame simulates 83 ms of world per frame, so below ~12 fps the whole heist
// goes into slow motion — guards, torch timers, the job clock — and `heistplay`, waiting
// on `setTimeout`, reported that as ten red checks about the *game* while the laptop was
// green. The cap is now 250 ms (real time down to 4 fps), and this is the measurement
// that says whether the box running this can be trusted to answer any timing question:
// `node scripts/heistclock.mjs` sweeps the same ratio across CPU throttles.
const clk = await clock()
PACE_FPS = clk.fps || 60
SLOW = clk.fps && clk.fps < 4 ? clk.fps : 0
r.info('sim clock', `${clk.rate}x real time at ${clk.fps} fps${THROTTLE ? ` (CPU throttled ${THROTTLE}x)` : ''}`)
if (clk.fps >= 4) {
    // 0.75, not 0.95: the number this exists to catch is **0.14x** (the CI runner before
    // the catch-up cap was raised) and the old five-tick clamp measured 0.59x @ 7 fps, so
    // the line has to sit between "catastrophically slow-motion" and "a machine sampling a
    // 6 fps frame budget". Raising it to 0.9 would only make this check about the laptop it
    // was written on, which is the exact disease.
    r.check('the sim keeps real time at this frame rate', clk.rate > 0.75,
        `the world ran at ${clk.rate}x real time at ${clk.fps} fps — the catch-up cap in index.jsx has to give below ~4 fps, and every check in seconds becomes a measurement of the machine`)
} else {
    r.info('frame rate under the 4 fps floor', `${clk.fps} fps — clock ratio ${clk.rate}x reported, not asserted`)
}
// The camera dives from the drone shot to the shoulder rig over about a second of *game*
// time. On a slow box the previous sample lands mid-dive and reports d=2.1 y=5.3 (buried,
// too high) for the wrong reason. Wait for the dive to finish in world time, then measure.
await sleep(0.8)
const pCam = await api(() => window.__heistTest.probe())
r.check('the camera is not in a wall', pCam.camDist >= 2.08 && pCam.camY > 1.4, `d=${pCam.camDist} y=${pCam.camY} (the rig's own floor is MINVIEW 2.1 m; asserting "not inside geometry", which is the contract, not one tuning accident)`)
r.check('the raccoon is on screen', Math.abs(pCam.ndc[0]) < 0.75 && Math.abs(pCam.ndc[1]) < 0.75, `ndc=${pCam.ndc}`)
r.check('the camera is not buried in geometry at spawn', (await api(() => window.__heistTest.camClear())).inside === false, JSON.stringify(await api(() => window.__heistTest.camClear())))
r.check('the raccoon stands on walkable ground', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(pCam.cell), pCam.cell)
r.check('the camera looks into the level, not at a wall', pCam.cell === 'FLOOR' || pCam.cell === 'MARBLE', pCam.cell)
if (!(Math.abs(pCam.ndc[0]) < 0.75 && pCam.camDist > 2.2)) {
    console.log('  ..  nearest geometry to the raccoon:', JSON.stringify(await api(() => window.__heistTest.near(8))))
}

console.log('\nTHE CAST EXISTS')
// A check that only reads numbers will happily certify an empty stage. This one asks
// whether the raccoon you control is a mesh, whether it is in the rendered scene graph,
// and whether it lands inside the frame — which is how "the crew was built, simulated,
// audited and never added to the scene" gets caught instead of shipped.
const cast = await api(() => {
    const t = window.__heistTest
    const eng = t.engine()
    let meshes = 0
    let inScene = false
    if (eng) {
        inScene = eng.group.parent != null
        eng.group.traverse(o => { if (o.isMesh) meshes++ })
    }
    const actor = eng ? eng.activeCrew.mesh : null
    let screen = null
    if (actor) {
        actor.updateWorldMatrix(true, false)
        const p = actor.localToWorld(new actor.position.constructor(0, 0.55, 0))
        // A position constructor that is not a Vector3 still carries x/y/z, which is all
        // the projection needs; three is right there in the page, no import dance.
        screen = { at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], visible: actor.visible, parented: !!actor.parent }
    }
    return { inScene, meshes, screen, drawn: t.info().calls, tris: t.info().tris }
})
r.check('the cast is mounted in the scene graph', cast.inScene, 'engine.group has no parent')
r.check('the cast has geometry', cast.meshes > 150, `${cast.meshes} meshes`)
r.check('the raccoon you control is a visible mesh', !!cast.screen && cast.screen.visible && cast.screen.parented, JSON.stringify(cast.screen))
r.check('geometry is actually being drawn', cast.drawn > 20 && cast.tris > 3000, `${cast.drawn} calls / ${cast.tris} tris`)
r.check('the cast stays inside its mobile budget', cast.drawn <= 280, `${cast.drawn} calls with the cast on stage`)

console.log('\nMOVE')
// Thumb forward, in the direction the camera is already facing. This is the *only* way
// the driver moves the raccoon by walking: a stick value, like a thumb.
const walked = await api(async () => {
    const t = window.__heistTest
    const before = t.probe()
    // thumb up = stick down in screen space; see WHICH WAY for the whole argument
    t.stick(0, -1)
    await window.__simSleep(1.1)
    t.stick(0, 0)
    const after = t.probe()
    return { before, after, d: Math.hypot(after.x - before.x, after.z - before.z) }
})
r.check('a thumb on the stick walks the raccoon', walked.d > 0.9, `${walked.d.toFixed(2)} m moved`)
r.check('walking never enters solid rock', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(walked.after.cell), walked.after.cell)
r.check('the camera follows', Math.hypot(walked.after.ndc[0], walked.after.ndc[1]) < 1.1, `ndc=${walked.after.ndc}`)
r.check('stamina spent and came back', walked.after.wind > 0.2, `wind=${walked.after.wind}`)
void T

console.log('\nTHE HELP SCREEN TELLS THE TRUTH')
// The pause card promised "B / E: fling a shiny" and "F: crouch". B did nothing, E
// grabbed, and F lured. A player who believes an arcade help screen and finds the keys
// do not work does not file a bug report about key bindings -- they conclude the game is
// broken and leave. So the promise and the implementation get diffed here, in Node, on
// every run: whatever `games.js` advertises must exist in the engine's one key table.
const fs = await import('node:fs')
const shell = fs.readFileSync('src/games/RaccoonHeist/index.jsx', 'utf8')
const registry = fs.readFileSync('src/config/games.js', 'utf8')
const table = shell.slice(shell.indexOf('const KEYMAP = {'), shell.indexOf('const HELD_LABEL'))
const handled = new Set([...table.matchAll(/'(Key[A-Z]|Space|Tab|Escape|ShiftLeft|ShiftRight|ControlLeft|Arrow\w+)'/g)].map(m => m[1]))
for (const extra of shell.matchAll(/k\.has\('(Key[A-Z]|Space|Tab|Escape|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Arrow\w+)'\)/g)) handled.add(extra[1])
for (const arr of ['CROUCH_KEYS', 'DASH_KEYS']) {
    const m = shell.match(new RegExp(`const ${arr} = \\[([^\\]]*)\\]`))
    if (m) for (const c of m[1].matchAll(/'(Key[A-Z]|ShiftLeft|ShiftRight|ControlLeft|ControlRight)'/g)) handled.add(c[1])
}
const alias = { A: 'KeyA', B: 'KeyB', C: 'KeyC', D: 'KeyD', E: 'KeyE', F: 'KeyF', G: 'KeyG', Q: 'KeyQ', R: 'KeyR', S: 'KeyS', W: 'KeyW', X: 'KeyX', Z: 'KeyZ', SPACE: 'Space', TAB: 'Tab', ESC: 'Escape', SHIFT: 'ShiftLeft', CTRL: 'ControlLeft' }
const advertised = []
const heist = registry.slice(registry.indexOf("label: 'RACCOON HEIST'"))
for (const line of heist.slice(0, heist.indexOf(']')).matchAll(/'([^']+)'/g)) {
    const [left] = line[1].split(':')
    for (const tok of left.split(/[\/·,]/).map(t => t.trim().toUpperCase())) {
        if (alias[tok]) advertised.push([tok, alias[tok], line[1]])
    }
    if (/WASD/i.test(left)) for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) advertised.push([k, k, line[1]])
    if (/arrow/i.test(left)) for (const k of ['ArrowLeft', 'ArrowRight']) advertised.push([k, k, line[1]])
}
r.check('the registry advertises keys at all', advertised.length >= 10, `${advertised.length} advertised keys`)
const lies = advertised.filter(([, code]) => !handled.has(code))
r.check('every advertised key actually does something', lies.length === 0, lies.map(l => `${l[0]} (in "${l[2].slice(0, 38)}…")`).join(', '))
r.check('the key table is the only place keys are written', !/e\.code === 'Key[A-Z]'/.test(shell.split('const onKeyDown')[1].split('const onKeyUp')[0]), 'a hard-coded e.code branch survived the table')

console.log('\nWHICH WAY IS RIGHT')
// "Controls are inverted" is the one bug class a screenshot cannot show and a
// distance-over-time check cannot catch: the raccoon moved, the check went green, and
// right was left for the entire session. So the camera gets pinned to a known yaw and the
// WORLD AXIS gets asserted.
//
// Two conventions had to be pinned down to write this honestly:
//   - the pad speaks screen coordinates (thumb-up is negative DOM y) and `index.jsx`
//     negates it into engine forward. The first draft of this test pushed stick(0, 1)
//     meaning "forward" and the engine correctly walked backwards. A driver that lies
//     about its own input teaches you nothing about the game.
//   - at camYaw = 0 the camera sits at LOWER z than the raccoon and looks toward +Z
//     (three.js cameras look down their own -Z; screen-right is therefore -X).
//
// Screen coordinates are useless as a ruler here: the camera follows the raccoon and
// keeps it centred, so the raccoon's ndc never moves no matter which way it walks.
const dirs = await api(async () => {
    const t = window.__heistTest
    // ms, but world ms: see `__simSleep` at the top of this file.
        const sleep = ms => window.__simSleep(ms / 1000)
    /** Thumb input in the player's frame of reference: +y is "toward the top of the screen". */
    const thumb = (rx, ryUp) => t.stick(rx, -ryUp)
    t.setCam(0, 0.55, 9)
    await sleep(300)
    const run = async (rx, ryUp, ms) => {
        const a = t.probe()
        thumb(rx, ryUp)
        await sleep(ms)
        thumb(0, 0)
        await sleep(120)
        const b = t.probe()
        return {
            dx: +(b.x - a.x).toFixed(2), dz: +(b.z - a.z).toFixed(2),
            // Report the camera the test *thinks* it pinned. Half of every "controls are
            // inverted" report is really "the camera swung round and the test never
            // noticed", which is also why `start()` faces the open side of the level.
            yaw: b.camYaw, camAt: b.camAt, at: [a.x, a.z], moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2),
        }
    }
    const right = await run(1, 0, 700)
    const left = await run(-1, 0, 700)
    const fwd = await run(0, 1, 700)
    const back = await run(0, -1, 700)
    // Expectations are computed from the camera the rig actually ended up on, not from
    // the yaw this test asked for. The rig is allowed to slide around a corner (it has to,
    // or it clips through brick), and a direction test that assumes the pin held fails
    // intermittently for a reason that is not a bug. What must hold is: forward is along
    // the view, right is 90 degrees clockwise of it, and they never swap.
    const eff = fwd.yaw
    return {
        eff,
        right, left, fwd, back,
        fwdDot: +(fwd.dx * Math.sin(eff) + fwd.dz * Math.cos(eff)).toFixed(2),
        backDot: +(back.dx * Math.sin(eff) + back.dz * Math.cos(eff)).toFixed(2),
        rightDot: +(right.dx * -Math.cos(eff) + right.dz * Math.sin(eff)).toFixed(2),
        leftDot: +(left.dx * -Math.cos(eff) + left.dz * Math.sin(eff)).toFixed(2),
        cross: +(right.dx * Math.sin(eff) + right.dz * Math.cos(eff)).toFixed(2),
    }
})
console.log(`  ..  camera pinned at ${dirs.eff} rad, sitting at ${JSON.stringify(dirs.fwd.camAt)}, raccoon from ${JSON.stringify(dirs.fwd.at)}`)
r.check('thumb FORWARD travels along the view', dirs.fwdDot > 0.6, `dot ${dirs.fwdDot} (moved dx=${dirs.fwd.dx} dz=${dirs.fwd.dz})`)
r.check('thumb BACK travels against the view', dirs.backDot < -0.4, `dot ${dirs.backDot}`)
r.check('thumb RIGHT travels screen-right of the view', dirs.rightDot > 0.6, `dot ${dirs.rightDot} (moved dx=${dirs.right.dx} dz=${dirs.right.dz})`)
r.check('thumb LEFT travels screen-left of the view', dirs.leftDot < -0.4, `dot ${dirs.leftDot}`)
r.check('right is not forward (the inversion bug)', Math.abs(dirs.cross) < Math.abs(dirs.rightDot), `along-view ${dirs.cross} vs across ${dirs.rightDot}`)
r.check('left and right oppose', dirs.leftDot < 0 && dirs.rightDot > 0, `${dirs.leftDot} vs ${dirs.rightDot}`)
r.check('the rig does not wander off the pin in open ground', Math.abs(dirs.fwd.yaw - dirs.eff) < 0.4, `yaw ${dirs.fwd.yaw} vs eff ${dirs.eff}`)

console.log('\nPRESSED AGAINST A WALL')
// Production found this one, not the harness: walking along the north wall filled the
// screen with one blurred brick, because the rig has a floor under its distance and
// "pull the camera in when a wall appears" eventually means "put the camera in the
// wall". Every previous camera check looked at the spawn, where nothing is close.
const pinch = await api(async () => {
    const t = window.__heistTest
    // ms, but world ms: see `__simSleep` at the top of this file.
        const sleep = ms => window.__simSleep(ms / 1000)
    const thumb = (rx, ryUp) => t.stick(rx, -ryUp)
    // Stand at a real corner first. The previous version of this test started in the
    // middle of the yard, walked backwards for three seconds, found nothing within eight
    // metres in any direction, and reported a healthy camera while production was
    // filling the screen with brick. A check needs to *visit* the failure.
    const spot = t.tightSpot()
    t.moveTo(spot.x, spot.z)
    await sleep(150)
    // Camera on the wall side (its offset is (-sin yaw, -cos yaw)), then walk the
    // raccoon BACKWARD into the wall. Backing into a wall is the common accident: you
    // are watching a guard over your shoulder, not your feet.
    const wall = t.clearAt(spot.dx, spot.dz)
    const four = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [dx, dz, t.clearAt(dx, dz).clear])
    t.setCam(Math.atan2(-spot.dx, -spot.dz), 0.5, 9)
    await sleep(400)
    const frames = []
    thumb(0, -1)
    for (let i = 0; i < 7; i++) {
        await sleep(500)
        const p = t.probe()
        frames.push({ ...t.camClear(), ndc: p.ndc, cell: p.cell, pen: t.depth() })
    }
    thumb(0, 0)
    return { spot, wall, frames, four, spotProbe: [t.probe().x, t.probe().z] }
})
const F = pinch.frames
console.log(`  ..  corner ${JSON.stringify([pinch.spot.x, pinch.spot.z])} dir ${pinch.spot.dx},${pinch.spot.dz} at=${JSON.stringify(pinch.spotProbe)} four=${JSON.stringify(pinch.four)}`)
console.log(`  ..  corner at ${JSON.stringify([pinch.spot.x, pinch.spot.z])}, wall ${pinch.wall.clear} m; `, F.map(f => `${f.dist}m/${f.inside ? 'INSIDE' : 'clear ' + f.clear}/side ${f.side}`).join('  '))
r.check('the test got a raccoon against a real wall', pinch.wall.clear <= 1.4, `wall ${pinch.wall.clear} m away at the start`)
// Frames 3 onward are the settled state. A single buried frame while the rig swings
// through a corner is a transitional artefact and not worth failing a build over; a rig
// that stays buried -- which is what production did, all seven frames -- is.
const SETTLED = F.slice(2)
r.check('the camera stops burying itself in geometry', SETTLED.every(f => !f.inside), `${SETTLED.filter(f => f.inside).length}/${SETTLED.length} settled frames buried (transient frames: ${F.filter(f => f.inside).length})`)
r.check('the camera keeps some world in front of it', F.every(f => f.clear > 0.55), `${Math.min(...F.map(f => f.clear))} m clear at worst`)
// Never closer than 0.55 m (the fur-fill failure), and never so far that the raccoon
// leaves frame. Note the honest limit: this corner is 1.08 m from floor centre to brick,
// so a rig 1.5 m behind the raccoon is IN the brick by definition and no amount of
// probing fixes that. What the rig owes you there is a framed raccoon and no buried
// frames -- both asserted above -- not a wide shot that the map physically forbids.
r.check('the rig never jams against the raccoon', F.every(f => f.dist > 0.55), `min ${Math.min(...F.map(f => f.dist)).toFixed(2)} m in a ${(pinch.wall.clear * 2).toFixed(1)} m pocket`)
// The max, not the min: while the raccoon is *still pressing* into the wall the rig is
// legitimately confined, so the promise is that it opens up as soon as there is room --
// 2.1 m on the frame where the slide had finished and the bearing was open.
// Floor 20, not 4: this measures a slide *settling*, and the door's easing advances once per
// frame, so the number of frames in the sample window is the door travel. At 7 fps six polls
// is half a second of game time and the panel has physically not got there yet — a claim about
// the refresh rate, exactly the trap this file keeps re-learning. At any rate a real phone
// holds (20+) it is a hard assertion, and `rigPoly().min >= 1.75` above still catches a door
// whose geometry is carved too narrow at any frame rate.
claim('the rig opens up as soon as there is room', Math.max(...SETTLED.map(f => f.dist)) > 1.8, `best settled gap ${Math.max(...SETTLED.map(f => f.dist)).toFixed(2)} m`, 20)
r.check('the raccoon stays in frame while pressed against a wall', F.every(f => Math.abs(f.ndc[0]) < 0.9 && Math.abs(f.ndc[1]) < 0.9), JSON.stringify(F[F.length - 1].ndc))
r.check('the rig slides around the corner instead of clipping', F.some(f => Math.abs(f.side) > 0.04), `max slide ${Math.max(...F.map(f => Math.abs(f.side))).toFixed(2)} rad`)
r.check('and it stays on walkable ground', F.every(f => ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(f.cell)), F[F.length - 1].cell)

/**
 * **The body is not in the wall, and now that is a number.** This corner produced the
 * most expensive misdiagnosis in this file: `near()` — meshes near the actor, sorted by
 * distance — printed `fur1` at 0.08 m, and the round that followed went looking for a
 * wall the sim had never let anybody through. `fur1` is crew 1's fur material: the
 * raccoon's *own forearm*, one metre of rig arranged around the point that is its feet.
 *
 * So the question gets asked of the collision model (`engine.bodyDepth()`), in signed
 * metres, once per rendered frame. `blocked()` refuses a move that lands inside, so a
 * positive number here is a sim bug — and a buried *camera* with a clean *body* is a rig
 * bug. Different owners, different fix, and `npm run cornerprobe` prints both columns.
 */
const PEN = F.map(f => f.pen).filter(Boolean)
const worstGrid = Math.max(...PEN.map(p => p.grid))
const minWall = Math.min(...PEN.map(p => p.wall))
console.log(`  ..  body at worst: centre ${minWall} m from brick, collider overlap ${worstGrid} m; prop ${Math.max(...PEN.map(p => p.prop))} m; rig gap ${Math.min(...F.map(f => f.dist)).toFixed(2)} m`)
r.check('the raccoon is never inside the level', PEN.length > 3 && minWall > 0.001,
    PEN.length <= 3 ? `only ${PEN.length} depth samples` : `centre came within ${minWall} m of solid brick over ${PEN.length} frames`)
r.check('and its body never overlaps the brick either', worstGrid <= 0.001,
    `collider overlapped the wall by ${worstGrid} m (RADIUS ${PEN[0] ? PEN[0].r : '?'})`)
r.check('and it is the wall that stopped it', PEN.some(p => p.grid > -0.06),
    `closest ${Math.max(...PEN.map(p => p.grid))} m from brick (RADIUS ${PEN[0] ? PEN[0].r : '?'} m)`)
r.check('a buried frame would be the rig, not the walk', F.every(f => !f.inside || f.pen.wall > 0.001),
    `${F.filter(f => f.inside).length} buried frames, all with a clean body`)

console.log('\nTHE WORLD IS SOLID')
// Collision used to be the grid alone. The grid is 2.2 m cells, and every hydrant, bin,
// lamppost, pallet and cart in the game is *decoration standing on a walkable cell*, so
// the raccoon strolled through all of them — and a raccoon that walks through a lamppost
// decides within two seconds that none of this world is real.
const solid = await api(async () => {
    const t = window.__heistTest
    // ms, but world ms: see `__simSleep` at the top of this file.
        const sleep = ms => window.__simSleep(ms / 1000)
    /** Thumb input, player frame: +y is up the screen. */
    const thumb = (rx, ryUp) => t.stick(rx, -ryUp)
    const props = t.props().filter(p => p.r)
    const out = { count: props.length, hits: [] }
    for (const p of props.slice(0, 4)) {
        // Stand south of the prop and walk north, into it, for long enough to cross it.
        t.setCam(0, 0.55, 9)
        t.moveTo(p.x, p.z - 2.6)
        await sleep(120)
        const a = t.probe()
        thumb(0, 1)
        await sleep(1700)
        thumb(0, 0)
        await sleep(80)
        const b = t.probe()
        const d = Math.hypot(b.x - p.x, b.z - p.z)
        out.hits.push({
            r: p.r, walked: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2),
            d: +d.toFixed(2),
            // "stopped at the collider" = close to the surface but never through it.
            inside: d < p.r - 0.01,
            stopped: d < p.r + 0.75 && d > p.r - 0.01,
        })
    }
    thumb(0, 1)
    await sleep(1500)
    thumb(0, 0)
    out.cell = t.probe().cell
    return out
})
console.log('  ..  ', JSON.stringify(solid.hits))
r.check('the world hands the sim colliders', solid.count >= 6, `${solid.count} prop colliders`)
r.check('walking at a prop actually walked', solid.hits.every(h => h.walked > 0.6), JSON.stringify(solid.hits.map(h => h.walked)))
r.check('nothing walks through a prop', solid.hits.every(h => !h.inside), JSON.stringify(solid.hits))
r.check('the prop is what stopped you', solid.hits.some(h => h.stopped), JSON.stringify(solid.hits.map(h => `${h.d}/${h.r}`)))
// The width of the animal, pinned. `RADIUS` is what `blocked()` measures the world
// against, so "0.32 m" is the raccoon: shrink it and nothing any longer stops you
// 0.32 m short of a lamppost — you stand *in* the mesh while every check that measures
// the collider stays green. So measure the gap that was actually left behind.
const WAIST = 0.32
const snug = solid.hits.filter(h => h.stopped)
console.log(`  ..  stopped ${snug.map(h => (h.d - h.r).toFixed(2)).join('/')} m out from props of r ${snug.map(h => h.r).join('/')}`)
r.check('a raccoon is 0.64 m wide', snug.length > 0 && snug.every(h => h.d - h.r > 0.24 && h.d - h.r <= 0.46),
    snug.length ? `stopped ${snug.map(h => (h.d - h.r).toFixed(2)).join('/')} m out (body radius ${WAIST}; the band is 0.32 +/- one 0.08 m step)`
        : 'nothing stopped the walk — it walked past every prop')
r.check('a wall is still a wall', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(solid.cell), solid.cell)

console.log('\nA GUARD WALKS AROUND THE LAMPPOST')
/**
 * The raccoon has had prop colliders since round 1. The **guards** have not — the branch
 * that follows a `pathBetween` route stepped straight at the next cell centre and never
 * asked `blocked()`, so a watchman slid through every lamppost, hydrant and bin in the
 * yard while you could not touch one. (Direct chase did ask; that is why nothing caught
 * it: the only guard that ever touched furniture was one that had already seen you, and
 * by then the frame is full of him.)
 *
 * So the check stages the *pathing* branch on purpose: `suspect` walks to `aim` via the
 * map, `routeOf` proves the map really routes through the prop's cell (otherwise this is
 * a check about an empty corridor), the guard must actually cover ground, and `prop`
 * penetration stays <= 0 for every sample. `npm run heistmutate` #12 puts the raw `+=`
 * back and must turn this red.
 */
const ghost = await api(async () => {
    const t = window.__heistTest
    const sleep = ms => window.__simSleep(ms / 1000)
    const props = t.props().filter(p => p.r >= 0.4)
    const out = { cases: [], crew: [], watchers: [], attempts: 0 }
    // Snapshot first. A staged guard who is left 15 m from his patrol route has a
    // different phase for the rest of the run, and the BEING SEEN section that follows
    // asserts how long a *specific* torch beam takes to spot you.
    const snap = t.watcherAt(0)
    for (const p of props) {
        if (out.cases.length >= 2) break
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const sx = +(p.x + dx * 4.4).toFixed(2), sz = +(p.z + dz * 4.4).toFixed(2)
            const route = t.engine().routeOf(sx, sz, p.x, p.z)
            if (!route || route.cells < 2 || route.cells > 4) continue
            out.attempts++
            const w0 = t.warpWatcher(0, sx, sz, 'suspect', [p.x, p.z])
            if (!w0) continue
            await sleep(120)
            const start = t.depths().watchers[0]
            const samples = []
            for (let i = 0; i < 12; i++) {
                await sleep(280)
                const d = t.depths().watchers[0]
                if (d) samples.push({ ...d, dp: +Math.hypot(d.x - p.x, d.z - p.z).toFixed(2) })
            }
            if (samples.length) {
                out.cases.push({
                    r: p.r, at: [p.x, p.z], from: [sx, sz], cells: route.cells,
                    walked: +Math.hypot(samples[samples.length - 1].x - start.x, samples[samples.length - 1].z - start.z).toFixed(2),
                    pen: +Math.max(...samples.map(s => s.prop)).toFixed(3),
                    gap: +Math.min(...samples.map(s => s.dp - p.r)).toFixed(3),
                    grid: +Math.max(...samples.map(s => s.grid)).toFixed(3),
                    wall: +Math.min(...samples.map(s => s.wall)).toFixed(3),
                })
            }
            break
        }
    }
    if (snap) t.restoreWatcher(0, snap)
    // And everybody else, while we are asking: nobody in the cast may be inside the grid.
    const d = t.depths()
    out.crew = d.crew.map(c => c && c.grid)
    out.watchers = d.watchers.map(w => w && w.grid)
    // Centre-to-brick, for the same reason: `grid` is what `blocked()` guarantees, so on
    // its own it cannot tell a walking bug from a raccoon that got thinner.
    out.walls = [...d.crew, ...d.watchers].filter(Boolean).map(b => b.wall)
    out.restored = !!snap && t.watcherAt(0) && [+t.watcherAt(0).x.toFixed(1), +t.watcherAt(0).z.toFixed(1)]
    return out
})
console.log('  ..  staged: ' + (ghost.cases.map(c => `r=${c.r} walked ${c.walked}m over ${c.cells} cells, pen ${c.pen}, gap ${c.gap}`).join(' | ') || 'NOTHING'))
r.check('the driver staged a guard that PATHS', ghost.cases.length >= 1, `${ghost.cases.length} prop routes staged of ${ghost.attempts} candidates`)
r.check('and the guard actually walked', ghost.cases.every(c => c.walked > 1.0), JSON.stringify(ghost.cases.map(c => c.walked)))
r.check('a guard stops at the furniture instead of clipping it', ghost.cases.every(c => c.pen <= 0.001), JSON.stringify(ghost.cases.map(c => `pen ${c.pen} / r ${c.r}`)))
r.check('close enough that the check is not vacuous', ghost.cases.every(c => c.gap < 0.75), JSON.stringify(ghost.cases.map(c => c.gap)))
r.check('no guard walks through a wall either', ghost.cases.every(c => c.grid <= 0.001) && ghost.walls.every(w => w > 0.001),
    JSON.stringify({ overlap: ghost.cases.map(c => c.grid), centres: ghost.walls }))
r.check('the staged guard went home', !!ghost.restored, JSON.stringify(ghost.restored))
r.check('nobody in the crew is inside the level', [...ghost.crew, ...ghost.watchers].every(g => g !== null && g <= 0.001)
    && ghost.walls.every(w => w > 0.001),
    JSON.stringify({ crew: ghost.crew, watchers: ghost.watchers, centres: ghost.walls }))

console.log('\nA GUARD WHO TOUCHES YOU TAKES YOU')
// The complaint: "I was on top of him and he did not capture me." Three separate causes
// lived behind that one sentence — the catch radius was a 0.62 m handshake, an alerted
// guard walked on 2.2 m waypoints and stopped a metre short, and the two bodies shared
// the same cubic metre of air. Each gets its own assertion.
const catchIt = await api(async () => {
    const t = window.__heistTest
    // ms, but world ms: see `__simSleep` at the top of this file.
        const sleep = ms => window.__simSleep(ms / 1000)
    const a = t.probe()
    // An alerted guard, right in front of you, walking straight at you.
    const w = t.warpWatcher(0, a.x + 2.4, a.z + 1.2, 'alert')
    const far = t.warpWatcher(1, a.x - 9, a.z - 9, 'alert')
    // Poll for the arrest and stand the cast down the instant it lands. Leaving an
    // alert 3.4 m/s guard loose for a fixed 2.6 s used to chain into a second and third
    // arrest -- being caught switches you to the next raccoon, who is standing right
    // there -- and the "job recovers" check then had nothing to recover.
    // Watch the CAGE COUNT, not the raccoon you control: being caught now hands you the
    // next crew member, so `probe().caged` goes back to false a frame after a perfectly
    // good arrest, and a driver polling that keeps a 3.4 m/s guard loose long enough to
    // bag the rest of the crew.
    const inPound = () => t.state().sim.crew.filter(c => c.caged).length
    const before = inPound()
    let p = t.probe()
    let took = 0
    const t0 = window.__gameTime()
    for (let i = 0; i < 24 && inPound() === before; i++) {
        await sleep(130)
        p = t.probe()
        took = window.__gameTime() - t0
        // Back off on the same tick the bagging lands. `calm()` after the loop is a frame
        // too late on a slow box: the second alert guard is 12 m away and closes that
        // distance in about four polls, and this set-piece has him running at a crewmate
        // who is standing exactly where the last one was caught.
        if (inPound() > before) { t.calm(); t.moveTo(p.x + 2.5, p.z + 2.5) }
    }
    const caged = t.state().sim.crew.filter(c => c.caged).map(c => c.name)
    // Stand down the instant the arrest lands -- see the mercy-window comment in engine.js.
    t.calm()
    return {
        w, far, caged: p.caged, x: p.x, z: p.z, cagedWho: caged,
        guards: t.watchers().map(x => ({ s: x.state, d: x.d })),
        // The grace window, measured: how long the catching guard is busy tying the sack
        // before he reaches for the next raccoon. Zero here means one mistake ends the job.
        cool: t.watchers().map(x => +(x.cool || 0).toFixed(1)),
        took: +took.toFixed(2),
        where: t.watchers().map(x => `${x.kind}@${[x.x, x.z]}cool${x.cool}`),
        caughtEvents: t.events().filter(e => e.type === 'caught' || e.type === 'swap').map(e => e.type + ':' + (e.who || '')),
        // Being caught must hand you somebody who can still walk, or the job looks hung:
        // the camera keeps orbiting a caged raccoon and every key does nothing.
        activeCaged: t.state().sim.crew.find(c => c.active)?.caged,
        stillPlaying: t.state().sim.phase === 'play',
    }
})
claim('an alerted guard who reaches you bags you', (catchIt.cagedWho || []).length >= 1, `arrested in ${catchIt.took} s of game time; guards ${JSON.stringify(catchIt.guards)}`)
r.check('the arrest hands you a raccoon that can still walk', catchIt.activeCaged === false, `active raccoon caged=${catchIt.activeCaged}`)
r.check('and the job is still running', catchIt.stillPlaying === true, `phase ${catchIt.stillPlaying}`)
// "One mistake must not end the job" -- measured honestly. The promise is not "exactly one
// raccoon gets bagged": an arrest SHOUTS, the second guard heard it (that is what the
// `suspicious`/`suspect` escalation is for) and closed on a raccoon this driver had
// teleported into the open, which is the pressure the game is supposed to apply. What must
// never happen is the job ending on the spot -- the crew must still be playing, with the
// pound holding fewer than all three, and the guard who made the bagging must be busy
// tying the sack (asserted next).

claim('the guard who took them is busy, not reaching for the next one', catchIt.cool.some(c => c > 0.5), `cool timers ${JSON.stringify(catchIt.cool)}`)
console.log('  ..  staged:', JSON.stringify(catchIt.w), 'far:', JSON.stringify(catchIt.far))
// Undo the staging: free the raccoon, stand the cast down, put the job back on the cart.
// Every later section assumes a crew that can walk.
const restored = await api(async () => {
    const t = window.__heistTest
    // ms, but world ms: see `__simSleep` at the top of this file.
        const sleep = ms => window.__simSleep(ms / 1000)
    const cart = t.marks().find(m => m.ch === 'S')
    // Stand down FIRST: a warped-up alert guard at 2.4 m with a 3.4 m/s chase re-arrests
    // whoever the sim hands the player a half-second later, and then the driver is
    // chasing its own capture. Then free everybody -- getting caught now switches you to
    // the next raccoon, so the free one is not necessarily crew 0.
    t.calm()
    // No re-warping the guards anywhere: an arbitrary offset off the raccoon lands them
    // outside the map (VOID), and a guard standing in VOID cannot patrol, cannot see, and
    // its torch has no floor to land on. `calm()` already puts them back on their routes,
    // and they path there from wherever they are.
    const freed = [0, 1, 2].map(i => t.release(i))
    const r0 = t.release(0, cart.wx, cart.wz + 2.0)
    t.switchTo(0)
    // Put the shell back too. The engine can be talking itself out of a bust, but the
    // card is React state and the frame loop deliberately feeds the sim nothing while a
    // result card is up -- so a driver that forgets this starts tapping into a paused
    // game and concludes the grab button is broken when it is the screen that is.
    t.goto('play')
    await sleep(400)
    void freed
    return { r0, probe: t.probe(), guards: t.watchers().map(w => w.state) }
})
r.check('the job recovers after a staged arrest', restored.probe.phase === 'play' && !restored.probe.caged, JSON.stringify(restored.r0))
{
    const crew = await api(() => window.__heistTest.state().sim.crew.map(c => `${c.name}:${c.caged ? 'CAGED' : 'free'}@${c.x.toFixed(1)},${c.z.toFixed(1)}`))
    const ph = await api(() => window.__heistTest.probe().phase)
    r.info('the crew after the arrest set-piece', `${crew.join('  ')}  phase=${ph}  guards=${(restored.guards || []).join(',')}`)
}
r.check('the cast stands down between set-pieces', restored.guards.every(g => g === 'patrol'), restored.guards.join(','))
r.check('the freed raccoon stands on walkable ground', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(restored.probe.cell), restored.probe.cell)

console.log('\nLOOT + CART')
const marks = await api(() => window.__heistTest.marks())
const cart = marks.find(m => m.ch === 'S')
const vault = marks.find(m => m.ch === 'V')
const pile = (await api(() => window.__heistTest.lootList())).filter(l => !l.taken && !l.delivered)
r.check('the job has loot to steal', pile.length >= 3, `${pile.length} piles`)
r.check('a getaway cart exists', !!cart, cart ? `${cart.wx},${cart.wz}` : 'none')

// Walking up to a pile and pressing the button must be enough — no prompts, no menu.
const take = await api(async (l) => {
    const t = window.__heistTest
    t.moveTo(l.x, l.z)
    await window.__simSleep(0.26)
    const focus = t.probe().held
    const label = t.state().sim.hint
    const before = t.probe()
    t.tap('grab')
    await window.__simSleep(0.26)
    const after = t.probe()
    return {
        focus, label, held: after.held,
        dbg: {
            want: [l.x, l.z], at: [before.x, before.z], cell: before.cell, caged: before.caged,
            atAfter: [after.x, after.z], active: t.state().sim.active,
            crew: t.state().sim.crew.map(c => `${c.name}:${c.caged ? 'caged' : 'free'}${c.active ? '*' : ''}`),
            pile: t.lootList().map(x => `${x.label}@${[x.x.toFixed(1), x.z.toFixed(1)]}${x.taken ? 'taken' : ''}${x.delivered ? 'sent' : ''}`),
            events: t.events().map(e => e.type + (e.who ? ':' + e.who : '')),
        },
    }
}, pile[0])
r.check('the action button knows what it is for', /TAKE/i.test(take.label || ''), take.label)
r.check('picking loot up works', !!take.held, take.held || `hands empty -- ${JSON.stringify(take.dbg)}`)

const dropped = await api(async (c) => {
    const t = window.__heistTest
    t.moveTo(c.wx, c.wz)
    await window.__simSleep(0.26)
    const label = t.state().sim.hint
    t.tap('grab')
    await window.__simSleep(0.32)
    const s = t.state().sim
    return { label, delivered: s.delivered, total: s.total, held: t.probe().held, objective: s.objective }
}, cart)
r.check('the cart accepts the loot', dropped.delivered >= 1, `${dropped.delivered}/${dropped.total}`)
r.check('hands are empty afterwards', !dropped.held, dropped.held || 'empty')
r.check('the objective changed', !/FIND/.test(dropped.objective), dropped.objective)

console.log('\nVAULT')
if (vault) {
    // A lock is a hold, not a tap: the button must be worth holding down.
    await affordAt('at the shut vault', vault.wx + 0.2, vault.wz + 0.2, 'chew')
    const chew = await api(async (v) => {
        const t = window.__heistTest
        // Pin the plate before anything moves. `bakeMeshes` bakes a child's world matrix
        // into its geometry and then the parent re-applies it, so a hinged sub-assembly
        // that was offset *before* baking got its offset twice — the vault plate drew
        // 0.86 m off-centre, and the same bake absorbed the plate into the static frame,
        // which left the group the engine rotates empty. Two bugs, both invisible in a
        // night screenshot, and the reason the hinge below is measured, not assumed.
        const vv = t.world().vaults[0]
        const plate = (() => { let f = null; if (vv) vv.pivot.traverse(o => { if (o.isMesh && (o.material?.name || '').includes('dial')) f = o }); return f })()
        // Measure the plate's *geometry centre*, not its object origin: the dial is a
        // merged mesh whose vertices are baked around the hinge, so its origin sits on the
        // hinge and never moves no matter how far the door swings. A check built on the
        // origin was green through a door that did not open.
        const scratch = plate ? plate.position.clone() : null
        const centre = () => {
            if (!plate.geometry.boundingBox) plate.geometry.computeBoundingBox()
            const b = plate.geometry.boundingBox
            let x = 0, z = 0
            for (const sx of [b.min.x, b.max.x]) for (const sy of [b.min.y, b.max.y]) for (const sz of [b.min.z, b.max.z]) {
                scratch.set(sx, sy, sz).applyMatrix4(plate.matrixWorld); x += scratch.x; z += scratch.z
            }
            return { x: x / 8, z: z / 8 }
        }
        const at0 = plate ? centre() : null
        t.moveTo(v.wx + 0.2, v.wz + 0.2)
        await window.__simSleep(0.24)
        const label = t.state().sim.hint
        t.hold(true)
        await window.__simSleep(3.6)
        t.hold(false)
        await window.__simSleep(0.9)
        const s = t.state().sim
        let meshes = 0
        if (vv) vv.pivot.traverse(o => { if (o.isMesh) meshes++ })
        const at1 = plate ? centre() : null
        return {
            label, hint: t.state().sim.hint, delivered: s.delivered,
            hinge: plate ? {
                meshes, offCentre: +Math.hypot(at0.x - v.wx, at0.z - v.wz).toFixed(2),
                swing: +Math.hypot(at1.x - at0.x, at1.z - at0.z).toFixed(2),
                yaw: +(vv.pivot.rotation.y || 0).toFixed(2),
            } : { meshes, offCentre: null, swing: null, yaw: null },
        }
    }, vault)
    r.check('a shut vault offers to be chewed', /CHEW|TINKER/i.test(chew.label || ''), chew.label)
    const inside = await api(() => window.__heistTest.probe())
    r.check('the chewed door lets you in', !['WALL', '??'].includes(inside.cell), inside.cell)
    // "Lets you in" is a grid fact. These three are the scene-graph facts behind it: the
    // door is a real assembly, it is in its own cell, and chewing it moves it.
    r.check('the vault door is an assembly, not a baked-in wall', chew.hinge.meshes > 0 && chew.hinge.meshes <= 4,
        `${chew.hinge.meshes} meshes on the pivot (0 = the frame absorbed the plate; >4 = the plate never got merged)`)
    r.check('the vault plate sits in its own cell', chew.hinge.offCentre !== null && chew.hinge.offCentre < 0.45, `plate ${chew.hinge.offCentre} m off its cell centre`)
    r.check('a chewed vault door swings in the scene graph', chew.hinge.swing > 0.3, `plate moved ${chew.hinge.swing} m; pivot now ${chew.hinge.yaw} rad`)
}

console.log('\nWATCHERS')
const watches = await api(() => window.__heistTest.watchers())
r.check('every watcher spawned', watches.length >= 2, `${watches.length} on the job`)
r.check('watchers stand on walkable ground', watches.every(w => !['WALL', 'VOID', '??'].includes(w.cell)), watches.map(w => w.cell).join(','))
// 'suspect' counts. The driver has been walking around making noise for a minute by
// this point, and a guard off to look at a noise is a guard working, not a guard stuck.
// What must never appear here is 'stunned', or a state with no destination.
r.check('watchers are on duty', watches.every(w => ['patrol', 'suspect'].includes(w.state)), watches.map(w => w.state).join(','))
r.check('every watcher has somewhere to walk', watches.every(w => w.wp !== null || w.state !== 'patrol'), watches.map(w => `${w.state}/${w.wp ? 'wp' : 'none'}`).join(' '))
// Two samples a second apart: a route that is not walked is a route that is broken.
const drift = await api(async () => {
    const t = window.__heistTest
    const a = t.watchers()
    await window.__simSleep(2.2)
    const b = t.watchers()
    return a.map((w, i) => ({ kind: w.kind, moved: +Math.hypot(b[i].x - w.x, b[i].z - w.z).toFixed(2), cell: b[i].cell, state: b[i].state }))
})
claim('patrols actually walk', drift.filter(d => d.moved > 0.15).length >= Math.ceil(drift.length / 2), drift.map(d => `${d.kind}:${d.moved}m`).join(' '))
r.check('nobody walks through a wall', drift.every(d => !['WALL', 'VOID', '??'].includes(d.cell)), drift.map(d => d.cell).join(','))

// Re-measure HERE, not just at THE CLOCK: the floor decides which checks get to be
// assertions, and a box that drifts from 5 fps to 2 fps across the run would otherwise
// spend its last third asserting promises it cannot physically test.
await pace()
floorClaim()
console.log('\nBEING SEEN')
// Stand in the open, in the beam, and the meter must climb. This is the check that
// would fail silently forever if `det` never accumulated: the guard would simply never
// notice anything and the game would be a walking simulator with a HUD.
//
// Two honest-looking versions of this failed before this one worked. Teleporting "four
// metres ahead of a guard" put the probe inside a wall (of course nobody sees you). Letting
// it stand there while the patrol walked its route then failed because the guard *turned
// away* — which is correct stealth behaviour, not a bug. So the driver does what a player
// does: it asks the sim's own sight arithmetic (`why()`) for a cell it currently sees,
// stands there, and re-steps when the beam sweeps past.
const seen = await api(async () => {
    const t = window.__heistTest
    const inBeam = () => t.why().find(w => w.los && w.inCone && w.inRange && w.d > 1.2) || null
    // **One torch, one question.** This section asks "does a beam notice you, and how long
    // does the meter take" — and on a 4-9 fps box the hunt (which teleports the courier
    // into a cone, hundreds of times, in world time) spends long enough in the open that a
    // second patrol walks up and bags the crew. The driver then polls the suspicion meter
    // of a prisoner, which the engine pins at zero, and files "the stealth model stopped
    // noticing". So everybody except the guard being measured is walked off the map for the
    // duration and given back afterwards; the beam being timed is a real patrol on a real
    // route, and the absence of the other two is printed, not hidden.
    const allW = t.watchers()
    const keeper = allW.findIndex(w => w.kind === 'guard')
    const keptSnap = []
    let fx = null, fd = -1
    for (let cx = -34; cx <= 34; cx += 2) {
        for (let cz = -30; cz <= 30; cz += 2) {
            const wx = cx * 2.2, wz = cz * 2.2
            if (t.navAt(wx, wz) !== 'FLOOR') continue
            const d = Math.abs(cx - 18) + Math.abs(cz + 18)
            if (d > fd) { fd = d; fx = [wx, wz] }
        }
    }
    if (fx) for (let i = 0; i < allW.length; i++) {
        if (i === keeper) continue
        const snap = t.watcherAt(i)
        if (!snap) continue
        keptSnap.push({ i, snap })
        if (!t.parkWatcher(i, fx[0], fx[1])) t.warpWatcher(i, fx[0], fx[1], 'patrol')
    }
    // Count the POUND, never `probe().caged`. Being caught hands you the next raccoon, so
    // the one this loop is watching is back to `caged:false` a frame after a perfectly good
    // arrest — and the loop then stands *her* in the same beam. That is the same trap the
    // CAUGHT set-piece already documented, and standing in a torch beam until spotted is
    // precisely the section that walks into it: on a 17 fps box it lost the whole crew
    // before the pound test even started.
    const penned = () => t.state().sim.crew.filter(c => c.caged).length
    let penned0 = penned()
    const bagged = () => penned() > penned0
    const rebase = () => { penned0 = penned() }
    let spot = null, holder = null
    // Patrols move, so "is there floor in a beam right now" is a question with a
    // half-second shelf life. Retry for several seconds instead of taking one snapshot:
    // the assertion is that beams are survivable to stand in, not that a guard happened
    // to be facing the open yard when the harness blinked. It is also a *function*, because
    // it has to be asked twice — see the cold start below.
    const hunt = async (from, wantRate = 1.25) => {
        // Score candidates by the game's own `rate` — the per-second term inside the
        // detection meter, which already folds in distance, alignment, cover and light.
        // "Somewhere in the cone" was the first version's question, and it happily parked
        // the raccoon in a cell the cone clipped the corner of: `los` true, cone true,
        // range true, and the meter flat at 0.00 for the whole budget while CI filed a
        // failure against the stealth model.
        //
        // But *fastest* is the wrong optimum too — that was my first attempt here, and it
        // picked a cell 2.5 m from a guard at 2.48 meter/s, which is not "a torch notices
        // you" so much as "you died": the guard noticed, alerted and bagged a crewmate
        // before the second poll, and every measurement after that belonged to a different
        // raccoon standing somewhere else. So the target is the rate that fills the meter
        // in about four fifths of a second — long enough to be a fair alarm, short enough
        // to fit the budget — and the further cell wins the tie.
        const floorish = c => ['FLOOR', 'MARBLE', 'BUSH'].includes(c)
        const score = (q, d) => -Math.abs(q.rate - wantRate) - (d < 3.2 ? 1.5 : 0)
        for (let round = 0; round < 24 && !spot && !bagged(); round++) {
            let best = null
            for (const w of t.watchers()) {
                if (bagged()) break
                for (const d of from) {
                    for (const off of [0, 0.25, -0.25, 0.5, -0.5]) {
                        const yaw = w.yaw + off
                        const x = w.x + Math.sin(yaw) * d, z = w.z + Math.cos(yaw) * d
                        t.moveTo(x, z)
                        const p = t.probe()
                        if (!floorish(p.cell)) continue
                        const w2 = t.why().find(q => q.los && q.inCone && q.inRange)
                        if (!w2 || w2.rate < 0.5) continue
                        const sc = score(w2, d)
                        if (!best || sc > best.sc) best = { x, z, d, sc, rate: w2.rate, guard: w.kind, holder: w2.kind }
                    }
                }
            }
            if (best) {
                t.moveTo(best.x, best.z)
                await window.__simSleep(0.05)
                if (!floorish(t.probe().cell)) continue
                // **"In the cone" has to mean over time, not at one sampled instant.**
                // A patrol's yaw is integrated per frame, so at 5 fps the cone sweeps in
                // 200 ms arcs: a cell that scores `rate 1.2` on the frame the driver asked
                // can be outside the beam on every frame after it, and the meter then never
                // leaves zero while the driver samples a Strobelight. CI saw exactly that
                // (`peak meter 0.00` at 5 fps, everything above it green). So the cell is
                // only accepted once the game has said "I see you here" three times in a
                // row — which is what "standing in a torch beam" means to a player anyway.
                let firm = 0
                for (let k = 0; k < 5 && firm < 3; k++) {
                    const q = t.why().find(x => x.los && x.inCone && x.inRange)
                    if (q && q.rate > 0.25) firm++
                    else firm = 0
                    await window.__simSleep(0.08)
                }
                if (firm < 3) continue
                spot = { x: +best.x.toFixed(2), z: +best.z.toFixed(2), d: best.d, guard: best.guard, rate: +best.rate.toFixed(2) }
                holder = best.holder
                break
            }
            if (!spot) await window.__simSleep(0.25)
        }
        return spot
    }
    // Far end of the beam first. The close cells fill the meter faster, but 2.5 m is also
    // arm's reach for a guard who has already been alerted by the hunt itself — and on a
    // box rendering one frame per 200 ms the driver loses that race routinely, gets the
    // crew bagged three times over, and then the section reports the meter reading of a
    // BUSTED job (0.00) as if the stealth model had stopped noticing.
    await hunt([5.6, 4.8, 4])
    if (!spot) return { spot, samples: [], why: t.why(), penned: penned() }
    const samples = []
    let peak = 0
    let why = []
    // COLD START. The hunt above almost certainly got noticed on the way in, and `events()`
    // *drains* — so the stale `spotted` from that hunt was grabbed by the very first poll
    // of the timed loop, which then reported "noticed in 0.3 s" while the meter still read
    // 0.08. An alert from a previous second is not an answer to "how long does this beam
    // take to notice you". So: stand the cast down, back out of the light until the meter
    // is flat, empty the event log, and only then start the stopwatch.
    const holder0 = t.watchers().find(w => w.kind === holder) || t.watchers()[0]
    t.calm()
    const isFloor = c => ['FLOOR', 'MARBLE', 'BUSH'].includes(c)
    // Step back until the meter is flat, but ONLY onto a cell the game says is safe: floor,
    // at least 3 m from every watcher, and not in anybody's cone. The first version backed
    // up blindly for up to 16 steps, and at 6 fps that is a roulette wheel of teleports —
    // one of them lands on a guard, the raccoon is bagged by *contact* with the meter never
    // having left zero, and the run quietly ends here while the report blames the stealth
    // model with `det=0.00` and an empty `why()`.
    const safeCell = (x, z) => {
        t.moveTo(x, z)
        const p = t.probe()
        if (!isFloor(p.cell)) return false
        return t.why().every(q => q.d > 3) && !t.watchers().some(w => Math.hypot(w.x - x, w.z - z) < 3)
    }
    for (let i = 0; i < 16 && t.probe().det > 0.03; i++) {
        const q = t.probe()
        const dx = q.x - (holder0 ? holder0.x : q.x - 1), dz = q.z - (holder0 ? holder0.z : q.z)
        const len = Math.hypot(dx, dz) || 1
        let moved = false
        for (const s of [1.2, 2, 2.8]) {
            for (const side of [0, 0.7, -0.7]) {
                const ux = dx / len * Math.cos(side) - dz / len * Math.sin(side)
                const uz = dx / len * Math.sin(side) + dz / len * Math.cos(side)
                if (safeCell(q.x + ux * s, q.z + uz * s)) { moved = true; break }
            }
            if (moved) break
        }
        if (!moved) break
        await window.__simSleep(0.15)
    }
    t.events()                       // drain: nothing before this line may answer the question
    // If the cold start cost somebody the pound, that is a new baseline: the driver is now
    // measuring a different raccoon, and pretending otherwise is how this section once
    // reported a `det` of 0.00 for five seconds — the raccoon it was polling was in a sack,
    // `why()` had every watcher filtered out by range, and the game was not the liar.
    if (bagged()) { rebase(); if (!spot) return { spot: null, samples, peak: +peak.toFixed(2), why: t.why(), penned: penned(), spottedAt: -1 } }
    // And back into a beam — *a fresh one*. `spot` was measured before the retreat, and a
    // patrol that has walked ten metres since does not leave its torch where you left it:
    // standing at the stale coordinates is how this section managed to report "noticed in
    // 5.2 s" while the meter read 0.00 for five seconds, because the raccoon was not in
    // any cone at all. The stopwatch may only start once the game says we are seen-able.
    spot = null
    await hunt([4, 4.8, 3.2, 5.6, 2.5])
    if (!spot) return { spot: null, samples, why: t.why(), penned: penned(), spottedAt: -1 }
    await window.__simSleep(0.05)
    // Time to the SPOTTED event, on the JOB CLOCK (`st.elapsed`), not the wall clock.
    // "Noticed in about a second at five metres" is a promise about the game; on a box
    // that cannot hold 60 fps the wall is a different clock entirely, and this is the
    // check that reported "spotted after 21.2 s" on CI while the game did it in 0.9 s.
    // Filling the meter *is* the alert, and the alert zeroes the counter — hence the event
    // and not a peak on `det`, which measures a guard who never noticed you.
    let tSpot = t.engine().st.elapsed
    let spottedAt = -1
    // The peak the meter ever reached, across every attempt. The per-window `samples` list
    // is reset when the driver has to go hunting for a live cone again (see below), and the
    // first version of that reset fed an empty list to "standing in a torch beam raises
    // suspicion" — a check that went red because the driver moved, not because the game
    // stopped noticing.
    // 48 x 0.05 s: same 2.4 s of game time as before (comfortably past the widest budget
    // below, 1.78 s at 5.6 m), but sampled four times finer. That matters for the
    // efficiency check under the loop: `det` is RESET to zero by the alert, so a coarse
    // sampler mostly records the frames after the reset and calls that the peak. Fine
    // sampling catches the meter on its way up, which is the number being asserted.
    let stood = 0
    // **A caged raccoon has no meter.** `updateWatchers` zeroes `det[k]` for anybody in a
    // sack, so one arrest during the hunt and every sample afterwards reads 0.00 — which is
    // exactly what the CI runner filed as "the stealth model stopped noticing" when what had
    // actually happened is that the driver got itself captured mid-hunt at 9 fps and then
    // polled the suspicion meter of a prisoner. So put the crew back on its feet, keep the
    // job alive, and COUNT the times this happened: a driver that revives and says so is
    // measurable, one that silently polls a caged actor is a lie machine.
    let revived = 0
    const standUp = () => {
        const stuck = t.state().sim.crew.filter(c => c.caged)
        if (!stuck.length && t.state().sim.phase === 'play') return
        const here = t.probe()
        t.calm()
        for (const c of stuck) { t.release(c.idx, here.x, here.z); revived++ }
        t.goto('play')
    }
    for (let i = 0; i < 48; i++) {
        await window.__simSleep(0.05)
        // On the JOB CLOCK, not by adding up the sleeps: the hunt above also stood the
        // raccoon in a cone (that is how it scored the cell), and the meter has been
        // filling since the stopwatch started, not since this loop began. Summing the
        // loop's own sleeps undercounts by exactly the re-hunt, which is what made the
        // first version of this ratio report 3.88x on a perfectly healthy build.
        stood = Math.max(stood, t.engine().st.elapsed - tSpot)
        if (t.probe().caged || t.state().sim.phase !== 'play') standUp()
        const s = t.probe()
        samples.push(+s.det.toFixed(2))
        peak = Math.max(peak, s.det)
        why = t.why()
        if (spottedAt < 0 && t.events().some(e => e.type === 'spotted')) {
            spottedAt = t.engine().st.elapsed - tSpot
            // That is the whole answer. Everything past this line is a guard walking toward
            // a raccoon that is standing perfectly still in the light, and at 17 fps "one
            // more sample" is 300 ms of world time in which two crew can get bagged. The
            // question was "how long until you are noticed", not "how long can you survive
            // being noticed".
            t.calm()
            break
        }
        if (bagged() || t.probe().caged) {
            // Noticed, and somebody paid for it. That is the answer to the question; stand
            // the cast down and step out of the light instead of volunteering the next one.
            t.calm()
            const q = t.probe()
            t.moveTo(q.x + 2.4, q.z + 2.4)
            break
        }
        // The beam moved; keep standing in it, like a player hugging the light. Never on
        // the very frame the alert lands: the loop is about to break and a re-staged
        // raccoon in a cone on that frame is what got crew bagged at low frame rates.
        if (spottedAt < 0 && !inBeam()) {
            const w = t.watchers().find(x => x.kind === holder) || t.watchers()[0]
            for (const d of [4.6, 3.8, 5.2, 3.2]) {
                const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
                t.moveTo(x, z)
                await window.__simSleep(0.06)
                if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
                if (t.why().find(q => q.los && q.inCone && q.inRange && q.rate > 0.15)) break
            }
        }
        // If the meter has not twitched in half a second, the driver is not in a beam any
        // more — patrols walk off, the cone goes with them, and the fine-grained nudge
        // above only works within arm's reach of the last known torch. Re-hunt instead of
        // sampling a zero for another two seconds and then reporting "the game never
        // noticed me", which is a report about the driver.
        if (spottedAt < 0 && i > 0 && i % 5 === 4 && (Math.max(...samples) < 0.02 || t.why().length === 0)) {
            spot = null
            await hunt([4.8, 5.6, 4])
            if (spot) {
                // The experiment restarts, so the stopwatch does. The promise is "from cold,
                // standing in a live beam at distance d, noticed inside the budget" — and a
                // budget that includes the two seconds the driver spent looking for a beam
                // measures the driver.
                tSpot = t.engine().st.elapsed
                samples.length = 0
                t.events()
            }
        }
    }
    const st = t.state().sim
    // Whatever else happened, nobody stays parked in the light: every later section needs
    // the crew intact, and an alerted guard remembers where this one was standing. Walk
    // toward the cart rather than a fixed offset — an offset is a coin toss on a wall, and
    // a teleport into a wall resolves outward, which is how a driver ends up in a cone.
    t.calm()
    const cartM = t.marks().find(m => m.ch === 'S')
    const q = t.probe()
    if (cartM) {
        const dx = cartM.wx - q.x, dz = cartM.wz - q.z
        const len = Math.hypot(dx, dz) || 1
        for (const s of [2.4, 1.6, 1]) {
            t.moveTo(q.x + dx / len * s, q.z + dz / len * s)
            if (['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) break
        }
    }
    // **Does the meter fill at the rate the game says it should?** `why().rate` is the
    // per-second term the stealth model publishes, so standing in a live beam for `stood`
    // seconds has to produce roughly `rate × stood` of meter (capped, and with slack for the
    // frame the alert lands on). This is the frame-rate-independent version of the budget
    // check above: the budget is a wall of seconds that a slow box can miss for reasons of
    // its own, whereas a meter at a tenth of its own claimed rate means the sight test is
    // being asked at an instant that no longer describes the cone. It is the number that was
    // 0.15 against 1.3/s on the CI runner while every laptop measured ~1.
    // **Give the extras back before anything else reads this world.** A parked watcher is a
    // stage direction, not a fact about the job: leave two of them off the map and every
    // section after this one — the rescue, the verbs, the getaway — runs a smaller guard
    // force than the level actually has, and the failure looks like luck when the runner is
    // fast enough to finish before anyone walks back.
    for (const p of keptSnap) t.restoreWatcher(p.i, p.snap)
    // **Does the beam integrate at the rate it advertises?**
    //
    // Not by polling `det` — that is a trap which bit this file twice. `alertWatcher`
    // WIPES `w.det[k]` on the frame it bags you, so wherever the alert lands between two
    // samples the poller reads 0.00 and files "the stealth model stopped noticing" about a
    // run that got spotted in 0.2 s. It happened once at 60 fps and once at 5 fps, same
    // cause, and both times the number on screen was a perfect-looking measurement of
    // nothing. An alert is therefore the strongest evidence there is that the meter reached
    // 1, and what gets asserted is the integral the game cannot erase: bagged after
    // `spottedAt` seconds in a beam whose own `why()` published `rate` per second means the
    // meter integrated `rate × spottedAt`, and that product has to be near 1. Too big and
    // the beam integrated faster than it advertises; too small and it was not integrating
    // the way it claims. No magic constants — the game supplies both terms — and unlike the
    // seconds budget above it, this one does not move when the frame rate moves.
    const alerted = spottedAt >= 0
    const span = alerted ? spottedAt : stood
    const want = spot ? Math.min(1.15, spot.rate * span) : 0
    const ramp = spot ? +(spot.rate * span).toFixed(2) : 0
    const eff = !spot ? 1 : (want > 0.05 ? (alerted ? 1 : peak) / want : 1)
    return { spot, samples, peak: +peak.toFixed(2), why, caged: t.probe().caged, heat: st.heat, penned: penned(),
        eff: +eff.toFixed(2), ramp, alerted, want: +want.toFixed(2), stood: +stood.toFixed(2),
        offstage: keptSnap.length,
        busted: penned(), revived, spottedAt: spottedAt < 0 ? -1 : +spottedAt.toFixed(2) }
})
if (seen.offstage) console.log(`  ..    staged     ${seen.offstage} watcher(s) walked off the map for this section, so the number below is `
    + `ONE torch noticing you (${seen.revived || 0} arrest(s) undone mid-section). They are back on their routes now.`)
if (!seen.spot) console.log('  ..  no cell in any cone:', JSON.stringify(seen.why))
if (seen.spot && seen.spottedAt < 0) console.log('  ..  parked and never noticed — the game said:', JSON.stringify(seen.why))
claim('a torch beam has floor to land on', !!seen.spot, JSON.stringify(seen.spot))
if (seen.spot) console.log(`  ..  parked in the fastest cone the hunt found: ${seen.spot.rate} meter/s at ${seen.spot.d} m`)
// Samples are ~320 ms apart, so "noticed in about a second and a half" means the meter
// has to be past 0.9 by the fifth sample. It used to take roughly three times that,
// which is why a playtest could stand in a torch beam at arm's length and wonder why
// nothing happened.
{
    const S2 = seen.samples || []
    // The budget scales with the distance the driver actually managed to stand at, because
    // 2.5 m and 5.6 m are different questions. It is tuned so the previous curve (2.6/dist)
    // fails it everywhere: at 5 m the old numbers needed ~2.4 s and the budget is 1.65 s.
    // A threshold loosened until the bug fits is not a check. Both numbers are seconds of
    // *game* time, which is the only clock the promise was ever made against.
    // The design promise, plus the sampling slack the engine physically needs. `0.55 + d*0.22`
    // is the shape the stealth model is tuned to ("noticed in about a second at five metres")
    // and it stays the assertion at 60 fps, where the slack is 30 ms and rounds to nothing.
    // But sight is evaluated once per FRAME: a torch can only notice you on a frame it is
    // drawn, so at the CI runner's 7 fps the honest floor under this number is two frames
    // higher, and calling that a game bug is how a red kept appearing on a box nobody could
    // reproduce locally (measured: noticed in 1.6 s against a 1.43 s budget at 9 fps, with
    // the meter filling at its own quoted rate the whole way). The slack is computed from the
    // frame rate the game itself reports and printed in the detail, so it is auditable rather
    // than a quietly loosened threshold.
    const fpsNow = (await api(() => window.__heistTest.probe().fpsAvg)) || 60
    const slack = +Math.min(0.5, 2 / Math.max(1, fpsNow)).toFixed(2)
    const budget = +(0.55 + (seen.spot ? seen.spot.d : 3) * 0.22 + slack).toFixed(2)
    claim('a torch at working range notices you inside the budget', seen.spottedAt >= 0 && seen.spottedAt < budget,
        `spotted after ${seen.spottedAt < 0 ? 'never' : seen.spottedAt.toFixed(1) + ' s of game time'} at ${(seen.spot ? seen.spot.d : 0)} m (budget ${(budget - slack).toFixed(2)} s + ${slack} s of frame slack at ${Math.round(fpsNow)} fps; meter ${S2.map(d => d.toFixed(2)).join(' > ')})`, 8)
}
claim('the meter fills at the rate the game says it should', (seen.eff ?? 1) > 0.45 && (seen.ramp ?? 1) < 2.2,
    `${(seen.spot ? seen.spot.rate : 0)}/s beam for ${seen.alerted ? seen.spottedAt : seen.stood} s integrates to ${seen.ramp} (wanted ~1, and no more than 2.2x that)`
        + (seen.alerted ? ` — and the BAGGING is the evidence: the meter is wiped the frame it fires, so the polled residue of ${seen.peak} is not the peak`
            : ` — polled peak ${seen.peak}, and it never bagged them`)
        + (seen.revived ? ` — after putting ${seen.revived} prisoner(s) back on their feet: a caged raccoon's meter is pinned at zero, so polling one proves nothing` : ''), 8)
claim('standing in a torch beam raises suspicion', (seen.peak || 0) > 0.15 || seen.alerted,
    `peak meter ${(seen.peak || 0).toFixed(2)}${seen.alerted
        // A poll after the alert reads zero BY DESIGN, so say so here rather than letting
        // the number look like the finding.
        ? `, and it BAGGED the crew at ${seen.spottedAt} s (a poll after that reads zero by design)`
        : ` (last window ${((seen.samples || []).join('>')) || 'empty — the driver re-hunted'})`}`
    // A busted job does not update its meter at all, so a zero here after a bust is a
    // report about the DRIVER getting the crew caught, not about the stealth model.
    + (seen.busted ? ` — and the job BUSTED during the hunt (${seen.busted} in the pound): this line is about the driver, not the game` : ''), 8)
r.info('the cost of standing in the light', `${seen.penned} in the pound by the end of this section — the driver steps out of the beam the moment one goes in, and never watches \`probe().caged\`, which resets when being caught hands you the next raccoon`)
// **The one CI is allowed to answer.** Everything above this line needs a fair few frames
// per second just to STAGE itself: the hunt has to catch three consecutive "I see you"
// samples 80 ms apart before the stopwatch may start, and on the runner's 5 fps it could
// not, so four checks there skipped — honest, but a suite that skips its way to green on the
// only machine that keeps finding bugs is not much of a guard. So this one stages with a
// single warp instead of a hunt, and asks only whether the meter moves and how long it took:
// one ALERT guard, five metres away, facing an uncaged raccoon standing on floor. No sweep to
// catch, no cell to score — and it still fails if the sight test, the light term or the
// detection meter stops working.
//
// Two things this learned the hard way, both about the world rather than the assertion:
//   * **A staged guard is a loan.** The first version left him alert in the middle of the
//     map; he hunted the courier through the next two sections and the cart reported
//     `cargo sticks to the raccoon (held: null)` — a red about the GRAB button.
//   * **Five metres, not three.** Alert guards close, and a bagging at contact range is
//     over in under a second. At 3 m this check got the actor caged on the runner, the sim
//     auto-switched to a crewmate, and the pound arrived at the rescue section already full
//     — which then reported as "the pound does not open". The threshold is 0.15 of meter,
//     which an alert cone at 5 m reaches long before its owner does.
const pointBlank = await api(async () => {
    const t = window.__heistTest
    const free = t.state().sim.crew.find(c => !c.caged)
    if (!free) return null
    t.calm()
    t.switchTo(free.idx)
    const me = t.probe()
    // Pick the torch FIRST, then park everybody else. The first version parked in one loop
    // and chose in a second loop that skipped the parked indices — so it parked every
    // watcher, found nobody left to stand five metres away, returned null, and the three
    // checks underneath quietly never ran, on any machine. The `api()` bridge resolves to
    // nothing when the page function bails, so an `if (result)` block around checks is how a
    // test disappears while the suite stays green; that is why the claim below is unconditional.
    const n = t.watchers().length
    let wi = -1
    for (let i = 0; i < n; i++) {
        const x = t.watchers()[i]
        if (x.kind === 'guard') { wi = i; break }
    }
    if (wi < 0 && n) wi = 0
    const snap = wi >= 0 ? t.watcherAt(wi) : null
    const w = wi >= 0 ? t.warpWatcher(wi, me.x - 5.0, me.z, 'alert') : null
    const parked = []
    for (let i = 0; i < n; i++) {
        if (i === wi) continue
        const s2 = t.watcherAt(i)
        const far = t.watchers()[i]
        // Off the map AND off duty: a parked-but-patrolling watcher paths home mid-section.
        if (t.parkWatcher(i, far.x, far.z - 20)) parked.push({ i, snap: s2 })
        else if (t.warpWatcher(i, far.x, far.z - 20, 'patrol')) parked.push({ i, snap: s2 })
    }
    const putBack = () => {
        if (wi >= 0 && snap) t.restoreWatcher(wi, snap)
        for (const q of parked) t.restoreWatcher(q.i, q.snap)
        // Anything this check got bagged comes out of the sack: it is a stage artifact, and
        // leaving it in means the rescue section inherits a full pound and reports the pound
        // as broken.
        const stuck = t.state().sim.crew.filter(c => c.caged)
        for (const c of stuck) t.release(c.idx)
        t.calm()
    }
    if (!w) { putBack(); return null }
    // **Place him where the game says he can see, not where a formula says.** Five metres
    // due west is a formula, and on the runner it put him inside a wall: `losWorld` then says
    // no for the whole six-second window and the meter never leaves zero — a red that reads
    // "detection is broken at 4 fps" and is really "the driver stood a guard in masonry". The
    // laptop never saw it because the sections before this one leave the crew somewhere else
    // at 60 fps. So try eight directions and three ranges, ask `why()` after each, and keep the
    // first placement the GAME calls a clean sightline. If none of the 24 works, that is the
    // finding, and the arithmetic comes back with it.
    let det = 0
    let gotCaged = 0
    let tries = []
    let seen = false
    for (const d of [5, 4, 6]) {
        if (seen) break
        for (const [ux, uz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]]) {
            const gx = me.x + ux * d, gz = me.z + uz * d
            t.warpWatcher(wi, gx, gz, 'alert', [me.x, me.z])
            await window.__simSleep(0.12)
            const q = t.why().find(x => x.kind === t.watchers()[wi].kind) || null
            if (q && q.los && q.inCone && q.inRange) { seen = true; tries.push(`${d}@${ux},${uz} OK`); break }
            tries.push(`${d}@${ux},${uz} ${q ? `${q.los ? '' : 'no-LOS '}${q.inCone ? '' : 'off-cone '}${q.inRange ? '' : 'out-of-range'}`.trim() : 'no-entry'}`)
        }
    }
    if (!seen) return { det: 0, took: -1, gotCaged: 0, parked: parked.length, tries,
        at: [me.x.toFixed(1), me.z.toFixed(1)], cell: me.cell, back: null, alert: 0, noStage: true }
    const t0 = t.engine().st.elapsed
    let took = -1
    for (let i = 0; i < 60 && det < 0.15; i++) {
        await window.__simSleep(0.1)
        det = Math.max(det, t.probe().det)
        if (t.probe().caged || t.state().sim.phase !== 'play') { gotCaged++; break }
        if (det >= 0.15) took = t.engine().st.elapsed - t0
    }
    putBack()
    return {
        det: +det.toFixed(2), took: +took.toFixed(2), gotCaged, parked: parked.length, tries,
        at: [me.x.toFixed(1), me.z.toFixed(1)], cell: me.cell,
        back: wi >= 0 && snap ? t.watcherAt(wi).at : null,
        alert: t.watchers().filter(x => x.state === 'alert').length,
    }
})
// Loud, on purpose. `api()` resolves to nothing when the page function throws, so a check
// written as `if (result) { ... }` can disappear from the report entirely — green, and nobody
// looked. That is the same shape as the empty-pound bug this file already documents, in a new
// costume: a check that silently stops running.
claim('the point-blank stage could be set at all', !!pointBlank,
    'no free crew to stand, or every warp refused — the three checks that would have run here '
    + 'are about a torch noticing you, and their absence is not evidence of anything', 8)
if (pointBlank) {
    claim('the driver found a spot the guard could actually see from', !pointBlank.noStage,
        `24 placements tried from ${pointBlank.at} (${pointBlank.cell}); none gave a clean sightline: ${pointBlank.tries.join(' | ')}`, 4)
    claim('an alert guard within reach starts to notice', pointBlank.det >= 0.15,
        `meter reached ${pointBlank.det} in ${pointBlank.took} s of game time on ${pointBlank.cell} `
        + `(${pointBlank.parked} other watcher(s) parked, ${pointBlank.gotCaged} bagging(s) undone afterwards)`, 4)
    claim('and that took roughly the second the model promises', pointBlank.took > 0.05 && pointBlank.took < 3.5,
        `${pointBlank.took} s of game time for a 5 m alert cone — the floor here is the game's 4 fps, not the hunt's`, 4)
    // Not decoration: the first version of this check left an alert guard loose and the only
    // reason anyone noticed was a dozen reds two sections later about grabbing things.
    claim('the staged guard went home and took nobody with him', pointBlank.alert === 0 && pointBlank.gotCaged === 0,
        `${pointBlank.alert} watcher(s) still alert on the way out, ${pointBlank.gotCaged} crew bagged by the stage direction itself`, 4)
}

claim('being spotted is announced', seen.spottedAt >= 0 || seen.heat > 10, `spot at ${seen.spottedAt} s of game time, heat ${Math.round(seen.heat)}`, 8)
if (!(Math.max(...(seen.samples || [0])) > 0.15)) console.log('  ..  detection arithmetic:', JSON.stringify(seen.why))

await pace()
floorClaim()
console.log('\nCAUGHT + RESCUED')
const caught = await api(async () => {
    const t = window.__heistTest
    const inPound = () => t.state().sim.crew.filter(c => c.caged).length
    // Baseline *before* any staging. Taking it afterwards is how the staging itself got
    // two raccoons bagged unnoticed, and the loop below then only needed one more to end
    // the job: at 16 fps every poll is 60 ms of world time, and a teleport onto a guard's
    // chest is not a polite suggestion.
    const nest = inPound()
    // Where the crew actually stands when this set-piece starts. When the pound is already
    // full by now, everything below is a corpse being prodded, and the fifteen reds that
    // follow are one bug wearing fifteen hats — so say what the crew looked like here.
    const atEntry = t.state().sim.crew.map(c => `${c.name}:${c.caged ? 'CAGED' : 'free'}@${c.x.toFixed(0)},${c.z.toFixed(0)}`)
    if (nest >= t.state().sim.crew.length - 1) console.log(`  ..  crew at CAUGHT entry: ${atEntry.join(' ')} phase=${t.probe().phase}`)
    // Park every raccoon this test is not using far from every guard, then pick the victim.
    // "Far" has to be *measured*: the first version parked them on the cart, which sits on
    // a patrol route, and teleporting a crewmate onto a guard standing there is an instant
    // bagging — so the driver's own safety measure put two more in the pound and ended the
    // job. Candidates are scored by distance to the nearest watcher and tested for floor
    // after the move, because a teleport into a wall resolves outward, into whoever
    // happens to be standing there.
    const floorish = c => ['FLOOR', 'MARBLE', 'BUSH'].includes(c)
    const parkSpot = () => {
        const ws = t.watchers()
        for (const m of t.marks()) {
            for (const [dx, dz] of [[0, 2.4], [2.4, 0], [-2.4, 0], [0, -2.4], [3.2, 3.2], [-3.2, 3.2], [3.2, -3.2], [-3.2, -3.2]]) {
                const x = m.wx + dx, z = m.wz + dz
                if (ws.some(w => Math.hypot(x - w.x, z - w.z) < 6)) continue
                t.moveTo(x, z)
                if (floorish(t.probe().cell)) return { x, z }
            }
        }
        return null
    }
    const freeCrew = t.state().sim.crew.filter(c => !c.caged)
    if (!freeCrew.length) return { caged: nest, phase: t.probe().phase, msg: 'nobody free to catch — the job was over before this set-piece', trail: [], who: null, bagged: [], cool: [], parked: 0, atEntry }
    let parked = 0
    for (const c of freeCrew.slice(1)) {
        if (inPound() > nest) break            // something already went wrong; stop staging
        t.switchTo(c.idx)
        if (parkSpot()) parked++
    }
    t.switchTo(freeCrew[0].idx)
    // Get noticed first (close, in the beam, in the open), then close the last metre.
    // Contact alone is not enough by design: an unruffled guard mid-patrol does not
    // bag a raccoon standing on its foot, it notices it first.
    let who = null
    for (const w of t.watchers()) {
        if (who || inPound() > nest) break
        for (const d of [2.2, 3]) {
            // Ask *before* teleporting, not after: two alerted guards can each finish a
            // bagging between two looks at 17 fps, and the second one lands on a
            // crewmate this driver just parked on the wrong chest.
            if (inPound() > nest) break
            const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
            t.moveTo(x, z)
            await window.__simSleep(0.12)
            if (inPound() > nest) break
            if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
            if (t.why().find(q => q.los && q.inCone && q.inRange)) { who = { kind: w.kind, x, z }; break }
        }
    }
    if (inPound() > nest) {
        // Somebody is already bagged. Stand the cast down and walk whoever has the
        // controls out of arm's reach before the second guard finishes its swing.
        t.calm()
        const p = t.probe()
        t.moveTo(p.x + 2.5, p.z + 2.5)
    }
    const trail = []
    for (let i = 0; i < 14; i++) {
        await window.__simSleep(0.36)
        const w = t.watchers().find(x => x.kind === (who && who.kind)) || t.watchers()[0]
        // Stop parking on the guard the moment somebody has been bagged. Being caught
        // switches you to a crewmate standing on the same square as a 3.4 m/s guard, and
        // this loop driving him back onto that guard every poll is not testing the pound,
        // it is staging a bust -- which is what it did on a slow machine.
        if (w && inPound() === nest) t.moveTo(w.x + Math.sin(w.yaw) * 0.4, w.z + Math.cos(w.yaw) * 0.4)
        const p = t.probe()
        trail.push(`${w ? w.state : '?'}:${p.det.toFixed(1)}`)
        if (inPound() > nest) {
            t.calm()
            // And walk the new one out of arm's reach before anything else happens.
            t.moveTo(p.x + (w ? -Math.sin(w.yaw) * 2.6 : 2), p.z + (w ? -Math.cos(w.yaw) * 2.6 : 2))
            break
        }
    }
    // Back off to the pound, which is where the rescue happens anyway and is not inside
    // anybody's cone.
    t.calm()
    const free = t.state().sim.crew.find(c => !c.caged)
    if (free) t.switchTo(free.idx)
    const crew = t.state().sim.crew
    return {
        caged: crew.filter(c => c.caged).length, phase: t.probe().phase, msg: t.state().sim.msg, trail, who, parked,
        // How the pound filled, from the sim's own mouth. When it fills with three the
        // driver staged a bust and this is the line that says which guard did it and when.
        bagged: t.events().filter(e => e.type === 'caught' || e.type === 'swap').map(e => `${e.type}:${e.who || ''}@${e.x?.toFixed?.(1)}`),
        cool: t.watchers().map(x => `${x.kind}:${(x.cool || 0).toFixed(1)}/${x.state}`),
    }
})
claim('a watcher in contact bags a raccoon', caught.caged >= 1, `${caught.caged} in the pound`)
console.log(`  ..  the pound filled: ${JSON.stringify(caught.bagged)}  guards ${JSON.stringify(caught.cool)}  staged ${JSON.stringify(caught.who)}  parked ${caught.parked}`)
claim('one raccoon down is not game over', caught.phase === 'play', caught.phase)

// Stand at the pound with somebody still inside and photograph the door. This is the
// frame the playtest could not get: "you need to draw the lock somehow, if I'm supposed
// to chew through the lock… I don't see a lock". The affordance check is the same claim
// as a number rather than a picture, and it is taken here too — with the cage actually
// locked, not after the rescue has already emptied it.
const staged = await api(async () => {
    const t = window.__heistTest
    const pound = t.marks().find(m => m.ch === 'P')
    const crew = t.state().sim.crew
    const caged = crew.find(c => c.caged)
    const free = crew.find(c => !c.caged && !c.active) || crew.find(c => !c.caged)
    if (!pound || !caged || !free) return null
    t.calm()
    t.switchTo(free.idx)
    t.moveTo(pound.wx + 0.6, pound.wz + 0.6)
    let hint = ''
    for (let i = 0; i < 15 && !hint; i++) {
        await window.__simSleep(0.1)
        hint = t.state().sim.hint
    }
    return { hint, aff: t.afford(), caged: crew.filter(c => c.caged).length }
})
if (staged) {
    verbs.push({ ...(staged.aff || {}), tag: 'at the pound, someone inside' })
    r.check('a locked cage shows a locked door', !!staged.aff && staged.aff.ok === true,
        JSON.stringify(staged.aff && { kind: staged.aff.kind, want: staged.aff.want, hit: staged.aff.hit, near: (staged.aff.near || []).map(m => `${m.mat} ${m.d}m`) }))
}
// A mesh inside an invisible parent draws nowhere, so it must not count as something the
// player can see. Written the obvious way — `if (!o.visible) return`, the leaf only — the
// probe passes while the padlock is hidden and every affordance check in this file stays
// green, so this is pinned directly rather than trusted to the route above.
const hidden = await api(() => {
    const t = window.__heistTest
    const lock = t.world().cage && t.world().cage.userData.padlock
    if (!lock) return null
    lock.visible = false
    const a = t.afford()
    lock.visible = true
    return { kind: a && a.kind, hit: a && a.hit, near: a ? a.near.length : -1 }
})
r.check('a lock nobody can see is not an affordance', !!hidden && hidden.hit === null, JSON.stringify(hidden))
await page.screenshot({ path: path.resolve('scripts/.shots/h21-pound-lock.png') }).catch(() => {})

const rescue = await api(async () => {
    const t = window.__heistTest
    const marks = t.marks()
    const pound = marks.find(m => m.ch === 'P')
    const log = []
    const cagedCount = () => t.state().sim.crew.filter(c => c.caged).length
    // Fill the pound deliberately. If the crew arrives here walking free — which on a slow
    // box the earlier set-pieces can absolutely do — this section breaks out on the first
    // round and reports *nothing*, and that silence is how two mutants ("chewing does not
    // shake the lock", "a chew that frees one leaves the cage open") walked green through a
    // whole run: the checks they were supposed to redden are inside the loop that never ran.
    let staged = false
    const WANT_PRISONERS = 2
    if (cagedCount() < WANT_PRISONERS) {
        staged = true
        // Enough arrests to fill the pound. One prisoner is not enough: the branch that
        // says "a chew which frees one of two must leave the cage shut" only exists when a
        // second raccoon is still inside, and with one prisoner the whole branch is dead
        // code with a green check mark under it.
        for (let try2 = 0; try2 < WANT_PRISONERS - cagedCount(); try2++) {
            const freeC = t.state().sim.crew.find(c => !c.caged)
            // Never take the last one that can walk. This section needs a prisoner and a
            // rescuer; a run that arrives with the pound already half full otherwise ends
            // here, and every check downstream is a corpse being prodded.
            if (!freeC || t.state().sim.crew.filter(c => !c.caged).length <= 1) break
            t.switchTo(freeC.idx)
            const a = t.probe()
            t.warpWatcher(try2, a.x + 2.0, a.z + 1.0, 'alert')
            const n0 = cagedCount()
            for (let i = 0; i < 24 && cagedCount() === n0; i++) await window.__simSleep(0.15)
            t.calm()
        }
    }
    const startedCaged = cagedCount()
    // Free everybody, one chew at a time. This also proves the rescue is repeatable —
    // a pound you can only open once is a pound that ends the run for the rest of the
    // crew, which is exactly the dead-end the "caught is not game over" rule forbids.
    for (let round = 0; round < 4; round++) {
        const crew = t.state().sim.crew
        if (!crew.some(c => c.caged)) break
        const free = crew.find(c => !c.caged && !c.active) || crew.find(c => !c.caged)
        if (!free) break
        t.switchTo(free.idx)
        const me = t.state().sim.crew.find(c => c.active)
        t.moveTo(pound.wx + 0.6, pound.wz + 0.6)
        // Poll for the affordance instead of sleeping a fixed guess: the button label is
        // recomputed on the simulation's clock, and asking "does it appear within 1.5 s"
        // is the actual requirement. A fixed 260 ms sleep failed on a loaded runner and
        // passed on an idle one, which is the worst kind of red.
        let label = ''
        for (let i = 0; i < 15 && !label; i++) {
            await window.__simSleep(0.1)
            label = t.state().sim.hint
        }
        // The lock is the affordance for this verb. Ask three questions of it: is it
        // there at all, does it shake while somebody is chewing, and does it come off.
        const aff = t.afford()
        const lock = (t.world().cage && t.world().cage.userData.padlock) || null
        const home = lock ? [lock.position.x, lock.position.y, lock.position.z] : null
        const shake = []
        // The engine's own rattle amplitude, sampled alongside the geometry: "the lock is
        // the progress bar" is a claim about `userData.shake` driving a visible wobble, and
        // at 6 fps a per-frame jitter aliases too hard to prove by eye alone.
        const wob = []
        // How many times the swinging lock changed direction. A rattle goes back and
        // forth; a lock that has just been chewed off goes down once, and the first
        // version of this measured *any* movement — so with the rattle switched off in the
        // engine the suite still "saw" 0.32 m of shaking, which was the fall, and a
        // mutant walked green through the whole file. Lateral, hanging, and repeated, or
        // it is not a rattle.
        let flips = 0
        let swing = 0
        let lastSide = 0
        const t0 = window.__gameTime()
        const before = t.state().sim.crew.filter(c => c.caged).length
        t.hold(true)
        let took = 0
        for (let i = 0; i < 22; i++) {
            await window.__simSleep(0.13)
            if (lock) {
                const dx = lock.position.x - home[0]
                const hanging = Math.abs(lock.position.y - home[1]) < 0.05 && Math.abs(lock.position.z - home[2]) < 0.05
                if (hanging) {
                    shake.push(+Math.abs(dx).toFixed(4))
                    wob.push(+(lock.userData.shake || 0).toFixed(3))
                    if (Math.abs(dx) > 0.0015) {
                        const side = Math.sign(dx)
                        if (lastSide && side !== lastSide) flips++
                        lastSide = side
                        swing = Math.max(swing, Math.abs(dx))
                    }
                }
            }
            // Measure the moment the *count drops*, not the moment the pound empties:
            // with two locked up, the first chew only frees one.
            if (t.state().sim.crew.filter(c => c.caged).length < before) { took = window.__gameTime() - t0; break }
        }
        t.hold(false)
        await window.__simSleep(0.7)
        log.push({
            by: me ? me.name : '?', label, took: +took.toFixed(2),
            caged: t.state().sim.crew.filter(c => c.caged).length,
            here: t.probe().cell, at: [t.probe().x, t.probe().z],
            aff, shook: shake.length ? Math.max(...shake) : -1, shake, flips, swing: +swing.toFixed(4),
            wob: +Math.max(0, ...wob).toFixed(3),
            n: shake.length, fps: Math.round(window.__fps || 0),
            lockY: lock ? +lock.position.y.toFixed(3) : null,
            lockHome: home ? home.map(n => +n.toFixed(2)) : null,
        })
        await window.__simSleep(0.3)
    }
    return { log, caged: t.state().sim.crew.filter(c => c.caged).length, staged, startedCaged }
})
claim('the pound offers to chew a friend loose', /CHEW/i.test((rescue.log[0] || {}).label || ''), (rescue.log[0] || {}).label)
// Not a nicety: every lock assertion below lives inside a loop over `rescue.log`, so an
// empty pound is an empty suite reporting a clean bill of health.
claim('the rescue section had a prisoner to chew', rescue.log.length >= 1,
    `${rescue.log.length} chews, pound started at ${rescue.startedCaged}${rescue.staged ? ' (the driver staged the arrest itself)' : ''}`)
claim('a friend comes out of the pound', rescue.caged === 0, `${rescue.caged} still locked up`)
console.log('  ..  rescues:', JSON.stringify(rescue.log.map(l => ({ ...l, aff: l.aff && { kind: l.aff.kind, hit: l.aff.hit, ok: l.aff.ok }, shake: undefined }))))
const slowest = Math.max(0, ...rescue.log.map(l => l.took))
claim('a rescue is desperate, not a chore', slowest > 0.3 && slowest < 4, `${slowest} s of game time for the slowest padlock`)
// Every rescue round must find a lock on the door — including the second one, after the
// first was chewed off. That is what `catchCrew` re-hanging the padlock buys, and it is
// the difference between "the pound works" and "the pound works once".
for (const l of rescue.log) {
    verbs.push({ ...(l.aff || {}), tag: 'at the pound' })
    r.check('the padlock is there to chew, every time it is offered', !!l.aff && l.aff.ok === true,
        JSON.stringify(l.aff && { kind: l.aff.kind, want: l.aff.want, hit: l.aff.hit, near: (l.aff.near || []).map(m => `${m.mat} ${m.d}m`) }))
    r.check('the lock is named as the lock, not as cage bars', !!l.aff && (l.aff.near || []).some(m => m.mat.includes('padlock')),
        JSON.stringify((l.aff && l.aff.near || []).map(m => `${m.mat} ${m.d}m`)))
}
{
    // The lock visibly rattles: lateral, and it has to come back, because "it moved" is
    // also true of a lock that has just been chewed off and fallen.
    // `every` over an empty list is true, and this check passed once on a run where the
    // pound was empty and nothing was chewed at all. Assert there was something to chew.
    const swung = rescue.log.length > 0 && rescue.log.every(l => l.swing > 0.004 && l.wob > 0)
    // ...but "and it reverses direction" needs enough *frames* to see a reversal in. At
    // 1 fps a 1.5 s chew yields two or three samples of the lock, so demanding two flips
    // there is a claim about the refresh rate. Below that the driver reports what it saw
    // instead of failing: this is the check that red'd on CI with `swing 0.0085 / 0.0137 m
    // over 2 / 1 direction changes` — the rattle was real, the camera was once a second.
    // A per-frame jitter sampled at 8 fps aliases: the driver can watch a lock visibly
    // rattling for eight samples and record one direction change. Requiring a reversal is
    // only fair above a frame rate that can resolve one; below it the amplitude has to
    // carry the claim — and both the engine's own rattle value and a measured lateral swing
    // still have to be there, so switching the shake off in the engine still reddens this.
    const enough = rescue.log.every(l => l.n >= 6 && l.fps >= 25)
    claim('the lock shakes while it is being chewed', swung && (!enough || rescue.log.every(l => l.flips >= 2)),
        `peak hang-time swing ${rescue.log.map(l => l.swing).join(' / ')} m, rattle ${rescue.log.map(l => l.wob).join(' / ')} over ${rescue.log.map(l => l.flips).join(' / ')} direction changes (${rescue.log.map(l => `${l.n} samples @ ${l.fps} fps`).join(', ')}${enough ? '' : ' — too few frames to require a reversal'})`)
}
for (const l of rescue.log) {
    // The lock is wherever the pound's state says it should be: on the door while
    // anybody is still inside, on the ground once the cage is empty. A chew that frees
    // one of two must not leave the second one in an unlocked cage with the HUD still
    // saying CHEW — that was the second bug this section caught.
    const empty = l.caged === 0
    r.check(empty ? 'the last lock comes off the door' : 'the door stays locked while somebody is still in there',
        l.lockY !== null && (empty ? l.lockY < 0.3 : l.lockY > 0.4), `lock y ${l.lockY} with ${l.caged} still caged`)
}

// Revive the job if the runner beat it. Under the frame-rate floor a set-piece can lose
// the whole crew — a guard only redraws once per frame, and a driver that teleports into
// a torch beam on a 2 fps box is not playing stealth, it is losing — and a busted job
// offers no verbs at all, which would then be reported as "the grab button is broken".
// So: free everybody, stand the cast down, put the shell back on the job, and PRINT how
// much reviving the machine needed. At 60 fps this is a no-op that reports zero.
const revived = await api(async () => {
    const t = window.__heistTest
    const s = t.state().sim
    const stuck = s.crew.filter(c => c.caged)
    if (s.phase === 'play' && !stuck.length) return { revived: 0, was: 0, phase: s.phase, caged: 0 }
    const cart = t.marks().find(m => m.ch === 'S')
    t.calm()
    for (const c of s.crew) t.release(c.idx)
    t.release(0, cart.wx, cart.wz + 2.0)
    t.switchTo(0)
    t.goto('play')
    await window.__simSleep(0.4)
    const p = t.probe()
    return { revived: stuck.length || 1, was: stuck.length, phase: p.phase, at: [p.x, p.z], caged: t.state().sim.crew.filter(c => c.caged).length }
})
if (revived.revived) {
    r.skip('the crew was already standing for the structural sections',
        `${revived.was} were in the pound (phase was not play); the runner put them back at ${JSON.stringify(revived.at)} — `
        + `this is a machine that ran under the floor, not a job that can be played`)
}
// If even the harness cannot get the job back to a raccoon standing on floor with a hand
// free, that is not a slow box — that is a broken `release`/`goto` path, and every verb
// check below would be theatre.
r.check('the job can be put back on its feet', revived.phase === 'play' && revived.caged === 0,
    JSON.stringify(revived))
console.log('\nEVERY VERB HAS A BODY')
// "Every interaction has a body in the world." The pound offered `CHEW ULTRA LOOSE` at a
// cage with no lock on it, and the harness saw nothing wrong because no check ever asked
// whether the thing the verb named was drawn anywhere. So: stand at each verb and ask.
// `chew` and `free` were observed at their own set-pieces above; this closes the set.
const marks2 = await api(() => window.__heistTest.marks())
const loose2 = await api(() => window.__heistTest.lootList())
const undelivered = loose2.filter(l => !l.taken && !l.delivered)
// `focus()` ranks take above shiny above can, so a shiny parked inside a pile's radius
// is never the verb on offer there. Pick a mark that stands clear.
const clearOfPile = (m) => !undelivered.some(l => Math.hypot(l.x - m.wx, l.z - m.wz) < 1.6)
const shinyMark = marks2.filter(m => m.ch === 'N').find(clearOfPile) || marks2.find(m => m.ch === 'N')
const canMark = marks2.filter(m => m.ch === 'T').find(clearOfPile) || marks2.find(m => m.ch === 'T')
const cartMark2 = marks2.find(m => m.ch === 'S')
if (undelivered[0]) await affordAt('at a loot pile', undelivered[0].x, undelivered[0].z, 'take')
if (shinyMark) await affordAt('at a shiny', shinyMark.wx, shinyMark.wz, 'shiny')
if (canMark) await affordAt('at a trash can', canMark.wx, canMark.wz, 'can')

// The cart verb needs cargo in hand, so give it cargo — then hand the pile over, which
// is what the job wants anyway.
if (cartMark2 && undelivered.length) {
    const haul = undelivered[undelivered.length - 1]
    const cartVerb = await api(async ([hx, hz, cx, cz]) => {
        const t = window.__heistTest
        t.moveTo(hx, hz)
        await window.__simSleep(0.22)
        const held = (t.tap('grab'), t.probe().held)
        await window.__simSleep(0.26)
        const have = t.probe().held
        t.moveTo(cx, cz)
        await window.__simSleep(0.26)
        const a = t.afford()
        if (t.probe().held) t.tap('grab')
        await window.__simSleep(0.26)
        return { held: have, first: held, a, delivered: t.state().sim.delivered, total: t.state().sim.total, hands: t.probe().held }
    }, [haul.x, haul.z, cartMark2.wx, cartMark2.wz])
    r.check('cargo sticks to the raccoon', !!cartVerb.held || !!cartVerb.first, JSON.stringify(cartVerb))
    verbs.push({ ...(cartVerb.a || {}), tag: 'at the cart' })
    r.check('the cart verb is "deliver"', cartVerb.a && cartVerb.a.kind === 'deliver', cartVerb.a ? `${cartVerb.a.kind} (${cartVerb.a.label})` : 'no verb offered at the cart')
    r.check('"load the cart" has a cart to load', !!cartVerb.a && cartVerb.a.ok === true,
        JSON.stringify(cartVerb.a && { hit: cartVerb.a.hit, near: (cartVerb.a.near || []).map(m => `${m.mat} ${m.d}m`) }))
}

const engineSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/games/RaccoonHeist/engine.js'), 'utf8')
const focusBody = (engineSrc.split('function focus()')[1] || '').split('\n    }')[0]
const offeredKinds = [...new Set([...focusBody.matchAll(/kind: '([a-z]+)'/g)].map(m => m[1]))]
const missed = offeredKinds.filter(k => !verbs.some(v => v.kind === k))
// If `focus()` grows a seventh verb and nobody gives it a mesh, this is the check that
// says so — the alternative is finding out in a playtest, again.
r.check('every verb the sim can offer was body-checked', offeredKinds.length >= 6 && missed.length === 0,
    `focus() offers ${offeredKinds.join(', ')}; missed: ${missed.join(', ') || 'none'}; checked ${[...new Set(verbs.map(v => v.kind))].join(', ')}`)
const airy = verbs.filter(v => !v.ok)
r.check('not one verb points at empty air', airy.length === 0,
    airy.length ? airy.map(b => `${b.tag || '?'}:${b.kind || 'nothing'}`).join(', ') : `${verbs.length} verbs, all with bodies`)

console.log('\nTHE GETAWAY')
const finish = await api(async () => {
    const t = window.__heistTest
    const marks = t.marks()
    const cart = marks.find(m => m.ch === 'S')
    const gate = marks.find(m => m.ch === 'X')
    // This section is about CARRYING, so the yard is emptied first. The earlier sections
    // deliberately got the crew caught, which leaves the heat high, and a bagged courier
    // delivers nothing — so without this the tally below measures whether the AI happened
    // to wander past, which is the exact "SCENARIOS, NOT LUCK" rule the rest of the file
    // already applies. Guards are parked on the floor tile farthest from the cart and left
    // PATROLLING, so the world still lives; stealth itself is asserted up above, where a
    // raccoon actually stands in a beam until it is bagged.
    const parked = []
    let far = null
    for (let cx = -34; cx <= 34; cx += 2) {
        for (let cz = -30; cz <= 30; cz += 2) {
            const wx = cx * 2.2, wz = cz * 2.2
            if (t.navAt(wx, wz) !== 'FLOOR') continue
            const d = Math.hypot(wx - cart.wx, wz - cart.wz)
            if (!far || d > far.d) far = { wx, wz, d }
        }
    }
    if (far) for (let i = 0; i < t.watchers().length; i++) {
        const snap = t.watcherAt(i)
        if (!snap) continue
        parked.push({ i, snap })
        // `park`, not `warp`: the route goes with them and comes back with the snapshot.
        if (!t.parkWatcher(i, far.wx, far.wz)) t.warpWatcher(i, far.wx, far.wz, 'patrol')
    }
    // Where the point-blank guard was left, if the section above forgot. Printed because
    // "the cart section is being hunted" should be visible in the log, not inferred from
    // a dozen reds about grabbing.
    const stillAlert = t.watchers().filter(x => x.state === 'alert').length
    if (stillAlert) console.log(`  ..    leak       ${stillAlert} watcher(s) still ALERT entering the tally`)
    // Guards do get walked off the map above, but a patrol is a route, not a teleport
    // prison: the next tick paths them back toward their first node, and the cart section
    // takes long enough at 4 fps that they arrive. So if somebody goes into the sack during
    // the tally, put them back out and KEEP TALLYING — and print how often that happened.
    // The alternative is the failure this file already knows: one borrowed guard turns a
    // carrying check into twenty red rows about the arrest system.
    let hauled = 0
    const standUp = () => {
        const stuck = t.state().sim.crew.filter(c => c.caged)
        if (!stuck.length && t.state().sim.phase === 'play') return
        const cartHere = t.marks().find(m => m.ch === 'S')
        t.calm()
        for (const c of stuck) { t.release(c.idx, cartHere.wx + 1.5, cartHere.wz + 1.5); hauled++ }
        if (t.state().sim.phase !== 'play') t.goto('play')
        const free = t.state().sim.crew.find(c => !c.caged)
        if (free) t.switchTo(free.idx)
    }
    // Load the cart the honest way for the first pile, then walk the rest in: a
    // delivered pile is a delivered pile, but the first one proves the button path.
    for (const l of t.lootList()) {
        if (l.delivered) continue
        // If the runner gets bagged on the way (heat from the earlier tests is still
        // high, and it should be), swap to somebody loose and keep the job going — the
        // way a player would, rather than the way a script gives up.
        if (t.state().sim.crew.find(c => c.active && c.caged)) {
            const free = t.state().sim.crew.find(c => !c.caged)
            if (free) t.switchTo(free.idx)
        }
        standUp()
        t.moveTo(l.x, l.z)
        await window.__simSleep(0.12)
        t.tap('grab')
        await window.__simSleep(0.12)
        t.moveTo(cart.wx, cart.wz)
        await window.__simSleep(0.12)
        t.tap('grab')
        await window.__simSleep(0.12)
    }
    standUp()
    const loaded = t.state().sim
    await window.__simSleep(0.9)
    const open = t.probe().gate
    // If the job is still running, give the guards back: a parked world is a staged
    // world, and the sections after this one (and any future one) inherit it.
    if (t.state().sim.phase === 'play') for (const p of parked) t.restoreWatcher(p.i, p.snap)
    t.moveTo(gate.wx, gate.wz)
    await window.__simSleep(0.9)
    const s = t.state().sim
    const p = t.probe()
    return {
        delivered: loaded.delivered, total: loaded.total, open, phase: s.phase, result: s.result,
        screen: t.state().screen, at: [p.x, p.z], cell: p.cell, active: p.caged ? 'caged' : 'free',
        gate: marks.find(m => m.ch === 'X'), caged: s.crew.filter(c => c.caged).length,
        parked: parked.length, hauled, parkD: far ? Math.round(far.d) : null,
        parkAt: far ? [Math.round(far.wx), Math.round(far.wz)] : null,
    }
})
// Saying what the scenario did is the whole point: without this line the tally above
// reads as if the crew emptied the yard while guards patrolled it, which is not what
// happened and not what this section is testing.
console.log(`  ..    staged     ${finish.parked} guard(s) walked to ${finish.parkAt}, `
    + `${finish.parkD} m from the cart — this tally is about CARRYING; stealth is asserted above`)
// Said out loud, because it changes how to read the line below: a patrol that walked back
// into the yard and bagged the courier is a fact about the runner's speed, not about whether
// the cart works. At 60 fps this reports nothing.
if (finish.hauled) console.log(`  ..    hauled     ${finish.hauled} arrest(s) undone mid-tally (patrols walk back to their routes)`)
r.check('every pile can be carried to the cart', finish.delivered === finish.total, `${finish.delivered}/${finish.total}`)
r.check('a full cart raises the gate', finish.open === true, `gate=${finish.open}`)
// The chain has to come off. A gate that rises in silence is a door; hardware hitting
// the floor is what says "the way out is open" from the far side of the yard.
const chain = await api(() => {
    const g = window.__heistTest.world().gate
    const c = g && g.userData.chain
    return c ? { y: +c.position.y.toFixed(2), lean: +c.rotation.x.toFixed(2), visible: !!c.visible } : null
})
r.check('the gate chain comes off when the gate goes up', !!chain && chain.y < 0.45,
    JSON.stringify(chain))
r.check('reaching the gate with an open gate ends the job', finish.phase === 'clear' || finish.screen === 'clear',
    `${finish.phase}/${finish.screen} at ${finish.at} gate ${finish.gate && [finish.gate.wx, finish.gate.wz]} cell=${finish.cell} caged=${finish.caged}`)
r.check('the result card has numbers in it', finish.result && finish.result.value > 0, JSON.stringify(finish.result))

console.log('\nFRAME BUDGET')
const budget = await api(async () => {
    const t = window.__heistTest
    const a = t.perf().frameMs
    await window.__simSleep(1.5)
    return { a, b: t.perf().frameMs }
})
// A phone frame budget is a claim about a phone. When the CPU is deliberately 64x slower
// it is a claim about the flag that was passed, so it reports instead of failing — and the
// clock line underneath is the number that stays meaningful either way.
if (THROTTLE) r.info('render cost', `${budget.b} ms avg render — not asserted at --throttle ${THROTTLE}x`)
else r.check('render cost fits a phone frame', budget.b < 17, `${budget.b} ms avg render (dev build, software GL on CI)`)
const end = await clock()
r.info('clock at the end', `${end.rate}x real time at ${end.fps} fps${THROTTLE ? `, CPU throttled ${THROTTLE}x` : ''}`)

await page.screenshot({ path: path.resolve(SHOT) }).catch(() => {})
console.log(`  ..  wrote ${SHOT}`)
await browser.close()
r.exit(null)
process.exit(r.failed ? 1 : 0)
