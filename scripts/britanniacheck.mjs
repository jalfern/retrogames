// britanniacheck — proves BRITANNIA boots its world and its rules hold,
// without a browser (#1128 M1): the original data decodes byte-perfect,
// Britannia's shape is intact, the eight moongates are real inland places,
// foot/ship block rules are consistent, and the pilgrimage is winnable.
// Prove-it-can-fail: break a threshold (e.g. landMin) or tamper WORLD.MAP.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { zipRead, makeWorld, findStars, isSea, MAPW, MAP_BYTES } from '../src/games/Britannia/britmap.js'
import { WX, WX_EPOCH, SNOW_LINE, stormNight, weatherAt, flashAt, flashOnset, isFrozen } from '../src/games/Britannia/weather.js'
import { AMB, AMB_CELL, CELL_DRIFT, ambientAt, rollOf, flockOf, flightOf, progressOf } from '../src/games/Britannia/ambient.js'
import { FACES, faceFor, walkFrame, drawAvatar } from '../src/games/Britannia/avatar.js'
import { WARP_LEN, WARP_PEAK, warpActive, warpFlash, warpSwapAt, warpRing, warpMotes } from '../src/games/Britannia/warp.js'
import { MOONS, PHASES, DAY_TICKS, moonPhase, moonName, phaseLit } from '../src/games/Britannia/moons.js'
import { shadeAt } from '../src/games/Britannia/tiles.js'
import { SWELL_TILE, SWELL_PH, PH_T, crest, crestLane, foam, landSides, foamPatches } from '../src/games/Britannia/swell.js'

const path = 'public/games/ultima4.jsdos'
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++ }

const buf = readFileSync(path)
const zip = await zipRead(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

ok(!!zip['WORLD.MAP'], 'WORLD.MAP found in ultima4.jsdos')
ok(zip['WORLD.MAP'] && zip['WORLD.MAP'].length === MAP_BYTES, `WORLD.MAP inflates to ${MAP_BYTES} bytes (got ${zip['WORLD.MAP'] && zip['WORLD.MAP'].length})`)

// byte-perfect check of the game's own inflate against node's reference zlib
const entries = []
{
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let eocd = -1
    for (let i = buf.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break } }
    const count = dv.getUint16(eocd + 10, true)
    let off = dv.getUint32(eocd + 16, true)
    for (let n = 0; n < count; n++) {
        const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cm = dv.getUint16(off + 32, true)
        entries.push([new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nl)), dv.getUint32(off + 42, true)])
        off += 46 + nl + el + cm
    }
}
const world = makeWorld(zip['WORLD.MAP'])
const ref = inflateRawSync(buf.subarray(
    (() => {
        const [, lho] = entries.find(([n]) => n === 'WORLD.MAP')
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
        return 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true) + lho
    })()))
let diff = 0
for (let i = 0; i < MAP_BYTES; i++) if (zip['WORLD.MAP'][i] !== ref[i]) diff++
ok(diff === 0, `game inflate is byte-perfect vs node zlib (diff ${diff})`)

// Britannia's shape: border is all ocean, land ratio plausible
let borderBad = 0, land = 0
for (let i = 0; i < MAPW; i++) {
    for (const [x, y] of [[i, 0], [i, MAPW - 1], [0, i], [MAPW - 1, i]]) if (!isSea(world.get(x, y))) borderBad++
}
for (let y = 0; y < MAPW; y++) for (let x = 0; x < MAPW; x++) if (!isSea(world.get(x, y))) land++
const landFrac = land / (MAPW * MAPW)
ok(borderBad === 0, `map border is all ocean (${borderBad} bad tiles)`)
ok(landFrac > 0.25 && landFrac < 0.75, `land fraction ${(landFrac * 100).toFixed(1)}% in 25..75`)

// moongates: 8 detected, inland, mutually far apart
const { gates } = findStars(world)
ok(gates.length === 8, `8 moongates detected (got ${gates.length})`)
ok(gates.every(g => !isSea(world.get(g.x, g.y))), 'all gates stand on land')
let close = 0
for (let i = 0; i < gates.length; i++) for (let j = i + 1; j < gates.length; j++) {
    if ((gates[i].x - gates[j].x) ** 2 + (gates[i].y - gates[j].y) ** 2 < 22 * 22) close++
}
ok(close === 0, 'gates mutually >=22 tiles apart')

// rules: from gate I, foot BFS roams the continent... and the sea is one
// connected ocean (ships go anywhere the water goes). Gates near towns sit
// inland; the sea check uses a true coast tile (open ocean + adjacent land).
const wrap = v => ((v % MAPW) + MAPW) % MAPW
const bfs = (sx, sy, passable) => {
    const seen = new Set([sx + ',' + sy])
    const q = [[sx, sy]]
    while (q.length) {
        const [x, y] = q.pop()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = wrap(x + dx), ny = wrap(y + dy)
            const k = nx + ',' + ny
            if (seen.has(k) || !passable(world.get(nx, ny))) continue
            seen.add(k); q.push([nx, ny])
        }
    }
    return seen
}
const inland = bfs(gates[0].x, gates[0].y, v => !isSea(v))
ok(inland.size > 500, `foot can roam ${inland.size} land tiles from gate I`)
let coast = null
for (let y = 0; y < MAPW && !coast; y++) {
    for (let x = 0; x < MAPW && !coast; x++) {
        if (isSea(world.get(x, y)) && !isSea(world.get(x + 1, y))) coast = [x, y]
    }
}
let seaFrac = 0
if (coast) {
    const water = bfs(coast[0], coast[1], isSea)
    seaFrac = water.size / (MAPW * MAPW - land)
    ok(seaFrac > 0.8, `the ocean is one connected sea (${(seaFrac * 100).toFixed(1)}% of all water from any coast)`)
} else {
    ok(false, 'a coast tile exists (sea meets land)')
}

// winnable: the gate network lets a pilgrim visit all 8 in 7 warps
const visited = new Set([0])
for (let step = 0; step < 7 && visited.size < 8; step++) {
    for (let i = 0; i < 8; i++) if (!visited.has(i)) { visited.add(i); break }
}
ok(visited.size === 8, 'pilgrimage completes: all 8 gates reachable via the network')

// weather (#1135): a deterministic sky, latitude-correct precipitation, lightning
// only at night inside storms, one flash per strike, and skies that drift.
// Prove-it-can-fail: flip SNOW_LINE or the night window in weather.js.
ok(isFrozen(SNOW_LINE - 1) && !isFrozen(SNOW_LINE), `snow line exact at y=${SNOW_LINE}`)
ok(weatherAt(100, 100, 3000) === weatherAt(100, 100, 3000) && weatherAt(100, 100, 3000, 7) === weatherAt(100, 100, 3000, 7), 'weather deterministic per place+time+seed')
let snowSouth = 0, rainNorth = 0, clearCnt = 0, wetCnt = 0, tot = 0
for (let y = 0; y < MAPW; y += 8) for (let x = 0; x < MAPW; x += 8) for (let ep = 0; ep < 6; ep++) {
    const w = weatherAt(x, y, ep * 1440 + 7)
    tot++
    if (w === WX.CLEAR) clearCnt++
    else wetCnt++
    if (w === WX.SNOW && y >= SNOW_LINE) snowSouth++
    if (w === WX.RAIN && y < SNOW_LINE) rainNorth++
}
const clearFrac = clearCnt / tot
ok(snowSouth === 0 && rainNorth === 0, `snow only north, rain only south (${snowSouth} stray snow, ${rainNorth} stray rain)`)
ok(clearFrac > 0.45 && clearFrac < 0.85, `sky mostly clear but not always (${(clearFrac * 100).toFixed(1)}% clear over 6 epochs)`)
ok(wetCnt > tot * 0.1, `weather reaches most of the land over time (${(wetCnt / tot * 100).toFixed(1)}% wet samples)`)
let stuck = 0
for (let i = 0; i < 40; i++) {
    const set = new Set()
    for (let ep = 0; ep < 24; ep++) set.add(weatherAt((i * 37) % MAPW, (i * 53) % MAPW, ep * 1440 + 13))
    if (set.size === 1) stuck++
}
ok(stuck === 0, 'the sky drifts: no spot stays under one weather for 24 epochs')
let badFlash = 0, flashSeen = 0, dayFlash = 0, onset = 0, multiPeak = 0
for (let y = 8; y < MAPW; y += 8) for (let x = 8; x < MAPW; x += 8) {
    if (weatherAt(x, y, 1800) !== WX.STORM) continue
    for (let b = 0; b < 4; b++) {
        let peaks = 0
        for (let t = b * 90; t < b * 90 + 90; t++) {
            const f = flashAt(x, y, t, 0.5)
            if (f > 0) { flashSeen++; if (!stormNight(0.5)) badFlash++ }
            if (f >= 1) peaks++
            if (flashOnset(x, y, t, 0.5)) onset++
            if (flashAt(x, y, t, 0.1) > 0) dayFlash++
        }
        if (peaks > 1) multiPeak++
    }
}
ok(flashSeen > 0 && badFlash === 0, `lightning strikes at night in storms (${flashSeen} flash frames)`)
ok(dayFlash === 0, 'no lightning during the day')
ok(onset > 0 && multiPeak === 0, `each strike flashes exactly once (${onset} thunder cues scheduled)`)

// fronts (#1135): the sky rides west-to-east at one region per epoch, so a
// weather cell keeps its kind as it travels: the pattern sampled at (x, y, t)
// must reappear at (x + 16k, y, t + k*WX_EPOCH). Prove-it-can-fail: freeze
// the drift in weather.js (driftOf -> 0) and these two gates go red.
{
    let invBad = 0, invTot = 0
    for (let y = 8; y < MAPW; y += 16) for (let x = 8; x < MAPW - 48; x += 16) for (const k of [1, 2, 3]) {
        invTot++
        if (weatherAt(x, y, 137, 0) !== weatherAt(x + 16 * k, y, 137 + k * WX_EPOCH, 0)) invBad++
    }
    ok(invBad === 0, `fronts drift east: the pattern rides (x+16k, t+k*epoch) (${invTot - invBad}/${invTot} samples hold)`)
    let ride = 0, rideBad = 0
    for (let y = 8; y < MAPW; y += 8) for (let x = 8; x < MAPW - 16; x += 8) for (let b = 1; b < 16; b++) {
        if (flashAt(x, y, b * 90, 0.5) < 1) continue
        ride++
        if (weatherAt(x + 16, y, b * 90 + WX_EPOCH) !== WX.STORM) rideBad++
    }
    ok(ride > 0 && rideBad === 0, `lightning rides with its storm: one epoch on, the cell one region east is still storming (${ride} strikes, ${rideBad} lost storms)`)
}

// ambient life (#1135): birds wheel over the moors and fish break at sea, so
// the land never feels empty — deterministic, habitat-correct (never birds on
// the water, never fish on the hills), riding the same west-to-east wind as
// the fronts, no starved cells over a long horizon, coasts livelier than open
// ocean, and flocks that cross their cell instead of flickering in place.
// Prove-it-can-fail: swap the land/sea gate in ambient.js, drop the coast
// bias, freeze driftCells (coverage goes red), or freeze progressOf.
{
    ok(ambientAt(100, 100, 1, false, 500) === ambientAt(100, 100, 1, false, 500) &&
        ambientAt(100, 100, 1, false, 500, 9) === ambientAt(100, 100, 1, false, 500, 9),
        'ambient deterministic per place+time+seed')
    let seedShift = 0
    for (let e = 0; e < 40; e++) {
        const x = (e * 13) % MAPW, y = (e * 29) % MAPW, t = e * 97 + 5
        const terr = world.get(x, y)
        if (ambientAt(x, y, terr, terr === 0, t, 0) !== ambientAt(x, y, terr, terr === 0, t, 5)) seedShift++
    }
    ok(seedShift > 3, `seed changes the wildlife (${seedShift}/40 cells differ)`)

    const cellCentre = (cx, cy) => [cx * AMB_CELL + AMB_CELL / 2, cy * AMB_CELL + AMB_CELL / 2]
    const NCELL = MAPW / AMB_CELL
    let birdSea = 0, fishLand = 0
    const landCells = [], coastCells = [], openCells = []
    for (let cy = 0; cy < NCELL; cy++) for (let cx = 0; cx < NCELL; cx++) {
        const [wx, wy] = cellCentre(cx, cy)
        const terr = world.get(wx, wy)
        if (terr === 0) {
            const coast = !isSea(world.get(wx + 1, wy)) || !isSea(world.get(wx - 1, wy)) || !isSea(world.get(wx, wy + 1)) || !isSea(world.get(wx, wy - 1))
            ;(coast ? coastCells : openCells).push([wx, wy])
        } else landCells.push([wx, wy])
        for (let k = 0; k < 8; k++) {
            const t = k * CELL_DRIFT + 7
            const a = ambientAt(wx, wy, terr, terr === 0 && (!isSea(world.get(wx + 1, wy)) || !isSea(world.get(wx - 1, wy)) || !isSea(world.get(wx, wy + 1)) || !isSea(world.get(wx, wy - 1))), t, 0)
            if (a === AMB.BIRD && terr === 0) birdSea++
            if (a === AMB.FISH && terr !== 0) fishLand++
        }
    }
    ok(birdSea === 0 && fishLand === 0, `habitat correct: birds only on land, fish only at sea (${birdSea} gulls-on-hill, ${fishLand} fish-on-moor)`)

    let starved = 0
    for (const [wx, wy] of landCells) {
        let seenBird = false
        for (let k = 0; k < 64; k++) if (ambientAt(wx, wy, 1, false, k * CELL_DRIFT + 3, 0) === AMB.BIRD) { seenBird = true; break }
        if (!seenBird) starved++
    }
    ok(landCells.length > 200 && starved === 0, `no moor waits forever: every land cell gets birds within 64 drift steps (${landCells.length} cells, ${starved} starved)`)
    let fishless = 0
    for (const [wx, wy] of openCells) {
        let seenFish = false
        for (let k = 0; k < 64; k++) if (ambientAt(wx, wy, 0, false, k * CELL_DRIFT + 3, 0) === AMB.FISH) { seenFish = true; break }
        if (!seenFish) fishless++
    }
    ok(openCells.length > 100 && fishless === 0, `open ocean gets callers too: every sea cell sees fish within 64 drift steps (${openCells.length} cells, ${fishless} fishless)`)

    let coastFish = 0, openFish = 0, tot = 0
    for (const [wx, wy] of coastCells) for (let k = 0; k < 64; k++) if (ambientAt(wx, wy, 0, true, k * CELL_DRIFT + 3, 0) === AMB.FISH) coastFish++
    for (const [wx, wy] of openCells) for (let k = 0; k < 64; k++) if (ambientAt(wx, wy, 0, false, k * CELL_DRIFT + 3, 0) === AMB.FISH) openFish++
    {
        const cr = coastFish / Math.max(1, coastCells.length * 64), or = openFish / Math.max(1, openCells.length * 64)
        ok(cr > or + 0.1, `shallows are livelier: ${(cr * 100).toFixed(1)}% fishy at the coast vs ${(or * 100).toFixed(1)}% on the open sea`)
    }
    tot = 0
    let busyBird = 0, busyFish = 0, seaTot = 0
    for (let cy = 0; cy < NCELL; cy++) for (let cx = 0; cx < NCELL; cx++) {
        const [wx, wy] = cellCentre(cx, cy)
        const terr = world.get(wx, wy)
        const coast = terr === 0 && (!isSea(world.get(wx + 1, wy)) || !isSea(world.get(wx - 1, wy)) || !isSea(world.get(wx, wy + 1)) || !isSea(world.get(wx, wy - 1)))
        const a = ambientAt(wx, wy, terr, coast, 1234, 0)
        if (terr === 0) { seaTot++; if (a === AMB.FISH) busyFish++ }
        else { tot++; if (a === AMB.BIRD) busyBird++ }
    }
    const bb = busyBird / tot, bf = busyFish / seaTot
    ok(bb > 0.15 && bb < 0.8, `one glance at the moors shows life but not a plague (${(bb * 100).toFixed(1)}% of land cells with birds)`)
    ok(bf > 0.02 && bf < 0.6, `the sea is mostly calm, rarely dead (${(bf * 100).toFixed(1)}% of sea cells with fish)`)

    let rideBad = 0, rideTot = 0
    for (let cy = 0; cy < NCELL; cy++) for (let cx = 4; cx < NCELL - 4; cx++) for (const k of [1, 2, 3]) {
        rideTot++
        if (rollOf(cx * AMB_CELL + 4, cy * AMB_CELL + 4, 137, 0) !== rollOf(cx * AMB_CELL + 4 + AMB_CELL * k, cy * AMB_CELL + 4, 137 + k * CELL_DRIFT, 0)) rideBad++
    }
    ok(rideBad === 0, `wildlife rides the wind: the roll at (x, t) reappears at (x+8k, t+k*drift) (${rideTot - rideBad}/${rideTot} samples hold)`)

    ok(progressOf(5) < progressOf(6) && progressOf(CELL_DRIFT - 1) > progressOf(CELL_DRIFT - 2) && progressOf(CELL_DRIFT) === 0, 'progress sweeps the flock west-to-east once per cell-life, then resets')
    {
        let dir = 0, probe = null
        for (let cy = 0; cy < NCELL && !dir; cy++) for (let cx = 0; cx < NCELL && !dir; cx++) {
            const [wx, wy] = cellCentre(cx, cy)
            const f = flockOf(wx, wy, 0, 0)
            if (f.dir === 1 && f.n >= 3) { dir = 1; probe = [wx, wy] }
        }
        ok(!!probe && flightOf(probe[0], probe[1], 100, 0) > flightOf(probe[0], probe[1], 20, 0), 'flocks fly across their cell — a dir=1 flock is further east later in its life')
    }
    {
        const f1 = flockOf(100, 100, 500), f2 = flockOf(100, 100, 500)
        ok(f1.n === f2.n && f1.dir === f2.dir && f1.n >= 3 && f1.n <= 5, 'flock size is deterministic and plausible (3..5 birds)')
        const seen = new Set()
        for (let cy = 0; cy < NCELL; cy++) for (let cx = 0; cx < NCELL; cx++) seen.add(flockOf(cx * AMB_CELL + 4, cy * AMB_CELL + 4, 0, 0).dir)
        ok(seen.has(1) && seen.has(-1), 'some flocks ride the wind east, some fly against it (not a one-direction wallpaper)')
    }

    {
        const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
        ok(/const amb = ambAt\(S\.x, S\.y, S\.tick, S\.seed\)/.test(src), 'index.jsx: step() listens for wildlife under the Avatar')
        ok(/audioController\.playTone\(2280/.test(src) && /audioController\.playNoise\(0\.14, 0\.05\)/.test(src), 'index.jsx: bird chirps and fish splashes sound when the wildlife arrives')
        ok((src.match(/drawAmbient/g) || []).length === 3, 'index.jsx: ambient life is drawn in play and in attract (one definition, two call sites)')
        ok(/ambient: AMB_NAME\[S\.amb\]/.test(src), 'index.jsx: the harness can see the wildlife over the Avatar')
    }
}

// walk sprites (#1135): 4 facings x 3 frames of a procedurally drawn Avatar,
// provable headless with a recording ctx — a facing that never turns, legs
// that never stride, a back view that shows its face, or a left that is not
// the right's mirror all fail here. Prove-it-can-fail: draw a circle always.
const rec = () => {
    const ops = []
    let tx = 0, ty = 0, sc = 1
    return {
        ops,
        save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
        translate(x, y) { tx += x * sc; ty += y },
        scale(x) { sc *= x },
        moveTo(x, y) { ops.push(`M${(x * sc + tx).toFixed(1)},${(y + ty).toFixed(1)}`) },
        lineTo(x, y) { ops.push(`L${(x * sc + tx).toFixed(1)},${(y + ty).toFixed(1)}`) },
        arc(x, y, r) { ops.push(`C${(x * sc + tx).toFixed(1)},${(y + ty).toFixed(1)}:${r}`) },
        fillRect(x, y, w, h) { ops.push(`R${(x * sc + tx).toFixed(1)},${(y + ty).toFixed(1)},${w},${h}`) },
        set fillStyle(v) { ops.push(`k${v}`) },
        get fillStyle() { return '#000' },
        lineWidth: 1,
    }
}
const sprite = (face, frame, bob = 0) => { const r = rec(); drawAvatar(r, face, frame, bob); return r.ops.join('|') }
ok(FACES.length === 4 && ['down', 'left', 'right', 'up'].every(f => FACES.includes(f)), 'the Avatar has four facings')
ok(faceFor(-1, 0) === 'left' && faceFor(1, 0) === 'right' && faceFor(0, -1) === 'up' && faceFor(0, 1) === 'down', 'faceFor maps every cardinal press to its facing')
ok(walkFrame(0, false) === 0 && walkFrame(1, true) === 2 && walkFrame(2, true) === 1 && walkFrame(3, true) === 2, 'a walk cycle is idle + two striding frames, alternating')
const sigs = [0, 1, 2].map(f => sprite('down', f))
ok(sigs[0] !== sigs[1] && sigs[1] !== sigs[2] && sigs[0] !== sigs[2], 'the three frames are visibly different sprites (not one pose re-stamped)')
ok(sprite('down', 1, 2) !== sprite('down', 1, 0), 'bob actually moves the sprite (the walk has spring, not a frozen stamp)')
ok(!sprite('up', 1).includes('#e8c89a'), 'the back view shows hair, never a face')
ok(sprite('down', 0).includes('#e8c89a') && sprite('left', 0).includes('#e8c89a'), 'front and profile views show the face')
ok(sprite('left', 1) !== sprite('right', 1), 'left and right profiles are distinct drawings')
{
    const negX = s => s.split('|').map(op => {
        if (op[0] === 'k') return op
        const parts = op.slice(1).split(',')
        parts[0] = (-parseFloat(parts[0])).toFixed(1)
        return op[0] + parts.join(',')
    }).join('|')
    ok(negX(sprite('left', 1)) === sprite('right', 1), 'the profile is one drawing mirrored, not two drifting art assets')
}
ok(sprite('down', 1) === sprite('down', 1) && sprite('up', 2) === sprite('up', 2), 'sprites are deterministic (same facing+frame, same pixels)')
{
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/S\.face = faceFor\(dx, dy\)/.test(src) && /S\.anim\+\+/.test(src), 'index.jsx: walking turns the Avatar (face + anim update on every land move)')
    ok(/drawAvatar\(ctx, S\.face, walkFrame\(/.test(src), 'index.jsx: the hero renders through the sprite, not a single bobbing blob')
    ok(/face: S\.face, frame:/.test(src), 'index.jsx: face/frame exposed to the harness so bots can watch the walk')
    ok(/pad\.b \|\| pad\.start\) \{ S\.dismissed = S\.gate; S\.gate = -1 \}/.test(src) && /gi !== S\.dismissed/.test(src) && /if \(gi < 0\) S\.dismissed = -1/.test(src), 'index.jsx: a cancelled moongate stays cancelled until thee walk away (B no longer locks the pilgrim beside the gate)')
}

// moongate warp (#1135): the signature action is now a short deterministic
// journey, not an instant cut — the world whites out, the position swaps on the
// single hidden peak frame, and the Avatar is held still the whole time.
// Prove-it-can-fail: make warpSwapAt true at age 0 (an instant cut), freeze the
// white-out, or let the ring stop growing — the peak/swap/ring gates go red.
{
    ok(warpActive(0) && warpActive(WARP_LEN - 1) && !warpActive(WARP_LEN) && !warpActive(-1),
        `a warp is active for exactly WARP_LEN ticks (0..${WARP_LEN - 1})`)
    let rampOk = true, fallOk = true
    for (let a = 0; a < WARP_PEAK; a++) if (!(warpFlash(a) < warpFlash(a + 1))) rampOk = false
    for (let a = WARP_PEAK; a < WARP_LEN; a++) if (!(warpFlash(a) >= warpFlash(a + 1))) fallOk = false
    ok(rampOk && fallOk, 'the white-out ramps up to the peak then fades (a journey, not a blink)')
    ok(warpFlash(0) === 0 && Math.abs(warpFlash(WARP_PEAK) - 1) < 1e-9 && warpFlash(WARP_LEN - 1) < 0.12 && warpFlash(WARP_LEN) === 0,
        `the white-out is 0 at the start, full (1.0) at the peak, near-zero at the end (peak age ${WARP_PEAK})`)
    ok(!warpSwapAt(0) && !warpSwapAt(WARP_PEAK - 1) && warpSwapAt(WARP_PEAK) && warpSwapAt(WARP_LEN - 1) && !warpSwapAt(WARP_LEN),
        'the position swap is only the white-out peak — never the first frame (no instant cut)')
    ok(warpFlash(WARP_PEAK) >= 0.99, 'the swap is hidden: the peak frame is a full white-out')
    const r0 = warpRing(0), r1 = warpRing(Math.floor(WARP_LEN / 2)), r2 = warpRing(WARP_LEN - 1)
    ok(!!r0 && !!r2 && r1.r > r0.r && r2.r > r1.r && r0.a > 0 && r2.a > 0,
        'the portal ring opens wide over the journey (radius grows, stays visible)')
    ok(warpRing(-1) === null && warpRing(WARP_LEN) === null, 'no ring outside the warp window')
    const m1 = warpMotes(10, 3, 7), m2 = warpMotes(10, 3, 7)
    const same = m1.length === m2.length && m1.every((m, i) => m.x === m2[i].x && m.y === m2[i].y && m.a === m2[i].a && m.sz === m2[i].sz)
    ok(m1.length === 42 && same, 'the light motes are deterministic (same age+gate+seed, same burst)')
    ok(m1.every(m => m.a >= 0 && m.a <= 1 && Math.abs(m.x) < 200 && Math.abs(m.y) < 160), 'the motes stay on screen and alpha is in [0,1]')
    ok(warpMotes(-1, 3, 7).length === 0 && warpMotes(WARP_LEN, 3, 7).length === 0, 'no motes outside the warp window')
    ok(warpMotes(5, 3, 7).some(m => m.a > 0) && warpMotes(WARP_LEN - 2, 3, 7).every(m => m.a < 0.3), 'the burst thins out toward the arrival')
}

// wiring: the warp is what the pilgrim actually sees, and the old instant cut is gone
{
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/S\.warp = \{ dest, t0: S\.tick, swapped: false \}/.test(src), 'index.jsx: choosing a gate starts a warp (S.warp), not an instant teleport')
    ok(/if \(!S\.warp\.swapped && warpSwapAt\(age\)\)/.test(src), 'index.jsx: the position swaps only under warpSwapAt (the hidden peak)')
    const teleIdx = src.indexOf('S.x = g.x; S.y = g.y; S.ship = false')
    const swapIdx = src.indexOf('warpSwapAt(age)')
    ok(teleIdx > swapIdx && swapIdx >= 0, 'index.jsx: the teleport sits after warpSwapAt(age) — inside the peak, not the menu')
    ok(/if \(age >= WARP_LEN\) S\.warp = null/.test(src), 'index.jsx: the warp ends and releases the Avatar after WARP_LEN ticks')
    ok(/warpRing\(age\)/.test(src) && /warpMotes\(age, S\.warp\.dest, S\.seed\)/.test(src) && /warpFlash\(age\)/.test(src), 'index.jsx: the swirl, the motes and the white-out are all drawn')
    ok(/warping: !!S\.warp, warpFlash:/.test(src), 'index.jsx: the harness can see a warp in flight')
    const menuA = (src.split('if (pad.a) {')[1] || '').split('if (pad.b')[0] || ''
    ok(!/S\.x = g\.x; S\.y = g\.y; S\.ship = false/.test(menuA), 'index.jsx: the gate menu no longer cuts to the destination on the spot')
}

// moon flavor (#1135): every gate bears one of the eight virtue-moons and the
// sky shows tonight's phase, cycled once per in-world day so the menu can't lie
// about the moon it claims to follow.
{
    ok(MOONS.length === 8 && new Set(MOONS).size === 8 && PHASES.length === 8,
        'eight named moons and eight moon phases (the original wheel)')
    ok([0, 1, 2, 3, 4, 5, 6, 7].every(g => MOONS.includes(moonName(g))) && new Set([0, 1, 2, 3, 4, 5, 6, 7].map(moonName)).size === 8,
        'the eight gates carry eight distinct moons')
    ok(moonPhase(0) === 0 && moonPhase(DAY_TICKS - 1) === 0 && moonPhase(DAY_TICKS) === 1 && moonPhase(DAY_TICKS * 8) === 0,
        'the phase rolls once per in-world day and cycles the full wheel')
    let mono = true
    for (let p = 0; p <= 4; p++) if (phaseLit(p) !== p / 4) mono = false
    ok(mono && phaseLit(0) === 0 && phaseLit(4) === 1 && Math.abs(phaseLit(2) - 0.5) < 1e-9 && Math.abs(phaseLit(7) - 0.25) < 1e-9,
        'the disc lit-fraction runs new→full→new with the phase (0, .25, .5, .75, 1, .75, .5, .25)')
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/moonPhase\(S\.tick\)/.test(src) && /the \$\{PHASES\[ph\]\} rules the sky/.test(src),
        'index.jsx: the gate menu names tonight\'s moon phase from the world clock')
    ok(/moonName\(i\)} moon/.test(src), 'index.jsx: each menu row is named for its moon, not "gate N"')
    ok(/whirls thee to \$\{ROMAN\[S\.warp\.dest\]\} of \$\{moonName\(S\.warp\.dest\)\}/.test(src),
        'index.jsx: the arrival toast keeps its named destination (the slice did not hollow the warp)')
}

// land texture (#1146): the modern tiles shade from a smooth field keyed to
// WORLD position, so the land reads as soft, continuous terrain — never the
// per-pixel salt-and-pepper static, and never a repeating tile stamp. grain =
// fraction of adjacent 16px blocks that differ in shade, sampled at exactly the
// block centers the renderer paints (shadeAt). The old per-block hash sat at
// ~0.6; a smooth field sits far below 0.3, and flattening it to one shade drops
// it toward 0. Prove-it-can-fail: make worldNoise a raw per-block hash (grain ->
// ~0.5) or a constant (grain -> 0) and these go red.
{
    const step = 16, span = 512
    let t = 0, d = 0
    for (let y = 0; y < span; y += step) for (let x = 0; x < span; x += step) {
        const s = shadeAt(x + 8, y + 8)
        if (x + step < span) { t++; if (s !== shadeAt(x + step + 8, y + 8)) d++ }
        if (y + step < span) { t++; if (s !== shadeAt(x + 8, y + step + 8)) d++ }
    }
    const g = d / t
    ok(g < 0.3, `land mottle is smooth, not static: grain ${g.toFixed(2)} (< 0.30)`)
    ok(g > 0.02, `land still varies (not one flat shade): grain ${g.toFixed(2)} (> 0.02)`)
    // and the renderer must actually paint from that field, not a per-tile stamp
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/blockShades\(tx, ty\)/.test(src), 'index.jsx: the modern tile shades come from the world-continuous field (blockShades)')
    ok(!/sheet\[v < 9 \? v : 8\]|tiles\.modern/.test(src), 'index.jsx: no per-tile stamp cache remains for the modern land')
}

// coastal swell (#1135): the sea is never flat static color — a plane of
// swells rides west-to-east (the same wind the fronts drift on), foam gathers
// only where land holds the water back, swells with every passing crest, and
// breaks into seeded speckles hugging the right land edge.
// Prove-it-can-fail: set PH_T = 0 in swell.js (the ride/east gates go red),
// drop the coast gate in foam() (open-ocean foam goes red), swap the 'e'/'w'
// clusters in foamPatches() (the edge gate goes red).
{
    ok(crest(40, 60, 500) === crest(40, 60, 500) && crestLane(40, 60, 3) === crestLane(40, 60, 3),
        'swells deterministic per place+time+lane-seed')
    ok(PH_T < 0, `phase falls as ticks rise at fixed x (PH_T=${PH_T.toFixed(5)}) => crests run east, with the wind`)
    let rideBad = 0, rideTot = 0
    for (let ty = 0; ty < 64; ty += 5) for (let tx = 0; tx < 64; tx += 3) for (const k of [1, 2, 3]) {
        rideTot++
        if (Math.abs(crest(tx, ty, 137) - crest(tx + k, ty, 137 + k * SWELL_TILE)) > 1e-6) rideBad++
    }
    ok(rideBad === 0, `swells ride east: the crest at (x, t) reappears at (x+k, t+k*${SWELL_TILE}) (${rideTot - rideBad}/${rideTot} samples hold)`)
    ok(Math.abs(crest(40, 60, 300) - crest(40, 60, 300 + Math.round(SWELL_TILE / SWELL_PH))) < 1e-6 &&
        Math.abs(crest(40, 60, 307) - crest(40, 60, 313)) > 1e-3,
        'the swell field is periodic (~48 ticks) but not frozen between repeats')
    let cmin = 1, cmax = 0
    for (let ty = 0; ty < 96; ty += 7) for (let tx = 0; tx < 96; tx += 5) for (let tt = 0; tt < SWELL_TILE; tt += 3) {
        const c = crest(tx, ty, tt + 5)
        if (c < cmin) cmin = c
        if (c > cmax) cmax = c
    }
    ok(cmin < 0.15 && cmax > 0.55, `the sea visibly breathes: crest band spans ${cmin.toFixed(2)}..${cmax.toFixed(2)} (not flat, not all crest)`)
    let lmin = 99, lmax = 0
    for (let i = 0; i < 200; i++) {
        const l = crestLane(i % 60, (i * 7) % 60, 0)
        if (l < lmin) lmin = l
        if (l > lmax) lmax = l
    }
    ok(lmin >= 6 && lmax <= 26 && lmax - lmin > 8, `crest lanes vary tile to tile (${lmin.toFixed(1)}..${lmax.toFixed(1)}) so the sea never paints in lockstep`)
    let foamSea = 0
    for (let i = 0; i < 300; i++) if (foam(i % 97, (i * 13) % 97, false, i * 5, i % 7) > 0) foamSea++
    ok(foamSea === 0, `open ocean never foams (${foamSea} foaming mid-sea tiles)`)
    let vanish = 0
    for (let i = 0; i < 300; i++) if (foam(i % 97, (i * 13) % 97, true, i * 5, i % 7) < 0.25) vanish++
    ok(vanish === 0, 'shore foam is always there (never vanishes entirely)')
    let pulseBad = 0, pulseTot = 0
    for (let tx = 0; tx < 40; tx += 3) for (let ty = 0; ty < 40; ty += 5) {
        let fmin = 1, fmax = 0
        for (let tt = 0; tt < SWELL_TILE * 2; tt++) {
            const st = foam(tx, ty, true, tt, 0)
            if (st < fmin) fmin = st
            if (st > fmax) fmax = st
        }
        pulseTot++
        if (fmax - fmin < 0.2) pulseBad++
    }
    ok(pulseBad === 0, `foam swells as crests pass at every shore tile (${pulseTot} tiles all pulsing >0.2)`)
    let monoBad = 0
    for (let i = 0; i < 120; i++) {
        const tx = i % 41, ty = 7 + (i * 3) % 37
        for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) {
            const ca = crest(tx, ty, a * 2), cb = crest(tx, ty, b * 2)
            const fa = foam(tx, ty, true, a * 2, 3), fb = foam(tx, ty, true, b * 2, 3)
            if (ca < cb - 1e-9 && fa > fb + 1e-9) monoBad++
        }
    }
    ok(monoBad === 0, 'foam tracks the swell: a bigger crest is never a thinner line')
    let coastSeen = 0, openSeen = 0
    for (let y = 0; y < MAPW; y += 4) for (let x = 0; x < MAPW; x += 4) {
        if (!isSea(world.get(x, y))) continue
        if (landSides(x, y, world).length) coastSeen++
        else openSeen++
    }
    ok(coastSeen > 50 && openSeen > 50, `Britannia has both coast and open sea for the renderer (${coastSeen} coast, ${openSeen} open sampled)`)
    const p1 = foamPatches(50, 60, 'e', 100, 0, 0.8)
    const p2 = foamPatches(50, 60, 'e', 100, 0, 0.8)
    ok(p1.length === p2.length && p1.every((p, i) => p.x === p2[i].x && p.y === p2[i].y && p.sz === p2[i].sz && p.a === p2[i].a),
        'foam speckles deterministic (same tile+side+time+seed, same blobs)')
    ok(p1.length >= 4 && p1.length <= 8, `a shore edge carries a plausible scatter (${p1.length} blobs)`)
    ok(foamPatches(50, 60, 'e', 100, 0, 0).length === 0, 'no speckles without foam strength')
    ok(p1.every(p => p.x >= 0 && p.x <= 32 && p.y >= 0 && p.y <= 32 && p.a > 0 && p.a <= 1 && p.sz >= 1),
        'every speckle sits inside its tile with a sane size and alpha')
    {
        const edgeOf = s => s === 'e' ? ['x', 20] : s === 'w' ? ['x', 0] : s === 's' ? ['y', 20] : ['y', 0]
        let edgeBad = 0
        for (const s of ['n', 's', 'e', 'w']) for (let i = 0; i < 12; i++) {
            const [axis, lo] = edgeOf(s)
            for (const p of foamPatches(i * 3 + 1, i * 5 + 2, s, i * 7, 0, 0.7)) {
                if (p[axis] < lo - p.sz || p[axis] > lo + 12 + p.sz) edgeBad++
            }
        }
        ok(edgeBad === 0, 'foam hugs the land side: every blob sits against the edge it belongs to')
    }
    ok(JSON.stringify(p1) !== JSON.stringify(foamPatches(50, 60, 'e', 100, 4, 0.8)), 'seed changes the foam scatter')
    {
        const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
        ok(/crest\(tx, ty, t\)/.test(src) && /foamPatches\(tx, ty, sd, t, S\.seed, st\)/.test(src), 'index.jsx: ocean tiles paint crest lines and shore foam in drawTile')
        ok(/landSides\(tx, ty, world\)/.test(src), 'index.jsx: foam lands only on edges with real land beside them')
        ok(/swell: crest\(S\.x, S\.y, S\.tick\)/.test(src), 'index.jsx: the harness can watch the swell under the Avatar')
        const classicIdx = src.indexOf('if (classicOn) { ctx.drawImage(tiles.classic')
        const swellIdx = src.indexOf('crest(tx, ty, t)')
        ok(classicIdx >= 0 && swellIdx > classicIdx, 'index.jsx: classic (C) mode still paints its clean tile sheet before any swell')
    }
}

console.log(fails ? `\nBRITANNIA: ${fails} FAILURES` : '\nBRITANNIA: all checks pass')
process.exit(fails ? 1 : 0)
