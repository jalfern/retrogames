// filmstrip.mjs — pure core of the before/after film strips (#1132).
//
// A visual PR should be judgeable in five seconds: the same seeded replay run
// on main and on the branch, same checkpoints, two rows, one verdict line.
// The browser half (scripts/filmstrip.mjs) drives the window.__game contract
// and composites the PNG; everything decidable without a browser lives here
// so scripts/filmstripcheck.mjs can pin it offline.

export const DEFAULT_TICKS = 600
export const DEFAULT_COLS = 4
// Pixel diff at or below this fraction of pixels is draw jitter, not a change:
// WebGL shaders and shimmer effects can move a hair between runs while the
// sim hashes prove the state identical. Above it, the strip says "visual change".
export const PIXEL_JITTER_PCT = 0.5

export function checkpoints(ticks = DEFAULT_TICKS, cols = DEFAULT_COLS) {
    const t = Math.max(1, ticks | 0)
    const n = Math.max(1, cols | 0)
    const out = []
    for (let i = 1; i <= n; i++) {
        const v = Math.round((i * t) / n)
        if (!out.includes(v)) out.push(v)
    }
    return out
}

// hashesBase/hashesHead are the checkpoint state.hash per column; diffs are the
// per-column pixel-diff percentages (0..100). One honest sentence out.
export function verdict({ hashesBase = [], hashesHead = [], diffs = [] }) {
    let divergedTick = null
    for (let i = 0; i < hashesBase.length; i++) {
        if (hashesBase[i] !== hashesHead[i]) { divergedTick = i; break }
    }
    const maxDiff = diffs.length ? Math.max(...diffs) : 0
    const ok = divergedTick === null
    const summary = !ok
        ? `SIM DIVERGED @ tick ${divergedTick} — state hashes differ: this PR changes simulation, not just looks`
        : maxDiff > PIXEL_JITTER_PCT
            ? `visual-only change — state hashes identical, max pixel diff ${maxDiff}%`
            : maxDiff > 0
                ? `identical up to draw jitter (max pixel diff ${maxDiff}%)`
                : 'identical — hashes and pixels match at every checkpoint'
    return { ok, divergedTick, maxDiff, summary }
}

// The forge-telemetry key + public raw URL for a strip. Name carries the PR,
// the game and the head sha so a rerun never overwrites an earlier verdict.
export function telemetryPath({ pr, game, sha, stamp }) {
    const safe = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!pr || !game || !sha) return null
    return {
        path: `strips/PR${safe(pr)}-${safe(game)}-${safe(sha)}${stamp ? `-${safe(stamp)}` : ''}.png`,
        url: `https://raw.githubusercontent.com/jalfern/forge-telemetry/main/strips/PR${safe(pr)}-${safe(game)}-${safe(sha)}${stamp ? `-${safe(stamp)}` : ''}.png`,
    }
}

// Composition geometry (the browser half draws exactly this).
export function layout({ fw, fh, cols = DEFAULT_COLS, cellMaxW = 360 }) {
    const c = Math.max(1, cols | 0)
    const scale = Math.min(1, cellMaxW / Math.max(1, fw))
    const cellW = Math.max(1, Math.round(fw * scale))
    const cellH = Math.max(1, Math.round(fh * scale))
    const labelW = 148
    const gap = 8
    const titleH = 40
    const metaH = 26
    const colW = labelW + c * (cellW + gap) + gap
    const rowH = cellH + metaH
    return {
        cellW, cellH, labelW, gap, titleH, metaH, cols: c,
        width: colW, height: titleH + 2 * rowH + 2 * gap + 30,
    }
}
