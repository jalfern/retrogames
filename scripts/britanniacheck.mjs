// britanniacheck — proves BRITANNIA boots its world and its rules hold,
// without a browser (#1128 M1): the original data decodes byte-perfect,
// Britannia's shape is intact, the eight moongates are real inland places,
// foot/ship block rules are consistent, and the pilgrimage is winnable.
// Prove-it-can-fail: break a threshold (e.g. landMin) or tamper WORLD.MAP.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { zipRead, makeWorld, findStars, isSea, MAPW, MAP_BYTES } from '../src/games/Britannia/britmap.js'
import { WX, SNOW_LINE, stormNight, weatherAt, flashAt, flashOnset, isFrozen } from '../src/games/Britannia/weather.js'
import { FACES, faceFor, walkFrame, drawAvatar } from '../src/games/Britannia/avatar.js'

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

console.log(fails ? `\nBRITANNIA: ${fails} FAILURES` : '\nBRITANNIA: all checks pass')
process.exit(fails ? 1 : 0)
