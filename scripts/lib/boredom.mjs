// BOREDOM — the boredom map's decision math (#1131). Pure: no browser, no
// clock, no fs, so scripts/boredomcheck.mjs gates every threshold on fixtures
// in plain Node while scripts/boredomaudit.mjs feeds it live per-tick signals
// from locked contract replays of the nightly bot policy.
//
// The rule the map enforces: a bot playing a game should always have something
// happening to it — reward, damage, or a world in motion. A stretch of seconds
// where nothing fires is flat; where literally nothing moves it is dead.
// Momentum Runner's empty courses are the founding example.
//
// Per-tick signals (one entry per tick, from scripts/lib/boredomPage.mjs):
//   ev   score gained in this tick (reward events: kills, coins, lines, rings)
//   dmg  lives/cities/ammo/health-style fields lost in this tick (the game
//        biting back — damage is engagement, not boredom)
//   act  count of MEANINGFUL state keys that moved this tick. tick/hash/seed/
//        done change for free and are noise; positions, aims, enemy fields,
//        board state are the sim living. Oversized keys (a whole SimCity grid
//        per tick) are skipped — their churn is not 60-per-second activity.
//
// Mutant hook: BOREDOM_MUTATE=dead blinds `dead` classification (the exact
// failure mode a boredom map must never hide — a map that cannot see dead air).
// boredomcheck runs with it, requires RED, unsets.

const MUTED = typeof process !== 'undefined' && process.env && process.env.BOREDOM_MUTATE === 'dead'

export const FLAT_RATIO = 0.35        // a second under 35% of the run median is flat
export const SPIKE_RATIO = 2.5        // ...and over 250% of it spikes (difficulty spike)
export const FLAT_WEIGHT = 0.5        // flat counts half of dead toward the boredom score
export const FLAT_FILE_SHARE = 0.5   // ≥50% flat seconds files a QA issue
export const DEAD_FILE_SECS = 3      // ...or a dead stretch of ≥3 s; shorter dark
                                     // blips are wait phases and interludes — law, not gap
export const STATE_NOISE = ['tick', 'hash', 'seed', 'done']
export const KEY_MAX_LEN = 4096       // a state key bigger than this is scenery, not signal

// Signal keys whose DROP is damage. Games name their dwindling resources
// differently; every one of these going down in the same tick = one bite.
export const DAMAGE_KEYS = ['lives', 'cities', 'ammo', 'health', 'hp', 'fuels', 'shields']

// Per-tick diff of two state snapshots → { ev, dmg, act, dist }. Noise keys
// dropped, oversized keys ignored for `act` (they can still be score/damage
// carriers). `dist` weighs a moved position key by HOW FAR it moved, so
// coasting reads quieter than sprinting — a bare count would call both "1".
export function tickSignals(before, after) {
    let ev = 0, dmg = 0, act = 0, dist = 0
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    for (const k of keys) {
        if (STATE_NOISE.includes(k)) continue
        const b = before ? before[k] : undefined
        const a = after ? after[k] : undefined
        if (JSON.stringify(b) === JSON.stringify(a)) continue
        if (k === 'score' && typeof b === 'number' && typeof a === 'number') {
            const d = a - b
            if (d > 0) ev += d
            continue
        }
        if (DAMAGE_KEYS.includes(k) && typeof b === 'number' && typeof a === 'number') {
            if (a < b) dmg += b - a
            continue
        }
        const big = (v) => {
            try { return JSON.stringify(v) === undefined || JSON.stringify(v).length > KEY_MAX_LEN } catch { return true }
        }
        if (!big(a) && !big(b)) {
            act++
            if (Array.isArray(b) && Array.isArray(a)) {
                for (let j = 0; j < Math.min(b.length, a.length); j++) {
                    if (typeof b[j] === 'number' && typeof a[j] === 'number') dist += Math.abs(a[j] - b[j])
                }
            } else if (typeof b === 'number' && typeof a === 'number') {
                dist += Math.abs(a - b)
            }
        }
    }
    // 3 decimals, not Math.round: a Gauntlet hero walks ~0.045 cells/tick and
    // per-tick rounding erased the whole walk, so living seconds read dead
    // (#1190). The per-second bucket is the rounding point, not the tick.
    return { ev, dmg, act, dist: Math.round(dist * 1000) / 1000 }
}

// 60-tick buckets → one number per second: the "what's happening" magnitude —
// reward + damage + world motion (distance-weighted; `act`, the bare key count,
// stays in the samples for diagnostics). A second lives on any of the three.
// A trailing partial second (a run cut off by `done` or the cap) is dropped —
// a truncated bucket reads as flat/dead air that never happened. A whole run
// shorter than a second still maps to one second.
export function bucketSeconds(samples, sps = 60) {
    const mag = (x) => x.ev + x.dmg + (x.dist !== undefined ? x.dist : x.act)
    const out = []
    for (let i = 0; i + sps <= samples.length; i += sps) {
        let s = 0
        for (let j = i; j < i + sps; j++) s += mag(samples[j])
        out.push(s)
    }
    if (!out.length && samples.length) {
        out.push(samples.reduce((s, x) => s + mag(x), 0))
    }
    return out
}

// Multi-seed combine: mean over seeds whose run still had that second. Keeps a
// seed that died at second 12 from diluting seconds 13+ with fake zeros.
export function combineSeeds(perSeed) {
    const len = perSeed.reduce((m, s) => Math.max(m, s.length), 0)
    const out = []
    for (let i = 0; i < len; i++) {
        let sum = 0, n = 0
        for (const s of perSeed) if (i < s.length) { sum += s[i]; n++ }
        out.push(n ? sum / n : 0)
    }
    return out
}

const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b)
    if (!v.length) return 0
    const mid = v.length >> 1
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export const MEDIAN_FLOOR = 1       // a run whose median magnitude is below this has
                                    // nothing happening even in its best seconds

// Classify one second against the run's median magnitude.
export function classifySecond(value, med) {
    if (!MUTED && value <= 0) return 'dead'
    if (med < MEDIAN_FLOOR) return 'flat'   // whole run is near-quiet: everything is flat
    if (value >= med * SPIKE_RATIO) return 'spike'
    if (value <= med * FLAT_RATIO) return 'flat'
    return 'live'
}

export function classifyStrip(strip) {
    const med = median(strip)
    return strip.map((v) => classifySecond(v, med))
}

export const SEVERITY = { dead: 3, flat: 2, live: 1, spike: 0 }

// boredom = (dead + FLAT_WEIGHT × flat) / seconds — 1 is a stone, 0 a live wire.
export function boredomScore(strip, classes) {
    if (!strip.length) return null
    let dead = 0, flat = 0
    for (const c of classes) {
        if (c === 'dead') dead++
        else if (c === 'flat') flat++
    }
    return (dead + FLAT_WEIGHT * flat) / strip.length
}

// Longest unbroken dead-or-flat stretch. live/spike are spacers. Among equal
// lengths a dead stretch outranks a flat one; among equals the earliest wins.
export function worstStretch(classes) {
    let best = null, runStart = -1
    const flush = (end) => {
        if (runStart < 0) return
        const len = end - runStart
        const type = classes.slice(runStart, end).includes('dead') ? 'dead' : 'flat'
        const rank = (type === 'dead' ? 1000 : 0) + len
        const bestRank = best ? ((best.type === 'dead' ? 1000 : 0) + best.len) : -1
        if (rank > bestRank || (rank === bestRank && runStart < best.startSec)) best = { type, startSec: runStart, len }
    }
    classes.forEach((c, i) => {
        if (SEVERITY[c] >= 2) {
            if (runStart < 0) runStart = i
        } else {
            flush(i)
            runStart = -1
        }
    })
    flush(classes.length)
    return best
}

// Split one seed's samples into levels by its `level` field (the common
// segment-changer across the fleet: wave/level/zone are what the player reads
// as a course). Constant → one untitled segment.
export function segmentLevels(levels) {
    const out = []
    let cur = null
    levels.forEach((l, i) => {
        const label = l === undefined || l === null ? null : String(l)
        if (!cur || cur.label !== label) {
            cur = { label, startTick: i }
            out.push(cur)
        }
        cur.len = i - cur.startTick + 1
    })
    return out.length <= 1 ? [] : out
}

// Does this game's profile warrant a QA filing? A dead stretch of
// DEAD_FILE_SECS or more, or a majority-flat run (the "empty course" shape).
// Short dark blips are wait phases (between waves the original waits — law,
// not a gap, the #1130 lesson). A BLIND game never files: its contract state
// hides positions, so flat reads are suspect until #1184 calibrates it.
export function shouldFile(classes, worst, blind) {
    if (!classes.length || blind) return false
    const dead = classes.filter((c) => c === 'dead').length
    const flat = classes.filter((c) => c === 'flat').length
    if (worst && worst.type === 'dead' && worst.len >= DEAD_FILE_SECS) return true
    if (dead >= DEAD_FILE_SECS) return true
    return flat / classes.length >= FLAT_FILE_SHARE
}

export function buildReport({ commit = 'unknown', seeds = [], sps = 60, games = [] }) {
    return {
        generated: new Date().toISOString(),
        commit,
        seeds,
        ticksPerSecond: sps,
        thresholds: { flatRatio: FLAT_RATIO, spikeRatio: SPIKE_RATIO, flatWeight: FLAT_WEIGHT, flatFileShare: FLAT_FILE_SHARE, medianFloor: MEDIAN_FLOOR, deadFileSecs: DEAD_FILE_SECS },
        ...(MUTED ? { mutated: 'dead' } : {}),
        games: games.map((g) => {
            const classes = classifyStrip(g.strip)
            const boredom = boredomScore(g.strip, classes)
            const worst = worstStretch(classes)
            return {
                ...g,
                classes,
                boredom,
                worst,
                file: shouldFile(classes, worst, g.blind),
            }
        }),
    }
}
