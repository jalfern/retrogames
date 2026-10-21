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

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
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
if (!url.startsWith('http') && !existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

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
  const profDir = `/tmp/forge/shoreperf-profile-${PORT}`
  const chrome = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=${profDir}`, 'about:blank',
  ], { stdio: 'ignore', detached: true })
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
  console.log(JSON.stringify(out))
}

main()
