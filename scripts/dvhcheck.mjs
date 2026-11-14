// dvhcheck — #2155: no shell may size itself to the LARGE viewport.
//
// iPhone Safari portrait keeps ~110px of chrome on screen, so `100vh`
// (and Tailwind's `h-screen`) is taller than the area the player can see.
// Before #2092 a drag could pan the page up to the rest; with the document
// pinned shut the bottom band — where VirtualControls lives — is simply gone.
// The fix is one token (`--shell-h`: 100vh fallback, 100dvh where supported)
// and this gate keeps the raw form from creeping back into any shell, demo or
// the app root. Browser-free by design: it runs in the static job.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`) }
    else { fail++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`) }
}

// Comments must not trip the scan (they legitimately explain the old form).
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, pre) => `${pre}${pre ? ' ' : ''}`)

const walk = (dir, out = []) => {
    if (!existsSync(dir)) return out
    for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        const st = statSync(p)
        if (st.isDirectory()) { if (e !== 'node_modules' && e !== 'dist') walk(p, out) }
        else if (/\.(jsx?|html)$/.test(e)) out.push(p)
    }
    return out
}

const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html'), ...walk(join(ROOT, 'public', 'demos'))]
    .filter(f => existsSync(f))

// Raw large-viewport sizing: a height bound to 100vh, or a Tailwind *-screen
// utility. Each must carry its visible-viewport sibling on the same declaration.
const RAW = [
    /(?:^|[^-\w])(?:min-|max-)?height\s*:\s*100vh\b/g,
    /(?:^|[^-\w])(?:min-|max-)?h-screen\b/g,
]
const offenders = []
for (const f of files) {
    const lines = stripComments(readFileSync(f, 'utf8')).split('\n')
    lines.forEach((line, i) => {
        for (const re of RAW) {
            re.lastIndex = 0
            const m = line.match(re)
            if (!m) continue
            // The same declaration has to offer the visible form too (a second
            // declaration, `height:100vh;height:100dvh`). A line that sizes via
            // the token has no raw `100vh` on it at all, so no exemption here.
            if (/100dvh/.test(line)) continue
            offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 90)}`)
        }
    })
}
ok('no shell sizes to the large viewport without the dvh form', offenders.length === 0,
    offenders.length ? `${offenders.length} offender(s):\n        ${offenders.join('\n        ')}` : `${files.length} files scanned`)

// The token contract in index.css: vh first, dvh override inside @supports.
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
const vhAt = css.indexOf('--shell-h: 100vh')
const supportsAt = css.indexOf('@supports (height: 100dvh)')
const dvhAt = css.indexOf('--shell-h: 100dvh')
ok('--shell-h declares the 100vh fallback', vhAt >= 0)
ok('--shell-h is overridden by 100dvh inside @supports', supportsAt >= 0 && dvhAt > supportsAt,
    `fallback@${vhAt} supports@${supportsAt} dvh@${dvhAt}`)
ok('the document + root are pinned to the visible height', /html,\s*body,\s*#root\s*\{[^}]*height:\s*100dvh/.test(css))
ok('.shell-viewport consumes the token', /\.shell-viewport\s*\{\s*height:\s*var\(--shell-h\)/.test(css))

// The game shell in App.jsx uses the class, not the raw utility.
const app = readFileSync(join(ROOT, 'src', 'App.jsx'), 'utf8')
ok('App.jsx game shell uses shell-viewport', /className="[^"]*shell-viewport[^"]*"/.test(app))

// Demos are the other phone surface (#1258: /demos/ is its own front door).
const demoFiles = walk(join(ROOT, 'public', 'demos')).filter(f => f.endsWith('.html'))
const demoMissing = demoFiles.filter(f => {
    const src = stripComments(readFileSync(f, 'utf8'))
    return /(?:^|[^-\w])(?:min-|max-)?height\s*:\s*100vh\b/.test(src) && !/100dvh/.test(src)
}).map(f => relative(ROOT, f))
ok('every demo page carries the visible-viewport form', demoMissing.length === 0,
    demoMissing.length ? demoMissing.join(', ') : `${demoFiles.length} demo pages`)

console.log(`\ndvhcheck: ${pass}/${pass + fail} checks passed${fail ? `  — ${fail} FAILED` : '  — OK'}`)
process.exit(fail ? 1 : 0)
