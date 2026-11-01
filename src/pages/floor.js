// floor.js — the factory floor's derivation layer, #103.
//
// Pure: board data in, scene state out. No fetch, no DOM, no clock it
// invents (`now` is injected so the harness can pin freshness). The
// animation in FactoryFloor.jsx and the gate in scripts/forgecheck.mjs
// both read THIS and nothing else — decoration that derives from a
// second copy of the truth is how lamps end up lying.

export const FRESH_MS = 15 * 60 * 1000

// LIVE_SHOWN_MS (#1406) — how long a board may render the LIVE sleep strips
// off a pulse it cannot otherwise vouch for. Deliberately the SAME horizon
// the wire uses to retire retro windows (24 h), not a tick budget: a true
// deep outage IS silence — the pulse cannot refresh while the box sleeps —
// and the banner must survive exactly that outage it exists to name (#1354).
// What this closes is the opposite lie: a two-day-old wire still shouting
// "ASLEEP SINCE" for a box long awake (the ledger cleared at the Wake, but
// the board is reading a frozen pulse). Mirrored by convention, not import:
// the board never imports the backend script — the wire is the contract.
export const LIVE_SHOWN_MS = 24 * 60 * 60 * 1000

export const kv = line => Object.fromEntries(line.split(/\s+/).slice(1).map(t => t.split('=')))

// hhmm — local HH:MM zero-padded (sleepBanner's `as of` stamp, #1413). Local
// on purpose: the window tokens in the pulse were formatted warden-local at
// bake time, and this fleet is one Mac — the reader and the emitter share a
// clock zone. The harness pins it portably (en-GB), like fmtHM's §A pin.
const hhmm = (ms) => {
    const d = new Date(ms)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}`
}

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

    // pulseAge (#1406): the SAME age the WARDEN lamp derives (Infinity = no
    // pulse yet) rides out to the banner caller — the freshness math lives
    // once, and sleepBanner's live strips answer to it.
    return { queued, building, shipped, pulse, pulseAge: age, anvil, gate, cart, shelf: shipped }
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

// throughputLine (#1377) — the live tokens/hr picture on the SLOTS row:
// tokens/hr per box over the trailing hour of board.json `samples`, from the
// servers' own cumulative counters (`tps.tot` — the same #1299 source the
// trial report measures). Pure and defensive like slotsLine: a box with no
// valid delta drops out of the line (tot missing = pre-#1299 rows, null =
// stats unreachable, a counter DECREASE = server reboot — walk back to the
// boot boundary; span < 5 min = too young to extrapolate), and with zero
// boxes the whole line hides. `n` = mean total active streams (`tps.n` summed
// over the boxes per sample) over the window — free math from the same rows.
// Staleness: a newest sample older than 2x FRESH_MS is yesterday's weather,
// so the line hides (`now` injected, per this file's freshness convention).
// Pinned by lanecheck B5.
const TP_BOXES = [['omlx', 'studio'], ['omlxmini', 'mini'], ['omlxmbp', 'mbp']]
const TP_WINDOW_S = 3600
const TP_MIN_SPAN_S = 300
const tpKfmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
    : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`)
export const throughputLine = (samples, now = Date.now()) => {
    if (!Array.isArray(samples) || samples.length === 0) return null
    const rows = samples.filter((r) => r && Number.isFinite(r.ts))
    if (rows.length === 0) return null
    const newest = rows.reduce((m, r) => Math.max(m, r.ts), -Infinity)
    if (!Number.isFinite(now) || now - newest * 1000 > 2 * FRESH_MS) return null
    const windowed = rows.filter((r) => r.ts >= newest - TP_WINDOW_S)
    const boxes = []
    for (const [key, name] of TP_BOXES) {
        const withTot = windowed.filter(
            (r) => r.tps?.[key] && Number.isFinite(r.tps[key].tot))
        if (withTot.length < 2) continue
        const last = withTot[withTot.length - 1]
        // the counter is cumulative since server boot: walk back over the
        // window to the oldest row of THIS boot session (a higher `tot` means
        // the server restarted in between — a delta across that is nonsense).
        let first = null
        for (let i = withTot.length - 2; i >= 0; i--) {
            if (withTot[i].tps[key].tot > last.tps[key].tot) break
            first = withTot[i]
        }
        const span = last.ts - (first ? first.ts : last.ts)
        if (!first || span < TP_MIN_SPAN_S) continue
        const rate = (last.tps[key].tot - first.tps[key].tot) / span * 3600
        if (Number.isFinite(rate) && rate >= 0) boxes.push({ name, rate })
    }
    if (boxes.length === 0) return null
    const totals = windowed
        .map((r) => TP_BOXES
            .map(([key]) => r.tps?.[key]?.n)
            .filter((v) => Number.isFinite(v)))
        .filter((ns) => ns.length > 0)
        .map((ns) => ns.reduce((a, b) => a + b, 0))
    const n = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null
    const text = `throughput: ${boxes.map((b) => `${b.name} ${tpKfmt(b.rate)}/hr`).join(' · ')}`
        + (n != null ? ` (n=${n})` : '')
    return { text, boxes, n }
}

// sleepBanner (#1354) — the red strip atop /forge when the Studio itself was
// asleep. Input is the newest pulse's kv block (asleep=HH:MM-HH:MM asleepm=N
// [naps=N]); the warden only echoes a window for 24 h after it ends, so the
// banner never needs its own clock math beyond the injected minutes. Pure and
// defensive: a missing or malformed field returns null (no banner, no throw).
// v2 (#1392) reads two more shapes off the same wire:
//   asleep=true since=HH:MM  — the LIVE onset: the box never fully woke since
//     the stamped sleep, and the warden is telling you this during a dark wake
//     (v3 #1401 keeps this riding through the deep dark — the stamp only dies
//     when a full Wake disproves it, capped by the 48 h ledger horizon);
//   churn=N churnwin=W (no usable asleep field) — a churning night. The
//     emitter owns the threshold (sleepwatch only names churn at/above it),
//     so the board trusts presence of N instead of mirroring the count, and
//     reads the window W off the wire instead of hardcoding the cadence. The
//     board side must still never import a backend script — the pulse token is
//     the whole contract.
// v4 (#1406) threads the PULSE AGE in: `sleepBanner(pulse, pulseAge)`, age in
// ms since the pulse was written (deriveFloor already computes it for the
// WARDEN lamp — one clock, two readers). Beyond LIVE_SHOWN_MS the LIVE strips
// (ASLEEP SINCE / CHURNING) drop: the board cannot vouch for "right now" off
// a wire older than the horizon the system itself promises. A missing (null)
// age keeps v3 behavior — callers that do not know the age are not made liars;
// an UNPARSEABLE age is stale (no age claim = no freshness claim). Retroactive
// WAS ASLEEP survives staleness: history baked at write time.
// v5 (#1413) makes that survival honest: a self-dated strip (WAS ASLEEP, or
// the past-tense CHURNED below) off a wire OLDER than LIVE_SHOWN_MS carries
// `stale: true` and a `· as of HH:MM` suffix — the minute the wire was baked
// (`now - age`) — so yesterday's weather reads as yesterday's instead of news
// (the runwayBadge dim-stale precedent). `now` joins the other injected
// clocks; an unknown age gets NO stale claim either way (keys absent, text
// byte-identical to v3/v4). The churn branch also gains the wire's own
// self-dating: `churnage=<min>` (emitted by sleepwatch v5 when the episode
// outlived its window) renders STUDIO CHURNED — N sleeps in W-min bursts ·
// latest Xh ago — past tense, `live: false`, surviving a stale wire like any
// other history, while the present-tense CHURNING strip stays gated on wire
// freshness. A junk (or negative) churnage never renders.
export const sleepBanner = (pulse, age = null, now = Date.now()) => {
    if (!pulse) return null
    const liveOk = age == null || (Number.isFinite(age) && age <= LIVE_SHOWN_MS)
    // #1413: the bake verdict for self-dated strips. Known age -> an honest
    // boolean; unknown age (v3-era caller) -> NO stale claim at all, which
    // also means no `as of` suffix (we cannot name the minute we don't know).
    const stale = age == null ? null : (Number.isFinite(age) && age > LIVE_SHOWN_MS)
    const staleAdd = stale == null ? {} : { stale }
    const asOf = stale === true && Number.isFinite(now) ? ` · as of ${hhmm(now - age)}` : ''
    if (pulse.asleep === 'true' && /^\d{2}:\d{2}$/.test(pulse.since || '')) {
        return liveOk
            ? { text: `STUDIO ASLEEP SINCE ${pulse.since}`, minutes: null, live: true, severe: true, hint: 'nothing can ship while the Mac sleeps' }
            : null
    }
    if (typeof pulse.asleep === 'string' && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(pulse.asleep)) {
        const min = Number(pulse.asleepm)
        if (Number.isFinite(min) && min > 0) {
            const h = Math.floor(min / 60), m = min % 60
            const dur = h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
            const naps = Number(pulse.naps) || 0
            return {
                text: `STUDIO WAS ASLEEP ${pulse.asleep.replace('-', '–')} · ${dur}${naps ? ` · ${naps} dark wakes` : ''}${asOf}`,
                minutes: min,
                live: false,
                severe: min >= 120,
                ...staleAdd,
                hint: 'nothing can ship while the Mac sleeps',
            }
        }
    }
    const churn = Number(pulse.churn)
    // v3 tokens ship `churnwin` and are threshold-gated at the source, so
    // presence is the claim. A v2-era token (no churnwin) carried the raw
    // trailing count — interpret it with the legacy minimum until every
    // pulse on the wire is v3. "in the last W min" is a NOW-claim: stale
    // wires drop it like the live stamp (#1406). A v5 `churnage` past the
    // window re-tenses it instead — history self-dated off the wire itself,
    // so it survives the wire's own age like WAS ASLEEP does (#1413).
    if (Number.isFinite(churn) && churn >= (pulse.churnwin ? 1 : 3)) {
        const win = Number(pulse.churnwin) || 30
        if (pulse.churnage != null) {
            const cAge = Number(pulse.churnage)
            if (!Number.isFinite(cAge) || cAge < 0) return null
            if (cAge > win) {
                const hh = Math.floor(cAge / 60)
                return {
                    text: `STUDIO CHURNED — ${churn} sleeps in ${win}-min bursts · latest ${hh ? `${hh}h` : `${cAge}m`} ago${asOf}`,
                    minutes: null, live: false, severe: false, ...staleAdd,
                    hint: 'lanes crawled between dark wakes',
                }
            }
            // churnage within the window: the episode was still live at the
            // bake — a NOW-claim, so it answers to the wire budget like the
            // present-tense token below.
            if (!liveOk) return null
            return { text: `STUDIO CHURNING — ${churn} sleeps in the last ${win} min`, minutes: null, live: true, severe: false, hint: 'lanes crawl between dark wakes' }
        }
        if (!liveOk) return null
        return { text: `STUDIO CHURNING — ${churn} sleeps in the last ${win} min`, minutes: null, live: true, severe: false, hint: 'lanes crawl between dark wakes' }
    }
    return null
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
