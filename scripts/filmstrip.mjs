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
import { checkpoints, verdict, telemetryPath, DRIVE_CAPTURE, composeStrip } from './lib/filmstrip.mjs'

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
    const url = `http://localhost:${port}/retrogames`
    // vite serves the base only WITH a trailing slash (bare /retrogames 404s),
    // so probe the slashed URL but hand back the unslashed one for path joins.
    const probe = `${url}/`
    try {
        const res = await fetch(probe, { signal: AbortSignal.timeout(1500) })
        if (res.ok) { console.log(`reusing dev server ${probe}`); return url }
    } catch { /* spawn below */ }
    const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'],
        { cwd: dir, detached: true, stdio: 'ignore' })
    servers.push(child)
    const t0 = Date.now()
    while (Date.now() - t0 < 60000) {
        try { if ((await fetch(probe, { signal: AbortSignal.timeout(1500) })).ok) return url } catch { /* not yet */ }
        await new Promise((r) => setTimeout(r, 500))
    }
    console.error(`dev server for ${dir} never answered at ${probe}`)
    process.exit(1)
}
function stopServers() {
    for (const c of servers) { try { process.kill(-c.pid) } catch { /* gone */ } }
}
process.on('exit', stopServers)

const marks = checkpoints(TOTAL, COLS)
const script = scriptFor(GAME_ID).slice(0, TOTAL)

const browser = await launch()

async function capture(url) {
    const page = await openGame(browser, { url, hook: '__game' })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    const out = await page.evaluate(DRIVE_CAPTURE, { seed: SEED, ms: marks, pat: script })
    await page.close()
    if (out.metaId !== GAME_ID) {
        console.error(`captured "${out.metaId}" at ${url} — the page did not mount ${GAME_ID}; refusing to build a strip from it.`)
        process.exit(1)
    }
    if (errs.length) console.error(`[warn] page errors on ${url}: ${errs.join(' | ')}`)
    return out
}

const baseServer = await startServer(baseDir, BASE_PORT)
const headServer = await startServer(headDir, HEAD_PORT)
console.log(`capturing ${GAME_ID} seed=${SEED} ticks=${marks.join(',')} (base ${BASE_SHA} vs head ${HEAD_SHA})`)
const a = await capture(`${baseServer}${entry.path}`)
const b = await capture(`${headServer}${entry.path}`)

const { png, diffs } = await composeStrip(browser, {
    a, b, ticksAt: a.ticksAt,
    refs: { base: BASE_REF, head: HEAD_REF }, shas: { base: BASE_SHA, head: HEAD_SHA },
    game: GAME_ID, seed: SEED,
})
const buf = Buffer.from(png.split(',')[1], 'base64')
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const out = resolve(process.cwd(), opt('--out', `scripts/.strips/filmstrip-${GAME_ID}-${HEAD_SHA}-${stamp}.png`))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, buf)

const v = verdict({ ticks: a.ticksAt, hashesBase: a.hashes, hashesHead: b.hashes, diffs })
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
    const body = `**FILM STRIP — ${GAME_ID}** (seed ${SEED}, ticks ${a.ticksAt.join('/')}, \`origin/main\` ${BASE_SHA} vs \`${HEAD_REF}\` ${HEAD_SHA})\n\n![film strip](${t.url})\n\n**${v.summary}**\n\nRegenerate: \`npm run filmstrip -- --game ${GAME_ID} --attach ${pr}\``
    try {
        execFileSync('gh', ['pr', 'comment', String(pr), '--body', body], { stdio: 'inherit' })
        console.log(`commented on PR #${pr}`)
    } catch {
        execFileSync('gh', ['issue', 'comment', String(pr), '--body', body])
        console.log(`#${pr} is not a PR — commented on the issue instead`)
    }
}

await browser.close()
process.exit(STRICT && !v.ok ? 1 : 0)
