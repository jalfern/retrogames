// retrogames-trace/v1 — per-tick game state as a port-parity spec (#2402).
//
// A golden trace is the whole sim state, flattened and quantized, at EVERY
// tick of a deterministic run. A native port replays the sibling
// `retrogames-rec/v1` recording and diffs its own state against these rows:
// the first differing tick and field is the bug. Compact by design:
//
//   {
//     format: "retrogames-trace/v1", game: "joust", rec: "joust-1p.json",
//     build: "<sha>|unknown", seed: 1, players: 1, ticks: 1200, quant: 1000,
//     excludes: ["events"],           // top-level state keys left out (see why)
//     consts: { "players2": 1, ... },        // identical at every single tick
//     fields: ["deaths", "eggs.0.x", ...],  // sorted paths that change at all
//     rows: [ [i0, v0, i1, v1, ...], ... ]  // flat [fieldIdx, value] pairs
//   }
//
// Decoding (any language): running state = consts plus `fields` all null.
// For tick t (1-based), walk rows[t-1] two at a time and set fields[idx]=v.
// A field NOT named in a row carries its value over from tick t-1 — the
// writer emits a pair exactly when the value changes (including a change to
// null: a field whose array shrank past it gets an explicit null). So the
// decoded state exists for EVERY field at EVERY tick, unambiguously.
//
// Quantization: every finite number is stored as Math.round(v * quant), an
// integer, so the file has no float-repr ambiguity across languages; `hash`
// is the game's own state hash, stored raw (already an integer). Booleans
// stay true/false, strings stay strings (rare; wave names, screen ids),
// null stays null. Functions (rng closures), `_`-prefixed keys (per-run
// scratch) and the `excludes` list (cosmetic or shell-drained channels) are
// deliberately not state a port must reproduce — each exclusion is justified
// in the game README's traces section.

export const TRACE_FORMAT = 'retrogames-trace/v1'
export const QUANT = 1000

// Flatten to dotted paths. Arrays index as `path.0`; objects recurse.
// Skips: functions, `_`-prefixed keys, excluded top-level keys, cycles.
export function flattenState(state, excludes = []) {
    const out = {}
    const seen = new Set()
    const walk = (v, path) => {
        if (typeof v === 'function') return
        if (v === null) { out[path] = null; return }
        const t = typeof v
        if (t === 'number') { out[path] = Number.isFinite(v) ? Math.round(v * QUANT) : null; return }
        if (t === 'boolean' || t === 'string') { out[path] = v; return }
        if (Array.isArray(v)) {
            if (seen.has(v)) return
            seen.add(v)
            if (!v.length) out[path] = [] // empty array is itself a fact: "no eggs this tick"
            v.forEach((x, i) => walk(x, path ? `${path}.${i}` : `${i}`))
            seen.delete(v)
            return
        }
        if (t === 'object') {
            if (seen.has(v)) return
            seen.add(v)
            for (const k of Object.keys(v)) {
                if (k.startsWith('_')) continue
                walk(v[k], path ? `${path}.${k}` : k)
            }
            seen.delete(v)
        }
    }
    for (const k of Object.keys(state)) {
        if (k.startsWith('_') || excludes.includes(k)) continue
        walk(state[k], k)
    }
    return out
}

// Build the trace document from per-tick flattened maps (index 0 = tick 1).
// Every tick MUST carry a `hash` cell — a trace without a hash per tick
// cannot cheaply name where a port first diverges.
export function buildTrace(header, perTick) {
    const fieldsSeen = new Set()
    for (const m of perTick) for (const k of Object.keys(m)) fieldsSeen.add(k)
    const all = [...fieldsSeen].sort()
    if (!all.includes('hash')) throw new Error('buildTrace: state has no `hash` field')
    // consts = paths present with an identical value at every tick
    const consts = {}
    for (const k of all) {
        let same = true
        let first
        for (const m of perTick) {
            if (!(k in m)) { same = false; break }
            const v = JSON.stringify(m[k])
            if (first === undefined) first = v
            else if (v !== first) { same = false; break }
        }
        if (same) consts[k] = JSON.parse(first)
    }
    const fields = all.filter((k) => !(k in consts))
    const fidx = new Map(fields.map((k, i) => [k, i]))
    const prev = {}
    const rows = perTick.map((m) => {
        const d = []
        for (const k of fields) {
            const v = k in m ? m[k] : null
            const pv = k in prev ? prev[k] : null
            if (JSON.stringify(v) !== JSON.stringify(pv)) { d.push(fidx.get(k), v); prev[k] = v }
        }
        return d
    })
    return { format: TRACE_FORMAT, ...header, quant: QUANT, fields, consts, rows }
}

// Reconstruct the full flattened state map for every tick (carry-over rows).
export function decodeTrace(trace) {
    const out = []
    const cur = {}
    for (const k of trace.fields) cur[k] = null
    for (const k of Object.keys(trace.consts)) cur[k] = trace.consts[k]
    for (const row of trace.rows) {
        for (let i = 0; i < row.length; i += 2) cur[trace.fields[row[i]]] = row[i + 1]
        out.push({ ...cur })
    }
    return out
}

// First divergence between two traces: tick (1-based), field, values.
// This is the primitive the tvOS ports call: golden vs. their own dump.
export function diffTraces(a, b) {
    if (a.game !== b.game) return { ok: false, why: `game mismatch: ${a.game} vs ${b.game}` }
    if (a.seed !== b.seed) return { ok: false, why: `seed mismatch: ${a.seed} vs ${b.seed}` }
    if (a.ticks !== b.ticks) return { ok: false, why: `ticks mismatch: ${a.ticks} vs ${b.ticks}` }
    const sa = decodeTrace(a)
    const sb = decodeTrace(b)
    if (sa.length !== b.rows.length || sb.length !== a.rows.length) return { ok: false, why: 'row count mismatch after decode' }
    for (let t = 0; t < sa.length; t++) {
        const keys = new Set([...Object.keys(sa[t]), ...Object.keys(sb[t])])
        for (const k of [...keys].sort()) {
            const va = sa[t][k] ?? null
            const vb = sb[t][k] ?? null
            if (JSON.stringify(va) !== JSON.stringify(vb)) {
                return { ok: false, tick: t + 1, field: k, golden: va, port: vb }
            }
        }
    }
    return { ok: true }
}
