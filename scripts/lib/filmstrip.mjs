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

// hashesBase/hashesHead are the checkpoint state.hash per column; ticks are the
// tick numbers of those columns; diffs are the per-column pixel-diff percentages
// (0..100). One honest sentence out.
export function verdict({ ticks = [], hashesBase = [], hashesHead = [], diffs = [] }) {
    let divergedTick = null
    for (let i = 0; i < hashesBase.length; i++) {
        if (hashesBase[i] !== hashesHead[i]) { divergedTick = ticks[i] != null ? ticks[i] : i; break }
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
        width: colW,
        height: titleH + 2 * rowH + 2 * gap + 46,
    }
}

export const GEOM = { cellMaxW: 360, labelW: 148, gap: 8, titleH: 40, metaH: 26 }

// Lockstep capture, evaluated inside the page: reset(seed), step the fixed
// pattern tick by tick, and at each mark yield one frame boundary so the
// locked loop paints the canvas at exactly this tick before frame()
// photographs it. One source for scripts/filmstrip.mjs and the check.
export const DRIVE_CAPTURE = ({ seed, ms, pat }) => {
    const g = window.__game
    g.reset(seed)
    const frames = [], hashes = [], ticksAt = []
    let t = 0
    return (async () => {
        for (const m of ms) {
            while (t < m) { g.step(pat[t], 1); t++ }
            await new Promise((r) => setTimeout(r, 50))
            await new Promise((r) => requestAnimationFrame(r))
            frames.push(g.frame())
            hashes.push(g.state().hash)
            ticksAt.push(t)
        }
        const finalTick = g.state().tick
        g.release()
        return { metaId: g.meta && g.meta.id, frames, hashes, ticksAt, finalTick }
    })()
}

// Compose the strip in a blank page: rows = refs, columns = marks, per-column
// native pixel diff, one verdict line. Geometry constants ride in via GEOM so
// the page needs no imports; layout() above is the Node-side mirror.
export async function composeStrip(browser, { a, b, ticksAt, refs, shas, game, seed }) {
    const page = await browser.newPage({ viewport: { width: 420, height: 320 } })
    const out = await page.evaluate(async ({ a, b, ticksAt, refs, shas, game, seed, geom }) => {
        const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })
        const layoutAt = (fw, fh, cols) => {
            const scale = Math.min(1, geom.cellMaxW / Math.max(1, fw))
            const cellW = Math.max(1, Math.round(fw * scale))
            const cellH = Math.max(1, Math.round(fh * scale))
            const { labelW, gap, titleH, metaH } = geom
            return {
                cellW, cellH, labelW, gap, titleH, metaH,
                width: labelW + cols * (cellW + gap) + gap,
                height: titleH + 2 * (cellH + metaH + gap) + 46,
            }
        }
        const imgsA = await Promise.all(a.frames.map(load))
        const imgsB = await Promise.all(b.frames.map(load))
        const fw = imgsA[0].naturalWidth || 1
        const fh = imgsA[0].naturalHeight || 1
        const L = layoutAt(fw, fh, ticksAt.length)
        const dpr = 2
        const cv = document.createElement('canvas')
        cv.width = L.width * dpr; cv.height = L.height * dpr
        const ctx = cv.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, L.width, L.height)
        ctx.textBaseline = 'middle'
        const dc = document.createElement('canvas'); dc.width = fw; dc.height = fh
        const dx = dc.getContext('2d', { willReadFrequently: true })
        const diffs = []
        for (let i = 0; i < ticksAt.length; i++) {
            dx.drawImage(imgsA[i], 0, 0)
            const pa = dx.getImageData(0, 0, fw, fh).data
            dx.drawImage(imgsB[i], 0, 0)
            const pb = dx.getImageData(0, 0, fw, fh).data
            let d = 0
            for (let p = 0; p < pa.length; p += 4) {
                if (Math.abs(pa[p] - pb[p]) > 8 || Math.abs(pa[p + 1] - pb[p + 1]) > 8 || Math.abs(pa[p + 2] - pb[p + 2]) > 8) d++
            }
            diffs.push(Math.round((d / (fw * fh)) * 10000) / 100)
        }
        const okCol = a.hashes.map((h, i) => h === b.hashes[i])
        const maxDiff = diffs.length ? Math.max(...diffs) : 0
        ctx.fillStyle = '#e8edf5'
        ctx.font = '600 17px ui-monospace, Menlo, monospace'
        ctx.fillText(`${game} — seeded film strip (seed ${seed}, ${ticksAt[ticksAt.length - 1]} ticks)`, L.gap, L.titleH / 2 + 4)
        const rows = [
            { label: `base ${refs.base}`, sha: shas.base, imgs: imgsA, hashes: a.hashes, color: '#8fb7ff' },
            { label: `head ${refs.head}`, sha: shas.head, imgs: imgsB, hashes: b.hashes, color: '#9fe8b0' },
        ]
        rows.forEach((row, r) => {
            const y = L.titleH + r * (L.cellH + L.metaH + L.gap)
            ctx.fillStyle = row.color
            ctx.font = '600 13px ui-monospace, Menlo, monospace'
            ctx.fillText(row.label, L.gap, y + L.metaH / 2 - 6)
            ctx.fillStyle = '#7d8aa0'
            ctx.font = '11px ui-monospace, Menlo, monospace'
            ctx.fillText(row.sha, L.gap, y + L.metaH / 2 + 8)
            row.imgs.forEach((im, i) => {
                const x = L.labelW + L.gap + i * (L.cellW + L.gap)
                ctx.drawImage(im, x, y + L.metaH, L.cellW, L.cellH)
                ctx.strokeStyle = '#2a3446'; ctx.strokeRect(x + 0.5, y + L.metaH + 0.5, L.cellW - 1, L.cellH - 1)
                if (r === rows.length - 1) {
                    ctx.fillStyle = okCol[i] ? '#9fe8b0' : '#ff8f8f'
                    ctx.font = '11px ui-monospace, Menlo, monospace'
                    ctx.fillText(`t=${ticksAt[i]} ${okCol[i] ? 'hash ✓' : 'hash ✗'} Δ${diffs[i]}%`, x, y + L.metaH + L.cellH + 12)
                }
            })
        })
        const bad = okCol.indexOf(false)
        ctx.fillStyle = bad >= 0 ? '#ff8f8f' : (maxDiff > 0.5 ? '#9fe8b0' : '#cfe3ff')
        ctx.font = '600 13px ui-monospace, Menlo, monospace'
        const line = bad >= 0
            ? `SIM DIVERGED @ tick ${ticksAt[bad]} — simulation changed, not just looks`
            : maxDiff > 0.5 ? `visual-only change — hashes identical, max pixel diff ${maxDiff}%`
                : maxDiff > 0 ? `identical up to draw jitter (max ${maxDiff}%)` : 'identical at every checkpoint'
        ctx.fillText(line, L.gap, L.height - 18)
        return { png: cv.toDataURL('image/png'), diffs }
    }, { a, b, ticksAt, refs, shas, game, seed, geom: GEOM })
    await page.close()
    return out
}
