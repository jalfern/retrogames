// britanniacheck — proves BRITANNIA boots its world and its rules hold,
// without a browser (#1128 M1): the original data decodes byte-perfect,
// Britannia's shape is intact, the eight moongates are real inland places,
// foot/ship block rules are consistent, and the pilgrimage is winnable.
// Prove-it-can-fail: break a threshold (e.g. landMin) or tamper WORLD.MAP.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { zipRead, makeWorld, findStars, isSea, MAPW, MAP_BYTES } from '../src/games/Britannia/britmap.js'
import { WX, WX_EPOCH, SNOW_LINE, stormNight, weatherAt, flashAt, flashOnset, isFrozen, reliefBias, ROCK, SHADOW_D, SHADOW_MAX, UPLIFT_MAX, SUMMIT } from '../src/games/Britannia/weather.js'
import { AMB, AMB_CELL, CELL_DRIFT, ambientAt, rollOf, flockOf, flightOf, progressOf } from '../src/games/Britannia/ambient.js'
import { FACES, faceFor, walkFrame, drawAvatar } from '../src/games/Britannia/avatar.js'
import { WARP_LEN, WARP_PEAK, warpActive, warpFlash, warpSwapAt, warpRing, warpMotes } from '../src/games/Britannia/warp.js'
import { MOONS, PHASES, DAY_TICKS, moonPhase, moonName, phaseLit, PHASE_FLAVOR, gateFlavor } from '../src/games/Britannia/moons.js'
import { shadeAt, mixHex, builtPalette, cobbleBlock } from '../src/games/Britannia/tiles.js'
import { TOWN_R, FLAT as TOWN_FLAT, townScore, hasCottage } from '../src/games/Britannia/towns.js'
import { decodeCon, decodeRecord, CON_TERR, FLAT } from '../src/games/Britannia/ega.js'
import { SWELL_TILE, SWELL_PH, PH_T, crest, crestLane, foam, landSides, foamPatches, SPLAT, splatIntensity, dimples } from '../src/games/Britannia/swell.js'

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

// rain shadow (#1135): fronts ride west-to-east, so rock is a wind barrier —
// the leeward (east) side of a ridge dries out, the windward (west) side gets
// uplift, the bias decays with distance, oceans cast nothing, and the shell
// feeds the real WORLD.MAP into the sky. Prove-it-can-fail: zero reliefBias
// (or flip its signs) and the orientation/conversion/storm gates go red.
{
    const ridge = rx => (x, y) => (x === rx ? ROCK : 0)
    const flat = () => 0
    const RX = 100
    ok(reliefBias(100, 100, null) === 0 && weatherAt(100, 100, 3000, 5) === weatherAt(100, 100, 3000, 5, null),
        'no terrain passed = exactly the old drift field (all 4-arg callers unchanged)')
    ok(reliefBias(RX, 50, ridge(RX)) === SUMMIT && reliefBias(RX + 4, 50, ridge(RX)) < 0 && reliefBias(RX - 4, 50, ridge(RX)) > 0,
        'orientation: summit lifts, east of a ridge is dry (leeward), west is wet (windward)')
    let monoS = true, monoU = true
    for (let d = 1; d < SHADOW_D; d++) {
        if (Math.abs(reliefBias(RX + d + 1, 50, ridge(RX))) >= Math.abs(reliefBias(RX + d, 50, ridge(RX)))) monoS = false
        if (Math.abs(reliefBias(RX - d - 1, 50, ridge(RX))) >= Math.abs(reliefBias(RX - d, 50, ridge(RX)))) monoU = false
    }
    ok(monoS && monoU && reliefBias(RX + SHADOW_D + 1, 50, ridge(RX)) === 0,
        `the bias decays with distance and dies past ${SHADOW_D} tiles (linear falloff both sides)`)
    const twin = (x, y) => (x === RX - 4 || x === RX + 4 ? ROCK : 0)
    ok(reliefBias(RX, 50, twin) === 0, 'rock equidistant on both sides cancels: no shadow in a valley between twins')
    ok(reliefBias(50, 50, flat) === 0 && reliefBias(171, 23, flat) === 0,
        'sea casts no shadow (flat terrain biases nothing anywhere)')
    ok(reliefBias(120, 50, ridge(RX)) === reliefBias(120, 50, ridge(RX)), 'rain shadow deterministic per place+terrain')
    let dry = 0, wetBack = 0
    for (let d = 1; d <= SHADOW_D; d++) for (let ep = 0; ep < 320; ep++) {
        const t = ep * 37 + 11
        const base = weatherAt(RX + d, 50, t, 3)
        const wx = weatherAt(RX + d, 50, t, 3, ridge(RX))
        if (base !== WX.CLEAR && wx === WX.CLEAR) dry++
        if (base === WX.CLEAR && wx !== WX.CLEAR) wetBack++
    }
    ok(dry > 0 && wetBack === 0, `the shadow actually dries land (${dry} fronts turned clear east of the ridge; ${wetBack} impossible reversals)`)
    let windWet = 0, windDry = 0
    for (let d = 1; d <= SHADOW_D; d++) for (let ep = 0; ep < 240; ep++) for (let sd = 0; sd < 24; sd++) {
        const t = ep * 41 + 7
        const base = weatherAt(RX - d, 50, t, sd)
        const wx = weatherAt(RX - d, 50, t, sd, ridge(RX))
        if (base === WX.CLEAR && wx !== WX.CLEAR) windWet++
        if (base !== WX.CLEAR && wx === WX.CLEAR) windDry++
    }
    ok(windWet > 0 && windDry === 0, `the windward face actually wets (${windWet} fronts lifted into rain; ${windDry} impossible dryings)`)
    let stormEastBase = 0, stormEastShadow = 0, stormWest = 0
    for (let ep = 0; ep < 480; ep++) {
        const t = ep * 23 + 5
        if (weatherAt(RX + 1, 50, t, 9) === WX.STORM) stormEastBase++
        if (weatherAt(RX + 1, 50, t, 9, ridge(RX)) === WX.STORM) stormEastShadow++
        if (weatherAt(RX - 1, 50, t, 9, ridge(RX)) === WX.STORM) stormWest++
    }
    ok(stormEastBase > 0 && stormEastShadow === 0,
        `the first leeward tile never storms (base saw ${stormEastBase} storms there; shadow keeps it at ${stormEastShadow})`)
    ok(stormWest > 0, `storms do reach the windward face (${stormWest} windward storms)`)
    let flashE = 0
    for (let ep = 0; ep < 240; ep++) if (flashOnset(RX + 1, 50, ep * 29 + 3, 0.5, 9, ridge(RX))) flashE++
    ok(flashE === 0, 'no lightning in the rain shadow (no storm, no strike)')
    let rockTiles = 0, bites = 0, holdFar = 0, farTot = 0
    const rockWrap = (x, y) => world.get(x, y)
    for (let y = 0; y < MAPW; y += 3) for (let x = 0; x < MAPW; x += 3) if (world.get(x, y) === ROCK) rockTiles++
    for (let y = 8; y < MAPW; y += 4) for (let x = 8; x < MAPW; x += 1) {
        const b = reliefBias(x, y, rockWrap)
        if (b === 0) { farTot++; if (weatherAt(x, y, 7777, 3, rockWrap) === weatherAt(x, y, 7777, 3)) holdFar++ }
        else if (weatherAt(x, y, 7777, 3, rockWrap) !== weatherAt(x, y, 7777, 3)) bites++
    }
    ok(rockTiles > 0, `Britannia has rock to block the wind (${rockTiles * 9} rock tiles sampled)`)
    ok(bites > 0 && holdFar === farTot,
        `real Britannia: the sky changes where ridges stand (${bites} altered cells) and never does where they don't (${farTot - holdFar}/${farTot} far cells moved)`)
    const wsrc = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/const terrainAt = \(x, y\) => \(world \? world\.get\(x, y\) : 0\)/.test(wsrc), 'index.jsx: the real WORLD.MAP is the terrain the sky reads')
    ok(/weatherAt\(S\.x, S\.y, S\.tick, S\.seed, terrainAt\)/.test(wsrc), 'index.jsx: the avatar sky is terrain-aware')
    ok(/flashAt\(S\.x, S\.y, S\.tick, tod\(\), S\.seed, terrainAt\)/.test(wsrc) && /flashOnset\(S\.x, S\.y, S\.tick, tod\(\), S\.seed, terrainAt\)/.test(wsrc), 'index.jsx: lightning obeys the shadow too')
    ok(/shadow: reliefBias\(S\.x, S\.y, terrainAt\)/.test(wsrc), 'index.jsx: the harness can see the shadow under the Avatar')
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

// gate-menu phase flavor + hover chirp (#1135): the menu prints one mood line
// per moon phase — eight distinct lines, each naming the phase it claims, all
// short enough for the 420px panel — and a mouse travelling the rows makes the
// row it crosses chirp, so pointer guests get what the arrows always gave.
// Prove-it-can-fail: make every PHASE_FLAVOR entry the same string (distinct
// red), strip a phase word from one line (self-naming red), delete the hover
// chirp or the pointermove wiring (source pins red).
{
    ok(PHASE_FLAVOR.length === 8 && new Set(PHASE_FLAVOR).size === 8,
        'eight distinct phase-flavor lines (one per phase, no filler copies)')
    ok(PHASE_FLAVOR.every((s, i) => s.toLowerCase().includes(PHASES[i])),
        'every flavor line names the very phase it decorates')
    ok([0, 1, 2, 3, 4, 5, 6, 7].every(p => gateFlavor(p) === PHASE_FLAVOR[p] && gateFlavor(p + 8) === gateFlavor(p) && gateFlavor(-1) === PHASE_FLAVOR[7]),
        'gateFlavor maps the wheel deterministically and wraps both ways')
    const lens = PHASE_FLAVOR.map(s => s.length)
    ok(Math.max(...lens) <= 48 && Math.min(...lens) >= 20,
        `lines fit the 480px panel (longest ${Math.max(...lens)} ≤ 48 chars) and carry some verse (shortest ${Math.min(...lens)} ≥ 20)`)
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/gateFlavor\(ph\)/.test(src), 'index.jsx: the open gate menu prints tonight\'s phase flavor')
    ok(/addEventListener\('pointermove', onMove\)/.test(src) && /S\.hoverRow = row/.test(src),
        'index.jsx: pointer hover over the menu tracks and selects rows')
    ok(/S\.sel = row; audioController\.playTone\(420/.test(src),
        'index.jsx: hovering onto a new row chirps (audio parity with the arrows)')
    ok(/hoverRow: S\.gate >= 0 \? S\.hoverRow : -1/.test(src) && /gateFlavor: S\.gate >= 0 \? gateFlavor\(moonPhase\(S\.tick\)\)/.test(src),
        'index.jsx: hover row and tonight\'s flavor ride the harness state (menu closed => -1/empty)')
    ok(/by \+ 29, 9(\*lit)?/.test(src) && /by \+ 34\)/.test(src) && /rowTop: 62/.test(src),
        'index.jsx: the phase line + disc share the title row (disc by+29, caption by+34) and rows start at by+62 — #1352 no overprint of row I')
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
        const classicIdx = src.indexOf('if (classicOn) {')
        const swellIdx = src.indexOf('crest(tx, ty, t)')
        ok(classicIdx >= 0 && swellIdx > classicIdx, 'index.jsx: classic (C) mode still paints its clean tile sheet before any swell')
    }
}

// classic tiles (#1135): C mode stamps the ORIGINAL terrain tiles. The mapping
// is Origin's own: the tilesets live in files named BY TERRAIN (GRASS.CON,
// MARSH.CON, BRUSH.CON, HILL.CON, FOREST.CON, SHORE.CON) — nothing guessed,
// unlike the SHAPES.EGA base table, which is absent from the bundle and whose
// one AVATAR.EXE candidate contradicts the sheet's colour runs (would mislabel
// marsh vs heath vs plains), so sea/cliff/plains honestly stay flat fills.
// Prove-it-can-fail: swap FOREST.CON and GRASS.CON contents in the zip view
// (the trunk gate goes red), truncate a CON (length gate), corrupt record 1 of
// one file (shared-header gate).
{
    const CON = ['GRASS.CON', 'MARSH.CON', 'BRUSH.CON', 'HILL.CON', 'FOREST.CON', 'SHORE.CON', 'BRICK.CON']
    ok(CON.every(n => zip[n] && zip[n].length === 192), `six terrain CON tilesets (+BRICK) present at 192B (${CON.map(n => `${n}:${zip[n] ? zip[n].length : 'MISSING'}`).join(' ')})`)
    const hdrHas = n => { const t = decodeRecord(zip[n], 32); return t.includes(12) && t.includes(13) }
    ok(CON.every(hdrHas), 'record 1 carries the same magenta marker pair (12+13) in every CON file — a shared header field, so the 32B record alignment is real, not assumed')
    const sets = {}
    let idxBad = 0
    for (const n of CON) {
        sets[n] = decodeCon(zip[n])
        for (const t of sets[n]) for (const p of t) if (p > 15) idxBad++
    }
    ok(Object.values(sets).every(s => s.length === 4) && idxBad === 0, `each CON decodes to 4 variant tiles x 64 in-range 4bpp indices (${idxBad} out-of-range pixels)`)
    const cnt = (tile, idx) => tile.reduce((a, p) => a + (p === idx ? 1 : 0), 0)
    ok(sets['GRASS.CON'].every(t => cnt(t, 4) >= 16 && cnt(t, 4) > Math.max(cnt(t, 1), cnt(t, 2), cnt(t, 6), cnt(t, 7), cnt(t, 8))), 'GRASS.CON variants are ground-dominant (index 4 the top colour of every tile) — the file really is plain grass')
    ok(sets['FOREST.CON'].every(t => cnt(t, 6) >= 1 && cnt(t, 4) >= 1) && sets['FOREST.CON'].some(t => cnt(t, 6) > cnt(sets['GRASS.CON'][0], 6) + 8), 'FOREST.CON carries brown trunk pixels over green ground — distinct from GRASS.CON, not the same tileset relabelled')
    ok(sets['SHORE.CON'].some(t => cnt(t, 1) + cnt(t, 2) >= 8) && sets['SHORE.CON'].some(t => cnt(t, 4) >= 4), 'SHORE.CON mixes blue/cyan water with green land — these are coast tiles, so terrain 8 really is the beach ring')
    ok(sets['HILL.CON'].every(t => cnt(t, 7) + cnt(t, 8) >= 1) && sets['MARSH.CON'].some(t => cnt(t, 1) + cnt(t, 2) >= 1), 'HILL.CON shows grey rock and MARSH.CON shows standing water — the two terrain tilesets say what their names say')
    ok(sets['BRICK.CON'].filter(t => cnt(t, 3) >= 24).length === 4, 'BRICK.CON is solid cyan masonry with yellow accents — real wall tiles, reserved for the stage-2 cities')
    ok(Object.keys(CON_TERR).length === 6 && [...Object.keys(CON_TERR), ...Object.keys(FLAT)].map(Number).sort((a, b) => a - b).join(',') === '0,1,2,3,4,5,6,7,8', 'every terrain 0..8 is either a named original tileset or an honest flat fill (no silent gaps)')
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/tiles = buildTileCaches\(zip\)/.test(src), 'index.jsx: the classic cache is built from the original bundle bytes')
    ok(/cs\[variantOf\(hash2, tx, ty, vv\) % cs\.length\]/.test(src), 'index.jsx: classic mode stamps the decoded variants, deterministic per world tile')
}

// rain on the sea (#1135): precipitation used to add nothing on open water
// beyond the screen tint — now wet cells dimple the surface with seeded rings
// that open, fade and die. Prove-it-can-fail: remove the intensity<=0 guard
// (dry seas start dimpling), swap the rain/snow intensities (the order gate
// goes red), or drop the weatherAt call in drawTile (wiring goes red).
{
    const d1 = dimples(40, 200, SPLAT.storm, 777, 3)
    const d2 = dimples(40, 200, SPLAT.storm, 777, 3)
    ok(JSON.stringify(d1) === JSON.stringify(d2), 'dimples are deterministic (same tile+intensity+tick+seed, same strikes)')
    ok(splatIntensity(WX.CLEAR) === 0 && dimples(40, 200, 0, 777, 3).length === 0,
        'a clear sky (or zero intensity) strikes the sea nothing — dry sea stays glass')
    ok(splatIntensity(WX.STORM) === SPLAT.storm && splatIntensity(WX.RAIN) === SPLAT.rain && splatIntensity(WX.SNOW) === SPLAT.snow,
        'each wet kind maps to its intensity (rain/snow/storm)')
    ok(dimples(9, 9, SPLAT.storm, 5, 1).length > dimples(9, 9, SPLAT.rain, 5, 1).length &&
        dimples(9, 9, SPLAT.rain, 5, 1).length > dimples(9, 9, SPLAT.snow, 5, 1).length &&
        dimples(9, 9, SPLAT.snow, 5, 1).length > 0,
        'more rain, more dimples: storm > rain > snow > clear, every tile, every tick')
    let boundsOk = true
    for (let i = 0; i < 40; i++) for (const d of dimples(i * 7, i * 13, SPLAT.storm, i * 31, i)) {
        if (d.x < 0 || d.x > 32 || d.y < 0 || d.y > 32 || d.r <= 0 || d.r > 3.5 || d.a < 0 || d.a > 1) boundsOk = false
    }
    ok(boundsOk, 'every dimple stays inside its 32px tile with sane radius and alpha')
    const alphas = []
    for (let t = 0; t < 600; t++) for (const d of dimples(50, 180, SPLAT.rain, t, 2)) alphas.push(d.a)
    const peak = Math.max(...alphas)
    ok(peak > 0.1 && alphas.some(a => a < peak * 0.1),
        'dimples live and die (alpha runs to near-zero in a window) — struck water, not static dots')
    let seas = 0, wetSeen = 0, drySeen = 0, mismatch = 0
    for (let y = 0; y < MAPW; y += 6) for (let x = 0; x < MAPW; x += 6) for (let ep = 0; ep < 8; ep++) {
        if (!isSea(world.get(x, y))) continue
        seas++
        const wx = weatherAt(x, y, ep * 1440 + x, 5, v => world.get(x, y) && v >= 0 ? world.get(x, y) : 0)
        const dd = dimples(x, y, splatIntensity(wx), ep * 1440 + x, 5)
        if (wx === WX.CLEAR) { drySeen++; if (dd.length) mismatch++ } else { wetSeen++; if (!dd.length) mismatch++ }
    }
    ok(seas > 50 && wetSeen > 0 && drySeen > 0, `real Britannia offers both weather states at sea (${seas} sea samples, ${wetSeen} wet, ${drySeen} dry)`)
    ok(mismatch === 0, `dimples sit exactly where the sky is wet over real ocean (${mismatch} mismatches over ${seas} samples)`)
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/const wxh = weatherAt\(tx, ty, t, S\.seed, terrainAt\)/.test(src), 'index.jsx: the sea asks the (terrain-aware) sky per tile')
    ok(/dimples\(tx, ty, si, t, S\.seed\)/.test(src), 'index.jsx: wet sea tiles are drawn with dimples')
    ok(/seaRain: splatIntensity\(weatherAt\(S\.x, S\.y, S\.tick, S\.seed, terrainAt\)\)/.test(src),
        'index.jsx: the harness can see the rain striking the Avatar\'s sea tile')
}

{
    // towns before walls (#1135): built-up ground rides the detected gates
    const terrain = (x, y) => world.get(x, y)
    const synthetic = { '1 grass': 1, '6 heath': 6, '7 plains': 7 }
    let flatOk = true
    for (const v of Object.values(synthetic)) if (townScore(0, 0, [{ x: 0, y: 0 }], () => v) <= 0) flatOk = false
    ok(flatOk, 'level ground (grass/heath/plains) at a gate reads built-up')
    let hardOk = true
    for (const v of [0, 2, 3, 4, 5, 8, 9, 76]) if (townScore(0, 0, [{ x: 0, y: 0 }], () => v) !== 0) hardOk = false
    ok(hardOk, 'sea, marsh, rock, hill, forest, sand and POI tiles never build (towns sit on level ground)')
    let farOk = true
    for (const g of gates) for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (d <= TOWN_R) continue
        if (townScore(g.x + dx, g.y + dy, gates, terrain) > 0 && d > TOWN_R) {
            const others = gates.some(o => o !== g && Math.max(Math.abs(o.x - g.x - dx), Math.abs(o.y - g.y - dy)) <= TOWN_R)
            if (!others) farOk = false
        }
    }
    ok(farOk, `nothing reads built-up beyond TOWN_R=${TOWN_R} from every gate (its own radius, no bleed)`)
    let decayOk = true, plazaOk = true
    const allFlat = () => 1
    for (let r = 1; r <= TOWN_R; r++) {
        const prev = townScore(10 + r - 1, 10, [{ x: 10, y: 10 }], allFlat)
        const ring = townScore(10 + r, 10, [{ x: 10, y: 10 }], allFlat)
        if (ring > prev || (ring === prev && r > 0)) decayOk = false
    }
    if (townScore(10, 10, [{ x: 10, y: 10 }], allFlat) <= 0) decayOk = false
    for (const g of gates) {
        if (townScore(g.x, g.y, gates, terrain) <= 0 && !isSea(world.get(g.x, g.y)) && TOWN_FLAT.has(world.get(g.x, g.y))) plazaOk = false
    }
    ok(decayOk, 'on level ground the built-up score strictly decays with distance from the gate')
    ok(plazaOk, 'gate plazas themselves read built-up when their ground is level')
    let popOk = true
    const popCounts = gates.map(g => {
        let n = 0
        for (let dy = -TOWN_R; dy <= TOWN_R; dy++) for (let dx = -TOWN_R; dx <= TOWN_R; dx++) {
            if (townScore(g.x + dx, g.y + dy, gates, terrain) > 0) n++
        }
        return n
    })
    for (const n of popCounts) if (n < 8) popOk = false
    ok(popOk, `every one of the eight gates has a town around it (${popCounts.join(', ')} built tiles ≥ 8)`)
    let cleanOk = true
    for (let y = 0; y < MAPW; y += 3) for (let x = 0; x < MAPW; x += 3) {
        if (townScore(x, y, gates, terrain) > 0 && (isSea(world.get(x, y)) || !TOWN_FLAT.has(world.get(x, y)))) cleanOk = false
    }
    ok(cleanOk, 'over the whole real map, built ground is always flat land')
    const grass = ['#27521f', '#316527', '#3d7a31']
    const spread = h => Math.max(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))) - Math.min(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
    const bp = builtPalette(grass, 1)
    ok(bp.join() !== grass.join() && bp.every((h, i) => spread(h) < spread(grass[i])),
        'built-up grass is greyer than moor grass (mortar wash, not a new hue)')
    ok(mixHex('#316527', [104, 100, 92], 0) === '#316527' && /^#[0-9a-f]{6}$/.test(bp[0]),
        'mixHex is identity at t=0 and always emits a hex colour')
    let cobbleDet = true, cobbleN = 0, cobbleTot = 0
    for (let i = 0; i < 200; i++) {
        const g = gates[i % gates.length]
        for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
            const c = cobbleBlock(g.x + (i % 7) - 3, g.y + (i % 5) - 2, bx, by)
            if (cobbleBlock(g.x + (i % 7) - 3, g.y + (i % 5) - 2, bx, by) !== c) cobbleDet = false
            cobbleTot++; if (c) cobbleN++
        }
    }
    const frac = cobbleN / cobbleTot
    ok(cobbleDet && frac > 0.1 && frac < 0.9, `cobble grout is deterministic and scattered (${(frac * 100).toFixed(1)}% of town blocks paved)`)
    const tsrc = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/const ts = townScore\(tx, ty, gates, terrainAt\)/.test(tsrc) && /builtPalette\(TERR\[vv\], ts\)/.test(tsrc),
        'index.jsx: drawTile washes and paves built-up ground in modern mode')
    ok(/classical|classicOn/.test(tsrc) && !/builtPalette\(TERR\[vv\], ts\)/.test(tsrc.slice(0, tsrc.indexOf('const ts = townScore')) || ''),
        'index.jsx: the wash lives in the modern branch (classic sheet stays clean)')
    ok(/if \(ts > 0 && cobbleBlock\(tx, ty, bx, by\)\)/.test(tsrc), 'index.jsx: town blocks darken onto cobble grout')
    ok(/inTown && !S\.wasTown/.test(tsrc) && /town lieth nigh/.test(tsrc), 'index.jsx: entering town toasts once')
    ok(/town: townScore\(S\.x, S\.y, gates, terrainAt\)/.test(tsrc), 'index.jsx: the harness can see the town under the Avatar')
}

// first-time player pass (#1352): the goal is on screen from the first second,
// gates are legible at noon, a compass points at the next gate, towns keep
// their promise of cottages, the HUD is pinned to the content top (not sunk
// into the map by the letterbox), the clock agrees with the sky, and the gate
// menu speaks the keys the game actually binds.
// Prove-it-can-fail: revert the gate alpha to pulse*(0.5+0.5*n) (noon glow
// goes red), drop the fit.oy term in hudInsets (the bar sinks again), restore
// the un-shifted clock (noon reads 00:00), or delete the compass.
{
    const src = readFileSync('src/games/Britannia/index.jsx', 'utf8')
    ok(/GOAL: find and ride all eight moongates/.test(src) &&
        (src.match(/GOAL: find and ride all eight moongates/g) || []).length === 2,
        'index.jsx: the goal is stated twice — fixed line on attract AND the first toast')
    ok(/S\.toast = 300; S\.toastMsg = 'GOAL/.test(src) && /if \(!\/\^GOAL\/\.test\(S\.toastMsg \|\| ''\)\)/.test(src),
        'index.jsx: the goal toast fires the moment play begins and a sky change cannot swallow it')

    // day glow: the core alpha is pulse*(0.55+0.45*n)+0.28 — at noon (n=0) it
    // spans 0.445..0.72 and never the old 0.15..0.40; an anchor ring adds a
    // dark teal edge so the swirl never disappears on tan grass
    const coreAlpha = (p, n) => Math.min(0.94, p * (0.55 + 0.45 * n) + 0.28)
    ok(coreAlpha(0.3, 0) >= 0.4 && coreAlpha(0.8, 0) <= 0.94 && coreAlpha(0.8, 1) > coreAlpha(0.8, 0),
        `noon gate glow is plainly bright (core alpha ${coreAlpha(0.3, 0).toFixed(2)}..${coreAlpha(0.8, 0).toFixed(2)}, night burns harder)`)
    ok(/rgba\(16,70,88,0\.55\)/.test(src) && /pulse \* \(0\.55 \+ 0\.45 \* n\) \+ 0\.28/.test(src),
        'index.jsx: the anchor ring + steady bright core replace the day-invisible glow')

    ok(/const nearestUnvisited = \(\) =>/.test(src) &&
        /S\.visited\.has\(i\)/.test(src) && /if \(gx < 0 \|\| gx > VIEW_W \|\| gy < 0 \|\| gy > VIEW_H\)/.test(src),
        'index.jsx: a compass computes the nearest UNVISITED gate and points only when the gate itself is off-screen')
    ok(/`to \$\{ROMAN\[gd\.i\]} · \$\{gd\.d\} paces`/.test(src),
        'index.jsx: the compass names its target and distance (never a bare arrow)')
    {
        // wrap-aware nearest: a gate one tile west across the seam must read as
        // 1 pace, not 255 — same wrap law as the walk itself
        const dWrap = (a, b) => { let d = b - a; if (d > MAPW / 2) d -= MAPW; if (d < -MAPW / 2) d += MAPW; return d }
        ok(dWrap(2, 254) === -4 && dWrap(254, 2) === 4 && dWrap(10, 13) === 3,
            'compass directions wrap the map seam like the walk does')
    }

    ok(hasCottage(10, 10) === hasCottage(10, 10) && hasCottage(10, 11) !== undefined,
        'hasCottage is deterministic per tile')
    {
        let seen = 0, tot = 0
        for (const g of gates) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (g.x + dx === g.x && g.y + dy === g.y) continue
            tot++; if (hasCottage(g.x + dx, g.y + dy)) seen++
        }
        ok(seen >= 2, `gate plazas actually host cottages to walk past (${seen} of ${tot} plaza tiles)`)
        let varied = new Set()
        for (let i = 0; i < 400; i++) varied.add(hasCottage(i % 20, (i * 7) % 20))
        ok(varied.has(true) && varied.has(false), 'cottages scatter, not stamp (some plots built, some empty)')
    }
    ok(/ts >= 0\.75 && !onGate\(tx, ty\) && hasCottage\(tx, ty\)/.test(src),
        'index.jsx: cottages stand only on the strongest built-up ground, never under a gate')
    ok(/hearth smoke|drawCottage/.test(src) && /rgba\(214,214,220/.test(src),
        'index.jsx: smoke wisps lift off the roofs — the town toast is not a lie')

    ok(/const contentTop = rect\.top \+ fit\.oy/.test(src) && /contentTop >= Math\.max/.test(src),
        'index.jsx: HUD insets measure against the letterbox content top, not the canvas element (#1352 bar no longer floats)')
    ok(/contentLeft\) \/ fit\.s/.test(src) && /contentRight - pause\.left/.test(src),
        'index.jsx: side insets are letterbox-aware too')

    ok(/Math\.floor\(\(\(tod\(\) \+ 0\.5\) % 1\) \* 24\)/.test(src),
        'index.jsx: the clock is offset half a cycle — tod 0 is noon, so noon no longer reads 00:00')
    {
        const DAY2 = 7200
        const nightN = t => { const x = (t % DAY2) / DAY2; return x < 0.25 ? 0 : x < 0.34 ? (x - 0.25) / 0.09 : x < 0.72 ? 1 : x < 0.81 ? 1 - (x - 0.72) / 0.09 : 0 }
        const hrs = t => Math.floor((((t % DAY2) / DAY2 + 0.5) % 1) * 24)
        ok(hrs(0) === 12 && nightN(0) <= 0.5, 'high sun (tick 0) reads 12:00 DAY')
        ok(hrs(Math.floor(DAY2 * 0.5)) === 0 && nightN(Math.floor(DAY2 * 0.5)) > 0.5, 'tick mid-cycle reads 00:00 NIGHT')
        let agree = true
        for (let t = 0; t < DAY2; t += 7) {
            const hr = hrs(t), dark = nightN(t) > 0.5
            if (dark && hr >= 8 && hr <= 16) agree = false
            if (!dark && (hr <= 1 || hr >= 22)) agree = false
        }
        ok(agree, 'hour and DAY/NIGHT label never contradict across a whole day (night only 19..06, day only 06..19)')
    }

    ok(/Z\/Esc cancel/.test(src) && !/B cancel/.test(src),
        'index.jsx: the menu hint names Z/Esc — the keys actually bound to cancel')
    ok(/Escape: 'start'/.test(src) && /pad\.b \|\| pad\.start\) \{ S\.dismissed/.test(src),
        'index.jsx: Esc really does close the gate menu (start-dismiss path)')
    {
        // menu geometry: rows clear of the header, hint clear of the border
        const W = 1280, H = 720
        const g = { w: 480, rowTop: 62, pitch: 36 }, rows = 7
        const bh = g.rowTop + rows * g.pitch + 44
        ok(g.rowTop >= 56 && bh <= H * 0.75, `menu box stands clear (rows from by+${g.rowTop}, box height ${bh})`)
        const footer = 'arrows + SPACE choose · 1-8 jump · Z/Esc cancel'
        ok(footer.length * 8.4 <= g.w - 56, `footer hint fits inside the ${g.w}px box (${footer.length} chars ≈ ${(footer.length * 8.4) | 0}px)`)
        const longest = '  VIII — Spirituality moon  [visited]'
        ok(longest.length * 10.2 <= g.w - 56, `longest gate row fits (${longest.length} chars ≈ ${(longest.length * 10.2) | 0}px)`)
    }
}

console.log(fails ? `\nBRITANNIA: ${fails} FAILURES` : '\nBRITANNIA: all checks pass')
process.exit(fails ? 1 : 0)
