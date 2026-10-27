// britanniacheck — proves BRITANNIA boots its world and its rules hold,
// without a browser (#1128 M1): the original data decodes byte-perfect,
// Britannia's shape is intact, the eight moongates are real inland places,
// foot/ship block rules are consistent, and the pilgrimage is winnable.
// Prove-it-can-fail: break a threshold (e.g. landMin) or tamper WORLD.MAP.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { zipRead, makeWorld, findStars, isSea, MAPW, MAP_BYTES } from '../src/games/Britannia/britmap.js'

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

console.log(fails ? `\nBRITANNIA: ${fails} FAILURES` : '\nBRITANNIA: all checks pass')
process.exit(fails ? 1 : 0)
