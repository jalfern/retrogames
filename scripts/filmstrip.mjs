// filmstrip.mjs — before/after film strips for visual PRs (#1132).
//
// One seeded replay, two builds: the game's fixed driving pattern
// (scripts/lib/contractGames.mjs) is stepped through the window.__game
// contract against a BASE ref and a HEAD ref, each served by its own vite dev
// server, and the game canvas is photographed at shared checkpoints. Rows =
// refs, columns = ticks, and one verdict line says whether the PR is visual,
// diverged the sim, or identical. Judge it in five seconds, no trusting prose.
//
//   npm run filmstrip -- --game tetris [--seed 7] [--ticks 600] [--cols 4]
//       [--base origin/main] [--head HEAD] [--base-dir DIR] [--head-dir DIR]
//       [--base-port 5187] [--head-port 5188] [--out scripts/.strips/NAME.png]
//       [--attach PR] [--strict]
//
//   --attach PR : push the PNG to jalfern/forge-telemetry strips/ (the same
//                 anonymous CDN pipe as report.json) and comment it inline on PR.
//   --strict    : exit 1 when the sim diverged (for a future CI wiring).
//
// Honest limits (README): DEV-only __game means dev servers, not prod bundles;
// WebGL draw jitter can move pixels between runs — the hash row, not pixels,
// proves sim alignment; a game with no PATTERNS entry cannot join a strip.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { openGame, launch } from './lib/harness.mjs'
import { pushContents } from './shiftreport.mjs'
import { GAMES, TICKS, scriptFor, PATTERNS } from './lib/contractGames.mjs'
import { checkpoints, verdict, telemetryPath } from './lib/filmstrip.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const flag = (n) => args.includes(n)

const GAME_ID = opt('--game')
if (!GAME_ID) { console.error('usage: npm run filmstrip -- --game <id> [options]'); process.exit(2) }
const entry = GAMES.find((g) => g.id === GAME_ID)
if (!entry) { console.error(`"${GAME_ID}" is not in scripts/lib/contractGames.mjs GAMES — it cannot join a strip.`); process.exit(2) }
if (!PATTERNS[GAME_ID]) { console.error(`"${GAME_ID}" has no driving PATTERNS entry — add one first.`); process.exit(2) }

const SEED = +opt('--seed', 7)
const TOTAL = +opt('--ticks', TICKS)
const COLS = +opt('--cols', 4)
const BASE_REF = opt('--base', 'origin/main')
const HEAD_REF = opt('--head', 'HEAD')
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim()
const BASE_PORT = +opt('--base-port', 5187)
const HEAD_PORT = +opt('--head-port', 5188)
const STRICT = flag('--strict')

const shaOf = (dir, ref) => execFileSync('git', ['-C', dir, 'rev-parse', '--short', ref]).toString().trim()

function prepareDir(ref, dir) {
    const want = execFileSync('git', ['-C', ROOT, 'rev-parse', ref]).toString().trim()
    if (!existsSync(dir)) {
        console.log(`preparing worktree ${dir} @ ${ref}`)
        execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', dir, want], { stdio: 'inherit' })
    } else {
        const cur = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD']).toString().trim()
        if (cur !== want) {
            if (execFileSync('git', ['-C', dir, 'status', '--porcelain']).toString().trim()) {
                console.error(`${dir} is dirty and not at ${ref} — refusing to move it.`)
                process.exit(2)
            }
            execFileSync('git', ['-C', dir, 'checkout', '--detach', want], { stdio: 'inherit' })
        }
    }
    if (!existsSync(resolve(dir, 'node_modules'))) {
        console.log(`npm ci in ${dir} (first run of this ref — a minute or two)`)
        execFileSync('npm', ['ci'], { cwd: dir, stdio: 'inherit' })
    }
}

const baseDir = resolve(process.cwd(), opt('--base-dir', '/tmp/forge/filmstrip-base'))
const headDir = resolve(process.cwd(), opt('--head-dir', ROOT))
prepareDir(BASE_REF, baseDir)
if (headDir !== baseDir) prepareDir(HEAD_REF, headDir)
const BASE_SHA = shaOf(baseDir, 'HEAD')
const HEAD_SHA = shaOf(headDir, 'HEAD')

const servers = []
async function startServer(dir, port) {
    const url = `http://127.0.0.1:${port}/retrogames/`
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
        if (res.ok) { console.log(`reusing dev server ${url}`); return url }
    } catch { /* spawn below */ }
    const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'],
        { cwd: dir, detached: true, stdio: 'ignore' })
    servers.push(child)
    const t0 = Date.now()
    while (Date.now() - t0 < 60000) {
        try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return url } catch { /* not yet */ }
        await new Promise((r) => setTimeout(r, 500))
    }
    console.error(`dev server for ${dir} never answered at ${url}`)
    process.exit(1)
}
function stopServers() {
    for (const c of servers) { try { process.kill(-c.pid) } catch { /* gone */ } }
}
process.on('exit', stopServers)

const marks = checkpoints(TOTAL, COLS)
const script = scriptFor(GAME_ID).slice(0, TOTAL)

// Lockstep capture: reset(seed), step the fixed pattern tick by tick, and at
// each mark yield one frame boundary so the locked loop paints the canvas at
// exactly this tick before frame() photographs it.
const DRIVE = ({ seed, ms, pat }) => {
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
        return { frames, hashes, ticksAt, finalTick }
    })()
}

const browser = await launch()

async function capture(url) {
    const page = await openGame(browser, { url, hook: '__game' })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    const out = await page.evaluate(DRIVE, { seed: SEED, ms: marks, pat: script })
    if (errs.length) console.error(`[warn] page errors on ${url}: ${errs.join(' | ')}`)
    await page.close()
    return out
}

const baseServer = await startServer(baseDir, BASE_PORT)
const headServer = await startServer(headDir, HEAD_PORT)
console.log(`capturing ${GAME_ID} seed=${SEED} ticks=${marks.join(',')} (base ${BASE_SHA} vs head ${HEAD_SHA})`)
const a = await capture(`${baseServer}${entry.path}`)
const b = await capture(`${headServer}${entry.path}`)

// Compose the strip in a blank page: rows = refs, columns = marks, per-column
// native pixel diff, one verdict line. Geometry is the pure layout() from
// scripts/lib/filmstrip.mjs, re-derived in-page from the same constants.
const COMPOSE = async ({ a, b, ticksAt, refs, shas, game, seed, geom }) => {
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })
    const layoutAt = (fw, fh, cols) => {
        const scale = Math.min(1, geom.cellMaxW / Math.max(1, fw))
        const cellW = Math.max(1, Math.round(fw * scale))
        const cellH = Math.max(1, Math.round(fh * scale))
        const { labelW, gap, titleH, metaH } = geom
        return {
            cellW, cellH, labelW, gap, titleH, metaH,
            width: labelW + cols * (cellW + gap) + gap,
            height: titleH + 2 * (cellH + metaH + gap) + 30,
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
}

async function compose(data) {
    const page = await browser.newPage({ viewport: { width: 420, height: 320 } })
    const out = await page.evaluate(COMPOSE, { ...data, geom: { cellMaxW: 360, labelW: 148, gap: 8, titleH: 40, metaH: 26 } })
    await page.close()
    return out
}

const { png, diffs } = await compose({
    a, b, ticksAt: a.ticksAt,
    refs: { base: BASE_REF, head: HEAD_REF }, shas: { base: BASE_SHA, head: HEAD_SHA },
    game: GAME_ID, seed: SEED,
})
const buf = Buffer.from(png.split(',')[1], 'base64')
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const out = resolve(process.cwd(), opt('--out', `scripts/.strips/filmstrip-${GAME_ID}-${HEAD_SHA}-${stamp}.png`))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, buf)

const v = verdict({ hashesBase: a.hashes, hashesHead: b.hashes, diffs })
console.log(`\nwrote ${out}`)
console.log(`base ${BASE_REF} @ ${BASE_SHA}  |  head ${HEAD_REF} @ ${HEAD_SHA}`)
console.log(`ticks ${a.ticksAt.join(', ')}  hashes ${a.hashes.map((h, i) => (h === b.hashes[i] ? '✓' : `✗(${h} vs ${b.hashes[i]})`)).join(' ')}  diffs ${diffs.join('% ')}%`)
console.log(`VERDICT: ${v.summary}`)

const pr = opt('--attach')
if (pr) {
    const t = telemetryPath({ pr, game: GAME_ID, sha: HEAD_SHA, stamp })
    const content = buf.toString('base64')
    const attempts = pushContents({
        readSha: () => execFileSync('gh', ['api', `repos/jalfern/forge-telemetry/contents/${t.path}?ref=main`, '--jq', '.sha'], { encoding: 'utf8' }),
        put: (sha) => {
            const body = { message: `film strip PR #${pr} ${GAME_ID}`, content, branch: 'main' }
            if (/^[0-9a-f]{40}$/.test(sha)) body.sha = sha
            execFileSync('gh', ['api', '-X', 'PUT', 'repos/jalfern/forge-telemetry/contents/' + t.path, '--input', '-'], { input: JSON.stringify(body) })
        },
        warn: (msg) => console.warn(msg),
    })
    console.log(`uploaded to ${t.url} (${attempts} attempt${attempts === 1 ? '' : 's'})`)
    execFileSync('gh', ['pr', 'comment', String(pr), '--body',
        `**FILM STRIP — ${GAME_ID}** (seed ${SEED}, ticks ${a.ticksAt.join('/')}, \`origin/main\` ${BASE_SHA} vs \`${HEAD_REF}\` ${HEAD_SHA})\n\n![film strip](${t.url})\n\n**${v.summary}**\n\nRegenerate: \`npm run filmstrip -- --game ${GAME_ID} --attach ${pr}\``])
    console.log(`commented on PR #${pr}`)
}

await browser.close()
process.exit(STRICT && !v.ok ? 1 : 0)
