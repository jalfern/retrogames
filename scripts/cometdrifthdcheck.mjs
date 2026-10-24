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
import { TRACK, COURSES, selectCourse, crestDipLaw, crestDust } from '../src/games/CometDrift/track.js'
import { BANDS } from '../src/games/CometDrift/bands.js'
import { trackGeometryStats, buildKart, makePool, makeStreakPool, kartYaw, BUGGY_SCALE, cameraCorridorAudit, wallTopSideAt, BANK_RISE, refOverlayStats, bloomDiscs, BLOOM2D_MIN_LUMA } from '../src/games/CometDriftHD/scene.js'
import { selectorGeom, selectorHit } from '../src/games/CometDrift/selector.js'
import * as THREE from 'three'

const args = process.argv.slice(2)
const MUTATE = args.includes('--mutate')
const MUTATE_CHIME = args.includes('--mutate-chime')
const MUTATE_BLOOM = args.includes('--mutate-bloom')
const MUTATE_MUSIC = args.includes('--mutate-music')
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

// #1001 music mutant: push the comet bed's opening hook a semitone out of G
// major — the in-key gate MUST go red under this run (the bed must stay musical).
const ACMUS = resolve(HERE, '../src/utils/AudioController.js')
const QLINE = '67, 0, 71, 0, 74, 0, 71, 0'
const QUTIL = '68, 0, 71, 0, 74, 0, 71, 0'
let musicmutat = false
if (MUTATE_MUSIC) {
    const msrc = readFileSync(ACMUS, 'utf8')
    if (!msrc.includes(QLINE)) { console.error('MUTATE_MUSIC: comet lead not found — probing stale code.'); process.exit(2) }
    writeFileSync(ACMUS, msrc.replace(QLINE, QUTIL))
    musicmutat = true
    console.log('  ..    mutated: the comet hook has an off-key tone — the in-key music gate MUST report a FAIL')
    process.on('exit', () => {
        if (musicmutat) {
            writeFileSync(ACMUS, readFileSync(ACMUS, 'utf8').replace(QUTIL, QLINE))
            console.log('  ..    music mutation restored')
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

// #1016 bloom2d mutant: kill the refuge's 2D additive pass (never paint) — the
// refuge-glow browser gates MUST go red under this run.
const B2LINE = 'const BLOOM2D_ON = true'
const B2UTIL = 'const BLOOM2D_ON = false /* bloom2dmut */'
let bloom2dmutat = false
if (args.includes('--mutate-bloom2d')) {
    const b2src = readFileSync(SHARD, 'utf8')
    if (!b2src.includes(B2LINE)) { console.error('MUTATE_BLOOM2D: fallback flag not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, b2src.replace(B2LINE, B2UTIL))
    bloom2dmutat = true
    console.log('  ..    mutated: the refuge 2D bloom never paints — the gold-payoff gates MUST report a FAIL')
    process.on('exit', () => {
        if (bloom2dmutat) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(B2UTIL, B2LINE))
            console.log('  ..    bloom2d mutation restored')
        }
    })
}

// #794 selector mutant: collapse the chevron offset onto the centre — the
// flank / overlap / start-zone-clear gates MUST go red under this run.
const OLINE = 'const off = Math.max(hw + Math.round(16 * u), Math.min(want, Math.round(W / 2 - hw - Math.round(2 * u))))'
const OUTIL = 'const off = Math.round(hw / 2) /* selectmut */'
let selectmutat = false
if (args.includes('--mutate-select')) {
    const osrc = readFileSync(resolve(HERE, '../src/games/CometDriftHD/scene.js'), 'utf8')
    if (!osrc.includes(OLINE)) { console.error('MUTATE_SELECT: offset law not found — probing stale code.'); process.exit(2) }
    writeFileSync(resolve(HERE, '../src/games/CometDriftHD/scene.js'), osrc.replace(OLINE, OUTIL))
    selectmutat = true
    console.log('  ..    mutated: the chevrons collapse onto the centre — the #794 selector gates MUST report a FAIL')
    process.on('exit', () => {
        if (selectmutat) {
            const p = resolve(HERE, '../src/games/CometDriftHD/scene.js')
            writeFileSync(p, readFileSync(p, 'utf8').replace(OUTIL, OLINE))
            console.log('  ..    selector mutation restored')
        }
    })
}

// #478 item 3 spin-blur mutant: freeze the blur law at zero — the kart-feel
// gates MUST go red under this run.
const SCENE = resolve(HERE, '../src/games/CometDriftHD/scene.js')
const TRACKJS = resolve(HERE, '../src/games/CometDrift/track.js')
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

// #1002 ghost mutant: silence the reflection — the smear-band / live-opacity
// gates MUST go red under this run.
const GHLINE = '    base: 0.5,       // opacity at the camera, fading linearly to 0 at range'
const GHUTIL = '    base: 0,       // opacity at the camera, fading linearly to 0 at range /* ghostmut */'
let ghostmutat = false
if (args.includes('--mutate-ghost')) {
    const gsrc = readFileSync(SCENE, 'utf8')
    if (!gsrc.includes(GHLINE)) { console.error('MUTATE_GHOST: ghost base not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, gsrc.replace(GHLINE, GHUTIL))
    ghostmutat = true
    console.log('  ..    mutated: the ghost never gains opacity — the reflection gates MUST report a FAIL')
    process.on('exit', () => {
        if (ghostmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(GHUTIL, GHLINE))
            console.log('  ..    ghost mutation restored')
        }
    })
}

// #1002 mesa-shadow mutant: shorten the shadow law so no mesa clears the
// min-length — the count / corridor gates MUST go red under this run.
const MSLINE = '    lenK: 2.6,    // shadow length per unit of mesa height (the low sun)'
const MSUTIL = '    lenK: 0.05,    // shadow length per unit of mesa height (the low sun) /* msmut */'
let msmutat = false
if (args.includes('--mutate-mesashadow')) {
    const msrc = readFileSync(SCENE, 'utf8')
    if (!msrc.includes(MSLINE)) { console.error('MUTATE_MESASHADOW: shadow law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, msrc.replace(MSLINE, MSUTIL))
    msmutat = true
    console.log('  ..    mutated: mesa shadows cannot reach the min length — the mesa-shadow gates MUST report a FAIL')
    process.on('exit', () => {
        if (msmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(MSUTIL, MSLINE))
            console.log('  ..    mesa-shadow mutation restored')
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

// #502 item 1 skin mutant: flatten every course onto the dusk tint — the
// per-course skin gates MUST go red under this run (noon wears a sunset).
const KLINE = 'export const tintFor = (id) => COURSE_TINTS[id] || COURSE_TINTS.dusk'
const KUTIL = 'export const tintFor = () => COURSE_TINTS.dusk /* skinmut */'
let skinmutat = false
if (args.includes('--mutate-skin')) {
    const ksrc = readFileSync(SCENE, 'utf8')
    if (!ksrc.includes(KLINE)) { console.error('MUTATE_SKIN: tintFor law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, ksrc.replace(KLINE, KUTIL))
    skinmutat = true
    console.log('  ..    mutated: every course wears the dusk skin — the per-course skin gates MUST report FAILs')
    process.on('exit', () => {
        if (skinmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(KUTIL, KLINE))
            console.log('  ..    skin mutation restored')
        }
    })
}

// #502 item 6 register mutant: Sandbank's engine drops back to the dusk
// pitch — the register ladder gate MUST go red under this run.
const RLINE = 'export const ENGINE_REGISTER = { dusk: 1, dawn: 1.06, noon: 1.12 }'
const RUTIL = 'export const ENGINE_REGISTER = { dusk: 1, dawn: 1.06, noon: 1 } /* regmut */'
let regmutat = false
if (args.includes('--mutate-register')) {
    const rsrc = readFileSync(AUDIO, 'utf8')
    if (!rsrc.includes(RLINE)) { console.error('MUTATE_REGISTER: engine ladder not found — probing stale code.'); process.exit(2) }
    writeFileSync(AUDIO, rsrc.replace(RLINE, RUTIL))
    regmutat = true
    console.log('  ..    mutated: Sandbank runs at the dusk register — the ladder gate MUST report a FAIL')
    process.on('exit', () => {
        if (regmutat) {
            writeFileSync(AUDIO, readFileSync(AUDIO, 'utf8').replace(RUTIL, RLINE))
            console.log('  ..    register mutation restored')
        }
    })
}

// #511 item 2 env-wash mutant: flatten every course onto the dusk livery
// reflection — the env-wash gates MUST go red under this run (noon karts
// reflect a sunset they are not standing under).
const ELINE = 'export const envWashFor = (id) => ENV_WASHES[id] || ENV_WASHES.dusk'
const EUTIL = 'export const envWashFor = () => ENV_WASHES.dusk /* envmut */'
let envmutat = false
if (args.includes('--mutate-env')) {
    const esrc = readFileSync(SCENE, 'utf8')
    if (!esrc.includes(ELINE)) { console.error('MUTATE_ENV: envWashFor law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, esrc.replace(ELINE, EUTIL))
    envmutat = true
    console.log('  ..    mutated: every course reflects the dusk wash — the env-wash gates MUST report FAILs')
    process.on('exit', () => {
        if (envmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(EUTIL, ELINE))
            console.log('  ..    env mutation restored')
        }
    })
}

// #502 item 2 gantry mutant: Sandbank falls back onto the sandstone arch —
// the line-structure gates MUST go red under this run (bowl wears the Gulch's
// landmark again, the exact sameness the item complains about).
const GLINE = "if (T.landmark === 'gantry') return buildGantry(strataMap)"
const GUTIL = "if (false) return buildGantry(strataMap) /* gantrymut */"
let gantrymutat = false
if (args.includes('--mutate-gantry')) {
    const gsrc = readFileSync(SCENE, 'utf8')
    if (!gsrc.includes(GLINE)) { console.error('MUTATE_GANTRY: landmark dispatch not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, gsrc.replace(GLINE, GUTIL))
    gantrymutat = true
    console.log('  ..    mutated: Sandbank gets the Gulch arch back — the line-structure gates MUST report FAILs')
    process.on('exit', () => {
        if (gantrymutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(GUTIL, GLINE))
            console.log('  ..    gantry mutation restored')
        }
    })
}

// #502 item 3 brake-cue mutant: Sandbank loses its Bus Stop braking cue —
// the barrier gates MUST go red under this run (the double-kink is silent
// again, the exact readability gap the item complains about).
const CUELINE = "if (!T.brakeCue) return []"
const CUEUTIL = "if (true) return [] /* brakemut */"
let brakemutat = false
if (args.includes('--mutate-brakecue')) {
    const bsrc = readFileSync(SCENE, 'utf8')
    if (!bsrc.includes(CUELINE)) { console.error('MUTATE_BRAKECUE: brakeCue def not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, bsrc.replace(CUELINE, CUEUTIL))
    brakemutat = true
    console.log('  ..    mutated: the Bus Stop cue is gone — the barrier gates MUST report FAILs')
    process.on('exit', () => {
        if (brakemutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(CUEUTIL, CUELINE))
            console.log('  ..    brake-cue mutation restored')
        }
    })
}

// #718 floor mutant: pin the sand floor back to the flat dusk plane — the
// floor-vs-elevation gates MUST go red under this run.
const FLRLINE = 'export const courseFloorY = () => Math.min(FLOOR_DUSK, asphaltMinY() - FLOOR_MARGIN)'
const FLRLINE_UTIL = 'export const courseFloorY = () => FLOOR_DUSK /* floormut */'
let floormutat = false
if (args.includes('--mutate-floor')) {
    const fsrc = readFileSync(SCENE, 'utf8')
    if (!fsrc.includes(FLRLINE)) { console.error('MUTATE_FLOOR: floor law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, fsrc.replace(FLRLINE, FLRLINE_UTIL))
    floormutat = true
    console.log('  ..    mutated: the floor is the flat -1.5 plane again — the #718 gates MUST report FAILs')
    process.on('exit', () => {
        if (floormutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(FLRLINE_UTIL, FLRLINE))
            console.log('  ..    floor mutation restored')
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
// #530: the road ROLLS about its tangent through the banked sweeps (scene.js
// roadGeo) — the centreline still rides the #518 profile exactly, only the two
// edges move, symmetric about it. Every "road height" reference below is the
// centre, so the wall/foot/rim invariants read the true road level, not a lean.
const roadC = (i) => (yAt(geos.road, i, 0) + yAt(geos.road, i, 1)) / 2
{
    const S = 1 / 60
    let dev = 0
    let hangBad = 0; let footBad = 0; let rimBad = 0
    let minDev = Infinity; let maxDev = -Infinity
    const N = TRACK.N
    for (let i = 0; i < N; i++) {
        const ry = roadC(i)
        dev = Math.max(dev, Math.abs(ry - (TRACK.pts[i].h * S + 0.06)))
        const lift = yAt(geos.wallL, i, 1) - ry
        if (lift < 1.4 || lift > 3.7) hangBad++
        if (yAt(geos.wallL, i, 0) >= ry) footBad++
        if (yAt(geos.plateauL, i, 1) <= ry) rimBad++
        maxDev = Math.max(maxDev, lift)
        minDev = Math.min(minDev, lift)
    }
    ok(dev < 1e-6, `road centreline rides the #518 profile point for point (max dev ${dev.toExponential(1)}u — the #530 roll is symmetric about it)`)
    ok((stats.road.maxY - stats.road.minY) >= 0.9 * (bounds.elevMax - bounds.elevMin),
        `the road goes up and down: ${stats.road.minY.toFixed(2)}..${stats.road.maxY.toFixed(2)}u across the lap`)
    ok(hangBad === 0, `cliff walls ride the profile too — every section stands ${minDev.toFixed(2)}..${maxDev.toFixed(2)}u over the road under it`)
    ok(footBad === 0, 'wall bases stay under the road at every point (no floating cliffs, elevated or not)')
    ok(rimBad === 0, 'plateau rim stays above the road at every point (scenery has ground)')
    ok(bounds.maxGrade <= 0.0951, `grades stay arcade-steep, not stunt-steep (max ${bounds.maxGrade.toFixed(3)})`)
}
// #530: the surface roll. Through the bowl the road ribbon rolls about its
// tangent — the outside edge sits 2·ROAD_R·tan(bank) above the inside (scene.js
// roadGeo), so a bowl reads banked and a flat canyon stays flat. Pinned against
// the banking law itself: Sandbank (the high-bank course) must measure it, and a
// flat road (revert roadGeo) reads exactly 0 and goes red.
{
    const S = 1 / 60
    let lawMax = 0; let rollMax = 0
    selectCourse('sandbank')
    const g2 = trackGeometryStats().geos
    const N2 = TRACK.N
    for (let i = 0; i < N2; i++) {
        lawMax = Math.max(lawMax, 2 * TRACK.ROAD_R * S * Math.abs(Math.tan(TRACK.pts[i].bank)))
        rollMax = Math.max(rollMax, Math.abs(yAt(g2.road, i, 0) - yAt(g2.road, i, 1)))
    }
    selectCourse('gulch')
    ok(lawMax > 0.1, `#530 banking law is non-trivial on Sandbank (law max ${lawMax.toFixed(3)}u)`)
    ok(Math.abs(rollMax - lawMax) < 0.02, `#530 surface roll matches the banking law (measured ${rollMax.toFixed(3)}u vs law ${lawMax.toFixed(3)}u; a flat road reads 0)`)
}
// #530 item 2: the crest/dip law. `p.crest`/`p.dip` ride the grade sign flip so
// the HD camera can punch its FOV over a brow and sink it in a dip. Pinned three
// ways, on every course: (a) the attached lane equals the exported law recomputed
// from the live points (drop the build's crest assignment -> undefined -> red);
// (b) both lanes have a real peak (a course with no elevation has no feature);
// (c) the strongest crest sits where the grade genuinely flips up->down (a brow),
// and the strongest dip where it flips down->up — the camera move tracks terrain,
// not noise. Mutating crestDipLaw to flat reds every peak + flip gate.
console.log('crest/dip elevation feel (#530 item 2):')
{
    const win = 6
    const avg = (pts, i, sgn) => { let m = 0; for (let w = 1; w <= win; w++) m += pts[(i + sgn * w + pts.length) % pts.length].grade; return m / win }
    for (const id of ['gulch', 'sandbank', 'corkscomb']) {
        selectCourse(id)
        const pts = TRACK.pts; const N = TRACK.N
        const law = crestDipLaw(pts)
        let bad = 0
        for (let i = 0; i < N; i++) if (pts[i].crest !== law.crest[i] || pts[i].dip !== law.dip[i]) bad++
        ok(bad === 0, `${id}: p.crest/p.dip equal the crestDipLaw output (${bad} mismatches; a build that drops the lane reads NaN)`)
        ok(TRACK.crestPeak > 0 && TRACK.dipPeak > 0, `${id}: has both a crest (peak ${TRACK.crestPeak.toFixed(4)}) and a dip (peak ${TRACK.dipPeak.toFixed(4)})`)
        let ci = 0, di = 0
        for (let i = 1; i < N; i++) { if (pts[i].crest > pts[ci].crest) ci = i; if (pts[i].dip > pts[di].dip) di = i }
        ok(pts[ci].crest > 0.5 && avg(pts, ci, -1) > 0 && avg(pts, ci, 1) < 0,
            `${id}: strongest crest sits on a real brow (grade ${avg(pts, ci, -1).toFixed(3)} -> ${avg(pts, ci, 1).toFixed(3)})`)
        ok(pts[di].dip > 0.5 && avg(pts, di, -1) < 0 && avg(pts, di, 1) > 0,
            `${id}: strongest dip sits on a real bottom (grade ${avg(pts, di, -1).toFixed(3)} -> ${avg(pts, di, 1).toFixed(3)})`)
        ok(ci !== di, `${id}: crest and dip are distinct features (idx ${ci} vs ${di})`)
    }
    selectCourse('gulch')
}
// #530 item 2 (crest-lip dust): a kart flying over a brow kicks a short plume
// off the lip, so the break the #757 FOV dip implies is visible in the world.
// The emission is driven by the pure crestDust law (track.js), pinned here two
// ways — (a) the law's behaviour: nothing below the brow threshold or below the
// speed floor, monotone in both crest strength and speed, peaking at 1 on the
// brow at speed; (b) it is live on the shipped tracks: at each course's
// strongest crest the plume fires hard, at the strongest dip it stays nil (a
// bottom is not a lip), and the plume is brow-localised, not everywhere.
// Forcing crestDust -> 0 reds the monotone/peak gates and every live-course
// plume gate; flipping the speed term reds the speed-monotone gate.
console.log('crest-lip dust plume (#530 item 2):')
{
    ok(crestDust(0, 8) === 0 && crestDust(0.34, 8) === 0, 'no plume below the brow threshold (weak crest reads 0)')
    ok(crestDust(1, 1.5) === 0 && crestDust(1, 1) === 0, 'a crawling kart kicks nothing (speed at/below the floor reads 0)')
    ok(crestDust(1, 8) > crestDust(0.6, 8) && crestDust(0.6, 8) > crestDust(0.36, 8) && crestDust(0.36, 8) > 0,
        `plume grows with crest strength (0.36->${crestDust(0.36, 8).toFixed(3)}, 0.6->${crestDust(0.6, 8).toFixed(3)}, 1->${crestDust(1, 8).toFixed(3)})`)
    ok(crestDust(0.8, 8) > crestDust(0.8, 3) && crestDust(0.8, 3) > crestDust(0.8, 1.6) && crestDust(0.8, 1.6) > 0,
        `plume grows with speed (1.6->${crestDust(0.8, 1.6).toFixed(3)}, 3->${crestDust(0.8, 3).toFixed(3)}, 8->${crestDust(0.8, 8).toFixed(3)})`)
    ok(crestDust(1, 8) <= 1.0001 && crestDust(1, 8) >= 0.99, `brow at speed is a full plume (${crestDust(1, 8).toFixed(3)})`)
    const RACE_V = 7
    for (const id of ['gulch', 'sandbank', 'corkscomb']) {
        selectCourse(id)
        const pts = TRACK.pts; const N = TRACK.N
        let ci = 0, di = 0
        for (let i = 1; i < N; i++) { if (pts[i].crest > pts[ci].crest) ci = i; if (pts[i].dip > pts[di].dip) di = i }
        ok(crestDust(pts[ci].crest, RACE_V) > 0.5,
            `${id}: plume fires hard at the strongest brow (crest ${pts[ci].crest.toFixed(3)} -> intensity ${crestDust(pts[ci].crest, RACE_V).toFixed(3)})`)
        ok(crestDust(pts[di].crest, RACE_V) < 0.15,
            `${id}: no plume at the strongest dip (a bottom is not a lip: intensity ${crestDust(pts[di].crest, RACE_V).toFixed(3)})`)
        let live = 0
        for (let i = 0; i < N; i++) if (crestDust(pts[i].crest, RACE_V) > 0.05) live++
        ok(live > 0 && live < N * 0.5, `${id}: plume is brow-localised (${live}/${N} points kick at race speed)`)
    }
    selectCourse('gulch')
}
// #530 item 4: the ?ref=1 debug overlay — the traced real-map centerline
// (reference.js) fitted onto the shipped circuit. On a referenced course it
// must draw ≥200 finite points that hug the shipped centerline (<4% of the
// bbox span on average) and pick direct over mirror-x alignment (the layouts
// were authored on the un-mirrored map — cometcheck's own rule). Gulch has
// no traced map, so the overlay stays null there. Mutating refOverlayStats
// to return null reds every gate in this block.
console.log('reference overlay (#530 item 4):')
{
    ok(refOverlayStats('gulch') === null, 'gulch has no traced reference — overlay stays null')
    for (const id of ['sandbank', 'corkscomb']) {
        selectCourse(id)
        const ro = refOverlayStats()
        if (!ro) { ok(false, `${id}: overlay stats missing`); continue }
        let nan = 0
        for (let k = 0; k < ro.coords.length; k++) if (!Number.isFinite(ro.coords[k])) nan++
        ok(nan === 0 && ro.count >= 200, `${id}: overlay draws ${ro.count} finite points (NaN ${nan})`)
        ok(ro.meanPx > 0 && ro.meanPx / ro.spanPx <= 0.04, `${id}: overlay hugs the shipped centerline (mean ${ro.meanPx.toFixed(1)}px = ${(100 * ro.meanPx / ro.spanPx).toFixed(2)}% of span)`)
        ok(ro.mirror === false, `${id}: direct alignment beats mirror-x (authored on the un-mirrored map)`)
    }
    selectCourse('gulch')
}
// #530 item 2: the run-off/kerb ribs follow the MEASURED map bands (bands.js ←
// comet-bands.mjs) instead of uniform rings. Pinned three ways per traced
// course: the per-side wall offsets and kerb depths vary corner to corner (a
// constant ring reads std 0), the two sides disagree (the maps paint asymmetric
// escapes — Daytona's banking), and the offsets equal the law recomputed from
// bands.js directly (consumption: ignoring the file drops the equality). The
// Gulch has no traced map: it must stay the exact constant ring it was.
// Mutating bandRatioAt to return null reds every banded gate below.
console.log('measured run-off bands (#530 item 2):')
{
    selectCourse('gulch')
    {
        const b = trackGeometryStats().band
        ok(b.has === false, 'gulch has no traced map — band law reports no band')
        ok(b.offStdL === 0 && b.offStdR === 0 && b.asymMean === 0, 'gulch run-off stays the constant fallback ring (std 0, sides equal)')
        ok(b.kerbMin === 12 && b.kerbMax === 12, 'gulch kerb stays the uniform 12px fallback')
    }
    for (const id of ['sandbank', 'corkscomb']) {
        selectCourse(id)
        const b = trackGeometryStats().band
        ok(b.has === true && b.spanPx > 1000, `${id}: band law active (map span ${b.spanPx.toFixed(0)}px)`)
        ok(b.offStdL > 15 && b.offStdR > 15, `${id}: run-off width varies corner to corner (std L ${b.offStdL.toFixed(1)}px, R ${b.offStdR.toFixed(1)}px; a constant ring reads 0)`)
        ok(b.asymMean > 10, `${id}: the two sides disagree — asymmetric escapes read from the map (mean Δ ${b.asymMean.toFixed(1)}px)`)
        ok(b.kerbMin >= 8 && b.kerbMax <= 18 && b.kerbMax - b.kerbMin > 2, `${id}: kerb depth tracks the band (${b.kerbMin.toFixed(1)}..${b.kerbMax.toFixed(1)}px)`)
        ok(b.offMinPx >= 170 && b.offMaxPx <= 300, `${id}: walls stay inside the guard rails (${b.offMinPx.toFixed(0)}..${b.offMaxPx.toFixed(0)}px: ≥170 hairpin floor, ≤300 prop clearance)`)
        // consumption pin: recompute the offsets from bands.js + the documented
        // law and require they match what the geometry actually used.
        const braw = BANDS[id]
        const med = (arr) => [...arr].sort((u, v) => u - v)[Math.floor(arr.length / 2)]
        let pinBad = 0
        for (let i = 0; i < TRACK.N; i++) {
            for (const side of [-1, 1]) {
                const arr = side > 0 ? braw.right : braw.left
                const at = (k) => {
                    const u = (((k / TRACK.N) % 1) + 1) % 1
                    const x = u * arr.length
                    const i0 = Math.floor(x) % arr.length
                    return arr[i0] + (arr[(i0 + 1) % arr.length] - arr[i0]) * (x - Math.floor(x))
                }
                const r = Math.min(1.7, Math.max(0.7, (at(i - 2) + at(i) + at(i + 2)) / (3 * med(side > 0 ? braw.right : braw.left))))
                const p = TRACK.pts[i]
                let w = Math.min(300, Math.max(220, 220 * r))
                const R = 1 / Math.max(Math.abs(p.k), 1e-6)
                if (p.k * side > 0) w = Math.max(170, Math.min(w, R * 0.8))
                const off = side > 0 ? b.offR[i] : b.offL[i]
                const kerb = side > 0 ? b.kerbR[i] : b.kerbL[i]
                if (Math.abs(off - w) > 1e-6) pinBad++
                if (Math.abs(kerb - Math.min(18, Math.max(8, 12 * r))) > 1e-6) pinBad++
            }
        }
        ok(pinBad === 0, `${id}: wall/kerb offsets equal bands.js recomputed through the law (${pinBad} mismatches)`)
    }
    selectCourse('gulch')
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

// #530 residual (Jon's post-#518 item 3): dips darken slightly — a cheap AO feel
// via vertex colours. aoShade sinks with elevation (and the #530 dip law) inside
// [1-AO_MAX, 1]; road + run-off + walls all consume it. Pinned four ways:
// (a) the exported law bounds and equals the geometry ring by ring, (b) elevated
// courses actually reach shade (mutate aoShade -> 1 and these go red),
// (c) the lowest asphalt sits darker than the highest (elevation drives it),
// (d) the flat Gulch keeps its shipped look EXACTLY (shade 1, walls = wallTint).
console.log('dip AO shade (#530 residual — dips darken by vertex tint):')
{
    const AO = await import('file://' + SCENE + '?t=' + (Date.now() + 4))
    const { aoShade, AO_MAX, wallTint, trackGeometryStats: AOStats } = AO
    ok(AO_MAX > 0.05 && AO_MAX <= 0.5, `AO darkening is a shade, not a repaint (${AO_MAX})`)
    for (const id of ['gulch', 'sandbank', 'corkscomb']) {
        selectCourse(id)
        const G = AOStats().geos
        const RC = G.road.getAttribute('color')
        ok(!!RC && RC.count === (TRACK.N + 1) * 2, `${id}: asphalt carries a per-ring colour attribute (${RC ? RC.count : 0} verts)`)
        let bad = 0; let lo = 1; let hi = 0
        for (let i = 0; i <= TRACK.N; i++) {
            const s = aoShade(i % TRACK.N)
            if (Math.abs(RC.getX(i * 2) - s) > 1e-6 || Math.abs(RC.getX(i * 2 + 1) - s) > 1e-6) bad++
            lo = Math.min(lo, RC.getX(i * 2)); hi = Math.max(hi, RC.getX(i * 2))
        }
        ok(bad === 0, `${id}: asphalt shade equals aoShade ring by ring (${bad} mismatches; dropping the colourAt wiring reads 1)`)
        ok(hi > 0.999 && lo < 1 - 0.08, `${id}: asphalt spans sunlit crests to shaded dips (${lo.toFixed(3)}..${hi.toFixed(3)}; a constant law goes red)`)
        let wbad = 0
        const WC = G.wallL.getAttribute('color')
        for (let i = 0; i < TRACK.N; i++) {
            const s = aoShade(i); const t = wallTint(i, -1)
            if (Math.abs(WC.getX(i * 2) - t[0] * s) > 1e-6 || Math.abs(WC.getX(i * 2 + 1) - t[0] * s) > 1e-6) wbad++
        }
        ok(wbad === 0, `${id}: wall stone shade equals wallTint × aoShade (${wbad} mismatches; forgetting the AO multiply on walls reads red)`)
        let iLo = 0; let iHi = 0
        for (let i = 1; i < TRACK.N; i++) {
            if (TRACK.pts[i].h < TRACK.pts[iLo].h) iLo = i
            if (TRACK.pts[i].h > TRACK.pts[iHi].h) iHi = i
        }
        ok(aoShade(iLo) < aoShade(iHi) - 0.1, `${id}: the lowest asphalt sits in real shade vs the highest (${aoShade(iLo).toFixed(3)} vs ${aoShade(iHi).toFixed(3)}) — elevation drives the darkening`)
        const GC = G.gutterR.getAttribute('color')
        let gLo = 1
        for (let v = 0; v < GC.count; v++) gLo = Math.min(gLo, GC.getX(v))
        ok(gLo < 1 - 0.08, `${id}: the run-off sinks with the asphalt too (min ${gLo.toFixed(3)})`)
    }
    selectCourse('gulch')
    let parked = 0
    let iHi0 = 0
    for (let i = 1; i < TRACK.N; i++) if (TRACK.pts[i].h > TRACK.pts[iHi0].h) iHi0 = i
    for (let i = 0; i < TRACK.N; i++) if (aoShade(i) > 0.999) parked++
    ok(parked > 0, `the AO law parks at full brightness on the crests/straights (${parked} rings ride the sun; the summit at idx ${iHi0} reads ${aoShade(iHi0).toFixed(3)})`)
    ok(aoShade(iHi0) > 0.999, `the course summit keeps raw shipped brightness (${aoShade(iHi0).toFixed(3)}) — AO only ADDS shade, it never repaints the top of the world`)
}

// #478 item 8 HUD mutant: fold the portrait lift back to 1 — the phone-readability
// gates MUST go red under this run.
const HLAW = 'export const HUD_PORTRAIT_MAX = 1.3'
const HUTIL = 'export const HUD_PORTRAIT_MAX = 1 /* hudmut */'
let hudmutat = false
if (args.includes('--mutate-hud')) {
    const hsrc = readFileSync(SCENE, 'utf8')
    if (!hsrc.includes(HLAW)) { console.error('MUTATE_HUD: portrait lift not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, hsrc.replace(HLAW, HUTIL))
    hudmutat = true
    console.log('  ..    mutated: portrait phones stop scaling the HUD up — the readability gates MUST report a FAIL')
    process.on('exit', () => {
        if (hudmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(HUTIL, HLAW))
            console.log('  ..    hud mutation restored')
        }
    })
}

// ---------------------------------------------------- phone HUD (#478 item 8)
// A 390x844 portrait phone is width-bound under the old fit ratio (0.93) and
// drew 7px digits. Portrait viewports now take a height-driven lift, the floor
// sits at 0.85, and the HUD row rides the safe-area inset so the #437 corner
// chrome never writes over the POS stack on notched devices.
console.log('phone HUD (#478 item 8 — portrait scale, readable floor, safe-area top):')
{
    const HS = await import('file://' + SCENE + '?t=' + (Date.now() + 4))
    const { hudScale, hudTop, HUD_MIN, HUD_PORTRAIT_MAX, CHROME_BAND } = HS
    const OLD = (w, h) => Math.max(0.72, Math.min(2, Math.min(h / 240, w / 420)))
    ok(HUD_MIN > 0.72, `floor lifted 0.72 → ${HUD_MIN} (no more 7px digits on a small screen)`)
    const phone = hudScale(390, 844)
    ok(phone >= 1.1 && phone <= 2, `390x844 portrait draws a thumb-readable cluster (u=${phone.toFixed(2)}, old law gave ${OLD(390, 844).toFixed(2)})`)
    ok(hudScale(320, 568) >= HUD_MIN, `even a 320x568 phone holds the floor (u=${hudScale(320, 568).toFixed(2)})`)
    ok(hudScale(844, 390) === OLD(844, 390), `landscape keeps the old fit (${hudScale(844, 390).toFixed(2)} — the portrait lift never fires sideways)`)
    ok(hudScale(1280, 800) === OLD(1280, 800), `desktop is untouched (u=${hudScale(1280, 800)})`)
    ok(hudScale(640, 426) === OLD(640, 426), `the lite CI box is untouched (u=${hudScale(640, 426).toFixed(2)})`)
    let monoH = true; let prevH = -1
    for (let h = 540; h <= 1400; h += 20) { const s = hudScale(390, h); if (s < prevH - 1e-12) monoH = false; prevH = s }
    ok(monoH, 'portrait scale grows monotonically with height (no popping between phone sizes)')
    ok(hudScale(390, 2400) <= 2, `a portrait tablet still clamps (u=${hudScale(390, 2400)})`)
    ok(HUD_PORTRAIT_MAX <= 1.35 && CHROME_BAND >= 42, `the lift stays sane (${HUD_PORTRAIT_MAX}x cap) and the chrome band outstands the buttons (${CHROME_BAND} >= 42)`)
    ok(hudTop(0) >= 42, `desktop row still clears the #437 buttons (top ${hudTop(0)} over a ~41px button bottom)`)
    ok(hudTop(47) === CHROME_BAND + 47, `a notched phone pushes the row by the same inset the chrome rides (${hudTop(47)} for a 47px notch)`)
    let collides = false
    for (const sat of [0, 20, 47, 59]) if (hudTop(sat) - sat < 42) collides = true
    ok(!collides, 'ARCADE/PAUSE never overlap the instrument row at any safe-area inset (>=1px gap on every notch)')
    const SRC8 = readFileSync(SHARD, 'utf8')
    ok(SRC8.includes('hudScale(cssW, cssH)') && SRC8.includes('hudTop(safeTop)'), 'index.jsx drives scale + top from the shared laws')
    ok(SRC8.includes("'--sat'"), 'the shell reads the same safe-area inset the chrome uses')
    ok(SRC8.includes('hud: () =>'), 'the harness measures the live HUD layout via __cometHDTest.hud()')
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

// ---------------------------------------------------------------- race music
// #1001: the desert gets an ORIGINAL synthesized bed under the wheel — a driving
// G-major racer loop registered in the shared MUSIC table and dispatched by
// index.jsx. All Node (no AudioContext): the registry data is the spec, the
// wiring is source-inspected, and a flat/off-key mutant must go red.
console.log('race music (#1001 — original comet bed):')
{
    const AC = await import('file://' + resolve(HERE, '../src/utils/AudioController.js') + '?t=' + Date.now())
    const { MUSIC } = AC
    const M = MUSIC.comet
    ok(!!M, 'MUSIC.comet is registered (the race has a track to start)')
    const L = M ? M.lead.length : 0
    ok(L > 0 && L === M.bass.length && L === M.perc.length, `lead/bass/perc share one grid (${L} steps)`)
    ok(L % 16 === 0, `the loop is a whole number of bars (2 bars @ 16 steps = ${L})`)
    ok(M.step > 0.1 && M.step < 0.2, `resting tempo is an arcade-kart cruise (step ${M.step}s ≈ ${(60 / M.step / 4).toFixed(0)} BPM quarter)`)
    const GMAJOR = new Set([0, 2, 4, 6, 7, 9, 11])
    const notes = [...M.lead, ...M.bass].filter((n) => n > 0)
    ok(notes.every((n) => GMAJOR.has(n % 12)), `every note sits in G major (no out-of-key tones: ${notes.filter((n) => !GMAJOR.has(n % 12)).join(',') || 'none'})`)
    ok(M.lead.some((n) => n > 0), 'the lead carries a melody (not an empty bed)')
    ok(M.lead.filter((n) => n > 0).length >= L * 0.5, `the melody is dense enough to drive (${M.lead.filter((n) => n > 0).length}/${L} steps sounded)`)
    const chordRoots = [0, 8, 16, 24].map((i) => M.bass[i] % 12)
    ok(JSON.stringify(chordRoots) === JSON.stringify([7, 4, 0, 2]), `bass walks the I–vi–IV–V arcade progression G–Em–C–D (${chordRoots.join(',')})`)
    ok(M.bass.some((n) => n > 0) && M.bass.filter((n) => n > 0).length >= L * 0.5, 'the bass pumps (a racing bed needs a driving low end)')
    ok(M.perc.includes(1), 'the bed has a kick on the floor (four-on-the-floor)')
    ok(M.perc.includes(2), 'the bed has hats for drive (not kickless)')
    const kick = M.perc.filter((v) => v === 1).length
    ok(kick >= 8, `kick lands on every beat (four-on-the-floor: ${kick} kicks across ${L} steps)`)
    const src = readFileSync(SHARD, 'utf8')
    ok(src.includes("startMusic('comet')"), "index.jsx starts the comet bed on the green ('comet' track)")
    ok(src.includes('setMusicLevel'), 'index.jsx rides the music bus level by screen (attract bed / race full)')
    ok(src.includes('duckMusic'), 'index.jsx ducks the bed under spins/bumps/gold so the cues peak over it')
    ok(src.includes('setMusicStep'), 'index.jsx lifts the tempo with the player (setMusicStep seam, like SSX/Out Run)')
    ok(M.step === 0.12, `comet step grid pinned to ${M.step}s (deterministic — a retune must be an intentional edit)`)
}

// --------------------------------------------- per-course skin + register (#502)
// HD wore the dusk skin on every circuit: fog, sun, hemi/amb fill, dome stops,
// mesas and the sand floor were dusk constants. A tintFor(palette) table now
// drives the whole scene per course — dusk reproduces the shipped Gulch byte
// for byte, noon runs brighter and cooler with a higher sun, and Sandbank's
// engine winds up on its own register.
console.log('per-course skin + engine register (#502 items 1+6):')
{
    const CT = await import('file://' + SCENE + '?t=' + (Date.now() + 7))
    const { COURSE_TINTS, tintFor, SKY_STOPS, buildMesas: bm } = CT
    const AT = await import('file://' + AUDIO + '?t=' + (Date.now() + 8))
    const { engineRegister } = AT
    const ids = Object.keys(COURSE_TINTS)
    ok(SKY_STOPS.length === 8 && SKY_STOPS[0] === 0 && SKY_STOPS[7] === 1, 'the dome sky ramp has 8 shared stops (0..1)')
    ok(ids.every((id) => COURSE_TINTS[id].sky.length === SKY_STOPS.length), 'every tint carries one colour per sky stop')
    ok(ids.every((id) => COURSE_TINTS[id].sky.every((c) => /^#[0-9a-f]{6}$/i.test(c))), 'all sky stops are 6-digit hex colours')
    const D = tintFor('dusk'); const N = tintFor('noon'); const W = tintFor('dawn')
    ok(D.fog === 0x8a4a3c && Math.abs(D.fogD - 0.0072) < 1e-9, 'the dusk fog is the shipped gulch wash (0x8a4a3c @ 0.0072)')
    ok(D.sun === 0xffc090 && Math.abs(D.sunI - 3.6) < 1e-9 && Math.abs(D.sunElev - 0.12) < 1e-9, 'the dusk sun rides the shipped low-amber law')
    ok(JSON.stringify(D.sky) === JSON.stringify(['#1a0f24', '#452038', '#7c3030', '#c05830', '#ff9050', '#e07038', '#8a3a28', '#40201a']), 'the dusk dome gradient is the shipped Gulch sky stop for stop')
    ok(D.mesa === 0x4e222c && D.floor === 0xa87850 && D.starGain === 1 && D.sunWash === 0xffffff, 'dusk keeps mesas, floor, full stars and a colourless sun wash')
    const rgbOf = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    const lumOf = (v) => { const [r, g, b] = rgbOf(v); return 0.299 * r + 0.587 * g + 0.114 * b }
    ok(lumOf(N.fog) > lumOf(D.fog), `noon fog is brighter than dusk (#${N.fog.toString(16)} vs #${D.fog.toString(16)})`)
    ok(rgbOf(N.fog)[2] > rgbOf(N.fog)[0] && rgbOf(D.fog)[0] > rgbOf(D.fog)[2], 'noon fog runs cool (blue-dominant) where dusk runs warm (red-dominant)')
    ok(rgbOf(N.hemiSky)[2] > rgbOf(N.hemiSky)[0], 'noon hemi fill is a blue sky, not an ember wash')
    ok(N.sunI > D.sunI, `noon sun pushes harder than dusk (${N.sunI} vs ${D.sunI})`)
    ok(D.sunElev < W.sunElev && W.sunElev < N.sunElev, `the sun climbs dusk -> dawn -> noon (${D.sunElev} < ${W.sunElev} < ${N.sunElev})`)
    ok(N.starGain >= 0 && N.starGain < W.starGain && W.starGain < D.starGain && D.starGain === 1, `stars fade as the sun rises (${D.starGain} -> ${W.starGain} -> ${N.starGain})`)
    ok(new Set(ids.map((id) => COURSE_TINTS[id].mesa)).size === ids.length, 'every course gets its own mesa colour')
    ok(new Set(ids.map((id) => COURSE_TINTS[id].floor)).size === ids.length, 'every course gets its own sand floor')
    ok(new Set(ids.map((id) => COURSE_TINTS[id].sky.join())).size === ids.length, 'every course gets its own dome gradient')
    ok(tintFor('corkscomb') === COURSE_TINTS.dusk && tintFor(undefined) === COURSE_TINTS.dusk, 'unknown palettes fall back to dusk — the Gulch skin never breaks')
    ok(bm(0x123456).children.every((m) => m.material.color.getHex() === 0x123456), 'buildMesas paints the ring with the course mesa colour')
    ok(bm().children[0].material.color.getHex() === 0x4e222c, 'buildMesas still defaults to the shipped dusk rock')
    ok(engineRegister('dusk') === 1, 'the Gulch keeps its shipped engine pitch (register 1)')
    ok(engineRegister('noon') > engineRegister('dawn') && engineRegister('dawn') > engineRegister('dusk'), `Sandbank winds up the highest register (1 -> ${engineRegister('dawn')} -> ${engineRegister('noon')})`)
    ok(engineRegister('noon') <= 1.25, `the register stays an engine, not a lawnmower (${engineRegister('noon')}x)`)
    ok(engineRegister('nope') === 1, 'unknown courses keep the dusk register')
    const SRC7 = readFileSync(SHARD, 'utf8')
    ok(SRC7.includes('applyCourseTint()') && SRC7.includes('tintFor(COURSE.palette)'), 'index.jsx re-tints the scene from the selected course')
    ok((SRC7.match(/applyCourseTint\(\)/g) || []).length >= 3, 'the tint runs at boot AND on both course-swap paths')
    ok(SRC7.includes('engineRegister(COURSE.palette)'), 'the engine law multiplies by the course register')
}

// ------------------------------------------------- kart ghost + mesa shadows (#1002)
// The asphalt never mirrored: karts read as painted onto the road. The fix is
// the agreed cheap version — a stretched, flattened, livery-darkened GHOST of
// the body under each kart (marked materials only, shared geometry, per-kart
// opacity driven by the loop), plus one baked gradient shadow per mesa riding
// the same world sun line the blob halos hold. The law is pure Node so a
// mutant that breaks either dies here, not in the pixels.
console.log('kart ghost + mesa shadows (#1002):')
{
    const CT = await import('file://' + SCENE + '?t=' + (Date.now() + 51))
    const { GHOST, buildKartGhost, MESA_SHADOW, buildMesaShadows, buildKart, decorateBuggy, SUN_SHADOW, mesaDefs, worldAnchor } = CT
    ok(GHOST.base > 0.3 && GHOST.base < 0.7 && GHOST.dark > 0.2 && GHOST.dark < 0.6,
        `the ghost sits in the smear band (dark ${GHOST.dark}, base ${GHOST.base}) — a reflection, not a second kart`)
    ok(GHOST.flatten < 0.5 && GHOST.stretchMax > 0, 'the ghost is flattened onto the road and stretches along the nose')
    const kart = buildKart(0xff8800, 0xffff00, 0)
    const gh = buildKartGhost(kart)
    const meshes = []
    gh.group.traverse((o) => { if (o.isMesh) meshes.push(o) })
    ok(gh.mats.length === 3 && meshes.length >= 3, `the primitive ghost keeps body + stripe + nose art (${meshes.length} meshes, ${gh.mats.length} materials)`)
    ok(new Set(meshes.map((m) => m.material)).size === gh.mats.length, 'ghost meshes share one material per livery (no per-mesh waste)')
    ok(gh.mats.every((m) => m.transparent && !m.depthWrite && m.opacity === 0), 'ghost materials are transparent, depth-free, and start at opacity 0 (the loop drives them)')
    ok(gh.mats.every((m) => m.color.r < 0.5 && m.color.g < 0.5), 'no ghost material exceeds half-livery brightness')
    // the expectation must take three's sRGB→linear hex pipeline (ColorManagement
    // is on): a naive (byte/255)×dark misses the linearised g channel.
    const wantBody = new THREE.Color(0xff8800).multiplyScalar(GHOST.dark)
    const bodyGh = gh.mats.find((m) => Math.abs(m.color.r - wantBody.r) < 1e-6 && Math.abs(m.color.g - wantBody.g) < 1e-6 && Math.abs(m.color.b - wantBody.b) < 1e-6)
    ok(!!bodyGh, 'the ghost carries a livery-darkened body copy (colour = livery × GHOST.dark)')
    ok(!gh.mats.includes(kart.userData.body), 'the ghost never reuses the live kart material (the real livery must stay full-strength)')
    // the GLB path: decorateBuggy marks body + accent only — tires stay out
    const fake = new THREE.Group()
    for (const name of ['Paint_Orange', 'Accent_Yellow', 'Tire_Black']) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, name }))
        fake.add(mesh)
    }
    const dec = decorateBuggy(fake, 0x336699, 0xffcc00)
    ok(dec.body.userData.ghost === true && fake.children[1].material.userData.ghost === true, 'decorateBuggy marks exactly body + accent for the ghost')
    ok(fake.children[2].material.userData.ghost !== true, 'tires stay out of the ghost (the blob shadow owns the dark)')
    const g2 = buildKartGhost(dec.group)
    ok(g2.mats.length === 2, 'the GLB ghost keeps body + accent only')
    // mesa shadows: one quad per mesa that clears the min length, all locked to
    // the sun line, none of them crossing the track corridor.
    ok(MESA_SHADOW.az === SUN_SHADOW.az, 'the mesa shadow line is the blob-halo line (one shadow direction for the world)')
    const A = worldAnchor()
    const casters = mesaDefs().filter((d) => {
        const r = Math.hypot(d.x - A.cx, d.z - A.cz)
        return Math.min(MESA_SHADOW.lenK * d.h, r - (A.R + MESA_SHADOW.margin)) >= MESA_SHADOW.minL
    })
    const gs = buildMesaShadows(-3.5)
    ok(gs.children.length === casters.length && casters.length >= 10, `${gs.children.length}/${mesaDefs().length} mesas cast (the rest fail the min-length law)`)
    const theta = Math.atan2(-Math.cos(MESA_SHADOW.az), Math.sin(MESA_SHADOW.az))
    ok(gs.children.every((q) => Math.abs(q.rotation.y - theta) < 1e-9), 'every shadow quad rides the fixed sun line (rotation locked to MESA_SHADOW.az)')
    ok(gs.children.every((q) => Math.abs(q.position.y - (-3.5 + MESA_SHADOW.y)) < 1e-9), 'the shadows sink with the course floor (floorY + 0.02)')
    const dx = Math.sin(MESA_SHADOW.az); const dz = Math.cos(MESA_SHADOW.az)
    let law = true; let tip = true
    casters.forEach((d, i) => {
        const r = Math.hypot(d.x - A.cx, d.z - A.cz)
        const L = Math.min(MESA_SHADOW.lenK * d.h, r - (A.R + MESA_SHADOW.margin))
        const q = gs.children[i]
        if (Math.abs(q.geometry.parameters.width - L) > 1e-9 || Math.abs(q.geometry.parameters.height - MESA_SHADOW.wK * d.w) > 1e-9) law = false
        if (Math.hypot(q.position.x - d.x - dx * (L / 2), q.position.z - d.z - dz * (L / 2)) > 1e-9) law = false
        const tipR = Math.hypot(q.position.x + dx * (L / 2) - A.cx, q.position.z + dz * (L / 2) - A.cz)
        if (tipR < A.R + MESA_SHADOW.margin - 1e-9) tip = false
    })
    ok(law, 'length = min(lenK·h, r − R − margin) and width = wK·w, near end rooted at the mesa base')
    ok(tip, 'no shadow tip crosses the track corridor (the #542 margin holds at the far end)')
    ok(gs.children.every((q) => q.material === gs.children[0].material), 'one shared gradient material for the whole ring (baked, not per-mesa)')
    const SRC1002 = readFileSync(SHARD, 'utf8')
    ok(/buildKartGhost\(view\)/.test(SRC1002) && /buildKartGhost\(dec\.group\)/.test(SRC1002), 'index builds the ghost from the primitive AND rebuilds it when the GLB lands')
    ok(SRC1002.includes('buildMesaShadows(floorY, mesaShadowMat)'), 'buildHorizon drops the shadow ring on the course floor')
}

// --------------------------------------- per-course env wash on the liveries (#511 item 2)
// #502 re-tinted sky/fog/lights but the #471 equirect reflection wash stayed a
// dusk constant — noon and dawn karts still mirrored a sunset. The wash now
// rides the palette table; dusk reproduces the shipped canvas byte for byte.
console.log('per-course env wash (#511 item 2 — liveries reflect their own light):')
{
    const CT = await import('file://' + SCENE + '?t=' + (Date.now() + 41))
    const { COURSE_TINTS, ENV_WASHES, envWashFor } = CT
    const ids = Object.keys(COURSE_TINTS)
    ok(JSON.stringify(Object.keys(ENV_WASHES)) === JSON.stringify(ids), 'every palette id carries its own env wash')
    const hex6 = (c) => /^#[0-9a-f]{6}$/i.test(c)
    ok(Object.values(ENV_WASHES).every((w) => w.stops.length === 5 &&
        w.stops.every(([c, at], i) => hex6(c) && (i === 0 ? at === 0 : i === 4 ? at === 1 : at > w.stops[i - 1][1])) &&
        hex6(w.sun[0]) && hex6(w.sun[1])), 'every wash is five ordered stops plus a sun core/fade hex pair')
    const D = envWashFor('dusk')
    ok(JSON.stringify(D.stops) === JSON.stringify([['#241432', 0], ['#7c3a34', 0.36], ['#e07a38', 0.46], ['#8a4428', 0.56], ['#40281c', 1]]) &&
        D.sun.join() === '#ffe6aa,#ff9646' && D.sunX === 88 && D.sunY === 28 && D.sunR === 20,
        'the dusk wash is the shipped #471 canvas stop for stop (gradient, sun colour, sun at 88/28)')
    const rgbOf = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    const lumOf = (c) => { const [r, g, b] = rgbOf(c); return 0.299 * r + 0.587 * g + 0.114 * b }
    const hor = (w) => w.stops[2][0]
    const top = (w) => w.stops[0][0]
    const N = envWashFor('noon'); const W = envWashFor('dawn')
    ok(rgbOf(top(N))[2] > rgbOf(top(N))[0] && rgbOf(hor(N))[2] > rgbOf(hor(N))[0], 'noon wash runs cool top-to-horizon (blue-dominant), not ember')
    ok(rgbOf(hor(D))[0] > rgbOf(hor(D))[2], 'dusk horizon stays the shipped warm ember')
    ok(rgbOf(hor(W))[0] > rgbOf(hor(W))[2], 'dawn horizon is warm rose-amber, not blue')
    ok(lumOf(hor(N)) > lumOf(hor(W)) && lumOf(hor(W)) > lumOf(hor(D)), `the wash horizon brightens dusk -> dawn -> noon (${lumOf(hor(D)).toFixed(0)} -> ${lumOf(hor(W)).toFixed(0)} -> ${lumOf(hor(N)).toFixed(0)})`)
    ok(N.sunY < W.sunY && W.sunY < D.sunY, `the reflected sun climbs with the light (canvas y ${D.sunY} -> ${W.sunY} -> ${N.sunY})`)
    ok(new Set(ids.map((id) => ENV_WASHES[id].stops.map((s) => s[0]).join())).size === ids.length, 'every course reflects its own sky, not one shared gradient')
    ok(envWashFor('nope') === ENV_WASHES.dusk, 'unknown palettes fall back to the dusk wash')
    const SRC7 = readFileSync(SHARD, 'utf8')
    ok(SRC7.includes('paintEnv(COURSE.palette)') && SRC7.includes('envMap.needsUpdate = true'), 'index.jsx repaints the env canvas and bumps the texture on course tint')
    ok(!SRC7.includes('#241432'), 'index.jsx no longer hard-codes the dusk wash — the palette table owns it')
}

// ------------------------------------------ line structures per course (#502 item 2)
// The arch was one shape with a different word on it. Sandbank's landmark is
// now its own: a wide timing-line gantry — twin towers, a flat deck, a truss
// and a three-lamp signal board — while the Gulch (and Corkscomb) keep the
// sandstone span. The 2D attract/race sprite draws the same two silhouettes.
console.log('line structures (#502 item 2 — gantry vs arch per course):')
{
    const SC = await import('file://' + SCENE + '?t=' + (Date.now() + 31))
    const { buildArch, GANTRY_SPAN, GANTRY_DECK_Y } = SC
    const meshes = (grp) => { const out = []; grp.traverse((m) => { if (m.isMesh) out.push(m) }); return out }
    ok(COURSES.find((c) => c.id === 'sandbank').landmark === 'gantry', 'Sandbank declares a gantry landmark')
    ok(COURSES.find((c) => c.id === 'gulch').landmark === 'arch' && COURSES.find((c) => c.id === 'corkscomb').landmark === 'dune', 'the Gulch keeps the sandstone arch, Corkscomb its dune crest (#740)')
    selectCourse('sandbank')
    ok(TRACK.landmark === 'gantry', 'the live TRACK carries the selected course landmark')
    const gt = meshes(buildArch())
    ok(!gt.some((m) => m.geometry.type === 'TorusGeometry'), 'the gantry is not an arch — no semicircular span anywhere')
    const deck = gt.find((m) => m.geometry.type === 'BoxGeometry' && m.geometry.parameters.width >= GANTRY_SPAN - 0.01 && m.geometry.parameters.height <= 0.6)
    ok(!!deck && Math.abs(deck.position.y - GANTRY_DECK_Y) < 1e-6, `a flat timing deck spans the bowl (${GANTRY_SPAN}u wide at y ${GANTRY_DECK_Y})`)
    const towers = gt.filter((m) => m.geometry.type === 'BoxGeometry' && Math.abs(m.position.x) >= 3.2 && m.geometry.parameters.height >= 4)
    ok(towers.length === 2, `twin towers stand outside the wall line on both sides (${towers.map((t) => t.position.x).join(', ')})`)
    const lamps = gt.filter((m) => m.material.emissive && m.material.emissive.getHex() !== 0 && m.material.emissiveIntensity > 0.3)
    ok(lamps.length === 3, `the signal board shows three start lights (${lamps.length})`)
    const distinct = new Set(lamps.map((l) => l.material.color.getHex()))
    ok(distinct.size === 3, 'each signal lamp is its own colour (red/amber/green)')
    const widths = gt.filter((m) => m.geometry.type === 'BoxGeometry').map((m) => m.geometry.parameters.width)
    ok(Math.max(...widths) >= 7, `the gantry reads wider than the arch's ${3.15 * 2}u legs (max box ${Math.max(...widths).toFixed(1)}u)`)
    selectCourse('gulch')
    ok(TRACK.landmark === 'arch', 'the Gulch resolves to the arch landmark')
    const at = meshes(buildArch())
    ok(at.some((m) => m.geometry.type === 'TorusGeometry'), 'the Gulch keeps its shipped sandstone span')
    ok(at.length !== gt.length, `the two landmarks are structurally distinct (${at.length} arch parts vs ${gt.length} gantry parts)`)
    const SRC8 = readFileSync(resolve(HERE, '../src/games/CometDrift/index.jsx'), 'utf8')
    ok(SRC8.includes("COURSE.landmark === 'gantry'"), 'the 2D renderer branches on the course landmark')
    ok(/gantryFor/.test(SRC8) && /'#d03028', '#e0a030', '#30b048'/.test(SRC8), 'the 2D gantry draws its own towers, deck and signal lamps')
}

// #502 item 3: the Bus Stop braking complex must be SEEABLE, not just graded.
// Sandbank declares a brakeCue fraction range and the HD side paints red/white
// tire-bar walls on the inside of every bend inside it; the other circuits
// keep bare shoulders (no cue, no false advertising).
console.log('braking cue (#502 item 3 — Bus Stop tire bars):')
{
    const SC = await import('file://' + SCENE + '?t=' + (Date.now() + 47))
    const { brakeCueDefs, buildTireBars, TIRE_R } = SC
    const sand = COURSES.find((c) => c.id === 'sandbank')
    ok(Array.isArray(sand.brakeCue) && sand.brakeCue.length === 2 && sand.brakeCue[0] > 0 && sand.brakeCue[1] < 1,
        `Sandbank declares a brakeCue range (${JSON.stringify(sand.brakeCue)})`)
    ok(COURSES.filter((c) => c.id !== 'sandbank').every((c) => !c.brakeCue), 'only Sandbank carries a braking cue')
    selectCourse('sandbank')
    ok(TRACK.brakeCue && TRACK.brakeCue[0] === sand.brakeCue[0], 'the live TRACK carries the brakeCue range')
    const bars = brakeCueDefs()
    ok(bars.length >= 12, `the barrier is a wall, not a hint (${bars.length} tire bars)`)
    const [f0, f1] = sand.brakeCue
    ok(bars.every((b) => b.f >= f0 && b.f <= f1), 'every tire bar sits inside the declared range')
    ok(bars.some((b) => b.side > 0) && bars.some((b) => b.side < 0), 'the bars follow the alternating kinks (both sides appear)')
    ok(bars.every((b, i) => b.color === (i % 2 ? 'white' : 'red')), 'the bars alternate red/white like real tire walls')
    ok(bars.every((b) => b.side === Math.sign(TRACK.pts[Math.round(b.f * TRACK.N)].k)), 'each bar hugs the INSIDE of its bend')
    const grp = buildTireBars(new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial())
    const cyls = []
    grp.traverse((m) => { if (m.isMesh && m.geometry.type === 'CylinderGeometry') cyls.push(m) })
    ok(cyls.length === bars.length, `buildTireBars stands every def up as a mesh (${cyls.length}/${bars.length})`)
    ok(cyls.every((m) => Math.abs(m.geometry.parameters.radiusTop - TIRE_R) < 1e-9), 'tires are the declared radius')
    selectCourse('gulch')
    ok(!TRACK.brakeCue && brakeCueDefs().length === 0, 'the Gulch keeps bare shoulders (no cue)')
    selectCourse('sandbank')
}

// #502 item 5: the attract selector shows the SELECTED circuit's shape, and
// the minimap normaliser rebuilds when the course swaps — the circuits'
// bounding boxes differ by nearly 2x, so a frozen Gulch box clipped the wide
// Sandbank/Corkscomb outlines off the map.
console.log('attract preview + per-course map (#502 item 5):')
{
    const SRC9 = readFileSync(SHARD, 'utf8')
    ok(SRC9.includes('if (mapId !== T.id)'), 'HD rebuilds the minimap normaliser when the course changes')
    ok(SRC9.includes('mini-map outline preview') && SRC9.includes('mapNow()'),
        'HD stamps the selected circuit outline on the attract screen')
    ok(SRC9.includes('badge={COURSE.name}'), 'the pause overlay names the chosen circuit (HD)')
    const span = (id) => {
        selectCourse(id)
        let ax = Infinity; let bx = -Infinity; let ay = Infinity; let by = -Infinity
        for (const p of TRACK.pts) { ax = Math.min(ax, p.x); bx = Math.max(bx, p.x); ay = Math.min(ay, p.y); by = Math.max(by, p.y) }
        return Math.max(bx - ax, by - ay)
    }
    const sp = COURSES.map((c) => span(c.id))
    ok(Math.max(...sp) / Math.min(...sp) >= 1.4,
        `courses need per-course maps: spans ${sp.map((v) => Math.round(v)).join(' / ')}`)
    selectCourse('gulch')
}

// #794: the HD title's chevrons must be real thumb-sized buttons on the
// shared #534 contract (selector.js) — symmetric, off-centre, clear of the
// centre start zone, never overlapping, and they flank the MEASURED name.
// --mutate-select collapses the offset onto the centre and MUST redden the
// flank/centre gates.
console.log('attract chevron buttons (#794 — the phone can pick a course):')
{
    const SRC794 = readFileSync(SHARD, 'utf8')
    const SCENE794 = readFileSync(resolve(HERE, '../src/games/CometDriftHD/scene.js'), 'utf8')
    // fresh-import the geometry law so --mutate-select (which rewrites the
    // file AFTER this module's static import cached it) is actually visible.
    const HD_SCENE = new URL('../src/games/CometDriftHD/scene.js', import.meta.url)
    const attractSel = (await import(`${HD_SCENE}?v=${process.argv.includes('--mutate-select') ? Date.now() : 0}`)).attractSelectGeom
    const cases = [[840, 420, 1.0], [640, 360, 0.85], [390, 844, 1.3], [1440, 810, 2.0]]
    let geomOk = true; const geomWhy = []
    for (const [W, H, u] of cases) {
        for (const nameHalf of [40, 90, 160]) {
            const g = attractSel(W, H, u, Math.round(H * 0.5), nameHalf)
            const onScreen = g.left[0] - g.hw >= 0 && g.right[0] + g.hw <= W && g.rowY - g.hh >= 0 && g.rowY + g.hh <= H
            const flank = g.left[0] < W / 2 && g.right[0] > W / 2 && g.left[1] === g.rowY && g.right[1] === g.rowY
            const symmetric = Math.abs(g.left[0] + g.right[0] - W) <= 1
            const thumb = g.hw * 2 >= 48 && g.hh * 2 >= 32
            const noOverlap = g.right[0] - g.hw > g.left[0] + g.hw
            const clamp = Math.round(W / 2 - g.hw - Math.round(2 * u))
            const want = Math.round(nameHalf + 8 * u + g.hw)
            const clearsName = g.off >= Math.round(nameHalf + 4 * u) || clamp < want
            const centreClear = selectorHit(g, Math.round(W / 2), g.rowY) === 0
            const hitL = selectorHit(g, g.left[0], g.left[1]) === -1
            const hitR = selectorHit(g, g.right[0], g.right[1]) === 1
            if (!(onScreen && flank && symmetric && thumb && noOverlap && clearsName && centreClear && hitL && hitR)) {
                geomOk = false
                geomWhy.push(`${W}x${H}@${u} n=${nameHalf}: on=${onScreen} flank=${flank} sym=${symmetric} thumb=${thumb} ovl=${!noOverlap} name=${clearsName} ctr=${centreClear} hits=${hitL}/${hitR}`)
            }
        }
    }
    ok(geomOk, `HD chevron buttons: thumb-sized, symmetric, flanking the name, on-screen, centre stays the start zone${geomWhy.length ? ' — ' + geomWhy.join(' | ') : ''}`)
    const gDefaults = selectorGeom(256, 192, 1)
    ok(gDefaults.rowY === Math.round(192 * 0.47) && gDefaults.off === 88 && gDefaults.hw === 32 && gDefaults.hh === 20,
        'the 2D selector defaults are byte-identical after the opts extension (#534 regression)')
    ok(SCENE794.includes('export function attractSelectGeom') && SCENE794.includes("from '../CometDrift/selector.js'"),
        'scene.js places the shared selector contract for HD')
    ok(SRC794.includes('selectorHit(') && SRC794.includes('attractSelectGeom(') && SRC794.includes("e.clientX"),
        'HD hit-tests pointer taps against the chevron boxes')
    ok(SRC794.includes('attractStickTick') && SRC794.includes('STICK_ON') && SRC794.includes('setStick'),
        'HD cycles the course on the analog stick (#534 law ported)')
    ok(/ArrowLeft' \|\| e\.code === 'ArrowRight'/.test(SRC794), 'HD cycles on d-pad Arrow keys on the title')
    ok(SRC794.includes("'TAP ‹ › TO PICK CIRCUIT"), 'the attract copy teaches the chevron control')
    ok(SRC794.includes('pressFresh') && SRC794.includes('selPress'), 'HD tracks + exposes the chevron press state for the pressable-look gate')
}

// #511 item 4: the attract stack — fractions overlapped the title with the
// letter-spaced course name at lite scale, and the noon name ran under the
// POS panel and minimap at 840x420. attractLayout stacks by glyph box and
// clamps the name to the corridor; these gates pin every clearance.
// --mutate-attract collapses the gap law and MUST redden them.
const ALAW = 'export const ATTRACT_GAP = 6'
const AUTIL = 'export const ATTRACT_GAP = 0.5 /* attractmut */'
let attractmutat = false
if (args.includes('--mutate-attract')) {
    const asrc = readFileSync(SCENE, 'utf8')
    if (!asrc.includes(ALAW)) { console.error('MUTATE_ATTRACT: gap law not found — probing stale code.'); process.exit(2) }
    writeFileSync(SCENE, asrc.replace(ALAW, AUTIL))
    attractmutat = true
    console.log('  ..    mutated: attract blocks collide by design — the stack gates MUST report FAILs')
    process.on('exit', () => {
        if (attractmutat) {
            writeFileSync(SCENE, readFileSync(SCENE, 'utf8').replace(AUTIL, ALAW))
            console.log('  ..    attract mutation restored')
        }
    })
}
console.log('attract stack (#511 item 4 — glyph-box stacking, fitted name corridor):')
{
    const AS = await import('file://' + SCENE + '?t=' + (Date.now() + 9))
    const { attractLayout, ATTRACT_GAP, ATTRACT_UA_MIN } = AS
    ok(ATTRACT_GAP >= 4, `attract blocks keep a real gap (${ATTRACT_GAP}px at u=1)`)
    ok(ATTRACT_UA_MIN >= 0.5, `stack shrink has a readability floor (${ATTRACT_UA_MIN})`)
    const SHARD_SRC5 = readFileSync(SHARD, 'utf8')
    ok(SHARD_SRC5.includes('attractLayout(') && SHARD_SRC5.includes("measureText(spaced)"),
        'the attract screen stacks via the layout law and squeezes the name by measured width')
    const NAMES = { gulch: 'SUNSET GULCH'.length, sandbank: 'SANDBANK SPEED BOWL'.length, corkscomb: 'CORKSCOMB DUNES'.length }
    const SIZES = [[640, 426], [840, 420], [390, 844], [320, 480], [1280, 720], [1512, 982], [768, 1024]]
    let clearOk = true; let fitOk = true; let bandOk = true; let worst = 99; let spill = 0
    for (const [w, h] of SIZES) {
        const u = Math.max(0.85, Math.min(2, Math.min(h / 240, w / 420) * (h > w * 1.4 ? Math.min(1.3, h / 560) : 1)))
        for (const len of Object.values(NAMES)) {
            const A = attractLayout(u, w, h, 3, len)
            const clr = [
                A.name.y - A.name.fs * 0.78 - (A.title.y + A.title.fs * 0.22),
                A.sel.y - A.sel.fs * 0.78 - (A.name.y + A.name.fs * 0.22),
                A.prev.top - (A.sel.y + A.sel.fs * 0.22),
                A.msg.y - A.msg.fs * 0.78 - (A.prev.top + A.prev.size),
                A.best.y - A.best.fs * 0.78 - (A.msg.y + A.msg.fs * 0.22),
                A.blink.y - A.blink.fs * 0.78 - (A.best.y + 2 * A.best.step + A.best.fs * 0.22),
            ]
            worst = Math.min(worst, ...clr)
            if (clr.some((c) => c < 2)) clearOk = false
            const bottom = A.blink.y + A.blink.fs * 0.22
            if (bottom > A.band[1] + 1 || A.title.y - A.title.fs * 0.78 < A.band[0] - 1) bandOk = false
            if (A.name.estW * A.name.fit > A.availW + 1) fitOk = false
            if (A.name.fit < 1) spill += 1
        }
    }
    ok(clearOk, `every attract line clears its neighbour on ${SIZES.length} viewports x 3 course names (worst gap ${worst.toFixed(1)}px >= 2)`)
    ok(bandOk, 'the whole attract column stays inside its band on every viewport')
    ok(fitOk, 'the letter-spaced course name never runs wider than the corridor between the HUD columns')
    ok(spill > 0, `long names genuinely get squeezed where they must (${spill} clamped layouts)`)
    ok(attractLayout(2, 1280, 720, 3, 13).ua === 2 && attractLayout(2, 1600, 900, 3, 13).ua === 2,
        'roomy desktop keeps the shipped scale untouched (no needless shrink)')
}

// #478 item 9 heal mutant: disarm the self-heal — the device-loss gates MUST
// go red under this run (the race must die with the backend, which it mustn't).
const HL2LINE = "if (disposed || backendName !== 'webgl2') return"
const HL2UTIL = 'if (true) return /* healmut */'
let healmutat = false
if (args.includes('--mutate-heal')) {
    const hsrc = readFileSync(SHARD, 'utf8')
    if (!hsrc.includes(HL2LINE)) { console.error('MUTATE_HEAL: heal guard not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, hsrc.replace(HL2LINE, HL2UTIL))
    healmutat = true
    console.log('  ..    mutated: the self-heal never rebuilds — the device-loss gates MUST report FAILs')
    process.on('exit', () => {
        if (healmutat) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(HL2UTIL, HL2LINE))
            console.log('  ..    heal mutation restored')
        }
    })
}

// ------------------------------------------- 2D bloom fallback for the refuge (#1016)
console.log('2D bloom fallback for the refuge tier (#1016):')
{
    const cam = new THREE.PerspectiveCamera(62, 2, 0.1, 400)
    cam.position.set(0, 1.26, 12)
    cam.lookAt(0, 0.5, -4.2)
    cam.updateMatrixWorld()
    const rgb = (h) => { const c = new THREE.Color(h); return { r: c.r, g: c.g, b: c.b } }
    const GOLD = { x: 0, y: 0.4, z: 0, ...rgb(0xffd23c), f: 1 }
    const discs = bloomDiscs([GOLD], cam, 840, 420)
    ok(discs.length === 1 && discs[0].a > 0.1 && discs[0].r > 4 && discs[0].r < 96,
        `a gold head projects into one live additive disc (r ${discs[0]?.r.toFixed(1)}px a ${discs[0]?.a.toFixed(2)})`)
    ok(bloomDiscs([{ x: 0, y: 0.4, z: 0, ...rgb(0x48b8ff), f: 1 }], cam, 840, 420).length === 0, 'blue never glows (linear luma 0.43 < the gate)')
    ok(bloomDiscs([{ x: 0, y: 0.4, z: 0, ...rgb(0xb878ff), f: 1 }], cam, 840, 420).length === 0, 'violet never glows (linear luma 0.31 < the gate)')
    ok(bloomDiscs([{ ...GOLD, z: 20 }], cam, 840, 420).length === 0, 'heads behind the camera are culled')
    ok(bloomDiscs([{ ...GOLD, x: 40 }], cam, 840, 420).length === 0, 'heads off-frame are culled')
    const many = Array.from({ length: 90 }, (_, i) => ({ ...GOLD, x: (i % 9 - 4) * 0.6, z: -1 - (i % 7) }))
    const capped = bloomDiscs(many, cam, 840, 420)
    ok(capped.length === 48 && capped[0].r >= capped[47].r, `90 heads collapse to the 48-disc budget, near-first (r ${capped[0]?.r.toFixed(1)} ≥ ${capped[47]?.r.toFixed(1)})`)
    ok(JSON.stringify(bloomDiscs(many, cam, 840, 420)) === JSON.stringify(capped), 'the law is deterministic (same heads, same discs)')
    const near = bloomDiscs([GOLD], cam, 840, 420)[0]
    const far = bloomDiscs([{ ...GOLD, z: -8 }], cam, 840, 420)[0]
    ok(far.r < near.r, `the glow shrinks with distance (near ${near.r.toFixed(1)}px → far ${far.r.toFixed(1)}px)`)
    const sp = makeStreakPool(8, {})
    sp.spawn(0, 0.4, 0, 0, 0, -0.02, 14, 0xffd23c)
    sp.spawn(0, 0.4, 0, 0, 0, -0.02, 14, 0x48b8ff)
    ok(sp.glowEntries(BLOOM2D_MIN_LUMA).length === 1, 'the streak pool hands out only the gold head')
    const pp = makePool(8, 0.1)
    pp.spawn(0, 0.4, 0, 0, 0, 0, 14, 0xffd23c)
    pp.spawn(0, 0.4, 0, 0, 0, 0, 14, 0x48b8ff)
    ok(pp.glowEntries(BLOOM2D_MIN_LUMA).length === 1, 'the spark pool filters the same way')
    ok(BLOOM2D_MIN_LUMA > 0.43 && BLOOM2D_MIN_LUMA < 0.68, `the gate sits above blue and below gold (${BLOOM2D_MIN_LUMA})`)
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

        // #478 item 1: the legacy refuge must run WITHOUT the post chain, but
        // #1016: it must carry the 2D additive bloom fallback in its place.
        const chainPinned = await page.evaluate(() => window.__cometHDTest.fxChain())
        ok(chainPinned.mode === 'bloom-2d' && chainPinned.pipeline === false, `post chain absent on the pinned legacy path — the 2D fallback takes over (mode ${chainPinned.mode}, ${chainPinned.backend})`)
        const bloomDom = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => (
            c.dataset && c.dataset.hdbloom === '1' ? 'bloom'
                : c.dataset && c.dataset.hdgl === '1' ? 'legacy'
                    : /pointer-events-none/.test(c.className) ? 'hud' : 'gl'
        )))
        ok(bloomDom.indexOf('bloom') > bloomDom.lastIndexOf('gl') && bloomDom.indexOf('bloom') < bloomDom.indexOf('hud'),
            `the bloom overlay sits above the GL canvas, under the HUD (${bloomDom.join(' < ')})`)

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

        // #1016: the refuge's payoff — a gold-tier drift must light the 2D
        // additive overlay (the node chain's job, done cheaply here).
        // #1016: the refuge's payoff — gold streak heads must light the 2D
        // additive overlay (the node chain's job, done cheaply here). Software
        // GL in headless runs at a few fps, so keep feeding until a paint
        // frame actually catches a live head (the fallback is frame-paced).
        await page.waitForFunction(() => {
            const t = window.__cometHDTest
            const b = t.bloom2d()
            if (b.discs > 0 && b.pixels > 2000) return true
            t.bloom2d().feed()
            return false
        }, null, { timeout: 15000 }).catch(() => {})
        const b2 = await page.evaluate(() => window.__cometHDTest.bloom2d())
        ok(b2.on === true && b2.mode === 'bloom-2d', `the refuge runs the 2D bloom fallback (on ${b2.on}, mode ${b2.mode})`)
        ok(b2.discs >= 1 && b2.frames > 0, `gold streaks feed the fallback discs (${b2.discs} discs painted over ${b2.frames} frames)`)
        ok(b2.pixels > 2000, `the overlay really glows additively (alpha-sum ${b2.pixels})`)
        await page.evaluate(() => {
            const P = window.__cometHDTest.game().karts[0]
            P.driftT = 0; P.charge = 0; P.boostT = 0
        })
        await page.waitForTimeout(260)
        const b2dry = await page.evaluate(() => window.__cometHDTest.bloom2d())
        ok(b2dry.discs === 0 && b2dry.pixels === 0, `the fallback goes dark when the gold runs out (${b2dry.discs} discs, alpha-sum ${b2dry.pixels})`)

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

        // #794: the HD title's ‹ › must be REAL controls — a chevron tap
        // cycles the course without launching, the stick/d-pad cycle too, the
        // centre stays the start zone, and cycling walks all four circuits
        // (#784). The page just restarted from the end table: it sits on attract.
        console.log('  attract course selector (#794 — chevrons are buttons):')
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'attract', 'the page sits on attract for the selector checks')
        let S = await page.evaluate(() => window.__cometHDTest.selector())
        ok(!!S && S.hw * 2 >= 48 && S.hh * 2 >= 32, `chevron hit-boxes are thumb-sized (${S ? `${S.hw * 2}x${S.hh * 2}` : 'null'})`)
        const ids = await page.evaluate(() => window.__cometHDTest.courseIds())
        const idxOf = (id) => ids.indexOf(id)
        const cur = () => page.evaluate(() => window.__cometHDTest.course())
        const scr = () => page.evaluate(() => window.__cometHDTest.screen())
        const clickChevron = async (dir) => {
            const G = await page.evaluate(() => window.__cometHDTest.selector())
            const [gx, gy] = dir < 0 ? G.left : G.right
            await page.mouse.click(G.ox + gx * (G.vw / G.w), G.oy + gy * (G.vh / G.h))
            await page.waitForTimeout(120)
        }
        const clickCentre = async () => {
            const G = await page.evaluate(() => window.__cometHDTest.selector())
            await page.mouse.click(G.ox + (G.w / 2) * (G.vw / G.w), G.oy + G.rowY * (G.vh / G.h))
            await page.waitForTimeout(120)
        }
        const c0 = await cur()
        await clickChevron(-1)
        ok(await cur() === ids[(idxOf(c0) - 1 + ids.length) % ids.length] && await scr() === 'attract',
            'a left-chevron click cycles back and does NOT start the race')
        await clickChevron(1)
        ok(await cur() === c0 && await scr() === 'attract', 'a right-chevron click cycles forward and still does not start')
        ok(await page.evaluate(() => { window.__cometHDTest.cycleCourse(1); const s = window.__cometHDTest.selector(); return s.pressFresh === true && s.pressDir === 1 }),
            'a cycled chevron lights its press state (pressable look)')
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(120)
        ok(await cur() !== c0 && await scr() === 'attract', 'the d-pad (Arrow keys) cycles the title too')
        const c1 = await cur()
        await page.evaluate(() => window.__cometHDTest.setStick(1))
        await page.waitForTimeout(260)
        const held1 = await page.evaluate(() => { const t = window.__cometHDTest; return { c: t.course(), s: t.screen() } })
        await page.waitForTimeout(450)
        const held2 = await cur()
        ok(held1.s === 'attract' && held1.c === ids[(idxOf(c1) + 1) % ids.length] && held2 === held1.c,
            `one stick flick steps exactly ONE course, a hold does not spin, and nothing launches (${c1} -> ${held1.c})`)
        await page.evaluate(() => window.__cometHDTest.setStick(-1))
        await page.waitForTimeout(260)
        ok(await cur() === c1 && await scr() === 'attract', 'the opposite stick flick steps back without launching')
        await page.evaluate(() => window.__cometHDTest.setStick(0))
        await page.waitForTimeout(120)
        const cWrap = await cur()
        for (let i = 0; i < ids.length; i++) await clickChevron(1)
        ok((await cur()) === cWrap && await scr() === 'attract', `chevron cycling walks every circuit and wraps (${ids.length} circuits — the 4th survives #784)`)
        await clickCentre()
        ok(await scr() === 'race', 'a tap on the name (centre start zone) still launches the race')
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

    // #478 item 8: a portrait phone (390x844) must draw a readable cluster that
    // stays clear of the #437 corner chrome. Chrome rects come from the DOM,
    // panel rects from the shell's own layout — both in CSS px over one canvas.
    await new Promise((r) => setTimeout(r, 1500))
    const b4 = await launch()
    try {
        const page4 = await openGame(b4, { url: URL, viewport: { width: 390, height: 844 }, hook: '__cometHDTest', wait: 500 })
        await page4.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        await page4.keyboard.press('Space')
        await page4.waitForFunction(() => window.__cometHDTest.screen() === 'race', null, { timeout: 8000 })
        const m = await page4.evaluate(() => {
            const hud = window.__cometHDTest.hud()
            const rect = (sel) => {
                const el = document.querySelector(sel)
                if (!el) return null
                const r = el.getBoundingClientRect()
                return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom, right: r.right }
            }
            return { hud, arcade: rect('[data-nav="arcade"]'), pause: rect('[data-nav="pause"]') }
        })
        const { hud, arcade, pause } = m
        ok(hud.u >= 1.1, `portrait 390x844 draws a thumb-readable cluster (u=${hud.u.toFixed(2)})`)
        ok(hud.pos.y >= arcade.bottom && hud.speed.y >= arcade.bottom, `POS/speed sit below ARCADE (top ${arcade.bottom.toFixed(0)}px vs row ${hud.pos.y.toFixed(0)}/${hud.speed.y.toFixed(0)})`)
        ok(hud.mini.y >= pause.bottom && hud.lap.y >= pause.bottom && hud.pos.y >= arcade.bottom, `every panel starts below the chrome row (buttons bottom ${pause.bottom.toFixed(0)}px vs rows ${hud.mini.y.toFixed(0)}/${hud.pos.y.toFixed(0)})`)
        ok(hud.lap.x >= hud.pos.x + hud.pos.w && hud.lap.x + hud.lap.w <= hud.mini.x, 'LAP / POS / minimap do not overlap each other at portrait scale')
        ok(hud.mini.x + hud.mini.w <= hud.W && hud.mini.y + hud.mini.h <= hud.H && hud.pos.y + hud.pos.h <= hud.H, 'every panel stays inside the viewport')
        ok(hud.pos.w >= 40 && hud.lap.h >= 26, `panels themselves grew with the scale (POS ${hud.pos.w.toFixed(0)}x${hud.pos.h.toFixed(0)}, LAP h ${hud.lap.h})`)
    } finally {
        await b4.close()
    }

    // #478 item 9: device-loss self-heal, retested headlessly. ?gl=webgl-node
    // pins three's WebGPU renderer onto its WebGL backend (forceWebGL — no
    // adapter needed), the exact state the refuge exists for; WEBGL_lose_context
    // then kills the context and the game must rebuild itself without dying.
    await new Promise((r) => setTimeout(r, 2000))
    const b5 = await launch()
    try {
        const page5 = await openGame(b5, { url: BASE + '?gl=webgl-node', viewport: { width: 640, height: 360 }, hook: '__cometHDTest', wait: 500 })
        await page5.waitForFunction(() => window.__cometHDTest.ready() && window.__cometHDTest.backend() === 'webgl2', null, { timeout: 20000 })
        ok(true, '?gl=webgl-node pins the three WebGL-node backend (the device-loss state, deterministically)')
        const stashed = await page5.evaluate(() => window.__cometHDTest.hasNodeGL())
        ok(stashed === true, 'the node backend stashes its live GL context at boot (heartbeat + heal are not blind)')
        const lost = await page5.evaluate(() => window.__cometHDTest.simulateDeviceLoss())
        ok(lost === true, 'WEBGL_lose_context fired on the live node-backend canvas')
        await page5.waitForFunction(() => window.__cometHDTest.backend() === 'webgl2-legacy', null, { timeout: 20000 }).catch(() => {})
        ok((await page5.evaluate(() => window.__cometHDTest.backend())) === 'webgl2-legacy', 'device loss self-heals into the legacy refuge (no manual reload)')
        const t1 = await page5.evaluate(() => window.__cometHDTest.game().tick)
        await page5.waitForTimeout(400)
        const t2 = await page5.evaluate(() => window.__cometHDTest.game().tick)
        ok(t2 > t1, `the sim keeps ticking through and after the rebuild (${t1} -> ${t2})`)
        const px5 = await page5.evaluate(() => {
            const src = document.querySelector('canvas')
            const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90
            const x = cv.getContext('2d'); x.drawImage(src, 0, 0, 160, 90)
            const d = x.getImageData(0, 0, 160, 90).data
            let min = 255; let max = 0
            for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; min = Math.min(min, l); max = Math.max(max, l) }
            return { min, max }
        })
        ok(px5.max - px5.min > 60, `the rebuilt canvas draws a real world again, not the dead black (${px5.min}..${px5.max})`)
    } finally {
        await b5.close()
    }
}

// ---- #502 item 4: HD banking cue ----------------------------------------------------
// Outside strata climb with bankAt through Sandbank's sweepers (a taller wall
// against the lean); Sunset Gulch's canyon keeps uniform strata.
{
    const probe = (id) => {
        selectCourse(id)
        let cov = 0; let maxRise = 0
        for (let i = 0; i < TRACK.N; i++) {
            const s = -Math.sign(TRACK.pts[i].k) || 1
            const rise = wallTopSideAt(i, s) - wallTopSideAt(i, -s)
            if (rise >= 0.6 * BANK_RISE) cov++
            if (rise > maxRise) maxRise = rise
        }
        selectCourse('gulch')
        return { cov: cov / TRACK.N, maxRise }
    }
    const bk = probe('sandbank')
    ok(bk.cov >= 0.15 && bk.maxRise >= 0.95,
        `banking: Sandbank sweepers raise the outside strata (coverage ${(bk.cov * 100).toFixed(1)}%, peak +${bk.maxRise.toFixed(2)}m)`)
    const gk = probe('gulch')
    ok(gk.cov === 0 && gk.maxRise < 0.6 * BANK_RISE, `banking: Gulch canyon strata stay uniform (peak +${gk.maxRise.toFixed(2)}m)`)
    const bs = trackGeometryStats()
    ok(Object.values(bs.stats).every((s) => s.nan === 0), 'banking: raised wall ribbons stay finite (no NaNs)')
}

// ---- #718: the floor follows the course ------------------------------------------------
// The sand floor was a flat plane at -1.5 (a Gulch fit); #518's elevation work
// sank Sandbank to -3.1 and Corkscomb to -4.8, so road, kart and camera drove
// UNDER the sand for ~a quarter of those laps. The floor now hangs below the
// selected course's lowest cambered asphalt edge. --mutate-floor pins it back
// to -1.5 and must redden the per-course gates.
console.log('floor vs elevation (#718 — nothing drives under the sand):')
{
    const F7 = await import('file://' + SCENE + '?t=' + (Date.now() + 718))
    const { courseFloorY, asphaltMinY, elevAt, buildMesas: bm7 } = F7
    ok(F7.FLOOR_DUSK === -1.5 && F7.FLOOR_MARGIN >= 0.5, `floor constants: dusk plane -1.5, a real ${F7.FLOOR_MARGIN}u margin`)
    for (const c of COURSES) {
        selectCourse(c.id)
        const f = courseFloorY(); const lo = asphaltMinY()
        const cm = Math.min(...Array.from({ length: TRACK.N }, (_, i) => elevAt(i)))
        ok(lo > f, `${c.short}: lowest cambered asphalt ${lo.toFixed(2)}u clears the floor ${f.toFixed(2)}u`)
        ok(f <= lo - 0.5, `${c.short}: floor hangs ≥0.5u under the road (${(lo - f).toFixed(2)}u of margin)`)
        ok(f <= F7.FLOOR_DUSK, `${c.short}: floor never rises above the dusk plane`)
        ok(cm + 2.2 > f, `${c.short}: the chase eye (≥2.2u over the crown, shake included) stays above the floor`)
    }
    selectCourse('gulch')
    ok(courseFloorY() === Math.min(-1.5, asphaltMinY() - F7.FLOOR_MARGIN), 'the Gulch floor obeys the same law (no special case)')
    ok(courseFloorY() < -1.49 - 0.5, `Gulch's 0.01 clearance got a real margin (floor ${courseFloorY().toFixed(2)}u vs road -1.49u)`)
    const SRCF = readFileSync(SHARD, 'utf8')
    ok(/floor\.position\.set\(A\.cx, floorY, A\.cz\)/.test(SRCF) && /buildMesas\(t\.mesa, floorY\)/.test(SRCF), 'index.jsx drops floor AND mesas to the course floor in buildHorizon')
    ok(!SRCF.includes('A.cx, -1.5'), 'the flat -1.5 floor literal is gone from index.jsx')
    const mesas = bm7(0x123456, -3).children
    ok(mesas.every((m) => Math.abs(m.position.y - m.geometry.parameters.height / 2 + 2.9) < 1e-9), 'mesas sink with the floor (base = floor + 0.1u)')
    ok(bm7(0x123456, -3).children[0].position.y < bm7(0x123456).children[0].position.y - 1.4, 'a deeper floor puts every mesa below its dusk footing')
}

console.log(`\ncometdrifthdcheck: ${pass} pass, ${fail} fail`)
if (MUTATE || MUTATE_CHIME || MUTATE_BLOOM || spinmutat || streakmutat || starmutat || wallmutat || hudmutat || skinmutat || regmutat || healmutat || floormutat) process.exit(fail > 0 ? 0 : 1)
process.exit(fail > 0 ? 1 : 0)
