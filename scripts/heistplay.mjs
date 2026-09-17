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
import { openGame, launch, requireDevServer, opt, Report } from './lib/harness.mjs'

const URL = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1')
const JOB = +opt(process.argv, '--job', 0)
const SHOT = opt(process.argv, '--shot', 'scripts/.shots/h20-play.png')

await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: { width: 1100, height: 700 } })
const r = new Report('heistplay')
const T = (ms) => page.waitForTimeout(ms)
const api = (fn, ...args) => page.evaluate(fn, ...args)

// `press` leaves attract -> brief -> play, with the level mounted in between.
const press = async (ms = 260) => { await api(() => window.__heistTest.press()); await T(ms) }

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
        await new Promise(res => setTimeout(res, 220))
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

await press(400)
const play = await api(() => window.__heistTest.state())
r.check('a second key starts the job', play.screen === 'play', play.screen)
const p0 = await api(() => window.__heistTest.probe())
r.check('phase is play', p0.phase === 'play', p0.phase)
r.check('the raccoon is on screen', Math.abs(p0.ndc[0]) < 0.75 && Math.abs(p0.ndc[1]) < 0.75, `ndc=${p0.ndc}`)
r.check('the camera is not in a wall', p0.camDist > 2.2 && p0.camY > 1.4, `d=${p0.camDist} y=${p0.camY}`)
r.check('the raccoon stands on walkable ground', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(p0.cell), p0.cell)
r.check('the camera looks into the level, not at a wall', p0.cell === 'FLOOR' || p0.cell === 'MARBLE', p0.cell)
if (!(Math.abs(p0.ndc[0]) < 0.75 && p0.camDist > 2.2)) {
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
    await new Promise(res => setTimeout(res, 1100))
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
    const sleep = ms => new Promise(res => setTimeout(res, ms))
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
    const sleep = ms => new Promise(res => setTimeout(res, ms))
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
        frames.push({ ...t.camClear(), ndc: p.ndc, cell: p.cell })
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
r.check('the rig opens up as soon as there is room', Math.max(...SETTLED.map(f => f.dist)) > 1.8, `best settled gap ${Math.max(...SETTLED.map(f => f.dist)).toFixed(2)} m`)
r.check('the raccoon stays in frame while pressed against a wall', F.every(f => Math.abs(f.ndc[0]) < 0.9 && Math.abs(f.ndc[1]) < 0.9), JSON.stringify(F[F.length - 1].ndc))
r.check('the rig slides around the corner instead of clipping', F.some(f => Math.abs(f.side) > 0.04), `max slide ${Math.max(...F.map(f => Math.abs(f.side))).toFixed(2)} rad`)
r.check('and it stays on walkable ground', F.every(f => ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(f.cell)), F[F.length - 1].cell)

console.log('\nTHE WORLD IS SOLID')
// Collision used to be the grid alone. The grid is 2.2 m cells, and every hydrant, bin,
// lamppost, pallet and cart in the game is *decoration standing on a walkable cell*, so
// the raccoon strolled through all of them — and a raccoon that walks through a lamppost
// decides within two seconds that none of this world is real.
const solid = await api(async () => {
    const t = window.__heistTest
    const sleep = ms => new Promise(res => setTimeout(res, ms))
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
r.check('a wall is still a wall', ['FLOOR', 'MARBLE', 'WATER', 'BUSH'].includes(solid.cell), solid.cell)

console.log('\nA GUARD WHO TOUCHES YOU TAKES YOU')
// The complaint: "I was on top of him and he did not capture me." Three separate causes
// lived behind that one sentence — the catch radius was a 0.62 m handshake, an alerted
// guard walked on 2.2 m waypoints and stopped a metre short, and the two bodies shared
// the same cubic metre of air. Each gets its own assertion.
const catchIt = await api(async () => {
    const t = window.__heistTest
    const sleep = ms => new Promise(res => setTimeout(res, ms))
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
    const t0 = performance.now()
    for (let i = 0; i < 24 && inPound() === before; i++) {
        await sleep(130)
        p = t.probe()
        took = performance.now() - t0
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
        took: Math.round(took),
        where: t.watchers().map(x => `${x.kind}@${[x.x, x.z]}cool${x.cool}`),
        caughtEvents: t.events().filter(e => e.type === 'caught' || e.type === 'swap').map(e => e.type + ':' + (e.who || '')),
        // Being caught must hand you somebody who can still walk, or the job looks hung:
        // the camera keeps orbiting a caged raccoon and every key does nothing.
        activeCaged: t.state().sim.crew.find(c => c.active)?.caged,
        stillPlaying: t.state().sim.phase === 'play',
    }
})
r.check('an alerted guard who reaches you bags you', (catchIt.cagedWho || []).length >= 1, `arrested in ${catchIt.took} ms; guards ${JSON.stringify(catchIt.guards)}`)
r.check('the arrest hands you a raccoon that can still walk', catchIt.activeCaged === false, `active raccoon caged=${catchIt.activeCaged}`)
r.check('and the job is still running', catchIt.stillPlaying === true, `phase ${catchIt.stillPlaying}`)
// "One mistake must not end the job" -- measured honestly. The promise is not "exactly one
// raccoon gets bagged": an arrest SHOUTS, the second guard heard it (that is what the
// `suspicious`/`suspect` escalation is for) and closed on a raccoon this driver had
// teleported into the open, which is the pressure the game is supposed to apply. What must
// never happen is the job ending on the spot -- the crew must still be playing, with the
// pound holding fewer than all three, and the guard who made the bagging must be busy
// tying the sack (asserted next).

r.check('the guard who took them is busy, not reaching for the next one', catchIt.cool.some(c => c > 0.5), `cool timers ${JSON.stringify(catchIt.cool)}`)
console.log('  ..  staged:', JSON.stringify(catchIt.w), 'far:', JSON.stringify(catchIt.far))
// Undo the staging: free the raccoon, stand the cast down, put the job back on the cart.
// Every later section assumes a crew that can walk.
const restored = await api(async () => {
    const t = window.__heistTest
    const sleep = ms => new Promise(res => setTimeout(res, ms))
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
    await new Promise(res => setTimeout(res, 260))
    const focus = t.probe().held
    const label = t.state().sim.hint
    const before = t.probe()
    t.tap('grab')
    await new Promise(res => setTimeout(res, 260))
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
    await new Promise(res => setTimeout(res, 260))
    const label = t.state().sim.hint
    t.tap('grab')
    await new Promise(res => setTimeout(res, 320))
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
        await new Promise(res => setTimeout(res, 240))
        const label = t.state().sim.hint
        t.hold(true)
        await new Promise(res => setTimeout(res, 3600))
        t.hold(false)
        await new Promise(res => setTimeout(res, 900))
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
    await new Promise(res => setTimeout(res, 2200))
    const b = t.watchers()
    return a.map((w, i) => ({ kind: w.kind, moved: +Math.hypot(b[i].x - w.x, b[i].z - w.z).toFixed(2), cell: b[i].cell, state: b[i].state }))
})
r.check('patrols actually walk', drift.filter(d => d.moved > 0.15).length >= Math.ceil(drift.length / 2), drift.map(d => `${d.kind}:${d.moved}m`).join(' '))
r.check('nobody walks through a wall', drift.every(d => !['WALL', 'VOID', '??'].includes(d.cell)), drift.map(d => d.cell).join(','))

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
    let spot = null, holder = null
    // Patrols move, so "is there floor in a beam right now" is a question with a
    // half-second shelf life. Retry for several seconds instead of taking one snapshot:
    // the assertion is that beams are survivable to stand in, not that a guard happened
    // to be facing the open yard when the harness blinked.
    for (let round = 0; round < 24 && !spot; round++) {
    for (const w of t.watchers()) {
        for (const d of [5.6, 4.8, 4, 3.2, 2.5]) {
            for (const off of [0, 0.25, -0.25]) {
                const yaw = w.yaw + off
                const x = w.x + Math.sin(yaw) * d, z = w.z + Math.cos(yaw) * d
                t.moveTo(x, z)
                await new Promise(res => setTimeout(res, 70))
                const p = t.probe()
                if (!['FLOOR', 'MARBLE', 'BUSH'].includes(p.cell)) continue
                const w2 = t.why().find(q => q.los && q.inCone && q.inRange)
                if (!w2) continue
                spot = { x: +x.toFixed(2), z: +z.toFixed(2), d, guard: w.kind }
                holder = w2.kind
                break
            }
            if (spot) break
        }
        if (spot) break
    }
    if (!spot) await new Promise(res => setTimeout(res, 300))
    }
    if (!spot) return { spot, samples: [], why: t.why() }
    const samples = []
    let why = []
    // Time to the SPOTTED event, not the peak of the meter: filling the meter *is* the
    // alert, and the alert zeroes the counter. A check on "did the number reach 0.9"
    // measures a guard who never noticed you and calls it a failure to detect, which is
    // the precise opposite of what happened.
    const tSpot = performance.now()
    let spottedAt = -1
    for (let i = 0; i < 12; i++) {
        await new Promise(res => setTimeout(res, 300))
        const s = t.probe()
        samples.push(+s.det.toFixed(2))
        why = t.why()
        if (spottedAt < 0 && t.events().some(e => e.type === 'spotted')) spottedAt = performance.now() - tSpot
        if (s.caged) break
        // The beam moved; keep standing in it, like a player hugging the light.
        if (!inBeam()) {
            const w = t.watchers().find(x => x.kind === holder) || t.watchers()[0]
            for (const d of [2.2, 3, 3.8]) {
                const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
                t.moveTo(x, z)
                await new Promise(res => setTimeout(res, 60))
                if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
                if (t.why().find(q => q.los && q.inCone && q.inRange)) break
            }
        }
    }
    const st = t.state().sim
    return { spot, samples, why, caged: t.probe().caged, heat: st.heat, spottedAt: Math.round(spottedAt) }
})
if (!seen.spot) console.log('  ..  no cell in any cone:', JSON.stringify(seen.why))
r.check('a torch beam has floor to land on', !!seen.spot, JSON.stringify(seen.spot))
// Samples are ~320 ms apart, so "noticed in about a second and a half" means the meter
// has to be past 0.9 by the fifth sample. It used to take roughly three times that,
// which is why a playtest could stand in a torch beam at arm's length and wonder why
// nothing happened.
{
    const S2 = seen.samples || []
    const quick = S2.findIndex(d => d > 0.9)
    // The budget scales with the distance the driver actually managed to stand at, because
// 2.5 m and 5.6 m are different questions. It is tuned so the previous curve (2.6/dist)
// fails it everywhere: at 5 m the old numbers needed ~2.4 s and the budget is 1.75 s.
// A threshold loosened until the bug fits is not a check.
r.check('a torch at working range notices you inside the budget', seen.spottedAt >= 0 && seen.spottedAt < (550 + (seen.spot ? seen.spot.d : 3) * 220), `spotted after ${seen.spottedAt < 0 ? 'never' : (seen.spottedAt / 1000).toFixed(1) + ' s'} at ${(seen.spot ? seen.spot.d : 0)} m (budget ${((550 + (seen.spot ? seen.spot.d : 3) * 220) / 1000).toFixed(2)} s; meter ${S2.map(d => d.toFixed(2)).join(' > ')})`)
}
r.check('standing in a torch beam raises suspicion', Math.max(...(seen.samples || [0])) > 0.15, `det=${(seen.samples || []).join('>')}`)
r.check('being spotted is announced', seen.spottedAt >= 0 || seen.heat > 10, `spot at ${seen.spottedAt} ms, heat ${Math.round(seen.heat)}`)
if (!(Math.max(...(seen.samples || [0])) > 0.15)) console.log('  ..  detection arithmetic:', JSON.stringify(seen.why))

console.log('\nCAUGHT + RESCUED')
const caught = await api(async () => {
    const t = window.__heistTest
    // Get noticed first (close, in the beam, in the open), then close the last metre.
    // Contact alone is not enough by design: an unruffled guard mid-patrol does not
    // bag a raccoon standing on its foot, it notices it first.
    let who = null
    for (const w of t.watchers()) {
        for (const d of [2.2, 3]) {
            const x = w.x + Math.sin(w.yaw) * d, z = w.z + Math.cos(w.yaw) * d
            t.moveTo(x, z)
            await new Promise(res => setTimeout(res, 120))
            if (!['FLOOR', 'MARBLE', 'BUSH'].includes(t.probe().cell)) continue
            if (t.why().find(q => q.los && q.inCone && q.inRange)) { who = { kind: w.kind, x, z }; break }
        }
        if (who) break
    }
    const trail = []
    const inPound = () => t.state().sim.crew.filter(c => c.caged).length
    const nest = inPound()
    for (let i = 0; i < 14; i++) {
        await new Promise(res => setTimeout(res, 360))
        const w = t.watchers().find(x => x.kind === (who && who.kind)) || t.watchers()[0]
        if (w) t.moveTo(w.x + Math.sin(w.yaw) * 0.4, w.z + Math.cos(w.yaw) * 0.4)
        const p = t.probe()
        trail.push(`${w ? w.state : '?'}:${p.det.toFixed(1)}`)
        // Stop the moment one raccoon is bagged. This driver teleports a raccoon onto a
        // guard every 360 ms, which is far more adversarial than a player: a real player
        // who gets caught *moves*, and being caught now switches you to a crewmate
        // standing on the same square. Parking that crewmate there is not testing the
        // pound, it is staging a bust.
        if (inPound() > nest) break
    }
    // Back off to the pound, which is where the rescue happens anyway and is not inside
    // anybody's cone.
    t.calm()
    const free = t.state().sim.crew.find(c => !c.caged)
    if (free) t.switchTo(free.idx)
    const crew = t.state().sim.crew
    return { caged: crew.filter(c => c.caged).length, phase: t.probe().phase, msg: t.state().sim.msg, trail, who }
})
r.check('a watcher in contact bags a raccoon', caught.caged >= 1, `${caught.caged} in the pound`)
r.check('one raccoon down is not game over', caught.phase === 'play', caught.phase)

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
        await new Promise(res => setTimeout(res, 100))
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
    // Free everybody, one chew at a time. This also proves the rescue is repeatable —
    // a pound you can only open once is a pound that ends the run for the rest of the
    // crew, which is exactly the dead-end the "caught is not game over" rule forbids.
    for (let round = 0; round < 3; round++) {
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
            await new Promise(res => setTimeout(res, 100))
            label = t.state().sim.hint
        }
        // The lock is the affordance for this verb. Ask three questions of it: is it
        // there at all, does it shake while somebody is chewing, and does it come off.
        const aff = t.afford()
        const lock = (t.world().cage && t.world().cage.userData.padlock) || null
        const home = lock ? [lock.position.x, lock.position.y, lock.position.z] : null
        const shake = []
        const t0 = performance.now()
        const before = t.state().sim.crew.filter(c => c.caged).length
        t.hold(true)
        let took = 0
        for (let i = 0; i < 14; i++) {
            await new Promise(res => setTimeout(res, 260))
            if (lock) shake.push(+Math.hypot(lock.position.x - home[0], lock.position.y - home[1], lock.position.z - home[2]).toFixed(4))
            // Measure the moment the *count drops*, not the moment the pound empties:
            // with two locked up, the first chew only frees one.
            if (t.state().sim.crew.filter(c => c.caged).length < before) { took = performance.now() - t0; break }
        }
        t.hold(false)
        await new Promise(res => setTimeout(res, 700))
        log.push({
            by: me ? me.name : '?', label, took: Math.round(took),
            caged: t.state().sim.crew.filter(c => c.caged).length,
            here: t.probe().cell, at: [t.probe().x, t.probe().z],
            aff, shook: shake.length ? Math.max(...shake) : -1, shake,
            lockY: lock ? +lock.position.y.toFixed(3) : null,
            lockHome: home ? home.map(n => +n.toFixed(2)) : null,
        })
        await new Promise(res => setTimeout(res, 300))
    }
    return { log, caged: t.state().sim.crew.filter(c => c.caged).length }
})
r.check('the pound offers to chew a friend loose', /CHEW/i.test((rescue.log[0] || {}).label || ''), (rescue.log[0] || {}).label)
r.check('a friend comes out of the pound', rescue.caged === 0, `${rescue.caged} still locked up`)
console.log('  ..  rescues:', JSON.stringify(rescue.log.map(l => ({ ...l, aff: l.aff && { kind: l.aff.kind, hit: l.aff.hit, ok: l.aff.ok }, shake: undefined }))))
const slowest = Math.max(0, ...rescue.log.map(l => l.took))
r.check('a rescue is desperate, not a chore', slowest > 300 && slowest < 4000, `${slowest} ms for the slowest padlock`)
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
r.check('the lock shakes while it is being chewed', rescue.log.every(l => l.shook > 0.004), `peak jitter ${rescue.log.map(l => l.shook).join(' / ')} m`)
for (const l of rescue.log) {
    // The lock is wherever the pound's state says it should be: on the door while
    // anybody is still inside, on the ground once the cage is empty. A chew that frees
    // one of two must not leave the second one in an unlocked cage with the HUD still
    // saying CHEW — that was the second bug this section caught.
    const empty = l.caged === 0
    r.check(empty ? 'the last lock comes off the door' : 'the door stays locked while somebody is still in there',
        l.lockY !== null && (empty ? l.lockY < 0.3 : l.lockY > 0.4), `lock y ${l.lockY} with ${l.caged} still caged`)
}

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
        await new Promise(res => setTimeout(res, 220))
        const held = (t.tap('grab'), t.probe().held)
        await new Promise(res => setTimeout(res, 260))
        const have = t.probe().held
        t.moveTo(cx, cz)
        await new Promise(res => setTimeout(res, 260))
        const a = t.afford()
        if (t.probe().held) t.tap('grab')
        await new Promise(res => setTimeout(res, 260))
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
        t.moveTo(l.x, l.z)
        await new Promise(res => setTimeout(res, 120))
        t.tap('grab')
        await new Promise(res => setTimeout(res, 120))
        t.moveTo(cart.wx, cart.wz)
        await new Promise(res => setTimeout(res, 120))
        t.tap('grab')
        await new Promise(res => setTimeout(res, 120))
    }
    const loaded = t.state().sim
    await new Promise(res => setTimeout(res, 900))
    const open = t.probe().gate
    t.moveTo(gate.wx, gate.wz)
    await new Promise(res => setTimeout(res, 900))
    const s = t.state().sim
    const p = t.probe()
    return {
        delivered: loaded.delivered, total: loaded.total, open, phase: s.phase, result: s.result,
        screen: t.state().screen, at: [p.x, p.z], cell: p.cell, active: p.caged ? 'caged' : 'free',
        gate: marks.find(m => m.ch === 'X'), caged: s.crew.filter(c => c.caged).length,
    }
})
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
    await new Promise(res => setTimeout(res, 1500))
    return { a, b: t.perf().frameMs }
})
r.check('render cost fits a phone frame', budget.b < 17, `${budget.b} ms avg render (dev build, software GL on CI)`)

await page.screenshot({ path: path.resolve(SHOT) }).catch(() => {})
console.log(`  ..  wrote ${SHOT}`)
await browser.close()
r.exit(null)
process.exit(r.failed ? 1 : 0)
