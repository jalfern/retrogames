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


export const ago = (hhmmss, now) => {
    const [h, m, s] = hhmmss.split(':').map(Number)
    const d = new Date()
    d.setHours(h, m, s, 0)
    return Math.max(0, Math.round((now - d.getTime()) / 1000))
}

// applyOrder(list, order, key) -> the list with the `order` keys first, in the
// order given; every item not named in `order` follows in its original order.
// Pure: no DOM, no storage, so forgecheck can pin it without a browser. `order`
// is a flat array of keys (issue numbers) persisted by the board's drag re-order.
// A key that is no longer in the list is dropped; a duplicate ranks by first
// occurrence; an empty/missing `order` is the identity (the list is untouched).
export const applyOrder = (list, order, key = i => i.number) => {
    if (!Array.isArray(order) || order.length === 0) return list
    const present = new Set(list.map(key))
    const rank = new Map()
    let r = 0
    for (const k of order) if (present.has(k) && !rank.has(k)) rank.set(k, r++)
    if (rank.size === 0) return list
    const ranked = list.filter(i => rank.has(key(i)))
    const rest = list.filter(i => !rank.has(key(i)))
    ranked.sort((a, b) => rank.get(key(a)) - rank.get(key(b)))
    return [...ranked, ...rest]
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

// runwayBadge (#1201) — the runway strip's { text, tone } from board.json's
// `runway` block. Pure and shared so runwaycheck can pin it without a
// browser: the amber RULE is decided upstream (scripts/lib/runway.mjs owns
// "under a day"); this only maps states to colours and hides stale data
// (>1 h old = yesterday's weather — dim, not confident green).
export const runwayBadge = (runway, now = Date.now()) => {
    if (!runway || !runway.line) return null
    const stale = !!runway.generated && now - Date.parse(runway.generated) > 60 * 60 * 1000
    const amber = !!(runway.builder?.amber || runway.qa?.amber)
    const polish = !!(runway.builder?.polish || runway.qa?.polish)
    return { text: runway.line, tone: stale ? 'dim' : amber ? 'amber' : polish ? 'violet' : 'green', stale }
}

// slotsLine (#1258) — the live fleet row: which of the two builder slots and
// the QA lanes hold a session right now. Input is board.json's `slots` block
// (baked by telemetry.sh; null entry = idle). Pure and defensive: no slots or
// a malformed one returns null (the row hides), never throws. `busy` counts
// running builder slots so the JSX can tone it; `fleet` carries the trial
// state ('trial' while the 48 h #1258 trial runs, else the verdict word).
export const slotsLine = (slots) => {
    if (!slots || typeof slots !== 'object') return null
    const cell = (name, s) => `${name}:${s && s.pid ? `up ${String(s.up || '').trim()}` : 'idle'}`
    const parts = [
        cell('builder-a', slots.a),
        cell('builder-b', slots.b),
        cell('qa·studio', slots.qaStudio),
        cell('qa·mini', slots.qaMini),
    ]
    const busy = [slots.a, slots.b].filter((s) => s && s.pid).length
    let fleet = null
    if (slots.trial && slots.trial.since && !slots.trial.reported) fleet = 'trial'
    else if (typeof slots.verdict === 'string' && slots.verdict) fleet = slots.verdict.split(' ')[0]
    return { text: parts.join(' · ') + (fleet ? ` · fleet:${fleet}` : ''), busy, total: 2, fleet }
}

// sleepBanner (#1354) — the red strip atop /forge when the Studio itself was
// asleep. Input is the newest pulse's kv block (asleep=HH:MM-HH:MM asleepm=N
// [naps=N]); the warden only echoes a window for 24 h after it ends, so the
// banner never needs its own clock math beyond the injected minutes. Pure and
// defensive: a missing or malformed field returns null (no banner, no throw).
export const sleepBanner = (pulse) => {
    if (!pulse || typeof pulse.asleep !== 'string') return null
    if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(pulse.asleep)) return null
    const min = Number(pulse.asleepm)
    if (!Number.isFinite(min) || min <= 0) return null
    const h = Math.floor(min / 60), m = min % 60
    const dur = h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
    const naps = Number(pulse.naps) || 0
    return {
        text: `STUDIO WAS ASLEEP ${pulse.asleep.replace('-', '–')} · ${dur}${naps ? ` · ${naps} dark wakes` : ''}`,
        minutes: min,
        severe: min >= 120,
    }
}

// runwayMath (#1233) — the strip's hover/tap reveal as pure data: one row per
// lane carrying the math behind its "~N days": the per-item S/M/L mix, the total
// size, the rate (closes/day over the trailing window) and the days it yields.
// `runway` is the board.json block. Pure and defensive on purpose: the board
// renders whatever the telemetry machine last baked, and OLDER board.json has
// no `mix` — so a missing field degrades to null (the reveal says "—" / falls
// back to the item count), never invents a number and never throws. Pinned by
// runwaycheck without a browser.
const numOrNull = (v) => (Number.isFinite(v) ? v : null)
const normLaneSplit = (x) => x && typeof x === 'object'
    ? { items: numOrNull(x.items), size: numOrNull(x.size), days: numOrNull(x.days) }
    : null
export const runwayMath = (runway) => {
    if (!runway || typeof runway !== 'object') return []
    return [['Builder', runway.builder], ['QA', runway.qa]]
        .filter(([, l]) => l && typeof l === 'object')
        .map(([name, l]) => {
            const mix = l.mix && typeof l.mix === 'object'
                ? { S: +l.mix.S || 0, M: +l.mix.M || 0, L: +l.mix.L || 0 }
                : null
            return {
                name,
                items: Number.isFinite(l.items) ? l.items : null,
                size: Number.isFinite(l.size) ? l.size : null,
                mix,
                rate: Number.isFinite(l.rate) ? l.rate : null,
                days: Number.isFinite(l.days) ? l.days : null,
                amber: !!l.amber,
                polish: !!l.polish,
                // lanes (#1233) — the Builder platform/games split (null on the
                // QA lane and on pre-#1233 board.json — the row just omits it).
                lanes: l.lanes && typeof l.lanes === 'object'
                    ? { platform: normLaneSplit(l.lanes.platform), games: normLaneSplit(l.lanes.games) }
                    : null,
            }
        })
}

// runwayTrend (#1233) — the 7-day sparkline samples as pure data: one entry
// per persisted UTC day with each lane's day-count (null = that lane had no
// number that day). The board renders whatever the telemetry machine last
// baked, and OLDER board.json has no `history` — so a missing or junk field
// degrades to [] (no trend row), never throws. Pinned by runwaycheck.
export const runwayTrend = (runway) => {
    if (!runway || !Array.isArray(runway.history)) return []
    return runway.history
        .filter((p) => p && typeof p === 'object' && typeof p.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.d))
        .map((p) => ({
            date: p.d,
            builder: Number.isFinite(p.b) ? p.b : null,
            qa: Number.isFinite(p.q) ? p.q : null,
        }))
}

// sparkline (#1233) — one trend row as pure text: one cell per day, the glyph
// height is the value relative to that lane's OWN max over the window (so a
// quiet lane and a busy lane both use the full ▁..█ range), null = blank (a
// day the lane had no number for). Text, not SVG: the board is monospace and
// runwaycheck pins the exact glyphs without a browser.
const SPARK = '▁▂▃▄▅▆▇█'
export const sparkline = (values) => values.map((v) => {
    if (v == null) return ' '
    const max = Math.max(0, ...values.filter((x) => x != null))
    return SPARK[max > 0 ? Math.min(7, Math.floor((v / max) * 8)) : 0]
}).join('')
