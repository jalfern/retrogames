// modelindexcheck — gate for the shared 3D model LIBRARY index (#1140).
// Node-only, fully offline (CI never touches the linked sources; the shortlist's
// licenses were verified against khronos metadata.json at authoring time and the
// verified{} stamp records that). Proves: the index boots (parses, schema), its
// law holds (all five required libraries, per-entry fields, https-only links,
// link-only — no committed paths, iPhone budget notes, SimReady physics caveats,
// doc links exist), and the gate is the same code everywhere (every declared
// gate recomputes to the same verdict from src/utils/modelLibrary.js).
// The built-in mutant rewrites one CC0 candidate to SCEA in memory and demands
// the verdict flip — the tool must be able to fail.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { licenseGate, gateFor } from '../src/utils/modelLibrary.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = join(ROOT, 'public/models')

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ok   ' + m) }
const bad = (m) => { fail++; console.log('  FAIL ' + m) }
const check = (cond, m) => (cond ? ok(m) : bad(m))

// ---- 1. Boots.
let idx
try {
    idx = JSON.parse(readFileSync(join(MODELS, 'libraries.json'), 'utf8'))
    ok('libraries.json parses')
} catch (e) {
    bad('libraries.json: ' + e.message)
    console.log(`\nmodelindexcheck: ${pass} pass, ${fail} fail`)
    process.exit(1)
}
check(idx.schema === 'retrogames-model-libraries/1', `schema is ${idx.schema}`)
check(typeof idx.version === 'number' && idx.version >= 1, `version ${idx.version}`)
check(/^\d{4}-\d{2}-\d{2}$/.test(idx.updated || ''), `updated ${idx.updated}`)
check(/mirror/i.test(idx.policy || '') && /link/i.test(idx.policy || ''), 'policy: link, never mirror')
check(Object.keys(idx.gate || {}).length >= 4 && ['ship', 'credit', 'review', 'never'].every((g) => idx.gate[g]), 'gate defines ship/credit/review/never')
check(Number.isInteger(idx.iphoneBudget?.bytes) && idx.iphoneBudget.bytes >= 100_000, `iPhone budget ${(idx.iphoneBudget?.bytes / 1024).toFixed(0)} KB`)

// ---- 2. Libraries: all five from the issue, every field, honest physics.
const REQUIRED = ['kenney', 'quaternius', 'polyhaven', 'khronos-samples', 'nvidia-simready']
const libIds = (idx.libraries || []).map((l) => l.id)
check(REQUIRED.every((id) => libIds.includes(id)), `all five libraries present (${libIds.join(', ')})`)
check(new Set(libIds).size === libIds.length, 'library ids unique')
for (const l of idx.libraries || []) {
    const has = (f) => l[f] !== undefined && l[f] !== ''
    const https = /^https:\/\//.test(l.url || '')
    const fmts = Array.isArray(l.formats) && l.formats.length > 0
    check(has('id') && has('name') && https && has('what') && has('license') && has('licenseScope') && fmts && typeof l.physics === 'boolean' && has('pull') && has('status'),
        `library ${l.id}: all fields (https url, formats, physics, pull, status)`)
}
const simready = idx.libraries?.find((l) => l.id === 'nvidia-simready')
check(simready && simready.physics === true, 'simready flagged physics:true')
check(simready && /mass/.test(simready.physicsData || '') && /GLB carries no physics/i.test(simready.physicsData || ''),
    'simready physicsData keeps mass/friction record + GLB-carries-no-physics warning')
check(simready && /per.supplier|per.asset/i.test(simready.licenseScope || ''), 'simready license is per-supplier, check each asset')
const khronos = idx.libraries?.find((l) => l.id === 'khronos-samples')
check(khronos && /metadata/i.test(khronos.licenseScope || ''), 'khronos scope tells you to read per-asset metadata.json')

// ---- 3. Shortlist: fields, link-only, budget, provenance.
const models = idx.models || []
check(models.length >= 5, `shortlist has ${models.length} candidates`)
check(new Set(models.map((m) => m.id)).size === models.length, 'model ids unique')
const GATE_SET = new Set(['ship', 'credit', 'review', 'never'])
for (const m of models) {
    const fieldsOk = m.name && /^https:\/\//.test(m.url || '') && m.license && m.credit &&
        GATE_SET.has(m.gate) && m.format === 'glb' && m.sizeBytes > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(m.verified?.date || '') && m.verified?.method &&
        libIds.includes(m.library)
    check(fieldsOk, `candidate ${m.id}: fields complete (https, license, credit, gate, verified, known library)`)
    check(!('path' in m), `candidate ${m.id} is link-only (no committed path — the shelf owns files)`)
    const heavy = m.sizeBytes > idx.iphoneBudget.bytes
    check(!heavy || (m.heavy === true && m.reduce), `candidate ${m.id} within iPhone budget or carries a reduce note`)
}
check(models.some((m) => m.gate === 'ship' && m.sizeBytes <= idx.iphoneBudget.bytes), 'at least one ship-ready CC0 candidate under budget')
check(models.some((m) => m.gate === 'never'), 'at least one gate-blocked candidate (the gate must be able to refuse)')
check(models.every((m) => m.gate !== 'ship' || /CC0/i.test(m.license)), 'no ship-grade entry without CC0 in its license')

// ---- 4. The gate is one law: declared verdicts recompute from shipped code.
let drift = 0
for (const m of models) if (gateFor(m) !== m.gate) { drift++; bad(`candidate ${m.id}: declared gate ${m.gate} != computed ${gateFor(m)}`) }
check(drift === 0, `all ${models.length} declared gates recompute via licenseGate()`)

const TT = [
    ['CC0-1.0', 'ship'], ['CC-PDDC', 'ship'],
    ['CC-BY-4.0', 'credit'], ['CC-BY 3.0', 'credit'],
    ['CC-BY-NC-4.0', 'review'], ['CC-BY-NC-SA', 'review'],
    ['SCEA-1.0', 'never'], ['ARR', 'never'], ['GPL-3.0', 'never'],
    ['CC0-1.0 + CC-BY-4.0', 'credit'],
    ['CC-BY-4.0 + CC-BY-NC-4.0', 'review'],
    ['LicenseRef-LegalMark-Cesium', 'review'],
    ['CC0-1.0 + LicenseRef-LegalMark-Cesium', 'review'],
    ['WTFPL-ish unknown', 'review'], ['', 'review'],
]
let ttBad = 0
for (const [lic, want] of TT) {
    const got = licenseGate(lic)
    if (got !== want) { ttBad++; bad(`licenseGate("${lic}") = ${got}, want ${want}`) }
}
check(ttBad === 0, `license truth table ${TT.length - ttBad}/${TT.length} (strictest component wins)`)

// ---- 5. Findable: the docs link it.
check(existsSync(join(ROOT, 'docs/MODELS.md')), 'docs/MODELS.md exists')
const mode = readFileSync(join(ROOT, 'docs/MODELS.md'), 'utf8')
check(/shelf/i.test(mode) && /librar/i.test(mode) && /SimReady/.test(mode), 'MODELS.md covers shelf + libraries + SimReady physics')
const ag = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
check(ag.includes('docs/MODELS.md'), 'AGENTS.md links docs/MODELS.md')
const ai = readFileSync(join(ROOT, 'docs/AI.md'), 'utf8')
check(/MODELS\.md/.test(ai) && /SimReady/.test(ai), 'docs/AI.md points at the index (robot-learning physics)')
const shell = readFileSync(join(ROOT, 'docs/GAME-SHELL.md'), 'utf8')
check(/modelLibrary/.test(shell) && /MODELS\.md/.test(shell), 'GAME-SHELL.md: check shelf + index before modelling')
const forge = readFileSync(join(ROOT, 'scripts/FORGE.md'), 'utf8')
check(forge.includes('docs/MODELS.md'), 'scripts/FORGE.md step 4 points at the index')
const shelfRd = readFileSync(join(MODELS, 'README.md'), 'utf8')
check(/libraries\.json/.test(shelfRd), 'shelf README cross-links libraries.json')

// ---- 6. Mutant: the check must be able to fail. A CC0 candidate silently
// relicensed to SCEA must trip the recompute gate.
const mutant = JSON.parse(JSON.stringify(idx))
mutant.models[0].license = 'SCEA-1.0'
const tripped = mutant.models.some((m) => gateFor(m) !== m.gate)
check(tripped, 'mutant (CC0 -> SCEA on a shortlist entry) flips the verdict')
const mut2 = JSON.parse(JSON.stringify(idx))
mut2.libraries = mut2.libraries.filter((l) => l.id !== 'polyhaven')
check(!REQUIRED.every((id) => mut2.libraries.map((l) => l.id).includes(id)), 'mutant (drop a required library) breaks the five-library gate')

console.log(`\nmodelindexcheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
