import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const cfgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))

const args = process.argv.slice(2)
const offline = args.includes('--offline')
const bases = args.filter((a) => a.startsWith('--base=')).map((a) => a.slice(7))
const liveBases = offline ? [] : bases.length ? bases : ['https://retrogames-psi.vercel.app', 'https://www.jalfern.com']

const HTML_PATHS = [
  '/retrogames',
  '/retrogames/',
  '/retrogames/magic-carpet',
  '/retrogames/forge',
  '/retrogames/forge/log',
  '/retrogames/games',
  '/retrogames/demos',
  '/retrogames/demos/blackhole.html',
]

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++ } else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const headerRulesFor = (reqPath) => {
  const hits = []
  for (const rule of cfg.headers || []) {
    if (sourceMatches(rule.source, reqPath)) hits.push(...(rule.headers || []))
  }
  return hits
}

function sourceToRe (src) {
  let re = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ':') {
      const m = src.slice(i).match(/^:[A-Za-z_]\w*(\((?:\\.|[^()])*\))?([*+]?)/)
      if (m) {
        const body = m[1] ? m[1].slice(1, -1) : '[^/]+'
        const mod = m[2]
        if (mod === '*') { if (re.endsWith('/')) re = re.slice(0, -1); re += `(?:/${body})*` }
        else if (mod === '+') { if (re.endsWith('/')) re = re.slice(0, -1); re += `(?:/${body})+` }
        else re += `(?:${body})`
        i += m[0].length
        continue
      }
    }
    if (c === '(') {
      const m = src.slice(i).match(/^\((?:\\.|[^()])*\)/)
      if (m) { re += `(?:${m[0].slice(1, -1)})`; i += m[0].length; continue }
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    i++
  }
  return new RegExp(`^${re}/?$`)
}

function sourceMatches (source, reqPath) {
  return sourceToRe(source).test(reqPath)
}

const cc = (p) => {
  const h = headerRulesFor(p).filter((x) => x.key === 'Cache-Control').map((x) => x.value)
  return h[h.length - 1] || null
}

console.log('# config: vercel.json header contract')
ok('arcade root no-store', (cc('/retrogames') || '').includes('no-store'), `got ${cc('/retrogames')}`)
ok('arcade root slash no-store', (cc('/retrogames/') || '').includes('no-store'), `got ${cc('/retrogames/')}`)
ok('SPA route no-store', (cc('/retrogames/magic-carpet') || '').includes('no-store'), `got ${cc('/retrogames/magic-carpet')}`)
ok('nested SPA route no-store', (cc('/retrogames/forge/log') || '').includes('no-store'), `got ${cc('/retrogames/forge/log')}`)
ok('games index no-store', (cc('/retrogames/games') || '').includes('no-store'), `got ${cc('/retrogames/games')}`)
ok('demos index no-store', (cc('/retrogames/demos') || '').includes('no-store'), `got ${cc('/retrogames/demos')}`)
ok('demo page no-store', (cc('/retrogames/demos/blackhole.html') || '').includes('no-store'), `got ${cc('/retrogames/demos/blackhole.html')}`)
ok('hashed assets immutable', (cc('/retrogames/assets/index-abc123.js') || '').includes('immutable'), `got ${cc('/retrogames/assets/index-abc123.js')}`)
ok('js-dos bundle NOT no-store', !(cc('/retrogames/js-dos/js-dos.js') || '').includes('no-store'), `got ${cc('/retrogames/js-dos/js-dos.js')}`)
ok('games bundle NOT no-store', !(cc('/retrogames/games/zork.zip') || '').includes('no-store'), `got ${cc('/retrogames/games/zork.zip')}`)
ok('wasm rule preserved', headerRulesFor('/js-dos/emulators/wdosbox.wasm').some((h) => h.value === 'application/wasm'))
ok('sw rule preserved', headerRulesFor('/sw.js').some((h) => h.key === 'Content-Type'))

if (liveBases.length) {
  console.log('# live: headers at the edge')
  for (const base of liveBases) {
    let bundle = 'assets/index-PLACEHOLDER.js'
    try {
      const idx = await fetch(`${base}/retrogames/`, { redirect: 'follow' })
      const html = await idx.text()
      const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)
      if (m) bundle = m[1]
      for (const p of HTML_PATHS) {
        const res = await fetch(`${base}${p}`, { redirect: 'follow' })
        const v = (res.headers.get('cache-control') || '').toLowerCase()
        ok(`${base}${p} html no-store`, v.includes('no-store'), `got "${v}"`)
      }
      const a = await fetch(`${base}/retrogames/${bundle}`, { redirect: 'follow' })
      const av = (a.headers.get('cache-control') || '').toLowerCase()
      ok(`${base} hashed asset immutable`, av.includes('immutable'), `got "${av}"`)
    } catch (e) {
      ok(`${base} reachable`, false, String(e))
    }
  }
}

console.log(`cachecheck: ${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
