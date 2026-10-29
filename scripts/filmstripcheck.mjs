// filmstripcheck.mjs — the film-strip tool is proven to work AND to fail (#1132).
//
// Pure gates (offline): checkpoint math, the verdict truth table (identical /
// jitter / visual-only / SIM DIVERGED at the right tick), telemetry naming,
// and a pinned composition geometry.
// Browser gates (needs `npm run dev`, DEV_PORT honored): tetris driven twice at
// the same seed must come back hash-equal with ~0 pixel diff (the columns are
// aligned and the capture is deterministic across pages), the composed strip
// must be a real PNG, and the mutant — the second capture at seed+1 — must
// report SIM DIVERGED at a checkpoint. A strip tool that cannot see divergence
// is worse than no strip.

import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import { scriptFor } from './lib/contractGames.mjs'
import { checkpoints, verdict, telemetryPath, layout, DRIVE_CAPTURE, composeStrip } from './lib/filmstrip.mjs'

const r = new Report('filmstripcheck')

// ---- pure: checkpoints ----
r.check('checkpoints(600,4) = quarters', JSON.stringify(checkpoints(600, 4)) === '[150,300,450,600]', checkpoints(600, 4).join(','))
r.check('checkpoints(200,2) = halves', JSON.stringify(checkpoints(200, 2)) === '[100,200]', checkpoints(200, 2).join(','))
r.check('checkpoints dedup + floor', (() => {
    const a = checkpoints(1, 4)
    return a.length >= 1 && a[a.length - 1] === 1 && new Set(a).size === a.length
})(), checkpoints(1, 4).join(','))

// ---- pure: verdict truth table ----
const vIdentical = verdict({ ticks: [100, 200], hashesBase: [1, 2], hashesHead: [1, 2], diffs: [0, 0] })
r.check('verdict: equal hashes + zero diff → identical', vIdentical.ok && /^identical/.test(vIdentical.summary), vIdentical.summary)
const vJitter = verdict({ ticks: [100, 200], hashesBase: [1, 2], hashesHead: [1, 2], diffs: [0.2, 0] })
r.check('verdict: tiny diff ≤ jitter → ok, named jitter', vJitter.ok && /jitter/.test(vJitter.summary), vJitter.summary)
const vVisual = verdict({ ticks: [100, 200], hashesBase: [1, 2], hashesHead: [1, 2], diffs: [0, 4.25] })
r.check('verdict: hashes equal + 4.25% diff → visual-only', vVisual.ok && /visual-only/.test(vVisual.summary) && /4\.25/.test(vVisual.summary), vVisual.summary)
const vDiverged = verdict({ ticks: [100, 200, 300], hashesBase: [1, 2, 3], hashesHead: [1, 9, 3], diffs: [0, 12, 0] })
r.check('verdict: hash mismatch → red at the RIGHT tick (200, not index)',
    !vDiverged.ok && vDiverged.divergedTick === 200 && /SIM DIVERGED @ tick 200/.test(vDiverged.summary), vDiverged.summary)

// ---- pure: telemetry naming ----
const t = telemetryPath({ pr: 99, game: 'comet-drift-hd', sha: 'abc1234', stamp: '20261028T200000' })
r.check('telemetryPath: key under strips/ on the telemetry repo',
    t && t.path === 'strips/PR99-comet-drift-hd-abc1234-20261028T200000.png'
        && t.url === 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/strips/PR99-comet-drift-hd-abc1234-20261028T200000.png',
    t ? t.path : 'null')
r.check('telemetryPath: missing fields → null (no anonymous strip files)', telemetryPath({ pr: 99, game: 'x' }) === null)

// ---- pure: geometry pinned ----
const big = layout({ fw: 880, fh: 840, cols: 4 })
r.check('layout: big frames cap at cellMaxW, rows stacked',
    big.cellW === 360 && big.cellH === Math.round(840 * (360 / 880))
        && big.width === 148 + 4 * (big.cellW + 8) + 8
        && big.height === 40 + 2 * (big.cellH + 26 + 8) + 46,
    `${big.width}x${big.height} cell ${big.cellW}x${big.cellH}`)
const small = layout({ fw: 320, fh: 240, cols: 2 })
r.check('layout: native-size frames not upscaled', small.cellW === 320 && small.cellH === 240)

// ---- browser: same-seed determinism + alignment + mutant ----
const BASE = process.env.CONTRACT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
await requireDevServer(`${BASE}/tetris`)
const browser = await launch()
const MARKS = [60, 120]
const SCRIPT = scriptFor('tetris').slice(0, 120)

async function cap(seed) {
    const page = await openGame(browser, { url: `${BASE}/tetris`, hook: '__game' })
    const out = await page.evaluate(DRIVE_CAPTURE, { seed, ms: MARKS, pat: SCRIPT })
    await page.close()
    return out
}

const c1 = await cap(7)
const c2 = await cap(7)
r.check('capture: drives tetris (meta.id guarded) to the marks',
    c1.metaId === 'tetris' && c2.metaId === 'tetris' && JSON.stringify(c1.ticksAt) === JSON.stringify(MARKS),
    c1.metaId + ' ticks=' + c1.ticksAt.join(','))
const vSame = verdict({ ticks: c1.ticksAt, hashesBase: c1.hashes, hashesHead: c2.hashes, diffs: [] })
r.check('same seed twice on two pages → hash-equal (sim alignment)', vSame.ok,
    `${c1.hashes.join(',')} vs ${c2.hashes.join(',')}`)

const composed = await composeStrip(browser, {
    a: c1, b: c2, ticksAt: c1.ticksAt,
    refs: { base: 'check/a', head: 'check/b' }, shas: { base: 'aaaaaaa', head: 'bbbbbbb' },
    game: 'tetris', seed: 7,
})
r.check('composeStrip: real PNG out, column pixel diffs computed',
    typeof composed.png === 'string' && composed.png.startsWith('data:image/png;base64,') && composed.png.length > 5000
        && composed.diffs.length === MARKS.length,
    `${(composed.png.length / 1024) | 0}KB diffs=${composed.diffs.join(',')}`)
r.check('same seed twice → pixel-aligned columns (≤ jitter threshold)',
    composed.diffs.every((d) => d <= 0.5), `diffs ${composed.diffs.join(',')}%`)

// MUTANT: one capture at another seed — the strip MUST call divergence, red.
const cMut = await cap(8)
const vMut = verdict({ ticks: c1.ticksAt, hashesBase: c1.hashes, hashesHead: cMut.hashes, diffs: [] })
r.check('mutant seed+1 → SIM DIVERGED detected (tool can fail)',
    !vMut.ok && MARKS.includes(vMut.divergedTick), vMut.summary)

r.exit(browser)
