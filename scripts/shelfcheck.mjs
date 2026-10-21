// shelfcheck — gate for the shared 3D model shelf (#637). Node-only, no DOM.
//   node scripts/shelfcheck.mjs
// Proves three things: the shelf boots (index parses, schema is right), its
// rules hold (CC0 only, every entry resolves to a real valid GLB within budget,
// models sit on the ground, consumers' loader paths are wired), and the shelf
// can be *used* — the model ids that #638 (SSX mountain) and #639 (Comet
// trackside) declared as dependencies are all present and loadable.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = join(ROOT, 'public/models')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ok   ' + m) }
const bad = (m) => { fail++; console.log('  FAIL ' + m) }
const check = (cond, m) => (cond ? ok(m) : bad(m))

// ---- 1. Boots: the index parses and carries the right schema.
const shelfPath = join(MODELS, 'shelf.json')
let shelf
try {
    shelf = JSON.parse(readFileSync(shelfPath, 'utf8'))
    ok('shelf.json parses')
} catch (e) {
    bad('shelf.json: ' + e.message)
    console.log(`\nshelfcheck: ${pass} pass, ${fail} fail`)
    process.exit(1)
}
check(shelf.schema === 'retrogames-model-shelf/1', `schema is ${shelf.schema}`)
check(typeof shelf.version === 'number' && shelf.version >= 1, `version ${shelf.version}`)
check(shelf.units && /metre/.test(shelf.units), `units "${shelf.units}" (1u = 1m)`)
check(Array.isArray(shelf.entries) && shelf.entries.length >= 15, `index has ${shelf.entries && shelf.entries.length} entries`)

// ---- 2. Rules.
const CC0 = /CC0|public domain|publicdomain/i
const ids = new Set()
const BY_GLB = {}

// structural glTF validator (no skins/anims path, so Node-safe)
function validateGlb(path) {
    const buf = readFileSync(path)
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return 'bad magic'
    if (buf.readUInt32LE(4) !== 2) return 'glTF version != 2'
    if (buf.readUInt32LE(8) !== buf.length) return `length ${buf.readUInt32LE(8)} != ${buf.length}`
    if (buf.readUInt32LE(12 + 4) !== 0x4e4f534a) return 'first chunk not JSON'
    const jsonLen = buf.readUInt32LE(12)
    let json
    try { json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) } catch { return 'JSON chunk unreadable' }
    if (!json.meshes || !json.meshes.length) return 'no meshes'
    if (!json.accessors || !json.bufferViews || !json.buffers) return 'no accessors/bufferViews/buffers'
    if (json.buffers[0].byteLength > buf.length) return 'buffer byteLength exceeds file'
    const prim = json.meshes[0].primitives[0]
    if (prim.attributes.POSITION === undefined) return 'no POSITION'
    for (const name of ['POSITION', 'NORMAL']) {
        const idx = prim.attributes[name]
        if (idx === undefined) continue
        const a = json.accessors[idx]
        const bv = json.bufferViews[a.bufferView]
        const comp = a.componentType === 5126 ? 4 : 0
        if (!comp) return `${name} not float`
        const need = a.count * 3 * comp
        if (bv.byteOffset + bv.byteLength > json.buffers[0].byteLength) return `${name} bufferView out of range`
        if (bv.byteLength < need) return `${name} accessor needs ${need}, view ${bv.byteLength}`
    }
    const p = json.accessors[prim.attributes.POSITION]
    if (!Array.isArray(p.min) || !p.min.every(Number.isFinite)) return 'POSITION min not finite'
    if (!Array.isArray(p.max) || !p.max.every(Number.isFinite)) return 'POSITION max not finite'
    return null
}

for (const e of shelf.entries) {
    for (const k of ['id', 'name', 'category', 'pack', 'author', 'license', 'path', 'format', 'sizeBytes', 'triangles']) {
        if (e[k] === undefined || e[k] === null) { bad(`entry ${e.id || '?'} missing field "${k}"`); }
    }
    if (ids.has(e.id)) bad(`duplicate id "${e.id}"`)
    ids.add(e.id)
    check(CC0.test(e.license), `${e.id}: license "${e.license}"`)
    const diskPath = join(ROOT, 'public', e.path)
    BY_GLB[e.id] = diskPath
    if (!existsSync(diskPath)) { bad(`${e.id}: path missing on disk (${e.path})`); continue }
    const err = validateGlb(diskPath)
    if (err) bad(`${e.id}: ${err}`)
    else ok(`${e.id}: valid glb (${e.triangles} tris, ${Math.round(e.sizeBytes / 1024)} KB)`)
    if (e.sizeBytes && readFileSync(diskPath).length !== e.sizeBytes) bad(`${e.id}: sizeBytes ${e.sizeBytes} != file ${readFileSync(diskPath).length}`)
    // lean budgets
    if (e.category === 'scenery') {
        check(e.sizeBytes <= 40 * 1024, `${e.id}: ≤40 KB (${Math.round(e.sizeBytes / 1024)} KB)`)
        check(e.triangles <= 400, `${e.id}: ≤400 tris (${e.triangles})`)
    }
}

// models sit on the ground (origin on ground, +Y up): scenery min.y ≈ 0.
for (const e of shelf.entries.filter((x) => x.category === 'scenery')) {
    const buf = readFileSync(BY_GLB[e.id])
    const jsonLen = buf.readUInt32LE(12)
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
    const min = json.accessors[json.meshes[0].primitives[0].attributes.POSITION].min
    check(min[1] > -0.05, `${e.id}: sits on ground (min.y ${min[1].toFixed(2)})`)
}

// provenance files preserved on the moved models.
check(existsSync(join(MODELS, 'characters/LICENSE.txt')), 'characters/LICENSE.txt (KayKit provenance) present')
check(existsSync(join(MODELS, 'vehicles/README.md')), 'vehicles/README.md (buggy provenance) present')

// consumer loader wiring — the two existing games must resolve to real files.
const ssx = readFileSync(join(ROOT, 'src/games/SSX/art.js'), 'utf8')
check(/models\/characters\/\$\{file\}\.glb/.test(ssx) && existsSync(join(MODELS, 'characters/rogue.glb')), 'SSX art.js loads models/characters/rogue.glb')
const comet = readFileSync(join(ROOT, 'src/games/CometDriftHD/scene.js'), 'utf8')
check(/models\/vehicles\/dune_buggy\.glb/.test(comet) && existsSync(join(MODELS, 'vehicles/dune_buggy.glb')), 'Comet scene.js loads models/vehicles/dune_buggy.glb')
check(existsSync(join(ROOT, 'src/utils/modelShelf.js')), 'src/utils/modelShelf.js loader helper present')

// ---- 3. Usable: the ids #638 (mountain) and #639 (trackside) declared.
const REQUIRED = {
    '#638 SSX mountain': ['tree_oak', 'tree_pine', 'rock', 'boulder', 'fence', 'flag', 'rock_snow', 'boulder_snow', 'tree_pine_snow', 'snowbank'],
    '#639 Comet trackside': ['grandstand', 'barrier', 'marshal_post', 'pit_building', 'billboard', 'cone', 'sign', 'tree_oak', 'tree_pine', 'rock', 'tire_wall', 'hill'],
}
for (const [label, want] of Object.entries(REQUIRED)) {
    const missing = want.filter((id) => !ids.has(id))
    check(missing.length === 0, `${label}: ${want.length} deps present${missing.length ? ' — missing ' + missing.join(',') : ''}`)
}

// Proportions vs references in metres: human ~1.75 m, buggy ~3.4 m wide /
// 1.4 m tall (#657). The new kit pieces must read at believable scale.
const PROPORTIONS = {
    tire_wall: { w: [1.8, 2.6], h: [1.2, 1.6] },
    hill: { w: [5.5, 8.5], h: [3.0, 5.5], d: [4.0, 7.0] },
    rock_snow: { h: [0.5, 1.0] },
    boulder_snow: { h: [1.2, 1.8], w: [1.2, 1.6] },
    tree_pine_snow: { h: [2.6, 3.2] },
    snowbank: { h: [0.3, 0.8], w: [1.8, 3.0] },
}
for (const [id, dims] of Object.entries(PROPORTIONS)) {
    const e = shelf.entries.find((x) => x.id === id)
    if (!e || !e.meters) { check(false, `${id}: proportions — entry/meters missing`); continue }
    for (const [k, [lo, hi]] of Object.entries(dims))
        check(e.meters[k] >= lo && e.meters[k] <= hi, `${id}: ${k}=${e.meters[k]} m within ${lo}–${hi} (vs 1.75 m human)`)
}

// index is internally consistent with the files on disk.
for (const cat of ['characters', 'vehicles', 'scenery']) {
    const onDisk = existsSync(join(MODELS, cat)) ? readdirSync(join(MODELS, cat)).filter((f) => f.endsWith('.glb')).length : 0
    const inIndex = shelf.entries.filter((e) => e.category === cat).length
    check(onDisk === inIndex, `${cat}/: ${inIndex} indexed == ${onDisk} on disk`)
}

// totals match.
const tBytes = shelf.entries.reduce((a, e) => a + e.sizeBytes, 0)
check(shelf.totals && Math.abs(shelf.totals.bytes - tBytes) < 8, `totals.bytes matches (${tBytes})`)
check(tBytes < 2.5 * 1024 * 1024, `shelf ≤ 2.5 MB (${(tBytes / 1024).toFixed(0)} KB)`)

console.log(`\nshelfcheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
