// cometdrifthdscenerycheck — COMET DRIFT HD trackside scenery (#639).
//
// Node-only. Proves three things about the dressing on every course in the
// pack: it BUILDS (a deterministic plan that resolves to finite px centres),
// its RULES hold (the racing line is clear — nothing inside the sim's 216px
// wall clamp; every prop clears every passing leg by its footprint; only
// barriers/tire-walls are solid; a phone-friendly cap; the signature race-circuit
// categories are present), and the race is UNAFFECTED (because no prop is
// reachable, the certified autopilot still wins the whole race).
//
//   npm run cometdrifthdscenerycheck
//   npm run cometdrifthdscenerycheck -- --mutate    # parks a prop on the racing
//                                                    # line — this run MUST go red
import { readFileSync } from 'node:fs'
import { plant, pull } from './lib/mutateguard.mjs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRACK, COURSES, selectCourse } from '../src/games/CometDrift/track.js'
import { makeGame, step, decide, LAPS } from '../src/games/CometDrift/sim.js'
import { tracksidePlan, tracksideAudit, resolvePlan, ROOF_Y, STAND_SCALE_START, STAND_SCALE_STRAIGHT, SHADOW_IDS, specSeat, SPEC_SEATS, SPEC_ROWS, SPEC_FILL, primitiveProp, barrierSkin, SPONSOR_PAIRS, signSpec, SIGN_BRANDS, SIGN_NUMS, bakeSignTexture, buntingY, pennantColor, BUNT_TOP, BUNT_SAG, BUNT_N, BUNT_COLORS, bunting, yawFor } from '../src/games/CometDriftHD/scenery.js'
import { elevAt, wallTopSideAt, hillDefs, mesaDefs } from '../src/games/CometDriftHD/scene.js'
import { crowdSwellGain, CROWD_R_MIN, CROWD_R_MAX, CROWD_BURST, CROWD_PERIOD } from '../src/games/CometDriftHD/audio.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const SCENERY_SRC = resolve(HERE, '../src/games/CometDriftHD/scenery.js')
const MUTATE = process.argv.includes('--mutate')

let pass = 0; let fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg}`) } }

// mutant: barriers drop onto the racing line — place()'s clamp veto is loosened
// AND the barrier offset is pulled inside the sim wall, so a prop really lands on
// the asphalt. ESM caches the module, so the edited file is only observable to a
// FRESH process: mutate on disk, re-run this check in a child, demand it exits
// red, then restore.
const PAIRS = [
    ['const min = Math.max(r, clampPx + 16)', 'const min = Math.max(r, 20)'],
    ["off: 252, scale: 1, orient: 'along', r: 48 })", "off: 60, scale: 1, orient: 'along', r: 48 })"],
    // #675 mutants: the constant-ground regression and the tall roof, both must
    // be caught by the grounding / stand-roof gates.
    ['e.baseY = propGroundY(e.i, e.side)', 'e.baseY = 1.82'],
    ['export const ROOF_Y = 3.4', 'export const ROOF_Y = 4'],
    ['export const SPEC_FILL = 0.82', 'export const SPEC_FILL = 0.0'],
    // #675 remainder mutants: one sponsor for every barrier, and bunting that
    // sags into the kart's headspace — both must die at their law gates.
    ['const i = Math.floor(shash(seed * 1.77 + 0.31) * SPONSOR_PAIRS.length)', 'const i = 0'],
    ['export const BUNT_SAG = 0.32', 'export const BUNT_SAG = 0.5'],
    // #808 mutant: side-blind 'across' yaw — stands on one side face away.
    ["orient === 'across' ? (side > 0 ? Math.PI - a : -a)", "orient === 'across' ? -a"],
]
if (MUTATE) {
    let src = readFileSync(SCENERY_SRC, 'utf8')
    if (!PAIRS.every(([good]) => src.includes(good))) { console.error('MUTATE: load-bearing lines not found — stale code.'); process.exit(2) }
    for (const [good, bad] of PAIRS) src = src.replace(good, bad)
    plant(SCENERY_SRC, src)
    console.log('  ..    mutated: barriers sit on the racing line — the child run MUST be red')
    let done = false
    try {
        const child = spawnSync(process.execPath, [SELF], { encoding: 'utf8' })
        done = child.status !== 0
        console.log(done ? '  ok  mutant detected: child run failed as demanded' : '  FAIL mutant escaped: child run still green')
    } finally {
        pull(SCENERY_SRC)
        console.log('  ..    mutation restored')
    }
    process.exit(done ? 0 : 1)
}

const SIGNATURE = ['grandstand', 'pit_building', 'billboard', 'sign', 'barrier', 'tire_wall', 'marshal_post', 'flag']

// CROWD LAW (#675, once): full voice at the stands, silent at the horizon,
// monotone between — and the murmur burst must cover its own period, so the
// bed is continuous, not dotted.
ok(crowdSwellGain(0) === 1 && crowdSwellGain(CROWD_R_MIN) === 1, 'crowd law: full gain inside R_MIN')
ok(crowdSwellGain(CROWD_R_MAX) === 0 && crowdSwellGain(1e4) === 0, 'crowd law: silent at/beyond R_MAX')
{
    let mono = true; let prev = 1
    for (let d = 0; d <= CROWD_R_MAX; d += 25) { const gv = crowdSwellGain(d); if (gv > prev + 1e-9) mono = false; prev = gv }
    ok(mono, 'crowd law: monotone decrease with distance')
    const mid = crowdSwellGain((CROWD_R_MIN + CROWD_R_MAX) / 2)
    ok(Math.abs(mid - 0.5) < 1e-9, `crowd law: smoothstep midpoint (got ${mid})`)
}
ok(CROWD_BURST * 60 >= CROWD_PERIOD, `crowd bed: burst ${CROWD_BURST}s covers its ${CROWD_PERIOD}-tick period (no dead air)`)

// STAND ROOF LAW (#675, once): the chase eye sits ~2.4u over the asphalt and
// the nearest stand edge is ~8u out at the line; with the boost FOV punch the
// frame ceiling is ~28° up, so the roof may top out at most ~4.6u above the
// stand base — the old 4.4u-local roof at 1.2 scale (5.3u) swept the top
// corners and cut the dusk sky.
const ROOF_TOP_LOCAL = ROOF_Y + 0.4 // + half-thickness + the -0.12 tilt
ok(ROOF_TOP_LOCAL * STAND_SCALE_START <= 4.6, `stand roof: start stands top out ${(ROOF_TOP_LOCAL * STAND_SCALE_START).toFixed(2)}u over the base (≤ 4.6)`)
ok(ROOF_TOP_LOCAL * STAND_SCALE_STRAIGHT <= 4.6, `stand roof: straight stands top out ${(ROOF_TOP_LOCAL * STAND_SCALE_STRAIGHT).toFixed(2)}u over the base (≤ 4.6)`)

// CROWD (#675, once): the stands read populated — a deterministic seat law,
// and the built grandstand carries exactly the seats the law says it does,
// all of them sitting on the deck (the mutant below empties the crowd).
{
    const seed = 7
    let n = 0
    for (let r = 0; r < SPEC_ROWS; r++) for (let c = 0; c < SPEC_SEATS; c++) if (specSeat(seed, r, c)) n++
    const seats = (stand) => { const d = []; stand.traverse((o) => { if (o.userData.dot) d.push(o) }); return d }
    const a = seats(primitiveProp('grandstand', seed))
    const b = seats(primitiveProp('grandstand', seed))
    ok(a.length === n && n >= SPEC_SEATS * SPEC_ROWS * 0.6, `crowd: ${a.length} spectators fill the deck (law ${n}, fill ${SPEC_FILL})`)
    ok(b.length === a.length && b.every((m, k) => m.position.equals(a[k].position)), 'crowd: the crowd is deterministic across builds')
    ok(a.every((m) => Math.abs(m.position.x) <= 2.8 && m.position.z >= -3.4 && m.position.z <= 0.6 && m.position.y >= 0.85 && m.position.y <= 2.65), 'crowd: every spectator sits on the deck (inside the stand bounds)')
}

// SPONSOR LAW (#675, once): deterministic pair + stripe law, and the walls
// actually vary — enough distinct skins that the straight stops tiling (the
// mutant below collapses every seed onto one sponsor and must go red).
{
    const skins = Array.from({ length: 12 }, (_, s) => barrierSkin(s + 1))
    ok(skins.every((sk, s) => JSON.stringify(sk) === JSON.stringify(barrierSkin(s + 1))), 'barriers: skin law is deterministic')
    ok(skins.every((sk) => SPONSOR_PAIRS.some(([a, b]) => (sk.base === a && sk.stripe === b) || (sk.base === b && sk.stripe === a))), 'barriers: every skin is a sponsor pair, base ≠ stripe')
    ok(skins.every((sk) => sk.stripes === 3 || sk.stripes === 4), 'barriers: stripe count is 3 or 4')
    const pairs = new Set(skins.map((sk) => `${sk.base}-${sk.stripe}`))
    ok(pairs.size >= 4, `barriers: ${pairs.size} distinct sponsor skins across the straight (≥ 4)`)
    const hexes = (b) => b.children.filter((o) => Math.abs(o.position.y - 0.45) < 1e-6).map((o) => o.material.color.getHex())
    const b1 = hexes(primitiveProp('barrier', 3))
    const b2 = hexes(primitiveProp('barrier', 8))
    ok(b1.length >= 4 && b2.length >= 4 && JSON.stringify(b1) !== JSON.stringify(b2), 'barriers: built panels differ seed to seed (corrugation + sponsor)')
}

// SIGNAGE LAW (#675, once): boards carry brand + number from finite lists,
// contrast pair, deterministic; the canvas bake is browser-only (null in Node),
// and the built boards actually carry a signFace.
{
    const spec = signSpec(5)
    ok(SIGN_BRANDS.includes(spec.brand) && SIGN_NUMS.includes(spec.big) && /^\d+$/.test(spec.big), `signage: spec reads "${spec.brand} ${spec.big}" from the brand/number lists`)
    ok(JSON.stringify(signSpec(5)) === JSON.stringify(spec) && spec.bg !== spec.fg, 'signage: deterministic, bg ≠ fg (contrast)')
    ok(bakeSignTexture(spec) === null, 'signage: canvas bake is browser-only (null under Node)')
    const faces = (p) => { const d = []; p.traverse((o) => { if (o.userData.signFace) d.push(o) }); return d }
    ok(faces(primitiveProp('billboard', 5)).length === 1 && faces(primitiveProp('sign', 5)).length === 1, 'signage: billboard and sign boards carry a branded face')
}

// BUNTING LAW (#675, once): catenary over the decks — endpoints at the posts,
// sag keeps the pennants ≥ 2.2u over the stand base (above the kart's
// headspace), colours cycle, build deterministic (the sag mutant must die).
{
    ok(Math.abs(buntingY(0) - BUNT_TOP) < 1e-9 && Math.abs(buntingY(1) - BUNT_TOP) < 1e-9, 'bunting: string ties off at both posts')
    ok(BUNT_TOP - BUNT_SAG >= 2.2 && buntingY(0.5) === BUNT_TOP - BUNT_SAG, `bunting: lowest pennant ${buntingY(0.5).toFixed(2)}u ≥ 2.2u (clear of karts)`)
    let down = true; let up = true; let prev = buntingY(0)
    for (let t = 0; t <= 1.0001; t += 0.05) { const y = buntingY(t); if (t < 0.5 && y > prev + 1e-9) down = false; if (t > 0.5 && y < prev - 1e-9) up = false; prev = y }
    ok(down && up, 'bunting: monotone sag then rise (a catenary, not a zigzag)')
    ok(new Set(Array.from({ length: 6 }, (_, k) => pennantColor(k))).size >= 4, 'bunting: pennant colours cycle through the palette')
    const b = bunting(3)
    ok(b.children.length === BUNT_N + 2, `bunting: ${BUNT_N} pennants + 2 posts per string`)
    const stand = primitiveProp('grandstand', 9)
    let cones = 0; stand.traverse((o) => { if (o.geometry && o.geometry.type === 'ConeGeometry' && o.geometry.parameters.radialSegments === 3) cones++ })
    ok(cones === BUNT_N, `bunting: the built grandstand wears its ${BUNT_N} pennants`)
}

// HILLS (#675, once): a rolling ring between the plateau and the mesas —
// rounded (low h/w, the anti-mesa), deterministic, and clear of the camera
// corridor past the furthest track point.
{
    const hs = hillDefs()
    ok(hs.length >= 12, `hills: ${hs.length} rolling hills on the ring`)
    ok(JSON.stringify(hillDefs()) === JSON.stringify(hs), 'hills: the ring is deterministic')
    ok(hs.every((d) => d.h / d.w >= 0.3 && d.h / d.w <= 0.6), 'hills: rolling shoulders (h/w 0.3–0.6) — not mesas')
    ok(hs.every((d) => d.h < Math.min(...mesaDefs().map((m) => m.h))), 'hills: lower than the lowest mesa (soft band in front)')
}

for (const c of COURSES) {
    selectCourse(c.id)
    const plan = tracksidePlan()
    const audit = tracksideAudit(plan)

    // BOOT: a non-trivial deterministic plan, all centres finite.
    ok(plan.length > 20, `${c.id}: plan builds (${plan.length} props)`)
    ok(plan.every((e) => Number.isFinite(e.wx) && Number.isFinite(e.wz)), `${c.id}: all prop centres finite`)
    const again = resolvePlan(tracksidePlan())
    ok(again.every((e, k) => e.wx === plan[k].wx && e.wz === plan[k].wz), `${c.id}: plan is deterministic`)

    // FACING LAW (#808): every 'across' prop looks at the racing line from its
    // own side — its front (local +z, rotated by the yaw both renderers apply)
    // must face the nearest track point. The side-blind mutant must die here.
    {
        let facing = 0; let bad = 0
        for (const e of plan) {
            if (e.orient !== 'across') continue
            facing++
            const p = TRACK.pts[e.i % TRACK.N]
            const yaw = yawFor(e.orient, p.a, e.rot, e.side)
            const fx = Math.sin(yaw); const fz = Math.cos(yaw)
            let bx = 0; let bz = 0; let bd = Infinity
            for (let j = 0; j < TRACK.N; j += 2) {
                const q = TRACK.pts[j]
                const dd = (q.x - e.wx) ** 2 + (q.y - e.wz) ** 2
                if (dd < bd) { bd = dd; bx = q.x; bz = q.y }
            }
            const dx = bx - e.wx; const dz = bz - e.wz
            if ((fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1) < 0.3) bad++
        }
        ok(facing >= 8, `${c.id}: ${facing} across-facing props audited (≥ 8)`)
        ok(bad === 0, `${c.id}: every across-facing prop looks at the racing line (${bad} look away)`)
    }

    // RULES: racing line clear — no prop within the sim clamp.
    ok(audit.violations.length === 0, `${c.id}: no prop inside its required clearance`)
    ok(audit.minClearancePx > TRACK.WALL_R, `${c.id}: nearest prop ${audit.minClearancePx}px is outside the wall (${TRACK.WALL_R}px)`)
    ok(audit.minClearancePx > 216, `${c.id}: nothing sits inside the 216px sim clamp`)
    ok(audit.solidsAreBarriersOnly, `${c.id}: only barriers/tire-walls are solid (${audit.solidCount} solid)`)
    ok(audit.count <= audit.cap, `${c.id}: prop count ${audit.count} within phone cap ${audit.cap}`)
    for (const id of SIGNATURE) ok(audit.categories[id] === true, `${c.id}: has ${id}`)

    // GROUNDING (#675): every prop stands on the TRUE plateau surface of its
    // own side (the wall-top law, banking included) — not the old constant
    // (2.07−0.25 = 1.82). The mutant below pins the stamp; the <1.70 probe
    // proves the law actually moves props (the constant never could).
    ok(plan.every((e) => Math.abs(e.baseY - (elevAt(e.i) + wallTopSideAt(e.i, e.side) - 0.25)) < 1e-9), `${c.id}: every prop baseY rides its side's plateau`)
    ok(again.every((e, k) => e.baseY === plan[k].baseY), `${c.id}: baseY is deterministic`)
    ok(plan.some((e) => e.baseY < 1.70), `${c.id}: some prop stands below the old constant ground (1.82)`)
    const grounded = plan.filter((e) => SHADOW_IDS[e.id])
    ok(grounded.length > 0 && grounded.every((e) => SHADOW_IDS[e.id] > 0.5 && SHADOW_IDS[e.id] < 2.5), `${c.id}: every tree/rock carries a contact-shadow radius (${grounded.length} props)`)

    // HILLS per course (#542 law): every hill clears the live centerline by its
    // footprint plus the camera margin, whatever course is selected.
    {
        let bad = 0
        for (const d of hillDefs()) {
            let best = Infinity
            for (let j = 0; j < TRACK.N; j += 3) {
                const q = TRACK.pts[j]
                best = Math.min(best, Math.hypot(q.x * (1 / 60) - d.x, q.y * (1 / 60) - d.z))
            }
            if (best - d.w < 3.5) bad++
        }
        ok(bad === 0, `${c.id}: rolling hills clear the camera corridor (footprint + 3.5u)`)
    }

    // UNAFFECTED: the certified autopilot still wins the whole race with the
    // dressing on (props never collide — nothing inside the clamp). While it
    // runs we watch how close the player gets to the stands: the crowd swell
    // (#675) is only real if the racing line actually passes within hearing.
    let g = makeGame(0)
    const stands = plan.filter((e) => e.id === 'grandstand')
    let minStandD = Infinity
    const maxTicks = 120000
    let ticks = 0
    while (!g.end && ticks < maxTicks) {
        step(g, decide(g))
        const P = g.karts[0]
        for (const s of stands) {
            const dd = Math.hypot(P.x - s.wx, P.y - s.wz)
            if (dd < minStandD) minStandD = dd
        }
        ticks++
    }
    ok(g.end && g.karts[0].finished && g.karts[0].lap >= LAPS, `${c.id}: autopilot still wins ${LAPS} laps (${ticks} ticks)`)
    ok(minStandD < CROWD_R_MAX, `${c.id}: the racing line passes within crowd range (${minStandD.toFixed(0)}px < ${CROWD_R_MAX}px)`)
    ok(crowdSwellGain(minStandD) > 0.3, `${c.id}: the swell is audible at the line (peak gain ${crowdSwellGain(minStandD).toFixed(2)})`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
