// floor.js — the factory floor's derivation layer, #103.
//
// Pure: board data in, scene state out. No fetch, no DOM, no clock it
// invents (`now` is injected so the harness can pin freshness). The
// animation in FactoryFloor.jsx and the gate in scripts/forgecheck.mjs
// both read THIS and nothing else — decoration that derives from a
// second copy of the truth is how lamps end up lying.

export const FRESH_MS = 15 * 60 * 1000

export const kv = line => Object.fromEntries(line.split(/\s+/).slice(1).map(t => t.split('=')))

export const labelOf = (issue, name) => issue.labels.some(l => l.name === name)

export const shortName = title => {
    const s = (title || '').replace(/^GAME.*?—\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()
    const cut = s.length > 14 ? s.slice(0, 13) + '…' : s
    return cut || (title || '').slice(0, 14) || '?'
}

export function deriveFloor({ issues = null, prs = [], pulses = [], now = Date.now() } = {}) {
    const list = (issues ?? []).filter(i => !i.pull_request)

    // Same membership rule the board's queue section uses — one rule, two readers.
    const queued = list
        .filter(i => !labelOf(i, 'building') && !labelOf(i, 'shipped')
            && (labelOf(i, 'game-queue') || /^game\b/i.test(i.title)))
        .sort((a, b) => a.number - b.number)

    const building = list.filter(i => labelOf(i, 'building') && i.state === 'open')
    const shipped = list.filter(i => labelOf(i, 'shipped')).sort((a, b) => a.number - b.number)

    const pulse = pulses[0] ? kv(pulses[0].body.split('\n')[0]) : null
    const prev = pulses[1] ? kv(pulses[1].body.split('\n')[0]) : null

    const age = pulses[0] ? now - Date.parse(pulses[0].updated_at) : Infinity
    const fresh = Number.isFinite(age) && age < FRESH_MS

    const anvil = {
        glow: building.length > 0,
        spark: fresh,
        dark: building.length === 0 && !fresh,
        building: building[0] ? shortName(building[0].title) : null,
    }

    // Mirrors the CI GATE lamp exactly: an open PR outranks the last pulse.
    const openPr = prs[0] ?? null
    const gate = openPr
        ? { busy: true, pr: openPr.number, url: openPr.html_url, note: 'IN CHECKS' }
        : pulse?.gate && pulse.gate !== 'none'
            ? { busy: true, pr: null, url: null, note: pulse.gate }
            : { busy: false, pr: null, url: null, note: 'clear' }

    // A cart only rolls on evidence: the newest pulse reports MORE shipped
    // than the one before it. One lone pulse proves no flip, so nothing rolls.
    const shipDelta = pulse && prev ? (+pulse.shipped || 0) - (+prev.shipped || 0) : 0
    const cart = shipDelta > 0 ? { count: shipDelta } : null

    return { queued, building, shipped, pulse, anvil, gate, cart, shelf: shipped }
}
