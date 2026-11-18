// EXCITEBIKE EDIT TRACK (#2576) — a course is DATA, the editor is a compiler.
//
// The NES original's second menu entry (DESIGN YOUR OWN TRACK) lives here as
// pure functions shared by three readers: the editor (live FIT/NO under the
// cursor), the storage codec (localStorage, garbage-in/garbage-out), and the
// Node gate (`excitecheck` EDIT block — the SAME audit that refuses a save
// in the browser). A draft is a stamp list; compiling splices the stamps into
// a rolling base lap: template control points strictly inside a stamp's span
// are replaced by the stamp's own cps, so the heightmap stays continuous and
// deterministic, and every obstacle is real geometry the sim and the rival
// pace lines already respect (the ramp's lip is a genuine +52 crest at grade
// >0.28 — the auditor sees a step, the physics rides a jump; no band is a
// gameplay lie). Nothing here touches the DOM, localStorage, or the sim.

import { LAP, MUD, WATER, BOOST } from './levels.js'

export const CUSTOM_MAX = 3            // three save slots, like a cartridge battery
export const CUSTOM_BITE = 7         // custom courses grade past the six (#2573 item 5 may retune)
export const STAMP_KINDS = ['RAMP', 'STEP', 'WHOOPS', 'MUD', 'WATER', 'BOOST']
// YOUR LAPS (#2625 stage 1): the designer sets the race length. The original's
// edit mode lets you choose the lap count; this port offers 1–8 with the house
// book (2) as the default, so every design saved BEFORE this law rides exactly
// as it did (old codec entries fall back to 2 — see lapsOf/the codec below).
export const LAPS_MIN = 1
export const LAPS_MAX = 8
export const LAPS_DEFAULT = 2
export const lapsOf = (v) => (Number.isInteger(v) && v >= LAPS_MIN && v <= LAPS_MAX ? v : LAPS_DEFAULT)
// the editor's tool strip: the six obstacles plus TEST / LAP / ERASE / SAVE /
// EXIT verbs. TEST (#2587) sits BEFORE the verbs on purpose: the strip's
// backward wrap from the first stamp still lands on EXIT, so every menu-wrap
// pin holds. LAP (#2625) joins it there — a SETTING tool, before the verbs,
// and the strip still ends in EXIT (the wrap law is tested, not assumed).
export const TOOLS = [...STAMP_KINDS, 'TEST', 'LAP', 'ERASE', 'NAME', 'SAVE', 'EXIT']

// #2651 NAME — the bay gives a design its own name (the NES asks for one when
// you save your own course). Pure helpers so excitecheck grades the grammar:
// a wheel of 27 glyphs (A–Z + a space), a 12-char cap that matches the
// compileCustom slice, and the save-time normalisation — an unnamed (or pure
// whitespace) draft still lands on the `CUSTOM` placeholder, so storage and the
// attract fallback never see an empty name.
export const NAME_MAX = 12
export const NAME_WHEEL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ '
export const pushName = (name, glyph) => (String(name || '').length >= NAME_MAX ? null : String(name || '') + glyph)
export const popName = (name) => String(name || '').slice(0, -1)
export const designName = (name) => {
    const n = String(name || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, NAME_MAX)
    return n || 'CUSTOM'
}

// #2632 YOUR-LAPS polish — the four view-layer tells the QA pass asked for,
// kept PURE so `excitecheck` grades them without a browser (the page paints
// them; the law lives once, here):
//  1) the over screen announces the book — the NES edit runs said their
//     distance; a default-book run stays exactly the plain board line;
//  2) the LAP bump gets a tell at the ends of the book: arriving at the
//     top (8) and wrapping back to 1 deserve more than the step tone;
//  3) the splash badge has a compact form for phone widths (pips grammar);
//  4) the first default-book SAVE teaches the LAP tool — once per storage.
export const lapLabel = (laps) => `${laps} LAP${laps === 1 ? '' : 'S'}`
export const overBookLabel = (seat, laps) => (seat >= 1 && laps !== LAPS_DEFAULT ? `CUSTOM ${seat} · ${lapLabel(laps)}` : '')
export const lapCycle = (laps) => {
    const next = laps >= LAPS_MAX ? LAPS_MIN : laps + 1
    return { laps: next, tell: next === LAPS_MAX ? 'top' : next === LAPS_MIN ? 'wrap' : null }
}
export const badgeCompact = (laps) => (laps === LAPS_DEFAULT ? '★' : `★ ${laps}L`)
export const LAP_TIP = 'TIP: LAP SETS YOUR RACE LENGTH'
export const LAP_TIP_KEY = 'excitebike.lap-tip.v1'
export const lapTipFor = (laps, seen) => (laps === LAPS_DEFAULT && !seen ? LAP_TIP : '')
export const CUR_STEP = 40           // cursor quantum; stamp footprints align to it
export const MAX_STAMPS = 12

// footprint width per kind (px of lap the stamp claims, audit margin included)
export const SPAN = { RAMP: 480, STEP: 460, WHOOPS: 260, MUD: 220, WATER: 200, BOOST: 240 }
export const EDGE = 80               // keep the start/finish seam flat

// the base lap: gentle rolling dunes, flat and equal at both ends so the seam
// is legal before a single stamp lands. This is the blank the player draws on.
export const BASE_CPS = [
    [0, 96], [480, 96], [760, 86], [1040, 98], [1360, 88], [1680, 98],
    [2000, 92], [2400, 98], [2760, 88], [3120, 98], [3440, 90], [3800, 98],
    [4160, 92], [4520, 98], [4880, 88], [5240, 96], [5600, 92], [6040, 96], [LAP, 96],
]

function baseH(x) {
    const cps = BASE_CPS
    if (x <= 0) return cps[0][1]
    for (let i = 0; i < cps.length - 1; i++) {
        const [x0, h0] = cps[i]; const [x1, h1] = cps[i + 1]
        if (x <= x1) return h0 + (h1 - h0) * ((x - x0) / (x1 - x0))
    }
    return cps[cps.length - 1][1]
}

// the stamp's own control points, seated on the base height at its edges so
// the splice is continuous with whatever template line survives around it.
function stampCps(kind, x) {
    const span = SPAN[kind]
    const b0 = baseH(x); const b1 = baseH(x + span)
    if (kind === 'RAMP') {
        return [[x, b0], [x + 150, b0 + 52], [x + 154, b0 + 52], [x + 304, b0 - 30], [x + span, b1]]
    }
    if (kind === 'STEP') {
        return [[x, b0], [x + 130, b0 + 44], [x + 136, b0 + 46], [x + 300, b0 + 46], [x + span, b1]]
    }
    if (kind === 'WATER') {
        return [[x, b0], [x + 50, b0 - 24], [x + 150, b0 - 24], [x + span, b1]]
    }
    return []      // WHOOPS/MUD/BOOST are bands; WHOOPS stamps real sine via buildGround
}
function stampBand(kind, x) {
    const span = SPAN[kind]
    if (kind === 'WHOOPS') return { whoops: [x, x + span, 7, 3] }
    if (kind === 'MUD') return [MUD, x, x + span, 1]
    if (kind === 'BOOST') return [BOOST, x, x + span, 1]
    if (kind === 'WATER') return [WATER, x + 8, x + span - 8, 1]
    return null
}

// compile a draft (stamps: [{kind, x}]) into a track-table `{name,cps,bands}`.
// Deterministic: same stamps in, byte-identical tables out (the harness pins
// this). Overlapping stamps still compile — auditCustomData is what refuses.
export function compileCustom(stamps, name = 'CUSTOM') {
    const s = (stamps || []).map((o) => (Array.isArray(o) ? { kind: o[0], x: o[1] } : o))
        .sort((a, b) => a.x - b.x)
    let cps = BASE_CPS.map(([x, h]) => [x, h])
    const bands = []
    for (const st of s) {
        const span = SPAN[st.kind]
        if (span === undefined) continue
        cps = cps.filter(([x]) => !(x > st.x && x < st.x + span))
        cps.push(...stampCps(st.kind, st.x))
        const bd = stampBand(st.kind, st.x)
        if (bd) bands.push(bd)
    }
    cps.sort((a, b) => a[0] - b[0])
    // a stamp edge that lands exactly on a template cp sits at the same x with
    // the same height (edges are seated on baseH by construction) — keep one.
    cps = cps.filter(([x], k) => k === 0 || x !== cps[k - 1][0])
    bands.sort((a, b) => (a.whoops ? a.whoops[0] : a[1]) - (b.whoops ? b.whoops[0] : b[1]))
    return { name: String(name || 'CUSTOM').slice(0, 12), bite: CUSTOM_BITE, cps, bands, stamps: s.map((st) => [st.kind, st.x]), source: 'custom' }
}

// the single legality law, read by editor and harness alike.
export function auditCustomData(t, groundY) {
    const st = t.stamps || []
    if (!st.length) return { ok: false, why: 'DRAW SOMETHING FIRST' }
    for (let i = 1; i < t.cps.length; i++) {
        if (t.cps[i][0] <= t.cps[i - 1][0]) return { ok: false, why: 'COURSE RUNS BACKWARD' }
    }
    for (const [x, h] of t.cps) {
        if (x < 0 || x > LAP || h < 40 || h > 165) return { ok: false, why: 'COURSE LEAVES THE WORLD' }
    }
    const a = groundY(t.ground, LAP - 2); const b = groundY(t.ground, 2)
    if (Math.abs(a - b) >= 6) return { ok: false, why: 'LAP DOES NOT CLOSE AT THE LINE' }
    // no voids: the ground must EXIST everywhere on the lap. A compiler that
    // drops the terrain outside a stamp span (a flipped filter once did exactly
    // this) used to pass every local check — the world being missing is not local.
    for (let x = 0; x < LAP; x += 16) {
        if (!(groundY(t.ground, x) > 40 && groundY(t.ground, x) < 165)) return { ok: false, why: 'THE COURSE HAS HOLES' }
    }
    for (const band of t.bands) {
        const [x0, x1] = band.whoops ? [band.whoops[0], band.whoops[1]] : [band[1], band[2]]
        if (!(x0 > 0 && x1 < LAP && x1 > x0)) return { ok: false, why: 'A BAND LIES OFF THE COURSE' }
    }
    // footprints: disjoint, inside the seam margins — the stamps the player
    // actually placed, judged as placed (terrain splicing alone wouldn't see
    // a RAMP landing a STEP in its airstream).
    const spans = st.map((s) => ({ x0: s.kind ? s.x : s[1], x1: (s.kind ? s.x : s[1]) + SPAN[s.kind || s[0]] }))
        .sort((p, q) => p.x0 - q.x0)
    for (const sp of spans) {
        if (sp.x0 < EDGE || sp.x1 > LAP - EDGE) return { ok: false, why: 'KEEP CLEAR OF THE START LINE' }
    }
    for (let i = 1; i < spans.length; i++) {
        if (spans[i].x0 < spans[i - 1].x1) return { ok: false, why: 'OBSTACLES OVERLAP' }
    }
    return { ok: true, why: 'RIDE IT' }
}

// live fit for the editor cursor: same law, hypothetical (kind, x) appended to
// the draft — yellow footprints fit, red ones would be refused at SAVE.
export function fitsAt(stamps, kind, x) {
    if (SPAN[kind] === undefined) return true
    if (stamps.length >= MAX_STAMPS) return false
    if (x < EDGE || x + SPAN[kind] > LAP - EDGE) return false
    return !stamps.some((s) => x < s.x + SPAN[s.kind] && s.x < x + SPAN[kind])
}

// the stamp sitting under the cursor, for ERASE
export function stampAt(stamps, x) {
    return stamps.findIndex((s) => x >= s.x && x < s.x + SPAN[s.kind])
}

// ghost profile for the editor cursor: the stamp's own cps (absolute heights
// against the untouched base — the ghost only paints where a stamp FITS, and
// where one fits the base template is exactly what the stamp would sit on).
export function stampShape(kind, x) {
    return stampCps(kind, x)
}

// ---- storage codec (garbage in, empty shelf out) ---------------------------
export const CUSTOM_KEY = 'excitebike.tracks.v1'

export function encodeCustom(list) {
    return JSON.stringify((list || []).slice(0, CUSTOM_MAX).map((t) => ({
        name: t.name,
        laps: lapsOf(t.laps), // #2625 the designer's number rides with the design
        stamps: (t.stamps || []).filter((s) => STAMP_KINDS.includes(s[0]) && Number.isInteger(s[1])).slice(0, MAX_STAMPS),
    })))
}

export function decodeCustom(raw) {
    let v
    try { v = JSON.parse(raw) } catch { return [] }
    if (!Array.isArray(v)) return []
    const out = []
    for (const t of v.slice(0, CUSTOM_MAX)) {
        if (!t || !Array.isArray(t.stamps)) continue
        const stamps = []
        let bad = false
        for (const s of t.stamps.slice(0, MAX_STAMPS)) {
            if (!Array.isArray(s) || !STAMP_KINDS.includes(s[0]) || !Number.isInteger(s[1]) || s[1] < 0 || s[1] > LAP) { bad = true; break }
            stamps.push([s[0], s[1]])
        }
        if (bad) continue
        // #2625 laps are validated, never fatal: an old-format or garbage laps
        // value falls back to the house book — it must not drop the entry.
        out.push({ name: typeof t.name === 'string' && t.name ? t.name.slice(0, 12) : 'CUSTOM', laps: lapsOf(t.laps), stamps })
    }
    return out
}
