// creditscheck — harness for the demo credits cards (#674).
//
//   npm run creditscheck
//
// Proves three things about BUILT BY #674:
//   1. BOOTS   — index + one demo load in headless Chrome with zero page
//                errors and the credits machinery mounted.
//   2. RULES   — every demo (ocean/shore/campfire/mountains) carries a
//                complete window.DEMO_CREDITS config (name/accent/issues/span/
//                shipped/assist/note), loads credits.js, and assist is
//                solo|guided; the index DEMO_INDEX agrees with each demo's
//                own config field-for-field; credits.js is the single source
//                for model + machine (demos never hardcode either); the
//                demos-law holds (no absolute external scripts, nothing
//                registered in games.js).
//   3. WIN     — the tag opens the card, the card names model, machine,
//                issue link, span and help level, tap + ESC close it, and the
//                index stamps one built-by line per card plus the factory line.
//
// Proven-fail mutant (ran by hand once, restore after): delete the
// `issues: [521, 616],` line from shore.html -> "shore: config complete"
// and "index agrees with shore" both go red.

import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright-core')) } catch {
  console.error('playwright-core is not installed. Run `npm install` first.')
  process.exit(1)
}

const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '9381'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEMOS = ['ocean', 'shore', 'campfire', 'mountains']

const results = []
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

function evalConfig(html, key) {
  const m = html.match(new RegExp('window\\.' + key + '\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;'))
  if (!m) return null
  try {
    const win = {}
    new Function('window', 'window.' + key + ' = ' + m[1])(win)
    return win[key]
  } catch { return null }
}

const cfgs = {}
let pageErrsTotal = 0

function staticLayer() {
  const creditsPath = resolve(ROOT, 'public/demos/credits.js')
  ok('credits.js exists', existsSync(creditsPath))
  const cj = readFileSync(creditsPath, 'utf8')
  ok('credits.js is the model source (names the model once)', /MODEL\s*=\s*'Qwen/.test(cj))
  ok('credits.js names the machine', /Mac Studio/.test(cj))
  ok('credits.js carries tag + card + index modes',
    /credits-tag/.test(cj) && /credits-card/.test(cj) && /credits-factory/.test(cj))
  ok('credits.js animates the card open (fade + rise keyframes)',
    /@keyframes cc-fade\{from\{opacity:0\}\}/.test(cj) &&
    /@keyframes cc-rise\{from\{opacity:0;transform:translateY\(2px\)\}\}/.test(cj) &&
    /#credits-card\.open\{[^}]*animation:cc-fade/.test(cj) &&
    /#credits-card\.open \.cc-box\{animation:cc-rise/.test(cj))
  ok('credits.js respects prefers-reduced-motion',
    /@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none/.test(cj))
  ok('credits.js sizes a 32px tap target + safe-area insets',
    /min-height:32px/.test(cj) &&
    /env\(safe-area-inset-left\)/.test(cj) && /env\(safe-area-inset-bottom\)/.test(cj))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')

  for (const d of DEMOS) {
    const p = resolve(ROOT, `public/demos/${d}.html`)
    const html = readFileSync(p, 'utf8')
    cfgs[d] = evalConfig(html, 'DEMO_CREDITS')
    ok(`${d}: loads credits.js (relative)`, new RegExp('<script src="credits\\.js">').test(html))
    ok(`${d}: has a DEMO_CREDITS config`, !!cfgs[d])
    if (!cfgs[d]) continue
    const c = cfgs[d]
    const complete = c.name && /^#[0-9a-fA-F]{6}$/.test(c.accent || '') &&
      Array.isArray(c.issues) && c.issues.length > 0 &&
      typeof c.span === 'string' && /~\d+ h/.test(c.span) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.shipped || '') &&
      ['solo', 'guided'].includes(c.assist) && (c.note || '').length > 8
    ok(`${d}: config complete (name/accent/issues/span/shipped/assist/note)`, complete, JSON.stringify(c))
    ok(`${d}: does not hardcode the model or machine`, !/Qwen3\.8-|Mac Studio/.test(html))
    ok(`${d}: not registered in games.js (demos law)`, !new RegExp(`path:\\s*['\"][^'\"]*${d}`, 'i').test(reg))
    const ext = html.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
    ok(`${d}: self-contained (no absolute external scripts/links)`, ext.length === 0, ext.join(' '))
  }

  const idxHtml = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  const idx = evalConfig(idxHtml, 'DEMO_INDEX')
  ok('index: has a DEMO_INDEX config', !!idx && Array.isArray(idx.demos))
  ok('index: loads credits.js', /<script src="credits\.js">/.test(idxHtml))
  if (idx) {
    const cardIds = [...idxHtml.matchAll(/<a class="card" id="(\w+)"/g)].map(m => m[1])
    ok('index: DEMO_INDEX covers every card',
      cardIds.length > 0 && cardIds.every(id => idx.demos.some(d => d.el === id)) &&
      idx.demos.every(d => cardIds.includes(d.el)),
      `cards=${cardIds} index=${idx.demos.map(d => d.el)}`)
    for (const d of idx.demos) {
      const c = cfgs[d.el]
      if (!c) { ok(`index agrees with ${d.el}`, false, 'no demo config'); continue }
      ok(`index agrees with ${d.el} (issues/span/assist)`,
        JSON.stringify(d.issues) === JSON.stringify(c.issues) && d.span === c.span && d.assist === c.assist,
        `${JSON.stringify(d)} vs ${JSON.stringify({ issues: c.issues, span: c.span, assist: c.assist })}`)
    }
  }
}

async function browserLayer() {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--user-data-dir=/tmp/forge/creditscheck-profile', 'about:blank',
  ], { stdio: 'ignore' })
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { chrome.kill(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })

    // --- index page ---
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push('pageerror: ' + e.message))
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })
    await page.goto('file://' + resolve(ROOT, 'public/demos/index.html'), { waitUntil: 'load' })
    ok('index boots with zero page errors', errs.length === 0, errs[0])
    const stamped = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('a.card')]
      const lines = cards.map(c => (c.querySelector('.credits-built') || {}).textContent || '')
      const fact = document.getElementById('credits-factory')
      return {
        perCard: lines.length,
        allStamped: lines.every(t => /(SOLO|GUIDED)/.test(t) && /#\d+/.test(t) && /BUILT BY QWEN/.test(t)),
        factory: fact ? fact.textContent : '',
        links: [...document.querySelectorAll('a.card .credits-built a')].map(a => a.getAttribute('href')),
      }
    })
    ok('index: every card carries a built-by line (solo/guided + issue #)',
      stamped.perCard === DEMOS.length && stamped.allStamped, `${stamped.perCard} cards`)
    ok('index: factory line names model + machine',
      /Qwen3\.8-/.test(stamped.factory) && /MAC STUDIO/i.test(stamped.factory), stamped.factory)
    ok('index: every issue link points at the repo',
      stamped.links.length > 0 && stamped.links.every(h => /^https:\/\/github\.com\/jalfern\/retrogames\/issues\/\d+$/.test(h)),
      stamped.links.join(' '))
    pageErrsTotal += errs.length

    // --- one demo: tag opens the card ---
    const page2 = await ctx.newPage()
    const errs2 = []
    page2.on('pageerror', e => errs2.push('pageerror: ' + e.message))
    page2.on('console', m => { if (m.type() === 'error') errs2.push('console: ' + m.text().split('\n')[0]) })
    await page2.goto('file://' + resolve(ROOT, 'public/demos/campfire.html'), { waitUntil: 'load' })
    const mounted = await page2.evaluate(() => {
      const t = document.getElementById('credits-tag')
      const c = document.getElementById('credits-card')
      return !!t && !!c && getComputedStyle(t).pointerEvents === 'auto' && !c.classList.contains('open')
    })
    ok('demo mounts a closed corner tag (clickable)', mounted)
    await page2.click('#credits-tag')
    const opened = await page2.evaluate(() => {
      const c = document.getElementById('credits-card')
      return { open: c.classList.contains('open'), text: c.textContent }
    })
    ok('tag click opens the card', opened.open)
    const txt = opened.text.replace(/\s+/g, ' ')
    ok('card names model, machine, issue, span and help level',
      /Qwen3\.8-Flash-Next-oQ4e-mtp/.test(txt) && /Mac Studio/.test(txt) &&
      /#670/.test(txt) && /~7 h/.test(txt) && /SOLO TEST/.test(txt), txt.slice(0, 160))
    ok('card links the real issue', await page2.evaluate(() =>
      (document.querySelector('#credits-card a') || {}).href === 'https://github.com/jalfern/retrogames/issues/670'))
    await page2.click('#credits-card')
    ok('tap closes the card', await page2.evaluate(() => !document.getElementById('credits-card').classList.contains('open')))
    await page2.click('#credits-tag')
    await page2.keyboard.press('Escape')
    ok('ESC closes the card', await page2.evaluate(() => !document.getElementById('credits-card').classList.contains('open')))
    ok('demo boots with zero page errors (credits included)', errs2.length === 0, errs2[0])
    pageErrsTotal += errs2.length

    // --- phone: 390px tap target, card fits portrait + landscape ---
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const phone = await pctx.newPage()
    const errs3 = []
    phone.on('pageerror', e => errs3.push('pageerror: ' + e.message))
    phone.on('console', m => { if (m.type() === 'error') errs3.push('console: ' + m.text().split('\n')[0]) })
    await phone.goto('file://' + resolve(ROOT, 'public/demos/campfire.html'), { waitUntil: 'load' })
    const tagH = await phone.evaluate(() => document.getElementById('credits-tag').getBoundingClientRect().height)
    ok('phone 390px: tag tap-target >= 32px tall', tagH >= 32, `height=${tagH.toFixed(1)}px`)
    const fit = async (label) => {
      await phone.click('#credits-tag')
      await phone.waitForTimeout(320)
      const r = await phone.evaluate(() => {
        const b = document.querySelector('#credits-card .cc-box').getBoundingClientRect()
        return {
          open: document.getElementById('credits-card').classList.contains('open'),
          top: b.top, bottom: b.bottom, vh: innerHeight,
          anim: getComputedStyle(document.querySelector('#credits-card .cc-box')).animationName,
        }
      })
      ok(label + ': open card fits viewport height', r.open && r.top >= 0 && r.bottom <= r.vh + 1,
        `top=${r.top.toFixed(0)} bottom=${r.bottom.toFixed(0)} vh=${r.vh}`)
      await phone.click('#credits-card')
      return r
    }
    ok('phone: card runs the open animation', (await fit('phone portrait')).anim === 'cc-rise')
    await phone.setViewportSize({ width: 844, height: 390 })
    await fit('phone landscape')
    ok('phone boots with zero page errors', errs3.length === 0, errs3[0])
    pageErrsTotal += errs3.length
    await pctx.close()

    // --- reduced motion: card opens with no animation ---
    const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const rpage = await rctx.newPage()
    await rpage.goto('file://' + resolve(ROOT, 'public/demos/campfire.html'), { waitUntil: 'load' })
    await rpage.click('#credits-tag')
    ok('prefers-reduced-motion: card opens without animation', await rpage.evaluate(() =>
      document.getElementById('credits-card').classList.contains('open') &&
      getComputedStyle(document.querySelector('#credits-card .cc-box')).animationName === 'none'))
    await rctx.close()
  } finally {
    chrome.kill()
  }
}

staticLayer()
await browserLayer()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} green`)
process.exit(failed.length ? 1 : 0)
