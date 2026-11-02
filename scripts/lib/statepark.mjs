// statepark.mjs — the #1430 STATE.md handoff, race-proof. Pure core; the IO
// shell is scripts/statepark.mjs (park/read CLI for the playbooks), the gate
// is lanecheck.mjs section D (offline a/b race simulation).
import * as nodefs from 'node:fs'
//
// The bug (#1430, bit live 2026-11-01 and twice again 2026-11-02): step 9
// deliberately leaves the session report written-but-uncommitted in the main
// checkout's STATE.md, and step 1 of every later session parks it to the ONE
// shared path /tmp/forge/STATE.parked.md before `git checkout -- STATE.md`.
// Two lanes kicked on the same tick interleave freely: one lane's checkout (or
// its park of older content) lands between another lane's write and its read,
// and the report is gone — replaced in the park by a previous session's copy.
//
// The fix is two properties:
//   1. WRITE is slot-scoped — a report lands in STATE.<slot>.parked.md, so
//      no lane can ever overwrite another lane's park. The legacy shared path
//      keeps being written during migration (old playbook text still reads it).
//   2. READ is newest-of-all — the report is whatever is newest among
//      {STATE.md, every STATE.*.parked.md}, EXCLUDING candidates whose content
//      equals the committed HEAD copy (a checkout-revert makes STATE.md the
//      newest file on disk and it is by definition NOT a fresh report). If
//      nothing differs from HEAD, there is no pending report — honest silence,
//      never a stale one served as fresh.

export const PARK_DIR = '/tmp/forge'
export const LEGACY_PARK = 'STATE.parked.md'

export const parkPath = (slot, dir = PARK_DIR) => {
    if (!/^[a-z0-9-]+$/.test(String(slot || ''))) throw new Error(`statepark: bad slot ${JSON.stringify(slot)}`)
    return `${dir}/STATE.${slot}.parked.md`
}

// The files a reader must consider, newest park first in name. `statePath` is
// the main checkout's STATE.md (which may already be reverted to HEAD).
export const candidatePaths = ({ statePath = 'STATE.md', parkDir = PARK_DIR,
    slots = ['a', 'b'] } = {}) =>
    [statePath, ...slots.map((s) => parkPath(s, parkDir)), `${parkDir}/${LEGACY_PARK}`]

// Pure read: given {path, mtimeMs, content} candidates (missing files omitted)
// and the committed HEAD copy of STATE.md, return the newest candidate whose
// content is non-empty and differs from HEAD — the handoff. null = no report.
export function newestReport(candidates, headContent = null) {
    const fresh = (candidates || []).filter((c) =>
        c && typeof c.content === 'string' && c.content.trim() !== '' &&
        (headContent === null || c.content !== headContent))
    if (!fresh.length) return null
    return fresh.slice().sort((x, y) => y.mtimeMs - x.mtimeMs)[0]
}

// IO: collect candidates from disk (skips unreadable) and resolve the report.
// `fs` is injectable for the gate.
export function readReport({ statePath = 'STATE.md', parkDir = PARK_DIR,
    slots = ['a', 'b'], headContent = null, fs = nodefs } = {}) {
    const candidates = []
    for (const p of candidatePaths({ statePath, parkDir, slots })) {
        try {
            const content = fs.readFileSync(p, 'utf8')
            candidates.push({ path: p, mtimeMs: fs.statSync(p).mtimeMs, content })
        } catch { /* missing park file is normal */ }
    }
    return { report: newestReport(candidates, headContent), candidates }
}

// IO: park a report content slot-scoped (+ legacy during migration). Writes
// STATE.md alongside when asked (the forge lane's step 9 keeps STATE.md as the
// law requires; the park is the extra copy that cannot be raced away).
export function parkReport({ content, slot, parkDir = PARK_DIR, legacy = true,
    fs = nodefs } = {}) {
    const written = []
    const dest = parkPath(slot, parkDir)
    fs.mkdirSync(parkDir, { recursive: true })
    fs.writeFileSync(dest, content)
    written.push(dest)
    if (legacy) {
        const leg = `${parkDir}/${LEGACY_PARK}`
        fs.writeFileSync(leg, content)
        written.push(leg)
    }
    return written
}
