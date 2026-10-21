// Builds the shared model shelf scenery and writes public/models/shelf.json.
// All scenery here is ORIGINAL CC0 authored procedurally in the KayKit voxel
// idiom (chunky, flat-shaded, 1 unit = 1 m, origin on the ground, +Y up).
// Itch.io pack downloads are outside the GitHub/npm-only network rule, so the
// kit is Forge-made instead; provenance is honest about that. Run:
//   node scripts/build-shelf.mjs
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { newSoup, merge, box, prism, writeGlb, readGlb } from './_glb.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENERY = join(ROOT, 'public/models/scenery')
mkdirSync(SCENERY, { recursive: true })

const c = (r, g, b) => [r / 255, g / 255, b / 255]
const BARK = c(120, 82, 48)
const LEAF = c(74, 138, 66)
const LEAF_D = c(56, 110, 52)
const PINE = c(48, 96, 64)
const PINE_D = c(38, 78, 52)
const ROCK = c(150, 150, 156)
const ROCK_D = c(118, 118, 126)
const WOOD = c(176, 138, 92)
const WOOD_D = c(140, 106, 68)
const METAL = c(120, 124, 132)
const METAL_D = c(86, 90, 98)
const RED = c(208, 56, 46)
const WHITE = c(236, 236, 236)
const ORANGE = c(236, 130, 40)
const CONCRETE = c(196, 194, 188)
const ROOF = c(78, 92, 110)
const GLASS = c(70, 96, 120)
const DARK = c(40, 42, 48)
const BLACK = c(22, 24, 28)
const SNOW = c(244, 248, 252)
const SNOW_D = c(214, 224, 236)
const GRASS = c(98, 142, 74)
const GRASS_D = c(78, 118, 60)

// Grounded ambient shading: darken baked vertex colour toward the base of each
// model so flat single-colour props read with weight under the games' lighting
// (contact-shadow at the bottom, sky-light on top + up-facing faces). Pure
// colour modulation — geometry, vertex count and byte budget are untouched.
function groundShade(soup, dark = 0.72, lit = 1.06) {
    const n = soup.pos.length / 3
    if (!n) return soup
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < n; i++) { const y = soup.pos[i * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y }
    const span = (maxY - minY) || 1
    for (let i = 0; i < n; i++) {
        const y = soup.pos[i * 3 + 1]
        const ny = soup.nrm[i * 3 + 1]
        const t = (y - minY) / span
        let f = dark + (lit - dark) * t
        if (ny < -0.5) f *= 0.8
        else if (ny > 0.5) f *= 1.04
        for (let k = 0; k < 3; k++) { const j = i * 3 + k; soup.col[j] = Math.min(1, soup.col[j] * f) }
    }
    return soup
}

// Every model: origin on the ground (y >= 0), ~1m scale, lean (< a few hundred tris).
const DEFINITIONS = {
    tree_oak: () => {
        const s = newSoup()
        box(s, 0, 0.5, 0, 0.34, 1.0, 0.34, BARK)
        box(s, 0, 1.05, 0, 1.5, 0.55, 1.5, LEAF)
        box(s, 0, 1.4, 0, 1.15, 0.55, 1.15, LEAF)
        box(s, 0, 1.75, 0, 0.8, 0.5, 0.8, LEAF_D)
        box(s, 0.55, 1.35, 0.1, 0.5, 0.4, 0.5, LEAF_D)
        return s
    },
    tree_pine: () => {
        const s = newSoup()
        box(s, 0, 0.35, 0, 0.22, 0.7, 0.22, BARK)
        box(s, 0, 0.9, 0, 1.1, 0.7, 1.1, PINE)
        box(s, 0, 1.5, 0, 0.85, 0.7, 0.85, PINE)
        box(s, 0, 2.1, 0, 0.55, 0.7, 0.55, PINE_D)
        box(s, 0, 2.55, 0, 0.3, 0.5, 0.3, PINE_D)
        return s
    },
    rock: () => {
        const s = newSoup()
        box(s, 0, 0.25, 0, 0.7, 0.5, 0.6, ROCK)
        box(s, 0.28, 0.42, 0.08, 0.44, 0.36, 0.44, ROCK_D)
        box(s, -0.22, 0.32, 0.14, 0.36, 0.3, 0.36, ROCK)
        box(s, 0.05, 0.55, -0.1, 0.3, 0.24, 0.3, ROCK_D)
        return s
    },
    boulder: () => {
        const s = newSoup()
        box(s, 0, 0.55, 0, 1.3, 1.1, 1.2, ROCK)
        box(s, 0.25, 1.05, 0.1, 0.85, 0.55, 0.85, ROCK_D)
        box(s, -0.32, 0.32, 0.22, 0.7, 0.64, 0.62, ROCK_D)
        box(s, -0.1, 1.15, -0.15, 0.5, 0.4, 0.5, ROCK)
        return s
    },
    fence: () => {
        const s = newSoup()
        for (const x of [-1, 0, 1]) box(s, x, 0.45, 0, 0.12, 0.9, 0.12, WOOD_D)
        box(s, 0, 0.42, 0, 2, 0.1, 0.08, WOOD)
        box(s, 0, 0.72, 0, 2, 0.1, 0.08, WOOD)
        return s
    },
    flag: () => {
        const s = newSoup()
        box(s, 0, 1.0, 0, 0.06, 2.0, 0.06, METAL)
        box(s, 0.32, 1.72, 0, 0.6, 0.42, 0.04, RED)
        box(s, 0.32, 1.55, 0, 0.6, 0.1, 0.05, WHITE)
        return s
    },
    barrier: () => {
        const s = newSoup()
        for (const x of [-0.7, 0, 0.7]) box(s, x, 0.28, 0, 0.1, 0.56, 0.1, METAL_D)
        box(s, 0, 0.46, 0, 1.5, 0.22, 0.12, WHITE)
        box(s, 0, 0.46, 0.07, 1.5, 0.22, 0.02, RED)
        return s
    },
    cone: () => {
        const s = newSoup()
        box(s, 0, 0.04, 0, 0.34, 0.08, 0.34, DARK)
        prism(s, 0, 0.08, 0, 0.13, 0.56, 8, ORANGE)
        box(s, 0, 0.34, 0, 0.2, 0.1, 0.2, WHITE)
        return s
    },
    grandstand: () => {
        const s = newSoup()
        for (let i = 0; i < 3; i++) box(s, 0, 0.4 + i * 0.5, -0.9 + i * 0.85, 6, 0.8 + i, 0.9, CONCRETE)
        box(s, 0, 1.9, -1.4, 6.2, 0.1, 3.2, METAL_D)
        for (const x of [-2.6, -0.9, 0.9, 2.6]) box(s, x, 2.5, 1.2, 0.14, 1.2, 0.14, METAL)
        box(s, 0, 3.15, 0.3, 6.4, 0.16, 3.6, ROOF)
        box(s, 0, 0.65, 1.05, 6, 0.5, 0.08, RED)
        return s
    },
    marshal_post: () => {
        const s = newSoup()
        for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) box(s, x, 1.1, z, 0.12, 2.2, 0.12, METAL)
        box(s, 0, 2.25, 0, 1.1, 0.12, 1.1, WOOD)
        box(s, 0, 2.75, 0, 0.9, 0.9, 0.9, WHITE)
        box(s, 0, 2.75, 0.46, 0.9, 0.5, 0.02, GLASS)
        box(s, 0, 3.3, 0, 1.15, 0.12, 1.15, RED)
        box(s, 0, 3.5, 0, 0.05, 0.3, 0.05, METAL)
        return s
    },
    pit_building: () => {
        const s = newSoup()
        box(s, 0, 1.6, 0, 8, 3.2, 4, CONCRETE)
        box(s, 0, 3.4, 0, 8.4, 0.4, 4.4, ROOF)
        box(s, 0, 3.75, 0, 8.4, 0.3, 4.4, WHITE)
        for (const x of [-3, -1, 1, 3]) box(s, x, 1.15, 2.02, 1.4, 2.3, 0.06, DARK)
        for (const x of [-3, -1, 1, 3]) box(s, x, 2.7, 2.02, 1.4, 0.5, 0.06, GLASS)
        box(s, 0, 3.75, 2.22, 8.4, 0.5, 0.04, RED)
        return s
    },
    billboard: () => {
        const s = newSoup()
        box(s, -1, 1.0, 0, 0.16, 2.0, 0.16, METAL_D)
        box(s, 1, 1.0, 0, 0.16, 2.0, 0.16, METAL_D)
        box(s, 0, 2.55, 0, 3.4, 1.7, 0.14, DARK)
        box(s, 0, 2.55, 0.05, 3.1, 1.4, 0.06, WHITE)
        return s
    },
    sign: () => {
        const s = newSoup()
        box(s, 0, 0.75, 0, 0.08, 1.5, 0.08, METAL)
        box(s, 0, 1.7, 0, 0.9, 0.9, 0.08, RED)
        box(s, 0, 1.7, 0.05, 0.66, 0.66, 0.04, WHITE)
        return s
    },
    tire_wall: () => {
        const s = newSoup()
        const tire = (x, y, painted) => {
            box(s, x, y, 0, 0.72, 0.72, 0.44, DARK)
            box(s, x, y, 0.225, 0.44, 0.44, 0.02, BLACK)
            if (painted) box(s, x, y, 0.24, 0.62, 0.16, 0.01, WHITE)
        }
        for (const x of [-0.75, 0, 0.75]) tire(x, 0.36, false)
        for (const x of [-0.375, 0.375]) tire(x, 1.08, true)
        return s
    },
    hill: () => {
        const s = newSoup()
        box(s, 0, 0.75, 0, 7, 1.5, 5.5, GRASS_D)
        box(s, 0.2, 2.0, -0.2, 5, 1.4, 4, GRASS)
        box(s, -0.2, 3.1, -0.1, 3, 1.2, 2.4, GRASS)
        box(s, 0.1, 3.85, -0.2, 1.6, 0.7, 1.2, GRASS_D)
        box(s, 2.4, 0.6, 1.7, 1.3, 1.2, 1.1, ROCK)
        box(s, -2.6, 0.5, -1.5, 1.1, 1.0, 0.9, ROCK_D)
        return s
    },
    rock_snow: () => {
        const s = DEFINITIONS.rock()
        box(s, 0, 0.54, 0, 0.74, 0.08, 0.64, SNOW)
        box(s, 0.28, 0.64, 0.08, 0.48, 0.08, 0.48, SNOW)
        box(s, 0.05, 0.7, -0.1, 0.34, 0.06, 0.34, SNOW_D)
        return s
    },
    boulder_snow: () => {
        const s = DEFINITIONS.boulder()
        box(s, 0.25, 1.4, 0.1, 0.9, 0.14, 0.9, SNOW)
        box(s, -0.1, 1.42, -0.15, 0.55, 0.12, 0.55, SNOW_D)
        return s
    },
    tree_pine_snow: () => {
        const s = DEFINITIONS.tree_pine()
        box(s, 0, 1.28, 0, 1.12, 0.12, 1.12, SNOW)
        box(s, 0, 1.88, 0, 0.87, 0.12, 0.87, SNOW)
        box(s, 0, 2.48, 0, 0.57, 0.14, 0.57, SNOW)
        box(s, 0, 2.84, 0, 0.32, 0.14, 0.32, SNOW_D)
        return s
    },
    snowbank: () => {
        const s = newSoup()
        box(s, 0, 0.15, 0, 2.4, 0.3, 1.2, SNOW)
        box(s, 0.5, 0.34, 0, 1.4, 0.34, 0.9, SNOW)
        box(s, -0.6, 0.28, 0.1, 1.0, 0.28, 0.7, SNOW_D)
        return s
    },
    // Silhouette variants (#657): a second tree and rock shape so scatters
    // don't repeat visibly. Same voxel idiom, ground origin, lean.
    tree_pine_tall: () => {
        const s = newSoup()
        box(s, 0, 0.45, 0, 0.2, 0.9, 0.2, BARK)
        box(s, 0, 1.1, 0, 0.95, 0.7, 0.95, PINE)
        box(s, 0, 1.75, 0, 0.72, 0.7, 0.72, PINE)
        box(s, 0, 2.4, 0, 0.5, 0.7, 0.5, PINE_D)
        box(s, 0, 3.0, 0, 0.3, 0.6, 0.3, PINE_D)
        box(s, 0, 3.45, 0, 0.16, 0.4, 0.16, PINE_D)
        return s
    },
    rock_angular: () => {
        const s = newSoup()
        box(s, 0, 0.22, 0, 0.9, 0.44, 0.5, ROCK)
        box(s, 0.34, 0.28, 0.1, 0.4, 0.56, 0.4, ROCK_D)
        box(s, -0.3, 0.18, -0.06, 0.34, 0.36, 0.42, ROCK_D)
        box(s, 0.05, 0.52, 0.02, 0.36, 0.24, 0.36, ROCK)
        return s
    },
}

const META = {
    tree_oak: { name: 'Oak tree', summary: 'Chunky broadleaf tree, block canopy', tags: ['nature', 'tree'], solid: false },
    tree_pine: { name: 'Pine tree', summary: 'Tapered conifer, tiered needles', tags: ['nature', 'tree'], solid: false },
    rock: { name: 'Rock', summary: 'Small grey rock cluster', tags: ['nature', 'rock'], solid: true },
    boulder: { name: 'Boulder', summary: 'Large hillside boulder', tags: ['nature', 'rock'], solid: true },
    fence: { name: 'Post-and-rail fence', summary: 'Two-rail wooden fence section (2 m)', tags: ['props', 'fence'], solid: true },
    flag: { name: 'Course flag', summary: 'Marker flag on a pole', tags: ['racing', 'marker'], solid: false },
    barrier: { name: 'Safety barrier', summary: 'Armco-style crash barrier (1.5 m)', tags: ['racing', 'barrier'], solid: true },
    cone: { name: 'Traffic cone', summary: 'Orange cone with a white band', tags: ['racing', 'marker'], solid: false },
    grandstand: { name: 'Grandstand', summary: 'Tiered spectator stand with roof + banner', tags: ['racing', 'building'], solid: true },
    marshal_post: { name: 'Marshal post', summary: 'Raised marshal hut on legs', tags: ['racing', 'building'], solid: true },
    pit_building: { name: 'Pit building', summary: 'Long pits/garage block with bays', tags: ['racing', 'building'], solid: true },
    billboard: { name: 'Billboard', summary: 'Two-leg advertising board', tags: ['racing', 'prop'], solid: true },
    sign: { name: 'Course sign', summary: 'Square red/white corner sign', tags: ['racing', 'marker'], solid: false },
    tire_wall: { name: 'Tire wall', summary: 'Stacked tyre ring section, 2 m, painted centre tyre', tags: ['racing', 'barrier'], solid: true },
    hill: { name: 'Hill', summary: 'Low grassy landform with rock outcrops (7 m)', tags: ['nature', 'terrain'], solid: true },
    rock_snow: { name: 'Snow-topped rock', summary: 'Rock cluster with snow caps', tags: ['nature', 'rock', 'snow'], solid: true },
    boulder_snow: { name: 'Snow-topped boulder', summary: 'Hillside boulder with a snow cap', tags: ['nature', 'rock', 'snow'], solid: true },
    tree_pine_snow: { name: 'Snowy pine', summary: 'Tiered conifer with snow shelves', tags: ['nature', 'tree', 'snow'], solid: false },
    snowbank: { name: 'Snowbank', summary: 'Lumpy drift of packed snow', tags: ['nature', 'snow'], solid: true },
    tree_pine_tall: { name: 'Pine tree (tall)', summary: 'Slim high silhouette conifer, spire top', tags: ['nature', 'tree'], solid: false },
    rock_angular: { name: 'Angular rock', summary: 'Jagged low rock outcrop', tags: ['nature', 'rock'], solid: true },
}

// Colour families: a base prop plus the snow-capped sibling the mountain kit
// already ships. `variants` lists real sibling GLBs by id (all present in the
// kit); `colorways` names the tints a consumer can ask for. Index-only — it
// references existing files, never promises geometry that isn't there.
const FAMILIES = {
    rock: { variants: ['rock_snow', 'rock_angular'], colorways: ['default', 'snow'] },
    boulder: { variants: ['boulder_snow'], colorways: ['default', 'snow'] },
    tree_pine: { variants: ['tree_pine_snow', 'tree_pine_tall'], colorways: ['default', 'snow'] },
}

const moved = []
const stats = {}
for (const [id, fn] of Object.entries(DEFINITIONS)) {
    const soup = groundShade(fn())
    const p = join(SCENERY, `${id}.glb`)
    const r = writeGlb(p, soup)
    stats[id] = r
    moved.push({
        id,
        name: META[id].name,
        summary: META[id].summary,
        category: 'scenery',
        pack: 'Forge Scenery Kit (original)',
        author: 'Forge — authored procedurally for jalfern.com/retrogames',
        license: 'CC0-1.0',
        source: 'forge: scripts/build-shelf.mjs (original geometry, not a pack download)',
        path: `models/scenery/${id}.glb`,
        format: 'glb',
        solid: META[id].solid,
        units: 'metres',
        sizeBytes: r.bytes,
        triangles: Math.round(r.tris),
        vertices: r.verts,
        meters: { w: +(r.max[0] - r.min[0]).toFixed(2), h: +(r.max[1] - r.min[1]).toFixed(2), d: +(r.max[2] - r.min[2]).toFixed(2) },
        tags: META[id].tags,
        colorways: id.endsWith('_snow') ? ['snow'] : (FAMILIES[id]?.colorways || ['default']),
        variants: FAMILIES[id]?.variants || [],
    })
}

// Provenance for models already in the repo (moved here by this issue).
const CHAR_LICENSE_URL = 'http://creativecommons.org/publicdomain/zero/1.0/'
const CHAR_PACK = 'KayKit: Adventurers Character Pack 1.0'
const CHAR_AUTHOR = 'Kay Lousberg (kaylousberg.com)'
const CHAR_SRC = 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0'
const CHAR_NOTE = 'Trimmed: weapon/quiver props dropped, Idle/Jump_Start/Jump_Idle pose bases kept; see public/models/characters/LICENSE.txt'
const characters = ['rogue', 'knight', 'barbarian', 'mage', 'rogue_plain'].map((id) => {
    const p = join(ROOT, `public/models/characters/${id}.glb`)
    const r = existsSync(p) ? readGlb(p) : null
    return {
        id,
        name: id.replace(/_/g, ' '),
        summary: id === 'rogue' ? 'Hooded adventurer (rigged, pose bases)' : 'Adventurer body (rigged, pose bases)',
        category: 'characters',
        pack: CHAR_PACK,
        author: CHAR_AUTHOR,
        license: 'CC0-1.0',
        source: CHAR_SRC,
        note: CHAR_NOTE,
        path: `models/characters/${id}.glb`,
        format: 'glb',
        solid: false,
        rigged: true,
        units: 'metres',
        sizeBytes: r ? r.sizeBytes : statSync(p).size,
        triangles: r ? Math.round(r.tris) : null,
        vertices: r ? r.verts : null,
        meters: r ? { w: +(r.max[0] - r.min[0]).toFixed(2), h: +(r.max[1] - r.min[1]).toFixed(2), d: +(r.max[2] - r.min[2]).toFixed(2) } : null,
        tags: ['character', 'humanoid'],
    }
})

const buggyPath = join(ROOT, 'public/models/vehicles/dune_buggy.glb')
const buggy = readGlb(buggyPath)
const vehicles = [{
    id: 'dune_buggy',
    name: 'Dune buggy',
    summary: 'Kart chassis, four wheel pivots, recolourable paint',
    category: 'vehicles',
    pack: 'Forge vehicle (original)',
    author: 'Claude for jalfern.com/retrogames',
    license: 'CC0-1.0',
    source: 'forge: modelled for COMET DRIFT HD; see public/models/vehicles/README.md',
    note: 'Wheels are separate nodes Wheel_FL/FR/RL/RR; body paint is material Paint_Orange.',
    path: 'models/vehicles/dune_buggy.glb',
    format: 'glb',
    solid: true,
    units: 'metres',
    sizeBytes: buggy.sizeBytes,
    triangles: Math.round(buggy.tris),
    vertices: buggy.verts,
    meters: { w: +(buggy.max[0] - buggy.min[0]).toFixed(2), h: +(buggy.max[1] - buggy.min[1]).toFixed(2), d: +(buggy.max[2] - buggy.min[2]).toFixed(2) },
    tags: ['vehicle', 'kart', 'racing'],
}]

const entries = [...characters, ...vehicles, ...moved]
const shelf = {
    schema: 'retrogames-model-shelf/1',
    version: 1,
    updated: '2026-10-20',
    units: 'metres (1 unit = 1 m)',
    licensePolicy: 'CC0 / public domain only',
    browse: 'fetch /retrogames/models/shelf.json, or import src/utils/modelShelf.js and call browse()',
    note: 'Scenery is Forge-authored CC0 in the KayKit voxel idiom — itch.io pack downloads are outside the GitHub/npm-only network rule. Rigged characters and the buggy keep their original pack provenance.',
    totals: {
        count: entries.length,
        bytes: entries.reduce((a, e) => a + (e.sizeBytes || 0), 0),
        triangles: entries.reduce((a, e) => a + (e.triangles || 0), 0),
        categories: [...new Set(entries.map((e) => e.category))],
    },
    entries: entries.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id)),
}

writeFileSync(join(ROOT, 'public/models/shelf.json'), JSON.stringify(shelf, null, 2) + '\n')
console.log(`wrote public/models/shelf.json — ${entries.length} entries, ${(shelf.totals.bytes / 1024).toFixed(0)} KB, ${shelf.totals.triangles} tris`)
for (const m of moved) console.log(`  ${m.id.padEnd(14)} ${String(m.triangles).padStart(5)} tris  ${String(Math.round(m.sizeBytes / 1024)).padStart(3)} KB  ${JSON.stringify(m.meters)}`)
