// tidalcheck.mjs — TIDAL RUSH, plain Node (zero DOM, zero browser).
// Proves three things per FORGE.md step 5: the game boots (a seeded race
// builds), its core rules hold (red-right/yellow-left judgement, miss chokes
// the throttle, progress-based skip policing — near OR far outside the line —
// boost economy, tricks bank on landing, laps count, the bay is bounded), and
// it can be won (autoPad takes P1 across seeds, on BOTH bays). Determinism is
// pinned twice: identical streams for one seed, divergence for another.
//
// Rung 2 (STORM BAY) adds: the sea is a table value — sunny ≡ WAVES forever,
// storm re-rolls per lap through a converging blend; lightning is sim-owned
// and never fires on sunny; the barrel roll scores; the shader is a uniform
// bridge — SEA_UNIFORMS appear in the GLSL text, seaUniforms() maps the live
// table into them exactly, and index.jsx writes them every frame. That is the
// drawn-sea ≡ ridden-sea proof, upgraded from "one constant table" to "every
// sea that ever re-rolls".
//
// Run: npm run tidalcheck                    (green)
//      node scripts/tidalcheck.mjs --mutate           (judgement muted → red)
//      node scripts/tidalcheck.mjs --mutate=swell     (swell re-roll dead → red)
//      node scripts/tidalcheck.mjs --mutate=rainoff   (rain wallpaper again → red)
//      node scripts/tidalcheck.mjs --mutate=push      (crosswind zeroed → red)
//      node scripts/tidalcheck.mjs --mutate=graboff    (nobody grabs the rail → red)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { plant, restoreAll } from './lib/mutateguard.mjs'

const mutArg = process.argv.find((a) => a.startsWith('--mutate'))
const MUT = mutArg ? (mutArg.split('=')[1] || 'judge') : null
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

// Plant the chosen mutant the honest way (guarded, remembered, rewound by
// mutateguard even if we die mid-run), THEN import the sim so ESM caches the
// mutated source.
if (MUT) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const ANCHORS = {
        // RED passes from ANY side — the slalom's core must notice.
        judge: { from: "const want = g.color === 'red' ? -1 : 1", to: 'const want = 1', note: 'RED-side judgement muted' },
        // STORM laps stop re-rolling the swell — "changes lap to lap" dies.
        swell: { from: 'gs.seaTarget = stormSea(gs.seed, c.lap)', to: 'gs.seaTarget = gs.seaTarget', note: 'per-lap swell re-roll pinned' },
        // the squall front freezes — the new sea never arrives.
        front: { from: 'gs.front.prog += FRONT_SPEED * DT', to: 'gs.front.prog += 0 * DT', note: 'squall front progress frozen' },
        // rain is wallpaper again (#3191) — the field never wets anyone.
        rainoff: { from: "if (gs.stage !== 'storm') return 0", to: 'return 0', note: 'rain field disabled everywhere' },
        // the squall stops shoving — crosswind drift zeroed.
        push: { from: 'const drift = RAIN_PUSH * rain * windGust(gs)', to: 'const drift = 0 * RAIN_PUSH * rain * windGust(gs)', note: 'crosswind drift zeroed' },
        // the moorings stop riding the drawn sea (#3159) — props glued to flat.
        moorsea: { file: 'src/games/TidalRush/index.jsx', from: 'const wb = frontW(s.x, s.z, gs.front)', to: 'const wb = 0', note: 'moored props stop riding the sea Kai rides' },
        // the anchorage stops following the course seed (#3159) — spots jitter.
        moorrand: { file: 'src/games/TidalRush/art.js', from: 'let s = (seed >>> 0) || 1', to: 'let s = (Math.random() * 4294967296) >>> 0', note: 'anchorage stops following the seed' },
        // the gulls freeze mid-air (#3218) — the sky stops moving.
        gullfreeze: { file: 'src/games/TidalRush/index.jsx', from: 'gullFrame(gm, flock, bird, t)', to: 'gullFrame(gm, flock, bird, 0)', note: 'gulls freeze mid-air' },
        // the wake is flat paint again (#3337) — foam stops dying with age.
        foamflat: { file: 'src/games/TidalRush/art.js', from: 'const foam = (1 - t) * (1 - t) * hot', to: 'const foam = 0.66 * hot', note: 'wake foam stops fading with age — flat paint' },
        // the trail stains the bay again (#3337) — glow flips to normal blend.
        glowdark: { file: 'src/games/TidalRush/art.js', from: 'blending: THREE.AdditiveBlending, // #3337 — additive: the wake only adds light', to: 'blending: THREE.NormalBlending, // #3337', note: 'wake glow darkens the water beside the trail again' },
        // the cross-section washes out again (#3342) — shoulder back to crest level.
        shoulderwash: { file: 'src/games/TidalRush/art.js', from: '[-hw * 0.68, ea * 0.22], [0, ea * 0.07], [hw * 0.68, ea * 0.22]', to: '[-hw * 0.68, ea * 0.34], [0, ea * 0.10], [hw * 0.68, ea * 0.34]', note: 'crest emphasis gone — shoulders fill the V into one band' },
        // wake foam stitches the centreline again (#3342) — the channel fills.
        centrestitch: { file: 'src/games/TidalRush/art.js', from: 'const off = width * 0.24 * sp.arm', to: 'const off = 0 * sp.arm', note: 'wake spray spawns on the centreline — the V channel fills in' },
        // the shallows stop shimmering (#3218) — beach caustics gone.
        causticoff: { file: 'src/games/TidalRush/art.js', from: 'float shoreK = length(vWorld.xz) / 180.0;', to: 'float shoreK = 0.0;', note: 'beach caustics disabled' },
        // the flat 360 lands in silence again (#3218) — no whoosh-in.
        trickdry: { file: 'src/games/TidalRush/index.jsx', from: "trick: () => { audioController.playSweep(1250, 240, 0.2, 'triangle', 0.06);", to: 'trick: () => {', note: 'flat-360 landing loses its whoosh-in' },
        // hull 0 is fed the local analog pad instead of its wire bytes (#3220) —
        // the exact divergence trap: host runs analog, guest runs the bits.
        // #3280 sweep: the law now lives at THREE call sites (race step, the
        // padIn feed added by #3257 rejoin, the spectate fast-forward #3265) —
        // replacing only the first left the pin blind on main. Mutate them ALL.
        wirefeed: { all: true, file: 'src/games/TidalRush/index.jsx', from: 'fromWire(mirrors[0].get(k) || toWire({}))', to: 'readPad()', note: 'hull 0 fed local analog — boxes diverge' },
        // the freeze keeps no receipts (#3244 item 5) — the hash-path stamp gone.
        evidoff: { file: 'src/games/TidalRush/index.jsx', from: 'evidence.markBad(k, evidence.mismatchSlot(k), r.mine, r.theirs)', to: '', note: 'desync stamps no evidence' },
        // the room ends in silence (#3244 item 4) — the host never answers with
        // the podium, guests sit on their own sheet waiting for nothing.
        podmute: { file: 'src/games/TidalRush/index.jsx', from: "net.room.send('pod', { rows: podWire(net.podium) })", to: 'void net.podium', note: 'host stops broadcasting the room podium' },
        // the podium ranks last-first (#3244 item 4) — the sheet lies about who won.
        podrank: { file: 'src/games/TidalRush/net.js', from: '.sort((a, b) => (a.finishT - b.finishT) || (a.id - b.id))', to: '.sort((a, b) => (b.finishT - a.finishT) || (a.id - b.id))', note: 'podium inverted — slowest first' },
        // the FLIP pays for a quarter turn (#3276) — clean-or-nothing dies.
        fliphalf: { from: 'const flipped = Math.abs(c.flipAng) >= Math.PI * 2 - 0.6', to: 'const flipped = Math.abs(c.flipAng) >= Math.PI * 0.5', note: 'flip pays on a partial rotation' },
        // the HANDSTAND stops counting its pays (#3276) — one long air is a slot machine.
        handcap: { from: 'const HAND_CAP = 3', to: 'const HAND_CAP = 99', note: 'handstand pays uncapped' },
        // gas ALONE tips you inverted (#3276) — every autopilot air pays; the
        // commit law is the difference between a trick and wallpaper.
        handcmit: { from: 'else if (pad.brake && up) {', to: 'else if (up) {', note: 'handstand triggers on throttle alone' },
        // nobody ever grabs (#3280) — the pose stopped hanging off the commit bit.
        graboff: { from: "c.grab = pad.brake ? (up ? 'handstand' : 'flip') : 'none'", to: "c.grab = 'none'", note: 'grabs never take the rail' },
        // spin landings forget their kind (#3280) — every landing sprays flat.
        landkind: { from: "spun ? 'spin' : rolled ? 'barrel' : 'plain'", to: "'plain'", note: 'landing kind forgotten — spin/barrel land flat' },
        // #3281: a wind-over misread as a hold would pose the rider wrong —
        // the pin is the read itself, so the mutant is the read.
        airhold: { from: "if (c.flipAng <= -HAND_VERT) return 'hold'", to: "if (c.flipAng <= 0.45) return 'hold'", note: 'hold misread on any wind-over' },
        // #3281: CPU handstands off — armed 3 gone (the pin above rides this).
        cpuhs: { from: 'armRoll < 0.45 ? 2 : armRoll < 0.70 ? 3 : 1', to: 'armRoll < 0.45 ? 2 : 1', note: 'armed 3 vanished — CPU handstands gone' },
        // #3281: bullet 4 — the fully-charged handstand banks nothing.
        handstcharge: { from: 'if (c.hsPaid === HAND_CAP) c.boost = Math.min(1, c.boost + 0.34)', to: 'if (c.hsPaid === HAND_CAP) c.boost = Math.min(1, c.boost + 0.0)', note: 'fully-charged handstand banks nothing' },
        // #3281: bullet 5 — the attract pad runs the harness autopilot.
        attractflip: { from: 'pad.brake = true', to: 'pad.brake = false', note: 'attract commits no scripted flip' },
        // #3323: the cross-fade flattens back to a linear table blend — the band
        // stops conserving energy and stops beating.
        beats: { file: 'src/games/TidalRush/water.js', from: 'return { ga: Math.sqrt(1 - w), gb: Math.sqrt(w) }', to: 'return { ga: 1 - w, gb: w }', note: 'band mix flattens back to convex — no beats, half energy' },
        // #3329: the crest-emphasis cue goes blind — stacked crests stop marking foam.
        beatfoam: { file: 'src/games/TidalRush/water.js', from: 'return Math.max(0, h - Math.max(hA, hB))', to: 'return 0', note: 'beat cue blind — stacked crests no longer whiten' },
    }
    const a = ANCHORS[MUT]
    if (!a) { console.error(`unknown mutant '${MUT}' (have: ${Object.keys(ANCHORS).join(', ')})`); process.exit(1) }
    const target = join(root, a.file || 'src/games/TidalRush/sim.js')
    const src = readFileSync(target, 'utf8')
    if (!src.includes(a.from)) { console.error(`mutant anchor missing in ${a.file || 'sim.js'} (${MUT})`); process.exit(1) }
    plant(target, a.all ? src.split(a.from).join(a.to) : src.replace(a.from, a.to))
    console.log(`[mutant] ${a.note} — check must go red`)
}

const { WAVES, heightAt, surfaceVy, waterHeight, seaGLSL, seaGLSLFront, seaUniforms, SEA_UNIFORMS, SEA_UNIFORMS_B, FRONT_UNIFORMS, frontUniforms, frontW, frontGains, mixHeight, mixBeat, mixVy, mixWater, sunnySea, stormSea, omega, FRONT_SPEED } = await import('../src/games/TidalRush/water.js')
const { makeGame, step, autoPad, attractPad, stateOf, stateHash, LAPS, rainAt, windAt, windGust, RAIN_VIS, RAIN_DRAG, RAIN_PUSH, THRUST, DRAG, airPose } = await import('../src/games/TidalRush/sim.js')

const run = (gs, maxS = 240, padFn = null) => {
    const events = []
    let t = 0
    while (!gs.done && t < 60 * maxS) { step(gs, padFn ? padFn(gs) : autoPad(gs)); events.push(...gs.events); t++ }
    return events
}
const ampEq = (a, b, eps = 1e-9) => a.length === b.length && a.every((w, i) =>
    Math.abs(w.amp - b[i].amp) <= eps && Math.abs(w.len - b[i].len) <= eps)

// 1. boot + state shape
{
    const gs = makeGame(7)
    const s = stateOf(gs)
    ok('boot: fresh race at tick 0, 3 crafts, 10 gates', s.tick === 0 && gs.crafts.length === 3 && gs.course.gates.length === 10 && s.done === false)
    ok('state is JSON-safe', JSON.stringify(s) === JSON.stringify(JSON.parse(JSON.stringify(s))))
    ok('gates alternate red/yellow', gs.course.gates.every((g, i) => g.color === (i % 2 === 0 ? 'red' : 'yellow')))
    ok('state carries the rung-2 fields (stage/swell/flash)', 'stage' in s && 'swell' in s && 'flash' in s)
}

// 2. determinism: seed + identical pads ⇒ identical hashes; other seeds differ;
//    and the STORM stream is its own deterministic world
{
    const a = makeGame(7); const b = makeGame(7); const c = makeGame(8)
    const ha = [], hb = [], hc = []
    for (let t = 0; t < 900; t++) {
        const pa = autoPad(a)
        step(a, pa); step(b, { ...pa }); step(c, autoPad(c))
        if (t % 100 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)); hc.push(stateHash(c)) }
    }
    ok('same seed, same pads ⇒ identical hash every 100 ticks', ha.join(',') === hb.join(','))
    ok('different seed ⇒ divergent hash', ha.join(',') !== hc.join(','))

    const s1 = makeGame(7, 'storm'); const s2 = makeGame(7, 'storm')
    let hs1 = 0, hs2 = 0, hsSun = 0
    for (let t = 0; t < 600; t++) { step(s1, autoPad(s1)); step(s2, autoPad(s2)) }
    hs1 = stateHash(s1); hs2 = stateHash(s2); hsSun = stateHash(a)
    ok('storm is deterministic too', hs1 === hs2)
    ok('storm and sunny streams diverge', hs1 !== hsSun)
}

// 3. gate judgement: RED clean on the right, miss on the left; YELLOW mirrored
{
    const g = makeGame(7); const g0 = g.course.gates[0]
    const lat = { x: g0.tangent.z, z: -g0.tangent.x } // left of travel
    g.crafts[0].x = g0.x + lat.x * 3; g.crafts[0].z = g0.z + lat.z * 3
    g.crafts[0].heading = Math.atan2(g0.tangent.x, g0.tangent.z); g.crafts[0].speed = 12
    g.crafts[0].progress = g0.arc - 2
    g.crafts[0].progIdx = Math.round(((g0.arc - 2) / g.course.len) * 720) % 720
    for (let i = 0; i < 40 && g.crafts[0].judged[0] === 0; i++) step(g, autoPad(g))
    ok('RED judged clean when passed on the correct side', g.crafts[0].judged[0] === 1)

    const g2 = makeGame(7)
    g2.crafts[0].x = g0.x - lat.x * 3; g2.crafts[0].z = g0.z - lat.z * 3
    g2.crafts[0].heading = Math.atan2(g0.tangent.x, g0.tangent.z); g2.crafts[0].speed = 12
    g2.crafts[0].progress = g0.arc - 2; g2.crafts[0].progIdx = g.crafts[0].progIdx
    for (let i = 0; i < 40 && g2.crafts[0].judged[0] === 0; i++) step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('RED judged a miss from the wrong side', g2.crafts[0].judged[0] === -1)
    ok('a miss chokes the throttle', g2.crafts[0].penalty > 0)

    const y1 = makeGame(7); const gy = y1.course.gates[1]
    const latY = { x: gy.tangent.z, z: -gy.tangent.x }
    y1.crafts[0].x = gy.x - latY.x * 3; y1.crafts[0].z = gy.z - latY.z * 3
    y1.crafts[0].heading = Math.atan2(gy.tangent.x, gy.tangent.z); y1.crafts[0].speed = 12
    y1.crafts[0].progress = gy.arc - 2; y1.crafts[0].progIdx = Math.round(((gy.arc - 2) / y1.course.len) * 720) % 720
    for (let i = 0; i < 40 && y1.crafts[0].judged[1] === 0; i++) step(y1, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('YELLOW judged clean on ITS correct side (mirror of red)', y1.crafts[0].judged[1] === 1)
}

// 4. skip policing rides PROGRESS (rung-2 rewrite of the corridor rule):
//    far outside the old corridor still judges; across the bay still never
//    judges; a shortcut cannot pre-judge a gate out of order.
{
    const gs = makeGame(7)
    const p = gs.crafts[0]
    p.judged[0] = 1
    p.judged[1] = 1
    for (let i = 0; i < 60; i++) step(gs, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    ok('distant gate stays unjudged from across the bay', p.judged[8] === 0)

    const g2 = makeGame(7)
    const g0 = g2.course.gates[0]
    const tan = g0.tangent
    g2.crafts[0].x = g0.x + tan.x * 15; g2.crafts[0].z = g0.z + tan.z * 15
    g2.crafts[0].progress = g0.arc + 15
    g2.crafts[0].progIdx = Math.round(((g0.arc + 15) / g2.course.len) * 720) % 720
    g2.crafts[0].heading = Math.atan2(tan.x, tan.z); g2.crafts[0].speed = 10
    step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('past the gate line unjudged ⇒ skip judged (inside the old corridor)', g2.crafts[0].judged[0] === -1)

    // THE loophole: 40 m outside the old 18 m corridor, past the line.
    const g3 = makeGame(7)
    const lat3 = { x: g0.tangent.z, z: -g0.tangent.x }
    g3.crafts[0].x = g0.x + tan.x * 15 + lat3.x * 40
    g3.crafts[0].z = g0.z + tan.z * 15 + lat3.z * 40
    g3.crafts[0].progress = g0.arc + 15
    g3.crafts[0].progIdx = g2.crafts[0].progIdx
    g3.crafts[0].heading = Math.atan2(tan.x, tan.z); g3.crafts[0].speed = 10
    step(g3, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('far-outside skip loophole CLOSED: 40 m lateral past the line judges a miss', g3.crafts[0].judged[0] === -1)

    // and an out-of-order buoy clip must NOT pre-judge: gate 3's radius while
    // gate 0 is still pending, ahead of its line ⇒ nothing happens to gate 3.
    const g4 = makeGame(7)
    const g3d = g4.course.gates[3]
    g4.crafts[0].x = g3d.x; g4.crafts[0].z = g3d.z
    g4.crafts[0].progress = g3d.arc - 1
    g4.crafts[0].progIdx = Math.round(((g3d.arc - 1) / g4.course.len) * 720) % 720
    g4.crafts[0].speed = 10
    step(g4, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('a shortcut across the middle cannot pre-judge a later gate', g4.crafts[0].judged[3] === 0)
}

// 5. boost economy: clean passes charge it; burning pushes speed past cruise
{
    const gs = makeGame(7)
    let maxV = 0, sawBoost = false
    for (let t = 0; t < 60 * 70 && !gs.done; t++) {
        step(gs, autoPad(gs))
        const p = gs.crafts[0]
        if (p.boosting) sawBoost = true
        maxV = Math.max(maxV, p.speed)
    }
    ok('autoPad charges and burns the sprint', sawBoost)
    ok('sprint pushes speed past cruise (>17 m/s)', maxV > 17)
}

// 6. air + tricks: kickers fly, the flat 360 banks +250, the barrel +200
{
    const gs = makeGame(7)
    let airs = 0, tricks = 0, barrels = 0
    const evs = run(gs, 90)
    airs = evs.filter((e) => e.type === 'air').length
    tricks = evs.filter((e) => e.type === 'trick').length
    barrels = evs.filter((e) => e.type === 'barrel').length
    ok('the bay has real kickers (autoPad flies)', airs > 5)
    ok('a held spin completes a 360 trick at least once per race', tricks > 0)

    const g2 = makeGame(7)
    let done = false
    for (let t = 0; t < 60 * 120 && !done; t++) {
        const p = g2.crafts[0]
        const pad = autoPad(g2); pad.a = p.airborne
        const score0 = g2.score
        step(g2, pad)
        if (g2.events.find((ev) => ev.type === 'trick')) { done = true; ok('trick scores +250 on landing', g2.score - score0 >= 250) }
    }
    if (!done) ok('trick scores +250 on landing', false)

    // BARREL: deterministic forced air, full-lock steer, land after a full roll
    const g3 = makeGame(7)
    const p = g3.crafts[0]
    for (let t = 0; t < 92; t++) step(g3, { throttle: 0, steer: 0, brake: false, a: false, b: false }) // wait out the start lights
    p.airborne = true; p.vy = 3.0; p.y = heightAt(p.x, p.z, g3.t, g3.seaCur) + 3.0; p.speed = 12
    let sawBarrel = false
    for (let t = 0; t < 90 && !sawBarrel; t++) {
        step(g3, { throttle: 1, steer: 1, brake: false, a: false, b: false })
        sawBarrel = g3.events.some((e) => e.type === 'barrel')
    }
    ok('full-lock steer airborne completes a BARREL ROLL (+200)', sawBarrel)
}

// 6b. flips + handstands (#3276): the pitch verbs ride the SAME six bits the
// wire already carries — brake alone tips a back-flip, brake+gas holds a
// handstand, and an air belongs to whichever trick completes first.
{
    const idle = { throttle: 0, steer: 0, brake: false, a: false, b: false }
    const fly = (g, vy = 4.5, lift = 4.5) => {
        for (let t = 0; t < 92; t++) step(g, idle) // wait out the start lights
        const p = g.crafts[0]
        p.airborne = true; p.vy = vy; p.y = heightAt(p.x, p.z, g.t, g.seaCur) + lift; p.speed = 12
    }

    // FLIP: brake alone through a full air.
    const g1 = makeGame(7); fly(g1)
    let s0 = g1.score, evs = []
    for (let t = 0; t < 170; t++) { step(g1, { ...idle, brake: true }); evs.push(...g1.events.splice(0)) }
    ok('BACK FLIP completes on landing (+300 — harder than the flat spin)',
        evs.some((e) => e.type === 'flip') && g1.score - s0 >= 300)

    // released early = nothing (clean-or-nothing, same law as the flat 360).
    const g2 = makeGame(7); fly(g2)
    s0 = g2.score; evs = []
    for (let t = 0; t < 170; t++) { step(g2, t < 12 ? { ...idle, brake: true } : idle); evs.push(...g2.events.splice(0)) }
    ok('a back-flip released early scores NOTHING — clean or nothing',
        !evs.some((e) => ['flip', 'trick', 'barrel', 'handstand'].includes(e.type)) && g2.score === s0)

    // HANDSTAND: brake+gas, long air — pays every half-second inverted, cap 3.
    const g3 = makeGame(7); fly(g3, 9)
    s0 = g3.score; evs = []
    for (let t = 0; t < 320 && g3.crafts[0].airborne; t++) { step(g3, { ...idle, brake: true, throttle: 1 }); evs.push(...g3.events.splice(0)) }
    const hs = evs.filter((e) => e.type === 'handstand')
    ok('HANDSTAND pays +150 per half-second inverted, capped at 3/air',
        hs.length === 3 && hs.every((e, i) => e.pts === 150 && e.n === i + 1))

    // gas alone never inverts — the commit is brake AND gas. (Autopilots hold
    // gas through the air constantly; if gas alone inverted, every AI air would
    // pay — this pin is why the trigger demands the brake bit too.)
    const g4 = makeGame(7); fly(g4, 9)
    s0 = g4.score; evs = []
    for (let t = 0; t < 320 && g4.crafts[0].airborne; t++) { step(g4, { ...idle, throttle: 1 }); evs.push(...g4.events.splice(0)) }
    ok('gas alone never inverts — a handstand needs the brake commit',
        !evs.some((e) => e.type === 'handstand') && g4.score === s0)

    // one-trick law stretched whole: an air a handstand paid lands inert.
    const g5 = makeGame(7); fly(g5, 9)
    evs = []
    for (let t = 0; t < 320 && g5.crafts[0].airborne; t++) { step(g5, { ...idle, brake: true, throttle: 1, a: true }); evs.push(...g5.events.splice(0)) }
    ok('a claimed air (handstand paid) lands spins/barrels/flips INERT',
        evs.some((e) => e.type === 'handstand') && !evs.some((e) => ['trick', 'barrel', 'flip'].includes(e.type)))

    // the six-bit wire already carries every trick input — flip is d, handstand
    // is u+d. Shape pinned above (649); here: trick pads stay deterministic,
    // so the hash referee locks out divergence in flips for free.
    const feed = (g) => {
        const p = g.crafts[0]
        const base = autoPad(g)
        if (!p.airborne) return base
        return { ...base, throttle: 1, brake: (g.tick % 40) < 20 }
    }
    const ha = [], hb = []
    const ga = makeGame(31), gb = makeGame(31)
    for (let t = 0; t < 3000 && !ga.done && !gb.done; t++) {
        step(ga, feed(ga)); step(gb, feed(gb))
        if (t % 100 === 0) { ha.push(stateHash(ga)); hb.push(stateHash(gb)) }
    }
    ok('trick pads keep the lockstep deterministic (same seed + pads ⇒ identical hashes)',
        ha.join(',') === hb.join(',') && ha.length > 5)
}

// 6c. grabs + trick-specific landings (#3280): the style half of a pitch trick
// hangs off the COMMIT bit the wire already carries — brake alone = FLIP grab
// at the rail, brake+gas = HANDSTAND reach — and the landing remembers which
// trick paid so the renderer sprays by kind. Cosmetic state by law: pads,
// physics, hash and scores are untouched by it (#3244 item 6 law).
{
    const idle = { throttle: 0, steer: 0, brake: false, a: false, b: false }
    const fly = (g, vy = 4.5, lift = 4.5) => {
        for (let t = 0; t < 92; t++) step(g, idle) // wait out the start lights
        const p = g.crafts[0]
        p.airborne = true; p.vy = vy; p.y = heightAt(p.x, p.z, g.t, g.seaCur) + lift; p.speed = 12
    }

    // FLIP grab: held through the air, released the tick the hull is water.
    const g1 = makeGame(7); fly(g1)
    let p = g1.crafts[0]
    let sawFlipGrab = false, flipLand = ''
    for (let t = 0; t < 170; t++) {
        step(g1, { ...idle, brake: true })
        if (p.airborne && p.grab === 'flip') sawFlipGrab = true
        if (!p.airborne) { flipLand = p.lastLand; break }
    }
    ok('a FLIP is GRABBED mid-air (brake alone = take the rail)', sawFlipGrab)
    ok('the landing REMEMBERS the paid trick (lastLand=flip) and the grab releases on the water',
        flipLand === 'flip' && p.grab === 'none')

    // HANDSTAND reach: brake+gas commits the bow reach; landing records it.
    const g2 = makeGame(7); fly(g2, 9)
    p = g2.crafts[0]
    let sawHand = false
    for (let t = 0; t < 320 && p.airborne; t++) {
        step(g2, { ...idle, brake: true, throttle: 1 })
        if (p.grab === 'handstand') sawHand = true
    }
    ok('a HANDSTAND reaches the bow (grab=handstand) and its landing is recorded as handstand',
        sawHand && p.lastLand === 'handstand')

    // The rail is EARNED: pitch verbs grab, flat spins and idle air never do.
    const g3 = makeGame(7); fly(g3)
    p = g3.crafts[0]
    let spinGrabbed = false, spinLand = ''
    for (let t = 0; t < 170; t++) {
        step(g3, { ...idle, a: true })
        if (p.grab !== 'none') spinGrabbed = true
        if (!p.airborne) { spinLand = p.lastLand; break }
    }
    ok('a flat SPIN never grabs — the rail is earned by the pitch verbs', !spinGrabbed)
    ok('a completed flat 360 records lastLand = spin', spinLand === 'spin')

    const g4 = makeGame(7); fly(g4)
    p = g4.crafts[0]
    let plainGrab = false, plainLand = ''
    for (let t = 0; t < 170; t++) {
        step(g4, idle)
        if (p.grab !== 'none') plainGrab = true
        if (!p.airborne) { plainLand = p.lastLand; break }
    }
    ok('an inert air grabs nothing and lands plain (lastLand = plain)', !plainGrab && plainLand === 'plain')

    // The dual-commit crawls, it never anchors (#3280 drive-leg): gas+brake is
    // the handstand verb, so holding it across a landing must not stall the
    // hull at zero. Coasting brake alone keeps its full teeth. Steer with the
    // game's own autopilot head — an unsteered hull just meets the boundary.
    const g6 = makeGame(7)
    for (let t = 0; t < 60 * 30; t++) step(g6, { ...autoPad(g6), throttle: 1, b: false })
    const vCruise = g6.crafts[0].speed
    for (let t = 0; t < 60 * 15; t++) step(g6, { ...autoPad(g6), throttle: 1, brake: true, b: false })
    const vCrawl = g6.crafts[0].speed
    for (let t = 0; t < 60 * 6; t++) step(g6, { ...autoPad(g6), throttle: 0, brake: true })
    const vAnchor = g6.crafts[0].speed
    ok('gas+brake settles at a crawl (>2 m/s) — a held handstand landing never dead-stops the hull',
        vCruise > 12 && vCrawl > 2 && vCrawl < 6)
    ok('coasting brake alone still anchors hard (<1 m/s) — the water brake keeps its teeth', vAnchor < 1)

    // the fields reach the contract intact, and CPUs grab on their armed flips
    // (the pose rides the pad bits, not hero special-casing).
    const s1 = stateOf(g1)
    ok('stateOf carries the cosmetic fields (grab/land, JSON-safe)',
        s1.grab === 'none' && s1.land === 'flip' && JSON.stringify(s1) !== '')
    let aiGrab = false
    for (const seed of [7, 31, 42, 99, 1234, 555]) {
        const g5 = makeGame(seed)
        for (let t = 0; t < 60 * 90 && !g5.done; t++) {
            step(g5, autoPad(g5))
            if (g5.crafts.some((c) => c.grab === 'flip')) { aiGrab = true; break }
        }
        if (aiGrab) break
    }
    ok('CPU riders grab on their armed flips too (pose hangs off the commit bit)', aiGrab)
    // #3281: armed 3 (handstand intent) — the braking CPU-gas commit, the
    // pose hanging off brake+gas exactly like the human verb.
    let aiHandstand = false
    for (const seed of [7, 31, 42, 99, 1234, 555]) {
        const g5 = makeGame(seed)
        for (let t = 0; t < 60 * 90 && !g5.done; t++) {
            step(g5, autoPad(g5))
            if (g5.crafts.some((c) => c.grab === 'handstand')) { aiHandstand = true; break }
        }
        if (aiHandstand) break
    }
    ok('CPU riders grab on their armed handstands too (brake+gas, pose hangs off the commit bit)', aiHandstand)
}
// 6d. #3281: airPose reads the pitch verbs the way the shell does — the pose
// is a state-out like any other, so the harness pins it and the shell can't
// drift from the sim it rides.
{
    const held = { airborne: true, flipAng: -1.30 }
    const flipping = { airborne: true, flipAng: 1.30 }
    const winding = { airborne: true, flipAng: 0.60 }
    const flat_ = { airborne: true, flipAng: 0.1 }
    const grounded = { airborne: false, flipAng: -1.50 }
    ok('airPose: grounded reads land', airPose(grounded) === 'land')
    ok('airPose: deep nose-down reads hold (handstand)', airPose(held) === 'hold')
    ok('airPose: a wind-over reads flip', airPose(flipping) === 'flip' && airPose(winding) === 'flip')
    ok('airPose: pitch-less air reads air', airPose(flat_) === 'air')
    // one-trick honesty: airPose is pure — the flat spin pays nothing extra
    // and the pose must not invent a verb the sim has not paid.
    const g1 = makeGame(7)
    for (let t = 0; t < 92; t++) step(g1, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    const p = g1.crafts[0]
    p.airborne = true; p.vy = 6; p.flipAng = 0.9
    ok('airPose: an airborne wind-over (flipAng 0.9) reads flip', airPose(p) === 'flip')
    p.flipAng = -1.30
    ok('airPose: an inverted hold (flipAng -1.30) reads hold', airPose(p) === 'hold')
}

// 6e. #3281 tail (bullets 4 + 5): a fully-charged handstand banks the send —
// the same 0.34 the flip pays — and the attract preview commits ONE scripted
// flip per lap (brake alone, gas eased, committed through the air) without
// ever touching the harness stream (autoPad stays pure).
{
    const idleA = { throttle: 0, steer: 0, brake: false, a: false, b: false }
    const flyA = (g, vy = 9) => {
        for (let t = 0; t < 92; t++) step(g, idleA)      // wait out the start lights
        const p = g.crafts[0]
        p.airborne = true; p.vy = vy; p.y = heightAt(p.x, p.z, g.t, g.seaCur) + 4.5; p.speed = 12
    }

    // bullet 4: a 3/3 handstand banks the send (+0.34 — the flip's value).
    const gH = makeGame(7); flyA(gH)
    gH.crafts[0].boost = 0                              // pin the before-value
    let evsH = []
    for (let t = 0; t < 320 && gH.crafts[0].airborne; t++) {
        step(gH, { ...idleA, brake: true, throttle: 1 })
        evsH.push(...gH.events.splice(0))
    }
    ok('a FULL 3/3 handstand banks the sprint charge (+0.34 — like the flip)',
        evsH.filter((e) => e.type === 'handstand').length === 3 && gH.crafts[0].boost >= 0.33)

    // bullet 5: the attract pad commits the flip and — critically — the commit
    // persists through the whole air (autoPad re-runs every tick and would
    // erase the brake mid-flip), so the advertised flip actually pays.
    const gA = makeGame(7); flyA(gA)
    const pA = gA.crafts[0]
    let commitTicks = 0, airFrames = 0
    let evsA = []
    for (let t = 0; t < 170; t++) {
        const pad = attractPad(gA)
        if (pA.airborne) {
            airFrames++
            if (pad.brake && !pad.a && pad.throttle <= 0.4 && gA.attractFlipArmed) commitTicks++
        }
        step(gA, pad)
        evsA.push(...gA.events.splice(0))
        if (!pA.airborne) break
    }
    ok('attract commits the scripted flip (brake alone, gas ≤0.4, spin released)',
        airFrames > 0 && commitTicks > airFrames * 0.9)
    ok('the committed attract flip pays on landing (a real flip, not wallpaper)',
        evsA.some((e) => e.type === 'flip'))

    // …and only ONE per lap: landed → the commit clears; a second air in the
    // SAME lap never re-commits; a NEW lap re-arms the same verb. The live
    // loop calls attractPad every tick, and the clear lives in the first
    // call after the water — so the pin does the same.
    attractPad(gA)
    ok('a landed attract air disarms the commit', !gA.attractFlipArmed)
    pA.airborne = true; pA.vy = 4; pA.speed = 12
    const padSame = attractPad(gA)
    ok('a second air in the SAME lap never re-commits (one flip per lap)',
        !padSame.brake && !gA.attractFlipArmed)
    pA.lap = 2
    const padNew = attractPad(gA)
    ok('a NEW lap re-arms the scripted flip', padNew.brake && gA.attractFlipArmed)
}

// 7. win: autoPad takes P1 on every seed on BOTH bays, sane times, bounded
{
    const times = []
    let allWin = true, bounded = true, lapOK = true
    for (const seed of [1, 7, 42, 99, 1234]) {
        const gs = makeGame(seed)
        run(gs, 240)
        if (!gs.done || gs.rank !== 1) allWin = false
        times.push(gs.t)
        if (gs.crafts[0].lap !== LAPS + 1) lapOK = false
        for (const c of gs.crafts) {
            const rr = (c.x / (74 + 27)) ** 2 + (c.z / (46 + 27)) ** 2
            if (rr > 1.3) bounded = false
        }
    }
    ok('autoPad WINS sunny (P1) on every seed', allWin)
    ok('finish times sane (45–120 s)', times.every((t) => t > 45 && t < 120))
    ok('laps counted 1→3, three gatesets completed', lapOK)
    ok('nobody escapes the bay bounds', bounded)

    const stormTimes = []
    let stormWin = true, stormBounds = true
    for (const seed of [1, 7, 42, 99]) {
        const gs = makeGame(seed, 'storm')
        run(gs, 240)
        if (!gs.done || gs.rank !== 1) stormWin = false
        stormTimes.push(gs.t)
        for (const c of gs.crafts) {
            const rr = (c.x / (74 + 27)) ** 2 + (c.z / (46 + 27)) ** 2
            if (rr > 1.3) stormBounds = false
        }
    }
    ok('autoPad WINS storm (P1) too — the storm is rideable', stormWin)
    ok('storm finish times sane (45–140 s)', stormTimes.every((t) => t > 45 && t < 140))
    ok('storm keeps everyone in the bay', stormBounds)
}

// 8. CPU field is alive: rivals advance laps and stay near the leader
{
    const gs = makeGame(7)
    for (let t = 0; t < 60 * 40 && !gs.done; t++) step(gs, autoPad(gs))
    const [p, mako, tundra] = gs.crafts
    ok('rivals race: both lapped into the pack within a straight', mako.progress > p.progress * 0.55 && tundra.progress > p.progress * 0.4)
}

// 9. THE BRIDGE: uniform-slot GLSL, live-table mapping, per-frame wiring
{
    const glsl = seaGLSL()
    let names = true
    for (const n of SEA_UNIFORMS) if (!glsl.includes(n)) names = false
    ok('GLSL declares every slot uniform from water.js', names && SEA_UNIFORMS.length === 24)
    const sinTerms = (glsl.match(/sin\(f\)/g) || []).length
    const cosTerms = (glsl.match(/cos\(f\)/g) || []).length
    ok('GLSL is fully unrolled: 4 sin + 4 cos terms (SwiftShader-safe, #3134)', sinTerms === 4 && cosTerms === 4)
    ok('GLSL has no array constructors (GLSL ES 1.00)', !/vec[234]\[\d/.test(glsl))

    const table = stormSea(7, 2)
    const su = seaUniforms(table)
    let bridge = true
    for (let i = 0; i < 4; i++) {
        const w = table[i]
        if (su[`uDir${i}`][0] !== w.dx || su[`uDir${i}`][1] !== w.dz) bridge = false
        if (su[`uA${i}`] !== w.amp || su[`uQ${i}`] !== w.qa) bridge = false
        if (su[`uK${i}`] !== w.k || su[`uO${i}`] !== w.om || su[`uPh${i}`] !== w.phase) bridge = false
    }
    ok('seaUniforms maps a live storm table into the uniforms exactly', bridge)
    const omOk = stormSea(1, 1).every((w) => Math.abs(w.om - omega(w.len)) < 1e-12)
    ok('every storm wave obeys deep-water dispersion ω=√(gk)', omOk)

    const artSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    ok('the shell pushes the LIVE seas + front into the shader every frame (pushSea)', artSrc.includes('pushSea(sea.mat, gs)') && artJs.includes("seaUniforms(gs.seaCur)") && artJs.includes("seaUniforms(gs.seaTarget, 'B')") && artJs.includes('frontUniforms(gs.front)'))
}

// 10. restart: a fresh game after a finished one starts clean
{
    const gs = makeGame(7)
    run(gs, 240)
    const gs2 = makeGame(7)
    ok('restart returns a fresh tick-0 race', gs.done && gs2.tick === 0 && !gs2.done && stateHash(gs) !== stateHash(gs2))
}

// 11. SUNNY is frozen heritage: the rung-1 bay never moves
{
    const gs = makeGame(7)
    const sunny = sunnySea()
    let stable = true
    for (let t = 0; t < 60 * 80 && !gs.done; t++) { step(gs, autoPad(gs)); if (!ampEq(gs.seaCur, sunny, 1e-12)) stable = false }
    ok('sunny sea ≡ WAVES table, every tick of the race', stable && ampEq(gs.seaCur, sunny, 1e-12))
    ok('sunny race never schedules lightning', gs.flash === 0)
}

// 12. STORM BAY: table value, per-lap re-roll through a converging blend
{
    const gs = makeGame(7, 'storm')
    ok('storm starts on stormSea(seed, lap 1)', ampEq(gs.seaCur, stormSea(7, 1)))
    ok('storm swell towers over sunny (main amp > sunny)', gs.seaCur[0].amp > sunnySea()[0].amp)
    const shape = stormSea(7, 1)
    const unit = shape.every((w) => Math.abs(Math.hypot(w.dx, w.dz) - 1) < 1e-9)
    const boundedAmp = shape.every((w) => w.amp > 0.15 && w.amp < 2.4)
    let qk = 0; for (const w of shape) qk += w.qa * w.k
    ok('storm waves: unit dirs, sane amps, no crest overhang (ΣQ·k ≤ 0.55)', unit && boundedAmp && qk <= 0.5501)
    ok('storm tables are seeded-pure: same seed+lap ⇒ same sea', ampEq(stormSea(9, 3), stormSea(9, 3)))
    ok('lap tables actually differ (the swell changes lap to lap)', !ampEq(stormSea(9, 1), stormSea(9, 3)))

    // race: after the lap-2 swell event, the target is lap 2's sea and the
    // live blend converges onto it within the blend window
    const g2 = makeGame(7, 'storm')
    let sawSwell = false
    let swells = 0
    for (let t = 0; t < 60 * 240 && !g2.done; t++) {
        step(g2, autoPad(g2))
        if (g2.events.some((e) => e.type === 'swell')) { sawSwell = true; swells++; if (swells === 1) {
            ok('swell shift lands the lap-2 sea on the target', ampEq(g2.seaTarget, stormSea(7, 2)))
        } }
    }
    ok('the storm re-rolls the swell mid-race', sawSwell && swells === 2) // laps 2 and 3
    ok('the live sea converges onto the re-rolled target', ampEq(g2.seaCur, g2.seaTarget, 1e-3))
}

// 13. lightning: storm-owned, seeded, visible; never on sunny
{
    const gs = makeGame(7, 'storm')
    let flashes = 0, sawLit = false
    for (let t = 0; t < 60 * 120 && !gs.done; t++) {
        step(gs, autoPad(gs))
        if (gs.events.some((e) => e.type === 'flash')) { flashes++; sawLit = gs.flash > 0.9 }
    }
    ok('the storm lightens (≥1 sim-scheduled flash per 2 min)', flashes >= 1 && sawLit)
    const gs2 = makeGame(7)
    let sunFlash = 0
    for (let t = 0; t < 60 * 80 && !gs2.done; t++) { step(gs2, autoPad(gs2)); if (gs2.events.some((e) => e.type === 'flash')) sunFlash++ }
    ok('sunny skies stay dry — zero lightning', sunFlash === 0)
}

// 14. the field behaves like water: bounded, continuous, wets. (Step small
//     and threshold loose enough for Gerstner crest-compression; a broken
//     field — NaN, blowup, flatline — still trips it.)
{
    let maxH = 0
    let prev = heightAt(-160, 13, 0)
    let smooth = true
    for (let i = 1; i < 4000; i++) {
        const x = -160 + i * 0.08, h = heightAt(x, 13, i * 0.016)
        if (!Number.isFinite(h)) { smooth = false; break }
        maxH = Math.max(maxH, Math.abs(h))
        if (Math.abs(h - prev) > 0.5) smooth = false
        prev = h
    }
    ok('sunny surface bounded (<2.5 m) and continuous', maxH < 2.5 && smooth)
    const sea = stormSea(7, 3)
    let maxS = 0, smoothS = true, prevS = heightAt(-160, 13, 0, sea)
    for (let i = 1; i < 4000; i++) {
        const x = -160 + i * 0.08, h = heightAt(x, 13, i * 0.016, sea)
        if (!Number.isFinite(h)) { smoothS = false; break }
        maxS = Math.max(maxS, Math.abs(h))
        if (Math.abs(h - prevS) > 1.1) smoothS = false // stormier, but still continuous
        prevS = h
    }
    ok('storm surface bounded (<4.2 m) and continuous', maxS < 4.2 && smoothS)
}

// 15. RUNG 3 — the squall front: it travels, it judges nothing but the sea,
//     it completes inside a lap, CPU and shader evaluate the SAME mix.
{
    const gs = makeGame(7, 'storm')
    ok('sunny never raises a front', gs.front === null)
    let sawFront = false, frontT0 = -1, doneT = -1, spatialOk = false, exact = true, seaSnap = false
    for (let t = 0; t < 60 * 240 && !gs.done; t++) {
        step(gs, autoPad(gs))
        if (gs.front && !sawFront) { sawFront = true; frontT0 = gs.t }
        if (gs.front && gs.front.prog > 40 && !spatialOk) {
            spatialOk = true
            const f = gs.front
            const sB = Math.max(-f.h + 2, Math.min(f.h, f.prog - f.h - 0.6 * f.band))
            const sA = Math.max(-f.h, Math.min(f.h - 2, f.prog - f.h + 0.6 * f.band))
            const b = { x: f.dx * sB, z: f.dz * sB }, a2 = { x: f.dx * sA, z: f.dz * sA }
            if (frontW(b.x, b.z, f) !== 1 || frontW(a2.x, a2.z, f) !== 0) exact = false
            if (Math.abs(mixHeight(b.x, b.z, gs.t, gs.seaCur, gs.seaTarget, frontW(b.x, b.z, f)) - heightAt(b.x, b.z, gs.t, gs.seaTarget)) > 1e-12) exact = false
            if (Math.abs(mixHeight(a2.x, a2.z, gs.t, gs.seaCur, gs.seaTarget, frontW(a2.x, a2.z, f)) - heightAt(a2.x, a2.z, gs.t, gs.seaCur)) > 1e-12) exact = false
        }
        if (sawFront && doneT < 0 && !gs.front) {
            doneT = gs.t
            seaSnap = gs.seaCur.every((w, i) => w.amp === gs.seaTarget[i].amp && w.phase === gs.seaTarget[i].phase)
        }
    }
    ok('the storm raises a squall front on the lap-2 re-roll', sawFront)
    ok('behind the front rides the NEW sea, ahead the OLD — exact', spatialOk && exact)
    ok('the front crosses inside ~12 s and the new sea takes over', doneT > 0 && doneT - frontT0 < 12 && seaSnap)
    ok('front speed is the tuned squall pace', FRONT_SPEED === 26)
    ok('state carries the rung-3 field (frontPct)', 'frontPct' in stateOf(gs))

    // sunny race: gs.front stays null for every tick
    const sun = makeGame(7)
    let sunnyFront = false
    for (let t = 0; t < 60 * 80 && !sun.done; t++) { step(sun, autoPad(sun)); if (sun.front) sunnyFront = true }
    ok('SUNNY BAY never raises a front mid-race', !sunnyFront)

    // determinism ACROSS a front: identical replays through lap-2 weather
    const r1 = makeGame(11, 'storm'), r2 = makeGame(11, 'storm')
    for (let t = 0; t < 60 * 45; t++) { step(r1, autoPad(r1)); step(r2, autoPad(r2)) }
    ok('storm replays match through the squall (hash)', stateHash(r1) === stateHash(r2))
}

// 15c. #3323 — the band BEATS: per-wave equal-power cross-fade. Gains conserve
//      wave energy (ga² + gb² ≡ 1); the mix is the documented per-slot sum
//      (gains scale TERMS before the sum, never the evaluated tables); mixVy is
//      its exact time-derivative; band edges stay byte-exact tables on every
//      path; and the physics that was IMPOSSIBLE under the old convex blend —
//      inside the band the surface stacks above BOTH swells (beat crests) and
//      sinks below BOTH (glassy counter-phase patches). Mutant `beats`
//      (gains flatten to 1−w / w) must turn the energy and both beat pins red.
{
    let ep = true, mono = true, prevGa = 2, prevGb = -1
    for (let w = 0; w <= 1.0001; w += 0.05) {
        const { ga, gb } = frontGains(w)
        if (Math.abs(ga * ga + gb * gb - 1) > 1e-9) ep = false
        if (ga > prevGa + 1e-12 || gb < prevGb - 1e-12) mono = false
        prevGa = ga; prevGb = gb
    }
    ok('cross-fade gains conserve wave energy (ga²+gb²≡1) at every w', ep)
    ok('cross-fade is monotone — outgoing fades out, incoming grows in', mono)

    const A = sunnySea(), B = stormSea(7, 2)
    let formula = true
    for (const w of [0.2, 0.5, 0.8]) {
        const { ga, gb } = frontGains(w)
        for (let x = -120; x <= 120; x += 7.3) {
            for (let z = -70; z <= 70; z += 5.1) {
                let y = 0
                for (let i = 0; i < 4; i++) {
                    const u = A[i], v = B[i]
                    y += u.amp * Math.sin(u.k * (u.dx * x + u.dz * z) - u.om * 2.5 + u.phase) * ga
                    y += v.amp * Math.sin(v.k * (v.dx * x + v.dz * z) - v.om * 2.5 + v.phase) * gb
                }
                if (Math.abs(mixHeight(x, z, 2.5, A, B, w) - y) > 1e-12) formula = false
            }
        }
    }
    ok('mixHeight is the per-slot sum — gains scale terms, never evaluated tables', formula)

    let deriv = true
    for (const w of [0.3, 0.5, 0.7]) {
        for (const [x, z] of [[-60, 20], [15, -45], [80, 60]]) {
            const e = 1e-4
            const dh = (mixHeight(x, z, 2 + e, A, B, w) - mixHeight(x, z, 2 - e, A, B, w)) / (2 * e)
            if (Math.abs(mixVy(x, z, 2, A, B, w) - dh) > 1e-4 * (1 + Math.abs(dh))) deriv = false
        }
    }
    ok('mixVy is the exact d/dt of the cross-faded surface (drawn ≡ ridden velocity)', deriv)

    const edgeY = Math.abs(mixHeight(12, -30, 3.1, A, B, 0) - heightAt(12, -30, 3.1, A)) +
        Math.abs(mixHeight(12, -30, 3.1, A, B, 1) - heightAt(12, -30, 3.1, B))
    const edgeV = Math.abs(mixVy(12, -30, 3.1, A, B, 0) - surfaceVy(12, -30, 3.1, A)) +
        Math.abs(mixVy(12, -30, 3.1, A, B, 1) - surfaceVy(12, -30, 3.1, B))
    const wm0 = mixWater(12, -30, 3.1, A, B, 0), wm1 = mixWater(12, -30, 3.1, A, B, 1)
    const wv0 = waterHeight(12, -30, 3.1, A), wv1 = waterHeight(12, -30, 3.1, B)
    const edgeW = Math.abs(wm0.y - wv0.y) + Math.abs(wm0.dx - wv0.dx) + Math.abs(wm0.dz - wv0.dz) +
        Math.abs(wm1.y - wv1.y) + Math.abs(wm1.dx - wv1.dx) + Math.abs(wm1.dz - wv1.dz)
    ok('band edges byte-exact tables for height, vy and water (both sides)', edgeY === 0 && edgeV === 0 && edgeW === 0)

    // the beat itself, on the LIVE front: sweep the band every half-second
    // while it crosses; track how far the surface escapes the [min,max] box of
    // the two tables. A convex blend keeps both margins ≤ 0 forever.
    const gs = makeGame(7, 'storm')
    let sawMid = false, stack = -9, glass = 9, nBeat = 0
    for (let t = 0; t < 60 * 240 && !gs.done; t++) {
        step(gs, autoPad(gs))
        const f = gs.front
        if (!f || f.prog < 20 || f.prog > f.h || t % 15 !== 0) continue
        sawMid = true
        const lx = -f.dz, lz = f.dx
        for (let s = -f.h + 2; s < f.h - 2; s += 1.8) {
            for (let l = -80; l <= 80; l += 6) {
                const x = f.dx * s + lx * l, z = f.dz * s + lz * l
                const w = frontW(x, z, f)
                if (w < 0.15 || w > 0.85) continue
                const hA = heightAt(x, z, gs.t, gs.seaCur), hB = heightAt(x, z, gs.t, gs.seaTarget)
                const h = mixHeight(x, z, gs.t, gs.seaCur, gs.seaTarget, w)
                nBeat++
                if (h - Math.max(hA, hB) > stack) stack = h - Math.max(hA, hB)
                if (h - Math.min(hA, hB) < glass) glass = h - Math.min(hA, hB)
            }
        }
    }
    ok('the band stacks beat crests ABOVE both swells (convex mix cannot)', sawMid && stack > 0.05)
    ok('the band carries glassy patches BELOW both swells (counter-phase)', sawMid && glass < -0.05)
    ok('the beat sweep sampled the live band (thousands of points)', nBeat > 5000)

    // #3329 — the crest-emphasis cue the shader rides (mixBeat): the CPU twin
    // of the GLSL `beat` out-param. Rules: exact zero outside the band (and so
    // on every sunny frame — fronts only live in STORM BAY), never negative,
    // identical to the stacked excess the sweep above measures, and LIVE crest
    // coverage: the cue must actually light meaningful crest lines, not noise.
    let cueZero = true, cueNeg = false
    for (const w of [-1, 0, 1, 2]) {
        for (const [x, z] of [[-60, 20], [15, -45], [80, 60]]) {
            if (mixBeat(x, z, 2.5, A, B, w) !== 0) cueZero = false
        }
    }
    ok('the beat cue is exact 0 outside the band (edges + sunny untouched)', cueZero)
    let cueId = true
    for (const w of [0.2, 0.45, 0.7, 0.9]) {
        for (let x = -120; x <= 120; x += 9.7) {
            for (let z = -70; z <= 70; z += 6.3) {
                const bt = mixBeat(x, z, 1.7, A, B, w)
                if (bt < 0) cueNeg = true
                const want = Math.max(0, mixHeight(x, z, 1.7, A, B, w) - Math.max(heightAt(x, z, 1.7, A), heightAt(x, z, 1.7, B)))
                if (Math.abs(bt - want) > 1e-12) cueId = false
            }
        }
    }
    ok('the beat cue never dips negative', !cueNeg)
    ok('mixBeat ≡ mixHeight − max(hA,hB) clamped (the stacked excess, exactly)', cueId)
    {
        const g3 = makeGame(7, 'storm')
        let cueMax = 0, cueN = 0, cueLit = 0, cueSaw = false
        for (let t = 0; t < 60 * 240 && !g3.done; t++) {
            step(g3, autoPad(g3))
            const f = g3.front
            if (!f || f.prog < 20 || f.prog > f.h || t % 30 !== 0) continue
            cueSaw = true
            const lx = -f.dz, lz = f.dx
            for (let s = -f.h + 2; s < f.h - 2; s += 1.8) {
                for (let l = -80; l <= 80; l += 6) {
                    const x = f.dx * s + lx * l, z = f.dz * s + lz * l
                    const w = frontW(x, z, f)
                    if (w < 0.15 || w > 0.85) continue
                    cueN++
                    const bt = mixBeat(x, z, g3.t, g3.seaCur, g3.seaTarget, w)
                    if (bt > cueMax) cueMax = bt
                    if (bt > 0.15) cueLit++
                }
            }
        }
        ok('the cue lights real crest lines on the live band (max > 0.5 m)', cueSaw && cueMax > 0.5)
        ok('constructive crest coverage stays line-like (1–15% of the band)', cueSaw && cueLit / cueN > 0.01 && cueLit / cueN < 0.15)
    }
}

// 16. RUNG 3 — GLSL twin + bridge for the two-slot front shader
{
    const glsl = seaGLSLFront()
    let names = true
    for (const n of [...SEA_UNIFORMS, ...SEA_UNIFORMS_B, ...FRONT_UNIFORMS]) if (!glsl.includes(n)) names = false
    ok('front GLSL declares both slot sets + the front uniforms (48+4 names)', names && SEA_UNIFORMS_B.length === 24 && FRONT_UNIFORMS.length === 4)
    ok('front GLSL carries clamp+smoothstep and the equal-power slot gains (the CPU twin)', glsl.includes('clamp(') && glsl.includes('3.0 - 2.0 * t')
        && glsl.includes('sqrt(1.0 - w)') && glsl.includes('sqrt(w)')
        && (glsl.match(/h \+= uA\d+ \* s \* wa/g) || []).length === 4 && (glsl.match(/h \+= uA\d+B \* s \* wb/g) || []).length === 4
        && (glsl.match(/cos\(f\) \* wa/g) || []).length === 4 && (glsl.match(/cos\(f\) \* wb/g) || []).length === 4
        && !glsl.includes('mix(hA'))
    const sinTerms = (glsl.match(/sin\(f\)/g) || []).length
    ok('front GLSL is fully unrolled for BOTH tables (8 sin terms, SwiftShader-safe)', sinTerms === 8)
    ok('front GLSL has no array constructors (GLSL ES 1.00)', !/vec[234]\[\d/.test(glsl))
    // #3329 — the beat out-param is wired: per-table accumulators summing the
    // SAME sin values, and the emitted quantity is the clamped stacked excess
    // (CPU twin mixBeat). Edges fall out exact: w=0 ⇒ h == hA, w=1 ⇒ h == hB.
    ok('front GLSL emits the beat cue (per-table sums + clamped stacked excess)', (glsl.match(/hA \+= uA\d+ \* s/g) || []).length === 4
        && (glsl.match(/hB \+= uA\d+B \* s/g) || []).length === 4
        && glsl.includes('beat = clamp(h - max(hA, hB), 0.0, 10.0)')
        && glsl.includes('out vec2 disp, out float beat'))

    const gs = makeGame(7, 'storm')
    for (let t = 0; t < 60 * 40 && !gs.front && !gs.done; t++) step(gs, autoPad(gs)) // catch the live front
    const fu = frontUniforms(gs.front)
    const bridgeOk = gs.front
        ? (fu.uFN[0] === gs.front.dx && fu.uFN[1] === gs.front.dz && fu.uFP === gs.front.prog && fu.uFH === gs.front.h && fu.uFW === gs.front.band)
        : (fu.uFP === -1e4 && fu.uFW === 1)
    ok('frontUniforms maps the live front (or its parked state) exactly', bridgeOk)
    const suB = seaUniforms(gs.seaTarget, 'B')
    let bOk = true
    for (let i = 0; i < 4; i++) {
        const w = gs.seaTarget[i]
        if (suB[`uDir${i}B`][0] !== w.dx || suB[`uA${i}B`] !== w.amp || suB[`uQ${i}B`] !== w.qa) bOk = false
    }
    ok('the incoming table lands in the B slots exactly', bOk)
}

// 17. RUNG 3 — the air pays: airbonus events are exact, bare air banks nothing
{
    const gs = makeGame(7, 'storm')
    const ev = run(gs, 240)
    const bonuses = ev.filter((e) => e.type === 'airbonus')
    ok('landed tricks bank an air-time bonus', bonuses.length > 0)
    ok('every bonus equals min(100, round(airT×50))', bonuses.every((e) => e.pts === Math.min(100, Math.round(e.airT * 50)) && e.pts > 0))
    ok('bonus is capped at +100', bonuses.every((e) => e.pts <= 100))
    const tricks = ev.filter((e) => e.type === 'trick' || e.type === 'barrel').length
    ok('one bonus per trick (one trick per air)', bonuses.length <= tricks)

    // bare air — no A, no lock — banks nothing
    const g2 = makeGame(7, 'storm')
    let sawAir = false, bareBonus = 0
    for (let t = 0; t < 60 * 240 && !g2.done; t++) {
        step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
        if (g2.events.some((e) => e.type === 'air')) sawAir = true
        if (g2.events.some((e) => e.type === 'airbonus')) bareBonus++
    }
    ok('a bare air banks nothing (no spin, no bonus)', sawAir && bareBonus === 0)
}

// 18. RAIN (#3191) — the squall is terrain: it gates by stage+front, bites
// speed, walks the hull downwind, dims the gates, and announces itself. Sunny
// is and stays dry.
{
    const sun = makeGame(7)
    let sunnyDry = true, sunnyRainEvt = 0
    for (let t = 0; t < 600; t++) {
        step(sun, autoPad(sun))
        if (rainAt(sun, sun.crafts[0].x, sun.crafts[0].z) !== 0) sunnyDry = false
        if (sun.events.some((e) => e.type === 'rain')) sunnyRainEvt++
    }
    ok('SUNNY never rains — field, state and events all agree', sunnyDry && stateOf(sun).rain === 0 && sunnyRainEvt === 0)

    const st = makeGame(7, 'storm')
    step(st, autoPad(st))
    ok('deep STORM (no front up) rains everywhere', rainAt(st, 0, 0) === 1 && rainAt(st, 40, -20) === 1)
    ok('state reports the hull rain (finite, above zero)', Number.isFinite(stateOf(st).rain) && stateOf(st).rain > 0)

    const st2 = makeGame(7, 'storm')
    for (let t = 0; t < 60 * 30; t++) step(st2, autoPad(st2))
    ok('mid-race the rain is SPATIAL — full behind the front, dry ahead', (() => {
        const fr = st2.front
        if (!fr || fr.prog < fr.band) return false
        return rainAt(st2, -fr.dx * fr.h, -fr.dz * fr.h) === 1 && rainAt(st2, fr.dx * fr.h, fr.dz * fr.h) < 0.05
    })())

    // drift isolation: throttle 0, speed 0 — only the wind can move the hull
    const wet = makeGame(7, 'storm')
    const c0 = wet.crafts[0]
    const x0 = c0.x, z0 = c0.z
    const wnd = windAt(wet)
    let bumped = false
    for (let t = 0; t < 90; t++) {
        step(wet, { throttle: 0, steer: 0, brake: false, a: false, b: false })
        if (wet.events.some((e) => e.type === 'bump')) bumped = true
    }
    const ddx = c0.x - x0, ddz = c0.z - z0
    const dl = Math.hypot(ddx, ddz)
    ok('the crosswind WALKS a stationary hull in the squall', !bumped && dl > 0.4 && dl < 4)
    ok('drift points along the wind, not somewhere random', dl > 0 && (ddx * wnd.x + ddz * wnd.z) / dl > 0.999)

    const dry = makeGame(7)
    const k0 = dry.crafts[0]
    const dx0 = k0.x, dz0 = k0.z
    for (let t = 0; t < 90; t++) step(dry, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    ok('dry water never shoves (exact zero)', k0.x === dx0 && k0.z === dz0)

    // the bite: wet terminal speed sits 5-15 % under dry; gusts vary, the law does not
    const vtDry = Math.sqrt(THRUST / DRAG), vtWet = Math.sqrt(THRUST / (DRAG + RAIN_DRAG))
    ok('rain drag bites top speed 5-15 %', vtWet / vtDry < 0.95 && vtWet / vtDry > 0.85)
    ok('push is a shove, not a gale (1-2.5 m/s at full rain)', RAIN_PUSH >= 1 && RAIN_PUSH <= 2.5)
    ok('gate-dim ceiling: aggressive but never invisible', RAIN_VIS > 0.5 && RAIN_VIS < 0.9)

    // band-edge events: a full storm race crosses the band on AND off
    const race = makeGame(7, 'storm')
    let onN = 0, offN = 0
    for (let t = 0; t < 60 * 240 && !race.done; t++) {
        step(race, autoPad(race))
        for (const e of race.events) if (e.type === 'rain') { if (e.on) onN++; else offN++ }
    }
    ok('the band edge announces itself (in AND out over a race)', onN >= 1 && offN >= 1)

    // DRAWN = RIDDEN: the shell dims gates by the rain at EACH gate and rates
    // its drops by the rain at Kai's hull (#3191)
    const jsx = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const artJs2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    ok('gates dim toward storm fog by rain at THEIR point', jsx.includes('buoyDim(b, RAIN_VIS * rainAt(gs, g0.x, g0.z))') && artJs2.includes('lerp(BUOY_DIM_COL'))
    ok('drop density follows the rain at MY hull (Kai offline, my ski online #3220)', jsx.includes('rainAt(gs, gs.crafts[mySeat()].x, gs.crafts[mySeat()].z)') && jsx.includes('rainVis > 0.3'))
    ok('the crossing gets a wind cue', jsx.includes("e.type === 'rain'") && jsx.includes('sfx.rain(e.on)'))
}

// --- moorings (#3159): the bay is lived-in --------------------------------------
// Seeded sloops + a bell buoy ride the DRAWN sea inside the bounds. Proof the
// sim stays blind to them: sim.js never mentions the props, and the shell rides
// them on the SAME mixWater/mixHeight/frontW path the gates use.
{
    const { RX, RZ } = await import('../src/games/TidalRush/sim.js')
    const { boatSpots } = await import('../src/games/TidalRush/art.js')
    const simJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/sim.js'), 'utf8')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    const spots = boatSpots(7)
    const jsx2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    ok('a fleet anchors the bay: three sloops + a bell buoy', spots.length === 4 && spots.filter((s) => !s.bell).length === 3 && spots.filter((s) => s.bell).length === 1)
    ok('one course seed, one anchorage (same seed ⇒ same spots)', JSON.stringify(boatSpots(7)) === JSON.stringify(spots) && JSON.stringify(boatSpots(52)) === JSON.stringify(boatSpots(52)))
    ok('the bay changes with the course (other seed ⇒ other spots)', JSON.stringify(boatSpots(52)) !== JSON.stringify(spots))
    ok('props sit INSIDE the gate ellipse — never on the race line', spots.every((s) => (s.x / RX) ** 2 + (s.z / RZ) ** 2 <= 0.85))
    ok('the bell buoy waits where the first gates carry the pack', (() => { const b = spots.find((s) => s.bell); return b && Math.hypot(b.x, b.z) > 20 })())
    ok('the sim never hears of the moorings (decorations cannot touch rules)', !/boatSpots|makeBoat|makeBellBuoy|mooring|scenery/i.test(simJs))
    ok('props ride the SAME sea the gates do (frontW + mixWater/mixHeight)', jsx2.includes('frontW(s.x, s.z, gs.front)') && jsx2.includes('mixWater(s.x, s.z, t, gs.seaCur, gs.seaTarget, wb)'))
    ok('props dim storm-side like the gates (#3191 language)', jsx2.includes('buoyDim(s.g, RAIN_VIS * rainAt(gs, s.x, s.z))'))
    ok('a new seed re-hitches the fleet in the shell', jsx2.includes('gs.course.seed !== moorSeed'))
    ok('the bell rings at the buoy, not on a timer (proximity + cooldown)', jsx2.includes('< 16)') && jsx2.includes('bellCool = 5'))
    ok('masts and bells are original flat-shaded shapes', artJs.includes('export function makeBoat') && artJs.includes('export function makeBellBuoy') && artJs.includes('flatShading: true'))
}

// --- gulls & shallows (#3218): the rung-1 tail moves -------------------------
// A seeded flock wheels over the anchorage and the outer bay carries beach
// caustics. Both are decoration — the sim stays blind — so the proof is the
// same shape as the moorings block: seed determinism, shell wiring, and a
// source pin on the shader terms.
{
    const { RX } = await import('../src/games/TidalRush/sim.js')
    const { gullSpots, makeGull, gullFrame } = await import('../src/games/TidalRush/art.js')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    const jsx2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const simJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/sim.js'), 'utf8')
    const f7 = gullSpots(7)
    ok('three gulls wheel over the anchorage, seeded by the course', f7.birds.length === 3 && JSON.stringify(gullSpots(7)) === JSON.stringify(f7) && JSON.stringify(gullSpots(52)) !== JSON.stringify(f7))
    ok('the flock keeps its infield — orbit stays clear of the gate ring', [f7, gullSpots(52)].every((f) => Math.hypot(f.cx, f.cz) + Math.max(...f.birds.map((b) => b.r)) < RX * 0.62))
    const gA = makeGull(); const gB = makeGull()
    gullFrame(gA, f7, f7.birds[0], 3.7)
    gullFrame(gB, f7, f7.birds[0], 3.7)
    ok('a bird at clock t sits where the flock says (frame is pure, airborne)', gA.position.equals(gB.position) && gA.position.y > 4)
    ok('the shell flies the flock on the LIVE clock (everything moves)', jsx2.includes('gullFrame(gm, flock, bird, t)'))
    ok('a new course seed re-hitches the flock with the fleet', jsx2.includes('flock = gullSpots(moorSeed)'))
    ok('the sim never sees the birds (decoration cannot touch rules)', !/gull|gullSpots|gullFrame/i.test(simJs))
    ok('gulls are original flat-shaded shapes', artJs.includes('export function makeGull') && artJs.includes('const tip = new THREE.MeshStandardMaterial') && artJs.includes('flatShading: true'))
    // beach caustics: shimmer keyed to the outer bay, storm-swallowed, and the
    // shader divisor must track the mesh span so a resize trips the gate.
    const sizeM = artJs.match(/const SIZE = (\d+)/)
    ok('the shallows shimmer: caustics keyed to distance from the bay mouth', artJs.includes('float shoreK = length(vWorld.xz) /') && artJs.includes('pow(csA * csB, 2.5) * shallow'))
    ok('the caustic ring tracks the mesh span (divisor = SIZE/2)', sizeM !== null && artJs.includes(`/ ${Number(sizeM[1]) / 2}.0`))
    ok('storm water swallows the shimmer', artJs.includes('shallow * (1.0 - uStorm * 0.85)'))
    // the flat 360 lands with air in it: sfx.trick carries a whoosh sweep.
    ok('the flat-360 landing carries a whoosh-in', /trick: \(\) => \{ audioController\.playSweep\(/.test(jsx2))
}

// --- online rooms (#3220): wire semantics, lockstep parity, takeover ----------
{
    const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
    const jsxNet = readFileSync(join(HERE, 'src/games/TidalRush/index.jsx'), 'utf8')
    const jsxSrc = readFileSync(join(HERE, 'src/utils/lobby.js'), 'utf8')
    const roomSrc = readFileSync(join(HERE, 'src/utils/room.js'), 'utf8')
    const { SEATS, PAD_DELAY, HASH_EVERY, HOLD_MS, toWire, fromWire, assembleSeatPads, createEvidence, EVIDENCE_LIMIT, hex32, podiumRows, podWire, podRows } = await import('../src/games/TidalRush/net.js')
    const { createLockStep } = await import('../src/utils/lockstep.js')

    // --- desync evidence (#3244 item 5): the ring + the copyable block ------
    {
        const ev = createEvidence(8)
        for (let i = 1; i <= 12; i++) { ev.mine(i * 30, 0x1000 + i); ev.peer(i * 30, 0x1000 + i, 1) }
        ok('evidence ring keeps the LAST 8 boundaries, oldest first',
            EVIDENCE_LIMIT === 8 && ev.rows.length === 8 && ev.rows[0].k === 150 && ev.rows[7].k === 360)
        const clean = ev.text('R1CK', 0)
        ok('an honest block reports room, seat, tick columns — and no mismatch',
            clean.includes('room R1CK') && clean.includes('tick') && clean.includes('seat1') && !clean.includes('MISMATCH'))
        ev.markBad(360, 1, 0x1008, 0xdeadbeef)
        const bad = ev.text('R1CK', 0)
        ok('the diverged row names the tick, the culprit seat and BOTH hashes in hex',
            /MISMATCH seat1/.test(bad) && bad.includes(hex32(0x1008)) && bad.includes('DEADBEEF'))
    }

    ok('the room seats three — KAI MAKO TUNDRA', SEATS === 3)
    ok('the wire carries six bits, and full-lock survives it exactly (the BARREL input)',
        JSON.stringify(toWire({ throttle: 1, steer: 0.8, brake: true, a: true, b: true })) === JSON.stringify({ l: false, r: true, u: true, d: true, a: true, s: true })
        && fromWire({ l: true, r: false, u: false, d: false, a: false, s: false }).steer === -1)
    ok('a half-commit quantises (steer 0.4 is not a lean on the wire)',
        fromWire(toWire({ throttle: 1, steer: 0.4, brake: false, a: false, b: false })).steer === 0)
    ok('hull 0 rides its wire bytes, never local analog (the divergence trap)',
        jsxNet.includes('fromWire(mirrors[0].get(k) || toWire({}))') && !/step\(gs, readPad\(\)/.test(jsxNet))
    ok('received pads are stamped by seat and fed to the referee',
        jsxNet.includes('if (mirrors[s]) mirrors[s].set(m.k | 0, m.p)') && jsxNet.includes('ls.gotPad(m.k | 0, m.p, s)'))
    ok('both referee paths stamp the evidence BEFORE the banner (hash + gotHash, #3244)',
        jsxNet.includes('evidence.markBad(k, evidence.mismatchSlot(k), r.mine, r.theirs)')
        && jsxNet.includes('evidence.markBad(m.k | 0, m.s | 0, r.mine, r.theirs)'))
    ok('the freeze screen paints the copyable report; a new race wipes it (#3244 item 5)',
        jsxNet.includes('COPY REPORT') && jsxNet.includes('setNetReport(evidence.text(net.code, mySeat()))')
        && jsxNet.includes('evidence.reset()'))
    ok('the bay pauses offline only — a live room never starves the pad stream',
        jsxNet.includes("screenRef.current === 'play' && !net.racing"))

    // --- human seats in the sim -------------------------------------------------
    const SEED = 0x5eed01
    const NEUTRAL = () => ({ throttle: 0, steer: 0, brake: false, a: false, b: false })
    const soloRun = (humans, late) => {
        const gs = makeGame(SEED, 'sunny')
        gs.crafts.forEach((c, i) => { c.human = humans.includes(i) })
        for (let k = 0; k < 600; k++) {
            const seatPads = humans.includes(1)
                ? { 1: k > 120 ? { throttle: 1, steer: 0, brake: false, a: false, b: false } : NEUTRAL() }
                : {}
            step(gs, { throttle: 1, steer: 0, brake: false, a: false, b: false }, seatPads)
        }
        return gs
    }
    const cpuAll = soloRun([], false)
    const h1a = soloRun([1], true), h1b = soloRun([1], true)
    ok('the human-seat path is deterministic (same seed, same pads, same hash)',
        stateHash(h1a) === stateHash(h1b))
    ok('a seat on empty pads coasts — it never flies itself',
        h1a.crafts[1].progress < cpuAll.crafts[1].progress - 5)
    ok('a human seat skips the autopilot rng draw (streams stay room-wide)',
        h1a.rngS !== cpuAll.rngS && h1a.tick === cpuAll.tick)

    // --- two boxes, one sea ------------------------------------------------------
    const makeBox = (seat, humans, padOf) => {
        const gs = makeGame(SEED, 'storm')
        gs.crafts.forEach((c, i) => { c.human = humans.includes(i) })
        const mirrors = [new Map(), new Map(), new Map()]
        const box = { seat, gs, mirrors, hashes: [], desync: false, alone: false, dead: false, sibs: [], ev: createEvidence() }
        box.ls = createLockStep({
            delay: PAD_DELAY, hashEvery: HASH_EVERY,
            // mirrors the room layer: every frame gets the sender's seat stamp.
            send: (m) => { if (m.t === 'pad') box.mirrors[seat].set(m.k, m.p); for (const b of box.sibs) if (!b.dead) b.onMsg(Object.assign({}, m, { s: seat })) },
        })
        box.ls.setPeers(humans.filter((s) => s !== seat))
        box.onMsg = (m) => {
            if (box.dead) return
            if (m.t === 'pad') { box.mirrors[m.s].set(m.k, m.p); if (m.s !== seat) box.ls.gotPad(m.k, m.p, m.s) }
            else if (m.t === 'hs') {
                const r = box.ls.gotHash(m.k, m.h, m.s)
                if (!box.desync) box.ev.peer(m.k, m.h, m.s)
                if (r && r.desync !== undefined) { if (!box.desync) box.ev.markBad(m.k, m.s, r.mine, r.theirs); box.desync = true }
            }
        }
        box.stepOnce = () => {
            if (box.dead) return false
            const k = gs.tick
            box.ls.pumpTo(k + PAD_DELAY, () => toWire(padOf(k)))
            if (!box.alone && !box.ls.ready(k)) return false
            const padIn = fromWire(box.mirrors[0].get(k) || toWire({}))
            step(gs, padIn, assembleSeatPads(box.mirrors, k, humans))
            if (!box.alone && k % HASH_EVERY === 0) {
                const h = stateHash(gs)
                box.hashes.push(h)
                box.ev.mine(k, h)
                const r = box.ls.hash(k, h)
                if (r && r.desync !== undefined) { if (!box.desync) box.ev.markBad(k, box.ev.mismatchSlot(k), r.mine, r.theirs); box.desync = true }
            }
            return true
        }
        return box
    }
    const wig = (ph, amp) => (k) => ({ throttle: 1, steer: Math.sin(k / 15 + ph) > 0 ? amp : -amp * 0.7, brake: false, a: false, b: false })

    const pairUp = (arr) => { arr.forEach((b) => { b.sibs = arr.filter((x) => x !== b) }) }
    const runTo = (arr, target, hook = null) => {
        for (let guard = 0; guard < 12000 && arr.some((b) => b.gs.tick < target); guard++) {
            for (const b of arr) b.stepOnce()
            if (hook) hook(arr)
        }
    }
    const sameHashes = (arr) => {
        const n = Math.min(...arr.map((b) => b.hashes.length))
        return n >= 15 && arr.every((b) => b.hashes.slice(0, n).join(',') === arr[0].hashes.slice(0, n).join(','))
    }
    const b1 = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(b1)
    runTo(b1, 600)
    ok('two boxes, two riders: hashes agree at every boundary — the room rides ONE sea',
        sameHashes(b1))
    ok('neither box declared a desync on the honest run', !b1[0].desync && !b1[1].desync)
    ok('the pad streams ran ahead of the sim (sampling delay live)', b1[0].gs.tick + PAD_DELAY > 600 - 1)

    // the referee bites: a box that cheats the sea gets frozen, not shuffled.
    const b2 = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(b2)
    runTo(b2, 330, (arr) => { if (arr[0].gs.tick === 210) arr[1].gs.crafts[1].x += 1 })
    ok('a perturbed box IS caught — the hash referee reports desync, both sides',
        b2[0].desync && b2[1].desync)

    // #3244 item 5: the freeze must carry receipts, on every box.
    const ev2 = [b2[0].ev.text('TST', 0), b2[1].ev.text('TST', 1)]
    ok('#3244: the frozen boundary is on the report on BOTH boxes, each blaming the other',
        /MISMATCH seat1/.test(ev2[0]) && /MISMATCH seat0/.test(ev2[1]))
    const bad0 = b2[0].ev.rows.find((e) => e.bad)
    ok('#3244: the report carries the tick and both sides\' 8-hex hashes (copyable proof)',
        !!bad0 && bad0.mine !== bad0.theirs
        && ev2[0].includes(String(bad0.k)) && ev2[0].includes(hex32(bad0.mine)) && ev2[0].includes(hex32(bad0.theirs)))
    ok('#3244: an honest room fills the ring but shows no MISMATCH line',
        b1[0].ev.rows.length > 0 && !/MISMATCH/.test(b1[0].ev.text('TST', 0)))

    // three-hull room: host + two wire riders, autopilot fills nothing.
    const b3 = [makeBox(0, [0, 1, 2], wig(0, 0.9)), makeBox(1, [0, 1, 2], wig(2.1, 0.8)), makeBox(2, [0, 1, 2], wig(4.2, 0.75))]
    pairUp(b3)
    runTo(b3, 600)
    ok('a three-rider room is one world — all three hash-equal, no desync',
        sameHashes(b3) && !b3.some((b) => b.desync))

    // dropout: the guest goes silent; the host re-freezes the roster, takes the
    // open seat back on the autopilot, and finishes the race (never a stall).
    const bd = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(bd)
    for (let guard = 0; guard < 4000 && bd[0].gs.tick < 240; guard++) for (const b of bd) b.stepOnce()
    const tickAtDrop = bd[0].gs.tick
    bd[1].dead = true
    // — the component's seatGone: roster minus the gone seat, peers re-frozen,
    //   the orphan hull handed back to the seeded autopilot (the survivor is
    //   the authority: no hash peer left to disagree with).
    bd[0].gs.crafts[1].human = false
    bd[0].ls.setPeers([])
    bd[0].alone = true
    for (let g2 = 0; g2 < 300 && bd[0].gs.tick < tickAtDrop + 180; g2++) bd[0].stepOnce()
    ok('takeover: the race keeps ticking after a dropout (no silent stall)',
        bd[0].gs.tick >= tickAtDrop + 150)
    ok('takeover: the abandoned ski flies the autopilot again',
        bd[0].gs.crafts[1].speed > 5)

    // #3244 item 3 — survivable rejoin: rider 1's socket dies mid-race; the
    // field HOLDS (lockstep stalls both seas at the same tick). The flapper's
    // pads replayed past the stall tick reopen the gate — the race continues
    // with their hull back, hashes never break. The component's hold/replay
    // bookkeeping is mirrored here (net.js exports the window so both sides
    // read the same constant).
    const br = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(br)
    for (let guard = 0; guard < 4000 && br[0].gs.tick < 240; guard++) for (const b of br) b.stepOnce()
    const stallAt = br[0].gs.tick
    br[0].sibs = []; br[1].sibs = []            // the socket dies: nothing rides either way
    const hold = { seats: new Set([1]) }       // host enters hold (the component's seatGone)
    for (let g2 = 0; g2 < 120; g2++) for (const b of br) b.stepOnce()
    const stallH = br[0].gs.tick, stallG = br[1].gs.tick
    ok('hold: the stalled window ticks nowhere — the field waits, it never coasts silently',
        br[0].gs.tick === stallH && br[1].gs.tick === stallG)
    // rejoin: the wire re-opens; each box replays its pads from the stalled
    // tick up — the stalled tick's own pad never crossed the dead wire, and
    // late pads are harmless under the absolute-stream law (a tick only runs
    // when every byte for it is in). Host's hold sees the flapper's pad at the
    // stalled tick and lets go; replays chain the field back to life.
    br[0].sibs = [br[1]]; br[1].sibs = [br[0]]
    // replay window: ±(PAD_DELAY+1) around each box's tick — a peer that ran on
    // buffered pads lags that far, and its gate waits on the ticks I spent.
    for (const [k, p] of br[1].mirrors[1]) if (k >= stallG - PAD_DELAY - 1 && k <= stallG + PAD_DELAY) br[0].onMsg({ t: 'pad', s: 1, k, p })
    for (let g2 = 0; g2 < 4000 && br[0].gs.tick < stallAt + 240; g2++) {
        if (hold.seats.size && br[0].mirrors[1].has(br[0].gs.tick)) {
            hold.seats.clear()
            for (const [k, p] of br[0].mirrors[0]) if (k >= br[0].gs.tick - PAD_DELAY - 1 && k <= br[0].gs.tick + PAD_DELAY) br[1].onMsg({ t: 'pad', s: 0, k, p })
        }
        for (const b of br) b.stepOnce()
    }
    ok('rejoin: the race resumes past the stall for BOTH boxes — no takeover, no coasting',
        br[0].gs.tick >= stallAt + 200 && br[1].gs.tick >= stallAt + 200 && !hold.seats.size)
    ok('rejoin: the room hashes still agree at every boundary — the sea never split',
        sameHashes(br) && !br[0].desync && !br[1].desync)
    ok('the component holds before it coasts (net.js window, the takeover body, the rejoin)',
        HOLD_MS === 8000 && jsxNet.includes("netSay('RIDER DOWN — HOLDING FOR THEM')")
        && jsxNet.includes("netSay('RIDER BACK — GO')") && jsxNet.includes('const seatLost = (seat) =>')
        && jsxNet.includes("netSay('SIGNAL LOST — RECONNECTING…')") && jsxNet.includes("netSay('RE-SYNCED — BACK IN THE RACE')")
        && jsxNet.includes("net.room.send('pad', { k, p })")
        && jsxSrc.includes('opts.onDrop') && roomSrc.includes('opts.onDrop({ slot: room.yourSlot })'))

    // --- #3244 item 4: the room finish — podium sheet + rematch wire ---------
    {
        const gsF = makeGame(SEED, 'sunny')
        for (let g = 0; g < 40000 && !gsF.crafts.every((c) => c.finished); g++) step(gsF, autoPad(gsF))
        ok('a CPU field finishes the bay — there is a podium to share',
            gsF.crafts.every((c) => c.finished))
        const rowsF = podiumRows(gsF, [1])
        ok('the podium ranks swift-course-first and marks who actually rode (seat 1 here)',
            rowsF.length === 3 && rowsF[0].t <= rowsF[1].t && rowsF[1].t <= rowsF[2].t
            && rowsF.some((r) => r.seat === 1 && r.human) && rowsF.filter((r) => r.human).length === 1
            && rowsF.every((r) => Number.isFinite(r.score) && r.score > 0))
        const back = podRows(podWire(rowsF), ['KAI', 'MAKO', 'TUNDRA'])
        ok('the pod wire round-trips seat/time/score/rider — the host answers the room',
            back.length === 3 && back.every((r, i) => r.seat === rowsF[i].seat && r.rank === i + 1
                && Math.abs(r.t - rowsF[i].t) <= 0.05 && r.human === rowsF[i].human
                && r.name === ['KAI', 'MAKO', 'TUNDRA'][rowsF[i].seat]
                && r.score === Math.round(rowsF[i].score)))
        const gsF2 = makeGame(SEED, 'sunny')
        for (let g = 0; g < 40000 && !gsF2.crafts.every((c) => c.finished); g++) step(gsF2, autoPad(gsF2))
        ok('two boxes, one sea — the podium agrees to the tenth from the same seed',
            JSON.stringify(podiumRows(gsF2, [1])) === JSON.stringify(rowsF))
    }
    ok('the host answers the line with a pod broadcast, and the guest reads it (#3244)',
        jsxNet.includes("net.room.send('pod', { rows: podWire(net.podium) })") && jsxNet.includes("pod: (m) =>"))
    ok('the podium paints the room sheet with the rematch call; a new race wipes it (#3244)',
        jsxNet.includes('ROOM PODIUM') && jsxNet.includes('GO AGAIN') && jsxNet.includes('net.podium = null'))
    ok('from the podium one key re-races the room on a fresh seed — no code re-entry (#3244)',
        /if \(screenRef\.current === 'over' && net\.role !== 'host'\) \{ endToMenu\(\); return \}/.test(jsxNet)
        && (jsxNet.match(/net\.lobby\.start\(\{ seed: hostSeed\(\), bay: bayRef\.current, humans:/g) || []).length >= 2)

    // --- spectate (#3244 item 2) ---------------------------------------------
    const { padToByte, padFromByte, createHist, inflateSh, WATCH_CAP, SEATS: S } = await import('../src/games/TidalRush/net.js')
    let rt = true
    for (let b = 0; b < 256; b++) {
        if (b & 0x40) continue // bit6 is unused — only 6 pad bits + presence exist
        const p = padFromByte(b); if (padToByte(p) !== (b & 0x80 ? b : 0)) rt = false
    }
    ok('pad byte pack/unpack round-trips every bit pattern (presence bit honest)', rt)

    const hm = [new Map(), new Map(), new Map()]
    hm[0].set(5, { l: true, r: false, u: true, d: false, a: false, s: true })
    hm[2].set(5, { l: false, r: true, u: false, d: true, a: true, s: false })
    hm[1].set(9, { l: false, r: false, u: true, d: false, a: false, s: false })
    const hist = createHist()
    for (let k = 0; k < 300; k++) hist.record(k, hm)
    const chunks = hist.chunks()
    const wm = [new Map(), new Map(), new Map()]
    for (const c of chunks) inflateSh(c, wm)
    ok('history chunks re-inflate mirrors exactly (mid-race join has the whole past)',
        wm[0].get(5).l === true && wm[0].get(5).u === true && wm[0].get(5).s === true && wm[0].get(5).r === false
        && wm[2].get(5).r === true && wm[2].get(5).d === true && wm[1].get(9).u === true && !wm[0].has(6)
        && chunks.every((c) => c.hex.length <= 512 - 40))
    ok('the watch seat exists (cap = seats + 1, relay cap 4)', WATCH_CAP === 4 && S === 3)

    // a watcher box: same seed, host's ring replayed, then the live wire.
    const WSEED = 0x5eed01
    const w = { gs: makeGame(WSEED, 'storm'), mirrors: [new Map(), new Map(), new Map()], hashes: [] }
    w.gs.crafts.forEach((c, i) => { c.human = [0, 1].includes(i) })
    const wStep = () => {
        const k = w.gs.tick
        if (![0, 1].every((s) => w.mirrors[s].has(k))) return false
        step(w.gs, fromWire(w.mirrors[0].get(k) || toWire({})), assembleSeatPads(w.mirrors, k, [0, 1]))
        if (k % HASH_EVERY === 0) w.hashes.push(stateHash(w.gs))
        return true
    }
    const sbx = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    sbx[0].hist = createHist()
    const step0 = sbx[0].stepOnce
    sbx[0].stepOnce = () => { const k = sbx[0].gs.tick; const r = step0.call(sbx[0]); if (r) sbx[0].hist.record(k, sbx[0].mirrors); return r }
    pairUp(sbx)
    runTo(sbx, 320)
    // mid-race join: sv0 + history chunks, then fast-forward the deterministic
    // sim to the live tick — and from here the live wire carries the race.
    const sv0 = { seed: sbx[0].gs.seed, bay: sbx[0].gs.stage, k: sbx[0].gs.tick, humans: [0, 1] }
    sbx[0].hist.chunks().forEach((c) => inflateSh(c, w.mirrors))
    for (let k = 0; k < sv0.k; k++) wStep()
    ok('the watcher joined mid-race and caught the field (fast-forward ran)',
        w.gs.tick === sv0.k && w.gs.tick > 300)
    sbx.forEach((b) => { const om = b.onMsg; b.onMsg = (m) => { om(m); if (m.t === 'pad') w.mirrors[m.s].set(m.k, m.p) } })
    runTo(sbx, 900, () => wStep())
    ok('spectator rides the SAME sea: hashes bit-identical to the riders through replay + pad buffer',
        (() => {
            const n = Math.min(w.hashes.length, sbx[0].hashes.length)
            return n >= 10 && w.hashes.slice(0, n).join(',') === sbx[0].hashes.slice(0, n).join(',')
        })())
    ok('the pump-window ring leaves no hole at the join tick (pads k..k+D ride sv0)',
        (() => {
            const fresh = [new Map(), new Map(), new Map()]
            sbx[0].hist.chunks().forEach((c) => inflateSh(c, fresh))
            return [0, 1].every((s) => fresh[s].has(sv0.k))
        })())
    ok('watchers are excluded from the field at kickoff (host roster law in the cabinet)',
        jsxNet.includes("s < SEATS && !net.watchers.has(s)") && jsxNet.includes("net.room.send('spec', {})") && jsxNet.includes("net.room.send('sv0'"))
    ok('the relay forwards the spectate wire (spec/sv0/sh allowlisted)',
        /'spec', 'sv0', 'sh'/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../relay/core.js'), 'utf8')))
}

// ── 19. WAKE (#3337) — the foam V is art-side law: additive-only (the wake
// can ADD light to the bay, never stain it), V-arms brighter than the fill,
// foam fading + cooling with age, hot with speed, twinkle along the trail,
// spread growing, buffers deterministic (no Math.random downstream). ────────
{
    const THREE = await import('three')
    const { makeWake, wakePush, wakeStep, wakeSpray } = await import('../src/games/TidalRush/art.js')
    const crestA = (w, i) => w.geo.attributes.color.array[(i * 5) * 4 + 3]
    const fillA = (w, i) => w.geo.attributes.color.array[(i * 5 + 2) * 4 + 3]
    const crestR = (w, i) => w.geo.attributes.color.array[(i * 5) * 4]

    // additive-only law: BOTH ribbons add light; depth stays with the sea
    const wk0 = makeWake(8)
    ok('both wake ribbons are additive and depth-write-free — the trail can never darken the bay (#3337)',
        wk0.mat.blending === THREE.AdditiveBlending && wk0.glowMat.blending === THREE.AdditiveBlending &&
        wk0.mat.depthWrite === false && wk0.glowMat.depthWrite === false)

    // V shape: every live section has crests strictly hotter than the fill
    const wk = makeWake(16)
    for (let i = 0; i < 6; i++) wakePush(wk, i * 0.7, 0.6, -i * 0.4, 0.3, 1.6)
    wakeStep(wk, 1 / 60)
    ok('foam V: every section paints its two crests hotter than the calm fill between them',
        (() => {
            const m = wk.pts.length
            for (let i = 0; i < m; i++) if (!(crestA(wk, i) > fillA(wk, i) * 1.9)) return false
            return m >= 6
        })())

    // #3342 crest emphasis: the chase cam looks down the trail at a shallow
    // angle, so the cross-section compresses to pixels — the arms only resolve
    // if the shoulder falls off HARD. 0.34 read as one band; 0.22 must stay.
    const shA = (w, i) => w.geo.attributes.color.array[(i * 5 + 1) * 4 + 3]
    ok('crest emphasis: every shoulder sits at or below ¼ of its section crest alpha (#3342)',
        (() => {
            const m = wk.pts.length
            for (let i = 0; i < m; i++) if (!(crestA(wk, i) >= shA(wk, i) * 4)) return false
            return m >= 6
        })())

    // age fade with twinkle-cancelled sampling: 1 tick vs 55 ticks on the
    // same point (tw nearly identical at those ages) — real foam dies.
    const fa = makeWake(8); const fb = makeWake(8)
    wakePush(fa, 0, 0.6, 0, 0, 1.6); wakePush(fb, 0, 0.6, 0, 0, 1.6)
    wakeStep(fa, 1 / 60)
    for (let i = 0; i < 55; i++) wakeStep(fb, 1 / 60)
    ok('age law: crest alpha at ~0.9 s is under 55 % of its fresh value (foam dies, it doesn\'t sit there)',
        crestA(fa, 0) > 1.8 * crestA(fb, 0) && crestA(fb, 0) > 0)
    ok('cooling law: the crest hue drifts toward cyan as the bubbles die (b stays hot)',
        (() => {
            const rF = crestR(fa, 0), rO = crestR(fb, 0)
            const bb = wkc => wkc.geo.attributes.color.array[(0 * 5) * 4 + 2]
            return rF > rO + 0.05 && bb(fb) >= rO
        })())
    ok('spread law: the V arms are wider at ~0.9 s than at birth (the wake opens)',
        (() => {
            const sep = (w) => Math.hypot(
                w.geo.attributes.position.array[0] - w.geo.attributes.position.array[12],
                w.geo.attributes.position.array[2] - w.geo.attributes.position.array[14])
            return sep(fb) > 1.8 * sep(fa)
        })())

    // speed-hot: at one age, the fast hull's crest is brighter than the slow one's
    const sl = makeWake(8); const fs = makeWake(8)
    wakePush(sl, 0, 0.6, 0, 0, 0.6); wakePush(fs, 0, 0.6, 0, 0, 2.6)
    wakeStep(sl, 1 / 60); wakeStep(fs, 1 / 60)
    ok('speed law: a hot hull drags a hotter trail than a slow one at equal age',
        crestA(fs, 0) > crestA(sl, 0) * 1.2)

    // twinkle: equal pushes, one age — brightness varies ALONG the trail
    const tk = makeWake(16)
    for (let i = 0; i < 8; i++) wakePush(tk, i, 0.6, 0, 0, 1.6)
    wakeStep(tk, 1 / 60)
    ok('twinkle law: crest brightness varies along the trail (no flat-shaded band)',
        (() => {
            const as = []
            for (let i = 0; i < 8; i++) as.push(crestA(tk, i))
            return Math.max(...as) - Math.min(...as) > 0.02
        })())

    // determinism: same pushes + same steps ⇒ byte-identical buffers
    const d1 = makeWake(16); const d2 = makeWake(16)
    for (let i = 0; i < 10; i++) {
        wakePush(d1, i * 0.5, 0.6, -i * 0.3, i * 0.2, 1.4)
        wakePush(d2, i * 0.5, 0.6, -i * 0.3, i * 0.2, 1.4)
        wakeStep(d1, 1 / 60); wakeStep(d2, 1 / 60)
    }
    ok('wake geometry is deterministic (identical streams, identical bytes — no Math.random downstream)',
        (() => {
            const pick = (w) => [w.geo.attributes.position.array, w.geo.attributes.color.array,
                w.glowGeo.attributes.position.array, w.glowGeo.attributes.color.array].map((a) => a.join(','))
            return pick(d1).join('|') === pick(d2).join('|')
        })())

    // #3342 — the quiet channel is law for the SPRAY too: long-life wake foam
    // spawns off-centre (on the V arms, width·0.24) and alternates sides. The
    // arm toggle is pool math, so placement is deterministic; only the churn
    // jitter stays random — |offset| 0.41 m vs jitter ≤0.24 m, sign never flips.
    ok('wake spray rides the arms, never the centreline, and alternates sides (#3342)',
        (() => {
            const sp = { pos: new Float32Array(4 * 3), life: new Float32Array(4), vel: new Float32Array(4 * 3), wake: new Float32Array(4), n: 4, cursor: 0, arm: 1 }
            let side = 0
            for (let i = 0; i < 8; i++) {
                const hd = 0.6 + i * 0.2
                wakeSpray(sp, 10, 0.05, -4, hd, 1.7)
                const j = (sp.cursor + sp.n - 1) % sp.n // slot just filled
                if (sp.wake[j] !== 1 || sp.life[j] <= 0) return false
                const px = Math.cos(hd), pz = -Math.sin(hd)
                const lat = (sp.pos[j * 3] - 10) * px + (sp.pos[j * 3 + 2] + 4) * pz
                if (Math.abs(lat) < 0.15) return false
                if (side !== 0 && Math.sign(lat) === side) return false
                side = Math.sign(lat)
            }
            return true
        })())

    // and the cabinet actually uses it: no raw centreline wake stitch may return.
    ok('the cabinet stitches wake foam through wakeSpray — the centreline call is gone (#3342)',
        (() => {
            const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'TidalRush', 'index.jsx'), 'utf8')
            return /wakeSpray\(spray, sternX/.test(src) && !/spraySpawn\(spray, sternX,[^)]*, true\)/.test(src)
        })())

    // ring law: pts trim to n; drawRange tracks live sections (12 tris per
    // foam-V section, 6 per glow quad-row)
    const rg = makeWake(8)
    ok('empty wake draws nothing', rg.geo.drawRange.count === 0 && rg.glowGeo.drawRange.count === 0)
    for (let i = 0; i < 12; i++) wakePush(rg, i, 0.6, 0, 0, 1.6)
    wakeStep(rg, 1 / 60)
    ok('ring + drawRange law: pts trim to n, bright counts 24 per section, glow 6',
        rg.pts.length === 8 && rg.geo.drawRange.count === (8 - 1) * 24 && rg.glowGeo.drawRange.count === (8 - 1) * 6)
}

console.log(`\ntidalcheck: ${pass}/${pass + fail} ${fail ? 'FAILURES' : 'ok'}${MUT ? ` (mutant: ${MUT})` : ''}`)
if (MUT) {
    console.log(fail ? 'mutant caught — the check CAN fail' : `MUTANT SURVIVED (${MUT}) — check is blind`)
}
restoreAll()
process.exit(MUT ? (fail ? 0 : 1) : (fail ? 1 : 0))
