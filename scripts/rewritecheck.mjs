// rewritecheck.mjs — every top-level directory in public/ must have a
// dedicated /retrogames/<dir>/:path* rewrite in vercel.json, or its files
// die silently in production: the SPA catch-all answers index.html@200 and
// every fetch().json() throws into a hidden board section. This bit twice
// (#1130 juice.json claimed-live-but-HTML, #1131 boredom.json caught by
// verifying prod) — the rule is cheap now, so the third one never happens.
// Pure Node, no browser.
//
// Fail-it-once proof lives in --selftest: the same checker run against an
// in-memory vercel.json missing the last rewrite must report it.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function missingRewrites(dirs, rewrites) {
    const prefixes = rewrites.map((r) => String(r.source || ''))
    const covered = (d) => prefixes.some((s) => s === `/retrogames/${d}/:path*` || s.startsWith(`/retrogames/${d}/(`))
    return dirs.filter((d) => !covered(d))
}

let failed = 0
const ok = (label, pass, detail = '') => {
    if (!pass) failed++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

if (process.argv.includes('--selftest')) {
    const dirs = ['forge', 'replays']
    ok('selftest: complete rule set passes', missingRewrites(dirs, [
        { source: '/retrogames/forge/:path*' }, { source: '/retrogames/replays/:path*' },
    ]).length === 0)
    ok('selftest: a missing rewrite is reported', missingRewrites(dirs, [
        { source: '/retrogames/replays/:path*' },
    ]).join() === 'forge')
    ok('selftest: a catch-all does not count as coverage', missingRewrites(['forge'], [
        { source: '/retrogames/:path*' },
    ]).join() === 'forge')
    ok('selftest: regex-style rules count as coverage', missingRewrites(['games'], [
        { source: '/retrogames/games/(.+)' },
    ]).length === 0)
    console.log(`\nrewritecheck --selftest: ${failed ? `${failed} FAILED` : 'OK'}`)
    process.exit(failed ? 1 : 0)
}

const vc = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
const dirs = readdirSync(join(ROOT, 'public'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const caught = missingRewrites(dirs, vc.rewrites || [])
console.log('vercel.json rewrite coverage (public/ dirs)')
ok(`every public/ dir has a /retrogames/<dir>/:path* rewrite (${dirs.length} dirs)`,
    caught.length === 0, caught.length ? `missing: ${caught.join(', ')}` : dirs.join(', '))
const catchAll = (vc.rewrites || []).findIndex((r) => r.source === '/retrogames/:path*')
ok('the SPA catch-all is the LAST rewrite', catchAll === (vc.rewrites || []).length - 1)
if (existsSync(join(ROOT, 'public/forge/boredom.json'))) {
    ok('boredom.json is committed for the board', true)
}

console.log(`\nrewritecheck: ${failed ? `${failed} FAILED` : 'OK'}`)
process.exit(failed ? 1 : 0)
