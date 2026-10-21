// cometdrifthdcheck — COMET DRIFT HD (#465): the MODERN twin's harness.
//
// Node part (no browser): the rebuilt geometry is a faithful Gulch, the
// reused sim still holds its core rules, and the autopilot still wins the
// whole race. Browser part (dev server, headless Chrome): the WebGPU
// renderer boots (or falls back and says so), the canvas draws a real
// world (not black, not static), sparks are coupled to the drift state,
// and an end-table → restart round-trip works.
//
//   npm run cometdrifthdcheck
//   npm run cometdrifthdcheck -- --mutate     # breaks a load-bearing line, demands RED
//   npm run cometdrifthdcheck -- --skip-browser
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGame, step, decide, stateHash } from '../src/games/CometDrift/sim.js'
import { TRACK, COURSES, selectCourse } from '../src/games/CometDrift/track.js'
import { trackGeometryStats, buildKart, makePool, kartYaw, BUGGY_SCALE, cameraCorridorAudit } from '../src/games/CometDriftHD/scene.js'
import * as THREE from 'three'

const args = process.argv.slice(2)
const MUTATE = args.includes('--mutate')
const MUTATE_CHIME = args.includes('--mutate-chime')
const MUTATE_BLOOM = args.includes('--mutate-bloom')
const SKIP_BROWSER = args.includes('--skip-browser')
const HERE = dirname(fileURLToPath(import.meta.url))
const SHARD = resolve(HERE, '../src/games/CometDriftHD/index.jsx')

let pass = 0; let fail = 0
const ok = (cond, msg) => {
    if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg}`) }
}

// mutate first: the dev server must serve the BROKEN module to the browser
const LINE = 'const spawnTick = () => {'
const MUTIL = 'const spawnTick = () => { return;'
let mutated = false
if (MUTATE) {
    const src = readFileSync(SHARD, 'utf8')
    if (!src.includes(LINE)) { console.error('MUTATE: load-bearing line not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, src.replace(LINE, MUTIL))
    mutated = true
    console.log('  ..    mutated: particle spawning is dead — this run MUST report a FAIL')
    process.on('exit', () => {
        if (mutated) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(MUTIL, LINE))
            console.log('  ..    mutation restored')
        }
    })
}

// chime mutant (#478 item 5): flatten the gold bell's sparkle so the ladder's
// chime stops rising — the gold-bell gate MUST go red under this run.
const AUDIO = resolve(HERE, '../src/games/CometDriftHD/audio.js')
const CLINE = 'export const GOLD_BELL = 3136'
const CUTIL = 'export const GOLD_BELL = 120'
let chimemutat = false
if (MUTATE_CHIME) {
    const csrc = readFileSync(AUDIO, 'utf8')
    if (!csrc.includes(CLINE)) { console.error('MUTATE_CHIME: gold-bell line not found — probing stale code.'); process.exit(2) }
    writeFileSync(AUDIO, csrc.replace(CLINE, CUTIL))
    chimemutat = true
    console.log('  ..    mutated: gold bell no longer rings on top — the chime gate MUST report a FAIL')
    process.on('exit', () => {
        if (chimemutat) {
            writeFileSync(AUDIO, readFileSync(AUDIO, 'utf8').replace(CUTIL, CLINE))
            console.log('  ..    chime mutation restored')
        }
    })
}

// #478 item 1 bloom mutant: drop the post chain on the node backend — the
// chain-presence gate MUST go red under this run.
const BLINE = 'post = buildPostChain(renderer)'
const BUTIL = 'post = null /* bloommut */'
let bloommutat = false
if (MUTATE_BLOOM) {
    const bsrc = readFileSync(SHARD, 'utf8')
    if (!bsrc.includes(BLINE)) { console.error('MUTATE_BLOOM: chain line not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, bsrc.replace(BLINE, BUTIL))
    bloommutat = true
    console.log('  ..    mutated: the post chain never builds — the bloom gates MUST report a FAIL')
    process.on('exit', () => {
        if (bloommutat) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(BUTIL, BLINE))
            console.log('  ..    bloom mutation restored')
        }
    })
}

// #478 item 3 spin-blur mutant: freeze the blur law at zero — the kart-feel
// gates MUST go red under this run.
const SCENE = resolve(HERE, '../src/games/CometDriftHD/scene.js')
const SLINE = 'export const spinBlurAt = (v) => Math.min(1, Math.max(0, (v - 2.5) / 4.5))'
const SUTIL = 'export const spinBlurAt = (v) => 0 /* spinmut */'
let spinmutat = false
if (args.includes('--mutate-spin')) {
    const ssrc = readFileSync(SCENE, 'utf8')
    if (!ssrc.includes(SLINE)) { console.error('MUTATE_SPIN: blur law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, ssrc.replace(SLINE, SUTIL))
    spinmutat = true
    console.log('  ..    mutated: spokes never blur — the kart-feel gates MUST report a FAIL')
    process.on('exit', () => {
        if (spinmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(SUTIL, SLINE))
            console.log('  ..    spin mutation restored')
        }
    })
}

// #478 item 4 streak mutant: collapse the stretch law — the camera-aligned
// dash gates MUST go red under this run.
const SLAW = 'export const streakLen = (len, speed) => len * (0.3 + 0.7 * Math.min(1, speed / 0.05))'
const SUTIL2 = 'export const streakLen = (len, speed) => 0 /* streakmut */'
let streakmutat = false
if (args.includes('--mutate-streak')) {
    const ssrc = readFileSync(SCENE, 'utf8')
    if (!ssrc.includes(SLAW)) { console.error('MUTATE_STREAK: streak law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, ssrc.replace(SLAW, SUTIL2))
    streakmutat = true
    console.log('  ..    mutated: streaks never stretch — the gold-dash gates MUST report a FAIL')
    process.on('exit', () => {
        if (streakmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(SUTIL2, SLAW))
            console.log('  ..    streak mutation restored')
        }
    })
}

// #481 buggy-polish mutant: collapse the shadow ellipse to a disc and kill the
// lamp idle glow — the #481 gates MUST go red under this run.
const FLINE = 'export const BUGGY_FOOT = { l: +(3.44 * BUGGY_SCALE).toFixed(3), w: +(1.98 * BUGGY_SCALE).toFixed(3) }'
const FUTIL = 'export const BUGGY_FOOT = { l: +(3.44 * BUGGY_SCALE).toFixed(3), w: +(3.44 * BUGGY_SCALE).toFixed(3) } /* footmut */'
const ILINE = 'export const BRAKE_IDLE = 0.35'
const IUTIL = 'export const BRAKE_IDLE = 0 /* lampmut */'
let footmutat = false
if (args.includes('--mutate-buggy')) {
    const fsrc = readFileSync(SCENE, 'utf8')
    if (!fsrc.includes(FLINE) || !fsrc.includes(ILINE)) { console.error('MUTATE_BUGGY: footprint/lamp lines not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, fsrc.replace(FLINE, FUTIL).replace(ILINE, IUTIL))
    footmutat = true
    console.log('  ..    mutated: shadow is a disc again and lamps are dead — the #481 gates MUST report FAILs')
    process.on('exit', () => {
        if (footmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(FUTIL, FLINE).replace(IUTIL, ILINE))
            console.log('  ..    buggy mutation restored')
        }
    })
}

// #478 item 6 star mutant: freeze the twinkle law at full — the dusk-sky
// gates MUST go red under this run.
const TLAW = 'export const twinkle = (phase, tick) => 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tick * 0.055 + phase * Math.PI * 2))'
const TUTIL = 'export const twinkle = (phase, tick) => 1 /* starmut */'
let starmutat = false
if (args.includes('--mutate-stars')) {
    const tsrc = readFileSync(SCENE, 'utf8')
    if (!tsrc.includes(TLAW)) { console.error('MUTATE_STARS: twinkle law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, tsrc.replace(TLAW, TUTIL))
    starmutat = true
    console.log('  ..    mutated: stars never twinkle — the dusk-sky gates MUST report a FAIL')
    process.on('exit', () => {
        if (starmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(TUTIL, TLAW))
            console.log('  ..    star mutation restored')
        }
    })
}

// #478 item 7 wall-tint mutant: collapse the cycle to one section — the wall
// variety gates MUST go red under this run (stone tiles past identically).
const WLINE = 'export const WALL_TINT_STEPS = 16'
const WUTIL = 'export const WALL_TINT_STEPS = 0 /* wallmut */'
let wallmutat = false
if (args.includes('--mutate-wall')) {
    const wsrc = readFileSync(SCENE, 'utf8')
    if (!wsrc.includes(WLINE)) { console.error('MUTATE_WALL: tint step count not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, wsrc.replace(WLINE, WUTIL))
    wallmutat = true
    console.log('  ..    mutated: the wall tint never varies — the variety gates MUST report a FAIL')
    process.on('exit', () => {
        if (wallmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(WUTIL, WLINE))
            console.log('  ..    wall mutation restored')
        }
    })
}

// ---------------------------------------------------------------- geometry
console.log('track geometry (the HD rebuild of the Gulch):')
const { stats, bounds, geos } = trackGeometryStats()
ok(bounds.offMin >= 220 && (bounds.topMax - bounds.elevMax) <= 3.6, `walls sit set back outside the sim clamp (${bounds.offMin}px >= 220px > ${bounds.simClampPx}px) and under the sightline (${(bounds.topMax - bounds.elevMax).toFixed(2)}u above the highest road)`)
const ring = (TRACK.N + 1) * 2
ok(stats.road.verts === ring, `road ribbon is a closed ring (${ring} verts)`)
ok(stats.road.nan === 0 && stats.wallL.nan === 0 && stats.plateauR.nan === 0, 'no NaN anywhere in the track bands')

// #542: the horizon furniture must ring EVERY course — when the world grew,
// the old fixed ring left the karts driving under the mesas. Nothing that is
// not the track may reach into the camera corridor (mesa footprints, spires).
console.log('camera corridor (#542):')
for (const c of COURSES) {
    selectCourse(c.id)
    const audit = cameraCorridorAudit()
    const extra = audit.violations.length ? ` (${audit.violations.length} intrusions, worst ${JSON.stringify(audit.violations.sort((a, b) => a.clearance - b.clearance)[0])})` : ''
    ok(audit.violations.length === 0, `${c.id}: ${audit.mesaCount} mesas + ${audit.sceneryCount} scenery items clear the corridor${extra}`)
}
selectCourse('gulch')

// #518: the road is NOT flat — it follows the course height profile, and every
// band (kerb, gutter, wall foot/top, plateau) hangs off the same profile at the
// same point index, so the terrain meets the road all the way round.
const yAt = (geo, i, v) => geo.getAttribute('position').getY(i * 2 + v)
{
    const S = 1 / 60
    let dev = 0
    let hangBad = 0; let footBad = 0; let rimBad = 0
    let minDev = Infinity; let maxDev = -Infinity
    const N = TRACK.N
    for (let i = 0; i < N; i++) {
        const ry = yAt(geos.road, i, 0)
        dev = Math.max(dev, Math.abs(ry - (TRACK.pts[i].h * S + 0.06)))
        const lift = yAt(geos.wallL, i, 1) - ry
        if (lift < 1.4 || lift > 3.7) hangBad++
        if (yAt(geos.wallL, i, 0) >= ry) footBad++
        if (yAt(geos.plateauL, i, 1) <= ry) rimBad++
        maxDev = Math.max(maxDev, lift)
        minDev = Math.min(minDev, lift)
    }
    ok(dev < 1e-6, `road surface follows the #518 height point for point (profile → geometry, max dev ${dev.toExponential(1)}u — float32 precision)`)
    ok((stats.road.maxY - stats.road.minY) >= 0.9 * (bounds.elevMax - bounds.elevMin),
        `the road goes up and down: ${stats.road.minY.toFixed(2)}..${stats.road.maxY.toFixed(2)}u across the lap`)
    ok(hangBad === 0, `cliff walls ride the profile too — every section stands ${minDev.toFixed(2)}..${maxDev.toFixed(2)}u over the road under it`)
    ok(footBad === 0, 'wall bases stay under the road at every point (no floating cliffs, elevated or not)')
    ok(rimBad === 0, 'plateau rim stays above the road at every point (scenery has ground)')
    ok(bounds.maxGrade <= 0.0951, `grades stay arcade-steep, not stunt-steep (max ${bounds.maxGrade.toFixed(3)})`)
}
ok(stats.wallL.maxY >= 1.5 && stats.wallR.maxY >= 1.5, 'cliff walls rise over the road')
ok(stats.kerbL.verts === ring && stats.gutterR.verts === ring, 'kerb + gutter rings cover the full lap')
const kart = buildKart(0x20b8dc, '#fff')
ok(kart.children.length >= 10 && kart.userData.wheels.length === 2, `buggy assembled: ${kart.children.length} parts, steerable front axles`)
ok(kart.userData.wheelDefs && kart.userData.wheelDefs.length === 4, 'fallback buggy exposes all four wheel rig nodes')

// ------------------------------------------------------ kart feel (#478 item 3)
console.log('kart feel (#478 item 3 — spin blur, driver, nose art, landing squash):')
{
    // fresh import with a cache-buster: --mutate-spin rewrites scene.js AFTER
    // the top-level import cached it — read the on-disk laws, not the cache.
    const SC = await import('file://' + SCENE + '?t=' + Date.now())
    const { spinBlurAt, landingSquash, buildNoseArt, buildDriver, decorateBuggy, BRAKE_IDLE } = SC
    // spin blur law: 0 at rest/trot, 1 at top speed, monotonic
    ok(spinBlurAt(0) === 0 && spinBlurAt(2.5) === 0, 'wheels are crisp below the trot threshold (blur 0)')
    ok(spinBlurAt(8.6) === 1, `blur fully merges the spokes at top speed (${spinBlurAt(8.6)})`)
    let mono = true; let prevB = -1
    for (let v = 0; v <= 9; v += 0.5) { const b = spinBlurAt(v); if (b < prevB) mono = false; prevB = b }
    ok(mono, 'blur increases monotonically with speed (no popping)')

    // landing squash law: crest-drop at speed compresses; steady/level/slow never do
    ok(landingSquash(0.08, -0.08, 8) > 0.05, `crest-drop at speed loads the suspension (${landingSquash(0.08, -0.08, 8).toFixed(3)})`)
    ok(landingSquash(0.08, -0.08, 8) <= 0.16, 'squash is capped — the kart never pancakes')
    ok(landingSquash(0.05, 0.05, 8) === 0, 'steady slope carries no landing load')
    ok(landingSquash(-0.05, -0.08, 8) === 0, 'driving downhill is not a landing')
    ok(landingSquash(0.08, -0.08, 1) === 0, 'a crest at walking pace unloads nothing (squash needs speed)')
    ok(kart.userData.spinMats && kart.userData.spinMats.sharp && kart.userData.spinMats.ghost, 'fallback buggy carries the spoke blur material pair')
    ok(kart.userData.wheelDefs.every((wd) => wd.meshes.length === 3), 'every wheel rolls tire + sharp spokes + ghost spokes as one list')
    ok(kart.userData.noseArt && kart.userData.noseArt.children.length > 0, 'fallback buggy carries nose art beyond the stripe')

    // nose art: four distinct motifs + wraparound
    const art0 = buildNoseArt('#fff', 0); const art1 = buildNoseArt('#fff', 1)
    const art2 = buildNoseArt('#fff', 2); const art3 = buildNoseArt('#fff', 3)
    const z0 = art0.children[0].position.z; const z1 = art1.children[0].position.z
    const z2 = art2.children[0].position.z; const z3 = art3.children[0].position.z
    ok(new Set([z0, z1, z2, z3]).size === 4, 'the four livery motifs place their first mark differently (drivers read as distinct entries)')
    ok(art2.children.length === 2 && Math.sign(art2.children[0].position.x) === -Math.sign(art2.children[1].position.x), 'variant 2 is twin side lines, mirrored')
    ok(buildNoseArt('#fff', 4).children.length === art0.children.length, 'variant wraps 4→0 (seven karts mod four still art every kart)')

    // driver: five parts, arms ahead of the torso (reaching the wheel)
    const drv = buildDriver('#dff4fa')
    ok(drv.children.length === 5 && drv.userData.parts.join() === 'head,visor,torso,armL,armR', `driver mounted: ${drv.userData.parts.join('/')}`)
    const [dHead, , dTorso, dArmL, dArmR] = drv.children
    ok(dArmL.position.z > dTorso.position.z && dArmR.position.z > dTorso.position.z, 'arms reach forward of the torso')
    ok(Math.sign(dArmL.position.x) === -1 && Math.sign(dArmR.position.x) === 1, 'left/right arms on their own sides')
    ok(dHead.position.y > dTorso.position.y, 'the head sits above the torso')

    // the authored buggy gets the same rig: spokes join the roll list per wheel
    const mockRoot = new THREE.Group()
    mockRoot.name = 'DuneBuggy'
    for (const nm of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) {
        const wn = new THREE.Group(); wn.name = nm
        wn.position.set(nm.endsWith('R') ? 0.7 : -0.7, 0.35, nm.includes('FL') || nm.includes('FR') ? 1.1 : -1.1)
        wn.matrixAutoUpdate = false
        wn.matrix.set(...(nm.endsWith('FR') ? [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), new THREE.MeshStandardMaterial({ name: 'Tire_Black' }))
        wn.add(tire)
        mockRoot.add(wn)
    }
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 3), new THREE.MeshStandardMaterial({ name: 'Paint_Orange' }))
    chassis.name = 'Chassis_light'; mockRoot.add(chassis)
    const tailM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.03), new THREE.MeshStandardMaterial({ name: 'Taillight_Red' }))
    tailM.name = 'Chassis_tail'; mockRoot.add(tailM)
    const trimM = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 2.6), new THREE.MeshStandardMaterial({ name: 'Accent_Yellow' }))
    trimM.name = 'Chassis_accent'; mockRoot.add(trimM)
    const dec = decorateBuggy(mockRoot, 0x20b8dc, '#dff4fa')
    ok(dec.wheels.length === 4 && dec.wheels.every((w) => w.meshes.length === 3), 'GLB path: every wheel rolls tire + sharp + ghost spokes (spokes joined the rig)')
    ok(!!dec.spinMats && dec.spinMats.sharp.opacity === 1 && dec.spinMats.ghost.opacity === 0, 'GLB path starts crisp (ghost hidden until speed)')
    ok(!!dec.brakeMat && dec.brakeMat.emissiveIntensity === BRAKE_IDLE && BRAKE_IDLE > 0.1, `taillight arms at idle glow ${dec.brakeMat && dec.brakeMat.emissiveIntensity} (lamps, not off-black)`)
    const trimMat = trimM.material
    ok(trimMat.emissiveIntensity > 0.1 && trimMat.emissive.getHexString() === new THREE.Color('#dff4fa').getHexString(), 'accent trim glows in its own livery colour (5-second rival recognition)')

    // the shell drives all three laws in the live loop
    const SHARD_SRC = readFileSync(SHARD, 'utf8')
    ok(SHARD_SRC.includes('spinBlurAt(k.v)') && SHARD_SRC.includes('landingSquash(') && SHARD_SRC.includes('buildDriver('), 'index.jsx drives blur, squash and the driver in the live loop')
}

// ------------------------------------------------ dune buggy model + heading (#477)
// Jon's authored GLB drives the car now. Two facts must hold on the REAL bytes,
// not on a mock: the model's nose is +Z, and the sim-heading -> yaw law points
// it down the road (the old −a pointed it sideways — Jon's bug).
console.log('dune buggy model + heading law (#477):')
{
    // #637 moved the shelf under public/models/ — the old games/ path is gone.
    const glbPath = resolve(HERE, '../public/models/vehicles/dune_buggy.glb')
    const bytes = readFileSync(glbPath)
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let off = 12; let gj = null
    while (off + 8 <= bytes.length) {
        const len = dv.getUint32(off, true); const type = dv.getUint32(off + 4, true)
        if (type === 0x4e4f534a) { gj = JSON.parse(bytes.subarray(off + 8, off + 8 + len).toString('utf8')); break }
        off += 8 + len
    }
    ok(!!gj, 'dune_buggy.glb is a readable glTF binary')
    const nodeByName = {}; for (const n of (gj.nodes || [])) nodeByName[n.name] = n
    const matNames = (gj.materials || []).map((m) => m.name)
    ok(!!nodeByName.DuneBuggy && ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].every((w) => nodeByName[w]), 'rig has a root + the four named wheel pivots')
    ok(['Paint_Orange', 'Taillight_Red', 'Light_Emissive'].every((mt) => matNames.includes(mt)), 'paint + taillight + headlight materials present (per-rival recolour target exists)')
    const acc = (name, attr) => gj.accessors[gj.meshes[nodeByName[name].mesh].primitives[0].attributes[attr]]
    ok(acc('Chassis_light', 'POSITION').max[2] > acc('Chassis_tail', 'POSITION').max[2], `nose points +Z (headlights z=${acc('Chassis_light', 'POSITION').max[2].toFixed(2)} ahead of tailgate z=${acc('Chassis_tail', 'POSITION').max[2].toFixed(2)})`)

    // heading law: rotating the local nose (+Z) by kartYaw(a) lands on the sim
    // travel direction (cos a, sin a) in world (X,Z).
    let maxErr = 0
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const nose = [Math.sin(kartYaw(a)), Math.cos(kartYaw(a))]
        maxErr = Math.max(maxErr, Math.hypot(nose[0] - Math.cos(a), nose[1] - Math.sin(a)))
    }
    ok(maxErr < 1e-9, `heading law kartYaw(a) points the nose along (cos a, sin a) (max err ${maxErr.toExponential(1)})`)
    ok(Math.abs(kartYaw(0) - Math.PI / 2) < 1e-9, 'kartYaw(0) = π/2 (guards the reverted −a / sideways regression)')

    // wheel signs are derived from each pivot's baked matrix, so a future re-export
    // with different flips fails here. R = rotation 3x3 (column-major), side by x.
    const mul3 = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]))
    const ap3 = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])
    const rotOf = (m) => [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
    const Ry = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]]
    const Rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]]
    const wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((nm) => {
        const m = nodeByName[nm].matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        return { nm, R: rotOf(m), x: m[12], z: m[14], side: Math.sign(m[12]) }
    })
    ok(wheels.every((w) => w.side === 1 || w.side === -1) && wheels.length === 4, 'all four wheels offset to a defined left/right side')
    // forward roll: the tire top (local +Y) must swing toward +Z (world) for every
    // wheel when rolled by roll = +0.2 * side. Proves spin direction is consistent.
    ok(wheels.every((w) => ap3(mul3(w.R, Rx(0.2 * w.side)), [0, 1, 0])[2] > 0), 'roll by side-sign spins every wheel forward (both sides spin alike through the baked flip)')
    // steer: front wheels toe the same way (world forward +Z gains the same-sign X)
    const fronts = wheels.filter((w) => w.z > 0)
    const fwdX = fronts.map((w) => ap3(mul3(w.R, Ry(0.3 * w.side)), [0, 0, 1])[0])
    ok(fronts.length === 2 && fwdX[0] * fwdX[1] > 0 && Math.sign(fwdX[0]) === Math.sign(0.3), 'front wheels steer parallel (side-sign undoes the right-side flip)')
    ok(BUGGY_SCALE > 0.3 && BUGGY_SCALE < 0.8, `buggy scaled to a kart footprint (${BUGGY_SCALE}x its 3.4m body)`)
}

// ------------------------------------------------------ #481 polish round two
// Blob shadow hugs the measured footprint, taillights glow as lamps, exhaust
// flames sit on the chrome outlets, and the front wheels turn far enough.
console.log('buggy polish round two (#481):')
{
    const FB = await import('file://' + SCENE + '?t=' + (Date.now() + 5))
    const sh = FB.makeBlobShadow()
    ok(sh.userData.parts.join() === 'halo,core', `shadow is a two-pass blob (penumbra + core): ${sh.userData.parts.join('/')}`)
    const bb = new THREE.Box3().setFromObject(sh)
    const sL = bb.max.z - bb.min.z; const sW = bb.max.x - bb.min.x
    ok(sL / sW >= 1.6, `blob is an ellipse, not a disc (len ${sL.toFixed(2)}u vs width ${sW.toFixed(2)}u)`)
    ok(Math.abs(sL - FB.BUGGY_FOOT.l) / FB.BUGGY_FOOT.l <= 0.15 && Math.abs(sW - FB.BUGGY_FOOT.w) / FB.BUGGY_FOOT.w <= 0.15,
        `blob tracks the real model footprint (${sL.toFixed(2)}×${sW.toFixed(2)}u vs body ${FB.BUGGY_FOOT.l}×${FB.BUGGY_FOOT.w}u, was a 2.16×1.44 disc)`)
    ok(bb.max.y - bb.min.y < 1e-6, 'shadow blob stays planar (no floating slab)')
    ok(sh.children.every((c) => c.material.transparent && c.material.depthWrite === false), 'blob passes are transparent and never write depth')
    const outs = FB.exhaustOutlets()
    ok(outs.length === 2 && outs[0].x * outs[1].x < 0, 'one exhaust outlet per side')
    ok(outs.every((o) => Math.abs(o.x) >= 0.3 && Math.abs(o.x) <= 0.4), `outlets ride the flank pipes (|x| = ${Math.abs(outs[0].x)}u, replacing the centred 0.2 guess)`)
    ok(outs.every((o) => o.z <= -BUGGY_SCALE * 1.3 && o.z >= -BUGGY_SCALE * 1.7), `outlets at the tailgate, not mid-chassis (z = ${outs[0].z}u)`)
    ok(outs.every((o) => o.y > 0.12 && o.y < 0.35), `outlets at pipe height (y = ${outs[0].y}u)`)
    ok(FB.BRAKE_ON > 1 && FB.BRAKE_ON > FB.BRAKE_IDLE + 1, `brake command is a jump to ${FB.BRAKE_ON} from idle ${FB.BRAKE_IDLE}`)
    ok(FB.STEER_MAX >= 0.55 && FB.STEER_MAX <= 0.8, `steer travel widened to ${FB.STEER_MAX} rad (was 0.45 — stiff against the drift yaw)`)
    const SHARD_SRC2 = readFileSync(SHARD, 'utf8')
    ok(SHARD_SRC2.includes('shadow.rotation.y = kartYaw(k.a)'), 'the blob steers with the kart heading (no fixed-axis disc regression)')
    ok(SHARD_SRC2.includes('BRAKE_ON : BRAKE_IDLE'), 'the live loop drives idle↔brake on the lamps')
    ok(SHARD_SRC2.includes('* STEER_MAX'), 'the live loop steers by the shared STEER_MAX constant')
}

const pool = makePool(10, 0.2)
pool.spawn(0, 0.2, 0, 0.01, 0, 0, 5, 0xffffff)
pool.spawn(0, 0.2, 0, 0.01, 0, 0, 5, 0xffffff)
pool.step(0); pool.step(0)
ok(pool.aliveCount === 2, 'particle pool spawns and ages')
pool.step(0); pool.step(0); pool.step(0); pool.step(0)
ok(pool.aliveCount === 0, 'particle pool retires dead particles')

// ------------------------------------------------ gold streaks (#478 item 4)
// Gold sparks are camera-aligned streak QUADS, not tripled points: each dash
// billboards onto the camera plane with its long axis along the velocity there.
console.log('gold streaks (#478 item 4 — camera-aligned quads + rival afterburners):')
{
    const SR = await import('file://' + SCENE + '?t=' + (Date.now() + 1))
    const { makeStreakPool, streakLen } = SR
    ok(streakLen(1, 0) === 0.3 && streakLen(1, 0.05) === 1, `streak law: stub at rest, full at dash speed (${streakLen(1, 0)} → ${streakLen(1, 0.05)})`)
    ok(streakLen(1, 5) === 1, 'streak length clamps (a warp drive never draws a 100 m line)')
    let monoS = true; let prevS = -1
    for (let s = 0; s <= 0.08; s += 0.005) { const L = streakLen(1, s); if (L < prevS - 1e-12) monoS = false; prevS = L }
    ok(monoS, 'streak length grows monotonically with speed (no popping)')

    const sp = makeStreakPool(8, { width: 0.08 })
    ok(sp.mesh.material.blending === THREE.AdditiveBlending && sp.mesh.material.depthWrite === false && sp.mesh.material.vertexColors, 'streak quads are additive, depth-write-free, vertex-coloured (glow, not paint)')
    ok(sp.mesh.geometry.index.count === 8 * 6, 'index buffer covers every quad with two triangles')
    sp.spawn(0, 0.2, 0, 0.05, 0, 0, 4, 0xffd23c, 0.3)
    sp.step(-0.001, -1)
    ok(sp.aliveCount === 1, 'a streak spawns alive')
    const Q = sp.mesh.geometry.getAttribute('position')
    const span = (ax) => { let lo = 1e9; let hi = -1e9; for (let i = 0; i < 4; i++) { lo = Math.min(lo, Q['get' + ax](i)); hi = Math.max(hi, Q['get' + ax](i)) } return hi - lo }
    ok(span('X') > span('Y') * 3, `a side-running streak lies along SCREEN X for a default camera (${span('X').toFixed(3)} long vs ${span('Y').toFixed(3)} wide — a dash, not a square)`)
    ok(span('Z') < 1e-6, `all four corners share one depth plane (${span('Z').toExponential(1)}) — a true billboard`)
    const CQ = sp.mesh.geometry.getAttribute('color')
    const luma = (i) => CQ.getX(i) * 0.299 + CQ.getY(i) * 0.587 + CQ.getZ(i) * 0.114
    ok(luma(1) > luma(0) * 1.5 && luma(2) > luma(3) * 1.5, 'streaks taper — the head burns, the tail dims')
    sp.step(-0.001, -1); sp.step(-0.001, -1); sp.step(-0.001, -1); sp.step(-0.001, -1)
    ok(sp.aliveCount === 0, 'streaks retire with their life (no orphaned quads)')
    sp.spawn(0, 0.2, 0, 0.05, 0, 0, 9, 0xffffff, 0.3)
    sp.step(-0.001, -1)
    sp.clear()
    ok(sp.aliveCount === 0 && CQ.getX(0) === 0, 'clear() sweeps live streaks (restart leaves no smear)')

    // velocity INTO the camera must not collapse the quad or smear it in depth
    const sp2 = makeStreakPool(4)
    sp2.spawn(0, 0.2, 0, 0, 0, -0.05, 4, 0xffffff, 0.3)
    sp2.step(-0.001, -1)
    const Q2 = sp2.mesh.geometry.getAttribute('position')
    let finite = true; let sx = 0; let sz2 = 0
    for (let i = 0; i < 4; i++) { finite = finite && Number.isFinite(Q2.getX(i)) && Number.isFinite(Q2.getY(i)) && Number.isFinite(Q2.getZ(i)) }
    let loX = 1e9; let hiX = -1e9; let loZ = 1e9; let hiZ = -1e9
    for (let i = 0; i < 4; i++) { loX = Math.min(loX, Q2.getX(i)); hiX = Math.max(hiX, Q2.getX(i)); loZ = Math.min(loZ, Q2.getZ(i)); hiZ = Math.max(hiZ, Q2.getZ(i)) }
    sx = hiX - loX; sz2 = hiZ - loZ
    ok(finite && sx > 0.1 && sz2 < 1e-6, `velocity straight into the lens falls back to a screen-right dash (span ${sx.toFixed(2)}x, no NaN)`)

    // alignment follows the CAMERA, not the world: yaw the camera 90°, and a
    // world-Z velocity must spread along world Z with zero world-X spread.
    const cam = new THREE.Object3D()
    cam.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'YXZ'))
    const sp3 = makeStreakPool(4)
    sp3.spawn(0, 0.2, 0, 0, 0, 0.05, 4, 0xffffff, 0.3)
    sp3.step(-0.001, -1, cam)
    const Q3 = sp3.mesh.geometry.getAttribute('position')
    let lo3x = 1e9; let hi3x = -1e9; let lo3z = 1e9; let hi3z = -1e9
    for (let i = 0; i < 4; i++) { lo3x = Math.min(lo3x, Q3.getX(i)); hi3x = Math.max(hi3x, Q3.getX(i)); lo3z = Math.min(lo3z, Q3.getZ(i)); hi3z = Math.max(hi3z, Q3.getZ(i)) }
    ok(hi3x - lo3x < 1e-6 && hi3z - lo3z > 0.2, `the dash yaws WITH the camera (90° yaw: world-Z spread ${(hi3z - lo3z).toFixed(2)}, world-X ${(hi3x - lo3x).toExponential(1)})`)

    // the shell drives it: player gold + rival exhausts + harness visibility
    const SRC = readFileSync(SHARD, 'utf8')
    ok(SRC.includes('makeStreakPool(') && SRC.includes('streaks.step('), 'index.jsx builds the streak pool and billboards it every tick')
    ok((SRC.match(/streaks\.spawn\(/g) || []).length >= 3, 'gold wheels AND rival exhausts spawn streaks (player + pack covered)')
    ok(SRC.includes('0xff8a30'), 'rival afterburners carry a hot-exhaust colour of their own')
    ok(SRC.includes('streaks: streaks.aliveCount'), 'fx() reports the streak pool to the harness')
    ok((SRC.match(/streaks\.clear\(\)/g) || []).length >= 4, 'every restart path sweeps the streak pool')
}

// ------------------------------------------------------- dusk sky (#478 item 6)
console.log('dusk sky (#478 item 6 — dither + twinkling stars):')
{
    const SK = await import('file://' + SCENE + '?t=' + (Date.now() + 2))
    const { applySkyDither, makeStarDefs, twinkle, STAR_Y_MIN, DITHER_AMP } = SK
    const flatSky = () => {
        const d = new Uint8ClampedArray(64 * 256 * 4)
        for (let i = 0; i < 64 * 256; i++) { d[i * 4] = 60; d[i * 4 + 1] = 30; d[i * 4 + 2] = 40; d[i * 4 + 3] = 255 }
        return d
    }
    const a1 = applySkyDither(flatSky(), 64, 256)
    const a2 = applySkyDither(flatSky(), 64, 256)
    ok(a1.every((v, i) => v === a2[i]), 'the dither is deterministic (identical noise every boot)')
    const levels = new Set()
    for (let y = 0; y < 256; y++) levels.add(a1[(y * 64 + 32) * 4])
    ok(levels.size >= 2, `the dither breaks a flat 60-level band into ${levels.size} dithered levels`)
    let dev = 0
    let alphaKept = true
    for (let i = 0; i < 64 * 256; i++) {
        dev = Math.max(dev, Math.abs(a1[i * 4] - 60), Math.abs(a1[i * 4 + 1] - 30), Math.abs(a1[i * 4 + 2] - 40))
        if (a1[i * 4 + 3] !== 255) alphaKept = false
    }
    ok(dev > 0 && dev <= Math.ceil(DITHER_AMP), `the noise stays subtle (${dev} / ${DITHER_AMP} levels max deviation)`)
    ok(alphaKept, 'the dither touches colour only — alpha survives')
    const vals = new Set()
    for (let t = 0; t < 240; t++) vals.add(Math.round(twinkle(0.3, t) * 1000) / 1000)
    ok(vals.size >= 40, `twinkle varies smoothly over 4s (${vals.size} distinct levels)`)
    let lo = 1
    let hi = 0
    for (let t = 0; t < 600; t++) { const v = twinkle(0.77, t); lo = Math.min(lo, v); hi = Math.max(hi, v) }
    ok(lo >= 0.4 - 1e-9 && hi <= 1 + 1e-9 && hi - lo > 0.5, `twinkle stays in [0.4,1] and runs the full range (${lo.toFixed(2)}..${hi.toFixed(2)})`)
    const defs = makeStarDefs()
    ok(defs.length >= 48, `the star field has ${defs.length} stars`)
    ok(defs.every((d) => d.dir[1] >= STAR_Y_MIN), `every star sits in the UPPER band (y >= ${STAR_Y_MIN}) — the dusk rim stays clean`)
    ok(defs.every((d) => Math.abs(Math.hypot(d.dir[0], d.dir[1], d.dir[2]) - 1) < 1e-9), 'star directions are unit vectors (the field rides the dome radius)')
    ok(JSON.stringify(defs) === JSON.stringify(makeStarDefs()), 'the star field is deterministic (same sky every boot)')
    ok(new Set(defs.map((d) => Math.round(d.phase * 1000))).size >= defs.length * 0.8, 'stars twinkle OUT of step (spread phases)')
    const SRC6 = readFileSync(SHARD, 'utf8')
    ok(SRC6.includes('applySkyDither(id.data'), 'skyTex dithers the dusk gradient before upload')
    ok(SRC6.includes('new THREE.Points(') && SRC6.includes('twinkleStars(g.tick)'), 'index.jsx builds the star points and twinkles them every tick')
    ok(SRC6.includes('stars: () =>'), 'the harness reads the star field via __cometHDTest.stars()')
}

// ------------------------------------------------------ wall variety (#478 item 7)
// The Gulch's two cliff walls wore ONE strata texture end to end, so the same
// band pattern tiled past at speed. Each wall now carries a per-section rock
// tint (vertex colours × shared map) cycling four stone families per lap, the
// two sides out of phase, blended so the lap seam stays continuous.
console.log('wall variety (#478 item 7 — per-section rock tint, sides out of phase):')
{
    const WV = await import('file://' + SCENE + '?t=' + (Date.now() + 3))
    const { wallTint, WALL_TINT_PALETTE, WALL_TINT_STEPS, trackGeometryStats: freshStats } = WV
    ok(WALL_TINT_STEPS % WALL_TINT_PALETTE.length === 0, `the tint cycle closes on itself (${WALL_TINT_STEPS} steps / ${WALL_TINT_PALETTE.length} stone families) — every lap repeats the SAME stone story`)
    ok(WALL_TINT_PALETTE.every((c) => c.every((v) => v > 0.4 && v <= 1)), 'tints stay bright (0.4..1 multipliers) — they vary the stone, they never paint it night')
    const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
    const maxDelta = Math.max(...WALL_TINT_PALETTE.map((c, k) => {
        const b = WALL_TINT_PALETTE[(k + 1) % WALL_TINT_PALETTE.length]
        return Math.max(...c.map((v, j) => Math.abs(b[j] - v)))
    }))
    const SAMPLE_BOUND = maxDelta * 1.5 * (WALL_TINT_STEPS / TRACK.N) * 1.5
    let lawMono = true; let prevT = null; let worstJump = 0
    for (let i = 0; i <= TRACK.N; i++) {
        const t = wallTint(i % TRACK.N, 1)
        if (!t.every(Number.isFinite)) lawMono = false
        if (prevT) { const d = Math.abs(lum(t) - lum(prevT)); worstJump = Math.max(worstJump, d); if (d > SAMPLE_BOUND) lawMono = false }
        prevT = t
    }
    ok(lawMono, `the tint law is finite and smooth ring by ring (worst ring-to-ring swing ${worstJump.toExponential(1)}u — a hard band step would be ~${maxDelta.toFixed(2)})`)
    for (const c of COURSES) {
        selectCourse(c.id)
        const G = freshStats().geos
        const tints = (geo) => {
            const CQ = geo.getAttribute('color')
            const set = new Set(); let lo = 1; let hi = 0
            for (let v = 0; v < CQ.count; v += 2) {
                set.add(`${CQ.getX(v).toFixed(2)},${CQ.getY(v).toFixed(2)},${CQ.getZ(v).toFixed(2)}`)
                const l = lum([CQ.getX(v), CQ.getY(v), CQ.getZ(v)])
                lo = Math.min(lo, l); hi = Math.max(hi, l)
            }
            return { set: set.size, spread: hi - lo }
        }
        const wl = tints(G.wallL); const wr = tints(G.wallR)
        ok(wl.set >= 4 && wr.set >= 4, `${c.id}: both walls read varied stone along the lap (${wl.set} distinct tints left, ${wr.set} right — one texture tiled alone gave 1)`)
        ok(wl.spread >= 0.1 && wr.spread >= 0.1, `${c.id}: stone brightness swings ${wl.spread.toFixed(2)}u left / ${wr.spread.toFixed(2)}u right (bleached sand to umber, not a wash)`)
        const R = freshStats().geos
        const aL = R.wallL.getAttribute('color'); const aR = R.wallR.getAttribute('color')
        let phaseDiffers = false
        for (let i = 0; i < 200; i++) {
            if (Math.abs(aL.getX(i * 2) - aR.getX(i * 2)) > 1e-3) { phaseDiffers = true; break }
        }
        ok(phaseDiffers, `${c.id}: the two walls run out of phase (a straight shows different rock left AND right)`)
        const N = freshStats().geos.wallL.getAttribute('position').count / 2 - 1
        const seamA = wallTint(0, 1); const seamB = wallTint(N - 1, 1)
        const seamGap = Math.max(...seamA.map((v, k) => Math.abs(v - seamB[k])))
        ok(seamGap < 0.06, `${c.id}: the tint cycle closes across the start/finish seam (worst channel step ${seamGap.toFixed(3)})`)
    }
    selectCourse('gulch')
    const SRC7 = readFileSync(SHARD, 'utf8')
    ok(/const strataMat = mat\(tex\(strataTex\(\)\), \{ vertexColors: true \}\)/.test(SRC7), 'index.jsx lets the wall material read the per-section tints (vertexColors)')
    ok(SRC7.includes('M.wallL, strataMat') && SRC7.includes('M.wallR, strataMat'), 'both cliff walls share the tinted strata material (retextured, not rebuilt)')
}

// ------------------------------------------------------------------ rules
console.log('reused sim keeps its rules under the new renderer:')
{
    const h1 = []; const h2 = []
    const gA = makeGame(0); const gB = makeGame(0)
    for (let i = 0; i < 900; i++) { step(gA, decide(gA)); h1.push(stateHash(gA)); step(gB, decide(gB)); h2.push(stateHash(gB)) }
    ok(h1.join() === h2.join(), 'same seed replays identically, tick for tick (900 ticks)')
}
{
    // the ladder pays (reference implementation: cometcheck's treadmill — pin
    // the kart to one road point so a long drift accrues without it wandering
    // into a wall). In a real race the autopilot's line precision rarely holds
    // a drift long enough; that gap rides the shared sim and is filed to QA.
    const p = TRACK.pts[40]
    const run = (ticks) => {
        const g = makeGame(5)
        g.phase = 'race'; g.count = 0
        const P = g.karts[0]
        P.v = 6; P.lapStart = -999
        const pin = () => { P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 40; P.hint = 40 }
        for (let i = 0; i < ticks; i++) { pin(); step(g, { u: true, r: true, drift: true }) }
        step(g, { u: true })
        return P
    }
    const short = run(70)
    ok(short.boostT > 0 && short.boostTier === 0, `held drift pays tier 0 on release (boostT ${short.boostT})`)
    const gold = run(170)
    ok(gold.boostT > 0 && gold.boostTier === 2, `165-tick hold pays the GOLD turbo (boostT ${gold.boostT})`)
    ok(gold.boostT > short.boostT, 'higher tiers pay longer boosts')
}
{
    const g = makeGame(0)
    const P = g.karts[0]
    let t = 0
    const banked = [0, 0, 0]
    while (!g.end && t < 60000) {
        step(g, decide(g))
        for (const ev of g.events.splice(0)) if (ev.e === 'boost' && ev.who === 'COMET') banked[ev.tier]++
        t++
    }
    ok(g.end === 'win', `autopilot drives the field from P7 and WINS (${(t / 60).toFixed(1)}s world time, ${P.lap} laps)`)
    ok(banked[0] + banked[1] + banked[2] >= 3, `the ladder pays in a REAL race, not just the treadmill: ${banked[0]} blue + ${banked[1]} violet + ${banked[2]} gold banked (#471 item 8)`)
    ok(banked[2] >= 1, 'the autopilot banks the GOLD tier in-race')
}

// ---------------------------------------------------------------- bank voices
// #478 item 5: GOLD banks with a rising bell chime the lower tiers never ring.
console.log('bank voices (#478 item 5 — gold bell chime):')
{
    const AV = await import('file://' + AUDIO + '?t=' + Date.now())
    const { bankVoices, GOLD_CHIME, GOLD_BELL } = AV
    const sineTones = (tier) => bankVoices(tier).filter((v) => v.k === 'tone' && v.t === 'sine').map((v) => v.f)
    const chime = sineTones(2)
    ok(GOLD_CHIME.length >= 3, `gold chime is a ${GOLD_CHIME.length}-note arpeggio (not a single blip)`)
    ok(GOLD_CHIME.every((c) => c[2] === 'sine'), 'the chime is pure sine (bell, not a chiptune square)')
    ok(GOLD_CHIME.every((c) => c[1] <= 0.3), 'every chime note is short (<=0.3s) so it rings, not drones')
    ok(GOLD_CHIME.every((c, i) => i === 0 || c[0] > GOLD_CHIME[i - 1][0]), 'the chime ascends (rising ladder to the bell)')
    ok(chime.length === GOLD_CHIME.length && chime[chime.length - 1] === GOLD_BELL && GOLD_BELL >= 3000, `tier 2 rings the full chime topping out on the high G7 bell (${GOLD_BELL}Hz)`)
    ok(bankVoices(0).every((v) => v.t !== 'sine') && bankVoices(1).every((v) => v.t !== 'sine'), 'blue and violet have NO bell — the chime is GOLD-only')
    ok(GOLD_CHIME.every((c, i) => i === 0 || c[4] > GOLD_CHIME[i - 1][4]), 'chime notes arpeggiate (rising delays, not a chord stab)')
    ok(readFileSync(SHARD, 'utf8').includes('bankVoices(ev.tier)'), 'index.jsx drives the COMET bank voices from bankVoices(ev.tier)')
}

// ---------------------------------------------------------------- browser
if (!SKIP_BROWSER) {
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    const BASE = process.env.HD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd`
    // pixel assertions need the WebGL2 backend: a WebGPU canvas answers black
    // to 2D drawImage/getImageData. The game defaults to WebGPU (verified on
    // the compositor via screenshots); the harness pins the fallback it
    // advertises for phones, and checks both backends boot.
    const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'gl=webgl2'
    console.log(`browser (${URL}):`)
    requireDevServer(BASE)
    const browser = await launch()
    const page = await openGame(browser, { url: URL, viewport: { width: 840, height: 420 }, hook: '__cometHDTest', wait: 500 })
    try {
        await page.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend = await page.evaluate(() => window.__cometHDTest.backend())
        ok(backend === 'webgl2' || backend === 'webgl2-legacy', `WebGL2 fallback backend active for pixel checks (${backend})`)

        // #478 item 1: the legacy refuge must run WITHOUT the post chain (graceful absence)
        const chainPinned = await page.evaluate(() => window.__cometHDTest.fxChain())
        ok(chainPinned.mode === null && chainPinned.pipeline === false, `post chain is gracefully absent on the pinned legacy path (mode ${chainPinned.mode}, ${chainPinned.backend})`)

        // #477: the authored dune buggy GLB must actually replace the primitive
        // fallback (proves the async swap + material-clone + rig wiring run in a
        // browser, not just in the Node contract).
        try {
            await page.waitForFunction(() => window.__cometHDTest.modelLoaded(), null, { timeout: 15000 })
            ok(true, 'authored dune_buggy.glb swapped in for the primitive kart')
        } catch {
            ok(false, 'authored dune_buggy.glb swapped in for the primitive kart')
        }

        const pixels = async () => page.evaluate(() => {
            const src = document.querySelector('canvas')
            const cv = document.createElement('canvas')
            cv.width = 160; cv.height = 90
            const x = cv.getContext('2d')
            x.drawImage(src, 0, 0, 160, 90)
            const d = x.getImageData(0, 0, 160, 90).data
            let min = 255; let max = 0
            const uniq = new Set()
            for (let i = 0; i < d.length; i += 4) {
                const l = (d[i] + d[i + 1] + d[i + 2]) / 3
                min = Math.min(min, l); max = Math.max(max, l)
                uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
            }
            return { min, max, uniq: uniq.size }
        })
        await page.waitForTimeout(600)
        const p1 = await pixels()
        ok(p1.max - p1.min > 60 && p1.uniq > 12, `canvas draws a real world, not black/flat (luma ${p1.min}..${p1.max}, ${p1.uniq} colors)`)

        await page.keyboard.press('Space')
        await page.waitForTimeout(150)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'race', 'any key leaves attract for the race')

        await page.evaluate(() => { window.__cometHDTest.game().count = 1 })
        await page.keyboard.down('KeyX')
        await page.waitForFunction(() => window.__cometHDTest.fx().v > 4.5, null, { timeout: 4000 }).catch(() => {})
        await page.waitForTimeout(120)
        const vHeld = await page.evaluate(() => window.__cometHDTest.fx().v)
        ok(vHeld > 4.5, `gas accelerates the buggy past the drift threshold (v ${vHeld.toFixed(2)})`)

        // #481 item 2/3 in pixels: the blob steers with the kart heading, and
        // the brake lamps put hot red into the frame only when braking.
        {
            const follow = await page.evaluate(() => {
                const t = window.__cometHDTest.shadowBlob()
                const P = window.__cometHDTest.game().karts[0]
                return { parts: t.parts, err: Math.abs(t.rotY - (Math.PI / 2 - P.a)) }
            })
            ok(follow.parts === 2 && follow.err < 0.05, `blob shadow rides the kart heading in the live loop (${follow.parts} passes, rot err ${follow.err.toFixed(4)} rad)`)
            const glowCoast = await page.evaluate(() => window.__cometHDTest.brakeGlow())
            await page.keyboard.down('KeyS')
            await page.waitForTimeout(300)
            const glowBrake = await page.evaluate(() => window.__cometHDTest.brakeGlow())
            await page.keyboard.up('KeyS')
            ok(glowBrake >= 1.5 && glowCoast <= 0.4, `brake command drives the lamp material idle→blaze (${glowCoast} → ${glowBrake}) in the live loop`)
        }

        // slalom with drift held: serpentine keeps the kart on the asphalt,
        // and charge accrues through the whole weave (steer never hits 0)
        // drift through the contract loop: deterministic, no key-timing jitter
        // (the old keyboard slalom sank into the sand on BOTH old and new sims
        // depending on puppeteer key timing — it proved nothing). Drift legs
        // are separated by 3-tick steer-neutral gaps: pre-#471 code released
        // the drift in every gap (charge never reached 50, no bank); with the
        // apex grace the hold survives and the release banks blue.
        await page.keyboard.up('Space')
        await page.keyboard.up('KeyX')
        {
            const t = (await import('../src/games/CometDrift/track.js')).TRACK
            const p = t.pts[40]
            await page.evaluate(() => window.__game.release())
            const s = await page.evaluate(() => window.__game.snapshot())
            const P = s.karts[0]
            P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 40; P.hint = 40; P.v = 6; P.lapStart = -9999
            P.spinT = 0; P.driftT = 0; P.charge = -1; P.boostT = 0; P.offroad = false
            await page.evaluate((ss) => window.__game.restore(ss), s)
            // treadmill like the Node ladder: pin the kart each tick so the
            // curved drift path can't wander into a wall and spin (which would
            // clear the charge). Only the grace law is under test here.
            const leg = (ticks, extra) => page.evaluate(({ x, y, a, ticks, extra }) => {
                const P = window.__cometHDTest.game().karts[0]
                for (let i = 0; i < ticks; i++) {
                    P.x = x; P.y = y; P.a = a; P.idx = 40; P.hint = 40; P.v = Math.min(P.v, 7.5)
                    window.__game.step({ up: true, ...extra }, 1)
                }
            }, { x: p.x, y: p.y, a: p.a, ticks, extra })
            let mid = { driftT: 0, charge: -1 }
            for (let i = 0; i < 6; i++) {
                await leg(12, { right: true, a: true })
                await leg(3, { a: true })
                mid = await page.evaluate(() => window.__game.state())
            }
            const midFx = await page.evaluate(() => window.__cometHDTest.fx())
            ok(mid.driftT > 40, `steer-neutral gaps no longer kill a held drift — apex grace bridges them (driftT ${mid.driftT}, charge ${mid.charge})`)
            ok(midFx.sparks > 0, `drift kicks GPU sparks (pool ${midFx.sparks})`)
            await leg(2, {})
            const b = await page.evaluate(() => window.__game.state())
            ok(b.boostT > 0 && b.driftT === 0, `releasing after gapped legs banks a turbo (boostT ${b.boostT}) — pre-grace code banked nothing here`)
        }

        // #478 item 4: GOLD paints camera-aligned streaks; a boosting rival
        // leaves an afterburner trail. Pinned treadmill like the ladder above.
        {
            const t2 = (await import('../src/games/CometDrift/track.js')).TRACK
            const p40 = t2.pts[40]
            await page.evaluate(() => window.__game.release())
            const goldLeg = () => page.evaluate(({ x, y, a }) => {
                const P = window.__cometHDTest.game().karts[0]
                for (let i = 0; i < 6; i++) {
                    P.x = x; P.y = y; P.a = a; P.idx = 40; P.hint = 40; P.v = Math.min(P.v, 7.5)
                    P.charge = Math.max(P.charge, 170); P.spinT = 0; P.offroad = false
                    window.__game.step({ up: true, right: true, a: true }, 1)
                }
            }, { x: p40.x, y: p40.y, a: p40.a })
            await goldLeg()
            const fxG = await page.evaluate(() => window.__cometHDTest.fx())
            ok(fxG.streaks > 0, `GOLD drift paints camera-aligned streak quads (${fxG.streaks} live)`)
            ok(fxG.sparks > 0, 'gold keeps its spark dots — streaks augment, never replace')
            await page.evaluate(() => { const k = window.__cometHDTest.game().karts[1]; k.boostT = 30; k.boostTier = 2; k.v = 6; k.driftT = 0 })
            for (let i = 0; i < 4; i++) await page.evaluate(() => window.__game.step({ up: true }, 1))
            ok((await page.evaluate(() => window.__cometHDTest.fx())).streaks > 0, 'a boosting rival leaves an afterburner trail')
        }

        const p2 = await pixels()
        ok(p2.max - p2.min > 60, 'canvas still renders after a boost (not a dead black frame)')

        // end table round-trip at contract speed: teleport onto the line on
        // the last lap, drive over it, watch the end screen, tap back out.
        const snap = await page.evaluate(() => {
            window.__game.release()
            const s = window.__game.snapshot()
            const P = s.karts[0]
            P.lap = 3; P.cp = 15
            return s
        })
        {
            const t = (await import('../src/games/CometDrift/track.js')).TRACK
            const p = t.pts[t.N - 4]
            snap.karts[0].x = p.x; snap.karts[0].y = p.y; snap.karts[0].a = p.a
            snap.karts[0].idx = t.N - 4; snap.karts[0].hint = t.N - 4; snap.karts[0].v = 8
        }
        await page.evaluate((s) => window.__game.restore(s), snap)
        let doneState = { done: false }
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => window.__game.step({ up: true }, 60))
            doneState = await page.evaluate(() => window.__game.state())
            if (doneState.done) break
        }
        ok(doneState.done === true, 'crossing the line on the last lap ends the race')
        await page.evaluate(() => window.__game.release())
        await page.waitForTimeout(120)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'end', 'shell switches to the end screen')
        await page.waitForTimeout(500)
        await page.keyboard.press('KeyX')
        await page.waitForTimeout(120)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'attract', 'one key (after the guard) restarts from the end table')

        const p3 = await pixels()
        ok(p3.max - p3.min > 60, 'attract still renders live after restart (full cycle survives)')
    } finally {
        await browser.close()
    }

    // the product default: WebGPU is attempted first (falls back per-device)
    // #542: back-to-back headless Chromes briefly wedge the GPU process and
    // the second boot lands in the legacy refuge; let the first one fully die.
    await new Promise((r) => setTimeout(r, 2000))
    const b2 = await launch()
    try {
        const page2 = await openGame(b2, { url: BASE, viewport: { width: 640, height: 360 }, hook: '__cometHDTest' })
        await page2.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend2 = await page2.evaluate(() => window.__cometHDTest.backend())
        ok(backend2 === 'webgpu' || backend2 === 'webgl2' || backend2 === 'webgl2-legacy', `default boot picks a real backend (got ${backend2})`)
        ok(backend2 === 'webgpu' || backend2 === 'webgl2', 'backend is WebGPU or the advertised WebGL2 fallback')

        // #478 item 1: the earned-bloom chain is live on whichever node backend
        // the product default picked, the radial smear follows boost both ways,
        // and on a pixel-readable backend the bloom demonstrably lights the frame.
        const ch = await page2.evaluate(() => window.__cometHDTest.fxChain())
        ok(ch.mode !== null && ch.pipeline === true, `post chain builds on the node backend (${ch.backend}: ${ch.mode})`)
        await page2.evaluate(() => { const k = window.__cometHDTest.game().karts[0]; k.boostT = 90; k.boostTier = 2 })
        await page2.waitForTimeout(120)
        const rb = await page2.evaluate(() => window.__cometHDTest.fxChain())
        ok(rb.radial > 0.3 && rb.bloom > 0, `gold boost drives the radial smear + keeps bloom gain live (radial ${rb.radial}, bloom ${rb.bloom})`)
        await page2.evaluate(() => { window.__cometHDTest.game().karts[0].boostT = 0 })
        await page2.waitForTimeout(150)
        const rd = await page2.evaluate(() => window.__cometHDTest.fxChain().radial)
        ok(rd === 0, `radial smear decays to zero the moment boost ends (${rd})`)
        // #478 item 6: stars ride the dome and twinkle in the running world.
        const st6a = await page2.evaluate(() => window.__cometHDTest.stars())
        ok(st6a.count >= 48 && st6a.upper === true && st6a.radius > 100, `star field rides the dome (${st6a.count} upper-band stars, r=${st6a.radius})`)
        await page2.waitForTimeout(260)
        const st6b = await page2.evaluate(() => window.__cometHDTest.stars())
        ok(st6a.bright > 0 && st6a.bright <= 1 && st6b.bright > 0 && st6b.bright <= 1, `star brightness stays in range (${st6a.bright} -> ${st6b.bright})`)
        ok(st6a.bright !== st6b.bright, `stars twinkle live in the running world (${st6a.bright} -> ${st6b.bright})`)
        if (backend2 === 'webgl2') {
            const bright = () => page2.evaluate(() => {
                const src = document.querySelector('canvas')
                const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90
                const x = cv.getContext('2d'); x.drawImage(src, 0, 0, 160, 90)
                const d = x.getImageData(0, 0, 160, 90).data
                let s = 0
                for (let i = 0; i < d.length; i += 4) s += Math.max(0, (d[i] + d[i + 1] + d[i + 2]) / 3 - 150)
                return s
            })
            await page2.evaluate(() => window.__cometHDTest.setBloom(0))
            await page2.waitForTimeout(120)
            const offA = await bright()
            await page2.evaluate(() => window.__cometHDTest.setBloom(1.4))
            await page2.waitForTimeout(120)
            const onS = await bright()
            await page2.evaluate(() => window.__cometHDTest.setBloom(0))
            await page2.waitForTimeout(120)
            const offB = await bright()
            ok(onS > Math.max(offA, offB) + 40, `bloom demonstrably adds glow to the frame (glow-sum off ${offA.toFixed(0)}/${offB.toFixed(0)} -> on ${onS.toFixed(0)})`)
            await page2.evaluate(() => window.__cometHDTest.setBloom(0.5))
        }
    } finally {
        await b2.close()
    }

    // #478 item 0: ?renderer=webgl (Jon's pin name) pins the WebGL2 fallback.
    await new Promise((r) => setTimeout(r, 2000))
    const b3 = await launch()
    try {
        const page3 = await openGame(b3, { url: BASE + '?renderer=webgl', viewport: { width: 640, height: 360 }, hook: '__cometHDTest' })
        await page3.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend3 = await page3.evaluate(() => window.__cometHDTest.backend())
        ok(backend3 === 'webgl2' || backend3 === 'webgl2-legacy', `?renderer=webgl pins the WebGL2 fallback (${backend3})`)
    } finally {
        await b3.close()
    }
}

console.log(`\ncometdrifthdcheck: ${pass} pass, ${fail} fail`)
if (MUTATE || MUTATE_CHIME || MUTATE_BLOOM || spinmutat || streakmutat || starmutat || wallmutat) process.exit(fail > 0 ? 0 : 1)
process.exit(fail > 0 ? 1 : 0)
