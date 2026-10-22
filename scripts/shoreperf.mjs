// shoreperf — frame-time measurement for public/demos/shore.html (#668).
//
// Measures steady-state average/max frame time at three profiles:
//   desktop : 1440x900 @ dpr 2 (retina MacBook window)
//   qhd     : 1600x1000 @ dpr 2 (the demo's canvas cap, worst case)
//   phone   : 390x844 @ dpr 3 + 6x CPU throttle (iPhone-ish proxy)
// Headless Chrome on this box is usually SwiftShader (software) — the script
// reports the GPU adapter + renderer so numbers are read in context, and the
// phone profile stacks CPU throttling on top as a stronger proxy.
//
// Usage: node scripts/shoreperf.mjs [--file <path>] [--port 9381] [--secs 6]
//        [--profile desktop,qhd,phone] [--url <url>]
//        [--ab "<queryA>|<queryB>" [--ab-rounds 6]]   #702: interleaved A/B of
//        two query strings on the first requested profile (absolute fps on a
//        shared-GPU box is noise; alternating rounds cancel the drift).
//        [--require-quiet] [--quiet-check-only] [--max-load 8]   #680: a quiet
//        box means no local LLM inference and no foreign headless Chrome. On a
//        contended Metal box even interleaved A/B medians flip sign when an
//        inference burst spans whole profiles (#680 studio run), so the script
//        now names the noise instead of silently printing junk: every run prints
//        its box state, --require-quiet refuses to measure on a dirty box (exit 2),
//        and --quiet-check-only reports the verdict without booting Chrome.
//        (SHOREPERF_ASSUME_QUIET=1 forces the verdict to quiet on boxes where
//        pgrep/loadavg lie — dedicated runners, containers.)

import { spawn, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { loadavg } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const file = resolve(ROOT, opt('--file', 'public/demos/shore.html'))
const url = opt('--url', 'file://' + file)
const PORT = opt('--port', '9381')
const SECS = +opt('--secs', 6)
const profilesWanted = opt('--profile', 'desktop,qhd,phone').split(',')
const abQuery = opt('--ab', null)
const AB_ROUNDS = +opt('--ab-rounds', 6)
const MAX_LOAD = +opt('--max-load', 8)

function quietscan() {
  if (process.env.SHOREPERF_ASSUME_QUIET === '1') return []
  const reasons = []
  const pids = cmd => { try { return execSync(`pgrep -x ${cmd} 2>/dev/null || true`).toString().trim().split('\n').filter(Boolean) } catch { return [] } }
  const inference = pids('omlx-server').concat(pids('llama-server'), pids('ollama'))
  if (inference.length) reasons.push(`llm-inference(pid ${inference.join(',')})`)
  let foreign = []
  try {
    foreign = execSync('pgrep -f -- "[h]eadless=new" 2>/dev/null || true').toString().trim().split('\n').filter(Boolean)
      .filter(pid => +pid !== process.pid)
  } catch { /* none */ }
  if (foreign.length) reasons.push(`foreign headless chrome(${foreign.length})`)
  const la = loadavg()[0]
  if (la > MAX_LOAD) reasons.push(`loadavg ${la.toFixed(1)}>max-load ${MAX_LOAD}`)
  return reasons
}

if (opt('--quiet-check-only', null) !== null) {
  const r = quietscan()
  if (r.length) { console.log(`QUIET: CONTENDED — ${r.join('; ')}`); process.exit(2) }
  console.log('QUIET: ok')
  process.exit(0)
}
if (!url.startsWith('http') && !existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const CHROME = process.env.SHOREPERF_CHROME || (() => {
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (existsSync(sys)) return sys
  try { return chromium.executablePath() } catch { console.error('no Chrome found — install one or run `npx playwright-core install chromium`'); process.exit(1) }
})()

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, dsf: 2, cpu: 1 },
  qhd: { viewport: { width: 1600, height: 1000 }, dsf: 2, cpu: 1 },
  phone: { viewport: { width: 390, height: 844 }, dsf: 3, cpu: 6 },
}
if (+opt('--cpu', 0) > 0) for (const p of Object.values(PROFILES)) p.cpu = +opt('--cpu')

async function measure(browser, name, p) {
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.dsf })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.goto(url, { waitUntil: 'load' })
  try { await page.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 }) }
  catch { console.log(`${name}: FAILED to boot ${errs[0] || ''}`); await ctx.close(); return null }
  const gpu = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    const i = a && a.requestAdapterInfo ? await a.requestAdapterInfo() : (a && a.info) || {}
    return { vendor: i.vendor, arch: i.architecture, device: i.device, description: i.description }
  })
  if (p.cpu > 1) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu })
  }
  await page.waitForTimeout(5000)
  await page.evaluate(() => window.__shoreTest.resetPerf())
  const samples = []
  const end = Date.now() + SECS * 1000
  while (Date.now() < end) {
    await page.waitForTimeout(500)
    samples.push(await page.evaluate(() => window.__shoreTest.perf()))
  }
  const perf = await page.evaluate(() => window.__shoreTest.perf())
  const canvasSize = await page.evaluate(() => [document.getElementById('c').width, document.getElementById('c').height])
  await ctx.close()
  const fps = perf.avg > 0 ? 1000 / perf.avg : 0
  console.log(`${name.padEnd(8)} canvas=${canvasSize[0]}x${canvasSize[1]} n=${perf.n} avg=${perf.avg}ms (${fps.toFixed(1)} fps) max=${perf.max}ms rs=${perf.rs} nsub=${perf.nsub} gpu=${gpu.vendor}/${gpu.arch}${gpu.description ? ' — ' + gpu.description : ''}${p.cpu > 1 ? ` cpu×${p.cpu}` : ''}`)
  return { profile: name, ...perf, fps: +fps.toFixed(1), canvas: canvasSize, gpu }
}

const med = a => [...a].sort((x, y) => x - y)[a.length >> 1]

async function abMeasure(browser, profileName, p, qA, qB) {
  // ONE page, reloaded between rounds: headless Chrome keeps every open page
  // visible, so two live pages would each measure "self + the other config's
  // render load" — the lighter config would look slower than it is.
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.dsf })
  const page = await ctx.newPage()
  let cdp = null
  if (p.cpu > 1) { cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu }) }
  const win = Math.max(2000, (SECS * 1000) / 2)
  const aAvg = [], bAvg = [], aMax = [], bMax = []
  let perfA = null, perfB = null
  for (let i = 0; i < AB_ROUNDS; i++) {
    for (const [q, av, xv] of [[qA, aAvg, aMax], [qB, bAvg, bMax]]) {
      await page.goto(url + q, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready && window.__shoreTest.perf().n > 40, null, { timeout: 40000 })
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu })
      await page.evaluate(() => window.__shoreTest.resetPerf())
      await page.waitForTimeout(win)
      const perf = await page.evaluate(() => window.__shoreTest.perf())
      av.push(perf.avg); xv.push(perf.max)
      if (q === qA) perfA = perf; else perfB = perf
    }
  }
  await ctx.close()
  const mA = med(aAvg), mB = med(bAvg)
  const gain = mA > 0 ? (1 - mB / mA) * 100 : 0
  console.log(`AB/${profileName} A"${qA || '(default)'}" med=${mA.toFixed(1)}ms worst=${Math.min(...aMax).toFixed(0)}ms rs=${perfA.rs} | B"${qB || '(default)'}" med=${mB.toFixed(1)}ms worst=${Math.min(...bMax).toFixed(0)}ms rs=${perfB.rs} -> B ${gain > 0 ? 'faster' : 'SLOWER'} by ${gain.toFixed(1)}% over ${AB_ROUNDS} interleaved rounds`)
  return { ab: profileName, qA, qB, medA: +mA.toFixed(2), medB: +mB.toFixed(2), worstA: Math.min(...aMax), worstB: Math.min(...bMax), gainPct: +gain.toFixed(1) }
}

async function main() {
  const noise = quietscan()
  if (opt('--require-quiet', null) !== null && noise.length) {
    console.error(`REFUSED (--require-quiet): box is contended — ${noise.join('; ')}. Re-run on a quiet box (#680).`)
    process.exit(2)
  }
  console.log(`# box: ${noise.length ? `CONTENDED — ${noise.join('; ')} (numbers are context, not verdict)` : 'quiet'}`)
  const profDir = `/tmp/forge/shoreperf-profile-${PORT}`
  const flags = [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=${profDir}`, 'about:blank',
  ]
  if (process.platform !== 'darwin') flags.push('--no-sandbox')
  const chrome = spawn(CHROME, flags, { stdio: 'ignore', detached: true })
  const killAll = () => {
    try { process.kill(-chrome.pid) } catch { /* gone */ }
    try { chrome.kill() } catch { /* gone */ }
    spawn('pkill', ['-f', `user-data-dir=${profDir}`], { stdio: 'ignore' })
  }
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { killAll(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }
  const out = []
  try {
    if (abQuery) {
      const [qA, qB] = abQuery.split('|')
      const name = profilesWanted[0].trim()
      const p = PROFILES[name]
      if (!p) { console.error(`unknown profile ${name}`); killAll(); process.exit(1) }
      const r = await abMeasure(browser, name, p, qA || '', qB || '')
      if (r) out.push(r)
    }
    for (const name of profilesWanted) {
      const p = PROFILES[name.trim()]
      if (!p) { console.error(`unknown profile ${name}`); continue }
      const r = await measure(browser, name.trim(), p)
      if (r) out.push(r)
    }
  } finally { killAll() }
  console.log(JSON.stringify(noise.length ? out.map(o => ({ ...o, contended: true })) : out))
  if (!abQuery && out.length === 0) { console.error('no profile produced a measurement — demo failed to boot'); process.exit(1) }
}

main()
