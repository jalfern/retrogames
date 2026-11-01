// rewritecheck.mjs — every top-level directory in public/ must have a
// dedicated /retrogames/<dir>/:path* rewrite in vercel.json, or its files
// die silently in production: the SPA catch-all answers index.html@200 and
// every fetch().json() throws into a hidden board section. This bit twice
// (#1130 juice.json claimed-live-but-HTML, #1131 boredom.json caught by
// verifying prod) — the rule is cheap now, so the third one never happens.
// #1395 is the mirror bug: the forge `:path*` rule ALSO matches the bare
// route (path-to-regexp zero-or-more) and, being first-match, killed the
// /forge PAGE. So the guard now resolves paths, not just prefixes: see
// resolveEdge below. Pure Node, no browser.
// #1402 is the third scar: `:path*` never matches trailing-empty segments,
// so /retrogames/mario/ 404ed; vercel.json now carries one generic
// `/retrogames/:path+/` -> /index.html rule before the catch-all, and the
// resolver models `:name+/` so the pins prove it.
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

// resolveEdge(path, rewrites) simulates Vercel's first-match rewrite resolution
// for exactly the pattern subset vercel.json uses: exact strings, `/:name*`
// suffix wildcards (ZERO-or-more segments — the #1395 semantics that killed the
// /forge page), and unnamed `(regex)` groups compiled verbatim. Destinations
// expand `$n` and `:name*` from the captures. Returns the first matching rule's
// destination, or null (no rewrite). Fidelity is pinned by the selftests below,
// which encode the behaviors that bit us in production.
export function matchSource(source, path) {
    if (/\/:[A-Za-z_]\w*\*$/.test(source)) {
        const prefix = source.replace(/\/:[A-Za-z_]\w*\*$/, '')
        if (path === prefix) return ['']            // zero-or-more matches the bare route too
        const rest = path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : null
        // Vercel's `:path*` does NOT match a trailing empty segment — prod-proven:
        // /retrogames/mario/ is 404 even with the catch-all. That is why the repo
        // pairs explicit `/x/` rules (demos, retrogames, and #1395's forge).
        return rest !== null && rest !== '' && !rest.endsWith('/') ? [rest] : null
    }
    if (/\/:[A-Za-z_]\w*\+\/$/.test(source)) {
        // `/:path+/` — one-or-more segments followed by a literal slash (#1402).
        // The wildcard absorbs full segments (never empty, never a trailing
        // slash of its own), so /x/:path+/ matches /x/a/ and /x/a/b/ but not
        // /x/ (zero segments) nor /x/a (no slash). This is the generic fix for
        // the prod scar above: Vercel's `:path*` cannot see trailing slashes,
        // so a `+` rule before the catch-all sends every client route with a
        // trailing slash to the SPA shell.
        const prefix = source.replace(/\/:[A-Za-z_]\w*\+\/$/, '/')
        if (!path.startsWith(prefix)) return null
        const mid = path.slice(prefix.length, -1)
        return /^[^/]+(\/[^/]+)*$/.test(mid) ? [mid] : null
    }
    if (source.includes('(')) {
        const m = new RegExp(`^${source}$`).exec(path)
        return m ? m.slice(1) : null
    }
    return source === path ? [] : null
}

export function resolveEdge(path, rewrites) {
    for (const r of rewrites || []) {
        const caps = matchSource(String(r.source || ''), path)
        if (!caps) continue
        return String(r.destination || '')
            .replace(/\$\d+/g, (t) => caps[Number(t.slice(1)) - 1] ?? '')
            .replace(/:[A-Za-z_]\w*\*?\+?/, () => caps[0] ?? '')
    }
    return null
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
    const SPA = { source: '/retrogames/:path*', destination: '/index.html' }
    const OLD = { source: '/retrogames/forge/:path*', destination: '/forge/:path*' }
    const NEW = { source: '/retrogames/forge/(.*\\..+)', destination: '/forge/$1' }
    ok('selftest: :path* zero-matches the bare route (#1395 scar: the old rule sent /forge to a dead /forge/)',
        resolveEdge('/retrogames/forge', [OLD, SPA]) === '/forge/')
    ok('selftest: extension-scoped rule lets the bare route fall through to the SPA',
        resolveEdge('/retrogames/forge', [NEW, SPA]) === '/index.html')
    ok('selftest: page sub-routes fall through to the SPA',
        resolveEdge('/retrogames/forge/log', [NEW, SPA]) === '/index.html')
    ok('selftest: :path* NEVER matches a trailing slash (prod scar: /retrogames/mario/ is 404 even via the catch-all)',
        resolveEdge('/retrogames/forge/', [NEW, SPA]) === null && resolveEdge('/retrogames/mario/', [SPA]) === null)
    ok('selftest: trailing slashes need explicit rules (repo convention: /demos/ plus #1395 /forge/)',
        resolveEdge('/retrogames/forge/', [NEW, { source: '/retrogames/forge/', destination: '/index.html' }, SPA]) === '/index.html')
    ok('selftest: extension-scoped rule still rewrites the JSON assets',
        resolveEdge('/retrogames/forge/juice.json', [NEW, SPA]) === '/forge/juice.json')
    ok('selftest: first-match wins (an earlier broad rule beats a later narrow one)',
        resolveEdge('/retrogames/forge/x.json', [OLD, NEW, SPA]) === '/forge/x.json')
    ok('selftest: exact rules match whole paths only',
        resolveEdge('/retrogames/forgeX', [{ source: '/retrogames/forge', destination: '/x' }]) === null)
    // #1402 — the generic trailing-slash rule `/:path+/` (one-or-more segments).
    const SLASH = { source: '/retrogames/:path+/', destination: '/index.html' }
    ok('selftest: :path+/ matches a one-segment route with a trailing slash (#1402)',
        resolveEdge('/retrogames/mario/', [SLASH]) === '/index.html')
    ok('selftest: :path+/ matches multi-segment routes',
        resolveEdge('/retrogames/forge/log/', [SLASH]) === '/index.html')
    ok('selftest: :path+ needs one segment — /retrogames/ falls to its explicit rule',
        resolveEdge('/retrogames/', [SLASH]) === null &&
        resolveEdge('/retrogames/', [{ source: '/retrogames/', destination: '/index.html' }]) === '/index.html')
    ok('selftest: :path+/ does NOT match a slash-less route (the catch-all keeps those)',
        resolveEdge('/retrogames/mario', [SLASH, SPA]) === '/index.html')
    ok('selftest: :path+/ needs the trailing slash — mid-path double slashes are not segments',
        resolveEdge('/retrogames/mario//', [SLASH]) === null)
    ok('selftest: an earlier file-proxy rule still wins over the generic slash rule (first-match)',
        resolveEdge('/retrogames/forge/juice.json', [NEW, SLASH, SPA]) === '/forge/juice.json')
    ok('selftest: explicit /x/ rules placed first keep their own destinations (/demos/ -> demos index)',
        resolveEdge('/retrogames/demos/', [{ source: '/retrogames/demos/', destination: '/demos/index.html' }, SLASH]) === '/demos/index.html')
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
// #1395 — the board PAGE routes must reach the SPA; only extension-bearing
// paths under /forge are disk assets. The old `:path*` rule resolved the bare
// route to /forge/ (nothing there) and the edge answered 404.
console.log('forge route resolution (#1395)')
ok('/retrogames/forge resolves to the SPA shell',
    resolveEdge('/retrogames/forge', vc.rewrites) === '/index.html')
ok('/retrogames/forge/ resolves via the explicit trailing-slash rule (:path* never matches it)',
    resolveEdge('/retrogames/forge/', vc.rewrites) === '/index.html')
ok('/forge/log and /forge/report client routes resolve to the SPA shell',
    resolveEdge('/retrogames/forge/log', vc.rewrites) === '/index.html' &&
    resolveEdge('/retrogames/forge/report', vc.rewrites) === '/index.html')
ok('forge JSON assets resolve to files that exist on disk',
    ['juice.json', 'boredom.json'].every((f) =>
        resolveEdge(`/retrogames/forge/${f}`, vc.rewrites) === `/forge/${f}` &&
        existsSync(join(ROOT, 'public/forge', f))))

// #1402 — every OTHER client route with a trailing slash still 404ed at the
// edge (:path* never matches trailing-empty segments). One generic
// `/retrogames/:path+/` rule before the catch-all fixes the whole family
// without touching the file proxies (first-match) or `/retrogames/` itself
// (`+` needs one-or-more segments).
console.log('trailing-slash client routes (#1402)')
const sources = (vc.rewrites || []).map((r) => String(r.source || ''))
const generic = sources.indexOf('/retrogames/:path+/')
ok('exactly one generic /retrogames/:path+/ rule exists',
    sources.filter((s) => s === '/retrogames/:path+/').length === 1)
ok('the generic rule sits before the SPA catch-all (and after /retrogames/)',
    generic > sources.indexOf('/retrogames/') && generic < catchAll)
ok('/retrogames/mario/ resolves to the SPA shell (was 404: the issue repro)',
    resolveEdge('/retrogames/mario/', vc.rewrites) === '/index.html')
ok('multi-segment client routes with a trailing slash resolve to the SPA shell',
    resolveEdge('/retrogames/forge/log/', vc.rewrites) === '/index.html')
ok('the generic rule does not shadow file proxies: /retrogames/forge/juice.json still resolves to the file',
    resolveEdge('/retrogames/forge/juice.json', vc.rewrites) === '/forge/juice.json' &&
    existsSync(join(ROOT, 'public/forge/juice.json')))
ok('explicit /demos/ keeps its own destination ahead of the generic rule',
    resolveEdge('/retrogames/demos/', vc.rewrites) === '/demos/index.html')

console.log(`\nrewritecheck: ${failed ? `${failed} FAILED` : 'OK'}`)
process.exit(failed ? 1 : 0)
